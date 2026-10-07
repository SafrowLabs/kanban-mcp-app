# Kanban Interactive App

A Kanban board that runs entirely in the browser — no API, no database.
Columns, cards, labels, drag and drop (mouse, touch, keyboard), undo/redo,
JSON export/import. State is saved to `localStorage` when the browser allows it.

A small MCP server (`server/`) serves the same board to ChatGPT and Claude as an
[MCP App](https://github.com/modelcontextprotocol/ext-apps): one tool, `show_kanban_board`,
whose UI resource is `dist/index.html`. The server has no state; the board still runs in
the chat's iframe.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173/src/  (unbundled ES modules)
npm run build        # -> dist/index.html  (one self-contained file)
npm start            # MCP server, Streamable HTTP: http://127.0.0.1:3000/mcp
npm run start:stdio  # MCP server over stdio (Claude Desktop / Claude Code)
npm test             # unit tests (node:test, no browser)
npm run test:e2e     # build + browser tests in headless Chrome
```

`dist/index.html` is the shippable app: open it straight from disk or embed it in an AI
chat interface. It makes no network requests. `src/` can't be opened from `file://`
because browsers block ES modules there — use `npm run dev`.

## Use in ChatGPT and Claude

Build first (`npm run build`); the server serves `dist/index.html` and reads it at startup,
so restart it after a rebuild.

**ChatGPT and claude.ai (remote)** need a public HTTPS URL.

```bash
ngrok http 3000                             # terminal 1 -> https://abc123.ngrok.app
HOST=:: ALLOWED_HOSTS=abc123.ngrok.app npm start   # terminal 2, with the ngrok host allowed
```

- ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode on → Create →
  URL `https://abc123.ngrok.app/mcp`, no auth. To ship it as a plugin, zip a folder with
  `plugin.json` and an `mcp.json` pointing at the deployed URL.
- claude.ai: Settings → Connectors → Add custom connector → same URL.

`HOST=::` listens on IPv4 and IPv6; ngrok connects to `localhost` as `[::1]`, so the
default `127.0.0.1` gives `ERR_NGROK_8012`. Free ngrok URLs change on every restart:
update `ALLOWED_HOSTS` each time, or the server answers `Invalid Host` (403).

For a permanent URL deploy to any Node host (Render, Fly, Railway) with
`HOST=0.0.0.0`, `PORT`, and `ALLOWED_HOSTS=<your domain>`.

| Env | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | listen port |
| `HOST` | `127.0.0.1` | bind address; `::` or `0.0.0.0` when exposed or deployed |
| `ALLOWED_HOSTS` | localhost | `Host` header allowlist (DNS rebinding guard) |
| `ALLOWED_ORIGINS` | localhost | `Origin` allowlist for browser clients; requests without `Origin` pass |

**Claude Desktop / Claude Code (local, no hosting)** run the stdio entry point:

```json
{
  "mcpServers": {
    "kanban": { "command": "node", "args": ["/absolute/path/to/kanban/server/stdio.js"] }
  }
}
```

Claude Code: `claude mcp add kanban -- node /absolute/path/to/kanban/server/stdio.js`.
The terminal can't render the board; the desktop and web apps can.

Inside a host the board connects through `src/ui/host.js`: it completes the MCP Apps
handshake, reports its height so the host sizes the iframe, and follows the host's
light/dark theme. `localStorage` may be blocked in the host's sandbox; the board then
shows "Not saved" and Export/Import is the backup.

## Structure

```
kanban/
├── manifest.json            app metadata: entry, icon, storage key
├── src/
│   ├── index.html           markup: header, board root, dialogs, live region
│   ├── style.css            tokens (light + dark), layout, column, card, dialog, drag states
│   ├── app.js               boot: load → store → wire UI → subscribe(render, save) → render
│   ├── kanban/              core — pure, no DOM, tested in Node
│   │   ├── constants.js     schema version, storage key, labels, default board
│   │   ├── board.js         queries: findColumnOf, clamp
│   │   ├── actions.js       action creators (make ids + timestamps)
│   │   ├── reducer.js       (state, action) → newState, all business rules
│   │   ├── schema.js        migrate + invariant checks for stored / imported boards
│   │   ├── store.js         state, dispatch, subscribe, undo/redo history
│   │   └── persistence.js   debounced localStorage save, load, export/import
│   └── ui/                  browser only
│       ├── dom.js           h() element builder, focus helpers
│       ├── board-ui.js      renderer: the only code that writes board DOM
│       ├── controls.js      toolbar + board clicks / add-card / add-column forms
│       ├── dialogs.js       card, column, and confirm dialogs
│       ├── drag.js          pointer + touch drag and drop
│       ├── keyboard.js      keyboard moves, arrow focus, shortcuts
│       ├── status.js        aria-live announcements, toasts, "Not saved" badge
│       ├── icons.js         inline SVG icons + empty-state illustrations
│       ├── theme.js         light / dark switch (remembered; follows OS / host until used)
│       └── host.js          MCP Apps host bridge: handshake, auto-resize, host theme
├── server/                  MCP server (Node)
│   ├── kanban.js            tool show_kanban_board + resource ui://kanban/board.html
│   ├── html.js              loads dist/index.html
│   ├── http.js              Streamable HTTP entry (ChatGPT, claude.ai)
│   └── stdio.js             stdio entry (Claude Desktop, Claude Code)
├── assets/
│   └── icons/kanban.svg
├── scripts/
│   ├── build.js             esbuild bundle + inline CSS/JS/icon → dist/index.html
│   └── serve.js             zero-dependency dev server
├── tests/
│   ├── reducer.test.js
│   ├── schema.test.js
│   ├── store.test.js
│   ├── persistence.test.js
│   └── e2e/
│       ├── board.e2e.js     headless Chrome against dist/index.html
│       └── host.e2e.js      board inside a minimal MCP Apps host (handshake, resize, theme)
├── dist/index.html          build output
├── package.json
└── README.md
```

## How it works

Data flows one way:

```
event → controller → dispatch(action) → reducer (pure) → store (history) → render + debounced save
```

- **Core vs UI.** `src/kanban/` never touches the DOM or reads time/randomness inside the reducer,
  so it runs and is tested in plain Node. Ids and timestamps come from `actions.js`.
- **Transient UI state** (drag preview, open forms, picked-up card) lives in a separate `ui`
  object, never in the store or undo history.
- **Rendering** is a full re-render per change; focus, typed input and scroll positions are
  carried across. User text is only ever set via `textContent`.
- **Persistence** is best effort: blocked or full storage → the app keeps running in memory and
  shows "Not saved". Export/Import is the reliable backup. Corrupt saved data is kept under
  `kanban:v1:corrupt` and a fresh board starts.
- **Touch** drags start after a 250 ms press-and-hold so swiping still scrolls; mouse and pen
  drags start after 5 px of movement so a click still opens the card.

## Keyboard

| Key | Action |
| --- | --- |
| `Space` on a card | pick up / drop |
| Arrow keys (card picked up) | move: ←/→ column, ↑/↓ position |
| `Esc` | cancel move, close dialog / input |
| Arrow keys (nothing picked up) | move focus between cards |
| `Enter` on a card | edit |
| `N` | new card in focused column |
| `Esc` in search | clear search |
| `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` | undo, redo |

## License

[MIT](LICENSE) © SafrowLabs
