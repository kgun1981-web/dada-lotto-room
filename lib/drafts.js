// 입력 초안 상태 (순수 함수). 화면은 이 상태만 보고 버튼·입력칸을 그림.
// 규칙: 새 번호 생성·수정 진입·취소 → 남은 초안 폐기 / 저장 실패 → 다음 장으로 넘어가지 않음

/** @typedef {{ queue: number[][][], active: number[][] | null, sheet: number, total: number }} DraftState */

/** @returns {DraftState} */
export const emptyDrafts = () => ({ queue: [], active: null, sheet: 0, total: 0 });

/** 10게임 → 2장 초안을 만들고 첫 장을 바로 꺼냄. 이전 초안은 버림 */
export function createDrafts(games) {
  const queue = [];
  for (let i = 0; i < games.length; i += 5) queue.push(games.slice(i, i + 5).map((g) => [...g]));
  const total = queue.length;
  if (!total) return emptyDrafts();
  return { queue: queue.slice(1), active: queue[0], sheet: 1, total };
}

/** 현재 장 저장 성공 → 활성 초안 해제 (다음 장은 사용자가 버튼으로 꺼냄) */
export const draftSaved = (s) => ({ ...s, active: null });

/** 저장 실패 → 상태 그대로 (다음 장으로 넘어가지 않음) */
export const draftSaveFailed = (s) => s;

/** 다음 장 꺼내기. 활성 초안이 남아 있으면 넘기지 않음 */
export function nextDraft(s) {
  if (s.active || !s.queue.length) return s;
  return { ...s, queue: s.queue.slice(1), active: s.queue[0], sheet: s.sheet + 1 };
}

/** 취소·수정 진입·새 번호 생성 시 초안 전부 폐기 */
export const discardDrafts = () => emptyDrafts();

/** "다음 장" 버튼 표시 여부 */
export const canLoadNext = (s) => !s.active && s.queue.length > 0;
