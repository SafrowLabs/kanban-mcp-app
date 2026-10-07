// Header toolbar (search, undo, redo, export, import, reset, add card) and board clicks / inline forms
// (add card, add column, open dialogs). Translates user input into actions.

import { addCard, addColumn, replaceState } from '../kanban/actions.js';
import { defaultBoard } from '../kanban/constants.js';
import { h } from './dom.js';

export function createControls(ctx) {
  const { els, store, ui } = ctx;
  const boardEl = els.board;

  function startAddCard(columnId) {
    if (!columnId || !store.getState().columns[columnId]) { startAddColumn(); return; }
    ui.addingCardIn = columnId;
    ui.addingColumn = false;
    ctx.render();
    ctx.focus(`add-card:${columnId}`, true);
  }

  function startAddColumn() {
    ui.addingColumn = true;
    ui.addingCardIn = null;
    ctx.render();
    ctx.focus('add-column', true);
  }

  function closeAddCard() {
    const col = ui.addingCardIn;
    ui.addingCardIn = null;
    ctx.render();
    ctx.focus(`add-card-btn:${col}`);
  }

  function closeAddColumn() {
    ui.addingColumn = false;
    ctx.render();
    ctx.focus('add-column-btn');
  }

  function submitAddCard(form) {
    const columnId = form.dataset.columnId;
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) { input.value = ''; return; }
    const col = store.getState().columns[columnId];
    if (!col) return;
    input.value = ''; // clear before dispatch so the re-render doesn't restore it
    store.dispatch(addCard(columnId, title));
    ctx.announce(`Added “${title}” to ${col.title}.`);
  }

  function submitAddColumn(form) {
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) { input.value = ''; return; }
    input.value = '';
    store.dispatch(addColumn(title));
    boardEl.scrollLeft = boardEl.scrollWidth;
    ctx.announce(`Added column “${title}”.`);
  }

  // ---------- board ----------
  boardEl.addEventListener('click', e => {
    if (ui.suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const id = actionEl.dataset.columnId;
      switch (actionEl.dataset.action) {
        case 'start-add-card': startAddCard(id); break;
        case 'cancel-add-card': closeAddCard(); break;
        case 'start-add-column': startAddColumn(); break;
        case 'cancel-add-column': closeAddColumn(); break;
        case 'edit-column': ctx.dialogs.openColumn(id); break;
        case 'edit-card': if (!ui.liftedCardId) ctx.dialogs.openCard(actionEl.dataset.editCard); break;
      }
    }
  });

  boardEl.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.form === 'add-card') submitAddCard(form);
    else if (form.dataset.form === 'add-column') submitAddColumn(form);
  });

  boardEl.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (e.target.closest('[data-form="add-card"]')) { e.preventDefault(); closeAddCard(); }
    else if (e.target.closest('[data-form="add-column"]')) { e.preventDefault(); closeAddColumn(); }
  });

  // ---------- toolbar ----------
  els.undo.addEventListener('click', ctx.undo);
  els.redo.addEventListener('click', ctx.redo);

  // Header "Add card": adds to the first column.
  els.addCard.addEventListener('click', () => startAddCard(store.getState().columnOrder[0]));

  els.search.addEventListener('input', () => {
    ui.query = els.search.value;
    ctx.render();
  });
  els.search.addEventListener('keydown', e => {
    if (e.key === 'Escape' && els.search.value) {
      e.preventDefault();
      els.search.value = '';
      ui.query = '';
      ctx.render();
    }
  });

  els.exportBtn.addEventListener('click', () => {
    const blob = new Blob([ctx.persistence.exportJSON(store.getState())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'board.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ctx.announce('Board exported as board.json.');
  });

  els.importBtn.addEventListener('click', () => els.importInput.click());
  els.importInput.addEventListener('change', async () => {
    const file = els.importInput.files && els.importInput.files[0];
    els.importInput.value = '';
    if (!file) return;
    try {
      const state = ctx.persistence.importJSON(await file.text());
      ctx.cancelTransient();
      ui.addingCardIn = null;
      store.dispatch(replaceState(state));
      ctx.toast('Board imported. Undo to go back.');
    } catch (err) {
      ctx.toast(`Import failed. ${err.message}`, 'error');
    }
  });

  els.resetBtn.addEventListener('click', async () => {
    const ok = await ctx.dialogs.confirm(
      'Reset the board? All columns and cards are replaced with the starter board.', 'Reset');
    if (!ok) return;
    ctx.cancelTransient();
    ui.addingCardIn = null;
    store.dispatch(replaceState(defaultBoard(new Date().toISOString())));
    ctx.toast('Board reset. Undo to go back.');
  });

  return { startAddCard, startAddColumn };
}
