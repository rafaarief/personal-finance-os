import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from "./session";

/** Reads and verifies the session cookie for the current request — Server Components and Server Actions only (needs `next/headers`, not available in middleware's edge context, which reads the cookie off the request directly instead). */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

/**
 * Throws if the caller isn't the app owner — defense in depth for owner-only
 * Server Actions. Middleware already blocks a TRADING_USER from ever reaching
 * the page these actions are invoked from, but a Server Action can in
 * principle be called from anywhere in the module graph, so actions that
 * touch owner-only data (assets, transactions, imports, bank accounts) call
 * this directly too rather than relying solely on the route-level block.
 */
export async function requireOwner(): Promise<SessionPayload> {
  const session = await getCurrentSession();
  if (!session || session.role !== "OWNER") {
    throw new Error("Forbidden: owner access required");
  }
  return session;
}

/** Trading data is shared workspace data — either role may read/write it, but the caller must still be authenticated as one of the two known roles. */
export async function requireAnyRole(): Promise<SessionPayload> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Forbidden: not authenticated");
  }
  return session;
}

/** "OWNER" or the trading user's email — used for trades.created_by / last_edited_by. */
export function actorLabel(session: SessionPayload): string {
  return session.role === "OWNER" ? "OWNER" : (session.email ?? "TRADING_USER");
}
