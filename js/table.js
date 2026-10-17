/* =====================================================================
   TABELA GENÉRICA (estilo Notion)
   - arrastar o cabeçalho para reordenar colunas
   - arrastar a divisória vertical para mudar a largura
   - clicar na célula para editar (texto, data, valor, dropdown)
   - ordem, largura, colunas ocultas e ordenação ficam salvas por tabela
   ===================================================================== */
const TABLE_DEFS = {};
function tableState(id, cols, defHidden = [], defSort = null) {
  if (!S.tables) S.tables = clone(db.setting('tables', {}) || {});
  const keys = Object.keys(cols);
  let t = S.tables[id];
  if (!t) t = S.tables[id] = { order: [...keys], hidden: [...defHidden], widths: {}, sort: defSort };
  keys.forEach(k => { if (!t.order.includes(k)) { t.order.push(k); if (defHidden.includes(k)) t.hidden.push(k); } });
  t.order = t.order.filter(k => keys.includes(k));
  return t;
}
const saveTables = () => db.setSetting('tables', clone(S.tables));

/* ---------- valores em R$ ---------- */
function moneyVal(el) { const d = (el.value || '').replace(/\D/g, ''); return d ? Number(d) / 100 : null; }
const valOf = (el) => el.dataset.money !== undefined ? moneyVal(el) : el.value;
const moneyAttrs = (v) => `type="text" inputmode="numeric" autocomplete="off" data-money value="${v !== null && v !== undefined && v !== '' ? esc(fmtMoney(v)) : ''}"`;
document.addEventListener('input', (e) => {
  const el = e.target; if (!el.matches?.('[data-money]')) return;
  const d = el.value.replace(/\D/g, '').replace(/^0+/, '');
  el.value = d ? brl.format(Number(d) / 100) : '';
  try { el.setSelectionRange(el.value.length, el.value.length); } catch (err) {}
});

