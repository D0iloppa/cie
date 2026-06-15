// Can I Eat — 자체 SQLite 저장소 (공유 인프라 의존 없음).
// DB 파일 경로는 CIE_DB_PATH 로 주입 (도커에선 볼륨 마운트), 기본 ./data/cie.db.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.CIE_DB_PATH || path.join(__dirname, '..', 'data', 'cie.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 스키마 (멱등)
db.exec(`
  CREATE TABLE IF NOT EXISTS setting (
    user_key            TEXT PRIMARY KEY,
    eating_window_hours INTEGER NOT NULL DEFAULT 8,
    min_fast_hours      INTEGER NOT NULL DEFAULT 16,
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meal_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key   TEXT NOT NULL,
    ate_at     TEXT NOT NULL,
    label      TEXT,
    ai_verdict TEXT,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_meal_log_user_time ON meal_log (user_key, ate_at DESC);
`);

const DEFAULTS = { eating_window_hours: 8, min_fast_hours: 16 };

function loadSettings(uk) {
  const row = db
    .prepare('SELECT eating_window_hours, min_fast_hours FROM setting WHERE user_key = ?')
    .get(uk);
  return row || { ...DEFAULTS };
}

function saveSettings(uk, win, fast) {
  db.prepare(
    `INSERT INTO setting (user_key, eating_window_hours, min_fast_hours, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_key) DO UPDATE SET
       eating_window_hours = excluded.eating_window_hours,
       min_fast_hours      = excluded.min_fast_hours,
       updated_at          = datetime('now')`
  ).run(uk, win, fast);
  return { eating_window_hours: win, min_fast_hours: fast };
}

// 최근 3일치 식사 시각(ms epoch) — 윈도우/공복 판정에 충분.
function loadRecentMealTimes(uk) {
  const rows = db
    .prepare(
      `SELECT ate_at FROM meal_log
         WHERE user_key = ? AND ate_at > datetime('now', '-3 days')
         ORDER BY ate_at`
    )
    .all(uk);
  return rows.map((r) => Date.parse(r.ate_at));
}

function insertMeal(uk, ateAtIso, label, verdict, note) {
  const info = db
    .prepare(
      `INSERT INTO meal_log (user_key, ate_at, label, ai_verdict, note)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(uk, ateAtIso, label, verdict ? JSON.stringify(verdict) : null, note);
  return db
    .prepare('SELECT id, ate_at, label, ai_verdict, note FROM meal_log WHERE id = ?')
    .get(info.lastInsertRowid);
}

function listMeals(uk, limit) {
  return db
    .prepare(
      `SELECT id, ate_at, label, ai_verdict, note FROM meal_log
         WHERE user_key = ? ORDER BY ate_at DESC LIMIT ?`
    )
    .all(uk, limit);
}

module.exports = {
  db,
  DEFAULTS,
  loadSettings,
  saveSettings,
  loadRecentMealTimes,
  insertMeal,
  listMeals,
};
