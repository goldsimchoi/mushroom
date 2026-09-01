import {
  createGameTimers,
  pauseGameTimers,
  resetTurnTimer,
  resumeGameTimers,
  tickGameTimers,
} from "./game-timers.js";
import { PAGE_HTML } from "./page-html.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(PAGE_HTML, {
        headers: { "content-type": "text/html;charset=utf-8" },
      });
    }

    if (url.pathname.startsWith("/ws/room/")) {
      const roomId = url.pathname.replace("/ws/room/", "").trim() || "default-room";
      const id = env.ROOMS.idFromName(roomId);
      return env.ROOMS.get(id).fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

export class Room {
  constructor(state) {
    this.storage = state.storage;
    this.state = null;
    this.seatSockets = new Map();
    this.socketSeats = new Map();
    this.timerHandle = null;
    this.timerGeneration = 0;
  }

  async ensureState() {
    if (this.state) return;
    const saved = await this.storage.get("state");
    if (saved) {
      this.state = saved;
      if (!this.state.timers) this.state.timers = createGameTimers();
      this.state.timers.runningSince = null;
      this.state.connectedSeats = { 1: false, 2: false };
      this.state.players[1].connected = false;
      this.state.players[2].connected = false;
      if (this.state.status === "playing") this.state.status = "waiting";
      return;
    }
    this.state = createInitialState();
    await this.saveState();
  }

  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    await this.ensureState();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const seat = this.assignSeat();
    if (seat === null) {
      server.send(JSON.stringify({ type: "error", message: "방이 가득 찼습니다." }));
      server.close(1013, "room full");
      return new Response(null, { status: 503 });
    }

    this.seatSockets.set(seat, server);
    this.socketSeats.set(server, seat);
    this.state.connectedSeats[seat] = true;
    this.state.players[seat].connected = true;

    if (this.state.status !== "finished") {
      this.state.status = bothConnected(this.state) ? "playing" : "waiting";
      this.state.timers = bothConnected(this.state)
        ? resumeGameTimers(this.state.timers)
        : { ...this.state.timers, runningSince: null };
    }

    server.addEventListener("message", (event) => this.onMessage(server, event.data));
    server.addEventListener("close", () => this.onClose(server));

    await this.saveState();
    server.send(JSON.stringify({ type: "hello", seat, state: this.state, serverNow: Date.now() }));
    await this.broadcastState();
    this.scheduleTimer();

    return new Response(null, { status: 101, webSocket: client });
  }

  assignSeat() {
    if (!this.state.connectedSeats[1]) return 1;
    if (!this.state.connectedSeats[2]) return 2;
    return null;
  }

  onMessage(ws, raw) {
    const seat = this.socketSeats.get(ws);
    if (!seat) return;

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "메시지 형식이 잘못되었습니다." }));
      return;
    }

    switch (payload.type) {
      case "move":
        this.handleMove(ws, seat, payload);
        break;
      case "skip":
        this.handleSkip(ws, seat);
        break;
      case "restart":
        this.handleRestart(ws, seat);
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      default:
        ws.send(JSON.stringify({ type: "error", message: "알 수 없는 요청입니다." }));
    }
  }

  async handleMove(ws, seat, payload) {
    await this.ensureState();
    const timerResult = this.applyElapsedTime();

    if (timerResult.matchExpired) {
      await this.saveState();
      await this.broadcastState();
      ws.send(JSON.stringify({ type: "error", message: "경기 시간이 종료됐습니다." }));
      return;
    }
    if (timerResult.turnTimeouts > 0) {
      await this.saveState();
      await this.broadcastState();
      this.scheduleTimer();
    }
    if (this.state.status === "finished") {
      ws.send(JSON.stringify({ type: "error", message: "게임이 종료되어 진행할 수 없습니다." }));
      return;
    }
    if (this.state.turn !== seat) {
      ws.send(JSON.stringify({ type: "error", message: "내 차례가 아닙니다." }));
      return;
    }
    if (this.state.status === "waiting") {
      ws.send(JSON.stringify({ type: "error", message: "상대를 기다리는 중입니다." }));
      return;
    }

    const x1 = Number(payload.x1);
    const y1 = Number(payload.y1);
    const x2 = Number(payload.x2);
    const y2 = Number(payload.y2);
    if (![x1, y1, x2, y2].every((value) => Number.isInteger(value))) {
      ws.send(JSON.stringify({ type: "error", message: "좌표 형식이 잘못되었습니다." }));
      return;
    }

    const placement = validateSelection(this.state.board, x1, y1, x2, y2);
    if (!placement.ok) {
      ws.send(JSON.stringify({ type: "error", message: placement.message }));
      return;
    }

    applyPlacement(this.state.board, seat, placement.cells);
    this.state.moveCount += 1;
    this.state.scores = countPieces(this.state.board);
    this.state.skipCount = 0;
    this.state.timers = resetTurnTimer(this.state.timers);

    const next = seat === 1 ? 2 : 1;
    if (!hasAnyValidMove(this.state.board)) {
      finishState(this.state);
    } else {
      this.state.turn = next;
      this.state.status = bothConnected(this.state) ? "playing" : "waiting";
    }

    await this.saveState();
    await this.broadcastState();
    this.scheduleTimer();
  }

  async handleSkip(ws, seat) {
    await this.ensureState();
    const timerResult = this.applyElapsedTime();

    if (timerResult.matchExpired) {
      await this.saveState();
      await this.broadcastState();
      ws.send(JSON.stringify({ type: "error", message: "경기 시간이 종료됐습니다." }));
      return;
    }
    if (timerResult.turnTimeouts > 0) {
      await this.saveState();
      await this.broadcastState();
      this.scheduleTimer();
    }
    if (this.state.status !== "playing") {
      ws.send(JSON.stringify({ type: "error", message: "지금은 턴을 넘길 수 없습니다." }));
      return;
    }
    if (this.state.turn !== seat) {
      ws.send(JSON.stringify({ type: "error", message: "내 차례가 아닙니다." }));
      return;
    }

    this.state.skipCount += 1;
    if (this.state.skipCount >= 2) {
      finishState(this.state);
    } else {
      this.state.turn = seat === 1 ? 2 : 1;
      this.state.timers = resetTurnTimer(this.state.timers);
    }
    await this.saveState();
    await this.broadcastState();
    this.scheduleTimer();
  }

  async handleRestart(ws, seat) {
    await this.ensureState();
    if (seat !== 1 && seat !== 2) {
      ws.send(JSON.stringify({ type: "error", message: "잘못된 플레이어입니다." }));
      return;
    }

    const connectivity = {
      connectedSeats: { ...this.state.connectedSeats },
      players: this.state.players,
    };
    this.state = createInitialState();
    this.state.connectedSeats = connectivity.connectedSeats;
    this.state.players = connectivity.players;
    this.state.status = bothConnected(this.state) ? "playing" : "waiting";
    if (bothConnected(this.state)) this.state.timers = resumeGameTimers(this.state.timers);

    await this.saveState();
    await this.broadcastState();
    this.scheduleTimer();
  }

  onClose(ws) {
    const seat = this.socketSeats.get(ws);
    if (!seat) return;
    this.seatSockets.delete(seat);
    this.socketSeats.delete(ws);
    if (!this.state) return;

    this.applyElapsedTime();
    this.state.connectedSeats[seat] = false;
    this.state.players[seat].connected = false;
    if (this.state.status === "playing") {
      this.state.timers = pauseGameTimers(this.state.timers).timers;
      this.state.status = "waiting";
    }
    this.clearTimer();
    this.saveState().then(() => this.broadcastState());
  }

  async broadcastState() {
    if (!this.state) return;
    const snapshot = JSON.stringify({ type: "state", state: this.state, serverNow: Date.now() });
    for (const ws of this.seatSockets.values()) {
      if (ws.readyState === 1) ws.send(snapshot);
    }
  }

  async saveState() {
    if (this.state) await this.storage.put("state", this.state);
  }

  applyElapsedTime(now = Date.now()) {
    const result = tickGameTimers(this.state.timers, now);
    this.state.timers = result.timers;

    if (result.matchExpired) {
      finishState(this.state);
    } else if (result.turnTimeouts > 0) {
      if (result.turnTimeouts % 2 === 1) this.state.turn = this.state.turn === 1 ? 2 : 1;
      this.state.skipCount = 0;
    }
    return result;
  }

  clearTimer() {
    this.timerGeneration += 1;
    if (this.timerHandle !== null) clearTimeout(this.timerHandle);
    this.timerHandle = null;
  }

  scheduleTimer() {
    this.clearTimer();
    if (!this.state || this.state.status !== "playing" || this.state.timers.runningSince === null) return;

    const generation = this.timerGeneration;
    const delay = Math.max(25, Math.min(this.state.timers.matchRemainingMs, this.state.timers.turnRemainingMs) + 25);
    this.timerHandle = setTimeout(() => this.handleTimerDeadline(generation), delay);
  }

  async handleTimerDeadline(generation) {
    if (generation !== this.timerGeneration || !this.state) return;
    this.timerHandle = null;
    const result = this.applyElapsedTime();
    if (!result.matchExpired && result.turnTimeouts === 0) {
      this.scheduleTimer();
      return;
    }
    await this.saveState();
    await this.broadcastState();
    this.scheduleTimer();
  }
}

