// 백업 만들기·불러오기 (순수 함수)
// v1: { tickets } / v2: + userDraws / v3: + draws(휴대폰에 보관한 당첨번호 자료). 예전 파일도 계속 불러올 수 있음
import { InputError, validateDraw } from './lotto.js';
import { validateTicket, parseRound, isValidDate, loadDrawSet } from './tickets.js';
import { validateUserDraw } from './userdraws.js';

const BACKUP_KIND = 'dada-lotto-backup';
export const BACKUP_VERSION = 3;
const SUPPORTED = [1, 2, 3];
const SAVED_STATUS = 'official_verified'; // 출처 표시: 동행복권 결과 화면에서 받은 자료

/** 보관용 당첨번호 1건 정리 (회차·추첨일·번호·보너스만 남김) */
export function validateSavedDraw(d, source = '') {
  if (!d || typeof d !== 'object') throw new InputError('당첨번호 항목이 비어 있습니다');
  const round = parseRound(d.round);
  if (!isValidDate(d.date)) throw new InputError(`${round}회 추첨일 오류`);
  let v;
  try { v = validateDraw({ numbers: d.numbers, bonus: d.bonus }); } catch (e) { throw new InputError(`${round}회 ${e.message}`); }
  return { round, date: d.date, numbers: v.numbers, bonus: v.bonus, status: SAVED_STATUS, source: String(d.source || source || '').slice(0, 80) };
}

/** 보관용 당첨번호 목록 → 백업에 넣을 형태 (용량 절약) */
const slim = (list) => list.map((d) => ({ round: d.round, date: d.date, numbers: d.numbers, bonus: d.bonus }));

export function makeBackup(tickets, userDraws = [], draws = [], now = new Date()) {
  const src = draws.find((d) => d.source)?.source || '';
  return JSON.stringify({
    kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now.toISOString(),
    tickets, userDraws, drawsSource: src, draws: slim(draws),
  });
}

const sameDraw = (a, b) => a.date === b.date && a.bonus === b.bonus && a.numbers.join(',') === b.numbers.join(',');

/**
 * 백업 불러오기.
 * - 복권: 같은 id(같은 기록)만 건너뜀. 같은 번호라도 id가 다르면 따로 산 복권으로 보존
 * - 직접 입력 당첨번호(v2~): 같은 회차·같은 값 건너뜀, 다른 값은 덮어쓰지 않고 충돌로 보고
 * - 보관 당첨번호(v3): 같은 회차·같은 값 건너뜀, 다른 값은 덮어쓰지 않음. 합친 결과가 1회부터
 *   빠짐없이 이어지지 않거나 검증 경고가 있으면 보관 당첨번호 부분은 하나도 넣지 않음
 */
export function readBackup(text, existing = [], existingDraws = [], existingSaved = []) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new InputError('백업 파일 형식이 아닙니다 (JSON 오류)'); }
  if (!obj || obj.kind !== BACKUP_KIND || !Array.isArray(obj.tickets)) {
    throw new InputError('다다의 복권방 백업 파일이 아닙니다');
  }
  if (!SUPPORTED.includes(obj.version)) {
    throw new InputError(`지원하지 않는 백업 버전입니다 (${obj.version ?? '없음'}). 앱을 최신으로 업데이트해 주세요`);
  }
  if (obj.version >= 2 && !Array.isArray(obj.userDraws)) throw new InputError('백업 파일의 직접 입력 당첨번호 부분이 손상되었습니다');
  if (obj.version >= 3 && !Array.isArray(obj.draws)) throw new InputError('백업 파일의 당첨번호 자료 부분이 손상되었습니다');

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
  (obj.version >= 2 ? obj.userDraws : []).forEach((raw, i) => {
    try {
      const d = validateUserDraw(raw);
      const cur = have.get(d.round);
      if (!cur) { have.set(d.round, d); drawsAdded.push(d); return; }
      if (sameDraw(cur, d)) { drawsSkipped++; return; }
      drawConflicts.push(d.round);
    } catch (e) { errors.push(`직접 입력 당첨번호 ${i + 1}번째: ${e.message}`); }
  });

  const savedHave = new Map(existingSaved.map((d) => [d.round, d]));
  let savedAdded = []; const savedConflicts = []; let savedSkipped = 0; let savedRejected = '';
  if (obj.version >= 3 && obj.draws.length) {
    const src = typeof obj.drawsSource === 'string' ? obj.drawsSource : '';
    const bad = [];
    obj.draws.forEach((raw) => {
      try {
        const d = validateSavedDraw(raw, src);
        const cur = savedHave.get(d.round);
        if (!cur) { savedHave.set(d.round, d); savedAdded.push(d); return; }
        if (sameDraw(cur, d)) { savedSkipped++; return; }
        savedConflicts.push(d.round);
      } catch (e) { bad.push(e.message); }
    });
    const merged = [...savedHave.values()].sort((a, b) => a.round - b.round);
    const set = loadDrawSet(merged);
    const contiguous = merged.every((d, i) => d.round === i + 1);
    if (bad.length || set.rejected || set.warnings.length || !contiguous) {
      savedRejected = bad[0] || set.warnings[0] || (contiguous ? '검증 실패' : '1회부터 빠진 회차가 있음');
      savedAdded = [];
      errors.push(`당첨번호 자료를 넣지 않았어요: ${savedRejected}`);
    }
  }
  return { added, skipped, errors, drawsAdded, drawsSkipped, drawConflicts, savedAdded, savedSkipped, savedConflicts, savedRejected };
}
