/* =====================================================================
   TAREFAS
   ===================================================================== */
VIEWS.tasks = () => {
  const f = S.task; const q = f.q.toLowerCase().trim();
  const match = (t) => {
    const p = db.get('tempo_projects', t.project_id); if (!p || p.archived) return false;
    if (f.project && t.project_id !== f.project) return false;
    if (f.status && t.status_id !== f.status) return false;
    const cat = statusCat(t.status_id);
    if (f.mine === 'open' && ['done', 'cancelled'].includes(cat)) return false;
    if (f.mine === 'done' && cat !== 'done') return false;
    if (q && ![t.name, p.name, clientOf(p)?.name].some(x => (x || '').toLowerCase().includes(q))) return false;
    return true;
  };
  const tops = db.all('tempo_tasks').filter(t => !t.parent_id);
  const rows = []; let count = 0, ms = 0;
  const folded = new Set(db.setting('tkFold', []) || []);
  [...tops].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).forEach(t => {
    const subs = subtasksOf(t.id).filter(match);
    if (!match(t) && !subs.length) return;
    rows.push([t, false, match(t)]); if (!folded.has(t.id) || q) subs.forEach(s => rows.push([s, true, true]));
  });
  rows.forEach(([t, sub, m]) => { if (m) { count++; ms += sub ? db.where('tempo_time_entries', e => e.task_id === t.id).reduce((s, e) => s + entryMs(e), 0) : 0; } });
  rows.filter(r => !r[1]).forEach(([t]) => { ms += db.where('tempo_time_entries', e => e.task_id === t.id).reduce((s, e) => s + entryMs(e), 0); });
  const html = `<div class="panel">
    <div class="filters">
      <input id="tk-q" class="input search" placeholder="Buscar tarefa, projeto ou cliente" value="${esc(f.q)}" data-input="tk" data-k="q">
      <div class="seg">${[['open', 'Abertas'], ['all', 'Todas'], ['done', 'Concluídas']].map(([v, l]) => `<button class="${f.mine === v ? 'on' : ''}" data-act="tk-set" data-k="mine" data-v="${v}">${l}</button>`).join('')}</div>
      <select id="tk-p" class="input" data-on="tk" data-k="project" aria-label="Projeto">${options(projects().sort((a, b) => a.name.localeCompare(b.name)), f.project, { empty: true, emptyLabel: 'Todos os projetos', label: p => `${clientOf(p)?.name || ''} · ${p.name}` })}</select>
      <select id="tk-s" class="input" data-on="tk" data-k="status" aria-label="Status">${options(statuses('work'), f.status, { empty: true, emptyLabel: 'Todos os status' })}</select>
      <span class="grow"></span>${colsBtn('tasks')}
    </div>
    <div class="panel-b tight">${rows.length ? gridTable({ id: 'tasks', cols: TCOLS, rows: rows.map(r => r[0]), sortable: true, rowAttrs: t => `data-act="tk-open" data-p="${t.project_id}"`, rowById: (id) => db.get('tempo_tasks', id) })
      : `<div class="empty">${icon('check')}<b>${db.all('tempo_tasks').length ? 'Nenhuma tarefa com esses filtros' : 'Nenhuma tarefa ainda'}</b><span>Tarefas são criadas dentro de cada projeto.</span><button class="btn primary" data-act="tk-new">${icon('plus')} Nova tarefa</button></div>`}</div>
  </div>`;
  return { title: 'Tarefas', actions: `<button class="btn primary" data-act="tk-new">${icon('plus')} Nova tarefa</button>`, html };
};
/* Botão de recolher/expandir subtarefas de uma tarefa principal (estado guardado nas configurações). */
function tkFoldBtn(t) {
  if (t.parent_id) return '';
  const n = subtasksOf(t.id).length; if (!n) return '';
  const isFolded = (db.setting('tkFold', []) || []).includes(t.id);
  return `<button class="btn sm icon ghost" data-act="tk-fold" data-id="${t.id}" style="margin-right:4px;flex:none" aria-label="${isFolded ? 'Expandir' : 'Recolher'} subtarefas" title="${isFolded ? 'Expandir' : 'Recolher'} subtarefas">${icon(isFolded ? 'chevR' : 'chevD')}</button>${isFolded ? `<span class="faint small" style="margin-right:6px">${n}</span>` : ''}`;
}
const tMs = (t) => t.parent_id ? db.where('tempo_time_entries', e => e.task_id === t.id).reduce((s, e) => s + entryMs(e), 0) : taskMs(t.id);
const TCOLS = {
  name: { label: 'Tarefa', ico: 'text', w: 300, sort: t => t.name, cls: t => 'name' + (t.parent_id ? ' sub' : ''), cell: t => `<span class="cell-name">${tkFoldBtn(t)}<span class="ct">${t.parent_id ? '<span class="faint">↳ </span>' : ''}${esc(t.name)} ${t.status_inherited !== false ? '<span class="inh" title="Acompanha o status do projeto">H</span>' : ''}</span>${openBtn('tk-open', t.id, `data-p="${t.project_id}"`)}</span>`, edit: { type: 'text', required: true, get: t => t.name, set: (t, v) => db.update('tempo_tasks', t.id, { name: v }) } },
  project: { label: 'Cliente › Projeto', ico: 'folder', w: 280, sort: t => { const p = db.get('tempo_projects', t.project_id); return `${clientOf(p)?.name || '~'} ${p?.name || ''}`; }, cell: t => { const p = db.get('tempo_projects', t.project_id); return `<span class="row" style="gap:6px;flex-wrap:nowrap">${clientTag(clientOf(p))}<span class="muted">${esc(p.name)}</span></span>`; } },
  status: { label: 'Status', ico: 'spin', w: 170, sort: t => db.get('tempo_status_options', t.status_id)?.order ?? 99, cell: t => statusTag(t.status_id), edit: { type: 'combo', kind: 'work', get: t => t.status_id, set: (t, v) => setTaskStatus(t, v) } },
  deadline: { label: 'Prazo', ico: 'cal', w: 120, sort: t => t.deadline || '9999', cell: t => { const late = t.deadline && t.deadline < ymd(new Date()) && !['done', 'cancelled'].includes(statusCat(t.status_id)); return `<span style="${late ? 'color:var(--danger);font-weight:600' : ''}">${fmtDate(t.deadline)}</span>`; }, edit: { type: 'date', get: t => t.deadline, set: async (t, v) => { await taskDeadlineFlow(t, v); } } },
  wt: { label: 'Tipo', ico: 'tag', w: 160, sort: t => db.get('tempo_work_types', t.work_type_id || (t.parent_id ? db.get('tempo_tasks', t.parent_id)?.work_type_id : null))?.name || '~', cell: t => wtTag(t.work_type_id || (t.parent_id ? db.get('tempo_tasks', t.parent_id)?.work_type_id : null)), edit: { type: 'combo', kind: 'wt', allowEmpty: true, get: t => t.work_type_id, set: (t, v) => db.update('tempo_tasks', t.id, { work_type_id: v || null }) } },
  hours: { label: 'Horas', ico: 'clock', w: 100, money: true, sort: t => tMs(t), val: t => t.parent_id ? 0 : tMs(t), fmt: v => fmtDur(v), cell: t => { const ms = tMs(t); return ms ? fmtDur(ms) : ''; } },
  track: { label: '', w: 56, cell: t => `<button class="btn sm icon ghost" data-act="tk-track" data-id="${t.id}" aria-label="Registrar tempo">${icon('play')}</button>` }
};
function duplicateTasks(ids) {
  ids.forEach(id => {
    const t = db.get('tempo_tasks', id); if (!t) return;
    const nt = db.insert('tempo_tasks', { project_id: t.project_id, parent_id: t.parent_id || null, name: `${t.name} (cópia)`, status_id: t.status_id, status_inherited: t.status_inherited !== false, deadline: t.deadline || null, notes: t.notes || '', order: 99, work_type_id: t.work_type_id || null }, true);
    logEvent('task', t.project_id, 'created', `Tarefa “${nt.name}” duplicada`, null, null, { project_id: t.project_id });
  });
  db.emit(); toast(ids.length > 1 ? `${ids.length} tarefas duplicadas` : 'Tarefa duplicada');
}
CHANGES.tk = (el) => { S.task[el.dataset.k] = el.value; render(); };
ACTIONS['tk-fold'] = (el) => { const id = el.dataset.id; const cur = db.setting('tkFold', []) || []; db.setSetting('tkFold', cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]); render(); };
ACTIONS['tk-set'] = (el) => { S.task[el.dataset.k] = el.dataset.v; render(); };
ACTIONS['tk-open'] = (el) => openProject(el.dataset.p || db.get('tempo_tasks', el.dataset.id)?.project_id, 'tasks');
CHANGES['tk-status'] = (el) => { setTaskStatus(db.get('tempo_tasks', el.dataset.id), el.value); toast('Status da tarefa atualizado'); };
ACTIONS['tk-track'] = (el) => { const t = db.get('tempo_tasks', el.dataset.id); const p = db.get('tempo_projects', t.project_id); const c = clientOf(p); openStartModal({ agency_id: c?.agency_id || '__none', client_id: p.client_id, project_id: p.id, task_id: t.parent_id || t.id, sub_id: t.parent_id ? t.id : '' }); };
/* Só projetos ativos (sem concluídos/cancelados), em ordem: agência > cliente > projeto. */
const agOfProject = (p) => { const c = clientOf(p); return c ? db.get('tempo_agencies', c.agency_id) : null; };
function tkProjectsSorted() {
  return projects()
    .filter(p => !['done', 'cancelled'].includes(statusCat(p.status_id)))
    .sort((a, b) => (agOfProject(a)?.name || '~').localeCompare(agOfProject(b)?.name || '~', 'pt-BR')
      || (clientOf(a)?.name || '').localeCompare(clientOf(b)?.name || '', 'pt-BR')
      || a.name.localeCompare(b.name, 'pt-BR'));
}
function tkProjectLabel(p) {
  const a = agOfProject(p); const c = clientOf(p);
  return [a ? (agencyAbbr(a) || a.name) : 'Direto', c?.name || '', p.name].filter(Boolean).join(' › ');
}
ACTIONS['tk-new'] = (el) => {
  if (!projects().length) return toast('Crie um projeto antes de adicionar tarefas.');
  if (el?.dataset?.project) S.task = { ...(S.task || {}), project: el.dataset.project };
  const l = openLayer({
    html: `<div class="dh"><h2>Nova tarefa</h2></div><form class="db" id="tkf">
      <div class="field"><label for="tkf-p">Projeto *</label><select id="tkf-p" class="input" name="project_id">${options(tkProjectsSorted(), S.task.project, { empty: true, emptyLabel: 'Selecione…', label: p => tkProjectLabel(p) })}</select></div>
      <div class="field"><label for="tkf-par">Subtarefa de (opcional)</label><select id="tkf-par" class="input" name="parent_id"><option value="">É uma tarefa principal</option></select></div>
      <div class="field"><label for="tkf-n">Nome *</label><input id="tkf-n" class="input" name="name"></div>
      <div class="grid2"><div class="field"><label for="tkf-wt">Tipo de trabalho</label><select id="tkf-wt" class="input" name="work_type_id">${options(workTypes(), '', { empty: true, emptyLabel: 'Sem tipo' })}</select></div><div class="field"><label for="tkf-dl">Prazo</label><input id="tkf-dl" type="date" class="input" name="deadline"></div></div>
    </form><div class="df"><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="save">Criar tarefa</button></div>`
  });
  const fill = () => { const pid = $('#tkf-p', l.box).value; $('#tkf-par', l.box).innerHTML = '<option value="">É uma tarefa principal</option>' + (pid ? options(tasksOf(pid), '') : ''); };
  fill(); $('#tkf-p', l.box).addEventListener('change', fill);
  l.box.addEventListener('submit', e => e.preventDefault());
  l.box.addEventListener('click', (e) => {
    if (!e.target.closest('[data-x="save"]')) return;
    const f = formData($('#tkf', l.box)); if (!f.project_id || !f.name.trim()) return toast('Escolha o projeto e dê um nome.');
    const p = db.get('tempo_projects', f.project_id);
    db.insert('tempo_tasks', { project_id: p.id, parent_id: f.parent_id || null, name: f.name.trim(), status_id: newTaskStatusId(p.id), status_inherited: true, deadline: f.deadline || null, notes: '', order: 99, work_type_id: f.work_type_id || null }, true);
    reopenProjectIfDone(p.id);
    logEvent('task', p.id, 'created', `${f.parent_id ? 'Subtarefa' : 'Tarefa'} “${f.name.trim()}” criada`, null, null, { project_id: p.id });
    db.emit(); l.close(); toast('Tarefa criada');
  });
};

