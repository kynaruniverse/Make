let overlay, modal, titleEl, contentEl, okBtn, cancelBtn;

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
            if (this._onOk) this._onOk();
            this.hide();
        });
    },

    show(title, contentHtml, onOk) {
        titleEl.textContent = title;
        contentEl.innerHTML = contentHtml;
        this._onOk = onOk;
        overlay.classList.add('visible');
    },

    hide() {
        overlay.classList.remove('visible');
    },

    showEditModal(widget) {
        // Build form based on widget type
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
            // Update widget and save
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
            await (await import('../core/storage.js')).saveWidget(widget);
            (await import('../core/state.js')).state.widgets = await (await import('../core/storage.js')).getAllWidgets();
        });
    }
};

export function showModal(title, contentHtml, onOk) {
    Modal.show(title, contentHtml, onOk);
}

export function showSettings() {
    Modal.show('Settings', `
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="export-btn">Export Backup</button>
            <button id="import-btn">Import Backup</button>
        </div>
        <div style="margin-top:16px;">
            <button id="gist-sync">Sync with GitHub Gist (beta)</button>
        </div>
    `, () => {});
    // Attach listeners after modal shows
    document.getElementById('export-btn').addEventListener('click', () => {
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
    document.getElementById('import-btn').addEventListener('click', () => {
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
                (await import('../core/state.js')).state.widgets = await (await import('../core/storage.js')).getAllWidgets();
                Modal.hide();
            };
            reader.readAsText(file);
        };
        input.click();
    });
    document.getElementById('gist-sync').addEventListener('click', () => {
        alert('GitHub Gist sync not yet implemented.');
        Modal.hide();
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"]/g, function(m) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m];
    });
}
