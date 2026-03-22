/**
 * MAKÉ — app.js (V12)
 *
 * V12 — Landing page + onboarding:
 *   – index.html is now the landing page; app lives in app.html
 *   – First-run onboarding shown to new users explaining privacy,
 *     data storage, and prompting to set up the backup file
 *   – share_target support: incoming shared URLs auto-open link modal
 *
 * V11 (retained): persistence + auto-backup
 * V10 (retained): date top-left, burger in canvas toolbar
 */

import { state, loadInitialData }        from './core/state.js';
import { isUsingFallback, requestPersistence, getPersistenceState, autoBackupIfDue } from './core/storage.js';
import { renderCards }                   from './ui/cards.js';
import { renderStickies }                from './ui/stickies.js';
import { showNoteEditor }                from './ui/note-editor.js';
import { showCodeEditor }                from './ui/code-editor.js';
import { showLinkModal, showStickyModal, showSettingsModal } from './ui/modals.js';
import { showDrawer }                    from './features/drawer.js';
import { initAmbient }                   from './features/ambient.js';
import { showToast }                     from './utils/helpers.js';
import { hasOnboarded, showOnboarding }  from './features/onboarding.js';

const app = document.getElementById('app');

async function init() {
  app.innerHTML = `
    <div class="make-loading">
      <div class="make-loading-spinner"></div>
      <span>Loading Maké…</span>
    </div>`;

  _applyTheme(_getTheme());
  await loadInitialData();

  if (isUsingFallback()) {
    console.warn('[Maké] Running on localStorage fallback.');
    showToast('Storage limited — data saved locally only', true);
  }

  app.querySelector('.make-loading')?.remove();
  _buildShell();
  renderCards();
  renderStickies();
  _attachShellListeners();
  _attachGlobalShortcuts();

  // Request persistent storage — protects data from browser clear
  requestPersistence().then(status => {
    if (status === 'denied') {
      // Show a gentle one-time nudge to install the PWA for full protection
      const shown = localStorage.getItem('make_persist_nudge');
      if (!shown) {
        localStorage.setItem('make_persist_nudge', '1');
        showToast('💡 Install as app for protected storage', false);
      }
    }
  });

  // Hook auto-backup into every state change that involves a save
  // We expose a global helper so ui modules can call it after saveItem
  window._makeAutoBackup = async () => {
    const all = [...state.backgroundItems, ...state.stickyItems];
    await autoBackupIfDue(all);
  };

  // Handle Web Share Target (PWA share_target in manifest)
  _handleShareTarget();

  // Show onboarding on first run — awaited so UI is ready first
  if (!hasOnboarded()) {
    await showOnboarding();
  }

  state.subscribe(() => {
    renderCards();
    renderStickies();
    _syncAddMenu();
    _syncAmbientToggle();
    _syncNavTabs();
    _syncItemCount();
  });

  initAmbient();
  _syncItemCount();
  _initOfflineBanner();
  _initLiveTimestamps();
}

