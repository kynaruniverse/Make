/**
 * MAKÉ UI — modals.js (V13)
 *
 * V13 changes:
 *   – Context menu: "Save As" option added for all item types
 *   – Settings modal: completely rewritten with clearer storage explanation,
 *     storage status panel, and "Show welcome screen again" button
 *   – openModal factory: unchanged
 */

import { state, upsertItemInState, removeItemFromState } from '../core/state.js';
import { saveItem, deleteItem }                           from '../core/storage.js';
import { createItem, ItemType, ItemLayer }                from '../core/schema.js';
import { esc, showToast }                                 from '../utils/helpers.js';
import { STICKY_COLORS }                                  from './stickies.js';

// ── Modal factory ─────────────────────────────────────────────

export function openModal({ title, fields, actions, onReady }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';

  const fieldHTML = fields.map(f => {
    if (f.type === 'input')
      return `<input id="${f.id}" class="modal-input" placeholder="${f.placeholder || ''}" value="${esc(f.value || '')}">`;
    if (f.type === 'textarea')
      return `<textarea id="${f.id}" class="modal-textarea" placeholder="${f.placeholder || ''}" rows="${f.rows || 6}">${esc(f.value || '')}</textarea>`;
    if (f.type === 'select')
      return `<select id="${f.id}" class="modal-select">
        ${f.options.map(o => `<option value="${o.value}" ${o.value === f.value ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>`;
    if (f.type === 'swatches')
      return `<div class="color-swatch-row">
        ${STICKY_COLORS.map(c =>
          `<button class="color-swatch ${c === f.value ? 'selected' : ''}" style="background:${c}" data-color="${c}"></button>`
        ).join('')}
      </div>`;
    return '';
  }).join('');

  overlay.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">${title}</h3>
      <div class="modal-content">${fieldHTML}</div>
      <div class="modal-actions">
        ${actions.map(a =>
          `<button id="${a.id}" class="modal-btn ${a.primary ? 'primary' : a.danger ? 'danger' : ''}">${a.label}</button>`
        ).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 220);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  if (onReady) onReady(overlay, close);

  return { overlay, close };
}

// ── Link modal ────────────────────────────────────────────────

export function showLinkModal(existingItem = null) {
  openModal({
    title: existingItem ? 'Edit Link' : 'Add Link',
    fields: [
      { type: 'input', id: 'f-url',   placeholder: 'https://…',       value: existingItem?.url   || '' },
      { type: 'input', id: 'f-title', placeholder: 'Label (optional)', value: existingItem?.title || '' },
    ],
    actions: existingItem
      ? [{ id: 'm-delete', label: 'Delete', danger: true }, { id: 'm-cancel', label: 'Cancel' }, { id: 'm-save', label: 'Save', primary: true }]
      : [{ id: 'm-cancel', label: 'Cancel' }, { id: 'm-save', label: 'Save', primary: true }],
    onReady: (overlay, close) => {
      overlay.querySelector('#m-cancel').addEventListener('click', close);

      overlay.querySelector('#m-delete')?.addEventListener('click', async () => {
        await deleteItem(existingItem.id);
        removeItemFromState(existingItem.id);
        close();
      });

      overlay.querySelector('#m-save').addEventListener('click', async () => {
        const url   = overlay.querySelector('#f-url')?.value.trim()   || '';
        const title = overlay.querySelector('#f-title')?.value.trim() || '';
        if (!url) { showToast('URL is required', true); return; }
        const normalised = url.startsWith('http') ? url : `https://${url}`;
        let saved;
        if (existingItem) {
          saved = await saveItem({ ...existingItem, url: normalised, title });
        } else {
          saved = await saveItem(createItem({
            layer: ItemLayer.BACKGROUND, type: ItemType.LINK, url: normalised, title,
          }));
        }
        upsertItemInState(saved);
        showToast(existingItem ? 'Link updated' : 'Link saved');
        close();
      });
    },
  });
}

// ── Sticky modal ──────────────────────────────────────────────

