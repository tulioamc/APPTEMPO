/* =====================================================================
   CORTE DE TRECHOS
   Uma faixa de tempo com os apps usados (do log de atividade). Você cria, corta, move, redimensiona e apaga trechos,
   e escolhe uma tarefa para cada um. Os trechos nunca se sobrepõem entre si, nem a outra sessão.
   Ao salvar, o intervalo sai da sessão de origem (carveOutSegments) e entra na tarefa escolhida (um horário, uma sessão).
   ===================================================================== */
const CORTE_CORES = ['#D85A30', '#7F77DD', '#1D9E75', '#378ADD', '#D4537E', '#BA7517', '#639922', '#534AB7'];
const CORTE_MIN = 60000;

/* Funções puras (testáveis) ------------------------------------------------ */
/* Limites livres (em minutos) em volta de x: [fim do vizinho da esquerda, início do vizinho da direita]. */
function corteLivre(segs, x, W, ignorar = null) {
  let lo = 0, hi = W;
  segs.forEach(s => { if (s === ignorar) return; if (s.b <= x && s.b > lo) lo = s.b; if (s.a >= x && s.a < hi) hi = s.a; });
  return [lo, hi];
}
/* Ímã: aproxima x do ponto mais próximo dentro de tol (minutos); sem ímã devolve x. */
function corteImantar(x, pontos, tol) {
  let best = x, d = tol + 1e-9;
  pontos.forEach(p => { const k = Math.abs(p - x); if (k < d) { d = k; best = p; } });
  return best;
}
/* Corta o trecho que contém o cursor em dois, independentes. Devolve o novo trecho ou null. */
function corteCortar(segs, cur, novoId) {
  const s = segs.find(x => cur > x.a && cur < x.b); if (!s) return null;
  const n = { id: novoId, a: cur, b: s.b, task: s.task }; s.b = cur; segs.push(n);
  segs.sort((x, y) => x.a - y.a); return n;
}
/* Maior vão livre (para o botão "Novo trecho"). */
function corteVao(segs, W) {
  const l = segs.slice().sort((x, y) => x.a - y.a); let best = null, from = 0;
  for (let i = 0; i <= l.length; i++) { const to = i < l.length ? l[i].a : W; if (to - from >= 1 && (!best || to - from > best[1] - best[0])) best = [from, to]; from = i < l.length ? l[i].b : W; }
  return best;
}
const corteCor = (app) => { const k = (typeof shortProgram === 'function' ? shortProgram(app) : app) || app || ''; let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORTE_CORES[h % CORTE_CORES.length]; };
const corteHora = (ms) => { const d = new Date(ms); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0'); };

/* Tarefa sugerida pelo arquivo/pasta: a que mais usou o mesmo arquivo em outras sessões. */
function corteSugestoes(ignorarId) {
  const mapa = new Map(); const desde = Date.now() - 60 * 86400000;
  try {
    db.all('tempo_time_entries').forEach(e => {
      if (e.id === ignorarId || (!e.task_id && !e.project_id) || e.notes === 'Tempo pausado') return;
      const ult = (e.segments || []).reduce((m, s) => Math.max(m, s.e ? new Date(s.e).getTime() : Date.now()), 0); if (ult < desde) return;
      const key = e.task_id ? 't:' + e.task_id : 'p:' + e.project_id;
      (typeof actList === 'function' ? actList(e.id) : []).forEach(r => {
        const f = r.doc || r.folder; if (!f) return;
        const m = mapa.get(f) || {}; m[key] = (m[key] || 0) + 1; mapa.set(f, m);
      });
    });
  } catch (_) { /* sugestão é só um palpite */ }
  return mapa;
}
function corteSugerir(mapa, recs) {
  const soma = {}, arq = {};
  recs.forEach(r => { const f = r.doc || r.folder; const m = f && mapa.get(f); if (!m) return; Object.entries(m).forEach(([k, n]) => { soma[k] = (soma[k] || 0) + n; arq[k] = f; }); });
  const top = Object.entries(soma).sort((x, y) => y[1] - x[1])[0];
  return top ? { key: top[0], arquivo: arq[top[0]] } : null;
}
function corteTarefaOpcoes(sel) {
  let h = `<option value="">Não computar</option>`;
  tkProjectsSorted().forEach(p => {
    const ts = db.where('tempo_tasks', t => t.project_id === p.id);
    const lab = tkProjectLabel(p);
    h += `<optgroup label="${esc(lab)}"><option value="p:${esc(p.id)}"${sel === 'p:' + p.id ? ' selected' : ''}>${esc(p.name)} (sem tarefa)</option>${ts.map(t => `<option value="t:${esc(t.id)}"${sel === 't:' + t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`;
  });
  return h;
}
const corteAlvo = (key) => {
  if (!key) return null;
  if (key.startsWith('t:')) { const t = db.get('tempo_tasks', key.slice(2)); return t ? { project_id: t.project_id, task_id: t.id } : null; }
  return { project_id: key.slice(2), task_id: null };
};
const corteKeyOf = (e) => e.task_id ? 't:' + e.task_id : e.project_id ? 'p:' + e.project_id : '';

/* Grava: tira cada trecho da sessão de origem e coloca na tarefa escolhida. Devolve { ok, erro }. */
function corteSalvar({ origemId, from, to, segs, W, tudo }) {
  const ms = (m) => m >= W ? to : from + m * CORTE_MIN;
  const lista = segs.filter(s => s.task).map(s => ({ ...s, S: ms(s.a), E: ms(s.b) }));
  const iso = (x) => new Date(x).toISOString();
  const ov = overlapOf(lista.map(s => ({ s: iso(s.S), e: iso(s.E) })), origemId);
  if (ov) return { ok: false, erro: `Esse horário já está em outra sessão (${corteHora(ov.a)} a ${corteHora(ov.b)}). Ajuste para não sobrepor.` };
  const origem = origemId ? db.get('tempo_time_entries', origemId) : null;
  if (origem) {
    if (tudo) carveOutSegments(origemId, from, to);
    else lista.forEach(s => carveOutSegments(origemId, s.S, s.E));
  }
  const porTarefa = new Map();
  lista.forEach(s => { const l = porTarefa.get(s.task) || []; l.push({ s: iso(s.S), e: iso(s.E) }); porTarefa.set(s.task, l); });
  let n = 0, ms_total = 0;
  porTarefa.forEach((novos, key) => {
    const alvo = corteAlvo(key); if (!alvo) return;
    novos.forEach(x => { ms_total += new Date(x.e) - new Date(x.s); n++; });
    const atual = origemId ? db.get('tempo_time_entries', origemId) : null;
    if (atual && corteKeyOf(atual) === key) {
      const segsNovos = [...(atual.segments || []), ...novos].sort((x, y) => (x.e === null ? 1 : 0) - (y.e === null ? 1 : 0) || new Date(x.s) - new Date(y.s));
      db.update('tempo_time_entries', atual.id, { segments: segsNovos });
    } else {
      const p = db.get('tempo_projects', alvo.project_id), c = p ? clientOf(p) : null;
      db.insert('tempo_time_entries', { agency_id: c?.agency_id || null, client_id: c?.id || null, project_id: alvo.project_id, task_id: alvo.task_id, work_type_id: lastWorkType(alvo.project_id), revision_id: null, notes: 'Tempo pausado', state: 'done', segments: novos, edits: [] });
    }
  });
  db.emit();
  return { ok: true, n, ms: ms_total };
}

/* Tela ------------------------------------------------------------------- */
function openCorte({ from, to, origemId = null, titulo = 'Tempo não computado', inicial = null, tudo = false }) {
  from = Math.floor(from / CORTE_MIN) * CORTE_MIN;
  const W = Math.max(2, Math.ceil((to - from) / CORTE_MIN));
  const recs = actPoolBetween(from, to);
  const blocos = recs.map(r => ({ a: (new Date(r.from) - from) / CORTE_MIN, b: (new Date(r.to) - from) / CORTE_MIN, app: r.app, doc: r.doc || r.folder || '', pausa: typeof pausaRec === 'function' && pausaRec(r), r }));
  const pontos = [...new Set(blocos.flatMap(b => [Math.round(b.a), Math.round(b.b)]).filter(x => x >= 0 && x <= W))];
  const origem = origemId ? db.get('tempo_time_entries', origemId) : null;
  const padrao = origem ? corteKeyOf(origem) : '';
  const mapa = corteSugestoes(origemId);
  let id = 1; const segs = []; let sel = null, cur = 0, drag = null, hist = [], snapTxt = '';
  if (inicial) inicial.forEach(s => segs.push({ id: id++, a: Math.max(0, Math.round(s.a)), b: Math.min(W, Math.round(s.b)), task: s.task ?? padrao }));
  else {
    const t = blocos.filter(b => !b.pausa && !/loginwindow/i.test(b.app)).sort((x, y) => x.a - y.a)[0];
    if (t) { const a = Math.max(0, Math.round(t.a)); if (W - a >= 1) segs.push({ id: id++, a, b: W, task: padrao }); }
  }
  if (segs[0]) sel = segs[0].id;
  const sug = (s) => corteSugerir(mapa, recs.filter(r => new Date(r.to) > from + s.a * CORTE_MIN && new Date(r.from) < from + s.b * CORTE_MIN));
  segs.forEach(s => { const g = sug(s); if (g && !(origem && s.task === padrao && inicial)) s.task = g.key; });

  const passo = [1, 2, 5, 10, 15, 30, 60].find(p => W / p <= 9) || 60;
  const pct = (m) => (m / W * 100) + '%';
  const hm = (m) => corteHora(from + m * CORTE_MIN);
  const ly = openLayer({
    wide: true,
    html: `<div class="dh"><h2>${esc(titulo)}</h2><span class="grow"></span><span class="small muted">${corteHora(from)} a ${corteHora(to)} · ${fmtDur(to - from)}</span><button class="btn icon ghost" data-x="cr-x" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:10px">
      <div class="cr-band" id="cr-band"></div><div class="cr-ax" id="cr-ax"></div>
      <div class="cr-leg" id="cr-leg"></div>
      <div class="cr-tip" id="cr-tip" aria-live="polite"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" data-x="cr-cut" title="Atalho: C">${icon('scissors')} Cortar no cursor <kbd>C</kbd></button>
        <button class="btn" data-x="cr-add" title="Atalho: N">${icon('plus')} Novo trecho <kbd>N</kbd></button>
        <button class="btn" data-x="cr-auto" title="Atalho: S">${icon('wand')} Sugerir <kbd>S</kbd></button>
        <button class="btn" data-x="cr-undo" title="Atalho: ⌘Z">${icon('undo')} Desfazer <kbd>⌘Z</kbd></button>
      </div>
      <div class="small muted">Arraste em área vazia para criar · alças mudam o tamanho · arrastar o meio move · <kbd>←</kbd><kbd>→</kbd> movem 1 min (<kbd>Shift</kbd> muda o fim) · <kbd>Delete</kbd> apaga o trecho</div>
      <div id="cr-list"></div>
    </div>
    <div class="df"><span class="small muted grow" id="cr-tot"></span><button class="btn" data-x="cr-no">Não computar</button><button class="btn primary" data-x="cr-ok">Computar trechos</button></div>`,
    onMount: (l) => {
      const box = l.box, band = box.querySelector('#cr-band');
      const $ = (s) => box.querySelector(s);
      const porId = (i) => segs.find(s => String(s.id) === String(i));
      const salva = () => { hist.push(JSON.stringify({ segs, sel })); if (hist.length > 50) hist.shift(); };
      const msg = (t) => { $('#cr-tip').textContent = t; };
      const tipDe = (m) => { const b = blocos.find(x => m >= x.a && m < x.b); return `${hm(m)} · ` + (b ? `${(typeof shortProgram === 'function' ? shortProgram(b.app) : b.app) || b.app}${b.doc ? ' · ' + b.doc.split('/').pop() : ''}${b.pausa ? ' (pausa)' : ''}` : 'sem atividade registrada'); };
      function draw() {
        segs.sort((x, y) => x.a - y.a);
        let h = '';
        blocos.forEach(b => { h += `<div class="cr-blk${b.pausa ? ' pausa' : ''}" style="left:${pct(Math.max(0, b.a))};width:${pct(Math.min(W, b.b) - Math.max(0, b.a))};background:${b.pausa || /loginwindow/i.test(b.app) ? 'var(--border-strong)' : corteCor(b.app)}"></div>`; });
        segs.forEach(s => { h += `<div class="cr-seg${s.id === sel ? ' on' : ''}${s.task ? '' : ' off'}" data-k="m" data-id="${s.id}" style="left:${pct(s.a)};width:${pct(s.b - s.a)}"><span class="n">${s.b - s.a} min</span><div class="cr-h" data-k="a" data-id="${s.id}" style="left:0"></div><div class="cr-h" data-k="b" data-id="${s.id}" style="right:0"></div></div>`; });
        h += `<div class="cr-ph" style="left:${pct(cur)}"></div>`;
        band.innerHTML = h;
        let x = ''; for (let i = 0; i <= W; i += passo) x += `<span style="left:${pct(i)}">${hm(i)}</span>`; $('#cr-ax').innerHTML = x;
        const apps = [...new Map(blocos.filter(b => !b.pausa).map(b => [(typeof shortProgram === 'function' ? shortProgram(b.app) : b.app) || b.app, corteCor(b.app)])).entries()];
        $('#cr-leg').innerHTML = apps.map(([n, c]) => `<span><i class="cr-dot" style="background:${c}"></i>${esc(n)}</span>`).join('') + `<span><i class="cr-dot" style="background:var(--border-strong)"></i>Pausa, ocioso ou sem registro</span>`;
        let tot = 0, l = '';
        segs.forEach(s => {
          tot += s.task ? s.b - s.a : 0; const g = sug(s);
          l += `<div class="cr-row${s.id === sel ? ' on' : ''}" data-row="${s.id}"><b class="cr-t">${hm(s.a)} a ${hm(s.b)}</b><span class="muted cr-d">${s.b - s.a} min</span><select class="input" data-sid="${s.id}" aria-label="Tarefa do trecho">${corteTarefaOpcoes(s.task)}</select>${g && g.key === s.task ? `<span class="small muted" title="Mesmo arquivo usado antes nessa tarefa">sugerida · ${esc(String(g.arquivo).split('/').pop())}</span>` : ''}<span class="grow"></span><button class="btn icon ghost" data-del="${s.id}" aria-label="Apagar trecho" title="Apagar (Delete)">${icon('trash')}</button></div>`;
        });
        $('#cr-list').innerHTML = l || `<div class="small muted">Nenhum trecho. Arraste na faixa para criar um.</div>`;
        $('#cr-tot').textContent = `Vai computar ${fmtDur(tot * CORTE_MIN)} em ${segs.filter(s => s.task).length} trecho(s). O resto continua como pausa.`;
      }
      const toM = (e) => { const r = band.getBoundingClientRect(); return Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W)); };
      const tol = () => 7 / band.getBoundingClientRect().width * W;
      const ima = (x, e, extra = []) => { if (e.altKey) { snapTxt = ''; return Math.round(x); } const p = corteImantar(Math.round(x), [...pontos, ...extra], tol()); snapTxt = p !== Math.round(x) ? 'Ímã ligado · segure Option para soltar' : 'Segure Option para soltar o ímã'; return p; };
      band.addEventListener('pointerdown', (e) => {
        const el = e.target.closest('[data-k]'); const m = toM(e);
        if (el) { const s = porId(el.dataset.id); sel = s.id; salva(); drag = { tipo: el.dataset.k, s, x0: m, a0: s.a, b0: s.b }; }
        else { salva(); const [lo, hi] = corteLivre(segs, m, W); drag = { tipo: 'novo', x0: m, lo, hi, s: null }; cur = Math.round(m); }
        band.setPointerCapture(e.pointerId); draw();
      });
      band.addEventListener('pointermove', (e) => {
        const m = toM(e);
        if (!drag) { msg(tipDe(Math.floor(m))); return; }
        const vizinhos = segs.filter(s => s !== drag.s).flatMap(s => [s.a, s.b]);
        if (drag.tipo === 'a' || drag.tipo === 'b') {
          const [lo, hi] = corteLivre(segs, drag.tipo === 'a' ? drag.a0 : drag.b0, W, drag.s);
          if (drag.tipo === 'a') drag.s.a = Math.max(lo, Math.min(ima(m, e, vizinhos), drag.s.b - 1)); else drag.s.b = Math.min(hi, Math.max(ima(m, e, vizinhos), drag.s.a + 1));
        } else if (drag.tipo === 'm') {
          const len = drag.b0 - drag.a0, [lo, hi] = corteLivre(segs, (drag.a0 + drag.b0) / 2, W, drag.s);
          let na = Math.round(drag.a0 + (m - drag.x0)); const sa = ima(na, e, vizinhos), sb = ima(na + len, e, vizinhos) - len;
          na = Math.abs(sa - na) <= Math.abs(sb - na) && sa !== na ? sa : (sb !== na ? sb : na);
          na = Math.max(lo, Math.min(na, hi - len)); drag.s.a = na; drag.s.b = na + len; cur = Math.round(m);
        } else {
          const x = ima(m, e), a = Math.max(drag.lo, Math.min(drag.x0, x)), b = Math.min(drag.hi, Math.max(drag.x0, x));
          if (b - a >= 1) { if (!drag.s) { drag.s = { id: id++, a: Math.round(a), b: Math.round(b), task: padrao }; segs.push(drag.s); sel = drag.s.id; } drag.s.a = Math.round(a); drag.s.b = Math.round(b); }
        }
        msg(snapTxt || tipDe(Math.floor(m))); draw();
      });
      const solta = () => {
        if (drag && drag.tipo === 'novo' && drag.s) { const g = sug(drag.s); if (g) drag.s.task = g.key; }
        if (drag && drag.tipo === 'novo' && !drag.s) hist.pop();
        drag = null; draw();
      };
      band.addEventListener('pointerup', solta); band.addEventListener('pointercancel', solta);
      const cortar = () => { salva(); if (!corteCortar(segs, Math.round(cur), id++)) { hist.pop(); msg('Posicione o cursor dentro de um trecho para cortar (clique na faixa).'); return; } sel = segs.find(s => s.a === Math.round(cur)).id; msg('Cortado em dois trechos independentes.'); draw(); };
      const novo = () => { const v = corteVao(segs, W); if (!v) return msg('Sem espaço livre na faixa.'); salva(); const s = { id: id++, a: v[0], b: Math.min(v[1], v[0] + Math.min(10, v[1] - v[0])), task: padrao }; segs.push(s); sel = s.id; draw(); };
      const apagar = (i) => { salva(); const k = segs.findIndex(s => String(s.id) === String(i)); if (k >= 0) segs.splice(k, 1); if (sel == i) sel = segs[0]?.id ?? null; draw(); };
      const desfazer = () => { const h = hist.pop(); if (!h) return msg('Nada para desfazer.'); const o = JSON.parse(h); segs.length = 0; o.segs.forEach(s => segs.push(s)); sel = o.sel; draw(); };
      const auto = () => { salva(); segs.length = 0; const t = blocos.filter(b => !b.pausa && !/loginwindow/i.test(b.app)).sort((x, y) => x.a - y.a)[0]; if (t) { const s = { id: id++, a: Math.max(0, Math.round(t.a)), b: W, task: padrao }; if (s.b > s.a) { const g = sug(s); if (g) s.task = g.key; segs.push(s); sel = s.id; } } msg(t ? `Sugestão: do primeiro app de trabalho (${hm(Math.max(0, Math.round(t.a)))}) até o fim.` : 'Não achei atividade de trabalho nesse intervalo.'); draw(); };
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]'), del = e.target.closest('[data-del]');
        if (del) return apagar(del.dataset.del);
        if (b) {
          const x = b.dataset.x;
          if (x === 'cr-x' || x === 'cr-no') return l.close();
          if (x === 'cr-cut') return cortar(); if (x === 'cr-add') return novo(); if (x === 'cr-auto') return auto(); if (x === 'cr-undo') return desfazer();
          if (x === 'cr-ok') {
            if (!segs.some(s => s.task)) return toast('Escolha uma tarefa em pelo menos um trecho, ou use "Não computar".');
            const r = corteSalvar({ origemId, from, to, segs, W, tudo }); if (!r.ok) return toast(r.erro, { ms: 8000 });
            l.close(); toast(`Computado ${fmtDur(r.ms)} em ${r.n} trecho(s)`); render(); return;
          }
        }
        const row = e.target.closest('[data-row]'); if (row && e.target.tagName !== 'SELECT') { sel = +row.dataset.row; draw(); }
      });
      box.addEventListener('change', (e) => { const s = e.target.matches('[data-sid]') && porId(e.target.dataset.sid); if (s) { salva(); s.task = e.target.value; draw(); } });
      const tecla = (e) => {
        if (topLayer() !== l) return;
        const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
        const k = (e.key || '').toLowerCase(), s = porId(sel);
        if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); e.stopImmediatePropagation(); return desfazer(); }
        if (e.metaKey || e.ctrlKey) return;
        if (k === 'c') { e.preventDefault(); cortar(); }
        else if (k === 'n') { e.preventDefault(); novo(); }
        else if (k === 's') { e.preventDefault(); auto(); }
        else if ((k === 'delete' || k === 'backspace') && s) { e.preventDefault(); apagar(s.id); }
        else if ((k === 'arrowleft' || k === 'arrowright') && s) {
          e.preventDefault(); const d = k === 'arrowleft' ? -1 : 1, [lo, hi] = corteLivre(segs, (s.a + s.b) / 2, W, s); salva();
          if (e.shiftKey) s.b = Math.max(s.a + 1, Math.min(hi, s.b + d)); else { const len = s.b - s.a, na = Math.max(lo, Math.min(hi - len, s.a + d)); s.a = na; s.b = na + len; }
          draw();
        }
      };
      document.addEventListener('keydown', tecla, true); l.onClose = () => document.removeEventListener('keydown', tecla, true);
      draw(); msg(segs.length ? 'Passe o mouse na faixa para ver o app de cada minuto.' : 'Arraste na faixa para criar o primeiro trecho.');
    },
  });
  return ly;
}
/* Abre o corte sobre a sessão ativa/aberta: os trechos de trabalho dela viram trechos editáveis. */
ACTIONS['corte-sessao'] = (el) => {
  const e = db.get('tempo_time_entries', el?.dataset?.id) || activeEntry(); if (!e) return;
  const segs = (e.segments || []).filter(s => s.s); if (!segs.length) return toast('Essa sessão ainda não tem tempo registrado.');
  const from = Math.min(...segs.map(s => new Date(s.s).getTime())), to = Math.max(...segs.map(s => s.e ? new Date(s.e).getTime() : Date.now()));
  const f0 = Math.floor(from / CORTE_MIN) * CORTE_MIN;
  const key = corteKeyOf(e);
  openCorte({ from, to, origemId: e.id, titulo: 'Ajustar tempo da sessão', tudo: true,
    inicial: segs.map(s => ({ a: (new Date(s.s) - f0) / CORTE_MIN, b: ((s.e ? new Date(s.e).getTime() : Date.now()) - f0) / CORTE_MIN, task: key })).filter(s => s.b - s.a >= 1) });
};
