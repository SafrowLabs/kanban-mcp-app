// Best-effort saving to browser storage, plus JSON export/import.
// Storage can be blocked (private mode, sandboxed iframe) or full: every access is
// wrapped so the app keeps running in memory instead of crashing.

import { STORAGE_KEY, SAVE_DELAY_MS } from './constants.js';
import { parseBoard } from './schema.js';

export function createPersistence({
  key = STORAGE_KEY,
  delay = SAVE_DELAY_MS,
  getStorage = () => globalThis.localStorage,
} = {}) {
  let available = true;
  let timer = null;
  let pending = null;
  const listeners = new Set();

  const setAvailable = value => {
    if (value === available) return;
    available = value;
    listeners.forEach(fn => fn(value));
  };

  function probe() {
    try {
      const storage = getStorage();
      storage.setItem(`${key}:probe`, '1');
      storage.removeItem(`${key}:probe`);
      return true;
    } catch { return false; }
  }

  // -> { state: Board | null, error?: string }
  function load() {
    let raw;
    try { raw = getStorage().getItem(key); } catch { setAvailable(false); return { state: null }; }
    setAvailable(probe());
    if (raw == null) return { state: null };
    try {
      return { state: parseBoard(raw) };
    } catch {
      try { getStorage().setItem(`${key}:corrupt`, raw); } catch { /* best effort */ }
      return { state: null, error: 'Your saved board could not be read, so a new board was started.' };
    }
  }

  function save(state) {
    try {
      getStorage().setItem(key, JSON.stringify(state));
      setAvailable(true);
    } catch {
      setAvailable(false);
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (pending) { save(pending); pending = null; }
  }

  return {
    load,
    flush,
    scheduleSave(state) {
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    exportJSON: state => JSON.stringify(state, null, 2),
    importJSON: parseBoard,
    isAvailable: () => available,
    onAvailabilityChange: fn => listeners.add(fn),
  };
}
