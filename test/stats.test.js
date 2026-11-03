import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommend, randomGames, numberStats, topPairs, before, backtest, score, STRATEGY, mulberry32 } from '../lib/stats.js';
import { validateGame } from '../lib/lotto.js';

const DRAWS = JSON.parse(readFileSync(new URL('../draws/lotto645.json', import.meta.url))).draws;
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- 미래 자료 누설 방지 ----
test('누설 방지: t회 이후 모든 회차를 바꿔도 t회 추천은 같음', () => {
  for (const t of [601, 900, 1200, 1248]) {
    const base = recommend(DRAWS, t);
    const tampered = clone(DRAWS).map((d) => (d.round >= t ? { ...d, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 } : d));
    assert.deepEqual(recommend(tampered, t), base, `${t}회`);
    const removed = DRAWS.filter((d) => d.round < t);
    assert.deepEqual(recommend(removed, t), base, `${t}회 (이후 회차 삭제)`);
  }
});
test('누설 방지: 번호 통계·번호쌍도 t회 이후 자료와 무관', () => {
  const t = 1000;
  const tampered = clone(DRAWS).map((d) => (d.round >= t ? { ...d, numbers: [40, 41, 42, 43, 44, 45] } : d));
  assert.deepEqual(numberStats(tampered, t), numberStats(DRAWS, t));
  assert.deepEqual(topPairs(tampered, t), topPairs(DRAWS, t));
});
test('민감도: t회 직전 52회차 자료를 바꾸면 추천이 달라짐', () => {
  const t = 1000;
  const tampered = clone(DRAWS).map((d) => (d.round >= t - 52 && d.round < t ? { ...d, numbers: [1, 2, 3, 4, 5, 6] } : d));
  assert.notDeepEqual(recommend(tampered, t), recommend(DRAWS, t));
});
test('민감도: 창 밖(53회차 이전) 자료는 가중치에 영향 없음 (규칙 그대로)', () => {
  const t = 1000;
  const tampered = clone(DRAWS).map((d) => (d.round < t - 52 ? { ...d, numbers: [1, 2, 3, 4, 5, 6] } : d));
  assert.deepEqual(recommend(tampered, t), recommend(DRAWS, t));
});
test('before()는 round < t만 남김', () => {
  assert.ok(before(DRAWS, 10).every((d) => d.round < 10));
  assert.equal(before(DRAWS, 10).length, 9);
});

// ---- 규칙 ----
test('추천: 10게임, 각 게임 유효, 서로 다름, 같은 회차는 항상 같음', () => {
  const g = recommend(DRAWS, 1249);
  assert.equal(g.length, 10);
  g.forEach(validateGame);
  assert.equal(new Set(g.map((x) => x.join())).size, 10);
  assert.deepEqual(recommend(DRAWS, 1249), g);
});
test('무작위 기준선: 시드마다 다르고 같은 시드는 같음', () => {
  assert.deepEqual(randomGames(700, 1), randomGames(700, 1));
  assert.notDeepEqual(randomGames(700, 1), randomGames(700, 2));
});
test('번호 통계: 전체 출현 합 = 회차 수 × 6, 최근 합 = 52 × 6', () => {
  const s = numberStats(DRAWS, 1249);
  assert.equal(s.reduce((a, x) => a + x.all, 0), 1248 * 6);
  assert.equal(s.reduce((a, x) => a + x.recent, 0), 52 * 6);
  assert.ok(s.every((x) => x.gap === null || x.gap >= 0));
});
test('채점: 1·2·5등 계산과 당첨금 합', () => {
  const d = { numbers: [1, 2, 3, 4, 5, 6], bonus: 7, ranks: [1, 2, 3, 4, 5].map((r) => ({ rank: r, amount: r * 100 })) };
  const s = score([[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7], [1, 2, 3, 40, 41, 42], [40, 41, 42, 43, 44, 45]], d);
  assert.deepEqual(s.rank, [0, 1, 1, 0, 0, 1]);
  assert.equal(s.prize, 100 + 200 + 500);
  assert.equal(s.match[0], 1);
});
test('난수: 0 이상 1 미만', () => {
  const r = mulberry32(5);
  for (let i = 0; i < 1000; i++) { const x = r(); assert.ok(x >= 0 && x < 1); }
});

// ---- 과거 검증 결과 파일 ----
test('backtest.json: 사전 등록 구간·규칙과 일치, 다시 계산해도 같음', () => {
  const saved = JSON.parse(readFileSync(new URL('../draws/backtest.json', import.meta.url)));
  assert.equal(saved.strategy.id, STRATEGY.id);
  assert.equal(saved.preRegistered.from, 601);
  assert.equal(saved.preRegistered.to, 1248);
  assert.equal(saved.preRegistered.seeds, 30);
  const again = backtest(DRAWS, { from: 601, to: 1248, seeds: 30 });
  assert.deepEqual(again.compare, saved.preRegistered.compare);
  const latest = Math.max(...DRAWS.map((d) => d.round));
  assert.equal(saved.dataLatest, latest);
  assert.deepEqual(saved.next.games, recommend(DRAWS, latest + 1));
});
test('무작위 기준선 평균이 이론값과 가까움 (3개 이상 일치, 648회 × 10게임)', () => {
  const saved = JSON.parse(readFileSync(new URL('../draws/backtest.json', import.meta.url)));
  const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  const p = [3, 4, 5, 6].reduce((a, k) => a + C(6, k) * C(39, 6 - k), 0) / C(45, 6);
  const expect = p * 6480;
  assert.ok(Math.abs(saved.preRegistered.compare.hit3plus.random.mean - expect) < 10, `${saved.preRegistered.compare.hit3plus.random.mean} vs ${expect}`);
});
