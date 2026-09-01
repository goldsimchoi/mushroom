import test from "node:test";
import assert from "node:assert/strict";

import { Room } from "../src/index.js";

const testRooms = [];
test.afterEach(() => {
  for (const room of testRooms) room.clearTimer();
  testRooms.length = 0;
});

function createTestRoom() {
  const storage = {
    async get() { return null; },
    async put() {},
  };
  const room = new Room({ storage });
  testRooms.push(room);
  return room;
}

function createSocket() {
  return {
    messages: [],
    send(message) { this.messages.push(JSON.parse(message)); },
  };
}

async function startRoom(room, now = 0) {
  await room.ensureState();
  room.state.connectedSeats = { 1: true, 2: true };
  room.state.players[1].connected = true;
  room.state.players[2].connected = true;
  room.state.status = "playing";
  room.state.timers.runningSince = now;
}

test("two voluntary consecutive passes finish the match", async () => {
  const room = createTestRoom();
  const playerOne = createSocket();
  const playerTwo = createSocket();
  await startRoom(room, Date.now());

  await room.handleSkip(playerOne, 1);
  assert.equal(room.state.status, "playing");
  assert.equal(room.state.turn, 2);
  assert.equal(room.state.skipCount, 1);

  await room.handleSkip(playerTwo, 2);
  assert.equal(room.state.status, "finished");
  assert.equal(room.state.skipCount, 2);
});

test("automatic turn timeouts do not count as voluntary passes", async () => {
  const room = createTestRoom();
  await startRoom(room, 0);
  room.state.skipCount = 1;

  const result = room.applyElapsedTime(20_000);

  assert.equal(result.turnTimeouts, 1);
  assert.equal(room.state.turn, 2);
  assert.equal(room.state.skipCount, 0);
  assert.equal(room.state.status, "playing");
});
