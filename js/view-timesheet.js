/* =====================================================================
   TIME SHEET — tela inicial
   ===================================================================== */
function selPath(sel) {
  const a = db.get('tempo_agencies', sel.agency_id), c = db.get('tempo_clients', sel.client_id), p = db.get('tempo_projects', sel.project_id), t = db.get('tempo_tasks', sel.task_id), s = db.get('tempo_tasks', sel.sub_id);
  const parts = [a ? a.name : (c && !c.agency_id ? 'Direto' : null), c?.name, p?.name, t?.name, s?.name].filter(Boolean);
  return parts;
}
function pathHTML(parts) { return parts.length ? parts.map((x, i) => i === parts.length - 1 ? `<b>${esc(x)}</b>` : `<span>${esc(x)}</span><span class="sep">›</span>`).join('') : '<span class="faint">Sessão avulsa, sem projeto</span>'; }
function entrySel(e) { const t = db.get('tempo_tasks', e.task_id); return { agency_id: e.agency_id || '', client_id: e.client_id || '', project_id: e.project_id || '', task_id: t?.parent_id ? t.parent_id : (t?.id || ''), sub_id: t?.parent_id ? t.id : '' }; }
function selToEntry(sel) {
  const p = db.get('tempo_projects', sel.project_id); const c = p ? clientOf(p) : db.get('tempo_clients', sel.client_id);
  return { agency_id: c ? (c.agency_id || null) : (sel.agency_id && sel.agency_id !== '__none' ? sel.agency_id : null), client_id: c?.id || null, project_id: p?.id || null, task_id: sel.sub_id || sel.task_id || null };
}

/* Resumo do dia: bruto, trabalho, pausas, meta do dia e lacunas (intervalos sem registro acima de 15 min). */
function dayReviewHTML(day, entries) {
  const metaH = Number(db.setting('metaDia', 6)) || 6;
  const metaMs = metaH * 3600000;
  const trab = entries.reduce((s, e) => s + entryMs(e), 0);
  const bruto = unionBrutoMs(entries);
  const pct = Math.min(100, trab / metaMs * 100);
  const ivs = entries.flatMap(e => (e.segments || []).filter(x => x.e).map(x => [new Date(x.s).getTime(), new Date(x.e).getTime()])).sort((a, b) => a[0] - b[0]);
  const gaps = []; let end = null;
  ivs.forEach(([a, b]) => { if (end !== null && a - end > 15 * 60000) gaps.push([end, a]); end = end === null ? b : Math.max(end, b); });
  if (!entries.length) return '';
  return `<div class="card" style="margin:0 0 12px">
    <div class="row between"><b>Resumo do dia</b><span class="faint small">Meta <input class="input sm mono" type="number" min="1" step="0.5" value="${metaH}" data-on="meta-dia" style="width:64px;text-align:right"> h</span></div>
    <div class="small muted" style="margin-top:4px">Bruto ${fmtDur(bruto)} · trabalho ${fmtDur(trab)} · pausas ${fmtDur(Math.max(0, bruto - trab))}</div>
    <div style="height:6px;border-radius:4px;background:var(--surface-2);overflow:hidden;margin:8px 0"><span style="display:block;height:100%;width:${pct}%;background:var(--accent)"></span></div>
    <div class="small">${pct >= 100 ? 'Meta batida' : `Faltam ${fmtDur(Math.max(0, metaMs - trab))} para a meta`}</div>
    ${gaps.length ? `<div class="lbl" style="margin-top:10px">Lacunas</div>${gaps.map(([a, b]) => `<div class="row between small"><span class="mono">${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())}</span><span class="row" style="gap:8px"><span class="mono">${fmtDur(b - a)}</span><button class="btn sm ghost" data-act="ts-manual">Lançar</button></span></div>`).join('')}` : ''}
  </div>`;
}
CHANGES['meta-dia'] = (el) => { db.setSetting('metaDia', Number(el.value) || 6); render(); };

