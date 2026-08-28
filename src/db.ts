// D1 access for the status dashboard.
//
// The probe loop must never be disturbed by a storage hiccup, so every
// write here swallows its error and only logs — same posture as state.ts.
// Reads degrade to an empty dashboard rather than a 500.

import type { ProbeResult } from "./api";
import { HOUR_MS, RECENT_LIMIT, RETENTION_DAYS, type RangeSpec } from "./config";

export { HOUR_MS };

export interface RecentProbe {
  ts: number;
  ok: boolean;
  status: number;
  latencyMs: number;
}

export interface Bucket {
  bucket: number; // floor(ts / range.bucketMs)
  total: number;
  up: number;
}

export interface Tally {
  total: number;
  up: number;
}

export interface DashboardData {
  generatedAt: number;
  degraded: boolean; // D1 was unreachable; numbers below are not real
  range: RangeSpec;
  last: RecentProbe | null;
  tally: Tally; // over the selected range
  avgMs: number | null;
  p95Ms: number | null;
  buckets: Bucket[]; // only buckets that actually have probes
  recent: RecentProbe[];
}

const emptyDashboard = (
  now: number,
  range: RangeSpec,
  degraded: boolean
): DashboardData => ({
  generatedAt: now,
  degraded,
  range,
  last: null,
  tally: { total: 0, up: 0 },
  avgMs: null,
  p95Ms: null,
  buckets: [],
  recent: [],
});

interface ProbeRow {
  ts: number;
  ok: number;
  status: number;
  latency_ms: number;
}

const toProbe = (r: ProbeRow): RecentProbe => ({
  ts: r.ts,
  ok: r.ok === 1,
  status: r.status,
  latencyMs: r.latency_ms,
});

// One batch per block, not one write per attempt: inserting inside the
// retry loop would put storage latency on the critical path of a cadence
// that is pinned to absolute offsets.
export async function recordProbes(
  env: Env,
  results: ProbeResult[]
): Promise<void> {
  if (results.length === 0) return;

  const stmt = env.DB.prepare(
    "INSERT INTO checks (ts, ok, status, latency_ms) VALUES (?, ?, ?, ?)"
  );

  try {
    await env.DB.batch(
      results.map((r) => stmt.bind(r.at, r.ok ? 1 : 0, r.status, r.latencyMs))
    );
  } catch (e: unknown) {
    console.error(
      `[${new Date().toISOString()}] probe insert failed: ${String(e)}`
    );
  }
}

// Called once per UTC+8 day, off the back of the counter rollover that
// state.ts already detects.
export async function pruneOld(env: Env, now: number): Promise<void> {
  const cutoff = now - RETENTION_DAYS * 24 * HOUR_MS;
  try {
    const { meta } = await env.DB.prepare(
      "DELETE FROM checks WHERE ts < ?"
    )
      .bind(cutoff)
      .run();
    console.log(
      `[${new Date(now).toISOString()}] pruned ${meta.changes ?? 0} rows older than ` +
        `${RETENTION_DAYS}d`
    );
  } catch (e: unknown) {
    console.error(`[${new Date(now).toISOString()}] prune failed: ${String(e)}`);
  }
}

export async function loadDashboard(
  env: Env,
  now: number,
  range: RangeSpec
): Promise<DashboardData> {
  const since = now - range.spanMs;

  try {
    const [last, tallyRow, latency, buckets, recent] = await env.DB.batch([
      env.DB.prepare(
        "SELECT ts, ok, status, latency_ms FROM checks ORDER BY ts DESC LIMIT 1"
      ),
      env.DB.prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(ok), 0) AS up FROM checks WHERE ts > ?"
      ).bind(since),
      // P95 by offset. SQLite accepts a scalar subquery as the OFFSET
      // expression, so this stays a single round trip.
      env.DB.prepare(
        `SELECT
           (SELECT AVG(latency_ms) FROM checks WHERE ts > ?1 AND ok = 1) AS avg_ms,
           (SELECT latency_ms FROM checks WHERE ts > ?1 AND ok = 1
              ORDER BY latency_ms
              LIMIT 1
              OFFSET MAX((SELECT COUNT(*) FROM checks WHERE ts > ?1 AND ok = 1) * 95 / 100 - 1, 0)
           ) AS p95_ms`
      ).bind(since),
      // bucketMs comes from the RANGES table, never from the request, so
      // interpolating it is safe.
      env.DB.prepare(
        `SELECT ts / ${range.bucketMs} AS bucket, COUNT(*) AS total, COALESCE(SUM(ok), 0) AS up
           FROM checks WHERE ts > ? GROUP BY bucket ORDER BY bucket`
      ).bind(since),
      // The recent table is always the newest probes, independent of range.
      env.DB.prepare(
        "SELECT ts, ok, status, latency_ms FROM checks ORDER BY ts DESC LIMIT ?"
      ).bind(RECENT_LIMIT),
    ]);

    const row = tallyRow.results[0] as
      | { total?: number; up?: number }
      | undefined;
    const lat = latency.results[0] as
      | { avg_ms: number | null; p95_ms: number | null }
      | undefined;

    return {
      generatedAt: now,
      degraded: false,
      range,
      last: last.results.length
        ? toProbe(last.results[0] as ProbeRow)
        : null,
      tally: { total: Number(row?.total ?? 0), up: Number(row?.up ?? 0) },
      avgMs: lat?.avg_ms == null ? null : Math.round(lat.avg_ms),
      p95Ms: lat?.p95_ms == null ? null : Math.round(lat.p95_ms),
      buckets: (buckets.results as Bucket[]).map((b) => ({
        bucket: Number(b.bucket),
        total: Number(b.total),
        up: Number(b.up),
      })),
      recent: (recent.results as ProbeRow[]).map(toProbe),
    };
  } catch (e: unknown) {
    console.error(
      `[${new Date(now).toISOString()}] dashboard query failed: ${String(e)}`
    );
    return emptyDashboard(now, range, true);
  }
}
