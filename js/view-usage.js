/* Uso de programas e arquivos: % do tempo de trabalho em cada um, por geral, projeto, tarefa ou agência.
   Mostra os 10 maiores programas e os 20 maiores arquivos; o resto fica em "Comparar" (fechado até o clique).
   A aba "Clientes por programa" mostra, para um programa, quanto dele foi em cada cliente (base para a assinatura). */
const USE = { scope: 'geral', scopeId: '', period: '30d', pauses: false, tab: 'programas', prog: '', showAll: {}, cmp: { programas: [], arquivos: [] }, cmpOpen: {} };
const USE_TOP = { programas: 10, arquivos: 20 };

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
const usePct = (ms, base) => (base > 0 ? (ms / base * 100) : 0);
const usePctTxt = (p) => p.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

/* Registros das sessões do escopo, já cortados no período e com cliente/projeto/tarefa de cada um. */
function usageData() {
  const { a, b } = usagePeriod();
  const ents = usageEntries();
  const T = (x) => new Date(x).getTime();
  const recs = ents.flatMap(e => {
    const p = db.get('tempo_projects', e.project_id); const c = clientOf(p);
    return actList(e.id).map(r => ({ ...r, _cid: c?.id || null, _cname: c?.name || 'Sem cliente' }));
  }).map(r => {
    const f = Math.max(T(r.from), a), t = Math.min(T(r.to), Math.min(b, Date.now()));
    return { ...r, from: new Date(f).toISOString(), to: new Date(t).toISOString() };
  }).filter(r => T(r.to) > T(r.from));
  const prog = actAnalyzeList(recs, 'program');
  const files = actAnalyzeList(recs, 'file');
  const work = prog.groups.reduce((s, g) => s + g.ms, 0);
  const pauseMs = pauseGapsOf(ents).reduce((s, g) => {
    const f = Math.max(T(g.s), a), t = Math.min(T(g.e), b);
    return s + Math.max(0, t - f);
  }, 0);
  const base = USE.pauses ? work + pauseMs : work;
  return { prog, files, work, pauseMs, base, ents };
}

function usageRowsHTML(groups, base, mode) {
  const max = Math.max(1, ...groups.map(g => usePct(g.ms, base)));
  return groups.map(g => {
    const p = usePct(g.ms, base);
    return `<div class="usage-row" title="${esc(g.label || g.id)} · ${fmtDur(g.ms)}">
      <span class="usage-name">${esc(g.label || g.id)}</span>
      <span class="usage-bar"><span style="width:${(p / max * 100).toFixed(1)}%;background:${esc(g.color || '#2E43D6')}"></span></span>
      <span class="mono small usage-val">${usePctTxt(p)}</span>
      <span class="mono small muted usage-ms">${fmtDur(g.ms)}</span></div>`;
  }).join('');
}

