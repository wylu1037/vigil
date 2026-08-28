// Responses API call to the relay, with logging.

import { DEFAULT_INPUT, MODEL_ID, USER_AGENT } from "./config";

// One probe of the relay. `ok` drives the send cadence; the rest is what
// the status dashboard charts.
export interface ProbeResult {
  ok: boolean; // HTTP 2xx
  status: number; // HTTP status code, or 0 when the request never landed
  latencyMs: number;
  at: number; // Unix ms, when the probe started
}

// Non-2xx and thrown errors both count as failure, which is what puts the
// scheduler on the 20s activation cadence.
export async function sendChat(env: Env): Promise<ProbeResult> {
  const at = Date.now();
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

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
    const latencyMs = elapsed();
    console.log(
      `[${new Date().toISOString()}] status=${resp.status} latency=${latencyMs}ms ` +
        `body=${text.slice(0, 200)}`
    );
    return { ok: resp.ok, status: resp.status, latencyMs, at };
  } catch (e: unknown) {
    // Log network and other failures ourselves so callers don't need
    // a catch at every call site
    const latencyMs = elapsed();
    console.error(
      `[${new Date().toISOString()}] request failed after ${latencyMs}ms: ${String(e)}`
    );
    return { ok: false, status: 0, latencyMs, at };
  }
}
