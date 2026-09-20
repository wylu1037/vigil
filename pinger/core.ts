// 探测核心：一个 Target 只描述「往哪发、发什么」，
// 参数解析、.env、发送、计时、超时、循环、退出码全部在这里统一处理。
// 新增一种 relay 格式 = 新写一个 Target 文件，本文件不动。

import { parseArgs, usage, type Options } from "./cli.ts";
import { loadDotEnv, requireEnv } from "./env.ts";

export interface ProbeRequest {
  url: string;
  headers: Record<string, string>;
  body: string; // 已 JSON.stringify；scriptc 不能把具体字面量提升为 unknown，所以在 Target 侧序列化
}

export interface Target {
  name: string; // 日志里的标识
  envPrefix: string; // 如 VIGIL_CLAUDE → 读 VIGIL_CLAUDE_BASE_URL / VIGIL_CLAUDE_API_KEY
  model: string;
  // baseUrl 已去掉末尾斜杠
  request(baseUrl: string, apiKey: string): ProbeRequest;
}

// 单次请求的超时；超过间隔时长的请求没有意义
const REQUEST_TIMEOUT_MS = 60_000;

interface ProbeResult {
  ok: boolean;
  status: number; // 请求未落地时为 0
  latencyMs: number;
}

function log(msg: string, isError = false): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  if (isError) console.error(line);
  else console.log(line);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function probe(req: ProbeRequest): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });

    // 读完 body，避免连接悬挂；日志只留前 200 字符，探测用途够分辨真回复还是错误页
    const text = await resp.text();
    const latencyMs = Date.now() - started;
    log(
      `status=${resp.status} latency=${latencyMs}ms body=${text.slice(0, 200)}`
    );
    return { ok: resp.ok, status: resp.status, latencyMs };
  } catch (e: unknown) {
    const latencyMs = Date.now() - started;
    log(`request failed after ${latencyMs}ms: ${String(e)}`, true);
    return { ok: false, status: 0, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

// 不调 process.exit，便于测试；退出码：0 全部成功，1 有失败，2 参数/配置错误
export async function run(target: Target, argv: string[]): Promise<number> {
  // 显式标注：scriptc 对未标注的 let 按 dyn 处理，后面就不能解构（SC1031）
  let opts: Options | null;
  try {
    opts = parseArgs(argv);
  } catch (e: unknown) {
    console.error(String(e instanceof Error ? e.message : e));
    console.error("");
    console.error(usage());
    return 2;
  }
  if (opts === null) {
    console.log(usage());
    return 0;
  }
  const { intervalMs, count } = opts;

  loadDotEnv();
  let baseUrl: string;
  let apiKey: string;
  try {
    baseUrl = requireEnv(`${target.envPrefix}_BASE_URL`).replace(/\/+$/, "");
    apiKey = requireEnv(`${target.envPrefix}_API_KEY`);
  } catch (e: unknown) {
    console.error(String(e instanceof Error ? e.message : e));
    return 2;
  }

  log(
    `start target=${target.name} base=${baseUrl} model=${target.model} ` +
      `interval=${intervalMs}ms count=${count === 0 ? "∞" : count}`
  );

  let sent = 0;
  let ok = 0;
  for (;;) {
    const result = await probe(target.request(baseUrl, apiKey));
    sent++;
    if (result.ok) ok++;

    if (count !== 0 && sent >= count) break;
    await sleep(intervalMs);
  }

  log(`done sent=${sent} ok=${ok} failed=${sent - ok}`);
  return ok === sent ? 0 : 1;
}

// 入口样板：跑 run 并把退出码交给进程。
// scriptc 不支持双参数 then（SC2020），成功与失败分支必须拆成 then + catch。
export function main(target: Target): void {
  run(target, process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((e: unknown) => {
      console.error(String(e));
      process.exit(1);
    });
}
