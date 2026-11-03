import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseGameText, parseRound, validateTicket, indexDraws, judgeTicket,
  loadDrawSet, isValidDate, parseRowCells, needsBackupReminder,
} from '../lib/tickets.js';
import { InputError } from '../lib/lotto.js';
import { makeBackup, readBackup } from '../lib/backup.js';

const FIX = [{ round: 1000, date: '2022-01-29', numbers: [1, 2, 3, 4, 5, 6], bonus: 7, status: 'press_verified' }];
const idx = indexDraws(FIX);

// ---- 입력 해석 ----
test('입력: 공백·쉼표 구분 허용, 정렬', () => {
  assert.deepEqual(parseGameText(' 45, 3 11  25,32 40 '), [3, 11, 25, 32, 40, 45]);
});
for (const [label, txt] of [
  ['빈칸', '   '], ['문자', '1 2 3 a 5 6'], ['소수', '1 2 3 4.5 5 6'], ['0', '0 2 3 4 5 6'],
  ['46', '1 2 3 4 5 46'], ['중복', '1 2 3 4 5 5'], ['5개(누락)', '1 2 3 4 5'],
  ['음수', '-1 2 3 4 5 6'], ['하이픈', '1-2 3 4 5 6'], ['1.0', '1.0 2 3 4 5 6'], ['슬래시', '1/2 3 4 5 6'],
  ['7개', '1 2 3 4 5 6 7'], ['세자리', '001 2 3 4 5 6'],
]) {
  test(`입력 거부: ${label}`, () => assert.throws(() => parseGameText(txt), InputError));
}
test('회차: 정수만', () => {
  assert.equal(parseRound(' 1209 '), 1209);
  for (const v of ['', '0', '-3', '12.5', 'abc', null, '99999999999999999999']) assert.throws(() => parseRound(v), InputError);
});

// ---- 복권 검증 ----
test('복권: 1~5게임, 게임별 오류 위치 표시', () => {
  assert.throws(() => validateTicket({ round: 1, games: [] }), InputError);
  assert.throws(() => validateTicket({ round: 1, games: Array(6).fill([1, 2, 3, 4, 5, 6]) }), InputError);
  assert.throws(() => validateTicket({ round: 1, games: [[1, 2, 3, 4, 5, 6], [1, 1, 2, 3, 4, 5]] }), /B게임/);
});
test('복권: 원본 변경 없음, id 생성', () => {
  const raw = { round: '1000', games: [[6, 5, 4, 3, 2, 1]] };
  const t = validateTicket(raw);
  assert.deepEqual(raw.games[0], [6, 5, 4, 3, 2, 1]);
  assert.equal(t.round, 1000);
  assert.match(t.id, /^[0-9a-f]{16}$/);
});

// ---- 판정 ----
test('판정: 같은 회차 1~5등·낙첨·2등 보너스, 기존 함수와 동일', () => {
  const t = validateTicket({ round: 1000, games: [
    [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7], [1, 2, 3, 4, 5, 8], [1, 2, 3, 4, 8, 9], [1, 2, 3, 8, 9, 10],
  ] });
  const r = judgeTicket(t, idx);
  assert.equal(r.status, 'judged');
  assert.deepEqual(r.results.map((x) => x.rank), [1, 2, 3, 4, 5]);
  const miss = judgeTicket({ round: 1000, games: [[7, 8, 9, 10, 11, 12]] }, idx);
  assert.equal(miss.results[0].rank, 0);
});
test('판정 불가: 추첨 전 회차는 낙첨이 아님', () => {
  const r = judgeTicket({ round: 1001, games: [[1, 2, 3, 4, 5, 6]] }, idx);
  assert.equal(r.status, 'pending');
  assert.equal(r.results.length, 0);
  assert.match(r.reason, /추첨 전/);
});
test('판정 불가: 과거지만 결과 없는 회차', () => {
  const r = judgeTicket({ round: 999, games: [[1, 2, 3, 4, 5, 6]] }, idx);
  assert.equal(r.status, 'pending');
});
test('회차 불일치: 다른 회차 결과 재사용 안 함', () => {
  const two = indexDraws([...FIX, { round: 1001, date: '2022-02-05', numbers: [10, 11, 12, 13, 14, 15], bonus: 16, status: 'press_verified' }]);
  const r = judgeTicket({ round: 1001, games: [[1, 2, 3, 4, 5, 6]] }, two);
  assert.equal(r.draw.round, 1001);
  assert.equal(r.results[0].rank, 0);
});
test('검증 실패·미검증 데이터는 판정에 사용 안 함', () => {
  const bad = indexDraws([
    { round: 5, numbers: [1, 2, 3, 4, 5, 5], bonus: 7, status: 'press_verified' },
    { round: 6, numbers: [1, 2, 3, 4, 5, 6], bonus: 7, status: 'unverified' },
  ]);
  assert.equal(bad.size, 0);
  assert.equal(judgeTicket({ round: 5, games: [[1, 2, 3, 4, 5, 6]] }, bad).status, 'pending');
});
test('실제 데이터 파일 전체가 판정용 인덱스에 들어감', () => {
  const data = JSON.parse(readFileSync(new URL('../draws/lotto645.json', import.meta.url)));
  assert.equal(indexDraws(data.draws).size, data.draws.length);
});

