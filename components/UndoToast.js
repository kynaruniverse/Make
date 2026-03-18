let toastTimeout;

export function showUndo(message, onUndo) {
    const existing = document.querySelector('.undo-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `
        <span>${message}</span>
        <button id="undo-btn">Undo</button>
    `;
    document.body.appendChild(toast);

    document.getElementById('undo-btn').addEventListener('click', () => {
        onUndo();
        toast.remove();
        if (toastTimeout) clearTimeout(toastTimeout);
    });

    toastTimeout = setTimeout(() => {
        toast.remove();
    }, 5000);
}
