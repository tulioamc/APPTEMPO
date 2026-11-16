// Camada de dados: fila de gravação (sem internet, recarregar, recusa do banco) e colunas do banco.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { load, ROOT } = require('./helpers');

function setup() {
  const net = { online: false }, log = [], toasts = [], server = new Map();
  const done = (fn) => Promise.resolve().then(() => net.online ? fn() : { status: 0, error: { message: 'TypeError: Failed to fetch' } });
  const from = () => ({
    insert: (b) => done(() => { if (server.has(b.id)) return { status: 409, error: { code: '23505', message: 'duplicate key value violates unique constraint "tempo_projects_pkey"' } }; if (b.name === 'RECUSA') return { status: 400, error: { message: 'check violation' } }; server.set(b.id, { ...b }); log.push('ins'); return { status: 201 }; }),
    update: (b) => ({ eq: (c, id) => done(() => { Object.assign(server.get(id) || {}, b); log.push('upd ' + JSON.stringify(b)); return { status: 204 }; }) }),
    delete: () => ({ eq: (c, id) => done(() => { server.delete(id); log.push('del'); return { status: 204 }; }) }),
  });
  const client = { from, rpc: async () => ({ data: null, error: { message: 'sem função' } }) };
  const m = load(['js/store.js', 'js/auth.js'], ['db', 'SupabaseAdapter', 'TABLES'], { toast: (t) => toasts.push(t) });
  m.ctx.window.DB_COLUMNS = { tempo_projects: ['id', 'name', 'x', 'created_at', 'updated_at'] };
  const novo = () => { const a = new m.SupabaseAdapter(client); m.db.adapter = a; return a; };
  m.db.data = m.db.empty();
  return { ...m, net, log, toasts, server, novo, wait: (ms = 30) => new Promise(r => setTimeout(r, ms)) };
}

test('sem internet: a alteração fica na fila, guardada no aparelho, e vai quando a rede volta', async () => {
  const t = setup(); const a = t.novo();
  const r = t.db.insert('tempo_projects', { name: 'a' });
  t.db.update('tempo_projects', r.id, { x: 1 }); t.db.update('tempo_projects', r.id, { x: 2 }); t.db.update('tempo_projects', r.id, { name: 'b' });
  await t.wait();
  assert.equal(t.server.size, 0);
  assert.equal(a.waiting, true);
  assert.equal(a.outbox.length, 2, 'alterações seguidas da mesma linha viram uma só');
  assert.equal(JSON.parse(t.ctx.localStorage.getItem('tempo-outbox-v1')).length, 2);
  clearTimeout(a.waitT);
  // "recarregar a página": um adapter novo lê a fila guardada e envia
  t.net.online = true; const b = t.novo(); await b.flush();
  assert.equal(b.outbox.length, 0);
  const row = t.server.get(r.id); assert.equal(row.name, 'b'); assert.equal(row.x, 2);
  assert.equal(t.ctx.localStorage.getItem('tempo-outbox-v1'), '[]');
});

test('reenvio de algo que já tinha chegado não vira erro', async () => {
  const t = setup(); t.net.online = true; const a = t.novo();
  const r = t.db.insert('tempo_projects', { name: 'a' }); await a.queue;
  a.outbox.push({ op: { k: 'insert', t: 'tempo_projects', id: r.id, body: { id: r.id, name: 'a' } } }); await a.pump();
  assert.equal(a.outbox.length, 0); assert.equal(t.server.size, 1);
});

test('recusa do banco: sai da fila, avisa e não trava as próximas gravações', async () => {
  const t = setup(); t.net.online = true; const a = t.novo();
  let erro = null;
  const p1 = a.insert('tempo_projects', { id: 'r1', name: 'RECUSA' }).catch(e => { erro = e.message; });
  const p2 = a.insert('tempo_projects', { id: 'r2', name: 'ok' });
  await p1; await p2; await t.wait();
  assert.match(erro, /check violation/); assert.equal(a.outbox.length, 0);
  assert.ok(t.server.has('r2')); assert.equal(t.toasts.length, 1);
});

test('refresh não troca o retrato local enquanto há alterações sem enviar', async () => {
  const t = setup(); const a = t.novo();
  t.db.insert('tempo_projects', { name: 'local' }); await t.wait();
  let buscou = false; a.fetchTables = async () => { buscou = true; return {}; };
  await t.db.refresh();
  assert.equal(buscou, false); assert.equal(t.db.all('tempo_projects').length, 1);
  clearTimeout(a.waitT);
});

test('refresh baixa só as tabelas que mudaram', async () => {
  const t = setup(); t.net.online = true; const a = t.novo();
  const estado = Object.fromEntries(t.TABLES.map(x => [x, '0|']));
  a.syncState = async () => ({ ...estado });
  const pedidos = []; a.fetchTables = async (list) => { pedidos.push([...list]); return Object.fromEntries(list.map(x => [x, x === 'tempo_clients' ? [{ id: 'c1' }] : []])); };
  await t.db.refresh(); assert.equal(pedidos[0].length, t.TABLES.length, 'primeira vez: tudo');
  await t.db.refresh(); assert.equal(pedidos.length, 1, 'nada mudou: não baixa nada');
  estado.tempo_clients = '1|1794800000';
  await t.db.refresh(); assert.deepEqual(pedidos[1], ['tempo_clients']);
  assert.equal(t.db.all('tempo_clients').length, 1);
});

test('toda coluna que o app grava existe no schema.sql', () => {
  const ctx = { window: {} }; new Function('window', fs.readFileSync(path.join(ROOT, 'js/db-columns.js'), 'utf8'))(ctx.window);
  const sql = fs.readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8').replace(/--[^\n]*/g, '');
  const faltando = [];
  for (const [tabela, cols] of Object.entries(ctx.window.DB_COLUMNS)) {
    const m = sql.match(new RegExp('create table if not exists (?:public\\.)?' + tabela + '\\s*\\(([\\s\\S]*?)\\n\\);', 'i'));
    if (!m) { faltando.push(tabela + ' (tabela)'); continue; }
    const extra = [...sql.matchAll(new RegExp('alter table (?:public\\.)?' + tabela + '\\s+add column if not exists\\s+("?\\w+"?)', 'gi'))].map(x => x[1]);
    const corpo = m[1] + ' ' + extra.join(' ') + ' ';
    cols.forEach(c => { if (!new RegExp('(^|[\\s,("])' + c + '("|\\s)').test(corpo)) faltando.push(tabela + '.' + c); });
  }
  assert.deepEqual(faltando, []);
});

test('toda tabela que o app sincroniza tem a lista de colunas (senão nada é salvo)', () => {
  const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'js/db-columns.js'), 'utf8'))(w);
  const { TABLES } = load(['js/store.js'], ['TABLES']);
  const semLista = [...TABLES].filter(t => t !== 'tempo_reminders' && !(w.DB_COLUMNS[t] || []).length);   // tempo_reminders guarda tudo em "data"
  assert.deepEqual(semLista, []);
});
