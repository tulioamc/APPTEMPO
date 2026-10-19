/* =====================================================================
   DETALHE DO PROJETO (gaveta lateral)
   ===================================================================== */
function openProject(id, tab = 'time') {
  const st = { tab };
  const l = openLayer({
    kind: 'drawer',
    render: () => projectDrawer(id, st),
    onMount: (ly) => bindProjectDrawer(ly, id, st)
  });
  l.live = true;
  return l;
}
function projectDrawer(id, st) {
  const p = db.get('tempo_projects', id);
  if (!p) return `<div class="dh"><h2>Projeto removido</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer">${icon('x')}</button></div>`;
  const a = agencyOf(p), c = clientOf(p);
  const tabs = [['time', 'Tempo'], ['overview', 'Visão geral'], ['tasks', `Tarefas (${db.where('tempo_tasks', t => t.project_id === id).length})`], ['revisions', `Revisões (${db.where('tempo_revisions', r => r.project_id === id).length})`], ['finance', 'Financeiro'], ['history', 'Histórico']];
  const body = { overview: pdOverview, tasks: pdTasks, time: pdTime, revisions: pdRevisions, finance: pdFinance, history: pdHistory }[st.tab](p);
  return `<div class="dh"><div class="grow"><div class="row small" style="gap:6px">${agencyTag(a)}${comboBtn('client', p.client_id, 'proj-client', p.id)}</div><h2 style="margin-top:4px">${esc(p.name)}</h2></div>
    <button class="btn sm" data-x="track">${icon('play')} Registrar tempo</button><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
  <div class="tabs" role="tablist">${tabs.map(([k, lab]) => `<button class="${st.tab === k ? 'on' : ''}" data-tab="${k}" role="tab">${lab}</button>`).join('')}</div>
  <div class="db">${body}</div>
  <div class="df"><button class="btn danger left" data-x="del-project">${icon('trash')} Excluir</button><button class="btn" data-x="archive">${p.archived ? 'Desarquivar' : 'Arquivar'}</button><button class="btn" data-x="edit-project">${icon('edit')} Editar dados</button></div>`;
}

