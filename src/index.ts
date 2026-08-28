// Worker entry: cron-scheduled handler + the public status page.

import { sendChat } from "./api";
import { PAGE_CACHE_SECONDS, resolveRange } from "./config";
import { loadDashboard, recordProbes } from "./db";
import { inWindowUtc8, isBlockStart, runAdaptiveBlock } from "./schedule";
import { renderDashboard } from "./ui";

// Length-independent comparison, so a wrong token leaks no timing signal.
function tokenMatches(expected: string, got: string | null): boolean {
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  }
  return diff === 0;
}

const cacheHeaders = (contentType: string) => ({
  "Content-Type": contentType,
  // The page is public; let the edge absorb repeat traffic instead of D1
  "Cache-Control": `public, max-age=${PAGE_CACHE_SECONDS}`,
});

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const tick = new Date(controller.scheduledTime);

    if (!inWindowUtc8(tick)) {
      console.log(
        `[${new Date().toISOString()}] outside window (UTC+8 07:00–23:59), skip`
      );
      return;
    }

    // The cron fires every minute, but a block spans two of them.
    if (!isBlockStart(tick)) return;

    // Awaited, not waitUntil: the block's result decides the cadence.
    await runAdaptiveBlock(env);
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("method not allowed\n", { status: 405 });
    }

    // Unknown ?r= values fall back to the default range instead of 400ing.
    const range = resolveRange(url.searchParams.get("r"));

    switch (url.pathname) {
      case "/": {
        const data = await loadDashboard(env, Date.now(), range);
        return new Response(renderDashboard(data), {
          headers: cacheHeaders("text/html; charset=utf-8"),
        });
      }

      case "/api/status": {
        const data = await loadDashboard(env, Date.now(), range);
        return new Response(JSON.stringify(data), {
          headers: cacheHeaders("application/json; charset=utf-8"),
        });
      }

      // Manual one-shot probe. Fails closed: with no TRIGGER_TOKEN
      // configured the route does not exist, so a public deployment can
      // never be used to burn relay quota.
      case "/trigger": {
        const expected = env.TRIGGER_TOKEN;
        if (!expected || !tokenMatches(expected, url.searchParams.get("t"))) {
          return new Response("not found\n", { status: 404 });
        }
        // A manual probe is still a real probe — chart it like any other.
        ctx.waitUntil(sendChat(env).then((p) => recordProbes(env, [p])));
        return new Response("triggered 🚀\n", {
          headers: { "Cache-Control": "no-store" },
        });
      }

      default:
        return new Response("not found\n", { status: 404 });
    }
  },
};
