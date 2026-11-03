// 동행복권 당첨번호 수집기 (GitHub Actions에서 실행, Node 20+)
//
// 데이터 출처: 공식 결과 페이지(/lt645/result)가 화면에서 쓰는 조회 주소
//   GET /lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=<회차>
// 이 주소는 공개 API 문서가 있는 "지원·보장된 API"가 아님. 화면과 같은 방식으로만 조회하고,
// robots.txt에서 금지가 발견되거나 403/429 응답이 오면 즉시 중단(우회·재시도 없음).
//
// 모드
//   update  : 주간 갱신 (기본). 결과 페이지 1건 + 조회 1건. 기존 파일이 정상이어야 실행
//   history : 역대 전체 1회 수집 (2026-11-03 완료. 다시 실행하지 않음. 수동으로만 실행)
//
// 파일 교체 순서: 기존 정상 파일 읽기 → 새 데이터 생성 → 전체 검증 → 임시 파일 쓰기 →
//   임시 파일 다시 읽어 재검증 → 원본 교체. 어느 단계든 실패하면 원본 그대로, 종료 코드 1
//
// 사용: node tools/fetch_draws.mjs [update|history]
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDrawSet } from '../lib/tickets.js';

export const BASE = 'https://www.dhlottery.co.kr';
const API_PATH = '/lt645/selectPstLt645InfoNew.do';
const RESULT_PATH = '/lt645/result';
export const UA = 'Mozilla/5.0 (compatible; dada-lotto-room/1.0; personal weekly check; +https://github.com/kgun1981-web/dada-lotto-room)';
const DEFAULT_FILE = fileURLToPath(new URL('../draws/lotto645.json', import.meta.url));

// 공식 결과와 대조해 둔 회차 (언론 보도·김동건 휴대폰 앱 화면·공식 조회 응답 일치)
export const KNOWN = {
  1: { date: '2002-12-07', numbers: [10, 23, 29, 33, 37, 40], bonus: 16 },
  1206: { date: '2026-01-10', numbers: [1, 3, 17, 26, 27, 42], bonus: 23 },
  1208: { date: '2026-01-24', numbers: [6, 27, 30, 36, 38, 42], bonus: 25 },
  1209: { date: '2026-01-31', numbers: [2, 17, 20, 35, 37, 39], bonus: 24 },
  1248: { date: '2026-10-31', numbers: [16, 18, 27, 36, 38, 42], bonus: 22 },
};

export class StopError extends Error {} // 재시도하지 않고 중단해야 하는 실패

/** 공식 응답 1건 → 앱 데이터 형식 */
export function toDraw(x) {
  const ymd = String(x.ltRflYmd || '');
  const numbers = [x.tm1WnNo, x.tm2WnNo, x.tm3WnNo, x.tm4WnNo, x.tm5WnNo, x.tm6WnNo].map(Number).sort((a, b) => a - b);
  const ranks = [1, 2, 3, 4, 5].map((k) => ({ rank: k, winners: Number(x[`rnk${k}WnNope`]), amount: Number(x[`rnk${k}WnAmt`]) }));
  return {
    round: Number(x.ltEpsd),
    date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    numbers,
    bonus: Number(x.bnsWnNo),
    firstWinners: Number(x.rnk1WnNope),
    firstByType: { auto: Number(x.winType1), manual: Number(x.winType2), semi: Number(x.winType3) },
    ranks,
    totalSales: Number(x.wholEpsdSumNtslAmt),
    source: `${BASE}${RESULT_PATH}?ltEpsd=${Number(x.ltEpsd)}`,
    status: 'official_verified', // 의미: 공식 결과 화면의 조회 응답에서 가져옴 (별도 공식 인증·이용 허가 아님)
  };
}

/** robots.txt에서 우리 요청 경로가 금지됐는지 (User-agent: * 와 dada-lotto-room 규칙) */
export function robotsBlocks(text, paths = [API_PATH, RESULT_PATH]) {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(); const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], disallow: [], allow: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'disallow' && val) cur.disallow.push(val);
      if (key === 'allow' && val) cur.allow.push(val);
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a === '*' || a.includes('dada-lotto-room')));
  const hits = [];
  for (const p of paths) {
    for (const g of mine) {
      const dis = g.disallow.filter((d) => p.startsWith(d.replace(/\*.*$/, '').replace(/\$$/, '')));
      const allow = g.allow.filter((a) => p.startsWith(a.replace(/\*.*$/, '').replace(/\$$/, '')));
      const longest = (arr) => Math.max(0, ...arr.map((x) => x.length));
      if (dis.length && longest(dis) >= longest(allow)) hits.push(`${p} (Disallow: ${dis.join(', ')})`);
    }
  }
  return hits;
}

/**
 * 저장 판단 (순수 함수). 새 파일 전체에 대해:
 * 형식·상태·번호·보너스·날짜·중복(loadDrawSet 경고 0) / 1~최신 연속 / 회차 수·최신 회차 감소 없음 /
 * 날짜 순서 / 알려진 회차 값 일치
 */
