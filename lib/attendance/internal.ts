/**
 * iter-040 (T-003, arch 5.4, 7, 8, 10; gate Z1 až Z4): čistá pravidla interní
 * schůzky v docházce. Den tónu, rozhodnutí o založení a zrušení (jen hláška
 * předem, pravdou je SQL v `lib/db/queries/attendance-internal.ts`), stav karty
 * dne, třídy buněk mřížky, texty a sestavení ops události.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend. Bezpečné
 * pro scripts/test-iter-040-interni.ts i pro klientské komponenty.
 *
 * Žádné jméno člena, žádný počet omluv: ops událost nese jen datum a příznak
 * přebití (gate Z1, L-1 z iter-038).
 */

import { addDaysToDateString, isValidDateString, pragueToday } from "@/lib/members/activity";
import { MAX_ADVANCE_DAYS, pragueInstant } from "@/lib/attendance/rules";
import type { OpsEventInput } from "@/lib/ops/types";

/** Konečné texty, doslova z gate sekce 5. Test hlídá znění i absenci U+2014. */
export const INTERNAL_TEXTS = {
  title: "Interní schůzka",
  hint: "Interní schůzka je schůzka bez hostů a hlasování. Do docházky se počítá jako běžná.",
  create: "Založit interní schůzku",
  created: "Na tenhle den je interní schůzka. Počítá se do docházky.",
  pastInternal: "Ten den byla interní schůzka.",
  cancel: "Zrušit interní schůzku",
  confirmCancel:
    "Smažou se všechny omluvy členů na tenhle den a vrátit to nejde. Když tu má být běžná schůzka, založ ji ve Schůzkách a interní neruš, omluvy pak zůstanou.",
  confirmCancelOverridden: "Omluvy zůstanou, platí běžná schůzka. Zrušit interní?",
  confirmYes: "Ano, zrušit",
  confirmNo: "Nechat",
  overridden: "Na tenhle den je i běžná schůzka, docházka se počítá podle ní.",
  meetingDay: "Na tenhle den je běžná schůzka.",
  toastCreated: "Interní schůzka založena.",
  toastCancelled: "Interní schůzka zrušena.",
  toastExists: "Interní schůzka už na tenhle den je.",
  toastGone: "Interní schůzka už je zrušená.",
  errMeeting: "Na tenhle den už je běžná schůzka.",
  errToday:
    "Na dnešek už interní schůzku založit nejde. Dnešní docházku zapíše správce docházky v Zápisu přes Zapisovat i tak.",
  errRange: "Interní schůzku jde založit nejvýš rok dopředu.",
  errRecorded: "Na tenhle den už je zapsaná docházka, interní schůzku zrušit nejde.",
  errClosed: "Po 17:00 se den uzavírá, interní schůzku už zrušit nejde.",
  errPast: "Minulou schůzku zrušit nejde.",
  /** Jen hláška serveru při přímém volání akce na minulý den (karta ho nenabízí). */
  errPastCreate: "Na minulý den interní schůzku založit nejde.",
  sheetInternal: "Interní schůzka.",
  ariaInternal: "interní schůzka",
  errInvalid: "Neplatné datum.",
  errGeneric: "Neuložilo se. Zkus to znovu.",
} as const;

/** Konec okna, do kterého jde zrušit: začátek večerního okna (17:00 pražského času). */
export const INTERNAL_CANCEL_UNTIL = "17:00";

// ── Tón dne ──────────────────────────────────────────────────

export type DayTone = "meeting" | "internal" | "regular" | "none";

/**
 * Tón dne (iter-042 B3): schůzka s hosty > interní > pravidelný den > nic.
 * Schůzka s hosty vyhrává nad interní (5.3) i u minulých dnů, takže den zůstává
 * tmavě modrý i po schůzce. `isRegularDay` je den v týdnu z nastavení chapteru.
 */
export function dayTone(input: {
  hasMeeting: boolean;
  hasInternal: boolean;
  isRegularDay?: boolean;
}): DayTone {
  if (input.hasMeeting) return "meeting";
  if (input.hasInternal) return "internal";
  if (input.isRegularDay) return "regular";
  return "none";
}

// ── Založení ─────────────────────────────────────────────────

export type InternalCreateDecision =
  | { ok: true; alreadyExists: boolean; message?: string }
  | { ok: false; reason: "invalid" | "today" | "past" | "range" | "meeting"; message: string };

