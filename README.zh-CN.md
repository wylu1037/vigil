# vigil

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

## 状态页

Worker 根路径 `/` 提供一个**公开的**服务端渲染状态页：当前状态、24 小时 / 7 天可用率、平均与 P95 延迟、一条按小时着色的 168 格可用性趋势条，以及最近 60 次探测明细。页面每 60 秒自动刷新，边缘缓存 30 秒。

| 路由 | 说明 |
|---|---|
| `GET /` | 状态页 HTML |
| `GET /api/status` | 同一份数据的 JSON |
| `GET /admin` | 暂停 / 恢复管理页面 |
| `GET /api/admin/status` | 当前暂停状态，无缓存，需 `TRIGGER_TOKEN` |
| `GET /trigger?t=<token>` | 手动单次探测，需 `TRIGGER_TOKEN` |
| `GET /pause?t=<token>&for=<时长>` | 暂停自动节奏，需 `TRIGGER_TOKEN` |
| `GET /resume?t=<token>` | 提前解除暂停，需 `TRIGGER_TOKEN` |

探测数据写入 D1：每个块结束时**一次性批量插入**全部尝试，而不是每次请求各写一次 —— 后者会把存储延迟塞进那条按绝对偏移对齐的重试循环。保留 7 天，每天首个块顺带清理过期行。

> 因为探测只在 UTC+8 07:00–23:59 进行，趋势条每天必有 7 小时空档。这些格子渲染为中性灰"窗口外"，与真正的"无数据"和"不可用"三色分明。

页面**不渲染** `BASE_URL`、任何密钥或中转站响应体。`/trigger` 默认失效：未配置 `TRIGGER_TOKEN` 时直接 404，公开部署无法被用来消耗你的中转站额度。

## 管理页面

打开 `/admin`（或点击状态页右上角的 **Manage →**），输入部署时配置的 `TRIGGER_TOKEN` 并连接，即可：

- 查看当前是否暂停、暂停开始时间、自动恢复时间（UTC+8）及剩余倒计时。
- 选择 30 分钟、1 小时、6 小时、1 天的快捷时长，或输入自定义整数分钟 / 小时 / 天，最长 30 天。
- 点击「Pause」或「Resume」，直接查看操作结果；请求期间按钮禁用，避免重复提交。
- 手动刷新状态，或断开连接清除令牌。刷新页面后需要重新输入令牌。

管理页面本身不包含密钥，可以公开访问；读取管理状态及执行操作仍需通过令牌验证，未配置或令牌错误均返回 404。令牌只保存在当前页面内存中，通过 `Authorization: Bearer <token>` 请求头发送，不写入 URL 或浏览器存储。

页面调用 `POST /pause?for=<时长>` 和 `POST /resume`，并通过 `Accept: application/json` 获取 `{ pause, generatedAt }`。操作成功后直接展示已写入的状态，不依赖公开状态页的 30 秒缓存；管理页面及管理接口均返回 `Cache-Control: no-store`。原有 GET 端点、`?t=` 鉴权和纯文本响应保持兼容。KV 跨节点同步仍可能有延迟，且暂停不会取消已经开始的探测块。

## 暂停与恢复

有时需要让探测停一会儿：中转站在维护、你正在手动调试它，或者只是不想在一次已知故障期间被恢复邮件轰炸。

```bash
curl "https://<worker>/pause?t=$TRIGGER_TOKEN&for=90m" # 暂停 90 分钟
curl "https://<worker>/pause?t=$TRIGGER_TOKEN&for=2h"  # 暂停 2 小时
curl "https://<worker>/pause?t=$TRIGGER_TOKEN"        # 不传 for 则默认 60 分钟
curl "https://<worker>/resume?t=$TRIGGER_TOKEN"       # 提前恢复
```

**任何暂停都必然到期。** `for` 接受整数加可选的 `m`/`h`/`d` 后缀（纯数字按分钟算），上限 30 天，且没有"无限期暂停"这个选项。这是有意为之：这个 Worker 存在的全部意义就是不让中转站冷掉，那么一次被遗忘的暂停就绝不能把它永久静音。真需要更长时间的停机，就去掉 cron 触发器 —— 那本就是部署级别的决定，也该长得像一个部署级别的决定。

几个值得知道的性质：

