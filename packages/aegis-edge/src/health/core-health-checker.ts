import type { EdgeConfig } from '../config/index.js';
import { logger } from '../logger/request-logger.js';

export type CoreStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface CoreHealthState {
  status: CoreStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheckTime: number;
  lastHealthyTime: number | null;
  lastError: string | null;
}

export interface CoreHealthChecker {
  getStatus: () => CoreStatus;
  getState: () => Readonly<CoreHealthState>;
  isHealthy: () => boolean;
  start: () => void;
  stop: () => void;
  checkNow: () => Promise<boolean>;
}

export const createCoreHealthChecker = (config: EdgeConfig): CoreHealthChecker => {
  const state: CoreHealthState = {
    status: 'unknown',
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastCheckTime: 0,
    lastHealthyTime: null,
    lastError: null,
  };

  let intervalId: NodeJS.Timeout | null = null;

  const healthEndpoint = `${config.coreEndpoint}/api/v1/health`;

  const checkHealth = async (): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.coreHealthCheckTimeoutMs);

    try {
      const response = await fetch(healthEndpoint, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as { status?: string };
        return data.status === 'healthy' || data.status === 'ok';
      }
      return false;
    } catch (err) {
      clearTimeout(timeoutId);
      state.lastError = err instanceof Error ? err.message : 'Unknown error';
      return false;
    }
  };

  const updateState = (isHealthy: boolean): void => {
    state.lastCheckTime = Date.now();

    if (isHealthy) {
      state.consecutiveSuccesses++;
      state.consecutiveFailures = 0;
      state.lastHealthyTime = Date.now();
      state.lastError = null;

      // 복구 임계값 도달 시 healthy로 전환
      if (state.status !== 'healthy' && state.consecutiveSuccesses >= config.coreRecoveryThreshold) {
        state.status = 'healthy';
        logger.info(
          { consecutiveSuccesses: state.consecutiveSuccesses },
          'Core recovered - switching to normal mode',
        );
      }
    } else {
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;

      // 실패 임계값 도달 시 unhealthy로 전환
      if (state.status !== 'unhealthy' && state.consecutiveFailures >= config.coreFailureThreshold) {
        state.status = 'unhealthy';
        logger.warn(
          {
            consecutiveFailures: state.consecutiveFailures,
            lastError: state.lastError,
            failOpenEnabled: config.failOpenEnabled,
          },
          'Core unhealthy - switching to fail-open mode',
        );
      }
    }
  };

  const runCheck = async (): Promise<void> => {
    const isHealthy = await checkHealth();
    updateState(isHealthy);
  };

  return {
    getStatus: () => state.status,

    getState: () => ({ ...state }),

    isHealthy: () => state.status === 'healthy' || state.status === 'unknown',

    start: () => {
      if (intervalId) return;

      logger.info(
        {
          healthEndpoint,
          intervalMs: config.coreHealthCheckIntervalMs,
          failureThreshold: config.coreFailureThreshold,
          recoveryThreshold: config.coreRecoveryThreshold,
        },
        'Starting Core health checker',
      );

      // 즉시 첫 번째 체크 실행
      runCheck().catch((err) => {
        logger.error({ error: err }, 'Initial health check failed');
      });

      intervalId = setInterval(() => {
        runCheck().catch((err) => {
          logger.error({ error: err }, 'Health check failed');
        });
      }, config.coreHealthCheckIntervalMs);
    },

    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('Stopped Core health checker');
      }
    },

    checkNow: async () => {
      const isHealthy = await checkHealth();
      updateState(isHealthy);
      return isHealthy;
    },
  };
};
