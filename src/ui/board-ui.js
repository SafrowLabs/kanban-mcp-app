// Renderer: the only code that writes the board DOM. State + transient UI state -> DOM.
// Full re-render on every change; focus, typed input and scroll positions are carried over.

import { labelName } from '../kanban/constants.js';
import { clamp } from '../kanban/board.js';
import { h, cls, focusByKey } from './dom.js';
import { icon, illustration } from './icons.js';

// Column accent colors, assigned by position (To Do red, Doing amber, Done green, ...).
const TONES = ['red', 'amber', 'green', 'blue', 'purple', 'pink'];
const DONE_TITLE = /\b(done|complete|completed|finished|shipped)\b/i;

// Transient UI state. Never stored, never in undo history.
export function createUiState() {
  return {
    addingCardIn: null,    // column id with the open "add card" input
    addingColumn: false,
    preview: null,         // { cardId, columnId, index } where a moving card is shown
    dragging: false,       // pointer drag (placeholder) vs keyboard move (lifted)
    outside: false,        // pointer is outside every column: drop cancels
    liftedCardId: null,    // card picked up with the keyboard
    suppressClick: false,  // swallow the click that follows a drag
    query: '',             // search text: non-matching cards are dimmed, not hidden
  };
}


// Column card order as currently displayed (applies a move preview).
export function displayedCardIds(state, ui, colId) {
  const ids = state.columns[colId].cardIds;
  const p = ui.preview;
  if (!p) return ids;
  const out = ids.filter(id => id !== p.cardId);
  if (p.columnId === colId) out.splice(clamp(p.index, 0, out.length), 0, p.cardId);
  return out;
}

// Search matches title, description and label names. Dimming instead of hiding keeps
// drag and keyboard positions identical to the stored card order.
export function cardMatches(card, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [card.title, card.description, ...card.labels.map(labelName)]
    .some(text => text.toLowerCase().includes(q));
}

export function cardContents(card) {
  return [
    h('div', { class: 'card-top' },
      card.labels.length
        ? h('div', { class: 'card-labels' },
            ...card.labels.map(id => h('span', { class: 'label', dataset: { label: id }, text: labelName(id) })))
        : h('div', { class: 'card-labels' }),
      h('span', { class: 'card-edit-slot', 'aria-hidden': 'true' })),
    h('div', { class: 'card-title', text: card.title }),
    card.description
      ? h('div', { class: 'card-desc', text: card.description })
      : h('div', { class: 'card-desc placeholder-text', 'aria-hidden': 'true', text: 'Add a description…' }),
  ];
}

function emptyState(col, columnCount) {
  const done = columnCount > 1 && DONE_TITLE.test(col.title);
  return h('li', { class: 'empty-state' },
    illustration(done ? 'celebrate' : 'empty'),
    h('p', { class: 'empty-title', text: done ? 'No completed cards' : 'No cards yet' }),
    h('p', { class: 'empty-text', text: done
      ? 'Move cards here when you’re done to celebrate your progress!'
      : 'Drag cards here or click the button below to add one.' }));
}

