/**
 * iter-044 (arch 5.4): DDL tabulek vlastních bodů semaforu jako textové
 * konstanty. Čte je migrace `scripts/migrate-iter-044-vlastni-body.ts` i SQL
 * test nad PGlite (`scripts/test-iter-044-semafor-sql.ts`), takže test ověřuje
 * přesně stejný tvar SQL jako migrace (LL-006 bod 2).
 *
 * Čistý modul. V textu DDL žádná JS interpolace: do `DO $$ … $$` bloku by se
 * dostala jako bind parametr, který Postgres uvnitř dollar-quoted stringu
 * nerozpozná (LL-006 bod 1). `doBlock` jen spojuje řetězce do jednoho textu.
 *
 * Idempotentní: `CREATE … IF NOT EXISTS`. Zdroj pravdy pro DDL je tenhle soubor,
 * `lib/db/schema.ts` ho zrcadlí pro Drizzle.
 */

export const ACTIVITY_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS semafor_activity (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  held_on     DATE        NOT NULL,
  created_by  UUID        REFERENCES member(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sa_title_len CHECK (char_length(btrim(title)) BETWEEN 3 AND 120)
);
CREATE INDEX IF NOT EXISTS idx_sa_held_on ON semafor_activity (held_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sa_dup ON semafor_activity (held_on, lower(btrim(title)));
`;

export const POINT_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS semafor_point (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  category      TEXT        NOT NULL,
  earned_on     DATE        NOT NULL,
  earned_month  DATE        NOT NULL,
  points        SMALLINT,
  note          TEXT,
  ref_member_id UUID        REFERENCES member(id) ON DELETE CASCADE,
  activity_id   UUID        REFERENCES semafor_activity(id) ON DELETE CASCADE,
  created_by    UUID        REFERENCES member(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sp_category CHECK (category IN ('training', 'thanks', 'host_member', 'activity', 'work')),
  CONSTRAINT sp_month CHECK (earned_month = date_trunc('month', earned_on::timestamp)::date),
  CONSTRAINT sp_points CHECK (
    (category = 'work' AND points IS NOT NULL AND points BETWEEN 1 AND 20)
    OR (category <> 'work' AND points IS NULL)
  ),
  CONSTRAINT sp_note_len CHECK (note IS NULL OR char_length(note) <= 300),
  CONSTRAINT sp_note_required CHECK (
    category NOT IN ('thanks', 'training', 'work') OR char_length(btrim(coalesce(note, ''))) >= 3
  ),
  CONSTRAINT sp_ref CHECK ((category = 'host_member') = (ref_member_id IS NOT NULL)),
  CONSTRAINT sp_ref_not_self CHECK (ref_member_id IS NULL OR ref_member_id <> member_id),
  CONSTRAINT sp_activity CHECK ((category = 'activity') = (activity_id IS NOT NULL)),
  CONSTRAINT sp_not_self CHECK (created_by IS NULL OR created_by <> member_id)
);
`;

export const POINT_INDEXES_DDL = `
CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_thanks ON semafor_point (created_by, member_id, earned_month) WHERE category = 'thanks';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_training ON semafor_point (member_id, earned_on) WHERE category = 'training';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_host_member ON semafor_point (ref_member_id) WHERE category = 'host_member';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_activity ON semafor_point (activity_id, member_id) WHERE category = 'activity';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_work ON semafor_point (member_id, created_by, earned_on, md5(lower(btrim(note)))) WHERE category = 'work';
CREATE INDEX IF NOT EXISTS idx_sp_member_earned ON semafor_point (member_id, earned_on);
CREATE INDEX IF NOT EXISTS idx_sp_earned ON semafor_point (earned_on);
CREATE INDEX IF NOT EXISTS idx_sp_created_by ON semafor_point (created_by);
`;

/** Obě tabulky a všechny indexy v pořadí závislostí. */
export const ALL_POINTS_DDL = `${ACTIVITY_TABLE_DDL}${POINT_TABLE_DDL}${POINT_INDEXES_DDL}`;

/** Názvy CHECK, které migrace kontroluje (`semafor_point`). */
export const POINT_CHECKS = [
  "sp_category",
  "sp_month",
  "sp_points",
  "sp_note_len",
  "sp_note_required",
  "sp_ref",
  "sp_ref_not_self",
  "sp_activity",
  "sp_not_self",
] as const;

/** Částečné UNIQUE indexy (název → literál kategorie, který `indexdef` musí obsahovat). */
export const POINT_UNIQUES: Record<string, string> = {
  uq_sp_thanks: "'thanks'",
  uq_sp_training: "'training'",
  uq_sp_host_member: "'host_member'",
  uq_sp_activity: "'activity'",
  uq_sp_work: "'work'",
};

/** Unikátní index akcí (datum a název bez ohledu na velikost písmen a mezery na krajích). */
export const ACTIVITY_UNIQUE = "uq_sa_dup";

/**
 * Tělo zabalené do jednoho `DO $$ … $$` bloku s transakčně lokálním
 * `lock_timeout` 5 s. Hodnota '5s' je doslovná, `body` je hotový text bez `$$`.
 */
export function doBlock(body: string): string {
  if (body.includes("$$")) throw new Error("doBlock: tělo nesmí obsahovat $$");
  return `DO $$ BEGIN
PERFORM set_config('lock_timeout', '5s', true);
${body}
END $$`;
}

/**
 * Smoke test (LL-006 bod 2): stejný DDL na dočasných tabulkách. Názvy tabulek,
 * indexů a odkaz na `member` se přepíšou, tvar (CHECK, FK CASCADE a SET NULL,
 * částečné i výrazové UNIQUE) zůstává stejný. Na konci se tabulky zahodí.
 */
export function smokeDdl(): string {
  const t = ALL_POINTS_DDL.replace(/CREATE TABLE IF NOT EXISTS/g, "CREATE TEMPORARY TABLE")
    .replace(/semafor_activity/g, "_iter044_activity_smoke")
    .replace(/semafor_point/g, "_iter044_point_smoke")
    .replace(/REFERENCES member\(id\)/g, "REFERENCES _iter044_member_smoke(id)")
    .replace(/idx_sa_/g, "_smoke_idx_sa_")
    .replace(/idx_sp_/g, "_smoke_idx_sp_")
    .replace(/uq_sp_/g, "_smoke_uq_sp_")
    .replace(/uq_sa_/g, "_smoke_uq_sa_");
  return `CREATE TEMPORARY TABLE _iter044_member_smoke (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
${t}
DROP TABLE _iter044_point_smoke;
DROP TABLE _iter044_activity_smoke;
DROP TABLE _iter044_member_smoke;`;
}
