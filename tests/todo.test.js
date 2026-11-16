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
