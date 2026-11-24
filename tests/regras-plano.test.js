// Regras combinadas do planejamento (Calendário), uma por teste, numa semana sem feriado (14 a 18/12/2026)
// e com rotina controlada: almoço 12h–14h (maleável), buscar o Rafa qua 19h–20h (inegociável), jantar 20h–21h (maleável).
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/plano-seguro.js', 'js/planejamento.js', 'js/plano-extras.js', 'js/view-rafa.js', 'js/tarefas-prazo.js'],
    ['db', 'tkMotor', 'reunioesVincular'], { statusCat: (id) => String(id || '').replace(/^s-/, '') || undefined, VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  const st = (cat) => ({ id: 's-' + cat, kind: 'work', category: cat, name: cat });
  m.db.data.tempo_status_options = [st('todo'), st('active'), st('done')];
  m.db.data.tempo_projects = [{ id: 'a', name: 'A', status_id: 's-active', archived: false }, { id: 'b', name: 'B', status_id: 's-active', archived: false }];
  return m;
};
const R = (grupo, ini, fim, dias, pin) => ({ id: grupo, grupo, nome: grupo, ini, fim, dias, repete: 'semanal', desde: '2000-01-01', ate: null, rafa: '', flex: false, pin });
const ROTINA = [R('almoco', 12, 14, [1, 2, 3, 4, 5], false), R('rafa', 19, 20, [3], true), R('jantar', 20, 21, [1, 2, 3, 4, 5], false)];
const T = (id, pid, x = {}) => ({ id, project_id: pid, parent_id: null, name: id, status_id: 's-todo', owner: 'Tulio', depends_on: [], order: 0, ...x });
const cfg = (m, { tasks, pins = [], entries = [], extra = [] }) => {
  m.db.data.tempo_tasks = tasks; m.db.data.tempo_time_entries = entries;
  m.db.data.tempo_settings = [{ id: 'r', key: 'planoRotina', value: ROTINA }, { id: 'p', key: 'planoPins', value: pins }, ...extra];
  m.db.ver = (m.db.ver || 0) + 1;
};
const H = (d, h) => new Date(2026, 11, d, Math.floor(h), Math.round((h % 1) * 60));
const seg = (d, a, b) => ({ s: H(d, a).toISOString(), e: H(d, b).toISOString() });
const bl = (mo, id) => mo.itens[id].blocos.map(b => [b.dia.slice(8), b.ini, b.fim]);
const horas = (l) => l.reduce((t, b) => t + b[2] - b[1], 0);

