import { useState } from 'react';
import Ask from './Ask.jsx';
import Menu from './Menu.jsx';

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app">
      <button className="hamburger" aria-label="메뉴" onClick={() => setMenuOpen(true)}>
        <span /><span /><span />
      </button>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="stage">
        <Ask />
      </main>
    </div>
  );
}
