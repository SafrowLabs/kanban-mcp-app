import { defaultBoard } from '../src/kanban/constants.js';

export const NOW = '2026-10-06T10:00:00Z';

// Deep-frozen default board: any accidental mutation in the reducer throws.
export function frozenBoard() {
  const freeze = o => {
    Object.freeze(o);
    Object.values(o).forEach(v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) freeze(v); });
    return o;
  };
  return freeze(defaultBoard(NOW));
}

export const clone = v => JSON.parse(JSON.stringify(v));
