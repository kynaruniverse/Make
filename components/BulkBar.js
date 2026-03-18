import { state } from '../core/state.js';
import { deleteWidget } from '../core/storage.js';
import { showUndo } from './UndoToast.js';

export function BulkBar() {
    const bar = document.createElement('div');
    bar.className = 'bulk-bar';
    bar.id = 'bulk-bar';

    const countSpan = document.createElement('span');
    countSpan.id = 'selected-count';
    countSpan.textContent = '0 selected';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
        const ids = Array.from(state.selectedIds);
        if (ids.length === 0) return;
        // Store widgets for potential undo
        const deletedWidgets = ids.map(id => state.widgets.find(w => w.id === id)).filter(Boolean);
        // Delete each
        for (let id of ids) {
            await deleteWidget(id);
        }
        showUndo(`Deleted ${ids.length} item(s)`, async () => {
            // Undo: re-save each
            for (let w of deletedWidgets) {
                await (await import('../core/storage.js')).saveWidget(w);
            }
            state.widgets = await (await import('../core/storage.js')).getAllWidgets();
        });
        state.clearSelection();
        state.widgets = await (await import('../core/storage.js')).getAllWidgets();
    });

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export selected';
    exportBtn.addEventListener('click', () => {
        const selected = state.widgets.filter(w => state.selectedIds.has(w.id));
        const data = JSON.stringify(selected, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `make-selected-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        // Optionally clear selection
        state.clearSelection();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        state.clearSelection();
    });

    bar.appendChild(countSpan);
    bar.appendChild(deleteBtn);
    bar.appendChild(exportBtn);
    bar.appendChild(cancelBtn);

    // Update count when selection changes
    const updateCount = () => {
        countSpan.textContent = `${state.selectedIds.size} selected`;
    };
    state.subscribe(updateCount);

    return bar;
}
