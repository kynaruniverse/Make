/**
 * MAKÉ V5 — app.js
 * Changes from V4:
 * - BUGFIX: saveItem null-id stripped (IndexedDB fix in storage.js)
 * - BUGFIX: favourites filter now applied in getFilteredItems()
 * - Notes: full-page rich text editor (bold/italic/size/color/lists)
 * - Code: full-page terminal editor (line nums, tab key, language tags, copy)
 * - Links: rendered as button grid instead of cards
 * - Stickies: redesigned realistic paper look with tape + fold
 * - State subscription also re-renders stickies
 */

import { state, loadInitialData, upsertItemInState, removeItemFromState } from './core/state.js';
import { saveItem, deleteItem, updateItemPosition } from './core/storage.js';
import { createItem, ItemType, ItemLayer } from './core/schema.js';
import { makeDraggable  } from './utils/drag.js';
import { makeResizable  } from './utils/resize.js';

const app = document.getElementById('app');
const dragCleanups   = new Map();
const resizeCleanups = new Map();
let   ambientInterval = null;

const STICKY_COLORS = ['#fff176','#a5d6a7','#90caf9','#f48fb1','#ce93d8','#ffcc80'];
const STICKY_TAPE_COLORS = ['rgba(255,255,255,0.55)','rgba(200,240,210,0.55)','rgba(180,220,255,0.55)','rgba(255,190,210,0.55)','rgba(220,180,255,0.55)','rgba(255,210,160,0.55)'];

const NOTE_COLORS = ['#ffffff','#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f40','#00d2d3'];
const LANGUAGES   = ['javascript','typescript','python','html','css','bash','json','sql','java','swift','kotlin','rust','go','cpp','markdown','plaintext'];

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
  state.subscribe(() => { renderCards(); renderStickies(); syncAddMenu(); syncAmbientToggle(); });
  initAmbient();
}

// ─── THEME ────────────────────────────────────────────────────
function getTheme()  { return localStorage.getItem('make_theme') || 'light'; }
function setTheme(t) { localStorage.setItem('make_theme', t); applyTheme(t); }
function applyTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else              document.documentElement.removeAttribute('data-theme');
}
function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  document.getElementById('theme-toggle')?.classList.toggle('on', next === 'dark');
}

// ─── DATE ─────────────────────────────────────────────────────
function getLiveDate() {
  const now  = new Date();
  const day  = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return { day, date };
}

// ─── SHELL ────────────────────────────────────────────────────
function buildShell() {
  const { day, date } = getLiveDate();
  const isDark = getTheme() === 'dark';
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
          <button class="toggle-track ${isDark?'on':''}" id="theme-toggle" aria-label="Toggle theme">
            <div class="toggle-knob"></div>
          </button>
        </div>
      </div>
      <h1 class="app-title">Maké</h1>
      <p class="app-subtitle">Your personal command center</p>
    </div>

    <div class="canvas">
      <div class="grid-layer" id="grid-layer">
        <div class="grid" id="grid-container"></div>
      </div>
      <div class="sticky-layer" id="sticky-layer"></div>
    </div>

    <div class="add-menu hidden" id="add-menu">
      <button data-type="note" class="add-menu-item">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>New Note</span>
      </button>
      <button data-type="code" class="add-menu-item">
        <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        <span>Code Snippet</span>
      </button>
      <button data-type="link" class="add-menu-item">
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
  // BUGFIX: apply favourites filter if enabled
  if (state._data.filterFavourites) items = items.filter(i => i.isFavorited);
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
    grid.className = 'grid';
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

  // Links tab — render as button grid
  if (state.currentTab === 'links') {
    grid.className = 'links-grid';
    grid.innerHTML = items.map(item => `
      <a class="link-btn" data-id="${item.id}"
         href="${esc(item.url||'#')}" target="_blank" rel="noopener noreferrer"
         title="${esc(item.url||'')}">
        <div class="link-btn-icon">
          <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </div>
        <span class="link-btn-label">${esc(item.title || item.url || 'Link')}</span>
      </a>
    `).join('');
    attachLinkListeners();
    return;
  }

  // Standard card grid
  grid.className = 'grid';
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
  attachCardListeners();
}

