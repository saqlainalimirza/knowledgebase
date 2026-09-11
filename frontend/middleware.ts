import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Unified auth for Evergreen. The AUTHORITY is the DB (the api_keys table), not env vars:
//  - API callers (Claude via the skills, curl, services) send `Authorization: Bearer <key>`
//    (or `x-api-key: <key>`). Valid keys are rows in api_keys where kind='api_key' and active.
//  - The dashboard is behind a simple email+password login (HTTP Basic, no 2FA): the row in
//    api_keys where kind='dashboard' (owner=email, key=password). Once the browser has logged
//    in it resends the creds on every same-origin request, so the dashboard's own /api fetches
//    are authorized too — no secret is ever shipped into the page.
//  - Slack's webhook, the cron trigger, and the internal auth-verify route are exempt.
//
// Edge middleware can't use the pg driver, so it verifies each credential through the
// Node-runtime route /api/authgate/verify (which reads api_keys) and caches the yes/no answer
// briefly. Add/revoke a key or change the dashboard password by editing a DB row — no redeploy.
// Fails closed: if the DB/verify is unreachable, nothing is authorized.

const EXEMPT = [/^\/api\/slack\/events/, /^\/api\/cron\//, /^\/api\/authgate\//];

const TTL_MS = 60_000;
type Entry = { ok: boolean; exp: number };
// module-scope cache; survives within a warm edge instance
const cache = new Map<string, Entry>();

async function verify(origin: string, payload: object, cacheKey: string): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.exp > now) return hit.ok;
  let ok = false;
  try {
    const r = await fetch(`${origin}/api/authgate/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    ok = r.status === 200;
  } catch {
    ok = false;
  }
  // cache negatives briefly too, to blunt brute-force chatter; positives for TTL_MS
  cache.set(cacheKey, { ok, exp: now + (ok ? TTL_MS : 5_000) });
  return ok;
}

// Behind Railway's proxy, req.nextUrl.origin can resolve to localhost, so a self-fetch to it
// hits nothing. Build the base from the forwarded host headers the request actually arrived on.
function selfBase(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (EXEMPT.some((re) => re.test(pathname))) return NextResponse.next();
  if (req.method === "OPTIONS") return NextResponse.next();
  const origin = selfBase(req);

  const isApi = pathname.startsWith("/api/");
  const auth = req.headers.get("authorization") || "";

  // 1) programmatic API key (Bearer or x-api-key)
  const provided = auth.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : (req.headers.get("x-api-key") || "").trim();
  if (provided && (await verify(origin, { type: "key", cred: provided }, "k:" + provided))) {
    return NextResponse.next();
  }

  // 2) dashboard login (HTTP Basic) — also authorizes the dashboard's own same-origin /api fetches
  if (auth.startsWith("Basic ")) {
    try {
      const raw = atob(auth.slice(6));
      const i = raw.indexOf(":");
      const user = raw.slice(0, i);
      const pass = raw.slice(i + 1);
      if (await verify(origin, { type: "dash", user, cred: pass }, "d:" + raw)) {
        return NextResponse.next();
      }
    } catch {
      /* fall through to 401 */
    }
  }

  // 3) not authorized
  if (isApi) {
    return NextResponse.json(
      { error: "unauthorized — send Authorization: Bearer <api key>" },
      { status: 401 },
    );
  }
  // a dashboard page: prompt the browser for the login
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Evergreen", charset="UTF-8"' },
  });
}

// Everything except Next's static assets. Covers the dashboard pages AND /api.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"] };
