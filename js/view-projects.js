/* =====================================================================
   PROJETOS — tabela (estilo Notion), quadro, lista e calendário
   ===================================================================== */
const projEdit = {
  name: { type: 'text', required: true, get: p => p.name, set: (p, v) => { logEvent('project', p.id, 'rename', `Nome: ${p.name} → ${v}`); db.update('tempo_projects', p.id, { name: v }); } },
  client: { type: 'combo', kind: 'client', get: p => p.client_id, set: (p, v) => COMBO_TARGETS['proj-client'](p.id, v) },
  deadline: { type: 'date', get: p => p.deadline, set: async (p, v) => { if (!p.deadline) return changeDeadline(p, v, ''); const r = await askReason(p.deadline, v); if (r !== null) changeDeadline(p, v, r); } },
  status: { type: 'combo', kind: 'work', get: p => p.status_id, set: (p, v) => setProjectStatus(p, v) },
  pay: { type: 'combo', kind: 'payment', get: p => p.payment_status_id, set: (p, v) => setPaymentStatus(p, v) },
  budget: { type: 'money', get: p => p.budget, set: (p, v) => { logEvent('project', p.id, 'budget', `Orçamento: ${fmtMoney(v) || 'removido'}`); db.update('tempo_projects', p.id, { budget: v }); } },
  remaining: { type: 'money', get: p => p.remaining_override, set: (p, v) => db.update('tempo_projects', p.id, { remaining_override: v }) },
  est: { type: 'number', get: p => p.estimated_hours, set: (p, v) => db.update('tempo_projects', p.id, { estimated_hours: v }) },
  notes: { type: 'text', get: p => p.notes, set: (p, v) => db.update('tempo_projects', p.id, { notes: v }) }
};
const openBtn = (act, id, extra = '') => `<button class="open-btn" data-act="${act}" data-id="${id}" ${extra} title="Abrir">${icon('arrowR')}<span>Abrir</span></button>`;
const PCOLS = {
  agency:   { label: 'Agência', ico: 'spin', w: 150, sort: p => agencyOf(p)?.name || '~', cell: p => agencyTag(agencyOf(p)) },
  client:   { label: 'Cliente', ico: 'users', w: 210, sort: p => clientOf(p)?.name || '', cell: p => clientTag(clientOf(p)), edit: projEdit.client },
  name:     { label: 'Projeto', ico: 'text', w: 300, sort: p => p.name, cell: p => `<span class="cell-name"><span class="ct">${esc(p.name)}</span>${openBtn('proj-open', p.id)}</span>`, cls: 'name', edit: projEdit.name },
  deadline: { label: 'Prazo', ico: 'cal', w: 120, sort: p => p.deadline || '9999', cell: p => deadlineCell(p), edit: projEdit.deadline },
  status:   { label: 'Status', ico: 'spin', w: 160, sort: p => db.get('tempo_status_options', p.status_id)?.order ?? 99, cell: p => statusTag(p.status_id), edit: projEdit.status },
  pay:      { label: 'Pagamento', ico: 'arrowIn', w: 130, sort: p => db.get('tempo_status_options', p.payment_status_id)?.order ?? 99, cell: p => statusTag(p.payment_status_id, false), edit: projEdit.pay },
  budget:   { label: 'Orçamento', ico: 'hash', w: 140, money: true, sort: p => Number(p.budget) || 0, val: p => Number(p.budget) || 0, cell: p => fmtMoney(p.budget), edit: projEdit.budget },
  remaining:{ label: 'Valor restante', ico: 'hash', w: 140, money: true, sort: p => remainingOf(p) || 0, val: p => remainingOf(p) || 0, cell: p => { const r = remainingOf(p); return r ? fmtMoney(r) : ''; }, edit: projEdit.remaining },
  paid:     { label: 'Valor pago', ico: 'hash', w: 140, money: true, sort: p => paidOf(p), val: p => paidOf(p), cell: p => { const v = paidOf(p); return v ? fmtMoney(v) : ''; } },
  hours:    { label: 'Horas', ico: 'clock', w: 100, money: true, sort: p => projectMs(p.id), val: p => projectMs(p.id), cell: p => { const ms = projectMs(p.id); return ms ? fmtH(ms) : ''; }, fmt: v => fmtH(v) },
  est:      { label: 'Horas estimadas', ico: 'clock', w: 120, money: true, sort: p => Number(p.estimated_hours) || 0, val: p => (Number(p.estimated_hours) || 0) * 3600000, cell: p => p.estimated_hours ? fmtH(p.estimated_hours * 3600000) : '', fmt: v => fmtH(v), edit: projEdit.est },
  rate:     { label: 'R$/hora efetivo', ico: 'hash', w: 130, money: true, sort: p => effectiveRate(p) || 0, cell: p => { const r = effectiveRate(p); return r ? fmtMoney(r) : ''; } },
  notes:    { label: 'Observação', ico: 'text', w: 260, sort: p => p.notes || '', cell: p => esc(p.notes || ''), cls: 'obs', edit: projEdit.notes },
  created:  { label: 'Criado em', ico: 'cal', w: 110, sort: p => p.created_at, cell: p => fmtDate(p.created_at) }
};
const DEFAULT_PHIDDEN = ['hours','est','rate','created'];
function deadlineCell(p) {
  if (!p.deadline) return '';
  const done = ['done', 'cancelled'].includes(statusCat(p.status_id));
  const d = daysBetween(ymd(new Date()), p.deadline);
  const late = !done && d < 0; const soon = !done && d >= 0 && d <= 3;
  const n = deadlineChanges(p.id).length;
  return `<span class="nowrap ${late ? '' : ''}" style="${late ? 'color:var(--danger);font-weight:600' : soon ? 'color:var(--warn);font-weight:600' : ''}">${fmtDate(p.deadline)}</span>${n ? ` <span class="inh" title="${n} adiamento(s)">+${n}</span>` : ''}`;
}
const refDate = (p) => p.deadline || ymd(p.created_at);

