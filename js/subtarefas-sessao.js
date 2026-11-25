/* Subtarefas dentro da sessão (25/11).
   Seção "Subtarefas" no formulário da sessão (antes das Notas). Três jeitos de dizer em que subtarefa o tempo foi:
   1) bandeirinha "Terminei uma etapa" (qual terminei e qual é a próxima; a próxima fica como "etapa atual");
   2) arrastar um trecho na barra "Por subtarefa" e escolher a subtarefa;
   3) escolher um programa e a subtarefa ("Photoshop › Preparar telas"), com ou sem trecho marcado.
   O tempo sempre sai de onde estava e entra na sessão da subtarefa (um horário, uma sessão); dá para pintar de novo por cima
   e devolver para "Sem subtarefa". Cada ação devolve um "Desfazer" próprio (funciona também com a sessão rodando).
   Guardado em tempo_settings: 'etapaAtual' = { sessãoId: subtarefaId } e 'sbJanela' = { sessãoId: [início, fim] } (o começo e o
   fim da sessão como eram antes de levar trechos para as subtarefas, para a barra continuar mostrando a sessão inteira). */
const SB_T = (x) => new Date(x).getTime();
const SB_SEM = '#C3C9D6';
const SB_FORA = '#94A3B8';
let SB = null;   // { key, ranges: [{a,b}], drag, dragging, start, moveu, app, dest, novo, criando, lembrar }
const sbReset = () => { SB = null; };
function sbEstado(key) {
  if (!SB || SB.key !== key) SB = { key, ranges: [], drag: null, dragging: false, start: 0, moveu: false, app: '', dest: '', novo: '', criando: false, lembrar: false };
  return SB;
}

/* Sessões que dividem o tempo da tarefa mãe: a sessão, as das subtarefas e as da própria tarefa, no mesmo projeto. */
function sbGrupo(e, mae) {
  const ids = new Set([mae.id, ...subtasksOf(mae.id).map(s => s.id)]);
  return db.all('tempo_time_entries').filter(x => x.id === e.id || (x.project_id === e.project_id && ids.has(x.task_id)));
}
/* Pedaços de cada sessão do grupo que caem nos cortes e ainda não estão na tarefa de destino. */
function sbPecas(grupo, cuts, destTaskId, now = Date.now()) {
  return grupo.filter(x => x.task_id !== destTaskId).map(x => ({ x, pcs: actIntersect(x.segments || [], cuts, now) })).filter(o => o.pcs.length);
}
const sbMs = (pcs) => pcs.reduce((t, p) => t + (SB_T(p.e) - SB_T(p.s)), 0);
/* Intervalos em ordem, juntando os que se encostam (até 1 s). O motivo/destino que vale é o do último de cada bloco. */
function sbNormaliza(segs) {
  const l = segs.filter(s => s.s).slice().sort((p, q) => (p.e === null ? 1 : 0) - (q.e === null ? 1 : 0) || SB_T(p.s) - SB_T(q.s));
  const out = [];
  l.forEach(s => {
    const u = out[out.length - 1];
    if (u && u.e && SB_T(s.s) - SB_T(u.e) <= 1000) {
      u.e = s.e;
      if (s.why) { u.why = s.why; if (s.movedTo) u.movedTo = s.movedTo; else delete u.movedTo; } else { delete u.why; delete u.movedTo; }
    } else out.push({ ...s });
  });
  return out;
}
/* Acha a subtarefa pelo nome (sem ligar para maiúsculas) ou cria. */
function sbSubDe(mae, nome) {
  nome = String(nome || '').trim(); if (!nome) return null;
  const subs = subtasksOf(mae.id);
  return subs.find(s => s.name.trim().toLowerCase() === nome.toLowerCase())
    || db.insert('tempo_tasks', { project_id: mae.project_id, parent_id: mae.id, name: nome, status_id: mae.status_id, status_inherited: true, deadline: null, notes: 'Criada na sessão', order: subs.length, work_type_id: null, owner: mae.owner || null }, true);
}

