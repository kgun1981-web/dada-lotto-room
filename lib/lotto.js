// 로또 6/45 판정기·번호 생성기 (순수 함수, UI·저장소·네트워크와 분리)

export const MIN = 1;
export const MAX = 45;
export const PICK = 6;

export class InputError extends Error {}

/** 6개 번호 검증. 통과하면 오름차순 새 배열 반환(원본 변경 없음). */
export function validateGame(nums) {
  if (!Array.isArray(nums)) throw new InputError('번호 목록이 아닙니다');
  if (nums.length !== PICK) throw new InputError(`번호는 정확히 ${PICK}개여야 합니다`);
  for (const n of nums) {
    if (typeof n !== 'number' || !Number.isInteger(n)) throw new InputError('정수만 입력할 수 있습니다');
    if (n < MIN || n > MAX) throw new InputError(`번호는 ${MIN}~${MAX} 사이여야 합니다`);
  }
  if (new Set(nums).size !== PICK) throw new InputError('중복된 번호가 있습니다');
  return [...nums].sort((a, b) => a - b);
}

/** 당첨번호 + 보너스 검증 */
export function validateDraw(draw) {
  if (!draw || typeof draw !== 'object') throw new InputError('당첨 데이터가 없습니다');
  const numbers = validateGame(draw.numbers);
  const b = draw.bonus;
  if (typeof b !== 'number' || !Number.isInteger(b) || b < MIN || b > MAX) {
    throw new InputError('보너스 번호가 올바르지 않습니다');
  }
  if (numbers.includes(b)) throw new InputError('보너스 번호가 본번호와 겹칩니다');
  return { numbers, bonus: b };
}

/**
 * 등위 판정. 반환: { rank: 1~5 | 0(낙첨) | null(판정 불가), matched, bonusMatched, reason? }
 * draw가 없으면(미추첨·데이터 없음) 낙첨이 아니라 판정 불가.
 */
export function judge(game, draw) {
  const g = validateGame(game);
  if (draw == null) return { rank: null, matched: 0, bonusMatched: false, reason: '해당 회차 당첨 데이터 없음' };
  const d = validateDraw(draw);
  const win = new Set(d.numbers);
  const matched = g.filter((n) => win.has(n)).length;
  const bonusMatched = g.includes(d.bonus);
  let rank = 0;
  if (matched === 6) rank = 1;
  else if (matched === 5 && bonusMatched) rank = 2;
  else if (matched === 5) rank = 3;
  else if (matched === 4) rank = 4;
  else if (matched === 3) rank = 5;
  return { rank, matched, bonusMatched };
}

// ---------- 난수 ----------

/** 기본 난수 공급자: crypto.getRandomValues로 32비트 정수 */
export function cryptoSource() {
  const buf = new Uint32Array(1);
  return () => {
    globalThis.crypto.getRandomValues(buf);
    return buf[0];
  };
}

/** 편향 없는 정수 추출(거부 샘플링): 0 이상 n 미만 */
export function randomBelow(n, next32) {
  const limit = Math.floor(0x100000000 / n) * n;
  let x;
  do { x = next32(); } while (x >= limit);
  return x % n;
}

/** 1~45 중 서로 다른 6개 (부분 피셔-예이츠) */
export function randomGame(next32) {
  const pool = Array.from({ length: MAX }, (_, i) => i + MIN);
  for (let i = 0; i < PICK; i++) {
    const j = i + randomBelow(MAX - i, next32);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, PICK).sort((a, b) => a - b);
}

// ---------- 패턴 필터 (실험) ----------
// 통계적 예측이 아닌 선택 필터. 당첨 확률을 높이지 않음.

export const FILTERS = {
  allUnder32: {
    label: '6개 모두 31 이하',
    hit: (g) => g.every((n) => n <= 31),
  },
  run4: {
    label: '연속 번호 4개 이상',
    hit: (g) => {
      let run = 1;
      for (let i = 1; i < g.length; i++) {
        run = g[i] === g[i - 1] + 1 ? run + 1 : 1;
        if (run >= 4) return true;
      }
      return false;
    },
  },
  sameLastDigit4: {
    label: '같은 끝자리 4개 이상',
    hit: (g) => {
      const c = {};
      for (const n of g) c[n % 10] = (c[n % 10] || 0) + 1;
      return Object.values(c).some((v) => v >= 4);
    },
  },
};

export function filterHits(game) {
  return Object.keys(FILTERS).filter((k) => FILTERS[k].hit(game));
}

/**
 * 게임 생성. options: { count=10, filter=true, next32, maxTries=10000 }
 * 반환: { games, stats: { tries, rejected: {필터명: 횟수}, duplicates } }
 */
export function generateGames(options = {}) {
  const { count = 10, filter = true, next32 = cryptoSource(), maxTries = 10000 } = options;
  const games = [];
  const seen = new Set();
  const rejected = Object.fromEntries(Object.keys(FILTERS).map((k) => [k, 0]));
  let tries = 0;
  let duplicates = 0;
  while (games.length < count) {
    if (tries >= maxTries) {
      throw new Error(`번호 생성 실패: ${maxTries}회 시도 내에 ${count}게임을 만들지 못했습니다`);
    }
    tries++;
    const g = randomGame(next32);
    if (filter) {
      const hits = filterHits(g);
      if (hits.length) { hits.forEach((h) => rejected[h]++); continue; }
    }
    const key = g.join(',');
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    games.push(g);
  }
  return { games, stats: { tries, rejected, duplicates } };
}

export const RANK_LABEL = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등', 0: '낙첨' };
