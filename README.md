# vigil

English | [简体中文](README.zh-CN.md)

A Cloudflare Worker that keeps an OpenAI-compatible relay warm, from **07:00:00 to 23:59:59 (UTC+8)** every day, using two cadences that switch automatically.

## How It Works

Cron Triggers have a 1-minute granularity, so the cadence lives in code:

| Line | When | Interval | Purpose |
|---|---|---|---|
| **Activation** | last request failed | **20s** | hammer until the relay wakes up |
| **Keep-alive** | last request succeeded | **2min** | maintain the session cheaply |

Both intervals carry **±10% jitter** so traffic never lands on an exact grid.

The switch needs no external storage. The cron fires every minute, but only **even minutes start a block**, and a block owns the full 2 minutes:

```
[even minute T]  block starts
  ├─ request → fail → wait ~20s
  ├─ request → fail → wait ~20s
  ├─ request → OK   → return immediately
[T+2min]  next block, decides again
```

Succeeding ends the block early, so the next request is the next block — that *is* the 2-minute cadence. Failing keeps retrying at 20s (up to 6 attempts). A block's last attempt (~100s) and the next block's first (120s) are still ~20s apart, so the rhythm stays continuous.

Attempts are pinned to absolute offsets from the block start, not `sleep(20s)` after each request — otherwise every request's latency would push the schedule later and later.

Requests use the OpenAI **Responses API** (`POST {BASE_URL}/responses`).

**Volume:** ~510 requests/day when healthy (vs ~3,060 if constantly failing) — well inside the free tier's 100k/day.

## Email Notifications

