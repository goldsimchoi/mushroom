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
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
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
  }

  async ensureState() {
    if (this.state) return;
    const saved = await this.storage.get("state");
    if (saved) {
      this.state = saved;
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
    this.state.status = bothConnected(this.state) ? "playing" : "waiting";

    server.addEventListener("message", (evt) => this.onMessage(server, evt.data));
    server.addEventListener("close", () => this.onClose(server));

    await this.saveState();
    server.send(JSON.stringify({ type: "hello", seat, state: this.state }));
    await this.broadcastState();

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

    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
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
        break;
    }
  }

  async handleMove(ws, seat, payload) {
    await this.ensureState();

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

    if (![x1, y1, x2, y2].every((v) => Number.isFinite(v) && Number.isInteger(v))) {
      ws.send(JSON.stringify({ type: "error", message: "좌표 형식이 잘못되었습니다." }));
      return;
    }

    const placement = validateSelection(this.state.board, seat, x1, y1, x2, y2);
    if (!placement.ok) {
      ws.send(JSON.stringify({ type: "error", message: placement.message }));
      return;
    }

    applyPlacement(this.state.board, seat, placement.cells);
    this.state.moveCount += 1;
    this.state.scores = countPieces(this.state.board);
    this.state.skipCount = 0;

    const next = seat === 1 ? 2 : 1;
    const nextCanMove = hasAnyValidMove(this.state.board, next);
    const currentCanMove = hasAnyValidMove(this.state.board, seat);

    if (!nextCanMove && !currentCanMove) {
      finishState(this.state);
    } else if (!nextCanMove && currentCanMove) {
      this.state.turn = seat;
      this.state.skipCount = 1;
      this.state.status = bothConnected(this.state) ? "playing" : "waiting";
    } else {
      this.state.turn = next;
      this.state.status = bothConnected(this.state) ? "playing" : "waiting";
    }

    await this.saveState();
    await this.broadcastState();
  }

  async handleSkip(ws, seat) {
    await this.ensureState();
    if (this.state.status !== "playing") {
      ws.send(JSON.stringify({ type: "error", message: "지금은 패스할 수 없습니다." }));
      return;
    }
    if (this.state.turn !== seat) {
      ws.send(JSON.stringify({ type: "error", message: "내 차례가 아닙니다." }));
      return;
    }
    if (hasAnyValidMove(this.state.board, seat)) {
      ws.send(JSON.stringify({ type: "error", message: "둘 수 있는 직사각형이 있어요. 패스할 수 없습니다." }));
      return;
    }

    const next = seat === 1 ? 2 : 1;
    this.state.skipCount += 1;
    this.state.turn = next;

    if (!hasAnyValidMove(this.state.board, seat) && !hasAnyValidMove(this.state.board, next)) {
      finishState(this.state);
    } else {
      this.state.status = bothConnected(this.state) ? "playing" : "waiting";
    }

    await this.saveState();
    await this.broadcastState();
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
    await this.saveState();
    await this.broadcastState();
  }

  onClose(ws) {
    const seat = this.socketSeats.get(ws);
    if (!seat) return;
    this.seatSockets.delete(seat);
    this.socketSeats.delete(ws);
    if (!this.state) return;
    this.state.connectedSeats[seat] = false;
    this.state.players[seat].connected = false;
    if (this.state.status === "playing") this.state.status = "waiting";
    this.saveState().then(() => this.broadcastState());
  }

  async broadcastState() {
    if (!this.state) return;
    const snapshot = JSON.stringify({ type: "state", state: this.state });
    for (const ws of this.seatSockets.values()) {
      if (ws.readyState === 1) {
        ws.send(snapshot);
      }
    }
  }

  async saveState() {
    if (!this.state) return;
    await this.storage.put("state", this.state);
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
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      row.push({ owner: 0, value: randomValue() });
    }
    board.push(row);
  }

  return {
    status: "waiting",
    boardSize: { width: BOARD_WIDTH, height: BOARD_HEIGHT },
    board,
    players: {
      1: { connected: false, name: "Player 1 (Black)" },
      2: { connected: false, name: "Player 2 (White)" },
    },
    connectedSeats: { 1: false, 2: false },
    turn: 1,
    scores: { 1: 0, 2: 0 },
    winner: null,
    skipCount: 0,
    moveCount: 0,
  };
}

