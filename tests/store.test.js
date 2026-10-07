import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/kanban/store.js';
import { reducer } from '../src/kanban/reducer.js';
import { frozenBoard } from './helpers.js';

const s0 = frozenBoard();

test('no-op dispatch returns false and adds no history', () => {
  const store = createStore(reducer, s0);
  let calls = 0;
  store.subscribe(() => calls++);
  assert.equal(store.dispatch({ type: 'MOVE_CARD', id: 'card_2', toColumnId: 'col_todo', toIndex: 1 }), false);
  assert.equal(store.canUndo(), false);
  assert.equal(calls, 0);
});

test('undo / redo restore exact state references', () => {
  const store = createStore(reducer, s0);
  assert.equal(store.dispatch({ type: 'DELETE_CARD', id: 'card_1' }), true);
  const s1 = store.getState();
  assert.equal(store.undo(), true);
  assert.equal(store.getState(), s0);
  assert.equal(store.redo(), true);
  assert.equal(store.getState(), s1);
  assert.equal(store.redo(), false);
});

test('new action clears redo stack', () => {
  const store = createStore(reducer, s0);
  store.dispatch({ type: 'DELETE_CARD', id: 'card_1' });
  store.undo();
  store.dispatch({ type: 'DELETE_CARD', id: 'card_2' });
  assert.equal(store.canRedo(), false);
});

test('history is capped', () => {
  const store = createStore(reducer, s0, { historyLimit: 3 });
  for (let i = 0; i < 5; i++) store.dispatch({ type: 'ADD_COLUMN', id: `c${i}`, title: `C${i}` });
  let undos = 0;
  while (store.undo()) undos++;
  assert.equal(undos, 3);
});

test('unsubscribe stops notifications', () => {
  const store = createStore(reducer, s0);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.dispatch({ type: 'DELETE_CARD', id: 'card_1' });
  off();
  store.dispatch({ type: 'DELETE_CARD', id: 'card_2' });
  assert.equal(calls, 1);
});
