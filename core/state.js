// Simple pub/sub state
export const state = {
    _data: {
        widgets: [],
        currentTab: 'notes',
        ambientEnabled: false,
        selectionMode: false,
        selectedIds: new Set()
    },
    _listeners: [],

    get widgets() { return this._data.widgets; },
    set widgets(val) { this._data.widgets = val; this._notify(); },

    get currentTab() { return this._data.currentTab; },
    set currentTab(val) { this._data.currentTab = val; this._notify(); },

    get ambientEnabled() { return this._data.ambientEnabled; },
    set ambientEnabled(val) { this._data.ambientEnabled = val; this._notify(); },

    get selectionMode() { return this._data.selectionMode; },
    set selectionMode(val) { this._data.selectionMode = val; this._notify(); },

    get selectedIds() { return this._data.selectedIds; },
    set selectedIds(val) { this._data.selectedIds = val; this._notify(); },

    // Helper methods
    toggleSelection(id) {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
        this._notify(); // trigger re-render of cards
    },

    clearSelection() {
        this.selectedIds.clear();
        this.selectionMode = false;
        this._notify();
    },

    subscribe(callback) {
        this._listeners.push(callback);
    },
    _notify() {
        this._listeners.forEach(fn => fn());
    }
};

// Load initial data from storage
import { getAllWidgets } from './storage.js';
export async function loadInitialData() {
    state.widgets = await getAllWidgets() || [];
}
