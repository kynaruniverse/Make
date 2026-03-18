import { getAllItems, getItemsByLayer } from './storage.js';

export const state = {
    _data: {
        backgroundItems: [], // cards (note, code, link)
        stickyItems: [],     // floating stickies
        currentTab: 'notes',
        showAddMenu: false,
        selectedStickyId: null
    },
    _listeners: [],

    get backgroundItems() { return this._data.backgroundItems; },
    set backgroundItems(val) { this._data.backgroundItems = val; this._notify(); },

    get stickyItems() { return this._data.stickyItems; },
    set stickyItems(val) { this._data.stickyItems = val; this._notify(); },

    get currentTab() { return this._data.currentTab; },
    set currentTab(val) { this._data.currentTab = val; this._notify(); },

    get showAddMenu() { return this._data.showAddMenu; },
    set showAddMenu(val) { this._data.showAddMenu = val; this._notify(); },

    get selectedStickyId() { return this._data.selectedStickyId; },
    set selectedStickyId(val) { this._data.selectedStickyId = val; this._notify(); },

    subscribe(callback) {
        this._listeners.push(callback);
    },

    _notify() {
        this._listeners.forEach(fn => fn());
    }
};

export async function loadInitialData() {
    try {
        const allItems = await getAllItems();
        state.backgroundItems = allItems.filter(item => item.layer === 'background');
        state.stickyItems = allItems.filter(item => item.layer === 'sticky');
    } catch (err) {
        console.error('Failed to load data', err);
        state.backgroundItems = [];
        state.stickyItems = [];
    }
}
