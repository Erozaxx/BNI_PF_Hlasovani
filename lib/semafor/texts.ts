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
import type { AreaView } from "@/lib/semafor/mine";
import { BONUS_CAP, BONUS_POINTS, type BonusSources } from "@/lib/semafor/bonus";
import { COLOR_THRESHOLDS } from "@/lib/semafor/color";
import { DEFAULT_CHAPTER_SETTINGS } from "@/lib/chapter/settings";

export const SEMAFOR_TEXTS = {
  nav: "Semafor",
  tabMy: "Můj semafor",
  tabOverview: "Přehled",
  tabImport: "Import",
  myTitle: "Můj semafor",
  myIntro:
    "Skóre počítá BNI za posledních 6 měsíců, vedení ho sem nahrává jednou měsíčně. Za Master mind a pomoc v Burze pomoci k němu dostaneš bonus.",
  /** #16: prázdný stav bez práva importu. S právem importu viz `myNoneImport`. */
  myNone: "Zatím není nahraný žádný měsíc. Data nahrává vedení z BNI.",
  myNoneImport: "Zatím není nahraný žádný měsíc. Nahraj ho v záložce Import.",
  bonusTitle: "Bonus za 6 měsíců",
  bonusNone:
    "Bonus zatím žádný. Dostaneš ho za odprezentovaný Master mind a za pomoc, kterou někdo v Burze pomoci označí jako využitou.",
  /** Varianty věty o bonusu podle zapnutých částí (Z3). */
  bonusNoneMastermind: "Bonus zatím žádný. Dostaneš ho za odprezentovaný Master mind.",
  bonusNoneBurza:
    "Bonus zatím žádný. Dostaneš ho za pomoc, kterou někdo v Burze pomoci označí jako využitou.",
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
  /** #8: popisek souboru. */
  importFile: "Soubor .xlsx z BNI (list se skóre členů)",
  /** #8: kroky nad formulářem, jeden řádek na krok. */
  importSteps: [
    "Vyber měsíc, za který soubor je. Soubor sám měsíc nezná.",
    "Vyber soubor .xlsx z BNI s listem skóre členů.",
    "Zobrazit náhled zatím nic neuloží.",
    "Zkontroluj párování jmen a klikni na Uložit.",
  ] as const,
  /** #8: věta pod tlačítkem Uložit. */
  importSaveNote: "Členům ze souboru se hodnoty za vybraný měsíc přepíšou, ostatním zůstanou.",
  /** #17: nadpis karty s nahranými měsíci a úvod k párování. */
  importMonthsTitle: "Nahrané měsíce",
  aliasesIntro: "Tato jména ze souboru aplikace příště spáruje sama. Po Zapomenout párování potvrdíš znovu ručně.",
  /** #18: věta nad seznam řádků v náhledu. */
  importPreviewHint: "Zkontroluj řádky označené ověř nebo vyber. Přeskočený řádek se neuloží.",
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
    email: "Shoda podle e-mailu",
    partial: "Částečná shoda jména, ověř",
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

// ── Bonus podle zapnutých částí (iter-042, BK2, gate Z3) ─────

/** Obě části zapnuté: dnešní chování a výchozí hodnota všech funkcí níže. */
export const ALL_BONUS_SOURCES: BonusSources = { mastermind: true, burza: true };

/** „Master mind a Burzu pomoci“ (4. pád po „za“) nebo jen jedna ze dvou. Prázdný řetězec bez zdroje. */
export function bonusSourcesText(sources: BonusSources, form: "nominative" | "accusative" = "accusative"): string {
  const mm = "Master mind";
  const bz = form === "accusative" ? "Burzu pomoci" : "Burza pomoci";
  if (sources.mastermind && sources.burza) return `${mm} a ${bz}`;
  if (sources.mastermind) return mm;
  if (sources.burza) return bz;
  return "";
}

/** „Zelená od 70, žlutá od 50, červená od 30, šedá pod 30.“ z `COLOR_THRESHOLDS` (ne natvrdo). */
export function thresholdsText(): string {
  const t = COLOR_THRESHOLDS;
  return `Zelená od ${t.green}, žlutá od ${t.yellow}, červená od ${t.red}, šedá pod ${t.red}.`;
}

function thresholdsLower(): string {
  const t = COLOR_THRESHOLDS;
  return `zelená od ${t.green} bodů, žlutá od ${t.yellow}, červená od ${t.red}, šedá pod ${t.red}`;
}

/** Úvod stránky Můj semafor. Všechno zapnuté je `SEMAFOR_TEXTS.myIntro`. */
export function myIntroText(sources: BonusSources = ALL_BONUS_SOURCES): string {
  const base = "Skóre počítá BNI za posledních 6 měsíců, vedení ho sem nahrává jednou měsíčně.";
  if (sources.mastermind && sources.burza) return SEMAFOR_TEXTS.myIntro;
  if (sources.mastermind) return `${base} Za Master mind k němu dostaneš bonus.`;
  if (sources.burza) return `${base} Za pomoc v Burze pomoci k němu dostaneš bonus.`;
  return base;
}

/** Prázdný stav bonusu na kartě. Bez zdroje bonusu se sekce vůbec nevykreslí. */
export function bonusNoneText(sources: BonusSources = ALL_BONUS_SOURCES): string {
  if (sources.mastermind && sources.burza) return SEMAFOR_TEXTS.bonusNone;
  if (sources.mastermind) return SEMAFOR_TEXTS.bonusNoneMastermind;
  if (sources.burza) return SEMAFOR_TEXTS.bonusNoneBurza;
  return "";
}

/** Legenda pod nadpisem karty (#7, Z3). */
export function scoreLegendText(sources: BonusSources = ALL_BONUS_SOURCES): string {
  const names = bonusSourcesText(sources);
  if (!names) return `Skóre je skóre z BNI. ${thresholdsText()}`;
  return `Skóre je skóre z BNI plus tvůj bonus za ${names}. ${thresholdsText()} Řádek BNI ukazuje skóre bez bonusu.`;
}

/** Legenda pod nadpisem Přehledu (#16, Z3). Bez bonusu jen věta o prazích. */
export function overviewLegendText(sources: BonusSources = ALL_BONUS_SOURCES): string {
  const names = bonusSourcesText(sources);
  if (!names) return thresholdsText();
  return `Skóre a Barva jsou s bonusem, BNI je skóre bez bonusu, Bonus jsou body za ${names}. ${thresholdsText()}`;
}

/** Legenda oblastí pod seznamem (#7, Z2, Z6): ze 100 je jen součet, ne jedna oblast. */
export const AREAS_LEGEND_TEXT =
  "U každé oblasti je tučně počet bodů, za tečkou tvoje hodnota. Body všech oblastí dohromady dávají skóre z BNI. CEU: vzdělávací kredity za týden. 1-2-1: osobní schůzky s jinými členy za týden. Doporučení: předaná doporučení za týden. TYFCB: obchody uzavřené díky doporučení, v Kč. Hosté: hosté, které jsi přivedl(a), za 6 měsíců. Sponzoři: noví členové, které jsi do chapteru přivedl(a), za 6 měsíců.";

// ── Nápověda (vyká). Funkce s parametrem, konstanty níže jsou výchozí stav. ──

/** „07:30“ na „7:30“ (čas z nastavení chapteru, Z5). */
export function clockText(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  return `${Number(m[1])}:${m[2]}`;
}

/** Nápověda členů k semaforu, gate sekce 5 a Z3. Bez zdroje bonusu o bonusu nic. */
export function helpSemaforMember(sources: BonusSources = ALL_BONUS_SOURCES): string[] {
  const hasBonus = sources.mastermind || sources.burza;
  const bonusParts: string[] = [];
  if (sources.mastermind) bonusParts.push(`${BONUS_POINTS.mastermind} bodů za odprezentovaný Master mind`);
  if (sources.burza) {
    bonusParts.push(
      `${BONUS_POINTS.burza} bodů za každou pomoc nebo kontakt, které někdo v Burze pomoci označí jako využité`
    );
  }
  const out: string[] = [
    hasBonus
      ? "Semafor ukazuje vaše skóre podle BNI za posledních 6 měsíců a k němu bonus za to, co děláte pro chapter. Vedení nahrává data BNI jednou měsíčně."
      : "Semafor ukazuje vaše skóre podle BNI za posledních 6 měsíců. Vedení nahrává data BNI jednou měsíčně.",
  ];
  if (hasBonus) out.push(`Bonus: ${bonusParts.join(", ")}. Za 6 měsíců nejvýš ${BONUS_CAP} bodů.`);
  out.push(
    hasBonus
      ? `Barvu určuje skóre s bonusem: ${thresholdsLower()}. Vedle vidíte i barvu podle BNI bez bonusu.`
      : `Barvu určuje skóre: ${thresholdsLower()}.`
  );
  out.push(
    "Své hodnoty vidíte jen vy, vedení a členský výbor. Ostatní členové vidí jen počty členů v každé barvě, bez jmen.",
    "Když vám hodnoty nesedí, ozvěte se vedení."
  );
  return out;
}

export const HELP_SEMAFOR_MEMBER: readonly string[] = helpSemaforMember();

/** Odpověď „Co znamenají zkratky?“ (Z2, Z6). Patří do nápovědy členů (fáze 3). */
export const HELP_SEMAFOR_ABBREVIATIONS =
  "CEU jsou vzdělávací kredity, 1-2-1 osobní schůzky s jinými členy, TYFCB obchody uzavřené díky doporučení v Kč. Hosté a Sponzoři jsou počty za posledních 6 měsíců: hosté, které jste přivedli, a noví členové, které jste do chapteru přivedli.";

/** Věta v nápovědě Burzy u „Využil(a) jsem“, jen při zapnutém semaforu (Z3). */
export const HELP_BURZA_USED_BONUS =
  "Využil(a) jsem připíše členovi, který pomohl, bonus do interního semaforu. Jak se bonus počítá, najdete v nápovědě Semafor.";

/** „Když nepřijdete, do {čas} …“ Čas je začátek schůzky z nastavení (Z5). */
export function helpAttendanceMemberUnexcused(time: string = DEFAULT_CHAPTER_SETTINGS.meetingTime): string {
  return `Když nepřijdete, do ${clockText(time)} se neomluvíte a nepošlete náhradníka, zapíše vás správce docházky jako Chyběl(a) bez omluvy. Do absencí se to počítá stejně jako omluvená absence.`;
}

export const HELP_ATTENDANCE_MEMBER_UNEXCUSED = helpAttendanceMemberUnexcused();

export interface HelpLeadershipItem {
  text: string;
  importOnly: boolean;
}

/** Nápověda vedení: první tři body jen s `semafor.import` (`importOnly`). Bod o Master mindu jen při zapnutém Master mindu. */
export function helpSemaforLeadership(sources: BonusSources = ALL_BONUS_SOURCES): HelpLeadershipItem[] {
  const items: HelpLeadershipItem[] = [
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
  ];
  if (sources.mastermind) {
    items.push({
      importOnly: false,
      text: `Vlastní případ v Master mindu nepotvrzujte, potvrdí ho jiný člen vedení. Odprezentovaný případ dává bonus ${BONUS_POINTS.mastermind} bodů do semaforu.`,
    });
  }
  items.push({
    importOnly: false,
    text: "Přehled se jmény vidí admin, prezident, viceprezident a člen výboru, import jen admin, prezident a viceprezident. Obojí jen po přihlášení heslem, po přihlášení odkazem z mailu vidíte jen svůj semafor.",
  });
  return items;
}

/** Nápověda vedení v základním stavu (vše zapnuté). */
export const HELP_SEMAFOR_LEADERSHIP: readonly HelpLeadershipItem[] = helpSemaforLeadership();

/** „Chyběl(a) bez omluvy zaškrtněte …“ Čas je začátek schůzky z nastavení (Z5). */
export function helpAttendanceManagerUnexcused(time: string = DEFAULT_CHAPTER_SETTINGS.meetingTime): string {
  return `Chyběl(a) bez omluvy zaškrtněte u člena, který nepřišel, neomluvil se a neposlal náhradníka. Jde to od ${clockText(time)}, do té doby se člen může omluvit. U omluveného člena volba není, nejdřív zrušte omluvu.`;
}

export const HELP_ATTENDANCE_MANAGER_UNEXCUSED = helpAttendanceManagerUnexcused();

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

export function myBonusLaterText(
  afterDate: string,
  month: string,
  sources: BonusSources = ALL_BONUS_SOURCES
): string {
  const names = bonusSourcesText(sources, "nominative");
  return `${names} po ${formatCzDate(afterDate)} se započtou s daty za ${monthLabel(month)}.`;
}

export function rateWeekText(x: string): string {
  return `${x} za týden`;
}

/** Hosté a Sponzoři jsou počty za 6 měsíců (K3, Z2): „3 za 6 měsíců“. */
export function sixMonthsText(x: string): string {
  return `${x} za 6 měsíců`;
}

/**
 * Hodnota oblasti: docházka v procentech, TYFCB v Kč, Hosté a Sponzoři počty
 * za 6 měsíců (K3, Z2), ostatní za týden.
 */
export function areaValueText(a: AreaView): string | null {
  if (a.value === null) return null;
  switch (a.key) {
    case "attendance":
      return fmtPercent(a.value);
    case "tyfcb":
      return fmtMoney(a.value);
    case "visitors":
    case "sponsors":
      return sixMonthsText(fmtNum(a.value));
    default:
      return rateWeekText(fmtRate(a.value));
  }
}

/** Řádek náhledu importu, který chce kontrolu (štítek „ověř“ nebo „vyber“): zvýraznit (#18). */
export function matchNeedsAttention(kind: MatchKind): boolean {
  return /ověř|vyber/.test(SEMAFOR_TEXTS.matchLabels[kind]);
}

/** #17: řádek nahraného měsíce „září 2026: 12 členů, nahráno 3. 10. 2026, Jméno“. */
export function uploadedMonthText(month: string, rows: number, lastUploadedOn: string | null, by: string | null): string {
  const parts = [`${monthLabel(month)}: ${memberCountText(rows)}`];
  if (lastUploadedOn) parts.push(`nahráno ${formatCzDate(lastUploadedOn)}`);
  if (by) parts.push(by);
  return parts.join(", ");
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
