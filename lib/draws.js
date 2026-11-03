// 당첨 데이터 선택 (순수 함수): 네트워크 우선, 실패·손상 시 마지막 정상 사본.
// 검증을 통과하고 경고가 없는 데이터만 "정상 사본"으로 저장 (검증 전 캐싱 금지).
import { loadDrawSet } from './tickets.js';

/**
 * @param {{ freshText?: string|null, cachedText?: string|null }} input
 *   freshText: 방금 받은 JSON 원문 (실패 시 null)
 *   cachedText: 이전에 저장한 정상 사본 원문 (없으면 null)
 * @returns {{ source: 'network'|'cache'|'none', data: object|null, set: ReturnType<typeof loadDrawSet>|null,
 *             saveCache: boolean, notices: string[] }}
 */
export function chooseDrawData({ freshText = null, cachedText = null } = {}) {
  const notices = [];
  const parse = (t) => { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch { return null; } };

  let fresh = null; let freshSet = null;
  if (freshText != null) {
    fresh = parse(freshText);
    freshSet = fresh ? loadDrawSet(fresh.draws) : null;
  }
  const cached = cachedText != null ? parse(cachedText) : null;
  const cachedSet = cached ? loadDrawSet(cached.draws) : null;
  // 정상 사본 = 저장 때와 같은 기준(전체 거부 없음·회차 1개 이상·경고 0건). 손상된 사본은 사용 안 함
  const cachedOk = cachedSet && !cachedSet.rejected && cachedSet.index.size > 0 && cachedSet.warnings.length === 0;

  const freshUsable = freshSet && !freshSet.rejected && freshSet.index.size > 0;
  const freshClean = freshUsable && freshSet.warnings.length === 0;

  if (freshClean) return { source: 'network', data: fresh, set: freshSet, saveCache: true, notices };

  if (freshText != null && !freshUsable) {
    notices.push('새로 받은 당첨 데이터에 문제가 있어 사용하지 않았습니다');
    if (cachedOk) {
      notices.push('이전에 확인한 정상 데이터로 판정합니다');
      return { source: 'cache', data: cached, set: cachedSet, saveCache: false, notices };
    }
    return { source: 'none', data: null, set: freshSet, saveCache: false, notices };
  }

  if (freshUsable) {
    // 일부 회차에 오류가 있는 새 데이터: 정상 사본이 있으면 사본 우선, 없으면 경고와 함께 검증된 회차만 제한적으로 사용
    if (cachedOk) {
      notices.push('새로 받은 당첨 데이터 일부에 오류가 있어 이전에 확인한 정상 데이터로 판정합니다');
      return { source: 'cache', data: cached, set: cachedSet, saveCache: false, notices };
    }
    notices.push('당첨 데이터 일부에 오류가 있어 검증된 회차만 판정합니다');
    return { source: 'network', data: fresh, set: freshSet, saveCache: false, notices };
  }

  // 네트워크 실패
  if (cachedOk) {
    notices.push('오프라인 · 최신 당첨번호 확인 불가, 이전에 확인한 데이터로 판정합니다');
    return { source: 'cache', data: cached, set: cachedSet, saveCache: false, notices };
  }
  notices.push('당첨번호 확인 불가 · 결과가 없는 회차는 판정 불가로 표시됩니다');
  return { source: 'none', data: null, set: null, saveCache: false, notices };
}
