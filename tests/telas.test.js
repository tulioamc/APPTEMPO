// As telas precisam abrir mesmo com o banco vazio: tabela que o app não carregou não pode derrubar a tela.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const ARQS = ['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/table.js', 'js/wa-contacts.js', 'js/view-registry.js', 'js/view-contacts.js'];
const setup = (tab = 'agencies') => {
  const m = load(ARQS, ['db', 'VIEWS', 'waTempoDoCliente'], { VIEWS: {}, ACTIONS: {}, CHANGES: {}, openBtn: () => '', S: { reg: { tab, q: '', arch: false }, contacts: { q: '' } } });
  m.db.data = m.db.empty();
  return m;
};
const TIPOS = [
  { id: 'cli', kind: 'wa_tipo', name: 'Cliente', color: 'green', category: 'trabalho', order: 0 },
  { id: 'age', kind: 'wa_tipo', name: 'Agência', color: 'blue', category: 'trabalho', order: 1 },
  { id: 'ami', kind: 'wa_tipo', name: 'Amigo', color: 'red', category: 'pausa', order: 7 },
];

test('Agências e clientes e Contatos abrem com o banco vazio', () => {
  ['agencies', 'clients'].forEach(tab => assert.ok(setup(tab).VIEWS.registry().html.includes('Clientes')));
  const html = setup().VIEWS.contacts().html;
  assert.ok(html.includes('Não classificados') && html.includes('Trabalho') && html.includes('Outros'));
});

test('Contatos: três blocos na ordem certa, cada um na ordem do WhatsApp', () => {
  const m = setup();
  m.db.data.tempo_status_options = TIPOS;
  m.db.data.tempo_wa_contacts = [
    { id: 'a', jid: 'a@x', name: 'Amiga Antiga', tipo_id: 'ami', last_at: '2026-11-16T10:00:00Z' },
    { id: 'b', jid: 'b@x', name: 'Cliente Velho', tipo_id: 'cli', last_at: '2026-11-10T12:00:00Z' },
    { id: 'c', jid: 'c@x', name: 'Cliente Hoje', tipo_id: 'cli', last_at: '2026-11-16T14:00:00Z' },
    { id: 'd', jid: 'd@x', name: 'Novo Sem Tipo', tipo_id: null, last_at: '2026-11-16T09:00:00Z' },
  ];
  const html = m.VIEWS.contacts().html;
  const pos = (t) => html.indexOf(t);
  assert.ok(pos('Novo Sem Tipo') < pos('Cliente Hoje'), 'não classificados vêm primeiro');
  assert.ok(pos('Cliente Hoje') < pos('Cliente Velho'), 'dentro do bloco, a última mensagem primeiro');
  assert.ok(pos('Cliente Velho') < pos('Amiga Antiga'), 'outros por último');
  assert.ok(html.includes('Marcar 1 como Amigo'));
  assert.ok(html.includes('2 sem cliente ou agência'));
});

test('Tempo de WhatsApp soma no cliente ligado ao contato', () => {
  const m = setup('clients');
  m.db.data.tempo_status_options = TIPOS;
  m.db.data.tempo_clients = [{ id: 'k1', name: 'Cliente X', agency_id: null }];
  m.db.data.tempo_wa_contacts = [{ id: 'c', jid: 'c@x', name: 'Fulana', tipo_id: 'cli', client_id: 'k1' }];
  m.db.data.tempo_settings = [{ key: 'actlog:2026-11-16', value: [
    { from: '2026-11-16T10:00:00Z', to: '2026-11-16T10:30:00Z', app: 'WhatsApp', doc: 'Fulana' },
    { from: '2026-11-16T11:00:00Z', to: '2026-11-16T11:10:00Z', app: 'WhatsApp', doc: 'Outra pessoa' },
  ] }];
  assert.equal(m.waTempoDoCliente('k1'), 30 * 60e3);
  assert.ok(m.VIEWS.registry().html.includes('WhatsApp'));
});
