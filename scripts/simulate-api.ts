/**
 * Simulate the exact GET /api/m/{token}/meeting logic to test locally
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

function eq<T>(a: T, b: T) { return { op: "eq", a, b }; }
function and(...conds: unknown[]) { return { op: "and", conds }; }

async function main() {
  const meetingId = "956617d5-a42d-4bc9-919b-de70d50d75cf";
  const memberId = "224fa688-59ce-495e-b3c7-7d8074c6b2f8"; // test-member-2

  // Replicate Step 6: member's votes
  const voteRows = await sql`
    SELECT guest_id, value, reason FROM vote
    WHERE member_id = ${memberId} AND meeting_id = ${meetingId}
  `;
  console.log("Vote rows (step 6):", JSON.stringify(voteRows));

  // Step 6b: all votes
  const allVoteRows = await sql`
    SELECT guest_id, value, reason FROM vote
    WHERE meeting_id = ${meetingId}
  `;
  console.log("All vote rows (step 6b):", JSON.stringify(allVoteRows));

  // Replicate guest lookup
  const guestRows = await sql`
    SELECT mg.guest_id, g.name FROM meeting_guest mg
    JOIN guest g ON g.id = mg.guest_id
    WHERE mg.meeting_id = ${meetingId}
    ORDER BY g.name
  `;

  // Build voteByGuest map
  const voteByGuest = new Map<string, { value: string; reason: string | null }>();
  for (const v of voteRows) {
    voteByGuest.set(v.guest_id as string, { value: v.value as string, reason: v.reason as string ?? null });
  }

  // Check myVote for voted guests
  for (const g of guestRows) {
    const myVote = voteByGuest.get(g.guest_id as string) ?? null;
    if (myVote) {
      console.log(`myVote for ${g.name}: ${JSON.stringify(myVote)}`);
    }
  }
  console.log("Map size:", voteByGuest.size);
}

main().catch(console.error);
