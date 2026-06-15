// Can I Eat — 독립 실행 서버. SPA 프론트(web/dist) + /api/* 판정/기록 API.
// DB 는 공유 Postgres(devdb) 안의 전용 database `cie`.
const path = require('path');
const express = require('express');
const store = require('./db');
const { computeStatus } = require('./verdict');
const { runAgent, aiEnabled } = require('./ai');

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

// 타이밍 상태 + (선택)음식판단 → 상징적 한 줄 결과.
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

// 입력(이미지/라벨) 정규화 — base64 JSON.
function readFood(body) {
  const label = body?.label ? body.label.toString().trim() : null;
  let image = null;
  if (body?.image?.data && body?.image?.media_type) {
    image = { media_type: body.image.media_type.toString(), data: body.image.data.toString() };
  }
  return { label, image };
}

const api = express.Router();

// 게스트 가입 — 새 UUID 발급(클라가 localStorage 에 보관). 추후 OAuth 계정과 연동.
api.post('/guest', async (req, res, next) => {
  try {
    const user = await store.createGuest();
    res.json({ user, is_guest: true });
  } catch (e) { next(e); }
});

// 현재 계정 정보 (메뉴 '계정 연동' 표시용)
api.get('/account', async (req, res, next) => {
  try {
    const uk = userKey(req);
    await store.touchAccount(uk);
    res.json({ user: uk, account: await store.getAccount(uk) });
  } catch (e) { next(e); }
});

// 타이밍만 (메뉴/상태 표시용)
api.get('/status', async (req, res, next) => {
  try { res.json(await buildStatus(userKey(req))); } catch (e) { next(e); }
});

// 메인 질문 — 컨텍스트 구성 에이전트(멀티턴).
//   첫 호출: { label?, image? }
//   이어가기: { history, answer }
//   응답: { phase:'ask', question, quick_replies, history } | { phase:'decide', headline, message, tone, canEat, ... }
api.post('/ask', async (req, res, next) => {
  try {
    const uk = userKey(req);
    await store.touchAccount(uk);
    const settings = await store.loadSettings(uk);
    const now = Date.now();

    // AI 미연동 → 결정론 폴백(질문 없이 DB 기준).
    if (!aiEnabled()) {
      const wrap = await buildStatus(uk);
      const { label } = readFood(req.body);
      const c = compose(wrap.status.state, wrap.status.canEat, null);
      return res.json({ phase: 'decide', aiEnabled: false, label: label || null, verdict: null, timing: wrap.status, ...c });
    }

    // 대화 메시지 구성
    let messages;
    if (Array.isArray(req.body?.history) && req.body.history.length) {
      messages = [...req.body.history, { role: 'user', content: (req.body?.answer || '').toString() }];
    } else {
      const { label, image } = readFood(req.body);
      if (!label && !image) return res.status(400).json({ error: 'label 또는 image 가 필요합니다' });
      const content = [];
      if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
      content.push({ type: 'text', text: label ? `지금 먹/마시려는 것: ${label}` : '첨부한 사진 속에서 먹/마시려는 것을 식별해줘.' });
      messages = [{ role: 'user', content }];
    }

    // DB 컨텍스트 (라벨 포함 최근 식사, 시간 오름차순)
    const recent = await store.listMeals(uk, 10);
    const dbMeals = recent.map((r) => ({ at: r.ate_at, what: r.label })).reverse();

    let out;
    try {
      out = await runAgent(messages, { now, settings, dbMeals });
    } catch (e) {
      console.error('[cie] agent 실패 → 결정론 폴백:', e.message);
      const wrap = await buildStatus(uk);
      const c = compose(wrap.status.state, wrap.status.canEat, null);
      return res.json({ phase: 'decide', aiEnabled: true, degraded: true, label: readFood(req.body).label || null, verdict: null, timing: wrap.status, ...c });
    }

    const history = [...messages, { role: 'assistant', content: JSON.stringify(out) }];

    if (out.phase === 'ask') {
      return res.json({
        phase: 'ask', aiEnabled: true,
        question: out.question || '', quick_replies: out.quick_replies || [], history,
      });
    }

    // 판정 뒤 단순 후속 답변 (맥락 유지, 기록 변화 없음)
    if (out.phase === 'reply') {
      return res.json({ phase: 'reply', aiEnabled: true, message: out.message || '', history });
    }

    // decide — 되물어 확인된 끼 중 DB에 없는 것 백필
    const existing = await store.loadRecentMealTimes(uk);
    for (const m of out.meals || []) {
      const t = Date.parse(m.when);
      if (isNaN(t)) continue;
      if (t >= now - 10 * 60 * 1000) continue; // 지금/미래 항목은 백필 금지(현재 물어보는 것은 '먹었어요' 확인 시에만 기록)
      if (existing.some((e) => Math.abs(e - t) < 5 * 60 * 1000)) continue; // ~5분 내 중복 제외
      await store.insertMeal(uk, new Date(t), m.what, { breaks_fast: m.breaks_fast }, '에이전트 백필');
    }

    const wrap = await buildStatus(uk); // 백필 반영해 재계산
    const verdict = out.current
      ? { food: out.current.what, breaks_fast: out.current.breaks_fast, reason: out.current.reason }
      : null;
    const c = compose(wrap.status.state, wrap.status.canEat, verdict);
    res.json({
      phase: 'decide', aiEnabled: true,
      label: out.current?.what || null, verdict, timing: wrap.status, history, ...c,
    });
  } catch (e) { next(e); }
});

// 식사 기록 ("먹었어요" 확인). label/verdict 는 /ask 결과를 그대로 받는다.
api.post('/log', async (req, res, next) => {
  try {
    const uk = userKey(req);
    await store.touchAccount(uk);
    const label = req.body?.label ? req.body.label.toString().trim() : null;
    const note = req.body?.note ? req.body.note.toString() : null;
    const verdict = req.body?.verdict || null;
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