VIEWS.timesheet = () => {
  const a = activeEntry();
  const day = parseYmd(S.tsDay);
  // a sessão em andamento fica sempre em cima; as outras seguem por horário (mais recente primeiro)
  const entries = entriesOn(day).sort((x, y) => (y.state === 'running') - (x.state === 'running'));
  const dayMs = entries.reduce((s, e) => s + entryMs(e), 0);
  const brutoDay = unionBrutoMs(entries);
  const ws = new Date(day); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  const week = [...Array(7)].map((_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return { d, ms: entriesOn(d).reduce((s, e) => s + entryMs(e), 0) }; });
  const weekMs = week.reduce((s, x) => s + x.ms, 0); const maxW = Math.max(...week.map(x => x.ms), 3600000);
  const byType = {}; entries.forEach(e => { const k = e.work_type_id || '_'; byType[k] = (byType[k] || 0) + entryMs(e); });
  const typeRows = Object.entries(byType).sort((x, y) => y[1] - x[1]);

  let timer;
  if (a) {
    const sel = entrySel(a);
    timer = `<div class="timer-card ${a.state === 'running' ? 'running' : ''}">
      <div class="row between"><span class="timer-state"><span class="dot ${a.state === 'running' ? 'live' : 'paused'}"></span>${a.state === 'running' ? 'Registrando' : 'Pausado'} · desde ${fmtTime(entryStart(a))}</span>${wtTag(a.work_type_id)}</div>
      <div class="timer-digits" data-tick="${a.id}" data-fmt="big">${bigClock(entryMs(a))}</div>
      <div class="timer-path">${pathHTML(selPath(sel))}</div>
      <div class="field"><label for="ts-notes">Notas da sessão</label><textarea id="ts-notes" class="input" data-on="ts-notes" placeholder="Interrupções, espera pelo cliente, próximo passo…" style="min-height:56px">${esc(a.notes)}</textarea></div>
      <div class="timer-actions">
        ${a.state === 'running' ? `<button class="btn" data-act="ts-pause">${icon('pause')} Pausar</button>` : `<button class="btn primary" data-act="ts-resume">${icon('play')} Retomar</button>`}
        <button class="btn" data-act="ts-switch">Trocar de projeto</button>
        <button class="btn danger" data-act="ts-stop">${icon('stop')} Encerrar</button>
        <button class="btn ghost" data-act="ts-edit" data-id="${a.id}">${icon('edit')} Revisar sessão</button>
      </div>
      ${a.segments.length > 1 ? `<div class="small muted">${a.segments.length - 1} pausa(s) · tempo pausado não conta</div>` : ''}
      ${pauseSuggestionsHTML(a)}
    </div>`;
  } else {
    const rec = recentSelections(5);
    timer = `<div class="timer-card">
      <span class="timer-state"><span class="dot"></span>Sem sessão ativa</span>
      <div class="timer-digits faint">00:00<span class="sec">:00</span></div>
      <div class="timer-actions"><button class="btn primary" data-act="ts-start">${icon('play')} Iniciar registro</button><button class="btn" data-act="ts-manual">${icon('plus')} Esqueci de iniciar</button></div>
      ${rec.length ? `<div class="stack" style="gap:6px"><span class="lbl">Continuar de onde parou</span><div class="recent">${rec.map((r, i) => `<button class="btn sm" data-act="ts-quick" data-i="${i}" title="${esc(selPath(r.sel).join(' › '))}">${icon('play')} ${esc(r.label)}</button>`).join('')}</div></div>` : ''}
    </div>`;
  }

  const strip = dayStrip(entries, day);
  const html = `
  <div class="ts-hero">
    ${timer}
    ${reportPanelHTML(day)}
  </div>
  ${dayReviewHTML(day, entries)}
  <div class="panel">
    <div class="panel-h">
      <div class="date-nav"><button class="btn sm icon" data-act="ts-shift" data-d="-1" aria-label="Dia anterior">${icon('chevL')}</button><input type="date" id="ts-date" class="input sm" style="width:auto" value="${S.tsDay}" data-on="ts-date"><button class="btn sm icon" data-act="ts-shift" data-d="1" aria-label="Próximo dia">${icon('chevR')}</button>${!isToday(day) ? `<button class="btn sm" data-act="ts-day" data-day="${ymd(new Date())}">Hoje</button>` : ''}</div>
      <span class="grow"></span><div class="row" style="gap:6px"><button class="btn sm ${corridoOn() ? '' : 'primary'}" data-act="ts-view" data-v="dia">Dia</button><button class="btn sm ${corridoOn() ? 'primary' : ''}" data-act="ts-view" data-v="corrido">Corrido</button></div><span class="muted small">${corridoOn() ? 'projetos mais recentes' : entries.length + ' sessão(ões)'}</span>
      <button class="btn sm" data-act="ts-manual">${icon('plus')} Apontamento manual</button>
    </div>
    <div class="panel-b tight">
      ${corridoOn() ? corridoHTML() : entries.length ? groupedRowsHTML(entries) : `<div class="empty">${icon('clock')}<b>Nenhum registro em ${isToday(day) ? 'hoje' : fmtDate(S.tsDay)}</b><span>Inicie o cronômetro ou lance um apontamento manual se esqueceu de registrar.</span></div>`}
    </div>
  </div>`;
  return { title: 'Time Sheet', actions: a ? '' : `<button class="btn primary" data-act="ts-start">${icon('play')} Iniciar registro</button>`, html: `<div class="home-grid"><div class="home-main">${html}</div>${sidePanelHTML()}</div>` };
};

function dayStrip(entries, day) {
  const START = 7, END = 24; const span = (END - START) * 3600000;
  const base = new Date(day); base.setHours(START, 0, 0, 0);
  let bars = '';
  entries.forEach(e => {
    const w = db.get('tempo_work_types', e.work_type_id);
    const path = entryPath(e); const col = path.project?.color || path.client?.color || w?.color;
    e.segments.forEach((s, i) => {
      const st = Math.max(0, new Date(s.s) - base), en = Math.min(span, (s.e ? new Date(s.e) : Date.now()) - base);
      if (en <= 0 || st >= span) return;
      bars += `<span class="seg-b fill" ${!s.e ? `data-strip-live="${base.getTime()}"` : ''} data-st="${st}" style="--tb:${hexOf(col)};left:${st / span * 100}%;width:${Math.max(.3, (en - st) / span * 100)}%" data-tip="${esc(`${entryTitle(e)}\n${fmtTime(s.s)} – ${s.e ? fmtTime(s.e) : 'agora'} · ${fmtDur((s.e ? new Date(s.e) : Date.now()) - new Date(s.s))}`)}"></span>`;
    });
    db.all('tempo_notices').filter(n => n.kind === 'pause' && n.status === 'accepted' && n.data?.source === 'app' && n.data?.entry_id === e.id).forEach(n => {
      const st = Math.max(0, new Date(n.data.from) - base), en = Math.min(span, new Date(n.data.to) - base);
      if (en <= 0 || st >= span) return;
      bars += `<span class="seg-b pausa" style="--ph:${pauseHatch(n.data.app || 'app')};--pg:${pauseGapOf(pauseHatch(n.data.app || 'app'))};left:${st / span * 100}%;width:${Math.max(.3, (en - st) / span * 100)}%" data-tip="${esc(`Marcada como pausa${n.data.app ? ' (' + n.data.app + ')' : ''}\n${fmtTime(n.data.from)} – ${fmtTime(n.data.to)} · ${fmtDur(new Date(n.data.to) - new Date(n.data.from))}`)}"></span>`;
    });
    entryGaps(e).forEach(g => {
      const st = Math.max(0, new Date(g.s) - base), en = Math.min(span, new Date(g.e) - base);
      if (en <= 0 || st >= span) return;
      bars += `<span class="seg-b pausa" style="--ph:${pauseHatch(g.why)};--pg:${pauseGapOf(pauseHatch(g.why))};left:${st / span * 100}%;width:${Math.max(.3, (en - st) / span * 100)}%" data-tip="${esc(`Pausa${g.why ? ' (' + g.why + ')' : ''}\n${fmtTime(g.s)} – ${fmtTime(g.e)} · ${fmtDur(new Date(g.e) - new Date(g.s))}`)}"></span>`;
    });
  });
  return `<div class="day-strip" data-report="1" data-t0="${base.getTime()}" data-span="${span}" data-ents="${entries.map(e => e.id).join(',')}" aria-label="Linha do tempo do dia">${bars}</div><div class="day-axis">${[7, 10, 13, 16, 19, 22].map(h => `<span>${pad(h)}h</span>`).join('')}<span>24h</span></div>`;
}
function updateLiveStrip(el) { const span = 17 * 3600000; const st = Number(el.dataset.st); const en = Math.min(span, Date.now() - Number(el.dataset.stripLive)); el.style.width = Math.max(.3, (en - st) / span * 100) + '%'; }

