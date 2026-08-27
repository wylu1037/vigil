// Responses API call to the relay, with logging.

import { DEFAULT_INPUT, MODEL_ID, USER_AGENT } from "./config";

// Returns true on HTTP 2xx. Non-2xx and thrown errors both count as
// failure, which is what puts the scheduler on the 20s activation cadence.
export async function sendChat(env: Env): Promise<boolean> {
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

    // Drain the body to avoid leaving the connection hanging
    const text = await resp.text();
    console.log(
      `[${new Date().toISOString()}] status=${resp.status} body=${text.slice(0, 200)}`
    );
    return resp.ok;
  } catch (e: unknown) {
    // Log network and other failures ourselves so callers don't need
    // a catch at every call site
    console.error(`[${new Date().toISOString()}] request failed: ${String(e)}`);
    return false;
  }
}
