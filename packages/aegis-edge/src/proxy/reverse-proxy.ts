import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { EdgeConfig } from '../config/index.js';
import type { CoreHealthChecker } from '../health/core-health-checker.js';
import { logger } from '../logger/request-logger.js';

export const createCoreProxy = (config: EdgeConfig): RequestHandler => {
  return createProxyMiddleware({
    target: config.coreEndpoint,
    changeOrigin: true,
    pathRewrite: {
      '^/api/v1/chat': '/api/v1/inspect',
    },
    on: {
      proxyReq: (proxyReq, req) => {
        const requestId = req.headers['x-aegis-request-id'];
        if (requestId) {
          proxyReq.setHeader('x-aegis-request-id', requestId as string);
        }
        const riskScore = req.headers['x-aegis-risk-score'];
        if (riskScore) {
          proxyReq.setHeader('x-aegis-risk-score', riskScore as string);
        }
      },
      error: (err, _req, res) => {
        logger.error({ error: err.message }, 'Proxy error: Core unreachable');
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          (res as import('http').ServerResponse).writeHead(502, {
            'Content-Type': 'application/json',
          });
          (res as import('http').ServerResponse).end(
            JSON.stringify({
              code: 'CORE_UNREACHABLE',
              message: 'Security engine is unavailable',
            }),
          );
        }
      },
    },
  }) as RequestHandler;
};

export const createFailOpenProxy = (
  config: EdgeConfig,
  healthChecker: CoreHealthChecker,
): RequestHandler => {
  const coreProxy = createCoreProxy(config);

  // Fail-Open이 비활성화되어 있으면 일반 프록시 반환
  if (!config.failOpenEnabled || !config.failOpenTargetUrl) {
    return coreProxy;
  }

  const targetUrl = config.failOpenTargetUrl;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.headers['x-aegis-request-id'] as string;

    // Core가 healthy하면 정상 프록시
    if (healthChecker.isHealthy()) {
      return coreProxy(req, res, next);
    }

    // Core가 unhealthy하면 Fail-Open 모드로 바이패스
    logger.warn(
      {
        requestId,
        targetUrl,
        coreStatus: healthChecker.getStatus(),
        path: req.path,
      },
      'FAIL-OPEN: Bypassing security check - Core is unhealthy',
    );

    // 바이패스 헤더 추가
    res.setHeader('X-Aegis-Bypassed', 'true');
    res.setHeader('X-Aegis-Bypass-Reason', 'core-unhealthy');

    try {
      // AI 시스템으로 직접 요청 전달
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Aegis-Request-Id': requestId ?? '',
          'X-Aegis-Bypassed': 'true',
        },
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      });

      // 응답 헤더 복사
      response.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      res.status(response.status);

      // 스트리밍 응답 처리
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(value);
          return pump();
        };
        await pump();
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (err) {
      logger.error(
        {
          requestId,
          error: err instanceof Error ? err.message : 'Unknown error',
          targetUrl,
        },
        'FAIL-OPEN: Failed to reach target AI system',
      );

      res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Both security engine and AI system are unavailable',
        bypassed: true,
      });
    }
  };
};

export interface BypassStats {
  totalBypassed: number;
  lastBypassTime: number | null;
  bypassReasons: Record<string, number>;
}

export const createBypassTracker = (): {
  track: (reason: string) => void;
  getStats: () => BypassStats;
  reset: () => void;
} => {
  const stats: BypassStats = {
    totalBypassed: 0,
    lastBypassTime: null,
    bypassReasons: {},
  };

  return {
    track: (reason: string) => {
      stats.totalBypassed++;
      stats.lastBypassTime = Date.now();
      stats.bypassReasons[reason] = (stats.bypassReasons[reason] ?? 0) + 1;
    },
    getStats: () => ({ ...stats, bypassReasons: { ...stats.bypassReasons } }),
    reset: () => {
      stats.totalBypassed = 0;
      stats.lastBypassTime = null;
      stats.bypassReasons = {};
    },
  };
};
