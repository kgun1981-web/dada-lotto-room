import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseDrawData } from '../lib/draws.js';

const good = (rounds) => JSON.stringify({ lastChecked: 'x', draws: rounds.map((r, i) => ({
  round: r, date: `2020-01-${String(4 + i * 7).padStart(2, '0')}`, numbers: [1, 2, 3, 4, 5, 6], bonus: 7, status: 'press_verified',
})) });
const G1 = good([10]);
const G2 = good([10, 11]);
const BROKEN = '{"draws": [';
const REVERSED = JSON.stringify({ draws: [
  { round: 11, date: '2020-01-11', numbers: [1, 2, 3, 4, 5, 6], bonus: 7, status: 'press_verified' },
  { round: 10, date: '2020-01-04', numbers: [1, 2, 3, 4, 5, 6], bonus: 7, status: 'press_verified' },
] });
const PARTIAL = JSON.stringify({ draws: [
  { round: 10, date: '2020-01-04', numbers: [1, 2, 3, 4, 5, 6], bonus: 7, status: 'press_verified' },
  { round: 11, date: '2020-01-11', numbers: [1, 2, 3, 4, 5, 5], bonus: 7, status: 'press_verified' },
] });

test('정상 새 데이터: 사용 + 정상 사본 저장', () => {
  const r = chooseDrawData({ freshText: G2, cachedText: G1 });
  assert.equal(r.source, 'network');
  assert.equal(r.saveCache, true);
  assert.equal(r.set.latest, 11);
});
test('깨진 JSON 도착 + 이전 사본 있음: 이전 사본 유지, 덮어쓰지 않음, 경고', () => {
  const r = chooseDrawData({ freshText: BROKEN, cachedText: G1 });
  assert.equal(r.source, 'cache');
  assert.equal(r.saveCache, false);
  assert.ok(r.notices.length >= 1);
});
test('순서 역전 데이터 도착 + 이전 사본 있음: 이전 사본 유지', () => {
  const r = chooseDrawData({ freshText: REVERSED, cachedText: G1 });
  assert.equal(r.source, 'cache');
  assert.equal(r.saveCache, false);
});
test('깨진 데이터 + 사본 없음: 판정 데이터 없음', () => {
  const r = chooseDrawData({ freshText: BROKEN });
  assert.equal(r.source, 'none');
  assert.equal(r.data, null);
});
test('일부 회차 오류 + 정상 사본 있음: 사본 우선, 덮어쓰지 않음', () => {
  const r = chooseDrawData({ freshText: PARTIAL, cachedText: G2 });
  assert.equal(r.source, 'cache');
  assert.equal(r.saveCache, false);
  assert.equal(r.set.latest, 11);
  assert.match(r.notices[0], /일부에 오류/);
});
test('일부 회차 오류 + 사본 없음: 경고와 함께 검증된 회차만 사용', () => {
  const r = chooseDrawData({ freshText: PARTIAL });
  assert.equal(r.source, 'network');
  assert.equal(r.saveCache, false);
  assert.equal(r.set.index.size, 1);
  assert.match(r.notices[0], /검증된 회차만/);
});
test('경고 있는 사본은 정상 사본으로 쓰지 않음 (오프라인)', () => {
  const r = chooseDrawData({ freshText: null, cachedText: PARTIAL });
  assert.equal(r.source, 'none');
});
test('경고 있는 사본은 깨진 새 데이터의 대체로도 쓰지 않음', () => {
  const r = chooseDrawData({ freshText: BROKEN, cachedText: PARTIAL });
  assert.equal(r.source, 'none');
});
test('네트워크 실패 + 사본: 오프라인 안내와 함께 사본 사용', () => {
  const r = chooseDrawData({ freshText: null, cachedText: G1 });
  assert.equal(r.source, 'cache');
  assert.match(r.notices[0], /오프라인/);
});
test('네트워크 실패 + 사본 없음: 확인 불가', () => {
  const r = chooseDrawData({});
  assert.equal(r.source, 'none');
  assert.match(r.notices[0], /확인 불가/);
});
test('손상된 사본은 사용하지 않음', () => {
  const r = chooseDrawData({ freshText: null, cachedText: BROKEN });
  assert.equal(r.source, 'none');
});