function recentSelections(n) {
  const seen = new Set(); const out = [];
  [...db.all('tempo_time_entries')].sort((a, b) => new Date(entryStart(b)) - new Date(entryStart(a))).forEach(e => {
    if (!e.project_id) return; const key = e.project_id + '|' + (e.task_id || '') + '|' + (e.work_type_id || '');
    if (seen.has(key) || out.length >= n) return; seen.add(key);
    const sel = entrySel(e); const t = db.get('tempo_tasks', e.task_id);
    out.push({ sel, wt: e.work_type_id, label: (t?.name || db.get('tempo_projects', e.project_id)?.name || '').slice(0, 34) });
  });
  return out;
}

CHANGES['ts-notes'] = (el) => { const a = activeEntry(); if (a) db.update('tempo_time_entries', a.id, { notes: el.value }, true); };
CHANGES['ts-date'] = (el) => { if (el.value) { S.tsDay = el.value; render(); } };
ACTIONS['ts-shift'] = (el) => { const d = parseYmd(S.tsDay); d.setDate(d.getDate() + Number(el.dataset.d)); S.tsDay = ymd(d); render(); };
ACTIONS['ts-day'] = (el) => { S.tsDay = el.dataset.day; if (S.route !== 'timesheet') go('timesheet'); else render(); };
ACTIONS['ts-start'] = () => openStartModal();
ACTIONS['ts-quick'] = (el) => {
  if (activeEntry()) return toast('Já existe uma sessão ativa. Encerre-a antes de iniciar outra.');
  const r = recentSelections(5)[Number(el.dataset.i)]; if (!r) return;
  startEntry({ ...selToEntry(r.sel), work_type_id: r.wt, notes: '', revision_id: null }); toast('Registro iniciado');
};
ACTIONS['ts-pause'] = () => { const a = activeEntry(); if (a?.state === 'running') { pauseEntry(a); toast('Sessão pausada'); } };
ACTIONS['ts-resume'] = () => { const a = activeEntry(); if (a?.state === 'paused') { resumeEntry(a); toast('Sessão retomada'); } };
ACTIONS['ts-stop'] = async () => { let a = activeEntry(); if (!a) return; const todas = openEntries();
  const ps = pausesOf(a.id);
  if (ps.length) { const n = ps.length; const ok = await confirmBox({ title: `${n} pausa(s) sugerida(s)`, body: `Antes de encerrar: inserir ${n === 1 ? 'a pausa sugerida' : 'as ' + n + ' pausas sugeridas'} na sessão? <br><span class="small muted">Se não, as sugestões ficam registradas como ignoradas na aba Avisos.</span>`, ok: 'Inserir e encerrar' }); if (ok) ps.forEach(n => applyPause(db.get('tempo_time_entries', a.id), n)); else ps.forEach(n => decideNotice(n, 'ignored', 'Ignorada ao encerrar a sessão')); a = db.get('tempo_time_entries', a.id); }
  todas.forEach(x => stopEntry(x)); toast(todas.length > 1 ? `${todas.length} sessões encerradas` : `Sessão encerrada · ${fmtDur(entryMs(a))}`, { actions: [{ label: 'Revisar', run: () => openEntryModal(a.id) }] }); };
/* Troca de projeto sem pausar: a sessão atual fica aberta, mas parada, e o tempo enquanto a outra roda vira "Trabalho em …". */
function switchTo(proj, taskId) {
  const cur = db.all('tempo_time_entries').find(e => e.state === 'running') || null;
  const same = (x) => x.project_id === proj.id && (x.task_id || null) === (taskId || null);
  if (cur && same(cur)) return toast('Já está nesse projeto.');
  // volta para a sessão que já existe desse projeto (mesma tarefa de preferência); só cria outra se não houver nenhuma
  const outras = openEntries().filter(x => x.id !== cur?.id && x.project_id === proj.id);
  const alvo = outras.find(same) || outras[0] || null;
  if (cur) pauseEntry(cur, null, { to: proj.id });
  if (alvo) { if (alvo.state === 'paused') resumeEntry(alvo); }
  else { const c = clientOf(proj); db.insert('tempo_time_entries', { agency_id: c?.agency_id || null, client_id: c?.id || null, project_id: proj.id, task_id: taskId || null, work_type_id: lastWorkType(proj.id), revision_id: null, notes: '', state: 'running', segments: [{ s: nowISO(), e: null }], edits: [] }); }
  db.emit();
  toast(`Agora em ${tkProjectLabel(proj)}`);
}
ACTIONS['ts-switch'] = () => {
  const l = openLayer({
    render: () => `<div class="dh"><h2>Trocar de projeto</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:8px">
        <div class="field"><label for="sw-proj">Projeto</label><select id="sw-proj" class="input"><option value="">Escolha um projeto</option>${tkProjectsSorted().map(p => `<option value="${esc(p.id)}">${esc(tkProjectLabel(p))}</option>`).join('')}</select></div>
        <div class="field"><label for="sw-task">Tarefa (opcional)</label><select id="sw-task" class="input" disabled><option value="">Sem tarefa</option></select></div>
        <div class="row"><button class="btn primary" data-x="sw-ok">Trocar</button><span class="small muted">A sessão atual fica aberta e para de contar até você voltar.</span></div>
      </div>`,
    onMount: (ly) => {
      const proj = ly.box.querySelector('#sw-proj'), task = ly.box.querySelector('#sw-task');
      proj.addEventListener('change', () => { const ts = proj.value ? db.where('tempo_tasks', t => t.project_id === proj.value) : []; task.innerHTML = `<option value="">Sem tarefa</option>${ts.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}`; task.disabled = !proj.value; });
      ly.box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-x="sw-ok"]'); if (!b) return; if (!proj.value) return toast('Escolha um projeto.'); const p = db.get('tempo_projects', proj.value); ly.close(); switchTo(p, task.value || null); });
    },
  });
};
ACTIONS['ts-edit'] = (el) => openEntryModal(el.dataset.id);
ACTIONS['ts-manual'] = () => openEntryModal(null);

