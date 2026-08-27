# cf-chat-cron

[English](README.md) | 简体中文

一个 Cloudflare Worker：每天 **UTC+8 07:00:00 – 23:59:59** 期间，**每 20 秒**向 OpenAI 兼容中转站发送一次轻量对话请求 —— 每天约 3,060 次，远低于 Workers 免费额度（10 万次/天）。

## 工作原理

Cloudflare Cron 最小粒度是 1 分钟，因此：

- Cron 表达式 `* * * * *` 每分钟触发一次 `scheduled` 处理
- 处理器先判断当前 UTC+8 时间是否落在 07:00–23:59 窗口内，窗口外直接跳过
- 窗口内每分钟发 **3 次**（第 0s / 20s / 40s，用 `setTimeout` 对齐），跨分钟保持全局 20s 节奏
- 免费版 Cron 有轻微调度抖动，节奏并非绝对精确的 20.000s

请求走 OpenAI **Responses API**（`POST {BASE_URL}/responses`），固定 model 和 Codex 风格的 `User-Agent`。

## 前置要求

- Node.js 18+（建议 LTS）
- pnpm（`corepack enable` 或 `npm i -g pnpm`）
- 一个 Cloudflare 账号（免费版即可，无需信用卡）

## 配置

| 环境变量 | 必填 | 说明 | 存放位置 |
|---|---|---|---|
| `BASE_URL` | 是 | 中转站地址，**以 `/v1` 结尾**（明文；唯一配置处） | `wrangler.jsonc` 的 `vars` |
| `API_KEY` | 是 | 中转站 API Key（保持私密） | `wrangler secret put API_KEY`（不要提交进仓库） |
| `INPUT_TEXT` | 否 | 自定义提示词，缺省时用内置默认值 | `vars` 或 secret |

## 本地测试

```bash
pnpm install
cp .dev.vars.example .dev.vars   # 填入真实 BASE_URL / API_KEY

pnpm dev                          # 启动本地开发服务（带 scheduled 测试端点）
```

开发服务启动后，另开终端：

```bash
# 1) 模拟一次 cron 触发 —— 连发 3 次、间隔 20s。
#    仅当当前时间在 UTC+8 窗口内才真正发送；
#    窗口外日志会显示 "outside window ... skip"（属预期行为）。
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"

# 2) 或单次连通性测试（不判断时间窗口）
curl "http://localhost:8787/"
```

在 wrangler 日志中观察 `status=200`（或中转站实际返回码）。

```bash
pnpm typecheck                    # tsc --noEmit（wrangler dev/deploy 本身不做类型检查）
```

## 部署到 Cloudflare

```bash
# 1) 登录（浏览器 OAuth 授权）
npx wrangler login

# 2) 在 wrangler.jsonc 的 "vars" 里填入明文 BASE_URL，
#    再将 API Key 设为 secret（按提示粘贴）
npx wrangler secret put API_KEY

# 3) 部署
pnpm deploy                       # = wrangler deploy
```

部署后验证：

- **Dashboard** → Workers & Pages → `cf-chat-cron` → **Settings** → **Trigger Events** 查看每次 Cron 执行历史
- **查看历史日志**（无需挂着终端）：Dashboard → `cf-chat-cron` → **Logs** —— 项目已在 `wrangler.jsonc` 开启 observability，日志会保留约 3 天（免费版）
- **实时日志流**：

  ```bash
  pnpm tail                        # = wrangler tail
  ```

## 文件结构

```
wrangler.jsonc        # Worker 配置：Cron 触发器 + BASE_URL 变量
src/index.ts          # Worker 入口：scheduled + fetch 处理器
src/schedule.ts       # 时间窗口判断与每分钟发送节奏
src/api.ts            # Responses API 调用与日志
src/config.ts         # Env 接口与请求常量
.dev.vars.example     # 本地密钥模板（.dev.vars 已 gitignore）
```
