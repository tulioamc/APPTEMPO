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
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(t.deadline_time || '') ? t.deadline_time : planoHora(typeof planoCfg === 'function' ? planoCfg().fim : 19);
  const d = new Date(`${t.deadline}T${hora}:00`);
  return isNaN(d) ? null : d;   // data ou hora que não existe: a tarefa fica sem entrega (o Calendário avisa) em vez de quebrar a conta
}
const tkDataOk = (d) => (d instanceof Date && !isNaN(d)) ? d : null;
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
/* Ordem da fila. "Sem pressa" (24/11): vai depois de todas as outras e anda conforme entram novas; se tem entrega e ela
   chega perto (2 dias úteis ou menos), volta para a ordem normal para não passar do prazo (e o aviso de prazo aparece). */
function tkSemPressaAtiva(t, agora = new Date()) {
  if (!t || !t.sem_pressa) return false;
  if (!t.deadline) return true;
  let d = new Date(agora); d.setHours(12, 0, 0, 0); let uteis = 0;
  while (ymd(d) < t.deadline && uteis < 3) { d.setDate(d.getDate() + 1); if (typeof planoDiaUtil !== 'function' || planoDiaUtil(ymd(d))) uteis++; }
  return uteis > 2;
}
function tkChave(t, p, agora) {
  const base = `${t.deadline || p.deadline || '9999'}T${t.deadline_time || '99'}|${String(t.order ?? 0).padStart(5, '0')}`;
  return tkSemPressaAtiva(t, agora) ? 'ZZZZ|' + base : base;
}
let _tkMotor = { k: null };
const tkUltimoBom = () => _tkMotor.v || null;   // último plano calculado sem erro
function tkMotor(agora = new Date(), dias = 120, opts = null) {
  // opts.pins: conta de "e se" (prévia ao arrastar) com outra lista de fixados — não usa nem guarda o cache
  const previa = !!(opts && opts.pins);
  const k = tkCacheKey() + '|' + dias; if (!previa && _tkMotor.k === k) return _tkMotor.v;
  const cfg = planoCfg(); const hoje = ymd(agora);
  // Combinado (24/11): o plano de HOJE não anda com o relógio nem é empurrado pelo que foi registrado. Ele é montado a partir
  // do começo do dia, com o que faltava de cada tarefa ao começar o dia; o registrado de hoje corre em paralelo.
  // Assim nada pula para outro horário ou outro dia ao longo do dia (amanhã em diante continua depois do plano de hoje).
  const nowH = 0; const ancora = new Date(hoje + 'T00:00:00');
  const d0Hoje = ancora.getTime(), d1Hoje = d0Hoje + 864e5; const hojeMs = { t: {}, p: {} };
  db.all('tempo_time_entries').forEach(e => (e.segments || []).forEach(sg => {
    if (!sg.s) return; const a = Math.max(d0Hoje, new Date(sg.s).getTime()), b = Math.min(d1Hoje, sg.e ? new Date(sg.e).getTime() : Date.now()); if (!(b > a)) return;
    if (e.task_id) { hojeMs.t[e.task_id] = (hojeMs.t[e.task_id] || 0) + (b - a); const tk = db.get('tempo_tasks', e.task_id); if (tk?.parent_id) hojeMs.t[tk.parent_id] = (hojeMs.t[tk.parent_id] || 0) + (b - a); }
    if (e.project_id) hojeMs.p[e.project_id] = (hojeMs.p[e.project_id] || 0) + (b - a);
  }));
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
      const pv = tkPrev(t); const feito = Math.max(0, taskMs(t.id) - (hojeMs.t[t.id] || 0)) / 60e3;   // até ontem
      const prevSim = pv.manual ? pv.min * H.fator : pv.min;
      itens.push({ id: t.id, t, p, pid: p.id, nome: t.name, eu: souEu(t.owner), deps: (Array.isArray(t?.depends_on) ? t.depends_on : []).filter(d => abertas.some(x => x.id === d)),
        resto: Math.ceil(Math.max(0, (Number.isFinite(prevSim) ? prevSim : 60) - feito) / 15 - 1e-6) * 15, feitoMin: feito, prev: pv.min, entrega: (() => { const a = tkEntrega(t), b = tkDataOk(entregaData(entDe[t.id])); return a && b ? (a < b ? a : b) : a || b || (p.deadline ? tkDataOk(fimExp(p.deadline)) : null); })(), marco: entDe[t.id] || null, chave: tkChave(t, p, agora) });
    });
    else if (Number(p.estimated_hours) > 0) {
      const falta = Number(p.estimated_hours) * 60 - Math.max(0, projectMs(p.id) - (hojeMs.p[p.id] || 0)) / 60e3;
      if (falta > 3) itens.push({ id: 'p:' + p.id, _q: 1, t: null, p, pid: p.id, nome: p.name, eu: true, deps: [], resto: Math.ceil(falta / 15) * 15, feitoMin: 0, prev: falta, entrega: p.deadline ? fimExp(p.deadline) : null, chave: `${p.deadline || '9999'}T99|00000` });
    }
  });
  const porId = Object.fromEntries(itens.map(x => [x.id, x]));
  const ordem = []; const visto = new Set(), andando = new Set();
  const ciclos = [];   // dependências que dão a volta (A espera B e B espera A): o plano as ignora e o diagnóstico avisa
  const ir = (x) => { if (visto.has(x.id) || andando.has(x.id)) return; andando.add(x.id);
    x.deps.map(d => porId[d]).filter(Boolean).sort((a, b) => a.chave.localeCompare(b.chave)).forEach(d => { if (andando.has(d.id)) ciclos.push({ de: x.id, para: d.id }); else ir(d); });
    andando.delete(x.id); visto.add(x.id); ordem.push(x); };
  [...itens].sort((a, b) => a.chave.localeCompare(b.chave)).forEach(ir);
  // 2) dias: janelas livres (menos os blocos fixados) e limite de horas
  // Bloco fixado maior que o que a tarefa precisa (24/11): o bloco encolhe ao tamanho da tarefa e o horário que sobra
  // fica livre — o trabalho solto que vem depois sobe e encosta nele (sem bloco "o plano não usa"). Só nesta conta: o salvo não muda.
  const pins = (() => {
    const l = (previa ? opts.pins : planoPins()).filter(pn => pn.dia >= hoje).map(pn => ({ ...pn }));
    // Pedaços fixados da MESMA tarefa no mesmo dia, com horário livre entre eles (ex.: o almoço encolheu): o de trás sobe e
    // encosta no da frente (24/11). Nunca pula por cima de bloco fixado de outra tarefa. Só nesta conta: o salvo não muda.
    const grupos = {}; l.filter(pn => pn.tid).forEach(pn => (grupos[pn.tid + '|' + pn.dia] ||= []).push(pn));
    // dois fixados da mesma tarefa no mesmo horário (encostados ou um por cima do outro) viram um só
    Object.values(grupos).forEach(g => { g.sort((a, b) => Number(a.ini) - Number(b.ini));
      for (let i = 1; i < g.length; i++) { const a = g[i - 1], b = g[i]; const fa = Number(a.ini) + Number(a.h);
        if (Number(b.ini) < fa - 1e-6) { a.h = Math.max(fa, Number(b.ini) + Number(b.h)) - Number(a.ini); l.splice(l.indexOf(b), 1); g.splice(i, 1); i--; } } });
    Object.values(grupos).filter(g => g.length > 1).forEach(g => {
      g.sort((a, b) => Number(a.ini) - Number(b.ini)); const dia = g[0].dia, tid = g[0].tid;
      const outros = l.filter(pn => pn.dia === dia && pn.tid !== tid).map(pn => [Number(pn.ini), Number(pn.ini) + Number(pn.h)]);
      for (let i = 1; i < g.length; i++) {
        const pe = Number(g[i - 1].ini) + Number(g[i - 1].h), cur = g[i], ci = Number(cur.ini); if (ci <= pe + 0.01) continue;
        // só o horário livre LOGO depois do pedaço da frente (encostado nele); outra tarefa mais adiante não impede
        let livres = planoJanelas(dia, cfg).jan.map(([a, b]) => [Math.max(a, pe), Math.min(b, ci)]).filter(([a, b]) => b - a > 0.24);
        outros.forEach(([p, q]) => { livres = livres.flatMap(([a, b]) => q <= a || p >= b ? [[a, b]] : [[a, Math.min(p, b)], [Math.max(q, a), b]].filter(([u, v]) => v - u > 0.24)); });
        livres = livres.filter(([a]) => a <= pe + 0.01).slice(0, 1);
        if (!livres.length) continue;
        let falta = Number(cur.h); const novos = [];
        livres.forEach(([a, b]) => { if (falta < 0.24) return; const t = Math.min(falta, Math.floor((b - a) * 4 + 1e-6) / 4); if (t < 0.24) return; novos.push({ ...cur, id: novos.length ? cur.id + '~' + novos.length : cur.id, ini: a, h: t }); falta -= t; });
        if (!novos.length) continue;
        if (falta > 0.24) novos.push({ ...cur, id: cur.id + '~r', ini: ci, h: falta });
        l.splice(l.indexOf(cur), 1, ...novos); g.splice(i, 1, ...novos); i += novos.length - 1;
      }
    });
    // depois de juntar: o que passa do que a tarefa precisa é aparado do último pedaço para o primeiro (pedaço inteiro
    // sai se sobrar; o primeiro fica com pelo menos 15 min) — nada de bloco fixado sobrando "sem uso"
    const porTid = {}; l.filter(pn => pn.tid).forEach(pn => (porTid[pn.tid] ||= []).push(pn));
    Object.entries(porTid).forEach(([tid, ps]) => {
      // tarefa que espera outra: os fixados dela podem nem valer (antes de a outra terminar) — não apara, o aviso explica
      const it = itens.find(z => z.t && z.t.id === tid && z.eu); if (!it || it.deps.length) return;
      let sobra = ps.reduce((t, pn) => t + Number(pn.h) * 60, 0) - it.resto; if (sobra < 15) return;
      ps.sort((a, b) => (b.dia + (Number(b.ini) || 0).toFixed(3).padStart(7, '0')).localeCompare(a.dia + (Number(a.ini) || 0).toFixed(3).padStart(7, '0')));   // apara do último para o primeiro
      ps.forEach((pn, i) => { if (sobra < 15) return; const min = i === ps.length - 1 ? 15 : 0; const corta = Math.min(Number(pn.h) * 60 - min, Math.floor(sobra / 15) * 15); if (corta <= 0) return; pn.h = Number(pn.h) - corta / 60; sobra -= corta; });
      ps.filter(pn => Number(pn.h) < 0.24).forEach(pn => l.splice(l.indexOf(pn), 1));
    });
    return l;
  })();
  const janCache = {};
  // Quem espera esta tarefa (direto ou em cadeia): os blocos fixados deles NÃO seguram horário dela, senão um espera o outro (24/11)
  const dependentesDe = (tid) => { const out = new Set(); if (!tid) return out; let mudou = true;
    while (mudou) { mudou = false; itens.forEach(z => { if (z.t && !out.has(z.id) && z.deps.some(d => d === tid || out.has(d))) { out.add(z.id); mudou = true; } }); }
    return out; };
  // solto: os blocos maleáveis da rotina (almoço, jantar, academia) não tiram horário — só quando a tarefa não cabe na entrega (24/11)
  const janDe = (dia, meuTid = null, solto = false) => {
    const ck = dia + '|' + (meuTid || '') + (solto ? '|s' : ''); if (janCache[ck]) return janCache[ck];
    if (!planoDiaUtil(dia)) return (janCache[ck] = { jan: [], fixos: [] });
    const dep = dependentesDe(meuTid);
    const r = planoJanelas(dia, cfg, { solto }); let jan = r.jan;
    pins.filter(pn => pn.dia === dia && !(pn.tid && dep.has(pn.tid))).forEach(pn => { const a = Number(pn.ini), b = a + Number(pn.h); jan = jan.flatMap(([x, y]) => b <= x || a >= y ? [[x, y]] : [[x, Math.min(a, y)], [Math.max(b, x), y]].filter(([u, v]) => v - u > 0.01)); });
    if (dia === hoje) jan = jan.map(([x, y]) => [Math.max(x, Math.ceil(nowH * 4) / 4), y]).filter(([x, y]) => y - x > 0.01);
    return (janCache[ck] = { jan, fixos: r.fixos });
  };
  const usado = {}; const capMin = (dia) => Math.min(planoEsticados()[dia] || cfg.horasDia, 24) * 60;
  pins.forEach(pn => { usado[pn.dia] = (usado[pn.dia] || 0) + Number(pn.h) * 60; });
  // blocos fixados: de uma tarefa (tid) só servem a ela; do projeto (sem tid) servem às tarefas dele, na ordem da fila
  const pinPool = {}; pins.slice().sort((a, b) => (a.dia + (Number(a.ini) || 0).toFixed(3).padStart(7, '0')).localeCompare(b.dia + (Number(b.ini) || 0).toFixed(3).padStart(7, '0'))).forEach(pn => { (pinPool[pn.tid ? 't:' + pn.tid : 'p:' + pn.pid] ||= []).push({ ...pn, cur: Number(pn.ini), b: Number(pn.ini) + Number(pn.h) }); });
  const limite = ymd(new Date(agora.getTime() + dias * 864e5));
  // Regra do fim do dia (24/11): se o que sobra da tarefa depois do expediente é até 1h, o dia estica e ela termina nele;
  // mais que isso, a sobra vai inteira para o próximo dia. Nunca estica por cima de rotina, compromisso ou bloco de outra tarefa.
  const esticaFim = (d, jan, b, bq0, x, falta) => {
    const resta = falta - (bq0 - x) * 60;
    if (resta <= 0.5 || resta > 60.5 || b !== jan[jan.length - 1][1] || b < cfg.fim - 0.01) return bq0;
    const depois = [...janDe(d).fixos.map(f => f[0]), ...pins.filter(pn => pn.dia === d).map(pn => Number(pn.ini))].filter(q => q >= b - 0.01);
    return Math.min(Math.min(24, ...depois), Math.ceil((bq0 + resta / 60) * 4 - 1e-6) / 4);
  };
  // anda `min` minutos a partir de `ini` (na sua fila, gastando a capacidade do dia, ou só calculando para terceiros)
  const andar = (ini, min, gasta, meuTid = null, solto = false, evita = null) => {
    // a tarefa não é dividida por bloco de OUTRA tarefa (fixado à mão): só a rotina, compromissos e o fim do dia dividem.
    // Se no meio dela aparece um bloco de outra tarefa, ela recomeça inteira depois dele (24/11).
    const dep0 = dependentesDe(meuTid);
    const outrosPins = (d) => [...pins.filter(pn => pn.dia === d && !(meuTid && pn.tid === meuTid) && !(pn.tid && dep0.has(pn.tid))).map(pn => [Number(pn.ini), Number(pn.ini) + Number(pn.h)]), ...(evita ? evita(d) : [])];
    const u0 = { ...usado };
    let comeco = ini;
    for (let tent = 0; tent < 60; tent++) {
      let falta = min; const blocos = []; let d = ymd(comeco); let fim = comeco; let ult = null; let conflito = null;
      for (let i = 0; i < dias + 7 && falta > 0.5 && d <= limite && !conflito; i++) {
        let { jan } = janDe(d, meuTid, solto);
        if (evita) evita(d).forEach(([p, q]) => { jan = jan.flatMap(([u, v]) => q <= u || p >= v ? [[u, v]] : [[u, Math.min(p, v)], [Math.max(q, u), v]].filter(([y, z]) => z - y > 0.01)); });
        const h0 = d === ymd(comeco) ? comeco.getHours() + comeco.getMinutes() / 60 : 0;
        for (const [a, b] of jan) {
          if (falta <= 0.5) break;
          let cap = gasta === true ? capMin(d) - (usado[d] || 0) : Infinity; if (cap <= 0.5) break;
          const x = Math.ceil(Math.max(a, h0) * 4 - 1e-6) / 4, bq0 = Math.floor(b * 4 + 1e-6) / 4, bq = esticaFim(d, jan, b, bq0, x, falta); if (bq - x <= 0.01) continue;
          if ((bq - x) * 60 < Math.min(30, falta) - 0.5) continue;
          // já começou: há bloco de outra tarefa entre o último pedaço e este? então não divide — recomeça depois dele
          if (ult) { const entre = []; if (ult.d !== d) for (let z = new Date(ult.d + 'T12:00:00'), k = 0; k < 40; k++) { z.setDate(z.getDate() + 1); const zd = ymd(z); if (zd >= d) break; entre.push(...outrosPins(zd)); }
            const ps = ult.d === d ? outrosPins(d).filter(([p, q]) => p < x - 1e-6 && q > ult.h + 1e-6) : [...outrosPins(ult.d).filter(([, q]) => q > ult.h + 1e-6), ...entre, ...outrosPins(d).filter(([p]) => p < x - 1e-6)];
            if (ps.length) { const q = Math.max(...(ult.d === d ? ps : outrosPins(d).filter(([p]) => p < x - 1e-6)).map(z => z[1]), 0); conflito = q > 0 ? diaDe(d, q) : diaDe(d, x); break; } }
          const take = Math.floor(Math.min(falta, (bq - x) * 60, cap) / 15 + 1e-6) * 15; if (take < 15) continue;
          blocos.push({ dia: d, ini: x, fim: x + take / 60 }); falta -= take; if (gasta) usado[d] = (usado[d] || 0) + take;
          fim = diaDe(d, x + take / 60); ult = { d, h: x + take / 60 };
        }
        const n = new Date(d + 'T12:00:00'); n.setDate(n.getDate() + 1); d = ymd(n);
      }
      if (conflito && conflito > comeco) { Object.keys(usado).forEach(k => delete usado[k]); Object.assign(usado, u0); comeco = conflito; continue; }
      return { blocos, fim: falta > 0.5 ? new Date(limite + 'T23:59:00') : fim, sobrou: falta > 0.5 };
    }
    return andarSimples(ini, min, gasta);
  };
  // versão antiga (divide em qualquer brecha): só se a de cima não achar lugar
  const andarSimples = (ini, min, gasta) => {
    let falta = min; const blocos = []; let d = ymd(ini); let fim = ini;
    for (let i = 0; i < dias + 7 && falta > 0.5 && d <= limite; i++) {
      const { jan } = janDe(d); const h0 = d === ymd(ini) ? ini.getHours() + ini.getMinutes() / 60 : 0;
      for (const [a, b] of jan) {
        if (falta <= 0.5) break;
        let cap = gasta === true ? capMin(d) - (usado[d] || 0) : Infinity; if (cap <= 0.5) break;
        const x = Math.ceil(Math.max(a, h0) * 4 - 1e-6) / 4, bq0 = Math.floor(b * 4 + 1e-6) / 4, bq = esticaFim(d, jan, b, bq0, x, falta); if (bq - x <= 0.01) continue;
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
  const res = {}; let cursor = ancora, quem = null;
  ordem.forEach(x => {
    let pronto = ancora, antes = null;
    x.deps.forEach(dd => { const r = res[dd]; if (r && r.fim > pronto) { pronto = r.fim; antes = porId[dd]?.t || null; } });
    let resto = x.resto; const blocos = []; let fim = pronto;
    // blocos fixados à mão deste projeto
    if (x.eu) [...(x.t ? pinPool['t:' + x.t.id] || [] : []), ...(pinPool['p:' + x.pid] || [])].forEach(pn => {
      if (resto <= 0.5) return; let cur = pn.cur; if (pn.dia === hoje) cur = Math.max(cur, nowH); if (pn.dia < hoje || pn.b - cur <= 0.01) return;
      // bloco fixado antes de a tarefa anterior (dependência) terminar: só vale a parte depois dela (24/11)
      if (x.deps.length) { const pd = ymd(pronto); const mot = 'antes:' + (antes?.name || ''); if (pn.dia < pd) { pn.motivo = mot; return; } if (pn.dia === pd) cur = Math.max(cur, pronto.getHours() + pronto.getMinutes() / 60); if (pn.b - cur <= 0.01) { pn.motivo = mot; return; } }
      cur = Math.ceil(cur * 4 - 1e-6) / 4; if (pn.b - cur <= 0.01) return;
      const take = Math.min(resto, (pn.b - cur) * 60); blocos.push({ dia: pn.dia, ini: cur, fim: cur + take / 60, pin: pn.id }); pn.cur = cur + take / 60; resto -= take;
      const f = diaDe(pn.dia, pn.cur); if (f > fim) fim = f;
    });
    let ini = pronto;
    if (resto > 0.5) {
      // a tarefa tem bloco fixado (você puxou)? o que falta dela encosta logo depois dele, mesmo que a fila estivesse em outro lugar (24/11)
      const ultPin = x.t ? blocos.filter(b => b.pin).map(b => diaDe(b.dia, b.fim)).sort((a, b) => b - a)[0] : null;
      // não passa por cima do que outras tarefas já ocupam ali
      const evita = (d) => Object.values(res).flatMap(y => (y.blocos || []).filter(b => b.dia === d).map(b => [b.ini, b.fim]));
      if (x.eu && ultPin) { if (ultPin > ini) ini = ultPin; const antesU = { ...usado }; let r = andar(ini, resto, true, x.t.id, false, evita);
        if (x.entrega && r.fim > x.entrega) { Object.keys(usado).forEach(k => delete usado[k]); Object.assign(usado, antesU); const r2 = andar(ini, resto, 'livre', x.t.id, false, evita); if (r2.fim <= r.fim) r = r2; else { Object.keys(usado).forEach(k => delete usado[k]); Object.assign(usado, antesU); r = andar(ini, resto, true, x.t.id, false, evita); } }
        blocos.push(...r.blocos); fim = r.fim > fim ? r.fim : fim; if (r.fim > cursor) cursor = r.fim; quem = x; }
      else if (x.eu) { if (cursor > ini) { ini = cursor; if (quem) antes = quem.t || quem.p; }
        // passa da entrega respeitando o limite de horas do dia? usa as horas livres além do limite até a entrega (24/11)
        const antesU = { ...usado }; let r = andar(ini, resto, true, x.t?.id);
        const volta = () => { Object.keys(usado).forEach(k => delete usado[k]); Object.assign(usado, antesU); };
        if (x.entrega && r.fim > x.entrega) { volta(); const r2 = andar(ini, resto, 'livre', x.t?.id); if (r2.fim < r.fim) r = r2; else { volta(); r = andar(ini, resto, true, x.t?.id); } }
        // ainda passa da entrega? usa também o horário dos blocos maleáveis da rotina (almoço, jantar, academia), só se adiantar
        if (x.entrega && r.fim > x.entrega) { const u1 = { ...usado }; volta(); const r3 = andar(ini, resto, 'livre', x.t?.id, true);
          if (r3.fim < r.fim) r = r3; else { Object.keys(usado).forEach(k => delete usado[k]); Object.assign(usado, u1); } }
        blocos.push(...r.blocos); fim = r.fim > fim ? r.fim : fim; cursor = r.fim; quem = x; }
      else { const r = andar(ini, resto, false, x.t?.id); fim = r.fim > fim ? r.fim : fim; }
    }
    const inicio = blocos.length ? diaDe(blocos[0].dia, blocos[0].ini) : ini;
    const out = { ...x, ini: inicio, fim, blocos: x.eu ? blocos : [], antes };
    if (x.t && x.prev && x.entrega && fim.getTime() > x.entrega.getTime() + 60e3) {
      out.aviso = { atraso: Math.round((fim - x.entrega) / 60e3), cabe: Math.max(0, Math.floor((tkCabe(ini, x.entrega) + x.feitoMin) / 15) * 15) };
    }
    res[x.id] = out;
  });
  // 3b) preencher buracos (24/11): tarefa sem dependência e sem bloco fixado, que cabe INTEIRA num horário livre mais cedo, vai para lá.
  // O "livre" não deveria existir se há coisa na fila. Nunca divide a tarefa, nunca passa o limite de horas do dia e não mexe em bloco fixado.
  ordem.forEach(x => {
    const r = res[x.id]; if (!r || !x.eu || !x.t || x.deps.length || !r.blocos.length || r.blocos.some(b => b.pin)) return;
    const min = r.blocos.reduce((t, b) => t + (b.fim - b.ini) * 60, 0); if (min < 15) return;
    const o0 = r.blocos[0]; const outros = Object.values(res).filter(y => y !== r && y.blocos && y.blocos.length);
    const horasDia = (dd) => outros.reduce((t, y) => t + y.blocos.filter(b => b.dia === dd).reduce((u, b) => u + b.fim - b.ini, 0), 0);
    for (let d = new Date(hoje + 'T12:00:00'); ymd(d) <= o0.dia; d.setDate(d.getDate() + 1)) {
      const dd = ymd(d); if (!planoDiaUtil(dd)) continue;
      if ((horasDia(dd) + min / 60) > capMin(dd) / 60 + 1e-6) continue;
      let livres = janDe(dd).jan.map(([a, b]) => [Math.ceil(a * 4 - 1e-6) / 4, Math.floor(b * 4 + 1e-6) / 4]);
      outros.forEach(y => y.blocos.filter(b => b.dia === dd).forEach(b => { livres = livres.flatMap(([a, c]) => b.fim <= a || b.ini >= c ? [[a, c]] : [[a, Math.min(b.ini, c)], [Math.max(b.fim + cfg.folga, a), c]].filter(([u, w]) => w - u > 0.01)); }));
      const T = (dia, h) => diaDe(dia, h).getTime();
      const noMeio = (a) => { const A = T(dd, a), B = T(dd, a + min / 60); return outros.some(y => { const bl = y.blocos.filter(b => !b.pin).map(b => [T(b.dia, b.ini), T(b.dia, b.fim)]).sort((p, q) => p[0] - q[0]); return bl.some((pc, i) => i + 1 < bl.length && A < bl[i + 1][0] - 1e3 && B > pc[1] + 1e3); }); };
      const ach = livres.find(([a, b]) => (b - a) * 60 >= min - 0.5 && !(dd === o0.dia && Math.ceil(a * 4 - 1e-6) / 4 >= o0.ini - 1e-6) && !noMeio(Math.ceil(a * 4 - 1e-6) / 4));
      if (!ach) continue;
      const ini = Math.ceil(ach[0] * 4 - 1e-6) / 4;
      if (dd === hoje && ini < nowH - 1e-6) continue;
      r.blocos = [{ dia: dd, ini, fim: ini + min / 60 }]; r.fim = diaDe(dd, ini + min / 60); r.ini = diaDe(dd, ini); r.antes = null; r.buraco = true;
      if (r.aviso && (!x.entrega || r.fim <= x.entrega)) delete r.aviso;
      break;
    }
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
    // por que está aqui (dica do bloco): a regra que o colocou neste horário
    const ent = x.entrega ? `entrega ${x.entrega.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${String(x.entrega.getHours()).padStart(2, '0')}h${String(x.entrega.getMinutes()).padStart(2, '0').replace(/^00$/, '')}` : 'sem entrega marcada';
    const porque = b.pin ? 'Você fixou este bloco aqui'
      : x.buraco ? `Encaixado num horário livre mais cedo (cabe inteiro) · ${ent}`
      : x.antes && x.deps.includes(x.antes.id) ? `Espera “${x.antes.name}” terminar · ${ent}`
      : x.antes ? `Fila: vem depois de “${x.antes.name}” (a entrega mais perto vai primeiro) · ${ent}`
      : x.blocos.some(z => z.pin) ? `Continua o bloco que você fixou · ${ent}`
      : `Primeiro da fila · ${ent}`;
    const porque2 = x.t && tkSemPressaAtiva(x.t, agora) && !b.pin ? porque + ' · sem pressa: vai depois de todas as outras' : x.t && x.t.sem_pressa && !b.pin ? porque + ' · era "sem pressa", mas a entrega está perto' : porque;
    v.blocos.push({ pid: x.pid, tid: x.t?.id || null, tarefa: x.t ? x.t.name : null, ini: b.ini, fim: b.fim, h: b.fim - b.ini, atrasado: atr, pins: b.pin ? [String(b.pin).split('~')[0]] : [], espera: x.antes ? (x.antes.name || null) : null, porque: porque2 });
    v.horas += b.fim - b.ini;
  }));
  // pedaços colados da mesma tarefa (mesmo projeto e mesmo nome) viram um bloco só, fixado ou não
  Object.values(porDia).forEach(v => {
    const ord = v.blocos.sort((a, b) => a.ini - b.ini); const out = [];
    ord.forEach(b => {
      const l = out.find(y => y.pid === b.pid && (y.tid === b.tid || (y.tarefa && y.tarefa === b.tarefa)) && Math.abs(y.fim - b.ini) < 0.02);
      if (l) { l.fim = Math.max(l.fim, b.fim); l.h = l.fim - l.ini; l.pins.push(...b.pins.filter(q => !l.pins.includes(q))); l.atrasado = l.atrasado || b.atrasado; } else out.push(b);
    });
    out.forEach(b => { b.pin = b.pins[0] || null; });
    v.blocos = out;
  });
  // 5) o que não cabe, por projeto (para o aviso do Calendário)
  const porProj = {};
  Object.values(res).filter(x => x.entrega && x.fim > x.entrega).forEach(x => { porProj[x.pid] = Math.max(porProj[x.pid] || 0, (x.fim - x.entrega) / 36e5); });
  const estouro = Object.entries(porProj).map(([pid, h]) => ({ p: db.get('tempo_projects', pid), horas: h })).filter(x => x.p);
  // 6) blocos fixados que sobraram: horário segurado que nenhuma tarefa usa (o Calendário avisa e oferece soltar)
  const pinsSobra = [];
  Object.values(pinPool).forEach(l => l.forEach(pn => {
    const ini = Math.ceil((pn.dia === hoje ? Math.max(pn.cur, nowH) : pn.cur) * 4 - 1e-6) / 4;
    if (pn.b - ini < 0.24) return;
    let motivo = pn.motivo || '';
    if (!motivo) {
      const it = pn.tid ? res[pn.tid] : null; const tk = pn.tid ? db.get('tempo_tasks', pn.tid) : null;
      if (it && !it.eu) motivo = 'terceiro';
      else if (pn.tid && !it) motivo = tk && statusParado(tk.status_id) ? 'parada' : tk && !souEu(tk.owner) ? 'terceiro' : 'fora';
      else if (!pn.tid && !Object.values(res).some(r => r.pid === pn.pid && r.eu)) motivo = 'fora';
    }
    const pid0 = String(pn.id).split('~')[0];   // pedaço de um fixado dividido pelo plano: aponta para o fixado salvo
    pinsSobra.push({ pin: pid0, dia: pn.dia, pid: pn.pid, tid: pn.tid || null, ini, fim: pn.b, motivo });
    if (porDia[pn.dia]) (porDia[pn.dia].fantasmas ||= []).push({ pin: pid0, pid: pn.pid, tid: pn.tid || null, ini, fim: pn.b, motivo });
  }));
  const v = { itens: res, porDia, estouro, pinsSobra, ciclos, fator: H.fator, nFator: H.nFator };
  // conferência final (24/11): bloco fixado que sobrou SEM motivo numa tarefa já toda planejada = maior que o necessário.
  // Apara essa sobra e refaz a conta uma vez, para o horário dela ficar livre de verdade (nada de horário "segurado" escondido).
  if (!(opts && opts._r)) {
    const cheia = (tid) => { const it = res[tid]; return it && it.eu && it.blocos.reduce((t, b) => t + (b.fim - b.ini) * 60, 0) >= it.resto - 0.5; };
    const sem = pinsSobra.filter(q => !q.motivo && q.tid && cheia(q.tid));
    if (sem.length) {
      const base = (previa ? opts.pins : planoPins()).map(pn => {
        const sb = sem.filter(q => q.pin === pn.id); if (!sb.length) return pn;
        // a sobra sai do fim do bloco (o bloco pode ter sido dividido/juntado pelo plano: conta pelo tamanho, não pela posição)
        const h = Number(pn.h) - sb.reduce((t, q) => t + (q.fim - q.ini), 0);
        return h > 0.24 ? { ...pn, h: Math.round(h * 4) / 4 } : null;
      }).filter(Boolean);
      const v2 = tkMotor(agora, dias, { pins: base, _r: 1 });
      if (!previa) _tkMotor = { k, v: v2 }; return v2;
    }
  }
  if (!previa) _tkMotor = { k, v }; return v;
}
