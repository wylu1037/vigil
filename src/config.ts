// Request configuration.
//
// The `Env` interface is NOT declared here — it is generated into
// worker-configuration.d.ts by `wrangler types` and is globally available.
// Re-run `wrangler types` after changing bindings in wrangler.jsonc.

export const MODEL_ID = "gpt-5.6-sol";

// Used when the INPUT_TEXT binding is absent or empty
export const DEFAULT_INPUT =
  "Hi! What is the current time? Don't reply to anything else.";

export const USER_AGENT =
  "codex-tui/0.145.0 (Mac OS 15.5.0; arm64) WarpTerminal/v0.2026.07.15.08.55.stable_01 (codex-tui; 0.145.0)";

// At most this many "activation succeeded" emails per UTC+8 day
export const DAILY_EMAIL_LIMIT = 10;

// Shared by the send window and the daily email counter
export const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

// --- Status dashboard ---

export const SITE_TITLE = "Vigil Pulse";

export const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

// How long probe rows are kept in D1. No range in RANGES may span more
// than this — the trend strip cannot show more history than we retain.
export const RETENTION_DAYS = 7;

// One selectable window of the dashboard. `bucketMs` is the width of a
// single trend-strip cell; it is chosen so every range lands on 45–84
// cells, which the flex strip lays out without any layout change.
export interface RangeSpec {
  key: string; // the ?r= value
  label: string;
  spanMs: number;
  bucketMs: number;
}

export const RANGES: RangeSpec[] = [
  { key: "90m", label: "90 min", spanMs: 90 * MINUTE_MS, bucketMs: 2 * MINUTE_MS },
  { key: "24h", label: "24 hours", spanMs: 24 * HOUR_MS, bucketMs: 30 * MINUTE_MS },
  { key: "7d", label: "7 days", spanMs: 7 * 24 * HOUR_MS, bucketMs: 2 * HOUR_MS },
];

export const DEFAULT_RANGE = RANGES[0];

// Unknown values fall back rather than 400: the page is public and a stale
// bookmark should still render something.
export const resolveRange = (key: string | null): RangeSpec =>
  RANGES.find((r) => r.key === key) ?? DEFAULT_RANGE;

// Rows in the "recent probes" table
export const RECENT_LIMIT = 60;

// Edge cache for the public page and its JSON twin
export const PAGE_CACHE_SECONDS = 30;
