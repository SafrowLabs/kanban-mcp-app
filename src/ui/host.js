// Bridge to an MCP Apps host (ChatGPT, Claude) when the board is rendered inside one.
// Does the handshake, reports the board's height so the host sizes the iframe, and
// follows the host's light/dark theme. Standalone (opened directly, not framed) it
// does nothing, so the board works the same everywhere.

import { App, applyDocumentTheme } from '@modelcontextprotocol/ext-apps/app-with-deps';

export function connectHost() {
  if (window.parent === window) return null;

  // Fixed board height while embedded: with height: 100% the document would always
  // match whatever height the host picks, so auto-resize would have nothing to report.
  document.documentElement.classList.add('embedded');

  const app = new App({ name: 'kanban', version: '1.0.0' }, {}, { autoResize: true });
  const applyTheme = ctx => { if (ctx?.theme) applyDocumentTheme(ctx.theme); };
  app.onhostcontextchanged = applyTheme;
  app.connect()
    .then(() => applyTheme(app.getHostContext()))
    .catch(() => { /* framed by something that is not an MCP Apps host */ });
  return app;
}