// ── Offline detection ─────────────────────────────────────────
function _initOfflineBanner() {
  const show = () => {
    if (document.getElementById('offline-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.innerHTML = `<svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/><path d="M5 12.55a10.94 10.94 0 015.17-2.39"/><path d="M10.71 5.05A16 16 0 0122.56 9"/><path d="M1.42 9a15.91 15.91 0 014.7-2.88"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>Offline — data is safe, changes save locally`;
    document.body.prepend(banner);
  };
  const hide = () => document.getElementById('offline-banner')?.remove();

  if (!navigator.onLine) show();
  window.addEventListener('online',  hide);
  window.addEventListener('offline', show);
}

// ── Live timestamp refresh (every 60s) ───────────────────────
function _initLiveTimestamps() {
  setInterval(() => {
    // Only re-render if cards are visible and there are items
    if (state.backgroundItems.length || state.stickyItems.length) {
      renderCards();
    }
  }, 60_000);
}

// ── Theme ────────────────────────────────────────────────────
function _getTheme()  { return localStorage.getItem('make_theme') || 'light'; }
function _setTheme(t) { localStorage.setItem('make_theme', t); _applyTheme(t); }
function _applyTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else              document.documentElement.removeAttribute('data-theme');
}
function _toggleTheme() {
  const next = _getTheme() === 'dark' ? 'light' : 'dark';
  _setTheme(next);
  const btn = document.getElementById('theme-toggle');
  btn?.classList.toggle('on', next === 'dark');
  btn?.setAttribute('aria-pressed', next === 'dark');
}

// ── Date ─────────────────────────────────────────────────────
function _getLiveDate() {
  const now  = new Date();
  return {
    day:  now.toLocaleDateString('en-GB', { weekday: 'long' }),
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

// ── Shell ─────────────────────────────────────────────────────
function _buildShell() {
  const { day, date } = _getLiveDate();
  const isDark = _getTheme() === 'dark';

  app.innerHTML = `
    <!-- ══ REDESIGNED HEADER (V16) ══
         Left: elegant pill date — no heavy box
         Centre: Maké branding breathes freely
         Right: theme toggle + menu icon (compact)  -->
    <div class="app-header">
      <div class="header-row">

        <div class="date-pill" id="date-widget" aria-label="Today's date">
          <span class="date-pill-day">${day}</span>
          <span class="date-pill-sep">·</span>
          <span class="date-pill-date">${date}</span>
        </div>

        <h1 class="app-title">Maké</h1>

        <div class="header-actions">
          <button class="toggle-track ${isDark ? 'on' : ''}" id="theme-toggle"
                  aria-label="Toggle theme" aria-pressed="${isDark}">
            <div class="toggle-knob"></div>
          </button>
          <button class="hdr-icon-btn" id="burger-btn" aria-label="Open menu">
            <svg viewBox="0 0 24 24">
              <line x1="3" y1="7"  x2="21" y2="7"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="17" x2="21" y2="17"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Collapsible search bar -->
      <div class="header-search-row" id="header-search-row">
        <button class="search-pill" id="canvas-search-btn" aria-label="Search (⌘K)">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>Search notes, code, links…</span>
          <kbd class="search-kbd">⌘K</kbd>
        </button>
        <span class="canvas-item-count" id="canvas-item-count"></span>
      </div>
    </div>

    <div class="canvas">
      <div class="grid-layer" id="grid-layer">
        <div class="masonry-grid" id="grid-container"></div>
      </div>
      <div class="sticky-layer" id="sticky-layer"></div>
    </div>

    <div class="add-menu hidden" id="add-menu" role="menu" aria-label="Add item">
      <button data-type="note"   class="add-menu-item" role="menuitem">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/></svg>
        <span>New Note</span>
      </button>
      <button data-type="code"   class="add-menu-item" role="menuitem">
        <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/></svg>
        <span>Code Snippet</span>
      </button>
      <button data-type="link"   class="add-menu-item" role="menuitem">
        <svg viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        <span>Add Link</span>
      </button>
      <button data-type="sticky" class="add-menu-item" role="menuitem">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/></svg>
        <span>Sticky Note</span>
      </button>
    </div>

    <!-- ══ DOCK-STYLE BOTTOM NAV (V16) ══ -->
    <nav class="bottom-nav" role="navigation" aria-label="Main navigation">
      <button class="nav-btn ${state.currentTab === 'links' ? 'active' : ''}"
              data-tab="links" aria-label="Links" title="Links"
              aria-current="${state.currentTab === 'links' ? 'page' : 'false'}">
        <svg viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        <span class="nav-btn-label">Links</span>
      </button>
      <button class="nav-btn ${state.currentTab === 'notes' ? 'active' : ''}"
              data-tab="notes" aria-label="Notes" title="Notes (⌘N)"
              aria-current="${state.currentTab === 'notes' ? 'page' : 'false'}">
        <svg viewBox="0 0 24 24">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        <span class="nav-btn-label">Notes</span>
      </button>
      <button class="nav-btn-fab" id="fab" aria-label="Add new item" aria-haspopup="menu">
        <svg viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5"  y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="nav-btn ${state.currentTab === 'code' ? 'active' : ''}"
              data-tab="code" aria-label="Code" title="Code (⌘N)"
              aria-current="${state.currentTab === 'code' ? 'page' : 'false'}">
        <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/></svg>
        <span class="nav-btn-label">Code</span>
      </button>
      <button class="nav-btn" id="settings-btn" aria-label="Settings" title="Settings">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        <span class="nav-btn-label">Settings</span>
      </button>
    </nav>
  `;
}

// ── Listeners ─────────────────────────────────────────────────
// Persist scroll position per tab
const _scrollMap = new Map();

function _saveScrollPos() {
  const layer = document.getElementById('grid-layer');
  if (layer) _scrollMap.set(state.currentTab, layer.scrollTop);
}

function _restoreScrollPos() {
  const layer = document.getElementById('grid-layer');
  if (layer) layer.scrollTop = _scrollMap.get(state.currentTab) || 0;
}

function _attachShellListeners() {
  app.addEventListener('click', e => {
    const tab = e.target.closest('.nav-btn[data-tab]');
    if (tab) {
      _saveScrollPos();
      state.currentTab = tab.dataset.tab;
      requestAnimationFrame(_restoreScrollPos);
      return;
    }
    if (e.target.closest('#fab')) {
      const wasOpen = state.showAddMenu;
      state.showAddMenu = !wasOpen;
      if (!wasOpen) {
        // Move focus to first menu item (focus trap)
        requestAnimationFrame(() => {
          const first = document.querySelector('.add-menu-item');
          first?.focus();
        });
      }
      return;
    }
    if (state.showAddMenu && !e.target.closest('#add-menu') && !e.target.closest('#fab')) {
      state.showAddMenu = false;
    }
  });

  document.getElementById('add-menu').addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    state.showAddMenu = false;
    switch (btn.dataset.type) {
      case 'sticky': showStickyModal(); break;
      case 'note':   showNoteEditor();  break;
      case 'code':   showCodeEditor();  break;
      case 'link':   showLinkModal();   break;
    }
  });

  document.getElementById('theme-toggle').addEventListener('click', _toggleTheme);
  document.getElementById('burger-btn').addEventListener('click', showDrawer);
  document.getElementById('settings-btn').addEventListener('click', showSettingsModal);

  // Canvas search — instant, no drawer required
  document.getElementById('canvas-search-btn').addEventListener('click', async () => {
    const { showSearch } = await import('./features/search.js');
    showSearch();
  });

  // Live date tick — updates pill elements
  setInterval(() => {
    const { day, date } = _getLiveDate();
    const dw = document.getElementById('date-widget');
    if (dw) {
      const dayEl  = dw.querySelector('.date-pill-day');
      const dateEl = dw.querySelector('.date-pill-date');
      if (dayEl)  dayEl.textContent  = day;
      if (dateEl) dateEl.textContent = date;
    }
  }, 60_000);
}

// ── Global shortcuts ──────────────────────────────────────────
function _attachGlobalShortcuts() {
  document.addEventListener('keydown', async e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const { showSearch } = await import('./features/search.js');
      showSearch();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      if      (state.currentTab === 'notes') showNoteEditor();
      else if (state.currentTab === 'code')  showCodeEditor();
      else if (state.currentTab === 'links') showLinkModal();
      return;
    }
    if (e.key === 'Escape' && state.showAddMenu) {
      state.showAddMenu = false;
      document.getElementById('fab')?.focus();
      return;
    }

    // ── Arrow-key grid navigation ─────────────────────────────
    const focused = document.activeElement;
    const card = focused?.closest('.card[data-id]');
    if (card && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const grid = document.getElementById('grid-container');
      if (!grid) return;
      const cards = [...grid.querySelectorAll('.card[data-id]')];
      if (!cards.length) return;
      const idx = cards.indexOf(card);
      // Determine columns from grid layout
      const cols = Math.round(grid.clientWidth / (cards[0].offsetWidth + 10)) || 3;
      let next = -1;
      if (e.key === 'ArrowRight') next = idx + 1;
      if (e.key === 'ArrowLeft')  next = idx - 1;
      if (e.key === 'ArrowDown')  next = idx + cols;
      if (e.key === 'ArrowUp')    next = idx - cols;
      if (next >= 0 && next < cards.length) cards[next].focus();
      return;
    }
  });
}

