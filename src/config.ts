export interface Env {
  BASE_URL: string;
  API_KEY: string;
  INPUT_TEXT?: string;
}

export const MODEL_ID = "gpt-5.6-sol";

export const DEFAULT_INPUT =
  "Hi! What is the current time? Don't reply to anything else.";

export const USER_AGENT =
  "codex-tui/0.145.0 (Mac OS 15.5.0; arm64) WarpTerminal/v0.2026.07.15.08.55.stable_01 (codex-tui; 0.145.0)";
