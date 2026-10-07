// Streamable HTTP entry point: what ChatGPT and claude.ai connect to (remote MCP).
//
//   npm start                                  -> http://127.0.0.1:3000/mcp
//   HOST=0.0.0.0 ALLOWED_HOSTS=kanban.example.com npm start
//
// ALLOWED_HOSTS guards against DNS rebinding: requests whose Host header is not in the
// list get 403. It defaults to localhost only, so set it to your public hostname (or
// your ngrok domain) when exposing the server. Requests without an Origin header
// (ChatGPT, Claude) always pass the Origin check; browsers must match ALLOWED_ORIGINS.

import http from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, hostHeaderValidation, originValidation } from '@modelcontextprotocol/node';
import { createKanbanServer, SERVER_INFO } from './kanban.js';
import { loadBoardHtml } from './html.js';

const LOCALHOST = ['localhost', '127.0.0.1', '[::1]'];
const list = value => value?.split(',').map(s => s.trim()).filter(Boolean);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const allowedHosts = list(process.env.ALLOWED_HOSTS) ?? LOCALHOST;
const allowedOrigins = list(process.env.ALLOWED_ORIGINS) ?? LOCALHOST;

const html = await loadBoardHtml();
const mcp = toNodeHandler(createMcpHandler(() => createKanbanServer(html)));
const validateHost = hostHeaderValidation(allowedHosts);
const validateOrigin = originValidation(allowedOrigins);

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/' || pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...SERVER_INFO, mcp: '/mcp' }));
    return;
  }
  if (pathname !== '/mcp') { res.writeHead(404); res.end('Not found'); return; }
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  try {
    await mcp(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(port, host, () => {
  console.log(`Kanban MCP server: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/mcp`);
  console.log(`Allowed hosts: ${allowedHosts.join(', ')}`);
});
