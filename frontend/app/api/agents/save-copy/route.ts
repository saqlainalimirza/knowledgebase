import { NextResponse } from "next/server";
import { runAgent, writeUpload } from "@/lib/agents";
import { q } from "@/lib/db";

export const maxDuration = 120;

// Save a finished copy at launch. Pass `campaignId` (DB id) OR `campaignName` — at write
// time the writer usually knows only the name, so we resolve it to the campaign that the
// daily sync already pulled. Exact name match first, then a contains match. If nothing
// matches, the copy is still saved (unlinked) and the response says so, so it can be linked
// later with /api/copy/link once the campaign appears.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { campaignId, campaignName, ...copy } = body;
    if (!copy.client_slug || !(copy.t1 || copy.t2))
      return NextResponse.json({ error: "client_slug and at least t1 or t2 are required" }, { status: 400 });

    let cid: number | null = campaignId ?? null;
    let linkedTo: string | null = null;
    if (!cid && campaignName) {
      const exact = await q<any>(
        `select id, name from campaigns where client_slug=$1 and lower(name)=lower($2) limit 1`,
        [copy.client_slug, campaignName]);
      const hit = exact[0] || (await q<any>(
        `select id, name from campaigns
         where client_slug=$1 and (lower(name) like '%'||lower($2)||'%' or lower($2) like '%'||lower(name)||'%')
         order by length(name) limit 1`, [copy.client_slug, campaignName]))[0];
      if (hit) { cid = hit.id; linkedTo = hit.name; }
    }

    const file = await writeUpload(`copy-${copy.client_slug}`, JSON.stringify(copy));
    const args = ["copy_agent.py", "--file", file];
    if (cid) args.push("--campaign-id", String(cid));

    const r = await runAgent(args[0], args.slice(1));
    return NextResponse.json({
      ...r,
      campaign_linked: cid ? { id: cid, name: linkedTo } : null,
      note: !cid && campaignName
        ? `no campaign matched "${campaignName}" for ${copy.client_slug}; saved unlinked, link later with /api/copy/link`
        : undefined,
    }, { status: r.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
