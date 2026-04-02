/**
 * Patch migration for iter-007:
 * Add option_type column to event table.
 *
 * Run: npx ts-node scripts/migrate-iter-007-patch.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running iter-007 patch migration...");

  await sql`
    ALTER TABLE event
    ADD COLUMN IF NOT EXISTS option_type text NOT NULL DEFAULT 'text'
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'event_option_type_check'
      ) THEN
        ALTER TABLE event
        ADD CONSTRAINT event_option_type_check
        CHECK (option_type IN ('text', 'date', 'datetime'));
      END IF;
    END $$
  `;

  console.log("Done: option_type column added to event table.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
