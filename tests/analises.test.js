// Análises: relatório com destaques, gráficos e PDF.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const AMOSTRA = {
  periodo_inicio: '2026-11-09', periodo_fim: '2026-11-15', gerado_em: '2026-11-16T10:15:00Z', titulo: 'Semana de 09 a 15/11/2026',
  resumo: 'Semana de retomada após as férias.',
  kpis: [{ rotulo: 'Horas líquidas', valor: '31 h', detalhe: '+4 h', tendencia: 'sobe', bom: true }, { rotulo: 'Distração', valor: '4,2 h', detalhe: '+1 h', tendencia: 'sobe', bom: false }],
  graficos: [
    { titulo: 'Horas por dia', tipo: 'colunas', unidade: 'h', rotulos: ['Seg', 'Ter', 'Qua'], series: [{ nome: 'Produtivo', valores: [6, 5.5, 7] }, { nome: 'Distração', valores: [1, 0.5, 0.8] }] },
    { titulo: 'Horas por projeto', tipo: 'barras', unidade: 'h', rotulos: ['Bem Brasil', 'VitaBrasil <x>'], series: [{ nome: 'h', valores: [12, 8] }] },
    { titulo: '% produtivo', tipo: 'linha', unidade: '%', rotulos: ['S1', 'S2', 'S3'], series: [{ nome: '%', valores: [62, 68, 71] }] },
    { titulo: 'vazio', tipo: 'colunas', rotulos: [], series: [] },
  ],
  secoes: [{ titulo: 'Projetos', itens: ['Bem Brasil vence quinta.'] }],
  comparacoes: { semana_anterior: '+4 h' }, sugestoes: ['Bloquear 9h–11h.'],
  acompanhamento: [{ sugestao: 'Silenciar WhatsApp', seguiu: 'parcial', resultado: '-30 min' }],
  metas_novas: [{ nome: '32 h líquidas', alvo: '32 h' }],
};
function setup() {
  const m = load(['js/store.js', 'js/domain.js', 'js/view-analises.js'], ['db', 'anCorpoHTML', 'anChartSVG', 'anPdfHTML', 'anLista', 'VIEWS', 'AN_TIPOS', 'AN'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', isMacApp: () => false, fmtH: (ms) => String(ms), usePctTxt: (p) => p + '%' });
  m.db.data = m.db.empty(); m.db.loaded = true;
  return m;
}
test('relatório: destaques, gráficos em SVG e texto escapado', () => {
  const t = setup();
  const h = t.anCorpoHTML(AMOSTRA);
  assert.match(h, /an-kpi bom/); assert.match(h, /an-kpi ruim/);
  assert.equal((h.match(/<svg/g) || []).length, 3, 'gráfico sem dados não aparece');
  assert.ok(!h.includes('<x>'), 'texto vindo do banco é escapado');
  assert.match(h, /Sugestões anteriores/);
});
test('lista de análises por tipo e a tela abre a mais recente', () => {
  const t = setup();
  t.db.insert('tempo_settings', { key: 'prodSemanal:2026-11-02', value: { semana_inicio: '2026-11-02', semana_fim: '2026-11-08', numeros: { produtivo_ms: 1 } } }, true);
  t.db.insert('tempo_settings', { key: 'prodSemanal:2026-11-09', value: JSON.stringify(AMOSTRA) }, true);
  assert.deepEqual([...t.anLista('prodSemanal:')].map(x => x.key), ['prodSemanal:2026-11-09', 'prodSemanal:2026-11-02']);
  const v = t.VIEWS.analises();
  assert.match(v.html, /Semana de 09 a 15\/11\/2026/); assert.match(v.actions, /an-pdf/);
  t.AN.tipo = 'ano'; assert.match(t.VIEWS.analises().html, /1º de janeiro/);
});
test('PDF: página completa com estilo próprio', () => {
  const t = setup();
  const h = t.anPdfHTML(t.AN_TIPOS[0], AMOSTRA);
  assert.match(h, /^<!DOCTYPE html>/); assert.match(h, /@page\{size:A4/); assert.match(h, /class="capa"/);
  require('fs').writeFileSync('/tmp/an-amostra.html', h);
});
test('texto em blocos: título antes de ":" ou a primeira frase, números realçados e escapados', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/view-analises.js'], ['anPartes', 'anRealce', 'anItem'], { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, icon: () => '' });
  assert.deepEqual({ ...m.anPartes('Horas líquidas: 34h34. Base 58h15.') }, { t: 'Horas líquidas', c: '34h34. Base 58h15.' });
  assert.equal(m.anPartes('Nenhum recebimento até 22/11/2026. Último: R$ 20.198.').t, 'Nenhum recebimento até 22/11/2026');
  const r = m.anRealce('Subiu de 3h22 para 4h45, R$ 13.500 e 59,3% em 18/11 <x>');
  ['3h22', '4h45', 'R$ 13.500', '59,3%', '18/11'].forEach(n => assert.ok(r.includes(`<b class="an-n">${n}</b>`), n));
  assert.ok(!r.includes('<x>'));
  assert.match(m.anItem('Prazo curto.', 1), /an-it-n">1</);
});
test('metas com barra: lê alvo e resultado, "até" é limite, e não desenha quando discorda da análise', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/view-analises.js'], ['anNum', 'anMetaBarra'], { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, icon: () => '', fmtDur: (ms) => Math.round(ms / 6e4) + 'min', fmtMoney0: (v) => 'R$ ' + v });
  assert.deepEqual({ ...m.anNum('34h34') }, { n: (34 * 60 + 34) * 6e4, u: 'ms' });
  assert.deepEqual({ ...m.anNum('até 4h30') }, { n: 270 * 6e4, u: 'ms' });
  assert.deepEqual({ ...m.anNum('R$ 33.000,00') }, { n: 33000, u: 'R$' });
  assert.deepEqual({ ...m.anNum('59,3%') }, { n: 59.3, u: '%' });
  const bate = m.anMetaBarra({ nome: 'Horas líquidas', alvo: '30 h', resultado: '34h34', conquistada: true }, {}, false);
  assert.match(bate, /an-mbar ok/); assert.match(bate, /bateu/);
  const limite = m.anMetaBarra({ nome: 'Distração na semana', alvo: 'até 5 h', resultado: '6h', conquistada: false }, {}, false);
  assert.match(limite, /over/); assert.match(limite, /passou/);
  assert.equal(m.anMetaBarra({ nome: 'Desafio', alvo: '1 h com até 5 pausas', resultado: 'Bateu: 6h06', conquistada: true }, {}, false), '');
});
