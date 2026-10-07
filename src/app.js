// Boot: load -> createStore -> wire UI modules -> subscribe(render, save) -> render.
// Data flows one way: controllers dispatch actions, the store runs the reducer,
// subscribers re-render and save. Only board-ui.js writes the board DOM.

import { STORAGE_KEY, defaultBoard } from './kanban/constants.js';
import { reducer } from './kanban/reducer.js';
import { createStore } from './kanban/store.js';
import { createPersistence } from './kanban/persistence.js';
import { createUiState, createBoardView } from './ui/board-ui.js';
import { createStatus } from './ui/status.js';
import { createDialogs } from './ui/dialogs.js';
import { createControls } from './ui/controls.js';
import { createDrag } from './ui/drag.js';
import { createKeyboard } from './ui/keyboard.js';
import { connectHost } from './ui/host.js';
import { createThemeToggle } from './ui/theme.js';
import { mountIcons } from './ui/icons.js';

mountIcons();
createThemeToggle(document.querySelector('#theme-btn'));
connectHost();

const $ = sel => document.querySelector(sel);
const els = {
  board: $('#board'),
  title: $('#board-title'),
  undo: $('#undo-btn'),
  redo: $('#redo-btn'),
  exportBtn: $('#export-btn'),
  importBtn: $('#import-btn'),
  importInput: $('#import-input'),
  resetBtn: $('#reset-btn'),
  addCard: $('#add-card-btn'),
  search: $('#search-input'),
  saveStatus: $('#save-status'),
  live: $('#live'),
  toast: $('#toast'),
  cardDialog: $('#card-dialog'),
  columnDialog: $('#column-dialog'),
  confirmDialog: $('#confirm-dialog'),
};

const persistence = createPersistence({ key: STORAGE_KEY });
const loaded = persistence.load();
const store = createStore(reducer, loaded.state ?? defaultBoard(new Date().toISOString()));
const ui = createUiState();
const status = createStatus({ liveEl: els.live, toastEl: els.toast, badgeEl: els.saveStatus });
const view = createBoardView(els, store, ui);

// Shared context handed to every UI module. Modules reach each other through it at
// call time (ctx.dialogs, ctx.controls, ...), so there are no import cycles.
const ctx = {
  els,
  store,
  ui,
  persistence,
  render: view.render,
  focus: view.focus,
  announce: status.announce,
  toast: status.toast,

  cancelTransient() {
    ctx.drag.cancel();
    ctx.keyboard.cancel();
  },

  undo() {
    ctx.cancelTransient();
    status.announce(store.undo() ? 'Undone.' : 'Nothing to undo.');
    view.render();
  },

  redo() {
    ctx.cancelTransient();
    status.announce(store.redo() ? 'Redone.' : 'Nothing to redo.');
    view.render();
  },
};

ctx.dialogs = createDialogs(ctx);
ctx.controls = createControls(ctx);
ctx.drag = createDrag(ctx);
ctx.keyboard = createKeyboard(ctx);

status.setSaved(persistence.isAvailable());
persistence.onAvailabilityChange(status.setSaved);

store.subscribe(state => {
  view.render();
  persistence.scheduleSave(state);
});
window.addEventListener('pagehide', persistence.flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistence.flush();
});

view.render();
if (!loaded.state) persistence.scheduleSave(store.getState());
if (loaded.error) status.toast(loaded.error, 'error');