/* O motor: leva o tempo dos cortes (ms) para a tarefa de destino, saindo de onde estava. Devolve { ms, desfazer } ou null. */
function sbPintar(e, cuts, destTaskId, rotulo) {
  const mae = etapaMae(e); if (!mae || !destTaskId) return null;
  const now = Date.now();
  cuts = actMergeIntervals((cuts || []).map(c => ({ a: c.a, b: Math.min(c.b, now) })).filter(c => c.b - c.a >= 1000));
  if (!cuts.length) return null;
  const c0 = cuts[0].a, c1 = cuts[cuts.length - 1].b;
  const grupo = sbGrupo(e, mae).filter(x => x.id === e.id || (x.segments || []).some(s => s.s && SB_T(s.s) < c1 && (s.e ? SB_T(s.e) : now) > c0));
  const pecas = sbPecas(grupo, cuts, destTaskId, now);
  if (!pecas.length) return null;
  const antes = new Map(grupo.map(x => [x.id, JSON.parse(JSON.stringify(x))]));
  const criados = []; const todos = [];
  sbGuardaJanela(e);
  pecas.forEach(({ x, pcs }) => {
    todos.push(...pcs);
    const rest = actSubtract(x.segments || [], cuts, e.project_id);
    const edits = auditEdit(x, x.segments, rotulo);
    if (!rest.length && x.state !== 'running') db.remove('tempo_time_entries', x.id, true);
    else db.update('tempo_time_entries', x.id, { segments: rest.length ? rest : [{ s: nowISO(), e: null }], edits }, true);
  });
  todos.sort((p, q) => SB_T(p.s) - SB_T(q.s));
  const eAtual = db.get('tempo_time_entries', e.id);
  if (e.task_id === destTaskId && eAtual) {
    db.update('tempo_time_entries', e.id, { segments: sbNormaliza([...(eAtual.segments || []), ...todos]), edits: auditEdit(eAtual, eAtual.segments, rotulo) }, true);
  } else {
    const pcs = sbNormaliza(todos);
    pcs.forEach((p, i) => { if (i < pcs.length - 1 && SB_T(pcs[i + 1].s) > SB_T(p.e)) { p.why = 'moved'; p.movedFrom = e.project_id; } });
    const proj = db.get('tempo_projects', e.project_id); const c = proj ? clientOf(proj) : null;
    const ini = pcs[0].s, fim = pcs[pcs.length - 1].e;
    criados.push(db.insert('tempo_time_entries', {
      project_id: e.project_id, client_id: c?.id || e.client_id || null, agency_id: c?.agency_id || e.agency_id || null, task_id: destTaskId,
      work_type_id: e.work_type_id || lastWorkType(e.project_id), revision_id: null,
      notes: `Movido de outra sessão (${fmtTime(ini)}–${fmtTime(fim)})`, state: 'done', segments: pcs,
      edits: [{ at: nowISO(), reason: rotulo, before: antes.get(e.id)?.segments || [] }],
    }, true).id);
  }
  if (typeof repairMovedGaps === 'function') repairMovedGaps(3);
  db.emit();
  const desfazer = () => {
    criados.forEach(id => db.remove('tempo_time_entries', id, true));
    antes.forEach((row, id) => { const cur = db.get('tempo_time_entries', id); if (cur) db.update('tempo_time_entries', id, { segments: row.segments, edits: row.edits }, true); else db.insert('tempo_time_entries', row, true); });
    db.emit();
  };
  return { ms: sbMs(todos), desfazer };
}

