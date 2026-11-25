// Subtarefas dentro da sessão: marcar trecho / programa com a subtarefa SEM tirar da sessão, desfazer, etapa atual e fim da sessão.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const MIN = 6e4;
function setup() {
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/range.js', 'js/sub-programas.js', 'js/subtarefas-sessao.js'],
    ['db', 'ACTIONS', 'sbPintar', 'sbJanela', 'sbFatias', 'sbPrevia', 'sbCortes', 'sbApps', 'sbNormaliza', 'etapaFechaAoEncerrar', 'sbEtapaAtual', 'etapaMae', 'actForaSplit', 'sbEstado', 'sbSecaoHTML', 'sbSubMs', 'sbDivs', 'sbReintegra', 'sbLembraDesfazer', 'etapasDeHoje', 'sbDetalheDados', 'sbDetalheHTML', 'sbAuto', 'sbDivsEf', 'subAssocia', 'sbSugestoesDe', 'subMesmo', 'subProgsDe', 'subTira', 'subOpcoesHTML'],
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
test('reintegra também quando o buraco ficou como pausa comum e quando o trecho levado era o começo da sessão', () => {
  const m = setup(); const t0 = Date.now() - 180 * MIN; const iso = (x) => new Date(x).toISOString();
  m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: 'done', segments: [{ s: iso(t0 + 18 * MIN), e: iso(t0 + 60 * MIN) }, { s: iso(t0 + 70 * MIN), e: iso(t0 + 100 * MIN), why: 'pause' }] }, true);
  m.db.insert('tempo_time_entries', { id: 'mv', project_id: 'p', task_id: 'ps', state: 'done', notes: 'Movido de outra sessão', segments: [{ s: iso(t0), e: iso(t0 + 18 * MIN) }] }, true);
  assert.equal(m.sbReintegra(m.db.get('tempo_time_entries', 'run')), 1);
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 18);
  assert.equal(Math.round(ms(m.db.get('tempo_time_entries', 'run')) / MIN), 90);
});
test('seção: chevron esconde a barra e os menus; Detalhes abre a janela (sem edição inline)', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  let h = m.sbSecaoHTML(e);
  assert.match(h, /data-x="sb-fold"/); assert.match(h, /sb-strip/); assert.match(h, /data-x="sb-det"/); assert.doesNotMatch(h, /data-x="sb-del"|data-sb="ren"/);
  m.db.setSetting('sbFechado', true); h = m.sbSecaoHTML(e);
  assert.doesNotMatch(h, /sb-strip/); assert.match(h, /is-fechado/);
});
test('janela da subtarefa: tempo registrado, trechos, programas associados, renomear e apagar', () => {
  const m = setup(); const t0 = Date.now() - 120 * MIN; const e = sessao(m, t0, t0 + 100 * MIN);
  m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 50 * MIN }], 'ps', '');
  const D = m.sbDetalheDados('ps');
  assert.equal(Math.round(D.total / MIN), 30); assert.equal(D.regs.length, 1); assert.equal(D.sessoes, 1);
  const h = m.sbDetalheHTML(m.db.get('tempo_tasks', 'ps'));
  assert.match(h, /Preparar telas/); assert.match(h, /data-sbd="apagar"/); assert.match(h, /data-sbd="salvar"/); assert.match(h, /Programas e sites desta subtarefa/); assert.match(h, /continua dentro da tarefa/);
});
test('buracos "movidos" para subtarefa sem lançamento de destino (tempo perdido) voltam para a sessão e ficam marcados', () => {
  const m = setup(); const t0 = Date.now() - 180 * MIN; const iso = (x) => new Date(x).toISOString();
  m.db.insert('tempo_time_entries', { id: 'run', project_id: 'p', task_id: 'mae', state: 'running', edits: [{ at: iso(t0), reason: 'Photoshop › Preparar telas: 18min levados para a subtarefa' }], segments: [
    { s: iso(t0), e: iso(t0 + 10 * MIN), why: 'moved', movedTo: 'p' },
    { s: iso(t0 + 15 * MIN), e: iso(t0 + 30 * MIN), why: 'moved', movedTo: 'outro' },
    { s: iso(t0 + 40 * MIN), e: iso(t0 + 50 * MIN), why: 'Sem registro' },
    { s: iso(t0 + 55 * MIN), e: null }] }, true);
  assert.equal(m.sbReintegra(m.db.get('tempo_time_entries', 'run')), 1);
  const run = m.db.get('tempo_time_entries', 'run');
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 5);
  assert.equal(run.segments[0].e, iso(t0 + 30 * MIN));                       // o buraco foi preenchido e o trecho emendou
  assert.equal(run.segments[0].movedTo, 'outro');                            // o que foi para outro projeto continua fora
  assert.equal(m.actForaSplit(run).sub, 0);
  assert.equal(m.sbReintegra(run), 0);
});
function comProgramas() {
  const m = setup(); const t0 = Date.now() - 180 * MIN; const iso = (x) => new Date(x).toISOString();
  sessao(m, t0, t0 + 100 * MIN);
  const recs = [{ from: iso(t0), to: iso(t0 + 40 * MIN), app: 'Adobe Photoshop 2026', doc: 'a.psd' }, { from: iso(t0 + 40 * MIN), to: iso(t0 + 100 * MIN), app: 'Adobe After Effects 2026', doc: 'b.aep' }];
  m.ctx.actList = (id) => (id === 'run' ? recs : []);
  return { m, t0 };
}
test('associar um programa à subtarefa já aplica: o tempo dele nas sessões conta na subtarefa, sem tirar da sessão', () => {
  const { m } = comProgramas();
  assert.equal(m.sbSubMs('ps'), 0);
  m.subAssocia('ps', 'Photoshop');
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 40);
  assert.equal(m.db.all('tempo_time_entries').length, 1);
  assert.equal(Math.round(ms(m.db.get('tempo_time_entries', 'run')) / MIN), 100);
});
test('o que foi marcado à mão vale mais que o programa; "Sem subtarefa" também', () => {
  const { m, t0 } = comProgramas();
  m.subAssocia('ps', 'Photoshop');
  const e = m.db.get('tempo_time_entries', 'run');
  m.sbPintar(e, [{ a: t0, b: t0 + 10 * MIN }], 'ae', '');                    // à mão: Animar 2D
  assert.equal(Math.round(m.sbSubMs('ae') / MIN), 10); assert.equal(Math.round(m.sbSubMs('ps') / MIN), 30);
  m.sbPintar(e, [{ a: t0 + 10 * MIN, b: t0 + 20 * MIN }], 'mae', '');        // à mão: sem subtarefa
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 20);
  const r = m.sbPintar(e, [{ a: t0 + 20 * MIN, b: t0 + 25 * MIN }], 'mae', '');
  r.desfazer(); assert.equal(Math.round(m.sbSubMs('ps') / MIN), 20);
});
test('trocar o programa para outra subtarefa: vale a nova; o já marcado à mão fica', () => {
  const { m, t0 } = comProgramas();
  m.subAssocia('ps', 'Photoshop');
  m.sbPintar(m.db.get('tempo_time_entries', 'run'), [{ a: t0, b: t0 + 10 * MIN }], 'ps', '');   // registrado à mão
  m.subAssocia('ae', 'Photoshop');
  assert.deepEqual(m.db.setting('subProgs', {}).ps || [], []);
  assert.equal(Math.round(m.sbSubMs('ae') / MIN), 30);                       // o resto do Photoshop vai para a nova
  assert.equal(Math.round(m.sbSubMs('ps') / MIN), 10);                       // o registrado à mão continua
});
test('sugestões: programas das sessões da tarefa, do maior para o menor, sem os já associados', () => {
  const { m } = comProgramas();
  let sug = m.sbSugestoesDe(m.db.get('tempo_tasks', 'ps'));
  assert.equal(sug.length, 2); assert.ok(sug[0].ms >= sug[1].ms);
  m.subAssocia('ps', sug[0].nome);
  sug = m.sbSugestoesDe(m.db.get('tempo_tasks', 'ps')); assert.equal(sug.length, 1);
  assert.match(m.sbDetalheHTML(m.db.get('tempo_tasks', 'ps')), /Sugestões/);
});

