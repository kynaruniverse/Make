/**
 * MAKÉ V4 — app.js
 *
 * New in V4 vs V3:
 * - Date widget: shows live date + day name, echo drop-shadow, replaces decorative bars
 * - Theme toggle: light/dark mode, persisted to localStorage
 * - Burger menu drawer: sort toggle, filter toggle, create folder stub, search, settings
 * - Correct colour palette: #b68d93 / #b6a486 / #9ba59a / #444444
 * - Echo shadows on date widget and FAB
 * - Sort and search moved into drawer (toolbar buttons kept as shortcuts)
 * - All V3 functionality preserved: cards, stickies, modals, context menu, drag/resize
 */

import { state, loadInitialData, upsertItemInState, removeItemFromState } from './core/state.js';
import { saveItem, deleteItem, updateItemPosition } from './core/storage.js';
import { createItem, ItemType, ItemLayer } from './core/schema.js';
import { makeDraggable  } from './utils/drag.js';
import { makeResizable  } from './utils/resize.js';

const app = document.getElementById('app');
const dragCleanups   = new Map();
const resizeCleanups = new Map();
let ambientInterval  = null;

const STICKY_COLORS = [
  '#ffe6ae', '#dbf0e4', '#d0e0f4', '#f4ddd9',
];

// ─── INIT ─────────────────────────────────────────────────────
async function init() {
  app.innerHTML = `<div class="make-loading"><div class="make-loading-spinner"></div><span>Loading Maké…</span></div>`;
  applyTheme(getTheme());
  await loadInitialData();
  app.querySelector('.make-loading')?.remove();
  buildShell();
  renderCards();
  renderStickies();
  attachShellListeners();
  state.subscribe(() => { renderCards(); syncAddMenu(); syncAmbientToggle(); });
  initAmbient();
}

// ─── THEME ────────────────────────────────────────────────────
function getTheme() {
  return localStorage.getItem('make_theme') || 'light';
}
function setTheme(t) {
  localStorage.setItem('make_theme', t);
  applyTheme(t);
}
function applyTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else              document.documentElement.removeAttribute('data-theme');
}
function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  const track = document.getElementById('theme-toggle');
  if (track) track.classList.toggle('on', next === 'dark');
}

// ─── DATE HELPERS ─────────────────────────────────────────────
function getLiveDate() {
  const now  = new Date();
  const day  = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return { day, date };
}

// ─── SHELL ────────────────────────────────────────────────────
function buildShell() {
  const { day, date } = getLiveDate();
  const isDark        = getTheme() === 'dark';

  app.innerHTML = `
    <div class="app-header">
      <div class="header-row">

        <button class="burger-btn" id="burger-btn" aria-label="Menu">
          <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <div class="header-right">
          <div class="date-widget" id="date-widget" aria-hidden="true">
            <div class="date-widget-date">${date}</div>
            <div class="date-widget-day">${day}</div>
          </div>
          <button class="toggle-track ${isDark ? 'on' : ''}" id="theme-toggle" aria-label="Toggle theme">
            <div class="toggle-knob"></div>
          </button>
        </div>

      </div>
      <h1 class="app-title">Maké</h1>
      <p class="app-subtitle">Your personal command center</p>
    </div>

    <div class="canvas">
      <div class="grid-layer" id="grid-layer">
        <div class="grid" id="grid-container" data-view-mode="${state.viewMode}"></div>
      </div>
      <div class="sticky-layer" id="sticky-layer"></div>
    </div>

    <div class="add-menu hidden" id="add-menu">
      <button data-type="note"   class="add-menu-item">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>New Note</span>
      </button>
      <button data-type="code"   class="add-menu-item">
        <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        <span>Code Snippet</span>
      </button>
      <button data-type="link"   class="add-menu-item">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        <span>Add Link</span>
      </button>
      <button data-type="sticky" class="add-menu-item">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <span>Sticky Note</span>
      </button>
    </div>

    <nav class="bottom-nav" role="navigation">
      <button class="nav-btn ${state.currentTab==='links'?'active':''}" data-tab="links" aria-label="Links">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      </button>
      <button class="nav-btn ${state.currentTab==='notes'?'active':''}" data-tab="notes" aria-label="Notes">
        <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      </button>
      <button class="nav-btn-fab" id="fab" aria-label="Add">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="nav-btn ${state.currentTab==='code'?'active':''}" data-tab="code" aria-label="Code">
        <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </button>
      <button class="nav-btn" id="settings-btn" aria-label="Settings">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>
    </nav>
  `;
}

