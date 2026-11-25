/* Subtarefas por programa (25/11).
   Na janelinha de uma subtarefa você escolhe os programas/sites dela (ex.: "Preparar telas" = Photoshop e Illustrator;
   "Animar 2D" = After Effects; "Gerar IA" = Chrome › Magnific; "Reunião" = Meet).
   Na janelinha da tarefa mãe aparece a sugestão: o tempo das sessões da tarefa (ou do projeto, sem tarefa) gasto nesses
   programas. Nada é movido sozinho: só quando você aceita, o tempo sai da sessão e vira uma sessão da subtarefa.
   Guardado em tempo_settings: 'subProgs' = { subtarefaId: [nomes] } e 'subProgIgn' = { subtarefaId: [sessãoId…] }. */
/* Regras de sempre (25/11): tudo do Pinterest vai para "Procura de referência" e tudo do Magnific para "Geração de Imagem IA".
   Valem em qualquer tarefa que tenha uma subtarefa com esse nome; dá para tirar o site (×) ou associá-lo a outra subtarefa. */
const SUB_REGRAS = [{ sub: 'Procura de referência', progs: ['Pinterest'] }, { sub: 'Geração de Imagem IA', progs: ['Magnific'] }];
const subNorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
/* Chave para achar o mesmo programa com nomes diferentes: "Adobe Photoshop (Beta)" = "Photoshop"; "Adobe Illustrator 2027 (Beta)" = "Illustrator". */
const subChave = (s) => subNorm(s).replace(/\((beta|[^)]*beta[^)]*)\)/g, ' ').replace(/\badobe\b/g, ' ').replace(/\b(19|20)\d\d\b/g, ' ').replace(/\bcc\b/g, ' ').replace(/\s+/g, ' ').trim();
const subMesmo = (a, b) => { const x = subChave(a), y = subChave(b); return !!x && !!y && (x === y); };
const subRegraDoNome = (prog) => SUB_REGRAS.find(r => r.progs.some(p => subNorm(p) === subNorm(prog))) || null;
function subProgsPadrao(tid) {
  const t = db.get('tempo_tasks', tid); if (!t || !t.parent_id) return [];
  const r = SUB_REGRAS.find(x => subNorm(x.sub) === subNorm(t.name)); if (!r) return [];
  const m = db.setting('subProgs', {}) || {}; const tira = (db.setting('subProgsTira', {}) || {})[tid] || [];
  const irmaos = db.all('tempo_tasks').filter(x => x.parent_id === t.parent_id);
  return r.progs.filter(p => !tira.some(n => subNorm(n) === subNorm(p)) && !irmaos.some(x => (m[x.id] || []).some(n => subNorm(n) === subNorm(p))));
}
const subProgsDe = (tid) => { const g = ((db.setting('subProgs', {}) || {})[tid] || []).filter(Boolean); const pd = subProgsPadrao(tid); return pd.length ? [...g, ...pd] : g; };
/* Tira um programa/site da subtarefa (se era da regra de sempre, guarda que você tirou). */
function subTira(subId, nome) {
  const q = subNorm(nome); const m = { ...(db.setting('subProgs', {}) || {}) };
  m[subId] = (m[subId] || []).filter(x => subNorm(x) !== q); db.setSetting('subProgs', m);
  if (subProgsPadrao(subId).some(p => subNorm(p) === q)) { const t = { ...(db.setting('subProgsTira', {}) || {}) }; t[subId] = [...(t[subId] || []), nome]; db.setSetting('subProgsTira', t); }
}
/* Nome de um registro como o app mostra em todo lugar: programa do cadastro (Photoshop), site do Chrome ou conversa do WhatsApp. */
function subCanon(r) {
  try { if (/whatsapp/i.test(String(r.app || '')) || isChromeSite(r.app, r.doc)) return toolName(r); return shortProgram(r.app) || r.app; } catch (e) { return r.app; }
}
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
  const g = subOpcoesGrupos(projectId); return [...g.programas, ...g.sites];
}
/* Programas e sites separados, sem repetidos (Photoshop = Adobe Photoshop (Beta)). */
function subOpcoesGrupos(projectId) {
  const lp = []; const ls = [];
  const add = (lista, n) => { n = String(n || '').trim(); if (n && !lista.some(x => subMesmo(x, n))) lista.push(n); };
  (typeof programas === 'function' ? programas() : []).forEach(p => add(lp, p.name));
  if (typeof CHROME_SITE_NAMES !== 'undefined') CHROME_SITE_NAMES.forEach(n => add(ls, n));
  if (typeof actList === 'function') db.all('tempo_time_entries').filter(e => e.project_id === projectId).slice(-40).forEach(e => actList(e.id).forEach(r => {
    try { const n = subCanon(r); if (typeof isChromeSite === 'function' && isChromeSite(r.app, r.doc)) add(ls, n); else add(lp, n); } catch (er) {}
  }));
  const ord = (a, b) => a.localeCompare(b, 'pt-BR');
  return { programas: lp.sort(ord), sites: ls.sort(ord) };
}
/* <option>s com "Programas" e "Sites" separados, sem o que já está associado. */
function subOpcoesHTML(projectId, jaTem) {
  const g = subOpcoesGrupos(projectId); const livre = (n) => !(jaTem || []).some(x => subMesmo(x, n));
  const op = (n) => `<option value="${esc(n)}">${esc(n)}</option>`;
  const P = g.programas.filter(livre), S = g.sites.filter(livre);
  return `${P.length ? `<optgroup label="Programas">${P.map(op).join('')}</optgroup>` : ''}${S.length ? `<optgroup label="Sites">${S.map(op).join('')}</optgroup>` : ''}`;
}

