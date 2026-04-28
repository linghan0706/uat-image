import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

import { env, requireDatabaseUrl } from "@/lib/env";

types.setTypeParser(20, (value) => BigInt(value));

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

const globalForPg = globalThis as typeof globalThis & {
  pgPool?: Pool;
};

export const db =
  globalForPg.pgPool ??
  new Pool({
    connectionString: requireDatabaseUrl(),
    max: process.env.NODE_ENV === "development" ? 10 : 20,
    connectionTimeoutMillis: env.dbConnectTimeoutMs,
    query_timeout: env.dbQueryTimeoutMs,
  });

db.on("connect", (client) => {
  client.query("SET timezone = 'Asia/Shanghai'");
});

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = db;
}

export const query = async <T extends QueryResultRow>(text: string, values: unknown[] = []) =>
  db.query<T>(text, values);

export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const maybeOne = async <T extends QueryResultRow>(
  executor: Queryable,
  text: string,
  values: unknown[] = [],
): Promise<T | null> => {
  const result = await executor.query<T>(text, values);
  return result.rows[0] ?? null;
};

export const one = async <T extends QueryResultRow>(
  executor: Queryable,
  text: string,
  values: unknown[] = [],
): Promise<T> => {
  const row = await maybeOne<T>(executor, text, values);
  if (!row) {
    throw new Error("Expected one row but found none.");
  }
  return row;
};
