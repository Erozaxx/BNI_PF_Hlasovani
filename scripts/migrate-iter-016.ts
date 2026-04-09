/**
 * Migration for iter-016: Token Encryption (Bug A fix)
 *
 * Changes:
 * 1. Add nullable encrypted_token column to event_participant table
 *
 * Run: npx ts-node scripts/migrate-iter-016.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running iter-016 migration...");

  // Step 1: Add encrypted_token nullable column to event_participant
  console.log("Step 1: Adding encrypted_token column to event_participant...");
  await sql`
    ALTER TABLE event_participant
      ADD COLUMN IF NOT EXISTS encrypted_token TEXT
  `;
  console.log("  encrypted_token column added (nullable, no default).");

  console.log("iter-016 migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
