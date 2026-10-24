/* =====================================================================
   TIME SHEET: lista corrida por projeto e Resumo de cada caixa.
   - Corrido: projetos do mais recente para o mais antigo; tarefas, subtarefas e sessões recolhidas.
     Mostra 10 por vez (editável), com "Mostrar mais" / "Mostrar menos". Agrupa por dia, mês ou ano e filtra por categoria.
   - Resumo: janela com o gráfico de todas as sessões da caixa, em ordem cronológica ou aglomerado.
   (O To-do já existe na lateral; os avisos podem ir para ele com "Mandar para o to-do".)
   ===================================================================== */

/* ---------- Corrido ---------- */
const corridoOn = () => db.setting('tsView', 'corrido') === 'corrido';
ACTIONS['ts-view'] = (el) => { db.setSetting('tsView', el.dataset.v); render(); };
ACTIONS['ts-cor-more'] = () => { const size = Number(db.setting('tsCorSize', 10)) || 10; db.setSetting('tsCorN', (Number(db.setting('tsCorN', size)) || size) + size); render(); };
ACTIONS['ts-cor-less'] = () => { const size = Number(db.setting('tsCorSize', 10)) || 10; db.setSetting('tsCorN', Math.max(size, (Number(db.setting('tsCorN', size)) || size) - size)); render(); };
CHANGES['ts-cor-size'] = (el) => { db.setSetting('tsCorSize', Number(el.value) || 10); db.setSetting('tsCorN', Number(el.value) || 10); render(); };
CHANGES['ts-cor-by'] = (el) => { db.setSetting('tsCorBy', el.value); render(); };
CHANGES['ts-cor-cat'] = (el) => { db.setSetting('tsCorCat', el.value); db.setSetting('tsCorN', Number(db.setting('tsCorSize', 10)) || 10); render(); };

/* Projetos abertos no Recentes: a tela é redesenhada ao trocar Cronológico/Aglomerado, então lembramos quais estão abertos. */
const COR_OPEN = new Set();
document.addEventListener('toggle', (e) => {
  const d = e.target; if (!d || !d.classList || !d.classList.contains('cor-proj')) return;
  if (d.open) COR_OPEN.add(d.dataset.pid); else COR_OPEN.delete(d.dataset.pid);
}, true);
ACTIONS['ts-cor-mode'] = (el) => { db.setSetting('resMode', el.dataset.m); render(); };

