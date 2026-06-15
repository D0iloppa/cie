// Can I Eat — 컨텍스트 구성 AI 에이전트 (선택적).
// 역할: "지금 먹어도 되나" 판단에 필요한 '정확한 식사 타임라인'을 확보한다.
// DB 기록은 불완전할 수 있으므로(사용자가 귀찮아서 기록 누락) 되물어 보강한다.
// 충분해지면 타임라인(meals)+현재항목(current)을 JSON 으로 확정한다.
// 시간 계산(윈도우/공복)은 호출측의 결정론 로직(verdict.js)이 담당 — 하이브리드.
// ANTHROPIC_API_KEY 없으면 비활성(호출측에서 결정론 폴백).

const MODEL = 'claude-haiku-4-5-20251001';

const SCHEMA = {
  type: 'object',
  properties: {
    phase: { type: 'string', enum: ['ask', 'decide'] },
    // phase=ask
    question: { type: 'string' },               // 사용자에게 물을 질문(한국어, 하나)
    quick_replies: { type: 'array', items: { type: 'string' } }, // 흔한 답 2~4개
    // phase=decide
    meals: {                                     // 오늘 관련 '확정' 식사 타임라인(기록+새로 확인)
      type: 'array',
      items: {
        type: 'object',
        properties: {
          when: { type: 'string' },              // ISO8601 절대시각
          what: { type: 'string' },
          breaks_fast: { type: 'boolean' },
        },
        required: ['when', 'what', 'breaks_fast'],
        additionalProperties: false,
      },
    },
    current: {                                   // 지금 먹/마시려는 것
      type: 'object',
      properties: {
        what: { type: 'string' },
        breaks_fast: { type: 'boolean' },
        reason: { type: 'string' },              // 한국어 한두 문장
      },
      required: ['what', 'breaks_fast', 'reason'],
      additionalProperties: false,
    },
  },
  required: ['phase'],
  additionalProperties: false,
};

const SYSTEM = [
  '너는 간헐적 단식/오토파지 코치 에이전트다.',
  '목표: 사용자가 지금 먹/마시려는 것이 괜찮은지 판단하기 위해 "정확한 오늘의 식사 타임라인"을 확보한다.',
  '중요: DB 기록은 불완전할 수 있다. 사용자가 귀찮아서 중간에 안 적었을 수 있으니 기록을 맹신하지 마라.',
  '규칙:',
  '- 기록이 비었거나 오래됐으면, 오늘 첫 끼인지 / 마지막으로 먹은 게 언제·무엇인지 물어라.',
  '- 기록이 있어도 "마지막 기록 이후 따로 드신 게 있는지" 최소 한 번은 확인하라.',
  '- 한 번에 질문 하나만, 한국어로 간결하게. quick_replies 로 흔한 답 2~4개 제시.',
  '- 충분히 파악되면 phase="decide": meals 에 오늘 관련 전체 타임라인(기존 기록+새로 확인된 끼)을, current 에 지금 항목을 채워라.',
  '- when 은 주어진 현재시각(now) 기준으로 ISO8601 절대시각으로 환산.',
  '공복 판정 기준: 물·블랙커피·무가당차·무칼로리 전해질은 공복 안 깸(false). 칼로리·당·단백질·우유/크림은 깸(true).',
].join('\n');

function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function contextBlock({ now, settings, dbMeals }) {
  const lines = [
    `현재시각(now): ${new Date(now).toISOString()}`,
    `설정: 섭식 윈도우 ${settings.eating_window_hours}시간, 최소 공복 ${settings.min_fast_hours}시간`,
  ];
  if (dbMeals?.length) {
    lines.push('DB 기록된 최근 식사:');
    for (const m of dbMeals) lines.push(`- ${new Date(m.at).toISOString()} : ${m.what || '(항목 미상)'}`);
  } else {
    lines.push('DB 기록된 최근 식사: 없음');
  }
  return lines.join('\n');
}

// messages: [{ role, content }]  (content = string 또는 [image,text] 배열)
// ctx: { now, settings, dbMeals }
// 반환: 파싱된 구조화 객체 {phase, ...}
async function runAgent(messages, ctx) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: `${SYSTEM}\n\n[컨텍스트]\n${contextBlock(ctx)}`,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages,
    }),
  });
  if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const text = (data.content || []).find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('빈 응답');
  return JSON.parse(text);
}

module.exports = { runAgent, aiEnabled };
