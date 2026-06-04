/**
 * Migration for iter-019 (T-014): drag&drop display ordering.
 *
 * Adds:
 *   1. member.display_order        (INTEGER, nullable) — global member order
 *   2. meeting_guest.display_order (INTEGER, nullable) — per-meeting guest order
 *
 * Backfill (default order = order of addition):
 *   - member: ROW_NUMBER() OVER (ORDER BY created_at)
 *   - meeting_guest: ROW_NUMBER() OVER (PARTITION BY meeting_id ORDER BY added_at)
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS; backfill only sets rows where
 * display_order IS NULL, so re-running never reshuffles already-ordered rows.
 *
 * No db.transaction() (LL-003) — sequential statements with IF NOT EXISTS /
 * NULL guards make each step safe to re-run.
 *
 * Run (PROD): npx tsx scripts/migrate-iter-019-ordering.ts
 *   (loads DATABASE_URL from .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Running iter-019 ordering migration…");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  // 1. member.display_order
  await sql`ALTER TABLE member ADD COLUMN IF NOT EXISTS display_order INTEGER`;
  console.log("  [1/4] member.display_order column ensured");

  // 2. backfill member order by created_at (only NULL rows → idempotent)
  await sql`
    UPDATE member
    SET display_order = sub.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
      FROM member
    ) sub
    WHERE member.id = sub.id
      AND member.display_order IS NULL
  `;
  console.log("  [2/4] member.display_order backfilled (by created_at)");

  // 3. meeting_guest.display_order
  await sql`ALTER TABLE meeting_guest ADD COLUMN IF NOT EXISTS display_order INTEGER`;
  console.log("  [3/4] meeting_guest.display_order column ensured");

  // 4. backfill guest order per meeting by added_at (only NULL rows)
  await sql`
    UPDATE meeting_guest mg
    SET display_order = sub.rn
    FROM (
      SELECT meeting_id, guest_id,
             ROW_NUMBER() OVER (PARTITION BY meeting_id ORDER BY added_at) AS rn
      FROM meeting_guest
    ) sub
    WHERE mg.meeting_id = sub.meeting_id
      AND mg.guest_id = sub.guest_id
      AND mg.display_order IS NULL
  `;
  console.log("  [4/4] meeting_guest.display_order backfilled (per meeting, by added_at)");

  console.log("\niter-019 ordering migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
