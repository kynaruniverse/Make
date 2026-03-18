import { state } from '../core/state.js';
import { CommandPalette } from './CommandPalette.js';
import { showSettings } from './Modal.js';

export function TopBar() {
    const bar = document.createElement('div');
    bar.className = 'top-bar';

    // Tabs
    const tabContainer = document.createElement('div');
    tabContainer.className = 'tab-container';
    const tabs = ['notes', 'code', 'links', 'sticky'];
    tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `tab ${state.currentTab === tab ? 'active' : ''}`;
        btn.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
        btn.addEventListener('click', () => {
            state.currentTab = tab;
        });
        tabContainer.appendChild(btn);
    });
    bar.appendChild(tabContainer);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'top-bar-actions';

    // Ambient toggle
    const ambientBtn = document.createElement('button');
    ambientBtn.innerHTML = '✨';
    ambientBtn.title = 'Ambient intelligence';
    ambientBtn.classList.toggle('active', state.ambientEnabled);
    ambientBtn.addEventListener('click', () => {
        state.ambientEnabled = !state.ambientEnabled;
        ambientBtn.classList.toggle('active', state.ambientEnabled);
    });
    actions.appendChild(ambientBtn);

    // Settings (opens modal)
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = '⚙';
    settingsBtn.addEventListener('click', () => showSettings());
    actions.appendChild(settingsBtn);

    // Command palette button
    const cmdBtn = document.createElement('button');
    cmdBtn.innerHTML = '⌘';
    cmdBtn.addEventListener('click', () => CommandPalette.toggle());
    actions.appendChild(cmdBtn);

    bar.appendChild(actions);
    return bar;
}
