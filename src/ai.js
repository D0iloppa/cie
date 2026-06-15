// Can I Eat — 컨텍스트 구성 AI 에이전트.
// 인증/호출: doiltimes 방식 — sk-ant API 키가 아니라 `claude` CLI(Claude Code) subprocess.
//   `claude -p --model <m> --output-format text` 에 프롬프트를 stdin 으로 넣고 텍스트를 받는다.
//   인증은 CLAUDE_CODE_OAUTH_TOKEN 환경변수(= `claude setup-token` 발급).
// 역할: "지금 먹어도 되나" 판단에 필요한 '정확한 식사 타임라인'을 확보(되물어 보강).
// 시간 계산(윈도우/공복)은 호출측 결정론(verdict.js) — 하이브리드.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODEL = process.env.CIE_CLAUDE_MODEL || 'haiku';

const SYSTEM = [
  '너는 간헐적 단식/오토파지 코치 에이전트다.',
  '목표: 사용자가 지금 먹/마시려는 것이 괜찮은지 판단하기 위해 "정확한 오늘의 식사 타임라인"을 확보한다.',
  '중요: DB 기록은 불완전할 수 있다. 사용자가 귀찮아서 중간에 안 적었을 수 있으니 기록을 맹신하지 마라.',
  '규칙:',
  '- 기록이 비었거나 오래됐으면, 오늘 첫 끼인지 / 마지막으로 먹은 게 언제·무엇인지 물어라.',
  '- 기록이 있어도 "마지막 기록 이후 따로 드신 게 있는지" 최소 한 번은 확인하라.',
  '- 한 번에 질문 하나만, 한국어로 간결하게. quick_replies 로 흔한 답 2~4개 제시.',
  '- 충분히 파악되면 phase="decide": meals 에 오늘 관련 전체 타임라인(기존 기록+새로 확인된 끼)을, current 에 지금 항목을 채워라.',
  '- when 은 주어진 현재시각(now) 기준 ISO8601 절대시각으로 환산.',
  '공복 판정: 물·블랙커피·무가당차·무칼로리 전해질은 공복 안 깸(false). 칼로리·당·단백질·우유/크림은 깸(true).',
].join('\n');

const JSON_SPEC = [
  '아래 JSON 객체 하나만 출력한다. 코드블록·설명·여는말 금지, 순수 JSON 만.',
  '{',
  '  "phase": "ask" | "decide",',
  '  // phase=ask 일 때:',
  '  "question": "사용자에게 물을 질문(한국어, 하나)",',
  '  "quick_replies": ["흔한 답1", "흔한 답2"],',
  '  // phase=decide 일 때:',
  '  "meals": [ { "when": "ISO8601", "what": "항목", "breaks_fast": true|false } ],',
  '  "current": { "what": "지금 항목", "breaks_fast": true|false, "reason": "한국어 한두문장" }',
  '}',
].join('\n');

function aiEnabled() {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
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

// claude CLI 호출 — 프롬프트 stdin, 텍스트 stdout. 90초 타임아웃.
function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', '--model', MODEL, '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '', errb = '';
    const to = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('claude timeout')); }, 90000);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { errb += d; });
    p.on('error', (e) => { clearTimeout(to); reject(e); });
    p.on('close', (code) => {
      clearTimeout(to);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(`claude exit ${code}: ${errb.slice(0, 300)}`));
    });
    p.stdin.write(prompt);
    p.stdin.end();
  });
}

function parseJson(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('JSON 없음');
  return JSON.parse(text.slice(s, e + 1));
}

// messages: [{ role, content }] (content = string 또는 [image,text] 배열)
// ctx: { now, settings, dbMeals }
async function runAgent(messages, ctx) {
  const tmp = [];
  try {
    const lines = [SYSTEM, '', '[컨텍스트]', contextBlock(ctx), '', '[대화]'];
    for (const m of messages) {
      const who = m.role === 'user' ? '사용자' : '코치';
      if (typeof m.content === 'string') {
        lines.push(`${who}: ${m.content}`);
      } else if (Array.isArray(m.content)) {
        let text = '';
        for (const b of m.content) {
          if (b.type === 'text') text += b.text;
          else if (b.type === 'image') {
            const ext = (b.source.media_type || 'image/png').split('/')[1] || 'png';
            const fp = path.join(os.tmpdir(), `cie-img-${tmp.length}-${Date.now()}.${ext}`);
            fs.writeFileSync(fp, Buffer.from(b.source.data, 'base64'));
            tmp.push(fp);
            text += ` [첨부 이미지: ${fp} — 이 파일을 읽어(Read) 음식을 식별]`;
          }
        }
        lines.push(`${who}: ${text}`);
      }
    }
    lines.push('', '[출력 형식]', JSON_SPEC);

    const raw = await runClaude(lines.join('\n'));
    return parseJson(raw);
  } finally {
    for (const f of tmp) { try { fs.unlinkSync(f); } catch { /* noop */ } }
  }
}

module.exports = { runAgent, aiEnabled };
