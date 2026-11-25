// Financeiro: série mês a mês (Entrada, Saída, Saldo, Terapia, Reembolso, Interno) e dentista fora das terapias.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

function setup(txns) {
  const m = load(['js/config.js', 'js/store.js', 'js/domain.js', 'js/view-expenses.js', 'js/view-reimb.js', 'js/finance-bank.js'], ['BANK', 'bankSeriesMes', 'bankTrendChartHTML', 'bankFamily', 'FIN_INICIO_YM'],
    { ymd: (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), fmtMoney0: (v) => 'R$ ' + Math.round(v), esc: (s) => String(s), rbLabel: (m) => m,
      pfMonthLabel: (m) => m, ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, TABLE_DEFS: {}, toast() {}, render() {}, icon: () => '' });
  m.BANK.every = txns; m.BANK.all = { pf: txns, pj: [] };
  return m;
}
const t = (o) => ({ id: Math.random().toString(36), scope: 'externa', entity: 'pf', ...o });

test('série do mês: terapia e reembolso de terapia saem de Saída/Entrada; interno fica à parte; saldo fecha', () => {
  const m = setup([
    t({ posted_on: '2026-10-05', flow: 'in', amount: 20000 }),
    t({ posted_on: '2026-10-06', flow: 'out', amount: -5000, counterpart: 'Aluguel' }),
    t({ posted_on: '2026-10-07', flow: 'out', amount: -1500, category: 'Terapia', counterpart: 'Terapeuta' }),
    t({ posted_on: '2026-10-20', flow: 'in', amount: 600, category: 'Reembolso Terapias' }),
    t({ posted_on: '2026-10-21', flow: 'in', amount: 100, category: 'Reembolso Outros' }),
    t({ posted_on: '2026-10-22', flow: 'in', amount: 22230, scope: 'interna' }),
    t({ posted_on: '2026-10-23', flow: 'out', amount: -1650, scope: 'interna' }),
  ]);
  const r = m.bankSeriesMes('pf')['2026-10'];
  assert.equal(r.ent, 20100);   // reembolso "outros" conta como entrada normal
  assert.equal(r.sai, 5000);
  assert.equal(r.ter, 1500);
  assert.equal(r.rei, 600);
  assert.equal(r.int, 22230 + 1650);
  assert.equal(r.sal, 15100);
});

test('gráfico: desenha as seis linhas e as dicas por mês', () => {
  const m = setup([t({ posted_on: '2026-10-05', flow: 'in', amount: 1000 }), t({ posted_on: '2026-11-05', flow: 'out', amount: -400 })]);
  m.BANK.month = '2026-11';
  const html = m.bankTrendChartHTML('pf', '2026-11');
  assert.equal((html.match(/class="tr-s tr-s-/g) || []).length, 6);
  assert.ok(html.includes('data-tip'));
});

test('dentista não é terapia (não tem reembolso)', () => {
  const m = setup([]);
  assert.equal(m.bankFamily('Cristiana Abrantes da Fonte (Dentista)'), null);
  assert.equal(m.bankFamily('Dentista'), null);
});
