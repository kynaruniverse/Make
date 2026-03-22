/**
 * MAKÉ UI — cards.js (V16)
 *
 * V16 — Visual evolution per design memo:
 *   - Masonry layout (JS column-based) for notes/code tabs
 *   - Glassmorphism cards: semi-transparent with backdrop-blur
 *   - Sans-serif preview font for notes; monospace reserved for code
 *   - Visual teasers: link/URL icon badge and tag indicator on cards
 *   - Enriched empty state with SVG illustration + motivational quote
 *   - Pull-to-refresh with Maké logo pulse animation
 */

import { state, upsertItemInState } from '../core/state.js';
import { saveItem, deleteItem }      from '../core/storage.js';
import { ItemType }                  from '../core/schema.js';
import { esc, relativeDate, emptyIcon, iNote, iCode, iLink } from '../utils/helpers.js';

function getEditors() {
  return import('./note-editor.js').then(m => m).catch(() => null);
}
function getModals() {
  return import('./modals.js').then(m => m).catch(() => null);
}

// ── Pull-to-refresh ───────────────────────────────────────────
let _ptrStartY = 0;
let _ptrActive = false;
const PTR_THRESHOLD = 72;

function _initPullToRefresh(layer) {
  let indicator = null;

  layer.addEventListener('touchstart', e => {
    if (layer.scrollTop > 2) return;
    _ptrStartY = e.touches[0].clientY;
    _ptrActive = true;
  }, { passive: true });

  layer.addEventListener('touchmove', e => {
    if (!_ptrActive) return;
    const dy = e.touches[0].clientY - _ptrStartY;
    if (dy < 8) return;

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'ptr-indicator';
      indicator.innerHTML = `<div class="ptr-logo">Maké</div>`;
      layer.prepend(indicator);
    }

    const progress = Math.min(dy / PTR_THRESHOLD, 1);
    indicator.style.height = `${Math.min(dy * 0.45, PTR_THRESHOLD * 0.45)}px`;
    indicator.style.opacity = String(progress);
    if (progress >= 1) indicator.querySelector('.ptr-logo').classList.add('ptr-ready');
    else indicator.querySelector('.ptr-logo').classList.remove('ptr-ready');
  }, { passive: true });

  layer.addEventListener('touchend', e => {
    if (!_ptrActive) return;
    _ptrActive = false;
    const dy = e.changedTouches[0].clientY - _ptrStartY;

    if (indicator) {
      if (dy >= PTR_THRESHOLD) {
        // Trigger refresh animation then re-render
        indicator.querySelector('.ptr-logo').classList.add('ptr-spin');
        setTimeout(() => {
          indicator?.remove();
          indicator = null;
          // Re-render cards (timestamps refresh, etc.)
          renderCards();
        }, 700);
      } else {
        indicator.remove();
        indicator = null;
      }
    }
  });
}

// ── Filtering / sorting ───────────────────────────────────────

export function getFilteredItems() {
  const tab = state.currentTab;
  let items = state.backgroundItems.filter(i => {
    if (tab === 'notes') return i.type === ItemType.NOTE;
    if (tab === 'code')  return i.type === ItemType.CODE;
    if (tab === 'links') return i.type === ItemType.LINK;
    return true;
  });

  if (state.filterFavourites) items = items.filter(i => i.isFavorited);

  const field = state.sortField;
  const dir   = state.sortDir;
  return [...items].sort((a, b) => {
    if (field === 'title') {
      const av = (a.title || '').toLowerCase();
      const bv = (b.title || '').toLowerCase();
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const av = (field === 'createdAt' ? a.createdAt : a.updatedAt) || 0;
    const bv = (field === 'createdAt' ? b.createdAt : b.updatedAt) || 0;
    return dir === 'asc' ? av - bv : bv - av;
  });
}

// ── Rendering ─────────────────────────────────────────────────

export function renderCards() {
  const grid = document.getElementById('grid-container');
  if (!grid) return;

  // Init pull-to-refresh once on the grid-layer
  const layer = document.getElementById('grid-layer');
  if (layer && !layer.dataset.ptr) {
    layer.dataset.ptr = '1';
    _initPullToRefresh(layer);
  }

  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === state.currentTab)
  );

  const items = getFilteredItems();

  if (items.length === 0) {
    grid.className = 'grid';
    grid.innerHTML = _emptyStateHTML(state.currentTab);
    return;
  }

  // Links tab — button grid
  if (state.currentTab === 'links') {
    grid.className = 'links-grid';
    grid.innerHTML = items.map(item => `
      <a class="link-btn" data-id="${item.id}"
         href="${esc(item.url || '#')}" target="_blank" rel="noopener noreferrer"
         title="${esc(item.url || '')}">
        <div class="link-btn-icon">
          <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </div>
        <span class="link-btn-label">${esc(item.title || item.url || 'Link')}</span>
      </a>
    `).join('');
    _attachLinkListeners();
    return;
  }

  // Use list mode if set
  if (state.viewMode === 'list') {
    grid.className = 'list-grid';
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className  = 'card card-animate-in glass-card';
      el.dataset.id   = item.id;
      el.dataset.type = item.type;
      el.tabIndex     = 0;
      el.style.animationDelay = `${i * 20}ms`;
      el.innerHTML = _cardHTML(item);
      frag.appendChild(el);
    });
    grid.appendChild(frag);
    _attachCardListeners();
    return;
  }

  // Masonry grid for notes/code
  grid.className = 'masonry-grid';
  grid.innerHTML = '';
  _renderMasonry(grid, items);
  _attachCardListeners();
}

