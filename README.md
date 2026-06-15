# Can I Eat (cie)

간헐적 단식(IF) 섭식 가능 여부 판정 + 선택적 AI 음식 판단. **독립 실행** 프로젝트 — 자체 Express 서버 + Dockerfile + 자체 compose 로 구동한다.

## DB 아키텍처 — 공유 컨테이너, 프로젝트별 database

Postgres **컨테이너는 doil.me 인프라의 공유 `db` 하나만** 쓴다. 각 프로젝트는 그 안에서 **자기 전용 database** 를 갖는다 (cie 는 database `cie`). 즉:

- **컨테이너**: 공유 `db` (dev-net 별칭 `devdb`) — 이 repo 에는 없음. doil.me docker repo 가 띄운다.
- **database**: `cie` (이 프로젝트 전용)
- **스키마 SQL**: 이 repo 안 `db/schema.sql` 에 보관. 앱 기동 시 멱등 적용(`CREATE TABLE IF NOT EXISTS`).

> database `cie` **자체 생성**은 1회 부트스트랩이 필요하다(아래). 테이블은 앱이 알아서 만든다.

## 구성

```
cie/
  src/
    server.js   # Express 앱 + /api/* 라우트 (+ 기동 시 스키마 적용)
    verdict.js  # 섭식 판정 (순수 함수)
    ai.js       # Anthropic 음식 판단 (선택적, 키 없으면 graceful degrade)
    db.js       # Postgres 저장소 (pg) — database `cie`
  db/
    schema.sql  # 테이블 정의 (멱등)
  public/
    index.html  # 단일 파일 프론트
  test/
    verdict.test.js
  Dockerfile
  docker-compose.yml
```

## 부트스트랩 (최초 1회)

공유 `db` 컨테이너에 전용 database 를 만든다 (doil.me docker repo 디렉터리에서 실행):

```bash
docker compose exec -T db psql -U doil -d dev -c 'CREATE DATABASE cie OWNER doil;'
```

## 로컬 실행

```bash
cd cie
cp .env.example .env        # DB 접속/ANTHROPIC_API_KEY 확인·입력
npm install
npm test                    # 판정 로직 테스트 (DB 불필요)
npm run dev                 # http://localhost:3000  (DB 연결 필요)
```

## Docker

```bash
docker compose up -d --build
```

dev-net 에 `cie` 컨테이너가 뜨고, 게이트웨이 nginx(`cie.doil.me.conf`, doil.me docker repo)가 `cie.doil.me → cie:3000` 으로 프록시한다. 공유 `db` 컨테이너가 먼저 떠 있어야 한다(미연결 시 컨테이너가 재시작하며 재시도).

## API (`/api`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/status` | 지금 먹어도 되나 (타이밍 판정) |
| POST | `/check` | `{label}` — 이 항목이 공복 깨나 (AI, 기록 X) |
| POST | `/log` | `{label?, note?, ate_at?}` — 식사 기록 |
| GET | `/history?limit=N` | 최근 기록 |
| GET / PUT | `/settings` | 섭식 윈도우 / 최소 공복 시간 (1–24h) |

사용자 구분은 `?user=` (기본 `me`).

## 판정 모델 (verdict.js)

- 하루 첫 끼 = 섭식 윈도우 anchor → anchor + `eating_window_hours` 동안 섭식 허용.
- 윈도우 종료 후 마지막 식사 + `min_fast_hours` 경과해야 다시 가능.
- 직전 식사와 `min_fast_hours` 이상 벌어지면 새 바우트(anchor 갱신).
