"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Node = { id: string; type: string; label: string; value?: number; parent?: string; niche?: string; meta?: any };
type Edge = { source: string; target: string; kind: string };
type Graph = { nodes: Node[]; edges: Edge[]; summary: any };

const W = 1200, H = 760;

const STYLE: Record<string, { r: number; fill: string; ring: string; text: number }> = {
  niche:    { r: 30, fill: "#5b8cff", ring: "#9db8ff", text: 13 },
  kb:       { r: 22, fill: "#a855f7", ring: "#d8b4fe", text: 12 },
  client:   { r: 26, fill: "#10b981", ring: "#6ee7b7", text: 13 },
  hub:      { r: 17, fill: "#1f3a5f", ring: "#3b82f6", text: 11 },
  painkind: { r: 13, fill: "#7c2d12", ring: "#fb923c", text: 10 },
  cluster:  { r: 16, fill: "#7c2d12", ring: "#fb923c", text: 11 },
  pain:     { r: 7,  fill: "#27374d", ring: "#fb923c", text: 9 },
  angle:    { r: 13, fill: "#134e4a", ring: "#2dd4bf", text: 10 },
  campaign: { r: 7,  fill: "#27374d", ring: "#2dd4bf", text: 9 },
  case:     { r: 10, fill: "#3f2d12", ring: "#fbbf24", text: 10 },
  offer:    { r: 10, fill: "#14532d", ring: "#4ade80", text: 10 },
  copy:     { r: 9,  fill: "#312e81", ring: "#818cf8", text: 10 },
  call:     { r: 7,  fill: "#1e293b", ring: "#64748b", text: 9 },
  kbpain:   { r: 7,  fill: "#3b0764", ring: "#c084fc", text: 9 },
  kblingo:  { r: 6,  fill: "#3b0764", ring: "#e9d5ff", text: 9 },
  unique:   { r: 12, fill: "#1e293b", ring: "#64748b", text: 10 },
};

export default function GraphView() {
  const [g, setG] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"network" | "clusters" | "niche">("network");

  useEffect(() => {
    fetch("/api/graph", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setG(d)))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="card border-rose-500/40 text-sm text-rose-300">Graph error: {error}</div>;
  if (!g) return <div className="card text-sm text-muted">Building graph…</div>;

  const niches = g.nodes.filter((n) => n.type === "niche").map((n) => n.label);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex overflow-hidden rounded-lg border border-edge">
          {([["network", "Full graph"], ["clusters", "Pain clusters"], ["niche", "Niche cards"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`px-3 py-1 text-xs ${view === k ? "bg-accent text-white" : "text-muted"}`}>{l}</button>
          ))}
        </span>
        <Legend view={view} />
      </div>

      {view === "network" && (
        <InteractiveGraph nodes={g.nodes} edges={g.edges} defaultExpand={["niche", "client"]}
          caption="Click a node to expand/collapse · drag to pan · orange dashed = pain mined from that call" />
      )}
      {view === "clusters" && <ClusterView niches={niches} />}
      {view === "niche" && <Clusters g={g} />}
    </div>
  );
}

