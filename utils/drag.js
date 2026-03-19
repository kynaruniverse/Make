/**
 * MAKÉ UTILS — drag.js (V2)
 * Touch + mouse drag for sticky notes.
 * V2 fix: positions relative to parent container, not viewport.
 */

export function makeDraggable(element, onDrag, onStart, onEnd) {
  let startX, startY, startLeft, startTop;
  let isDragging = false;

  const getClient = (e) => e.touches
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
    : { x: e.clientX, y: e.clientY };

  const startDrag = (e) => {
    // Don't drag if the target is a textarea, button, or resize handle
    if (e.target.tagName === 'TEXTAREA'  ||
        e.target.tagName === 'BUTTON'    ||
        e.target.classList.contains('resize-handle')) return;

    e.preventDefault();
    const { x, y } = getClient(e);

    startLeft = parseFloat(element.style.left) || 0;
    startTop  = parseFloat(element.style.top)  || 0;
    startX    = x;
    startY    = y;

    isDragging = true;
    element.style.transition = 'none';
    element.style.zIndex     = '200';
    element.classList.add('dragging');

    if (onStart) onStart();

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup',   onDragEnd);
    document.addEventListener('touchend',  onDragEnd);
  };

  const onMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const { x, y } = getClient(e);

    const newLeft = startLeft + (x - startX);
    const newTop  = startTop  + (y - startY);

    element.style.left = `${newLeft}px`;
    element.style.top  = `${newTop}px`;

    if (onDrag) onDrag(newLeft, newTop);
  };

  const onDragEnd = () => {
    if (!isDragging) return;
    isDragging = false;

    element.style.transition = '';
    element.classList.remove('dragging');
    // Don't reset zIndex here — let CSS handle normal stack

    const finalLeft = parseFloat(element.style.left);
    const finalTop  = parseFloat(element.style.top);
    if (onEnd) onEnd(finalLeft, finalTop);

    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup',   onDragEnd);
    document.removeEventListener('touchend',  onDragEnd);
  };

  element.addEventListener('mousedown',  startDrag);
  element.addEventListener('touchstart', startDrag, { passive: false });

  return () => {
    element.removeEventListener('mousedown',  startDrag);
    element.removeEventListener('touchstart', startDrag);
  };
}
