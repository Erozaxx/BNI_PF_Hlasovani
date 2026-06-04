-- ============================================================
-- iter-019 (T-014) — drag&drop display ordering
-- Delta migration. Idempotent. NO transaction (LL-003).
-- Apply on PROD via: npx tsx scripts/migrate-iter-019-ordering.ts
-- (this .sql is the canonical reference for the same statements)
-- ============================================================

-- 1. member: global display order
ALTER TABLE member ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- 2. backfill member order by created_at (only NULL → idempotent)
UPDATE member
SET display_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM member
) sub
WHERE member.id = sub.id
  AND member.display_order IS NULL;

-- 3. meeting_guest: per-meeting display order
ALTER TABLE meeting_guest ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- 4. backfill guest order per meeting by added_at (only NULL → idempotent)
UPDATE meeting_guest mg
SET display_order = sub.rn
FROM (
  SELECT meeting_id, guest_id,
         ROW_NUMBER() OVER (PARTITION BY meeting_id ORDER BY added_at) AS rn
  FROM meeting_guest
) sub
WHERE mg.meeting_id = sub.meeting_id
  AND mg.guest_id = sub.guest_id
  AND mg.display_order IS NULL;
