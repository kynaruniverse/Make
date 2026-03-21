/**
 * MAKÉ FEATURES — search.js (V2)
 * Full-screen search overlay with type + time filters.
 *
 * V2 fixes:
 *   - Corrected dynamic import paths (were pointing to non-existent
 *     './note-editor.js' from inside features/ — now use '../ui/' prefix)
 *   - Added sticky items to search scope
 *   - Tag search now highlights matched chips
 *   - Keyboard navigation: Arrow keys + Enter through results
 *   - Debounced input for performance on large collections
 */

import { state }          from '../core/state.js';
import { esc, relativeDate } from '../utils/helpers.js';

export function showSearch() {
  if (document.getElementById('search-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id        = 'search-overlay';
  overlay.className = 'search-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Search');

  overlay.innerHTML = `
    <div class="search-bar">
      <button class="search-cancel-btn" id="search-cancel" aria-label="Close search">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <input id="search-input" type="search" placeholder="Search notes, code, links…"
             autocomplete="off" autocorrect="off" spellcheck="false"
             aria-label="Search query" aria-autocomplete="list"
             aria-controls="search-results">
    </div>
    <div class="search-filter-chips" role="group" aria-label="Filter results">
      <button class="search-filter-chip" data-type="note"      aria-pressed="false">Notes</button>
      <button class="search-filter-chip" data-type="code"      aria-pressed="false">Code</button>
      <button class="search-filter-chip" data-type="link"      aria-pressed="false">Links</button>
      <button class="search-filter-chip" data-time="86400000"  aria-pressed="false">Today</button>
      <button class="search-filter-chip" data-time="604800000" aria-pressed="false">This week</button>
    </div>
    <div class="search-results" id="search-results" role="listbox" aria-label="Results">
      <div class="search-hint">Start typing to search…</div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const input   = overlay.querySelector('#search-input');
  const results = overlay.querySelector('#search-results');
  setTimeout(() => input.focus(), 350);

  let activeType = null;
  let activeTime = null;
  let debounceTimer;

  // ── Search logic ─────────────────────────────────────────────

  function run() {
    const q   = input.value.trim().toLowerCase();
    const now = Date.now();

    // Search both background items AND stickies (V2: was background-only)
    let res = [...state.backgroundItems, ...state.stickyItems];

    if (activeType) res = res.filter(i => i.type === activeType);
    if (activeTime) res = res.filter(i => (i.updatedAt || i.createdAt || 0) >= now - activeTime);

    if (q) {
      res = res.filter(i =>
        (i.title   || '').toLowerCase().includes(q) ||
        (i.content || '').replace(/<[^>]*>/g, '').toLowerCase().includes(q) ||
        (i.code    || '').toLowerCase().includes(q) ||
        (i.url     || '').toLowerCase().includes(q) ||
        (i.text    || '').toLowerCase().includes(q) ||
        (i.tags    || []).some(t => t.toLowerCase().includes(q))
      );
    }

    if (!q && !activeType && !activeTime) {
      results.innerHTML = '<div class="search-hint">Start typing to search…</div>';
      return;
    }
    if (!res.length) {
      results.innerHTML = '<div class="search-empty-msg">No results found</div>';
      return;
    }

    results.innerHTML = res.slice(0, 60).map(item => {
      const tags    = (item.tags || []).slice(0, 4);
      const preview = item.type === 'note'
        ? (item.content || '').replace(/<[^>]+>/g, '').slice(0, 130)
        : item.type === 'code'
          ? (item.code || '').slice(0, 130)
          : item.type === 'sticky'
            ? (item.text || '').slice(0, 130)
            : (item.url || '').slice(0, 130);

      return `
        <div class="card search-result-card" tabindex="0" role="option"
             data-id="${item.id}" data-layer="${item.layer}"
             aria-label="${esc(item.title || item.type)}">
          <div class="card-header">
            <span class="search-result-type">${item.type}</span>
            <span class="card-type-label">${esc(item.title || 'Untitled')}</span>
            <span class="search-result-time">${relativeDate(item.updatedAt || item.createdAt)}</span>
          </div>
          <div class="card-content">${esc(preview)}</div>
          ${tags.length
            ? `<div class="card-tags">${tags.map(t =>
                `<span class="tag-chip${q && t.includes(q) ? ' tag-chip--match' : ''}">${esc(t)}</span>`
              ).join('')}</div>`
            : ''}
        </div>`;
    }).join('');

    // ── Click to open ─────────────────────────────────────────
    results.querySelectorAll('.search-result-card[data-id]').forEach(card => {
      const openCard = async () => {
        const id    = +card.dataset.id;
        const layer = card.dataset.layer;
        const item  = layer === 'sticky'
          ? state.stickyItems.find(i => i.id === id)
          : state.backgroundItems.find(i => i.id === id);
        if (!item) return;
        _closeSearch(overlay);
        await _openItem(item);
      };
      card.addEventListener('click', openCard);
      card.addEventListener('keydown', e => { if (e.key === 'Enter') openCard(); });
    });
  }

  // ── Debounced input ───────────────────────────────────────────
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, 120);
  });

  // ── Filter chips ──────────────────────────────────────────────
  overlay.querySelectorAll('.search-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      chip.setAttribute('aria-pressed', chip.classList.contains('active'));

      if (chip.dataset.type) {
        overlay.querySelectorAll('.search-filter-chip[data-type]').forEach(c => {
          if (c !== chip) { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); }
        });
        activeType = chip.classList.contains('active') ? chip.dataset.type : null;
      } else {
        overlay.querySelectorAll('.search-filter-chip[data-time]').forEach(c => {
          if (c !== chip) { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); }
        });
        activeTime = chip.classList.contains('active') ? +chip.dataset.time : null;
      }
      run();
    });
  });

  // ── Keyboard navigation ───────────────────────────────────────
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') { _closeSearch(overlay); return; }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cards = [...results.querySelectorAll('.search-result-card')];
      if (!cards.length) return;
      const idx = cards.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? cards[idx + 1] || cards[0]
        : cards[idx - 1] || cards[cards.length - 1];
      next?.focus();
    }
  });

  document.getElementById('search-cancel').addEventListener('click', () => _closeSearch(overlay));
}

function _closeSearch(overlay) {
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 380);
}

async function _openItem(item) {
  // FIX: correct import paths relative to features/ directory
  if (item.type === 'note') {
    const { showNoteEditor } = await import('../ui/note-editor.js');
    showNoteEditor(item);
  } else if (item.type === 'code') {
    const { showCodeEditor } = await import('../ui/code-editor.js');
    showCodeEditor(item);
  } else if (item.type === 'link') {
    const { showLinkModal } = await import('../ui/modals.js');
    showLinkModal(item);
  } else if (item.type === 'sticky') {
    const { showStickyModal } = await import('../ui/modals.js');
    showStickyModal(item);
  }
}
