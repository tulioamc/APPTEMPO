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
