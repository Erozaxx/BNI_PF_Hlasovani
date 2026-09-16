/**
 * Rozhodnutí o čtvrtečním varovném mailu management týmu (arch iter-026
 * T-001, sekce 3.4 a 7). Funkce vrací hotový `subject` a `lines` — modul,
 * který mail odesílá (lib/email/resend.ts, sendVotingWarningEmail), už nic
 * nerozhoduje ani neformátuje.
 *
 * Čistý modul bez DB: žádný import drizzle-orm, @/lib/db/*, next/server,
 * next/cache ani resend. Jde spustit v holém Node (tsx) bez DATABASE_URL —
 * viz scripts/test-warning-plan.ts. Import `./statusLabel` je relativní a
 * bezimportní (jen datový objekt), takže tuhle podmínku neporušuje.
 */
import { statusLabel } from "./statusLabel";

export type WarningKind =
  | "no-meeting"
  | "dispatch-failed"
  | "not-voting"
  | "partial-send";

export interface WarningMeeting {
  id: string;
  date: string; // "YYYY-MM-DD"
  status: string;
}

export interface WarningInput {
  weekdayPrague: string; // "Thursday", "Monday", ...
  todayIso: string; // "YYYY-MM-DD"
  meeting: WarningMeeting | null; // stav PO fázi 2
  /** ok:false výsledek dispatchu z fáze 2, jinak null. Viz arch 2.6.1. */
  dispatchFailure: { code: string; message: string } | null;
  failedRecipients: { memberName: string; reason: string }[];
  membersWithoutEmail: { memberName: string }[];
  /**
   * iter-028 (T-005, arch 3.7, D8): výsledek ranního `deferred-send` cíle
   * MIMO čtvrtek, jen když je to PRVNÍ den, kdy tenhle dispatch aspoň něco
   * poslal nebo se o to pokusil (`isFirstDispatch`, morning-dispatch.ts) —
   * jinak by varování spamovalo každé ráno, dokud se poslední člen nedošle
   * (R10). `null`, když se ten den žádný `deferred-send` cíl nekonal, nebo
   * konal a byl to routinní dosílání, ne první den.
   */
  deferredFirstDispatch: {
    meeting: WarningMeeting;
    dispatchFailure: { code: string; message: string } | null;
    failedRecipients: { memberName: string; reason: string }[];
  } | null;
}

export type WarningDecision =
  | { warn: false; reason: "not-thursday" | "voting-ok" }
  | {
      warn: true;
      kind: WarningKind;
      subject: string;
      lines: string[];
      meetingId: string | null;
    };

// process.env je globální Node API, ne import next/drizzle/resend — smí se
// číst i v tomto čistém modulu (stejný vzor jako route.ts:216).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * iter-028 (T-005, arch 3.7): po ranním běhu už samotné "Spustit hlasovani"
 * nic nepošle — kliknutí jen založí odkazy a schůzku (deliver:"defer").
 * Doplňuje se k výzvám no-meeting, not-voting a dispatch-failed (jen
 * no-guests/infra-error), kde admin po zásahu čeká na odeslání.
 */
const RESEND_NOW_HINT =
  'Potom klikněte na „Rozeslat hned", jinak odkazy odejdou až zítra ráno.';

