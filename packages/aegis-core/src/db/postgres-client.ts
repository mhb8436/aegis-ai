import pg from 'pg';

let pool: pg.Pool | null = null;

export const initPostgres = (url: string): pg.Pool => {
  pool = new pg.Pool({ connectionString: url, max: 10 });
  return pool;
};

export const getPool = (): pg.Pool | null => pool;

export const closePostgres = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};
