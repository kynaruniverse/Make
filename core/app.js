import { state, loadInitialData } from './state.js';
import { TopBar } from '../components/TopBar.js';
import { Grid } from '../components/Grid.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { Modal } from '../components/Modal.js';
import { BulkBar } from '../components/BulkBar.js';
import './storage.js'; // initializes DB

// Global app container
const app = document.getElementById('app');

// Initialize UI
async function init() {
    await loadInitialData();

    // Render top bar
    const topBar = TopBar();
    app.appendChild(topBar);

    // Container for bulk bar (dynamic)
    const bulkContainer = document.createElement('div');
    bulkContainer.id = 'bulk-container';
    app.appendChild(bulkContainer);

    // Create main container for grid
    const main = document.createElement('main');
    main.id = 'main-content';
    app.appendChild(main);

    // Render grid
    Grid.render(main);

    // Initialize command palette
    CommandPalette.init();

    // Initialize modal
    Modal.init();

    // Listen for selection mode changes
    state.subscribe(() => {
        const container = document.getElementById('bulk-container');
        if (state.selectionMode) {
            if (!container.querySelector('.bulk-bar')) {
                container.appendChild(BulkBar());
            }
        } else {
            container.innerHTML = ''; // remove bulk bar
        }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Cmd+K or Ctrl+K to open palette
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            CommandPalette.toggle();
        }
        // Escape to close palette or exit selection mode
        if (e.key === 'Escape') {
            if (document.getElementById('command-palette')?.classList.contains('visible')) {
                CommandPalette.hide();
            }
            if (state.selectionMode) {
                state.clearSelection();
            }
        }
    });
}

init();
