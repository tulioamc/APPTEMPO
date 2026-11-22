// Despesas por sessão: diarista R$ 160 por terça; ajuste só do mês; mês novo segue a regra geral.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
test('cobrança por sessão: conta do mês, ajuste só deste mês e mês novo', () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/table.js', 'js/notices.js', 'js/view-reimb.js', 'js/view-expenses.js'], ['db', 'exPorDiaValor', 'exPorDiaTxt', 'exCopyMonth'],
    { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  m.db.setSetting('exPorDia', { diarista: { dow: 2, valor: 160 } });
  const r = m.db.insert('tempo_expenses', { month: '2026-11', kind: 'out', name: 'Diarista', amount: null, status: 'Não pago' }, true);
  assert.equal(m.exPorDiaValor(r), 640); assert.match(m.exPorDiaTxt(r), /^4 terças × R\$\s160,00$/);
  m.db.setSetting('exSessaoMes', { [r.id]: { n: 3 } });
  assert.equal(m.exPorDiaValor(r), 480);
  m.exCopyMonth('2026-12', '2026-11');
  const dez = m.db.all('tempo_expenses').find(x => x.month === '2026-12');
  assert.equal(dez.amount_sug, 800); assert.equal(dez.note, '');
});
