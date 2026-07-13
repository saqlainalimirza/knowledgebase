import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import ClientActions from "@/components/ClientActions";
import ClientStats from "@/components/ClientStats";
import NicheOverride from "@/components/NicheOverride";
import ClientTabs from "@/components/ClientTabs";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const client = await one<any>(
    `select slug, client, niche, sub_niche, niche_source, offer, airtable_client_id, status
     from client_roster where slug=$1`,
    [slug]
  );
  if (!client) notFound();

  const [pains, caseStudies, calls, campaigns, copies, offers, nicheBrain] = await Promise.all([
    q<any>(`select id, kind, persona, item_text, confidence, job_function
            from master_sheet_pains where client_slug=$1 order by confidence desc, kind limit 500`, [slug]),
    q<any>(`select subject_brand, tier, after_state, unique_mechanism
            from case_studies where owner_client_slug=$1 order by tier, subject_brand`, [slug]),
    q<any>(`select c.title, c.source, c.source_call_id,
                   (select count(*) from call_chunks ch where ch.call_id=c.id)::int as chunks
            from client_calls c where c.client_slug=$1 order by c.id`, [slug]),
    q<any>(`select id, name, channel, angle, sent, positive_replies, power_requests, booked
            from campaigns where client_slug=$1 order by power_requests desc nulls last limit 250`, [slug]),
    q<any>(`select c.id, c.status, c.variant, c.lever, c.t1, c.t2, ca.name as campaign_name,
                   cp.positive_rate, cp.power_rate, cp.sent
            from copies c
            left join campaigns ca on ca.id=c.campaign_id
            left join copy_performance cp on cp.copy_id=c.id
            where c.client_slug=$1 order by c.id desc limit 100`, [slug]),
    q<any>(`select id, offer_text, service, pattern, mechanism, proof_hint
            from offers where client_slug=$1 order by service`, [slug]),
    one<any>(`select nk.commonalities_summary, nk.shared_lingo, nk.refreshed_at
              from niche_knowledge nk
              join client_roster cr on cr.slug=$1
              left join niches n on n.id=cr.niche_id
              where nk.niche = coalesce(n.name, cr.niche) limit 1`, [slug]),
  ]);

  return (
    <main className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-muted hover:text-accent">← all clients</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{client.client}</h1>
          <NicheOverride slug={slug} current={client.niche} currentSub={client.sub_niche} source={client.niche_source} />
          <div className="ml-auto flex gap-2">
            <Link href={`/clients/${slug}/copy`} className="btn-ghost">✍️ Copy</Link>
            <Link href="/search" className="btn-ghost">🔎 Search</Link>
          </div>
        </div>
        {client.offer && <p className="mt-2 max-w-3xl text-sm text-slate-300">{client.offer}</p>}
      </div>

      {/* live Airtable performance band */}
      <ClientStats slug={slug} />

      {/* feed data in */}
      <ClientActions slug={slug} niche={client.niche} airtableId={client.airtable_client_id} />

      {/* the full context (Dashboard V1) */}
      <ClientTabs
        slug={slug}
        pains={pains}
        campaigns={campaigns}
        copies={copies}
        offers={offers}
        cases={caseStudies}
        calls={calls}
        nicheBrain={nicheBrain}
      />
    </main>
  );
}
