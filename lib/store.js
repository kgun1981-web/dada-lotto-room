// IndexedDB 저장소 (기기 안에만 저장, 네트워크 사용 없음)
const DB = 'dada-lotto';
const VER = 1;
const STORE = 'tickets';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('round', 'round');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => { db.close(); resolve(out); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const store = {
  async all() {
    return tx('readonly', (s) => wrap(s.getAll())).then((list) =>
      (list || []).sort((a, b) => b.round - a.round || b.createdAt.localeCompare(a.createdAt)));
  },
  put(ticket) { return tx('readwrite', (s) => { s.put(ticket); }); },
  putMany(list) { return tx('readwrite', (s) => { list.forEach((t) => s.put(t)); }); },
  remove(id) { return tx('readwrite', (s) => { s.delete(id); }); },
  clear() { return tx('readwrite', (s) => { s.clear(); }); },
};
