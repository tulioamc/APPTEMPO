// Planejamento: horas que faltam distribuídas por prazo, até 8 h por dia útil, fora de almoço, fim de semana e feriado.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/plano-seguro.js', 'js/planejamento.js', 'js/plano-extras.js', 'js/view-rafa.js'], ['db', 'planejar', 'planoProjetos', 'planoJanelas', 'planoEventos', 'planoFixosDoDia', 'rafaQuemAuto', 'rafaMarcar', 'VIEWS'],
    { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, statusCat: (id) => String(id || '').replace(/^s-/, '') || undefined, toast() {}, render() {}, go() {} });
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
  assert.ok(m.VIEWS.plano().html.includes('pl-semana-h'));
});
test('bloco arrastado fica no horário escolhido e o resto se encaixa em volta', () => {
  const m = setup();
  const p1 = { id: 'a', name: 'A', deadline: '2026-11-30' }, p2 = { id: 'b', name: 'B', deadline: '2026-11-19' };
  m.db.data.tempo_projects = [p1, p2];   // o bloco fixado só vale se o projeto existe (plano-seguro.js)
  m.db.setSetting('planoPins', [{ id: 'x', dia: '2026-11-17', pid: 'a', ini: 9, h: 2 }]);
  const { porDia } = m.planejar([{ p: p2, falta: 4, prazo: p2.deadline }, { p: p1, falta: 6, prazo: p1.deadline }], new Date(2026, 10, 17, 8, 0));
  const bl = porDia['2026-11-17'].blocos;
  assert.deepEqual([bl[0].pid, bl[0].ini, bl[0].fim, bl[0].pin], ['a', 9, 11, 'x']);
  assert.ok(bl.slice(1).every(b => b.fim <= 9 + 1e-9 || b.ini >= 11), 'o resto não passa por cima do bloco fixado');
  assert.ok(bl.slice(1).some(b => b.pid === 'b'));
});
test('rotina ligada ao Dias de Rafa: buscar o Rafa só em dia T; manhã de escola só depois de noite T', () => {
  const m = setup();
  const nomes = (d) => m.planoFixosDoDia(d).map(f => f[2]);
  m.rafaMarcar('2026-11-23', { who: 'T' });   // segunda T
  assert.ok(nomes('2026-11-23').includes('Buscar o Rafa na casa da mãe') && nomes('2026-11-23').includes('Jantar'));
  assert.ok(nomes('2026-11-24').includes('Acordar e arrumar o Rafa'), 'terça: manhã depois de noite T');
  assert.ok(!nomes('2026-11-26').includes('Acordar e arrumar o Rafa'), 'quinta sem T na quarta: sem manhã de escola');
  m.rafaMarcar('2026-11-27', { who: 'A' });
  assert.ok(!nomes('2026-11-27').includes('Buscar o Rafa na casa da mãe'));
  assert.equal(m.rafaQuemAuto('2026-11-25'), 'T'); assert.equal(m.rafaQuemAuto('2026-11-26'), 'A'); assert.equal(m.rafaQuemAuto('2026-11-28'), null);
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

test('rotina: terça depois de segunda T começa 5h30, academia separada, trabalho às 8h40; mudar um dia só', () => {
  const m = setup();
  m.rafaMarcar('2026-11-23', { who: 'T' }); m.rafaMarcar('2026-11-25', { who: 'T' });
  const fx = m.planoJanelas('2026-11-24').fixos.map(f => f[2]);
  assert.ok(fx.includes('Acordar e arrumar o Rafa') && fx.includes('Levar o Rafa à escola') && fx.includes('Academia'));
  assert.equal(m.planoJanelas('2026-11-24').jan[0][0], 8 + 40 / 60);
  m.db.setSetting('planoRotinaDia', { '2026-11-24': { academia: { ini: 9, fim: 10 } } });
  const ac = m.planoJanelas('2026-11-24').fixos.find(f => f[2] === 'Academia');
  assert.deepEqual([ac[0], ac[1]], [9, 10]);
  const ac2 = m.planoJanelas('2026-11-26').fixos.find(f => f[2] === 'Academia');
  assert.equal(ac2[0], 7 + 20 / 60, 'outro dia não muda');
});
test('to-do com hora aparece na agenda (30 min por padrão) mas não ocupa o plano; só com data vai para o topo do dia', () => {
  const m = setup();
  m.db.data.tempo_notices = [
    { id: 't1', kind: 'todo', status: 'open', title: 'Ligar pro contador', data: { due: '2026-11-24T15:00', semHora: false } },
    { id: 't2', kind: 'todo', status: 'open', title: 'Pagar DAS', data: { due: '2026-11-24T20:00', semHora: true } },
    { id: 't3', kind: 'todo', status: 'open', title: 'Ideia solta', data: {} },
  ];
  const ev = m.planoEventos('2026-11-24');
  const t1 = ev.find(e => e.id === 't1'), t2 = ev.find(e => e.id === 't2');
  assert.deepEqual([t1.ini, t1.fim, !!t1.diaTodo], [15, 15.5, false]);
  assert.equal(t2.diaTodo, true);
  assert.equal(t1.ocupa, false, 'to-do coexiste com as tarefas planejadas: não tira horário do plano');
  assert.ok(m.planoJanelas('2026-11-24').jan.some(([a, b]) => a <= 15 && b >= 15.5), 'o horário do to-do continua livre para o plano');
  m.db.setSetting('planoModo', 'dia');
  assert.ok(m.VIEWS.plano().html.includes('To-do sem data'));
});
test('bloco flexível acompanha o registro (almoço 12h–14h vira 12h40–13h50)', () => {
  const m = setup();
  const I = (h, mi) => new Date(2026, 10, 18, h, mi).toISOString();
  m.db.data.tempo_time_entries = [{ id: 'e1', project_id: 'p', segments: [{ s: I(9, 0), e: I(12, 40) }, { s: I(13, 50), e: I(18, 0) }] }];
  const al = m.planoFixosDoDia('2026-11-18').find(f => f[2] === 'Almoço');
  assert.ok(Math.abs(al[0] - (12 + 40 / 60)) < 1e-6 && Math.abs(al[1] - (13 + 50 / 60)) < 1e-6);
  assert.equal(al[3].real, true);
});
