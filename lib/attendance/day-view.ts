/**
 * iter-038 (T-003b, arch 6.4, 8): sestavení odpovědi pro zápis dne. Jedna
 * funkce pro stránku `/dochazka/zapis` (první vykreslení) i pro GET
 * `/api/attendance/[date]` (polling), aby se obě cesty nemohly rozejít.
 *
 * NENÍ čistý modul (čte DB přes lib/db/queries/attendance.ts).
 */
import { can, type PermissionHolder } from "@/lib/auth/permissions";
import {
  decideAttendanceWriteMode,
  dayBannerText,
  formatPragueTime,
  isGuardedDay,
  type DayPayload,
  type WriteCan,
} from "@/lib/attendance/sheet";
import { getDayMeta, listAuditForDate, listSheetRows, type DayMeta } from "@/lib/db/queries/attendance";
import { pragueToday } from "@/lib/members/activity";

export function writeCanFor(session: PermissionHolder | null | undefined): WriteCan {
  return {
    record: can(session, "attendance.record"),
    editHistory: can(session, "attendance.edit_history"),
  };
}

/** Režimy zápisu podle stavu dne a práv (server je počítá znovu u každého zápisu). */
export function modesFor(input: {
  date: string;
  today: string;
  meta: Pick<DayMeta, "finalized">;
  can: WriteCan;
}) {
  const { date, today, meta } = input;
  const presence = decideAttendanceWriteMode({ date, today, finalized: meta.finalized, can: input.can, op: "presence" });
  const excuse = decideAttendanceWriteMode({ date, today, finalized: meta.finalized, can: input.can, op: "excuse" });
  return { presence, excuse };
}

export async function loadDayPayload(
  date: string,
  session: PermissionHolder & { memberId: string }
): Promise<DayPayload> {
  const today = pragueToday();
  const meta = await getDayMeta(date);
  const modes = modesFor({ date, today, meta, can: writeCanFor(session) });
  const [rows, audit] = await Promise.all([
    listSheetRows(date),
    can(session, "attendance.audit_view") ? listAuditForDate(date) : Promise.resolve(null),
  ]);
  return {
    date,
    today,
    viewerId: session.memberId,
    mode: modes.presence.mode,
    excuseMode: modes.excuse.mode,
    banner: dayBannerText({
      mode: modes.presence.mode,
      date,
      today,
      finalized: meta.finalized,
      finalizedTime: meta.finalizedAt ? formatPragueTime(meta.finalizedAt) : null,
    }),
    unrecorded: meta.dayMode === "unrecorded",
    guardUnrecordedDay: isGuardedDay({
      date,
      today,
      mode: modes.presence.mode,
      hasMeeting: meta.hasMeeting,
      hasManagerRecord: meta.hasManagerRecord,
    }),
    finalized: meta.finalized,
    rows,
    audit,
  };
}
