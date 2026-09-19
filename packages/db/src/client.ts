import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://momo:momo@localhost:55433/momo_keikaku';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
