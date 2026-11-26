/* Subtarefas dentro da sessão (25/11).
   Seção "Subtarefas" no formulário da sessão (antes das Notas). Subtarefa DIVIDE o tempo da sessão, não tira dele: a sessão continua
   inteira (programas, pausas, totais da tarefa) e cada trecho ganha uma marcação de subtarefa. Três jeitos de marcar:
   1) bandeirinha "Terminei uma etapa" (qual terminei e qual é a próxima; a próxima fica como "etapa atual");
   2) arrastar um trecho na barra "Por subtarefa" e escolher a subtarefa;
   3) escolher um programa e a subtarefa ("Photoshop › Preparar telas"), com ou sem trecho marcado.
   Marcar de novo por cima troca; "Sem subtarefa" tira a marcação. Cada ação devolve um "Desfazer" próprio.
   Guardado em tempo_settings: 'sbDiv' = { sessãoId: [{ a, b, sub }] } (ms; o tempo da subtarefa é a parte trabalhada da sessão
   dentro de a–b) e 'etapaAtual' = { sessãoId: subtarefaId }. */
const SB_T = (x) => new Date(x).getTime();
const SB_SEM = '#C3C9D6';
const SB_FORA = '#94A3B8';
let SB = null;   // { key, ranges: [{a,b}], drag, dragging, start, moveu, app, dest, novo, criando, lembrar }
const sbReset = () => { SB = null; SB_ULT = null; };
/* Última marcação da sessão aberta, com o jeito de desfazer: fica visível na seção até fechar o formulário. */
let SB_ULT = null;   // { key, txt, run }
function sbLembraDesfazer(key, txt, run) { SB_ULT = { key, txt, run }; }
function sbEstado(key) {
  if (!SB || SB.key !== key) SB = { key, ranges: [], drag: null, dragging: false, start: 0, moveu: false, app: '', arq: '', conf: 'tudo', dest: '', novo: '', criando: false, lembrar: false };
  return SB;
}

/* Trechos trabalhados da sessão (ms). */
const sbWork = (e, now = Date.now()) => (e.segments || []).filter(s => s.s).map(s => ({ a: SB_T(s.s), b: s.e ? SB_T(s.e) : now })).filter(x => x.b > x.a);
const sbInter = (A, B) => { const out = []; A.forEach(x => B.forEach(y => { const a = Math.max(x.a, y.a), b = Math.min(x.b, y.b); if (b > a) out.push({ a, b }); })); return out; };
const sbLen = (l) => actMergeIntervals(l).reduce((t, x) => t + x.b - x.a, 0);
const sbDivs = (id) => ((db.setting('sbDiv', {}) || {})[id] || []).map(d => ({ a: d.a, b: d.b, sub: d.sub }));
function sbGuardaDivs(id, l) {
  const m = { ...(db.setting('sbDiv', {}) || {}) };
  if (l.length) m[id] = l; else delete m[id];
  db.setSetting('sbDiv', m);
}
/* Sessões em que as subtarefas de uma tarefa podem aparecer: as da tarefa mãe e as das subtarefas dela. */
function sbEntriesDe(mae) {
  const ids = new Set([mae.id, ...subtasksOf(mae.id).map(x => x.id)]);
  return db.all('tempo_time_entries').filter(x => ids.has(x.task_id));
}
/* Divisão automática pelos programas associados às subtarefas (Photoshop → Preparar telas): vale onde o usuário não marcou nada. */
const SB_AUTO_C = new Map();
function sbAuto(e, now = Date.now()) {
  const mae = etapaMae(e); if (!mae || typeof actList !== 'function' || typeof subProgsDe !== 'function') return [];
  const subs = subtasksOf(mae.id).filter(x => subProgsDe(x.id).length); if (!subs.length) return [];
  const sg = e.segments || []; const ult = sg[sg.length - 1] || {};
  const key = [e.id, sg.length, ult.s, ult.e, JSON.stringify(subs.map(x => [x.id, subProgsDe(x.id)])), e.state === 'done' ? 0 : Math.floor(now / 60000)].join('|');
  const c = SB_AUTO_C.get(e.id); if (c && c.key === key) return c.v;
  const work = sbWork(e, now); let l = [];
  if (work.length) {
    const recs = actList(e.id).filter(r => !(typeof pausaRec === 'function' && pausaRec(r) && !(typeof actWaTrabalho === 'function' && actWaTrabalho(r))));
    subs.slice().reverse().forEach(sub => {
      const progs = subProgsDe(sub.id);
      const iv = actMergeIntervals(recs.filter(r => subCasa(r, progs)).map(r => ({ a: SB_T(r.from), b: SB_T(r.to) })).filter(x => x.b > x.a));
      const pcs = sbInter(work, iv);
      if (pcs.length) l = sbAplica(l, pcs, sub.id);
    });
  }
  SB_AUTO_C.set(e.id, { key, v: l }); return l;
}
/* Divisão que vale: a automática por programa, com o que o usuário marcou à mão por cima ("Sem subtarefa" também vale). */
function sbDivsEf(e, now = Date.now()) {
  const man = sbDivs(e.id), auto = sbAuto(e, now);
  const base = !auto.length ? man : [...sbAplica(auto, man.map(d => ({ a: d.a, b: d.b })), null), ...man].sort((p, q) => p.a - q.a);
  return [...base, ...sbFalta(e, base, now)].sort((p, q) => p.a - q.a);
}
/* Etapa corrente (V2.06.190): o tempo trabalhado que nenhum programa nem marcação à mão cobre vai para a subtarefa "atual" daquele momento.
   Só tem uma subtarefa → é ela, até você alternar. Alternar = clicar em "Tornar atual" numa subtarefa ou "Terminei uma etapa" (próxima).
   Histórico das trocas por tarefa mãe em tempo_settings 'etapaHist' = { tarefaMãeId: [{ t (ms), sub }] }; o que veio antes da troca fica com a anterior. */