/* ---------- janela da sessão (começo e fim de antes de levar trechos) ---------- */
function sbGuardaJanela(e) {
  const now = Date.now();
  const iv = (e.segments || []).filter(s => s.s).map(s => [SB_T(s.s), s.e ? SB_T(s.e) : now]);
  if (!iv.length) return;
  const m = { ...(db.setting('sbJanela', {}) || {}) }; const v = m[e.id];
  const a = Math.min(...iv.map(x => x[0]), v ? v[0] : Infinity), b = Math.max(...iv.map(x => x[1]), v ? v[1] : 0);
  if (!v || v[0] !== a || v[1] !== b) { m[e.id] = [a, b]; db.setSetting('sbJanela', m); }
}
function sbJanela(e) {
  const now = Date.now();
  const iv = (e.segments || []).filter(s => s.s).map(s => [SB_T(s.s), s.e ? SB_T(s.e) : now]);
  const v = (db.setting('sbJanela', {}) || {})[e.id];
  if (!iv.length && !v) return null;
  const a = Math.min(...iv.map(x => x[0]), v ? v[0] : Infinity);
  const aberto = (e.segments || []).some(s => s.s && !s.e);
  const b = Math.max(...iv.map(x => x[1]), v && !aberto ? v[1] : 0);
  return b > a ? { a, b, span: b - a } : null;
}
/* Pedaços coloridos da barra: cada trecho de sessão do grupo dentro da janela, pela subtarefa ('sem' = a própria tarefa). */
function sbFatias(e, mae, J) {
  const now = Date.now(); const subIds = new Set(subtasksOf(mae.id).map(s => s.id)); const out = [];
  sbGrupo(e, mae).forEach(x => {
    const key = subIds.has(x.task_id) ? x.task_id : 'sem';
    (x.segments || []).forEach(s => { if (!s.s) return; const a = Math.max(SB_T(s.s), J.a), b = Math.min(s.e ? SB_T(s.e) : now, J.b); if (b > a) out.push({ a, b, key, id: x.id }); });
  });
  return out.sort((p, q) => p.a - q.a);
}
/* Tempo da sessão que está em outro projeto (movido ou troca): aparece em cinza, só para a barra fechar. */
function sbForaDe(e, J) {
  const segs = (e.segments || []).filter(s => s.s); const out = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i], n = segs[i + 1];
    if (!isForaWhy(s.why) || !s.e || !n.s || SB_T(n.s) <= SB_T(s.e)) continue;
    if (s.movedTo && s.movedTo === e.project_id) continue;
    const a = Math.max(SB_T(s.e), J.a), b = Math.min(SB_T(n.s), J.b); if (b > a) out.push({ a, b });
  }
  return out;
}
const sbCor = (mae, key) => {
  if (key === 'sem') return SB_SEM;
  const i = subtasksOf(mae.id).findIndex(s => s.id === key);
  return GRAF_CORES[(i < 0 ? 0 : i) % GRAF_CORES.length];
};
const sbNome = (mae, key) => key === 'sem' ? 'Sem subtarefa' : (db.get('tempo_tasks', key)?.name || 'Subtarefa');
const sbHM = (ms) => fmtTime(new Date(ms).toISOString());

/* Programas usados na sessão inteira (inclusive o que já foi para subtarefas): { groups, records } de actAnalyzeList. */
function sbApps(e, mae, J) {
  const lista = sbGrupo(e, mae).filter(x => (x.segments || []).some(s => s.s && SB_T(s.s) < J.b && (s.e ? SB_T(s.e) : Date.now()) > J.a)).flatMap(x => actList(x.id));
  const A = actAnalyzeList(lista, 'program');
  return { groups: A.groups.filter(g => g.id !== 'outros'), records: A.records };
}
function sbAppsDe(a, b) {
  const by = {};
  actPoolBetween(a, b).forEach(r => {
    if (typeof pausaRec === 'function' && pausaRec(r) && !actWaTrabalho(r)) return;
    const x = Math.max(a, SB_T(r.from)), y = Math.min(b, SB_T(r.to)); if (y <= x) return;
    const k = shortProgram(r.app) || r.app; by[k] = (by[k] || 0) + (y - x);
  });
  return Object.entries(by).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k, ms]) => `${k}: ${fmtDur(ms)}`);
}

