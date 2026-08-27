# cf-chat-cron

English | [简体中文](README.zh-CN.md)

A Cloudflare Worker that sends a lightweight chat request to an OpenAI-compatible relay **every 20 seconds**, from **07:00:00 to 23:59:59 (UTC+8)** every day — roughly 3,060 requests/day, well within the Workers free tier (100k/day).

## How It Works

Cloudflare Cron Triggers have a 1-minute granularity, so:

- The cron expression `* * * * *` fires the `scheduled` handler every minute
- The handler checks the current UTC+8 time; outside the 07:00–23:59 window it skips immediately
- Inside the window it sends **3 requests per minute** (at 0s / 20s / 40s, aligned with `setTimeout`), keeping a global 20s cadence across minutes
- Slight scheduling jitter on the free plan means the rhythm is not a perfectly exact 20.000s

Requests use the OpenAI **Responses API** (`POST {BASE_URL}/responses`) with a fixed model and a Codex-style `User-Agent`.

## Prerequisites

- Node.js 18+ (LTS recommended)
- pnpm (`corepack enable` or `npm i -g pnpm`)
- A Cloudflare account (the free plan is enough; no credit card required)

## Configuration

| Variable | Required | Description | Where to set |
|---|---|---|---|
| `BASE_URL` | Yes | Relay base URL, **ending with `/v1`** (plaintext; the only place it lives) | `wrangler.jsonc` `vars` |
| `API_KEY` | Yes | Relay API key (kept private) | `wrangler secret put API_KEY` (never commit it) |
| `INPUT_TEXT` | No | Custom prompt; falls back to a built-in default | `vars` or secret |

## Local Testing

```bash
pnpm install
cp .dev.vars.example .dev.vars   # then fill in your real BASE_URL / API_KEY

pnpm dev                          # starts local dev server with scheduled testing enabled
```

With the dev server running, from another terminal:

```bash
# 1) Simulate a cron tick — fires 3 requests 20s apart.
#    Only actually sends if the current time is inside the UTC+8 window;
#    otherwise the log shows "outside window ... skip" (expected).
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"

# 2) Or a single connectivity check (ignores the time window)
curl "http://localhost:8787/"
```

Watch the wrangler logs for `status=200` (or whatever your relay returns).

```bash
pnpm typecheck                    # tsc --noEmit (wrangler dev/deploy do not type-check)
```

## Deploy to Cloudflare

```bash
# 1) Log in (opens a browser for OAuth)
npx wrangler login

# 2) Set BASE_URL as a plaintext var in wrangler.jsonc ("vars" section),
#    then set the API key as a secret (paste when prompted)
npx wrangler secret put API_KEY

# 3) Deploy
pnpm deploy                       # = wrangler deploy
```

After deploying, verify:

- **Dashboard** → Workers & Pages → `cf-chat-cron` → **Settings** → **Trigger Events** shows the cron execution history
- **View historical logs** (no need to keep a terminal open): Dashboard → `cf-chat-cron` → **Logs** — observability is enabled in `wrangler.jsonc`, so logs are retained there for ~3 days on the free plan
- **Live streaming logs**:

  ```bash
  pnpm tail                        # = wrangler tail
  ```

## Project Structure

```
wrangler.jsonc        # Worker config: cron trigger + BASE_URL var
src/index.ts          # Worker entry: scheduled + fetch handlers
src/schedule.ts       # time-window check and per-minute send cadence
src/api.ts            # Responses API call and logging
src/config.ts         # Env interface and request constants
.dev.vars.example     # template for local secrets (.dev.vars is gitignored)
```
