// 붙여넣은 글(동행복권 결과 화면 복사, 사진 텍스트 인식 등)에서 당첨번호 찾기 (순수 함수)
// 예) "16\n18\n27\n36\n38\n42\n+\n보너스번호\n22"
//     "1248회 2026.10.31 16 18 27 36 38 42 + 22"
//     여러 회차를 한꺼번에 붙여넣은 경우 "○회"를 기준으로 나눔
// 결과는 저장하지 않음. 화면에서 사용자가 확인한 뒤 저장

const ROUND_RE = /(\d{1,5})\s*회/g;
const DATE_RE = /(20\d{2}|19\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g;

const pad = (n) => String(n).padStart(2, '0');

/** 한 덩어리 글에서 번호 6개 + 보너스 */
function parseBlock(text) {
  let t = String(text);
  let date = null;
  t = t.replace(DATE_RE, (_, y, m, d) => {
    if (!date) date = `${y}-${pad(m)}-${pad(d)}`;
    return ' ';
  });
  // 보너스 구분: '+' 또는 '보너스' 앞뒤로 나눔
  const parts = t.split(/\+|보너스\s*번호|보너스/);
  const nums = (s) => (s.match(/\d+/g) || []).map(Number);
  let main; let bonus = null; let note = '';
  if (parts.length >= 2) {
    main = nums(parts[0]).filter((n) => n >= 1 && n <= 45);
    const after = nums(parts.slice(1).join(' ')).filter((n) => n >= 1 && n <= 45);
    bonus = after.length ? after[0] : null;
    if (main.length > 6) { note = `번호가 ${main.length}개라 마지막 6개를 썼어요`; main = main.slice(-6); }
  } else {
    const all = nums(t).filter((n) => n >= 1 && n <= 45);
    if (all.length === 7) { main = all.slice(0, 6); bonus = all[6]; note = '보너스 표시가 없어 7번째 숫자를 보너스로 봤어요'; }
    else main = all;
  }
  return { numbers: main, bonus, date, note };
}

/**
 * @returns {{ items: Array<{round:number|null, date:string|null, numbers:number[], bonus:number|null, note:string}>, warning?: string }}
 */
export function parsePasted(text) {
  const src = String(text || '').replace(/ /g, ' ');
  if (!src.trim()) return { items: [], warning: '붙여넣은 내용이 없어요' };
  const marks = [...src.matchAll(ROUND_RE)].map((m) => ({ round: Number(m[1]), at: m.index, end: m.index + m[0].length }));
  if (!marks.length) {
    const b = parseBlock(src);
    return { items: [{ round: null, ...b }] };
  }
  const items = [];
  // 회차 표시 앞에 번호가 있으면(회차 없이 시작한 덩어리) 회차 없음으로 처리
  const head = src.slice(0, marks[0].at);
  if ((head.match(/\d+/g) || []).filter((n) => +n >= 1 && +n <= 45).length >= 6) items.push({ round: null, ...parseBlock(head) });
  marks.forEach((m, i) => {
    const body = src.slice(m.end, i + 1 < marks.length ? marks[i + 1].at : src.length);
    const b = parseBlock(body);
    if (b.numbers.length || b.bonus != null) items.push({ round: m.round, ...b });
  });
  return { items };
}

/** 회차 번호로 추첨일 계산 (매주 토요일, 1회 = 2002-12-07). 화면에서 사용자가 눌러 확인할 때만 사용 */
export function saturdayOf(round) {
  return new Date(Date.UTC(2002, 11, 7) + (round - 1) * 7 * 86400000).toISOString().slice(0, 10);
}
