import { state } from '../core/state.js';
import { deleteWidget } from '../core/storage.js';
import { showModal } from './Modal.js';
import { showUndo } from './UndoToast.js';

export function Card(widget) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = widget.id;
    card.dataset.type = widget.type;

    // Header
    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `<span>${widget.type}</span><span>${new Date(widget.createdAt).toLocaleDateString()}</span>`;
    card.appendChild(header);

    // Title
    if (widget.title) {
        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = widget.title;
        card.appendChild(title);
    }

    // Content preview
    const content = document.createElement('div');
    content.className = 'card-content';
    if (widget.type === 'code') {
        content.innerHTML = `<pre><code>${escapeHTML(widget.code?.substring(0, 100))}${widget.code?.length > 100 ? '…' : ''}</code></pre>`;
    } else if (widget.type === 'link') {
        content.innerHTML = `<a href="${widget.url}" target="_blank" class="widget-link">${widget.title || widget.url}</a>`;
    } else if (widget.type === 'sticky') {
        content.style.backgroundColor = widget.color || '#2a2f33';
        content.style.padding = '8px';
        content.style.borderRadius = '8px';
        content.textContent = widget.text?.substring(0, 100);
    } else {
        content.textContent = widget.content?.substring(0, 100);
    }
    card.appendChild(content);

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'card-footer';

    // Size toggles (S/M/L)
    const sizeToggles = ['S','M','L'].map(sz => {
        const btn = document.createElement('button');
        btn.textContent = sz;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            widget.size = sz.toLowerCase();
            // Update UI (simple width change)
            card.style.width = sz === 'S' ? '200px' : sz === 'M' ? '280px' : '360px';
        });
        return btn;
    });
    sizeToggles.forEach(btn => footer.appendChild(btn));

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✎';
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editWidget(widget);
    });
    footer.appendChild(editBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '✕';
    delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteWidget(widget.id);
        showUndo('Widget deleted', async () => {
            // Undo: re-save the widget
            await (await import('../core/storage.js')).saveWidget(widget);
        });
        state.widgets = await (await import('../core/storage.js')).getAllWidgets();
    });
    footer.appendChild(delBtn);

    card.appendChild(footer);

    // Long press for selection mode
    let pressTimer;
    card.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            state.selectionMode = true;
            state.selectedIds.add(widget.id);
            state._notify(); // trigger UI update
        }, 500);
    });
    card.addEventListener('touchend', () => clearTimeout(pressTimer));
    card.addEventListener('touchmove', () => clearTimeout(pressTimer));

    // Double-click/tap for inline edit
    card.addEventListener('dblclick', () => {
        quickInlineEdit(widget);
    });

    return card;
}

function editWidget(widget) {
    // Reuse modal from commandParser but with pre-filled fields
    import('./Modal.js').then(m => {
        m.showEditModal(widget);
    });
}

function quickInlineEdit(widget) {
    // Simple inline editing – for demo we just open modal
    editWidget(widget);
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"]/g, function(m) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m];
    });
}
