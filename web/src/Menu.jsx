import { useState, useEffect } from 'react';
import { getHistory, getSettings, saveSettings } from './api.js';

const ITEMS = [
  { key: 'history', label: '이력 관리', icon: '📜' },
  { key: 'login', label: '로그인', icon: '👤' },
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
      {panel === 'login' && <Sheet title="로그인" onClose={() => setPanel(null)}><Login /></Sheet>}
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

function Login() {
  return <p className="hint">로그인은 곧 제공될 예정이에요. 지금은 단일 사용자로 동작합니다.</p>;
}
