/**
 * MAKÉ UI — modals.js (V15)
 *
 * V15 improvements:
 *   – openModal: focus moves into modal on open, restored to trigger on close
 *   – showContextMenu: auto-flips position when near viewport edges
 *   – showContextMenu (sticky): colour picker row added inline
 *   – showSettingsModal: focus trapped inside, restored on close
 *   – Save/delete buttons guard against double-tap (disabled state)
 *   – ARIA roles added throughout
 */

import { state, upsertItemInState, removeItemFromState } from '../core/state.js';
import { saveItem, deleteItem }                           from '../core/storage.js';
import { createItem, ItemType, ItemLayer }                from '../core/schema.js';
import { esc, showToast }                                 from '../utils/helpers.js';
import { STICKY_COLORS }                                  from './stickies.js';

// ── Focus trap utility ────────────────────────────────────────

function _focusTrap(container) {
  const SEL = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
  const getFocusable = () => [...container.querySelectorAll(SEL)];
  const onKey = e => {
    if (e.key !== 'Tab') return;
    const els = getFocusable();
    if (!els.length) { e.preventDefault(); return; }
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

// ── Modal factory ─────────────────────────────────────────────

export function openModal({ title, fields, actions, onReady }) {
  const prevFocus = document.activeElement;

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
      return `<div class="color-swatch-row" role="group" aria-label="Colour">
        ${STICKY_COLORS.map(c =>
          `<button class="color-swatch ${c === f.value ? 'selected' : ''}" style="background:${c}" data-color="${c}" aria-label="Colour ${c}"></button>`
        ).join('')}
      </div>`;
    return '';
  }).join('');

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
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

  setTimeout(() => overlay.querySelector('input, textarea, button.primary, button')?.focus(), 240);

  const modal = overlay.querySelector('.modal');
  const removeTrap = _focusTrap(modal);

  const close = () => {
    removeTrap();
    overlay.classList.remove('open');
    setTimeout(() => { overlay.remove(); prevFocus?.focus(); }, 220);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

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
        const btn = overlay.querySelector('#m-delete');
        if (btn.disabled) return;
        btn.disabled = true;
        await deleteItem(existingItem.id);
        removeItemFromState(existingItem.id);
        close();
      });

      overlay.querySelector('#m-save').addEventListener('click', async () => {
        const saveBtn = overlay.querySelector('#m-save');
        if (saveBtn.disabled) return;
        const url   = overlay.querySelector('#f-url')?.value.trim()   || '';
        const title = overlay.querySelector('#f-title')?.value.trim() || '';
        if (!url) { showToast('URL is required', true); return; }
        saveBtn.disabled = true;
        saveBtn.classList.add('loading');
        const normalised = url.startsWith('http') ? url : `https://${url}`;
        try {
          let saved;
          if (existingItem) {
            saved = await saveItem({ ...existingItem, url: normalised, title });
          } else {
            saved = await saveItem(createItem({ layer: ItemLayer.BACKGROUND, type: ItemType.LINK, url: normalised, title, folderId: window._makeActiveFolderForNext ?? null }));
            window._makeActiveFolderForNext = undefined;
          }
          upsertItemInState(saved);
          window._makeAutoBackup?.();
          showToast(existingItem ? 'Link updated' : 'Link saved');
          close();
        } catch {
          showToast('Save failed — try again', true);
          saveBtn.disabled = false;
          saveBtn.classList.remove('loading');
        }
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
        const saveBtn = overlay.querySelector('#m-save');
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
        const text = overlay.querySelector('#f-text')?.value || '';
        const item = createItem({
          layer: ItemLayer.STICKY, type: ItemType.STICKY, text, color: col,
          rotation: parseFloat((Math.random() * 8 - 4).toFixed(1)),
          position: { x: 50 + Math.random() * 120, y: 30 + Math.random() * 100, width: 175, height: 150 },
        });
        upsertItemInState(await saveItem(item));
        window._makeAutoBackup?.();
        close();
      });
    },
  });
}

// ── Settings — full-page slide-up panel ───────────────────────

