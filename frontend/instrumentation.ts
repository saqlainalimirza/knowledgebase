// Next.js instrumentation hook: runs once when the server boots.
// Starts the in-process daily sync scheduler (see lib/cron.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCron } = await import("./lib/cron");
    startCron();
  }
}