// ---- 백업 ----
test('백업: 내보내기 → 가져오기, 중복 건너뜀', () => {
  const a = validateTicket({ round: 1000, games: [[1, 2, 3, 4, 5, 6]] });
  const b = validateTicket({ round: 1001, games: [[7, 8, 9, 10, 11, 12]] });
  const text = makeBackup([a, b]);
  const r1 = readBackup(text, []);
  assert.equal(r1.added.length, 2);
  const r2 = readBackup(text, [a]);
  assert.equal(r2.added.length, 1);
  assert.equal(r2.skipped, 1);
});
test('백업: 같은 회차·번호라도 id가 다르면 따로 산 복권으로 보존', () => {
  const a = validateTicket({ round: 1000, games: [[1, 2, 3, 4, 5, 6]] });
  const twin = { ...a, id: 'ffffffffffffffff' };
  const r = readBackup(makeBackup([twin]), [a]);
  assert.equal(r.added.length, 1);
  assert.equal(r.skipped, 0);
});
test('백업: 지원하지 않는 버전·버전 없음 거부', () => {
  for (const v of [3, 0, '1', undefined]) {
    const text = JSON.stringify({ kind: 'dada-lotto-backup', version: v, tickets: [] });
    assert.throws(() => readBackup(text), /버전/);
  }
});
test('백업: 잘못된 형식 거부, 잘못된 항목만 오류 처리', () => {
  assert.throws(() => readBackup('not json'), InputError);
  assert.throws(() => readBackup('{"tickets":[]}'), InputError);
  const text = JSON.stringify({ kind: 'dada-lotto-backup', version: 1, tickets: [
    { id: 'aaaaaaaaaaaaaaaa', round: 1, games: [[1, 2, 3, 4, 5, 6]] },
    { id: 'bbbbbbbbbbbbbbbb', round: 1, games: [[1, 2, 3, 4, 5, 99]] },
    { round: 1, games: [[1, 2, 3, 4, 5, 6]] },
  ] });
  const r = readBackup(text);
  assert.equal(r.added.length, 1);
  assert.equal(r.errors.length, 2, '번호 오류 1 + id 없음 1');
});

// ---- 회차 데이터 검증 (GPT 2단계 C) ----
const D = (round, date, numbers = [1, 2, 3, 4, 5, 6], bonus = 7, status = 'press_verified') => ({ round, date, numbers, bonus, status });