test('1. o plano de hoje não anda com o relógio (9h e 17h dão o mesmo plano)', () => {
  const m = setup(); cfg(m, { tasks: [T('x', 'a', { est_min: 180 }), T('y', 'a', { est_min: 120, order: 1 })] });
  const cedo = m.tkMotor(H(14, 9), 10); const a = [bl(cedo, 'x'), bl(cedo, 'y')];
  m.db.ver++; const tarde = m.tkMotor(H(14, 17), 10);
  assert.deepEqual([bl(tarde, 'x'), bl(tarde, 'y')], a);
  assert.deepEqual(a[0], [['14', 9, 12]]);
});
test('2. registrado de outra tarefa corre em paralelo; registrado da própria tarefa hoje não mexe no plano de hoje', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 180 }), T('z', 'b', { est_min: 600, order: 5 })], entries: [{ id: 'e1', project_id: 'b', task_id: 'z', segments: [seg(14, 9, 12)] }, { id: 'e2', project_id: 'a', task_id: 'x', segments: [seg(14, 14, 15)] }] });
  const mo = m.tkMotor(H(14, 18), 10);
  assert.deepEqual(bl(mo, 'x'), [['14', 9, 12]]);
});
test('3. tarefa inteira: só rotina, compromisso e fim do dia dividem (o almoço divide)', () => {
  const m = setup(); cfg(m, { tasks: [T('x', 'a', { est_min: 300 })] });
  assert.deepEqual(bl(m.tkMotor(H(14, 8), 10), 'x'), [['14', 9, 12], ['14', 14, 16]]);
});
test('4. limite de 8 h por dia quando há folga até a entrega', () => {
  const m = setup(); cfg(m, { tasks: [T('x', 'a', { est_min: 360 }), T('y', 'b', { est_min: 360, order: 1 })] });
  const mo = m.tkMotor(H(14, 8), 10);
  const dia14 = [...bl(mo, 'x'), ...bl(mo, 'y')].filter(b => b[0] === '14');
  assert.ok(horas(dia14) <= 8 + 1e-9, `dia 14 com ${horas(dia14)} h`);
});
test('5. fim do dia: sobra de até 1 h termina no mesmo dia; mais que isso vai para o próximo', () => {
  const m = setup(); cfg(m, { tasks: [T('x', 'a', { est_min: 540 })], extra: [{ id: 'c', key: 'planoCfg', value: { horasDia: 10 } }] });
  let l = bl(m.tkMotor(H(14, 8), 10), 'x');
  assert.ok(l.every(b => b[0] === '14'), JSON.stringify(l));   // 9–12 + 14–19 = 8 h; sobra 1 h → estica até 20h
  cfg(m, { tasks: [T('x', 'a', { est_min: 600 })], extra: [{ id: 'c', key: 'planoCfg', value: { horasDia: 10 } }] });
  l = bl(m.tkMotor(H(14, 8), 10), 'x');
  assert.equal(horas(l.filter(b => b[0] === '14')), 8, JSON.stringify(l)); assert.ok(l.some(b => b[0] === '15'));
});
test('6. dependência: quem espera nunca começa antes de a outra terminar', () => {
  const m = setup(); cfg(m, { tasks: [T('x', 'a', { est_min: 120, order: 1, depends_on: ['w'] }), T('w', 'a', { est_min: 240 })] });
  const mo = m.tkMotor(H(14, 8), 10);
  assert.deepEqual(bl(mo, 'w'), [['14', 9, 12], ['14', 14, 15]]); assert.deepEqual(bl(mo, 'x'), [['14', 15, 17]]);
});
test('7. rotina inegociável nunca é usada; maleável só quando a tarefa não cabe até a entrega', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 360, deadline: '2026-12-16', deadline_time: '15:00' })] });
  let l = bl(m.tkMotor(H(16, 8), 10), 'x'); assert.deepEqual(l, [['16', 9, 15]], 'passa pelo almoço (maleável)');
  cfg(m, { tasks: [T('x', 'a', { est_min: 120, deadline: '2026-12-16', deadline_time: '20:00' })], pins: [] });
  // qua 17h: 2 h até as 20h só caberia por cima do Rafa (inegociável) → não usa; usa 17–19 e avisa nada
  l = bl(m.tkMotor(H(16, 8), 10), 'x'); assert.ok(l.every(b => !(b[1] < 20 && b[2] > 19)), JSON.stringify(l));
});
test('8. bloco fixado: fica onde você pôs; se maior que a tarefa, encolhe e a próxima encosta', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 60 }), T('y', 'a', { est_min: 60, order: 1, depends_on: ['x'] })], pins: [{ id: 'p', dia: '2026-12-15', pid: 'a', tid: 'x', ini: 10, h: 3 }] });
  const mo = m.tkMotor(H(14, 8), 10);
  assert.deepEqual(bl(mo, 'x'), [['15', 10, 11]]); assert.deepEqual(bl(mo, 'y'), [['15', 11, 12]]); assert.equal(mo.pinsSobra.length, 0);
});
test('9. pedaços soltos da mesma tarefa encostam no bloco que você puxou (somem dos outros dias)', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 600 })], pins: [{ id: 'p', dia: '2026-12-16', pid: 'a', tid: 'x', ini: 9, h: 1 }] });
  const l = bl(m.tkMotor(H(14, 8), 10), 'x');
  assert.ok(l.every(b => b[0] >= '16'), JSON.stringify(l)); assert.deepEqual(l[0], ['16', 9, 10]); assert.deepEqual(l[1], ['16', 10, 12]);
});
test('10. preencher buracos: tarefa sem espera que cabe num horário livre mais cedo vai para lá', () => {
  const m = setup();
  cfg(m, { tasks: [T('w', 'a', { est_min: 60 }), T('x', 'a', { est_min: 120, order: 1, depends_on: ['w'] }), T('y', 'b', { est_min: 60, order: 2 })],
    pins: [{ id: 'p', dia: '2026-12-14', pid: 'a', tid: 'x', ini: 14, h: 2 }] });
  const mo = m.tkMotor(H(14, 8), 10);
  const y = bl(mo, 'y')[0]; assert.equal(y[0], '14'); assert.ok(y[2] <= 14 || y[1] >= 16, JSON.stringify(y));
});
test('11. nada antes do expediente, no passado, no fim de semana ou em tarefa de outra pessoa', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 3000 }), T('o', 'b', { est_min: 600, owner: 'Fulano' })] });
  const mo = m.tkMotor(H(16, 8), 20);
  const l = bl(mo, 'x');
  assert.ok(l.every(b => b[0] >= '16' && b[1] >= 9 - 1e-9), 'nada antes de qua 9h');
  assert.ok(!l.some(b => b[0] === '19' || b[0] === '20'), 'fim de semana fora');
  assert.equal(mo.itens.o.blocos.length, 0, 'tarefa de outra pessoa não ocupa sua agenda');
});
test('12. nunca dois blocos no mesmo horário (com fixados e soltos misturados)', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 300 }), T('y', 'b', { est_min: 240, order: 1 }), T('z', 'a', { est_min: 180, order: 2 })],
    pins: [{ id: 'p1', dia: '2026-12-14', pid: 'b', tid: 'y', ini: 10, h: 1 }, { id: 'p2', dia: '2026-12-15', pid: 'a', tid: 'z', ini: 9, h: 1 }] });
  const mo = m.tkMotor(H(14, 8), 10);
  const todos = ['x', 'y', 'z'].flatMap(id => bl(mo, id).map(b => [id, ...b]));
  todos.forEach((a, i) => todos.slice(i + 1).forEach(b => assert.ok(!(a[1] === b[1] && a[2] < b[3] - 1e-6 && b[2] < a[3] - 1e-6), `${a} × ${b}`)));
});
test('13. caso real (24/11): KV Curitiba fixado às 18h45 depois do KV Rio registrado — fica no lugar, sem sobra e sem pular de dia', () => {
  const m = setup();
  cfg(m, { tasks: [T('rio', 'a', { deadline: '2026-12-16' }), T('cur', 'a', { est_min: 120, deadline: '2026-12-16', deadline_time: '19:45', depends_on: ['rio'], order: 1 }), T('ooh', 'a', { est_min: 120, depends_on: ['cur'], order: 2 })],
    entries: [{ id: 'e', project_id: 'a', task_id: 'rio', segments: [seg(16, 9.25, 11.85), seg(16, 15, 15.6), seg(16, 18, 18.65)] }],
    pins: [{ id: 'P', dia: '2026-12-16', pid: 'a', tid: 'cur', ini: 17, h: 2 }] });
  const mo = m.tkMotor(H(16, 18.8), 10);
  assert.deepEqual(bl(mo, 'cur'), [['16', 17, 19]]); assert.equal(mo.pinsSobra.length, 0);
  assert.ok(bl(mo, 'ooh').every(b => b[0] > '16'), 'OOHs depois (o Rafa às 19h é inegociável)');
});
test('14. dois blocos fixados da mesma tarefa em dias diferentes: os dois ficam; o resto encosta no último', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 300 })], pins: [{ id: 'p1', dia: '2026-12-14', pid: 'a', tid: 'x', ini: 15, h: 1 }, { id: 'p2', dia: '2026-12-16', pid: 'a', tid: 'x', ini: 9, h: 1 }] });
  const l = bl(m.tkMotor(H(14, 8), 10), 'x');
  assert.deepEqual(l[0], ['14', 15, 16]); assert.deepEqual(l[1], ['16', 9, 10]); assert.deepEqual(l.slice(2), [['16', 10, 12], ['16', 14, 15]]);
});
test('15. conta de "e se" (prévia ao arrastar) não mexe no plano de verdade nem no cache', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 120 }), T('y', 'a', { est_min: 120, order: 1 })] });
  const real = bl(m.tkMotor(H(14, 8), 10), 'y');
  const pv = m.tkMotor(H(14, 8), 10, { pins: [{ id: '__pv', dia: '2026-12-14', pid: 'a', tid: 'x', ini: 15, h: 2 }] });
  assert.deepEqual(bl(pv, 'y'), [['14', 9, 11]], 'na prévia, y ocupa o lugar que x deixou');
  assert.deepEqual(bl(m.tkMotor(H(14, 8), 10), 'y'), real, 'o plano de verdade continua igual');
});
test('16. cada bloco diz por que está ali (espera, fila, fixado, continuação)', () => {
  const m = setup();
  cfg(m, { tasks: [T('w', 'a', { est_min: 60, deadline: '2026-12-18' }), T('x', 'a', { est_min: 60, order: 1, depends_on: ['w'], deadline: '2026-12-18' }), T('y', 'b', { est_min: 60, order: 2, deadline: '2026-12-18' }), T('z', 'b', { est_min: 180, order: 3, deadline: '2026-12-18' })],
    pins: [{ id: 'pz', dia: '2026-12-15', pid: 'b', tid: 'z', ini: 9, h: 1 }] });
  const mo = m.tkMotor(H(14, 8), 10); const todos = Object.values(mo.porDia).flatMap(v => v.blocos);
  const de = (tid) => todos.filter(b => b.tid === tid).map(b => b.porque);
  assert.match(de('x')[0], /Espera “w” terminar/);
  assert.match(de('z')[0], /Você fixou/); assert.equal(de('z').length, 1, 'o pedaço que continua cola no fixado e vira um bloco só');
  assert.ok(de('w')[0] && de('y')[0]);
});
test('17. almoço encolheu: o pedaço fixado de trás da mesma tarefa sobe e ocupa o tempo livre (sem pular outra tarefa)', () => {
  const m = setup();
  cfg(m, { tasks: [T('x', 'a', { est_min: 240 })], pins: [{ id: 'p1', dia: '2026-12-17', pid: 'a', tid: 'x', ini: 8.75, h: 2.75 }, { id: 'p2', dia: '2026-12-17', pid: 'a', tid: 'x', ini: 13.5, h: 0.25 }],
    extra: [{ id: 'rd', key: 'planoRotinaDia', value: { '2026-12-17': { almoco: { ini: 12.5, fim: 13.5 } } } }] });
  const l = bl(m.tkMotor(H(14, 8), 10), 'x');
  assert.ok(l.every(b => b[2] <= 12.5 + 1e-6 || b[1] >= 13.5 - 1e-6), 'nada no almoço');
  assert.equal(horas(l.filter(b => b[1] >= 11.5 - 1e-6 && b[2] <= 12.5 + 1e-6)), 1, 'o horário livre 11h30–12h30 foi ocupado: ' + JSON.stringify(l));
  cfg(m, { tasks: [T('x', 'a', { est_min: 240 }), T('y', 'b', { est_min: 30 })], pins: [{ id: 'p1', dia: '2026-12-17', pid: 'a', tid: 'x', ini: 8.75, h: 2.75 }, { id: 'p2', dia: '2026-12-17', pid: 'a', tid: 'x', ini: 13.5, h: 0.25 }, { id: 'py', dia: '2026-12-17', pid: 'b', tid: 'y', ini: 11.5, h: 0.5 }],
    extra: [{ id: 'rd', key: 'planoRotinaDia', value: { '2026-12-17': { almoco: { ini: 12.5, fim: 13.5 } } } }] });
  assert.ok(bl(m.tkMotor(H(14, 8), 10), 'x').some(b => b[1] === 13.5), 'com outra tarefa fixada no meio, não pula por cima dela');
});
test('18. colou outra tarefa depois do almoço: o pedaço da tarefa empurrado para depois dela volta a encostar no bloco da manhã', () => {
  const m = setup();
  cfg(m, { tasks: [T('arg', 'a', { est_min: 240 }), T('proc', 'b', { est_min: 180, order: 1 })],
    pins: [{ id: 'p1', dia: '2026-12-17', pid: 'a', tid: 'arg', ini: 8.75, h: 2.75 }, { id: 'pp', dia: '2026-12-17', pid: 'b', tid: 'proc', ini: 13.5, h: 3 }, { id: 'p2', dia: '2026-12-17', pid: 'a', tid: 'arg', ini: 16.5, h: 0.25 }],
    extra: [{ id: 'rd', key: 'planoRotinaDia', value: { '2026-12-17': { almoco: { ini: 12.75, fim: 13.5 } } } }] });
  const mo = m.tkMotor(H(14, 8), 10); const l = bl(mo, 'arg');
  assert.ok(l.every(b => b[2] <= 12.75 + 1e-6), 'a ARG toda antes do almoço: ' + JSON.stringify(l));
  assert.equal(horas(l), 4);
  assert.deepEqual(bl(mo, 'proc'), [['17', 13.5, 16.5]]);
});
test('19. "sem pressa": vai depois de todas as outras; com entrega perto (2 dias úteis), volta à ordem normal', () => {
  const m = setup();
  cfg(m, { tasks: [T('calma', 'a', { est_min: 120, sem_pressa: true }), T('x', 'b', { est_min: 120, order: 1, deadline: '2026-12-22' }), T('y', 'b', { est_min: 120, order: 2 })] });
  let mo = m.tkMotor(H(14, 8), 10);
  const ini = (id) => { const b = mo.itens[id].blocos[0]; return b.dia + String(b.ini).padStart(5, '0'); };
  assert.ok(ini('calma') > ini('x') && ini('calma') > ini('y'), 'sem pressa por último');
  assert.match(Object.values(mo.porDia).flatMap(v => v.blocos).find(b => b.tid === 'calma').porque, /sem pressa/);
  cfg(m, { tasks: [T('calma', 'a', { est_min: 120, sem_pressa: true, deadline: '2026-12-16' }), T('x', 'b', { est_min: 120, order: 1, deadline: '2026-12-22' })] });
  mo = m.tkMotor(H(14, 8), 10);
  assert.ok(ini('calma') < ini('x'), 'entrega perto: entra antes da que vence depois');
});
test('20. reunião sem tarefa entra na tarefa fixa "Reuniões" do projeto (criada sozinha), que fica fora do planejamento', () => {
  const m = setup();
  m.db.data.tempo_work_types = [{ id: 'wr', name: 'Reunião' }, { id: 'wd', name: 'Direção de arte' }];
  cfg(m, { tasks: [T('x', 'a', { est_min: 60 })], entries: [{ id: 'e1', project_id: 'a', task_id: null, work_type_id: 'wr', segments: [seg(14, 9, 10)] }, { id: 'e2', project_id: 'a', task_id: null, work_type_id: 'wd', segments: [seg(14, 10, 11)] }] });
  const n = m.reunioesVincular(); assert.equal(n, 1);
  const t = m.db.data.tempo_tasks.find(z => z.tipo === 'reuniao'); assert.ok(t); assert.equal(t.project_id, 'a');
  assert.equal(m.db.data.tempo_time_entries.find(e => e.id === 'e1').task_id, t.id);
  assert.equal(m.db.data.tempo_time_entries.find(e => e.id === 'e2').task_id, null, 'só reunião');
  m.db.ver++; const mo = m.tkMotor(H(14, 8), 10); assert.equal(mo.itens[t.id], undefined, 'fora do planejamento');
  assert.equal(m.reunioesVincular(), 0, 'não cria outra');
});
