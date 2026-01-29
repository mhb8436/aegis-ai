import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import type pg from 'pg';
import type { ClickHouseClient } from '@clickhouse/client';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const migrationsDir = __dirname;

export const runPostgresMigrations = async (pool: pg.Pool): Promise<void> => {
  const sqlPath = path.join(migrationsDir, '001_postgres_init.sql');
  if (!fs.existsSync(sqlPath)) {
    logger.warn('PostgreSQL migration file not found, skipping');
    return;
  }
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  await pool.query(sql);
  logger.info('PostgreSQL migrations applied');
};

export const runClickHouseMigrations = async (client: ClickHouseClient): Promise<void> => {
  const sqlPath = path.join(migrationsDir, '002_clickhouse_init.sql');
  if (!fs.existsSync(sqlPath)) {
    logger.warn('ClickHouse migration file not found, skipping');
    return;
  }
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    await client.command({ query: stmt });
  }
  logger.info('ClickHouse migrations applied');
};