// ─── CARDS ────────────────────────────────────────────────────
function getFilteredItems() {
  const tab = state.currentTab;
  let items = state.backgroundItems.filter(i => {
    if (tab === 'notes') return i.type === ItemType.NOTE;
    if (tab === 'code')  return i.type === ItemType.CODE;
    if (tab === 'links') return i.type === ItemType.LINK;
    return true;
  });
  const field = state.sortField, dir = state.sortDir;
  return [...items].sort((a, b) => {
    if (field === 'title') {
      const av = (a.title||'').toLowerCase(), bv = (b.title||'').toLowerCase();
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const av = (field==='createdAt' ? a.createdAt : a.updatedAt)||0;
    const bv = (field==='createdAt' ? b.createdAt : b.updatedAt)||0;
    return dir === 'asc' ? av-bv : bv-av;
  });
}

function renderCards() {
  const grid = document.getElementById('grid-container');
  if (!grid) return;

  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === state.currentTab)
  );

  const items = getFilteredItems();

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${emptyIcon(state.currentTab)}</div>
        <p class="empty-title">No ${state.currentTab} yet</p>
        <p class="empty-hint">Tap <strong>+</strong> to add your first ${
          state.currentTab==='notes'?'note':state.currentTab==='code'?'code snippet':'link'
        }</p>
      </div>`;
    return;
  }

  const existing = new Map();
  grid.querySelectorAll('.card[data-id]').forEach(el => existing.set(+el.dataset.id, el));

  const frag = document.createDocumentFragment();
  items.forEach((item, i) => {
    let el = existing.get(item.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'card card-animate-in';
      el.dataset.id   = item.id;
      el.dataset.type = item.type;
      el.style.animationDelay = `${i*28}ms`;
    }
    el.dataset.type = item.type;
    el.innerHTML    = cardHTML(item);
    frag.appendChild(el);
  });

  grid.innerHTML = '';
  grid.appendChild(frag);
  grid.dataset.viewMode = state.viewMode;
  attachCardListeners();
}

function cardHTML(item) {
  const preview  = (item.content||item.code||item.url||'').slice(0, 200);
  const date     = item.updatedAt ? relativeDate(item.updatedAt) : '';
  const tags     = item.tags?.length
    ? `<div class="card-tags">${item.tags.map(t=>`<span class="tag-chip">${esc(t)}</span>`).join('')}</div>`
    : '';
  const typeIcon = item.type==='note' ? iNote() : item.type==='code' ? iCode() : iLink();

  return `
    <div class="card-header">
      <div class="card-type-badge">${typeIcon}</div>
      <span class="card-type-label">${item.type==='note'?'Note':item.type==='code'?'Code':'Link'}: ${esc(item.title||'Untitled')}</span>
    </div>
    <div class="card-content">${esc(preview)}</div>
    ${tags}
    <div class="card-meta">
      <span class="card-meta-time">${date}</span>
      <button class="card-fav ${item.isFavorited?'active':''}" data-id="${item.id}" aria-label="${item.isFavorited?'Unfavorite':'Favorite'}">
        <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </button>
    </div>
  `;
}

// ─── STICKIES ─────────────────────────────────────────────────
function renderStickies() {
  const layer = document.getElementById('sticky-layer');
  if (!layer) return;

  const existing = new Map();
  layer.querySelectorAll('.sticky-note[data-id]').forEach(el => existing.set(+el.dataset.id, el));

  const ids = new Set(state.stickyItems.map(i => i.id));
  existing.forEach((el, id) => { if (!ids.has(id)) el.remove(); });

  state.stickyItems.forEach(item => {
    let el = existing.get(item.id);
    if (!el) {
      el = makeStickyEl(item);
      layer.appendChild(el);
      attachStickyBehaviour(el, item);
      requestAnimationFrame(() => el.classList.add('sticky-dropped'));
    } else {
      el.style.backgroundColor = item.color || STICKY_COLORS[0];
      el.style.setProperty('--sticky-r', `${item.rotation||0}deg`);
    }
  });
}

function makeStickyEl(item) {
  const x   = item.position?.x   || (50  + Math.random()*120);
  const y   = item.position?.y   || (30  + Math.random()*100);
  const w   = item.position?.width  || 160;
  const h   = item.position?.height || 130;
  const rot = item.rotation || 0;

  const el = document.createElement('div');
  el.className  = 'sticky-note';
  el.dataset.id = item.id;
  el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background-color:${item.color||STICKY_COLORS[0]};--sticky-r:${rot}deg;transform:rotate(${rot}deg);`;
  el.innerHTML = `
    <div class="sticky-header">
      <button class="sticky-delete" aria-label="Delete">✕</button>
    </div>
    <textarea placeholder="Write something…">${esc(item.text||'')}</textarea>
  `;
  return el;
}

