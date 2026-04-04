/**
 * Create test accounts for iter-011 live testing.
 *
 * Creates:
 *   - 1 moderator: test-moderator@bni-test.local (password: TestModerator123)
 *   - 5 members:   test-member-1@bni-test.local … test-member-5@bni-test.local
 *
 * Idempotent — uses ON CONFLICT DO NOTHING; safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/create-test-accounts-iter-011.ts
 *
 * Requires DATABASE_URL in .env.local or environment.
 */

import { neon } from "@neondatabase/serverless";
import { hash } from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const BCRYPT_COST = 10; // Lower cost for test accounts — faster seeding

interface TestAccount {
  name: string;
  email: string;
  managementRole: "admin" | "moderator" | null;
  password: string | null;
}

const TEST_ACCOUNTS: TestAccount[] = [
  {
    name: "Test Moderator",
    email: "test-moderator@bni-test.local",
    managementRole: "moderator",
    password: "TestModerator123",
  },
  {
    name: "Test Member 1",
    email: "test-member-1@bni-test.local",
    managementRole: null,
    password: null,
  },
  {
    name: "Test Member 2",
    email: "test-member-2@bni-test.local",
    managementRole: null,
    password: null,
  },
  {
    name: "Test Member 3",
    email: "test-member-3@bni-test.local",
    managementRole: null,
    password: null,
  },
  {
    name: "Test Member 4",
    email: "test-member-4@bni-test.local",
    managementRole: null,
    password: null,
  },
  {
    name: "Test Member 5",
    email: "test-member-5@bni-test.local",
    managementRole: null,
    password: null,
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  console.log("Creating test accounts for iter-011...\n");

  let created = 0;
  let skipped = 0;

  for (const account of TEST_ACCOUNTS) {
    const passwordHash = account.password
      ? await hash(account.password, BCRYPT_COST)
      : null;

    // Idempotent insert — ON CONFLICT DO NOTHING on email UNIQUE constraint
    const result = await sql`
      INSERT INTO member (name, email, password_hash, management_role)
      VALUES (
        ${account.name},
        ${account.email},
        ${passwordHash},
        ${account.managementRole}
      )
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `;

    if (result.length > 0) {
      console.log(`  [CREATED] ${account.name} <${account.email}>`);
      if (account.managementRole) {
        console.log(`    Role: ${account.managementRole}`);
        console.log(`    Password: ${account.password}`);
      } else {
        console.log(`    Role: member (magic link access only)`);
      }
      created++;
    } else {
      console.log(`  [SKIP]    ${account.name} <${account.email}> — already exists`);
      skipped++;
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}\n`);
  console.log("Summary:");
  console.log("  Moderator login: test-moderator@bni-test.local / TestModerator123");
  console.log("  Members (test-member-1 to 5): access via magic link only");
  console.log("\nNext steps:");
  console.log("  1. Create a test meeting in admin UI");
  console.log("  2. Assign guests to the meeting");
  console.log("  3. Use MeetingActivationControls to activate and generate magic links");
  console.log("  4. Copy magic link URLs for each member for test scenarios A-D");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
