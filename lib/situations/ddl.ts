/**
 * iter-049 (arch 4.1): DDL klientských situací jako textové konstanty. Čte je
 * migrace `scripts/migrate-iter-049-situace.ts` i SQL test nad PGlite
 * (`scripts/test-iter-049-sql.ts`), takže test ověřuje přesně stejný tvar SQL
 * jako migrace (LL-006 bod 2). Čistý modul.
 *
 * V textu žádná JS interpolace: do `DO $$ ... $$` bloku by se dostala jako bind
 * parametr, který Postgres uvnitř dollar-quoted stringu nerozpozná (LL-006).
 * Idempotentní: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
 */

export const CLIENT_SITUATION_DDL = `
CREATE TABLE IF NOT EXISTS client_situation (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  slot         SMALLINT NOT NULL,
  source_id    TEXT,
  client       TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  original     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES member(id) ON DELETE SET NULL,
  CONSTRAINT cs_slot CHECK (slot BETWEEN 1 AND 3),
  CONSTRAINT cs_member_slot UNIQUE (member_id, slot),
  CONSTRAINT cs_source_id UNIQUE (source_id),
  CONSTRAINT cs_lengths CHECK (char_length(client) <= 80
    AND char_length(title) <= 120 AND char_length(description) <= 1000)
);
`;

export const CLIENT_SITUATION_ITEM_DDL = `
CREATE TABLE IF NOT EXISTS client_situation_item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  situation_id  UUID NOT NULL REFERENCES client_situation(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  text          TEXT NOT NULL,
  imported_text TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES member(id) ON DELETE SET NULL,
  CONSTRAINT csi_kind CHECK (kind IN ('trait', 'need', 'fear', 'desire', 'related')),
  CONSTRAINT csi_text CHECK (char_length(btrim(text)) BETWEEN 1 AND 300)
);
CREATE INDEX IF NOT EXISTS csi_situation_kind_created
  ON client_situation_item (situation_id, kind, created_at, id);
`;

export const CLIENT_SITUATION_SOURCE_DDL = `
CREATE TABLE IF NOT EXISTS client_situation_source (
  member_id    UUID PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  source_name  TEXT NOT NULL,
  filled_form  BOOLEAN NOT NULL,
  competences  JSONB NOT NULL DEFAULT '[]'::jsonb,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/** Tělo v jednom `DO $$ ... $$` bloku s transakčně lokálním `lock_timeout` 5 s ('5s' doslovně). */
export function doBlock(body: string): string {
  if (body.includes("$$")) throw new Error("doBlock: tělo nesmí obsahovat $$");
  return `DO $$ BEGIN
PERFORM set_config('lock_timeout', '5s', true);
${body}
END $$`;
}