/* =====================================================================
   ORÇAMENTOS + CALCULADORA
   ===================================================================== */
VIEWS.quotes = () => {
  const f = S.quote; const q = f.q.toLowerCase();
  const all = db.all('tempo_quotes');
  const list = all.filter(x => (!f.status || x.status_id === f.status) && (!q || [x.name, db.get('tempo_clients', x.client_id)?.name].some(s => (s || '').toLowerCase().includes(q))))
    .sort((a, b) => (b.sent_at || b.created_at).localeCompare(a.sent_at || a.created_at));
  const cat = (x) => statusCat(x.status_id);
  const open = all.filter(x => cat(x) === 'open'); const won = all.filter(x => cat(x) === 'won'); const lost = all.filter(x => cat(x) === 'lost');
  const today = ymd(new Date());
  const html = `<div class="kpis">
    <div class="kpi"><span class="k">Em aberto</span><span class="v">${fmtMoney0(open.reduce((s, x) => s + (Number(x.value) || 0), 0))}</span><span class="s">${open.length} proposta(s)</span></div>
    <div class="kpi"><span class="k">Aprovados</span><span class="v">${fmtMoney0(won.reduce((s, x) => s + (Number(x.value) || 0), 0))}</span><span class="s">${won.length} proposta(s)</span></div>
    <div class="kpi"><span class="k">Taxa de aprovação</span><span class="v">${won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) + '%' : '—'}</span><span class="s">aprovados ÷ decididos</span></div>
    <div class="kpi"><span class="k">Follow-up pendente</span><span class="v">${open.filter(x => x.sent_at && daysBetween(x.followups?.slice(-1)[0]?.date || x.sent_at, today) >= 5).length}</span><span class="s">sem contato há 5+ dias</span></div>
  </div>
  <div class="panel"><div class="filters"><input id="qt-q" class="input search" placeholder="Buscar proposta ou cliente" value="${esc(f.q)}" data-input="qt" data-k="q"><select id="qt-s" class="input" data-on="qt" data-k="status" aria-label="Status">${options(statuses('quote'), f.status, { empty: true, emptyLabel: 'Todos os status' })}</select><span class="grow"></span>${colsBtn('quotes')}</div>
  <div class="panel-b tight">${list.length ? gridTable({ id: 'quotes', cols: QCOLS, rows: list, rowAttrs: x => `data-act="qt-open" data-id="${x.id}"`, rowById: (id) => db.get('tempo_quotes', id) })
    : `<div class="empty">${icon('doc')}<b>Nenhuma proposta</b><span>Registre os orçamentos enviados para acompanhar follow-up e converter em projeto quando aprovados.</span><button class="btn primary" data-act="qt-new">${icon('plus')} Nova proposta</button></div>`}</div></div>`;
  return { title: 'Orçamentos', actions: `<button class="btn primary" data-act="qt-new">${icon('plus')} Nova proposta</button>`, html };
};
const QCOLS = {
  agency: { label: 'Agência', ico: 'spin', w: 140, sort: x => db.get('tempo_agencies', x.agency_id)?.name || '~', cell: x => agencyTag(db.get('tempo_agencies', db.get('tempo_clients', x.client_id)?.agency_id)) },
  client: { label: 'Cliente', ico: 'users', w: 200, sort: x => db.get('tempo_clients', x.client_id)?.name || '', cell: x => clientTag(db.get('tempo_clients', x.client_id)), edit: { type: 'combo', kind: 'client', get: x => x.client_id, set: (x, v) => db.update('tempo_quotes', x.id, { client_id: v, agency_id: db.get('tempo_clients', v)?.agency_id || null }) } },
  name: { label: 'Proposta', ico: 'text', w: 260, cls: 'name', sort: x => x.name, cell: x => `<span class="cell-name"><span class="ct">${esc(x.name)}</span>${openBtn('qt-open', x.id)}</span>`, edit: { type: 'text', required: true, get: x => x.name, set: (x, v) => db.update('tempo_quotes', x.id, { name: v }) } },
  status: { label: 'Status', ico: 'spin', w: 150, sort: x => db.get('tempo_status_options', x.status_id)?.order ?? 99, cell: x => statusTag(x.status_id), edit: { type: 'combo', kind: 'quote', get: x => x.status_id, set: (x, v) => db.update('tempo_quotes', x.id, { status_id: v }) } },
  value: { label: 'Valor', ico: 'hash', w: 140, money: true, sort: x => Number(x.value) || 0, val: x => Number(x.value) || 0, cell: x => fmtMoney(x.value), edit: { type: 'money', get: x => x.value, set: (x, v) => db.update('tempo_quotes', x.id, { value: v }) } },
  hours: { label: 'Horas est.', ico: 'clock', w: 100, money: true, sort: x => Number(x.est_hours) || 0, cell: x => x.est_hours ? x.est_hours + ' h' : '', edit: { type: 'number', get: x => x.est_hours, set: (x, v) => db.update('tempo_quotes', x.id, { est_hours: v }) } },
  sent: { label: 'Enviado', ico: 'cal', w: 110, sort: x => x.sent_at || '', cell: x => fmtDate(x.sent_at), edit: { type: 'date', get: x => x.sent_at, set: (x, v) => db.update('tempo_quotes', x.id, { sent_at: v }) } },
  valid: { label: 'Validade', ico: 'cal', w: 130, sort: x => x.valid_until || '', cell: x => { const exp = x.valid_until && x.valid_until < ymd(new Date()) && statusCat(x.status_id) === 'open'; return `<span style="${exp ? 'color:var(--danger);font-weight:600' : ''}">${fmtDate(x.valid_until)}${exp ? ' · vencido' : ''}</span>`; }, edit: { type: 'date', get: x => x.valid_until, set: (x, v) => db.update('tempo_quotes', x.id, { valid_until: v }) } },
  follow: { label: 'Último contato', ico: 'text', w: 220, cls: 'obs', cell: x => { const lf = x.followups?.slice(-1)[0]; return lf ? `${fmtDateShort(lf.date)} · ${esc(lf.note)}` : ''; } },
  project: { label: 'Projeto', ico: 'folder', w: 180, cell: x => x.project_id ? tag(db.get('tempo_projects', x.project_id)?.name || 'projeto', 'green') : '' }
};
CHANGES.qt = (el) => { S.quote[el.dataset.k] = el.value; render(); };
ACTIONS['qt-new'] = () => openQuote(null);
ACTIONS['qt-open'] = (el) => openQuote(el.dataset.id);
ACTIONS['calc-open'] = () => openQuote(null);

