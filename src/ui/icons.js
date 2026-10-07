// Inline SVG icons and empty-state illustrations. Markup here is constant and trusted;
// user text never goes through this module. Icons use currentColor, so CSS colors them.

const ICONS = {
  logo: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M15 4v16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11m-5-5 5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V5m-5 5 5-5 5 5M4 20h16"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
};

const ILLUSTRATIONS = {
  // A tilted card with text lines and sparkles: "no cards yet".
  empty: `<g transform="rotate(-8 60 50)">
      <rect x="30" y="24" width="62" height="48" rx="9" fill="currentColor" fill-opacity=".16"/>
      <rect x="40" y="37" width="30" height="5" rx="2.5" fill="currentColor"/>
      <rect x="40" y="48" width="42" height="5" rx="2.5" fill="currentColor" fill-opacity=".55"/>
      <rect x="40" y="59" width="24" height="5" rx="2.5" fill="currentColor" fill-opacity=".55"/>
    </g>
    <path d="M100 8l2.4 5.6L108 16l-5.6 2.4L100 24l-2.4-5.6L92 16l5.6-2.4z" fill="currentColor"/>
    <path d="M18 64l1.8 4.2L24 70l-4.2 1.8L18 76l-1.8-4.2L12 70l4.2-1.8z" fill="currentColor" fill-opacity=".7"/>`,
  // A party popper with confetti: "nothing done yet, go finish something".
  celebrate: `<path d="M30 84 46 44l28 28z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
    <path d="M40 58c6 7 13 13 22 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M60 30l4-8M76 38l8-4M68 16l1-6M86 54l8 2M92 26l4-4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <circle cx="80" cy="20" r="3" fill="currentColor"/><circle cx="96" cy="42" r="3" fill="currentColor"/>
    <circle cx="54" cy="18" r="2.5" fill="currentColor" fill-opacity=".7"/>`,
};

function parse(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content.firstElementChild;
}

export function icon(name, className = 'icon') {
  return parse(`<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" `
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`);
}

export function illustration(name) {
  return parse(`<svg class="illustration" viewBox="0 0 120 96" aria-hidden="true" focusable="false">${ILLUSTRATIONS[name]}</svg>`);
}

// Static markup marks icon slots with <span data-icon="name">; fill them once at boot.
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(slot => {
    slot.replaceWith(icon(slot.dataset.icon, slot.className || 'icon'));
  });
}
