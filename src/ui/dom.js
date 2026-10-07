// Tiny DOM helpers. User text only ever goes in via textContent / text nodes, never innerHTML.

export const cls = (...names) => names.filter(Boolean).join(' ');

// h('div', { class, text, dataset, ...attributes }, ...children)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children.filter(c => c != null && c !== false)); // strings become text nodes
  return el;
}

// Elements that can hold focus carry data-focus-key so focus survives a re-render.
export function focusByKey(root, key, scroll = false) {
  const el = root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (!el) return null;
  el.focus({ preventScroll: true });
  if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return el;
}
