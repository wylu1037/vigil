import { sendChat } from "./api";
import type { Env } from "./config";
import { inWindowUtc8, sendMinuteBurst } from "./schedule";

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    if (!inWindowUtc8(new Date(controller.scheduledTime))) {
      console.log(
        `[${new Date().toISOString()}] outside window (UTC+8 07:00–23:59), skip`
      );
      return;
    }
    await sendMinuteBurst(env, ctx);
  },


  async fetch(
    _req: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    ctx.waitUntil(sendChat(env));
    return new Response("triggered 🚀\n");
  },
};
