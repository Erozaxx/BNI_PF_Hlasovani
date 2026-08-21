/**
 * runVotingDispatch — jediné místo, kde se hlasování spouští (arch iter-026
 * T-001, sekce 2.2–2.6). Volá ho tlačítko StartVotingPanel i čtvrteční cron
 * (fáze 2, close-voting/route.ts) — rozdíl je jen `mode` a `actor`.
 *
 * NENÍ čistý modul — na rozdíl od voting-window.ts a voting-plan.ts smí a
 * musí importovat drizzle a lib/email/resend. Rozhodovací logika (kdy se co
 * děje) žije v těch dvou čistých modulech; tenhle soubor je jen DB + maily
 * podle jejich rozhodnutí, v přesném pořadí zápisů z tabulky 2.3.
 *
 * Bez db.transaction() (LL-003): osm kroků, sekvenčně, každý zápis
 * WHERE-guardovaný a idempotentní při opakování. Funkce sama nikdy
 * nevyhazuje výjimku pro žádný z pěti dokumentovaných guardů (sekce 2.6) —
 * ty se vrací jako `{ ok: false, code, error }`. Skutečná infrastrukturní
 * chyba (DB nedostupná uprostřed kroku 5–7) žádný z těch pěti kódů
 * nepopisuje správně, a proto se v takovém případě propaguje jako výjimka:
 * volající (route handler, cron) ji zachytí ve svém vlastním try/catch —
 * stejně jako to dělá zbytek repa (LL-003 vzor: bez transakce je bezpečné
 * kdykoli přerušit a zkusit znovu, viz komentáře u jednotlivých kroků).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meeting, meetingMemberLink } from "@/lib/db/schema";
import {
  getMeetingById,
  getMeetingGuestIds,
  hasActiveOrVotingMeeting,
  getConflictingMeeting,
} from "@/lib/db/queries/meetings";
import { getMembers } from "@/lib/db/queries/members";
import {
  getMeetingLinkRows,
  markLinkEmailSent,
} from "@/lib/db/queries/meeting-member-links";
import {
  generateMeetingToken,
  regenerateMeetingToken,
  buildMeetingMagicUrl,
} from "@/lib/auth/meeting-magic";
import { sendMeetingMagicLinkEmail } from "@/lib/email/resend";
import { nextWednesday2359InPrague, votingLinkExpiry } from "@/lib/meetings/voting-window";
import { planVotingDispatch, type DispatchMode } from "@/lib/meetings/voting-plan";

function getDb() {
  return drizzle(getSql());
}

export type { DispatchMode };

export interface DispatchOptions {
  mode: DispatchMode;
  actor: string; // memberId volajícího, nebo "cron"
  now?: Date; // injektovatelné pro testy; default new Date()
  sendDelayMs?: number; // default 250 (Resend limit 5 req/s)
}

export type DispatchOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: "no-email" | "revoked" | "already-sent" }
  | { status: "error"; reason: string };

export interface DispatchRecipient {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  linkCreated: boolean; // odkaz vznikl v tomto běhu
  outcome: DispatchOutcome;
}

export type VotingDispatchResult =
  | {
      ok: false;
      code: "not-found" | "meeting-closed" | "conflict" | "no-guests" | "no-recipients";
      error: string;
    }
  | {
      ok: true;
      meetingId: string;
      meetingDate: string; // "YYYY-MM-DD"
      mode: DispatchMode;
      statusBefore: string;
      statusAfter: string;
      transitioned: boolean; // krok 6 opravdu změnil řádek
      votingClosesAt: string; // ISO
      linkExpiresAt: string; // ISO
      totalMembers: number; // VŠICHNI členové v systému
      linksCreated: number;
      counts: { sent: number; skipped: number; error: number };
      recipients: DispatchRecipient[]; // VŠICHNI členové, nikdy zkrácené
      errors: string[]; // selhání mimo úroveň jednotlivce
    };

function formatCzDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

function formatCzDateTime(date: Date): string {
  const day = date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Prague",
  });
  const time = date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
  return `${day} ve ${time}`;
}

function conflictMessage(other: { date: string; votingClosesAt: Date | null }): string {
  const dateLabel = formatCzDate(other.date);
  if (other.votingClosesAt) {
    const closesLabel = formatCzDateTime(other.votingClosesAt);
    return `Hlasovani nelze spustit, protoze jeste bezi hlasovani ke schuzce ${dateLabel}. Uzavre se automaticky ${closesLabel}, nebo ho uzavrete rucne.`;
  }
  return `Hlasovani nelze spustit, protoze jeste bezi hlasovani ke schuzce ${dateLabel}. Uzavrete ho rucne.`;
}

/**
 * Jádro sjednocené cesty spuštění hlasování. Nikdy nevyhazuje výjimku pro
 * žádný z pěti guardů (2.6) — viz hlavičkový komentář souboru pro chybu
 * mimo tento rámec.
 */
