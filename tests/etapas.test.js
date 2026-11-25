// Etapas: "Terminei uma etapa" marca o tempo desde a última marca como uma subtarefa (sem tirar da sessão) e o cronômetro segue na tarefa.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
test('marcar etapa cria a subtarefa, marca o trecho e a sessão continua rodando inteira', () => {
  let layer = null;
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'], ['db', 'ACTIONS', 'etapasDeHoje', 'etapaInicio', 'sbSubMs'],
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
  assert.equal(m.db.all('tempo_time_entries').length, 1);
  assert.ok(Math.abs(m.sbSubMs(sub.id) - 36 * 6e4) < 5000);
  const run = m.db.get('tempo_time_entries', 'run');
  assert.equal(run.state, 'running'); assert.equal(run.segments[run.segments.length - 1].e, null);
  assert.equal(m.etapasDeHoje(m.db.get('tempo_tasks', 'mae')).length, 1);
});
