/* =====================================================================
   MENU DE CONTEXTO (botão direito) — funciona nas telas com listas.
   Se a linha faz parte de uma seleção de tabela, o menu age sobre a seleção.
   ===================================================================== */
const CTX_TABLE_KIND = { tasks: 'task', projects: 'project', profit: 'project', agencies: 'agency', clients: 'client', 'ex-in': 'expense', 'ex-out': 'expense', reimb: 'reimb' };
const CTX_ACT_KIND = { 'ts-edit': 'entry', 'proj-open': 'project', 'notice-open': 'notice', 'notice-accept': 'notice' };

function ctxTarget(e) {
  const tbl = e.target.closest?.('table[data-table]');
  if (tbl) {
    const tr = e.target.closest('tbody tr'); if (!tr) return null;
    const kind = CTX_TABLE_KIND[tbl.dataset.table]; const id = tr.querySelector('input[data-id]')?.dataset.id;
    if (!kind || !id) return null;
    const s = selOf(tbl.dataset.table);
    return { kind, id, ids: s.has(id) && s.size > 1 ? [...s] : [id] };
  }
  const el = e.target.closest?.('[data-act][data-id]'); if (!el) return null;
  if (el.dataset.act === 'party-open') return { kind: el.dataset.kind, id: el.dataset.id, ids: [el.dataset.id] };
  const kind = CTX_ACT_KIND[el.dataset.act]; if (!kind) return null;
  return { kind, id: el.dataset.id, ids: [el.dataset.id] };
}

const ctxDone = () => statuses('work').find(x => x.category === 'done');
const ctxTodo = () => statuses('work').find(x => x.category === 'todo');
const ctxNoFat = () => statuses('payment').find(x => x.name === 'Não faturado');
const ctxShift = (iso, ms) => iso ? new Date(new Date(iso).getTime() + ms).toISOString() : iso;


async function ctxConfirm(title, body) { return confirmBox({ title, body, ok: 'Excluir', danger: true }); }

function duplicateProject(id) {
  const p = db.get('tempo_projects', id); if (!p) return;
  const { id: _pid, ...rest } = p;
  const np = db.insert('tempo_projects', { ...rest, name: `${p.name} (cópia)`, status_id: ctxTodo()?.id || p.status_id, payment_status_id: ctxNoFat()?.id || p.payment_status_id, archived: false }, true);
  const map = {};
  const tasks = db.where('tempo_tasks', t => t.project_id === id);
  const copyTask = (t) => {
    const { id: tid, parent_id, ...tr } = t;
    const nt = db.insert('tempo_tasks', { ...tr, project_id: np.id, parent_id: parent_id ? (map[parent_id] || null) : null, status_id: ctxTodo()?.id || t.status_id, status_inherited: true, order: 99 }, true);
    map[tid] = nt.id;
  };
  tasks.filter(t => !t.parent_id).forEach(copyTask);
  tasks.filter(t => t.parent_id).forEach(copyTask);
  logEvent('project', np.id, 'created', `Projeto duplicado de “${p.name}”`);
  db.emit(); toast('Projeto duplicado'); return np;
}

function duplicateEntry(e, shiftMs) {
  const { id: _eid, ...rest } = e;
  const segs = (e.segments || []).map(s => ({ s: ctxShift(s.s, shiftMs), e: ctxShift(s.e, shiftMs) }));
  db.insert('tempo_time_entries', { ...rest, segments: segs, edits: [], created_at: shiftMs ? ctxShift(e.created_at, shiftMs) : e.created_at }, true);
  db.emit(); toast(shiftMs ? 'Registro copiado para amanhã' : 'Registro duplicado');
}

