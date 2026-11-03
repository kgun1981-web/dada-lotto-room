import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDraw } from '../tools/fetch_draws.mjs';
import { validateDraw, judge } from '../lib/lotto.js';

// 2026-11-03 공식 조회 주소 실제 응답(1248회) 일부
const SAMPLE = { winType0: 0, winType1: 13, winType2: 2, winType3: 0, gmSqNo: 5133, ltEpsd: 1248, tm1WnNo: 16, tm2WnNo: 18, tm3WnNo: 27, tm4WnNo: 36, tm5WnNo: 38, tm6WnNo: 42, bnsWnNo: 22, ltRflYmd: '20261031', rnk1WnNope: 15, rnk1WnAmt: 1933658450, rnk2WnNope: 91, rnk2WnAmt: 53122485, rnk3WnNope: 3265, rnk3WnAmt: 1480597, rnk4WnNope: 167745, rnk4WnAmt: 50000, rnk5WnNope: 2723467, rnk5WnAmt: 5000, wholEpsdSumNtslAmt: 121355508000 };

test('공식 응답 변환: 1248회', () => {
  const d = toDraw(SAMPLE);
  assert.equal(d.round, 1248);
  assert.equal(d.date, '2026-10-31');
  assert.deepEqual(d.numbers, [16, 18, 27, 36, 38, 42]);
  assert.equal(d.bonus, 22);
  assert.equal(d.firstWinners, 15);
  assert.deepEqual(d.firstByType, { auto: 13, manual: 2, semi: 0 });
  assert.equal(d.ranks[0].amount, 1933658450);
  assert.equal(d.status, 'official_verified');
  validateDraw(d);
  assert.equal(judge([16, 18, 27, 36, 38, 22], d).rank, 2);
});
test('공식 응답 변환: 번호 순서가 섞여 와도 정렬', () => {
  const d = toDraw({ ...SAMPLE, tm1WnNo: 42, tm6WnNo: 16 });
  assert.deepEqual(d.numbers, [16, 18, 27, 36, 38, 42]);
});
