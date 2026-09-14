import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { mintSession, SESSION_COOKIE } from "@/lib/session";

// Dashboard login: validate email+password against the api_keys table (kind='dashboard'),
// then set a signed, httpOnly session cookie. Replaces the browser's native Basic-Auth prompt.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Enter your email and password." }, { status: 400 });
  }

  let row: { id: number } | null = null;
  try {
    row = await one<{ id: number }>(
      "select id from api_keys where kind='dashboard' and active and owner=$1 and key=$2 limit 1",
      [email, password],
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Server error, try again." }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Wrong email or password." }, { status: 401 });
  }

  const token = await mintSession(email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
  return res;
}
