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
