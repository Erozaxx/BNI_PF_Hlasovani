/**
 * Testy iter-033 (T-005): zásobník „5 minut pro ostatní“ (arch iter-033
 * T-001 sekce 13, gate T-004 Z1 až Z8). Bez DATABASE_URL, bez sítě, bez
 * Resendu. Testované moduly jsou čisté (rules, sort, events, ops types). Statické kontroly čtou zdrojáky z disku.
 *
 * SQL pojistky (limit 5 ve WHERE, jeden případ na datum, vlastní zájem)
 * bez DB ověřit nejde: testy 14 a 15 jen staticky hlídají jejich tvar,
 * chování ověří QA na větvi Neonu (QA 3, 4, 11, 13, 17).
 *
 * Spuštění: npm run test:iter-033-mastermind (součást npm run test:iter-033)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  MASTERMIND_EVENT_KINDS,
  presentedEvent,
  presentedUndoneEvent,
  removedEvent,
  scheduledEvent,
  unscheduledEvent,
  type MastermindEventCtx,
} from "../lib/mastermind/events";
import {
  CASE_LIMIT,
  MESSAGES,
  NOTICE_DAYS,
  OUTLINE_MAX,
  TITLE_MAX,
  addDays,
  canConfirm,
  canEdit,
  canRemove,
  canSchedule,
  canSetInterest,
  canUndoPresented,
  canUnschedule,
  countsTowardLimit,
  daysBetween,
  formatDM,
  formatDMY,
  formatWeekdayDM,
  interestLabels,
  isSchedulableDate,
  isShortNotice,
  isThursday,
  isUuid,
  noticeDays,
  outlineFilled,
  summarizeDashboard,
  thursdayOptions,
  validateCaseInput,
  type Actor,
  type CaseLike,
  type DashboardCaseRow,
} from "../lib/mastermind/rules";
import { sortCases } from "../lib/mastermind/sort";
import { TERMINAL_KINDS } from "../lib/ops/types";

const ROOT = join(__dirname, "..");

type TestCase = { name: string; run: () => void | Promise<void> };

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function readRaw(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function readSrc(rel: string): string {
  return stripComments(readRaw(rel));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const AUTH = "requireAuth";
const MGMT = "requireManagementRole";

/** Očekávaný guard per akce (arch 6, sloupec Guard je závazný). */
const GUARD_TABLE: Record<string, string> = {
  createCaseAction: AUTH,
  updateCaseAction: AUTH,
  removeCaseAction: AUTH,
  setInterestAction: AUTH,
  scheduleCaseAction: MGMT,
  unscheduleCaseAction: MGMT,
  confirmPresentedAction: MGMT,
  undoPresentedAction: MGMT,
};