function pdOverview(p) {
  const ms = projectMs(p.id), est = (Number(p.estimated_hours) || 0) * 3600000, rate = effectiveRate(p);
  const changes = deadlineChanges(p.id); const del = deliveryInfo(p);
  const revs = db.where('tempo_revisions', r => r.project_id === p.id).length;
  return `<div class="kpis">
    <div class="kpi"><span class="k">Horas reais</span><span class="v">${fmtH(ms)}</span><span class="s">${est ? `de ${fmtH(est)} estimadas · ${Math.round(ms / est * 100)}%` : 'sem estimativa'}</span></div>
    <div class="kpi"><span class="k">R$/hora efetivo</span><span class="v">${rate ? fmtMoney(rate) : '—'}</span><span class="s">orçamento ÷ horas reais</span></div>
    <div class="kpi"><span class="k">Recebido</span><span class="v">${fmtMoney0(paidOf(p))}</span><span class="s">${p.budget ? 'de ' + fmtMoney(p.budget) : 'sem orçamento'}</span></div>
    <div class="kpi"><span class="k">Revisões</span><span class="v">${revs}</span><span class="s">${p.revisions_included ?? 0} incluídas${revs > (p.revisions_included ?? 0) ? ` · <b style="color:var(--warn)">${revs - (p.revisions_included ?? 0)} extra</b>` : ''}</span></div>
  </div>
  <div class="props">
    <span class="k">Status</span><div>${comboBtn('work', p.status_id, 'proj-status', p.id)} <span class="small faint">propaga para tarefas que herdam</span></div>
    <span class="k">Pagamento</span><div>${comboBtn('payment', p.payment_status_id, 'proj-pay', p.id)}</div>
    <span class="k">Prazo atual</span><div class="row"><input type="date" class="input sm" style="width:auto" value="${p.deadline || ''}" data-pd="deadline"> ${deadlineCell(p)}</div>
    <span class="k">Prazo original</span><div class="row"><input type="date" class="input sm" style="width:auto" value="${p.deadline_original || ''}" data-pd="orig" aria-label="Prazo original"> ${changes.length ? `<span class="small muted">· ${changes.length} adiamento(s)</span>` : ''}</div>
    <span class="k">Entrega</span><div>${p.sent_at ? fmtDateTime(p.sent_at) : '—'} ${del ? (del.late ? `<span class="tag c-red">${del.days} dia(s) de atraso</span>` : `<span class="tag c-green">no prazo</span>`) : ''}</div>
    <span class="k">Observação</span><div class="muted">${esc(p.notes || '—')}</div>
    ${p.description ? `<span class="k">Descrição</span><div class="muted">${esc(p.description)}</div>` : ''}
  </div>
  ${changes.length ? `<div class="stack" style="gap:6px"><span class="lbl">Alterações de prazo</span><div class="timeline">${changes.map(d => `<div class="tl"><span class="w">${fmtDate(d.at)}</span><span class="b"></span><span>${fmtDate(d.from)} → <b>${d.to ? fmtDate(d.to) : 'sem prazo'}</b>${d.reason ? ` <span class="muted">— ${esc(d.reason)}</span>` : ''} <button class="btn sm icon ghost" data-x="del-change" data-id="${d.id}" aria-label="Apagar alteração" title="Apagar esta alteração do histórico">${icon('trash')}</button></span></div>`).join('')}</div></div>` : ''}
  <div class="panel"><div class="panel-h"><h3>Marcos do projeto</h3></div><div class="panel-b stack">
    <div class="grid2">${MILESTONES.map(([k, lab]) => `<div class="field"><label for="ms-${k}">${lab}</label><input id="ms-${k}" type="datetime-local" class="input sm" value="${toLocalInput(p[k])}" data-pd="ms" data-k="${k}"></div>`).join('')}</div>
    <div class="stack" style="gap:4px"><span class="lbl">Intervalos entre etapas</span>
      ${INTERVALS.map(([x, y, lab]) => { const d = daysBetween(p[x], p[y]); return `<div class="row between small"><span class="muted">${lab}</span><span class="mono">${d === null ? '—' : d + ' dia(s)'}</span></div>`; }).join('')}
    </div>
  </div></div>`;
}

function pdTasks(p) {
  const tks = tasksOf(p.id);
  const row = (t, isSub) => `<div class="task-row ${isSub ? 'sub' : ''}">
    <input class="input sm n" value="${esc(t.name)}" data-pd="tname" data-id="${t.id}" aria-label="Nome">
    ${comboBtn('work', t.status_id, 'task-status', t.id)}
    ${t.status_inherited !== false ? '<span class="inh" title="Acompanha o status do projeto">herdado</span>' : `<button class="btn sm ghost" data-x="inherit" data-id="${t.id}" title="Voltar a acompanhar o status do projeto">${icon('undo')} herdar</button>`}
    ${!isSub ? comboBtn('wt', t.work_type_id, 'task-wt', t.id, { cls: 'hide-sm' }) : ''}
    <input type="date" class="input sm" style="width:auto" value="${t.deadline || ''}" data-pd="tdl" data-id="${t.id}" aria-label="Prazo">
    <span class="mono small faint" style="min-width:52px;text-align:right" title="Líquido">${fmtDur(isSub ? db.where('tempo_time_entries', e => e.task_id === t.id).reduce((s, e) => s + entryMs(e), 0) : taskMs(t.id))}</span><span class="mono small faint" style="min-width:52px;text-align:right" title="Bruto (com pausas)">${fmtDur(db.where('tempo_time_entries', e => (isSub ? e.task_id === t.id : (e.task_id === t.id || subtasksOf(t.id).some(x => x.id === e.task_id)))).reduce((s, e) => s + entryBrutoMs(e), 0))}</span>
    <button class="btn sm icon ghost" data-x="track-task" data-id="${t.id}" aria-label="Registrar tempo">${icon('play')}</button>
    ${!isSub ? `<button class="btn sm icon ghost" data-x="add-sub" data-id="${t.id}" aria-label="Adicionar subtarefa">${icon('plus')}</button>` : ''}
    <button class="btn sm icon ghost" data-x="del-task" data-id="${t.id}" aria-label="Excluir">${icon('trash')}</button>
  </div>`;
  return `<div class="banner info small">${icon('layers')} Mudar o status do projeto atualiza só as tarefas marcadas como <b>herdado</b>. Ao mudar uma tarefa manualmente, ela vira exceção e não afeta o projeto nem as outras tarefas.</div>
  <div class="panel"><div class="panel-b tight">${tks.length ? tks.map(t => row(t) + subtasksOf(t.id).map(s => row(s, true)).join('')).join('') : '<div class="empty small">Nenhuma tarefa. Adicione a primeira abaixo.</div>'}</div></div>
  <form class="row" data-form="add-task"><input class="input grow" name="name" placeholder="Nova tarefa" aria-label="Nova tarefa"><button class="btn primary">${icon('plus')} Adicionar tarefa</button></form>`;
}