/* Janelinha da subtarefa: os programas dela (chips com ×) e uma lista para acrescentar. */
function subProgsHTML(sub) {
  const ps = subProgsDe(sub.id);
  return `<div class="tk-op tk-op-prog"><span class="tk-op-l" data-tip="O tempo nesses programas, nas sessões da tarefa, vira sugestão para esta subtarefa (só entra se você aceitar)">Programas</span><span class="tk-op-c sp-chips">${ps.map(n => `<span class="sp-chip">${esc(n)}<button type="button" data-act="sp-tira" data-id="${sub.id}" data-n="${esc(n)}" aria-label="Tirar ${esc(n)}" title="Tirar ${esc(n)} desta subtarefa">×</button></span>`).join('')}<select class="sp-add" data-on="sp-add" data-id="${sub.id}" aria-label="Acrescentar programa ou site" title="Programas e sites desta subtarefa"><option value="">+ programa ou site</option>${subOpcoesHTML(sub.project_id, ps)}</select></span></div>`;
}
/* Janelinha da tarefa mãe: as sugestões, uma por subtarefa, com Aceitar e Ignorar. */
function subSugestoesHTML(parent) {
  return '';   // o programa associado já divide as sessões sozinho (V2.06.170); não há mais "Aceitar" que tira o tempo da sessão
  const sg = subSugestoes(parent); if (!sg.length) return '';
  return `<div class="sp-sug"><div class="sp-sug-h"><span class="tk-op-l">Sugestão por programa</span><span class="small muted">só entra se você aceitar</span></div>${sg.map(x => `<div class="sp-sug-l"><div class="sp-sug-t"><b>${esc(x.sub.name)}</b><span class="small muted">${esc(x.progs.join(', '))} · ${x.porSessao.length} ${x.porSessao.length === 1 ? 'sessão' : 'sessões'}</span></div><span class="mono sp-sug-v" data-tip="${esc(`Tempo nesses programas\n${x.porSessao.map(s => `${fmtDate(ymd(new Date(entryStart(s.e))))}: ${fmtDur(s.ms)}`).join('\n')}`)}">${fmtDur(x.ms)}</span><button class="btn sm primary" data-act="sp-aceita" data-id="${parent.id}" data-sub="${x.sub.id}" title="Move esse tempo para a subtarefa ${esc(x.sub.name)}">Aceitar</button><button class="btn sm ghost" data-act="sp-ignora" data-id="${parent.id}" data-sub="${x.sub.id}" title="Não sugerir de novo o tempo destas sessões">Ignorar</button></div>`).join('')}</div>`;
}
/* Total sugerido (para o pontinho na seta da tarefa). */
const subSugTotal = (parent) => { return 0; try { return subSugestoes(parent).reduce((t, x) => t + x.ms, 0); } catch (e) { return 0; } };

