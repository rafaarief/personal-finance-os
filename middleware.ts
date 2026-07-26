import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

/**
 * Whitelist, not a blacklist — a TRADING_USER may reach ONLY these paths (plus
 * PUBLIC_PATHS, already let through above). Anything added to the app later
 * is owner-only by default unless explicitly listed here, which is the safer
 * failure mode for a route no one remembered to restrict.
 */
const TRADING_USER_ALLOWED_PATHS = ["/trading", "/api/auth/logout"];

function isAllowedForTradingUser(pathname: string): boolean {
  return TRADING_USER_ALLOWED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Applies to every request method, including a Server Action's POST back to
  // its own page — a TRADING_USER can't reach an owner-only action's code
  // this way either, since the request never gets past this redirect/403.
  if (session.role === "TRADING_USER" && !isAllowedForTradingUser(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/trading", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
