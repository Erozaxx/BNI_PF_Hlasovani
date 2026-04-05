import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const meetingId = "956617d5-a42d-4bc9-919b-de70d50d75cf";

  const votes = await sql`
    SELECT v.id, v.member_id, m.email, v.guest_id, g.name as guest_name, v.value, v.reason
    FROM vote v
    JOIN member m ON m.id = v.member_id
    JOIN guest g ON g.id = v.guest_id
    WHERE v.meeting_id = ${meetingId}
    ORDER BY v.created_at DESC
    LIMIT 20
  `;

  console.log("Votes in DB:", JSON.stringify(votes, null, 2));

  // Also check meeting_member_link for member-2
  const link = await sql`
    SELECT mml.id, mml.member_id, m.email, mml.revoked_at, mml.expires_at
    FROM meeting_member_link mml
    JOIN member m ON m.id = mml.member_id
    WHERE mml.meeting_id = ${meetingId} AND m.email = 'test-member-2@bni-test.local'
  `;
  console.log("Member-2 link:", JSON.stringify(link, null, 2));
}

main().catch(console.error);
