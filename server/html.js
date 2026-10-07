// Loads the built board (dist/index.html) for the Node entry points.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DIST_HTML = path.join(root, 'dist', 'index.html');

export async function loadBoardHtml() {
  try {
    return await readFile(DIST_HTML, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`${path.relative(process.cwd(), DIST_HTML)} not found. Run \`npm run build\` first.`);
    }
    throw err;
  }
}
