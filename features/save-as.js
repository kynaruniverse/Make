/**
 * MAKÉ FEATURES — save-as.js (V1)
 *
 * "Save As" — export a single item to a real file on the device.
 *
 * Uses the File System Access API (showSaveFilePicker) where available
 * (Chrome/Android/Edge), falling back to a blob download link everywhere else
 * (iOS Safari, Firefox).
 *
 * Format options per item type:
 *
 *   Note    → Plain Text (.txt)  · Markdown (.md)
 *   Code    → Source file        · Plain Text (.txt)
 *   Link    → Copy URL           · Text file (.txt)
 *   Sticky  → Plain Text (.txt)
 *
 * Public API:
 *   showSaveAsSheet(item)   — shows the bottom-sheet picker
 */

import { esc, showToast } from '../utils/helpers.js';

// ── Language → file extension map ────────────────────────────
const LANG_EXT = {
  javascript:  'js',
  typescript:  'ts',
  python:      'py',
  html:        'html',
  css:         'css',
  json:        'json',
  bash:        'sh',
  sql:         'sql',
  java:        'java',
  rust:        'rs',
  go:          'go',
  swift:       'swift',
  kotlin:      'kt',
  cpp:         'cpp',
  markdown:    'md',
  plaintext:   'txt',
};

// ── Public: show the Save As bottom sheet ─────────────────────

export function showSaveAsSheet(item) {
  // Remove any existing sheet
  document.getElementById('save-as-overlay')?.remove();

  const options = _buildOptions(item);

  const overlay = document.createElement('div');
  overlay.id        = 'save-as-overlay';
  overlay.className = 'save-as-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'save-as-sheet';

  sheet.innerHTML = `
    <div class="save-as-handle"></div>
    <div class="save-as-title">Save as…</div>
    <div class="save-as-subtitle">${esc(item.title || 'Untitled')}</div>
    <div class="save-as-options">
      ${options.map((opt, i) => `
        <button class="save-as-option" data-idx="${i}">
          <span class="save-as-option-icon">${opt.icon}</span>
          <div class="save-as-option-text">
            <div class="save-as-option-label">${opt.label}</div>
            <div class="save-as-option-desc">${opt.desc}</div>
          </div>
          <span class="save-as-option-ext">${opt.ext}</span>
        </button>`).join('')}
    </div>
    <button class="save-as-cancel">Cancel</button>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    sheet.classList.add('open');
  });

  const close = () => {
    overlay.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => overlay.remove(), 320);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  sheet.querySelector('.save-as-cancel').addEventListener('click', close);

  sheet.querySelectorAll('.save-as-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      const opt = options[+btn.dataset.idx];
      close();
      await _runOption(opt, item);
    });
  });
}

// ── Build options per item type ───────────────────────────────

function _buildOptions(item) {
  if (item.type === 'note') {
    return [
      {
        icon: '📄', label: 'Plain text', desc: 'Simple .txt file — opens anywhere',
        ext: '.txt', action: 'note-txt',
      },
      {
        icon: '📝', label: 'Markdown', desc: 'Formatted .md file for editors like Notion or Obsidian',
        ext: '.md', action: 'note-md',
      },
    ];
  }

  if (item.type === 'code') {
    const lang = item.language || 'plaintext';
    const ext  = LANG_EXT[lang] || 'txt';
    return [
      {
        icon: '💾', label: `${lang.charAt(0).toUpperCase() + lang.slice(1)} source file`,
        desc: `Saves as a real .${ext} file you can open in any code editor`,
        ext: `.${ext}`, action: 'code-source',
      },
      {
        icon: '📄', label: 'Plain text', desc: 'Generic .txt version',
        ext: '.txt', action: 'code-txt',
      },
    ];
  }

  if (item.type === 'link') {
    return [
      {
        icon: '📋', label: 'Copy URL', desc: 'Copies the link to your clipboard',
        ext: 'clipboard', action: 'link-copy',
      },
      {
        icon: '📄', label: 'Save as text', desc: 'Saves the URL and label as a .txt file',
        ext: '.txt', action: 'link-txt',
      },
    ];
  }

  if (item.type === 'sticky') {
    return [
      {
        icon: '📄', label: 'Plain text', desc: 'Saves your sticky note as a .txt file',
        ext: '.txt', action: 'sticky-txt',
      },
    ];
  }

  return [];
}

// ── Run the chosen option ─────────────────────────────────────

async function _runOption(opt, item) {
  switch (opt.action) {

    case 'note-txt': {
      const plain = _htmlToPlain(item.content || '');
      const text  = `${item.title || 'Untitled'}\n${'─'.repeat(40)}\n\n${plain}`;
      await _saveFile(text, `${_slug(item.title)}.txt`, 'text/plain', [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }]);
      break;
    }

    case 'note-md': {
      const md   = _htmlToMarkdown(item.content || '');
      const text = `# ${item.title || 'Untitled'}\n\n${md}`;
      await _saveFile(text, `${_slug(item.title)}.md`, 'text/markdown', [{ description: 'Markdown file', accept: { 'text/markdown': ['.md'] } }]);
      break;
    }

    case 'code-source': {
      const lang = item.language || 'plaintext';
      const ext  = LANG_EXT[lang] || 'txt';
      const mime = ext === 'html' ? 'text/html' : ext === 'css' ? 'text/css' : ext === 'json' ? 'application/json' : 'text/plain';
      await _saveFile(item.code || '', `${_slug(item.title)}.${ext}`, mime, [{ description: `${lang} file`, accept: { [mime]: [`.${ext}`] } }]);
      break;
    }

    case 'code-txt': {
      await _saveFile(item.code || '', `${_slug(item.title)}.txt`, 'text/plain', [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }]);
      break;
    }

    case 'link-copy': {
      try {
        await navigator.clipboard.writeText(item.url || '');
        showToast('URL copied to clipboard');
      } catch {
        showToast('Could not copy — try long-pressing the URL', true);
      }
      break;
    }

    case 'link-txt': {
      const text = `${item.title || 'Link'}\n${item.url || ''}\n\nSaved from Maké`;
      await _saveFile(text, `${_slug(item.title)}.txt`, 'text/plain', [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }]);
      break;
    }

    case 'sticky-txt': {
      await _saveFile(item.text || '', `sticky-note.txt`, 'text/plain', [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }]);
      break;
    }
  }
}

