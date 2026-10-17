/* =====================================================================
   DROPDOWN COM BUSCA — selecionar, buscar ou criar opção nova
   ===================================================================== */
function comboItems(kind) {
  if (['work', 'payment', 'quote'].includes(kind)) return statuses(kind).map(s => ({ id: s.id, name: s.name, color: s.color, html: tag(s.name, s.color, { pill: kind !== 'payment' }) }));
  if (kind.startsWith('reimb_')) return statuses(kind).map(s => ({ id: s.id, name: s.name, color: s.color, html: tag(s.name, s.color, { pill: true }) }));
  if (kind === 'wt') return workTypes().map(w => ({ id: w.id, name: w.name, color: w.color, html: tag(w.name, w.color) }));
  if (kind === 'client') return clients().map(c => ({ id: c.id, name: c.name + ' ' + (db.get('tempo_agencies', c.agency_id)?.name || ''), html: clientTag(c) }));
  return [];
}
function openCombo(anchor, { kind, value, onPick, allowEmpty = false }) {
  $('.combo-pop')?.remove();
  const pop = document.createElement('div'); pop.className = 'colormenu combo-pop'; pop.setAttribute('role', 'listbox');
  let q = '', hi = 0;
  const canCreate = ['work', 'payment', 'quote', 'wt', 'client'].includes(kind);
  const draw = () => {
    const items = comboItems(kind).filter(x => !q || norm(x.name).includes(norm(q)));
    const exact = comboItems(kind).some(x => norm(x.name.split(' ')[0]) === norm(q) || norm(x.name) === norm(q));
    const rows = [...(allowEmpty && !q ? [{ id: '', html: '<span class="faint">Nenhum</span>' }] : []), ...items];
    if (canCreate && q.trim() && !exact) rows.push({ create: true, id: '__new', html: `${icon('plus')} Criar <b>${esc(q.trim())}</b>` });
    hi = Math.min(hi, rows.length - 1);
    pop.innerHTML = `<input class="input sm combo-q" placeholder="Buscar ou criar…" value="${esc(q)}" aria-label="Buscar">
      <div class="combo-list">${rows.map((r, i) => `<button type="button" class="combo-opt ${i === hi ? 'hi' : ''} ${r.id === value ? 'cur' : ''}" data-i="${i}">${r.html}${r.id === value ? `<span class="grow"></span>${icon('check', 'ico')}` : ''}</button>`).join('') || '<div class="faint small" style="padding:8px">Nada encontrado.</div>'}</div>`;
    pop._rows = rows;
    const inp = $('.combo-q', pop); inp.focus(); inp.setSelectionRange(q.length, q.length);
  };
  const pick = async (r) => {
    if (!r) return;
    if (r.create) {
      const name = q.trim();
      if (kind === 'wt') { const w = db.insert('tempo_work_types', { name, color: presetAt(workTypes(true).length), order: workTypes(true).length, archived: false }, true); close(); onPick(w.id); toast(`Tipo “${esc(name)}” criado`); return; }
      if (kind === 'client') { close(); openPartyForm('client', null, (c) => onPick(c.id), { name }); return; }
      const s = db.insert('tempo_status_options', { kind, name, color: presetAt(statuses(kind).length + 3), category: { work: 'active', payment: 'open', quote: 'open' }[kind], order: statuses(kind).length }, true);
      close(); onPick(s.id); toast(`Opção “${esc(name)}” criada. Ajuste a cor em Preferências › Status.`); return;
    }
    close(); if (r.id !== value) onPick(r.id);
  };
  const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); };
  const outside = (e) => { if (!pop.contains(e.target)) close(); };
  pop.addEventListener('input', (e) => { if (e.target.classList.contains('combo-q')) { q = e.target.value; hi = 0; draw(); } });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { hi = Math.min(hi + 1, pop._rows.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(hi - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(pop._rows[hi]); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); e.stopPropagation(); }
  });
  pop.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('.combo-opt'); if (b) pick(pop._rows[Number(b.dataset.i)]); });
  document.body.appendChild(pop);
  draw();
  const r = anchor.getBoundingClientRect(); const h = pop.offsetHeight;
  const top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
  pop.style.top = (top + window.scrollY) + 'px'; pop.style.left = Math.max(8, Math.min(window.innerWidth - 290, r.left + window.scrollX)) + 'px';
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
}

/* Botão que abre o dropdown. target = o que fazer ao escolher. */
function comboBtn(kind, value, target, id, opts = {}) {
  const it = comboItems(kind).find(x => x.id === value);
  return `<button type="button" class="combo-btn ${opts.cls || ''}" data-act="combo" data-kind="${kind}" data-target="${target}" data-id="${id}" data-value="${value || ''}" aria-haspopup="listbox">${it ? it.html : '<span class="faint">—</span>'}<span class="chev">${icon('chevD')}</span></button>`;
}
const COMBO_TARGETS = {
  'proj-status': (id, v) => { setProjectStatus(db.get('tempo_projects', id), v); },
  'proj-pay': (id, v) => { setPaymentStatus(db.get('tempo_projects', id), v); },
  'proj-client': (id, v) => { const p = db.get('tempo_projects', id); const from = clientOf(p)?.name; db.update('tempo_projects', id, { client_id: v }, true); logEvent('project', id, 'client', `Cliente: ${from || '—'} → ${db.get('tempo_clients', v)?.name}`); db.emit(); },
  'task-status': (id, v) => { setTaskStatus(db.get('tempo_tasks', id), v); },
  'task-wt': (id, v) => { db.update('tempo_tasks', id, { work_type_id: v || null }); },
  'quote-status': (id, v) => { db.update('tempo_quotes', id, { status_id: v }); },
  'rb-pay': (id, v) => { db.update('tempo_reimb_rows', id, { pay_id: v }); },
  'rb-refund': (id, v) => { db.update('tempo_reimb_rows', id, { refund_id: v }); },
  'rb-req': (id, v) => { db.update('tempo_reimb_rows', id, { req_id: v }); }
};
ACTIONS.combo = (el, e) => {
  e?.stopPropagation?.();
  openCombo(el, { kind: el.dataset.kind, value: el.dataset.value, allowEmpty: el.dataset.target === 'task-wt', onPick: (v) => { COMBO_TARGETS[el.dataset.target](el.dataset.id, v); } });
};
