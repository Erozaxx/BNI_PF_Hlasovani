-- ============================================================
-- BNI Hlasovani – PostgreSQL Schema
-- Neon free tier: 512 MB, max 100 connections (doporuceno 20)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- pro gen_random_uuid()

-- ============================================================
-- CATEGORY
-- ============================================================
CREATE TABLE category (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT category_name_unique UNIQUE (name)
);

-- ============================================================
-- MEMBER
-- T-004fix: Sloupec `role` nahrazen sloupcem `management_role` (nullable).
-- Vsechny zaznamy jsou "member" identity (mohou hlasovat pres magic link).
-- management_role urcuje POUZE management opravneni (pridani hosta, spusteni
-- hlasovani, sprava clenu...). NULL = radovy clen BNI bez management opravneni.
-- Admin a Moderator mohou mit BOTH: password_hash (pro management login)
-- I magic_token_hash (pro hlasovani pres magic link).
-- ============================================================
CREATE TABLE member (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    email            TEXT,
    password_hash    TEXT,
    management_role  TEXT        CHECK (management_role IN ('admin', 'moderator')),
    magic_token_hash          TEXT        UNIQUE,
    token_expires_at          TIMESTAMPTZ,
    token_used                BOOLEAN     NOT NULL DEFAULT FALSE,
    previous_token_hash       TEXT,
    previous_token_expires_at TIMESTAMPTZ,
    display_order    INTEGER,  -- iter-019: global drag&drop order (backfilled by created_at)
    joined_at        DATE        NOT NULL DEFAULT CURRENT_DATE,  -- iter-020: source of truth for BNI entry date (backfilled from created_at::date)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT member_management_requires_credentials
        CHECK (
            management_role IS NULL
            OR (email IS NOT NULL AND password_hash IS NOT NULL)
        ),
    CONSTRAINT member_email_unique UNIQUE (email)
);

CREATE INDEX idx_member_magic_token_hash ON member (magic_token_hash)
    WHERE magic_token_hash IS NOT NULL;

CREATE INDEX idx_member_email ON member (email)
    WHERE email IS NOT NULL;

CREATE INDEX idx_member_management_role ON member (management_role)
    WHERE management_role IS NOT NULL;

-- ============================================================
-- GUEST
-- ============================================================
CREATE TABLE guest (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    category_id UUID        REFERENCES category(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID        REFERENCES member(id) ON DELETE SET NULL
);

CREATE INDEX idx_guest_category ON guest (category_id);
CREATE INDEX idx_guest_created_at ON guest (created_at DESC);

-- ============================================================
-- MEETING
-- ============================================================
CREATE TABLE meeting (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    date              DATE        NOT NULL UNIQUE,
    voting_open_at    TIMESTAMPTZ,
    voting_closes_at  TIMESTAMPTZ,
    status            TEXT        NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'voting', 'closed')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT meeting_voting_window_valid
        CHECK (
            voting_open_at IS NULL
            OR voting_closes_at IS NULL
            OR voting_open_at < voting_closes_at
        )
);

CREATE INDEX idx_meeting_date ON meeting (date DESC);
CREATE INDEX idx_meeting_status ON meeting (status);

-- ============================================================
-- MEETING_GUEST  (M:N – host muze byt ve vice schuzkach)
-- ============================================================
CREATE TABLE meeting_guest (
    meeting_id    UUID    NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
    guest_id      UUID    NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    display_order INTEGER,  -- iter-019: per-meeting drag&drop order (backfilled by added_at)
    PRIMARY KEY (meeting_id, guest_id)
);

CREATE INDEX idx_meeting_guest_guest ON meeting_guest (guest_id);

