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
  pain:     { r: 7,  fill: "#27374d", ring: "#fb923c", text: 9 },
  angle:    { r: 13, fill: "#134e4a", ring: "#2dd4bf", text: 10 },
  campaign: { r: 7,  fill: "#27374d", ring: "#2dd4bf", text: 9 },
  case:     { r: 10, fill: "#3f2d12", ring: "#fbbf24", text: 10 },
  copy:     { r: 9,  fill: "#312e81", ring: "#818cf8", text: 10 },
  call:     { r: 7,  fill: "#1e293b", ring: "#64748b", text: 9 },
  kbpain:   { r: 7,  fill: "#3b0764", ring: "#c084fc", text: 9 },
  kblingo:  { r: 6,  fill: "#3b0764", ring: "#e9d5ff", text: 9 },
};

export default function GraphView() {
  const router = useRouter();
  const [g, setG] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"network" | "clusters">("network");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetch("/api/graph", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setG(d);
        // default: expand niches + clients (so hubs are visible, leaves collapsed)
        const init = new Set<string>(d.nodes.filter((n: Node) => n.type === "niche" || n.type === "client").map((n: Node) => n.id));
        setExpanded(init);
      })
      .catch((e) => setError(e.message));
  }, []);

  const childrenOf = useMemo(() => {
    const m: Record<string, number> = {};
    g?.nodes.forEach((n) => { if (n.parent) m[n.parent] = (m[n.parent] || 0) + 1; });
    return m;
  }, [g]);

  if (error) return <div className="card border-rose-500/40 text-sm text-rose-300">Graph error: {error}</div>;
  if (!g) return <div className="card text-sm text-muted">Building graph…</div>;

  const visible = computeVisible(g.nodes, expanded);
  const visibleIds = new Set(visible.map((n) => n.id));
  const visibleEdges = g.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

  function toggle(id: string) {
    if (!childrenOf[id]) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const expandAll = () => setExpanded(new Set(g!.nodes.filter((n) => childrenOf[n.id]).map((n) => n.id)));
  const collapseAll = () => setExpanded(new Set(g!.nodes.filter((n) => n.type === "niche" || n.type === "client").map((n) => n.id)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex overflow-hidden rounded-lg border border-edge">
          <button onClick={() => setView("network")} className={`px-3 py-1 text-xs ${view === "network" ? "bg-accent text-white" : "text-muted"}`}>Network</button>
          <button onClick={() => setView("clusters")} className={`px-3 py-1 text-xs ${view === "clusters" ? "bg-accent text-white" : "text-muted"}`}>Niche clusters</button>
        </span>
        <Legend />
        {view === "network" && (
          <span className="ml-auto flex items-center gap-1">
            <button className="btn-ghost px-2 py-1" onClick={expandAll}>expand all</button>
            <button className="btn-ghost px-2 py-1" onClick={collapseAll}>collapse</button>
            <button className="btn-ghost px-2 py-1" onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}>−</button>
            <button className="btn-ghost px-2 py-1" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>reset</button>
            <button className="btn-ghost px-2 py-1" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>+</button>
          </span>
        )}
      </div>

      {view === "network" ? (
        <div className="text-xs text-muted">Click a node to expand/collapse its children · drag to pan · {visible.length} of {g.nodes.length} nodes shown</div>
      ) : null}

      {view === "network" ? (
        <div className="card overflow-hidden p-0">
          <svg
            viewBox={`0 0 ${W} ${H}`} className="h-[760px] w-full cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => (drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y })}
            onMouseMove={(e) => { if (drag.current) setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }}
            onMouseUp={() => (drag.current = null)}
            onMouseLeave={() => (drag.current = null)}
          >
            <g transform={`translate(${pan.x},${pan.y}) translate(${W / 2},${H / 2}) scale(${zoom}) translate(${-W / 2},${-H / 2})`}>
              <Network nodes={visible} edges={visibleEdges} childrenOf={childrenOf} expanded={expanded}
                onToggle={toggle} onOpenClient={(slug) => router.push(`/clients/${slug}`)} />
            </g>
          </svg>
        </div>
      ) : <Clusters g={g} />}
    </div>
  );
}