/* Cortes que valem agora: o programa escolhido (dentro dos trechos marcados, se houver) ou só os trechos marcados. */
function sbCortes(S, A) {
  const rs = S.ranges.map(r => ({ a: r.a, b: r.b }));
  if (!S.app) return rs;
  const iv = actMergeIntervals(A.records.filter(r => r.gid === S.app).map(r => ({ a: SB_T(r.from), b: SB_T(r.to) })).filter(c => c.b > c.a));
  if (!rs.length) return iv;
  const out = [];
  iv.forEach(c => rs.forEach(r => { const a = Math.max(c.a, r.a), b = Math.min(c.b, r.b); if (b > a) out.push({ a, b }); }));
  return actMergeIntervals(out);
}
function sbDestinoId(e, mae, S) {
  if (S.dest === 'sem') return mae.id;
  if (S.dest === '__novo') { const s = (S.novo || '').trim().toLowerCase(); return s ? (subtasksOf(mae.id).find(x => x.name.trim().toLowerCase() === s)?.id || '__criar') : ''; }
  return S.dest || '';
}
/* Prévia do que o botão "Mover" vai fazer. */
function sbPrevia(e, mae, S, A) {
  const cuts = sbCortes(S, A);
  const app = S.app ? A.groups.find(g => g.id === S.app) : null;
  if (!cuts.length) return { ok: false, txt: S.app ? 'Esse programa não tem tempo nos trechos marcados.' : 'Arraste um trecho na barra ou escolha um programa.' };
  const dest = sbDestinoId(e, mae, S);
  if (!dest) return { ok: false, txt: S.dest === '__novo' ? 'Dê um nome para a nova subtarefa.' : 'Escolha a subtarefa.' };
  const nome = S.dest === 'sem' ? 'Sem subtarefa' : S.dest === '__novo' ? (S.novo || '').trim() : sbNome(mae, S.dest);
  const alvo = dest === '__criar' ? '__criar' : dest;
  const pecas = sbPecas(sbGrupo(e, mae), cuts, alvo, Date.now());
  const ms = pecas.reduce((t, o) => t + sbMs(o.pcs), 0);
  if (!ms) return { ok: false, txt: `Nada para mover: esse tempo já está em ${nome}.` };
  const onde = S.ranges.length ? ` (${S.ranges.length === 1 ? sbHM(S.ranges[0].a) + '–' + sbHM(S.ranges[0].b) : S.ranges.length + ' trechos'})` : '';
  return { ok: true, ms, txt: `Vai mover ${fmtDur(ms)}${app ? ' de ' + app.label : ''}${onde} para ${nome}.` };
}

