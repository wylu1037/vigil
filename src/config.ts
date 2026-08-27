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
