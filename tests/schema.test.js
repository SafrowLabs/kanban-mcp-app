import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoard } from '../src/kanban/schema.js';
import { reducer } from '../src/kanban/reducer.js';
import { frozenBoard, clone } from './helpers.js';

const s0 = frozenBoard();

test('export -> import round-trips exactly', () => {
  const s = reducer(s0, { type: 'MOVE_CARD', id: 'card_1', toColumnId: 'col_done', toIndex: 0 });
  assert.deepEqual(parseBoard(JSON.stringify(s)), clone(s));
});

test('strips unknown fields and labels', () => {
  const d = clone(s0);
  d.extra = 1;
  d.cards.card_1.evil = '<script>';
  d.cards.card_1.labels = ['blue', 'nope'];
  const s = parseBoard(JSON.stringify(d));
  assert.equal(s.extra, undefined);
  assert.equal(s.cards.card_1.evil, undefined);
  assert.deepEqual(s.cards.card_1.labels, ['blue']);
});

test('old boards with a WIP limit still load; the limit is dropped', () => {
  const d = clone(s0);
  d.columns.col_doing.wipLimit = 3;
  d.columns.col_todo.wipLimit = 0;
  const s = parseBoard(JSON.stringify(d));
  assert.deepEqual(s, clone(s0));
});

const invalid = {
  'card in two columns': d => d.columns.col_done.cardIds.push('card_1'),
  'card in no column': d => { d.cards.x = { id: 'x', title: 't' }; },
  'missing card': d => d.columns.col_done.cardIds.push('nope'),
  'column missing from columnOrder': d => { d.columns.col_x = { id: 'col_x', title: 'x', cardIds: [] }; },
  'unknown version': d => { d.version = 2; },
  'prototype-polluting id': d => d.columnOrder.push('__proto__'),
  'id mismatch': d => { d.cards.card_1.id = 'card_9'; },
  'non-string title': d => { d.cards.card_1.title = 42; },
};
for (const [name, mutate] of Object.entries(invalid)) {
  test(`rejects: ${name}`, () => {
    const d = clone(s0);
    mutate(d);
    assert.throws(() => parseBoard(JSON.stringify(d)), /Invalid board|Unsupported/);
  });
}

test('rejects non-JSON and non-objects', () => {
  assert.throws(() => parseBoard('{nope'), /valid JSON/);
  assert.throws(() => parseBoard('null'), /not a board/);
  assert.throws(() => parseBoard('[]'), /Unsupported|Invalid/);
});
