/**
 * In-process metrics — rolling windows + live CPU sampling.
 *
 * CPU: sampled every second via process.cpuUsage() delta (real process usage,
 *      not host load-average).
 * Traffic: request count + byte totals accumulated by the Express middleware.
 * Response time: rolling average over the last MAX_SAMPLES requests.
 */

const WINDOW_MS  = 60_000;
const MAX_SAMPLES = 200;
const CPU_SMOOTH  = 5;   // number of 1-s samples kept for smoothing

/* ── request / response counters ──────────────────────────────────────────── */
const reqTimestamps: number[] = [];   // epoch ms of each finished request
const respDurations: number[] = [];   // ms (capped at MAX_SAMPLES)
let totalBytesIn  = 0;                // cumulative request body bytes
let totalBytesOut = 0;                // cumulative response body bytes

export function recordRequest(durationMs: number, bytesIn = 0, bytesOut = 0): void {
  const now = Date.now();
  reqTimestamps.push(now);
  respDurations.push(durationMs);
  totalBytesIn  += bytesIn;
  totalBytesOut += bytesOut;

  const cutoff = now - WINDOW_MS;
  while (reqTimestamps.length > 0 && reqTimestamps[0]! < cutoff) reqTimestamps.shift();
  while (respDurations.length > MAX_SAMPLES) respDurations.shift();
}

export function getMetrics() {
  const now    = Date.now();
  const cutoff = now - WINDOW_MS;
  const requestsPerMin = reqTimestamps.filter((t) => t >= cutoff).length;
  const avgResponseMs  =
    respDurations.length > 0
      ? Math.round(respDurations.reduce((a, b) => a + b, 0) / respDurations.length)
      : 0;
  return {
    requestsPerMin,
    avgResponseMs,
    totalBytesIn,
    totalBytesOut,
  };
}

/* ── CPU sampler (process-level, not host load-average) ───────────────────── */
const cpuSamples: number[] = [];   // recent 1-s CPU % readings
let lastUsage = process.cpuUsage();
let lastTime  = Date.now();

function takeCpuSample(): void {
  const now    = Date.now();
  const usage  = process.cpuUsage(lastUsage);
  const elapsedUs = (now - lastTime) * 1_000;   // ms → μs
  const pct = elapsedUs > 0
    ? Math.min(100, Math.round(((usage.user + usage.system) / elapsedUs) * 100))
    : 0;
  cpuSamples.push(pct);
  if (cpuSamples.length > CPU_SMOOTH) cpuSamples.shift();
  lastUsage = process.cpuUsage();
  lastTime  = now;
}

// Start immediately so the first /owner/system call has a real reading
takeCpuSample();
setInterval(takeCpuSample, 1_000).unref();   // .unref() so it won't block exit

export function getCpuPct(): number {
  if (cpuSamples.length === 0) return 0;
  return Math.round(cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length);
}
