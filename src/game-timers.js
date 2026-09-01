export const MATCH_DURATION_MS = 180_000;
export const TURN_DURATION_MS = 20_000;

export function createGameTimers() {
  return {
    matchRemainingMs: MATCH_DURATION_MS,
    turnRemainingMs: TURN_DURATION_MS,
    runningSince: null,
  };
}

export function resumeGameTimers(timers, now = Date.now()) {
  if (timers.runningSince !== null || timers.matchRemainingMs <= 0) return { ...timers };
  return { ...timers, runningSince: now };
}

export function tickGameTimers(timers, now = Date.now()) {
  if (timers.runningSince === null || timers.matchRemainingMs <= 0) {
    return {
      timers: { ...timers },
      matchExpired: timers.matchRemainingMs <= 0,
      turnTimeouts: 0,
    };
  }

  const elapsedMs = Math.max(0, now - timers.runningSince);
  const consumedMs = Math.min(elapsedMs, timers.matchRemainingMs);
  const matchRemainingMs = Math.max(0, timers.matchRemainingMs - consumedMs);
  let turnRemainingMs = timers.turnRemainingMs;
  let turnTimeouts = 0;

  if (consumedMs >= turnRemainingMs) {
    const overflowMs = consumedMs - turnRemainingMs;
    turnTimeouts = 1 + Math.floor(overflowMs / TURN_DURATION_MS);
    turnRemainingMs = TURN_DURATION_MS - (overflowMs % TURN_DURATION_MS);
  } else {
    turnRemainingMs -= consumedMs;
  }

  return {
    timers: {
      matchRemainingMs,
      turnRemainingMs,
      runningSince: matchRemainingMs === 0 ? null : now,
    },
    matchExpired: matchRemainingMs === 0,
    turnTimeouts,
  };
}

export function pauseGameTimers(timers, now = Date.now()) {
  const result = tickGameTimers(timers, now);
  return {
    ...result,
    timers: { ...result.timers, runningSince: null },
  };
}

export function resetTurnTimer(timers, now = Date.now()) {
  const result = tickGameTimers(timers, now);
  return {
    ...result.timers,
    turnRemainingMs: TURN_DURATION_MS,
  };
}
