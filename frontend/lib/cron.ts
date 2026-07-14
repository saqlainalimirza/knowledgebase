import { spawn } from "child_process";
import path from "path";

// In-process daily scheduler. Started once from instrumentation.ts when the server
// boots. Fires daily_sync.py detached at SYNC_UTC_HOUR (default 05:00 UTC) so numbers
// (campaigns, stats, deals, niche brains, embeddings) never go stale.

const AGENTS_DIR = process.env.AGENTS_DIR || path.resolve(process.cwd(), "..", "agents");
const PY = process.env.PYTHON_BIN || path.join(AGENTS_DIR, ".venv", "bin", "python");
const HOUR_UTC = Number(process.env.SYNC_UTC_HOUR ?? 5);

declare global {
  // eslint-disable-next-line no-var
  var _evergreenCron: boolean | undefined;
  // eslint-disable-next-line no-var
  var _evergreenSyncRunning: boolean | undefined;
}

export function fireDailySync(only?: string): { started: boolean; reason?: string } {
  if (global._evergreenSyncRunning) return { started: false, reason: "a sync is already running" };
  global._evergreenSyncRunning = true;
  const args = [path.join(AGENTS_DIR, "daily_sync.py")];
  if (only) args.push("--only", only);
  const child = spawn(PY, args, { cwd: AGENTS_DIR, stdio: "ignore", detached: true });
  child.on("exit", () => { global._evergreenSyncRunning = false; });
  child.on("error", () => { global._evergreenSyncRunning = false; });
  child.unref();
  return { started: true };
}

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), HOUR_UTC, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export function startCron() {
  if (global._evergreenCron) return;           // hot-reload / double-boot guard
  if (process.env.DISABLE_CRON === "1") return; // opt-out (e.g. local dev)
  global._evergreenCron = true;

  const scheduleNext = () => {
    const ms = msUntilNextRun();
    console.log(`[evergreen-cron] next daily sync in ${(ms / 3600000).toFixed(1)}h (at ${HOUR_UTC}:00 UTC)`);
    setTimeout(() => {
      console.log("[evergreen-cron] firing daily sync");
      fireDailySync();
      scheduleNext();
    }, ms).unref?.();
  };
  scheduleNext();
}
