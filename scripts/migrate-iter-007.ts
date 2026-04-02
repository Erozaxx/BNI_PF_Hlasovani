/**
 * Migration: iter-007
 * Creates tables for the Event Planning module:
 *   event, event_option, event_participant, event_vote
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + DO $$ ... $$ blocks for constraints.
 *
 * Run: npx tsx scripts/migrate-iter-007.ts
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
  console.log("Running iter-007 migration...");

  // ----------------------------------------------------------------
  // event
  // ----------------------------------------------------------------
  await sql`
    CREATE TABLE IF NOT EXISTS event (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title               text NOT NULL,
      description         text,
      status              text NOT NULL DEFAULT 'draft',
      voting_type         text NOT NULL DEFAULT 'pick_one',
      voting_max_x        integer,
      who_can_vote        text NOT NULL DEFAULT 'members_only',
      custom_options_allowed boolean NOT NULL DEFAULT false,
      who_can_add_options text NOT NULL DEFAULT 'members_only',
      selected_option_id  uuid,
      created_by          uuid REFERENCES member(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      activated_at        timestamptz,
      closed_at           timestamptz,
      done_at             timestamptz,
      tokens_revoked_at   timestamptz
    )
  `;
  console.log("✓ table event created (if not exists)");

  // ----------------------------------------------------------------
  // event_option
  // Note: created before event_participant so event.selected_option_id FK
  //       and event_option.added_by_participant_id FK can be added after
  //       event_participant exists.
  // ----------------------------------------------------------------
  await sql`
    CREATE TABLE IF NOT EXISTS event_option (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id                uuid NOT NULL REFERENCES event(id) ON DELETE CASCADE,
      label                   text NOT NULL,
      added_by_participant_id uuid,
      created_at              timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("✓ table event_option created (if not exists)");

  // ----------------------------------------------------------------
  // event_participant
  // ----------------------------------------------------------------
  await sql`
    CREATE TABLE IF NOT EXISTS event_participant (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id          uuid NOT NULL REFERENCES event(id) ON DELETE CASCADE,
      member_id         uuid REFERENCES member(id) ON DELETE SET NULL,
      external_name     text,
      external_email    text,
      magic_token_hash  text UNIQUE,
      token_created_at  timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("✓ table event_participant created (if not exists)");

  // ----------------------------------------------------------------
  // event_vote
  // ----------------------------------------------------------------
  await sql`
    CREATE TABLE IF NOT EXISTS event_vote (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id       uuid NOT NULL REFERENCES event(id) ON DELETE CASCADE,
      participant_id uuid NOT NULL REFERENCES event_participant(id) ON DELETE CASCADE,
      option_id      uuid NOT NULL REFERENCES event_option(id) ON DELETE CASCADE,
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("✓ table event_vote created (if not exists)");

  // ----------------------------------------------------------------
  // Deferred FK: event.selected_option_id → event_option(id)
  // ----------------------------------------------------------------
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_selected_option_id_fkey'
          AND table_name = 'event'
      ) THEN
        ALTER TABLE event
          ADD CONSTRAINT event_selected_option_id_fkey
          FOREIGN KEY (selected_option_id) REFERENCES event_option(id) ON DELETE SET NULL;
      END IF;
    END $$
  `;
  console.log("✓ FK event.selected_option_id → event_option added (if not exists)");

  // ----------------------------------------------------------------
  // Deferred FK: event_option.added_by_participant_id → event_participant(id)
  // ----------------------------------------------------------------
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_option_added_by_participant_id_fkey'
          AND table_name = 'event_option'
      ) THEN
        ALTER TABLE event_option
          ADD CONSTRAINT event_option_added_by_participant_id_fkey
          FOREIGN KEY (added_by_participant_id) REFERENCES event_participant(id) ON DELETE SET NULL;
      END IF;
    END $$
  `;
  console.log("✓ FK event_option.added_by_participant_id → event_participant added (if not exists)");

  // ----------------------------------------------------------------
  // CHECK constraints — event
  // ----------------------------------------------------------------
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_status_check' AND table_name = 'event'
      ) THEN
        ALTER TABLE event ADD CONSTRAINT event_status_check
          CHECK (status IN ('draft', 'active', 'closed', 'done'));
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_voting_type_check' AND table_name = 'event'
      ) THEN
        ALTER TABLE event ADD CONSTRAINT event_voting_type_check
          CHECK (voting_type IN ('pick_one', 'multiple', 'max_x'));
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_who_can_vote_check' AND table_name = 'event'
      ) THEN
        ALTER TABLE event ADD CONSTRAINT event_who_can_vote_check
          CHECK (who_can_vote IN ('members_only', 'anyone_with_link'));
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_who_can_add_options_check' AND table_name = 'event'
      ) THEN
        ALTER TABLE event ADD CONSTRAINT event_who_can_add_options_check
          CHECK (who_can_add_options IN ('members_only', 'anyone_with_link'));
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_voting_max_x_required' AND table_name = 'event'
      ) THEN
        ALTER TABLE event ADD CONSTRAINT event_voting_max_x_required
          CHECK (voting_type != 'max_x' OR voting_max_x IS NOT NULL);
      END IF;
    END $$
  `;
  console.log("✓ CHECK constraints on event added (if not exists)");

  // ----------------------------------------------------------------
  // CHECK constraints — event_participant
  // ----------------------------------------------------------------
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_participant_identity_check' AND table_name = 'event_participant'
      ) THEN
        ALTER TABLE event_participant ADD CONSTRAINT event_participant_identity_check
          CHECK (member_id IS NOT NULL OR external_name IS NOT NULL);
      END IF;
    END $$
  `;
  console.log("✓ CHECK constraints on event_participant added (if not exists)");

  // ----------------------------------------------------------------
  // UNIQUE constraints — event_option
  // ----------------------------------------------------------------
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_option_event_id_label_unique' AND table_name = 'event_option'
      ) THEN
        ALTER TABLE event_option ADD CONSTRAINT event_option_event_id_label_unique
          UNIQUE (event_id, label);
      END IF;
    END $$
  `;
  console.log("✓ UNIQUE (event_id, label) on event_option added (if not exists)");

  // ----------------------------------------------------------------
  // UNIQUE constraints — event_vote
  // ----------------------------------------------------------------
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'event_vote_participant_option_unique' AND table_name = 'event_vote'
      ) THEN
        ALTER TABLE event_vote ADD CONSTRAINT event_vote_participant_option_unique
          UNIQUE (participant_id, option_id);
      END IF;
    END $$
  `;
  console.log("✓ UNIQUE (participant_id, option_id) on event_vote added (if not exists)");

  // ----------------------------------------------------------------
  // Partial UNIQUE constraints — event_participant
  // (must use CREATE UNIQUE INDEX for partial uniqueness in Postgres)
  // ----------------------------------------------------------------
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'idx_event_participant_event_member_unique'
          AND n.nspname = 'public'
      ) THEN
        CREATE UNIQUE INDEX idx_event_participant_event_member_unique
          ON event_participant (event_id, member_id)
          WHERE member_id IS NOT NULL;
      END IF;
    END $$
  `;

  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'idx_event_participant_event_email_unique'
          AND n.nspname = 'public'
      ) THEN
        CREATE UNIQUE INDEX idx_event_participant_event_email_unique
          ON event_participant (event_id, external_email)
          WHERE external_email IS NOT NULL;
      END IF;
    END $$
  `;
  console.log("✓ Partial UNIQUE indexes on event_participant added (if not exists)");

  // ----------------------------------------------------------------
  // Regular indexes
  // ----------------------------------------------------------------
  await sql`CREATE INDEX IF NOT EXISTS idx_event_status ON event (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_created_at ON event (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_option_event_id ON event_option (event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_participant_event_id ON event_participant (event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_participant_magic_token_hash ON event_participant (magic_token_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_participant_member_id ON event_participant (member_id)`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_event_participant_external_email
      ON event_participant (external_email)
      WHERE external_email IS NOT NULL AND member_id IS NULL
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_vote_event_option ON event_vote (event_id, option_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_vote_participant_id ON event_vote (participant_id)`;
  console.log("✓ Indexes added (if not exists)");

  // ----------------------------------------------------------------
  // Verify
  // ----------------------------------------------------------------
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('event', 'event_option', 'event_participant', 'event_vote')
    ORDER BY table_name
  `;
  console.log("Verified tables:", tables.map((r) => r.table_name).join(", "));
  console.log("Migration iter-007 complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
