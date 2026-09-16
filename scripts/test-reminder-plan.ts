/**
 * Testy pro lib/meetings/reminder-plan.ts (iter-028, T-006) — arch iter-028
 * T-001, sekce 8.2 (RP1 az RP11).
 *
 * Bez DATABASE_URL, bez site, bez CI — vzor je scripts/test-ops-events.ts.
 * Spusteni: npm run test:reminder-plan
 */
import assert from "node:assert/strict";
import {
  planReminders,
  reminderRoundFor,
  shouldStopForBudget,
  type ReminderInput,
  type ReminderMemberInput,
  type ReminderLinkInput,
} from "../lib/meetings/reminder-plan";

const CLOSES = new Date("2026-09-30T21:59:59Z");

/** 27 clenu "Clen 01".."Clen 27" — jmena uz jsou serazena lexikograficky,
 * "Clen 05" ma navic duplicitu s jinym memberId pro test tiebreaku (RP10). */
function baselineMembers(): ReminderMemberInput[] {
  const members: ReminderMemberInput[] = [];
  for (let i = 1; i <= 26; i++) {
    const n = String(i).padStart(2, "0");
    members.push({ memberId: `m${n}`, memberName: `Clen ${n}`, memberEmail: `clen${n}@example.com` });
  }
  members.push({ memberId: "m05b", memberName: "Clen 05", memberEmail: "clen05b@example.com" });
  return members;
}

function baselineLinks(sentAt = "2026-09-24T05:40:00Z"): ReminderLinkInput[] {
  return baselineMembers().map((m) => ({
    memberId: m.memberId,
    revokedAt: null,
    linkEmailSentAt: new Date(sentAt),
  }));
}

function baselineInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    now: new Date("2026-09-26T05:30:00Z"), // round 1 den (diff 4 od uzaverky)
    meeting: {
      id: "meeting-1",
      date: "2026-09-24",
      status: "voting",
      votingClosesAt: CLOSES,
      votableGuestCount: 2,
    },
    members: baselineMembers(),
    links: baselineLinks(),
    votedMemberIds: [],
    claimed: [],
    ...overrides,
  };
}

type TestCase = { name: string; run: () => void };

