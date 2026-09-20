// 最小自检，覆盖有分支的纯逻辑（参数解析、.env 解析）。
// 运行：node pinger/check.ts（Node ≥ 22.6 原生剥类型）或 make check。
// 不用 scriptc 跑：它的 assert.deepEqual 要求两侧静态类型完全一致，没必要迁就。

import assert from "node:assert/strict";
import { parseArgs, parseDuration } from "./cli.ts";
import { parseDotEnv } from "./env.ts";

// parseDuration
assert.equal(parseDuration("20s"), 20_000);
assert.equal(parseDuration("1500ms"), 1500);
assert.equal(parseDuration("2m"), 120_000);
assert.equal(parseDuration("1h"), 3_600_000);
assert.equal(parseDuration("3"), 3000);
assert.equal(parseDuration("1.5s"), 1500);
assert.throws(() => parseDuration("500ms"), /不能小于 1s/);
assert.throws(() => parseDuration("abc"), /无法解析/);

// parseArgs
assert.deepEqual(parseArgs([]), { intervalMs: 20_000, count: 0 });
assert.deepEqual(parseArgs(["5m"]), { intervalMs: 300_000, count: 0 });
assert.deepEqual(parseArgs(["-i", "2s", "-n", "2"]), { intervalMs: 2000, count: 2 });
assert.deepEqual(parseArgs(["--interval", "90s", "--count", "20"]), { intervalMs: 90_000, count: 20 });
assert.equal(parseArgs(["-h"]), null);
assert.equal(parseArgs(["--help"]), null);
assert.throws(() => parseArgs(["-n", "0"]), /正整数/);
assert.throws(() => parseArgs(["-n"]), /缺少参数值/);
assert.throws(() => parseArgs(["--bogus"]), /未知选项/);

// parseDotEnv：注释 / 空行 / CRLF / 引号 / 坏行 / 值里含 =
assert.deepEqual(
  parseDotEnv('# comment\r\n\r\nA="x y"\r\nbroken-line\r\nB=\'q\'\r\n=nokey\r\nC=a=b\nD=\n'),
  { A: "x y", B: "q", C: "a=b", D: "" }
);
assert.deepEqual(parseDotEnv(""), {});

console.log("check ok");
