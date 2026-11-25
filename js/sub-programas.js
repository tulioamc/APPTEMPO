/* Subtarefas por programa (25/11).
   Na janelinha de uma subtarefa você escolhe os programas/sites dela (ex.: "Preparar telas" = Photoshop e Illustrator;
   "Animar 2D" = After Effects; "Gerar IA" = Chrome › Magnific; "Reunião" = Meet).
   Na janelinha da tarefa mãe aparece a sugestão: o tempo das sessões da tarefa (ou do projeto, sem tarefa) gasto nesses
   programas. Nada é movido sozinho: só quando você aceita, o tempo sai da sessão e vira uma sessão da subtarefa.
   Guardado em tempo_settings: 'subProgs' = { subtarefaId: [nomes] } e 'subProgIgn' = { subtarefaId: [sessãoId…] }. */
const subProgsDe = (tid) => ((db.setting('subProgs', {}) || {})[tid] || []).filter(Boolean);
/* Nomes com que um registro de atividade pode ser reconhecido: programa do cadastro, nome curto e site do Chrome. */
function subNomesDoRec(r) {
  const out = new Set();
  const add = (x) => { if (x) out.add(String(x).trim().toLowerCase()); };
  try { add(programFor(r.app)?.name); add(shortProgram(r.app)); add(toolName(r)); add(r.app); } catch (e) { add(r.app); }
  return out;
}
function subCasa(r, progs) {
  const nomes = subNomesDoRec(r);
  return progs.some(p => { const q = String(p).trim().toLowerCase(); if (!q) return false; for (const n of nomes) if (n === q || n.includes(q)) return true; return false; });
}
/* Sessões de onde o tempo pode sair: as da tarefa mãe e as do projeto sem tarefa (encerradas). */
function subSessoesDe(parent) {
  return db.all('tempo_time_entries').filter(e => e.project_id === parent.project_id && e.state === 'done' && (e.task_id === parent.id || !e.task_id));
}
/* Sugestões da tarefa mãe: para cada subtarefa com programas, quanto tempo (e de quais sessões) casa com eles. */
function subSugestoes(parent) {
  if (typeof actList !== 'function') return [];
  const subs = subtasksOf(parent.id).filter(s => subProgsDe(s.id).length);
  if (!subs.length) return [];
  const ign = db.setting('subProgIgn', {}) || {};
  const sess = subSessoesDe(parent);
  const recsPor = new Map(sess.map(e => [e.id, actList(e.id)]));
  const ja = new Set();   // um mesmo trecho não vai para duas subtarefas: a primeira da lista ganha
  return subs.map(sub => {
    const progs = subProgsDe(sub.id); const ignorar = new Set(ign[sub.id] || []);
    const porSessao = [];
    sess.forEach(e => {
      if (ignorar.has(e.id)) return;
      const recs = (recsPor.get(e.id) || []).filter(r => subCasa(r, progs) && !ja.has(e.id + '|' + r.from));
      if (!recs.length) return;
      recs.forEach(r => ja.add(e.id + '|' + r.from));
      const cuts = actMergeIntervals(recs.map(r => ({ a: new Date(r.from).getTime(), b: new Date(r.to).getTime() })).filter(c => c.b > c.a));
      const segs = actIntersect(e.segments || [], cuts, Date.now());
      const ms = segs.reduce((t, s) => t + (new Date(s.e) - new Date(s.s)), 0);
      if (ms >= 60e3) porSessao.push({ e, cuts, ms });
    });
    return { sub, progs, porSessao, ms: porSessao.reduce((t, x) => t + x.ms, 0) };
  }).filter(x => x.ms >= 60e3);
}
/* Move os trechos (cuts) de uma sessão para uma sessão nova da subtarefa. */
function subMover(e, cuts, sub) {
  const moved = actIntersect(e.segments || [], cuts, Date.now()); if (!moved.length) return 0;
  const p = db.get('tempo_projects', sub.project_id); if (!p) return 0;
  const c = clientOf(p);
  const rest = actSubtract(e.segments || [], cuts, p.id);
  const why = `Tempo de ${subProgsDe(sub.id).join(', ')} movido para a subtarefa ${sub.name}`;
  if (!rest.length) db.remove('tempo_time_entries', e.id, true);
  else db.update('tempo_time_entries', e.id, { segments: rest, edits: [...(e.edits || []), { at: nowISO(), reason: why, before: e.segments }] }, true);
  moved.forEach((x, i) => { if (i < moved.length - 1 && new Date(moved[i + 1].s) > new Date(x.e)) { x.why = 'moved'; x.movedFrom = e.project_id; } });
  db.insert('tempo_time_entries', {
    project_id: p.id, client_id: c?.id || null, agency_id: c?.agency_id || null, task_id: sub.id,
    work_type_id: e.work_type_id || lastWorkType(p.id), revision_id: null, notes: `Por programa (${subProgsDe(sub.id).join(', ')})`,
    state: 'done', segments: moved, edits: [{ at: nowISO(), reason: why, before: e.segments }],
  }, true);
  return moved.reduce((t, s) => t + (new Date(s.e) - new Date(s.s)), 0);
}
/* Opções para escolher: programas do cadastro e o que já apareceu nas sessões deste projeto. */
function subOpcoes(projectId) {
  const set = new Set((typeof programas === 'function' ? programas() : []).map(p => p.name));
  if (typeof actList === 'function') db.all('tempo_time_entries').filter(e => e.project_id === projectId).slice(-40).forEach(e => actList(e.id).forEach(r => { try { const n = toolName(r); if (n) set.add(n); } catch (er) {} }));
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/* Janelinha da subtarefa: os programas dela (chips com ×) e uma lista para acrescentar. */
function subProgsHTML(sub) {
  const ps = subProgsDe(sub.id);
  const ops = subOpcoes(sub.project_id).filter(o => !ps.includes(o));
  return `<div class="tk-op tk-op-prog"><span class="tk-op-l" data-tip="O tempo nesses programas, nas sessões da tarefa, vira sugestão para esta subtarefa (só entra se você aceitar)">Programas</span><span class="tk-op-c sp-chips">${ps.map(n => `<span class="sp-chip">${esc(n)}<button type="button" data-act="sp-tira" data-id="${sub.id}" data-n="${esc(n)}" aria-label="Tirar ${esc(n)}" title="Tirar ${esc(n)} desta subtarefa">×</button></span>`).join('')}<select class="sp-add" data-on="sp-add" data-id="${sub.id}" aria-label="Acrescentar programa ou site" title="Programas e sites desta subtarefa"><option value="">+ programa ou site</option>${ops.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></span></div>`;
}
/* Janelinha da tarefa mãe: as sugestões, uma por subtarefa, com Aceitar e Ignorar. */
function subSugestoesHTML(parent) {
  const sg = subSugestoes(parent); if (!sg.length) return '';
  return `<div class="sp-sug"><div class="sp-sug-h"><span class="tk-op-l">Sugestão por programa</span><span class="small muted">só entra se você aceitar</span></div>${sg.map(x => `<div class="sp-sug-l"><div class="sp-sug-t"><b>${esc(x.sub.name)}</b><span class="small muted">${esc(x.progs.join(', '))} · ${x.porSessao.length} ${x.porSessao.length === 1 ? 'sessão' : 'sessões'}</span></div><span class="mono sp-sug-v" data-tip="${esc(`Tempo nesses programas\n${x.porSessao.map(s => `${fmtDate(ymd(new Date(entryStart(s.e))))}: ${fmtDur(s.ms)}`).join('\n')}`)}">${fmtDur(x.ms)}</span><button class="btn sm primary" data-act="sp-aceita" data-id="${parent.id}" data-sub="${x.sub.id}" title="Move esse tempo para a subtarefa ${esc(x.sub.name)}">Aceitar</button><button class="btn sm ghost" data-act="sp-ignora" data-id="${parent.id}" data-sub="${x.sub.id}" title="Não sugerir de novo o tempo destas sessões">Ignorar</button></div>`).join('')}</div>`;
}
/* Total sugerido (para o pontinho na seta da tarefa). */
const subSugTotal = (parent) => { try { return subSugestoes(parent).reduce((t, x) => t + x.ms, 0); } catch (e) { return 0; } };

CHANGES['sp-add'] = (el) => {
  const v = el.value; if (!v) return;
  const m = { ...(db.setting('subProgs', {}) || {}) }; const l = m[el.dataset.id] || [];
  if (!l.includes(v)) m[el.dataset.id] = [...l, v];
  db.setSetting('subProgs', m); db.emit();
};
ACTIONS['sp-tira'] = (el) => {
  const m = { ...(db.setting('subProgs', {}) || {}) }; m[el.dataset.id] = (m[el.dataset.id] || []).filter(x => x !== el.dataset.n);
  db.setSetting('subProgs', m); db.emit();
};
ACTIONS['sp-aceita'] = (el) => {
  const parent = db.get('tempo_tasks', el.dataset.id); if (!parent) return;
  const x = subSugestoes(parent).find(y => y.sub.id === el.dataset.sub); if (!x) return;
  const total = x.porSessao.reduce((t, s) => t + subMover(db.get('tempo_time_entries', s.e.id) || s.e, s.cuts, x.sub), 0);
  if (typeof repairMovedGaps === 'function') repairMovedGaps(3);
  db.emit(); toast(`${fmtDur(total)} foram para ${x.sub.name}`);
};
ACTIONS['sp-ignora'] = (el) => {
  const parent = db.get('tempo_tasks', el.dataset.id); if (!parent) return;
  const x = subSugestoes(parent).find(y => y.sub.id === el.dataset.sub); if (!x) return;
  const m = { ...(db.setting('subProgIgn', {}) || {}) }; m[x.sub.id] = [...new Set([...(m[x.sub.id] || []), ...x.porSessao.map(s => s.e.id)])];
  db.setSetting('subProgIgn', m); db.emit(); toast('Não vou sugerir de novo essas sessões');
};
