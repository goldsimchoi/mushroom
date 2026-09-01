# Apple Box Duel (Cloudflare + GitHub 연동)

이 프로젝트는 사과게임(Fruit Box)의 감성을 살린 2인 실시간 대전 게임입니다.
Cloudflare Workers + Durable Objects로 WebSocket 기반 실시간 방 기능을 만들고,  
방 코드로 친구가 바로 참가할 수 있게 구성했습니다.

## 구성 요소

- `src/index.js`: Cloudflare Worker + Durable Object 서버
- `wrangler.toml`: Cloudflare 배포 설정
- `README.md`: 실행/배포 가이드
- `.gitignore`: 배포/개발 산출물 제외 목록

## 게임 규칙

- 숫자가 적힌 17x10 사과 보드에서 직사각형을 선택
  - PC: 드래그
  - 모바일/키보드: 시작 칸과 끝 칸을 차례로 선택
- 유효 조건
  - 선택 칸이 1칸(동일 점)이어서는 안 됨
  - 직사각형 안에 남아 있는 사과 숫자의 합이 `10`이어야 함
- 점수 = 차지한 칸 수
- 두 플레이어가 연결되면 공통 경기 시간 180초가 시작됨
- 한 턴은 최대 20초이며, 시간이 끝나면 자동으로 상대 턴으로 전환됨
- 두 플레이어가 자발적으로 연속 패스하면 현재 점수로 즉시 종료됨
- 연결이 끊긴 동안에는 경기 시간과 턴 시간이 함께 일시정지됨
- 공통 경기 시간이 끝나거나 더 이상 유효한 수가 없으면 점수 비교로 승패 결정

## 로컬 테스트

1. Cloudflare CLI 설치
```bash
npm i -g wrangler
```

2. 로그인
```bash
wrangler login
```

3. 로컬 실행
```bash
wrangler dev
```

브라우저 접속 후
- 방 만들기 또는 방 코드 입력 후 입장
- 친구에게 `?room=<코드>` 링크 공유

## GitHub 연동

```bash
git init
git add .
git commit -m "feat: add mushroom game and cloudflare multiplayer server"
git remote add origin https://github.com/goldsimchoi/mushroom.git
git branch -M main
git push -u origin main
```

## Cloudflare 배포

```bash
wrangler deploy
```

기본적으로 Worker가 루트(`/`)에서 게임 화면과 `/ws/room/<roomId>` WebSocket을 제공합니다.
