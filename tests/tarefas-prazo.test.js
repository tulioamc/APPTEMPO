// Tarefas: previsão sugerida pelo histórico, fila única de todos os projetos (= planejado do Calendário) e aviso de prazo.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/planejamento.js', 'js/view-rafa.js', 'js/tarefas-prazo.js'],
    ['db', 'planejar', 'tkMotor', 'tkSugestao', 'tkPrev', 'tkLerMin', 'tkFila'], { statusCat: (id) => String(id || '').replace(/^s-/, '') || undefined, VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  const st = (cat) => ({ id: 's-' + cat, kind: 'work', category: cat, name: cat });
  m.db.data.tempo_status_options = [st('todo'), st('active'), st('done')];
  return m;
};
const proj = (id, extra = {}) => ({ id, name: 'Proj ' + id, client_id: null, status_id: 's-active', work_type_id: 'wt', archived: false, ...extra });
const tarefa = (id, pid, extra = {}) => ({ id, project_id: pid, parent_id: null, name: id, status_id: 's-todo', owner: 'Tulio', depends_on: [], order: 0, ...extra });

test('lê o tempo previsto em vários formatos', () => {
  const m = setup();
  assert.equal(m.tkLerMin('2'), 120); assert.equal(m.tkLerMin('2:30'), 150); assert.equal(m.tkLerMin('1h30'), 90); assert.equal(m.tkLerMin('90m'), 90); assert.equal(m.tkLerMin('1,5'), 90); assert.equal(m.tkLerMin('xx'), null);
});
test('sugestão pela mediana de tarefas iguais já feitas', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('v', { status_id: 's-done' }), proj('n')];
  m.db.data.tempo_tasks = [tarefa('kv1', 'v', { name: 'KV Rio', status_id: 's-done' }), tarefa('kv2', 'v', { name: 'KV São Paulo', status_id: 's-done' }), tarefa('kv3', 'v', { name: 'KV BH', status_id: 's-done' }), tarefa('novo', 'n', { name: 'KV Curitiba' })];
  const seg = (tid, h) => ({ id: 'e' + tid, project_id: 'v', task_id: tid, state: 'done', segments: [{ s: '2026-11-10T12:00:00Z', e: new Date(Date.parse('2026-11-10T12:00:00Z') + h * 36e5).toISOString() }] });
  m.db.data.tempo_time_entries = [seg('kv1', 1), seg('kv2', 2), seg('kv3', 4)];
  const s = m.tkSugestao(m.db.get('tempo_tasks', 'novo'));
  assert.equal(s.min, 120); assert.match(s.fonte, /mediana de 3/);
  assert.equal(m.tkPrev(m.db.get('tempo_tasks', 'novo')).manual, false);
});
test('fila única: uma tarefa por vez em todos os projetos, pela entrega; aviso quando não dá tempo', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a'), proj('b')];
  m.db.data.tempo_tasks = [
    tarefa('kv', 'a', { est_min: 120, deadline: '2026-11-24', deadline_time: '16:00' }),
    tarefa('dooh', 'a', { est_min: 120, deadline: '2026-11-24', deadline_time: '16:00', depends_on: ['kv'] }),
    tarefa('outro', 'b', { est_min: 60, deadline: '2026-11-24', deadline_time: '12:00' }),
  ];
  const agora = new Date(2026, 10, 24, 9, 0);   // terça 9h
  const mo = m.tkMotor(agora, 10);
  // "outro" (entrega 12h) vem primeiro: 9h–10h; KV 10h–12h; DOOH depois do almoço 14h–16h → cabe
  assert.equal(mo.itens.outro.blocos[0].ini, 9);
  assert.equal(mo.itens.kv.blocos[0].ini, 10);
  assert.ok(!mo.itens.dooh.aviso);
  // a tarefa do outro projeto passa a 3h: empurra KV e DOOH, e DOOH não cabe mais
  m.db.update('tempo_tasks', 'outro', { est_min: 180 });
  const mo2 = m.tkMotor(agora, 10);
  assert.ok(mo2.itens.dooh.aviso, 'DOOH estoura a entrega');
  assert.equal(mo2.itens.dooh.antes?.id, 'kv');
  // o planejado do Calendário são esses blocos, com o nome da tarefa
  const dia = mo2.porDia['2026-11-24'].blocos;
  assert.ok(dia.some(b => b.tarefa === 'kv') && dia.every(b => b.fim <= 12 + 1e-9 || b.ini >= 14));
});
