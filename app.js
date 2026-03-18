import { state, loadInitialData } from './core/state.js';
import { saveItem, deleteItem, updateItemPosition } from './core/storage.js';
import { makeDraggable } from './utils/drag.js';
import { makeResizable } from './utils/resize.js';

const app = document.getElementById('app');
const dragCleanups = new Map();
const resizeCleanups = new Map();

const loadingEl = document.createElement('div');
loadingEl.className = 'loading';
loadingEl.textContent = 'Loading Maké...';
app.appendChild(loadingEl);

let ambientInterval;

async function init() {
    await loadInitialData();
    loadingEl.remove();
    render();
    state.subscribe(() => render());
    initAmbientIntelligence();
}

function render() {
    app.innerHTML = `
        <div class="app-header">
            <div class="header-row">
                <div class="header-widget">
                    <div class="header-widget-bar" style="width:65%"></div>
                    <div class="header-widget-bar" style="width:80%"></div>
                    <div class="header-widget-bar" style="width:50%"></div>
                </div>
                <div class="ambient-toggle-wrap">
                    <div class="toggle-track ${state.ambientEnabled ? 'on' : ''}" id="ambient-toggle">
                        <div class="toggle-knob"></div>
                    </div>
                </div>
            </div>
            <div class="app-title">Maké</div>
            <div class="app-subtitle">Your personal command center</div>
        </div>

        <div class="section-divider">
            <div class="divider-line"></div>
            <div class="divider-line" style="width:70px"></div>
            <div class="divider-line" style="width:50px"></div>
        </div>

        <div class="canvas">
            <div class="grid-layer" id="grid-layer">
                <div class="grid" id="grid-container">
                    ${renderBackgroundItems()}
                </div>
            </div>
            <div class="sticky-layer" id="sticky-layer">
                ${renderStickyItems()}
            </div>
        </div>

        <div class="add-menu ${state.showAddMenu ? '' : 'hidden'}" id="add-menu">
            <button data-type="note">📝 Add Note</button>
            <button data-type="code"></> Add Code</button>
            <button data-type="link">🔗 Add Link</button>
            <button data-type="sticky">📌 Add Sticky</button>
        </div>

        <nav class="bottom-nav">
            <button class="nav-btn ${state.currentTab === 'links' ? 'active' : ''}" data-tab="links" title="Links">
                <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            </button>
            <button class="nav-btn ${state.currentTab === 'notes' ? 'active' : ''}" data-tab="notes" title="Notes">
                <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            </button>
            <button class="nav-btn-add" id="fab" title="Add">
                <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="nav-btn ${state.currentTab === 'code' ? 'active' : ''}" data-tab="code" title="Code">
                <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </button>
            <button class="nav-btn" id="settings-btn" title="Settings">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            </button>
        </nav>

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
    checkEmptyState();
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
                <span class="card-type-label">${item.type === 'note' ? 'Note' : item.type === 'code' ? 'Code' : 'Link'}: ${escapeHTML(item.title || 'Untitled')}</span>
            </div>
            <div class="card-content">${escapeHTML(item.content || item.code || item.url || '')}</div>
        </div>
    `).join('');
}

function renderStickyItems() {
    return state.stickyItems.map(item => `
        <div class="sticky-note"
             data-id="${item.id}"
             style="left:${item.position?.x || 100}px;
                    top:${item.position?.y || 100}px;
                    width:${item.position?.width || 160}px;
                    height:${item.position?.height || 130}px;
                    background-color:${item.color || '#ffeb96'};
                    transform: rotate(${item.rotation || 0}deg);">
            <div class="sticky-header">
                <button class="delete-sticky">✕</button>
            </div>
            <textarea placeholder="Write something..." data-id="${item.id}">${escapeHTML(item.text || '')}</textarea>
        </div>
    `).join('');
}

function checkEmptyState() {
    const gridContainer = document.getElementById('grid-container');
    if (!gridContainer) return;

    const filtered = state.backgroundItems.filter(item => {
        if (state.currentTab === 'notes') return item.type === 'note';
        if (state.currentTab === 'code') return item.type === 'code';
        if (state.currentTab === 'links') return item.type === 'link';
        return false;
    });

    if (filtered.length === 0) {
        gridContainer.innerHTML = `
            <div class="empty-state">
                <p>No ${state.currentTab} yet</p>
                <p class="empty-hint">Tap + to add a ${state.currentTab === 'notes' ? 'note' : state.currentTab === 'code' ? 'code snippet' : 'link'}</p>
            </div>
        `;
    }
}

