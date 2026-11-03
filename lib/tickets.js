// 내 복권: 입력 해석·검증·판정·백업 (순수 함수, 저장소와 분리)
import { validateGame, validateDraw, judge, InputError } from './lotto.js';

/**
 * @typedef {{ id: string, round: number, games: number[][], memo?: string, createdAt: string }} Ticket
 * @typedef {{ round: number, date: string, numbers: number[], bonus: number, status: string, source?: string }} Draw
 */

/** "3, 11 25 32 40 44" 같은 입력 → 정수 6개. 구분자는 공백·쉼표만. 그 밖의 기호(-, ., / 등)는 오류 */
export function parseGameText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new InputError('번호를 입력해 주세요');
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  for (const p of parts) {
    if (!/^\d{1,2}$/.test(p)) throw new InputError(`"${p}"는 번호가 아닙니다 (숫자만, 공백이나 쉼표로 구분)`);
  }
  return validateGame(parts.map(Number));
}

/**
 * 번호 칸 6개 입력 → 정수 6개. 6칸 모두 비면 null(빈 게임, 무시).
 * 일부만 비었거나 숫자가 아니면 오류
 */
export function parseRowCells(cells) {
  if (!Array.isArray(cells) || cells.length !== 6) throw new InputError('번호 칸은 6개여야 합니다');
  const vals = cells.map((c) => String(c ?? '').trim());
  if (vals.every((v) => v === '')) return null;
  const empty = vals.filter((v) => v === '').length;
  if (empty) throw new InputError(`번호 ${empty}칸이 비어 있습니다`);
  for (const v of vals) {
    if (!/^\d{1,2}$/.test(v)) throw new InputError(`"${v}"는 번호가 아닙니다`);
  }
  return validateGame(vals.map(Number));
}

/** 회차: 양의 안전 정수 */
export function parseRound(v) {
  const s = String(v ?? '').trim();
  const n = Number(s);
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(n) || n < 1) throw new InputError('회차는 1 이상의 정수로 입력해 주세요');
  return n;
}

/** 저장 전 검증. 원본을 바꾸지 않고 정리된 사본 반환 */
export function validateTicket(t) {
  if (!t || typeof t !== 'object') throw new InputError('복권 정보가 없습니다');
  const round = parseRound(t.round);
  if (!Array.isArray(t.games) || t.games.length < 1 || t.games.length > 5) {
    throw new InputError('한 장에는 1~5게임을 넣을 수 있습니다');
  }
  const games = t.games.map((g, i) => {
    try { return validateGame(g); } catch (e) { throw new InputError(`${'ABCDE'[i]}게임: ${e.message}`); }
  });
  return {
    id: typeof t.id === 'string' && t.id ? t.id : newId(),
    round,
    games,
    memo: typeof t.memo === 'string' ? t.memo.slice(0, 50) : '',
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
  };
}

export function newId() {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const USABLE = ['press_verified', 'official_verified'];

/** YYYY-MM-DD 형식이며 실제 존재하는 날짜인지 */
export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * 회차 데이터 적재·검증. 조용히 덮어쓰거나 넘기지 않고 경고를 남김.
 * - 형식 오류(배열 아님): 전체 거부
 * - 회차 순서가 증가하지 않음(같은 회차 중복 포함): 전체 거부
 * - 두 항목 날짜가 모두 유효한데 날짜 순서가 증가하지 않음: 전체 거부 (무효 날짜는 아래에서 그 항목만 제외)
 * - 같은 회차 중복: 위 순서 검사에서 먼저 전체 거부됨. 아래 개별 차단은 방어 코드
 * - 회차 값·날짜·번호·보너스 오류: 그 항목만 제외, 다른 회차 판정은 유지
 * - 미검증 상태: 판정에 사용 안 함 (경고 없음, 정상 상태)
 * 반환: { index: Map, warnings: string[], rejected: boolean, latest: 검증 통과한 마지막 회차 }
 */
export function loadDrawSet(draws) {
  const warnings = [];
  if (!Array.isArray(draws)) return { index: new Map(), warnings: ['당첨 데이터 형식이 올바르지 않아 사용하지 않습니다'], rejected: true, latest: 0 };

  for (let i = 1; i < draws.length; i++) {
    const a = draws[i - 1]; const b = draws[i];
    if (!(a?.round < b?.round) || (isValidDate(a?.date) && isValidDate(b?.date) && !(a.date < b.date))) {
      return { index: new Map(), warnings: [`회차 순서가 맞지 않아(${a?.round}회 → ${b?.round}회) 당첨 데이터 전체를 사용하지 않습니다`], rejected: true, latest: 0 };
    }
  }

  const count = new Map();
  for (const d of draws) count.set(d?.round, (count.get(d?.round) || 0) + 1);

  const index = new Map();
  for (const d of draws) {
    if (!d || typeof d !== 'object') { warnings.push('비어 있는 회차 항목을 건너뜀'); continue; }
    if (!Number.isSafeInteger(d.round) || d.round < 1) { warnings.push(`회차 값 오류(${d.round})로 건너뜀`); continue; }
    if (count.get(d.round) > 1) { warnings.push(`${d.round}회가 중복되어 이 회차는 판정하지 않습니다`); continue; }
    if (!isValidDate(d.date)) { warnings.push(`${d.round}회 추첨일 오류로 건너뜀`); continue; }
    try { validateDraw(d); } catch (e) { warnings.push(`${d.round}회 번호 오류(${e.message})로 건너뜀`); continue; }
    if (!USABLE.includes(d.status)) continue;
    index.set(d.round, d);
  }
  const uniq = [...new Set(warnings)];
  return { index, warnings: uniq, rejected: false, latest: index.size ? Math.max(...index.keys()) : 0 };
}

/** 판정용 인덱스만 필요할 때 */
export function indexDraws(draws) {
  return loadDrawSet(draws).index;
}

/**
 * 복권 한 장 판정. 회차가 정확히 같은 결과로만 판정. 없으면 낙첨이 아니라 판정 불가.
 * 반환: { status: 'judged'|'pending', reason?, draw?, results: [{rank, matched, bonusMatched}] }
 */
export function judgeTicket(ticket, drawIndex) {
  const t = validateTicket(ticket);
  const draw = drawIndex.get(t.round);
  if (!draw || draw.round !== t.round) {
    const latest = drawIndex.size ? Math.max(...drawIndex.keys()) : 0;
    const reason = t.round > latest ? '추첨 전이거나 결과를 아직 받지 못했습니다' : '이 회차 결과가 없어 판정할 수 없습니다';
    return { status: 'pending', reason, results: [] };
  }
  return { status: 'judged', draw, results: t.games.map((g) => judge(g, draw)) };
}

/** 마지막 백업 후 경과 일수에 따른 알림 필요 여부 (기록 있을 때만) */
export function needsBackupReminder(ticketCount, lastBackupISO, now = new Date(), days = 7) {
  if (!ticketCount) return false;
  if (!lastBackupISO) return true;
  const t = Date.parse(lastBackupISO);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= days * 86400000;
}
