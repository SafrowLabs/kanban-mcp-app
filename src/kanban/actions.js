// Action creators. This is where ids and timestamps are made, so the reducer stays pure.

export function newId(prefix) {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

const now = () => new Date().toISOString();

export const addCard = (columnId, title) => ({ type: 'ADD_CARD', id: newId('card'), columnId, title, now: now() });
export const updateCard = (id, patch) => ({ type: 'UPDATE_CARD', id, patch, now: now() });
export const deleteCard = id => ({ type: 'DELETE_CARD', id });
export const moveCard = (id, toColumnId, toIndex) => ({ type: 'MOVE_CARD', id, toColumnId, toIndex });

export const addColumn = title => ({ type: 'ADD_COLUMN', id: newId('col'), title });
export const updateColumn = (id, patch) => ({ type: 'UPDATE_COLUMN', id, patch });
export const deleteColumn = id => ({ type: 'DELETE_COLUMN', id });
export const moveColumn = (id, toIndex) => ({ type: 'MOVE_COLUMN', id, toIndex });

export const replaceState = state => ({ type: 'REPLACE_STATE', state });
