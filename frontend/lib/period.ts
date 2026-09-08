// Shared window resolver for the period endpoints.
// Anchored to the BUSINESS timezone (America/Los_Angeles) so "today"/"this week" match the
// ops day, not the server's UTC clock (which read a day off). Dates are treated as calendar
// dates. Adds `all_time`. week = Mon..Sun.
const BUSINESS_TZ = "America/Los_Angeles";

function businessToday(): Date {
  // current calendar date in the business tz, as a Date at UTC-midnight of that date
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return new Date(ymd + "T00:00:00Z");
}

export type Range = { start: string; end: string; all_time?: boolean };

export const WINDOWS = [
  "today", "yesterday", "this_week", "last_week",
  "this_month", "last_month", "last_7d", "last_30d", "all_time",
];

export function resolveWindow(window: string): Range | null {
  const today = businessToday();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const add = (b: Date, days: number) => { const x = new Date(b); x.setUTCDate(x.getUTCDate() + days); return x; };
  const monday = (b: Date) => { const x = new Date(b); const wd = (x.getUTCDay() + 6) % 7; return add(x, -wd); };
  const firstOfMonth = (b: Date) => new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1));
  switch (window) {
    case "today": return { start: iso(today), end: iso(today) };
    case "yesterday": return { start: iso(add(today, -1)), end: iso(add(today, -1)) };
    case "this_week": return { start: iso(monday(today)), end: iso(today) };
    case "last_week": return { start: iso(add(monday(today), -7)), end: iso(add(monday(today), -1)) };
    case "this_month": return { start: iso(firstOfMonth(today)), end: iso(today) };
    case "last_month": {
      const lm = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return { start: iso(lm), end: iso(add(firstOfMonth(today), -1)) };
    }
    case "last_7d": return { start: iso(add(today, -6)), end: iso(today) };
    case "last_30d": return { start: iso(add(today, -29)), end: iso(today) };
    case "all_time": return { start: "2000-01-01", end: iso(today), all_time: true };
    default: return null;
  }
}

// How much of the window the daily feed actually covers, so a lagging feed can't return a
// near-zero "this week" that reads as a real answer.
export function coverage(r: Range, dataThrough: string | null) {
  const through = dataThrough || null;
  const no_data_yet = !!(through && r.start > through);       // window is entirely after the feed
  const partial = !!(through && through < r.end && !r.all_time); // window extends past the feed
  const covered_through = through && through < r.end ? through : r.end;
  return { data_through: through, covered_through, partial, no_data_yet };
}
