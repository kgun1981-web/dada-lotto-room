import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUserDraw, mergeDraws, isUserDraw, USER_STATUS } from '../lib/userdraws.js';
import { loadDrawSet, judgeTicket } from '../lib/tickets.js';
import { makeBackup, readBackup } from '../lib/backup.js';
import { validateTicket } from '../lib/tickets.js';
import { InputError } from '../lib/lotto.js';

const U = (round, numbers = [1, 2, 3, 4, 5, 6], bonus = 7, date = '2026-11-07', extra = {}) => ({ round, date, numbers, bonus, ...extra });
const PUB = loadDrawSet([{ round: 1209, date: '2026-01-31', numbers: [2, 17, 20, 35, 37, 39], bonus: 24, status: 'press_verified' }]).index;

// ---- 검증 ----
test('직접 입력: 정상 → user_entered, 정렬, 원본 불변', () => {
  const raw = U('1249', [6, 5, 4, 3, 2, 1]);
  const d = validateUserDraw(raw);
  assert.equal(d.round, 1249);
  assert.equal(d.status, USER_STATUS);
  assert.deepEqual(d.numbers, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(raw.numbers, [6, 5, 4, 3, 2, 1]);
  assert.equal(d.preferUser, false);
});
test('직접 입력: 다른 상태값을 넣어도 user_entered로 고정 (자동 승격 금지)', () => {
  assert.equal(validateUserDraw(U(1249, undefined, undefined, undefined, { status: 'official_verified' })).status, USER_STATUS);
});
for (const [label, d] of [
  ['회차 0', U(0)], ['회차 소수', U(12.5)], ['회차 문자', U('abc')], ['날짜 없음', U(1249, undefined, undefined, '')],
  ['없는 날짜', U(1249, undefined, undefined, '2026-02-30')], ['번호 5개', U(1249, [1, 2, 3, 4, 5])],
  ['번호 중복', U(1249, [1, 1, 2, 3, 4, 5])], ['번호 46', U(1249, [1, 2, 3, 4, 5, 46])],
  ['보너스 본번호와 중복', U(1249, [1, 2, 3, 4, 5, 6], 6)], ['보너스 범위', U(1249, [1, 2, 3, 4, 5, 6], 0)],
]) {
  test(`직접 입력 거부: ${label}`, () => assert.throws(() => validateUserDraw(d), InputError));
}

// ---- 합치기 ----
test('공개 데이터 없는 회차: 직접 입력으로 판정, 표시용 상태 user_entered', () => {
  const m = mergeDraws(PUB, [U(1249, [3, 11, 25, 32, 40, 44], 9)]);
  const r = judgeTicket({ round: 1249, games: [[3, 11, 25, 32, 40, 44], [1, 2, 3, 4, 5, 6]] }, m.index);
  assert.equal(r.status, 'judged');
  assert.equal(isUserDraw(r.draw), true);
  assert.deepEqual(r.results.map((x) => x.rank), [1, 0]);
});
test('공개와 같은 값: 공개 데이터 사용, 충돌 없음', () => {
  const m = mergeDraws(PUB, [U(1209, [2, 17, 20, 35, 37, 39], 24, '2026-01-31')]);
  assert.equal(m.conflicts.length, 0);
  assert.deepEqual(m.redundant, [1209]);
  assert.equal(m.index.get(1209).status, 'press_verified');
});
test('공개와 다른 값: 덮어쓰지 않고 충돌, 기본은 공개 데이터로 판정', () => {
  const m = mergeDraws(PUB, [U(1209, [2, 17, 20, 35, 37, 40], 24, '2026-01-31')]);
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.conflicts[0].using, 'public');
  assert.equal(m.index.get(1209).status, 'press_verified');
});
test('충돌에서 사용자가 "내 입력 사용"을 고르면 직접 입력으로 판정', () => {
  const m = mergeDraws(PUB, [U(1209, [2, 17, 20, 35, 37, 40], 24, '2026-01-31', { preferUser: true })]);
  assert.equal(m.conflicts[0].using, 'user');
  assert.equal(isUserDraw(m.index.get(1209)), true);
});
test('직접 입력 수정 → 판정 다시 계산', () => {
  const t = validateTicket({ round: 1249, games: [[1, 2, 3, 4, 5, 6]] });
  const before = judgeTicket(t, mergeDraws(PUB, [U(1249, [1, 2, 3, 4, 5, 6], 7)]).index);
  const after = judgeTicket(t, mergeDraws(PUB, [U(1249, [1, 2, 3, 40, 41, 42], 7)]).index);
  assert.equal(before.results[0].rank, 1);
  assert.equal(after.results[0].rank, 5);
});
test('직접 입력 삭제 → 판정 불가로 돌아감', () => {
  const t = validateTicket({ round: 1249, games: [[1, 2, 3, 4, 5, 6]] });
  assert.equal(judgeTicket(t, mergeDraws(PUB, []).index).status, 'pending');
});
test('깨진 직접 입력 기록은 판정에 쓰지 않음', () => {
  const m = mergeDraws(PUB, [{ round: 1249, date: 'x', numbers: [1], bonus: 2 }]);
  assert.equal(m.index.has(1249), false);
});
test('공개 인덱스 원본 불변', () => {
  mergeDraws(PUB, [U(1249)]);
  assert.equal(PUB.has(1249), false);
});

// ---- 백업 v2 / v1 호환 ----
const tk = validateTicket({ round: 1249, games: [[1, 2, 3, 4, 5, 6]] });
const ud = validateUserDraw(U(1249));
test('백업 v2: 복권 + 직접 입력 당첨번호 함께 왕복', () => {
  const r = readBackup(makeBackup([tk], [ud]), [], []);
  assert.equal(r.added.length, 1);
  assert.equal(r.drawsAdded.length, 1);
  assert.equal(r.drawsAdded[0].status, USER_STATUS);
});
test('백업 v1(복권만) 파일도 계속 불러오기', () => {
  const v1 = JSON.stringify({ kind: 'dada-lotto-backup', version: 1, tickets: [tk] });
  const r = readBackup(v1, [], []);
  assert.equal(r.added.length, 1);
  assert.equal(r.drawsAdded.length, 0);
});
test('백업 당첨번호: 같은 값은 건너뜀, 다른 값은 덮어쓰지 않고 충돌 보고', () => {
  const r1 = readBackup(makeBackup([], [ud]), [], [ud]);
  assert.equal(r1.drawsSkipped, 1);
  const other = validateUserDraw(U(1249, [1, 2, 3, 4, 5, 9]));
  const r2 = readBackup(makeBackup([], [other]), [], [ud]);
  assert.deepEqual(r2.drawConflicts, [1249]);
  assert.equal(r2.drawsAdded.length, 0);
});
test('백업 v2인데 당첨번호 부분 손상 → 거부', () => {
  const bad = JSON.stringify({ kind: 'dada-lotto-backup', version: 2, tickets: [] });
  assert.throws(() => readBackup(bad), /손상/);
});
test('백업 당첨번호 일부 오류 → 그 항목만 오류', () => {
  const text = JSON.stringify({ kind: 'dada-lotto-backup', version: 2, tickets: [], userDraws: [ud, { round: 1250, date: '2026-11-14', numbers: [1, 1, 2, 3, 4, 5], bonus: 7 }] });
  const r = readBackup(text, [], []);
  assert.equal(r.drawsAdded.length, 1);
  assert.equal(r.errors.length, 1);
});
