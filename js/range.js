/* Intervalo selecionado na faixa de atividade: arraste o mouse sobre a barra e mova esse trecho para outro projeto/tarefa.
   Os blocos (programa, arquivo ou pausa) nunca são cortados: a seleção cresce até cobrir todos os blocos que toca. */

/* Expande [a,b] até englobar, inteiros, todos os registros de atividade e pausas que tocam o intervalo. */
function expandRange(entryId, a, b) {
  const e = db.get('tempo_time_entries', entryId); if (!e) return [a, b];
  const recs = actList(entryId).map(r => [new Date(r.from).getTime(), new Date(r.to).getTime()]);
  const gaps = pauseGapsOf([e]).map(g => [new Date(g.s).getTime(), new Date(g.e).getTime()]);
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
  const movedSegs = [{ s: new Date(a).toISOString(), e: new Date(b).toISOString() }];
  // a origem perde o intervalo antes (o banco não aceita o mesmo horário em duas sessões)
  if (!rest.length && e.state !== 'running') db.remove('tempo_time_entries', e.id, true);
  else db.update('tempo_time_entries', e.id, { segments: rest.length ? rest : [{ s: nowISO(), e: null }], edits: [...(e.edits || []), { at: nowISO(), reason: `Intervalo ${intervalo} movido para ${label}`, before: e.segments }] }, true);
  // trava: se o intervalo já está lançado nesse projeto, não cria duplicata
  if (!segsCoveredIn(movedSegs, p.id, e.id)) {
    const nova = db.insert('tempo_time_entries', {
      project_id: p.id, client_id: c?.id || null, agency_id: c?.agency_id || null, task_id: pick.task_id || null,
      work_type_id: pick.work_type_id || lastWorkType(p.id), revision_id: null, notes: `Movido de outra sessão (${intervalo})`,
      state: 'done', segments: movedSegs,
      edits: [{ at: nowISO(), reason: `Intervalo ${intervalo} movido para ${label}`, before: e.segments }],
    });
  }
  db.emit();
  return true;
}

