// Conta do orçamento: hora × porte × mercado, duração, complexidade, reuniões, urgência, desconto, BV, imposto e total digitado.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const setup = () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/orcamento.js'], ['db', 'calcQuote', 'calcRate', 'precoBase', 'redistribuiHoras'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
  m.db.data = m.db.empty(); return m;
};
const ST = (o = {}) => ({ porte: 'medio', mercado: 'local', outro: false, lines: [{ h: 20 }], duracao: '', cx: 'simples', aprov: '', pedido: '', desc: '', descTipo: 'R$', alvo: null,
  nf: { on: false, pct: 9, inside: false }, bv: { on: false, pct: 10 }, ext: { on: false, items: [] }, ...o });
const perto = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≠ ${b}`);

test('valor-hora: 200 × porte × mercado (grande nacional = 450)', () => {
  const m = setup(); const pb = m.precoBase();
  perto(m.calcRate(ST({ porte: 'grande', mercado: 'nacional' }), pb), 450);
  perto(m.calcRate(ST({ porte: 'pequeno', mercado: 'local' }), pb), 170);
  perto(m.calcRate(ST({ outro: true, customRate: 120 }), pb), 120);
  // exemplo do doc: 20 h, grande de São Paulo = R$ 9.000
  perto(m.calcQuote(ST({ porte: 'grande', mercado: 'nacional' }), pb).total, 9000);
});
test('duração (mín. 30 s), complexidade e 1 h de reunião por aprovação', () => {
  const m = setup(); const pb = m.precoBase();
  assert.equal(m.calcQuote(ST({ modelo: 'motion2d', duracao: 2, cx: 'padrao', aprov: 3 }), pb).h, 20 * 2 * 1.3 + 3);
  assert.equal(m.calcQuote(ST({ modelo: 'motion2d', duracao: 0.2 }), pb).h, 10);
  assert.equal(m.calcQuote(ST({ duracao: 3 }), pb).h, 20, 'fora de modelo de vídeo a duração não conta');
});
test('urgência = prazo fechado ÷ pedido, teto 2×', () => {
  const m = setup(); const pb = m.precoBase();   // 40 h = 5 dias
  const c = m.calcQuote(ST({ lines: [{ h: 40 }], pedido: 4 }), pb);
  assert.equal(c.fechado, 5); perto(c.urg, 1.25);
  const d = m.calcQuote(ST({ lines: [{ h: 40 }], pedido: 2 }), pb);
  assert.equal(d.urg, 2); assert.ok(d.semPrazo);
  assert.equal(m.calcQuote(ST({ lines: [{ h: 40 }], pedido: 10 }), pb).urg, 1);
});
test('desconto só na minha parte; BV e imposto por cima; terceirizado intacto', () => {
  const m = setup(); const pb = m.precoBase();   // 20 h × 230 = 4600
  const c = m.calcQuote(ST({ desc: 10, descTipo: '%', ext: { on: true, items: [{ value: 1000 }] }, bv: { on: true, pct: 10 }, nf: { on: true, pct: 10, inside: false } }), pb);
  perto(c.Mf, 4140); perto(c.C, 514); perto(c.total, (4140 + 1000 + 514) * 1.1);
  perto(c.horaEf, 207);
});
test('total digitado: só a minha parte se ajusta', () => {
  const m = setup(); const pb = m.precoBase();
  const c = m.calcQuote(ST({ alvo: 6600, ext: { on: true, items: [{ value: 1000 }] }, nf: { on: true, pct: 10, inside: false } }), pb);
  perto(c.total, 6600); perto(c.B, 1000); perto(c.Mf, 5000); perto(c.desc, 4600 - 5000);
});
test('total das etapas se espalha na proporção (6/18/6 → 8/24/8)', () => {
  const m = setup();
  assert.deepEqual(m.redistribuiHoras([{ h: 6 }, { h: 18 }, { h: 6 }], 40).map(x => x.h), [8, 24, 8]);
});

test('proposta abre com a calculadora; proposta antiga abre no simplificado', () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/table.js', 'js/view-projects.js', 'js/orcamento.js', 'js/view-tasks-quotes.js', 'js/proposta.js'], ['db', 'openQuote', 'propNome'],
    { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: { quote: { q: '', status: '' } }, openBtn: () => '' });
  m.db.data = m.db.empty(); m.db.loaded = true;
  let render = null;
  m.ctx.openLayer = (o) => { render = o.render; return { box: { addEventListener() {}, classList: { toggle() {} } }, refresh() {}, close() {} }; };
  m.openQuote(null);
  const html = render();
  assert.ok(html.includes('Com calculadora') && html.includes('Orçamento simplificado'));
  assert.ok(html.includes('Hora base') && html.includes('Projetos e etapas') && html.includes('Total final da proposta'));
  m.db.data.tempo_quotes = [{ id: 'q1', name: 'Antiga', value: 5000, est_hours: 20, calc: { computed: 5000, lines: [{ h: 20 }], contingency: 10 } }];
  m.openQuote('q1');
  const h2 = render();
  assert.ok(!h2.includes('Hora base') && h2.includes('Horas estimadas'), 'antiga abre no simplificado');
});

test('modelos: identidade 34 h; motion 2D 42 h/min com 4 aprovações e prazo fechado por etapas', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/orcamento.js'], ['db', 'calcQuote', 'precoBase', 'aplicaModelo'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
  m.db.data = m.db.empty();
  const st = { porte: 'medio', mercado: 'local', lines: [], cx: 'simples', nf: { on: false }, bv: { on: false }, ext: { on: false, items: [] } };
  m.aplicaModelo(st, 'identidade', [{ id: 'b', name: 'Branding / marcas' }]);
  assert.equal(st.lines.length, 4); assert.equal(st.lines[0].wt, 'b'); assert.equal(st.aprov, 2);
  let c = m.calcQuote(st, m.precoBase());
  assert.equal(c.hEtapas, 34); assert.equal(c.fechado, 12);
  m.aplicaModelo(st, 'motion2d', []);
  assert.equal(st.duracao, 1); assert.equal(st.aprov, 4);
  c = m.calcQuote(st, m.precoBase());
  assert.equal(c.hEtapas, 42); assert.equal(c.h, 46); assert.equal(c.fechado, 21);
  assert.ok(c.provavel > c.fechado);
  st.duracao = 2; c = m.calcQuote(st, m.precoBase());
  assert.equal(c.h, 88); assert.equal(c.fechado, 42);
});

test('proposta em PDF: itens por etapa somam o total e condições padrão', () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/orcamento.js', 'js/proposta.js'], ['db', 'propItens', 'propCondicoes', 'propHTML', 'propEstado'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
  m.db.data = m.db.empty();
  const x = { name: 'ID Visual', value: 10000, revisions_included: 2, client_id: null,
    calc: { lines: [{ name: 'Pesquisa', h: 2, prazo: 2 }, { name: 'Marca', h: 12, prazo: 4 }, { name: 'Apresentação', h: 10, prazo: 3 }], cx: 'simples', porte: 'medio', mercado: 'local', nf: { on: false }, bv: { on: false }, ext: { on: false, items: [] } } };
  const it = m.propItens(x);
  assert.equal(it.length, 3); assert.equal(it.reduce((s, i) => s + i.valor, 0), 10000);
  const c = m.propCondicoes(x);
  assert.ok(c[0].includes('três etapas: pesquisa, marca e apresentação'));
  assert.ok(c.some(l => l.includes('9 dias úteis')));
  assert.ok(c.some(l => l.includes('duas rodadas de ajustes por etapa')));
  const html = m.propHTML(m.propEstado(x));
  assert.ok(html.includes('DM Mono') && html.includes('Orçamento') && html.includes('10.000'));
});

test('relatório do mês do cliente: horas por projeto e tarefa', () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/orcamento.js', 'js/proposta.js', 'js/relatorio-cliente.js'], ['db', 'relClienteDados', 'relClienteHTML'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
  m.db.data = m.db.empty();
  m.db.data.tempo_clients = [{ id: 'c', name: 'Bem Brasil' }];
  m.db.data.tempo_projects = [{ id: 'p', name: 'Vinheta', client_id: 'c', sent_at: '2026-11-10T12:00:00Z' }];
  m.db.data.tempo_tasks = [{ id: 't', project_id: 'p', name: 'Animação' }];
  m.db.data.tempo_time_entries = [{ id: 'e', project_id: 'p', task_id: 't', segments: [{ s: '2026-11-05T12:00:00Z', e: '2026-11-05T15:00:00Z' }] }];
  const d = m.relClienteDados('client', 'c', '2026-11');
  assert.equal(d.total, 3 * 36e5); assert.equal(d.linhas[0].entregue, true);
  assert.ok(m.relClienteHTML('client', 'c', '2026-11').includes('Animação'));
});

test('mais de um modelo: Identidade + Manual somam etapas, aprovações e prazo', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/orcamento.js'], ['db', 'calcQuote', 'precoBase', 'aplicaModelo'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
  m.db.data = m.db.empty();
  const st = { porte: 'medio', mercado: 'local', lines: [{ name: '', h: '' }], cx: 'simples', nf: { on: false }, bv: { on: false }, ext: { on: false, items: [] } };
  m.aplicaModelo(st, 'identidade', []);
  m.aplicaModelo(st, 'manual', [], 'adiciona');
  assert.equal(st.lines.length, 5); assert.deepEqual([...st.modelos], ['identidade', 'manual']); assert.equal(st.aprov, 3);
  const c = m.calcQuote(st, m.precoBase());
  assert.equal(c.hEtapas, 50); assert.equal(c.fechado, 17);
  m.aplicaModelo(st, 'motion2d', [], 'substitui');
  assert.equal(st.lines.length, 6); assert.deepEqual([...st.modelos], ['motion2d']);
});

test('vários projetos na proposta: horas por projeto, paralelo não conta, reordenar', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/orcamento.js'], ['db', 'calcQuote', 'precoBase', 'aplicaModelo', 'moveEtapa'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
  m.db.data = m.db.empty();
  const st = { porte: 'medio', mercado: 'local', lines: [{ name: '', h: '' }], cx: 'simples', nf: { on: false }, bv: { on: false }, ext: { on: false, items: [] } };
  m.aplicaModelo(st, 'identidade', []);
  m.aplicaModelo(st, 'manual', [], 'adiciona');
  m.aplicaModelo(st, 'motion2d', [], 'adiciona');
  st.duracao = 2;
  assert.equal(st.grupos.length, 3);
  const c = m.calcQuote(st, m.precoBase());
  assert.deepEqual(c.porGrupo.map(g => g.h), [34, 16, 84], 'vídeo de 2 min dobra só o projeto de vídeo');
  assert.ok(Math.abs(c.porGrupo.reduce((s, g) => s + g.parte, 0) - 1) < 1e-9);
  // paralelo: a etapa não soma horas
  st.lines[1].par = true; const c2 = m.calcQuote(st, m.precoBase());
  assert.equal(c2.porGrupo[0].h, 22);
  // reordenar e mudar de projeto
  const nome = st.lines[0].name; m.moveEtapa(st, 0, 6, st.grupos[1].id);
  assert.equal(st.lines[5].name, nome); assert.equal(st.lines[5].grp, st.grupos[1].id);
});

test('nome do arquivo do orçamento: NÚMERO_Agência_Cliente_ANO_MÊS', () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/orcamento.js', 'js/proposta.js'], ['db', 'propNome'], { VIEWS: {}, ACTIONS: {}, CHANGES: {} });
  m.db.data = m.db.empty();
  m.db.data.tempo_agencies = [{ id: 'a', name: 'BRENDA' }, { id: 'd', name: 'Cliente Direto' }];
  m.db.data.tempo_clients = [{ id: 'c', name: 'BEM BRASIL', agency_id: 'a' }, { id: 'k', name: 'AmiGo', agency_id: 'd' }];
  assert.equal(m.propNome({ num: 1021, data: '2026-11-17' }, { client_id: 'c' }), '1021_BRENDA_BEM-BRASIL_2026_NOV');
  assert.equal(m.propNome({ num: 1022, data: '2026-12-02' }, { client_id: 'k' }), '1022_AmiGo_2026_DEZ');
});
