/**
 * MAKÉ — app.js (V2)
 *
 * Key improvements over V1:
 * - Sticky notes rendered in a SEPARATE persistent layer — never wiped on tab change
 * - Surgical card grid updates (patch in-place, don't trash + rebuild)
 * - upsertItemInState / removeItemFromState — no full DB reload after mutations
 * - ambientEnabled persisted to localStorage via state.js
 * - Modal factory: one createModal(config) handles all types
 * - Context menu on card long-press (Samsung Notes-derived NoteActions)
 * - Sort toolbar (date modified / created / title + asc/desc)
 * - Search overlay (filter by type + time + free text)
 * - Tag parsing (#hashtag) from note content
 * - Favorite heart on card meta bar
 * - Duplicate action
 * - Fixed: escapeHTML never used inside textarea innerHTML
 * - Fixed: ambientEnabled undefined → now in state._data
 */

import { state, loadInitialData, upsertItemInState, removeItemFromState } from './core/state.js';
import { saveItem, deleteItem, updateItemPosition } from './core/storage.js';
import { createItem, ItemType, ItemLayer } from './core/schema.js';
import { makeDraggable }  from './utils/drag.js';
import { makeResizable }  from './utils/resize.js';

// ─── DOM REFS ─────────────────────────────────────────────────
const app = document.getElementById('app');

// Sticky-layer drag/resize cleanup maps — persisted across renders
const dragCleanups   = new Map();
const resizeCleanups = new Map();

let ambientInterval = null;

// ─── STICKY COLORS (Samsung Notes authentic) ──────────────────
const STICKY_COLORS = [
  { bg: '#ffe6ae', shadow: 'rgba(252,223,156,0.55)' },
  { bg: '#dbf0e4', shadow: 'rgba(197,237,214,0.55)' },
  { bg: '#d0e0f4', shadow: 'rgba(196,217,244,0.55)' },
  { bg: '#f4ddd9', shadow: 'rgba(243,210,204,0.55)' },
];

// ─── BOOT ─────────────────────────────────────────────────────
async function init() {
  app.innerHTML = `
    <div class="make-loading" id="loading-state">
      <div class="make-loading-spinner"></div>
      <span>Loading Maké…</span>
    </div>`;

  await loadInitialData();
  document.getElementById('loading-state')?.remove();

  buildShell();
  renderCards();
  renderStickies();
  attachShellListeners();

  state.subscribe(() => {
    renderCards();
    syncAddMenu();
    syncAmbientToggle();
  });

  initAmbient();
}

// ─── SHELL BUILD (once) ───────────────────────────────────────
// The shell is built once and never torn down. Only the card grid
// and the add-menu visibility change on state updates.
function buildShell() {
  app.innerHTML = `
    <div class="app-header">
      <div class="header-row">
        <div class="header-widget" aria-hidden="true">
          <div class="header-widget-bar" style="width:65%"></div>
          <div class="header-widget-bar" style="width:82%"></div>
          <div class="header-widget-bar" style="width:50%"></div>
        </div>
        <button class="ambient-toggle-wrap" id="ambient-toggle" aria-label="Toggle ambient sorting">
          <div class="toggle-track ${state.ambientEnabled ? 'on' : ''}" id="toggle-track">
            <div class="toggle-knob"></div>
          </div>
        </button>
      </div>
      <h1 class="app-title">Maké</h1>
      <p class="app-subtitle">Your personal command center</p>
    </div>

    <div class="section-divider" aria-hidden="true">
      <div class="divider-line"></div>
      <div class="divider-line" style="width:70px"></div>
      <div class="divider-line" style="width:50px"></div>
    </div>

    <div class="toolbar-actions">
      <button class="toolbar-menu-btn" id="sort-btn" title="Sort" aria-label="Sort notes">
        <svg viewBox="0 0 24 24"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
      </button>
      <button class="toolbar-menu-btn" id="search-btn" title="Search" aria-label="Search notes">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </button>
    </div>

    <div class="canvas">
      <div class="grid-layer" id="grid-layer">
        <div class="grid" id="grid-container" data-view-mode="${state.viewMode}"></div>
      </div>
      <div class="sticky-layer" id="sticky-layer"></div>
    </div>

    <div class="add-menu hidden" id="add-menu">
      <button data-type="note"  class="add-menu-item">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>New Note</span>
      </button>
      <button data-type="code"  class="add-menu-item">
        <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        <span>Code Snippet</span>
      </button>
      <button data-type="link"  class="add-menu-item">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        <span>Add Link</span>
      </button>
      <button data-type="sticky" class="add-menu-item">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <span>Sticky Note</span>
      </button>
    </div>

    <nav class="bottom-nav" role="navigation" aria-label="Main navigation">
      <button class="nav-btn ${state.currentTab === 'links' ? 'active' : ''}" data-tab="links" aria-label="Links">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      </button>
      <button class="nav-btn ${state.currentTab === 'notes' ? 'active' : ''}" data-tab="notes" aria-label="Notes">
        <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      </button>
      <button class="nav-btn-fab" id="fab" aria-label="Add item">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="nav-btn ${state.currentTab === 'code' ? 'active' : ''}" data-tab="code" aria-label="Code">
        <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </button>
      <button class="nav-btn" id="settings-btn" aria-label="Settings">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>
    </nav>
  `;
}