// ── Masonry layout ────────────────────────────────────────────

function _renderMasonry(grid, items) {
  const COLS = window.innerWidth < 480 ? 2 : 3;

  // Create column wrappers
  const cols = Array.from({ length: COLS }, () => {
    const col = document.createElement('div');
    col.className = 'masonry-col';
    grid.appendChild(col);
    return col;
  });

  // Track heights to balance columns
  const heights = new Array(COLS).fill(0);

  items.forEach((item, i) => {
    // Estimate card height by content length
    const plain   = (item.content || item.code || '').replace(/<[^>]*>/g, '');
    const lines   = Math.min(Math.ceil(plain.length / 28), 10);
    const estH    = 80 + lines * 18 + (item.tags?.length ? 24 : 0);

    // Place in shortest column
    const colIdx = heights.indexOf(Math.min(...heights));
    heights[colIdx] += estH + 14; // 14 = gap

    const el = document.createElement('div');
    el.className  = 'card card-animate-in glass-card masonry-card';
    el.dataset.id   = item.id;
    el.dataset.type = item.type;
    el.tabIndex     = 0;
    el.style.animationDelay = `${i * 28}ms`;
    el.innerHTML = _cardHTML(item);
    cols[colIdx].appendChild(el);
  });
}

// ── Card HTML ─────────────────────────────────────────────────

function _cardHTML(item) {
  const raw     = item.content || item.code || item.url || '';
  const preview = raw.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').slice(0, 240);
  const date     = item.updatedAt ? relativeDate(item.updatedAt) : '';
  const tags     = item.tags?.length
    ? `<div class="card-tags">${item.tags.slice(0,4).map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div>`
    : '';
  const typeIcon  = item.type === 'note' ? iNote() : item.type === 'code' ? iCode() : iLink();
  const typeLabel = item.type === 'note' ? 'Note' : item.type === 'code' ? 'Code' : 'Link';

  // Visual teasers
  const teasers = _buildTeasers(item);

  // Content font class: monospace only for code
  const contentClass = item.type === 'code' ? 'card-content card-content--mono' : 'card-content';

  return `
    <div class="card-header">
      <div class="card-type-badge">${typeIcon}</div>
      <span class="card-type-label">${typeLabel}: ${esc(item.title || 'Untitled')}</span>
    </div>
    <div class="${contentClass}">${esc(preview)}</div>
    ${teasers}
    ${tags}
    <div class="card-meta">
      <span class="card-meta-time">${date}</span>
      <button class="card-fav ${item.isFavorited ? 'active' : ''}" data-id="${item.id}"
              aria-label="${item.isFavorited ? 'Unfavorite' : 'Favorite'}">
        <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </button>
    </div>
  `;
}

