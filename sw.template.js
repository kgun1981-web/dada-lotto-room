// 다다의 복권방 서비스 워커. build.mjs가 버전과 파일 목록을 채워 sw.js로 만듦.
// - 앱이 관리하는 파일(FILES)과 화면 이동(navigation)만 캐시에서 응답. 그 밖의 요청은 관여 안 함
// - 쿼리 문자열은 무시하지 않음 (정확히 같은 주소만)
// - draws/ 아래 당첨 데이터는 캐시하지 않음. 검증 후 정상 사본 저장은 앱이 직접 처리
// - IndexedDB(구매 기록)는 건드리지 않음
const VERSION = '__VERSION__';
const CACHE = `dada-lotto-${VERSION}`;
const FILES = __FILES__;
const SCOPE = new URL(self.registration.scope);
const MANAGED = new Set(FILES.map((f) => new URL(f, SCOPE).href));
const DRAWS_PREFIX = new URL('draws/', SCOPE).pathname;
const START = new URL('./', SCOPE).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dada-lotto-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return; // 앱 범위 밖
  if (url.pathname.startsWith(DRAWS_PREFIX)) return; // 당첨 데이터는 네트워크 그대로

  if (req.mode === 'navigate') {
    // 화면 이동도 캐시 우선: 화면(HTML)과 모듈(JS)이 항상 같은 버전 묶음으로 열리게 함.
    // 새 버전은 백그라운드에서 설치되고 다음 실행 때 적용 (열린 화면은 잠시 이전 버전 유지)
    e.respondWith(caches.match(START).then((hit) => hit || fetch(req)));
    return;
  }
  if (MANAGED.has(url.href)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