function attachStickyBehaviour(el, item) {
  const id = item.id;

  el.querySelector('.sticky-delete').addEventListener('click', async e => {
    e.stopPropagation();
    el.classList.add('sticky-deleting');
    setTimeout(async () => { await deleteItem(id); removeItemFromState(id); el.remove(); }, 200);
  });

  const ta = el.querySelector('textarea');
  let t;
  ta.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const found = state.stickyItems.find(i => i.id === id);
      if (found) { found.text = ta.value; const s = await saveItem(found); upsertItemInState(s); }
    }, 600);
  });

  dragCleanups.set(id, makeDraggable(el, null, null, async (left, top) => {
    await updateItemPosition(id, { x:left, y:top, width:parseFloat(el.style.width), height:parseFloat(el.style.height) });
  }));
  resizeCleanups.set(`r${id}`, makeResizable(el, null, null, async (width, height) => {
    await updateItemPosition(id, { x:parseFloat(el.style.left), y:parseFloat(el.style.top), width, height });
  }));
}

// ─── SHELL LISTENERS ──────────────────────────────────────────
function attachShellListeners() {
  // Nav tabs
  app.addEventListener('click', e => {
    const tab = e.target.closest('.nav-btn[data-tab]');
    if (tab) { state.currentTab = tab.dataset.tab; return; }
    if (e.target.closest('#fab')) { state.showAddMenu = !state.showAddMenu; return; }
    if (state.showAddMenu && !e.target.closest('#add-menu') && !e.target.closest('#fab')) {
      state.showAddMenu = false;
    }
  });

  // Add menu
  document.getElementById('add-menu').addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    state.showAddMenu = false;
    btn.dataset.type === 'sticky' ? showStickyModal() : showCreateModal(btn.dataset.type);
  });

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Burger opens drawer
  document.getElementById('burger-btn').addEventListener('click', showDrawer);

  // Refresh date widget every minute so it stays accurate
  setInterval(() => {
    const { day, date } = getLiveDate();
    const dw = document.getElementById('date-widget');
    if (dw) {
      dw.querySelector('.date-widget-date').textContent = date;
      dw.querySelector('.date-widget-day').textContent  = day;
    }
  }, 60_000);

  // Settings
  document.getElementById('settings-btn').addEventListener('click', showSettingsModal);
}

function attachCardListeners() {
  document.querySelectorAll('.card[data-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-fav')) return;
      const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
      if (item) showEditModal(item);
    });
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
      if (item) showContextMenu(e, item);
    });
    let pt;
    card.addEventListener('touchstart', e => {
      pt = setTimeout(() => {
        const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
        if (item) showContextMenu(e.touches[0], item);
      }, 500);
    }, { passive:true });
    card.addEventListener('touchend',  () => clearTimeout(pt));
    card.addEventListener('touchmove', () => clearTimeout(pt));
  });

  document.querySelectorAll('.card-fav').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const item = state.backgroundItems.find(i => i.id === +btn.dataset.id);
      if (!item) return;
      item.isFavorited = !item.isFavorited;
      upsertItemInState(await saveItem(item));
    });
  });
}

