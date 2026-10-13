/**
 * Ilustrace stránky /pravidla/kodex (iter-031, T-007e).
 *
 * Kresby K0 až K7 (bez textu), každá je jeden panel. Soubor je ořezaný jen
 * o okraj vně rámečku (rámeček kreslí CSS), poměr stran zůstal, nic se
 * nedoplňovalo (pravidlo řezu, arch_iter-031_T-001e sekce 5). WebP
 * v `public/pravidla/komiksy/kodex-k<n>.webp`, K0 má šířku 720 px, K1 až K7
 * 480 px. Popisky a alt: content-writer T-005e (tabulka „Popisky ilustrací
 * K0 až K7"), alt K0 podle gate T-004e 3.3. `width`/`height` jsou skutečné
 * rozměry souborů.
 */
import type { Comic, ComicPanel } from "@/lib/info-pages/types";

const DIR = "/pravidla/komiksy";

function panel(file: string, width: number, height: number, caption: string, alt: string): ComicPanel {
  return { src: `${DIR}/${file}`, width, height, caption, alt };
}

/** K0: úvodní ilustrace u nadpisu. */
export const KODEX_HERO: ComicPanel = panel(
  "kodex-k0.webp",
  720,
  390,
  "Kodex přednesete společně ve stoje.",
  "Členové stojí spolu s novým členem."
);

/** Komiksy podle kroku, kde stojí (klíč = id kroku). Každý je jeden panel. */
export const KODEX_COMICS: Record<string, Comic> = {
  "kodex-1": {
    panels: [
      panel(
        "kodex-k1.webp",
        480,
        261,
        "Kvalita i cena podle nabídky.",
        "Postavička předává hotovou dřevěnou polici spokojenému zákazníkovi. Mezi nimi leží list s jednou červenou fajfkou."
      ),
    ],
  },
  "kodex-2": {
    panels: [
      panel(
        "kodex-k2.webp",
        480,
        259,
        "Mluvíš pravdivě.",
        "Postavička ukazuje zákazníkovi na nástěnném kalendáři zakroužkovaný den. Zákazník kývá."
      ),
    ],
  },
  "kodex-3": {
    panels: [
      panel(
        "kodex-k3.webp",
        480,
        260,
        "Dobré vztahy a důvěra.",
        "Dvě postavičky a zákazník si podávají ruce v malém kruhu. Nad nimi se vznáší červené srdce."
      ),
    ],
  },
  "kodex-4": {
    panels: [
      panel(
        "kodex-k4.webp",
        480,
        260,
        "Na doporučení se ozveš.",
        "Postavička sedí u stolu a telefonuje. V ruce drží lístek s červeným srdcem. Vedle telefonu leží seznam s odškrtnutými políčky."
      ),
    ],
  },
  "kodex-5": {
    panels: [
      panel(
        "kodex-k5.webp",
        480,
        259,
        "Pozitivní a vstřícný přístup.",
        "Jedna postavička stojí vpředu a prezentuje. Sedící členové se usmívají a tleskají."
      ),
    ],
  },
  "kodex-6": {
    panels: [
      panel(
        "kodex-k6.webp",
        480,
        260,
        "Etická pravidla tvé profese.",
        "Elektrikář v pracovním oblečení kontroluje otevřený rozvaděč. V ruce drží seznam s políčky a nad ním je malý štít."
      ),
    ],
  },
  "kodex-7": {
    panels: [
      panel(
        "kodex-k7.webp",
        480,
        257,
        "Přísnější kodex profese má přednost.",
        "Postavička v lékařském plášti drží dvě knížky, tenkou s červenou tečkou a tlustou s váhami. Usmívá se a vybírá tu tlustou."
      ),
    ],
  },
};
