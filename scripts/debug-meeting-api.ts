/**
 * Debug script: replicate the meeting GET query logic to find why myVote is null
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const meetingId = "956617d5-a42d-4bc9-919b-de70d50d75cf";
  const memberId = "224fa688-59ce-495e-b3c7-7d8074c6b2f8"; // test-member-2

  console.log("=== Check: vote table schema ===");
  const columns = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'vote'
    ORDER BY ordinal_position
  `;
  console.log("vote columns:", columns.map((c: Record<string, unknown>) => `${c.column_name}: ${c.data_type}`).join(", "));

  console.log("\n=== Check: all votes for this meeting ===");
  const allVotes = await sql`
    SELECT * FROM vote WHERE meeting_id = ${meetingId}
  `;
  console.log("All votes:", JSON.stringify(allVotes, null, 2));

  console.log("\n=== Check: votes for member-2 in this meeting ===");
  const memberVotes = await sql`
    SELECT * FROM vote WHERE meeting_id = ${meetingId} AND member_id = ${memberId}
  `;
  console.log("Member votes:", JSON.stringify(memberVotes, null, 2));

  console.log("\n=== Check: meeting guests ===");
  const guests = await sql`
    SELECT mg.guest_id, g.name FROM meeting_guest mg
    JOIN guest g ON g.id = mg.guest_id
    WHERE mg.meeting_id = ${meetingId}
  `;
  console.log("Guests:", guests.map((g: { guest_id: string; name: string }) => `${g.guest_id}: ${g.name}`).join(", "));
}

main().catch(console.error);
