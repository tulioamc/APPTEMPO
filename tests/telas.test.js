// As telas precisam abrir mesmo com o banco vazio: tabela que o app não carregou não pode derrubar a tela.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const ARQS = ['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/table.js', 'js/wa-contacts.js', 'js/view-registry.js'];
const setup = (tab) => {
  const m = load(ARQS, ['db', 'VIEWS'], { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: { reg: { tab, q: '', arch: false } } });
  m.db.data = m.db.empty();
  return m;
};

test('Agências e clientes abre em cada aba, com o banco vazio', () => {
  ['agencies', 'clients', 'wa'].forEach(tab => {
    const html = setup(tab).VIEWS.registry().html;
    assert.ok(html.includes('Contatos WhatsApp'), `aba ${tab} sem o botão de contatos`);
  });
});

test('Contatos do WhatsApp: tipo manda em "Conta como"', () => {
  const m = setup('wa');
  m.db.data.tempo_status_options = [
    { id: 'cli', kind: 'wa_tipo', name: 'Cliente', color: 'green', category: 'trabalho', order: 0 },
    { id: 'ami', kind: 'wa_tipo', name: 'Amigo', color: 'red', category: 'pausa', order: 7 },
  ];
  m.db.data.tempo_wa_contacts = [
    { id: 'c1', jid: '1@x', name: 'Fulano Cliente', tipo: 'amigo', tipo_id: 'cli' },
    { id: 'c2', jid: '2@x', name: 'Beltrano', tipo: 'amigo', tipo_id: 'ami' },
    { id: 'c3', jid: '3@x', name: 'Sem marcar', tipo: 'amigo', tipo_id: null },
  ];
  const html = m.VIEWS.registry().html;
  assert.ok(html.includes('Fulano Cliente') && html.includes('Sem marcar'));
  assert.equal((html.match(/Trabalho/g) || []).length, 1);   // só o cliente conta como trabalho
});

test('Contatos do WhatsApp: ordem do WhatsApp e filtro de novos', () => {
  const m = setup('wa');
  m.db.data.tempo_wa_contacts = [
    { id: 'a', jid: 'a@x', name: 'Antigo', tipo_id: 'cli', last_at: '2026-11-10T12:00:00Z' },
    { id: 'b', jid: 'b@x', name: 'De hoje', tipo_id: null, last_at: '2026-11-16T14:00:00Z' },
    { id: 'c', jid: 'c@x', name: 'Sem hora', tipo_id: null, last_at: null },
  ];
  const html = m.VIEWS.registry().html;
  assert.ok(html.indexOf('De hoje') < html.indexOf('Antigo') && html.indexOf('Antigo') < html.indexOf('Sem hora'));
  assert.ok(html.includes('2 novos') && html.includes('Marcar 2 sem tipo como Amigo'));
  m.ctx.S.reg.waNovos = true;
  const so = m.VIEWS.registry().html;
  assert.ok(!so.includes('Antigo') && so.includes('De hoje'));
});
