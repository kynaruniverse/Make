/**
 * MAKÉ UI — code-editor.js (V16)
 *
 * Full IDE overhaul per design memo:
 *
 * ENGINE
 *   - Unified single-scroll container owns the scrollbar; gutter + highlight
 *     mirror + textarea all scroll as one rigid unit — zero drift.
 *   - Textarea expands to fill the full editor height (infinite canvas).
 *   - Line-height and font-size locked to CSS custom properties shared by
 *     all three layers, preventing line-number drift on long files.
 *
 * VISUALS
 *   - Floating glass topbar (backdrop-filter blur) — no hard border.
 *   - Language track: borderless pills, active one gets a sliding mauve
 *     underline that animates between selections (CSS custom property +
 *     transition on a pseudo-element).
 *   - Gutter spine: slightly lighter background than main area — no divider line.
 *   - Active-line highlight: full-width row tint follows the cursor.
 *   - Ghost placeholder: comment-green, dim, not white.
 *   - Floating copy/share icons in the top-right corner of the code area,
 *     revealed on scroll/hover.
 *
 * TYPOGRAPHY
 *   - JetBrains Mono loaded via Google Fonts (falls back to Fira Code → Consolas).
 *
 * COLOUR
 *   - Caret, selection, active line number all use var(--rose).
 *   - Token palette unchanged (VS Code Dark+).
 *
 * RETAINED FROM V15
 *   - Ctrl+F find/replace bar.
 *   - Save button loading guard.
 *   - Per-item scroll position restore.
 *   - Auto-backup call after save.
 */

import { state, upsertItemInState } from '../core/state.js';
import { saveItem }                  from '../core/storage.js';
import { createItem, ItemType, ItemLayer } from '../core/schema.js';
import { esc, showToast }            from '../utils/helpers.js';
import { highlight }                 from '../utils/syntax.js';

// ── Constants ──────────────────────────────────────────────────
const LANGUAGES = [
  'javascript','typescript','python','html','css','bash','json',
  'sql','java','swift','kotlin','rust','go','cpp','markdown','plaintext',
];

// The ONE authoritative line metric — must match CSS --ce-line-height
const LINE_H = 22;   // px  (1.6 × 13.75 rounded to integer for pixel-perfect gutter)
const FONT_S = 13.5; // px

// Per-item scroll position memory
const _scrollPositions = new Map();

