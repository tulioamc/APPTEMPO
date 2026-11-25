/* =====================================================================
   AVISOS E TO-DO (v2.01)
   Tudo fica em tempo_notices: sugestões de pausa, alertas automáticos,
   lembretes exibidos e tarefas manuais. Decisões (aceito, ignorado, adiado)
   são registradas para sempre e aparecem na aba Avisos, ordenadas por data.
   ===================================================================== */

const NOTICE_KINDS = { longo: ['Cronômetro esquecido?', 'clock'], semreg: ['Dia sem registro', 'clock'], sessao: ['Sessão aberta', 'clock'], conta: ['Conta a pagar', 'money'], pause: ['Pausa', 'alert'], prazo: ['Prazo', 'clock'], cobranca: ['Cobrança', 'money'], orcamento: ['Orçamento', 'doc'], reminder: ['Lembrete', 'bell'], todo: ['To-do', 'check'], reembolso: ['Reembolso', 'money'], nfse: ['Nota ou comprovante', 'money'] };
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
  let base = noticeBtnsBase(n);
  // "Resolver": leva até onde o aviso se resolve (projeto, orçamento, despesa ou a sessão da pausa)
  const temDestino = (n.entity === 'project' && n.entity_id) || n.entity === 'quote' || n.entity === 'expense' || n.entity === 'reimb';
  if (base && temDestino) base = base.replace('<div class="row gap-s">', `<div class="row gap-s"><button class="btn sm primary" data-act="notice-open" data-id="${n.id}" title="Ir até o item para resolver">Resolver</button>`);
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
  if (n.kind === 'nfse') return `<div class="row gap-s"><button class="btn sm primary" data-act="nfse-usar" data-id="${n.id}">${n.data?.tipo === 'comprovante' ? 'Marcar como Pago' : 'Usar valor da nota'}</button><button class="btn sm ghost" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
  if (n.kind === 'alice') return `<div class="row gap-s"><button class="btn sm primary" data-act="alice-sim" data-id="${n.id}">Sim</button><button class="btn sm" data-act="alice-nao" data-id="${n.id}">Não</button></div>`;
  if (n.kind === 'wa') return `<div class="row gap-s"><button class="btn sm primary" data-act="wa-abrir">Classificar agora</button><button class="btn sm ghost" data-act="notice-snooze" data-id="${n.id}">Adiar 1 dia</button></div>`;
  if (n.kind === 'sessao') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-cut" data-id="${n.id}">Cortar às ${fmtTime(n.data?.cut)}</button><button class="btn sm ghost" data-act="notice-ignore" data-id="${n.id}">Manter aberta</button></div>`;
  if (n.kind === 'longo') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-cut" data-id="${n.id}" title="Encerra a sessão no começo do trecho sem troca de programa">Cortar às ${fmtTime(n.data?.cut)}</button><button class="btn sm ghost" data-act="notice-ack" data-id="${n.id}" title="Estava trabalhando de verdade: mantém o tempo">Estava trabalhando</button></div>`;
  if (n.kind === 'semreg') return `<div class="row gap-s"><button class="btn sm primary" data-act="ts-manual" data-a="${n.data?.a || ''}" data-b="${n.data?.b || ''}" title="Abre uma sessão manual de hoje para lançar as horas">Lançar horas</button><button class="btn sm ghost" data-act="notice-ack" data-id="${n.id}" title="Hoje não teve trabalho fora do app">Não trabalhei</button></div>`;
  if (n.kind === 'start') return `<div class="row gap-s"><button class="btn sm primary" data-act="notice-accept" data-id="${n.id}">Confirmar no bruto</button><button class="btn sm" data-act="notice-pick" data-id="${n.id}">Escolher projeto, tarefa ou subtarefa</button><button class="btn sm ghost" data-act="notice-deny" data-id="${n.id}">Negar</button></div>`;
  return `<div class="row gap-s"><button class="btn sm" data-act="notice-ack" data-id="${n.id}">Ok, visto</button><button class="btn sm ghost" data-act="notice-snooze" data-id="${n.id}">Adiar 1 dia</button><button class="btn sm ghost" data-act="notice-todo" data-id="${n.id}">Virar to-do</button><button class="btn sm ghost" data-act="notice-ignore" data-id="${n.id}">Ignorar</button></div>`;
};
/* Escolher na hora: abre a sessão provisória para pôr projeto, tarefa ou subtarefa antes de confirmar. */
ACTIONS['notice-pick'] = (el) => { const n = db.get('tempo_notices', el.dataset.id); if (n?.data?.entry_id) openEntryModal(n.data.entry_id); };
/* Cria um to-do só se nunca tiver existido outro com o mesmo texto (feito ou aberto): a varredura não recria o que você já resolveu. */
function todoOnce(raw) {
  if (db.all('tempo_notices').some(n => n.kind === 'todo' && String(n.title || '').trim() === raw.trim())) return;
  todoAddRaw(raw, false, true);
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
  if (n.entity === 'reimb') { if (n.data?.month || n.data?.ym) S.rbMonth = n.data.month || n.data.ym; return go('reimb'); }
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
  // 4-) duração: "de 1 hora", "por 30 min", "1h30 de duração", "de 1 h às 14h" (h solto só com "de/por/durante" e espaço antes do h)
  let dur = null;
  const dr = t.match(/(?<![\p{L}\p{N}])(?:(?:de|por|durante|dura(?:[çc][ãa]o)?:?)\s+)?(\d{1,2})(?:[.,](\d))?\s*(horas?|hrs?|min(?:utos?)?)(?:\s*(\d{2})(?![\p{L}\p{N}]))?(?:\s+de\s+dura[çc][ãa]o)?(?![\p{L}\p{N}])/iu)
    || t.match(/(?<![\p{L}\p{N}])(?:de|por|durante)\s+(\d{1,2})()\s+(h)(\d{2})?(?=\s+(?:[àa]s?|a\s+partir)\s)/iu)
    || t.match(/(?<![\p{L}\p{N}])(\d{1,2})()\s*(h)\s*(\d{2})?\s+de\s+dura[çc][ãa]o(?![\p{L}\p{N}])/iu)
    || t.match(/(?<![\p{L}\p{N}])dura(?:[çc][ãa]o)?:?\s+(\d{1,2})()\s*(h)\s*(\d{2})?(?![\p{L}\p{N}])/iu);
  if (dr) {
    const n = Number(dr[1]) + (dr[2] ? Number(dr[2]) / 10 : 0); const u = dr[3].toLowerCase();
    const m = u.startsWith('min') ? n : Math.round(n * 60) + Number(dr[4] || 0);
    if (m > 0 && m <= 24 * 60) { dur = m; t = t.replace(dr[0], ' '); }
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
  if (!day && hh === null) return { title: dur ? title : orig, due: null, deadline: false, end: null, dur };
  const d = day || hoje;
  const h = hh === null ? 20 : hh, m = hh === null ? 0 : mi;
  // duração com horário de início vira o fim ("de 1 h às 14h" → 14h às 15h), se couber no mesmo dia
  if (!end && dur && hh !== null) { const fim = hh * 60 + mi + dur; if (fim < 24 * 60) end = `${pad(Math.floor(fim / 60))}:${pad(fim % 60)}`; }
  return { title, due: `${ymd(d)}T${pad(h)}:${pad(m)}`, deadline: deadline && !end, end, dur, semHora: hh === null };
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
function todoAddRaw(raw, alarm = false, auto = false) {
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
  const text = em ? raw.slice(0, em.index).trim() : raw;
  const p = parseTodoText(text);
  const est = em ? Number(em[1]) * (em[2].toLowerCase() === 'h' ? 60 : 1) : (p.dur || null);
  const withAlarm = !!(alarm && p.due);
  const lig = todoFindLink(p.title);
  db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: p.title, body: '', data: { ...(auto ? { auto: true } : {}), ...(p.due ? { due: p.due, deadline: p.deadline, end: p.end || null, semHora: !!p.semHora } : {}), ...(est ? { est } : {}), ...lig, ...(withAlarm ? { alarm: true, alarm_criado: false } : {}) }, decision: '', decided_at: null, snooze_until: null }, true);
  db.emit(); todoAlarmSync(); return true;
}
/* To-do ligado sozinho: se o texto cita um projeto aberto (ou, sem projeto, um cliente), guarda o vínculo.
   O play já abre o Iniciar registro nele, e o item mostra o chip. Nome com 3+ letras, palavra inteira, sem acento. */
