/* Uso de programas, arquivos e sites: % do tempo de trabalho em cada um, por geral, projeto, tarefa ou agência.
   Tudo numa barra só (ou em rosca), com os menores agrupados em "Demais". Abas: programas, arquivos, sites,
   meses (comparação mês a mês, com a variação em pontos percentuais) e clientes por programa (base para assinatura). */
const USE = { scope: 'geral', scopeId: '', period: '30d', months: 6, pauses: false, tab: 'programas', chart: 'barra', prog: '', showAll: {}, cmp: { programas: [], arquivos: [], sites: [] }, cmpOpen: {} };
const USE_TOP = { programas: 10, arquivos: 20, sites: 20 };
const USE_BROWSER = /chrome|safari|firefox|edge|brave|arc|opera|vivaldi/i;

function usageEntries() {
  const all = db.all('tempo_time_entries');
  if (USE.scope === 'projeto') return all.filter(e => e.project_id === USE.scopeId);
  if (USE.scope === 'tarefa') return all.filter(e => e.task_id === USE.scopeId);
  if (USE.scope === 'agencia') return all.filter(e => clientOf(db.get('tempo_projects', e.project_id))?.agency_id === USE.scopeId);
  return all;
}
function usagePeriod() {
  const b = Date.now();
  if (USE.period === 'mes') { const d = new Date(); return { a: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), b }; }
  if (USE.period === 'tudo') return { a: 0, b };
  return { a: b - 30 * 864e5, b };
}
/* Mês k atrás (0 = mês atual), cortado no agora. */
function usageMonth(k) {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth() - k, 1).getTime();
  const b = Math.min(new Date(now.getFullYear(), now.getMonth() - k + 1, 1).getTime(), Date.now());
  return { a, b, label: new Date(a).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) };
}
const usePct = (ms, base) => (base > 0 ? (ms / base * 100) : 0);
const usePctTxt = (p) => p.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
/* Domínio do endereço gravado na aba do navegador (ex.: drive.google.com). */
function usageDomain(doc) {
  const m = String(doc || '').match(/(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?=[\/:?#\s]|$)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : null;
}

/* Registros das sessões do escopo, cortados no intervalo, e os totais (programa, arquivo, site, pausa e base). */
function usageDataRange(a, b, ents) {
  const T = (x) => new Date(x).getTime();
  const now = Date.now();
  const recs = ents.flatMap(e => {
    const p = db.get('tempo_projects', e.project_id); const c = clientOf(p);
    return actList(e.id).map(r => ({ ...r, _cid: c?.id || null, _cname: c?.name || 'Sem cliente' }));
  }).map(r => {
    const f = Math.max(T(r.from), a), t = Math.min(T(r.to), Math.min(b, now));
    return { ...r, from: new Date(f).toISOString(), to: new Date(t).toISOString() };
  }).filter(r => T(r.to) > T(r.from));
  const prog = actAnalyzeList(recs, 'program');
  const files = actAnalyzeList(recs, 'file');
  const siteMs = {};
  recs.forEach(r => {
    if (!USE_BROWSER.test(String(r.app || ''))) return;
    const d = usageDomain(r.doc); if (!d) return;
    siteMs[d] = (siteMs[d] || 0) + (T(r.to) - T(r.from));
  });
  const sites = Object.entries(siteMs).sort((x, y) => y[1] - x[1]).map(([d, ms]) => ({ id: 'site:' + d, label: d, ms, color: palColor(d) }));
  const work = prog.groups.reduce((s, g) => s + g.ms, 0);
  const pauseMs = pauseGapsOf(ents).reduce((s, g) => {
    const f = Math.max(T(g.s), a), t = Math.min(T(g.e), b);
    return s + Math.max(0, t - f);
  }, 0);
  const base = USE.pauses ? work + pauseMs : work;
  return { prog, files, sites, work, pauseMs, base, ents };
}
function usageData() { const { a, b } = usagePeriod(); return usageDataRange(a, b, usageEntries()); }

/* Fatias: os maiores (até "top") e o resto agrupado em "Demais". */
function usageSegs(groups, top) {
  const shown = groups.slice(0, top); const rest = groups.slice(top);
  const segs = shown.map(g => ({ id: g.id, label: g.label || g.id, ms: g.ms, color: g.color || palColor(g.label || g.id) }));
  const restMs = rest.reduce((s, g) => s + g.ms, 0);
  if (restMs > 0) segs.push({ id: '_rest', label: `Demais (${rest.length})`, ms: restMs, color: '#CBD5E1', tip: rest.map(g => `${g.label || g.id} · ${fmtDur(g.ms)}`).join('\n') });
  return segs;
}
/* Barra única: cada fatia tem a sua largura em %. O que sobra da base (pausas, se contadas) fica listrado. */
function usageBarHTML(segs, base, h = 34) {
  const tot = segs.reduce((s, x) => s + x.ms, 0);
  const scale = base > 0 ? base : Math.max(tot, 1);
  const parts = segs.map(s => {
    const p = usePct(s.ms, scale);
    return `<span class="usage-seg" style="width:${p.toFixed(2)}%;background:${esc(s.color)}" title="${esc(s.tip || `${s.label} · ${usePctTxt(p)} · ${fmtDur(s.ms)}`)}">${p >= 9 ? `<b>${esc(s.label)}</b>${usePctTxt(p)}` : ''}</span>`;
  }).join('');
  const rem = scale - tot;
  return `<div class="usage-stack" style="height:${h}px">${parts}${rem > 0 ? `<span class="usage-seg usage-rem" style="width:${usePct(rem, scale).toFixed(2)}%" title="Pausas (fora do trabalho)"></span>` : ''}</div>`;
}
/* Rosca: mesmas fatias, em formato de rosca com o total da base no centro. */
function usageDonutHTML(segs, base) {
  const scale = Math.max(base, 1); let acc = 0; const stops = [];
  segs.forEach(s => { const a0 = acc, a1 = acc + usePct(s.ms, scale); stops.push(`${s.color} ${a0.toFixed(2)}% ${a1.toFixed(2)}%`); acc = a1; });
  if (acc < 100) stops.push(`#E5E7EB ${acc.toFixed(2)}% 100%`);
  return `<div class="usage-donut" style="background:conic-gradient(${stops.join(',') || '#E5E7EB 0% 100%'})"><div class="usage-donut-hole"><span class="mono small">${fmtDur(base)}</span><span class="small muted">base</span></div></div>`;
}
function usageLegendHTML(segs, base) {
  const scale = Math.max(base, 1);
  return `<div class="usage-legend">${segs.map(s => `<div class="usage-leg" title="${esc(s.tip || '')}"><span class="usage-sw" style="background:${esc(s.color)}"></span><span class="usage-name">${esc(s.label)}</span><span class="mono small">${usePctTxt(usePct(s.ms, scale))}</span><span class="mono small muted">${fmtDur(s.ms)}</span></div>`).join('')}</div>`;
}
function usageChartHTML(kind, groups, base) {
  const top = USE.showAll[kind] ? groups.length : USE_TOP[kind];
  const segs = usageSegs(groups, top);
  const toggle = `<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm ${USE.chart === 'barra' ? 'primary' : ''}" data-act="usage-chart" data-c="barra">Barra</button><button class="btn sm ${USE.chart === 'rosca' ? 'primary' : ''}" data-act="usage-chart" data-c="rosca">Rosca</button>${groups.length > USE_TOP[kind] ? `<button class="btn sm ghost" data-act="usage-more" data-t="${kind}">${USE.showAll[kind] ? 'Só os ' + USE_TOP[kind] + ' maiores' : 'Mostrar todos (' + groups.length + ')'}</button>` : ''}</div>`;
  if (!segs.length) return `${toggle}<div class="muted small" style="margin-top:8px">Sem registro no período.</div>`;
  const chart = USE.chart === 'rosca'
    ? `<div class="usage-donut-row">${usageDonutHTML(segs, base)}${usageLegendHTML(segs, base)}</div>`
    : `${usageBarHTML(segs, base)}${usageLegendHTML(segs, base)}`;
  return `${toggle}<div style="margin-top:10px">${chart}</div>`;
}
/* Comparar: marque os que quer e eles viram uma barra só, com a mesma base de %. */
function usageCompareHTML(kind, groups, base) {
  const cmpOpen = !!USE.cmpOpen[kind];
  const sel = USE.cmp[kind].map(id => groups.find(g => g.id === id)).filter(Boolean);
  const checks = groups.map(g => `<label class="row small usage-check"><input type="checkbox" data-on="usage-cmp" data-t="${kind}" data-id="${esc(g.id)}" ${USE.cmp[kind].includes(g.id) ? 'checked' : ''}> ${esc(g.label || g.id)} <span class="mono muted">${usePctTxt(usePct(g.ms, base))}</span></label>`).join('');
  const segs = usageSegs(sel, sel.length);
  return `<div class="row" style="gap:8px;margin-top:12px"><button class="btn sm ghost" data-act="usage-cmp-open" data-t="${kind}">${cmpOpen ? 'Fechar comparação' : 'Comparar…'}</button></div>
    ${cmpOpen ? `<div class="usage-cmp stack" style="gap:8px;margin-top:10px">
      <span class="small muted">Marque os que quer comparar. Abaixo, só os marcados, com a mesma base de %.</span>
      <div class="usage-checks">${checks}</div>
      ${sel.length ? `${usageBarHTML(segs, base)}${usageLegendHTML(segs, base)}` : ''}
    </div>` : ''}`;
}

function usageClientsHTML(d) {
  const groups = d.prog.groups;
  if (!groups.length) return '<div class="muted small">Sem registro de programa no período.</div>';
  const progId = USE.prog && groups.some(g => g.id === USE.prog) ? USE.prog : groups[0].id;
  USE.prog = progId;
  const g = groups.find(x => x.id === progId);
  const byClient = new Map();
  d.prog.records.filter(r => r.gid === progId).forEach(r => {
    const k = r._cname || 'Sem cliente';
    byClient.set(k, (byClient.get(k) || 0) + (new Date(r.to) - new Date(r.from)));
  });
  const rows = [...byClient.entries()].sort((x, y) => y[1] - x[1]);
  const segs = rows.map(([name, ms]) => ({ id: name, label: name, ms, color: palColor(name) }));
  const opts = groups.map(x => `<option value="${esc(x.id)}" ${x.id === progId ? 'selected' : ''}>${esc(x.label || x.id)}</option>`).join('');
  return `<div class="row" style="gap:8px;flex-wrap:wrap"><span class="small muted">Programa</span>
      <select class="input sm" data-on="usage-prog" aria-label="Programa">${opts}</select></div>
    <div class="small muted" style="margin-top:8px">${esc(g.label || g.id)} · ${fmtDur(g.ms)} no período · ${usePctTxt(usePct(g.ms, d.base))} da base</div>
    <div style="margin-top:10px">${usageBarHTML(segs, g.ms, 28)}${usageLegendHTML(segs, g.ms)}</div>
    <div class="small muted" style="margin-top:8px">% dentro do programa escolhido. Para a assinatura, use esta aba com o período que você pagou.</div>`;
}

/* Meses: a parte de cada programa em cada mês e quanto mudou no último mês contra o anterior (pontos percentuais). */
function usageMonthsHTML() {
  const n = USE.months || 6;
  const months = [];
  for (let k = n - 1; k >= 0; k--) { const m = usageMonth(k); months.push({ ...m, data: usageDataRange(m.a, m.b, usageEntries()) }); }
  const tot = new Map();
  months.forEach(m => m.data.prog.groups.forEach(g => tot.set(g.id, { id: g.id, label: g.label || g.id, ms: (tot.get(g.id)?.ms || 0) + g.ms })));
  const top = [...tot.values()].sort((x, y) => y.ms - x.ms).slice(0, 8);
  const bars = months.map(m => `<div class="usage-month"><span class="small muted usage-month-lbl">${esc(m.label)}</span>${m.data.base > 0 ? usageBarHTML(usageSegs(m.data.prog.groups, 5), m.data.base, 22) : '<span class="small muted">sem registro</span>'}</div>`).join('');
  const rows = top.map(t => {
    const pcts = months.map(m => { const g = m.data.prog.groups.find(x => x.id === t.id); return g ? usePct(g.ms, m.data.base) : 0; });
    const delta = pcts[pcts.length - 1] - (pcts.length > 1 ? pcts[pcts.length - 2] : 0);
    const cls = delta > 0.05 ? 'usage-up' : delta < -0.05 ? 'usage-down' : '';
    return `<tr><td>${esc(t.label)}</td>${pcts.map(p => `<td class="mono small">${usePctTxt(p)}</td>`).join('')}<td class="mono small ${cls}">${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pp</td></tr>`;
  }).join('');
  return `<div class="row" style="gap:8px;flex-wrap:wrap"><span class="small muted">Meses</span>
      <select class="input sm" data-on="usage-months" aria-label="Meses">${[3, 6, 12].map(x => `<option value="${x}" ${x === n ? 'selected' : ''}>${x} meses</option>`).join('')}</select></div>
    <div class="stack" style="gap:6px;margin-top:10px">${bars}</div>
    <div class="usage-table-wrap" style="margin-top:14px"><table class="usage-table">
      <thead><tr><th>Programa</th>${months.map(m => `<th>${esc(m.label)}</th>`).join('')}<th>Último vs anterior</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="' + (n + 2) + '" class="muted small">Sem registro nos meses escolhidos.</td></tr>'}</tbody>
    </table></div>
    <div class="small muted" style="margin-top:8px">Cada célula é a parte do programa no mês. A última coluna mostra quanto ele cresceu ou diminuiu em pontos percentuais.</div>`;
}

function usageScopeOptions() {
  if (USE.scope === 'projeto') return db.all('tempo_projects').sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(p => ({ id: p.id, label: tkProjectLabel(p) }));
  if (USE.scope === 'tarefa') return db.all('tempo_tasks').map(t => ({ id: t.id, label: `${db.get('tempo_projects', t.project_id)?.name || '—'} › ${t.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (USE.scope === 'agencia') return db.all('tempo_agencies').sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(a => ({ id: a.id, label: a.name }));
  return [];
}

VIEWS.usage = () => {
  const d = usageData();
  const tabs = [['programas', 'Programas'], ['arquivos', 'Arquivos'], ['sites', 'Sites'], ['meses', 'Meses'], ['clientes', 'Clientes por programa']];
  const scopes = [['geral', 'Geral'], ['projeto', 'Projeto'], ['tarefa', 'Tarefa'], ['agencia', 'Agência']];
  const opts = usageScopeOptions();
  const scopeSel = USE.scope === 'geral' ? '' : `<select class="input sm" data-on="usage-scope-id" aria-label="Escolha"><option value="">Escolha…</option>${opts.map(o => `<option value="${esc(o.id)}" ${o.id === USE.scopeId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  const noScope = USE.scope !== 'geral' && !USE.scopeId;
  let body;
  if (USE.tab === 'clientes') body = usageClientsHTML(d);
  else if (USE.tab === 'meses') body = usageMonthsHTML();
  else if (USE.tab === 'sites') body = d.sites.length
    ? `${usageChartHTML('sites', d.sites, d.base)}${usageCompareHTML('sites', d.sites, d.base)}`
    : '<div class="muted small">Nenhum site com endereço registrado no período. Os sites aparecem quando o navegador grava o endereço da aba.</div>';
  else {
    const groups = USE.tab === 'arquivos' ? d.files.groups : d.prog.groups;
    body = `${usageChartHTML(USE.tab, groups, d.base)}${usageCompareHTML(USE.tab, groups, d.base)}`;
  }
  return {
    title: 'Uso de programas',
    actions: `<select class="input sm" data-on="usage-scope" aria-label="Escopo">${scopes.map(([k, l]) => `<option value="${k}" ${USE.scope === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${scopeSel}
      <select class="input sm" data-on="usage-period" aria-label="Período">
        <option value="mes" ${USE.period === 'mes' ? 'selected' : ''}>Mês atual</option>
        <option value="30d" ${USE.period === '30d' ? 'selected' : ''}>Últimos 30 dias</option>
        <option value="tudo" ${USE.period === 'tudo' ? 'selected' : ''}>Tudo</option></select>
      <label class="row small" style="gap:6px"><input type="checkbox" data-on="usage-pauses" ${USE.pauses ? 'checked' : ''}> contar pausas na base</label>`,
    html: `<div class="stack" style="gap:14px">
      <div class="pf-kpis">
        <div class="kpi"><span class="k">Tempo com programa</span><span class="v mono">${fmtDur(d.work)}</span><span class="s">${d.ents.length} sessão(ões)</span></div>
        <div class="kpi"><span class="k">Pausas no período</span><span class="v mono">${fmtDur(d.pauseMs)}</span><span class="s">${USE.pauses ? 'entram na base' : 'fora da base'}</span></div>
        <div class="kpi"><span class="k">Base dos %</span><span class="v mono">${fmtDur(d.base)}</span><span class="s">${USE.pauses ? 'trabalho + pausas' : 'só trabalho'}</span></div>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">${tabs.map(([k, l]) => `<button class="btn sm ${USE.tab === k ? 'primary' : ''}" data-act="usage-tab" data-t="${k}">${l}</button>`).join('')}</div>
      ${noScope ? '<div class="muted small">Escolha um item acima para ver o uso dele.</div>' : body}
    </div>`,
  };
};

CHANGES['usage-scope'] = (el) => { USE.scope = el.value; USE.scopeId = ''; USE.showAll = {}; USE.cmp = { programas: [], arquivos: [], sites: [] }; render(); };
CHANGES['usage-scope-id'] = (el) => { USE.scopeId = el.value; render(); };
CHANGES['usage-period'] = (el) => { USE.period = el.value; render(); };
CHANGES['usage-pauses'] = (el) => { USE.pauses = el.checked; render(); };
CHANGES['usage-prog'] = (el) => { USE.prog = el.value; render(); };
CHANGES['usage-months'] = (el) => { USE.months = Number(el.value) || 6; render(); };
CHANGES['usage-cmp'] = (el) => {
  const t = el.dataset.t; const set = new Set(USE.cmp[t] || []);
  if (el.checked) set.add(el.dataset.id); else set.delete(el.dataset.id);
  USE.cmp[t] = [...set]; render();
};
ACTIONS['usage-tab'] = (el) => { USE.tab = el.dataset.t; render(); };
ACTIONS['usage-chart'] = (el) => { USE.chart = el.dataset.c; render(); };
ACTIONS['usage-more'] = (el) => { USE.showAll[el.dataset.t] = !USE.showAll[el.dataset.t]; render(); };
ACTIONS['usage-cmp-open'] = (el) => { USE.cmpOpen[el.dataset.t] = !USE.cmpOpen[el.dataset.t]; render(); };
