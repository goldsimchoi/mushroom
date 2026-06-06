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
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
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
    await this.storage.put("state", this.state);
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
      server.send(
        JSON.stringify({
          type: "error",
          message: "방이 가득 찼습니다. 다른 방에 들어가주세요.",
        }),
      );
      server.close(1013, "room full");
      return new Response(null, {
        status: 503,
      });
    }

    this.seatSockets.set(seat, server);
    this.socketSeats.set(server, seat);
    this.state.connectedSeats[seat] = true;
    this.state.players[seat].connected = true;
    await this.saveState();

    server.addEventListener("message", (evt) => this.onMessage(server, evt.data));
    server.addEventListener("close", () => this.onClose(server));

    server.send(
      JSON.stringify({
        type: "hello",
        seat,
        state: this.state,
      }),
    );
    await this.broadcastState();
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  assignSeat() {
    const occupied = this.state.connectedSeats;
    if (!occupied[1]) return 1;
    if (!occupied[2]) return 2;
    return null;
  }

  onMessage(ws, raw) {
    const seat = this.socketSeats.get(ws);
    if (!seat) return;

    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "메시지 형식이 올바르지 않습니다.",
        }),
      );
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
        ws.send(
          JSON.stringify({
            type: "error",
            message: "알 수 없는 요청입니다.",
          }),
        );
        break;
    }
  }

  async handleMove(ws, seat, payload) {
    await this.ensureState();

    if (this.state.status !== "playing" && this.state.status !== "waiting") {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "게임이 종료되어 진행할 수 없습니다.",
        }),
      );
      return;
    }

    if (this.state.turn !== seat) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "내 차례가 아닙니다.",
        }),
      );
      return;
    }

    if (this.state.status === "waiting") {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "상대를 기다리는 중입니다.",
        }),
      );
      return;
    }

    const { x1, y1, x2, y2 } = payload;
    const rect = normalizeRect(x1, y1, x2, y2);
    if (!rect) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "영역을 다시 선택해주세요.",
        }),
      );
      return;
    }

    const validation = validateRectangle(this.state.board, rect, TARGET_SUM);
    if (!validation.ok) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: validation.message,
        }),
      );
      return;
    }

    this.state.skipCount = 0;
    for (let y = rect.y1; y <= rect.y2; y++) {
      for (let x = rect.x1; x <= rect.x2; x++) {
        this.state.board[y][x].used = true;
      }
    }
    this.state.scores[seat] += validation.scoreGain;
    this.state.turn = seat === 1 ? 2 : 1;
    this.state.moveCount += 1;

    if (!hasValidMove(this.state.board, TARGET_SUM)) {
      this.state.status = "finished";
      if (this.state.scores[1] > this.state.scores[2]) {
        this.state.winner = 1;
      } else if (this.state.scores[2] > this.state.scores[1]) {
        this.state.winner = 2;
      } else {
        this.state.winner = 0;
      }
    } else if (!this.state.connectedSeats[3 - seat]) {
      this.state.status = "waiting";
    } else {
      this.state.status = "playing";
    }

    await this.saveState();
    await this.broadcastState();
  }

  async handleSkip(ws, seat) {
    await this.ensureState();
    if (this.state.status !== "playing" && this.state.status !== "waiting") {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "게임이 종료되어 진행할 수 없습니다.",
        }),
      );
      return;
    }

    if (this.state.turn !== seat) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "내 차례가 아닙니다.",
        }),
      );
      return;
    }

    this.state.skipCount += 1;
    this.state.turn = seat === 1 ? 2 : 1;

    if (this.state.skipCount >= 2 || !hasValidMove(this.state.board, TARGET_SUM)) {
      this.state.status = "finished";
      if (this.state.scores[1] > this.state.scores[2]) {
        this.state.winner = 1;
      } else if (this.state.scores[2] > this.state.scores[1]) {
        this.state.winner = 2;
      } else {
        this.state.winner = 0;
      }
    } else {
      this.state.status = this.state.connectedSeats[3 - seat] ? "playing" : "waiting";
    }

    await this.saveState();
    await this.broadcastState();
  }

  async handleRestart(ws, seat) {
    await this.ensureState();
    if (seat !== 1 && seat !== 2) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "잘못된 플레이어입니다.",
        }),
      );
      return;
    }

    const currentConnectivity = {
      connectedSeats: { ...this.state.connectedSeats },
      players: this.state.players,
    };

    this.state = createInitialState();
    this.state.connectedSeats = currentConnectivity.connectedSeats;
    this.state.players = currentConnectivity.players;
    this.state.status = this.state.connectedSeats[1] && this.state.connectedSeats[2] ? "playing" : "waiting";
    await this.saveState();
    await this.broadcastState();
  }

  onClose(ws) {
    const seat = this.socketSeats.get(ws);
    if (!seat) return;
    if (!this.state) return;
    this.seatSockets.delete(seat);
    this.socketSeats.delete(ws);
    this.state.players[seat].connected = false;
    this.state.connectedSeats[seat] = false;
    if (this.state.status === "playing") {
      this.state.status = "waiting";
    }
    this.saveState().then(() => this.broadcastState());
  }

  async broadcastState() {
    if (!this.state) return;
    for (const ws of this.seatSockets.values()) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "state", state: this.state }));
      }
    }
  }

  async saveState() {
    if (!this.state) return;
    await this.storage.put("state", this.state);
  }
}

