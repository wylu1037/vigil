// Server-rendered status page.
//
// Everything the page shows comes from one D1 read, so there is no client
// rendering to keep in sync — a <meta refresh> reloads it instead.
//
// The page is public: it must never render BASE_URL, credentials, or any
// slice of the relay's response body.

import { HOUR_MS, MODEL_ID, RANGES, SITE_TITLE, UTC8_OFFSET_MS } from "./config";
import type { Bucket, DashboardData } from "./db";
import type { Pause } from "./state";

// What the page renders: the D1 dashboard plus the one piece of state that
// does not come from D1. Kept here rather than on DashboardData so db.ts
// stays purely about the probe store.
export interface DashboardView extends DashboardData {
  pause: Pause | null;
}

const REFRESH_SECONDS = 60;

// Send window, mirrored from schedule.ts — hours outside it have no
// probes by design and must not be painted as downtime.
const WINDOW_START_HOUR = 7;
const WINDOW_END_HOUR = 23;

const escape = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string
  );

// UTC+8 wall clock. The offset is a whole number of hours, so shifting the
// instant and reading UTC fields is exact.
const shifted = (ms: number) => new Date(ms + UTC8_OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, "0");

function fmtDateTime(ms: number): string {
  const d = shifted(ms);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function fmtHour(ms: number): string {
  const d = shifted(ms);
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`;
}

function fmtMinute(ms: number): string {
  const d = shifted(ms);
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const utc8HourOfDay = (ms: number) => shifted(ms).getUTCHours();

const inWindow = (ms: number) => {
  const h = utc8HourOfDay(ms);
  return h >= WINDOW_START_HOUR && h <= WINDOW_END_HOUR;
};

// A cell may straddle the window boundary, so it only counts as idle when
// the whole bucket is outside. Checking both ends is enough: every bucket
// is at most 2h wide, far shorter than the 17h in-window stretch, so an
// in-window instant can never hide strictly between two out-of-window ends.
const bucketIsIdle = (start: number, width: number) =>
  !inWindow(start) && !inWindow(start + width - 1);

// Rough remaining time, for the pause banner: "3d 4h", "2h 15m", "45m".
// Two units is as far as it goes — the banner prints the exact resume time
// next to this, so all this has to carry is the scale.
function fmtLeft(ms: number): string {
  if (ms < 60_000) return "under a minute";
  const mins = Math.round(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function pct(up: number, total: number): string {
  if (total === 0) return "—";
  return `${((up / total) * 100).toFixed(2)}%`;
}

const ms = (v: number | null) => (v == null ? "—" : `${v} ms`);

interface Cell {
  color: string;
  title: string;
}

function buildCells(data: DashboardView): Cell[] {
  const { bucketMs, spanMs } = data.range;
  const byBucket = new Map<number, Bucket>(
    data.buckets.map((b) => [b.bucket, b])
  );
  const current = Math.floor(data.generatedAt / bucketMs);
  const count = Math.round(spanMs / bucketMs);
  // Sub-hour buckets need the minutes spelled out to be readable.
  const fmt = bucketMs < HOUR_MS ? fmtMinute : fmtHour;
  const cells: Cell[] = [];

  // Only the pause in effect right now is known — there is no history of
  // past ones — and a bucket must be *wholly* inside it to count. A short
  // pause inside a wide bucket leaves the bucket as plain "no data", which
  // is the honest reading: something else was missing too.
  const p = data.pause;
  const bucketIsPaused = (start: number, width: number) =>
    p !== null && p.since <= start && start + width - 1 <= p.until;

  for (let i = count - 1; i >= 0; i--) {
    const idx = current - i;
    const startMs = idx * bucketMs;
    const label = fmt(startMs);
    const b = byBucket.get(idx);

    if (!b || b.total === 0) {
      // Window first: hours outside it were never going to have probes,
      // pause or no pause.
      if (bucketIsIdle(startMs, bucketMs)) {
        cells.push({ color: "var(--c-idle)", title: `${label} · outside window` });
      } else if (bucketIsPaused(startMs, bucketMs)) {
        cells.push({ color: "var(--c-idle)", title: `${label} · paused` });
      } else {
        cells.push({ color: "var(--c-missing)", title: `${label} · no data` });
      }
      continue;
    }

    const ratio = b.up / b.total;
    const color =
      ratio >= 0.99
        ? "var(--c-up)"
        : ratio >= 0.9
          ? "var(--c-warn)"
          : ratio >= 0.5
            ? "var(--c-degraded)"
            : "var(--c-down)";

    cells.push({
      color,
      title: `${label} · ${b.up}/${b.total} · ${(ratio * 100).toFixed(1)}%`,
    });
  }

  return cells;
}

// Decorative sweeping radar, shown beside the title. Purely presentational:
// aria-hidden so it stays out of the accessibility tree, and it reads no
// probe data — the sweep runs at a fixed rate whatever the relay is doing.
// The one exception is a pause, where a sweeping radar would claim we are
// still watching; it parks instead, at the same angle reduced-motion uses.
// Wedge paths are pre-computed (SVG has no conic gradient), and each blip is
// delayed by its own bearing so it flares as the leading edge crosses it.
// Source: https://circleloaders.dominikakissi.com/#radar
function radar(paused: boolean): string {
  const wedges = Array.from({ length: 36 }, (_, i) => {
    const a0 = ((i * 2.5 - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * 2.5 - 90) * Math.PI) / 180;
    const p = (a: number) =>
      `${(32 + 31.5 * Math.cos(a)).toFixed(2)},${(32 + 31.5 * Math.sin(a)).toFixed(2)}`;
    // Quartic falloff: the trailing edge fades fast, the head stays bright.
    const opacity = (((i + 1) / 36) ** 4 * 0.85).toFixed(3);
    return `<path d="M32,32L${p(a0)}A31.5,31.5 0 0,1 ${p(a1)}Z" fill="currentColor" opacity="${opacity}"/>`;
  }).join("");

  const blips = [
    [49.15, 18.6, 52],
    [39.12, 43.4, 148],
    [17.68, 53.22, 214],
    [18.27, 20.48, 310],
  ]
    .map(
      ([cx, cy, bearing]) =>
        `<circle class="rad-blip" cx="${cx}" cy="${cy}" r="2" style="--bearing:${bearing}"/>`
    )
    .join("");

  return `<svg class="rad${paused ? " rad-off" : ""}" viewBox="0 0 64 64" width="44" height="44" fill="none" aria-hidden="true" focusable="false">
    <defs><clipPath id="rad-disc"><circle cx="32" cy="32" r="32"/></clipPath></defs>
    <circle class="rad-ring" cx="32" cy="32" r="31.5"/>
    <circle class="rad-ring" cx="32" cy="32" r="15"/>
    <line class="rad-cross" x1="0.5" y1="32" x2="63.5" y2="32"/>
    <line class="rad-cross" x1="32" y1="0.5" x2="32" y2="63.5"/>
    <g clip-path="url(#rad-disc)"><g class="rad-sweep">${wedges}</g></g>
    ${blips}
  </svg>`;
}

function statusBadge(data: DashboardView): string {
  // Pause outranks everything else: it is the one state a human caused on
  // purpose, and it explains the missing data that the other branches
  // would otherwise report as an outage.
  if (data.pause) {
    return `<span class="badge badge-paused">Paused</span>`;
  }
  if (data.degraded) {
    return `<span class="badge badge-unknown">Storage error</span>`;
  }
  if (!data.last) {
    return `<span class="badge badge-unknown">No data</span>`;
  }
  return data.last.ok
    ? `<span class="badge badge-up">Operational</span>`
    : `<span class="badge badge-down">Down</span>`;
}

// The badge alone cannot say when probing comes back, and that is the only
// question a paused page raises.
function pauseBanner(data: DashboardView): string {
  if (!data.pause) return "";
  const { until } = data.pause;
  return `
  <div class="banner">
    Probing is paused until <b>${escape(fmtDateTime(until))}</b> UTC+8
    — about ${escape(fmtLeft(until - data.generatedAt))} left. The cadence
    resumes on its own; no probes are being recorded until then.
  </div>`;
}

function card(label: string, value: string, hint = ""): string {
  return `
    <div class="card">
      <div class="card-label">${escape(label)}</div>
      <div class="card-value">${value}</div>
      ${hint ? `<div class="card-hint">${escape(hint)}</div>` : ""}
    </div>`;
}

// Plain links, so switching ranges stays a server round trip and each
// range gets its own edge cache entry.
function rangeTabs(data: DashboardView): string {
  return RANGES.map(
    (r) =>
      `<a class="tab${r.key === data.range.key ? " is-on" : ""}" href="/?r=${escape(r.key)}">${escape(r.label)}</a>`
  ).join("");
}

export function renderDashboard(data: DashboardView): string {
  const cells = buildCells(data)
    .map(
      (c) =>
        `<i class="cell" style="background:${c.color}" title="${escape(c.title)}"></i>`
    )
    .join("");

  const rows = data.recent
    .map(
      (p) => `
      <tr>
        <td class="mono">${escape(fmtDateTime(p.ts))}</td>
        <td class="mid"><span class="dot ${p.ok ? "dot-up" : "dot-down"}" title="${p.ok ? "OK" : "Failed"}"></span></td>
        <td class="mono mid">${p.status === 0 ? "network error" : p.status}</td>
        <td class="mono num">${p.latencyMs} ms</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>${escape(SITE_TITLE)} · Relay uptime</title>
<style>
  :root {
    --bg: #0d1117; --panel: #151b23; --line: #232c37;
    --fg: #e6edf3; --muted: #8b949e;
    --c-up: #22c55e; --c-warn: #84cc16; --c-degraded: #f59e0b;
    --c-down: #ef4444; --c-missing: #6b7280; --c-idle: #262c33;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px; background: var(--bg); color: var(--fg);
    font: 14px/1.6 -apple-system, "Segoe UI", Roboto, "PingFang SC",
          "Microsoft YaHei", sans-serif;
  }
  .wrap { max-width: 960px; margin: 0 auto; }
  header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  /* Radar emblem. --rate scales every duration at once. */
  .rad { color: var(--c-up); --dur: 2.8s; --rate: 1; align-self: center; flex: none; }
  .rad-ring { stroke: currentColor; stroke-width: 1; opacity: .16; }
  .rad-cross { stroke: currentColor; stroke-width: 1; opacity: .13; }
  .rad-sweep {
    transform-box: view-box; transform-origin: center;
    animation: rad-sweep calc(var(--dur) * var(--rate)) linear infinite;
  }
  .rad-blip {
    fill: currentColor; transform-box: fill-box; transform-origin: center;
    opacity: 0;
    animation: rad-blip calc(var(--dur) * var(--rate)) ease-out infinite;
    animation-delay: calc(var(--bearing) / 360 * var(--dur) * var(--rate));
  }
  @keyframes rad-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes rad-blip {
    0%   { opacity: 1; transform: scale(1.25); }
    45%  { opacity: .35; transform: scale(1); }
    100% { opacity: 0; transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .rad-sweep { animation: none; transform: rotate(214deg); }
    .rad-blip { animation: none; opacity: .7; }
  }
  /* Parked radar: probing is paused, so the sweep must not imply otherwise. */
  .rad-off { color: var(--c-degraded); }
  .rad-off .rad-sweep { animation: none; transform: rotate(214deg); }
  .rad-off .rad-blip { animation: none; opacity: .45; }
  h1 { margin: 0; font-size: 22px; letter-spacing: .3px; }
  .sub { color: var(--muted); font-size: 13px; }
  .manage { margin-left: auto; color: var(--muted); font-size: 13px; text-decoration: none; }
  .manage:hover { color: var(--fg); }
  .badge {
    display: inline-block; padding: 2px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 600;
  }
  .badge-up { background: rgba(34,197,94,.15); color: var(--c-up); }
  .badge-down { background: rgba(239,68,68,.15); color: var(--c-down); }
  .badge-unknown { background: rgba(139,148,158,.15); color: var(--muted); }
  .badge-paused { background: rgba(245,158,11,.15); color: var(--c-degraded); }
  .banner {
    margin-top: 18px; padding: 11px 14px; border-radius: 8px;
    background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.28);
    color: var(--c-degraded); font-size: 13px; line-height: 1.6;
  }
  .banner b { color: var(--fg); font-weight: 600; }
  .grid {
    display: grid; gap: 12px; margin: 24px 0;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
  .card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 14px 16px;
  }
  .card-label { color: var(--muted); font-size: 12px; }
  .card-value { font-size: 22px; font-weight: 600; margin-top: 4px; }
  .card-hint { color: var(--muted); font-size: 11px; margin-top: 2px; }
  .panel {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 18px 20px; margin-bottom: 20px;
  }
  .panel h2 { margin: 0 0 14px; font-size: 14px; font-weight: 600; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 24px 0 12px; }
  .tab {
    padding: 4px 12px; border-radius: 999px; font-size: 12px;
    color: var(--muted); text-decoration: none;
    border: 1px solid var(--line); background: var(--panel);
  }
  .tab:hover { color: var(--fg); }
  .tab.is-on { color: var(--fg); border-color: var(--c-up); background: rgba(34,197,94,.12); }
  .strip { display: flex; gap: 2px; align-items: stretch; }
  .cell { flex: 1 1 0; min-width: 2px; height: 38px; border-radius: 2px; }
  .axis {
    display: flex; justify-content: space-between;
    color: var(--muted); font-size: 11px; margin-top: 8px;
  }
  .legend {
    display: flex; gap: 16px; flex-wrap: wrap;
    color: var(--muted); font-size: 11px; margin-top: 12px;
  }
  .legend i { display: inline-block; width: 10px; height: 10px;
              border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 500; font-size: 12px; }
  tbody tr:last-child td { border-bottom: none; }
  .num { text-align: right; }
  .mid { text-align: center; }
  .mono { font-family: Menlo, Consolas, monospace; font-size: 12px; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
         vertical-align: 1px; }
  .dot-up { background: var(--c-up); }
  .dot-down { background: var(--c-down); }
  .empty { color: var(--muted); padding: 20px 0; text-align: center; }
  footer { color: var(--muted); font-size: 12px; line-height: 1.8; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    ${radar(!!data.pause)}
    <h1>${escape(SITE_TITLE)}</h1>
    ${statusBadge(data)}
    <span class="sub">${escape(MODEL_ID)}</span>
    <a class="manage" href="/admin">Manage →</a>
  </header>
  ${pauseBanner(data)}

  <div class="tabs">${rangeTabs(data)}</div>

  <div class="grid">
    ${card(`${data.range.label} uptime`, pct(data.tally.up, data.tally.total))}
    ${card("Probes", String(data.tally.total), "this range")}
    ${card("Avg latency", ms(data.avgMs), "this range, successful only")}
    ${card("P95 latency", ms(data.p95Ms), "this range, successful only")}
    ${card("Last probe", data.last ? escape(fmtDateTime(data.last.ts)) : "—", "UTC+8")}
  </div>

  <div class="panel">
    <h2>Uptime · last ${escape(data.range.label)}</h2>
    <div class="strip">${cells}</div>
    <div class="axis"><span>${escape(data.range.label)} ago</span><span>now</span></div>
    <div class="legend">
      <span><i style="background:var(--c-up)"></i>≥99%</span>
      <span><i style="background:var(--c-warn)"></i>≥90%</span>
      <span><i style="background:var(--c-degraded)"></i>≥50%</span>
      <span><i style="background:var(--c-down)"></i>&lt;50%</span>
      <span><i style="background:var(--c-missing)"></i>no data</span>
      <span><i style="background:var(--c-idle)"></i>${data.pause ? "outside window / paused" : "outside window"}</span>
    </div>
  </div>

  <div class="panel">
    <h2>Recent probes</h2>
    ${
      rows
        ? `<table>
      <thead><tr><th>Time (UTC+8)</th><th class="mid">Result</th><th class="mid">Status</th><th class="num">Latency</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
        : `<div class="empty">No data yet</div>`
    }
  </div>

  <footer>
    Auto-refreshes every ${REFRESH_SECONDS}s · ${escape(fmtDateTime(data.generatedAt))}
  </footer>
</div>
</body>
</html>`;
}
