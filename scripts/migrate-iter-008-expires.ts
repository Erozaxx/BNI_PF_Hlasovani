/**
 * Migration for iter-008:
 * Add expires_at column to event table.
 * Default for existing rows: created_at + 3 months.
 *
 * Run: npx ts-node scripts/migrate-iter-008-expires.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running iter-008 migration: expires_at...");

  await sql`
    ALTER TABLE event
    ADD COLUMN IF NOT EXISTS expires_at timestamptz
  `;

  // Backfill existing rows: expires_at = created_at + 3 months
  const result = await sql`
    UPDATE event
    SET expires_at = created_at + interval '3 months'
    WHERE expires_at IS NULL
  `;

  console.log(`Done: expires_at column added. Backfilled ${result.length ?? "?"} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