function usageListHTML(kind, groups, base) {
  const top = USE_TOP[kind];
  const showAll = !!USE.showAll[kind];
  const shown = showAll ? groups : groups.slice(0, top);
  const sel = USE.cmp[kind].map(id => groups.find(g => g.id === id)).filter(Boolean);
  const cmpOpen = !!USE.cmpOpen[kind];
  const checks = groups.map(g => `<label class="row small usage-check"><input type="checkbox" data-on="usage-cmp" data-t="${kind}" data-id="${esc(g.id)}" ${USE.cmp[kind].includes(g.id) ? 'checked' : ''}> ${esc(g.label || g.id)} <span class="mono muted">${usePctTxt(usePct(g.ms, base))}</span></label>`).join('');
  return `${usageRowsHTML(shown, base, kind)}
    <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
      ${groups.length > top ? `<button class="btn sm ghost" data-act="usage-more" data-t="${kind}">${showAll ? 'Mostrar só os ' + top + ' maiores' : 'Mostrar todos (' + groups.length + ')'}</button>` : ''}
      <button class="btn sm ghost" data-act="usage-cmp-open" data-t="${kind}">${cmpOpen ? 'Fechar comparação' : 'Comparar…'}</button>
    </div>
    ${cmpOpen ? `<div class="usage-cmp stack" style="gap:6px;margin-top:10px">
      <span class="small muted">Marque os que quer comparar. Os marcados aparecem abaixo, com a mesma base de %.</span>
      <div class="usage-checks">${checks}</div>
      ${sel.length ? `<div class="stack" style="gap:4px;margin-top:6px"><b class="small">Comparação</b>${usageRowsHTML(sel, base, kind)}</div>` : ''}
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
  const opts = groups.map(x => `<option value="${esc(x.id)}" ${x.id === progId ? 'selected' : ''}>${esc(x.label || x.id)}</option>`).join('');
  return `<div class="row" style="gap:8px;flex-wrap:wrap"><span class="small muted">Programa</span>
      <select class="input sm" data-on="usage-prog" aria-label="Programa">${opts}</select></div>
    <div class="small muted" style="margin-top:8px">${esc(g.label || g.id)} · ${fmtDur(g.ms)} no período · ${usePctTxt(usePct(g.ms, d.base))} da base</div>
    <div class="stack" style="gap:6px;margin-top:10px">${rows.map(([name, ms]) => `<div class="usage-row">
      <span class="usage-name">${esc(name)}</span>
      <span class="usage-bar"><span style="width:${usePct(ms, g.ms).toFixed(1)}%;background:#2E43D6"></span></span>
      <span class="mono small usage-val">${usePctTxt(usePct(ms, g.ms))}</span>
      <span class="mono small muted usage-ms">${fmtDur(ms)}</span></div>`).join('')}</div>
    <div class="small muted" style="margin-top:8px">% dentro do programa escolhido. Para a assinatura, use esta aba com o período que você pagou.</div>`;
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
  const tabs = [['programas', 'Programas'], ['arquivos', 'Arquivos'], ['clientes', 'Clientes por programa']];
  const scopes = [['geral', 'Geral'], ['projeto', 'Projeto'], ['tarefa', 'Tarefa'], ['agencia', 'Agência']];
  const opts = usageScopeOptions();
  const scopeSel = USE.scope === 'geral' ? '' : `<select class="input sm" data-on="usage-scope-id" aria-label="Escolha"><option value="">Escolha…</option>${opts.map(o => `<option value="${esc(o.id)}" ${o.id === USE.scopeId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  const body = USE.tab === 'clientes' ? usageClientsHTML(d)
    : usageListHTML(USE.tab, USE.tab === 'arquivos' ? d.files.groups : d.prog.groups, d.base);
  const noScope = USE.scope !== 'geral' && !USE.scopeId;
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

CHANGES['usage-scope'] = (el) => { USE.scope = el.value; USE.scopeId = ''; USE.showAll = {}; USE.cmp = { programas: [], arquivos: [] }; render(); };
CHANGES['usage-scope-id'] = (el) => { USE.scopeId = el.value; render(); };
CHANGES['usage-period'] = (el) => { USE.period = el.value; render(); };
CHANGES['usage-pauses'] = (el) => { USE.pauses = el.checked; render(); };
CHANGES['usage-prog'] = (el) => { USE.prog = el.value; render(); };
CHANGES['usage-cmp'] = (el) => {
  const t = el.dataset.t; const set = new Set(USE.cmp[t] || []);
  if (el.checked) set.add(el.dataset.id); else set.delete(el.dataset.id);
  USE.cmp[t] = [...set]; render();
};
ACTIONS['usage-tab'] = (el) => { USE.tab = el.dataset.t; render(); };
ACTIONS['usage-more'] = (el) => { USE.showAll[el.dataset.t] = !USE.showAll[el.dataset.t]; render(); };
ACTIONS['usage-cmp-open'] = (el) => { USE.cmpOpen[el.dataset.t] = !USE.cmpOpen[el.dataset.t]; render(); };