/* Associa um programa a uma subtarefa. Um programa fica em UMA subtarefa da tarefa: se estava em outra, vale a nova.
   O tempo do programa nas sessões já passa a contar na subtarefa (só divide a sessão; o que o usuário marcou à mão continua valendo). */
function subAssocia(subId, nome) {
  nome = String(nome || '').trim(); const sub = db.get('tempo_tasks', subId); if (!nome || !sub) return false;
  const m = { ...(db.setting('subProgs', {}) || {}) }; const q = nome.toLowerCase();
  subtasksOf(sub.parent_id).forEach(x => { if (x.id !== subId && (m[x.id] || []).some(n => String(n).trim().toLowerCase() === q)) m[x.id] = m[x.id].filter(n => String(n).trim().toLowerCase() !== q); });
  const l = m[subId] || []; if (!l.some(n => String(n).trim().toLowerCase() === q)) m[subId] = [...l, nome];
  db.setSetting('subProgs', m);
  const tr = db.setting('subProgsTira', {}) || {}; if ((tr[subId] || []).length) db.setSetting('subProgsTira', { ...tr, [subId]: tr[subId].filter(n => subNorm(n) !== q) });
  return true;
}
CHANGES['sp-add'] = (el) => {
  const v = el.value; if (!v) return;
  subAssocia(el.dataset.id, v); db.emit();
};
ACTIONS['sp-tira'] = (el) => { subTira(el.dataset.id, el.dataset.n); db.emit(); };
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

/* ===== Etapas (25/11): "Terminei uma etapa" na sessão atual =====
   Enquanto trabalha numa tarefa, você marca o fim de uma etapa e dá um nome (ou escolhe uma subtarefa que já existe).
   O tempo desde a última marca (ou desde o começo da sessão) vira uma sessão daquela subtarefa, sem sair do projeto
   nem da tarefa: o cronômetro segue na tarefa. No fim dá para ver quanto durou cada etapa e de que hora a que hora.
   Marca guardada em tempo_settings 'etapaMarca' = { sessãoId: ISO }. */
