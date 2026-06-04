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
        CHECK (status IN ('draft', 'voting', 'closed')),
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
-- VOTE IMMUTABILITY — BLOCKER-003 fix
-- Trigger zabrani vlozeni hlasu pokud schuzka neni ve stavu
-- 'voting' nebo pokud hlasovaci okno jiz vyprselo.
-- Aplikacni vrstva (castVote action) provadi stejny check —
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
