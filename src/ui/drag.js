// Pointer drag and drop for cards (mouse, pen, touch).
// Drag position is transient UI state (ui.preview); only the drop dispatches MOVE_CARD.

import { findColumnOf } from '../kanban/board.js';
import { moveCard } from '../kanban/actions.js';
import { h } from './dom.js';
import { cardContents } from './board-ui.js';

const DRAG_THRESHOLD_PX = 5;   // mouse/pen: movement before a drag starts
const TOUCH_HOLD_MS = 250;     // touch: press-and-hold starts a drag so a normal swipe still scrolls
const TOUCH_SLOP_PX = 8;
const EDGE_PX = 48;            // auto-scroll zone near board / column edges
const SCROLL_SPEED = 12;

export function createDrag(ctx) {
  const { els, store, ui } = ctx;
  const boardEl = els.board;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pointer = null; // pending or active drag

  const ghostTransform = p => `translate(${p.x - p.offsetX}px, ${p.y - p.offsetY}px) rotate(2deg)`;
  const touchDragging = () => pointer && pointer.active && pointer.type === 'touch';

  function startDrag() {
    const p = pointer;
    clearTimeout(p.holdTimer);
    const state = store.getState();
    const fromColumnId = findColumnOf(state, p.cardId);
    if (!fromColumnId) { cancel(); return; }
    p.active = true;
    p.fromColumnId = fromColumnId;
    p.ghost = h('div', { class: 'card ghost', 'aria-hidden': 'true' }, ...cardContents(state.cards[p.cardId]));
    p.ghost.style.width = `${p.width}px`;
    p.ghost.style.transform = ghostTransform(p);
    document.body.append(p.ghost);
    document.body.classList.add('dragging');
    // Mouse / pen: capture on the board (it outlives re-renders) so moves and the release
    // still arrive when the pointer leaves an embedding iframe. Touch uses touch events.
    if (p.type !== 'touch') {
      try { boardEl.setPointerCapture(p.pointerId); } catch { /* pointer already gone */ }
    }
    ui.dragging = true;
    ui.outside = false;
    ui.preview = { cardId: p.cardId, columnId: fromColumnId, index: state.columns[fromColumnId].cardIds.indexOf(p.cardId) };
    ctx.render();
    p.raf = requestAnimationFrame(autoScroll);
  }

  function updateDropTarget() {
    const p = pointer;
    const state = store.getState();
    const hit = document.elementFromPoint(p.x, p.y);
    const colEl = hit && hit.closest('.column[data-column-id]');
    let columnId = p.fromColumnId;
    let index = state.columns[p.fromColumnId].cardIds.indexOf(p.cardId);
    let outside = true;
    if (colEl && boardEl.contains(colEl)) {
      outside = false;
      columnId = colEl.dataset.columnId;
      index = 0;
      for (const el of colEl.querySelectorAll('.card:not(.placeholder)')) {
        const r = el.getBoundingClientRect();
        if (p.y > r.top + r.height / 2) index++; else break;
      }
    }
    const cur = ui.preview;
    if (cur.columnId === columnId && cur.index === index && ui.outside === outside) return;
    ui.preview = { cardId: p.cardId, columnId, index };
    ui.outside = outside;
    ctx.render();
  }

  function dragMove(x, y) {
    const p = pointer;
    p.x = x;
    p.y = y;
    p.ghost.style.transform = ghostTransform(p);
    updateDropTarget();
  }

  function autoScroll() {
    const p = pointer;
    if (!p || !p.active) return;
    const before = boardEl.scrollLeft;
    const br = boardEl.getBoundingClientRect();
    if (p.x < br.left + EDGE_PX) boardEl.scrollLeft -= SCROLL_SPEED;
    else if (p.x > br.right - EDGE_PX) boardEl.scrollLeft += SCROLL_SPEED;
    let scrolled = boardEl.scrollLeft !== before;
    const hit = document.elementFromPoint(p.x, p.y);
    const colEl = hit && hit.closest('.column');
    const list = colEl && colEl.querySelector('.cards');
    if (list) {
      const top = list.scrollTop;
      const lr = list.getBoundingClientRect();
      if (p.y < lr.top + EDGE_PX) list.scrollTop -= SCROLL_SPEED;
      else if (p.y > lr.bottom - EDGE_PX) list.scrollTop += SCROLL_SPEED;
      scrolled = scrolled || list.scrollTop !== top;
    }
    if (scrolled) updateDropTarget();
    p.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(commit) {
    const p = pointer;
    pointer = null;
    if (p.stopTouch) p.stopTouch();
    cancelAnimationFrame(p.raf);
    if (boardEl.hasPointerCapture?.(p.pointerId)) boardEl.releasePointerCapture(p.pointerId);
    document.body.classList.remove('dragging');
    const target = ui.preview;
    const outside = ui.outside;
    ui.dragging = false;
    ui.preview = null;
    ui.outside = false;
    ui.suppressClick = true;
    setTimeout(() => { ui.suppressClick = false; }, 0);

    const moved = commit && !outside && store.dispatch(moveCard(p.cardId, target.columnId, target.index));
    if (moved) {
      p.ghost.remove();
      const state = store.getState();
      const at = findColumnOf(state, p.cardId);
      ctx.announce(`Moved “${state.cards[p.cardId].title}” to ${state.columns[at].title}.`);
      return;
    }

    ctx.render();
    // Snap back: animate the ghost home before removing it.
    const home = boardEl.querySelector(`.card[data-card-id="${CSS.escape(p.cardId)}"]`);
    if (home && p.ghost.animate && !reduceMotion.matches) {
      const r = home.getBoundingClientRect();
      const done = () => p.ghost.remove();
      p.ghost.animate(
        [{ transform: ghostTransform(p) }, { transform: `translate(${r.left}px, ${r.top}px) rotate(0deg)` }],
        { duration: 180, easing: 'ease-out', fill: 'forwards' },
      ).finished.then(done, done);
      setTimeout(done, 250); // animations can stall (hidden tab, modal open)
    } else {
      p.ghost.remove();
    }
  }

  function cancel() {
    if (!pointer) return;
    clearTimeout(pointer.holdTimer);
    if (pointer.active) endDrag(false);
    else {
      if (pointer.stopTouch) pointer.stopTouch();
      pointer = null;
    }
  }

  // A started touch drag is driven by touch events, not pointer events: the browser
  // sends pointercancel when it wants to pan, and touch events stay targeted at the
  // card element the finger first hit, even after render() detaches it. So the
  // listeners go on that element itself.
  function watchTouch(el) {
    const onMove = e => {
      if (!touchDragging()) return;
      e.preventDefault(); // keep the page from scrolling under the drag
      const t = e.touches[0];
      if (t) dragMove(t.clientX, t.clientY);
    };
    const onEnd = e => {
      if (e.touches && e.touches.length) return;
      stop();
      if (touchDragging()) endDrag(e.type === 'touchend');
    };
    const stop = () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return stop;
  }

  boardEl.addEventListener('pointerdown', e => {
    if (pointer) finishMissedRelease();
    const cardEl = e.target.closest('.card');
    if (!cardEl || !e.isPrimary || e.button !== 0) return;
    const r = cardEl.getBoundingClientRect();
    pointer = {
      cardId: cardEl.dataset.cardId,
      pointerId: e.pointerId,
      type: e.pointerType,
      startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY,
      offsetX: e.clientX - r.left, offsetY: e.clientY - r.top,
      width: r.width,
      active: false,
      holdTimer: null,
      stopTouch: null,
    };
    if (e.pointerType === 'touch') {
      pointer.stopTouch = watchTouch(cardEl);
      pointer.holdTimer = setTimeout(() => { if (pointer && !pointer.active) startDrag(); }, TOUCH_HOLD_MS);
    }
  });

  // The release can be lost (e.g. it happened outside the iframe and capture was not
  // honoured). Treat the drag as dropped where the pointer last was.
  function finishMissedRelease() {
    if (pointer && pointer.active && pointer.type !== 'touch') endDrag(true);
    else cancel();
  }

  document.addEventListener('pointermove', e => {
    const p = pointer;
    if (!p || e.pointerId !== p.pointerId || touchDragging()) return;
    if (p.type !== 'touch' && (e.buttons & 1) === 0) { finishMissedRelease(); return; }
    if (!p.active) {
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (p.type === 'touch') { if (dist > TOUCH_SLOP_PX) cancel(); return; }
      if (dist < DRAG_THRESHOLD_PX) return;
      startDrag();
      if (!pointer) return;
    }
    e.preventDefault();
    dragMove(e.clientX, e.clientY);
  });

  document.addEventListener('pointerup', e => {
    if (!pointer || e.pointerId !== pointer.pointerId) return;
    if (pointer.active) endDrag(true);
    else cancel();
  });

  document.addEventListener('pointercancel', e => {
    if (pointer && e.pointerId === pointer.pointerId && !touchDragging()) cancel();
  });

  boardEl.addEventListener('contextmenu', e => { if (pointer) e.preventDefault(); });
  // Native drag (text, links) would steal the pointer stream mid-drag.
  boardEl.addEventListener('dragstart', e => { if (e.target.closest?.('.card')) e.preventDefault(); });
  // Not `blur`: MCP hosts like ChatGPT move focus to their composer while the user is
  // still dragging inside the iframe, which used to cancel every drag.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pointer && pointer.active) { e.preventDefault(); cancel(); }
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });

  return { cancel };
}