-- ============================================================
-- NOTE
-- ============================================================
CREATE TABLE note (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID        REFERENCES member(id) ON DELETE SET NULL,
    guest_id    UUID        NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
    text        TEXT        NOT NULL CHECK (char_length(text) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_note_guest ON note (guest_id);
CREATE INDEX idx_note_member ON note (member_id);
CREATE INDEX idx_note_created_at ON note (created_at DESC);

-- ============================================================
-- VOTE
-- ============================================================
CREATE TABLE vote (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    guest_id    UUID        NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
    meeting_id  UUID        NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
    value       TEXT        NOT NULL CHECK (value IN ('up', 'neutral', 'down')),
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vote_unique_per_member_guest_meeting
        UNIQUE (member_id, guest_id, meeting_id),
    CONSTRAINT vote_reason_required_for_down
        CHECK (value != 'down' OR (reason IS NOT NULL AND char_length(reason) > 0))
);

CREATE INDEX idx_vote_guest_meeting ON vote (guest_id, meeting_id);
CREATE INDEX idx_vote_member ON vote (member_id);
CREATE INDEX idx_vote_meeting ON vote (meeting_id);

-- ============================================================
-- VOTE IMMUTABILITY - BLOCKER-003 fix
-- Trigger zabrani vlozeni hlasu pokud schuzka neni ve stavu
-- 'voting' nebo pokud hlasovaci okno jiz vyprselo.
-- Aplikacni vrstva (castVote action) provadi stejny check -
-- trigger je druha linie obrany pro pripady race condition,
-- primeho pristupu k DB nebo bugu v aplikaci.
-- ============================================================
CREATE OR REPLACE FUNCTION check_meeting_voting_open()
RETURNS TRIGGER AS $$
DECLARE
  m_status TEXT;
  m_closes TIMESTAMPTZ;
BEGIN
  SELECT status, voting_closes_at INTO m_status, m_closes
  FROM meeting WHERE id = NEW.meeting_id;
  IF m_status != 'voting' OR (m_closes IS NOT NULL AND NOW() > m_closes) THEN
    RAISE EXCEPTION 'Voting is not open for this meeting (status=%, closes=%)', m_status, m_closes;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vote_meeting_open_check
  BEFORE INSERT ON vote
  FOR EACH ROW EXECUTE FUNCTION check_meeting_voting_open();

-- ============================================================
-- iter-020 - POHOVORY SE CLENY (5/10 mesicu)
-- Viz lib/db/migrations/iter-020-interviews.sql pro plnou migraci (idempotentni).
-- ============================================================

-- INTERVIEW_QUESTION - globalni editovatelna sada otazek
-- iter-021: applies_month_5 / applies_month_10 - platnost otazky pro dany typ
-- pohovoru. Viz lib/db/migrations/iter-021-question-scope.sql pro delta migraci.
CREATE TABLE interview_question (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    text             TEXT        NOT NULL,
    question_type    TEXT        NOT NULL DEFAULT 'text',
    position         INTEGER     NOT NULL,
    active           BOOLEAN     NOT NULL DEFAULT TRUE,
    applies_month_5  BOOLEAN     NOT NULL DEFAULT TRUE,
    applies_month_10 BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT interview_question_text_check
        CHECK (char_length(text) > 0 AND char_length(text) <= 1000),
    CONSTRAINT interview_question_type_check
        CHECK (question_type IN ('text')),
    CONSTRAINT interview_question_applies_check
        CHECK (applies_month_5 OR applies_month_10)
);
CREATE INDEX idx_interview_question_active_position ON interview_question (active, position);

-- INTERVIEW - instance pohovoru (partial UNIQUE: max 1 zivy 5m + 1 zivy 10m na clena)
CREATE TABLE interview (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id    UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    type         TEXT        NOT NULL CHECK (type IN ('month_5', 'month_10')),
    status       TEXT        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'submitted', 'cancelled')),
    leader_id    UUID        REFERENCES member(id) ON DELETE SET NULL,
    created_by   UUID        REFERENCES member(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_interview_member_type_active
    ON interview (member_id, type) WHERE status <> 'cancelled';
CREATE INDEX idx_interview_member ON interview (member_id);
CREATE INDEX idx_interview_status ON interview (status);
CREATE INDEX idx_interview_leader ON interview (leader_id);

-- INTERVIEW_QUESTION_SNAPSHOT - zamrazena kopie otazek pri zalozeni pohovoru
-- iter-021: applies_month_5 / applies_month_10 kopirovany ze zdroje pri zalozeni,
-- dale nemenne (radek se po insertu neupdatuje). CHECK i zde - pojistka proti
-- bugu v kopirovaci logice (arch T-001 1.3).
CREATE TABLE interview_question_snapshot (
    id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id       UUID    NOT NULL REFERENCES interview(id) ON DELETE CASCADE,
    source_question_id UUID    REFERENCES interview_question(id) ON DELETE SET NULL,
    text               TEXT    NOT NULL,
    question_type      TEXT    NOT NULL DEFAULT 'text',
    position           INTEGER NOT NULL,
    applies_month_5    BOOLEAN NOT NULL DEFAULT TRUE,
    applies_month_10   BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT iqs_interview_position_unique UNIQUE (interview_id, position),
    CONSTRAINT iqs_interview_source_unique   UNIQUE (interview_id, source_question_id),
    CONSTRAINT iqs_id_interview_unique       UNIQUE (id, interview_id),
    CONSTRAINT iqs_applies_check
        CHECK (applies_month_5 OR applies_month_10)
);
CREATE INDEX idx_iqs_interview ON interview_question_snapshot (interview_id);

-- INTERVIEW_ANSWER - odpovedi vedouciho (composite FK = DB-level anti-IDOR)
CREATE TABLE interview_answer (
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
);
CREATE INDEX idx_interview_answer_interview ON interview_answer (interview_id);

-- INTERVIEW_LINK - scoped magic link pohovoru (expires_at NOT NULL, 1 radek per pohovor)
CREATE TABLE interview_link (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID        NOT NULL UNIQUE REFERENCES interview(id) ON DELETE CASCADE,
    leader_id    UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ
);
CREATE INDEX idx_interview_link_token_hash ON interview_link (token_hash);

-- AUTH_THROTTLE - DB-backed fixed-window rate-limit (bez Upstash)
CREATE TABLE auth_throttle (
    key          TEXT        PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL,
    count        INTEGER     NOT NULL DEFAULT 0
);

-- ATTENDANCE_INTERNAL_DAY (iter-040) - interni schuzka v dochazce, zruseni = DELETE radku
CREATE TABLE IF NOT EXISTS attendance_internal_day (
    attendance_date DATE        PRIMARY KEY,
    created_by      UUID        REFERENCES member(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NASTAVENI CHAPTERU (iter-042) - zdroj pravdy pro DDL je scripts/migrate-iter-042-nastaveni.ts
CREATE TABLE IF NOT EXISTS chapter_settings (
    id                 SMALLINT    PRIMARY KEY DEFAULT 1,
    mastermind_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
    burza_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
    semafor_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
    meeting_weekday    SMALLINT    NOT NULL DEFAULT 4,
    meeting_time       TIME        NOT NULL DEFAULT '07:30',
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by         UUID        REFERENCES member(id) ON DELETE SET NULL,
    CONSTRAINT chapter_settings_singleton CHECK (id = 1),
    CONSTRAINT chapter_settings_weekday CHECK (meeting_weekday BETWEEN 0 AND 6),
    CONSTRAINT chapter_settings_time CHECK (meeting_time BETWEEN TIME '07:00' AND TIME '11:00')
);
INSERT INTO chapter_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- SEMAFOR (iter-041) - zdroj pravdy pro DDL je scripts/migrate-iter-041-semafor.ts
CREATE TABLE IF NOT EXISTS semafor_import (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    month       DATE        NOT NULL,
    uploaded_by UUID        REFERENCES member(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    file_sha256 TEXT        NOT NULL,
    row_count   INTEGER     NOT NULL,
    saved_count INTEGER     NOT NULL,
    CONSTRAINT semafor_import_month_first CHECK (month = date_trunc('month', month::timestamp)::date),
    CONSTRAINT semafor_import_sha CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT semafor_import_counts CHECK (row_count >= 0 AND saved_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_semafor_import_month ON semafor_import (month, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_semafor_import_sha ON semafor_import (file_sha256);

CREATE TABLE IF NOT EXISTS semafor_score (
    month                 DATE         NOT NULL,
    member_id             UUID         NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    import_id             UUID         REFERENCES semafor_import(id) ON DELETE SET NULL,
    total_score           NUMERIC(5,2) NOT NULL,
    attendance_rate       NUMERIC(6,4),
    attendance_score      NUMERIC(5,2),
    ceu_rate              NUMERIC(8,3),
    ceu_score             NUMERIC(5,2),
    one_to_one_rate       NUMERIC(8,3),
    one_to_one_score      NUMERIC(5,2),
    referrals_given_rate  NUMERIC(8,3),
    referrals_given_score NUMERIC(5,2),
    tyfcb                 NUMERIC(14,2),
    tyfcb_score           NUMERIC(5,2),
    visitors              NUMERIC(10,3),
    visitor_score         NUMERIC(5,2),
    sponsors              NUMERIC(10,3),
    sponsor_score         NUMERIC(5,2),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (month, member_id),
    CONSTRAINT semafor_score_month_first CHECK (month = date_trunc('month', month::timestamp)::date),
    CONSTRAINT semafor_score_total CHECK (total_score BETWEEN 0 AND 100),
    CONSTRAINT semafor_score_attendance_rate CHECK (attendance_rate IS NULL OR attendance_rate BETWEEN 0 AND 1),
    CONSTRAINT semafor_score_scores CHECK (
      (attendance_score IS NULL OR attendance_score BETWEEN 0 AND 100)
      AND (ceu_score IS NULL OR ceu_score BETWEEN 0 AND 100)
      AND (one_to_one_score IS NULL OR one_to_one_score BETWEEN 0 AND 100)
      AND (referrals_given_score IS NULL OR referrals_given_score BETWEEN 0 AND 100)
      AND (tyfcb_score IS NULL OR tyfcb_score BETWEEN 0 AND 100)
      AND (visitor_score IS NULL OR visitor_score BETWEEN 0 AND 100)
      AND (sponsor_score IS NULL OR sponsor_score BETWEEN 0 AND 100)
    ),
    CONSTRAINT semafor_score_rates CHECK (
      (ceu_rate IS NULL OR ceu_rate BETWEEN 0 AND 1000)
      AND (one_to_one_rate IS NULL OR one_to_one_rate BETWEEN 0 AND 1000)
      AND (referrals_given_rate IS NULL OR referrals_given_rate BETWEEN 0 AND 1000)
    ),
    CONSTRAINT semafor_score_counts CHECK (
      (tyfcb IS NULL OR tyfcb >= 0)
      AND (visitors IS NULL OR visitors >= 0)
      AND (sponsors IS NULL OR sponsors >= 0)
    )
);
CREATE INDEX IF NOT EXISTS idx_semafor_score_member ON semafor_score (member_id, month DESC);

CREATE TABLE IF NOT EXISTS semafor_name_alias (
    name_key   TEXT        PRIMARY KEY,
    member_id  UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    created_by UUID        REFERENCES member(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT semafor_alias_key_len CHECK (char_length(name_key) BETWEEN 2 AND 120)
);
CREATE INDEX IF NOT EXISTS idx_semafor_alias_member ON semafor_name_alias (member_id);
