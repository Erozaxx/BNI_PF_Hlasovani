import { neon, Pool } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;
let _pool: Pool | null = null;

export function getSql(): ReturnType<typeof neon> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}
