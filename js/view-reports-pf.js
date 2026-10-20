/* =====================================================================
   RELATÓRIOS PF
   Comparação entre meses das despesas e receitas pessoais (tempo_expenses):
   indicadores, leitura automática, barras por mês, rosca por categoria,
   tabela mês a mês, comparação com o ano anterior e exportação em CSV.
   ===================================================================== */
CHANGES['pf-range'] = (el) => { db.setSetting('pfRange', Number(el.value) || 6); render(); };

/* Meses 'YYYY-MM' do mais antigo ao mais recente, terminando no mês atual (ou deslocados). */
function pfMonths(n, shift = 0) {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i + shift, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); }
  return out;
}
const pfMonthLabel = (ym) => { const [y, m] = ym.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1] + '/' + y.slice(2); };
/* cat no banco = "ESCOPO/Categoria" (ex.: "PESSOAL/Saúde", "EMPRESA/Impostos"). Escopo = Pessoal ou Empresa; categoria = Saúde, Impostos… */
const pfParts = (cat) => String(cat || '').split('/').map(x => x.trim()).filter(Boolean);
const pfCat = (cat) => { const p = pfParts(cat); return p.length > 1 ? p.slice(1).join(' / ') : (p[0] || 'Sem categoria'); };
const pfScope = (cat) => { const p = pfParts(cat); return p.length > 1 ? p[0].charAt(0).toUpperCase() + p[0].slice(1).toLowerCase() : '—'; };
const pfHelp = (t) => `<div class="pf-help small muted">${t}</div>`;
const pfDiffTxt = (v) => (!v ? '—' : `${v > 0 ? '+' : '−'}${pfR(Math.abs(v))}`);
const pfR = (v) => fmtMoney(v) || 'R$ 0';
const pfPct = (a, b) => (b ? ((a - b) / b) * 100 : null);
const pfPctTxt = (p) => p === null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(0)}%`;
const PF_PALETTE = ['var(--accent)', 'var(--t-yellow-fg)', 'var(--ok)', 'var(--t-pink-fg)', 'var(--t-purple-fg)', 'var(--t-blue-fg)', 'var(--t-orange-fg)', 'var(--fg-3)'];
const pfChip = (p) => `<span class="pf-chip ${p === null ? '' : p > 0 ? 'up' : p < 0 ? 'down' : ''}">${pfPctTxt(p)}</span>`;

function pfData(months) {
  const rows = db.all('tempo_expenses').filter(r => months.includes(r.month) && r.status !== 'Não teve');
  const byMonth = Object.fromEntries(months.map(m => [m, { out: 0, in: 0 }]));
  const byCat = {}, scopeOf = {};
  rows.forEach(r => {
    const amt = Math.abs(Number(r.amount) || 0);
    if (r.kind === 'in') byMonth[r.month].in += amt;
    else if (r.kind === 'out') {
      byMonth[r.month].out += amt;
      const k = pfCat(r.cat), sc = pfScope(r.cat);
      scopeOf[k] = scopeOf[k] && scopeOf[k] !== sc ? 'Pessoal e Empresa' : (scopeOf[k] || sc);
      byCat[k] = byCat[k] || {};
      byCat[k][r.month] = (byCat[k][r.month] || 0) + amt;
    }
  });
  return { byMonth, byCat, scopeOf };
}
function pfOutSum(months) {
  return db.all('tempo_expenses').filter(r => r.kind === 'out' && months.includes(r.month) && r.status !== 'Não teve').reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0);
}

/* Rosca SVG: top categorias + "Outros". */
function pfDonut(items, total) {
  if (!total) return '<div class="empty small">Sem saídas no período.</div>';
  const R = 70, C = 2 * Math.PI * R; let acc = 0;
  const arcs = items.map((it, i) => {
    const frac = it.total / total; const len = frac * C;
    const seg = `<circle r="${R}" cx="90" cy="90" fill="none" style="stroke:${PF_PALETTE[i % PF_PALETTE.length]}" stroke-width="28" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 90 90)"><title>${esc(it.k)}: ${pfR(it.total)}</title></circle>`;
    acc += len; return seg;
  }).join('');
  const legend = items.map((it, i) => `<li><span class="pf-sw" style="background:${PF_PALETTE[i % PF_PALETTE.length]}"></span><span>${esc(it.k)}</span><span class="grow"></span><span class="mono small">${((it.total / total) * 100).toFixed(0)}%</span></li>`).join('');
  return `<div class="pf-donut"><svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Distribuição das saídas por categoria">${arcs}<text x="90" y="86" text-anchor="middle" class="small" fill="currentColor">Total</text><text x="90" y="104" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">${esc(pfR(total))}</text></svg><ul class="pf-legend">${legend}</ul></div>`;
}

