import test from "node:test";
import assert from "node:assert/strict";

import {
  createGameTimers,
  resumeGameTimers,
  pauseGameTimers,
  resetTurnTimer,
  tickGameTimers,
} from "../src/game-timers.js";

test("a new match gives both players a shared 180-second clock and a 20-second turn budget", () => {
  const timers = createGameTimers();

  assert.deepEqual(timers, {
    matchRemainingMs: 180_000,
    turnRemainingMs: 20_000,
    runningSince: null,
  });
});

test("running timers consume the shared match clock and current turn budget together", () => {
  const running = resumeGameTimers(createGameTimers(), 1_000);
  const result = tickGameTimers(running, 8_500);

  assert.equal(result.matchExpired, false);
  assert.equal(result.turnTimeouts, 0);
  assert.equal(result.timers.matchRemainingMs, 172_500);
  assert.equal(result.timers.turnRemainingMs, 12_500);
});

test("every elapsed 20-second budget advances one turn while the match continues", () => {
  const running = resumeGameTimers(createGameTimers(), 0);
  const result = tickGameTimers(running, 45_000);

  assert.equal(result.matchExpired, false);
  assert.equal(result.turnTimeouts, 2);
  assert.equal(result.timers.matchRemainingMs, 135_000);
  assert.equal(result.timers.turnRemainingMs, 15_000);
});

test("pausing freezes both clocks until the match resumes", () => {
  const running = resumeGameTimers(createGameTimers(), 0);
  const paused = pauseGameTimers(running, 10_000).timers;
  const result = tickGameTimers(paused, 70_000);

  assert.equal(result.timers.matchRemainingMs, 170_000);
  assert.equal(result.timers.turnRemainingMs, 10_000);
  assert.equal(result.turnTimeouts, 0);
});

test("completing a move resets only the active turn budget", () => {
  const running = resumeGameTimers(createGameTimers(), 0);
  const reset = resetTurnTimer(running, 7_000);

  assert.equal(reset.matchRemainingMs, 173_000);
  assert.equal(reset.turnRemainingMs, 20_000);
  assert.equal(reset.runningSince, 7_000);
});

test("the match expires when the shared clock reaches zero", () => {
  const running = resumeGameTimers(createGameTimers(), 0);
  const result = tickGameTimers(running, 180_000);

  assert.equal(result.matchExpired, true);
  assert.equal(result.timers.matchRemainingMs, 0);
});