/* ---------- seletor hierárquico ---------- */
function pickerHTML(sel, q = '') {
  const col = (title, items, key, cur, extra = '') => `<div class="pcol"><div class="pcol-h">${title}</div><div class="pcol-b">${extra}${items.length ? items.map(x => `<button type="button" class="popt ${cur === x.id ? 'on' : ''}" data-act="pk" data-k="${key}" data-v="${x.id}">${x.color ? `<span class="cdot fill" style="--tb:${hexOf(x.color)}"></span>` : ''}<span class="n">${esc(x.name)}</span></button>`).join('') : `<span class="faint small" style="padding:6px 8px">${x_empty(key, sel)}</span>`}</div></div>`;
  const ags = agencies();
  const cls = sel.agency_id ? clients(sel.agency_id) : clients();
  const situ = db.setting('pkSitu', 'active') === 'all' ? 'all' : 'active';
  const okSitu = (p) => situ === 'all' ? statusCat(p.status_id) !== 'cancelled' : !['done', 'cancelled'].includes(statusCat(p.status_id));
  const prs = projects().filter(p => sel.client_id ? p.client_id === sel.client_id : sel.agency_id ? cls.some(c => c.id === p.client_id) : true).filter(okSitu).sort((a, b) => a.name.localeCompare(b.name));
  const tks = sel.project_id ? tasksOf(sel.project_id) : [];
  const sbs = sel.task_id ? subtasksOf(sel.task_id) : [];
  let results = '';
  if (q.trim().length > 1) {
    const qq = q.toLowerCase(); const hits = [];
    projects().filter(okSitu).forEach(p => { if (p.name.toLowerCase().includes(qq) || clientOf(p)?.name.toLowerCase().includes(qq)) hits.push({ k: 'project_id', id: p.id, label: p.name, sub: clientOf(p)?.name }); });
    db.all('tempo_tasks').forEach(t => { if (t.name.toLowerCase().includes(qq)) { const p = db.get('tempo_projects', t.project_id); hits.push({ k: t.parent_id ? 'sub_id' : 'task_id', id: t.id, label: t.name, sub: p?.name }); } });
    results = `<div class="panel" style="max-height:200px;overflow:auto">${hits.length ? hits.slice(0, 12).map(h => `<button type="button" class="popt" style="width:100%" data-act="pk" data-k="${h.k}" data-v="${h.id}"><span class="n"><b>${esc(h.label)}</b> <span class="faint">· ${esc(h.sub || '')}</span></span></button>`).join('') : '<div class="faint small" style="padding:10px">Nada encontrado.</div>'}</div>`;
  }
  return `<div class="stack" style="gap:8px">
    <div class="row" style="gap:8px"><div class="grow" style="position:relative"><input id="pk-q" class="input" placeholder="Buscar projeto ou tarefa…" value="${esc(q)}" data-input="pk-q" autocomplete="off"></div><div class="seg" style="display:flex;gap:4px"><button type="button" class="btn sm ${situ === 'active' ? 'primary' : ''}" data-act="pk-situ" data-v="active">Ativos</button><button type="button" class="btn sm ${situ === 'all' ? 'primary' : ''}" data-act="pk-situ" data-v="all">Todos</button></div>${Object.values(sel).some(Boolean) ? '<button type="button" class="btn sm ghost" data-act="pk-clear">Limpar seleção</button>' : ''}</div>
    ${results}
    <div class="picker">
      ${col('Agência', ags, 'agency_id', sel.agency_id, `<button type="button" class="popt none ${sel.agency_id === '__none' ? 'on' : ''}" data-act="pk" data-k="agency_id" data-v="__none"><span class="n">Sem agência (direto)</span></button>`)}
      ${col('Cliente', cls, 'client_id', sel.client_id)}
      ${col('Projeto', prs, 'project_id', sel.project_id, sel.client_id ? `<button type="button" class="popt" data-act="pk-newproj" style="color:var(--accent)"><span class="n">+ Novo projeto</span></button>` : '')}
      ${col('Tarefa', tks, 'task_id', sel.task_id)}
      ${col('Subtarefa <span style="text-transform:none;letter-spacing:0">(opcional)</span>', sbs, 'sub_id', sel.sub_id)}
    </div>
    <div class="timer-path small">${pathHTML(selPath(sel))}</div>
  </div>`;
}
function x_empty(key, sel) {
  return { agency_id: 'Nenhuma agência cadastrada', client_id: 'Nenhum cliente', project_id: 'Nenhum projeto', task_id: sel.project_id ? 'Sem tarefas' : 'Escolha um projeto', sub_id: sel.task_id ? 'Sem subtarefas' : '—' }[key];
}
const statusCat = (id) => db.get('tempo_status_options', id)?.category;
/* Aplica um clique no seletor, preenchendo níveis superiores quando a relação é única. */
function pickApply(sel, k, v) {
  const order = ['agency_id', 'client_id', 'project_id', 'task_id', 'sub_id'];
  if (sel[k] === v && k !== 'agency_id') { sel[k] = ''; order.slice(order.indexOf(k) + 1).forEach(x => sel[x] = ''); return; }
  sel[k] = v; order.slice(order.indexOf(k) + 1).forEach(x => sel[x] = '');
  if (k === 'sub_id') { const s = db.get('tempo_tasks', v); sel.sub_id = v; sel.task_id = s.parent_id; k = 'task_id'; v = s.parent_id; sel.sub_id = s.id; }
  if (k === 'task_id') { const t = db.get('tempo_tasks', v); sel.project_id = t.project_id; }
  if (['task_id', 'project_id'].includes(k) || sel.project_id) { const p = db.get('tempo_projects', sel.project_id); if (p) { sel.client_id = p.client_id; } }
  if (sel.client_id) { const c = db.get('tempo_clients', sel.client_id); sel.agency_id = c?.agency_id || '__none'; }
}
function bindPicker(layer, sel, rerender) {
  let q = '';
  const host = layer.box.querySelector('[data-picker]');
  const draw = () => { host.innerHTML = pickerHTML(sel, q); rerender && rerender(); };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="pk"]'); const c = e.target.closest('[data-act="pk-clear"]');
    const si = e.target.closest('[data-act="pk-situ"]'); if (si) { e.stopPropagation(); db.setSetting('pkSitu', si.dataset.v); draw(); return; }
    if (c) { e.stopPropagation(); Object.keys(sel).forEach(k => sel[k] = ''); q = ''; draw(); return; }
    const np = e.target.closest('[data-act="pk-newproj"]');
    if (np) { e.stopPropagation(); openProjectForm(null, sel.client_id, (p) => { pickApply(sel, 'project_id', p.id); draw(); }); return; }
    if (!b) return; e.stopPropagation(); pickApply(sel, b.dataset.k, b.dataset.v);
    if (['project_id', 'task_id', 'sub_id'].includes(b.dataset.k)) q = '';
    draw();
  }, true);
  host.addEventListener('input', (e) => { if (e.target.id === 'pk-q') { q = e.target.value; const pos = e.target.selectionStart; draw(); const i = host.querySelector('#pk-q'); i.focus(); i.setSelectionRange(pos, pos); } });
  draw();
}
const blankSel = () => ({ agency_id: '', client_id: '', project_id: '', task_id: '', sub_id: '' });
function defaultWorkType(sel) { const t = db.get('tempo_tasks', sel.sub_id) || db.get('tempo_tasks', sel.task_id); const p = t?.parent_id ? db.get('tempo_tasks', t.parent_id) : null; return t?.work_type_id || p?.work_type_id || ''; }

