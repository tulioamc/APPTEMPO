// To-dos: tarefas criadas pelo app não voltam depois de dispensadas; "adiou" só conta quando a data vencida é trocada.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

function setup() {
  const m = load(['js/store.js', 'js/domain.js', 'js/notices.js'], ['db', 'ACTIONS', 'todoOnce', 'todoCarry', 'parseTodoText', 'todoToday'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', esc: (s) => String(s), $: () => null, $$: () => [], FERIAS_HOJE: false, SCAN_SEEN: null, SCAN_CHANGED: false, todoAlarmSync() {} });
  m.db.data = m.db.empty();
  const todos = () => m.db.all('tempo_notices').filter(n => n.kind === 'todo');
  return { ...m, todos };
}

test('to-do criado pelo app: ao apagar fica dispensado e não é recriado', () => {
  const t = setup();
  t.todoOnce('Cobrar orçamento TESTE');
  assert.equal(t.todos().length, 1); assert.equal(t.todos()[0].data.auto, true);
  t.ACTIONS['todo-del']({ dataset: { id: t.todos()[0].id } });
  assert.equal(t.todos().length, 1); assert.equal(t.todos()[0].status, 'done'); assert.equal(t.todos()[0].decision, 'Dispensado');
  t.todoOnce('Cobrar orçamento TESTE');
  assert.equal(t.todos().length, 1, 'a varredura não recria');
});

test('to-do seu: apagar remove de verdade', () => {
  const t = setup();
  t.db.insert('tempo_notices', { kind: 'todo', status: 'open', title: 'Comprar café', data: {} }, true);
  t.ACTIONS['todo-del']({ dataset: { id: t.todos()[0].id } });
  assert.equal(t.todos().length, 0);
});

test('"adiou" não sobe sozinho com o passar dos dias', () => {
  const t = setup();
  t.db.insert('tempo_notices', { kind: 'todo', status: 'open', title: 'Falar com Arruda', created_at: '2026-11-10T12:00:00Z', data: { due: t.todoToday() + 'T14:00', adiou: 2 } }, true);
  t.todoCarry();
  assert.equal(t.todos()[0].data.adiou, 0, 'contadores antigos são zerados uma vez');
  t.todoCarry(); t.todoCarry();
  assert.equal(t.todos()[0].data.adiou, 0);
});

function setup2() {
  const m = load(['js/store.js', 'js/domain.js', 'js/notices.js'], ['db', 'todoTodasHTML', 'todoRelatorio', 'todoFeitasHoje', 'todoToday', 'VIEWS'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: { todoTab: 'todas' }, toast() {}, render() {}, icon: () => '', esc: (s) => String(s), $: () => null, $$: () => [], todoAlarmSync() {},
      fmtDate: (d) => d, fmtDur: (ms) => `${Math.round(ms / 60e3)}min`, fmtDateShort: (d) => d, fmtTime: (d) => d, pixSideHTML: () => '', noticeButtons: () => '', tag: (t) => t, statusCat: () => '' });
  m.db.data = m.db.empty();
  return m;
}
const hojeISO = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };

test('Todas: agrupa por dia e mostra abertas, concluídas e atrasadas', () => {
  const t = setup2(); const hoje = t.todoToday();
  t.db.data.tempo_notices = [
    { id: 'a', kind: 'todo', status: 'open', title: 'A', data: { due: hoje + 'T23:59' }, created_at: hojeISO(8) },
    { id: 'b', kind: 'todo', status: 'done', title: 'B', data: { due: hoje + 'T10:00' }, decided_at: hojeISO(9), created_at: hojeISO(8) },
    { id: 'c', kind: 'todo', status: 'open', title: 'C', data: { due: hoje + 'T00:01' }, created_at: hojeISO(0) },
  ];
  const html = t.todoTodasHTML(t.db.data.tempo_notices);
  assert.ok(html.includes('01 aberta') && html.includes('01 concluída') && html.includes('01 atrasada'), html);
});

test('feitas hoje ficam no fim do painel; as de ontem e as dispensadas não', () => {
  const t = setup2();
  const ontem = new Date(Date.now() - 864e5).toISOString();
  const lista = [
    { id: 'x', kind: 'todo', status: 'done', title: 'Feita hoje', decided_at: hojeISO(1), data: {} },
    { id: 'y', kind: 'todo', status: 'done', title: 'Feita ontem', decided_at: ontem, data: {} },
    { id: 'z', kind: 'todo', status: 'done', title: 'Dispensada', decided_at: hojeISO(1), decision: 'Dispensado', data: {} },
  ];
  assert.deepEqual(t.todoFeitasHoje(lista).map(n => n.id), ['x']);
});

test('relatório: concluídas, atrasadas, adiadas e média por dia', () => {
  const t = setup2(); const hoje = t.todoToday();
  const lista = [
    { id: '1', kind: 'todo', status: 'done', title: '1', data: { due: hoje + 'T10:00' }, decided_at: hojeISO(9), created_at: hojeISO(8) },     // no prazo
    { id: '2', kind: 'todo', status: 'done', title: '2', data: { due: hoje + 'T00:01', adiou: 2 }, decided_at: hojeISO(1), created_at: hojeISO(0) },  // atrasada e adiada
  ];
  const r = t.todoRelatorio(lista, 'semana', false);
  assert.equal(r.feitas, 2); assert.equal(r.atrasadas, 1); assert.equal(r.noPrazo, 1);
  assert.equal(r.adiadas, 1); assert.equal(r.adiamentos, 2);
  assert.ok(r.media > 0);
});
