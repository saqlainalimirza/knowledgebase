import { NextResponse } from "next/server";
import crypto from "crypto";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// Real-time Slack Events endpoint for the bug ticketing system (PRIVATE ops tool).
// Slack POSTs here when a message is posted in the bugs channel. We:
//   1. answer Slack's one-time url_verification challenge,
//   2. verify the request signature (if SLACK_SIGNING_SECRET is set),
//   3. insert a bug_ticket for each new message in the bugs channel.
// This is NOT part of the Evergreen data API and is not referenced by the skill.

const BUGS_CHANNEL = process.env.BUGS_CHANNEL_ID || "C0890LFFRAB";
const TEAM_URL = (process.env.SLACK_TEAM_URL || "https://scaletopia.slack.com").replace(/\/$/, "");
const SKIP_SUBTYPES = new Set([
  "channel_join", "channel_leave", "bot_message", "message_changed",
  "message_deleted", "thread_broadcast",
]);

function verifySignature(raw: string, ts: string | null, sig: string | null): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // not configured yet -> don't block (challenge still works)
  if (!ts || !sig) return false;
  // reject requests older than 5 minutes (replay protection)
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const base = `v0:${ts}:${raw}`;
  const mine = "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
  const a = new Uint8Array(Buffer.from(mine));
  const b = new Uint8Array(Buffer.from(sig));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  // 1. URL verification handshake — respond with the challenge (before signature check,
  //    so the URL verifies even if the signing secret is not set yet).
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // 2. verify it is really Slack
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!verifySignature(raw, ts, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // 3. handle the event. Respond 200 fast so Slack does not retry.
  try {
    if (body.type === "event_callback" && body.event?.type === "message") {
      const e = body.event;
      const isBugsChannel = e.channel === BUGS_CHANNEL;
      const isNoise = e.subtype && SKIP_SUBTYPES.has(e.subtype);
      const text = (e.text || "").trim();
      if (isBugsChannel && !isNoise && !e.bot_id && text.length > 0) {
        const day = new Date(Number(e.ts) * 1000).toISOString().slice(0, 10);
        const permalink = `${TEAM_URL}/archives/${e.channel}/p${String(e.ts).replace(".", "")}`;
        await q(
          `insert into bug_tickets(slack_ts, slack_channel_id, reporter, permalink, text, day)
           values($1,$2,$3,$4,$5,$6) on conflict (slack_ts) do nothing`,
          [e.ts, e.channel, e.user || e.username || null, permalink, text, day]
        );
      }
    }
  } catch (err) {
    // swallow — never make Slack retry a storm; the daily poll backfills anything missed
    console.error("slack events insert failed", err);
  }
  return NextResponse.json({ ok: true });
}