// ── File save helper ──────────────────────────────────────────

async function _saveFile(content, suggestedName, mimeType, types) {
  if ('showSaveFilePicker' in window) {
    try {
      const handle   = await window.showSaveFilePicker({ suggestedName, types });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      showToast(`Saved as ${suggestedName}`);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled — fine
      // Fall through to blob download
    }
  }
  // Fallback: blob download (iOS, Firefox, older browsers)
  const blob = new Blob([content], { type: mimeType });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: suggestedName,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Downloading ${suggestedName}`);
}

// ── HTML → Plain text ─────────────────────────────────────────

function _htmlToPlain(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').trim();
}

// ── HTML → Markdown (basic) ───────────────────────────────────

function _htmlToMarkdown(html) {
  return html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, (_, t) => `## ${_strip(t)}\n\n`)
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, (_, t) => `**${_strip(t)}**`)
    .replace(/<b[^>]*>(.*?)<\/b>/gi,           (_, t) => `**${_strip(t)}**`)
    .replace(/<em[^>]*>(.*?)<\/em>/gi,         (_, t) => `_${_strip(t)}_`)
    .replace(/<i[^>]*>(.*?)<\/i>/gi,           (_, t) => `_${_strip(t)}_`)
    .replace(/<s[^>]*>(.*?)<\/s>/gi,           (_, t) => `~~${_strip(t)}~~`)
    .replace(/<u[^>]*>(.*?)<\/u>/gi,           (_, t) => _strip(t)) // no MD underline
    .replace(/<li[^>]*>(.*?)<\/li>/gi,         (_, t) => `- ${_strip(t)}\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div[^>]*>(.*?)<\/div>/gi,       (_, t) => `${_strip(t)}\n`)
    .replace(/<p[^>]*>(.*?)<\/p>/gi,           (_, t) => `${_strip(t)}\n\n`)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function _strip(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}

// ── Filename slug ─────────────────────────────────────────────

function _slug(title = '') {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}
