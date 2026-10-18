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
    <div class="kpi"><span class="k">Horas registradas</span><span class="v">${fmtH(tot)}</span><span class="s">${d.entries.length} sessões · média ${fmtH(workdays ? tot / workdays : 0)}/${byMonth ? 'mês' : 'dia útil'}</span></div>
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
async function bankLoadTxns() {
  for (const entity of ['pf', 'pj']) {
    const { data, error } = await db.adapter.client.from('tempo_bank_txns').select('*')
      .eq('entity', entity).eq('review_status', BANK.mode[entity]).order('posted_on', { ascending: false }).limit(300);
    if (error) throw error;
    BANK.txns[entity] = data || [];
    const { data: every } = await db.adapter.client.from('tempo_bank_txns').select('*')
      .eq('entity', entity).order('posted_on', { ascending: false }).limit(2000);
    BANK.all[entity] = every || [];
  }
}
// Resumo geral: entradas, saídas e sobra (sem movimentos internos) e onde o dinheiro saiu.
function bankSummaryHTML(entity) {
  const ym = BANK.month || ymd(new Date()).slice(0, 7);
  const key = entity + ':' + ym;
  const closed = db.setting('closedMonths', {})[key];
  const all = (BANK.all[entity] || []).filter(t => t.scope === 'externa' && (t.posted_on || '').slice(0, 7) === ym);
  const ent = all.filter(t => t.flow === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const sai = all.filter(t => t.flow === 'out').reduce((s, t) => s + Number(t.amount), 0);
  const origin = entity === 'pf' ? (BANK.origin || 'all') : 'all';
  const originOf = (t) => (/d660$/.test(t.account_tail || '') ? 'cartao' : 'conta');
  const byCp = {};
  all.filter(t => t.flow === 'out' && (origin === 'all' || originOf(t) === origin)).forEach(t => {
    const k = t.counterpart || '—';
    const g = (byCp[k] ||= { v: 0, cat: null, expense: null });
    g.v += Math.abs(Number(t.amount));
    g.cat = g.cat || t.category || null;
    g.expense = g.expense || t.expense_id || null;
  });
  const cartao = Math.abs((BANK.all[entity] || []).filter(t => t.scope === 'cartao' && (t.posted_on || '').slice(0, 7) === ym).reduce((s, t) => s + Number(t.amount), 0));
  const top = Object.entries(byCp).sort((a, b) => b[1].v - a[1].v);
  const max = Math.max(1, ...top.map(x => x[1].v));
  const bar = `<div class="row" style="gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><input type="month" value="${ym}" data-on="bank-month" style="font:inherit;padding:4px 6px;border:1px solid var(--line);border-radius:8px;background:var(--surface)">
    ${closed ? `<span class="tag tg" style="background:var(--surface-2)">Mês fechado em ${fmtDate(closed.closed_at)}</span><button class="btn sm ghost" data-act="bank-reopen" data-entity="${entity}" data-ym="${ym}">Reabrir</button>` : `<button class="btn sm" data-act="bank-close" data-entity="${entity}" data-ym="${ym}">Fechar mês</button>`}</div>`;
  return `${bar}<div class="kpis">
    <div class="kpi"><span class="k">Entradas</span><span class="v">${fmtMoney0(ent)}</span><span class="s">externas</span></div>
    <div class="kpi"><span class="k">Saídas</span><span class="v">${fmtMoney0(Math.abs(sai))}</span><span class="s">externas</span></div>
    <div class="kpi"><span class="k">Sobra</span><span class="v">${fmtMoney0(ent + sai)}</span><span class="s">entradas − saídas</span></div>
    ${cartao ? `<div class="kpi"><span class="k">Fatura do cartão</span><span class="v">${fmtMoney0(cartao)}</span><span class="s">paga · conta uma vez, pelos itens</span></div>` : ''}
  </div>
  <div class="panel"><div class="panel-h"><h3>Para onde foi o dinheiro</h3></div><div class="panel-b">${entity === 'pf' ? `<div class="seg" style="margin-bottom:10px">${[['all', 'Tudo'], ['conta', 'Conta'], ['cartao', 'Cartão']].map(([k, l]) => `<button class="${origin === k ? 'on' : ''}" data-act="bank-origin" data-v="${k}">${l}</button>`).join('')}</div>` : ''}${top.length ? `<div class="bank-rows" style="max-height:520px;overflow:auto">${top.map(([k, g]) => {
      const ex = g.expense ? db.get('tempo_expenses', g.expense) : null;
      return `<div class="bank-row"><span class="bn" title="${esc(k)}">${esc(k)}</span><span class="mono small">${fmtMoney0(g.v)}</span>
        <span>${g.cat ? `<button class="bank-cat-btn" data-act="bank-cat" data-entity="${entity}" data-cp="${esc(k)}">${tag(g.cat, 'gray')}</button>` : `<button class="btn sm ghost" data-act="bank-cat" data-entity="${entity}" data-cp="${esc(k)}">Definir categoria</button>`}</span>
        <span class="small muted bm">${ex ? '→ ' + esc(ex.name) : ''}</span>
        <span class="bar-track"><span class="bar-fill fill" style="display:block;width:${g.v / max * 100}%"></span></span></div>`; }).join('')}</div>` : '<div class="empty small">Sem saídas neste mês.</div>'}</div></div>`;
}
CHANGES['bank-month'] = (el) => { BANK.month = el.value; render(); };
ACTIONS['bank-origin'] = (el) => { BANK.origin = el.dataset.v; render(); };
// Categorias de gasto: as padrão mais as que o Tulio criar.
const BANK_CATS = ['Alimentação', 'Casa', 'Transporte', 'Saúde', 'Lazer', 'Compras', 'Assinaturas', 'Impostos', 'Outros'];
const bankCats = () => [...new Set([...BANK_CATS, ...db.setting('bankCats', [])])];
function bankCatDialog(cp) {
  return new Promise(res => {
    let done = false;
    const l = openLayer({
      html: `<div class="dh"><h2>Categoria</h2></div><div class="db"><p style="margin:0">“${esc(cp)}”. Vale para todos os lançamentos com esse nome.</p>
        <div class="row" style="flex-wrap:wrap;gap:6px">${bankCats().map(c => `<button class="btn sm" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="field"><label for="bcat-new">Outra categoria</label><div class="row"><input id="bcat-new" class="input" placeholder="Nova categoria"><button class="btn sm" data-cat="__new">Usar</button></div></div></div>`,
      onClose: () => { if (!done) res(null); }
    });
    l.box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      let v = b.dataset.cat;
      if (v === '__new') v = $('#bcat-new', l.box).value.trim();
      if (!v) return toast('Digite o nome da categoria.');
      done = true; res(v); l.close();
    });
  });
}
ACTIONS['bank-cat'] = async (el) => {
  const entity = el.dataset.entity, cp = el.dataset.cp;
  const cat = await bankCatDialog(cp);
  if (!cat) return;
  const q = db.adapter.client.from('tempo_bank_txns').update({ category: cat, updated_at: new Date().toISOString() }).eq('entity', entity);
  const { error } = cp === '—' ? await q.is('counterpart', null) : await q.eq('counterpart', cp);
  if (error) return toast('Erro: ' + error.message);
  (BANK.all[entity] || []).forEach(t => { if ((t.counterpart || '—') === cp) t.category = cat; });
  if (!BANK_CATS.includes(cat) && !db.setting('bankCats', []).includes(cat)) db.setSetting('bankCats', [...db.setting('bankCats', []), cat]);
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
    ? `<table class="grid compact fin"><tbody>${rows.map(t => `<tr><td class="mono small">${fmtDateShort(t.posted_on)}</td><td>${esc(t.counterpart || t.memo)}</td><td class="num">${fmtMoney(t.amount)}</td><td>${t.scope === 'interna' ? '<span class="tag tg" style="background:var(--surface-2);color:var(--fg-3)">Interna</span>' : t.scope === 'cartao' ? '<span class="tag tg" style="background:var(--surface-2);color:var(--fg-3)">Cartão</span>' : '<span class="tag tg">Externa</span>'}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty small">${reviewedNow ? 'Nenhuma movimentação revisada.' : 'Nenhuma movimentação nova.'}</div>`;
  const reviewed = BANK.mode[entity] === 'revisado';
  const foot = `<div class="panel-b" style="padding:8px 16px;display:flex;gap:8px;justify-content:flex-end"><button class="btn sm ghost" data-act="bank-mode" data-entity="${entity}">${reviewed ? 'Ver novas' : 'Ver revisadas'}</button>${rows.length && !reviewed ? `<button class="btn sm" data-act="bank-review-all" data-entity="${entity}">Marcar como revisadas</button>` : ''}</div>`;
  return `<div class="panel">${head}${sub}<div class="panel-b tight" style="max-height:320px;overflow:auto">${body}</div>${foot}</div>`;
}
ACTIONS['bank-connect'] = async () => {
  try { const r = await bankApi('start'); location.href = r.url; }
  catch (e) { toast('Não consegui conectar: ' + e.message); }
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
function pfInvestHTML() {
  const ym = BANK.month || ymd(new Date()).slice(0, 7);
  const rows = (BANK.all.pf || []).filter(t => t.scope === 'interna' && (t.posted_on || '').slice(0, 7) === ym);
  const aplic = rows.filter(t => t.flow === 'out').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const resg = rows.filter(t => t.flow === 'in').reduce((s, t) => s + Number(t.amount), 0);
  return `<div class="kpis">
    <div class="kpi"><span class="k">Resgates</span><span class="v">${fmtMoney0(resg)}</span><span class="s">entraram na conta</span></div>
    <div class="kpi"><span class="k">Aplicações</span><span class="v">${fmtMoney0(aplic)}</span><span class="s">saíram para as caixinhas</span></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>Movimentos de caixinhas</h3><span class="small muted">Giro, Reserva, Especial, Freelas</span></div>
  <div class="panel-b small muted" style="padding:8px 16px">O extrato diz “Resgate RDB”, mas não diz de qual caixinha. Por isso ainda não separo por caixinha: o saldo de cada uma depende de você informar ou de outra fonte.</div>
  <div class="panel-b tight" style="max-height:420px;overflow:auto">${rows.length ? `<table class="grid compact fin"><tbody>${rows.map(t => `<tr><td class="mono small">${fmtDateShort(t.posted_on)}</td><td>${esc(t.memo || '')}</td><td class="num">${fmtMoney(t.amount)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty small">Nenhum movimento de caixinha neste mês.</div>'}</div></div>`;
}
VIEWS.financepf = () => {
  bankRefresh();
  const tab = BANK.pfTab || 'geral';
  if (tab === 'conta') BANK.origin = 'conta'; else if (tab === 'cartao') BANK.origin = 'cartao'; else if (BANK.origin !== undefined && tab === 'geral') BANK.origin = 'all';
  const body = tab === 'invest' ? pfInvestHTML() : `${bankSummaryHTML('pf')}${bankPanel('pf')}`;
  const tabs = `<div class="seg" style="margin-bottom:12px">${PF_TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="pf-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  return { title: 'Financeiro PF', actions: '', html: tabs + body };
};
ACTIONS['pf-tab'] = (el) => { BANK.pfTab = el.dataset.v; render(); };
