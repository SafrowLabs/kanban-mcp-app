// Shared constants and the default board. No DOM, no side effects.

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'kanban:v1';
export const HISTORY_LIMIT = 100;
export const SAVE_DELAY_MS = 300;

// Ids must be safe object keys (rejects "__proto__" and friends).
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const LABELS = Object.freeze([
  { id: 'red', name: 'Red' },
  { id: 'orange', name: 'Orange' },
  { id: 'yellow', name: 'Yellow' },
  { id: 'green', name: 'Green' },
  { id: 'blue', name: 'Blue' },
  { id: 'purple', name: 'Purple' },
]);
export const LABEL_IDS = LABELS.map(l => l.id);
export const labelName = id => (LABELS.find(l => l.id === id) || { name: id }).name;

export function defaultBoard(now) {
  const card = (id, title, labels, description = '') =>
    ({ id, title, description, labels, createdAt: now, updatedAt: now });
  return {
    version: SCHEMA_VERSION,
    board: { title: 'My Board' },
    columnOrder: ['col_todo', 'col_doing', 'col_done'],
    columns: {
      col_todo: { id: 'col_todo', title: 'To Do', cardIds: ['card_1', 'card_2', 'card_3'] },
      col_doing: { id: 'col_doing', title: 'Doing', cardIds: [] },
      col_done: { id: 'col_done', title: 'Done', cardIds: [] },
    },
    cards: {
      card_1: card('card_1', 'Drag me to Doing', ['blue'],
        'Drag with the mouse. On touch screens, press and hold, then drag.'),
      card_2: card('card_2', 'Click the pencil to edit a card', ['green']),
      card_3: card('card_3', 'Move cards with the keyboard', ['purple'],
        'Focus a card, press Space to pick it up, use the arrow keys to move it, Space to drop, Escape to cancel.'),
    },
  };
}
