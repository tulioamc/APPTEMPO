/* Tarefas: tempo previsto × trabalhado e o aviso "não dá tempo".
   Simula a fila de cada projeto: você faz uma tarefa por vez (na ordem das dependências e do prazo), começando
   agora ou quando a tarefa de que ela depende termina, e só nas horas livres do Calendário (rotina, compromissos
   e to-dos com hora descontados). Se o fim previsto passa da entrega (data + hora; sem hora = fim do expediente),
   aparece o ⚠ ao lado da previsão. Terceiros trabalham em paralelo (não entram na sua fila), mas as
   dependências valem para eles também. */
const tkHHMM = (min) => { const m = Math.max(0, Math.round(min)); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const tkQuando = (d) => { const hoje = ymd(new Date()); const dia = ymd(d); const h = `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`; return dia === hoje ? `hoje ${h}` : `${fmtDate(dia).slice(0, 5)} ${h}`; };
/* "2", "2:30", "2h30", "1h", "90m", "1,5" → minutos */
function tkLerMin(v) {
  const s = String(v || '').trim().toLowerCase().replace(',', '.'); if (!s) return null;
  let m;
  if ((m = /^(\d+):(\d{1,2})$/.exec(s))) return +m[1] * 60 + +m[2];
  if ((m = /^(\d+)\s*h\s*(\d{1,2})?\s*(m|min)?$/.exec(s))) return +m[1] * 60 + (+m[2] || 0);
  if ((m = /^(\d+)\s*(m|min)$/.exec(s))) return +m[1];
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60);
  return null;
}
/* Entrega da tarefa como data/hora (sem hora: fim do expediente do Calendário). */
function tkEntrega(t) {
  if (!t.deadline) return null;
  const hora = t.deadline_time || planoHora(typeof planoCfg === 'function' ? planoCfg().fim : 19);
  return new Date(`${t.deadline}T${hora}:00`);
}
/* Anda `min` minutos de trabalho a partir de `ini`, só nas janelas livres dos dias úteis. */
function tkAndar(ini, min) {
  let falta = min; let d = new Date(ini);
  for (let i = 0; i < 60; i++) {
    const dia = ymd(d);
    if (typeof planoDiaUtil !== 'function' || planoDiaUtil(dia)) {
      const jan = typeof planoJanelas === 'function' ? planoJanelas(dia).jan : [[9, 19]];
      const h0 = dia === ymd(ini) ? ini.getHours() + ini.getMinutes() / 60 : 0;
      for (const [a, b] of jan) {
        const x = Math.max(a, h0); if (b - x <= 0.001) continue;
        if (falta <= 0) return new Date(new Date(dia + 'T00:00:00').getTime() + x * 36e5);
        const usa = Math.min(falta, (b - x) * 60);
        falta -= usa;
        if (falta <= 0.01) return new Date(new Date(dia + 'T00:00:00').getTime() + (x + usa / 60) * 36e5);
      }
    }
    d = new Date(dia + 'T00:00:00'); d.setDate(d.getDate() + 1);
  }
  return new Date(d);
}
/* Minutos de trabalho que cabem entre ini e fim (janelas livres). */
function tkCabe(ini, fim) {
  if (!(fim > ini)) return 0; let tot = 0; let d = new Date(ini);
  for (let i = 0; i < 60 && ymd(d) <= ymd(fim); i++) {
    const dia = ymd(d); const base = new Date(dia + 'T00:00:00').getTime();
    if (planoDiaUtil(dia)) planoJanelas(dia).jan.forEach(([a, b]) => {
      const x = Math.max(base + a * 36e5, ini.getTime()), y = Math.min(base + b * 36e5, fim.getTime());
      if (y > x) tot += (y - x) / 60e3;
    });
    d = new Date(base); d.setDate(d.getDate() + 1);
  }
  return Math.floor(tot);
}
/* Fila de um projeto (vem da fila única de todos os projetos). */
function tkFila(pid, agora = new Date()) { const m = tkMotor(agora); const out = {}; Object.values(m.itens).forEach(r => { if (r.pid === pid && r.t) out[r.t.id] = r; }); return out; }
/* Bloco "trabalhado / previsto" da linha da tarefa, com os avisos. */
function tkTempoHTML(t, liqMs, fila) {
  const feito = liqMs / 60e3; const pv = tkPrev(t); const prev = pv.min; const r = fila?.[t.id];
  const H = tkHistorico();
  const tipPrev = pv.manual ? `Tempo previsto (${pv.fonte}).${H.fator !== 1 ? `\nVocê costuma levar ${Math.round((H.fator - 1) * 100)}% ${H.fator > 1 ? 'a mais' : 'a menos'} do que prevê (${H.nFator} tarefas); a fila do Calendário já conta com isso.` : ''}\nEscreva 2, 2:30, 1h30 ou 90m; apague para usar a sugestão.` : `≈ Sugestão: ${pv.fonte}.\nDeixe assim para aceitar, ou escreva 2, 2:30, 1h30 ou 90m.`;
  const estourou = prev > 0 && feito > prev + 0.5;
  const ok = !['done', 'cancelled'].includes(statusCat(t.status_id));
  const aviso1 = estourou && ok ? `<button class="tk-alerta" data-x="tk-alerta" data-k="estourou" data-id="${t.id}" data-tip="${esc(`Passou ${tkHHMM(feito - prev)} do previsto (${tkHHMM(prev)}).\nClique para ajustar.`)}">${icon('alert')}</button>` : '';
  const aviso2 = r?.aviso && ok ? `<button class="tk-alerta" data-x="tk-alerta" data-k="prazo" data-id="${t.id}" data-tip="${esc(`Não dá tempo para ${r.marco ? `a ${r.marco.nome || 'entrega'}` : 'a entrega'} (${tkQuando(r.entrega)}).\n${r.antes ? `Começa depois de “${r.antes.name}”, ~${tkQuando(r.ini)}` : `Começando agora`}; com ${tkHHMM(r.resto)} que faltam, fica pronta ~${tkQuando(r.fim)} (${tkHHMM(r.aviso.atraso)} depois).\nClique para ver as opções.`)}">${icon('alert')}</button>` : '';
  return `<div class="tk-tempo${estourou ? ' estourou' : ''}">
    <span class="tk-t1">${aviso1}<b>${tkHHMM(feito)}</b><i>(trabalhado)</i></span>
    <label class="tk-t2">${aviso2}<input class="tk-prev${pv.manual ? '' : ' sug'}${pv.chute ? ' chute' : ''}" value="${pv.manual ? tkHHMM(prev) : ''}" placeholder="${pv.manual ? '--:--' : '≈' + tkHHMM(prev)}" data-pd="tprev" data-id="${t.id}" aria-label="Tempo previsto (ex.: 2, 2:30, 1h30)" data-tip="${esc(tipPrev)}"><i>(previsto)</i></label>
  </div>`;
}
/* Clique no ⚠: opções para resolver. */
async function tkAlerta(t, k) {
  if (!t) return;
  const prev = tkPrevMin(t); const feito = taskMs(t.id) / 60e3;
  if (k === 'estourou') {
    const novo = Math.ceil((feito + 30) / 15) * 15;
    const v = await choiceBox({ title: 'Passou do previsto', body: `<b>${esc(t.name)}</b>: ${tkHHMM(feito)} trabalhadas para ${tkHHMM(prev)} previstas.`, opts: [['prev', `Aumentar a previsão para ${tkHHMM(novo)}`], ['feita', 'Marcar como concluída']] });
    if (v === 'prev') db.update('tempo_tasks', t.id, { est_min: novo });
    if (v === 'feita') { const s = statusByCat('work', 'done'); if (s) setTaskStatus(t, s.id); }
    return;
  }
  const r = tkFila(t.project_id)[t.id]; if (!r?.aviso) return toast('Agora dá tempo.');
  const fimTxt = `${ymd(r.fim)} ${planoHora(r.fim.getHours() + r.fim.getMinutes() / 60)}`;
  const opts = [['resolver', 'Resolver: propor novas entregas para o projeto todo'], ['entrega', `Mudar só esta entrega para ${tkQuando(r.fim)}`]];
  if (r.aviso.cabe > 0 && r.aviso.cabe < prev) opts.push(['cabe', `Prever só ${tkHHMM(r.aviso.cabe)} (o que cabe até a entrega)`]);
  if (r.antes) opts.push(['antes', `Rever “${r.antes.name}” (é ela que segura)`]);
  const v = await choiceBox({ title: 'Não dá tempo', body: `<b>${esc(t.name)}</b> fica pronta ~<b>${tkQuando(r.fim)}</b>, mas a entrega é ${tkQuando(r.entrega)}.${r.antes ? `<br><span class="small muted">Ela começa depois de “${esc(r.antes.name)}”, que termina ~${tkQuando(r.ini)}.</span>` : ''}`, opts });
  if (v === 'resolver') return tkResolver(t.project_id);
  if (v === 'entrega') { const [dia, hora] = fimTxt.split(' '); if (dia !== t.deadline) { if (!await taskDeadlineFlow(t, dia)) return; } db.update('tempo_tasks', t.id, { deadline_time: hora }); }
  if (v === 'cabe') db.update('tempo_tasks', t.id, { est_min: r.aviso.cabe });
  if (v === 'antes') { TK_ABERTAS.add(r.antes.id); render(); setTimeout(() => document.querySelector(`[data-pd="tprev"][data-id="${r.antes.id}"]`)?.focus(), 80); }
}
/* Janela com botões de escolha; devolve a chave escolhida ou null. */
function choiceBox({ title, body, opts }) {
  return new Promise(res => {
    let feito = false;
    const l = openLayer({ html: `<div class="dh">${icon('alert')}<h2>${esc(title)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div><div class="db"><p style="margin:0 0 12px">${body}</p><div class="stack" style="gap:6px">${opts.map(([k, l], i) => `<button class="btn${i === 0 ? ' primary' : ''}" style="justify-content:flex-start" data-c="${k}">${esc(l)}</button>`).join('')}</div></div><div class="df"><button class="btn ghost" data-c="__cancelar">Cancelar</button></div>`, onClose: () => { if (!feito) res(null); } });
    l.box.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; feito = true; res(b.dataset.c === '__cancelar' ? null : b.dataset.c); l.close(); });
  });
}

