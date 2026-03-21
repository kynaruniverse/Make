/**
 * MAKÉ FEATURES — sort-menu.js (V1)
 * Floating sort popup anchored near the burger button.
 */

import { state } from '../core/state.js';

export function showSortMenuAt(left, top) {
  document.getElementById('sort-menu')?.remove();
  
  const menu = document.createElement('div');
  menu.id = 'sort-menu';
  menu.className = 'sort-menu-popup';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Sort options');
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(8, left)}px`;
  
  const fields = [
    { field: 'updatedAt', label: 'Date modified' },
    { field: 'createdAt', label: 'Date created' },
    { field: 'title', label: 'Title (A–Z)' },
  ];
  
  menu.innerHTML = `
    <div class="sort-menu-section-label">Sort by</div>
    ${fields.map(f => `
      <button class="sort-menu-item ${state.sortField === f.field ? 'active' : ''}"
              data-sort="${f.field}" role="menuitem">
        <span>${f.label}</span>
        ${state.sortField === f.field
          ? `<span class="sort-dir-indicator">${state.sortDir === 'desc' ? '↓' : '↑'}</span>`
          : ''}
      </button>`).join('')}`;
  
  document.body.appendChild(menu);
  
  const dismiss = e => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', dismiss);
    }
  };
  // Defer so the click that opened this menu doesn't immediately dismiss it.
  setTimeout(() => document.addEventListener('click', dismiss), 50);
  
  const _onKey = e => {
    if (e.key === 'Escape') { menu.remove();
      document.removeEventListener('keydown', _onKey); }
  };
  document.addEventListener('keydown', _onKey);
  
  menu.querySelectorAll('.sort-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.sort;
      if (f === state.sortField) {
        state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        state.sortField = f;
        state.sortDir = 'desc';
      }
      menu.remove();
    });
  });
}