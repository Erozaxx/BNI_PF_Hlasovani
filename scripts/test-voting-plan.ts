/**
 * Testy pro lib/meetings/voting-plan.ts (iter-026, T-005).
 *
 * Bez DATABASE_URL, bez sítě, bez CI — vzor je scripts/test-dedup-guests.ts
 * (iter-025). Spuštění: npm run test:voting-plan
 *
 * Pokrývá všech 12 případů ze sekce 10.2 architektury (arch_iter-026_T-001.md).
 */
import assert from "node:assert/strict";
import {
  planVotingDispatch,
  type PlanInput,
  type PlanLink,
  type PlanMember,
} from "../lib/meetings/voting-plan";

function member(
  id: string,
  name: string,
  email: string | null = `${id}@x.cz`
): PlanMember {
  return { memberId: id, memberName: name, memberEmail: email };
}

function link(
  memberId: string,
  opts: { revokedAt?: Date | null; linkEmailSentAt?: Date | null } = {}
): PlanLink {
  return {
    memberId,
    revokedAt: opts.revokedAt ?? null,
    linkEmailSentAt: opts.linkEmailSentAt ?? null,
  };
}

function membersRange(count: number): PlanMember[] {
  return Array.from({ length: count }, (_, i) =>
    member(`m${i + 1}`, `Clen ${String(i + 1).padStart(2, "0")}`)
  );
}

function linksForAllWithSentAt(
  members: PlanMember[],
  sentAt: Date
): PlanLink[] {
  return members.map((m) => link(m.memberId, { linkEmailSentAt: sentAt }));
}

type TestCase = {
  name: string;
  run: () => void;
};