/* Resolver: pega todas as tarefas do projeto que não cabem e propõe a entrega nova de cada uma (quando fica pronta
   pela fila, arredondado para cima em 15 min). Mostra antes × depois e só muda ao confirmar (vai para o histórico de prazo). */
const tkArred15 = (d) => { const x = new Date(d); const m = x.getMinutes(); const add = (15 - (m % 15)) % 15; x.setMinutes(m + add, 0, 0); return x; };
function tkProblemas(pid) { const f = tkFila(pid); return db.where('tempo_tasks', t => t.project_id === pid && !t.parent_id && f[t.id]?.aviso).map(t => ({ t, r: f[t.id] })); }
async function tkResolver(pid) {
  const lista = tkProblemas(pid).sort((a, b) => a.r.fim - b.r.fim);
  if (!lista.length) return toast('Tudo cabe no prazo.');
  const prop = lista.map(({ t, r }) => { const n = tkArred15(r.fim); return { t, dia: ymd(n), hora: planoHora(n.getHours() + n.getMinutes() / 60), antes: r.entrega, depois: n }; });
  const linhas = prop.map(x => `<tr><td><b>${esc(x.t.name)}</b></td><td class="muted">${tkQuando(x.antes)}</td><td>→</td><td><b>${tkQuando(x.depois)}</b></td></tr>`).join('');
  const ok = await confirmBox({ title: 'Novas entregas', body: `Com o tempo previsto e as horas livres do Calendário, estas tarefas ficam prontas depois da entrega. Proposta:<table class="grid static compact" style="margin-top:10px"><thead><tr><th>Tarefa</th><th>Hoje</th><th></th><th>Nova entrega</th></tr></thead><tbody>${linhas}</tbody></table><div class="small muted" style="margin-top:8px">As outras tarefas ficam como estão. Cada mudança vai para o histórico de prazo.</div>`, ok: `Aplicar ${prop.length} mudança${prop.length > 1 ? 's' : ''}` });
  if (!ok) return;
  prop.forEach(x => { if (x.dia !== x.t.deadline) changeTaskDeadline(x.t, x.dia, 'Reorganizado (não cabia no tempo previsto)'); db.update('tempo_tasks', x.t.id, { deadline_time: x.hora }, true); });
  db.emit(); toast('Entregas reorganizadas');
}
/* Aviso no topo da lista de tarefas quando alguma não cabe. */
function tkResolverBarraHTML(pid) {
  const n = tkProblemas(pid).length; if (!n) return '';
  return `<div class="banner danger small row" style="margin:0 0 8px">${icon('alert')} ${n} tarefa${n > 1 ? 's' : ''} não cabe${n > 1 ? 'm' : ''} no prazo com o tempo previsto<span class="grow"></span><button class="btn sm primary" data-x="tk-resolver" data-id="${pid}">Resolver</button></div>`;
}

