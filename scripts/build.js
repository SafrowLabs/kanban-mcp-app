// Bundles src/ into one self-contained file: dist/index.html.
// CSS, JS and the favicon are inlined, so the result opens from file:// or inside an
// AI chat sandbox with no network requests and no server.

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = p => path.join(root, 'src', p);
const outFile = path.join(root, 'dist', 'index.html');

const bundle = await build({
  entryPoints: [src('app.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: process.argv.includes('--minify'),
  legalComments: 'eof', // keep bundled dependencies' license notices
  write: false,
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(src('style.css'), 'utf8');
const icon = await readFile(path.join(root, 'assets/icons/kanban.svg'), 'utf8');
let html = await readFile(src('index.html'), 'utf8');

// Use function replacers so `$` sequences in the inlined code are left alone.
function inline(pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`build: ${pattern} not found in src/index.html`);
  html = html.replace(pattern, () => replacement);
}
inline(/<link rel="stylesheet" href="style\.css">/, `<style>\n${css}</style>`);
inline(/<script type="module" src="app\.js"><\/script>/, `<script type="module">\n${js}</script>`);
inline(/href="\.\.\/assets\/icons\/kanban\.svg"/,
  `href="data:image/svg+xml,${encodeURIComponent(icon.trim())}"`);

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, html);
console.log(`built ${path.relative(root, outFile)} (${(html.length / 1024).toFixed(1)} KB)`);
