/**
 * Plán rozeslání hlasovacích odkazů — rozhoduje, komu se zakládá odkaz a
 * komu se posílá mail. Nedělá nic jiného (arch iter-026 T-001, sekce 3.2).
 *
 * Čistý modul bez DB: žádný import drizzle-orm, @/lib/db/*, next/server,
 * next/cache ani resend. Jde spustit v holém Node (tsx) bez DATABASE_URL —
 * viz scripts/test-voting-plan.ts.
 */

export type DispatchMode = "start" | "resend";
export type SkipReason = "inactive" | "no-email" | "revoked" | "already-sent";

export interface PlanMember {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  /**
   * iter-037 (T-003b, arch 5.2): člen je aktivní k dnešku (`isMemberActive`).
   * Neaktivní dostane `skip "inactive"` PŘED `no-email`, odkaz se mu nezakládá
   * a do „Rozesláno X z Y“ se nepočítá.
   */
  active: boolean;
}

export interface PlanLink {
  memberId: string;
  revokedAt: Date | null;
  linkEmailSentAt: Date | null; // = meeting_member_link.morning_email_sent_at
}

export interface PlanInput {
  members: PlanMember[]; // VŠICHNI členové, i bez e-mailu
  links: PlanLink[]; // existující meeting_member_link pro tuto schůzku
  mode: DispatchMode;
}

export type PlanAction =
  | { kind: "send"; createLink: boolean }
  | { kind: "skip"; reason: SkipReason };

export interface PlanRow {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  hasLink: boolean;
  action: PlanAction;
}

export interface DispatchPlan {
  rows: PlanRow[]; // vždy VŠICHNI členové, seřazeno
  toSend: PlanRow[]; // podmnožina rows s action.kind === "send"
  linksToCreate: string[]; // memberIds pro krok 5
  counts: {
    totalMembers: number;
    withEmail: number;
    willSend: number;
    skippedNoEmail: number;
    skippedRevoked: number;
    skippedAlreadySent: number;
    /** iter-037: deaktivovaní členové (řádky v `rows`, ale mimo `totalMembers`). */
    skippedInactive: number;
  };
}

/**
 * Rozhodne akci pro jednoho člena. Pravidla, v tomto pořadí (sekce 3.2):
 * 0. Neaktivní člen (iter-037) → skip "inactive". První, před "no-email".
 *    Odkaz se mu nezakládá.
 * 1. Člen bez e-mailu (null i "") → skip "no-email". Odkaz se mu nezakládá.
 * 2. Odkaz existuje a revokedAt != null → skip "revoked". Hromadné rozeslání
 *    revokaci nesmí přebít.
 * 3. Odkaz neexistuje → send s createLink: true (doplnění pro později
 *    přibylé členy, sekce 6).
 * 4. Odkaz existuje, není revokovaný:
 *    - mode === "start" a linkEmailSentAt != null → skip "already-sent"
 *    - jinak → send s createLink: false
 */
function planAction(
  member: PlanMember,
  link: PlanLink | undefined,
  mode: DispatchMode
): PlanAction {
  if (!member.active) {
    return { kind: "skip", reason: "inactive" };
  }
  if (!member.memberEmail) {
    return { kind: "skip", reason: "no-email" };
  }
  if (link && link.revokedAt !== null) {
    return { kind: "skip", reason: "revoked" };
  }
  if (!link) {
    return { kind: "send", createLink: true };
  }
  if (mode === "start" && link.linkEmailSentAt !== null) {
    return { kind: "skip", reason: "already-sent" };
  }
  return { kind: "send", createLink: false };
}

export function planVotingDispatch(input: PlanInput): DispatchPlan {
  const linkByMember = new Map(input.links.map((l) => [l.memberId, l]));

  const rows: PlanRow[] = input.members.map((member) => {
    const link = linkByMember.get(member.memberId);
    return {
      memberId: member.memberId,
      memberName: member.memberName,
      memberEmail: member.memberEmail,
      hasLink: link !== undefined,
      action: planAction(member, link, input.mode),
    };
  });

  // Řazení podle jména (cs), druhotný klíč memberId — bez něj by dva
  // stejnojmenní členové měnili pořadí mezi běhy a testovací případ na
  // pozici řádku by byl vrtkavý (případ 12).
  rows.sort((a, b) => {
    const byName = a.memberName.localeCompare(b.memberName, "cs");
    if (byName !== 0) return byName;
    return a.memberId.localeCompare(b.memberId);
  });

  const toSend = rows.filter((r) => r.action.kind === "send");
  const linksToCreate = rows
    .filter((r) => r.action.kind === "send" && r.action.createLink)
    .map((r) => r.memberId);

  const skippedNoEmail = rows.filter(
    (r) => r.action.kind === "skip" && r.action.reason === "no-email"
  ).length;
  const skippedRevoked = rows.filter(
    (r) => r.action.kind === "skip" && r.action.reason === "revoked"
  ).length;
  const skippedAlreadySent = rows.filter(
    (r) => r.action.kind === "skip" && r.action.reason === "already-sent"
  ).length;
  const skippedInactive = rows.filter(
    (r) => r.action.kind === "skip" && r.action.reason === "inactive"
  ).length;
  const activeRows = input.members.filter((m) => m.active);

  return {
    rows,
    toSend,
    linksToCreate,
    counts: {
      // iter-037: jen aktivní členové ("Rozesláno X z Y"), neaktivní jsou v `rows`
      // se `skip "inactive"`, ale do Y se nepočítají.
      totalMembers: activeRows.length,
      withEmail: activeRows.filter((m) => !!m.memberEmail).length,
      willSend: toSend.length,
      skippedNoEmail,
      skippedRevoked,
      skippedAlreadySent,
      skippedInactive,
    },
  };
}
