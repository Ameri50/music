const DB_NAME = 'onda-db';
const VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('albums')) {
        db.createObjectStore('albums', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tracks')) {
        const store = db.createObjectStore('tracks', { keyPath: 'id' });
        store.createIndex('albumId', 'albumId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const getAlbums = () => run('albums', 'readonly', (s) => s.getAll());
export const getTracks = () => run('tracks', 'readonly', (s) => s.getAll());
export const putAlbum = (album) => run('albums', 'readwrite', (s) => s.put(album));
export const putTrack = (track) => run('tracks', 'readwrite', (s) => s.put(track));
export const removeAlbum = (id) => run('albums', 'readwrite', (s) => s.delete(id));
export const removeTrack = (id) => run('tracks', 'readwrite', (s) => s.delete(id));