export function decideWrite(existing, draws, { known = KNOWN } = {}) {
  if (!Array.isArray(draws) || !draws.length) return { ok: false, reason: '수집 결과 0건' };
  if (draws.some((d) => d?.status !== 'official_verified')) return { ok: false, reason: '상태값 오류' };
  const set = loadDrawSet(draws);
  if (set.rejected) return { ok: false, reason: `형식·순서 오류: ${set.warnings[0] || ''}` };
  if (set.warnings.length || set.index.size !== draws.length) return { ok: false, reason: `검증 경고: ${set.warnings.slice(0, 3).join(' / ')}` };
  const newMax = set.latest;
  for (let r = 1; r <= newMax; r++) if (!set.index.has(r)) return { ok: false, reason: `누락 회차 (${r}회 등)` };
  const oldOfficial = existing.filter((d) => d.status === 'official_verified').length;
  if (draws.length < oldOfficial) return { ok: false, reason: `회차 수 감소 (${oldOfficial} → ${draws.length})` };
  const oldMax = existing.length ? Math.max(...existing.map((d) => d.round)) : 0;
  if (newMax < oldMax) return { ok: false, reason: `최신 회차 감소 (${oldMax} → ${newMax})` };
  for (const [r, k] of Object.entries(known)) {
    const d = set.index.get(Number(r));
    if (!d) continue;
    if (d.date !== k.date || d.bonus !== k.bonus || d.numbers.join(',') !== k.numbers.join(',')) {
      return { ok: false, reason: `알려진 ${r}회 값과 다름` };
    }
  }
  return { ok: true, latest: newMax, count: draws.length };
}

/**
 * 수집 실행. 외부 의존(fetch, sleep, 시각)을 주입받아 실패 주입 테스트 가능.
 * 성공 시 { written, latest, added, requests }, 실패 시 예외 (원본 파일 그대로)
 */