function todoFindLink(title) {
  const sem = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const txt = ' ' + sem(title).replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  const has = (name) => { const k = sem(name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); return k.length >= 3 && txt.includes(' ' + k + ' '); };
  const pj = db.all('tempo_projects').filter(p => !p.archived && !['done', 'closed'].includes(db.get('tempo_status_options', p.status_id)?.category) && has(p.name)).sort((a, b) => String(b.name).length - String(a.name).length)[0];
  if (pj) return { project_id: pj.id };
  const cl = db.all('tempo_clients').filter(c => !c.archived && has(c.name)).sort((a, b) => String(b.name).length - String(a.name).length)[0];
  return cl ? { client_id: cl.id } : {};
}
/* Ponte para o app de Mac (⇧⌘T): recebe o texto e cria o to-do. */
window.todoQuickAdd = (text) => { const t = String(text || '').trim(); if (t) todoAddRaw(t); };
ACTIONS['todo-play'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); const t = n?.data?.taskId ? db.get('tempo_tasks', n.data.taskId) : null;
  if (!t) {
    const pj = n?.data?.project_id ? db.get('tempo_projects', n.data.project_id) : null;
    if (pj) { const c = clientOf(pj); return openStartModal({ agency_id: c?.agency_id || '__none', client_id: pj.client_id, project_id: pj.id }); }
    const cl = n?.data?.client_id ? db.get('tempo_clients', n.data.client_id) : null;
    if (cl) return openStartModal({ agency_id: cl.agency_id || '__none', client_id: cl.id });
    return openStartModal({});
  }
  const p = db.get('tempo_projects', t.project_id); const c = clientOf(p);
  openStartModal({ agency_id: c?.agency_id || '__none', client_id: p.client_id, project_id: p.id, task_id: t.parent_id || t.id, sub_id: t.parent_id ? t.id : '' });
};
ACTIONS['todo-toggle'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  const done = n.status !== 'done';
  db.update('tempo_notices', n.id, { status: done ? 'done' : 'open', decided_at: done ? nowISO() : null }, true); db.emit();
};
ACTIONS['todo-del'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id);
  // to-do criado pelo app (ex.: "Cobrar ...") não volta: fica como dispensado, para o app não recriar
  if (n && (n.data?.auto || /^Cobrar /.test(n.title || ''))) db.update('tempo_notices', n.id, { status: 'done', decision: 'Dispensado', decided_at: nowISO() }, true);
  else db.remove('tempo_notices', el.dataset.id, true);
  db.emit();
};