/** "YYYY-MM-DD" -> "DD.MM.YYYY" (predmet mailu, bez mezer, dle 7.3 doslova). */
function formatDateDot(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** "YYYY-MM-DD" -> "D. M. YYYY" (telo mailu, dle 7.3 doslova). */
function formatDateCz(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

/**
 * Řádek o členech bez e-mailu — přidává se jen tehdy, když nějací jsou, a
 * jen k mailu, který už padá z jiného důvodu (sám o sobě nespouští
 * varování, arch 3.4 a sekce 12 A5).
 */
function withoutEmailLine(membersWithoutEmail: { memberName: string }[]): string[] {
  if (membersWithoutEmail.length === 0) return [];
  const names = membersWithoutEmail.map((m) => m.memberName).join(", ");
  return [`Členové bez e-mailové adresy (odkaz jim nelze poslat): ${names}`];
}

/**
 * Poslední řádek `dispatch-failed` mailu se liší podle guard kódu (arch
 * 7.3): `no-guests` posílá doplnit hosty, `no-recipients` na správu členů,
 * `conflict` na kolidující schůzku. `infra-error` (T-006r, MAJOR-1 review)
 * není guard — cron narazil na skutečnou infrastrukturní chybu (např.
 * výpadek DB) mimo pět guard kódů — dostává proto vlastní text, který
 * neříká "doplňte data", protože se schůzkou samotnou nic v nepořádku není.
 * Ostatní kódy (`meeting-closed`, `not-found`) nejsou v 2.6.1 očekávané pro
 * čtvrteční dispatch stejné schůzky, ale dostávají obecný, pořád konkrétní
 * odkaz na detail schůzky — nikdy "zkontrolujte prosím stav systému".
 */
function dispatchFailureAction(code: string, meetingId: string): string {
  if (code === "no-guests") {
    return `Co s tím: otevřete ${APP_URL}/meetings/${meetingId}, doplňte hosty a klikněte na „Spustit hlasování".`;
  }
  if (code === "no-recipients") {
    return `Co s tím: otevřete ${APP_URL}/admin/members a doplňte e-mailovou adresu alespoň jednomu členovi.`;
  }
  if (code === "conflict") {
    return `Co s tím: otevřete ${APP_URL}/meetings, vyřešte kolidující schůzku a pak spusťte hlasování znovu.`;
  }
  if (code === "infra-error") {
    return `Co s tím: nejde o chybějící data, ale o výpadek infrastruktury (např. databáze) během spouštění. Zkontrolujte Vercel logy a zkuste hlasování spustit ručně na ${APP_URL}/meetings/${meetingId}.`;
  }
  return `Co s tím: otevřete ${APP_URL}/meetings/${meetingId} a zkontrolujte stav schůzky.`;
}

/**
 * Rozhodne, jestli a jaké varování odejde management týmu.
 *
 * Pravidla, v tomto pořadí (arch 3.4, 3.7, D8):
 * 1. weekdayPrague !== "Thursday" -> delegováno na `decideDeferredFirstDispatch`
 *    (iter-028, D8: varování i mimo čtvrtek, ale jen při prvním rozeslání).
 * 2. meeting === null -> { warn:true, kind:"no-meeting" }
 * 3. dispatchFailure !== null -> { warn:true, kind:"dispatch-failed" } —
 *    cron se pokusil hlasování spustit a guard ho odmítl (arch 2.6.1).
 *    Musí stát PŘED pravidlem 4, jinak by nastaly dvě tiché díry (arch 3.4).
 * 4. meeting.status !== "voting" -> { warn:true, kind:"not-voting" }
 *    (pokrývá draft, active i closed)
 * 5. failedRecipients.length > 0 -> { warn:true, kind:"partial-send" }
 * 6. jinak -> { warn:false, reason:"voting-ok" }
 */
export function decideThursdayWarning(input: WarningInput): WarningDecision {
  const {
    weekdayPrague,
    todayIso,
    meeting,
    dispatchFailure,
    failedRecipients,
    membersWithoutEmail,
    deferredFirstDispatch,
  } = input;

  if (weekdayPrague !== "Thursday") {
    return decideDeferredFirstDispatch(deferredFirstDispatch);
  }

  if (meeting === null) {
    return {
      warn: true,
      kind: "no-meeting",
      subject: `BNI Hlasovani - VAROVANI: na dnesek (${formatDateDot(todayIso)}) neni zadna schuzka`,
      lines: [
        "Dnes je čtvrtek a v systému není schůzka s dnešním datem. Hlasování proto neběží a členům nic nepřišlo.",
        `Co s tím: založte schůzku a spusťte hlasování na ${APP_URL}/meetings.`,
        RESEND_NOW_HINT,
      ],
      meetingId: null,
    };
  }

  if (dispatchFailure !== null) {
    const hint =
      dispatchFailure.code === "no-guests" || dispatchFailure.code === "infra-error"
        ? [RESEND_NOW_HINT]
        : [];
    return {
      warn: true,
      kind: "dispatch-failed",
      subject: `BNI Hlasovani - VAROVANI: hlasovani ke schuzce ${formatDateDot(meeting.date)} nelze spustit`,
      lines: [
        `Cron se dnes ráno pokusil spustit hlasování ke schůzce ${formatDateCz(meeting.date)} a neuspěl. Členům nic nepřišlo a schůzka zůstala ve stavu „${statusLabel[meeting.status] ?? meeting.status}".`,
        `Důvod: ${dispatchFailure.message}`,
        dispatchFailureAction(dispatchFailure.code, meeting.id),
        ...hint,
        ...withoutEmailLine(membersWithoutEmail),
      ],
      meetingId: meeting.id,
    };
  }

  if (meeting.status !== "voting") {
    return {
      warn: true,
      kind: "not-voting",
      subject: `BNI Hlasovani - VAROVANI: hlasovani ke schuzce ${formatDateDot(meeting.date)} nebezi`,
      lines: [
        `Schůzka na ${formatDateCz(meeting.date)} je ve stavu „${statusLabel[meeting.status] ?? meeting.status}" a hlasování se nepodařilo spustit automaticky. Členům nepřišel odkaz.`,
        `Co s tím: otevřete ${APP_URL}/meetings/${meeting.id} a klikněte na „Spustit hlasování".`,
        RESEND_NOW_HINT,
        ...withoutEmailLine(membersWithoutEmail),
      ],
      meetingId: meeting.id,
    };
  }

  if (failedRecipients.length > 0) {
    return {
      warn: true,
      kind: "partial-send",
      subject: `BNI Hlasovani - VAROVANI: ${failedRecipients.length} clenum neprisel odkaz (schuzka ${formatDateDot(meeting.date)})`,
      lines: [
        "Hlasování běží, ale odkaz nedorazil těmto členům:",
        ...failedRecipients.map((r) => `- ${r.memberName} — ${r.reason}`),
        ...withoutEmailLine(membersWithoutEmail),
        `Co s tím: ${APP_URL}/meetings/${meeting.id} → sekce „Magic linky členů" → „Poslat email" u konkrétního člena.`,
      ],
      meetingId: meeting.id,
    };
  }

  return { warn: false, reason: "voting-ok" };
}

/**
 * D8 (arch 3.7): varování i mimo čtvrtek, ale JEN při prvním dni, kdy ranní
 * `deferred-send` cíl aspoň něco poslal nebo se o to pokusil — volající
 * (close-voting/route.ts) sem předá `deferredFirstDispatch` pouze tehdy,
 * když `isFirstDispatch` (morning-dispatch.ts) vyšlo `true`; každodenní
 * dosílání zbylých členů (routine catch-up) sem nikdy nedorazí (R10, žádný
 * spam). `null` znamená "dnes se žádný takový cíl nekonal, nebo to nebyl
 * první den" -> reason zůstává "not-thursday" ze stejného důvodu, proč
 * čtvrtek sám o sobě nevaruje: nic špatného se nestalo.
 */
function decideDeferredFirstDispatch(
  d: WarningInput["deferredFirstDispatch"]
): WarningDecision {
  if (d === null) {
    return { warn: false, reason: "not-thursday" };
  }

  if (d.dispatchFailure !== null) {
    return {
      warn: true,
      kind: "dispatch-failed",
      subject: `BNI Hlasovani - VAROVANI: rozeslani odkazu ke schuzce ${formatDateDot(d.meeting.date)} selhalo`,
      lines: [
        `Ranní rozeslání hlasovacích odkazů ke schůzce ${formatDateCz(d.meeting.date)} dnes selhalo. Členům, kteří odkaz ještě neměli, nic nepřišlo.`,
        `Důvod: ${d.dispatchFailure.message}`,
        dispatchFailureAction(d.dispatchFailure.code, d.meeting.id),
      ],
      meetingId: d.meeting.id,
    };
  }

  if (d.failedRecipients.length > 0) {
    return {
      warn: true,
      kind: "partial-send",
      subject: `BNI Hlasovani - VAROVANI: ${d.failedRecipients.length} clenum neprisel odkaz (schuzka ${formatDateDot(d.meeting.date)})`,
      lines: [
        "Ranní rozeslání proběhlo, ale odkaz nedorazil těmto členům:",
        ...d.failedRecipients.map((r) => `- ${r.memberName} — ${r.reason}`),
        `Co s tím: ${APP_URL}/meetings/${d.meeting.id} → sekce „Magic linky členů" → „Poslat email" u konkrétního člena.`,
      ],
      meetingId: d.meeting.id,
    };
  }

  return { warn: false, reason: "voting-ok" };
}