const sbHist = (maeId) => ((db.setting('etapaHist', {}) || {})[maeId] || []).slice().sort((p, q) => p.t - q.t);
function sbCorrenteEm(maeId, subs, t) {
  const h = sbHist(maeId); let id = null;
  if (!h.length) id = subs.length === 1 ? subs[0].id : null;
  else h.forEach(x => { if (x.t <= t) id = x.sub; });
  if (id && !subs.some(x => x.id === id)) id = subs.length === 1 ? subs[0].id : null;
  return id;
}
function sbFalta(e, cobertas, now) {
  const mae = etapaMae(e); if (!mae) return [];
  const subs = subtasksOf(mae.id); if (!subs.length || subs.some(x => x.id === e.task_id)) return [];
  const pts = sbHist(mae.id).map(x => x.t); const cov = actMergeIntervals(cobertas.map(d => ({ a: d.a, b: d.b })));
  const out = [];
  sbWork(e, now).forEach(w => {
    let livres = [w];
    cov.forEach(c => { livres = livres.flatMap(p => (c.b <= p.a || c.a >= p.b) ? [p] : [...(c.a > p.a ? [{ a: p.a, b: c.a }] : []), ...(c.b < p.b ? [{ a: c.b, b: p.b }] : [])]); });
    livres.forEach(p => {
      const cortes = [p.a, ...pts.filter(t => t > p.a && t < p.b), p.b];
      for (let i = 0; i < cortes.length - 1; i++) {
        const a = cortes[i], b = cortes[i + 1], sub = sbCorrenteEm(mae.id, subs, a); if (!sub || b <= a) continue;
        const u = out[out.length - 1]; if (u && u.sub === sub && a - u.b <= 1000) u.b = b; else out.push({ a, b, sub });
      }
    });
  });
  return out;
}
/* Troca a etapa corrente a partir de agora (guarda o ponto de partida quando é a primeira troca). */
function sbTrocaCorrente(e, subId, quando) {
  const mae = etapaMae(e); if (!mae || !subId) return;
  const subs = subtasksOf(mae.id), m = { ...(db.setting('etapaHist', {}) || {}) }; const h = (m[mae.id] || []).slice();
  if (!h.length) { const ant = sbCorrenteEm(mae.id, subs, 0); if (ant) h.push({ t: 0, sub: ant }); }
  const ult = h[h.length - 1]; if (ult && ult.sub === subId) return;
  h.push({ t: quando || Date.now(), sub: subId }); m[mae.id] = h; db.setSetting('etapaHist', m);
}
/* Tempo trabalhado de uma subtarefa dentro de sessões (soma em todas as sessões da tarefa). */
function sbSubMs(subId, now = Date.now()) {
  const sub = db.get('tempo_tasks', subId), mae = sub && db.get('tempo_tasks', sub.parent_id); if (!mae) return 0;
  let t = 0;
  sbEntriesDe(mae).forEach(e => { if (e.task_id === subId) return; const ds = sbDivsEf(e, now).filter(d => d.sub === subId); if (ds.length) t += sbLen(sbInter(sbWork(e, now), ds)); });
  return t;
}
/* Tira os cortes das marcações e, se o destino é uma subtarefa, marca os cortes nela. Junta marcações vizinhas iguais. */
function sbAplica(divs, cuts, destSub) {
  let l = divs.flatMap(d => {
    let pcs = [d];
    cuts.forEach(c => { pcs = pcs.flatMap(p => (c.b <= p.a || c.a >= p.b) ? [p] : [...(c.a > p.a ? [{ ...p, b: c.a }] : []), ...(c.b < p.b ? [{ ...p, a: c.b }] : [])]); });
    return pcs;
  });
  if (destSub) cuts.forEach(c => l.push({ a: c.a, b: c.b, sub: destSub }));
  l = l.filter(d => d.b > d.a).sort((p, q) => p.a - q.a);
  const out = [];
  l.forEach(d => { const u = out[out.length - 1]; if (u && u.sub === d.sub && d.a - u.b <= 1000) u.b = Math.max(u.b, d.b); else out.push({ ...d }); });
  return out;
}
/* Quanto tempo trabalhado mudaria de marcação se os cortes fossem para o destino. */
function sbMudaria(e, cuts, destSub, now = Date.now()) {
  const pcs = sbInter(sbWork(e, now), actMergeIntervals(cuts));
  const ef = sbDivsEf(e, now);
  if (destSub) return sbLen(pcs) - sbLen(sbInter(pcs, ef.filter(d => d.sub === destSub)));
  return sbLen(sbInter(pcs, ef.filter(d => d.sub !== 'sem')));
}
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
  const ja = subs.find(s => s.name.trim().toLowerCase() === nome.toLowerCase()); if (ja) return ja;
  if (subs.length === 1 && !sbHist(mae.id).length) { const m = { ...(db.setting('etapaHist', {}) || {}) }; m[mae.id] = [{ t: 0, sub: subs[0].id }]; db.setSetting('etapaHist', m); }   // a única até agora continua sendo a atual
  return db.insert('tempo_tasks', { project_id: mae.project_id, parent_id: mae.id, name: nome, status_id: mae.status_id, status_inherited: true, deadline: null, notes: 'Criada na sessão', order: subs.length, work_type_id: null, owner: mae.owner || null }, true);
}

/* O motor: marca os cortes (ms) com a subtarefa de destino (mae.id = "Sem subtarefa", tira a marcação). O tempo NÃO sai da sessão.
   Devolve { ms, desfazer } ou null se nada muda. */
/* O que marcar faria: nova lista de marcações do usuário, quanto tempo muda de subtarefa e se só "fixa" o que o programa já dava. */
function sbPlano(e, cuts, dest, now = Date.now()) {
  const antes = sbDivs(e.id);
  let novo = sbAplica(antes, cuts, dest);
  if (!dest) { const pcs = sbInter(cuts, sbAuto(e, now)); if (pcs.length) novo = sbAplica(novo, pcs, 'sem'); }   // "sem subtarefa" também vence o automático
  const ms = sbMudaria(e, cuts, dest, now);
  const igual = JSON.stringify(novo) === JSON.stringify(antes);
  return { antes, novo, ms, igual, fixa: !ms && !igual, msFixo: !ms && !igual ? sbLen(sbInter(sbWork(e, now), cuts)) : 0 };
}
function sbPintar(e, cuts, destTaskId, rotulo) {
  const mae = etapaMae(e); if (!mae || !destTaskId) return null;
  const now = Date.now();
  cuts = actMergeIntervals((cuts || []).map(c => ({ a: c.a, b: Math.min(c.b, now) })).filter(c => c.b - c.a >= 1000));
  if (!cuts.length) return null;
  const dest = destTaskId === mae.id ? null : destTaskId;
  const P = sbPlano(e, cuts, dest, now);
  if (!P.ms && P.igual) return null;
  sbGuardaDivs(e.id, P.novo);
  db.emit();
  return { ms: P.ms || P.msFixo, fixou: P.fixa, desfazer: () => { sbGuardaDivs(e.id, P.antes); db.emit(); } };
}
/* Sessões antigas em que um trecho foi LEVADO para uma subtarefa (versões anteriores): o tempo volta para a sessão e a subtarefa fica só como marcação.
   1) lançamentos "Movido de outra sessão" de subtarefa da mesma tarefa, dentro (ou encostados) da janela da sessão: voltam e são apagados;
   2) buracos "movidos" para o mesmo projeto cujo lançamento de destino não existe mais (o tempo ficou perdido): viram tempo da sessão de novo;
      a subtarefa é a que o histórico da sessão cita ("… › Subtarefa: 18min levados para a subtarefa"), se for uma só. */