export async function showSettingsModal() {
  if (document.getElementById('settings-page')) return;
  const prevFocus = document.activeElement;

  const { getPersistenceState, getStorageEstimate } = await import('../core/storage.js');
  const { exportData, importData } = _lazyDataModule();

  const persistState = getPersistenceState();
  const estimate     = await getStorageEstimate();
  const isDark       = localStorage.getItem('make_theme') === 'dark';
  const isGrid       = state.viewMode !== 'list';
  const isAmbient    = state.ambientEnabled;
  const isFavs       = state.filterFavourites;

  // Storage status
  const storageOk     = persistState === 'granted';
  const storageDenied = persistState === 'denied';
  const storageStatus = storageOk ? 'Protected' : storageDenied ? 'Not protected' : 'Checking…';
  const storageColor  = storageOk ? '#6dd4a4' : storageDenied ? '#e8a86a' : 'rgba(255,255,255,0.38)';
  const storageMsg    = storageOk
    ? 'Safe from browser clear'
    : storageDenied
      ? 'Install as home screen app for full protection'
      : 'Checking…';

  const usagePct  = Math.min(estimate?.percent || 0, 100);
  const usageStr  = estimate ? `${estimate.usageStr} of ${estimate.quotaStr}` : '';
  const nearFull  = (estimate?.percent || 0) > 80;

  // Sort label helper
  const sortMap   = { updatedAt: 'Modified', createdAt: 'Created', title: 'A–Z' };
  const sortLabel = sortMap[state.sortField] || 'Modified';
  const sortDirLabel = state.sortDir === 'asc' ? '↑' : '↓';

  const page = document.createElement('div');
  page.id        = 'settings-page';
  page.className = 'settings-page';
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-modal', 'true');
  page.setAttribute('aria-label', 'Settings');

  page.innerHTML = `
    <!-- Top bar: just X and title -->
    <div class="sp-topbar">
      <button class="sp-close" id="settings-back" aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <span class="sp-title">Settings</span>
    </div>

    <div class="sp-body">

      <!-- ── APPEARANCE ── -->
      <div class="sp-section-label">Appearance</div>

      <div class="sp-card">
        <!-- Dark mode row -->
        <div class="sp-row">
          <div class="sp-row-left">
            <div class="sp-row-icon sp-icon--moon" id="sp-theme-icon">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            </div>
            <span class="sp-row-label">Dark mode</span>
          </div>
          <button class="mini-toggle ${isDark ? 'on' : ''}" id="sp-theme-toggle"
                  aria-label="Dark mode" aria-pressed="${isDark}">
            <div class="mini-toggle-knob"></div>
          </button>
        </div>

        <div class="sp-divider"></div>

        <!-- View mode -->
        <div class="sp-row">
          <div class="sp-row-left">
            <div class="sp-row-icon sp-icon--grid">
              <svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </div>
            <span class="sp-row-label">Card view</span>
          </div>
          <div class="sp-seg" role="group" aria-label="View mode">
            <button class="sp-seg-btn ${isGrid ? 'active' : ''}" id="sp-view-grid" aria-pressed="${isGrid}">Grid</button>
            <button class="sp-seg-btn ${!isGrid ? 'active' : ''}" id="sp-view-list" aria-pressed="${!isGrid}">List</button>
          </div>
        </div>
      </div>

      <!-- ── ORGANISE (was drawer) ── -->
      <div class="sp-section-label">Organise</div>

      <div class="sp-card">
        <!-- Ambient sorting -->
        <div class="sp-row">
          <div class="sp-row-left">
            <div class="sp-row-icon sp-icon--ambient">
              <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            </div>
            <div>
              <span class="sp-row-label">Ambient sorting</span>
              <span class="sp-row-sub">Morning: notes · Afternoon: links · Evening: code</span>
            </div>
          </div>
          <button class="mini-toggle ${isAmbient ? 'on' : ''}" id="sp-ambient-toggle"
                  aria-label="Ambient sorting" aria-pressed="${isAmbient}">
            <div class="mini-toggle-knob"></div>
          </button>
        </div>

        <div class="sp-divider"></div>

        <!-- Favourites filter -->
        <div class="sp-row">
          <div class="sp-row-left">
            <div class="sp-row-icon sp-icon--fav">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            </div>
            <span class="sp-row-label">Favourites only</span>
          </div>
          <button class="mini-toggle ${isFavs ? 'on' : ''}" id="sp-fav-toggle"
                  aria-label="Favourites only" aria-pressed="${isFavs}">
            <div class="mini-toggle-knob"></div>
          </button>
        </div>

        <div class="sp-divider"></div>

        <!-- Sort order -->
        <div class="sp-row">
          <div class="sp-row-left">
            <div class="sp-row-icon sp-icon--sort">
              <svg viewBox="0 0 24 24" width="16" height="16"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>
            </div>
            <span class="sp-row-label">Sort by</span>
          </div>
          <div class="sp-seg" role="group" aria-label="Sort">
            <button class="sp-seg-btn ${state.sortField==='updatedAt'?'active':''}" data-sort="updatedAt" id="sp-sort-mod">Modified</button>
            <button class="sp-seg-btn ${state.sortField==='createdAt'?'active':''}" data-sort="createdAt" id="sp-sort-cre">Created</button>
            <button class="sp-seg-btn ${state.sortField==='title'?'active':''}" data-sort="title" id="sp-sort-ttl">A–Z</button>
          </div>
        </div>
      </div>

      <!-- ── STORAGE ── -->
      <div class="sp-section-label">Storage</div>

      <div class="sp-card">
        <div class="sp-storage-row">
          <span class="sp-storage-status" style="color:${storageColor}">${storageStatus}</span>
          <span class="sp-storage-msg">${storageMsg}</span>
        </div>
        ${estimate ? `
        <div class="sp-divider"></div>
        <div class="sp-storage-bar-wrap">
          <div class="sp-storage-bar">
            <div class="sp-storage-bar-fill ${nearFull ? 'warn' : ''}" style="width:${usagePct}%"></div>
          </div>
          <span class="sp-storage-usage">${usageStr}</span>
        </div>
        ${nearFull ? `<div class="sp-storage-warn">Storage nearly full — export a backup soon</div>` : ''}` : ''}
      </div>

      <!-- ── DATA ── -->
      <div class="sp-section-label">Data</div>

      <div class="sp-card">
        <button class="sp-action-row" id="sp-export">
          <div class="sp-row-icon sp-icon--export">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="sp-action-text">
            <span class="sp-row-label">Export backup</span>
            <span class="sp-row-sub">Save all data to a file</span>
          </div>
          <svg class="sp-chevron" viewBox="0 0 24 24" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        <div class="sp-divider"></div>

        <button class="sp-action-row" id="sp-import">
          <div class="sp-row-icon sp-icon--import">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div class="sp-action-text">
            <span class="sp-row-label">Restore from backup</span>
            <span class="sp-row-sub">Import a previously exported file</span>
          </div>
          <svg class="sp-chevron" viewBox="0 0 24 24" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <!-- ── HELP ── -->
      <div class="sp-section-label">Help</div>

      <div class="sp-card">
        <button class="sp-action-row" id="sp-onboarding">
          <div class="sp-row-icon sp-icon--help">
            <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="sp-action-text">
            <span class="sp-row-label">Show welcome screen</span>
            <span class="sp-row-sub">Privacy guide and backup setup</span>
          </div>
          <svg class="sp-chevron" viewBox="0 0 24 24" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <div class="sp-version">Maké · V17 · All data stored locally</div>
    </div>
  `;

  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));
  setTimeout(() => page.querySelector('#settings-back')?.focus(), 440);

  const removeTrap = _focusTrap(page);
  const close = () => {
    removeTrap();
    page.classList.remove('open');
    setTimeout(() => { page.remove(); prevFocus?.focus(); }, 420);
  };

  page.querySelector('#settings-back').addEventListener('click', close);
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  // Dark mode
  page.querySelector('#sp-theme-toggle').addEventListener('click', e => {
    const btn = e.currentTarget;
    const nowDark = btn.classList.toggle('on');
    btn.setAttribute('aria-pressed', nowDark);
    localStorage.setItem('make_theme', nowDark ? 'dark' : 'light');
    nowDark ? document.documentElement.setAttribute('data-theme','dark')
            : document.documentElement.removeAttribute('data-theme');
    document.getElementById('theme-toggle')?.classList.toggle('on', nowDark);
  });

  // View mode
  const gridBtn = page.querySelector('#sp-view-grid');
  const listBtn = page.querySelector('#sp-view-list');
  gridBtn.addEventListener('click', () => {
    state.viewMode = 'grid';
    gridBtn.classList.add('active');    gridBtn.setAttribute('aria-pressed','true');
    listBtn.classList.remove('active'); listBtn.setAttribute('aria-pressed','false');
  });
  listBtn.addEventListener('click', () => {
    state.viewMode = 'list';
    listBtn.classList.add('active');    listBtn.setAttribute('aria-pressed','true');
    gridBtn.classList.remove('active'); gridBtn.setAttribute('aria-pressed','false');
  });

  // Ambient
  page.querySelector('#sp-ambient-toggle').addEventListener('click', async e => {
    const btn = e.currentTarget;
    state.ambientEnabled = !state.ambientEnabled;
    btn.classList.toggle('on', state.ambientEnabled);
    btn.setAttribute('aria-pressed', state.ambientEnabled);
    const { startAmbient, stopAmbient } = await import('../features/ambient.js');
    state.ambientEnabled ? startAmbient() : stopAmbient();
  });

  // Favourites
  page.querySelector('#sp-fav-toggle').addEventListener('click', e => {
    const btn = e.currentTarget;
    state.filterFavourites = !state.filterFavourites;
    btn.classList.toggle('on', state.filterFavourites);
    btn.setAttribute('aria-pressed', state.filterFavourites);
  });

  // Sort
  page.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.sort;
      if (field === state.sortField) {
        state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        state.sortField = field;
        state.sortDir   = 'desc';
      }
      page.querySelectorAll('[data-sort]').forEach(b => {
        b.classList.toggle('active', b.dataset.sort === state.sortField);
        b.setAttribute('aria-pressed', b.dataset.sort === state.sortField);
      });
    });
  });

  // Data actions
  page.querySelector('#sp-export').addEventListener('click', () => { close(); setTimeout(() => exportData(), 420); });
  page.querySelector('#sp-import').addEventListener('click', () => { close(); setTimeout(() => importData(), 420); });
  page.querySelector('#sp-onboarding').addEventListener('click', async () => {
    close();
    setTimeout(async () => {
      const { resetOnboarding, showOnboarding } = await import('../features/onboarding.js');
      resetOnboarding(); showOnboarding();
    }, 420);
  });
}


