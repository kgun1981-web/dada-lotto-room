// 당첨금 표시와 붙여넣기 저장 판단 (순수 함수)
import { saturdayOf } from './paste.js';
import { validateUserDraw } from './userdraws.js';
import { FIXED_PRIZE } from './stats.js'; // 4·5등 고정 금액

/**
 * 한 게임의 당첨금.
 * ranks: 같은 회차·같은 번호로 붙여넣어 보관한 등위별 당첨금 표 (없으면 null)
 * 반환: { amount: number|null, source: 'fixed'|'table'|null }
 */
export function prizeFor(rank, ranks) {
  if (!rank) return { amount: 0, source: null };
  const row = Array.isArray(ranks) ? ranks.find((r) => r.rank === rank) : null;
  if (row) return { amount: row.amount, source: 'table' };
  if (FIXED_PRIZE[rank]) return { amount: FIXED_PRIZE[rank], source: 'fixed' };
  return { amount: null, source: null };
}

const sameNums = (a, b) => a.bonus === b.bonus && a.numbers.join(',') === b.numbers.join(',');

/**
 * 붙여넣기로 읽은 항목 하나를 저장해도 되는지 판단.
 * publicIdx: 휴대폰에 보관한 당첨번호, userDraws: 직접 입력 목록
 * 반환 kind:
 *  - 'new'      : 새로 저장 (draw)
 *  - 'addPrize' : 이미 같은 번호가 있고 당첨금 표만 더함 (draw)
 *  - 'same'     : 이미 같은 내용 → 할 일 없음
 *  - 'conflict' : 이미 다른 번호가 있음 → 저장 안 함
 *  - 'needForm' : 회차·번호가 모자라 직접 확인 필요 (form: 입력칸에 채울 값)
 */
export function planPasteItem(item, publicIdx, userDraws, now = new Date()) {
  const form = { round: item.round ?? '', date: item.date || (item.round ? saturdayOf(item.round) : ''), numbers: item.numbers || [], bonus: item.bonus ?? '' };
  if (!item.round) return { kind: 'needForm', form, reason: '회차를 찾지 못했어요' };
  const dateGuessed = !item.date;
  let d;
  try {
    d = validateUserDraw({ round: item.round, date: form.date, numbers: item.numbers, bonus: item.bonus, ranks: item.ranks }, now);
  } catch (e) { return { kind: 'needForm', form, reason: e.message }; }
  const pub = publicIdx.get(d.round);
  const mine = (userDraws || []).find((x) => x.round === d.round);
  const base = { round: d.round, dateGuessed };
  if (mine && !sameNums(mine, d)) return { ...base, kind: 'conflict', draw: d, other: mine, otherLabel: '직접 입력' };
  if (!mine && pub && !sameNums(pub, d)) return { ...base, kind: 'conflict', draw: d, other: pub, otherLabel: '휴대폰 보관 자료' };
  if (mine) {
    if (d.ranks && !mine.ranks) return { ...base, kind: 'addPrize', draw: { ...mine, ranks: d.ranks } };
    return { ...base, kind: 'same' };
  }
  if (pub) {
    // 보관 자료와 번호가 같으면 당첨금 표가 있을 때만 저장 (판정은 계속 보관 자료 기준)
    if (d.ranks) return { ...base, kind: 'addPrize', draw: { ...d, date: pub.date } };
    return { ...base, kind: 'same' };
  }
  return { ...base, kind: 'new', draw: d };
}