/* ---------- a seção ---------- */
function sbSecaoHTML(e) {
  if (!e) return '';
  const S = sbEstado(e.id);
  const mae = etapaMae(e);
  const cab = (btns) => `<div class="row between sb-head"><span class="lbl">Subtarefas${mae ? ` <span class="faint">de ${esc(mae.name)}</span>` : ''}</span><span class="row" style="gap:6px">${btns || ''}</span></div>`;
  if (!mae) return `<div class="act-sec sb-sec">${cab('')}<div class="small muted">Escolha uma tarefa para esta sessão (botão Alterar, lá em cima) e as subtarefas dela aparecem aqui.</div></div>`;
  const J = sbJanela(e);
  const subs = subtasksOf(mae.id);
  const aberta = e.state !== 'done';
  const atualId = (db.setting('etapaAtual', {}) || {})[e.id];
  const atual = atualId ? subs.find(s => s.id === atualId) : null;
  const btns = `${aberta ? `<button type="button" class="btn sm" data-x="sb-etapa" title="Marca o fim de uma etapa: diz qual terminou e qual é a próxima. O tempo desde a última marca vai para a etapa que terminou.">${icon('flag')} Terminei uma etapa</button>` : ''}<button type="button" class="btn sm" data-x="sb-nova" title="Cria uma subtarefa nova de ${esc(mae.name)} sem mexer no tempo">${icon('plus')} Subtarefa</button>`;
  const criar = S.criando ? `<div class="sb-criar"><input type="text" class="input sm" data-sb="nome" placeholder="Nome da subtarefa" autocomplete="off" aria-label="Nome da nova subtarefa"><button type="button" class="btn sm primary" data-x="sb-criar" title="Criar a subtarefa (Enter)">Criar</button><button type="button" class="btn sm ghost" data-x="sb-nova" title="Cancelar">Cancelar</button></div>` : '';
  const agora = atual && aberta ? `<div class="sb-atual"><span class="small muted">Etapa atual</span><b>${esc(atual.name)}</b><span class="small muted">desde ${fmtTime(etapaInicio(e))}</span></div>` : '';
  if (!J) return `<div class="act-sec sb-sec">${cab(btns)}${criar}${agora}<div class="small muted">A sessão ainda não tem tempo registrado.</div></div>`;

  const fatias = sbFatias(e, mae, J);
  const msPor = {}; fatias.forEach(f => { msPor[f.key] = (msPor[f.key] || 0) + (f.b - f.a); });
  const pct = (t) => (Math.min(Math.max(t, J.a), J.b) - J.a) / J.span * 100;
  let barras = '';
  pauseGapsOf([e]).forEach(g => { const a = SB_T(g.s), b = SB_T(g.e); if (b <= J.a || a >= J.b) return; barras += `<span class="seg-b pausa act-pause" style="--ph:${pauseHatch(g.why)};--pg:${pauseGapOf(pauseHatch(g.why))};left:${pct(a)}%;width:${Math.max(.3, pct(b) - pct(a))}%" data-tip="${esc(`Pausa ${sbHM(a)}–${sbHM(b)} · ${fmtDur(b - a)}`)}"></span>`; });
  sbForaDe(e, J).forEach(f => { barras += `<span class="seg-b sb-fora" style="left:${pct(f.a)}%;width:${Math.max(.3, pct(f.b) - pct(f.a))}%" data-tip="${esc(`Em outro projeto\n${sbHM(f.a)}–${sbHM(f.b)} · ${fmtDur(f.b - f.a)}`)}"></span>`; });
  fatias.forEach(f => {
    const apps = sbAppsDe(f.a, f.b);
    barras += `<span class="seg-b fill act-b sb-b" data-g="${esc(f.key)}" data-a="${Math.round(f.a)}" data-b="${Math.round(f.b)}" style="--tb:${sbCor(mae, f.key)};left:${pct(f.a)}%;width:${Math.max(.3, pct(f.b) - pct(f.a))}%" data-tip="${esc([`${sbNome(mae, f.key)}`, `${sbHM(f.a)}–${sbHM(f.b)} · ${fmtDur(f.b - f.a)}`, ...apps].join('\n'))}"></span>`;
  });
  S.ranges.concat(S.drag ? [S.drag] : []).forEach(r => { const x = pct(r.a), y = pct(r.b); if (y > x) barras += `<span class="res-sel-range" style="left:${x}%;width:${Math.max(.3, y - x)}%"></span>`; });
  const faixa = `<div class="act-strip sb-strip" data-mode="sub" data-ent="${esc(e.id)}" data-t0="${J.a}" data-span="${J.span}" style="position:relative" aria-label="Arraste para marcar um trecho">${barras}</div>`;

  const chip = (key, nome, ms) => `<button type="button" class="act-chip sb-chip${S.dest === key ? ' is-pick' : ''}" data-g="${esc(key)}" data-x="sb-dest" data-k="${esc(key)}" style="--tb:${sbCor(mae, key)}" title="Clique para escolher ${esc(nome)} como destino do trecho"><i></i>${esc(nome)} <span class="faint">${ms ? fmtDur(ms) : '—'}</span></button>`;
  const chips = `<div class="act-chips">${chip('sem', 'Sem subtarefa', msPor.sem || 0)}${subs.map(s => chip(s.id, s.name, msPor[s.id] || 0)).join('')}</div>`;

  const A = sbApps(e, mae, J);
  const opApp = A.groups.map(g => `<option value="${esc(g.id)}"${S.app === g.id ? ' selected' : ''}>${esc(g.label)} · ${fmtDur(g.ms)}</option>`).join('');
  const opDest = `<option value="">Escolha…</option><option value="sem"${S.dest === 'sem' ? ' selected' : ''}>Sem subtarefa</option>${subs.map(s => `<option value="${esc(s.id)}"${S.dest === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__novo"${S.dest === '__novo' ? ' selected' : ''}>+ Nova subtarefa…</option>`;
  const prev = sbPrevia(e, mae, S, A);
  const rangeChips = S.ranges.length
    ? `<div class="sb-sel">${S.ranges.map((r, i) => `<span class="sp-chip">${sbHM(r.a)}–${sbHM(r.b)} · ${fmtDur(r.b - r.a)}<button type="button" data-x="sb-rm" data-i="${i}" aria-label="Tirar este trecho" title="Tirar este trecho da marcação">×</button></span>`).join('')}<button type="button" class="btn sm ghost" data-x="sb-limpar" title="Desmarcar todos os trechos">Limpar</button></div>`
    : `<div class="small muted sb-dica">Arraste na barra para marcar um trecho (clicar num pedaço marca ele inteiro; Shift soma outro trecho).</div>`;
  const appSel = S.app ? A.groups.find(g => g.id === S.app) : null;
  const lembrar = appSel && S.dest && S.dest !== 'sem' && S.dest !== '__novo'
    ? `<label class="sb-lembrar" title="Nas próximas sessões, o tempo em ${esc(appSel.label)} aparece como sugestão para esta subtarefa (só entra se você aceitar)"><input type="checkbox" data-sb="lembrar"${S.lembrar ? ' checked' : ''}> Lembrar: ${esc(appSel.label)} costuma ser ${esc(sbNome(mae, S.dest))}</label>` : '';
  const form = `<div class="sb-assign">${rangeChips}
    <div class="sb-row">
      <label class="sb-f"><span class="small muted">Programa</span><select class="input sm" data-sb="app" aria-label="Só o tempo deste programa" title="Escolha um programa para levar só o tempo dele (dentro do trecho marcado, se houver)"><option value="">Todos os programas</option>${opApp}</select></label>
      <span class="sb-seta" aria-hidden="true">›</span>
      <label class="sb-f"><span class="small muted">Subtarefa</span><select class="input sm" data-sb="dest" aria-label="Subtarefa de destino" title="Para onde vai o tempo">${opDest}</select></label>
      ${S.dest === '__novo' ? `<label class="sb-f"><span class="small muted">Nome</span><input type="text" class="input sm" data-sb="novo" value="${esc(S.novo)}" placeholder="Ex.: Animar Cena 01" autocomplete="off" aria-label="Nome da nova subtarefa"></label>` : ''}
      <button type="button" class="btn sm primary sb-mover" data-x="sb-mover" ${prev.ok ? '' : 'disabled'} title="Leva o tempo para a subtarefa escolhida. Dá para desfazer logo depois.">Mover</button>
    </div>${lembrar}<div class="small sb-previa ${prev.ok ? '' : 'muted'}">${esc(prev.txt)}</div></div>`;
  return `<div class="act-sec sb-sec">${cab(btns)}${criar}${agora}${faixa}${chips}${form}</div>`;
}

/* Redesenha só a seção (arrastar, escolher): o resto do formulário não se mexe. */
function sbRefresh() {
  const sec = document.querySelector('.sb-sec'); if (!sec || !SB) return;
  const e = db.get('tempo_time_entries', SB.key); if (!e) return;
  const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.sb : null;
  sec.outerHTML = sbSecaoHTML(e);
  if (foco === 'novo' || foco === 'nome') { const el = document.querySelector(`.sb-sec [data-sb="${foco}"]`); if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; } }
}
/* Só a prévia e o botão (digitando o nome da subtarefa nova): não mexe nos campos. */
function sbPreviaDom() {
  const sec = document.querySelector('.sb-sec'); if (!sec || !SB) return;
  const e = db.get('tempo_time_entries', SB.key); if (!e) return; const mae = etapaMae(e), J = mae && sbJanela(e); if (!J) return;
  const p = sbPrevia(e, mae, SB, sbApps(e, mae, J));
  const t = sec.querySelector('.sb-previa'); if (t) { t.textContent = p.txt; t.classList.toggle('muted', !p.ok); }
  const b = sec.querySelector('.sb-mover'); if (b) b.disabled = !p.ok;
}

