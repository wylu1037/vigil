# claude pinger

定时向 Anthropic 兼容 relay 的 `/v1/messages` 发探测请求的命令行程序，用 [scriptc](https://scriptc.dev/) 编译为原生二进制（不依赖 Node 运行时）。

本目录的 [pinger.ts](pinger.ts) 只描述「Anthropic Messages API 长什么样」（URL、头、body）；参数解析、`.env`、发送、计时、循环、退出码全在共享模块 [../pinger/](../pinger/)：

| 文件 | 职责 |
| --- | --- |
| `../pinger/core.ts` | `Target` 接口 + `run()`：读配置、发请求、超时、循环、退出码 |
| `../pinger/cli.ts` | `parseArgs` / `parseDuration` / `usage` |
| `../pinger/env.ts` | `parseDotEnv` / `loadDotEnv` / `requireEnv` |
| `../pinger/check.ts` | 纯逻辑自检，`make check` |

新增一种 relay 格式 = 新建一个目录，写一个 `Target`，共享模块不动。

`base_url` 与 `api key` 从环境变量读，命令行只暴露发送间隔。源码不存密钥，可以进 git。

| 变量 | 说明 |
| --- | --- |
| `VIGIL_CLAUDE_BASE_URL` | relay 地址，**不带** `/v1`（路径自带前缀） |
| `VIGIL_CLAUDE_API_KEY` | `x-api-key` 的值 |

两者都放**程序工作目录**下的 `.env`（已 gitignore，模板见 [.env.example](.env.example)）：

```bash
cp .env.example .env && vi .env
```

优先级与 dotenv 一致：**真实环境变量 > `.env` 文件**。原生二进制没有 Node 的 `--env-file` 开关，程序自己用 `node:fs` 读 `.env`（scriptc 静态编译支持，不需要 dotenv 依赖）。缺变量时直接报错退出（exit 2），不会拿空 key 去请求。

## 与 codex 版的区别

请求走 Anthropic Messages API 格式，关键头部与字段都在 [pinger.ts](pinger.ts) 顶部：

| 项目 | 值 | 说明 |
| --- | --- | --- |
| 路径 | `POST {BASE_URL}/v1/messages` | `VIGIL_CLAUDE_BASE_URL` 不带 `/v1` |
| 鉴权 | `x-api-key` | 不是 `Authorization: Bearer` |
| `anthropic-version` | `2023-06-01` | Messages API 必填 |
| `anthropic-beta` | `context-1m-2025-08-07` | relay 要求启用 1M 上下文，缺失时返回 400 |
| `User-Agent` | `claude-cli/<版本> (external, cli)` | 模拟 Claude Code 客户端，配合 `x-app: cli` |
| `model` | `claude-fable-5-1` | **不带** `[1M]` 后缀，带后缀 relay 直接回 429 |

## relay 的 Claude Code 指纹校验

anyrouter 会检查请求 body 是否"长得像 Claude Code 发的"，不像就回 503 / 520 `Service Unavailable`，
和 relay 负载无关。通过抓包 Claude Code 真实请求再逐项删减，得到的最小集合是：

| 字段 | 要求 | 缺失时 |
| --- | --- | --- |
| `system` | 含 `You are Claude Code, Anthropic's official CLI for Claude.` | 503 |
| `metadata.user_id` | Claude Code 的 JSON 串格式：`{"device_id":"<64 hex>","account_uuid":"","session_id":"<uuid>"}`，值可伪造 | 503 |
| `tools` | 至少 4 个，且名字必须是 Claude Code 真实工具名（Agent / Bash / Edit / Read / Write / Glob / Grep 等），schema 可留空 | 520 |

以下都**不**影响：`stream`、`thinking`、`output_config`、`max_tokens`、`x-stainless-*` 头、`?beta=true`、
`claude-code-20250219` 等其余 beta 头、`Authorization: Bearer` 与 `x-api-key` 的选择、Claude Code
的环境变量（`CLAUDE_CODE_*` 只影响客户端行为）。

## 用法

```
pinger [间隔] [选项]

  间隔                 两次请求之间的等待时间，默认 20s
                       支持 ms / s / m / h 后缀，裸数字按秒计
  -i, --interval <t>   同上，显式写法
  -n, --count <n>      总共发送多少次后退出，默认无限
  -h, --help           显示帮助
```

示例：

```bash
pinger              # 每 20s 一次，一直跑
pinger 5m           # 每 5 分钟一次
pinger --interval 90s --count 20
```

## 编译

前置条件：macOS arm64 为主平台，需要 `clang`（Xcode Command Line Tools）和 Node ≥ 20（仅编译期需要）。

```bash
# 安装编译器
pnpm add -g scriptc

# 类型检查需要 node 的类型声明（process / setTimeout / fs），装仓库根一份即可
cd .. && pnpm add -D @types/node

# 推荐：仓库根的 Makefile 把共享模块列进了依赖，改 ../pinger/*.ts 也能触发重编
cd .. && make claude        # make 全部编；make check 跑自检

# 手动等价写法：直接跑（编译 + 执行）
scriptc run pinger.ts -- 20s

# 打包为二进制
scriptc build pinger.ts -o pinger
./pinger 20s
```

不加 `-o` 时产物落在 `.scriptc/` 目录下。

看一眼哪些语句走静态编译、哪些需要动态引擎：

```bash
scriptc coverage pinger.ts
```

### 交叉编译

```bash
# Linux x86_64
SCRIPTC_CC=zigcc SCRIPTC_TARGET=x86_64-linux-gnu.2.36 scriptc build pinger.ts -o pinger-linux-x64

# Linux arm64
SCRIPTC_CC=zigcc SCRIPTC_TARGET=aarch64-linux-gnu.2.36 scriptc build pinger.ts -o pinger-linux-arm64
```

需要先装 zig（`brew install zig`）。

## 常驻运行

```bash
nohup ./pinger 20s >> pinger.log 2>&1 &
```
