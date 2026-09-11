import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Unified auth for Evergreen.
//
//  - Programmatic callers (Claude via the skills, curl, services) send
//    `Authorization: Bearer <key>` (or `x-api-key: <key>`). Valid keys are the
//    comma-separated list in EVERGREEN_API_KEY (mirrors the api_keys table in Supabase).
//  - The dashboard is behind a simple email + password login (HTTP Basic, no 2FA), from
//    DASH_USER / DASH_PASS. Once the browser has logged in it resends those creds on every
//    same-origin request, so the dashboard's own /api fetches are authorized too — no secret
//    is ever shipped into the page.
//  - Slack's webhook and the internal cron trigger carry their own auth, so they're exempt.
//  - Fails closed: if nothing is configured on the server, access is denied, never open.

const EXEMPT = [/^\/api\/slack\/events/, /^\/api\/cron\//];

function apiKeys(): string[] {
  return (process.env.EVERGREEN_API_KEY || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function basicOk(header: string): boolean {
  if (!header.startsWith("Basic ")) return false;
  const user = process.env.DASH_USER;
  const pass = process.env.DASH_PASS;
  if (!user || !pass) return false;
  try {
    const idx = atob(header.slice(6)).indexOf(":");
    const u = atob(header.slice(6)).slice(0, idx);
    const p = atob(header.slice(6)).slice(idx + 1);
    return u === user && p === pass;
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (EXEMPT.some((re) => re.test(pathname))) return NextResponse.next();
  if (req.method === "OPTIONS") return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const auth = req.headers.get("authorization") || "";

  // 1) programmatic API key
  const provided = auth.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : (req.headers.get("x-api-key") || "").trim();
  const keys = apiKeys();
  if (provided && keys.includes(provided)) return NextResponse.next();

  // 2) dashboard login (also authorizes the dashboard's own same-origin /api fetches)
  if (basicOk(auth)) return NextResponse.next();

  // 3) not authorized
  const configured = keys.length > 0 || (process.env.DASH_USER && process.env.DASH_PASS);
  if (isApi) {
    if (!configured) {
      return NextResponse.json({ error: "server misconfigured: no auth set (EVERGREEN_API_KEY / DASH_USER)" }, { status: 503 });
    }
    return NextResponse.json({ error: "unauthorized — send Authorization: Bearer <EVERGREEN_API_KEY>" }, { status: 401 });
  }
  // a dashboard page: prompt the browser for the login
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Evergreen", charset="UTF-8"' },
  });
}

// Everything except Next's static assets. Covers the dashboard pages AND /api.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"] };
