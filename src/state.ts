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

// `dayRolled` is derived, not stored: it is true on the first block of a
// new UTC+8 day. The dashboard's retention sweep piggybacks on it instead
// of adding a second scheduled job.
export interface LoadedState extends State {
  dayRolled: boolean;
}

// UTC+8 calendar day; the offset is a whole number of hours, so shifting
// the instant and reading the UTC date is exact.
export function utc8DateString(date: Date): string {
  return new Date(date.getTime() + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

const fresh = (today: string): LoadedState => ({
  lastOutcome: "ok",
  emailDate: today,
  emailCount: 0,
  dayRolled: false,
});

// Rolls the counter over automatically when the UTC+8 day changes.
export async function readState(env: Env, now: Date): Promise<LoadedState> {
  const today = utc8DateString(now);
  try {
    const raw = await env.VIGIL_STATE.get(KEY, "json");
    if (!raw) return fresh(today);

    const s = raw as Partial<State>;
    const lastOutcome: Outcome = s.lastOutcome === "fail" ? "fail" : "ok";
    if (s.emailDate !== today) {
      return {
        lastOutcome,
        emailDate: today,
        emailCount: 0,
        dayRolled: true,
      };
    }
    return {
      lastOutcome,
      emailDate: today,
      emailCount: typeof s.emailCount === "number" ? s.emailCount : 0,
      dayRolled: false,
    };
  } catch (e: unknown) {
    // A KV hiccup must not stop the pings — fall back to a clean slate
    console.error(`[${now.toISOString()}] state read failed: ${String(e)}`);
    return fresh(today);
  }
}

export async function writeState(env: Env, state: State): Promise<void> {
  try {
    await env.VIGIL_STATE.put(KEY, JSON.stringify(state));
  } catch (e: unknown) {
    console.error(
      `[${new Date().toISOString()}] state write failed: ${String(e)}`
    );
  }
}
