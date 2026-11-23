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
  return `<div class="dh"><div class="grow"><div class="row small" style="gap:6px">${a ? `<button type="button" class="btn-plain" data-x="open-party" data-kind="agency" data-id="${a.id}" data-tip="Abrir agência">${agencyTag(a)}</button>` : agencyTag(a)}${comboBtn('client', p.client_id, 'proj-client', p.id)}${c ? `<button type="button" class="btn sm icon ghost" data-x="open-party" data-kind="client" data-id="${c.id}" aria-label="Abrir cliente" data-tip="Abrir cliente">${icon('arrowR')}</button>` : ''}</div><h2 style="margin-top:4px">${esc(p.name)}</h2></div>
    <button class="btn sm" data-x="track">${icon('play')} Registrar tempo</button><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
  <div class="tabs" role="tablist">${tabs.map(([k, lab]) => `<button class="${st.tab === k ? 'on' : ''}" data-tab="${k}" role="tab">${lab}</button>`).join('')}</div>
  <div class="db">${body}</div>
  <div class="df"><button class="btn danger left" data-x="del-project">${icon('trash')} Excluir</button><button class="btn" data-x="archive">${p.archived ? 'Desarquivar' : 'Arquivar'}</button><button class="btn" data-x="edit-project">${icon('edit')} Editar dados</button></div>`;
}

function pdOverview(p) {
  const ms = projectMs(p.id), est = (Number(p.estimated_hours) || 0) * 3600000, rate = effectiveRate(p);
  const waMs = waMsDoProjeto(p.id), rateWa = effectiveRateComWa(p);
  const changes = deadlineChanges(p.id); const del = deliveryInfo(p);
  const revs = db.where('tempo_revisions', r => r.project_id === p.id).length;
  return `<div class="kpis">
    <div class="kpi"><span class="k">Horas reais</span><span class="v">${fmtH(ms)}</span><span class="s">${est ? `de ${fmtH(est)} estimadas · ${Math.round(ms / est * 100)}%` : 'sem estimativa'}</span></div>
    <div class="kpi" data-tip="Conversas com contatos de trabalho deste projeto fora do cronômetro (dentro dele já estão nas horas)"><span class="k">WhatsApp</span><span class="v">${waMs ? fmtH(waMs) : '—'}</span><span class="s">${waMs ? `total com horas: ${fmtH(ms + waMs)}` : 'nada fora do cronômetro'}</span></div>
    <div class="kpi"><span class="k">R$/hora efetivo</span><span class="v">${rate ? fmtMoney(rate) : '—'}</span><span class="s">${margemAoVivoHTML(p, rate) || (waMs && rateWa ? `com WhatsApp: ${fmtMoney(rateWa)}` : 'orçamento ÷ horas reais')}</span></div>
    <div class="kpi"><span class="k">Recebido</span><span class="v">${fmtMoney0(paidOf(p))}</span><span class="s">${p.budget ? 'de ' + fmtMoney(p.budget) : 'sem orçamento'}</span></div>
    <div class="kpi"><span class="k">Revisões</span><span class="v">${revs}</span><span class="s">${p.revisions_included ?? 0} incluídas${revs > (p.revisions_included ?? 0) ? ` · <b style="color:var(--warn)">${revs - (p.revisions_included ?? 0)} extra</b>` : ''}</span></div>
  </div>
  <div class="props">
    <span class="k">Status</span><div>${comboBtn('work', p.status_id, 'proj-status', p.id)} <span class="small faint">propaga para tarefas que herdam</span></div>
    <span class="k">Pagamento</span><div>${comboBtn('payment', p.payment_status_id, 'proj-pay', p.id)}</div>
    <span class="k">Tipo de trabalho</span><div>${comboBtn('wt', p.work_type_id, 'proj-wt', p.id)} <span class="small faint">tarefas herdam; mudar uma tarefa não muda o projeto</span></div>
    <span class="k">Prazo atual</span><div class="row" data-dias-wrap><input type="date" class="input sm" style="width:auto" value="${p.deadline || ''}" data-pd="deadline">${emDiasHTML(false)} ${deadlineCell(p)}</div>
    <span class="k">Prazo original</span><div class="row"><input type="date" class="input sm" style="width:auto" value="${p.deadline_original || ''}" data-pd="orig" aria-label="Prazo original"> ${changes.length ? `<span class="small muted">· ${changes.length} adiamento(s)</span>` : ''}</div>
    <span class="k">Entrega</span><div>${p.sent_at ? fmtDateTime(p.sent_at) : '—'} ${del ? (del.late ? `<span class="tag c-red">${del.days} dia(s) de atraso</span>` : `<span class="tag c-green">no prazo</span>`) : ''}</div>
    <span class="k">Observação</span><div class="muted">${esc(p.notes || '—')}</div>
    ${p.description ? `<span class="k">Descrição</span><div class="muted">${esc(p.description)}</div>` : ''}
  </div>
  ${changes.length ? `<div class="stack" style="gap:6px"><span class="lbl">Alterações de prazo</span><div class="timeline">${changes.map(d => `<div class="tl"><span class="w">${fmtDate(d.at)}</span><span class="b"></span><span>${fmtDate(d.from)} → <b>${d.to ? fmtDate(d.to) : 'sem prazo'}</b>${d.reason ? ` <span class="muted">— ${esc(d.reason)}</span>` : ''} <button class="btn sm icon ghost" data-x="del-change" data-id="${d.id}" aria-label="Apagar alteração" title="Apagar esta alteração do histórico">${icon('trash')}</button></span></div>`).join('')}</div></div>` : ''}
  ${orcadoRealizadoHTML(p)}
  <div class="panel"><div class="panel-h"><h3>Marcos do projeto</h3></div><div class="panel-b stack">
    <div class="grid2">${MILESTONES.map(([k, lab]) => `<div class="field"><label for="ms-${k}">${lab}</label><input id="ms-${k}" type="datetime-local" class="input sm" value="${toLocalInput(p[k])}" data-pd="ms" data-k="${k}"></div>`).join('')}</div>
    <div class="stack" style="gap:4px"><span class="lbl">Intervalos entre etapas</span>
      ${INTERVALS.map(([x, y, lab]) => { const d = daysBetween(p[x], p[y]); return `<div class="row between small"><span class="muted">${lab}</span><span class="mono">${d === null ? '—' : d + ' dia(s)'}</span></div>`; }).join('')}
    </div>
  </div></div>`;
}