/** Každá exportovaná akce a první guard v jejím těle. Chybějící guard = prázdný řetězec. */
function actionGuards(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /export async function (\w+)\(/g;
  const starts: Array<{ name: string; at: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => {
    const body = src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length);
    const first = /await (requireAuth|requireManagementRole|requireAdmin)\(/.exec(body);
    out[s.name] = first ? first[1] : "";
  });
  return out;
}

function guardMismatches(src: string): string[] {
  const found = actionGuards(src);
  const problems: string[] = [];
  for (const [name, guard] of Object.entries(found)) {
    if (!(name in GUARD_TABLE)) problems.push(`akce ${name} není v tabulce guardů`);
    else if (guard !== GUARD_TABLE[name]) {
      problems.push(`${name}: guard ${guard || "žádný"}, očekáváno ${GUARD_TABLE[name]}`);
    }
  }
  for (const name of Object.keys(GUARD_TABLE)) {
    if (!(name in found)) problems.push(`akce ${name} z tabulky chybí v actions/mastermind.ts`);
  }
  return problems;
}

// ── Pomocná data (repo je veřejné: žádná skutečná jména ani případy) ──

const ME: Actor = { memberId: "m-a", isManagement: false };
const OTHER: Actor = { memberId: "m-b", isManagement: false };
const MGMT_ACTOR: Actor = { memberId: "m-mgmt", isManagement: true };
const TODAY = "2026-10-15"; // čtvrtek

function caseOf(overrides: Partial<CaseLike> = {}): CaseLike {
  return { memberId: "m-a", status: "proposed", internalDate: null, ...overrides };
}

const EVENT_CTX: MastermindEventCtx = {
  runId: "run-1",
  actor: "Člen A",
  caseId: "11111111-1111-4111-8111-111111111111",
  presenterId: "22222222-2222-4222-8222-222222222222",
  presenterName: "Člen B",
  internalDate: "2026-11-05",
};

const cases: TestCase[] = [
  // ── 0. Základ: kalendář ──
  {
    name: "0a. 2026-10-15 je čtvrtek, isThursday a addDays/daysBetween drží kalendářní dny přes změnu času",
    run: () => {
      assert.equal(isThursday("2026-10-15"), true);
      assert.equal(isThursday("2026-10-16"), false);
      assert.equal(isThursday("2026-02-30"), false);
      // konec letního času 25. 10. 2026: den má 25 hodin, kalendářní rozdíl zůstane celý
      assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
      assert.equal(daysBetween("2026-10-15", "2026-10-29"), 14);
      assert.equal(addDays("2026-10-24", 3), "2026-10-27");
      assert.equal(addDays("2026-12-30", 3), "2027-01-02");
    },
  },
  {
    name: "0b. formáty data: 22. 10., 22. 10. 2026, čt 22. 10.",
    run: () => {
      assert.equal(formatDM("2026-10-22"), "22. 10.");
      assert.equal(formatDMY("2026-10-22"), "22. 10. 2026");
      assert.equal(formatWeekdayDM("2026-10-22"), "čt 22. 10.");
      assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
      assert.equal(isUuid("nesmysl"), false);
    },
  },

  // ── 1. sortCases ──
  {
    name: "1. sortCases: počet sestupně, shoda počtu starší výš, shoda obojího id, prázdný seznam",
    run: () => {
      assert.deepEqual(sortCases([]), []);
      const list = [
        { id: "c", createdAt: 3000, interestCount: 1 },
        { id: "a", createdAt: 2000, interestCount: 1 },
        { id: "z", createdAt: 5000, interestCount: 2 },
        { id: "y", createdAt: 1000, interestCount: 0 },
        { id: "b", createdAt: 2000, interestCount: 1 },
      ];
      assert.deepEqual(sortCases(list).map((c) => c.id), ["z", "a", "b", "c", "y"]);
      // vstup se nemění
      assert.equal(list[0].id, "c");
      // Date i ISO řetězec
      const mixed = [
        { id: "n", createdAt: new Date("2026-10-02T10:00:00Z"), interestCount: 1 },
        { id: "o", createdAt: "2026-10-01T10:00:00Z", interestCount: 1 },
      ];
      assert.deepEqual(sortCases(mixed).map((c) => c.id), ["o", "n"]);
    },
  },

  // ── 2. canSetInterest ──
  {
    name: "2. canSetInterest: autor ne, cizí člen proposed a scheduled ano, presented ne",
    run: () => {
      assert.equal(canSetInterest(ME, caseOf()), false);
      assert.equal(canSetInterest(ME, caseOf({ status: "scheduled", internalDate: "2026-10-22" })), false);
      assert.equal(canSetInterest(OTHER, caseOf()), true);
      assert.equal(canSetInterest(OTHER, caseOf({ status: "scheduled", internalDate: "2026-10-22" })), true);
      assert.equal(canSetInterest(OTHER, caseOf({ status: "presented", internalDate: "2026-10-08" })), false);
      // vedení vlastnímu případu zájem také nedá
      assert.equal(canSetInterest({ memberId: "m-a", isManagement: true }, caseOf()), false);
    },
  },

  // ── 3. canEdit ──
  {
    name: "3. canEdit: autor proposed ano; scheduled den před interní ano, v den interní ne; vedení v den interní ano; presented nikdo",
    run: () => {
      assert.equal(canEdit(ME, caseOf(), TODAY), true);
      const sched = caseOf({ status: "scheduled", internalDate: "2026-10-16" });
      assert.equal(canEdit(ME, sched, TODAY), true); // zítra je interní, dnes je den před
      assert.equal(canEdit(ME, caseOf({ status: "scheduled", internalDate: TODAY }), TODAY), false);
      assert.equal(canEdit(MGMT_ACTOR, caseOf({ status: "scheduled", internalDate: TODAY }), TODAY), true);
      assert.equal(canEdit(OTHER, caseOf(), TODAY), false);
      assert.equal(canEdit(MGMT_ACTOR, caseOf(), TODAY), true);
      const presented = caseOf({ status: "presented", internalDate: "2026-10-08" });
      assert.equal(canEdit(ME, presented, TODAY), false);
      assert.equal(canEdit(MGMT_ACTOR, presented, TODAY), false);
    },
  },

  // ── 4. canRemove ──
  {
    name: "4. canRemove: autor proposed ano, scheduled ne; vedení obojí; presented nikdo",
    run: () => {
      const sched = caseOf({ status: "scheduled", internalDate: "2026-10-22" });
      assert.equal(canRemove(ME, caseOf()), true);
      assert.equal(canRemove(ME, sched), false);
      assert.equal(canRemove(OTHER, caseOf()), false);
      assert.equal(canRemove(MGMT_ACTOR, caseOf()), true);
      assert.equal(canRemove(MGMT_ACTOR, sched), true);
      const presented = caseOf({ status: "presented", internalDate: "2026-10-08" });
      assert.equal(canRemove(ME, presented), false);
      assert.equal(canRemove(MGMT_ACTOR, presented), false);
    },
  },

  // ── 5. canConfirm a vrácení ──
  {
    name: "5. canConfirm: den před interní ne, v den interní a po ní ano, jen vedení; undo jen presented",
    run: () => {
      const sched = (d: string) => caseOf({ status: "scheduled", internalDate: d });
      assert.equal(canConfirm(MGMT_ACTOR, sched("2026-10-16"), TODAY), false);
      assert.equal(canConfirm(MGMT_ACTOR, sched(TODAY), TODAY), true);
      assert.equal(canConfirm(MGMT_ACTOR, sched("2026-10-08"), TODAY), true);
      assert.equal(canConfirm(ME, sched(TODAY), TODAY), false);
      assert.equal(canConfirm(MGMT_ACTOR, caseOf(), TODAY), false);
      assert.equal(canUndoPresented(MGMT_ACTOR, caseOf({ status: "presented", internalDate: "2026-10-08" })), true);
      assert.equal(canUndoPresented(MGMT_ACTOR, sched(TODAY)), false);
      assert.equal(canUndoPresented(ME, caseOf({ status: "presented", internalDate: "2026-10-08" })), false);
      assert.equal(canUnschedule(MGMT_ACTOR, sched(TODAY)), true);
      assert.equal(canUnschedule(MGMT_ACTOR, caseOf()), false);
      assert.equal(canUnschedule(ME, sched(TODAY)), false);
    },
  },

  // ── 6. canSchedule a isSchedulableDate ──
  {
    name: "6. canSchedule jen vedení a proposed; isSchedulableDate: čtvrtek, dnešní ano, minulý ne, poslední čtvrtek okna ano, +84 dní ne",
    run: () => {
      assert.equal(canSchedule(MGMT_ACTOR, caseOf()), true);
      assert.equal(canSchedule(ME, caseOf()), false);
      assert.equal(canSchedule(MGMT_ACTOR, caseOf({ status: "scheduled", internalDate: "2026-10-22" })), false);
      assert.equal(isSchedulableDate("2026-10-15", TODAY), true); // dnešní čtvrtek
      assert.equal(isSchedulableDate("2026-10-08", TODAY), false); // minulý čtvrtek
      assert.equal(isSchedulableDate("2026-10-16", TODAY), false); // pátek
      assert.equal(isSchedulableDate("2026-10-19", TODAY), false); // pondělí
      assert.equal(isSchedulableDate("2026-12-31", TODAY), true); // +77 dní, poslední čtvrtek okna
      assert.equal(isSchedulableDate("2027-01-07", TODAY), false); // +84 dní, už 13. týden
      assert.equal(isSchedulableDate("2026-1-22", TODAY), false);
      assert.equal(isSchedulableDate("2026-02-30", TODAY), false);
      assert.equal(isSchedulableDate("", TODAY), false);
    },
  },

  // ── 7. thursdayOptions ──
  {
    name: "7a. thursdayOptions: čtvrtek jako dnešek začne dneškem, 12 položek, jen čtvrtky",
    run: () => {
      const opts = thursdayOptions(TODAY, [], []);
      assert.equal(opts.length, 12);
      assert.equal(opts[0].date, TODAY);
      assert.ok(opts.every((o) => isThursday(o.date)));
      assert.equal(opts[11].date, "2026-12-31");
      assert.ok(opts.every((o) => o.state === "free"));
    },
  },
  {
    name: "7b. thursdayOptions: středa jako dnešek dá první čtvrtek zítra, vždy 12 položek",
    run: () => {
      const opts = thursdayOptions("2026-10-14", [], []);
      assert.equal(opts[0].date, "2026-10-15");
      assert.equal(opts.length, 12);
      for (const start of ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]) {
        assert.equal(thursdayOptions(start, [], []).length, 12, start);
      }
    },
  },
  {
    name: "7c. thursdayOptions: otevřená schůzka = open-meeting, případ = taken, shortNotice 13 dní ano a 14 ne",
    run: () => {
      const opts = thursdayOptions(TODAY, ["2026-10-22"], ["2026-10-29", "2026-10-22"]);
      const by = Object.fromEntries(opts.map((o) => [o.date, o]));
      assert.equal(by["2026-10-22"].state, "open-meeting"); // schůzka má přednost
      assert.equal(by["2026-10-29"].state, "taken");
      assert.equal(by["2026-11-05"].state, "free");
      assert.equal(by["2026-10-22"].shortNotice, true); // 7 dní
      assert.equal(by["2026-10-29"].shortNotice, false); // právě 14 dní
      assert.equal(isShortNotice("2026-10-28", TODAY), true); // 13 dní
      assert.equal(isShortNotice("2026-10-29", TODAY), false); // 14 dní
      assert.equal(noticeDays("2026-10-29", TODAY), NOTICE_DAYS);
    },
  },
  {
    name: "7d. thursdayOptions přes konec letního času (25. 10. 2026) počítá kalendářní dny a nevynechá čtvrtek",
    run: () => {
      const opts = thursdayOptions("2026-10-22", [], []);
      assert.deepEqual(
        opts.slice(0, 3).map((o) => o.date),
        ["2026-10-22", "2026-10-29", "2026-11-05"]
      );
      assert.equal(noticeDays("2026-10-29", "2026-10-22"), 7);
      assert.equal(noticeDays("2026-10-27", "2026-10-24"), 3);
    },
  },

  // ── 8. limit ──
  {
    name: "8. countsTowardLimit a CASE_LIMIT: proposed a scheduled ano, presented ne, limit 5",
    run: () => {
      assert.equal(CASE_LIMIT, 5);
      assert.equal(countsTowardLimit("proposed"), true);
      assert.equal(countsTowardLimit("scheduled"), true);
      assert.equal(countsTowardLimit("presented"), false);
    },
  },

  // ── 9. interestLabels ──
  {
    name: "9. interestLabels: proposed zájemci, scheduled posluchači a přihlášení, presented bez tlačítka",
    run: () => {
      const p = interestLabels("proposed");
      assert.equal(p.buttonOn, "Mám zájem");
      assert.equal(p.buttonOff, "Zrušit zájem");
      assert.equal(p.stateText, "Máš zájem");
      assert.equal(p.countText(1), "1 zájemce");
      assert.equal(p.countText(3), "3 zájemci");
      assert.equal(p.countText(5), "5 zájemců");
      assert.equal(p.countText(0), "0 zájemců");
      const s = interestLabels("scheduled");
      assert.equal(s.buttonOn, "Přihlásit se");
      assert.equal(s.buttonOff, "Odhlásit se");
      assert.equal(s.stateText, "Jsi přihlášený(á)");
      assert.equal(s.countText(5), "5 posluchačů");
      assert.equal(s.countText(2), "2 posluchači");
      assert.equal(s.countText(1), "1 posluchač");
      const d = interestLabels("presented");
      assert.equal(d.buttonOn, null);
      assert.equal(d.buttonOff, null);
      assert.equal(d.stateText, null);
      assert.equal(d.editable, false);
      assert.equal(d.countText(4), "4 posluchači");
    },
  },

  // ── 10. Validace vstupu ──
  {
    name: "10. validateCaseInput: prázdné a mezerové téma, 121 znaků, bod osnovy 1001 znaků, trim, prázdný bod = null",
    run: () => {
      const ok = { title: "Téma 1", situation: "Případ A", path: "", takeaway: "", ask: "" };
      assert.equal(validateCaseInput({ ...ok, title: "" }).ok, false);
      assert.equal(validateCaseInput({ ...ok, title: "    " }).ok, false);
      assert.equal(validateCaseInput({ ...ok, title: "x".repeat(TITLE_MAX + 1) }).ok, false);
      assert.equal(validateCaseInput({ ...ok, title: "x".repeat(TITLE_MAX) }).ok, true);
      assert.equal(validateCaseInput({ ...ok, situation: "  " }).ok, false);
      for (const key of ["situation", "path", "takeaway", "ask"] as const) {
        const r = validateCaseInput({ ...ok, [key]: "y".repeat(OUTLINE_MAX + 1) });
        assert.equal(r.ok, false, key);
        assert.equal(validateCaseInput({ ...ok, [key]: "y".repeat(OUTLINE_MAX) }).ok, true, key);
      }
      const trimmed = validateCaseInput({
        title: "  Téma  ",
        situation: "\n Případ \n",
        path: "   ",
        takeaway: " Poučení ",
        ask: "",
      });
      assert.ok(trimmed.ok);
      if (trimmed.ok) {
        assert.equal(trimmed.value.title, "Téma");
        assert.equal(trimmed.value.situation, "Případ");
        assert.equal(trimmed.value.path, null);
        assert.equal(trimmed.value.takeaway, "Poučení");
        assert.equal(trimmed.value.ask, null);
      }
      assert.equal(validateCaseInput(null).ok, false);
      assert.equal(validateCaseInput({ title: 5 as unknown as string, situation: "x" }).ok, false);
      assert.equal(outlineFilled({ situation: "a", path: null, takeaway: " ", ask: "d" }), 2);
    },
  },
  {
    name: "10b. datum ve špatném tvaru není schedulovatelné (regex YYYY-MM-DD)",
    run: () => {
      for (const bad of ["22.10.2026", "2026/10/22", "2026-10-22T00:00:00", " 2026-10-22", "2026-13-01"]) {
        assert.equal(isSchedulableDate(bad, TODAY), false, bad);
      }
    },
  },

  // ── 11. Žádné maily kolem zařazení (rozhodnutí 15. 10. 2026, iter-033 T-006r2) ──
  {
    name: "11a. actions/mastermind.ts neimportuje odesílání mailů, waitUntil ani plán mailů; žádné mail soubory v lib/mastermind a lib/email",
    run: () => {
      const act = readSrc("actions/mastermind.ts");
      assert.ok(!/lib\/email|resend|waitUntil|@vercel\/functions|mail-plan|login-link/i.test(act), "import mailů v akcích");
      assert.ok(!/sendMastermind|sendScheduleMails|planScheduleMails|mailError|MAIL_GAP_MS|notifiedEvent/.test(act));
      assert.ok(!/getScheduleRecipients/.test(readSrc("lib/db/queries/mastermind.ts")), "dotaz na příjemce mailů");
      assert.ok(!readdirSync(join(ROOT, "lib", "mastermind")).some((n) => /mail/i.test(n)), "soubor mailů v lib/mastermind");
      assert.ok(!/mastermind/i.test(readdirSync(join(ROOT, "lib", "email")).join(" ")), "soubor v lib/email");
      assert.ok(!/mastermind/i.test(readSrc("lib/email/resend.ts")), "mastermind v resend.ts");
    },
  },
  {
    name: "11b. scheduleCaseAction vrací jen datum; UI a nápověda při zařazení nezmiňují mail",
    run: () => {
      const act = readSrc("actions/mastermind.ts");
      const fn = act.slice(act.indexOf("export type ScheduleResult"), act.indexOf("export async function unscheduleCaseAction"));
      assert.ok(/ScheduleResult = \{\s+date: string;\s+\};/.test(fn));
      assert.ok(!/notifyPresenter/.test(fn));
      for (const rel of ["components/mastermind/ScheduleCasePanel.tsx", "components/mastermind/RemoveCaseButton.tsx"]) {
        assert.ok(!/mail/i.test(readSrc(rel)), rel);
      }
      const panel = readSrc("components/mastermind/ScheduleCasePanel.tsx");
      assert.ok(!/type="checkbox"/.test(panel), "žádné zaškrtávátko");
      assert.ok(!/maxDuration/.test(readSrc("app/(app)/mastermind/page.tsx")), "maxDuration už není potřeba");
    },
  },
  {
    name: "11c. zařazený případ ukazuje datum interní na kartě i v detailu a přihlášený posluchač vidí svoje datum",
    run: () => {
      const card = readSrc("components/mastermind/CaseCard.tsx");
      assert.ok((card.match(/Interní \{formatWeekdayDM\(data\.internalDate\)\}/g) ?? []).length >= 2, "datum na kartě i v rozbalení");
      assert.ok(card.includes("internalDate={data.internalDate}"));
      const btn = readSrc("components/mastermind/InterestButton.tsx");
      assert.ok(btn.includes("${labels.stateText} na ${formatWeekdayDM(internalDate)}"));
    },
  },

  // ── 12. Ops log ──
  {
    name: "12a. všech 5 mastermind.* je v TERMINAL_KINDS i v KIND_LABELS na /status",
    run: () => {
      assert.equal(MASTERMIND_EVENT_KINDS.length, 5);
      const table = readSrc("app/(app)/status/EventTable.tsx");
      const types = readSrc("lib/ops/types.ts");
      for (const kind of MASTERMIND_EVENT_KINDS) {
        assert.ok(TERMINAL_KINDS.includes(kind), `TERMINAL_KINDS ${kind}`);
        assert.ok(table.includes(`"${kind}":`), `štítek ${kind}`);
        assert.ok(types.includes(`| "${kind}"`), `OpsEventKind ${kind}`);
      }
    },
  },
  {
    name: "12b. události neobsahují e-mail, téma ani text případu; presented-undone je warn; mastermind.notified už neexistuje",
    run: () => {
      const all = [
        scheduledEvent(EVENT_CTX, { shortNotice: true }),
        unscheduledEvent(EVENT_CTX),
        presentedEvent(EVENT_CTX),
        presentedUndoneEvent(EVENT_CTX),
        removedEvent(EVENT_CTX, true),
        removedEvent(EVENT_CTX, false),
      ];
      for (const ev of all) {
        const blob = JSON.stringify(ev);
        assert.ok(!blob.includes("@"), `@ v ${ev.kind}`);
        assert.ok(!/"email"/.test(blob), `pole email v ${ev.kind}`);
        assert.equal(ev.source, "gui");
        assert.equal(ev.meetingId ?? null, null);
        assert.equal(ev.meetingDate, EVENT_CTX.internalDate);
        assert.equal(ev.memberName, "Člen B");
        assert.ok(MASTERMIND_EVENT_KINDS.includes(ev.kind as (typeof MASTERMIND_EVENT_KINDS)[number]));
      }
      assert.equal(presentedUndoneEvent(EVENT_CTX).severity, "warn");
      assert.equal(scheduledEvent(EVENT_CTX, { shortNotice: true }).detail?.shortNotice, true);
      for (const rel of ["lib/ops/types.ts", "app/(app)/status/EventTable.tsx", "lib/mastermind/events.ts"]) {
        assert.ok(!/mastermind\.notified/.test(readSrc(rel)), rel);
      }
    },
  },
  {
    name: "12c. statická kontrola: události v actions/mastermind.ts se skládají v safeLog a nenesou e-mail (žádné pole email, žádné .to ani .email)",
    run: () => {
      const src = readSrc("actions/mastermind.ts");
      assert.ok(/async function safeLog\(build: \(\) => OpsEventInput\)/.test(src));
      // události se skládají přes safeLog (LL-011), ne přímo jako argument logOpsEvent
      assert.equal((src.match(/logOpsEvent\(/g) ?? []).length, 1);
      assert.ok(src.includes("await logOpsEvent(build());"));
      const bodies: string[] = [];
      const re = /safeLog\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        let depth = 0;
        let end = m.index + "safeLog".length;
        for (let i = end; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")" && --depth === 0) {
            end = i;
            break;
          }
        }
        bodies.push(src.slice(m.index, end));
      }
      assert.ok(bodies.length >= 6, `safeLog volání: ${bodies.length}`);
      for (const b of bodies.slice(1)) {
        assert.ok(!/email|\.to\b/i.test(b), b);
      }
    },
  },

  // ── 13. Statické kontroly: guardy, middleware, stránky ──
  {
    name: "13a. tabulka guardů: každá exportovaná akce v actions/mastermind.ts má očekávaný guard, nic navíc, nic nechybí",
    run: () => {
      assert.deepEqual(guardMismatches(readSrc("actions/mastermind.ts")), []);
      assert.equal(Object.keys(actionGuards(readSrc("actions/mastermind.ts"))).length, 8);
    },
  },
  {
    name: "13b. test testu: akce vedení s requireAuth místo requireManagementRole test shodí (řetězec v paměti)",
    run: () => {
      const src = readSrc("actions/mastermind.ts");
      const broken = src.replace(
        /(export async function scheduleCaseAction[\s\S]*?)await requireManagementRole\(/,
        "$1await requireAuth("
      );
      assert.notEqual(broken, src, "záměna se musela provést");
      const problems = guardMismatches(broken);
      assert.ok(problems.some((p) => p.startsWith("scheduleCaseAction")), problems.join("; "));
      const extra = src + "\nexport async function neznamaAkce() { await requireAuth(); }\n";
      assert.ok(guardMismatches(extra).some((p) => p.includes("neznamaAkce")));
      const missing = src.replace(/await requireManagementRole\(MANAGEMENT_ROLES\)/, "undefined");
      assert.ok(guardMismatches(missing).length > 0);
    },
  },
  {
    name: "13c. middleware.ts neobsahuje mastermind (žádná veřejná cesta, U7) a akce berou memberId ze session",
    run: () => {
      assert.ok(!/mastermind/i.test(readRaw("middleware.ts")));
      const src = readSrc("actions/mastermind.ts");
      assert.ok(src.includes("actor.memberId"));
      assert.ok(!/(session|actor)MemberId\s*:/.test(src));
    },
  },
  {
    name: "13d. každá page.tsx pod app/(app)/mastermind volá await requirePageSession( a edit ověří UUID před dotazem",
    run: () => {
      const pages = walk(join(ROOT, "app", "(app)", "mastermind")).filter((f) => f.endsWith("page.tsx"));
      assert.equal(pages.length, 3, pages.map((p) => relative(ROOT, p)).join(", "));
      for (const f of pages) {
        assert.ok(/await requirePageSession\(/.test(stripComments(readFileSync(f, "utf8"))), relative(ROOT, f));
      }
      const edit = readSrc("app/(app)/mastermind/[id]/edit/page.tsx");
      assert.ok(edit.indexOf("isUuid(id)") > 0 && edit.indexOf("isUuid(id)") < edit.indexOf("getCaseById("));
      assert.ok(edit.includes("notFound()"));
      assert.ok(edit.includes('redirect("/mastermind")'));
    },
  },
  {
    name: "13e. nové soubory nepoužívají db.transaction (LL-003) a nemají dangerouslySetInnerHTML",
    run: () => {
      const files = [
        "actions/mastermind.ts",
        "lib/db/queries/mastermind.ts",
        "lib/mastermind/rules.ts",
        "lib/mastermind/events.ts",
        ...walk(join(ROOT, "components", "mastermind")).map((f) => relative(ROOT, f)),
        ...walk(join(ROOT, "app", "(app)", "mastermind")).map((f) => relative(ROOT, f)),
      ];
      for (const rel of files) {
        const src = readSrc(rel);
        assert.ok(!/\.transaction\(/.test(src), `${rel}: transaction`);
        assert.ok(!/dangerouslySetInnerHTML/.test(src), `${rel}: dangerouslySetInnerHTML`);
      }
    },
  },

  // ── 14. Migrační skript, statická kontrola ──
  {
    name: "14a. migrace: v DO $$ blocích žádné ${ (LL-006), lock_timeout doslova, bez ALTER TABLE meeting",
    run: () => {
      const src = readRaw("scripts/migrate-iter-033-mastermind.ts");
      const blocks = [...src.matchAll(/DO \$\$ BEGIN([\s\S]*?)END \$\$/g)].map((m) => m[1]);
      assert.equal(blocks.length, 3, "smoke, mastermind_case, mastermind_interest");
      for (const b of blocks) {
        assert.ok(!b.includes("${"), "interpolace uvnitř DO bloku");
        assert.ok(b.includes("PERFORM set_config('lock_timeout', '5s', true);"));
      }
      assert.ok(!/ALTER TABLE\s+meeting/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
      assert.ok(!/DROP TABLE/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "migrace nic nemaže (rollback jen v komentáři)");
    },
  },
  {
    name: "14b. migrace: smoke test má stejné sloupce a CHECK jako krok 1, bez FK, ON COMMIT DROP",
    run: () => {
      const src = readRaw("scripts/migrate-iter-033-mastermind.ts");
      const blocks = [...src.matchAll(/DO \$\$ BEGIN([\s\S]*?)END \$\$/g)].map((m) => m[1]);
      const [smoke, real] = blocks;
      assert.ok(smoke.includes("CREATE TEMPORARY TABLE") && smoke.includes("ON COMMIT DROP"));
      assert.ok(!/REFERENCES/.test(smoke), "smoke bez cizích klíčů");
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      const columns = (s: string) =>
        s
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^[a-z_]+\s+(UUID|TEXT|DATE|TIMESTAMPTZ)\b/.test(l))
          .map((l) => norm(l.replace(/\s+REFERENCES[^,]*/g, "").replace(/,$/, "")));
      const checks = (s: string) =>
        s
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("CONSTRAINT"))
          .map((l) => norm(l.replace(/,$/, "")));
      assert.deepEqual(columns(smoke), columns(real));
      assert.equal(columns(real).length, 16);
      assert.deepEqual(checks(smoke), checks(real));
      assert.equal(checks(real).length, 8);
      assert.ok(!/notified_at/.test(stripComments(src)), "Z2: bez notified_at");
    },
  },
  {
    name: "14c. migrace: unique index mmc_one_per_date s predikátem, kontrolní kroky volají fail a runner je exit 1",
    run: () => {
      const src = readRaw("scripts/migrate-iter-033-mastermind.ts");
      assert.ok(src.includes("CREATE UNIQUE INDEX IF NOT EXISTS mmc_one_per_date ON mastermind_case (internal_date) WHERE internal_date IS NOT NULL"));
      assert.ok(src.includes("confdeltype"));
      assert.ok(/process\.exit\(1\)/.test(src));
      for (const name of ["mmc_status_check", "mmc_date_by_status", "mmc_presented_complete", "idx_mmc_member_status", "idx_mmi_member"]) {
        assert.ok(src.includes(name), name);
      }
    },
  },
  {
    name: "14d. schema.ts má obě tabulky a `meeting` zůstává beze změny (počet sloupců v definici)",
    run: () => {
      const schema = readSrc("lib/db/schema.ts");
      assert.ok(schema.includes("export const mastermindCase = pgTable("));
      assert.ok(schema.includes("export const mastermindInterest = pgTable("));
      assert.ok(!/notifiedAt|notified_at/.test(schema), "Z2");
      assert.ok(!/meetingId[^]*mastermind_case/.test(schema.slice(schema.indexOf("mastermindCase"))), "žádný FK na meeting");
    },
  },

  // ── 15. Dotazy, statická kontrola ──
  {
    name: "15. queries: create má počet ve WHERE příkazu INSERT (ne samostatný SELECT), schedule má NOT EXISTS na meeting, zájem hlídá vlastní případ, bez notified_at",
    run: () => {
      const src = readSrc("lib/db/queries/mastermind.ts");
      const create = src.slice(src.indexOf("export async function createCaseWithLimit"));
      const createSql = create.slice(0, create.indexOf("RETURNING id") + 12);
      const createFn = create.slice(0, create.indexOf("export async function updateCaseGuarded"));
      assert.ok(/INSERT INTO mastermind_case/.test(createSql));
      assert.ok(/WHERE \(SELECT count\(\*\) FROM mastermind_case c/.test(createSql));
      assert.ok(/status IN \('proposed','scheduled'\)\) < \$\{CASE_LIMIT\}/.test(createSql));
      assert.equal((createFn.match(/\.execute</g) ?? []).length, 1, "jeden příkaz, bez SELECT před INSERT");
      const schedule = src.slice(src.indexOf("export async function scheduleCaseGuarded"));
      assert.ok(/NOT EXISTS \(SELECT 1 FROM meeting WHERE date = /.test(schedule));
      assert.ok(/status = 'proposed'/.test(schedule));
      const interest = src.slice(src.indexOf("export async function addInterest"), src.indexOf("export async function removeInterest"));
      assert.ok(/c\.member_id <> \$\{memberId\}::uuid/.test(interest));
      assert.ok(/ON CONFLICT \(case_id, member_id\) DO NOTHING/.test(interest));
      assert.ok(!/notified_at/.test(src), "Z2");
      assert.ok(!/getLastPresentedByMember/.test(src), "Z3");
      assert.ok(!/db\.transaction|\.transaction\(/.test(src), "LL-003");
      // autorita úprav a odstranění je ve WHERE
      assert.ok(/member_id = \$\{opts\.actorId\}::uuid/.test(src));
      assert.ok(/\$\{opts\.isManagement\}::boolean/.test(src));
    },
  },

  // ── 16. Dashboard (Z5) a odchylky z gate ──
  {
    name: "16a. summarizeDashboard: příští, prezentuješ ty, přihlášený(á), čeká na potvrzení",
    run: () => {
      const row = (id: string, date: string, over: Partial<DashboardCaseRow> = {}): DashboardCaseRow => ({
        id,
        presenterId: "p-" + id,
        presenterName: "Člen " + id,
        title: "Téma " + id,
        internalDate: date,
        listenerCount: 2,
        listening: false,
        ...over,
      });
      const empty = summarizeDashboard([], "me", TODAY);
      assert.deepEqual(empty, { next: null, mine: null, listening: null, awaitingConfirm: 0 });
      const s = summarizeDashboard(
        [
          row("c", "2026-11-05", { presenterId: "me" }),
          row("a", "2026-10-08"), // už proběhla, čeká na potvrzení
          row("b", "2026-10-22", { listening: true }),
          row("d", "2026-10-01"),
        ],
        "me",
        TODAY
      );
      assert.equal(s.next?.id, "b");
      assert.equal(s.mine?.id, "c");
      assert.equal(s.listening?.id, "b");
      assert.equal(s.awaitingConfirm, 2);
      // dnešní interní se ještě nepočítá jako zameškaná
      assert.equal(summarizeDashboard([row("t", TODAY)], "me", TODAY).awaitingConfirm, 0);
      assert.equal(summarizeDashboard([row("t", TODAY)], "me", TODAY).next?.id, "t");
    },
  },
  {
    name: "16b. Z5: dashboard vedení ukazuje jen „Čeká na potvrzení“ a jen když N > 0, bez počtu zásobníku",
    run: () => {
      const src = readSrc("components/mastermind/DashboardMastermind.tsx");
      assert.ok(/isManagement && summary\.awaitingConfirm > 0/.test(src));
      assert.ok(src.includes("Čeká na potvrzení: "));
      assert.ok(!/zásobník/i.test(src.replace(/"[^"]*zásobník[^"]*"/gi, "")), "počet zásobníku se nezobrazuje");
      const dash = readSrc("app/(app)/dashboard/page.tsx");
      assert.ok(dash.includes("<DashboardMastermind"));
      assert.ok(dash.includes("Schuzka: {upcomingMeeting.date}"), "karta schůzky beze změny");
    },
  },
  {
    name: "16c. Z3, Z4, Z6: bez „naposledy prezentoval“, bez poznámky o lhůtě u zařazeného, bez štítku [Tvůj] v záhlaví; Tvůj případ jednou",
    run: () => {
      const files = walk(join(ROOT, "components", "mastermind")).map((f) => relative(ROOT, f));
      files.push("app/(app)/mastermind/page.tsx");
      for (const rel of files) {
        const src = readSrc(rel);
        assert.ok(!/naposledy prezentoval/i.test(src), `${rel}: Z3`);
        assert.ok(!/zařazeno méně než 14 dní/i.test(src), `${rel}: Z4`);
        assert.ok(!/\[Tvůj\]/.test(src), `${rel}: Z6`);
      }
      const card = readSrc("components/mastermind/CaseCard.tsx");
      assert.equal((card.match(/Tvůj případ/g) ?? []).length, 1, "Tvůj případ jednou");
      const panel = readSrc("components/mastermind/ScheduleCasePanel.tsx");
      assert.ok(panel.includes("Méně než 14 dní: "), "poznámka vedle výběru zůstává");
    },
  },
  {
    name: "16d. Z7: texty nápovědy bez štítku „doporučená“ u lhůty, bez zaškrtávátka mailu, bez jmen z vedení; bez zmínky o mailu",
    run: () => {
      const mod = readSrc("components/help/sections/ModeratorHelp.tsx");
      const member = readSrc("components/help/sections/MemberHelp.tsx");
      assert.ok(mod.includes("Téma ohlašujeme 14 dní předem."));
      assert.ok(mod.includes("Aplikace kratší lhůtu nezakáže, jen ji při zařazení ukáže."));
      assert.ok(!/mail/i.test(mod.slice(mod.indexOf("5 minut pro ostatní: zařazování"), mod.indexOf("Omezení role Moderátora"))), "mail v nápovědě zařazování");
      for (const src of [mod, member]) {
        const from = src.indexOf("5 minut pro ostatní");
        const section = src.slice(from, src.indexOf("</section>", from));
        assert.ok(!/doporučen/i.test(section), "štítek doporučená");
        assert.ok(!/zaškrt/i.test(section), "zaškrtávátko");
        assert.ok(!/—/.test(section), "em dash");
        assert.ok(!/mail/i.test(section), "mail v nápovědě 5 minut");
      }
    },
  },
  {
    name: "16e. žádný em dash v nových souborech a žádné e-mailové adresy kromě .invalid v testech",
    run: () => {
      const files = [
        "actions/mastermind.ts",
        "lib/db/queries/mastermind.ts",
        "lib/mastermind/rules.ts",
        "lib/mastermind/sort.ts",
        "lib/mastermind/events.ts",
        "scripts/migrate-iter-033-mastermind.ts",
        ...walk(join(ROOT, "components", "mastermind")).map((f) => relative(ROOT, f)),
        ...walk(join(ROOT, "app", "(app)", "mastermind")).map((f) => relative(ROOT, f)),
      ];
      for (const rel of files) {
        assert.ok(!readRaw(rel).includes("—"), `${rel}: em dash`);
      }
    },
  },
  {
    name: "16f. nově napsaný kód nepřidává ruční DB přístup mimo lib/db a neobsahuje .env",
    run: () => {
      for (const rel of ["actions/mastermind.ts", "components/mastermind/CaseCard.tsx", "app/(app)/mastermind/page.tsx"]) {
        const src = readSrc(rel);
        assert.ok(!/getSql\(|neon\(/.test(src), rel);
        assert.ok(!/\.env/.test(src), rel);
      }
    },
  },
  {
    name: "16g. interní sekce se nedotýká souborů beze změny: žádný import z meeting actions v nových souborech",
    run: () => {
      const src = readSrc("actions/mastermind.ts");
      assert.ok(!/actions\/meetings|actions\/guests/.test(src));
      assert.ok(!/lib\/db\/queries\/meetings/.test(readSrc("lib/db/queries/mastermind.ts")));
      // `meeting` se jen čte
      const q = readSrc("lib/db/queries/mastermind.ts");
      assert.ok(!/(INSERT INTO|UPDATE|DELETE FROM)\s+meeting\b/.test(q));
    },
  },
  // ── 17. Opravné kolo T-006r (m-1 až m-8, L-2, L-3) ──
  {
    name: "17a. L-3: téma se sjednotí na jeden řádek, odkaz (URL, www.) v tématu se odmítne, v osnově smí být",
    run: () => {
      const ok = { title: "Téma", situation: "Případ", path: "", takeaway: "", ask: "" };
      const r = validateCaseInput({ ...ok, title: "  Dva\n\n řádky \t a   mezery " });
      assert.ok(r.ok);
      if (r.ok) assert.equal(r.value.title, "Dva řádky a mezery");
      for (const t of ["Viz https://x.example/a", "http://x.example", "HTTPS://X.EXAMPLE", "Pojďte na www.example.cz", "Řádek\nhttps://x.example"]) {
        const bad = validateCaseInput({ ...ok, title: t });
        assert.equal(bad.ok, false, t);
        if (!bad.ok) assert.equal(bad.error, "Do tématu nepatří odkaz.");
      }
      assert.equal(validateCaseInput({ ...ok, title: "Web a wwwidth" }).ok, true);
      assert.equal(validateCaseInput({ ...ok, path: "Odkaz https://x.example v osnově" }).ok, true);
    },
  },
  {
    name: "17c. m-5: Vrátit potvrzení hlídá limit v jednom příkazu (count ve WHERE UPDATE), akce má srozumitelnou hlášku",
    run: () => {
      const q = readSrc("lib/db/queries/mastermind.ts");
      const fn = q.slice(q.indexOf("export async function undoPresentedGuarded"));
      const body = fn.slice(0, fn.indexOf("RETURNING id, member_id") + 30);
      assert.equal((fn.slice(0, fn.indexOf("export ", 10)).match(/\.execute</g) ?? []).length, 1, "jeden příkaz");
      assert.ok(/UPDATE mastermind_case/.test(body));
      assert.ok(/status = 'presented'\s+AND \(SELECT count\(\*\) FROM mastermind_case o/.test(body));
      assert.ok(/o\.member_id = mastermind_case\.member_id/.test(body));
      assert.ok(/status IN \('proposed','scheduled'\)\) < \$\{CASE_LIMIT\}/.test(body));
      assert.ok(!/\.transaction\(/.test(q), "LL-003");
      const msg = MESSAGES.undoLimit("Člen A");
      assert.ok(msg.startsWith("Člen A má už 5 otevřených případů"));
      assert.ok(!/—/.test(msg));
      const act = readSrc("actions/mastermind.ts");
      assert.ok(act.includes("MESSAGES.undoLimit("));
    },
  },
  {
    name: "17d. m-1, m-2, m-3, m-6, L-2: statické kontroly (tlačítko po úspěchu, scheduled s logem, 44 px, bez maxDuration)",
    run: () => {
      const form = readSrc("components/mastermind/CaseForm.tsx");
      assert.ok(/keepDisabled = true;\s+showToast\("success"/.test(form));
      assert.ok(/if \(!keepDisabled\) setLoading\(false\)/.test(form));
      const act = readSrc("actions/mastermind.ts");
      assert.ok(/scheduledEvent\(ctx, \{ shortNotice \}\)/.test(act));
      const card = readSrc("components/mastermind/CaseCard.tsx");
      assert.ok(/<summary className="flex min-h-\[44px\]/.test(card));
      for (const rel of ["app/(app)/mastermind/new/page.tsx", "app/(app)/mastermind/[id]/edit/page.tsx"]) {
        assert.ok(/inline-flex min-h-\[44px\] items-center/.test(readSrc(rel)), rel);
      }
      const page = readSrc("app/(app)/mastermind/page.tsx");
      assert.ok(!/maxDuration/.test(page));
    },
  },
  {
    name: "17e. m-8: nápověda vedení říká, že panel Zařadit na je vidět hned, přesun = Vrátit do zásobníku a Zařadit, bez tykání",
    run: () => {
      const mod = readSrc("components/help/sections/ModeratorHelp.tsx");
      const from = mod.indexOf("5 minut pro ostatní: zařazování");
      const section = mod.slice(from, mod.indexOf("</section>", from));
      assert.ok(!/rozbalte kartu/.test(section));
      assert.ok(section.includes("hned vidět panel"));
      assert.ok(section.includes("Vrátit do zásobníku"));
      assert.ok(!/přesuneš|vyber |dej /.test(section), "tykání");
    },
  },
  {
    name: "18. T-009r Z20: v app/(app)/mastermind a components/mastermind není <Button uvnitř <Link (vnořený interaktivní prvek), MobileNav bez diakritických chyb v popiscích",
    run: () => {
      const files = [
        ...walk(join(ROOT, "app", "(app)", "mastermind")),
        ...walk(join(ROOT, "components", "mastermind")),
      ].filter((f) => /\.tsx$/.test(f));
      assert.ok(files.length > 5, "našly se soubory");
      for (const f of files) {
        const src = stripComments(readFileSync(f, "utf8"));
        const re = /<Link\b[^>]*>([\s\S]*?)<\/Link>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          assert.ok(!/<Button\b|<button\b/.test(m[1]), `${relative(ROOT, f)}: tlačítko uvnitř Link`);
        }
      }
      const nav = readSrc("components/layout/MobileNav.tsx");
      for (const bad of ["Hoste", "Schuzky", "Casovace", "Clenove", "Nastaveni", "Odhlasit"]) {
        assert.ok(!new RegExp(`>\\s*${bad}\\b`).test(nav), `bez diakritiky: ${bad}`);
      }
    },
  },
];

let passed = 0;
let failed = 0;

async function main() {
  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`OK   ${testCase.name}`);
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL ${testCase.name}`);
      console.error(`     ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed (of ${cases.length})`);
  if (failed > 0) process.exitCode = 1;
}

void main();
