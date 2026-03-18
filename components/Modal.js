let overlay, modal, titleEl, contentEl, okBtn, cancelBtn;
let currentOnOk = null;

export const Modal = {
    init() {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <h3 id="modal-title"></h3>
                <div id="modal-content" class="modal-content"></div>
                <div class="modal-actions">
                    <button id="modal-cancel">Cancel</button>
                    <button id="modal-ok">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        modal = overlay.querySelector('.modal');
        titleEl = document.getElementById('modal-title');
        contentEl = document.getElementById('modal-content');
        okBtn = document.getElementById('modal-ok');
        cancelBtn = document.getElementById('modal-cancel');

        cancelBtn.addEventListener('click', () => this.hide());
        okBtn.addEventListener('click', () => {
            if (currentOnOk) currentOnOk();
            this.hide();
        });
    },

    show(title, contentHtml, onOk) {
        titleEl.textContent = title;
        contentEl.innerHTML = contentHtml;
        currentOnOk = onOk;
        overlay.classList.add('visible');
    },

    hide() {
        overlay.classList.remove('visible');
        currentOnOk = null;
    },

    showEditModal(widget) {
        let html = '';
        if (widget.type === 'note') {
            html = `
                <input id="modal-note-title" value="${escapeHTML(widget.title || '')}" placeholder="Title">
                <textarea id="modal-note-content" placeholder="Note">${escapeHTML(widget.content || '')}</textarea>
            `;
        } else if (widget.type === 'code') {
            html = `
                <input id="modal-code-title" value="${escapeHTML(widget.title || '')}" placeholder="Title">
                <textarea id="modal-code-content" placeholder="Code">${escapeHTML(widget.code || '')}</textarea>
                <select id="modal-code-lang">
                    <option ${widget.language==='javascript'?'selected':''}>javascript</option>
                    <option ${widget.language==='python'?'selected':''}>python</option>
                    <option ${widget.language==='html'?'selected':''}>html</option>
                    <option ${widget.language==='css'?'selected':''}>css</option>
                </select>
            `;
        } else if (widget.type === 'link') {
            html = `
                <input id="modal-link-url" value="${escapeHTML(widget.url || '')}" placeholder="URL">
                <input id="modal-link-title" value="${escapeHTML(widget.title || '')}" placeholder="Title (optional)">
            `;
        } else if (widget.type === 'sticky') {
            html = `
                <textarea id="modal-sticky-text" placeholder="Sticky note">${escapeHTML(widget.text || '')}</textarea>
                <input id="modal-sticky-color" type="color" value="${escapeHTML(widget.color || '#2a5f3a')}">
            `;
        }
        this.show(`Edit ${widget.type}`, html, async () => {
            if (widget.type === 'note') {
                widget.title = document.getElementById('modal-note-title').value;
                widget.content = document.getElementById('modal-note-content').value;
            } else if (widget.type === 'code') {
                widget.title = document.getElementById('modal-code-title').value;
                widget.code = document.getElementById('modal-code-content').value;
                widget.language = document.getElementById('modal-code-lang').value;
            } else if (widget.type === 'link') {
                widget.url = document.getElementById('modal-link-url').value;
                widget.title = document.getElementById('modal-link-title').value;
            } else if (widget.type === 'sticky') {
                widget.text = document.getElementById('modal-sticky-text').value;
                widget.color = document.getElementById('modal-sticky-color').value;
            }
            const { saveWidget } = await import('../core/storage.js');
            await saveWidget(widget);
            const { state } = await import('../core/state.js');
            state.widgets = await (await import('../core/storage.js')).getAllWidgets();
        });
    }
};

export function showModal(title, contentHtml, onOk) {
    Modal.show(title, contentHtml, onOk);
}

export function showSettings() {
    const token = localStorage.getItem('github_token') || '';
    Modal.show('Settings', `
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="export-btn">Export Backup</button>
            <button id="import-btn">Import Backup</button>
        </div>
        <div class="github-sync" style="margin-top:16px; border-top:1px solid #2a2f33; padding-top:16px;">
            <h4 style="margin-bottom:8px;">GitHub Gist Sync</h4>
            <input type="password" id="github-token" placeholder="Personal Access Token" value="${escapeHTML(token)}">
            <button id="save-token">Save Token</button>
            <button id="sync-gist">Sync to Gist</button>
            <div id="gist-status" style="margin-top:8px; font-size:12px;"></div>
        </div>
    `, () => {});

    setTimeout(() => {
        document.getElementById('export-btn')?.addEventListener('click', () => {
            import('../core/storage.js').then(({ getAllWidgets }) => {
                getAllWidgets().then(widgets => {
                    const data = JSON.stringify(widgets, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `make-backup-${new Date().toISOString().slice(0,10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    Modal.hide();
                });
            });
        });
        document.getElementById('import-btn')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const imported = JSON.parse(ev.target.result);
                    const { clearAll, saveWidget } = await import('../core/storage.js');
                    await clearAll();
                    for (let w of imported) {
                        delete w.id;
                        await saveWidget(w);
                    }
                    const { state } = await import('../core/state.js');
                    state.widgets = await (await import('../core/storage.js')).getAllWidgets();
                    Modal.hide();
                };
                reader.readAsText(file);
            };
            input.click();
        });

        // GitHub token save
        const tokenInput = document.getElementById('github-token');
        document.getElementById('save-token')?.addEventListener('click', () => {
            localStorage.setItem('github_token', tokenInput.value);
            document.getElementById('gist-status').textContent = 'Token saved locally.';
        });

        document.getElementById('sync-gist')?.addEventListener('click', async () => {
            const token = localStorage.getItem('github_token');
            if (!token) {
                document.getElementById('gist-status').textContent = 'Please save a token first.';
                return;
            }
            const status = document.getElementById('gist-status');
            status.textContent = 'Syncing...';
            try {
                const { getAllWidgets } = await import('../core/storage.js');
                const widgets = await getAllWidgets();
                const gistData = {
                    description: 'Maké backup',
                    public: false,
                    files: {
                        'make-backup.json': {
                            content: JSON.stringify(widgets, null, 2)
                        }
                    }
                };
                const res = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(gistData)
                });
                if (!res.ok) throw new Error('GitHub API error');
                const data = await res.json();
                status.innerHTML = `✅ Synced! <a href="${data.html_url}" target="_blank">View Gist</a>`;
            } catch (err) {
                status.textContent = `❌ Sync failed: ${err.message}`;
            }
        });
    }, 100);
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"]/g, function(m) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m];
    });
}
