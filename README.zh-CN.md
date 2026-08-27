# cf-chat-cron

[English](README.md) | 简体中文

一个 Cloudflare Worker：每天 **UTC+8 07:00:00 – 23:59:59** 期间保持 OpenAI 兼容中转站活跃，两种节奏自动切换。

## 工作原理

Cron 最小粒度是 1 分钟，因此节奏由代码控制：

| 线路 | 触发条件 | 间隔 | 目的 |
|---|---|---|---|
| **激活线路** | 上次请求失败 | **20s** | 高频重试，尽快把中转站打活 |
| **保活线路** | 上次请求成功 | **2min** | 低成本维持会话 |

两种间隔均带 **±10% 抖动**，避免请求落在精确的时间网格上。

线路切换不需要外部存储。Cron 每分钟触发，但**只有偶数分钟开启一个块**，一个块独占完整的 2 分钟：

```
[偶数分钟 T]  块开始
  ├─ 发请求 → 失败 → 等约 20s
  ├─ 发请求 → 失败 → 等约 20s
  ├─ 发请求 → 成功 → 立即返回
[T+2min]  下一块，重新判断
```

成功即提前结束块，所以下次请求就是下一个块 —— 这**天然形成 2 分钟节奏**。失败则在块内按 20s 持续重试（最多 6 次）。块的末次尝试（约 100s）与下一块首次（120s）仍相隔约 20s，节奏连续不断档。

尝试时刻锚定在**相对块开始的绝对偏移**上，而不是每次请求后 `sleep(20s)` —— 否则每个请求的耗时都会把后续计划一路往后推。

请求走 OpenAI **Responses API**（`POST {BASE_URL}/responses`）。

**请求量**：健康时约 510 次/天（持续失败时约 3060 次），远低于免费额度 10 万次/天。

## 邮件通知

中转站从失败中恢复时，通过 [Resend](https://resend.com) 发送"激活成功"邮件，**每个 UTC+8 自然日上限 5 封**。

"恢复"的判定是：请求成功，**且**满足以下之一 —— 本块内先前失败过，或上一个块以失败告终。第二个条件很关键：缺了它，恰好在两个块之间恢复的情况会被漏掉。

这是唯一需要持久化的部分（日计数无法用无状态实现），因此使用了一个很小的 KV namespace。**节奏逻辑本身仍是无状态的**。

## 前置要求

- Node.js 18+（建议 LTS）
- pnpm（`corepack enable` 或 `npm i -g pnpm`）
- 一个 Cloudflare 账号（免费版即可）
- 一个 [Resend](https://resend.com) 账号（用于邮件通知）

## 配置

| 变量 | 必填 | 说明 | 存放位置 |
|---|---|---|---|
| `BASE_URL` | 是 | 中转站地址，**以 `/v1` 结尾** | `wrangler.jsonc` 的 `vars` |
| `MAIL_FROM` | 是 | 发件人地址 | `wrangler.jsonc` 的 `vars` |
| `API_KEY` | 是 | 中转站 API Key | `wrangler secret put API_KEY` |
| `RESEND_API_KEY` | 是 | Resend API Key | `wrangler secret put RESEND_API_KEY` |
| `MAIL_TO` | 是 | 通知收件人 | `wrangler secret put MAIL_TO` |
| `INPUT_TEXT` | 否 | 自定义提示词，缺省时用内置默认值 | `vars` 或 secret |
| `STATE` | 是 | 邮件计数用的 KV 绑定 | `wrangler.jsonc` 的 `kv_namespaces` |

> ⚠️ 使用 Resend 公共发件地址 `onboarding@resend.dev` 时，**只能发给你自己 Resend 账号的注册邮箱**。要发给其他地址，需先在 Resend 验证自有域名。

这些绑定的类型由 `wrangler types` 生成到 `worker-configuration.d.ts` —— **不要手写 `Env` 接口**，改动 `wrangler.jsonc` 后重新执行即可。

## 本地测试

```bash
pnpm install
cp .dev.vars.example .dev.vars   # 填入真实值

pnpm dev                          # 本地服务（带 scheduled 测试端点）
```

另开终端：

```bash
# 模拟 cron 触发。必须是偶数分钟且在 UTC+8 窗口内，
# 否则处理器会按设计直接返回。
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"

# 单次连通性测试（不判断窗口和节奏）
curl "http://localhost:8787/"
```

观察 wrangler 日志，每个块结束时有一行汇总：

```
block done outcome=ok failures=2 recovered=true emails=1
```

要验证**激活线路**：把 `BASE_URL` 改成无效地址并重启 `pnpm dev`（它不会热加载 `.dev.vars`），日志应出现约 20s 一次的重试；再改回有效地址，下一个块会记录 `recovered=true`。

```bash
pnpm typecheck                    # 先重新生成类型，再 tsc --noEmit
```

## 部署到 Cloudflare

```bash
# 1) 登录
npx wrangler login

# 2) 创建 KV namespace，把返回的 id 填进 wrangler.jsonc
npx wrangler kv namespace create STATE

# 3) 设置 secrets
npx wrangler secret put API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAIL_TO

# 4) 部署
pnpm deploy
```

部署后验证：

- **Dashboard** → Workers & Pages → `cf-chat-cron` → **Settings** → **Trigger Events** 查看 Cron 执行历史
- **历史日志**：Dashboard → `cf-chat-cron` → **Logs**（已开启 observability，免费版保留约 3 天）
- **实时日志**：`pnpm tail`

## 文件结构

```
wrangler.jsonc        # Cron 触发器、vars、KV 绑定、observability
src/index.ts          # 入口：窗口 + 偶数分钟判断，然后跑块
src/schedule.ts       # 自适应块 —— 节奏、抖动、恢复判定
src/api.ts            # Responses API 调用，返回成败
src/mailer.ts         # Resend 邮件通知
src/state.ts          # KV：上一块结果 + 每日邮件计数
src/config.ts         # 请求常量（Env 是生成的，不手写）
.dev.vars.example     # 本地密钥模板
```

`.agents/skills/` 存放固定版本的 [`workers-best-practices`](https://skills.sh/cloudflare/skills/workers-best-practices) 技能，由 `skills-lock.json` 跟踪。
