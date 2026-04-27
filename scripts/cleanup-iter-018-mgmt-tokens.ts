/**
 * One-time cleanup for iter-018: clear magic token fields from admin/moderator members.
 *
 * Admins and moderators authenticate with password — magic tokens are not used by them.
 * This script nullifies any lingering token fields on management-role members.
 *
 * Run: npx tsx scripts/cleanup-iter-018-mgmt-tokens.ts
 *
 * Idempotent: second run updates 0 rows.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config({ path: ".env.local" });

const dbUrl = process.env.DATABASE_URL!;

// Log masked URL so the operator can confirm which DB they're targeting
const maskedUrl = dbUrl.replace(/:([^@]+)@/, ":***@");
console.log(`Target DB: ${maskedUrl}`);

async function waitForEnter(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question("Press Enter to proceed or Ctrl+C to abort...", () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  console.log("\nThis script will clear magic_token_hash, token_expires_at,");
  console.log("token_used, previous_token_hash, previous_token_expires_at");
  console.log("for all members where management_role IS NOT NULL.\n");

  await waitForEnter();

  const sql = neon(dbUrl);

  const result = await sql`
    UPDATE member
    SET
      magic_token_hash        = NULL,
      token_expires_at        = NULL,
      token_used              = FALSE,
      previous_token_hash     = NULL,
      previous_token_expires_at = NULL
    WHERE management_role IS NOT NULL
      AND (
        magic_token_hash IS NOT NULL
        OR token_expires_at IS NOT NULL
        OR previous_token_hash IS NOT NULL
        OR previous_token_expires_at IS NOT NULL
        OR token_used = TRUE
      )
    RETURNING id
  `;

  const count = result.length;
  if (count === 0) {
    console.log("Done. 0 rows updated (already clean or no management-role members with tokens).");
  } else {
    console.log(`Done. ${count} row(s) updated.`);
    for (const row of result) {
      console.log(`  - member id: ${row.id}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