/* Revisão ao iniciar: mostra a última sessão concluída daquela tarefa antes de começar. */
function lastSessionText(sel) {
  const tid = sel.sub_id || sel.task_id; if (!tid) return '';
  const last = db.where('tempo_time_entries', e => e.state === 'done' && e.task_id === tid).sort((a, b) => (entryStart(b) || '').localeCompare(entryStart(a) || ''))[0];
  if (!last) return '';
  const note = (last.notes || '').split('\n').find(l => l.trim() && !/^\d{2}:\d{2}–/.test(l));
  return `Última sessão desta tarefa: ${fmtDate(ymd(new Date(entryStart(last))))} · ${fmtTime(entryStart(last))}–${fmtTime(entryEnd(last))} · ${fmtDur(entryMs(last))}${note ? ' · ' + note : ''}`;
}
function openStartModal(preset) {
  if (activeEntry()) { toast('Já existe uma sessão ativa. Encerre ou pause antes de iniciar outra.'); go('timesheet'); return; }
  const sel = Object.assign(blankSel(), preset || {});
  const now = new Date(); const nightOrWeekend = now.getDay() === 0 || now.getDay() === 6 || now.getHours() >= 22 || now.getHours() < 8;
  const ctxRule = db.all('tempo_reminders').find(r => r.kind === 'context' && r.nightWeekendOnly);
  const l = openLayer({
    wide: true,
    html: `<div class="dh">${icon('play')}<h2>Iniciar registro</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db">
      <div data-picker></div>
      <div id="st-last" class="small muted"></div>
      <div class="grid2">
        <div class="field"><label for="st-wt">Tipo de trabalho</label><select id="st-wt" class="input" name="work_type_id">${options(workTypes(), defaultWorkType(sel), { empty: true, emptyLabel: 'Sem tipo' })}</select></div>
        <div class="field"><label for="st-notes">Notas</label><input id="st-notes" class="input" name="notes" placeholder="Opcional"></div>
      </div>
      ${nightOrWeekend ? `<div class="banner info small">${icon('bell')} ${ctxRule?.active ? 'Fora do horário comercial: o lembrete de hora em hora está ativo.' : 'Fora do horário comercial. O lembrete “Noite e fim de semana” está desligado nas Preferências.'}</div>`
        : `<label class="check small"><input type="checkbox" name="hourly" id="st-hourly"> Lembrar de hora em hora enquanto esta sessão estiver ativa</label>`}
    </div>
    <div class="df"><span class="left small muted">Sem seleção, vira uma sessão avulsa.</span><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="go">${icon('play')} Iniciar</button></div>`
  });
  const showLast = () => { const el = $('#st-last', l.box); if (el) el.textContent = lastSessionText(sel); };
  bindPicker(l, sel, () => { const w = $('#st-wt', l.box); const d = defaultWorkType(sel); if (d && w) w.value = d; showLast(); });
  showLast();
  l.box.addEventListener('click', (e) => {
    if (!e.target.closest('[data-x="go"]')) return;
    const f = formData(l.box);
    const ent = startEntry({ ...selToEntry(sel), work_type_id: f.work_type_id || null, notes: f.notes || '', revision_id: null });
    if (f.hourly) db.insert('tempo_reminders', { name: 'De hora em hora (sessão atual)', kind: 'stop', active: true, days: 'date', date: ymd(new Date()), customDays: [], freq: 'interval', time: '00:00', intervalHours: 1, nightWeekendOnly: false, done: false, lastFired: new Date().toISOString(), entry_id: ent?.id }, true);
    l.close(); toast('Registro iniciado'); if (S.route !== 'timesheet') render();
  });
}

