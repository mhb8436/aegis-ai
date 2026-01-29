import { createClient, type ClickHouseClient } from '@clickhouse/client';

let client: ClickHouseClient | null = null;

export const initClickHouse = (url: string): ClickHouseClient => {
  client = createClient({
    url,
    database: process.env.CLICKHOUSE_DB ?? 'aegis',
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
    },
  });
  return client;
};

export const getClickHouse = (): ClickHouseClient | null => client;

export const closeClickHouse = async (): Promise<void> => {
  if (client) {
    await client.close();
    client = null;
  }
};
