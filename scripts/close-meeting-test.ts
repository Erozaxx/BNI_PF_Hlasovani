import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const meetingId = "956617d5-a42d-4bc9-919b-de70d50d75cf";

  const result = await sql`
    UPDATE meeting
    SET status = 'closed'
    WHERE id = ${meetingId} AND status = 'voting'
    RETURNING id, status
  `;

  if (result.length === 0) {
    console.error("Meeting not in voting state or not found");
    process.exit(1);
  }

  console.log("Meeting closed:", JSON.stringify(result[0]));
}

main().catch(console.error);
