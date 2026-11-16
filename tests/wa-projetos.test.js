// WhatsApp de trabalho fora do cronômetro entra no projeto certo, sem contar duas vezes.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

test('WhatsApp fora do cronômetro vai para o projeto do cliente; dentro da sessão não conta de novo', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/wa-projetos.js'], ['db', 'waTempoProjetos', 'waMsDoProjeto', 'effectiveRateComWa'],
    { waContato: () => null, waEhTrabalho: (c) => !!c && c.trabalho, entryMs: () => 0 });
  const { db } = m; db.data = db.empty(); db.loaded = true;
  const cli = db.insert('tempo_clients', { name: 'Brenda' }, true);
  const outro = db.insert('tempo_clients', { name: 'Outro' }, true);
  const p = db.insert('tempo_projects', { name: 'ID', client_id: cli.id, budget: 1000 }, true);
  const q = db.insert('tempo_projects', { name: 'X', client_id: outro.id }, true);
  const g = db.insert('tempo_projects', { name: 'Grupo', client_id: outro.id }, true);
  db.insert('tempo_time_entries', { project_id: p.id, segments: [{ s: '2026-11-16T13:00:00Z', e: '2026-11-16T14:00:00Z' }] }, true);
  db.insert('tempo_time_entries', { project_id: q.id, segments: [{ s: '2026-11-16T16:00:00Z', e: '2026-11-16T16:30:00Z' }] }, true);
  db.insert('tempo_wa_contacts', { jid: '1', name: 'Brenda', client_id: cli.id, trabalho: true }, true);
  db.insert('tempo_wa_contacts', { jid: '2', name: 'Amigo', trabalho: false }, true);
  db.insert('tempo_wa_contacts', { jid: '3', name: 'Grupo do projeto', project_id: g.id, trabalho: true }, true);
  db.setSetting('actlog:2026-11-16', [
    { app: 'WhatsApp', doc: 'Brenda', from: '2026-11-16T13:30:00Z', to: '2026-11-16T13:35:00Z' },   // dentro da sessão: já está nas horas
    { app: 'WhatsApp', doc: 'Brenda', from: '2026-11-16T17:00:00Z', to: '2026-11-16T17:10:00Z' },   // fora: 10 min para o projeto da Brenda
    { app: 'WhatsApp', doc: 'Amigo', from: '2026-11-16T18:00:00Z', to: '2026-11-16T18:30:00Z' },    // amigo: não conta
    { app: 'WhatsApp', doc: 'Grupo do projeto', from: '2026-11-16T19:00:00Z', to: '2026-11-16T19:05:00Z' },
  ]);
  assert.equal(m.waMsDoProjeto(p.id), 10 * 6e4);
  assert.equal(m.waMsDoProjeto(q.id), 0, 'projeto de outro cliente não recebe');
  assert.equal(m.waMsDoProjeto(g.id), 5 * 6e4, 'grupo ligado ao projeto vai direto');
  assert.equal(m.waTempoProjetos().sem, 0);
  assert.ok(m.effectiveRateComWa(p) > 0);
});