function syncAddMenu() {
  document.getElementById('add-menu')?.classList.toggle('hidden', !state.showAddMenu);
}
function syncAmbientToggle() {
  // ambient toggle lives in drawer now — only update if open
  const t = document.getElementById('ambient-mini-toggle');
  if (t) t.classList.toggle('on', state.ambientEnabled);
}

// ─── DRAWER ───────────────────────────────────────────────────
function showDrawer() {
  if (document.getElementById('drawer')) return;

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.id        = 'drawer-overlay';

  const drawer = document.createElement('div');
  drawer.className = 'drawer opening';
  drawer.id        = 'drawer';

  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-title">Maké</div>
      <div class="drawer-subtitle">Your personal command center</div>
    </div>
    <div class="drawer-body">

      <div class="drawer-section-label">Organise</div>

      <div class="drawer-toggle-row" id="ambient-row">
        <span class="drawer-toggle-label">🌙 Ambient sorting</span>
        <button class="mini-toggle ${state.ambientEnabled?'on':''}" id="ambient-mini-toggle" aria-label="Toggle ambient">
          <div class="mini-toggle-knob"></div>
        </button>
      </div>

      <div class="drawer-toggle-row" id="filter-row">
        <span class="drawer-toggle-label">⭐ Show favourites only</span>
        <button class="mini-toggle ${state.filterFavourites?'on':''}" id="fav-filter-toggle" aria-label="Toggle favourites filter">
          <div class="mini-toggle-knob"></div>
        </button>
      </div>

      <div class="drawer-divider"></div>
      <div class="drawer-section-label">Actions</div>

      <button class="drawer-item" id="drawer-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span class="drawer-item-label">Search</span>
      </button>

      <button class="drawer-item" id="drawer-sort">
        <svg viewBox="0 0 24 24"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
        <span class="drawer-item-label">Sort by: ${sortLabel()}</span>
      </button>

      <div class="drawer-divider"></div>
      <div class="drawer-section-label">Data</div>

      <button class="drawer-item" id="drawer-export">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span class="drawer-item-label">Export data</span>
      </button>

      <button class="drawer-item" id="drawer-import">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span class="drawer-item-label">Import data</span>
      </button>

    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  const close = () => {
    drawer.classList.remove('opening');
    drawer.classList.add('closing');
    overlay.style.animation = 'fade-in 200ms ease reverse both';
    setTimeout(() => { drawer.remove(); overlay.remove(); }, 250);
  };

  overlay.addEventListener('click', close);

  // Ambient toggle
  document.getElementById('ambient-mini-toggle').addEventListener('click', e => {
    e.stopPropagation();
    state.ambientEnabled = !state.ambientEnabled;
    e.currentTarget.classList.toggle('on', state.ambientEnabled);
    state.ambientEnabled ? startAmbient() : stopAmbient();
  });

  // Favourites filter toggle
  document.getElementById('fav-filter-toggle').addEventListener('click', e => {
    e.stopPropagation();
    state._data.filterFavourites = !state._data.filterFavourites;
    e.currentTarget.classList.toggle('on', state._data.filterFavourites);
    state._notify();
  });

  // Search
  document.getElementById('drawer-search').addEventListener('click', () => { close(); setTimeout(showSearch, 300); });

  // Sort
  document.getElementById('drawer-sort').addEventListener('click', () => {
    close();
    setTimeout(() => {
      const btn = document.getElementById('burger-btn') || document.body;
      const r   = btn.getBoundingClientRect();
      showSortMenuAt(r.right - 190, r.bottom + 8);
    }, 300);
  });

  // Export / import
  document.getElementById('drawer-export').addEventListener('click', () => { close(); setTimeout(exportData, 300); });
  document.getElementById('drawer-import').addEventListener('click', () => { close(); setTimeout(importData, 300); });
}

