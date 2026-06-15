// Can I Eat — 독립 실행 서버. 정적 프론트 + /api/* 판정/기록 API.
// DB 는 공유 Postgres(devdb) 안의 전용 database `cie`.
const path = require('path');
const express = require('express');
const store = require('./db');
const { computeStatus } = require('./verdict');
const { judgeFood, aiEnabled } = require('./ai');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);

function userKey(req) {
  return (req.query.user || req.body?.user || 'me').toString().slice(0, 64);
}

async function buildStatus(uk) {
  const s = await store.loadSettings(uk);
  const meals = await store.loadRecentMealTimes(uk);
  const status = computeStatus({
    now: Date.now(),
    meals,
    settings: { eatingWindowHours: s.eating_window_hours, minFastHours: s.min_fast_hours },
  });
  return { user: uk, settings: s, aiEnabled: aiEnabled(), status };
}

const api = express.Router();

// 지금 먹어도 되나? (타이밍 판정)
api.get('/status', async (req, res, next) => {
  try {
    res.json(await buildStatus(userKey(req)));
  } catch (e) { next(e); }
});

// 먹기 전 질문: 이 항목이 공복을 깨나? (AI, 기록 안 함)
api.post('/check', async (req, res, next) => {
  try {
    const label = (req.body?.label || '').toString().trim();
    if (!label) return res.status(400).json({ error: 'label is required' });
    const verdict = await judgeFood(label);
    res.json({ aiEnabled: aiEnabled(), label, verdict });
  } catch (e) { next(e); }
});

// 식사 기록 (선택적 AI 판단 포함)
api.post('/log', async (req, res, next) => {
  try {
    const uk = userKey(req);
    const label = req.body?.label ? req.body.label.toString().trim() : null;
    const note = req.body?.note ? req.body.note.toString() : null;
    const ateAt = req.body?.ate_at ? new Date(req.body.ate_at) : new Date();
    if (isNaN(ateAt.getTime())) return res.status(400).json({ error: 'invalid ate_at' });

    let verdict = null;
    if (label) {
      try { verdict = await judgeFood(label); }
      catch (e) { console.error('[cie] judgeFood failed:', e.message); }
    }

    const logged = await store.insertMeal(uk, ateAt, label, verdict, note);
    res.json({ logged, status: (await buildStatus(uk)).status });
  } catch (e) { next(e); }
});

// 기록 조회
api.get('/history', async (req, res, next) => {
  try {
    const uk = userKey(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 200);
    res.json({ user: uk, meals: await store.listMeals(uk, limit) });
  } catch (e) { next(e); }
});

// 설정 조회/저장
api.get('/settings', async (req, res, next) => {
  try {
    const uk = userKey(req);
    res.json({ user: uk, settings: await store.loadSettings(uk) });
  } catch (e) { next(e); }
});

api.put('/settings', async (req, res, next) => {
  try {
    const uk = userKey(req);
    const win = parseInt(req.body?.eating_window_hours, 10);
    const fast = parseInt(req.body?.min_fast_hours, 10);
    if (!(win > 0 && win <= 24) || !(fast > 0 && fast <= 24)) {
      return res.status(400).json({ error: 'eating_window_hours/min_fast_hours must be 1-24' });
    }
    res.json({ user: uk, settings: await store.saveSettings(uk, win, fast) });
  } catch (e) { next(e); }
});

app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, _next) => {
  console.error('[cie] error:', err.message);
  res.status(500).json({ error: 'internal error' });
});

// 스키마(테이블) 멱등 적용 후 기동. DB 미연결이면 종료 → 컨테이너 재시작으로 재시도.
store.initSchema()
  .then(() => app.listen(PORT, () => console.log(`[cie] listening on :${PORT}`)))
  .catch((e) => {
    console.error('[cie] schema init failed (db 연결 확인):', e.message);
    process.exit(1);
  });
