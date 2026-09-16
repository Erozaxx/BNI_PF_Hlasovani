/**
 * iter-028 (T-006) — DB vrstva pro `meeting_member_reminder` (arch iter-028
 * T-001, sekce 4.3, 4.4, 6.2, 12). Volá ji jen `lib/meetings/reminder-run.ts`
 * (fáze 8 cronu) — čisté moduly (reminder-plan.ts, reminder-template.ts)
 * dostávají hotová data jako argumenty a samy nikdy nesahají na DB.
 *
 * NENÍ čistý modul — importuje drizzle-orm a @/lib/db/*, stejně jako ostatní
 * soubory v lib/db/queries/.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import {
  meeting,
  meetingGuest,
  meetingMemberReminder,
  vote,
} from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

export type ReminderRoundNumber = 1 | 2 | 3;

/**
 * Zabrání jednoho kola pro jednoho člena — JEDEN příkaz, bez transakce
 * (LL-003), přesně SQL ze 4.3. Řádek se vybírá z `meeting_member_link`, ne
 * ze zadaných parametrů — proto se s ním zapíše i hash odkazu platného
 * v okamžiku zabrání (`link_token_hash`, D4 C, 4.5). Podmínky (v `WHERE`)
 * jsou tou samou zárukou "nejvýš jednou, nikdy po uzávěrce, nikdy u uzavřené
 * schůzky, nikdy s revokovaným nebo neodeslaným odkazem, nikdy tomu, kdo
 * hlasoval" jako vrstva 1 (`planReminders`) — vrstva 2, těsně před mailem.
 *
 * `tokenHash` je hash nového tokenu z připomínky (D4 C). Žádný vrácený řádek
 * (`null`) znamená "nezakládat, nic neposílat" — volající (reminder-run.ts)
 * to počítá jako `claimRejected`, ne jako chybu.
 */
export async function claimReminder(
  meetingId: string,
  memberId: string,
  round: ReminderRoundNumber,
  tokenHash: string | null
): Promise<string | null> {
  const result = await getDb().execute<{ id: string }>(sql`
    INSERT INTO meeting_member_reminder (meeting_id, member_id, round, token_hash, link_token_hash)
    SELECT l.meeting_id, l.member_id, ${round}, ${tokenHash}, l.token_hash
    FROM meeting_member_link l
    JOIN meeting m ON m.id = l.meeting_id
    WHERE l.meeting_id = ${meetingId} AND l.member_id = ${memberId}
      AND l.revoked_at IS NULL AND l.morning_email_sent_at IS NOT NULL
      AND m.status = 'voting' AND m.voting_closes_at > now()
      AND NOT EXISTS (
        SELECT 1 FROM vote v WHERE v.meeting_id = ${meetingId} AND v.member_id = ${memberId}
      )
    ON CONFLICT (meeting_id, member_id, round) DO NOTHING
    RETURNING id
  `);

  return result.rows[0]?.id ?? null;
}

/**
 * Zapíše `sent_at` po úspěšném odeslání (4.4 krok f) — obyčejný
 * `UPDATE ... WHERE id = $1`, idempotentní, BEZ TRANSAKCE (LL-003). `id` je
 * řádek vrácený `claimReminder`, takže žádný WHERE guard na stav navíc
 * netřeba — ten řádek už existuje a patří přesně tomuhle pokusu o odeslání.
 */
export async function markReminderSent(id: string, sentAt: Date): Promise<void> {
  await getDb()
    .update(meetingMemberReminder)
    .set({ sentAt })
    .where(eq(meetingMemberReminder.id, id));
}

/** Jedno zabrané kolo — jen pole potřebná pro pravidlo 7 (4.2, "already-reminded"). */
export interface ClaimedRound {
  memberId: string;
  round: number;
}

/**
 * Všechna zabraná kola pro schůzku (4.4 krok 3). Když tabulka chybí (merge
 * před migrací), tenhle SELECT je první, který padne na `42P01` — DŘÍV, než
 * cokoli pošle mail (6.5).
 */
export async function getClaimedRounds(meetingId: string): Promise<ClaimedRound[]> {
  return getDb()
    .select({
      memberId: meetingMemberReminder.memberId,
      round: meetingMemberReminder.round,
    })
    .from(meetingMemberReminder)
    .where(eq(meetingMemberReminder.meetingId, meetingId));
}

/**
 * Distinct member_id z `vote` pro schůzku (4.2 pravidlo 6, 4.4 krok 3) — kdo
 * dal aspoň jeden hlas, další kolo nedostane bez ohledu na to, kolika hostům
 * hlasoval.
 */
export async function getVotedMemberIds(meetingId: string): Promise<Set<string>> {
  const rows = await getDb()
    .selectDistinct({ memberId: vote.memberId })
    .from(vote)
    .where(eq(vote.meetingId, meetingId));

  return new Set(rows.map((r) => r.memberId));
}

/**
 * Počet hlasovatelných hostů schůzky (4.2: "aspoň 1 host s voting_enabled").
 * `count()` místo načtení všech ID — planReminders potřebuje jen číslo, ne
 * seznam (na rozdíl od `getGuestIdsForMeeting` v lib/db/queries/meetings.ts,
 * které vrací Set pro jiné volající).
 */
export async function getVotableGuestCount(meetingId: string): Promise<number> {
  const rows = await getDb()
    .select({ value: sql<number>`count(*)` })
    .from(meetingGuest)
    .where(
      and(
        eq(meetingGuest.meetingId, meetingId),
        eq(meetingGuest.votingEnabled, true)
      )
    );

  return Number(rows[0]?.value ?? 0);
}

/** Schůzka pro fázi 8 (4.4 krok 1) — jen pole, která `planReminders` potřebuje. */
export interface VotingMeetingForReminders {
  id: string;
  date: string;
  status: string;
  votingClosesAt: Date;
}

/**
 * Běžící hlasování s vyplněnou uzávěrkou (4.4 krok 1). `null`, když žádné
 * neběží — fáze 8 skončí bez zápisu (arch 4.4: "Žádná → konec, bez
 * zápisu"). Guard iter-026 drží nejvýš jedno běžící hlasování, `limit(1)` je
 * tedy defenzivní, ne rozhodující.
 */
export async function getVotingMeetingForReminders(): Promise<VotingMeetingForReminders | null> {
  const rows = await getDb()
    .select({
      id: meeting.id,
      date: meeting.date,
      status: meeting.status,
      votingClosesAt: meeting.votingClosesAt,
    })
    .from(meeting)
    .where(and(eq(meeting.status, "voting"), isNotNull(meeting.votingClosesAt)))
    .limit(1);

  const row = rows[0];
  if (!row || row.votingClosesAt === null) return null;

  return {
    id: row.id,
    date: row.date,
    status: row.status,
    votingClosesAt: row.votingClosesAt,
  };
}