/* Leitura automática: frases curtas com o que mais mexeu. */
function pfInsights(months, byMonth, cats, totOut, totIn) {
  const out = []; const last = months[months.length - 1], prev = months[months.length - 2];
  const withSpend = months.filter(m => byMonth[m].out > 0);
  if (withSpend.length) {
    const peak = months.reduce((a, b) => (byMonth[b].out > byMonth[a].out ? b : a));
    out.push(`Mês mais caro: ${pfMonthLabel(peak)} com ${pfR(byMonth[peak].out)}.`);
  }
  const rises = cats.filter(c => c.delta !== null && c.delta > 0).sort((a, b) => b.diff - a.diff);
  if (rises.length) out.push(`Maior alta em ${esc(rises[0].k)}: ${pfR(rises[0].diff)} a mais que a média, em ${pfMonthLabel(last)}.`);
  const drops = cats.filter(c => c.delta !== null && c.delta < 0).sort((a, b) => a.diff - b.diff);
  if (drops.length) out.push(`Maior queda em ${esc(drops[0].k)}: ${pfR(-drops[0].diff)} abaixo da média.`);
  if (cats.length && totOut) out.push(`${esc(cats[0].k)} responde por ${((cats[0].total / totOut) * 100).toFixed(0)}% de tudo que saiu no período.`);
  if (totIn) out.push(`Taxa de poupança do período: ${(((totIn - totOut) / totIn) * 100).toFixed(0)}% (entradas menos saídas).`);
  if (byMonth[last] && byMonth[prev] && byMonth[prev].out) out.push(`${pfMonthLabel(last)} está ${pfPctTxt(pfPct(byMonth[last].out, byMonth[prev].out))} contra ${pfMonthLabel(prev)}.`);
  return out;
}

