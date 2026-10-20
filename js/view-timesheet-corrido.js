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
    return `<div class="cor-task"><div class="cor-taskh"><b>${esc(T.name)}</b><span class="mono small">${fmtDur(tTotal)}</span><span class="grow"></span><button class="btn sm ghost" data-act="ts-resumo" data-title="${esc(T.name)}" data-ids="${tids}">Resumo</button></div>${T.direct.map(entryRowHTML).join('')}${subsHTML}</div>`;
  }).join('');
  const ids = p.list.map(e => e.id).join(',');
  const firstMs = Math.min(...p.list.map(e => new Date(entryStart(e)).getTime()));
  const lastMs = Math.max(...p.list.map(e => new Date(entryEnd(e)).getTime()));
  const dm = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const when = dm(firstMs) === dm(lastMs) ? dm(firstMs) : `${dm(firstMs)}–${dm(lastMs)}`;
  const tags = [...new Set(p.list.map(e => e.work_type_id || ''))].map(id => wtTag(id || null)).join('');
  return `<details class="grp-det cor-proj">
    <summary class="entry grp-sum">
      <span class="when">${when}</span>
      <div class="what"><div class="t">${esc(pr.name)} <span class="tag pill small">${p.list.length} sessões</span></div><div class="p">${esc(cl?.name || 'Sem cliente')}${pr.name ? '' : ''}</div></div>
      <div class="row" style="justify-content:flex-end;gap:10px"><span style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${tags}</span><button class="btn sm ghost" data-act="ts-resumo" data-title="${esc(pr.name)}" data-ids="${ids}">Resumo</button><span class="dur">${fmtDur(total)}</span><span class="faint grp-caret">▾</span></div>
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
    <div class="row" style="gap:6px;flex-wrap:wrap"><span class="small muted">Agrupar por</span>
      <select class="input sm" data-on="ts-cor-by" style="width:auto" aria-label="Agrupar">${[['nenhum', 'Nada'], ['dia', 'Dia'], ['mes', 'Mês'], ['ano', 'Ano']].map(([v, l]) => `<option value="${v}" ${by === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="input sm" data-on="ts-cor-cat" style="width:auto" aria-label="Categoria"><option value="">Todas as categorias</option>${workTypes().map(w => `<option value="${w.id}" ${w.id === cat ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
    <div class="row" style="gap:6px"><span class="small muted">Mostrar</span>
      <select class="input sm" data-on="ts-cor-size" style="width:auto" aria-label="Quantos projetos">${[10, 20, 50, 100].map(v => `<option value="${v}" ${v === size ? 'selected' : ''}>${v}</option>`).join('')}</select><span class="small muted">projetos</span></div></div>`;
  return ctrl + (body || '<div class="empty">Nenhuma sessão ainda.</div>') + `<div class="row" style="justify-content:center;gap:8px;margin-top:12px">${more}${less}</div>`;
}

/* ---------- Resumo da caixa ---------- */
const RES_PAUSE = { mac: '#CBD5E1', sono: '#94A3B8', suspenso: '#E2E8F0', ocioso: '#E2E8F0', app: '#F9A8D4', manual: '#A8B3C4' };
ACTIONS['ts-resumo'] = (el) => openResumo(el.dataset.title || '', (el.dataset.ids || '').split(',').filter(Boolean));

function openResumo(title, ids) {
  const es = ids.map(id => db.get('tempo_time_entries', id)).filter(Boolean).filter(e => e.state === 'done')
    .sort((a, b) => new Date(entryStart(a)) - new Date(entryStart(b)));
  if (!es.length) return toast('Nada para resumir.');
  openLayer({
    wide: true,
    render: () => resumoHTML(title, es),
    onMount: (l) => {
      if (l.box._resBound) return; l.box._resBound = true;
      l.box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-rmode]'); if (!b) return; db.setSetting('resMode', b.dataset.rmode); l.refresh(); });
    }
  });
}

function resumoHTML(title, es) {
  const mode = db.setting('resMode', 'cron');
  const tagged = es.flatMap((e, i) => actList(e.id).map(r => ({ ...r, _i: i })));
  const an = actAnalyzeList(tagged, 'program');
  const colorOf = Object.fromEntries(an.groups.map(g => [g.id, g.color]));
  const totalBruto = es.reduce((s, e) => s + entryBrutoMs(e), 0);
  const totalTrab = es.reduce((s, e) => s + entryMs(e), 0);
  const pausas = es.flatMap(e => entryGaps(e));
  const pauseByWhy = {};
  pausas.forEach(g => { const k = g.why || 'manual'; pauseByWhy[k] = (pauseByWhy[k] || 0) + (new Date(g.e) - new Date(g.s)); });
  const totalPausa = Object.values(pauseByWhy).reduce((s, x) => s + x, 0);
  const toggles = `<div class="row" style="gap:6px"><button class="btn sm ${mode === 'cron' ? 'primary' : ''}" data-rmode="cron">Cronológico</button><button class="btn sm ${mode === 'agl' ? 'primary' : ''}" data-rmode="agl">Aglomerado</button></div>`;
  const legendRows = an.groups.map(g => `<div class="row between small res-row"><span class="row" style="gap:8px"><span class="res-sw" style="background:${g.color}"></span>${esc(g.label)}</span><span class="mono">${fmtDur(g.ms)}</span></div>`).join('');
  const pauseRows = Object.entries(pauseByWhy).map(([k, ms]) => `<div class="row between small res-row"><span class="row" style="gap:8px"><span class="res-sw" style="background:${RES_PAUSE[k] || '#CBD5E1'}"></span>Pausa · ${esc(pauseLabel(k))}</span><span class="mono">${fmtDur(ms)}</span></div>`).join('');
  let bar = '', note = '';
  if (mode === 'cron') {
    const fats = es.map((e, i) => {
      const st = new Date(entryStart(e)).getTime(); const en = new Date(entryEnd(e)).getTime();
      const span = Math.max(1, en - st);
      const pos = (a, b) => ({ l: Math.max(0, a - st) / span * 100, w: Math.max(.3, (Math.min(span, b - st) - Math.max(0, a - st)) / span * 100) });
      const blocks = an.records.filter(r => r._i === i).map(r => { const p = pos(new Date(r.from).getTime(), new Date(r.to).getTime()); return `<span class="res-blk" style="left:${p.l}%;width:${p.w}%;background:${colorOf[r.gid] || 'var(--accent)'}" title="${esc(r.app)}${r.doc ? ' · ' + esc(r.doc) : ''}"></span>`; }).join('');
      const gaps = entryGaps(e).map(g => { const p = pos(new Date(g.s).getTime(), new Date(g.e).getTime()); return `<span class="res-blk" style="left:${p.l}%;width:${p.w}%;background:${RES_PAUSE[g.why] || '#CBD5E1'}" title="Pausa · ${esc(pauseLabel(g.why))}"></span>`; }).join('');
      return `<div class="res-fat" style="flex:${span}" title="${fmtTime(entryStart(e))}–${fmtTime(entryEnd(e))}"><div class="res-inner">${blocks}${gaps}</div></div>`;
    });
    bar = `<div class="res-bar">${fats.join('')}</div>`;
    note = 'Cada sessão ocupa uma fatia proporcional à sua duração, na ordem em que aconteceram. Os programas e as pausas ficam no lugar em que aconteceram dentro de cada fatia.';
  } else {
    const segs = an.groups.map(g => ({ w: g.ms, c: g.color, t: g.label }))
      .concat(Object.entries(pauseByWhy).map(([k, ms]) => ({ w: ms, c: RES_PAUSE[k] || '#CBD5E1', t: 'Pausa · ' + pauseLabel(k) })));
    const rest = Math.max(0, totalBruto - segs.reduce((s, x) => s + x.w, 0));
    if (rest > 1000) segs.push({ w: rest, c: 'var(--line)', t: 'Sem registro' });
    bar = `<div class="res-bar">${segs.filter(s => s.w > 0).map(s => `<div class="res-fat" style="flex:${s.w}" title="${esc(s.t)} · ${fmtDur(s.w)}"><div class="res-inner"><span class="res-blk" style="left:0;width:100%;background:${s.c}"></span></div></div>`).join('')}</div>`;
    note = 'Tudo junto: cada programa soma o tempo de todas as sessões, e as pausas ficam por categoria. A barra inteira é o bruto.';
  }
  const sessions = es.map(e => `<div class="row between small res-row"><span><span class="mono">${fmtTime(entryStart(e))}–${fmtTime(entryEnd(e))}</span> · ${esc(entryTitle(e))}</span><span class="mono">${fmtDur(entryMs(e))}</span></div>`).join('');
  return `<div class="dh"><div class="grow"><span class="small muted">Resumo</span><h2 style="margin-top:2px">${esc(title)}</h2></div>${toggles}<button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
  <div class="db stack" style="gap:12px">
    <div class="small muted">Bruto ${fmtDur(totalBruto)} · trabalho ${fmtDur(totalTrab)} · pausas ${fmtDur(totalPausa)} · ${es.length} sessão(ões)</div>
    ${bar}
    <div class="small muted">${note}</div>
    <div class="res-legend"><div><div class="lbl">Programas</div>${legendRows || '<div class="muted small">Sem registros de programa.</div>'}</div><div><div class="lbl">Pausas</div>${pauseRows || '<div class="muted small">Sem pausas.</div>'}</div></div>
    <div><div class="lbl">Sessões</div>${sessions}</div>
  </div>`;
}

