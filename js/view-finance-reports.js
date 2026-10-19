/* =====================================================================
   FINANCEIRO
   ===================================================================== */
VIEWS.finance = () => {
  const f = S.fin;
  const list = filterProjects(f).sort((a, b) => (remainingOf(b) || 0) - (remainingOf(a) || 0));
  const sum = (fn) => list.reduce((s, p) => s + (fn(p) || 0), 0);
  const budget = sum(p => Number(p.budget)), paid = sum(paidOf), rem = sum(remainingOf);
  const lateId = statuses('payment').find(s => s.name === 'Atrasado')?.id;
  const late = list.filter(p => p.payment_status_id === lateId).reduce((s, p) => s + (remainingOf(p) || 0), 0);
  const byAg = {}; list.forEach(p => { const r = remainingOf(p) || 0; if (!r) return; const a = agencyOf(p); const k = a?.id || '_'; (byAg[k] ||= { a, n: 0, v: 0 }); byAg[k].n++; byAg[k].v += r; });
  const ags = Object.values(byAg).sort((x, y) => y.v - x.v); const maxAg = Math.max(1, ...ags.map(x => x.v));
  const pids = new Set(list.map(p => p.id));
  const pays = db.all('tempo_payments').filter(x => pids.has(x.project_id) && ((!f.year && !f.month && !f.from && !f.to) || x.date) && (!f.year || x.date.slice(0, 4) === f.year) && (!f.month || x.date.slice(5, 7) === f.month) && (!f.from || x.date >= f.from) && (!f.to || x.date <= f.to)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  bankRefresh();
  const html = `${bankSummaryHTML('pj')}${bankPanel('pj')}<div class="panel">${filterBar(f, 'fin')}<div class="panel-b small muted" style="padding:8px 16px">Ano, mês e período filtram projetos pelo prazo (ou data de criação) e pagamentos pela data do recebimento.</div></div>
  <div class="kpis">
    <div class="kpi"><span class="k">Orçado</span><span class="v">${fmtMoney0(budget)}</span><span class="s">${list.length} projeto(s)</span></div>
    <div class="kpi"><span class="k">Valor pago</span><span class="v">${fmtMoney0(paid)}</span><span class="s">${budget ? Math.round(paid / budget * 100) + '% do orçado' : ''}</span></div>
    <div class="kpi"><span class="k">Valor restante</span><span class="v" style="color:var(--warn)">${fmtMoney0(rem)}</span><span class="s">a receber</span></div>
    <div class="kpi"><span class="k">Atrasado</span><span class="v" style="color:var(--danger)">${fmtMoney0(late)}</span><span class="s">status “Atrasado”</span></div>
  </div>
  <div class="grid2" style="align-items:start">
    <div class="panel"><div class="panel-h"><h3>Em aberto por agência</h3></div><div class="panel-b">${ags.length ? `<div class="bars">${ags.map(x => `<div class="bar-row"><span class="lab">${x.a ? esc(x.a.name) : 'Clientes diretos'} <span class="faint small">· ${x.n}</span></span><div class="bar-track"><div class="bar-fill fill" style="--tb:${hexOf(x.a?.color || 'gray')};width:${x.v / maxAg * 100}%"></div></div><span class="val">${fmtMoney0(x.v)}</span></div>`).join('')}</div>` : '<div class="muted small">Nada em aberto com esses filtros.</div>'}</div></div>
    <div class="panel"><div class="panel-h"><h3>Pagamentos recebidos</h3><span class="grow"></span><span class="mono small">${fmtMoney0(pays.reduce((s, x) => s + Number(x.amount), 0))}</span></div><div class="panel-b tight" style="max-height:260px;overflow:auto">${pays.length ? gridTable({ id: 'finpays', cls: 'fin', cols: PAYCOLS, rows: pays, defSort: null, sortable: false, footer: false, rowAttrs: x => `data-act="fin-open" data-id="${x.project_id}"`, rowById: (id) => db.get('tempo_payments', id) }) : '<div class="empty small">Nenhum pagamento no período.</div>'}</div></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>Projetos</h3><span class="grow"></span>${colsBtn('finance')}<button class="btn sm" data-act="csv-copy" data-kind="finance">${icon('copy')} Copiar CSV</button></div><div class="panel-b tight">${list.length ? gridTable({ id: 'finance', cls: 'fin', cols: FCOLS, rows: list, defHidden: ['status'], defSort: null, rowAttrs: p => `data-act="fin-open" data-id="${p.id}"`, rowById: (id) => db.get('tempo_projects', id) }) : `<div class="empty">${icon('money')}<b>Nenhum projeto com esses filtros</b></div>`}</div></div>`;
  return { title: 'Financeiro PJ', actions: '', html };
};
const PAYCOLS = {
  date: { label: 'Data', ico: 'cal', w: 100, sort: x => x.date || '', cell: x => x.date ? fmtDate(x.date) : '<span class="faint">sem data</span>' },
  name: { label: 'Projeto', ico: 'list', w: 240, sort: x => db.get('tempo_projects', x.project_id)?.name || '', cell: x => { const p = db.get('tempo_projects', x.project_id); return p ? `<b>${esc(p.name)}</b>` : ''; } },
  client: { label: 'Cliente', ico: 'users', w: 160, sort: x => clientOf(db.get('tempo_projects', x.project_id))?.name || '', cell: x => { const c = clientOf(db.get('tempo_projects', x.project_id)); return c ? tag(c.name, c.color || 'gray') : ''; } },
  work: { label: 'Status do trabalho', ico: 'list', w: 150, sort: x => statusCat(db.get('tempo_projects', x.project_id)?.status_id) || '', cell: x => statusTag(db.get('tempo_projects', x.project_id)?.status_id) },
  amount: { label: 'Valor', ico: 'money', w: 110, money: true, sort: x => Number(x.amount) || 0, cell: x => fmtMoney(x.amount) },
};
const FCOLS = {
  agency: PCOLS.agency, client: PCOLS.client,
  name: { ...PCOLS.name, cell: p => `<span class="cell-name"><span class="ct">${esc(p.name)}</span>${openBtn('fin-open', p.id)}</span>` },
  status: PCOLS.status, pay: PCOLS.pay, budget: PCOLS.budget, paid: PCOLS.paid, remaining: PCOLS.remaining,
  invoice: { label: 'Nota fiscal', ico: 'cal', w: 110, sort: p => p.invoice_at || '', cell: p => p.invoice_at ? fmtDate(p.invoice_at) : '', edit: { type: 'date', get: p => p.invoice_at ? ymd(p.invoice_at) : null, set: (p, v) => { db.update('tempo_projects', p.id, { invoice_at: v ? parseYmd(v).toISOString() : null }); if (v) logEvent('project', p.id, 'milestone', `Nota fiscal: ${fmtDate(v)}`); } } },
  lastpay: { label: 'Último pagamento', ico: 'cal', w: 130, sort: p => paymentsOf(p.id).slice(-1)[0]?.date || '', cell: p => { const lp = paymentsOf(p.id).slice(-1)[0]; return lp?.date ? fmtDate(lp.date) : ''; } },
  notes: PCOLS.notes
};
ACTIONS['fin-open'] = (el) => openProject(el.dataset.id, 'finance');

/* =====================================================================
   RELATÓRIOS
   ===================================================================== */
function periodRange(r) {
  const t = new Date(); t.setHours(0, 0, 0, 0); let a, b = new Date(t);
  if (r.period === 'week') { a = new Date(t); a.setDate(a.getDate() - ((a.getDay() + 6) % 7)); }
  else if (r.period === 'month') { a = new Date(t.getFullYear(), t.getMonth(), 1); }
  else if (r.period === 'lastmonth') { a = new Date(t.getFullYear(), t.getMonth() - 1, 1); b = new Date(t.getFullYear(), t.getMonth(), 0); }
  else if (r.period === '90') { a = new Date(t); a.setDate(a.getDate() - 89); }
  else if (r.period === 'year') { a = new Date(t.getFullYear(), 0, 1); }
  else if (r.period === 'all') { a = new Date(2000, 0, 1); }
  else { a = r.from ? parseYmd(r.from) : new Date(t.getFullYear(), t.getMonth(), 1); b = r.to ? parseYmd(r.to) : t; }
  return [ymd(a), ymd(b)];
}
function reportData() {
  const r = S.rep; const [from, to] = periodRange(r);
  const inScope = (pid, cid, aid) => {
    const p = db.get('tempo_projects', pid); const c = p ? clientOf(p) : db.get('tempo_clients', cid); const a = c ? c.agency_id : aid;
    if (r.agency && (r.agency === '__none' ? a : a !== r.agency)) return false;
    if (r.client && c?.id !== r.client) return false; return true;
  };
  const entries = db.all('tempo_time_entries').filter(e => { const d = ymd(entryStart(e)); return d >= from && d <= to && inScope(e.project_id, e.client_id, e.agency_id); });
  const pays = db.all('tempo_payments').filter(x => x.date && x.date >= from && x.date <= to && inScope(x.project_id));
  const projs = projects().filter(p => inScope(p.id));
  return { from, to, entries, pays, projs };
}
const GROUPS = {
  agency: ['Agência', e => { const x = entryPath(e); return x.agency ? [x.agency.id, x.agency.name, x.agency.color] : ['_d', x.client ? 'Clientes diretos' : 'Sem cliente', 'gray']; }],
  client: ['Cliente', e => { const x = entryPath(e); return x.client ? [x.client.id, x.client.name, x.client.color] : ['_', 'Sem cliente', 'gray']; }],
  project: ['Projeto', e => { const x = entryPath(e); return x.project ? [x.project.id, x.project.name, db.get('tempo_status_options', x.project.status_id)?.color] : ['_', 'Sessão avulsa', 'gray']; }],
  task: ['Tarefa', e => { const x = entryPath(e); const t = x.subtask || x.task; return t ? [t.id, (x.subtask ? x.task.name + ' › ' : '') + t.name, 'blue'] : ['_', 'Sem tarefa', 'gray']; }],
  type: ['Tipo de trabalho', e => { const w = db.get('tempo_work_types', e.work_type_id); return w ? [w.id, w.name, w.color] : ['_', 'Sem tipo', 'gray']; }]
};
VIEWS.reports = () => {
  const r = S.rep; const d = reportData();
  const tot = d.entries.reduce((s, e) => s + entryMs(e), 0);
  const brutoRep = d.entries.reduce((s, e) => s + entryBrutoMs(e), 0);
  const received = d.pays.reduce((s, x) => s + Number(x.amount), 0);
  // agrupamento
  const g = {}; d.entries.forEach(e => { const [k, n, c] = GROUPS[r.group][1](e); (g[k] ||= { n, c, ms: 0, s: 0 }); g[k].ms += entryMs(e); g[k].s++; });
  const rows = Object.values(g).sort((a, b) => b.ms - a.ms); const maxG = Math.max(1, ...rows.map(x => x.ms));
  // série por dia ou mês
  const span = daysBetween(d.from, d.to); const byMonth = span > 62;
  const series = {}; d.entries.forEach(e => { const k = byMonth ? ymd(entryStart(e)).slice(0, 7) : ymd(entryStart(e)); series[k] = (series[k] || 0) + entryMs(e); });
  const keys = []; if (byMonth) { const a = parseYmd(d.from.slice(0, 8) + '01'); const b = parseYmd(d.to); const first = Object.keys(series).sort()[0]; const st = first && span > 400 ? parseYmd(first + '-01') : a; for (let x = new Date(st); x <= b; x.setMonth(x.getMonth() + 1)) keys.push(ymd(x).slice(0, 7)); }
  else { for (let x = parseYmd(d.from); x <= parseYmd(d.to); x.setDate(x.getDate() + 1)) keys.push(ymd(x)); }
  const maxS = Math.max(3600000, ...keys.map(k => series[k] || 0));
  const workdays = keys.filter(k => byMonth || ![0, 6].includes(parseYmd(k).getDay())).length;
  // rentabilidade
  const prof = d.projs.filter(p => projectMs(p.id) > 0).map(p => { const ms = projectMs(p.id); const est = Number(p.estimated_hours) || 0; const revs = db.where('tempo_revisions', x => x.project_id === p.id).length; return { p, ms, est, pct: est ? hours(ms) / est : null, rev: revisionMs(p.id), revs, rate: effectiveRate(p) }; }).sort((a, b) => (b.rate || 0) - (a.rate || 0));
  const rates = prof.map(x => x.rate).filter(Boolean).sort((a, b) => a - b); const med = rates.length ? rates[Math.floor(rates.length / 2)] : null;
  // prazos
  const delivered = d.projs.filter(p => deliveryInfo(p)); const onTime = delivered.filter(p => !deliveryInfo(p).late).length;
  const postponed = d.projs.map(p => ({ p, n: deadlineChanges(p.id).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const cycle = INTERVALS.map(([a, b, lab]) => { const v = d.projs.map(p => daysBetween(p[a], p[b])).filter(x => x !== null && x >= 0); return [lab, v.length ? v.reduce((s, x) => s + x, 0) / v.length : null, v.length]; });
  const revByClient = {}; d.projs.forEach(p => { const n = db.where('tempo_revisions', x => x.project_id === p.id).length; if (!n) return; const c = clientOf(p); (revByClient[c.id] ||= { c, n: 0, ms: 0 }); revByClient[c.id].n += n; revByClient[c.id].ms += revisionMs(p.id); });
  const revRows = Object.values(revByClient).sort((a, b) => b.n - a.n);
  const periods = [['week', 'Semana'], ['month', 'Mês'], ['lastmonth', 'Mês passado'], ['90', '90 dias'], ['year', 'Ano'], ['all', 'Tudo'], ['custom', 'Período']];

  const html = `<div class="panel"><div class="filters">
    <div class="seg">${periods.map(([k, l]) => `<button class="${r.period === k ? 'on' : ''}" data-act="rep-set" data-k="period" data-v="${k}">${l}</button>`).join('')}</div>
    ${r.period === 'custom' ? `<span class="row" style="gap:4px"><input id="rp-from" type="date" class="input" style="min-width:0;width:140px" value="${r.from}" data-on="rep" data-k="from" aria-label="De"><span class="faint">–</span><input id="rp-to" type="date" class="input" style="min-width:0;width:140px" value="${r.to}" data-on="rep" data-k="to" aria-label="Até"></span>` : `<span class="small muted">${fmtDate(d.from)} – ${fmtDate(d.to)}</span>`}
    <span class="grow"></span>
    <select id="rp-ag" class="input" data-on="rep" data-k="agency" aria-label="Agência">${options(agencies(), r.agency, { empty: true, emptyLabel: 'Todas as agências' })}<option value="__none" ${r.agency === '__none' ? 'selected' : ''}>Sem agência (direto)</option></select>
    <select id="rp-cl" class="input" data-on="rep" data-k="client" aria-label="Cliente">${options(r.agency ? clients(r.agency) : clients(), r.client, { empty: true, emptyLabel: 'Todos os clientes' })}</select>
  </div></div>

  <div class="kpis">
    <div class="kpi"><span class="k">Horas registradas</span><span class="v">${fmtH(tot)}</span><span class="s">${d.entries.length} sessões · média ${fmtH(workdays ? tot / workdays : 0)}/${byMonth ? 'mês' : 'dia útil'} · bruto ${fmtH(brutoRep)} · pausas ${fmtH(Math.max(0, brutoRep - tot))}</span></div>
    <div class="kpi"><span class="k">Recebido no período</span><span class="v">${fmtMoney0(received)}</span><span class="s">${d.pays.length} pagamento(s)</span></div>
    <div class="kpi"><span class="k">Recebido ÷ horas</span><span class="v">${tot > 60000 && received ? fmtMoney(received / hours(tot)) : '—'}</span><span class="s">valor por hora no período</span></div>
    <div class="kpi"><span class="k">Em revisões</span><span class="v">${fmtH(d.entries.filter(e => e.revision_id).reduce((s, e) => s + entryMs(e), 0))}</span><span class="s">${tot ? Math.round(d.entries.filter(e => e.revision_id).reduce((s, e) => s + entryMs(e), 0) / tot * 100) : 0}% do tempo</span></div>
    <div class="kpi"><span class="k">Reuniões</span><span class="v">${fmtH(d.entries.filter(e => db.get('tempo_work_types', e.work_type_id)?.name === 'Reunião').reduce((s, e) => s + entryMs(e), 0))}</span><span class="s">tipo “Reunião”</span></div>
  </div>

  <div class="panel"><div class="panel-h"><h3>Horas por ${byMonth ? 'mês' : 'dia'}</h3></div><div class="panel-b">
    ${tot ? `<div class="table-wrap"><div style="display:flex;align-items:flex-end;gap:${keys.length > 40 ? 2 : 4}px;height:160px;min-width:${Math.max(280, keys.length * (byMonth ? 36 : 14))}px;border-bottom:1px solid var(--line);position:relative">
      ${[.5, 1].map(f => `<span style="position:absolute;left:0;right:0;bottom:${f * 140}px;border-top:1px dashed var(--line);font-size:.68em;color:var(--fg-3)" class="mono">${fmtH(maxS * f)}</span>`).join('')}
      ${keys.map(k => { const v = series[k] || 0; const we = !byMonth && [0, 6].includes(parseYmd(k).getDay()); return `<button data-act="${byMonth ? '' : 'ts-day'}" data-day="${k}" title="${byMonth ? k : fmtDate(k)} · ${fmtDur(v)}" style="flex:1;min-width:0;border:0;padding:0;height:${Math.max(v ? 3 : 0, v / maxS * 140)}px;background:${we ? 'var(--accent-line)' : 'var(--accent)'};border-radius:3px 3px 0 0;cursor:${byMonth ? 'default' : 'pointer'}"></button>`; }).join('')}
    </div><div class="day-axis" style="min-width:${Math.max(280, keys.length * (byMonth ? 36 : 14))}px">${keys.filter((_, i) => i % Math.ceil(keys.length / 8) === 0).map(k => `<span>${byMonth ? MONTHS[Number(k.slice(5)) - 1].slice(0, 3) + '/' + k.slice(2, 4) : fmtDateShort(k)}</span>`).join('')}</div></div>` : '<div class="muted small">Nenhuma hora registrada no período.</div>'}
  </div></div>

  <div class="panel"><div class="panel-h"><h3>Onde o tempo foi</h3><span class="grow"></span><div class="seg">${Object.entries(GROUPS).map(([k, [l]]) => `<button class="${r.group === k ? 'on' : ''}" data-act="rep-set" data-k="group" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="panel-b">${rows.length ? `<div class="bars">${rows.map(x => `<div class="bar-row"><span class="lab" title="${esc(x.n)}">${esc(x.n)}</span><div class="bar-track"><div class="bar-fill fill" style="--tb:${hexOf(x.c || 'gray')};width:${x.ms / maxG * 100}%"></div></div><span class="val">${fmtDur(x.ms)} <span class="faint">· ${Math.round(x.ms / tot * 100)}%</span></span></div>`).join('')}</div>` : '<div class="muted small">Sem dados no período.</div>'}</div></div>

  <div class="panel"><div class="panel-h"><h3>Rentabilidade por projeto</h3><span class="small muted">horas totais do projeto (todas as datas)</span><span class="grow"></span>${colsBtn('profit')}<button class="btn sm" data-act="csv-copy" data-kind="profit">${icon('copy')} Copiar CSV</button></div><div class="panel-b tight">
    ${prof.length ? gridTable({ id: 'profit', cols: profitCols(med), rows: prof.map(x => ({ ...x, id: x.p.id })), footer: false, defSort: { key: 'rate', dir: -1 }, rowAttrs: x => `data-act="proj-open" data-id="${x.p.id}"` }) + `
    <div class="small muted" style="padding:10px 16px">Em vermelho: horas acima do estimado ou R$/hora abaixo de 70% da mediana (${med ? fmtMoney(med) : '—'}). Em laranja: mais rodadas que as incluídas.</div>` : '<div class="empty small">Nenhum projeto com horas registradas.</div>'}
  </div></div>

  <div class="grid2" style="align-items:start">
    <div class="panel"><div class="panel-h"><h3>Prazos</h3></div><div class="panel-b stack">
      <div class="row between"><span class="muted">Entregas no prazo</span><b class="mono">${delivered.length ? `${onTime}/${delivered.length} · ${Math.round(onTime / delivered.length * 100)}%` : '—'}</b></div>
      <div class="row between"><span class="muted">Projetos com adiamento</span><b class="mono">${postponed.length}</b></div>
      ${postponed.slice(0, 5).map(x => `<div class="row between small" data-act="proj-open" data-id="${x.p.id}" style="cursor:pointer"><span>${esc(x.p.name)}</span><span class="mono">${x.n} adiamento(s)</span></div>`).join('')}
    </div></div>
    <div class="panel"><div class="panel-h"><h3>Ciclo dos projetos (média)</h3></div><div class="panel-b stack" style="gap:8px">
      ${cycle.map(([lab, v, n]) => `<div class="row between small"><span class="muted">${lab}</span><span class="mono">${v === null ? '—' : v.toFixed(1).replace('.', ',') + ' dias'} <span class="faint">(${n})</span></span></div>`).join('')}
    </div></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>Clientes com mais revisões</h3></div><div class="panel-b">${revRows.length ? `<div class="bars">${revRows.map(x => `<div class="bar-row"><span class="lab">${esc(x.c.name)}</span><div class="bar-track"><div class="bar-fill fill" style="--tb:${hexOf('orange')};width:${x.n / revRows[0].n * 100}%"></div></div><span class="val">${x.n} rodada(s) · ${fmtDur(x.ms)}</span></div>`).join('')}</div>` : '<div class="muted small">Nenhuma rodada de revisão registrada.</div>'}</div></div>`;
  return { title: 'Relatórios', actions: `<button class="btn" data-act="csv-copy" data-kind="entries">${icon('copy')} Copiar sessões (CSV)</button>`, html };
};
function profitCols(med) {
  return {
    name: { label: 'Projeto', ico: 'text', w: 280, cls: 'name', sort: x => x.p.name, cell: x => `${esc(x.p.name)}<span class="sub">${esc(clientOf(x.p)?.name || '')}</span>` },
    status: { label: 'Status', ico: 'spin', w: 150, sort: x => db.get('tempo_status_options', x.p.status_id)?.order ?? 99, cell: x => statusTag(x.p.status_id) },
    budget: { label: 'Orçamento', ico: 'hash', w: 130, money: true, sort: x => Number(x.p.budget) || 0, cell: x => fmtMoney(x.p.budget) },
    est: { label: 'Horas est.', ico: 'clock', w: 100, money: true, sort: x => x.est, cell: x => x.est ? x.est + ' h' : '' },
    real: { label: 'Horas reais', ico: 'clock', w: 110, money: true, sort: x => x.ms, cell: x => fmtH(x.ms) },
    pct: { label: 'Real ÷ est.', ico: 'hash', w: 100, money: true, sort: x => x.pct || 0, cell: x => `<span style="${x.pct > 1 ? 'color:var(--danger);font-weight:600' : ''}">${x.pct ? Math.round(x.pct * 100) + '%' : ''}</span>` },
    rev: { label: 'Em revisões', ico: 'clock', w: 110, money: true, sort: x => x.rev, cell: x => x.rev ? fmtDur(x.rev) : '' },
    revs: { label: 'Rodadas', ico: 'hash', w: 90, money: true, sort: x => x.revs, cell: x => `<span style="${x.revs > (x.p.revisions_included ?? 99) ? 'color:var(--warn);font-weight:600' : ''}">${x.revs || ''}</span>` },
    rate: { label: 'R$/hora efetivo', ico: 'hash', w: 140, money: true, sort: x => x.rate || 0, cell: x => `<span style="${med && x.rate && x.rate < med * .7 ? 'color:var(--danger);font-weight:600' : ''}">${x.rate ? fmtMoney(x.rate) : '—'}</span>` }
  };
}
ACTIONS['rep-set'] = (el) => { S.rep[el.dataset.k] = el.dataset.v; render(); };
CHANGES.rep = (el) => { S.rep[el.dataset.k] = el.value; if (el.dataset.k === 'agency') S.rep.client = ''; render(); };

/* exportação: o artifact não permite baixar arquivo, então copia para a área de transferência */
function toCSV(rows) { return rows.map(r => r.map(v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n'); }
ACTIONS['csv-copy'] = async (el) => {
  const k = el.dataset.kind; let rows;
  const n = (v) => v === null || v === undefined || v === '' ? '' : String(Math.round(Number(v) * 100) / 100).replace('.', ',');
  if (k === 'entries') { const d = reportData(); rows = [['Data', 'Início', 'Fim', 'Horas', 'Agência', 'Cliente', 'Projeto', 'Tarefa', 'Subtarefa', 'Tipo', 'Revisão', 'Notas']].concat(d.entries.map(e => { const x = entryPath(e); return [fmtDate(entryStart(e)), fmtTime(entryStart(e)), fmtTime(entryEnd(e)), n(hours(entryMs(e))), x.agency?.name, x.client?.name, x.project?.name, x.task?.name, x.subtask?.name, db.get('tempo_work_types', e.work_type_id)?.name, e.revision_id ? 'sim' : '', e.notes]; })); }
  if (k === 'finance') rows = [['Agência', 'Cliente', 'Projeto', 'Status', 'Pagamento', 'Orçamento', 'Valor pago', 'Valor restante', 'Observação']].concat(filterProjects(S.fin).map(p => [agencyOf(p)?.name, clientOf(p)?.name, p.name, statusName(p.status_id), statusName(p.payment_status_id), n(p.budget), n(paidOf(p)), n(remainingOf(p)), p.notes]));
  if (k === 'profit') rows = [['Projeto', 'Cliente', 'Orçamento', 'Horas estimadas', 'Horas reais', 'Horas em revisão', 'R$/hora efetivo']].concat(reportData().projs.filter(p => projectMs(p.id)).map(p => [p.name, clientOf(p)?.name, n(p.budget), n(p.estimated_hours), n(hours(projectMs(p.id))), n(hours(revisionMs(p.id))), n(effectiveRate(p))]));
  const csv = toCSV(rows);
  try { await navigator.clipboard.writeText(csv); toast(`${rows.length - 1} linha(s) copiadas. Cole no Excel, Numbers ou Google Sheets.`); }
  catch (e) { const l = openLayer({ wide: true, html: `<div class="dh"><h2>CSV</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer">${icon('x')}</button></div><div class="db"><p class="small muted" style="margin:0">Selecione e copie o texto abaixo.</p><textarea class="input mono" style="min-height:300px;font-size:.8em">${esc(csv)}</textarea></div>` }); $('textarea', l.box).select(); }
};

/* =====================================================================
   EXTRATOS BANCÁRIOS (Gmail → Nubank). Lançamentos vêm de tempo_bank_txns,
   separados por entidade (pf / pj) e marcados "novo" até você revisar.
   ===================================================================== */
const BANK = { status: null, txns: { pf: [], pj: [] }, all: { pf: [], pj: [] }, month: null, mode: { pf: 'novo', pj: 'novo' }, busy: false, checkedAt: 0, msg: '' };
async function bankToken() {
  const { data } = await db.adapter.client.auth.getSession();
  return data && data.session ? data.session.access_token : null;
}
async function bankApi(path, opts = {}) {
  const token = await bankToken();
  const r = await fetch('/api/gmail/' + path, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('falha ' + r.status));
  return j;
}
// Busca todas as linhas em páginas: o servidor corta cada resposta em 1000 linhas, então um limite fixo escondia os meses mais antigos.
async function bankFetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function bankLoadRaw() {
  const cl = db.adapter.client;
  const sorted = (q) => q.order('posted_on', { ascending: false }).order('id');
  for (const entity of ['pf', 'pj']) {
    BANK.txns[entity] = await bankFetchAll(() => sorted(cl.from('tempo_bank_txns').select('*').eq('entity', entity).eq('review_status', BANK.mode[entity])));
  }
  // resumo: lançamento conta para PJ se marcado como PJ, senão para a conta de origem
  const every = await bankFetchAll(() => sorted(cl.from('tempo_bank_txns').select('*')));
  for (const e of ['pf', 'pj']) BANK.all[e] = every.filter(t => (t.biz_entity || t.entity) === e);
  BANK.every = every;
  BANK.learned = bankBuildLearned(every);
  BANK.links = await bankFetchAll(() => cl.from('tempo_bank_reimb_links').select('*').order('reimb_row_id'));
  BANK.plinks = await bankFetchAll(() => cl.from('tempo_bank_payment_links').select('*').order('txn_id'));
}
// Pagamentos às terapeutas e à dentista ligam sozinhos à linha da tabela de terapias do mesmo mês (pelo nome).
const bankFamily = (name) => {
  const n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(\d+\)/g, '').replace(/^dra\.?\s+/, '').trim();
  if (/^patricia/.test(n) || /psicomotricidade|psicomotrocidade/.test(n)) return 'patricia';
  if (/^(claudiane|clau)(\s|$)/.test(n)) return 'claudiane';
  if (/^at$/.test(n) || /sarah egiza/.test(n)) return 'at';
  if (/^adelia/.test(n)) return 'adelia';
  if (/^aloma/.test(n)) return 'aloma';
  if (/^raquel/.test(n)) return 'raquel';
  if (/^homero/.test(n)) return 'homero';
  if (/^dentista/.test(n)) return 'dentista';
  return null;
};
async function bankAutoTherapy() {
  const every = BANK.every || [];
  const taken = new Set(every.map(x => x.reimb_row_id).filter(Boolean));
  const rows = db.all('tempo_reimb_rows');
  const todo = [];
  every.forEach(t => {
    if (t.flow !== 'out' || t.scope === 'interna' || t.reimb_row_id || t.expense_id) return;
    const fam = bankFamily(t.counterpart || t.memo); if (!fam) return;
    const ym = (t.posted_on || '').slice(0, 7), amt = Math.abs(Number(t.amount));
    const c = rows.filter(r => r.month === ym && !taken.has(r.id) && bankFamily(r.name) === fam);
    if (!c.length) {
      // Pagamento de terapia sem linha no mês: cria a linha já com a data paga.
      const n = rows.filter(r => r.month === ym).length;
      const row = db.insert('tempo_reimb_rows', { month: ym, name: t.counterpart, note: '', amount: amt, date: null, paid_on: t.posted_on, order: n,
        pay_id: rbStatusId('reimb_pay', 'Pago'), refund_id: rbStatusId('reimb_refund', 'a Pagar'), req_id: rbStatusId('reimb_req', 'a Fazer') });
      rows.push(row); taken.add(row.id);
      todo.push({ id: t.id, rowId: row.id });
      return;
    }
    const best = c.slice().sort((a, b) => Math.abs(Number(a.amount) - amt) - Math.abs(Number(b.amount) - amt))[0];
    taken.add(best.id);
    // O extrato vale: valor e data pagos vêm do banco.
    const diffs = {};
    if (best.paid_on !== t.posted_on) diffs.paid_on = t.posted_on;
    if (Math.abs(Number(best.amount) - amt) > 0.005) diffs.amount = amt;
    if (rbStatusId('reimb_pay', 'Pago') && best.pay_id !== rbStatusId('reimb_pay', 'Pago')) diffs.pay_id = rbStatusId('reimb_pay', 'Pago');
    if (Object.keys(diffs).length) db.update('tempo_reimb_rows', best.id, diffs);
    todo.push({ id: t.id, rowId: best.id });
  });
  if (!todo.length) return false;
  const cl = db.adapter.client;
  for (const x of todo) {
    const { error } = await cl.from('tempo_bank_txns').update({ reimb_row_id: x.rowId, category: 'Terapia', updated_at: new Date().toISOString() }).eq('id', x.id);
    if (error) { toast('Erro: ' + error.message); break; }
  }
  return true;
}
// Guarda, por contraparte, se a categoria veio do app (sugestão) ou foi escolhida por você.
function bankMarkCats(cps, cat, auto) {
  const map = { ...db.setting('bankAutoCat', {}) };
  cps.forEach(cp => { if (auto) map[cp] = cat; else delete map[cp]; });
  db.setSetting('bankAutoCat', map);
}
// Reembolso recebido pode cobrir várias terapias: cada linha de terapia liga a um lançamento (tempo_bank_reimb_links).
const bankLinksOf = (txnId) => (BANK.links || []).filter(l => l.txn_id === txnId).map(l => l.reimb_row_id);
// Linhas de terapia já ligadas a um reembolso recebido. Pagamento à terapeuta não ocupa a linha.
const bankTakenRows = () => new Set((BANK.links || []).map(l => l.reimb_row_id).filter(Boolean));
// Conjunto de linhas cuja soma é exatamente o valor (em centavos). Candidatas na ordem dada (mês atual primeiro).
function bankSubsetFor(cands, target) {
  const reach = new Map([[0, []]]);
  for (const r of cands) {
    const c = Math.round(Number(r.amount) * 100);
    for (const [sum, ids] of [...reach.entries()]) {
      const ns = sum + c;
      if (ns <= target && !reach.has(ns)) reach.set(ns, [...ids, r.id]);
    }
    if (reach.has(target)) break;
  }
  return reach.get(target) || null;
}
const bankSkipKey = 'bankReimbSkip';
// Lançamento de reembolso de terapia liga sozinho às linhas cuja soma é exatamente o valor recebido.
async function bankAutoReimb() {
  const skip = db.setting(bankSkipKey, {});
  const taken = bankTakenRows();
  const rows = db.all('tempo_reimb_rows');
  const todo = [];
  (BANK.every || []).forEach(t => {
    if (t.flow !== 'in' || !isReembTer(t.category) || skip[t.id] || bankLinksOf(t.id).length) return;
    const months = bankReimbMonths(t);
    const cands = rows.filter(r => months.includes(r.month) && !taken.has(r.id) && Number(r.amount) > 0)
      .sort((a, b) => (b.month === months[0] ? 1 : 0) - (a.month === months[0] ? 1 : 0) || Number(b.amount) - Number(a.amount)).slice(0, 30);
    if (!cands.length) return;
    const ids = bankSubsetFor(cands, Math.round(Math.abs(Number(t.amount)) * 100));
    if (!ids || !ids.length) return;
    ids.forEach(id => taken.add(id));
    todo.push({ txn: t.id, ids });
  });
  if (!todo.length) return false;
  const cl = db.adapter.client;
  for (const x of todo) {
    const { error } = await cl.from('tempo_bank_reimb_links').insert(x.ids.map(r => ({ reimb_row_id: r, txn_id: x.txn })));
    if (error) { toast('Erro: ' + error.message); break; }
  }
  return true;
}
// Sugestões por nome/CNAE viram categoria de verdade (só saídas, e só contrapartes ainda sem categoria).
async function bankAutoCategory() {
  const every = BANK.every || [];
  const has = new Set(every.filter(x => x.category).map(x => x.counterpart || '—'));
  const groups = {};
  every.forEach(t => {
    if (t.category || t.scope === 'interna') return;
    const k = t.counterpart || '—';
    if (has.has(k)) return;
    const sug = t.flow === 'out' ? suggestCat(k, t.counterpart_doc) : suggestIncCat(k);
    if (!sug) return;
    const g = (groups[sug] = groups[sug] || { ids: [], cps: new Set() });
    g.ids.push(t.id); g.cps.add(k);
  });
  Object.values(groups).forEach(g => { g.cps = [...g.cps]; });
  const cats = Object.keys(groups);
  if (!cats.length) return false;
  const cl = db.adapter.client;
  for (const c of cats) {
    const { error } = await cl.from('tempo_bank_txns').update({ category: c, updated_at: new Date().toISOString() }).in('id', groups[c].ids);
    if (error) { toast('Erro: ' + error.message); break; }
    bankMarkCats(groups[c].cps, c, true);
  }
  return true;
}
// Entrada da conta PJ: contraparte já ligada a um projeto vira pagamento daquele projeto (valor com folga de 6%; senão cria).
// Contraparte marcada como Fee (sem projeto fixo) recebe a categoria Fee.
const bankIsPJ = (t) => (BANK.all.pj || []).some(x => x.id === t.id);
async function bankAutoPJ() {
  const cl = db.adapter.client; const learned = {}; const lastFee = {};
  (BANK.every || []).forEach(t => {
    if (t.flow !== 'in' || !t.counterpart || !bankIsPJ(t)) return;
    if (t.payment_id) { const p = db.get('tempo_payments', t.payment_id); if (p && !learned[t.counterpart]) learned[t.counterpart] = p.project_id; }
    if (t.category === 'Fee' && (t.posted_on || '') > (lastFee[t.counterpart] || '')) lastFee[t.counterpart] = t.posted_on;
  });
  // Fee só vale enquanto a contraparte ainda paga fee (último fee nos últimos 60 dias).
  const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const fee = new Set(Object.keys(lastFee).filter(k => lastFee[k] >= cutoff));
  const taken = new Set((BANK.every || []).map(t => t.payment_id).filter(Boolean));
  let did = false;
  for (const t of (BANK.every || [])) {
    if (t.flow !== 'in' || t.payment_id || !t.counterpart || !bankIsPJ(t)) continue;
    // Regras de Fee: Brenda (e Pala Films, alias) só vira fee a partir de 12/01/2026; depois disso, valor < 15.000 não é fee.
    const feeOk = !((/brenda|pala films/i.test(t.counterpart) && (t.posted_on || '') < '2026-01-12') || ((t.posted_on || '') >= '2026-01-12' && Math.abs(Number(t.amount)) < 15000));
    if (fee.has(t.counterpart) && feeOk && !t.category) {
      const { error } = await cl.from('tempo_bank_txns').update({ category: 'Fee', updated_at: new Date().toISOString() }).eq('id', t.id);
      if (error) { toast('Erro: ' + error.message); break; }
      t.category = 'Fee'; did = true; continue;
    }
    const pid = learned[t.counterpart]; if (!pid) continue;
    const amt = Math.abs(Number(t.amount));
    let p = db.all('tempo_payments').find(x => x.project_id === pid && !taken.has(x.id) && (x.date == null || x.date === t.posted_on) && x.amount != null && Math.abs(Number(x.amount) - amt) <= Math.max(5, Number(x.amount) * 0.06));
    if (!p) p = db.insert('tempo_payments', { project_id: pid, amount: amt, date: t.posted_on, note: 'Extrato' });
    else db.update('tempo_payments', p.id, { amount: amt, date: t.posted_on });
    taken.add(p.id);
    const { error } = await cl.from('tempo_bank_txns').update({ payment_id: p.id, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) { toast('Erro: ' + error.message); break; }
    t.payment_id = p.id; did = true;
  }
  return did;
}
async function bankLoadTxns() {
  await bankLoadRaw();
  let changed = await bankAutoTherapy();
  if (await bankAutoCategory()) changed = true;
  if (await bankAutoReimb()) changed = true;
  if (await bankAutoFixed()) changed = true;
  if (await bankAutoPJ()) changed = true;
  if (changed) await bankLoadRaw();
}
// Gasto fixo aprendido: a contraparte → nomes de gasto fixo que você já vinculou a ela.
function bankFixedLearned() {
  const map = {};
  (BANK.every || []).forEach(t => {
    if (t.flow !== 'out' || !t.expense_id || !t.counterpart) return;
    const e = db.get('tempo_expenses', t.expense_id); if (!e || !e.name) return;
    (map[t.counterpart] = map[t.counterpart] || new Set()).add(e.name);
  });
  return map;
}
// Saída de uma contraparte já vinculada a um gasto fixo: liga sozinha ao gasto do mesmo nome e mês (valor com folga de 6%).
async function bankAutoFixed() {
  const learned = bankFixedLearned();
  const taken = new Set((BANK.every || []).map(t => t.expense_id).filter(Boolean));
  const expenses = db.all('tempo_expenses');
  const todo = [];
  (BANK.every || []).forEach(t => {
    if (t.flow !== 'out' || t.expense_id || t.scope === 'interna' || !t.counterpart || !learned[t.counterpart]) return;
    const ym = (t.posted_on || '').slice(0, 7), amt = Math.abs(Number(t.amount));
    const names = learned[t.counterpart];
    let e = expenses.find(x => x.kind === 'out' && x.month === ym && !taken.has(x.id) && x.amount != null
      && names.has(x.name) && Math.abs(Number(x.amount) - amt) <= Math.max(5, Number(x.amount) * 0.06));
    if (!e) {
      // Sem gasto fixo deste nome no mês: cria com o valor do banco (não cria duplicado se já existe um com esse nome).
      if (expenses.some(x => x.kind === 'out' && x.month === ym && names.has(x.name))) return;
      e = db.insert('tempo_expenses', { month: ym, kind: 'out', name: [...names][0], cat: '', note: '', amount: amt, due_date: null, paid_on: t.posted_on, status: 'Pago', inst_no: null, inst_total: null, order: expenses.filter(x => x.month === ym).length });
      expenses.push(e);
    }
    taken.add(e.id); todo.push({ t, e });
  });
  if (!todo.length) return false;
  for (const { t, e } of todo) {
    const { error } = await db.adapter.client.from('tempo_bank_txns').update({ expense_id: e.id, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) { toast('Erro: ' + error.message); break; }
    db.update('tempo_expenses', e.id, { amount: Math.abs(Number(t.amount)), status: 'Pago', paid_on: t.posted_on });
  }
  return true;
}
// Resumo geral: entradas, saídas e sobra (sem movimentos internos) e onde o dinheiro saiu.
// Filtro escondido das saídas (busca por nome, categoria, meio, conta e valor).
const bnorm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function bankFilterOn() { const f = BANK.f || {}; return !!(f.q || f.cat || f.meth || f.acc || f.min || f.max); }
function bankFilterHTML(catBy) {
  const f = BANK.f || {};
  const cats = [...new Set(Object.values(catBy).concat(bankCats()))].filter(c => c && c !== '__none').sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return `<div class="panel-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;border-bottom:1px solid var(--line)">
    <div class="field"><label for="bf-q">Nome</label><input id="bf-q" class="input" value="${esc(f.q || '')}" placeholder="Buscar por nome" data-input="bank-f" data-k="q"></div>
    <div class="field"><label for="bf-cat">Categoria</label><select id="bf-cat" class="input" data-on="bank-f" data-k="cat"><option value="">Todas</option><option value="__none" ${f.cat === '__none' ? 'selected' : ''}>Sem categoria</option>${cats.map(c => `<option value="${esc(c)}" ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label for="bf-meth">Meio</label><select id="bf-meth" class="input" data-on="bank-f" data-k="meth"><option value="">Todos</option>${METHODS.map(x => `<option value="${x}" ${f.meth === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label for="bf-acc">Conta</label><select id="bf-acc" class="input" data-on="bank-f" data-k="acc"><option value="">Todas</option><option value="pf" ${f.acc === 'pf' ? 'selected' : ''}>PF</option><option value="pj" ${f.acc === 'pj' ? 'selected' : ''}>PJ</option></select></div>
    <div class="field"><label for="bf-min">Valor mínimo</label><input id="bf-min" class="input" type="number" min="0" value="${esc(f.min || '')}" data-input="bank-f" data-k="min"></div>
    <div class="field"><label for="bf-max">Valor máximo</label><input id="bf-max" class="input" type="number" min="0" value="${esc(f.max || '')}" data-input="bank-f" data-k="max"></div>
    <div class="row"><button class="btn sm ghost" data-act="bank-f-clear">Limpar filtro</button></div>
  </div>`;
}
CHANGES['bank-f'] = (el) => { BANK.f = { ...(BANK.f || {}), [el.dataset.k]: el.value }; render(); };
ACTIONS['bank-f-toggle'] = () => { BANK.fOpen = !BANK.fOpen; render(); };
ACTIONS['bank-f-clear'] = () => { BANK.f = {}; render(); };
// Relatório de entradas: período (mês, últimos 3, últimos X, ano, tudo) e agrupamento por cliente ou por mês.
const inAddM = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
function bankInReportHTML(entity, ym, base, excl) {
  const P = BANK.inP || 'mes';
  const X = Math.max(1, Number(BANK.inX) || 6);
  const years = [...new Set(base.filter(t => t.flow === 'in' && t.posted_on).map(t => t.posted_on.slice(0, 4)))].sort().reverse();
  const Y = BANK.inY || ym.slice(0, 4);
  const range = P === 'mes' ? [ym, ym] : P === 'q3' ? [inAddM(ym, -2), ym] : P === 'mx' ? [inAddM(ym, -(X - 1)), ym] : P === 'ano' ? [Y + '-01', Y + '-12'] : ['0000-00', '9999-12'];
  const selM = BANK.inSel || {};
  const inRange = (t) => { const m = (t.posted_on || '').slice(0, 7); return P === 'sel' ? !!selM[m] : (m >= range[0] && m <= range[1]); };
  const allMonths = [...new Set(base.filter(t => t.flow === 'in' && t.scope === 'externa' && t.posted_on && !excl(t)).map(t => t.posted_on.slice(0, 7)))].sort().reverse();
  const ins = base.filter(t => t.flow === 'in' && t.scope === 'externa' && !excl(t) && inRange(t));
  const total = ins.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const byMes = {}, byCli = {}, agOf = {};
  const pl = BANK.plinks || [];
  const addC = (k, v, ag) => { byCli[k] = (byCli[k] || 0) + v; if (ag) agOf[k] = ag; };
  ins.forEach(t => {
    const a = Math.abs(Number(t.amount));
    const m = (t.posted_on || '').slice(0, 7);
    byMes[m] = (byMes[m] || 0) + a;
    const links = pl.filter(l => l.txn_id === t.id);
    const parts = links.length ? links.map(l => ({ v: Number(l.amount), pid: l.payment_id })) : (t.payment_id ? [{ v: a, pid: t.payment_id }] : []);
    if (!parts.length) {
      const cp = t.counterpart || '—';
      if (!bankIsPJ(t)) addC(cp, a);
      else addC(cp + (t.category === 'Fee' ? ' · Fee' : ' · sem vínculo'), a);
      return;
    }
    parts.forEach(pt => {
      const p = db.get('tempo_payments', pt.pid);
      const pr = p && db.get('tempo_projects', p.project_id);
      const c = pr && clientOf(pr);
      if (!c) { addC((t.counterpart || '—') + ' · sem projeto', pt.v); return; }
      const ag = c.agency_id ? db.get('tempo_agencies', c.agency_id) : null;
      addC(c.name, pt.v, ag ? ag.name : 'Cliente direto');
    });
  });
  const cliRows = Object.entries(byCli).sort((a, b) => b[1] - a[1]);
  const mesRows = Object.entries(byMes).sort((a, b) => a[0] < b[0] ? 1 : -1);
  const V = BANK.inV || 'cli';
  const rows = V === 'cli' ? cliRows : mesRows;
  const mx = Math.max(1, ...rows.map(r => r[1]));
  const nMeses = Object.keys(byMes).length;
  const bars = rows.length ? `<div style="display:flex;flex-direction:column;gap:10px">${rows.map(([k, v]) => `<div style="display:flex;align-items:center;gap:12px"><span class="small" style="flex:0 0 200px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(k)}">${esc(V === 'mes' ? rbLabel(k) : k)}${V === 'cli' && agOf[k] ? ` <span class="faint">· ${esc(agOf[k])}</span>` : ''}</span><div style="flex:1;min-width:0;height:16px;border-radius:8px;background:var(--surface-2);overflow:hidden;margin-right:14px"><div style="height:100%;width:${v / mx * 100}%;border-radius:8px;background:var(--accent,#22a06b)"></div></div><span class="mono small" style="flex:0 0 150px;text-align:right;white-space:nowrap">${fmtMoney0(v)} <span class="faint">${total ? Math.round(v / total * 100) : 0}%</span></span></div>`).join('')}</div>` : '<div class="empty small">Nenhuma entrada no período.</div>';
  const segP = [['mes', 'Mês'], ['q3', 'Últimos 3 meses'], ['mx', 'Últimos ' + X + ' meses'], ['ano', 'Ano'], ['sel', 'Meses escolhidos'], ['tudo', 'Tudo']];
  const monthChips = P === 'sel' ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">${allMonths.map(m => `<button class="btn sm ${selM[m] ? '' : 'ghost'}" data-act="bank-insel" data-v="${m}">${rbLabel(m)}</button>`).join('')}</div>` : '';
  const yearSel = P === 'ano' ? `<select data-on="bank-iny" class="input" style="width:auto;padding:4px 8px">${years.map(y => `<option value="${y}" ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select>` : '';
  const xInp = P === 'mx' ? `<input type="number" min="1" value="${X}" data-on="bank-inx" class="input" style="width:70px;padding:4px 6px">` : '';
  return `<div class="panel bank-report" style="margin-bottom:12px"><div class="panel-h"><h3>Entradas</h3><span class="small muted">${entity === 'pf' ? 'PF e PJ' : 'só PJ'} · ${ins.length} lançamento(s)</span></div><div class="panel-b">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><div class="seg" style="flex-wrap:wrap">${segP.map(([k, l]) => `<button class="${P === k ? 'on' : ''}" data-act="bank-inp" data-v="${k}">${l}</button>`).join('')}</div>${xInp}${yearSel}</div>
    <div class="row" style="gap:16px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px"><span><span class="small muted">Total</span> <b class="mono">${fmtMoney0(total)}</b></span><span><span class="small muted">Média por mês</span> <b class="mono">${fmtMoney0(nMeses ? total / nMeses : 0)}</b></span><span><span class="small muted">Meses com entrada</span> <b class="mono">${nMeses}</b></span></div>
    <div class="seg" style="margin-bottom:12px">${[['cli', 'Por cliente'], ['mes', 'Por mês']].map(([k, l]) => `<button class="${V === k ? 'on' : ''}" data-act="bank-inv" data-v="${k}">${l}</button>`).join('')}</div>
    ${monthChips}
    ${bars}
  </div></div>`;
}
ACTIONS['bank-inp'] = (el) => { BANK.inP = el.dataset.v; if (BANK.inP === 'sel' && !Object.keys(BANK.inSel || {}).length) BANK.inSel = { [bankMonthNow()]: true }; render(); };
ACTIONS['bank-insel'] = (el) => { const sel = { ...(BANK.inSel || {}) }; const m = el.dataset.v; if (sel[m]) delete sel[m]; else sel[m] = true; BANK.inSel = sel; render(); };
const bankMonthNow = () => (BANK.month || ymd(new Date()).slice(0, 7));
ACTIONS['bank-inv'] = (el) => { BANK.inV = el.dataset.v; render(); };
CHANGES['bank-inx'] = (el) => { BANK.inX = Math.max(1, Number(el.value) || 6); render(); };
CHANGES['bank-iny'] = (el) => { BANK.inY = el.value; render(); };
function bankSummaryHTML(entity) {
  const ym = BANK.month || ymd(new Date()).slice(0, 7);
  const key = entity + ':' + ym;
  const closed = db.setting('closedMonths', {})[key];
  const inBase = entity === 'pf' ? (BANK.every || []) : (BANK.all[entity] || []);   // PF financeiro = PF + PJ como uma conta só
  const inMonth = inBase.filter(t => t.scope === 'externa' && (t.posted_on || '').slice(0, 7) === ym);
  // Saídas: PF mostra tudo (contas PF e PJ); PJ mostra só o que é PJ
  const poolOut = (entity === 'pf' ? (BANK.every || []) : (BANK.all.pj || [])).filter(t => t.scope === 'externa' && t.flow === 'out');
  const isTher = (t) => t.flow === 'out' && !!t.reimb_row_id;
  const isReimb = (t) => t.flow === 'in' && isReembCat(t.category);
  const isExt = (t) => t.flow === 'in' && /^Estorno/.test(t.category || '');
  const extSum = inBase.filter(t => isExt(t) && (t.posted_on || '').slice(0, 7) === ym).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const ent = inMonth.filter(t => t.flow === 'in' && !isReimb(t) && !isExt(t)).reduce((s, t) => s + Number(t.amount), 0);
  const outMonth = poolOut.filter(t => (t.posted_on || '').slice(0, 7) === ym);
  const sai = outMonth.filter(t => !isTher(t)).reduce((s, t) => s + Number(t.amount), 0) + extSum;
  const reimbIn = inMonth.filter(isReimb).reduce((s, t) => s + Number(t.amount), 0);
  const ther = Math.abs(outMonth.filter(isTher).reduce((s, t) => s + Number(t.amount), 0));
  const cartao = Math.abs((BANK.all[entity] || []).filter(t => t.scope === 'cartao' && (t.posted_on || '').slice(0, 7) === ym).reduce((s, t) => s + Number(t.amount), 0));
  const origin = entity === 'pf' ? (BANK.origin || 'all') : 'all';
  const originOf = (t) => (/d660$/.test(t.account_tail || '') ? 'cartao' : 'conta');
  const f = BANK.f || {};
  // Categoria por contraparte e fluxo: entrada e saída da mesma contraparte podem ter categorias diferentes.
  const cbk = (t) => (t.counterpart || '—') + '|' + (t.flow || '');
  const catBy = {};
  (BANK.every || []).forEach(x => { if (x.category) catBy[cbk(x)] = x.category; });
  const passes = (t) => {
    if (origin !== 'all' && originOf(t) !== origin) return false;
    const k = t.counterpart || '—';
    if (f.q && !bnorm(k).includes(bnorm(f.q))) return false;
    if (f.cat === '__none' ? !!catBy[cbk(t)] : (f.cat && catBy[cbk(t)] !== f.cat)) return false;
    if (f.meth && bankMethod(t) !== f.meth) return false;
    if (f.acc && t.entity !== f.acc) return false;
    const a = Math.abs(Number(t.amount) || 0);
    if (f.min && a < Number(f.min)) return false;
    if (f.max && a > Number(f.max)) return false;
    return true;
  };
  // Transferências internas (PJ → PF) ficam fora dos totais, mas podem aparecer na lista da PJ.
  const listPool = entity === 'pj' && BANK.showT !== false ? poolOut.concat((BANK.all.pj || []).filter(t => t.flow === 'out' && t.scope === 'interna')) : poolOut;
  const outsAll = listPool.filter(passes).sort((a, b) => (b.posted_on || '').localeCompare(a.posted_on || ''));
  const showTBtn = entity === 'pj' ? `<button class="btn sm ghost" data-act="bank-showt">${BANK.showT !== false ? 'Ocultar' : 'Mostrar'} transferências para PF</button>` : '';
  const barInner = `${BANK.cmp ? '<button class="btn sm" data-act="bank-cmp" style="border:1px solid var(--line,#d8dbe0)">← Voltar ao mês</button>' : ''}${showTBtn}`;
  const bar = barInner ? `<div class="row" style="gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">${barInner}</div>` : '';
  const closeRow = `<div class="row" style="gap:8px;align-items:center;justify-content:flex-end;margin-top:10px;flex-wrap:wrap">${closed ? `<span class="tag tg" style="background:var(--surface-2)">Mês fechado em ${fmtDate(closed.closed_at)}</span><button class="btn sm ghost" data-act="bank-reopen" data-entity="${entity}" data-ym="${ym}">Reabrir</button>` : `<button class="btn sm ghost" data-act="bank-close" data-entity="${entity}" data-ym="${ym}">Fechar mês</button>`}</div>`;
  const rowHTML = (t) => {
    const k = t.counterpart || '—';
    const cat = catBy[cbk(t)] || null;
    const sug = cat ? null : (t.flow === 'out' ? suggestCat(k, t.counterpart_doc) : suggestIncCat(k));
    const autoCat = db.setting('bankAutoCat', {});
    if (t.counterpart_doc) bankCnpjLookup(t.counterpart_doc);
    const info = t.counterpart_doc && cnpjCache()[String(t.counterpart_doc).replace(/\D/g, '')];
    const eff = t.biz_entity || t.entity;
    return `<div class="bank-row">
      <span><input type="checkbox" data-on="bank-sel" data-id="${t.id}" ${BANK.sel && BANK.sel[t.id] ? 'checked' : ''} aria-label="Selecionar lançamento"></span>
      <span class="mono small">${fmtDateShort(t.posted_on)}</span>
      <span class="bn" title="${esc(info?.nome || k)}">${esc(k)}${alias(k) ? ` <span class="faint">· ${esc(alias(k))}</span>` : ''} <button class="bank-cat-btn faint small" data-act="bank-alias" data-cp="${esc(k)}" title="Dar apelido">✎</button></span>
      <span class="mono small">${dotHTML(t.scope === 'interna' ? '#2563eb' : t.flow === 'in' ? '#22a06b' : '#d64545', t.scope === 'interna' ? 'Interna' : t.flow === 'in' ? 'Entrada' : 'Saída')}${fmtMoney(Math.abs(Number(t.amount)))}</span>
      <span class="small muted">${bankMethod(t)}</span>
      <span><button class="bank-cat-btn" data-act="bank-biz" data-id="${t.id}" title="Trocar entre PF e PJ">${accTag(eff)}</button></span>
      <span>${cat ? `<button class="bank-cat-btn" data-act="bank-cat" data-entity="${t.entity}" data-cp="${esc(k)}" data-flow="${t.flow}">${catTag(cat)}${autoCat[k] === cat ? ' <span class="faint small">sugerido</span>' : ''}</button>`
        : sug ? `<span class="bank-cat-btn" style="cursor:default">${catTag(sug)} <span class="faint small">sugerido</span></span>`
        : `<button class="btn sm ghost" data-act="bank-cat" data-entity="${t.entity}" data-cp="${esc(k)}" data-flow="${t.flow}">Definir categoria</button>`}${t.tag ? ` <span class="tag tg" style="${cssTb(TAG_COLOR[t.tag] || '#8a8f98')}">${esc(t.tag)}</span>` : ''}</span>
      <span class="small muted bm">${bankRowExtra(t)}</span></div>`;
  };
  BANK.openM = BANK.openM || {};
  const lst = BANK.lst || 'tudo';
  const outList = lst === 'in' ? [] : outsAll;
  const inList = lst === 'out' ? [] : (BANK.all[entity] || []).filter(t => t.flow === 'in' && passes(t));
  const listAll = outList.concat(inList).sort((a, b) => (b.posted_on || '').localeCompare(a.posted_on || ''));
  const months = [...new Set(listAll.map(t => (t.posted_on || '').slice(0, 7)))];
  const groups = months.map(m => {
    const open = BANK.openM[entity + ':' + m] ?? (m === ym);
    const items = listAll.filter(t => (t.posted_on || '').slice(0, 7) === m);
    const real = items.filter(t => t.scope !== 'interna');
    const tot = real.filter(t => t.flow === 'out').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const totIn = real.filter(t => t.flow === 'in').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const trf = items.filter(t => t.scope === 'interna').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const headTxt = lst === 'in' ? `entradas ${fmtMoney0(totIn)}` : lst === 'out' ? fmtMoney0(tot) : `↑ ${fmtMoney0(totIn)} · ↓ ${fmtMoney0(tot)}`;
    return `<div class="bank-group">
      <button class="bank-ghead" data-act="bank-mtoggle" data-k="${entity}:${m}"><span>${open ? '▾' : '▸'} ${rbLabel(m)}</span><span class="mono small muted">${real.length} · ${headTxt}${trf ? ` · transferências para PF ${fmtMoney0(trf)} (fora do total)` : ''}</span></button>
      ${open ? `<div class="bank-rows bank-head"><span></span><span>Data</span><span>Descrição</span><span>Valor</span><span>Meio</span><span>Conta</span><span>Categoria</span><span>Onde foi</span></div>${items.map(rowHTML).join('')}` : ''}
    </div>`;
  }).join('');
  const sum = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + Math.abs(Number(x.amount)); return acc; }, {});
  const monthOuts = outMonth.filter(passes);
  // Terapia reembolsável fica separada e sempre no fim da lista, mesmo sendo o maior valor
  const catKey = (t) => (isTher(t) ? THER_LABEL : (catBy[cbk(t)] || 'Sem categoria'));
  const catSums = sum(monthOuts, catKey);
  // Estorno "Estorno→Categoria" abate essa categoria
  (BANK.all[entity] || []).filter(t => t.flow === 'in' && abatesCat(t.category) && (t.posted_on || '').slice(0, 7) === ym).forEach(t => { const tg = t.category.split('→')[1]; catSums[tg] = (catSums[tg] || 0) - Math.abs(Number(t.amount)); });
  const byCat = Object.entries(catSums).filter(([k, v]) => k !== THER_LABEL && v > 0 && (BANK.reemb === true || !isReembCat(k))).sort((a, b) => b[1] - a[1]);
  if (catSums[THER_LABEL] && BANK.reemb === true) byCat.push([THER_LABEL, catSums[THER_LABEL]]);
  const byMeth = Object.entries(sum(monthOuts, bankMethod)).sort((a, b) => b[1] - a[1]);
  const byCp = Object.entries(sum(monthOuts, t => t.counterpart || '—')).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const bars = (arr) => { const mx = Math.max(1, ...arr.map(x => x[1])); return arr.length ? `<div class="bars">${arr.map(([k, v]) => `<div class="bar-row"><span class="lab">${esc(k)}</span><div class="bar-track"><div class="bar-fill fill" style="width:${v / mx * 100}%"></div></div><span class="mono small">${fmtMoney0(v)}</span></div>`).join('')}</div>` : '<div class="empty small">Sem saídas neste mês.</div>'; };
  const byAcc = Object.entries(sum(monthOuts, t => (t.biz_entity || t.entity).toUpperCase())).sort((a, b) => b[1] - a[1]);
  const views = { cat: ['Categoria', () => donutHTML(byCat, 'Por categoria', chartCat, true)], meio: ['Meio', () => donutHTML(byMeth, 'Por meio')], conta: ['PF / PJ', () => donutHTML(byAcc, 'PF e PJ', (k) => exColor(k === 'PJ' ? 'EMPRESA' : 'PESSOAL'))], onde: ['Onde foi', () => bars(byCp)] };
  const cur = views[BANK.rep] ? BANK.rep : 'cat';
  const tabs = `<div class="seg" style="margin-bottom:12px;flex-wrap:wrap">${Object.entries(views).map(([k, [l]]) => `<button class="${cur === k ? 'on' : ''}" data-act="bank-rep" data-v="${k}">${l}</button>`).join('')}</div>`;
  const report = `<div class="panel bank-report"><div class="panel-h"><h3 class="row" style="gap:6px;align-items:center;flex-wrap:wrap">Relatório de <select data-on="bank-rmonth" class="input" style="width:auto;font:inherit;font-weight:600;padding:4px 8px">${[...new Set([ym, ...(BANK.all[entity] || []).filter(t => t.posted_on).map(t => t.posted_on.slice(0, 7))])].sort().reverse().map(m => `<option value="${m}" ${m === ym ? 'selected' : ''}>${rbLabel(m)}</option>`).join('')}</select></h3></div><div class="panel-b"><label class="row" style="gap:6px;margin-bottom:10px;align-items:center"><input type="checkbox" data-on="bank-reemb" ${BANK.reemb === true ? 'checked' : ''}> Mostrar reembolsos no relatório</label>${tabs}${views[cur][1]()}</div></div>`;
  const dot = (c) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;vertical-align:middle"></span>`;
  const GREEN = '#22a06b', RED = '#d64545';
  const fOn = bankFilterOn() || BANK.fOpen;
  if (BANK.cmp) return `${bar}${compareHTML(entity)}`;
  const inRep = bankInReportHTML(entity, ym, inBase, (t) => isExt(t) || (BANK.reemb !== true && isReimb(t)));
  const nSel = Object.keys(BANK.sel || {}).length;
  const selBar = nSel ? `<div class="row" style="gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;padding:8px 12px;background:var(--surface-2);border-radius:10px"><b class="small">${nSel} selecionado(s)</b><button class="btn sm primary" data-act="bank-bulk-cat">Mudar categoria</button><button class="btn sm ghost" data-act="bank-bulk-clear">Limpar seleção</button></div>` : '';
  return `${bar}${selBar}<div class="kpis">
    <div class="kpi"><span class="k">${dot(GREEN)}Entradas</span><span class="v">${fmtMoney0(ent)}</span><span class="s">externas, sem reembolsos</span></div>
    <div class="kpi"><span class="k">${dot(RED)}Saídas</span><span class="v">${fmtMoney0(Math.abs(sai))}</span><span class="s">${entity === 'pf' ? 'PF + PJ, sem terapias' : 'só PJ, sem terapias'}</span></div>
    <div class="kpi"><span class="k">${dot(GREEN)}Reembolsos recebidos</span><span class="v">${fmtMoney0(reimbIn)}</span><span class="s">plano de saúde</span></div>
    <div class="kpi"><span class="k">${dot(RED)}Terapias pagas</span><span class="v">${fmtMoney0(ther)}</span><span class="s">pagas pelo PF</span></div>
    <div class="kpi"><span class="k">Sobra</span><span class="v">${fmtMoney0(ent + sai)}</span><span class="s">entradas − saídas</span></div>
    ${cartao ? `<div class="kpi"><span class="k">Fatura do cartão</span><span class="v">${fmtMoney0(cartao)}</span><span class="s">paga · conta uma vez, pelos itens</span></div>` : ''}
  </div>
  <div class="bank-layout">
    <div class="panel bank-list"><div class="panel-h"><h3>Saídas</h3><span class="small muted">${entity === 'pf' ? 'PF e PJ' : 'só PJ'} · por mês</span><span class="grow"></span><span class="row" style="gap:4px;align-items:center"><button class="btn sm ghost" data-act="bank-mprev" title="Mês anterior">‹</button><button class="btn sm" data-act="bank-mnow" style="min-width:150px">${rbLabel(ym)}</button><button class="btn sm ghost" data-act="bank-mnext" title="Próximo mês">›</button></span><button class="btn sm ${BANK.cmp ? 'on' : ''}" data-act="bank-cmp" style="margin-left:6px">${BANK.cmp ? 'Voltar ao mês' : 'Comparar meses'}</button><button class="btn sm ${fOn ? 'on' : ''}" data-act="bank-f-toggle" style="margin-left:6px">${icon('search')} Filtrar${bankFilterOn() ? ' · ativo' : ''}</button></div>
      ${fOn ? bankFilterHTML(catBy) : ''}
      <div class="panel-b"><div style="display:flex;flex-wrap:wrap;gap:28px;align-items:center;margin-bottom:10px">${entity === 'pf' ? `<div class="seg">${[['all', 'Tudo'], ['conta', 'Conta'], ['cartao', 'Cartão']].map(([k, l]) => `<button class="${origin === k ? 'on' : ''}" data-act="bank-origin" data-v="${k}">${l}</button>`).join('')}</div>` : ''}${`<div class="seg">${[['tudo', 'Tudo'], ['in', 'Entradas'], ['out', 'Saídas']].map(([k, l]) => `<button class="${lst === k ? 'on' : ''}" data-act="bank-lst" data-v="${k}">${l}</button>`).join('')}</div>`}</div><div style="max-height:65vh;overflow:auto">${groups || '<div class="empty small">Nenhum lançamento.</div>'}</div></div></div>
    ${report}
  </div>
  ${inRep}${closeRow}`;
}
CHANGES['bank-month'] = (el) => { BANK.month = el.value; render(); };
ACTIONS['bank-origin'] = (el) => { BANK.origin = el.dataset.v; render(); };
ACTIONS['bank-lst'] = (el) => { BANK.lst = el.dataset.v; render(); };
ACTIONS['bank-showt'] = () => { BANK.showT = BANK.showT === false; render(); };
ACTIONS['bank-rep'] = (el) => { BANK.rep = el.dataset.v; render(); };
ACTIONS['bank-mtoggle'] = (el) => { BANK.openM = BANK.openM || {}; const k = el.dataset.k; const [ent, m] = k.split(':'); const cur = BANK.openM[k] ?? (m === (BANK.month || ymd(new Date()).slice(0, 7)) && ent); BANK.openM[k] = !cur; render(); };
// Categorias de gasto: as padrão mais as que o Tulio criar.
// Mesmas categorias e cores da tela de Despesas (PF/PJ), mais as de extrato.
let BANK_CATS = [...Object.values(EX_CATS).flat(), 'Terapia', 'Estorno'];   // mesmos tipos de Despesas, mais os especiais do extrato
const exKeyOf = (name) => { for (const [g, subs] of Object.entries(EX_CATS)) if (subs.includes(name)) return `${g}/${name}`; return `PESSOAL/${name}`; };
// Reembolso Outros→Compras aparece como "Reembolso > Compras" (o valor guardado não muda).
const catLabel = (name) => String(name || '').replace(/^Reembolso Outros→/, 'Reembolso > ');
// Cor da marcação de pessoa: Alice rosinha, Rafa azulzinha.
const TAG_COLOR = { Alice: '#e07ab0', Rafa: '#5b8fe0' };
const catTag = (name) => (name ? `<span class="tag tg" style="${cssTb(exColor(exKeyOf(name)))}">${esc(catLabel(name))}</span>` : '');
const accTag = (acc) => `<span class="tag tg abbr" style="${cssTb(exColor(acc === 'pj' ? 'EMPRESA' : 'PESSOAL'))}">${acc === 'pj' ? 'PJ' : 'PF'}</span>`;
const THER_LABEL = 'Terapia reembolsável';
// Categorias que costumam ser da empresa (PJ) por padrão.
const PJ_CATS = ['Contabilidade', 'Impostos'];
const bankCats = () => [...new Set([...BANK_CATS, ...db.setting('bankCats', [])])];
// Sugestão automática pelo nome do estabelecimento. Só sugere; quem confirma é você.
const CAT_RULES = [
  [/hudson|aluguel/i, 'Moradia'],
  [/amazon|shopee|mercadolivre|mercado livre|magalu|magazine|shein|aliexpress|americanas|renner|c&a|zara|riachuelo|melimais/i, 'Compras'],
  [/mercad|supermerc|atacad|varej|hortifr|padaria|a[cç]ougue|sacol[aã]o|assa[ií]|carrefour|p[ãa]o de a[cç]|feira|multifood|ampm|am\/pm|conveni|biscuit|bisc|rosarinho|palato|recibom|maralco|clube portugues|minuto pa|bembom|benfica|gaivota|novo mercatto|bem mais|spress|freitas varejo|mercadinho/i, 'Alimentação'],
  [/ifd|ifood|rappi|uber ?eats|delivery|restaur|lanche|pizza|hamburg|burger|sushi|teppan|china in box|donut|popeyes|deli\b|frios|cafe|caf[eé]|sorvet|doceria|bistr|churr/i, 'Alimentação'],
  [/farma\b|medicament|drogasil|extra farma|dose certa|rd saude|tradicao medic/i, 'Remédios'],
  [/\bbar\b|boteco|cervej|chopp|cinema|cinemark|ingresso|teatro|show|sympla|steam|playstation|playst|xbox|livrar|kaizen|barraca|esperanto|choribar|rosa e silva/i, 'Lazer'],
  [/posto|gasolin|combust|ipiranga|shell|petrobras|petrocal|petroservice|multipostos|auto posto|estacion|uber(?! ?eats)|99app|\b99\b|cabify|pedagio|ped[aá]gio|estacionamento|park\b|parking|detran|cloudpark|pop \d|nutag/i, 'Transporte'],
  [/barbear|cabeleireir|beleza|perfum|cosm[eé]t|est[eé]tica|sal[aã]o|manicure|depila|kali/i, 'Estética'],
  [/farm[aá]c|drogaria|droga|raia|pacheco|laborat|consult[oó]rio|cl[ií]nica|hospital|academ|smart fit|dentist|fitness|assistencia dos funcion|caixa de assist/i, 'Saúde'],
  [/inditex|centauro|osklen|\bosk\b/i, 'Roupas'],
  [/booking|airasia|12go|2c2p|hotel|flight|cars on/i, 'Viagem'],
  [/contador|contabil|cart[oó]rio|junta comercial|receita federal|receita|\bdas\b|inss|darf|simples nacional|cnpj|registro|taxa|pjbank/i, 'Contabilidade'],
  [/netflix|spotify|apple|dropbox|google|youtube|adobe|icloud|prime|hbo|disney|notion|chatgpt|openai|anthropic|claude|cinema 4d|linkedin|mubi|microsoft|onedrive/i, 'Assinaturas'],
  [/celpe|enel|energia|[aá]gua|compesa|sabesp|claro|vivo|tim |oi |internet|gás|gas /i, 'Contas da casa'],
  [/kalunga/i, 'Material de Trabalho'],
];
// Atividade principal (CNAE) da empresa -> categoria.
function cnaeCat(c) {
  const p = String(c || '');
  if (/^4711|^4721|^5611|^5612|^5620/.test(p)) return 'Alimentação';
  if (/^5630|^9001|^9329/.test(p)) return 'Lazer';
  if (/^4731/.test(p)) return 'Transporte';
  if (/^4771/.test(p)) return 'Saúde';
  if (/^49|^50|^51|^52/.test(p)) return 'Transporte';
  if (/^35|^61/.test(p)) return 'Contas da casa';
  if (/^62|^63/.test(p)) return 'Assinaturas';
  if (/^86/.test(p)) return 'Saúde';
  if (/^47/.test(p)) return 'Compras';
  return null;
}
const cnpjCache = () => db.setting('cnpjCache', {});
const cnpjPending = new Set();
// Consulta o CNPJ na BrasilAPI (uma vez por CNPJ; guarda no banco de configurações).
async function bankCnpjLookup(doc) {
  const digits = String(doc || '').replace(/\D/g, '');
  if (digits.length !== 14 || cnpjCache()[digits] || cnpjPending.has(digits)) return;
  cnpjPending.add(digits);
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + digits);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    db.setSetting('cnpjCache', { ...cnpjCache(), [digits]: { nome: j.nome_fantasia || j.razao_social || '', cnae: j.cnae_fiscal ? String(j.cnae_fiscal) : '' } });
    render();
  } catch (e) { /* sem internet ou CNPJ inválido: segue com as regras por nome */ }
  finally { cnpjPending.delete(digits); }
}
// Sugestão: primeiro pela atividade da empresa (CNPJ), depois pelo nome.
// Meio de pagamento pela origem do lançamento (conta de cartão, memo do Pix, etc.).
const METHODS = ['Crédito', 'Débito', 'Pix', 'Outro'];
const GREEN = '#22a06b', RED = '#d64545', PF_C = '#2E43D6', PJ_C = '#b45309';
const CHART_PAL = ['#2E43D6', '#22a06b', '#d64545', '#b45309', '#7c3aed', '#0ea5a4', '#db2777', '#64748b', '#84cc16', '#f59e0b'];
const CAT_COLORS = ['#B9C8F5', '#A8DCC4', '#F5B5B5', '#F2D39B', '#D2BEF5', '#A6E3E1', '#F7C2DA', '#C9D1DC', '#D7EFA6', '#F8E08E', '#B7D9F7', '#E8C79B', '#C7CBFA', '#B6E2C6', '#F1B3C0', '#A7E6DC', '#E3B8F5', '#F2D27A', '#A5EDEF', '#FBC7A4', '#C3CAD6', '#CFE7A0'];
const chartCat = (k) => exColor(exKeyOf(k));   // mesma cor que o tipo tem em Despesas
const palColor = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CHART_PAL[h % CHART_PAL.length]; };
const dotHTML = (c, title = '') => `<span title="${esc(title)}" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;vertical-align:middle;flex:none"></span>`;
// Rosca centralizada com chips claros na legenda (mesmas cores das categorias)
const chipHTML = (c, label, val, pct, hex) => `<span class="tag tg" style="${cssTb(hex)}">${esc(label)} <span class="mono">${fmtMoney0(val)}</span>${pct !== undefined ? ` <span style="opacity:.7">${pct}%</span>` : ''}</span>`;
function donutHTML(arr, centerLabel = 'Total', colorFn = (k) => palColor(k), legendBelow = false) {
  const tot = arr.reduce((a, x) => a + x[1], 0);
  if (!tot) return '<div class="empty small">Sem saídas neste mês.</div>';
  const R = 70, C = 2 * Math.PI * R; let acc = 0; const gap = arr.length > 1 ? 2 : 0;
  const colorOf = (k) => (k === THER_LABEL ? '#cbd5e1' : colorFn(k));
  const segs = arr.map(([k, v]) => { const f = v / tot; const len = Math.max(0, f * C - gap); const seg = `<circle data-seg="${esc(k)}" r="${R}" cx="110" cy="110" fill="none" stroke="${colorOf(k)}" stroke-width="26" stroke-dasharray="${len} ${C}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 110 110)" style="transition:opacity .15s"><title>${esc(k)}: ${fmtMoney0(v)} (${Math.round(f * 100)}%)</title></circle>`; acc += f; return seg; }).join('');
  const legend = arr.map(([k, v]) => { const pct = Math.round(v / tot * 100); return `<div data-seg="${esc(k)}" data-val="${esc(fmtMoney0(v) + ' · ' + pct + '%')}" style="transition:opacity .15s">${chipHTML(colorOf(k), k, v, pct, colorOf(k))}</div>`; }).join('');
  const svg = `<svg viewBox="0 0 220 220" width="220" height="220" role="img" aria-label="${esc(centerLabel)}">${segs}
      <text class="dc1" x="110" y="104" text-anchor="middle" font-size="12" fill="var(--fg-3)">${esc(centerLabel)}</text>
      <text class="dc2" x="110" y="126" text-anchor="middle" font-size="17" font-weight="600" fill="currentColor">${fmtMoney0(tot)}</text></svg>`;
  if (legendBelow) return `<div data-donut data-d1="${esc(centerLabel)}" data-d2="${esc(fmtMoney0(tot))}" style="display:flex;flex-direction:column;align-items:center;gap:18px">
    ${svg}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px 18px;width:100%;max-width:680px">${legend}</div>
  </div>`;
  return `<div data-donut data-d1="${esc(centerLabel)}" data-d2="${esc(fmtMoney0(tot))}" style="display:flex;gap:28px;align-items:center;justify-content:center;flex-wrap:wrap">
    <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:300px">${legend}</div>
    ${svg}
  </div>`;
}
// Ao passar o mouse numa categoria (no gráfico ou na legenda), destaca só ela.
const donutFocus = (box, key) => {
  box.querySelectorAll('[data-seg]').forEach(x => { x.style.opacity = !key || x.dataset.seg === key ? '' : '0.25'; });
  const leg = key ? Array.from(box.querySelectorAll('[data-val]')).find(x => x.dataset.seg === key) : null;
  const c1 = box.querySelector('.dc1'), c2 = box.querySelector('.dc2');
  if (c1) c1.textContent = key || box.dataset.d1;
  if (c2) c2.textContent = key ? (leg ? leg.dataset.val : '') : box.dataset.d2;
};
document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-seg]'); const box = el && el.closest('[data-donut]'); if (box) donutFocus(box, el.dataset.seg); });
document.addEventListener('mouseout', (e) => { const el = e.target.closest && e.target.closest('[data-seg]'); const box = el && el.closest('[data-donut]'); if (box) donutFocus(box, null); });
function bankMethod(t) {
  if (/d660$/.test(t.account_tail || '')) return 'Crédito';
  const m = String(t.memo || '');
  if (/pix/i.test(m)) return 'Pix';
  if (/d[ée]bito/i.test(m)) return 'Débito';
  return 'Outro';
}
// Entradas: sugestão de reembolso pelo nome (mesmo critério das saídas).
// Reembolso com nome de compra (ex.: "reembolso amazon") sugere "Reembolso Outros→Compras": abate Compras.
// Entrada cujo nome bate com uma compra (ex.: AMAZON) é reembolso dessa categoria: "Reembolso Outros→Compras".
function suggestIncCat(name) {
  if (/sul\s*america/i.test(name || '')) return REEMB_TER;
  const t = suggestCat(name, null);
  if (t) return REEMB_OUT + '→' + t;
  if (/reembols|estorno|devol/i.test(name || '')) return REEMB_OUT;
  return null;
}
// Aprendizado: o conjunto de palavras do nome (sem "da/de/do", parênteses e "transferência") que sempre levou
// à mesma categoria, em 2+ contrapartes e 80%+. O nome precisa conter TODAS essas palavras, em qualquer ordem:
// "Cristiana Abrantes da Fonte" só casa se tiver as três juntas, nunca só "Fonte Abrantes".
const LEARN_STOP = new Set(['da', 'de', 'do', 'dos', 'das', 'e', 'a', 'o', 'the', 'and', 'com', 'para', 'pela', 'ltda', 'sa', 'pix', 'me', 'eireli', 'pagamento', 'transferencia', 'enviada', 'recebida', 'compra', 'debito', 'credito', 'parcelado', 'parcela', 'brasil', 'comercio', 'servicos']);
const normWords = (name) => bnorm(String(name || '').replace(/\(.*?\)/g, ' ')).split(/[^a-z0-9]+/).filter(w => w && !LEARN_STOP.has(w) && !/^\d+$/.test(w));
function bankBuildLearned(every) {
  const per = {};   // contraparte -> categoria dominante (saídas)
  (every || []).forEach(t => {
    if (t.flow !== 'out' || !t.category || !t.counterpart || /^(Estorno|Reembolso|Terapia)/.test(t.category)) return;
    per[t.counterpart] = per[t.counterpart] || {};
    per[t.counterpart][t.category] = (per[t.counterpart][t.category] || 0) + 1;
  });
  const sets = {};   // conjunto de palavras -> { categoria: nº de contrapartes }
  Object.entries(per).forEach(([cp, cats]) => {
    const best = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];
    const w = [...new Set(normWords(cp))].filter(x => x.length >= 3);
    if (w.length < 2) return;
    const key = w.sort().join('|');
    sets[key] = sets[key] || {};
    sets[key][best] = (sets[key][best] || 0) + 1;
  });
  const out = [];
  Object.entries(sets).forEach(([key, cats]) => {
    const total = Object.values(cats).reduce((a, b) => a + b, 0);
    const [cat, n] = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (total >= 2 && n / total >= 0.8) out.push({ words: key.split('|'), cat, n: total });
  });
  return out.sort((a, b) => b.n - a.n);
}
function suggestCat(name, doc) {
  const digits = String(doc || '').replace(/\D/g, '');
  const c = digits && cnpjCache()[digits];
  if (c && c.cnae) { const v = cnaeCat(c.cnae); if (v) return v; }
  const hit = CAT_RULES.find(([re]) => re.test(name || ''));
  if (hit) return hit[1];
  const ws = new Set(normWords(name));
  const learnedHit = (BANK.learned || []).find(r => r.words.every(x => ws.has(x)));
  return learnedHit ? learnedHit.cat : null;
}
// Estorno: pergunta de qual categoria abater.
function bankEstornoTarget(cp) {
  const cats = bankCats().filter(c => c !== 'Estorno' && c !== 'Terapia');
  return new Promise(res => {
    let done = false;
    const l = openLayer({
      html: `<div class="dh"><h2>Abater de qual categoria?</h2></div><div class="db"><p style="margin:0">“${esc(cp)}” · o valor sai dessa categoria no relatório.</p>
        <div class="row" style="flex-wrap:wrap;gap:6px">${cats.map(c => `<button class="btn sm tg" data-t="${esc(c)}" style="${cssTb(exColor(exKeyOf(c)))}">${esc(c)}</button>`).join('')}</div>
        <div class="field"><label for="bext-new">Outra categoria</label><div class="row"><input id="bext-new" class="input" placeholder="Nova categoria"><button class="btn sm" data-t="__new">Usar</button></div></div></div>`,
      onClose: () => { if (!done) res(null); }
    });
    l.box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      let v = b.dataset.t;
      if (v === '__new') v = $('#bext-new', l.box).value.trim();
      if (!v) return toast('Digite o nome da categoria.');
      done = true; res(v); l.close();
    });
  });
}
// Entrada só mostra opções de entrada; Estorno continua aqui e, ao escolher, pede a saída a abater.
// Reembolsos recebidos: de terapia (liga à tabela de terapias) ou de outras coisas que você pagou (liga a um gasto).
const REEMB_TER = 'Reembolso Terapias', REEMB_OUT = 'Reembolso Outros';
// Reembolso Outros aponta a categoria que abate ("Reembolso Outros→Lazer"), como o Estorno.
const isReembTer = (c) => c === REEMB_TER || c === 'Reembolso';
const isReembOut = (c) => c === REEMB_OUT || /^Reembolso Outros→/.test(c || '');
const isReembCat = (c) => c === REEMB_TER || isReembOut(c) || c === 'Reembolso';
const abatesCat = (c) => /^Estorno→/.test(c || '') || (isReembOut(c) && BANK.reemb === true && /→/.test(c));
const BANK_IN_CATS = ['Renda', 'Freelas', REEMB_TER, REEMB_OUT, 'Estorno'];
function bankCatDialog(cp, bulk, flow) {
  // Estorno e reembolso só existem em entradas.
  const cats = (flow === 'in' ? BANK_IN_CATS : bankCats().filter(c => c !== 'Estorno' && !isReembCat(c))).slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return new Promise(res => {
    let done = false;
    const l = openLayer({
      html: `<div class="dh"><h2>Categoria</h2></div><div class="db"><p style="margin:0">${bulk ? `“${esc(cp)}”. Só os lançamentos selecionados.` : `“${esc(cp)}”. Vale para todos os lançamentos com esse nome.`}</p>
        <div class="field"><span class="lbl">Conta</span><div class="seg" id="bcat-biz"><button data-biz="pf" class="on">PF</button><button data-biz="pj">PJ</button></div></div>
        <div class="row" style="flex-wrap:wrap;gap:6px">${cats.map(c => `<button class="btn sm tg" data-cat="${esc(c)}" style="${cssTb(exColor(exKeyOf(c)))}">${esc(c)}</button>`).join('')}</div>
        <div class="field"><label for="bcat-new">Outra categoria</label><div class="row"><input id="bcat-new" class="input" placeholder="Nova categoria"><button class="btn sm" data-cat="__new">Usar</button></div></div>
        <div class="field"><span class="lbl">Pessoa (opcional)</span><div class="seg" id="bcat-tag"><button data-tag="">Eu</button><button data-tag="Rafa">Rafa</button><button data-tag="Alice">Alice</button></div></div></div>`,
      onClose: () => { if (!done) res(null); }
    });
    let bizTouched = false;
    const pickBiz = (b) => { bizTouched = true; l.box.querySelectorAll('#bcat-biz button').forEach(x => x.classList.toggle('on', x === b)); };
    l.box.addEventListener('click', async (e) => {
      const bz = e.target.closest('#bcat-biz [data-biz]'); if (bz) return pickBiz(bz);
      const tg = e.target.closest('#bcat-tag [data-tag]');
      if (tg) { done = true; res({ tagOnly: true, tag: tg.dataset.tag || null }); l.close(); return; }
      const b = e.target.closest('[data-cat]'); if (!b) return;
      let v = b.dataset.cat;
      if (v === '__new') v = $('#bcat-new', l.box).value.trim();
      if (!v) return toast('Digite o nome da categoria.');
      let biz = bizTouched ? (l.box.querySelector('#bcat-biz button.on')?.dataset.biz || 'pf') : 'pf';
      if (v === 'Estorno' || v === REEMB_OUT) {
        const target = await bankEstornoTarget(cp);
        if (!target) return;
        v = (v === 'Estorno' ? 'Estorno→' : REEMB_OUT + '→') + target;
        if (!bizTouched) biz = null;   // estorno fica na conta de origem, a não ser que você troque
      }
      done = true; res({ cat: v, biz }); l.close();
    });
  });
}
// Apelido: um nome amigável (ex.: "Diogo Oliveira" → "Kinay") mostrado em cor mais clara ao lado do nome original.
const alias = (cp) => (db.setting('bankAliases', {}) || {})[cp] || '';
ACTIONS['bank-alias'] = (el) => {
  const cp = el.dataset.cp, cur = alias(cp);
  const l = openLayer({
    html: `<div class="dh"><h2>Apelido</h2></div><div class="db"><p style="margin:0">“${esc(cp)}” aparece com este apelido ao lado do nome original. Deixe vazio para remover.</p>
      <div class="field"><label for="bal-v">Apelido</label><input id="bal-v" class="input" value="${esc(cur)}" placeholder="Ex.: Kinay" autocomplete="off"></div>
      <div class="row" style="gap:8px;justify-content:flex-end"><button class="btn sm ghost" data-t="cancel">Cancelar</button><button class="btn sm primary" data-t="ok">Salvar</button></div></div>`
  });
  l.box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'ok') {
      const v = l.box.querySelector('#bal-v').value.trim();
      const map = { ...(db.setting('bankAliases', {}) || {}) };
      if (v) map[cp] = v; else delete map[cp];
      db.setSetting('bankAliases', map);
      render();
    }
    l.close();
  });
  setTimeout(() => { const i = l.box.querySelector('#bal-v'); if (i) { i.focus(); i.select(); } }, 0);
};
ACTIONS['bank-cat'] = async (el) => {
  const entity = el.dataset.entity, cp = el.dataset.cp;
  const pick = el.dataset.v ? { cat: el.dataset.v, biz: PJ_CATS.includes(el.dataset.v) ? 'pj' : null } : await bankCatDialog(cp, false, el.dataset.flow);
  if (!pick) return;
  if (pick.tagOnly) {
    const qt0 = db.adapter.client.from('tempo_bank_txns').update({ tag: pick.tag, updated_at: new Date().toISOString() });
    const qt = el.dataset.flow ? qt0.eq('flow', el.dataset.flow) : qt0;
    const { error: et } = cp === '—' ? await qt.is('counterpart', null) : await qt.eq('counterpart', cp);
    if (et) return toast('Erro: ' + et.message);
    await bankLoadTxns(); return render();
  }
  const { cat, biz } = pick;
  // Só as linhas do mesmo fluxo (entrada ou saída): categorizar uma entrada não muda as saídas da mesma contraparte.
  const q = db.adapter.client.from('tempo_bank_txns').update({ category: cat, ...(biz ? { biz_entity: biz } : {}), updated_at: new Date().toISOString() });
  const qf = el.dataset.flow ? q.eq('flow', el.dataset.flow) : q;
  const { error } = cp === '—' ? await qf.is('counterpart', null) : await qf.eq('counterpart', cp);
  if (error) return toast('Erro: ' + error.message);
  bankMarkCats([cp], cat, false);
  await bankLoadTxns();
  if (!/^(Estorno|Reembolso Outros)→/.test(cat) && !BANK_CATS.includes(cat) && !db.setting('bankCats', []).includes(cat)) db.setSetting('bankCats', [...db.setting('bankCats', []), cat]);
  render();
};
CHANGES['bank-sel'] = (el) => {
  BANK.sel = { ...(BANK.sel || {}) };
  if (el.checked) BANK.sel[el.dataset.id] = true; else delete BANK.sel[el.dataset.id];
  render();
};
ACTIONS['bank-bulk-clear'] = () => { BANK.sel = {}; render(); };
ACTIONS['bank-cmp'] = () => { BANK.cmp = !BANK.cmp; render(); };
CHANGES['bank-rmonth'] = (el) => { BANK.month = el.value; render(); };
// Soma de um mês: entradas, saídas (sem terapias), sobra e saídas por categoria.
function monthSnap(entity, ym) {
  const withRe = BANK.reemb === true;
  const cats = {}; let ent = 0, sai = 0;
  // Mesma resolução do relatório: categoria pela contraparte e fluxo (como no donut), senão a própria categoria.
  const cm = {};
  (BANK.every || []).forEach(x => { if (x.category) cm[(x.counterpart || '—') + '|' + (x.flow || '')] = x.category; });
  (BANK.all[entity] || []).forEach(t => {
    if (t.scope === 'interna' || t.scope === 'cartao' || !t.posted_on || t.posted_on.slice(0, 7) !== ym) return;   // pagamento de fatura não é gasto: as compras do cartão já entram
    const v = Math.abs(Number(t.amount)), c = cm[(t.counterpart || '—') + '|' + (t.flow || '')] || t.category || 'Sem categoria';
    if (t.flow === 'out' && (t.reimb_row_id || c === 'Terapia')) return;   // terapias ficam fora da comparação
    if (!withRe && isReembCat(c)) return;
    if (t.flow === 'in') {
      if (abatesCat(c)) { const tg = c.split('→')[1]; cats[tg] = (cats[tg] || 0) - v; return; }   // estorno abate a categoria
      if (/^Estorno/.test(c)) return;
      ent += v; return;
    }
    sai += v; cats[c] = (cats[c] || 0) + v;
  });
  return { ent, sai, sobra: ent - sai, cats };
}
const CMP_COLS = ['#2563eb', '#f59e0b', '#22a06b', '#d64545', '#8b5cf6', '#0ea5e9'];
const cmpMonthsOf = () => { const cur = BANK.month || ymd(new Date()).slice(0, 7); return (BANK.cmpList && BANK.cmpList.length) ? BANK.cmpList : [cur, bankPrevYm(cur)]; };
CHANGES['bank-cmp-add'] = (el) => { const v = el.value; if (!v) return; const l = cmpMonthsOf(); if (!l.includes(v) && l.length < CMP_COLS.length) BANK.cmpList = [...l, v]; render(); };
ACTIONS['bank-cmp-rm'] = (el) => { const v = el.dataset.k; const l = cmpMonthsOf(); if (l.length > 1) BANK.cmpList = l.filter(m => m !== v); render(); };
// Comparador: quantos meses quiser (até 6), lado a lado, com números, barras e tabela.
function compareHTML(entity) {
  const GREEN = '#22a06b', RED = '#d64545';
  const months = [...new Set((BANK.all[entity] || []).filter(t => t.scope !== 'interna' && t.posted_on).map(t => t.posted_on.slice(0, 7)))].sort().reverse();
  const L = cmpMonthsOf();
  const col = (i) => CMP_COLS[i % CMP_COLS.length];
  const snaps = L.map(m => monthSnap(entity, m));
  const two = L.length === 2;
  const addOpts = `<option value="">+ mês</option>` + months.filter(m => !L.includes(m)).map(m => `<option value="${m}">${rbLabel(m)}</option>`).join('');
  const diff = (a, b, inverse) => {
    const d = a - b, pct = b ? Math.round(d / Math.abs(b) * 100) : null;
    const good = inverse ? d <= 0 : d >= 0;
    return `<span style="color:${d === 0 ? 'var(--fg-2)' : good ? GREEN : RED};font-weight:600">${d === 0 ? '—' : (d > 0 ? '▲ ' : '▼ ') + fmtMoney0(Math.abs(d))}${pct !== null && d !== 0 ? ` <span class="small">(${pct > 0 ? '+' : ''}${pct}%)</span>` : ''}</span>`;
  };
  const kpi = (label, key, inverse) => `<div class="kpi" style="flex:1;min-width:200px">
      <span class="k">${label}</span>
      <div style="display:flex;flex-wrap:wrap;gap:2px 14px">${L.map((m, i) => `<span class="v" style="color:${col(i)};${L.length > 2 ? 'font-size:1.05em' : ''}">${fmtMoney0(snaps[i][key])}</span>`).join('')}</div>
      ${two ? `<span class="s">${diff(snaps[0][key], snaps[1][key], inverse)}</span>` : ''}</div>`;
  const keys = [...new Set(snaps.flatMap(s => Object.keys(s.cats)))]
    .filter(k => snaps.some(s => Math.abs(s.cats[k] || 0) > 0))
    .sort((x, y) => Math.max(...snaps.map(s => Math.abs(s.cats[y] || 0))) - Math.max(...snaps.map(s => Math.abs(s.cats[x] || 0))));
  const mx = Math.max(1, ...keys.flatMap(k => snaps.map(s => Math.abs(s.cats[k] || 0))));
  const bar = (v, c) => `<div style="height:9px;border-radius:5px;background:${c};width:${Math.max(0, Math.abs(v) / mx * 100)}%;min-width:${v ? 2 : 0}px"></div>`;
  const rows = keys.map(k => `<div style="display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:12px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)">
      <span style="font-size:.92em">${esc(k)}</span>
      <div style="display:grid;gap:4px">${L.map((m, i) => { const v = snaps[i].cats[k] || 0; return `<div class="row" style="gap:8px;align-items:center">${bar(v, col(i))}<span class="mono small" style="white-space:nowrap;color:${col(i)}">${fmtMoney0(v)}</span></div>`; }).join('')}</div>
    </div>`).join('');
  const tableRows = keys.map(k => `<tr><td>${esc(k)}</td>${L.map((m, i) => `<td class="num" style="color:${col(i)}">${fmtMoney0(snaps[i].cats[k] || 0)}</td>`).join('')}${two ? `<td class="num">${diff(snaps[0].cats[k] || 0, snaps[1].cats[k] || 0, true)}</td>` : ''}</tr>`).join('');
  const chips = L.map((m, i) => `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 10px;border:1px solid var(--line,#d8dbe0);border-radius:999px;font-size:.9em"><span style="width:9px;height:9px;border-radius:50%;background:${col(i)}"></span>${rbLabel(m)}${L.length > 1 ? `<button data-act="bank-cmp-rm" data-k="${m}" title="Remover" style="border:0;background:none;cursor:pointer;color:var(--fg-3);font-size:1.15em;line-height:1;padding:0 4px">×</button>` : ''}</span>`).join('');
  return `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Comparar meses</h3><span class="faint small">${BANK.reemb === true ? 'com reembolsos' : 'sem reembolsos'}</span></div>
    <div class="panel-b">
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
        ${chips}
        ${L.length < CMP_COLS.length ? `<select data-on="bank-cmp-add" class="input" style="width:auto;padding:3px 8px;font-size:.9em">${addOpts}</select>` : ''}
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        ${kpi('Entradas', 'ent', false)}
        ${kpi('Saídas', 'sai', true)}
        ${kpi('Sobra', 'sobra', false)}
      </div>
      <div class="row small" style="gap:16px;margin-bottom:6px;flex-wrap:wrap"><b>Saídas por categoria</b>${L.map((m, i) => `<span style="color:${col(i)}">● ${rbLabel(m)}</span>`).join('')}</div>
      ${keys.length ? rows : '<div class="empty small">Nenhuma saída nesses meses.</div>'}
      <div style="margin-top:16px;overflow:auto"><table class="grid compact"><thead><tr><th>Categoria</th>${L.map((m, i) => `<th class="num" style="color:${col(i)}">${rbLabel(m)}</th>`).join('')}${two ? '<th class="num">Diferença</th>' : ''}</tr></thead><tbody>${tableRows}</tbody></table></div>
      <details style="margin-top:16px"><summary class="small" style="cursor:pointer"><b>Todos os meses</b></summary><div style="margin-top:10px">${trendHTML(entity)}</div></details>
    </div></div>`;
}
// Troca de mês pelos botões ‹ ›; o nome do mês volta ao mês atual ao clicar nele.
const bankShiftMonth = (d) => { const [y, m] = (BANK.month || ymd(new Date()).slice(0, 7)).split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); BANK.month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; render(); };
ACTIONS['bank-mprev'] = () => bankShiftMonth(-1);
ACTIONS['bank-mnext'] = () => bankShiftMonth(1);
ACTIONS['bank-mnow'] = () => { BANK.month = null; render(); };
CHANGES['bank-reemb'] = (el) => { BANK.reemb = el.checked; render(); };
// Comparar meses: categorias (saídas) e totais de entrada, saída e sobra, mês a mês. Mostra até 12 meses.
function trendHTML(entity) {
  const withRe = BANK.reemb === true;
  const txns = (BANK.all[entity] || []).filter(t => t.scope !== 'interna' && t.posted_on);
  const months = [...new Set(txns.map(t => t.posted_on.slice(0, 7)))].sort().slice(-12);
  const cats = {}; const ent = {}; const sai = {};
  const add = (bag, k, ym, v) => { bag[k] = bag[k] || {}; bag[k][ym] = (bag[k][ym] || 0) + v; };
  txns.forEach(t => {
    const ym = t.posted_on.slice(0, 7), v = Math.abs(Number(t.amount)), c = t.category || 'Sem categoria';
    if (t.flow === 'in') {
      if (/^Estorno/.test(c)) return;                       // estorno não é entrada
      if (!withRe && isReembCat(c)) return;
      add(ent, 'Entradas', ym, v);
    } else {
      if (!withRe && isReembCat(c)) return;
      if (abatesCat(c)) { add(cats, c.split('→')[1], ym, -v); add(sai, 'Saídas', ym, v); return; }
      add(cats, c, ym, v); add(sai, 'Saídas', ym, v);
    }
  });
  const sumRow = (row) => Object.values(row || {}).reduce((a, b) => a + b, 0);
  const cell = (row, ym) => { const v = (row || {})[ym] || 0; return v ? fmtMoney0(v) : '<span class="faint">—</span>'; };
  const catList = Object.keys(cats).sort((a, b) => sumRow(cats[b]) - sumRow(cats[a]));
  const line = (label, row, cls, bold) => `<tr><td ${bold ? 'style="font-weight:600"' : ''}>${label}</td>${months.map(m => `<td class="num ${cls || ''}">${cell(row, m)}</td>`).join('')}<td class="num" style="font-weight:600">${fmtMoney0(sumRow(row))}</td></tr>`;
  const sobra = {}; months.forEach(m => { sobra[m] = (ent.Entradas || {})[m] || 0; sobra[m] -= (sai.Saídas || {})[m] || 0; });
  const sobraCells = months.map(m => `<td class="num">${sobra[m] ? fmtMoney0(sobra[m]) : '<span class="faint">—</span>'}</td>`).join('');
  const sobraTotal = Object.values(sobra).reduce((a, b) => a + b, 0);
  return `<div class="panel"><div class="panel-h"><h3>Comparar meses · ${entity === 'pj' ? 'PJ' : 'PF e PJ'}</h3><span class="faint small">${withRe ? 'com reembolsos' : 'sem reembolsos'}</span></div>
    <div class="panel-b" style="overflow:auto"><table class="grid compact"><thead><tr><th>Categoria</th>${months.map(m => `<th class="num">${m.slice(5)}/${m.slice(2, 4)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${line('Entradas', ent.Entradas, 'bank-in')}
      ${line('Saídas', sai.Saídas, 'bank-out', true)}
      <tr><td style="font-weight:600">Sobra</td>${sobraCells}<td class="num" style="font-weight:600">${fmtMoney0(sobraTotal)}</td></tr>
      <tr><td colspan="${months.length + 2}" class="faint small" style="padding-top:12px">Saídas por categoria</td></tr>
      ${catList.map(c => line(esc(c), cats[c])).join('')}
    </tbody></table></div></div>`;
}
ACTIONS['bank-bulk-cat'] = async () => {
  const ids = Object.keys(BANK.sel || {});
  if (!ids.length) return;
  const flows = new Set(ids.map(id => ((BANK.every || []).find(x => x.id === id) || {}).flow));
  const pick = await bankCatDialog(`${ids.length} lançamento(s)`, true, flows.size === 1 ? [...flows][0] : null);
  if (!pick) return;
  if (pick.tagOnly) {
    const { error: et } = await db.adapter.client.from('tempo_bank_txns').update({ tag: pick.tag, updated_at: new Date().toISOString() }).in('id', ids);
    if (et) return toast('Erro: ' + et.message);
    BANK.sel = {}; await bankLoadTxns(); return render();
  }
  const { cat, biz } = pick;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ category: cat, ...(biz ? { biz_entity: biz } : {}), updated_at: new Date().toISOString() }).in('id', ids);
  if (error) return toast('Erro: ' + error.message);
  bankMarkCats(ids.map(id => ((BANK.every || []).find(x => x.id === id) || {}).counterpart || '—'), cat, false);
  await bankLoadTxns();
  if (!/^(Estorno|Reembolso Outros)→/.test(cat) && !BANK_CATS.includes(cat) && !db.setting('bankCats', []).includes(cat)) db.setSetting('bankCats', [...db.setting('bankCats', []), cat]);
  BANK.sel = {};
  toast(`${ids.length} lançamento(s) atualizados`);
  render();
};
ACTIONS['bank-close'] = (el) => {
  const entity = el.dataset.entity, ym = el.dataset.ym, key = entity + ':' + ym;
  const all = (BANK.all[entity] || []).filter(t => t.scope === 'externa' && (t.posted_on || '').slice(0, 7) === ym);
  const ent = all.filter(t => t.flow === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const sai = all.filter(t => t.flow === 'out').reduce((s, t) => s + Number(t.amount), 0);
  const closed = db.setting('closedMonths', {});
  db.setSetting('closedMonths', { ...closed, [key]: { entradas: ent, saidas: Math.abs(sai), sobra: ent + sai, closed_at: new Date().toISOString() } });
  toast('Mês fechado: ' + ym);
  render();
};
ACTIONS['bank-reopen'] = (el) => {
  const closed = { ...db.setting('closedMonths', {}) };
  delete closed[el.dataset.entity + ':' + el.dataset.ym];
  db.setSetting('closedMonths', closed); render();
};
// Sincroniza ao abrir a tela se a última leitura tiver mais de 2h.
// checkedAt evita loop: render() chama a tela de novo, e a checagem não roda de novo por 60s.
async function bankRefresh(force) {
  if (!db.adapter || !db.adapter.client || BANK.busy) return;
  if (!force && Date.now() - BANK.checkedAt < 60000) return;
  BANK.checkedAt = Date.now(); BANK.busy = true;
  try {
    BANK.status = await bankApi('status');
    if (BANK.status.connected) {
      const last = BANK.status.last_sync_at ? new Date(BANK.status.last_sync_at).getTime() : 0;
      if (force || Date.now() - last > 2 * 3600e3) {
        const r = await bankApi('sync', { method: 'POST' });
        const lidas = r.results.reduce((s, x) => s + (x.transacoes_lidas || 0), 0);
        BANK.msg = 'Última leitura: ' + lidas + ' movimentações';
        BANK.status = await bankApi('status');
      }
    }
    await bankLoadTxns();
  } catch (e) { BANK.msg = 'Erro: ' + e.message; }
  finally { BANK.busy = false; render(); }
}
function bankPanel(entity) {
  const st = BANK.status, connected = !!(st && st.connected);
  const label = entity === 'pf' ? 'PF' : 'PJ';
  const reviewedNow = BANK.mode[entity] === 'revisado';
  const head = `<div class="panel-h"><h3>Extratos ${label}${reviewedNow ? ' · revisadas' : ''}</h3><span class="grow"></span>${connected
    ? `<button class="btn sm" data-act="bank-sync">Atualizar</button>`
    : `<button class="btn sm primary" data-act="bank-connect">Conectar Gmail</button>`}</div>`;
  const sub = connected
    ? `<div class="panel-b small muted" style="padding:8px 16px">Conta: ${esc(st.account_email || '')} · última leitura: ${st.last_sync_at ? fmtDate(st.last_sync_at) : 'nunca'}${BANK.msg ? ' · ' + esc(BANK.msg) : ''}</div>`
    : `<div class="panel-b small muted" style="padding:8px 16px">Conecte o Gmail que recebe os extratos da Nubank. Nada entra no Financeiro sem você revisar.</div>`;
  const rows = BANK.txns[entity] || [];
  const body = rows.length
    ? `<table class="grid compact fin"><tbody>${rows.map(t => `<tr><td class="mono small">${fmtDateShort(t.posted_on)}</td><td>${esc(t.counterpart || t.memo)}</td><td class="num">${fmtMoney(t.amount)}</td><td>${t.scope === 'interna' ? '<span class="tag tg" style="background:var(--surface-2);color:var(--fg-3)">Interna</span>' : t.scope === 'cartao' ? '<span class="tag tg" style="background:var(--surface-2);color:var(--fg-3)">Cartão</span>' : '<span class="tag tg">Externa</span>'}</td><td>${bankRowExtra(t)}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty small">${reviewedNow ? 'Nenhuma movimentação revisada.' : 'Nenhuma movimentação nova.'}</div>`;
  const reviewed = BANK.mode[entity] === 'revisado';
  const foot = `<div class="panel-b" style="padding:8px 16px;display:flex;gap:8px;justify-content:flex-end"><button class="btn sm ghost" data-act="bank-mode" data-entity="${entity}">${reviewed ? 'Ver novas' : 'Ver revisadas'}</button>${rows.length && !reviewed ? `<button class="btn sm" data-act="bank-review-all" data-entity="${entity}">Marcar como revisadas</button>` : ''}</div>`;
  return `<div class="panel">${head}${sub}<div class="panel-b tight" style="max-height:320px;overflow:auto">${body}</div>${foot}</div>`;
}
// Vínculos sugeridos: custo fixo (nome parecido + valor dentro da tolerância) e reembolso SulAmérica (lote com o mesmo valor).
function bankFixedMatch(t) {
  if (t.expense_id || t.flow !== 'out' || !t.counterpart) return null;
  const amt = Math.abs(Number(t.amount)), cp = t.counterpart.toLowerCase();
  const linked = new Set((BANK.all[t.entity] || []).map(x => x.expense_id).filter(Boolean));
  const ym = (t.posted_on || '').slice(0, 7);
  const word = cp.split(/\s+/)[0];
  return db.all('tempo_expenses').find(e => {
    if (e.kind !== 'out' || e.month !== ym || linked.has(e.id) || !e.name || e.amount == null) return false;
    const nm = e.name.toLowerCase();
    const nameOk = word.length >= 4 && nm.includes(word);
    return nameOk && Math.abs(Number(e.amount) - amt) <= Math.max(5, Number(e.amount) * 0.03);
  }) || null;
}
function bankReimbMatch(t) {
  if (t.flow !== 'in' || !/sulam/i.test(t.counterpart || '') || t.reimb_linked) return null;
  const amt = Number(t.amount);
  const pend = db.all('tempo_reimb_rows').filter(r => !r.refunded_on && Number(r.amount) > 0 && db.get('tempo_status_options', r.req_id)?.name !== 'Não se aplica');
  const byMonth = {};
  pend.forEach(r => { byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.amount); });
  const m = Object.keys(byMonth).find(k => Math.abs(byMonth[k] - amt) <= 1);
  return m ? { month: m, total: byMonth[m] } : null;
}
// Transferência interna: procura o par (valor igual, sentido contrário, até 3 dias) entre contas e caixinhas.
function bankPairOf(t) {
  if (t.scope !== 'interna') return null;
  const amt = Math.abs(Number(t.amount)), d0 = new Date(t.posted_on).getTime();
  const c = (BANK.every || []).filter(x => x.id !== t.id && x.scope === 'interna' && x.flow !== t.flow
    && Math.abs(Math.abs(Number(x.amount)) - amt) < 0.01 && Math.abs(new Date(x.posted_on).getTime() - d0) <= 3 * 86400000);
  return c[0] || null;
}
const bankSrc = (x) => (/RDB|Resgate|Aplica[cç][aã]o|Caixinha|Rendimento/i.test(x.memo || '') ? 'CAIXINHA' : (x.biz_entity || x.entity || '').toUpperCase());
const bankOther = (src) => (src === 'PJ' ? 'PF' : src === 'PF' ? 'PJ' : 'PF');
function bankRowExtra(t) {
  if (t.scope === 'interna') {
    const pr = bankPairOf(t);
    let from, to;
    if (pr) { from = bankSrc(t.flow === 'out' ? t : pr); to = bankSrc(t.flow === 'out' ? pr : t); }
    else { const me = bankSrc(t); from = t.flow === 'out' ? me : bankOther(me); to = t.flow === 'out' ? bankOther(me) : me; }
    const lbl = `[Interno] [${from}>${to}]${pr ? '' : ' [a confirmar]'}`;
    return `<span class="tag tg" style="${cssTb('#2563eb')}">${esc(lbl)}</span>`;
  }
  const lk = t.flow === 'in' ? bankLinksOf(t.id) : [];
  if (lk.length) {
    const rs = lk.map(id => db.get('tempo_reimb_rows', id)).filter(Boolean);
    const tot = rs.reduce((a, r) => a + Number(r.amount), 0);
    return `<span class="small muted">→ ${rs.map(r => esc(r.name)).join(', ')} (${fmtMoney0(tot)})</span> <button class="btn sm ghost" data-act="bank-unlink" data-id="${t.id}">Desvincular</button>`;
  }
  const unl = `<button class="btn sm ghost" data-act="bank-unlink-any" data-id="${t.id}">Desvincular</button>`;
  if (t.payment_id) { const p = db.get('tempo_payments', t.payment_id); const pr = p ? db.get('tempo_projects', p.project_id) : null; return `<span class="small muted">→ ${esc(pr?.name || 'Projeto')} (${fmtMoney0(p?.amount)})</span> ${unl}`; }
  if (t.category === 'Fee' && bankIsPJ(t)) return `<span class="small muted">→ Fee</span> ${unl}`;
  if (t.reimb_row_id) { const r = db.get('tempo_reimb_rows', t.reimb_row_id); return r ? `<span class="small muted">→ Terapia: ${esc(r.name)}</span> ${unl}` : ''; }
  if (t.expense_id) { const e = db.get('tempo_expenses', t.expense_id); return e ? `<span class="small muted">→ ${esc(e.name)}</span> ${unl}` : ''; }
  if (t.flow !== 'out' && isReembOut(t.category)) return `<button class="btn sm ghost" data-act="bank-rexp" data-id="${t.id}">Vincular a gasto…</button>`;
  if (t.flow !== 'out' && isReembCat(t.category)) {
    // reembolso de terapia: linha da tabela de terapias (ou um custo, como plano de saúde)
    const rr = bankTherapyMatch(t);
    const tb = rr ? `<button class="btn sm" data-act="bank-tlink" data-id="${t.id}" data-kind="reimb" data-target="${rr.id}">Vincular a terapia ${esc(rr.name)}</button>` : `<button class="btn sm ghost" data-act="bank-rlink" data-id="${t.id}">Vincular a terapia…</button>`;
    return `${tb} <button class="btn sm ghost" data-act="bank-rexp" data-id="${t.id}">Vincular a gasto…</button>`;
  }
  if (t.flow === 'in' && bankIsPJ(t)) return `<button class="btn sm ghost" data-act="bank-tpick" data-id="${t.id}">Vincular a projeto…</button>`;
  if (t.flow !== 'out') { const r = bankReimbMatch(t); return r ? `<button class="btn sm" data-act="bank-reimb" data-id="${t.id}" data-month="${r.month}">Lote ${r.month} (${fmtMoney0(r.total)})</button>` : `<button class="btn sm ghost" data-act="bank-rexp" data-id="${t.id}">${isReembCat(t.category) ? 'Vincular a gasto…' : 'Vincular a entrada…'}</button>`; }
  const e = bankFixedMatch(t);
  if (e) return `<button class="btn sm" data-act="bank-link" data-id="${t.id}" data-eid="${e.id}">Vincular a ${esc(e.name)}</button>`;
  const rr = bankTherapyMatch(t);
  if (rr) return `<button class="btn sm" data-act="bank-tlink" data-id="${t.id}" data-kind="reimb" data-target="${rr.id}">Vincular a terapia ${esc(rr.name)}</button>`;
  return `<button class="btn sm ghost" data-act="bank-tpick" data-id="${t.id}">Vincular…</button>`;
}
// Pagamento de terapia (PF) que bate com uma linha de reembolso do mesmo mês pelo valor.
// Mês anterior: reembolso recebido costuma chegar depois da terapia.
const bankPrevYm = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
// Entrada de reembolso: mês do pagamento e os 3 meses anteriores (terapias podem ser de meses bem anteriores).
const bankReimbMonths = (t) => {
  const ym = (t.posted_on || '').slice(0, 7);
  if (t.flow !== 'in') return [ym];
  const out = [ym]; for (let i = 0; i < 3; i++) out.push(bankPrevYm(out[out.length - 1]));
  return out;
};
function bankTherapyMatch(t) {
  const amt = Math.abs(Number(t.amount)), months = bankReimbMonths(t);
  const taken = bankTakenRows();
  const c = db.all('tempo_reimb_rows').filter(r => months.includes(r.month) && !taken.has(r.id) && Number(r.amount) > 0 && Math.abs(Number(r.amount) - amt) <= 1);
  return c.length === 1 ? c[0] : null;
}
// Escolha manual: lista as linhas de terapia e os custos do mês.
function bankPickDialog(t) {
  const ym = (t.posted_on || '').slice(0, 7);
  const rows = db.all('tempo_reimb_rows').filter(r => r.month === ym && Number(r.amount) > 0).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const exps = db.all('tempo_expenses').filter(e => e.month === ym && e.kind === 'out' && e.amount != null);
  const btn = (kind, id, label, val) => `<button class="btn sm" style="justify-content:space-between;width:100%" data-kind="${kind}" data-id="${id}">${esc(label)} <span class="mono small">${fmtMoney(val)}</span></button>`;
  const fixedBlock = `<div class="field"><span class="lbl">Custos fixos do mês</span><div class="stack" style="gap:6px">${exps.length ? exps.map(e => btn('expense', e.id, e.name, e.amount)).join('') : '<span class="small muted">Nenhum custo fixo neste mês.</span>'}</div></div>`;
  // Terapias vêm só da conta PF: entrada da PJ nunca é terapia.
  const isPJin = t.flow === 'in' && bankIsPJ(t);
  const therContent = isPJin ? '<span class="small muted">Terapias só recebem entradas da conta PF.</span>'
    : (rows.length ? rows.map(r => btn('reimb', r.id, r.name, r.amount)).join('') : '<span class="small muted">Nenhuma linha de terapia neste mês.</span>');
  const therBlock = `<div class="field"><span class="lbl">Terapias do mês ${ym}</span><div class="stack" style="gap:6px">${therContent}</div></div>`;
  // Saída: custo fixo primeiro. Entrada: terapias primeiro.
  // Entrada da PJ: projeto (cria o pagamento) ou Fee, sem projeto fixo.
  // Projetos sem pagamento vinculado a nenhuma entrada. Recente = criado nos últimos 6 meses (em relação à entrada); Antigo = mais antigo.
  const linkedPay = new Set((BANK.every || []).map(b => b.payment_id).filter(Boolean));
  const allPays = db.all('tempo_payments');
  const hasLink = (p) => allPays.some(x => x.project_id === p.id && linkedPay.has(x.id));
  const cut = (() => { const d = new Date((t.posted_on || '') + 'T12:00:00'); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })();
  const dateOf = (p) => String(p.started_at || p.created_at || '').slice(0, 10);
  const pend = db.all('tempo_projects').filter(p => !p.archived && !hasLink(p)).sort((a, b) => ((clientOf(a)?.name || '') + a.name).localeCompare((clientOf(b)?.name || '') + b.name));
  const rowP = (p) => { const c = clientOf(p); return btn('project', p.id, (c ? c.name + ' · ' : '') + p.name, p.budget).replace('class="btn sm"', 'class="btn sm bpk-p"'); };
  const recList = pend.filter(p => dateOf(p) >= cut).map(rowP).join('') || '<span class="small muted">Nenhum projeto recente sem vínculo.</span>';
  const oldList = pend.filter(p => dateOf(p) < cut).map(rowP).join('') || '<span class="small muted">Nenhum projeto antigo sem vínculo.</span>';
  const projBlock = (t.flow === 'in' && bankIsPJ(t)) ? `<div class="field"><span class="lbl">Projeto (pagamento recebido)</span>
    <div class="row" style="gap:6px;margin-bottom:6px"><button class="btn sm" data-tab="rec">Recente (6 meses)</button><button class="btn sm ghost" data-tab="old">Antigo</button><button class="btn sm ghost" data-tab="ther">Terapias</button></div>
    <input id="bpk-q" class="input" placeholder="Buscar cliente ou projeto" autocomplete="off" style="margin-bottom:6px">
    <div class="stack" style="gap:6px">${btn('fee', 'fee', 'Fee (sem projeto fixo)', Math.abs(Number(t.amount)))}
      <div id="bpk-rec" class="stack" style="gap:6px">${recList}</div>
      <div id="bpk-old" class="stack" style="gap:6px;display:none">${oldList}</div>
      <div id="bpk-ther" class="stack" style="gap:6px;display:none">${therBlock}</div></div></div>` : '';
  const html = `<div class="dh"><h2>Vincular lançamento</h2></div><div class="db">
    <p style="margin:0">${esc(t.counterpart || t.memo)} · ${fmtMoney(Math.abs(Number(t.amount)))} · ${fmtDate(t.posted_on)}</p>
    ${projBlock}
    ${t.flow === 'out' ? (/sul\s*americ/i.test(t.counterpart || '') ? fixedBlock : fixedBlock + therBlock) : (isPJin ? fixedBlock : therBlock + fixedBlock)}
    </div><div class="df"><button class="btn" data-x="no">Cancelar</button></div>`;
  return new Promise(res => {
    let done = false;
    const l = openLayer({ html, onClose: () => { if (!done) res(null); } });
    l.box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind]'); if (b) { done = true; res({ kind: b.dataset.kind, id: b.dataset.id }); l.close(); return; }
      if (e.target.closest('[data-x]')) { done = true; res(null); l.close(); }
    });
    l.box.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]'); if (!tab) return;
      const key = tab.dataset.tab;
      ['rec', 'old', 'ther'].forEach(k => { const el = l.box.querySelector('#bpk-' + k); if (el) el.style.display = k === key ? '' : 'none'; });
      l.box.querySelectorAll('[data-tab]').forEach(b => b.className = 'btn sm' + (b.dataset.tab === key ? '' : ' ghost'));
    });
    l.box.addEventListener('input', (e) => {
      if (e.target.id !== 'bpk-q') return;
      const q = bnorm(e.target.value);
      l.box.querySelectorAll('.bpk-p').forEach(el => { el.style.display = bnorm(el.textContent).includes(q) ? '' : 'none'; });
    });
  });
}
ACTIONS['bank-tpick'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const pick = await bankPickDialog(t); if (!pick) return;
  await linkBankTxn(t, pick.kind, pick.id);
};
// Reembolso recebido ligado a um custo do mesmo mês. Não altera o valor nem o status do custo.
function bankExpPick(t) {
  const ym = (t.posted_on || '').slice(0, 7);
  // entrada que não é reembolso se vincula a um recebimento; reembolso e saídas, a um custo
  const want = (t.flow === 'in' && !isReembCat(t.category)) ? 'in' : 'out';
  const exps = db.all('tempo_expenses').filter(e => e.month === ym && e.kind === want).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const html = `<div class="dh"><h2>${want === 'in' ? 'Entrada de qual recebimento?' : 'Reembolso de qual gasto?'}</h2></div><div class="db">
    <p style="margin:0">${esc(t.counterpart || t.memo)} · ${fmtMoney(Math.abs(Number(t.amount)))} · ${fmtDate(t.posted_on)}</p>
    <div class="field"><span class="lbl">${want === 'in' ? 'Recebimentos' : 'Custos'} de ${ym}</span><div class="stack" style="gap:6px">${exps.length ? exps.map(e => `<button class="btn sm" style="justify-content:space-between;width:100%" data-id="${e.id}">${esc(e.name)} <span class="mono small">${fmtMoney(e.amount)}</span></button>`).join('') : '<span class="small muted">Nenhum custo neste mês.</span>'}</div></div>
    </div><div class="df"><button class="btn" data-x="no">Cancelar</button></div>`;
  return new Promise(res => {
    let done = false;
    const l = openLayer({ html, onClose: () => { if (!done) res(null); } });
    l.box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]'); if (b) { done = true; res(b.dataset.id); l.close(); return; }
      if (e.target.closest('[data-x]')) { done = true; res(null); l.close(); }
    });
  });
}
ACTIONS['bank-rexp'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const id = await bankExpPick(t); if (!id) return;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ expense_id: id, updated_at: new Date().toISOString() }).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  await bankLoadTxns(); toast('Reembolso vinculado'); render();
};
// Escolhe a linha de terapia do mês para um reembolso recebido.
function bankReimbPick(t) {
  const months = bankReimbMonths(t);
  const taken = bankTakenRows();
  const rows = db.all('tempo_reimb_rows').filter(r => months.includes(r.month) && !taken.has(r.id) && Number(r.amount) > 0).sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.name).localeCompare(String(b.name)));
  const target = Math.abs(Number(t.amount));
  const sumText = (sum) => { const diff = Math.round((sum - target) * 100); return `Marcado: ${fmtMoney(sum)} de ${fmtMoney(target)}` + (diff === 0 ? ' · bate' : ` · diferença ${fmtMoney(Math.abs(diff) / 100)}`); };
  // Sugestão: mesma busca de soma exata do auto-vínculo, com as candidatas na mesma ordem (mês atual primeiro, maior valor).
  const cands = rows.slice().sort((a, b) => (b.month === months[0] ? 1 : 0) - (a.month === months[0] ? 1 : 0) || Number(b.amount) - Number(a.amount)).slice(0, 30);
  const sugg = bankSubsetFor(cands, Math.round(target * 100)) || [];
  const suggSet = new Set(sugg);
  const suggSum = cands.filter(r => suggSet.has(r.id)).reduce((a, r) => a + Number(r.amount), 0);
  const html = `<div class="dh"><h2>Reembolso de quais terapias?</h2></div><div class="db">
    <p style="margin:0">${esc(t.counterpart || t.memo)} · ${fmtMoney(target)} · ${fmtDate(t.posted_on)}</p>
    <div class="field"><span class="lbl">Terapias de ${months.join(', ')} · marque todas que estão neste pagamento</span><div class="stack" style="gap:6px">${rows.length ? rows.map(r => `<label class="row" style="justify-content:space-between;gap:8px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;cursor:pointer"><span><input type="checkbox" value="${r.id}" data-amt="${Number(r.amount)}" style="margin-right:8px"${suggSet.has(r.id) ? ' checked' : ''}>${esc(r.name)} <span class="small muted">${esc(r.month)}</span></span><span class="mono small">${fmtMoney(r.amount)}</span></label>`).join('') : '<span class="small muted">Nenhuma terapia sem vínculo neste mês.</span>'}</div></div>
    ${sugg.length ? '<p class="small muted" style="margin:0">Sugestão: marquei as terapias que fecham o valor exato. Confira e clique em Vincular.</p>' : '<p class="small muted" style="margin:0">Nenhuma combinação fecha o valor exato. Marque manualmente.</p>'}
    <p class="small" data-sum style="margin:0">${sumText(suggSum)}</p>
    <div class="df"><button class="btn" data-x="no">Cancelar</button><button class="btn primary" data-x="ok">Vincular</button></div></div>`;
  return new Promise(res => {
    let done = false;
    const l = openLayer({ html, onClose: () => { if (!done) res(null); } });
    const sumEl = l.box.querySelector('[data-sum]');
    const picked = () => [...l.box.querySelectorAll('input[type=checkbox]:checked')];
    l.box.addEventListener('change', () => {
      const sum = picked().reduce((a, c) => a + Number(c.dataset.amt), 0);
      sumEl.textContent = sumText(sum);
    });
    l.box.addEventListener('click', (e) => {
      if (e.target.closest('[data-x="ok"]')) {
        const ids = picked().map(c => c.value);
        if (!ids.length) return toast('Marque pelo menos uma terapia.');
        done = true; res(ids); l.close(); return;
      }
      if (e.target.closest('[data-x="no"]')) { done = true; res(null); l.close(); }
    });
  });
}
ACTIONS['bank-rlink'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const id = await bankReimbPick(t); if (!id) return;
  await linkBankTxn(t, 'reimb', id);
};
ACTIONS['bank-unlink'] = async (el) => {
  const id = el.dataset.id;
  const { error } = await db.adapter.client.from('tempo_bank_reimb_links').delete().eq('txn_id', id);
  if (error) return toast('Erro: ' + error.message);
  db.setSetting(bankSkipKey, { ...db.setting(bankSkipKey, {}), [id]: true });
  await bankLoadTxns(); toast('Desvinculado'); render();
};
// Desfaz qualquer vínculo de um lançamento: projeto (pagamento criado pelo extrato é apagado), Fee, terapia, gasto e vínculos de vários pagamentos.
ACTIONS['bank-unlink-any'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const cl = db.adapter.client;
  const patch = { updated_at: new Date().toISOString(), payment_id: null, expense_id: null, reimb_row_id: null };
  if (t.category === 'Fee' || (t.reimb_row_id && t.category === 'Terapia')) patch.category = null;
  const { error } = await cl.from('tempo_bank_txns').update(patch).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  await cl.from('tempo_bank_payment_links').delete().eq('txn_id', t.id);
  if (t.payment_id) {
    const p = db.get('tempo_payments', t.payment_id);
    const others = (BANK.every || []).some(b => b.id !== t.id && b.payment_id === t.payment_id);
    if (p && p.note === 'Extrato' && !others) { await cl.from('tempo_payments').delete().eq('id', p.id); db.data.tempo_payments = db.data.tempo_payments.filter(x => x.id !== p.id); }
  }
  await bankLoadTxns(); toast('Desvinculado'); render();
};
ACTIONS['bank-tlink'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  await linkBankTxn(t, el.dataset.kind, el.dataset.target);
};
async function linkBankTxn(t, kind, id) {
  if (kind === 'fee' || kind === 'project') {
    const cl = db.adapter.client; const patch = { updated_at: new Date().toISOString() };
    if (kind === 'fee') patch.category = 'Fee';
    else {
      const amt = Math.abs(Number(t.amount)); const taken = (BANK.every || []).map(b => b.payment_id).filter(Boolean);
      let p = db.all('tempo_payments').find(x => x.project_id === id && !taken.includes(x.id) && x.date == null && x.amount != null && Math.abs(Number(x.amount) - amt) <= Math.max(5, Number(x.amount) * 0.06));
      if (p) db.update('tempo_payments', p.id, { amount: amt, date: t.posted_on });
      else p = db.insert('tempo_payments', { project_id: id, amount: amt, date: t.posted_on, note: 'Extrato' });
      patch.payment_id = p.id;
    }
    const { error } = await cl.from('tempo_bank_txns').update(patch).eq('id', t.id);
    if (error) return toast('Erro: ' + error.message);
    await bankLoadTxns(); toast('Vinculado'); render(); return;
  }
  if (kind === 'reimb' && t.flow !== 'out') {
    const ids = Array.isArray(id) ? id : [id];
    const { error } = await db.adapter.client.from('tempo_bank_reimb_links').insert(ids.map(r => ({ reimb_row_id: r, txn_id: t.id })));
    if (error) return toast('Erro: ' + error.message);
    const skip = { ...db.setting(bankSkipKey, {}) }; delete skip[t.id]; db.setSetting(bankSkipKey, skip);
    await bankLoadTxns(); toast('Vinculado'); render(); return;
  }
  const patch = { updated_at: new Date().toISOString() };
  if (kind === 'reimb') { patch.reimb_row_id = id; patch.category = 'Terapia'; }
  else { patch.expense_id = id; db.update('tempo_expenses', id, { amount: Math.abs(Number(t.amount)), status: 'Pago', paid_on: t.posted_on }); }
  const { error } = await db.adapter.client.from('tempo_bank_txns').update(patch).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  await bankLoadTxns(); toast('Vinculado'); render();
}
ACTIONS['bank-link'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id);
  const e = db.get('tempo_expenses', el.dataset.eid); if (!t || !e) return;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ expense_id: e.id, updated_at: new Date().toISOString() }).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  // o documento (extrato) vence: valor e data pagos vêm do banco
  db.update('tempo_expenses', e.id, { amount: Math.abs(Number(t.amount)), status: 'Pago', paid_on: t.posted_on });
  t.expense_id = e.id; toast('Vinculado a ' + e.name); render();
};
ACTIONS['bank-reimb'] = async (el) => {
  const t = (BANK.all.pj || []).concat(BANK.all.pf || []).find(x => x.id === el.dataset.id); if (!t) return;
  const m = el.dataset.month;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ category: REEMB_TER, updated_at: new Date().toISOString() }).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  db.all('tempo_reimb_rows').filter(r => r.month === m && !r.refunded_on && Number(r.amount) > 0)
    .forEach(r => db.update('tempo_reimb_rows', r.id, { refunded_on: t.posted_on }, true));
  db.emit(); t.reimb_linked = true; await bankLoadTxns(); toast('Lote ' + m + ' marcado como reembolsado em ' + fmtDate(t.posted_on)); render();
};
ACTIONS['bank-biz'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const cur = t.biz_entity || t.entity;
  const next = cur === 'pf' ? 'pj' : 'pf';
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ biz_entity: next === t.entity ? null : next, updated_at: new Date().toISOString() }).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  await bankLoadTxns(); render();
};
// Conectar Gmail abre o login do Google numa janela pequena; o app continua aberto.
window.addEventListener('message', (e) => { if (e.data === 'gmail-ok') { toast('Gmail conectado'); render(); } });
ACTIONS['bank-connect'] = async () => {
  const w = window.open('about:blank', 'tempo-gmail', 'width=480,height=680');
  try {
    const r = await bankApi('start');
    if (w && !w.closed) w.location.href = r.url; else location.href = r.url;
  } catch (e) { if (w) w.close(); toast('Não consegui conectar: ' + e.message); }
};
ACTIONS['bank-sync'] = () => bankRefresh(true);
ACTIONS['bank-mode'] = async (el) => {
  const entity = el.dataset.entity;
  BANK.mode[entity] = BANK.mode[entity] === 'novo' ? 'revisado' : 'novo';
  await bankLoadTxns(); render();
};
ACTIONS['bank-review-all'] = async (el) => {
  const entity = el.dataset.entity;
  const ids = (BANK.txns[entity] || []).map(t => t.id);
  if (!ids.length) return;
  const { error } = await db.adapter.client.from('tempo_bank_txns')
    .update({ review_status: 'revisado', updated_at: new Date().toISOString() }).in('id', ids);
  if (error) return toast('Erro: ' + error.message);
  BANK.txns[entity] = []; render();
};
// Abas do Financeiro PF: Visão geral, Conta, Cartão e Investimentos (caixinhas).
const PF_TABS = [['geral', 'Visão geral'], ['conta', 'Conta corrente'], ['cartao', 'Cartão'], ['invest', 'Investimentos']];
// Caixinhas: saldo informado por você (print do app), guardado por data.
const CX_KEY = 'caixinhaSnaps';
const cxSnaps = () => (db.setting(CX_KEY, []) || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
function cxSave(list) { db.setSetting(CX_KEY, list); db.emit(); }
const cxFmt = (v) => fmtMoney(v);
function pfInvestHTML() {
  const snaps = cxSnaps();
  const last = snaps[0];
  const today = ymd(new Date());
  const names = last ? last.boxes.map(b => b.name) : ['Turbo Ultravioleta', 'APARTAMENTO', 'FREELAS', 'GIRO'];
  const form = `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Atualizar caixinhas</h3><span class="small muted">use o saldo que aparece no app do Nubank</span></div><div class="panel-b">
    <form data-form="cx-snap" class="stack" style="gap:8px">
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><span class="small muted">Data do saldo</span><input type="date" name="date" class="input" value="${today}" style="width:170px"></div>
      ${names.map((n, i) => `<div class="row" style="gap:8px;align-items:center"><input class="input" name="n${i}" value="${esc(n)}" style="width:240px"><input class="input" name="v${i}" type="number" step="0.01" min="0" placeholder="0,00" style="width:170px;text-align:right"></div>`).join('')}
      <div class="row" style="gap:8px"><button type="button" class="btn sm ghost" data-act="cx-add-row">+ caixinha</button><button class="btn primary sm">Salvar atualização</button></div>
    </form></div></div>`;
  const current = last ? `<div class="kpis">
    <div class="kpi"><span class="k">Total em caixinhas</span><span class="v">${fmtMoney0(last.total)}</span><span class="s">saldo de ${esc(last.date)}</span></div>
    ${last.boxes.map(b => `<div class="kpi"><span class="k">${esc(b.name)}</span><span class="v">${fmtMoney0(b.value)}</span><span class="s">${last.total ? Math.round(b.value / last.total * 100) : 0}% do total</span></div>`).join('')}
  </div>` : '<div class="empty small" style="margin-bottom:14px">Nenhuma atualização ainda. Preencha o formulário abaixo.</div>';
  const hist = snaps.length ? `<div class="panel"><div class="panel-h"><h3>Últimas atualizações</h3><span class="small muted">mais recente primeiro</span></div><div class="panel-b tight"><table class="grid compact fin"><thead><tr><th>Data</th><th>Caixinha</th><th style="text-align:right">Saldo</th><th style="text-align:right">Total</th><th></th></tr></thead><tbody>${snaps.map(sn => sn.boxes.map((b, i) => `<tr><td class="mono small">${i === 0 ? esc(sn.date) : ''}</td><td>${esc(b.name)}</td><td class="num">${cxFmt(b.value)}</td><td class="num">${i === 0 ? cxFmt(sn.total) : ''}</td><td>${i === 0 ? `<button class="btn sm ghost" data-act="cx-del" data-date="${esc(sn.date)}">Apagar</button>` : ''}</td></tr>`).join('')).join('')}</tbody></table></div></div>` : '';
  return current + form + hist;
}
ACTIONS['cx-add-row'] = (el) => {
  const form = el.closest('form'); const i = form.querySelectorAll('input[name^="n"]').length;
  const wrap = document.createElement('div'); wrap.className = 'row'; wrap.style.cssText = 'gap:8px;align-items:center';
  wrap.innerHTML = `<input class="input" name="n${i}" placeholder="Nome da caixinha" style="width:240px"><input class="input" name="v${i}" type="number" step="0.01" min="0" placeholder="0,00" style="width:170px;text-align:right">`;
  el.closest('.row').before(wrap);
};
ACTIONS['cx-del'] = async (el) => {
  const ok = await confirmBox({ title: 'Apagar esta atualização?', body: 'Os saldos de ' + el.dataset.date + ' serão removidos.', ok: 'Apagar', danger: true });
  if (!ok) return;
  cxSave(cxSnaps().filter(x => x.date !== el.dataset.date)); render();
};
document.addEventListener('submit', (e) => {
  const form = e.target.closest && e.target.closest('[data-form="cx-snap"]'); if (!form) return;
  e.preventDefault();
  saveCxSnap(form);
});
function saveCxSnap(form) {
  const fd = new FormData(form);
  const boxes = [];
  for (let i = 0; i < 50; i++) {
    if (!fd.has('n' + i)) break;
    const name = String(fd.get('n' + i) || '').trim(), raw = fd.get('v' + i);
    if (name && raw !== null && String(raw).trim() !== '') boxes.push({ name, value: Number(raw) || 0 });
  }
  const date = String(fd.get('date') || ymd(new Date()));
  if (!boxes.length) return toast('Informe pelo menos uma caixinha com saldo');
  const total = boxes.reduce((t, b) => t + b.value, 0);
  cxSave([...cxSnaps().filter(x => x.date !== date), { date, boxes, total }]);
  toast('Atualização salva'); render();
};
VIEWS.financepf = () => {
  bankRefresh();
  const tab = BANK.pfTab || 'geral';
  const body = tab === 'invest' ? pfInvestHTML() : `${bankSummaryHTML('pf')}${bankPanel('pf')}`;
  const tabs = `<div class="seg" style="margin-bottom:12px">${PF_TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="pf-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  return { title: 'Financeiro PF', actions: '', html: tabs + body };
};
ACTIONS['pf-tab'] = (el) => { const v = el.dataset.v; BANK.pfTab = v; BANK.origin = v === 'conta' ? 'conta' : v === 'cartao' ? 'cartao' : 'all'; render(); };