const etapaMae = (a) => { const t = a && a.task_id ? db.get('tempo_tasks', a.task_id) : null; return t && t.parent_id ? db.get('tempo_tasks', t.parent_id) : t; };
function etapaInicio(a) {
  const m = (db.setting('etapaMarca', {}) || {})[a.id];
  const ini = entryStart(a);
  return m && new Date(m) > new Date(ini) ? m : ini;
}
/* Etapas de hoje da tarefa: sessões das subtarefas dela, com começo, fim e duração. */
function etapasDeHoje(mae) {
  if (!mae) return [];
  const subs = subtasksOf(mae.id); if (!subs.length) return [];
  const h0 = new Date(); h0.setHours(0, 0, 0, 0);
  const out = db.all('tempo_time_entries').filter(e => subs.some(s => s.id === e.task_id) && entryStart(e) && new Date(entryEnd(e) || Date.now()) >= h0)
    .map(e => ({ e, sub: subs.find(s => s.id === e.task_id), a: entryStart(e), b: entryEnd(e), ms: entryMs(e) }));
  /* marcações dentro das sessões da tarefa (o tempo continua na sessão): as do usuário e as dos programas associados */
  if (typeof sbDivsEf === 'function') {
    sbEntriesDe(mae).forEach(e => {
      const w = sbWork(e);
      sbDivsEf(e).forEach(d => {
        const sub = subs.find(x => x.id === d.sub); if (!sub || d.b < h0.getTime() || sub.id === e.task_id) return;
        const ms = sbLen(sbInter(w, [d])); if (ms < 1000) return;
        out.push({ e, sub, a: new Date(d.a).toISOString(), b: new Date(d.b).toISOString(), ms });
      });
    });
  }
  return out.sort((x, y) => new Date(x.a) - new Date(y.a));
}
/* Trechos seguidos da mesma etapa viram uma linha só (começo do primeiro até o fim do último, tempo somado, nº de trechos na dica). */
function etapasAgrupa(xs) {
  // uma linha por subtarefa, com o total do dia (trechos separados são somados); a ordem é a do primeiro trecho de cada uma
  const out = []; const por = new Map();
  xs.forEach(x => {
    const k = x.sub ? x.sub.id : null; const u = k ? por.get(k) : null;
    if (u) { u.itens.push(x); u.ms += x.ms; if (!x.b || !u.b) u.b = null; else if (new Date(x.b) > new Date(u.b)) u.b = x.b; if (new Date(x.a) < new Date(u.a)) u.a = x.a; }
    else { const n = { sub: x.sub, a: x.a, b: x.b, ms: x.ms, itens: [x] }; out.push(n); if (k) por.set(k, n); }
  });
  return out;
}
function etapasHTML(a) {
  const mae = etapaMae(a); if (!mae) return '';
  const xs = etapasAgrupa(etapasDeHoje(mae));
  const desde = etapaInicio(a);
  const atual = typeof sbEtapaAtual === 'function' ? sbEtapaAtual(a.id) : null;
  const dica = (g) => g.itens.length > 1 ? ` data-tip="${esc(g.itens.length + ' trechos: ' + g.itens.map(i => `${fmtTime(i.a)}–${i.b ? fmtTime(i.b) : '…'} (${fmtDur(i.ms)})`).join(' · '))}"` : '';
  const lista = xs.length ? `<div class="et-lista">${xs.map(x => `<div class="et-l"${dica(x)}><span class="et-n">${esc(x.sub?.name || 'Etapa')}${x.itens.length > 1 ? ` <span class="faint">· ${x.itens.length} trechos</span>` : ''}</span><span class="mono small muted">${fmtTime(x.a)}–${x.b ? fmtTime(x.b) : '…'}</span><b class="mono small">${fmtDur(x.ms)}</b></div>`).join('')}</div>` : '';
  const topo = atual ? `<span class="small" data-tip="A etapa que você disse que vem depois da última. O tempo dela é contado a partir daqui, quando você marcar o fim dela ou encerrar a sessão">Agora: <b>${esc(atual.name)}</b> · desde ${fmtTime(desde)}</span>` : `<span class="small muted" data-tip="A etapa atual conta a partir daqui">etapa atual desde ${fmtTime(desde)}</span>`;
  return `<div class="et-box"><div class="et-h"><span class="lbl">Etapas de ${esc(mae.name)}</span>${topo}</div>${lista || '<div class="small muted">Nenhuma etapa marcada hoje. Ao terminar uma parte do trabalho, aperte "Terminei uma etapa".</div>'}</div>`;
}
/* "Terminei uma etapa": diz qual etapa terminou (nova ou já existente), qual é a próxima e, se quiser, a hora em que terminou.
   O tempo desde a última marca até o fim fica marcado como a etapa que terminou (continua na sessão); o cronômetro segue. A próxima fica como "etapa atual". */