VIEWS.reportspf = () => {
  const n = Number(db.setting('pfRange', 6)) || 6;
  const months = pfMonths(n);
  const { byMonth, byCat, scopeOf } = pfData(months);
  const last = months[months.length - 1], prev = months[months.length - 2];
  const max = Math.max(1, ...months.map(m => byMonth[m].out));
  const totOut = months.reduce((s, m) => s + byMonth[m].out, 0);
  const totIn = months.reduce((s, m) => s + byMonth[m].in, 0);
  const avgOut = totOut / n;
  const reimbOpen = db.all('tempo_reimb_rows').filter(r => r.refund_id !== rbStatusId('reimb_refund', 'Feito!'));
  const reimbSum = reimbOpen.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // por categoria: total, último mês, média dos anteriores e diferença
  const cats = Object.entries(byCat).map(([k, v]) => {
    const vals = months.map(m => v[m] || 0);
    const total = vals.reduce((s, x) => s + x, 0);
    const earlier = vals.slice(0, -1); const avgEarly = earlier.reduce((s, x) => s + x, 0) / Math.max(1, earlier.length);
    const lastV = vals[vals.length - 1];
    return { k, scope: scopeOf[k] || '—', vals, total, last: lastV, avgEarly, diff: lastV - avgEarly, delta: pfPct(lastV, avgEarly) };
  }).sort((a, b) => b.total - a.total);
  const top = cats.slice(0, 6);
  const rest = cats.slice(6).reduce((s, c) => s + c.total, 0);
  const donutItems = rest ? [...top, { k: 'Outros', total: rest }] : top;

  // mesmo período do ano passado
  const prevYearOut = pfOutSum(pfMonths(n, -12));
  const yoy = prevYearOut ? pfPct(totOut, prevYearOut) : null;

  const monthBars = months.map(m => {
    const o = byMonth[m].out, i = byMonth[m].in, s = i - o;
    return `<div class="pf-col" title="${pfMonthLabel(m)}\nSaídas: ${pfR(o)}\nEntradas: ${pfR(i)}\nSaldo: ${pfR(s)}"><div class="pf-col-v mono small">${pfR(o)}</div><div class="pf-bar-wrap"><div class="pf-bar ${m === last ? 'now' : ''}" style="height:${Math.max(3, Math.round((o / max) * 100))}%" title="Saídas ${pfR(o)}"></div></div>
      <div class="pf-col-l small muted">${pfMonthLabel(m)}</div>
      <div class="small ${i && s < 0 ? 'pf-neg' : 'muted'}">${i ? 'saldo ' + pfR(s) : ''}</div></div>`;
  }).join('');

  const head = `<th>Categoria</th>${months.map(m => `<th class="num">${pfMonthLabel(m)}</th>`).join('')}<th class="num">Total</th><th class="num">Média/mês</th><th class="num" title="Quanto o último mês ficou acima (vermelho) ou abaixo (verde) da média dos meses anteriores">${pfMonthLabel(last)} vs média</th>`;
  const cmpCell = (delta, diff) => `<td class="num">${pfChip(delta)} <span class="small muted mono">${pfDiffTxt(diff)}</span></td>`;
  const body = cats.map(c => `<tr><td>${esc(c.k)} <span class="pf-scope">${esc(c.scope)}</span></td>${c.vals.map(v => `<td class="num mono">${v ? pfR(v) : '<span class="faint">—</span>'}</td>`).join('')}
    <td class="num mono"><b>${pfR(c.total)}</b></td><td class="num mono">${pfR(c.total / n)}</td>${cmpCell(c.delta, c.diff)}</tr>`).join('');
  const totRow = `<tr class="tot"><td><b>Total de saídas</b></td>${months.map(m => `<td class="num mono"><b>${pfR(byMonth[m].out)}</b></td>`).join('')}<td class="num mono"><b>${pfR(totOut)}</b></td><td class="num mono"><b>${pfR(avgOut)}</b></td><td class="num">${pfChip(pfPct(byMonth[last].out, avgOut))} <span class="small muted mono">${pfDiffTxt(byMonth[last].out - avgOut)}</span></td></tr>`;

  const insights = pfInsights(months, byMonth, cats, totOut, totIn);

  return { title: 'Relatórios PF', actions: `<select class="input sm" data-on="pf-range" aria-label="Período"><option value="3" ${n === 3 ? 'selected' : ''}>3 meses</option><option value="6" ${n === 6 ? 'selected' : ''}>6 meses</option><option value="12" ${n === 12 ? 'selected' : ''}>12 meses</option></select><button class="btn sm" data-act="pf-csv">Exportar CSV</button>`, html: `
  <div class="stack pf-report" style="gap:14px">
    <div class="pf-kpis">
      <div class="kpi"><span class="k">Saídas no período</span><span class="v mono">${pfR(totOut)}</span><span class="s">média ${pfR(avgOut)} / mês</span></div>
      <div class="kpi"><span class="k">Entradas no período</span><span class="v mono">${pfR(totIn)}</span><span class="s">saldo ${pfR(totIn - totOut)}</span></div>
      <div class="kpi"><span class="k">${pfMonthLabel(last)} vs ${prev ? pfMonthLabel(prev) : '—'}</span><span class="v mono">${pfChip(pfPct(byMonth[last].out, byMonth[prev]?.out || 0))}</span><span class="s">${pfR(byMonth[last].out)} contra ${pfR(byMonth[prev]?.out || 0)}</span></div>
      <div class="kpi"><span class="k">Mesmo período do ano passado</span><span class="v mono">${pfChip(yoy)}</span><span class="s">${pfR(prevYearOut)} → ${pfR(totOut)}</span></div>
      <div class="kpi"><span class="k">Reembolsos em aberto</span><span class="v mono">${pfR(reimbSum)}</span><span class="s">${reimbOpen.length} item(ns)</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h3>Leitura do período</h3></div><div class="panel-b"><div class="pf-insights">${insights.map(t => `<div class="pf-insight">${t}</div>`).join('') || '<div class="muted">Ainda não há dados suficientes.</div>'}</div></div></div>
    <div class="grid2">
      <div class="panel"><div class="panel-h"><h3>Saídas por mês</h3></div><div class="panel-b">${pfHelp('Cada coluna é um mês: a altura é o total de saídas. Embaixo, o saldo do mês (entradas − saídas). Passe o mouse para ver entradas, saídas e saldo.')}<div class="pf-chart">${monthBars}</div></div></div>
      <div class="panel"><div class="panel-h"><h3>Onde o dinheiro foi</h3></div><div class="panel-b">${pfHelp('Quanto cada categoria pesou no total de saídas do período. Passe o mouse sobre um pedaço para ver o valor.')}${pfDonut(donutItems, totOut)}</div></div>
    </div>
    <div class="panel"><div class="panel-h"><h3>Saídas por categoria, mês a mês</h3></div>
      <div class="panel-b tight">${pfHelp('Cada linha é uma categoria (ex.: Saúde); o escopo (Pessoal ou Empresa) aparece ao lado. Em “vs média”, o último mês é comparado com a média dos meses anteriores: <b>verde</b> = gastou menos (bom), <b>vermelho</b> = gastou mais.')}<div class="table-scroll"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="99" class="empty">Sem saídas no período.</td></tr>'}${totRow}</tbody></table></div></div></div>
  </div>` };
};

/* CSV do período (categorias por mês), para abrir no Excel ou no Sheets. */
ACTIONS['pf-csv'] = () => {
  const n = Number(db.setting('pfRange', 6)) || 6;
  const months = pfMonths(n);
  const { byCat, scopeOf } = pfData(months);
  const esc2 = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Categoria', 'Escopo', ...months, 'Total'].map(esc2).join(';')];
  Object.entries(byCat).sort((a, b) => Object.values(b[1]).reduce((s, x) => s + x, 0) - Object.values(a[1]).reduce((s, x) => s + x, 0))
    .forEach(([k, v]) => { const vals = months.map(m => Math.round((v[m] || 0) * 100) / 100); lines.push([k, scopeOf[k] || '', ...vals, Math.round(vals.reduce((s, x) => s + x, 0) * 100) / 100].map(esc2).join(';')); });
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `relatorio-pf-${months[0]}_${months[months.length - 1]}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
