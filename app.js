import { state, loadInitialData } from './core/state.js';
import { saveItem, deleteItem, updateItemPosition } from './core/storage.js';
import { makeDraggable } from './utils/drag.js';
import { makeResizable } from './utils/resize.js';

const app = document.getElementById('app');

// Store cleanup functions
const dragCleanups = new Map();
const resizeCleanups = new Map();

async function init() {
    await loadInitialData();
    render();
    
    // Subscribe to state changes
    state.subscribe(() => {
        render();
    });
}

function render() {
    app.innerHTML = `
        <div class="top-bar">
            <div class="tab-container">
                ${['notes', 'code', 'links'].map(tab => `
                    <button class="tab ${state.currentTab === tab ? 'active' : ''}" data-tab="${tab}">
                        ${tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                `).join('')}
            </div>
            <div class="top-bar-actions">
                <button id="ambient-toggle" class="${state.ambientEnabled ? 'active' : ''}">✨</button>
                <button id="settings-btn">⚙</button>
            </div>
        </div>
        
        <div class="canvas">
            <!-- Background grid layer -->
            <div class="grid-layer" id="grid-layer">
                <div class="grid" id="grid-container">
                    ${renderBackgroundItems()}
                </div>
            </div>
            
            <!-- Floating sticky layer -->
            <div class="sticky-layer" id="sticky-layer">
                ${renderStickyItems()}
            </div>
        </div>
        
        <!-- Floating action button -->
        <button class="fab" id="fab">+</button>
        
        <!-- Add menu -->
        <div class="add-menu ${state.showAddMenu ? '' : 'hidden'}" id="add-menu">
            <button data-type="note">📝 Add Note</button>
            <button data-type="code"></> Add Code</button>
            <button data-type="link">🔗 Add Link</button>
            <button data-type="sticky">📌 Add Sticky</button>
        </div>
        
        <!-- Settings modal (hidden by default) -->
        <div class="modal-overlay hidden" id="settings-modal">
            <div class="modal">
                <h3>Settings</h3>
                <div class="modal-content">
                    <button id="export-btn">Export Data</button>
                    <button id="import-btn">Import Data</button>
                </div>
                <div class="modal-actions">
                    <button id="close-settings">Close</button>
                </div>
            </div>
        </div>
    `;
    
    attachEventListeners();
    initializeStickyDragAndResize();
}

function renderBackgroundItems() {
    const filtered = state.backgroundItems.filter(item => {
        if (state.currentTab === 'notes') return item.type === 'note';
        if (state.currentTab === 'code') return item.type === 'code';
        if (state.currentTab === 'links') return item.type === 'link';
        return true;
    });
    
    return filtered.map(item => `
        <div class="card" data-id="${item.id}" data-type="${item.type}">
            <div class="card-header">
                <span>${item.type}</span>
                <span>${new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="card-title">${escapeHTML(item.title || 'Untitled')}</div>
            <div class="card-content">${escapeHTML(item.content || item.code || item.url || '')}</div>
        </div>
    `).join('');
}

function renderStickyItems() {
    return state.stickyItems.map(item => `
        <div class="sticky-note" 
             data-id="${item.id}"
             style="left: ${item.position?.x || 100}px; 
                    top: ${item.position?.y || 100}px;
                    width: ${item.position?.width || 200}px;
                    height: ${item.position?.height || 150}px;
                    background-color: ${item.color || '#ffeb96'};">
            <div class="sticky-header">
                <button class="delete-sticky">✕</button>
            </div>
            <textarea placeholder="Write something..." data-id="${item.id}">${escapeHTML(item.text || '')}</textarea>
        </div>
    `).join('');
}

function attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentTab = btn.dataset.tab;
        });
    });
    
    // FAB
    document.getElementById('fab').addEventListener('click', () => {
        state.showAddMenu = !state.showAddMenu;
    });
    
    // Add menu buttons
    document.querySelectorAll('.add-menu button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const type = e.target.dataset.type;
            if (type === 'sticky') {
                await createSticky();
            } else {
                showCreateModal(type);
            }
            state.showAddMenu = false;
        });
    });
    
    // Background card clicks
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', (e) => {
            const id = parseInt(card.dataset.id);
            const item = state.backgroundItems.find(i => i.id === id);
            if (item) showEditModal(item);
        });
    });
    
    // Sticky delete buttons
    document.querySelectorAll('.delete-sticky').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sticky = e.target.closest('.sticky-note');
            const id = parseInt(sticky.dataset.id);
            await deleteItem(id);
            await loadInitialData();
        });
    });
    
    // Sticky textarea changes
    document.querySelectorAll('.sticky-note textarea').forEach(textarea => {
        textarea.addEventListener('input', async (e) => {
            const id = parseInt(textarea.dataset.id);
            const item = state.stickyItems.find(i => i.id === id);
            if (item) {
                item.text = textarea.value;
                await saveItem(item);
            }
        });
    });
    
    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.remove('hidden');
    });
    
    // Close settings
    document.getElementById('close-settings')?.addEventListener('click', () => {
        document.getElementById('settings-modal').classList.add('hidden');
    });
    
    // Export
    document.getElementById('export-btn')?.addEventListener('click', exportData);
    
    // Import
    document.getElementById('import-btn')?.addEventListener('click', importData);
}

