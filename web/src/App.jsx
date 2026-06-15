import { useState, useEffect } from 'react';
import Ask from './Ask.jsx';
import Menu from './Menu.jsx';
import { ensureGuest } from './api.js';

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // 게스트 UUID 보장 후 진입
  useEffect(() => { ensureGuest().then(() => setReady(true)).catch(() => setReady(true)); }, []);

  return (
    <div className="app">
      <button className="hamburger" aria-label="메뉴" onClick={() => setMenuOpen(true)}>
        <span /><span /><span />
      </button>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="stage">
        {ready && <Ask />}
      </main>
    </div>
  );
}
