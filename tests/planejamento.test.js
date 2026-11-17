// Planejamento: horas que faltam distribuídas por prazo, até 8 h por dia útil, fora de almoço, fim de semana e feriado.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/planejamento.js'], ['db', 'planejar', 'planoProjetos', 'planoJanelas', 'VIEWS'],
    { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  return m;
};
test('distribui por prazo, 8 h por dia, pulando fim de semana e o almoço', () => {
  const m = setup();
  const p1 = { id: 'a', name: 'A', deadline: '2026-11-24' }, p2 = { id: 'b', name: 'B', deadline: '2026-11-19' };
  const hoje = new Date(2026, 10, 17, 9, 0);   // terça
  const { porDia } = m.planejar([{ p: p2, falta: 10, prazo: p2.deadline }, { p: p1, falta: 12, prazo: p1.deadline }], hoje);
  assert.equal(porDia['2026-11-17'].horas, 8);
  assert.deepEqual(porDia['2026-11-17'].blocos.map(b => b.pid), ['b', 'b']);   // manhã e tarde (almoço no meio)
  assert.ok(porDia['2026-11-17'].blocos.every(b => b.fim <= 12 || b.ini >= 14));
  const total = Object.values(porDia).reduce((s, d) => s + d.horas, 0);
  assert.ok(Math.abs(total - 22) < 0.01);
  assert.equal(porDia['2026-11-21'], undefined, 'sábado fora');
  assert.equal(porDia['2026-11-20'], undefined, 'feriado (Consciência Negra) fora');
});
test('segunda tem o bloco do Rafa; a tela abre', () => {
  const m = setup();
  const { jan } = m.planoJanelas('2026-11-23');
  assert.deepEqual(jan, [[9, 11.5], [14, 19]]);
  assert.ok(m.VIEWS.plano().html.includes('Semana de'));
});
