/**
 * iter-042 (B5, security bod 6): ops událost `settings.changed`. Čistý modul.
 *
 * Bez `memberId`, `memberName`, `email` a bez `actor`: kdo nastavení změnil,
 * je v `chapter_settings.updated_by`. `detail` nese jen názvy změněných sloupců
 * a jejich nové hodnoty (`/status` vidí i moderátor).
 */
import { SETTINGS_COLUMN, type ChapterSettings, changedSettingKeys } from "@/lib/chapter/settings";
import type { OpsEventInput } from "@/lib/ops/types";

export const SETTINGS_CHANGED_MESSAGE = "Nastavení chapteru změněno";

/** Vstup bez `runId` a `seq` (doplní akce), nebo `null`, když se nic nezměnilo. */
export function settingsChangedEvent(
  before: ChapterSettings,
  after: ChapterSettings
): Omit<OpsEventInput, "runId" | "seq"> | null {
  const changed = changedSettingKeys(before, after);
  if (changed.length === 0) return null;
  const detail: Record<string, unknown> = { changed };
  for (const key of Object.keys(SETTINGS_COLUMN) as (keyof ChapterSettings)[]) {
    const column = SETTINGS_COLUMN[key];
    if (changed.includes(column)) detail[column] = after[key];
  }
  return {
    source: "gui",
    kind: "settings.changed",
    severity: "info",
    message: SETTINGS_CHANGED_MESSAGE,
    detail,
  };
}
