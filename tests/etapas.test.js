// Etapas: "Terminei uma etapa" leva o tempo desde a última marca para uma subtarefa e o cronômetro segue na tarefa.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
test('marcar etapa cria a subtarefa, move o trecho e a sessão continua rodando', () => {
  let layer = null;
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'], ['db', 'ACTIONS', 'etapasDeHoje', 'etapaInicio'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', $: () => null, $$: () => [], tkProjectLabel: (p) => p.name,
      openLayer: (o) => { const nome = { value: 'Preparar cartelas' }; layer = { close() {}, box: { querySelector: (q) => (q === '#et-nome' ? nome : null), addEventListener: (ev, fn) => { if (ev === 'click') layer.click = fn; } } }; return layer; } });
  m.db.data = m.db.empty();
  m.db.insert('tempo_projects', { id: 'p', name: 'Reels' }, true);
  m.db.insert('tempo_tasks', { id: 'mae', project_id: 'p', parent_id: null, name: 'Reels BRASIL' }, true);
  const ini = new Date(Date.now() - 36 * 6e4).toISOString();
  m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: 'running', segments: [{ s: ini, e: null }] }, true);
  m.ctx.activeEntry = () => m.db.get('tempo_time_entries', 'run');
  m.ACTIONS['etapa-fim']();
  layer.click({ target: { closest: (s) => (s === '[data-et-ok]' ? {} : null) } });
  const sub = m.db.all('tempo_tasks').find(t => t.parent_id === 'mae');
  assert.equal(sub.name, 'Preparar cartelas');
  const et = m.db.all('tempo_time_entries').find(e => e.task_id === sub.id);
  assert.ok(et && Math.abs((new Date(et.segments[0].e) - new Date(et.segments[0].s)) - 36 * 6e4) < 5000);
  const run = m.db.get('tempo_time_entries', 'run');
  assert.equal(run.state, 'running'); assert.equal(run.segments[run.segments.length - 1].e, null);
  assert.equal(m.etapasDeHoje(m.db.get('tempo_tasks', 'mae')).length, 1);
});
