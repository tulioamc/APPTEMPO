// Etapa corrente (V2.06.190): tempo sem programa nem marcação vai para a subtarefa atual (a única, ou a última escolhida).
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const MIN = 6e4;
function setup(subs) {
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'],
    ['db', 'sbPintar', 'sbSubMs', 'sbDivsEf', 'sbTrocaCorrente', 'sbSubDe', 'sbCorrenteEm', 'etapaMae', 'subtasksOf'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', $: () => null, $$: () => [], tkProjectLabel: (p) => p.name, openLayer: () => ({ box: { querySelector: () => null, addEventListener() {} }, close() {} }) });
  m.db.data = m.db.empty();
  m.db.insert('tempo_projects', { id: 'p', name: 'Reels' }, true);
  m.db.insert('tempo_tasks', { id: 'mae', project_id: 'p', parent_id: null, name: 'Reels BRASIL' }, true);
  subs.forEach((id, i) => m.db.insert('tempo_tasks', { id, project_id: 'p', parent_id: 'mae', name: id, order: i }, true));
  return m;
}
const sessao = (m, ini, fim) => m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: 'done', segments: [{ s: new Date(ini).toISOString(), e: new Date(fim).toISOString() }] }, true);

test('só uma subtarefa: todo o tempo vai para ela', () => {
  const m = setup(['a']); const t0 = Date.now() - 200 * MIN; sessao(m, t0, t0 + 100 * MIN);
  assert.equal(Math.round(m.sbSubMs('a') / MIN), 100);
});
test('duas subtarefas e ninguém escolhida: nada vai para nenhuma', () => {
  const m = setup(['a', 'b']); const t0 = Date.now() - 200 * MIN; sessao(m, t0, t0 + 100 * MIN);
  assert.equal(m.sbSubMs('a'), 0); assert.equal(m.sbSubMs('b'), 0);
});
test('criar a 2ª subtarefa mantém a 1ª como atual; alternar vale daí em diante', () => {
  const m = setup(['a']); const t0 = Date.now() - 200 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  const nb = m.sbSubDe(m.etapaMae(e), 'b');
  assert.equal(Math.round(m.sbSubMs('a') / MIN), 100); assert.equal(m.sbSubMs(nb.id), 0);
  m.db.setSetting('etapaHist', { mae: [{ t: 0, sub: 'a' }, { t: t0 + 60 * MIN, sub: nb.id }] });
  assert.equal(Math.round(m.sbSubMs('a') / MIN), 60); assert.equal(Math.round(m.sbSubMs(nb.id) / MIN), 40);
});
test('marcação à mão vale mais que a etapa atual', () => {
  const m = setup(['a', 'b']); const t0 = Date.now() - 200 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  m.db.setSetting('etapaHist', { mae: [{ t: 0, sub: 'a' }] });
  m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'b', '');
  assert.equal(Math.round(m.sbSubMs('b') / MIN), 30); assert.equal(Math.round(m.sbSubMs('a') / MIN), 70);
});
test('sbTrocaCorrente guarda o ponto de partida e não duplica', () => {
  const m = setup(['a', 'b']); const e = sessao(m, Date.now() - 100 * MIN, Date.now() - 50 * MIN);
  m.db.setSetting('etapaHist', {}); m.sbTrocaCorrente(e, 'b'); m.sbTrocaCorrente(e, 'b');
  const h = m.db.setting('etapaHist', {}).mae; assert.equal(h.length, 1); assert.equal(h[0].sub, 'b');
});
