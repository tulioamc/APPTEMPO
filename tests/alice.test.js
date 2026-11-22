// Ciclo da Alice: mensagem curta marca o dia; longa vira aviso; fértil 10–20 dias depois; PM antes do próximo início.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/alice.js'], ['db', 'alReport', 'alDataDoTexto', 'aliceChipsHTML', 'alCiclos', 'alMapa'],
    { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  return m;
};
const ts = (s) => new Date(s).getTime() / 1000;
test('data da mensagem: "dia 20", "ontem", dd/mm ou o dia da mensagem', () => {
  const m = setup();
  assert.equal(m.alDataDoTexto('Menstruei dia 20', ts('2026-11-22T10:00')), '2026-11-20');
  assert.equal(m.alDataDoTexto('menstruei ontem', ts('2026-11-22T10:00')), '2026-11-21');
  assert.equal(m.alDataDoTexto('Menstruei 18/11', ts('2026-11-22T10:00')), '2026-11-18');
  assert.equal(m.alDataDoTexto('Menstruei', ts('2026-11-22T10:00')), '2026-11-22');
});
test('curta marca, longa pede confirmação; fértil e PM calculados', () => {
  const m = setup();
  m.alReport([{ id: 'a', ts: ts('2026-10-24T09:00'), tipo: 'M', curta: true, texto: 'Menstruei' },
              { id: 'b', ts: ts('2026-11-21T09:00'), tipo: 'M', curta: true, texto: 'Menstruei' },
              { id: 'c', ts: ts('2026-11-10T09:00'), tipo: 'C', curta: false }]);
  assert.ok(m.aliceChipsHTML('2026-11-21').includes('AL:M'));
  assert.equal(m.alCiclos().ciclo, 28);
  assert.ok(m.aliceChipsHTML('2026-12-03').includes('AL:F'));          // 21/11 + 12
  assert.ok(m.aliceChipsHTML('2026-12-17').includes('AL:PM'));         // próximo previsto 19/12
  assert.ok(!m.aliceChipsHTML('2026-11-22').includes('AL:PM'));
  assert.equal(m.db.all('tempo_notices').filter(n => n.kind === 'alice').length, 1);
  m.alReport([{ id: 'a', ts: ts('2026-10-24T09:00'), tipo: 'M', curta: true }]);   // repetida: ignora
  assert.equal(m.db.all('tempo_notices').filter(n => n.kind === 'alice').length, 1);
});
