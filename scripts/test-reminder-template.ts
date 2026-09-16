/**
 * Testy pro lib/email/reminder-template.ts (iter-028, T-006) — arch iter-028
 * T-001, sekce 4.6, 8.2 (T1 az T3).
 *
 * Bez DATABASE_URL, bez site, bez CI — vzor je scripts/test-ops-events.ts.
 * Spusteni: npm run test:reminder-template
 */
import assert from "node:assert/strict";
import { buildReminderEmail } from "../lib/email/reminder-template";

type TestCase = { name: string; run: () => void };

const cases: TestCase[] = [
  {
    name: "T1. sablona 24.9. kolo 1: predmet presne podle 4.6; bez '!', '—', '–' v predmetu i HTML",
    run: () => {
      const { subject, html } = buildReminderEmail({
        meetingDate: "2026-09-24",
        votingClosesAt: new Date("2026-09-30T21:59:59Z"),
        now: new Date("2026-09-26T05:30:00Z"), // kolo 1
        magicUrl: "https://example.com/m/abc123",
        originalSubjectDate: "2026-09-24",
      });

      assert.equal(subject, "BNI Hlasovani - Nezapomeň prosím odhlasovat (schůzka 24. 9.)");
      assert.match(html, /k hostům ze schůzky 24\. 9\. od tebe zatím nemáme žádný hlas\. Nezapomeň prosím odhlasovat\./);
      assert.match(html, /Hlasování končí ve středu 30\. 9\. ve 23:59\./);
      assert.match(html, /Připomínku posíláme jen těm, kdo zatím nehlasovali\. Jakmile dáš aspoň jeden hlas, další už nepřijde\./);

      // Bez vykricniku (mimo nevyhnutelny "<!DOCTYPE html>") a bez dlouhych pomlcek.
      const bodyText = (subject + html).replace(/<!DOCTYPE[^>]*>/i, "");
      assert.doesNotMatch(bodyText, /!/);
      assert.doesNotMatch(subject + html, /—|–/);
    },
  },
  {
    name: "T2. kolo 1 -> 've stredu 30.9. ve 23:59'; kolo 3 -> 'dnes ve 23:59'; DST hranice -> 've 23:59', ne 've 22:59'",
    run: () => {
      const round1 = buildReminderEmail({
        meetingDate: "2026-09-24",
        votingClosesAt: new Date("2026-09-30T21:59:59Z"),
        now: new Date("2026-09-26T05:30:00Z"),
        magicUrl: "https://example.com/m/abc123",
        originalSubjectDate: "2026-09-24",
      });
      assert.match(round1.html, /Hlasování končí ve středu 30\. 9\. ve 23:59\./);

      const round3 = buildReminderEmail({
        meetingDate: "2026-09-24",
        votingClosesAt: new Date("2026-09-30T21:59:59Z"),
        now: new Date("2026-09-30T05:30:00Z"),
        magicUrl: "https://example.com/m/abc123",
        originalSubjectDate: "2026-09-24",
      });
      assert.match(round3.html, /Hlasování končí dnes ve 23:59\./);

      // Uzaverka po podzimni zmene casu (CET, +1h): 22:59:59Z -> 23:59 misto 22:59.
      const roundAutumn = buildReminderEmail({
        meetingDate: "2026-10-22",
        votingClosesAt: new Date("2026-10-28T22:59:59Z"),
        now: new Date("2026-10-28T05:30:00Z"), // kolo 3 (den uzaverky)
        magicUrl: "https://example.com/m/abc123",
        originalSubjectDate: "2026-10-22",
      });
      assert.match(roundAutumn.html, /ve 23:59/);
      assert.doesNotMatch(roundAutumn.html, /ve 22:59/);
    },
  },
  {
    name: "T3. magicUrl s '\"' a '<' -> escapovano v href; magicUrl:null -> zadne '<a ', obsahuje 'Odkaz pro hlasovani (2026-09-24)'",
    run: () => {
      const withUrl = buildReminderEmail({
        meetingDate: "2026-09-24",
        votingClosesAt: new Date("2026-09-30T21:59:59Z"),
        now: new Date("2026-09-26T05:30:00Z"),
        magicUrl: 'https://example.com/m/abc"<script>',
        originalSubjectDate: "2026-09-24",
      });
      assert.doesNotMatch(withUrl.html, /href="https:\/\/example\.com\/m\/abc"<script>"/);
      assert.match(withUrl.html, /href="https:\/\/example\.com\/m\/abc&quot;&lt;script&gt;"/);

      const withoutUrl = buildReminderEmail({
        meetingDate: "2026-09-24",
        votingClosesAt: new Date("2026-09-30T21:59:59Z"),
        now: new Date("2026-09-26T05:30:00Z"),
        magicUrl: null,
        originalSubjectDate: "2026-09-24",
      });
      assert.doesNotMatch(withoutUrl.html, /<a /);
      assert.match(withoutUrl.html, /Odkaz pro hlasovani \(2026-09-24\)/);
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
