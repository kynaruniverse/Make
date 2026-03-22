/**
 * MAKÉ UI — note-editor.js (V15)
 *
 * V15 improvements:
 * - Save button disabled with spinner during async save (no double-save)
 * - Word/character count footer (live update)
 * - Tag autocomplete: typing # suggests existing tags from all items
 * - Scroll position restored per item ID on re-open
 * - focus-visible already handled by global CSS
 */

import { state, upsertItemInState } from '../core/state.js';
import { saveItem }                  from '../core/storage.js';
import { createItem, ItemType, ItemLayer } from '../core/schema.js';
import { esc, parseTags, showToast } from '../utils/helpers.js';
import { execFormat, queryFormat }   from '../utils/rich-text.js';

const NOTE_COLORS = ['#ffffff','#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f40','#00d2d3'];

// Persist scroll position per item id across open/close
const _scrollPositions = new Map();

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
      <button class="editor-back-btn" id="note-back" aria-label="Back">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="editor-topbar-title">${existingItem ? 'Edit Note' : 'New Note'}</span>
      <button class="editor-save-btn" id="note-save">Save</button>
    </div>

    <input class="editor-title-input" id="note-title" placeholder="Title…"
           value="${esc(existingItem?.title || '')}" autocomplete="off">

    <div class="editor-toolbar" id="note-toolbar">
      <div class="toolbar-group">
        <button class="toolbar-btn" data-cmd="bold"          title="Bold (Ctrl+B)"><b>B</b></button>
        <button class="toolbar-btn" data-cmd="italic"        title="Italic (Ctrl+I)"><i>I</i></button>
        <button class="toolbar-btn" data-cmd="underline"     title="Underline (Ctrl+U)"><u>U</u></button>
        <button class="toolbar-btn" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
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

    <div class="editor-body" id="note-body" contenteditable="true" spellcheck="true"
         data-placeholder="Start writing…">${bodyHtml}</div>

    <!-- Live tag preview -->
    <div class="editor-tag-preview" id="note-tag-preview" aria-live="polite"></div>

    <!-- Word/char count footer -->
    <div class="note-wordcount-bar">
      <span class="note-wordcount" id="note-wordcount">0 words · 0 chars</span>
    </div>
  `;

  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));

  const body      = page.querySelector('#note-body');
  const toolbar   = page.querySelector('#note-toolbar');
  const tagPrev   = page.querySelector('#note-tag-preview');
  const wordcount = page.querySelector('#note-wordcount');

  // ── Toolbar ──────────────────────────────────────────────────
  toolbar.addEventListener('mousedown', e => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    execFormat(btn.dataset.cmd, btn.dataset.val || null);
    _updateToolbarState(toolbar);
  });

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

  // ── Word/char count ──────────────────────────────────────────
  function _updateWordCount() {
    const plain = body.innerText || '';
    const chars = plain.length;
    const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
    wordcount.textContent = `${words} word${words !== 1 ? 's' : ''} · ${chars} char${chars !== 1 ? 's' : ''}`;
  }

  // ── Live tag preview + autocomplete ─────────────────────────
  let _acTimeout;
  body.addEventListener('input', () => {
    _renderTagPreview(tagPrev, body.innerText || '');
    _updateWordCount();
    clearTimeout(_acTimeout);
    _acTimeout = setTimeout(() => _handleTagAutocomplete(body, page), 80);
  });

  body.addEventListener('keydown', e => {
    // Close autocomplete on Escape
    if (e.key === 'Escape') {
      page.querySelector('.tag-autocomplete')?.remove();
    }
  });

  // Initial render
  if (existingItem?.tags?.length) _renderTagPreview(tagPrev, body.innerText || '');
  _updateWordCount();

  // ── Save / Close ─────────────────────────────────────────────
  const close = () => {
    // Save scroll position
    if (existingItem?.id) _scrollPositions.set(existingItem.id, body.scrollTop);
    page.querySelector('.tag-autocomplete')?.remove();
    page.classList.remove('open');
    setTimeout(() => page.remove(), 320);
  };

  page.querySelector('#note-back').addEventListener('click', close);

  page.querySelector('#note-save').addEventListener('click', async () => {
    const saveBtn = page.querySelector('#note-save');
    if (saveBtn.classList.contains('loading')) return;

    const title   = page.querySelector('#note-title').value.trim();
    const content = body.innerHTML;
    const plain   = body.innerText || '';
    if (!title && !plain.trim()) { close(); return; }

    // Disable button with spinner
    saveBtn.classList.add('loading');
    saveBtn.textContent = '';

    const tags = parseTags(plain);
    let saved;
    try {
      if (existingItem) {
        saved = await saveItem({ ...existingItem, title, content, tags });
      } else {
        saved = await saveItem(createItem({
          layer: ItemLayer.BACKGROUND, type: ItemType.NOTE, title, content, tags,
          folderId: window._makeActiveFolderForNext ?? null,
        }));
        window._makeActiveFolderForNext = undefined;
      }
      upsertItemInState(saved);
      window._makeAutoBackup?.();
      showToast(existingItem ? 'Note updated' : 'Note saved');
      close();
    } catch (err) {
      console.error('[Maké] save note failed', err);
      showToast('Save failed — please try again', true);
      saveBtn.classList.remove('loading');
      saveBtn.textContent = 'Save';
    }
  });

  setTimeout(() => {
    body.focus();
    _placeCaretAtEnd(body);
    // Restore scroll position
    if (existingItem?.id && _scrollPositions.has(existingItem.id)) {
      body.scrollTop = _scrollPositions.get(existingItem.id);
    }
  }, 380);
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
  if (!tags.length) { container.innerHTML = ''; return; }
  container.innerHTML = tags
    .map(t => `<span class="tag-chip tag-chip--live">#${esc(t)}</span>`)
    .join('');
}