test('날짜 검증', () => {
  assert.ok(isValidDate('2026-01-31'));
  for (const v of ['2026-02-30', '2026-1-31', '20260131', '', null, '2026-13-01']) assert.equal(isValidDate(v), false);
});
test('정상 2회차 적재, 중간에 같은 회차가 끼면 전체 거부', () => {
  const r = loadDrawSet([D(10, '2020-01-04'), D(11, '2020-01-11', [7, 8, 9, 10, 11, 12], 13)]);
  assert.equal(r.index.size, 2);
  const dup = [D(10, '2020-01-04'), D(11, '2020-01-11'), D(12, '2020-01-18')];
  dup[2].round = 11; // 순서 검사 전 중복 검출 확인용: 순서 위반이 먼저 걸림
  assert.equal(loadDrawSet(dup).rejected, true);
});
test('같은 회차 연속 중복: 덮어쓰지 않고 전체 거부 + 경고', () => {
  // 순서 검사 통과 불가하므로 중복은 순서 위반으로 전체 거부됨을 명시
  const r = loadDrawSet([D(10, '2020-01-04'), D(10, '2020-01-11')]);
  assert.equal(r.rejected, true);
  assert.equal(r.index.size, 0);
  assert.match(r.warnings[0], /순서/);
});
test('회차 순서 역전: 전체 거부', () => {
  const r = loadDrawSet([D(11, '2020-01-11'), D(10, '2020-01-04')]);
  assert.equal(r.rejected, true);
  assert.equal(r.index.size, 0);
});
test('날짜 순서 역전: 전체 거부', () => {
  assert.equal(loadDrawSet([D(10, '2020-01-11'), D(11, '2020-01-04')]).rejected, true);
});
test('잘못된 회차 값·날짜·번호는 그 항목만 제외 + 경고', () => {
  const r = loadDrawSet([D(10, '2020-01-04'), D(11, '2020-01-11', [1, 2, 3, 4, 5, 5]), D(12, '2020-01-18', [1, 2, 3, 4, 5, 6], 6)]);
  assert.deepEqual([...r.index.keys()], [10]);
  assert.equal(r.warnings.length, 2);
  const r2 = loadDrawSet([D(10.5, '2020-01-04'), D(11, '2020-01-11')]);
  assert.deepEqual([...r2.index.keys()], [11]);
  const r3 = loadDrawSet([D(10, '2020-02-30'), D(11, '2020-03-07')]);
  assert.deepEqual([...r3.index.keys()], [11]);
});
test('형식 오류(배열 아님) 전체 거부', () => {
  for (const v of [null, {}, 'x']) assert.equal(loadDrawSet(v).rejected, true);
});
test('미검증 상태는 경고 없이 판정 제외', () => {
  const r = loadDrawSet([D(10, '2020-01-04', [1, 2, 3, 4, 5, 6], 7, 'unverified')]);
  assert.equal(r.index.size, 0);
  assert.equal(r.warnings.length, 0);
});
test('제외된 회차의 복권은 낙첨이 아니라 판정 불가', () => {
  const r = loadDrawSet([D(10, '2020-01-04'), D(11, '2020-01-11', [1, 2, 3, 4, 5, 5])]);
  assert.equal(judgeTicket({ round: 11, games: [[1, 2, 3, 4, 5, 6]] }, r.index).status, 'pending');
});

// ---- 입력 초안 분할·백업 알림 (GPT 2-1, 2-2) ----
test('백업 알림: 기록 없으면 안 띄움, 백업 없음·7일 경과 시 띄움', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  assert.equal(needsBackupReminder(0, null, now), false);
  assert.equal(needsBackupReminder(2, null, now), true);
  assert.equal(needsBackupReminder(2, '2026-11-05T00:00:00Z', now), false);
  assert.equal(needsBackupReminder(2, '2026-11-03T00:00:00Z', now), true);
  assert.equal(needsBackupReminder(2, 'garbage', now), true);
});

test('무효 날짜 1건은 전체 거부가 아니라 그 회차만 제외, 다른 회차 판정 유지', () => {
  const r = loadDrawSet([D(10, '2020-01-04'), D(11, 'bad-date'), D(12, '2020-01-18', [7, 8, 9, 10, 11, 12], 13)]);
  assert.equal(r.rejected, false);
  assert.deepEqual([...r.index.keys()], [10, 12]);
  assert.equal(r.latest, 12);
  assert.equal(judgeTicket({ round: 12, games: [[7, 8, 9, 10, 11, 12]] }, r.index).results[0].rank, 1);
});

// ---- 번호 칸 6개 입력 ----
test('칸 입력: 정상 6칸 → 정렬된 6개', () => {
  assert.deepEqual(parseRowCells(['45', '3', ' 11 ', '25', '32', '40']), [3, 11, 25, 32, 40, 45]);
});
test('칸 입력: 6칸 모두 비면 빈 게임(null)', () => {
  assert.equal(parseRowCells(['', '', ' ', '', '', '']), null);
});
for (const [label, cells] of [
  ['일부 빈칸', ['1', '2', '', '4', '5', '6']], ['문자', ['1', '2', 'a', '4', '5', '6']], ['음수', ['-1', '2', '3', '4', '5', '6']],
  ['소수', ['1.5', '2', '3', '4', '5', '6']], ['세자리', ['100', '2', '3', '4', '5', '6']], ['0', ['0', '2', '3', '4', '5', '6']],
  ['46', ['46', '2', '3', '4', '5', '6']], ['중복', ['7', '7', '3', '4', '5', '6']], ['칸 수 오류', ['1', '2', '3']],
]) {
  test(`칸 입력 거부: ${label}`, () => assert.throws(() => parseRowCells(cells), InputError));
}