const BOARD_WIDTH = 17;
const BOARD_HEIGHT = 10;
const TARGET_SUM = 10;

function bothConnected(state) {
  return state.connectedSeats[1] && state.connectedSeats[2];
}

function randomValue() {
  return 1 + Math.floor(Math.random() * 9);
}

function createInitialState() {
  const board = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    const row = [];
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      row.push({ owner: 0, value: randomValue() });
    }
    board.push(row);
  }

  return {
    status: "waiting",
    boardSize: { width: BOARD_WIDTH, height: BOARD_HEIGHT },
    board,
    players: {
      1: { connected: false, name: "Player 1" },
      2: { connected: false, name: "Player 2" },
    },
    connectedSeats: { 1: false, 2: false },
    turn: 1,
    scores: { 1: 0, 2: 0 },
    winner: null,
    skipCount: 0,
    moveCount: 0,
    timers: createGameTimers(),
  };
}

function isInside(x, y) {
  return x >= 0 && y >= 0 && x < BOARD_WIDTH && y < BOARD_HEIGHT;
}

function normalizeRect(x1, y1, x2, y2) {
  const rect = {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  };
  if (!isInside(rect.x1, rect.y1) || !isInside(rect.x2, rect.y2)) return null;
  return rect;
}

export function validateSelection(board, x1, y1, x2, y2) {
  const rect = normalizeRect(x1, y1, x2, y2);
  if (!rect) return { ok: false, message: "직사각형 범위를 벗어났습니다." };
  if (rect.x1 === rect.x2 && rect.y1 === rect.y2) {
    return { ok: false, message: "한 칸만 고를 수는 없습니다." };
  }
  if (board[y1][x1].owner !== 0 || board[y2][x2].owner !== 0) {
    return { ok: false, message: "시작점과 끝점은 남아 있는 사과 칸이어야 합니다." };
  }

  let sum = 0;
  const cells = [];
  for (let y = rect.y1; y <= rect.y2; y += 1) {
    for (let x = rect.x1; x <= rect.x2; x += 1) {
      const cell = board[y][x];
      if (cell.owner === 0) sum += cell.value;
      cells.push([x, y]);
    }
  }

  if (sum !== TARGET_SUM) {
    return { ok: false, message: "합이 10이 아닙니다. 현재 합: " + sum };
  }
  return { ok: true, cells };
}

