// vigil claude pinger — 定时向 Anthropic 兼容 relay 的 /v1/messages 发探测请求。
//
// 本文件只描述「Anthropic Messages API 长什么样」；参数解析、.env、发送、
// 循环、退出码全在 ../pinger/core.ts。用 scriptc 编译成原生二进制后可直接丢到任意机器上跑。
// base_url / api key 从 VIGIL_CLAUDE_BASE_URL / VIGIL_CLAUDE_API_KEY 读（或同目录 .env）。

import { main, type ProbeRequest, type Target } from "../pinger/core.ts";

// 注意：Claude Code 自己发出的 body 里 model 不带 [1M] 后缀（后缀由客户端剥掉，
// 换成 context-1m beta 头）。relay 对带后缀的模型名直接回 429。
const MODEL_ID = "claude-fable-5-1";
const ANTHROPIC_VERSION = "2023-06-01";
// relay 要求启用 1M 上下文，否则返回 400 "请启用 1m 上下文后重试"
const ANTHROPIC_BETA = "context-1m-2025-08-07";
const INPUT_TEXT = "Hi! What is the current time? Don't reply to anything else.";
// 探测用途，回复刻意压短
const MAX_TOKENS = 256;
// 模拟 Claude Code 客户端：UA 格式为 claude-cli/<版本> (external, cli)，并附带 x-app: cli
const USER_AGENT = "claude-cli/2.1.274 (external, cli)";

// ---- relay 的 Claude Code 指纹校验（抓包 + 逐项删减实测得出，缺任一项即 503/520）----
// 1. system 必须含 Claude Code 的开场句
const SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";
// 2. metadata.user_id 必须是 Claude Code 的 JSON 串格式（值可以是伪造的）
const DEVICE_ID = "0".repeat(64);
// 3. tools 至少 4 个（少于 4 个回 520），这里给 Claude Code 的核心工具名，schema 留空
const TOOL_NAMES = ["Agent", "Bash", "Edit", "Read", "Write", "Glob", "Grep"];

// scriptc 静态构建不支持 Number.toString(16)，用查表拼接
function pseudoUuid(): string {
  const digits = "0123456789abcdef";
  const hex = (n: number): string => {
    let out = "";
    for (let i = 0; i < n; i++) out += digits[Math.floor(Math.random() * 16)];
    return out;
  };
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

// 进程生命周期内固定，模拟一次 Claude Code 会话
const sessionId = pseudoUuid();

const target: Target = {
  name: "claude",
  envPrefix: "VIGIL_CLAUDE",
  model: MODEL_ID,
  // 注意：Anthropic 格式的路径自带 /v1 前缀，所以 base_url 不要带 /v1
  request(baseUrl: string, apiKey: string): ProbeRequest {
    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ANTHROPIC_BETA,
        "User-Agent": USER_AGENT,
        "x-app": "cli",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: SYSTEM_PROMPT }],
        tools: TOOL_NAMES.map((name) => ({
          name,
          description: "x",
          input_schema: { type: "object", properties: {} },
        })),
        metadata: {
          user_id: JSON.stringify({
            device_id: DEVICE_ID,
            account_uuid: "",
            session_id: sessionId,
          }),
        },
        messages: [{ role: "user", content: INPUT_TEXT }],
      }),
    };
  },
};

main(target);
