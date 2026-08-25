import { NextResponse } from "next/server";
import { one, q } from "@/lib/db";
import { listRecords } from "@/lib/airtable";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Live deals for a client from the Airtable Deals table, with EVERY field exposed,
// connected to campaigns (Airtable link + text name + best-effort DB campaign id).
// The AI fetches once and filters client-side; optional query params pre-filter:
//   ?stage=Won  ?variant=A  ?channel=sms|email  ?category=Not%20Interested  ?limit=100
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const url = new URL(req.url);
  const fStage = url.searchParams.get("stage");
  const fVariant = url.searchParams.get("variant");
  const fChannel = url.searchParams.get("channel");
  const fCategory = url.searchParams.get("category");
  const limit = Number(url.searchParams.get("limit")) || 500;

  try {
    const client = await one<any>(
      `select client, airtable_client_id from client_roster where slug=$1`, [slug]);
    if (!client) return NextResponse.json({ error: "client not found" }, { status: 404 });

    const name = String(client.client).replace(/'/g, "\\'");
    const recs = await listRecords("Deals", {
      formula: `FIND('${name}', ARRAYJOIN({Client}))`,
      maxRecords: limit,
    });

    // our DB campaigns for best-effort name matching -> db_campaign_id
    const dbCamps = await q<any>(
      `select id, name from campaigns where client_slug=$1`, [slug]);
    const matchDbCampaign = (dealCampaignText: string | null) => {
      if (!dealCampaignText) return null;
      const t = dealCampaignText.toLowerCase();
      const hit = dbCamps.find((c) => c.name && (t.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(t)));
      return hit ? hit.id : null;
    };

    const channelOf = (src: any) => {
      const s = Array.isArray(src) ? src.join(",") : String(src || "");
      if (/GoHighLevel/i.test(s)) return "sms";
      if (/Smartlead|EmailBison/i.test(s)) return "email";
      return s ? s.toLowerCase() : null;
    };

    let deals = recs.map(({ id, fields: f }) => {
      const campaignText =
        (f["Campaign (from Contacts)"] as string) || (f["📢 Campaigns"] as string) || null;
      return {
        airtable_deal_id: id,
        opportunity: f["Opportunity"] ?? null,
        created_at: f["Date created"] ?? null,
        // outcome
        stage: f["Pipeline stage"] ?? null,
        positive_reply_category: f["Positive Reply Category"] ?? null,
        lost_reason: f["Lost reason"] ?? null,
        closed_amount: f["closed-amount"] ?? null,
        meeting_booked_at: f["Date of Meeting Booked"] ?? null,
        meeting_url: f["Meeting URL"] ?? null,
        // attribution
        channel: channelOf(f["Source Select"] ?? f["Source"]),
        copy_variant: f["Copy Variant (from Contacts)"] ?? null,
        campaign_airtable_ids: f["Campaign"] ?? [],          // linked rec ids (Relinked Campaigns)
        campaign_name: campaignText,
        db_campaign_id: matchDbCampaign(campaignText),
        // who
        contact: f["Primary contact"] ?? null,
        job_title: f["Title (from Contacts)"] ?? null,
        company: f["Company Name"] ?? null,
        website: f["Website"] ?? null,
        email: f["Email"] ?? null,
        linkedin: f["LinkedIn profile"] ?? null,
        phone: f["Mobile phone #"] ?? null,
        location: f["Location"] ?? null,
        timezone: f["Timezone"] ?? null,
        // the story
        conversation: f["Email conversation"] ?? null,
        recordings: f["Recordings"] ?? null,
        notes: f["Notes"] ?? null,
        next_step_no: f["next-step-no"] ?? null,
        not_closed_reason: f["Not closed-reason-feedback"] ?? null,
        overall_feedback: f["overall-feedback"] ?? null,
      };
    });

    if (fStage) deals = deals.filter((d) => String(d.stage || "").toLowerCase() === fStage.toLowerCase());
    if (fVariant) deals = deals.filter((d) => String(d.copy_variant || "").toLowerCase().includes(fVariant.toLowerCase()));
    if (fChannel) deals = deals.filter((d) => d.channel === fChannel.toLowerCase());
    if (fCategory) deals = deals.filter((d) => String(d.positive_reply_category || "").toLowerCase().includes(fCategory.toLowerCase()));
    // #6: filter by campaign — matches the deal's campaign text OR its matched db campaign id
    const fCampaign = url.searchParams.get("campaign");
    const fCampaignId = url.searchParams.get("campaignId");
    if (fCampaign) deals = deals.filter((d) => String(d.campaign_name || "").toLowerCase().includes(fCampaign.toLowerCase()));
    if (fCampaignId) deals = deals.filter((d) => String(d.db_campaign_id || "") === fCampaignId);

    // quick aggregates so the AI can orient without recomputing
    const by = (key: (d: any) => any) => {
      const m: Record<string, number> = {};
      for (const d of deals) { const k = key(d) || "(none)"; m[k] = (m[k] || 0) + 1; }
      return m;
    };
    return NextResponse.json({
      client: slug,
      count: deals.length,
      by_stage: by((d) => d.stage),
      by_variant: by((d) => d.copy_variant),
      by_channel: by((d) => d.channel),
      by_reply_category: by((d) => d.positive_reply_category),
      deals,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
