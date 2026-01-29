import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { loadConfig } from './config/index.js';
import { inputGuard } from './guards/input-guard.js';
import { createRateLimiter } from './guards/rate-limiter.js';
import { createCoreProxy, createFailOpenProxy } from './proxy/reverse-proxy.js';
import { createCoreHealthChecker } from './health/core-health-checker.js';
import { requestLogger, logger } from './logger/request-logger.js';
import type { HealthResponse } from '@aegis/common';

const config = loadConfig();
const app: express.Express = express();

// Core 헬스 체커 생성
const coreHealthChecker = createCoreHealthChecker(config);

app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

const startTime = Date.now();

app.get('/health', (_req, res) => {
  const coreState = coreHealthChecker.getState();
  const response: HealthResponse & {
    coreStatus?: string;
    failOpenEnabled?: boolean;
    failOpenActive?: boolean;
  } = {
    status: 'ok',
    version: '0.1.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    coreStatus: coreState.status,
    failOpenEnabled: config.failOpenEnabled,
    failOpenActive: config.failOpenEnabled && coreState.status === 'unhealthy',
  };
  res.json(response);
});

app.get('/ready', (_req, res) => {
  const coreState = coreHealthChecker.getState();
  const isReady = coreHealthChecker.isHealthy() || config.failOpenEnabled;
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    coreStatus: coreState.status,
    failOpenEnabled: config.failOpenEnabled,
  });
});

// Core 상태 상세 조회 엔드포인트
app.get('/status/core', (_req, res) => {
  const state = coreHealthChecker.getState();
  res.json({
    ...state,
    failOpenEnabled: config.failOpenEnabled,
    failOpenTargetUrl: config.failOpenEnabled ? config.failOpenTargetUrl : null,
  });
});

const rateLimiter = createRateLimiter(
  {
    windowMs: config.rateLimitWindowMs,
    maxRequests: config.rateLimitMaxRequests,
    blockDurationMs: config.rateLimitBlockDurationMs,
  },
  config.redisUrl,
);

app.post('/api/v1/validate', rateLimiter, inputGuard, (req, res) => {
  res.json({
    passed: true,
    riskScore: 0,
    findings: [],
    requestId: req.headers['x-aegis-request-id'],
  });
});

// Fail-Open 지원 프록시 사용
const proxy = config.failOpenEnabled
  ? createFailOpenProxy(config, coreHealthChecker)
  : createCoreProxy(config);

app.post('/api/v1/chat', rateLimiter, inputGuard, proxy);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ): void => {
    logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
    });
  },
);

const server = app.listen(config.port, () => {
  logger.info(`Aegis-Edge listening on port ${config.port}`);
  logger.info(`Core endpoint: ${config.coreEndpoint}`);

  if (config.failOpenEnabled) {
    logger.info(
      {
        failOpenTargetUrl: config.failOpenTargetUrl,
        healthCheckIntervalMs: config.coreHealthCheckIntervalMs,
        failureThreshold: config.coreFailureThreshold,
      },
      'Fail-Open mode ENABLED - will bypass to AI system if Core is down',
    );
  } else {
    logger.info('Fail-Open mode DISABLED - requests will fail if Core is down');
  }

  // Core 헬스 체커 시작
  coreHealthChecker.start();
});

// Graceful shutdown
const shutdown = (): void => {
  logger.info('Shutting down Aegis-Edge...');
  coreHealthChecker.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server, coreHealthChecker };
