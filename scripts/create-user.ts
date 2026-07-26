/**
 * Creates or updates a restricted-access user (e.g. the trading-only
 * account) — reusable for any future account, not just Narin's.
 *
 * Never pass the password as a bare CLI argument (it'd land in shell
 * history / process list); use the env vars below instead.
 *
 * Usage:
 *   NEW_USER_EMAIL=... NEW_USER_PASSWORD=... NEW_USER_ROLE=TRADING_USER \
 *     pnpm tsx scripts/create-user.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";
import { hashPassword } from "../lib/auth/password";

async function main() {
  const email = process.env.NEW_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.NEW_USER_PASSWORD;
  const role = process.env.NEW_USER_ROLE;

  if (!email || !password || !role) {
    throw new Error("Set NEW_USER_EMAIL, NEW_USER_PASSWORD, and NEW_USER_ROLE (OWNER | TRADING_USER) env vars.");
  }
  if (role !== "OWNER" && role !== "TRADING_USER") {
    throw new Error(`Invalid role "${role}" — must be OWNER or TRADING_USER.`);
  }

  const db = getDb();
  const passwordHash = hashPassword(password);

  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);

  if (existing) {
    await db.update(schema.users).set({ passwordHash, role, updatedAt: new Date() }).where(eq(schema.users.id, existing.id));
    console.log(`Updated existing user: ${email} (role=${role})`);
  } else {
    await db.insert(schema.users).values({ email, passwordHash, role });
    console.log(`Created new user: ${email} (role=${role})`);
  }

  // Never print the password or its hash — confirm existence + role only.
  const [verify] = await db.select({ email: schema.users.email, role: schema.users.role }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  console.log("Verified:", verify);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("User creation failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
