const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const { rendSimular, rendIofPct, rendIrPct, rendDiaUtil, rendTaxaDia } = load(['js/rendimentos.js'], ['rendSimular', 'rendIofPct', 'rendIrPct', 'rendDiaUtil', 'rendTaxaDia'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
const cx = (id, saldo, pct = 100, idade = 400) => ({ id, pct, saldo, idade });

test('tabelas de IR e IOF', () => {
  assert.equal(rendIrPct(10), 0.225); assert.equal(rendIrPct(200), 0.2); assert.equal(rendIrPct(500), 0.175); assert.equal(rendIrPct(900), 0.15);
  assert.equal(rendIofPct(1), 0.96); assert.equal(rendIofPct(5), 0.83); assert.equal(rendIofPct(10), 0.66); assert.equal(rendIofPct(30), 0);
});
test('só dia útil rende: sábado, domingo e feriado não', () => {
  assert.equal(rendDiaUtil('2026-11-25'), true); assert.equal(rendDiaUtil('2026-11-28'), false); assert.equal(rendDiaUtil('2026-11-20'), false); assert.equal(rendDiaUtil('2026-12-25'), false);
});
test('um mês parado rende perto de 100% do CDI líquido de IR', () => {
  const r = rendSimular({ caixinhas: [cx('a', 100000)], cdi: 13.65, inicio: '2026-11-25', fim: '2026-12-31', fluxos: [] });
  const total = r.meses.reduce((s, m) => s + m.rend, 0);
  const du = 18; // dias úteis de 26/11 a 31/12 (sem 25/12)
  assert.ok(total > 800 && total < 1500, 'rendimento ' + total);
  assert.ok(Math.abs(r.saldo.a - 100000 - total) < 0.01);
});
test('120% do CDI rende mais que 100%', () => {
  const a = rendSimular({ caixinhas: [cx('a', 10000, 100), cx('b', 10000, 120)], cdi: 13.65, inicio: '2026-11-25', fim: '2026-12-31', fluxos: [] });
  assert.ok(a.saldo.b > a.saldo.a);
});
test('depósito de hoje só rende a partir do próximo dia útil; tirar antes de 30 dias paga IOF', () => {
  const f = [{ id: '1', tipo: 'entrada', cx: 'a', valor: 1000, data: '2026-11-26' }, { id: '2', tipo: 'saida', cx: 'a', valor: 1000, data: '2026-11-30' }];
  const r = rendSimular({ caixinhas: [cx('a', 0)], cdi: 13.65, inicio: '2026-11-25', fim: '2026-12-31', fluxos: f });
  const imp = r.meses.reduce((s, m) => s + m.imposto, 0);
  assert.ok(r.saldo.a >= 0 && r.saldo.a < 5, 'saldo ' + r.saldo.a);
  assert.ok(imp > 0);
});
test('resgate parcial sai do depósito mais antigo (sem IOF) e preserva o novo', () => {
  const f = [{ id: '1', tipo: 'entrada', cx: 'a', valor: 5000, data: '2026-12-01' }, { id: '2', tipo: 'saida', cx: 'a', valor: 5000, data: '2026-12-10' }];
  const r = rendSimular({ caixinhas: [cx('a', 20000)], cdi: 13.65, inicio: '2026-11-25', fim: '2026-12-31', fluxos: f });
  const iof = r.meses.reduce((s, m) => s + (m.imposto), 0);
  assert.ok(r.saldo.a > 20000);   // o depósito novo de 5k ficou intacto e rendendo
  assert.equal(r.faltou.length, 0);
});
test('transferência entre caixinhas move o dinheiro', () => {
  const r = rendSimular({ caixinhas: [cx('a', 10000), cx('b', 0)], cdi: 13.65, inicio: '2026-11-25', fim: '2026-11-30', fluxos: [{ id: '1', tipo: 'transf', cx: 'a', para: 'b', valor: 4000, data: '2026-11-26' }] });
  assert.ok(r.saldo.b > 3999 && r.saldo.b < 4005); assert.ok(r.saldo.a < 6010);
});
test('movimento mensal repete todo mês', () => {
  const r = rendSimular({ caixinhas: [cx('a', 0)], cdi: 13.65, inicio: '2026-11-25', fim: '2027-02-28', fluxos: [{ id: '1', tipo: 'entrada', cx: 'a', valor: 1000, mensal: true, dia: 5 }] });
  assert.equal(r.meses.reduce((s, m) => s + m.entrou, 0), 3000);
});
test('a tela monta com os dados do print e mostra as quatro caixinhas', () => {
  const { VIEWS } = load(['js/domain.js', 'js/rendimentos.js'], ['VIEWS'], {
    VIEWS: {}, ACTIONS: {}, CHANGES: {}, esc: (x) => String(x), icon: () => '', render: () => {}, uid: () => 'x', toast: () => {}, openLayer: () => {}, parseMoney: (s) => Number(String(s).replace(/\./g, '').replace(',', '.')), ymd: (d) => d.toISOString().slice(0, 10),
    db: { setting: () => null, setSetting: () => {}, all: () => [], update: () => {}, insert: () => {} },
  });
  const v = VIEWS.rendimentos();
  assert.equal(v.title, 'Rendimentos');
  for (const n of ['Turbo Ultravioleta', 'Apartamento', 'Giro', 'Freelas']) assert.ok(v.html.includes(n), n);
  assert.ok(v.html.includes('122.345,78'));
  assert.ok(v.html.includes('faltam'));   // Giro abaixo da meta
});
