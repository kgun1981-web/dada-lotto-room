// 동행복권 공식 당첨번호 수집기 (GitHub Actions에서 실행, Node 20+)
// - 공식 결과 페이지가 쓰는 조회 주소(/lt645/selectPstLt645InfoNew.do, GET)만 사용
// - 역대 전체(history): 최신부터 10회차씩 거슬러 올라감, 요청 간격 2초, 최대 200회 요청
// - 주간 갱신(update): 최신 묶음 1회 요청 → 새 회차만 추가
// - 저장 전 앱과 같은 검증(loadDrawSet) 통과해야 파일을 바꿈. 실패 시 기존 파일 유지, 종료 코드 1
// 사용: node tools/fetch_draws.mjs [history|update|auto]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadDrawSet } from '../lib/tickets.js';

const BASE = 'https://www.dhlottery.co.kr';
const API = `${BASE}/lt645/selectPstLt645InfoNew.do`;
const UA = 'Mozilla/5.0 (dada-lotto-room personal app; github.com/kgun1981-web/dada-lotto-room)';
const FILE = new URL('../draws/lotto645.json', import.meta.url);
const DELAY_MS = 2000;
const MAX_REQUESTS = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;

async function call(params) {
  if (requests >= MAX_REQUESTS) throw new Error(`요청 상한(${MAX_REQUESTS}) 도달`);
  if (requests > 0) await sleep(DELAY_MS);
  requests++;
  const url = `${API}?${new URLSearchParams(params)}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${BASE}/lt645/result` },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const list = j?.data?.list;
      if (!Array.isArray(list)) throw new Error('응답 형식이 예상과 다름 (data.list 없음)');
      return list;
    } catch (e) {
      if (attempt === 3) throw new Error(`${url} 실패: ${e.message}`);
      await sleep(5000 * attempt);
    }
  }
}

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
    source: `${BASE}/lt645/result?ltEpsd=${Number(x.ltEpsd)}`,
    status: 'official_verified',
  };
}

function readExisting() {
  if (!existsSync(FILE)) return [];
  try { return JSON.parse(readFileSync(FILE, 'utf8')).draws || []; } catch { return []; }
}

/** 결과 페이지의 회차 선택 목록에서 최신 회차 번호 읽기 */
async function getLatestRound() {
  if (requests > 0) await sleep(DELAY_MS);
  requests++;
  const r = await fetch(`${BASE}/lt645/result`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`결과 페이지 HTTP ${r.status}`);
  const html = await r.text();
  const nums = [...html.matchAll(/<option[^>]*value="(\d{1,5})"/g)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 100000);
  if (!nums.length) throw new Error('결과 페이지에서 최신 회차를 찾지 못함');
  return Math.max(...nums);
}

/** 기준 회차와 그 이전 회차 묶음 (공식 화면의 '회차 선택' 조회와 같은 방식) */
async function fetchAround(round) {
  return (await call({ srchDir: 'center', srchLtEpsd: String(round) })).map(toDraw);
}

async function fetchLatest() {
  const latest = await getLatestRound();
  const list = await fetchAround(latest);
  if (!list.some((d) => d.round === latest)) throw new Error(`최신 ${latest}회가 응답에 없음`);
  return list;
}

async function fetchHistory() {
  const byRound = new Map();
  let batch = await fetchLatest();
  while (batch.length) {
    batch.forEach((d) => byRound.set(d.round, d));
    let oldest = 1;
    for (let r = 1; r <= Math.max(...byRound.keys()); r++) if (!byRound.has(r)) oldest = r; // 아직 없는 가장 큰 회차
    const missingTop = oldest;
    if (byRound.has(missingTop)) break; // 1회까지 모두 채움
    batch = await fetchAround(missingTop);
    if (!batch.some((d) => !byRound.has(d.round))) throw new Error(`${missingTop}회 주변에서 새 회차를 받지 못함 (중단)`);
    if (requests % 20 === 0) console.log(`... ${missingTop}회 부근 수집 중 (요청 ${requests}건, ${byRound.size}회차)`);
  }
  return [...byRound.values()];
}

