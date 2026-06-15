import { useState, useRef } from 'react';
import Orb from './Orb.jsx';
import { ask, logMeal, fileToImage } from './api.js';

// 메인 플로우: idle → input → thinking → (asking ↔ thinking)* → result
//   result 에서도 맥락 유지한 채 후속 질문 가능(→ ask/decide/reply 로 응답).
export default function Ask() {
  const [phase, setPhase] = useState('idle');
  const [label, setLabel] = useState('');
  const [image, setImage] = useState(null);     // { media_type, data }
  const [preview, setPreview] = useState(null);  // dataURL

  const [history, setHistory] = useState(null);  // 서버 대화 이력(불투명) — 후속 질문에 그대로 echo
  const [question, setQuestion] = useState('');
  const [quick, setQuick] = useState([]);
  const [answer, setAnswer] = useState('');

  const [result, setResult] = useState(null);
  const [followups, setFollowups] = useState([]); // 판정 뒤 후속 Q&A
  const [followAnswer, setFollowAnswer] = useState('');
  const [err, setErr] = useState('');
  const [logged, setLogged] = useState(false);
  const fileRef = useRef(null);

  const orbTone = phase === 'thinking' ? 'thinking'
    : phase === 'result' ? (result?.tone || 'idle') : 'idle';
  const orbLabel = phase === 'idle' ? '지금 먹어도 될까?'
    : phase === 'result' ? result?.headline : '';

  function reset() {
    setPhase('idle'); setLabel(''); setImage(null); setPreview(null);
    setHistory(null); setQuestion(''); setQuick([]); setAnswer('');
    setResult(null); setFollowups([]); setFollowAnswer(''); setErr(''); setLogged(false);
  }

  async function onPick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setImage(await fileToImage(f));
  }

  // 서버 응답 처리. qText = 직전 사용자 발화(후속 reply 로그용)
  function consume(r, qText) {
    if (r.history) setHistory(r.history);
    if (r.phase === 'ask') {
      setQuestion(r.question); setQuick(r.quick_replies || []); setAnswer(''); setPhase('asking');
    } else if (r.phase === 'reply') {
      setFollowups((f) => [...f, { q: qText, a: r.message }]); setFollowAnswer(''); setPhase('result');
    } else { // decide — 새 판정으로 교체
      setResult(r); setFollowups([]); setFollowAnswer(''); setLogged(false); setPhase('result');
    }
  }

  async function start() {
    if (!label.trim() && !image) return;
    setErr(''); setPhase('thinking');
    try {
      consume(await ask({ label: label.trim() || undefined, image: image || undefined }));
    } catch (e) { setErr(e.message || '실패'); setPhase('input'); }
  }

  // 대화 이어가기 (asking 답변 / result 후속 질문 공용)
  async function send(text, back) {
    const a = (text ?? '').trim();
    if (!a) return;
    setErr(''); setPhase('thinking');
    try { consume(await ask({ history, answer: a }), a); }
    catch (e) { setErr(e.message || '실패'); setPhase(back); }
  }

  async function confirmAte() {
    try {
      await logMeal({ label: result?.label || label.trim() || null, verdict: result?.verdict || null });
      setLogged(true);
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="ask">
      <Orb tone={orbTone} label={orbLabel} />

      {phase === 'idle' && (
        <button className="start" onClick={() => setPhase('input')}>Start</button>
      )}

      {phase === 'input' && (
        <div className="panel-in">
          <textarea
            autoFocus rows={2} value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="뭘 먹/마시려고요? (예: 아메리카노, 사과)"
          />
          {preview && <img className="thumb" src={preview} alt="" />}
          <div className="row">
            <button className="ghost" onClick={() => fileRef.current?.click()}>📷 사진</button>
            <button className="primary" onClick={start} disabled={!label.trim() && !image}>물어보기</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
          <button className="link" onClick={reset}>취소</button>
          {err && <p className="err">{err}</p>}
        </div>
      )}

      {phase === 'thinking' && <p className="hint">생각 중…</p>}

      {phase === 'asking' && (
        <div className="panel-in">
          <p className="q">{question}</p>
          {quick.length > 0 && (
            <div className="chips">
              {quick.map((q) => (
                <button key={q} className="chip" onClick={() => send(q, 'asking')}>{q}</button>
              ))}
            </div>
          )}
          <div className="row">
            <input
              type="text" value={answer} autoFocus
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(answer, 'asking')}
              placeholder="직접 입력…"
            />
            <button className="primary" onClick={() => send(answer, 'asking')} disabled={!answer.trim()} style={{ flex: '0 0 64px' }}>보내기</button>
          </div>
          <button className="link" onClick={reset}>취소</button>
          {err && <p className="err">{err}</p>}
        </div>
      )}

      {phase === 'result' && result && (
        <div className="panel-in result">
          {result.label && <div className="food">{result.label}</div>}
          <p className="msg">{result.message}</p>
          {!result.aiEnabled && <p className="hint sm">· AI 미연동(타이밍 기준)</p>}

          {followups.length > 0 && (
            <div className="followlog">
              {followups.map((f, i) => (
                <div key={i} className="fu">
                  <p className="fu-q">{f.q}</p>
                  <p className="fu-a">{f.a}</p>
                </div>
              ))}
            </div>
          )}

          {logged ? (
            <p className="ok">기록됐어요 ✓</p>
          ) : (
            <div className="row">
              <button className="ghost" onClick={reset}>다시</button>
              <button className="primary" onClick={confirmAte}>먹었어요</button>
            </div>
          )}

          {result.aiEnabled && (
            <div className="row followrow">
              <input
                type="text" value={followAnswer}
                onChange={(e) => setFollowAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(followAnswer, 'result')}
                placeholder="더 물어보기… (예: 그럼 아메리카노는?)"
              />
              <button className="ghost" onClick={() => send(followAnswer, 'result')} disabled={!followAnswer.trim()} style={{ flex: '0 0 52px' }}>↑</button>
            </div>
          )}

          <button className="link" onClick={reset}>처음으로</button>
          {err && <p className="err">{err}</p>}
        </div>
      )}
    </div>
  );
}
