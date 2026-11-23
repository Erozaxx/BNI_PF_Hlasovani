/**
 * iter-049 (arch 5.2 bod 5): SQL importu jako textové konstanty s pozičními
 * parametry. Čte je skript `scripts/import-iter-049-situace.ts` i PGlite test
 * (`scripts/test-iter-049-sql.ts`, test 24), takže test běží nad stejným textem.
 *
 * Tři příkazy bez transakce (LL-003), každý sám atomický a idempotentní.
 * Vstup jde jako bind parametr, žádná interpolace. Jediné místo v aplikaci, kde
 * se zapisuje `original` (jen tam, kde je `NULL`), proto je tenhle SQL mimo
 * `lib/db/queries/client-situations.ts`.
 *
 * `IMPORT_SITUATIONS_SQL`: $1 situace (jsonb), $2 kartičky (jsonb), $3 čas
 * importu (timestamptz). Řádek založený mezitím (prázdný, bez `original` a
 * `source_id`) dostane `original` a `source_id`; `title` a `description` se
 * doplní jen tam, kde jsou prázdné, takže text, který člen mezitím napsal,
 * zůstane. Situace, kterou už má jiný import, se nepřepíše. Kartičky jdou jen
 * k situacím z `RETURNING`, druhý běh nezdvojí nic.
 */

export const IMPORT_SITUATIONS_SQL = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb)
    AS x(source_id text, member_id uuid, slot smallint, title text, description text, original jsonb)
), input_items AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb)
    AS x(source_id text, kind text, text text, ord int)
), ins AS (
  INSERT INTO client_situation (member_id, slot, source_id, title, description, original)
  SELECT member_id, slot, source_id, title, description, original FROM input
  ON CONFLICT (member_id, slot) DO UPDATE
     SET original = EXCLUDED.original,
         source_id = EXCLUDED.source_id,
         title = CASE WHEN client_situation.title = '' THEN EXCLUDED.title ELSE client_situation.title END,
         description = CASE WHEN client_situation.description = '' THEN EXCLUDED.description ELSE client_situation.description END
   WHERE client_situation.original IS NULL AND client_situation.source_id IS NULL
  RETURNING id, source_id
), items AS (
  INSERT INTO client_situation_item (situation_id, kind, text, imported_text, created_at, updated_at)
  SELECT ins.id, ii.kind, ii.text, ii.text,
         $3::timestamptz + ii.ord * interval '1 millisecond',
         $3::timestamptz + ii.ord * interval '1 millisecond'
    FROM ins JOIN input_items ii ON ii.source_id = ins.source_id
  RETURNING id
)
SELECT (SELECT count(*)::int FROM ins) AS situations, (SELECT count(*)::int FROM items) AS items
`;

/** $1 zdroje (jsonb). Existující řádek zdroje se nemění. */
export const IMPORT_SOURCES_SQL = `
INSERT INTO client_situation_source (member_id, source_name, filled_form, competences)
SELECT member_id, source_name, filled_form, competences
  FROM jsonb_to_recordset($1::jsonb)
    AS x(member_id uuid, source_name text, filled_form boolean, competences jsonb)
ON CONFLICT (member_id) DO NOTHING
RETURNING member_id
`;

/**
 * Prázdné sloty 1 až 3 pro všechny AKTIVNÍ členy, až po `IMPORT_SITUATIONS_SQL`. Bez parametrů.
 * Podmínka aktivity opisuje `memberActiveSql` z `lib/db/queries/member-active.ts`, při změně
 * pravidla aktivity upravit obě místa (review N-2).
 */
export const IMPORT_EMPTY_SLOTS_SQL = `
INSERT INTO client_situation (member_id, slot)
SELECT m.id, g.slot::smallint
  FROM member m CROSS JOIN generate_series(1, 3) AS g(slot)
 WHERE (m.deactivated_at IS NULL
        OR COALESCE(m.inactive_until < (now() AT TIME ZONE 'Europe/Prague')::date, false))
ON CONFLICT (member_id, slot) DO NOTHING
RETURNING id
`;

/** Kontrola po zápisu: $1 pole `source_id` ze souboru (text[]). */
export const IMPORT_VERIFY_SQL = `
SELECT (SELECT count(*)::int FROM client_situation WHERE source_id = ANY($1::text[])) AS situations,
       (SELECT count(*)::int FROM client_situation_item i
          JOIN client_situation s ON s.id = i.situation_id
         WHERE s.source_id = ANY($1::text[]) AND i.imported_text IS NOT NULL) AS items
`;
