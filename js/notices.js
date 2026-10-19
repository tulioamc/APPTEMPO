/* =====================================================================
   AVISOS E TO-DO (v2.01)
   Tudo fica em tempo_notices: sugestões de pausa, alertas automáticos,
   lembretes exibidos e tarefas manuais. Decisões (aceito, ignorado, adiado)
   são registradas para sempre e aparecem na aba Avisos, ordenadas por data.
   ===================================================================== */

const NOTICE_KINDS = { conta: ['Conta a pagar', 'money'], pause: ['Pausa', 'alert'], prazo: ['Prazo', 'clock'], cobranca: ['Cobrança', 'money'], orcamento: ['Orçamento', 'doc'], reminder: ['Lembrete', 'bell'], todo: ['To-do', 'check'] };
const noticeKind = (k) => NOTICE_KINDS[k] || [k, 'bell'];

/* Cria um aviso pendente. A chave evita duplicar o mesmo aviso (ex.: mesmo prazo no mesmo dia). */
function addNotice(o, silent) {
  if (o.key && SCAN_SEEN) SCAN_SEEN.add(o.key);
  const old = o.key ? db.all('tempo_notices').find(n => n.key === o.key) : null;
  if (old && !['prazo', 'cobranca', 'orcamento', 'conta'].includes(o.kind)) return null;
  if (old) {
    // mesma situação: atualiza o texto no lugar; se já foi resolvida/decidida e o caso voltou ou mudou, reabre como pendente
    const changed = old.title !== o.title || old.body !== o.body;
    const back = old.status !== 'pending' && old.status !== 'snoozed' && (changed || String(old.decision || '').startsWith('Resolvido'));
    if (changed || back) {
      db.update('tempo_notices', old.id, back ? { title: o.title, body: o.body, data: o.data || {}, status: 'pending', decision: '', decided_at: null, snooze_until: null } : { title: o.title, body: o.body, data: o.data || {} }, true);
      if (SCAN_SEEN) SCAN_CHANGED = true;
    }
    return null;
  }
  if (SCAN_SEEN) SCAN_CHANGED = true;
  return db.insert('tempo_notices', { status: 'pending', decision: '', decided_at: null, snooze_until: null, data: {}, ...o }, !!silent);
}
/* Registra a decisão do aviso e mantém o histórico. */
function decideNotice(n, status, decision, extra) {
  if (!n) return;
  db.update('tempo_notices', n.id, { status, decision: decision || '', decided_at: nowISO(), snooze_until: null, ...(extra || {}) }, true);
}
const noticeButtons = (n) => {
  if (n.status !== 'pending') return '';
  if (n.kind === 'pause') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-accept" data-id="${n.id}">Aceitar</button><button class="btn sm" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
  if (n.kind === 'activity') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-accept" data-id="${n.id}">Adicionar à nota</button><button class="btn sm" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
  if (n.kind === 'todo') return '';
  return `<div class="row gap-s"><button class="btn sm" data-act="notice-ack" data-id="${n.id}">Ok, visto</button><button class="btn sm ghost" data-act="notice-snooze" data-id="${n.id}">Adiar 1 dia</button><button class="btn sm ghost" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
};
ACTIONS['notice-accept'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  if (n.kind === 'pause') { const a = db.get('tempo_time_entries', n.data.entry_id); if (a && a.state === 'running') applyPause(a, n, 'insert'); else decideNotice(n, 'ignored', 'Sessão já encerrada'); }
  else if (n.kind === 'activity') {
    const a = db.get('tempo_time_entries', n.data.entry_id);
    if (a && a.state !== 'done') { const d = n.data; learnFolderRule(d.folder, a.project_id, (entryPath(a).client || {}).id); const line = `${fmtTime(d.from)}–${fmtTime(d.to)} ${d.app}${d.doc ? ' · ' + d.doc : ''}${d.folder ? ' (' + d.folder + ')' : ''}`; db.update('tempo_time_entries', a.id, { notes: (a.notes ? a.notes + '\n' : '') + line }, true); decideNotice(n, 'accepted', 'Adicionada à nota da sessão'); }
    else decideNotice(n, 'ignored', 'Sessão já encerrada');
  }
  else decideNotice(n, 'accepted', 'Aceito');
  db.emit();
};
ACTIONS['notice-ignore'] = (el) => { decideNotice(db.get('tempo_notices', el.dataset.id), 'ignored', 'Ignorado'); db.emit(); };
ACTIONS['notice-ack'] = (el) => { decideNotice(db.get('tempo_notices', el.dataset.id), 'accepted', 'Visto'); db.emit(); };
ACTIONS['notice-snooze'] = (el) => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  db.update('tempo_notices', el.dataset.id, { status: 'snoozed', snooze_until: ymd(d), decision: `Adiado para ${fmtDate(ymd(d))}` }, true); db.emit();
};
ACTIONS['notice-reopen'] = (el) => { db.update('tempo_notices', el.dataset.id, { status: 'pending', decision: '' }, true); db.emit(); };
ACTIONS['notice-filter'] = (el) => { S.nt = el.dataset.f; render(); };

/* Clique no aviso: leva até onde dá para resolver. Não muda o aviso; ele só muda com "Ok, visto"/Aceitar/Ignorar. */
function noticeGoto(n) {
  if (n.kind === 'pause' && n.data && n.data.entry_id) {
    if (S.route !== 'timesheet') go('timesheet');
    if (db.get('tempo_time_entries', n.data.entry_id)) openEntryModal(n.data.entry_id);
    else toast('Essa sessão não existe mais.');
    return;
  }
  if (n.entity === 'project' && n.entity_id) return openProject(n.entity_id);
  if (n.entity === 'quote') return go('quotes');
  if (n.entity === 'expense') {
    const r = db.get('tempo_expenses', n.entity_id);
    if (r && r.month) { S.exFrom = r.month; S.exTo = r.month; }
    return go('expenses');
  }
  toast('Este aviso não tem para onde ir.');
}
ACTIONS['notice-open'] = (el) => { const n = db.get('tempo_notices', el.dataset.id); if (n) noticeGoto(n); };

/* To-do: entende data e hora no texto. "Pegar Rafa às 16h" → hoje 16h; "até amanhã às 15h"; "sexta 10h"; "dia 25"; "25/10 14h"; "hoje" → até 20h. */
const TODO_DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
function parseTodoText(text) {
  const orig = String(text || '').trim(); let t = orig; const now = new Date();
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let day = null, hh = null, mi = 0;
  const sem = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // 1) data explícita: 25/10, 25/10/2026, "dia 25"
  let dm = t.match(/(?<![\p{L}\p{N}\/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\p{L}\p{N}\/])/u);
  if (dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : now.getFullYear();
    let d = new Date(y, Number(dm[2]) - 1, Number(dm[1]));
    if (!dm[3] && d < hoje) d = new Date(y + 1, Number(dm[2]) - 1, Number(dm[1]));
    if (d.getDate() === Number(dm[1])) { day = d; t = t.replace(dm[0], ' '); }
  } else {
    dm = t.match(/(?<![\p{L}\p{N}])dia\s+(\d{1,2})(?![\p{L}\p{N}])/iu);
    if (dm && Number(dm[1]) >= 1 && Number(dm[1]) <= 31) {
      let d = new Date(now.getFullYear(), now.getMonth(), Number(dm[1]));
      if (d < hoje) d = new Date(now.getFullYear(), now.getMonth() + 1, Number(dm[1]));
      if (d.getDate() === Number(dm[1])) { day = d; t = t.replace(dm[0], ' '); }
    }
  }
  // 2) dia da semana: "sexta", "terça-feira" → próxima ocorrência (hoje, se for hoje)
  if (!day) {
    const wm = t.match(/(?<![\p{L}\p{N}])(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:[\s-]+feira)?(?![\p{L}\p{N}])/iu);
    if (wm) {
      const k = TODO_DIAS[sem(wm[1])];
      const diff = (k - hoje.getDay() + 7) % 7;
      day = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + diff); t = t.replace(wm[0], ' ');
    }
  }
  // 3) hoje / amanhã / depois de amanhã
  if (!day) {
    const rm = t.match(/(?<![\p{L}\p{N}])(depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje)(?![\p{L}\p{N}])/iu);
    if (rm) { const w = sem(rm[1]); const n = w.startsWith('depois') ? 2 : w.startsWith('amanh') ? 1 : 0; day = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n); t = t.replace(rm[0], ' '); }
  }
  // 4) horário: 16h, 16h30, 16:30, às 16
  const tm = t.match(/(?<![\p{L}\p{N}])(?:[àa]s?\s+)?(\d{1,2})\s*(?::|h)\s*(\d{2})?(?![\p{L}\p{N}])/iu) || t.match(/(?<![\p{L}\p{N}])[àa]s?\s+(\d{1,2})(?![\p{L}\p{N}])/iu);
  if (tm && Number(tm[1]) <= 23 && Number(tm[2] || 0) <= 59) { hh = Number(tm[1]); mi = Number(tm[2] || 0); t = t.replace(tm[0], ' '); }
  const deadline = /(?<![\p{L}\p{N}])at[ée](?![\p{L}\p{N}])/iu.test(orig);
  const title = t.replace(/\s+/g, ' ').replace(/(?<![\p{L}\p{N}])(at[ée]|[àa]s?|de|do|da|para)\s*$/iu, '').replace(/[\s,.;:-]+$/, '').trim() || orig;
  if (!day && hh === null) return { title: orig, due: null, deadline: false };
  const d = day || hoje;
  const h = hh === null ? 20 : hh, m = hh === null ? 0 : mi;
  return { title, due: `${ymd(d)}T${pad(h)}:${pad(m)}`, deadline };
}
function todoDueLabel(data) {
  const [ds, ts] = data.due.split('T'); const [h, m] = ts.split(':').map(Number);
  const hoje = ymd(new Date()), amanha = ymd(new Date(Date.now() + 864e5));
  const quando = ds === hoje ? 'hoje' : ds === amanha ? 'amanhã' : fmtDateShort(ds);
  return `${data.deadline ? 'até ' : ''}${quando} ${m ? `${h}h${pad(m)}` : `${h}h`}`;
}

/* To-do manual */
ACTIONS['todo-add'] = () => {
  const inp = $('#todo-new'); const raw = (inp?.value || '').trim(); if (!raw) return;
  const p = parseTodoText(raw);
  db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: p.title, body: '', data: p.due ? { due: p.due, deadline: p.deadline } : {}, decision: '', decided_at: null, snooze_until: null }, true);
  db.emit();
};
ACTIONS['todo-toggle'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  const done = n.status !== 'done';
  db.update('tempo_notices', n.id, { status: done ? 'done' : 'open', decided_at: done ? nowISO() : null }, true); db.emit();
};
ACTIONS['todo-del'] = (el) => { db.remove('tempo_notices', el.dataset.id, true); db.emit(); };

/* Varredura automática: prazos, cobranças e orçamentos com validade próxima. */
let SCAN_SEEN = null; // chaves geradas nesta varredura
let SCAN_CHANGED = false; // a varredura criou ou resolveu algum aviso
function scanAlerts() {
  const today = ymd(new Date());
  SCAN_SEEN = new Set(); SCAN_CHANGED = false;
  db.all('tempo_projects').filter(p => !p.archived && p.deadline && !['Concluído', 'Cancelado'].includes(statusName(p.status_id))).forEach(p => {
    const d = daysBetween(today, p.deadline); // positivo = faltam dias
    if (d === null || d > 2) return;
    const late = d < 0;
    addNotice({ kind: 'prazo', key: `prazo:${p.id}:${p.deadline}:${late ? 'late' : 'soon'}`, title: late ? `Prazo vencido: ${p.name}` : `Prazo em ${d === 0 ? 'hoje' : d + ' dia(s)'}: ${p.name}`, body: `Entrega em ${fmtDate(p.deadline)}.`, entity: 'project', entity_id: p.id, project_id: p.id, data: { deadline: p.deadline } }, true);
  });
  db.all('tempo_projects').filter(p => !p.archived && remainingOf(p) > 0).forEach(p => {
    const pay = statusName(p.payment_status_id);
    if (pay === 'Atrasado' || (pay === 'Não Pago' && p.deadline && daysBetween(p.deadline, today) > 0)) addNotice({ kind: 'cobranca', key: `cob:${p.id}:${today.slice(0, 7)}`, title: `Cobrança: ${p.name}`, body: `Restam ${fmtMoney(remainingOf(p))} a receber.`, entity: 'project', entity_id: p.id, project_id: p.id, data: {} }, true);
  });
  db.all('tempo_quotes').filter(q => q.valid_until && !['Aprovado', 'Recusado', 'Vencido'].includes(statusName(q.status_id))).forEach(q => {
    const d = daysBetween(today, q.valid_until); if (d === null || d < 0 || d > 3) return;
    addNotice({ kind: 'orcamento', key: `orc:${q.id}:${q.valid_until}`, title: `Orçamento vence em ${d === 0 ? 'hoje' : d + ' dia(s)'}: ${q.name}`, body: 'Faça o follow-up com o cliente.', entity: 'quote', entity_id: q.id, data: {} }, true);
  });
  /* despesas com vencimento passado e ainda não pagas/recebidas */
  db.all('tempo_expenses').filter(r => r.month === today.slice(0, 7) && r.due_date && r.due_date < today && !['Pago', 'Recebido', 'Não teve'].includes(r.status)).forEach(r => {
    const inc = r.kind === 'in';
    addNotice({ kind: inc ? 'cobranca' : 'conta', key: `ex:${r.id}`, title: `${inc ? 'Recebimento atrasado' : 'Conta vencida'}: ${r.name || 'sem nome'}`, body: `Venceu em ${fmtDate(r.due_date)}${r.amount ? ` · ${fmtMoney(r.amount)}` : ''}.`, entity: 'expense', entity_id: r.id, data: {} }, true);
  });
  /* avisos automáticos (prazo, cobrança, orçamento, conta) saem sozinhos quando a situação deixa de valer:
     se a varredura não gerou mais a chave do aviso, a condição acabou (paga, entregue, data trocada, apagada...). */
  const AUTO_KINDS = ['prazo', 'cobranca', 'orcamento', 'conta'];
  const SRC_TABLE = { expense: 'tempo_expenses', project: 'tempo_projects', quote: 'tempo_quotes' };
  db.all('tempo_notices').filter(n => AUTO_KINDS.includes(n.kind) && ['pending', 'snoozed'].includes(n.status) && n.key && !SCAN_SEEN.has(n.key)).forEach(n => {
    const src = SRC_TABLE[n.entity];
    if (src && !db.all(src).length) return; // dados ainda não carregados: não resolve nada
    decideNotice(n, 'accepted', 'Resolvido: a situação mudou'); SCAN_CHANGED = true;
  });
  SCAN_SEEN = null;
  db.all('tempo_notices').filter(n => n.status === 'snoozed' && n.snooze_until && n.snooze_until <= today).forEach(n => db.update('tempo_notices', n.id, { status: 'pending', snooze_until: null }, true));
  if (SCAN_CHANGED) db.emit(); // só avisa a tela se algo mudou (evita laço)
}

/* To-do editável: clique no texto, reescreva (data e hora em linguagem natural) e confirme com Enter ou ao sair do campo. */
function todoEditRaw(n) { const d = n.data || {}; return d.due ? `${n.title} ${todoDueLabel(d)}` : n.title; }
ACTIONS['todo-edit'] = (el) => { S.todoEdit = el.dataset.id; render(); setTimeout(() => { const i = $('#todo-edit'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); };
ACTIONS['todo-key'] = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } else if (e.key === 'Escape') { S.todoEdit = null; render(); } };
ACTIONS['todo-save'] = (el) => {
  const id = el.dataset.id; if (S.todoEdit !== id) return; S.todoEdit = null;
  const raw = el.value.trim(); if (!raw || !db.get('tempo_notices', id)) { render(); return; }
  const p = parseTodoText(raw);
  db.update('tempo_notices', id, { title: p.title, data: p.due ? { due: p.due, deadline: p.deadline } : {} }, true);
  db.emit();
};

/* Painel lateral da tela inicial (Time Sheet): to-do + avisos pendentes. */
function sidePanelHTML() {
  const todos = db.all('tempo_notices').filter(n => n.kind === 'todo').sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.data?.due || '\uffff').localeCompare(b.data?.due || '\uffff') || (a.created_at || '').localeCompare(b.created_at || ''));
  const pend = db.all('tempo_notices').filter(n => n.status === 'pending' && n.kind !== 'reminder').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 6);
  return `<aside class="side-panel">
    <div class="card"><div class="row between"><b>To-do</b><span class="faint small">${todos.filter(t => t.status !== 'done').length} abertas</span></div>
      <form class="row gap-s" onsubmit="event.preventDefault();ACTIONS['todo-add']()"><input id="todo-new" class="input grow" placeholder="Ex.: Pegar Rafa às 16h" autocomplete="off"><button class="btn sm" data-act="todo-add">Adicionar</button></form>
      <div class="todo-list">${todos.length ? todos.map(t => `<div class="todo ${t.status === 'done' ? 'done' : ''}"><input type="checkbox" data-act="todo-toggle" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}>${S.todoEdit === t.id ? `<input id="todo-edit" class="input grow" data-id="${t.id}" value="${esc(todoEditRaw(t))}" onkeydown="ACTIONS['todo-key'](event)" onblur="ACTIONS['todo-save'](this)">` : `<span class="grow todo-title" data-act="todo-edit" data-id="${t.id}" title="Clique para editar">${esc(t.title)}</span>`}${t.data?.due ? `<span class="todo-due ${t.status !== 'done' && new Date(t.data.due) < new Date() ? 'late' : ''}">${esc(todoDueLabel(t.data))}</span>` : ''}<button class="icon-btn ghost" data-act="todo-del" data-id="${t.id}" title="Remover">×</button></div>`).join('') : '<span class="faint small">Nada por enquanto.</span>'}</div>
    </div>
    <div class="card"><div class="row between"><b>Avisos</b><button class="btn sm ghost" data-act="go" data-route="notices">Ver todos</button></div>
      ${pend.length ? pend.map(n => `<div class="side-notice" data-act="notice-open" data-id="${n.id}" style="cursor:pointer" title="Ir até o item para resolver"><div class="small"><b>${esc(n.title)}</b>${n.kind === 'pause' ? '' : `<div class="faint">${esc(n.body || '')}</div>`}</div>${noticeButtons(n)}</div>`).join('') : '<span class="faint small">Sem avisos pendentes.</span>'}
    </div></aside>`;
}

/* Tela Avisos: abas por situação, agrupadas por dia (mais recentes primeiro). */
VIEWS.notices = () => {
  const f = S.nt || 'pending';
  const all = db.all('tempo_notices').filter(n => n.kind !== 'todo');
  const count = (k) => all.filter(n => k === 'all' || n.status === k).length;
  const list = all.filter(n => f === 'all' || n.status === f).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const groups = {}; list.forEach(n => { const k = (n.created_at || '').slice(0, 10); (groups[k] = groups[k] || []).push(n); });
  const tabs = [['pending', 'Pendentes'], ['snoozed', 'Adiados'], ['accepted', 'Aceitos'], ['ignored', 'Ignorados'], ['all', 'Todos']];
  const badge = (n) => { const [label] = noticeKind(n.kind); const st = { pending: 'Pendente', accepted: 'Aceito', ignored: 'Ignorado', snoozed: 'Adiado', done: 'Feito' }[n.status] || n.status; return `<span class="tag">${label}</span> <span class="faint small">${st}${n.decided_at ? ' em ' + fmtDateTime(n.decided_at) : ''}${n.decision && n.kind !== 'pause' ? ' · ' + esc(n.decision) : ''}</span>`; };
  const html = `<div class="seg">${tabs.map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="notice-filter" data-f="${k}">${l} <span class="faint">${count(k)}</span></button>`).join('')}</div>
    ${Object.keys(groups).sort().reverse().map(day => `<div class="card"><b class="small">${fmtDate(day)}</b>
      ${groups[day].map(n => `<div class="notice-row"><div class="grow">${n.kind === 'pause' ? pauseText(n) : `<b>${esc(n.title)}</b>${n.body ? `<div class="faint small">${esc(n.body)}</div>` : ''}`}<div class="small">${badge(n)}</div></div>
        <div>${n.status === 'pending' || n.status === 'snoozed' ? noticeButtons(n) : (n.status === 'ignored' || n.status === 'accepted' ? `<button class="btn sm ghost" data-act="notice-reopen" data-id="${n.id}">Reabrir</button>` : '')}</div></div>`).join('')}</div>`).join('') || `<div class="empty">${icon('bell')}<b>Nenhum aviso aqui</b><span>Os avisos de pausa, prazo e cobrança aparecem aqui e ficam registrados.</span></div>`}`;
  return { title: 'Avisos', actions: '', html };
};
