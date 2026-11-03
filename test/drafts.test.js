import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDrafts, createDrafts, draftSaved, draftSaveFailed, nextDraft, discardDrafts, canLoadNext } from '../lib/drafts.js';

const ten = Array.from({ length: 10 }, (_, i) => [1, 2, 3, 4, 5, 6 + i]);

test('초안 생성: A~E 활성, F~J 대기, 다음 버튼 숨김', () => {
  const s = createDrafts(ten);
  assert.equal(s.active.length, 5);
  assert.deepEqual(s.active[0], [1, 2, 3, 4, 5, 6]);
  assert.equal(s.queue.length, 1);
  assert.equal(s.sheet, 1);
  assert.equal(canLoadNext(s), false);
});
test('A~E 저장 성공 → 다음 버튼 표시 → F~J 로드 → 저장 후 버튼 사라짐', () => {
  let s = draftSaved(createDrafts(ten));
  assert.equal(canLoadNext(s), true);
  s = nextDraft(s);
  assert.deepEqual(s.active[0], [1, 2, 3, 4, 5, 11]);
  assert.equal(s.sheet, 2);
  assert.equal(canLoadNext(s), false);
  s = draftSaved(s);
  assert.equal(canLoadNext(s), false);
  assert.equal(s.active, null);
});
test('첫 장 저장 실패 → F~J로 건너뛰지 않음', () => {
  let s = draftSaveFailed(createDrafts(ten));
  assert.deepEqual(s.active[0], [1, 2, 3, 4, 5, 6]);
  s = nextDraft(s);
  assert.equal(s.sheet, 1, '활성 초안이 남아 있으면 다음 장으로 넘어가지 않음');
});
test('취소·수정 진입 → 초안 폐기', () => {
  const s = discardDrafts(createDrafts(ten));
  assert.deepEqual(s, emptyDrafts());
  assert.equal(canLoadNext(s), false);
});
test('재생성 → 이전 초안 잔존 없음', () => {
  const other = Array.from({ length: 10 }, (_, i) => [10, 20, 30, 40, 41, 35 - i]);
  let s = draftSaved(createDrafts(ten));
  s = createDrafts(other);
  assert.deepEqual(s.active[0], [10, 20, 30, 40, 41, 35]);
  assert.equal(s.queue.length, 1);
  assert.deepEqual(s.queue[0][0], [10, 20, 30, 40, 41, 30]);
});
test('빈 입력·원본 불변', () => {
  assert.deepEqual(createDrafts([]), emptyDrafts());
  const s = createDrafts(ten);
  s.active[0][0] = 99;
  assert.equal(ten[0][0], 1);
});