function pdTasks(p) {
  const tks = tasksOf(p.id);
  // Uma linha por tarefa: nome (largo, com "Depende de" embaixo), status, responsável, data e hora do prazo (com quanto falta).
  // ▶ e a seta das opções aparecem ao passar o mouse; a seta abre tipo, herdar, dependências, subtarefa, ajuste, excluir.
  const row = (t, isSub) => {
    const liq = isSub ? db.where('tempo_time_entries', e => e.task_id === t.id).reduce((s, e) => s + entryMs(e), 0) : taskMs(t.id);
    const bruto = db.where('tempo_time_entries', e => (isSub ? e.task_id === t.id : (e.task_id === t.id || subtasksOf(t.id).some(x => x.id === e.task_id)))).reduce((s, e) => s + entryBrutoMs(e), 0);
    const est = estimadoDaTarefa(t); const aberto = TK_ABERTAS.has(t.id);
    const deps = (Array.isArray(t.depends_on) ? t.depends_on : []).map(d => db.get('tempo_tasks', d)?.name).filter(Boolean);
    const rel = tkPrazoRel(t);
    return `<div class="tk ${isSub ? 'sub' : ''}${aberto ? ' aberta' : ''}">
    <div class="tk-l">
      <div class="tk-nome"><input class="tk-in n" value="${esc(t.name)}" data-pd="tname" data-id="${t.id}" aria-label="Nome"${liq || est ? ` data-tip="${esc(`Líquido ${fmtDur(liq)} · bruto ${fmtDur(bruto)}${est ? ' · estimado ' + fmtH(est * 36e5) : ''}`)}"` : ''}>${deps.length ? `<span class="tk-dep">(Depende de ${deps.length > 1 ? deps.length + ' tarefas' : esc(deps[0])})</span>` : ''}</div>
      <div class="tk-st">${comboBtn('work', t.status_id, 'task-status', t.id)}</div>
      <input class="tk-in tk-resp" value="${esc(t.owner || '')}" placeholder="—" data-pd="owner" data-id="${t.id}" aria-label="Responsável">
      <label class="tk-data"><span class="tk-dv">${t.deadline ? fmtDate(t.deadline) : '<span class="faint">sem prazo</span>'}</span>${rel ? `<span class="tk-rel ${rel.c}">${rel.txt}</span>` : ''}<input type="date" value="${t.deadline || ''}" data-pd="tdl" data-id="${t.id}" aria-label="Prazo"></label>
      <label class="tk-hora"><span class="tk-dv">${t.deadline_time ? t.deadline_time.replace(':', 'h') : '<span class="faint">--h--</span>'}</span><input type="time" value="${t.deadline_time || ''}" data-pd="thora" data-id="${t.id}" aria-label="Hora do prazo"></label>
      <span class="tk-acoes">${souEu(t.owner) ? `<button class="btn sm icon ghost" data-x="track-task" data-id="${t.id}" aria-label="Registrar tempo">${icon('play')}</button>` : ''}<button class="btn sm icon ghost" data-x="tk-abrir" data-id="${t.id}" aria-label="${aberto ? 'Fechar' : 'Mais opções'}" aria-expanded="${aberto}">${icon(aberto ? 'chevU' : 'chevD')}</button></span>
    </div>
    ${aberto ? `<div class="tk-mais-p">
      ${t.status_inherited !== false ? `<span class="small muted" data-tip="Mudar o status do projeto muda o desta tarefa também">${icon('layers')} Segue o status do projeto</span>` : `<button class="btn sm" data-x="inherit" data-id="${t.id}" data-tip="Esta tarefa foi mudada à mão e não segue mais o status do projeto">${icon('undo')} Voltar a seguir o projeto</button>`}
      ${!isSub ? comboBtn('wt', t.work_type_id, 'task-wt', t.id) : ''}
      ${!isSub ? depsHTML(t) : ''}
      <span class="grow"></span>
      ${liq || est ? `<span class="mono small muted">${fmtDur(liq)}${est ? ' de ' + fmtH(est * 36e5) : ''}</span>` : ''}
      ${!isSub ? `<button class="btn sm ghost" data-x="add-sub" data-id="${t.id}">${icon('plus')} Subtarefa</button>` : ''}
      ${!isSub && !ADJUST_RE.test(t.name) ? `<button class="btn sm ghost" data-x="add-adjust" data-id="${t.id}" data-tip="Registrar um ajuste desta tarefa (cria [Ajuste NN] para você preencher o prazo)">Ajuste</button>` : ''}
      <button class="btn sm icon ghost" data-x="del-task" data-id="${t.id}" aria-label="Excluir">${icon('trash')}</button>
    </div>` : ''}
  </div>`;
  };
  return `<div class="row" style="justify-content:flex-end;margin:0 0 8px;gap:8px"><button class="btn sm" data-x="open-flow" data-id="${p.id}">Ver fluxo em nós</button></div>
  <div class="panel"><div class="panel-b tight">${tks.length ? tks.map(t => row(t) + subtasksOf(t.id).map(s => row(s, true)).join('')).join('') : `<div class="empty small">Nenhuma tarefa. <button class="btn sm" data-x="video-flow" data-id="${p.id}">Criar fluxo de vídeo pré-montado</button></div>`}
  <form class="tk-nova" data-form="add-task"><span class="tk-nova-i">${icon('plus')}</span><input class="tk-in grow" name="name" placeholder="Nova tarefa (Enter para adicionar)" aria-label="Nova tarefa"></form></div></div>`;
}
const TK_ABERTAS = new Set();
/* Quanto falta para o prazo da tarefa: "Hoje, em 03h21" / "Amanhã" / "2 dias" / "Atrasada 1 dia". */
function tkPrazoRel(t) {
  if (!t.deadline || statusCat(t.status_id) === 'done') return null;
  const hoje = ymd(new Date()); const n = Math.round((new Date(t.deadline + 'T12:00:00') - new Date(hoje + 'T12:00:00')) / 864e5);
  if (n < 0) return { txt: `Atrasada ${-n} dia${n < -1 ? 's' : ''}`, c: 'late' };
  if (n === 0) {
    if (!t.deadline_time) return { txt: 'Hoje', c: 'hoje' };
    const ms = new Date(t.deadline + 'T' + t.deadline_time + ':00') - Date.now(); const m = Math.round(Math.abs(ms) / 60e3);
    const hm = `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
    return ms >= 0 ? { txt: `Hoje, em ${hm}`, c: 'hoje' } : { txt: `Atrasada ${hm}`, c: 'late' };
  }
  if (n === 1) return { txt: 'Amanhã', c: 'amanha' };
  return { txt: `${n} dias`, c: '' };
}

function pdTime(p) {
  const es = db.where('tempo_time_entries', e => e.project_id === p.id).sort((a, b) => new Date(entryStart(b)) - new Date(entryStart(a)));
  const tot = es.reduce((s, e) => s + entryMs(e), 0);
  const actHtml = resumoEmbedHTML(es) + projectTaskChartHTML(p, es);
  const by = {}; es.forEach(e => { by[e.work_type_id || '_'] = (by[e.work_type_id || '_'] || 0) + entryMs(e); });
  return `${actHtml}<div class="kpis"><div class="kpi"><span class="k">Total líquido</span><span class="v">${fmtH(tot)}</span><span class="s">${es.length} sessão(ões)</span></div><div class="kpi"><span class="k">Bruto</span><span class="v">${fmtH(es.reduce((s, e) => s + entryBrutoMs(e), 0))}</span><span class="s">pausas ${fmtH(Math.max(0, es.reduce((s, e) => s + entryBrutoMs(e), 0) - tot))}</span></div><div class="kpi"><span class="k">Em revisões</span><span class="v">${fmtH(revisionMs(p.id))}</span><span class="s">${tot ? Math.round(revisionMs(p.id) / tot * 100) : 0}% do tempo</span></div></div>
  ${tot ? stdBarsHTML(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, ms]) => { const w = db.get('tempo_work_types', k); return { key: w?.name || 'Sem tipo', label: w?.name || 'Sem tipo', v: ms, color: hexOf(w?.color || 'gray') }; }), fmtDur, tot) : ''}
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