/* =====================================================================
   PREVISÃO SUGERIDA (aprende com o histórico)
   Tarefa sem previsão digitada usa uma sugestão, em degraus: mesmo nome e tipo → nome parecido → mesmo tipo de
   trabalho → projetos parecidos (horas por tarefa) → horas estimadas do projeto → 1h (chute). Mediana, não média.
   O histórico é toda tarefa concluída com pelo menos 10 min registrados: alimenta-se sozinho.
   ===================================================================== */
const TK_ALIAS = { dooh: 'ooh', kvs: 'kv', key: 'kv', keyvisual: 'kv', reels: 'reel', posts: 'post', stories: 'story', storys: 'story', videos: 'video' };
const tkNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\[ajuste[^\]]*\]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
const tkRaiz = (s) => { const w = tkNorm(s).split(' ').filter(x => x.length > 1)[0] || ''; return TK_ALIAS[w] || w; };
const tkMediana = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const tkCacheKey = () => `${db.writes || 0}|${db.ver || 0}|${Math.floor(Date.now() / 60e3)}`;
let _tkHist = { k: null };
function tkHistorico() {
  const k = tkCacheKey(); if (_tkHist.k === k) return _tkHist;
  const feitas = db.where('tempo_tasks', t => statusCat(t.status_id) === 'done').map(t => {
    const p = db.get('tempo_projects', t.project_id); const min = taskMs(t.id) / 60e3;
    return { id: t.id, nome: tkNorm(t.name), raiz: tkRaiz(t.name), wt: t.work_type_id || p?.work_type_id || null, min, est: Number(t.est_min) || 0, pid: t.project_id };
  }).filter(x => x.min >= 10);
  // projetos concluídos com tempo: horas por tarefa (para quando ainda não há tarefas com tempo)
  const projs = projects().filter(p => statusCat(p.status_id) === 'done' && p.work_type_id).map(p => {
    const n = db.where('tempo_tasks', t => t.project_id === p.id && !t.parent_id).length; const ms = projectMs(p.id);
    return n && ms > 10 * 60e3 ? { wt: p.work_type_id, min: ms / 60e3 / n } : null;
  }).filter(Boolean);
  // seu "otimismo": real ÷ previsto, com 10+ tarefas que tinham previsão
  const pares = feitas.filter(x => x.est > 0).map(x => x.min / x.est);
  const fator = pares.length >= 10 ? Math.min(2.5, Math.max(0.6, tkMediana(pares))) : 1;
  _tkHist = { k, feitas, projs, fator, nFator: pares.length };
  return _tkHist;
}
const tkFaixa = (l) => { const s = l.map(x => x.min).sort((a, b) => a - b); return s.length > 1 ? ` (variou de ${tkHHMM(s[0])} a ${tkHHMM(s[s.length - 1])})` : ''; };
function tkSugestao(t) {
  const H = tkHistorico(); const p = db.get('tempo_projects', t.project_id);
  const wt = t.work_type_id || p?.work_type_id || null; const wtNome = wt ? (db.get('tempo_work_types', wt)?.name || 'este tipo') : '';
  const outras = H.feitas.filter(x => x.id !== t.id); const nome = tkNorm(t.name), raiz = tkRaiz(t.name);
  const arred = (m) => Math.max(15, Math.round(m / 15) * 15);
  const de = (l, txt) => ({ min: arred(tkMediana(l.map(x => x.min))), fonte: `mediana de ${l.length} ${txt}${tkFaixa(l)}`, n: l.length });
  let l = outras.filter(x => x.nome === nome && (!wt || x.wt === wt)); if (nome && l.length) return de(l, `“${t.name}”${wtNome ? ' em ' + wtNome : ''}`);
  l = outras.filter(x => raiz && x.raiz === raiz && (!wt || !x.wt || x.wt === wt)); if (l.length) return de(l, `tarefas “${raiz.toUpperCase()}…”${wtNome ? ' em ' + wtNome : ''}`);
  l = outras.filter(x => wt && x.wt === wt); if (l.length >= 2) return de(l, `tarefas de ${wtNome}`);
  l = H.projs.filter(x => wt && x.wt === wt); if (l.length >= 2) return de(l, `projetos de ${wtNome} (horas por tarefa)`);
  if (p && Number(p.estimated_hours) > 0) {
    const abertas = db.where('tempo_tasks', x => x.project_id === p.id && !x.parent_id && !['done', 'cancelled'].includes(statusCat(x.status_id)));
    const semPrev = abertas.filter(x => !(Number(x.est_min) > 0)).length || 1;
    const sobra = Number(p.estimated_hours) * 60 - projectMs(p.id) / 60e3 - abertas.reduce((s, x) => s + (Number(x.est_min) || 0), 0);
    if (sobra > 0) return { min: arred(sobra / semPrev), fonte: `horas estimadas do projeto divididas entre ${semPrev} tarefa${semPrev > 1 ? 's' : ''} sem previsão`, n: 0 };
  }
  return { min: 60, fonte: 'sem histórico parecido ainda: chute de 1h', n: 0, chute: true };
}
/* Previsão da tarefa: { min, manual, fonte }. A digitada vale; senão a sugestão. */
function tkPrev(t) {
  if (Number(t.est_min) > 0) return { min: Number(t.est_min), manual: true, fonte: 'digitada' };
  const est = typeof estimadoDaTarefa === 'function' ? estimadoDaTarefa(t) : null;
  if (est) return { min: Math.round(est * 60), manual: true, fonte: 'do orçamento' };
  const s = tkSugestao(t); return { ...s, manual: false };
}
const tkPrevMin = (t) => tkPrev(t).min;