/**
 * Smí se v okamžiku `now` založit interní schůzka na `date`? Jen pro srozumitelnou
 * hlášku předem (5.1): od zítřka do dnes + 365, na dni není běžná schůzka.
 * Existující interní je splněný cílový stav (`alreadyExists`, hláška `toastExists`).
 */
export function decideInternalCreate(
  now: Date,
  date: string,
  state: { hasMeeting: boolean; hasInternal: boolean }
): InternalCreateDecision {
  if (typeof date !== "string" || !isValidDateString(date)) {
    return { ok: false, reason: "invalid", message: INTERNAL_TEXTS.errInvalid };
  }
  const today = pragueToday(now);
  if (date === today) return { ok: false, reason: "today", message: INTERNAL_TEXTS.errToday };
  if (date < today) return { ok: false, reason: "past", message: INTERNAL_TEXTS.errPastCreate };
  if (date > addDaysToDateString(today, MAX_ADVANCE_DAYS)) {
    return { ok: false, reason: "range", message: INTERNAL_TEXTS.errRange };
  }
  if (state.hasMeeting) return { ok: false, reason: "meeting", message: INTERNAL_TEXTS.errMeeting };
  if (state.hasInternal) return { ok: true, alreadyExists: true, message: INTERNAL_TEXTS.toastExists };
  return { ok: true, alreadyExists: false };
}

// ── Zrušení ──────────────────────────────────────────────────

export type InternalCancelDecision =
  | { ok: true; deletesAbsences: boolean }
  | {
      ok: false;
      reason: "invalid" | "past" | "closed" | "recorded";
      message: string;
      deletesAbsences: false;
    };

/** Je v okamžiku `now` ještě před 17:00 pražského času v den `date` (DST bezpečně)? */
export function beforeCancelDeadline(now: Date, date: string): boolean {
  return now.getTime() < pragueInstant(date, INTERNAL_CANCEL_UNTIL).getTime();
}

/**
 * Smí se zrušit (5.2): D >= dnes, před 17:00 pražského času, den není uzavřený
 * a (bez běžné schůzky) nikdo nezapsal docházku. Zrušení maže omluvy jen tehdy,
 * když na den není běžná schůzka (`deletesAbsences = !hasMeeting`).
 */
export function decideInternalCancel(
  now: Date,
  date: string,
  state: { hasMeeting: boolean; finalized: boolean; hasManagerRecord: boolean }
): InternalCancelDecision {
  if (typeof date !== "string" || !isValidDateString(date)) {
    return { ok: false, reason: "invalid", message: INTERNAL_TEXTS.errInvalid, deletesAbsences: false };
  }
  if (date < pragueToday(now)) {
    return { ok: false, reason: "past", message: INTERNAL_TEXTS.errPast, deletesAbsences: false };
  }
  if (state.finalized || !beforeCancelDeadline(now, date)) {
    return { ok: false, reason: "closed", message: INTERNAL_TEXTS.errClosed, deletesAbsences: false };
  }
  if (!state.hasMeeting && state.hasManagerRecord) {
    return { ok: false, reason: "recorded", message: INTERNAL_TEXTS.errRecorded, deletesAbsences: false };
  }
  return { ok: true, deletesAbsences: !state.hasMeeting };
}

/**
 * Gate Z1: klient se nesmí dozvědět, jestli na den někdo omluvu měl. Hodnota
 * se počítá z PRAVIDLA, ne z dat: zrušení smazalo řádek (`n = 1`) a na dni
 * není běžná schůzka. Při `n = 0` je vždy false.
 */
export function absencesDeletedFlag(n: number, hasMeeting: boolean): boolean {
  return n === 1 && !hasMeeting;
}

// ── Karta dne (Z3) ───────────────────────────────────────────

export type InternalCardKind =
  | "hidden"
  | "create"
  | "errToday"
  | "errRange"
  | "meetingDay"
  | "pastInternal"
  | "cancel"
  | "cancelClosed";

export interface InternalCardView {
  kind: InternalCardKind;
  /** Řádky textu karty v pořadí (bez nadpisu). Prázdné pole u `hidden`. */
  lines: string[];
  /** Tlačítko karty, `null` = žádné. */
  button: "create" | "cancel" | null;
  /** Text dvoukrokového potvrzení u `cancel`, jinak `null`. */
  confirm: string | null;
  /** Šedý důvod, proč tlačítko chybí (poslední řádek `lines`), pro styl. */
  muted: boolean;
}

