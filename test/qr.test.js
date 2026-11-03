import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseTicketQr } from '../lib/qr.js';

// 합성 QR 글자 (가상 회차·번호). 실제 복권 QR은 공개 저장소에 두지 않음
const U = (v) => `https://m.dhlottery.co.kr/qr.do?method=winQr&v=${v}`;

test('공개 예시 형식: 회차 + (글자 + 12자리) × 게임 수 + 뒤 숫자', () => {
  const r = parseTicketQr(U('3001q030917253341m051119273543n010203040506123456789'));
  assert.equal(r.round, 3001);
  assert.deepEqual(r.games, [[3, 9, 17, 25, 33, 41], [5, 11, 19, 27, 35, 43], [1, 2, 3, 4, 5, 6]]);
  assert.deepEqual(r.marks, ['q', 'm', 'n']);
});
test('앞자리 0이 붙은 회차, 뒤 숫자 없음, http 주소', () => {
  const r = parseTicketQr('http://m.dhlottery.co.kr/?v=0959q102326313543');
  assert.equal(r.round, 959);
  assert.equal(r.games.length, 1);
});
test('동행복권 주소가 아니면 거부', () => {
  assert.throws(() => parseTicketQr('https://example.com/?v=3001q030917253341'), /동행복권/);
  assert.throws(() => parseTicketQr('그냥 글자'), /동행복권/);
});
test('하나라도 이상하면 통째로 거부 (일부만 채우지 않음)', () => {
  assert.throws(() => parseTicketQr(U('3001q030917253341m051119273546')), /2번째 게임/); // 46
  assert.throws(() => parseTicketQr(U('3001q030917253341m050519273543')), /중복/);
  assert.throws(() => parseTicketQr(U('3001q030917253341m0511192735')), /번호 부분/); // 자리 부족
  assert.throws(() => parseTicketQr(U('3001q410917253303')), /순서/);
  assert.throws(() => parseTicketQr(U('3001')), /회차/);
  assert.throws(() => parseTicketQr(U('3001q030917253341' + 'a010203040506'.repeat(5))), /5개보다/);
  assert.throws(() => parseTicketQr(U('3001q030917253341123x')), /끝부분/);
});
test('QR 판독기(jsQR)가 합성 QR 그림을 읽음', { skip: !process.env.QR_RGBA && 'QR_RGBA 그림 없음' }, () => {
  const ctx = { self: {} }; vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../vendor/jsQR.js', import.meta.url), 'utf8'), ctx);
  const [file, w, h] = process.env.QR_RGBA.split(':');
  const r = ctx.self.jsQR(new Uint8ClampedArray(readFileSync(file)), Number(w), Number(h));
  assert.equal(parseTicketQr(r.data).round, 3001);
});