// ── Context menu ──────────────────────────────────────────────

export function showContextMenu(evt, item) {
  document.getElementById('ctx-overlay')?.remove();
  document.getElementById('ctx-menu')?.remove();
  const prevFocus = document.activeElement;

  const overlay = document.createElement('div');
  overlay.id = 'ctx-overlay';
  overlay.className = 'context-menu-overlay';

  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Item actions');

  const menuItems = [
    { label: item.isFavorited ? '⭐ Unfavourite' : '☆ Favourite', action: 'favorite' },
    { label: '⎘ Duplicate',  action: 'duplicate' },
    { label: '✎ Edit',       action: 'edit'      },
    { label: '↗ Save as…',   action: 'saveas'    },
    { label: '📁 Move to folder', action: 'movefolder' },
    { divider: true },
    { label: '🗑 Delete', action: 'delete', destructive: true },
  ];

  menu.innerHTML = menuItems.map(a => a.divider
    ? `<div class="context-menu-divider" role="separator"></div>`
    : `<button class="context-menu-item ${a.destructive ? 'destructive' : ''}" data-action="${a.action}" role="menuitem">${a.label}</button>`
  ).join('');

  // Sticky colour picker
  if (item.type === 'sticky') {
    const colorRow = document.createElement('div');
    colorRow.className = 'ctx-color-row';
    colorRow.setAttribute('role', 'group');
    colorRow.setAttribute('aria-label', 'Sticky colour');
    STICKY_COLORS.forEach(c => {
      const dot = document.createElement('button');
      dot.className = 'ctx-color-dot';
      dot.style.background = c;
      dot.setAttribute('aria-label', `Set colour`);
      if (c === item.color) dot.style.borderColor = 'white';
      dot.addEventListener('click', async () => {
        dismiss();
        const updated = await saveItem({ ...item, color: c });
        upsertItemInState(updated);
        window._makeAutoBackup?.();
        showToast('Colour updated');
      });
      colorRow.appendChild(dot);
    });
    menu.appendChild(colorRow);
  }

  // Position with auto-flip
  const MENU_W = 210;
  const MENU_H = 250 + (item.type === 'sticky' ? 50 : 0);
  const x = evt.clientX ?? window.innerWidth  / 2;
  const y = evt.clientY ?? window.innerHeight / 2;
  const left = x + MENU_W > window.innerWidth  - 8 ? Math.max(8, x - MENU_W) : x;
  const top  = y + MENU_H > window.innerHeight - 8 ? Math.max(8, y - MENU_H) : y;
  menu.style.left = `${left}px`;
  menu.style.top  = `${top}px`;

  document.body.appendChild(overlay);
  document.body.appendChild(menu);
  requestAnimationFrame(() => menu.querySelector('.context-menu-item')?.focus());

  const dismiss = () => {
    overlay.remove(); menu.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus();
  };

  overlay.addEventListener('click', dismiss);

  const onKey = e => {
    if (e.key === 'Escape') { dismiss(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('.context-menu-item')];
      const idx = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? items[(idx + 1) % items.length]
        : items[(idx - 1 + items.length) % items.length];
      next?.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      dismiss();
      const action = btn.dataset.action;
      if (action === 'edit') {
        if (item.type === 'note')       { const m = await import('./note-editor.js'); m.showNoteEditor(item); }
        else if (item.type === 'code')  { const m = await import('./code-editor.js'); m.showCodeEditor(item); }
        else                            { showLinkModal(item); }
      } else if (action === 'favorite') {
        item.isFavorited = !item.isFavorited;
        upsertItemInState(await saveItem(item));
        window._makeAutoBackup?.();
        showToast(item.isFavorited ? 'Added to favourites' : 'Removed from favourites');
      } else if (action === 'duplicate') {
        const dup = createItem({ ...item, id: undefined, title: (item.title || 'Untitled') + ' copy', createdAt: undefined });
        upsertItemInState(await saveItem(dup));
        window._makeAutoBackup?.();
        showToast('Duplicated');
      } else if (action === 'saveas') {
        const { showSaveAsSheet } = await import('../features/save-as.js');
        showSaveAsSheet(item);
      } else if (action === 'movefolder') {
        _showMoveToFolder(item);
      } else if (action === 'delete') {
        await deleteItem(item.id);
        removeItemFromState(item.id);
        showToast('Deleted');
      }
    });
  });
}

