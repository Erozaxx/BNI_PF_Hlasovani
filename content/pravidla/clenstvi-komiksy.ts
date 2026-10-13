/**
 * Minikomiksy stránky /pravidla/clenstvi (iter-031, T-007a).
 *
 * Kresby H0 až H4 (bez textu) z `orchestration/runs/iter-031/ilustrace/`
 * rozřezané na panely bez rámečků (rámeček kreslí CSS), WebP
 * v `public/pravidla/komiksy/clenstvi-<slot>[-<panel>].webp`. H0 je hero
 * (samostatný obrázek, 720 px), panely mají šířku 480 px jako stránka rolí.
 * H3/3 se nevyřezává (návrh T-001a sekce 6). V H2/1 je z papíru vedle
 * notebooku vymazaný zkomolený nápis, jiný text než logo „BNI" na odznaku
 * kresby nemají.
 *
 * Popisky a alt: content-writer T-005a (tabulka „Popisky ilustrací H0 až H4"),
 * schváleno beze změny v gate T-006a sekce 5. `width`/`height` jsou skutečné
 * rozměry souborů.
 */
import type { Comic, ComicPanel } from "@/lib/info-pages/types";

const DIR = "/pravidla/komiksy";

function panel(file: string, width: number, height: number, caption: string, alt: string): ComicPanel {
  return { src: `${DIR}/${file}`, width, height, caption, alt };
}

export const CLENSTVI_HERO: ComicPanel = panel(
  "clenstvi-h0.webp",
  720,
  392,
  "Ve čtvrtek ráno tě přivítají u dveří.",
  "Hostitel s červeným odznakem BNI si u dveří podává ruku s příchozím hostem. Za nimi sedí u stolů členové s kávou a usmívají se."
);

export const CLENSTVI_COMICS = {
  /** Krok `host`. */
  "H1-1": {
    panels: [
      panel(
        "clenstvi-h1-1.webp",
        480,
        616,
        "Známý tě pozve na schůzku.",
        "Dvě postavičky sedí u kávy. Člen s odznakem BNI podává druhé malou pozvánku."
      ),
    ],
  },
  /** Krok `navsteva`, dvoupanelový pruh. */
  "H1-2-3": {
    panels: [
      panel(
        "clenstvi-h1-2.webp",
        480,
        443,
        "Krátce představíš svou firmu.",
        "Host stojí u stolu mezi sedícími členy a mává jim na pozdrav."
      ),
      panel(
        "clenstvi-h1-3.webp",
        480,
        582,
        "Po schůzce si s tebou promluví hostitel.",
        "Hostitel s odznakem BNI mluví s hostem. Na stěně visí kalendář s několika dny zakroužkovanými červeně."
      ),
    ],
  },
  /** Krok `prihlaska`. */
  "H2-1": {
    panels: [
      panel(
        "clenstvi-h2-1.webp",
        480,
        616,
        "Doma vyplníš přihlášku.",
        "Postavička píše na notebooku u stolu, vedle leží papír a pero."
      ),
    ],
  },
  /** Krok `proverka`. */
  "H2-2": {
    panels: [
      panel(
        "clenstvi-h2-2.webp",
        480,
        593,
        "Výbor si může ověřit tvou firmu i reference.",
        "Člen výboru s odznakem BNI telefonuje a lupou si prohlíží obrazovku notebooku."
      ),
    ],
  },
  /** Krok `pohovor`. */
  "H2-3": {
    panels: [
      panel(
        "clenstvi-h2-3.webp",
        480,
        581,
        "Na pohovoru se ptáte navzájem.",
        "Uchazeč sedí s členy výboru u kulatého stolku s kávou a povídají si."
      ),
    ],
  },
  /** Krok `hlasovani`. */
  "H3-1": {
    panels: [
      panel(
        "clenstvi-h3-1.webp",
        480,
        612,
        "Výbor o přihlášce hlasuje.",
        "Členové výboru sedí kolem stolu a zvedají ruce. Uprostřed stolu zapadá červený dílek do skládačky."
      ),
    ],
  },
  /** Možnost `prijeti`. */
  "H3-2": {
    panels: [
      panel(
        "clenstvi-h3-2.webp",
        480,
        598,
        "Na schůzce tě uvedou mezi členy.",
        "Nový člen stojí u stolu s červeným odznakem BNI v ruce. Sedící členové tleskají."
      ),
    ],
  },
  /** Krok `orientace`. */
  "H4-1": {
    panels: [
      panel(
        "clenstvi-h4-1.webp",
        480,
        616,
        "Po schůzce zůstaneš s koordinátorem mentorů.",
        "Člen s odznakem BNI sedí u stolu s novým členem, který si prohlíží malou knížku."
      ),
    ],
  },
  /** Krok `passport`. */
  "H4-2": {
    panels: [
      panel(
        "clenstvi-h4-2.webp",
        480,
        594,
        "Passport projdeš schůzkami jeden na jednoho.",
        "Ruka člena s odznakem BNI otiskuje červené razítko do otevřené knížky. Nový člen se dívá a usmívá se."
      ),
    ],
  },
  /** Krok `check-in`. */
  "H4-3": {
    panels: [
      panel(
        "clenstvi-h4-3.webp",
        480,
        581,
        "Před obnovou si promluvíte u kávy.",
        "Nový člen a člen výboru sedí u kávy. Na stěně visí kalendář s otočenými listy."
      ),
    ],
  },
} satisfies Record<string, Comic>;
