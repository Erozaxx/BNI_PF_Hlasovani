import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const meetingId = "956617d5-a42d-4bc9-919b-de70d50d75cf";

async function main() {
  const now = new Date();
  const votingClosesAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  const result = await sql`
    UPDATE meeting
    SET status = 'voting', voting_open_at = ${now}, voting_closes_at = ${votingClosesAt}
    WHERE id = ${meetingId} AND status = 'active'
    RETURNING id, status
  `;

  if (result.length === 0) {
    console.error("Meeting not in active state or not found");
    process.exit(1);
  }

  await sql`
    UPDATE meeting_member_link
    SET expires_at = ${expiresAt}
    WHERE meeting_id = ${meetingId}
  `;

  console.log("Voting activated:", result[0]);
}

main().catch(console.error);
