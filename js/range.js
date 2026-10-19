/* Intervalo selecionado na faixa de atividade: arraste o mouse sobre a barra e mova esse trecho para outro projeto/tarefa.
   Os blocos (programa, arquivo ou pausa) nunca são cortados: a seleção cresce até cobrir todos os blocos que toca. */

/* Expande [a,b] até englobar, inteiros, todos os registros de atividade e pausas que tocam o intervalo. */
function expandRange(entryId, a, b) {
  const e = db.get('tempo_time_entries', entryId); if (!e) return [a, b];
  const recs = actList(entryId).map(r => [new Date(r.from).getTime(), new Date(r.to).getTime()]);
  const gaps = entryGaps(e).map(g => [new Date(g.s).getTime(), new Date(g.e).getTime()]);
  let changed = true;
  while (changed) {
    changed = false;
    [...recs, ...gaps].forEach(([x, y]) => {
      if (y > a && x < b) { if (x < a) { a = x; changed = true; } if (y > b) { b = y; changed = true; } }
    });
  }
  return [a, b];
}

/* Move o intervalo [a,b] (já expandido) da sessão para uma nova sessão no projeto/tarefa escolhido. */
function actMoveRange(entryId, a, b, pick) {
  const e = db.get('tempo_time_entries', entryId); if (!e) return false;
  const p = db.get('tempo_projects', pick.project_id); if (!p) return false;
  const c = clientOf(p);
  const list = actList(entryId);
  const inRange = list.filter(r => new Date(r.to) > new Date(a) && new Date(r.from) < new Date(b));
  const keep = list.filter(r => !inRange.includes(r));
  const rest = actSubtract(e.segments || [], [{ a, b }]);
  const label = tkProjectLabel(p);
  const intervalo = `${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())}`;
  const nova = db.insert('tempo_time_entries', {
    project_id: p.id, client_id: c?.id || null, agency_id: c?.agency_id || null, task_id: pick.task_id || null,
    work_type_id: lastWorkType(p.id), revision_id: null, notes: `Movido de outra sessão (${intervalo})`,
    state: 'done', segments: [{ s: new Date(a).toISOString(), e: new Date(b).toISOString() }],
    edits: [{ at: nowISO(), reason: `Intervalo ${intervalo} movido para ${label}`, before: e.segments }],
  });
  db.setSetting('act:' + nova.id, inRange);
  db.setSetting('act:' + entryId, keep);
  if (!rest.length && e.state !== 'running') db.remove('tempo_time_entries', e.id);
  else db.update('tempo_time_entries', e.id, { segments: rest.length ? rest : [{ s: nowISO(), e: null }], edits: [...(e.edits || []), { at: nowISO(), reason: `Intervalo ${intervalo} movido para ${label}`, before: e.segments }] }, true);
  db.emit();
  return true;
}