/* Projeto não cobrado (pessoal, por conta própria): quanto teria custado pela hora de trabalho.
   Guardado em projNaoCobrado { pid: { on, rate } }; a hora padrão é a do orçamento (precoBase), e mudar aqui vale só para o projeto. */
const pdNcDe = (p) => { const m = (db.setting('projNaoCobrado', {}) || {})[p.id]; const pessoal = /pessoal/i.test(agencyOf(p)?.name || '') || /pessoal/i.test(clientOf(p)?.name || ''); return { on: m ? !!m.on : pessoal, rate: m && Number(m.rate) > 0 ? Number(m.rate) : null }; };
const pdNcPadrao = () => (typeof precoBase === 'function' ? Number(precoBase().hora) || 0 : 0);
function pdNaoCobradoHTML(p) {
  // conta pelo bruto sem o ócio: trabalho + distração (WhatsApp etc. durante o trabalho); parado, tela bloqueada e Mac dormindo ficam fora
  const nc = pdNcDe(p); const ents = db.where('tempo_time_entries', e => e.project_id === p.id && e.state === 'done');
  const pr = typeof prodOfEntries === 'function' ? prodOfEntries(ents) : null;
  const m0 = (db.setting('projNaoCobrado', {}) || {})[p.id] || {}; const comPausa = m0.pausa !== false, comOcio = m0.ocio === true;
  const ms = pr && pr.base ? pr.prod + (comPausa ? pr.dist : 0) + (comOcio ? pr.ocio : 0) : projectMs(p.id); const rate = nc.rate ?? pdNcPadrao(); const h = ms / 36e5;
  const box = nc.on ? `<div class="panel"><div class="panel-h"><h3>Quanto teria custado</h3><span class="small muted">${pr && pr.base ? [`${fmtH(pr.prod)} de trabalho`, comPausa ? `${fmtH(pr.dist)} de pausa/distração` : '', comOcio ? `${fmtH(pr.ocio)} de ócio` : ''].filter(Boolean).join(' + ') : `${fmtH(ms)} trabalhadas`}</span></div><div class="panel-b">
      <div class="row" style="gap:16px;align-items:flex-end;flex-wrap:wrap">
        <div class="field" style="max-width:230px;margin:0"><label for="pd-ncrate">Valor da hora</label><div class="row" style="gap:4px;flex-wrap:nowrap"><input id="pd-ncrate" class="input mono" type="number" step="1" min="0" value="${rate || ''}" data-x-nc="rate">${typeof vhBotaoHTML === 'function' ? vhBotaoHTML('pd-ncrate') : ''}</div><span class="hint">${nc.rate ? `só neste projeto · padrão ${fmtMoney(pdNcPadrao())}` : 'o padrão dos orçamentos (mude aqui só para este projeto)'}</span></div>
        <div class="kpi" style="flex:1;min-width:220px"><span class="k">Se fosse cobrado</span><span class="v">${fmtMoney0(h * rate)}</span><span class="s">${fmtH(ms)} × ${fmtMoney(rate)}/h</span></div>
      </div>
      ${pr && pr.base ? `<div class="row" style="gap:16px;margin-top:10px;flex-wrap:wrap"><label class="check small" data-tip="Pausas de WhatsApp, Telegram e Instagram no meio do trabalho"><input type="checkbox" data-x="pd-ncpausa" ${comPausa ? 'checked' : ''}> Considerar pausa (distração)</label><label class="check small" data-tip="Parado, tela bloqueada, Mac dormindo ou pausa manual"><input type="checkbox" data-x="pd-ncocio" ${comOcio ? 'checked' : ''}> Considerar ócio</label></div>` : ''}
      ${nc.rate ? `<button type="button" class="btn sm ghost" data-x="pd-ncpadrao" style="margin-top:8px">Voltar à hora padrão</button>` : ''}</div></div>` : '';
  return `<label class="check small" style="margin-bottom:10px"><input type="checkbox" data-x="pd-naocob" ${nc.on ? 'checked' : ''}> Não cobrado <span class="faint">(projeto pessoal ou por conta própria)</span></label>${box}`;
}
function pdFinance(p) {
  const pays = paymentsOf(p.id); const rem = remainingOf(p);
  return `${pdNaoCobradoHTML(p)}<div class="kpis"><div class="kpi"><span class="k">Orçamento</span><span class="v">${fmtMoney(p.budget) || '—'}</span></div><div class="kpi"><span class="k">Valor pago</span><span class="v">${fmtMoney0(paidOf(p))}</span><span class="s">${pays.length} pagamento(s)</span></div><div class="kpi"><span class="k">Valor restante</span><span class="v">${rem === null ? '—' : fmtMoney0(rem)}</span><span class="s">${p.remaining_override !== null && p.remaining_override !== undefined && p.remaining_override !== '' ? 'definido manualmente' : 'orçamento − pago'}</span></div></div>
  <div class="grid2">
    <div class="field"><label for="pd-bud">Orçamento</label><input id="pd-bud" class="input mono" ${moneyAttrs(p.budget)} data-pd="budget"></div>
    <div class="field"><label for="pd-rem">Valor restante manual</label><input id="pd-rem" class="input mono" ${moneyAttrs(p.remaining_override)} placeholder="Automático" data-pd="remaining"><span class="hint">Use quando houver acordo diferente (ex.: valor líquido). Vazio = automático.</span></div>
    <div class="field"><span class="lbl">Status do pagamento</span><div>${comboBtn('payment', p.payment_status_id, 'proj-pay', p.id)}</div><span class="hint">Independente do status do trabalho.</span></div>
    <div class="field"><label for="pd-inv">Nota fiscal emitida em</label><input id="pd-inv" type="datetime-local" class="input" value="${toLocalInput(p.invoice_at)}" data-pd="ms" data-k="invoice_at"></div>
  </div>
  ${previsoesProjetoHTML(p)}
  <div class="panel"><div class="panel-h"><h3>Pagamentos recebidos</h3></div><div class="panel-b tight">
    ${pays.length ? `<table class="grid static compact"><thead><tr><th>Data</th><th class="money">Valor</th><th>Nota</th><th>Observação</th><th></th></tr></thead><tbody>${pays.map(x => `<tr><td>${fmtDate(x.date)}</td><td class="money">${fmtMoney(x.amount)}</td><td>${typeof nfsDoPagamento === 'function' ? nfChips(nfsDoPagamento(x.id), { label: true }) : ''}</td><td class="muted">${esc(x.note)}</td><td class="right"><button class="btn sm icon ghost" data-x="pay-del" data-id="${x.id}" aria-label="Excluir pagamento">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty small">Nenhum pagamento registrado.</div>'}
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
  const ids = () => db.where('tempo_time_entries', e => e.project_id === id && e.state === 'done').map(e => e.id);
  bindResumoClicks(ly.box, ids, { refresh: () => ly.refresh(), reabrir: () => ly.refresh(), selfProject: id });
  ly.box.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) { st.tab = tb.dataset.tab; ly.refresh(); return; }
    const b = e.target.closest('[data-x]'); if (!b) return;
    const x = b.dataset.x, bid = b.dataset.id;
    if (x === 'track') { const pr = p(); const c = clientOf(pr); openStartModal({ agency_id: c?.agency_id || '__none', client_id: pr.client_id, project_id: pr.id }); }
    if (x === 'track-task') { const t = db.get('tempo_tasks', bid); const pr = p(); const c = clientOf(pr); openStartModal({ agency_id: c?.agency_id || '__none', client_id: pr.client_id, project_id: pr.id, task_id: t.parent_id || t.id, sub_id: t.parent_id ? t.id : '' }); }
    if (x === 'open-party') return openParty(b.dataset.kind, bid);
    if (x === 'edit-project') openProjectForm(id);
    if (x === 'archive') { const pr = p(); db.update('tempo_projects', id, { archived: !pr.archived }); logEvent('project', id, 'archive', pr.archived ? 'Arquivado' : 'Desarquivado'); toast(pr.archived ? 'Projeto arquivado' : 'Projeto desarquivado'); }
    if (x === 'del-project') {
      const n = db.where('tempo_time_entries', e => e.project_id === id).length;
      if (!await confirmBox({ title: 'Excluir projeto?', body: `Remove o projeto, suas tarefas, revisões, pagamentos e <b>${n} sessão(ões) de tempo</b>. Para só tirar da lista, use Arquivar.`, ok: 'Excluir tudo', danger: true })) return;
      ['tempo_tasks', 'tempo_time_entries', 'tempo_revisions', 'tempo_payments', 'tempo_deadline_changes', 'tempo_status_history'].forEach(t => db.where(t, r => r.project_id === id).forEach(r => db.remove(t, r.id, true)));
      ly.close(); db.remove('tempo_projects', id); toast('Projeto excluído');
    }
    if (x === 'add-adjust') { const t = db.get('tempo_tasks', bid); const nt = createAdjustTask(t, null, 'Registrado manualmente'); setTimeout(() => { const ins = $$('[data-pd="tdl"]', ly.box).find(i => i.dataset.id === nt.id); ins?.focus(); }, 30); }
    if (x === 'del-change') { if (!await confirmBox({ title: 'Apagar esta alteração?', body: 'Remove só a linha do histórico de prazo. O prazo atual não muda.', ok: 'Apagar', danger: true })) return; db.remove('tempo_deadline_changes', bid, true); ly.refresh(); toast('Alteração apagada'); }
    if (x === 'inherit') resetTaskInheritance(db.get('tempo_tasks', bid));
    if (x === 'tk-abrir') { TK_ABERTAS.has(bid) ? TK_ABERTAS.delete(bid) : TK_ABERTAS.add(bid); ly.refresh(); return; }
    if (x === 'add-sub') { const t = db.get('tempo_tasks', bid); db.insert('tempo_tasks', { project_id: id, parent_id: t.id, name: 'Nova subtarefa', status_id: t.status_id, status_inherited: true, deadline: null, notes: '', order: subtasksOf(t.id).length }); setTimeout(() => { const ins = $$('[data-pd="tname"]', ly.box); const last = ins.find(i => db.get('tempo_tasks', i.dataset.id)?.name === 'Nova subtarefa'); last?.select(); }, 30); }
    if (x === 'del-task') {
      const t = db.get('tempo_tasks', bid); const subs = subtasksOf(t.id);
      if (!await confirmBox({ title: 'Excluir tarefa?', body: `“${esc(t.name)}”${subs.length ? ` e ${subs.length} subtarefa(s)` : ''} serão removidas. As sessões de tempo continuam no projeto, sem a tarefa.`, ok: 'Excluir', danger: true })) return;
      [t, ...subs].forEach(k => { db.where('tempo_time_entries', e => e.task_id === k.id).forEach(e => db.update('tempo_time_entries', e.id, { task_id: null }, true)); db.remove('tempo_tasks', k.id, true); });
      logEvent('task', t.id, 'deleted', `Tarefa “${t.name}” excluída`, null, null, { project_id: id }); db.emit();
    }
    if (x === 'open-entry') openEntryModal(bid);
    if (x === 'pd-ncpausa' || x === 'pd-ncocio') { const m = { ...(db.setting('projNaoCobrado', {}) || {}) }; const cur = m[id] || {}; const k = x === 'pd-ncpausa' ? 'pausa' : 'ocio'; const atual = k === 'pausa' ? cur.pausa !== false : cur.ocio === true; m[id] = { on: true, rate: pdNcDe(p()).rate, ...cur, [k]: !atual }; db.setSetting('projNaoCobrado', m); ly.refresh(); return; }
    if (x === 'pd-naocob' || x === 'pd-ncpadrao') { const m = { ...(db.setting('projNaoCobrado', {}) || {}) }; const cur = pdNcDe(p()); m[id] = x === 'pd-naocob' ? { ...(m[id] || {}), on: !cur.on, rate: cur.rate } : { ...(m[id] || {}), on: true, rate: null }; db.setSetting('projNaoCobrado', m); ly.refresh(); return; }
    if (x === 'rev-resent') { const r = db.get('tempo_revisions', bid); db.update('tempo_revisions', bid, { resent_at: nowISO() }, true); logEvent('revision', bid, 'resent', `Reenvio da rodada ${r.number}`, null, null, { project_id: id }); db.emit(); }
    if (x === 'rev-track') { const pr = p(); const c = clientOf(pr); ly.close(); openStartModal({ agency_id: c?.agency_id || '__none', client_id: pr.client_id, project_id: pr.id }); toast('Ao encerrar, abra a sessão e vincule à rodada.'); }
    if (x === 'rev-del') { if (!await confirmBox({ title: 'Excluir rodada?', body: 'As sessões vinculadas continuam, sem o vínculo.', ok: 'Excluir', danger: true })) return; db.where('tempo_time_entries', e => e.revision_id === bid).forEach(e => db.update('tempo_time_entries', e.id, { revision_id: null }, true)); db.remove('tempo_revisions', bid); }
    if (x === 'pay-del') { const pay = db.get('tempo_payments', bid); if (!await confirmBox({ title: 'Excluir pagamento?', body: `${fmtMoney(pay.amount)} de ${fmtDate(pay.date)}.`, ok: 'Excluir', danger: true })) return; db.remove('tempo_payments', bid, true); logEvent('payment', bid, 'payment_deleted', `Pagamento de ${fmtMoney(pay.amount)} excluído`, null, null, { project_id: id }); db.emit(); }
  });
  ly.box.addEventListener('change', (e) => {
    if (e.target.id !== 'pd-ncrate') return;
    const v = Number(e.target.value) || 0; const m = { ...(db.setting('projNaoCobrado', {}) || {}) };
    m[id] = { ...(m[id] || {}), on: true, rate: v > 0 && v !== pdNcPadrao() ? v : null }; db.setSetting('projNaoCobrado', m); ly.refresh();
  });
  ly.box.addEventListener('submit', (e) => {
    e.preventDefault(); const form = e.target; const f = formData(form); const kind = form.dataset.form;
    if (kind === 'add-task') { if (!f.name.trim()) return; const pr = p(); db.insert('tempo_tasks', { project_id: id, parent_id: null, name: f.name.trim(), status_id: newTaskStatusId(id), status_inherited: true, deadline: null, notes: '', order: tasksOf(id).length, work_type_id: null }); reopenProjectIfDone(id); logEvent('task', id, 'created', `Tarefa “${f.name.trim()}” criada`, null, null, { project_id: id }); setTimeout(() => ly.box.querySelector('[data-form="add-task"] input')?.focus(), 30); }
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
  ly.box.addEventListener('click', (e) => {
    const v = e.target.closest('[data-x="video-flow"]'); if (v) { openVideoFlowDialog(v.dataset.id, () => { render(); }); return; }
    const of = e.target.closest('[data-x="open-flow"]'); if (of) { openFlowEditor(of.dataset.id); return; }
    const b = e.target.closest('[data-x="dep-del"]'); if (!b) return;
    const tt = db.get('tempo_tasks', b.dataset.id); if (!tt) return;
    db.update('tempo_tasks', tt.id, { depends_on: (tt.depends_on || []).filter(d => d !== b.dataset.dep) }, true); render();
  });
  // data e hora do prazo da tarefa: o campo fica escondido atrás do texto; o clique abre o seletor do sistema
  ly.box.addEventListener('click', (e) => { const inp = e.target.closest('.tk-data input, .tk-hora input'); if (inp) { try { inp.showPicker(); } catch (err) {} } });
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
    if (k === 'thora') { db.update('tempo_tasks', el.dataset.id, { deadline_time: el.value || null }, true); render(); return; }
    if (k === 'owner') { db.update('tempo_tasks', el.dataset.id, { owner: el.value.trim() || null }, true); render(); return; }
    if (k === 'dep-add') { if (!el.value) return; const tt = db.get('tempo_tasks', el.dataset.id); if (tt) { db.update('tempo_tasks', tt.id, { depends_on: [...(tt.depends_on || []), el.value] }, true); render(); } return; }
    if (k === 'tdl') {
      const t = db.get('tempo_tasks', el.dataset.id); if (!t) return;
      if (!await taskDeadlineFlow(t, el.value || null)) { el.value = t.deadline || ''; return; }
      render();
    }
  });
}
/* Janelinha do fluxo de vídeo: pergunta quem faz as etapas de terceiros (opcional). */
function openVideoFlowDialog(pid, onDone) {
  const ext = VIDEO_FLOW.filter(s => !souEu(s.owner));
  const l = openLayer({
    html: `<div class="dh"><h2>Fluxo de vídeo</h2></div><div class="db"><div class="stack" style="gap:10px"><span class="small muted">Quem vai fazer as etapas de terceiros? É opcional, dá para preencher depois.</span>${ext.map(s => `<div class="field"><label for="vf-${s.key}">${s.name}</label><input id="vf-${s.key}" class="input" name="${s.key}" placeholder="${esc(s.owner)}"></div>`).join('')}</div></div>
    <div class="df"><button class="btn" data-x="no">Cancelar</button><button class="btn primary" data-x="yes" autofocus>Criar fluxo</button></div>`
  });
  l.box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'yes') {
      const names = {}; ext.forEach(s => { const v = l.box.querySelector(`[name="${s.key}"]`)?.value.trim(); if (v) names[s.key] = v; });
      createVideoFlow(pid, names); render(); toast('Fluxo de vídeo criado');
      l.close(); if (onDone) onDone(); return;
    }
    l.close();
  });
}
/* Ligação entre tarefas: "depende de" com chips para remover e um seletor para adicionar. */
function depsHTML(t) {
  const deps = Array.isArray(t.depends_on) ? t.depends_on : [];
  const chips = deps.map(d => { const x = db.get('tempo_tasks', d); return x ? `<button class="btn sm ghost" data-x="dep-del" data-id="${t.id}" data-dep="${d}" title="Remover dependência">${esc(x.name)} ×</button>` : ''; }).join('');
  const opts = tasksOf(t.project_id).filter(x => !x.parent_id && x.id !== t.id && !deps.includes(x.id)).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  return `<span class="row" style="gap:4px"><span class="small faint">depende de</span>${chips}${opts ? `<select class="input sm" data-pd="dep-add" data-id="${t.id}" aria-label="Adicionar dependência"><option value="">+ tarefa</option>${opts}</select>` : ''}</span>`;
}
/* Mudança de prazo de tarefa: pede o motivo e, se já havia prazo, pergunta se é ajuste. Retorna false se cancelou. */
async function taskDeadlineFlow(t, v) {
  if (!t.deadline || !v) { changeTaskDeadline(t, v || null, ''); return true; }
  const reason = await askReason(t.deadline, v); if (reason === null) return false;
  const isAdjust = await confirmBox({ title: 'O motivo é ajuste?', body: 'Se for ajuste, a tarefa original fica como foi entregue e o novo prazo vai para uma tarefa “[Ajuste NN]”. Se não for, é um adiamento comum da tarefa.', ok: 'Sim, é ajuste', no: 'Não é ajuste' });
  changeTaskDeadline(t, v, reason, isAdjust); return true;
}
let askingReason = false;
function askReason(from, to) {
  if (askingReason) return Promise.resolve(null);
  askingReason = true;
  return new Promise(res0 => {
    const res = (v) => { askingReason = false; res0(v); };
    let done = false;
    const l = openLayer({
      html: `<div class="dh"><h2>Alterar prazo</h2></div><div class="db"><p style="margin:0">De <b>${fmtDate(from)}</b> para <b>${to ? fmtDate(to) : 'sem prazo'}</b>. O prazo original fica guardado.</p><div class="field"><label for="rs-in">Motivo (opcional)</label><input id="rs-in" class="input" placeholder="Ex.: cliente atrasou o envio do conteúdo" autofocus></div>
        <div class="row" style="gap:6px;flex-wrap:wrap"><span class="small muted">Atalhos:</span><button class="btn sm" data-x="reason" data-r="Atraso">Atraso</button><button class="btn sm" data-x="reason" data-r="Data estava errada">Data estava errada</button></div></div>
      <div class="df"><button class="btn" data-x="no">Cancelar</button><button class="btn primary" data-x="yes">Salvar prazo</button></div>`,
      onClose: () => { if (!done) res(null); }
    });
    const ok = () => { done = true; res($('#rs-in', l.box).value); l.close(); };
    l.box.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    l.box.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x === 'yes') ok(); else if (b.dataset.x === 'reason') { const inp = $('#rs-in', l.box); if (inp) inp.value = b.dataset.r; ok(); } else { done = true; res(null); l.close(); } });
  });
}

/* Orçado × realizado por etapa: tarefas criadas pela calculadora levam "Estimado: X h" nas notas;
   compara com as horas líquidas reais de cada uma (com subtarefas). */
const estimadoDaTarefa = (t) => { const m = /Estimado:\s*([\d.,]+)\s*h/i.exec(t?.notes || ''); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null; };
function orcadoRealizadoHTML(p) {
  const ts = db.where('tempo_tasks', t => t.project_id === p.id && !t.parent_id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const linhas = ts.map(t => ({ t, est: estimadoDaTarefa(t), real: taskMs(t.id) / 36e5 })).filter(x => x.est !== null);
  if (!linhas.length) return '';
  const totE = linhas.reduce((s, x) => s + x.est, 0), totR = linhas.reduce((s, x) => s + x.real, 0);
  const pct = (r, e) => e ? Math.round(r / e * 100) : null;
  const cor = (pc) => pc === null ? '' : pc > 100 ? 'color:var(--danger)' : pc >= 80 ? 'color:var(--warn)' : '';
  const fh = (h) => fmtH(h * 36e5);
  return `<div class="panel"><div class="panel-h"><h3>Orçado × realizado</h3><span class="small muted">horas por etapa da proposta</span></div><div class="panel-b">
    <div class="calc-sum4"><span class="lbl">Etapa</span><span class="lbl v">Orçado</span><span class="lbl v">Real</span><span class="lbl v">%</span>
    ${linhas.map(x => { const pc = pct(x.real, x.est); return `<span>${esc(x.t.name)}</span><span class="v">${fh(x.est)}</span><span class="v">${fh(x.real)}</span><span class="v small" style="${cor(pc)}">${pc === null ? '—' : pc + '%'}</span>`; }).join('')}
    <span class="tot">Total</span><span class="v tot">${fh(totE)}</span><span class="v tot">${fh(totR)}</span><span class="v tot" style="${cor(pct(totR, totE))}">${pct(totR, totE) ?? '—'}${totE ? '%' : ''}</span></div>
  </div></div>`;
}

/* Margem ao vivo: a hora orçada na proposta × a hora real até agora (cai quando as horas estouram). */
function margemAoVivoHTML(p, rate) {
  const qt = p.quote_id ? db.get('tempo_quotes', p.quote_id) : null;
  const orc = Number(qt?.calc?.horaEf) || Number(qt?.calc?.rate) || 0;
  if (!orc || !rate) return '';
  const dif = Math.round((rate / orc - 1) * 100);
  const pct = Math.max(4, Math.min(100, rate / orc * 100));
  return `<span data-tip="${esc(`Hora orçada na proposta: ${fmtMoney(orc)}\nHora real até agora: ${fmtMoney(rate)} (orçamento ÷ horas trabalhadas)`)}">orçada ${fmtMoney0(orc)} · <b style="${dif < 0 ? 'color:var(--warn)' : ''}">${dif > 0 ? '+' : ''}${dif}%</b></span><span class="pm-bar" style="display:block;margin-top:4px"><span style="width:${pct.toFixed(0)}%;${dif < -20 ? 'background:var(--danger)' : ''}"></span></span>`;
}
