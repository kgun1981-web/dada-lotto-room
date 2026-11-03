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

async function fetchLatest() {
  return (await call({ srchDir: 'latest' })).map(toDraw);
}

async function fetchHistory() {
  const byRound = new Map();
  let batch = await call({ srchDir: 'latest' });
  while (batch.length) {
    batch.map(toDraw).forEach((d) => byRound.set(d.round, d));
    const oldest = Math.min(...batch.map((x) => Number(x.ltEpsd)));
    if (oldest <= 1) break;
    const next = await call({ srchDir: 'older', srchCursorLtEpsd: String(oldest) });
    const nextOldest = next.length ? Math.min(...next.map((x) => Number(x.ltEpsd))) : oldest;
    if (!next.length || nextOldest >= oldest) break; // 더 거슬러 올라가지 않으면 중단
    batch = next;
    if (requests % 20 === 0) console.log(`... ${oldest}회까지 수집 (요청 ${requests}건)`);
  }
  return [...byRound.values()];
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
  if (doHistory) {
    const missing = [];
    for (let r = 1; r <= set.latest; r++) if (!set.index.has(r)) missing.push(r);
    if (missing.length) {
      console.error(`누락 회차 ${missing.length}개 (예: ${missing.slice(0, 10).join(', ')}), 파일을 바꾸지 않음`);
      process.exit(1);
    }
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
