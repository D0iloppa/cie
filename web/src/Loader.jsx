// 로딩 화면 — 푸른 픽셀 강아지 '뽀미'가 우→좌로 걸어가는 다마고치/CLI 느낌.
// 레퍼런스(yutaabe)의 8-bit 인트로를 강아지(BOW WOW)로 변주.
import { useEffect, useRef } from 'react';

const BLUE = '#30b8ff';

// 셀 단위로 왼쪽을 향한 강아지(말티즈 느낌: 플로피 귀 + 말린 꼬리)를 그린다. frame=0/1 다리 토글.
function drawDog(ctx, c, frame) {
  const px = (x, y, w = 1, h = 1) => ctx.fillRect(Math.round(x * c), Math.round(y * c), Math.ceil(w * c), Math.ceil(h * c));
  ctx.fillStyle = BLUE;
  // 몸통
  px(6, 6, 10, 5);
  // 머리(왼쪽)
  px(2, 4, 5, 5);
  // 플로피 귀
  px(2, 3, 2, 5);
  // 주둥이
  px(0, 7, 2, 2);
  // 말린 꼬리(뒤쪽 위로)
  px(15, 3, 2, 4); px(16, 2, 1, 3);
  // 다리 4개 — walk cycle
  if (frame === 0) {
    px(6, 11, 2, 3); px(9, 12, 2, 2); px(12, 12, 2, 2); px(14, 11, 2, 3);
  } else {
    px(7, 12, 2, 2); px(9, 11, 2, 3); px(12, 11, 2, 3); px(14, 12, 2, 2);
  }
  // 눈(구멍)
  ctx.clearRect(Math.round(4 * c), Math.round(6 * c), Math.ceil(c), Math.ceil(c));
}

export default function Loader({ fading, onDone }) {
  const ref = useRef();
  const countRef = useRef();

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    let raf, start;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function resize() {
      cv.width = W() * DPR; cv.height = H() * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    resize();
    window.addEventListener('resize', resize);

    const DURATION = 3000;

    function frame(t) {
      if (!start) start = t;
      const e = t - start;
      const cell = Math.max(7, Math.floor(W() / 64)); // 화면폭 비례 셀
      const dogW = 17 * cell, dogH = 15 * cell;
      ctx.clearRect(0, 0, cv.width, cv.height);

      const prog = Math.min(e / DURATION, 1);
      // 우측 화면 밖 → 좌측 화면 밖
      const x = Math.round(W() - prog * (W() + dogW));
      const y = Math.round(H() / 2 - dogH / 2);
      const legFrame = Math.floor(e / 150) % 2;

      ctx.save(); ctx.translate(x, y); drawDog(ctx, cell, legFrame); ctx.restore();

      if (countRef.current) countRef.current.textContent = String(Math.floor(prog * 999)).padStart(3, '0');

      if (e < DURATION) raf = requestAnimationFrame(frame);
      else onDone?.();
    }
    raf = requestAnimationFrame(frame);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [onDone]);

  return (
    <div className={`loader ${fading ? 'fade' : ''}`}>
      <canvas ref={ref} className="loader-cv" />
      <span className="loader-count" ref={countRef}>000</span>
      <div className="loader-txt">BOW&nbsp;WOW &nbsp;·&nbsp; BOW&nbsp;WOW</div>
    </div>
  );
}
