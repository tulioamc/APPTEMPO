// Toda tabela que o site carrega precisa de id e created_at: a leitura ordena por eles.
// (Uma tabela sem esses campos travava a atualização do site inteiro.)
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { load, ROOT } = require('./helpers');

test('toda tabela carregada tem id e created_at', () => {
  const m = load(['js/store.js', 'js/db-columns.js'], ['TABLES']);
  const cols = m.ctx.window.DB_COLUMNS;
  m.TABLES.forEach(t => {
    assert.ok(cols[t], `${t} sem colunas em db-columns.js`);
    assert.ok(cols[t].includes('id'), `${t} sem id`);
    assert.ok(cols[t].includes('created_at'), `${t} sem created_at`);
  });
});

test('o tempo_sync_state do schema cobre toda tabela carregada', () => {
  const m = load(['js/store.js'], ['TABLES']);
  const schema = fs.readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8');
  const fn = schema.slice(schema.indexOf('tempo_sync_state'));
  m.TABLES.forEach(t => assert.ok(fn.includes(`'${t}'`), `${t} fora do tempo_sync_state`));
});
