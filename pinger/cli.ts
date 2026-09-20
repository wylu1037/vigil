// 命令行参数解析。只认「间隔」与「次数」，不碰环境变量与网络。

export const DEFAULT_INTERVAL = "20s";

export interface Options {
  intervalMs: number;
  count: number; // 0 表示无限
}

// 接受 "20s" / "5m" / "1h" / "1500ms" / 裸数字（秒）
export function parseDuration(raw: string): number {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(raw.trim());
  if (m === null) {
    throw new Error(`无法解析的时间间隔: ${raw}（示例：20s、5m、1h、1500ms）`);
  }
  const value = Number(m[1]);
  const unit = m[2] ?? "s";
  const factor =
    unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
  const ms = Math.round(value * factor);
  if (ms < 1000) throw new Error("时间间隔不能小于 1s");
  return ms;
}

export function usage(): string {
  return [
    "用法: pinger [间隔] [选项]",
    "",
    "参数:",
    `  间隔                 两次请求之间的等待时间，默认 ${DEFAULT_INTERVAL}`,
    "                       支持 ms / s / m / h 后缀，裸数字按秒计",
    "",
    "选项:",
    "  -i, --interval <t>   同上，显式写法",
    "  -n, --count <n>      总共发送多少次后退出，默认无限",
    "  -h, --help           显示本帮助",
    "",
    "示例:",
    "  pinger 20s",
    "  pinger --interval 5m --count 12",
  ].join("\n");
}

// 返回 null 表示用户要看帮助；非法参数抛 Error
export function parseArgs(argv: string[]): Options | null {
  let interval = DEFAULT_INTERVAL;
  let count = 0;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return null;

    if (arg === "-i" || arg === "--interval") {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} 缺少参数值`);
      interval = next;
      continue;
    }
    if (arg === "-n" || arg === "--count") {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} 缺少参数值`);
      count = Number(next);
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(`--count 需要是正整数，收到: ${next}`);
      }
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`未知选项: ${arg}`);

    // 位置参数：间隔
    interval = arg;
  }

  return { intervalMs: parseDuration(interval), count };
}
