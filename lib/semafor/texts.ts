/**
 * iter-041 (gate sekce 5, doslova): texty semaforu a „Chyběl(a) bez omluvy“.
 * Aplikace tyká, nápověda vyká, diakritika, bez dlouhé pomlčky (test hlídá
 * U+2014). Kde se gate liší od sekce 11 návrhu, platí gate.
 *
 * Čistý modul. Žádné jméno ani číslo člena.
 */
import { monthOf, monthTitle } from "@/lib/attendance/rules";
import { formatCzDate } from "@/lib/members/activity";
import type { SemaforFileError } from "@/lib/semafor/errors";
import type { MatchKind } from "@/lib/semafor/names";
import type { RowError } from "@/lib/semafor/scores";
import type { SemaforColor } from "@/lib/semafor/color";
import { BONUS_CAP, BONUS_POINTS } from "@/lib/semafor/bonus";

export const SEMAFOR_TEXTS = {
  nav: "Semafor",
  tabMy: "Můj semafor",
  tabOverview: "Přehled",
  tabImport: "Import",
  myTitle: "Můj semafor",
  myIntro:
    "Skóre počítá BNI za posledních 6 měsíců, vedení ho sem nahrává jednou měsíčně. Za Master mind a pomoc v Burze pomoci k němu dostaneš bonus.",
  myNone: "Zatím není nahraný žádný měsíc.",
  bonusTitle: "Bonus za 6 měsíců",
  bonusNone:
    "Bonus zatím žádný. Dostaneš ho za odprezentovaný Master mind a za pomoc, kterou někdo v Burze pomoci označí jako využitou.",
  bonusCap: `Bonus je nejvýš ${BONUS_CAP} bodů, posune barvu nejvýš o jednu.`,
  areas: "Oblasti",
  history: "Předchozí měsíce",
  chapterTitle: "Celý chapter",
  overviewTitle: "Přehled semaforu",
  overviewInactive: "(neaktivní)",
  /** Mimo gate sekci 5: tlačítko výběru měsíce v přehledu. */
  overviewShow: "Zobrazit",
  overviewSortTotal: "Podle skóre",
  overviewSortName: "Podle jména",
  overviewColumns: ["Člen", "Barva", "Skóre", "BNI", "Bonus"] as const,
  overviewNoValue: "–",
  importTitle: "Nahrát semafor",
  importMonth: "Měsíc",
  importFile: "Soubor .xlsx s listem se skóre",
  importPreview: "Zobrazit náhled",
  importSave: "Uložit",
  importKeeps: "Z dřívějška zůstanou:",
  importSameFile: "Tenhle soubor už je nahraný. Uložení nic nezmění.",
  importMissing: "V souboru chybí aktivní členové:",
  skip: "Přeskočit",
  /** Mimo gate sekci 5: výchozí volba v selectu člena u nerozhodnutého řádku. */
  pickMember: "Vyber člena",
  deleteMonth: "Smazat měsíc",
  deleteRow: "Smazat řádek",
  aliases: "Zapamatovaná párování",
  aliasRemove: "Zapomenout",
  confirmYes: "Ano, smazat",
  confirmNo: "Nechat",
  areaNames: ["Docházka", "CEU", "1-2-1", "Doporučení", "TYFCB", "Hosté", "Sponzoři"] as const,
  colors: { green: "Zelená", yellow: "Žlutá", red: "Červená", grey: "Šedá" } as Record<SemaforColor, string>,
  matchLabels: {
    exact: "Shoda",
    alias: "Zapamatováno",
    loose: "Bez diakritiky, ověř",
    swapped: "Jiné pořadí, ověř",
    ambiguous: "Víc možností, vyber",
    none: "Nenalezeno, vyber",
    duplicate: "Dvakrát v souboru, vyber",
  } as Record<MatchKind, string>,
  /** Hláška Master mind (gate Z10). */
  mmOwnCase: "Vlastní případ potvrdí jiný člen vedení.",
  errTooBig: "Soubor je moc velký. Limit je 512 kB.",
  errNotXlsx: "Soubor není xlsx. Ulož ho v Excelu jako .xlsx.",
  errBroken: "Soubor nejde přečíst. Ulož ho v Excelu znovu jako .xlsx.",
  errChanged: "Soubor se od náhledu změnil. Zobraz náhled znovu.",
  errMonth: "Vyber měsíc, nejvýš 24 měsíců zpět.",
  /** Mimo gate sekci 5: celý soubor patří jinému chapteru. */
  errAllOtherChapter: "Soubor patří jinému chapteru.",
  /** Mimo gate sekci 5: řádek bez jména. */
  errRowNoName: "Řádek {r}: chybí jméno. Oprav soubor, nebo řádek přeskoč.",
  /** Mimo gate sekci 5: chyby uložení, které sekce nepokrývá. */
  errNoFile: "Vyber soubor .xlsx.",
  errNothingToSave: "Nic k uložení. Všechny řádky jsou přeskočené.",
  errSaveFailed: "Uložení se nepovedlo. Zkus to znovu.",
  errUndecided: "Řádek {r} čeká na rozhodnutí. Vyber člena, nebo řádek přeskoč.",
  errUnknownMember: "Řádek {r}: vybraný člen neexistuje.",
  errErrorRowSelected: "Řádek {r} má chybu a jde jen přeskočit.",
} as const;