const cases: TestCase[] = [
  {
    name: "1. 27 clenu s emailem, 0 odkazu, start -> 27x send, linksToCreate.length === 27",
    run: () => {
      const members = membersRange(27);
      const input: PlanInput = { members, links: [], mode: "start" };
      const plan = planVotingDispatch(input);
      assert.equal(plan.counts.willSend, 27);
      assert.equal(plan.linksToCreate.length, 27);
      assert.equal(plan.toSend.every((r) => r.action.kind === "send"), true);
    },
  },
  {
    name: "2. 27 clenu, 27 odkazu se znackou, start -> 0x send, 27x skip already-sent",
    run: () => {
      const members = membersRange(27);
      const links = linksForAllWithSentAt(members, new Date("2026-08-21T06:00:00Z"));
      const plan = planVotingDispatch({ members, links, mode: "start" });
      assert.equal(plan.counts.willSend, 0);
      assert.equal(plan.counts.skippedAlreadySent, 27);
    },
  },
  {
    name: "3. 27 clenu, 27 odkazu se znackou, resend -> 27x send, linksToCreate prazdne",
    run: () => {
      const members = membersRange(27);
      const links = linksForAllWithSentAt(members, new Date("2026-08-21T06:00:00Z"));
      const plan = planVotingDispatch({ members, links, mode: "resend" });
      assert.equal(plan.counts.willSend, 27);
      assert.deepEqual(plan.linksToCreate, []);
    },
  },
  {
    name: "4. 28 clenu, 27 odkazu se znackou, start -> 1x send (novy), 27x skip, linksToCreate.length === 1",
    run: () => {
      const members = membersRange(28);
      const links = linksForAllWithSentAt(
        members.slice(0, 27),
        new Date("2026-08-21T06:00:00Z")
      );
      const plan = planVotingDispatch({ members, links, mode: "start" });
      assert.equal(plan.counts.willSend, 1);
      assert.equal(plan.linksToCreate.length, 1);
      assert.equal(plan.linksToCreate[0], "m28");
    },
  },
  {
    name: "5. 27 clenu, jeden bez emailu -> 26x send, 1x skip no-email, neni v linksToCreate",
    run: () => {
      const members = membersRange(27);
      members[10] = { ...members[10], memberEmail: null };
      const plan = planVotingDispatch({ members, links: [], mode: "start" });
      assert.equal(plan.counts.willSend, 26);
      assert.equal(plan.counts.skippedNoEmail, 1);
      assert.equal(plan.linksToCreate.includes(members[10].memberId), false);
    },
  },
  {
    name: "6. clen s odkazem, revokedAt != null, start -> skip revoked, ne send",
    run: () => {
      const members = [member("m1", "Jan Novak")];
      const links = [link("m1", { revokedAt: new Date("2026-08-01T00:00:00Z") })];
      const plan = planVotingDispatch({ members, links, mode: "start" });
      assert.equal(plan.rows[0].action.kind, "skip");
      if (plan.rows[0].action.kind === "skip") {
        assert.equal(plan.rows[0].action.reason, "revoked");
      }
    },
  },
  {
    name: "7. clen s odkazem, revokedAt != null, resend -> skip revoked i tady",
    run: () => {
      const members = [member("m1", "Jan Novak")];
      const links = [link("m1", { revokedAt: new Date("2026-08-01T00:00:00Z") })];
      const plan = planVotingDispatch({ members, links, mode: "resend" });
      assert.equal(plan.rows[0].action.kind, "skip");
      if (plan.rows[0].action.kind === "skip") {
        assert.equal(plan.rows[0].action.reason, "revoked");
      }
    },
  },
  {
    name: "8. clen s odkazem bez znacky, start -> send, createLink: false",
    run: () => {
      const members = [member("m1", "Jan Novak")];
      const links = [link("m1")];
      const plan = planVotingDispatch({ members, links, mode: "start" });
      assert.equal(plan.rows[0].action.kind, "send");
      if (plan.rows[0].action.kind === "send") {
        assert.equal(plan.rows[0].action.createLink, false);
      }
    },
  },
  {
    name: "9. rows.length === members.length vzdy — seznam se nikdy nekrati",
    run: () => {
      const members = membersRange(5);
      members[2] = { ...members[2], memberEmail: null };
      const links = [link("m4", { revokedAt: new Date() })];
      const plan = planVotingDispatch({ members, links, mode: "start" });
      assert.equal(plan.rows.length, members.length);
    },
  },
  {
    name: "10. 0 clenu -> prazdny plan, counts same nuly, zadna vyjimka",
    run: () => {
      const plan = planVotingDispatch({ members: [], links: [], mode: "start" });
      assert.deepEqual(plan.rows, []);
      assert.deepEqual(plan.toSend, []);
      assert.deepEqual(plan.linksToCreate, []);
      assert.deepEqual(plan.counts, {
        totalMembers: 0,
        withEmail: 0,
        willSend: 0,
        skippedNoEmail: 0,
        skippedRevoked: 0,
        skippedAlreadySent: 0,
      });
    },
  },
  {
    name: "11. memberEmail: '' -> skip no-email stejne jako null",
    run: () => {
      const members = [member("m1", "Jan Novak", "")];
      const plan = planVotingDispatch({ members, links: [], mode: "start" });
      assert.equal(plan.rows[0].action.kind, "skip");
      if (plan.rows[0].action.kind === "skip") {
        assert.equal(plan.rows[0].action.reason, "no-email");
      }
    },
  },
  {
    name: "12. dva clenove tehoz jmena -> poradi rows stabilni mezi dvema volanimi",
    run: () => {
      const members = [
        member("b-id", "Jan Novak"),
        member("a-id", "Jan Novak"),
      ];
      const plan1 = planVotingDispatch({ members, links: [], mode: "start" });
      const plan2 = planVotingDispatch({ members, links: [], mode: "start" });
      const ids1 = plan1.rows.map((r) => r.memberId);
      const ids2 = plan2.rows.map((r) => r.memberId);
      assert.deepEqual(ids1, ids2);
      // druhotny klic memberId: "a-id" < "b-id"
      assert.deepEqual(ids1, ["a-id", "b-id"]);
    },
  },
];

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  try {
    testCase.run();
    console.log(`OK   ${testCase.name}`);
    passed++;
  } catch (error) {
    failed++;
    console.error(`FAIL ${testCase.name}`);
    if (error instanceof Error) {
      console.error(`     ${error.message}`);
    } else {
      console.error(`     ${String(error)}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed (of ${cases.length})`);

if (failed > 0) {
  process.exitCode = 1;
}
