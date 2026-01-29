import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pino from 'pino';
import { loadConfig } from './config/index.js';
import { createRouter } from './api/routes.js';
import { createPolicyStore } from './policy/policy-engine.js';
import { loadAgentPermissions } from './guards/agent-permission-loader.js';
import { loadModels } from './ml/index.js';
import { initPostgres, closePostgres } from './db/postgres-client.js';
import { initClickHouse, closeClickHouse } from './db/clickhouse-client.js';
import { runPostgresMigrations, runClickHouseMigrations } from './db/migrations/run-migrations.js';
import { createAuditRepo } from './db/audit-repo.js';
import { createPolicyRepo } from './db/policy-repo.js';
import { setAuditRepo } from './audit/audit-logger.js';
import type { PolicyRepo } from './db/policy-repo.js';
import type { HealthResponse } from '@aegis/common';

const config = loadConfig();

const logger = pino({
  level: config.logLevel,
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

const app: express.Express = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '5mb' }));

const startTime = Date.now();

app.get('/health', (_req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    version: '0.1.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

app.get('/ready', (_req, res) => {
  res.json({ ready: true });
});

const bootstrap = async (): Promise<void> => {
  let policyRepo: PolicyRepo | undefined;

  // Initialize PostgreSQL
  if (config.postgresUrl) {
    try {
      const pool = initPostgres(config.postgresUrl);
      await runPostgresMigrations(pool);
      policyRepo = createPolicyRepo(pool);
      logger.info('PostgreSQL connected and migrations applied');
    } catch (err) {
      logger.warn({ err }, 'PostgreSQL init failed, using YAML-only policies');
    }
  }

  // Initialize ClickHouse
  if (config.clickhouseUrl) {
    try {
      const chClient = initClickHouse(config.clickhouseUrl);
      await runClickHouseMigrations(chClient);
      const auditRepo = createAuditRepo(chClient);
      setAuditRepo(auditRepo);
      logger.info('ClickHouse connected and migrations applied');
    } catch (err) {
      logger.warn({ err }, 'ClickHouse init failed, using in-memory audit logs');
    }
  }

  // Create policy store (DB-backed if available, YAML fallback)
  const policyStore = createPolicyStore(config.policyDir, policyRepo);
  await policyStore.loadFromDb();

  const agentPermissions = loadAgentPermissions(config.policyDir);

  // Load ML models (graceful degradation if unavailable)
  const mlRegistry = await loadModels(config.mlModelDir);
  if (mlRegistry.isAvailable) {
    logger.info(
      'ML models loaded: injection=%s, pii=%s',
      mlRegistry.injectionClassifier ? 'ready' : 'unavailable',
      mlRegistry.piiDetector ? 'ready' : 'unavailable',
    );
  } else {
    logger.warn('No ML models found. Running in pattern-only mode.');
  }

  app.use('/api/v1', createRouter(policyStore, agentPermissions, config.llmProviders, config.dryRun, mlRegistry));

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
    logger.info(`Aegis-Core listening on port ${config.port}`);
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    server.close();
    await closePostgres();
    await closeClickHouse();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start Aegis-Core');
  process.exit(1);
});

export { app };
