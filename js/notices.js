/* =====================================================================
   AVISOS E TO-DO (v2.01)
   Tudo fica em tempo_notices: sugestões de pausa, alertas automáticos,
   lembretes exibidos e tarefas manuais. Decisões (aceito, ignorado, adiado)
   são registradas para sempre e aparecem na aba Avisos, ordenadas por data.
   ===================================================================== */

const NOTICE_KINDS = { sessao: ['Sessão aberta', 'clock'], conta: ['Conta a pagar', 'money'], pause: ['Pausa', 'alert'], prazo: ['Prazo', 'clock'], cobranca: ['Cobrança', 'money'], orcamento: ['Orçamento', 'doc'], reminder: ['Lembrete', 'bell'], todo: ['To-do', 'check'] };
const noticeKind = (k) => NOTICE_KINDS[k] || [k, 'bell'];

/* Cria um aviso pendente. A chave evita duplicar o mesmo aviso (ex.: mesmo prazo no mesmo dia). */
function addNotice(o, silent) {
  if (FERIAS_HOJE && ['prazo', 'cobranca', 'orcamento', 'conta'].includes(o.kind)) return null;
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
/* Avisos ligados a um projeto ganham o play "Começar" (abre o Iniciar registro já no projeto). */
const noticeButtons = (n) => {
  const base = noticeBtnsBase(n);
  if (!base || !n.data?.project_id) return base;
  return base.replace(/<\/div>$/, `<button class="btn sm icon ghost" data-act="notice-play" data-id="${n.id}" title="Começar registro" aria-label="Começar registro">${icon('play')}</button></div>`);
};
ACTIONS['notice-play'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); const p = n?.data?.project_id ? db.get('tempo_projects', n.data.project_id) : null;
  if (!p) return openStartModal({});
  const c = clientOf(p);
  openStartModal({ agency_id: c?.agency_id || '__none', client_id: p.client_id, project_id: p.id });
};
const noticeBtnsBase = (n) => {
  if (n.status !== 'pending') return '';
  if (n.kind === 'pause') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-accept" data-id="${n.id}">Aceitar</button><button class="btn sm" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
  if (n.kind === 'activity') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-accept" data-id="${n.id}">Adicionar à nota</button><button class="btn sm" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
  if (n.kind === 'todo') return '';
  if (n.kind === 'sessao') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-cut" data-id="${n.id}">Cortar às ${fmtTime(n.data?.cut)}</button><button class="btn sm ghost" data-act="notice-ignore" data-id="${n.id}">Manter aberta</button></div>`;
  if (n.kind === 'start') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-accept" data-id="${n.id}">Confirmar no bruto</button><button class="btn sm" data-act="notice-pick" data-id="${n.id}">Escolher projeto, tarefa ou subtarefa</button><button class="btn sm ghost" data-act="notice-deny" data-id="${n.id}">Negar</button></div>`;
  return `<div class="row gap-s"><button class="btn sm" data-act="notice-ack" data-id="${n.id}">Ok, visto</button><button class="btn sm ghost" data-act="notice-snooze" data-id="${n.id}">Adiar 1 dia</button><button class="btn sm ghost" data-act="notice-todo" data-id="${n.id}">Virar to-do</button><button class="btn sm ghost" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
};
/* Escolher na hora: abre a sessão provisória para pôr projeto, tarefa ou subtarefa antes de confirmar. */
ACTIONS['notice-pick'] = (el) => { const n = db.get('tempo_notices', el.dataset.id); if (n?.data?.entry_id) openEntryModal(n.data.entry_id); };
/* Cria um to-do só se nunca tiver existido outro com o mesmo texto (feito ou aberto): a varredura não recria o que você já resolveu. */
function todoOnce(raw) {
  if (db.all('tempo_notices').some(n => n.kind === 'todo' && String(n.title || '').trim() === raw.trim())) return;
  todoAddRaw(raw);
}
ACTIONS['notice-accept'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  if (n.kind === 'pause' && n.data?.source === 'app') { decideNotice(n, 'accepted', 'Marcada no bruto (cronômetro seguiu)'); }
  else if (n.kind === 'start') { decideNotice(n, 'accepted', 'Confirmada: entrou no bruto'); }
  else if (n.kind === 'pause') { const a = db.get('tempo_time_entries', n.data.entry_id); if (a && a.state === 'running') applyPause(a, n, 'insert'); else decideNotice(n, 'ignored', 'Sessão já encerrada'); }
  else if (n.kind === 'activity') {
    const a = db.get('tempo_time_entries', n.data.entry_id);
    if (a && a.state !== 'done') { const d = n.data; learnFolderRule(d.folder, a.project_id, (entryPath(a).client || {}).id); recordActivity(a, { from: d.from, to: d.to, app: d.app, doc: d.doc || null, folder: d.folder || null }); decideNotice(n, 'accepted', 'Registrada na atividade da sessão'); }
    else decideNotice(n, 'ignored', 'Sessão já encerrada');
  }
  else decideNotice(n, 'accepted', 'Aceito');
  db.emit();
};
/* Negar: tira o tempo do registro e arquiva o aviso com um retrato da sessão, para resgatar depois. */
ACTIONS['notice-deny'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  const e = db.get('tempo_time_entries', n.data?.entry_id);
  const snapshot = e ? clone(e) : null;
  if (e) db.remove('tempo_time_entries', e.id, true);
  decideNotice(n, 'ignored', 'Negada (arquivada, pode resgatar)', { data: { ...n.data, snapshot } });
  db.emit();
};
/* Aviso vira item do To-do (lateral do Time Sheet). O aviso sai da lista de pendentes. */
ACTIONS['notice-todo'] = async (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  if (!await confirmBox({ title: 'Virar to-do?', body: `"${n.title}" vai para a lista de to-do e sai dos avisos.`, ok: 'Virar to-do' })) return;
  db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: n.title, body: n.body || '', data: n.data || {}, decision: '', decided_at: null, snooze_until: null }, true);
  decideNotice(n, 'accepted', 'Mandado para o to-do');
  db.emit(); toast('Mandado para o to-do');
};
ACTIONS['notice-ignore'] = (el) => { decideNotice(db.get('tempo_notices', el.dataset.id), 'ignored', 'Ignorado'); db.emit(); };
ACTIONS['notice-ack'] = (el) => { decideNotice(db.get('tempo_notices', el.dataset.id), 'accepted', 'Visto'); db.emit(); };
ACTIONS['notice-snooze'] = (el) => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  db.update('tempo_notices', el.dataset.id, { status: 'snoozed', snooze_until: ymd(d), decision: `Adiado para ${fmtDate(ymd(d))}` }, true); db.emit();
};
ACTIONS['notice-reopen'] = (el) => {
  const n0 = db.get('tempo_notices', el.dataset.id);
  if (n0?.kind === 'start' && n0.data?.snapshot) {
    const { id: _old, ...rest } = n0.data.snapshot; const e = db.insert('tempo_time_entries', { ...rest, state: 'done' }, true);
    db.update('tempo_notices', n0.id, { status: 'pending', decision: '', data: { ...n0.data, entry_id: e?.id || null, snapshot: null } }, true);
    db.emit(); return;
  }
  db.update('tempo_notices', el.dataset.id, { status: 'pending', decision: '' }, true); db.emit();
};
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
  // 4a) intervalo: "7h30 às 8h", "7h30 até 8h", "das 7h30 a 8h", "7h30-8h"
  let end = null;
  const rg = t.match(/(?<![\p{L}\p{N}])(?:das?\s+)?(\d{1,2})\s*(?::|h)\s*(\d{2})?\s*(?:[àa]s?|at[ée]|-|–)\s*(\d{1,2})(?:\s*(?::|h)\s*(\d{2})?)?(?![\p{L}\p{N}])/iu);
  if (rg && Number(rg[1]) <= 23 && Number(rg[3]) <= 23 && Number(rg[2] || 0) <= 59 && Number(rg[4] || 0) <= 59) {
    hh = Number(rg[1]); mi = Number(rg[2] || 0); end = `${pad(Number(rg[3]))}:${pad(Number(rg[4] || 0))}`; t = t.replace(rg[0], ' ');
  }
  // 4) horário: 16h, 16h30, 16:30, às 16
  const tm = t.match(/(?<![\p{L}\p{N}])(?:[àa]s?\s+)?(\d{1,2})\s*(?::|h)\s*(\d{2})?(?![\p{L}\p{N}])/iu) || t.match(/(?<![\p{L}\p{N}])[àa]s?\s+(\d{1,2})(?![\p{L}\p{N}])/iu);
  if (hh === null && tm && Number(tm[1]) <= 23 && Number(tm[2] || 0) <= 59) { hh = Number(tm[1]); mi = Number(tm[2] || 0); t = t.replace(tm[0], ' '); }
  const deadline = /(?<![\p{L}\p{N}])at[ée](?![\p{L}\p{N}])/iu.test(orig);
  const title = t.replace(/\s+/g, ' ').replace(/(?<![\p{L}\p{N}])(at[ée]|[àa]s?|de|do|da|para)\s*$/iu, '').replace(/[\s,.;:-]+$/, '').trim() || orig;
  if (!day && hh === null) return { title: orig, due: null, deadline: false, end: null };
  const d = day || hoje;
  const h = hh === null ? 20 : hh, m = hh === null ? 0 : mi;
  return { title, due: `${ymd(d)}T${pad(h)}:${pad(m)}`, deadline: deadline && !end, end };
}
function todoDueLabel(data) {
  const [ds, ts] = data.due.split('T'); const [h, m] = ts.split(':').map(Number);
  const hoje = ymd(new Date()), amanha = ymd(new Date(Date.now() + 864e5));
  const quando = ds === hoje ? 'hoje' : ds === amanha ? 'amanhã' : fmtDateShort(ds);
  const fmt = (hh, mm) => mm ? `${hh}h${pad(mm)}` : `${hh}h`;
  if (data.end) { const [eh, em] = data.end.split(':').map(Number); return `${quando} ${fmt(h, m)} às ${fmt(eh, em)}`; }
  return `${data.deadline ? 'até ' : ''}${quando} ${fmt(h, m)}`;
}

/* To-do manual */
ACTIONS['todo-add'] = () => {
  const inp = $('#todo-new'); const raw = (inp?.value || '').trim(); if (!raw) return;
  const alarm = !!document.getElementById('todo-alarm')?.checked;
  if (todoAddRaw(raw, alarm) && inp) inp.value = '';
};
/* Mostra o checkbox "Alarme" só quando o texto tem horário. */
function todoAlarmPeek(inp, wrapId = 'todo-alarm-wrap', boxId = 'todo-alarm') {
  const w = document.getElementById(wrapId); if (!w) return;
  const p = parseTodoText(String(inp.value || '').replace(TODO_ALARM_RE, '').trim());
  w.style.display = p.due ? 'inline-flex' : 'none';
  if (!p.due) { const c = document.getElementById(boxId); if (c) c.checked = false; }
}
const TODO_ALARM_RE = /\s!alarme\s*$/i;
/* Cria um to-do a partir do texto: "!seg,qua" = fixo; "[1h]" ou "[30min]" = tempo estimado. */
function todoAddRaw(raw, alarm = false) {
  const fm = raw.match(/\s!([a-zçã,]+)\s*$/i);
  if (fm) {
    const words = fm[1].toLowerCase().split(',').map(x => x.trim());
    const days = (words.includes('diario') || words.includes('todo')) ? [0, 1, 2, 3, 4, 5, 6] : words.map(w => TODO_DAYS[w]);
    if (days.length && days.every(d => d !== undefined)) {
      const fixed = { id: uid(), title: raw.slice(0, fm.index).trim(), days };
      todoSetSilent('todoFixed', [...(db.setting('todoFixed', []) || []), fixed]);
      if (days.includes(new Date().getDay())) db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: fixed.title, body: '', data: { fixed: fixed.id }, decision: '', decided_at: null, snooze_until: null }, true);
      db.emit(); return true;
    }
  }
  const em = raw.match(/\s\[(\d+)(h|min)\]\s*$/i);
  const est = em ? Number(em[1]) * (em[2].toLowerCase() === 'h' ? 60 : 1) : null;
  const text = em ? raw.slice(0, em.index).trim() : raw;
  const p = parseTodoText(text);
  const withAlarm = !!(alarm && p.due);
  db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: p.title, body: '', data: { ...(p.due ? { due: p.due, deadline: p.deadline, end: p.end || null } : {}), ...(est ? { est } : {}), ...(withAlarm ? { alarm: true, alarm_criado: false } : {}) }, decision: '', decided_at: null, snooze_until: null }, true);
  db.emit(); todoAlarmSync(); return true;
}
/* Ponte para o app de Mac (⇧⌘T): recebe o texto e cria o to-do. */
window.todoQuickAdd = (text) => { const t = String(text || '').trim(); if (t) todoAddRaw(t); };
ACTIONS['todo-play'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); const t = n?.data?.taskId ? db.get('tempo_tasks', n.data.taskId) : null;
  if (!t) return openStartModal({});
  const p = db.get('tempo_projects', t.project_id); const c = clientOf(p);
  openStartModal({ agency_id: c?.agency_id || '__none', client_id: p.client_id, project_id: p.id, task_id: t.parent_id || t.id, sub_id: t.parent_id ? t.id : '' });
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
/* Férias (6): dias marcados em Ajustes (ou no banco, chave ferias) não geram prazo, cobrança, orçamento nem conta. */
let FERIAS_HOJE = false;
function emFerias(day) { return (db.setting('ferias', []) || []).some(f => f && f.inicio && f.fim && day >= f.inicio && day <= f.fim); }
function scanAlerts() {
  const today = ymd(new Date());
  FERIAS_HOJE = emFerias(today);
  SCAN_SEEN = new Set(); SCAN_CHANGED = false;
  db.all('tempo_projects').filter(p => !p.archived && p.deadline && !['Concluído', 'Cancelado', 'Enviado'].includes(statusName(p.status_id)) && !['done', 'cancelled'].includes(statusCat(p.status_id))).forEach(p => {
    const d = daysBetween(today, p.deadline); // positivo = faltam dias
    if (d === null || d > 2) return;
    const late = d < 0;
    addNotice({ kind: 'prazo', key: `prazo:${p.id}:${p.deadline}:${late ? 'late' : 'soon'}`, title: late ? `Prazo vencido: ${p.name}` : `Prazo em ${d === 0 ? 'hoje' : d + ' dia(s)'}: ${p.name}`, body: `Entrega em ${fmtDate(p.deadline)}.`, entity: 'project', entity_id: p.id, project_id: p.id, data: { deadline: p.deadline } }, true);
  });
  db.all('tempo_projects').filter(p => !p.archived && remainingOf(p) > 0).forEach(p => {
    const pay = statusName(p.payment_status_id);
    if (pay === 'Atrasado' || (pay === 'Não Pago' && p.deadline && daysBetween(p.deadline, today) > 0)) addNotice({ kind: 'cobranca', key: `cob:${p.id}:${today.slice(0, 7)}`, title: `Cobrança: ${p.name}`, body: `Restam ${fmtMoney(remainingOf(p))} a receber.`, entity: 'project', entity_id: p.id, project_id: p.id, data: {} }, true);
    if (pay === 'Atrasado' || (pay === 'Não Pago' && p.deadline && daysBetween(p.deadline, today) > 0)) { const cl = clientOf(p); todoOnce('Cobrar ' + (cl?.name || p.name)); }
    /* projeto pago sem nota fiscal: vira to-do para emitir */
    if (pay === 'Pago' && !p.invoice_at) todoOnce('Emitir nota ' + p.name);
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
  db.all('tempo_notices').filter(n => !FERIAS_HOJE && AUTO_KINDS.includes(n.kind) && ['pending', 'snoozed'].includes(n.status) && n.key && !SCAN_SEEN.has(n.key)).forEach(n => {
    const src = SRC_TABLE[n.entity];
    if (src && !db.all(src).length) return; // dados ainda não carregados: não resolve nada
    decideNotice(n, 'accepted', 'Resolvido: a situação mudou'); SCAN_CHANGED = true;
  });
  scanSessoesAbertas(today);
  SCAN_SEEN = null;
  db.all('tempo_notices').filter(n => n.status === 'snoozed' && n.snooze_until && n.snooze_until <= today).forEach(n => db.update('tempo_notices', n.id, { status: 'pending', snooze_until: null }, true));
  if (SCAN_CHANGED) db.emit(); // só avisa a tela se algo mudou (evita laço)
}

/* Sessão esquecida aberta (1.4): cronômetro rodando desde um dia anterior e sem nenhum sinal de atividade há 2h ou mais.
   Propõe cortar a sessão no último sinal de atividade (registro de atividade ou fim do último segmento). */
const SESSAO_QUIETO_MS = 2 * 36e5;
function sessaoCutAt(e) {
  const segs = e.segments || []; const last = segs[segs.length - 1] || {};
  let t = last.s ? new Date(last.s).getTime() : 0;
  if (last.e && new Date(last.e).getTime() > t) t = new Date(last.e).getTime();
  actList(e.id).forEach(r => { const x = new Date(r.to).getTime(); if (x > t) t = x; });
  return new Date(t).toISOString();
}
function scanSessoesAbertas(today) {
  const open = openEntries();
  db.all('tempo_notices').filter(n => n.kind === 'sessao' && n.status === 'pending' && !open.some(e => e.id === n.data?.entry_id)).forEach(n => decideNotice(n, 'accepted', 'Resolvido: a sessão foi encerrada'));
  open.forEach(e => {
    const st = entryStart(e); if (!st) return;
    const startDay = ymd(new Date(st)); if (startDay >= today) return;
    const cut = sessaoCutAt(e); if (Date.now() - new Date(cut).getTime() < SESSAO_QUIETO_MS) return;
    addNotice({ kind: 'sessao', key: `sessao:${e.id}`, title: `Sessão de ${fmtDate(startDay)} ficou aberta`, body: `Cortar às ${fmtTime(cut)}, último sinal de atividade?`, entity: 'entry', entity_id: e.id, data: { entry_id: e.id, cut } }, true);
  });
}
ACTIONS['notice-cut'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  const e = db.get('tempo_time_entries', n.data?.entry_id);
  if (!e || !openEntries().some(x => x.id === e.id)) { decideNotice(n, 'ignored', 'Sessão já encerrada'); db.emit(); return; }
  const segs = clone(e.segments); const last = segs[segs.length - 1];
  const cut = n.data.cut;
  if (!last.e) last.e = (cut && new Date(cut) > new Date(last.s)) ? cut : last.s;
  db.update('tempo_time_entries', e.id, { state: 'done', segments: segs });
  decideNotice(n, 'accepted', `Cortada às ${fmtTime(last.e)}`);
  db.emit();
};

/* To-do editável: clique no texto, reescreva (data e hora em linguagem natural) e confirme com Enter ou ao sair do campo. */
function todoEditRaw(n) { const d = n.data || {}; return d.due ? `${n.title} ${todoDueLabel(d)}` : n.title; }
ACTIONS['todo-edit'] = (el) => { S.todoEdit = el.dataset.id; render(); setTimeout(() => { const i = $('#todo-edit'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); };
ACTIONS['todo-key'] = (e) => { if (e.key === 'Enter') { e.preventDefault(); ACTIONS['todo-save'](e.target); } else if (e.key === 'Escape') { e.preventDefault(); S.todoEdit = null; render(); } };
ACTIONS['todo-cancel'] = () => { if (!S.todoEdit) return; S.todoEdit = null; render(); };
ACTIONS['todo-save'] = (el) => {
  const id = el.dataset.id; if (S.todoEdit !== id) return; S.todoEdit = null;
  const raw0 = el.value.trim(); if (!raw0 || !db.get('tempo_notices', id)) { render(); return; }
  const cur = db.get('tempo_notices', id);
  const alarm = !!document.getElementById('todo-edit-alarm')?.checked || TODO_ALARM_RE.test(raw0); const raw = raw0.replace(TODO_ALARM_RE, '').trim();
  const p = parseTodoText(raw);
  const old = cur.data || {};
  const keep = p.due ? { due: p.due, deadline: p.deadline, end: p.end || null } : {};
  const mudou = p.due !== old.due || (alarm && !old.alarm);
  const data = { ...old, ...keep, ...(p.due ? {} : { due: undefined, deadline: undefined, end: undefined }) };
  if (!p.due) { delete data.due; delete data.deadline; delete data.end; }
  if (alarm && p.due) { data.alarm = true; if (mudou) data.alarm_criado = false; } else { delete data.alarm; delete data.alarm_criado; }
  db.update('tempo_notices', id, { title: p.title, data }, true);
  db.emit(); todoAlarmSync();
};

/* To-do: item (um só modelo para o painel e para a aba). */
function todoItemHTML(t) {
  const est = t.data?.est;
  const real = t.data?.taskId ? db.where('tempo_time_entries', e => e.task_id === t.data.taskId).reduce((s, e) => s + entryMs(e), 0) : 0;
  const estTxt = est ? `<span class="todo-due">${real ? fmtDur(real) + ' / ' : 'est. '}${fmtDur(est * 60000)}</span>` : '';
  return `<div class="todo ${t.status === 'done' ? 'done' : ''}" data-tid="${t.id}" ${t.status === 'done' || todoSortMode() === 'alpha' ? '' : 'draggable="true"'}><input type="checkbox" data-act="todo-toggle" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}>${S.todoEdit === t.id ? `<input id="todo-edit" class="input grow" data-id="${t.id}" value="${esc(todoEditRaw(t))}" oninput="todoAlarmPeek(this,'todo-edit-alarm-wrap','todo-edit-alarm')" onkeydown="ACTIONS['todo-key'](event)" onblur="ACTIONS['todo-cancel']()"><label id="todo-edit-alarm-wrap" class="row gap-s small" onmousedown="event.preventDefault()" style="display:${parseTodoText(todoEditRaw(t)).due ? 'inline-flex' : 'none'};align-items:center;white-space:nowrap"><input type="checkbox" id="todo-edit-alarm" ${t.data?.alarm ? 'checked' : ''}> Alarme</label>` : `<span class="grow todo-title" data-act="todo-edit" data-id="${t.id}" title="Clique para editar">${esc(t.title)}</span>`}${estTxt}${t.data?.adiou ? `<span class="todo-due">adiou ${t.data.adiou}x</span>` : ''}${t.data?.due ? `<span class="todo-due ${t.status !== 'done' && new Date(t.data.end ? t.data.due.slice(0, 10) + 'T' + t.data.end : t.data.due) < new Date() ? 'late' : ''}">${esc(todoDueLabel(t.data))}</span>` : ''}<button class="btn sm icon ghost" data-act="todo-play" data-id="${t.id}" aria-label="Começar registro" title="Começar registro">${icon('play')}</button><button class="icon-btn ghost" data-act="todo-del" data-id="${t.id}" title="Remover">×</button></div>`;
}
/* Abertos primeiro; concluídos agrupados por dia da resolução, mais recentes primeiro.
   recentDays: mostra só os concluídos dos últimos N dias (o painel usa 7). */
function todoGroupsHTML(todos, recentDays) {
  const cutoff = recentDays ? Date.now() - recentDays * 864e5 : -Infinity;
  const today = todoToday();
  const open = todos.filter(t => t.status !== 'done');
  const pastOpen = open.filter(t => { const d = todoDueDay(t); return d && d < today; });
  const current = todoManualSort(open.filter(t => !pastOpen.includes(t)));
  const done = todos.filter(t => t.status === 'done' && new Date(t.decided_at || t.created_at || 0).getTime() >= cutoff);
  const group = (list, keyOf, set) => {
    const by = {};
    list.forEach(t => { const k = keyOf(t); (by[k] = by[k] || []).push(t); });
    const folded = db.setting(set, []) || [];
    return Object.keys(by).sort().reverse().map(k => {
      const [y, m, d] = k.split('-');
      const closed = folded.includes(k);
      return `<div class="todo-day"><button class="todo-dayh" data-act="todo-fold" data-set="${set}" data-day="${k}">${d}.${m}.${y} ${icon(closed ? 'chevR' : 'chevD')}</button>${closed ? '' : by[k].map(todoItemHTML).join('')}</div>`;
    }).join('');
  };
  const openPast = group(pastOpen, t => todoDueDay(t), 'todoFoldOpen');
  const doneGroups = group(done, t => ymd(new Date(t.decided_at || t.created_at || Date.now())), 'todoFold');
  return (current.map(todoItemHTML).join('') + openPast + doneGroups) || '<span class="faint small">Nada por enquanto.</span>';
}
/* Ordem manual das tarefas abertas (setting todoOrder); quem não tem posição vai para o fim, na ordem original. */
const todoSortMode = () => db.setting('todoSort', 'manual') === 'alpha' ? 'alpha' : 'manual';
function todoManualSort(list) {
  if (todoSortMode() === 'alpha') return list.slice().sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR', { sensitivity: 'base' }));
  const ord = db.setting('todoOrder', []) || [];
  const pos = (t) => { const i = ord.indexOf(t.id); return i < 0 ? Infinity : i; };
  return list.slice().sort((a, b) => pos(a) - pos(b));
}
ACTIONS['todo-fold'] = (el) => {
  const k = el.dataset.day, set = el.dataset.set || 'todoFold'; const cur = db.setting(set, []) || [];
  db.setSetting(set, cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]);
  render();
};

/* ---- To-do: regras automáticas (uma vez por dia, sem disparar re-render) ---- */
const TODO_DAYS = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const TODO_DAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const todoToday = () => ymd(new Date());
const todoSetSilent = (key, value) => { const st = db.data.tempo_settings.find(r => r.key === key); if (st) db.update('tempo_settings', st.id, { value }, true); else db.insert('tempo_settings', { key, value }, true); };
const todoDueDay = (n) => n.data?.due ? n.data.due.slice(0, 10) : null;
const todoIsLate = (n) => n.status !== 'done' && !!n.data?.due && new Date(n.data.end ? n.data.due.slice(0, 10) + 'T' + n.data.end : n.data.due) < new Date();

/* Quem ficou aberto de um dia para o outro ganha +1 em "adiou". */
function todoCarry() {
  const today = todoToday();
  if (db.setting('todoCarryDay', '') === today) return;
  db.all('tempo_notices').filter(n => n.kind === 'todo' && n.status !== 'done' && ymd(new Date(n.created_at || Date.now())) < today)
    .forEach(n => db.update('tempo_notices', n.id, { data: { ...(n.data || {}), adiou: (n.data?.adiou || 0) + 1 } }, true));
  todoSetSilent('todoCarryDay', today);
}
/* Fixos: criam o to-do do dia nos dias da semana escolhidos. */
function todoFixedApply() {
  const today = todoToday(); if (db.setting('todoFixedDay', '') === today) return;
  const wd = new Date().getDay();
  (db.setting('todoFixed', []) || []).forEach(f => {
    if (!f.days.includes(wd)) return;
    const exists = db.all('tempo_notices').some(n => n.kind === 'todo' && n.data?.fixed === f.id && ymd(new Date(n.created_at || 0)) === today);
    if (!exists) db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: f.title, body: '', data: { fixed: f.id }, decision: '', decided_at: null, snooze_until: null }, true);
  });
  todoSetSilent('todoFixedDay', today);
}
/* Sugestões: tarefas com prazo nos próximos 3 dias e avisos de conta/cobrança/prazo pendentes. */
function todoSuggestions() {
  const lim = ymd(new Date(Date.now() + 3 * 864e5));
  const open = new Set(db.all('tempo_notices').filter(n => n.kind === 'todo' && n.status !== 'done').map(n => n.title));
  const out = [];
  db.all('tempo_tasks').forEach(t => {
    if (!t.deadline || t.deadline > lim || ['done', 'cancelled'].includes(statusCat(t.status_id))) return;
    const p = db.get('tempo_projects', t.project_id); if (!p || p.archived) return;
    const title = `${t.name} · ${p.name}`; if (!open.has(title)) out.push({ title, deadline: t.deadline, taskId: t.id });
  });
  db.all('tempo_notices').filter(n => n.status === 'pending' && ['conta', 'cobranca', 'prazo'].includes(n.kind)).forEach(n => {
    if (!open.has(n.title)) out.push({ title: n.title, deadline: todoDueDay(n) });
  });
  return out.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).slice(0, 6);
}
ACTIONS['todo-suggest'] = (el) => {
  const dl = el.dataset.deadline;
  db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: el.dataset.title, body: '', data: { ...(dl ? { due: `${dl}T18:00`, deadline: true } : {}), ...(el.dataset.task ? { taskId: el.dataset.task } : {}) }, decision: '', decided_at: null, snooze_until: null }, true);
  db.emit();
};
/* To-do criado a partir de uma tarefa: quando a tarefa é concluída (ou cancelada), o to-do é marcado sozinho. */
function todoSyncLinked() {
  db.all('tempo_notices').filter(n => n.kind === 'todo' && n.status !== 'done' && n.data?.taskId).forEach(n => {
    const t = db.get('tempo_tasks', n.data.taskId);
    if (t && ['done', 'cancelled'].includes(statusCat(t.status_id))) db.update('tempo_notices', n.id, { status: 'done', decided_at: nowISO() }, true);
  });
}
ACTIONS['todo-fixed-del'] = (el) => { todoSetSilent('todoFixed', (db.setting('todoFixed', []) || []).filter(f => f.id !== el.dataset.id)); db.emit(); };
ACTIONS['todo-tab'] = (el) => { S.todoTab = el.dataset.v; render(); };

/* Aba To-do: resumo do dia, filtros, sugestões, fixos e a lista por dia. */
VIEWS.todo = () => {
  todoCarry(); todoFixedApply(); todoSyncLinked();
  const all = db.all('tempo_notices').filter(n => n.kind === 'todo');
  const today = todoToday();
  const dayOf = (iso) => ymd(new Date(iso || 0));
  const todayTotal = all.filter(n => (n.status === 'done' && dayOf(n.decided_at) === today) || (n.status !== 'done' && (todoDueDay(n) === today || todoIsLate(n))));
  const todayDone = todayTotal.filter(n => n.status === 'done').length;
  const tab = S.todoTab || 'open';
  const pick = { open: n => n.status !== 'done', hoje: n => n.status !== 'done' && (todoDueDay(n) === today || todoIsLate(n)), atrasadas: n => todoIsLate(n), feitas: n => n.status === 'done' };
  const TABS = [['open', 'Abertas'], ['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['feitas', 'Concluídas']];
  const fixed = db.setting('todoFixed', []) || [];
  const sug = tab === 'open' ? todoSuggestions() : [];
  const html = `<div class="panel"><div class="panel-b" style="padding:16px;max-width:720px">
    <div class="row between"><b>To-do</b><span class="faint small">Hoje: ${todayDone} de ${todayTotal.length} feitas</span></div>
    <form class="row gap-s" style="margin-top:10px" onsubmit="event.preventDefault();ACTIONS['todo-add']()"><input id="todo-new" class="input grow" placeholder="Ex.: Pegar Rafa às 16h · fixo: Pagar Rafa !seg,qua" autocomplete="off" oninput="todoAlarmPeek(this)"><label id="todo-alarm-wrap" class="row gap-s small" style="display:none;align-items:center;white-space:nowrap"><input type="checkbox" id="todo-alarm"> Alarme</label><button class="btn sm" data-act="todo-add">Adicionar</button></form>
    <div class="seg" style="margin-top:12px">${TABS.map(([v, l]) => `<button class="${tab === v ? 'on' : ''}" data-act="todo-tab" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="row between" style="margin-top:8px"><span class="faint small">Ordem: ${todoSortMode() === 'manual' ? '<b>minha ordem</b>' : '<button class="btn sm ghost" data-act="todo-sort" data-v="manual">minha ordem</button>'} · ${todoSortMode() === 'alpha' ? '<b>A–Z</b>' : '<button class="btn sm ghost" data-act="todo-sort" data-v="alpha">A–Z</button>'}</span></div>
    <div class="todo-list" style="margin-top:12px">${todoGroupsHTML(all.filter(pick[tab] || pick.open))}</div>
    ${sug.length ? `<div class="lbl" style="margin-top:16px">Sugestões</div>${sug.map(x => `<div class="row between small res-row"><span>${esc(x.title)}${x.deadline ? ` <span class="${x.deadline === todoToday() ? 'late' : 'faint'}">· ${x.deadline === todoToday() ? 'entrega hoje' : 'prazo ' + fmtDate(x.deadline)}</span>` : ''}</span><button class="btn sm" data-act="todo-suggest" data-title="${esc(x.title)}" data-deadline="${x.deadline || ''}" data-task="${x.taskId || ''}">Criar to-do</button></div>`).join('')}` : ''}
    ${tab === 'open' && fixed.length ? `<div class="lbl" style="margin-top:16px">Fixos</div>${fixed.map(f => `<div class="row between small res-row"><span>${esc(f.title)} <span class="faint">· ${f.days.length === 7 ? 'todo dia' : f.days.map(d => TODO_DAY_NAMES[d]).join(', ')}</span></span><button class="icon-btn ghost" data-act="todo-fixed-del" data-id="${f.id}" title="Remover fixo">×</button></div>`).join('')}` : ''}
  </div></div>`;
  return { title: 'To-do', html };
};

/* Painel lateral da tela inicial (Time Sheet): to-do + avisos pendentes. */
function sidePanelHTML() {
  todoCarry(); todoFixedApply(); todoSyncLinked();
  const todos = db.all('tempo_notices').filter(n => n.kind === 'todo').sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.data?.due || '\uffff').localeCompare(b.data?.due || '\uffff') || (a.created_at || '').localeCompare(b.created_at || ''));
  const pend = db.all('tempo_notices').filter(n => n.status === 'pending' && n.kind !== 'reminder').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 6);
  return `<aside class="side-panel">
    ${pixSideHTML()}
    <div class="card"><div class="row between"><b>To-do</b><span class="row gap-s"><span class="faint small">${todos.filter(t => t.status !== 'done').length} abertas</span><button class="btn sm ghost" data-act="go" data-route="todo">Ver todos</button></span></div>
      <form class="row gap-s" onsubmit="event.preventDefault();ACTIONS['todo-add']()"><input id="todo-new" class="input grow" placeholder="Ex.: Pegar Rafa às 16h" autocomplete="off" oninput="todoAlarmPeek(this)"><label id="todo-alarm-wrap" class="row gap-s small" style="display:none;align-items:center;white-space:nowrap"><input type="checkbox" id="todo-alarm"> Alarme</label><button class="btn sm" data-act="todo-add">Adicionar</button></form>
      <div class="todo-list">${todoGroupsHTML(todos, 7)}</div>
    </div>
    <div class="card"><div class="row between"><b>Avisos</b><button class="btn sm ghost" data-act="go" data-route="notices">Ver todos</button></div>
      ${pend.length ? pend.map(n => `<div class="side-notice" data-act="notice-open" data-id="${n.id}" style="cursor:pointer" title="Ir até o item para resolver"><div class="small"><b>${esc(n.title)}</b>${n.kind === 'pause' ? '' : `<div class="faint">${esc(n.body || '')}</div>`}</div>${noticeButtons(n)}</div>`).join('') : '<span class="faint small">Sem avisos pendentes.</span>'}
    </div></aside>`;
}

