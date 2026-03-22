/**
 * MAKÉ CORE — state.js (V3)
 * Reactive state store.
 *
 * Changes from V2:
 *   - FIX: filterFavourites is now a proper getter/setter persisted to
 *     localStorage instead of a raw _data mutation.  Refresh no longer
 *     resets the favourites filter.
 */

import { getAllItems, getAllFolders } from './storage.js';

const PREFS_KEY = 'make_prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
  catch { return {}; }
}

function savePrefs(patch) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch })); }
  catch { /* storage full, ignore */ }
}

const prefs = loadPrefs();

export const state = {
  _data: {
    backgroundItems:  [],
    stickyItems:      [],
    folders:          [],          // [{id, name, color, createdAt}]
    activeFolder:     null,        // null = show all (no folder filter)
    currentTab:       prefs.currentTab       || 'notes',
    showAddMenu:      false,
    ambientEnabled:   prefs.ambientEnabled   ?? false,
    filterFavourites: prefs.filterFavourites ?? false,
    sortField:        prefs.sortField        || 'updatedAt',
    sortDir:          prefs.sortDir          || 'desc',
    viewMode:         prefs.viewMode         || 'grid',
  },
  _listeners: [],

  // ── Getters / setters with auto-notify ──────────────────────

  get backgroundItems()  { return this._data.backgroundItems; },
  set backgroundItems(v) { this._data.backgroundItems = v; this._notify(); },

  get stickyItems()  { return this._data.stickyItems; },
  set stickyItems(v) { this._data.stickyItems = v; this._notify(); },

  get folders()  { return this._data.folders; },
  set folders(v) { this._data.folders = v; this._notify(); },

  get activeFolder()  { return this._data.activeFolder; },
  set activeFolder(v) { this._data.activeFolder = v; this._notify(); },

  get currentTab()  { return this._data.currentTab; },
  set currentTab(v) { this._data.currentTab = v; savePrefs({ currentTab: v }); this._notify(); },

  get showAddMenu()  { return this._data.showAddMenu; },
  set showAddMenu(v) { this._data.showAddMenu = v; this._notify(); },

  get ambientEnabled()  { return this._data.ambientEnabled; },
  set ambientEnabled(v) { this._data.ambientEnabled = v; savePrefs({ ambientEnabled: v }); this._notify(); },

  get filterFavourites()  { return this._data.filterFavourites; },
  set filterFavourites(v) { this._data.filterFavourites = v; savePrefs({ filterFavourites: v }); this._notify(); },

  get sortField()  { return this._data.sortField; },
  set sortField(v) { this._data.sortField = v; savePrefs({ sortField: v }); this._notify(); },

  get sortDir()  { return this._data.sortDir; },
  set sortDir(v) { this._data.sortDir = v; savePrefs({ sortDir: v }); this._notify(); },

  get viewMode()  { return this._data.viewMode; },
  set viewMode(v) { this._data.viewMode = v; savePrefs({ viewMode: v }); this._notify(); },

  subscribe(cb) { this._listeners.push(cb); },
  _notify()     { this._listeners.forEach(fn => fn()); },
};

/** Load all items from IndexedDB, split by layer. */
export async function loadInitialData() {
  try {
    const [all, folders] = await Promise.all([getAllItems(), getAllFolders()]);
    state._data.backgroundItems = all.filter(i => i.layer === 'background');
    state._data.stickyItems     = all.filter(i => i.layer === 'sticky');
    state._data.folders         = folders;
    state._notify();
  } catch (err) {
    console.error('[Maké] Failed to load data:', err);
    state._data.backgroundItems = [];
    state._data.stickyItems     = [];
    state._data.folders         = [];
    state._notify();
  }
}

/** Mutate state in-place after saving an item (avoids full DB reload). */
export function upsertItemInState(savedItem) {
  if (savedItem.layer === 'sticky') {
    const idx = state._data.stickyItems.findIndex(i => i.id === savedItem.id);
    if (idx >= 0) state._data.stickyItems[idx] = savedItem;
    else          state._data.stickyItems = [...state._data.stickyItems, savedItem];
  } else {
    const idx = state._data.backgroundItems.findIndex(i => i.id === savedItem.id);
    if (idx >= 0) state._data.backgroundItems[idx] = savedItem;
    else          state._data.backgroundItems = [...state._data.backgroundItems, savedItem];
  }
  state._notify();
}

/** Remove an item from state by id. */
export function removeItemFromState(id) {
  state._data.backgroundItems = state._data.backgroundItems.filter(i => i.id !== id);
  state._data.stickyItems     = state._data.stickyItems.filter(i => i.id !== id);
  state._notify();
}
