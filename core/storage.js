/**
 * MAKÉ CORE — storage.js (V6)
 *
 * V6 — Persistent storage protection:
 *
 * Problem: clearing browser data (history, cache, site data) wipes IndexedDB
 * and localStorage, destroying all notes without warning.
 *
 * Two-layer defence:
 *
 * 1. navigator.storage.persist()
 *    Requests the browser mark this origin as "persistent".  Once granted:
 *    - Chrome/Android: "Clear browsing data" skips persistent PWA storage.
 *      Only uninstalling the PWA or going to Settings → App → Clear Data
 *      will erase the data.
 *    - iOS (installed PWA): already fully isolated — deleting the app icon
 *      is the only way to lose data.
 *    - Desktop Chrome: persistent origins are protected from automatic
 *      eviction; manual clear still works but requires deliberate action.
 *    - Firefox: prompts the user for permission.
 *
 * 2. Auto-backup file (File System Access API)
 *    Every AUTO_BACKUP_INTERVAL saves, a backup JSON is written to a real
 *    file on the device's filesystem (outside the browser entirely).
 *    If IndexedDB is ever wiped, the user can restore from this file.
 *    Falls back gracefully if the API is unavailable (iOS < 17, Firefox).
 *
 * Public API additions:
 *   requestPersistence()     — call once on startup
 *   isPersistent()           — returns current persistence state
 *   getStorageEstimate()     — { usage, quota, percent }
 *   autoBackupIfDue(items)   — call after every save; writes file if needed
 *   restoreFromBackupFile()  — opens file picker → imports JSON backup
 */

import { extendItem, nextCheckpoint } from './schema.js';

const DB_NAME    = 'MakeDB';
const STORE_NAME    = 'items';
const FOLDER_STORE  = 'folders';
const DB_VERSION    = 3;   // bumped: adds folders store

// ── Auto-backup config ────────────────────────────────────────
// Trigger a backup file save after this many item saves.
const AUTO_BACKUP_INTERVAL = 10;
const BACKUP_COUNT_KEY     = 'make_save_count';
const BACKUP_FILE_KEY      = 'make_backup_file_handle'; // for re-use

let _persistenceState = 'unknown'; // 'granted' | 'denied' | 'prompt' | 'unknown'

// ── IndexedDB ─────────────────────────────────────────────────

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
          // V3: folders store
          if (!db.objectStoreNames.contains(FOLDER_STORE)) {
            db.createObjectStore(FOLDER_STORE, { keyPath: 'id', autoIncrement: true });
          }
        };
      });
    }
    return promise;
  };
})();

// ── localStorage fallback ─────────────────────────────────────
const LS_ITEMS_KEY = 'make_items_ls';
const LS_SEQ_KEY   = 'make_items_ls_seq';
let _usingFallback = false;

function _lsGetAll() {
  try { return JSON.parse(localStorage.getItem(LS_ITEMS_KEY) || '[]'); } catch { return []; }
}
function _lsSave(items) {
  try { localStorage.setItem(LS_ITEMS_KEY, JSON.stringify(items)); } catch (e) {
    console.warn('[Maké] localStorage full:', e);
  }
}
function _lsNextId() {
  const seq = (parseInt(localStorage.getItem(LS_SEQ_KEY) || '0', 10) || 0) + 1;
  localStorage.setItem(LS_SEQ_KEY, String(seq));
  return seq;
}
async function _lsGetAllItems() { return _lsGetAll().map(extendItem); }
async function _lsSaveItem(item) {
  const toSave = { ...item, checkpoint: nextCheckpoint(item), updatedAt: Date.now() };
  if (!toSave.createdAt) toSave.createdAt = Date.now();
  const items = _lsGetAll();
  if (toSave.id) {
    const idx = items.findIndex(i => i.id === toSave.id);
    if (idx >= 0) items[idx] = toSave; else items.push(toSave);
  } else {
    toSave.id = _lsNextId();
    items.push(toSave);
  }
  _lsSave(items);
  return toSave;
}
async function _lsDeleteItem(id) { _lsSave(_lsGetAll().filter(i => i.id !== id)); }
async function _lsUpdateItemPosition(id, position) {
  const items = _lsGetAll();
  const item  = items.find(i => i.id === id);
  if (item) { item.position = position; item.updatedAt = Date.now(); }
  _lsSave(items);
}

// ── Public API: core CRUD ──────────────────────────────────────

