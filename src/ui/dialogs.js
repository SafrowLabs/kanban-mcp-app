// Native <dialog> modals: edit card, column settings, and a confirm prompt.

import { LABELS } from '../kanban/constants.js';
import { updateCard, deleteCard, updateColumn, deleteColumn, moveColumn } from '../kanban/actions.js';
import { h } from './dom.js';

export function createDialogs(ctx) {
  const { els, store } = ctx;
  const cardDialog = els.cardDialog;
  const cardForm = cardDialog.querySelector('form');
  const columnDialog = els.columnDialog;
  const columnForm = columnDialog.querySelector('form');
  const confirmDialog = els.confirmDialog;
  const $ = sel => document.querySelector(sel);

  document.querySelectorAll('dialog [data-close]').forEach(btn =>
    btn.addEventListener('click', () => btn.closest('dialog').close('cancel')));

  const labelOptions = $('#label-options');
  LABELS.forEach(l => labelOptions.append(
    h('label', { class: 'label-option' },
      h('input', { type: 'checkbox', name: 'label', value: l.id }),
      h('span', { class: 'label', dataset: { label: l.id }, text: l.name }))));

  // `close` fires a task after the dialog shuts; don't steal focus the user already moved.
  function restoreFocus(key) {
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('dialog')) ctx.focus(key);
  }

  function confirm(message, okLabel = 'Delete') {
    return new Promise(resolve => {
      $('#confirm-message').textContent = message;
      $('#confirm-ok').textContent = okLabel;
      confirmDialog.returnValue = '';
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'confirm'), { once: true });
      confirmDialog.showModal();
    });
  }

  // ---------- card ----------
  const formatDate = iso => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  };

  function openCard(cardId) {
    const card = store.getState().cards[cardId];
    if (!card) return;
    cardForm.elements.title.value = card.title;
    cardForm.elements.description.value = card.description;
    cardForm.querySelectorAll('input[name="label"]').forEach(box => { box.checked = card.labels.includes(box.value); });
    const created = formatDate(card.createdAt);
    const updated = formatDate(card.updatedAt);
    $('#card-meta').textContent = [created && `Created ${created}`, updated && updated !== created && `Updated ${updated}`]
      .filter(Boolean).join(' · ');
    cardDialog.dataset.editId = cardId;
    cardDialog.returnValue = '';
    cardDialog.showModal();
  }

  cardDialog.addEventListener('close', () => {
    const id = cardDialog.dataset.editId;
    if (cardDialog.returnValue === 'save') {
      const labels = [...cardForm.querySelectorAll('input[name="label"]:checked')].map(b => b.value);
      store.dispatch(updateCard(id, {
        title: cardForm.elements.title.value,
        description: cardForm.elements.description.value,
        labels,
      }));
    }
    restoreFocus(`card:${id}`);
  });

  $('#card-delete').addEventListener('click', async () => {
    const id = cardDialog.dataset.editId;
    const card = store.getState().cards[id];
    if (!card) { cardDialog.close('cancel'); return; }
    if (!await confirm(`Delete card “${card.title}”?`)) return;
    cardDialog.close('deleted');
    store.dispatch(deleteCard(id));
    ctx.announce(`Deleted “${card.title}”. Undo to restore.`);
  });

  // ---------- column ----------
  function updateMoveButtons() {
    const order = store.getState().columnOrder;
    const i = order.indexOf(columnDialog.dataset.editId);
    $('#column-left').disabled = i <= 0;
    $('#column-right').disabled = i < 0 || i >= order.length - 1;
  }

  function openColumn(columnId) {
    const col = store.getState().columns[columnId];
    if (!col) return;
    columnForm.elements.title.value = col.title;
    columnDialog.dataset.editId = columnId;
    columnDialog.returnValue = '';
    updateMoveButtons();
    columnDialog.showModal();
  }

  function moveColumnBy(delta) {
    const id = columnDialog.dataset.editId;
    const state = store.getState();
    const i = state.columnOrder.indexOf(id);
    if (i < 0) return;
    if (store.dispatch(moveColumn(id, i + delta))) {
      ctx.announce(`Moved “${state.columns[id].title}” to position ${i + delta + 1} of ${state.columnOrder.length}.`);
    }
    updateMoveButtons();
  }

  columnDialog.addEventListener('close', () => {
    const id = columnDialog.dataset.editId;
    if (columnDialog.returnValue === 'save') {
      store.dispatch(updateColumn(id, { title: columnForm.elements.title.value }));
    }
    restoreFocus(`col-menu:${id}`);
  });

  $('#column-left').addEventListener('click', () => moveColumnBy(-1));
  $('#column-right').addEventListener('click', () => moveColumnBy(1));

  $('#column-delete').addEventListener('click', async () => {
    const id = columnDialog.dataset.editId;
    const col = store.getState().columns[id];
    if (!col) { columnDialog.close('cancel'); return; }
    const n = col.cardIds.length;
    const msg = n ? `Delete column “${col.title}” and its ${n} card${n === 1 ? '' : 's'}?` : `Delete column “${col.title}”?`;
    if (!await confirm(msg)) return;
    columnDialog.close('deleted');
    store.dispatch(deleteColumn(id));
    ctx.announce(`Deleted column “${col.title}”. Undo to restore.`);
  });

  return { openCard, openColumn, confirm };
}
