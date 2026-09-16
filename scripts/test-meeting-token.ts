/**
 * Testy pro lib/auth/meeting-token-access.ts a lib/meetings/token-error-text.ts
 * (iter-028, T-006) — arch iter-028 T-001, sekce 4.5, 4.7, 8.2 (V1 az V3, H1).
 * Doplneno T-007r (review T-007, N2): text pro poznamku pri duvodu expired.
 *
 * Bez DATABASE_URL, bez site, bez CI — vzor je scripts/test-ops-events.ts.
 * Oba testovane moduly jsou ciste (zadny import drizzle-orm/next/db).
 * Spusteni: npm run test:meeting-token
 */
import assert from "node:assert/strict";
import {
  decideMeetingTokenAccess,
  type MeetingTokenAccessLink,
} from "../lib/auth/meeting-token-access";
import { tokenErrorText, meetingTokenActionError } from "../lib/meetings/token-error-text";

const NOW = new Date("2026-09-26T05:30:00Z");

function link(overrides: Partial<MeetingTokenAccessLink> = {}): MeetingTokenAccessLink {
  return {
    id: "link-1",
    meetingId: "meeting-1",
    memberId: "member-1",
    tokenHash: "hash-current",
    revokedAt: null,
    expiresAt: new Date("2026-10-01T00:00:00Z"), // v budoucnu vuci NOW
    ...overrides,
  };
}

type TestCase = { name: string; run: () => void };

const cases: TestCase[] = [
  {
    name: "V1. alias, linkTokenHash = link.tokenHash, expiresAt v budoucnu -> ok s linkId/memberId/meetingId z odkazu",
    run: () => {
      const result = decideMeetingTokenAccess({
        source: { kind: "reminder", linkTokenHash: "hash-current" },
        now: NOW,
        link: link(),
      });
      assert.deepEqual(result, {
        status: "ok",
        memberId: "member-1",
        meetingId: "meeting-1",
        linkId: "link-1",
      });
    },
  },
  {
    name: "V2. alias, linkTokenHash != link.tokenHash (pregenerovano), revokedAt:null -> invalid",
    run: () => {
      const result = decideMeetingTokenAccess({
        source: { kind: "reminder", linkTokenHash: "hash-old" },
        now: NOW,
        link: link({ tokenHash: "hash-current", revokedAt: null }),
      });
      assert.deepEqual(result, { status: "invalid" });
    },
  },
  {
    name: "V3. alias se shodnou generaci a pak source:link -> revokedAt vyplnen / expiresAt v minulosti -> revoked / expired",
    run: () => {
      const withMatchingAlias = decideMeetingTokenAccess({
        source: { kind: "reminder", linkTokenHash: "hash-current" },
        now: NOW,
        link: link({ revokedAt: new Date("2026-09-20T00:00:00Z") }),
      });
      assert.deepEqual(withMatchingAlias, { status: "revoked" });

      const revokedViaLink = decideMeetingTokenAccess({
        source: { kind: "link" },
        now: NOW,
        link: link({ revokedAt: new Date("2026-09-20T00:00:00Z") }),
      });
      assert.deepEqual(revokedViaLink, { status: "revoked" });

      const expiredViaLink = decideMeetingTokenAccess({
        source: { kind: "link" },
        now: NOW,
        link: link({ expiresAt: new Date("2026-09-01T00:00:00Z") }),
      });
      assert.deepEqual(expiredViaLink, { status: "expired" });
    },
  },
  {
    name: 'H1. tokenErrorText: (401,"Invalid token")->invalid; (401,"Token revoked")->revoked; (401,"")->invalid; (500,cokoli)->null',
    run: () => {
      assert.deepEqual(tokenErrorText(401, "Invalid token"), { reason: "invalid" });
      assert.deepEqual(tokenErrorText(401, "Token revoked"), { reason: "revoked" });
      assert.deepEqual(tokenErrorText(401, ""), { reason: "invalid" });
      assert.equal(tokenErrorText(500, "Invalid token"), null);
      assert.equal(tokenErrorText(500, "cokoli"), null);
    },
  },
  {
    name: 'N2 (review T-007). meetingTokenActionError("expired","note") -> "Poznamka se neulozila, platnost odkazu skoncila."',
    run: () => {
      assert.equal(
        meetingTokenActionError("expired", "note"),
        "Poznamka se neulozila, platnost odkazu skoncila."
      );
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
