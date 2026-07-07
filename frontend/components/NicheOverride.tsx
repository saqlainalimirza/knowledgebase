"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Niche = { id: number; name: string; subs: { id: number; name: string }[] };

export default function NicheOverride({
  slug, current, currentSub, source,
}: { slug: string; current: string | null; currentSub: string | null; source: string | null }) {
  const router = useRouter();
  const [niches, setNiches] = useState<Niche[]>([]);
  const [open, setOpen] = useState(false);
  const [nicheId, setNicheId] = useState<string>("");
  const [subId, setSubId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/niches").then((r) => r.json()).then((d) => Array.isArray(d) && setNiches(d));
  }, []);

  const subs = niches.find((n) => String(n.id) === nicheId)?.subs || [];

  async function save() {
    setSaving(true);
    await fetch(`/api/clients/${slug}/niche`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nicheId: Number(nicheId), subNicheId: subId ? Number(subId) : null }),
    });
    setSaving(false); setOpen(false);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="chip">
        {current || "no niche"}{currentSub ? ` · ${currentSub}` : ""}
        {source === "human" ? " ✎" : ""}
      </span>
      {!open ? (
        <button className="text-xs text-muted hover:text-accent" onClick={() => setOpen(true)}>override</button>
      ) : (
        <span className="inline-flex items-center gap-1">
          <select className="input max-w-[170px] py-1 text-xs" value={nicheId} onChange={(e) => { setNicheId(e.target.value); setSubId(""); }}>
            <option value="">niche…</option>
            {niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <select className="input max-w-[160px] py-1 text-xs" value={subId} onChange={(e) => setSubId(e.target.value)} disabled={!subs.length}>
            <option value="">sub…</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn px-2 py-1 text-xs" disabled={!nicheId || saving} onClick={save}>{saving ? "…" : "save"}</button>
          <button className="text-xs text-muted" onClick={() => setOpen(false)}>✕</button>
        </span>
      )}
    </span>
  );
}
