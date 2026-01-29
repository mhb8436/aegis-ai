import path from 'node:path';
import type { LLMProviderConfig } from '@aegis/common';

export interface CoreConfig {
  readonly port: number;
  readonly logLevel: string;
  readonly policyDir: string;
  readonly corsOrigins: string[];
  readonly postgresUrl: string | null;
  readonly clickhouseUrl: string | null;
  readonly redisUrl: string | null;
  readonly llmProviders: LLMProviderConfig[];
  readonly dryRun: boolean;
  readonly mlModelDir: string;
}

const parseLLMProviders = (): LLMProviderConfig[] => {
  const raw = process.env.LLM_PROVIDERS;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LLMProviderConfig[];
  } catch {
    return [];
  }
};

export const loadConfig = (): CoreConfig => ({
  port: parseInt(process.env.PORT ?? '8081', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  policyDir: process.env.POLICY_DIR ?? path.join(__dirname, '..', 'policy', 'rules'),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(','),
  postgresUrl: process.env.POSTGRES_URL ?? null,
  clickhouseUrl: process.env.CLICKHOUSE_URL ?? null,
  redisUrl: process.env.REDIS_URL ?? null,
  llmProviders: parseLLMProviders(),
  dryRun: process.env.DRY_RUN === 'true',
  mlModelDir: process.env.ML_MODEL_DIR ?? path.join(__dirname, '..', '..', 'ml-models'),
});