function corridoProjHTML(p) {
  const pr = db.get('tempo_projects', p.pid) || { name: 'Sem projeto' };
  const cl = pr.client_id ? clientOf(pr) : null;
  const total = p.list.reduce((s, e) => s + entryMs(e), 0);
  const tasks = new Map();
  p.list.forEach(e => {
    const t = e.task_id ? db.get('tempo_tasks', e.task_id) : null;
    const top = t && t.parent_id ? db.get('tempo_tasks', t.parent_id) : t;
    const sub = t && t.parent_id ? t : null;
    const k = top ? top.id : '_';
    if (!tasks.has(k)) tasks.set(k, { name: top ? top.name : 'Sem tarefa', list: [], direct: [], subs: new Map() });
    const T = tasks.get(k);
    T.list.push(e);
    if (sub) { if (!T.subs.has(sub.id)) T.subs.set(sub.id, { name: sub.name, list: [] }); T.subs.get(sub.id).list.push(e); }
    else T.direct.push(e);
  });
  const aglo = db.setting('resMode', 'cron') === 'agl';
  const taskHTML = [...tasks.values()].map(T => {
    const tids = T.list.map(e => e.id).join(',');
    const tTotal = T.list.reduce((s, e) => s + entryMs(e), 0);
    const subsHTML = [...T.subs.values()].map(sb => `<div class="cor-sub"><div class="cor-subh"><span>↳ ${esc(sb.name)}</span><span class="mono small">${fmtDur(sb.list.reduce((s, e) => s + entryMs(e), 0))}</span></div><div class="grp-kids">${sb.list.map(entryRowHTML).join('')}</div></div>`).join('');
    const body = aglo ? groupedRowsHTML(T.list) : T.direct.map(entryRowHTML).join('') + subsHTML;
    return `<div class="cor-task"><div class="cor-taskh" data-act="ts-resumo" data-title="${esc(T.name)}" data-ids="${tids}"><b>${esc(T.name)}</b><span class="mono small">${fmtDur(tTotal)}</span></div>${body}</div>`;
  }).join('');
  const modeBtns = `<div class="row cor-mode" style="gap:6px;padding:8px 0 4px"><button class="btn sm ${aglo ? '' : 'primary'}" data-act="ts-cor-mode" data-m="cron">Cronológico</button><button class="btn sm ${aglo ? 'primary' : ''}" data-act="ts-cor-mode" data-m="agl">Aglomerado</button></div>`;
  const ids = p.list.map(e => e.id).join(',');
  const firstMs = Math.min(...p.list.map(e => new Date(entryStart(e)).getTime()));
  const endOf = (e) => new Date(entryEnd(e) || entryStart(e)).getTime();
  const lastMs = Math.max(...p.list.map(endOf));
  const dm = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const when = dm(firstMs) === dm(lastMs) ? dm(firstMs) : `${dm(firstMs)}–${dm(lastMs)}`;
  const tags = [...new Set(p.list.map(e => e.work_type_id || ''))].map(id => wtTag(id || null)).join('');
  return `<details class="grp-det cor-proj" data-pid="${p.pid}" ${COR_OPEN.has(p.pid) ? 'open' : ''}>
    <summary class="entry grp-sum" data-act="ts-resumo" data-title="${esc(pr.name)}" data-ids="${ids}">
      <span class="when">${when}</span>
      <div class="what"><div class="t">${esc(pr.name)} <span class="tag pill small">${p.list.length} ${p.list.length === 1 ? 'sessão' : 'sessões'}</span></div><div class="p">${esc(cl?.name || 'Sem cliente')}${pr.name ? '' : ''}</div></div>
      <span class="ent-tag">${tags}</span><span class="dur">${fmtDur(total)}</span><button type="button" class="grp-caret" data-act="grp-caret" aria-label="Ver tarefas" title="Ver tarefas">▾</button>
    </summary>
    <div class="cor-body">${modeBtns}${taskHTML}</div>
  </details>`;
}

