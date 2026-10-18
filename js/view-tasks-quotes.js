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
  [...tops].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).forEach(t => {
    const subs = subtasksOf(t.id).filter(match);
    if (!match(t) && !subs.length) return;
    rows.push([t, false, match(t)]); subs.forEach(s => rows.push([s, true, true]));
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
    <div class="panel-b tight">${rows.length ? gridTable({ id: 'tasks', cols: TCOLS, rows: rows.map(r => r[0]), sortable: false, rowAttrs: t => `data-act="tk-open" data-p="${t.project_id}"`, rowById: (id) => db.get('tempo_tasks', id) })
      : `<div class="empty">${icon('check')}<b>${db.all('tempo_tasks').length ? 'Nenhuma tarefa com esses filtros' : 'Nenhuma tarefa ainda'}</b><span>Tarefas são criadas dentro de cada projeto.</span><button class="btn primary" data-act="tk-new">${icon('plus')} Nova tarefa</button></div>`}</div>
  </div>`;
  return { title: 'Tarefas', actions: `<button class="btn primary" data-act="tk-new">${icon('plus')} Nova tarefa</button>`, html };
};
const tMs = (t) => t.parent_id ? db.where('tempo_time_entries', e => e.task_id === t.id).reduce((s, e) => s + entryMs(e), 0) : taskMs(t.id);
const TCOLS = {
  name: { label: 'Tarefa', ico: 'text', w: 300, cls: t => 'name' + (t.parent_id ? ' sub' : ''), cell: t => `<span class="cell-name"><span class="ct">${t.parent_id ? '<span class="faint">↳ </span>' : ''}${esc(t.name)} ${t.status_inherited !== false ? '<span class="inh">herdado</span>' : ''}</span>${openBtn('tk-open', t.id, `data-p="${t.project_id}"`)}</span>`, edit: { type: 'text', required: true, get: t => t.name, set: (t, v) => db.update('tempo_tasks', t.id, { name: v }) } },
  project: { label: 'Cliente › Projeto', ico: 'folder', w: 280, cell: t => { const p = db.get('tempo_projects', t.project_id); return `<span class="row" style="gap:6px;flex-wrap:nowrap">${clientTag(clientOf(p))}<span class="muted">${esc(p.name)}</span></span>`; } },
  status: { label: 'Status', ico: 'spin', w: 170, cell: t => statusTag(t.status_id), edit: { type: 'combo', kind: 'work', get: t => t.status_id, set: (t, v) => setTaskStatus(t, v) } },
  deadline: { label: 'Prazo', ico: 'cal', w: 120, cell: t => { const late = t.deadline && t.deadline < ymd(new Date()) && !['done', 'cancelled'].includes(statusCat(t.status_id)); return `<span style="${late ? 'color:var(--danger);font-weight:600' : ''}">${fmtDate(t.deadline)}</span>`; }, edit: { type: 'date', get: t => t.deadline, set: (t, v) => db.update('tempo_tasks', t.id, { deadline: v }) } },
  wt: { label: 'Tipo', ico: 'tag', w: 160, cell: t => wtTag(t.work_type_id || (t.parent_id ? db.get('tempo_tasks', t.parent_id)?.work_type_id : null)), edit: { type: 'combo', kind: 'wt', allowEmpty: true, get: t => t.work_type_id, set: (t, v) => db.update('tempo_tasks', t.id, { work_type_id: v || null }) } },
  hours: { label: 'Horas', ico: 'clock', w: 100, money: true, val: t => t.parent_id ? 0 : tMs(t), fmt: v => fmtDur(v), cell: t => { const ms = tMs(t); return ms ? fmtDur(ms) : ''; } },
  track: { label: '', w: 56, cell: t => `<button class="btn sm icon ghost" data-act="tk-track" data-id="${t.id}" aria-label="Registrar tempo">${icon('play')}</button>` }
};
CHANGES.tk = (el) => { S.task[el.dataset.k] = el.value; render(); };
ACTIONS['tk-set'] = (el) => { S.task[el.dataset.k] = el.dataset.v; render(); };
ACTIONS['tk-open'] = (el) => openProject(el.dataset.p || db.get('tempo_tasks', el.dataset.id)?.project_id, 'tasks');
CHANGES['tk-status'] = (el) => { setTaskStatus(db.get('tempo_tasks', el.dataset.id), el.value); toast('Status da tarefa atualizado'); };
ACTIONS['tk-track'] = (el) => { const t = db.get('tempo_tasks', el.dataset.id); const p = db.get('tempo_projects', t.project_id); const c = clientOf(p); openStartModal({ agency_id: c?.agency_id || '__none', client_id: p.client_id, project_id: p.id, task_id: t.parent_id || t.id, sub_id: t.parent_id ? t.id : '' }); };
ACTIONS['tk-new'] = () => {
  if (!projects().length) return toast('Crie um projeto antes de adicionar tarefas.');
  const l = openLayer({
    html: `<div class="dh"><h2>Nova tarefa</h2></div><form class="db" id="tkf">
      <div class="field"><label for="tkf-p">Projeto *</label><select id="tkf-p" class="input" name="project_id">${options(projects().sort((a, b) => a.name.localeCompare(b.name)), S.task.project, { empty: true, emptyLabel: 'Selecione…', label: p => `${clientOf(p)?.name || ''} · ${p.name}` })}</select></div>
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
    db.insert('tempo_tasks', { project_id: p.id, parent_id: f.parent_id || null, name: f.name.trim(), status_id: p.status_id, status_inherited: true, deadline: f.deadline || null, notes: '', order: 99, work_type_id: f.work_type_id || null }, true);
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
  return { title: 'Orçamentos', actions: `<button class="btn" data-act="calc-open">${icon('calc')} Calculadora</button><button class="btn primary" data-act="qt-new">${icon('plus')} Nova proposta</button>`, html };
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
ACTIONS['calc-open'] = () => openCalculator();

// Projeto ligado à proposta (pelo vínculo da proposta ou pelo quote_id do projeto).
function linkedProject(x) {
  if (!x) return null;
  return (x.project_id && db.get('tempo_projects', x.project_id)) || db.all('tempo_projects').find(p => p.quote_id === x.id) || null;
}
function openQuote(id, preset = {}) {
  const x = id ? db.get('tempo_quotes', id) : null; const v = { ...(x || {}), ...preset };
  const linked = linkedProject(x);
  const l = openLayer({
    wide: true,
    html: `<div class="dh">${icon('doc')}<h2>${x ? esc(x.name) : 'Nova proposta'}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <form class="db" id="qf">
      <div class="grid2">
        <div class="field span2"><label for="qf-n">Nome / escopo *</label><input id="qf-n" class="input" name="name" value="${esc(v.name || '')}"></div>
        <div class="field"><label for="qf-c">Cliente *</label><div class="row" style="flex-wrap:nowrap"><select id="qf-c" class="input" name="client_id">${clientSelectOptions(v.client_id)}</select><button type="button" class="btn" data-x="newclient" aria-label="Novo cliente">${icon('plus')}</button></div></div>
        <div class="field"><label for="qf-s">Status</label><select id="qf-s" class="input" name="status_id">${options(statuses('quote'), v.status_id || statuses('quote')[0]?.id)}</select></div>
        <div class="field"><label for="qf-v">Valor</label><input id="qf-v" class="input mono" name="value" ${moneyAttrs(v.value)}></div>
        <div class="field"><label for="qf-h">Horas estimadas</label><input id="qf-h" type="number" step="0.5" class="input" name="est_hours" value="${v.est_hours ?? ''}"></div>
        <div class="field"><label for="qf-wt">Tipo de trabalho</label><select id="qf-wt" class="input" name="work_type_id">${options(workTypes(), v.work_type_id, { empty: true, emptyLabel: 'Sem tipo' })}</select></div>
        <div class="field"><label for="qf-ri">Rodadas incluídas</label><input id="qf-ri" type="number" min="0" class="input" name="revisions_included" value="${v.revisions_included ?? 2}"></div>
        <div class="field"><label for="qf-sa">Enviado em</label><input id="qf-sa" type="date" class="input" name="sent_at" value="${v.sent_at || ''}"></div>
        <div class="field"><label for="qf-vu">Válido até</label><input id="qf-vu" type="date" class="input" name="valid_until" value="${v.valid_until || ''}"></div>
        <div class="field"><label for="qf-xr">Preço por rodada extra</label><input id="qf-xr" class="input mono" name="extra_revision_price" ${moneyAttrs(v.extra_revision_price)}></div>
        <div class="field span2"><label for="qf-o">Observações</label><textarea id="qf-o" class="input" name="notes">${esc(v.notes || '')}</textarea></div>
      </div>
      ${x ? `<div class="stack" style="gap:8px"><span class="lbl">Follow-up</span>
        ${(x.followups || []).length ? `<div class="timeline">${x.followups.map(fu => `<div class="tl"><span class="w">${fmtDate(fu.date)}</span><span class="b"></span><span>${esc(fu.note)}</span></div>`).join('')}</div>` : '<span class="small muted">Nenhum contato registrado.</span>'}
        <div class="row"><input type="date" class="input" style="max-width:170px" id="fu-d" value="${ymd(new Date())}" aria-label="Data do contato"><input class="input grow" id="fu-n" placeholder="O que foi conversado" aria-label="Contato"><button type="button" class="btn" data-x="fu">Registrar contato</button></div></div>` : ''}
      ${v.calc?.nf ? `<div class="panel"><div class="panel-h"><h3>Composição calculada</h3></div><div class="panel-b">${calcSummaryHTML(v.calc, v.calc)}</div></div>` : ''}
      ${v.calc ? `<div class="subtle-box small">Valor calculado na calculadora: <b>${fmtMoney(v.calc.computed)}</b>${Number(v.value) !== Number(v.calc.computed) ? ` · ajustado manualmente para ${fmtMoney(v.value)}` : ''}</div>` : ''}
    </form>
    <div class="df">${x ? `<button class="btn danger left" data-x="del">${icon('trash')}</button>` : ''}
      ${linked ? `<button class="btn" data-x="sync-proj">${icon('arrowR')} Atualizar projeto</button><button class="btn" data-x="open-proj">${icon('folder')} Abrir projeto</button>` : x ? `<button class="btn" data-x="convert">${icon('arrowR')} Converter em projeto</button>` : ''}
      <button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="save">Salvar</button></div>`
  });
  l.box.addEventListener('submit', e => e.preventDefault());
  const collect = () => { const f = formData($('#qf', l.box)); const c = db.get('tempo_clients', f.client_id); return { name: f.name.trim(), client_id: f.client_id || null, agency_id: c?.agency_id || null, status_id: f.status_id, value: numIn(f.value), est_hours: numIn(f.est_hours), work_type_id: f.work_type_id || null, revisions_included: numIn(f.revisions_included), sent_at: f.sent_at || null, valid_until: f.valid_until || null, extra_revision_price: numIn(f.extra_revision_price), notes: f.notes }; };
  l.box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return; const k = b.dataset.x;
    if (k === 'newclient') return openPartyForm('client', null, (c) => { $('#qf-c', l.box).innerHTML = clientSelectOptions(c.id); });
    if (k === 'fu') { const n = $('#fu-n', l.box).value.trim(); if (!n) return toast('Escreva o que foi conversado.'); db.update('tempo_quotes', x.id, { followups: [...(x.followups || []), { date: $('#fu-d', l.box).value, note: n }] }); l.close(); openQuote(x.id); toast('Contato registrado'); return; }
    if (k === 'del') { if (!await confirmBox({ title: 'Excluir proposta?', body: esc(x.name), ok: 'Excluir', danger: true })) return; db.remove('tempo_quotes', x.id); l.close(); return; }
    if (k === 'open-proj') { l.close(); openProject(linkedProject(x).id); return; }
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
      if (x) db.update('tempo_quotes', x.id, data); else db.insert('tempo_quotes', { ...data, followups: [], project_id: null, calc: preset.calc || null });
      l.close(); toast(x ? 'Proposta atualizada' : 'Proposta criada'); if (S.route !== 'quotes') go('quotes');
    }
    if (k === 'convert') {
      if (linkedProject(x)) { toast('Essa proposta já virou projeto. Use “Atualizar projeto”.'); return; }
      db.update('tempo_quotes', x.id, data, true);
      if (!await confirmBox({ title: 'Converter em projeto?', body: `Cria o projeto <b>${esc(data.name)}</b> para ${esc(db.get('tempo_clients', data.client_id)?.name)} com orçamento ${fmtMoney(data.value) || '—'}, ${data.est_hours || 0} h estimadas e ${data.revisions_included ?? 0} rodadas incluídas. A proposta fica marcada como aprovada.`, ok: 'Criar projeto' })) return;
      const won = statusByCat('quote', 'won');
      const p = db.insert('tempo_projects', { name: data.name, client_id: data.client_id, description: data.notes, status_id: statusByCat('work', 'todo').id, payment_status_id: statuses('payment')[0].id, deadline: null, deadline_original: null, budget: data.value, remaining_override: null, estimated_hours: data.est_hours, revisions_included: data.revisions_included, notes: '', archived: false, approved_at: nowISO(), quote_id: x.id }, true);
      if (data.work_type_id) db.insert('tempo_tasks', { project_id: p.id, parent_id: null, name: data.name, status_id: p.status_id, status_inherited: true, deadline: null, notes: '', order: 0, work_type_id: data.work_type_id }, true);
      logEvent('project', p.id, 'created', `Projeto criado a partir da proposta “${data.name}”`); logEvent('project', p.id, 'milestone', 'Aprovação');
      db.update('tempo_quotes', x.id, { project_id: p.id, status_id: won?.id || data.status_id }, true);
      db.emit(); l.close(); toast('Projeto criado a partir da proposta'); openProject(p.id);
    }
  });
}

