// Can I Eat — AI 음식 판단 (선택적). 텍스트/사진(비전) 모두 지원.
// ANTHROPIC_API_KEY 없으면 null 반환(graceful degrade).
// Node 20 내장 fetch 로 Anthropic Messages API 직접 호출 (의존성 추가 없음).

const MODEL = 'claude-haiku-4-5-20251001';

const SCHEMA = {
  type: 'object',
  properties: {
    food: { type: 'string' },                               // 식별/요약한 항목명(한국어)
    breaks_fast: { type: 'boolean' },                       // 공복(단식)을 깨는가
    reason: { type: 'string' },                             // 한국어 근거(한두 문장)
    severity: { type: 'string', enum: ['none', 'mild', 'breaks'] },
  },
  required: ['food', 'breaks_fast', 'reason', 'severity'],
  additionalProperties: false,
};

const SYSTEM = [
  '너는 간헐적 단식/오토파지 코치다.',
  '사용자가 공복 상태에서 먹거나 마시려는 항목이 "단식을 깨는지" 판단한다.',
  '사진이 주어지면 사진 속 먹/마실 것을 식별해 food 에 한국어로 적는다(텍스트가 있으면 그것을 우선).',
  '물·블랙커피·무가당 차·전해질(무칼로리)은 공복을 깨지 않는다(breaks_fast=false, severity=none).',
  '칼로리·당·단백질·우유/크림이 들어가면 깬다(breaks_fast=true, severity=breaks).',
  '소량의 인공감미료/껌 등 애매한 항목은 severity=mild.',
  'reason 은 한국어로 간결하게.',
].join(' ');

function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// input: { label?: string, image?: { media_type, data(base64) } }
// 반환: { food, breaks_fast, reason, severity } 또는 null
async function judgeFood({ label, image } = {}) {
  if (!aiEnabled()) return null;
  if (!label && !image) return null;

  const content = [];
  if (image?.data) {
    content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  }
  content.push({
    type: 'text',
    text: label ? `항목: ${label}` : '첨부한 사진 속에서 먹거나 마시려는 것을 식별해 판단해줘.',
  });

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
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`anthropic ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  const text = (data.content || []).find((b) => b.type === 'text')?.text;
  if (!text) return null;
  return JSON.parse(text);
}

module.exports = { judgeFood, aiEnabled };