// ─── CARD RENDER (updates only) ───────────────────────────────
function getFilteredItems() {
  const all = state.backgroundItems;
  const tab = state.currentTab;

  let filtered = all.filter(item => {
    if (tab === 'notes') return item.type === ItemType.NOTE;
    if (tab === 'code')  return item.type === ItemType.CODE;
    if (tab === 'links') return item.type === ItemType.LINK;
    return true;
  });

  // Sort
  const field = state.sortField;
  const dir   = state.sortDir;

  filtered = [...filtered].sort((a, b) => {
    let aV, bV;
    if (field === 'title') {
      aV = (a.title || '').toLowerCase();
      bV = (b.title || '').toLowerCase();
      return dir === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
    }
    aV = (field === 'createdAt' ? a.createdAt : a.updatedAt) || 0;
    bV = (field === 'createdAt' ? b.createdAt : b.updatedAt) || 0;
    return dir === 'asc' ? aV - bV : bV - aV;
  });

  return filtered;
}

function renderCards() {
  const grid = document.getElementById('grid-container');
  if (!grid) return;

  // Update active nav tabs
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.currentTab);
  });

  const items = getFilteredItems();

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          ${emptyIcon(state.currentTab)}
        </div>
        <p class="empty-title">No ${state.currentTab} yet</p>
        <p class="empty-hint">Tap <strong>+</strong> to add your first ${
          state.currentTab === 'notes' ? 'note'
          : state.currentTab === 'code' ? 'code snippet'
          : 'link'}</p>
      </div>`;
    return;
  }

  // Build a keyed map of existing card DOM nodes
  const existing = new Map();
  grid.querySelectorAll('.card[data-id]').forEach(el =>
    existing.set(parseInt(el.dataset.id), el)
  );

  // Build a fragment in correct sort order
  const frag = document.createDocumentFragment();
  items.forEach((item, i) => {
    let el = existing.get(item.id);
    if (!el) {
      el = createCardEl(item);
      el.style.animationDelay = `${i * 30}ms`;
      el.classList.add('card-animate-in');
    } else {
      // Patch content without destroying the node
      patchCardEl(el, item);
    }
    frag.appendChild(el);
  });

  grid.innerHTML = '';
  grid.appendChild(frag);
  grid.dataset.viewMode = state.viewMode;

  // Attach card event listeners
  attachCardListeners();
}

function createCardEl(item) {
  const el = document.createElement('div');
  el.className    = 'card';
  el.dataset.id   = item.id;
  el.dataset.type = item.type;
  el.innerHTML    = cardInnerHTML(item);
  return el;
}

function patchCardEl(el, item) {
  el.dataset.type = item.type;
  el.innerHTML    = cardInnerHTML(item);
}

function cardInnerHTML(item) {
  const preview = getPreview(item);
  const tags    = item.tags?.length
    ? `<div class="card-tags">${item.tags.map(t => `<span class="tag-chip">${escHTML(t)}</span>`).join('')}</div>`
    : '';
  const date    = item.updatedAt
    ? formatDate(item.updatedAt)
    : '';

  const typeIcon = item.type === 'note'  ? iconNote()
                 : item.type === 'code'  ? iconCode()
                 : iconLink();

  const favClass = item.isFavorited ? 'active' : '';

  return `
    <div class="card-header">
      <div class="card-type-badge">${typeIcon}</div>
      <span class="card-type-label">${item.type === 'note' ? 'Note' : item.type === 'code' ? 'Code' : 'Link'}: ${escHTML(item.title || 'Untitled')}</span>
    </div>
    <div class="card-content">${escHTML(preview)}</div>
    ${tags}
    <div class="card-meta">
      <span class="card-meta-time">${date}</span>
      <button class="card-fav ${favClass}" data-id="${item.id}" aria-label="${item.isFavorited ? 'Unfavorite' : 'Favorite'}">
        <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </button>
    </div>
  `;
}

function getPreview(item) {
  const raw = item.content || item.code || item.url || '';
  return raw.length > 180 ? raw.slice(0, 180) + '…' : raw;
}

// ─── STICKY RENDER (separate persistent layer) ────────────────
function renderStickies() {
  const layer = document.getElementById('sticky-layer');
  if (!layer) return;

  // Build keyed map of existing stickies
  const existing = new Map();
  layer.querySelectorAll('.sticky-note[data-id]').forEach(el =>
    existing.set(parseInt(el.dataset.id), el)
  );

  // Remove stickies that are no longer in state
  const stateIds = new Set(state.stickyItems.map(i => i.id));
  existing.forEach((el, id) => { if (!stateIds.has(id)) el.remove(); });

  // Add or update
  state.stickyItems.forEach(item => {
    let el = existing.get(item.id);
    if (!el) {
      el = createStickyEl(item);
      layer.appendChild(el);
      attachStickyBehaviour(el, item);

      // Entrance animation
      requestAnimationFrame(() => el.classList.add('sticky-dropped'));
    } else {
      // Patch color/rotation if changed
      el.style.backgroundColor = item.color || STICKY_COLORS[0].bg;
      el.style.setProperty('--sticky-r', `${item.rotation || 0}deg`);
    }
  });
}

function createStickyEl(item) {
  const x   = item.position?.x   || (60  + Math.random() * 100);
  const y   = item.position?.y   || (40  + Math.random() * 80);
  const w   = item.position?.width  || 160;
  const h   = item.position?.height || 130;
  const rot = item.rotation || 0;

  const el = document.createElement('div');
  el.className  = 'sticky-note';
  el.dataset.id = item.id;
  el.style.left   = `${x}px`;
  el.style.top    = `${y}px`;
  el.style.width  = `${w}px`;
  el.style.height = `${h}px`;
  el.style.backgroundColor = item.color || STICKY_COLORS[0].bg;
  el.style.setProperty('--sticky-r', `${rot}deg`);
  el.style.transform = `rotate(${rot}deg)`;

  el.innerHTML = `
    <div class="sticky-header">
      <button class="sticky-delete" aria-label="Delete sticky">✕</button>
    </div>
    <textarea placeholder="Write something…" aria-label="Sticky note text">${escHTML(item.text || '')}</textarea>
    <div class="resize-handle-corner"></div>
  `;

  return el;
}

function attachStickyBehaviour(el, item) {
  const id = item.id;

  // Delete
  el.querySelector('.sticky-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    el.classList.add('sticky-deleting');
    setTimeout(async () => {
      await deleteItem(id);
      removeItemFromState(id);
      el.remove();
    }, 200);
  });

  // Textarea autosave (debounced)
  const ta = el.querySelector('textarea');
  let saveTimer;
  ta.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const found = state.stickyItems.find(i => i.id === id);
      if (found) {
        found.text = ta.value;
        const saved = await saveItem(found);
        upsertItemInState(saved);
      }
    }, 600);
  });

  // Drag
  const dragCleanup = makeDraggable(el, null, null, async (left, top) => {
    await updateItemPosition(id, {
      x: left, y: top,
      width:  parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    });
  });
  dragCleanups.set(id, dragCleanup);

  // Resize
  const resizeCleanup = makeResizable(el, null, null, async (width, height) => {
    await updateItemPosition(id, {
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
      width, height,
    });
  });
  resizeCleanups.set(`r${id}`, resizeCleanup);
}

// ─── SHELL EVENT LISTENERS ────────────────────────────────────
function attachShellListeners() {
  // Nav tabs
  app.addEventListener('click', (e) => {
    const tab = e.target.closest('.nav-btn[data-tab]');
    if (tab) { state.currentTab = tab.dataset.tab; return; }

    // FAB
    if (e.target.closest('#fab')) {
      state.showAddMenu = !state.showAddMenu;
      return;
    }

    // Close add menu on outside click
    if (state.showAddMenu && !e.target.closest('#add-menu') && !e.target.closest('#fab')) {
      state.showAddMenu = false;
    }
  });

  // Add menu items
  document.getElementById('add-menu').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    const type = btn.dataset.type;
    state.showAddMenu = false;
    if (type === 'sticky') showStickyModal();
    else showCreateModal(type);
  });

  // Ambient toggle
  document.getElementById('ambient-toggle').addEventListener('click', () => {
    state.ambientEnabled = !state.ambientEnabled;
    if (state.ambientEnabled) startAmbient();
    else stopAmbient();
    syncAmbientToggle();
  });

  // Sort button
  document.getElementById('sort-btn').addEventListener('click', showSortMenu);

  // Search button
  document.getElementById('search-btn').addEventListener('click', showSearch);

  // Settings
  document.getElementById('settings-btn').addEventListener('click', showSettingsModal);
}

function attachCardListeners() {
  document.querySelectorAll('.card[data-id]').forEach(card => {
    // Click = edit
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-fav')) return;
      const id   = parseInt(card.dataset.id);
      const item = state.backgroundItems.find(i => i.id === id);
      if (item) showEditModal(item);
    });

    // Long-press / contextmenu = context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id   = parseInt(card.dataset.id);
      const item = state.backgroundItems.find(i => i.id === id);
      if (item) showContextMenu(e, item);
    });

    let pressTimer;
    card.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        const id   = parseInt(card.dataset.id);
        const item = state.backgroundItems.find(i => i.id === id);
        if (item) showContextMenu(e.touches[0], item);
      }, 500);
    }, { passive: true });
    card.addEventListener('touchend',   () => clearTimeout(pressTimer));
    card.addEventListener('touchmove',  () => clearTimeout(pressTimer));
  });

  // Favorite toggle
  document.querySelectorAll('.card-fav').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id   = parseInt(btn.dataset.id);
      const item = state.backgroundItems.find(i => i.id === id);
      if (!item) return;
      item.isFavorited = !item.isFavorited;
      const saved = await saveItem(item);
      upsertItemInState(saved);
    });
  });
}

function syncAddMenu() {
  const menu = document.getElementById('add-menu');
  if (menu) menu.classList.toggle('hidden', !state.showAddMenu);
}

function syncAmbientToggle() {
  const track = document.getElementById('toggle-track');
  if (track) track.classList.toggle('on', state.ambientEnabled);
}

// ─── CONTEXT MENU ─────────────────────────────────────────────
function showContextMenu(evt, item) {
  document.getElementById('context-menu-overlay')?.remove();
  document.getElementById('context-menu')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'context-menu-overlay';
  overlay.className = 'context-menu-overlay';

  const menu = document.createElement('div');
  menu.id        = 'context-menu';
  menu.className = 'context-menu';

  const actions = [
    { label: item.isFavorited ? '♡ Unfavorite' : '♡ Favorite', action: 'favorite' },
    { label: '⎘ Duplicate', action: 'duplicate' },
    { label: '✎ Edit', action: 'edit' },
    { divider: true },
    { label: '⌦ Delete', action: 'delete', destructive: true },
  ];

  menu.innerHTML = actions.map(a =>
    a.divider
      ? `<div class="context-menu-divider"></div>`
      : `<button class="context-menu-item ${a.destructive ? 'destructive' : ''}" data-action="${a.action}">${a.label}</button>`
  ).join('');

  // Position near tap/click
  const x = evt.clientX || evt.pageX || window.innerWidth / 2;
  const y = evt.clientY || evt.pageY || window.innerHeight / 2;
  menu.style.left = `${Math.min(x, window.innerWidth  - 220)}px`;
  menu.style.top  = `${Math.min(y, window.innerHeight - 200)}px`;

  document.body.appendChild(overlay);
  document.body.appendChild(menu);

  const dismiss = () => { overlay.remove(); menu.remove(); };
  overlay.addEventListener('click', dismiss);

  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      dismiss();
      const action = btn.dataset.action;
      if (action === 'edit') {
        showEditModal(item);
      } else if (action === 'favorite') {
        item.isFavorited = !item.isFavorited;
        const saved = await saveItem(item);
        upsertItemInState(saved);
      } else if (action === 'duplicate') {
        const dup = createItem({ ...item, id: undefined, title: (item.title || 'Untitled') + ' copy', createdAt: undefined });
        const saved = await saveItem(dup);
        upsertItemInState(saved);
        showToast('Duplicated');
      } else if (action === 'delete') {
        await deleteItem(item.id);
        removeItemFromState(item.id);
      }
    });
  });
}

// ─── SORT MENU ────────────────────────────────────────────────
function showSortMenu() {
  if (document.getElementById('sort-menu')) {
    document.getElementById('sort-menu')?.remove();
    return;
  }

  const sortBtn = document.getElementById('sort-btn');
  const rect    = sortBtn.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.id        = 'sort-menu';
  menu.className = 'sort-menu-popup';
  menu.style.top  = `${rect.bottom + 6}px`;
  menu.style.left = `${rect.left}px`;

  const fields = [
    { field: 'updatedAt',  label: 'Date modified' },
    { field: 'createdAt',  label: 'Date created' },
    { field: 'title',      label: 'Title' },
  ];

  menu.innerHTML = `
    <div class="sort-menu-section-label">Sort by</div>
    ${fields.map(f => `
      <button class="sort-menu-item ${state.sortField === f.field ? 'active' : ''}" data-sort="${f.field}">
        <span>${f.label}</span>
        ${state.sortField === f.field
          ? `<span class="sort-dir-indicator">${state.sortDir === 'desc' ? '↓' : '↑'}</span>`
          : ''}
      </button>
    `).join('')}
  `;

  document.body.appendChild(menu);

  const dismiss = (e) => {
    if (!menu.contains(e.target) && e.target !== sortBtn) {
      menu.remove();
      document.removeEventListener('click', dismiss);
    }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 50);

  menu.querySelectorAll('.sort-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.sort;
      if (field === state.sortField) {
        state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        state.sortField = field;
        state.sortDir   = 'desc';
      }
      menu.remove();
    });
  });
}

// ─── SEARCH ───────────────────────────────────────────────────
function showSearch() {
  if (document.getElementById('search-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id        = 'search-overlay';
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-bar">
      <button class="search-cancel-btn" id="search-cancel">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <input id="search-input" type="text" placeholder="Search notes, code, links…" autocomplete="off" autofocus>
    </div>
    <div class="search-filter-chips" id="search-chips">
      <button class="search-filter-chip" data-type="note">Notes</button>
      <button class="search-filter-chip" data-type="code">Code</button>
      <button class="search-filter-chip" data-type="link">Links</button>
      <button class="search-filter-chip" data-time="86400000">Today</button>
      <button class="search-filter-chip" data-time="604800000">This week</button>
    </div>
    <div class="search-results" id="search-results">
      <div class="search-hint">Start typing to search…</div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const input = overlay.querySelector('#search-input');
  input.focus();

  let activeType = null, activeTime = null;

  function runSearch() {
    const q     = input.value.trim().toLowerCase();
    const now   = Date.now();
    const items = state.backgroundItems;

    let results = items;

    if (activeType) results = results.filter(i => i.type === activeType);
    if (activeTime) results = results.filter(i => (i.createdAt || 0) >= now - activeTime);
    if (q) results = results.filter(i =>
      (i.title   || '').toLowerCase().includes(q) ||
      (i.content || '').toLowerCase().includes(q) ||
      (i.code    || '').toLowerCase().includes(q) ||
      (i.url     || '').toLowerCase().includes(q) ||
      (i.tags    || []).some(t => t.toLowerCase().includes(q))
    );

    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    if (!q && !activeType && !activeTime) {
      resultsEl.innerHTML = '<div class="search-hint">Start typing to search…</div>';
      return;
    }

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty-msg">No results found</div>';
      return;
    }

    resultsEl.innerHTML = results.map(item => `
      <div class="card search-result-card" data-id="${item.id}" data-type="${item.type}">
        <div class="card-header">
          <span class="card-type-label">${item.type}: ${escHTML(item.title || 'Untitled')}</span>
        </div>
        <div class="card-content">${escHTML(getPreview(item))}</div>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.card[data-id]').forEach(card => {
      card.addEventListener('click', () => {
        const id   = parseInt(card.dataset.id);
        const item = state.backgroundItems.find(i => i.id === id);
        if (item) { closeSearch(); showEditModal(item); }
      });
    });
  }

  function closeSearch() {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
  }

  input.addEventListener('input', runSearch);

  overlay.querySelectorAll('.search-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.dataset.type) {
        chip.classList.toggle('active');
        activeType = chip.classList.contains('active') ? chip.dataset.type : null;
        overlay.querySelectorAll('.search-filter-chip[data-type]').forEach(c => {
          if (c !== chip) c.classList.remove('active');
        });
        if (!chip.classList.contains('active')) activeType = null;
      } else if (chip.dataset.time) {
        chip.classList.toggle('active');
        activeTime = chip.classList.contains('active') ? parseInt(chip.dataset.time) : null;
        overlay.querySelectorAll('.search-filter-chip[data-time]').forEach(c => {
          if (c !== chip) c.classList.remove('active');
        });
        if (!chip.classList.contains('active')) activeTime = null;
      }
      runSearch();
    });
  });

  document.getElementById('search-cancel').addEventListener('click', closeSearch);
}

