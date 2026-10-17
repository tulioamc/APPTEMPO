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
  if (o.key && db.all('tempo_notices').some(n => n.key === o.key)) return null;
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
  if (n.kind === 'todo') return '';
  return `<div class="row gap-s"><button class="btn sm" data-act="notice-ack" data-id="${n.id}">Ok, visto</button><button class="btn sm ghost" data-act="notice-snooze" data-id="${n.id}">Adiar 1 dia</button><button class="btn sm ghost" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
};
ACTIONS['notice-accept'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  if (n.kind === 'pause') { const a = db.get('tempo_time_entries', n.data.entry_id); if (a && a.state === 'running') applyPause(a, n, 'insert'); else decideNotice(n, 'ignored', 'Sessão já encerrada'); }
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

/* To-do manual */
ACTIONS['todo-add'] = () => {
  const inp = $('#todo-new'); const t = (inp?.value || '').trim(); if (!t) return;
  db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: t, body: '', data: {}, decision: '', decided_at: null, snooze_until: null }, true);
  db.emit();
};
ACTIONS['todo-toggle'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  const done = n.status !== 'done';
  db.update('tempo_notices', n.id, { status: done ? 'done' : 'open', decided_at: done ? nowISO() : null }, true); db.emit();
};
ACTIONS['todo-del'] = (el) => { db.remove('tempo_notices', el.dataset.id, true); db.emit(); };

/* Varredura automática: prazos, cobranças e orçamentos com validade próxima. */
function scanAlerts() {
  const today = ymd(new Date());
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
    addNotice({ kind: inc ? 'cobranca' : 'conta', key: `ex:${r.id}:${r.due_date}`, title: `${inc ? 'Recebimento atrasado' : 'Conta vencida'}: ${r.name || 'sem nome'}`, body: `Venceu em ${fmtDate(r.due_date)}${r.amount ? ` · ${fmtMoney(r.amount)}` : ''}.`, entity: 'expense', entity_id: r.id, data: {} }, true);
  });
  db.all('tempo_notices').filter(n => n.status === 'snoozed' && n.snooze_until && n.snooze_until <= today).forEach(n => db.update('tempo_notices', n.id, { status: 'pending', snooze_until: null }, true));
  db.emit();
}

/* Painel lateral da tela inicial (Time Sheet): to-do + avisos pendentes. */
function sidePanelHTML() {
  const todos = db.all('tempo_notices').filter(n => n.kind === 'todo').sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.created_at || '').localeCompare(b.created_at || ''));
  const pend = db.all('tempo_notices').filter(n => n.status === 'pending' && n.kind !== 'reminder').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 6);
  return `<aside class="side-panel">
    <div class="card"><div class="row between"><b>To-do</b><span class="faint small">${todos.filter(t => t.status !== 'done').length} abertas</span></div>
      <form class="row gap-s" onsubmit="event.preventDefault();ACTIONS['todo-add']()"><input id="todo-new" class="input grow" placeholder="Nova tarefa…" autocomplete="off"><button class="btn sm" data-act="todo-add">Adicionar</button></form>
      <div class="todo-list">${todos.length ? todos.map(t => `<div class="todo ${t.status === 'done' ? 'done' : ''}"><input type="checkbox" data-act="todo-toggle" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}><span class="grow">${esc(t.title)}</span><button class="icon-btn ghost" data-act="todo-del" data-id="${t.id}" title="Remover">×</button></div>`).join('') : '<span class="faint small">Nada por enquanto.</span>'}</div>
    </div>
    <div class="card"><div class="row between"><b>Avisos</b><button class="btn sm ghost" data-act="go" data-route="notices">Ver todos</button></div>
      ${pend.length ? pend.map(n => `<div class="side-notice"><div class="small"><b>${esc(n.title)}</b>${n.kind === 'pause' ? '' : `<div class="faint">${esc(n.body || '')}</div>`}</div>${noticeButtons(n)}</div>`).join('') : '<span class="faint small">Sem avisos pendentes.</span>'}
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