function pdTime(p) {
  const es = db.where('tempo_time_entries', e => e.project_id === p.id).sort((a, b) => new Date(entryStart(b)) - new Date(entryStart(a)));
  const tot = es.reduce((s, e) => s + entryMs(e), 0);
  const actHtml = actProjectHTML(es) + projectTaskChartHTML(p, es);
  const by = {}; es.forEach(e => { by[e.work_type_id || '_'] = (by[e.work_type_id || '_'] || 0) + entryMs(e); });
  return `${actHtml}<div class="kpis"><div class="kpi"><span class="k">Total líquido</span><span class="v">${fmtH(tot)}</span><span class="s">${es.length} sessão(ões)</span></div><div class="kpi"><span class="k">Bruto</span><span class="v">${fmtH(es.reduce((s, e) => s + entryBrutoMs(e), 0))}</span><span class="s">pausas ${fmtH(Math.max(0, es.reduce((s, e) => s + entryBrutoMs(e), 0) - tot))}</span></div><div class="kpi"><span class="k">Em revisões</span><span class="v">${fmtH(revisionMs(p.id))}</span><span class="s">${tot ? Math.round(revisionMs(p.id) / tot * 100) : 0}% do tempo</span></div></div>
  ${tot ? `<div class="bars">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, ms]) => { const w = db.get('tempo_work_types', k); return `<div class="bar-row"><span class="lab">${esc(w?.name || 'Sem tipo')}</span><div class="bar-track"><div class="bar-fill fill" style="--tb:${hexOf(w?.color || 'gray')};width:${ms / tot * 100}%"></div></div><span class="val">${fmtDur(ms)}</span></div>`; }).join('')}</div>` : ''}
  <div class="panel"><div class="panel-b tight">${es.length ? es.map(e => `<div class="entry" data-x="open-entry" data-id="${e.id}"><span class="when">${fmtDateShort(entryStart(e))} ${fmtTime(entryStart(e))}</span><div class="what"><div class="t">${esc(entryTitle(e))}${e.revision_id ? ' <span class="inh">revisão</span>' : ''}</div><div class="p">${esc(e.notes || '')}</div></div><span class="dur">${fmtDur(entryMs(e))}</span></div>`).join('') : '<div class="empty small">Nenhum tempo registrado.</div>'}</div></div>`;
}

