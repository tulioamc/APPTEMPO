/* =====================================================================
   EDITOR DE FLUXO (nós)
   Cada tarefa é um nó. Arraste pelo cabeçalho para mover.
   Arraste da porta da direita (libera) até a porta da esquerda de outra
   tarefa (depende de) para criar a ligação. Clique numa linha para remover.
   O custo de terceiro, quando preenchido, vira um lançamento de despesa
   ligado ao projeto e à tarefa (entra no orçamento do projeto).
   ===================================================================== */
const FN_W = 200, FN_H = 116;

function flowTasks(pid) { return db.where('tempo_tasks', t => t.project_id === pid && !t.parent_id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }

/* Posição: a salva; sem ela, em colunas por profundidade no fluxo. */
function flowPositions(tasks) {
  const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
  const depth = {};
  const d = (t, stack = new Set()) => {
    if (depth[t.id] !== undefined) return depth[t.id];
    if (stack.has(t.id)) return 0;
    stack.add(t.id);
    const deps = (t.depends_on || []).map(x => byId[x]).filter(Boolean);
    depth[t.id] = deps.length ? Math.max(...deps.map(x => d(x, stack))) + 1 : 0;
    return depth[t.id];
  };
  tasks.forEach(t => d(t));
  const used = {};
  const out = {};
  tasks.forEach(t => {
    if (t.pos && typeof t.pos.x === 'number') { out[t.id] = t.pos; return; }
    const col = depth[t.id]; used[col] = (used[col] || 0) + 1;
    out[t.id] = { x: 36 + col * (FN_W + 70), y: 36 + (used[col] - 1) * (FN_H + 40) };
  });
  return out;
}

/* A tarefa "from" já depende (direta ou indiretamente) de "to"? Serve para barrar ciclos. */
function dependsOnChain(from, to, tasks) {
  const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
  const seen = new Set(); const stack = [from];
  while (stack.length) {
    const id = stack.pop(); if (seen.has(id)) continue; seen.add(id);
    if (id === to) return true;
    (byId[id]?.depends_on || []).forEach(x => stack.push(x));
  }
  return false;
}

function flowCostOf(taskId) {
  const e = db.where('tempo_expenses', x => x.task_id === taskId)[0];
  return e ? e : null;
}
function flowProjectCost(pid) {
  return db.where('tempo_expenses', x => x.project_id === pid).reduce((s, x) => s + (Number(x.amount) || 0), 0);
}

function flowHTML(pid) {
  const p = db.get('tempo_projects', pid);
  const tasks = flowTasks(pid);
  const pos = flowPositions(tasks);
  const W = Math.max(900, ...tasks.map(t => pos[t.id].x + FN_W + 60));
  const H = Math.max(520, ...tasks.map(t => pos[t.id].y + FN_H + 60));
  const nodes = tasks.map(t => {
    const ps = pos[t.id];
    const cost = flowCostOf(t.id);
    const deps = (t.depends_on || []).filter(d => tasks.some(x => x.id === d));
    return `<div class="fnode" data-fid="${t.id}" style="left:${ps.x}px;top:${ps.y}px;width:${FN_W}px">
      <div class="fnode-h" data-fdrag="${t.id}"><span class="fnode-name">${esc(t.name)}</span><button type="button" class="btn icon ghost sm" data-fdel="${t.id}" aria-label="Remover etapa" title="Remover etapa">${icon('x')}</button></div>
      <div class="fnode-b">
        <input class="input sm" value="${esc(t.name)}" data-fname="${t.id}" aria-label="Nome da etapa" placeholder="Nome">
        <input class="input sm" value="${esc(t.owner || '')}" data-fowner="${t.id}" aria-label="Responsável" placeholder="Responsável (Eu, terceiro…)">
        <label class="small muted fnode-cost">Custo terceiro R$ <input class="input sm mono" type="number" min="0" step="0.01" value="${cost ? Number(cost.amount) : ''}" data-fcost="${t.id}" aria-label="Custo do terceiro nesta etapa"></label>
        <span class="faint small">${deps.length ? 'depende de ' + deps.length : 'sem dependências'}</span>
      </div>
      <span class="fport fin" data-fin="${t.id}" title="Solte aqui para esta etapa depender da outra" aria-label="Entrada"></span>
      <span class="fport fout" data-fout="${t.id}" title="Arraste daqui para liberar outra etapa" aria-label="Saída"></span>
    </div>`;
  }).join('');
  const edges = tasks.flatMap(t => (t.depends_on || []).filter(d => tasks.some(x => x.id === d)).map(d => {
    const a = pos[d], b = pos[t.id];
    return `<path class="fhit" data-edge data-from="${d}" data-to="${t.id}" d="${edgePath(a, b)}"></path><path class="fedge" d="${edgePath(a, b)}"></path>`;
  })).join('');
  const cost = flowProjectCost(pid);
  return `<div class="dh"><div class="grow"><span class="small muted">Fluxo de ${esc(p?.name || '')}</span><h2 style="margin-top:2px">Etapas e ligações</h2></div>
    ${tasks.length ? '' : `<button class="btn sm" data-fnew="preset">Pré-montado (vídeo)</button>`}
    <button class="btn sm" data-fnew="blank">${icon('plus')} Etapa</button>
    <button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
  <div class="db">
    <div class="row small muted" style="gap:14px;flex-wrap:wrap;margin-bottom:8px"><span>Arraste pelo cabeçalho para mover. Porta direita → porta esquerda de outra etapa liga. Clique numa linha para remover a ligação.</span><span class="grow"></span><span>Custo de terceiros no orçamento: <b class="mono">${fmtMoney(cost) || 'R$ 0'}</b></span></div>
    <div class="flow-canvas" id="flow-canvas" style="width:${W}px;height:${H}px">
      <svg class="flow-svg" width="${W}" height="${H}" aria-hidden="true">${edges}<path class="fedge fedge-tmp" d="" style="display:none"></path></svg>
      ${nodes || '<div class="empty small" style="padding:40px">Nenhuma etapa. Use “Pré-montado (vídeo)” ou “+ Etapa”.</div>'}
    </div>
  </div>`;
}

function edgePath(a, b) {
  const x1 = a.x + FN_W, y1 = a.y + FN_H / 2, x2 = b.x, y2 = b.y + FN_H / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

function openFlowEditor(pid) {
  const ly = openLayer({
    wide: true,
    render: () => flowHTML(pid),
    onMount: (l) => bindFlow(l, pid)
  });
  return ly;
}

/* Redesenha só as linhas enquanto arrasta, lendo a posição atual dos nós. */
function redrawEdges(box, pid, tmp) {
  const canvas = box.querySelector('#flow-canvas'); if (!canvas) return;
  const pos = {};
  canvas.querySelectorAll('.fnode').forEach(n => { pos[n.dataset.fid] = { x: parseFloat(n.style.left) || 0, y: parseFloat(n.style.top) || 0 }; });
  const tasks = flowTasks(pid);
  canvas.querySelectorAll('path[data-edge]').forEach(p => p.remove());
  canvas.querySelectorAll('path.fedge:not(.fedge-tmp)').forEach(p => p.remove());
  const svg = canvas.querySelector('svg');
  let html = '';
  tasks.forEach(t => (t.depends_on || []).forEach(d => {
    if (!pos[d] || !pos[t.id]) return;
    const dd = edgePath(pos[d], pos[t.id]);
    html += `<path class="fhit" data-edge data-from="${d}" data-to="${t.id}" d="${dd}"></path><path class="fedge" d="${dd}"></path>`;
  }));
  svg.insertAdjacentHTML('afterbegin', html);
  if (tmp) {
    const tp = svg.querySelector('.fedge-tmp');
    tp.style.display = ''; tp.setAttribute('d', edgePath(pos[tmp.from], tmp.to));
  }
}

function bindFlow(ly, pid) {
  const box = ly.box;
  if (box._flowBound) return; box._flowBound = true;
  let drag = null;

  box.addEventListener('pointerdown', (e) => {
    const out = e.target.closest('[data-fout]');
    const head = e.target.closest('[data-fdrag]');
    if (out) {
      drag = { mode: 'link', from: out.dataset.fout };
      e.preventDefault();
    } else if (head && !e.target.closest('input,button')) {
      const n = head.closest('.fnode');
      drag = { mode: 'move', id: n.dataset.fid, sx: e.clientX, sy: e.clientY, ox: parseFloat(n.style.left) || 0, oy: parseFloat(n.style.top) || 0, el: n, moved: false };
    } else return;
    const onMove = (ev) => {
      if (!drag) return;
      if (drag.mode === 'move') {
        const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        drag.el.style.left = Math.max(0, drag.ox + dx) + 'px';
        drag.el.style.top = Math.max(0, drag.oy + dy) + 'px';
        redrawEdges(box, pid);
      } else {
        const c = box.querySelector('#flow-canvas').getBoundingClientRect();
        const to = { x: ev.clientX - c.left, y: ev.clientY - c.top };
        const fromEl = box.querySelector(`.fnode[data-fid="${drag.from}"]`);
        const fx = (parseFloat(fromEl.style.left) || 0) + FN_W, fy = (parseFloat(fromEl.style.top) || 0) + FN_H / 2;
        redrawEdges(box, pid, { from: drag.from, to: { x: to.x, y: to.y } });
        const tp = box.querySelector('.fedge-tmp');
        if (tp) tp.setAttribute('d', `M${fx},${fy} C${fx + 60},${fy} ${to.x - 60},${to.y} ${to.x},${to.y}`);
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      const d = drag; drag = null;
      if (!d) return;
      if (d.mode === 'move') {
        if (!d.moved) return;
        const x = parseFloat(d.el.style.left) || 0, y = parseFloat(d.el.style.top) || 0;
        db.update('tempo_tasks', d.id, { pos: { x, y } }, true);
        db.emit(); ly.refresh();
      } else {
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-fin]');
        const tid = target?.dataset.fin;
        if (tid && tid !== d.from) {
          const tasks = flowTasks(pid);
          const tt = tasks.find(t => t.id === tid);
          if (tt && (tt.depends_on || []).includes(d.from)) toast('Já está ligado');
          else if (dependsOnChain(d.from, tid, tasks)) toast('Essa ligação criaria um ciclo');
          else { db.update('tempo_tasks', tid, { depends_on: [...(tt.depends_on || []), d.from] }, true); db.emit(); }
        }
        ly.refresh();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  });

  box.addEventListener('click', (e) => {
    const edge = e.target.closest('[data-edge]');
    if (edge) {
      const t = db.get('tempo_tasks', edge.dataset.to); if (!t) return;
      db.update('tempo_tasks', t.id, { depends_on: (t.depends_on || []).filter(x => x !== edge.dataset.from) }, true);
      db.emit(); ly.refresh(); return;
    }
    const nw = e.target.closest('[data-fnew]');
    if (nw) {
      if (nw.dataset.fnew === 'preset') { openVideoFlowDialog(pid, () => ly.refresh()); return; }
      const todo = db.where('tempo_status_options', s => s.kind === 'work' && s.category === 'todo')[0];
      const n = flowTasks(pid).length;
      db.insert('tempo_tasks', { project_id: pid, parent_id: null, name: 'Nova etapa', status_id: todo?.id || null, status_inherited: false, deadline: null, notes: '', order: n, work_type_id: null, owner: null, depends_on: [], pos: { x: 36 + (n % 4) * (FN_W + 70), y: 36 + Math.floor(n / 4) * (FN_H + 40) } }, true);
      db.emit(); ly.refresh(); return;
    }
    const del = e.target.closest('[data-fdel]');
    if (del) {
      const t = db.get('tempo_tasks', del.dataset.fdel); if (!t) return;
      confirmBox({ title: 'Remover etapa?', body: `“${esc(t.name)}” sai do fluxo. As ligações dela são removidas; o custo de terceiro continua no financeiro, sem tarefa.`, ok: 'Remover', danger: true }).then(ok => {
        if (!ok) return;
        db.remove('tempo_tasks', t.id);
        flowTasks(pid).forEach(x => { if ((x.depends_on || []).includes(t.id)) db.update('tempo_tasks', x.id, { depends_on: x.depends_on.filter(d => d !== t.id) }, true); });
        db.emit(); ly.refresh();
      });
    }
  });

  box.addEventListener('change', (e) => {
    const nm = e.target.closest('[data-fname]');
    if (nm) { const v = nm.value.trim(); if (v) { db.update('tempo_tasks', nm.dataset.fname, { name: v }, true); db.emit(); ly.refresh(); } return; }
    const ow = e.target.closest('[data-fowner]');
    if (ow) { db.update('tempo_tasks', ow.dataset.fowner, { owner: ow.value.trim() || null }, true); db.emit(); ly.refresh(); return; }
    const co = e.target.closest('[data-fcost]');
    if (co) {
      const tid = co.dataset.fcost; const t = db.get('tempo_tasks', tid); if (!t) return;
      const amt = co.value === '' ? null : Math.abs(Number(co.value));
      const ex = flowCostOf(tid);
      if (amt === null || amt === 0) { if (ex) db.remove('tempo_expenses', ex.id); }
      else if (ex) db.update('tempo_expenses', ex.id, { amount: amt, project_id: pid, name: t.name }, true);
      else db.insert('tempo_expenses', { month: ymd(new Date()).slice(0, 7), kind: 'out', name: t.name, cat: '', note: 'Terceiro (fluxo do projeto)', amount: amt, due_date: null, paid_on: null, status: EX_OPEN.out, inst_no: null, inst_total: null, order: db.where('tempo_expenses', x => x.month === ymd(new Date()).slice(0, 7)).length, project_id: pid, task_id: tid }, true);
      db.emit(); ly.refresh();
    }
  });
}
