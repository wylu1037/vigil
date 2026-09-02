// Persisted state in KV.
//
// Two independent records live here:
//
//   "worker-state" — the email side. The send cadence itself is stateless
//     (each 2-minute block decides independently); we keep the last block
//     outcome too, so a recovery that lands on a block's *first* attempt is
//     still recognised as one.
//
//   "pause" — a manual, always-expiring stand-down of the automatic cadence.

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

// --- Manual pause ---
//
// Deliberately its own KV key rather than a field on State. A block owns
// its two minutes and can stay busy for ~115s on the activation cadence,
// then writes State back from the snapshot it read at the start. A /pause
// landing mid-block would be read after that snapshot and clobbered before
// it ever took effect. Separate keys means the two writers never race.

const PAUSE_KEY = "pause";

// KV's floor for expirationTtl. Shorter pauses still expire on time — the
// `until` comparison below is what actually gates probing; the TTL only
// saves us from leaving a dead key around.
const MIN_TTL_SECONDS = 60;

export interface Pause {
  since: number; // Unix ms, when the pause was requested
  until: number; // Unix ms, when the cadence resumes by itself
}

// Null means "not paused" — including when KV is unreachable. Failing open
// is the deliberate choice here: this worker exists to keep a relay warm,
// so probing when we meant to be quiet costs one request, while going
// silently dark on a storage blip costs the thing we are here to protect.
export async function readPause(env: Env, now: number): Promise<Pause | null> {
  try {
    const raw = await env.VIGIL_STATE.get(PAUSE_KEY, "json");
    if (!raw) return null;

    const p = raw as Partial<Pause>;
    // A record without a usable expiry is treated as absent, so a
    // hand-edited or truncated value can never pause the worker forever.
    if (typeof p.until !== "number" || !Number.isFinite(p.until)) return null;
    if (p.until <= now) return null;

    return {
      since: typeof p.since === "number" ? p.since : now,
      until: p.until,
    };
  } catch (e: unknown) {
    console.error(
      `[${new Date(now).toISOString()}] pause read failed: ${String(e)}`
    );
    return null;
  }
}

// Unlike writeState, these two let their errors escape. They run on the
// request path, where the caller is an operator waiting on an answer: a
// swallowed failure would report "paused" for a pause that never landed.
export async function writePause(env: Env, pause: Pause): Promise<void> {
  await env.VIGIL_STATE.put(PAUSE_KEY, JSON.stringify(pause), {
    expirationTtl: Math.max(
      MIN_TTL_SECONDS,
      Math.ceil((pause.until - Date.now()) / 1000)
    ),
  });
}

export async function clearPause(env: Env): Promise<void> {
  await env.VIGIL_STATE.delete(PAUSE_KEY);
}
