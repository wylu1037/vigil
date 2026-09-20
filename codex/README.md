# pinger

定时向 relay 发探测请求的命令行程序，用 [scriptc](https://scriptc.dev/) 编译为原生二进制（不依赖 Node 运行时）。

本目录的 [pinger.ts](pinger.ts) 只描述「OpenAI Responses API 长什么样」（URL、头、body）；参数解析、`.env`、发送、计时、循环、退出码全在共享模块 [../pinger/](../pinger/)：

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
| `VIGIL_CODEX_BASE_URL` | relay 地址，**带** `/v1`（程序在其后拼 `/responses`） |
| `VIGIL_CODEX_API_KEY` | `Authorization: Bearer` 的值 |

两者都放**程序工作目录**下的 `.env`（已 gitignore，模板见 [.env.example](.env.example)）：

```bash
cp .env.example .env && vi .env
```

优先级与 dotenv 一致：**真实环境变量 > `.env` 文件**。原生二进制没有 Node 的 `--env-file` 开关，程序自己用 `node:fs` 读 `.env`（scriptc 静态编译支持，不需要 dotenv 依赖）。缺变量时直接报错退出（exit 2），不会拿空 key 去请求。

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
cd .. && make codex        # make 全部编；make check 跑自检

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