function isInside(x, y) {
  return x >= 0 && y >= 0 && x < BOARD_WIDTH && y < BOARD_HEIGHT;
}

function normalizeRect(x1, y1, x2, y2) {
  const nx1 = Math.min(x1, x2);
  const nx2 = Math.max(x1, x2);
  const ny1 = Math.min(y1, y2);
  const ny2 = Math.max(y1, y2);
  if (!isInside(nx1, ny1) || !isInside(nx2, ny2)) return null;
  if (nx1 > nx2 || ny1 > ny2) return null;
  return { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
}

function validateSelection(board, player, x1, y1, x2, y2) {
  const rect = normalizeRect(x1, y1, x2, y2);
  if (!rect) return { ok: false, message: "직사각형 범위를 벗어났습니다." };
  if (rect.x1 === rect.x2 && rect.y1 === rect.y2) {
    return { ok: false, message: "한 칸은 안돼요. 두 점을 더블클릭해 직사각형을 만드세요." };
  }

  let sum = 0;
  const cells = [];
  for (let y = rect.y1; y <= rect.y2; y++) {
    for (let x = rect.x1; x <= rect.x2; x++) {
      const cell = board[y][x];
      sum += cell.owner === 0 ? cell.value : 0;
      cells.push([x, y]);
    }
  }

  if (sum !== TARGET_SUM) {
    return {
      ok: false,
      message: "합이 10이 아닙니다. 현재 합: " + sum,
    };
  }
  return { ok: true, cells };
}

function applyPlacement(board, player, cells) {
  for (const [x, y] of cells) {
    board[y][x].owner = player;
  }
}

function countPieces(board) {
  const scores = { 1: 0, 2: 0 };
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (board[y][x].owner === 1) scores[1] += 1;
      if (board[y][x].owner === 2) scores[2] += 1;
    }
  }
  return scores;
}

function hasAnyValidMove(board, player) {
  for (let y1 = 0; y1 < BOARD_HEIGHT; y1++) {
    for (let x1 = 0; x1 < BOARD_WIDTH; x1++) {
          for (let y2 = y1; y2 < BOARD_HEIGHT; y2++) {
            for (let x2 = x1; x2 < BOARD_WIDTH; x2++) {
              const rect = normalizeRect(x1, y1, x2, y2);
              if (rect.x1 === rect.x2 && rect.y1 === rect.y2) continue;
              const placement = validateSelection(board, player, rect.x1, rect.y1, rect.x2, rect.y2);
              if (placement.ok) return true;
            }
          }
        }
      }
  return false;
}

function finishState(state) {
  state.status = "finished";
  const [s1, s2] = [state.scores[1], state.scores[2]];
  if (s1 > s2) state.winner = 1;
  else if (s2 > s1) state.winner = 2;
  else state.winner = 0;
}

