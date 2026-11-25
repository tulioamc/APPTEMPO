// Subtarefas dentro da sessão: marcar trecho / programa com a subtarefa SEM tirar da sessão, desfazer, etapa atual e fim da sessão.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const MIN = 6e4;
function setup() {
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'],
    ['db', 'ACTIONS', 'sbPintar', 'sbJanela', 'sbFatias', 'sbPrevia', 'sbCortes', 'sbApps', 'sbNormaliza', 'etapaFechaAoEncerrar', 'sbEtapaAtual', 'etapaMae', 'actForaSplit', 'sbEstado', 'sbSecaoHTML', 'sbSubMs', 'sbDivs', 'sbReintegra', 'sbLembraDesfazer', 'etapasDeHoje'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', $: () => null, $$: () => [], tkProjectLabel: (p) => p.name, openLayer: () => ({ box: { querySelector: () => null, addEventListener() {} }, close() {} }) });
  m.db.data = m.db.empty();
  m.db.insert('tempo_projects', { id: 'p', name: 'Reels' }, true);
  m.db.insert('tempo_tasks', { id: 'mae', project_id: 'p', parent_id: null, name: 'Reels BRASIL' }, true);
  m.db.insert('tempo_tasks', { id: 'ps', project_id: 'p', parent_id: 'mae', name: 'Preparar telas', order: 0 }, true);
  m.db.insert('tempo_tasks', { id: 'ae', project_id: 'p', parent_id: 'mae', name: 'Animar 2D', order: 1 }, true);
  return m;
}
const ms = (e) => (e.segments || []).reduce((t, s) => t + ((s.e ? new Date(s.e) : Date.now()) - new Date(s.s)), 0);
const sessao = (m, ini, fim, extra = {}) => m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: fim ? 'done' : 'running', segments: [{ s: new Date(ini).toISOString(), e: fim ? new Date(fim).toISOString() : null }], ...extra }, true);
const soma = (m, task) => m.db.all('tempo_time_entries').filter(e => e.task_id === task).reduce((t, e) => t + ms(e), 0);