/* Varredura automática: prazos, cobranças e orçamentos com validade próxima. */
let SCAN_SEEN = null; // chaves geradas nesta varredura
let SCAN_CHANGED = false; // a varredura criou ou resolveu algum aviso
/* Férias (6): dias marcados em Ajustes (ou no banco, chave ferias) não geram prazo, cobrança, orçamento nem conta. */
let FERIAS_HOJE = false;
/* Feriados nacionais, de Pernambuco e de Recife. Carnaval, Sexta-feira Santa e Corpus Christi seguem a Páscoa. */
function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}
function feriadosDoAno(y) {
  const p = pascoa(y), mov = (n) => { const d = new Date(p); d.setDate(d.getDate() + n); return ymd(d); };
  const fixos = [['01-01', 'Confraternização universal', 'nacional'], ['04-21', 'Tiradentes', 'nacional'], ['05-01', 'Dia do trabalho', 'nacional'],
    ['09-07', 'Independência', 'nacional'], ['10-12', 'Nossa Senhora Aparecida', 'nacional'], ['11-02', 'Finados', 'nacional'],
    ['11-15', 'Proclamação da República', 'nacional'], ['11-20', 'Consciência Negra', 'nacional'], ['12-25', 'Natal', 'nacional'],
    ['03-06', 'Revolução Pernambucana', 'PE'], ['06-24', 'São João', 'PE'], ['07-16', 'Nossa Senhora do Carmo (Recife)', 'Recife']]
    .map(([md, nome, tipo]) => ({ data: `${y}-${md}`, nome, tipo }));
  fixos.push({ data: mov(-47), nome: 'Carnaval', tipo: 'nacional' }, { data: mov(-48), nome: 'Carnaval', tipo: 'nacional' },
    { data: mov(-2), nome: 'Sexta-feira Santa', tipo: 'nacional' }, { data: mov(60), nome: 'Corpus Christi', tipo: 'PE' });
  return fixos.sort((x, z) => x.data.localeCompare(z.data));
}
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
  /* recebido 100% (pagamentos ≥ orçamento) mas o status de pagamento continua em aberto (ex.: Pago Parcial) */
  db.all('tempo_projects').filter(p => !p.archived && Number(p.budget) > 0 && statusCat(p.status_id) !== 'cancelled').forEach(p => {
    const o = db.get('tempo_status_options', p.payment_status_id); if (!o || o.category === 'closed') return;
    const pago = paidOf(p); if (pago < Number(p.budget)) return;
    addNotice({ kind: 'cobranca', key: `pago100:${p.id}:${o.id}`, title: `Recebido 100%, mas está "${o.name}": ${p.name}`, body: `Recebido ${fmtMoney(pago)} de ${fmtMoney(Number(p.budget))}. Mude o pagamento para Pago${remainingOf(p) > 0 ? ` (o "a receber" ainda mostra ${fmtMoney(remainingOf(p))})` : ''}.`, entity: 'project', entity_id: p.id, project_id: p.id, data: {} }, true);
  });
  db.all('tempo_projects').filter(p => !p.archived && remainingOf(p) > 0).forEach(p => {
    const pay = statusName(p.payment_status_id);
    if (pay === 'Atrasado' || (pay === 'Não Pago' && p.deadline && daysBetween(p.deadline, today) > 0)) addNotice({ kind: 'cobranca', key: `cob:${p.id}:${today.slice(0, 7)}`, title: `Cobrança: ${p.name}`, body: `Restam ${fmtMoney(remainingOf(p))} a receber.`, entity: 'project', entity_id: p.id, project_id: p.id, data: {} }, true);
    if (pay === 'Atrasado' || (pay === 'Não Pago' && p.deadline && daysBetween(p.deadline, today) > 0)) { const cl = clientOf(p); todoOnce('Cobrar ' + (cl?.name || p.name)); }
    /* projeto pago sem nota fiscal: vira to-do para emitir */
    if (pay === 'Pago' && !p.invoice_at) todoOnce('Emitir nota ' + p.name);
  });
  /* Orçamento enviado sem resposta: aviso aos 7 e aos 15 dias, e um único To-Do para cobrar (regra única; não recria se você já resolveu ou dispensou). */
  db.all('tempo_quotes').filter(q => q.sent_at && !['Aprovado', 'Recusado', 'Vencido', 'Rascunho'].includes(statusName(q.status_id))).forEach(q => {
    const d = daysBetween(q.sent_at, today); if (d === null || d < 7) return;
    const etapa = d >= 15 ? 15 : 7;
    addNotice({ kind: 'orcamento', key: `follow:${q.id}:${etapa}`, title: `Sem resposta há ${d} dias: ${q.name}`, body: `Enviado em ${fmtDate(q.sent_at)}. Cobre a resposta do cliente.`, entity: 'quote', entity_id: q.id, data: {} }, true);
    todoOnce(`Cobrar orçamento ${q.name}${etapa === 15 ? ' (2ª vez)' : ''}`);
  });
  db.all('tempo_quotes').filter(q => q.valid_until && !['Aprovado', 'Recusado', 'Vencido', 'Rascunho'].includes(statusName(q.status_id))).forEach(q => {
    const d = daysBetween(today, q.valid_until); if (d === null || d < 0 || d > 3) return;
    addNotice({ kind: 'orcamento', key: `orc:${q.id}:${q.valid_until}`, title: `Orçamento vence em ${d === 0 ? 'hoje' : d + ' dia(s)'}: ${q.name}`, body: 'Faça o follow-up com o cliente.', entity: 'quote', entity_id: q.id, data: {} }, true);
  });
  /* despesas com vencimento passado e ainda não pagas/recebidas */
  const limiteAtraso = ymd(new Date(Date.now() - 90 * 864e5));
  db.all('tempo_expenses').filter(r => r.due_date && r.due_date < today && r.due_date >= limiteAtraso && !['Pago', 'Recebido', 'Não teve'].includes(r.status)).forEach(r => {
    const inc = r.kind === 'in'; const v = r.amount ?? r.amount_sug;
    const titulo = `${inc ? 'Recebimento atrasado' : 'Conta vencida'}: ${r.name || 'sem nome'}`, corpo = `Venceu em ${fmtDate(r.due_date)}${v ? ` · ${fmtMoney(v)}` : ''}.`;
    addNotice({ kind: inc ? 'cobranca' : 'conta', key: `ex:${r.id}`, title: titulo, body: corpo, entity: 'expense', entity_id: r.id, data: {} }, true);
    // alarme: notificação do Mac uma vez por dia enquanto a conta estiver atrasada
    if (!inc && typeof notifyNative === 'function') {
      const k = `alarmeConta:${r.id}`;
      let ultimo = null; try { ultimo = localStorage.getItem(k); } catch (e) {}
      if (ultimo !== today) { try { localStorage.setItem(k, today); } catch (e) {} notifyNative(titulo, corpo); }
    }
  });
  /* Conversa longa com amigos no WhatsApp: um aviso por dia quando passa do limite que você definiu (Contatos). */
  if (!FERIAS_HOJE) { const ms = waAmigosHojeMs(today), lim = waAmigosLimiteMin();
    if (ms >= lim * 60e3) addNotice({ kind: 'wa-alerta', key: `wa-amigos:${today}`, title: `Hoje: ${fmtDur(ms)} no WhatsApp com amigos`, body: `Passou dos ${lim} min que você definiu. Contatos sem tipo contam como amigo.`, entity: 'wa', data: { ms } }); }
  /* Contatos do WhatsApp sem classificar há mais de 3 dias: um aviso, que some quando você classifica todos. */
  const waVelhos = (db.all('tempo_wa_contacts') || []).filter(c => !c.tipo_id && c.created_at && daysBetween(ymd(new Date(c.created_at)), today) >= 3)
    .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
  if (waVelhos.length) addNotice({ kind: 'wa', key: `wa-novos:${waVelhos[0].id}`, title: `${waVelhos.length} contato(s) do WhatsApp sem classificar`, body: 'Sem tipo, o tempo com eles conta como pausa. Marque quem é cliente, agência, colega ou fornecedor.', entity: 'wa', data: { n: waVelhos.length } });
  /* avisos automáticos (prazo, cobrança, orçamento, conta) saem sozinhos quando a situação deixa de valer:
     se a varredura não gerou mais a chave do aviso, a condição acabou (paga, entregue, data trocada, apagada...). */
  const AUTO_KINDS = ['prazo', 'cobranca', 'orcamento', 'conta', 'wa'];
  const SRC_TABLE = { expense: 'tempo_expenses', project: 'tempo_projects', quote: 'tempo_quotes', wa: 'tempo_wa_contacts' };
  db.all('tempo_notices').filter(n => !FERIAS_HOJE && AUTO_KINDS.includes(n.kind) && ['pending', 'snoozed'].includes(n.status) && n.key && !SCAN_SEEN.has(n.key)).forEach(n => {
    const src = SRC_TABLE[n.entity];
    if (src && !(db.all(src) || []).length) return; // dados ainda não carregados: não resolve nada
    decideNotice(n, 'accepted', 'Resolvido: a situação mudou'); SCAN_CHANGED = true;
  });
  scanSessoesAbertas(today);
  try { scanTrechoLongo(); scanDiaSemRegistro(today); } catch (e) { /* aviso extra não pode travar a varredura */ }
  avisosResolvidosSozinhos();
  SCAN_SEEN = null;
  db.all('tempo_notices').filter(n => n.status === 'snoozed' && n.snooze_until && n.snooze_until <= today).forEach(n => db.update('tempo_notices', n.id, { status: 'pending', snooze_until: null }, true));
  if (SCAN_CHANGED) db.emit(); // só avisa a tela se algo mudou (evita laço)
}

