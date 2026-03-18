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
        this.container.innerHTML = '';
        widgets.forEach(w => {
            const card = Card(w);
            this.container.appendChild(card);
        });
    }
};
