/**
 * Ilustrace stránky /pravidla/obor (iter-031, T-007b).
 *
 * Kresby O0 až O4 (bez textu) rozřezané na panely bez rámečků (rámeček
 * kreslí CSS), WebP v `public/pravidla/komiksy/obor-*.webp`, postup jako
 * iter-030 T-011 (arch_iter-031_T-003s 1.10). Panel O3/3 se nepoužívá
 * (gate T-004 b K8). O1 a O4 jsou rozdělené do dvou kroků (gate b K6).
 * Popisky a alt: content-writer T-005b (tabulka „Popisky ilustrací O0 až O4"),
 * O1/3 podle gate T-006b úprava 6. `width`/`height` jsou skutečné rozměry
 * souborů.
 */
import type { Comic, ComicPanel } from "@/lib/info-pages/types";

const DIR = "/pravidla/komiksy";

function panel(file: string, width: number, height: number, caption: string, alt: string): ComicPanel {
  return { src: `${DIR}/${file}`, width, height, caption, alt };
}

/** O0: úvodní ilustrace u nadpisu. */
export const OBOR_HERO: ComicPanel = panel(
  "obor-o0.webp",
  720,
  392,
  "Každý obor má u stolu jednu židli.",
  "Kulatý stůl, kolem sedí členové chapteru. Na opěradlech židlí jsou obrázky oborů: zub, kladivo, fotoaparát, dům, štětec a auto. Jedna židle je prázdná a nakreslená čárkovaně."
);

/** Komiksy podle kroku, kde stojí (klíč = id kroku). */
export const OBOR_COMICS = {
  /** O1, panely 1 a 2. */
  "jeden-obor": {
    panels: [
      panel(
        "obor-o1-1.webp",
        480,
        609,
        "Obor je obsazený. Host se přihlásit nemůže.",
        "U stolu sedí člen na židli s fotoaparátem na opěradle. Ve dveřích stojí další dva lidé, oba drží ceduli s fotoaparátem."
      ),
      panel(
        "obor-o1-2.webp",
        480,
        609,
        "Každý člen má jeden obor.",
        "Usměvavý člen sedí mezi ostatními a ukazuje jmenovku s jedním obrázkem kladiva."
      ),
    ],
  },
  /** O1, panel 3 (gate T-006b, úprava 6). */
  "hlavni-profese": {
    panels: [
      panel(
        "obor-o1-3.webp",
        480,
        604,
        "Zastupuješ jen svou hlavní profesi.",
        "Člen žongluje s obrázky domu, zubu a fotoaparátu. Vedle něj druhý člen sbírá ze země jen domek."
      ),
    ],
  },
  /** O2, panely 1 až 3. */
  "zmena-oboru": {
    panels: [
      panel(
        "obor-o2-1.webp",
        480,
        622,
        "Chceš v chapteru zastupovat jiný obor.",
        "Člen se jmenovkou s fotoaparátem sedí a v bublině myslí na domek."
      ),
      panel(
        "obor-o2-2.webp",
        480,
        608,
        "Podáš novou přihlášku.",
        "Člen u stolu vyplňuje formulář BNI. V bublině má přeškrtnutý fotoaparát a šipku k domku."
      ),
      panel(
        "obor-o2-3.webp",
        480,
        600,
        "Nový obor schvaluje výbor.",
        "Tři členové výboru čtou formulář, jeden ukazuje palec nahoru. Vedle stojí člen s novou jmenovkou s domkem."
      ),
    ],
  },
  /** O3, panely 1 a 2 (panel 3 se nepoužívá). */
  "spor-o-obor": {
    panels: [
      panel(
        "obor-o3-1.webp",
        480,
        646,
        "Dva obory se v něčem překrývají.",
        "Dva členové se zamyšleně dívají na domek. Na jedné polovině je váleček, na druhé štětec, uprostřed se překrývají. Nad domkem je otazník."
      ),
      panel(
        "obor-o3-2.webp",
        480,
        600,
        "Obavu přijme člen výboru pro vztahy mezi členy.",
        "Panel rozdělený čárou. Na obou stranách sedí u stolku dva lidé, jeden mluví a druhý poslouchá."
      ),
    ],
  },
  /** O4, panel 1. */
  "uvolneni-oboru": {
    panels: [
      panel(
        "obor-o4-1.webp",
        480,
        473,
        "Obor je volný. Výbor to může oznámit.",
        "Tři členové výboru sedí u stolu. Jeden ukazuje na prázdnou židli nakreslenou čárkovaně."
      ),
    ],
  },
  /** O4, panel 2. */
  "chybejici-obory": {
    panels: [
      panel(
        "obor-o4-2.webp",
        480,
        472,
        "Znáš někoho z hledaného oboru? Pozvi ho.",
        "Člen chapteru vede hosta se složkou v ruce k prázdné židli u stolu."
      ),
    ],
  },
} satisfies Record<string, Comic>;