ACTIONS['etapa-fim'] = (el) => {
  const a = (el && el.dataset && el.dataset.id && db.get('tempo_time_entries', el.dataset.id)) || activeEntry(); if (!a) return;
  const mae = etapaMae(a);
  if (!mae) { toast('Escolha uma tarefa na sessão para marcar etapas'); return; }
  const ini = etapaInicio(a);
  const subs = subtasksOf(mae.id);
  const atual = typeof sbEtapaAtual === 'function' ? sbEtapaAtual(a.id) : null;
  const chips = (alvo, sem) => subs.filter(s => s.id !== sem).slice(0, 8).map(s => `<button type="button" class="sp-chip et-fill" data-et-fill="${alvo}" data-n="${esc(s.name)}" title="Usar ${esc(s.name)}">${esc(s.name)}</button>`).join('');
  const ly = openLayer({ html: `<div class="dh"><h2>Terminei uma etapa</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:12px"><div class="small muted">${esc(mae.name)} · etapa atual desde ${fmtTime(ini)} (${fmtDur(Date.now() - new Date(ini).getTime())}). Esse tempo fica marcado como a etapa que você terminou (continua na sessão); o cronômetro segue.</div>
      <div class="field"><label for="et-nome">Qual etapa terminei?</label><input id="et-nome" class="input" list="et-subs" placeholder="Ex.: Animar Cena 01" value="${esc(atual?.name || '')}" autofocus autocomplete="off"><datalist id="et-subs">${subs.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>${subs.length ? `<div class="sp-chips" style="margin-top:6px">${chips('#et-nome')}</div>` : ''}</div>
      <div class="field"><label for="et-prox">E qual é a próxima? <span class="faint">(opcional)</span></label><input id="et-prox" class="input" list="et-subs" placeholder="Ex.: Animar Cena 02" autocomplete="off">${subs.length ? `<div class="sp-chips" style="margin-top:6px">${chips('#et-prox', atual?.id)}</div>` : ''}</div>
      <div class="field"><label for="et-fim">Terminei às <span class="faint">(vazio = agora)</span></label><input id="et-fim" class="input sm" style="width:96px" placeholder="hh:mm" inputmode="numeric" autocomplete="off"></div></div>
    <div class="df"><button class="btn primary" data-et-ok title="Registrar a etapa (Enter)">Registrar etapa</button></div>` });
  const ok = () => {
    const nome = (ly.box.querySelector('#et-nome')?.value || '').trim(); if (!nome) { toast('Dê um nome para a etapa'); return; }
    const prox = (ly.box.querySelector('#et-prox')?.value || '').trim();
    const iniMs = new Date(ini).getTime(); let fimMs = Date.now();
    const fimTxt = (ly.box.querySelector('#et-fim')?.value || '').trim();
    if (fimTxt) {
      const h = parseHora(fimTxt); if (!h) { toast('Use a hora no formato hh:mm'); return; }
      const d = new Date(); d.setHours(Number(h.slice(0, 2)), Number(h.slice(3)), 0, 0);
      if (d.getTime() > Date.now() + 60e3) { toast('A hora de fim não pode ser no futuro'); return; }
      fimMs = Math.min(d.getTime(), Date.now());
    }
    if (fimMs - iniMs < 30e3) { toast(`A etapa atual começou às ${fmtTime(ini)}: a hora de fim precisa ser depois`); return; }
    const sub = sbSubDe(mae, nome);
    const marcaAntes = (db.setting('etapaMarca', {}) || {})[a.id], atualAntes = atual ? atual.id : null;
    const r = sbPintar(db.get('tempo_time_entries', a.id) || a, [{ a: iniMs, b: fimMs }], sub.id, `Etapa “${sub.name}” marcada como terminada`);
    db.setSetting('etapaMarca', { ...(db.setting('etapaMarca', {}) || {}), [a.id]: new Date(fimMs).toISOString() });
    const p = prox ? sbSubDe(mae, prox) : null;
    sbGuardaEtapaAtual(a.id, p ? p.id : null);
    ly.close(); db.emit();
    const desfazer = () => {
      if (r) r.desfazer();
      const m = { ...(db.setting('etapaMarca', {}) || {}) }; if (marcaAntes) m[a.id] = marcaAntes; else delete m[a.id]; db.setSetting('etapaMarca', m);
      sbGuardaEtapaAtual(a.id, atualAntes); db.emit(); window.actRedrawHook && window.actRedrawHook(); toast('Etapa desfeita');
    };
    sbLembraDesfazer(a.id, `Etapa “${sub.name}” marcada: ${fmtDur(fimMs - iniMs)}.`, () => { if (r) r.desfazer(); const m = { ...(db.setting('etapaMarca', {}) || {}) }; if (marcaAntes) m[a.id] = marcaAntes; else delete m[a.id]; db.setSetting('etapaMarca', m); sbGuardaEtapaAtual(a.id, atualAntes); db.emit(); });
    toast(`Etapa “${esc(sub.name)}”: ${fmtDur(fimMs - iniMs)}${p ? ` · agora: ${esc(p.name)}` : ''}`, { ms: 9000, actions: [{ label: 'Desfazer', run: desfazer }] });
    window.actRedrawHook && window.actRedrawHook();
  };
  ly.box.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-et-ok]')) return ok();
    const f = ev.target.closest('[data-et-fill]'); if (f) { const i = ly.box.querySelector(f.dataset.etFill); if (i) { i.value = f.dataset.n; i.focus(); } }
  });
  ly.box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } });
};
