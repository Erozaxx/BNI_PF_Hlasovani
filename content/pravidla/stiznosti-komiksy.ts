/**
 * Ilustrace stránky /pravidla/stiznosti (iter-031, T-007c).
 *
 * Kresby S0 až S4 (bez textu) rozřezané na panely bez rámečků (rámeček
 * kreslí CSS), WebP v `public/pravidla/komiksy/stiznosti-<slot>[-<panel>].webp`
 * (T-003s 1.10). Hero S0 je samostatný obrázek, panely mají šířku 480 px.
 * Popisky a alt: content-writer T-005c (tabulka „Popisky ilustrací S0 až S4"),
 * umístění S1/3 podle gate T-006c (úpravy 10 a 11). `width`/`height` jsou
 * skutečné rozměry souborů.
 */
import type { Comic, ComicPanel } from "@/lib/info-pages/types";

const DIR = "/pravidla/komiksy";

function panel(file: string, width: number, height: number, caption: string, alt: string): ComicPanel {
  return { src: `${DIR}/${file}`, width, height, caption, alt };
}

export const STIZNOSTI_HERO: ComicPanel = panel(
  "stiznosti-s0.webp",
  720,
  394,
  "Něco tě trápí? Dveře jsou otevřené.",
  "Postavička s šedým mráčkem nad hlavou vchází otevřenými dveřmi. Uvnitř ji usměvavá postavička s odznakem zve ke stolu se dvěma šálky čaje."
);

const P = {
  s1_1: panel(
    "stiznosti-s1-1.webp",
    480,
    626,
    "Sepíšeš, co se stalo.",
    "Postavička s odznakem sedí u stolu a píše na papír. Vedle leží blok a hrnek."
  ),
  s1_2: panel(
    "stiznosti-s1-2.webp",
    480,
    612,
    "Stížnost předáš výboru.",
    "Postavička podává druhé postavičce obálku s červenou pečetí. Obě se usmívají."
  ),
  s1_3: panel(
    "stiznosti-s1-3.webp",
    480,
    566,
    "Člen výboru tě vyslechne.",
    "Dvě postavičky sedí u kulatého stolu. Jedna mluví, druhá s odznakem poslouchá a píše si poznámky. Na stole leží obálka s červenou pečetí."
  ),
  s2_1: panel(
    "stiznosti-s2-1.webp",
    480,
    602,
    "S každou stranou zvlášť.",
    "Obrázek rozdělený svislou čarou. V každé půlce sedí u stolku člen výboru s jednou postavičkou a povídají si."
  ),
  s2_2: panel(
    "stiznosti-s2-2.webp",
    480,
    590,
    "Výbor se řídí etickým kodexem.",
    "Tři postavičky s odznaky sedí u kulatého stolu nad svitkem s červeným srdcem."
  ),
  s2_3: panel(
    "stiznosti-s2-3.webp",
    480,
    602,
    "Posoudí, co se stalo a jak vážně.",
    "Postavička s odznakem čte papír přes lupu s červenou rukojetí."
  ),
  s3_1: panel(
    "stiznosti-s3-1.webp",
    480,
    610,
    "Někdy stačí se domluvit.",
    "Dvě postavičky si podávají ruce. Za nimi stojí usměvavá postavička s odznakem."
  ),
  s3_2: panel(
    "stiznosti-s3-2.webp",
    480,
    606,
    "Pomoc od mentora nebo kurz.",
    "Dvě postavičky s odznaky jdou vedle sebe. Nad nimi je šipka, která stoupá vzhůru."
  ),
  s3_3: panel(
    "stiznosti-s3-3.webp",
    480,
    590,
    "Délku zkušební doby určí výbor.",
    "Nástěnný kalendář s řadou dní označených červeně. Vedle stojí přesýpací hodiny."
  ),
  s4_1: panel(
    "stiznosti-s4-1.webp",
    480,
    538,
    "V chapteru je místo pro každého.",
    "Různorodá skupina sedí kolem kulatého stolu. Postavy mají různé účesy, jedna sedí na vozíku. Všichni se usmívají."
  ),
  s4_2: panel(
    "stiznosti-s4-2.webp",
    480,
    536,
    "Obtěžování BNI netoleruje.",
    "Postavička s odznakem stojí mezi dvěma sedícími a klidně zvedá obě dlaně."
  ),
};

/** Komiksy podle místa na stránce (arch T-001c sekce 7, gate T-006c úpravy 10 a 11). */
export const STIZNOSTI_COMICS = {
  pisemnaStiznost: { panels: [P.s1_1, P.s1_2] },
  rozhovory: { panels: [P.s1_3, P.s2_1] },
  posouzeni: { panels: [P.s2_2, P.s2_3] },
  domluva: { panels: [P.s3_1, P.s3_2] },
  zkusebniDoba: { panels: [P.s3_3] },
  respekt: { panels: [P.s4_1, P.s4_2] },
} satisfies Record<string, Comic>;
