import test from "node:test";
import assert from "node:assert/strict";

import { hasAnyValidMove, validateSelection } from "../src/index.js";

function claimedBoard() {
  return Array.from({ length: 10 }, () =>
    Array.from({ length: 17 }, () => ({ owner: 1, value: 1 })),
  );
}

test("a rectangle cannot use a claimed cell as either coordinate endpoint", () => {
  const board = claimedBoard();
  board[0][1] = { owner: 0, value: 9 };
  board[0][2] = { owner: 0, value: 1 };

  const result = validateSelection(board, 0, 0, 2, 0);

  assert.equal(result.ok, false);
  assert.match(result.message, /시작점|끝점/);
});

test("a rectangle with two open endpoints remains legal when its open-cell sum is ten", () => {
  const board = claimedBoard();
  board[0][0] = { owner: 0, value: 4 };
  board[0][1] = { owner: 0, value: 6 };

  const result = validateSelection(board, 0, 0, 1, 0);

  assert.equal(result.ok, true);
});

test("move discovery checks both opposing corner pairs", () => {
  const board = claimedBoard();
  board[0][1] = { owner: 0, value: 4 };
  board[1][0] = { owner: 0, value: 6 };

  assert.equal(validateSelection(board, 1, 0, 0, 1).ok, true);
  assert.equal(hasAnyValidMove(board), true);
});
