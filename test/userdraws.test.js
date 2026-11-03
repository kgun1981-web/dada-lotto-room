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

// ---- 백업 v3: 휴대폰에 보관하는 당첨번호 자료 ----
import { synthetic } from './_data.mjs';
import { validateSavedDraw } from '../lib/backup.js';
const SYN = synthetic(30).map((d) => ({ round: d.round, date: d.date, numbers: d.numbers, bonus: d.bonus }));
const pack = (draws, extra = {}) => JSON.stringify({ kind: 'dada-lotto-backup', version: 3, tickets: [], userDraws: [], drawsSource: '시험', draws, ...extra });

test('v3 당첨번호 파일: 1~30회 불러오기, 회차·날짜·번호·보너스만 + 출처 표시', () => {
  const r = readBackup(pack(SYN), [], [], []);
  assert.equal(r.savedAdded.length, 30);
  assert.deepEqual(Object.keys(r.savedAdded[0]).sort(), ['bonus', 'date', 'numbers', 'round', 'source', 'status']);
  assert.equal(r.savedAdded[0].status, 'official_verified');
  assert.equal(r.savedRejected, '');
});
test('v3: 이미 있는 같은 값은 건너뛰고, 다음 회차만 추가', () => {
  const have = SYN.slice(0, 20).map((d) => validateSavedDraw(d));
  const r = readBackup(pack(SYN), [], [], have);
  assert.equal(r.savedAdded.length, 10);
  assert.equal(r.savedSkipped, 20);
});
test('v3: 같은 회차 다른 값은 덮어쓰지 않음', () => {
  const have = SYN.map((d) => validateSavedDraw(d));
  const changed = SYN.map((d) => (d.round === 5 ? { ...d, bonus: d.numbers.includes(45) ? 44 : 45 } : d));
  const r = readBackup(pack(changed), [], [], have);
  assert.deepEqual(r.savedConflicts, [5]);
  assert.equal(r.savedAdded.length, 0);
});
test('v3: 중간 회차가 빠지면 당첨번호 자료는 하나도 넣지 않음 (복권은 그대로 처리)', () => {
  const t = validateTicket({ round: 3, games: [[1, 2, 3, 4, 5, 6]] });
  const r = readBackup(JSON.stringify({ kind: 'dada-lotto-backup', version: 3, tickets: [t], userDraws: [], draws: SYN.filter((d) => d.round !== 10) }), [], [], []);
  assert.equal(r.savedAdded.length, 0);
  assert.match(r.savedRejected, /빠진 회차/);
  assert.equal(r.added.length, 1);
});
test('v3: 잘못된 번호 1건이 있으면 자료 전체 거부', () => {
  const bad = SYN.map((d) => (d.round === 7 ? { ...d, numbers: [1, 1, 2, 3, 4, 5] } : d));
  assert.equal(readBackup(pack(bad), [], [], []).savedAdded.length, 0);
});
test('v3: draws 부분 손상 → 거부', () => {
  assert.throws(() => readBackup(JSON.stringify({ kind: 'dada-lotto-backup', version: 3, tickets: [], userDraws: [] })), /손상/);
});
test('v3 백업 왕복: 복권 + 직접 입력 + 보관 당첨번호, 보관 자료는 번호만 저장', () => {
  const saved = SYN.map((d) => validateSavedDraw(d, '시험 출처'));
  const text = makeBackup([tk], [ud], saved);
  const obj = JSON.parse(text);
  assert.equal(obj.version, 3);
  assert.deepEqual(Object.keys(obj.draws[0]).sort(), ['bonus', 'date', 'numbers', 'round']);
  assert.equal(obj.drawsSource, '시험 출처');
  const r = readBackup(text, [], [], []);
  assert.equal(r.added.length, 1);
  assert.equal(r.drawsAdded.length, 1);
  assert.equal(r.savedAdded.length, 30);
});
test('휴대폰 보관용 파일(전달본) 형식으로 불러오기', () => {
  // 2026-11-04 김동건에게 전달한 파일과 같은 구조
  const r = readBackup(JSON.stringify({ kind: 'dada-lotto-backup', version: 3, exportedAt: '2026-11-04T06:00:00+09:00', note: 'x', drawsSource: '동행복권 결과 화면 (2026-11-03 수집)', tickets: [], userDraws: [], draws: SYN }), [], [], []);
  assert.equal(r.savedAdded.length, 30);
  assert.equal(r.savedAdded[0].source, '동행복권 결과 화면 (2026-11-03 수집)');
});
