"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePasswordSession, requirePermission } from "@/lib/auth/guards";
import { validateSettingsInput, type ChapterSettings } from "@/lib/chapter/settings";
import { settingsChangedEvent } from "@/lib/chapter/events";
import { CHAPTER_SETTINGS_TEXTS } from "@/lib/chapter/texts";
import { saveChapterSettings } from "@/lib/db/queries/chapter-settings";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { ActionResult } from "@/lib/types";

/**
 * iter-042 (B2, B5, gate BK1, security bod 2): uložení Nastavení chapteru.
 * První kroky jsou `requirePermission("chapter.settings")` a
 * `requirePasswordSession`, pak validace na serveru (den 0 až 6, čas jen ze
 * 17 hodnot; CHECK v DB je druhá pojistka). Bez transakce (LL-003): jeden SQL
 * příkaz. Ops log je až po zápisu a nikdy neshodí akci (LL-011), událost se
 * skládá uvnitř `try`. `revalidatePath("/", "layout")` obnoví menu, dashboard
 * i kalendáře.
 */

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

export interface SaveSettingsData {
  settings: ChapterSettings;
  changed: boolean;
}

export async function saveChapterSettingsAction(input: unknown): Promise<ActionResult<SaveSettingsData>> {
  const auth = await requirePermission("chapter.settings");
  if (!auth.success) return auth;
  const password = await requirePasswordSession();
  if (!password.success) return password;

  const parsed = validateSettingsInput(input);
  if (!parsed.ok) return { success: false, error: parsed.error };

  let saved;
  try {
    saved = await saveChapterSettings(parsed.value, auth.session.memberId);
  } catch (err) {
    console.error(`[chapter-settings] save failed: ${errClass(err)}`);
    return { success: false, error: CHAPTER_SETTINGS_TEXTS.saveFailed };
  }
  if (saved.kind === "missing") {
    console.error("[chapter-settings] save failed: řádek nastavení chybí (migrace neproběhla?)");
    return { success: false, error: CHAPTER_SETTINGS_TEXTS.saveFailed };
  }

  if (saved.changed) {
    try {
      const event = settingsChangedEvent(saved.before, saved.after);
      if (event) await logOpsEvent({ runId: randomUUID(), seq: 1, ...event });
    } catch (err) {
      console.error(`[chapter-settings] ops log failed: ${errClass(err)}`);
    }
    revalidatePath("/", "layout");
  }

  return { success: true, data: { settings: saved.after, changed: saved.changed } };
}