export async function run({
  mode = 'update', file = DEFAULT_FILE, fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => new Date(),
  log = console.log, delayMs = 2000, maxRequests = 300,
} = {}) {
  let requests = 0;
  const get = async (path, { json }) => {
    if (requests >= maxRequests) throw new StopError(`요청 상한(${maxRequests}) 도달`);
    if (requests > 0) await sleep(delayMs);
    requests++;
    const url = `${BASE}${path}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let r;
      try {
        r = await fetchImpl(url, {
          headers: json
            ? { 'User-Agent': UA, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}${RESULT_PATH}` }
            : { 'User-Agent': UA },
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        if (attempt === 3) throw new Error(`${url} 연결 실패: ${e.message}`);
        await sleep(10000 * attempt); continue;
      }
      if (r.status === 403 || r.status === 429) {
        throw new StopError(`${url} → HTTP ${r.status} (차단 또는 요청 제한). 재시도하지 않고 중단, 관리자 확인 필요`);
      }
      if (r.status >= 500) {
        if (attempt === 3) throw new Error(`${url} → HTTP ${r.status}`);
        await sleep(10000 * attempt); continue;
      }
      if (!r.ok && !(path === '/robots.txt' && r.status === 404)) throw new StopError(`${url} → HTTP ${r.status}`);
      const text = await r.text();
      if (!json) return { status: r.status, text };
      let j;
      try { j = JSON.parse(text); } catch { throw new StopError(`${url} → JSON이 아닌 응답 (앞부분: ${text.slice(0, 60).replace(/\s+/g, ' ')})`); }
      const list = j?.data?.list;
      if (!Array.isArray(list)) throw new StopError(`${url} → 응답 형식이 예상과 다름 (data.list 없음)`);
      return list;
    }
  };

  // 0) 기존 파일: 정상이어야 주간 갱신 진행 (손상 시 역대 재수집으로 넘어가지 않고 중단)
  let existing = [];
  if (existsSync(file)) {
    try { existing = JSON.parse(readFileSync(file, 'utf8')).draws || []; }
    catch { throw new StopError('기존 당첨번호 파일을 읽을 수 없음. 복원 절차(README) 후 다시 실행'); }
  }
  if (mode === 'update') {
    const chk = decideWrite([], existing);
    if (!chk.ok) throw new StopError(`기존 파일이 정상이 아님(${chk.reason}). 주간 갱신 중단, 복원 절차(README) 확인`);
  } else if (mode !== 'history') throw new StopError(`알 수 없는 모드: ${mode}`);

  // 1) robots.txt 확인
  const robots = await get('/robots.txt', { json: false });
  const blocked = robots.status === 200 ? robotsBlocks(robots.text) : [];
  log(`robots.txt: HTTP ${robots.status}${robots.status === 200 ? `, ${robots.text.length}자` : ''} · 금지 ${blocked.length ? blocked.join('; ') : '없음'}`);
  if (blocked.length) throw new StopError(`robots.txt에서 금지 발견: ${blocked.join('; ')}. 수집 중단`);

  // 2) 최신 회차 (결과 페이지 회차 선택 목록)
  const page = await get(RESULT_PATH, { json: false });
  const nums = [...page.text.matchAll(/<option[^>]*value="(\d{1,5})"/g)].map((m) => Number(m[1])).filter((n) => n > 0);
  if (!nums.length) throw new StopError('결과 페이지에서 최신 회차를 찾지 못함 (화면 구조 변경 가능성)');
  const latest = Math.max(...nums);
  const fetchAround = async (round) =>
    (await get(`${API_PATH}?${new URLSearchParams({ srchDir: 'center', srchLtEpsd: String(round) })}`, { json: true })).map(toDraw);

  // 3) 수집
  const byRound = new Map();
  const first = await fetchAround(latest);
  if (!first.some((d) => d.round === latest)) throw new StopError(`최신 ${latest}회가 응답에 없음`);
  first.forEach((d) => byRound.set(d.round, d));
  if (mode === 'history') {
    for (;;) {
      let top = 0;
      for (let r = latest; r >= 1; r--) if (!byRound.has(r)) { top = r; break; }
      if (!top) break;
      const batch = await fetchAround(top);
      if (!batch.some((d) => !byRound.has(d.round))) throw new StopError(`${top}회 주변에서 새 회차를 받지 못함`);
      batch.forEach((d) => byRound.set(d.round, d));
      if (requests % 20 === 0) log(`... ${top}회 부근 (요청 ${requests}건, ${byRound.size}회차)`);
    }
  }

  // 4) 합치기: 기존 공식 데이터 + 새 데이터 (값이 바뀐 회차는 기록)
  const map = new Map(existing.filter((d) => d.status === 'official_verified').map((d) => [d.round, d]));
  const changes = [];
  for (const d of byRound.values()) {
    const old = map.get(d.round);
    if (old && (old.numbers.join(',') !== d.numbers.join(',') || old.bonus !== d.bonus || old.date !== d.date)) {
      changes.push(`${d.round}회 ${old.numbers.join(',')}+${old.bonus} → ${d.numbers.join(',')}+${d.bonus}`);
    }
    map.set(d.round, d);
  }
  if (changes.length) throw new StopError(`기존 공식 데이터와 값이 다른 회차: ${changes.slice(0, 3).join(' / ')}. 자동 덮어쓰기 안 함, 확인 필요`);
  const draws = [...map.values()].sort((a, b) => a.round - b.round);

  // 5) 검증 → 임시 파일 → 재검증 → 교체
  const decision = decideWrite(existing, draws);
  if (!decision.ok) throw new StopError(`저장 안 함: ${decision.reason}`);
  if (JSON.stringify(draws) === JSON.stringify(existing)) {
    log(`새 회차 없음 (최신 ${decision.latest}회). 파일 그대로, 요청 ${requests}건`);
    return { written: false, latest: decision.latest, added: 0, requests };
  }
  const prevMax = existing.length ? Math.max(...existing.map((d) => d.round)) : 0;
  const n = now();
  const out = {
    lastChecked: new Date(n.getTime() + 9 * 3600e3).toISOString().slice(0, 10),
    checkedAt: n.toISOString(),
    source: `동행복권 공식 결과 화면 조회 (${API_PATH}, GET)`,
    sourceNote: '공식 공개 API가 아닌 결과 화면의 조회 주소. official_verified는 출처 표시이며 공식 인증·이용 허가를 뜻하지 않음',
    userAgent: UA,
    count: draws.length,
    latest: decision.latest,
    draws,
  };
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(out) + '\n');
  try {
    const back = JSON.parse(readFileSync(tmp, 'utf8'));
    const re = decideWrite(existing, back.draws);
    if (!re.ok || back.count !== draws.length || back.latest !== decision.latest) throw new StopError(`임시 파일 재검증 실패: ${re.reason || '개수 불일치'}`);
    renameSync(tmp, file);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* 없음 */ }
    throw e;
  }
  const added = decision.latest - prevMax;
  log(`저장: ${draws.length}회차 (1~${decision.latest}회), 새 회차 ${Math.max(0, added)}개, 요청 ${requests}건`);
  return { written: true, latest: decision.latest, added, requests };
}

// ---------- 명령줄 실행 ----------
// 실패 주입 시험용: DADA_FETCH_FIXTURE=<json 파일> 이면 실제 네트워크 대신 그 응답을 사용
function fixtureFetch(path) {
  const routes = JSON.parse(readFileSync(path, 'utf8'));
  return async (url) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key] : { status: 404, body: '' };
    if (r.throw) throw new Error(r.throw);
    const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status || 200 });
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] || 'update';
  const fx = process.env.DADA_FETCH_FIXTURE;
  run({
    mode,
    file: process.env.DADA_DRAWS_FILE || DEFAULT_FILE,
    ...(fx ? { fetchImpl: fixtureFetch(fx), sleep: async () => {}, delayMs: 0 } : {}),
  }).catch((e) => { console.error('수집 실패:', e.message); process.exit(1); });
}