export async function runVotingDispatch(
  meetingId: string,
  opts: DispatchOptions
): Promise<VotingDispatchResult> {
  const now = opts.now ?? new Date();
  const sendDelayMs = opts.sendDelayMs ?? 250;

  // Krok 1: SELECT schůzky
  const meetingRow = await getMeetingById(meetingId);
  if (!meetingRow) {
    return { ok: false, code: "not-found", error: "Schuzka nebyla nalezena." };
  }

  // Krok 2: Guardy — vyhodnocují se v tomto pořadí, hlásí se první, který padne (2.6)
  if (meetingRow.status === "closed") {
    return {
      ok: false,
      code: "meeting-closed",
      error: "Hlasovani nelze spustit, schuzka je jiz uzavrena.",
    };
  }

  const checkConflict = opts.mode === "start" && meetingRow.status !== "voting";
  if (checkConflict && (await hasActiveOrVotingMeeting(meetingId))) {
    const other = await getConflictingMeeting(meetingId);
    return {
      ok: false,
      code: "conflict",
      error: other
        ? conflictMessage(other)
        : "Hlasovani nelze spustit, jiz existuje aktivni nebo hlasovaci schuzka.",
    };
  }

  const guestIds = await getMeetingGuestIds(meetingId);
  if (guestIds.size === 0) {
    return {
      ok: false,
      code: "no-guests",
      error: "Hlasovani nelze spustit, schuzka nema zadneho hosta.",
    };
  }

  const allMembers = await getMembers();
  const membersWithEmail = allMembers.filter((m) => !!m.email);
  if (membersWithEmail.length === 0) {
    return {
      ok: false,
      code: "no-recipients",
      error: "Hlasovani nelze spustit, zadny clen nema e-mailovou adresu.",
    };
  }

  // Krok 3: votingClosesAt — u běžícího hlasování se ČTE z DB, nikdy se
  // nepřepočítává (jediné místo, kde by chybná implementace posunula
  // uzávěrku živého hlasování — arch 2.3, pseudokód doslova).
  const votingClosesAt =
    meetingRow.status === "voting" && meetingRow.votingClosesAt !== null
      ? meetingRow.votingClosesAt
      : nextWednesday2359InPrague(now);
  const linkExpiresAt = votingLinkExpiry(votingClosesAt);

  // Krok 4: SELECT členů + existujících odkazů, čistá funkce planVotingDispatch
  const existingLinks = await getMeetingLinkRows(meetingId);
  const plan = planVotingDispatch({
    members: allMembers.map((m) => ({
      memberId: m.id,
      memberName: m.name,
      memberEmail: m.email ?? null,
    })),
    links: existingLinks.map((l) => ({
      memberId: l.memberId,
      revokedAt: l.revokedAt,
      linkEmailSentAt: l.linkEmailSentAt,
    })),
    mode: opts.mode,
  });

  const db = getDb();
  const statusBefore = meetingRow.status;

  // Krok 5: INSERT chybějících meeting_member_link (ON CONFLICT DO NOTHING
  // uvnitř generateMeetingToken). Idempotentní — při opakování odkazy už
  // existují, tenhle krok je no-op.
  for (const memberId of plan.linksToCreate) {
    await generateMeetingToken(meetingId, memberId);
  }

  // Krok 6: UPDATE meeting status — WHERE guard drží draft/active -> voting,
  // schůzka ve stavu voting se nikdy nepřepíše (uzávěrka se opakovaným
  // kliknutím neprodlouží — to je záměr, ne vedlejší efekt).
  const transitionRows = await db
    .update(meeting)
    .set({ status: "voting", votingOpenAt: now, votingClosesAt })
    .where(and(eq(meeting.id, meetingId), sql`${meeting.status} IN ('draft', 'active')`))
    .returning({ id: meeting.id });
  const transitioned = transitionRows.length > 0;

  // Krok 6 (výjimka, R11): schůzka uvízlá ve voting s votingClosesAt IS NULL
  // — opravný UPDATE s guardem IS NULL, nemůže sáhnout na zdravé hlasování.
  if (!transitioned && statusBefore === "voting" && meetingRow.votingClosesAt === null) {
    await db
      .update(meeting)
      .set({ votingClosesAt })
      .where(
        and(
          eq(meeting.id, meetingId),
          eq(meeting.status, "voting"),
          isNull(meeting.votingClosesAt)
        )
      );
  }

  // Krok 7: expirace odkazů — všechny odkazy schůzky, stejná hodnota při
  // opakování (idempotentní).
  await db
    .update(meetingMemberLink)
    .set({ expiresAt: linkExpiresAt })
    .where(eq(meetingMemberLink.meetingId, meetingId));

  // Krok 8: pro každého příjemce regenerovat token, poslat mail, zapsat
  // značku AŽ PO úspěšném odeslání. Regeneruje se i pro odkaz založený v
  // kroku 5 — generateMeetingToken vrací syrový token i při ON CONFLICT DO
  // NOTHING, takže by neodpovídal uloženému hashi (R7).
  const recipients: DispatchRecipient[] = [];
  const errors: string[] = [];

  for (const row of plan.rows) {
    if (row.action.kind === "skip") {
      recipients.push({
        memberId: row.memberId,
        memberName: row.memberName,
        memberEmail: row.memberEmail,
        linkCreated: false,
        outcome: { status: "skipped", reason: row.action.reason },
      });
      continue;
    }

    const linkCreated = row.action.createLink;
    let outcome: DispatchOutcome;

    if (!row.memberEmail) {
      // Nemělo by nastat (plán garantuje email pro "send"), ale drží
      // typovou i běhovou konzistenci beze non-null assertion.
      outcome = { status: "error", reason: "member has no email" };
      errors.push(`member ${row.memberId}: has no email despite send action`);
    } else {
      try {
        const rawToken = await regenerateMeetingToken(meetingId, row.memberId);
        if (!rawToken) {
          throw new Error("regenerate token failed — no link row found");
        }
        const magicUrl = buildMeetingMagicUrl(rawToken);
        const emailResult = await sendMeetingMagicLinkEmail(
          row.memberEmail,
          magicUrl,
          row.memberName,
          meetingRow.date
        );
        if (!emailResult.success) {
          throw new Error(`email send failed: ${emailResult.error}`);
        }
        await markLinkEmailSent(meetingId, row.memberId, new Date());
        outcome = { status: "sent" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `[voting-dispatch] meeting=${meetingId} member=${row.memberId}: ${msg}`
        );
        errors.push(`member ${row.memberId}: ${msg}`);
        outcome = { status: "error", reason: msg };
      }
    }

    recipients.push({
      memberId: row.memberId,
      memberName: row.memberName,
      memberEmail: row.memberEmail,
      linkCreated,
      outcome,
    });

    if (sendDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sendDelayMs));
    }
  }

  const sent = recipients.filter((r) => r.outcome.status === "sent").length;
  const skipped = recipients.filter((r) => r.outcome.status === "skipped").length;
  const errorCount = recipients.filter((r) => r.outcome.status === "error").length;
  const statusAfter = transitioned ? "voting" : statusBefore;

  console.info(
    `[voting-dispatch] meeting=${meetingId} mode=${opts.mode} actor=${opts.actor} ` +
      `statusBefore=${statusBefore} statusAfter=${statusAfter} transitioned=${transitioned} ` +
      `sent=${sent} skipped=${skipped} errors=${errorCount} linksCreated=${plan.linksToCreate.length}`
  );

  return {
    ok: true,
    meetingId,
    meetingDate: meetingRow.date,
    mode: opts.mode,
    statusBefore,
    statusAfter,
    transitioned,
    votingClosesAt: votingClosesAt.toISOString(),
    linkExpiresAt: linkExpiresAt.toISOString(),
    totalMembers: plan.counts.totalMembers,
    linksCreated: plan.linksToCreate.length,
    counts: { sent, skipped, error: errorCount },
    recipients,
    errors,
  };
}
