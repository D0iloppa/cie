import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// 모바일: 실제 보이는 영역 높이를 --app-h 로 동기화.
// 키보드가 올라오면 visualViewport.height 가 줄어 레이아웃이 그 안으로 맞춰진다.
function syncAppHeight() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${h}px`);
}
syncAppHeight();
window.addEventListener('resize', syncAppHeight);
window.visualViewport?.addEventListener('resize', syncAppHeight);
window.visualViewport?.addEventListener('scroll', syncAppHeight);

createRoot(document.getElementById('root')).render(<App />);