function sortLabel() {
  const map = { updatedAt:'Modified', createdAt:'Created', title:'Title' };
  return (map[state.sortField]||'Modified') + (state.sortDir==='asc'?' ↑':' ↓');
}

// ─── SORT MENU ────────────────────────────────────────────────
function showSortMenuAt(left, top) {
  document.getElementById('sort-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'sort-menu'; menu.className = 'sort-menu-popup';
  menu.style.top = `${top}px`; menu.style.left = `${Math.max(8, left)}px`;

  const fields = [
    { field:'updatedAt', label:'Date modified' },
    { field:'createdAt', label:'Date created'  },
    { field:'title',     label:'Title'          },
  ];
  menu.innerHTML = `
    <div class="sort-menu-section-label">Sort by</div>
    ${fields.map(f => `
      <button class="sort-menu-item ${state.sortField===f.field?'active':''}" data-sort="${f.field}">
        <span>${f.label}</span>
        ${state.sortField===f.field ? `<span class="sort-dir-indicator">${state.sortDir==='desc'?'↓':'↑'}</span>` : ''}
      </button>
    `).join('')}
  `;
  document.body.appendChild(menu);

  const dismiss = e => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 50);

  menu.querySelectorAll('.sort-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.sort;
      if (f === state.sortField) state.sortDir = state.sortDir==='desc'?'asc':'desc';
      else { state.sortField = f; state.sortDir = 'desc'; }
      menu.remove();
    });
  });
}

// ─── SEARCH ───────────────────────────────────────────────────
function showSearch() {
  if (document.getElementById('search-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'search-overlay'; overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-bar">
      <button class="search-cancel-btn" id="search-cancel">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <input id="search-input" type="text" placeholder="Search notes, code, links…" autocomplete="off">
    </div>
    <div class="search-filter-chips">
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
  setTimeout(() => input.focus(), 350);

  let aType = null, aTime = null;

  const run = () => {
    const q    = input.value.trim().toLowerCase();
    const now  = Date.now();
    let   res  = state.backgroundItems;
    if (aType) res = res.filter(i => i.type === aType);
    if (aTime) res = res.filter(i => (i.createdAt||0) >= now - aTime);
    if (q)     res = res.filter(i =>
      (i.title||'').toLowerCase().includes(q) ||
      (i.content||'').toLowerCase().includes(q) ||
      (i.code||'').toLowerCase().includes(q) ||
      (i.url||'').toLowerCase().includes(q) ||
      (i.tags||[]).some(t => t.toLowerCase().includes(q))
    );
    const el = document.getElementById('search-results');
    if (!el) return;
    if (!q && !aType && !aTime) { el.innerHTML = '<div class="search-hint">Start typing…</div>'; return; }
    if (!res.length) { el.innerHTML = '<div class="search-empty-msg">No results</div>'; return; }
    el.innerHTML = res.map(item => `
      <div class="card search-result-card" data-id="${item.id}" style="min-height:auto">
        <div class="card-header"><span class="card-type-label">${item.type}: ${esc(item.title||'Untitled')}</span></div>
        <div class="card-content">${esc((item.content||item.code||item.url||'').slice(0,120))}</div>
      </div>
    `).join('');
    el.querySelectorAll('.card[data-id]').forEach(c => {
      c.addEventListener('click', () => {
        const item = state.backgroundItems.find(i => i.id === +c.dataset.id);
        if (item) { close(); showEditModal(item); }
      });
    });
  };

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 350);
  };

  input.addEventListener('input', run);
  overlay.querySelectorAll('.search-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.dataset.type) {
        chip.classList.toggle('active');
        overlay.querySelectorAll('.search-filter-chip[data-type]').forEach(c => { if (c!==chip) c.classList.remove('active'); });
        aType = chip.classList.contains('active') ? chip.dataset.type : null;
      } else {
        chip.classList.toggle('active');
        overlay.querySelectorAll('.search-filter-chip[data-time]').forEach(c => { if (c!==chip) c.classList.remove('active'); });
        aTime = chip.classList.contains('active') ? +chip.dataset.time : null;
      }
      run();
    });
  });
  document.getElementById('search-cancel').addEventListener('click', close);
}