// ── Editor factory ─────────────────────────────────────────────
export function showCodeEditor(existingItem = null) {
  document.getElementById('code-editor-page')?.remove();

  const page = document.createElement('div');
  page.className = 'editor-page code-editor-page';
  page.id = 'code-editor-page';

  const currentLang = existingItem?.language || 'javascript';
  const currentCode = existingItem?.code     || '';

  page.innerHTML = `
    <!-- ══ TOPBAR — glass, floating ══ -->
    <div class="ce-topbar" id="ce-topbar">
      <button class="ce-back" id="code-back" aria-label="Back">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <input class="ce-filename" id="code-title"
             placeholder="untitled.js"
             value="${esc(existingItem?.title || '')}"
             autocomplete="off" spellcheck="false">
      <button class="editor-save-btn" id="code-save">Save</button>
    </div>

    <!-- ══ LANGUAGE TRACK — single sliding underline ══ -->
    <div class="ce-lang-track" id="ce-lang-track" role="tablist" aria-label="Language">
      ${LANGUAGES.map(l =>
        `<button class="ce-lang-btn ${l === currentLang ? 'active' : ''}"
                 data-lang="${l}" role="tab"
                 aria-selected="${l === currentLang}">${l}</button>`
      ).join('')}
      <div class="ce-lang-slider" id="ce-lang-slider"></div>
    </div>

    <!-- ══ FIND / REPLACE ══ -->
    <div class="code-find-bar hidden" id="code-find-bar" role="search" aria-label="Find and replace">
      <input class="code-find-input"    id="code-find-input"    placeholder="Find…"         autocomplete="off" spellcheck="false">
      <input class="code-replace-input" id="code-replace-input" placeholder="Replace with…" autocomplete="off" spellcheck="false">
      <span class="code-find-count" id="code-find-count"></span>
      <button class="code-find-btn" id="code-find-prev"  title="Previous (Shift+Enter)">↑</button>
      <button class="code-find-btn" id="code-find-next"  title="Next (Enter)">↓</button>
      <button class="code-find-btn" id="code-replace-one"  title="Replace">⇄</button>
      <button class="code-find-btn" id="code-replace-all"  title="Replace all">⇄⇄</button>
      <button class="code-find-close" id="code-find-close" aria-label="Close">✕</button>
    </div>

    <!-- ══ UNIFIED SCROLL CONTAINER ══
         This single div owns the scrollbar.
         Gutter, highlight mirror, and textarea are all position:absolute
         children that grow with content — they never scroll independently. -->
    <div class="ce-scroll" id="ce-scroll">
      <div class="ce-inner" id="ce-inner">
        <div class="ce-gutter" id="ce-gutter" aria-hidden="true"></div>
        <div class="ce-code-area">
          <pre  class="ce-highlight" id="ce-highlight" aria-hidden="true"></pre>
          <div  class="ce-active-line" id="ce-active-line" aria-hidden="true"></div>
          <textarea class="ce-textarea" id="ce-textarea"
                    spellcheck="false"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    aria-label="Code editor"
                    aria-multiline="true">${esc(currentCode)}</textarea>
          <!-- Floating action icons -->
          <div class="ce-float-actions" id="ce-float-actions">
            <button class="ce-float-btn" id="code-copy" title="Copy code" aria-label="Copy">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ STATUS BAR ══ -->
    <div class="ce-statusbar">
      <span class="ce-status-lang" id="ce-status-lang">${currentLang}</span>
      <span class="ce-status-pos"  id="ce-status-pos">Ln 1, Col 1</span>
    </div>
  `;

  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add('open'));

  // ── Element refs ──────────────────────────────────────────────
  let selectedLang = currentLang;

  const scroll     = page.querySelector('#ce-scroll');
  const inner      = page.querySelector('#ce-inner');
  const gutter     = page.querySelector('#ce-gutter');
  const highlight_ = page.querySelector('#ce-highlight');
  const activeLine = page.querySelector('#ce-active-line');
  const textarea   = page.querySelector('#ce-textarea');
  const statusPos  = page.querySelector('#ce-status-pos');
  const statusLang = page.querySelector('#ce-status-lang');
  const findBar    = page.querySelector('#code-find-bar');
  const findInput  = page.querySelector('#code-find-input');
  const replaceInput = page.querySelector('#code-replace-input');
  const findCount  = page.querySelector('#code-find-count');
  const floatActions = page.querySelector('#ce-float-actions');
  const langTrack  = page.querySelector('#ce-lang-track');
  const slider     = page.querySelector('#ce-lang-slider');

  // ── Sizing helpers ─────────────────────────────────────────────
  /**
   * Expand the inner container and textarea to be at least as tall
   * as the number of lines (or the scroll viewport, whichever is bigger).
   * This gives the "infinite canvas" feel — even two lines fill the screen.
   */
  function sizeCanvas() {
    const lineCount = Math.max(textarea.value.split('\n').length + 2, 1);
    const minH      = scroll.clientHeight;
    const contentH  = lineCount * LINE_H + 32; // 32px bottom padding
    const h         = Math.max(minH, contentH);
    inner.style.minHeight  = `${h}px`;
    textarea.style.height  = `${h}px`;
    highlight_.style.height = `${h}px`;
    gutter.style.minHeight  = `${h}px`;
  }

  // ── Gutter ─────────────────────────────────────────────────────
  function updateGutter() {
    const lines   = Math.max(textarea.value.split('\n').length, 1);
    const current = gutter.children.length;
    if (lines > current) {
      const frag = document.createDocumentFragment();
      for (let i = current + 1; i <= lines; i++) {
        const d = document.createElement('div');
        d.className   = 'ce-gutter-num';
        d.textContent = i;
        frag.appendChild(d);
      }
      gutter.appendChild(frag);
    } else {
      while (gutter.children.length > lines) gutter.lastChild.remove();
    }
  }

  // ── Highlight ──────────────────────────────────────────────────
  function refreshHighlight() {
    highlight_.innerHTML = highlight(textarea.value, selectedLang) + '\n';
  }

  // ── Active-line highlight ──────────────────────────────────────
  function updateActiveLine() {
    const val  = textarea.value;
    const pos  = textarea.selectionStart;
    const line = val.substring(0, pos).split('\n').length;
    const top  = (line - 1) * LINE_H;
    activeLine.style.transform = `translateY(${top}px)`;
    activeLine.style.opacity   = document.activeElement === textarea ? '1' : '0';

    // Highlight active gutter number
    gutter.querySelectorAll('.ce-gutter-num').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === line);
    });
  }

  // ── Cursor position status ─────────────────────────────────────
  function updatePos() {
    const val   = textarea.value;
    const pos   = textarea.selectionStart;
    const lines = val.substring(0, pos).split('\n');
    statusPos.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
    updateActiveLine();
  }

  // ── Unified: one function to update everything ─────────────────
  function refresh() {
    updateGutter();
    refreshHighlight();
    updatePos();
    sizeCanvas();
  }

  // ── Language slider animation ──────────────────────────────────
  function positionSlider(activeBtn) {
    if (!activeBtn || !langTrack) return;
    const trackRect = langTrack.getBoundingClientRect();
    const btnRect   = activeBtn.getBoundingClientRect();
    slider.style.width = `${btnRect.width}px`;
    slider.style.left  = `${btnRect.left - trackRect.left + langTrack.scrollLeft}px`;
  }

  // Position slider on first render after layout
  requestAnimationFrame(() => {
    positionSlider(langTrack.querySelector('.ce-lang-btn.active'));
  });

  // ── Floating actions: show on scroll / touch ───────────────────
  let _floatHideTimer;
  function showFloatActions() {
    floatActions.classList.add('visible');
    clearTimeout(_floatHideTimer);
    _floatHideTimer = setTimeout(() => floatActions.classList.remove('visible'), 2200);
  }
  scroll.addEventListener('scroll', showFloatActions, { passive: true });
  page.querySelector('.ce-code-area').addEventListener('touchstart', showFloatActions, { passive: true });
  page.querySelector('.ce-code-area').addEventListener('mouseenter', () => floatActions.classList.add('visible'));
  page.querySelector('.ce-code-area').addEventListener('mouseleave', () => {
    _floatHideTimer = setTimeout(() => floatActions.classList.remove('visible'), 800);
  });

  // ── Events ─────────────────────────────────────────────────────
  textarea.addEventListener('input', refresh);
  textarea.addEventListener('click', updatePos);
  textarea.addEventListener('keyup', updatePos);
  textarea.addEventListener('focus', updateActiveLine);
  textarea.addEventListener('blur',  updateActiveLine);

  textarea.addEventListener('keydown', e => {
    // Ctrl/Cmd+F → find
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault(); _openFindBar(); return;
    }
    if (e.key === 'Escape' && !findBar.classList.contains('hidden')) {
      _closeFindBar(); return;
    }
    // Tab → two spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart, end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, s) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
      refresh();
    }
    // Auto-close brackets
    const pairs = { '(':')', '[':']', '{':'}', '"':'"', "'":"'", '`':'`' };
    if (pairs[e.key]) {
      e.preventDefault();
      const s = textarea.selectionStart, end = textarea.selectionEnd;
      const sel = textarea.value.substring(s, end);
      textarea.value =
        textarea.value.substring(0, s) + e.key + sel + pairs[e.key] + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 1;
    }
  });

  // ── Language track ─────────────────────────────────────────────
  langTrack.addEventListener('click', e => {
    const btn = e.target.closest('.ce-lang-btn');
    if (!btn) return;
    langTrack.querySelectorAll('.ce-lang-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    selectedLang = btn.dataset.lang;
    statusLang.textContent = selectedLang;
    refreshHighlight();
    positionSlider(btn);
    // Scroll btn into view on the track
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });

  // ── Copy ───────────────────────────────────────────────────────
  page.querySelector('#code-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(textarea.value)
      .then(() => showToast('Copied to clipboard'))
      .catch(() => showToast('Copy failed', true));
  });

  // ── Find / Replace ─────────────────────────────────────────────
  let _findMatches = [], _findIdx = 0;

  function _runFind() {
    _findMatches = [];
    const q = findInput.value;
    if (!q) { findCount.textContent = ''; return; }
    const text = textarea.value;
    let idx = 0;
    while ((idx = text.indexOf(q, idx)) !== -1) { _findMatches.push(idx); idx += q.length; }
    findCount.textContent = _findMatches.length
      ? `${Math.min(_findIdx + 1, _findMatches.length)} / ${_findMatches.length}`
      : 'No results';
    if (_findMatches.length) _jumpToMatch(_findIdx);
  }

  function _jumpToMatch(i) {
    if (!_findMatches.length) return;
    _findIdx = (i + _findMatches.length) % _findMatches.length;
    const pos = _findMatches[_findIdx];
    textarea.focus();
    textarea.setSelectionRange(pos, pos + findInput.value.length);
    findCount.textContent = `${_findIdx + 1} / ${_findMatches.length}`;
    // Scroll so match is visible
    const lineNum = textarea.value.substring(0, pos).split('\n').length;
    scroll.scrollTop = Math.max(0, (lineNum - 4) * LINE_H);
    updateActiveLine();
  }

  function _openFindBar() {
    findBar.classList.remove('hidden');
    findInput.focus(); findInput.select();
    _runFind();
  }

  function _closeFindBar() {
    findBar.classList.add('hidden');
    textarea.focus();
    _findMatches = []; findCount.textContent = '';
  }

  findInput.addEventListener('input', () => { _findIdx = 0; _runFind(); });
  page.querySelector('#code-find-prev').addEventListener('click', () => _jumpToMatch(_findIdx - 1));
  page.querySelector('#code-find-next').addEventListener('click', () => _jumpToMatch(_findIdx + 1));
  page.querySelector('#code-find-close').addEventListener('click', _closeFindBar);

  page.querySelector('#code-replace-one').addEventListener('click', () => {
    if (!_findMatches.length) return;
    const pos = _findMatches[_findIdx], q = findInput.value, rep = replaceInput.value;
    textarea.value = textarea.value.substring(0, pos) + rep + textarea.value.substring(pos + q.length);
    refresh(); _findIdx = 0; _runFind();
  });

  page.querySelector('#code-replace-all').addEventListener('click', () => {
    const q = findInput.value, rep = replaceInput.value;
    if (!q) return;
    textarea.value = textarea.value.split(q).join(rep);
    refresh(); _runFind();
    showToast(`Replaced all occurrences of "${q}"`);
  });

  findInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.shiftKey) _jumpToMatch(_findIdx - 1);
    else if (e.key === 'Enter') _jumpToMatch(_findIdx + 1);
    else if (e.key === 'Escape') _closeFindBar();
  });

  // ── Save / Close ───────────────────────────────────────────────
  const close = () => {
    if (existingItem?.id) _scrollPositions.set(existingItem.id, scroll.scrollTop);
    page.classList.remove('open');
    setTimeout(() => page.remove(), 320);
  };

  page.querySelector('#code-back').addEventListener('click', close);

  page.querySelector('#code-save').addEventListener('click', async () => {
    const saveBtn = page.querySelector('#code-save');
    if (saveBtn.classList.contains('loading')) return;
    const title = page.querySelector('#code-title').value.trim();
    const code  = textarea.value;
    if (!title && !code.trim()) { close(); return; }

    saveBtn.classList.add('loading');
    saveBtn.textContent = '';

    try {
      let saved;
      if (existingItem) {
        saved = await saveItem({ ...existingItem, title, code, language: selectedLang });
      } else {
        saved = await saveItem(createItem({
          layer: ItemLayer.BACKGROUND, type: ItemType.CODE, title, code, language: selectedLang,
        }));
      }
      upsertItemInState(saved);
      window._makeAutoBackup?.();
      showToast(existingItem ? 'Code updated' : 'Code saved');
      close();
    } catch (err) {
      console.error('[Maké] save code failed', err);
      showToast('Save failed — please try again', true);
      saveBtn.classList.remove('loading');
      saveBtn.textContent = 'Save';
    }
  });

  // ── Resize observer: re-size canvas when page height changes ───
  const ro = new ResizeObserver(() => sizeCanvas());
  ro.observe(scroll);

  // ── Initial render ─────────────────────────────────────────────
  refresh();
  setTimeout(() => {
    textarea.focus();
    if (existingItem?.id && _scrollPositions.has(existingItem.id)) {
      scroll.scrollTop = _scrollPositions.get(existingItem.id);
    }
    updateActiveLine();
    positionSlider(langTrack.querySelector('.ce-lang-btn.active'));
  }, 380);
}