/**
 * 파일을 바꿔도 되는지 판단 (순수 함수)
 * - 결과 0건, 기존 공식 회차보다 적음, 최신 회차가 줄어듦 → 거부
 * - 역대 수집이면 1~최신까지 빠짐없이 있어야 함
 */
export function decideWrite(existing, draws, { history }) {
  if (!draws.length) return { ok: false, reason: '수집 결과 0건' };
  const oldOfficial = existing.filter((d) => d.status === 'official_verified').length;
  if (draws.length < oldOfficial) return { ok: false, reason: `회차 수 감소 (${oldOfficial} → ${draws.length})` };
  const oldMax = existing.length ? Math.max(...existing.map((d) => d.round)) : 0;
  const newMax = Math.max(...draws.map((d) => d.round));
  if (newMax < oldMax) return { ok: false, reason: `최신 회차 감소 (${oldMax} → ${newMax})` };
  if (history) {
    const have = new Set(draws.map((d) => d.round));
    const missing = [];
    for (let r = 1; r <= newMax; r++) if (!have.has(r)) missing.push(r);
    if (missing.length) return { ok: false, reason: `누락 회차 ${missing.length}개 (예: ${missing.slice(0, 10).join(', ')})` };
  }
  return { ok: true };
}

async function main() {
  const mode = process.argv[2] || 'auto';
  const existing = readExisting();
  const officialCount = existing.filter((d) => d.status === 'official_verified').length;
  const doHistory = mode === 'history' || (mode === 'auto' && officialCount < 1000);
  console.log(`모드: ${doHistory ? '역대 전체' : '주간 갱신'} (기존 공식 ${officialCount}회차)`);

  const fetched = doHistory ? await fetchHistory() : await fetchLatest();
  const map = new Map();
  // 기존 공식 데이터 유지, 그 외(언론 확인 등)는 공식 데이터로 대체
  existing.filter((d) => d.status === 'official_verified').forEach((d) => map.set(d.round, d));
  const changes = [];
  for (const d of fetched) {
    const old = existing.find((e) => e.round === d.round);
    if (old && (old.numbers.join(',') !== d.numbers.join(',') || old.bonus !== d.bonus || old.date !== d.date)) {
      changes.push(`${d.round}회: 기존(${old.status}) ${old.numbers.join(',')}+${old.bonus} → 공식 ${d.numbers.join(',')}+${d.bonus}`);
    }
    map.set(d.round, d);
  }
  const draws = [...map.values()].sort((a, b) => a.round - b.round);

  // 앱과 같은 검증. 경고 1건이라도 있으면 저장 안 함
  const set = loadDrawSet(draws);
  if (set.rejected || set.warnings.length || set.index.size !== draws.length) {
    console.error('검증 실패, 파일을 바꾸지 않음:', set.warnings.slice(0, 5));
    process.exit(1);
  }
  const decision = decideWrite(existing, draws, { history: doHistory });
  if (!decision.ok) {
    console.error(`저장 안 함: ${decision.reason}`);
    process.exit(1);
  }
  const prevLatest = existing.length ? Math.max(...existing.map((d) => d.round)) : 0;
  const out = {
    lastChecked: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
    source: '동행복권 공식 결과 페이지 조회 (lt645/selectPstLt645InfoNew.do)',
    note: '매주 자동 수집. 앱 판정은 참고용이며 최종 당첨 여부는 동행복권 공식 조회와 실물 복권으로 확인',
    count: draws.length,
    draws,
  };
  writeFileSync(FILE, JSON.stringify(out) + '\n');
  console.log(`저장: ${draws.length}회차 (1~${set.latest}회), 새 회차 ${Math.max(0, set.latest - prevLatest)}개, 요청 ${requests}건`);
  if (changes.length) console.log('기존 데이터와 다른 회차:\n' + changes.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('수집 실패:', e.message); process.exit(1); });
}