// ─── CONTEXT MENU ─────────────────────────────────────────────
function showContextMenu(evt, item) {
  document.getElementById('context-menu-overlay')?.remove();
  document.getElementById('context-menu')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'context-menu-overlay'; overlay.className = 'context-menu-overlay';

  const menu = document.createElement('div');
  menu.id = 'context-menu'; menu.className = 'context-menu';

  menu.innerHTML = [
    { label: item.isFavorited ? '♡ Unfavorite' : '♡ Favorite', action:'favorite' },
    { label: '⎘ Duplicate', action:'duplicate' },
    { label: '✎ Edit',      action:'edit' },
    { divider: true },
    { label: '⌦ Delete',    action:'delete', destructive:true },
  ].map(a => a.divider
    ? `<div class="context-menu-divider"></div>`
    : `<button class="context-menu-item ${a.destructive?'destructive':''}" data-action="${a.action}">${a.label}</button>`
  ).join('');

  const x = evt.clientX || window.innerWidth/2;
  const y = evt.clientY || window.innerHeight/2;
  menu.style.left = `${Math.min(x, window.innerWidth-200)}px`;
  menu.style.top  = `${Math.min(y, window.innerHeight-200)}px`;

  document.body.appendChild(overlay);
  document.body.appendChild(menu);

  const dismiss = () => { overlay.remove(); menu.remove(); };
  overlay.addEventListener('click', dismiss);

  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      dismiss();
      if (btn.dataset.action === 'edit') {
        showEditModal(item);
      } else if (btn.dataset.action === 'favorite') {
        item.isFavorited = !item.isFavorited;
        upsertItemInState(await saveItem(item));
      } else if (btn.dataset.action === 'duplicate') {
        const dup = createItem({ ...item, id:undefined, title:(item.title||'Untitled')+' copy', createdAt:undefined });
        upsertItemInState(await saveItem(dup));
        showToast('Duplicated');
      } else if (btn.dataset.action === 'delete') {
        await deleteItem(item.id); removeItemFromState(item.id);
      }
    });
  });
}

// ─── MODAL FACTORY ────────────────────────────────────────────
function openModal({ title, fields, actions, onReady }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'modal-overlay';

  const fieldHTML = fields.map(f => {
    if (f.type==='input')    return `<input id="${f.id}" class="modal-input" placeholder="${f.placeholder||''}" value="${esc(f.value||'')}">`;
    if (f.type==='textarea') return `<textarea id="${f.id}" class="modal-textarea" placeholder="${f.placeholder||''}" rows="${f.rows||6}">${esc(f.value||'')}</textarea>`;
    if (f.type==='select')   return `<select id="${f.id}" class="modal-select">${f.options.map(o=>`<option value="${o.value}" ${o.value===f.value?'selected':''}>${o.label}</option>`).join('')}</select>`;
    if (f.type==='swatches') return `<div class="color-swatch-row">${STICKY_COLORS.map(c=>`<button class="color-swatch ${c===f.value?'selected':''}" style="background:${c}" data-color="${c}"></button>`).join('')}</div>`;
    return '';
  }).join('');

  overlay.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">${title}</h3>
      <div class="modal-content">${fieldHTML}</div>
      <div class="modal-actions">
        ${actions.map(a=>`<button id="${a.id}" class="modal-btn ${a.primary?'primary':a.danger?'danger':''}">${a.label}</button>`).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 220); };
  overlay.addEventListener('click', e => { if (e.target===overlay) close(); });
  if (onReady) onReady(overlay, close);
  return { overlay, close };
}