function cardHTML(item) {
  // Strip HTML tags for plain text preview
  const raw = item.content || item.code || item.url || '';
  const preview = raw.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').slice(0, 200);
  const date     = item.updatedAt ? relativeDate(item.updatedAt) : '';
  const tags     = item.tags?.length
    ? `<div class="card-tags">${item.tags.map(t=>`<span class="tag-chip">${esc(t)}</span>`).join('')}</div>` : '';
  const typeIcon = item.type==='note' ? iNote() : item.type==='code' ? iCode() : iLink();
  const typeLabel = item.type==='note'?'Note':item.type==='code'?'Code':'Link';
  return `
    <div class="card-header">
      <div class="card-type-badge">${typeIcon}</div>
      <span class="card-type-label">${typeLabel}: ${esc(item.title||'Untitled')}</span>
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
      const colorIdx = STICKY_COLORS.indexOf(item.color);
      el.style.setProperty('--sticky-color', item.color || STICKY_COLORS[0]);
      el.style.setProperty('--sticky-tape', STICKY_TAPE_COLORS[colorIdx >= 0 ? colorIdx : 0]);
      el.style.setProperty('--sticky-r', `${item.rotation||0}deg`);
      el.style.transform = `rotate(${item.rotation||0}deg)`;
    }
  });
}

function makeStickyEl(item) {
  const x    = item.position?.x      || (50  + Math.random()*120);
  const y    = item.position?.y      || (30  + Math.random()*100);
  const w    = item.position?.width  || 175;
  const h    = item.position?.height || 150;
  const rot  = item.rotation || 0;
  const col  = item.color || STICKY_COLORS[0];
  const colorIdx = STICKY_COLORS.indexOf(col);
  const tape = STICKY_TAPE_COLORS[colorIdx >= 0 ? colorIdx : 0];

  const el = document.createElement('div');
  el.className  = 'sticky-note';
  el.dataset.id = item.id;
  el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;--sticky-color:${col};--sticky-tape:${tape};--sticky-r:${rot}deg;transform:rotate(${rot}deg);`;

  el.innerHTML = `
    <div class="sticky-tape"></div>
    <div class="sticky-inner">
      <div class="sticky-header">
        <button class="sticky-delete" aria-label="Delete">✕</button>
      </div>
      <textarea class="sticky-textarea" placeholder="Write something…">${esc(item.text||'')}</textarea>
    </div>
    <div class="sticky-fold"></div>
    <div class="resize-handle"></div>
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

  const ta = el.querySelector('.sticky-textarea');
  let debounce;
  ta.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const found = state.stickyItems.find(i => i.id === id);
      if (found) { found.text = ta.value; upsertItemInState(await saveItem(found)); }
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
  app.addEventListener('click', e => {
    const tab = e.target.closest('.nav-btn[data-tab]');
    if (tab) { state.currentTab = tab.dataset.tab; return; }
    if (e.target.closest('#fab')) { state.showAddMenu = !state.showAddMenu; return; }
    if (state.showAddMenu && !e.target.closest('#add-menu') && !e.target.closest('#fab')) {
      state.showAddMenu = false;
    }
  });

  document.getElementById('add-menu').addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    state.showAddMenu = false;
    const t = btn.dataset.type;
    if (t === 'sticky')      showStickyModal();
    else if (t === 'note')   showNoteEditor();
    else if (t === 'code')   showCodeEditor();
    else if (t === 'link')   showLinkModal();
  });

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('burger-btn').addEventListener('click', showDrawer);
  document.getElementById('settings-btn').addEventListener('click', showSettingsModal);

  setInterval(() => {
    const { day, date } = getLiveDate();
    const dw = document.getElementById('date-widget');
    if (dw) {
      dw.querySelector('.date-widget-date').textContent = date;
      dw.querySelector('.date-widget-day').textContent  = day;
    }
  }, 60_000);
}

function attachCardListeners() {
  document.querySelectorAll('.card[data-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-fav')) return;
      const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
      if (!item) return;
      if (item.type === 'note') showNoteEditor(item);
      else if (item.type === 'code') showCodeEditor(item);
      else showLinkModal(item);
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
    }, { passive: true });
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

function attachLinkListeners() {
  document.querySelectorAll('.link-btn[data-id]').forEach(btn => {
    btn.addEventListener('contextmenu', e => {
      e.preventDefault();
      const item = state.backgroundItems.find(i => i.id === +btn.dataset.id);
      if (item) showContextMenu(e, item);
    });
    let pt;
    btn.addEventListener('touchstart', e => {
      pt = setTimeout(() => {
        e.preventDefault();
        const item = state.backgroundItems.find(i => i.id === +btn.dataset.id);
        if (item) showContextMenu(e.touches[0], item);
      }, 500);
    }, { passive: true });
    btn.addEventListener('touchend',  () => clearTimeout(pt));
    btn.addEventListener('touchmove', () => clearTimeout(pt));
  });
}

function syncAddMenu() {
  document.getElementById('add-menu')?.classList.toggle('hidden', !state.showAddMenu);
}
function syncAmbientToggle() {
  const t = document.getElementById('ambient-mini-toggle');
  if (t) t.classList.toggle('on', state.ambientEnabled);
}

// ─── NOTE EDITOR ──────────────────────────────────────────────
function showNoteEditor(existingItem = null) {
  document.getElementById('note-editor-page')?.remove();
  const page = document.createElement('div');
  page.className = 'editor-page note-editor-page';
  page.id = 'note-editor-page';

  const rawContent = existingItem?.content || '';
  // Support both HTML (from rich editor) and plain text (legacy)
  const isHtml = /<[a-z][\s\S]*>/i.test(rawContent);
  const bodyHtml = isHtml
    ? rawContent
    : rawContent.split('\n').map(l => `<div>${esc(l) || '<br>'}</div>`).join('') || '<div><br></div>';

  page.innerHTML = `
    <div class="editor-topbar">
      <button class="editor-back-btn" id="note-back">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="editor-topbar-title">${existingItem ? 'Edit Note' : 'New Note'}</span>
      <button class="editor-save-btn" id="note-save">Save</button>
    </div>

    <input class="editor-title-input" id="note-title" placeholder="Title…"
           value="${esc(existingItem?.title || '')}" autocomplete="off">

    <div class="editor-toolbar" id="note-toolbar">
      <div class="toolbar-group">
        <button class="toolbar-btn" data-cmd="bold"          title="Bold"><b>B</b></button>
        <button class="toolbar-btn" data-cmd="italic"        title="Italic"><i>I</i></button>
        <button class="toolbar-btn" data-cmd="underline"     title="Underline"><u>U</u></button>
        <button class="toolbar-btn" data-cmd="strikeThrough" title="Strike"><s>S</s></button>
      </div>
      <div class="toolbar-sep"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn size-btn" data-cmd="fontSize" data-val="2" title="Small">xs</button>
        <button class="toolbar-btn size-btn" data-cmd="fontSize" data-val="3" title="Normal">sm</button>
        <button class="toolbar-btn size-btn" data-cmd="fontSize" data-val="5" title="Large">lg</button>
        <button class="toolbar-btn size-btn" data-cmd="formatBlock" data-val="h2" title="Heading">H1</button>
      </div>
      <div class="toolbar-sep"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn" data-cmd="insertUnorderedList" title="Bullet list">
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="3" cy="5" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="3" cy="10" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="3" cy="15" r="1.2" fill="currentColor" stroke="none"/>
            <line x1="7" y1="5" x2="18" y2="5"/><line x1="7" y1="10" x2="18" y2="10"/><line x1="7" y1="15" x2="18" y2="15"/>
          </svg>
        </button>
        <button class="toolbar-btn" data-cmd="insertOrderedList" title="Numbered list">
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <text x="1" y="7" font-size="5.5" fill="currentColor" stroke="none">1.</text>
            <text x="1" y="12" font-size="5.5" fill="currentColor" stroke="none">2.</text>
            <text x="1" y="17" font-size="5.5" fill="currentColor" stroke="none">3.</text>
            <line x1="8" y1="5" x2="18" y2="5"/><line x1="8" y1="10" x2="18" y2="10"/><line x1="8" y1="15" x2="18" y2="15"/>
          </svg>
        </button>
        <button class="toolbar-btn" data-cmd="outdent"  title="Outdent">⇤</button>
        <button class="toolbar-btn" data-cmd="indent"   title="Indent">⇥</button>
      </div>
      <div class="toolbar-sep"></div>
      <div class="toolbar-group color-swatches">
        ${NOTE_COLORS.map(c =>
          `<button class="toolbar-color-dot" data-cmd="foreColor" data-val="${c}"
                   style="background:${c}" title="Color ${c}"></button>`
        ).join('')}
      </div>
    </div>

    <div class="editor-body" id="note-body" contenteditable="true" spellcheck="true">${bodyHtml}</div>
  `;

  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));

  const body    = page.querySelector('#note-body');
  const toolbar = page.querySelector('#note-toolbar');

  // Toolbar commands — mousedown keeps focus in editor
  toolbar.addEventListener('mousedown', e => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
    updateToolbarState();
  });

  // Touch support for toolbar
  toolbar.addEventListener('touchend', e => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    body.focus();
    document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
    updateToolbarState();
  });

  function updateToolbarState() {
    ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'].forEach(cmd => {
      toolbar.querySelectorAll(`[data-cmd="${cmd}"]`).forEach(btn => {
        try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch {}
      });
    });
  }

  body.addEventListener('keyup',   updateToolbarState);
  body.addEventListener('mouseup', updateToolbarState);

  const close = () => {
    page.classList.remove('open');
    setTimeout(() => page.remove(), 320);
  };

  page.querySelector('#note-back').addEventListener('click', close);

  page.querySelector('#note-save').addEventListener('click', async () => {
    const title   = page.querySelector('#note-title').value.trim();
    const content = body.innerHTML;
    const plain   = body.innerText || '';
    if (!title && !plain.trim()) { close(); return; }
    const tags = parseTags(plain);
    let saved;
    if (existingItem) {
      saved = await saveItem({ ...existingItem, title, content, tags });
    } else {
      saved = await saveItem(createItem({ layer: ItemLayer.BACKGROUND, type: ItemType.NOTE, title, content, tags }));
    }
    upsertItemInState(saved);
    showToast(existingItem ? 'Note updated' : 'Note saved');
    close();
  });

  setTimeout(() => { body.focus(); placeCaretAtEnd(body); }, 380);
}

function placeCaretAtEnd(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {}
}

// ─── CODE EDITOR ──────────────────────────────────────────────
function showCodeEditor(existingItem = null) {
  document.getElementById('code-editor-page')?.remove();
  const page = document.createElement('div');
  page.className = 'editor-page code-editor-page';
  page.id = 'code-editor-page';

  const currentLang = existingItem?.language || 'javascript';
  const currentCode = existingItem?.code || '';

  page.innerHTML = `
    <div class="editor-topbar code-topbar">
      <button class="editor-back-btn" id="code-back">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <input class="code-filename-input" id="code-title" placeholder="filename.js"
             value="${esc(existingItem?.title || '')}" autocomplete="off" spellcheck="false">
      <button class="editor-save-btn" id="code-save">Save</button>
    </div>

    <div class="code-lang-strip" id="code-lang-strip">
      ${LANGUAGES.map(l =>
        `<button class="lang-tag ${l===currentLang?'active':''}" data-lang="${l}">${l}</button>`
      ).join('')}
    </div>

    <div class="code-editor-frame">
      <div class="code-gutter" id="code-gutter">
        ${Array.from({length: Math.max(currentCode.split('\n').length, 20)}, (_, i) => `<div>${i+1}</div>`).join('')}
      </div>
      <textarea class="code-textarea" id="code-textarea"
                placeholder="// Start coding…"
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off">${esc(currentCode)}</textarea>
    </div>

    <div class="code-statusbar">
      <span class="code-status-lang" id="code-status-lang">${currentLang}</span>
      <span class="code-status-pos"  id="code-status-pos">Ln 1, Col 1</span>
      <button class="code-copy-btn" id="code-copy">
        <svg viewBox="0 0 24 24" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>
    </div>
  `;

  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));

  let selectedLang = currentLang;
  const textarea = page.querySelector('#code-textarea');
  const gutter   = page.querySelector('#code-gutter');

  function updateGutter() {
    const lines = Math.max(textarea.value.split('\n').length, 20);
    const current = gutter.children.length;
    if (lines > current) {
      const frag = document.createDocumentFragment();
      for (let i = current + 1; i <= lines; i++) {
        const d = document.createElement('div'); d.textContent = i;
        frag.appendChild(d);
      }
      gutter.appendChild(frag);
    } else if (lines < current) {
      while (gutter.children.length > lines) gutter.lastChild.remove();
    }
  }

  function updatePos() {
    const val = textarea.value;
    const pos = textarea.selectionStart;
    const lines = val.substring(0, pos).split('\n');
    page.querySelector('#code-status-pos').textContent =
      `Ln ${lines.length}, Col ${lines[lines.length-1].length + 1}`;
  }

  textarea.addEventListener('input', () => { updateGutter(); updatePos(); });
  textarea.addEventListener('click', updatePos);
  textarea.addEventListener('keyup', updatePos);
  textarea.addEventListener('scroll', () => { gutter.scrollTop = textarea.scrollTop; });

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart, end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, s) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
      updateGutter();
    }
    // Auto-close brackets/quotes
    const pairs = { '(':')', '[':']', '{':'}', '"':'"', "'":"'", '`':'`' };
    if (pairs[e.key]) {
      e.preventDefault();
      const s = textarea.selectionStart, end = textarea.selectionEnd;
      const selected = textarea.value.substring(s, end);
      textarea.value = textarea.value.substring(0, s) + e.key + selected + pairs[e.key] + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 1;
    }
  });

  page.querySelector('#code-lang-strip').addEventListener('click', e => {
    const tag = e.target.closest('.lang-tag');
    if (!tag) return;
    page.querySelectorAll('.lang-tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
    selectedLang = tag.dataset.lang;
    page.querySelector('#code-status-lang').textContent = selectedLang;
  });

  page.querySelector('#code-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(textarea.value)
      .then(() => showToast('Copied to clipboard'))
      .catch(() => showToast('Copy failed', true));
  });

  const close = () => {
    page.classList.remove('open');
    setTimeout(() => page.remove(), 320);
  };

  page.querySelector('#code-back').addEventListener('click', close);

  page.querySelector('#code-save').addEventListener('click', async () => {
    const title = page.querySelector('#code-title').value.trim();
    const code  = textarea.value;
    if (!title && !code.trim()) { close(); return; }
    let saved;
    if (existingItem) {
      saved = await saveItem({ ...existingItem, title, code, language: selectedLang });
    } else {
      saved = await saveItem(createItem({ layer: ItemLayer.BACKGROUND, type: ItemType.CODE, title, code, language: selectedLang }));
    }
    upsertItemInState(saved);
    showToast(existingItem ? 'Code updated' : 'Code saved');
    close();
  });

  setTimeout(() => textarea.focus(), 380);
}

// ─── LINK MODAL ───────────────────────────────────────────────
function showLinkModal(existingItem = null) {
  openModal({
    title: existingItem ? 'Edit Link' : 'Add Link',
    fields: [
      { type:'input', id:'f-url',   placeholder:'https://…',      value: existingItem?.url   || '' },
      { type:'input', id:'f-title', placeholder:'Label (optional)',value: existingItem?.title || '' },
    ],
    actions: existingItem
      ? [{ id:'m-delete', label:'Delete', danger:true }, { id:'m-cancel', label:'Cancel' }, { id:'m-save', label:'Save', primary:true }]
      : [{ id:'m-cancel', label:'Cancel' }, { id:'m-save', label:'Save', primary:true }],
    onReady: (overlay, close) => {
      overlay.querySelector('#m-cancel').addEventListener('click', close);
      overlay.querySelector('#m-delete')?.addEventListener('click', async () => {
        await deleteItem(existingItem.id); removeItemFromState(existingItem.id); close();
      });
      overlay.querySelector('#m-save').addEventListener('click', async () => {
        const url   = overlay.querySelector('#f-url')?.value.trim()   || '';
        const title = overlay.querySelector('#f-title')?.value.trim() || '';
        if (!url) { showToast('URL is required', true); return; }
        let saved;
        if (existingItem) {
          saved = await saveItem({ ...existingItem, url, title });
        } else {
          saved = await saveItem(createItem({ layer: ItemLayer.BACKGROUND, type: ItemType.LINK, url, title }));
        }
        upsertItemInState(saved);
        showToast(existingItem ? 'Link updated' : 'Link saved');
        close();
      });
    },
  });
}

// ─── STICKY MODAL ─────────────────────────────────────────────
function showStickyModal() {
  let col = STICKY_COLORS[Math.floor(Math.random()*STICKY_COLORS.length)];
  openModal({
    title: 'New Sticky',
    fields: [
      { type:'textarea', id:'f-text',  placeholder:'Write something…', rows:4 },
      { type:'swatches', id:'f-color', value: col },
    ],
    actions: [{ id:'m-cancel', label:'Cancel' }, { id:'m-save', label:'Add Sticky', primary:true }],
    onReady: (overlay, close) => {
      overlay.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          overlay.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected'); col = sw.dataset.color;
        });
      });
      overlay.querySelector('#m-cancel').addEventListener('click', close);
      overlay.querySelector('#m-save').addEventListener('click', async () => {
        const text = overlay.querySelector('#f-text')?.value || '';
        const item = createItem({
          layer: ItemLayer.STICKY, type: ItemType.STICKY, text, color: col,
          rotation: parseFloat((Math.random()*8-4).toFixed(1)),
          position: { x: 50+Math.random()*120, y: 30+Math.random()*100, width: 175, height: 150 },
        });
        upsertItemInState(await saveItem(item));
        close();
      });
    },
  });
}

// ─── SETTINGS MODAL ───────────────────────────────────────────
function showSettingsModal() {
  openModal({
    title: 'Settings', fields: [],
    actions: [{ id:'s-export', label:'↓ Export' }, { id:'s-import', label:'↑ Import' }, { id:'s-close', label:'Close', primary:true }],
    onReady: (overlay, close) => {
      overlay.querySelector('#s-close').addEventListener('click', close);
      overlay.querySelector('#s-export').addEventListener('click', exportData);
      overlay.querySelector('#s-import').addEventListener('click', importData);
    },
  });
}

// ─── DRAWER ───────────────────────────────────────────────────
function showDrawer() {
  if (document.getElementById('drawer')) return;

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay'; overlay.id = 'drawer-overlay';

  const drawer = document.createElement('div');
  drawer.className = 'drawer opening'; drawer.id = 'drawer';

  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-title">Maké</div>
      <div class="drawer-subtitle">Your personal command center</div>
    </div>
    <div class="drawer-body">
      <div class="drawer-section-label">Organise</div>

      <div class="drawer-toggle-row" id="ambient-row">
        <span class="drawer-toggle-label">🌙 Ambient sorting</span>
        <button class="mini-toggle ${state.ambientEnabled?'on':''}" id="ambient-mini-toggle" aria-label="Ambient">
          <div class="mini-toggle-knob"></div>
        </button>
      </div>

      <div class="drawer-toggle-row">
        <span class="drawer-toggle-label">⭐ Favourites only</span>
        <button class="mini-toggle ${state._data.filterFavourites?'on':''}" id="fav-toggle" aria-label="Favourites">
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
        <span class="drawer-item-label">Sort: ${sortLabel()}</span>
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
    drawer.classList.remove('opening'); drawer.classList.add('closing');
    overlay.style.animation = 'fade-in 200ms ease reverse both';
    setTimeout(() => { drawer.remove(); overlay.remove(); }, 250);
  };

  overlay.addEventListener('click', close);

  document.getElementById('ambient-mini-toggle').addEventListener('click', e => {
    e.stopPropagation();
    state.ambientEnabled = !state.ambientEnabled;
    e.currentTarget.classList.toggle('on', state.ambientEnabled);
    state.ambientEnabled ? startAmbient() : stopAmbient();
  });

  document.getElementById('fav-toggle').addEventListener('click', e => {
    e.stopPropagation();
    state._data.filterFavourites = !state._data.filterFavourites;
    e.currentTarget.classList.toggle('on', state._data.filterFavourites);
    state._notify();
  });

  document.getElementById('drawer-search').addEventListener('click', () => { close(); setTimeout(showSearch, 300); });
  document.getElementById('drawer-sort').addEventListener('click', () => {
    close();
    setTimeout(() => {
      const r = (document.getElementById('burger-btn') || document.body).getBoundingClientRect();
      showSortMenuAt(r.right - 190, r.bottom + 8);
    }, 300);
  });
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
  menu.style.top = `${top}px`; menu.style.left = `${Math.max(8,left)}px`;

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

  const dismiss = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
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
      <input id="search-input" type="text" placeholder="Search…" autocomplete="off">
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
    const q   = input.value.trim().toLowerCase();
    const now = Date.now();
    let   res = state.backgroundItems;
    if (aType) res = res.filter(i => i.type === aType);
    if (aTime) res = res.filter(i => (i.createdAt||0) >= now - aTime);
    if (q)     res = res.filter(i =>
      (i.title||'').toLowerCase().includes(q) ||
      (i.content||'').replace(/<[^>]*>/g,'').toLowerCase().includes(q) ||
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
        <div class="card-content">${esc((item.content||item.code||item.url||'').replace(/<[^>]*>/g,'').slice(0,120))}</div>
      </div>
    `).join('');
    el.querySelectorAll('.card[data-id]').forEach(c => {
      c.addEventListener('click', () => {
        const item = state.backgroundItems.find(i => i.id === +c.dataset.id);
        if (!item) return;
        closeSearch();
        if      (item.type === 'note') showNoteEditor(item);
        else if (item.type === 'code') showCodeEditor(item);
        else                           showLinkModal(item);
      });
    });
  };

  const closeSearch = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 350);
  };

  input.addEventListener('input', run);
  overlay.querySelectorAll('.search-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      if (chip.dataset.type) {
        overlay.querySelectorAll('.search-filter-chip[data-type]').forEach(c => { if (c!==chip) c.classList.remove('active'); });
        aType = chip.classList.contains('active') ? chip.dataset.type : null;
      } else {
        overlay.querySelectorAll('.search-filter-chip[data-time]').forEach(c => { if (c!==chip) c.classList.remove('active'); });
        aTime = chip.classList.contains('active') ? +chip.dataset.time : null;
      }
      run();
    });
  });
  document.getElementById('search-cancel').addEventListener('click', closeSearch);
}