function initializeStickyDragAndResize() {
    // Clean up old handlers
    dragCleanups.forEach(cleanup => cleanup());
    resizeCleanups.forEach(cleanup => cleanup());
    dragCleanups.clear();
    resizeCleanups.clear();
    
    // Set up new handlers
    document.querySelectorAll('.sticky-note').forEach(sticky => {
        const id = parseInt(sticky.dataset.id);
        
        // Drag
        const dragCleanup = makeDraggable(
            sticky,
            (left, top) => {
                // Live update not saved until drag end
            },
            () => {
                // Drag start
            },
            async (left, top) => {
                // Drag end - save position
                await updateItemPosition(id, {
                    x: left,
                    y: top,
                    width: parseFloat(sticky.style.width),
                    height: parseFloat(sticky.style.height)
                });
            }
        );
        dragCleanups.set(id, dragCleanup);
        
        // Resize
        const resizeCleanup = makeResizable(
            sticky,
            (width, height) => {
                // Live resize
            },
            () => {},
            async (width, height) => {
                // Resize end - save dimensions
                await updateItemPosition(id, {
                    x: parseFloat(sticky.style.left),
                    y: parseFloat(sticky.style.top),
                    width,
                    height
                });
            }
        );
        resizeCleanups.set(`resize-${id}`, resizeCleanup);
    });
}

async function createSticky() {
    const newSticky = {
        layer: 'sticky',
        type: 'sticky',
        text: 'New sticky note',
        color: '#ffeb96',
        position: {
            x: 100 + Math.random() * 50,
            y: 100 + Math.random() * 50,
            width: 200,
            height: 150
        },
        createdAt: Date.now()
    };
    await saveItem(newSticky);
    await loadInitialData();
}

function showCreateModal(type) {
    const modalHtml = `
        <div class="modal-overlay" id="create-modal">
            <div class="modal">
                <h3>New ${type}</h3>
                <div class="modal-content">
                    <input id="modal-title" placeholder="Title">
                    ${type === 'code' ? 
                        '<textarea id="modal-code" placeholder="Code"></textarea><select id="modal-lang"><option>javascript</option><option>python</option></select>' :
                        type === 'link' ?
                        '<input id="modal-url" placeholder="URL">' :
                        '<textarea id="modal-content" placeholder="Content"></textarea>'
                    }
                </div>
                <div class="modal-actions">
                    <button id="modal-cancel">Cancel</button>
                    <button id="modal-save" class="primary">Save</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('modal-cancel').addEventListener('click', () => {
        document.getElementById('create-modal').remove();
    });
    
    document.getElementById('modal-save').addEventListener('click', async () => {
        const title = document.getElementById('modal-title')?.value;
        const content = document.getElementById('modal-content')?.value ||
                       document.getElementById('modal-code')?.value ||
                       document.getElementById('modal-url')?.value;
        
        if (title || content) {
            const newItem = {
                layer: 'background',
                type,
                title,
                content,
                code: document.getElementById('modal-code')?.value,
                language: document.getElementById('modal-lang')?.value,
                url: document.getElementById('modal-url')?.value,
                createdAt: Date.now()
            };
            await saveItem(newItem);
            await loadInitialData();
        }
        
        document.getElementById('create-modal').remove();
    });
}

function showEditModal(item) {
    // Similar to create but with pre-filled values
    // For brevity, we'll implement this later if needed
}

function exportData() {
    const data = JSON.stringify([...state.backgroundItems, ...state.stickyItems], null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `make-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const items = JSON.parse(ev.target.result);
                for (const item of items) {
                    delete item.id;
                    await saveItem(item);
                }
                await loadInitialData();
                document.getElementById('settings-modal').classList.add('hidden');
            } catch (err) {
                alert('Invalid backup file');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Start the app
init();