// ─── CREATE ───────────────────────────────────────────────────
function showCreateModal(type) {
  const cfgs = {
    note: { title:'New Note', fields:[
      { type:'input',    id:'f-title',   placeholder:'Title' },
      { type:'textarea', id:'f-content', placeholder:'Content…', rows:7 },
    ]},
    code: { title:'New Code Snippet', fields:[
      { type:'input',    id:'f-title', placeholder:'Title' },
      { type:'textarea', id:'f-code',  placeholder:'Code…', rows:8 },
      { type:'select',   id:'f-lang',  value:'javascript',
        options:['javascript','python','html','css','typescript','bash','json'].map(l=>({value:l,label:l})) },
    ]},
    link: { title:'Add Link', fields:[
      { type:'input', id:'f-url',   placeholder:'https://…' },
      { type:'input', id:'f-title', placeholder:'Label (optional)' },
    ]},
  };
  const { title, fields } = cfgs[type];
  openModal({ title, fields,
    actions:[{ id:'modal-cancel', label:'Cancel' },{ id:'modal-save', label:'Save', primary:true }],
    onReady:(overlay, close) => {
      overlay.querySelector('#modal-cancel').addEventListener('click', close);
      overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const item = createItem({ layer:ItemLayer.BACKGROUND, type });
        if (type==='note') {
          item.title   = overlay.querySelector('#f-title')?.value || '';
          item.content = overlay.querySelector('#f-content')?.value || '';
          item.tags    = parseTags(item.content);
        } else if (type==='code') {
          item.title    = overlay.querySelector('#f-title')?.value || '';
          item.code     = overlay.querySelector('#f-code')?.value  || '';
          item.language = overlay.querySelector('#f-lang')?.value  || 'javascript';
        } else {
          item.url   = overlay.querySelector('#f-url')?.value   || '';
          item.title = overlay.querySelector('#f-title')?.value || '';
        }
        if (item.title||item.content||item.code||item.url) upsertItemInState(await saveItem(item));
        close();
      });
    },
  });
}

// ─── EDIT ─────────────────────────────────────────────────────
function showEditModal(item) {
  const cfgs = {
    note: { title:'Edit Note', fields:[
      { type:'input',    id:'f-title',   placeholder:'Title',    value:item.title||'' },
      { type:'textarea', id:'f-content', placeholder:'Content…', value:item.content||'', rows:7 },
    ], collect: o => ({ title:o.querySelector('#f-title')?.value||'', content:o.querySelector('#f-content')?.value||'', tags:parseTags(o.querySelector('#f-content')?.value||'') }) },
    code: { title:'Edit Code', fields:[
      { type:'input',    id:'f-title', placeholder:'Title', value:item.title||'' },
      { type:'textarea', id:'f-code',  placeholder:'Code…', value:item.code||'', rows:8 },
      { type:'select',   id:'f-lang',  value:item.language||'javascript',
        options:['javascript','python','html','css','typescript','bash','json'].map(l=>({value:l,label:l})) },
    ], collect: o => ({ title:o.querySelector('#f-title')?.value||'', code:o.querySelector('#f-code')?.value||'', language:o.querySelector('#f-lang')?.value||'javascript' }) },
    link: { title:'Edit Link', fields:[
      { type:'input', id:'f-url',   placeholder:'https://…',       value:item.url||'' },
      { type:'input', id:'f-title', placeholder:'Label (optional)', value:item.title||'' },
    ], collect: o => ({ url:o.querySelector('#f-url')?.value||'', title:o.querySelector('#f-title')?.value||'' }) },
  };
  const cfg = cfgs[item.type]; if (!cfg) return;

  openModal({ title:cfg.title, fields:cfg.fields,
    actions:[{ id:'modal-delete', label:'Delete', danger:true },{ id:'modal-cancel', label:'Cancel' },{ id:'modal-save', label:'Save', primary:true }],
    onReady:(overlay, close) => {
      overlay.querySelector('#modal-cancel').addEventListener('click', close);
      overlay.querySelector('#modal-delete').addEventListener('click', async () => {
        await deleteItem(item.id); removeItemFromState(item.id); close();
      });
      overlay.querySelector('#modal-save').addEventListener('click', async () => {
        upsertItemInState(await saveItem({ ...item, ...cfg.collect(overlay) })); close();
      });
    },
  });
}

