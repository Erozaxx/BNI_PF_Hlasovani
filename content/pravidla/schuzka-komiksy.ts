/**
 * Ilustrace stránky /pravidla/schuzka (iter-031, T-007d).
 *
 * C0 až C5 jsou sloty kreseb (ne položky „U nás v chapteru" s id C*).
 * Kresby bez textu z `orchestration/runs/iter-031/ilustrace/c0..c5.jpg`
 * rozřezané na panely bez rámečků (rámeček kreslí CSS), WebP
 * v `public/pravidla/komiksy/schuzka-*.webp`: panely široké 480 px jako
 * na stránce rolí, C0 (`hero`) 720 px, C5 (`comicWide`) celý bez ořezu
 * 960 px. Popisky a alt: content-writer T-005d (tabulka „Popisky ilustrací
 * C0 až C5"), C3 v tykání podle gate T-006d úpravy 3.4. `width`/`height`
 * jsou skutečné rozměry souborů.
 */
import type { Comic, ComicPanel } from "@/lib/info-pages/types";

const DIR = "/pravidla/komiksy";

function panel(file: string, width: number, height: number, caption: string, alt: string): ComicPanel {
  return { src: `${DIR}/${file}`, width, height, caption, alt };
}

/** C0: úvodní ilustrace u H1. */
export const SCHUZKA_HERO: ComicPanel = panel(
  "schuzka-c0.webp",
  720,
  392,
  "Dobré ráno! Za chvíli začínáme.",
  "Ráno v místnosti na schůzky. Za oknem vychází slunce, na stolku je konvice s kávou a hrnky. Členové s taškami přicházejí, mávají si a podávají si ruce."
);

/** C1 až C4: komiksy kroků. Panely C2 stránka rozdělí do tří kroků (po jednom). */
export const SCHUZKA_COMICS = {
  C1: {
    panels: [
      panel(
        "schuzka-c1-1.webp",
        480,
        470,
        "Přijdeš včas, s kávou v ruce.",
        "Postavička s taškou přes rameno a hrnkem kávy vchází do místnosti, na zdi visí hodiny."
      ),
      panel(
        "schuzka-c1-2.webp",
        480,
        470,
        "Před začátkem pozdravíš ostatní.",
        "Čtyři postavičky stojí u stolku s konvicí, povídají si a vyměňují si vizitky."
      ),
      panel(
        "schuzka-c1-3.webp",
        480,
        470,
        "Hostitel vítá hosty u dveří.",
        "Postavička se jmenovkou zve dál příchozího hosta s kufříkem, který mává ve dveřích."
      ),
    ],
  },
  C2: {
    panels: [
      panel(
        "schuzka-c2-1.webp",
        480,
        470,
        "Na představení máš 30 sekund.",
        "Členové sedí u kulatého stolu, jeden stojí a mluví. Na stole jsou přesýpací hodiny."
      ),
      panel(
        "schuzka-c2-2.webp",
        480,
        470,
        "Hlavní prezentace trvá 5 minut.",
        "Postavička mluví u flipchartu se sloupcovým grafem, členové sedí a poslouchají."
      ),
      panel(
        "schuzka-c2-3.webp",
        480,
        470,
        "Pak přijde řada na doporučení.",
        "Člen u stolu podává druhému lístek s červeným srdcem. V pozadí si dva lidé podávají ruce."
      ),
    ],
  },
  C3: {
    panels: [
      panel(
        "schuzka-c3-1.webp",
        480,
        540,
        "Domluvíš si za sebe náhradníka.",
        "Postavička s kufrem u dveří telefonuje, vedle ní stojí druhá postavička."
      ),
      panel(
        "schuzka-c3-2.webp",
        480,
        540,
        "Náhradník řekne tvoje představení.",
        "U kulatého stolu sedí náhradník s kartičkou BNI v ruce, členové mu mávají na přivítanou."
      ),
    ],
  },
  C4: {
    panels: [
      panel(
        "schuzka-c4-1.webp",
        480,
        470,
        "Otevřená a interní schůzka se střídají.",
        "Člen ukazuje na nástěnný kalendář, kde se střídají týdny s otevřenými a se zavřenými dveřmi."
      ),
      panel(
        "schuzka-c4-2.webp",
        480,
        470,
        "Na otevřenou schůzku chodí hosté.",
        "Otevřenými dveřmi přicházejí hosté s taškami, hostitel je vítá a podává jim ruku."
      ),
      panel(
        "schuzka-c4-3.webp",
        480,
        470,
        "Interní schůzka je bez hostů.",
        "Za zavřenými dveřmi sedí členové u stolu a mluví spolu. Za nimi visí nástěnka s lístečky."
      ),
    ],
  },
} satisfies Record<string, Comic>;

/** C5: jeden široký panel pod C4 v kroku `rytmus` (`comicWide`). */
export const SCHUZKA_C5: ComicPanel = panel(
  "schuzka-c5.webp",
  960,
  520,
  "Ostatní chaptery se inspirují.",
  "Lidé s taškami se dívají oknem na členy u stolu a na kalendář se střídajícími se dveřmi. Nad hlavami jim svítí žárovky."
);
