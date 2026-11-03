// 직접 입력한 당첨번호: 검증과 공개 데이터와의 합치기 (순수 함수)
// 규칙(GPT 2026-11-03):
//  - 상태는 항상 user_entered. press_verified/official_verified로 자동 승격하지 않음
//  - 참고용 판정은 허용하되 화면에 "직접 입력한 당첨번호 기준 · 공식 결과와 대조 필요" 표시
//  - 공개 데이터와 값이 다르면 조용히 덮어쓰지 않고 충돌로 알림. 사용자가 고르기 전까지는 공개 데이터로 판정
import { validateDraw, InputError } from './lotto.js';
import { parseRound, isValidDate } from './tickets.js';

export const USER_STATUS = 'user_entered';

/**
 * @typedef {{ round: number, date: string, numbers: number[], bonus: number, status: 'user_entered',
 *             enteredAt: string, preferUser?: boolean,
 *             ranks?: Array<{rank:number, winners:number, amount:number}> }} UserDraw
 */

/** 저장 전 검증. 원본을 바꾸지 않고 정리된 사본 반환 */
export function validateUserDraw(d, now = new Date()) {
  if (!d || typeof d !== 'object') throw new InputError('당첨번호 정보가 없습니다');
  const round = parseRound(d.round);
  if (!isValidDate(d.date)) throw new InputError('추첨일을 올바르게 선택해 주세요');
  let numbers; let bonus;
  try { ({ numbers, bonus } = validateDraw({ numbers: d.numbers, bonus: d.bonus })); }
  catch (e) { throw new InputError(e.message); }
  return {
    round, date: d.date, numbers, bonus,
    status: USER_STATUS,
    enteredAt: typeof d.enteredAt === 'string' ? d.enteredAt : now.toISOString(),
    preferUser: d.preferUser === true,
    ...(d.via === 'paste' ? { via: 'paste' } : {}), // 공식 결과 화면을 붙여넣어 입력 (상태는 그대로 user_entered)
    ...(cleanRanks(d.ranks) ? { ranks: cleanRanks(d.ranks) } : {}),
  };
}

/** 등위별 당첨금 표(붙여넣기로 읽은 것). 1~5등이 모두 온전할 때만 보관, 아니면 버림(번호 저장은 그대로) */
export function cleanRanks(ranks) {
  if (!Array.isArray(ranks) || ranks.length !== 5) return null;
  const out = [];
  for (const r of ranks) {
    if (!r || !Number.isInteger(r.rank) || r.rank < 1 || r.rank > 5) return null;
    if (!Number.isSafeInteger(r.winners) || r.winners < 0 || !Number.isSafeInteger(r.amount) || r.amount < 0) return null;
    out.push({ rank: r.rank, winners: r.winners, amount: r.amount });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out.every((r, i) => r.rank === i + 1) ? out : null;
}

const same = (a, b) => a.date === b.date && a.bonus === b.bonus && a.numbers.join(',') === b.numbers.join(',');

/**
 * 공개 데이터(검증 통과분)와 직접 입력을 합침.
 * - 공개에만 있음 → 공개
 * - 직접 입력에만 있음 → 직접 입력(user_entered)
 * - 둘 다 있고 같음 → 공개 (직접 입력은 중복)
 * - 둘 다 있고 다름 → 충돌. preferUser면 직접 입력, 아니면 공개로 판정
 * 반환: { index: Map, conflicts: [{round, publicDraw, userDraw, using: 'public'|'user'}], redundant: number[] }
 */
export function mergeDraws(publicIndex, userDraws) {
  const index = new Map(publicIndex);
  const conflicts = []; const redundant = [];
  for (const raw of userDraws || []) {
    let u;
    try { u = validateUserDraw(raw); } catch { continue; } // 깨진 기록은 판정에 쓰지 않음
    const p = publicIndex.get(u.round);
    if (!p) { index.set(u.round, u); continue; }
    if (same(p, u)) { redundant.push(u.round); continue; }
    const using = u.preferUser ? 'user' : 'public';
    if (using === 'user') index.set(u.round, u);
    conflicts.push({ round: u.round, publicDraw: p, userDraw: u, using });
  }
  return { index, conflicts, redundant };
}

/** 판정에 쓰인 당첨번호가 직접 입력인지 */
export const isUserDraw = (d) => !!d && d.status === USER_STATUS;
