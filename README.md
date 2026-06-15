# Can I Eat (cie)

간헐적 단식(IF) 섭식 가능 여부 판정 + 선택적 AI 음식 판단. **독립 실행** 프로젝트 — 공유 인프라(doil-sb / 공유 Postgres) 의존 없음. 자체 Express 서버 + SQLite + Dockerfile.

## 구성

```
cie/
  src/
    server.js   # Express 앱 + /api/* 라우트
    verdict.js  # 섭식 판정 (순수 함수)
    ai.js       # Anthropic 음식 판단 (선택적, 키 없으면 graceful degrade)
    db.js       # SQLite 저장소 (better-sqlite3)
  public/
    index.html  # 단일 파일 프론트
  test/
    verdict.test.js
  Dockerfile
```

## 로컬 실행

```bash
cd cie
cp .env.example .env        # 필요시 ANTHROPIC_API_KEY 채우기
npm install
npm test                    # 판정 로직 테스트
npm run dev                 # http://localhost:3000
```

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

## Docker

루트 `docker-compose.yml` 의 `cie` 서비스로 빌드/구동되며, 게이트웨이 nginx(`cie.doil.me.conf`)가 `cie.doil.me` → `cie:3000` 으로 프록시한다. DB 는 `cie_data` 볼륨에 영속.
