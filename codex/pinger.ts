// vigil codex pinger — 定时向 OpenAI 兼容 relay 的 /responses 发探测请求。
//
// 本文件只描述「OpenAI Responses API 长什么样」；参数解析、.env、发送、
// 循环、退出码全在 ../pinger/core.ts。用 scriptc 编译成原生二进制后可直接丢到任意机器上跑。
// base_url / api key 从 VIGIL_CODEX_BASE_URL / VIGIL_CODEX_API_KEY 读（或同目录 .env）。

import { main, type ProbeRequest, type Target } from "../pinger/core.ts";

const MODEL_ID = "gpt-6-astra";
const INPUT_TEXT = "Hi! What is the current time? Don't reply to anything else.";
const USER_AGENT =
  "codex-tui/0.145.0 (Mac OS 15.5.0; arm64) WarpTerminal/v0.2026.07.15.08.55.stable_01 (codex-tui; 0.145.0)";

const target: Target = {
  name: "codex",
  envPrefix: "VIGIL_CODEX",
  model: MODEL_ID,
  // 注意：OpenAI 兼容的 base_url 要带 /v1，这里只在其后拼 /responses
  request(baseUrl: string, apiKey: string): ProbeRequest {
    return {
      url: `${baseUrl}/responses`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ model: MODEL_ID, input: INPUT_TEXT }),
    };
  },
};

main(target);