/* Cronômetro esquecido (25/11): sessão rodando há 3 h ou mais no mesmo programa e arquivo, sem nenhuma pausa nem troca.
   Pergunta uma vez por trecho; corta no começo do trecho ou mantém. Some sozinho quando você troca de programa ou pausa. */
const LONGO_MS = 3 * 36e5;
function longoInicio(e) {
  const segs = e.segments || []; const last = segs[segs.length - 1];
  if (!last || !last.s || last.e || e.state !== 'running') return null;
  const s0 = new Date(last.s).getTime();
  const recs = (typeof actList === 'function' ? actList(e.id) : []).filter(r => new Date(r.to).getTime() > s0).sort((a, b) => new Date(a.from) - new Date(b.from));
  if (!recs.length) return null;
  const k = (r) => `${r.app || ''}|${r.doc || ''}`; const ult = recs[recs.length - 1]; let ini = new Date(ult.from).getTime();
  for (let i = recs.length - 2; i >= 0 && k(recs[i]) === k(ult); i--) ini = new Date(recs[i].from).getTime();
  return { ini: Math.max(ini, s0), app: ult.app || 'o mesmo programa', doc: ult.doc || '' };
}
function scanTrechoLongo() {
  openEntries().forEach(e => {
    const L = longoInicio(e); if (!L || Date.now() - L.ini < LONGO_MS) return;
    const cut = new Date(L.ini).toISOString();
    addNotice({ kind: 'longo', key: `longo:${e.id}:${cut}`, title: `${fmtDur(Date.now() - L.ini)} no ${typeof shortProgram === 'function' ? shortProgram(L.app) : L.app} sem nenhuma pausa`, body: `Desde ${fmtTime(cut)} sem trocar de programa${L.doc ? ' nem de arquivo' : ''}. Se o cronômetro ficou esquecido, corte; se estava trabalhando, mantenha.`, entity: 'entry', entity_id: e.id, data: { entry_id: e.id, cut } }, true);
  });
}
/* Dia útil sem registro (25/11): depois das 19h, se hoje (dia útil, fora de férias e feriado) tem menos de 1 h de trabalho
   registrado, pergunta se trabalhou fora do app (na agência, por exemplo) e oferece lançar as horas. */
function trabalhoDoDiaMs(dia) {
  const a = new Date(dia + 'T00:00:00').getTime(), b = a + 864e5; const iv = [];
  db.all('tempo_time_entries').forEach(e => (e.segments || []).forEach(sg => { if (!sg.s || sg.why) return; const x = Math.max(a, new Date(sg.s).getTime()), y = Math.min(b, sg.e ? new Date(sg.e).getTime() : Date.now()); if (y > x) iv.push([x, y]); }));
  iv.sort((p, q) => p[0] - q[0]); let tot = 0, fim = 0;
  iv.forEach(([x, y]) => { if (y <= fim) return; tot += y - Math.max(x, fim); fim = y; });
  return tot;
}
function scanDiaSemRegistro(today) {
  const agora = new Date(); const dow = agora.getDay();
  if (dow === 0 || dow === 6 || agora.getHours() < 19 || FERIAS_HOJE) return;
  if (feriadosDoAno(agora.getFullYear()).some(f => f.data === today)) return;
  if (!db.all('tempo_time_entries').length) return;
  const ms = trabalhoDoDiaMs(today); if (ms >= 36e5) return;
  const a = new Date(today + 'T09:00:00').getTime(), b = new Date(today + 'T18:00:00').getTime();
  addNotice({ kind: 'semreg', key: `semreg:${today}`, title: `Hoje tem só ${fmtDur(ms)} registrado`, body: 'Dia útil quase sem registro. Trabalhou fora do app (na agência, por exemplo)? Lance as horas para não ficarem fora da conta.', data: { dia: today, a, b } }, true);
}

/* Aviso que você já resolveu por outro caminho (antes de ver o aviso) sai sozinho (25/11):
   - pausa sugerida: a sessão foi apagada/encerrada, ou o trecho já não tem tempo trabalhado (você já cortou);
   - "Começar…?" do log: a sessão foi apagada;
   - nota/comprovante do reembolso: a linha já está paga (comprovante) ou já tem o valor da nota;
   - Alice: o dia já está marcado no calendário. */
function avisosResolvidosSozinhos() {
  if (!db.loaded && db.loaded !== undefined) return;
  const pend = db.all('tempo_notices').filter(n => ['pending', 'snoozed'].includes(n.status));
  const fecha = (n, txt) => { decideNotice(n, 'accepted', 'Resolvido: ' + txt); SCAN_CHANGED = true; };
  const temSessoes = db.all('tempo_time_entries').length > 0;
  pend.forEach(n => {
    try {
      const d = n.data || {};
      if (n.kind === 'pause' && temSessoes && d.entry_id) {
        const e = db.get('tempo_time_entries', d.entry_id);
        if (!e) return fecha(n, 'a sessão não existe mais');
        if (e.state !== 'running') return fecha(n, 'a sessão já foi encerrada');
        const a = new Date(d.from).getTime(), b = new Date(d.to).getTime();
        const trabalhado = (e.segments || []).some(sg => !sg.why && Math.min(b, sg.e ? new Date(sg.e).getTime() : Infinity) - Math.max(a, new Date(sg.s).getTime()) > 30e3);
        if (!trabalhado) return fecha(n, 'a pausa já está na sessão');
      }
      if (n.kind === 'start' && temSessoes && d.entry_id && !db.get('tempo_time_entries', d.entry_id)) return fecha(n, 'a sessão não existe mais');
      if ((n.kind === 'nfse' || n.kind === 'reembolso') && n.entity === 'reimb' && d.nome && d.ym && typeof nfseLinha === 'function' && db.all('tempo_reimb_rows').length) {
        const row = nfseLinha(d.nome, d.ym, false); if (!row) return;
        if (d.tipo === 'comprovante' && typeof rbName === 'function' && rbName('reimb_pay', row.pay_id) === 'Pago') return fecha(n, 'a linha já está como Pago');
        if (d.tipo !== 'comprovante' && n.kind === 'nfse' && typeof nfseIgual === 'function' && nfseIgual(row.amount, d.valor)) return fecha(n, 'a linha já tem o valor da nota');
      }
      if (n.kind === 'longo' && temSessoes && d.entry_id) {
        const e = db.get('tempo_time_entries', d.entry_id);
        if (!e || e.state !== 'running') return fecha(n, 'a sessão foi pausada ou encerrada');
        const L = longoInicio(e); if (!L || new Date(L.ini).toISOString() !== d.cut) return fecha(n, 'você trocou de programa ou pausou');
      }
      if (n.kind === 'semreg' && temSessoes && d.dia && trabalhoDoDiaMs(d.dia) >= 36e5) return fecha(n, 'as horas do dia foram lançadas');
      if (n.kind === 'alice' && d.dia && typeof alDias === 'function' && (alDias()[d.dia] || []).includes(d.tipo)) return fecha(n, 'já está marcado no calendário');
    } catch (e) { /* um aviso com dado estranho não pode travar a varredura */ }
  });
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
  const keep = p.due ? { due: p.due, deadline: p.deadline, end: p.end || null, semHora: !!p.semHora } : {};
  const mudou = p.due !== old.due || (alarm && !old.alarm);
  const data = { ...old, ...keep, ...(p.due ? {} : { due: undefined, deadline: undefined, end: undefined }) };
  // adiado: a data foi trocada para um dia depois do que estava
  if (todoAdiou(old.due, p.due)) data.adiou = (old.adiou || 0) + 1;
  if (!p.due) { delete data.due; delete data.deadline; delete data.end; }
  if (!data.taskId && !data.link_manual) { delete data.project_id; delete data.client_id; Object.assign(data, todoFindLink(p.title)); }
  if (alarm && p.due) { data.alarm = true; if (mudou) data.alarm_criado = false; } else { delete data.alarm; delete data.alarm_criado; }
  db.update('tempo_notices', id, { title: p.title, data }, true);
  db.emit(); todoAlarmSync();
};

