import { DEFAULT_INPUT, MODEL_ID, USER_AGENT } from "./config";
import type { Env } from "./config";

export async function sendChat(env: Env): Promise<void> {
  try {
    const base = (env.BASE_URL || "").replace(/\/+$/, "");
    const resp = await fetch(`${base}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.API_KEY}`,
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        input: env.INPUT_TEXT || DEFAULT_INPUT,
      }),
    });

    const text = await resp.text();
    console.log(
      `[${new Date().toISOString()}] status=${resp.status} body=${text.slice(0, 200)}`
    );
  } catch (e: unknown) {
    console.error(
      `[${new Date().toISOString()}] request failed: ${String(e)}`
    );
  }
}
