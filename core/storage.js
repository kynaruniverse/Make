/**
 * MAKÉ CORE — storage.js (V2)
 * IndexedDB wrapper. Upgraded with schema extension on read,
 * checkpoint increment on write, and clean error handling.
 */

import { extendItem, nextCheckpoint } from './schema.js';

const DB_NAME    = 'MakeDB';
const STORE_NAME = 'items';
const DB_VERSION = 2;

// Singleton promise — DB opens once, reused everywhere
const getDB = (() => {
  let promise;
  return () => {
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, {
              keyPath:       'id',
              autoIncrement: true,
            });
            store.createIndex('type',  'type');
            store.createIndex('layer', 'layer');
          }
        };
      });
    }
    return promise;
  };
})();

/** Return all items, extended to latest schema. */
export async function getAllItems() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result || []).map(extendItem));
    req.onerror   = () => reject(req.error);
  });
}

/** Save (add or update) an item. Bumps checkpoint and updatedAt. */
export async function saveItem(item) {
  const db   = await getDB();
  const tx   = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const toSave = {
    ...item,
    checkpoint: nextCheckpoint(item),
    updatedAt:  Date.now(),
  };
  if (!toSave.createdAt) toSave.createdAt = Date.now();

  return new Promise((resolve, reject) => {
    const req = toSave.id ? store.put(toSave) : store.add(toSave);
    req.onsuccess = () => resolve({ ...toSave, id: req.result || toSave.id });
    req.onerror   = () => reject(req.error);
  });
}

/** Delete an item by id. */
export async function deleteItem(id) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Update only the position field of a sticky note. */
export async function updateItemPosition(id, position) {
  const db    = await getDB();
  const tx    = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) { resolve(); return; }
      item.position  = position;
      item.updatedAt = Date.now();
      const putReq   = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}