const cases: TestCase[] = [
  {
    name: "RP1. reminderRoundFor: 26./28./30.9. 05:30Z -> 1/2/3; 24.,25.,27.,29.9. -> null",
    run: () => {
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-26T05:30:00Z")), 1);
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-28T05:30:00Z")), 2);
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-30T05:30:00Z")), 3);
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-24T05:30:00Z")), null);
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-25T05:30:00Z")), null);
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-27T05:30:00Z")), null);
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-29T05:30:00Z")), null);
    },
  },
  {
    name: "RP2. reminderRoundFor: 1s pred uzaverkou -> 3; presne v uzaverce -> null",
    run: () => {
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-30T21:59:58Z")), 3);
      assert.equal(reminderRoundFor(CLOSES, new Date("2026-09-30T22:00:00Z")), null);
    },
  },
  {
    name: "RP3. reminderRoundFor pres podzimni a jarni zmenu casu",
    run: () => {
      const closesAutumn = new Date("2026-10-28T22:59:59Z");
      assert.equal(reminderRoundFor(closesAutumn, new Date("2026-10-24T05:59:00Z")), 1);
      assert.equal(reminderRoundFor(closesAutumn, new Date("2026-10-26T05:00:00Z")), 2);
      assert.equal(reminderRoundFor(closesAutumn, new Date("2026-10-28T05:30:00Z")), 3);

      const closesSpring = new Date("2027-03-31T21:59:59Z");
      assert.equal(reminderRoundFor(closesSpring, new Date("2027-03-27T05:30:00Z")), 1);
      assert.equal(reminderRoundFor(closesSpring, new Date("2027-03-29T05:30:00Z")), 2);
    },
  },
  {
    name: "RP4. planReminders: status closed / votableGuestCount 0 -> run:false not-voting / no-votable-guests",
    run: () => {
      const closed = planReminders(
        baselineInput({ meeting: { ...baselineInput().meeting, status: "closed" } })
      );
      if (closed.run) throw new Error("unreachable");
      assert.equal(closed.reason, "not-voting");

      const noGuests = planReminders(
        baselineInput({ meeting: { ...baselineInput().meeting, votableGuestCount: 0 } })
      );
      if (noGuests.run) throw new Error("unreachable");
      assert.equal(noGuests.reason, "no-votable-guests");
    },
  },
  {
    name: "RP5. vychozi, kolo 1 -> 27x send; clen A hlasoval -> A voted, 26x send",
    run: () => {
      const plan = planReminders(baselineInput());
      assert.equal(plan.run, true);
      if (!plan.run) throw new Error("unreachable");
      assert.equal(plan.round, 1);
      assert.equal(plan.toSend.length, 27);

      const withVote = planReminders(baselineInput({ votedMemberIds: ["m01"] }));
      assert.equal(withVote.run, true);
      if (!withVote.run) throw new Error("unreachable");
      assert.equal(withVote.toSend.length, 26);
      const rowA = withVote.rows.find((r) => r.memberId === "m01");
      assert.deepEqual(rowA?.action, { kind: "skip", reason: "voted" });
    },
  },
  {
    name: "RP6. B revokovany, C bez odkazu, D bez emailu, E znacka null -> revoked/no-link/no-email/link-not-sent",
    run: () => {
      const members: ReminderMemberInput[] = [
        { memberId: "B", memberName: "B", memberEmail: "b@example.com" },
        { memberId: "C", memberName: "C", memberEmail: "c@example.com" },
        { memberId: "D", memberName: "D", memberEmail: null },
        { memberId: "E", memberName: "E", memberEmail: "e@example.com" },
      ];
      const links: ReminderLinkInput[] = [
        { memberId: "B", revokedAt: new Date("2026-09-01T00:00:00Z"), linkEmailSentAt: new Date("2026-09-24T05:40:00Z") },
        // C: bez odkazu (chybi v poli links)
        { memberId: "E", revokedAt: null, linkEmailSentAt: null },
      ];
      const plan = planReminders(
        baselineInput({ members, links, meeting: { ...baselineInput().meeting, votableGuestCount: 1 } })
      );
      assert.equal(plan.run, true);
      if (!plan.run) throw new Error("unreachable");
      const byId = new Map(plan.rows.map((r) => [r.memberId, r.action]));
      assert.deepEqual(byId.get("B"), { kind: "skip", reason: "revoked" });
      assert.deepEqual(byId.get("C"), { kind: "skip", reason: "no-link" });
      assert.deepEqual(byId.get("D"), { kind: "skip", reason: "no-email" });
      assert.deepEqual(byId.get("E"), { kind: "skip", reason: "link-not-sent" });
    },
  },
  {
    name: "RP7. znacka F 09-25T22:30Z (26.9. Praha) -> link-sent-today; G 09-25T21:30Z (25.9. Praha) -> send",
    run: () => {
      const members: ReminderMemberInput[] = [
        { memberId: "F", memberName: "F", memberEmail: "f@example.com" },
        { memberId: "G", memberName: "G", memberEmail: "g@example.com" },
      ];
      const links: ReminderLinkInput[] = [
        { memberId: "F", revokedAt: null, linkEmailSentAt: new Date("2026-09-25T22:30:00Z") },
        { memberId: "G", revokedAt: null, linkEmailSentAt: new Date("2026-09-25T21:30:00Z") },
      ];
      const plan = planReminders(
        baselineInput({
          members,
          links,
          now: new Date("2026-09-26T05:30:00Z"),
          meeting: { ...baselineInput().meeting, votableGuestCount: 1 },
        })
      );
      assert.equal(plan.run, true);
      if (!plan.run) throw new Error("unreachable");
      const byId = new Map(plan.rows.map((r) => [r.memberId, r.action]));
      assert.deepEqual(byId.get("F"), { kind: "skip", reason: "link-sent-today" });
      assert.deepEqual(byId.get("G"), { kind: "send" });
    },
  },
  {
    name: "RP8. claimed (H,1); kolo 1 -> already-reminded, kolo 2 -> send",
    run: () => {
      const members: ReminderMemberInput[] = [
        { memberId: "H", memberName: "H", memberEmail: "h@example.com" },
      ];
      const links: ReminderLinkInput[] = [
        { memberId: "H", revokedAt: null, linkEmailSentAt: new Date("2026-09-24T05:40:00Z") },
      ];
      const claimed = [{ memberId: "H", round: 1 }];

      const round1 = planReminders(
        baselineInput({
          members,
          links,
          claimed,
          now: new Date("2026-09-26T05:30:00Z"),
          meeting: { ...baselineInput().meeting, votableGuestCount: 1 },
        })
      );
      assert.equal(round1.run, true);
      if (!round1.run) throw new Error("unreachable");
      assert.equal(round1.round, 1);
      assert.deepEqual(round1.rows[0].action, { kind: "skip", reason: "already-reminded" });

      const round2 = planReminders(
        baselineInput({
          members,
          links,
          claimed,
          now: new Date("2026-09-28T05:30:00Z"),
          meeting: { ...baselineInput().meeting, votableGuestCount: 1 },
        })
      );
      assert.equal(round2.run, true);
      if (!round2.run) throw new Error("unreachable");
      assert.equal(round2.round, 2);
      assert.deepEqual(round2.rows[0].action, { kind: "send" });
    },
  },
  {
    name: "RP9. pozdni start: vsechny znacky 2026-09-26T05:40Z, now 26.9. 05:50Z -> 0x send",
    run: () => {
      const plan = planReminders(
        baselineInput({
          links: baselineLinks("2026-09-26T05:40:00Z"),
          now: new Date("2026-09-26T05:50:00Z"),
        })
      );
      assert.equal(plan.run, true);
      if (!plan.run) throw new Error("unreachable");
      assert.equal(plan.round, 1);
      assert.equal(plan.toSend.length, 0);
      assert.ok(plan.rows.every((r) => r.action.kind === "skip" && r.action.reason === "link-sent-today"));
    },
  },
  {
    name: "RP10. 27 radku, serazeno cs + memberId tiebreak, soucty = 27",
    run: () => {
      const plan = planReminders(baselineInput());
      assert.equal(plan.run, true);
      if (!plan.run) throw new Error("unreachable");
      assert.equal(plan.rows.length, 27);

      for (let i = 1; i < plan.rows.length; i++) {
        const prev = plan.rows[i - 1];
        const cur = plan.rows[i];
        const cmp = prev.memberName.localeCompare(cur.memberName, "cs");
        assert.ok(cmp < 0 || (cmp === 0 && prev.memberId.localeCompare(cur.memberId) < 0));
      }
      // Dva "Clen 05" (m05, m05b) — tiebreak podle memberId, ne nahodne.
      const dup = plan.rows.filter((r) => r.memberName === "Clen 05");
      assert.equal(dup.length, 2);
      assert.equal(dup[0].memberId, "m05");
      assert.equal(dup[1].memberId, "m05b");

      const c = plan.counts;
      const sum =
        c.toSend +
        c.skippedNoEmail +
        c.skippedNoLink +
        c.skippedRevoked +
        c.skippedLinkNotSent +
        c.skippedLinkSentToday +
        c.skippedVoted +
        c.skippedAlreadyReminded;
      assert.equal(sum, 27);
      assert.equal(c.total, 27);
    },
  },
  {
    name: "RP11. shouldStopForBudget: t0+39999 -> false; t0+40000 -> true",
    run: () => {
      const t0 = new Date("2026-09-26T05:00:00Z");
      assert.equal(shouldStopForBudget(t0, new Date(t0.getTime() + 39_999)), false);
      assert.equal(shouldStopForBudget(t0, new Date(t0.getTime() + 40_000)), true);
    },
  },
];

let passed = 0;
let failed = 0;

function main() {
  for (const testCase of cases) {
    try {
      testCase.run();
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

main();
