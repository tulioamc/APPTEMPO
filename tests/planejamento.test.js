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
test('bloco arrastado fica no horário escolhido e o resto se encaixa em volta', () => {
  const m = setup();
  const p1 = { id: 'a', name: 'A', deadline: '2026-11-30' }, p2 = { id: 'b', name: 'B', deadline: '2026-11-19' };
  m.db.setSetting('planoPins', [{ id: 'x', dia: '2026-11-17', pid: 'a', ini: 9, h: 2 }]);
  const { porDia } = m.planejar([{ p: p2, falta: 4, prazo: p2.deadline }, { p: p1, falta: 6, prazo: p1.deadline }], new Date(2026, 10, 17, 8, 0));
  const bl = porDia['2026-11-17'].blocos;
  assert.deepEqual([bl[0].pid, bl[0].ini, bl[0].fim, bl[0].pin], ['a', 9, 11, 'x']);
  assert.ok(bl.slice(1).every(b => b.fim <= 9 + 1e-9 || b.ini >= 11), 'o resto não passa por cima do bloco fixado');
  assert.ok(bl.slice(1).some(b => b.pid === 'b'));
});
test('horários fixos: jantar todo dia útil, Rafa seg/qua 19h e sexta alternada', () => {
  const m = setup();
  const nomes = (d) => m.planoJanelas(d).fixos.map(f => String(f[2]).startsWith('Buscar o Rafa') ? 'Buscar o Rafa' : f[2]);
  assert.ok(nomes('2026-11-18').includes('Buscar o Rafa') && nomes('2026-11-18').includes('Jantar'));   // quarta
  assert.ok(!nomes('2026-11-27').includes('Buscar o Rafa'));   // sexta sem referência
  m.db.setSetting('planoSextaRef', '2026-11-27');
  assert.ok(nomes('2026-11-27').includes('Buscar o Rafa'));
  assert.ok(!nomes('2026-12-04').includes('Buscar o Rafa'));
  assert.ok(nomes('2026-12-11').includes('Buscar o Rafa'));
});
test('visões Mês (calendário corrido) e Dia abrem, com eventos do Google Agenda ocupando a agenda', () => {
  const m = setup();
  m.db.setSetting('agendaEventos', [{ id: 'g1', ini: '2026-11-24T15:00:00-03:00', fim: '2026-11-24T16:00:00-03:00', titulo: 'Call Arruda', agenda: 'Trabalho' }]);
  const jan = m.planoJanelas('2026-11-24').jan;
  assert.ok(jan.every(([a, b]) => b <= 15 || a >= 16), 'evento do Google sai das janelas livres');
  m.db.setSetting('planoModo', 'mes');
  const mes = m.VIEWS.plano().html;
  assert.ok(mes.includes('pl-mes-rot') && mes.includes('Call Arruda'));
  m.db.setSetting('planoModo', 'dia');
  assert.ok(m.VIEWS.plano().html.includes('Projetos do dia'));
});

test('rotina: terça começa 5h30, academia separada, trabalho às 8h40; mudar um dia só e mudar de hoje em diante', () => {
  const m = setup();
  const fx = m.planoJanelas('2026-11-24').fixos.map(f => f[2]);
  assert.ok(fx.includes('Acordar e arrumar o Rafa') && fx.includes('Levar o Rafa à escola') && fx.includes('Academia'));
  assert.equal(m.planoJanelas('2026-11-24').jan[0][0], 8 + 40 / 60);
  m.db.setSetting('planoRotinaDia', { '2026-11-24': { academia: { ini: 9, fim: 10 } } });
  const ac = m.planoJanelas('2026-11-24').fixos.find(f => f[2] === 'Academia');
  assert.deepEqual([ac[0], ac[1]], [9, 10]);
  const ac2 = m.planoJanelas('2026-11-26').fixos.find(f => f[2] === 'Academia');
  assert.equal(ac2[0], 7 + 20 / 60, 'outro dia não muda');
});
