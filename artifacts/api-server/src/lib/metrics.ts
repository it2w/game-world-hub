/**
 * In-process request metrics — rolling 60-second window.
 * recordRequest() is called from an Express middleware on every response-finish.
 */

const WINDOW_MS = 60_000;
const MAX_SAMPLES = 200;

const reqTimestamps: number[]  = [];   // epoch ms of each finished request
const respDurations: number[]  = [];   // ms per request (capped at MAX_SAMPLES)

export function recordRequest(durationMs: number): void {
  const now = Date.now();
  reqTimestamps.push(now);
  respDurations.push(durationMs);

  // evict timestamps outside the 1-min window
  const cutoff = now - WINDOW_MS;
  while (reqTimestamps.length > 0 && reqTimestamps[0]! < cutoff) reqTimestamps.shift();

  // keep only the most recent samples for the avg
  while (respDurations.length > MAX_SAMPLES) respDurations.shift();
}

export function getMetrics(): { requestsPerMin: number; avgResponseMs: number } {
  const now    = Date.now();
  const cutoff = now - WINDOW_MS;
  const requestsPerMin = reqTimestamps.filter((t) => t >= cutoff).length;
  const avgResponseMs  =
    respDurations.length > 0
      ? Math.round(respDurations.reduce((a, b) => a + b, 0) / respDurations.length)
      : 0;
  return { requestsPerMin, avgResponseMs };
}
