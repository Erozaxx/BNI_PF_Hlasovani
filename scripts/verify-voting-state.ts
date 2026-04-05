import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const meetingId = "956617d5-a42d-4bc9-919b-de70d50d75cf";

async function main() {
  const result = await sql`
    SELECT id, status, voting_open_at, voting_closes_at 
    FROM meeting
    WHERE id = ${meetingId}
  `;
  console.log("Meeting state:", JSON.stringify(result[0], null, 2));
  
  const links = await sql`
    SELECT member_id, expires_at, is_revoked 
    FROM meeting_member_link
    WHERE meeting_id = ${meetingId}
    LIMIT 5
  `;
  console.log("Member links sample:", JSON.stringify(links, null, 2));
}

main().catch(console.error);