// ── Sync helpers ──────────────────────────────────────────────
function _syncAddMenu() {
  document.getElementById('add-menu')?.classList.toggle('hidden', !state.showAddMenu);
}
function _syncAmbientToggle() {
  document.getElementById('ambient-mini-toggle')?.classList.toggle('on', state.ambientEnabled);
}
function _syncNavTabs() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    const active = btn.dataset.tab === state.currentTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
}
function _syncItemCount() {
  const el = document.getElementById('canvas-item-count');
  if (!el) return;
  const tab   = state.currentTab;
  const type  = tab === 'notes' ? 'note' : tab === 'code' ? 'code' : 'link';
  const label = tab === 'notes' ? 'note' : tab === 'code' ? 'snippet' : 'link';
  const n     = state.backgroundItems.filter(i => i.type === type).length;
  el.textContent = n ? `${n} ${label}${n !== 1 ? 's' : ''}` : '';
}

init();

// ── Web Share Target ──────────────────────────────────────────
function _handleShareTarget() {
  const params = new URLSearchParams(window.location.search);
  const url    = params.get('url');
  const title  = params.get('title') || '';
  const text   = params.get('text')  || '';
  if (!url && !text) return;
  window.history.replaceState({}, '', window.location.pathname);
  setTimeout(() => {
    if (url) showLinkModal({ url, title: title || text || url });
    else if (text) showNoteEditor({ content: text, title });
  }, 600);
}
