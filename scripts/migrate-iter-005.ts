/**
 * Migration script: iter-005
 *
 * Adds:
 *   - meeting.location (text, nullable)
 *   - meeting_guest.voting_enabled (boolean NOT NULL DEFAULT true)
 *
 * Usage:
 *   npx tsx scripts/migrate-iter-005.ts
 *
 * Requires DATABASE_URL in .env.local or environment.
 * Run once — safe to re-run (uses IF NOT EXISTS column check pattern via ALTER TABLE … IF NOT EXISTS on Postgres 9.6+).
 */

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  console.log("Starting iter-005 migration...");

  // Step 1: Add location to meeting (nullable, no default)
  console.log("Step 1: ALTER TABLE meeting ADD COLUMN IF NOT EXISTS location text");
  await sql`
    ALTER TABLE meeting ADD COLUMN IF NOT EXISTS location text
  `;
  console.log("  OK");

  // Step 2: Add voting_enabled to meeting_guest (NOT NULL DEFAULT true)
  console.log("Step 2: ALTER TABLE meeting_guest ADD COLUMN IF NOT EXISTS voting_enabled boolean NOT NULL DEFAULT true");
  await sql`
    ALTER TABLE meeting_guest ADD COLUMN IF NOT EXISTS voting_enabled boolean NOT NULL DEFAULT true
  `;
  console.log("  OK");

  // Verify
  console.log("\nVerifying columns...");
  const cols = await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name IN ('meeting', 'meeting_guest')
      AND column_name IN ('location', 'voting_enabled')
    ORDER BY table_name, column_name
  `;

  if (cols.length === 0) {
    console.error("ERROR: Columns not found after migration!");
    process.exit(1);
  }

  for (const col of cols) {
    console.log(
      `  ${col.table_name}.${col.column_name}: ${col.data_type}, nullable=${col.is_nullable}, default=${col.column_default}`
    );
  }

  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