function applyPlacement(board, player, cells) {
  for (const [x, y] of cells) board[y][x].owner = player;
}

function countPieces(board) {
  const scores = { 1: 0, 2: 0 };
  for (const row of board) {
    for (const cell of row) {
      if (cell.owner === 1) scores[1] += 1;
      if (cell.owner === 2) scores[2] += 1;
    }
  }
  return scores;
}

export function hasAnyValidMove(board) {
  for (let y1 = 0; y1 < BOARD_HEIGHT; y1 += 1) {
    for (let x1 = 0; x1 < BOARD_WIDTH; x1 += 1) {
      for (let y2 = y1; y2 < BOARD_HEIGHT; y2 += 1) {
        for (let x2 = x1; x2 < BOARD_WIDTH; x2 += 1) {
          if (x1 === x2 && y1 === y2) continue;
          if (validateSelection(board, x1, y1, x2, y2).ok) return true;
          if (x1 !== x2 && y1 !== y2 && validateSelection(board, x2, y1, x1, y2).ok) return true;
        }
      }
    }
  }
  return false;
}

function finishState(state) {
  state.status = "finished";
  if (state.timers) state.timers.runningSince = null;
  const playerOne = state.scores[1];
  const playerTwo = state.scores[2];
  if (playerOne > playerTwo) state.winner = 1;
  else if (playerTwo > playerOne) state.winner = 2;
  else state.winner = 0;
}