test('"Adobe Photoshop (Beta)" e "Photoshop" são o mesmo programa', () => {
  const m = setup();
  assert.ok(m.subMesmo('Adobe Photoshop (Beta)', 'Photoshop'));
  assert.ok(m.subMesmo('Adobe Illustrator 2027 (Beta)', 'Illustrator'));
  assert.ok(!m.subMesmo('Photoshop', 'Illustrator'));
  m.subAssocia('ps', 'Photoshop');
  assert.doesNotMatch(m.subOpcoesHTML('p', ['Photoshop']), /value="Photoshop"/);
  assert.match(m.subOpcoesHTML('p', []), /<optgroup label="Sites">/);
});
test('regra de sempre: Pinterest vai sozinho para "Procura de referência" e Magnific para "Geração de Imagem IA"; × tira', () => {
  const m = setup();
  m.db.insert('tempo_tasks', { id: 'ref', project_id: 'p', parent_id: 'mae', name: 'Procura de referência', order: 5 }, true);
  m.db.insert('tempo_tasks', { id: 'ia', project_id: 'p', parent_id: 'mae', name: 'Geração de Imagem IA', order: 6 }, true);
  assert.deepEqual(m.subProgsDe('ref'), ['Pinterest']);
  assert.deepEqual(m.subProgsDe('ia'), ['Magnific']);
  assert.deepEqual(m.subProgsDe('ps'), []);
  m.subTira('ref', 'Pinterest'); assert.deepEqual(m.subProgsDe('ref'), []);
  m.subAssocia('ref', 'Pinterest'); assert.deepEqual(m.subProgsDe('ref'), ['Pinterest']);
  m.subAssocia('ps', 'Pinterest');                       // associado a outra: vale a outra
  assert.deepEqual(m.subProgsDe('ref'), []); assert.deepEqual(m.subProgsDe('ps'), ['Pinterest']);
});
