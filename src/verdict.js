// Can I Eat — 섭식 가능 여부 판정 (순수 함수, DB/네트워크 의존 없음)
//
// 동적 윈도우 모델:
//   - 하루 첫 끼(점심)를 먹는 순간이 섭식 윈도우의 시작점(anchor).
//   - anchor 부터 eatingWindowHours 동안만 섭식 허용.
//   - 윈도우가 닫힌 뒤에는 마지막 식사 + minFastHours 가 지나야 다시 먹을 수 있다.

const H = 3600 * 1000; // 1시간(ms)

// meals: 식사 시각 배열 (ms epoch). settings: { eatingWindowHours, minFastHours }
// now: 현재 시각 (ms epoch)
function computeStatus({ now, meals, settings }) {
  const W = settings.eatingWindowHours * H;
  const F = settings.minFastHours * H;

  const sorted = [...meals].sort((a, b) => a - b);

  if (sorted.length === 0) {
    return {
      canEat: true,
      state: 'first_meal',
      anchorAt: null,
      lastMealAt: null,
      windowEndsAt: null,
      nextEatAt: null,
    };
  }

  const last = sorted[sorted.length - 1];

  // anchor = 현재 섭식 바우트의 첫 끼.
  // (직전 식사와의 간격이 minFastHours 이상이면 새 바우트가 시작된 것으로 본다)
  let anchor = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] >= F) anchor = sorted[i];
  }

  const windowEndsAt = anchor + W;

  if (now <= windowEndsAt) {
    // 윈도우 진행 중 — 계속 먹어도 됨
    return {
      canEat: true,
      state: 'in_window',
      anchorAt: anchor,
      lastMealAt: last,
      windowEndsAt,
      nextEatAt: null,
    };
  }

  // 윈도우 종료 — 마지막 식사로부터 공복시간을 채워야 함
  const nextEatAt = last + F;
  if (now >= nextEatAt) {
    return {
      canEat: true,
      state: 'ready_new_window',
      anchorAt: anchor,
      lastMealAt: last,
      windowEndsAt,
      nextEatAt,
    };
  }

  return {
    canEat: false,
    state: 'fasting',
    anchorAt: anchor,
    lastMealAt: last,
    windowEndsAt,
    nextEatAt,
  };
}

module.exports = { computeStatus, H };