- **暂停期间 `/trigger` 依然可用。** 暂停压制的是*定时*流量；显式的单次探测是你主动发起的，而且它正是用来确认"暂停的理由是否已经消失"的顺手工具。
- **失败方向是继续探测。** 如果查询闸门时 KV 不可达，Worker 会照常发探测。多发一次本该跳过的请求，代价是一次请求；而因为一次存储抖动就悄悄停摆，代价是这个 Worker 要保护的东西本身。
- **页面会明说。** 暂停期间 `/` 会显示 `Paused` 徽章、写明恢复时间的横幅，以及一个停转的雷达；趋势条上受影响的格子标注为"paused"而非"no data"。`/api/status` 里对应 `pause` 字段。
- **恢复邮件之后照发。** 如果你在中转站不可用时暂停，恢复探测后它已经健康，这仍然算一次"活性恢复"，邮件照发。中间那段空档并不会让这个判断变得不成立。

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
| `TRIGGER_TOKEN` | 否 | 解锁管理操作、`/api/admin/status`、`/trigger`、`/pause`、`/resume`，不设则这些接口 404 | `wrangler secret put TRIGGER_TOKEN` |
| `VIGIL_STATE` | 是 | 邮件计数与暂停记录用的 KV 绑定 | `wrangler.jsonc` 的 `kv_namespaces` |
| `DB` | 是 | 状态页探测数据的 D1 绑定 | `wrangler.jsonc` 的 `d1_databases` |

> ⚠️ 使用 Resend 公共发件地址 `onboarding@resend.dev` 时，**只能发给你自己 Resend 账号的注册邮箱**。要发给其他地址，需先在 Resend 验证自有域名。

这些绑定的类型由 `wrangler types` 生成到 `worker-configuration.d.ts` —— **不要手写 `Env` 接口**，改动 `wrangler.jsonc` 后重新执行即可。

## 本地测试

```bash
pnpm install
cp .dev.vars.example .dev.vars   # 填入真实值

npx wrangler d1 migrations apply vigil --local   # 建本地表

pnpm dev                          # 本地服务（带 scheduled 测试端点）
```

另开终端：

```bash
# 打开状态页
open http://localhost:8787/

# 打开管理页面，输入 TRIGGER_TOKEN 后可暂停 / 恢复
open http://localhost:8787/admin

# 模拟 cron 触发。必须是偶数分钟且在 UTC+8 窗口内，
# 否则处理器会按设计直接返回。
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"

# 单次连通性测试（不判断窗口和节奏），需要 TRIGGER_TOKEN
curl "http://localhost:8787/trigger?t=$TRIGGER_TOKEN"

# 暂停定时节奏，再解除
curl "http://localhost:8787/pause?t=$TRIGGER_TOKEN&for=5m"
curl "http://localhost:8787/resume?t=$TRIGGER_TOKEN"

# 核对页面数字
npx wrangler d1 execute vigil --local \
  --command "SELECT * FROM checks ORDER BY ts DESC LIMIT 10"
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
npx wrangler kv namespace create VIGIL_STATE

# 3) 创建 D1 数据库，把返回的 database_id 填进 wrangler.jsonc，然后建表
npx wrangler d1 create vigil
npx wrangler d1 migrations apply vigil --remote

# 4) 设置 secrets
npx wrangler secret put API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAIL_TO
npx wrangler secret put TRIGGER_TOKEN   # 可选，管理操作及手动探测需要

# 5) 部署
pnpm deploy
```

部署后验证：

- **状态页**：直接打开 Worker 的 workers.dev 地址
- **Dashboard** → Workers & Pages → `vigil` → **Settings** → **Trigger Events** 查看 Cron 执行历史
- **历史日志**：Dashboard → `vigil` → **Logs**（已开启 observability，免费版保留约 3 天）
- **实时日志**：`pnpm tail`

## 文件结构

```
wrangler.jsonc        # Cron 触发器、vars、KV/D1 绑定、observability
migrations/           # D1 建表脚本
src/index.ts          # 入口：cron 处理器 + 状态页与控制路由
src/schedule.ts       # 自适应块 —— 节奏、抖动、暂停闸门、恢复判定
src/api.ts            # Responses API 调用，返回成败 + 延迟
src/db.ts             # D1：探测时序的写入、清理与聚合查询
src/ui.ts             # 状态页 HTML（服务端渲染）
src/admin.ts          # 管理页面 HTML 与暂停 / 恢复交互
src/mailer.ts         # Resend 邮件通知
src/state.ts          # KV：上一块结果 + 每日邮件计数，以及暂停记录
src/config.ts         # 请求与页面常量（Env 是生成的，不手写）
.dev.vars.example     # 本地密钥模板
```

`.agents/skills/` 存放固定版本的 [`workers-best-practices`](https://skills.sh/cloudflare/skills/workers-best-practices) 技能，由 `skills-lock.json` 跟踪。
