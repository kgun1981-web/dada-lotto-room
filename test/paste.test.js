import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePasted, saturdayOf } from '../lib/paste.js';
import { KNOWN } from '../tools/fetch_draws.mjs';

test('동행복권 결과 화면 복사 형식 (2026-11-04 김동건 실제 복사본)', () => {
  const r = parsePasted('16\n18\n27\n36\n38\n42\n+\n보너스번호\n22');
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.items[0], { round: null, numbers: [16, 18, 27, 36, 38, 42], bonus: 22, date: null, note: '' });
});
test('회차·날짜가 함께 있으면 같이 읽음', () => {
  const r = parsePasted('제 1248회 당첨결과 (2026년 10월 31일 추첨)\n16 18 27 36 38 42 + 22');
  assert.deepEqual(r.items, [{ round: 1248, date: '2026-10-31', numbers: [16, 18, 27, 36, 38, 42], bonus: 22, note: '' }]);
});
test('당첨확인 앱 목록 형식 여러 회차 한꺼번에 (날짜 2026.01.31 형식)', () => {
  const r = parsePasted('1209회 2026.01.31\n2 17 20 35 37 39 + 24\n합 150 | 출현 75.9% | 홀짝 4:2\n1208회 2026.01.24\n6 27 30 36 38 42 + 25');
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items[0], { round: 1209, date: '2026-01-31', numbers: [2, 17, 20, 35, 37, 39], bonus: 24, note: '' });
  assert.deepEqual(r.items[1].numbers, [6, 27, 30, 36, 38, 42]);
  assert.equal(r.items[1].bonus, 25);
});
test('보너스 표시 없이 7개면 7번째를 보너스로 (안내 표시)', () => {
  const r = parsePasted('16 18 27 36 38 42 22');
  assert.deepEqual(r.items[0].numbers, [16, 18, 27, 36, 38, 42]);
  assert.equal(r.items[0].bonus, 22);
  assert.match(r.items[0].note, /7번째/);
});
test('46 이상 숫자(금액·합계 등)는 번호로 보지 않음', () => {
  const r = parsePasted('16 18 27 36 38 42 + 22 1등 1,933,658,450원');
  assert.deepEqual(r.items[0].numbers, [16, 18, 27, 36, 38, 42]);
  assert.equal(r.items[0].bonus, 22);
});
test('빈 내용·번호 부족은 그대로 돌려줘서 화면에서 확인', () => {
  assert.equal(parsePasted('   ').items.length, 0);
  assert.equal(parsePasted('16 18 27').items[0].numbers.length, 3);
});
test('추첨일 계산: 알려진 회차와 일치', () => {
  for (const [r, k] of Object.entries(KNOWN)) assert.equal(saturdayOf(Number(r)), k.date, `${r}회`);
  assert.equal(saturdayOf(1249), '2026-11-07');
});
