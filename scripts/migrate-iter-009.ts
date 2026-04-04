/**
 * Migration for iter-009:
 * - Add phone column to guest table.
 * - Add company and obor columns to member table.
 *
 * NOTE: guest.company already exists — NOT added here (SCHEMA-001).
 * All new columns are nullable, no backfill needed.
 *
 * Run: npx ts-node scripts/migrate-iter-009.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running iter-009 migration: guest.phone, member.company, member.obor...");

  await sql`ALTER TABLE guest ADD COLUMN IF NOT EXISTS phone text`;
  await sql`ALTER TABLE member ADD COLUMN IF NOT EXISTS company text`;
  await sql`ALTER TABLE member ADD COLUMN IF NOT EXISTS obor text`;

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
