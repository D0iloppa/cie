import { useState, useEffect } from 'react';
import { getHistory, getSettings, saveSettings, getAccount, uid } from './api.js';

const ITEMS = [
  { key: 'history', label: '이력 관리', icon: '📜' },
  { key: 'account', label: '계정 연동', icon: '🔗' },
  { key: 'settings', label: '설정', icon: '⚙️' },
];

export default function Menu({ open, onClose }) {
  const [panel, setPanel] = useState(null);
  useEffect(() => { if (!open) setPanel(null); }, [open]);

  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`}>
        <h2 className="drawer-h">Can I Eat</h2>
        {ITEMS.map((it) => (
          <button key={it.key} className="drawer-item" onClick={() => setPanel(it.key)}>
            <span>{it.icon}</span> {it.label}
          </button>
        ))}
      </aside>

      {panel === 'history' && <Sheet title="이력 관리" onClose={() => setPanel(null)}><History /></Sheet>}
      {panel === 'settings' && <Sheet title="설정" onClose={() => setPanel(null)}><Settings /></Sheet>}
      {panel === 'account' && <Sheet title="계정 연동" onClose={() => setPanel(null)}><Account /></Sheet>}
    </>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h"><b>{title}</b><button className="x" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

function History() {
  const [meals, setMeals] = useState(null);
  useEffect(() => { getHistory(30).then((d) => setMeals(d.meals)).catch(() => setMeals([])); }, []);
  if (!meals) return <p className="hint">불러오는 중…</p>;
  if (!meals.length) return <p className="hint">아직 기록이 없어요.</p>;
  return (
    <ul className="hist">
      {meals.map((m) => (
        <li key={m.id}>
          <span>{m.label || '식사'}</span>
          <span className="t">{new Date(m.ate_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </li>
      ))}
    </ul>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { getSettings().then((d) => setS(d.settings)).catch(() => {}); }, []);
  if (!s) return <p className="hint">불러오는 중…</p>;
  return (
    <div className="set">
      <label>섭식 윈도우(시간)
        <input type="number" min="1" max="24" value={s.eating_window_hours}
          onChange={(e) => setS({ ...s, eating_window_hours: +e.target.value })} />
      </label>
      <label>최소 공복(시간)
        <input type="number" min="1" max="24" value={s.min_fast_hours}
          onChange={(e) => setS({ ...s, min_fast_hours: +e.target.value })} />
      </label>
      <button className="primary" onClick={() => saveSettings(s).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500); })}>저장</button>
      {saved && <span className="ok"> 저장됨 ✓</span>}
    </div>
  );
}

function Account() {
  const [acc, setAcc] = useState(null);
  useEffect(() => { getAccount().then((d) => setAcc(d.account)).catch(() => setAcc(null)); }, []);
  const id = uid();
  return (
    <div className="set">
      <div className="acc-row">
        <span className="badge-guest">게스트</span>
        <span className="hint sm">기기에 저장된 ID 로 이용 중</span>
      </div>
      <label>내 게스트 ID
        <input type="text" readOnly value={id || (acc?.user_key ?? '—')} onFocus={(e) => e.target.select()} />
      </label>
      <button className="primary" disabled title="곧 제공">🔗 OAuth 계정 연동 (곧 제공)</button>
      <p className="hint sm">계정을 연동하면 이 게스트 기록이 그대로 그 계정으로 이어집니다.</p>
    </div>
  );
}
