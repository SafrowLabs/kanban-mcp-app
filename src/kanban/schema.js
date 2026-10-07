// Schema migration and invariant checks for stored or imported boards.
// Every board that enters the app from outside goes through parseBoard().

import { SCHEMA_VERSION, ID_PATTERN, LABEL_IDS } from './constants.js';

export function migrate(data) {
  if (data === null || typeof data !== 'object') throw new Error('This is not a board file.');
  if (data.version === SCHEMA_VERSION) return data;
  // Future: if (data.version === 1) data = migrateV1toV2(data); ...
  throw new Error(`Unsupported board version: ${String(data.version)}.`);
}

// Returns a clean copy containing only known fields, or throws.
export function validateBoard(data) {
  const fail = msg => { throw new Error(`Invalid board: ${msg}.`); };
  const isStr = v => typeof v === 'string';
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  if (!isObj(data)) fail('not an object');
  if (!isObj(data.board) || !isStr(data.board.title)) fail('missing board title');
  if (!Array.isArray(data.columnOrder) || !isObj(data.columns) || !isObj(data.cards)) fail('missing columns or cards');

  const columns = {};
  const cards = {};
  for (const colId of data.columnOrder) {
    if (!isStr(colId) || !ID_PATTERN.test(colId) || !has(data.columns, colId)) fail(`unknown column "${colId}"`);
    if (has(columns, colId)) fail(`column "${colId}" listed twice`);
    const col = data.columns[colId];
    if (!isObj(col) || col.id !== colId || !isStr(col.title) || !Array.isArray(col.cardIds)) fail(`bad column "${colId}"`);
    for (const cardId of col.cardIds) {
      if (!isStr(cardId) || !ID_PATTERN.test(cardId) || !has(data.cards, cardId)) fail(`column "${colId}" references unknown card "${cardId}"`);
      if (has(cards, cardId)) fail(`card "${cardId}" appears more than once`);
      const card = data.cards[cardId];
      if (!isObj(card) || card.id !== cardId || !isStr(card.title)) fail(`bad card "${cardId}"`);
      cards[cardId] = {
        id: cardId,
        title: card.title,
        description: isStr(card.description) ? card.description : '',
        labels: Array.isArray(card.labels) ? LABEL_IDS.filter(id => card.labels.includes(id)) : [],
        createdAt: isStr(card.createdAt) ? card.createdAt : '',
        updatedAt: isStr(card.updatedAt) ? card.updatedAt : '',
      };
    }
    // Older boards carried a per-column wipLimit; it is dropped on load.
    columns[colId] = { id: colId, title: col.title, cardIds: [...col.cardIds] };
  }
  if (Object.keys(data.columns).length !== data.columnOrder.length) fail('a column is missing from columnOrder');
  if (Object.keys(data.cards).length !== Object.keys(cards).length) fail('a card is not in any column');

  return {
    version: SCHEMA_VERSION,
    board: { title: data.board.title },
    columnOrder: [...data.columnOrder],
    columns,
    cards,
  };
}

export function parseBoard(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  return validateBoard(migrate(data));
}