function Network({ nodes, edges, childrenOf, expanded, onToggle, onOpenClient }: {
  nodes: Node[]; edges: Edge[]; childrenOf: Record<string, number>;
  expanded: Set<string>; onToggle: (id: string) => void; onOpenClient: (slug: string) => void;
}) {
  const pos = useForceLayout(nodes, edges);
  const at = (id: string) => pos[id];

  return (
    <>
      {edges.map((e, i) => {
        const a = at(e.source), b = at(e.target); if (!a || !b) return null;
        const related = e.kind.startsWith("related");
        const cross = e.kind === "for-campaign";
        return (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={related ? "#5b8cff" : cross ? "#818cf8" : "#22304d"}
            strokeWidth={related ? 2 : 1}
            strokeDasharray={related || cross ? "4 4" : undefined} opacity={cross ? 0.8 : 1} />
        );
      })}
      {nodes.map((n) => {
        const p = at(n.id); if (!p) return null;
        const s = STYLE[n.type] || STYLE.pain;
        const kids = childrenOf[n.id] || 0;
        const isOpen = expanded.has(n.id);
        const small = s.r <= 9;
        const label = (n.value != null && n.type !== "pain" && n.type !== "campaign") ? `${n.label} ${n.value}` : n.label;
        const clip = label.length > 26 ? label.slice(0, 25) + "…" : label;
        return (
          <g key={n.id} style={{ cursor: kids ? "pointer" : n.type === "client" ? "pointer" : "default" }}
            onClick={(ev) => { ev.stopPropagation(); if (n.type === "client") onOpenClient(n.id.split(":")[1]); else onToggle(n.id); }}>
            <circle cx={p.x} cy={p.y} r={s.r} fill={s.fill} stroke={s.ring} strokeWidth={1.5} />
            {kids > 0 && (
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={s.r > 14 ? 12 : 9} fill="#cdd9ef" fontWeight={700}>
                {isOpen ? "−" : "+"}
              </text>
            )}
            {(!small || !kids) && (
              <text x={p.x} y={p.y + s.r + 11} textAnchor="middle" fontSize={s.text}
                fill={small ? "#7e93b8" : "#e2e8f0"} fontWeight={["client", "niche", "hub"].includes(n.type) ? 600 : 400}>
                {clip}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function computeVisible(nodes: Node[], expanded: Set<string>): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isVisible = (n: Node): boolean => {
    if (!n.parent) return true;
    const parent = byId.get(n.parent);
    if (!parent) return true;
    return expanded.has(parent.id) && isVisible(parent);
  };
  return nodes.filter(isVisible);
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
                    <div className="mt-1 flex flex-wrap gap-1">
                      {hubs.map((h) => <span key={h.id} className="chip">{h.label} {h.value}</span>)}
                    </div>
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

function Legend() {
  const items = [["niche", "Niche"], ["kb", "Niche brain"], ["client", "Client"], ["hub", "Category"], ["painkind", "Pain kind"], ["angle", "Vertical"]];
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

// force layout over the currently-visible nodes; re-runs when they change
function useForceLayout(nodes: Node[], edges: Edge[]) {
  return useMemo(() => {
    const N = nodes.map((n, i) => ({
      id: n.id, type: n.type, pin: n.type === "niche",
      x: W / 2 + Math.cos(i * 1.7) * (120 + i * 4),
      y: H / 2 + Math.sin(i * 1.7) * (120 + i * 4),
      vx: 0, vy: 0,
    }));
    const idx: Record<string, number> = {}; N.forEach((n, i) => (idx[n.id] = i));
    const L = edges.map((e) => ({ s: idx[e.source], t: idx[e.target] })).filter((l) => l.s != null && l.t != null);

    const niches = N.filter((n) => n.pin);
    niches.forEach((n, i) => { n.x = W * 0.22; n.y = (H / (niches.length + 1)) * (i + 1); });

    const iters = Math.min(360, 160 + nodes.length);
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < N.length; i++) {
        for (let j = i + 1; j < N.length; j++) {
          let dx = N[i].x - N[j].x, dy = N[i].y - N[j].y;
          let d2 = dx * dx + dy * dy || 0.01;
          const f = 2200 / d2, d = Math.sqrt(d2), ux = dx / d, uy = dy / d;
          N[i].vx += ux * f; N[i].vy += uy * f; N[j].vx -= ux * f; N[j].vy -= uy * f;
        }
      }
      for (const l of L) {
        const a = N[l.s], b = N[l.t];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 78) * 0.025, ux = dx / d, uy = dy / d;
        a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f;
      }
      for (const n of N) {
        if (n.pin) { n.vx = 0; n.vy = 0; continue; }
        n.x += n.vx * 0.85; n.y += n.vy * 0.85; n.vx *= 0.8; n.vy *= 0.8;
        n.x = Math.max(30, Math.min(W - 30, n.x)); n.y = Math.max(24, Math.min(H - 24, n.y));
      }
    }
    const out: Record<string, { x: number; y: number }> = {};
    N.forEach((n) => (out[n.id] = { x: n.x, y: n.y }));
    return out;
  }, [nodes, edges]);
}
