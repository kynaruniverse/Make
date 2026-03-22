/**
 * MAKÉ FEATURES — folders.js (V17)
 *
 * Pinterest-style folder system. Folders can hold notes, code, and links
 * together. Displayed as a horizontal pill strip under the search bar.
 *
 * Public API:
 *   renderFolderStrip()   — renders/updates the folder strip in the header
 *   showFolderModal(f?)   — create or edit a folder
 *   showFolderView(id)    — open full-screen Pinterest masonry view of folder
 */

import { state }                     from '../core/state.js';
import { saveFolder, deleteFolder }  from '../core/storage.js';
import { esc, showToast }            from '../utils/helpers.js';

// Folder colour palette (soft, on-brand)
const FOLDER_COLORS = [
  '#b68d93','#9ba59a','#90afc5','#c5a590','#a590c5',
  '#90c5a5','#c5b990','#c59090',
];

// ── Folder strip ──────────────────────────────────────────────

export function renderFolderStrip() {
  let strip = document.getElementById('folder-strip');
  if (!strip) return; // not yet in DOM

  const folders = state.folders;
  const active  = state.activeFolder;

  strip.innerHTML = `
    <!-- "All" pill -->
    <button class="folder-pill ${active === null ? 'active' : ''}"
            data-folder-id="null" aria-pressed="${active === null}">
      <svg viewBox="0 0 24 24" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
      All
    </button>

    ${folders.map(f => `
      <button class="folder-pill ${active === f.id ? 'active' : ''}"
              data-folder-id="${f.id}" aria-pressed="${active === f.id}"
              style="--fpill-color:${f.color || FOLDER_COLORS[0]}">
        <span class="folder-pill-dot"></span>
        ${esc(f.name)}
      </button>
    `).join('')}

    <!-- New folder button -->
    <button class="folder-pill folder-pill--new" id="new-folder-btn" aria-label="New folder">
      <svg viewBox="0 0 24 24" width="13" height="13">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5"  y1="12" x2="19" y2="12"/>
      </svg>
      New
    </button>
  `;

  // Pill click
  strip.querySelectorAll('.folder-pill[data-folder-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = btn.dataset.folderId;
      const id  = raw === 'null' ? null : +raw;
      state.activeFolder = id;
      renderFolderStrip();

      if (id !== null) {
        const folder = state.folders.find(f => f.id === id);
        if (folder) showFolderView(folder);
      }
    });
  });

  // Long-press on folder pill → edit
  strip.querySelectorAll('.folder-pill[data-folder-id]:not([data-folder-id="null"])').forEach(btn => {
    let t;
    btn.addEventListener('touchstart', () => {
      t = setTimeout(() => {
        const id = +btn.dataset.folderId;
        const f  = state.folders.find(x => x.id === id);
        if (f) showFolderModal(f);
      }, 600);
    }, { passive: true });
    btn.addEventListener('touchend',  () => clearTimeout(t));
    btn.addEventListener('touchmove', () => clearTimeout(t));
    btn.addEventListener('contextmenu', e => {
      e.preventDefault();
      const id = +btn.dataset.folderId;
      const f  = state.folders.find(x => x.id === id);
      if (f) showFolderModal(f);
    });
  });

  document.getElementById('new-folder-btn')?.addEventListener('click', () => showFolderModal());
}

// ── Create / Edit folder modal ────────────────────────────────

export function showFolderModal(existing = null) {
  document.getElementById('folder-modal-overlay')?.remove();
  const prevFocus = document.activeElement;

  const col = existing?.color || FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
  let selectedColor = col;

  const overlay = document.createElement('div');
  overlay.id = 'folder-modal-overlay';
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal folder-modal" role="dialog" aria-modal="true" aria-label="${existing ? 'Edit folder' : 'New folder'}">
      <h3 class="modal-title">${existing ? 'Edit Folder' : 'New Folder'}</h3>
      <div class="modal-content">
        <input id="fm-name" class="modal-input" placeholder="Folder name…"
               value="${esc(existing?.name || '')}" maxlength="32" autocomplete="off">
        <div class="folder-color-row" role="group" aria-label="Folder colour">
          ${FOLDER_COLORS.map(c =>
            `<button class="folder-color-swatch ${c === col ? 'selected' : ''}"
                     style="background:${c}" data-color="${c}"
                     aria-label="Colour ${c}"></button>`
          ).join('')}
        </div>
      </div>
      <div class="modal-actions">
        ${existing ? `<button id="fm-delete" class="modal-btn danger">Delete</button>` : ''}
        <button id="fm-cancel" class="modal-btn">Cancel</button>
        <button id="fm-save" class="modal-btn primary">${existing ? 'Save' : 'Create'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  setTimeout(() => overlay.querySelector('#fm-name')?.focus(), 220);

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => { overlay.remove(); prevFocus?.focus(); }, 220);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#fm-cancel').addEventListener('click', close);

  overlay.querySelectorAll('.folder-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      overlay.querySelectorAll('.folder-color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  overlay.querySelector('#fm-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#fm-name').value.trim();
    if (!name) { overlay.querySelector('#fm-name').focus(); return; }

    const folderData = { name, color: selectedColor,
      ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}) };
    const saved = await saveFolder(folderData);

    if (existing) {
      state.folders = state.folders.map(f => f.id === saved.id ? saved : f);
    } else {
      state.folders = [...state.folders, saved];
    }

    renderFolderStrip();
    showToast(existing ? 'Folder updated' : 'Folder created');
    close();
  });

  overlay.querySelector('#fm-delete')?.addEventListener('click', async () => {
    // Move items back to top-level
    const updated = state.backgroundItems.map(i =>
      i.folderId === existing.id ? { ...i, folderId: null } : i
    );
    state.backgroundItems = updated;
    await deleteFolder(existing.id);
    state.folders = state.folders.filter(f => f.id !== existing.id);
    if (state.activeFolder === existing.id) state.activeFolder = null;
    renderFolderStrip();
    showToast('Folder deleted');
    close();
  });
}

