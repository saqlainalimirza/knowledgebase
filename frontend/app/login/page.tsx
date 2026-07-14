"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) router.push(params.get("from") || "/");
    else setErr("That's not it — try again.");
  }

  return (
    <main className="mx-auto mt-24 max-w-sm">
      <div className="card">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">S</span>
          <span className="font-bold text-deep">Scaletopia <span className="font-medium text-muted">Evergreen</span></span>
        </div>
        <p className="mb-4 text-sm text-muted">Team access only. Enter the workspace password.</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="input" type="password" autoFocus placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <button className="btn w-full" disabled={busy || !password}>
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