function attachEventListeners() {
    // Tab buttons in bottom nav
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentTab = btn.dataset.tab;
        });
    });

    // FAB / add button
    document.getElementById('fab').addEventListener('click', () => {
        state.showAddMenu = !state.showAddMenu;
    });

    // Add menu items
    document.querySelectorAll('.add-menu button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const type = e.target.dataset.type;
            if (type === 'sticky') {
                showStickyModal();
            } else {
                showCreateModal(type);
            }
            state.showAddMenu = false;
        });
    });

    // Card click to edit
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', (e) => {
            const id = parseInt(card.dataset.id);
            const item = state.backgroundItems.find(i => i.id === id);
            if (item) showEditModal(item);
        });
    });

    // Delete sticky
    document.querySelectorAll('.delete-sticky').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sticky = e.target.closest('.sticky-note');
            const id = parseInt(sticky.dataset.id);
            await deleteItem(id);
            await loadInitialData();
        });
    });

    // Sticky textarea autosave
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

    // Ambient toggle
    document.getElementById('ambient-toggle')?.addEventListener('click', () => {
        state.ambientEnabled = !state.ambientEnabled;
        if (state.ambientEnabled) {
            startAmbientSorting();
        } else {
            clearInterval(ambientInterval);
        }
    });

    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.remove('hidden');
    });

    document.getElementById('close-settings')?.addEventListener('click', () => {
        document.getElementById('settings-modal').classList.add('hidden');
    });

    document.getElementById('export-btn')?.addEventListener('click', exportData);
    document.getElementById('import-btn')?.addEventListener('click', importData);
}

