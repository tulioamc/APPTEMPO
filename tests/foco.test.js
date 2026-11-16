// Modo foco: ligar, encerrar (com registro), fim automático e aviso de cliente durante o foco.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

function setup() {
  const avisos = [], msgs = [];
  const m = load(['js/store.js', 'js/domain.js', 'js/foco.js'], ['db', 'focoLigar', 'focoDesligar', 'focoAtual', 'focoAbriu', 'focoAvisarClientes', 'focoBtnHTML'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', isMacApp: () => true,
      DEFAULT_PAUSE_APPS: ['WhatsApp'], DEFAULT_PAUSE_SITES: ['instagram'], notifyNative: (t, b) => avisos.push(t),
      waContato: () => null, waTipoNome: (c) => (c && c.tipo) || 'Amigo' });
  m.ctx.window.webkit = { messageHandlers: { tempo: { postMessage: (x) => msgs.push(x) } } };
  m.db.data = m.db.empty(); m.db.loaded = true;
  return { ...m, avisos, msgs };
}
test('ligar e encerrar: estado, aviso ao Mac e registro do foco', () => {
  const t = setup();
  t.focoLigar(90);
  const f = t.focoAtual();
  assert.ok(f); assert.equal(f.minutos, 90);
  assert.equal(t.msgs.at(-1).type, 'foco'); assert.ok(t.msgs.at(-1).ate); assert.deepEqual([...t.msgs.at(-1).apps], ['WhatsApp']);
  t.focoAbriu('WhatsApp');
  assert.equal(t.focoAtual().aberturas.length, 1);
  assert.match(t.focoBtnHTML(), /Foco · \d+ min/);
  t.focoDesligar('manual');
  assert.equal(t.focoAtual(), null);
  assert.equal(t.msgs.at(-1).ate, null, 'Mac recebe o desligar');
  const log = t.db.setting('focoLog', []);
  assert.equal(log.length, 1); assert.equal(log[0].motivo, 'manual'); assert.equal(log[0].aberturas.length, 1);
  assert.match(t.focoBtnHTML(), /Modo foco/);
});
test('mensagem de cliente avisa uma vez; amigo e mensagem já respondida não avisam', () => {
  const t = setup();
  t.focoLigar(60);
  const ini = Date.parse(t.focoAtual().inicio) / 1000;
  t.db.insert('tempo_wa_contacts', { jid: 'c1', name: 'Brenda', tipo: 'Cliente' }, true);
  t.db.insert('tempo_wa_contacts', { jid: 'a1', name: 'João', tipo: 'Amigo' }, true);
  t.db.insert('tempo_wa_contacts', { jid: 'g1', name: 'Agência X', tipo: 'Agência' }, true);
  const d = { conversas: [
    { jid: 'c1', name: 'Brenda', lastIn: ini + 60, lastOut: ini - 10 },
    { jid: 'a1', name: 'João', lastIn: ini + 60, lastOut: 0 },
    { jid: 'g1', name: 'Agência X', lastIn: ini + 30, lastOut: ini + 40 },   // você já respondeu
  ] };
  assert.equal(t.focoAvisarClientes(d), 1);
  assert.deepEqual(t.avisos, ['Brenda mandou mensagem']);
  assert.equal(t.focoAvisarClientes(d), 0, 'a mesma mensagem não avisa de novo');
});
test('sem foco ligado não avisa', () => {
  const t = setup();
  assert.equal(t.focoAvisarClientes({ conversas: [{ jid: 'c1', name: 'Brenda', lastIn: Date.now() / 1000 }] }), 0);
});
