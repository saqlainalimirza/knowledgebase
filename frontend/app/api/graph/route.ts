import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

type Node = { id: string; type: string; label: string; value?: number; parent?: string; niche?: string; meta?: any };
type Edge = { source: string; target: string; kind: string };

const PAIN_CAP = 10;    // per kind per client
const DEAL_CAP = 60;    // booked-deal nodes per client
const KB_CAP = 8;       // top pains / lingo from the niche brain

const BOOKED = ["meeting booked", "show", "won", "next stage", "proposal sent", "verbal agreement"];

// Bulk-loaded graph: ~10 whole-table queries in parallel (was ~7 × N clients).
export async function GET() {
  try {
    const [clients, kbRows, calls, pains, campaigns, cases, copies, offers, dealTotals, bookedDeals] =
      await Promise.all([
        q<any>(`select cr.slug, cr.client, coalesce(n.name, cr.niche) as niche
                from client_roster cr left join niches n on n.id = cr.niche_id
                order by cr.client`),
        q<any>(`select niche, top_pains, shared_lingo from niche_knowledge`),
        q<any>(`select id, client_slug, title, source_call_id from client_calls order by id`),
        q<any>(`select id, client_slug, kind, item_text, confidence, source
                from master_sheet_pains order by client_slug, kind, confidence desc`),
        q<any>(`select id, client_slug, name, angle, channel from campaigns order by id`),
        q<any>(`select id, owner_client_slug as client_slug, subject_brand, tier from case_studies order by tier`),
        q<any>(`select id, client_slug, status, campaign_id from copies order by id desc`),
        q<any>(`select id, client_slug, offer_text, service, pattern from offers order by id`),
        q<any>(`select client_slug, count(*)::int as total from deals group by client_slug`),
        q<any>(`select id, client_slug, company, job_title, variant, stage, campaign_id from deals
                where lower(coalesce(stage,'')) = any($1) order by id`, [BOOKED]),
      ]);

    const by = <T extends { client_slug?: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const k = (r as any).client_slug;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
      }
      return m;
    };
    const callsBy = by(calls), painsBy = by(pains), campsBy = by(campaigns),
      casesBy = by(cases), copiesBy = by(copies), offersBy = by(offers), bookedBy = by(bookedDeals);
    const dealTotalBy = new Map(dealTotals.map((d: any) => [d.client_slug, d.total]));
    const kbByNiche = new Map(kbRows.map((r: any) => [r.niche, r]));

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const seen = new Set<string>();
    const add = (n: Node) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
    const link = (s: string, t: string, kind: string) => edges.push({ source: s, target: t, kind });
    const offersByService: Record<string, string[]> = {};

    for (const c of clients) {
      const niche = c.niche || "unassigned";
      const nicheId = `niche:${niche}`;
      add({ id: nicheId, type: "niche", label: niche, niche });

      const kb = kbByNiche.get(c.niche);
      if (kb) {
        const kbId = `kb:${niche}`;
        add({ id: kbId, type: "kb", label: "Niche brain", parent: nicheId, niche });
        link(nicheId, kbId, "synthesizes");
        asArr(kb.top_pains).slice(0, KB_CAP).forEach((p: any, i: number) => {
          const id = `kbp:${niche}:${i}`;
          add({ id, type: "kbpain", label: typeof p === "string" ? p : p.pain, parent: kbId, niche });
          link(kbId, id, "pain");
        });
        asArr(kb.shared_lingo).slice(0, KB_CAP).forEach((w: string, i: number) => {
          const id = `kbl:${niche}:${i}`;
          add({ id, type: "kblingo", label: w, parent: kbId, niche });
          link(kbId, id, "lingo");
        });
      }

      const cId = `client:${c.slug}`;
      add({ id: cId, type: "client", label: c.client, parent: nicheId, niche });
      link(cId, nicheId, "in-niche");

      // calls (first, so pains can link to their source call)
      const cCalls = callsBy.get(c.slug) || [];
      const callNodeBySrc: Record<string, string> = {};
      if (cCalls.length) {
        const callHub = `hub:${c.slug}:calls`;
        add({ id: callHub, type: "hub", label: "Calls / docs", value: cCalls.length, parent: cId, niche });
        link(cId, callHub, "has");
        cCalls.forEach((cl: any) => {
          const id = `call:${c.slug}:${cl.id}`;
          callNodeBySrc[cl.source_call_id] = id;
          add({ id, type: "call", label: cl.title || cl.source_call_id, parent: callHub, niche });
          link(callHub, id, "call");
        });
      }

      // pains grouped by kind (cap per kind)
      const cPains = painsBy.get(c.slug) || [];
      if (cPains.length) {
        const painsHub = `hub:${c.slug}:pains`;
        add({ id: painsHub, type: "hub", label: "Pains & voice", value: cPains.length, parent: cId, niche });
        link(cId, painsHub, "has");
        const byKind: Record<string, any[]> = {};
        for (const p of cPains) (byKind[p.kind] ||= []).push(p);
        for (const [kind, items] of Object.entries(byKind)) {
          const kindId = `pk:${c.slug}:${kind}`;
          add({ id: kindId, type: "painkind", label: kind, value: items.length, parent: painsHub, niche });
          link(painsHub, kindId, "kind");
          items.slice(0, PAIN_CAP).forEach((p) => {
            const id = `pi:${c.slug}:${p.id}`;
            add({ id, type: "pain", label: p.item_text, parent: kindId, niche, meta: { confidence: p.confidence } });
            link(kindId, id, "item");
            const m = /^call (.+)$/.exec(p.source || "");
            if (m && callNodeBySrc[m[1]]) link(id, callNodeBySrc[m[1]], "mined-from");
          });
        }
      }

      // campaigns grouped by angle
      const cCamps = campsBy.get(c.slug) || [];
      if (cCamps.length) {
        const campHub = `hub:${c.slug}:campaigns`;
        add({ id: campHub, type: "hub", label: "Campaigns", value: cCamps.length, parent: cId, niche });
        link(cId, campHub, "has");
        const byAngle: Record<string, any[]> = {};
        for (const cp of cCamps) (byAngle[cp.angle || "other"] ||= []).push(cp);
        for (const [angle, items] of Object.entries(byAngle)) {
          const angId = `ang:${c.slug}:${angle}`;
          add({ id: angId, type: "angle", label: angle, value: items.length, parent: campHub, niche });
          link(campHub, angId, "vertical");
          items.forEach((cp) => {
            const id = `camp:${c.slug}:${cp.id}`;
            add({ id, type: "campaign", label: cleanName(cp.name), parent: angId, niche, meta: { channel: cp.channel } });
            link(angId, id, "campaign");
          });
        }
      }

      // offers (cross-connect by service)
      const cOffers = offersBy.get(c.slug) || [];
      if (cOffers.length) {
        const offHub = `hub:${c.slug}:offers`;
        add({ id: offHub, type: "hub", label: "Offers", value: cOffers.length, parent: cId, niche });
        link(cId, offHub, "has");
        cOffers.forEach((o: any) => {
          const id = `off:${c.slug}:${o.id}`;
          add({ id, type: "offer", label: `[${o.service || "?"}] ${o.offer_text}`, parent: offHub, niche, meta: { service: o.service, pattern: o.pattern } });
          link(offHub, id, "offer");
          (offersByService[o.service || "other"] ||= []).push(id);
        });
      }

      // case studies
      const cCases = casesBy.get(c.slug) || [];
      if (cCases.length) {
        const csHub = `hub:${c.slug}:cases`;
        add({ id: csHub, type: "hub", label: "Case studies", value: cCases.length, parent: cId, niche });
        link(cId, csHub, "has");
        cCases.forEach((cs: any) => {
          const id = `cs:${c.slug}:${cs.id}`;
          add({ id, type: "case", label: `${cs.subject_brand} (${cs.tier})`, parent: csHub, niche });
          link(csHub, id, "case");
        });
      }

      // copies
      const cCopies = copiesBy.get(c.slug) || [];
      if (cCopies.length) {
        const cpHub = `hub:${c.slug}:copies`;
        add({ id: cpHub, type: "hub", label: "Copies", value: cCopies.length, parent: cId, niche });
        link(cId, cpHub, "has");
        cCopies.forEach((cp: any) => {
          const id = `cp:${c.slug}:${cp.id}`;
          add({ id, type: "copy", label: `copy #${cp.id} (${cp.status})`, parent: cpHub, niche });
          link(cpHub, id, "copy");
          if (cp.campaign_id) link(id, `camp:${c.slug}:${cp.campaign_id}`, "for-campaign");
        });
      }

      // deals (booked+ as nodes; total on the hub)
      const total = dealTotalBy.get(c.slug) || 0;
      if (total > 0) {
        const dealHub = `hub:${c.slug}:deals`;
        add({ id: dealHub, type: "hub", label: "Deals", value: total, parent: cId, niche });
        link(cId, dealHub, "has");
        (bookedBy.get(c.slug) || []).slice(0, DEAL_CAP).forEach((d: any) => {
          const id = `deal:${c.slug}:${d.id}`;
          add({ id, type: "deal", label: `${d.company || d.job_title || "deal"} (${d.stage}${d.variant ? " · var " + d.variant : ""})`, parent: dealHub, niche, meta: { job_title: d.job_title } });
          link(dealHub, id, "deal");
          if (d.campaign_id) link(id, `camp:${c.slug}:${d.campaign_id}`, "from-campaign");
        });
      }
    }

    // offer <-> offer: same service across different clients
    for (const [service, ids] of Object.entries(offersByService)) {
      if (service === "other") continue;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const ca = ids[i].split(":")[1], cb = ids[j].split(":")[1];
          if (ca !== cb) link(ids[i], ids[j], `same-offer ${service}`);
        }
    }

    // client <-> client sharing a niche
    const byNiche: Record<string, string[]> = {};
    for (const c of clients) (byNiche[c.niche || "unassigned"] ||= []).push(c.slug);
    for (const slugs of Object.values(byNiche)) {
      for (let i = 0; i < slugs.length; i++)
        for (let j = i + 1; j < slugs.length; j++)
          link(`client:${slugs[i]}`, `client:${slugs[j]}`, "co-client");
    }

    // niche <-> niche similarity (embeddings)
    try {
      const sims = await q<any>(`
        select a.niche as a, b.niche as b,
               round((1 - (a.summary_embedding <=> b.summary_embedding))::numeric, 3) as sim
        from niche_knowledge a join niche_knowledge b on a.niche < b.niche
        where a.summary_embedding is not null and b.summary_embedding is not null
          and (1 - (a.summary_embedding <=> b.summary_embedding)) >= 0.55`);
      for (const s of sims) {
        if (seen.has(`niche:${s.a}`) && seen.has(`niche:${s.b}`))
          link(`niche:${s.a}`, `niche:${s.b}`, `related ${s.sim}`);
      }
    } catch { /* no niche embeddings yet */ }

    const sharedNiches = nodes.filter((n) => n.type === "niche").map((n) => ({
      niche: n.label,
      clients: clients.filter((c: any) => (c.niche || "unassigned") === n.label).map((c: any) => c.client),
    })).filter((x) => x.clients.length > 1);

    return NextResponse.json({
      nodes, edges,
      summary: { clients: clients.length, niches: nodes.filter((n) => n.type === "niche").length, sharedNiches },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function asArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}
function cleanName(name: string) {
  if (!name) return "campaign";
  const m = name.split("-").slice(1).join("-").trim();
  return (m || name).split("|")[0].trim();
}
