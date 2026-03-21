/**
 * MAKÉ FEATURES — data.js (V2)
 * Export and import of all items as JSON backup.
 *
 * FIX: importData no longer deletes item.id before saving.  Instead it uses
 * a content-hash to detect duplicates, so re-importing a backup will skip
 * any item that already exists rather than creating clones.
 */

import { state, upsertItemInState } from '../core/state.js';
import { saveItem } from '../core/storage.js';
import { showToast } from '../utils/helpers.js';

// ── Export ────────────────────────────────────────────────────

export function exportData() {
  const all = [...state.backgroundItems, ...state.stickyItems];
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `make-backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Exported ${all.length} item${all.length !== 1 ? 's' : ''}`);
}

// ── Import ────────────────────────────────────────────────────

export function importData() {
  const input = Object.assign(document.createElement('input'), {
    type: 'file',
    accept: '.json',
  });
  
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const incoming = JSON.parse(ev.target.result);
        if (!Array.isArray(incoming)) throw new Error('Not an array');
        
        // Build a set of content fingerprints for existing items so we can
        // skip exact duplicates without relying on IDs (which may differ
        // across devices or after a previous import).
        const existingFingerprints = new Set(
          [...state.backgroundItems, ...state.stickyItems].map(_fingerprint)
        );
        
        let added = 0;
        let skipped = 0;
        
        for (const raw of incoming) {
          const fp = _fingerprint(raw);
          
          if (existingFingerprints.has(fp)) {
            skipped++;
            continue;
          }
          
          // FIX: strip the old ID so IndexedDB assigns a fresh one — but only
          // after dedup check, so we don't rely on IDs for identity.
          const { id: _dropped, ...itemWithoutId } = raw;
          const saved = await saveItem(itemWithoutId);
          upsertItemInState(saved);
          existingFingerprints.add(fp);
          added++;
        }
        
        const msg = skipped > 0 ?
          `Imported ${added} item${added !== 1 ? 's' : ''} (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped)` :
          `Imported ${added} item${added !== 1 ? 's' : ''}`;
        
        showToast(msg);
        
      } catch (err) {
        console.error('[Maké] Import failed:', err);
        showToast('Invalid backup file', true);
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * _fingerprint(item)
 * Produces a string key based on the item's meaningful content fields.
 * Deliberately excludes id, createdAt, updatedAt, and checkpoint.
 */
function _fingerprint(item) {
  return [
    item.layer || '',
    item.type || '',
    item.title || '',
    item.content || '',
    item.code || '',
    item.url || '',
    item.text || '',
    item.language || '',
  ].join('\u0000');
}