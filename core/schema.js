/**
 * MAKÉ CORE — schema.js (V2)
 * Canonical item schema. Merges original storage shape with
 * Samsung Notes derived fields (isFavorited, tags, checkpoint).
 */

export const ItemType = {
  NOTE:   'note',
  CODE:   'code',
  LINK:   'link',
  STICKY: 'sticky',
};

export const ItemLayer = {
  BACKGROUND: 'background',
  STICKY:     'sticky',
};

/** Full field reference for a Maké item. */
export const ItemSchema = {
  id:          null,
  layer:       'background',
  type:        'note',
  title:       '',
  content:     '',
  code:        '',
  language:    'javascript',
  url:         '',
  text:        '',
  color:       null,
  rotation:    0,
  position:    null,
  isFavorited: false,
  tags:        [],
  folderId:    null,   // null = no folder (top-level)
  checkpoint:  0,
  createdAt:   0,
  updatedAt:   0,
};

/**
 * createItem(partial)
 * Creates a new fully-initialised item, merging defaults with partial.
 */
export function createItem(partial = {}) {
  const now = Date.now();
  return { ...ItemSchema, createdAt: now, updatedAt: now, ...partial };
}

/**
 * extendItem(item)
 * Non-destructively upgrades an existing item that may be missing newer fields.
 * Safe to call on old items from IndexedDB.
 */
export function extendItem(item) {
  return {
    isFavorited: false,
    tags:        [],
    checkpoint:  0,
    language:    'javascript',
    rotation:    0,
    folderId:    null,
    ...item,
  };
}

/**
 * nextCheckpoint(item) — monotonic version counter.
 */
export function nextCheckpoint(item) {
  return (item.checkpoint || 0) + 1;
}
