// Read-only queries over board state. Pure functions.

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function findColumnOf(state, cardId) {
  return state.columnOrder.find(id => state.columns[id].cardIds.includes(cardId)) ?? null;
}
