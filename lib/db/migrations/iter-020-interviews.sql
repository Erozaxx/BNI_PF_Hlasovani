-- ============================================================
-- iter-020 (T-005) — pohovory se členy (5/10 měsíců)
-- Delta migrace. Idempotentní. ŽÁDNÁ transakce (LL-003).
-- Aplikace přes scripts/migrate-iter-020-interviews.ts (vzor iter-019).
-- ============================================================

-- 1. member.joined_at — zdroj pravdy pro datum vstupu
ALTER TABLE member ADD COLUMN IF NOT EXISTS joined_at DATE;

-- 2. backfill z created_at (jen NULL → idempotentní)
UPDATE member SET joined_at = created_at::date WHERE joined_at IS NULL;

-- 3. default + NOT NULL (obojí idempotentní — SET NOT NULL na NOT NULL sloupci projde)
ALTER TABLE member ALTER COLUMN joined_at SET DEFAULT CURRENT_DATE;
ALTER TABLE member ALTER COLUMN joined_at SET NOT NULL;

-- 4. globální sada otázek
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
);
CREATE INDEX IF NOT EXISTS idx_interview_question_active_position
    ON interview_question (active, position);

-- 5. instance pohovoru
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
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_member_type_active
    ON interview (member_id, type) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_interview_member ON interview (member_id);
CREATE INDEX IF NOT EXISTS idx_interview_status ON interview (status);
CREATE INDEX IF NOT EXISTS idx_interview_leader ON interview (leader_id);

-- 6. snapshot otázek (zamrazení při založení)
--    position = hustý rank přiřazený při kopii (ne surová position živé sady)
--    iqs_interview_source_unique = idempotence klíč pro ON CONFLICT DO NOTHING (MAJOR-1);
--      NULLs distinct → řádky po ON DELETE SET NULL zdroje nekolidují
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
);
CREATE INDEX IF NOT EXISTS idx_iqs_interview
    ON interview_question_snapshot (interview_id);

-- 7. odpovědi — composite FK = DB-level anti-IDOR (odpověď patří otázce svého pohovoru)
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
);
CREATE INDEX IF NOT EXISTS idx_interview_answer_interview
    ON interview_answer (interview_id);

-- 8. scoped magic link pohovoru — expires_at NOT NULL (H-3), 1 řádek per pohovor (H-9)
CREATE TABLE IF NOT EXISTS interview_link (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID        NOT NULL UNIQUE REFERENCES interview(id) ON DELETE CASCADE,
    leader_id    UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ
);

-- 9. DB-backed rate-limit (H-4) — fixed window per key
CREATE TABLE IF NOT EXISTS auth_throttle (
    key          TEXT        PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL,
    count        INTEGER     NOT NULL DEFAULT 0
);
