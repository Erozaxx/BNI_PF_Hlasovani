/**
 * iter-038 (T-003c, arch 9, 10, 11): jádro cronu docházky. Handler
 * `app/api/cron/attendance/route.ts` je tenký obal; QA volá toto jádro se
 * zadaným časem (`now`), produkční route žádný přepis času nepřijímá.
 *
 * Ráno (06:00 až 11:59 pražského času, gate Z1):
 *   1. ranní odkazy pro dnešek, pokud je dnes založená schůzka,
 *   2. záchrana včerejška: den docházky, který se neuzavřel, se uzavře a pošle
 *      se report s „(opožděně)“.
 * Večer (17:00 až 23:59): uzavření dneška a report; do tří hodin po uzavření
 * se dosílá příjemcům, kteří report ještě nedostali (pád uprostřed rozesílky).
 *
 * Idempotence: claim řádku odkazu (`attendance_link`), claim příjemce reportu
 * (`attendance_report_mail`), uzavření dne jen z `finalized_at IS NULL`. Opakovaný
 * běh v okně nepošle druhý mail ani druhý report. Bez transakcí (LL-003).
 * Běh bez práce nic nezapisuje do ops logu (4 ze 7 denních běhů).
 *
 * NENÍ čistý modul (DB, Resend, ops log).
 */
import { randomUUID } from "node:crypto";
import { planAttendanceCron, type CronPhase } from "@/lib/attendance/cron-plan";
import {
  buildAttendanceReport,
  buildMorningMail,
  type ReportData,
} from "@/lib/attendance/report";
import {
  buildAttendanceLinkUrl,
  generateAttendanceToken,
  hashAttendanceToken,
} from "@/lib/auth/attendance-magic";
import {
  claimAttendanceLink,
  claimReportMail,
  countExcusedFor,
  fillDayRows,
  getCloseState,
  listPendingLinkTargets,
  listReportRecipients,
  loadReportRows,
  markDayFinalized,
  markLinkSent,
  markReportSent,
  recordLinkSkipped,
  type CloseState,
  type DayMode,
} from "@/lib/db/queries/attendance-close";
import {
  sendAttendanceLinkEmail,
  sendAttendanceReportEmail,
  type AttendanceMailResult,
} from "@/lib/email/attendance";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";

export interface AttendanceCronDeps {
  /** Základ adres v mailech (výchozí `getAppUrl`-ekvivalent, viz route). */
  appUrl: string;
  sendLink?: typeof sendAttendanceLinkEmail;
  sendReport?: typeof sendAttendanceReportEmail;
  log?: (input: OpsEventInput) => Promise<boolean>;
  /** Pauza mezi maily (limit Resendu ~2 požadavky za vteřinu). */
  pauseMs?: number;
}

