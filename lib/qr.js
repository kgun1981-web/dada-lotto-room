// 복권 QR 글자 → 회차·번호 (순수 함수, 네트워크 사용 없음)
// 공개 예시 형식: https://m.dhlottery.co.kr/qr.do?method=winQr&v=<회차><구분 글자><번호 12자리>...<뒤 숫자>
//  - 구분 글자(예: q·m·n)의 뜻과 맨 뒤 숫자의 뜻은 아직 실제 복권으로 확인 전 → 쓰지 않음
//  - 읽은 값이 하나라도 이상하면 일부만 채우지 않고 통째로 거부 (조용한 오인식 막기)
import { validateGame, InputError } from './lotto.js';

export const QR_FORMAT_CONFIRMED = false; // 실제 복권 QR로 확인하면 true

export function parseTicketQr(text) {
  const s = String(text || '').trim();
  const m = s.match(/[?&]v=([0-9A-Za-z]+)/);
  if (!m || !/dhlottery\.co\.kr/i.test(s)) throw new InputError('동행복권 로또 QR이 아니에요');
  const v = m[1];
  const head = v.match(/^(\d{1,5})(?=[A-Za-z])/);
  if (!head) throw new InputError('QR에서 회차를 찾지 못했어요');
  const round = Number(head[1]);
  if (!Number.isInteger(round) || round < 1) throw new InputError('QR의 회차가 올바르지 않아요');
  let rest = v.slice(head[1].length);
  const games = [];
  const marks = [];
  while (/^[A-Za-z]/.test(rest)) {
    const g = rest.match(/^([A-Za-z])(\d{12})/);
    if (!g) throw new InputError('QR의 번호 부분을 읽지 못했어요');
    const nums = g[2].match(/\d\d/g).map(Number);
    let game;
    try { game = validateGame(nums); } catch (e) { throw new InputError(`QR ${games.length + 1}번째 게임: ${e.message}`); }
    if (game.join(',') !== nums.join(',')) throw new InputError('QR 번호 순서가 예상과 달라요'); // 정렬돼 있어야 정상
    games.push(game); marks.push(g[1]);
    rest = rest.slice(13);
  }
  if (!games.length) throw new InputError('QR에서 번호를 찾지 못했어요');
  if (games.length > 5) throw new InputError('QR에 게임이 5개보다 많아요');
  if (!/^\d*$/.test(rest)) throw new InputError('QR 끝부분 형식이 예상과 달라요');
  return { round, games, marks };
}
