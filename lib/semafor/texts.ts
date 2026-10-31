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
import {
  BONUS_CAP,
  BONUS_POINTS,
  CATEGORY_CAPS,
  WORK_GUIDE,
  WORK_POINTS,
  type BonusCategory,
  type BonusSources,
} from "@/lib/semafor/bonus";
import { eachPointsText, plural, pointsText } from "@/lib/text/plural";
import { NO_PERMISSION_MESSAGE } from "@/lib/auth/permissions";
import type { PointErrorKey } from "@/lib/semafor/points";
import { COLOR_THRESHOLDS } from "@/lib/semafor/color";
import { DEFAULT_CHAPTER_SETTINGS } from "@/lib/chapter/settings";

export const SEMAFOR_TEXTS = {
  nav: "Semafor",
  tabMy: "Můj semafor",
  tabOverview: "Přehled",
  tabImport: "Import",
  myTitle: "Můj semafor",
  myIntro:
    "Skóre počítá BNI za posledních 6 měsíců, vedení ho sem nahrává jednou měsíčně. Bonus k němu dostaneš za Master mind, Burzu pomoci, funkci a za body od ostatních.",
  /** #16: prázdný stav bez práva importu. S právem importu viz `myNoneImport`. */
  myNone: "Zatím není nahraný žádný měsíc. Data nahrává vedení z BNI.",
  myNoneImport: "Zatím není nahraný žádný měsíc. Nahraj ho v záložce Import.",
  bonusTitle: "Bonus za 6 měsíců",
  bonusNone:
    "Bonus zatím žádný. Dostaneš ho třeba za Master mind, který proběhl, za pomoc v Burze pomoci nebo za poděkování od ostatních.",
  /** Varianty věty o bonusu podle zapnutých částí (Z3). */
  bonusNoneMastermind:
    "Bonus zatím žádný. Dostaneš ho třeba za Master mind, který proběhl, nebo za poděkování od ostatních.",
  bonusNoneBurza:
    "Bonus zatím žádný. Dostaneš ho třeba za pomoc v Burze pomoci nebo za poděkování od ostatních.",
  /** Bez Master mindu a Burzy (iter-044): zbývají vlastní body. */
  bonusNonePoints: "Bonus zatím žádný. Dostaneš ho třeba za poděkování od ostatních nebo za práci pro chapter.",
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
  /** iter-044: rozpis bonusu v rozbalení řádku přehledu. */
  overviewBonusDetail: "Bonus",
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

// ── Vlastní body (iter-044, arch 8.1) ────────────────────────

/** Hláška „nemáš právo“ (stejná jako u ostatních akcí). */
const NO_PERMISSION_TEXT = NO_PERMISSION_MESSAGE;

/** Měsíce ve 2. pádě pro „od 1. listopadu“. */
const MONTH_GENITIVE = [
  "ledna",
  "února",
  "března",
  "dubna",
  "května",
  "června",
  "července",
  "srpna",
  "září",
  "října",
  "listopadu",
  "prosince",
] as const;

/** „1. listopadu“ pro první den měsíce po `today` (`YYYY-MM-DD`). */
export function nextMonthStartText(today: string): string {
  const idx = monthOf(today).month % 12; // měsíc po dnešním (month je 1 až 12)
  return `1. ${MONTH_GENITIVE[idx]}`;
}

export const POINT_TEXTS = {
  tabPoints: "Body",
  myPointsTitle: "Body za 6 měsíců",
  pointFrom: "od {jméno}",
  formerMember: "bývalý člen",
  pointLater: "započte se s daty za {měsíc}",
  thanksReport: "Poděkování, které ti nesedí, smaže vedení. Ozvi se mu.",
  thanksTitle: "Poděkovat",
  thanksIntro:
    "Poděkuj členovi, který ti pomohl nebo udělal něco pro chapter. Dostane 1 bod do semaforu a uvidí tvoje jméno i text. Jednomu členovi jednou za kalendářní měsíc.",
  thanksMember: "Komu",
  thanksText: "Za co děkuješ",
  thanksSubmit: "Poděkovat",
  thanksDone: "Poděkování odešlo.",
  thanksMine: "Tvoje poděkování",
  thanksPick: "Vyber člena",
  thanksCounter: "znaků",
  errThanksSelf: "Sobě poděkovat nejde. Vyber jiného člena.",
  errThanksText: "Napiš, za co děkuješ, 3 až 300 znaků.",
  errInactive: "Tenhle člen teď není aktivní. Vyber jiného.",
  errNoTable: "Body teď nejde zapsat. Zkus to později.",
  readNoTable: "Vlastní body teď nejde načíst. Zkus to později.",
  errActivityMissing: "Tahle akce už neexistuje. Obnov stránku.",
  pointsTitle: "Body",
  pointsIntro:
    "Školení, přivedeného hosta a akce zapisuješ jiným členům, sobě ne. Ostatní práci uděluje jen držitel funkce Člen výboru.",
  workOnlyCommittee: "Ostatní práci uděluje jen držitel funkce Člen výboru. Když si ji někdo zaslouží, napiš někomu z výboru.",
  formTraining: "Školení",
  formTrainingMember: "Kdo školení vedl",
  formTrainingDate: "Datum",
  formTrainingTopic: "Téma",
  formTrainingNote:
    "Školení nebo workshop pro členy chapteru. Pravidelné vzdělávací okénko na schůzce se nepočítá.",
  formHostMember: "Přivedený host, který se stal členem",
  formHostMemberWho: "Kdo hosta přivedl",
  formHostMemberNew: "Nový člen",
  formHostMemberEmpty: "Za posledních 6 měsíců nepřibyl žádný člen bez zápisu.",
  formActivity: "Akce chapteru",
  formActivityTitle: "Název akce",
  formActivityDate: "Datum",
  formActivityWho: "Kdo byl na akci",
  formActivityNote:
    "Akce je společná událost mimo pravidelnou schůzku. Zapisující v seznamu není.",
  formWork: "Ostatní práce",
  formWorkMember: "Komu",
  formWorkDate: "Kdy",
  formWorkPoints: "Body",
  formWorkDescription: "Za jakou práci",
  pointsSave: "Zapsat",
  pointsSaved: "Zapsáno.",
  errSelf: "Sobě body nezapíšeš. Zapíše je jiný člen vedení nebo výboru.",
  errNotCommittee: "Ostatní práci uděluje jen držitel funkce Člen výboru.",
  errNewMember: "Vyber jako nového člena někoho jiného, kdo přišel za posledních 6 měsíců.",
  errPoints: `Body jsou ${WORK_POINTS.min} až ${WORK_POINTS.max}.`,
  errDate: "Vyber datum za posledních 6 měsíců, nejpozději dnes.",
  errNote: "Napiš, za co body jsou, 3 až 300 znaků.",
  errTitle: "Napiš název akce, 3 až 120 znaků.",
  errNoMembers: "Vyber aspoň jednoho člena, nejvýš 60.",
  errDuplicate: "Tenhle záznam už je zapsaný.",
  errActivityDuplicate: "Akce se stejným názvem a datem už je zapsaná.",
  errWorkDuplicate: "Tuhle práci jsi tomuhle členovi dnes už zapsal(a).",
  errNoPermission: NO_PERMISSION_TEXT,
  pointsListTitle: "Záznamy za 6 měsíců",
  pointsListEmpty: "Za posledních 6 měsíců zatím nic.",
  pointsFilterAll: "Všechny kategorie",
  pointsFilterShow: "Zobrazit",
  pointsColumns: ["Datum", "Kategorie", "Komu", "Body", "Kdo zapsal", "Text"] as const,
  deletePoint: "Smazat",
  deleteActivity: "Smazat akci",
  noValue: "–",
} as const;

export type PointTextKey = keyof typeof POINT_TEXTS;

/** Hláška z klíče chyby (`PointErrorKey`). `errThanksDuplicate` potřebuje dnešek. */
export function pointErrorText(key: PointErrorKey, today?: string): string {
  if (key === "errThanksDuplicate") {
    const from = today ? nextMonthStartText(today) : "1. dalšího měsíce";
    return `Tomuhle členovi už jsi tento měsíc poděkoval(a). Další poděkování půjde od ${from}.`;
  }
  return POINT_TEXTS[key];
}

export function pointsSavedActivityText(written: number, skipped: number): string {
  const head = `Zapsáno: ${written} ${plural(written, "účastník", "účastníci", "účastníků")}.`;
  if (skipped <= 0) return head;
  return `${head} Přeskočeno: ${skipped} ${plural(skipped, "člen", "členové", "členů")} (neaktivní nebo už zapsaní).`;
}

export function deletePointConfirmText(category: string, name: string): string {
  return `Smazat záznam ${category} pro ${name}? Body mu zmizí.`;
}

export function deleteActivityConfirmText(title: string, n: number): string {
  return `Smazat akci ${title} a body všech ${n} účastníků?`;
}

export function activityParticipantsText(n: number): string {
  return `${n} ${n === 1 ? "účastník" : n >= 2 && n <= 4 ? "účastníci" : "účastníků"}`;
}

// ── Bonus podle zapnutých částí (iter-042, BK2, gate Z3) ─────

/** Obě části zapnuté: dnešní chování a výchozí hodnota všech funkcí níže. */
export const ALL_BONUS_SOURCES: BonusSources = { mastermind: true, burza: true, points: true };

/** „A, B a C“ (český výčet). */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} a ${items[items.length - 1]}`;
}

/**
 * Zdroje bonusu výčtem v pevném pořadí: Master mind, Burza pomoci (jen zapnuté
 * části), funkce a vlastní body (`points`). Prázdný řetězec bez zdroje.
 * `accusative` je 4. pád po „za“, `nominative` 1. pád.
 */
export function bonusSourcesText(sources: BonusSources, form: "nominative" | "accusative" = "accusative"): string {
  const acc = form === "accusative";
  const items: string[] = [];
  if (sources.mastermind) items.push("Master mind");
  if (sources.burza) items.push(acc ? "Burzu pomoci" : "Burza pomoci");
  if (sources.points) items.push(acc ? "funkci" : "funkce", "vlastní body");
  return joinList(items);
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
  const items: string[] = [];
  if (sources.mastermind) items.push("Master mind");
  if (sources.burza) items.push("Burzu pomoci");
  if (sources.points) return `${base} Bonus k němu dostaneš za ${[...items, "funkci"].join(", ")} a za body od ostatních.`;
  if (items.length === 0) return base;
  return `${base} Bonus k němu dostaneš za ${joinList(items)}.`;
}

/** Prázdný stav bonusu na kartě. Bez zdroje bonusu se sekce vůbec nevykreslí. */
export function bonusNoneText(sources: BonusSources = ALL_BONUS_SOURCES): string {
  if (!hasAnySource(sources)) return "";
  if (sources.mastermind && sources.burza) return SEMAFOR_TEXTS.bonusNone;
  if (sources.mastermind) return SEMAFOR_TEXTS.bonusNoneMastermind;
  if (sources.burza) return SEMAFOR_TEXTS.bonusNoneBurza;
  return SEMAFOR_TEXTS.bonusNonePoints;
}

function hasAnySource(sources: BonusSources): boolean {
  return sources.mastermind || sources.burza || sources.points;
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

export interface SemaforQa {
  q: string;
  a: string;
  /** Odpověď se v nápovědě vykreslí jako odkaz na návod (F-08), ne podle znění otázky. */
  link?: "pravidla-semafor";
}

/** Odpověď „Za co je bonus?“ složená ze zapnutých částí a z konstant (iter-044, R-05). */
export function bonusAnswerText(sources: BonusSources = ALL_BONUS_SOURCES): string {
  const parts: string[] = [];
  if (sources.mastermind) parts.push(`Master mind, který proběhl, ${pointsText(BONUS_POINTS.mastermind)}.`);
  if (sources.burza) {
    parts.push(
      `Pomoc nebo kontakt, které někdo v Burze pomoci označí jako využité, ${pointsText(BONUS_POINTS.burza)}.`
    );
  }
  if (sources.points) {
    parts.push(
      `Funkce v chapteru ${pointsText(BONUS_POINTS.function)}.`,
      `Školení, které jste vedli, ${pointsText(BONUS_POINTS.training)}.`,
      `Přivedený host, který se stal členem, ${pointsText(BONUS_POINTS.host_member)}.`,
      `Účast na akci chapteru ${pointsText(BONUS_POINTS.activity)}, počítá se nejvýš ${pointsText(CATEGORY_CAPS.activity)}.`,
      `Poděkování ${pointsText(BONUS_POINTS.thanks)}, počítá se nejvýš ${pointsText(CATEGORY_CAPS.thanks)}.`,
      `Ostatní práce pro chapter ${WORK_POINTS.min} až ${pointsText(WORK_POINTS.max)}.`
    );
  }
  return `${parts.join(" ")} Za 6 měsíců nejvýš ${pointsText(BONUS_CAP)}.`;
}

/**
 * Otázky a odpovědi členů k semaforu (gate sekce 5, Z3, iter-044 R-05d).
 * Explicitní páry, žádné hledání otázky podle začátku odpovědi. Bez zdroje
 * bonusu o bonusu nic.
 */
export function semaforMemberQa(sources: BonusSources = ALL_BONUS_SOURCES): SemaforQa[] {
  const hasBonus = hasAnySource(sources);
  const out: SemaforQa[] = [
    {
      q: "Co je skóre a odkud jsou data?",
      a: hasBonus
        ? "Semafor ukazuje vaše skóre podle BNI za posledních 6 měsíců a k němu bonus za to, co děláte pro chapter. Vedení nahrává data BNI jednou měsíčně."
        : "Semafor ukazuje vaše skóre podle BNI za posledních 6 měsíců. Vedení nahrává data BNI jednou měsíčně.",
    },
  ];
  if (hasBonus) out.push({ q: "Za co je bonus?", a: bonusAnswerText(sources) });
  out.push({
    q: "Jak se určuje barva?",
    a: hasBonus
      ? `Barvu určuje skóre s bonusem: ${thresholdsLower()}. Vedle vidíte i barvu podle BNI bez bonusu.`
      : `Barvu určuje skóre: ${thresholdsLower()}.`,
  });
  if (sources.points) {
    out.push(
      {
        q: "Jak poděkovat?",
        a: "V menu Semafor na kartě Poděkovat. Vyberte člena a napište, za co děkujete. Jednomu členovi jednou za kalendářní měsíc, sobě ne. Svoje poděkování smažete v seznamu pod formulářem.",
      },
      {
        q: "Kdo vidí poděkování?",
        a: "Váš text a jméno vidí ten, komu děkujete, a vedení a členové výboru.",
      },
      {
        q: "Kdo zapisuje ostatní body?",
        a: `Školení, přivedeného hosta, který se stal členem, a akce zapisuje vedení nebo člen výboru. Ostatní práci uděluje jen držitel funkce Člen výboru. Nikdo si body nezapisuje sám. ${autoSourcesSentence(sources)}`,
      }
    );
  }
  out.push({
    q: "Kdo vidí přehled?",
    a: "Své hodnoty vidíte jen vy, vedení a členové výboru. Ostatní členové vidí jen počty členů v každé barvě, bez jmen.",
  });
  if (sources.points) out.push({ q: "Kde je celý návod?", a: "Na stránce Pravidla chapteru, Semafor.", link: "pravidla-semafor" });
  out.push({ q: "Hodnoty mi nesedí.", a: "Když vám hodnoty nesedí, ozvěte se vedení." });
  return out;
}

/** „Master mind, Burza pomoci a funkce se počítají samy.“ jen ze zapnutých částí. */
function autoSourcesSentence(sources: BonusSources): string {
  const items: string[] = [];
  if (sources.mastermind) items.push("Master mind");
  if (sources.burza) items.push("Burza pomoci");
  items.push("funkce");
  return `${joinList(items)} se ${items.length === 1 ? "počítá" : "počítají"} samy.`;
}

/** Nápověda členů k semaforu (odpovědi bez otázek, kvůli `HELP_SEMAFOR_MEMBER` a starším testům). */
export function helpSemaforMember(sources: BonusSources = ALL_BONUS_SOURCES): string[] {
  return semaforMemberQa(sources).map((x) => x.a);
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
  /** Jen s právem `semafor.points` (iter-044). */
  pointsOnly?: boolean;
  /** Jen člen výboru, který smí udělit ostatní práci (iter-044). */
  committeeOnly?: boolean;
}

/**
 * Vodítko k bodům za ostatní práci z `WORK_GUIDE` (ne natvrdo). Při vypnutém
 * Master mindu se bod 7 porovnává jen se školením (QA13: o vypnuté části ani slovo).
 */
export function workGuideText(sources: BonusSources = ALL_BONUS_SOURCES): string {
  const g = WORK_GUIDE;
  const seven = sources.mastermind ? "jako Master mind nebo školení" : "jako školení";
  return `${pointsText(g.small)}: drobnost na hodinu. ${g.task[0]} až ${g.task[1]}: menší úkol. ${g.host}: jako přivést hosta. ${g.mastermind}: ${seven}. ${g.member}: jako přivést nového člena.`;
}

/**
 * Nápověda vedení: první tři body jen s `semafor.import` (`importOnly`). Bod o
 * Master mindu jen při zapnutém Master mindu. Body o vlastních bodech jen
 * s `semafor.points` (`pointsOnly`) a ostatní práce jen členovi výboru (`committeeOnly`).
 */
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
      text: `Vlastní případ v Master mindu nepotvrzujte, potvrdí ho jiný člen vedení. Master mind, který proběhl, dává bonus ${pointsText(BONUS_POINTS.mastermind)} do semaforu.`,
    });
  }
  if (sources.points) {
    items.push(
      {
        importOnly: false,
        pointsOnly: true,
        text: "Školení, přivedeného hosta, který se stal členem, a akce zapíšete v menu Semafor na záložce Body. Mají pevné body.",
      },
      {
        importOnly: false,
        pointsOnly: true,
        text: "Ostatní práci uděluje jen držitel funkce Člen výboru. Prezident, viceprezident a admin ji bez této funkce nezapisují.",
      },
      {
        importOnly: false,
        committeeOnly: true,
        text: `Ostatní práci udělíte na stejné záložce. Zvolíte ${WORK_POINTS.min} až ${pointsText(WORK_POINTS.max)} podle rozsahu a napíšete, za jakou práci jsou. Vodítko: ${workGuideText(sources)}`,
      },
      {
        importOnly: false,
        pointsOnly: true,
        text: "Sobě body nezapíšete, ani na akci se nezaškrtnete. Vaše body zapíše jiný člen vedení nebo výboru.",
      },
      {
        importOnly: false,
        pointsOnly: true,
        text: "Záznam smažete v seznamu na stejné záložce, akci i se všemi účastníky. Smazání se zapíše do Provozu bez jména člena.",
      },
      { importOnly: false, pointsOnly: true, text: "Nevhodné poděkování smažete ve stejném seznamu." }
    );
  }
  items.push({
    importOnly: false,
    text: `Přehled se jmény vidí admin, prezident, viceprezident a člen výboru, import jen admin, prezident a viceprezident.${
      sources.points
        ? " Školení, hosta a akce zapisuje admin, prezident, viceprezident a člen výboru. Ostatní práci jen držitel funkce Člen výboru."
        : ""
    } Obojí jen po přihlášení heslem, po přihlášení odkazem z mailu vidíte jen svůj semafor.`,
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

const CATEGORY_NAMES: Record<BonusCategory, string> = {
  mastermind: "Master mind",
  burza: "Burza pomoci",
  function: "Funkce v chapteru",
  training: "Školení",
  host_member: "Přivedený host, který se stal členem",
  activity: "Akce chapteru",
  thanks: "Poděkování",
  work: "Ostatní práce",
};

/** Názvy kategorií v rozpisu a ve formulářích (jeden název všude, R-10). */
export function categoryName(category: BonusCategory): string {
  return CATEGORY_NAMES[category];
}

/**
 * Řádek rozpisu bonusu (R-20). `points` je u ostatní práce součet bodů, u funkce
 * a ostatních kategorií body jedné události: „Poděkování: 7× po 1 bodu“,
 * „Funkce v chapteru: 5 bodů“, „Ostatní práce: 3 body“.
 */
export function bonusLineText(category: BonusCategory, count: number, points: number): string {
  const name = CATEGORY_NAMES[category];
  if (category === "work") return `${name}: ${pointsText(points)}`;
  if (category === "function") return `${name}: ${pointsText(points)}`;
  return `${name}: ${count}× ${eachPointsText(points)}`;
}

/** Věta u oříznuté kategorie. Jen kategorie s podstropem, jinak prázdný řetězec. */
export function categoryCapText(category: BonusCategory): string {
  if (category === "thanks") return `Z poděkování se počítá nejvýš ${pointsText(CATEGORY_CAPS.thanks)}.`;
  if (category === "activity") return `Z akcí se počítá nejvýš ${pointsText(CATEGORY_CAPS.activity)}.`;
  return "";
}

export function bonusMastermindText(k: number): string {
  return bonusLineText("mastermind", k, BONUS_POINTS.mastermind);
}

export function bonusBurzaText(k: number): string {
  return bonusLineText("burza", k, BONUS_POINTS.burza);
}

export function myBonusLaterText(
  afterDate: string,
  month: string,
  sources: BonusSources = ALL_BONUS_SOURCES
): string {
  if (sources.points) {
    return `Co přibude po ${formatCzDate(afterDate)}, se započte s daty za ${monthLabel(month)}.`;
  }
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
