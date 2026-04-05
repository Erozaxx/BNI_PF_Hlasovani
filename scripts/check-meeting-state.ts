import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const result = await sql`
    SELECT id, status, voting_open_at, voting_closes_at FROM meeting
    WHERE id = '956617d5-a42d-4bc9-919b-de70d50d75cf'
  `;
  console.log("Meeting:", JSON.stringify(result[0]));
}
main().catch(console.error);