function filterProjects(f) {
  const q = (f.q || '').toLowerCase().trim();
  return projects().filter(p => {
    const c = clientOf(p), a = agencyOf(p);
    if (q && ![p.name, c?.name, a?.name, p.notes].some(x => (x || '').toLowerCase().includes(q))) return false;
    if (f.agency && (f.agency === '__none' ? a : a?.id !== f.agency)) return false;
    if (f.client && p.client_id !== f.client) return false;
    if (f.status && p.status_id !== f.status) return false;
    if (f.pay && p.payment_status_id !== f.pay) return false;
    if (f.wt && !db.all('tempo_time_entries').some(e => e.project_id === p.id && e.work_type_id === f.wt) && !db.all('tempo_tasks').some(t => t.project_id === p.id && t.work_type_id === f.wt)) return false;
    const rd = refDate(p);
    if (f.year && rd.slice(0, 4) !== f.year) return false;
    if (f.month && rd.slice(5, 7) !== f.month) return false;
    if (f.from && rd < f.from) return false;
    if (f.to && rd > f.to) return false;
    if (f.situ === 'active' && ['done', 'cancelled'].includes(statusCat(p.status_id))) return false;
    if (f.situ === 'done' && statusCat(p.status_id) !== 'done') return false;
    return true;
  });
}
function years() { const s = new Set(projects().map(p => refDate(p).slice(0, 4))); s.add(String(new Date().getFullYear())); return [...s].sort().reverse(); }