/* =====================================================================
   FILA ÚNICA (todos os projetos) = planejado do Calendário
   Suas tarefas abertas, de todos os projetos ativos, uma por vez: ordem das dependências e da entrega mais perto,
   nas horas livres de cada dia útil (rotina, compromissos, to-dos com hora e bloqueios fora; até o limite de horas
   do dia). Blocos fixados à mão (arrastados no Calendário) ficam onde estão e contam para as tarefas daquele projeto.
   Projeto ativo sem tarefas abertas usa as horas estimadas que faltam. Terceiros correm em paralelo.
   ===================================================================== */
let _tkMotor = { k: null };
function tkMotor(agora = new Date(), dias = 120) {
  const k = tkCacheKey() + '|' + dias; if (_tkMotor.k === k) return _tkMotor.v;
  const cfg = planoCfg(); const hoje = ymd(agora); const nowH = agora.getHours() + agora.getMinutes() / 60;
  const H = tkHistorico();
  const diaDe = (dia, h) => new Date(new Date(dia + 'T00:00:00').getTime() + h * 36e5);
  const fimExp = (dia) => diaDe(dia, cfg.fim);
  // 1) itens
  const ativos = projects().filter(p => !p.archived && ['todo', 'active'].includes(statusCat(p.status_id)) && !statusParado(p.status_id));
  const itens = [];
  ativos.forEach(p => {
    const entDe = typeof projEntregaDasTarefas === 'function' ? projEntregaDasTarefas(p.id) : {};
    const todas = db.where('tempo_tasks', t => t.project_id === p.id && !t.parent_id && !['done', 'cancelled'].includes(statusCat(t.status_id)));
    const abertas = todas.filter(t => !statusParado(t.status_id));   // esperando cliente/aprovação: fora da fila
    if (todas.length && !abertas.length) return;
    if (abertas.length) abertas.forEach(t => {
      const pv = tkPrev(t); const feito = taskMs(t.id) / 60e3;
      const prevSim = pv.manual ? pv.min * H.fator : pv.min;
      itens.push({ id: t.id, t, p, pid: p.id, nome: t.name, eu: souEu(t.owner), deps: (Array.isArray(t?.depends_on) ? t.depends_on : []).filter(d => abertas.some(x => x.id === d)),
        resto: Math.ceil(Math.max(0, prevSim - feito) / 15 - 1e-6) * 15, feitoMin: feito, prev: pv.min, entrega: (() => { const a = tkEntrega(t), b = entregaData(entDe[t.id]); return a && b ? (a < b ? a : b) : a || b || (p.deadline ? fimExp(p.deadline) : null); })(), marco: entDe[t.id] || null, chave: `${t.deadline || p.deadline || '9999'}T${t.deadline_time || '99'}|${String(t.order ?? 0).padStart(5, '0')}` });
    });
    else if (Number(p.estimated_hours) > 0) {
      const falta = Number(p.estimated_hours) * 60 - projectMs(p.id) / 60e3;
      if (falta > 3) itens.push({ id: 'p:' + p.id, _q: 1, t: null, p, pid: p.id, nome: p.name, eu: true, deps: [], resto: Math.ceil(falta / 15) * 15, feitoMin: 0, prev: falta, entrega: p.deadline ? fimExp(p.deadline) : null, chave: `${p.deadline || '9999'}T99|00000` });
    }
  });
  const porId = Object.fromEntries(itens.map(x => [x.id, x]));
  const ordem = []; const visto = new Set(), andando = new Set();
  const ir = (x) => { if (visto.has(x.id) || andando.has(x.id)) return; andando.add(x.id); x.deps.map(d => porId[d]).filter(Boolean).sort((a, b) => a.chave.localeCompare(b.chave)).forEach(ir); andando.delete(x.id); visto.add(x.id); ordem.push(x); };
  [...itens].sort((a, b) => a.chave.localeCompare(b.chave)).forEach(ir);
  // 2) dias: janelas livres (menos os blocos fixados) e limite de horas
  const pins = planoPins().filter(pn => pn.dia >= hoje);
  const janCache = {};
  const janDe = (dia) => {
    if (janCache[dia]) return janCache[dia];
    if (!planoDiaUtil(dia)) return (janCache[dia] = { jan: [], fixos: [] });
    const r = planoJanelas(dia, cfg); let jan = r.jan;
    pins.filter(pn => pn.dia === dia).forEach(pn => { const a = Number(pn.ini), b = a + Number(pn.h); jan = jan.flatMap(([x, y]) => b <= x || a >= y ? [[x, y]] : [[x, Math.min(a, y)], [Math.max(b, x), y]].filter(([u, v]) => v - u > 0.01)); });
    if (dia === hoje) jan = jan.map(([x, y]) => [Math.max(x, Math.ceil(nowH * 4) / 4), y]).filter(([x, y]) => y - x > 0.01);
    return (janCache[dia] = { jan, fixos: r.fixos });
  };
  const usado = {}; const capMin = (dia) => Math.min(planoEsticados()[dia] || cfg.horasDia, 24) * 60;
  pins.forEach(pn => { usado[pn.dia] = (usado[pn.dia] || 0) + Number(pn.h) * 60; });
  // blocos fixados: de uma tarefa (tid) só servem a ela; do projeto (sem tid) servem às tarefas dele, na ordem da fila
  const pinPool = {}; pins.slice().sort((a, b) => (a.dia + String(a.ini).padStart(5, '0')).localeCompare(b.dia + String(b.ini).padStart(5, '0'))).forEach(pn => { (pinPool[pn.tid ? 't:' + pn.tid : 'p:' + pn.pid] ||= []).push({ ...pn, cur: Number(pn.ini), b: Number(pn.ini) + Number(pn.h) }); });
  const limite = ymd(new Date(agora.getTime() + dias * 864e5));
  // anda `min` minutos a partir de `ini` (na sua fila, gastando a capacidade do dia, ou só calculando para terceiros)
  const andar = (ini, min, gasta) => {
    let falta = min; const blocos = []; let d = ymd(ini); let fim = ini;
    for (let i = 0; i < dias + 7 && falta > 0.5 && d <= limite; i++) {
      const { jan } = janDe(d); const h0 = d === ymd(ini) ? ini.getHours() + ini.getMinutes() / 60 : 0;
      for (const [a, b] of jan) {
        if (falta <= 0.5) break;
        let cap = gasta ? capMin(d) - (usado[d] || 0) : Infinity; if (cap <= 0.5) break;
        // tudo em blocos de 15 min: começa e termina em :00, :15, :30 ou :45
        const x = Math.ceil(Math.max(a, h0) * 4 - 1e-6) / 4, bq = Math.floor(b * 4 + 1e-6) / 4; if (bq - x <= 0.01) continue;
        // sem pedacinhos: brecha menor que 30 min só serve se for o que falta para terminar
        if ((bq - x) * 60 < Math.min(30, falta) - 0.5) continue;
        const take = Math.floor(Math.min(falta, (bq - x) * 60, cap) / 15 + 1e-6) * 15; if (take < 15) continue;
        blocos.push({ dia: d, ini: x, fim: x + take / 60 }); falta -= take; if (gasta) usado[d] = (usado[d] || 0) + take;
        fim = diaDe(d, x + take / 60);
      }
      const n = new Date(d + 'T12:00:00'); n.setDate(n.getDate() + 1); d = ymd(n);
    }
    return { blocos, fim: falta > 0.5 ? new Date(limite + 'T23:59:00') : fim, sobrou: falta > 0.5 };
  };
  // 3) fila
  const res = {}; let cursor = agora, quem = null;
  ordem.forEach(x => {
    let pronto = agora, antes = null;
    x.deps.forEach(dd => { const r = res[dd]; if (r && r.fim > pronto) { pronto = r.fim; antes = porId[dd]?.t || null; } });
    let resto = x.resto; const blocos = []; let fim = pronto;
    // blocos fixados à mão deste projeto
    [...(x.t ? pinPool['t:' + x.t.id] || [] : []), ...(pinPool['p:' + x.pid] || [])].forEach(pn => {
      if (resto <= 0.5) return; let cur = pn.cur; if (pn.dia === hoje) cur = Math.max(cur, nowH); if (pn.dia < hoje || pn.b - cur <= 0.01) return;
      cur = Math.ceil(cur * 4 - 1e-6) / 4; if (pn.b - cur <= 0.01) return;
      const take = Math.min(resto, (pn.b - cur) * 60); blocos.push({ dia: pn.dia, ini: cur, fim: cur + take / 60, pin: pn.id }); pn.cur = cur + take / 60; resto -= take;
      const f = diaDe(pn.dia, pn.cur); if (f > fim) fim = f;
    });
    let ini = pronto;
    if (resto > 0.5) {
      if (x.eu) { if (cursor > ini) { ini = cursor; if (quem) antes = quem.t || quem.p; } const r = andar(ini, resto, true); blocos.push(...r.blocos); fim = r.fim > fim ? r.fim : fim; cursor = r.fim; quem = x; }
      else { const r = andar(ini, resto, false); fim = r.fim > fim ? r.fim : fim; }
    }
    const inicio = blocos.length ? diaDe(blocos[0].dia, blocos[0].ini) : ini;
    const out = { ...x, ini: inicio, fim, blocos: x.eu ? blocos : [], antes };
    if (x.t && x.prev && x.entrega && fim.getTime() > x.entrega.getTime() + 60e3) {
      out.aviso = { atraso: Math.round((fim - x.entrega) / 60e3), cabe: Math.max(0, Math.floor((tkCabe(ini, x.entrega) + x.feitoMin) / 15) * 15) };
    }
    res[x.id] = out;
  });
  // 4) planejado por dia (formato do Calendário)
  const porDia = {};
  for (let d = new Date(hoje + 'T12:00:00'), i = 0; i <= dias; i++, d.setDate(d.getDate() + 1)) {
    const dia = ymd(d); if (!planoDiaUtil(dia)) continue;
    porDia[dia] = { blocos: [], fixos: janDe(dia).fixos, horas: 0, cap: capMin(dia) / 60 };
  }
  Object.values(res).forEach(x => x.blocos.forEach(b => {
    const v = porDia[b.dia] ||= { blocos: [], fixos: [], horas: 0, cap: capMin(b.dia) / 60 };
    const atr = !!(x.entrega && diaDe(b.dia, b.fim) > x.entrega);
    v.blocos.push({ pid: x.pid, tid: x.t?.id || null, tarefa: x.t ? x.t.name : null, ini: b.ini, fim: b.fim, h: b.fim - b.ini, atrasado: atr, pins: b.pin ? [b.pin] : [] });
    v.horas += b.fim - b.ini;
  }));
  // pedaços colados da mesma tarefa (mesmo projeto e mesmo nome) viram um bloco só, fixado ou não
  Object.values(porDia).forEach(v => {
    const ord = v.blocos.sort((a, b) => a.ini - b.ini); const out = [];
    ord.forEach(b => {
      const l = out.find(y => y.pid === b.pid && (y.tid === b.tid || (y.tarefa && y.tarefa === b.tarefa)) && Math.abs(y.fim - b.ini) < 0.02);
      if (l) { l.fim = Math.max(l.fim, b.fim); l.h = l.fim - l.ini; l.pins.push(...b.pins); l.atrasado = l.atrasado || b.atrasado; } else out.push(b);
    });
    out.forEach(b => { b.pin = b.pins[0] || null; });
    v.blocos = out;
  });
  // 5) o que não cabe, por projeto (para o aviso do Calendário)
  const porProj = {};
  Object.values(res).filter(x => x.entrega && x.fim > x.entrega).forEach(x => { porProj[x.pid] = Math.max(porProj[x.pid] || 0, (x.fim - x.entrega) / 36e5); });
  const estouro = Object.entries(porProj).map(([pid, h]) => ({ p: db.get('tempo_projects', pid), horas: h })).filter(x => x.p);
  const v = { itens: res, porDia, estouro, fator: H.fator, nFator: H.nFator };
  _tkMotor = { k, v }; return v;
}