// ── Full-screen folder view ───────────────────────────────────

export function showFolderView(folder) {
  document.getElementById('folder-view-page')?.remove();

  const items = state.backgroundItems.filter(i => i.folderId === folder.id);
  const page  = document.createElement('div');
  page.id        = 'folder-view-page';
  page.className = 'folder-view-page';

  page.innerHTML = `
    <div class="folder-view-topbar">
      <button class="ce-back" id="fv-back" aria-label="Back">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="folder-view-title">
        <span class="folder-view-dot" style="background:${folder.color || FOLDER_COLORS[0]}"></span>
        ${esc(folder.name)}
      </div>
      <button class="folder-view-edit" id="fv-edit" aria-label="Edit folder">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
    <div class="folder-view-grid" id="fv-grid">
      ${items.length === 0 ? _emptyFolderHTML() : _folderGridHTML(items)}
    </div>
    <!-- Add to folder FAB -->
    <button class="folder-view-fab" id="fv-fab" aria-label="Add to folder">
      <svg viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5"  y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `;

  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));

  page.querySelector('#fv-back').addEventListener('click', () => {
    state.activeFolder = null;
    renderFolderStrip();
    page.classList.remove('open');
    setTimeout(() => page.remove(), 320);
  });

  page.querySelector('#fv-edit').addEventListener('click', () => showFolderModal(folder));

  // FAB opens add menu with folder pre-selected
  page.querySelector('#fv-fab').addEventListener('click', () => {
    _showAddToFolderMenu(folder, page);
  });

  // Card interactions
  page.querySelectorAll('.fv-card[data-id]').forEach(card => {
    card.addEventListener('click', async () => {
      const item = state.backgroundItems.find(i => i.id === +card.dataset.id);
      if (!item) return;
      if (item.type === 'note') {
        const { showNoteEditor } = await import('../ui/note-editor.js');
        showNoteEditor(item);
      } else if (item.type === 'code') {
        const { showCodeEditor } = await import('../ui/code-editor.js');
        showCodeEditor(item);
      } else {
        const { showLinkModal } = await import('../ui/modals.js');
        showLinkModal(item);
      }
    });
  });
}

function _showAddToFolderMenu(folder, page) {
  // Show a simple bottom sheet to pick type
  const sheet = document.createElement('div');
  sheet.className = 'add-to-folder-sheet';
  sheet.innerHTML = `
    <div class="save-as-handle"></div>
    <div class="save-as-title">Add to ${esc(folder.name)}</div>
    <div class="save-as-options">
      <button class="save-as-option" data-type="note">
        <span class="save-as-option-icon">📝</span>
        <div class="save-as-option-text"><div class="save-as-option-label">New Note</div></div>
      </button>
      <button class="save-as-option" data-type="code">
        <span class="save-as-option-icon">⌨️</span>
        <div class="save-as-option-text"><div class="save-as-option-label">Code Snippet</div></div>
      </button>
      <button class="save-as-option" data-type="link">
        <span class="save-as-option-icon">🔗</span>
        <div class="save-as-option-text"><div class="save-as-option-label">Add Link</div></div>
      </button>
    </div>
    <button class="save-as-cancel">Cancel</button>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'save-as-overlay';
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.classList.add('open'); sheet.classList.add('open'); });

  const close = () => {
    overlay.classList.remove('open'); sheet.classList.remove('open');
    setTimeout(() => overlay.remove(), 320);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  sheet.querySelector('.save-as-cancel').addEventListener('click', close);

  sheet.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', async () => {
      close();
      const type = btn.dataset.type;
      // Set active folder so editors can pick it up
      window._makeActiveFolderForNext = folder.id;
      setTimeout(async () => {
        if (type === 'note') {
          const { showNoteEditor } = await import('../ui/note-editor.js');
          showNoteEditor();
        } else if (type === 'code') {
          const { showCodeEditor } = await import('../ui/code-editor.js');
          showCodeEditor();
        } else {
          const { showLinkModal } = await import('../ui/modals.js');
          showLinkModal();
        }
      }, 340);
    });
  });
}

function _folderGridHTML(items) {
  return `<div class="fv-masonry">
    ${items.map(item => {
      const raw     = (item.content || item.code || item.url || '').replace(/<[^>]*>/g,'').slice(0,180);
      const typeIcon = item.type === 'code' ? '⌨️' : item.type === 'link' ? '🔗' : '📝';
      return `
        <div class="fv-card glass-card" data-id="${item.id}" tabindex="0">
          <div class="fv-card-type">${typeIcon}</div>
          <div class="fv-card-title">${esc(item.title || 'Untitled')}</div>
          <div class="fv-card-preview ${item.type === 'code' ? 'fv-mono' : ''}">${esc(raw)}</div>
        </div>
      `;
    }).join('')}
  </div>`;
}

function _emptyFolderHTML() {
  return `<div class="fv-empty">
    <div class="fv-empty-icon">📂</div>
    <p class="fv-empty-title">This folder is empty</p>
    <p class="fv-empty-hint">Tap <strong>+</strong> to add notes, code or links</p>
  </div>`;
}