// ─── MODAL FACTORY ────────────────────────────────────────────
// One function handles create + edit. No more 3× repeated modal code.
function openModal({ title, fields, actions, onReady }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id        = 'modal-overlay';

  const fieldHTML = fields.map(f => {
    if (f.type === 'input')    return `<input  id="${f.id}" class="modal-input"    placeholder="${f.placeholder || ''}" value="${escHTML(f.value || '')}">`;
    if (f.type === 'textarea') return `<textarea id="${f.id}" class="modal-textarea" placeholder="${f.placeholder || ''}" rows="${f.rows || 6}">${escHTML(f.value || '')}</textarea>`;
    if (f.type === 'select')   return `<select id="${f.id}" class="modal-select">${f.options.map(o => `<option value="${o.value}" ${o.value === f.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`;
    if (f.type === 'colorpicker') return buildColorSwatchHTML(f.value || STICKY_COLORS[0].bg, f.id);
    return '';
  }).join('');

  const actionsHTML = actions.map(a =>
    `<button id="${a.id}" class="modal-btn ${a.primary ? 'primary' : a.danger ? 'danger' : ''}">${a.label}</button>`
  ).join('');

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-label="${title}">
      <h3 class="modal-title">${title}</h3>
      <div class="modal-content">${fieldHTML}</div>
      <div class="modal-actions">${actionsHTML}</div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  if (onReady) onReady(overlay, close);
  return { overlay, close };
}

// ─── CREATE MODAL ─────────────────────────────────────────────
function showCreateModal(type) {
  const configs = {
    note: {
      title: 'New Note',
      fields: [
        { type: 'input',    id: 'f-title',   placeholder: 'Title' },
        { type: 'textarea', id: 'f-content', placeholder: 'Content…', rows: 7 },
      ],
    },
    code: {
      title: 'New Code Snippet',
      fields: [
        { type: 'input',    id: 'f-title',    placeholder: 'Title' },
        { type: 'textarea', id: 'f-code',     placeholder: 'Paste your code…', rows: 8 },
        { type: 'select',   id: 'f-lang',     value: 'javascript',
          options: ['javascript','python','html','css','typescript','bash','json'].map(l => ({ value: l, label: l })) },
      ],
    },
    link: {
      title: 'Add Link',
      fields: [
        { type: 'input', id: 'f-url',   placeholder: 'https://…' },
        { type: 'input', id: 'f-title', placeholder: 'Label (optional)' },
      ],
    },
  };

  const { fields, title } = configs[type];

  openModal({
    title,
    fields,
    actions: [
      { id: 'modal-cancel', label: 'Cancel' },
      { id: 'modal-save',   label: 'Save', primary: true },
    ],
    onReady: (overlay, close) => {
      overlay.querySelector('#modal-cancel').addEventListener('click', close);
      overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const item = createItem({ layer: ItemLayer.BACKGROUND, type });
        if (type === 'note') {
          item.title   = overlay.querySelector('#f-title')?.value   || '';
          item.content = overlay.querySelector('#f-content')?.value || '';
          item.tags    = parseTagsFromText(item.content);
        } else if (type === 'code') {
          item.title    = overlay.querySelector('#f-title')?.value || '';
          item.code     = overlay.querySelector('#f-code')?.value  || '';
          item.language = overlay.querySelector('#f-lang')?.value  || 'javascript';
        } else if (type === 'link') {
          item.url   = overlay.querySelector('#f-url')?.value   || '';
          item.title = overlay.querySelector('#f-title')?.value || '';
        }
        if (item.title || item.content || item.code || item.url) {
          const saved = await saveItem(item);
          upsertItemInState(saved);
        }
        close();
      });
    },
  });
}

// ─── EDIT MODAL ───────────────────────────────────────────────
function showEditModal(item) {
  const cfgMap = {
    note: {
      title:  'Edit Note',
      fields: [
        { type: 'input',    id: 'f-title',   placeholder: 'Title',    value: item.title || '' },
        { type: 'textarea', id: 'f-content', placeholder: 'Content…', value: item.content || '', rows: 7 },
      ],
      collect: (overlay) => ({
        title:   overlay.querySelector('#f-title')?.value   || '',
        content: overlay.querySelector('#f-content')?.value || '',
        tags:    parseTagsFromText(overlay.querySelector('#f-content')?.value || ''),
      }),
    },
    code: {
      title:  'Edit Code',
      fields: [
        { type: 'input',    id: 'f-title', placeholder: 'Title', value: item.title || '' },
        { type: 'textarea', id: 'f-code',  placeholder: 'Code…', value: item.code  || '', rows: 8 },
        { type: 'select',   id: 'f-lang',  value: item.language || 'javascript',
          options: ['javascript','python','html','css','typescript','bash','json'].map(l => ({ value: l, label: l })) },
      ],
      collect: (overlay) => ({
        title:    overlay.querySelector('#f-title')?.value || '',
        code:     overlay.querySelector('#f-code')?.value  || '',
        language: overlay.querySelector('#f-lang')?.value  || 'javascript',
      }),
    },
    link: {
      title:  'Edit Link',
      fields: [
        { type: 'input', id: 'f-url',   placeholder: 'https://…',         value: item.url   || '' },
        { type: 'input', id: 'f-title', placeholder: 'Label (optional)',   value: item.title || '' },
      ],
      collect: (overlay) => ({
        url:   overlay.querySelector('#f-url')?.value   || '',
        title: overlay.querySelector('#f-title')?.value || '',
      }),
    },
  };

  const cfg = cfgMap[item.type];
  if (!cfg) return;

  openModal({
    title: cfg.title,
    fields: cfg.fields,
    actions: [
      { id: 'modal-delete', label: 'Delete', danger: true },
      { id: 'modal-cancel', label: 'Cancel' },
      { id: 'modal-save',   label: 'Save',   primary: true },
    ],
    onReady: (overlay, close) => {
      overlay.querySelector('#modal-cancel').addEventListener('click', close);

      overlay.querySelector('#modal-delete').addEventListener('click', async () => {
        await deleteItem(item.id);
        removeItemFromState(item.id);
        close();
      });

      overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const updates = cfg.collect(overlay);
        const updated = { ...item, ...updates };
        const saved   = await saveItem(updated);
        upsertItemInState(saved);
        close();
      });
    },
  });
}

// ─── STICKY MODAL ─────────────────────────────────────────────
function showStickyModal() {
  let selectedColor = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)].bg;

  openModal({
    title:  'New Sticky',
    fields: [
      { type: 'textarea',    id: 'f-text',   placeholder: 'Write something…', rows: 4 },
      { type: 'colorpicker', id: 'f-color',  value: selectedColor },
    ],
    actions: [
      { id: 'modal-cancel', label: 'Cancel' },
      { id: 'modal-save',   label: 'Add Sticky', primary: true },
    ],
    onReady: (overlay, close) => {
      // Wire swatch selection
      overlay.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          overlay.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
          selectedColor = sw.dataset.color;
        });
      });

      overlay.querySelector('#modal-cancel').addEventListener('click', close);

      overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const text     = overlay.querySelector('#f-text')?.value || '';
        const rotation = parseFloat((Math.random() * 8 - 4).toFixed(1));

        const item = createItem({
          layer: ItemLayer.STICKY,
          type:  ItemType.STICKY,
          text,
          color: selectedColor,
          rotation,
          position: {
            x: 60 + Math.random() * 100,
            y: 40 + Math.random() * 80,
            width:  160,
            height: 130,
          },
        });

        const saved = await saveItem(item);
        upsertItemInState(saved);
        renderStickies(); // Patch sticky layer immediately
        close();
      });
    },
  });
}

function buildColorSwatchHTML(selected, id) {
  const swatches = STICKY_COLORS.map(c =>
    `<button class="color-swatch ${c.bg === selected ? 'selected' : ''}"
       style="background:${c.bg};"
       data-color="${c.bg}"
       aria-label="Color ${c.bg}"></button>`
  ).join('');
  return `<div class="color-swatch-row" id="${id}">${swatches}</div>`;
}

// ─── SETTINGS MODAL ───────────────────────────────────────────
function showSettingsModal() {
  openModal({
    title: 'Settings',
    fields: [],
    actions: [
      { id: 'export-btn', label: '↓ Export Data' },
      { id: 'import-btn', label: '↑ Import Data' },
      { id: 'close-btn',  label: 'Close', primary: true },
    ],
    onReady: (overlay, close) => {
      overlay.querySelector('#close-btn').addEventListener('click',  close);
      overlay.querySelector('#export-btn').addEventListener('click', exportData);
      overlay.querySelector('#import-btn').addEventListener('click', importData);
    },
  });
}

// ─── AMBIENT INTELLIGENCE ─────────────────────────────────────
function initAmbient() {
  if (state.ambientEnabled) startAmbient();
}

function startAmbient() {
  sortByTime();
  clearInterval(ambientInterval);
  ambientInterval = setInterval(sortByTime, 3_600_000);
}

function stopAmbient() {
  clearInterval(ambientInterval);
  ambientInterval = null;
}

function sortByTime() {
  const h = new Date().getHours();
  const priority = h >= 5 && h < 12 ? 'note'
                 : h >= 12 && h < 18 ? 'link'
                 : 'code';

  const sorted = [...state.backgroundItems].sort((a, b) =>
    a.type === priority && b.type !== priority ? -1 : 1
  );
  state._data.backgroundItems = sorted;
  state._notify();
}

// ─── DATA: EXPORT / IMPORT ────────────────────────────────────
function exportData() {
  const data = JSON.stringify([...state.backgroundItems, ...state.stickyItems], null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `make-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported');
}

function importData() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const items = JSON.parse(ev.target.result);
        for (const item of items) {
          delete item.id;
          const saved = await saveItem(item);
          upsertItemInState(saved);
        }
        renderStickies();
        showToast('Data imported');
        document.getElementById('modal-overlay')?.remove();
      } catch {
        showToast('Invalid backup file', true);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── TOAST ────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  document.getElementById('make-toast')?.remove();
  const el = document.createElement('div');
  el.id        = 'make-toast';
  el.className = `export-status-banner ${isError ? 'error' : 'success'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ─── HELPERS ──────────────────────────────────────────────────
function parseTagsFromText(text = '') {
  const matches = text.match(/#[\w]+/g) || [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

function formatDate(ts) {
  if (!ts) return '';
  const d   = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000)    return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000)return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emptyIcon(tab) {
  if (tab === 'notes') return `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  if (tab === 'code')  return `<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
  return `<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`;
}
function iconNote() { return `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`; }
function iconCode() { return `<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`; }
function iconLink() { return `<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`; }

// ─── START ────────────────────────────────────────────────────
init();
