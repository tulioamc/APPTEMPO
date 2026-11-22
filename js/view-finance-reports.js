/* =====================================================================
   FINANCEIRO
   ===================================================================== */
VIEWS.finance = () => {
  if (typeof nfRegras === 'function') nfRegras();
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
  ${finFlowHTML()}
  ${contadorHTML()}
  <div class="panel"><div class="panel-h"><h3>Projetos</h3><span class="grow"></span>${colsBtn('finance')}<button class="btn sm" data-act="csv-copy" data-kind="finance">${icon('copy')} Copiar CSV</button></div><div class="panel-b tight">${list.length ? gridTable({ id: 'finance', cls: 'fin', cols: FCOLS, rows: list, defHidden: ['status'], defSort: null, rowAttrs: p => `data-act="fin-open" data-id="${p.id}"`, rowById: (id) => db.get('tempo_projects', id) }) : `<div class="empty">${icon('money')}<b>Nenhum projeto com esses filtros</b></div>`}</div></div>`;
  return { title: 'Financeiro PJ', actions: '', html };
};
/* Fluxo de entradas (bruto × líquido), previsão do que falta receber pelo prazo e concentração de receita por cliente.
   Usa só os pagamentos dos projetos; o imposto é a reserva de ~6% (ajustável em impostoPct). Não depende dos filtros acima. */
function finFlowHTML() {
  const taxa = Number(db.setting('impostoPct', 6)) || 0;
  const hoje = new Date(); const ymOf = (d) => d.slice(0, 7);
  const mesAdd = (n) => { const d = new Date(hoje.getFullYear(), hoje.getMonth() + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const lab = (ym) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
  const pays = db.all('tempo_payments').filter(x => x.date && Number(x.amount) > 0);
  // entradas dos últimos 6 meses
  const passados = [-5, -4, -3, -2, -1, 0].map(mesAdd);
  const porMes = Object.fromEntries(passados.map(m => [m, 0]));
  pays.forEach(x => { const m = ymOf(x.date); if (m in porMes) porMes[m] += Number(x.amount); });
  // a receber nos próximos 3 meses, pelo prazo do projeto (vencido entra no mês atual)
  const futuros = [0, 1, 2].map(mesAdd); const prev = Object.fromEntries(futuros.map(m => [m, 0])); let semPrazo = 0;
  // previsões de pagamento (das propostas aprovadas) valem no lugar do prazo do projeto
  const comPrev = new Set();
  (db.setting('previsoes', []) || []).filter(v => !v.recebido).forEach(v => { comPrev.add(v.project_id); let m = ymOf(v.data); if (m < futuros[0]) m = futuros[0]; if (m in prev) prev[m] += Number(v.valor) || 0; });
  db.all('tempo_projects').filter(p => !p.archived && !comPrev.has(p.id)).forEach(p => {
    const r = remainingOf(p) || 0; if (r <= 0) return;
    if (!p.deadline) { semPrazo += r; return; }
    let m = ymOf(p.deadline); if (m < futuros[0]) m = futuros[0];
    if (m in prev) prev[m] += r;
  });
  const maxV = Math.max(1, ...Object.values(porMes), ...Object.values(prev));
  const barra = (v, cor) => `<div class="ap-bar" style="flex:1"><i style="width:${(v / maxV * 100).toFixed(1)}%${cor ? ';background:' + cor : ''}"></i></div>`;
  const linhaPass = passados.map(m => { const b = porMes[m]; return `<div class="row gap-s small" style="align-items:center"><span style="width:52px">${lab(m)}</span>${barra(b)}<span class="mono" style="width:190px;text-align:right">${fmtMoney0(b)} <span class="faint">· líq. ${fmtMoney0(b * (1 - taxa / 100))}</span></span></div>`; }).join('');
  const linhaFut = futuros.map(m => `<div class="row gap-s small" style="align-items:center"><span style="width:52px">${lab(m)}</span>${barra(prev[m], 'var(--warn)')}<span class="mono" style="width:190px;text-align:right">${fmtMoney0(prev[m])}</span></div>`).join('');
  // concentração: últimos 12 meses por cliente
  const desde = mesAdd(-11); const porCli = {}; let tot = 0;
  pays.filter(x => ymOf(x.date) >= desde).forEach(x => { const p = db.get('tempo_projects', x.project_id); const c = p ? clientOf(p) : null; const k = c?.name || 'Sem cliente'; porCli[k] = (porCli[k] || 0) + Number(x.amount); tot += Number(x.amount); });
  const ranking = Object.entries(porCli).sort((a, b) => b[1] - a[1]);
  const topPct = tot ? ranking[0][1] / tot * 100 : 0;
  const conc = ranking.slice(0, 6).map(([n, v]) => `<div class="bar-row"><span class="lab">${esc(n)}</span><div class="bar-track"><div class="bar-fill fill" style="--tb:${hexOf('blue')};width:${(v / tot * 100).toFixed(1)}%"></div></div><span class="val">${Math.round(v / tot * 100)}%</span></div>`).join('');
  const bruto6 = Object.values(porMes).reduce((a, b) => a + b, 0);
  return `<div class="grid2" style="align-items:start">
    <div class="panel"><div class="panel-h"><h3>Entradas e previsão</h3><span class="grow"></span><span class="small muted">imposto ${taxa}%</span></div><div class="panel-b">
      <div class="lbl">Recebido (bruto · líquido)</div>${linhaPass}
      <div class="small muted" style="margin:4px 0 12px">6 meses: ${fmtMoney0(bruto6)} bruto · ${fmtMoney0(bruto6 * (1 - taxa / 100))} líquido · média ${fmtMoney0(bruto6 / 6)}/mês</div>
      <div class="lbl">A receber, pelo prazo do projeto</div>${linhaFut}
      ${semPrazo ? `<div class="small muted" style="margin-top:4px">+ ${fmtMoney0(semPrazo)} em projetos sem prazo</div>` : ''}
    </div></div>
    <div class="panel"><div class="panel-h"><h3>Concentração de receita</h3><span class="grow"></span><span class="small muted">últimos 12 meses</span></div><div class="panel-b">
      ${tot ? `<div class="bars">${conc}</div><div class="small ${topPct > 50 ? '' : 'muted'}" style="margin-top:8px${topPct > 50 ? ';color:var(--warn)' : ''}">${topPct > 50 ? `Atenção: ${esc(ranking[0][0])} responde por ${Math.round(topPct)}% do que entrou.` : `Maior cliente: ${Math.round(topPct)}% do total.`}</div>` : '<span class="faint small">Sem pagamentos nos últimos 12 meses.</span>'}
    </div></div>
  </div>`;
}
const PAYCOLS = {
  date: { label: 'Data', ico: 'cal', w: 100, sort: x => x.date || '', cell: x => x.date ? fmtDate(x.date) : '<span class="faint">sem data</span>' },
  name: { label: 'Projeto', ico: 'list', w: 240, sort: x => db.get('tempo_projects', x.project_id)?.name || '', cell: x => { const p = db.get('tempo_projects', x.project_id); return p ? `<b>${esc(p.name)}</b>` : ''; } },
  client: { label: 'Cliente', ico: 'users', w: 160, sort: x => clientOf(db.get('tempo_projects', x.project_id))?.name || '', cell: x => { const c = clientOf(db.get('tempo_projects', x.project_id)); return c ? tag(c.name, c.color || 'gray') : ''; } },
  work: { label: 'Status do trabalho', ico: 'list', w: 150, sort: x => statusCat(db.get('tempo_projects', x.project_id)?.status_id) || '', cell: x => statusTag(db.get('tempo_projects', x.project_id)?.status_id) },
  amount: { label: 'Valor', ico: 'money', w: 110, money: true, sort: x => Number(x.amount) || 0, cell: x => fmtMoney(x.amount) },
  nf: { label: 'Nota', ico: 'doc', w: 130, sort: x => (typeof nfsDoPagamento === 'function' && nfsDoPagamento(x.id)[0]?.numero) || 0, cell: x => { const l = typeof nfsDoPagamento === 'function' ? nfsDoPagamento(x.id) : []; return l.length ? nfChips(l, { label: true }) : '<span class="faint small">sem nota</span>'; } },
};
const FCOLS = {
  agency: PCOLS.agency, client: PCOLS.client,
  name: { ...PCOLS.name, cell: p => `<span class="cell-name"><span class="ct">${esc(p.name)}</span>${openBtn('fin-open', p.id)}</span>` },
  status: PCOLS.status, pay: PCOLS.pay, budget: PCOLS.budget, paid: PCOLS.paid, remaining: PCOLS.remaining,
  invoice: { label: 'Nota fiscal', ico: 'doc', w: 150, sort: p => (typeof nfsDoProjeto === 'function' && nfsDoProjeto(p.id)[0]?.emitida_em) || p.invoice_at || '', cell: p => { const l = typeof nfsDoProjeto === 'function' ? nfsDoProjeto(p.id) : []; return l.length ? nfChips(l, { label: l.length === 1 }) : p.invoice_at ? fmtDate(p.invoice_at) : ''; }, edit: { type: 'date', get: p => p.invoice_at ? ymd(p.invoice_at) : null, set: (p, v) => { db.update('tempo_projects', p.id, { invoice_at: v ? parseYmd(v).toISOString() : null }); if (v) logEvent('project', p.id, 'milestone', `Nota fiscal: ${fmtDate(v)}`); } } },
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
  const brutoRep = unionBrutoMs(d.entries);
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

/* Pacote do mês para o contador: entradas da PJ (extrato, sem transferências internas), de quem, e projetos pagos sem nota. */
function contadorDados(ym) {
  const ins = ((typeof BANK !== 'undefined' && BANK.all?.pj) || []).filter(t => t.flow === 'in' && t.scope !== 'interna' && String(t.posted_on || '').slice(0, 7) === ym)
    .sort((a, b) => String(a.posted_on).localeCompare(String(b.posted_on)));
  const pagosMes = new Set(db.all('tempo_payments').filter(x => String(x.date || '').slice(0, 7) === ym).map(x => x.project_id));
  const semNota = projects().filter(p => !p.invoice_at && (pagosMes.has(p.id) || String(p.paid_at || '').slice(0, 7) === ym));
  return { ins, semNota, total: ins.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0) };
}
function contadorTexto(ym) {
  const d = contadorDados(ym); const [a, m] = ym.split('-');
  const linhas = [`Resumo PJ de ${m}/${a}`, '', `Entradas: ${fmtMoney(d.total)} (${d.ins.length} lançamento(s))`,
    ...d.ins.map(t => `- ${fmtDate(t.posted_on)} · ${t.counterpart || t.memo || '—'} · ${fmtMoney(Math.abs(Number(t.amount)))}`)];
  if (d.semNota.length) linhas.push('', 'Notas a emitir:', ...d.semNota.map(p => `- ${clientOf(p)?.name || ''} · ${p.name} · ${fmtMoney(p.budget)}`));
  return linhas.join('\n');
}
function contadorHTML() {
  const ym = S.contYm || (() => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - 1); return ymd(x).slice(0, 7); })();
  const d = contadorDados(ym);
  return `<div class="panel"><div class="panel-h"><h3>Para o contador</h3><span class="small muted">entradas da PJ e notas a emitir no mês</span><span class="grow"></span><input type="month" class="input sm" style="max-width:160px" value="${ym}" data-on="cont-ym" aria-label="Mês"><button class="btn sm" data-act="cont-copia" data-ym="${ym}">${icon('copy')} Copiar resumo</button></div>
    <div class="panel-b stack" style="gap:10px"><div>Entradas: <b>${fmtMoney0(d.total)}</b> em ${d.ins.length} lançamento(s)${d.ins.length ? '' : ' <span class="faint small">(nenhuma no extrato carregado)</span>'}</div>
    ${d.ins.length ? `<div class="calc-sum4"><span class="lbl">De quem</span><span class="lbl v">Data</span><span class="lbl v">Valor</span><span></span>${d.ins.map(t => `<span>${esc(t.counterpart || t.memo || '—')}</span><span class="v small">${fmtDate(t.posted_on)}</span><span class="v">${fmtMoney0(Math.abs(Number(t.amount)))}</span><span></span>`).join('')}</div>` : ''}
    ${d.semNota.length ? `<div><b>Notas a emitir</b> (pagos sem nota): ${d.semNota.map(p => `${esc(p.name)} <span class="faint small">${esc(clientOf(p)?.name || '')}</span>`).join(' · ')}</div>` : '<div class="small muted">Nenhum projeto pago no mês sem nota.</div>'}
    </div></div>`;
}
CHANGES['cont-ym'] = (el) => { S.contYm = el.value; render(); };
ACTIONS['cont-copia'] = async (el) => { try { await navigator.clipboard.writeText(contadorTexto(el.dataset.ym)); toast('Resumo copiado para mandar ao contador'); } catch (e) { toast('Não consegui copiar.'); } };
