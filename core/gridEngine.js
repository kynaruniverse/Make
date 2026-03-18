import { state } from './state.js';

export function getSortedWidgets() {
    let widgets = [...state.widgets];
    // Filter by current tab
    const tab = state.currentTab;
    widgets = widgets.filter(w => {
        if (tab === 'notes') return w.type === 'note';
        if (tab === 'code') return w.type === 'code';
        if (tab === 'links') return w.type === 'link';
        if (tab === 'sticky') return w.type === 'sticky';
        return true;
    });

    // Ambient sorting
    if (state.ambientEnabled) {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
            // Morning: notes first
            widgets.sort((a,b) => {
                if (a.type === 'note' && b.type !== 'note') return -1;
                if (b.type === 'note' && a.type !== 'note') return 1;
                return 0;
            });
        } else if (hour >= 12 && hour < 18) {
            // Afternoon: links first
            widgets.sort((a,b) => {
                if (a.type === 'link' && b.type !== 'link') return -1;
                if (b.type === 'link' && a.type !== 'link') return 1;
                return 0;
            });
        } else {
            // Evening: code first
            widgets.sort((a,b) => {
                if (a.type === 'code' && b.type !== 'code') return -1;
                if (b.type === 'code' && a.type !== 'code') return 1;
                return 0;
            });
        }
    }

    return widgets;
}
