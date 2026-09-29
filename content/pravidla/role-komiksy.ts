/**
 * Minikomiksy stránky /pravidla/role (iter-030, T-011).
 *
 * Kresby R01 až R11 (bez textu) rozřezané na panely bez rámečků (rámeček
 * kreslí CSS), WebP v `public/pravidla/komiksy/role-rNN-N.webp`. Popisky
 * a alt: content-writer T-005 (tabulka „Popisky ilustrací R1 až R11"),
 * úpravy R3/3 a R11/1 podle gate T-006. `width`/`height` jsou skutečné
 * rozměry souborů (kontroluje `scripts/test-info-pages.ts`).
 */
import type { Comic, ComicPanel } from "@/lib/info-pages/types";

const DIR = "/pravidla/komiksy";

function panel(file: string, width: number, height: number, caption: string, alt: string): ComicPanel {
  return { src: `${DIR}/${file}`, width, height, caption, alt };
}

export const ROLE_COMICS = {
  R1: {
    panels: [
      panel("role-r01-1.webp", 480, 574, "Prezident vede týdenní schůzku.", "Postavička zvoní zvonkem, před ní sedí členové chapteru."),
      panel("role-r01-2.webp", 480, 576, "Každý týden mluví s konzultantem regionu.", "Postavička telefonuje u stolu s notebookem."),
      panel("role-r01-3.webp", 480, 577, "Přijaté členy vítá v chapteru.", "Postavička podává ve dveřích ruku novému člověku."),
    ],
  },
  R2: {
    panels: [
      panel("role-r02-1.webp", 480, 646, "Viceprezident vede evidenci docházky.", "Postavička odškrtává seznam u řady židlí."),
      panel("role-r02-2.webp", 480, 647, "Vede porady členského výboru.", "Pět postaviček u kulatého stolu, jedna z nich vede poradu."),
      panel("role-r02-3.webp", 480, 645, "Rozděluje úkoly a hlídá, aby se splnily.", "Postavička telefonuje u stolu."),
    ],
  },
  R3: {
    panels: [
      panel("role-r03-1.webp", 480, 468, "Členský výbor posuzuje věci společně.", "Pět postaviček u stolu čte jeden papír."),
      panel("role-r03-2.webp", 480, 469, "O členství rozhoduje hlasováním.", "Postavičky u stolu zvedají ruce k hlasování."),
      panel("role-r03-3.webp", 480, 467, "Dopis jde vždy za výbor, nikdy za jednotlivce.", "Jedna postavička předává druhé obálku s červenou pečetí."),
    ],
  },
  R4: {
    panels: [
      panel("role-r04-1.webp", 480, 646, "Konzultant regionu má náš chapter na starosti.", "Postavička s kufříkem a odznakem na šňůrce přichází ke dveřím."),
      panel("role-r04-2.webp", 480, 646, "Může být na poradách výboru.", "Postavička sedí u stolu s výborem a píše si poznámky."),
      panel("role-r04-3.webp", 480, 645, "Potvrdí, že se dodržel postup.", "Postavička ukazuje palec nahoru k dokumentu, který drží jiná postavička."),
    ],
  },
  R5: {
    panels: [
      panel("role-r05-1.webp", 560, 351, "Region BNI zakládá nové chaptery.", "Kancelář, na stěně visí mapa s červenými tečkami."),
      panel("role-r05-2.webp", 560, 351, "Regionální tým pomáhá hostům stát se členy.", "Postavička s tabletem, u mapy stojí skupinky lidí."),
    ],
  },
  R6: {
    panels: [
      panel("role-r06-1.webp", 560, 438, "Sekretář/pokladník hlídá poplatky a rozpočet.", "Postavička počítá na kalkulačce, vedle stojí pokladnička."),
      panel("role-r06-2.webp", 560, 439, "Platí účty se souhlasem prezidenta.", "Postavička podává druhé postavičce účtenku."),
    ],
  },
  R7: {
    panels: [
      panel("role-r07-1.webp", 560, 637, "Vzdělávací koordinátor chystá krátké okénko.", "Postavička mluví u flipchartu s nakreslenou žárovkou."),
      panel("role-r07-2.webp", 560, 637, "Témata ladí s cíli chapteru.", "Posluchači sedí a přikyvují."),
    ],
  },
  R8: {
    panels: [
      panel("role-r08-1.webp", 560, 494, "Koordinátor mentorů najde novému členovi mentora.", "Postavička seznamuje dva lidi."),
      panel("role-r08-2.webp", 560, 494, "Nový člen projde programem mentorů.", "Postavička jde vedle nového člena, který nese červený sešit."),
    ],
  },
  R9: {
    panels: [
      panel("role-r09-1.webp", 480, 455, "Tým hostitelů vítá hosty a náhradníky.", "Postavička podává ve dveřích ruku hostovi."),
      panel("role-r09-2.webp", 480, 454, "Ukáže hostovi, kde si sednout.", "Postavička ukazuje hostovi místo u stolu."),
      panel("role-r09-3.webp", 480, 456, "Po schůzce vysvětlí, jak se přihlásit.", "Dvě postavičky si po schůzce povídají."),
    ],
  },
  R10: {
    panels: [
      panel("role-r10-1.webp", 480, 463, "Nevíš, kdo o tvé věci rozhoduje?", "Postavička s otazníkem nad hlavou přemýšlí."),
      panel("role-r10-2.webp", 480, 458, "Podívej se, kdo má co na starosti.", "Postavička se dívá na schéma z kroužků."),
      panel("role-r10-3.webp", 480, 464, "Pak zajdeš rovnou za tím pravým.", "Dvě postavičky spolu mluví."),
    ],
  },
  R11: {
    panels: [
      panel("role-r11-1.webp", 560, 542, "Období vedení trvá šest měsíců.", "Jedna postavička předává druhé červený štafetový kolík."),
      panel("role-r11-2.webp", 560, 542, "Nové období začíná 1. 4. a 1. 10.", "Nová skupina vedení stojí pohromadě."),
    ],
  },
} satisfies Record<string, Comic>;
