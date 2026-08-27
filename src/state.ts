// Persisted state in KV.
//
// Only the email side needs persistence: the send cadence itself is
// stateless (each 2-minute block decides independently). We keep the last
// block outcome too, so a recovery that lands on a block's *first* attempt
// is still recognised as one.

import { UTC8_OFFSET_MS } from "./config";

const KEY = "worker-state";

export type Outcome = "ok" | "fail";

export interface State {
  lastOutcome: Outcome;
  emailDate: string; // UTC+8 calendar day, "YYYY-MM-DD"
  emailCount: number; // emails already sent on emailDate
}

// UTC+8 calendar day; the offset is a whole number of hours, so shifting
// the instant and reading the UTC date is exact.
export function utc8DateString(date: Date): string {
  return new Date(date.getTime() + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

const fresh = (today: string): State => ({
  lastOutcome: "ok",
  emailDate: today,
  emailCount: 0,
});

// Rolls the counter over automatically when the UTC+8 day changes.
export async function readState(env: Env, now: Date): Promise<State> {
  const today = utc8DateString(now);
  try {
    const raw = await env.STATE.get(KEY, "json");
    if (!raw) return fresh(today);

    const s = raw as Partial<State>;
    const lastOutcome: Outcome = s.lastOutcome === "fail" ? "fail" : "ok";
    if (s.emailDate !== today) {
      return { lastOutcome, emailDate: today, emailCount: 0 };
    }
    return {
      lastOutcome,
      emailDate: today,
      emailCount: typeof s.emailCount === "number" ? s.emailCount : 0,
    };
  } catch (e: unknown) {
    // A KV hiccup must not stop the pings — fall back to a clean slate
    console.error(`[${now.toISOString()}] state read failed: ${String(e)}`);
    return fresh(today);
  }
}

export async function writeState(env: Env, state: State): Promise<void> {
  try {
    await env.STATE.put(KEY, JSON.stringify(state));
  } catch (e: unknown) {
    console.error(
      `[${new Date().toISOString()}] state write failed: ${String(e)}`
    );
  }
}