/* Janela do intervalo selecionado: mostra o que ele contém e deixa escolher o destino. */
function openRangeModal(entryId, a0, b0) {
  const [a, b] = expandRange(entryId, a0, b0);
  const e = db.get('tempo_time_entries', entryId); if (!e) return;
  const recs = actList(entryId).filter(r => new Date(r.to) > new Date(a) && new Date(r.from) < new Date(b));
  const pausas = pauseGapsOf([e]).filter(g => new Date(g.e) > new Date(a) && new Date(g.s) < new Date(b));
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

/* Apaga o intervalo [a,b] da sessão: some com os registros e com o tempo de trabalho desse trecho. */
function actDeleteRange(entryId, a, b) {
  const e = db.get('tempo_time_entries', entryId); if (!e) return false;
  const list = actList(entryId);
  const inRange = list.filter(r => new Date(r.to) > new Date(a) && new Date(r.from) < new Date(b));
  const rest = actSubtract(e.segments || [], [{ a, b }]);
  if (!inRange.length && JSON.stringify(rest) === JSON.stringify(e.segments || [])) return false;
  const intervalo = `${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())}`;
  inRange.forEach(r => logTomb(r.rid, r));   // apagar na sessão também apaga no log (o último a mexer vale)
  logReconcile();
  if (!rest.length && e.state !== 'running') db.remove('tempo_time_entries', e.id);
  else db.update('tempo_time_entries', e.id, { segments: rest.length ? rest : [{ s: nowISO(), e: null }], edits: [...(e.edits || []), { at: nowISO(), reason: `Intervalo ${intervalo} excluído`, before: e.segments }] }, true);
  db.emit();
  return true;
}

/* Zoom: mostra só este trecho, com a barra dele, as legendas e o que aconteceu nele. */
function openRangeZoom(entryId, a, b) {
  const e = db.get('tempo_time_entries', entryId); if (e) openZoomOf([e], a, b);
}

/* Zoom sobre uma ou mais sessões (o relatório do dia junta todas as sessões do dia). */
function openZoomOf(ents, a, b) {
  const recs = ents.flatMap(e => actList(e.id)).filter(r => new Date(r.to) > new Date(a) && new Date(r.from) < new Date(b))
    .map(r => ({ ...r, from: new Date(Math.max(new Date(r.from).getTime(), a)).toISOString(), to: new Date(Math.min(new Date(r.to).getTime(), b)).toISOString() }));
  const A = actAnalyzeList(recs, "both");
  const span = b - a;
  const pct = (t) => (t - a) / span * 100;
  const hhmm = (t) => fmtTime(new Date(t).toISOString());
  const gaps = pauseGapsOf(ents).filter(g => new Date(g.e) > new Date(a) && new Date(g.s) < new Date(b))
    .map(g => ({ ...g, s: Math.max(new Date(g.s).getTime(), a), e: Math.min(new Date(g.e).getTime(), b) }));
  let pauses = '';
  gaps.forEach(g => {
    const x = pct(g.s), y = pct(g.e);
    pauses += `<span class="seg-b pausa act-pause" style="--ph:${pauseHatch(g.why)};--pg:${pauseGapOf(pauseHatch(g.why))};left:${x}%;width:${Math.max(.3, y - x)}%" data-tip="${esc(`Pausa ${hhmm(g.s)}–${hhmm(g.e)} · ${fmtDur(g.e - g.s)}\n${pauseWhy(g.why)}`)}"></span>`;
  });
  /* Barra de projetos: o tempo de cada sessão no intervalo (inclusive trabalho sem registro de programa), na cor do cliente. */
  const projCol = (p) => { const c = clientOf(p); return hexOf((c && c.color) || (agOfProject(p)?.color) || 'gray'); };
  let projBar = '', projLegend = ''; const projSeen = new Map();
  ents.forEach(e => {
    const p = e.project_id && db.get('tempo_projects', e.project_id); if (!p) return;
    entryBruIntervals(e).forEach(([s0, e0]) => {
      const s1 = Math.max(s0, a), e1 = Math.min(e0, b); if (e1 <= s1) return;
      const cur = projSeen.get(p.id) || { p, ms: 0, ivs: [] };
      cur.ms += e1 - s1; cur.ivs.push([s1, e1]); projSeen.set(p.id, cur);
    });
  });
  [...projSeen.values()].forEach(pr => {
    const col = projCol(pr.p), lbl = tkProjectLabel(pr.p);
    pr.ivs.forEach(([s1, e1]) => {
      const x = pct(s1), y = pct(e1); if (y <= x) return;
      projBar += `<span class="seg-b fill act-b" style="--tb:${col};left:${x}%;width:${Math.max(.3, y - x)}%" data-tip="${esc(`${lbl} · ${fmtDur(pr.ms)}`)}"></span>`;
    });
    projLegend += `<span class="act-chip" style="--tb:${col}" title="${esc(lbl)}"><i></i>${esc(pr.p.name)} · ${fmtDur(pr.ms)}</span>`;
  });
  let bars = '';
  A.records.forEach(r => {
    const g = A.groups.find(x => x.id === r.gid); if (!g) return;
    const x = pct(new Date(r.from).getTime()), y = pct(new Date(r.to).getTime());
    if (y <= x) return;
    bars += `<span class="seg-b fill act-b" data-g="${esc(g.id)}" style="--tb:${g.color};left:${x}%;width:${Math.max(.3, y - x)}%" data-tip="${esc(actTip(g))}"></span>`;
  });
  const rows = [
    ...A.records.map(r => `<div class="row between small"><span>${esc(r.app)}${r.doc ? ' · ' + esc(r.doc) : ''}</span><span class="mono">${fmtDur(new Date(r.to) - new Date(r.from))}</span></div>`),
    ...gaps.map(g => `<div class="row between small"><span>Pausa · ${esc(pauseWhy(g.why))}</span><span class="mono">${fmtDur(g.e - g.s)}</span></div>`),
  ];
  openLayer({
    render: () => `<div class="dh"><h2>Zoom · ${hhmm(a)}–${hhmm(b)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="act-sec" style="width:100%"><div class="act-strip" style="position:relative;height:26px;width:100%;border-radius:0;margin-top:0">${projBar}</div>${projLegend ? `<div class="row small" style="gap:8px;flex-wrap:wrap;margin:6px 0 10px">${projLegend}</div>` : ''}</div>
      <div class="act-sec" style="width:100%"><div class="act-strip" style="position:relative;height:44px;width:100%;border-radius:0;margin-top:0">${pauses}${bars}</div></div>
      <div class="db stack" style="gap:12px">
        <div class="day-axis"><span>${hhmm(a)}</span><span>${fmtDur(span)}</span><span>${hhmm(b)}</span></div>
        <div class="act-sec">${actChipsHTML(A, "both")}</div>
        <div class="stack" style="gap:4px">${rows.length ? rows.join('') : '<span class="muted small">Trecho sem registros.</span>'}</div>
      </div>
      <div class="df"><button class="btn" data-act="close-layer">Fechar</button></div>`,
  });
}

/* Alterar: o trecho vira uma sessão nova no mesmo projeto e tarefa, com outro tipo de atividade. */
function openRangeType(entryId, a, b) {
  const e = db.get('tempo_time_entries', entryId); if (!e) return;
  if (!e.project_id) return toast('Esta sessão não tem projeto.');
  const types = workTypes(false);
  const range = `${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())}`;
  openLayer({
    render: () => `<div class="dh"><h2>Alterar tipo de atividade</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:10px">
        <div class="row between"><span class="mono">${range}</span><span class="mono small">${fmtDur(b - a)}</span></div>
        <div class="field"><label for="rg-type">Novo tipo</label><select id="rg-type" class="input">${types.map(w => `<option value="${esc(w.id)}" ${w.id === e.work_type_id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
        <div class="row"><button class="btn" data-x="rg-type-ok">Alterar</button><span class="small muted">O trecho sai desta sessão e vira uma sessão nova no mesmo projeto e tarefa, com o tipo escolhido.</span></div>
      </div>
      <div class="df"><button class="btn" data-act="close-layer">Fechar</button></div>`,
    onMount: (ly) => ly.box.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-x="rg-type-ok"]'); if (!btn) return;
      const wt = ly.box.querySelector('#rg-type').value; if (!wt) return;
      if (!actMoveRange(entryId, a, b, { project_id: e.project_id, task_id: e.task_id || null, work_type_id: wt })) return toast('Nada para alterar.');
      toast('Tipo alterado');
      ly.close();
      window.actRedrawHook && window.actRedrawHook();
    }),
  });
}

/* Excluir: pede confirmação duas vezes. */
async function openRangeDelete(entryId, a, b) {
  const range = `${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())}`;
  if (!await confirmBox({ title: 'Excluir este intervalo?', body: `${range} (${fmtDur(b - a)}) sai desta sessão e não volta.`, ok: 'Continuar', danger: true })) return;
  if (!await confirmBox({ title: 'Tem certeza mesmo?', body: 'Os registros deste trecho serão apagados. Essa ação não tem volta.', ok: 'Excluir', danger: true })) return;
  if (!actDeleteRange(entryId, a, b)) return toast('Nada para excluir.');
  toast('Intervalo excluído');
  window.actRedrawHook && window.actRedrawHook();
}

/* Menu que abre ao soltar a seleção: Zoom, Transferir, Alterar tipo ou Excluir. */
function openRangeMenu(entryId, a, b, x, y) {
  document.getElementById('rg-menu')?.remove();
  const m = document.createElement('div');
  m.id = 'rg-menu';
  m.style.cssText = `position:fixed;left:${Math.max(8, Math.min(x, innerWidth - 240))}px;top:${Math.max(8, Math.min(y + 8, innerHeight - 220))}px;z-index:10000;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:6px;min-width:220px;display:flex;flex-direction:column;gap:2px`;
  const items = [['zoom', 'Zoom'], ['move', 'Transferir para outra tarefa'], ['type', 'Alterar tipo de atividade'], ['del', 'Excluir']];
  m.innerHTML = `<div class="small muted" style="padding:4px 10px 6px">${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())} · ${fmtDur(b - a)}</div>`
    + items.map(([k, l]) => `<button type="button" class="btn ghost" data-rg="${k}" style="justify-content:flex-start;width:100%;${k === 'del' ? 'color:#B91C1C' : ''}">${l}</button>`).join('');
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('mousedown', outside, true); };
  const outside = (ev) => { if (!m.contains(ev.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  m.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-rg]'); if (!btn) return;
    close();
    const k = btn.dataset.rg;
    if (k === 'zoom') openRangeZoom(entryId, a, b);
    else if (k === 'move') openRangeModal(entryId, a, b);
    else if (k === 'type') openRangeType(entryId, a, b);
    else if (k === 'del') openRangeDelete(entryId, a, b);
  });
}

/* Arrastar sobre a faixa de atividade cria a seleção; soltar o mouse abre o menu de ações. */
let actDrag = null;
const actStripX = (strip, ev) => { const r = strip.getBoundingClientRect(); return Math.min(1, Math.max(0, (ev.clientX - r.left) / (r.width || 1))); };
document.addEventListener('mousedown', (ev) => {
  const strip = ev.target.closest?.('.act-strip[data-ent], .day-strip[data-report], .res-strip[data-slices]'); if (!strip || ev.button !== 0) return;
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
document.addEventListener('mouseup', (ev) => {
  if (!actDrag) return;
  const d = actDrag; actDrag = null;
  const sel = d.strip.querySelector('.act-sel'); if (sel) sel.remove();
  if (!d.moved) return;
  const lo = Math.min(d.x0, d.x1), hi = Math.max(d.x0, d.x1);
  const t0 = Number(d.strip.dataset.t0), span = Number(d.strip.dataset.span);
  const a = t0 + lo * span, b = t0 + hi * span;
  if (b - a < 60000) return;   // seleção menor que 1 minuto não vale
  if (d.strip.dataset.slices) {   // resumo cronológico: a seleção fica dentro de uma sessão (fatia)
    const sl = JSON.parse(d.strip.dataset.slices);
    const lp = lo * 100, hp = hi * 100;
    const f = sl.find(x => lp >= x.l && lp < x.l + x.w); if (!f) return;
    const hp2 = Math.min(hp, f.l + f.w);
    const sa = f.st + (lp - f.l) / f.w * f.span, sb = f.st + (hp2 - f.l) / f.w * f.span;
    if (sb - sa < 60000) return;
    const se = db.get('tempo_time_entries', f.e); if (se) openZoomOf([se], sa, sb);
    return;
  }
  if (d.strip.dataset.report) {   // relatório do dia: arrastar faz zoom direto
    const ents = (d.strip.dataset.ents || '').split(',').map(id => db.get('tempo_time_entries', id)).filter(Boolean);
    return openZoomOf(ents, a, b);
  }
  const entryId = d.strip.dataset.ent;
  const [ea, eb] = expandRange(entryId, a, b);   // blocos inteiros, nunca cortados
  openRangeMenu(entryId, ea, eb, ev.clientX, ev.clientY);
});
