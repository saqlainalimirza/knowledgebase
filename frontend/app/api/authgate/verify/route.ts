import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";

// Node-runtime auth check, backed by the api_keys table (the DB is the authority — not env).
// The edge middleware calls this to validate a presented credential; it never returns the
// key/password list, only a yes/no for the credential the caller already holds. Add or revoke
// an API key, or change the dashboard login, by editing a row in api_keys — no redeploy.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { type, cred, user } = body || {};
  if (!cred || typeof cred !== "string") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    if (type === "key") {
      const row = await one<{ id: number }>(
        "select id from api_keys where kind='api_key' and active and key=$1 limit 1",
        [cred],
      );
      if (row) {
        // best-effort usage stamp; never fail the auth on this
        try {
          await q("update api_keys set last_used_at=now() where id=$1", [row.id]);
        } catch {
          /* ignore */
        }
        return NextResponse.json({ ok: true });
      }
    } else if (type === "dash") {
      const row = await one<{ id: number }>(
        "select id from api_keys where kind='dashboard' and active and owner=$1 and key=$2 limit 1",
        [user, cred],
      );
      if (row) return NextResponse.json({ ok: true });
    }
  } catch {
    // DB unreachable -> fail closed
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