const SIZE = 7;
const TARGET_SUM = 10;

const TARGET_MUSHROOMS = 0.22;

function createInitialState() {
  const board = [];
  for (let y = 0; y < SIZE; y++) {
    const row = [];
    for (let x = 0; x < SIZE; x++) {
      row.push({
        x,
        y,
        value: 1 + Math.floor(Math.random() * 9),
        mushroom: Math.random() < TARGET_MUSHROOMS,
        used: false,
      });
    }
    board.push(row);
  }

  return {
    status: "waiting",
    boardSize: SIZE,
    targetSum: TARGET_SUM,
    board,
    players: { 1: { connected: false }, 2: { connected: false } },
    connectedSeats: { 1: false, 2: false },
    turn: 1,
    scores: { 1: 0, 2: 0 },
    winner: null,
    skipCount: 0,
    moveCount: 0,
  };
}

function normalizeRect(x1, y1, x2, y2) {
  if (![x1, y1, x2, y2].every((v) => Number.isFinite(Number(v)))) {
    return null;
  }
  const nx1 = Math.min(Number(x1), Number(x2));
  const nx2 = Math.max(Number(x1), Number(x2));
  const ny1 = Math.min(Number(y1), Number(y2));
  const ny2 = Math.max(Number(y1), Number(y2));
  if (nx1 < 0 || ny1 < 0 || nx2 >= SIZE || ny2 >= SIZE) return null;
  if (nx1 > nx2 || ny1 > ny2) return null;
  if (nx1 === nx2 && ny1 === ny2) return null;
  return { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
}

function validateRectangle(board, rect, target) {
  let sum = 0;
  let mushroomEdge = 0;
  let containsUsed = false;
  let rectCount = 0;

  for (let y = rect.y1; y <= rect.y2; y++) {
    for (let x = rect.x1; x <= rect.x2; x++) {
      const cell = board[y][x];
      if (cell.used) {
        containsUsed = true;
      }
      rectCount += 1;
      sum += cell.value;
      if (cell.mushroom && (x === rect.x1 || x === rect.x2 || y === rect.y1 || y === rect.y2)) {
        mushroomEdge += 1;
      }
    }
  }

  if (containsUsed) return { ok: false, message: "이미 사용한 칸이 포함되어 있습니다." };
  if (sum !== target) return { ok: false, message: `합이 ${target}이(가) 아닙니다.` };
  if (mushroomEdge < 1) return { ok: false, message: "직사각형 경계에 버섯 칸이 최소 1개 있어야 합니다." };
  if (rectCount < 2) return { ok: false, message: "영역이 너무 작습니다." };

  return { ok: true, scoreGain: sum + mushroomEdge * 2 };
}

function hasValidMove(board, target) {
  for (let y1 = 0; y1 < SIZE; y1++) {
    for (let x1 = 0; x1 < SIZE; x1++) {
      for (let y2 = y1; y2 < SIZE; y2++) {
        for (let x2 = x1; x2 < SIZE; x2++) {
          if (x1 === x2 && y1 === y2) continue;
          const rect = { x1, y1, x2, y2 };
          let sum = 0;
          let mushroomEdge = 0;
          let hasUsed = false;
          for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
              const cell = board[y][x];
              if (cell.used) hasUsed = true;
              sum += cell.value;
              if (
                cell.mushroom &&
                (x === x1 || x === x2 || y === y1 || y === y2)
              ) {
                mushroomEdge += 1;
              }
            }
          }
          if (!hasUsed && sum === target && mushroomEdge >= 1) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

const PAGE_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mushroom Clash</title>
    <style>
      :root {
        --bg: #f7f2eb;
        --panel: #fff8ee;
        --line: #d7c9ae;
        --text: #2f2a22;
        --accent: #2d6a4f;
        --danger: #8d2b2b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Pretendard", "Apple SD Gothic Neo", Arial, sans-serif;
        background: linear-gradient(180deg, #fef6e4 0%, #f2e4cf 100%);
        color: var(--text);
      }
      .wrap {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px;
      }
      h1 {
        margin: 0 0 8px;
      }
      .panel {
        background: var(--panel);
        border: 2px solid var(--line);
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 14px;
      }
      .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      input, button {
        font: inherit;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 8px 10px;
      }
      button {
        background: #fff;
        cursor: pointer;
      }
      button:hover { background: #f5efdf; }
      .btn-primary {
        background: var(--accent);
        color: white;
        border-color: #1f503b;
      }
      .btn-danger {
        background: var(--danger);
        color: white;
        border-color: #5d1f1f;
      }
      .btn-disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .room-line { margin-bottom: 8px; }
      .board {
        display: grid;
        grid-template-columns: repeat(7, 48px);
        grid-auto-rows: 48px;
        gap: 8px;
        justify-content: center;
        margin: 16px auto;
      }
      .cell {
        border: 1px solid #6d6242;
        background: #fff;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        position: relative;
        user-select: none;
      }
      .cell.used {
        opacity: 0.35;
        background: #ddd1bc;
      }
      .cell.active {
        outline: 3px solid #4d8ca3;
        outline-offset: -3px;
      }
      .cell[data-mushroom="true"]::after {
        content: "🍄";
        font-size: 14px;
        line-height: 1;
        position: absolute;
        top: 2px;
        right: 2px;
      }
      .small {
        font-size: 13px;
        color: #4c473c;
      }
      .status {
        white-space: pre-line;
      }
      .logs {
        max-height: 120px;
        overflow: auto;
        border: 1px dashed #b5a07d;
        background: #fffdf8;
        padding: 8px;
      }
      @media (max-width: 680px) {
        .board {
          grid-template-columns: repeat(7, 44px);
          grid-auto-rows: 44px;
          gap: 6px;
        }
        .cell { font-size: 14px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Mushroom Clash</h1>
      <p class="small">직사각형을 두 번 클릭해서 선택하세요. 합은 10, 경계엔 🍄 최소 1개가 필요해요.</p>
      <div class="panel">
        <div class="room-line">
          <label for="roomId">방 코드</label><br />
          <div class="row">
            <input id="roomId" placeholder="예: game123" />
            <button id="joinBtn">방 입장</button>
            <button id="createBtn" class="btn-primary">방 만들기</button>
            <button id="copyBtn">링크 복사</button>
          </div>
        </div>
        <div class="row">
          <button id="skipBtn">건너뛰기</button>
          <button id="restartBtn">다시 시작</button>
          <button id="clearBtn">선택 지우기</button>
        </div>
      </div>
      <div class="panel">
        <div class="status" id="status">준비 중...</div>
        <div class="small" id="scoreBoard"></div>
      </div>
      <div id="board" class="board"></div>
      <div class="panel">
        <div class="small">이벤트 로그</div>
        <div class="logs" id="log"></div>
      </div>
    </div>

    <script>
      let socket = null;
      let seat = null;
      let state = null;
      let firstPick = null;

      const roomInput = document.getElementById("roomId");
      const joinBtn = document.getElementById("joinBtn");
      const createBtn = document.getElementById("createBtn");
      const copyBtn = document.getElementById("copyBtn");
      const skipBtn = document.getElementById("skipBtn");
      const restartBtn = document.getElementById("restartBtn");
      const clearBtn = document.getElementById("clearBtn");
      const statusBox = document.getElementById("status");
      const scoreBoard = document.getElementById("scoreBoard");
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
        navigator.clipboard.writeText(url).then(() => {
          log("초대 링크를 복사했습니다.");
        });
      });

      skipBtn.addEventListener("click", () => send({ type: "skip" }));
      restartBtn.addEventListener("click", () => {
        if (!socket) return;
        send({ type: "restart" });
      });
      clearBtn.addEventListener("click", () => {
        firstPick = null;
        renderBoard();
      });

      function connect(room) {
        if (socket) {
          socket.close();
        }
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(proto + "://" + location.host + "/ws/room/" + encodeURIComponent(room));
        socket = ws;
        log("방 " + room + " 연결 시도");
        ws.onopen = () => {
          statusBox.textContent = "연결 시도 중: " + room;
          roomInput.value = room;
          window.history.replaceState({}, "", "?room=" + encodeURIComponent(room));
          firstPick = null;
        };
        ws.onmessage = (evt) => {
          const data = JSON.parse(evt.data);
          switch (data.type) {
            case "hello":
              seat = data.seat;
              state = data.state;
              renderBoard();
               log("내 자리: Player " + seat);
              break;
            case "state":
              state = data.state;
              renderBoard();
              break;
            case "error":
               log("오류: " + data.message);
              break;
            case "pong":
              break;
          }
        };
        ws.onclose = () => {
          statusBox.textContent = "연결이 끊겼습니다.";
          if (socket === ws) {
            socket = null;
          }
        };
      }

      function send(payload) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify(payload));
      }

      function renderBoard() {
        if (!state) return;
        boardEl.style.gridTemplateColumns = "repeat(" + state.boardSize + ", minmax(0, 1fr))";
        boardEl.innerHTML = "";

        for (let y = 0; y < state.board.length; y++) {
          for (let x = 0; x < state.board[y].length; x++) {
            const cell = state.board[y][x];
            const button = document.createElement("button");
            button.className = "cell";
            button.type = "button";
            button.dataset.x = x;
            button.dataset.y = y;
            button.dataset.mushroom = String(!!cell.mushroom);
            button.textContent = cell.value;
            if (cell.used) button.classList.add("used");
            if (isInFirstPick(x, y) || isInSecondPick(x, y)) button.classList.add("active");
            if (!cell.used && state.status === "playing" && seat === state.turn) {
              button.addEventListener("click", () => handleCellClick(x, y));
            } else {
              button.disabled = true;
            }
            boardEl.appendChild(button);
          }
        }

        const connected1 = state.connectedSeats["1"] ? "O" : "-";
        const connected2 = state.connectedSeats["2"] ? "O" : "-";
        const p1 = state.scores["1"] ?? 0;
        const p2 = state.scores["2"] ?? 0;
        const winnerText =
          state.status === "finished"
            ? state.winner === 0
              ? "무승부"
               : "승자: Player " + state.winner
            : state.status === "waiting"
              ? "상대 대기 중"
              : "게임 진행 중";
        statusBox.textContent =
          "상태: " + winnerText + " / 현재 턴: Player " + state.turn;
        scoreBoard.textContent =
          "연결: P1 " + connected1 + ", P2 " + connected2 + " / 점수: P1 " + p1 + " : P2 " + p2 + " / 건너뛰기: " + state.skipCount;

        skipBtn.classList.toggle("btn-disabled", !(state && seat !== null && state.status !== "finished" && state.turn === seat));
        skipBtn.disabled = !(state && seat !== null && state.status !== "finished" && state.turn === seat);

        restartBtn.disabled = false;
      }

      function handleCellClick(x, y) {
        const cell = state.board[y][x];
        if (cell.used) return;
        if (!firstPick) {
          firstPick = { x, y };
          renderBoard();
          return;
        }

        if (firstPick.x === x && firstPick.y === y) {
          firstPick = null;
          renderBoard();
          return;
        }

        const move = {
          type: "move",
          x1: firstPick.x,
          y1: firstPick.y,
          x2: x,
          y2: y,
        };
        send(move);
        firstPick = null;
      }

      function isInFirstPick(x, y) {
        return !!firstPick && firstPick.x === x && firstPick.y === y;
      }
      function isInSecondPick(x, y) {
        return false;
      }

      function log(message) {
        const d = document.createElement("div");
        d.textContent = "[" + new Date().toLocaleTimeString() + "] " + message;
        logBox.prepend(d);
      }
    </script>
  </body>
</html>`;
