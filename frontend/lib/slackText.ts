// Turn Slack wire text into readable text (shared by the events endpoint and the
// replies endpoint). Mirrors agents/tickets_sync.py clean_slack.
const EMOJI: Record<string, string> = {
  rotating_light: "🚨", red_circle: "🔴", large_green_circle: "🟢", green_circle: "🟢",
  white_check_mark: "✅", heavy_check_mark: "✔️", warning: "⚠️", x: "❌", fire: "🔥",
  tada: "🎉", eyes: "👀", bell: "🔔", no_entry: "⛔", exclamation: "❗",
};

export function cleanSlack(text: string): string {
  if (!text) return "";
  return text
    .replace(/<@([A-Z0-9]+)>/g, "@user")
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<#[A-Z0-9]+>/g, "#channel")
    .replace(/<(?:https?|mailto):[^>|]+\|([^>]*)>/g, "$1")
    .replace(/<((?:https?|mailto):[^>]+)>/g, "$1")
    .replace(/:([a-z0-9_+-]+):/g, (m, c) => EMOJI[c] || m)
    .replace(/(^|[^\w*])\*([^*\n]+?)\*(?![\w*])/g, "$1$2")
    .replace(/(^|[^\w~])~([^~\n]+?)~(?![\w~])/g, "$1$2")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

// slack bot token, tolerating a pasted "Bearer " prefix
export function slackToken(): string {
  return (process.env.SLACK_BOT_TOKEN || "").replace(/^Bearer\s+/i, "").trim();
}
