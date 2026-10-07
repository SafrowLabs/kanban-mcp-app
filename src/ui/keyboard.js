// Keyboard: pick up / move / drop cards, arrow-key focus between cards, global shortcuts.
//   Space pick up -> arrows move (←/→ column, ↑/↓ position) -> Space drop, Esc cancel.
//   N new card in focused column, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo.

import { clamp, findColumnOf } from '../kanban/board.js';
import { moveCard } from '../kanban/actions.js';
import { displayedCardIds } from './board-ui.js';

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function createKeyboard(ctx) {
  const { els, store, ui } = ctx;

  function positionText(state, p) {
    const col = state.columns[p.columnId];
    return `${col.title}, position ${p.index + 1} of ${displayedCardIds(state, ui, p.columnId).length}`;
  }

  function where(state, cardId) {
    const at = findColumnOf(state, cardId);
    return `${state.columns[at].title}, position ${state.columns[at].cardIds.indexOf(cardId) + 1}`;
  }

  function pickUp(cardId) {
    const state = store.getState();
    const columnId = findColumnOf(state, cardId);
    if (!columnId) return;
    ui.liftedCardId = cardId;
    ui.dragging = false;
    ui.preview = { cardId, columnId, index: state.columns[columnId].cardIds.indexOf(cardId) };
    ctx.render();
    ctx.announce(`Picked up “${state.cards[cardId].title}”. ${positionText(state, ui.preview)}. ` +
      'Arrow keys move, Space drops, Escape cancels.');
  }

  function moveLifted(dx, dy) {
    const state = store.getState();
    const p = ui.preview;
    let { columnId, index } = p;
    if (dx) {
      const target = state.columnOrder[state.columnOrder.indexOf(columnId) + dx];
      if (!target) return;
      columnId = target;
      index = Math.min(index, state.columns[target].cardIds.filter(id => id !== p.cardId).length);
    } else {
      const max = state.columns[columnId].cardIds.filter(id => id !== p.cardId).length;
      index = clamp(index + dy, 0, max);
      if (index === p.index) return;
    }
    ui.preview = { cardId: p.cardId, columnId, index };
    ctx.render();
    ctx.announce(positionText(state, ui.preview));
  }

  function drop() {
    const { cardId, columnId, index } = ui.preview;
    ui.liftedCardId = null;
    ui.preview = null;
    if (!store.dispatch(moveCard(cardId, columnId, index))) ctx.render();
    const state = store.getState();
    ctx.announce(`Dropped “${state.cards[cardId].title}” in ${where(state, cardId)}.`);
  }

  // Cancel with feedback (Esc, Tab, clicking elsewhere).
  function cancelLifted() {
    const cardId = ui.liftedCardId;
    ui.liftedCardId = null;
    ui.preview = null;
    ctx.render();
    const state = store.getState();
    if (state.cards[cardId]) ctx.announce(`Move cancelled. “${state.cards[cardId].title}” is back in ${where(state, cardId)}.`);
  }

  // Silent cancel (before undo/redo/import). Caller re-renders.
  function cancel() {
    if (!ui.liftedCardId) return;
    ui.liftedCardId = null;
    ui.preview = null;
  }

  // Arrow-key focus navigation between cards when nothing is picked up.
  function focusNeighbor(cardId, dx, dy) {
    const state = store.getState();
    const colId = findColumnOf(state, cardId);
    if (!colId) return;
    let targetId = null;
    if (dy) {
      const ids = state.columns[colId].cardIds;
      targetId = ids[ids.indexOf(cardId) + dy];
    } else {
      const order = state.columnOrder;
      const idx = state.columns[colId].cardIds.indexOf(cardId);
      for (let i = order.indexOf(colId) + dx; i >= 0 && i < order.length; i += dx) {
        const ids = state.columns[order[i]].cardIds;
        if (ids.length) { targetId = ids[Math.min(idx, ids.length - 1)]; break; }
      }
    }
    if (targetId) ctx.focus(`card:${targetId}`, true);
  }

  els.board.addEventListener('keydown', e => {
    if (!e.target.matches('.card')) return;
    const cardId = e.target.dataset.cardId;
    if (!ui.liftedCardId) {
      if (e.key === ' ') { e.preventDefault(); pickUp(cardId); }
      else if (e.key === 'Enter') { e.preventDefault(); ctx.dialogs.openCard(cardId); }
      else if (ARROWS[e.key]) { e.preventDefault(); focusNeighbor(cardId, ...ARROWS[e.key]); }
      return;
    }
    if (ui.liftedCardId !== cardId) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); drop(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelLifted(); }
    else if (ARROWS[e.key]) { e.preventDefault(); moveLifted(...ARROWS[e.key]); }
    else if (e.key === 'Tab') cancelLifted();
  });

  // Any pointer press while a card is picked up cancels the keyboard move.
  document.addEventListener('pointerdown', () => { if (ui.liftedCardId) cancelLifted(); }, true);

  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const t = e.target;
    const typing = t.matches && t.matches('input, textarea, select, [contenteditable]');
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (typing || e.altKey) return;
    if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? ctx.redo() : ctx.undo(); }
    else if (mod && key === 'y') { e.preventDefault(); ctx.redo(); }
    else if (!mod && key === 'n' && !ui.liftedCardId) {
      e.preventDefault();
      const colEl = t.closest && t.closest('.column');
      ctx.controls.startAddCard(colEl ? colEl.dataset.columnId : store.getState().columnOrder[0]);
    }
  });

  return { cancel };
}