/** Nápověda členů (vyká), gate sekce 5. */
export const HELP_SEMAFOR_MEMBER = [
  "Semafor ukazuje vaše skóre podle BNI za posledních 6 měsíců a k němu bonus za to, co děláte pro chapter. Vedení nahrává data BNI jednou měsíčně.",
  `Bonus: ${BONUS_POINTS.mastermind} bodů za odprezentovaný Master mind, ${BONUS_POINTS.burza} bodů za každou pomoc nebo kontakt, které někdo v Burze pomoci označí jako využité. Za 6 měsíců nejvýš ${BONUS_CAP} bodů.`,
  "Barvu určuje skóre s bonusem: zelená od 70 bodů, žlutá od 50, červená od 30, šedá pod 30. Vedle vidíte i barvu podle BNI bez bonusu.",
  "Své hodnoty vidíte jen vy, vedení a členský výbor. Ostatní členové vidí jen počty členů v každé barvě, bez jmen.",
  "Když vám hodnoty nesedí, ozvěte se vedení.",
] as const;

export const HELP_ATTENDANCE_MEMBER_UNEXCUSED =
  "Když nepřijdete, do 7:30 se neomluvíte a nepošlete náhradníka, zapíše vás správce docházky jako Chyběl(a) bez omluvy. Do absencí se to počítá stejně jako omluvená absence.";

/** Nápověda vedení: první tři body jen s `semafor.import` (`importOnly`). */
export const HELP_SEMAFOR_LEADERSHIP: readonly { text: string; importOnly: boolean }[] = [
  {
    importOnly: true,
    text: "Měsíční soubor .xlsx s listem se skóre nahrajete v menu Semafor, záložka Import. Vyberte měsíc, za který soubor je, a zobrazte náhled.",
  },
  {
    importOnly: true,
    text: "V náhledu zkontrolujte párování jmen. Řádky Bez diakritiky, Jiné pořadí, Víc možností a Nenalezeno potvrďte, nebo přeskočte. Ruční párování si aplikace zapamatuje na další měsíce.",
  },
  {
    importOnly: true,
    text: "Stejný měsíc můžete nahrát znovu. Členům ze souboru se hodnoty přepíšou, ostatním zůstanou. Hodnoty jednoho člena smažete v Přehledu tlačítkem Smazat řádek.",
  },
  {
    importOnly: false,
    text: `Vlastní případ v Master mindu nepotvrzujte, potvrdí ho jiný člen vedení. Odprezentovaný případ dává bonus ${BONUS_POINTS.mastermind} bodů do semaforu.`,
  },
  {
    importOnly: false,
    text: "Přehled se jmény vidí admin, prezident, viceprezident a člen výboru, import jen admin, prezident a viceprezident. Obojí jen po přihlášení heslem, po přihlášení odkazem z mailu vidíte jen svůj semafor.",
  },
];

export const HELP_ATTENDANCE_MANAGER_UNEXCUSED =
  "Chyběl(a) bez omluvy zaškrtněte u člena, který nepřišel, neomluvil se a neposlal náhradníka. Jde to od 7:30, do té doby se člen může omluvit. U omluveného člena volba není, nejdřív zrušte omluvu.";

// ── Skládání vět ──────────────────────────────────────────────

/** „září 2026“ z `YYYY-MM-DD` (první den měsíce snímku). */
export function monthLabel(month: string): string {
  const { year, month: m } = monthOf(month);
  return monthTitle(year, m);
}

/** „Skóre {n} ze 100“ (interní skóre, hlavní štítek), „Zelená · 74“. */
export function myTotalText(n: number): string {
  return `Skóre ${fmtNum(n)} ze 100`;
}

export function colorBadgeText(color: SemaforColor, score: number): string {
  return `${SEMAFOR_TEXTS.colors[color]} · ${fmtNum(score)}`;
}

export function myBniText(color: SemaforColor, total: number): string {
  return `BNI: ${SEMAFOR_TEXTS.colors[color]} · ${fmtNum(total)}`;
}

export function myBonusText(n: number): string {
  return `Bonus +${fmtNum(n)}`;
}

export function myMissingText(month: string): string {
  return `Za ${monthLabel(month)} v datech od BNI nejsi. Když to nesedí, ozvi se vedení.`;
}

export function bonusMastermindText(k: number): string {
  return `Master mind: ${k}× po ${BONUS_POINTS.mastermind} bodech`;
}

export function bonusBurzaText(k: number): string {
  return `Burza pomoci: ${k}× po ${BONUS_POINTS.burza} bodech`;
}

export function myBonusLaterText(afterDate: string, month: string): string {
  return `Master mind a Burza pomoci po ${formatCzDate(afterDate)} se započtou s daty za ${monthLabel(month)}.`;
}

export function rateWeekText(x: string): string {
  return `${x} za týden`;
}

