import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().optional(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // No email — the app owner's existing single-password login, unchanged.
  if (!email) {
    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword) {
      return NextResponse.json({ error: "Server auth is not configured" }, { status: 500 });
    }
    if (password !== appPassword) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const token = await createSessionToken({ role: "OWNER" });
    const response = NextResponse.json({ ok: true, role: "OWNER" });
    response.cookies.set(sessionCookieOptions.name, token, sessionCookieOptions);
    return response;
  }

  // Email provided — a restricted account (e.g. the trading user), looked up in `users`.
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

  // Same generic error whether the email doesn't exist or the password is wrong — don't reveal which.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const token = await createSessionToken({ role: user.role, userId: user.id, email: user.email });
  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set(sessionCookieOptions.name, token, sessionCookieOptions);
  return response;
}