/* Tela Avisos: abas por situação, agrupadas por dia (mais recentes primeiro). */
/* Aba Histórico: tabela com tudo que já foi avisado e a situação de cada item. */
function noticeHistoryView() {
  const all = db.all('tempo_notices').filter(n => n.kind !== 'todo').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const tabs = [['pending', 'Pendentes'], ['snoozed', 'Adiados'], ['accepted', 'Aceitos'], ['ignored', 'Ignorados'], ['all', 'Todos'], ['historico', 'Histórico']];
  const ST = { pending: 'Pendente', accepted: 'Aceito', ignored: 'Ignorado', snoozed: 'Adiado', done: 'Feito' };
  const rows = all.map(n => `<tr><td class="mono small">${n.created_at ? fmtDate(ymd(new Date(n.created_at))) : ''}</td><td class="small">${esc(noticeKind(n.kind)[0])}</td><td>${esc(n.title)}</td><td class="small">${esc(ST[n.status] || n.status)}</td><td class="mono small">${n.decided_at ? fmtDate(ymd(new Date(n.decided_at))) : ''}</td></tr>`).join('');
  return { title: 'Avisos', actions: '', html: `<div class="seg">${tabs.map(([k, l]) => `<button class="${k === 'historico' ? 'on' : ''}" data-act="notice-filter" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="panel" style="margin-top:12px"><div class="panel-b tight"><table class="grid"><thead><tr><th>Criado</th><th>Tipo</th><th>Aviso</th><th>Situação</th><th>Decidido em</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="faint">Nenhum aviso ainda.</td></tr>'}</tbody></table></div></div>` };
}
VIEWS.notices = () => {
  const f = S.nt || 'pending';
  if (f === 'historico') return noticeHistoryView();
  const all = db.all('tempo_notices').filter(n => n.kind !== 'todo');
  const count = (k) => all.filter(n => k === 'all' || n.status === k).length;
  const list = all.filter(n => f === 'all' || n.status === f).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const groups = {}; list.forEach(n => { const k = (n.created_at || '').slice(0, 10); (groups[k] = groups[k] || []).push(n); });
  const tabs = [['pending', 'Pendentes'], ['snoozed', 'Adiados'], ['accepted', 'Aceitos'], ['ignored', 'Ignorados'], ['all', 'Todos'], ['historico', 'Histórico']];
  const badge = (n) => { const [label] = noticeKind(n.kind); const st = { pending: 'Pendente', accepted: 'Aceito', ignored: 'Ignorado', snoozed: 'Adiado', done: 'Feito' }[n.status] || n.status; return `<span class="tag">${label}</span> <span class="faint small">${st}${n.decided_at ? ' em ' + fmtDateTime(n.decided_at) : ''}${n.decision && n.kind !== 'pause' ? ' · ' + esc(n.decision) : ''}</span>`; };
  const html = `<div class="seg">${tabs.map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="notice-filter" data-f="${k}">${l} <span class="faint">${count(k)}</span></button>`).join('')}</div>
    ${Object.keys(groups).sort().reverse().map(day => `<div class="card"><b class="small">${fmtDate(day)}</b>
      ${groups[day].map(n => `<div class="notice-row"><div class="grow">${n.kind === 'pause' ? pauseText(n) : `<b>${esc(n.title)}</b>${n.body ? `<div class="faint small">${esc(n.body)}</div>` : ''}`}<div class="small">${badge(n)}</div></div>
        <div>${n.status === 'pending' || n.status === 'snoozed' ? noticeButtons(n) : (n.status === 'ignored' || n.status === 'accepted' ? `<button class="btn sm ghost" data-act="notice-reopen" data-id="${n.id}">Reabrir</button>` : '')}</div></div>`).join('')}</div>`).join('') || `<div class="empty">${icon('bell')}<b>Nenhum aviso aqui</b><span>Os avisos de pausa, prazo e cobrança aparecem aqui e ficam registrados.</span></div>`}`;
  return { title: 'Avisos', actions: '', html };
};

/* ---- To-do: arrastar uma tarefa aberta para cima de outra (ela entra no lugar e as outras descem) ---- */
let todoDragId = null;
const todoRowOf = (e) => e.target && e.target.closest ? e.target.closest('.todo[data-tid]') : null;
document.addEventListener('dragstart', (e) => {
  const el = todoRowOf(e); if (!el || el.getAttribute('draggable') !== 'true') return;
  todoDragId = el.dataset.tid; el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', todoDragId);
});
document.addEventListener('dragover', (e) => {
  const el = todoRowOf(e); if (!todoDragId || !el || el.dataset.tid === todoDragId) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.todo.drop-before').forEach(x => x.classList.remove('drop-before'));
  el.classList.add('drop-before');
});
document.addEventListener('drop', (e) => {
  const el = todoRowOf(e); if (!todoDragId || !el) return;
  e.preventDefault();
  const from = todoDragId, to = el.dataset.tid; todoDragId = null;
  if (from !== to) todoMoveBefore(el.parentElement, from, to);
});
document.addEventListener('dragend', () => {
  todoDragId = null;
  document.querySelectorAll('.todo.dragging, .todo.drop-before').forEach(x => x.classList.remove('dragging', 'drop-before'));
});

function todoMoveBefore(box, from, to) {
  const ids = [...box.querySelectorAll(':scope > .todo[data-tid][draggable="true"]')].map(x => x.dataset.tid).filter(x => x !== from);
  const at = ids.indexOf(to); if (at < 0) return;
  ids.splice(at, 0, from);
  const rest = (db.setting('todoOrder', []) || []).filter(x => !ids.includes(x));
  db.setSetting('todoOrder', [...ids, ...rest]);
  render();
}
ACTIONS['todo-sort'] = (el) => { db.setSetting('todoSort', el.dataset.v); render(); };

/* ---- To-do no celular: segurar a tarefa uns instantes, arrastar e soltar sobre outra ---- */
let tTimer = null, tId = null, tActive = false, tStart = null;
const clearTouchDrag = () => { clearTimeout(tTimer); tTimer = null; tStart = null; };
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  const el = todoRowOf(e); if (!el || el.getAttribute('draggable') !== 'true') return;
  tStart = { x: e.clientX, y: e.clientY }; tId = el.dataset.tid;
  tTimer = setTimeout(() => { tActive = true; el.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(12); }, 350);
});
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'touch') return;
  if (!tActive) { if (tStart && Math.hypot(e.clientX - tStart.x, e.clientY - tStart.y) > 8) clearTouchDrag(); return; }
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const row = under && under.closest ? under.closest('.todo[data-tid]') : null;
  document.querySelectorAll('.todo.drop-before').forEach(x => x.classList.remove('drop-before'));
  if (row && row.dataset.tid !== tId) row.classList.add('drop-before');
});
const endTouchDrag = (e) => {
  if (e.pointerType !== 'touch') return;
  clearTouchDrag();
  if (!tActive) return;
  tActive = false;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const row = under && under.closest ? under.closest('.todo[data-tid]') : null;
  const from = tId, src = document.querySelector(`.todo[data-tid="${from}"]`);
  document.querySelectorAll('.todo.dragging, .todo.drop-before').forEach(x => x.classList.remove('dragging', 'drop-before'));
  if (src && row && row.dataset.tid !== from && row.parentElement === src.parentElement) todoMoveBefore(src.parentElement, from, row.dataset.tid);
};
document.addEventListener('pointerup', endTouchDrag);
document.addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') { clearTouchDrag(); tActive = false; document.querySelectorAll('.todo.dragging, .todo.drop-before').forEach(x => x.classList.remove('dragging', 'drop-before')); } });
document.addEventListener('touchmove', (e) => { if (tActive) e.preventDefault(); }, { passive: false });

/* Alarme no Mac: o app de Mac cria um lembrete no app Lembretes (sincroniza com o iPhone).
   Só roda dentro do app de Mac (window.pywebview); marca cada item como criado para não repetir. */
function todoAlarmSync() {
  const api = window.pywebview && window.pywebview.api;
  if (!api || !api.criar_lembrete) return;
  db.where('tempo_notices', n => n.kind === 'todo' && n.status !== 'done' && n.data && n.data.alarm && n.data.due && !n.data.alarm_criado).forEach(n => {
    Promise.resolve(api.criar_lembrete(n.title, n.data.due)).then(ok => {
      if (!ok) return;
      const r = db.get('tempo_notices', n.id); if (!r) return;
      db.update('tempo_notices', n.id, { data: { ...r.data, alarm_criado: true } }, true);
    }).catch(() => { /* tenta de novo na próxima vez */ });
  });
}
window.addEventListener('pywebviewready', todoAlarmSync);

