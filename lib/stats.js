// 통계 추천 v1 · 번호 통계 · 과거 검증 (순수 함수)
// 규칙은 DESIGN.md 16절(사전 등록)과 같아야 함. 바꾸면 v2로 새로 등록
import { judge } from './lotto.js';

export const STRATEGY = Object.freeze({
  id: 'recent52-weighted-v1',
  name: '통계 추천 v1',
  window: 52,
  games: 10,
  seed: (t) => t * 1000 + 17,
  randomSeed: (t, s) => t * 1000 + 100 + s,
});

/** 재현 가능한 난수 (0 이상 1 미만) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** t회 이전(round < t) 회차만. 미래 자료 누설 방지의 단일 관문 */
export function before(draws, t) {
  return draws.filter((d) => d.round < t);
}

/** 번호별 통계 (t회 직전까지) */
export function numberStats(draws, t, window = STRATEGY.window) {
  const past = before(draws, t).sort((a, b) => a.round - b.round);
  const all = new Array(46).fill(0);
  const recent = new Array(46).fill(0);
  const last = new Array(46).fill(0);
  const from = t - window;
  for (const d of past) {
    for (const n of d.numbers) {
      all[n]++;
      if (d.round >= from) recent[n]++;
      last[n] = d.round;
    }
  }
  const nums = Array.from({ length: 45 }, (_, i) => i + 1);
  return nums.map((n) => ({
    n, all: all[n], recent: recent[n],
    gap: last[n] ? t - 1 - last[n] : null, // 마지막으로 나온 뒤 지난 회차 수 (직전 회차에 나왔으면 0)
  }));
}

/** 함께 나온 번호쌍 상위 k개 (t회 직전까지) */
export function topPairs(draws, t, k = 10) {
  const c = new Map();
  for (const d of before(draws, t)) {
    const ns = d.numbers;
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
      const key = ns[i] * 100 + ns[j];
      c.set(key, (c.get(key) || 0) + 1);
    }
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k)
    .map(([key, count]) => ({ a: Math.floor(key / 100), b: key % 100, count }));
}

/** 가중치 비례로 6개를 중복 없이 */
function weightedGame(weights, rnd) {
  const pool = weights.map((w, i) => ({ n: i + 1, w }));
  const pick = [];
  for (let k = 0; k < 6; k++) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = rnd() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r < 0) { idx = i; break; } }
    pick.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return pick.sort((a, b) => a - b);
}

function distinctGames(count, make) {
  const games = []; const seen = new Set();
  for (let tries = 0; games.length < count; tries++) {
    if (tries > 10000) throw new Error('추천 게임 생성 실패');
    const g = make();
    const key = g.join(',');
    if (seen.has(key)) continue;
    seen.add(key); games.push(g);
  }
  return games;
}

/** 통계 추천 v1: t회용 10게임 */
export function recommend(draws, t) {
  const stats = numberStats(draws, t);
  const weights = stats.map((s) => 1 + s.recent);
  const rnd = mulberry32(STRATEGY.seed(t));
  return distinctGames(STRATEGY.games, () => weightedGame(weights, rnd));
}

/** 기준선: 균등 무작위 10게임 */
export function randomGames(t, s) {
  const rnd = mulberry32(STRATEGY.randomSeed(t, s));
  return distinctGames(STRATEGY.games, () => weightedGame(new Array(45).fill(1), rnd));
}

/** 4등 50,000원, 5등 5,000원 (1~3등은 금액 자료를 보관하지 않음) */
export const FIXED_PRIZE = Object.freeze({ 4: 50000, 5: 5000 });

/** 게임 묶음을 한 회차 결과로 채점 */
export function score(games, draw) {
  const out = { rank: [0, 0, 0, 0, 0, 0], match: [0, 0, 0, 0, 0, 0, 0], prize: 0 };
  for (const g of games) {
    const r = judge(g, draw);
    out.match[r.matched]++;
    if (r.rank) {
      out.rank[r.rank]++;
      out.prize += FIXED_PRIZE[r.rank] || 0; // 4·5등 고정 금액만 (1~3등은 회차마다 달라 게임 수로만 집계)
    }
  }
  return out;
}

const emptyTotals = () => ({ rank: [0, 0, 0, 0, 0, 0], match: [0, 0, 0, 0, 0, 0, 0], prize: 0, spend: 0, rounds: 0 });
function addInto(tot, s) {
  for (let i = 0; i < 6; i++) tot.rank[i] += s.rank[i];
  for (let i = 0; i < 7; i++) tot.match[i] += s.match[i];
  tot.prize += s.prize; tot.spend += STRATEGY.games * 1000; tot.rounds++;
}

/** 과거 검증: from~to회, 통계 추천과 무작위 seeds개 */
export function backtest(draws, { from, to, seeds = 30 }) {
  const byRound = new Map(draws.map((d) => [d.round, d]));
  const strat = emptyTotals();
  const rand = Array.from({ length: seeds }, emptyTotals);
  for (let t = from; t <= to; t++) {
    const d = byRound.get(t);
    if (!d) throw new Error(`${t}회 자료 없음`);
    addInto(strat, score(recommend(draws, t), d));
    for (let s = 1; s <= seeds; s++) addInto(rand[s - 1], score(randomGames(t, s), d));
  }
  const summarize = (key) => {
    const vals = rand.map(key);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { min: Math.min(...vals), mean, max: Math.max(...vals), below: vals.filter((v) => v < key(strat)).length, equal: vals.filter((v) => v === key(strat)).length };
  };
  const metrics = {
    hit3plus: (x) => x.match[3] + x.match[4] + x.match[5] + x.match[6],
    match3: (x) => x.match[3], match4: (x) => x.match[4], match5: (x) => x.match[5], match6: (x) => x.match[6],
    rank5: (x) => x.rank[5], rank4: (x) => x.rank[4], rank3: (x) => x.rank[3], rank2: (x) => x.rank[2], rank1: (x) => x.rank[1],
    prize: (x) => x.prize,
  };
  const compare = Object.fromEntries(Object.entries(metrics).map(([k, f]) => [k, { strategy: f(strat), random: summarize(f) }]));
  return { from, to, rounds: strat.rounds, spend: strat.spend, seeds, strategy: strat, compare };
}
