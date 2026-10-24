import { Card } from "@/components/ui/Card";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { CHAPTER_SETTINGS_TEXTS } from "@/lib/chapter/texts";
import { ChapterSettingsForm } from "./ChapterSettingsForm";

/**
 * iter-042 (B2, gate BK1): Nastavení chapteru. Právo `chapter.settings` má
 * admin, Prezident a Viceprezident (heslem). Člen výboru, moderátor ani
 * přihlášení odkazem stránku nevidí.
 */
export default async function ChapterSettingsPage() {
  await requirePageSession({ permission: "chapter.settings" });
  const settings = await getChapterSettings();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">{CHAPTER_SETTINGS_TEXTS.title}</h1>
      <Card>
        <ChapterSettingsForm initial={settings} />
      </Card>
    </div>
  );
}
