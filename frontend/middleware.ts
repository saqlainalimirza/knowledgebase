import { NextRequest, NextResponse } from "next/server";

// Auth gate. Inactive until APP_PASSWORD is set (safe rollout).
// - Humans: /login sets an httpOnly cookie (SHA-256 token of the password).
// - Machines (Aaman's Claude, scripts): send  x-api-key: <API_KEY>  on /api/* calls.
//   (API_KEY defaults to APP_PASSWORD if not set separately.)

async function token(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret + "::evergreen");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next(); // auth not enabled yet

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const expected = await token(password);

  // machine callers: header key on API routes
  if (pathname.startsWith("/api/")) {
    const key = req.headers.get("x-api-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const apiKey = process.env.API_KEY || password;
    if (key && key === apiKey) return NextResponse.next();
    if (req.cookies.get("evergreen_auth")?.value === expected) return NextResponse.next();
    return NextResponse.json({ error: "unauthorized — send x-api-key header or log in" }, { status: 401 });
  }

  // humans: cookie, else login
  if (req.cookies.get("evergreen_auth")?.value === expected) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