// ─── STICKY MODAL ─────────────────────────────────────────────
function showStickyModal() {
  let col = STICKY_COLORS[Math.floor(Math.random()*STICKY_COLORS.length)];
  openModal({ title:'New Sticky',
    fields:[
      { type:'textarea', id:'f-text',  placeholder:'Write something…', rows:4 },
      { type:'swatches', id:'f-color', value:col },
    ],
    actions:[{ id:'modal-cancel', label:'Cancel' },{ id:'modal-save', label:'Add Sticky', primary:true }],
    onReady:(overlay, close) => {
      overlay.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          overlay.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected'); col = sw.dataset.color;
        });
      });
      overlay.querySelector('#modal-cancel').addEventListener('click', close);
      overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const item = createItem({
          layer:ItemLayer.STICKY, type:ItemType.STICKY,
          text:  overlay.querySelector('#f-text')?.value || '',
          color: col,
          rotation: parseFloat((Math.random()*8-4).toFixed(1)),
          position: { x:50+Math.random()*120, y:30+Math.random()*100, width:160, height:130 },
        });
        upsertItemInState(await saveItem(item));
        renderStickies(); close();
      });
    },
  });
}

// ─── SETTINGS MODAL ───────────────────────────────────────────
function showSettingsModal() {
  openModal({ title:'Settings', fields:[],
    actions:[{ id:'export-btn', label:'↓ Export' },{ id:'import-btn', label:'↑ Import' },{ id:'close-btn', label:'Close', primary:true }],
    onReady:(overlay, close) => {
      overlay.querySelector('#close-btn').addEventListener('click', close);
      overlay.querySelector('#export-btn').addEventListener('click', exportData);
      overlay.querySelector('#import-btn').addEventListener('click', importData);
    },
  });
}

// ─── AMBIENT ──────────────────────────────────────────────────
function initAmbient() { if (state.ambientEnabled) startAmbient(); }
function startAmbient()  { sortByTime(); clearInterval(ambientInterval); ambientInterval = setInterval(sortByTime, 3_600_000); }
function stopAmbient()   { clearInterval(ambientInterval); ambientInterval = null; }
function sortByTime() {
  const h = new Date().getHours();
  const p = h>=5&&h<12 ? 'note' : h>=12&&h<18 ? 'link' : 'code';
  state._data.backgroundItems = [...state.backgroundItems].sort((a,b) => a.type===p&&b.type!==p?-1:1);
  state._notify();
}

// ─── EXPORT / IMPORT ──────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify([...state.backgroundItems,...state.stickyItems],null,2)],{type:'application/json'});
  const a = Object.assign(document.createElement('a'),{ href:URL.createObjectURL(blob), download:`make-backup-${new Date().toISOString().slice(0,10)}.json` });
  a.click(); URL.revokeObjectURL(a.href);
  showToast('Data exported');
}
function importData() {
  const input = Object.assign(document.createElement('input'),{ type:'file', accept:'.json' });
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const items = JSON.parse(ev.target.result);
        for (const item of items) { delete item.id; upsertItemInState(await saveItem(item)); }
        renderStickies(); showToast('Data imported');
        document.getElementById('modal-overlay')?.remove();
      } catch { showToast('Invalid file', true); }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── TOAST ────────────────────────────────────────────────────
function showToast(msg, isError=false) {
  document.getElementById('make-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'make-toast';
  el.className = `toast-banner ${isError?'error':'success'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ─── HELPERS ──────────────────────────────────────────────────
function parseTags(text='') {
  return [...new Set((text.match(/#[\w]+/g)||[]).map(t=>t.slice(1).toLowerCase()))];
}
function relativeDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date(), diff = now-d;
  if (diff<60_000)    return 'just now';
  if (diff<3_600_000) return `${Math.floor(diff/60_000)}m ago`;
  if (diff<86_400_000)return `${Math.floor(diff/3_600_000)}h ago`;
  if (diff<604_800_000)return `${Math.floor(diff/86_400_000)}d ago`;
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function emptyIcon(t) {
  if (t==='notes') return `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  if (t==='code')  return `<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
  return `<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`;
}
function iNote() { return `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`; }
function iCode() { return `<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`; }
function iLink() { return `<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`; }

init();
