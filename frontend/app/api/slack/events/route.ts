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
// Only skip true noise. Bot alerts (Airtable Automation Error, Threat Lead) ARE the bugs.
const SKIP_SUBTYPES = new Set([
  "channel_join", "channel_leave", "channel_topic", "channel_purpose",
  "message_changed", "message_deleted",
]);

// bot alerts often carry content in attachments/blocks instead of `text`
function extractText(e: any): string {
  const parts: string[] = [];
  for (const a of e.attachments || [])
    for (const k of ["fallback", "pretext", "title", "text"]) if (a[k]) parts.push(String(a[k]));
  for (const b of e.blocks || []) {
    if (b.text?.text) parts.push(String(b.text.text));
    for (const f of b.fields || []) if (f?.text) parts.push(String(f.text));
  }
  return Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean))).join("\n").trim();
}

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
      const text = (e.text || "").trim() || extractText(e);
      if (isBugsChannel && !isNoise && text.length > 0) {
        const day = new Date(Number(e.ts) * 1000).toISOString().slice(0, 10);
        const permalink = `${TEAM_URL}/archives/${e.channel}/p${String(e.ts).replace(".", "")}`;
        const reporter = e.user || e.username || e.bot_profile?.name || null;
        await q(
          `insert into bug_tickets(slack_ts, slack_channel_id, reporter, permalink, text, day)
           values($1,$2,$3,$4,$5,$6) on conflict (slack_ts) do nothing`,
          [e.ts, e.channel, reporter, permalink, text, day]
        );
      }
    }
  } catch (err) {
    // swallow — never make Slack retry a storm; the daily poll backfills anything missed
    console.error("slack events insert failed", err);
  }
  return NextResponse.json({ ok: true });
}
