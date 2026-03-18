import { state, loadInitialData } from './state.js';
import { TopBar } from '../components/TopBar.js';
import { Grid } from '../components/Grid.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { Modal } from '../components/Modal.js';
import './storage.js'; // initializes DB

// Global app container
const app = document.getElementById('app');

// Initialize UI
async function init() {
    await loadInitialData();

    // Render top bar
    const topBar = TopBar();
    app.appendChild(topBar);

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

    // Listen for state changes
    state.subscribe(() => {
        Grid.refresh();
    });
}

init();
