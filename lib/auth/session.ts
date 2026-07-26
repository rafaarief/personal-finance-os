export const SESSION_COOKIE_NAME = "pfos_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type UserRole = "OWNER" | "TRADING_USER";

export interface SessionPayload {
  issuedAt: number;
  role: UserRole;
  /** users.id — only set for TRADING_USER; the owner has no row in `users` (still authenticates via APP_PASSWORD). */
  userId?: string;
  email?: string;
}

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not set");
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(getSessionSecret());
  return crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(data: string): Promise<string> {
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createSessionToken(claims: Omit<SessionPayload, "issuedAt">): Promise<string> {
  const payload: SessionPayload = { ...claims, issuedAt: Date.now() };
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/** Verifies the HMAC signature and expiry, and returns the embedded claims (role, userId, email) — null if missing/invalid/expired/tampered. Edge-safe (Web Crypto only), used by middleware on every request. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = await sign(encodedPayload);
  if (expectedSignature !== signature) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as SessionPayload;
    const ageMs = Date.now() - payload.issuedAt;
    if (ageMs < 0 || ageMs > SESSION_MAX_AGE_SECONDS * 1000) return null;
    if (payload.role !== "OWNER" && payload.role !== "TRADING_USER") return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
