import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { cleanSlack, slackToken } from "@/lib/slackText";

export const dynamic = "force-dynamic";

// GET /api/tickets/replies?id=123
// Pulls the Slack thread replies for a ticket's message, on demand (they change as
// people respond), cleans them, and returns them. Private ticketing tool.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const rows = await q<{ slack_ts: string; slack_channel_id: string }>(
      `select slack_ts, slack_channel_id from bug_tickets where id=$1`, [Number(id)]);
    const t = rows[0];
    if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
    const token = slackToken();
    if (!token || !t.slack_ts || !t.slack_channel_id)
      return NextResponse.json({ replies: [], note: "no slack token or ts" });

    const params = new URLSearchParams({ channel: t.slack_channel_id, ts: t.slack_ts, limit: "100" });
    const r = await fetch(`https://slack.com/api/conversations.replies?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await r.json();
    if (!data.ok) return NextResponse.json({ replies: [], error: data.error });

    const replies = (data.messages || [])
      .filter((m: any) => m.ts !== t.slack_ts) // drop the parent message
      .map((m: any) => {
        const raw = (m.text || "").trim() ||
          (m.attachments || []).map((a: any) => a.fallback || a.text || "").join("\n").trim();
        return {
          ts: m.ts,
          text: cleanSlack(raw),
          at: new Date(Number(m.ts) * 1000).toISOString(),
          is_bot: !!m.bot_id,
        };
      })
      .filter((m: any) => m.text);
    return NextResponse.json({ replies });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