export function chapterCountsText(
  month: string,
  c: { green: number; yellow: number; red: number; grey: number }
): string {
  return `Za ${monthLabel(month)}: zelení ${c.green}, žlutí ${c.yellow}, červení ${c.red}, šedí ${c.grey}.`;
}

export function importSummaryText(month: string, rows: number, matched: number): string {
  return `Měsíc: ${monthLabel(month)}. Řádků v souboru: ${rows}, spárováno: ${matched}.`;
}

export function importSavedText(inserted: number, updated: number, unchanged: number): string {
  return `Uloženo: nových ${inserted}, změněných ${updated}, beze změny ${unchanged}.`;
}

export function memberCountText(k: number): string {
  if (k === 1) return "1 člen";
  if (k >= 2 && k <= 4) return `${k} členové`;
  return `${k} členů`;
}

export function importExistingText(month: string, k: number, lastDate: string): string {
  const head =
    k === 1
      ? `už je nahraný ${memberCountText(k)}`
      : k >= 2 && k <= 4
        ? `už jsou nahraní ${memberCountText(k)}`
        : `už je nahráno ${memberCountText(k)}`;
  return `Za ${monthLabel(month)} ${head} (naposledy ${formatCzDate(lastDate)}). Členům ze souboru se hodnoty přepíšou, ostatním zůstanou.`;
}

export function importOtherMonthText(fileMonth: string, chosenMonth: string): string {
  return `Tenhle soubor už je nahraný za ${monthLabel(fileMonth)}. Opravdu je za ${monthLabel(chosenMonth)}?`;
}

export function importUnknownColumnText(x: string): string {
  return `Sloupec ${x} se neimportuje.`;
}

export function deleteMonthConfirmText(month: string): string {
  return `Smazat všechny hodnoty za ${monthLabel(month)}? Vrátit je půjde jen novým nahráním souboru.`;
}

export function deleteRowConfirmText(name: string, month: string): string {
  return `Smazat hodnoty člena ${name} za ${monthLabel(month)}?`;
}

export function errTwiceText(name: string): string {
  return `Člen ${name} je přiřazený ke dvěma řádkům.`;
}

const SHEETS_SHOWN = 5;
const SHEET_NAME_CHARS = 40;

/** Nejvýš 5 názvů listů po 40 znacích, zbytek jako „a další N“ (soubor může mít tisíce listů). */
function noSheetMessage(list: readonly string[], more: number): string {
  const shown = list.slice(0, SHEETS_SHOWN).map((n) => n.slice(0, SHEET_NAME_CHARS));
  const rest = more + Math.max(0, list.length - SHEETS_SHOWN);
  const names = shown.length > 0 ? shown.join(", ") + (rest > 0 ? ` a další ${rest}` : "") : "žádné";
  return `V souboru chybí list se sloupci semaforu. Listy v souboru: ${names}.`;
}

/** Hláška pro chybu souboru. Nikdy obsah buněk. */
export function fileErrorMessage(err: SemaforFileError): string {
  const list = err.params.list ?? [];
  switch (err.code) {
    case "tooBig":
      return SEMAFOR_TEXTS.errTooBig;
    case "notXlsx":
      return SEMAFOR_TEXTS.errNotXlsx;
    case "noSheet":
      return noSheetMessage(list, err.params.more ?? 0);
    case "columns":
      return `V souboru chybí sloupce: ${list.join(", ")}.`;
    case "dupColumn":
      return `Sloupec ${list[0] ?? ""} je v souboru dvakrát.`;
    case "allOtherChapter":
      return SEMAFOR_TEXTS.errAllOtherChapter;
    case "changed":
      return SEMAFOR_TEXTS.errChanged;
    case "month":
      return SEMAFOR_TEXTS.errMonth;
    case "broken":
    default:
      return SEMAFOR_TEXTS.errBroken;
  }
}

/** Hláška pro chybu řádku. Obsahuje jen číslo řádku a název sloupce z pevné tabulky. */
export function rowErrorMessage(e: RowError, r: number): string {
  switch (e.code) {
    case "otherChapter":
      return `Řádek ${r} patří jinému chapteru. Přeskoč ho.`;
    case "noName":
      return SEMAFOR_TEXTS.errRowNoName.replace("{r}", String(r));
    case "missingValue":
    case "badValue":
    default:
      return `Řádek ${r}: ${e.column ?? ""} není číslo nebo je mimo rozsah. Oprav soubor, nebo řádek přeskoč.`;
  }
}

/** Číslo pro zobrazení: celé bez desetin, jinak nejvýš dvě desetinná místa, desetinná čárka. */
export function fmtNum(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

/** Počet za týden (rate) s čárkou, nejvýš dvě desetinná místa. */
export function fmtRate(n: number): string {
  return fmtNum(n);
}

/** Celé číslo s mezerami po tisících (Kč, nezlomitelná mezera). */
export function fmtMoney(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
}

/** Procenta z poměru 0 až 1. */
export function fmtPercent(rate: number): string {
  return `${fmtNum(rate * 100)} %`;
}
