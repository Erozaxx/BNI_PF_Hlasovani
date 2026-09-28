/**
 * Minikomiksy ke krokům stránky /pravidla/absence (iter-029, T-010k).
 *
 * Kresby jsou panely z infografiky uživatele (verze 1) bez textu a bez
 * rámečků, v `public/pravidla/komiksy/`. Text panelu (`caption`) je HTML
 * v ručním písmu, drží se tabulky z briefu T-010k (schvaluje uživatel).
 * `alt` popisuje kresbu. `width`/`height` jsou skutečné rozměry PNG
 * (kontroluje `scripts/test-info-pages.ts`).
 *
 * Krok `vysledek`: pruh má v originále jeden rámeček se dvěma scénami,
 * rozdělen u šipky na dva panely (rozhodnutí orchestrátora, T-010k2).
 */
import type { Comic, ComicPanel } from "@/lib/info-pages/types";

const DIR = "/pravidla/komiksy";

function panel(file: string, width: number, height: number, caption: string, alt: string): ComicPanel {
  return { src: `${DIR}/${file}`, width, height, caption, alt };
}

export const ABSENCE_HERO: ComicPanel = panel(
  "hero-1.png",
  324,
  180,
  "Stejná pravidla pro všechny. Jasná a férová.",
  "Dvě postavičky u stolního kalendáře. Jedna se usmívá a ukazuje palec nahoru, druhá se tváří nejistě."
);

export const ABSENCE_COMICS: Record<string, Comic> = {
  uvod: {
    panels: [
      panel("uvod-1.png", 91, 76, "Každý čtvrtek se potkáváme.", "Usměvavá postavička mává."),
      panel(
        "uvod-2.png",
        112,
        76,
        "Poznáváme se, doporučujeme si a rosteme společně.",
        "Tři postavičky spolu mluví, jedna gestikuluje."
      ),
      panel("uvod-3.png", 90, 76, "Tvoje účast má smysl.", "Usměvavá postavička drží u srdce červené srdíčko."),
    ],
  },
  nahradnik: {
    panels: [
      panel("nahradnik-1.png", 105, 75, "Ve čtvrtek nemůžu na schůzku.", "Postavička telefonuje a tváří se ustaraně."),
      panel("nahradnik-2.png", 105, 75, "Pošlu za sebe náhradníka.", "Postavička se usmívá a mává."),
      panel(
        "nahradnik-3.png",
        91,
        75,
        "Skvěle. To se nepočítá jako absence.",
        "Usměvavá postavička ukazuje palec nahoru."
      ),
    ],
  },
  "prvni-absence": {
    panels: [
      panel(
        "prvni-absence-1.png",
        152,
        73,
        "Po první absenci ti přijde e-mail.",
        "Postavička sedí u notebooku, vedle je obálka e-mailu."
      ),
      panel(
        "prvni-absence-2.png",
        157,
        73,
        "A ozve se ti někdo z výboru, jestli je všechno v pořádku.",
        "Usměvavá postavička telefonuje."
      ),
    ],
  },
  "druha-absence": {
    panels: [
      panel("druha-absence-1.png", 152, 66, "Po druhé absenci ti zavoláme.", "Postavička telefonuje."),
      panel(
        "druha-absence-2.png",
        157,
        66,
        "A pošleme ti varovný dopis.",
        "Postavička drží dopis s červeným vykřičníkem."
      ),
    ],
  },
  "treti-absence": {
    panels: [
      panel("treti-absence-1.png", 65, 64, "1. absence", "Postavička se tváří vážně."),
      panel("treti-absence-2.png", 64, 64, "2. absence", "Postavička se tváří smutně."),
      panel(
        "treti-absence-3.png",
        85,
        64,
        "3. absence, pořád v limitu.",
        "Usměvavá postavička ukazuje palec nahoru."
      ),
      panel(
        "treti-absence-4.png",
        78,
        64,
        "4. absence už je nad limit.",
        "Překvapená postavička, kolem hlavy červené čárky."
      ),
    ],
  },
  volno: {
    panels: [
      panel("volno-1.png", 91, 67, "Čeká mě náročné období.", "Smutná postavička."),
      panel(
        "volno-2.png",
        110,
        67,
        "Požádám předem o volno.",
        "Smutná postavička u notebooku, nad ním deštník."
      ),
      panel(
        "volno-3.png",
        100,
        67,
        "Volno se schválí a absence se nepočítá.",
        "Usměvavá postavička ukazuje palec nahoru."
      ),
    ],
  },
  "ctvrta-absence": {
    panels: [
      panel("ctvrta-absence-1.png", 145, 57, "Po čtvrté absenci může výbor začít jednat.", "Smutná postavička."),
      panel(
        "ctvrta-absence-2.png",
        165,
        57,
        "Není to automatické. Vždy záleží na okolnostech.",
        "Tři členové výboru sedí za stolem."
      ),
    ],
  },
  slyseni: {
    panels: [
      panel(
        "slyseni-1.png",
        113,
        61,
        "Pozveme tě na rozhovor.",
        "Dvě postavičky sedí proti sobě u stolu s notebooky."
      ),
      panel("slyseni-2.png", 87, 63, "Můžeš říct, jak to vidíš ty.", "Postavička mluví a gestikuluje."),
      panel(
        "slyseni-3.png",
        98,
        63,
        "Z rozhovoru se pořídí písemný záznam.",
        "Postavička sedí u stolu a píše poznámky."
      ),
    ],
  },
  hlasovani: {
    panels: [
      panel(
        "hlasovani-1.png",
        168,
        57,
        "Členský výbor situaci prodiskutuje.",
        "Tři členové výboru diskutují u stolu s notebooky."
      ),
      panel(
        "hlasovani-2.png",
        142,
        60,
        "A rozhodne společným hlasováním.",
        "Tři členové výboru, dva zvedají ruku k hlasování."
      ),
    ],
  },
  vysledek: {
    panels: [
      panel("vysledek-1.png", 135, 62, "Nejdřív ti zavoláme.", "Postavička telefonuje."),
      panel(
        "vysledek-2.png",
        140,
        62,
        "A potom ti pošleme oficiální dopis.",
        "Postavička drží dopis, vedle je červená obálka."
      ),
    ],
  },
  // Karty rozcestí A: jen ilustrace, bez popisku.
  "chodis-dal": {
    panels: [
      panel(
        "chodis-dal-1.png",
        200,
        83,
        "",
        "Usměvavá postavička ukazuje palec nahoru, zelené pozadí."
      ),
    ],
  },
  "potrebujes-volno": {
    panels: [
      panel(
        "potrebujes-volno-1.png",
        203,
        83,
        "",
        "Postavička odpočívá v lehátku, nad ní deštník, modré pozadí."
      ),
    ],
  },
  "odchod-s-kreditem": {
    panels: [
      panel(
        "odchod-s-kreditem-1.png",
        203,
        83,
        "",
        "Postavička mává na rozloučenou, růžové pozadí."
      ),
    ],
  },
};