// Projeto ligado à proposta (pelo vínculo da proposta ou pelo quote_id do projeto).
function linkedProject(x) {
  if (!x) return null;
  return (x.project_id && db.get('tempo_projects', x.project_id)) || db.all('tempo_projects').find(p => p.quote_id === x.id) || null;
}
/* Proposta: abre com a calculadora (principal). "Orçamento simplificado" é o formulário curto de valor e horas.
   Aprovada (status de aprovação ou "Converter em projeto"), a calculadora vira projeto com uma tarefa por etapa. */
const calcNovo = () => ({ cliente: '', porte: 'medio', mercado: 'local', outro: false, customRate: null, lines: [{ name: 'Criação', wt: '', h: '' }],
  duracao: '', cx: 'simples', aprov: '', pedido: '', desc: '', descTipo: 'R$', alvo: null, revInc: 2, revExtra: null,
  nf: { on: true, pct: 9, inside: false }, bv: { on: false, pct: 10 }, ext: { on: false, items: [{ name: '', value: null }] } });
// proposta antiga sem a calculadora nova (sem "lines" ou com contingência) abre no simplificado
const calcDaProposta = (c) => c && Array.isArray(c.lines) && c.cx !== undefined ? { ...calcNovo(), ...clone(c) } : null;
function openQuote(id, preset = {}) {
  const x = id ? db.get('tempo_quotes', id) : null; const v = { ...(x || {}), ...preset };
  const rates = precoBase();
  const perfis = db.setting('clientePreco', {}) || {};
  const st = calcDaProposta(v.calc) || calcNovo();
  let modo = preset.modo || (x ? (calcDaProposta(x.calc) ? 'calc' : 'simples') : 'calc');
  const q = { name: v.name || '', client_id: v.client_id || '', status_id: v.status_id || statuses('quote')[0]?.id, sent_at: v.sent_at || '', valid_until: v.valid_until || '',
    notes: v.notes || '', value: v.value ?? null, est_hours: v.est_hours ?? '', work_type_id: v.work_type_id || '', revisions_included: v.revisions_included ?? 2, extra_revision_price: v.extra_revision_price ?? null };
  if (q.client_id) { st.cliente = q.client_id; const pf = perfis[q.client_id]; if (pf && !calcDaProposta(v.calc)) { st.porte = pf.porte || st.porte; st.mercado = pf.mercado || st.mercado; } }
  if (calcDaProposta(v.calc)) { st.revInc = q.revisions_included ?? st.revInc; }
  const done = projects().filter(p => statusCat(p.status_id) === 'done' && p.estimated_hours && projectMs(p.id));
  const ratio = done.length ? done.reduce((s, p) => s + hours(projectMs(p.id)) / p.estimated_hours, 0) / done.length : null;
  const linked = linkedProject(x);

  const calcRateTxt = () => st.outro ? `Valor-hora: <b>${fmtMoney(calcRate(st, rates)) || 'R$ —'}</b>`
    : `${fmtMoney(rates.hora) || 'R$ —'} × ${fmtX(rates.porte[st.porte])} (porte) × ${fmtX(rates.mercado[st.mercado])} (mercado) = <b>${fmtMoney(calcRate(st, rates)) || 'R$ —'}/h</b>`;
  const horasTxt = (c) => c.h ? `Total: <b>${fmtH(c.h * 3600000)}</b> de trabalho${c.reun ? ` (${fmtH((c.h - c.reun) * 3600000)} das etapas + ${fmtH(c.reun * 3600000)} de reuniões)` : ''} · prazo ${c.prazoModelo ? `fechado <b>${c.fechado} dia(s) útil(eis)</b>, provável com ajustes <b>~${c.provavel}</b> (sem contar o tempo de aprovação do cliente)` : `no ritmo normal: <b>${c.fechado} dia(s) útil(eis)</b> (${HORAS_DIA} h/dia)`}` : '';
  const urgTxt = (c) => !c.pedido ? `Sem urgência. No ritmo normal leva ${c.fechado || '—'} dia(s) útil(eis).`
    : c.urg > 1 ? `Urgência <b>${fmtX(c.urg)}</b> (${c.fechado} ÷ ${c.pedido} dias)${c.semPrazo ? ' · <span style="color:var(--warn)">nem dobrando dá para fazer nesse prazo; cobrado no teto de 2×</span>' : ''}`
    : `Prazo folgado (${c.fechado} dia(s) no ritmo normal): sem urgência.`;

  const camposTopo = () => `<div class="grid2">
      <div class="field span2"><label for="qf-n">Nome / escopo *</label><input id="qf-n" class="input" data-q="name" value="${esc(q.name)}"></div>
      <div class="field"><label for="qf-c">Cliente *</label><div class="row" style="flex-wrap:nowrap"><button type="button" id="qf-c" class="input combo-field grow" data-cli-busca aria-label="Buscar cliente">${q.client_id && db.get('tempo_clients', q.client_id) ? clientTag(db.get('tempo_clients', q.client_id)) : '<span class="faint">Buscar cliente…</span>'}</button><button type="button" class="btn" data-x="newclient" aria-label="Novo cliente" title="Cadastrar cliente novo">${icon('plus')}</button></div></div>
      <div class="field"><label for="qf-s">Status</label><select id="qf-s" class="input" data-q="status_id">${options(statuses('quote'), q.status_id)}</select></div>
      <div class="field"><label for="qf-sa">Enviado em</label><input id="qf-sa" type="date" class="input" data-q="sent_at" value="${q.sent_at}"></div>
      <div class="field"><label for="qf-vu">Válido até</label><input id="qf-vu" type="date" class="input" data-q="valid_until" value="${q.valid_until}"></div>
    </div>`;
  const camposSimples = () => `<div class="grid2">
      <div class="field"><label for="qf-v">Valor</label><input id="qf-v" class="input mono" data-q="value" ${moneyAttrs(q.value)}></div>
      <div class="field"><label for="qf-h">Horas estimadas</label><input id="qf-h" type="number" step="0.5" class="input" data-q="est_hours" value="${q.est_hours}"></div>
      <div class="field span2">${sugHorasHTML(q.name)}</div>
      <div class="field"><label for="qf-wt">Tipo de trabalho</label><select id="qf-wt" class="input" data-q="work_type_id">${options(workTypes(), q.work_type_id, { empty: true, emptyLabel: 'Sem tipo' })}</select></div>
      <div class="field"><label for="qf-ri">Rodadas incluídas</label><input id="qf-ri" type="number" min="0" class="input" data-q="revisions_included" value="${q.revisions_included ?? ''}"></div>
      <div class="field"><label for="qf-xr">Preço por rodada extra</label><input id="qf-xr" class="input mono" data-q="extra_revision_price" ${moneyAttrs(q.extra_revision_price)}></div>
    </div>`;
  const camposCalc = (c) => `
      <div class="panel"><div class="panel-h"><h3>Valor-hora</h3><span class="small muted">hora base e multiplicadores ficam salvos</span></div><div class="panel-b stack">
        <div class="row" style="flex-wrap:wrap;gap:12px;align-items:flex-end">
          <div class="field" style="max-width:180px"><label for="cc-hb">Hora base</label><input id="cc-hb" class="input mono" data-pb="hora" ${moneyAttrs(rates.hora)} ${st.outro ? 'disabled' : ''}></div>
          <label class="check small" style="padding-bottom:8px"><input type="checkbox" data-outro ${st.outro ? 'checked' : ''}> Outro valor-hora</label>
          ${st.outro ? `<div class="field" style="max-width:180px"><label for="cc-cr">Valor-hora deste orçamento</label><input id="cc-cr" class="input mono" data-st="customRate" ${moneyAttrs(st.customRate)}></div>` : ''}
        </div>
        ${st.outro ? '' : [['porte', 'Porte', PORTES], ['mercado', 'Mercado', MERCADOS]].map(([k, lab, lista]) => `<div class="row" style="flex-wrap:wrap;gap:10px"><span class="lbl" style="min-width:70px">${lab}</span><div class="seg">${lista.map(([vv, nome]) => `<button type="button" class="${st[k] === vv ? 'on' : ''}" data-mult="${k}" data-v="${vv}">${nome} <span class="faint">${fmtX(rates[k][vv])}</span></button>`).join('')}</div><label class="small muted">multiplicador <input type="number" step="0.05" min="0" class="input sm" style="width:80px" data-pbm="${k}" value="${rates[k][st[k]]}" aria-label="Multiplicador de ${lab.toLowerCase()}"></label></div>`).join('')}
        <div class="small" data-rate-txt>${calcRateTxt()}</div>
        ${q.client_id && !st.outro ? '<div class="small faint">Porte e mercado ficam guardados para este cliente.</div>' : ''}
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Horas</h3></div><div class="panel-b stack">
        <div class="row" style="flex-wrap:wrap;gap:12px;align-items:flex-end">
          <div class="field" style="max-width:170px"><label for="cc-dur">Duração do vídeo (min)</label><input id="cc-dur" type="number" step="0.5" min="0" class="input" data-st="duracao" value="${st.duracao}" placeholder="não é vídeo"></div>
          <div class="field"><span class="lbl">Complexidade</span><div class="seg">${COMPLEXIDADES.map(([k, nome, m]) => `<button type="button" class="${st.cx === k ? 'on' : ''}" data-cx="${k}">${nome} <span class="faint">${fmtX(m)}</span></button>`).join('')}</div></div>
          <div class="field" style="max-width:260px"><label for="cc-ap">Reuniões de aprovação</label><div class="row" style="flex-wrap:nowrap;gap:6px;align-items:center"><input id="cc-ap" type="number" min="0" class="input" style="width:80px" data-st="aprov" value="${st.aprov}" placeholder="0" aria-label="Quantidade de reuniões"><span class="small muted">×</span><input type="number" min="0" step="0.5" class="input" style="width:80px" data-st="hAprov" value="${st.hAprov ?? 1}" aria-label="Horas por reunião"><span class="small muted">h</span></div></div>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center"><span class="lbl">Modelo</span><div class="seg">${Object.entries(MODELOS).map(([k, mo]) => `<button type="button" class="${st.modelo === k ? 'on' : ''}" data-modelo="${k}">${mo.nome}</button>`).join('')}</div><span class="small faint">preenche as etapas com horas e prazos padrão</span></div>
        <span class="lbl">Etapas${c.dur !== 1 ? ' (horas e dias por minuto de vídeo)' : ''} · viram as tarefas do projeto quando aprovado</span>
        <div class="calc-line calc-head small faint"><span>Etapa</span><span>Tipo</span><span>Horas</span><span>Dias úteis</span><span>Valor</span><span></span></div>
        ${st.lines.map((ln, i) => `<div class="calc-line"><input class="input sm" data-line="${i}" data-k="name" value="${esc(ln.name)}" placeholder="Etapa" aria-label="Etapa"><select class="input sm" data-line="${i}" data-k="wt" aria-label="Tipo">${options(workTypes(), ln.wt, { empty: true, emptyLabel: 'Tipo' })}</select><input type="number" step="0.5" min="0" class="input sm" data-line="${i}" data-k="h" value="${ln.h}" placeholder="Horas" aria-label="Horas"><input type="number" step="0.5" min="0" class="input sm" data-line="${i}" data-k="prazo" value="${ln.prazo ?? ''}" placeholder="${ln.par ? 'paralelo' : 'dias'}" aria-label="Prazo em dias úteis" title="${ln.ap ? 'Termina com aprovação do cliente' : ''}${ln.par ? 'Corre em paralelo com a etapa anterior' : ''}"><span class="small mono muted" data-etv="${i}" title="Valor da etapa (minha parte)">${c.porEtapa[i] ? fmtMoney0(c.porEtapa[i]) : ''}</span><button type="button" class="btn sm icon ghost" data-del="${i}" aria-label="Remover">${icon('x')}</button></div>`).join('')}
        <div class="row between" style="flex-wrap:wrap;gap:8px"><button type="button" class="btn sm" data-add>${icon('plus')} Adicionar etapa</button>
          <label class="small muted">Total das etapas <input type="number" step="0.5" min="0" class="input sm" style="width:90px" data-htot value="${c.hEtapas || ''}" aria-label="Total de horas das etapas" title="Mudar o total espalha a diferença entre as etapas na mesma proporção"> h</label></div>
        <div class="small" data-h-txt>${horasTxt(c)}</div>
        <div class="small">${sugHorasHTML(q.name).replace(/<button type="button" class="btn sm" data-modo="calc">Usar a calculadora<\/button>/, '')}</div>
        ${ratio ? `<div class="subtle-box small">Nos seus ${done.length} projeto(s) concluído(s) com estimativa, as horas reais foram em média <b>${Math.round(ratio * 100)}%</b> do estimado. Com esse histórico, ${fmtH(c.hEtapas * 3600000)} viraria cerca de <b>${fmtH(c.hEtapas * ratio * 3600000)}</b>. <button type="button" class="btn sm" data-adjust>Aplicar ajuste</button></div>` : ''}
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Prazo, desconto e rodadas</h3></div><div class="panel-b stack">
        <div class="row" style="flex-wrap:wrap;gap:12px;align-items:flex-end">
          <div class="field" style="max-width:190px"><label for="cc-pp">Prazo pedido (dias úteis)</label><input id="cc-pp" type="number" min="0" class="input" data-st="pedido" value="${st.pedido}" placeholder="sem pressa"></div>
          <div class="small grow" data-urg-txt style="padding-bottom:8px">${urgTxt(c)}</div>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:12px;align-items:flex-end">
          <div class="field" style="max-width:200px"><label for="cc-ds">Desconto</label><input id="cc-ds" type="number" min="0" step="${st.descTipo === '%' ? 1 : 50}" class="input" data-st="desc" value="${st.desc}" placeholder="0" ${Number(st.alvo) > 0 ? 'disabled' : ''}></div>
          <div class="seg" style="margin-bottom:4px">${['R$', '%'].map(k => `<button type="button" class="${st.descTipo === k ? 'on' : ''}" data-dtipo="${k}">${k}</button>`).join('')}</div>
          <div class="field" style="max-width:150px"><label for="cc-ri">Rodadas incluídas</label><input id="cc-ri" type="number" class="input" data-st="revInc" value="${st.revInc}"></div>
          <div class="field" style="max-width:190px"><label for="cc-re">Preço por rodada extra</label><input id="cc-re" class="input" data-st="revExtra" ${moneyAttrs(st.revExtra)} placeholder="${c.r ? fmtMoney(c.r * 4) : 'R$ 0,00'}"></div>
        </div>
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Nota fiscal, BV e terceirizados</h3></div><div class="panel-b stack">
        <div class="enc-row ${st.nf.on ? '' : 'off'}"><label class="check"><input type="checkbox" data-enc="nf" ${st.nf.on ? 'checked' : ''}> <b>Nota fiscal</b></label>
          <label class="enc-f">Imposto <input type="number" min="0" max="99" step="0.5" class="input sm" data-encp="nf" value="${st.nf.pct}" ${st.nf.on ? '' : 'disabled'} aria-label="Imposto em %"> %</label>
          <label class="check small"><input type="checkbox" data-inside ${st.nf.inside ? 'checked' : ''} ${st.nf.on ? '' : 'disabled'}> Calcular por dentro <span class="faint">(você recebe o valor líquido cheio)</span></label></div>
        <div class="enc-row ${st.bv.on ? '' : 'off'}"><label class="check"><input type="checkbox" data-enc="bv" ${st.bv.on ? 'checked' : ''}> <b>BV</b></label>
          <label class="enc-f">Comissão <input type="number" min="0" max="99" step="0.5" class="input sm" data-encp="bv" value="${st.bv.pct}" ${st.bv.on ? '' : 'disabled'} aria-label="Comissão em %"> %</label><span class="small faint">sobre trabalho + custos extras</span></div>
        <div class="enc-row ${st.ext.on ? '' : 'off'}" style="align-items:flex-start"><label class="check" style="padding-top:5px"><input type="checkbox" data-enc="ext" ${st.ext.on ? 'checked' : ''}> <b>Terceirizado / custo extra</b></label>
          <div class="stack grow" style="gap:6px">${st.ext.items.map((it, i) => `<div class="row" style="flex-wrap:nowrap"><input class="input sm grow" data-ext="${i}" data-k="name" value="${esc(it.name)}" placeholder="Ex.: Locutor" ${st.ext.on ? '' : 'disabled'} aria-label="Descrição"><input class="input sm mono" style="width:150px" data-ext="${i}" data-k="value" ${moneyAttrs(it.value)} placeholder="R$ 0,00" ${st.ext.on ? '' : 'disabled'} aria-label="Valor"><button type="button" class="btn sm icon" data-extadd="${i}" ${st.ext.on ? '' : 'disabled'} aria-label="Adicionar abaixo">${icon('plus')}</button><button type="button" class="btn sm icon" data-extdel="${i}" ${st.ext.on ? '' : 'disabled'} aria-label="Remover">−</button></div>`).join('')}
            <div class="row between small"><span class="muted">Total dos custos extras</span><b class="mono">${fmtMoney0(c.B)}</b></div></div></div>
      </div></div>
      <div class="panel"><div class="panel-b">${calcSummaryHTML(c, st)}</div></div>
      ${parecidosHTML(q.name, st.modelo, c.total, x?.id)}
      <div class="row" style="flex-wrap:wrap;gap:12px;align-items:flex-end"><div class="field" style="max-width:240px"><label for="cc-final">Total final da proposta</label><input id="cc-final" class="input mono" data-st="alvo" ${moneyAttrs(st.alvo)} placeholder="${c.total ? fmtMoney(c.total) : 'R$ 0,00'}"></div>${Number(st.alvo) > 0 ? '<button type="button" class="btn sm" data-limpa-alvo>Voltar ao calculado</button>' : ''}<span class="hint grow" style="padding-bottom:8px">Digitando o total, só a sua parte se ajusta (entre as etapas); terceirizado fica igual e BV e imposto são refeitos.</span></div>`;

  const draw = () => {
    const c = calcQuote(st, rates);
    return `<div class="dh">${icon('doc')}<h2>${x ? esc(x.name) : 'Nova proposta'}</h2><span class="grow"></span>
      <div class="seg">${[['calc', 'Com calculadora'], ['simples', 'Orçamento simplificado']].map(([k, lab]) => `<button type="button" class="${modo === k ? 'on' : ''}" data-modo="${k}">${lab}</button>`).join('')}</div>
      <button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <form class="db" id="qf">
      ${camposTopo()}
      ${modo === 'calc' ? camposCalc(c) : camposSimples()}
      <div class="field"><label for="qf-o">Observações</label><textarea id="qf-o" class="input" data-q="notes">${esc(q.notes)}</textarea></div>
      ${x ? `<div class="stack" style="gap:8px"><span class="lbl">Follow-up</span>
        ${(x.followups || []).length ? `<div class="timeline">${x.followups.map(fu => `<div class="tl"><span class="w">${fmtDate(fu.date)}</span><span class="b"></span><span>${esc(fu.note)}</span></div>`).join('')}</div>` : '<span class="small muted">Nenhum contato registrado.</span>'}
        <div class="row"><input type="date" class="input" style="max-width:170px" id="fu-d" value="${ymd(new Date())}" aria-label="Data do contato"><input class="input grow" id="fu-n" placeholder="O que foi conversado" aria-label="Contato"><button type="button" class="btn" data-x="fu">Registrar contato</button></div></div>` : ''}
      ${modo === 'simples' && x?.calc && !calcDaProposta(x.calc) && x.calc.computed ? `<div class="subtle-box small">Valor calculado na calculadora antiga: <b>${fmtMoney(x.calc.computed)}</b></div>` : ''}
    </form>
    <div class="df">${x ? `<button class="btn danger left" data-x="del">${icon('trash')}</button>` : ''}
      ${linked ? `<button class="btn" data-x="sync-proj">${icon('arrowR')} Atualizar projeto</button><button class="btn" data-x="open-proj">${icon('folder')} Abrir projeto</button>` : x ? `<button class="btn" data-x="convert">${icon('arrowR')} Converter em projeto</button>` : ''}
      ${x ? `<button class="btn" data-x="pdf">${icon('doc')} Proposta em PDF</button>` : ''}
      <button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="save">Salvar</button></div>`;
  };
  const l = openLayer({ wide: true, render: draw });
  l.box.addEventListener('submit', e => e.preventDefault());
  const keyOf = (i) => i && ((i.dataset.q && 'q' + i.dataset.q) || (i.dataset.pb && 'pb') || (i.dataset.pbm && 'pbm' + i.dataset.pbm) || i.dataset.st || i.dataset.encp || (i.dataset.line ? 'l' + i.dataset.line + i.dataset.k : null) || (i.dataset.ext ? 'e' + i.dataset.ext + i.dataset.k : null));
  const redraw = (focusKey) => { const a = document.activeElement; const key = focusKey || keyOf(a); l.refresh(); if (key) { const el = $$('input,select,textarea', l.box).find(i => keyOf(i) === key); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} } } };

  let salvaRates = null;
  const salvar = () => { clearTimeout(salvaRates); salvaRates = setTimeout(() => db.setSetting('precoBase', clone(rates)), 600); };
  const guardaCliente = () => { if (!st.cliente) return; perfis[st.cliente] = { porte: st.porte, mercado: st.mercado }; db.setSetting('clientePreco', { ...perfis }); };
  /* O Safari/app do Mac não dispara "change" em campo de dinheiro (reformatado a cada tecla): o estado é lido no "input". */
  const apply = (t) => {
    if (t.dataset.q) { q[t.dataset.q] = t.dataset.money !== undefined ? moneyVal(t) : t.value; return 'q'; }
    if (t.dataset.pb) { rates.hora = moneyVal(t); salvar(); }
    else if (t.dataset.pbm) { const k = t.dataset.pbm; rates[k][st[k]] = numIn(t.value) ?? 1; salvar(); }
    else if (t.dataset.st) st[t.dataset.st] = t.dataset.money !== undefined ? moneyVal(t) : t.value;
    else if (t.dataset.line) st.lines[t.dataset.line][t.dataset.k] = t.value;
    else if (t.dataset.enc) st[t.dataset.enc].on = t.checked;
    else if (t.dataset.encp) st[t.dataset.encp].pct = numIn(t.value) ?? 0;
    else if (t.hasAttribute('data-inside')) st.nf.inside = t.checked;
    else if (t.dataset.ext) st.ext.items[t.dataset.ext][t.dataset.k] = t.dataset.money !== undefined ? moneyVal(t) : t.value;
    else return false;
    return true;
  };
  // enquanto digita: só os números mudam (o campo continua com o foco)
  l.box.addEventListener('input', (e) => {
    const t = e.target; if (t.type === 'checkbox' || t.tagName === 'SELECT') return;
    const r = apply(t); if (!r || r === 'q' || modo !== 'calc') return;
    const c = calcQuote(st, rates);
    const sum = $('.calc-sum4', l.box); if (sum) sum.outerHTML = calcSummaryHTML(c, st);
    const rt = $('[data-rate-txt]', l.box); if (rt) rt.innerHTML = calcRateTxt();
    const fin = $('#cc-final', l.box); if (fin) fin.placeholder = c.total ? fmtMoney(c.total) : 'R$ 0,00';
    const ht = $('[data-h-txt]', l.box); if (ht) ht.innerHTML = horasTxt(c);
    const ut = $('[data-urg-txt]', l.box); if (ut) ut.innerHTML = urgTxt(c);
    const tot = $('[data-htot]', l.box); if (tot && t !== tot) tot.value = c.hEtapas || '';
    c.porEtapa.forEach((vv, i) => { const el = $(`[data-etv="${i}"]`, l.box); if (el) el.textContent = vv ? fmtMoney0(vv) : ''; });
    const ds = $('#cc-ds', l.box); if (ds) ds.disabled = Number(st.alvo) > 0;
  });
  l.box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.q) { apply(t); return; }
    if (t.hasAttribute('data-outro')) { st.outro = t.checked; redraw(); return; }
    if (t.hasAttribute('data-htot')) { redistribuiHoras(st.lines, numIn(t.value)); redraw(); return; }
    if (t.type === 'checkbox' || t.tagName === 'SELECT') { if (apply(t)) redraw(); }
  });

  const escolheCliente = (id) => {
    q.client_id = id || ''; st.cliente = q.client_id; const pf = perfis[q.client_id];
    if (pf) { st.porte = pf.porte || st.porte; st.mercado = pf.mercado || st.mercado; } else guardaCliente();
    redraw();
  };
  /* Dados da proposta a salvar. Com calculadora: valor, horas e rodadas vêm da conta. */
  const collect = () => {
    const c = db.get('tempo_clients', q.client_id);
    const base = { name: q.name.trim(), client_id: q.client_id || null, agency_id: c?.agency_id || null, status_id: q.status_id, sent_at: q.sent_at || null, valid_until: q.valid_until || null, notes: q.notes };
    if (modo !== 'calc') return { ...base, value: numIn(q.value), est_hours: numIn(q.est_hours), work_type_id: q.work_type_id || null, revisions_included: numIn(q.revisions_included), extra_revision_price: numIn(q.extra_revision_price) };
    const k = calcQuote(st, rates);
    return { ...base, value: Math.round(k.total * 100) / 100, est_hours: Math.round(k.h * 10) / 10, work_type_id: st.lines.map(ln => ln.wt).find(Boolean) || null,
      revisions_included: numIn(st.revInc), extra_revision_price: st.revExtra ?? (k.r ? Math.round(k.r * 4) : null),
      calc: { ...clone(st), cliente: q.client_id || '', computed: Math.round(k.total * 100) / 100, rate: k.r, h: k.h, M: k.M, urg: k.urg, desc: st.desc, descValor: k.desc, mine: k.Mf, B: k.B, C: k.C, D: k.D, horaEf: k.horaEf, total: k.total } };
  };
  /* Proposta aprovada → projeto. Com calculadora: uma tarefa por etapa (horas da etapa nas notas). */
  const criaProjeto = (qid, data) => {
    const won = statusByCat('quote', 'won');
    const p = db.insert('tempo_projects', { name: data.name, client_id: data.client_id, description: data.notes, status_id: statusByCat('work', 'todo').id, payment_status_id: statuses('payment')[0].id, deadline: null, deadline_original: null, budget: data.value, remaining_override: null, estimated_hours: data.est_hours, revisions_included: data.revisions_included, notes: '', archived: false, approved_at: nowISO(), quote_id: qid }, true);
    const k = data.calc ? calcQuote({ ...data.calc }, rates) : null;
    const etapas = data.calc ? data.calc.lines.filter(ln => (ln.name || '').trim() || Number(ln.h)) : [];
    if (etapas.length) etapas.forEach((ln, i) => {
      const h = (Number(ln.h) || 0) * k.dur * k.cx;
      db.insert('tempo_tasks', { project_id: p.id, parent_id: null, name: (ln.name || '').trim() || `Etapa ${i + 1}`, status_id: p.status_id, status_inherited: true, deadline: null, notes: [h ? `Estimado: ${String(Math.round(h * 10) / 10).replace('.', ',')} h` : '', Number(ln.prazo) ? `Prazo: ${String(Math.round(Number(ln.prazo) * k.dur * 10) / 10).replace('.', ',')} dia(s) útil(eis)${ln.ap ? ' + aprovação do cliente' : ''}` : ''].filter(Boolean).join(' · '), order: i, work_type_id: ln.wt || null }, true);
    });
    else if (data.work_type_id) db.insert('tempo_tasks', { project_id: p.id, parent_id: null, name: data.name, status_id: p.status_id, status_inherited: true, deadline: null, notes: '', order: 0, work_type_id: data.work_type_id }, true);
    if (k && k.reun) db.insert('tempo_tasks', { project_id: p.id, parent_id: null, name: 'Reuniões e aprovações', status_id: p.status_id, status_inherited: true, deadline: null, notes: `Estimado: ${k.reun} h (1 h por aprovação)`, order: 99, work_type_id: null }, true);
    logEvent('project', p.id, 'created', `Projeto criado a partir da proposta “${data.name}”${etapas.length ? ` com ${etapas.length} tarefa(s) das etapas` : ''}`); logEvent('project', p.id, 'milestone', 'Aprovação');
    db.update('tempo_quotes', qid, { project_id: p.id, status_id: won?.id || data.status_id }, true);
    return p;
  };
  const textoConverter = (data) => `Cria o projeto <b>${esc(data.name)}</b> para ${esc(db.get('tempo_clients', data.client_id)?.name)} com orçamento ${fmtMoney(data.value) || '—'}, ${data.est_hours || 0} h estimadas e ${data.revisions_included ?? 0} rodadas incluídas${data.calc ? `, com uma tarefa para cada etapa (${data.calc.lines.filter(ln => (ln.name || '').trim() || Number(ln.h)).map(ln => esc(ln.name || 'Etapa')).join(', ')})` : ''}. A proposta fica marcada como aprovada.`;

  l.box.addEventListener('click', async (e) => {
    const cb = e.target.closest('[data-cli-busca]'); if (cb) { openCombo(cb, { kind: 'client', value: q.client_id, onPick: escolheCliente }); return; }
    const md = e.target.closest('[data-modo]'); if (md) { modo = md.dataset.modo; redraw(); return; }
    const mo = e.target.closest('[data-modelo]'); if (mo) {
      const temAlgo = st.lines.some(ln => (ln.name || '').trim() && ln.name !== 'Criação' || Number(ln.h));
      if (temAlgo && !await confirmBox({ title: 'Trocar as etapas pelo modelo?', body: `As etapas atuais são substituídas pelas de <b>${esc(MODELOS[mo.dataset.modelo].nome)}</b>.`, ok: 'Usar o modelo' })) return;
      aplicaModelo(st, mo.dataset.modelo, workTypes()); redraw(); return;
    }
    const cxb = e.target.closest('[data-cx]'); if (cxb) { st.cx = cxb.dataset.cx; redraw(); return; }
    const dt = e.target.closest('[data-dtipo]'); if (dt) { st.descTipo = dt.dataset.dtipo; st.desc = ''; redraw(); return; }
    if (e.target.closest('[data-limpa-alvo]')) { st.alvo = null; redraw(); return; }
    const mb = e.target.closest('[data-mult]'); if (mb) { st[mb.dataset.mult] = mb.dataset.v; guardaCliente(); redraw(); return; }
    if (e.target.closest('[data-add]')) { st.lines.push({ name: '', wt: '', h: '', prazo: '' }); redraw('l' + (st.lines.length - 1) + 'name'); return; }
    const d = e.target.closest('[data-del]'); if (d) { st.lines.splice(Number(d.dataset.del), 1); if (!st.lines.length) st.lines.push({ name: '', wt: '', h: '' }); redraw(); return; }
    const ea = e.target.closest('[data-extadd]'); if (ea) { const i = Number(ea.dataset.extadd) + 1; st.ext.items.splice(i, 0, { name: '', value: null }); redraw('e' + i + 'name'); return; }
    const ed = e.target.closest('[data-extdel]'); if (ed) { st.ext.items.splice(Number(ed.dataset.extdel), 1); if (!st.ext.items.length) st.ext.items.push({ name: '', value: null }); redraw(); return; }
    if (e.target.closest('[data-adjust]')) { st.lines.forEach(ln => { if (ln.h) ln.h = Math.round(Number(ln.h) * ratio * 2) / 2; }); redraw(); return; }
    const b = e.target.closest('[data-x]'); if (!b) return; const k = b.dataset.x;
    if (k === 'newclient') return openPartyForm('client', null, (c) => escolheCliente(c.id));
    if (k === 'use-hint') { if (modo === 'calc') { redistribuiHoras(st.lines, Number(b.dataset.h)); } else q.est_hours = b.dataset.h; redraw(); return; }
    if (k === 'fu') { const n = $('#fu-n', l.box).value.trim(); if (!n) return toast('Escreva o que foi conversado.'); db.update('tempo_quotes', x.id, { followups: [...(x.followups || []), { date: $('#fu-d', l.box).value, note: n }] }); l.close(); openQuote(x.id); toast('Contato registrado'); return; }
    if (k === 'del') { if (!await confirmBox({ title: 'Excluir proposta?', body: esc(x.name), ok: 'Excluir', danger: true })) return; db.remove('tempo_quotes', x.id); l.close(); return; }
    if (k === 'open-proj') { l.close(); openProject(linkedProject(x).id); return; }
    if (k === 'pdf') { const data = collect(); if (!data.name || !data.client_id) return toast('Preencha nome e cliente.'); db.update('tempo_quotes', x.id, { ...data, calc: data.calc ? { ...data.calc, proposta: x.calc?.proposta } : x.calc }, true); l.close(); openPropostaPDF(x.id); return; }
    const data = collect();
    if (!data.name || !data.client_id) return toast('Preencha nome e cliente.');
    if (k === 'sync-proj') {
      const p = linkedProject(x);
      const changes = [];
      if (p.name !== data.name) changes.push(`nome “${esc(p.name)}” → “${esc(data.name)}”`);
      if (p.client_id !== data.client_id) changes.push('cliente');
      if (Number(p.budget || 0) !== Number(data.value || 0)) changes.push(`orçamento ${fmtMoney(data.value) || '—'}`);
      if (Number(p.estimated_hours || 0) !== Number(data.est_hours || 0)) changes.push(`${data.est_hours || 0} h estimadas`);
      if (Number(p.revisions_included || 0) !== Number(data.revisions_included || 0)) changes.push(`${data.revisions_included ?? 0} rodadas incluídas`);
      if (!changes.length) { db.update('tempo_quotes', x.id, data, true); l.close(); toast('O projeto já está igual à proposta'); return; }
      if (!await confirmBox({ title: 'Atualizar projeto?', body: `Atualiza <b>${esc(p.name)}</b> com os dados da proposta: ${changes.join(', ')}. Tarefas, prazos e pagamentos não mudam.`, ok: 'Atualizar projeto' })) return;
      db.update('tempo_quotes', x.id, data, true);
      db.update('tempo_projects', p.id, { name: data.name, client_id: data.client_id, budget: data.value, estimated_hours: data.est_hours, revisions_included: data.revisions_included, description: data.notes }, true);
      logEvent('project', p.id, 'milestone', `Atualizado a partir da proposta: ${changes.join(', ')}`);
      db.emit(); l.close(); toast('Projeto atualizado com a proposta'); openProject(p.id);
      return;
    }
    if (k === 'save') {
      const qid = x ? x.id : db.insert('tempo_quotes', { ...data, followups: [], project_id: null, calc: data.calc || null }, true).id;
      if (x) db.update('tempo_quotes', x.id, data, true);
      // virou aprovada agora e ainda não tem projeto: oferece criar com as tarefas
      if (statusCat(data.status_id) === 'won' && !linkedProject(db.get('tempo_quotes', qid))
        && await confirmBox({ title: 'Proposta aprovada: criar o projeto?', body: textoConverter(data), ok: 'Criar projeto', no: 'Só salvar' })) {
        const p = criaProjeto(qid, data); db.emit(); l.close(); toast('Proposta salva e projeto criado'); openProject(p.id); return;
      }
      db.emit(); l.close(); toast(x ? 'Proposta atualizada' : 'Proposta criada'); if (S.route !== 'quotes') go('quotes');
    }
    if (k === 'convert') {
      if (linkedProject(x)) { toast('Essa proposta já virou projeto. Use “Atualizar projeto”.'); return; }
      db.update('tempo_quotes', x.id, data, true);
      if (!await confirmBox({ title: 'Converter em projeto?', body: textoConverter(data), ok: 'Criar projeto' })) return;
      const p = criaProjeto(x.id, data);
      db.emit(); l.close(); toast('Projeto criado a partir da proposta'); openProject(p.id);
    }
  });
}