function sbReintegra(e) {
  const mae = etapaMae(e); if (!mae || e.state === undefined) return 0;
  const subs = subtasksOf(mae.id), subIds = new Set(subs.map(s => s.id));
  const now = Date.now(); let n = 0;
  const cand = db.all('tempo_time_entries').filter(x => x.id !== e.id && x.state === 'done' && x.project_id === e.project_id && subIds.has(x.task_id) && /^Movido de outra sessão/.test(x.notes || '') && (x.segments || []).length);
  const feitos = new Set(); let mexeu = cand.length > 0;
  while (mexeu) {
    mexeu = false;
    const cur0 = db.get('tempo_time_entries', e.id); const w = sbWork(cur0, now); if (!w.length) break;
    const ini = Math.min(...w.map(x => x.a)), fim = Math.max(...w.map(x => x.b));
    cand.filter(x => !feitos.has(x.id)).forEach(x => {
      const xs = sbWork(x, now); if (!xs.length) return;
      const xa = Math.min(...xs.map(z => z.a)), xb = Math.max(...xs.map(z => z.b));
      const dentro = xa >= ini - 2000 && xb <= fim + 2000;
      const encosta = Math.abs(xb - ini) <= 2000 || Math.abs(xa - fim) <= 2000;
      if (!dentro && !encosta) return;
      const cur = db.get('tempo_time_entries', e.id);
      db.update('tempo_time_entries', e.id, { segments: sbNormaliza([...(cur.segments || []), ...x.segments.map(z => ({ s: z.s, e: z.e }))]), edits: auditEdit(cur, cur.segments, `Trecho de “${db.get('tempo_tasks', x.task_id)?.name || 'subtarefa'}” voltou para a sessão (a subtarefa agora só marca o trecho)`) }, true);
      sbGuardaDivs(e.id, sbAplica(sbDivs(e.id), xs.map(z => ({ a: z.a, b: z.b })), x.task_id));
      db.remove('tempo_time_entries', x.id, true);
      feitos.add(x.id); n++; mexeu = true;
    });
  }
  /* 2) buracos órfãos */
  const cur = db.get('tempo_time_entries', e.id); const sg = (cur.segments || []).map(z => ({ ...z }));
  const outros = db.all('tempo_time_entries').filter(x => x.id !== e.id).flatMap(x => sbWork(x, now));
  const orfaos = [];
  for (let i = 0; i < sg.length - 1; i++) {
    const z = sg[i]; if (z.why !== 'moved' || z.movedTo !== e.project_id || z.troca || !z.e || !sg[i + 1].s) continue;
    const A = SB_T(z.e), B = SB_T(sg[i + 1].s); if (B - A < 1000) continue;
    if (sbLen(sbInter(outros, [{ a: A, b: B }])) >= 0.5 * (B - A)) continue;   // tem lançamento de destino: não é órfão
    orfaos.push({ i, a: A, b: B });
  }
  if (orfaos.length) {
    const nomes = [...new Set((cur.edits || []).map(x => { const m = /›\s*(.+?):\s*\d.*levados? para a subtarefa/.exec(x.reason || '') || /^Etapa “(.+?)” marcada/.exec(x.reason || ''); return m ? m[1].trim().toLowerCase() : null; }).filter(Boolean))];
    const sub = nomes.length === 1 ? subs.find(x => x.name.trim().toLowerCase() === nomes[0]) : null;
    const novos = sg.map((z, i) => orfaos.some(o => o.i === i) ? (({ why, movedTo, movedFrom, troca, ...r }) => r)(z) : z);
    orfaos.forEach(o => novos.push({ s: new Date(o.a).toISOString(), e: new Date(o.b).toISOString() }));
    const tot = orfaos.reduce((t, o) => t + o.b - o.a, 0);
    db.update('tempo_time_entries', e.id, { segments: sbNormaliza(novos), edits: auditEdit(cur, cur.segments, `${fmtDur(tot)} que tinham sido levados para subtarefa e se perderam voltaram para a sessão${sub ? ` (marcados como “${sub.name}”)` : ''}`) }, true);
    if (sub) sbGuardaDivs(e.id, sbAplica(sbDivs(e.id), orfaos.map(o => ({ a: o.a, b: o.b })), sub.id));
    n += orfaos.length;
  }
  if (n) db.emit();
  return n;
}

