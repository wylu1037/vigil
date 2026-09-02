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

// --- Time units ---

const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// --- Manual pause ---

// Every pause carries an expiry, and the expiry is bounded: a stray or
// forgotten /pause can silence the relay's keep-alive for at most a month,
// never indefinitely. A longer stand-down is a deploy-level decision — set
// `crons` to [] in wrangler.jsonc — not something a URL should be able to do.
export const MAX_PAUSE_DAYS = 30;
const MAX_PAUSE_MS = MAX_PAUSE_DAYS * DAY_MS;

// Used when /pause is called without an explicit ?for=. Kept as a duration
// string so it goes through the same parser as anything a caller sends —
// there is one definition of what a valid duration is, not two.
const DEFAULT_PAUSE = "60m";

const UNIT_MS: Record<string, number> = {
  m: MINUTE_MS,
  h: HOUR_MS,
  d: DAY_MS,
};

export interface PauseDuration {
  ms: number;
  label: string; // normalised form, echoed back in the response
}

// A whole number with an optional m/h/d suffix; a bare number stays minutes,
// which is what ?for= meant before units existed. Null means reject: an
// out-of-range value is a 400 rather than a silent clamp, so a typo'd
// ?for=300d does not quietly become a month of silence.
export function parsePauseDuration(raw: string | null): PauseDuration | null {
  const parts = /^(\d+)([mhd])?$/.exec((raw || DEFAULT_PAUSE).trim().toLowerCase());
  if (!parts) return null;

  const n = Number(parts[1]);
  const unit = parts[2] || "m";
  const ms = n * UNIT_MS[unit];
  if (n < 1 || ms > MAX_PAUSE_MS) return null;

  return { ms, label: `${n}${unit}` };
}

// --- Status dashboard ---

export const SITE_TITLE = "Vigil Pulse";

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
