/**
 * MAKÉ FEATURES — ambient.js (V2)
 * Time-of-day ambient sorting.  Runs once per hour to float the most
 * contextually relevant item type to the top of the card grid.
 *
 *   05:00–11:59  → notes first (morning planning)
 *   12:00–17:59  → links first (afternoon research / reading)
 *   18:00–04:59  → code first  (evening hacking)
 *
 * V2 fix: _sortByTime no longer mutates state._data.backgroundItems
 * directly.  It now uses the proper state.backgroundItems setter so that
 * all subscribers are notified through the same path as every other
 * state mutation.
 */

import { state } from '../core/state.js';

let _interval = null;

export function initAmbient()  { if (state.ambientEnabled) startAmbient(); }

export function startAmbient() {
  _sortByTime();
  clearInterval(_interval);
  _interval = setInterval(_sortByTime, 3_600_000); // re-sort every hour
}

export function stopAmbient() {
  clearInterval(_interval);
  _interval = null;
}

function _sortByTime() {
  const h        = new Date().getHours();
  const priority = h >= 5 && h < 12 ? 'note'
                 : h >= 12 && h < 18 ? 'link'
                 : 'code';

  // FIX: use the setter (state.backgroundItems = …) rather than
  // mutating state._data.backgroundItems directly.  Both end up
  // writing to _data, but the setter also calls _notify(), keeping
  // the reactivity chain consistent and future-proof.
  state.backgroundItems = [...state.backgroundItems].sort((a, b) => {
    if (a.type === priority && b.type !== priority) return -1;
    if (b.type === priority && a.type !== priority) return  1;
    return 0;
  });
}
