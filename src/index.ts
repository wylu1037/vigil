// Worker entry: cron-scheduled handler + manual trigger route

import { sendChat } from "./api";
import { inWindowUtc8, isBlockStart, runAdaptiveBlock } from "./schedule";

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

  // Manual one-shot trigger, handy for checking relay connectivity
  // (curl http://localhost:8787/)
  async fetch(
    _req: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    ctx.waitUntil(sendChat(env));
    return new Response("triggered\n");
  },
};
