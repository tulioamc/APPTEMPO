/* Gráficos de tempo: barras horizontais (tarefa, projeto) e colunas empilhadas por mês (projeto, cliente, agência). */
const CHART_FALLBACK = '#7C8592';

/* Padrão de gráficos: cada item tem uma chave (data-hk). Dentro do mesmo [data-hkroot], passar o mouse num item
   ou num chip acende esse item e esmaece o resto. Tudo mostra a parte, a % e o valor. */
function hkPct(v, tot) { return (tot > 0 ? v / tot * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
const fmtKey = (f) => (f === fmtDur ? 'dur' : f === fmtH ? 'h' : f === fmtMoney0 ? 'money' : '');
function stdBarsHTML(items, fmtVal, total = null) {
  const rows = items.filter(i => i.v > 0);
  if (!rows.length) return '<div class="faint small">Sem registro.</div>';
  const tot = total || rows.reduce((s, i) => s + i.v, 0);
  const max = Math.max(...rows.map(i => i.v));
  const bars = rows.map(i => `<div class="bar-row" data-hk="${esc(i.key)}" data-hkv="${i.v}"><span class="lab" title="${esc(i.label)}">${esc(i.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${(i.v / max * 100).toFixed(1)}%;background:${i.color || 'var(--accent)'}"></div></div><span class="val mono">${fmtVal(i.v)} · ${hkPct(i.v, tot)}</span></div>`).join('');
  const chips = rows.map(i => `<span class="act-chip" data-hk="${esc(i.key)}" data-hkv="${i.v}" style="--tb:${i.color || 'var(--accent)'}"><i></i>${esc(i.label)} <span class="faint">${hkPct(i.v, tot)} · ${fmtVal(i.v)}</span></span>`).join('');
  return `<div data-hkroot data-hktot="${tot}" data-hkfmt="${fmtKey(fmtVal)}"><div class="bars">${bars}</div><div class="act-chips" style="margin-top:8px">${chips}</div></div>`;
}
function hbarsHTML(items) {
  const rows = items.filter(i => i.ms > 0).sort((a, b) => b.ms - a.ms);
  if (!rows.length) return '<div class="faint small">Sem tempo registrado.</div>';
  return stdBarsHTML(rows.map(r => ({ key: r.label, label: r.label, v: r.ms, color: r.color })), fmtH);
}

/* 12 meses, uma coluna por mês; cada coluna empilha o tempo de cada chave (projeto, por exemplo). */
function monthsHTML(entries, keyOf, labelOf, colorOf) {
  const now = new Date(); const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, name: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') });
  }
  const data = {}, keys = {};
  entries.forEach(e => {
    const m = ymd(entryStart(e)).slice(0, 7); if (!months.some(x => x.k === m)) return;
    const k = keyOf(e); data[m] = data[m] || {}; data[m][k] = (data[m][k] || 0) + entryMs(e); keys[k] = true;
  });
  const totals = months.map(m => Object.values(data[m.k] || {}).reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  if (!totals.some(Boolean)) return '<div class="faint small">Sem tempo nos últimos 12 meses.</div>';
  const cols = months.map((m, idx) => {
    const parts = Object.entries(data[m.k] || {}).sort((a, b) => b[1] - a[1]);
    return `<div class="mcol" title="${m.name}: ${fmtH(totals[idx])}"><div class="mstack" style="height:${(totals[idx] / max * 100).toFixed(1)}%">${parts.map(([k, ms]) => `<span data-hk="${esc(labelOf(k))}" style="flex:0 0 ${(ms / totals[idx] * 100).toFixed(2)}%;background:${colorOf(k)}" title="${esc(labelOf(k))} · ${fmtH(ms)} · ${hkPct(ms, totals[idx])} deste mês"></span>`).join('')}</div><span class="mlab">${m.name}</span></div>`;
  }).join('');
  const grand = totals.reduce((s, v) => s + v, 0);
  const kt = (k) => months.reduce((s, m) => s + ((data[m.k] || {})[k] || 0), 0);
  const legend = Object.keys(keys).map(k => `<span class="act-chip" data-hk="${esc(labelOf(k))}" data-hkv="${kt(k)}" style="--tb:${colorOf(k)}"><i></i>${esc(labelOf(k))} <span class="faint">${hkPct(kt(k), grand)} · ${fmtH(kt(k))}</span></span>`).join('');
  return `<div data-hkroot data-hktot="${grand}" data-hkfmt="h"><div class="mchart">${cols}</div><div class="act-chips" style="margin-top:8px">${legend}</div></div>`;
}

/* Aba Tempo do projeto: tempo por tarefa e valor por hora efetivo. */
function projectTaskChartHTML(p, es) {
  const byTask = {}; es.forEach(e => { const k = e.task_id || '_'; byTask[k] = (byTask[k] || 0) + entryMs(e); });
  const items = Object.entries(byTask).map(([k, ms], i) => ({ label: k === '_' ? 'Sem tarefa' : (db.get('tempo_tasks', k)?.name || 'Tarefa'), ms, color: ACT_COLORS[i % ACT_COLORS.length] }));
  const rate = effectiveRate(p);
  return `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Tempo por tarefa</h3><span class="grow"></span><span class="small muted">Valor por hora efetivo: ${rate ? fmtMoney(rate) : '—'}</span></div><div class="panel-b">${hbarsHTML(items)}</div></div>`;
}

/* Cliente e agência: tempo por projeto e colunas mensais empilhadas por projeto. */
function partyChartsHTML(ps) {
  if (!ps.length) return '';
  const entries = ps.flatMap(p => db.where('tempo_time_entries', e => e.project_id === p.id));
  const pcol = Object.fromEntries(ps.map((p, i) => [p.id, p.color ? hexOf(p.color) : ACT_COLORS[i % ACT_COLORS.length]]));
  const pname = (k) => db.get('tempo_projects', k)?.name || 'Projeto';
  const items = ps.map(p => ({ label: p.name, ms: projectMs(p.id), color: pcol[p.id] }));
  return `<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Tempo por projeto</h3></div><div class="panel-b">${hbarsHTML(items)}</div></div>
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Últimos 12 meses</h3></div><div class="panel-b">${monthsHTML(entries, e => e.project_id, pname, k => pcol[k] || CHART_FALLBACK)}</div></div>`;
}