/* ------- shared interactive graph: draggable nodes, pan/zoom, hover-highlight ------- */
function InteractiveGraph({ nodes, edges, defaultExpand, caption, onOpenClient }: {
  nodes: Node[]; edges: Edge[]; defaultExpand: string[]; caption?: string;
  onOpenClient?: (slug: string) => void;
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [hover, setHover] = useState<string | null>(null);

  const posRef = useRef(pos); posRef.current = pos;
  const pinned = useRef<Set<string>>(new Set());
  const panDrag = useRef<{ x: number; y: number } | null>(null);
  const nodeDrag = useRef<{ id: string; moved: boolean } | null>(null);

  useEffect(() => {
    setExpanded(new Set(nodes.filter((n) => defaultExpand.includes(n.type)).map((n) => n.id)));
    pinned.current = new Set();
    setPos({});
  }, [nodes, defaultExpand.join(",")]); // eslint-disable-line

  const childrenOf = useMemo(() => {
    const m: Record<string, number> = {};
    nodes.forEach((n) => { if (n.parent) m[n.parent] = (m[n.parent] || 0) + 1; });
    return m;
  }, [nodes]);

  const visible = computeVisible(nodes, expanded);
  const vis = new Set(visible.map((n) => n.id));
  const visEdges = edges.filter((e) => vis.has(e.source) && vis.has(e.target));

  // (re)compute layout when the set of visible nodes changes; keep existing/pinned positions
  const visKey = visible.map((n) => n.id).join("|");
  useEffect(() => {
    setPos((prev) => layoutPositions(visible, visEdges, prev, pinned.current));
  }, [visKey]); // eslint-disable-line

  // convert a screen point to graph (group) coordinates
  function toGraph(clientX: number, clientY: number) {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const s = pt.matrixTransform(ctm.inverse()); // svg user units
    return { x: (s.x - pan.x - W / 2) / zoom + W / 2, y: (s.y - pan.y - H / 2) / zoom + H / 2 };
  }

  const toggle = (id: string) => { if (childrenOf[id]) setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const expandAll = () => setExpanded(new Set(nodes.filter((n) => childrenOf[n.id]).map((n) => n.id)));
  const collapse = () => setExpanded(new Set(nodes.filter((n) => defaultExpand.includes(n.type)).map((n) => n.id)));
  const open = onOpenClient || ((slug: string) => router.push(`/clients/${slug}`));

  function onMouseMove(e: React.MouseEvent) {
    if (nodeDrag.current) {
      const g = toGraph(e.clientX, e.clientY);
      nodeDrag.current.moved = true;
      const id = nodeDrag.current.id;
      pinned.current.add(id);
      setPos((p) => ({ ...p, [id]: g }));
    } else if (panDrag.current) {
      setPan({ x: e.clientX - panDrag.current.x, y: e.clientY - panDrag.current.y });
    }
  }
  function endDrag() {
    if (nodeDrag.current && !nodeDrag.current.moved) {
      const n = nodes.find((x) => x.id === nodeDrag.current!.id);
      if (n) n.type === "client" ? open(n.id.split(":")[1]) : toggle(n.id);
    }
    nodeDrag.current = null; panDrag.current = null;
  }

  // highlight set: hovered node + its direct neighbors
  const neighbors = new Set<string>();
  if (hover) {
    neighbors.add(hover);
    visEdges.forEach((e) => { if (e.source === hover) neighbors.add(e.target); if (e.target === hover) neighbors.add(e.source); });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="text-xs text-muted">{caption} · drag nodes to arrange · hover to trace links · {visible.length}/{nodes.length} shown</div>
        <span className="ml-auto flex items-center gap-1">
          <button className="btn-ghost px-2 py-1" onClick={expandAll}>expand all</button>
          <button className="btn-ghost px-2 py-1" onClick={collapse}>collapse</button>
          <button className="btn-ghost px-2 py-1" onClick={() => { pinned.current = new Set(); setPos((p) => layoutPositions(visible, visEdges, {}, pinned.current)); }}>re-layout</button>
          <button className="btn-ghost px-2 py-1" onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}>−</button>
          <button className="btn-ghost px-2 py-1" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>reset</button>
          <button className="btn-ghost px-2 py-1" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>+</button>
        </span>
      </div>
      <div className="card overflow-hidden p-0">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-[760px] w-full"
          style={{ cursor: panDrag.current ? "grabbing" : "default" }}
          onMouseDown={(e) => (panDrag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y })}
          onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
          <g transform={`translate(${pan.x},${pan.y}) translate(${W / 2},${H / 2}) scale(${zoom}) translate(${-W / 2},${-H / 2})`}>
            {visEdges.map((e, i) => {
              const a = pos[e.source], b = pos[e.target]; if (!a || !b) return null;
              const related = e.kind.startsWith("related");
              const sameOffer = e.kind.startsWith("same-offer");
              const cross = e.kind === "for-campaign";
              const mined = e.kind === "mined-from";
              const coClient = e.kind === "co-client";
              const lit = hover ? (e.source === hover || e.target === hover) : false;
              const dim = hover && !lit;
              const color = lit ? "#fbbf24" : sameOffer ? "#4ade80" : coClient ? "#34d399" : related ? "#5b8cff" : cross ? "#818cf8" : mined ? "#fb923c" : "#22304d";
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color}
                  strokeWidth={lit ? 2.5 : coClient ? 2.5 : sameOffer ? 1.8 : related ? 2 : mined ? 1.4 : 1}
                  strokeDasharray={!lit && (related || cross || mined || coClient || sameOffer) ? "6 4" : undefined}
                  opacity={dim ? 0.06 : mined ? 0.7 : sameOffer ? 0.75 : coClient ? 0.85 : 1} />
              );
            })}
            {visible.map((n) => {
              const p = pos[n.id]; if (!p) return null;
              const s = STYLE[n.type] || STYLE.pain;
              const kids = childrenOf[n.id] || 0;
              const small = s.r <= 9;
              const dim = hover ? !neighbors.has(n.id) : false;
              const label = (n.value != null && !["pain", "campaign"].includes(n.type)) ? `${n.label} ${n.value}` : n.label;
              const clip = label.length > 30 ? label.slice(0, 29) + "…" : label;
              const showLabel = (!small || !kids || hover === n.id || neighbors.has(n.id));
              return (
                <g key={n.id} opacity={dim ? 0.18 : 1} style={{ cursor: "grab" }}
                  onMouseDown={(ev) => { ev.stopPropagation(); nodeDrag.current = { id: n.id, moved: false }; }}
                  onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                  <circle cx={p.x} cy={p.y} r={s.r} fill={s.fill} stroke={hover === n.id ? "#fbbf24" : s.ring} strokeWidth={hover === n.id ? 3 : 1.5} />
                  {kids > 0 && <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={s.r > 14 ? 12 : 9} fill="#cdd9ef" fontWeight={700}>{expanded.has(n.id) ? "−" : "+"}</text>}
                  {showLabel && (
                    <text x={p.x} y={p.y + s.r + 11} textAnchor="middle" fontSize={s.text}
                      fill={small ? "#7e93b8" : "#e2e8f0"} fontWeight={["client", "niche", "hub", "cluster"].includes(n.type) ? 600 : 400}>{clip}</text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </>
  );
}

/* ------- Pain clusters view ------- */
function ClusterView({ niches }: { niches: string[] }) {
  const [niche, setNiche] = useState(niches[0] || "");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(n: string) {
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch("/api/clusters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ niche: n }) });
      const d = await res.json();
      res.ok ? setData(d) : setError(d.error || "failed");
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { if (niche) load(niche); }, [niche]); // eslint-disable-line

  const graph = useMemo(() => {
    if (!data) return null;
    const nodes: Node[] = [{ id: "scope", type: "niche", label: niche, niche }];
    const edges: Edge[] = [];
    (data.clusters || []).filter((c: any) => c.size > 1).forEach((c: any, i: number) => {
      const cid = `cl:${i}`;
      nodes.push({ id: cid, type: "cluster", label: c.representative, value: c.size, parent: "scope", niche });
      edges.push({ source: "scope", target: cid, kind: "cluster" });
      (c.members || []).forEach((m: any, j: number) => {
        const mid = `clm:${i}:${j}`;
        nodes.push({ id: mid, type: "pain", label: `${m.text}  ·  ${m.client}`, parent: cid, niche });
        edges.push({ source: cid, target: mid, kind: "member" });
      });
    });
    if (data.singletons) nodes.push({ id: "uniq", type: "unique", label: "unique pains", value: data.singletons, parent: "scope", niche }), edges.push({ source: "scope", target: "uniq", kind: "u" });
    return { nodes, edges, summary: {} } as Graph;
  }, [data, niche]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input max-w-[220px]" value={niche} onChange={(e) => setNiche(e.target.value)}>
          {niches.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {data && (
          <span className="text-sm text-muted">
            <b className="text-slate-200">{data.total_pains}</b> pains →{" "}
            <b className="text-slate-200">{data.clusters_total}</b> clusters{" "}
            (<b className="text-amber-300">{data.multi_member_clusters}</b> grouped, {data.singletons} unique) · threshold {data.threshold}
          </span>
        )}
      </div>
      {loading && <div className="card text-sm text-muted">Clustering pain embeddings…</div>}
      {error && <div className="card border-rose-500/40 text-sm text-rose-300">{error}</div>}
      {graph && <InteractiveGraph nodes={graph.nodes} edges={graph.edges} defaultExpand={["niche"]}
        caption="Each orange node = a group of near-duplicate pains. Click to see the members." />}
    </div>
  );
}

function computeVisible(nodes: Node[], expanded: Set<string>): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const vis = (n: Node): boolean => {
    if (!n.parent) return true;
    const p = byId.get(n.parent);
    if (!p) return true;
    return expanded.has(p.id) && vis(p);
  };
  return nodes.filter(vis);
}

function Clusters({ g }: { g: Graph }) {
  const niches = g.nodes.filter((n) => n.type === "niche");
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {niches.map((nz) => {
        const clients = g.nodes.filter((n) => n.type === "client" && n.niche === nz.label);
        const hasKb = g.nodes.some((n) => n.type === "kb" && n.niche === nz.label);
        return (
          <div key={nz.id} className="card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-accent">{nz.label}</h3>
              {hasKb ? <span className="badge badge-blue">niche brain ✓</span> : <span className="chip">no summary</span>}
            </div>
            <div className="space-y-2">
              {clients.map((c) => {
                const slug = c.id.split(":")[1];
                const hubs = g.nodes.filter((m) => m.type === "hub" && m.parent === `client:${slug}`);
                return (
                  <a key={c.id} href={`/clients/${slug}`} className="block rounded-lg border border-edge p-2 hover:border-accent">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="mt-1 flex flex-wrap gap-1">{hubs.map((h) => <span key={h.id} className="chip">{h.label} {h.value}</span>)}</div>
                  </a>
                );
              })}
            </div>
            {clients.length > 1 && <p className="mt-3 text-xs text-accent">↔ {clients.length} clients share this niche</p>}
          </div>
        );
      })}
    </div>
  );
}

function Legend({ view }: { view: string }) {
  const items = view === "clusters"
    ? [["cluster", "Pain group"], ["pain", "Pain"], ["unique", "Unique pains"]]
    : [["niche", "Niche"], ["kb", "Niche brain"], ["client", "Client"], ["hub", "Category"], ["painkind", "Pain kind"], ["angle", "Vertical"]];
  return (
    <span className="flex flex-wrap gap-3 text-xs text-muted">
      {items.map(([t, l]) => (
        <span key={t} className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: STYLE[t].fill, outline: `1px solid ${STYLE[t].ring}` }} />{l}
        </span>
      ))}
    </span>
  );
}

/* Force layout that PRESERVES positions the user has set: nodes already in `prev`
   keep their coords as the starting point, niche + pinned (dragged) nodes are fixed
   anchors, and only genuinely-new nodes are seeded near their parent and relaxed. */
function layoutPositions(
  nodes: Node[], edges: Edge[],
  prev: Record<string, { x: number; y: number }>,
  pinnedSet: Set<string>
) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const N = nodes.map((n, i) => {
    const fixed = n.type === "niche" || pinnedSet.has(n.id);
    let x: number, y: number;
    if (prev[n.id]) { x = prev[n.id].x; y = prev[n.id].y; }
    else if (n.parent && prev[n.parent]) { x = prev[n.parent].x + Math.cos(i) * 60; y = prev[n.parent].y + Math.sin(i) * 60; }
    else { x = W / 2 + Math.cos(i * 1.7) * (120 + i * 4); y = H / 2 + Math.sin(i * 1.7) * (120 + i * 4); }
    return { id: n.id, fixed, isNew: !prev[n.id], x, y, vx: 0, vy: 0 };
  });
  const idx: Record<string, number> = {}; N.forEach((n, i) => (idx[n.id] = i));
  const L = edges.map((e) => ({ s: idx[e.source], t: idx[e.target] })).filter((l) => l.s != null && l.t != null);

  // pin niche nodes into a left spine only if they don't already have a position
  const niches = N.filter((n) => byId.get(n.id)?.type === "niche");
  niches.forEach((n, i) => { if (!prev[n.id]) { n.x = W * 0.22; n.y = (H / (niches.length + 1)) * (i + 1); } });

  const anyNew = N.some((n) => n.isNew);
  const iters = anyNew ? Math.min(300, 120 + nodes.length) : 0; // don't reshuffle a settled graph
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < N.length; i++)
      for (let j = i + 1; j < N.length; j++) {
        let dx = N[i].x - N[j].x, dy = N[i].y - N[j].y; let d2 = dx * dx + dy * dy || 0.01;
        const f = 2200 / d2, d = Math.sqrt(d2), ux = dx / d, uy = dy / d;
        N[i].vx += ux * f; N[i].vy += uy * f; N[j].vx -= ux * f; N[j].vy -= uy * f;
      }
    for (const l of L) {
      const a = N[l.s], b = N[l.t]; let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01; const f = (d - 80) * 0.03, ux = dx / d, uy = dy / d;
      a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f;
    }
    for (const n of N) {
      if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
      n.x += n.vx * 0.85; n.y += n.vy * 0.85; n.vx *= 0.8; n.vy *= 0.8;
      n.x = Math.max(30, Math.min(W - 30, n.x)); n.y = Math.max(24, Math.min(H - 24, n.y));
    }
  }
  const out: Record<string, { x: number; y: number }> = {};
  N.forEach((n) => (out[n.id] = { x: n.x, y: n.y }));
  return out;
}