/**
 * Stav karty pro vybraný den (tabulka 7.1 se změnami ze Z3). Klient nezná zápis
 * správce, proto u zrušení posuzuje jen čas; `errRecorded` přijde z akce.
 */
export function internalCardView(input: {
  now: Date;
  date: string;
  hasMeeting: boolean;
  hasInternal: boolean;
}): InternalCardView {
  const { now, date, hasMeeting, hasInternal } = input;
  const today = pragueToday(now);
  const view = (
    kind: InternalCardKind,
    lines: string[],
    button: InternalCardView["button"] = null,
    confirm: string | null = null,
    muted = false
  ): InternalCardView => ({ kind, lines, button, confirm, muted });

  if (hasInternal) {
    // Běžná schůzka přebíjí interní: minulý den s oběma kartu nezobrazí.
    if (date < today) {
      return hasMeeting ? view("hidden", []) : view("pastInternal", [INTERNAL_TEXTS.pastInternal]);
    }
    const lead = hasMeeting ? INTERNAL_TEXTS.overridden : INTERNAL_TEXTS.created;
    if (beforeCancelDeadline(now, date)) {
      return view(
        "cancel",
        [lead],
        "cancel",
        hasMeeting ? INTERNAL_TEXTS.confirmCancelOverridden : INTERNAL_TEXTS.confirmCancel
      );
    }
    return view("cancelClosed", [lead, INTERNAL_TEXTS.errClosed], null, null, true);
  }
  if (date < today) return view("hidden", []);
  if (hasMeeting) return view("meetingDay", [INTERNAL_TEXTS.meetingDay]);
  if (date === today) return view("errToday", [INTERNAL_TEXTS.errToday], null, null, true);
  if (date > addDaysToDateString(today, MAX_ADVANCE_DAYS)) {
    return view("errRange", [INTERNAL_TEXTS.errRange], null, null, true);
  }
  return view("create", [INTERNAL_TEXTS.hint], "create");
}

// ── Mřížka kalendáře ─────────────────────────────────────────

const CELL_BASE =
  "flex min-h-[44px] flex-col items-center justify-center rounded-lg text-sm leading-tight focus:outline-none focus:shadow-focus";

/**
 * Třídy buňky dne, společné pro kalendář člena i Omluvy (iter-042 B3, gate Z4).
 *
 * - regular (pravidelný den): `bg-navy-soft` #d6dcff, text `text-text-main`
 * - meeting (schůzka s hosty, i po schůzce): `bg-navy` #605BE5, bílý text, 5,1:1
 * - internal (interní schůzka): `bg-success` #2d7a3a, bílý text, 5,3:1
 * - none: bez podkladu, minulé dny šedě
 *
 * Symboly ● ◐ ✓ N A a počet omluvených nemají vlastní barvu a dědí barvu
 * textu buňky. Vybraný den má `ring-offset-2`, aby rámeček neležel na modré.
 */
export function dayCellClass(tone: DayTone, past: boolean, selected: boolean): string {
  const parts = [CELL_BASE];
  if (tone === "internal") {
    parts.push("bg-success font-semibold text-white");
  } else if (tone === "meeting") {
    parts.push("bg-navy font-semibold text-white");
  } else if (tone === "regular") {
    parts.push("bg-navy-soft text-text-main");
  } else {
    parts.push("hover:bg-background");
    parts.push(past ? "text-text-muted" : "text-text-main");
  }
  if (selected) parts.push("ring-2 ring-primary ring-offset-2");
  return parts.join(" ");
}

/** Třídy čísla dne: podtržení má jen den se založenou schůzkou (s hosty i interní), pravidelný den ne. */
export function dayNumberClass(tone: DayTone): string {
  return tone === "meeting" || tone === "internal" ? "underline decoration-2 underline-offset-2" : "";
}

// ── Ops událost (10) ─────────────────────────────────────────

export type InternalOpsKind = "attendance.internal-created" | "attendance.internal-cancelled";

/**
 * Událost pro `/status` (vidí ji i moderátor): bez `memberId`, `memberName`,
 * bez počtu smazaných omluv a bez jmen. `runId`, `seq` a `actor` doplní akce.
 */
export function internalOpsEvent(
  kind: InternalOpsKind,
  date: string,
  overridden: boolean
): Omit<OpsEventInput, "runId" | "seq" | "actor"> {
  return {
    source: "gui",
    kind,
    severity: "info",
    meetingDate: date,
    message: kind === "attendance.internal-created" ? "Založena." : "Zrušena.",
    detail: { overridden },
  };
}
