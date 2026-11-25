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

test('lista de etapas: trechos seguidos da mesma etapa viram uma linha, na ordem do dia', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'], ['etapasAgrupa'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '' });
  const P = { id: 'p', name: 'Preparar Cartelas' }, A = { id: 'a', name: 'Animação 2D' };
  const x = (sub, a, b, min) => ({ sub, a: `2026-11-25T${a}:00Z`, b: `2026-11-25T${b}:00Z`, ms: min * 6e4 });
  const g = m.etapasAgrupa([x(P, '08:28', '08:31', 2), x(P, '08:32', '08:40', 7), x(P, '08:50', '08:51', 1), x(A, '10:01', '10:08', 3), x(A, '10:09', '10:10', 1), x(P, '10:24', '10:34', 10)]);
  assert.equal(g.length, 3);
  assert.deepEqual(g.map(r => r.sub.name), ['Preparar Cartelas', 'Animação 2D', 'Preparar Cartelas']);
  assert.deepEqual(g.map(r => r.ms / 6e4), [10, 4, 10]);
  assert.deepEqual(g.map(r => r.itens.length), [3, 2, 1]);
  assert.equal(g[0].a, '2026-11-25T08:28:00Z'); assert.equal(g[0].b, '2026-11-25T08:51:00Z');
});