/* Comparar antes de mandar: média dos últimos projetos parecidos (mesmas palavras no nome) e propostas do mesmo modelo. */
function parecidosHTML(nome, modelo, valor, qid) {
  const toks = sugWords(nome).filter(w => w.length >= 3);
  const proj = toks.length ? projects().filter(p => Number(p.budget) > 0 && statusCat(p.status_id) !== 'cancelled' && toks.every(t => new Set(sugWords(p.name)).has(t))) : [];
  const props = modelo ? db.all('tempo_quotes').filter(x => x.id !== qid && x.calc?.modelo === modelo && Number(x.value) > 0 && !x.project_id) : [];
  const lista = [...proj.map(p => ({ v: Number(p.budget), d: p.approved_at || p.created_at || '' })), ...props.map(x => ({ v: Number(x.value), d: x.sent_at || x.created_at || '' }))]
    .sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 5);
  if (!lista.length) return '';
  const media = lista.reduce((s2, x) => s2 + x.v, 0) / lista.length;
  const dif = valor && media ? Math.round((valor / media - 1) * 100) : null;
  return `<div class="subtle-box small">Parecidos: últimos ${lista.length} ${proj.length ? 'projeto(s)/proposta(s)' : 'proposta(s) do mesmo modelo'} com média de <b>${fmtMoney0(media)}</b>${dif !== null ? ` · esta: <b>${fmtMoney0(valor)}</b> (${dif > 0 ? '+' : ''}${dif}%)` : ''}.</div>`;
}
/* Sugestão de horas (7.2): média líquida dos projetos com as mesmas palavras no nome (ex.: "ID VISUAL"). */
const sugWords = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
function sugHorasHTML(name) {
  const toks = sugWords(name).filter(w => w.length >= 2);
  let hint = '';
  if (toks.length) {
    const hits = projects().filter(p => { const ws = new Set(sugWords(p.name)); return statusCat(p.status_id) === 'done' && projectMs(p.id) > 0 && toks.every(t => ws.has(t)); });
    if (hits.length) { const avg = hits.reduce((s, p) => s + hours(projectMs(p.id)), 0) / hits.length; hint = `<b>${esc(String(name).trim())}</b> costuma demorar <b>${avg.toFixed(1).replace('.', ',')} h</b> líquidas (média de ${hits.length} projeto(s) parecido(s)). <button type="button" class="btn sm ghost" data-x="use-hint" data-h="${Math.round(avg * 2) / 2}">Usar</button>`; }
  }
  return `<div class="row between small" style="flex-wrap:wrap;gap:8px"><span class="muted">${hint || 'Sem projetos concluídos parecidos para sugerir horas.'}</span><button type="button" class="btn sm" data-modo="calc">Usar a calculadora</button></div>`;
}
/* Resumo da calculadora (a conta está em js/orcamento.js). */
function calcSummaryHTML(c, st) {
  const pct = (v) => c.total ? (v / c.total * 100).toFixed(1).replace('.', ',') + '%' : '—';
  const line = (lab, rate, v, sub, neg) => `<span class="${sub ? 'muted small sub' : ''}">${lab}</span><span class="v muted small">${rate}</span><span class="v">${neg && v ? '− ' : ''}${fmtMoney0(Math.abs(v))}</span><span class="v faint small">${sub ? '' : pct(v)}</span>`;
  const hTxt = `${fmtH(c.hEtapas * 3600000)}${c.dur !== 1 ? ' × ' + fmtX(c.dur) + ' (duração)' : ''}${c.cx !== 1 ? ' × ' + fmtX(c.cx) : ''}${c.reun ? ' + ' + c.reun + ' h reunião' : ''}`;
  return `<div class="calc-sum4">
    <span class="lbl">Item</span><span class="lbl v">Taxa</span><span class="lbl v">Valor</span><span class="lbl v">% do total</span>
    ${line('<b>Minha parte</b>', fmtH(c.h * 3600000) + ' × ' + (fmtMoney(c.r) || 'R$ —') + '/h', c.Mf)}
    ${line('↳ horas', hTxt, c.M, 1)}
    ${c.U ? line('↳ urgência', fmtX(c.urg) + (c.semPrazo ? ' (teto)' : ''), c.U, 1) : ''}
    ${Math.abs(c.desc) > 0.004 ? line(c.desc > 0 ? '↳ desconto' : '↳ acréscimo', Number(st.alvo) > 0 ? 'pelo total' : st.descTipo === '%' ? (st.desc || 0) + '%' : '', c.desc, 1, c.desc > 0) : ''}
    ${line('<b>Terceirizado</b> (custos extras)', st.ext.on ? st.ext.items.filter(x => x.value).length + ' item(ns)' : 'desligado', c.B)}
    ${line('<b>Comissão</b> (BV)', st.bv.on ? (st.bv.pct || 0) + '% de minha parte + terceirizado' : 'desligado', c.C)}
    ${line('<b>Impostos</b> (nota fiscal)', st.nf.on ? (st.nf.pct || 0) + '% ' + (st.nf.inside ? 'por dentro' : 'por fora') : 'sem nota', c.D)}
    <span class="tot">Total da proposta</span><span class="v tot"></span><span class="v tot">${fmtMoney0(c.total)}</span><span class="v tot">100%</span>
    <span class="muted small">Sua hora neste orçamento</span><span></span><span class="v small"><b>${fmtMoney0(c.horaEf)}/h</b></span><span class="v faint small">${c.r && Math.abs(c.horaEf - c.r) > 0.5 ? (c.horaEf < c.r ? '−' : '+') + Math.round(Math.abs(c.horaEf / c.r - 1) * 100) + '%' : ''}</span>
  </div>`;
}