/* Janela de edição do to-do: tarefa, dia, hora, fim, prazo, projeto ou cliente, estimativa, alarme e anotação.
   A ligação escolhida aqui vale e não é refeita pelo texto (link_manual). */
function openTodoModal(id) {
  const n = db.get('tempo_notices', id); if (!n) return;
  const d = n.data || {};
  const [dia, hora0] = d.due ? d.due.split('T') : ['', '']; const hora = todoSemHora(d) ? '' : hora0;
  const ativo = (p) => !p.archived && !['done', 'closed', 'cancelled'].includes(db.get('tempo_status_options', p.status_id)?.category);
  const projs = db.all('tempo_projects').filter(ativo).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  const cls = db.all('tempo_clients').filter(c => !c.archived).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  const lig = d.project_id ? 'p:' + d.project_id : d.client_id ? 'c:' + d.client_id : '';
  const opt = (v, l) => `<option value="${v}" ${lig === v ? 'selected' : ''}>${esc(l)}</option>`;
  const salvar = (box) => { todoSalvarModal(n.id, box); };
  openLayer({
    render: () => `<div class="dh"><h2>Editar to-do</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:12px">
        <div class="field"><label for="td-t">Tarefa</label><input id="td-t" class="input" value="${esc(n.title)}" autocomplete="off"></div>
        <div class="stack" style="gap:6px" data-dias-wrap>
        <div class="row gap-s" style="flex-wrap:wrap;align-items:flex-end">
          <div class="field"><label for="td-d">Dia</label><input id="td-d" type="date" class="input" value="${dia}"></div>
          <div class="field"><label for="td-h">Hora</label><input id="td-h" type="time" class="input" value="${hora || ''}"></div>
          <div class="field"><label for="td-f">Até (fim)</label><input id="td-f" type="time" class="input" value="${d.end || ''}"></div>
          <label class="check small" style="margin-bottom:8px" data-tip="Aparece como &quot;até hoje 18h&quot;: é um limite, não um horário marcado"><input type="checkbox" id="td-prazo" ${d.deadline ? 'checked' : ''}> É prazo</label>
        </div>
        ${emDiasHTML(true)}
        </div>
        <div class="field"><label for="td-l">Projeto ou cliente</label><select id="td-l" class="input">${opt('', 'Nenhum')}
          ${projs.length ? `<optgroup label="Projetos">${projs.map(p => { const c = db.get('tempo_clients', p.client_id); return opt('p:' + p.id, p.name + (c ? ' · ' + c.name : '')); }).join('')}</optgroup>` : ''}
          ${cls.length ? `<optgroup label="Clientes">${cls.map(c => opt('c:' + c.id, c.name)).join('')}</optgroup>` : ''}</select></div>
        <div class="row gap-s" style="flex-wrap:wrap;align-items:flex-end">
          <div class="field"><label for="td-e">Estimativa (min)</label><input id="td-e" type="number" min="0" step="5" class="input" style="width:120px" value="${d.est || ''}"></div>
          <label class="check small" style="margin-bottom:8px" data-tip="Cria um lembrete com alarme no app Lembretes (Mac e iPhone). Precisa de dia e hora."><input type="checkbox" id="td-a" ${d.alarm ? 'checked' : ''}> Alarme</label>
        </div>
        <div class="field"><label for="td-n">Anotação</label><textarea id="td-n" class="input" rows="3">${esc(n.body || '')}</textarea></div>
        ${d.adiou ? `<span class="small muted">Adiado ${d.adiou}x.</span>` : ''}
      </div>
      <div class="df"><button class="btn danger" data-x="del">Excluir</button><span class="grow"></span><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="ok">Salvar</button></div>`,
    onMount: (ly) => {
      const t = ly.box.querySelector('#td-t'); t.focus(); t.setSelectionRange(t.value.length, t.value.length);
      ly.box.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-x="ok"]')) { salvar(ly.box); ly.close(); }
        else if (ev.target.closest('[data-x="del"]')) { ly.close(); ACTIONS['todo-del']({ dataset: { id: n.id } }); }
      });
      ly.box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); if (ev.target.matches('[data-dias-n]')) emDiasApply(ev.target); salvar(ly.box); ly.close(); } });
    },
  });
}
function todoSalvarModal(id, box) {
  const n = db.get('tempo_notices', id); if (!n) return;
  const v = (s) => box.querySelector(s);
  const old = n.data || {}; const data = { ...old };
  const dia = v('#td-d').value, hora = v('#td-h').value, fim = v('#td-f').value;
  const due = dia ? `${dia}T${hora || '20:00'}` : null;
  if (due) { data.due = due; data.end = fim || null; data.deadline = v('#td-prazo').checked && !fim; data.semHora = !hora; }
  else { delete data.due; delete data.end; delete data.deadline; delete data.semHora; }
  // adiado: a data foi trocada para um dia depois do que estava
  if (todoAdiou(old.due, due)) data.adiou = (old.adiou || 0) + 1;
  const lig = v('#td-l').value;
  delete data.project_id; delete data.client_id;
  if (lig.startsWith('p:')) data.project_id = lig.slice(2); else if (lig.startsWith('c:')) data.client_id = lig.slice(2);
  data.link_manual = true;
  const est = Number(v('#td-e').value); if (est > 0) data.est = est; else delete data.est;
  if (v('#td-a').checked && due) { if (!old.alarm || old.due !== due) data.alarm_criado = false; data.alarm = true; }
  else { delete data.alarm; delete data.alarm_criado; }
  db.update('tempo_notices', id, { title: v('#td-t').value.trim() || n.title, body: v('#td-n').value.trim(), data }, true);
  db.emit(); todoAlarmSync(); toast('To-do salvo');
}
ACTIONS['todo-modal'] = (el) => openTodoModal(el.dataset.id);

