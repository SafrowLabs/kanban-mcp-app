// (state, action) -> newState. Pure: never mutates input, never reads time or randomness.
// Returning the same state object means "rejected or no-op" (no history entry).

import { LABEL_IDS } from './constants.js';
import { clamp, findColumnOf } from './board.js';

const cleanTitle = t => (typeof t === 'string' ? t.trim() : '');
const sameArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const toIndex = (n, max) => clamp(Math.trunc(n) || 0, 0, max);

export function reducer(state, action) {
  switch (action.type) {
    case 'ADD_CARD': {
      const title = cleanTitle(action.title);
      const col = state.columns[action.columnId];
      if (!title || !col || state.cards[action.id]) return state;
      const card = { id: action.id, title, description: '', labels: [], createdAt: action.now, updatedAt: action.now };
      return {
        ...state,
        cards: { ...state.cards, [card.id]: card },
        columns: { ...state.columns, [col.id]: { ...col, cardIds: [...col.cardIds, card.id] } },
      };
    }
    case 'UPDATE_CARD': {
      const card = state.cards[action.id];
      if (!card) return state;
      const patch = action.patch || {};
      const next = { ...card };
      if ('title' in patch) {
        const title = cleanTitle(patch.title);
        if (title) next.title = title;
      }
      if (typeof patch.description === 'string') next.description = patch.description;
      if (Array.isArray(patch.labels)) next.labels = LABEL_IDS.filter(id => patch.labels.includes(id));
      if (next.title === card.title && next.description === card.description && sameArray(next.labels, card.labels)) {
        return state;
      }
      next.updatedAt = action.now;
      return { ...state, cards: { ...state.cards, [card.id]: next } };
    }
    case 'DELETE_CARD': {
      if (!state.cards[action.id]) return state;
      const colId = findColumnOf(state, action.id);
      const cards = { ...state.cards };
      delete cards[action.id];
      const columns = { ...state.columns };
      if (colId) columns[colId] = { ...columns[colId], cardIds: columns[colId].cardIds.filter(id => id !== action.id) };
      return { ...state, cards, columns };
    }
    case 'MOVE_CARD': {
      const fromId = findColumnOf(state, action.id);
      const to = state.columns[action.toColumnId];
      if (!fromId || !to) return state;
      const from = state.columns[fromId];
      const target = to.cardIds.filter(id => id !== action.id);
      const index = toIndex(action.toIndex, target.length);
      if (fromId === to.id && index === from.cardIds.indexOf(action.id)) return state;
      target.splice(index, 0, action.id);
      const columns = { ...state.columns, [to.id]: { ...to, cardIds: target } };
      if (fromId !== to.id) columns[fromId] = { ...from, cardIds: from.cardIds.filter(id => id !== action.id) };
      return { ...state, columns };
    }
    case 'ADD_COLUMN': {
      const title = cleanTitle(action.title);
      if (!title || state.columns[action.id]) return state;
      return {
        ...state,
        columnOrder: [...state.columnOrder, action.id],
        columns: { ...state.columns, [action.id]: { id: action.id, title, cardIds: [] } },
      };
    }
    case 'UPDATE_COLUMN': {
      const col = state.columns[action.id];
      if (!col) return state;
      const title = cleanTitle((action.patch || {}).title);
      if (!title || title === col.title) return state;
      return { ...state, columns: { ...state.columns, [col.id]: { ...col, title } } };
    }
    case 'DELETE_COLUMN': {
      const col = state.columns[action.id];
      if (!col) return state;
      const columns = { ...state.columns };
      delete columns[col.id];
      const cards = { ...state.cards };
      col.cardIds.forEach(id => { delete cards[id]; });
      return { ...state, columnOrder: state.columnOrder.filter(id => id !== col.id), columns, cards };
    }
    case 'MOVE_COLUMN': {
      const from = state.columnOrder.indexOf(action.id);
      if (from < 0) return state;
      const order = state.columnOrder.filter(id => id !== action.id);
      const index = toIndex(action.toIndex, order.length);
      if (index === from) return state;
      order.splice(index, 0, action.id);
      return { ...state, columnOrder: order };
    }
    case 'REPLACE_STATE':
      return action.state || state;
    default:
      return state;
  }
}
