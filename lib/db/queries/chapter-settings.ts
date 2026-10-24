/**
 * iter-042 (B5): čtení a zápis nastavení chapteru. NENÍ čistý modul
 * (importuje drizzle-orm, react a @/lib/db/*). Čistá logika je v
 * lib/chapter/settings.ts.
 *
 * Čtení: `React.cache` (jedno čtení na požadavek), žádná `unstable_cache` ani
 * Data Cache (LL-004, klient `neon` má `cache: "no-store"`). Zápis: jeden SQL
 * příkaz, bez transakce (LL-003).
 */
import { cache } from "react";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import {
  type ChapterSettings,
  resolveChapterSettings,
  settingsFromRow,
} from "@/lib/chapter/settings";

function getDb() {
  return drizzle(getSql());
}

async function readRow(): Promise<unknown> {
  const result = await getDb().execute<Record<string, unknown>>(sql`
    SELECT mastermind_enabled, burza_enabled, semafor_enabled, meeting_weekday::int AS meeting_weekday,
           to_char(meeting_time, 'HH24:MI') AS meeting_time
    FROM chapter_settings WHERE id = 1
  `);
  return result.rows[0];
}

/** Nastavení chapteru; při chybějící tabulce nebo řádku výchozí hodnoty (B5). */
export const getChapterSettings = cache(async (): Promise<ChapterSettings> => {
  return resolveChapterSettings(readRow, (message) => console.warn(message));
});

export type SaveSettingsResult =
  | { kind: "saved"; before: ChapterSettings; after: ChapterSettings; changed: boolean }
  | { kind: "missing" };

/**
 * Uloží nastavení jedním příkazem. CTE `cur` vrátí hodnoty před změnou (pro ops
 * log), `UPDATE` se provede jen při skutečné změně (`IS DISTINCT FROM`).
 * Chybějící řádek (migrace neproběhla) = `missing`, chybějící tabulka vyhodí 42P01.
 */
export async function saveChapterSettings(
  input: ChapterSettings,
  actorId: string
): Promise<SaveSettingsResult> {
  const time = input.meetingTime;
  const result = await getDb().execute<Record<string, unknown>>(sql`
    WITH cur AS (
      SELECT mastermind_enabled, burza_enabled, semafor_enabled, meeting_weekday::int AS meeting_weekday,
             to_char(meeting_time, 'HH24:MI') AS meeting_time
      FROM chapter_settings WHERE id = 1
    ),
    upd AS (
      UPDATE chapter_settings SET
        mastermind_enabled = ${input.mastermindEnabled},
        burza_enabled = ${input.burzaEnabled},
        semafor_enabled = ${input.semaforEnabled},
        meeting_weekday = ${input.meetingWeekday}::smallint,
        meeting_time = ${time}::time,
        updated_at = now(),
        updated_by = ${actorId}::uuid
      WHERE id = 1 AND (
        mastermind_enabled IS DISTINCT FROM ${input.mastermindEnabled}
        OR burza_enabled IS DISTINCT FROM ${input.burzaEnabled}
        OR semafor_enabled IS DISTINCT FROM ${input.semaforEnabled}
        OR meeting_weekday IS DISTINCT FROM ${input.meetingWeekday}::smallint
        OR meeting_time IS DISTINCT FROM ${time}::time
      )
      RETURNING id
    )
    SELECT cur.*, (SELECT count(*)::int FROM upd) AS updated FROM cur
  `);
  const row = result.rows[0];
  if (!row) return { kind: "missing" };
  const before = settingsFromRow(row);
  if (!before) return { kind: "missing" };
  return { kind: "saved", before, after: input, changed: Number(row.updated) > 0 };
}
