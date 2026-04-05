import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const result = await sql`
    UPDATE meeting_member_link
    SET revoked_at = NOW()
    WHERE meeting_id = '956617d5-a42d-4bc9-919b-de70d50d75cf'
      AND member_id = (SELECT id FROM member WHERE email = 'test-member-4@bni-test.local')
      AND revoked_at IS NULL
    RETURNING id, member_id, revoked_at
  `;
  if (result.length === 0) {
    console.log("No link found or already revoked");
  } else {
    console.log("Revoked:", JSON.stringify(result[0]));
  }
}

main().catch(console.error);