function pdRevisions(p) {
  const rs = db.where('tempo_revisions', r => r.project_id === p.id).sort((a, b) => a.number - b.number);
  const inc = p.revisions_included ?? 0;
  return `<div class="row small muted">${inc} rodada(s) incluída(s) no orçamento · ${rs.length} registrada(s) · ${fmtH(revisionMs(p.id))} gastas em ajustes</div>
  ${rs.map(r => { const ms = db.where('tempo_time_entries', e => e.revision_id === r.id).reduce((s, e) => s + entryMs(e), 0); return `<div class="panel"><div class="panel-h"><h3>Rodada ${r.number}</h3>${r.number > inc ? '<span class="tag c-orange">extra</span>' : ''}${r.resent_at ? `<span class="tag c-green">reenviada ${fmtDate(r.resent_at)}</span>` : '<span class="tag c-yellow">em ajuste</span>'}<span class="grow"></span><span class="mono small">${fmtDur(ms)}</span></div>
    <div class="panel-b stack" style="gap:8px"><div>${esc(r.description)}</div><div class="small muted">Pedido em ${fmtDateTime(r.requested_at)}${r.requested_by ? ' por ' + esc(r.requested_by) : ''}</div>
    <div class="row">${r.resent_at ? '' : `<button class="btn sm" data-x="rev-resent" data-id="${r.id}">Marcar reenvio agora</button>`}<button class="btn sm" data-x="rev-track" data-id="${r.id}">${icon('play')} Registrar tempo nesta rodada</button><button class="btn sm ghost danger" data-x="rev-del" data-id="${r.id}">${icon('trash')}</button></div></div></div>`; }).join('')}
  <form class="panel" data-form="add-rev"><div class="panel-h"><h3>Novo pedido de ajuste</h3></div><div class="panel-b stack">
    <div class="field"><label for="rv-desc">O que foi pedido *</label><textarea id="rv-desc" class="input" name="description" required></textarea></div>
    <div class="grid2"><div class="field"><label for="rv-by">Quem pediu</label><input id="rv-by" class="input" name="requested_by"></div><div class="field"><label for="rv-at">Data do pedido</label><input id="rv-at" type="datetime-local" class="input" name="requested_at" value="${toLocalInput(nowISO())}"></div></div>
    <div><button class="btn primary">${icon('plus')} Registrar rodada ${rs.length + 1}</button></div></div></form>`;
}

