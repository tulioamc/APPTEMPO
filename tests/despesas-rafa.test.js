// Despesas Rafa (V2.06.191): gastos com etiqueta Rafa vêm do extrato; Amanda paga metade; mês pulado + quase o dobro = média.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
function setup(txns) {
  const m = load(['js/store.js', 'js/domain.js', 'js/view-shared.js'], ['db', 'skCalc', 'skData', 'skRecAdj'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', BANK: { every: txns } });
  m.db.data = m.db.empty(); return m;
}
const tx = (d, v, extra = {}) => ({ id: d + v, posted_on: d, amount: -v, flow: 'out', scope: 'externa', tag: 'Rafa', counterpart: 'ISAAC', category: 'Educação', ...extra });
test('transações com etiqueta Rafa entram e a Amanda paga metade', () => {
  const m = setup([tx('2026-09-03', 2588), tx('2026-09-10', 100, { tag: null })]);
  const c = m.skCalc({ months: {}, plan: {} }, '2026-09');
  assert.equal(c.total, 2588); assert.equal(c.due, 1294);
});
test('parte do Rafa no plano entra nos meses com pagamento da SulAmérica', () => {
  const m = setup([tx('2026-10-27', 2651.41, { tag: null, counterpart: 'SulAmérica', category: 'Saúde' })]);
  const c = m.skCalc({ months: {}, plan: { filho: 566.32, desde: '2026-10' } }, '2026-10');
  assert.equal(Math.round(c.total * 100), 56632); assert.equal(Math.round(c.due * 100), 28316);
});
test('Amanda pulou um mês e pagou quase o dobro no seguinte: divide entre os dois', () => {
  const m = setup([tx('2026-08-05', 2000), tx('2026-09-05', 2000)]);
  const d = { months: { '2026-08': { received: 0, extras: [] }, '2026-09': { received: 1900, extras: [] } }, plan: {} };
  assert.equal(m.skCalc(d, '2026-08').received, 950); assert.equal(m.skCalc(d, '2026-09').received, 950);
});
test('pagamento normal não é dividido', () => {
  const m = setup([tx('2026-08-05', 2000), tx('2026-09-05', 2000)]);
  const d = { months: { '2026-08': { received: 1000, extras: [] }, '2026-09': { received: 1000, extras: [] } }, plan: {} };
  assert.equal(m.skCalc(d, '2026-09').received, 1000);
});
test('plano: Rafa todo mês (dividido) e Amanda integral, acompanhando a cobrança da SulAmérica', () => {
  const sul = (d, v) => tx(d, v, { tag: null, counterpart: 'SUL AMERICA', category: 'Saúde' });
  const m = setup([sul('2026-02-02', 2370.94), sul('2026-10-01', 2651.41)]);
  const plan = { filho: 566.32, ela: 1042.55, base: 2651.41, desde: '2026-01' };
  const out = m.skCalc({ months: {}, plan }, '2026-10');        // mês de referência: valores cheios
  assert.equal(Math.round(out.total * 100), 56632); assert.equal(Math.round(out.due * 100), Math.round((566.32 / 2 + 1042.55) * 100));
  const fev = m.skCalc({ months: {}, plan }, '2026-03');       // sem pagamento em março: vale a cobrança de fevereiro
  assert.equal(Math.round(fev.total * 100), Math.round(566.32 * 2370.94 / 2651.41 * 100));
  assert.ok(fev.planEla > 900 && fev.planEla < 1042);
});
test('sem lançamento em Despesas, vale a transferência da Amanda no extrato', () => {
  const m = setup([{ id: 'a', posted_on: '2026-06-11', amount: 2360, flow: 'in', scope: 'externa', counterpart: 'Amanda Cabral de Godoy e Vasconcelos', category: 'Renda' }]);
  assert.equal(m.skCalc({ months: {}, plan: {} }, '2026-06', true).received, 2360);
  assert.equal(m.skCalc({ months: { '2026-06': { received: 1000, extras: [] } }, plan: {} }, '2026-06', true).received, 1000);
});
