/**
 * Registr info stránek série „Pravidla chapteru" (arch_iter-029_T-001
 * sekce 12). Další stránka = nový datový soubor v `content/pravidla/` a
 * řádek tady. Route, middleware ani rozcestník se nemění.
 */
import { ABSENCE_PAGE } from "@/content/pravidla/absence";
import { CLENSTVI_PAGE } from "@/content/pravidla/clenstvi";
import { KODEX_PAGE } from "@/content/pravidla/kodex";
import { OBOR_PAGE } from "@/content/pravidla/obor";
import { ROLE_PAGE } from "@/content/pravidla/role";
import { SCHUZKA_PAGE } from "@/content/pravidla/schuzka";
import { SEMAFOR_PAGE } from "@/content/pravidla/semafor";
import { STIZNOSTI_PAGE } from "@/content/pravidla/stiznosti";
import type { InfoPage } from "./types";

/**
 * Pořadí = pořadí v rozcestníku (iter-031, arch_iter-031_T-003s 1.7): role
 * první (iter-030, K5), pak od příchodu přes týdenní schůzku a docházku
 * k oboru, kodexu a sporům (iter-031 T-007e, K3 gate T-004e: kodex před
 * stížnostmi, nejdřív co člen slibuje, potom co když se něco pokazí). Se
 * stránkou `role` v registru se na ostatních stránkách zapnou odkazy na role
 * (`roleLinksEnabled`).
 */
export const INFO_PAGES: InfoPage[] = [
  ROLE_PAGE as InfoPage,
  CLENSTVI_PAGE as InfoPage,
  SCHUZKA_PAGE as InfoPage,
  ABSENCE_PAGE,
  OBOR_PAGE as InfoPage,
  KODEX_PAGE as InfoPage,
  STIZNOSTI_PAGE as InfoPage,
  // iter-044: návod celého semaforu, na konec (pořadí karet rozcestníku ostatních stránek se nemění).
  SEMAFOR_PAGE as InfoPage,
];

export function getInfoPage(slug: string): InfoPage | undefined {
  return INFO_PAGES.find((page) => page.slug === slug);
}
