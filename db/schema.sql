-- Can I Eat 스키마. 공유 Postgres 컨테이너 안의 전용 database `cie` 에 구축한다.
-- (database 자체 생성은 README 의 1회 부트스트랩 참고. 아래 테이블은 앱 기동 시 멱등 적용.)

-- 사용자별 섭식 설정 (단일 사용자라도 user_key 로 분리)
CREATE TABLE IF NOT EXISTS setting (
  user_key            VARCHAR(64) PRIMARY KEY,
  eating_window_hours INTEGER     NOT NULL DEFAULT 8,   -- 섭식 허용 시간(시간)
  min_fast_hours      INTEGER     NOT NULL DEFAULT 16,  -- 최소 공복 시간(시간)
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 식사 기록
CREATE TABLE IF NOT EXISTS meal_log (
  id         SERIAL PRIMARY KEY,
  user_key   VARCHAR(64) NOT NULL,
  ate_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 섭식 시각
  label      TEXT,                                 -- 먹은 것(자연어)
  ai_verdict JSONB,                                -- AI 공복 영향 판단(있을 때)
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_log_user_time
  ON meal_log (user_key, ate_at DESC);
