// 동행복권 결과 화면 "전체 복사" 형식을 흉내 낸 합성 자료 (실제 회차·금액 아님)
// 실제 복사본은 공개 저장소에 두지 않음 (test/local/ 에만, .gitignore)
const won = (n) => n.toLocaleString('en-US') + '원';
const dot = (d) => d.replace(/-/g, '.');

export const A = { round: 3001, date: '2060-05-08', numbers: [3, 9, 17, 25, 33, 41], bonus: 12 };
export const B = { round: 3002, date: '2060-05-15', numbers: [5, 11, 19, 27, 35, 43], bonus: 2 };
export const RANKS = [
  { rank: 1, winners: 7, amount: 3000000000 }, { rank: 2, winners: 50, amount: 70000000 },
  { rank: 3, winners: 2000, amount: 1700000 }, { rank: 4, winners: 100000, amount: 50000 }, { rank: 5, winners: 1800000, amount: 5000 },
];
const LABEL = { 1: '6개번호 일치', 2: '5개번호 일치 + 보너스번호 일치', 3: '5개번호 일치', 4: '4개번호 일치', 5: '3개번호 일치' };

export function block(d, title = `제 ${d.round}회 추첨 결과`) {
  return [title, `${dot(d.date)} 추첨`, '당첨번호', ...d.numbers, '+', '보너스번호', d.bonus, '당첨번호', '보너스번호'].join('\n');
}
export function table(ranks = RANKS) {
  const headRow = ['순위', '등위별 총 당첨금', '당첨게임 수', '1게임당 당첨금', '당첨기준', '비고'].join('\n');
  return [headRow, headRow, ...ranks.map((r) => [`${r.rank}등`, won(r.amount * r.winners), r.winners.toLocaleString('en-US'), won(r.amount), LABEL[r.rank]].join('\n')),
    '1등', '자동5', '수동2', '반자동0', '•', '당첨금 지급기한 : 지급개시일로부터 1년 (휴일인 경우 익영업일)', '•', '총판매금액 : 100,000,000,000원'].join('\n');
}
/** selected: 회차 선택칸 회차(null이면 선택칸 없음) */
export function page({ selected = B.round, blocks = [A, B], ranks = RANKS, extra = '' } = {}) {
  return ['추첨결과', '회차별 당첨번호', ...(selected != null ? [`${selected}회`] : []), ...blocks.map((b) => block(b)), ...(ranks ? [table(ranks)] : []), extra].join('\n');
}