function gridTable({ id, cols, rows, rowAttrs = () => '', defHidden = [], defSort = null, sortable = true, footer = true, rowById, cls = '' }) {
  const t = tableState(id, cols, defHidden, defSort);
  TABLE_DEFS[id] = { cols, rowById: rowById || ((rid) => rows.find(r => r.id === rid)) };
  const vis = t.order.filter(k => !t.hidden.includes(k));
  let list = rows;
  if (sortable && t.sort && cols[t.sort.key]?.sort) { const g = cols[t.sort.key].sort; list = [...rows].sort((a, b) => { const x = g(a), y = g(b); return (x > y ? 1 : x < y ? -1 : 0) * t.sort.dir; }); }
  const W = (k) => t.widths[k] || cols[k].w || 140;
  const total = vis.reduce((s, k) => s + W(k), 0);
  const head = vis.map(k => { const c = cols[k]; const s = t.sort?.key === k;
    return `<th draggable="true" data-col="${k}" data-table="${id}" class="${sortable && c.sort ? 'sortable' : ''} ${c.money ? 'money' : ''}" ${sortable && c.sort ? `data-act="tsort"` : ''} aria-sort="${s ? (t.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><span class="th-in">${c.ico ? `<span class="ico">${icon(c.ico)}</span>` : ''}<span class="th-l">${c.label}</span>${s ? (t.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</span><span class="rz" data-rz="${k}" aria-hidden="true"></span></th>`; }).join('');
  const body = list.map(r => `<tr ${rowAttrs(r)}>${vis.map(k => { const c = cols[k]; const ed = c.edit && (!c.edit.when || c.edit.when(r));
    return `<td class="${c.cls ? (typeof c.cls === 'function' ? c.cls(r) : c.cls) : ''} ${c.money ? 'money' : ''} ${ed ? 'editable' : ''}" ${ed ? `data-act="cell" data-table="${id}" data-col="${k}" data-id="${r.id}"` : ''}>${c.cell(r)}</td>`; }).join('')}</tr>`).join('');
  const foot = footer ? `<tfoot><tr>${vis.map((k, i) => { const c = cols[k]; if (c.val) { const s = list.reduce((a, r) => a + (c.val(r) || 0), 0); return `<td class="money">${i === 0 ? `Contagem <b>${list.length}</b> · ` : ''}Soma <b>${c.fmt ? c.fmt(s) : fmtMoney0(s)}</b></td>`; } return i === 0 ? `<td>Contagem <b>${list.length}</b></td>` : '<td></td>'; }).join('')}</tr></tfoot>` : '';
  return `<div class="table-wrap"><table class="grid fixed ${cls}" data-table="${id}" style="width:${total}px"><colgroup>${vis.map(k => `<col data-col="${k}" style="width:${W(k)}px">`).join('')}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}

let justResized = 0;
ACTIONS.tsort = (el) => {
  if (Date.now() - justResized < 300) return;
  const t = S.tables[el.dataset.table]; const k = el.dataset.col;
  t.sort = t.sort?.key === k ? (t.sort.dir > 0 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 };
  saveTables();
};

/* ---------- reordenar arrastando o cabeçalho ---------- */
let dragCol = null;
document.addEventListener('dragstart', (e) => {
  const th = e.target.closest?.('th[data-col]'); if (!th) return;
  dragCol = { table: th.dataset.table, col: th.dataset.col };
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'col:' + th.dataset.col); th.classList.add('dragging');
});
document.addEventListener('dragover', (e) => {
  if (!dragCol) return; const th = e.target.closest?.('th[data-col]'); if (!th || th.dataset.table !== dragCol.table) return;
  e.preventDefault(); const r = th.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2;
  $$('th.drop-l,th.drop-r').forEach(x => x.classList.remove('drop-l', 'drop-r')); th.classList.add(after ? 'drop-r' : 'drop-l');
});
document.addEventListener('drop', (e) => {
  if (!dragCol) return; const th = e.target.closest?.('th[data-col]');
  if (th && th.dataset.table === dragCol.table && th.dataset.col !== dragCol.col) {
    e.preventDefault(); const t = S.tables[dragCol.table]; const after = th.classList.contains('drop-r');
    t.order = t.order.filter(k => k !== dragCol.col); let i = t.order.indexOf(th.dataset.col); if (after) i++; t.order.splice(i, 0, dragCol.col);
    dragCol = null; saveTables();
  }
});
document.addEventListener('dragend', () => { dragCol = null; $$('th.drop-l,th.drop-r,th.dragging').forEach(x => x.classList.remove('drop-l', 'drop-r', 'dragging')); });

/* ---------- largura arrastando a divisória ---------- */
document.addEventListener('pointerdown', (e) => {
  const rz = e.target.closest?.('.rz'); if (!rz) return;
  e.preventDefault(); e.stopPropagation();
  const th = rz.closest('th'); const table = th.closest('table'); const id = table.dataset.table; const k = rz.dataset.rz;
  const col = table.querySelector(`col[data-col="${k}"]`); const startX = e.clientX; const startW = col.getBoundingClientRect().width || parseFloat(col.style.width); const startT = table.getBoundingClientRect().width;
  th.draggable = false; rz.classList.add('on'); document.body.classList.add('resizing');
  const move = (ev) => { const w = Math.max(60, Math.round(startW + ev.clientX - startX)); col.style.width = w + 'px'; table.style.width = (startT - startW + w) + 'px'; };
  const up = (ev) => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    th.draggable = true; rz.classList.remove('on'); document.body.classList.remove('resizing'); justResized = Date.now();
    S.tables[id].widths[k] = Math.max(60, Math.round(startW + ev.clientX - startX)); saveTables();
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
});
document.addEventListener('dblclick', (e) => { const rz = e.target.closest?.('.rz'); if (!rz) return; const id = rz.closest('table').dataset.table; delete S.tables[id].widths[rz.dataset.rz]; saveTables(); });

/* ---------- edição na célula ---------- */
ACTIONS.cell = (td, e) => {
  if (td.querySelector('.cell-input')) return;
  const def = TABLE_DEFS[td.dataset.table]; const col = def.cols[td.dataset.col]; const row = def.rowById(td.dataset.id); const ed = col.edit;
  if (!row || !ed) return;
  if (ed.type === 'combo') return openCombo(td, { kind: typeof ed.kind === 'function' ? ed.kind(row) : ed.kind, value: ed.get(row), allowEmpty: ed.allowEmpty, onPick: (v) => ed.set(row, v) });
  const cur = ed.get(row);
  const w = td.getBoundingClientRect().width;
  const attrs = ed.type === 'money' ? moneyAttrs(cur) : ed.type === 'date' ? `type="date" value="${cur || ''}"` : ed.type === 'number' ? `type="number" step="0.5" value="${cur ?? ''}"` : `type="text" value="${esc(cur || '')}"`;
  td.innerHTML = `<input class="cell-input ${ed.type === 'money' || ed.type === 'number' ? 'right mono' : ''}" ${attrs} style="min-width:${Math.max(80, w - 12)}px" aria-label="${esc(col.label)}">`;
  const inp = td.querySelector('input'); inp.focus();
  if (ed.type === 'date') { try { inp.showPicker?.(); } catch (err) {} } else inp.select?.();
  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    const v = ed.type === 'money' ? moneyVal(inp) : ed.type === 'number' ? numIn(inp.value) : ed.type === 'date' ? (inp.value || null) : inp.value.trim();
    if (ed.type === 'text' && ed.required && !v) { render(); return; }
    if (String(v ?? '') === String(cur ?? '')) { render(); return; }
    await ed.set(row, v); render();
  };
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } if (ev.key === 'Escape') { done = true; ev.stopPropagation(); render(); } });
  inp.addEventListener('blur', () => setTimeout(commit, ed.type === 'date' ? 150 : 0));
  if (ed.type === 'date') inp.addEventListener('change', () => { if (inp.value) commit(); });
};

/* ---------- menu de colunas (mostrar/ocultar) ---------- */
ACTIONS.tcols = (el) => {
  const ex = $('.colmenu.tc'); if (ex) { ex.remove(); return; }
  const id = el.dataset.table; const def = TABLE_DEFS[id]; if (!def) return;
  const m = document.createElement('div'); m.className = 'colmenu tc';
  const draw = () => { const t = S.tables[id]; m.innerHTML = `<div class="lbl" style="padding:4px 6px">Colunas visíveis</div>${t.order.map(k => `<label class="ci check"><input type="checkbox" data-c="${k}" ${!t.hidden.includes(k) ? 'checked' : ''}> <span class="grow">${def.cols[k].label}</span></label>`).join('')}<div class="small muted" style="padding:6px">Arraste o cabeçalho para reordenar e a divisória para mudar a largura (duplo clique volta ao padrão).</div><button class="btn sm ghost" data-reset>Restaurar padrão</button>`; };
  draw();
  m.addEventListener('click', (e) => {
    e.stopPropagation(); const t = S.tables[id];
    const cb = e.target.closest('[data-c]'); if (cb) { t.hidden = t.hidden.filter(x => x !== cb.dataset.c); if (!cb.checked) t.hidden.push(cb.dataset.c); saveTables(); place(); draw(); return; }
    if (e.target.closest('[data-reset]')) { delete S.tables[id]; saveTables(); m.remove(); }
  });
  const place = () => { document.body.appendChild(m); const r = el.getBoundingClientRect(); m.style.top = (r.bottom + window.scrollY + 6) + 'px'; m.style.left = Math.max(8, Math.min(window.innerWidth - 260, r.right + window.scrollX - 250)) + 'px'; };
  place();
  setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
};
const colsBtn = (id) => `<button class="btn sm" data-act="tcols" data-table="${id}">${icon('cols')} Colunas</button>`;
