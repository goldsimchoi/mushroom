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
        --bg: #f6f7f9;
        --panel: #ffffff;
        --line: #d8dbe0;
        --text: #1f2933;
        --board: #0f6f0f;
        --black: #141414;
        --white: #f6f6f3;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
      }
      body {
        font-family: "Pretendard", "Apple SD Gothic Neo", Arial, sans-serif;
        background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%);
        color: var(--text);
      }
      .wrap {
        max-width: 1180px;
        margin: 0 auto;
        padding: 16px;
      }
      h1 { margin: 0 0 8px; }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 12px;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      input, button {
        font: inherit;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 8px 10px;
      }
      button {
        background: #fff;
      }
      button:hover { background: #f8fafc; }
      .btn-primary { background: #2563eb; color: #fff; border-color: #1e3a8a; }
      .btn-danger { background: #b91c1c; color: #fff; border-color: #7f1d1d; }
      .btn-disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .board-wrap {
        overflow-x: auto;
      }
      #board {
        display: grid;
        grid-template-columns: repeat(17, minmax(28px, 1fr));
        gap: 4px;
        width: min(1060px, 100%);
        margin: 10px auto 0;
      }
      .cell {
        position: relative;
        aspect-ratio: 1 / 1;
        border: 1px solid #1c4a1c;
        border-radius: 6px;
        background: #0f6f0f;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
      }
      .cell .value {
        position: absolute;
        top: 3px;
        left: 4px;
        font-size: 13px;
        color: #f4fff7;
        font-weight: 900;
        opacity: 1;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.48), 0 0 8px rgba(0, 0, 0, 0.15);
        letter-spacing: 0.02em;
      }
      .cell .value.occupied {
        color: rgba(247, 250, 252, 0.45);
        text-decoration: line-through;
        text-decoration-thickness: 2px;
        opacity: 0.85;
      }
      .cell .value.occupied::after {
        content: "※";
        margin-left: 2px;
        font-size: 8px;
        opacity: 0.8;
      }
      .disc {
        width: 82%;
        height: 82%;
        border-radius: 9999px;
        box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.35);
      }
      .disc.black { background: var(--black); }
      .disc.white { background: var(--white); }
      .selection {
        background: rgba(250, 204, 21, 0.2) !important;
        box-shadow: inset 0 0 0 2px rgba(250, 204, 21, 0.92), 0 0 0 3px rgba(250, 204, 21, 0.35), 0 0 18px rgba(250, 204, 21, 0.5);
        z-index: 1;
        outline: 2px solid rgba(217, 119, 6, 0.95);
        outline-offset: -2px;
      }
      .selection-start,
      .selection-end {
        position: relative;
      }
      .selection-start::before,
      .selection-end::before {
        content: "";
        position: absolute;
        width: 12px;
        height: 12px;
        border: 2px solid #fff;
        border-radius: 50%;
        inset: 3px;
        margin: auto;
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.45);
        z-index: 2;
      }
      .selection-start::before {
        background: #22c55e;
      }
      .selection-end::before {
        background: #3b82f6;
      }
      }
      .status-box {
        min-height: 36px;
        white-space: pre-line;
      }
      .score-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .score-card {
        border: 1px solid #dbe2ea;
        border-radius: 10px;
        padding: 10px 12px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        position: relative;
      }
      .score-card.active {
        border-color: #2563eb;
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
      }
      .score-card .name-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 14px;
        margin-bottom: 6px;
      }
      .score-disk {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.2);
      }
      .score-disk.black { background: #141414; }
      .score-disk.white {
        background: #f5f5f2;
        border-color: rgba(0, 0, 0, 0.35);
      }
      .score-value {
        font-size: 28px;
        font-weight: 800;
        margin: 4px 0 2px;
      }
      .score-meta {
        font-size: 12px;
        color: #64748b;
      }
      .score-divider {
        margin-top: 6px;
        border-top: 1px dashed #e2e8f0;
        padding-top: 6px;
        color: #475569;
        font-size: 12px;
      }
      .small { font-size: 13px; color: #475569; }
      .hint { font-size: 13px; color: #0f766e; }
      .logs {
        max-height: 120px;
        overflow: auto;
        border: 1px dashed var(--line);
        background: #f8fafc;
        padding: 8px;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>합쳐서10 직사각형 대전</h1>
        <p class="small">규칙: 더블클릭으로 두 점을 지정해서 직사각형을 만들고, 직사각형 안에서 <strong>현재 비어있는 칸</strong>의 숫자 합이 10이면 그 칸을 모두 내 땅으로 바꿉니다.</p>

      <div class="panel">
        <div class="row">
          <input id="roomId" placeholder="예: game123" />
          <button id="joinBtn">방 입장</button>
          <button id="createBtn" class="btn-primary">방 만들기</button>
          <button id="copyBtn">링크 복사</button>
        </div>
        <div class="row" style="margin-top: 8px;">
          <button id="skipBtn">패스</button>
          <button id="restartBtn" class="btn-primary">다시 시작</button>
          <button id="clearBtn" type="button">선택 취소</button>
        </div>
      </div>

      <div class="panel">
        <div class="status-box" id="status">준비 중...</div>
        <div class="small" id="scoreBoard"></div>
        <div class="score-grid">
          <div class="score-card" id="scoreCard1">
            <div class="name-row">
              <span class="score-disk black"></span>
              <span>Player 1</span>
            </div>
            <div class="score-value" id="scoreValue1">0</div>
            <div class="score-meta" id="scoreMeta1">연결: -, 돌: 0개</div>
            <div class="score-divider" id="scoreTurn1">대기</div>
          </div>
          <div class="score-card" id="scoreCard2">
            <div class="name-row">
              <span class="score-disk white"></span>
              <span>Player 2</span>
            </div>
            <div class="score-value" id="scoreValue2">0</div>
            <div class="score-meta" id="scoreMeta2">연결: -, 돌: 0개</div>
            <div class="score-divider" id="scoreTurn2">대기</div>
          </div>
        </div>
        <div id="hint" class="hint">더블클릭으로 점을 2번 눌러 직사각형을 지정하세요.</div>
      </div>

      <div class="panel">
        <div class="board-wrap">
          <div id="board"></div>
        </div>
      </div>

      <div class="panel">
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
              value.classList.add("owned");
            } else {
              value.classList.add("alive");
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
        const winnerText =
          state.status === "finished"
            ? state.winner === 0
              ? "무승부"
              : "승자: Player " + state.winner
            : state.status === "waiting"
              ? "상대 대기 중"
              : "게임 진행 중";

        statusBox.textContent = "상태: " + winnerText + " / 현재 턴: Player " + state.turn;
        scoreBoard.textContent =
          "연결: P1 " + connected1 + ", P2 " + connected2 +
          " / 점수(돌 개수): P1 " + p1 + " : P2 " + p2 +
          " / 패스: " + state.skipCount;
        scoreValue1.textContent = String(p1);
        scoreValue2.textContent = String(p2);
        scoreMeta1.textContent = "연결: " + connected1 + " / 돌: " + p1 + "개";
        scoreMeta2.textContent = "연결: " + connected2 + " / 돌: " + p2 + "개";
        scoreTurn1.textContent = state.turn === 1 ? "현재 턴" : "대기";
        scoreTurn2.textContent = state.turn === 2 ? "현재 턴" : "대기";
        scoreCard1.classList.toggle("active", Number(state.turn) === 1);
        scoreCard2.classList.toggle("active", Number(state.turn) === 2);

        skipBtn.disabled = !showSkip;
        skipBtn.className = skipBtn.disabled ? "btn-disabled" : "";
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