/** Tag autocomplete: when cursor is right after a #word, suggest existing tags. */
function _handleTagAutocomplete(body, page) {
  page.querySelector('.tag-autocomplete')?.remove();

  const sel = window.getSelection();
  if (!sel?.rangeCount) return;

  // Get text before cursor in current node
  const range    = sel.getRangeAt(0);
  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return;

  const textBefore = textNode.textContent.slice(0, range.startOffset);
  const hashMatch  = textBefore.match(/#([\w]*)$/);
  if (!hashMatch) return;

  const partial = hashMatch[1].toLowerCase();

  // Collect all existing tags from state
  const allTags = new Set();
  [...state.backgroundItems, ...state.stickyItems].forEach(item => {
    (item.tags || []).forEach(t => allTags.add(t));
  });

  const matches = [...allTags]
    .filter(t => t.startsWith(partial) && t !== partial)
    .slice(0, 8);

  if (!matches.length) return;

  const ac = document.createElement('div');
  ac.className = 'tag-autocomplete';
  ac.setAttribute('role', 'listbox');
  ac.setAttribute('aria-label', 'Tag suggestions');

  matches.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-autocomplete-item';
    btn.setAttribute('role', 'option');
    btn.textContent = tag;
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      // Replace partial with full tag
      const newText = textBefore.replace(/#[\w]*$/, `#${tag} `);
      textNode.textContent = newText + textNode.textContent.slice(range.startOffset);
      // Move caret to after inserted tag
      const newRange = document.createRange();
      newRange.setStart(textNode, newText.length);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      ac.remove();
      body.dispatchEvent(new Event('input'));
    });
    ac.appendChild(btn);
  });

  // Position relative to the editor body
  const bodyRect = body.getBoundingClientRect();
  const wc = page.querySelector('.note-wordcount-bar');
  page.querySelector('.editor-tag-preview').insertAdjacentElement('beforebegin', ac);
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
