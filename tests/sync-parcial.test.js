// 27/11: a atualização baixa só as linhas novas/alteradas; se algo foi apagado (total não bate), baixa a tabela inteira.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const setup = () => { const m = load(['js/store.js'], ['db', 'TABLES'], { toast() {}, render() {} }); m.db.data = m.db.empty(); m.db.loaded = true; return m; };
const fake = (server, chamadas) => ({
  persistent: true, writes: 0,
  async syncState() { const o = {}; Object.keys(server).forEach(t => { const r = server[t]; o[t] = r.length + '|' + (r.length ? Math.max(...r.map(x => new Date(x.updated_at || x.created_at).getTime())) / 1000 : ''); }); return o; },
  async fetchTables(list) { chamadas.push('inteira:' + list.join(',')); const o = {}; list.forEach(t => { o[t] = server[t].map(r => ({ ...r })); }); return o; },
  async fetchSince(t, iso) { chamadas.push('parcial:' + t); return server[t].filter(r => new Date(r.updated_at || r.created_at) >= new Date(iso)).map(r => ({ ...r })); },
  loadAll() { return this.fetchTables(Object.keys(server)); },
});
test('só as linhas que mudaram vêm do banco; apagada força leitura inteira', async () => {
  const m = setup(); const ch = [];
  const server = {}; m.TABLES.forEach(t => { server[t] = []; });
  server.tempo_settings = [{ id: 'a', key: 'x', value: 1, created_at: '2026-11-27T10:00:00Z', updated_at: '2026-11-27T10:00:00Z' }, { id: 'b', key: 'y', value: 1, created_at: '2026-11-27T10:00:00Z', updated_at: '2026-11-27T10:00:00Z' }];
  m.db.adapter = fake(server, ch); m.db.unsent = () => false;
  await m.db.refresh();                       // primeira vez (sem assinatura antiga): inteira
  assert.equal(m.db.all('tempo_settings').length, 2);
  server.tempo_settings[1] = { ...server.tempo_settings[1], value: 2, updated_at: '2026-11-27T11:00:00Z' };
  server.tempo_settings.push({ id: 'c', key: 'z', value: 3, created_at: '2026-11-27T11:00:00Z', updated_at: '2026-11-27T11:00:00Z' });
  ch.length = 0; await m.db.refresh();
  assert.deepEqual(ch, ['parcial:tempo_settings']);
  assert.equal(m.db.all('tempo_settings').length, 3);
  assert.equal(m.db.all('tempo_settings').find(r => r.id === 'b').value, 2);
  server.tempo_settings = server.tempo_settings.filter(r => r.id !== 'a'); server.tempo_settings[0].updated_at = '2026-11-27T12:00:00Z';
  ch.length = 0; await m.db.refresh();
  assert.deepEqual(ch, ['parcial:tempo_settings', 'inteira:tempo_settings']);
  assert.deepEqual(m.db.all('tempo_settings').map(r => r.id).sort(), ['b', 'c']);
});