export interface AttendanceCronResult {
  phase: CronPhase;
  today: string;
  /** Běh něco udělal nebo zkusil (jinak nezapsal nic ani do ops logu). */
  worked: boolean;
  linksSent: number;
  linksFailed: number;
  linksSkipped: number;
  /** Dny uzavřené TÍMTO během. */
  daysFinalized: string[];
  reportsSent: number;
  reportsFailed: number;
  reportsSkipped: number;
  /** Fáze, které spadly celé (bez textu chyby). */
  phaseErrors: string[];
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

export async function runAttendanceCron(
  now: Date,
  deps: AttendanceCronDeps
): Promise<AttendanceCronResult> {
  const plan = planAttendanceCron(now);
  const result: AttendanceCronResult = {
    phase: plan.phase,
    today: plan.today,
    worked: false,
    linksSent: 0,
    linksFailed: 0,
    linksSkipped: 0,
    daysFinalized: [],
    reportsSent: 0,
    reportsFailed: 0,
    reportsSkipped: 0,
    phaseErrors: [],
  };
  if (plan.phase === "none") return result;

  const sendLink = deps.sendLink ?? sendAttendanceLinkEmail;
  const sendReport = deps.sendReport ?? sendAttendanceReportEmail;
  const writeLog = deps.log ?? logOpsEvent;
  const pauseMs = deps.pauseMs ?? 300;

  const runId = randomUUID();
  let seq = 0;

  // LL-011: stavba události i zápis jsou uvnitř try, log nikdy neshodí cron.
  const emit = async (
    build: () => Omit<OpsEventInput, "runId" | "seq" | "source" | "actor">
  ): Promise<void> => {
    try {
      await writeLog({ ...build(), runId, seq: seq++, source: "cron", actor: "cron" });
    } catch (err) {
      console.error(`[attendance-cron] ops log failed: ${errClass(err)}`);
    }
  };

  // ── Zjištění práce (levné SELECTy, bez zápisu do logu) ─────

  let linkTargets: Awaited<ReturnType<typeof listPendingLinkTargets>> = [];
  const days: { date: string; late: boolean; state: CloseState }[] = [];
  /** iter-040: dnešek je interní schůzka bez běžné (ranní mail to řekne). */
  let morningInternal = false;

  try {
    if (plan.phase === "morning") {
      const todayState = await getCloseState(plan.today);
      morningInternal = !todayState.hasMeeting && todayState.hasInternal;
      if (todayState.hasMeeting || todayState.hasInternal) linkTargets = await listPendingLinkTargets(plan.today);
      const yState = await getCloseState(plan.yesterday);
      // Záchrana jen pro den, na kterém docházka opravdu běžela (ranní odkaz
      // nebo zápis správce). Bez toho by první ráno po nasazení uzavřelo
      // a rozeslalo „nezapsáno“ za schůzku, která proběhla před spuštěním.
      if (
        yState.isAttendanceDay &&
        !yState.finalized &&
        (yState.hasManagerRecord || yState.hasLinkRow)
      ) {
        days.push({ date: plan.yesterday, late: true, state: yState });
      }
    } else {
      const state = await getCloseState(plan.today);
      if (state.isAttendanceDay && !state.finalized) {
        days.push({ date: plan.today, late: false, state });
      } else if (state.finalized && state.finalizedRecently) {
        const pending = await listReportRecipients(plan.today, true);
        if (pending.length > 0) days.push({ date: plan.today, late: state.reportLate, state });
      }
    }
  } catch (err) {
    console.error(`[attendance-cron] work discovery failed: ${errClass(err)}`);
    throw err;
  }

  if (linkTargets.length === 0 && days.length === 0) return result;
  result.worked = true;

  await emit(() => ({
    kind: "cron.started",
    severity: "info",
    meetingDate: plan.today,
    message: `Cron docházky spuštěn (${plan.phase === "morning" ? "ráno" : "večer"}).`,
  }));

  // ── Ranní odkazy ────────────────────────────────────────────

  if (plan.phase === "morning" && linkTargets.length > 0) {
    try {
      const counts = await countExcusedFor(plan.today);
      for (const t of linkTargets) {
        if (!t.email) {
          const created = await recordLinkSkipped(t.memberId, plan.today);
          if (created) {
            result.linksSkipped++;
            await emit(() => ({
              kind: "attendance.link-skipped",
              severity: "warn",
              meetingDate: plan.today,
              memberId: t.memberId,
              memberName: t.name,
              code: "no-email",
              message: "Odkaz na docházku se neposílá, člen nemá e-mail.",
            }));
          }
          continue;
        }

        const token = generateAttendanceToken();
        const claim = await claimAttendanceLink({
          memberId: t.memberId,
          date: plan.today,
          tokenHash: hashAttendanceToken(token),
        });
        if (!claim) continue; // jiný běh už posílá nebo poslal

        const mail = buildMorningMail({
          name: t.name,
          date: plan.today,
          expiresAt: new Date(claim.expiresAt),
          excused: counts.excused,
          withSubstitute: counts.withSubstitute,
          url: buildAttendanceLinkUrl(deps.appUrl, token),
          internal: morningInternal,
        });
        const res = await safeSend(() => sendLink({ memberId: t.memberId, to: t.email as string, mail }));
        if (res.success) {
          result.linksSent++;
          try {
            await markLinkSent(claim.linkId, res.resendId ?? null);
          } catch (err) {
            // Mail odešel, ale odkaz nebude fungovat, dokud další běh nepošle nový.
            console.error(`[attendance-cron] markLinkSent failed: ${errClass(err)}`);
          }
          await emit(() => ({
            kind: "attendance.link-sent",
            severity: "info",
            meetingDate: plan.today,
            memberId: t.memberId,
            memberName: t.name,
            resendEmailId: res.resendId ?? null,
            message: "Odkaz na docházku odeslán.",
          }));
        } else {
          result.linksFailed++;
          await emit(() => ({
            kind: "attendance.link-failed",
            severity: "error",
            meetingDate: plan.today,
            memberId: t.memberId,
            memberName: t.name,
            code: "send-failed",
            message: "Odkaz na docházku se nepodařilo odeslat.",
          }));
        }
        await sleep(pauseMs);
      }
    } catch (err) {
      result.phaseErrors.push("links");
      console.error(`[attendance-cron] links phase failed: ${errClass(err)}`);
      await emit(() => ({
        kind: "cron.phase-failed",
        severity: "error",
        meetingDate: plan.today,
        code: "links",
        message: "Ranní odkazy na docházku selhaly.",
      }));
    }
  }

  // ── Uzavření dní a reporty ──────────────────────────────────

  for (const d of days) {
    try {
      await processDay(d, deps.appUrl, { sendReport, emit, result, pauseMs });
    } catch (err) {
      result.phaseErrors.push(`day:${d.date}`);
      console.error(`[attendance-cron] day ${d.date} failed: ${errClass(err)}`);
      await emit(() => ({
        kind: "cron.phase-failed",
        severity: "error",
        meetingDate: d.date,
        code: "day",
        message: "Uzavření dne docházky selhalo.",
      }));
    }
  }

  const failed = result.linksFailed + result.reportsFailed + result.phaseErrors.length;
  await emit(() => ({
    kind: "cron.finished",
    severity: failed > 0 ? "warn" : "info",
    meetingDate: plan.today,
    message: "Cron docházky dokončen.",
    detail: {
      phase: plan.phase,
      linksSent: result.linksSent,
      linksFailed: result.linksFailed,
      linksSkipped: result.linksSkipped,
      daysFinalized: result.daysFinalized,
      reportsSent: result.reportsSent,
      reportsFailed: result.reportsFailed,
      reportsSkipped: result.reportsSkipped,
    },
  }));

  return result;
}

async function safeSend(send: () => Promise<AttendanceMailResult>): Promise<AttendanceMailResult> {
  try {
    return await send();
  } catch (err) {
    console.error(`[attendance-cron] send threw: ${errClass(err)}`);
    return { success: false, error: "Mail se nepodařilo odeslat." };
  }
}

interface DayContext {
  sendReport: typeof sendAttendanceReportEmail;
  emit: (
    build: () => Omit<OpsEventInput, "runId" | "seq" | "source" | "actor">
  ) => Promise<void>;
  result: AttendanceCronResult;
  pauseMs: number;
}

/**
 * Uzavře den (když ještě není) a pošle report příjemcům, kteří ho nemají.
 * Pořadí (LL-003, bez transakce): doplnění řádků, označení dne, claim příjemce,
 * mail, `sent_at`. Zpětné opravy po uzávěrce report neposílají (nikdo nevolá
 * tuhle funkci pro den uzavřený před víc než `REPORT_RESUME_HOURS`).
 */
async function processDay(
  day: { date: string; late: boolean; state: CloseState },
  appUrl: string,
  ctx: DayContext
): Promise<void> {
  const { date, late } = day;
  const { emit, result } = ctx;
  let state = day.state;
  let finalizedNow = false;

  if (!state.finalized) {
    const mode: DayMode = state.hasManagerRecord ? "recorded" : "unrecorded";
    await fillDayRows(date, mode);
    finalizedNow = (await markDayFinalized({ date, mode, late })) !== null;
    state = await getCloseState(date);
    if (finalizedNow) result.daysFinalized.push(date);
  }

  const rows = await loadReportRows(date);
  const data: ReportData = {
    date,
    hasMeeting: state.hasMeeting,
    internal: !state.hasMeeting && state.hasInternal,
    mode: state.mode ?? "recorded",
    late: state.reportLate,
    members: rows.members,
    writers: rows.writers,
    lastChange: rows.lastChange,
  };

  if (finalizedNow) {
    await emit(() => ({
      kind: "attendance.day-finalized",
      severity: "info",
      meetingDate: date,
      // Security L-1: žádné počty účasti ani jména, /status vidí i moderátor.
      message: "Den uzavřen.",
      detail: { mode: data.mode, late },
    }));
  }

  const recipients = await listReportRecipients(date, true);
  if (recipients.length === 0 && finalizedNow) {
    result.reportsSkipped++;
    await emit(() => ({
      kind: "attendance.report-skipped",
      severity: "warn",
      meetingDate: date,
      code: "no-recipient",
      message: "Report docházky nemá žádného příjemce.",
    }));
    return;
  }

  const url = `${appUrl.replace(/\/+$/, "")}/dochazka/zapis?d=${date}`;
  for (const r of recipients) {
    const claimed = await claimReportMail(date, r.memberId);
    if (!claimed) continue; // jiný běh už posílá nebo poslal

    if (!r.email) {
      result.reportsSkipped++;
      await emit(() => ({
        kind: "attendance.report-skipped",
        severity: "warn",
        meetingDate: date,
        memberId: r.memberId,
        memberName: r.name,
        code: "no-email",
        message: "Report docházky se neposílá, člen nemá e-mail.",
      }));
      continue;
    }

    const mail = buildAttendanceReport({ data, recipientName: r.name, url });
    const res = await safeSend(() => ctx.sendReport({ memberId: r.memberId, to: r.email as string, mail }));
    if (res.success) {
      result.reportsSent++;
      try {
        await markReportSent(date, r.memberId, res.resendId ?? null);
      } catch (err) {
        console.error(`[attendance-cron] markReportSent failed: ${errClass(err)}`);
      }
      await emit(() => ({
        kind: "attendance.report-sent",
        severity: "info",
        meetingDate: date,
        memberId: r.memberId,
        memberName: r.name,
        resendEmailId: res.resendId ?? null,
        message: "Report docházky odeslán.",
      }));
    } else {
      result.reportsFailed++;
      await emit(() => ({
        kind: "attendance.report-failed",
        severity: "error",
        meetingDate: date,
        memberId: r.memberId,
        memberName: r.name,
        code: "send-failed",
        message: "Report docházky se nepodařilo odeslat.",
      }));
    }
    await sleep(ctx.pauseMs);
  }
}
