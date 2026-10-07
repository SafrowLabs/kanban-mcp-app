// MCP server definition, shared by every entry point (HTTP, stdio).
// One tool, one UI resource. The tool tells the host (ChatGPT, Claude) to render the
// resource; the resource is dist/index.html, so the board itself still runs entirely
// in the host's sandboxed iframe. No file or network access here, so the same
// definition can run on Node or a fetch-native runtime.

import { McpServer } from '@modelcontextprotocol/server';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

export const BOARD_URI = 'ui://kanban/board.html';
export const SERVER_INFO = { name: 'kanban', version: '1.0.0' };

export function createKanbanServer(html) {
  const server = new McpServer(SERVER_INFO);

  registerAppTool(
    server,
    'show_kanban_board',
    {
      title: 'Show Kanban board',
      description:
        'Open the interactive Kanban board: columns, cards, labels, drag and drop, '
        + 'undo/redo, JSON export/import. Use when the user wants to plan, track or organise tasks '
        + 'on a board. The user edits the board directly; this tool only displays it.',
      annotations: { title: 'Show Kanban board', readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: BOARD_URI } },
    },
    async () => ({
      content: [{
        type: 'text',
        text: 'The Kanban board is open. The user can add, edit and drag cards directly in it.',
      }],
    }),
  );

  registerAppResource(
    server,
    'Kanban board',
    BOARD_URI,
    { description: 'Interactive Kanban board (self-contained HTML, no network access).' },
    async () => ({
      contents: [{
        uri: BOARD_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
        _meta: { ui: { prefersBorder: true } },
      }],
    }),
  );

  return server;
}
