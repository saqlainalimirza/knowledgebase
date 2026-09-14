import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "./AppHeader";

export const metadata: Metadata = {
  title: "Scaletopia Evergreen",
  description: "Your agency's first-party memory — every client, every call, every win.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppHeader />
        <div className="mx-auto max-w-6xl px-5 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}
