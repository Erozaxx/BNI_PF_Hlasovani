/**
 * Migration for iter-020 (T-005): "Pohovory se členy" (5/10 měsíců) — data layer.
 *
 * Adds:
 *   1. member.joined_at (DATE, NOT NULL, default CURRENT_DATE) — backfilled from
 *      created_at::date (only NULL rows → idempotent). Source of truth for the
 *      5/10-month due logic; created_at is import time for bulk-imported members,
 *      not their actual BNI entry date.
 *   2. interview_question       — global editable question set
 *   3. interview                — one interview instance (month_5 / month_10)
 *   4. interview_question_snapshot — frozen copy of questions per interview
 *   5. interview_answer         — leader's answers (composite FK anti-IDOR)
 *   6. interview_link           — scoped magic link per interview
 *   7. auth_throttle            — DB-backed fixed-window rate-limit (H-4)
 *
 * Idempotent: every statement uses IF NOT EXISTS / NULL guards, safe to re-run.
 * No db.transaction() (LL-003) — sequential statements, same pattern as
 * migrate-iter-019-ordering.ts.
 *
 * Run (PROD): npx tsx scripts/migrate-iter-020-interviews.ts
 *   (loads DATABASE_URL from .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running iter-020 interviews migration…");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  // 1. member.joined_at
  await sql`ALTER TABLE member ADD COLUMN IF NOT EXISTS joined_at DATE`;
  console.log("  [1/9] member.joined_at column ensured");

  // 2. backfill (only NULL rows → idempotent)
  await sql`UPDATE member SET joined_at = created_at::date WHERE joined_at IS NULL`;
  console.log("  [2/9] member.joined_at backfilled from created_at::date");

  // 3. default + NOT NULL (idempotent — re-applying is a no-op)
  await sql`ALTER TABLE member ALTER COLUMN joined_at SET DEFAULT CURRENT_DATE`;
  await sql`ALTER TABLE member ALTER COLUMN joined_at SET NOT NULL`;
  console.log("  [3/9] member.joined_at DEFAULT + NOT NULL ensured");

  // 4. interview_question (global question set)
  await sql`
    CREATE TABLE IF NOT EXISTS interview_question (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        text          TEXT        NOT NULL,
        question_type TEXT        NOT NULL DEFAULT 'text',
        position      INTEGER     NOT NULL,
        active        BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT interview_question_text_check
            CHECK (char_length(text) > 0 AND char_length(text) <= 1000),
        CONSTRAINT interview_question_type_check
            CHECK (question_type IN ('text'))
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_interview_question_active_position
      ON interview_question (active, position)
  `;
  console.log("  [4/9] interview_question table + index ensured");

  // 5. interview (instance)
  await sql`
    CREATE TABLE IF NOT EXISTS interview (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id    UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
        type         TEXT        NOT NULL CHECK (type IN ('month_5', 'month_10')),
        status       TEXT        NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open', 'submitted', 'cancelled')),
        leader_id    UUID        REFERENCES member(id) ON DELETE SET NULL,
        created_by   UUID        REFERENCES member(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_member_type_active
      ON interview (member_id, type) WHERE status <> 'cancelled'
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_interview_member ON interview (member_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_interview_status ON interview (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_interview_leader ON interview (leader_id)`;
  console.log("  [5/9] interview table + indexes ensured");

  // 6. interview_question_snapshot
  await sql`
    CREATE TABLE IF NOT EXISTS interview_question_snapshot (
        id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        interview_id       UUID    NOT NULL REFERENCES interview(id) ON DELETE CASCADE,
        source_question_id UUID    REFERENCES interview_question(id) ON DELETE SET NULL,
        text               TEXT    NOT NULL,
        question_type      TEXT    NOT NULL DEFAULT 'text',
        position           INTEGER NOT NULL,
        CONSTRAINT iqs_interview_position_unique UNIQUE (interview_id, position),
        CONSTRAINT iqs_interview_source_unique   UNIQUE (interview_id, source_question_id),
        CONSTRAINT iqs_id_interview_unique       UNIQUE (id, interview_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_iqs_interview
      ON interview_question_snapshot (interview_id)
  `;
  console.log("  [6/9] interview_question_snapshot table + index ensured");

  // 7. interview_answer (composite FK — DB-level anti-IDOR)
  await sql`
    CREATE TABLE IF NOT EXISTS interview_answer (
        id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        interview_id         UUID        NOT NULL REFERENCES interview(id) ON DELETE CASCADE,
        snapshot_question_id UUID        NOT NULL,
        value_text           TEXT,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT interview_answer_snapshot_unique UNIQUE (snapshot_question_id),
        CONSTRAINT interview_answer_snapshot_fk
            FOREIGN KEY (snapshot_question_id, interview_id)
            REFERENCES interview_question_snapshot (id, interview_id)
            ON DELETE CASCADE
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_interview_answer_interview
      ON interview_answer (interview_id)
  `;
  console.log("  [7/9] interview_answer table + index ensured");

  // 8. interview_link (scoped magic link)
  await sql`
    CREATE TABLE IF NOT EXISTS interview_link (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        interview_id UUID        NOT NULL UNIQUE REFERENCES interview(id) ON DELETE CASCADE,
        leader_id    UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
        token_hash   TEXT        NOT NULL UNIQUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at   TIMESTAMPTZ NOT NULL,
        revoked_at   TIMESTAMPTZ,
        last_sent_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_interview_link_token_hash
      ON interview_link (token_hash)
  `;
  console.log("  [8/9] interview_link table + index ensured");

  // 9. auth_throttle (DB-backed rate-limit, H-4)
  await sql`
    CREATE TABLE IF NOT EXISTS auth_throttle (
        key          TEXT        PRIMARY KEY,
        window_start TIMESTAMPTZ NOT NULL,
        count        INTEGER     NOT NULL DEFAULT 0
    )
  `;
  console.log("  [9/9] auth_throttle table ensured");

  console.log("\niter-020 interviews migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
