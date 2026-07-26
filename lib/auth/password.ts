import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Node-only (scrypt requires the `node:crypto` module, not available in the
 * Edge runtime) — only ever called from the login Route Handler and one-off
 * account-creation scripts, both of which run in the Node.js runtime. Session
 * *verification* in middleware stays on Web Crypto (see lib/auth/session.ts)
 * so it keeps working in Edge.
 */
export function hashPassword(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = scryptSync(plaintext, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(plaintext: string, storedHash: string): boolean {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  const actualKey = scryptSync(plaintext, salt, KEY_LENGTH);

  return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
}