/* ---------- arrastar na barra ---------- */
function sbStripTime(st, x) { const r = st.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (x - r.left) / (r.width || 1))); return +st.dataset.t0 + p * +st.dataset.span; }
function sbRangesAdd(ranges, d) {
  const out = ranges.map(r => ({ ...r })).sort((p, q) => p.a - q.a); const hit = out.filter(r => r.a < d.b && d.a < r.b);
  if (!hit.length) return [...out, { ...d }].sort((p, q) => p.a - q.a);
  const a = Math.min(d.a, ...hit.map(r => r.a)), b = Math.max(d.b, ...hit.map(r => r.b));
  return out.filter(r => !hit.includes(r)).concat([{ a, b }]).sort((p, q) => p.a - q.a);
}
document.addEventListener('mousedown', (ev) => {
  if (ev.button !== 0) return;
  const st = ev.target.closest?.('.sb-strip'); if (!st) return;
  const S = sbEstado(st.dataset.ent); ev.preventDefault();
  const t = sbStripTime(st, ev.clientX);
  S.dragging = true; S.moveu = false; S.start = t; S.x0 = ev.clientX; S.shift = ev.shiftKey; S.drag = null;
  S.pedaco = ev.target.closest('.sb-b') || null;
});
document.addEventListener('mousemove', (ev) => {
  if (!SB || !SB.dragging) return;
  const st = document.querySelector(`.sb-strip[data-ent="${SB.key}"]`); if (!st) return;
  if (!SB.moveu && Math.abs(ev.clientX - SB.x0) < 4) return;
  SB.moveu = true;
  const t = sbStripTime(st, ev.clientX); SB.drag = { a: Math.min(SB.start, t), b: Math.max(SB.start, t) };
  let ov = st.querySelector('.sb-drag'); if (!ov) { ov = document.createElement('span'); ov.className = 'res-sel-range sb-drag'; st.appendChild(ov); }
  const t0 = +st.dataset.t0, span = +st.dataset.span;
  ov.style.left = ((SB.drag.a - t0) / span * 100) + '%'; ov.style.width = Math.max(.3, (SB.drag.b - SB.drag.a) / span * 100) + '%';
});
document.addEventListener('mouseup', (ev) => {
  if (!SB || !SB.dragging) return;
  const S = SB; S.dragging = false;
  const st = document.querySelector(`.sb-strip[data-ent="${S.key}"]`);
  const d = S.drag; S.drag = null;
  if (d && d.b - d.a >= 60e3) S.ranges = S.shift ? sbRangesAdd(S.ranges, d) : [{ ...d }];
  else if (!S.moveu && st && S.pedaco) {   // clique num pedaço colorido: marca o pedaço todo
    const r = { a: +S.pedaco.dataset.a, b: +S.pedaco.dataset.b };
    if (r.b > r.a) S.ranges = S.shift ? sbRangesAdd(S.ranges, r) : [r];
  }
  S.pedaco = null;
  sbRefresh();
});

