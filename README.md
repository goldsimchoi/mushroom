# Mushroom Clash (Cloudflare + GitHub 연동 실전)

이 프로젝트는 2인 턴제 버섯 게임입니다.
Cloudflare Workers + Durable Objects로 WebSocket 기반 실시간 방 기능을 만들고,  
방 코드로 친구가 바로 참가할 수 있게 구성했습니다.

## 구성 요소

- `src/index.js`: Cloudflare Worker + Durable Object 서버
- `wrangler.toml`: Cloudflare 배포 설정
- `README.md`: 실행/배포 가이드
- `.gitignore`: 배포/개발 산출물 제외 목록

## 게임 규칙

- 숫자 맵 7x7 보드에서 플레이어가 두 점을 클릭해 직사각형을 선택
- 유효 조건
  - 선택 칸이 1칸(동일 점)이어서는 안 됨
  - 직사각형 안에 이미 제거된 칸이 없어야 함
  - 직사각형 숫자 합이 `10` 이어야 함
  - 직사각형 경계(가장자리)에 🍄 칸이 최소 1개 있어야 함
- 점수 = 직사각형 합 + 경계 🍄 개수 × 2
- 유효 수가 없거나 연속 스킵이 2번 발생하면 종료 후 점수 비교로 승패 결정

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