/* Janela do intervalo selecionado: mostra o que ele contém e deixa escolher o destino. */
function openRangeModal(entryId, a0, b0) {
  const [a, b] = expandRange(entryId, a0, b0);
  const e = db.get('tempo_time_entries', entryId); if (!e) return;
  const recs = actList(entryId).filter(r => new Date(r.to) > new Date(a) && new Date(r.from) < new Date(b));
  const pausas = entryGaps(e).filter(g => new Date(g.e) > new Date(a) && new Date(g.s) < new Date(b));
  const workMs = recs.reduce((s, r) => s + (new Date(r.to) - new Date(r.from)), 0);
  openLayer({
    render: () => `<div class="dh"><h2>Mover intervalo</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:10px">
        <div class="row between"><span class="mono">${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())}</span><span class="mono small">${fmtDur(b - a)}</span></div>
        <div class="stack" style="gap:4px">
          ${recs.map(r => `<div class="row between small"><span>${esc(r.app)}${r.doc ? ' · ' + esc(r.doc) : ''}</span><span class="mono">${fmtDur(new Date(r.to) - new Date(r.from))}</span></div>`).join('')}
          ${pausas.map(g => `<div class="row between small"><span>Pausa · ${esc(pauseWhy(g.why))}</span><span class="mono">${fmtDur(new Date(g.e) - new Date(g.s))}</span></div>`).join('')}
          ${!recs.length && !pausas.length ? '<span class="muted small">Trecho sem registros.</span>' : ''}
        </div>
        <div class="field"><label for="rg-proj">Mover para o projeto</label><select id="rg-proj" class="input"><option value="">Escolha um projeto</option>${tkProjectsSorted().map(p => `<option value="${esc(p.id)}">${esc(tkProjectLabel(p))}</option>`).join('')}</select></div>
        <div class="field"><label for="rg-task">Tarefa (opcional)</label><select id="rg-task" class="input" disabled><option value="">Sem tarefa</option></select></div>
        <div class="row"><button class="btn" data-x="rg-move">Mover</button><span class="small muted">Os blocos inteiros saem desta sessão e viram uma sessão nova no projeto escolhido.</span></div>
      </div>
      <div class="df"><button class="btn" data-act="close-layer">Fechar</button></div>`,
    onMount: (ly) => {
      const proj = ly.box.querySelector('#rg-proj'), task = ly.box.querySelector('#rg-task');
      proj.addEventListener('change', () => {
        const tasks = proj.value ? db.where('tempo_tasks', t => t.project_id === proj.value) : [];
        task.innerHTML = `<option value="">Sem tarefa</option>${tasks.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}`;
        task.disabled = !proj.value;
      });
      ly.box.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-x="rg-move"]'); if (!btn) return;
        if (!proj.value) return toast('Escolha um projeto.');
        const label = tkProjectLabel(db.get('tempo_projects', proj.value));
        if (!await confirmBox({ title: 'Mover intervalo?', body: `${fmtDur(b - a)} sai desta sessão e vai para ${label}.`, ok: 'Mover' })) return;
        if (!actMoveRange(entryId, a, b, { project_id: proj.value, task_id: task.value || null })) return toast('Nada para mover.');
        toast('Intervalo movido');
        ly.close();
        window.actRedrawHook && window.actRedrawHook();
      });
    },
  });
}

/* Arrastar sobre a faixa de atividade cria a seleção; soltar o mouse abre a janela de mover. */
let actDrag = null;
const actStripX = (strip, ev) => { const r = strip.getBoundingClientRect(); return Math.min(1, Math.max(0, (ev.clientX - r.left) / (r.width || 1))); };
document.addEventListener('mousedown', (ev) => {
  const strip = ev.target.closest?.('.act-strip[data-ent]'); if (!strip || ev.button !== 0) return;
  const x = actStripX(strip, ev);
  actDrag = { strip, x0: x, x1: x, moved: false };
  ev.preventDefault();
});
document.addEventListener('mousemove', (ev) => {
  if (!actDrag) return;
  actDrag.x1 = actStripX(actDrag.strip, ev);
  if (Math.abs(actDrag.x1 - actDrag.x0) > 0.003) actDrag.moved = true;
  let sel = actDrag.strip.querySelector('.act-sel');
  if (!sel) {
    sel = document.createElement('div'); sel.className = 'act-sel';
    sel.style.cssText = 'position:absolute;top:-3px;bottom:-3px;background:rgba(37,99,235,.18);border:1px solid #2563EB;border-radius:3px;pointer-events:none;z-index:3';
    actDrag.strip.appendChild(sel);
  }
  const lo = Math.min(actDrag.x0, actDrag.x1), hi = Math.max(actDrag.x0, actDrag.x1);
  sel.style.left = (lo * 100) + '%'; sel.style.width = ((hi - lo) * 100) + '%';
});
document.addEventListener('mouseup', () => {
  if (!actDrag) return;
  const d = actDrag; actDrag = null;
  const sel = d.strip.querySelector('.act-sel'); if (sel) sel.remove();
  if (!d.moved) return;
  const lo = Math.min(d.x0, d.x1), hi = Math.max(d.x0, d.x1);
  const t0 = Number(d.strip.dataset.t0), span = Number(d.strip.dataset.span);
  const a = t0 + lo * span, b = t0 + hi * span;
  if (b - a < 60000) return;   // seleção menor que 1 minuto não vale
  openRangeModal(d.strip.dataset.ent, a, b);
});
