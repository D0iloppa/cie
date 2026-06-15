// Can I Eat 판정 로직 테스트 — 의존성 없이 `node test/verdict.test.js` 로 실행.
const assert = require('assert');
const { computeStatus, H } = require('../src/verdict');

const settings = { eatingWindowHours: 8, minFastHours: 16 };
const T0 = 1_700_000_000_000; // 임의 기준 시각

let pass = 0;
function check(name, fn) {
  fn();
  pass++;
  console.log('  ✓', name);
}

// 1) 식사 기록 없음 → 첫 끼, 먹어도 됨
check('식사 없음이면 first_meal & canEat', () => {
  const r = computeStatus({ now: T0, meals: [], settings });
  assert.strictEqual(r.canEat, true);
  assert.strictEqual(r.state, 'first_meal');
});

// 2) 점심(첫 끼) 직후 → 윈도우 안, 먹어도 됨
check('첫 끼 +2h 는 in_window & canEat', () => {
  const lunch = T0;
  const r = computeStatus({ now: T0 + 2 * H, meals: [lunch], settings });
  assert.strictEqual(r.canEat, true);
  assert.strictEqual(r.state, 'in_window');
  assert.strictEqual(r.windowEndsAt, lunch + 8 * H);
});

// 3) 윈도우 경계 직전/직후
check('윈도우 종료 직전은 canEat, 직후는 NO(fasting)', () => {
  const lunch = T0;
  const justBefore = computeStatus({ now: lunch + 8 * H - 1, meals: [lunch], settings });
  assert.strictEqual(justBefore.canEat, true);
  const justAfter = computeStatus({ now: lunch + 8 * H + 1, meals: [lunch], settings });
  assert.strictEqual(justAfter.canEat, false);
  assert.strictEqual(justAfter.state, 'fasting');
  assert.strictEqual(justAfter.nextEatAt, lunch + 16 * H);
});

// 4) 공복 16h 경과 → 새 윈도우 시작 가능
check('마지막 식사 +16h 경과는 ready_new_window & canEat', () => {
  const lunch = T0;
  const r = computeStatus({ now: lunch + 16 * H, meals: [lunch], settings });
  assert.strictEqual(r.canEat, true);
  assert.strictEqual(r.state, 'ready_new_window');
});

// 5) 같은 윈도우 안의 여러 끼 → anchor 는 첫 끼로 고정
check('윈도우 내 여러 끼면 anchor=첫 끼', () => {
  const lunch = T0;
  const snack = T0 + 3 * H;
  const r = computeStatus({ now: T0 + 4 * H, meals: [snack, lunch], settings });
  assert.strictEqual(r.anchorAt, lunch);
  assert.strictEqual(r.windowEndsAt, lunch + 8 * H);
  assert.strictEqual(r.canEat, true);
});

// 6) 어제 바우트 + 오늘 새 점심 → anchor 가 오늘 끼로 갱신
check('16h+ 공백 뒤 새 끼면 anchor 갱신', () => {
  const yesterday = T0;
  const today = T0 + 20 * H; // 20h 공백(>16h)
  const r = computeStatus({ now: today + 1 * H, meals: [yesterday, today], settings });
  assert.strictEqual(r.anchorAt, today);
  assert.strictEqual(r.state, 'in_window');
});

console.log(`\n${pass} passed.`);
