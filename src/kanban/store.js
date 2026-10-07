// Single source of truth: state + undo/redo history + subscribers.
// Because the reducer never mutates, history is just a list of old state references.

import { HISTORY_LIMIT } from './constants.js';

export function createStore(reducer, initial, { historyLimit = HISTORY_LIMIT } = {}) {
  let state = initial;
  const past = [];
  const future = [];
  const subs = new Set();
  const emit = () => subs.forEach(fn => fn(state));

  return {
    getState: () => state,
    subscribe: fn => (subs.add(fn), () => subs.delete(fn)),
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    // Returns true if the action changed state.
    dispatch(action) {
      const next = reducer(state, action);
      if (next === state) return false; // rejected or no-op: no history entry
      past.push(state);
      if (past.length > historyLimit) past.shift();
      future.length = 0;
      state = next;
      emit();
      return true;
    },
    undo() {
      if (!past.length) return false;
      future.push(state);
      state = past.pop();
      emit();
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(state);
      state = future.pop();
      emit();
      return true;
    },
  };
}
