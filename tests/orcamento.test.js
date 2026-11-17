// Conta do orçamento: hora × porte × mercado, duração, complexidade, reuniões, urgência, desconto, BV, imposto e total digitado.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const setup = () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/orcamento.js'], ['db', 'calcQuote', 'calcRate', 'precoBase', 'redistribuiHoras'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
  m.db.data = m.db.empty(); return m;
};
const ST = (o = {}) => ({ porte: 'medio', mercado: 'local', outro: false, lines: [{ h: 20 }], duracao: '', cx: 'simples', aprov: '', pedido: '', desc: '', descTipo: 'R$', alvo: null,
  nf: { on: false, pct: 9, inside: false }, bv: { on: false, pct: 10 }, ext: { on: false, items: [] }, ...o });
const perto = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≠ ${b}`);

test('valor-hora: 200 × porte × mercado (grande nacional = 450)', () => {
  const m = setup(); const pb = m.precoBase();
  perto(m.calcRate(ST({ porte: 'grande', mercado: 'nacional' }), pb), 450);
  perto(m.calcRate(ST({ porte: 'pequeno', mercado: 'local' }), pb), 170);
  perto(m.calcRate(ST({ outro: true, customRate: 120 }), pb), 120);
  // exemplo do doc: 20 h, grande de São Paulo = R$ 9.000
  perto(m.calcQuote(ST({ porte: 'grande', mercado: 'nacional' }), pb).total, 9000);
});
test('duração (mín. 30 s), complexidade e 1 h de reunião por aprovação', () => {
  const m = setup(); const pb = m.precoBase();
  assert.equal(m.calcQuote(ST({ duracao: 2, cx: 'padrao', aprov: 3 }), pb).h, 20 * 2 * 1.3 + 3);
  assert.equal(m.calcQuote(ST({ duracao: 0.2 }), pb).h, 10);
});
test('urgência = prazo fechado ÷ pedido, teto 2×', () => {
  const m = setup(); const pb = m.precoBase();   // 40 h = 5 dias
  const c = m.calcQuote(ST({ lines: [{ h: 40 }], pedido: 4 }), pb);
  assert.equal(c.fechado, 5); perto(c.urg, 1.25);
  const d = m.calcQuote(ST({ lines: [{ h: 40 }], pedido: 2 }), pb);
  assert.equal(d.urg, 2); assert.ok(d.semPrazo);
  assert.equal(m.calcQuote(ST({ lines: [{ h: 40 }], pedido: 10 }), pb).urg, 1);
});
test('desconto só na minha parte; BV e imposto por cima; terceirizado intacto', () => {
  const m = setup(); const pb = m.precoBase();   // 20 h × 230 = 4600
  const c = m.calcQuote(ST({ desc: 10, descTipo: '%', ext: { on: true, items: [{ value: 1000 }] }, bv: { on: true, pct: 10 }, nf: { on: true, pct: 10, inside: false } }), pb);
  perto(c.Mf, 4140); perto(c.C, 514); perto(c.total, (4140 + 1000 + 514) * 1.1);
  perto(c.horaEf, 207);
});
test('total digitado: só a minha parte se ajusta', () => {
  const m = setup(); const pb = m.precoBase();
  const c = m.calcQuote(ST({ alvo: 6600, ext: { on: true, items: [{ value: 1000 }] }, nf: { on: true, pct: 10, inside: false } }), pb);
  perto(c.total, 6600); perto(c.B, 1000); perto(c.Mf, 5000); perto(c.desc, 4600 - 5000);
});
test('total das etapas se espalha na proporção (6/18/6 → 8/24/8)', () => {
  const m = setup();
  assert.deepEqual(m.redistribuiHoras([{ h: 6 }, { h: 18 }, { h: 6 }], 40).map(x => x.h), [8, 24, 8]);
});

test('proposta abre com a calculadora; proposta antiga abre no simplificado', () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/table.js', 'js/view-projects.js', 'js/orcamento.js', 'js/view-tasks-quotes.js'], ['db', 'openQuote'],
    { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: { quote: { q: '', status: '' } }, openBtn: () => '' });
  m.db.data = m.db.empty(); m.db.loaded = true;
  let render = null;
  m.ctx.openLayer = (o) => { render = o.render; return { box: { addEventListener() {} }, refresh() {}, close() {} }; };
  m.openQuote(null);
  const html = render();
  assert.ok(html.includes('Com calculadora') && html.includes('Orçamento simplificado'));
  assert.ok(html.includes('Hora base') && html.includes('Etapas') && html.includes('Total final da proposta'));
  m.db.data.tempo_quotes = [{ id: 'q1', name: 'Antiga', value: 5000, est_hours: 20, calc: { computed: 5000, lines: [{ h: 20 }], contingency: 10 } }];
  m.openQuote('q1');
  const h2 = render();
  assert.ok(!h2.includes('Hora base') && h2.includes('Horas estimadas'), 'antiga abre no simplificado');
});
