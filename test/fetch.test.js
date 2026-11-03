// 수집기 단위 테스트 + 실패 주입 테스트
// 실패 주입: 각 실패 상황에서 (1) 예외로 끝나고 (2) 원본 파일이 한 글자도 바뀌지 않으며 (3) 임시 파일이 남지 않는지 확인
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toDraw, decideWrite, robotsBlocks, run, StopError } from '../tools/fetch_draws.mjs';
import { validateDraw, judge } from '../lib/lotto.js';

// 2026-11-03 공식 조회 주소 실제 응답(1248회) 일부
const SAMPLE = { winType0: 0, winType1: 13, winType2: 2, winType3: 0, gmSqNo: 5133, ltEpsd: 1248, tm1WnNo: 16, tm2WnNo: 18, tm3WnNo: 27, tm4WnNo: 36, tm5WnNo: 38, tm6WnNo: 42, bnsWnNo: 22, ltRflYmd: '20261031', rnk1WnNope: 15, rnk1WnAmt: 1933658450, rnk2WnNope: 91, rnk2WnAmt: 53122485, rnk3WnNope: 3265, rnk3WnAmt: 1480597, rnk4WnNope: 167745, rnk4WnAmt: 50000, rnk5WnNope: 2723467, rnk5WnAmt: 5000, wholEpsdSumNtslAmt: 121355508000 };

test('공식 응답 변환: 1248회', () => {
  const d = toDraw(SAMPLE);
  assert.equal(d.round, 1248);
  assert.equal(d.date, '2026-10-31');
  assert.deepEqual(d.numbers, [16, 18, 27, 36, 38, 42]);
  assert.equal(d.bonus, 22);
  assert.equal(d.firstWinners, 15);
  assert.deepEqual(d.firstByType, { auto: 13, manual: 2, semi: 0 });
  assert.equal(d.ranks[0].amount, 1933658450);
  validateDraw(d);
  assert.equal(judge([16, 18, 27, 36, 38, 22], d).rank, 2);
});
test('공식 응답 변환: 번호 순서가 섞여 와도 정렬', () => {
  assert.deepEqual(toDraw({ ...SAMPLE, tm1WnNo: 42, tm6WnNo: 16 }).numbers, [16, 18, 27, 36, 38, 42]);
});

// ---- robots.txt ----
test('robots.txt: 금지 규칙 판단', () => {
  assert.deepEqual(robotsBlocks('User-agent: *\nDisallow:'), []);
  assert.deepEqual(robotsBlocks('User-agent: Googlebot\nDisallow: /'), []);
  assert.equal(robotsBlocks('User-agent: *\nDisallow: /').length, 2);
  assert.equal(robotsBlocks('User-agent: *\nDisallow: /lt645/').length, 2);
  assert.equal(robotsBlocks('User-agent: *\nDisallow: /lt645/selectPst').length, 1);
  assert.deepEqual(robotsBlocks('User-agent: *\nDisallow: /lt645/\nAllow: /lt645/selectPstLt645InfoNew.do\nAllow: /lt645/result'), []);
  assert.equal(robotsBlocks('User-agent: dada-lotto-room\nDisallow: /').length, 2);
});

// ---- 저장 판단 ----
const REAL = JSON.parse(readFileSync(new URL('../draws/lotto645.json', import.meta.url))).draws;
const REAL_MAX = Math.max(...REAL.map((d) => d.round));
test('저장 판단: 실제 전체 파일은 통과', () => assert.equal(decideWrite([], REAL).ok, true));
test('저장 판단: 0건 거부 (2026-11-03 사고 재현)', () => assert.equal(decideWrite(REAL, []).ok, false));
test('저장 판단: 회차 수 감소·최신 감소 거부', () => {
  assert.equal(decideWrite(REAL, REAL.slice(0, -1)).ok, false);
});
test('저장 판단: 중간 누락 거부', () => {
  assert.match(decideWrite([], REAL.filter((d) => d.round !== 500)).reason, /순서|누락/);
});
test('저장 판단: 알려진 회차 값이 다르면 거부', () => {
  const bad = REAL.map((d) => (d.round === 1209 ? { ...d, numbers: [2, 17, 20, 35, 37, 40] } : d));
  assert.match(decideWrite([], bad).reason, /1209회/);
});
test('저장 판단: 상태값 오류 거부', () => {
  assert.equal(decideWrite([], REAL.map((d, i) => (i === 3 ? { ...d, status: 'user_entered' } : d))).ok, false);
});

