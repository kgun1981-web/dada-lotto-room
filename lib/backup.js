// 백업 만들기·불러오기 (순수 함수)
// v1: { tickets } / v2: { tickets, userDraws }. v1 파일도 계속 불러올 수 있음
import { InputError } from './lotto.js';
import { validateTicket } from './tickets.js';
import { validateUserDraw } from './userdraws.js';

const BACKUP_KIND = 'dada-lotto-backup';
export const BACKUP_VERSION = 2;
const SUPPORTED = [1, 2];

export function makeBackup(tickets, userDraws = [], now = new Date()) {
  return JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now.toISOString(), tickets, userDraws }, null, 2);
}

const sameDraw = (a, b) => a.date === b.date && a.bonus === b.bonus && a.numbers.join(',') === b.numbers.join(',');

/**
 * 백업 불러오기.
 * - 복권: 같은 id(같은 기록)만 건너뜀. 같은 번호라도 id가 다르면 따로 산 복권으로 보존
 * - 당첨번호(v2): 같은 회차·같은 값이면 건너뜀, 같은 회차·다른 값이면 덮어쓰지 않고 충돌로 보고
 * 반환: { added, skipped, errors, drawsAdded, drawsSkipped, drawConflicts: number[] }
 */
export function readBackup(text, existing = [], existingDraws = []) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new InputError('백업 파일 형식이 아닙니다 (JSON 오류)'); }
  if (!obj || obj.kind !== BACKUP_KIND || !Array.isArray(obj.tickets)) {
    throw new InputError('다다의 복권방 백업 파일이 아닙니다');
  }
  if (!SUPPORTED.includes(obj.version)) {
    throw new InputError(`지원하지 않는 백업 버전입니다 (${obj.version ?? '없음'}). 앱을 최신으로 업데이트해 주세요`);
  }
  if (obj.version === 2 && !Array.isArray(obj.userDraws)) throw new InputError('백업 파일의 당첨번호 부분이 손상되었습니다');

  const ids = new Set(existing.map((t) => t.id));
  const added = []; const errors = []; let skipped = 0;
  obj.tickets.forEach((raw, i) => {
    try {
      if (typeof raw?.id !== 'string' || !/^[0-9a-f]{16}$/.test(raw.id)) throw new InputError('기록 id가 없습니다');
      const t = validateTicket(raw);
      if (ids.has(t.id)) { skipped++; return; }
      ids.add(t.id); added.push(t);
    } catch (e) { errors.push(`복권 ${i + 1}번째: ${e.message}`); }
  });

  const have = new Map(existingDraws.map((d) => [d.round, d]));
  const drawsAdded = []; const drawConflicts = []; let drawsSkipped = 0;
  (obj.version === 2 ? obj.userDraws : []).forEach((raw, i) => {
    try {
      const d = validateUserDraw(raw);
      const cur = have.get(d.round);
      if (!cur) { have.set(d.round, d); drawsAdded.push(d); return; }
      if (sameDraw(cur, d)) { drawsSkipped++; return; }
      drawConflicts.push(d.round);
    } catch (e) { errors.push(`당첨번호 ${i + 1}번째: ${e.message}`); }
  });
  return { added, skipped, errors, drawsAdded, drawsSkipped, drawConflicts };
}
