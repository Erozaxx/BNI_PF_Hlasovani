-- ============================================================
-- iter-027 (T-005) — ops_event: historie běhů (cron/dispatch/e-maily).
-- Zakládá JEDNU novou tabulku a čtyři indexy. Nesahá na žádnou existující
-- tabulku, sloupec ani constraint — jediný dotyk existujících tabulek jsou
-- dva cizí klíče do meeting a member (krátký zámek na katalogu, ne přepis
-- dat). Idempotentní. ŽÁDNÁ transakce (LL-003).
--
-- Aplikace PRES scripts/migrate-iter-027-ops-event.ts (7 kroku + smoke test
-- [0]) — TENTO soubor je citelna reference stejneho DDL, ne primy vstup pro
-- psql spousteni na produkci. Coder (T-005) ho NAPSAL, NESPUSTIL — spousti
-- ho clovek v T-009, drzitel produkcniho DATABASE_URL.
--
-- lock_timeout: CREATE TABLE bezi v DO bloku, ktery nejdriv nastavi
-- transakcne-lokalni lock_timeout pres set_config('lock_timeout', '5s',
-- true) — nutne kvuli neon-http driveru (zadna session kontinuita mezi
-- volanimi). CREATE INDEX (na cerstve prazdne tabulce) uz DO blok
-- nepotrebuje — IF NOT EXISTS je nativni syntaxe a zamek na prazdne tabulce
-- je okamzity.
--
-- CREATE INDEX, ne CREATE INDEX CONCURRENTLY: CONCURRENTLY nesmi bezet
-- uvnitr transakcniho bloku a neon-http kazdy prikaz do implicitni
-- transakce zabali. Na prazdne tabulce je bezny CREATE INDEX okamzity.
-- ============================================================

-- [1/7] CREATE TABLE
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS ops_event (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id              UUID        NOT NULL,
        seq                 INTEGER     NOT NULL DEFAULT 0,
        occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source              TEXT        NOT NULL,
        kind                TEXT        NOT NULL,
        severity            TEXT        NOT NULL,
        actor               TEXT,
        meeting_id          UUID        REFERENCES meeting(id) ON DELETE SET NULL,
        meeting_date        DATE,
        member_id           UUID        REFERENCES member(id) ON DELETE SET NULL,
        member_name         TEXT,
        email               TEXT,
        code                TEXT,
        message             TEXT        NOT NULL,
        detail              JSONB,
        resend_email_id     TEXT,
        resend_message_id   TEXT,
        delivery_status     TEXT,
        delivery_checked_at TIMESTAMPTZ
    );
END $$;

-- [2/7] výpis + retence (occurred_at DESC)
CREATE INDEX IF NOT EXISTS idx_ops_event_occurred_at ON ops_event (occurred_at DESC);

-- [3/7] detail běhu (run_id, seq)
CREATE INDEX IF NOT EXISTS idx_ops_event_run_id ON ops_event (run_id, seq);

-- [4/7] případ Kateřiny — historie člena (member_id, occurred_at DESC)
CREATE INDEX IF NOT EXISTS idx_ops_event_member_id ON ops_event (member_id, occurred_at DESC);

-- [5/7] filtr na schůzku (meeting_id, occurred_at DESC)
CREATE INDEX IF NOT EXISTS idx_ops_event_meeting_id ON ops_event (meeting_id, occurred_at DESC);

-- [6/7] CHECK na severity — idempotentní přes podmínku na pg_constraint
-- (ADD CONSTRAINT nemá IF NOT EXISTS). kind CHECK vědomě NENÍ — autoritou je
-- TS union OpsEventKind (lib/ops/types.ts), viz arch 3.2.
DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ops_event_severity_check'
          AND conrelid = 'ops_event'::regclass
    ) THEN
        ALTER TABLE ops_event
            ADD CONSTRAINT ops_event_severity_check
            CHECK (severity IN ('info', 'warn', 'error'));
    END IF;
END $$;

-- [7/7] je datový zápis (kind='migration.applied'), ne DDL — viz runner
-- (scripts/migrate-iter-027-ops-event.ts), tady záměrně chybí.
