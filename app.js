import { state, loadInitialData } from './core/state.js';
import { saveItem, deleteItem, updateItemPosition } from './core/storage.js';
import { makeDraggable } from './utils/drag.js';
import { makeResizable } from './utils/resize.js';

const app = document.getElementById('app');
const dragCleanups = new Map();
const resizeCleanups = new Map();

// Show loading
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
            <div class="grid-layer" id="grid-layer">
                <div class="grid" id="grid-container">
                    ${renderBackgroundItems()}
                </div>
            </div>
            
            <div class="sticky-layer" id="sticky-layer">
                ${renderStickyItems()}
            </div>
        </div>
        
        <button class="fab" id="fab">+</button>
        
        <div class="add-menu ${state.showAddMenu ? '' : 'hidden'}" id="add-menu">
            <button data-type="note">📝 Add Note</button>
            <button data-type="code"></> Add Code</button>
            <button data-type="link">🔗 Add Link</button>
            <button data-type="sticky">📌 Add Sticky</button>
        </div>
        
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
                <p class="empty-hint">Click + to add a ${state.currentTab === 'notes' ? 'note' : state.currentTab === 'code' ? 'code snippet' : 'link'}</p>
            </div>
        `;
    }
}

function attachEventListeners() {
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentTab = btn.dataset.tab;
        });
    });
    
    document.getElementById('fab').addEventListener('click', () => {
        state.showAddMenu = !state.showAddMenu;
    });
    
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
    
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', (e) => {
            const id = parseInt(card.dataset.id);
            const item = state.backgroundItems.find(i => i.id === id);
            if (item) showEditModal(item);
        });
    });
    
    document.querySelectorAll('.delete-sticky').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sticky = e.target.closest('.sticky-note');
            const id = parseInt(sticky.dataset.id);
            await deleteItem(id);
            await loadInitialData();
        });
    });
    
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
    const ambientBtn = document.getElementById('ambient-toggle');
    if (!ambientBtn) return;
    
    ambientBtn.addEventListener('click', () => {
        state.ambientEnabled = !state.ambientEnabled;
        ambientBtn.classList.toggle('active', state.ambientEnabled);
        
        if (state.ambientEnabled) {
            startAmbientSorting();
        } else {
            clearInterval(ambientInterval);
        }
    });
    
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
        sorted.sort((a, b) => {
            if (a.type === 'note' && b.type !== 'note') return -1;
            if (b.type === 'note' && a.type !== 'note') return 1;
            return 0;
        });
    } else if (hour >= 12 && hour < 18) {
        sorted.sort((a, b) => {
            if (a.type === 'link' && b.type !== 'link') return -1;
            if (b.type === 'link' && a.type !== 'link') return 1;
            return 0;
        });
    } else {
        sorted.sort((a, b) => {
            if (a.type === 'code' && b.type !== 'code') return -1;
            if (b.type === 'code' && a.type !== 'code') return 1;
            return 0;
        });
    }
    
    state.backgroundItems = sorted;
}

function showStickyModal() {
    const colors = ['#ffeb96', '#ffb5a0', '#a0d6ff', '#c0e0a0', '#e0c0ff'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const modalHtml = `
        <div class="modal-overlay" id="sticky-modal">
            <div class="modal">
                <h3>New Sticky Note</h3>
                <div class="modal-content">
                    <textarea id="sticky-text" placeholder="Write something..." rows="4"></textarea>
                    <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                        ${colors.map(color => `
                            <div style="width: 40px; height: 40px; border-radius: 20px; background: ${color}; cursor: pointer; border: 2px solid ${color === randomColor ? 'white' : 'transparent'};" 
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
            document.querySelectorAll('.color-option').forEach(opt => 
                opt.style.border = '2px solid transparent');
            option.style.border = '2px solid white';
            selectedColor = option.dataset.color;
        });
    });
    
    document.getElementById('sticky-cancel').addEventListener('click', () => {
        document.getElementById('sticky-modal').remove();
    });
    
    document.getElementById('sticky-save').addEventListener('click', async () => {
        const text = document.getElementById('sticky-text')?.value || 'New sticky note';
        
        const newSticky = {
            layer: 'sticky',
            type: 'sticky',
            text: text,
            color: selectedColor,
            position: {
                x: 100 + Math.random() * 100,
                y: 100 + Math.random() * 100,
                width: 220,
                height: 160
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
                <div class="modal-content">
                    ${contentHtml}
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
        const newItem = {
            layer: 'background',
            type,
            createdAt: Date.now()
        };
        
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
                <div class="modal-content">
                    ${contentHtml}
                </div>
                <div class="modal-actions">
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

// Start
init();
