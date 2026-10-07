// Light / dark switch. With no choice saved the board follows the OS (or the MCP host,
// see host.js); a click pins the opposite of what is showing and remembers it.

const KEY = 'kanban:theme';

export function createThemeToggle(button) {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const current = () => root.dataset.theme || (media.matches ? 'dark' : 'light');

  function apply(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }

  function sync() {
    const dark = current() === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') apply(saved);
  } catch { /* storage blocked: follow the OS */ }

  button.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* best effort */ }
  });
  media.addEventListener('change', sync);
  // The host bridge can also change data-theme; keep the button state in step.
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  sync();
}
