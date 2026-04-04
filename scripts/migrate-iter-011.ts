/**
 * Migration for iter-011: Meeting-Voting Workflow
 *
 * Changes:
 * 1. Extend meeting.status CHECK constraint to include 'active'
 * 2. Create meeting_member_link table with morning_email_sent_at
 * 3. Add nullable meeting_id FK to note table
 * 4. Create index idx_note_meeting on note(meeting_id)
 *
 * Run: npx ts-node scripts/migrate-iter-011.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running iter-011 migration...");

  // Step 1: Extend meeting.status CHECK constraint to include 'active'
  console.log("Step 1: Updating meeting_status_check constraint...");
  await sql`ALTER TABLE meeting DROP CONSTRAINT IF EXISTS meeting_status_check`;
  await sql`
    ALTER TABLE meeting ADD CONSTRAINT meeting_status_check
      CHECK (status IN ('draft', 'active', 'voting', 'closed'))
  `;
  console.log("  meeting_status_check updated.");

  // Step 2: Create meeting_member_link table
  console.log("Step 2: Creating meeting_member_link table...");
  await sql`
    CREATE TABLE IF NOT EXISTS meeting_member_link (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id             UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
      member_id              UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      token_hash             TEXT NOT NULL,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at             TIMESTAMPTZ,
      revoked_at             TIMESTAMPTZ,
      morning_email_sent_at  TIMESTAMPTZ,
      UNIQUE(meeting_id, member_id),
      UNIQUE(token_hash)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mml_token_hash ON meeting_member_link(token_hash)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mml_meeting_id ON meeting_member_link(meeting_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mml_member_id ON meeting_member_link(member_id)
  `;
  console.log("  meeting_member_link table and indexes created.");

  // Step 3: Add nullable meeting_id FK to note table
  console.log("Step 3: Adding meeting_id to note table...");
  await sql`
    ALTER TABLE note
      ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES meeting(id) ON DELETE SET NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_note_meeting ON note(meeting_id)
  `;
  console.log("  note.meeting_id column and index created.");

  console.log("iter-011 migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
