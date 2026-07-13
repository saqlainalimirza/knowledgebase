import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scaletopia Evergreen",
  description: "Your agency's first-party memory — every client, every call, every win.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-20 border-b border-edge bg-panel/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-card">S</span>
              <span className="text-[15px] font-bold tracking-tight text-deep">
                Scaletopia <span className="font-medium text-muted">Evergreen</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1.5 text-sm">
              <Link href="/" className="btn-ghost">Clients</Link>
              <Link href="/graph" className="btn-ghost">Graph</Link>
              <Link href="/search" className="btn-ghost">Search</Link>
              <Link href="/clients/new" className="btn">+ Onboard client</Link>
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-5 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}