/* ---------- janela da sessão e pedaços da barra ---------- */
function sbJanela(e) {
  const w = sbWork(e); if (!w.length) return null;
  const a = Math.min(...w.map(x => x.a)), b = Math.max(...w.map(x => x.b));
  return b > a ? { a, b, span: b - a } : null;
}
/* Pedaços coloridos da barra: cada trecho trabalhado da sessão dividido pelas marcações ('sem' = sem subtarefa). */
function sbFatias(e, mae, J) {
  const subIds = new Set(subtasksOf(mae.id).map(s => s.id));
  const base = subIds.has(e.task_id) ? e.task_id : 'sem';
  const divs = sbDivsEf(e).filter(d => subIds.has(d.sub)).sort((p, q) => p.a - q.a); const out = [];
  sbWork(e).forEach(w => {
    let pos = w.a;
    divs.filter(d => d.b > w.a && d.a < w.b).forEach(d => {
      const a = Math.max(d.a, w.a), b = Math.min(d.b, w.b);
      if (a > pos) out.push({ a: pos, b: a, key: base, id: e.id });
      if (b > Math.max(a, pos - 0)) out.push({ a: Math.max(a, pos), b, key: d.sub, id: e.id });
      pos = Math.max(pos, b);
    });
    if (w.b > pos) out.push({ a: pos, b: w.b, key: base, id: e.id });
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

/* Programas usados na sessão: { groups, records } de actAnalyzeList. */
function sbApps(e, mae, J) {
  const A = actAnalyzeList(actList(e.id), 'program');
  const groups = A.groups.filter(g => g.id !== 'outros');
  return { groups, todos: groups, records: A.records };
}
/* Sites (Chrome) ou arquivos de um programa nesta sessão, do que mais ao que menos tempo. */
function sbArquivosDe(A, gid) {
  const por = {};
  A.records.filter(r => r.gid === gid && r.doc && r.doc !== 'Outros sites').forEach(r => { const d = String(r.doc).trim(); por[d] = (por[d] || 0) + (SB_T(r.to) - SB_T(r.from)); });
  return Object.entries(por).filter(([, ms]) => ms > 0).sort((x, y) => y[1] - x[1]).map(([doc, ms]) => ({ doc, ms }));
}
function sbAppsAcum(a, b, by) {
  actPoolBetween(a, b).forEach(r => {
    if (typeof pausaRec === 'function' && pausaRec(r) && !actWaTrabalho(r)) return;
    const x = Math.max(a, SB_T(r.from)), y = Math.min(b, SB_T(r.to)); if (y <= x) return;
    const k = shortProgram(r.app) || r.app; by[k] = (by[k] || 0) + (y - x);
  });
  return by;
}
const sbAppsTxt = (by, max) => Object.entries(by).sort((p, q) => q[1] - p[1]).slice(0, max).map(([k, ms]) => `${k}: ${fmtDur(ms)}`);
function sbAppsDe(a, b) { return sbAppsTxt(sbAppsAcum(a, b, {}), 3); }
/* Programas (e quanto tempo de cada um) nos trechos de uma subtarefa ou de "Sem subtarefa", para a dica da lista. */
function sbAppsDaChave(fatias, key) {
  const by = {}, fs = fatias.filter(f => f.key === key); fs.forEach(f => sbAppsAcum(f.a, f.b, by));
  const total = fs.reduce((t, f) => t + (f.b - f.a), 0), lidos = Object.values(by).reduce((t, v) => t + v, 0);
  const l = sbAppsTxt(by, 12);
  // o tempo que sobra não tem leitura de programa (Mac sem registrar, ou "em uso agora"): aparece à parte para a conta fechar
  if (total - lidos >= 30000) l.push(`Sem leitura de programa: ${fmtDur(total - lidos)}`);
  return l;
}

/* Cortes que valem agora: o programa escolhido (dentro dos trechos marcados, se houver) ou só os trechos marcados. */
function sbCortes(S, A) {
  const rs = S.ranges.map(r => ({ a: r.a, b: r.b }));
  if (!S.app) return rs;
  const iv = actMergeIntervals(A.records.filter(r => r.gid === S.app && (!S.arq || String(r.doc || '').trim() === S.arq)).map(r => ({ a: SB_T(r.from), b: SB_T(r.to) })).filter(c => c.b > c.a));
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
  // programa/site escolhido e nenhum trecho marcado: é uma associação (vale para tudo e para os próximos registros), não uma marcação
  if (S.app && !S.ranges.length) {
    const g = A.todos.find(x => x.id === S.app); const dest0 = sbDestinoId(e, mae, S);
    if (!dest0) return { ok: false, assoc: true, txt: S.dest === '__novo' ? 'Dê um nome para a nova subtarefa.' : 'Escolha a subtarefa.' };
    if (dest0 === mae.id) return { ok: false, assoc: true, txt: 'Escolha uma subtarefa para associar.' };
    const nm = S.dest === '__novo' ? (S.novo || '').trim() : sbNome(mae, S.dest);
    return { ok: true, assoc: true, ms: 0, txt: `Vai associar ${S.arq || (g ? g.label : 'o programa')} a ${nm}: tudo dele nesta tarefa passa a contar lá, também nos próximos registros. Dá para mudar depois.` };
  }
  const cuts = sbCortes(S, A);
  const app = S.app ? A.todos.find(g => g.id === S.app) : null;
  if (!cuts.length) return { ok: false, txt: S.app ? 'Esse programa não tem tempo nos trechos marcados.' : 'Arraste um trecho na barra ou escolha um programa.' };
  const dest = sbDestinoId(e, mae, S);
  if (!dest) return { ok: false, txt: S.dest === '__novo' ? 'Dê um nome para a nova subtarefa.' : 'Escolha a subtarefa.' };
  const nome = S.dest === 'sem' ? 'Sem subtarefa' : S.dest === '__novo' ? (S.novo || '').trim() : sbNome(mae, S.dest);
  const P = sbPlano(e, cuts, dest === mae.id ? null : dest);
  if (!P.ms && P.igual) return { ok: false, txt: `Nada para marcar: esse tempo já está em ${nome}.` };
  if (!P.ms) return { ok: true, ms: P.msFixo, txt: `Esse tempo já conta em ${nome} pelo programa. Marcar fixa ${fmtDur(P.msFixo)} nela: não muda se o programa for para outra subtarefa.` };
  const ms = P.ms;
  const onde = S.ranges.length ? ` (${S.ranges.length === 1 ? sbHM(S.ranges[0].a) + '–' + sbHM(S.ranges[0].b) : S.ranges.length + ' trechos'})` : '';
  return { ok: true, ms, txt: `Vai marcar ${fmtDur(ms)}${app ? ' de ' + app.label : ''}${onde} como ${nome === 'Sem subtarefa' ? 'sem subtarefa' : nome}. O tempo continua na sessão.` };
}

/* ---------- a seção ---------- */
function sbSecaoHTML(e) {
  if (!e) return '';
  const S = sbEstado(e.id);
  const mae = etapaMae(e);
  const fechado = !!db.setting('sbFechado', false);
  const cab = (btns) => `<div class="row between sb-head"><span class="row" style="gap:4px;min-width:0"><button type="button" class="btn sm icon ghost sb-fold" data-x="sb-fold" aria-expanded="${!fechado}" aria-label="${fechado ? 'Mostrar' : 'Esconder'} subtarefas" title="${fechado ? 'Mostrar' : 'Esconder'} a barra e os menus de subtarefas">${icon(fechado ? 'chevR' : 'chevD')}</button><span class="lbl">Subtarefas${mae ? ` <span class="faint">de ${esc(mae.name)}</span>` : ''}</span></span><span class="row" style="gap:6px">${btns || ''}</span></div>`;
  if (!mae) return `<div class="act-sec sb-sec">${cab('')}<div class="small muted">Escolha uma tarefa para esta sessão (botão Alterar, lá em cima) e as subtarefas dela aparecem aqui.</div></div>`;
  const J = sbJanela(e);
  const subs = subtasksOf(mae.id);
  const aberta = e.state !== 'done';
  const atualId = (db.setting('etapaAtual', {}) || {})[e.id];
  const atual = atualId ? subs.find(s => s.id === atualId) : null;
  const btns = `${aberta ? `<button type="button" class="btn sm" data-x="sb-etapa" title="Marca o fim de uma etapa: diz qual terminou e qual é a próxima. O tempo desde a última marca fica marcado como a etapa que terminou. Continua na sessão.">${icon('flag')} Terminei uma etapa</button>` : ''}<button type="button" class="btn sm" data-x="sb-nova" title="Cria uma subtarefa nova de ${esc(mae.name)} sem mexer no tempo">${icon('plus')} Subtarefa</button>`;
  const criar = S.criando ? `<div class="sb-criar"><input type="text" class="input sm" data-sb="nome" placeholder="Nome da subtarefa" autocomplete="off" aria-label="Nome da nova subtarefa"><button type="button" class="btn sm primary" data-x="sb-criar" title="Criar a subtarefa (Enter)">Criar</button><button type="button" class="btn sm ghost" data-x="sb-nova" title="Cancelar">Cancelar</button></div>` : '';
  const corId = sbCorrenteEm(mae.id, subs, Date.now()), cor = subs.find(x => x.id === corId);
  const agora = cor && aberta ? `<div class="sb-atual" data-tip="Etapa atual: o tempo que nenhum programa nem marcação cobre vai para ela, até você alternar (botão “Tornar atual” numa subtarefa) ou usar “Terminei uma etapa”."><span class="small muted">Etapa atual</span><b>${esc(cor.name)}</b>${atual && atual.id === cor.id ? `<span class="small muted">desde ${fmtTime(etapaInicio(e))}</span>` : ''}</div>` : '';
  if (!J) return `<div class="act-sec sb-sec">${cab(btns)}${criar}${agora}<div class="small muted">A sessão ainda não tem tempo registrado.</div></div>`;
  if (fechado) { const marc = sbDivsEf(e).filter(d => subs.some(x => x.id === d.sub)); const t = sbLen(sbInter(sbWork(e), marc)); return `<div class="act-sec sb-sec is-fechado">${cab(btns)}<div class="small muted">${subs.length} ${subs.length === 1 ? 'subtarefa' : 'subtarefas'}${t ? ` · ${fmtDur(t)} marcados nesta sessão` : ''}</div></div>`; }

  const fatias = sbFatias(e, mae, J);
  const msPor = {}; fatias.forEach(f => { msPor[f.key] = (msPor[f.key] || 0) + (f.b - f.a); });
  const pct = (t) => (Math.min(Math.max(t, J.a), J.b) - J.a) / J.span * 100;
  let barras = '';
  const juntar = typeof actAglomerar === 'function' && (actAglomerar() || actCorrido()), semPausa = typeof actHidePausas === 'function' && actHidePausas();
  if (!juntar && !semPausa) pauseGapsOf([e]).forEach(g => { const a = SB_T(g.s), b = SB_T(g.e); if (b <= J.a || a >= J.b) return; barras += `<span class="seg-b pausa act-pause" style="--ph:${pauseHatch(g.why)};--pg:${pauseGapOf(pauseHatch(g.why))};left:${pct(a)}%;width:${Math.max(.3, pct(b) - pct(a))}%" data-tip="${esc(`Pausa ${sbHM(a)}–${sbHM(b)} · ${fmtDur(b - a)}`)}"></span>`; });
  if (!juntar) sbForaDe(e, J).forEach(f => { barras += `<span class="seg-b sb-fora" style="left:${pct(f.a)}%;width:${Math.max(.3, pct(f.b) - pct(f.a))}%" data-tip="${esc(`Em outro projeto\n${sbHM(f.a)}–${sbHM(f.b)} · ${fmtDur(f.b - f.a)}`)}"></span>`; });
  if (juntar) {   // Aglomerar / Corrido: sem os espaços parados; Aglomerar soma cada subtarefa num bloco só
    const lista = typeof actAglomerar === 'function' && actAglomerar() ? Object.entries(msPor).sort((x, y) => y[1] - x[1]).map(([key, ms]) => ({ key, ms })) : fatias.map(f => ({ key: f.key, ms: f.b - f.a, a: f.a, b: f.b }));
    const tot = Math.max(1, lista.reduce((t, x) => t + x.ms, 0)); let off = 0;
    lista.forEach(x => { const w = x.ms / tot * 100; barras += `<span class="seg-b fill act-b sb-b" data-g="${esc(x.key)}" style="--tb:${sbCor(mae, x.key)};left:${off}%;width:${Math.max(.3, w)}%" data-tip="${esc([sbNome(mae, x.key), x.a ? `${sbHM(x.a)}–${sbHM(x.b)} · ${fmtDur(x.ms)}` : fmtDur(x.ms)].join('\n'))}"></span>`; off += w; });
  } else fatias.forEach(f => {
    const apps = sbAppsDe(f.a, f.b);
    barras += `<span class="seg-b fill act-b sb-b" data-g="${esc(f.key)}" data-a="${Math.round(f.a)}" data-b="${Math.round(f.b)}" style="--tb:${sbCor(mae, f.key)};left:${pct(f.a)}%;width:${Math.max(.3, pct(f.b) - pct(f.a))}%" data-tip="${esc([`${sbNome(mae, f.key)}`, `${sbHM(f.a)}–${sbHM(f.b)} · ${fmtDur(f.b - f.a)}`, ...apps].join('\n'))}"></span>`;
  });
  if (!juntar) S.ranges.concat(S.drag ? [S.drag] : []).forEach(r => { const x = pct(r.a), y = pct(r.b); if (y > x) barras += `<span class="res-sel-range" style="left:${x}%;width:${Math.max(.3, y - x)}%"></span>`; });
 const faixa = !subs.length ? '' : `<div class="act-strip sb-strip" ${juntar ? '' : 'data-mode="sub" data-ent="' + esc(e.id) + '" data-t0="' + J.a + '" data-span="' + J.span + '"'} style="position:relative" aria-label="Subtarefas da sessão">${barras}</div>`;

  const linha = (key, nome, ms, sub) => `<div class="sb-item${S.dest === key ? ' is-pick' : ''}" style="--tb:${sbCor(mae, key)}">
      <div class="sb-item-l"><button type="button" class="sb-pick" data-g="${esc(key)}" data-x="sb-dest" data-k="${esc(key)}" data-tip="${esc([`Clique para escolher ${nome} para o trecho`, ...(() => { const l = sbAppsDaChave(fatias, key); return l.length ? [key === 'sem' ? 'Programas sem subtarefa:' : 'Programas nesta subtarefa:', ...l] : [key === 'sem' ? 'Nenhum programa sem subtarefa nesta sessão.' : '']; })()].filter(Boolean).join('\n'))}"><i></i><span class="sb-n">${esc(nome)}</span></button>${sub && aberta ? (key === corId ? `<span class="small muted sb-cur" data-tip="Etapa atual: o tempo sem programa nem marcação vai para ela">● atual</span>` : `<button type="button" class="btn sm ghost sb-detbtn" data-x="sb-atual" data-k="${esc(key)}" title="Torna esta a etapa atual: a partir de agora, o tempo sem programa nem marcação vai para ela">Tornar atual</button>`) : ''}${sub ? `<button type="button" class="btn sm sb-detbtn" data-x="sb-det" data-k="${esc(key)}" title="Abre a janela da subtarefa: tempo registrado, programas, renomear e apagar">Detalhes</button>` : ''}<span class="mono small sb-t" title="Tempo desta subtarefa marcado nesta sessão">${ms ? fmtDur(ms) : '—'}</span></div>
    </div>`;
  const chips = `<div class="sb-lista"><div class="sb-lista-h lbl">Subtarefas</div>${linha('sem', 'Sem subtarefa', msPor.sem || 0, false)}${subs.map(x => linha(x.id, x.name, msPor[x.id] || 0, true)).join('')}</div>`;

  const A = sbApps(e, mae, J);
  const opApp = A.groups.map(g => `<option value="${esc(g.id)}"${S.app === g.id ? ' selected' : ''}>${esc(g.label)} · ${fmtDur(g.ms)}</option>`).join('');
  const arqs = S.app ? sbArquivosDe(A, S.app) : [];
  const opArq = `<option value="">Todo o programa</option>${arqs.map(x => `<option value="${esc(x.doc)}"${S.arq === x.doc ? ' selected' : ''}>${esc(x.doc)} · ${fmtDur(x.ms)}</option>`).join('')}`;
  const opDest = `<option value="">Escolha…</option><option value="sem"${S.dest === 'sem' ? ' selected' : ''}>Sem subtarefa</option>${subs.map(s => `<option value="${esc(s.id)}"${S.dest === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__novo"${S.dest === '__novo' ? ' selected' : ''}>+ Nova subtarefa…</option>`;
  const prev = sbPrevia(e, mae, S, A);
  const rotuloBtn = prev.assoc ? 'Associar' : 'Marcar';
  const rangeChips = S.ranges.length
    ? `<div class="sb-sel">${S.ranges.map((r, i) => `<span class="sp-chip">${sbHM(r.a)}–${sbHM(r.b)} · ${fmtDur(r.b - r.a)}<button type="button" data-x="sb-rm" data-i="${i}" aria-label="Tirar este trecho" title="Tirar este trecho da marcação">×</button></span>`).join('')}<button type="button" class="btn sm ghost" data-x="sb-limpar" title="Desmarcar todos os trechos">Limpar</button></div>`
    : `<div class="small muted sb-dica">Arraste na barra para marcar um trecho (clicar num pedaço marca ele inteiro; Shift soma outro trecho).</div>`;
  const appSel = S.app ? A.todos.find(g => g.id === S.app) : null;
  const outra = appSel && S.dest && S.dest !== 'sem' && S.dest !== '__novo' ? subtasksOf(mae.id).find(x => x.id !== S.dest && subProgsDe(x.id).some(n => subMesmo(n, appSel.label))) : null;
  const rd = (v, t, tip) => `<label class="sb-lembrar" title="${esc(tip)}"><input type="radio" name="sb-conf" data-sb="conf" value="${v}"${S.conf === v ? ' checked' : ''}> ${t}</label>`;
  const lembrar = outra
    ? `<div class="sb-conf"><span class="small muted">${esc(appSel.label)} já está em “${esc(outra.name)}”. E agora?</span>${rd('dividir', 'Dividir: a partir de agora é a nova', 'Marca só o trecho escolhido na nova subtarefa; “' + outra.name + '” continua com o resto')}${rd('tudo', 'Mudar tudo para a nova', 'Todo o tempo de ' + appSel.label + ' passa a contar na nova subtarefa (sai de “' + outra.name + '”)')}${rd('arquivo', 'Só o site/arquivo selecionado', 'Escolha o site ou arquivo acima: só ele vai para a nova; o resto do programa fica em “' + outra.name + '”')}</div>`
    : appSel && S.dest && S.dest !== 'sem' && S.dest !== '__novo'
      ? `<label class="sb-lembrar" title="Nas próximas sessões, o tempo em ${esc(appSel.label)} passa a contar nesta subtarefa sozinho"><input type="checkbox" data-sb="lembrar"${S.lembrar ? ' checked' : ''}> Lembrar: ${esc(appSel.label)}${S.arq ? ' › ' + esc(S.arq) : ''} costuma ser ${esc(sbNome(mae, S.dest))}</label>` : '';
  const form = `<div class="sb-assign">${rangeChips}
    <div class="sb-row">
      <label class="sb-f"><span class="small muted">Programa</span><select class="input sm" data-sb="app" aria-label="Só o tempo deste programa" title="Escolha um programa para marcar só o tempo dele (dentro do trecho selecionado, se houver)"><option value="">Todos os programas</option>${opApp}</select></label>
      ${S.app ? `<label class="sb-f"><span class="small muted">Site / arquivo</span><select class="input sm" data-sb="arq" aria-label="Site ou arquivo do programa" title="Opcional. Sem escolher, vale tudo do programa; escolhendo, só o site ou arquivo marcado vai para a subtarefa">${opArq}</select></label>` : ''}
      <span class="sb-seta" aria-hidden="true">›</span>
      <label class="sb-f"><span class="small muted">Subtarefa</span><select class="input sm" data-sb="dest" aria-label="Subtarefa de destino" title="Para onde vai o tempo">${opDest}</select></label>
      ${S.dest === '__novo' ? `<label class="sb-f"><span class="small muted">Nome</span><input type="text" class="input sm" data-sb="novo" value="${esc(S.novo)}" placeholder="Ex.: Animar Cena 01" autocomplete="off" aria-label="Nome da nova subtarefa"></label>` : ''}
      <button type="button" class="btn sm primary sb-mover" data-x="sb-mover" ${prev.ok ? '' : 'disabled'} title="${prev.assoc ? 'Associa o programa ou site à subtarefa: tudo dele passa a contar lá, inclusive nos próximos registros' : 'Marca o trecho com a subtarefa escolhida. O tempo continua na sessão. Dá para desfazer logo abaixo.'}">${rotuloBtn}</button>
    </div>${lembrar}<div class="small sb-previa ${prev.ok ? '' : 'muted'}">${esc(prev.txt)}</div></div>`;
  const ult = SB_ULT && SB_ULT.key === e.id ? `<div class="sb-ultimo"><span class="small">${esc(SB_ULT.txt)}</span><button type="button" class="btn sm" data-x="sb-desfaz" title="Volta a marcação como estava antes dessa última ação. O tempo da sessão não muda.">Desfazer</button></div>` : '';
  return `<div class="act-sec sb-sec">${cab(btns)}${criar}${agora}${faixa}<div class="sb-cols">${chips}${form}</div>${ult}</div>`;
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
  if (x === 'sb-fold') { db.setSetting('sbFechado', !db.setting('sbFechado', false)); sbRefresh(); return true; }
  if (x === 'sb-det') { sbDetalhe(ctx, b.dataset.k); return true; }
  if (x === 'sb-etapa') { ACTIONS['etapa-fim']({ dataset: { id: e.id } }); return true; }
  if (x === 'sb-atual') { sbTrocaCorrente(e, b.dataset.k); db.emit(); ctx.refresh(); toast('Etapa atual trocada: o tempo sem programa vai para ela a partir de agora'); return true; }
  if (x === 'sb-dest') { S.dest = S.dest === b.dataset.k ? '' : b.dataset.k; sbRefresh(); return true; }
  if (x === 'sb-rm') { S.ranges.splice(Number(b.dataset.i), 1); sbRefresh(); return true; }
  if (x === 'sb-limpar') { S.ranges = []; S.app = ''; sbRefresh(); return true; }
  if (x === 'sb-nova') { S.criando = !S.criando; sbRefresh(); const i = document.querySelector('.sb-sec [data-sb="nome"]'); if (i) i.focus(); return true; }
  if (x === 'sb-criar') { sbCriar(e); return true; }
  if (x === 'sb-mover') { sbMover(ctx); return true; }
  if (x === 'sb-desfaz') { const u = SB_ULT; SB_ULT = null; if (u && u.key === e.id) u.run(); ctx.refresh(); toast('Marcação desfeita'); return true; }
  return false;
}
function sbRenomeia(ctx, id, nome) {
  const t = db.get('tempo_tasks', id); if (!t) return false;
  nome = String(nome || '').trim();
  if (!nome) { toast('Dê um nome para a subtarefa'); return false; }
  const mae = etapaMae(ctx.e);
  if (mae && subtasksOf(mae.id).some(x => x.id !== id && x.name.trim().toLowerCase() === nome.toLowerCase())) { toast('Já existe uma subtarefa com esse nome'); return false; }
  const antes = t.name; if (nome === antes) return true;
  db.update('tempo_tasks', id, { name: nome }, true); db.emit();
  sbLembraDesfazer(ctx.e.id, `Subtarefa renomeada para “${nome}”.`, () => { db.update('tempo_tasks', id, { name: antes }, true); db.emit(); });
  sbRefresh(); return true;
}
/* Apagar: a subtarefa e as marcações dela somem; sessões que eram dela passam para a tarefa mãe (nenhum tempo se perde). */
async function sbApaga(ctx, id) {
  const t = db.get('tempo_tasks', id), S = sbEstado(ctx.e.id); if (!t) return false;
  const mae = db.get('tempo_tasks', t.parent_id); if (!mae) return false;
  if (!await confirmBox({ title: 'Apagar subtarefa?', body: `“${esc(t.name)}” sai da lista e das marcações. O tempo continua nas sessões, na tarefa ${esc(mae.name)}.`, ok: 'Apagar', danger: true })) return false;
  const copia = { ...t };
  const ents = db.all('tempo_time_entries').filter(x => x.task_id === id).map(x => x.id);
  const mapa = db.setting('sbDiv', {}) || {}; const divsAntes = JSON.parse(JSON.stringify(mapa)); const atualAntes = JSON.parse(JSON.stringify(db.setting('etapaAtual', {}) || {}));
  const novo = {}; Object.keys(mapa).forEach(k => { const l = (mapa[k] || []).filter(d => d.sub !== id); if (l.length) novo[k] = l; });
  db.setSetting('sbDiv', novo);
  const at = { ...atualAntes }; Object.keys(at).forEach(k => { if (at[k] === id) delete at[k]; }); db.setSetting('etapaAtual', at);
  ents.forEach(x => db.update('tempo_time_entries', x, { task_id: mae.id }, true));
  db.remove('tempo_tasks', id, true);
  S.det = ''; if (S.dest === id) S.dest = '';
  db.emit(); sbRefresh();
  sbLembraDesfazer(ctx.e.id, `Subtarefa “${t.name}” apagada.`, () => {
    db.insert('tempo_tasks', copia, true);
    ents.forEach(x => db.update('tempo_time_entries', x, { task_id: id }, true));
    db.setSetting('sbDiv', divsAntes); db.setSetting('etapaAtual', atualAntes); db.emit();
  });
  sbRefresh();
  toast(`Subtarefa “${esc(t.name)}” apagada`, { ms: 9000, actions: [{ label: 'Desfazer', run: () => { const u = SB_ULT; SB_ULT = null; if (u) u.run(); sbRefresh(); toast('Desfeito'); } }] });
  return true;
}
/* ---------- janela "Detalhes" da subtarefa ---------- */
/* Tudo que a subtarefa tem: tempo marcado dentro das sessões + sessões antigas que eram só dela, programas usados nesse tempo. */
function sbDetalheDados(subId) {
  const now = Date.now(); const regs = []; const prog = {};
  const somaProg = (a, b) => actPoolBetween(a, b).forEach(r => {
    if (typeof pausaRec === 'function' && pausaRec(r) && !actWaTrabalho(r)) return;
    const x = Math.max(a, SB_T(r.from)), y = Math.min(b, SB_T(r.to)); if (y <= x) return;
    const k = shortProgram(r.app) || r.app; prog[k] = (prog[k] || 0) + (y - x);
  });
  const subT = db.get('tempo_tasks', subId), maeT = subT && db.get('tempo_tasks', subT.parent_id);
  if (maeT) sbEntriesDe(maeT).forEach(e => {
    if (e.task_id === subId) return;
    sbDivsEf(e, now).filter(d => d.sub === subId).forEach(d => sbInter(sbWork(e, now), [d]).forEach(c => { regs.push({ a: c.a, b: c.b, ms: c.b - c.a, sessao: e }); somaProg(c.a, c.b); }));
  });
  db.all('tempo_time_entries').filter(e => e.task_id === subId).forEach(e => sbWork(e, now).forEach(c => { regs.push({ a: c.a, b: c.b, ms: c.b - c.a, sessao: e, propria: true }); somaProg(c.a, c.b); }));
  regs.sort((p, q) => q.a - p.a);
  const total = regs.reduce((t, r) => t + r.ms, 0);
  const apps = Object.entries(prog).sort((p, q) => q[1] - p[1]);
  return { regs, total, apps, sessoes: new Set(regs.map(r => r.sessao.id)).size };
}
/* Programas usados nas sessões da tarefa (ainda não associados a esta subtarefa), do que mais ao que menos tempo: as sugestões. */
function sbSugestoesDe(sub) {
  const mae = db.get('tempo_tasks', sub.parent_id); if (!mae || typeof actList !== 'function') return [];
  const subs = subtasksOf(mae.id); const meus = subProgsDe(sub.id);
  const por = {}; const now = Date.now();
  sbEntriesDe(mae).forEach(e => {
    const work = sbWork(e, now); if (!work.length) return;
    actList(e.id).forEach(r => {
      if (typeof pausaRec === 'function' && pausaRec(r) && !(typeof actWaTrabalho === 'function' && actWaTrabalho(r))) return;
      const nome = subCanon(r); if (!nome) return;
      const ms = sbLen(sbInter(work, [{ a: SB_T(r.from), b: SB_T(r.to) }])); if (ms <= 0) return;
      const site = typeof isChromeSite === 'function' && isChromeSite(r.app, r.doc);
      const k = subChave(nome); por[k] = por[k] || { nome, ms: 0, site }; por[k].ms += ms;
    });
  });
  return Object.values(por).filter(x => x.ms >= 60e3 && !meus.some(n => subMesmo(n, x.nome))).sort((p, q) => q.ms - p.ms).slice(0, 10)
    .map(x => ({ ...x, em: subs.find(o => o.id !== sub.id && subProgsDe(o.id).some(n => subMesmo(n, x.nome))) || null }));
}
function sbDetalheHTML(sub) {
  const D = sbDetalheDados(sub.id), mae = db.get('tempo_tasks', sub.parent_id);
  const ps = subProgsDe(sub.id); const padrao = subProgsPadrao(sub.id);
  const maxApp = D.apps.length ? D.apps[0][1] : 1; const sug = sbSugestoesDe(sub);
  const dia = (ms) => new Date(ms).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const tarefaDe = (e) => db.get('tempo_tasks', e.task_id)?.name || '';
  return `<div class="dh"><h2>Subtarefa${mae ? ` <span class="faint">de ${esc(mae.name)}</span>` : ''}</h2><span class="grow"></span><button class="btn icon ghost" data-sbd="fechar" aria-label="Fechar" title="Fechar">${icon('x')}</button></div>
  <div class="db stack" style="gap:14px">
    <div class="field"><label for="sbd-nome">Nome</label><div class="row" style="gap:6px"><input id="sbd-nome" class="input" value="${esc(sub.name)}" autocomplete="off"><button type="button" class="btn primary" data-sbd="salvar" title="Salvar o novo nome (Enter)">Salvar</button></div></div>
    <div class="sbd-resumo"><div><span class="small muted">Tempo registrado</span><b class="mono">${D.total ? fmtDur(D.total) : '—'}</b></div><div><span class="small muted">Trechos</span><b class="mono">${D.regs.length}</b></div><div><span class="small muted">Sessões</span><b class="mono">${D.sessoes}</b></div></div>
    <div class="small muted" style="margin-top:-6px">Esse tempo continua dentro da tarefa${mae ? ` ${esc(mae.name)}` : ''}: a subtarefa só mostra a parte dele.</div>
    <div><div class="lbl">Programas usados nesse tempo</div>${D.apps.length ? D.apps.slice(0, 8).map(([k, ms]) => `<div class="sbd-app"><span class="sbd-an">${esc(k)}</span><span class="sbd-bar"><i style="width:${Math.max(3, Math.round(ms / maxApp * 100))}%"></i></span><b class="mono small">${fmtDur(ms)}</b></div>`).join('') : '<div class="small muted">Ainda não tem tempo marcado nesta subtarefa.</div>'}</div>
    <div class="field"><label>Programas e sites desta subtarefa</label>
      <div class="sp-chips">${ps.map(n => `<span class="sp-chip" ${padrao.includes(n) ? `data-tip="Automático: tudo de ${esc(n)} vai para esta subtarefa. Clique no × para tirar."` : ''}>${esc(n)}<button type="button" data-sbd="tira" data-n="${esc(n)}" aria-label="Tirar ${esc(n)}" title="Tirar ${esc(n)} desta subtarefa">×</button></span>`).join('') || '<span class="small muted">Nenhum</span>'}
      <select class="sp-add" data-sbd="add" aria-label="Associar um programa ou site" title="Associar um programa ou site a esta subtarefa"><option value="">+ Associar…</option>${subOpcoesHTML(sub.project_id, ps)}</select></div>
      <div class="small muted" style="margin-top:6px">Associar aplica na hora: o tempo do programa ou site nas sessões da tarefa passa a contar aqui (sem tirar da sessão). O que você marcar à mão na barra vale mais; se passar para outra subtarefa, vale a nova.</div></div>
    ${sug.length ? `<div class="field"><label>Sugestões <span class="faint">(usados nas sessões desta tarefa e ainda não associados)</span></label><div class="sbd-sugs">${sug.map(x => `<div class="sbd-sug-l"><span class="sbd-an">${esc(x.nome)}${x.site ? ' <span class="faint small">site</span>' : ''}</span><b class="mono small" data-tip="Tempo nas sessões desta tarefa">${fmtDur(x.ms)}</b><span class="small muted sbd-sug-em">${x.em ? 'em ' + esc(x.em.name) : ''}</span><button type="button" class="btn sm" data-sbd="assoc" data-n="${esc(x.nome)}" title="${x.em ? `Hoje ${esc(x.nome)} está em “${esc(x.em.name)}”. Se associar aqui, vale esta subtarefa.` : `Associar ${esc(x.nome)} a esta subtarefa: o tempo dele nas sessões já passa a contar aqui`}">Associar</button></div>`).join('')}</div></div>` : ''}
    <div><div class="lbl">Registros</div>${D.regs.length ? `<div class="sbd-regs">${D.regs.slice(0, 40).map(r => `<div class="sbd-reg"><span class="small">${esc(dia(r.a))}</span><span class="mono small muted">${sbHM(r.a)}–${sbHM(r.b)}</span><span class="small muted sbd-rn">${r.propria ? 'sessão própria' : 'dentro de “' + esc(tarefaDe(r.sessao) || 'sessão') + '”'}</span><b class="mono small">${fmtDur(r.ms)}</b></div>`).join('')}${D.regs.length > 40 ? `<div class="small muted">+ ${D.regs.length - 40} trechos mais antigos</div>` : ''}</div>` : '<div class="small muted">Nenhum registro.</div>'}</div>
  </div>
  <div class="df"><button type="button" class="btn danger" data-sbd="apagar" title="Apaga a subtarefa. O tempo continua nas sessões. Dá para desfazer logo depois.">${icon('trash')} Apagar subtarefa</button><span class="grow"></span><button type="button" class="btn" data-sbd="fechar">Fechar</button></div>`;
}
function sbDetalhe(ctx, subId) {
  if (!db.get('tempo_tasks', subId)) return;
  const ly = openLayer({ wide: true, render: () => { const t = db.get('tempo_tasks', subId); return t ? sbDetalheHTML(t) : ''; } });
  const salvar = () => { const v = ly.box.querySelector('#sbd-nome')?.value; if (sbRenomeia(ctx, subId, v)) ly.refresh(); };
  ly.box.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-sbd]'); if (!b) return; const k = b.dataset.sbd;
    if (k === 'fechar') ly.close();
    else if (k === 'salvar') salvar();
    else if (k === 'tira') { subTira(subId, b.dataset.n); db.emit(); ly.refresh(); sbRefresh(); }
    else if (k === 'assoc') { subAssocia(subId, b.dataset.n); db.emit(); ly.refresh(); sbRefresh(); }
    else if (k === 'apagar') { if (await sbApaga(ctx, subId)) { ly.close(); ctx.refresh && ctx.refresh(); } }
  });
  ly.box.addEventListener('change', (ev) => {
    const el = ev.target; if (el.dataset?.sbd !== 'add' || !el.value) return;
    subAssocia(subId, el.value); db.emit(); ly.refresh(); sbRefresh();
  });
  ly.box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'sbd-nome') { ev.preventDefault(); salvar(); } });
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
  if (k === 'arq') { S.arq = el.value; if (S.arq && !S.dest) { const r = subRegraDoNome(S.arq), mae = r && etapaMae(ctx.e); if (r && mae) { const sub = subtasksOf(mae.id).find(x => subNorm(x.name) === subNorm(r.sub)); if (sub) S.dest = sub.id; else { S.dest = '__novo'; S.novo = r.sub; } } } sbRefresh(); }
  else if (k === 'conf') { S.conf = el.value; sbRefresh(); }
  else if (k === 'app') {
    S.app = el.value; S.arq = '';
    // regra de sempre: Pinterest → Procura de referência, Magnific → Geração de Imagem IA (só sugere o destino, se você ainda não escolheu)
    const r = S.app && !S.dest ? subRegraDoNome(String(S.app).replace(/^(p:|site:)/, '')) : null, mae = r && etapaMae(ctx.e);
    if (r && mae) { const sub = subtasksOf(mae.id).find(x => subNorm(x.name) === subNorm(r.sub)); if (sub) S.dest = sub.id; else { S.dest = '__novo'; S.novo = r.sub; } }
    sbRefresh();
  }
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
  const app = S.app ? A.todos.find(g => g.id === S.app) : null;
  const nome = dest === mae.id ? 'Sem subtarefa' : db.get('tempo_tasks', dest)?.name;
  if (p.assoc) {
    const nome1 = S.arq || (app && app.label); if (!nome1) return;
    const conflito = subtasksOf(mae.id).some(x => x.id !== dest && subProgsDe(x.id).some(n => subMesmo(n, app.label)));
    if (!(conflito && S.conf === 'dividir')) subAssocia(dest, conflito && S.conf === 'arquivo' && S.arq ? S.arq : (S.conf === 'tudo' || !conflito ? (S.arq || app.label) : nome1));
    S.app = ''; S.arq = ''; S.conf = 'tudo'; S.novo = ''; S.lembrar = false; S.dest = dest;
    db.emit(); ctx.refresh(); toast(`${nome1} associado a ${nome}. Tudo dele nesta tarefa conta lá.`, { ms: 7000 }); return;
  }
  const cuts = sbCortes(S, A);
  const r = sbPintar(e, cuts, dest, '');
  if (!r) { toast('Nada para marcar'); return; }
  const nome1 = S.arq || (app && app.label);
  const conflito = app && dest !== mae.id && subtasksOf(mae.id).some(x => x.id !== dest && subProgsDe(x.id).some(n => subMesmo(n, app.label)));
  if (app && dest !== mae.id) {
    if (conflito) { if (S.conf === 'tudo') subAssocia(dest, app.label); else if (S.conf === 'arquivo' && S.arq) subAssocia(dest, S.arq); }
    else if (S.lembrar) subAssocia(dest, nome1);
  }
  S.ranges = []; S.app = ''; S.arq = ''; S.conf = 'tudo'; S.novo = ''; S.dest = dest === mae.id ? 'sem' : dest; S.lembrar = false;
  const txt = `${fmtDur(r.ms)}${app ? ' de ' + app.label : ''} marcados como ${dest === mae.id ? 'sem subtarefa' : nome}.`;
  sbLembraDesfazer(e.id, txt, r.desfazer);
  ctx.refresh();
  toast(txt + ' O tempo continua na sessão.', { ms: 9000, actions: [{ label: 'Desfazer', run: () => { r.desfazer(); SB_ULT = null; ctx.refresh(); toast('Desfeito'); } }] });
}

