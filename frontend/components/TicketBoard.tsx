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
  { key: "unchecked", label: "Unchecked", dot: "bg-slate-400", top: "border-t-slate-300", soft: "bg-slate-50/60" },
  { key: "in_progress", label: "In Progress", dot: "bg-amber-400", top: "border-t-amber-300", soft: "bg-amber-50/40" },
  { key: "complete", label: "Complete", dot: "bg-emerald-400", top: "border-t-emerald-300", soft: "bg-emerald-50/40" },
];
const PAGE_SIZE = 30;

// A slack user/bot id like U0B7T2D4A1H carries no meaning to a human -> hide it.
const isSlackId = (s: string | null) => !!s && /^[UBW][A-Z0-9]{6,}$/.test(s);

// Split a bug message into leading @-tags, a title line, and the rest.
function parseTicket(text: string) {
  let body = (text || "").replace(/^(?:@\w+\s*)+/, "").trim(); // drop leading @mentions
  const tagCount = ((text || "").match(/^(?:@\w+\s*)+/)?.[0].match(/@\w+/g) || []).length;
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = lines[0] || "(no text)";
  const detail = lines.slice(1).join("\n");
  return { title, detail, tagCount };
}

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
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="badge badge-gray"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Unchecked {c.unchecked}</span>
        <span className="badge badge-amber"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />In Progress {c.in_progress}</span>
        <span className="badge badge-green"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Complete {c.complete}</span>
      </div>

      {/* board */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className={`rounded-xl2 border border-edge border-t-2 ${col.top} ${col.soft} p-2.5`}>
            <div className="mb-2.5 flex items-center gap-2 px-1">
              <span className={`h-2 w-2 rounded-full ${col.dot}`} />
              <span className="text-[13px] font-semibold text-deep">{col.label}</span>
              <span className="rounded-full bg-white px-1.5 text-[11px] font-semibold text-muted ring-1 ring-edge">{byCol(col.key).length}</span>
            </div>
            <div className="space-y-2.5">
              {byCol(col.key).map((t) => {
                const { title, detail, tagCount } = parseTicket(t.text);
                return (
                  <div key={t.id} className="group rounded-xl border border-edge bg-white p-3 shadow-card transition hover:shadow-lift">
                    <p className="text-[13px] font-semibold leading-snug text-deep">{title}</p>
                    {detail && (
                      <p className="mt-1 max-h-32 overflow-hidden whitespace-pre-wrap text-[12px] leading-relaxed text-slate-500">{detail}</p>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      {tagCount > 0 && <span className="chip py-0 text-[10px]">🏷 {tagCount} tagged</span>}
                      <span className="tabular-nums">{String(t.day).slice(0, 10)}</span>
                      {!isSlackId(t.reporter) && t.reporter && <span>· {t.reporter}</span>}
                      {t.permalink && <a className="font-medium text-accent hover:underline" href={t.permalink} target="_blank" rel="noreferrer">open in Slack ↗</a>}
                    </div>
                    <div className="mt-3 flex items-center gap-2 border-t border-edge/70 pt-2.5">
                      <select className="input w-auto flex-1 py-1 text-[12px]" value={t.assignee} onChange={(e) => update(t.id, { assignee: e.target.value })}>
                        {assignees.map((a) => <option key={a}>{a}</option>)}
                        {!assignees.includes(t.assignee) && <option>{t.assignee}</option>}
                      </select>
                      <div className="flex items-center gap-1">
                        {COLUMNS.filter((x) => x.key !== t.status).map((x) => (
                          <button key={x.key} title={`Move to ${x.label}`} className="rounded-md border border-edge px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:border-accent hover:text-accent" onClick={() => update(t.id, { status: x.key })}>{x.label}</button>
                        ))}
                        <button title="Delete" className="rounded-md px-1.5 py-1 text-[13px] text-slate-300 transition hover:text-rose-500" onClick={() => remove(t.id)}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {byCol(col.key).length === 0 && (
                <div className="rounded-lg border border-dashed border-edge py-6 text-center text-[11px] text-slate-400">nothing here</div>
              )}
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
