"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname();
  // no chrome on the login page — it stands alone
  if (pathname === "/login") return null;

  async function logout() {
    try {
      await fetch("/api/authgate/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    window.location.assign("/login");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-panel/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-card">
            S
          </span>
          <span className="text-[15px] font-bold tracking-tight text-deep">
            Scaletopia <span className="font-medium text-muted">Evergreen</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1.5 text-sm">
          <Link href="/" className="btn-ghost">
            Clients
          </Link>
          <Link href="/graph" className="btn-ghost">
            Graph
          </Link>
          <Link href="/search" className="btn-ghost">
            Search
          </Link>
          <Link href="/tickets" className="btn-ghost">
            Tickets
          </Link>
          <Link href="/clients/new" className="btn">
            + Onboard client
          </Link>
          <button onClick={logout} className="btn-ghost" title="Sign out">
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
