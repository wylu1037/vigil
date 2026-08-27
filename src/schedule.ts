// Adaptive dual cadence, driven by a per-minute cron trigger.
//
//   success -> "keep-alive" line, one ping every 2 minutes
//   failure -> "activation" line, one ping every 20 seconds
//
// Both are stateless: the cron fires every minute but only even minutes
// start a block, and a block owns the full 2 minutes. Succeeding ends the
// block early, so the next ping is the next block — that *is* the 2-minute
// cadence. Failing keeps retrying inside the block at 20s.
//
// Attempts are pinned to absolute offsets from the block start rather than
// sleeping a fixed amount after each request. That keeps the rhythm from
// drifting by however long each request took, and makes the gap between a
// block's last attempt (~100s) and the next block's first (120s) still 20s.

import { sendChat } from "./api";
import { DAILY_EMAIL_LIMIT, UTC8_OFFSET_MS } from "./config";
import { sendRecoveryEmail } from "./mailer";
import { readState, writeState, type Outcome } from "./state";

const BLOCK_MS = 120_000; // one block == the keep-alive interval
const RETRY_MS = 20_000; // activation interval
const JITTER_RATIO = 0.1; // ±10%
const MAX_ATTEMPTS = 6; // 0s, 20s, 40s, 60s, 80s, 100s
const GUARD_MS = 5_000; // never bleed into the next block

// UTC+8 send window: 07:00:00 – 23:59:59 inclusive
const WINDOW_START_HOUR = 7;
const WINDOW_END_HOUR = 23;

export function inWindowUtc8(date: Date): boolean {
  const hourUtc8 = new Date(date.getTime() + UTC8_OFFSET_MS).getUTCHours();
  return hourUtc8 >= WINDOW_START_HOUR && hourUtc8 <= WINDOW_END_HOUR;
}

// Odd-minute ticks are no-ops; the even-minute block already covers them.
export function isBlockStart(date: Date): boolean {
  return date.getUTCMinutes() % 2 === 0;
}

// ±JITTER_RATIO of `ms`, so traffic does not land on an exact grid.
// Math.random() is fine here — this is timing, not a security decision.
function jitterOffset(ms: number): number {
  return ms * JITTER_RATIO * (Math.random() * 2 - 1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAdaptiveBlock(env: Env): Promise<void> {
  const blockStart = Date.now();
  const deadline = blockStart + BLOCK_MS - GUARD_MS;
  const state = await readState(env, new Date(blockStart));

  let failures = 0;
  let ok = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const target =
        blockStart + attempt * RETRY_MS + jitterOffset(RETRY_MS);
      if (target >= deadline) break;
      const delay = target - Date.now();
      if (delay > 0) await sleep(delay);
    }

    if (await sendChat(env)) {
      ok = true;
      break;
    }
    failures++;
  }

  const now = new Date();
  const outcome: Outcome = ok ? "ok" : "fail";

  // "Activation succeeded" == we got back up after failing. Either we failed
  // earlier in this block, or the previous block ended down (which is the
  // case a purely block-local check would miss).
  const crossedBlocks = state.lastOutcome === "fail";
  const recovered = ok && (failures > 0 || crossedBlocks);

  let emailCount = state.emailCount;
  let dirty = outcome !== state.lastOutcome;

  if (recovered) {
    if (emailCount < DAILY_EMAIL_LIMIT) {
      const sent = await sendRecoveryEmail(env, {
        at: now,
        failures,
        crossedBlocks,
        idempotencyKey: `${state.emailDate}-${emailCount}`,
      });
      if (sent) {
        emailCount++;
        dirty = true;
      }
    } else {
      console.log(
        `[${now.toISOString()}] recovered but daily email limit ` +
          `(${DAILY_EMAIL_LIMIT}) reached, skip`
      );
    }
  }

  console.log(
    `[${now.toISOString()}] block done outcome=${outcome} ` +
      `failures=${failures} recovered=${recovered} emails=${emailCount}`
  );

  // Write only on a real change — keeps us far inside the KV free tier
  if (dirty) {
    await writeState(env, { ...state, lastOutcome: outcome, emailCount });
  }
}