/* ---------- editar / apontamento manual ---------- */
function openEntryModal(id) {
  const e = id ? db.get('tempo_time_entries', id) : null;
  const sel = e ? entrySel(e) : blankSel();
  const today = S.tsDay || ymd(new Date());
  let segs = e ? clone(e.segments) : [{ s: new Date(`${today}T09:00`).toISOString(), e: new Date(`${today}T10:00`).toISOString() }];
  let showPicker = !e;
  const LOG_RE = /^\d{2}:\d{2}–\d{2}:\d{2} .+$/;
  const allLines = (e?.notes || '').split('\n');
  const logLines = allLines.filter(l => LOG_RE.test(l));
  const userNotes = allLines.filter(l => !LOG_RE.test(l)).join('\n');
  let openSeg = null; // intervalo com a caixa aberta para edição
  const hm = (iso) => `${pad(new Date(iso).getHours())}:${pad(new Date(iso).getMinutes())}`;
  const partesDe = (iso) => iso ? { d: fmtDate(ymd(new Date(iso))), t: hm(iso) } : { d: '', t: '' };
  const campoTempo = (i, k, iso, aberto) => {
    const p = partesDe(iso);
    return `<input class="input sm seg-d" data-seg="${i}" data-k="${k}" data-part="d" value="${p.d}" placeholder="dd/mm/aaaa" inputmode="numeric" autocomplete="off" aria-label="Data ${k === 's' ? 'de início' : 'de fim'}">
      <input class="input sm seg-t" data-seg="${i}" data-k="${k}" data-part="t" value="${p.t}" placeholder="${aberto ? 'em andamento' : 'hh:mm'}" inputmode="numeric" autocomplete="off" aria-label="Hora ${k === 's' ? 'de início' : 'de fim'}">`;
  };
  const segBox = (i) => {
    const s = segs[i];
    const head = `<button type="button" class="tbox ${openSeg === i ? 'on' : ''}" data-x="edit-seg" data-i="${i}"><span>${hm(s.s)}</span><span class="faint">→</span><span>${s.e ? hm(s.e) : 'agora'}</span><span class="tlabel">Trabalhado</span></button>`;
    if (openSeg !== i) return head;
    const aberto = !s.e && e && e.state !== 'done' && i === segs.length - 1;
    return head + `<div class="seg-edit">
      <div class="seg-linha">${campoTempo(i, 's', s.s, false)}<span class="faint">→</span>${campoTempo(i, 'e', s.e, aberto)}</div>
      ${segs.length > 1 ? `<button class="btn sm ghost" data-x="delseg" data-i="${i}" aria-label="Remover intervalo">${icon('x')} Remover intervalo</button>` : ''}
    </div>`;
  };
  const segDaysHTML = () => {
    const items = [];
    segs.forEach((s, i) => {
      if (i > 0 && segs[i - 1].e && s.s && new Date(s.s) > new Date(segs[i - 1].e)) items.push({ gap: true, from: segs[i - 1].e, to: s.s, day: ymd(new Date(segs[i - 1].e)) });
      items.push({ i, day: ymd(new Date(s.s)) });
    });
    const days = [...new Set(items.map(x => x.day))];
    return days.map(day => `<div class="seg-day"><div class="seg-day-h">${fmtDate(day)}</div>${items.filter(x => x.day === day).map(x => x.gap
      ? `<div class="tbox gap"><span>${hm(x.from)}</span><span class="faint">→</span><span>${hm(x.to)}</span><span class="tlabel">Pausa</span></div>`
      : segBox(x.i)).join('')}</div>`).join('');
  };
  const render_ = () => {
    const p = db.get('tempo_projects', sel.project_id);
    const revs = p ? db.where('tempo_revisions', r => r.project_id === p.id) : [];
    const total = segs.reduce((s, x) => s + ((x.e ? new Date(x.e) : Date.now()) - new Date(x.s)), 0);
    return `<div class="dh">${icon(e ? 'edit' : 'plus')}<h2>${e ? (e.state === 'done' ? 'Editar sessão' : 'Revisar sessão em andamento') : 'Apontamento manual'}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db">
      ${showPicker ? '<div data-picker></div>' : `<div class="row subtle-box"><div class="timer-path grow">${pathHTML(selPath(sel))}</div><button class="btn sm" data-x="pick">Alterar</button></div>`}
      <div class="grid2">
        <div class="field"><label for="em-wt">Tipo de trabalho</label><select id="em-wt" class="input" name="work_type_id">${options(workTypes(), e?.work_type_id || defaultWorkType(sel), { empty: true, emptyLabel: 'Sem tipo' })}</select></div>
        <div class="field"><label for="em-rev">Rodada de revisão</label><select id="em-rev" class="input" name="revision_id" ${revs.length ? '' : 'disabled'}>${options(revs, e?.revision_id, { empty: true, emptyLabel: revs.length ? 'Não é revisão' : 'Projeto sem rodadas', label: r => `Rodada ${r.number} — ${r.description.slice(0, 40)}` })}</select></div>
      </div>
      ${e ? actSectionHTML(e) : ''}
      <div class="field"><label for="em-notes">Notas</label><textarea id="em-notes" class="input" name="notes">${esc(userNotes)}</textarea></div>
      <div class="grid2" style="align-items:start">
        <div class="stack" style="gap:8px">
          <div class="row between"><span class="lbl">Intervalos trabalhados</span><span class="mono small">Total ${fmtDur(total)}</span></div>
          ${segDaysHTML()}
          <div class="row"><button class="btn sm" data-x="addseg">${icon('plus')} Adicionar intervalo (após pausa)</button>${e && e.state !== 'done' ? '<span class="small muted">Deixe o último fim vazio para continuar contando.</span>' : ''}</div>
        </div>
        <div>${e ? actLogFootHTML(e, logLines) : ''}</div>
      </div>
      ${e ? `<div class="field"><label for="em-reason">Motivo da correção</label><input id="em-reason" class="input" name="reason" placeholder="Ex.: esqueci de pausar no almoço"><span class="hint">Fica guardado no histórico da sessão junto com os horários anteriores.</span></div>` : ''}
      ${e?.edits?.length ? `<div class="stack" style="gap:6px"><span class="lbl">Histórico de correções</span><div class="timeline">${e.edits.slice().reverse().map(x => `<div class="tl"><span class="w">${fmtDateTime(x.at)}</span><span class="b"></span><span>${esc(x.reason || 'Sem motivo informado')}<br><span class="faint small">Antes: ${x.before.map(s => `${fmtTime(s.s)}–${s.e ? fmtTime(s.e) : '…'}`).join(', ')}</span></span></div>`).join('')}</div></div>` : ''}
    </div>
    <div class="df">${e ? `<button class="btn danger left" data-x="del">${icon('trash')} Excluir</button>` : ''}<button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="save">Salvar</button></div>`;
  };
  const syncRev = (ly) => {
    const r = ly.box.querySelector('#em-rev'); const w = ly.box.querySelector('#em-wt'); if (!r) return;
    const revs = sel.project_id ? db.where('tempo_revisions', x => x.project_id === sel.project_id) : [];
    r.disabled = !revs.length; r.innerHTML = options(revs, '', { empty: true, emptyLabel: revs.length ? 'Não é revisão' : 'Projeto sem rodadas', label: x => `Rodada ${x.number} — ${x.description.slice(0, 40)}` });
    const d = defaultWorkType(sel); if (d && w) w.value = d;
  };
  const l = openLayer({ wide: true, render: render_, onClose: () => { ACT_SEL = null; }, onMount: (ly) => { if (showPicker) bindPicker(ly, sel, () => syncRev(ly)); } });
  const keepForm = () => { const f = formData(l.box); return f; };
  window.actRedrawHook = () => redraw();   // a faixa de atividade chama isto depois de mover um intervalo
  const redraw = () => { const f = keepForm(); l.refresh(); ['work_type_id', 'revision_id', 'notes', 'reason'].forEach(k => { const el = l.box.querySelector(`[name="${k}"]`); if (el && f[k] !== undefined) el.value = f[k]; }); };
  l.box.addEventListener('change', (ev) => {
    const i = ev.target.dataset.seg; if (i === undefined) return;
    const k = ev.target.dataset.k;
    const dEl = l.box.querySelector(`[data-seg="${i}"][data-k="${k}"][data-part="d"]`);
    const tEl = l.box.querySelector(`[data-seg="${i}"][data-k="${k}"][data-part="t"]`);
    const dia = parseDataBR(dEl.value), hora = parseHora(tEl.value);
    if (!dia && !hora && k === 'e' && !dEl.value.trim() && !tEl.value.trim()) { segs[i].e = null; return redraw(); }
    if (!dia || !hora) { toast('Use data dd/mm/aaaa e hora hh:mm.'); return redraw(); }
    segs[i][k] = new Date(`${dia}T${hora}`).toISOString(); redraw();
  });
  l.box.addEventListener('click', async (ev) => {
    // trecho movido: clicar abre o projeto de destino
    const mv = ev.target.closest('.act-moved[data-pid]');
    if (mv && mv.dataset.pid) { l.close(); return openProject(mv.dataset.pid); }
    // clicar num trecho da faixa "Por programa": esse trecho / todos / selecionar
    const sg = ev.target.closest('.act-strip[data-mode="program"] .act-b[data-g]');
    if (sg && !ACT_SEL) {
      const chip = Array.from(l.box.querySelectorAll('[data-x="act-chip"]')).find(c => c.dataset.g === sg.dataset.g);
      return openProgChoice([e.id], sg.dataset.g, chip ? chip.dataset.label : 'Programa', { seg: { a: +sg.dataset.a, b: +sg.dataset.b }, redraw });
    }
    const b = ev.target.closest('[data-x]'); if (!b) return;
    const x = b.dataset.x;
    if (x === 'act-fora-toggle') { db.setSetting('actShowFora', !db.setting('actShowFora', true)); return redraw(); }
    if (x === 'edit-seg') { const i = Number(b.dataset.i); openSeg = openSeg === i ? null : i; redraw(); return; }
    if (x === 'pick') { showPicker = true; redraw(); }
    if (x === 'act-chip') { if (b.dataset.mode === 'file') openActGroup(e.id, b.dataset.g, redraw); else openProgChoice([e.id], b.dataset.g, b.dataset.label || 'Programa', { redraw }); return; }
    if (x === 'addseg') { const last = segs[segs.length - 1]; const base = last.e ? new Date(last.e) : new Date(); const s = new Date(base.getTime() + 30 * 60000); segs.push({ s: s.toISOString(), e: new Date(s.getTime() + 3600000).toISOString() }); redraw(); }
    if (x === 'delseg') { segs.splice(Number(b.dataset.i), 1); openSeg = null; redraw(); }
    if (x === 'del') {
      if (!await confirmBox({ title: 'Excluir sessão?', body: `A sessão de ${fmtDur(entryMs(e))} sai dos totais e relatórios. Não dá para desfazer.`, ok: 'Excluir', danger: true })) return;
      db.remove('tempo_time_entries', e.id); l.close(); toast('Sessão excluída');
    }
    if (x === 'save') {
      const f = formData(l.box);
      const running = e && e.state !== 'done';
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]; const lastOpen = running && i === segs.length - 1;
        if (!s.s || (!s.e && !lastOpen)) return toast('Preencha início e fim de todos os intervalos.');
        if (s.e && new Date(s.e) <= new Date(s.s)) return toast('O fim de um intervalo precisa ser depois do início.');
        if (i && new Date(s.s) < new Date(segs[i - 1].e)) return toast('Os intervalos não podem se sobrepor.');
      }
      if (!running && new Date(segs[segs.length - 1].e) > new Date()) return toast('O apontamento não pode terminar no futuro.');
      const data = { ...selToEntry(sel), work_type_id: f.work_type_id || null, revision_id: f.revision_id || null, notes: [(f.notes || '').replace(/\s+$/, ''), ...logLines].filter(Boolean).join('\n'), segments: segs };
      if (e) {
        const changed = JSON.stringify(e.segments) !== JSON.stringify(segs);
        if (running) { data.state = segs[segs.length - 1].e ? 'paused' : 'running'; }
        db.update('tempo_time_entries', e.id, { ...data, edits: changed || f.reason ? auditEdit(e, e.segments, f.reason) : e.edits });
        toast('Sessão atualizada');
      } else {
        db.insert('tempo_time_entries', { ...data, state: 'done', edits: [], manual: true });
        S.tsDay = ymd(segs[0].s); toast('Apontamento lançado');
      }
      l.close();
    }
  });
}

