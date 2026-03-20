/**
 * MAKÉ CORE — storage.js (V3)
 * FIX: null id stripped before store.add() so IndexedDB autoIncrement works.
 */

import { extendItem, nextCheckpoint } from './schema.js';

const DB_NAME    = 'MakeDB';
const STORE_NAME = 'items';
const DB_VERSION = 2;

const getDB = (() => {
  let promise;
  return () => {
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror   = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('type',  'type');
            store.createIndex('layer', 'layer');
          }
        };
      });
    }
    return promise;
  };
})();

export async function getAllItems() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result || []).map(extendItem));
    req.onerror   = () => reject(req.error);
  });
}

export async function saveItem(item) {
  const db    = await getDB();
  const tx    = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const toSave = { ...item, checkpoint: nextCheckpoint(item), updatedAt: Date.now() };
  if (!toSave.createdAt) toSave.createdAt = Date.now();

  return new Promise((resolve, reject) => {
    let req;
    if (toSave.id) {
      req = store.put(toSave);
    } else {
      // Strip null id so IndexedDB autoIncrement generates one
      const { id: _dropped, ...rest } = toSave;
      req = store.add(rest);
    }
    req.onsuccess = () => resolve({ ...toSave, id: req.result ?? toSave.id });
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteItem(id) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

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