/* ---------- cliques e campos (ligados pelo formulário da sessão) ---------- */
/* ctx: { e (sessão), refresh() → redesenha o formulário inteiro depois de mexer nos dados }. Devolve true se tratou. */
function sbClick(ev, ctx) {
  const b = ev.target.closest?.('[data-x^="sb-"]'); if (!b) return false;
  const x = b.dataset.x, e = ctx.e, S = sbEstado(e.id), mae = etapaMae(e);
  if (x === 'sb-etapa') { ACTIONS['etapa-fim']({ dataset: { id: e.id } }); return true; }
  if (x === 'sb-dest') { S.dest = S.dest === b.dataset.k ? '' : b.dataset.k; sbRefresh(); return true; }
  if (x === 'sb-rm') { S.ranges.splice(Number(b.dataset.i), 1); sbRefresh(); return true; }
  if (x === 'sb-limpar') { S.ranges = []; S.app = ''; sbRefresh(); return true; }
  if (x === 'sb-nova') { S.criando = !S.criando; sbRefresh(); const i = document.querySelector('.sb-sec [data-sb="nome"]'); if (i) i.focus(); return true; }
  if (x === 'sb-criar') { sbCriar(e); return true; }
  if (x === 'sb-mover') { sbMover(ctx); return true; }
  return false;
}
function sbCriar(e) {
  const S = sbEstado(e.id), mae = etapaMae(e); if (!mae) return;
  const nome = (document.querySelector('.sb-sec [data-sb="nome"]')?.value || '').trim();
  if (!nome) { toast('Dê um nome para a subtarefa'); return; }
  const jaTinha = subtasksOf(mae.id).some(s => s.name.trim().toLowerCase() === nome.toLowerCase());
  const s = sbSubDe(mae, nome); S.criando = false; S.dest = s.id; db.emit(); sbRefresh();
  toast(jaTinha ? `“${esc(s.name)}” já existia: escolhida como destino` : `Subtarefa “${esc(s.name)}” criada`);
}
function sbChange(ev, ctx) {
  const el = ev.target; const k = el.dataset && el.dataset.sb; if (!k || !ctx.e) return false;
  const S = sbEstado(ctx.e.id);
  if (k === 'app') { S.app = el.value; sbRefresh(); }
  else if (k === 'dest') { S.dest = el.value; sbRefresh(); }
  else if (k === 'novo') { S.novo = el.value; sbPreviaDom(); }
  else if (k === 'lembrar') S.lembrar = !!el.checked;
  else return false;
  return true;
}
function sbInput(ev, ctx) {
  const el = ev.target; if (!el.dataset || el.dataset.sb !== 'novo' || !ctx.e) return false;
  sbEstado(ctx.e.id).novo = el.value; sbPreviaDom(); return true;
}
function sbTecla(ev, ctx) {
  if (ev.key !== 'Enter') return false;
  const el = ev.target; if (!el.dataset) return false;
  if (el.dataset.sb === 'nome') { ev.preventDefault(); sbCriar(ctx.e); return true; }
  if (el.dataset.sb === 'novo') { ev.preventDefault(); sbMover(ctx); return true; }
  return false;
}
function sbMover(ctx) {
  const e = db.get('tempo_time_entries', ctx.e.id); if (!e) return;
  const S = sbEstado(e.id), mae = etapaMae(e), J = mae && sbJanela(e); if (!J) return;
  const A = sbApps(e, mae, J); const p = sbPrevia(e, mae, S, A);
  if (!p.ok) { toast(p.txt); return; }
  let dest = sbDestinoId(e, mae, S);
  if (dest === '__criar') dest = sbSubDe(mae, S.novo).id;
  const app = S.app ? A.groups.find(g => g.id === S.app) : null;
  const nome = dest === mae.id ? 'Sem subtarefa' : db.get('tempo_tasks', dest)?.name;
  const cuts = sbCortes(S, A);
  const r = sbPintar(e, cuts, dest, `${app ? app.label + ' › ' : ''}${nome}: ${fmtDur(p.ms)} levados para a subtarefa`);
  if (!r) { toast('Nada para mover'); return; }
  if (S.lembrar && app && dest !== mae.id) { const m = { ...(db.setting('subProgs', {}) || {}) }; const l = m[dest] || []; if (!l.includes(app.label)) { m[dest] = [...l, app.label]; db.setSetting('subProgs', m); } }
  S.ranges = []; S.app = ''; S.novo = ''; S.dest = dest === mae.id ? 'sem' : dest; S.lembrar = false;
  ctx.refresh();
  toast(`${fmtDur(r.ms)} foram para ${nome}`, { ms: 9000, actions: [{ label: 'Desfazer', run: () => { r.desfazer(); ctx.refresh(); toast('Desfeito'); } }] });
}

