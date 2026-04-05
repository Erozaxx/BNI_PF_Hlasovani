/**
 * Checks meeting status + adds a marker note and verifies if production API sees it
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // Check current meeting status
  const meeting = await sql`SELECT status FROM meeting WHERE id = '956617d5-a42d-4bc9-919b-de70d50d75cf'`;
  console.log("Local DB meeting status:", meeting[0]?.status);

  // Insert a test note via DB directly
  const noteResult = await sql`
    INSERT INTO note (id, member_id, guest_id, meeting_id, text, created_at)
    SELECT gen_random_uuid(), member_id, guest_id, meeting_id, 'DB-IDENTITY-CHECK-' || extract(epoch from now()), NOW()
    FROM vote
    WHERE meeting_id = '956617d5-a42d-4bc9-919b-de70d50d75cf'
    LIMIT 1
    RETURNING id, text
  `;
  console.log("Inserted test note:", JSON.stringify(noteResult[0]));
}
main().catch(console.error);