export function createBoardView(els, store, ui) {
  const boardEl = els.board;

  function renderCard(card) {
    const moving = ui.preview && ui.preview.cardId === card.id;
    // The edit button is the card's sibling, not its child, so it never starts a drag
    // and is not an interactive element nested inside the focusable card.
    return h('li', { class: 'card-item' },
      h('div', {
        class: cls('card', moving && (ui.dragging ? 'placeholder' : 'lifted'), !cardMatches(card, ui.query) && 'dim'),
        role: 'group',
        tabindex: '0',
        'aria-roledescription': 'card',
        'aria-label': card.title,
        dataset: { cardId: card.id, focusKey: `card:${card.id}` },
      }, ...cardContents(card)),
      h('button', {
        type: 'button', class: 'card-edit', 'aria-label': `Edit card: ${card.title}`, title: 'Edit card',
        dataset: { action: 'edit-card', editCard: card.id, focusKey: `card-edit:${card.id}` },
      }, icon('edit')));
  }

  function renderColumn(state, col, index) {
    const count = col.cardIds.length;
    const headingId = `col-title-${col.id}`;

    const countEl = h('span', { class: 'count', 'aria-label': `${count} cards`, text: String(count) });

    const ids = displayedCardIds(state, ui, col.id);
    const list = h('ul', { class: 'cards', role: 'list', 'aria-label': `${col.title} cards`, dataset: { listFor: col.id } },
      ...(ids.length ? ids.map(id => renderCard(state.cards[id])) : [emptyState(col, state.columnOrder.length)]));

    const footer = ui.addingCardIn === col.id
      ? h('form', { class: 'add-form', dataset: { form: 'add-card', columnId: col.id } },
          h('input', {
            type: 'text', maxlength: '500', autocomplete: 'off', placeholder: 'Card title',
            'aria-label': `New card title in ${col.title}`,
            dataset: { focusKey: `add-card:${col.id}` },
          }),
          h('div', { class: 'row' },
            h('button', { type: 'submit', class: 'btn primary', text: 'Add card' }),
            h('button', { type: 'button', class: 'btn ghost-btn', dataset: { action: 'cancel-add-card' }, text: 'Cancel' })))
      : h('button', {
          type: 'button', class: 'add-btn',
          dataset: { action: 'start-add-card', columnId: col.id, focusKey: `add-card-btn:${col.id}` },
        }, icon('plus'), 'Add a card');

    return h('section', {
      class: 'column',
      'aria-labelledby': headingId,
      dataset: { columnId: col.id, tone: TONES[index % TONES.length] },
    },
      h('div', { class: 'column-header' },
        h('span', { class: 'dot', 'aria-hidden': 'true' }),
        h('h2', { class: 'column-title', id: headingId, text: col.title }),
        countEl,
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Column settings: ${col.title}`, title: 'Column settings',
          dataset: { action: 'edit-column', columnId: col.id, focusKey: `col-menu:${col.id}` },
        }, icon('more'))),
      list,
      h('div', { class: 'column-footer' }, footer));
  }

  function renderAddColumn(state) {
    const empty = state.columnOrder.length === 0
      ? h('p', { class: 'empty-board', text: 'This board has no columns yet.' })
      : null;
    if (ui.addingColumn) {
      return h('div', { class: 'add-column' }, empty,
        h('form', { class: 'add-form', dataset: { form: 'add-column' } },
          h('input', {
            type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Column name',
            'aria-label': 'New column name', dataset: { focusKey: 'add-column' },
          }),
          h('div', { class: 'row' },
            h('button', { type: 'submit', class: 'btn primary', text: 'Add column' }),
            h('button', { type: 'button', class: 'btn ghost-btn', dataset: { action: 'cancel-add-column' }, text: 'Cancel' }))));
    }
    return h('div', { class: 'add-column' }, empty,
      h('button', { type: 'button', class: 'add-column-btn', dataset: { action: 'start-add-column', focusKey: 'add-column-btn' } },
        h('span', { class: 'add-column-icon' }, icon('plus')),
        h('span', { class: 'add-column-title', text: 'Add column' }),
        h('span', { class: 'add-column-text', text: 'Create a new column to organize your workflow' })));
  }

  function render() {
    const state = store.getState();
    if (ui.preview && !state.cards[ui.preview.cardId]) { ui.preview = null; ui.liftedCardId = null; }
    if (ui.addingCardIn && !state.columns[ui.addingCardIn]) ui.addingCardIn = null;

    // Capture focus, typed input and scroll positions so a full re-render is invisible.
    const active = document.activeElement;
    const focusKey = active && boardEl.contains(active) ? active.dataset.focusKey : null;
    const selection = focusKey && active.tagName === 'INPUT' ? [active.selectionStart, active.selectionEnd] : null;
    const values = {};
    boardEl.querySelectorAll('input[data-focus-key]').forEach(i => { values[i.dataset.focusKey] = i.value; });
    const scrolls = {};
    boardEl.querySelectorAll('.cards').forEach(l => { scrolls[l.dataset.listFor] = l.scrollTop; });
    const boardScroll = boardEl.scrollLeft;

    const frag = document.createDocumentFragment();
    state.columnOrder.forEach((colId, i) => frag.append(renderColumn(state, state.columns[colId], i)));
    frag.append(renderAddColumn(state));
    boardEl.replaceChildren(frag);

    boardEl.querySelectorAll('input[data-focus-key]').forEach(i => {
      if (values[i.dataset.focusKey] != null) i.value = values[i.dataset.focusKey];
    });
    boardEl.querySelectorAll('.cards').forEach(l => {
      if (scrolls[l.dataset.listFor] != null) l.scrollTop = scrolls[l.dataset.listFor];
    });
    boardEl.scrollLeft = boardScroll;
    if (focusKey) {
      const el = focusByKey(boardEl, focusKey, Boolean(ui.liftedCardId));
      if (el && selection) { try { el.setSelectionRange(...selection); } catch { /* ignore */ } }
    }

    els.title.textContent = state.board.title;
    document.title = `${state.board.title} · Kanban`;
    els.undo.disabled = !store.canUndo();
    els.redo.disabled = !store.canRedo();
  }

  return {
    render,
    focus: (key, scroll = false) => focusByKey(boardEl, key, scroll),
  };
}
