// Can I Eat — 저장소. 공유 Postgres 컨테이너(devdb) 안의 전용 database `cie` 를 쓴다.
// 연결 정보는 환경변수로 주입 (docker-compose 의 cie environment).
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'devdb',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'doil',
  password: process.env.DB_PASSWORD,   // .env (gitignore) 에서만 주입 — 커밋 금지
  database: process.env.DB_NAME || 'cie',
  max: 5,
});

pool.on('error', (e) => console.error('[cie][db] pool error:', e.message));

const DEFAULTS = { eating_window_hours: 8, min_fast_hours: 16 };

// 테이블 멱등 적용 (database `cie` 자체는 README 부트스트랩에서 1회 생성).
async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function loadSettings(uk) {
  const { rows } = await pool.query(
    'SELECT eating_window_hours, min_fast_hours FROM setting WHERE user_key = $1',
    [uk]
  );
  return rows[0] || { ...DEFAULTS };
}

async function saveSettings(uk, win, fast) {
  const { rows } = await pool.query(
    `INSERT INTO setting (user_key, eating_window_hours, min_fast_hours, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_key)
     DO UPDATE SET eating_window_hours = EXCLUDED.eating_window_hours,
                   min_fast_hours = EXCLUDED.min_fast_hours,
                   updated_at = NOW()
     RETURNING eating_window_hours, min_fast_hours`,
    [uk, win, fast]
  );
  return rows[0];
}

// 최근 3일치 식사 시각(ms epoch) — 윈도우/공복 판정에 충분.
async function loadRecentMealTimes(uk) {
  const { rows } = await pool.query(
    `SELECT ate_at FROM meal_log
       WHERE user_key = $1 AND ate_at > NOW() - INTERVAL '3 days'
       ORDER BY ate_at`,
    [uk]
  );
  return rows.map((r) => new Date(r.ate_at).getTime());
}

async function insertMeal(uk, ateAt, label, verdict, note) {
  const { rows } = await pool.query(
    `INSERT INTO meal_log (user_key, ate_at, label, ai_verdict, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, ate_at, label, ai_verdict, note`,
    [uk, ateAt, label, verdict ? JSON.stringify(verdict) : null, note]
  );
  return rows[0];
}

async function listMeals(uk, limit) {
  const { rows } = await pool.query(
    `SELECT id, ate_at, label, ai_verdict, note FROM meal_log
       WHERE user_key = $1 ORDER BY ate_at DESC LIMIT $2`,
    [uk, limit]
  );
  return rows;
}

module.exports = {
  pool,
  DEFAULTS,
  initSchema,
  loadSettings,
  saveSettings,
  loadRecentMealTimes,
  insertMeal,
  listMeals,
};