When the relay comes back after failing, you get an "activation succeeded" email via [Resend](https://resend.com). Capped at **5 per UTC+8 day**.

Recovery means the request succeeded **and** either it failed earlier in this block, or the previous block ended down. The second condition matters: without it, a relay that recovers between two blocks would be missed.

This is the one part that needs persistence — a daily counter cannot be stateless — so it uses a small KV namespace. The cadence itself remains stateless.

## Status Page

The Worker serves a **public**, server-rendered status page at `/`: current state, 24-hour and 7-day uptime, average and P95 latency, a 168-cell hourly availability strip, and the last 60 probes. It refreshes itself every 60 seconds and is edge-cached for 30.

| Route | What it does |
|---|---|
| `GET /` | the status page |
| `GET /api/status` | the same data as JSON |
| `GET /trigger?t=<token>` | manual one-shot probe, needs `TRIGGER_TOKEN` |
| `GET /pause?t=<token>&m=<minutes>` | stand the automatic cadence down, needs `TRIGGER_TOKEN` |
| `GET /resume?t=<token>` | lift a pause early, needs `TRIGGER_TOKEN` |

Probes land in D1 as **one batched insert per block**, not one write per request — the latter would put storage latency inside a retry loop that is pinned to absolute offsets. Rows are kept for 7 days; the first block of each day sweeps the rest.

> Since probing only runs 07:00–23:59 (UTC+8), the strip has a 7-hour gap every night. Those cells render as a neutral grey "outside window", distinct from both "no data" and "down".

The page renders **no** `BASE_URL`, no credentials, and no slice of the relay's response. `/trigger` fails closed: with no `TRIGGER_TOKEN` configured it simply 404s, so a public deployment can never be used to burn your relay quota.

## Pause & Resume

Sometimes you need the pings to stop for a while — the relay is under maintenance, you are debugging it by hand, or you would rather not have recovery emails firing during a known outage.

```bash
curl "https://<worker>/pause?t=$TRIGGER_TOKEN&m=90"   # 90 minutes
curl "https://<worker>/pause?t=$TRIGGER_TOKEN"        # defaults to 60
curl "https://<worker>/resume?t=$TRIGGER_TOKEN"       # lift it early
```

**Every pause expires.** `m` is capped at 24 hours and there is no way to ask for an open-ended one. That is deliberate: the whole point of this Worker is that the relay never goes cold, so a pause you forget about must not be able to silence it indefinitely. If you genuinely need a longer stand-down, remove the cron trigger — that is a deploy-level decision, and it should look like one.

A few properties worth knowing:

- **`/trigger` still works while paused.** A pause suppresses *scheduled* traffic; an explicit one-shot probe is you asking on purpose, and it is the natural way to check whether whatever you paused for is over.
- **It fails open.** If KV is unreachable when the gate is checked, the Worker probes anyway. Sending a request we meant to skip costs one request; going quietly dark on a storage blip costs the thing this Worker exists to protect.
- **The page says so.** While paused, `/` shows a `Paused` badge, a banner with the resume time, and a parked radar; the affected cells in the trend strip read "paused" rather than "no data". `/api/status` carries the same under a `pause` field.
- **Recovery email still fires afterwards.** If you pause while the relay is down and it is healthy when probing resumes, that counts as a recovery and you get the email. The gap does not make it less true.

## Prerequisites

- Node.js 18+ (LTS recommended)
- pnpm (`corepack enable` or `npm i -g pnpm`)
- A Cloudflare account (free plan is enough)
- A [Resend](https://resend.com) account for email notifications

## Configuration

| Variable | Required | Description | Where to set |
|---|---|---|---|
| `BASE_URL` | Yes | Relay base URL, **ending with `/v1`** | `wrangler.jsonc` `vars` |
| `MAIL_FROM` | Yes | Sender address | `wrangler.jsonc` `vars` |
| `API_KEY` | Yes | Relay API key | `wrangler secret put API_KEY` |
| `RESEND_API_KEY` | Yes | Resend API key | `wrangler secret put RESEND_API_KEY` |
| `MAIL_TO` | Yes | Notification recipient | `wrangler secret put MAIL_TO` |
| `INPUT_TEXT` | No | Custom prompt; falls back to a built-in default | `vars` or secret |
| `TRIGGER_TOKEN` | No | Unlocks `GET /trigger`, `/pause` and `/resume`; they 404 without it | `wrangler secret put TRIGGER_TOKEN` |
| `VIGIL_STATE` | Yes | KV binding for the email counter and the pause record | `wrangler.jsonc` `kv_namespaces` |
| `DB` | Yes | D1 binding for the status page's probe history | `wrangler.jsonc` `d1_databases` |

> ⚠️ With Resend's shared `onboarding@resend.dev` sender, you can **only send to your own Resend account email**. To notify any other address, verify a domain in Resend first.

Types for these bindings are generated by `wrangler types` into `worker-configuration.d.ts` — never hand-write the `Env` interface, and re-run it after changing `wrangler.jsonc`.

## Local Testing

```bash
pnpm install
cp .dev.vars.example .dev.vars   # then fill in your real values

npx wrangler d1 migrations apply vigil --local   # create the local table

pnpm dev                          # local dev server with scheduled testing
```

From another terminal:

```bash
# Open the status page
open http://localhost:8787/

# Simulate a cron tick. Must be an even minute, and inside the UTC+8 window,
# or the handler returns immediately by design.
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"

# Single connectivity check (ignores window and cadence); needs TRIGGER_TOKEN
curl "http://localhost:8787/trigger?t=$TRIGGER_TOKEN"

# Pause the scheduled cadence, then lift it again
curl "http://localhost:8787/pause?t=$TRIGGER_TOKEN&m=5"
curl "http://localhost:8787/resume?t=$TRIGGER_TOKEN"

# Cross-check what the page shows
npx wrangler d1 execute vigil --local \
  --command "SELECT * FROM checks ORDER BY ts DESC LIMIT 10"
```

Watch the wrangler logs. Each block ends with a summary line:

```
block done outcome=ok failures=2 recovered=true emails=1
```

To exercise the **activation line**, point `BASE_URL` at an invalid host and restart `pnpm dev` (it does not hot-reload `.dev.vars`) — you should see retries about 20s apart. Point it back at a working URL and the next block logs `recovered=true`.

```bash
pnpm typecheck                    # regenerates types, then tsc --noEmit
```

## Deploy to Cloudflare

```bash
# 1) Log in
npx wrangler login

# 2) Create the KV namespace, then put the returned id in wrangler.jsonc
npx wrangler kv namespace create VIGIL_STATE

# 3) Create the D1 database, put the returned database_id in wrangler.jsonc,
#    then create the table
npx wrangler d1 create vigil
npx wrangler d1 migrations apply vigil --remote

# 4) Secrets
npx wrangler secret put API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAIL_TO
npx wrangler secret put TRIGGER_TOKEN   # optional, only for /trigger

# 5) Deploy
pnpm deploy
```

Verify after deploying:

- **Status page**: open the Worker's workers.dev URL
- **Dashboard** → Workers & Pages → `vigil` → **Settings** → **Trigger Events** for cron history
- **Historical logs**: Dashboard → `vigil` → **Logs** (observability is enabled; ~3 days on the free plan)
- **Live logs**: `pnpm tail`

## Project Structure

```
wrangler.jsonc        # cron trigger, vars, KV + D1 bindings, observability
migrations/           # D1 schema
src/index.ts          # entry: cron handler + status page and control routes
src/schedule.ts       # the adaptive block — cadence, jitter, pause gate, recovery rule
src/api.ts            # Responses API call; returns success + latency
src/db.ts             # D1: probe writes, retention sweep, dashboard queries
src/ui.ts             # the status page HTML (server-rendered)
src/mailer.ts         # Resend notification
src/state.ts          # KV: last outcome + daily email counter, and the pause record
src/config.ts         # request and page constants (Env is generated)
.dev.vars.example     # template for local secrets
```

`.agents/skills/` holds the pinned [`workers-best-practices`](https://skills.sh/cloudflare/skills/workers-best-practices) skill, tracked in `skills-lock.json`.
