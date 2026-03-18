export function makeDraggable(element, onDrag, onStart, onEnd) {
    let startX, startY, startLeft, startTop;
    let isDragging = false;

    const startDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        const rect = element.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        startX = clientX;
        startY = clientY;
        
        isDragging = true;
        element.style.transition = 'none';
        element.style.zIndex = '1000';
        
        if (onStart) onStart();
        
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchend', onDragEnd);
    };

    const onDragMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        
        const newLeft = startLeft + deltaX;
        const newTop = startTop + deltaY;
        
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
        
        if (onDrag) onDrag(newLeft, newTop);
    };

    const onDragEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        element.style.transition = '';
        element.style.zIndex = '';
        
        const finalLeft = parseFloat(element.style.left);
        const finalTop = parseFloat(element.style.top);
        
        if (onEnd) onEnd(finalLeft, finalTop);
        
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchend', onDragEnd);
    };

    element.addEventListener('mousedown', startDrag);
    element.addEventListener('touchstart', startDrag, { passive: false });
    
    return () => {
        element.removeEventListener('mousedown', startDrag);
        element.removeEventListener('touchstart', startDrag);
    };
}