/* ---------- etapa atual e fim da sessão ---------- */
function sbEtapaAtual(entryId) { const id = (db.setting('etapaAtual', {}) || {})[entryId]; return id ? db.get('tempo_tasks', id) : null; }
function sbGuardaEtapaAtual(entryId, subId, quando) {
  const m = { ...(db.setting('etapaAtual', {}) || {}) };
  if (subId) m[entryId] = subId; else delete m[entryId];
  db.setSetting('etapaAtual', m);
  if (subId) { const e = db.get('tempo_time_entries', entryId); if (e) sbTrocaCorrente(e, subId, quando); }
}
/* Ao encerrar: a etapa que estava rodando fecha sozinha, até o fim da sessão (com "Desfazer"). */
function etapaFechaAoEncerrar(entryId) {
  const sub = sbEtapaAtual(entryId); const e = db.get('tempo_time_entries', entryId);
  if (!sub || !e || e.state !== 'done') return null;
  const ini = SB_T(etapaInicio(e)), fim = SB_T(entryEnd(e) || Date.now());
  sbGuardaEtapaAtual(entryId, null);
  if (fim - ini < 60e3) return null;
  const r = sbPintar(e, [{ a: ini, b: fim }], sub.id, `Etapa “${sub.name}” fechada ao encerrar a sessão`);
  if (r) toast(`Etapa “${esc(sub.name)}”: ${fmtDur(r.ms)} marcados`, { ms: 9000, actions: [{ label: 'Desfazer', run: () => { r.desfazer(); toast('Desfeito'); } }] });
  return r;
}