function pdFinance(p) {
  const pays = paymentsOf(p.id); const rem = remainingOf(p);
  return `<div class="kpis"><div class="kpi"><span class="k">Orçamento</span><span class="v">${fmtMoney(p.budget) || '—'}</span></div><div class="kpi"><span class="k">Valor pago</span><span class="v">${fmtMoney0(paidOf(p))}</span><span class="s">${pays.length} pagamento(s)</span></div><div class="kpi"><span class="k">Valor restante</span><span class="v">${rem === null ? '—' : fmtMoney0(rem)}</span><span class="s">${p.remaining_override !== null && p.remaining_override !== undefined && p.remaining_override !== '' ? 'definido manualmente' : 'orçamento − pago'}</span></div></div>
  <div class="grid2">
    <div class="field"><label for="pd-bud">Orçamento</label><input id="pd-bud" class="input mono" ${moneyAttrs(p.budget)} data-pd="budget"></div>
    <div class="field"><label for="pd-rem">Valor restante manual</label><input id="pd-rem" class="input mono" ${moneyAttrs(p.remaining_override)} placeholder="Automático" data-pd="remaining"><span class="hint">Use quando houver acordo diferente (ex.: valor líquido). Vazio = automático.</span></div>
    <div class="field"><span class="lbl">Status do pagamento</span><div>${comboBtn('payment', p.payment_status_id, 'proj-pay', p.id)}</div><span class="hint">Independente do status do trabalho.</span></div>
    <div class="field"><label for="pd-inv">Nota fiscal emitida em</label><input id="pd-inv" type="datetime-local" class="input" value="${toLocalInput(p.invoice_at)}" data-pd="ms" data-k="invoice_at"></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>Pagamentos recebidos</h3></div><div class="panel-b tight">
    ${pays.length ? `<table class="grid static compact"><thead><tr><th>Data</th><th class="money">Valor</th><th>Observação</th><th></th></tr></thead><tbody>${pays.map(x => `<tr><td>${fmtDate(x.date)}</td><td class="money">${fmtMoney(x.amount)}</td><td class="muted">${esc(x.note)}</td><td class="right"><button class="btn sm icon ghost" data-x="pay-del" data-id="${x.id}" aria-label="Excluir pagamento">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty small">Nenhum pagamento registrado.</div>'}
  </div></div>
  <form class="row" data-form="add-pay"><input class="input mono" style="max-width:170px" name="amount" ${moneyAttrs(null)} placeholder="R$ 0,00" aria-label="Valor"><input type="date" class="input" style="max-width:170px" name="date" value="${ymd(new Date())}" aria-label="Data"><input class="input grow" name="note" placeholder="Observação (parcela, PIX…)" aria-label="Observação"><button class="btn primary">${icon('plus')} Registrar pagamento</button></form>
  <label class="check small"><input type="checkbox" id="pd-autopay" checked> Ao registrar, atualizar o status para Pago / Pago Parcial conforme o saldo</label>`;
}

function pdHistory(p) {
  const h = historyOf(p.id);
  return h.length ? `<div class="timeline">${h.map(x => `<div class="tl"><span class="w">${fmtDateTime(x.at)}</span><span class="b"></span><span>${esc(x.description)}</span></div>`).join('')}</div>` : '<div class="empty small">Sem eventos.</div>';
}

function bindProjectDrawer(ly, id, st) {
  if (ly.bound) return; ly.bound = true;
  const p = () => db.get('tempo_projects', id);
  const quiet = (patch) => { db.update('tempo_projects', id, patch, true); render(); };
  ly.box.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) { st.tab = tb.dataset.tab; ly.refresh(); return; }
    const b = e.target.closest('[data-x]'); if (!b) return;
    const x = b.dataset.x, bid = b.dataset.id;
    if (x === 'track') { const pr = p(); const c = clientOf(pr); openStartModal({ agency_id: c?.agency_id || '__none', client_id: pr.client_id, project_id: pr.id }); }
    if (x === 'track-task') { const t = db.get('tempo_tasks', bid); const pr = p(); const c = clientOf(pr); openStartModal({ agency_id: c?.agency_id || '__none', client_id: pr.client_id, project_id: pr.id, task_id: t.parent_id || t.id, sub_id: t.parent_id ? t.id : '' }); }
    if (x === 'edit-project') openProjectForm(id);
    if (x === 'archive') { const pr = p(); db.update('tempo_projects', id, { archived: !pr.archived }); logEvent('project', id, 'archive', pr.archived ? 'Arquivado' : 'Desarquivado'); toast(pr.archived ? 'Projeto arquivado' : 'Projeto desarquivado'); }
    if (x === 'del-project') {
      const n = db.where('tempo_time_entries', e => e.project_id === id).length;
      if (!await confirmBox({ title: 'Excluir projeto?', body: `Remove o projeto, suas tarefas, revisões, pagamentos e <b>${n} sessão(ões) de tempo</b>. Para só tirar da lista, use Arquivar.`, ok: 'Excluir tudo', danger: true })) return;
      ['tempo_tasks', 'tempo_time_entries', 'tempo_revisions', 'tempo_payments', 'tempo_deadline_changes', 'tempo_status_history'].forEach(t => db.where(t, r => r.project_id === id).forEach(r => db.remove(t, r.id, true)));
      ly.close(); db.remove('tempo_projects', id); toast('Projeto excluído');
    }
    if (x === 'del-change') { if (!await confirmBox({ title: 'Apagar esta alteração?', body: 'Remove só a linha do histórico de prazo. O prazo atual não muda.', ok: 'Apagar', danger: true })) return; db.remove('tempo_deadline_changes', bid, true); ly.refresh(); toast('Alteração apagada'); }
    if (x === 'inherit') resetTaskInheritance(db.get('tempo_tasks', bid));
    if (x === 'add-sub') { const t = db.get('tempo_tasks', bid); db.insert('tempo_tasks', { project_id: id, parent_id: t.id, name: 'Nova subtarefa', status_id: t.status_id, status_inherited: true, deadline: null, notes: '', order: subtasksOf(t.id).length }); setTimeout(() => { const ins = $$('[data-pd="tname"]', ly.box); const last = ins.find(i => db.get('tempo_tasks', i.dataset.id)?.name === 'Nova subtarefa'); last?.select(); }, 30); }
    if (x === 'del-task') {
      const t = db.get('tempo_tasks', bid); const subs = subtasksOf(t.id);
      if (!await confirmBox({ title: 'Excluir tarefa?', body: `“${esc(t.name)}”${subs.length ? ` e ${subs.length} subtarefa(s)` : ''} serão removidas. As sessões de tempo continuam no projeto, sem a tarefa.`, ok: 'Excluir', danger: true })) return;
      [t, ...subs].forEach(k => { db.where('tempo_time_entries', e => e.task_id === k.id).forEach(e => db.update('tempo_time_entries', e.id, { task_id: null }, true)); db.remove('tempo_tasks', k.id, true); });
      logEvent('task', t.id, 'deleted', `Tarefa “${t.name}” excluída`, null, null, { project_id: id }); db.emit();
    }
    if (x === 'open-entry') openEntryModal(bid);
    if (x === 'rev-resent') { const r = db.get('tempo_revisions', bid); db.update('tempo_revisions', bid, { resent_at: nowISO() }, true); logEvent('revision', bid, 'resent', `Reenvio da rodada ${r.number}`, null, null, { project_id: id }); db.emit(); }
    if (x === 'rev-track') { const pr = p(); const c = clientOf(pr); ly.close(); openStartModal({ agency_id: c?.agency_id || '__none', client_id: pr.client_id, project_id: pr.id }); toast('Ao encerrar, abra a sessão e vincule à rodada.'); }
    if (x === 'rev-del') { if (!await confirmBox({ title: 'Excluir rodada?', body: 'As sessões vinculadas continuam, sem o vínculo.', ok: 'Excluir', danger: true })) return; db.where('tempo_time_entries', e => e.revision_id === bid).forEach(e => db.update('tempo_time_entries', e.id, { revision_id: null }, true)); db.remove('tempo_revisions', bid); }
    if (x === 'pay-del') { const pay = db.get('tempo_payments', bid); if (!await confirmBox({ title: 'Excluir pagamento?', body: `${fmtMoney(pay.amount)} de ${fmtDate(pay.date)}.`, ok: 'Excluir', danger: true })) return; db.remove('tempo_payments', bid, true); logEvent('payment', bid, 'payment_deleted', `Pagamento de ${fmtMoney(pay.amount)} excluído`, null, null, { project_id: id }); db.emit(); }
  });
  ly.box.addEventListener('submit', (e) => {
    e.preventDefault(); const form = e.target; const f = formData(form); const kind = form.dataset.form;
    if (kind === 'add-task') { if (!f.name.trim()) return; const pr = p(); db.insert('tempo_tasks', { project_id: id, parent_id: null, name: f.name.trim(), status_id: pr.status_id, status_inherited: true, deadline: null, notes: '', order: tasksOf(id).length, work_type_id: null }); logEvent('task', id, 'created', `Tarefa “${f.name.trim()}” criada`, null, null, { project_id: id }); setTimeout(() => ly.box.querySelector('[data-form="add-task"] input')?.focus(), 30); }
    if (kind === 'add-rev') {
      if (!f.description.trim()) return toast('Descreva o pedido de ajuste.');
      const n = db.where('tempo_revisions', r => r.project_id === id).length + 1;
      const r = db.insert('tempo_revisions', { project_id: id, number: n, description: f.description.trim(), requested_by: f.requested_by, requested_at: fromLocalInput(f.requested_at) || nowISO(), resent_at: null, notes: '' }, true);
      logEvent('revision', r.id, 'revision', `Pedido de ajuste ${n}: ${r.description}`, null, null, { project_id: id }); db.emit(); toast(`Rodada ${n} registrada`);
    }
    if (kind === 'add-pay') {
      const amount = numIn(f.amount); if (!amount) return toast('Informe o valor recebido.');
      const x = db.insert('tempo_payments', { project_id: id, amount, date: f.date || ymd(new Date()), note: f.note, invoice: '' }, true);
      logEvent('payment', x.id, 'payment', `Recebido ${fmtMoney(amount)}${f.note ? ' — ' + f.note : ''}`, null, null, { project_id: id });
      const pr = p();
      if ($('#pd-autopay', ly.box)?.checked && pr.budget) {
        const full = paidOf(pr) >= Number(pr.budget); const target = statuses('payment').find(s => s.name === (full ? 'Pago' : 'Pago Parcial'));
        if (target) setPaymentStatus(pr, target.id);
        if (full && !pr.paid_at) db.update('tempo_projects', id, { paid_at: nowISO() }, true);
      }
      db.emit(); toast('Pagamento registrado');
    }
  });
  ly.box.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-pd]'); if (!el) return;
    const k = el.dataset.pd; const pr = p();
    if (k === 'status') { setProjectStatus(pr, el.value); toast('Status atualizado'); }
    if (k === 'pay') { setPaymentStatus(pr, el.value); }
    if (k === 'deadline') {
      if (!pr.deadline) { changeDeadline(pr, el.value, ''); return; }
      const reason = await askReason(pr.deadline, el.value);
      if (reason === null) { el.value = pr.deadline || ''; return; }
      changeDeadline(pr, el.value, reason); toast('Prazo alterado e guardado no histórico');
    }
    if (k === 'ms') { const label = MILESTONES.find(m => m[0] === el.dataset.k)?.[1]; quiet({ [el.dataset.k]: fromLocalInput(el.value) }); if (el.value) logEvent('project', id, 'milestone', `${label}: ${fmtDateTime(fromLocalInput(el.value))}`); ly.refresh(); }
    if (k === 'budget') { quiet({ budget: moneyVal(el) }); logEvent('project', id, 'budget', `Orçamento: ${fmtMoney(moneyVal(el)) || 'removido'}`); ly.refresh(); }
    if (k === 'remaining') { quiet({ remaining_override: moneyVal(el) }); ly.refresh(); }
    if (k === 'orig') { quiet({ deadline_original: el.value || null }); logEvent('project', id, 'deadline_original', `Prazo original: ${el.value ? fmtDate(el.value) : 'removido'}`); ly.refresh(); toast('Prazo original corrigido'); }
    if (k === 'tname') { if (el.value.trim()) { db.update('tempo_tasks', el.dataset.id, { name: el.value.trim() }, true); render(); } }
    if (k === 'tstatus') setTaskStatus(db.get('tempo_tasks', el.dataset.id), el.value);
    if (k === 'twt') { db.update('tempo_tasks', el.dataset.id, { work_type_id: el.value || null }, true); render(); }
    if (k === 'tdl') { db.update('tempo_tasks', el.dataset.id, { deadline: el.value || null }, true); render(); }
  });
}
let askingReason = false;
function askReason(from, to) {
  if (askingReason) return Promise.resolve(null);
  askingReason = true;
  return new Promise(res0 => {
    const res = (v) => { askingReason = false; res0(v); };
    let done = false;
    const l = openLayer({
      html: `<div class="dh"><h2>Alterar prazo</h2></div><div class="db"><p style="margin:0">De <b>${fmtDate(from)}</b> para <b>${to ? fmtDate(to) : 'sem prazo'}</b>. O prazo original fica guardado.</p><div class="field"><label for="rs-in">Motivo (opcional)</label><input id="rs-in" class="input" placeholder="Ex.: cliente atrasou o envio do conteúdo" autofocus></div></div>
      <div class="df"><button class="btn" data-x="no">Cancelar</button><button class="btn primary" data-x="yes">Salvar prazo</button></div>`,
      onClose: () => { if (!done) res(null); }
    });
    const ok = () => { done = true; res($('#rs-in', l.box).value); l.close(); };
    l.box.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    l.box.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x === 'yes') ok(); else { done = true; res(null); l.close(); } });
  });
}
