import { sendChat } from "./api";
import type { Env } from "./config";

const SENDS_PER_MINUTE = 3;
const INTERVAL_MS = 20_000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

const WINDOW_START_HOUR = 7;
const WINDOW_END_HOUR = 23;

export function inWindowUtc8(date: Date): boolean {
  const hourUtc8 = new Date(date.getTime() + UTC8_OFFSET_MS).getUTCHours();
  return hourUtc8 >= WINDOW_START_HOUR && hourUtc8 <= WINDOW_END_HOUR;
}

export async function sendMinuteBurst(
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  for (let i = 0; i < SENDS_PER_MINUTE; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, INTERVAL_MS));
    ctx.waitUntil(sendChat(env));
  }
}
