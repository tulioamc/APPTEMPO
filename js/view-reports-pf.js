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
/* Valor curto para a tabela (o exato fica na dica): R$ 3,9 mil · R$ 604 */
const pfK = (v) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1000 ? `${s}R$ ${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} mil` : `${s}R$ ${Math.round(a).toLocaleString('pt-BR')}`; };
const pfPct = (a, b) => (b ? ((a - b) / b) * 100 : null);
const pfPctTxt = (p) => p === null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(0)}%`;
const PF_PALETTE = GRAF_CORES;
const pfCor = (k, i) => (k === 'Menores de 1%' ? GRAF_CINZA : corGraf(typeof chartCat === 'function' ? chartCat(k) : PF_PALETTE[i % PF_PALETTE.length]));
const pfChip = (p) => `<span class="pf-chip ${p === null ? '' : p > 0 ? 'up' : p < 0 ? 'down' : ''}">${pfPctTxt(p)}</span>`;

/* Dados de hoje: extrato da conta PF já categorizado (Financeiro PF), com estornos abatendo a categoria,
   pagamento de fatura fora (as compras do cartão já entram uma a uma) e terapias fora (são reembolsadas). */
function pfData(months) {
  const byMonth = {}, byCat = {}, scopeOf = {};
  months.forEach(m => {
    const s = typeof monthSnap === 'function' ? monthSnap('pf', m) : { ent: 0, sai: 0, cats: {} };
    byMonth[m] = { out: s.sai, in: s.ent };
    Object.entries(s.cats).forEach(([k, v]) => { if (!v) return; (byCat[k] = byCat[k] || {})[m] = v; scopeOf[k] = 'PF'; });
  });
  return { byMonth, byCat, scopeOf };
}
function pfOutSum(months) { return months.reduce((t, m) => t + (typeof monthSnap === 'function' ? monthSnap('pf', m).sai : 0), 0); }
const pfTemDados = (m) => (BANK.all.pf || []).some(t => (t.posted_on || '').startsWith(m) && t.scope !== 'interna');

/* Rosca SVG: top categorias + "Outros". */
function pfDonut(items, total) {
  if (!total) return '<div class="empty small">Sem saídas no período.</div>';
  const R = 70, C = 2 * Math.PI * R; let acc = 0;
  const arcs = items.map((it, i) => {
    const frac = it.total / total; const len = frac * C;
    const seg = `<circle data-hk="${esc(it.k)}" ${it.membros ? `data-tip="${esc(`${it.k} · ${pfR(it.total)}\n${it.membros.map(c => `${c.k}: ${pfR(c.total)}`).join('\n')}`)}"` : it.serie ? `data-tipg="${esc(JSON.stringify(it.serie))}"` : `data-tip="${esc(it.k + ': ' + pfR(it.total))}"`} r="${R}" cx="90" cy="90" fill="none" style="stroke:${pfCor(it.k, i)}" stroke-width="28" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 90 90)"></circle>`;
    acc += len; return seg;
  }).join('');
  const legend = items.map((it, i) => `<span class="act-chip" data-hk="${esc(it.k)}" data-hkv="${it.total}" style="--tb:${pfCor(it.k, i)}" ${it.membros ? `data-tip="${esc(`${it.k}\n${it.membros.map(c => `${c.k}: ${pfR(c.total)}`).join('\n')}`)}"` : it.serie ? `data-tipg="${esc(JSON.stringify(it.serie))}"` : ''}><i></i>${esc(it.k)} <span class="faint">${((it.total / total) * 100).toFixed(0)}% · ${esc(pfR(it.total))}</span></span>`).join('');
  return `<div class="pf-donut" data-hkroot data-hktot="${total}"><svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Distribuição das saídas por categoria">${arcs}<text x="90" y="86" text-anchor="middle" class="small" fill="currentColor">Total</text><text x="90" y="104" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">${esc(pfR(total))}</text></svg><div class="act-chips">${legend}</div></div>`;
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
  if (typeof bankRefresh === 'function') bankRefresh();
  const n = Number(db.setting('pfRange', 6)) || 6;
  // só meses com extrato (o mês atual entra mesmo parcial)
  const months = pfMonths(n).filter((m, i, a) => i === a.length - 1 || pfTemDados(m));
  if (!months.length) months.push(pfMonths(1)[0]);
  const { byMonth, byCat, scopeOf } = pfData(months);
  const last = months[months.length - 1], prev = months[months.length - 2];
  const max = Math.max(1, ...months.map(m => byMonth[m].out));
  const totOut = months.reduce((s, m) => s + byMonth[m].out, 0);
  const totIn = months.reduce((s, m) => s + byMonth[m].in, 0);
  const fechados = months.slice(0, -1);   // média sem o mês atual, que ainda está correndo
  const avgOut = fechados.length ? fechados.reduce((t, m) => t + byMonth[m].out, 0) / fechados.length : totOut;
  const reimbOpen = db.all('tempo_reimb_rows').filter(r => r.refund_id !== rbStatusId('reimb_refund', 'Feito!'));
  const reimbSum = reimbOpen.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // por categoria: total, último mês, média dos anteriores e diferença
  const cats = Object.entries(byCat).map(([k, v]) => {
    const vals = months.map(m => v[m] || 0);
    const total = vals.reduce((s, x) => s + x, 0);
    const earlier = vals.slice(0, -1); const avgEarly = earlier.reduce((s, x) => s + x, 0) / Math.max(1, earlier.length);
    const lastV = vals[vals.length - 1];
    const serie = { t: k, s: `Total ${pfR(total)} · média ${pfR(total / months.length)}/mês`, r: months.map(pfMonthLabel), v: vals.map(x => Math.round(x)), u: 'R$' };
    return { k, scope: scopeOf[k] || '—', vals, total, last: lastV, avgEarly, diff: lastV - avgEarly, delta: pfPct(lastV, avgEarly), serie };
  }).sort((a, b) => b.total - a.total);
  // rosca: toda categoria com 1% ou mais aparece sozinha; só as menores de 1% vão para "Pequenas" (a dica lista quais)
  const grandes = cats.filter(c => c.total > 0 && c.total / (totOut || 1) >= .01);
  const miudas = cats.filter(c => c.total > 0 && c.total / (totOut || 1) < .01);
  const donutItems = miudas.length ? [...grandes, { k: 'Menores de 1%', total: miudas.reduce((s, c) => s + c.total, 0), membros: miudas }] : grandes;

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
  const body = cats.map((c, i) => `<tr class="pf-tr" data-tipg="${esc(JSON.stringify({ ...c.serie, c: pfCor(c.k, i) }))}"><td><span class="pf-cat"><i style="background:${pfCor(c.k, i)}"></i>${esc(c.k)}</span></td>${c.vals.map(v => `<td class="num mono" ${v ? `data-tip="${esc(pfR(v))}"` : ''}>${v ? pfK(v) : '<span class="faint">—</span>'}</td>`).join('')}
    <td class="num mono" data-tip="${esc(pfR(c.total))}"><b>${pfK(c.total)}</b></td><td class="num mono" data-tip="${esc(pfR(c.total / months.length))}">${pfK(c.total / months.length)}</td>${cmpCell(c.delta, c.diff)}</tr>`).join('');
  const totRow = `<tr class="tot pf-tr" data-tipg="${esc(JSON.stringify({ t: 'Total de saídas', s: `Média ${pfR(avgOut)}/mês`, r: months.map(pfMonthLabel), v: months.map(m => Math.round(byMonth[m].out)), u: 'R$' }))}"><td><span class="pf-cat"><b>Total de saídas</b></span></td>${months.map(m => `<td class="num mono" data-tip="${esc(pfR(byMonth[m].out))}"><b>${pfK(byMonth[m].out)}</b></td>`).join('')}<td class="num mono" data-tip="${esc(pfR(totOut))}"><b>${pfK(totOut)}</b></td><td class="num mono" data-tip="${esc(pfR(avgOut))}"><b>${pfK(avgOut)}</b></td><td class="num">${pfChip(pfPct(byMonth[last].out, avgOut))} <span class="small muted mono">${pfDiffTxt(byMonth[last].out - avgOut)}</span></td></tr>`;

  const insights = pfInsights(months, byMonth, cats, totOut, totIn);

  return { title: 'Gastos PF', actions: `<select class="input sm" data-on="pf-range" aria-label="Período"><option value="3" ${n === 3 ? 'selected' : ''}>3 meses</option><option value="6" ${n === 6 ? 'selected' : ''}>6 meses</option><option value="12" ${n === 12 ? 'selected' : ''}>12 meses</option></select><button class="btn sm" data-act="pf-csv">Exportar CSV</button>`, html: `
  <div class="stack pf-report" style="gap:14px">
    <div class="pf-kpis">
      <div class="kpi"><span class="k">Saídas no período</span><span class="v mono">${pfR(totOut)}</span><span class="s">média ${pfR(avgOut)} / mês</span></div>
      <div class="kpi"><span class="k">Entradas no período</span><span class="v mono">${pfR(totIn)}</span><span class="s">saldo ${pfR(totIn - totOut)}</span></div>
      <div class="kpi"><span class="k">${pfMonthLabel(last)} vs ${prev ? pfMonthLabel(prev) : '—'}</span><span class="v mono">${pfChip(pfPct(byMonth[last].out, byMonth[prev]?.out || 0))}</span><span class="s">${pfR(byMonth[last].out)} contra ${pfR(byMonth[prev]?.out || 0)}</span></div>
      <div class="kpi"><span class="k">Mesmo período do ano passado</span><span class="v mono">${pfChip(yoy)}</span><span class="s">${pfR(prevYearOut)} → ${pfR(totOut)}</span></div>
      <div class="kpi"><span class="k">Reembolsos em aberto</span><span class="v mono">${pfR(reimbSum)}</span><span class="s">${reimbOpen.length} item(ns)</span></div>
    </div>
    <div class="small muted">Do extrato da conta PF (como está no Financeiro PF): compras do cartão uma a uma, estornos abatendo a categoria, pagamento da fatura e terapias (reembolsadas) fora. ${fechados.length ? `Média dos meses fechados (${fechados.length}); ${pfMonthLabel(last)} ainda está correndo.` : ''}</div>
    <div class="panel"><div class="panel-h"><h3>Leitura do período</h3></div><div class="panel-b"><div class="pf-insights">${insights.map(t => `<div class="pf-insight">${t}</div>`).join('') || '<div class="muted">Ainda não há dados suficientes.</div>'}</div></div></div>
    <div class="grid2">
      <div class="panel"><div class="panel-h"><h3>Saídas por mês</h3></div><div class="panel-b">${pfHelp('Cada coluna é um mês: a altura é o total de saídas. Embaixo, o saldo do mês (entradas − saídas). Passe o mouse para ver entradas, saídas e saldo.')}<div class="pf-chart">${monthBars}</div></div></div>
      <div class="panel"><div class="panel-h"><h3>Onde o dinheiro foi</h3></div><div class="panel-b">${pfHelp('Quanto cada categoria pesou no total de saídas do período. Passe o mouse sobre uma categoria para ver a evolução mês a mês (clique para deixar o gráfico parado); as menores de 1% ficam juntas e a dica diz quais são.')}${pfDonut(donutItems, totOut)}</div></div>
    </div>
    <div class="panel"><div class="panel-h"><h3>Saídas por categoria, mês a mês</h3></div>
      <div class="panel-b tight">${pfHelp('Cada linha é uma categoria do extrato PF (as mesmas do Financeiro PF). Valores arredondados. Passe o mouse numa linha para ver a evolução da categoria (num valor, o exato); clique para deixar o gráfico parado. Em “vs média”, o último mês é comparado com a média dos meses anteriores: <b>verde</b> = gastou menos (bom), <b>vermelho</b> = gastou mais.')}<div class="table-scroll"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="99" class="empty">Sem saídas no período.</td></tr>'}${totRow}</tbody></table></div></div></div>
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
