/* =====================================================================
   REGRAS DE NEGÓCIO — tudo que calcula ou muda dados passa por aqui
   ===================================================================== */
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

/* ---------- formatação ---------- */
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMoney = (v) => (v === null || v === undefined || v === '' || isNaN(v)) ? '' : brl.format(Number(v));
const fmtMoney0 = (v) => brl.format(Number(v) || 0);
const pad = (n) => String(n).padStart(2, '0');
function fmtClock(ms) { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; }
function fmtDur(ms) {
  const m = Math.round(Math.max(0, ms) / 60000); const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return `${mm}min`; return mm ? `${h}h ${pad(mm)}` : `${h}h`;
}
const hours = (ms) => ms / 3600000;
const fmtH = (ms) => { const m = Math.round(Math.max(0, ms || 0) / 60000); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
function ymd(d) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDate(s) { if (!s) return ''; const d = typeof s === 'string' && s.length === 10 ? parseYmd(s) : new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
function fmtDateShort(s) { if (!s) return ''; const d = typeof s === 'string' && s.length === 10 ? parseYmd(s) : new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }
function fmtTime(iso) { if (!iso) return '—'; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDateTime(iso) { if (!iso) return ''; return `${fmtDate(iso)} ${fmtTime(iso)}`; }
function toLocalInput(iso) { if (!iso) return ''; const d = new Date(iso); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }
function daysBetween(a, b) { if (!a || !b) return null; const A = typeof a === 'string' && a.length === 10 ? parseYmd(a) : new Date(a); const B = typeof b === 'string' && b.length === 10 ? parseYmd(b) : new Date(b); return Math.round((B - A) / 86400000); }
function longDate(d) { d = new Date(d); return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`; }
const isToday = (d) => ymd(d) === ymd(new Date());
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const numIn = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- padrões de configuração (personalizáveis) ---------- */
const DEFAULT_WORK_TYPES = [
  ['Design gráfico','blue'], ['Direção de arte','purple'], ['Branding / marcas','orange'], ['Motion graphics','pink'],
  ['Animação 2D','yellow'], ['Animação 3D','brown'], ['Ilustração 2D','green'], ['Modelagem 3D','gray'], ['Reunião','red'], ['Outro','gray']
];
const DEFAULT_STATUS = {
  work: [['A fazer','gray','todo'],['Em andamento','blue','active'],['Aguardando cliente','orange','active'],['Enviado','purple','active'],['Aprovação','pink','active'],['Stand by','brown','active'],['Concluído','green','done'],['Cancelado','red','cancelled']],
  payment: [['Não faturado','gray','open'],['Não Pago','red','open'],['Pago Parcial','yellow','open'],['Atrasado','orange','open'],['Pago','green','closed'],['Fee','blue','closed'],['Projeto pessoal','purple','closed']],
  quote: [['Rascunho','gray','open'],['Enviado','blue','open'],['Em negociação','yellow','open'],['Aprovado','green','won'],['Recusado','red','lost'],['Vencido','brown','lost']],
  reimb_pay: [['a Pagar','red','open'],['Pago','green','closed']],
  reimb_refund: [['a Pagar','yellow','open'],['Feito!','blue','closed'],['Negado','red','open'],['Parcial (Errado)','purple','open']],
  reimb_req: [['a Fazer','red','open'],['Feito','green','closed'],['Falta Nota','gray','open'],['Refeito (Negado da primeira vez)','purple','open'],['Refeito - Pagaram Menos na primeira','blue','open']]
};
const DEFAULT_REMINDERS = [
  { name: 'Iniciar registro', kind: 'start', active: true, days: 'weekdays', customDays: [1,2,3,4,5], freq: 'fixed', time: '09:00', intervalHours: 1, nightWeekendOnly: false },
  { name: 'Encerrar registro', kind: 'stop', active: true, days: 'weekdays', customDays: [1,2,3,4,5], freq: 'fixed', time: '19:00', intervalHours: 1, nightWeekendOnly: false },
  { name: 'Revisar sessão longa', kind: 'review_session', active: true, days: 'all', customDays: [0,1,2,3,4,5,6], freq: 'interval', time: '09:00', intervalHours: 3, nightWeekendOnly: false },
  { name: 'Revisar o dia', kind: 'review_day', active: false, days: 'weekdays', customDays: [1,2,3,4,5], freq: 'fixed', time: '21:00', intervalHours: 1, nightWeekendOnly: false },
  { name: 'Noite e fim de semana', kind: 'context', active: true, days: 'all', customDays: [0,1,2,3,4,5,6], freq: 'interval', time: '09:00', intervalHours: 1, nightWeekendOnly: true }
];
const REMINDER_KINDS = { start: 'Iniciar registro', stop: 'Encerrar registro', review_session: 'Revisar sessão', review_day: 'Revisar o dia', context: 'Conforme o contexto', custom: 'Personalizado' };

function seedConfig() {
  DEFAULT_WORK_TYPES.forEach(([name, color], i) => db.insert('tempo_work_types', { name, color, order: i, archived: false }, true));
  Object.entries(DEFAULT_STATUS).forEach(([kind, list]) => list.forEach(([name, color, category], i) => db.insert('tempo_status_options', { kind, name, color, category, order: i }, true)));
  DEFAULT_REMINDERS.forEach(r => db.insert('tempo_reminders', { ...r, done: false, lastFired: null }, true));
}

/* ---------- consultas básicas ---------- */
const statuses = (kind) => db.where('tempo_status_options', s => s.kind === kind).sort((a, b) => a.order - b.order);
const statusByCat = (kind, cat) => statuses(kind).find(s => s.category === cat);
const workTypes = (all) => db.all('tempo_work_types').filter(w => all || !w.archived).sort((a, b) => a.order - b.order);
const directAgency = () => db.all('tempo_agencies').find(isDirectAgency);
/* garante a agência "Cliente Direto" e move para ela os clientes/entradas/propostas sem agência */
function ensureDirectAgency() {
  let d = directAgency();
  if (!d) d = db.insert('tempo_agencies', { name: DIRECT_AGENCY, abbr: '', color: '#D9DCE2', cnpj: '', contact: '', address: '', notes: 'Agência interna: clientes sem agência contratante.', archived: false }, true);
  db.all('tempo_clients').filter(c => !c.agency_id).forEach(c => db.update('tempo_clients', c.id, { agency_id: d.id }, true));
  db.all('tempo_quotes').filter(q => !q.agency_id && q.client_id).forEach(q => db.update('tempo_quotes', q.id, { agency_id: d.id }, true));
  db.all('tempo_time_entries').filter(e => !e.agency_id && e.client_id).forEach(e => db.update('tempo_time_entries', e.id, { agency_id: d.id }, true));
  return d;
}
const agencySort = (a, b) => (isDirectAgency(b) - isDirectAgency(a)) || a.name.localeCompare(b.name);
const agencies = () => db.all('tempo_agencies').filter(a => !a.archived).sort(agencySort);
const clients = (agencyId) => db.all('tempo_clients').filter(c => !c.archived && (agencyId === undefined || (agencyId === '__none' ? !c.agency_id : c.agency_id === agencyId))).sort((a, b) => a.name.localeCompare(b.name));
const projects = () => db.all('tempo_projects').filter(p => !p.archived);
const tasksOf = (projectId) => db.where('tempo_tasks', t => t.project_id === projectId && !t.parent_id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const subtasksOf = (taskId) => db.where('tempo_tasks', t => t.parent_id === taskId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const clientOf = (p) => db.get('tempo_clients', p?.client_id);
const agencyOf = (p) => { const c = clientOf(p); return c ? db.get('tempo_agencies', c.agency_id) : null; };

/* ---------- tempo ---------- */
function entryMs(e, at = Date.now()) {
  return (e.segments || []).reduce((sum, s) => sum + ((s.e ? new Date(s.e) : at) - new Date(s.s)), 0);
}
/* Pausas são as lacunas entre segmentos. Bruto = do início ao fim; pausas = soma das lacunas; líquido = entryMs. */
/* Lacunas que são pausa (o motivo fica no segmento anterior). Lacuna "moved" = trecho que saiu desta sessão para outro projeto: não é pausa. */
/* Lacuna "fora" = tempo que não é deste lançamento (trecho movido para outro projeto, ou tempo em outros programas no destino). Não é pausa nem entra no bruto. */
const isForaWhy = (w) => w === 'moved' || w === 'fora';
function entryGaps(e) { const segs = e.segments || []; const out = []; for (let i = 0; i < segs.length - 1; i++) { const a = segs[i].e, b = segs[i + 1].s; if (a && b && new Date(b) > new Date(a) && !isForaWhy(segs[i].why)) out.push({ s: a, e: b, why: segs[i].why || null }); } return out; }
/* Lacunas de trecho movido: saem do bruto da sessão de origem (o tempo já está no projeto de destino). */
/* Intervalos do bruto de uma sessão (início→fim, sem as lacunas movidas). */
function entryBruIntervals(e, at = Date.now()) {
  const segs = e.segments || []; if (!segs.length) return [];
  const out = []; let a = new Date(segs[0].s).getTime();
  for (let i = 0; i < segs.length - 1; i++) {
    const end = segs[i].e ? new Date(segs[i].e).getTime() : at, start = new Date(segs[i + 1].s).getTime();
    if (isForaWhy(segs[i].why) && segs[i].e && start > end) { if (end > a) out.push([a, end]); a = start; }
  }
  const l = segs[segs.length - 1]; const b = l.e ? new Date(l.e).getTime() : at;
  if (b > a) out.push([a, b]);
  return out;
}
/* Pausas do conjunto de sessões, sobrepostas: um horário só é pausa se nenhuma sessão do conjunto estiver trabalhando nele.
   Assim, tempo parado numa sessão enquanto outra roda não conta como pausa (e o "fora" de trecho movido fica de fora). */
function pauseGapsOf(list, at = Date.now()) {
  // trabalho de TODAS as sessões (não só da lista): tempo parado aqui enquanto você trabalhava em outro projeto não é pausa
  const work = db.all('tempo_time_entries').flatMap(e => (e.segments || []).filter(x => x.s).map(x => [new Date(x.s).getTime(), x.e ? new Date(x.e).getTime() : at])).sort((x, y) => x[0] - y[0]);
  const merged = [];
  work.forEach(([a, b]) => { const l = merged[merged.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else merged.push([a, b]); });
  const out = [];
  list.forEach(e => entryGaps(e).forEach(g => {
    const gs = new Date(g.s).getTime(), ge = new Date(g.e).getTime();
    let s0 = gs; const pieces = [];
    merged.forEach(([a, b]) => { if (b <= s0 || a >= ge) return; if (a > s0) pieces.push([s0, a]); s0 = Math.max(s0, b); });
    if (s0 < ge) pieces.push([s0, ge]);
    pieces.forEach(([p, q]) => { if (q > p) out.push({ s: new Date(p).toISOString(), e: new Date(q).toISOString(), why: g.why }); });
  }));
  return out;
}
function entryBrutoMs(e, at = Date.now()) { return entryBruIntervals(e, at).reduce((t, [a, b]) => t + (b - a), 0); }
/* Bruto de vários lançamentos sem contar duas vezes o mesmo horário: une os intervalos (início→fim de cada um) e soma só o coberto. */
function unionBrutoMs(list, at = Date.now()) {
  const iv = list.flatMap(e => entryBruIntervals(e, at)).sort((x, y) => x[0] - y[0]);
  let total = 0, cs = null, ce = null;
  iv.forEach(([a, b]) => { if (cs === null || a > ce) { if (cs !== null) total += ce - cs; cs = a; ce = b; } else if (b > ce) ce = b; });
  if (cs !== null) total += ce - cs;
  return total;
}
/* Trava anti-duplicata: já existe um lançamento do projeto que cobre inteiro estes segmentos? Nesse caso não se cria outro. */
function segsCoveredIn(segs, pid, excludeId) {
  const T = (x) => new Date(x).getTime();
  return !!segs.length && db.all('tempo_time_entries').some(x => x.project_id === pid && x.id !== excludeId && segs.every(m => (x.segments || []).some(s => s.e && T(s.s) <= T(m.s) + 1000 && T(s.e) >= T(m.e) - 1000)));
}
const entryStart = (e) => e.segments?.[0]?.s;
const entryEnd = (e) => { const l = e.segments?.[e.segments.length - 1]; return l ? l.e : null; };
const openEntries = () => db.all('tempo_time_entries').filter(e => e.state === 'running' || e.state === 'paused');
// a sessão em foco: a que está rodando; se não houver, a última pausada
const activeEntry = () => openEntries().find(e => e.state === 'running') || openEntries()[0] || null;
function entriesOn(day) { const k = ymd(day); return db.all('tempo_time_entries').filter(e => entryStart(e) && ymd(entryStart(e)) === k).sort((a, b) => new Date(entryStart(b)) - new Date(entryStart(a))); }
function entryPath(e) {
  const p = db.get('tempo_projects', e.project_id), t = db.get('tempo_tasks', e.task_id);
  const parent = t?.parent_id ? db.get('tempo_tasks', t.parent_id) : null;
  const c = p ? clientOf(p) : db.get('tempo_clients', e.client_id);
  const a = c ? db.get('tempo_agencies', c.agency_id) : db.get('tempo_agencies', e.agency_id);
  return { agency: a, client: c, project: p, task: parent || t, subtask: parent ? t : null };
}
function entryTitle(e) {
  const x = entryPath(e);
  if (x.subtask) return x.subtask.name; if (x.task) return x.task.name; if (x.project) return x.project.name;
  return e.notes ? e.notes.split('\n')[0].slice(0, 60) : 'Sessão avulsa';
}
function projectMs(pid) { return db.where('tempo_time_entries', e => e.project_id === pid).reduce((s, e) => s + entryMs(e), 0); }
function taskMs(tid) { const ids = [tid, ...subtasksOf(tid).map(s => s.id)]; return db.where('tempo_time_entries', e => ids.includes(e.task_id)).reduce((s, e) => s + entryMs(e), 0); }
function revisionMs(pid) { return db.where('tempo_time_entries', e => e.project_id === pid && e.revision_id).reduce((s, e) => s + entryMs(e), 0); }

/* ---------- financeiro ---------- */
const paymentsOf = (pid) => db.where('tempo_payments', p => p.project_id === pid).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
const paidOf = (p) => paymentsOf(p.id).reduce((s, x) => s + (Number(x.amount) || 0), 0);
function remainingOf(p) {
  if (statusCat(p.status_id) === 'cancelled') return 0; // trabalho cancelado nunca será pago
  if (p.remaining_override !== null && p.remaining_override !== undefined && p.remaining_override !== '') return Number(p.remaining_override);
  if (p.budget === null || p.budget === undefined || p.budget === '') return null;
  if (db.get('tempo_status_options', p.payment_status_id)?.category === 'closed') return 0;
  return Math.max(0, Number(p.budget) - paidOf(p));
}
function effectiveRate(p) {
  const ms = projectMs(p.id); if (ms < 60000) return null;
  const base = Number(p.budget) || paidOf(p); if (!base) return null; return base / hours(ms);
}

/* ---------- histórico ---------- */
function logEvent(entity, entityId, type, description, from = null, to = null, extra = {}) {
  return db.insert('tempo_status_history', { entity, entity_id: entityId, type, description, from, to, at: extra.at || nowISO(), project_id: extra.project_id || (entity === 'project' ? entityId : null) }, true);
}
const historyOf = (projectId) => db.where('tempo_status_history', h => h.project_id === projectId).sort((a, b) => b.at.localeCompare(a.at));
const statusName = (id) => db.get('tempo_status_options', id)?.name || '—';

/* Muda o status do projeto e propaga só para tarefas/subtarefas que ainda herdam. */
function setProjectStatus(p, statusId) {
  if (p.status_id === statusId) return;
  const from = p.status_id;
  db.update('tempo_projects', p.id, { status_id: statusId }, true);
  logEvent('project', p.id, 'status', `Status: ${statusName(from)} → ${statusName(statusId)}`, from, statusId);
  const st = db.get('tempo_status_options', statusId);
  const ms = { active: 'started_at', done: 'completed_at' }[st?.category];
  if (ms && !p[ms]) db.update('tempo_projects', p.id, { [ms]: nowISO() }, true);
  if (st?.name === 'Enviado' && !p.sent_at) db.update('tempo_projects', p.id, { sent_at: nowISO() }, true);
  let n = 0;
  db.where('tempo_tasks', t => t.project_id === p.id && t.status_inherited !== false).forEach(t => {
    if (t.status_id !== statusId) { db.update('tempo_tasks', t.id, { status_id: statusId }, true); n++; }
  });
  if (n) logEvent('project', p.id, 'propagation', `${n} tarefa(s) herdaram o novo status`, null, null, { project_id: p.id });
  db.emit();
}
/* Mudança manual em tarefa: vira exceção e não propaga para cima nem para irmãs. */
function setTaskStatus(t, statusId) {
  if (t.status_id === statusId && t.status_inherited === false) return;
  const from = t.status_id;
  db.update('tempo_tasks', t.id, { status_id: statusId, status_inherited: false }, true);
  logEvent('task', t.id, 'status', `${t.parent_id ? 'Subtarefa' : 'Tarefa'} “${t.name}”: ${statusName(from)} → ${statusName(statusId)}`, from, statusId, { project_id: t.project_id });
  if (statusCat(statusId) === 'active') reopenProjectIfDone(t.project_id);
  if (statusCat(statusId) === 'done') startDependentTasks(t);
  db.emit();
}
/* Fluxo pré-montado de vídeo: cada etapa com seu responsável e as dependências entre elas. */
const VIDEO_FLOW = [
  { key: 'roteiro', name: 'Roteiro', owner: 'Roteirista', after: [] },
  { key: 'conceito', name: 'Conceito (KV)', owner: 'Eu', after: ['roteiro'] },
  { key: 'storyboard', name: 'Storyboard', owner: 'Eu', after: ['conceito'] },
  { key: 'locucao', name: 'Locução', owner: 'Locutor', after: ['conceito'] },
  { key: 'animacao', name: 'Animação', owner: 'Eu', after: ['storyboard', 'locucao'] },
  { key: 'sonorizacao', name: 'Sonorização', owner: 'Eu', after: ['animacao'] },
];
function createVideoFlow(pid, names = {}) {
  const todo = db.where('tempo_status_options', s => s.kind === 'work' && s.category === 'todo')[0];
  const ids = {};
  VIDEO_FLOW.forEach((s, i) => { ids[s.key] = db.insert('tempo_tasks', { project_id: pid, parent_id: null, name: s.name, status_id: todo?.id || null, status_inherited: false, deadline: null, notes: '', order: i, work_type_id: null, owner: names[s.key] || s.owner, depends_on: [] }, true).id; });
  VIDEO_FLOW.forEach(s => db.update('tempo_tasks', ids[s.key], { depends_on: s.after.map(k => ids[k]) }, true));
  logEvent('project', pid, 'created', 'Fluxo de vídeo criado (pré-montado)', null, null, { project_id: pid });
  db.emit();
}
/* Ligação entre tarefas: quando todas as dependências de uma tarefa "A fazer" estão concluídas, ela entra em andamento sozinha. */
function startDependentTasks(done) {
  const todo = db.where('tempo_status_options', s => s.kind === 'work' && s.category === 'todo')[0];
  const active = db.where('tempo_status_options', s => s.kind === 'work' && s.category === 'active').sort((a, b) => (a.order ?? 99) - (b.order ?? 99))[0];
  if (!active) return;
  db.where('tempo_tasks', x => x.project_id === done.project_id && Array.isArray(x.depends_on) && x.depends_on.includes(done.id)).forEach(x => {
    const deps = x.depends_on.map(id => db.get('tempo_tasks', id)).filter(Boolean);
    if (!deps.length || !deps.every(d => statusCat(d.status_id) === 'done')) return;
    if (todo && x.status_id !== todo.id) return;
    db.update('tempo_tasks', x.id, { status_id: active.id, status_inherited: false }, true);
    logEvent('task', x.id, 'status', `Tarefa “${x.name}” começou automaticamente (dependências concluídas)`, todo?.id || null, active.id, { project_id: x.project_id });
  });
}
/* Projeto concluído com tarefa ativa não pode continuar concluído: volta para "em andamento". */
function reopenProjectIfDone(pid) {
  const pr = db.get('tempo_projects', pid); if (!pr || statusCat(pr.status_id) !== 'done') return;
  const act = db.where('tempo_status_options', s => s.kind === 'work' && s.category === 'active').sort((a, b) => (a.order ?? 99) - (b.order ?? 99))[0];
  if (!act) return;
  db.update('tempo_projects', pid, { status_id: act.id }, true);
  logEvent('project', pid, 'status', `Status: ${statusName(pr.status_id)} → ${act.name} (reaberto automaticamente)`, pr.status_id, act.id);
}
/* Status inicial de tarefa nova: se o projeto está concluído, a tarefa nasce "A fazer" e reabre o projeto. */
function newTaskStatusId(pid) {
  const pr = db.get('tempo_projects', pid);
  if (pr && statusCat(pr.status_id) !== 'done') return pr.status_id;
  return db.where('tempo_status_options', s => s.kind === 'work' && s.category === 'todo')[0]?.id || pr?.status_id || null;
}
function resetTaskInheritance(t) {
  const p = db.get('tempo_projects', t.project_id);
  db.update('tempo_tasks', t.id, { status_inherited: true, status_id: p.status_id }, true);
  logEvent('task', t.id, 'status', `“${t.name}” voltou a herdar o status do projeto`, null, null, { project_id: t.project_id });
  db.emit();
}
function setPaymentStatus(p, statusId) {
  if (p.payment_status_id === statusId) return;
  const from = p.payment_status_id;
  db.update('tempo_projects', p.id, { payment_status_id: statusId }, true);
  logEvent('project', p.id, 'payment_status', `Pagamento: ${statusName(from)} → ${statusName(statusId)}`, from, statusId);
  db.emit();
}
function changeDeadline(p, newDate, reason) {
  if ((p.deadline || '') === (newDate || '')) return;
  const from = p.deadline || null;
  const patch = { deadline: newDate || null };
  if (!p.deadline_original && newDate) patch.deadline_original = newDate;
  db.update('tempo_projects', p.id, patch, true);
  if (from) {
    db.insert('tempo_deadline_changes', { project_id: p.id, from, to: newDate, reason: reason || '', at: nowISO() }, true);
    logEvent('project', p.id, 'deadline', `Prazo: ${fmtDate(from)} → ${newDate ? fmtDate(newDate) : 'sem prazo'}${reason ? ' — ' + reason : ''}`, from, newDate);
  } else if (newDate) logEvent('project', p.id, 'deadline', `Prazo definido: ${fmtDate(newDate)}`, null, newDate);
  db.emit();
}
/* Prazo de tarefa: adiamento com motivo fica no histórico da tarefa (não conta como adiamento do projeto). */
function changeTaskDeadline(t, newDate, reason, isAdjust = false) {
  if (isAdjust && t.deadline && newDate) return createAdjustTask(t, newDate, reason);
  if ((t.deadline || '') === (newDate || '')) return;
  const from = t.deadline || null;
  db.update('tempo_tasks', t.id, { deadline: newDate || null }, true);
  if (from) {
    db.insert('tempo_deadline_changes', { project_id: t.project_id, task_id: t.id, from, to: newDate, reason: reason || '', at: nowISO() }, true);
    logEvent('task', t.id, 'deadline', `Prazo da tarefa “${t.name}”: ${fmtDate(from)} → ${newDate ? fmtDate(newDate) : 'sem prazo'}${reason ? ' — ' + reason : ''}`, from, newDate, { project_id: t.project_id });
  }
  db.emit();
}
/* Ajuste: a tarefa original fica como foi entregue; o novo prazo vai para uma tarefa "[Ajuste NN] nome". */
const ADJUST_RE = /^\[Ajuste \d+\]\s*/;
function createAdjustTask(t, newDate, reason) {
  const base = t.name.replace(ADJUST_RE, '');
  const n = db.where('tempo_tasks', x => x.project_id === t.project_id && x.name.replace(ADJUST_RE, '') === base && ADJUST_RE.test(x.name)).length + 1;
  const todo = db.where('tempo_status_options', s => s.kind === 'work' && s.category === 'todo')[0];
  const nt = db.insert('tempo_tasks', { project_id: t.project_id, parent_id: t.parent_id || null, name: `[Ajuste ${String(n).padStart(2, '0')}] ${base}`, status_id: todo?.id || t.status_id, status_inherited: false, deadline: newDate, notes: reason || '', order: 99, work_type_id: t.work_type_id || null }, true);
  logEvent('task', nt.id, 'created', `Ajuste ${String(n).padStart(2, '0')} de “${base}”${reason ? ' — ' + reason : ''}`, null, null, { project_id: t.project_id });
  db.emit();
  return nt;
}
const deadlineChanges = (pid) => db.where('tempo_deadline_changes', d => d.project_id === pid && !d.task_id).sort((a, b) => a.at.localeCompare(b.at));
function deliveryInfo(p) {
  if (!p.sent_at || !p.deadline) return null;
  const late = daysBetween(p.deadline, ymd(p.sent_at));
  return late > 0 ? { late: true, days: late } : { late: false, days: -late };
}
const MILESTONES = [['approved_at','Aprovação'],['started_at','Início'],['sent_at','Envio / entrega'],['client_approved_at','Aprovação do cliente'],['completed_at','Conclusão'],['invoice_at','Nota fiscal'],['paid_at','Pagamento']];
const INTERVALS = [['approved_at','started_at','Aprovação → início'],['approved_at','completed_at','Aprovação → conclusão'],['completed_at','invoice_at','Conclusão → nota fiscal'],['completed_at','paid_at','Conclusão → pagamento'],['invoice_at','paid_at','Nota fiscal → pagamento']];

/* ---------- sessão ativa ---------- */
/* Tipo de trabalho da última sessão aberta do projeto: a próxima herda esse tipo até você abrir outro. */
function lastWorkType(projectId) {
  if (!projectId) return null;
  const es = db.where('tempo_time_entries', e => e.project_id === projectId && e.work_type_id && entryStart(e))
    .sort((a, b) => new Date(entryStart(b)) - new Date(entryStart(a)));
  return es[0]?.work_type_id || db.get('tempo_projects', projectId)?.work_type_id || null;
}
function startEntry(sel) {
  if (activeEntry()) return null; // impede sessão duplicada
  const work_type_id = sel.work_type_id || lastWorkType(sel.project_id) || null;
  const e = db.insert('tempo_time_entries', { ...sel, work_type_id, state: 'running', segments: [{ s: nowISO(), e: null }], edits: [] });
  db.setSetting('lastSeen', Date.now());
  return e;
}
// troca: o tempo de agora até a volta vai para o projeto "to" (fica como "Trabalho em …", sem pausa)
function pauseEntry(e, at, troca) { const segs = clone(e.segments); const last = segs[segs.length - 1]; last.e = at || nowISO(); if (troca) { last.why = 'moved'; last.troca = true; last.movedTo = troca.to; } db.update('tempo_time_entries', e.id, { state: 'paused', segments: segs }); }
function resumeEntry(e) { const segs = clone(e.segments); segs.push({ s: nowISO(), e: null }); db.update('tempo_time_entries', e.id, { state: 'running', segments: segs }); }
/* Fim da sessão (1.2): se o último trecho é só ociosidade (nenhum registro de atividade nos últimos 2 min), corta no último sinal de atividade. */
const STOP_TAIL_MS = 2 * 60e3;
function stopCutAt(e, end, last) {
  const lastAct = actList(e.id).reduce((t, r) => Math.max(t, new Date(r.to).getTime()), 0);
  const startMs = new Date(last.s).getTime(), endMs = new Date(end).getTime();
  if (!lastAct || lastAct >= endMs - STOP_TAIL_MS || lastAct <= startMs) return end;
  return new Date(lastAct).toISOString();
}
/* Início da sessão (1.3): se o primeiro sinal de atividade só vem mais de 2 min depois do início, o início é puxado para ele. */
function stopTrimStart(e, segs) {
  const acts = actList(e.id); if (!acts.length || !segs[0]?.s) return;
  const firstAct = Math.min(...acts.map(r => new Date(r.from).getTime()));
  const s0 = new Date(segs[0].s).getTime(), lim = segs[0].e ? new Date(segs[0].e).getTime() : Infinity;
  if (firstAct - s0 > STOP_TAIL_MS && firstAct < lim) segs[0].s = new Date(firstAct).toISOString();
}
function stopEntry(e, at) {
  const segs = clone(e.segments); stopTrimStart(e, segs); const last = segs[segs.length - 1];
  if (!last.e) last.e = stopCutAt(e, at || nowISO(), last);
  db.update('tempo_time_entries', e.id, { state: 'done', segments: segs });
}
/* Migração (uma vez): lacunas que já eram trechos movidos para outro projeto viram "movido", com o destino.
   Uma lacuna conta como movida se os lançamentos "Movido de outra sessão" cobrem quase todo o seu tempo. */
function migrateMovedGaps() {
  if (db.setting('migMovedGaps', false)) return 0;
  const T = (x) => new Date(x).getTime();
  const all = db.all('tempo_time_entries');
  const dests = all.filter(d => /^Movido de outra sessão/.test(d.notes || '') && (d.segments || []).length);
  let n = 0;
  all.forEach(o => {
    const segs = o.segments || []; const out = segs.map(x => ({ ...x })); let changed = false;
    for (let i = 0; i < segs.length - 1; i++) {
      const a = segs[i].e, b = segs[i + 1].s;
      if (!a || !b || T(b) <= T(a) || segs[i].why === 'moved') continue;
      const A = T(a), B = T(b), len = B - A;
      let total = 0, best = null, bestC = 0;
      dests.forEach(d => {
        if (d.id === o.id) return;
        const c = (d.segments || []).filter(x => x.e && T(x.s) >= A - 1000 && T(x.e) <= B + 1000).reduce((t, x) => t + (T(x.e) - T(x.s)), 0);
        total += c; if (c > bestC) { bestC = c; best = d; }
      });
      if (best && total >= len * 0.9) { out[i] = { ...out[i], why: 'moved', movedTo: best.project_id }; changed = true; n++; }
    }
    if (changed) db.update('tempo_time_entries', o.id, { segments: out, edits: auditEdit(o, segs, 'Lacuna de trecho movido marcada (migração)') }, true);
  });
  db.setSetting('migMovedGaps', true);
  return n;
}
/* Migração (uma vez): nos lançamentos de destino de trechos movidos, o espaço entre os pedaços é "fora" e não pausa. */
function migrateForaGaps() {
  if (db.setting('migFora1', false)) return 0;
  let n = 0;
  db.all('tempo_time_entries').forEach(d => {
    if (!/^Movido de outra sessão/.test(d.notes || '')) return;
    const segs = d.segments || []; const out = segs.map(x => ({ ...x })); let changed = false;
    for (let i = 0; i < segs.length - 1; i++) {
      if (segs[i].e && segs[i + 1].s && new Date(segs[i + 1].s) > new Date(segs[i].e) && !isForaWhy(segs[i].why)) { out[i] = { ...out[i], why: 'moved' }; changed = true; n++; }
    }
    if (changed) db.update('tempo_time_entries', d.id, { segments: out }, true);
  });
  db.setSetting('migFora1', true);
  return n;
}
/* Migração (uma vez): lacuna "movida" sem destino gravado ganha o projeto que recebeu esse tempo (o lançamento de destino com movedFrom = este projeto). */
function migrateMovedTo() {
  if (db.setting('migMovedTo1', false)) return 0;
  const T = (x) => new Date(x).getTime();
  const all = db.all('tempo_time_entries');
  let n = 0;
  all.forEach(o => {
    const segs = o.segments || []; const out = segs.map(x => ({ ...x })); let changed = false;
    for (let i = 0; i < segs.length - 1; i++) {
      const a = segs[i].e, b = segs[i + 1].s;
      if (!isForaWhy(segs[i].why) || segs[i].movedTo || !a || !b || T(b) <= T(a)) continue;
      const A = T(a), B = T(b);
      const hit = all.find(d => d.id !== o.id && (d.segments || []).some(x => x.movedFrom === o.project_id && x.e && T(x.s) < B + 1000 && T(x.e) > A - 1000));
      if (hit && hit.project_id) { out[i] = { ...out[i], movedTo: hit.project_id }; changed = true; n++; }
    }
    if (changed) db.update('tempo_time_entries', o.id, { segments: out }, true);
  });
  db.setSetting('migMovedTo1', true);
  return n;
}
/* Conferência dos registros (ao abrir o app): sessão encerrada não pode ter trecho aberto, porque ele contaria até agora.
   Remove o trecho aberto e deixa rastro no histórico de correções. */
function checkEntries() {
  migrateForaGaps();
  migrateMovedTo();
  const movidos = migrateMovedGaps();
  if (movidos) toast(`${movidos} lacuna(s) de trecho movido marcada(s) com o destino.`);
  let fixed = 0;
  db.all('tempo_time_entries').forEach(e => {
    if (e.state !== 'done') return;
    const segs = e.segments || [];
    const keep = segs.filter(s => s.e);
    if (keep.length === segs.length || !keep.length) return;
    db.update('tempo_time_entries', e.id, { segments: keep, edits: auditEdit(e, segs, 'Trecho aberto removido de sessão encerrada (conferência)') }, true);
    fixed++;
  });
  if (fixed) toast(`Conferência: ${fixed} sessão(ões) com trecho aberto foram corrigidas.`);
  return fixed;
}
function auditEdit(e, before, reason) {
  const edits = [...(e.edits || []), { at: nowISO(), reason: reason || '', before }];
  return edits;
}

/* ---------- dados fictícios para compor as telas ---------- */
function seedDemo() {
  const T = new Date(); T.setSeconds(0, 0);
  const day = (o, h = 0, m = 0) => { const d = new Date(T); d.setDate(d.getDate() + o); d.setHours(h, m, 0, 0); return d; };
  const D = (o) => ymd(day(o));
  const st = (k, n) => statuses(k).find(s => s.name === n).id;
  const wt = (n) => workTypes(true).find(w => w.name === n).id;

  const ag = {};
  [['Estúdio Maré','blue','12.345.678/0001-90','Rafaela Lins — rafaela@estudiomare.com.br','Rua da Aurora, 300 — Boa Vista, Recife/PE','Pagamento 30 dias após NF.'],
   ['Coletivo Farol','green','23.456.789/0001-01','Diego Albuquerque — (81) 99999-1020','Rua do Bom Jesus, 125 — Recife Antigo','Prefere entregas por link do Drive.'],
   ['Agência Pitanga','pink','34.567.890/0001-12','Marina Costa — marina@pitanga.ag','Av. Boa Viagem, 2200 — Recife/PE','']]
    .forEach(([name, color, cnpj, contact, address, notes]) => ag[name] = db.insert('tempo_agencies', { name, abbr: abbrFor(name), color: hexOf(color), cnpj, contact, address, notes, archived: false }, true));

  const cl = {};
  [['Cervejaria Capibaribe','Estúdio Maré','orange'],['Banco Arrecife','Estúdio Maré','blue'],['Festival Frevo Novo','Coletivo Farol','red'],
   ['Livraria Sebo Azul','Coletivo Farol','purple'],['Sorveteria Tropix','Agência Pitanga','yellow'],['Café Olinda Alta',null,'brown'],['Ateliê Casa Amarela',null,'yellow']]
    .forEach(([name, a, color]) => cl[name] = db.insert('tempo_clients', { name, agency_id: a ? ag[a].id : directAgency().id, color: a ? colorVariant(ag[a].color, db.all('tempo_clients').filter(x => x.agency_id === ag[a].id).map(x => x.color)) : hexOf(color), cnpj: '', contact: '', address: '', notes: a ? '' : 'Cliente direto, sem agência.', archived: false }, true));

  const pr = {};
  const P = (key, client, o) => pr[key] = db.insert('tempo_projects', {
    name: key, client_id: cl[client].id, description: o.desc || '', status_id: st('work', o.status), payment_status_id: st('payment', o.pay),
    deadline_original: o.orig ?? o.deadline ?? null, deadline: o.deadline ?? null, budget: o.budget ?? null, remaining_override: o.remOv ?? null,
    estimated_hours: o.est ?? null, notes: o.obs || '', revisions_included: o.revInc ?? 2, archived: false,
    approved_at: o.approved != null ? day(o.approved, 10).toISOString() : null, started_at: o.started != null ? day(o.started, 9).toISOString() : null,
    sent_at: o.sent != null ? day(o.sent, 17).toISOString() : null, client_approved_at: null,
    completed_at: o.completed != null ? day(o.completed, 18).toISOString() : null, invoice_at: o.invoice != null ? day(o.invoice, 11).toISOString() : null,
    paid_at: o.paidAt != null ? day(o.paidAt, 12).toISOString() : null, created_at: day(o.created ?? -30, 9).toISOString()
  }, true);

  P('Rótulos linha Maracatu', 'Cervejaria Capibaribe', { status: 'Em andamento', pay: 'Pago Parcial', budget: 18500, est: 60, deadline: D(9), orig: D(4), approved: -20, started: -18, obs: '50% na aprovação + 50% na entrega', created: -24, desc: 'Família de 4 rótulos para a linha sazonal.' });
  P('Campanha Conta Jovem — KV', 'Banco Arrecife', { status: 'Aprovação', pay: 'Não Pago', budget: 12000, est: 40, deadline: D(2), approved: -14, started: -13, sent: -1, obs: 'Líquido 10.200 após impostos', created: -16 });
  P('Vinheta Festival 2027', 'Festival Frevo Novo', { status: 'Em andamento', pay: 'Não faturado', budget: 22000, est: 80, deadline: D(21), approved: -6, started: -5, obs: 'Motion 30s + versões 15s e 6s', created: -9 });
  P('Identidade visual Sebo Azul', 'Livraria Sebo Azul', { status: 'Concluído', pay: 'Pago', budget: 9500, est: 35, deadline: D(-12), orig: D(-20), approved: -40, started: -38, sent: -13, completed: -10, invoice: -9, paidAt: -2, created: -45 });
  P('Embalagens picolé verão', 'Sorveteria Tropix', { status: 'Aguardando cliente', pay: 'Não Pago', budget: 7800, est: 28, deadline: D(6), approved: -10, started: -8, obs: 'Aguardando fotos dos produtos', created: -12 });
  P('Cardápio e sinalização', 'Café Olinda Alta', { status: 'Concluído', pay: 'Atrasado', budget: 4200, est: 16, deadline: D(-25), approved: -50, started: -48, sent: -26, completed: -24, invoice: -22, created: -55, obs: 'Cobrar novamente na sexta' });
  P('Ilustrações para azulejos', 'Ateliê Casa Amarela', { status: 'A fazer', pay: 'Não faturado', budget: 6000, est: 24, deadline: D(30), approved: -1, created: -3 });
  P('Relatório anual — diagramação', 'Banco Arrecife', { status: 'Stand by', pay: 'Pago Parcial', budget: 15000, est: 50, deadline: D(40), orig: D(15), approved: -30, started: -28, obs: 'Pausado até o fechamento do balanço', created: -33 });
  P('Mascote 3D Tropix', 'Sorveteria Tropix', { status: 'Concluído', pay: 'Pago', budget: 11000, est: 45, deadline: D(-35), approved: -70, started: -66, sent: -36, completed: -33, invoice: -33, paidAt: -20, created: -72, obs: 'Cortesia: 2 poses extras' });

  // tarefas e subtarefas
  const task = (p, name, status, extra = {}) => db.insert('tempo_tasks', { project_id: pr[p].id, parent_id: null, name, status_id: st('work', status), status_inherited: extra.inh ?? false, deadline: extra.deadline || null, notes: extra.notes || '', order: extra.order || 0, work_type_id: extra.wt ? wt(extra.wt) : null }, true);
  const sub = (t, name, status, inh = false) => db.insert('tempo_tasks', { project_id: t.project_id, parent_id: t.id, name, status_id: st('work', status), status_inherited: inh, deadline: null, notes: '', order: 0 }, true);
  const t1 = task('Rótulos linha Maracatu', 'Conceito e moodboard', 'Concluído', { wt: 'Direção de arte', order: 0 });
  const t2 = task('Rótulos linha Maracatu', 'Ilustração dos 4 rótulos', 'Em andamento', { wt: 'Ilustração 2D', order: 1, deadline: D(5) });
  sub(t2, 'Rótulo Baque Virado', 'Concluído'); const s2b = sub(t2, 'Rótulo Loa', 'Em andamento'); sub(t2, 'Rótulo Calunga', 'A fazer'); sub(t2, 'Rótulo Estandarte', 'A fazer');
  const t3 = task('Rótulos linha Maracatu', 'Arte-final e fechamento', 'A fazer', { wt: 'Design gráfico', order: 2 });
  const t4 = task('Campanha Conta Jovem — KV', 'Key visual', 'Aprovação', { wt: 'Direção de arte', inh: true });
  const t5 = task('Campanha Conta Jovem — KV', 'Desdobramentos redes sociais', 'Aprovação', { wt: 'Design gráfico', inh: true });
  const t6 = task('Vinheta Festival 2027', 'Storyboard', 'Concluído', { wt: 'Motion graphics' });
  const t7 = task('Vinheta Festival 2027', 'Animação 30s', 'Em andamento', { wt: 'Animação 2D', deadline: D(14) });
  sub(t7, 'Cena abertura', 'Em andamento', true); sub(t7, 'Cena passistas', 'A fazer'); sub(t7, 'Assinatura', 'A fazer');
  const t8 = task('Embalagens picolé verão', 'Layout das embalagens', 'Aguardando cliente', { wt: 'Design gráfico', inh: true });
  const t9 = task('Identidade visual Sebo Azul', 'Logotipo', 'Concluído', { wt: 'Branding / marcas', inh: true });
  const t10 = task('Identidade visual Sebo Azul', 'Manual da marca', 'Concluído', { wt: 'Branding / marcas', inh: true });
  task('Ilustrações para azulejos', 'Pesquisa de padrões', 'A fazer', { wt: 'Ilustração 2D', inh: true });
  const t12 = task('Mascote 3D Tropix', 'Modelagem', 'Concluído', { wt: 'Modelagem 3D', inh: true });
  const t13 = task('Relatório anual — diagramação', 'Grid e tipografia', 'Concluído', { wt: 'Design gráfico' });

  // revisões
  const rv = (p, n, req, desc, resent, by) => db.insert('tempo_revisions', { project_id: pr[p].id, number: n, requested_at: day(req, 10).toISOString(), requested_by: by, description: desc, resent_at: resent != null ? day(resent, 16).toISOString() : null, notes: '' }, true);
  const r1 = rv('Campanha Conta Jovem — KV', 1, -9, 'Trocar paleta para tons mais quentes e aumentar o logo.', -7, 'Rafaela (Estúdio Maré)');
  const r2 = rv('Campanha Conta Jovem — KV', 2, -5, 'Ajustar título e incluir selo do app.', -3, 'Rafaela (Estúdio Maré)');
  rv('Campanha Conta Jovem — KV', 3, -1, 'Nova foto do personagem principal.', null, 'Cliente final');
  const r4 = rv('Identidade visual Sebo Azul', 1, -16, 'Testar versão do símbolo sem o livro aberto.', -15, 'Diego (Coletivo Farol)');

  // pagamentos
  const pay = (p, amount, o, note) => db.insert('tempo_payments', { project_id: pr[p].id, amount, date: D(o), note: note || '', invoice: '' }, true);
  pay('Rótulos linha Maracatu', 9250, -17, '50% na aprovação');
  pay('Identidade visual Sebo Azul', 9500, -2, 'Pagamento integral');
  pay('Relatório anual — diagramação', 5000, -25, 'Entrada');
  pay('Mascote 3D Tropix', 5500, -50, 'Entrada'); pay('Mascote 3D Tropix', 5500, -20, 'Saldo');

  // mudanças de prazo
  db.insert('tempo_deadline_changes', { project_id: pr['Rótulos linha Maracatu'].id, from: D(4), to: D(9), reason: 'Cliente pediu mais um sabor na linha', at: day(-3, 14).toISOString() }, true);
  db.insert('tempo_deadline_changes', { project_id: pr['Relatório anual — diagramação'].id, from: D(15), to: D(40), reason: 'Balanço atrasou', at: day(-10, 11).toISOString() }, true);
  db.insert('tempo_deadline_changes', { project_id: pr['Identidade visual Sebo Azul'].id, from: D(-20), to: D(-12), reason: 'Rodada extra no símbolo', at: day(-21, 15).toISOString() }, true);

  // sessões de tempo (últimas 3 semanas + hoje)
  const E = (p, t, wtn, o, h1, m1, h2, m2, notes, rev) => {
    const tk = t ? t : null; const proj = pr[p];
    db.insert('tempo_time_entries', { project_id: proj.id, client_id: proj.client_id, agency_id: clientOf(proj)?.agency_id || null, task_id: tk?.id || null, work_type_id: wt(wtn), notes: notes || '', revision_id: rev?.id || null, state: 'done', segments: [{ s: day(o, h1, m1).toISOString(), e: day(o, h2, m2).toISOString() }], edits: [], created_at: day(o, h1, m1).toISOString() }, true);
  };
  E('Rótulos linha Maracatu', t1, 'Direção de arte', -18, 9, 0, 12, 30, 'Pesquisa de referências de maracatu nação');
  E('Rótulos linha Maracatu', t1, 'Reunião', -17, 14, 0, 15, 0, 'Apresentação do conceito');
  E('Rótulos linha Maracatu', t2, 'Ilustração 2D', -12, 9, 30, 13, 0);
  E('Rótulos linha Maracatu', t2, 'Ilustração 2D', -11, 14, 0, 18, 45);
  E('Rótulos linha Maracatu', s2b, 'Ilustração 2D', -2, 9, 15, 12, 40, 'Rótulo Loa — finalização das cores');
  E('Rótulos linha Maracatu', s2b, 'Ilustração 2D', -1, 13, 30, 17, 10);
  E('Campanha Conta Jovem — KV', t4, 'Direção de arte', -13, 9, 0, 13, 0);
  E('Campanha Conta Jovem — KV', t4, 'Direção de arte', -12, 9, 0, 12, 0);
  E('Campanha Conta Jovem — KV', t4, 'Direção de arte', -8, 10, 0, 12, 30, 'Rodada 1', r1);
  E('Campanha Conta Jovem — KV', t5, 'Design gráfico', -4, 14, 0, 17, 30, 'Rodada 2 + desdobramentos', r2);
  E('Vinheta Festival 2027', t6, 'Motion graphics', -5, 9, 0, 13, 15);
  E('Vinheta Festival 2027', t7, 'Animação 2D', -3, 9, 0, 12, 50);
  E('Vinheta Festival 2027', t7, 'Animação 2D', -1, 9, 0, 12, 20);
  E('Embalagens picolé verão', t8, 'Design gráfico', -8, 14, 0, 18, 0);
  E('Embalagens picolé verão', null, 'Reunião', -7, 10, 0, 11, 0, 'Call com a Marina sobre formatos');
  E('Identidade visual Sebo Azul', t9, 'Branding / marcas', -36, 9, 0, 13, 0);
  E('Identidade visual Sebo Azul', t9, 'Branding / marcas', -30, 9, 0, 14, 0);
  E('Identidade visual Sebo Azul', t9, 'Branding / marcas', -16, 14, 0, 16, 30, 'Rodada 1 — símbolo', r4);
  E('Identidade visual Sebo Azul', t10, 'Branding / marcas', -14, 9, 0, 13, 30);
  E('Relatório anual — diagramação', t13, 'Design gráfico', -27, 9, 0, 13, 0);
  E('Mascote 3D Tropix', t12, 'Modelagem 3D', -60, 9, 0, 18, 0);
  E('Mascote 3D Tropix', t12, 'Modelagem 3D', -55, 9, 0, 17, 0);
  E('Cardápio e sinalização', null, 'Design gráfico', -40, 9, 0, 14, 0);
  // hoje
  E('Rótulos linha Maracatu', s2b, 'Ilustração 2D', 0, 8, 30, 10, 5, 'Ajuste de contraste no rótulo Loa');
  E('Vinheta Festival 2027', null, 'Reunião', 0, 10, 30, 11, 15, 'Alinhamento com o Diego sobre a trilha');

  // orçamentos
  const Q = (name, client, status, value, hrs, sent, valid, wtn, notes, follow) => db.insert('tempo_quotes', { name, agency_id: clientOf({ client_id: cl[client].id })?.agency_id || null, client_id: cl[client].id, status_id: st('quote', status), value, est_hours: hrs, sent_at: sent != null ? D(sent) : null, valid_until: valid != null ? D(valid) : null, work_type_id: wt(wtn), notes: notes || '', followups: follow || [], project_id: null, revisions_included: 2, extra_revision_price: null }, true);
  Q('Série de GIFs para lançamento', 'Cervejaria Capibaribe', 'Enviado', 5400, 20, -4, 11, 'Motion graphics', 'Seis GIFs de 5s', [{ date: D(-1), note: 'Rafaela disse que responde até quinta' }]);
  Q('Rebranding completo', 'Café Olinda Alta', 'Em negociação', 14000, 55, -9, 6, 'Branding / marcas', 'Cliente pediu parcelamento em 3x', [{ date: D(-6), note: 'Call de apresentação' }, { date: D(-2), note: 'Enviada versão com 3x' }]);
  Q('Animação 3D institucional', 'Banco Arrecife', 'Rascunho', 28000, 110, null, null, 'Animação 3D', '');
  Q('Pôster edição 2026', 'Festival Frevo Novo', 'Recusado', 3500, 12, -40, -10, 'Ilustração 2D', 'Fecharam com outro ilustrador');
  const qa = Q('Ilustrações para azulejos', 'Ateliê Casa Amarela', 'Aprovado', 6000, 24, -8, 22, 'Ilustração 2D', '');
  db.update('tempo_quotes', qa.id, { project_id: pr['Ilustrações para azulejos'].id }, true);

  // histórico básico dos projetos
  Object.values(pr).forEach(p => {
    logEvent('project', p.id, 'created', 'Projeto criado', null, null, { at: p.created_at });
    MILESTONES.forEach(([k, label]) => { if (p[k]) logEvent('project', p.id, 'milestone', label, null, null, { at: p[k] }); });
  });
  db.all('tempo_deadline_changes').forEach(d => logEvent('project', d.project_id, 'deadline', `Prazo: ${fmtDate(d.from)} → ${fmtDate(d.to)} — ${d.reason}`, d.from, d.to, { at: d.at, project_id: d.project_id }));
  db.all('tempo_revisions').forEach(r => {
    logEvent('revision', r.id, 'revision', `Pedido de ajuste ${r.number}: ${r.description}`, null, null, { at: r.requested_at, project_id: r.project_id });
    if (r.resent_at) logEvent('revision', r.id, 'resent', `Reenvio da rodada ${r.number}`, null, null, { at: r.resent_at, project_id: r.project_id });
  });
  db.all('tempo_payments').forEach(x => logEvent('payment', x.id, 'payment', `Recebido ${fmtMoney(x.amount)}${x.note ? ' — ' + x.note : ''}`, null, null, { at: parseYmd(x.date).toISOString(), project_id: x.project_id }));
  db.setSetting('demo', true);
  db.setSetting('rates', { grande: null, medio: null, pequeno: null });
}

/* data e hora digitadas livremente: 17/10/2026, 17102026, 17-10-26; hora: 16:30, 1630, 16h30 */
function parseDataBR(txt) {
  const t = String(txt || '').trim(); if (!t) return null;
  const m = t.match(/^(\d{1,2})\D?(\d{1,2})\D?(\d{2}|\d{4})$/) || t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  let [, dd, mm, yy] = m; yy = yy.length === 2 ? '20' + yy : yy;
  const d = new Date(Number(yy), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(yy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return `${yy}-${pad(Number(mm))}-${pad(Number(dd))}`;
}
function parseHora(txt) {
  const t = String(txt || '').trim(); if (!t) return null;
  const m = t.match(/^(\d{1,2})\s*[:hH.]?\s*(\d{2})$/); if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]); if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
}
