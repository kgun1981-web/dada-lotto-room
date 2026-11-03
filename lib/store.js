// IndexedDB 저장소 (기기 안에만 저장, 네트워크 사용 없음)
// v1: tickets(내 복권) / v2: + userDraws(직접 입력한 당첨번호) / v3: + draws(휴대폰에 보관한 당첨번호 자료)
// 업그레이드 때 기존 저장소는 그대로 둠
const DB = 'dada-lotto';
const VER = 3;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tickets')) {
        db.createObjectStore('tickets', { keyPath: 'id' }).createIndex('round', 'round');
      }
      if (!db.objectStoreNames.contains('userDraws')) db.createObjectStore('userDraws', { keyPath: 'round' });
      if (!db.objectStoreNames.contains('draws')) db.createObjectStore('draws', { keyPath: 'round' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('다른 화면에서 앱이 열려 있어 저장소를 업그레이드하지 못했습니다'));
  });
}

async function tx(storeName, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const s = t.objectStore(storeName);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => { db.close(); resolve(out); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const byRound = (list) => (list || []).sort((a, b) => a.round - b.round);

/** 내 복권 */
export const store = {
  async all() {
    return tx('tickets', 'readonly', (s) => wrap(s.getAll())).then((list) =>
      (list || []).sort((a, b) => b.round - a.round || b.createdAt.localeCompare(a.createdAt)));
  },
  put(ticket) { return tx('tickets', 'readwrite', (s) => { s.put(ticket); }); },
  putMany(list) { return tx('tickets', 'readwrite', (s) => { list.forEach((t) => s.put(t)); }); },
  remove(id) { return tx('tickets', 'readwrite', (s) => { s.delete(id); }); },
  clear() { return tx('tickets', 'readwrite', (s) => { s.clear(); }); },
};

/** 직접 입력한 당첨번호 (회차당 1건) */
export const drawStore = {
  async all() {
    return tx('userDraws', 'readonly', (s) => wrap(s.getAll())).then((list) => (list || []).sort((a, b) => b.round - a.round));
  },
  put(draw) { return tx('userDraws', 'readwrite', (s) => { s.put(draw); }); },
  putMany(list) { return tx('userDraws', 'readwrite', (s) => { list.forEach((d) => s.put(d)); }); },
  remove(round) { return tx('userDraws', 'readwrite', (s) => { s.delete(round); }); },
  clear() { return tx('userDraws', 'readwrite', (s) => { s.clear(); }); },
};

/** 휴대폰에 보관한 당첨번호 자료 (파일로 불러온 1~1248회 등) */
export const savedDraws = {
  async all() { return tx('draws', 'readonly', (s) => wrap(s.getAll())).then(byRound); },
  putMany(list) { return tx('draws', 'readwrite', (s) => { list.forEach((d) => s.put(d)); }); },
  clear() { return tx('draws', 'readwrite', (s) => { s.clear(); }); },
};
