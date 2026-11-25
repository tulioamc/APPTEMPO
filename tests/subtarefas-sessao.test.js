// Subtarefas dentro da sessão: levar trecho / programa para a subtarefa, devolver, desfazer, etapa atual e fim da sessão.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const MIN = 6e4;
function setup() {
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'],
    ['db', 'ACTIONS', 'sbPintar', 'sbJanela', 'sbFatias', 'sbPrevia', 'sbCortes', 'sbApps', 'sbNormaliza', 'etapaFechaAoEncerrar', 'sbEtapaAtual', 'etapaMae', 'actForaSplit', 'sbEstado', 'sbSecaoHTML'],
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

test('levar um trecho para a subtarefa: sai da sessão, entra na subtarefa, o total não muda', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN;
  const e = sessao(m, t0, t0 + 100 * MIN);
  const total = ms(e);
  const r = m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'ps', 'teste');
  assert.ok(r); assert.equal(Math.round(r.ms / MIN), 30);
  assert.equal(Math.round(soma(m, 'ps') / MIN), 30);
  assert.equal(Math.round(soma(m, 'mae') / MIN), 70);
  assert.equal(Math.round((soma(m, 'ps') + soma(m, 'mae')) / MIN), Math.round(total / MIN));
  const dono = m.db.get('tempo_time_entries', 'run');
  assert.equal(dono.segments.length, 2);
  assert.equal(dono.segments[0].why, 'moved');            // o buraco é "movido", não pausa
  assert.equal(dono.segments[0].movedTo, 'p');
  assert.match(m.db.all('tempo_time_entries').find(x => x.task_id === 'ps').notes, /^Movido de outra sessão/);
});
test('pintar por cima: do trecho da subtarefa para outra subtarefa e de volta para "Sem subtarefa"', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN;
  const e = sessao(m, t0, t0 + 100 * MIN);
  m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'ps', 't');
  m.sbPintar(m.db.get('tempo_time_entries', 'run'), [{ a: t0 + 30 * MIN, b: t0 + 40 * MIN }], 'ae', 't');
  assert.equal(Math.round(soma(m, 'ps') / MIN), 20); assert.equal(Math.round(soma(m, 'ae') / MIN), 10);
  const volta = m.sbPintar(m.db.get('tempo_time_entries', 'run'), [{ a: t0, b: t0 + 100 * MIN }], 'mae', 't');
  assert.ok(volta);
  assert.equal(Math.round(soma(m, 'mae') / MIN), 100); assert.equal(soma(m, 'ps'), 0); assert.equal(soma(m, 'ae'), 0);
  const dono = m.db.get('tempo_time_entries', 'run');
  assert.equal(dono.segments.length, 1);                  // tudo junto de novo, sem lacuna
  assert.equal(m.db.all('tempo_time_entries').length, 1);  // sessões vazias das subtarefas sumiram
});
test('desfazer devolve tudo como estava, inclusive com a sessão rodando', () => {
  const m = setup(); const t0 = Date.now() - 60 * MIN;
  const e = sessao(m, t0, null);
  const antes = JSON.stringify(m.db.get('tempo_time_entries', 'run').segments);
  const r = m.sbPintar(e, [{ a: t0 + 10 * MIN, b: t0 + 30 * MIN }], 'ps', 't');
  assert.ok(r); assert.equal(m.db.all('tempo_time_entries').length, 2);
  r.desfazer();
  assert.equal(m.db.all('tempo_time_entries').length, 1);
  assert.equal(JSON.stringify(m.db.get('tempo_time_entries', 'run').segments), antes);
});
test('sessão rodando: o trecho aberto continua aberto e o cronômetro segue', () => {
  const m = setup(); const t0 = Date.now() - 60 * MIN;
  const e = sessao(m, t0, null);
  m.sbPintar(e, [{ a: t0, b: Date.now() }], 'ps', 't');
  const run = m.db.get('tempo_time_entries', 'run');
  assert.equal(run.state, 'running'); assert.equal(run.segments[run.segments.length - 1].e, null);
  assert.equal(Math.round(soma(m, 'ps') / MIN), 60);
});
test('só o programa escolhido: leva o tempo dele (dentro do trecho marcado, se houver)', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN;
  const e = sessao(m, t0, t0 + 100 * MIN);
  const log = [['Adobe Photoshop 2026', 0, 20], ['Google Chrome', 20, 30], ['Adobe Photoshop 2026', 30, 60]].map(([app, a, b]) => ({ app, doc: app + '.psd', from: new Date(t0 + a * MIN).toISOString(), to: new Date(t0 + b * MIN).toISOString() }));
  m.ctx.actPoolBetween = (a, b) => log.filter(r => new Date(r.to) > a && new Date(r.from) < b);
  const J = m.sbJanela(e); const mae = m.etapaMae(e);
  const A = m.sbApps(e, mae, J);
  const ps = A.groups.find(g => /photoshop/i.test(g.label)); assert.ok(ps);
  const S = { ranges: [], app: ps.id, dest: 'ps', novo: '' };
  assert.equal(Math.round(m.sbCortes(S, A).reduce((t, c) => t + c.b - c.a, 0) / MIN), 50);
  S.ranges = [{ a: t0 + 10 * MIN, b: t0 + 40 * MIN }];                                  // só os 10 min do fim do 1º bloco e os 10 do começo do 2º
  assert.equal(Math.round(m.sbCortes(S, A).reduce((t, c) => t + c.b - c.a, 0) / MIN), 20);
  const p = m.sbPrevia(e, mae, S, A); assert.ok(p.ok); assert.match(p.txt, /20min/);
  m.sbPintar(e, m.sbCortes(S, A), 'ps', 't');
  assert.equal(Math.round(soma(m, 'ps') / MIN), 20);
});
test('prévia: sem trecho, sem destino e destino igual ao atual', () => {
  const m = setup(); const t0 = Date.now() - 60 * MIN; const e = sessao(m, t0, t0 + 50 * MIN);
  m.ctx.actPoolBetween = () => [];
  const mae = m.etapaMae(e); const A = m.sbApps(e, mae, m.sbJanela(e));
  assert.equal(m.sbPrevia(e, mae, { ranges: [], app: '', dest: 'ps' }, A).ok, false);
  assert.equal(m.sbPrevia(e, mae, { ranges: [{ a: t0, b: t0 + 10 * MIN }], app: '', dest: '' }, A).ok, false);
  assert.equal(m.sbPrevia(e, mae, { ranges: [{ a: t0, b: t0 + 10 * MIN }], app: '', dest: 'sem' }, A).ok, false);   // já está na tarefa
  assert.equal(m.sbPrevia(e, mae, { ranges: [{ a: t0, b: t0 + 10 * MIN }], app: '', dest: 'ps' }, A).ok, true);
});
test('a barra continua mostrando a sessão inteira depois de levar o começo para uma subtarefa', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  m.sbPintar(e, [{ a: t0, b: t0 + 40 * MIN }], 'ps', 't');
  const run = m.db.get('tempo_time_entries', 'run');
  const J = m.sbJanela(run);
  assert.equal(Math.round((J.b - J.a) / MIN), 100);
  const f = m.sbFatias(run, m.etapaMae(run), J);
  assert.equal(f.filter(x => x.key === 'ps').length, 1); assert.equal(f.filter(x => x.key === 'sem').length, 1);
  assert.match(m.sbSecaoHTML(run), /Por subtarefa|sb-strip/);
});
test('terminei uma etapa: diz a terminada e a próxima; encerrar fecha a próxima sozinha', async () => {
  let ly = null;
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'],
    ['db', 'ACTIONS', 'etapaFechaAoEncerrar', 'sbEtapaAtual'],
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
  assert.ok(m.db.all('tempo_time_entries').some(e => e.task_id === ps.id));
  // passam mais 30 min e a sessão é encerrada: a etapa atual fecha sozinha até o fim
  const agora = Date.now();
  m.db.update('tempo_time_entries', 'run', { state: 'done', segments: [{ s: new Date(agora - 30 * MIN).toISOString(), e: new Date(agora - 1 * MIN).toISOString() }] }, true);
  m.db.setSetting('etapaMarca', { run: new Date(agora - 30 * MIN).toISOString() });
  m.db.update('tempo_time_entries', m.db.all('tempo_time_entries').find(e => e.task_id === ps.id).id, { segments: [{ s: new Date(t0).toISOString(), e: new Date(agora - 30 * MIN).toISOString() }] }, true);   // a etapa 1 terminou 30 min atrás (sem sobrepor a sessão)
  const antesTotal = m.db.all('tempo_time_entries').reduce((t, e) => t + ms(e), 0);
  const r = m.etapaFechaAoEncerrar('run');
  assert.ok(r);
  const dela = m.db.all('tempo_time_entries').filter(e => e.task_id === ae.id).reduce((t, e) => t + ms(e), 0);
  assert.ok(dela >= 29 * MIN, 'a etapa atual ficou com o resto da sessão');
  assert.equal(m.sbEtapaAtual('run'), null);
  assert.ok(Math.abs(m.db.all('tempo_time_entries').reduce((t, e) => t + ms(e), 0) - antesTotal) < 1000);   // o total da tarefa não mudou
});
test('terminei às hh:mm (antes de agora): o que veio depois fica na sessão', () => {
  let ly = null; const t0 = new Date(); t0.setHours(9, 0, 0, 0);
  const agora = new Date(); const horaFim = `${String(Math.max(0, agora.getHours() - 1)).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'], ['db', 'ACTIONS'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', $: () => null, $$: () => [], tkProjectLabel: (p) => p.name,
      openLayer: () => { const v = { '#et-nome': 'Etapa 1', '#et-prox': '', '#et-fim': horaFim }; ly = { close() {}, box: { querySelector: (q) => (q in v ? { value: v[q] } : null), addEventListener: (ev, fn) => { if (ev === 'click') ly.click = fn; } } }; return ly; } });
  m.db.data = m.db.empty();
  m.db.insert('tempo_projects', { id: 'p', name: 'P' }, true); m.db.insert('tempo_tasks', { id: 'mae', project_id: 'p', parent_id: null, name: 'M' }, true);
  const ini = Date.now() - 180 * MIN;
  m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: 'running', segments: [{ s: new Date(ini).toISOString(), e: null }] }, true);
  m.ctx.activeEntry = () => m.db.get('tempo_time_entries', 'run');
  m.ACTIONS['etapa-fim'](); ly.click({ target: { closest: (s) => (s === '[data-et-ok]' ? {} : null) } });
  const run = m.db.get('tempo_time_entries', 'run');
  assert.equal(run.state, 'running'); assert.ok(ms(run) > 55 * MIN && ms(run) < 65 * MIN, 'sobra cerca de 1 h na sessão: ' + ms(run) / MIN);
});
test('o chip "Em subtarefas" separa o que foi para subtarefa do que foi para outro projeto', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'ps', 't');
  const f = m.actForaSplit(m.db.get('tempo_time_entries', 'run'));
  assert.equal(Math.round(f.sub / MIN), 30); assert.equal(f.outro, 0);
});
test('normalizar: trechos que se encostam viram um só e o motivo vale o do último', () => {
  const m = setup(); const a = '2026-11-25T10:00:00.000Z', b = '2026-11-25T10:30:00.000Z', c = '2026-11-25T11:00:00.000Z';
  const out = m.sbNormaliza([{ s: b, e: c }, { s: a, e: b, why: 'moved', movedTo: 'p' }]);
  assert.equal(out.length, 1); assert.equal(out[0].s, a); assert.equal(out[0].e, c); assert.equal(out[0].why, undefined);
});
