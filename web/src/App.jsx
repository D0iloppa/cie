import { useState, useEffect } from 'react';
import Ask from './Ask.jsx';
import Menu from './Menu.jsx';
import Loader from './Loader.jsx';
import { ensureGuest } from './api.js';

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);   // 게스트 UUID 확보
  const [walked, setWalked] = useState(false);  // 로더 애니메이션 완료
  const [hideLoader, setHideLoader] = useState(false);

  const booted = ready && walked;

  useEffect(() => { ensureGuest().then(() => setReady(true)).catch(() => setReady(true)); }, []);
  useEffect(() => {
    if (!booted) return;
    const t = setTimeout(() => setHideLoader(true), 650); // 페이드 후 언마운트
    return () => clearTimeout(t);
  }, [booted]);

  return (
    <div className="app">
      <button className={`hamburger ${menuOpen ? 'open' : ''}`} aria-label="메뉴" onClick={() => setMenuOpen((o) => !o)}>
        <span /><span /><span />
      </button>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="stage">
        <Ask />
      </main>
      {!hideLoader && <Loader fading={booted} onDone={() => setWalked(true)} />}
    </div>
  );
}
