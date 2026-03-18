import { state } from '../core/state.js';
import { getSortedWidgets } from '../core/gridEngine.js';
import { Card } from './Card.js';

export const Grid = {
    container: null,

    render(parent) {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'grid';
            parent.appendChild(this.container);
        }
        this.refresh();
    },

    refresh() {
        if (!this.container) return;
        const widgets = getSortedWidgets();
        if (widgets.length === 0) {
            this.showEmptyState();
        } else {
            this.container.innerHTML = '';
            widgets.forEach(w => {
                const card = Card(w);
                this.container.appendChild(card);
            });
        }
    },

    showEmptyState() {
        const tab = state.currentTab;
        let message = '';
        let example = '';
        switch (tab) {
            case 'notes':
                message = 'No notes yet.';
                example = 'Type `note Buy milk` to create one.';
                break;
            case 'code':
                message = 'No code snippets.';
                example = 'Type `code fetch API` to add a snippet.';
                break;
            case 'links':
                message = 'No links saved.';
                example = 'Type `link https://example.com` to save a link.';
                break;
            case 'sticky':
                message = 'No sticky notes.';
                example = 'Type `sticky Remember this` to create a sticky.';
                break;
        }
        this.container.innerHTML = `
            <div class="empty-state">
                <p>${message}</p>
                <p class="empty-hint">${example}</p>
                <p class="empty-command">⌘ to open command palette</p>
            </div>
        `;
    }
};