/* barra de filtros compartilhada (Projetos e Financeiro) */
function filterBar(f, ns, { situ = false, extra = '' } = {}) {
  const active = ['agency', 'client', 'status', 'pay', 'wt', 'year', 'month', 'from', 'to'].filter(k => f[k]).length + (f.q ? 1 : 0);
  return `<div class="filters ${S.fltOpen?.[ns] ? 'open' : ''}">
    ${'q' in f ? `<input id="${ns}-q" class="input search" placeholder="Buscar projeto, cliente ou agência" value="${esc(f.q)}" data-input="flt" data-ns="${ns}" data-k="q">` : ''}
    <div class="flt-wrap"><button class="btn sm flt-toggle" data-act="flt-toggle" data-ns="${ns}" aria-expanded="${S.fltOpen?.[ns] ? 'true' : 'false'}">${icon('sort')} Filtros${active ? ` (${active})` : ''}</button>
    <div class="flt-more">
    ${situ ? `<div class="seg">${[['all', 'Todos'], ['active', 'Ativos'], ['done', 'Concluídos']].map(([v, l]) => `<button class="${f.situ === v ? 'on' : ''}" data-act="flt-set" data-ns="${ns}" data-k="situ" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
    <select id="${ns}-agency" class="input" data-on="flt" data-ns="${ns}" data-k="agency" aria-label="Agência">${options(agencies(), f.agency, { empty: true, emptyLabel: 'Todas as agências' })}<option value="__none" ${f.agency === '__none' ? 'selected' : ''}>Sem agência (direto)</option></select>
    <select id="${ns}-client" class="input" data-on="flt" data-ns="${ns}" data-k="client" aria-label="Cliente">${options(f.agency ? clients(f.agency) : clients(), f.client, { empty: true, emptyLabel: 'Todos os clientes' })}</select>
    <select id="${ns}-status" class="input" data-on="flt" data-ns="${ns}" data-k="status" aria-label="Status">${options(statuses('work'), f.status, { empty: true, emptyLabel: 'Todos os status' })}</select>
    <select id="${ns}-pay" class="input" data-on="flt" data-ns="${ns}" data-k="pay" aria-label="Pagamento">${options(statuses('payment'), f.pay, { empty: true, emptyLabel: 'Todo pagamento' })}</select>
    ${'wt' in f ? `<select id="${ns}-wt" class="input" data-on="flt" data-ns="${ns}" data-k="wt" aria-label="Tipo de trabalho">${options(workTypes(), f.wt, { empty: true, emptyLabel: 'Todos os tipos' })}</select>` : ''}
    <select id="${ns}-year" class="input" style="min-width:96px" data-on="flt" data-ns="${ns}" data-k="year" aria-label="Ano">${options(years().map(y => ({ id: y, name: y })), f.year, { empty: true, emptyLabel: 'Ano' })}</select>
    <select id="${ns}-month" class="input" style="min-width:110px" data-on="flt" data-ns="${ns}" data-k="month" aria-label="Mês">${options(MONTHS.map((m, i) => ({ id: pad(i + 1), name: m[0].toUpperCase() + m.slice(1) })), f.month, { empty: true, emptyLabel: 'Mês' })}</select>
    <span class="row" style="gap:4px"><input id="${ns}-from" type="date" class="input" style="min-width:0;width:140px" value="${f.from}" data-on="flt" data-ns="${ns}" data-k="from" aria-label="De"><span class="faint">–</span><input id="${ns}-to" type="date" class="input" style="min-width:0;width:140px" value="${f.to}" data-on="flt" data-ns="${ns}" data-k="to" aria-label="Até"></span>
    ${active ? `<button class="btn sm ghost" data-act="flt-clear" data-ns="${ns}">${icon('x')} Limpar filtros (${active})</button>` : ''}
    </div></div>
    ${extra}
  </div>`;
}
const fltState = (ns) => ({ proj: S.proj, fin: S.fin })[ns];
CHANGES.flt = (el) => { const f = fltState(el.dataset.ns); f[el.dataset.k] = el.value; if (el.dataset.k === 'agency') f.client = ''; render(); };
ACTIONS['flt-toggle'] = (el) => { S.fltOpen = S.fltOpen || {}; S.fltOpen[el.dataset.ns] = !S.fltOpen[el.dataset.ns]; render(); };
document.addEventListener('mousedown', (e) => {
  if (!S.fltOpen || !Object.values(S.fltOpen).some(Boolean)) return;
  if (e.target.closest?.('.filters')) return;
  S.fltOpen = {}; render();
});
ACTIONS['flt-set'] = (el) => { fltState(el.dataset.ns)[el.dataset.k] = el.dataset.v; render(); };
ACTIONS['flt-clear'] = (el) => { const f = fltState(el.dataset.ns); ['q', 'agency', 'client', 'status', 'pay', 'wt', 'year', 'month', 'from', 'to'].forEach(k => { if (k in f) f[k] = ''; }); render(); };

VIEWS.projects = () => {
  const f = S.proj;
  const list = filterProjects(f);
  const views = [['table', 'Tabela', 'table'], ['board', 'Quadro', 'board'], ['list', 'Lista', 'list'], ['cal', 'Calendário', 'cal']];
  let body = '';
  if (!projects().length) body = `<div class="empty">${icon('folder')}<b>Nenhum projeto ainda</b><span>Cadastre um projeto ou importe sua base do Notion.</span><div class="row"><button class="btn primary" data-act="proj-new">${icon('plus')} Novo projeto</button><button class="btn" data-act="go" data-route="import">${icon('upload')} Importar do Notion</button></div></div>`;
  else if (f.view === 'table') body = projectTable(list);
  else if (f.view === 'board') body = projectBoard(list);
  else if (f.view === 'list') body = projectList(list);
  else body = projectCalendar(list);
  const html = `<div class="panel">
    <div class="panel-h"><div class="seg" role="tablist">${views.map(([v, l, i]) => `<button class="${f.view === v ? 'on' : ''}" data-act="proj-view" data-v="${v}" role="tab">${icon(i)}<span>${l}</span></button>`).join('')}</div>
    <span class="grow"></span>${f.view === 'table' ? colsBtn('projects') : ''}</div>
    ${filterBar(f, 'proj', { situ: true })}
    <div class="panel-b tight">${body}</div>
  </div>`;
  return { title: 'Projetos', actions: `<button class="btn primary" data-act="proj-new">${icon('plus')} Novo projeto</button>`, html };
};
ACTIONS['proj-view'] = (el) => { S.proj.view = el.dataset.v; render(); };

function projectTable(list) {
  if (!list.length) return `<div class="empty">${icon('search')}<b>Nenhum projeto com esses filtros</b><button class="btn sm" data-act="flt-clear" data-ns="proj">Limpar filtros</button></div>`;
  return gridTable({ id: 'projects', cols: PCOLS, rows: list, defHidden: DEFAULT_PHIDDEN, defSort: { key: 'deadline', dir: 1 }, rowAttrs: p => `data-act="proj-open" data-id="${p.id}"`, rowById: (id) => db.get('tempo_projects', id) });
}
ACTIONS['proj-open'] = (el) => openProject(el.dataset.id);
function projectBoard(list) {
  return `<div class="kanban">${statuses('work').map(s => {
    const items = list.filter(p => p.status_id === s.id);
    return `<div class="kcol" data-status="${s.id}"><div class="kcol-h">${tag(s.name, s.color, { pill: true })}<span class="faint mono small">${items.length}</span></div>
      <div class="kcol-b">${items.map(p => {
        const tk = db.where('tempo_tasks', t => t.project_id === p.id); const dn = tk.filter(t => statusCat(t.status_id) === 'done').length;
        return `<div class="kcard" draggable="true" data-id="${p.id}" data-act="proj-open">
          <div class="row" style="gap:6px">${clientTag(clientOf(p))}</div>
          <div class="t">${esc(p.name)}</div>
          <div class="m">${p.deadline ? `<span class="row" style="gap:4px">${icon('cal', 'ico')}${deadlineCell(p)}</span>` : ''}${statusTag(p.payment_status_id, false)}${tk.length ? `<span>${dn}/${tk.length} tarefas</span>` : ''}</div>
          <div class="m"><span class="mono">${fmtMoney(p.budget) || ''}</span><span class="grow"></span><span class="mono">${projectMs(p.id) ? fmtH(projectMs(p.id)) : ''}</span></div>
          <select class="input sm move" data-on="kan-move" data-id="${p.id}" aria-label="Mover para">${options(statuses('work'), p.status_id)}</select>
        </div>`;
      }).join('')}</div></div>`;
  }).join('')}</div>`;
}
CHANGES['kan-move'] = (el) => { const p = db.get('tempo_projects', el.dataset.id); setProjectStatus(p, el.value); toast(`Movido para ${statusName(el.value)}`); };
document.addEventListener('dragstart', (e) => { const c = e.target.closest?.('.kcard'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); });
document.addEventListener('dragend', (e) => { e.target.closest?.('.kcard')?.classList.remove('dragging'); $$('.kcol.drop').forEach(x => x.classList.remove('drop')); });
document.addEventListener('dragover', (e) => { const col = e.target.closest?.('.kcol'); if (!col) return; e.preventDefault(); $$('.kcol.drop').forEach(x => x !== col && x.classList.remove('drop')); col.classList.add('drop'); });
document.addEventListener('drop', (e) => {
  const col = e.target.closest?.('.kcol'); if (!col) return; e.preventDefault();
  const id = e.dataTransfer.getData('text/plain'); const p = db.get('tempo_projects', id); if (!p) return;
  if (p.status_id !== col.dataset.status) { setProjectStatus(p, col.dataset.status); toast(`“${esc(p.name)}” → ${statusName(col.dataset.status)}`); }
});

function projectList(list) {
  if (!list.length) return `<div class="empty">${icon('search')}<b>Nenhum projeto com esses filtros</b></div>`;
  return `<div class="list">${[...list].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).map(p => `
    <div class="li" data-act="proj-open" data-id="${p.id}">
      <div class="grow"><div class="meta">${clientTag(clientOf(p))}</div><div class="t" style="margin-top:2px">${esc(p.name)}</div></div>
      <div class="meta">${statusTag(p.status_id)}${statusTag(p.payment_status_id, false)}${p.deadline ? `<span class="row" style="gap:4px">${icon('cal', 'ico')}${deadlineCell(p)}</span>` : ''}<span class="mono" style="min-width:96px;text-align:right">${fmtMoney(p.budget) || '—'}</span></div>
    </div>`).join('')}</div>`;
}

function projectCalendar(list) {
  const f = S.proj; const base = f.calMonth ? parseYmd(f.calMonth) : new Date(); base.setDate(1);
  const start = new Date(base); start.setDate(1 - ((base.getDay() + 6) % 7));
  const ids = new Set(list.map(p => p.id)); const ev = {};
  const add = (d, html) => { if (!d) return; const k = typeof d === 'string' && d.length === 10 ? d : ymd(d); (ev[k] ||= []).push(html); };
  list.forEach(p => {
    const col = db.get('tempo_status_options', p.status_id)?.color || 'gray';
    add(p.deadline, `<button class="ev tg" style="--tb:${hexOf(col)}" data-act="proj-open" data-id="${p.id}" title="Prazo: ${esc(p.name)}">⏱ ${esc(p.name)}</button>`);
    if (p.deadline_original && p.deadline_original !== p.deadline) add(p.deadline_original, `<button class="ev c-gray" style="text-decoration:line-through" data-act="proj-open" data-id="${p.id}" title="Prazo original: ${esc(p.name)}">${esc(p.name)}</button>`);
    if (p.sent_at) add(p.sent_at, `<button class="ev c-purple" data-act="proj-open" data-id="${p.id}" title="Entrega: ${esc(p.name)}">↗ ${esc(p.name)}</button>`);
  });
  db.all('tempo_tasks').forEach(t => { if (t.deadline && ids.has(t.project_id)) add(t.deadline, `<button class="ev c-blue" data-act="proj-open" data-id="${t.project_id}" title="Tarefa: ${esc(t.name)}">☐ ${esc(t.name)}</button>`); });
  db.all('tempo_payments').forEach(x => { if (x.date && ids.has(x.project_id)) add(x.date, `<button class="ev c-green" data-act="proj-open" data-id="${x.project_id}" title="Pagamento ${fmtMoney(x.amount)}">R$ ${esc(db.get('tempo_projects', x.project_id)?.name)}</button>`); });
  const days = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const prev = new Date(base); prev.setMonth(prev.getMonth() - 1); const next = new Date(base); next.setMonth(next.getMonth() + 1);
  return `<div class="row" style="padding:12px 16px"><button class="btn sm icon" data-act="cal-go" data-m="${ymd(prev)}" aria-label="Mês anterior">${icon('chevL')}</button><b style="min-width:150px;text-align:center">${MONTHS[base.getMonth()][0].toUpperCase() + MONTHS[base.getMonth()].slice(1)} ${base.getFullYear()}</b><button class="btn sm icon" data-act="cal-go" data-m="${ymd(next)}" aria-label="Próximo mês">${icon('chevR')}</button><button class="btn sm" data-act="cal-go" data-m="">Hoje</button>
    <span class="grow"></span><span class="row small muted" style="gap:10px"><span>⏱ prazo</span><span>↗ entrega</span><span>☐ tarefa</span><span>R$ pagamento</span></span></div>
  <div class="table-wrap"><div class="cal" style="min-width:640px">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<div class="dow">${d}</div>`).join('')}
    ${days.map(d => `<div class="day ${d.getMonth() !== base.getMonth() ? 'out' : ''} ${isToday(d) ? 'today' : ''}"><span class="d">${d.getDate()}</span>${(ev[ymd(d)] || []).join('')}</div>`).join('')}</div></div>`;
}
ACTIONS['cal-go'] = (el) => { S.proj.calMonth = el.dataset.m || null; render(); };

/* ---------- novo projeto ---------- */
function clientSelectOptions(selected) {
  let h = '<option value="">Selecione o cliente…</option>';
  agencies().forEach(a => { const cs = clients(a.id); if (cs.length) h += `<optgroup label="${esc(a.name)}">${options(cs, selected)}</optgroup>`; });
  const d = clients('__none'); if (d.length) h += `<optgroup label="Clientes diretos">${options(d, selected)}</optgroup>`;
  return h;
}
ACTIONS['proj-new'] = (el) => openProjectForm(null, el?.dataset?.client);
function openProjectForm(id, clientId) {
  const p = id ? db.get('tempo_projects', id) : null;
  const l = openLayer({
    html: `<div class="dh"><h2>${p ? 'Editar projeto' : 'Novo projeto'}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <form class="db" id="pf">
      <div class="field"><label for="pf-name">Nome do projeto *</label><input id="pf-name" class="input" name="name" required value="${esc(p?.name || '')}" autofocus></div>
      <div class="field"><label for="pf-client">Cliente *</label><div class="row" style="flex-wrap:nowrap"><select id="pf-client" class="input" name="client_id" required>${clientSelectOptions(p?.client_id || clientId)}</select><button type="button" class="btn" data-x="newclient">${icon('plus')} Cliente</button></div><span class="hint">A agência vem do cadastro do cliente.</span></div>
      <div class="grid2">
        <div class="field"><label for="pf-st">Status</label><select id="pf-st" class="input" name="status_id">${options(statuses('work'), p?.status_id || statusByCat('work', 'todo')?.id)}</select></div>
        <div class="field"><label for="pf-pay">Pagamento</label><select id="pf-pay" class="input" name="payment_status_id">${options(statuses('payment'), p?.payment_status_id || statuses('payment')[0]?.id)}</select></div>
        <div class="field"><label for="pf-dl">Prazo</label><input id="pf-dl" type="date" class="input" name="deadline" value="${p?.deadline || ''}"></div>
        <div class="field"><label for="pf-est">Horas estimadas</label><input id="pf-est" type="number" min="0" step="0.5" class="input" name="estimated_hours" value="${p?.estimated_hours ?? ''}"></div>
        <div class="field"><label for="pf-bud">Orçamento</label><input id="pf-bud" class="input mono" name="budget" ${moneyAttrs(p?.budget)}></div>
        <div class="field"><label for="pf-rev">Rodadas de ajuste incluídas</label><input id="pf-rev" type="number" min="0" step="1" class="input" name="revisions_included" value="${p?.revisions_included ?? 2}"></div>
      </div>
      <div class="field"><label for="pf-obs">Observação</label><input id="pf-obs" class="input" name="notes" value="${esc(p?.notes || '')}" placeholder="Acordos, parcelas, valor líquido…"></div>
      <div class="field"><label for="pf-desc">Descrição</label><textarea id="pf-desc" class="input" name="description">${esc(p?.description || '')}</textarea></div>
    </form>
    <div class="df"><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="save">${p ? 'Salvar' : 'Criar projeto'}</button></div>`
  });
  l.box.addEventListener('submit', (e) => e.preventDefault());
  l.box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'newclient') { openPartyForm('client', null, (c) => { $('#pf-client', l.box).innerHTML = clientSelectOptions(c.id); }); return; }
    const f = formData($('#pf', l.box));
    if (!f.name.trim()) return toast('Dê um nome ao projeto.');
    if (!f.client_id) return toast('Escolha o cliente.');
    const data = { name: f.name.trim(), client_id: f.client_id, budget: numIn(f.budget), estimated_hours: numIn(f.estimated_hours), revisions_included: numIn(f.revisions_included), notes: f.notes, description: f.description };
    if (p) {
      db.update('tempo_projects', p.id, data, true);
      if (f.status_id !== p.status_id) setProjectStatus(p, f.status_id);
      if (f.payment_status_id !== p.payment_status_id) setPaymentStatus(p, f.payment_status_id);
      if ((f.deadline || '') !== (p.deadline || '')) changeDeadline(p, f.deadline, 'Editado no formulário');
      db.emit(); toast('Projeto atualizado');
    } else {
      const np = db.insert('tempo_projects', { ...data, status_id: f.status_id, payment_status_id: f.payment_status_id, deadline: f.deadline || null, deadline_original: f.deadline || null, remaining_override: null, archived: false }, true);
      logEvent('project', np.id, 'created', 'Projeto criado');
      if (statusCat(f.status_id) === 'active') db.update('tempo_projects', np.id, { started_at: nowISO() }, true);
      db.emit(); toast('Projeto criado'); l.close(); openProject(np.id); return;
    }
    l.close();
  });
}
