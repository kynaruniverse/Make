/**
 * MAKÉ UTILS — resize.js (V2)
 * Corner resize handle for sticky notes.
 */

const MIN_W = 140;
const MIN_H = 110;

export function makeResizable(element, onResize, onStart, onEnd) {
  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  element.appendChild(handle);

  let startX, startY, startW, startH;
  let isResizing = false;

  const getClient = (e) => e.touches
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
    : { x: e.clientX, y: e.clientY };

  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getClient(e);

    const rect = element.getBoundingClientRect();
    startW = rect.width;
    startH = rect.height;
    startX = x;
    startY = y;

    isResizing = true;
    element.style.transition = 'none';
    element.style.zIndex     = '200';
    if (onStart) onStart();

    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('touchmove', onResizeMove, { passive: false });
    document.addEventListener('mouseup',   onResizeEnd);
    document.addEventListener('touchend',  onResizeEnd);
  };

  const onResizeMove = (e) => {
    if (!isResizing) return;
    e.preventDefault();
    const { x, y } = getClient(e);

    const newW = Math.max(MIN_W, startW + (x - startX));
    const newH = Math.max(MIN_H, startH + (y - startY));

    element.style.width  = `${newW}px`;
    element.style.height = `${newH}px`;

    if (onResize) onResize(newW, newH);
  };

  const onResizeEnd = () => {
    if (!isResizing) return;
    isResizing = false;
    element.style.transition = '';

    const finalW = parseFloat(element.style.width);
    const finalH = parseFloat(element.style.height);
    if (onEnd) onEnd(finalW, finalH);

    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('touchmove', onResizeMove);
    document.removeEventListener('mouseup',   onResizeEnd);
    document.removeEventListener('touchend',  onResizeEnd);
  };

  handle.addEventListener('mousedown',  startResize);
  handle.addEventListener('touchstart', startResize, { passive: false });

  return () => {
    handle.removeEventListener('mousedown',  startResize);
    handle.removeEventListener('touchstart', startResize);
    handle.remove();
  };
}
