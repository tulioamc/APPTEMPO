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
  const taskHTML = [...tasks.values()].map(T => {
    const tids = T.list.map(e => e.id).join(',');
    const tTotal = T.list.reduce((s, e) => s + entryMs(e), 0);
    const subsHTML = [...T.subs.values()].map(sb => `<div class="cor-sub"><div class="cor-subh"><span>↳ ${esc(sb.name)}</span><span class="mono small">${fmtDur(sb.list.reduce((s, e) => s + entryMs(e), 0))}</span></div><div class="grp-kids">${sb.list.map(entryRowHTML).join('')}</div></div>`).join('');
    return `<div class="cor-task"><div class="cor-taskh"><b>${esc(T.name)}</b><span class="mono small">${fmtDur(tTotal)}</span><span class="grow"></span><button class="btn sm" data-act="ts-resumo" data-title="${esc(T.name)}" data-ids="${tids}">Resumo</button></div>${T.direct.map(entryRowHTML).join('')}${subsHTML}</div>`;
  }).join('');
  const ids = p.list.map(e => e.id).join(',');
  const firstMs = Math.min(...p.list.map(e => new Date(entryStart(e)).getTime()));
  const endOf = (e) => new Date(entryEnd(e) || entryStart(e)).getTime();
  const lastMs = Math.max(...p.list.map(endOf));
  const dm = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const when = dm(firstMs) === dm(lastMs) ? dm(firstMs) : `${dm(firstMs)}–${dm(lastMs)}`;
  const tags = [...new Set(p.list.map(e => e.work_type_id || ''))].map(id => wtTag(id || null)).join('');
  return `<details class="grp-det cor-proj">
    <summary class="entry grp-sum">
      <span class="when">${when}</span>
      <div class="what"><div class="t">${esc(pr.name)} <span class="tag pill small">${p.list.length} ${p.list.length === 1 ? 'sessão' : 'sessões'}</span></div><div class="p">${esc(cl?.name || 'Sem cliente')}${pr.name ? '' : ''}</div></div>
      <div class="row" style="justify-content:flex-end;gap:10px"><span style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${tags}</span><button class="btn sm" data-act="ts-resumo" data-title="${esc(pr.name)}" data-ids="${ids}">Resumo</button><span class="dur">${fmtDur(total)}</span><span class="faint grp-caret">▾</span></div>
    </summary>
    <div class="cor-body">${taskHTML}</div>
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

function resumoHTML(title, es) {
  const key = actSelKey(es.map(e => e.id));
  const mode = db.setting('resMode', 'cron');
  const tagged = es.flatMap((e, i) => actList(e.id).map(r => ({ ...r, _i: i })));
  const an = actAnalyzeList(tagged, 'program');
  const colorOf = Object.fromEntries(an.groups.map(g => [g.id, g.color]));
  const totalBruto = es.reduce((s, e) => s + entryBrutoMs(e), 0);
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
  if (mode === 'cron') {
    let off = 0, parts = '';
    const slices = [];
    sess.forEach((x, i) => {
      const base = off, wS = x.span / totalSpan * 100;
      slices.push({ e: x.e.id, l: base, w: wS, st: x.st, span: x.span });
      const pos = (a, b) => ({ l: base + Math.max(0, a - x.st) / x.span * wS, w: Math.max(.3, (Math.min(x.span, b - x.st) - Math.max(0, a - x.st)) / x.span * wS) });
      an.records.filter(r => r._i === i).forEach(r => { const q = pos(new Date(r.from).getTime(), new Date(r.to).getTime()); parts += `<span class="seg-b act-b" data-g="${esc(r.gid)}" data-a="${new Date(r.from).getTime()}" data-b="${new Date(r.to).getTime()}" title="${esc(r.app)}${r.doc ? ' · ' + esc(r.doc) : ''}" style="--tb:${colorOf[r.gid] || 'var(--accent)'};left:${q.l}%;width:${q.w}%"></span>`; });
      if (db.setting('actShowFora', true)) (x.e.segments || []).forEach((sg, k, arr) => {
        if (sg.why !== 'moved' || k >= arr.length - 1 || !sg.e || !arr[k + 1].s) return;
        const q = pos(new Date(sg.e).getTime(), new Date(arr[k + 1].s).getTime()); if (q.w > 0) parts += actMovedSpanHTML(sg, q.l, q.w);
      });
      entryGaps(x.e).forEach(g => { const q = pos(new Date(g.s).getTime(), new Date(g.e).getTime()); parts += `<span class="seg-b pausa" title="Pausa · ${esc(pauseLabel(g.why))}" style="--ph:${pauseHatch(g.why)};--pg:${pauseGapOf(pauseHatch(g.why))};left:${q.l}%;width:${q.w}%"></span>`; });
      if (i > 0) parts += `<span class="act-sep" style="left:${base}%"></span>`;
      off += wS;
    });
    bar = `<div class="act-strip res-strip" data-slices="${esc(JSON.stringify(slices))}" data-mode="program" data-ent="${esc(key)}" style="height:34px">${parts}${actSelOverlays(key, slices)}</div>`;
    note = 'Cada sessão ocupa uma fatia proporcional à sua duração, na ordem em que aconteceram. Os programas e as pausas ficam no lugar em que aconteceram dentro de cada fatia.';
  } else {
    const tot = Math.max(1, totalBruto);
    let off = 0, parts = '';
    an.groups.forEach(g => { const w = g.ms / tot * 100; if (w <= 0) return; parts += `<span class="seg-b act-b" data-g="${esc(g.id)}" title="${esc(g.label)} · ${fmtDur(g.ms)}" style="--tb:${g.color};left:${off}%;width:${Math.max(.3, w)}%"></span>`; off += w; });
    pauseBucketsOf(Object.entries(pauseByWhy).map(([k, ms]) => ({ key: k, label: pauseLabel(k), ms }))).forEach(bk => { const w = bk.ms / tot * 100; if (w <= 0) return; parts += `<span class="seg-b pausa" title="${esc(bk.label)} · ${fmtDur(bk.ms)}" style="--ph:${bk.color};--pg:${pauseGapOf(bk.color)};left:${off}%;width:${Math.max(.3, w)}%"></span>`; off += w; });
    const restMs = Math.max(0, totalBruto - an.groups.reduce((t, g) => t + g.ms, 0) - totalPausa);
    if (restMs > 1000 && off < 100) parts += `<span class="act-track" style="left:${off}%;width:${100 - off}%"></span>`;
    bar = `<div class="act-strip" style="height:34px">${parts}</div>`;
    note = 'Tudo junto: cada programa soma o tempo de todas as sessões, e as pausas ficam por categoria. A barra inteira é o bruto.';
  }
  const legendChips = an.groups.map(g => `<button type="button" class="act-chip" data-x="res-prog" data-g="${esc(g.id)}" data-label="${esc(g.label)}" style="--tb:${g.color}" title="Clique para ver as opções deste programa"><i></i>${esc(g.label)} <span class="faint">${fmtDur(g.ms)}</span></button>`).join('');
  const pauseChips = pauseBucketChip ? pauseBucketsOf(Object.entries(pauseByWhy).map(([k, ms]) => ({ key: k, label: pauseLabel(k), ms }))).map(pauseBucketChip).join('') : '';
  const legendHTML = `<div class="lbl">Programas</div><div class="act-chips">${legendChips || '<span class="muted small">Sem registros de programa.</span>'}</div><div class="lbl" style="margin-top:8px">Pausas</div><div class="act-chips">${pauseChips || '<span class="muted small">Sem pausas.</span>'}</div>`;
  const sessions = es.map(e => `<div class="row between small res-row"><span><span class="mono">${fmtTime(entryStart(e))}–${fmtTime(entryEnd(e))}</span> · ${esc(entryTitle(e))}</span><span class="mono">${fmtDur(entryMs(e))}</span></div>`).join('');
  return `<div class="dh"><div class="grow"><span class="small muted">Resumo</span><h2 style="margin-top:2px">${esc(title)}</h2></div>${toggles}<button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
  <div class="db stack" style="gap:12px">
    <div class="small muted">Bruto ${fmtDur(totalBruto)} · trabalho ${fmtDur(totalTrab)} · pausas ${fmtDur(totalPausa)} · ${es.length} sessão(ões)</div>
    ${actForaToggleHTML(es)}
    ${actSelBarHTML(key)}
    <div class="act-sec">${bar}<div class="small muted">${note}</div>${legendHTML}</div>
    <div><div class="lbl">Sessões</div>${sessions}</div>
  </div>`;
}