function corridoHTML() {
  const size = Number(db.setting('tsCorSize', 10)) || 10;
  const n = Number(db.setting('tsCorN', size)) || size;
  const by = db.setting('tsCorBy', 'nenhum');
  const cat = db.setting('tsCorCat', '');
  const es = db.all('tempo_time_entries').filter(e => e.state === 'done' && e.project_id && (!cat || e.work_type_id === cat));
  const map = new Map();
  es.forEach(e => { if (!map.has(e.project_id)) map.set(e.project_id, { pid: e.project_id, list: [] }); map.get(e.project_id).list.push(e); });
  const projs = [...map.values()].map(p => ({ ...p, last: Math.max(...p.list.map(e => new Date(entryStart(e)).getTime())) })).sort((a, b) => b.last - a.last);
  const shown = projs.slice(0, n);
  const keyOf = (ms) => { const d = new Date(ms); return by === 'dia' ? ymd(d) : by === 'mes' ? ymd(d).slice(0, 7) : by === 'ano' ? String(d.getFullYear()) : ''; };
  const labelOf = (k) => by === 'dia' ? new Date(k + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : by === 'mes' ? new Date(k + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : k;
  let last = null; let body = '';
  shown.forEach(p => {
    if (by !== 'nenhum') { const k = keyOf(p.last); if (k !== last) { body += `<div class="cor-group">${esc(labelOf(k))}</div>`; last = k; } }
    body += corridoProjHTML(p);
  });
  const more = projs.length > shown.length ? `<button class="btn" data-act="ts-cor-more">Mostrar mais (${shown.length} de ${projs.length})</button>` : '';
  const less = n > size ? `<button class="btn ghost" data-act="ts-cor-less">Mostrar menos</button>` : '';
  const ctrl = `<div class="cor-ctrl">
    <div class="cor-ctrl-g"><span class="cor-ctrl-l">Agrupar por</span>
      <select class="input sm" data-on="ts-cor-by" aria-label="Agrupar">${[['nenhum', 'Nada'], ['dia', 'Dia'], ['mes', 'Mês'], ['ano', 'Ano']].map(([v, l]) => `<option value="${v}" ${by === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="input sm" data-on="ts-cor-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${workTypes().map(w => `<option value="${w.id}" ${w.id === cat ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
    <div class="cor-ctrl-g"><span class="cor-ctrl-l">Mostrar</span>
      <select class="input sm" data-on="ts-cor-size" aria-label="Quantos projetos">${[10, 20, 50, 100].map(v => `<option value="${v}" ${v === size ? 'selected' : ''}>${v}</option>`).join('')}</select><span class="cor-ctrl-l">projetos</span></div></div>`;
  return ctrl + `<div class="cor-list">${body || '<div class="empty">Nenhuma sessão ainda.</div>'}<div class="cor-more">${more}${less}</div></div>`;
}

/* ---------- Resumo da caixa ---------- */
const RES_PAUSE = { mac: '#CBD5E1', sono: '#94A3B8', suspenso: '#E2E8F0', ocioso: '#E2E8F0', app: '#F9A8D4', manual: '#A8B3C4' };
ACTIONS['ts-resumo'] = (el) => openResumo(el.dataset.title || '', (el.dataset.ids || '').split(',').filter(Boolean));

function openResumo(title, ids) {
  const es = ids.map(id => db.get('tempo_time_entries', id)).filter(Boolean).filter(e => e.state === 'done')
    .sort((a, b) => new Date(entryStart(a)) - new Date(entryStart(b)));
  if (!es.length) return toast('Nada para resumir.');
  const allIds = es.map(e => e.id);
  openLayer({
    wide: true,
    render: () => resumoHTML(title, es),
    onClose: () => { ACT_SEL = null; },
    onMount: (l) => {
      if (l.box._resBound) return; l.box._resBound = true;
      const reabrir = () => { l.close(); openResumo(title, allIds); };
      const menuPrograma = (gid, label, seg) => openProgChoice(allIds, gid, label, { seg, redraw: () => l.refresh(), done: reabrir });
      l.box.addEventListener('click', (ev) => {
        const modo = ev.target.closest('[data-rmode]');
        if (modo) { db.setSetting('resMode', modo.dataset.rmode); ACT_SEL = null; l.refresh(); return; }
        if (ev.target.closest('[data-x="act-fora-toggle"]')) { db.setSetting('actShowFora', !db.setting('actShowFora', true)); return l.refresh(); }
        const mv = ev.target.closest('.act-moved[data-pid]');
        if (mv && mv.dataset.pid) { l.close(); return openProject(mv.dataset.pid); }
        if (ACT_SEL) return;   // enquanto marca trechos, o clique só serve para arrastar
        const fileEl = ev.target.closest('[data-x="res-file"]');
        if (fileEl) return openActGroup(allIds, fileEl.dataset.g, reabrir);
        const chipEl = ev.target.closest('[data-x="res-prog"]');
        if (chipEl) return menuPrograma(chipEl.dataset.g, chipEl.dataset.label);
        const seg = ev.target.closest('.res-strip .act-b[data-g]');
        if (seg) {
          const chip = Array.from(l.box.querySelectorAll('[data-x="res-prog"]')).find(c => c.dataset.g === seg.dataset.g);
          if (chip) menuPrograma(chip.dataset.g, chip.dataset.label, seg.dataset.a ? { a: +seg.dataset.a, b: +seg.dataset.b } : null);
        }
      });
    }
  });
}

/* Lista de sessões do Resumo: Cronológico (uma a uma) ou Aglomerado (por tarefa, com total e quantidade). */
function resumoSessionsHTML(es, mode) {
  const row = (t, dur) => `<div class="row between small res-row">${t}<span class="mono">${dur}</span></div>`;
  if (mode !== 'agl') return es.map(e => row(`<span><span class="mono">${fmtTime(entryStart(e))}–${fmtTime(entryEnd(e))}</span> · ${esc(entryTitle(e))}</span>`, fmtDur(entryMs(e)))).join('');
  const m = new Map();
  es.forEach(e => { const k = `${entryTitle(e)}|${entrySub(e)}`; if (!m.has(k)) m.set(k, []); m.get(k).push(e); });
  return [...m.values()].map(list => {
    const first = list.reduce((a, e) => (new Date(entryStart(e)) < new Date(a) ? entryStart(e) : a), entryStart(list[0]));
    const last = list.reduce((a, e) => (new Date(entryEnd(e)) > new Date(a) ? entryEnd(e) : a), entryEnd(list[0]));
    const total = list.reduce((s, e) => s + entryMs(e), 0);
    return row(`<span><span class="mono">${fmtTime(first)}–${fmtTime(last)}</span> · ${esc(entryTitle(list[0]))} <span class="faint">${list.length} ${list.length === 1 ? 'sessão' : 'sessões'}</span></span>`, fmtDur(total));
  }).join('');
}

function resumoHTML(title, es) {
  const key = actSelKey(es.map(e => e.id));
  const mode = db.setting('resMode', 'cron');
  const tagged = es.flatMap((e, i) => actList(e.id).map(r => ({ ...r, _i: i })));
  const an = actAnalyzeList(tagged, 'program');
  const colorOf = Object.fromEntries(an.groups.map(g => [g.id, g.color]));
  const othAttr = actOthMembersAttr(an);
  const parentOf = Object.fromEntries(an.groups.map(g => [g.id, g.parent || null]));
  const totalBruto = unionBrutoMs(es);
  const totalTrab = es.reduce((s, e) => s + entryMs(e), 0);
  const pausas = pauseGapsOf(es);
  const pauseByWhy = {};
  pausas.forEach(g => { const k = g.why || 'manual'; pauseByWhy[k] = (pauseByWhy[k] || 0) + (new Date(g.e) - new Date(g.s)); });
  const totalPausa = Object.values(pauseByWhy).reduce((s, x) => s + x, 0);
  const toggles = `<div class="row" style="gap:6px"><button class="btn sm ${mode === 'cron' ? 'primary' : ''}" data-rmode="cron">Cronológico</button><button class="btn sm ${mode === 'agl' ? 'primary' : ''}" data-rmode="agl">Aglomerado</button></div>`;
  const legendRows = an.groups.map(g => `<div class="row between small res-row"><span class="row" style="gap:8px"><span class="res-sw" style="background:${g.color}"></span>${esc(g.label)}</span><span class="mono">${fmtDur(g.ms)}</span></div>`).join('');
  const pauseRows = Object.entries(pauseByWhy).map(([k, ms]) => `<div class="row between small res-row"><span class="row" style="gap:8px"><span class="res-sw" style="background:${RES_PAUSE[k] || '#CBD5E1'}"></span>Pausa · ${esc(pauseLabel(k))}</span><span class="mono">${fmtDur(ms)}</span></div>`).join('');
  const sess = es.map(e => { const st = new Date(entryStart(e)).getTime(); const en = new Date(entryEnd(e)).getTime(); return { e, st, en, span: Math.max(1, en - st) }; });
  const totalSpan = sess.reduce((t, x) => t + x.span, 0) || 1;
  let bar = '', note = '';
  const fileAn = actAnalyzeList(tagged, "both");
  const fColorOf = Object.fromEntries(fileAn.groups.map(g => [g.id, g.color]));
  const fParentOf = Object.fromEntries(fileAn.groups.map(g => [g.id, g.parent || null]));
  const fOthAttr = actOthMembersAttr(fileAn);
  /* Faixa cronológica dos arquivos/sites (mesma régua da de programas). */
  const fileCron = () => {
    let off = 0, parts = '';
    sess.forEach((x, i) => {
      const base = off, wS = x.span / totalSpan * 100;
      const pos = (a, b) => ({ l: base + Math.max(0, a - x.st) / x.span * wS, w: Math.max(.3, (Math.min(x.span, b - x.st) - Math.max(0, a - x.st)) / x.span * wS) });
      fileAn.records.filter(r => r._i === i).forEach(r => { const g = fileAn.groups.find(z => z.id === r.gid); const q = pos(new Date(r.from).getTime(), new Date(r.to).getTime()); parts += `<span class="seg-b act-b" data-g="${esc(r.gid)}"${fParentOf[r.gid] ? ` data-par="${esc(fParentOf[r.gid])}" data-tbc="${esc(fColorOf[r.gid])}"` : ''}${fParentOf[r.gid] === 'outros' ? fOthAttr : ''} data-tip="${esc(g ? actTip(g) : r.app)}" style="--tb:${fParentOf[r.gid] ? '#94A3B8' : (fColorOf[r.gid] || 'var(--accent)')};left:${q.l}%;width:${q.w}%"></span>`; });
      actUnspecOf(x.e).forEach(([a, b]) => { const q = pos(a, b); parts += actUnspecSpanHTML(a, b, q.l, q.w); });
      pauseGapsOf([x.e]).forEach(g => { const q = pos(new Date(g.s).getTime(), new Date(g.e).getTime()); parts += `<span class="seg-b pausa" data-pk="${pauseKind(g.why || 'manual')}" data-tip="${esc(`Pausa · ${pauseLabel(g.why)}\n${fmtTime(g.s)}–${fmtTime(g.e)} · ${fmtDur(new Date(g.e) - new Date(g.s))}`)}" style="--ph:${pauseHatch(g.why)};--pg:${pauseGapOf(pauseHatch(g.why))};left:${q.l}%;width:${q.w}%"></span>`; });
      if (i > 0) parts += `<span class="act-sep" style="left:${base}%"></span>`;
      off += wS;
    });
    return `<div class="act-strip res-fstrip" style="height:26px">${parts}</div>`;
  };
  /* Por tarefa: cada sessão pinta sua fatia com a cor da tarefa; passar o mouse numa tarefa acende só ela. */
  const tasks = [];
  const taskOf = (e) => { const t = db.get('tempo_tasks', e.task_id); const k = t ? t.id : '_'; let r = tasks.find(z => z.k === k); if (!r) { r = { k, name: t ? (t.parent_id ? (db.get('tempo_tasks', t.parent_id)?.name + ' › ' + t.name) : t.name) : 'Sem tarefa', ms: 0, n: 0 }; tasks.push(r); } return r; };
  es.forEach(e => { const r = taskOf(e); r.ms += entryMs(e); r.n++; });
  tasks.sort((a, b) => b.ms - a.ms).forEach((t, i) => { t.color = t.k === '_' ? '#CBD5E1' : ACT_PALETTE[(i * 5 + 1) % ACT_PALETTE.length]; });
  const taskTip = (t) => `${t.name}\n${fmtDur(t.ms)} de trabalho · ${usePctTxt(totalTrab ? t.ms / totalTrab * 100 : 0)} do projeto\n${t.n} ${t.n === 1 ? 'sessão' : 'sessões'}`;
  let taskBar = '';
  if (tasks.length > 1) {
    let parts = '';
    if (mode === 'cron') { let off = 0; sess.forEach((x) => { const w = x.span / totalSpan * 100; const t = taskOf(x.e); parts += `<span class="seg-b fill res-task" data-hk="${esc(t.k)}" data-tip="${esc(`${t.name}\n${fmtTime(entryStart(x.e))}–${fmtTime(entryEnd(x.e))} · ${fmtDur(entryMs(x.e))}`)}" style="--tb:${t.color};left:${off}%;width:${Math.max(.3, w)}%"></span>`; off += w; }); }
    else { let off = 0; tasks.forEach(t => { const w = totalTrab ? t.ms / totalTrab * 100 : 0; parts += `<span class="seg-b fill res-task" data-hk="${esc(t.k)}" data-tip="${esc(taskTip(t))}" style="--tb:${t.color};left:${off}%;width:${Math.max(.3, w)}%"></span>`; off += w; }); }
    taskBar = `<div class="act-sec" data-hkroot="1"><div class="lbl">Por tarefa</div><div class="act-strip" style="height:22px">${parts}</div><div class="act-chips">${tasks.map(t => `<span class="act-chip res-task" data-hk="${esc(t.k)}" data-tip="${esc(taskTip(t))}" style="--tb:${t.color}"><i></i>${esc(t.name)} <span class="faint">${fmtDur(t.ms)}</span></span>`).join('')}</div></div>`;
  }
  if (mode === 'cron') {
    let off = 0, parts = '';
    const slices = [];
    sess.forEach((x, i) => {
      const base = off, wS = x.span / totalSpan * 100;
      slices.push({ e: x.e.id, l: base, w: wS, st: x.st, span: x.span });
      const pos = (a, b) => ({ l: base + Math.max(0, a - x.st) / x.span * wS, w: Math.max(.3, (Math.min(x.span, b - x.st) - Math.max(0, a - x.st)) / x.span * wS) });
      an.records.filter(r => r._i === i).forEach(r => { const q = pos(new Date(r.from).getTime(), new Date(r.to).getTime()); parts += `<span class="seg-b act-b" data-g="${esc(r.gid)}"${parentOf[r.gid] ? ` data-par="${esc(parentOf[r.gid])}" data-tbc="${esc(colorOf[r.gid])}"` : ''}${parentOf[r.gid] === 'outros' ? othAttr : ''} data-a="${new Date(r.from).getTime()}" data-b="${new Date(r.to).getTime()}" data-tip="${esc(`${shortProgram(r.app)} · ${fmtTime(r.from)}–${fmtTime(r.to)} · ${fmtDur(new Date(r.to) - new Date(r.from))}${r.doc ? '\n' + actItemName(r) : ''}`)}" style="--tb:${parentOf[r.gid] ? '#94A3B8' : (colorOf[r.gid] || 'var(--accent)')};left:${q.l}%;width:${q.w}%"></span>`; });
      if (db.setting('actShowFora', true)) (x.e.segments || []).forEach((sg, k, arr) => {
        if (sg.why !== 'moved' || k >= arr.length - 1 || !sg.e || !arr[k + 1].s) return;
        const q = pos(new Date(sg.e).getTime(), new Date(arr[k + 1].s).getTime()); if (q.w > 0) parts += actMovedSpanHTML(sg, q.l, q.w, arr[k + 1].s);
      });
      actUnspecOf(x.e).forEach(([a, b]) => { const q = pos(a, b); parts += actUnspecSpanHTML(a, b, q.l, q.w); });
      pauseGapsOf([x.e]).forEach(g => { const q = pos(new Date(g.s).getTime(), new Date(g.e).getTime()); parts += `<span class="seg-b pausa" data-pk="${pauseKind(g.why || 'manual')}" data-tip="${esc(`Pausa · ${pauseLabel(g.why)}\n${fmtTime(g.s)}–${fmtTime(g.e)} · ${fmtDur(new Date(g.e) - new Date(g.s))}`)}" style="--ph:${pauseHatch(g.why)};--pg:${pauseGapOf(pauseHatch(g.why))};left:${q.l}%;width:${q.w}%"></span>`; });
      if (i > 0) parts += `<span class="act-sep" style="left:${base}%"></span>`;
      off += wS;
    });
    bar = `<div class="act-strip res-strip" data-slices="${esc(JSON.stringify(slices))}" data-mode="program" data-ent="${esc(key)}" style="height:34px">${parts}${actSelOverlays(key, slices)}</div>`;
    note = 'Cada sessão ocupa uma fatia proporcional à sua duração, na ordem em que aconteceram.<br>Os programas e as pausas ficam no lugar em que aconteceram dentro de cada fatia.';
  } else {
    const tot = Math.max(1, totalBruto);
    let off = 0, parts = '';
    an.groups.filter(g => !g.hidden).forEach(g => { const w = g.ms / tot * 100; if (w <= 0) return; parts += `<span class="seg-b act-b" data-g="${esc(g.id)}"${g.id === 'outros' ? ' data-par="outros" data-tbc="' + esc(g.color) + '"' + othAttr : ''} title="${esc(g.label)} · ${fmtDur(g.ms)}" style="--tb:${g.color};left:${off}%;width:${Math.max(.3, w)}%"></span>`; off += w; });
    pauseBucketsOf(Object.entries(pauseByWhy).map(([k, ms]) => ({ key: k, label: pauseLabel(k), ms }))).forEach(bk => { const w = bk.ms / tot * 100; if (w <= 0) return; parts += `<span class="seg-b pausa" data-pk="${bk.kind}" title="${esc(bk.label)} · ${fmtDur(bk.ms)}" style="--ph:${bk.color};--pg:${pauseGapOf(bk.color)};left:${off}%;width:${Math.max(.3, w)}%"></span>`; off += w; });
    const unMs = actUnspecMs(es);
    if (unMs > 0 && off < 100) { const w = Math.min(100 - off, unMs / tot * 100); parts += `<span class="seg-b unspec" style="left:${off}%;width:${Math.max(.3, w)}%" data-tip="${esc(ACT_UNSPEC_TIP + '\nTotal: ' + fmtDur(unMs))}"></span>`; off += w; }
    const restMs = Math.max(0, totalBruto - an.groups.reduce((t, g) => t + g.ms, 0) - totalPausa - unMs);
    if (restMs > 1000 && off < 100) parts += `<span class="act-track" style="left:${off}%;width:${100 - off}%"></span>`;
    bar = `<div class="act-strip" style="height:34px">${parts}</div>`;
    note = 'Tudo junto: cada programa soma o tempo de todas as sessões, e as pausas ficam por categoria. A barra inteira é o bruto.';
  }
  const legendChips = an.groups.filter(g => !g.hidden).map(g => `<button type="button" class="act-chip" data-x="res-prog"${g.id === 'outros' ? ' data-hl="outros"' + actOthMembersAttr(an) : ''} data-g="${esc(g.id)}" data-ms="${g.ms}" data-label="${esc(g.label)}" style="--tb:${g.color}"${g.id === 'outros' ? '' : ` data-tip="${esc(actTip(g) + '\nClique para mover, agrupar ou mudar a cor')}"`}><i></i>${esc(g.label)} <span class="faint">${fmtDur(g.ms)}</span></button>`).join('') + actUnspecChipHTML(actUnspecMs(es));
  const pauseChips = pauseBucketChip ? pauseBucketsOf(Object.entries(pauseByWhy).map(([k, ms]) => ({ key: k, label: pauseLabel(k), ms }))).map(pauseBucketChip).join('') : '';
  const fileMembers = (g) => {
    const arr = g.id === 'outros' ? fileAn.groups.filter(x => x.parent === 'outros').map(x => ({ l: x.label, ms: x.ms, c: x.color }))
      : (g.items || []).slice(0, 15).map(it => ({ l: it.doc || it.app, ms: it.ms, c: g.color }));
    return arr.length ? ` data-members="${esc(JSON.stringify(arr))}"` : '';
  };
  const fileChips = fileAn.groups.filter(g => !g.hidden).map(g => `<button type="button" class="act-chip" data-x="res-file" data-g="${esc(g.id)}" style="--tb:${g.color}"${g.id === 'outros' ? fileMembers(g) : ` data-tip="${esc(actTip(g) + '\nClique para separar, agrupar, mudar a cor ou mover')}"`}><i></i>${esc(g.label)} <span class="faint">${fmtDur(g.ms)}</span></button>`).join('');
  const legendHTML = `<div class="lbl" style="margin-top:14px">Programas</div><div class="act-chips">${legendChips || '<span class="muted small">Sem registros de programa.</span>'}</div><div class="lbl" style="margin-top:8px">Arquivo / site</div>${mode === 'cron' ? fileCron() : ''}<div class="act-chips">${fileChips || '<span class="muted small">Sem arquivos ou sites registrados.</span>'}</div><div class="lbl" style="margin-top:8px">Pausas</div><div class="act-chips">${pauseChips || '<span class="muted small">Sem pausas.</span>'}</div>`;
  const sessions = resumoSessionsHTML(es, mode);
  return `<div class="dh"><div class="grow"><span class="small muted">Resumo</span><h2 style="margin-top:2px">${esc(title)}</h2></div>${toggles}<button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
  <div class="db stack" style="gap:12px">
    <div class="small muted"><span data-tip="${esc(`Bruto ${fmtDur(totalBruto)}\nDo início ao fim de cada sessão, sem contar duas vezes o mesmo horário. Inclui as pausas.`)}">Bruto ${fmtDur(totalBruto)}</span> · <span data-tip="${esc(`Trabalho ${fmtDur(totalTrab)}\nSó o tempo trabalhado (bruto menos pausas).\nCom registro de programa: ${fmtDur(Math.max(0, totalTrab - actUnspecMs(es)))}\nNão especificado: ${fmtDur(actUnspecMs(es))}`)}">trabalho ${fmtDur(totalTrab)}</span> · <span data-tip="${esc(`Pausas ${fmtDur(totalPausa)}\n${Object.entries(pauseByWhy).map(([k, ms]) => pauseLabel(k) + ': ' + fmtDur(ms)).join('\n')}`)}">pausas ${fmtDur(totalPausa)}</span> · ${es.length} sessão(ões)</div>
    ${prodMiniHTML(es)}
    ${taskBar}
    ${actForaToggleHTML(es)}
    ${actSelBarHTML(key)}
    <div class="act-sec">${bar}<div class="muted" style="font-size:.78em;line-height:1.5;margin-top:6px">${note}</div>${legendHTML}</div>
    <div><div class="lbl">Sessões</div>${sessions}</div>
  </div>`;
}

