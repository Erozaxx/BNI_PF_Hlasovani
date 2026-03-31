/**
 * Migration: iter-006
 * Adds company and email columns to the guest table.
 *
 * Run: npx tsx scripts/migrate-iter-006.ts
 */

import * as dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function migrate() {
  console.log("Running iter-006 migration...");

  await sql`ALTER TABLE guest ADD COLUMN IF NOT EXISTS company text`;
  console.log("✓ guest.company added");

  await sql`ALTER TABLE guest ADD COLUMN IF NOT EXISTS email text`;
  console.log("✓ guest.email added");

  // Verify
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'guest' AND column_name IN ('company', 'email')
    ORDER BY column_name
  `;
  console.log("Verified columns:", cols.map((r) => r.column_name).join(", "));
  console.log("Migration iter-006 complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
