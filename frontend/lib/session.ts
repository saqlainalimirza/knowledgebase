import crypto from "crypto";
import { one } from "@/lib/db";

// Signed session tokens for the dashboard login. The signing secret lives in the DB
// (api_keys row kind='config', owner='session_secret') so there are no auth secrets in env.
// Only Node-runtime routes call these; the edge middleware verifies a token through the
// /api/authgate/verify route (which runs on Node), never touching the secret itself.

export const SESSION_COOKIE = "evg_session";
const SESSION_DAYS = 7;

let cached: { v: string; exp: number } | null = null;
async function secret(): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp > now) return cached.v;
  const row = await one<{ key: string }>(
    "select key from api_keys where kind='config' and owner='session_secret' and active limit 1",
  );
  if (!row) throw new Error("session secret not configured (api_keys kind='config' owner='session_secret')");
  cached = { v: row.key, exp: now + 60_000 };
  return row.key;
}

function sign(payload: string, key: string): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export async function mintSession(user: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = Buffer.from(JSON.stringify({ u: user, exp })).toString("base64url");
  return `${payload}.${sign(payload, await secret())}`;
}

export async function verifySession(token: string): Promise<{ u: string } | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expect = sign(payload, await secret());
  const a = new Uint8Array(Buffer.from(sig));
  const b = new Uint8Array(Buffer.from(expect));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.exp || data.exp * 1000 < Date.now()) return null;
    return { u: String(data.u) };
  } catch {
    return null;
  }
}