// ---- 실패 주입 (run) ----
const back = (d) => ({
  ltEpsd: d.round, ltRflYmd: d.date.replace(/-/g, ''), bnsWnNo: d.bonus,
  ...Object.fromEntries(d.numbers.map((n, i) => [`tm${i + 1}WnNo`, n])),
  winType1: d.firstByType?.auto ?? 1, winType2: d.firstByType?.manual ?? 0, winType3: d.firstByType?.semi ?? 0,
  wholEpsdSumNtslAmt: d.totalSales ?? 1,
  ...Object.fromEntries([1, 2, 3, 4, 5].flatMap((k) => {
    const r = d.ranks?.find((x) => x.rank === k);
    return [[`rnk${k}WnNope`, r ? r.winners : 1], [`rnk${k}WnAmt`, r ? r.amount : 1]];
  })),
});
const N1249 = { round: REAL_MAX + 1, date: '2026-11-07', numbers: [3, 11, 25, 32, 40, 44], bonus: 9 };
const page = (latest) => `<select><option value="${latest}">${latest}</option><option value="${latest - 1}"></option></select>`;
const listFor = (rounds) => JSON.stringify({ data: { list: rounds } });

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'dada-fetch-'));
  const file = join(dir, 'lotto645.json');
  copyFileSync(new URL('../draws/lotto645.json', import.meta.url), file);
  return { file, before: readFileSync(file, 'utf8') };
}
/** routes: robots / page / api → {status, body} 또는 함수 */
function fakeFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    const key = url.includes('robots.txt') ? 'robots' : url.includes('selectPst') ? 'api' : 'page';
    let r = routes[key];
    if (typeof r === 'function') r = r(url, calls.filter((u) => u.includes(key === 'api' ? 'selectPst' : key)).length);
    if (r.throw) throw new Error(r.throw);
    return new Response(r.body ?? '', { status: r.status ?? 200 });
  };
}
const NORMAL = {
  robots: { status: 404 },
  page: { body: page(REAL_MAX + 1) },
  api: { body: listFor([back(N1249), ...REAL.slice(-5).reverse().map(back)]) },
};
const opts = (file, routes, calls) => ({ mode: 'update', file, fetchImpl: fakeFetch(routes, calls), sleep: async () => {}, log: () => {}, delayMs: 0 });

test('정상: 새 회차 1개 추가, 임시 파일 없음', async () => {
  const { file } = setup();
  const r = await run(opts(file, NORMAL));
  assert.equal(r.latest, REAL_MAX + 1);
  const out = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(out.count, REAL.length + 1);
  assert.equal(out.latest, REAL_MAX + 1);
  assert.equal(existsSync(file + '.tmp'), false);
});

test('새 회차가 없으면 파일을 다시 쓰지 않음 (불필요한 커밋 방지)', async () => {
  const { file, before } = setup();
  const r = await run(opts(file, { ...NORMAL, page: { body: page(REAL_MAX) }, api: { body: listFor(REAL.slice(-6).reverse().map(back)) } }));
  assert.equal(r.written, false);
  assert.equal(readFileSync(file, 'utf8'), before);
});