/* dica flutuante das barras do dia: o que é e quanto tempo durou */
let stripTip = null;
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest?.('.seg-b[data-tip]'); if (!b) return;
  if (!stripTip) { stripTip = document.createElement('div'); stripTip.className = 'strip-tip'; document.body.appendChild(stripTip); }
  stripTip.textContent = b.dataset.tip; stripTip.style.display = 'block';
});
document.addEventListener('mousemove', (e) => {
  if (!stripTip || stripTip.style.display !== 'block') return;
  const x = Math.min(e.clientX + 12, innerWidth - stripTip.offsetWidth - 8);
  stripTip.style.left = Math.max(8, x) + 'px'; stripTip.style.top = (e.clientY - stripTip.offsetHeight - 10 < 8 ? e.clientY + 16 : e.clientY - stripTip.offsetHeight - 10) + 'px';
});
document.addEventListener('mouseout', (e) => { if (stripTip && e.target.closest?.('.seg-b[data-tip]')) stripTip.style.display = 'none'; });


/* Sessões do mesmo projeto, tarefa e título (ex.: várias do "Time Sheet") viram um item recolhível.
   Ao abrir, mostram todas; as tags de tipo de todas as sessões do grupo aparecem no item. Sessões em andamento ficam sozinhas. */
function entrySub(e) {
  const x = entryPath(e);
  return [x.agency?.name || (x.client ? 'Direto' : null), x.client?.name, x.project?.name, x.subtask ? x.task?.name : null].filter(Boolean).join(' › ');
}
/* Caminho da sessão: agência e cliente em caixinhas coloridas; projeto e tarefas em texto puro. */
function entryPathHTML(e) {
  const x = entryPath(e);
  const head = x.client ? clientTag(x.client) : (x.agency ? agencyTag(x.agency) : '');
  const rest = [x.project?.name, x.subtask ? x.task?.name : null].filter(Boolean).map(n => esc(n));
  if (!head && !rest.length) return 'Sem projeto';
  return `<span class="row" style="gap:6px;flex-wrap:wrap">${head}${head && rest.length ? '<span class="faint">›</span>' : ''}${rest.join(' <span class="faint">›</span> ')}</span>`;
}
function entryRowHTML(e) {
  const x = entryPath(e); const sub = entrySub(e);
  return `<div class="entry" data-act="ts-edit" data-id="${e.id}">
          <span class="when">${fmtTime(entryStart(e))}–${e.state === 'done' ? fmtTime(entryEnd(e)) : '…'}</span>
          <div class="what"><div class="t">${esc(entryTitle(e))} ${e.state !== 'done' ? `<span class="tag pill c-blue small">${e.state === 'running' ? 'em andamento' : 'pausada'}</span>` : ''}${e.edits?.length ? ' <span class="inh" title="Editada">editada</span>' : ''}${e.revision_id ? ' <span class="inh">revisão</span>' : ''}</div>
          <div class="p">${entryPathHTML(e)}${e.notes && x.project ? ' · ' + esc(e.notes.split('\n')[0]) : ''}</div></div>
          <div class="row" style="justify-content:flex-end;gap:10px"><span class="hide-sm">${wtTag(e.work_type_id)}</span><span class="dur" ${e.state !== 'done' ? `data-tick="${e.id}"` : ''}>${e.state !== 'done' ? fmtClock(entryMs(e)) : fmtDur(entryMs(e))}</span></div>
        </div>`;
}
function groupedRowsHTML(entries) {
  const groups = new Map();
  entries.forEach(e => {
    const key = e.state === 'done' ? `${entryTitle(e)}|${entrySub(e)}` : `run:${e.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  return [...groups.values()].map(list => {
    if (list.length === 1) return entryRowHTML(list[0]);
    const first = list.reduce((m, e) => (new Date(entryStart(e)) < new Date(m) ? entryStart(e) : m), entryStart(list[0]));
    const last = list.reduce((m, e) => (new Date(entryEnd(e)) > new Date(m) ? entryEnd(e) : m), entryEnd(list[0]));
    const tags = [...new Set(list.map(e => e.work_type_id || ''))].map(id => wtTag(id || null)).join('');
    const total = list.reduce((s, e) => s + entryMs(e), 0);
    return `<details class="grp-det">
      <summary class="entry grp-sum">
        <span class="when">${fmtTime(first)}–${fmtTime(last)}</span>
        <div class="what"><div class="t">${esc(entryTitle(list[0]))} <span class="tag pill small">${list.length} sessões</span></div><div class="p">${entryPathHTML(list[0])}</div></div>
        <div class="row" style="justify-content:flex-end;gap:10px"><span style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${tags}</span><span class="dur">${fmtDur(total)}</span><span class="faint grp-caret">▾</span></div>
      </summary>
      <div class="grp-kids">${list.map(entryRowHTML).join('')}</div>
    </details>`;
  }).join('');
}
