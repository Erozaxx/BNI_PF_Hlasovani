import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.production.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rawToken = "29c0591b-368f-4372-b3bf-635c23c69c8d";
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  console.log("Token hash:", tokenHash);

  const link = await sql`
    SELECT mml.id, mml.meeting_id, mml.member_id, mml.revoked_at, mml.expires_at,
           m.status as meeting_status, mem.email
    FROM meeting_member_link mml
    JOIN meeting m ON m.id = mml.meeting_id
    JOIN member mem ON mem.id = mml.member_id
    WHERE mml.token_hash = ${tokenHash}
  `;

  console.log("Link found:", JSON.stringify(link[0]));

  if (link[0]) {
    const mtgId = link[0].meeting_id;
    const votes = await sql`
      SELECT COUNT(*) as vote_count FROM vote WHERE meeting_id = ${mtgId}
    `;
    console.log("Votes for this meeting:", votes[0]?.vote_count);
  }
}

main().catch(console.error);