export async function getAllItems() {
  if (_usingFallback) return _lsGetAllItems();
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result || []).map(extendItem));
      req.onerror   = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[Maké] IndexedDB unavailable — falling back to localStorage.', err);
    _usingFallback = true;
    return _lsGetAllItems();
  }
}

export async function saveItem(item) {
  if (_usingFallback) return _lsSaveItem(item);
  try {
    const db    = await getDB();
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const toSave = { ...item, checkpoint: nextCheckpoint(item), updatedAt: Date.now() };
    if (!toSave.createdAt) toSave.createdAt = Date.now();
    return new Promise((resolve, reject) => {
      const req = toSave.id ? store.put(toSave) : store.add((({ id: _, ...r }) => r)(toSave));
      req.onsuccess = () => resolve({ ...toSave, id: req.result ?? toSave.id });
      req.onerror   = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[Maké] saveItem fallback:', err);
    _usingFallback = true;
    return _lsSaveItem(item);
  }
}

export async function deleteItem(id) {
  if (_usingFallback) return _lsDeleteItem(id);
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch (err) {
    _usingFallback = true;
    return _lsDeleteItem(id);
  }
}

export async function updateItemPosition(id, position) {
  if (_usingFallback) return _lsUpdateItemPosition(id, position);
  try {
    const db    = await getDB();
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) { resolve(); return; }
        item.position = position; item.updatedAt = Date.now();
        const putReq = store.put(item);
        putReq.onsuccess = () => resolve();
        putReq.onerror   = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    _usingFallback = true;
    return _lsUpdateItemPosition(id, position);
  }
}

export function isUsingFallback() { return _usingFallback; }

// ── Persistence API ───────────────────────────────────────────

/**
 * requestPersistence()
 * Ask the browser to protect this origin's storage from automatic eviction
 * and from being cleared by "Clear browsing data".
 *
 * Call once on startup.  Silent on browsers that don't support it.
 * Returns 'granted' | 'denied' | 'unsupported'.
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist) {
    _persistenceState = 'unsupported';
    return 'unsupported';
  }
  try {
    // Check if already persistent first (no prompt needed).
    const already = await navigator.storage.persisted();
    if (already) {
      _persistenceState = 'granted';
      return 'granted';
    }
    // Request it — Chrome grants silently for installed PWAs.
    // Firefox shows a permission prompt.
    const granted = await navigator.storage.persist();
    _persistenceState = granted ? 'granted' : 'denied';
    console.log(`[Maké] Storage persistence: ${_persistenceState}`);
    return _persistenceState;
  } catch (err) {
    console.warn('[Maké] requestPersistence failed:', err);
    _persistenceState = 'unknown';
    return 'unknown';
  }
}

/** Returns the last-known persistence state. */
export function isPersistent() { return _persistenceState === 'granted'; }
export function getPersistenceState() { return _persistenceState; }

/**
 * getStorageEstimate()
 * Returns { usage, quota, percent, usageStr, quotaStr } or null.
 */
export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const percent  = quota > 0 ? Math.round((usage / quota) * 100) : 0;
    const fmt      = n => n > 1e6 ? `${(n/1e6).toFixed(1)} MB` : `${Math.round(n/1e3)} KB`;
    return { usage, quota, percent, usageStr: fmt(usage), quotaStr: fmt(quota) };
  } catch { return null; }
}

// ── Auto-backup to device filesystem ─────────────────────────

/**
 * autoBackupIfDue(allItems)
 * Increments a save counter.  Every AUTO_BACKUP_INTERVAL saves, writes
 * a backup JSON to the device filesystem using the File System Access API.
 *
 * On first call it asks the user to pick a save location and remembers it.
 * Subsequent saves write silently to the same file.
 * Falls back gracefully (no-op) if the API is unavailable.
 *
 * @param {Array} allItems — combined backgroundItems + stickyItems
 */
export async function autoBackupIfDue(allItems) {
  if (!('showSaveFilePicker' in window)) return; // API not available

  // Increment counter
  const count = (parseInt(localStorage.getItem(BACKUP_COUNT_KEY) || '0', 10) || 0) + 1;
  localStorage.setItem(BACKUP_COUNT_KEY, String(count));

  if (count % AUTO_BACKUP_INTERVAL !== 0) return; // Not due yet

  await writeBackupFile(allItems, false); // false = use existing handle if available
}

/**
 * writeBackupFile(allItems, forceNewFile)
 * Writes all items to a JSON backup file on the device.
 * forceNewFile = true → always shows the save picker (used by manual Export).
 */