/* Cálculo da proposta:
   A = horas × valor-hora + contingência + margem
   B = custos extras (terceirizados)
   C = BV (comissão) sobre A + B
   D = imposto da nota sobre A + B + C (por fora; ou por dentro, se marcado)  */
function calcQuote(st, rates) {
  const r = Number(rates[st.profile]) || 0; const h = st.lines.reduce((s, x) => s + (Number(x.h) || 0), 0);
  const base = h * r; const cont = base * (Number(st.contingency) || 0) / 100; const marg = (base + cont) * (Number(st.margin) || 0) / 100;
  const A = base + cont + marg;
  const B = st.ext.on ? st.ext.items.reduce((s, x) => s + (Number(x.value) || 0), 0) : 0;
  const bvP = st.bv.on ? (Number(st.bv.pct) || 0) / 100 : 0; const C = (A + B) * bvP;
  const nfP = st.nf.on ? (Number(st.nf.pct) || 0) / 100 : 0;
  const pre = A + B + C; const D = !nfP ? 0 : st.nf.inside && nfP < 1 ? pre / (1 - nfP) - pre : pre * nfP;
  return { r, h, base, cont, marg, A, B, C, D, total: A + B + C + D };
}
function calcSummaryHTML(c, st) {
  const pct = (v) => c.total ? (v / c.total * 100).toFixed(1).replace('.', ',') + '%' : '—';
  const line = (lab, rate, v, sub) => `<span class="${sub ? 'muted small sub' : ''}">${lab}</span><span class="v muted small">${rate}</span><span class="v">${fmtMoney0(v)}</span><span class="v faint small">${sub ? '' : pct(v)}</span>`;
  return `<div class="calc-sum4">
    <span class="lbl">Item</span><span class="lbl v">Taxa</span><span class="lbl v">Valor</span><span class="lbl v">% do total</span>
    ${line('<b>A</b> Subtotal do trabalho', fmtH(c.h * 3600000) + ' × ' + (fmtMoney(c.r) || 'R$ —'), c.A)}
    ${line('↳ horas × valor-hora', '', c.base, 1)}${c.cont ? line('↳ contingência', (st.contingency || 0) + '%', c.cont, 1) : ''}${c.marg ? line('↳ margem', (st.margin || 0) + '%', c.marg, 1) : ''}
    ${line('<b>B</b> Custos extras', st.ext.on ? st.ext.items.filter(x => x.value).length + ' item(ns)' : 'desligado', c.B)}
    ${line('<b>C</b> BV (comissão)', st.bv.on ? (st.bv.pct || 0) + '% de A+B' : 'desligado', c.C)}
    ${line('<b>D</b> Imposto (nota fiscal)', st.nf.on ? (st.nf.pct || 0) + '% ' + (st.nf.inside ? 'por dentro' : 'de A+B+C') : 'sem nota', c.D)}
    <span class="tot">Total da proposta</span><span class="v tot"></span><span class="v tot">${fmtMoney0(c.total)}</span><span class="v tot">100%</span>
  </div>`;
}
function openCalculator() {
  const rates = db.setting('rates', { grande: null, medio: null, pequeno: null });
  const st = { profile: 'medio', lines: [{ name: 'Criação', wt: '', h: '' }], margin: '', contingency: '', revInc: 2, revExtra: null, final: null,
    nf: { on: true, pct: 9, inside: false }, bv: { on: false, pct: 10 }, ext: { on: false, items: [{ name: '', value: null }] } };
  const done = projects().filter(p => statusCat(p.status_id) === 'done' && p.estimated_hours && projectMs(p.id));
  const ratio = done.length ? done.reduce((s, p) => s + hours(projectMs(p.id)) / p.estimated_hours, 0) / done.length : null;
  const draw = () => {
    const c = calcQuote(st, rates);
    return `<div class="dh">${icon('calc')}<h2>Calculadora de preços</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db">
      <div class="panel"><div class="panel-h"><h3>Valor-hora por perfil de cliente</h3><span class="small muted">fica salvo nas preferências</span></div><div class="panel-b grid3">
        ${[['grande', 'Grande'], ['medio', 'Médio'], ['pequeno', 'Pequeno']].map(([k, lab]) => `<div class="field"><label for="rt-${k}">${lab} (por hora)</label><input id="rt-${k}" class="input mono" data-rate="${k}" ${moneyAttrs(rates[k])} placeholder="Defina"></div>`).join('')}
      </div></div>
      <div class="row"><span class="lbl">Perfil deste cliente</span><div class="seg">${[['grande', 'Grande'], ['medio', 'Médio'], ['pequeno', 'Pequeno']].map(([k, lab]) => `<button class="${st.profile === k ? 'on' : ''}" data-prof="${k}">${lab}</button>`).join('')}</div>${!rates[st.profile] ? '<span class="small" style="color:var(--warn)">Defina o valor-hora deste perfil.</span>' : ''}</div>
      <div class="stack" style="gap:8px"><span class="lbl">Etapas e horas estimadas</span>
        ${st.lines.map((x, i) => `<div class="calc-line"><input class="input sm" data-line="${i}" data-k="name" value="${esc(x.name)}" placeholder="Etapa" aria-label="Etapa"><select class="input sm" data-line="${i}" data-k="wt" aria-label="Tipo">${options(workTypes(), x.wt, { empty: true, emptyLabel: 'Tipo' })}</select><input type="number" step="0.5" min="0" class="input sm" data-line="${i}" data-k="h" value="${x.h}" placeholder="Horas" aria-label="Horas"><button class="btn sm icon ghost" data-del="${i}" aria-label="Remover">${icon('x')}</button></div>`).join('')}
        <div><button class="btn sm" data-add>${icon('plus')} Adicionar etapa</button></div>
        ${ratio ? `<div class="subtle-box small">Nos seus ${done.length} projeto(s) concluído(s) com estimativa, as horas reais foram em média <b>${Math.round(ratio * 100)}%</b> do estimado. Com esse histórico, ${fmtH(c.h * 3600000)} viraria cerca de <b>${fmtH(c.h * ratio * 3600000)}</b>. <button class="btn sm" data-adjust>Aplicar ajuste</button></div>` : ''}
      </div>
      <div class="grid4">
        <div class="field"><label for="cc-ct">Contingência (%)</label><input id="cc-ct" type="number" class="input" data-st="contingency" value="${st.contingency}" placeholder="0"></div>
        <div class="field"><label for="cc-mg">Margem (%)</label><input id="cc-mg" type="number" class="input" data-st="margin" value="${st.margin}" placeholder="0"></div>
        <div class="field"><label for="cc-ri">Rodadas incluídas</label><input id="cc-ri" type="number" class="input" data-st="revInc" value="${st.revInc}"></div>
        <div class="field"><label for="cc-re">Preço por rodada extra</label><input id="cc-re" class="input" data-st="revExtra" ${moneyAttrs(st.revExtra)} placeholder="${c.r ? fmtMoney(c.r * 4) : 'R$ 0,00'}"></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>Nota fiscal, BV e terceirizados</h3></div><div class="panel-b stack">
        <div class="enc-row ${st.nf.on ? '' : 'off'}"><label class="check"><input type="checkbox" data-enc="nf" ${st.nf.on ? 'checked' : ''}> <b>Nota fiscal</b></label>
          <label class="enc-f">Imposto <input type="number" min="0" max="99" step="0.5" class="input sm" data-encp="nf" value="${st.nf.pct}" ${st.nf.on ? '' : 'disabled'} aria-label="Imposto em %"> %</label>
          <label class="check small"><input type="checkbox" data-inside ${st.nf.inside ? 'checked' : ''} ${st.nf.on ? '' : 'disabled'}> Calcular por dentro <span class="faint">(você recebe o valor líquido cheio)</span></label></div>
        <div class="enc-row ${st.bv.on ? '' : 'off'}"><label class="check"><input type="checkbox" data-enc="bv" ${st.bv.on ? 'checked' : ''}> <b>BV</b></label>
          <label class="enc-f">Comissão <input type="number" min="0" max="99" step="0.5" class="input sm" data-encp="bv" value="${st.bv.pct}" ${st.bv.on ? '' : 'disabled'} aria-label="Comissão em %"> %</label><span class="small faint">sobre trabalho + custos extras</span></div>
        <div class="enc-row ${st.ext.on ? '' : 'off'}" style="align-items:flex-start"><label class="check" style="padding-top:5px"><input type="checkbox" data-enc="ext" ${st.ext.on ? 'checked' : ''}> <b>Terceirizado / custo extra</b></label>
          <div class="stack grow" style="gap:6px">${st.ext.items.map((x, i) => `<div class="row" style="flex-wrap:nowrap"><input class="input sm grow" data-ext="${i}" data-k="name" value="${esc(x.name)}" placeholder="Ex.: Locutor" ${st.ext.on ? '' : 'disabled'} aria-label="Descrição"><input class="input sm mono" style="width:150px" data-ext="${i}" data-k="value" ${moneyAttrs(x.value)} placeholder="R$ 0,00" ${st.ext.on ? '' : 'disabled'} aria-label="Valor"><button class="btn sm icon" data-extadd="${i}" ${st.ext.on ? '' : 'disabled'} aria-label="Adicionar abaixo">${icon('plus')}</button><button class="btn sm icon" data-extdel="${i}" ${st.ext.on ? '' : 'disabled'} aria-label="Remover">−</button></div>`).join('')}
            <div class="row between small"><span class="muted">Total dos custos extras</span><b class="mono">${fmtMoney0(c.B)}</b></div></div></div>
      </div></div>
      <div class="panel"><div class="panel-b">${calcSummaryHTML(c, st)}</div></div>
      <div class="field"><label for="cc-final">Valor final da proposta</label><input id="cc-final" class="input mono" data-st="final" ${moneyAttrs(st.final)} placeholder="${c.total ? fmtMoney(c.total) : 'R$ 0,00'}"><span class="hint">Deixe vazio para usar o total calculado. Se ajustar, os dois valores ficam registrados.</span></div>
    </div>
    <div class="df"><button class="btn" data-act="close-layer">Fechar</button><button class="btn primary" data-make ${c.total || st.final ? '' : 'disabled'}>${icon('doc')} Criar proposta com este valor</button></div>`;
  };
  const l = openLayer({ wide: true, render: draw });
  const keyOf = (i) => i && (i.dataset.rate || i.dataset.st || i.dataset.encp || (i.dataset.line ? 'l' + i.dataset.line + i.dataset.k : null) || (i.dataset.ext ? 'e' + i.dataset.ext + i.dataset.k : null));
  const redraw = (focusKey) => { const a = document.activeElement; const key = focusKey || keyOf(a); l.refresh(); if (key) { const el = $$('input,select', l.box).find(i => keyOf(i) === key); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} } } };
  l.box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.rate) { rates[t.dataset.rate] = moneyVal(t); db.setSetting('rates', { ...rates }); redraw(); }
    else if (t.dataset.st) { st[t.dataset.st] = t.dataset.money !== undefined ? moneyVal(t) : t.value; redraw(); }
    else if (t.dataset.line) { st.lines[t.dataset.line][t.dataset.k] = t.value; redraw(); }
    else if (t.dataset.enc) { st[t.dataset.enc].on = t.checked; redraw(); }
    else if (t.dataset.encp) { st[t.dataset.encp].pct = numIn(t.value) ?? 0; redraw(); }
    else if (t.hasAttribute('data-inside')) { st.nf.inside = t.checked; redraw(); }
    else if (t.dataset.ext) { st.ext.items[t.dataset.ext][t.dataset.k] = t.dataset.money !== undefined ? moneyVal(t) : t.value; redraw(); }
  });
  l.box.addEventListener('click', (e) => {
    const pf = e.target.closest('[data-prof]'); if (pf) { st.profile = pf.dataset.prof; redraw(); return; }
    if (e.target.closest('[data-add]')) { st.lines.push({ name: '', wt: '', h: '' }); redraw('l' + (st.lines.length - 1) + 'name'); return; }
    const d = e.target.closest('[data-del]'); if (d) { st.lines.splice(Number(d.dataset.del), 1); if (!st.lines.length) st.lines.push({ name: '', wt: '', h: '' }); redraw(); return; }
    const ea = e.target.closest('[data-extadd]'); if (ea) { const i = Number(ea.dataset.extadd) + 1; st.ext.items.splice(i, 0, { name: '', value: null }); redraw('e' + i + 'name'); return; }
    const ed = e.target.closest('[data-extdel]'); if (ed) { st.ext.items.splice(Number(ed.dataset.extdel), 1); if (!st.ext.items.length) st.ext.items.push({ name: '', value: null }); redraw(); return; }
    if (e.target.closest('[data-adjust]')) { st.lines.forEach(x => { if (x.h) x.h = Math.round(Number(x.h) * ratio * 2) / 2; }); redraw(); return; }
    if (e.target.closest('[data-make]')) {
      const c = calcQuote(st, rates); const value = st.final ?? Math.round(c.total * 100) / 100;
      const wts = st.lines.map(x => x.wt).filter(Boolean);
      const notes = [st.lines.filter(x => x.h).map(x => `${x.name || 'Etapa'}: ${x.h} h`).join(' · '), st.ext.on ? 'Terceirizados: ' + st.ext.items.filter(x => x.value).map(x => `${x.name || 'custo'} ${fmtMoney(x.value)}`).join(', ') : ''].filter(Boolean).join('\n');
      l.close();
      openQuote(null, { value, est_hours: c.h, revisions_included: numIn(st.revInc), extra_revision_price: st.revExtra, work_type_id: wts[0] || '', notes, calc: { computed: Math.round(c.total * 100) / 100, ...clone(st), rate: c.r, A: c.A, B: c.B, C: c.C, D: c.D, h: c.h, base: c.base, cont: c.cont, marg: c.marg, total: c.total } });
    }
  });
}
