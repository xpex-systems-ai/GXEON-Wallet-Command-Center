import type { TaskmarketSnapshot } from './types.js';

export const TASKMARKET_POLL_CADENCE = '7,22,37,52 * * * *';
export const TASKMARKET_POLL_MAX_AGE_MS = 30 * 60_000;

export function getSchedulerHealth(lastSuccessfulPoll: string | null, now = Date.now()) {
  if (!lastSuccessfulPoll) return { health: 'AWAITING_FIRST_POLL' as const, ageSeconds: null };
  const timestamp = Date.parse(lastSuccessfulPoll);
  if (!Number.isFinite(timestamp) || timestamp > now) return { health: 'INVALID_TIMESTAMP' as const, ageSeconds: null };
  const age = now - timestamp;
  return { health: age > TASKMARKET_POLL_MAX_AGE_MS ? 'DELAYED' as const : 'CURRENT' as const, ageSeconds: Math.floor(age / 1000) };
}

// Derive freshness when reading, including old persisted snapshots. A manual LIVE read
// must never reset the evidence of the last durable background poll.
export function withSchedulerHealth(snapshot: TaskmarketSnapshot, now = Date.now()): TaskmarketSnapshot {
  return { ...snapshot, scheduler: { ...snapshot.scheduler, cadence: TASKMARKET_POLL_CADENCE,
    ...getSchedulerHealth(snapshot.scheduler.lastSuccessfulPoll, now) } };
}
