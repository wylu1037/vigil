// 配置来源：环境变量，以及工作目录下的 .env。
// scriptc 编译出的原生二进制没有 Node 的 --env-file 开关，所以自己读；
// node:fs 在静态编译下可用，不必引入 dotenv 依赖。

import { readFileSync } from "node:fs";

// 纯函数：.env 文本 → 键值表。支持注释、空行、CRLF、成对引号；坏行忽略。
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue; // 缺 key 或缺 "=" 的行忽略
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if (
      (quote === '"' || quote === "'") &&
      value.length > 1 &&
      value.endsWith(quote)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// 读 .env 写入 process.env。真实环境变量优先，不被 .env 覆盖（与 dotenv 一致）。
export function loadDotEnv(path = ".env"): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e: unknown) {
    return; // 没有 .env 就跳过，缺变量时由 requireEnv 报错
  }
  const parsed = parseDotEnv(text);
  for (const key of Object.keys(parsed)) {
    if (process.env[key] === undefined) process.env[key] = parsed[key];
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`缺少环境变量 ${name}（写入同目录 .env，或直接 export）`);
  }
  return value;
}