export function showStickyModal() {
  let col = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  openModal({
    title: 'New Sticky',
    fields: [
      { type: 'textarea', id: 'f-text',  placeholder: 'Write something…', rows: 4 },
      { type: 'swatches', id: 'f-color', value: col },
    ],
    actions: [
      { id: 'm-cancel', label: 'Cancel' },
      { id: 'm-save',   label: 'Add Sticky', primary: true },
    ],
    onReady: (overlay, close) => {
      overlay.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          overlay.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
          col = sw.dataset.color;
        });
      });

      overlay.querySelector('#m-cancel').addEventListener('click', close);

      overlay.querySelector('#m-save').addEventListener('click', async () => {
        const text = overlay.querySelector('#f-text')?.value || '';
        const item = createItem({
          layer:    ItemLayer.STICKY,
          type:     ItemType.STICKY,
          text,
          color:    col,
          rotation: parseFloat((Math.random() * 8 - 4).toFixed(1)),
          position: { x: 50 + Math.random() * 120, y: 30 + Math.random() * 100, width: 175, height: 150 },
        });
        upsertItemInState(await saveItem(item));
        close();
      });
    },
  });
}

// ── Settings modal ────────────────────────────────────────────
//
// V13 rewrite:
//   – Clear explanation that notes auto-save internally (like Samsung Notes)
//   – Backup file is explained as a "safety net", not the primary save
//   – Storage status shows protected/not protected
//   – "Show welcome screen again" button for easy onboarding reset

export async function showSettingsModal() {
  const { getPersistenceState, getStorageEstimate } = await import('../core/storage.js');
  const { exportData, importData } = _lazyDataModule();

  const persistState = getPersistenceState();
  const estimate     = await getStorageEstimate();

  // Protection badge
  const protectedBadge = persistState === 'granted'
    ? `<div class="settings-badge settings-badge--green">🔒 Data protected</div>`
    : persistState === 'denied'
      ? `<div class="settings-badge settings-badge--amber">⚠️ Install as app for full protection</div>`
      : `<div class="settings-badge settings-badge--grey">ℹ️ Checking storage status…</div>`;

  // Usage bar
  const usageBar = estimate ? `
    <div class="settings-usage-row">
      <div class="settings-usage-bar-wrap">
        <div class="settings-usage-bar" style="width:${Math.min(estimate.percent, 100)}%"></div>
      </div>
      <span class="settings-usage-label">${estimate.usageStr} of ${estimate.quotaStr} used</span>
    </div>` : '';

  openModal({
    title: 'Settings',
    fields: [],
    actions: [{ id: 's-close', label: 'Done', primary: true }],
    onReady: (overlay, close) => {

      // Build rich content inside the modal
      const content = overlay.querySelector('.modal-content');
      content.innerHTML = `

        <!-- HOW SAVING WORKS ─────────────────────────────── -->
        <div class="settings-section-label">How your data is saved</div>

        <div class="settings-explainer-card">
          <div class="settings-explainer-row">
            <span class="settings-explainer-icon">💾</span>
            <div class="settings-explainer-text">
              <div class="settings-explainer-title">Auto-saves inside the app</div>
              <div class="settings-explainer-body">
                Every note, link, code snippet and sticky saves automatically the moment you tap Save — 
                exactly like Samsung Notes or Apple Notes. Close the app, reopen it, everything is there.
                No manual saving needed, ever.
              </div>
            </div>
          </div>
          <div class="settings-explainer-divider"></div>
          <div class="settings-explainer-row">
            <span class="settings-explainer-icon">🗂️</span>
            <div class="settings-explainer-text">
              <div class="settings-explainer-title">Backup file is extra insurance</div>
              <div class="settings-explainer-body">
                The export/backup file is a separate safety net — not the main save. 
                Think of it like a manual save to your Files app. Your notes are already safe 
                inside the app. The backup gives you a copy in your own files too.
              </div>
            </div>
          </div>
        </div>

        <!-- STORAGE STATUS ───────────────────────────────── -->
        <div class="settings-section-label" style="margin-top:18px">Storage status</div>
        ${protectedBadge}
        ${usageBar}
        <p class="settings-fine-print">
          Your data lives only on this device and is never sent anywhere. 
          Nobody else can access it — not us, not anyone.
        </p>

        <!-- DATA ACTIONS ─────────────────────────────────── -->
        <div class="settings-section-label" style="margin-top:18px">Backup &amp; restore</div>

        <button class="settings-action-row" id="s-export">
          <span class="settings-action-icon">📤</span>
          <div class="settings-action-text">
            <div class="settings-action-title">Export backup</div>
            <div class="settings-action-desc">Save all your data as a file you keep</div>
          </div>
          <span class="settings-action-arrow">›</span>
        </button>

        <button class="settings-action-row" id="s-import">
          <span class="settings-action-icon">📥</span>
          <div class="settings-action-text">
            <div class="settings-action-title">Restore from backup</div>
            <div class="settings-action-desc">Import a previously exported file</div>
          </div>
          <span class="settings-action-arrow">›</span>
        </button>

        <!-- WELCOME SCREEN ───────────────────────────────── -->
        <div class="settings-section-label" style="margin-top:18px">Help</div>

        <button class="settings-action-row" id="s-onboarding">
          <span class="settings-action-icon">👋</span>
          <div class="settings-action-text">
            <div class="settings-action-title">Show welcome screen again</div>
            <div class="settings-action-desc">Revisit the privacy and backup setup</div>
          </div>
          <span class="settings-action-arrow">›</span>
        </button>
      `;

      // Wire buttons
      overlay.querySelector('#s-close').addEventListener('click', close);

      overlay.querySelector('#s-export').addEventListener('click', () => {
        close();
        setTimeout(() => exportData(), 260);
      });

      overlay.querySelector('#s-import').addEventListener('click', () => {
        close();
        setTimeout(() => importData(), 260);
      });

      overlay.querySelector('#s-onboarding').addEventListener('click', async () => {
        close();
        setTimeout(async () => {
          const { resetOnboarding, showOnboarding } = await import('../features/onboarding.js');
          resetOnboarding();
          showOnboarding();
        }, 260);
      });
    },
  });
}

