// stdio entry point: Claude Desktop / Claude Code run this locally, no hosting needed.
// stdout carries the protocol, so log to stderr only.

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createKanbanServer } from './kanban.js';
import { loadBoardHtml } from './html.js';

const html = await loadBoardHtml();
serveStdio(() => createKanbanServer(html), {
  onerror: err => console.error('kanban mcp:', err),
});
