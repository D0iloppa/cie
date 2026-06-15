// Can I Eat — 독립 실행 서버. SPA 프론트(web/dist) + /api/* 판정/기록 API.
// DB 는 공유 Postgres(devdb) 안의 전용 database `cie`.
const path = require('path');
const express = require('express');
const store = require('./db');
const { computeStatus } = require('./verdict');
const { judgeFood, aiEnabled } = require('./ai');

const app = express();
app.use(express.json({ limit: '8mb' })); // base64 사진 첨부 수용

const PORT = Number(process.env.PORT || 3000);
const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');

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

// 타이밍 상태 + (선택)AI 음식판단 → 상징적 한 줄 결과.
function compose(state, canEatTiming, verdict) {
  const breaksFast = verdict ? verdict.breaks_fast : null;
  const canEat = breaksFast === false ? true : canEatTiming;

  let headline, tone;
  switch (state) {
    case 'first_meal':
      headline = breaksFast === false ? '아직 첫 끼 아니에요' : '오늘 첫 끼예요';
      tone = breaksFast === false ? 'yes' : 'first';
      break;
    case 'in_window':
      headline = '지금 먹어도 돼요'; tone = 'yes'; break;
    case 'ready_new_window':
      headline = '먹어도 돼요'; tone = 'yes'; break;
    case 'fasting':
    default:
      headline = breaksFast === false ? '이건 괜찮아요' : '지금은 참아요';
      tone = breaksFast === false ? 'yes' : 'no';
      break;
  }

  const message = verdict?.reason
    || (canEat ? '지금 드셔도 괜찮아요.' : '아직 공복 시간이에요. 조금만 참아요.');

  return { canEat, headline, tone, message };
}

// 입력(이미지/라벨) 정규화 — body 또는 멀티파트 대신 base64 JSON 사용.
function readFood(body) {
  const label = body?.label ? body.label.toString().trim() : null;
  let image = null;
  if (body?.image?.data && body?.image?.media_type) {
    image = { media_type: body.image.media_type.toString(), data: body.image.data.toString() };
  }
  return { label, image };
}

const api = express.Router();

// 지금 먹어도 되나? (타이밍만)
api.get('/status', async (req, res, next) => {
  try { res.json(await buildStatus(userKey(req))); } catch (e) { next(e); }
});

// 메인 질문: 먹/마실 것(텍스트 또는 사진) → 타이밍 + AI 판단을 합친 상징적 결과. 기록 안 함.
api.post('/ask', async (req, res, next) => {
  try {
    const uk = userKey(req);
    const { label, image } = readFood(req.body);
    if (!label && !image) return res.status(400).json({ error: 'label 또는 image 가 필요합니다' });

    const wrap = await buildStatus(uk);
    let verdict = null;
    try { verdict = await judgeFood({ label, image }); }
    catch (e) { console.error('[cie] judgeFood failed:', e.message); }

    const c = compose(wrap.status.state, wrap.status.canEat, verdict);
    res.json({
      aiEnabled: aiEnabled(),
      label: verdict?.food || label || null,
      verdict,
      timing: wrap.status,
      ...c,
    });
  } catch (e) { next(e); }
});

// 식사 기록 (결과 화면의 "먹었어요" 확인). label 은 /ask 가 식별한 음식명을 그대로 받는다.
api.post('/log', async (req, res, next) => {
  try {
    const uk = userKey(req);
    const label = req.body?.label ? req.body.label.toString().trim() : null;
    const note = req.body?.note ? req.body.note.toString() : null;
    const verdict = req.body?.verdict || null; // /ask 결과를 그대로 넘겨 재호출 비용 절약
    const ateAt = req.body?.ate_at ? new Date(req.body.ate_at) : new Date();
    if (isNaN(ateAt.getTime())) return res.status(400).json({ error: 'invalid ate_at' });

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

// SPA: 정적 파일 + 비-API 경로는 index.html 로 폴백 (햄버거 메뉴 라우팅)
app.use(express.static(WEB_DIST));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(WEB_DIST, 'index.html'));
});

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