// ── Context menu ──────────────────────────────────────────────
//
// V13: "Save As" added as a menu option for all item types.

export function showContextMenu(evt, item) {
  document.getElementById('ctx-overlay')?.remove();
  document.getElementById('ctx-menu')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ctx-overlay';
  overlay.className = 'context-menu-overlay';

  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'context-menu';

  // Build menu items — Save As only for items that have content to export
  const menuItems = [
    { label: item.isFavorited ? '⭐ Unfavourite' : '☆ Favourite', action: 'favorite' },
    { label: '⎘ Duplicate',  action: 'duplicate' },
    { label: '✎ Edit',       action: 'edit'      },
    { label: '↗ Save as…',   action: 'saveas'    },
    { divider: true },
    { label: '🗑 Delete', action: 'delete', destructive: true },
  ];

  menu.innerHTML = menuItems.map(a => a.divider
    ? `<div class="context-menu-divider"></div>`
    : `<button class="context-menu-item ${a.destructive ? 'destructive' : ''}" data-action="${a.action}">${a.label}</button>`
  ).join('');

  // Position near tap/click, clamped to viewport
  const x = evt.clientX ?? window.innerWidth  / 2;
  const y = evt.clientY ?? window.innerHeight / 2;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth  - 210))}px`;
  menu.style.top  = `${Math.max(8, Math.min(y, window.innerHeight - 250))}px`;

  document.body.appendChild(overlay);
  document.body.appendChild(menu);

  const dismiss = () => { overlay.remove(); menu.remove(); };
  overlay.addEventListener('click', dismiss);

  // Escape closes
  const onKey = e => { if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      dismiss();
      const action = btn.dataset.action;

      if (action === 'edit') {
        if (item.type === 'note') {
          const m = await import('./note-editor.js');
          m.showNoteEditor(item);
        } else if (item.type === 'code') {
          const m = await import('./code-editor.js');
          m.showCodeEditor(item);
        } else {
          showLinkModal(item);
        }

      } else if (action === 'favorite') {
        item.isFavorited = !item.isFavorited;
        upsertItemInState(await saveItem(item));
        showToast(item.isFavorited ? 'Added to favourites' : 'Removed from favourites');

      } else if (action === 'duplicate') {
        const dup = createItem({
          ...item,
          id:        undefined,
          title:     (item.title || 'Untitled') + ' copy',
          createdAt: undefined,
        });
        upsertItemInState(await saveItem(dup));
        showToast('Duplicated');

      } else if (action === 'saveas') {
        const { showSaveAsSheet } = await import('../features/save-as.js');
        showSaveAsSheet(item);

      } else if (action === 'delete') {
        await deleteItem(item.id);
        removeItemFromState(item.id);
        showToast('Deleted');
      }
    });
  });
}

// ── Lazy data module ──────────────────────────────────────────

function _lazyDataModule() {
  let _mod = null;
  const load = () => { if (!_mod) _mod = import('../features/data.js'); return _mod; };
  return {
    exportData: async () => { const m = await load(); m.exportData(); },
    importData: async () => { const m = await load(); m.importData(); },
  };
}