function _buildTeasers(item) {
  const bits = [];

  // URL teaser for notes that contain a link
  const urlMatch = (item.content || '').match(/href="([^"]+)"/);
  const rawUrl   = !urlMatch && (item.content || item.text || '').match(/https?:\/\/[^\s<"]+/);
  if (urlMatch || rawUrl) {
    const href = urlMatch ? urlMatch[1] : rawUrl[0];
    const domain = (() => { try { return new URL(href).hostname.replace('www.',''); } catch { return ''; } })();
    if (domain) bits.push(`<span class="card-teaser card-teaser--link">
      <svg viewBox="0 0 24 24" width="9" height="9"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      ${esc(domain)}
    </span>`);
  }

  // Code language badge
  if (item.type === 'code' && item.language && item.language !== 'plaintext') {
    bits.push(`<span class="card-teaser card-teaser--lang">${esc(item.language)}</span>`);
  }

  return bits.length ? `<div class="card-teasers">${bits.join('')}</div>` : '';
}

// ── Empty state ───────────────────────────────────────────────

const QUOTES = [
  "Every great idea starts as a single note.",
  "Capture it now. Refine it later.",
  "Your command center awaits its first command.",
  "The blank canvas is where everything begins.",
  "One note changes everything.",
];

function _emptyStateHTML(tab) {
  const quote = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
  const typeLabel = tab === 'notes' ? 'note' : tab === 'code' ? 'snippet' : 'link';

  const illustration = `
    <svg class="empty-illustration" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="15" width="55" height="70" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
      <rect x="30" y="28" width="35" height="3" rx="1.5" fill="rgba(182,141,147,0.45)"/>
      <rect x="30" y="36" width="28" height="2.5" rx="1.25" fill="rgba(255,255,255,0.15)"/>
      <rect x="30" y="43" width="32" height="2.5" rx="1.25" fill="rgba(255,255,255,0.10)"/>
      <rect x="30" y="50" width="24" height="2.5" rx="1.25" fill="rgba(255,255,255,0.08)"/>
      <circle cx="88" cy="28" r="14" fill="rgba(182,141,147,0.14)" stroke="rgba(182,141,147,0.28)" stroke-width="1.5"/>
      <line x1="88" y1="23" x2="88" y2="33" stroke="rgba(182,141,147,0.70)" stroke-width="2" stroke-linecap="round"/>
      <line x1="83" y1="28" x2="93" y2="28" stroke="rgba(182,141,147,0.70)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="35" cy="80" r="5" fill="rgba(182,141,147,0.20)" stroke="rgba(182,141,147,0.35)" stroke-width="1"/>
      <circle cx="90" cy="65" r="3.5" fill="rgba(182,141,147,0.15)" stroke="rgba(182,141,147,0.28)" stroke-width="1"/>
    </svg>`;

  return `
    <div class="empty-state">
      ${illustration}
      <p class="empty-title">No ${tab} yet</p>
      <p class="empty-quote">"${esc(quote)}"</p>
      <p class="empty-hint">Tap <strong>+</strong> to add your first ${typeLabel}</p>
    </div>`;
}

// ── Listeners ─────────────────────────────────────────────────

function _attachCardListeners() {
  document.querySelectorAll('.card[data-id]').forEach(card => {
    card.addEventListener('click', async e => {
      if (e.target.closest('.card-fav')) return;
      const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
      if (!item) return;
      await _openEditor(item);
    });

    card.addEventListener('keydown', async e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
        if (item) await _openEditor(item);
      }
    });

    card.addEventListener('contextmenu', async e => {
      e.preventDefault();
      const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
      if (item) { const m = await getModals(); m?.showContextMenu(e, item); }
    });

    let pressTimer;
    card.addEventListener('touchstart', e => {
      pressTimer = setTimeout(async () => {
        const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
        if (item) {
          navigator.vibrate?.(18);
          const m = await getModals();
          m?.showContextMenu(e.touches[0], item);
        }
      }, 500);
      const hintTimer = setTimeout(() => card.classList.add('long-pressing'), 200);
      card.addEventListener('touchend',  () => { clearTimeout(hintTimer); card.classList.remove('long-pressing'); }, { once: true });
      card.addEventListener('touchmove', () => { clearTimeout(hintTimer); card.classList.remove('long-pressing'); }, { once: true });
    }, { passive: true });
    card.addEventListener('touchend',  () => clearTimeout(pressTimer));
    card.addEventListener('touchmove', () => clearTimeout(pressTimer));
  });

  document.querySelectorAll('.card-fav').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const item = state.backgroundItems.find(i => i.id === +btn.dataset.id);
      if (!item) return;
      item.isFavorited = !item.isFavorited;
      upsertItemInState(await saveItem(item));
      window._makeAutoBackup?.();
    });
  });
}

function _attachLinkListeners() {
  document.querySelectorAll('.link-btn[data-id]').forEach(btn => {
    btn.addEventListener('contextmenu', async e => {
      e.preventDefault();
      const item = state.backgroundItems.find(i => i.id === +btn.dataset.id);
      if (item) { const m = await getModals(); m?.showContextMenu(e, item); }
    });

    let pressTimer;
    btn.addEventListener('touchstart', e => {
      pressTimer = setTimeout(async () => {
        e.preventDefault();
        const item = state.backgroundItems.find(i => i.id === +btn.dataset.id);
        if (item) {
          navigator.vibrate?.(18);
          const m = await getModals();
          m?.showContextMenu(e.touches[0], item);
        }
      }, 500);
      const hintTimer = setTimeout(() => btn.classList.add('long-pressing'), 200);
      const clearHint = () => { clearTimeout(hintTimer); btn.classList.remove('long-pressing'); };
      btn.addEventListener('touchend',  clearHint, { once: true });
      btn.addEventListener('touchmove', clearHint, { once: true });
    }, { passive: true });
    btn.addEventListener('touchend',  () => clearTimeout(pressTimer));
    btn.addEventListener('touchmove', () => clearTimeout(pressTimer));
  });
}

async function _openEditor(item) {
  if (item.type === 'note') {
    const m = await import('./note-editor.js');
    m.showNoteEditor(item);
  } else if (item.type === 'code') {
    const m = await import('./code-editor.js');
    m.showCodeEditor(item);
  } else {
    const m = await getModals();
    m?.showLinkModal(item);
  }
}
