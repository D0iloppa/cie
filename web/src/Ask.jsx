import { useState, useRef } from 'react';
import Orb from './Orb.jsx';
import { ask, logMeal, fileToImage } from './api.js';

// 메인 플로우: idle → input → thinking → result
export default function Ask() {
  const [phase, setPhase] = useState('idle');
  const [label, setLabel] = useState('');
  const [image, setImage] = useState(null);   // { media_type, data }
  const [preview, setPreview] = useState(null); // dataURL
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [logged, setLogged] = useState(false);
  const fileRef = useRef(null);

  const orbTone = phase === 'thinking' ? 'thinking' : phase === 'result' ? (result?.tone || 'idle') : 'idle';
  const orbLabel = phase === 'idle' ? '지금 먹어도 될까?' : phase === 'result' ? result?.headline : '';

  function reset() {
    setPhase('idle'); setLabel(''); setImage(null); setPreview(null);
    setResult(null); setErr(''); setLogged(false);
  }

  async function onPick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setImage(await fileToImage(f));
  }

  async function submit() {
    if (!label.trim() && !image) return;
    setErr(''); setPhase('thinking');
    try {
      const r = await ask({ label: label.trim() || undefined, image: image || undefined });
      setResult(r); setPhase('result');
    } catch (e) {
      setErr(e.message || '실패'); setPhase('input');
    }
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
            <button className="primary" onClick={submit} disabled={!label.trim() && !image}>물어보기</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
          <button className="link" onClick={reset}>취소</button>
          {err && <p className="err">{err}</p>}
        </div>
      )}

      {phase === 'thinking' && <p className="hint">판단 중…</p>}

      {phase === 'result' && result && (
        <div className="panel-in result">
          {result.label && <div className="food">{result.label}</div>}
          <p className="msg">{result.message}</p>
          {!result.aiEnabled && <p className="hint sm">· AI 음식판단 미연동(타이밍 기준)</p>}
          {logged ? (
            <p className="ok">기록됐어요 ✓</p>
          ) : (
            <div className="row">
              <button className="ghost" onClick={reset}>다시</button>
              <button className="primary" onClick={confirmAte}>먹었어요</button>
            </div>
          )}
          {logged && <button className="link" onClick={reset}>처음으로</button>}
          {err && <p className="err">{err}</p>}
        </div>
      )}
    </div>
  );
}
