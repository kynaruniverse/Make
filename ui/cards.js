/**
 * MAKÉ UI — cards.js
 * Background-layer card grid: rendering, filtering, sorting, interaction.
 */

import { state, upsertItemInState } from '../core/state.js';
import { saveItem, deleteItem }      from '../core/storage.js';
import { ItemType }                  from '../core/schema.js';
import { esc, relativeDate, emptyIcon, iNote, iCode, iLink } from '../utils/helpers.js';

// Imported lazily at call-time to avoid circular-import init issues.
function getEditors() {
  return import('./note-editor.js').then(m => m).catch(() => null);
}
function getModals() {
  return import('./modals.js').then(m => m).catch(() => null);
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

  // FIX: use the proper getter instead of raw _data access.
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

  // Keep nav active state in sync.
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
          state.currentTab === 'notes' ? 'note'
          : state.currentTab === 'code' ? 'code snippet'
          : 'link'
        }</p>
      </div>`;
    return;
  }

  // Links tab — button grid layout.
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

  // Standard card grid — reuse existing DOM elements where possible.
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
      el.style.animationDelay = `${i * 28}ms`;
    }
    el.dataset.type = item.type;
    el.innerHTML    = _cardHTML(item);
    frag.appendChild(el);
  });

  grid.innerHTML = '';
  grid.appendChild(frag);
  _attachCardListeners();
}

// ── Card HTML ─────────────────────────────────────────────────

function _cardHTML(item) {
  const raw     = item.content || item.code || item.url || '';
  const preview = raw.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').slice(0, 200);
  const date     = item.updatedAt ? relativeDate(item.updatedAt) : '';
  const tags     = item.tags?.length
    ? `<div class="card-tags">${item.tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div>`
    : '';
  const typeIcon  = item.type === 'note' ? iNote() : item.type === 'code' ? iCode() : iLink();
  const typeLabel = item.type === 'note' ? 'Note' : item.type === 'code' ? 'Code' : 'Link';

  return `
    <div class="card-header">
      <div class="card-type-badge">${typeIcon}</div>
      <span class="card-type-label">${typeLabel}: ${esc(item.title || 'Untitled')}</span>
    </div>
    <div class="card-content">${esc(preview)}</div>
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

// ── Listeners ─────────────────────────────────────────────────

function _attachCardListeners() {
  document.querySelectorAll('.card[data-id]').forEach(card => {
    card.addEventListener('click', async e => {
      if (e.target.closest('.card-fav')) return;
      const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
      if (!item) return;
      await _openEditor(item);
    });

    card.addEventListener('contextmenu', async e => {
      e.preventDefault();
      const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
      if (item) {
        const m = await getModals();
        m?.showContextMenu(e, item);
      }
    });

    let pressTimer;
    card.addEventListener('touchstart', e => {
      pressTimer = setTimeout(async () => {
        const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
        if (item) {
          const m = await getModals();
          m?.showContextMenu(e.touches[0], item);
        }
      }, 500);
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
    });
  });
}

function _attachLinkListeners() {
  document.querySelectorAll('.link-btn[data-id]').forEach(btn => {
    btn.addEventListener('contextmenu', async e => {
      e.preventDefault();
      const item = state.backgroundItems.find(i => i.id === +btn.dataset.id);
      if (item) {
        const m = await getModals();
        m?.showContextMenu(e, item);
      }
    });

    let pressTimer;
    btn.addEventListener('touchstart', e => {
      pressTimer = setTimeout(async () => {
        e.preventDefault();
        const item = state.backgroundItems.find(i => i.id === +btn.dataset.id);
        if (item) {
          const m = await getModals();
          m?.showContextMenu(e.touches[0], item);
        }
      }, 500);
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
