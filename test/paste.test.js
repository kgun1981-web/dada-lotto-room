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

import { readFileSync, existsSync } from 'node:fs';
import { page, block, table, A, B, RANKS } from './_paste_fixture.mjs';
const pick = (x) => [x.round, x.date, x.numbers, x.bonus];

test('결과 화면 전체 복사: 숨은 옆 회차도 번호를 읽고, 당첨금 표는 고른 회차에만', () => {
  const r = parsePasted(page());
  assert.equal(r.current, B.round);
  assert.deepEqual(r.items.map(pick), [pick(A), pick(B)]);
  assert.equal(r.items[0].ranks, undefined);
  assert.deepEqual(r.items[1].ranks, RANKS);
});
test('회차 선택칸이 앞 회차면 표도 앞 회차에 붙음', () => {
  const r = parsePasted(page({ selected: A.round }));
  assert.deepEqual(r.items[0].ranks, RANKS);
  assert.equal(r.items[1].ranks, undefined);
});
test('표 안의 "5개번호 일치 + 보너스번호 일치"가 번호 읽기에 섞이지 않음', () => {
  const r = parsePasted(page());
  assert.equal(r.items[1].bonus, B.bonus);
  assert.equal(r.items[1].note, '');
});
test('회차 선택칸이 없고 블록이 여럿이면 금액은 저장하지 않음', () => {
  const r = parsePasted(page({ selected: null }));
  assert.equal(r.current, null);
  assert.ok(r.items.every((x) => !x.ranks));
  assert.match(r.items[1].note, /어느 회차 것인지 확실하지 않아/);
});
test('선택칸 없어도 블록이 하나면 그 회차 표', () => {
  const r = parsePasted(page({ selected: null, blocks: [B] }));
  assert.deepEqual(r.items[0].ranks, RANKS);
});
test('표가 잘리면(3등까지) 금액 빼고 번호만', () => {
  const r = parsePasted(page({ ranks: RANKS.slice(0, 3) }));
  assert.equal(r.items[1].ranks, undefined);
  assert.match(r.items[1].note, /3등까지만 읽어서 금액은 빼고/);
  assert.deepEqual(r.items[1].numbers, B.numbers);
});
test('표가 두 번 붙여넣어지면(여러 표) 금액 빼고 번호만', () => {
  const r = parsePasted(page({ extra: table(RANKS.map((x) => ({ ...x, amount: x.amount + 1 }))) }));
  assert.equal(r.items[1].ranks, undefined);
  assert.match(r.items[1].note, /여러 개라/);
});
test('표 없이 블록만 복사해도 번호는 읽음', () => {
  const r = parsePasted(page({ ranks: null }));
  assert.equal(r.items.length, 2);
  assert.ok(r.items.every((x) => !x.ranks && x.note === ''));
});
test('회차 표기 변형: 띄어쓰기 없음, 천 단위 쉼표', () => {
  const r = parsePasted(['3,002회', block(B, '제3,002회추첨결과'), table()].join('\n'));
  assert.equal(r.items[0].round, 3002);
  assert.deepEqual(r.items[0].ranks, RANKS);
});
test('읽기 성공처럼 보이는 오인식은 표시해 둠: 번호 7개 이상', () => {
  const bad = page({ blocks: [{ ...B, numbers: [1, ...B.numbers] }] , selected: B.round });
  const r = parsePasted(bad);
  assert.equal(r.items[0].guessed, true);
});
test('번호 중복·보너스 중복은 읽은 그대로 돌려줌(저장 단계에서 거부)', () => {
  const r = parsePasted(page({ blocks: [{ ...B, numbers: [5, 5, 19, 27, 35, 43], bonus: 43 }], selected: B.round }));
  assert.deepEqual(r.items[0].numbers, [5, 5, 19, 27, 35, 43]);
  assert.equal(r.items[0].bonus, 43);
});

// 김동건이 실제로 복사한 화면 글: 로컬에만 있음 (공개 저장소에는 없음)
const REAL = new URL('./local/fixtures-paste-1248.txt', import.meta.url);
test('실제 복사본(로컬 전용): 1247·1248회 번호, 1248회 당첨금', { skip: !existsSync(REAL) && '로컬 실제 복사본 없음' }, () => {
  const r = parsePasted(readFileSync(REAL, 'utf8'));
  assert.equal(r.current, 1248);
  assert.deepEqual(r.items.map((x) => x.round), [1247, 1248]);
  assert.equal(r.items[1].bonus, 22);
  assert.equal(r.items[1].ranks.length, 5);
});