/* ---------- etapa atual e fim da sessão ---------- */
function sbEtapaAtual(entryId) { const id = (db.setting('etapaAtual', {}) || {})[entryId]; return id ? db.get('tempo_tasks', id) : null; }
function sbGuardaEtapaAtual(entryId, subId) {
  const m = { ...(db.setting('etapaAtual', {}) || {}) };
  if (subId) m[entryId] = subId; else delete m[entryId];
  db.setSetting('etapaAtual', m);
}
/* Ao encerrar: a etapa que estava rodando fecha sozinha, até o fim da sessão (com "Desfazer"). */
function etapaFechaAoEncerrar(entryId) {
  const sub = sbEtapaAtual(entryId); const e = db.get('tempo_time_entries', entryId);
  if (!sub || !e || e.state !== 'done') return null;
  const ini = SB_T(etapaInicio(e)), fim = SB_T(entryEnd(e) || Date.now());
  sbGuardaEtapaAtual(entryId, null);
  if (fim - ini < 60e3) return null;
  const r = sbPintar(e, [{ a: ini, b: fim }], sub.id, `Etapa “${sub.name}” fechada ao encerrar a sessão`);
  if (r) toast(`Etapa “${esc(sub.name)}”: ${fmtDur(r.ms)}`, { ms: 9000, actions: [{ label: 'Desfazer', run: () => { r.desfazer(); toast('Desfeito'); } }] });
  return r;
}