// ─── CONTEXT MENU ─────────────────────────────────────────────
function showContextMenu(evt, item) {
  document.getElementById('ctx-overlay')?.remove();
  document.getElementById('ctx-menu')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ctx-overlay'; overlay.className = 'context-menu-overlay';

  const menu = document.createElement('div');
  menu.id = 'ctx-menu'; menu.className = 'context-menu';

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
        if      (item.type === 'note') showNoteEditor(item);
        else if (item.type === 'code') showCodeEditor(item);
        else                           showLinkModal(item);
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
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  if (onReady) onReady(overlay, close);
  return { overlay, close };
}

// ─── AMBIENT ──────────────────────────────────────────────────
function initAmbient()  { if (state.ambientEnabled) startAmbient(); }
function startAmbient() { sortByTime(); clearInterval(ambientInterval); ambientInterval = setInterval(sortByTime, 3_600_000); }
function stopAmbient()  { clearInterval(ambientInterval); ambientInterval = null; }
function sortByTime() {
  const h = new Date().getHours();
  const p = h>=5&&h<12 ? 'note' : h>=12&&h<18 ? 'link' : 'code';
  state._data.backgroundItems = [...state.backgroundItems].sort((a,b) => a.type===p&&b.type!==p?-1:1);
  state._notify();
}

// ─── EXPORT / IMPORT ──────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify([...state.backgroundItems,...state.stickyItems],null,2)],{type:'application/json'});
  const a = Object.assign(document.createElement('a'),{
    href: URL.createObjectURL(blob),
    download: `make-backup-${new Date().toISOString().slice(0,10)}.json`,
  });
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
        showToast('Data imported');
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
  if (diff<60_000)     return 'just now';
  if (diff<3_600_000)  return `${Math.floor(diff/60_000)}m ago`;
  if (diff<86_400_000) return `${Math.floor(diff/3_600_000)}h ago`;
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
