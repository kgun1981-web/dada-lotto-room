// 테스트용 당첨번호 자료
// - 실제 자료(draws/lotto645.json)는 공개 저장소에 올리지 않음(로컬 전용). 있으면 실제 자료로, 없으면 합성 자료로 시험
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../lib/stats.js';
import { KNOWN } from '../tools/fetch_draws.mjs';

export const REAL_PATH = fileURLToPath(new URL('../draws/lotto645.json', import.meta.url));
export const HAS_REAL = existsSync(REAL_PATH);
export const SKIP_REAL = HAS_REAL ? false : '실제 당첨번호 자료 없음 (로컬 전용 파일)';

const day = (r) => new Date(Date.UTC(2002, 11, 7) + (r - 1) * 7 * 86400000).toISOString().slice(0, 10);

/** 1~n회 합성 자료 (날짜는 매주 토요일, 알려진 회차는 실제 값). 공식 응답 형식 필드 포함 */
export function synthetic(n = 1248) {
  const rnd = mulberry32(20261104);
  const out = [];
  for (let r = 1; r <= n; r++) {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1);
    const pick = [];
    for (let k = 0; k < 7; k++) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    let d = { round: r, date: day(r), numbers: pick.slice(0, 6).sort((a, b) => a - b), bonus: pick[6] };
    if (KNOWN[r]) {
      if (KNOWN[r].date !== d.date) throw new Error(`합성 날짜 불일치 ${r}`);
      d = { round: r, ...KNOWN[r] };
    }
    out.push({
      ...d, firstWinners: 1, firstByType: { auto: 1, manual: 0, semi: 0 },
      ranks: [1, 2, 3, 4, 5].map((k) => ({ rank: k, winners: 1, amount: 1 })),
      totalSales: 1, source: `https://www.dhlottery.co.kr/lt645/result?ltEpsd=${r}`, status: 'official_verified',
    });
  }
  return out;
}

export function realOrSynthetic() {
  return HAS_REAL ? JSON.parse(readFileSync(REAL_PATH, 'utf8')).draws : synthetic();
}
