"use client";

import { useEffect, useMemo, useState } from "react";

type Pain = { id: number; kind: string; persona: string | null; item_text: string; confidence: string; job_function: string | null };
type Campaign = { id: number; name: string; channel: string | null; angle: string | null; sent: number | null; positive_replies: number | null; power_requests: number | null; booked: number | null };
type Copy = { id: number; status: string; variant: string | null; lever: string | null; t1: string | null; t2: string | null; campaign_name: string | null; positive_rate: number | null; power_rate: number | null; sent: number | null };
type Offer = { id: number; offer_text: string; service: string | null; pattern: string | null; mechanism: string | null; proof_hint: string | null };
type Case = { subject_brand: string; tier: string; after_state: string; unique_mechanism: string | null };
type Call = { title: string | null; source: string; source_call_id: string; chunks: number };
type Niche = { commonalities_summary: string; shared_lingo: any; refreshed_at: string } | null;

export default function ClientTabs(props: {
  slug: string; pains: Pain[]; campaigns: Campaign[]; copies: Copy[];
  offers: Offer[]; cases: Case[]; calls: Call[]; nicheBrain: Niche;
}) {
  const { slug, pains, campaigns, copies, offers, cases, calls, nicheBrain } = props;
  const tabs = [
    ["pains", `Pains (${pains.length})`], ["campaigns", `Campaigns (${campaigns.length})`],
    ["copies", `Copies (${copies.length})`], ["report", "Report"], ["copyprs", "Copy PRs"], ["offers", `Offers (${offers.length})`],
    ["guidelines", "Guidelines"], ["materials", "Materials"], ["deals", "Deals"], ["replies", "Replies"], ["cases", `Cases (${cases.length})`],
    ["calls", `Calls (${calls.length})`], ["niche", "Niche brain"],
  ] as const;
  const [tab, setTab] = useState<string>("pains");

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? "btn px-3 py-1.5" : "btn-ghost px-3 py-1.5"}>
            {label}
          </button>
        ))}
      </div>
      {tab === "pains" && <PainsTab pains={pains} />}
      {tab === "campaigns" && <CampaignsTab campaigns={campaigns} />}
      {tab === "copies" && <CopiesTab copies={copies} slug={slug} />}
      {tab === "report" && <ReportTab slug={slug} />}
      {tab === "copyprs" && <CopyPerfTab slug={slug} />}
      {tab === "offers" && <OffersTab offers={offers} />}
      {tab === "guidelines" && <GuidelinesTab slug={slug} />}
      {tab === "materials" && <MaterialsTab slug={slug} />}
      {tab === "deals" && <DealsTab slug={slug} />}
      {tab === "replies" && <RepliesTab slug={slug} />}
      {tab === "cases" && <CasesTab cases={cases} />}
      {tab === "calls" && <CallsTab calls={calls} />}
      {tab === "niche" && <NicheTab n={nicheBrain} />}
    </div>
  );
}

