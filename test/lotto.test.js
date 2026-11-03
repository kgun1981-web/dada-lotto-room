import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateGame, validateDraw, judge, generateGames, randomBelow,
  filterHits, InputError, FILTERS,
} from '../lib/lotto.js';

// 결정적 난수 공급자 (재현 가능 테스트용, xorshift32)
function seeded(seed = 12345) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
}

// ---- 판정기 고정 예시 (GPT 확정안, 가상 픽스처) ----
const FIX = { numbers: [1, 2, 3, 4, 5, 6], bonus: 7 };
const cases = [
  [[1, 2, 3, 4, 5, 6], 1],
  [[1, 2, 3, 4, 5, 7], 2],
  [[1, 2, 3, 4, 5, 8], 3],
  [[1, 2, 3, 4, 8, 9], 4],
  [[1, 2, 3, 8, 9, 10], 5],
  [[1, 2, 8, 9, 10, 11], 0],
  [[7, 8, 9, 10, 11, 12], 0],
];
for (const [g, rank] of cases) {
  test(`판정 ${g.join(',')} → ${rank || '낙첨'}`, () => {
    assert.equal(judge(g, FIX).rank, rank);
  });
}

test('입력 오류: 중복', () => assert.throws(() => judge([1, 2, 3, 4, 5, 5], FIX), InputError));
test('입력 오류: 범위 46', () => assert.throws(() => judge([1, 2, 3, 4, 5, 46], FIX), InputError));
test('입력 오류: 0', () => assert.throws(() => validateGame([0, 2, 3, 4, 5, 6]), InputError));
test('입력 오류: 소수', () => assert.throws(() => validateGame([1.5, 2, 3, 4, 5, 6]), InputError));
test('입력 오류: 문자열', () => assert.throws(() => validateGame(['1', 2, 3, 4, 5, 6]), InputError));
test('입력 오류: 5개', () => assert.throws(() => validateGame([1, 2, 3, 4, 5]), InputError));
test('입력 오류: 7개', () => assert.throws(() => validateGame([1, 2, 3, 4, 5, 6, 7]), InputError));
test('당첨번호 오류: 보너스가 본번호와 겹침', () =>
  assert.throws(() => validateDraw({ numbers: [1, 2, 3, 4, 5, 6], bonus: 6 }), InputError));
test('당첨번호 오류: 보너스 범위', () =>
  assert.throws(() => validateDraw({ numbers: [1, 2, 3, 4, 5, 6], bonus: 46 }), InputError));

test('미추첨 회차는 낙첨이 아니라 판정 불가', () => {
  const r = judge([1, 2, 3, 4, 5, 6], undefined);
  assert.equal(r.rank, null);
});

test('입력 순서 무관', () => {
  assert.equal(judge([6, 5, 4, 3, 2, 1], FIX).rank, 1);
  assert.equal(judge([7, 5, 4, 3, 2, 1], FIX).rank, 2);
});

test('원본 배열 변경 없음', () => {
  const g = [6, 5, 4, 3, 2, 1];
  const d = { numbers: [6, 5, 4, 3, 2, 1], bonus: 7 };
  judge(g, d);
  assert.deepEqual(g, [6, 5, 4, 3, 2, 1]);
  assert.deepEqual(d.numbers, [6, 5, 4, 3, 2, 1]);
});

// ---- 실제 회차 대조 (언론 보도 기준 픽스처) ----
const data = JSON.parse(readFileSync(new URL('../draws/lotto645.json', import.meta.url)));
for (const d of data.draws) {
  test(`실제 ${d.round}회 데이터 검증·대조`, () => {
    validateDraw(d);
    assert.ok(d.source.startsWith('https://'));
    assert.equal(judge(d.numbers, d).rank, 1);
    const five = [...d.numbers.slice(0, 5), d.bonus];
    assert.equal(judge(five, d).rank, 2);
  });
}
test('실제 데이터: 회차 중복 없음·증가', () => {
  const rounds = data.draws.map((d) => d.round);
  assert.equal(new Set(rounds).size, rounds.length);
  for (let i = 1; i < rounds.length; i++) assert.ok(rounds[i] > rounds[i - 1]);
});

// ---- 번호 생성 ----
function checkGames(games) {
  assert.equal(games.length, 10);
  for (const g of games) {
    validateGame(g);
    assert.deepEqual(g, [...g].sort((a, b) => a - b));
  }
  assert.equal(new Set(games.map((g) => g.join(','))).size, 10);
}

test('필터 켜기: 10게임, 규칙 위반 없음', () => {
  for (let s = 1; s <= 200; s++) {
    const { games } = generateGames({ next32: seeded(s), filter: true });
    checkGames(games);
    for (const g of games) assert.deepEqual(filterHits(g), []);
  }
});

test('필터 끄기: 10게임 정상, 필터 해당 조합도 허용', () => {
  let sawHit = false;
  for (let s = 1; s <= 500; s++) {
    const { games } = generateGames({ next32: seeded(s), filter: false });
    checkGames(games);
    if (games.some((g) => filterHits(g).length)) sawHit = true;
  }
  assert.ok(sawHit, '필터 끄면 해당 패턴도 나와야 함');
});

test('같은 시드면 같은 결과 (재현성)', () => {
  const a = generateGames({ next32: seeded(7) }).games;
  const b = generateGames({ next32: seeded(7) }).games;
  assert.deepEqual(a, b);
});

test('재시도 상한 초과 시 오류', () => {
  assert.throws(() => generateGames({ next32: seeded(1), maxTries: 3 }), /번호 생성 실패/);
});

test('기본 난수는 crypto 사용 (실행 확인)', () => {
  checkGames(generateGames().games);
});

test('randomBelow 편향 없음 (거부 샘플링 경계)', () => {
  // 한계값 이상은 버려야 함
  const seq = [0xFFFFFFFF, 0xFFFFFFFE, 44];
  let i = 0;
  assert.equal(randomBelow(45, () => seq[i++]), 44);
});

test('필터별 탈락 통계 기록', () => {
  const total = Object.fromEntries(Object.keys(FILTERS).map((k) => [k, 0]));
  let tries = 0;
  for (let s = 1; s <= 1000; s++) {
    const { stats } = generateGames({ next32: seeded(s) });
    tries += stats.tries;
    for (const k in total) total[k] += stats.rejected[k];
  }
  console.log('[필터 통계] 1000회 생성, 총 시도', tries, '탈락', total);
  assert.ok(tries >= 10000);
});
