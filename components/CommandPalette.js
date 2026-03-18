import { parseCommand } from '../core/commandParser.js';

let palette, input, results;

export const CommandPalette = {
    init() {
        palette = document.createElement('div');
        palette.className = 'command-palette';
        palette.id = 'command-palette';
        palette.innerHTML = `
            <input type="text" id="command-input" placeholder="Type a command...">
            <div id="command-results" class="command-results"></div>
        `;
        document.body.appendChild(palette);

        input = document.getElementById('command-input');
        results = document.getElementById('command-results');

        input.addEventListener('input', () => this.handleInput());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
            if (e.key === 'Enter') this.execute();
        });

        // Hide on click outside
        document.addEventListener('click', (e) => {
            if (!palette.contains(e.target) && e.target.id !== 'cmd-button') {
                this.hide();
            }
        });
    },

    toggle() {
        if (palette.classList.contains('visible')) {
            this.hide();
        } else {
            this.show();
        }
    },

    show() {
        palette.classList.add('visible');
        input.focus();
        input.value = '';
        results.innerHTML = '';
    },

    hide() {
        palette.classList.remove('visible');
    },

    handleInput() {
        const text = input.value.trim();
        if (!text) {
            results.innerHTML = '';
            return;
        }
        // Show suggestions (could be dynamic)
        const suggestions = [];
        if (text.startsWith('note ')) {
            suggestions.push(`Create note: "${text.slice(5)}"`);
        } else if (text.startsWith('code ')) {
            suggestions.push(`Create code: "${text.slice(5)}"`);
        } else if (text.startsWith('link ')) {
            suggestions.push(`Create link: "${text.slice(5)}"`);
        } else if (text.startsWith('sticky ')) {
            suggestions.push(`Create sticky: "${text.slice(7)}"`);
        } else {
            // Search suggestions
            import('../core/state.js').then(({ state }) => {
                state.widgets.forEach(w => {
                    if (w.title && w.title.toLowerCase().includes(text.toLowerCase())) {
                        suggestions.push(`📄 ${w.title} (${w.type})`);
                    }
                });
                this.displayResults(suggestions);
            });
            return;
        }
        this.displayResults(suggestions);
    },

    displayResults(items) {
        results.innerHTML = items.map(item => `<div class="command-result-item">${item}</div>`).join('');
        Array.from(results.children).forEach((el, i) => {
            el.addEventListener('click', () => {
                input.value = items[i];
                this.execute();
            });
        });
    },

    execute() {
        parseCommand(input.value);
        this.hide();
    },

    showSearchResults(resultsArray) {
        // Display search results in palette
        this.show();
        results.innerHTML = resultsArray.map(w => `<div class="command-result-item">📄 ${w.title || w.content?.substring(0,30)} (${w.type})</div>`).join('');
    }
};
