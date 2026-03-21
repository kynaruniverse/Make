/**
 * MAKÉ UI — stickies.js
 * Floating sticky-note layer.
 *
 * FIX: dragCleanups / resizeCleanups are now called when a sticky is deleted,
 * preventing document-level event listener leaks.
 */

import { state, upsertItemInState, removeItemFromState } from '../core/state.js';
import { saveItem, deleteItem, updateItemPosition }       from '../core/storage.js';
import { makeDraggable }  from '../utils/drag.js';
import { makeResizable }  from '../utils/resize.js';
import { esc }            from '../utils/helpers.js';

const STICKY_COLORS      = ['#fff176','#a5d6a7','#90caf9','#f48fb1','#ce93d8','#ffcc80'];
const STICKY_TAPE_COLORS = [
  'rgba(255,255,255,0.55)', 'rgba(200,240,210,0.55)',
  'rgba(180,220,255,0.55)', 'rgba(255,190,210,0.55)',
  'rgba(220,180,255,0.55)', 'rgba(255,210,160,0.55)',
];

// FIX: cleanup maps now live in this module and are properly called on delete.
const dragCleanups   = new Map();
const resizeCleanups = new Map();

// ── Rendering ─────────────────────────────────────────────────

export function renderStickies() {
  const layer = document.getElementById('sticky-layer');
  if (!layer) return;

  const existing = new Map();
  layer.querySelectorAll('.sticky-note[data-id]').forEach(el =>
    existing.set(+el.dataset.id, el)
  );

  const ids = new Set(state.stickyItems.map(i => i.id));

  // Remove stickies that are no longer in state.
  existing.forEach((el, id) => {
    if (!ids.has(id)) {
      _cleanupSticky(id);
      el.remove();
    }
  });

  // Add or update stickies.
  state.stickyItems.forEach(item => {
    let el = existing.get(item.id);
    if (!el) {
      el = _makeStickyEl(item);
      layer.appendChild(el);
      _attachStickyBehaviour(el, item);
      requestAnimationFrame(() => el.classList.add('sticky-dropped'));
    } else {
      // Update colour / rotation without rebuilding the whole element.
      const colorIdx = STICKY_COLORS.indexOf(item.color);
      el.style.setProperty('--sticky-color', item.color || STICKY_COLORS[0]);
      el.style.setProperty('--sticky-tape',  STICKY_TAPE_COLORS[colorIdx >= 0 ? colorIdx : 0]);
      el.style.setProperty('--sticky-r',     `${item.rotation || 0}deg`);
      el.style.transform = `rotate(${item.rotation || 0}deg)`;
    }
  });
}

// ── Element factory ───────────────────────────────────────────

function _makeStickyEl(item) {
  const x       = item.position?.x      || (50  + Math.random() * 120);
  const y       = item.position?.y      || (30  + Math.random() * 100);
  const w       = item.position?.width  || 175;
  const h       = item.position?.height || 150;
  const rot     = item.rotation || 0;
  const col     = item.color || STICKY_COLORS[0];
  const colorIdx = STICKY_COLORS.indexOf(col);
  const tape    = STICKY_TAPE_COLORS[colorIdx >= 0 ? colorIdx : 0];

  const el = document.createElement('div');
  el.className  = 'sticky-note';
  el.dataset.id = item.id;
  el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;` +
    `--sticky-color:${col};--sticky-tape:${tape};--sticky-r:${rot}deg;transform:rotate(${rot}deg);`;

  el.innerHTML = `
    <div class="sticky-tape"></div>
    <div class="sticky-inner">
      <div class="sticky-header">
        <button class="sticky-delete" aria-label="Delete sticky">✕</button>
      </div>
      <textarea class="sticky-textarea" placeholder="Write something…">${esc(item.text || '')}</textarea>
    </div>
    <div class="sticky-fold"></div>
  `;
  return el;
}

// ── Behaviour wiring ──────────────────────────────────────────

function _attachStickyBehaviour(el, item) {
  const id = item.id;

  // Delete button — FIX: call cleanup before removing from DOM.
  el.querySelector('.sticky-delete').addEventListener('click', async e => {
    e.stopPropagation();
    el.classList.add('sticky-deleting');
    setTimeout(async () => {
      _cleanupSticky(id);          // ← FIX: remove document listeners
      await deleteItem(id);
      removeItemFromState(id);
      el.remove();
    }, 200);
  });

  // Auto-save textarea content.
  const ta = el.querySelector('.sticky-textarea');
  let debounce;
  ta.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const found = state.stickyItems.find(i => i.id === id);
      if (found) {
        found.text = ta.value;
        upsertItemInState(await saveItem(found));
      }
    }, 600);
  });

  // Drag.
  dragCleanups.set(id, makeDraggable(el, null, null, async (left, top) => {
    await updateItemPosition(id, {
      x: left, y: top,
      width:  parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    });
  }));

  // Resize — FIX: makeResizable appends handle inside el, cleanup removes it.
  resizeCleanups.set(`r${id}`, makeResizable(el, null, null, async (width, height) => {
    await updateItemPosition(id, {
      x:      parseFloat(el.style.left),
      y:      parseFloat(el.style.top),
      width, height,
    });
  }));
}

// ── Cleanup helper ────────────────────────────────────────────

/** Remove all document-level listeners attached to a sticky, then clear maps. */
function _cleanupSticky(id) {
  const dragCleanup   = dragCleanups.get(id);
  const resizeCleanup = resizeCleanups.get(`r${id}`);
  if (dragCleanup)   { dragCleanup();   dragCleanups.delete(id); }
  if (resizeCleanup) { resizeCleanup(); resizeCleanups.delete(`r${id}`); }
}

// ── Exports ───────────────────────────────────────────────────
export { STICKY_COLORS, STICKY_TAPE_COLORS };
