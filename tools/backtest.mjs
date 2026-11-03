// 통계 추천 v1 과거 검증 결과 생성 → draws/backtest.json
// 사전 등록(DESIGN.md 16절)한 구간 601~1248회 + 등록 후 새로 쌓인 회차(1249회~)를 따로 집계
// 사용: node tools/backtest.mjs
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { backtest, recommend, STRATEGY } from '../lib/stats.js';

const DRAWS = fileURLToPath(new URL('../draws/lotto645.json', import.meta.url));
const OUT = fileURLToPath(new URL('../draws/backtest.json', import.meta.url));
const PRE = { from: 601, to: 1248 };

const data = JSON.parse(readFileSync(DRAWS, 'utf8'));
const draws = data.draws;
const latest = Math.max(...draws.map((d) => d.round));
const started = Date.now();
const pre = backtest(draws, { ...PRE, seeds: 30 });
const post = latest > PRE.to ? backtest(draws, { from: PRE.to + 1, to: latest, seeds: 30 }) : null;
const out = {
  strategy: { id: STRATEGY.id, name: STRATEGY.name, window: STRATEGY.window, games: STRATEGY.games, registered: 'DESIGN.md 16절, 2026-11-04 커밋 c5deff0' },
  dataLatest: latest,
  generatedAt: new Date().toISOString(),
  preRegistered: pre,
  afterRegistration: post,
  next: { round: latest + 1, games: recommend(draws, latest + 1) },
};
writeFileSync(OUT + '.tmp', JSON.stringify(out) + '\n');
renameSync(OUT + '.tmp', OUT);
const c = pre.compare;
const f = (k) => `${c[k].strategy} (무작위 ${c[k].random.min}~${c[k].random.max}, 평균 ${c[k].random.mean.toFixed(1)})`;
console.log(`과거 검증 ${pre.from}~${pre.to}회 ${pre.rounds}회차, ${((Date.now() - started) / 1000).toFixed(1)}초`);
console.log(`3개+ 일치 ${f('hit3plus')} · 4개 ${f('match4')} · 5개 ${f('match5')} · 6개 ${f('match6')}`);
console.log(`당첨금 ${c.prize.strategy.toLocaleString()}원 / 구매 ${pre.spend.toLocaleString()}원 (무작위 평균 ${Math.round(c.prize.random.mean).toLocaleString()}원)`);
if (post) console.log(`등록 후 ${post.from}~${post.to}회: 3개+ ${post.compare.hit3plus.strategy}`);
