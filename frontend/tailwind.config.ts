import type { Config } from "tailwindcss";

// Scaletopia brand: light, clean, blue-accent, generous whitespace.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#f6f8fb",      // page background (soft cool white)
        panel: "#ffffff",    // cards / surfaces
        edge: "#e4e9f2",     // borders
        accent: "#2563eb",   // scaletopia blue
        accent2: "#1d4ed8",  // hover / deep blue
        muted: "#64748b",    // secondary text
        deep: "#0f172a",     // headings / strong text
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.05), 0 4px 16px rgba(15,23,42,.06)",
        lift: "0 4px 12px rgba(37,99,235,.12), 0 12px 32px rgba(15,23,42,.10)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
