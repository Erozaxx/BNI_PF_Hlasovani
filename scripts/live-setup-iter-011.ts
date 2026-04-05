/**
 * Live setup script for iter-011 T-015.
 *
 * Creates a test meeting, adds guests, activates meeting,
 * generates magic links for 5 test members.
 *
 * Usage: npx tsx scripts/live-setup-iter-011.ts
 */

import { neon } from "@neondatabase/serverless";
import { randomUUID, createHash } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://bni-pf-hlasovani.vercel.app";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  // 1. Verify test moderator exists
  const moderators = await sql`
    SELECT id, name, email, management_role, password_hash IS NOT NULL as has_password
    FROM member
    WHERE email = 'test-moderator@bni-test.local'
  `;

  if (moderators.length === 0) {
    console.error("BLOCKER: test-moderator@bni-test.local does not exist in DB!");
    process.exit(1);
  }
  console.log(`[T-015a] Moderator found: ${moderators[0].name} (${moderators[0].email})`);
  console.log(`  Role: ${moderators[0].management_role}, Has password: ${moderators[0].has_password}`);

  // 2. Verify test members exist
  const testMembers = await sql`
    SELECT id, name, email
    FROM member
    WHERE email LIKE 'test-member-%@bni-test.local'
    ORDER BY email
  `;

  if (testMembers.length < 5) {
    console.error(`BLOCKER: Expected 5 test members, found ${testMembers.length}`);
    process.exit(1);
  }
  console.log(`\n[T-015a] Test members found: ${testMembers.length}`);
  for (const m of testMembers) {
    console.log(`  - ${m.name} (${m.email}) id=${m.id}`);
  }

  // 3. Check if meeting_member_link table exists
  const tableCheck = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meeting_member_link'
  `;
  if (tableCheck.length === 0) {
    console.error("BLOCKER: meeting_member_link table does not exist! Run migration first.");
    process.exit(1);
  }
  console.log("\n[Migration] meeting_member_link table exists: OK");

  // 4. Find some guests or create a test meeting date
  const guests = await sql`SELECT id, name FROM guest LIMIT 5`;
  console.log(`\n[T-015c] Available guests: ${guests.length}`);
  for (const g of guests) {
    console.log(`  - ${g.name} (id=${g.id})`);
  }

  if (guests.length < 2) {
    console.error("BLOCKER: Need at least 2 guests in DB. Please add guests via admin UI first.");
    process.exit(1);
  }

  // 5. Check for existing test meetings
  const existingMeetings = await sql`
    SELECT id, date, status FROM meeting
    WHERE date >= CURRENT_DATE
    ORDER BY date ASC
    LIMIT 5
  `;
  console.log(`\nExisting future meetings: ${existingMeetings.length}`);

  let meetingId: string;
  let meetingDate: string;

  // Check if there's already a draft test meeting
  const draftMeeting = existingMeetings.find((m: { status: string }) => m.status === 'draft');
  if (draftMeeting) {
    meetingId = draftMeeting.id;
    meetingDate = draftMeeting.date;
    console.log(`[T-015b] Using existing draft meeting: id=${meetingId}, date=${meetingDate}`);
  } else {
    // Create a new meeting for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    meetingDate = tomorrow.toISOString().split('T')[0];

    const newMeeting = await sql`
      INSERT INTO meeting (date, status, location)
      VALUES (${meetingDate}, 'draft', 'Testovaci mistnost')
      RETURNING id, date, status
    `;
    meetingId = newMeeting[0].id;
    console.log(`[T-015b] Created new draft meeting: id=${meetingId}, date=${meetingDate}`);
  }

  // 6. Add guests to meeting (first 2 guests, votingEnabled = true)
  const guestsToAdd = guests.slice(0, Math.min(5, guests.length));
  console.log(`\n[T-015c] Adding ${guestsToAdd.length} guests to meeting...`);

  for (const g of guestsToAdd) {
    await sql`
      INSERT INTO meeting_guest (meeting_id, guest_id, voting_enabled)
      VALUES (${meetingId}, ${g.id}, true)
      ON CONFLICT (meeting_id, guest_id) DO NOTHING
    `;
    console.log(`  Added guest: ${g.name}`);
  }

  // 7. Activate meeting (draft -> active) and generate magic links
  console.log("\n[T-015d] Activating meeting (draft -> active)...");

  // Update meeting status
  await sql`
    UPDATE meeting SET status = 'active'
    WHERE id = ${meetingId} AND status = 'draft'
  `;

  // Verify status changed
  const updatedMeeting = await sql`SELECT status FROM meeting WHERE id = ${meetingId}`;
  if (updatedMeeting[0].status !== 'active') {
    console.error(`ERROR: Meeting status is '${updatedMeeting[0].status}', expected 'active'`);
    process.exit(1);
  }
  console.log(`  Meeting status: active ✓`);

  // 8. Generate magic links for the 5 test members
  console.log("\n[T-015e] Generating magic links for test members...");

  const magicLinks: Array<{
    memberEmail: string;
    memberName: string;
    memberId: string;
    rawToken: string;
    magicUrl: string;
  }> = [];

  for (const member of testMembers.slice(0, 5)) {
    // Check if link already exists
    const existing = await sql`
      SELECT id, token_hash FROM meeting_member_link
      WHERE meeting_id = ${meetingId} AND member_id = ${member.id}
    `;

    let rawToken: string;

    if (existing.length > 0) {
      // Regenerate token
      rawToken = randomUUID();
      const tokenHash = hashToken(rawToken);
      await sql`
        UPDATE meeting_member_link
        SET token_hash = ${tokenHash}, revoked_at = NULL, created_at = NOW()
        WHERE meeting_id = ${meetingId} AND member_id = ${member.id}
      `;
      console.log(`  [REGENERATED] ${member.name}`);
    } else {
      // Create new link
      rawToken = randomUUID();
      const tokenHash = hashToken(rawToken);
      await sql`
        INSERT INTO meeting_member_link (meeting_id, member_id, token_hash, expires_at, revoked_at)
        VALUES (${meetingId}, ${member.id}, ${tokenHash}, NULL, NULL)
      `;
      console.log(`  [CREATED] ${member.name}`);
    }

    const magicUrl = `${APP_URL}/m/${rawToken}`;
    magicLinks.push({
      memberEmail: member.email,
      memberName: member.name,
      memberId: member.id,
      rawToken,
      magicUrl,
    });
  }

  // 9. Output results
  console.log("\n========================================");
  console.log("LIVE SETUP COMPLETE");
  console.log("========================================");
  console.log(`Meeting ID: ${meetingId}`);
  console.log(`Meeting Date: ${meetingDate}`);
  console.log(`Meeting Status: active`);
  console.log(`Guests added: ${guestsToAdd.length}`);
  console.log("\n5 Magic Links for BFU agents:");
  console.log("----------------------------------------");
  for (let i = 0; i < magicLinks.length; i++) {
    const link = magicLinks[i];
    console.log(`\nAgent ${i + 1} — ${link.memberName} (${link.memberEmail})`);
    console.log(`  URL: ${link.magicUrl}`);
  }
  console.log("\n========================================");

  // Return structured output for the artifact
  return {
    meetingId,
    meetingDate,
    guests: guestsToAdd.map((g: { name: string; id: string }) => g.name),
    magicLinks,
  };
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