/* ---------- Pains: filter by kind / function / confidence / text ---------- */
function PainsTab({ pains }: { pains: Pain[] }) {
  const [kind, setKind] = useState("all");
  const [func, setFunc] = useState("all");
  const [conf, setConf] = useState("all");
  const [qtext, setQ] = useState("");
  const kinds = useMemo(() => Array.from(new Set(pains.map((p) => p.kind))).sort(), [pains]);
  const funcs = useMemo(() => Array.from(new Set(pains.map((p) => p.job_function).filter(Boolean))).sort() as string[], [pains]);
  const shown = pains.filter((p) =>
    (kind === "all" || p.kind === kind) &&
    (func === "all" || p.job_function === func) &&
    (conf === "all" || p.confidence === conf) &&
    (!qtext || p.item_text.toLowerCase().includes(qtext.toLowerCase()) || (p.persona || "").toLowerCase().includes(qtext.toLowerCase()))
  );
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input max-w-[140px] py-1" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">all kinds</option>
          {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select className="input max-w-[160px] py-1" value={func} onChange={(e) => setFunc(e.target.value)}>
          <option value="all">all functions</option>
          {funcs.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="input max-w-[150px] py-1" value={conf} onChange={(e) => setConf(e.target.value)}>
          <option value="all">all confidence</option>
          <option value="confirmed">confirmed</option>
          <option value="needs_more">needs_more</option>
        </select>
        <input className="input flex-1 py-1" placeholder="filter text…" value={qtext} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-muted">{shown.length}/{pains.length}</span>
      </div>
      <ul className="max-h-[480px] space-y-2 overflow-auto pr-1">
        {shown.slice(0, 300).map((p) => (
          <li key={p.id} className="text-sm">
            <span className="chip mr-2">{p.kind}</span>
            {p.job_function && <span className="chip mr-2">{p.job_function}</span>}
            <span className={p.confidence === "confirmed" ? "text-deep" : "text-slate-500"}>{p.item_text}</span>
            {p.persona && <span className="text-xs text-muted"> — {p.persona}</span>}
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm text-muted">No matches.</li>}
      </ul>
    </div>
  );
}

/* ---------- Campaigns: stats table sorted by power ---------- */
function CampaignsTab({ campaigns }: { campaigns: Campaign[] }) {
  const rows = [...campaigns].sort((a, b) => (b.power_requests || 0) - (a.power_requests || 0));
  const rate = (n: number | null, d: number | null) => (n != null && d ? ((n / d) * 100).toFixed(2) + "%" : "—");
  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="tbl">
        <thead className="sticky top-0 bg-panel">
          <tr><th>Campaign</th><th>Ch</th><th className="text-right">Sent</th><th className="text-right">Pos</th>
              <th className="text-right">⚡Power</th><th className="text-right">Power rate</th><th className="text-right">Booked</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="max-w-[300px] truncate" title={c.name}>{c.angle || c.name}</td>
              <td><span className="chip">{c.channel || "?"}</span></td>
              <td className="text-right tabular-nums">{c.sent?.toLocaleString() ?? "—"}</td>
              <td className="text-right tabular-nums">{c.positive_replies ?? "—"}</td>
              <td className="text-right tabular-nums">{c.power_requests ?? "—"}</td>
              <td className="text-right tabular-nums">{rate(c.power_requests, c.sent)}</td>
              <td className="text-right tabular-nums">{c.booked ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Copies ---------- */
function CopiesTab({ copies, slug }: { copies: Copy[]; slug: string }) {
  return (
    <div className="space-y-3">
      <a href={`/clients/${slug}/copy`} className="btn-ghost inline-block">✍️ open copy editor</a>
      <div className="max-h-[480px] space-y-3 overflow-auto pr-1">
        {copies.map((c) => (
          <div key={c.id} className="rounded-lg border border-edge p-3">
            <div className="mb-1 flex flex-wrap gap-2 text-xs text-muted">
              <span className="chip">#{c.id}</span><span className="chip">{c.status}</span>
              {c.variant && <span className="chip">var {c.variant}</span>}
              {c.lever && <span className="chip">{c.lever}</span>}
              {c.power_rate != null && <span className="chip">⚡ {(c.power_rate * 100).toFixed(2)}%</span>}
              {c.positive_rate != null && <span className="chip">PR {(c.positive_rate * 100).toFixed(1)}%</span>}
              {c.campaign_name && <span className="truncate">→ {c.campaign_name}</span>}
            </div>
            <p className="text-sm text-slate-800">{c.t1}</p>
            {c.t2 && <p className="mt-1 text-sm text-slate-500">{c.t2}</p>}
          </div>
        ))}
        {copies.length === 0 && <p className="text-sm text-muted">No copies yet.</p>}
      </div>
    </div>
  );
}

/* ---------- Report: reconstructed live copy + performance + KPIs (what the AI report uses) ---------- */
function ReportTab({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [channel, setChannel] = useState("all");
  const [onlyCopy, setOnlyCopy] = useState(false);
  useEffect(() => {
    fetch(`/api/clients/${slug}/report`).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(e.message));
  }, [slug]);
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!data) return <p className="text-sm text-muted">Loading report… (same call the AI uses)</p>;

  const shown = (data.campaigns || []).filter((c: any) =>
    (channel === "all" || (c.channel || "?") === channel) &&
    (!onlyCopy || c.copy_status === "reconstructed")
  );
  const chBadge = (ch: string | null) =>
    ch === "email" ? "badge badge-amber" : ch === "sms" ? "badge badge-green" : "badge";
  const flag = (v: string) =>
    v === "above" ? "text-emerald-600" : v === "below" ? "text-rose-600" : "text-muted";
  const k = data.kpi;
  const ok = (b: boolean | null) => (b == null ? "—" : b ? "✅" : "⚠️");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Same data as <code>/api/clients/{slug}/report</code> — per campaign, the copy actually running
        (reconstructed from real reply threads, tagged SMS/email) plus its performance, and the client's
        KPIs vs their own targets. {data.summary.with_live_copy}/{data.summary.campaigns} campaigns have
        reconstructed copy; client avg power rate {data.summary.avg_power_rate_pct}%.
      </p>

      {k && (
        <div className="rounded-lg border border-edge p-3 text-xs">
          <div className="mb-1 font-medium">KPIs vs the client's own targets</div>
          <div className="flex flex-wrap gap-4 tabular-nums">
            <span>Weekly booked: {k.this_week.booked}/{k.targets.weeklyBooked} {ok(k.on_track.weeklyBooked)}</span>
            <span>Weekly positives: {k.this_week.positives}/{k.targets.weeklyPositives} {ok(k.on_track.weeklyPositives)}</span>
            <span>Monthly booked: {k.this_month.booked}/{k.targets.monthlyBooked} {ok(k.on_track.monthlyBooked)}</span>
          </div>
          {data.weekly_trend?.length > 0 && (
            <div className="mt-2 text-muted">
              trend (wk · pos/booked): {data.weekly_trend.slice(0, 6).map((w: any) => `${String(w.week).slice(5)} ${w.positives}/${w.booked}`).join("   ")}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className="input w-auto text-xs" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">All channels</option><option value="sms">SMS</option><option value="email">Email</option>
        </select>
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={onlyCopy} onChange={(e) => setOnlyCopy(e.target.checked)} />
          only campaigns with reconstructed copy
        </label>
        <span className="text-muted">· {shown.length} shown</span>
      </div>

      <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
        {shown.map((c: any) => (
          <details key={c.id} className="rounded-lg border border-edge p-2 text-xs">
            <summary className="cursor-pointer select-none">
              <span className={chBadge(c.channel)}>{c.channel || "?"}</span>{" "}
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 tabular-nums text-muted">
                sent {Number(c.sent).toLocaleString()} · PR {c.positives} · ⚡{c.power_rate_pct}%{" "}
                <span className={flag(c.vs_client_avg)}>({c.vs_client_avg})</span> · booked {c.booked}
              </span>
            </summary>
            <div className="mt-2">
              {c.live_copy ? (
                <>
                  <div className="mb-1 text-muted">
                    live copy · var {c.live_copy.variant || "A"} · {c.live_copy.source}
                    {c.live_copy.reconstructed_at && <> · {String(c.live_copy.reconstructed_at).slice(0, 10)}</>}
                  </div>
                  <p className="whitespace-pre-wrap text-slate-800">{c.live_copy.t1}</p>
                  {c.live_copy.t2 && <p className="mt-1 whitespace-pre-wrap text-slate-500">{c.live_copy.t2}</p>}
                </>
              ) : (
                <p className="text-muted">No copy reconstructed — this campaign has no captured reply thread to mine from yet.</p>
              )}
            </div>
          </details>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted">No campaigns match.</p>}
      </div>
    </div>
  );
}

/* ---------- Copy PRs: per-variant performance (PRs per copy) ---------- */
function CopyPerfTab({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(0);
  const [abOnly, setAbOnly] = useState(true);
  useEffect(() => {
    setData(null);
    fetch(`/api/clients/${slug}/copy-performance?weeks=${weeks}`).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(e.message));
  }, [slug, weeks]);
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!data) return <p className="text-sm text-muted">Loading copy performance…</p>;
  const shown = (data.campaigns || []).filter((c: any) => !abOnly || c.ab);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        PRs per copy — each campaign's variants (A/B/C) with reach and positive replies, from the
        variant tag on every reply. "Reached" = categorized replies on that variant (a fair A-vs-B
        denominator, not raw sends). {data.ab_campaigns} campaigns ran a real A/B.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className="input w-auto text-xs" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          <option value={0}>all time</option><option value={1}>this week</option>
          <option value={4}>last 4 weeks</option><option value={12}>last 12 weeks</option>
        </select>
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={abOnly} onChange={(e) => setAbOnly(e.target.checked)} />
          only A/B campaigns
        </label>
        <span className="text-muted">· {shown.length} shown</span>
      </div>
      <div className="max-h-[560px] space-y-3 overflow-auto pr-1">
        {shown.map((c: any) => (
          <div key={c.campaign} className="rounded-lg border border-edge p-2 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {c.channel && <span className={c.channel === "email" ? "badge badge-amber" : "badge badge-green"}>{c.channel}</span>}
              <span className="font-medium">{c.campaign}</span>
              {c.winner && <span className="badge badge-green">winning variant: {c.winner}</span>}
            </div>
            <table className="tbl">
              <thead>
                <tr><th>Variant</th><th className="text-right">Reached</th><th className="text-right">Positive</th><th className="text-right">PR%</th><th>Reconstructed copy</th></tr>
              </thead>
              <tbody>
                {c.variants.map((v: any) => (
                  <tr key={v.variant}>
                    <td>
                      <span className="chip">{v.variant}</span>
                      {c.winner === v.variant && <span className="ml-1 text-emerald-600">✓</span>}
                    </td>
                    <td className="text-right tabular-nums">{v.reached}</td>
                    <td className="text-right tabular-nums">{v.positive}</td>
                    <td className="text-right tabular-nums">{v.pr_pct}%</td>
                    <td className="max-w-[430px]">
                      {v.copy ? (
                        <span className="text-slate-700" title={v.copy.t1}>{String(v.copy.t1).slice(0, 90)}…</span>
                      ) : (
                        <span className="text-muted">no copy</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted">No campaigns match.</p>}
      </div>
    </div>
  );
}

/* ---------- Offers ---------- */
function OffersTab({ offers }: { offers: Offer[] }) {
  const byService: Record<string, Offer[]> = {};
  offers.forEach((o) => { (byService[o.service || "other"] ||= []).push(o); });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(byService).map(([svc, list]) => (
        <div key={svc} className="rounded-lg border border-edge p-3">
          <div className="mb-2"><span className="badge badge-green">{svc}</span></div>
          {list.map((o) => (
            <div key={o.id} className="mb-2 text-sm">
              <p className="text-slate-800">{o.offer_text}</p>
              <p className="text-xs text-muted">
                {o.pattern && <>pattern: {o.pattern} · </>}
                {o.mechanism && <>mechanism: {o.mechanism} · </>}
                {o.proof_hint && <>proof: {o.proof_hint}</>}
              </p>
            </div>
          ))}
        </div>
      ))}
      {offers.length === 0 && <p className="text-sm text-muted">No offers extracted yet.</p>}
    </div>
  );
}

/* ---------- Replies (inbox-lite) ---------- */
/* ---------- Guidelines: persistent memory — copy rules, GTM memory, audit/test log ---------- */
const GL_KINDS: { value: string; label: string }[] = [
  { value: "preference", label: "copy · preference" },
  { value: "process", label: "copy · process" },
  { value: "rule", label: "copy · rule" },
  { value: "learning", label: "copy · learning" },
  { value: "gtm_memory", label: "GTM memory" },
  { value: "audit", label: "audit / test log" },
];
const laneOf = (k: string) => (k === "gtm_memory" ? "gtm" : k === "audit" ? "audit" : "copy");

function GuidelinesTab({ slug }: { slug: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("preference");
  const [global, setGlobal] = useState(false);
  const [lane, setLane] = useState("all");
  const [busy, setBusy] = useState(false);
  const load = () =>
    fetch(`/api/guidelines?client=${slug}`).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setRows(d.guidelines))).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [slug]);
  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await fetch("/api/guidelines", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_slug: global ? null : slug, kind, guideline_text: text.trim(), source: "frontend" }),
    });
    setText(""); setBusy(false); load();
  };
  const remove = async (id: number) => {
    await fetch("/api/guidelines", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: false }),
    });
    load();
  };
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!rows) return <p className="text-sm text-muted">Loading guidelines…</p>;
  const shown = lane === "all" ? rows : rows.filter((g: any) => laneOf(g.kind) === lane);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Persistent memory across sessions, three lanes in one place: <b>copy</b> rules the AI reads
        before writing; <b>GTM memory</b> — durable facts/decisions per client it keeps re-deriving
        (who the real decision-maker is, cadence, what's been tried); and the <b>audit / test log</b>
        — a campaign issue + what to test next (resolve it once fixed). Global ones apply to every client.
      </p>
      <div className="space-y-2 rounded-lg border border-edge p-3">
        <textarea className="input h-20 w-full text-sm" placeholder="GTM memory: decision-maker is VP Growth, CEO ignores cold. — or — Audit: Zenvyk spam-flagged + 0 positives, test a softer non-salesy opener next."
          value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-auto text-xs" value={kind} onChange={(e) => setKind(e.target.value)}>
            {GL_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
            global (all clients)
          </label>
          <button className="btn px-3 py-1.5 text-xs" onClick={save} disabled={busy || !text.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {([["all", "All"], ["copy", "Copy"], ["gtm", "GTM memory"], ["audit", "Audit / test log"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setLane(v)} className={`badge ${lane === v ? "badge-amber" : ""}`}>{l}</button>
        ))}
        <span className="text-muted">· {shown.length} shown</span>
      </div>
      <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
        {shown.map((g: any) => (
          <div key={g.id} className="rounded-lg border border-edge p-2 text-xs">
            <div className="mb-1 flex items-center gap-2 text-muted">
              <span className={g.client_slug ? "badge" : "badge badge-amber"}>{g.client_slug || "global"}</span>
              <span className="badge">{g.kind}</span>
              <span>{String(g.created_at).slice(0, 10)}</span>
              {g.source && <span>· {g.source}</span>}
              <button className="ml-auto text-rose-500 hover:underline" onClick={() => remove(g.id)}>
                {g.kind === "audit" ? "resolve" : "remove"}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-slate-700">{g.guideline_text}</p>
            {g.context && <p className="mt-1 text-muted">context: {g.context}</p>}
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted">Nothing in this lane yet. Saved from a Claude session or added right here.</p>}
      </div>
    </div>
  );
}

/* ---------- Materials: proposals, audits, scraped web info — client context docs ---------- */
function MaterialsTab({ slug }: { slug: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [mtype, setMtype] = useState("proposal");
  const [ctx, setCtx] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () =>
    fetch(`/api/materials?client=${slug}`).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setRows(d.materials))).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [slug]);
  const save = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/materials", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_slug: slug, title: title.trim(), material_type: mtype, context: ctx.trim() || null, content }),
    }).then((x) => x.json());
    setBusy(false);
    setMsg(r.ok ? "Saved and embedded." : r.output || r.error || "failed");
    if (r.ok) { setTitle(""); setCtx(""); setContent(""); load(); }
  };
  const remove = async (id: number) => {
    await fetch(`/api/materials?id=${id}`, { method: "DELETE" });
    load();
  };
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!rows) return <p className="text-sm text-muted">Loading materials…</p>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Client context documents: proposals, audits, scraped website info, brochures, pricing.
        The context line tells the AI what the document IS ("the audit deck sent after discovery
        calls") — it travels with every searchable chunk. Re-uploading the same title replaces it.
      </p>
      <div className="space-y-2 rounded-lg border border-edge p-3">
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 text-sm" placeholder="Title (e.g. Outbound audit deck)"
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input w-auto text-xs" value={mtype} onChange={(e) => setMtype(e.target.value)}>
            {["proposal", "positioning", "voice", "audit", "web_scrape", "brochure", "pricing", "other"].map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <input className="input w-full text-sm" placeholder="Context: what is this and how is it used?"
          value={ctx} onChange={(e) => setCtx(e.target.value)} />
        <textarea className="input h-32 w-full text-sm" placeholder="Paste the full document text here…"
          value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="flex items-center gap-3">
          <button className="btn px-3 py-1.5 text-xs" onClick={save} disabled={busy || !title.trim() || !content.trim()}>
            {busy ? "Ingesting…" : "Ingest material"}
          </button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((m) => (
          <details key={m.id} className="rounded-lg border border-edge p-2 text-xs">
            <summary className="cursor-pointer select-none">
              <b className="text-slate-700">{m.title}</b>{" "}
              <span className="badge">{m.material_type}</span>{" "}
              <span className="text-muted">{Number(m.content_chars).toLocaleString()} chars · {m.chunks} chunks · {String(m.created_at).slice(0, 10)}</span>
            </summary>
            <div className="mt-2 space-y-1 border-t border-edge pt-2">
              {m.context && <p><span className="text-muted">Context:</span> {m.context}</p>}
              <p className="whitespace-pre-wrap text-slate-700">{m.preview}{Number(m.content_chars) > 400 ? "…" : ""}</p>
              <button className="text-rose-500 hover:underline" onClick={() => remove(m.id)}>delete</button>
            </div>
          </details>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No materials yet. Paste the first proposal, audit, or scraped site above.</p>}
      </div>
    </div>
  );
}

/* ---------- Deals: exactly what the AI receives from /deals, browsable ---------- */
function DealsTab({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState("all");
  const [variant, setVariant] = useState("all");
  const [channel, setChannel] = useState("all");
  const [qtext, setQ] = useState("");
  useEffect(() => {
    fetch(`/api/clients/${slug}/deals?limit=500`).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(e.message));
  }, [slug]);
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!data) return <p className="text-sm text-muted">Loading deals from Airtable… (this is the same call the AI makes)</p>;

  const stages = Object.keys(data.by_stage || {}).sort();
  const variants = Object.keys(data.by_variant || {}).sort();
  const channels = Object.keys(data.by_channel || {}).sort();
  const shown = (data.deals || []).filter((d: any) =>
    (stage === "all" || (d.stage || "(none)") === stage) &&
    (variant === "all" || (d.copy_variant || "(none)") === variant) &&
    (channel === "all" || (d.channel || "(none)") === channel) &&
    (!qtext || JSON.stringify(d).toLowerCase().includes(qtext.toLowerCase()))
  );

  const stageBadge = (s: string | null) => {
    const t = String(s || "").toLowerCase();
    if (/won|closed|meeting|booked/.test(t)) return "badge badge-green";
    if (/lost|dead|no show/.test(t)) return "badge badge-red";
    return "badge badge-amber";
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Live from Airtable via <code>/api/clients/{slug}/deals</code> — this is exactly the data the AI sees
        when writing copy: {data.count} deals with stage, variant, campaign, contact, and the full conversation.
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(data.by_stage || {}).map(([k, n]: any) => (
          <span key={k} className={stageBadge(k)}>{k} · {n}</span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto text-xs" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="all">All stages</option>{stages.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input w-auto text-xs" value={variant} onChange={(e) => setVariant(e.target.value)}>
          <option value="all">All variants</option>{variants.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select className="input w-auto text-xs" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">All channels</option>{channels.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="input flex-1 text-xs" placeholder="Search company, title, campaign, conversation…"
          value={qtext} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-muted">{shown.length} shown</span>
      </div>
      <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
        {shown.map((d: any) => (
          <details key={d.airtable_deal_id} className="rounded-lg border border-edge p-2 text-xs">
            <summary className="cursor-pointer select-none">
              <b className="text-slate-700">{d.company || d.opportunity || "?"}</b>
              {d.job_title && <span className="text-muted"> · {d.job_title}</span>}
              {" "}<span className={stageBadge(d.stage)}>{d.stage || "no stage"}</span>
              {d.copy_variant && <span className="badge ml-1">var {d.copy_variant}</span>}
              {d.channel && <span className="badge ml-1">{d.channel}</span>}
              {d.campaign_name && <span className="text-muted"> · {String(d.campaign_name).slice(0, 60)}</span>}
            </summary>
            <div className="mt-2 space-y-1.5 border-t border-edge pt-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3">
                {[
                  ["Contact", d.contact], ["Email", d.email], ["Phone", d.phone],
                  ["Location", d.location], ["Timezone", d.timezone], ["Website", d.website],
                  ["LinkedIn", d.linkedin], ["Created", d.created_at],
                  ["Reply category", d.positive_reply_category], ["Lost reason", d.lost_reason],
                  ["Meeting booked", d.meeting_booked_at], ["Closed amount", d.closed_amount],
                  ["DB campaign id", d.db_campaign_id], ["Next step (no)", d.next_step_no],
                ].filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                  <div key={k as string}><span className="text-muted">{k}:</span> <span className="text-slate-700">{String(v)}</span></div>
                ))}
              </div>
              {d.conversation && (
                <div>
                  <div className="mb-1 font-medium text-slate-700">Conversation (what the AI reads)</div>
                  <p className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-700">{d.conversation}</p>
                </div>
              )}
              {(d.notes || d.overall_feedback || d.not_closed_reason) && (
                <div className="space-y-1">
                  {d.notes && <p><span className="text-muted">Notes:</span> {String(d.notes)}</p>}
                  {d.overall_feedback && <p><span className="text-muted">Feedback:</span> {String(d.overall_feedback)}</p>}
                  {d.not_closed_reason && <p><span className="text-muted">Not closed reason:</span> {String(d.not_closed_reason)}</p>}
                </div>
              )}
            </div>
          </details>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted">No deals match.</p>}
      </div>
    </div>
  );
}

function RepliesTab({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/clients/${slug}/replies?weeks=8`).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d))).catch((e) => setErr(e.message));
  }, [slug]);
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!data) return <p className="text-sm text-muted">Loading reply analytics…</p>;
  const max = Math.max(1, ...data.by_category_all_time.map((c: any) => c.n));
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-medium">Why people reply (all time)</h3>
        {data.by_category_all_time.map((c: any) => (
          <div key={c.category} className="mb-1 flex items-center gap-2 text-xs">
            <span className="w-40 truncate text-muted">{c.category}</span>
            <div className="bar flex-1"><span style={{ width: `${(c.n / max) * 100}%` }} /></div>
            <span className="w-8 text-right tabular-nums">{c.n}</span>
          </div>
        ))}
      </div>
      {data.lost_reasons.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Lost reasons</h3>
          <div className="flex flex-wrap gap-2">{data.lost_reasons.map((l: any) => <span key={l.lost_reason} className="badge badge-red">{l.lost_reason} · {l.n}</span>)}</div>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-medium">Recent "no" threads (why they pass)</h3>
        <div className="max-h-[300px] space-y-2 overflow-auto pr-1">
          {data.no_examples.map((x: any, i: number) => (
            <div key={i} className="rounded-lg border border-edge p-2 text-xs">
              <div className="mb-1 text-muted">
                <b className="text-slate-700">{x.company || "?"}</b> · {x.job_title || "?"} ·{" "}
                <span className="badge badge-amber">{x.positive_reply_category || x.lost_reason}</span>
                {x.variant && <> · var {x.variant}</>} · {x.created}
              </div>
              <p className="whitespace-pre-wrap text-slate-700">{x.conversation_snippet || "(no thread)"}</p>
            </div>
          ))}
          {data.no_examples.length === 0 && <p className="text-muted">None recorded.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Cases / Calls / Niche ---------- */
function CasesTab({ cases }: { cases: Case[] }) {
  return (
    <ul className="max-h-[480px] space-y-2 overflow-auto pr-1">
      {cases.map((c, i) => (
        <li key={i} className="text-sm">
          <span className="chip mr-2">{c.tier}</span><b>{c.subject_brand}</b> — {c.after_state}
          {c.unique_mechanism && <span className="text-muted"> · {c.unique_mechanism}</span>}
        </li>
      ))}
      {cases.length === 0 && <li className="text-sm text-muted">None yet.</li>}
    </ul>
  );
}
function CallsTab({ calls }: { calls: Call[] }) {
  return (
    <ul className="max-h-[480px] space-y-1 overflow-auto pr-1 text-sm">
      {calls.map((c, i) => (
        <li key={i} className="flex justify-between">
          <span>{c.title || c.source_call_id} <span className="text-muted">({c.source})</span></span>
          <span className="text-muted">{c.chunks} chunks</span>
        </li>
      ))}
      {calls.length === 0 && <li className="text-muted">None yet.</li>}
    </ul>
  );
}
function NicheTab({ n }: { n: Niche }) {
  if (!n) return <p className="text-sm text-muted">Not built yet — run “Synthesize niche”.</p>;
  const lingo: string[] = Array.isArray(n.shared_lingo) ? n.shared_lingo : (() => { try { return JSON.parse(n.shared_lingo); } catch { return []; } })();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-800">{n.commonalities_summary}</p>
      <div className="flex flex-wrap gap-2">{lingo.slice(0, 16).map((x, i) => <span key={i} className="chip">{x}</span>)}</div>
      <p className="text-xs text-muted">refreshed {new Date(n.refreshed_at).toLocaleDateString()}</p>
    </div>
  );
}
