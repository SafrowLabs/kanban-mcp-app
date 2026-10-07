import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPersistence } from '../src/kanban/persistence.js';
import { frozenBoard, clone } from './helpers.js';

const s0 = frozenBoard();

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: k => { data.delete(k); },
  };
}

const blocked = () => { throw new DOMException('blocked', 'SecurityError'); };

test('load returns null state when nothing saved', () => {
  const p = createPersistence({ key: 'k', getStorage: () => memoryStorage() });
  assert.deepEqual(p.load(), { state: null });
  assert.equal(p.isAvailable(), true);
});

test('save is debounced and flush writes immediately', async () => {
  const storage = memoryStorage();
  const p = createPersistence({ key: 'k', delay: 20, getStorage: () => storage });
  p.scheduleSave(s0);
  assert.equal(storage.getItem('k'), null);
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(JSON.parse(storage.getItem('k')), clone(s0));

  storage.removeItem('k');
  p.scheduleSave(s0);
  p.flush();
  assert.notEqual(storage.getItem('k'), null);
});

test('saved board loads back', () => {
  const storage = memoryStorage({ k: JSON.stringify(s0) });
  const p = createPersistence({ key: 'k', getStorage: () => storage });
  assert.deepEqual(p.load().state, clone(s0));
});

test('corrupt data -> fresh board with error, raw copy kept', () => {
  const storage = memoryStorage({ k: '{garbage' });
  const p = createPersistence({ key: 'k', getStorage: () => storage });
  const r = p.load();
  assert.equal(r.state, null);
  assert.match(r.error, /could not be read/);
  assert.equal(storage.getItem('k:corrupt'), '{garbage');
});

test('blocked storage -> unavailable, never throws', () => {
  const p = createPersistence({ key: 'k', getStorage: blocked });
  const changes = [];
  p.onAvailabilityChange(v => changes.push(v));
  assert.deepEqual(p.load(), { state: null });
  assert.equal(p.isAvailable(), false);
  p.scheduleSave(s0);
  p.flush();
  assert.deepEqual(changes, [false]);
});

test('full storage on save -> unavailable; recovers on next good save', () => {
  const storage = memoryStorage();
  let full = false;
  const real = storage.setItem;
  storage.setItem = (k, v) => { if (full) throw new DOMException('quota', 'QuotaExceededError'); real(k, v); };
  const p = createPersistence({ key: 'k', getStorage: () => storage });
  p.load();
  full = true;
  p.scheduleSave(s0); p.flush();
  assert.equal(p.isAvailable(), false);
  full = false;
  p.scheduleSave(s0); p.flush();
  assert.equal(p.isAvailable(), true);
});
