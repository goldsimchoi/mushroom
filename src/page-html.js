export const PAGE_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#139b4f" />
    <title>Apple Box Duel · 합쳐서 10</title>
    <style>
      :root {
        --ink: #203323;
        --muted: #66776a;
        --cream: #fffdf2;
        --paper: #f5f2dc;
        --green: #159d51;
        --green-dark: #08753a;
        --green-soft: #dff2bd;
        --apple: #f04432;
        --apple-dark: #c92d23;
        --yellow: #ffd84d;
        --p1: #347fda;
        --p1-soft: #dbeaff;
        --p2: #915ed7;
        --p2-soft: #eedfff;
        --line: rgba(24, 75, 39, 0.16);
        --shadow: 0 22px 58px rgba(35, 91, 49, 0.18);
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body {
        min-height: 100vh;
        color: var(--ink);
        font-family: "Arial Rounded MT Bold", "SUIT", "Pretendard", "Apple SD Gothic Neo", sans-serif;
        background:
          radial-gradient(circle at 14% 8%, rgba(255, 255, 255, 0.88) 0 8%, transparent 24%),
          radial-gradient(circle at 86% 12%, rgba(255, 232, 140, 0.42) 0 6%, transparent 23%),
          linear-gradient(180deg, #f7fadf 0%, #e4f1cb 100%);
      }

      button, input { font: inherit; }
      button { touch-action: manipulation; }
      .page { width: min(1220px, calc(100% - 28px)); margin: 0 auto; padding: 24px 0 40px; }
      .brand { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
      .brand-copy { display: flex; align-items: center; gap: 14px; min-width: 0; }
      .brand-apple { font-size: 52px; filter: drop-shadow(0 8px 8px rgba(141, 50, 31, 0.16)); }
      .brand h1 { margin: 0; font-size: clamp(26px, 4vw, 46px); line-height: 0.95; letter-spacing: -0.055em; }
      .brand h1 span { color: var(--apple); }
      .brand p { margin: 7px 0 0; color: var(--muted); font-size: 14px; font-weight: 700; }
      .rule-chip {
        flex: 0 0 auto;
        padding: 10px 14px;
        border: 1px solid rgba(90, 117, 68, 0.18);
        border-radius: 999px;
        background: rgba(255, 255, 245, 0.7);
        color: #4e6a45;
        font-size: 12px;
        font-weight: 900;
      }

      .room-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 9px;
        margin-bottom: 14px;
        padding: 11px;
        border: 1px solid rgba(68, 107, 63, 0.18);
        border-radius: 18px;
        background: rgba(255, 255, 247, 0.84);
        box-shadow: 0 12px 28px rgba(58, 98, 57, 0.09);
        backdrop-filter: blur(12px);
      }
      .room-bar input {
        min-width: 210px;
        flex: 1 1 240px;
        height: 44px;
        padding: 0 15px;
        border: 1px solid #cad8b6;
        border-radius: 12px;
        outline: none;
        background: #fffef7;
        color: var(--ink);
        font-weight: 800;
      }
      .room-bar input:focus { border-color: var(--green); box-shadow: 0 0 0 4px rgba(21, 157, 81, 0.12); }
      .btn {
        min-height: 44px;
        padding: 0 16px;
        border: 0;
        border-radius: 12px;
        background: #ffffff;
        color: #34503a;
        box-shadow: 0 5px 12px rgba(48, 82, 51, 0.12);
        cursor: pointer;
        font-size: 14px;
        font-weight: 900;
        transition: transform 120ms ease, opacity 120ms ease, box-shadow 120ms ease;
      }
      .btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(48, 82, 51, 0.17); }
      .btn:focus-visible { outline: 3px solid rgba(255, 216, 77, 0.9); outline-offset: 2px; }
      .btn-primary { background: linear-gradient(180deg, #ff5a42, #e83c2c); color: white; }
      .btn-green { background: linear-gradient(180deg, #28b961, #119749); color: white; }
      .btn:disabled { opacity: 0.42; cursor: not-allowed; box-shadow: none; }

      .cabinet {
        position: relative;
        padding: 18px;
        border: 5px solid #087f3e;
        border-radius: 34px;
        background: linear-gradient(145deg, #20b85f, #079345);
        box-shadow: var(--shadow), inset 0 2px 0 rgba(255, 255, 255, 0.3), inset 0 -5px 0 rgba(0, 83, 36, 0.2);
      }
      .cabinet::before {
        content: "";
        position: absolute;
        inset: 8px;
        pointer-events: none;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 23px;
      }
      .game-hud {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(170px, 1fr) minmax(250px, 1.4fr) minmax(170px, 1fr);
        gap: 12px;
        margin-bottom: 12px;
      }
      .player-card, .timer-card {
        min-height: 92px;
        padding: 13px 15px;
        border-radius: 18px;
        background: rgba(255, 254, 240, 0.96);
        box-shadow: inset 0 -2px 0 rgba(75, 105, 53, 0.1), 0 7px 16px rgba(0, 86, 39, 0.13);
      }
      .player-card { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px; border: 3px solid transparent; }
      .player-card.active.p1 { border-color: var(--p1); }
      .player-card.active.p2 { border-color: var(--p2); }
      .player-card.urgent { animation: urgentPulse 700ms ease-in-out infinite alternate; }
      .player-badge {
        width: 54px;
        height: 54px;
        display: grid;
        place-items: center;
        border-radius: 16px;
        color: white;
        font-size: 17px;
        font-weight: 1000;
        box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.32);
      }
      .p1 .player-badge { background: var(--p1); }
      .p2 .player-badge { background: var(--p2); }
      .player-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .player-name { font-size: 13px; color: var(--muted); font-weight: 900; }
      .player-score { font-size: 34px; line-height: 1; letter-spacing: -0.05em; }
      .player-score small { margin-left: 3px; font-size: 11px; color: var(--muted); letter-spacing: 0; }
      .turn-label { margin-top: 6px; font-size: 11px; color: var(--muted); font-weight: 900; }
      .turn-track { height: 6px; margin-top: 6px; overflow: hidden; border-radius: 99px; background: #dce5d3; }
      .turn-fill { width: 0; height: 100%; border-radius: inherit; transition: width 100ms linear, background 160ms ease; }
      .p1 .turn-fill { background: var(--p1); }
      .p2 .turn-fill { background: var(--p2); }

      .timer-card { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      .timer-title { font-size: 11px; color: #67805e; font-weight: 1000; letter-spacing: 0.12em; }
      .match-time { margin-top: 2px; font-variant-numeric: tabular-nums; font-size: 35px; line-height: 1; letter-spacing: -0.05em; }
      .turn-time-pill {
        margin-top: 7px;
        padding: 5px 11px;
        border-radius: 99px;
        background: #e8f4da;
        color: #3d6a34;
        font-size: 12px;
        font-weight: 1000;
        font-variant-numeric: tabular-nums;
      }
      .turn-time-pill.warning { background: #fff0b3; color: #8d5b00; }
      .turn-time-pill.urgent { background: #ffe0dc; color: #c52e22; }

      .status-strip {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        margin-bottom: 10px;
        padding: 8px 14px;
        border: 1px solid rgba(255, 255, 255, 0.38);
        border-radius: 12px;
        background: rgba(4, 100, 44, 0.48);
        color: white;
        text-align: center;
        font-size: 13px;
        font-weight: 900;
      }

      .board-layout { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) 34px; gap: 10px; }
      .board-panel {
        position: relative;
        overflow: hidden;
        min-height: 260px;
        padding: 12px;
        border: 4px solid #f1f6d5;
        border-radius: 16px;
        background-color: #d9efba;
        background-image:
          linear-gradient(45deg, rgba(255, 255, 255, 0.44) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.44) 75%),
          linear-gradient(45deg, rgba(255, 255, 255, 0.44) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.44) 75%);
        background-position: 0 0, 9px 9px;
        background-size: 18px 18px;
        box-shadow: inset 0 0 0 2px rgba(74, 124, 57, 0.2);
      }
      #board { display: grid; gap: 2px; width: 100%; user-select: none; touch-action: none; }
      .board-empty { min-height: 320px; display: grid; place-items: center; text-align: center; color: #51724c; font-weight: 900; }
      .board-empty span { display: block; margin-bottom: 8px; font-size: 58px; }
      .apple-cell {
        position: relative;
        display: grid;
        place-items: center;
        min-width: 0;
        aspect-ratio: 1;
        padding: 0;
        overflow: hidden;
        border: 1px solid transparent;
        border-radius: 9px;
        background: transparent;
        color: white;
        cursor: default;
      }
      .apple-cell.interactive { cursor: crosshair; }
      .apple-cell.interactive:hover { background: rgba(255, 238, 113, 0.34); }
      .apple-glyph {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-family: "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
        font-size: clamp(20px, 3.35vw, 42px);
        line-height: 1;
        filter: drop-shadow(0 3px 2px rgba(113, 52, 26, 0.2));
        transition: transform 120ms ease, filter 120ms ease;
      }
      .apple-value {
        position: relative;
        z-index: 2;
        margin-top: 9%;
        color: white;
        font-size: clamp(10px, 1.5vw, 18px);
        line-height: 1;
        font-weight: 1000;
        text-shadow: 0 1px 2px rgba(94, 20, 12, 0.8);
        pointer-events: none;
      }
      .apple-cell.selected {
        border-color: #ffb900;
        background: rgba(255, 232, 80, 0.52);
        box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.62);
      }
      .apple-cell.selected .apple-glyph { transform: scale(1.08); filter: drop-shadow(0 4px 4px rgba(150, 79, 22, 0.28)); }
      .apple-cell.selection-start::after, .apple-cell.selection-end::after {
        position: absolute;
        right: 1px;
        top: 1px;
        z-index: 4;
        width: 15px;
        height: 15px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        color: white;
        font-size: 8px;
        font-weight: 1000;
      }
      .apple-cell.selection-start::after { content: "1"; background: #d79b00; }
      .apple-cell.selection-end::after { content: "2"; background: #e65028; }
      .apple-cell.hint-target { background: rgba(78, 224, 167, 0.52); box-shadow: inset 0 0 0 2px #0d9f68; }
      .apple-cell.hint-start::after, .apple-cell.hint-end::after {
        position: absolute;
        right: 1px;
        bottom: 1px;
        z-index: 4;
        width: 15px;
        height: 15px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: #087e55;
        color: white;
        font-size: 8px;
        font-weight: 1000;
      }
      .apple-cell.hint-start::after { content: "1"; }
      .apple-cell.hint-end::after { content: "2"; }
      .apple-cell.claimed { border-color: rgba(255, 255, 255, 0.46); }
      .apple-cell.claimed.owner-1 { background: rgba(52, 127, 218, 0.68); }
      .apple-cell.claimed.owner-2 { background: rgba(145, 94, 215, 0.68); }
      .claimed-mark { font-size: clamp(8px, 1.05vw, 12px); font-weight: 1000; color: white; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); }

      .match-gauge {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 7px;
        color: white;
        font-size: 10px;
        font-weight: 1000;
      }
      .gauge-track {
        position: relative;
        flex: 1;
        width: 15px;
        min-height: 240px;
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.76);
        border-radius: 99px;
        background: rgba(4, 91, 41, 0.58);
      }
      .gauge-fill { position: absolute; right: 0; bottom: 0; left: 0; height: var(--gauge-percent, 100%); background: linear-gradient(180deg, #ffe557, #ff9b32); transition: height 100ms linear, width 100ms linear; }

      .hint-strip {
        position: relative;
        z-index: 1;
        margin-top: 10px;
        padding: 9px 12px;
        border-radius: 11px;
        background: rgba(255, 255, 242, 0.94);
        color: #436044;
        text-align: center;
        font-size: 12px;
        font-weight: 800;
      }
      .actions { position: relative; z-index: 1; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 10px; }
      .actions .btn { min-width: 104px; }

      .below { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; margin-top: 14px; }
      .rules, details {
        border: 1px solid rgba(67, 103, 62, 0.15);
        border-radius: 15px;
        background: rgba(255, 255, 245, 0.7);
        color: #5c705d;
        font-size: 12px;
      }
      .rules { padding: 11px 14px; line-height: 1.6; }
      details { min-width: 220px; overflow: hidden; }
      summary { padding: 11px 14px; cursor: pointer; font-weight: 900; }
      .logs { max-height: 110px; overflow: auto; padding: 0 14px 12px; line-height: 1.55; }

      @keyframes urgentPulse { from { box-shadow: 0 0 0 0 rgba(255, 216, 77, 0); } to { box-shadow: 0 0 0 5px rgba(255, 216, 77, 0.72); } }

      @media (max-width: 780px) {
        .page { width: min(100% - 16px, 720px); padding-top: 14px; }
        .brand { align-items: flex-start; }
        .brand-apple { font-size: 42px; }
        .rule-chip { display: none; }
        .cabinet { padding: 11px; border-width: 4px; border-radius: 24px; }
        .game-hud { grid-template-columns: 1fr 1fr; }
        .timer-card { grid-column: 1 / -1; grid-row: 1; min-height: 78px; }
        .player-card { min-height: 76px; padding: 10px; }
        .player-badge { width: 43px; height: 43px; border-radius: 12px; font-size: 14px; }
        .player-score { font-size: 27px; }
        .board-layout { grid-template-columns: 1fr; }
        .match-gauge { flex-direction: row; }
        .gauge-track { width: auto; min-height: 10px; height: 10px; }
        .gauge-fill { width: var(--gauge-percent, 100%); height: 100%; right: auto; }
        .board-panel { padding: 7px; border-width: 3px; }
        #board { gap: 1px; }
        .apple-cell { border-radius: 5px; }
        .below { grid-template-columns: 1fr; }
        details { min-width: 0; }
      }

      @media (max-width: 480px) {
        .brand p { font-size: 12px; }
        .room-bar .btn { flex: 1 1 auto; padding: 0 10px; }
        .player-name { font-size: 10px; }
        .player-score small, .turn-label { display: none; }
        .player-card { grid-template-columns: auto 1fr; gap: 8px; }
        .apple-value { margin-top: 12%; font-size: clamp(8px, 2.8vw, 13px); }
        .apple-glyph { font-size: clamp(15px, 5.7vw, 27px); }
        .board-empty { min-height: 230px; }
        .actions .btn { min-width: 0; flex: 1 1 30%; padding: 0 9px; }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="brand">
        <div class="brand-copy">
          <div class="brand-apple" aria-hidden="true">🍎</div>
          <div>
            <h1>Apple Box <span>Duel</span></h1>
            <p>합이 10이 되는 사과 상자를 찾아 더 많은 칸을 차지하세요.</p>
          </div>
        </div>
        <div class="rule-chip">공통 180초 · 한 턴 20초</div>
      </header>

      <section class="room-bar" aria-label="게임 방 설정">
        <input id="roomId" aria-label="방 코드" placeholder="방 코드 입력" autocomplete="off" />
        <button id="joinBtn" class="btn">방 입장</button>
        <button id="createBtn" class="btn btn-primary">대결 만들기</button>
        <button id="copyBtn" class="btn">초대 링크</button>
      </section>

      <main class="cabinet">
        <div class="game-hud">
          <section class="player-card p1" id="scoreCard1" aria-label="플레이어 1 점수">
            <div class="player-badge">1P</div>
            <div>
              <div class="player-top"><span class="player-name">BLUE PICKER</span><strong class="player-score"><span id="scoreValue1">0</span><small>칸</small></strong></div>
              <div class="turn-label" id="scoreTurn1">상대 대기</div>
              <div class="turn-track"><div class="turn-fill" id="turnFill1"></div></div>
            </div>
          </section>

          <section class="timer-card" aria-label="경기 타이머">
            <div class="timer-title">MATCH TIME</div>
            <strong class="match-time" id="matchTime">3:00</strong>
            <div class="turn-time-pill" id="turnTime">턴 0:20</div>
          </section>

          <section class="player-card p2" id="scoreCard2" aria-label="플레이어 2 점수">
            <div class="player-badge">2P</div>
            <div>
              <div class="player-top"><span class="player-name">PURPLE PICKER</span><strong class="player-score"><span id="scoreValue2">0</span><small>칸</small></strong></div>
              <div class="turn-label" id="scoreTurn2">상대 대기</div>
              <div class="turn-track"><div class="turn-fill" id="turnFill2"></div></div>
            </div>
          </section>
        </div>

        <div class="status-strip" id="status" role="status">방을 만들거나 코드를 입력해 대결을 시작하세요.</div>

        <div class="board-layout">
          <section class="board-panel" aria-label="사과 게임판">
            <div id="board"><div class="board-empty"><div><span>🍎</span>두 플레이어가 모이면 사과가 열립니다.</div></div></div>
          </section>
          <aside class="match-gauge" aria-label="전체 경기 시간 게이지">
            <span>TIME</span>
            <div class="gauge-track" role="progressbar" aria-valuemin="0" aria-valuemax="180" aria-valuenow="180" id="matchGauge">
              <div class="gauge-fill" id="matchGaugeFill"></div>
            </div>
          </aside>
        </div>

        <div class="hint-strip" id="hint">PC에서는 사과들을 드래그하고, 모바일에서는 시작과 끝을 차례로 탭하세요.</div>

        <div class="actions">
          <button id="hintBtn" class="btn" type="button" disabled>힌트</button>
          <button id="skipBtn" class="btn" type="button" disabled>턴 넘기기</button>
          <button id="clearBtn" class="btn" type="button" disabled>선택 취소</button>
          <button id="restartBtn" class="btn btn-green" type="button" disabled>새 판 시작</button>
        </div>
      </main>

      <div class="below">
        <div class="rules"><strong>게임 방법</strong> · 직사각형 안에 남은 사과 숫자의 합이 10이면 모두 내 점수가 됩니다. 전체 180초가 끝났을 때 더 많은 칸을 차지한 플레이어가 승리합니다.</div>
        <details>
          <summary>게임 기록</summary>
          <div class="logs" id="log">아직 기록이 없습니다.</div>
        </details>
      </div>
    </div>

    <script>
      const MATCH_DURATION_MS = 180000;
      const TURN_DURATION_MS = 20000;
      let socket = null;
      let seat = null;
      let state = null;
      let serverOffsetMs = 0;
      let start = null;
      let end = null;
      let dragging = false;
      let hintRect = null;
      let hintRects = [];
      let hintIndex = 0;

      const roomInput = document.getElementById("roomId");
      const joinBtn = document.getElementById("joinBtn");
      const createBtn = document.getElementById("createBtn");
      const copyBtn = document.getElementById("copyBtn");
      const hintBtn = document.getElementById("hintBtn");
      const skipBtn = document.getElementById("skipBtn");
      const restartBtn = document.getElementById("restartBtn");
      const clearBtn = document.getElementById("clearBtn");
      const statusBox = document.getElementById("status");
      const scoreCard1 = document.getElementById("scoreCard1");
      const scoreCard2 = document.getElementById("scoreCard2");
      const scoreValue1 = document.getElementById("scoreValue1");
      const scoreValue2 = document.getElementById("scoreValue2");
      const scoreTurn1 = document.getElementById("scoreTurn1");
      const scoreTurn2 = document.getElementById("scoreTurn2");
      const turnFill1 = document.getElementById("turnFill1");
      const turnFill2 = document.getElementById("turnFill2");
      const matchTime = document.getElementById("matchTime");
      const turnTime = document.getElementById("turnTime");
      const matchGauge = document.getElementById("matchGauge");
      const matchGaugeFill = document.getElementById("matchGaugeFill");
      const hint = document.getElementById("hint");
      const logBox = document.getElementById("log");
      const boardEl = document.getElementById("board");

      const params = new URLSearchParams(window.location.search);
      const prefillRoom = params.get("room");
      if (prefillRoom) {
        roomInput.value = prefillRoom;
        connect(prefillRoom);
      }

      joinBtn.addEventListener("click", function () {
        const room = roomInput.value.trim();
        if (!room) {
          alert("방 코드를 입력하세요.");
          return;
        }
        connect(room);
      });

      roomInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") joinBtn.click();
      });

      createBtn.addEventListener("click", function () {
        const code = Math.random().toString(36).slice(2, 8);
        roomInput.value = code;
        connect(code);
      });

      copyBtn.addEventListener("click", function () {
        const room = roomInput.value.trim();
        if (!room) {
          alert("먼저 방을 만들어 주세요.");
          return;
        }
        const url = location.origin + location.pathname + "?room=" + encodeURIComponent(room);
        navigator.clipboard.writeText(url).then(function () {
          log("초대 링크를 복사했습니다.");
          copyBtn.textContent = "복사 완료";
          setTimeout(function () { copyBtn.textContent = "초대 링크"; }, 1200);
        });
      });

      skipBtn.addEventListener("click", function () { send({ type: "skip" }); });
      restartBtn.addEventListener("click", function () { send({ type: "restart" }); });
      clearBtn.addEventListener("click", function () {
        clearSelection();
        clearHints();
        hint.textContent = "선택을 취소했습니다. 다시 사과 상자를 골라보세요.";
      });

      hintBtn.addEventListener("click", function () {
        if (!isMyTurn()) return;
        if (!hintRect) {
          hintRects = collectHintRects(state.board);
          hintIndex = 0;
        }
        if (hintRects.length === 0) {
          hintRect = null;
          hint.textContent = "현재는 합이 10이 되는 사과 상자가 없습니다.";
          refreshSelectionClasses();
          return;
        }
        hintRect = hintRects[hintIndex % hintRects.length];
        hintIndex += 1;
        hintBtn.textContent = hintRects.length > 1 ? "다음 힌트" : "힌트 표시 중";
        hint.textContent = "초록색 상자의 1번 사과에서 2번 사과까지 선택하면 합이 10입니다.";
        refreshSelectionClasses();
      });

      function connect(room) {
        if (socket) socket.close();
        clearSelection();
        clearHints();
        const protocol = location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(protocol + "://" + location.host + "/ws/room/" + encodeURIComponent(room));
        socket = ws;
        roomInput.value = room;
        window.history.replaceState({}, "", "?room=" + encodeURIComponent(room));
        statusBox.textContent = "방 " + room + "에 연결하고 있습니다...";

        ws.onmessage = function (event) {
          const data = JSON.parse(event.data);
          if (data.serverNow) serverOffsetMs = data.serverNow - Date.now();
          if (data.type === "hello") {
            seat = Number(data.seat);
            state = data.state;
            log("Player " + seat + " 자리로 입장했습니다.");
            renderBoard();
            return;
          }
          if (data.type === "state") {
            clearSelection(false);
            clearHints();
            state = data.state;
            renderBoard();
            return;
          }
          if (data.type === "error") {
            log("오류: " + data.message);
            hint.textContent = data.message;
          }
        };

        ws.onclose = function () {
          if (socket === ws) socket = null;
          statusBox.textContent = "연결이 끊겼습니다. 같은 방으로 다시 입장해 주세요.";
          setControls(false);
        };
      }

      function send(payload) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify(payload));
      }

      function isMyTurn() {
        return Boolean(state && state.status === "playing" && Number(state.turn) === Number(seat));
      }

      function beginMouseDrag(x, y, event) {
        if (!isMyTurn() || event.pointerType === "touch") return;
        event.preventDefault();
        clearHints();
        start = { x: x, y: y };
        end = { x: x, y: y };
        dragging = true;
        hint.textContent = "드래그해서 합이 10인 사과들을 직사각형으로 감싸세요.";
        refreshSelectionClasses();
      }

      function moveMouseDrag(x, y) {
        if (!dragging) return;
        end = { x: x, y: y };
        refreshSelectionClasses();
      }

      function finishMouseDrag(x, y, event) {
        if (event.pointerType === "touch") {
          handleTapSelection(x, y);
          return;
        }
        if (!dragging) return;
        end = { x: x, y: y };
        dragging = false;
        attemptMove();
      }

      function handleTapSelection(x, y) {
        if (!isMyTurn()) return;
        clearHints();
        if (!start) {
          start = { x: x, y: y };
          end = null;
          hint.textContent = "첫 사과를 골랐습니다. 상자의 반대쪽 끝을 탭하세요.";
          refreshSelectionClasses();
          return;
        }
        end = { x: x, y: y };
        attemptMove();
      }

      function attemptMove() {
        if (!start || !end) return;
        if (start.x === end.x && start.y === end.y) {
          hint.textContent = "한 칸만 고를 수는 없습니다. 여러 사과를 감싸주세요.";
          clearSelection(false);
          return;
        }
        send({ type: "move", x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        clearSelection(false);
        clearHints();
      }

      function clearSelection(refresh) {
        start = null;
        end = null;
        dragging = false;
        if (refresh !== false) refreshSelectionClasses();
      }

      function clearHints() {
        hintRect = null;
        hintRects = [];
        hintIndex = 0;
        hintBtn.textContent = "힌트";
        refreshSelectionClasses();
      }

      function renderBoard() {
        if (!state || !state.board || !state.boardSize) return;
        const width = Number(state.boardSize.width);
        const height = Number(state.boardSize.height);
        const canPlay = isMyTurn();
        boardEl.style.gridTemplateColumns = "repeat(" + width + ", minmax(0, 1fr))";
        boardEl.innerHTML = "";

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const data = state.board[y][x];
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "apple-cell";
            cell.dataset.x = String(x);
            cell.dataset.y = String(y);
            cell.dataset.owner = String(data.owner);
            cell.setAttribute("aria-label", data.owner === 0 ? "숫자 " + data.value + " 사과" : "Player " + data.owner + " 점유 칸");

            if (data.owner === 0) {
              const glyph = document.createElement("span");
              glyph.className = "apple-glyph";
              glyph.setAttribute("aria-hidden", "true");
              glyph.textContent = "🍎";
              const value = document.createElement("span");
              value.className = "apple-value";
              value.textContent = String(data.value);
              cell.appendChild(glyph);
              cell.appendChild(value);
            } else {
              cell.classList.add("claimed", "owner-" + data.owner);
              const mark = document.createElement("span");
              mark.className = "claimed-mark";
              mark.textContent = data.owner + "P";
              cell.appendChild(mark);
            }

            if (canPlay && data.owner === 0) {
              cell.classList.add("interactive");
              cell.addEventListener("pointerdown", function (event) { beginMouseDrag(x, y, event); });
              cell.addEventListener("pointerenter", function () { moveMouseDrag(x, y); });
              cell.addEventListener("pointerup", function (event) { finishMouseDrag(x, y, event); });
              cell.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleTapSelection(x, y);
                }
              });
            } else {
              cell.tabIndex = -1;
            }
            boardEl.appendChild(cell);
          }
        }

        updateGameLabels();
        refreshSelectionClasses();
        setControls(true);
      }

      window.addEventListener("pointerup", function (event) {
        if (!dragging) return;
        dragging = false;
        if (event.target && event.target.closest && event.target.closest(".apple-cell")) return;
        clearSelection();
        hint.textContent = "게임판 안에서 드래그를 마쳐주세요.";
      });

      function refreshSelectionClasses() {
        const cells = boardEl.querySelectorAll(".apple-cell");
        cells.forEach(function (cell) {
          const x = Number(cell.dataset.x);
          const y = Number(cell.dataset.y);
          cell.classList.toggle("selected", isInsideCurrentSelection(x, y));
          cell.classList.toggle("selection-start", Boolean(start && start.x === x && start.y === y));
          cell.classList.toggle("selection-end", Boolean(end && end.x === x && end.y === y && (!start || start.x !== x || start.y !== y)));
          cell.classList.toggle("hint-target", isInsideHint(x, y));
          cell.classList.toggle("hint-start", Boolean(hintRect && hintRect.startX === x && hintRect.startY === y));
          cell.classList.toggle("hint-end", Boolean(hintRect && hintRect.endX === x && hintRect.endY === y));
        });
      }

      function isInsideCurrentSelection(x, y) {
        if (!start) return false;
        const finish = end || start;
        return x >= Math.min(start.x, finish.x) && x <= Math.max(start.x, finish.x) && y >= Math.min(start.y, finish.y) && y <= Math.max(start.y, finish.y);
      }

      function isInsideHint(x, y) {
        return Boolean(hintRect && x >= hintRect.x1 && x <= hintRect.x2 && y >= hintRect.y1 && y <= hintRect.y2);
      }

      function collectHintRects(board) {
        const rects = [];
        const height = board.length;
        const width = height ? board[0].length : 0;
        for (let y1 = 0; y1 < height; y1 += 1) {
          for (let x1 = 0; x1 < width; x1 += 1) {
            for (let y2 = y1; y2 < height; y2 += 1) {
              for (let x2 = x1; x2 < width; x2 += 1) {
                if (x1 === x2 && y1 === y2) continue;
                const primaryCornersOpen = board[y1][x1].owner === 0 && board[y2][x2].owner === 0;
                const secondaryCornersOpen = x1 !== x2 && y1 !== y2 && board[y1][x2].owner === 0 && board[y2][x1].owner === 0;
                if (!primaryCornersOpen && !secondaryCornersOpen) continue;
                let sum = 0;
                for (let y = y1; y <= y2; y += 1) {
                  for (let x = x1; x <= x2; x += 1) {
                    if (board[y][x].owner === 0) sum += Number(board[y][x].value);
                  }
                }
                if (sum === 10) {
                  rects.push({
                    x1: x1,
                    y1: y1,
                    x2: x2,
                    y2: y2,
                    startX: primaryCornersOpen ? x1 : x2,
                    startY: y1,
                    endX: primaryCornersOpen ? x2 : x1,
                    endY: y2,
                  });
                  if (rects.length >= 8) return rects;
                }
              }
            }
          }
        }
        return rects;
      }

      function updateGameLabels() {
        if (!state) return;
        const p1 = Number(state.scores["1"] || 0);
        const p2 = Number(state.scores["2"] || 0);
        scoreValue1.textContent = String(p1);
        scoreValue2.textContent = String(p2);
        scoreCard1.classList.toggle("active", state.status === "playing" && Number(state.turn) === 1);
        scoreCard2.classList.toggle("active", state.status === "playing" && Number(state.turn) === 2);

        if (state.status === "finished") {
          statusBox.textContent = state.winner === 0 ? "시간 종료 · 무승부입니다!" : "시간 종료 · Player " + state.winner + " 승리!";
          scoreTurn1.textContent = state.winner === 1 ? "승리" : state.winner === 0 ? "무승부" : "패배";
          scoreTurn2.textContent = state.winner === 2 ? "승리" : state.winner === 0 ? "무승부" : "패배";
        } else if (state.status === "waiting") {
          statusBox.textContent = "상대가 들어오면 공통 180초 타이머가 시작됩니다.";
          scoreTurn1.textContent = state.connectedSeats["1"] ? "준비 완료" : "접속 대기";
          scoreTurn2.textContent = state.connectedSeats["2"] ? "준비 완료" : "접속 대기";
        } else {
          statusBox.textContent = Number(state.turn) === Number(seat) ? "내 차례입니다. 20초 안에 합이 10인 상자를 찾으세요!" : "상대가 사과 상자를 고르고 있습니다.";
          scoreTurn1.textContent = Number(state.turn) === 1 ? "현재 턴" : "상대 턴";
          scoreTurn2.textContent = Number(state.turn) === 2 ? "현재 턴" : "상대 턴";
        }
      }

      function setControls(hasState) {
        const myTurn = hasState && isMyTurn();
        hintBtn.disabled = !myTurn;
        skipBtn.disabled = !myTurn;
        clearBtn.disabled = !myTurn;
        restartBtn.disabled = !hasState || !state;
      }

      function getVisibleTimers() {
        if (!state || !state.timers) return { match: MATCH_DURATION_MS, turn: TURN_DURATION_MS };
        let match = Number(state.timers.matchRemainingMs);
        let turn = Number(state.timers.turnRemainingMs);
        if (state.timers.runningSince !== null && state.status === "playing") {
          const elapsed = Math.max(0, Date.now() + serverOffsetMs - Number(state.timers.runningSince));
          match = Math.max(0, match - elapsed);
          turn = Math.max(0, turn - elapsed);
        }
        return { match: match, turn: turn };
      }

      function formatClock(ms) {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = String(totalSeconds % 60).padStart(2, "0");
        return minutes + ":" + seconds;
      }

      function renderTimers() {
        const timers = getVisibleTimers();
        const matchPercent = Math.max(0, Math.min(100, timers.match / MATCH_DURATION_MS * 100));
        const turnPercent = Math.max(0, Math.min(100, timers.turn / TURN_DURATION_MS * 100));
        matchTime.textContent = formatClock(timers.match);
        turnTime.textContent = "턴 " + formatClock(timers.turn);
        matchGaugeFill.style.setProperty("--gauge-percent", matchPercent + "%");
        matchGauge.setAttribute("aria-valuenow", String(Math.ceil(timers.match / 1000)));
        turnTime.classList.toggle("warning", timers.turn <= 10000 && timers.turn > 5000 && state && state.status === "playing");
        turnTime.classList.toggle("urgent", timers.turn <= 5000 && state && state.status === "playing");
        scoreCard1.classList.toggle("urgent", Boolean(state && state.status === "playing" && Number(state.turn) === 1 && timers.turn <= 5000));
        scoreCard2.classList.toggle("urgent", Boolean(state && state.status === "playing" && Number(state.turn) === 2 && timers.turn <= 5000));
        turnFill1.style.width = state && state.status === "playing" && Number(state.turn) === 1 ? turnPercent + "%" : "0%";
        turnFill2.style.width = state && state.status === "playing" && Number(state.turn) === 2 ? turnPercent + "%" : "0%";
      }

      function log(message) {
        if (logBox.textContent === "아직 기록이 없습니다.") logBox.textContent = "";
        const entry = document.createElement("div");
        entry.textContent = "[" + new Date().toLocaleTimeString() + "] " + message;
        logBox.prepend(entry);
      }

      setInterval(renderTimers, 100);
      renderTimers();
    </script>
  </body>
</html>`;
