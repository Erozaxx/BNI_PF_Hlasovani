-- ============================================================
-- iter-021 (T-005) — priznaky platnosti otazky (5/10 mesicu)
-- Delta migrace k iter-020 (interview_question, interview_question_snapshot).
-- Idempotentni. ZADNA transakce (LL-003).
--
-- Aplikace PRES scripts/migrate-iter-021-question-scope.ts (8 kroku + smoke
-- test [0]) — TENTO soubor je citelna reference stejneho DDL, ne primy vstup
-- pro psql spousteni na produkci (viz D-1: coder ho nespousti, spousti Tomas
-- v T-013).
--
-- lock_timeout (arch T-003 sekce 4): kazdy DDL statement bezi v DO bloku,
-- ktery nejdriv nastavi transakcne-lokalni lock_timeout pres
-- set_config('lock_timeout', '5s', true) — ekvivalent SET LOCAL. Nutne kvuli
-- neon-http driveru (zadna session kontinuita mezi volanimi) — samostatny
-- prikaz `SET lock_timeout` by nemel zarucený vliv na nasledujici ALTER.
--
-- CHECK jako NOT VALID + samostatny VALIDATE CONSTRAINT (MINOR-2): ACCESS
-- EXCLUSIVE faze se smrskne na cisty katalogovy zapis, full-scan validace
-- bezi pod SHARE UPDATE EXCLUSIVE (neblokuje cteni ani zapis fill-formu).
-- ============================================================

-- [1/8] interview_question.applies_month_5 (metadata-only, PG11+ = backfill zdarma)
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question
        ADD COLUMN IF NOT EXISTS applies_month_5 BOOLEAN NOT NULL DEFAULT TRUE;
END $$;

-- [2/8] interview_question.applies_month_10
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question
        ADD COLUMN IF NOT EXISTS applies_month_10 BOOLEAN NOT NULL DEFAULT TRUE;
END $$;

-- [3/8] interview_question_snapshot.applies_month_5
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question_snapshot
        ADD COLUMN IF NOT EXISTS applies_month_5 BOOLEAN NOT NULL DEFAULT TRUE;
END $$;

-- [4/8] interview_question_snapshot.applies_month_10
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question_snapshot
        ADD COLUMN IF NOT EXISTS applies_month_10 BOOLEAN NOT NULL DEFAULT TRUE;
END $$;

-- [5/8] CHECK na interview_question — NOT VALID (metadata-only), idempotentni
-- pres podminku na pg_constraint (ADD CONSTRAINT nema IF NOT EXISTS)
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'interview_question_applies_check'
          AND conrelid = 'interview_question'::regclass
    ) THEN
        ALTER TABLE interview_question
            ADD CONSTRAINT interview_question_applies_check
            CHECK (applies_month_5 OR applies_month_10) NOT VALID;
    END IF;
END $$;

-- [6/8] VALIDATE — SHARE UPDATE EXCLUSIVE scan; na jiz validnim constraintu no-op
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question
        VALIDATE CONSTRAINT interview_question_applies_check;
END $$;

-- [7/8] CHECK na interview_question_snapshot — NOT VALID, idempotentni
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'iqs_applies_check'
          AND conrelid = 'interview_question_snapshot'::regclass
    ) THEN
        ALTER TABLE interview_question_snapshot
            ADD CONSTRAINT iqs_applies_check
            CHECK (applies_month_5 OR applies_month_10) NOT VALID;
    END IF;
END $$;

-- [8/8] VALIDATE
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question_snapshot
        VALIDATE CONSTRAINT iqs_applies_check;
END $$;