function initializeStickyDragAndResize() {
    dragCleanups.forEach(cleanup => cleanup());
    resizeCleanups.forEach(cleanup => cleanup());
    dragCleanups.clear();
    resizeCleanups.clear();

    document.querySelectorAll('.sticky-note').forEach(sticky => {
        const id = parseInt(sticky.dataset.id);

        const dragCleanup = makeDraggable(
            sticky,
            null,
            null,
            async (left, top) => {
                await updateItemPosition(id, {
                    x: left,
                    y: top,
                    width: parseFloat(sticky.style.width),
                    height: parseFloat(sticky.style.height)
                });
            }
        );
        dragCleanups.set(id, dragCleanup);

        const resizeCleanup = makeResizable(
            sticky,
            null,
            null,
            async (width, height) => {
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

function initAmbientIntelligence() {
    if (state.ambientEnabled) {
        startAmbientSorting();
    }
}

function startAmbientSorting() {
    sortBackgroundByTime();
    ambientInterval = setInterval(sortBackgroundByTime, 3600000);
}

function sortBackgroundByTime() {
    const hour = new Date().getHours();
    let sorted = [...state.backgroundItems];

    if (hour >= 5 && hour < 12) {
        sorted.sort((a, b) => (a.type === 'note' && b.type !== 'note') ? -1 : 1);
    } else if (hour >= 12 && hour < 18) {
        sorted.sort((a, b) => (a.type === 'link' && b.type !== 'link') ? -1 : 1);
    } else {
        sorted.sort((a, b) => (a.type === 'code' && b.type !== 'code') ? -1 : 1);
    }

    state.backgroundItems = sorted;
}

function showStickyModal() {
    const colors = ['#ffeb96', '#ffb5b5', '#b5e5b5', '#b5d4ff', '#f5c8d8'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const modalHtml = `
        <div class="modal-overlay" id="sticky-modal">
            <div class="modal">
                <h3>New Sticky Note</h3>
                <div class="modal-content">
                    <textarea id="sticky-text" placeholder="Write something..." rows="4"></textarea>
                    <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">
                        ${colors.map(color => `
                            <div style="width:36px;height:36px;border-radius:50%;background:${color};cursor:pointer;border:2px solid ${color === randomColor ? '#fff' : 'transparent'};"
                                 class="color-option" data-color="${color}"></div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-actions">
                    <button id="sticky-cancel">Cancel</button>
                    <button id="sticky-save" class="primary">Save</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    let selectedColor = randomColor;

    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(opt => opt.style.border = '2px solid transparent');
            option.style.border = '2px solid white';
            selectedColor = option.dataset.color;
        });
    });

    document.getElementById('sticky-cancel').addEventListener('click', () => {
        document.getElementById('sticky-modal').remove();
    });

    document.getElementById('sticky-save').addEventListener('click', async () => {
        const text = document.getElementById('sticky-text')?.value || '';
        const rotation = (Math.random() * 10 - 5).toFixed(1); // slight random tilt

        const newSticky = {
            layer: 'sticky',
            type: 'sticky',
            text,
            color: selectedColor,
            rotation: parseFloat(rotation),
            position: {
                x: 60 + Math.random() * 120,
                y: 40 + Math.random() * 100,
                width: 160,
                height: 130
            },
            createdAt: Date.now()
        };

        await saveItem(newSticky);
        await loadInitialData();
        document.getElementById('sticky-modal').remove();
    });
}

function showCreateModal(type) {
    let contentHtml = '';

    if (type === 'note') {
        contentHtml = `
            <input id="modal-title" placeholder="Title">
            <textarea id="modal-content" placeholder="Content" rows="6"></textarea>
        `;
    } else if (type === 'code') {
        contentHtml = `
            <input id="modal-title" placeholder="Title">
            <textarea id="modal-code" placeholder="Code" rows="8"></textarea>
            <select id="modal-lang">
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
            </select>
        `;
    } else if (type === 'link') {
        contentHtml = `
            <input id="modal-url" placeholder="URL (https://...)">
            <input id="modal-title" placeholder="Title (optional)">
        `;
    }

    const modalHtml = `
        <div class="modal-overlay" id="create-modal">
            <div class="modal">
                <h3>New ${type}</h3>
                <div class="modal-content">${contentHtml}</div>
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
        const newItem = { layer: 'background', type, createdAt: Date.now() };

        if (type === 'note') {
            newItem.title = document.getElementById('modal-title')?.value || '';
            newItem.content = document.getElementById('modal-content')?.value || '';
        } else if (type === 'code') {
            newItem.title = document.getElementById('modal-title')?.value || '';
            newItem.code = document.getElementById('modal-code')?.value || '';
            newItem.language = document.getElementById('modal-lang')?.value || 'javascript';
        } else if (type === 'link') {
            newItem.url = document.getElementById('modal-url')?.value || '';
            newItem.title = document.getElementById('modal-title')?.value || '';
        }

        if (newItem.title || newItem.content || newItem.code || newItem.url) {
            await saveItem(newItem);
            await loadInitialData();
        }

        document.getElementById('create-modal').remove();
    });
}

function showEditModal(item) {
    let contentHtml = '';

    if (item.type === 'note') {
        contentHtml = `
            <input id="edit-title" value="${escapeHTML(item.title || '')}" placeholder="Title">
            <textarea id="edit-content" placeholder="Content" rows="6">${escapeHTML(item.content || '')}</textarea>
        `;
    } else if (item.type === 'code') {
        contentHtml = `
            <input id="edit-title" value="${escapeHTML(item.title || '')}" placeholder="Title">
            <textarea id="edit-code" placeholder="Code" rows="8">${escapeHTML(item.code || '')}</textarea>
            <select id="edit-lang">
                <option ${item.language === 'javascript' ? 'selected' : ''} value="javascript">JavaScript</option>
                <option ${item.language === 'python' ? 'selected' : ''} value="python">Python</option>
                <option ${item.language === 'html' ? 'selected' : ''} value="html">HTML</option>
                <option ${item.language === 'css' ? 'selected' : ''} value="css">CSS</option>
            </select>
        `;
    } else if (item.type === 'link') {
        contentHtml = `
            <input id="edit-url" value="${escapeHTML(item.url || '')}" placeholder="URL">
            <input id="edit-title" value="${escapeHTML(item.title || '')}" placeholder="Title (optional)">
        `;
    }

    const modalHtml = `
        <div class="modal-overlay" id="edit-modal">
            <div class="modal">
                <h3>Edit ${item.type}</h3>
                <div class="modal-content">${contentHtml}</div>
                <div class="modal-actions">
                    <button id="edit-delete" style="margin-right:auto;color:#c9788a;background:none;border-color:rgba(201,120,138,0.3)">Delete</button>
                    <button id="edit-cancel">Cancel</button>
                    <button id="edit-save" class="primary">Save</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('edit-cancel').addEventListener('click', () => {
        document.getElementById('edit-modal').remove();
    });

    document.getElementById('edit-delete').addEventListener('click', async () => {
        await deleteItem(item.id);
        await loadInitialData();
        document.getElementById('edit-modal').remove();
    });

    document.getElementById('edit-save').addEventListener('click', async () => {
        if (item.type === 'note') {
            item.title = document.getElementById('edit-title')?.value || '';
            item.content = document.getElementById('edit-content')?.value || '';
        } else if (item.type === 'code') {
            item.title = document.getElementById('edit-title')?.value || '';
            item.code = document.getElementById('edit-code')?.value || '';
            item.language = document.getElementById('edit-lang')?.value || 'javascript';
        } else if (item.type === 'link') {
            item.url = document.getElementById('edit-url')?.value || '';
            item.title = document.getElementById('edit-title')?.value || '';
        }

        await saveItem(item);
        await loadInitialData();
        document.getElementById('edit-modal').remove();
    });
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

init();
