/**
 * MAKÉ CORE — state.js (V2)
 * Reactive state store.
 * - ambientEnabled persisted to localStorage (was lost on refresh in V1)
 * - sortField / sortDir / viewMode added for Samsung Notes-derived features
 * - Surgical mutation helpers so render() does minimal DOM work
 */

import { getAllItems } from './storage.js';

const PREFS_KEY = 'make_prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
  catch { return {}; }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
  catch { /* storage full, ignore */ }
}

const prefs = loadPrefs();

export const state = {
  _data: {
    backgroundItems:  [],
    stickyItems:      [],
    currentTab:       prefs.currentTab       || 'notes',
    showAddMenu:      false,
    ambientEnabled:   prefs.ambientEnabled   ?? false,
    sortField:        prefs.sortField        || 'updatedAt',
    sortDir:          prefs.sortDir          || 'desc',
    viewMode:         prefs.viewMode         || 'grid',
  },
  _listeners: [],

  // ── Getters / setters with auto-notify ──
  get backgroundItems()  { return this._data.backgroundItems; },
  set backgroundItems(v) { this._data.backgroundItems = v; this._notify(); },

  get stickyItems()  { return this._data.stickyItems; },
  set stickyItems(v) { this._data.stickyItems = v; this._notify(); },

  get currentTab()  { return this._data.currentTab; },
  set currentTab(v) {
    this._data.currentTab = v;
    savePrefs({ ...loadPrefs(), currentTab: v });
    this._notify();
  },

  get showAddMenu()  { return this._data.showAddMenu; },
  set showAddMenu(v) { this._data.showAddMenu = v; this._notify(); },

  get ambientEnabled()  { return this._data.ambientEnabled; },
  set ambientEnabled(v) {
    this._data.ambientEnabled = v;
    savePrefs({ ...loadPrefs(), ambientEnabled: v });
    this._notify();
  },

  get sortField()  { return this._data.sortField; },
  set sortField(v) {
    this._data.sortField = v;
    savePrefs({ ...loadPrefs(), sortField: v });
    this._notify();
  },

  get sortDir()  { return this._data.sortDir; },
  set sortDir(v) {
    this._data.sortDir = v;
    savePrefs({ ...loadPrefs(), sortDir: v });
    this._notify();
  },

  get viewMode()  { return this._data.viewMode; },
  set viewMode(v) {
    this._data.viewMode = v;
    savePrefs({ ...loadPrefs(), viewMode: v });
    this._notify();
  },


  subscribe(cb) { this._listeners.push(cb); },

  _notify() { this._listeners.forEach(fn => fn()); },
};

/** Load all items from IndexedDB, split by layer. */
export async function loadInitialData() {
  try {
    const all = await getAllItems();
    state._data.backgroundItems = all.filter(i => i.layer === 'background');
    state._data.stickyItems     = all.filter(i => i.layer === 'sticky');
    state._notify();
  } catch (err) {
    console.error('[Maké] Failed to load data:', err);
    state._data.backgroundItems = [];
    state._data.stickyItems     = [];
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
