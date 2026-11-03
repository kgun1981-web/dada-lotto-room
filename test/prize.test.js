import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prizeFor, planPasteItem } from '../lib/prize.js';
import { parsePasted } from '../lib/paste.js';
import { validateUserDraw, mergeDraws } from '../lib/userdraws.js';
import { makeBackup, readBackup } from '../lib/backup.js';
import { page, A, B, RANKS } from './_paste_fixture.mjs';

const NOW = new Date('2060-06-01T00:00:00Z');
const [iA, iB] = parsePasted(page()).items;
const pubA = { ...A, status: 'official_verified' };
const pubIdx = (...l) => new Map(l.map((d) => [d.round, d]));

test('당첨금: 표가 있으면 표, 없으면 4·5등 고정, 1~3등은 모름', () => {
  assert.deepEqual(prizeFor(3, iB.ranks), { amount: 1700000, source: 'table' });
  assert.deepEqual(prizeFor(5, null), { amount: 5000, source: 'fixed' });
  assert.deepEqual(prizeFor(1, null), { amount: null, source: null });
  assert.deepEqual(prizeFor(0, null), { amount: 0, source: null });
});
test('보관 자료와 같고 표 없음 → 할 일 없음', () => {
  assert.equal(planPasteItem(iA, pubIdx(pubA), [], NOW).kind, 'same');
});
test('새 회차 + 당첨금 표 → 새로 저장 (user_entered, 붙여넣기 표시, 표 보관)', () => {
  const p = planPasteItem(iB, pubIdx(pubA), [], NOW);
  assert.equal(p.kind, 'new');
  assert.equal(p.draw.status, 'user_entered');
  assert.equal(p.draw.via, 'paste');
  assert.deepEqual(p.draw.ranks, RANKS);
});
test('이미 직접 입력한 같은 번호 → 당첨금만 더함, 입력 시각 유지', () => {
  const mine = validateUserDraw({ ...B, enteredAt: '2060-05-16T00:00:00Z' }, NOW);
  const p = planPasteItem(iB, new Map(), [mine], NOW);
  assert.equal(p.kind, 'addPrize');
  assert.equal(p.draw.enteredAt, '2060-05-16T00:00:00Z');
  assert.equal(p.draw.via, undefined, '직접 입력 기록은 그대로');
});
test('다른 번호가 이미 있으면 저장 안 함', () => {
  const mine = validateUserDraw({ ...B, numbers: [1, 3, 4, 5, 6, 7] }, NOW);
  assert.equal(planPasteItem(iB, new Map(), [mine], NOW).kind, 'conflict');
  assert.equal(planPasteItem({ ...iA, bonus: 1 }, pubIdx(pubA), [], NOW).kind, 'conflict');
});
test('번호 중복 → 입력칸으로, 불완전한 번호는 채우지 않음', () => {
  const p = planPasteItem({ ...iB, numbers: [5, 5, 19, 27, 35, 43] }, new Map(), [], NOW);
  assert.equal(p.kind, 'needForm');
  assert.deepEqual(p.form.numbers, []);
  assert.equal(p.form.round, B.round);
});
test('보너스가 본번호와 겹침 → 입력칸으로', () => {
  const p = planPasteItem({ ...iB, bonus: 43 }, new Map(), [], NOW);
  assert.equal(p.kind, 'needForm');
  assert.match(p.reason, /보너스/);
});
test('추측이 들어간 읽기(7번째를 보너스로) → 저장하지 않고 입력칸으로, 값도 채우지 않음', () => {
  const it = { ...parsePasted('16 18 27 36 38 42 22').items[0], round: 3002 };
  const p = planPasteItem(it, new Map(), [], NOW);
  assert.equal(p.kind, 'needForm');
  assert.deepEqual(p.form.numbers, []);
});
test('회차 없음 → 입력칸으로 (온전한 번호는 채움), 날짜 없음 → 회차로 계산', () => {
  const bare = parsePasted('16\n18\n27\n36\n38\n42\n+\n보너스번호\n22').items[0];
  const p = planPasteItem(bare, new Map(), [], NOW);
  assert.equal(p.kind, 'needForm');
  assert.deepEqual(p.form.numbers, [16, 18, 27, 36, 38, 42]);
  const p2 = planPasteItem({ ...bare, round: 1248 }, new Map(), [], NOW);
  assert.equal(p2.kind, 'new');
  assert.equal(p2.draw.date, '2026-10-31');
  assert.equal(p2.dateGuessed, true);
});
test('보관 자료와 같은 회차에 당첨금만 저장해도 판정은 보관 자료 기준', () => {
  const pub = pubIdx({ ...B, status: 'official_verified' });
  const p = planPasteItem(iB, pub, [], NOW);
  assert.equal(p.kind, 'addPrize');
  const m = mergeDraws(pub, [p.draw]);
  assert.equal(m.index.get(B.round).status, 'official_verified');
  assert.deepEqual(m.redundant, [B.round]);
});
test('당첨금 표가 깨져 있으면 표만 버리고 번호는 저장', () => {
  const d = validateUserDraw({ ...B, ranks: [{ rank: 1, winners: -1, amount: 5 }] }, NOW);
  assert.equal(d.ranks, undefined);
  assert.deepEqual(d.numbers, B.numbers);
});
test('백업 왕복에 당첨금 표·붙여넣기 표시 유지', () => {
  const d = validateUserDraw({ ...B, ranks: RANKS, via: 'paste' }, NOW);
  const r = readBackup(makeBackup([], [d], [], NOW), [], [], []);
  assert.deepEqual(r.drawsAdded[0].ranks, RANKS);
  assert.equal(r.drawsAdded[0].via, 'paste');
});
