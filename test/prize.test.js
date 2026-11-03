import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prizeFor, planPasteItem } from '../lib/prize.js';
import { parsePasted } from '../lib/paste.js';
import { validateUserDraw, mergeDraws } from '../lib/userdraws.js';
import { makeBackup, readBackup } from '../lib/backup.js';

const FULL = readFileSync(new URL('./fixtures-paste-1248.txt', import.meta.url), 'utf8');
const NOW = new Date('2026-11-04T00:00:00Z');
const [i1247, i1248] = parsePasted(FULL).items;
const pub1247 = { round: 1247, date: '2026-10-24', numbers: [8, 14, 21, 22, 42, 45], bonus: 24, status: 'official_verified' };

test('당첨금: 표가 있으면 표, 없으면 4·5등 고정, 1~3등은 모름', () => {
  assert.deepEqual(prizeFor(3, i1248.ranks), { amount: 1480597, source: 'table' });
  assert.deepEqual(prizeFor(5, null), { amount: 5000, source: 'fixed' });
  assert.deepEqual(prizeFor(1, null), { amount: null, source: null });
  assert.deepEqual(prizeFor(0, null), { amount: 0, source: null });
});
test('붙여넣기 저장 판단: 보관 자료와 같고 표 없음 → 할 일 없음', () => {
  assert.equal(planPasteItem(i1247, new Map([[1247, pub1247]]), [], NOW).kind, 'same');
});
test('붙여넣기 저장 판단: 새 회차 + 당첨금 표 → 새로 저장, 표도 보관', () => {
  const p = planPasteItem(i1248, new Map([[1247, pub1247]]), [], NOW);
  assert.equal(p.kind, 'new');
  assert.equal(p.draw.status, 'user_entered');
  assert.equal(p.draw.ranks.length, 5);
  assert.equal(p.dateGuessed, false);
});
test('붙여넣기 저장 판단: 이미 직접 입력한 같은 번호 → 당첨금만 더함', () => {
  const mine = validateUserDraw({ ...i1248, ranks: undefined, enteredAt: '2026-11-01T00:00:00Z' }, NOW);
  const p = planPasteItem(i1248, new Map(), [mine], NOW);
  assert.equal(p.kind, 'addPrize');
  assert.equal(p.draw.enteredAt, '2026-11-01T00:00:00Z', '입력 시각은 그대로');
  assert.equal(p.draw.ranks[0].amount, 1933658450);
});
test('붙여넣기 저장 판단: 다른 번호가 이미 있으면 저장 안 함', () => {
  const mine = validateUserDraw({ ...i1248, numbers: [1, 2, 3, 4, 5, 6] }, NOW);
  const p = planPasteItem(i1248, new Map(), [mine], NOW);
  assert.equal(p.kind, 'conflict');
  const p2 = planPasteItem({ ...i1247, bonus: 1 }, new Map([[1247, pub1247]]), [], NOW);
  assert.equal(p2.kind, 'conflict');
});
test('붙여넣기 저장 판단: 회차 없음 → 입력칸으로, 날짜 없음 → 회차로 계산', () => {
  const bare = parsePasted('16\n18\n27\n36\n38\n42\n+\n보너스번호\n22').items[0];
  const p = planPasteItem(bare, new Map(), [], NOW);
  assert.equal(p.kind, 'needForm');
  assert.deepEqual(p.form.numbers, [16, 18, 27, 36, 38, 42]);
  const p2 = planPasteItem({ ...bare, round: 1248 }, new Map(), [], NOW);
  assert.equal(p2.kind, 'new');
  assert.equal(p2.draw.date, '2026-10-31');
  assert.equal(p2.dateGuessed, true);
});
test('보관 자료와 같은 회차에 당첨금만 저장해도 판정은 보관 자료 기준(경고 없음)', () => {
  const p = planPasteItem({ ...i1248 }, new Map([[1248, { ...pub1247, round: 1248, date: '2026-10-31', numbers: i1248.numbers, bonus: 22 }]]), [], NOW);
  assert.equal(p.kind, 'addPrize');
  const pub = new Map([[1248, { round: 1248, date: '2026-10-31', numbers: i1248.numbers, bonus: 22, status: 'official_verified' }]]);
  const m = mergeDraws(pub, [p.draw]);
  assert.equal(m.index.get(1248).status, 'official_verified');
  assert.deepEqual(m.redundant, [1248]);
});
test('당첨금 표가 깨져 있으면 표만 버리고 번호는 저장', () => {
  const d = validateUserDraw({ ...i1248, ranks: [{ rank: 1, winners: -1, amount: 5 }] }, NOW);
  assert.equal(d.ranks, undefined);
  assert.deepEqual(d.numbers, i1248.numbers);
});
test('백업 왕복에 당첨금 표 유지', () => {
  const d = validateUserDraw(i1248, NOW);
  const r = readBackup(makeBackup([], [d], [], NOW), [], [], []);
  assert.deepEqual(r.drawsAdded[0].ranks, i1248.ranks);
});
