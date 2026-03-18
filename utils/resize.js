export function makeResizable(element, onResize, onStart, onEnd) {
    let startX, startY, startWidth, startHeight;
    let isResizing = false;

    const createHandle = () => {
        const handle = document.createElement('div');
        handle.style.position = 'absolute';
        handle.style.bottom = '4px';
        handle.style.right = '4px';
        handle.style.width = '20px';
        handle.style.height = '20px';
        handle.style.cursor = 'nwse-resize';
        handle.style.background = 'rgba(0,0,0,0.2)';
        handle.style.borderRadius = '4px';
        handle.style.zIndex = '1001';
        element.appendChild(handle);
        return handle;
    };

    const handle = createHandle();

    const startResize = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        const rect = element.getBoundingClientRect();
        startWidth = rect.width;
        startHeight = rect.height;
        startX = clientX;
        startY = clientY;
        
        isResizing = true;
        element.style.transition = 'none';
        element.style.zIndex = '1000';
        
        if (onStart) onStart();
        
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('touchmove', onResizeMove, { passive: false });
        document.addEventListener('mouseup', onResizeEnd);
        document.addEventListener('touchend', onResizeEnd);
    };

    const onResizeMove = (e) => {
        if (!isResizing) return;
        e.preventDefault();
        
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        
        const newWidth = Math.max(160, startWidth + deltaX);
        const newHeight = Math.max(120, startHeight + deltaY);
        
        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;
        
        if (onResize) onResize(newWidth, newHeight);
    };

    const onResizeEnd = () => {
        if (!isResizing) return;
        isResizing = false;
        element.style.transition = '';
        element.style.zIndex = '';
        
        const finalWidth = parseFloat(element.style.width);
        const finalHeight = parseFloat(element.style.height);
        
        if (onEnd) onEnd(finalWidth, finalHeight);
        
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('touchmove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
        document.removeEventListener('touchend', onResizeEnd);
    };

    handle.addEventListener('mousedown', startResize);
    handle.addEventListener('touchstart', startResize, { passive: false });
    
    return () => {
        handle.removeEventListener('mousedown', startResize);
        handle.removeEventListener('touchstart', startResize);
        handle.remove();
    };
}