// ── Move to folder ────────────────────────────────────────────

function _showMoveToFolder(item) {
  // Dynamic import to avoid circular at module level
  import('../core/state.js').then(({ state, upsertItemInState }) => {
    import('../core/storage.js').then(({ saveItem }) => {
      const folders = state.folders;
      if (!folders.length) {
        showToast('No folders yet — create one from the folder strip');
        return;
      }

      document.getElementById('move-folder-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'move-folder-overlay';
      overlay.className = 'save-as-overlay';

      const sheet = document.createElement('div');
      sheet.className = 'save-as-sheet';
      sheet.innerHTML = `
        <div class="save-as-handle"></div>
        <div class="save-as-title">Move to folder</div>
        <div class="save-as-options">
          <button class="save-as-option" data-fid="null">
            <span class="save-as-option-icon">📋</span>
            <div class="save-as-option-text">
              <div class="save-as-option-label">No folder</div>
              <div class="save-as-option-desc">Move back to top level</div>
            </div>
          </button>
          ${folders.map(f => `
            <button class="save-as-option" data-fid="${f.id}">
              <span class="save-as-option-icon" style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${f.color || '#b68d93'};margin-top:3px;"></span>
              <div class="save-as-option-text">
                <div class="save-as-option-label">${esc(f.name)}</div>
              </div>
            </button>`).join('')}
        </div>
        <button class="save-as-cancel">Cancel</button>
      `;

      overlay.appendChild(sheet);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('open'); sheet.classList.add('open'); });

      const close = () => {
        overlay.classList.remove('open'); sheet.classList.remove('open');
        setTimeout(() => overlay.remove(), 320);
      };
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
      sheet.querySelector('.save-as-cancel').addEventListener('click', close);

      sheet.querySelectorAll('[data-fid]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const fid = btn.dataset.fid === 'null' ? null : +btn.dataset.fid;
          const updated = await saveItem({ ...item, folderId: fid });
          upsertItemInState(updated);
          close();
          showToast(fid ? 'Moved to folder' : 'Removed from folder');
        });
      });
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
