import { state } from './state.js';
import { saveWidget } from './storage.js';
import { showModal } from '../components/Modal.js';

export function parseCommand(input) {
    input = input.trim();
    if (!input) return;

    const parts = input.split(' ');
    const cmd = parts[0].toLowerCase();
    const rest = parts.slice(1).join(' ');

    switch (cmd) {
        case 'note':
            createNote(rest);
            break;
        case 'code':
            createCode(rest);
            break;
        case 'link':
            createLink(rest);
            break;
        case 'sticky':
            createSticky(rest);
            break;
        default:
            // treat as search
            search(input);
    }
}

function createNote(title) {
    showModal('New Note', `
        <input id="modal-note-title" placeholder="Title" value="${escapeHTML(title)}">
        <textarea id="modal-note-content" placeholder="Note content (Markdown supported)"></textarea>
    `, async () => {
        const t = document.getElementById('modal-note-title').value;
        const c = document.getElementById('modal-note-content').value;
        if (t || c) {
            const widget = { type: 'note', title: t, content: c, size: 'medium' };
            await saveWidget(widget);
            state.widgets = await (await import('./storage.js')).getAllWidgets();
        }
    });
}

// Similar for createCode, createLink, createSticky – will be expanded later
function createCode(title) { /* ... */ }
function createLink(url) { /* ... */ }
function createSticky(text) { /* ... */ }

function search(query) {
    // Simple search in titles and content – will be improved
    const results = state.widgets.filter(w => 
        (w.title && w.title.toLowerCase().includes(query.toLowerCase())) ||
        (w.content && w.content.toLowerCase().includes(query.toLowerCase()))
    );
    // Display results in command palette
    import('../components/CommandPalette.js').then(m => m.showSearchResults(results));
}

function escapeHTML(str) {
    return String(str).replace(/[&<>"]/g, function(m) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m];
    });
}
