/**
 * iter-042 (B2, gate Z10): guardy vypnutých částí. NENÍ čistý modul (čte
 * nastavení z DB). Stránky volají `featureOff(key)` hned po kontrole session,
 * akce `requireFeature(key)` hned za kontrolou práv.
 */
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { type FeatureKey, isFeatureEnabled } from "@/lib/chapter/settings";
import { FEATURE_OFF_ACTION_TEXT } from "@/lib/chapter/texts";

/** Část je vypnutá: stránka místo obsahu ukáže `FeatureOff`. */
export async function featureOff(key: FeatureKey): Promise<boolean> {
  const settings = await getChapterSettings();
  return !isFeatureEnabled(settings, key);
}

/**
 * Akce: vrací `null`, když je část zapnutá, jinak hotové selhání, které akce
 * vrátí beze změny a nic nezapíše.
 *
 *   const off = await requireFeature("burza");
 *   if (off) return off;
 */
export async function requireFeature(key: FeatureKey): Promise<{ success: false; error: string } | null> {
  if (await featureOff(key)) return { success: false, error: FEATURE_OFF_ACTION_TEXT };
  return null;
}