function ctxItems(t) {
  const out = [];
  const add = (label, run, extra = {}) => out.push({ label, run, ...extra });
  const multi = t.ids.length > 1; const n = t.ids.length;
  const nameOf = () => { const r = t.kind === 'task' ? db.get('tempo_tasks', t.id) : t.kind === 'project' ? db.get('tempo_projects', t.id) : t.kind === 'client' ? db.get('tempo_clients', t.id) : t.kind === 'agency' ? db.get('tempo_agencies', t.id) : null; return r?.name; };

  if (t.kind === 'task') {
    const ts = t.ids.map(id => db.get('tempo_tasks', id)).filter(Boolean); const one = ts.length === 1 ? ts[0] : null;
    if (one) add('Começar timesheet', () => ACTIONS['tk-track']({ dataset: { id: one.id } }));
    add(`Duplicar${multi ? ` (${n})` : ''}`, () => duplicateTasks(t.ids));
    if (ctxDone()) add(`Concluir${multi ? ` (${n})` : ''}`, () => { ts.forEach(x => setTaskStatus(x, ctxDone().id)); db.emit(); });
    if (ctxTodo() && ts.some(x => statusCat(x.status_id) === 'done')) add(`Reabrir${multi ? ` (${n})` : ''}`, () => { ts.forEach(x => setTaskStatus(x, ctxTodo().id)); db.emit(); });
    if (one) add('Abrir projeto', () => openProject(one.project_id, 'tasks'));
    add(`Excluir${multi ? ` (${n})` : ''}`, async () => {
      if (!await ctxConfirm('Excluir tarefa?', `${multi ? n + ' tarefas' : '“' + esc(one?.name || '') + '”'} e suas subtarefas serão removidas.`)) return;
      ts.forEach(x => { db.where('tempo_tasks', c => c.parent_id === x.id).forEach(c => db.remove('tempo_tasks', c.id, true)); db.remove('tempo_tasks', x.id, true); });
      db.emit(); toast('Tarefa excluída');
    }, { danger: true });
    if (one) add('Copiar nome', () => navigator.clipboard?.writeText(one.name).then(() => toast('Nome copiado')));
  }

  if (t.kind === 'project') {
    const p = db.get('tempo_projects', t.id); if (!p) return out;
    const ag = clientOf(p)?.agency_id || '__none';
    add('Abrir projeto', () => openProject(t.id));
    add('Começar timesheet', () => openStartModal({ agency_id: ag, client_id: p.client_id, project_id: p.id }));
    add('Duplicar projeto', () => { const np = duplicateProject(t.id); if (np) openProject(np.id); });
    if (ctxDone() && statusCat(p.status_id) !== 'done') add('Concluir', () => { setProjectStatus(p, ctxDone().id); db.emit(); });
    add(p.archived ? 'Desarquivar' : 'Arquivar', () => { db.update('tempo_projects', p.id, { archived: !p.archived }); toast(p.archived ? 'Projeto desarquivado' : 'Projeto arquivado'); });
    add('Copiar nome', () => navigator.clipboard?.writeText(p.name).then(() => toast('Nome copiado')));
  }

  if (t.kind === 'client') {
    const c = db.get('tempo_clients', t.id); if (!c) return out;
    add('Abrir cliente', () => openParty('client', c.id));
    add('Novo projeto deste cliente', () => openProjectForm(null, c.id));
    add(c.archived ? 'Desarquivar' : 'Arquivar', () => { db.update('tempo_clients', c.id, { archived: !c.archived }); toast(c.archived ? 'Cliente desarquivado' : 'Cliente arquivado'); });
    add('Copiar nome', () => navigator.clipboard?.writeText(c.name).then(() => toast('Nome copiado')));
  }

  if (t.kind === 'agency') {
    const a = db.get('tempo_agencies', t.id); if (!a) return out;
    add('Abrir agência', () => openParty('agency', a.id));
    add('Novo cliente desta agência', () => openPartyForm('client', null, null, { agency_id: a.id }));
    add(a.archived ? 'Desarquivar' : 'Arquivar', () => { db.update('tempo_agencies', a.id, { archived: !a.archived }); toast(a.archived ? 'Agência desarquivada' : 'Agência arquivada'); });
    add('Copiar nome', () => navigator.clipboard?.writeText(a.name).then(() => toast('Nome copiado')));
  }

  if (t.kind === 'entry') {
    const e = db.get('tempo_time_entries', t.id); if (!e) return out;
    const running = activeEntry()?.id === e.id;
    add('Editar registro', () => openEntryModal(e.id));
    if (!running) {
      add('Duplicar', () => duplicateEntry(e, 0));
      add('Copiar para amanhã', () => duplicateEntry(e, 86400000));
      add('Excluir', async () => {
        if (!await ctxConfirm('Excluir registro?', 'O registro de tempo será removido.')) return;
        db.remove('tempo_time_entries', e.id); toast('Registro excluído');
      }, { danger: true });
    }
  }

  if (t.kind === 'notice') {
    add('Aceitar', () => ACTIONS['notice-accept']({ dataset: { id: t.id } }));
    add('Ignorar', () => ACTIONS['notice-ignore']({ dataset: { id: t.id } }));
    add('Adiar 1 dia', () => ACTIONS['notice-snooze']({ dataset: { id: t.id } }));
  }

  if (t.kind === 'expense') {
    const r = db.get('tempo_expenses', t.id); if (!r) return out;
    add('Duplicar', () => { const { id: _x, ...rest } = r; db.insert('tempo_expenses', { ...rest, order: (r.order ?? 0) + 1 }, true); db.emit(); toast('Lançamento duplicado'); });
    add('Excluir', async () => { if (await ctxConfirm('Excluir lançamento?', 'Esta linha será removida.')) ACTIONS['ex-del']({ dataset: { id: t.id } }); }, { danger: true });
  }

  if (t.kind === 'reimb') {
    const r = db.get('tempo_reimb_rows', t.id); if (!r) return out;
    add('Duplicar', () => { const { id: _x, ...rest } = r; db.insert('tempo_reimb_rows', rest, true); db.emit(); toast('Linha duplicada'); });
    add('Excluir', async () => { if (await ctxConfirm('Excluir linha?', 'Esta linha de reembolso será removida.')) ACTIONS['rb-del']({ dataset: { id: t.id } }); }, { danger: true });
  }
  return out;
}

function ctxClose() { document.querySelector('.ctxmenu')?.remove(); }
function ctxOpen(t, x, y) {
  ctxClose();
  const items = ctxItems(t); if (!items.length) return;
  const m = document.createElement('div'); m.className = 'ctxmenu'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => `<button type="button" class="ctxi ${it.danger ? 'danger' : ''}" data-i="${i}" role="menuitem">${esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  m.style.left = Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 8)) + 'px';
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const it = items[Number(b.dataset.i)]; ctxClose();
    try { const r = it.run(); if (r && r.catch) r.catch(err => toast('Não deu para concluir: ' + (err.message || err))); }
    catch (err) { toast('Não deu para concluir: ' + (err.message || err)); }
    render();
  });
}

document.addEventListener('contextmenu', (e) => {
  const t = ctxTarget(e);
  if (!t) { ctxClose(); return; }
  e.preventDefault();
  ctxOpen(t, e.clientX, e.clientY);
});
document.addEventListener('mousedown', (e) => { if (!e.target.closest?.('.ctxmenu')) ctxClose(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ctxClose(); });
window.addEventListener('scroll', ctxClose, true);