const failures = [
  ['빈 배열 응답', { api: { body: listFor([]) } }, /응답에 없음/],
  ['빈 본문 응답', { api: { body: '' } }, /JSON이 아닌/],
  ['HTML 오류 페이지 응답', { api: { body: '<html><body>접속이 차단 되었습니다</body></html>' } }, /JSON이 아닌/],
  ['data.list 없는 JSON', { api: { body: '{"resultCode":"E"}' } }, /형식/],
  ['HTTP 429', { api: { status: 429, body: '' } }, /429/],
  ['HTTP 403', { page: { status: 403, body: '' } }, /403/],
  ['시간 초과(연결 실패 3회)', { api: { throw: 'The operation was aborted due to timeout' } }, /연결 실패/],
  ['HTTP 500 계속', { api: { status: 500, body: '' } }, /500/],
  ['일부 회차 누락(최신 2개 앞 회차 빠짐)', { page: { body: page(REAL_MAX + 2) }, api: { body: listFor([back({ ...N1249, round: REAL_MAX + 2, date: '2026-11-14' }), back(REAL.at(-1))]) } }, /누락/],
  ['날짜 역전', { api: { body: listFor([back({ ...N1249, date: '2026-10-24' }), back(REAL.at(-1))]) } }, /순서|저장 안 함/],
  ['유효한 JSON이지만 번호 중복', { api: { body: listFor([back({ ...N1249, numbers: [3, 3, 25, 32, 40, 44] }), back(REAL.at(-1))]) } }, /저장 안 함/],
  ['유효한 JSON이지만 보너스=본번호', { api: { body: listFor([back({ ...N1249, bonus: 44 }), back(REAL.at(-1))]) } }, /저장 안 함/],
  ['기존 회차 값 변경', { api: { body: listFor([back(N1249), back({ ...REAL.at(-1), numbers: [1, 2, 3, 4, 5, 6] })]) } }, /값이 다른/],
  ['robots.txt 금지', { robots: { status: 200, body: 'User-agent: *\nDisallow: /lt645/' } }, /robots/],
  ['결과 페이지 구조 변경(회차 목록 없음)', { page: { body: '<html></html>' } }, /최신 회차를 찾지/],
];
for (const [name, override, msg] of failures) {
  test(`실패 주입: ${name} → 중단, 원본 그대로`, async () => {
    const { file, before } = setup();
    await assert.rejects(run(opts(file, { ...NORMAL, ...override })), msg);
    assert.equal(readFileSync(file, 'utf8'), before);
    assert.equal(existsSync(file + '.tmp'), false);
  });
}

test('실패 주입: 429·403은 재시도하지 않음 (요청 1건)', async () => {
  const { file } = setup();
  const calls = [];
  await assert.rejects(run(opts(file, { ...NORMAL, api: { status: 429 } }, calls)), StopError);
  assert.equal(calls.filter((u) => u.includes('selectPst')).length, 1);
});
test('실패 주입: 500은 최대 3번까지만', async () => {
  const { file } = setup();
  const calls = [];
  await assert.rejects(run(opts(file, { ...NORMAL, api: { status: 500 } }, calls)));
  assert.equal(calls.filter((u) => u.includes('selectPst')).length, 3);
});
test('실패 주입: 500 후 복구되면 성공', async () => {
  const { file } = setup();
  const api = (u, n) => (n === 1 ? { status: 500 } : NORMAL.api);
  const r = await run(opts(file, { ...NORMAL, api }));
  assert.equal(r.latest, REAL_MAX + 1);
});
for (const [name, content] of [['손상된 파일', '{"draws": ['], ['빈 파일', ''], ['빈 배열', '{"draws":[]}']]) {
  test(`실패 주입: 기존 ${name} → 역대 재수집으로 넘어가지 않고 중단`, async () => {
    const { file } = setup();
    writeFileSync(file, content);
    const calls = [];
    await assert.rejects(run(opts(file, NORMAL, calls)), StopError);
    assert.equal(calls.length, 0, '네트워크 요청 0건');
    assert.equal(readFileSync(file, 'utf8'), content);
  });
}
test('실패 주입: 명령줄 실행도 종료 코드 1, 원본 그대로 (Actions 다음 단계 커밋 안 됨)', () => {
  const { file, before } = setup();
  const fx = join(file, '..', 'fixture.json');
  writeFileSync(fx, JSON.stringify({ 'robots.txt': { status: 404 }, '/lt645/result': { body: page(REAL_MAX + 1) }, selectPst: { body: { data: { list: [] } } } }));
  const script = fileURLToPath(new URL('../tools/fetch_draws.mjs', import.meta.url));
  const p = spawnSync(process.execPath, [script, 'update'], { env: { ...process.env, DADA_FETCH_FIXTURE: fx, DADA_DRAWS_FILE: file }, encoding: 'utf8' });
  assert.equal(p.status, 1, p.stderr);
  assert.match(p.stderr, /수집 실패/);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('수집 중지: 허락 표시 없이 실제 실행하면 네트워크 요청 없이 종료 코드 1', () => {
  const script = fileURLToPath(new URL('../tools/fetch_draws.mjs', import.meta.url));
  const { file, before } = setup();
  const env = { ...process.env, DADA_DRAWS_FILE: file }; delete env.DADA_FETCH_FIXTURE; delete env.ALLOW_DHLOTTERY_FETCH;
  const p = spawnSync(process.execPath, [script, 'update'], { env, encoding: 'utf8' });
  assert.equal(p.status, 1);
  assert.match(p.stderr, /수집 중지됨/);
  assert.equal(readFileSync(file, 'utf8'), before);
});
