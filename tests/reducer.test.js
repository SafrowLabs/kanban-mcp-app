import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer } from '../src/kanban/reducer.js';
import { frozenBoard, NOW } from './helpers.js';

const s0 = frozenBoard();
const ids = (s, col) => s.columns[col].cardIds;

test('ADD_CARD trims title and appends to column', () => {
  const s = reducer(s0, { type: 'ADD_CARD', id: 'c9', columnId: 'col_todo', title: '  x  ', now: NOW });
  assert.deepEqual(ids(s, 'col_todo'), ['card_1', 'card_2', 'card_3', 'c9']);
  assert.equal(s.cards.c9.title, 'x');
  assert.equal(s.cards.c9.createdAt, NOW);
});

test('ADD_CARD rejects blank title, unknown column, duplicate id', () => {
  assert.equal(reducer(s0, { type: 'ADD_CARD', id: 'c9', columnId: 'col_todo', title: '   ', now: NOW }), s0);
  assert.equal(reducer(s0, { type: 'ADD_CARD', id: 'c9', columnId: 'nope', title: 'x', now: NOW }), s0);
  assert.equal(reducer(s0, { type: 'ADD_CARD', id: 'card_1', columnId: 'col_todo', title: 'x', now: NOW }), s0);
});

test('MOVE_CARD across columns', () => {
  const s = reducer(s0, { type: 'MOVE_CARD', id: 'card_2', toColumnId: 'col_doing', toIndex: 0 });
  assert.deepEqual(ids(s, 'col_doing'), ['card_2']);
  assert.deepEqual(ids(s, 'col_todo'), ['card_1', 'card_3']);
});

test('MOVE_CARD within column', () => {
  const s = reducer(s0, { type: 'MOVE_CARD', id: 'card_1', toColumnId: 'col_todo', toIndex: 2 });
  assert.deepEqual(ids(s, 'col_todo'), ['card_2', 'card_3', 'card_1']);
});

test('MOVE_CARD to same position is a no-op', () => {
  assert.equal(reducer(s0, { type: 'MOVE_CARD', id: 'card_2', toColumnId: 'col_todo', toIndex: 1 }), s0);
});

test('MOVE_CARD clamps index (empty column -> 0)', () => {
  const s = reducer(s0, { type: 'MOVE_CARD', id: 'card_1', toColumnId: 'col_done', toIndex: 99 });
  assert.deepEqual(ids(s, 'col_done'), ['card_1']);
});

test('columns have no card limit', () => {
  let s = s0;
  for (let i = 0; i < 20; i++) s = reducer(s, { type: 'ADD_CARD', id: `n${i}`, columnId: 'col_doing', title: 'x', now: NOW });
  for (const id of ['card_1', 'card_2', 'card_3']) s = reducer(s, { type: 'MOVE_CARD', id, toColumnId: 'col_doing', toIndex: 0 });
  assert.equal(ids(s, 'col_doing').length, 23);
});

test('UPDATE_CARD with no real change returns same state', () => {
  assert.equal(reducer(s0, { type: 'UPDATE_CARD', id: 'card_1', patch: { title: ' Drag me to Doing ', labels: ['blue'] }, now: 'z' }), s0);
});

test('UPDATE_CARD filters unknown labels, keeps canonical order, stamps updatedAt', () => {
  const s = reducer(s0, { type: 'UPDATE_CARD', id: 'card_2', patch: { labels: ['purple', 'bogus', 'red'] }, now: 'z' });
  assert.deepEqual(s.cards.card_2.labels, ['red', 'purple']);
  assert.equal(s.cards.card_2.updatedAt, 'z');
});

test('UPDATE_CARD ignores blank title', () => {
  const s = reducer(s0, { type: 'UPDATE_CARD', id: 'card_2', patch: { title: '  ', description: 'd' }, now: 'z' });
  assert.equal(s.cards.card_2.title, 'Click the pencil to edit a card');
  assert.equal(s.cards.card_2.description, 'd');
});

test('DELETE_CARD removes from map and column', () => {
  const s = reducer(s0, { type: 'DELETE_CARD', id: 'card_1' });
  assert.equal(s.cards.card_1, undefined);
  assert.deepEqual(ids(s, 'col_todo'), ['card_2', 'card_3']);
});

test('ADD_COLUMN / UPDATE_COLUMN / MOVE_COLUMN', () => {
  let s = reducer(s0, { type: 'ADD_COLUMN', id: 'col_x', title: ' Review ' });
  assert.deepEqual(s.columnOrder, ['col_todo', 'col_doing', 'col_done', 'col_x']);
  assert.equal(s.columns.col_x.title, 'Review');
  s = reducer(s, { type: 'UPDATE_COLUMN', id: 'col_x', patch: { title: 'QA' } });
  assert.deepEqual(s.columns.col_x, { id: 'col_x', title: 'QA', cardIds: [] });
  s = reducer(s, { type: 'MOVE_COLUMN', id: 'col_x', toIndex: 0 });
  assert.deepEqual(s.columnOrder, ['col_x', 'col_todo', 'col_doing', 'col_done']);
});

test('UPDATE_COLUMN ignores blank titles and unknown fields', () => {
  for (const patch of [{ title: '  ' }, { title: 'To Do' }, { wipLimit: 2 }, {}]) {
    assert.equal(reducer(s0, { type: 'UPDATE_COLUMN', id: 'col_todo', patch }), s0);
  }
});

test('DELETE_COLUMN removes column and its cards', () => {
  const s = reducer(s0, { type: 'DELETE_COLUMN', id: 'col_todo' });
  assert.deepEqual(s.columnOrder, ['col_doing', 'col_done']);
  assert.deepEqual(Object.keys(s.cards), []);
});

test('unknown action returns same state', () => {
  assert.equal(reducer(s0, { type: 'NOPE' }), s0);
});
