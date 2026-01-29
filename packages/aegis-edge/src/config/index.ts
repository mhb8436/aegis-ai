export interface EdgeConfig {
  readonly port: number;
  readonly coreEndpoint: string;
  readonly logLevel: string;
  readonly rateLimitWindowMs: number;
  readonly rateLimitMaxRequests: number;
  readonly rateLimitBlockDurationMs: number;
  readonly corsOrigins: string[];
  readonly redisUrl: string | null;
  // Fail-Open 설정
  readonly failOpenEnabled: boolean;
  readonly failOpenTargetUrl: string | null;
  readonly coreHealthCheckIntervalMs: number;
  readonly coreHealthCheckTimeoutMs: number;
  readonly coreFailureThreshold: number;
  readonly coreRecoveryThreshold: number;
}

export const loadConfig = (): EdgeConfig => ({
  port: parseInt(process.env.PORT ?? '8080', 10),
  coreEndpoint: process.env.CORE_ENDPOINT ?? 'http://localhost:8081',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '30', 10),
  rateLimitBlockDurationMs: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION_MS ?? '300000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(','),
  redisUrl: process.env.REDIS_URL ?? null,
  // Fail-Open: Core 장애 시 직접 AI 시스템으로 바이패스
  failOpenEnabled: process.env.FAIL_OPEN_ENABLED === 'true',
  failOpenTargetUrl: process.env.FAIL_OPEN_TARGET_URL ?? null,
  coreHealthCheckIntervalMs: parseInt(process.env.CORE_HEALTH_CHECK_INTERVAL_MS ?? '5000', 10),
  coreHealthCheckTimeoutMs: parseInt(process.env.CORE_HEALTH_CHECK_TIMEOUT_MS ?? '3000', 10),
  coreFailureThreshold: parseInt(process.env.CORE_FAILURE_THRESHOLD ?? '3', 10),
  coreRecoveryThreshold: parseInt(process.env.CORE_RECOVERY_THRESHOLD ?? '2', 10),
});
