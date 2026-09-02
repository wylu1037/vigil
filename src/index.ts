// Worker entry: cron-scheduled handler + the public status page.

import { sendChat } from "./api";
import {
  MAX_PAUSE_DAYS,
  PAGE_CACHE_SECONDS,
  parsePauseDuration,
  resolveRange,
  type RangeSpec,
} from "./config";
import { loadDashboard, recordProbes } from "./db";
import { inWindowUtc8, isBlockStart, runAdaptiveBlock } from "./schedule";
import { clearPause, readPause, writePause } from "./state";
import { renderDashboard, type DashboardView } from "./ui";

// Length-independent comparison, so a wrong token leaks no timing signal.
function tokenMatches(expected: string, got: string | null): boolean {
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  }
  return diff === 0;
}

// Fails closed: with no TRIGGER_TOKEN configured the guarded routes do not
// exist at all, so a public deployment can never be used to burn relay
// quota or to silence the keep-alive.
function authorized(env: Env, url: URL): boolean {
  const expected = env.TRIGGER_TOKEN;
  return !!expected && tokenMatches(expected, url.searchParams.get("t"));
}

// Control-plane responses are never cached, unlike the status page.
const plain = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const notFound = () => new Response("not found\n", { status: 404 });

const cacheHeaders = (contentType: string) => ({
  "Content-Type": contentType,
  // The page is public; let the edge absorb repeat traffic instead of D1
  "Cache-Control": `public, max-age=${PAGE_CACHE_SECONDS}`,
});

// The dashboard's D1 read and the pause record are independent, so they go
// out together rather than one after the other.
async function loadView(
  env: Env,
  now: number,
  range: RangeSpec
): Promise<DashboardView> {
  const [data, pause] = await Promise.all([
    loadDashboard(env, now, range),
    readPause(env, now),
  ]);
  return { ...data, pause };
}

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
        const view = await loadView(env, Date.now(), range);
        return new Response(renderDashboard(view), {
          headers: cacheHeaders("text/html; charset=utf-8"),
        });
      }

      case "/api/status": {
        const view = await loadView(env, Date.now(), range);
        return new Response(JSON.stringify(view), {
          headers: cacheHeaders("application/json; charset=utf-8"),
        });
      }

      // Manual one-shot probe.
      case "/trigger": {
        if (!authorized(env, url)) return notFound();
        // A manual probe is still a real probe — chart it like any other.
        ctx.waitUntil(sendChat(env).then((p) => recordProbes(env, [p])));
        return plain("triggered 🚀\n");
      }

      // Stand the automatic cadence down for a bounded stretch. /trigger
      // keeps working while paused: an explicit probe is not scheduled
      // traffic, and it is the natural way to check whether whatever you
      // paused for is over yet.
      case "/pause": {
        if (!authorized(env, url)) return notFound();

        // ?m= was minutes-only. Saying so beats silently ignoring it and
        // pausing for the default hour instead of the requested stretch.
        if (url.searchParams.has("m")) {
          return plain("m is gone, use for= (e.g. for=90m, for=2h, for=3d)\n", 400);
        }

        const duration = parsePauseDuration(url.searchParams.get("for"));
        if (duration === null) {
          return plain(
            "for must be a whole number with an optional m/h/d suffix " +
              `(bare digits are minutes), up to ${MAX_PAUSE_DAYS}d\n`,
            400
          );
        }

        const since = Date.now();
        const pause = { since, until: since + duration.ms };
        try {
          await writePause(env, pause);
        } catch (e: unknown) {
          console.error(
            `[${new Date().toISOString()}] pause write failed: ${String(e)}`
          );
          // Report the failure rather than a pause that never landed.
          return plain("pause failed, still probing\n", 500);
        }

        return plain(
          `paused ${duration.label}, until ${new Date(pause.until).toISOString()}\n`
        );
      }

      case "/resume": {
        if (!authorized(env, url)) return notFound();
        try {
          await clearPause(env);
        } catch (e: unknown) {
          console.error(
            `[${new Date().toISOString()}] resume failed: ${String(e)}`
          );
          return plain("resume failed, still paused\n", 500);
        }
        // Idempotent: resuming when not paused is a no-op, not an error.
        return plain("resumed ✅\n");
      }

      default:
        return notFound();
    }
  },
};
