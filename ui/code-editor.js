/**
 * MAKÉ UI — code-editor.js
 * Full-screen code editor with syntax highlighting.
 *
 * Changes:
 * - Syntax highlighting via utils/syntax.js (overlay pattern).
 *   The textarea accepts input; a <pre> mirror behind it displays
 *   coloured tokens.  The textarea background is transparent so the
 *   user sees highlighted code while the caret and selection still work.
 */

import { state, upsertItemInState } from '../core/state.js';
import { saveItem }                  from '../core/storage.js';
import { createItem, ItemType, ItemLayer } from '../core/schema.js';
import { esc, showToast }            from '../utils/helpers.js';
import { highlight }                 from '../utils/syntax.js';

const LANGUAGES = [
  'javascript','typescript','python','html','css','bash','json',
  'sql','java','swift','kotlin','rust','go','cpp','markdown','plaintext',
];

export function showCodeEditor(existingItem = null) {
  document.getElementById('code-editor-page')?.remove();

  const page = document.createElement('div');
  page.className = 'editor-page code-editor-page';
  page.id = 'code-editor-page';

  const currentLang = existingItem?.language || 'javascript';
  const currentCode = existingItem?.code     || '';

  page.innerHTML = `
    <div class="editor-topbar code-topbar">
      <button class="editor-back-btn" id="code-back">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <input class="code-filename-input" id="code-title" placeholder="filename.js"
             value="${esc(existingItem?.title || '')}" autocomplete="off" spellcheck="false">
      <button class="editor-save-btn" id="code-save">Save</button>
    </div>

    <div class="code-lang-strip" id="code-lang-strip">
      ${LANGUAGES.map(l =>
        `<button class="lang-tag ${l === currentLang ? 'active' : ''}" data-lang="${l}">${l}</button>`
      ).join('')}
    </div>

    <div class="code-editor-frame" id="code-editor-frame">
      <div class="code-gutter" id="code-gutter"></div>
      <div class="code-highlight-wrap">
        <!-- Syntax highlight mirror (behind textarea) -->
        <pre class="code-highlight" id="code-highlight" aria-hidden="true"></pre>
        <textarea class="code-textarea code-textarea--transparent" id="code-textarea"
                  placeholder="// Start coding…"
                  spellcheck="false"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off">${esc(currentCode)}</textarea>
      </div>
    </div>

    <div class="code-statusbar">
      <span class="code-status-lang" id="code-status-lang">${currentLang}</span>
      <span class="code-status-pos"  id="code-status-pos">Ln 1, Col 1</span>
      <button class="code-copy-btn" id="code-copy">
        <svg viewBox="0 0 24 24" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>
    </div>
  `;

  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));

  let selectedLang = currentLang;

  const textarea  = page.querySelector('#code-textarea');
  const highlight_ = page.querySelector('#code-highlight');
  const gutter    = page.querySelector('#code-gutter');
  const statusPos = page.querySelector('#code-status-pos');
  const statusLang = page.querySelector('#code-status-lang');

  // ── Highlight sync ────────────────────────────────────────────

  function refreshHighlight() {
    highlight_.innerHTML = highlight(textarea.value, selectedLang) + '\n';
  }

  // Sync textarea scroll to highlight mirror.
  function syncScroll() {
    highlight_.scrollTop  = textarea.scrollTop;
    highlight_.scrollLeft = textarea.scrollLeft;
    gutter.scrollTop      = textarea.scrollTop;
  }

  // ── Gutter ────────────────────────────────────────────────────

  function updateGutter() {
    const lines   = Math.max(textarea.value.split('\n').length, 20);
    const current = gutter.children.length;
    if (lines > current) {
      const frag = document.createDocumentFragment();
      for (let i = current + 1; i <= lines; i++) {
        const d = document.createElement('div');
        d.textContent = i;
        frag.appendChild(d);
      }
      gutter.appendChild(frag);
    } else if (lines < current) {
      while (gutter.children.length > lines) gutter.lastChild.remove();
    }
  }

  function updatePos() {
    const val   = textarea.value;
    const pos   = textarea.selectionStart;
    const lines = val.substring(0, pos).split('\n');
    statusPos.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
  }

  // ── Events ────────────────────────────────────────────────────

  textarea.addEventListener('input', () => {
    updateGutter();
    updatePos();
    refreshHighlight();
  });

  textarea.addEventListener('scroll', syncScroll);
  textarea.addEventListener('click',  updatePos);
  textarea.addEventListener('keyup',  updatePos);

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, s) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
      updateGutter();
      refreshHighlight();
    }

    // Auto-close brackets / quotes.
    const pairs = { '(':')', '[':']', '{':'}', '"':'"', "'":"'", '`':'`' };
    if (pairs[e.key]) {
      e.preventDefault();
      const s        = textarea.selectionStart;
      const end      = textarea.selectionEnd;
      const selected = textarea.value.substring(s, end);
      textarea.value =
        textarea.value.substring(0, s) + e.key + selected + pairs[e.key] + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 1;
    }
  });

  // Language selector.
  page.querySelector('#code-lang-strip').addEventListener('click', e => {
    const tag = e.target.closest('.lang-tag');
    if (!tag) return;
    page.querySelectorAll('.lang-tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
    selectedLang = tag.dataset.lang;
    statusLang.textContent = selectedLang;
    refreshHighlight();
  });

  // Copy.
  page.querySelector('#code-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(textarea.value)
      .then(() => showToast('Copied to clipboard'))
      .catch(() => showToast('Copy failed', true));
  });

  // ── Save / Close ─────────────────────────────────────────────

  const close = () => {
    page.classList.remove('open');
    setTimeout(() => page.remove(), 320);
  };

  page.querySelector('#code-back').addEventListener('click', close);

  page.querySelector('#code-save').addEventListener('click', async () => {
    const title = page.querySelector('#code-title').value.trim();
    const code  = textarea.value;
    if (!title && !code.trim()) { close(); return; }
    let saved;
    if (existingItem) {
      saved = await saveItem({ ...existingItem, title, code, language: selectedLang });
    } else {
      saved = await saveItem(createItem({
        layer: ItemLayer.BACKGROUND, type: ItemType.CODE, title, code, language: selectedLang,
      }));
    }
    upsertItemInState(saved);
    showToast(existingItem ? 'Code updated' : 'Code saved');
    close();
  });

  // ── Initial state ─────────────────────────────────────────────

  updateGutter();
  refreshHighlight();
  setTimeout(() => textarea.focus(), 380);
}
