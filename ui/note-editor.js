/**
 * MAKÉ UI — note-editor.js
 * Full-screen rich-text note editor.
 *
 * Changes:
 * - All execCommand calls routed through utils/rich-text.js (isolated for future swap).
 * - FIX: live tag preview — #tag chips update as you type, not only at save time.
 */

import { state, upsertItemInState } from '../core/state.js';
import { saveItem }                  from '../core/storage.js';
import { createItem, ItemType, ItemLayer } from '../core/schema.js';
import { esc, parseTags, showToast } from '../utils/helpers.js';
import { execFormat, queryFormat }   from '../utils/rich-text.js';

const NOTE_COLORS = ['#ffffff','#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f40','#00d2d3'];

export function showNoteEditor(existingItem = null) {
  document.getElementById('note-editor-page')?.remove();

  const page = document.createElement('div');
  page.className = 'editor-page note-editor-page';
  page.id = 'note-editor-page';

  const rawContent = existingItem?.content || '';
  const isHtml     = /<[a-z][\s\S]*>/i.test(rawContent);
  const bodyHtml   = isHtml
    ? rawContent
    : rawContent.split('\n').map(l => `<div>${esc(l) || '<br>'}</div>`).join('') || '<div><br></div>';

  page.innerHTML = `
    <div class="editor-topbar">
      <button class="editor-back-btn" id="note-back">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="editor-topbar-title">${existingItem ? 'Edit Note' : 'New Note'}</span>
      <button class="editor-save-btn" id="note-save">Save</button>
    </div>

    <input class="editor-title-input" id="note-title" placeholder="Title…"
           value="${esc(existingItem?.title || '')}" autocomplete="off">

    <div class="editor-toolbar" id="note-toolbar">
      <div class="toolbar-group">
        <button class="toolbar-btn" data-cmd="bold"          title="Bold"><b>B</b></button>
        <button class="toolbar-btn" data-cmd="italic"        title="Italic"><i>I</i></button>
        <button class="toolbar-btn" data-cmd="underline"     title="Underline"><u>U</u></button>
        <button class="toolbar-btn" data-cmd="strikeThrough" title="Strike"><s>S</s></button>
      </div>
      <div class="toolbar-sep"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn size-btn" data-cmd="fontSize" data-val="2" title="Small">xs</button>
        <button class="toolbar-btn size-btn" data-cmd="fontSize" data-val="3" title="Normal">sm</button>
        <button class="toolbar-btn size-btn" data-cmd="fontSize" data-val="5" title="Large">lg</button>
        <button class="toolbar-btn size-btn" data-cmd="formatBlock" data-val="h2" title="Heading">H1</button>
      </div>
      <div class="toolbar-sep"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn" data-cmd="insertUnorderedList" title="Bullet list">
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="3" cy="5"  r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="3" cy="10" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="3" cy="15" r="1.2" fill="currentColor" stroke="none"/>
            <line x1="7" y1="5"  x2="18" y2="5"/><line x1="7" y1="10" x2="18" y2="10"/><line x1="7" y1="15" x2="18" y2="15"/>
          </svg>
        </button>
        <button class="toolbar-btn" data-cmd="insertOrderedList" title="Numbered list">
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <text x="1" y="7"  font-size="5.5" fill="currentColor" stroke="none">1.</text>
            <text x="1" y="12" font-size="5.5" fill="currentColor" stroke="none">2.</text>
            <text x="1" y="17" font-size="5.5" fill="currentColor" stroke="none">3.</text>
            <line x1="8" y1="5"  x2="18" y2="5"/><line x1="8" y1="10" x2="18" y2="10"/><line x1="8" y1="15" x2="18" y2="15"/>
          </svg>
        </button>
        <button class="toolbar-btn" data-cmd="outdent" title="Outdent">⇤</button>
        <button class="toolbar-btn" data-cmd="indent"  title="Indent">⇥</button>
      </div>
      <div class="toolbar-sep"></div>
      <div class="toolbar-group color-swatches">
        ${NOTE_COLORS.map(c =>
          `<button class="toolbar-color-dot" data-cmd="foreColor" data-val="${c}"
                   style="background:${c}" title="Text colour ${c}"></button>`
        ).join('')}
      </div>
    </div>

    <div class="editor-body" id="note-body" contenteditable="true" spellcheck="true">${bodyHtml}</div>

    <!-- FIX: live tag preview -->
    <div class="editor-tag-preview" id="note-tag-preview" aria-live="polite"></div>
  `;

  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));

  const body    = page.querySelector('#note-body');
  const toolbar = page.querySelector('#note-toolbar');
  const tagPrev = page.querySelector('#note-tag-preview');

  // ── Toolbar ──────────────────────────────────────────────────

  // mousedown keeps focus inside the editor.
  toolbar.addEventListener('mousedown', e => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    execFormat(btn.dataset.cmd, btn.dataset.val || null);
    _updateToolbarState(toolbar);
  });

  // Touch support.
  toolbar.addEventListener('touchend', e => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    body.focus();
    execFormat(btn.dataset.cmd, btn.dataset.val || null);
    _updateToolbarState(toolbar);
  });

  body.addEventListener('keyup',   () => _updateToolbarState(toolbar));
  body.addEventListener('mouseup', () => _updateToolbarState(toolbar));

  // ── Live tag preview ─────────────────────────────────────────
  // FIX: parseTags runs on every input keystroke, updating the preview
  // immediately instead of waiting until Save.

  body.addEventListener('input', () => {
    _renderTagPreview(tagPrev, body.innerText || '');
  });

  // Render initial preview for existing notes.
  if (existingItem?.tags?.length) {
    _renderTagPreview(tagPrev, body.innerText || '');
  }

  // ── Save / Close ─────────────────────────────────────────────

  const close = () => {
    page.classList.remove('open');
    setTimeout(() => page.remove(), 320);
  };

  page.querySelector('#note-back').addEventListener('click', close);

  page.querySelector('#note-save').addEventListener('click', async () => {
    const title   = page.querySelector('#note-title').value.trim();
    const content = body.innerHTML;
    const plain   = body.innerText || '';
    if (!title && !plain.trim()) { close(); return; }

    const tags = parseTags(plain);
    let saved;
    if (existingItem) {
      saved = await saveItem({ ...existingItem, title, content, tags });
    } else {
      saved = await saveItem(createItem({
        layer: ItemLayer.BACKGROUND, type: ItemType.NOTE, title, content, tags,
      }));
    }
    upsertItemInState(saved);
    showToast(existingItem ? 'Note updated' : 'Note saved');
    close();
  });

  setTimeout(() => { body.focus(); _placeCaretAtEnd(body); }, 380);
}

// ── Helpers ───────────────────────────────────────────────────

function _updateToolbarState(toolbar) {
  ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList']
    .forEach(cmd => {
      toolbar.querySelectorAll(`[data-cmd="${cmd}"]`).forEach(btn => {
        btn.classList.toggle('active', queryFormat(cmd));
      });
    });
}

function _renderTagPreview(container, plainText) {
  const tags = parseTags(plainText);
  if (!tags.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = tags
    .map(t => `<span class="tag-chip tag-chip--live">#${esc(t)}</span>`)
    .join('');
}

function _placeCaretAtEnd(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {}
}