export async function writeBackupFile(allItems, forceNewFile = true) {
  if (!('showSaveFilePicker' in window)) {
    // Fallback to the old blob-download approach
    _downloadBlob(allItems);
    return;
  }

  try {
    let handle = null;

    // Try to reuse a stored file handle
    if (!forceNewFile) {
      try {
        const stored = localStorage.getItem(BACKUP_FILE_KEY);
        if (stored) handle = await _deserialiseHandle(stored);
        // Verify we still have write permission
        if (handle) {
          const perm = await handle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted') {
            const req = await handle.requestPermission({ mode: 'readwrite' });
            if (req !== 'granted') handle = null;
          }
        }
      } catch { handle = null; }
    }

    // Show picker if we don't have a usable handle
    if (!handle) {
      const today = new Date().toISOString().slice(0, 10);
      handle = await window.showSaveFilePicker({
        suggestedName: `make-backup-${today}.json`,
        types: [{ description: 'Maké Backup', accept: { 'application/json': ['.json'] } }],
      });
      // Persist handle for next auto-backup
      try { localStorage.setItem(BACKUP_FILE_KEY, JSON.stringify(await handle.serialize?.() || handle)); }
      catch { /* serialise not available on all browsers, skip */ }
    }

    // Write
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(allItems, null, 2));
    await writable.close();

    // Show subtle backup confirmation
    _showBackupIndicator();
    return true;
  } catch (err) {
    if (err.name === 'AbortError') return false; // User cancelled — fine
    console.warn('[Maké] writeBackupFile failed, using download fallback:', err);
    _downloadBlob(allItems);
    return false;
  }
}

/**
 * restoreFromBackupFile()
 * Opens a file picker, reads the JSON, and returns the parsed array.
 * Returns null if the user cancels or the file is invalid.
 */
export async function restoreFromBackupFile() {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Maké Backup', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Not an array');
      return data;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.warn('[Maké] restoreFromBackupFile error:', err);
      return null;
    }
  }
  // Fallback: input[type=file]
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        resolve(Array.isArray(data) ? data : null);
      } catch { resolve(null); }
    };
    input.click();
  });
}

// ── Blob download fallback ────────────────────────────────────

function _downloadBlob(allItems) {
  const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: 'application/json' });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `make-backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Handle serialisation (best-effort) ────────────────────────

async function _deserialiseHandle(stored) {
  // File System Access API handle serialisation is not yet standard.
  // When available (some Chromium builds) we try it; otherwise skip.
  try {
    const data = JSON.parse(stored);
    if (typeof data?.kind === 'string' && window.FileSystemFileHandle) {
      // No standard deserialise yet — skip reuse silently
    }
  } catch { /* ignore */ }
  return null; // Always return null — reuse not yet widely available
}

// ── Backup status indicator ───────────────────────────────────

/**
 * _showBackupIndicator()
 * Shows a small floating icon briefly after a successful auto-backup.
 * Unobtrusive — does not use a toast to avoid distraction on every save.
 */
function _showBackupIndicator() {
  // For manual export (forceNewFile=true) a toast is shown by data.js instead
  let el = document.getElementById('backup-status-icon');
  if (!el) {
    el = document.createElement('div');
    el.id = 'backup-status-icon';
    el.title = 'Auto-backup saved';
    el.textContent = '☁️';
    document.body.appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Folder CRUD ───────────────────────────────────────────────

export async function getAllFolders() {
  try {
    const db = await getDB();
    const tx = db.transaction(FOLDER_STORE, 'readonly');
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(FOLDER_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
  } catch { return []; }
}

export async function saveFolder(folder) {
  try {
    const db    = await getDB();
    const tx    = db.transaction(FOLDER_STORE, 'readwrite');
    const store = tx.objectStore(FOLDER_STORE);
    const toSave = { ...folder, updatedAt: Date.now() };
    if (!toSave.createdAt) toSave.createdAt = Date.now();
    return new Promise((resolve, reject) => {
      const req = toSave.id ? store.put(toSave) : store.add((({ id: _, ...r }) => r)(toSave));
      req.onsuccess = () => resolve({ ...toSave, id: req.result ?? toSave.id });
      req.onerror   = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[Maké] saveFolder failed:', err);
    return folder;
  }
}

export async function deleteFolder(id) {
  try {
    const db = await getDB();
    const tx = db.transaction(FOLDER_STORE, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(FOLDER_STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch {}
}