const PAGE_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>합쳐서10 직사각형 대전</title>
    <style>
      :root {
        --panel: rgba(255, 255, 255, 0.84);
        --panel-strong: #ffffff;
        --line: #e7eaf2;
        --line-strong: #d7ddea;
        --text: #14161c;
        --muted: #6c7483;
        --shadow: 0 18px 42px rgba(70, 79, 104, 0.12);
        --p1: #b7dbff;
        --p1-strong: #7ab7f2;
        --p2: #edccff;
        --p2-strong: #c896eb;
        --accent: #625cf3;
        --empty-top: #ffe6a8;
        --empty-bottom: #fff9ef;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
      }
      body {
        min-height: 100vh;
        font-family: "Avenir Next", "SUIT", "Pretendard", "Apple SD Gothic Neo", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(188, 218, 255, 0.55), transparent 30%),
          radial-gradient(circle at top right, rgba(244, 210, 255, 0.48), transparent 28%),
          linear-gradient(180deg, #ffffff 0%, #f5f6fb 100%);
        color: var(--text);
      }
      .wrap {
        max-width: 1560px;
        margin: 0 auto;
        padding: 28px 24px 36px;
      }
      .hero {
        text-align: center;
        margin-bottom: 20px;
      }
      .eyebrow {
        display: inline-flex;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.85);
        border: 1px solid rgba(225, 229, 239, 0.85);
        box-shadow: 0 10px 28px rgba(108, 116, 131, 0.08);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #6c6ff2;
      }
      h1 {
        margin: 14px 0 10px;
        font-size: clamp(36px, 5vw, 56px);
        line-height: 1.02;
        letter-spacing: -0.04em;
      }
      .rule-copy {
        max-width: 820px;
        margin: 0 auto;
        font-size: 15px;
        line-height: 1.7;
        color: var(--muted);
      }
      .panel {
        background: var(--panel);
        border: 1px solid rgba(255, 255, 255, 0.9);
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        justify-content: center;
        border-radius: 24px;
        padding: 16px 18px;
        margin-bottom: 24px;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: center;
      }
      input, button {
        font: inherit;
      }
      input {
        min-width: 200px;
        border: 1px solid var(--line-strong);
        border-radius: 16px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.92);
        color: var(--text);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
      }
      button {
        border: 0;
        border-radius: 16px;
        padding: 14px 20px;
        font-weight: 700;
        letter-spacing: -0.01em;
        background: #ffffff;
        color: var(--text);
        box-shadow: 0 12px 24px rgba(109, 117, 133, 0.12);
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
      }
      button:hover {
        transform: translateY(-1px);
        box-shadow: 0 16px 28px rgba(109, 117, 133, 0.18);
      }
      button:disabled {
        pointer-events: none;
      }
      .btn-primary {
        background: linear-gradient(180deg, #736cf7 0%, #5a55e8 100%);
        color: #fff;
      }
      .action-btn {
        min-width: 122px;
      }
      .btn-disabled {
        opacity: 0.5;
        cursor: not-allowed;
        box-shadow: none;
        transform: none;
      }
      .arena {
        display: grid;
        grid-template-columns: minmax(180px, 220px) minmax(0, 1fr) minmax(180px, 220px);
        gap: 28px;
        align-items: start;
      }
      .player-side {
        border-radius: 32px;
        padding: 18px 16px 22px;
        text-align: center;
        width: 100%;
      }
      .avatar-frame {
        width: 100%;
        aspect-ratio: 1 / 1;
        max-width: 190px;
        margin: 0 auto 18px;
        border-radius: 28px;
        display: grid;
        place-items: center;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 18px 35px rgba(107, 116, 131, 0.14);
      }
      .player-one .avatar-frame {
        background: linear-gradient(180deg, #c7dcff 0%, #93baf0 100%);
      }
      .player-two .avatar-frame {
        background: linear-gradient(180deg, #f7dcff 0%, #dfb5fb 100%);
      }
      .avatar-badge {
        width: 92px;
        height: 92px;
        border-radius: 30px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 10px 22px rgba(67, 73, 90, 0.16);
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .player-label {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.03em;
      }
      .score-value {
        font-size: clamp(72px, 8vw, 108px);
        line-height: 1;
        font-weight: 300;
        letter-spacing: -0.07em;
        margin: 14px 0 10px;
      }
      .player-one .score-value {
        color: #93bfea;
      }
      .player-two .score-value {
        color: #c69be5;
      }
      .score-meta {
        font-size: 13px;
        color: var(--muted);
      }
      .score-divider {
        margin-top: 10px;
        padding-top: 12px;
        border-top: 1px solid rgba(215, 221, 234, 0.95);
        font-size: 13px;
        font-weight: 700;
        color: #4b5563;
      }
      .score-card.active {
        transform: translateY(-4px);
        box-shadow: 0 26px 40px rgba(89, 96, 124, 0.16);
      }
      .player-one.active {
        outline: 3px solid rgba(122, 183, 242, 0.34);
      }
      .player-two.active {
        outline: 3px solid rgba(200, 150, 235, 0.34);
      }
      .board-stage {
        border-radius: 34px;
        padding: 22px;
      }
      .board-stage-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px 14px;
        margin-bottom: 12px;
      }
      .status-box {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 10px 16px;
        border-radius: 999px;
        background: rgba(98, 92, 243, 0.08);
        color: #4440c8;
        font-weight: 700;
        white-space: normal;
      }
      .small {
        font-size: 13px;
        color: var(--muted);
      }
      .hint {
        margin-bottom: 16px;
        padding: 12px 14px;
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(245, 247, 252, 0.98) 100%);
        border: 1px solid rgba(228, 234, 242, 0.95);
        color: #44657e;
        font-size: 14px;
      }
      .board-wrap {
        overflow-x: auto;
        border-radius: 28px;
        padding: 18px;
        background: var(--panel-strong);
        border: 1px solid #edf0f6;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 16px 28px rgba(106, 113, 129, 0.08);
      }
      #board {
        display: grid;
        grid-template-columns: repeat(17, minmax(42px, 1fr));
        gap: 8px;
        width: min(100%, 980px);
        margin: 0 auto;
      }
      .cell {
        position: relative;
        aspect-ratio: 1 / 1;
        border-radius: 18px;
        border: 1px solid #e5ccb0;
        background: linear-gradient(180deg, var(--empty-top) 0%, var(--empty-bottom) 48%, #fffaf2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        overflow: hidden;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 6px 10px rgba(181, 147, 114, 0.18);
      }
      .cell::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background:
          radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.92) 0 12%, transparent 13%),
          radial-gradient(circle at 74% 76%, rgba(206, 163, 119, 0.18) 0 7%, transparent 8%);
        pointer-events: none;
      }
      .cell.interactive {
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease;
      }
      .cell.interactive:hover {
        transform: translateY(-1px);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 10px 18px rgba(181, 147, 114, 0.24);
      }
      .cell[data-owner="1"] {
        border-color: #9ec6e8;
        background: linear-gradient(180deg, #deefff 0%, #b8dcff 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 10px 20px rgba(122, 183, 242, 0.22);
      }
      .cell[data-owner="2"] {
        border-color: #d7b5eb;
        background: linear-gradient(180deg, #f8e8ff 0%, #e8cbff 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 10px 20px rgba(200, 150, 235, 0.22);
      }
      .cell[data-owner="1"]::before,
      .cell[data-owner="2"]::before {
        background:
          radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.55) 0 10%, transparent 11%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, transparent 100%);
      }
      .cell .value {
        position: relative;
        z-index: 2;
        font-size: clamp(18px, 2vw, 22px);
        color: #111318;
        font-weight: 900;
        letter-spacing: -0.06em;
      }
      .cell .value.occupied {
        color: rgba(24, 28, 36, 0.46);
        text-decoration: line-through;
        text-decoration-thickness: 2px;
      }
      .disc {
        display: none;
      }
      .selection {
        box-shadow: inset 0 0 0 2px rgba(126, 165, 255, 0.95), 0 0 0 5px rgba(188, 212, 255, 0.45), 0 18px 28px rgba(110, 130, 194, 0.2);
      }
      .selection-start::after,
      .selection-end::after {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        z-index: 3;
        font-size: 11px;
        font-weight: 800;
        color: #ffffff;
        box-shadow: 0 4px 10px rgba(38, 49, 70, 0.18);
      }
      .selection-start::after {
        content: "1";
        background: #7ab7f2;
      }
      .selection-end::after {
        content: "2";
      }
      .selection-end::after {
        background: #c896eb;
      }
      .board-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 12px;
        margin-top: 18px;
      }
      .logs-panel {
        margin-top: 22px;
        border-radius: 24px;
        padding: 16px 18px;
      }
      .logs {
        max-height: 140px;
        overflow: auto;
        margin-top: 10px;
        border-radius: 16px;
        border: 1px solid #edf0f6;
        background: rgba(255, 255, 255, 0.85);
        padding: 12px;
        color: #566074;
      }
      @media (max-width: 1200px) {
        .arena {
          grid-template-columns: 1fr;
        }
        .player-side {
          max-width: 420px;
          margin: 0 auto;
        }
      }
      @media (max-width: 720px) {
        .wrap {
          padding: 18px 14px 28px;
        }
        .toolbar {
          border-radius: 20px;
        }
        input {
          min-width: 0;
          width: 100%;
        }
        .board-stage {
          padding: 16px;
        }
        .board-wrap {
          padding: 12px;
        }
        #board {
          gap: 6px;
        }
        .cell {
          border-radius: 14px;
        }
        .board-stage-head {
          flex-direction: column;
          align-items: stretch;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <div class="eyebrow">Realtime PvP Board</div>
        <h1>Two-player Mode</h1>
        <p class="rule-copy">규칙: 더블클릭으로 두 점을 지정해서 직사각형을 만들고, 직사각형 안에서 <strong>현재 비어있는 칸</strong>의 숫자 합이 10이면 그 칸을 모두 내 땅으로 바꿉니다.</p>
      </div>

      <div class="toolbar panel">
        <div class="row">
          <input id="roomId" placeholder="예: game123" />
          <button id="joinBtn">방 입장</button>
          <button id="createBtn" class="btn-primary">방 만들기</button>
          <button id="copyBtn">링크 복사</button>
        </div>
      </div>

      <div class="arena">
        <aside class="panel score-card player-side player-one" id="scoreCard1">
          <div class="avatar-frame">
            <div class="avatar-badge">1P</div>
          </div>
          <div class="player-label">First Player</div>
          <div class="score-value" id="scoreValue1">0</div>
          <div class="score-meta" id="scoreMeta1">연결: -, 돌: 0개</div>
          <div class="score-divider" id="scoreTurn1">대기</div>
        </aside>

        <main class="panel board-stage">
          <div class="board-stage-head">
            <div class="status-box" id="status">준비 중...</div>
            <div class="small" id="scoreBoard"></div>
          </div>
          <div id="hint" class="hint">더블클릭으로 점을 2번 눌러 직사각형을 지정하세요.</div>
          <div class="board-wrap">
            <div id="board"></div>
          </div>
          <div class="board-actions">
            <button id="skipBtn" class="action-btn">패스</button>
            <button id="restartBtn" class="btn-primary action-btn">다시 시작</button>
            <button id="clearBtn" class="action-btn" type="button">선택 취소</button>
          </div>
        </main>

        <aside class="panel score-card player-side player-two" id="scoreCard2">
          <div class="avatar-frame">
            <div class="avatar-badge">2P</div>
          </div>
          <div class="player-label">Second Player</div>
          <div class="score-value" id="scoreValue2">0</div>
          <div class="score-meta" id="scoreMeta2">연결: -, 돌: 0개</div>
          <div class="score-divider" id="scoreTurn2">대기</div>
        </aside>
      </div>

      <div class="panel logs-panel">
        <div class="small">이벤트 로그</div>
        <div class="logs" id="log"></div>
      </div>
    </div>

    <script>
      let socket = null;
      let seat = null;
      let state = null;
      let start = null;
      let end = null;

      const roomInput = document.getElementById("roomId");
      const joinBtn = document.getElementById("joinBtn");
      const createBtn = document.getElementById("createBtn");
      const copyBtn = document.getElementById("copyBtn");
      const skipBtn = document.getElementById("skipBtn");
      const restartBtn = document.getElementById("restartBtn");
      const clearBtn = document.getElementById("clearBtn");
      const statusBox = document.getElementById("status");
      const scoreBoard = document.getElementById("scoreBoard");
      const scoreCard1 = document.getElementById("scoreCard1");
      const scoreCard2 = document.getElementById("scoreCard2");
      const scoreValue1 = document.getElementById("scoreValue1");
      const scoreValue2 = document.getElementById("scoreValue2");
      const scoreMeta1 = document.getElementById("scoreMeta1");
      const scoreMeta2 = document.getElementById("scoreMeta2");
      const scoreTurn1 = document.getElementById("scoreTurn1");
      const scoreTurn2 = document.getElementById("scoreTurn2");
      const hint = document.getElementById("hint");
      const logBox = document.getElementById("log");
      const boardEl = document.getElementById("board");

      const params = new URLSearchParams(window.location.search);
      const prefillRoom = params.get("room");
      if (prefillRoom) {
        roomInput.value = prefillRoom;
        connect(prefillRoom);
      }

      joinBtn.addEventListener("click", () => {
        const room = roomInput.value.trim();
        if (!room) {
          alert("방 코드를 입력하세요.");
          return;
        }
        connect(room);
      });

      createBtn.addEventListener("click", () => {
        const code = Math.random().toString(36).slice(2, 8);
        roomInput.value = code;
        connect(code);
      });

      copyBtn.addEventListener("click", () => {
        if (!roomInput.value.trim()) {
          alert("방 코드가 없습니다.");
          return;
        }
        const url = location.origin + location.pathname + "?room=" + encodeURIComponent(roomInput.value.trim());
        navigator.clipboard.writeText(url).then(() => log("초대 링크를 복사했습니다."));
      });

      skipBtn.addEventListener("click", () => send({ type: "skip" }));
      restartBtn.addEventListener("click", () => send({ type: "restart" }));
      clearBtn.addEventListener("click", () => {
        start = null;
        end = null;
        hint.textContent = "선택이 취소됐습니다. 첫 번째 점 더블클릭하세요.";
        renderBoard();
      });

      function attemptMove() {
        if (!start || !end) return;
        const isSingle = start.x === end.x && start.y === end.y;
        if (isSingle) {
          hint.textContent = "한 칸은 안됩니다. 서로 다른 두 점을 더블클릭해 주세요.";
          start = null;
          end = null;
          return;
        }
        send({ type: "move", x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        start = null;
        end = null;
      }

      function connect(room) {
        if (socket) socket.close();
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(proto + "://" + location.host + "/ws/room/" + encodeURIComponent(room));
        socket = ws;
        roomInput.value = room;
        window.history.replaceState({}, "", "?room=" + encodeURIComponent(room));

        ws.onopen = () => {
          statusBox.textContent = "방 " + room + " 연결 시도";
        };
        ws.onmessage = (evt) => {
          const data = JSON.parse(evt.data);
          if (data.type === "hello") {
            seat = data.seat;
            state = data.state;
            log("내 자리: Player " + seat);
            renderBoard();
            return;
          }
          if (data.type === "state") {
            state = data.state;
            renderBoard();
            return;
          }
          if (data.type === "error") {
            log("오류: " + data.message);
            return;
          }
        };
        ws.onclose = () => {
          statusBox.textContent = "연결이 끊겼습니다.";
          if (socket === ws) socket = null;
        };
      }

      function send(payload) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify(payload));
      }

      function renderBoard() {
        if (!state) return;
        const width = state.boardSize.width;
        const height = state.boardSize.height;
        boardEl.style.gridTemplateColumns = "repeat(" + width + ", minmax(0, 1fr))";
        boardEl.innerHTML = "";

        const isMyTurn = seat !== null && Number(state.turn) === Number(seat) && state.status === "playing";
        const showSkip = isMyTurn;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const cell = document.createElement("div");
            const cellData = state.board[y][x];
            const owner = cellData.owner;
            const v = cellData.value;

            cell.className = "cell";
            cell.dataset.x = String(x);
            cell.dataset.y = String(y);
            cell.setAttribute("data-owner", String(owner));

            const value = document.createElement("span");
            value.className = "value";
            value.textContent = String(v);
            cell.appendChild(value);

            if (owner === 1 || owner === 2) {
              const disc = document.createElement("span");
              disc.className = owner === 1 ? "disc black" : "disc white";
              cell.appendChild(disc);
              value.classList.add("occupied");
            }

            if (isCellInCurrentSelection(x, y)) {
              cell.classList.add("selection");
            }
            if (start && x === start.x && y === start.y) {
              cell.classList.add("selection-start");
              cell.classList.add("selection");
            }
            if (end && x === end.x && y === end.y) {
              cell.classList.add("selection-end");
              cell.classList.add("selection");
            }

            if (isMyTurn && state.status === "playing") {
              cell.classList.add("interactive");
              cell.addEventListener("dblclick", (evt) => {
                evt.preventDefault();
                if (!start) {
                  start = { x, y };
                  hint.textContent = "첫 점이 선택됐습니다. 같은 방식으로 두 번째 점을 더블클릭해 주세요.";
                  renderBoard();
                  return;
                }

                end = { x, y };
                attemptMove();
                renderBoard();
              });
            }

            boardEl.appendChild(cell);
          }
        }

        const connected1 = state.connectedSeats["1"] ? "O" : "-";
        const connected2 = state.connectedSeats["2"] ? "O" : "-";
        const p1 = state.scores["1"] || 0;
        const p2 = state.scores["2"] || 0;
        const statusText =
          state.status === "finished"
            ? state.winner === 0
              ? "무승부로 게임이 종료됐습니다."
              : "Player " + state.winner + " 승리로 게임이 종료됐습니다."
            : state.status === "waiting"
              ? "상대 연결을 기다리는 중입니다."
              : "Player " + state.turn + "의 차례입니다.";

        statusBox.textContent = statusText;
        scoreBoard.textContent = "P1 " + p1 + "칸 · P2 " + p2 + "칸 · 패스 " + state.skipCount;
        scoreValue1.textContent = String(p1);
        scoreValue2.textContent = String(p2);
        scoreMeta1.textContent = (connected1 === "O" ? "연결됨" : "미연결") + " · 점유 " + p1 + "칸";
        scoreMeta2.textContent = (connected2 === "O" ? "연결됨" : "미연결") + " · 점유 " + p2 + "칸";
        scoreTurn1.textContent =
          state.status === "finished"
            ? state.winner === 1 ? "승리" : state.winner === 0 ? "무승부" : "패배"
            : state.turn === 1 ? "현재 턴" : "대기";
        scoreTurn2.textContent =
          state.status === "finished"
            ? state.winner === 2 ? "승리" : state.winner === 0 ? "무승부" : "패배"
            : state.turn === 2 ? "현재 턴" : "대기";
        scoreCard1.classList.toggle("active", state.status === "playing" && Number(state.turn) === 1);
        scoreCard2.classList.toggle("active", state.status === "playing" && Number(state.turn) === 2);

        skipBtn.disabled = !showSkip;
        skipBtn.classList.toggle("btn-disabled", skipBtn.disabled);
        restartBtn.disabled = false;
      }

      boardEl.addEventListener("pointerleave", () => {
        if (start) {
          start = null;
          end = null;
          hint.textContent = "선택이 취소됐어요. 첫 번째 점을 더블클릭하세요.";
          renderBoard();
        }
      });

      function isCellInCurrentSelection(x, y) {
        if (!start || !end) return false;
        const x1 = Math.min(start.x, end.x);
        const x2 = Math.max(start.x, end.x);
        const y1 = Math.min(start.y, end.y);
        const y2 = Math.max(start.y, end.y);
        return x >= x1 && x <= x2 && y >= y1 && y <= y2;
      }

      function log(message) {
        const d = document.createElement("div");
        d.textContent = "[" + new Date().toLocaleTimeString() + "] " + message;
        logBox.prepend(d);
      }
    </script>
  </body>
</html>`;
