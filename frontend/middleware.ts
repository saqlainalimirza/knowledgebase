import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// API-key gate for the Evergreen API.
// - Programmatic callers (Claude via the skills, curl, other services) MUST send the key as
//   `Authorization: Bearer <EVERGREEN_API_KEY>` (or `x-api-key: <key>`), else 401.
// - The dashboard's own browser requests are same-origin, which browsers stamp with
//   `Sec-Fetch-Site: same-origin` (a forbidden header JS cannot set), so the UI keeps working
//   without shipping the secret to the browser.
// - Slack's webhook and the internal cron trigger carry their own auth, so they're exempt.
const EXEMPT = [/^\/api\/slack\/events/, /^\/api\/cron\//];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (EXEMPT.some((re) => re.test(pathname))) return NextResponse.next();
  if (req.method === "OPTIONS") return NextResponse.next(); // CORS preflight

  // dashboard (same-origin browser fetch) — allowed without a key
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "same-site") return NextResponse.next();

  const expected = process.env.EVERGREEN_API_KEY;
  if (!expected) {
    // fail closed: never run open if the key isn't configured on the server
    return NextResponse.json(
      { error: "server misconfigured: EVERGREEN_API_KEY not set" },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : (req.headers.get("x-api-key") || "").trim();

  if (provided !== expected) {
    return NextResponse.json(
      { error: "unauthorized — send Authorization: Bearer <EVERGREEN_API_KEY>" },
      { status: 401 }
    );
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
