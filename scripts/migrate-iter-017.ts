/**
 * Migration for iter-017: Timer feature
 *
 * Changes:
 * 1. Create timer table with view_token / control_token two-link architecture
 *
 * Run: npx ts-node scripts/migrate-iter-017.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running iter-017 migration...");

  // Step 1: Create timer table
  console.log("Step 1: Creating timer table...");
  await sql`
    CREATE TABLE IF NOT EXISTS timer (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      display_seconds INTEGER NOT NULL,
      initial_seconds INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'paused',
      started_at TIMESTAMPTZ,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0,
      view_token TEXT NOT NULL UNIQUE,
      control_token TEXT NOT NULL UNIQUE,
      created_by UUID REFERENCES member(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT timer_status_check CHECK (status IN ('running', 'paused')),
      CONSTRAINT timer_initial_seconds_check CHECK (initial_seconds > 0 AND initial_seconds <= 86400),
      CONSTRAINT timer_display_seconds_check CHECK (display_seconds > 0 AND display_seconds <= 86400),
      CONSTRAINT timer_elapsed_check CHECK (elapsed_seconds >= 0 AND elapsed_seconds <= initial_seconds),
      CONSTRAINT timer_name_check CHECK (char_length(name) > 0 AND char_length(name) <= 100)
    )
  `;
  console.log("  timer table created.");

  // Step 2: Create indexes
  console.log("Step 2: Creating indexes...");
  await sql`CREATE INDEX IF NOT EXISTS idx_timer_view_token ON timer(view_token)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_timer_control_token ON timer(control_token)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_timer_status ON timer(status)`;
  console.log("  Indexes created.");

  console.log("iter-017 migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