test('marcar um trecho com a subtarefa: a sessão e o total NÃO mudam', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN;
  const e = sessao(m, t0, t0 + 100 * MIN); const total = ms(e);
  const r = m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'ps', '');
  assert.ok(r); assert.equal(Math.round(r.ms / MIN), 30);
  assert.equal(m.db.all('tempo_time_entries').length, 1);
  assert.equal(ms(m.db.get('tempo_time_entries', 'run')), total);
  assert.equal(m.db.get('tempo_time_entries', 'run').segments.length, 1);
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 30);
});
test('marcar por cima troca; "Sem subtarefa" tira a marcação; marcações vizinhas iguais se juntam', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'ps', '');
  m.sbPintar(e, [{ a: t0 + 30 * MIN, b: t0 + 40 * MIN }], 'ae', '');
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 20); assert.equal(Math.round(m.sbSubMs('ae') / MIN), 10);
  m.sbPintar(e, [{ a: t0 + 30 * MIN, b: t0 + 40 * MIN }], 'ps', '');
  assert.equal(m.sbDivs('run').length, 1);
  m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'mae', '');
  assert.equal(m.sbSubMs('ps'), 0); assert.equal(m.sbDivs('run').length, 0);
});
test('desfazer devolve as marcações como estavam (sessão rodando também)', () => {
  const m = setup(); const t0 = Date.now() - 60 * MIN; const e = sessao(m, t0, null);
  m.sbPintar(e, [{ a: t0, b: t0 + 10 * MIN }], 'ps', '');
  const r = m.sbPintar(e, [{ a: t0 + 5 * MIN, b: t0 + 30 * MIN }], 'ae', '');
  assert.ok(r); r.desfazer();
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 10); assert.equal(m.sbSubMs('ae'), 0);
  assert.equal(m.db.get('tempo_time_entries', 'run').state, 'running');
  assert.equal(m.db.get('tempo_time_entries', 'run').segments[0].e, null);
});
test('a barra mostra a sessão inteira, dividida pelas marcações', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'ps', '');
  const live = m.db.get('tempo_time_entries', 'run'); const mae = m.etapaMae(live);
  const f = m.sbFatias(live, mae, m.sbJanela(live));
  assert.equal(f.map(x => x.key).join(','), 'sem,ps,sem');
  assert.equal(Math.round(f.reduce((t, x) => t + x.b - x.a, 0) / MIN), 100);
});
test('prévia: sem trecho, sem destino e destino igual ao atual', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN); const mae = m.etapaMae(e);
  const S = m.sbEstado('run'); const A = m.sbApps(e, mae, m.sbJanela(e));
  assert.equal(m.sbPrevia(e, mae, S, A).ok, false);
  S.ranges = [{ a: t0 + 10 * MIN, b: t0 + 20 * MIN }]; assert.equal(m.sbPrevia(e, mae, S, A).ok, false);
  S.dest = 'ps'; assert.equal(m.sbPrevia(e, mae, S, A).ok, true);
  m.sbPintar(e, S.ranges, 'ps', '');
  assert.equal(m.sbPrevia(m.db.get('tempo_time_entries', 'run'), mae, S, A).ok, false);
  assert.match(m.sbPrevia(e, mae, { ...S, dest: 'ae' }, A).txt, /continua na sessão/);
});
test('o botão Desfazer fica na seção depois de marcar', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  assert.doesNotMatch(m.sbSecaoHTML(e), /sb-desfaz/);
  m.sbLembraDesfazer('run', '30min marcados.', () => {});
  assert.match(m.sbSecaoHTML(e), /data-x="sb-desfaz"/);
});
test('sessão antiga com trecho "levado" para a subtarefa volta para a sessão e vira marcação', () => {
  const m = setup(); const t0 = Date.now() - 180 * MIN; const iso = (x) => new Date(x).toISOString();
  m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: 'done', segments: [
    { s: iso(t0), e: iso(t0 + 20 * MIN), why: 'moved', movedTo: 'p' }, { s: iso(t0 + 38 * MIN), e: iso(t0 + 100 * MIN) }] }, true);
  m.db.insert('tempo_time_entries', { id: 'mv', project_id: 'p', task_id: 'ps', state: 'done', notes: 'Movido de outra sessão', segments: [{ s: iso(t0 + 20 * MIN), e: iso(t0 + 38 * MIN) }] }, true);
  const n = m.sbReintegra(m.db.get('tempo_time_entries', 'run'));
  assert.equal(n, 1);
  assert.equal(m.db.get('tempo_time_entries', 'mv'), undefined);
  assert.equal(Math.round(ms(m.db.get('tempo_time_entries', 'run')) / MIN), 100);
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 18);
});
test('etapas de hoje listam as marcações', () => {
  const m = setup(); const t0 = Date.now() - 60 * MIN; const e = sessao(m, t0, t0 + 50 * MIN);
  m.sbPintar(e, [{ a: t0, b: t0 + 20 * MIN }], 'ps', '');
  const l = m.etapasDeHoje(m.db.get('tasks'.replace('tasks', 'tempo_tasks'), 'mae'));
  assert.equal(l.length, 1); assert.equal(Math.round(l[0].ms / MIN), 20);
});
test('terminei uma etapa: diz a terminada e a próxima; encerrar fecha a próxima sozinha', async () => {
  let ly = null;
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'],
    ['db', 'ACTIONS', 'etapaFechaAoEncerrar', 'sbEtapaAtual', 'sbSubMs'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', $: () => null, $$: () => [], tkProjectLabel: (p) => p.name,
      openLayer: () => { const v = { '#et-nome': 'Preparar telas', '#et-prox': 'Animar 2D', '#et-fim': '' }; ly = { close() {}, box: { querySelector: (q) => (q in v ? { value: v[q] } : null), addEventListener: (ev, fn) => { if (ev === 'click') ly.click = fn; } } }; return ly; } });
  m.db.data = m.db.empty();
  m.db.insert('tempo_projects', { id: 'p', name: 'Reels' }, true);
  m.db.insert('tempo_tasks', { id: 'mae', project_id: 'p', parent_id: null, name: 'Reels BRASIL' }, true);
  const t0 = Date.now() - 60 * MIN;
  m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: 'running', segments: [{ s: new Date(t0).toISOString(), e: null }] }, true);
  m.ctx.activeEntry = () => m.db.get('tempo_time_entries', 'run');
  m.ACTIONS['etapa-fim']();
  ly.click({ target: { closest: (s) => (s === '[data-et-ok]' ? {} : null) } });
  const subs = m.db.all('tempo_tasks').filter(t => t.parent_id === 'mae');
  const ps = subs.find(s => s.name === 'Preparar telas'), ae = subs.find(s => s.name === 'Animar 2D');
  assert.ok(ps && ae);
  assert.equal(m.sbEtapaAtual('run').id, ae.id);                       // a próxima ficou como etapa atual
  assert.equal(m.db.all('tempo_time_entries').length, 1);              // nada saiu da sessão
  assert.ok(Math.abs(m.sbSubMs(ps.id) - 60 * MIN) < 2 * MIN);           // a etapa 1 ficou marcada
  const agora = Date.now();
  m.db.update('tempo_time_entries', 'run', { state: 'done', segments: [{ s: new Date(t0).toISOString(), e: new Date(agora).toISOString() }] }, true);
  m.db.setSetting('etapaMarca', { run: new Date(agora - 30 * MIN).toISOString() });
  const antesTotal = m.db.all('tempo_time_entries').reduce((t, e) => t + ms(e), 0);
  const r = m.etapaFechaAoEncerrar('run');
  assert.ok(r);
  assert.ok(m.sbSubMs(ae.id) >= 29 * MIN, 'a etapa atual ficou com o resto da sessão');
  assert.equal(m.sbEtapaAtual('run'), null);
  assert.ok(Math.abs(m.db.all('tempo_time_entries').reduce((t, e) => t + ms(e), 0) - antesTotal) < 1000);   // o total da tarefa não mudou
});
test('terminei às hh:mm (antes de agora): a sessão continua inteira e só a parte até a hora fica marcada', () => {
  let ly = null; const t0 = new Date(); t0.setHours(9, 0, 0, 0);
  const agora = new Date(); const horaFim = `${String(Math.max(0, agora.getHours() - 1)).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'], ['db', 'ACTIONS', 'sbSubMs'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', $: () => null, $$: () => [], tkProjectLabel: (p) => p.name,
      openLayer: () => { const v = { '#et-nome': 'Etapa 1', '#et-prox': '', '#et-fim': horaFim }; ly = { close() {}, box: { querySelector: (q) => (q in v ? { value: v[q] } : null), addEventListener: (ev, fn) => { if (ev === 'click') ly.click = fn; } } }; return ly; } });
  m.db.data = m.db.empty();
  m.db.insert('tempo_projects', { id: 'p', name: 'P' }, true); m.db.insert('tempo_tasks', { id: 'mae', project_id: 'p', parent_id: null, name: 'M' }, true);
  const ini = Date.now() - 180 * MIN;
  m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: 'running', segments: [{ s: new Date(ini).toISOString(), e: null }] }, true);
  m.ctx.activeEntry = () => m.db.get('tempo_time_entries', 'run');
  m.ACTIONS['etapa-fim'](); ly.click({ target: { closest: (s) => (s === '[data-et-ok]' ? {} : null) } });
  const run = m.db.get('tempo_time_entries', 'run');
  assert.equal(run.state, 'running'); assert.ok(ms(run) > 179 * MIN, 'a sessão continua inteira');
  const et1 = m.db.all('tempo_tasks').find(t => t.name === 'Etapa 1'); assert.ok(m.sbSubMs(et1.id) > 115 * MIN && m.sbSubMs(et1.id) < 125 * MIN, 'a Etapa 1 ficou marcada até a hora dita: ' + m.sbSubMs(et1.id) / MIN);
});
test('o chip "Em subtarefas" só conta o que foi levado de verdade (marcar não conta)', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'ps', '');
  const f = m.actForaSplit(m.db.get('tempo_time_entries', 'run'));
  assert.equal(f.sub, 0); assert.equal(f.outro, 0);
});
test('normalizar: trechos que se encostam viram um só e o motivo vale o do último', () => {
  const m = setup(); const a = '2026-11-25T10:00:00.000Z', b = '2026-11-25T10:30:00.000Z', c = '2026-11-25T11:00:00.000Z';
  const out = m.sbNormaliza([{ s: b, e: c }, { s: a, e: b, why: 'moved', movedTo: 'p' }]);
  assert.equal(out.length, 1); assert.equal(out[0].s, a); assert.equal(out[0].e, c); assert.equal(out[0].why, undefined);
});
