import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

type Node = { id: string; type: string; label: string; value?: number; parent?: string; niche?: string; meta?: any };
type Edge = { source: string; target: string; kind: string };

const PAIN_CAP = 10;   // per kind
const CAMP_CAP = 200;  // total campaigns
const KB_CAP = 8;      // top pains / lingo from the niche brain

export async function GET() {
  try {
    const clients = await q<any>(`select slug, client, niche from client_roster order by client`);
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const seen = new Set<string>();
    const add = (n: Node) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
    const link = (s: string, t: string, kind: string) => edges.push({ source: s, target: t, kind });

    // niche-knowledge once per niche
    const kbRows = await q<any>(`select niche, top_pains, shared_lingo from niche_knowledge`);
    const kbByNiche = new Map(kbRows.map((r) => [r.niche, r]));
    const offersByService: Record<string, string[]> = {};

    for (const c of clients) {
      const niche = c.niche || "unassigned";
      const nicheId = `niche:${niche}`;
      add({ id: nicheId, type: "niche", label: niche, niche });

      // niche brain + its top pains / lingo
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

      // ---- calls / docs (built first so pains can link to their source call) ----
      const calls = await q<any>(
        `select id, title, source_call_id, source from client_calls where client_slug=$1 order by id`, [c.slug]);
      const callNodeBySrc: Record<string, string> = {};
      if (calls.length) {
        const callHub = `hub:${c.slug}:calls`;
        add({ id: callHub, type: "hub", label: "Calls / docs", value: calls.length, parent: cId, niche });
        link(cId, callHub, "has");
        calls.forEach((cl) => {
          const id = `call:${c.slug}:${cl.id}`;
          callNodeBySrc[cl.source_call_id] = id;
          add({ id, type: "call", label: cl.title || cl.source_call_id, parent: callHub, niche, meta: { source: cl.source } });
          link(callHub, id, "call");
        });
      }

      // ---- pains by kind (each linked back to the call/doc it was mined from) ----
      const pains = await q<any>(
        `select id, kind, item_text, confidence, source from master_sheet_pains
         where client_slug=$1 order by kind, confidence desc`, [c.slug]);
      if (pains.length) {
        const painsHub = `hub:${c.slug}:pains`;
        add({ id: painsHub, type: "hub", label: `Pains & voice`, value: pains.length, parent: cId, niche });
        link(cId, painsHub, "has");
        const byKind: Record<string, any[]> = {};
        for (const p of pains) (byKind[p.kind] ||= []).push(p);
        for (const [kind, items] of Object.entries(byKind)) {
          const kindId = `pk:${c.slug}:${kind}`;
          add({ id: kindId, type: "painkind", label: kind, value: items.length, parent: painsHub, niche });
          link(painsHub, kindId, "kind");
          items.slice(0, PAIN_CAP).forEach((p) => {
            const id = `pi:${c.slug}:${p.id}`;
            add({ id, type: "pain", label: p.item_text, parent: kindId, niche, meta: { confidence: p.confidence, source: p.source } });
            link(kindId, id, "item");
            // provenance: link the pain back to the call/doc it was mined from
            const m = /^call (.+)$/.exec(p.source || "");
            if (m && callNodeBySrc[m[1]]) link(id, callNodeBySrc[m[1]], "mined-from");
          });
        }
      }

      // ---- campaigns grouped by angle/vertical ----
      const camps = await q<any>(
        `select id, name, angle, channel from campaigns where client_slug=$1 limit ${CAMP_CAP}`, [c.slug]);
      if (camps.length) {
        const campHub = `hub:${c.slug}:campaigns`;
        add({ id: campHub, type: "hub", label: "Campaigns", value: camps.length, parent: cId, niche });
        link(cId, campHub, "has");
        const byAngle: Record<string, any[]> = {};
        for (const cp of camps) (byAngle[cp.angle || "other"] ||= []).push(cp);
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

      // ---- offers (service categories we pitch; cross-connect clients by service) ----
      const offers = await q<any>(
        `select id, offer_text, service, pattern from offers where client_slug=$1 order by id`, [c.slug]);
      if (offers.length) {
        const offHub = `hub:${c.slug}:offers`;
        add({ id: offHub, type: "hub", label: "Offers", value: offers.length, parent: cId, niche });
        link(cId, offHub, "has");
        offers.forEach((o) => {
          const id = `off:${c.slug}:${o.id}`;
          add({ id, type: "offer", label: `[${o.service || "?"}] ${o.offer_text}`, parent: offHub, niche, meta: { service: o.service, pattern: o.pattern } });
          link(offHub, id, "offer");
          (offersByService[o.service || "other"] ||= []).push(id);
        });
      }

      // ---- case studies ----
      const cases = await q<any>(
        `select id, subject_brand, tier from case_studies where owner_client_slug=$1 order by tier`, [c.slug]);
      if (cases.length) {
        const csHub = `hub:${c.slug}:cases`;
        add({ id: csHub, type: "hub", label: "Case studies", value: cases.length, parent: cId, niche });
        link(cId, csHub, "has");
        cases.forEach((cs) => {
          const id = `cs:${c.slug}:${cs.id}`;
          add({ id, type: "case", label: `${cs.subject_brand} (${cs.tier})`, parent: csHub, niche });
          link(csHub, id, "case");
        });
      }

      // ---- copies (linked to their campaign) ----
      const copies = await q<any>(
        `select id, status, lever, campaign_id from copies where client_slug=$1 order by id desc`, [c.slug]);
      if (copies.length) {
        const cpHub = `hub:${c.slug}:copies`;
        add({ id: cpHub, type: "hub", label: "Copies", value: copies.length, parent: cId, niche });
        link(cId, cpHub, "has");
        copies.forEach((cp) => {
          const id = `cp:${c.slug}:${cp.id}`;
          add({ id, type: "copy", label: `copy #${cp.id} (${cp.status})`, parent: cpHub, niche });
          link(cpHub, id, "copy");
          if (cp.campaign_id) link(id, `camp:${c.slug}:${cp.campaign_id}`, "for-campaign");
        });
      }

    }

    // offer <-> offer cross-links: same service across DIFFERENT clients
    for (const [service, ids] of Object.entries(offersByService)) {
      if (service === "other") continue;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const ca = ids[i].split(":")[1], cb = ids[j].split(":")[1];
          if (ca !== cb) link(ids[i], ids[j], `same-offer ${service}`);
        }
    }

    // direct client <-> client cross-links when they share a niche (visible line)
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
      clients: clients.filter((c) => (c.niche || "unassigned") === n.label).map((c) => c.client),
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
