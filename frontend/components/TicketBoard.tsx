"use client";

import { useCallback, useEffect, useState } from "react";

type Ticket = {
  id: number; slack_ts: string; reporter: string | null; permalink: string | null;
  text: string; status: string; assignee: string; day: string;
  created_at: string; updated_at: string; resolved_at: string | null;
};
type Data = {
  view: string; day: string; counts: { unchecked: number; in_progress: number; complete: number };
  page: number; pageSize: number; total: number; tickets: Ticket[];
};

const COLUMNS = [
  { key: "unchecked", label: "Unchecked", tone: "border-slate-300" },
  { key: "in_progress", label: "In Progress", tone: "border-amber-300" },
  { key: "complete", label: "Complete", tone: "border-emerald-300" },
];
const PAGE_SIZE = 30;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function shiftDay(day: string, delta: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function TicketBoard() {
  const [view, setView] = useState<"day" | "all">("day");
  const [day, setDay] = useState(todayStr());
  const [page, setPage] = useState(1);
  const [assignee, setAssignee] = useState("");
  const [qtext, setQtext] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (view === "all") { p.set("view", "all"); p.set("page", String(page)); p.set("pageSize", String(PAGE_SIZE)); }
    else p.set("day", day);
    if (assignee) p.set("assignee", assignee);
    if (qtext) p.set("qtext", qtext);
    const d = await fetch(`/api/tickets?${p}`).then((r) => r.json());
    if (!d.error) setData(d);
  }, [view, day, page, assignee, qtext]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/tickets/assignees").then((r) => r.json()).then((d) => setAssignees(d.assignees || []));
  }, []);

  const update = async (id: number, patch: Partial<Ticket>) => {
    await fetch("/api/tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    load();
  };
  const remove = async (id: number) => {
    if (!confirm("Delete this ticket?")) return;
    await fetch(`/api/tickets?id=${id}`, { method: "DELETE" });
    load();
  };
  const syncNow = async () => {
    setBusy(true); setMsg("Pulling from Slack…");
    const r = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) }).then((x) => x.json());
    setBusy(false); setMsg(r.ok ? "Synced." : (r.output || r.error || "sync failed"));
    load();
  };
  const addAssignee = async () => {
    const name = prompt("New assignee name?")?.trim();
    if (!name) return;
    await fetch("/api/tickets/assignees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setAssignees((a) => Array.from(new Set([...a, name])).sort());
  };

  const c = data?.counts || { unchecked: 0, in_progress: 0, complete: 0 };
  const byCol = (key: string) => (data?.tickets || []).filter((t) => t.status === key);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-edge p-0.5">
          <button className={view === "day" ? "btn px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs"} onClick={() => { setView("day"); setPage(1); }}>Daily</button>
          <button className={view === "all" ? "btn px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs"} onClick={() => { setView("all"); setPage(1); }}>All-time</button>
        </div>
        {view === "day" && (
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDay(shiftDay(day, -1))}>←</button>
            <input type="date" className="input w-auto text-xs" value={day} onChange={(e) => setDay(e.target.value)} />
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= todayStr()}>→</button>
            {day !== todayStr() && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDay(todayStr())}>Today</button>}
          </div>
        )}
        <select className="input w-auto text-xs" value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1); }}>
          <option value="">All assignees</option>
          {assignees.map((a) => <option key={a}>{a}</option>)}
        </select>
        <input className="input w-44 text-xs" placeholder="Search text…" value={qtext} onChange={(e) => { setQtext(e.target.value); setPage(1); }} />
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-xs text-muted">{msg}</span>}
          <button className="btn px-3 py-1.5 text-xs" onClick={syncNow} disabled={busy}>{busy ? "Syncing…" : "Sync bugs now"}</button>
        </div>
      </div>

      {/* counts */}
      <div className="flex gap-2 text-xs">
        <span className="badge">Unchecked {c.unchecked}</span>
        <span className="badge badge-amber">In Progress {c.in_progress}</span>
        <span className="badge badge-green">Complete {c.complete}</span>
      </div>

      {/* board */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className={`rounded-xl border-t-4 ${col.tone} bg-panel p-2`}>
            <div className="mb-2 px-1 text-xs font-semibold text-muted">{col.label} ({byCol(col.key).length})</div>
            <div className="space-y-2">
              {byCol(col.key).map((t) => (
                <div key={t.id} className="rounded-lg border border-edge bg-white p-2.5 text-xs shadow-card">
                  <p className="whitespace-pre-wrap text-slate-700">{t.text.length > 400 ? t.text.slice(0, 400) + "…" : t.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    {t.reporter && <span>by {t.reporter}</span>}
                    <span>· {String(t.day)}</span>
                    {t.permalink && <a className="text-accent hover:underline" href={t.permalink} target="_blank" rel="noreferrer">Slack ↗</a>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <select className="input w-auto py-0.5 text-[11px]" value={t.assignee} onChange={(e) => update(t.id, { assignee: e.target.value })}>
                      {assignees.map((a) => <option key={a}>{a}</option>)}
                      {!assignees.includes(t.assignee) && <option>{t.assignee}</option>}
                    </select>
                    {COLUMNS.filter((x) => x.key !== t.status).map((x) => (
                      <button key={x.key} className="btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => update(t.id, { status: x.key })}>→ {x.label}</button>
                    ))}
                    <button className="ml-auto text-rose-400 hover:underline" onClick={() => remove(t.id)}>del</button>
                  </div>
                </div>
              ))}
              {byCol(col.key).length === 0 && <p className="px-1 py-4 text-center text-[11px] text-muted">none</p>}
            </div>
          </div>
        ))}
      </div>

      {/* pagination (all-time) */}
      {view === "all" && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button className="btn-ghost px-3 py-1" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</button>
          <span className="text-muted">Page {page} of {totalPages} · {data?.total ?? 0} total</span>
          <button className="btn-ghost px-3 py-1" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next →</button>
        </div>
      )}

      <button className="text-xs text-muted hover:underline" onClick={addAssignee}>+ add assignee</button>
    </div>
  );
}
