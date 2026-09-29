/**
 * Registr info stránek série „Pravidla chapteru" (arch_iter-029_T-001
 * sekce 12). Další stránka = nový datový soubor v `content/pravidla/` a
 * řádek tady. Route, middleware ani rozcestník se nemění.
 */
import { ABSENCE_PAGE } from "@/content/pravidla/absence";
import { ROLE_PAGE } from "@/content/pravidla/role";
import type { InfoPage } from "./types";

/**
 * Pořadí = pořadí v rozcestníku, stránka rolí první (iter-030, K5). Se
 * stránkou `role` v registru se na ostatních stránkách zapnou odkazy na
 * role (`roleLinksEnabled`).
 */
export const INFO_PAGES: InfoPage[] = [ROLE_PAGE as InfoPage, ABSENCE_PAGE];

export function getInfoPage(slug: string): InfoPage | undefined {
  return INFO_PAGES.find((page) => page.slug === slug);
}