/* To-do: item (um só modelo para o painel e para a aba). */
function todoItemHTML(t) {
  const est = t.data?.est;
  const real = t.data?.taskId ? db.where('tempo_time_entries', e => e.task_id === t.data.taskId).reduce((s, e) => s + entryMs(e), 0) : 0;
  const estTxt = est ? `<span class="todo-due">${real ? fmtDur(real) + ' / ' : 'est. '}${fmtDur(est * 60000)}</span>` : '';
  const lig = t.data?.project_id ? db.get('tempo_projects', t.data.project_id) : (t.data?.client_id ? db.get('tempo_clients', t.data.client_id) : null);
  const ligTxt = lig && !t.data?.taskId ? `<span class="todo-due todo-lig" data-act="todo-modal" data-id="${t.id}" data-tip="${t.data.project_id ? 'Projeto' : 'Cliente'} ligado${t.data.link_manual ? '' : ' pelo texto'}. Clique para trocar.">${esc(lig.name)}</span>` : '';
  return `<div class="todo ${t.status === 'done' ? 'done' : ''}" data-tid="${t.id}" ${t.status === 'done' || todoSortMode() === 'alpha' || S.todoEdit === t.id ? '' : 'draggable="true"'}><input type="checkbox" data-act="todo-toggle" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}>${S.todoEdit === t.id ? `<input id="todo-edit" class="input grow" data-id="${t.id}" value="${esc(todoEditRaw(t))}" oninput="todoAlarmPeek(this,'todo-edit-alarm-wrap','todo-edit-alarm')" onkeydown="ACTIONS['todo-key'](event)" onblur="ACTIONS['todo-cancel']()"><label id="todo-edit-alarm-wrap" class="row gap-s small" onmousedown="event.preventDefault()" style="display:${parseTodoText(todoEditRaw(t)).due ? 'inline-flex' : 'none'};align-items:center;white-space:nowrap"><input type="checkbox" id="todo-edit-alarm" ${t.data?.alarm ? 'checked' : ''}> Alarme</label>` : `<span class="grow todo-title" data-act="todo-modal" data-id="${t.id}" title="Clique para editar">${esc(t.title)}</span>`}${ligTxt}${estTxt}${t.data?.adiou ? `<span class="todo-due" data-tip="Vezes que a data foi trocada para depois">adiado ${t.data.adiou}x</span>` : ''}${t.data?.due ? `<span class="todo-due ${t.status !== 'done' && new Date(t.data.end ? t.data.due.slice(0, 10) + 'T' + t.data.end : t.data.due) < new Date() ? 'late' : ''}">${esc(todoDueLabel(t.data))}</span>` : ''}<button class="btn sm icon ghost" data-act="todo-play" data-id="${t.id}" aria-label="Começar registro" title="Começar registro">${icon('play')}</button><button class="icon-btn ghost" data-act="todo-del" data-id="${t.id}" title="Remover">×</button></div>`;
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
const todoAdiou = (antes, depois) => !!(antes && depois && depois.slice(0, 10) > antes.slice(0, 10));
/* To-do só com data (sem hora): guardado às 20h com semHora; os antigos (sem a marca) às 20h e sem fim contam igual. */
const todoSemHora = (d) => !!d && !!d.due && (d.semHora === true || (d.semHora === undefined && d.due.slice(11, 16) === '20:00' && !d.end));
const todoDueDay = (n) => n.data?.due ? n.data.due.slice(0, 10) : null;
const todoIsLate = (n) => n.status !== 'done' && !!n.data?.due && new Date(n.data.end ? n.data.due.slice(0, 10) + 'T' + n.data.end : n.data.due) < new Date();

/* "adiou" conta quantas vezes o to-do foi adiado: a data foi trocada para um dia depois do que estava
   (vencida ou não). Trazer para antes não conta. Não sobe sozinho com o tempo. Uma vez, zera os contadores antigos (que subiam a cada dia). */
function todoCarry() {
  if (db.setting('todoAdiouV2', false)) return;
  db.all('tempo_notices').filter(n => n.kind === 'todo' && n.data?.adiou).forEach(n => db.update('tempo_notices', n.id, { data: { ...(n.data || {}), adiou: 0 } }, true));
  todoSetSilent('todoAdiouV2', true);
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
  const TABS = [['open', 'Abertas'], ['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['feitas', 'Concluídas'], ['todas', 'Todas']];
  const lista = tab === 'todas' ? todoTodasHTML(all) : todoGroupsHTML(all.filter(pick[tab] || pick.open)) + (tab === 'hoje' ? todoFeitasHoje(all).map(todoItemHTML).join('') : '');
  const fixed = db.setting('todoFixed', []) || [];
  const sug = tab === 'open' ? todoSuggestions() : [];
  const html = `<div class="todo-grid"><div class="panel"><div class="panel-b" style="padding:16px">
    <div class="row between"><b>To-do</b><span class="faint small">Hoje: ${todayDone} de ${todayTotal.length} feitas</span></div>
    <form class="row gap-s" style="margin-top:10px" onsubmit="event.preventDefault();ACTIONS['todo-add']()"><input id="todo-new" class="input grow" placeholder="Ex.: Pegar Rafa às 16h · fixo: Pagar Rafa !seg,qua" autocomplete="off" oninput="todoAlarmPeek(this)"><label id="todo-alarm-wrap" class="row gap-s small" style="display:none;align-items:center;white-space:nowrap"><input type="checkbox" id="todo-alarm"> Alarme</label><button class="btn sm" data-act="todo-add">Adicionar</button></form>
    <div class="seg" style="margin-top:12px">${TABS.map(([v, l]) => `<button class="${tab === v ? 'on' : ''}" data-act="todo-tab" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="row between" style="margin-top:8px"><span class="faint small">Ordem: ${todoSortMode() === 'manual' ? '<b>minha ordem</b>' : '<button class="btn sm ghost" data-act="todo-sort" data-v="manual">minha ordem</button>'} · ${todoSortMode() === 'alpha' ? '<b>A–Z</b>' : '<button class="btn sm ghost" data-act="todo-sort" data-v="alpha">A–Z</button>'}</span></div>
    <div class="todo-list" style="margin-top:12px">${lista}</div>
    ${sug.length ? `<div class="lbl" style="margin-top:16px">Sugestões</div>${sug.map(x => `<div class="row between small res-row"><span>${esc(x.title)}${x.deadline ? ` <span class="${x.deadline === todoToday() ? 'late' : 'faint'}">· ${x.deadline === todoToday() ? 'entrega hoje' : 'prazo ' + fmtDate(x.deadline)}</span>` : ''}</span><button class="btn sm" data-act="todo-suggest" data-title="${esc(x.title)}" data-deadline="${x.deadline || ''}" data-task="${x.taskId || ''}">Criar to-do</button></div>`).join('')}` : ''}
    ${tab === 'open' && fixed.length ? `<div class="lbl" style="margin-top:16px">Fixos</div>${fixed.map(f => `<div class="row between small res-row"><span>${esc(f.title)} <span class="faint">· ${f.days.length === 7 ? 'todo dia' : f.days.map(d => TODO_DAY_NAMES[d]).join(', ')}</span></span><button class="icon-btn ghost" data-act="todo-fixed-del" data-id="${f.id}" title="Remover fixo">×</button></div>`).join('')}` : ''}
  </div></div>${todoRelatorioHTML(all)}</div>`;
  return { title: 'To-do', html };
};

/* Concluídas hoje (pela hora em que foram marcadas), na ordem em que foram feitas: ficam no fim da lista, riscadas. */
const todoFeitasHoje = (todos) => todos.filter(t => t.status === 'done' && t.decided_at && ymd(new Date(t.decided_at)) === todoToday() && t.decision !== 'Dispensado')
  .sort((a, b) => String(a.decided_at).localeCompare(String(b.decided_at)));
/* Painel lateral da tela inicial (Time Sheet): to-do + avisos pendentes. */
function sidePanelHTML() {
  todoCarry(); todoFixedApply(); todoSyncLinked();
  const todos = db.all('tempo_notices').filter(n => n.kind === 'todo').sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.data?.due || '\uffff').localeCompare(b.data?.due || '\uffff') || (a.created_at || '').localeCompare(b.created_at || ''));
  const pend = db.all('tempo_notices').filter(n => n.status === 'pending' && n.kind !== 'reminder').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 6);
  return `<aside class="side-panel">
    ${pixSideHTML()}
    <div class="card"><div class="row between"><b>To-do</b><span class="row gap-s"><span class="faint small">${todos.filter(t => t.status !== 'done').length} abertas</span><button class="btn sm ghost" data-act="go" data-route="todo">Ver todos</button></span></div>
      <form class="row gap-s" onsubmit="event.preventDefault();ACTIONS['todo-add']()"><input id="todo-new" class="input grow" placeholder="Ex.: Pegar Rafa às 16h" autocomplete="off" oninput="todoAlarmPeek(this)"><label id="todo-alarm-wrap" class="row gap-s small" style="display:none;align-items:center;white-space:nowrap"><input type="checkbox" id="todo-alarm"> Alarme</label><button class="btn sm" data-act="todo-add">Adicionar</button></form>
      <div class="todo-list">${todoGroupsHTML(todos.filter(t => t.status !== 'done'))}${todoFeitasHoje(todos).map(todoItemHTML).join('')}</div>
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
   Só roda dentro do app de Mac; marca cada item como criado para não repetir.
   App atual (Swift): pede por mensagem e recebe a resposta em TempoBridge.reminderDone. App em Python: window.pywebview. */
const todoAlarmSent = new Set();   // pedidos já enviados ao app do Mac nesta abertura
function todoAlarmDone(id, ok) {
  if (!ok) { todoAlarmSent.delete(id); return; }   // tenta de novo na próxima vez
  const r = db.get('tempo_notices', id); if (!r) return;
  db.update('tempo_notices', id, { data: { ...r.data, alarm_criado: true } }, true);
}
function todoAlarmSync() {
  const mac = window.webkit?.messageHandlers?.tempo;
  const api = window.pywebview && window.pywebview.api;
  if (!mac && !(api && api.criar_lembrete)) return;
  db.where('tempo_notices', n => n.kind === 'todo' && n.status !== 'done' && n.data && n.data.alarm && n.data.due && !n.data.alarm_criado).forEach(n => {
    if (mac) {
      if (todoAlarmSent.has(n.id)) return;
      todoAlarmSent.add(n.id);
      try { mac.postMessage({ type: 'reminder', id: n.id, title: n.title, when: n.data.due }); } catch (e) { todoAlarmSent.delete(n.id); }
      return;
    }
    Promise.resolve(api.criar_lembrete(n.title, n.data.due)).then(ok => todoAlarmDone(n.id, !!ok)).catch(() => { /* tenta de novo na próxima vez */ });
  });
}
window.addEventListener('pywebviewready', todoAlarmSync);

/* ---- To-do: aba Todas (por dia) ----
   Dia do item = dia marcado (due); sem dia, o dia em que foi criado. Cada dia mostra quantas abertas, concluídas e atrasadas
   e abre com um clique. Hoje começa aberto. */
const todoDiaDe = (n) => todoDueDay(n) || ymd(new Date(n.created_at || Date.now()));
function todoTodasHTML(all) {
  const lista = all.filter(n => n.decision !== 'Dispensado');
  if (!lista.length) return '<span class="faint small">Nada por enquanto.</span>';
  const by = {}; lista.forEach(n => { const k = todoDiaDe(n); (by[k] = by[k] || []).push(n); });
  const abertos = db.setting('todoTodasAbertos', null) || [todoToday()];
  const n2 = (x) => String(x).padStart(2, '0');
  return Object.keys(by).sort().reverse().map(k => {
    const it = by[k]; const [y, m, d] = k.split('-');
    const late = it.filter(todoIsLate).length, feitas = it.filter(n => n.status === 'done').length, abertas = it.length - feitas - late;
    const open = abertos.includes(k);
    const conta = [abertas ? `${n2(abertas)} ${abertas === 1 ? 'aberta' : 'abertas'}` : '', feitas ? `${n2(feitas)} ${feitas === 1 ? 'concluída' : 'concluídas'}` : '', late ? `<span class="late">${n2(late)} ${late === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''].filter(Boolean).join(' · ');
    const ord = [...todoManualSort(it.filter(n => n.status !== 'done')), ...it.filter(n => n.status === 'done').sort((a, b) => String(a.decided_at).localeCompare(String(b.decided_at)))];
    return `<div class="todo-day"><button class="todo-dayh" data-act="todo-dia" data-day="${k}">${icon(open ? 'chevD' : 'chevR')} ${k === todoToday() ? 'Hoje · ' : ''}${d}.${m}.${y} <span class="small muted" style="margin-left:8px">${conta}</span></button>${open ? ord.map(todoItemHTML).join('') : ''}</div>`;
  }).join('');
}
ACTIONS['todo-dia'] = (el) => {
  const k = el.dataset.day; const cur = db.setting('todoTodasAbertos', null) || [todoToday()];
  db.setSetting('todoTodasAbertos', cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]); render();
};

/* ---- To-do: relatório à direita ----
   Período: semana, mês ou ano (até hoje). Concluídas = marcadas como feitas no período. Atrasadas = com dia no período
   que passaram da hora (feitas depois ou ainda abertas). Adiadas = quantas vezes o dia de uma tarefa vencida foi trocado.
   "Não contar fim de semana" tira sábado e domingo das contas e da média. */
function todoPeriodo(per) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ini = new Date(hoje);
  if (per === 'mes') ini.setDate(1);
  else if (per === 'ano') { ini.setMonth(0, 1); }
  else { const wd = (hoje.getDay() + 6) % 7; ini.setDate(hoje.getDate() - wd); }   // semana começa na segunda
  return { ini: ymd(ini), fim: ymd(hoje) };
}
function todoRelatorio(all, per, semFds) {
  const { ini, fim } = todoPeriodo(per);
  const fds = (dia) => { const w = new Date(dia + 'T12:00:00').getDay(); return w === 0 || w === 6; };
  const conta = (dia) => dia && dia >= ini && dia <= fim && !(semFds && fds(dia));
  const lista = all.filter(n => n.decision !== 'Dispensado');
  const feitas = lista.filter(n => n.status === 'done' && n.decided_at && conta(ymd(new Date(n.decided_at))));
  const comDia = lista.filter(n => conta(todoDueDay(n)));
  const limite = (n) => new Date(n.data.end ? n.data.due.slice(0, 10) + 'T' + n.data.end : n.data.due).getTime();
  const atrasadas = comDia.filter(n => n.status === 'done' ? (n.decided_at && new Date(n.decided_at).getTime() > limite(n)) : todoIsLate(n));
  const noPrazo = comDia.filter(n => n.status === 'done' && n.decided_at && new Date(n.decided_at).getTime() <= limite(n));
  const adiamentos = comDia.reduce((t, n) => t + (n.data?.adiou || 0), 0), adiadas = comDia.filter(n => n.data?.adiou).length;
  const criadas = lista.filter(n => conta(ymd(new Date(n.created_at || 0))));
  let dias = 0; for (let d = new Date(ini + 'T12:00:00'); ymd(d) <= fim; d.setDate(d.getDate() + 1)) if (!(semFds && fds(ymd(d)))) dias++;
  // concluídas por dia (semana e mês) ou por mês (ano)
  const barras = [];
  if (per === 'ano') { for (let m = 0; m <= new Date().getMonth(); m++) { const k = `${fim.slice(0, 4)}-${String(m + 1).padStart(2, '0')}`; barras.push({ k: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m], v: feitas.filter(n => ymd(new Date(n.decided_at)).startsWith(k)).length }); } }
  else for (let d = new Date(ini + 'T12:00:00'); ymd(d) <= fim; d.setDate(d.getDate() + 1)) { const k = ymd(d); if (semFds && fds(k)) continue; barras.push({ k: per === 'semana' ? ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()] : String(d.getDate()), v: feitas.filter(n => ymd(new Date(n.decided_at)) === k).length }); }
  return { ini, fim, dias, feitas: feitas.length, criadas: criadas.length, atrasadas: atrasadas.length, noPrazo: noPrazo.length, comPrazoFeitas: noPrazo.length + atrasadas.filter(n => n.status === 'done').length, adiadas, adiamentos, media: dias ? feitas.length / dias : 0, barras };
}
function todoRelatorioHTML(all) {
  const per = db.setting('todoRelPer', 'semana'), semFds = !!db.setting('todoRelSemFds', false);
  const r = todoRelatorio(all, per, semFds);
  const max = Math.max(1, ...r.barras.map(b => b.v));
  const pct = r.comPrazoFeitas ? Math.round(r.noPrazo / r.comPrazoFeitas * 100) : null;
  const card = (rot, val, dica) => `<div class="todo-kpi" data-tip="${esc(dica)}"><span class="small muted">${rot}</span><b>${val}</b></div>`;
  const media = r.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `<div class="panel todo-rel"><div class="panel-b" style="padding:16px">
    <div class="row between"><b>Relatório</b><span class="small muted">${fmtDate(r.ini)} a ${fmtDate(r.fim)}</span></div>
    <div class="seg" style="margin-top:10px">${[['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']].map(([v, l]) => `<button class="${per === v ? 'on' : ''}" data-act="todo-rel-per" data-v="${v}">${l}</button>`).join('')}</div>
    <label class="check small" style="margin-top:8px"><input type="checkbox" data-act="todo-rel-fds" ${semFds ? 'checked' : ''}> Não contar fim de semana</label>
    <div class="todo-kpis">
      ${card('Concluídas', r.feitas, 'Tarefas marcadas como feitas no período')}
      ${card('Média por dia', media, `Concluídas ÷ ${r.dias} dia(s)${semFds ? ' úteis' : ''} do período`)}
      ${card('Atrasadas', r.atrasadas, 'Tarefas com dia no período que passaram da hora: feitas depois ou ainda abertas')}
      ${card('Adiadas', r.adiadas ? `${r.adiadas} <span class="small muted">(${r.adiamentos}x)</span>` : '0', 'Tarefas com dia no período que você empurrou depois de vencidas, e quantas vezes no total')}
      ${card('Criadas', r.criadas, 'Tarefas novas no período')}
      ${card('No prazo', pct === null ? '—' : pct + '%', 'Das tarefas com dia que você concluiu, quantas foram feitas até a hora marcada')}
    </div>
    <div class="small muted" style="margin:14px 0 6px">Concluídas por ${per === 'ano' ? 'mês' : 'dia'}</div>
    <div class="todo-bars">${r.barras.map(b => `<div class="todo-bar" data-tip="${esc(`${b.k}: ${b.v} concluída(s)`)}"><span style="height:${Math.round(b.v / max * 100)}%"></span><i>${esc(b.k)}</i></div>`).join('')}</div>
  </div></div>`;
}
ACTIONS['todo-rel-per'] = (el) => { db.setSetting('todoRelPer', el.dataset.v); render(); };
ACTIONS['todo-rel-fds'] = (el) => { db.setSetting('todoRelSemFds', !!el.checked); render(); };
