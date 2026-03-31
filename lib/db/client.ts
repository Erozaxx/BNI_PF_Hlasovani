import { neon, neonConfig, Pool } from "@neondatabase/serverless";

// Enable connection caching for serverless environments
neonConfig.fetchConnectionCache = true;

/**
 * SQL tagged template for simple queries.
 * Usage: const rows = await sql`SELECT * FROM member WHERE id = ${id}`;
 */
export const sql = neon(process.env.DATABASE_URL!);

/**
 * Connection pool for transactions and complex queries.
 * Usage: const client = await pool.connect(); try { ... } finally { client.release(); }
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
