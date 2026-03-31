import { neon } from "@neondatabase/serverless";
import { hash } from "bcryptjs";
import { createHash, randomUUID } from "crypto";

/**
 * Seed script: creates initial users.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts
 *
 * Requires DATABASE_URL in .env.local or environment.
 */

// Load .env.local for local development
import "dotenv/config";

const BCRYPT_COST = 12;

interface SeedUser {
  name: string;
  email: string;
  password?: string;
  managementRole: "admin" | "moderator" | null;
}

const SEED_USERS: SeedUser[] = [
  {
    name: "Tomas Nekolny",
    email: "tomas.nekolny@tspdata.cz",
    password: "admin123",
    managementRole: "admin",
  },
  {
    name: "Lojza Voboural",
    email: "erozaxx@gmail.com",
    managementRole: null,
  },
];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  for (const user of SEED_USERS) {
    console.log(`\nSeeding user: ${user.name} (${user.email})`);

    const existing = await sql`
      SELECT id FROM member WHERE email = ${user.email}
    `;

    if (existing.length > 0) {
      console.log("  Already exists. Skipping.");
      continue;
    }

    const passwordHash = user.password
      ? await hash(user.password, BCRYPT_COST)
      : null;

    // Generate magic link token for all users
    const rawToken = randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await sql`
      INSERT INTO member (name, email, password_hash, management_role, magic_token_hash, token_expires_at)
      VALUES (${user.name}, ${user.email}, ${passwordHash}, ${user.managementRole}, ${tokenHash}, ${expiresAt.toISOString()})
    `;

    console.log("  Created successfully.");
    if (user.managementRole) {
      console.log(`  Management role: ${user.managementRole}`);
      console.log(`  Password: ${user.password}`);
    }
    console.log(`  Magic link: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/magic?token=${rawToken}`);
  }

  console.log("\nSeed complete.");
  console.log("IMPORTANT: Change passwords after first login!");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
