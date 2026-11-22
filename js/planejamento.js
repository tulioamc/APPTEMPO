/* Planejamento (seção 4 do doc "Ideias organizadas"), etapa 1:
   as horas que faltam em cada projeto ativo (estimado − real) são distribuídas na agenda livre até o prazo,
   prazo mais perto primeiro, até 8 h por dia útil (o dia pode ser esticado). Horários fixos: trabalho das 9h às 19h,
   almoço 12h–14h; às segundas, buscar o Rafa 11h30–14h. Feriados, férias e bloqueios avulsos ficam fora.
   Não grava nada sozinho: o plano é refeito a cada abertura, a partir do que já foi trabalhado. */
const PLANO_PADRAO = { inicio: 9, fim: 19, horasDia: 8, folga: 0.25 };
// horários fixos por dia da semana (0 = domingo): [início, fim, nome] em horas decimais
/* Rotina fixa (editável em Planejamento › Rotina fixa). Cada bloco: { id, grupo, nome, ini, fim (horas decimais),
   dias: [0..6], repete: 'semanal' | 'quinzenal', ref (data de uma semana em que acontece, para o quinzenal),
   desde, ate (datas; mudar a rotina fecha a versão antiga ontem e abre a nova hoje, então o passado não muda) }.
   Ajuste de um dia só (arrastar ou tirar o bloco): 'planoRotinaDia' = { dia: { grupo: { ini, fim } | { off: true } } }. */
/* rafa: '' (sempre) · 'T' (o dia é T no Dias de Rafa) · 'manha' (a noite anterior foi T: manhã de escola com ele).
   flex: o bloco acompanha o que aconteceu — num dia que já passou, ele vira o espaço real sem trabalho registrado ao
   redor do horário (ex.: almoço 12h–14h, trabalho até 12h40 e de volta 13h50 → almoço 12h40–13h50). */
const PLANO_ROTINA_PADRAO = [
  { grupo: 'acordar', nome: 'Acordar e arrumar o Rafa', ini: 5.5, fim: 6.5, dias: [1, 2, 3, 4, 5], rafa: 'manha' },
  { grupo: 'escola', nome: 'Levar o Rafa à escola', ini: 6.5, fim: 7, dias: [1, 2, 3, 4, 5], rafa: 'manha' },
  { grupo: 'academia', nome: 'Academia', ini: 7 + 20 / 60, fim: 8 + 20 / 60, dias: [1, 2, 3, 4, 5], rafa: 'manha', flex: true },
  { grupo: 'volta', nome: 'Volta para casa', ini: 8 + 20 / 60, fim: 8 + 40 / 60, dias: [1, 2, 3, 4, 5], rafa: 'manha' },
  { grupo: 'rafa-escola-seg', nome: 'Buscar o Rafa na escola', ini: 11.5, fim: 13.5, dias: [1] },
  { grupo: 'almoco-seg', nome: 'Almoço', ini: 13.5, fim: 14, dias: [1], flex: true },
  { grupo: 'almoco', nome: 'Almoço', ini: 12, fim: 14, dias: [2, 3, 4, 5], flex: true },
  { grupo: 'rafa-mae', nome: 'Buscar o Rafa na casa da mãe', ini: 19, fim: 20, dias: [1, 3, 5], rafa: 'T' },
  { grupo: 'jantar', nome: 'Jantar', ini: 20, fim: 21, dias: [1, 2, 3, 4, 5], flex: true },
];
const PL_MIGRA = { acordar: { dias: [1, 2, 3, 4, 5], rafa: 'manha' }, escola: { dias: [1, 2, 3, 4, 5], rafa: 'manha' }, academia: { dias: [1, 2, 3, 4, 5], rafa: 'manha', flex: true }, volta: { dias: [1, 2, 3, 4, 5], rafa: 'manha' }, 'rafa-mae': { dias: [1, 3, 5], rafa: 'T' }, almoco: { flex: true }, 'almoco-seg': { flex: true }, jantar: { flex: true } };
function planoRotina() {
  const r = db.setting('planoRotina', null);
  if (Array.isArray(r)) {
    // rotina salva antes da ligação com o Dias de Rafa: ajusta os blocos padrão (a sexta alternada vem do Rafa agora)
    if (r.some(x => 'rafa' in x)) return r;
    return r.filter(x => x.grupo !== 'rafa-sexta').map(x => ({ rafa: '', ...x, ...(PL_MIGRA[x.grupo] || {}) }));
  }
  return PLANO_ROTINA_PADRAO.map(x => ({ id: 'pad-' + x.grupo, repete: 'semanal', desde: '2000-01-01', ate: null, rafa: '', flex: false, ...x }));
}
const planoRotinaDia = () => db.setting('planoRotinaDia', {}) || {};
const planoRafa = (dia) => (typeof rafaQuem === 'function' ? rafaQuem(dia) : null);
const planoOntem = (dia) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() - 1); return ymd(d); };
/* A regra vale neste dia? (versão em vigor, dia da semana, quinzena e dia do Rafa) */
function planoRegraVale(r, dia) {
  if ((r.desde && dia < r.desde) || (r.ate && dia > r.ate)) return false;
  const wd = new Date(dia + 'T12:00:00').getDay(); if (!(r.dias || []).includes(wd)) return false;
  if (r.repete === 'quinzenal') { if (!r.ref) return false; const sem = Math.round((new Date(dia + 'T12:00:00') - new Date(r.ref + 'T12:00:00')) / (7 * 864e5)); if (((sem % 2) + 2) % 2 !== 0) return false; }
  if (r.rafa === 'T' && planoRafa(dia) !== 'T') return false;
  if (r.rafa === 'manha' && planoRafa(planoOntem(dia)) !== 'T') return false;
  return true;
}
/* Sexta com o Rafa = sexta marcada T no Dias de Rafa. */
function planoSextaRafa(dia) { return planoRafa(dia) === 'T'; }
/* Bloco flexível num dia que já passou: o espaço sem trabalho registrado que mais cobre o horário (até 1 h antes e depois). */
function planoFlexAjusta(dia, ini, fim) {
  const hoje = ymd(new Date()); const agora = new Date(); const hAgora = agora.getHours() + agora.getMinutes() / 60;
  if (dia > hoje || (dia === hoje && hAgora < fim)) return [ini, fim];
  const work = planoFeitosDoDia(dia).map(f => [f.ini, f.fim]); if (!work.length) return [ini, fim];
  const w0 = Math.max(0, ini - 1), w1 = Math.min(24, fim + 1);
  const vaos = []; let c = w0;
  work.sort((a, b) => a[0] - b[0]).forEach(([a, b]) => { if (b <= c || a >= w1) return; if (a > c) vaos.push([c, a]); c = Math.max(c, b); });
  if (w1 > c) vaos.push([c, w1]);
  const cob = (v) => Math.max(0, Math.min(v[1], fim) - Math.max(v[0], ini));
  const melhor = vaos.filter(v => cob(v) > 0).sort((a, b) => cob(b) - cob(a))[0];
  // o bloco só se espreme dentro do próprio horário (não cresce para fora dele)
  return melhor ? [Math.max(melhor[0], ini), Math.min(melhor[1], fim)] : null;   // null = trabalhou o horário todo: o bloco não aconteceu
}
/* Blocos fixos do dia: [ini, fim, nome, { grupo, rid, ajustado, flex }] com os ajustes daquele dia. */
function planoFixosDoDia(dia) {
  const aj = planoRotinaDia()[dia] || {};
  return planoRotina().filter(r => planoRegraVale(r, dia)).map(r => {
    const a = aj[r.grupo]; if (a && a.off) return null;
    let ini = a ? Number(a.ini) : Number(r.ini), fim = a ? Number(a.fim) : Number(r.fim);
    let real = false;
    if (r.flex && !a) { const x = planoFlexAjusta(dia, ini, fim); if (!x) return null; real = x[0] !== ini || x[1] !== fim; [ini, fim] = x; }
    return [ini, fim, r.nome, { grupo: r.grupo, rid: r.id, ajustado: !!a, flex: !!r.flex, real }];
  }).filter(Boolean).sort((x, y) => x[0] - y[0]);
}
/* Início do trabalho no dia: 9h, ou antes se a rotina da manhã acaba antes disso (ex.: volta às 8h40 → trabalha 8h40). */
function planoInicioDia(dia, cfg = planoCfg()) {
  const manha = planoFixosDoDia(dia).filter(f => f[0] < cfg.inicio && f[1] <= cfg.inicio);
  return manha.length ? Math.min(cfg.inicio, Math.max(...manha.map(f => f[1]))) : cfg.inicio;
}
const planoPins = () => db.setting('planoPins', []) || [];
/* Compromissos do dia, de qualquer origem, num formato só: { id, ini, fim (horas decimais), titulo, origem, diaTodo }.
   Hoje: bloqueios marcados no app. Google Agenda: o app do Mac vai gravar os eventos em tempo_settings 'agendaEventos'
   ([{ id, ini: ISO, fim: ISO, titulo, agenda, diaTodo }]) e eles entram aqui sozinhos, ocupando a agenda como bloqueio.
   A volta (Tempo → Google) leva só o FUTURO: blocos planejados (e bloqueios) de agora em diante, com id estável por
   projeto e dia. O que foi feito (registro) nunca vai para o Google: o Tempo é passado, presente e futuro; o Google é futuro. */
function planoEventos(dia) {
  const out = planoBloqueios().filter(b => b.dia === dia).map(b => ({ id: b.id, ini: Number(b.ini), fim: Number(b.fim), titulo: b.nome || 'Bloqueio', origem: 'bloqueio' }));
  const d0 = new Date(dia + 'T00:00:00').getTime(), d1 = d0 + 864e5;
  (db.setting('agendaEventos', []) || []).forEach(ev => {
    const a = new Date(ev.ini).getTime(), b = new Date(ev.fim).getTime(); if (!(b > d0 && a < d1)) return;
    out.push({ id: ev.id, ini: Math.max(0, (a - d0) / 36e5), fim: Math.min(24, (b - d0) / 36e5), titulo: ev.titulo || 'Evento', origem: 'google', agenda: ev.agenda || '', diaTodo: !!ev.diaTodo });
  });
  // to-dos com data: com hora = compromisso no horário (fim marcado, estimativa ou 15 min); só com data = no topo do dia
  db.all('tempo_notices').filter(n => n.kind === 'todo' && n.data?.due && n.data.due.slice(0, 10) === dia).forEach(n => {
    const feito = n.status === 'done';
    if (typeof todoSemHora === 'function' && todoSemHora(n.data)) { out.push({ id: n.id, ini: 0, fim: 0, titulo: n.title, origem: 'todo', diaTodo: true, feito }); return; }
    const [hh, mm] = n.data.due.slice(11, 16).split(':').map(Number); const ini = hh + mm / 60;
    let fim = n.data.end ? (([a, b]) => a + b / 60)(n.data.end.split(':').map(Number)) : ini + (Number(n.data.est) > 0 ? Number(n.data.est) : 15) / 60;
    if (!(fim > ini)) fim = ini + 0.25;
    out.push({ id: n.id, ini, fim: Math.min(24, fim), titulo: n.title, origem: 'todo', feito, ocupa: !feito });
  });
  return out.sort((x, y) => x.ini - y.ini);
}
/* To-dos abertos sem data. */
const planoTodosSemData = () => db.all('tempo_notices').filter(n => n.kind === 'todo' && n.status !== 'done' && !n.data?.due);
/* Trabalho registrado no dia (sem pausas), trechos do mesmo projeto a menos de 10 min emendados. */
function planoFeitosDoDia(dia) {
  const d0 = new Date(dia + 'T00:00:00').getTime(), d1 = d0 + 864e5;
  const brutos = [];
  db.all('tempo_time_entries').forEach(e => (e.segments || []).forEach(sg => {
    if (!sg.s) return; const a = Math.max(d0, new Date(sg.s).getTime()), b = Math.min(d1, sg.e ? new Date(sg.e).getTime() : Date.now());
    if (b > a) brutos.push({ pid: e.project_id || null, a, b });
  }));
  brutos.sort((x, y) => x.a - y.a);
  const out = [];
  brutos.forEach(x => { const l = out[out.length - 1]; if (l && l.pid === x.pid && x.a - l.b < 10 * 60e3) { l.b = Math.max(l.b, x.b); l.ms += x.b - x.a; } else out.push({ ...x, ms: x.b - x.a }); });
  return out.map(f => ({ ...f, ini: (f.a - d0) / 36e5, fim: (f.b - d0) / 36e5 }));
}
const planoCor = (pid) => { const pr = db.get('tempo_projects', pid); return pr ? hexOf(pr.color || clientOf(pr)?.color || 'gray') : '#94A3B8'; };
/* Soma por projeto: { pid: horas } */
const planoSomaPor = (lista, campo = 'h') => lista.reduce((m, x) => { const k = x.pid || '_'; m[k] = (m[k] || 0) + (campo === 'ms' ? x.ms / 36e5 : x.h); return m; }, {});   // [{ id, dia, pid, ini, h }] blocos arrastados à mão

const planoCfg = () => ({ ...PLANO_PADRAO, ...(db.setting('planoCfg', null) || {}) });
const planoEsticados = () => db.setting('planoDias', {}) || {};        // { 'AAAA-MM-DD': horas } dia esticado/encurtado
const planoBloqueios = () => db.setting('planoBloqueios', []) || [];   // [{ id, dia, ini, fim, nome }] (horas decimais)

/* Dia útil para o plano: seg–sex, fora de feriado e férias. */
function planoDiaUtil(dia) {
  const d = new Date(dia + 'T12:00:00'); const wd = d.getDay();
  if (wd === 0 || wd === 6) return false;
  const fer = typeof feriadosDoAno === 'function' ? feriadosDoAno(d.getFullYear()).some(f => f.data === dia) : false;
  const ferias = typeof emFerias === 'function' ? emFerias(dia) : false;
  return !fer && !ferias;
}
/* Janelas livres do dia (horas decimais), descontando fixos e bloqueios. */
function planoJanelas(dia, cfg = planoCfg()) {
  const wd = new Date(dia + 'T12:00:00').getDay();
  const tira = [...planoFixosDoDia(dia), ...planoEventos(dia).filter(ev => !ev.diaTodo && ev.ocupa !== false).map(ev => [ev.ini, ev.fim, ev.titulo])].sort((a, b) => a[0] - b[0]);
  let jan = [[planoInicioDia(dia, cfg), cfg.fim + Math.max(0, (planoEsticados()[dia] || cfg.horasDia) - cfg.horasDia)]];
  tira.forEach(([a, b]) => { jan = jan.flatMap(([x, y]) => b <= x || a >= y ? [[x, y]] : [[x, Math.min(a, y)], [Math.max(b, x), y]].filter(([p, q]) => q - p > 0.01)); });
  return { jan, fixos: tira };
}
/* Horas que faltam em cada projeto ativo com estimativa. */
function planoProjetos() {
  return projects().filter(p => ['todo', 'active'].includes(statusCat(p.status_id)) && Number(p.estimated_hours) > 0)
    .map(p => ({ p, falta: Math.max(0, Number(p.estimated_hours) - projectMs(p.id) / 36e5), prazo: p.deadline || null }))
    .filter(x => x.falta > 0.05)
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
}
/* Distribui: percorre os dias úteis a partir de hoje e enche cada janela com o projeto de prazo mais perto.
   Retorna os blocos por dia e o que não coube até o prazo. */
function planejar(lista, hoje = new Date(), dias = 60) {
  const cfg = planoCfg(); const restam = lista.map(x => ({ ...x }));
  const porDia = {}; const agoraH = hoje.getHours() + hoje.getMinutes() / 60;
  for (let i = 0; i < dias && restam.some(x => x.falta > 0.05); i++) {
    const d = new Date(hoje); d.setDate(d.getDate() + i); const dia = ymd(d);
    if (!planoDiaUtil(dia)) continue;
    const { jan, fixos } = planoJanelas(dia, cfg);
    const cap = Math.min(planoEsticados()[dia] || cfg.horasDia, 24);
    let usado = 0; const blocos = [];
    // blocos arrastados à mão neste dia: entram primeiro, no horário escolhido, e saem das janelas livres
    let livres = jan;
    planoPins().filter(pn => pn.dia === dia).sort((x, y) => x.ini - y.ini).forEach(pn => {
      const x = restam.find(r => r.p.id === pn.pid && r.falta > 0.05); if (!x) return;
      const h = Math.min(Number(pn.h) || 1, x.falta), a = Number(pn.ini), b = a + h;
      blocos.push({ pid: x.p.id, ini: a, fim: b, h, atrasado: !!(x.prazo && x.prazo < dia), pin: pn.id });
      x.falta -= h; usado += h;
      livres = livres.flatMap(([p, q]) => b <= p || a >= q ? [[p, q]] : [[p, Math.min(a, q)], [Math.max(b + cfg.folga, p), q]].filter(([u, v]) => v - u > 0.05));
    });
    for (let [a, b] of livres) {
      if (i === 0) a = Math.max(a, Math.ceil(agoraH * 4) / 4);   // hoje: só do horário atual em diante
      while (b - a > 0.05 && usado < cap - 0.05) {
        const x = restam.find(r => r.falta > 0.05 && (!r.prazo || r.prazo >= dia) ) || restam.find(r => r.falta > 0.05);
        if (!x) break;
        const h = Math.min(b - a, x.falta, cap - usado);
        blocos.push({ pid: x.p.id, ini: a, fim: a + h, h, atrasado: !!(x.prazo && x.prazo < dia) });
        x.falta -= h; usado += h; a += h + (restam.some(r => r.falta > 0.05 && r !== x) && x.falta <= 0.05 ? cfg.folga : 0);
      }
    }
    porDia[dia] = { blocos, fixos, horas: usado, cap };
  }
  // o que passou do prazo: horas planejadas depois do prazo
  const estouro = lista.map(x => {
    const depois = Object.entries(porDia).reduce((s, [dia, v]) => s + v.blocos.filter(b => b.pid === x.p.id && x.prazo && dia > x.prazo).reduce((t, b) => t + b.h, 0), 0);
    return { p: x.p, horas: depois + (restam.find(r => r.p.id === x.p.id)?.falta || 0) };
  }).filter(x => x.horas > 0.05 && x.p.deadline);
  return { porDia, estouro };
}

const PLANO = { modo: null, dia: null, mesTop: null, semLeft: null, gradeTop: null, porDia: {} };
const planoHora = (h) => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
let PL_ALT = 44;   // px por hora (zoom: Alt + rolagem do mouse na grade; fica salvo em 'planoZoom')
const planoModo = () => PLANO.modo || db.setting('planoModo', 'semana');
const planoFer = (dia) => typeof feriadosDoAno === 'function' ? feriadosDoAno(Number(dia.slice(0, 4))).find(f => f.data === dia) : null;
const planoPrazos = (dia) => projects().filter(p => p.deadline === dia && ['todo', 'active'].includes(statusCat(p.status_id)));
const planoDiaMais = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };

/* Letra do Dias de Rafa (T, A, M, T/A), nas cores de lá; mais clara se foi o app que marcou. Clique abre o Dias de Rafa. */
function planoRafaLetraHTML(dia) {
  const r = typeof rafaDiaDe === 'function' ? rafaDiaDe(dia) : null; if (!r || !r.who) return '';
  return `<button class="pl-rf ${r.who}${r.auto ? ' auto' : ''}" data-act="pl-rafa-ir" data-dia="${dia}" title="${esc((RF_NOME?.[r.who] || r.who) + (r.auto ? ' · marcado pelo app' : '') + ' · abrir Dias de Rafa')}">${r.who === 'X' ? 'T/A' : r.who}</button>`;
}

/* Foto do plano: na primeira abertura de cada dia, guarda o que estava planejado para hoje (o plano em si é refeito
   a cada abertura e não guarda o passado). Serve para comparar plano × real depois. 'planoFoto' = { dia: [{pid, ini, fim}] } */
const planoFotos = () => db.setting('planoFoto', {}) || {};
function planoFotoDoDia(porDia) {
  const hoje = ymd(new Date()); const f = planoFotos(); if (f[hoje]) return;
  const bl = (porDia[hoje]?.blocos || []).map(b => ({ pid: b.pid, ini: b.ini, fim: b.fim }));
  const novo = { ...f, [hoje]: bl };
  Object.keys(novo).sort().slice(0, -180).forEach(k => delete novo[k]);   // guarda ~6 meses
  db.setSetting('planoFoto', novo);
}
/* Plano × real do dia: horas planejadas (foto) e quanto delas virou registro do mesmo projeto. */
function planoVsReal(dia) {
  const foto = planoFotos()[dia]; if (!foto || !foto.length) return null;
  const feitos = planoFeitosDoDia(dia);
  const plan = foto.reduce((t, b) => t + (b.fim - b.ini), 0);
  const cumprido = (b) => feitos.filter(f => f.pid === b.pid).reduce((t, f) => t + Math.max(0, Math.min(f.fim, b.fim) - Math.max(f.ini, b.ini)), 0);
  const porProj = {}; foto.forEach(b => { porProj[b.pid] = (porProj[b.pid] || 0) + (b.fim - b.ini); });
  const reg = Object.keys(porProj).reduce((t, pid) => t + Math.min(porProj[pid], feitos.filter(f => f.pid === pid).reduce((s, f) => s + (f.fim - f.ini), 0)), 0);
  return { plan, reg, pct: plan ? Math.round(reg / plan * 100) : 0, blocos: foto.map(b => ({ ...b, ok: cumprido(b) >= (b.fim - b.ini) * 0.5 })) };
}
/* Itens de um dia na grade, todos no mesmo formato: { a, b (horas), k (tipo), ... }.
   Tipos: fixo (rotina), evento (bloqueio/Google), todo, feito (registro), plano (planejado). */
function planoItensDoDia(dia, porDia) {
  const it = [];
  planoFixosDoDia(dia).forEach(([a, b, n, m]) => it.push({ k: 'fixo', a, b, n, m }));
  const evs = planoEventos(dia).filter(e => !e.diaTodo);
  // 3 ou mais to-dos no mesmo horário viram um bloco só ("7 to-dos"), com a lista no hover
  const porHora = {}; evs.filter(e => e.origem === 'todo').forEach(e => { (porHora[e.ini + '|' + e.fim] ||= []).push(e); });
  evs.forEach(e => {
    if (e.origem === 'todo') { const g = porHora[e.ini + '|' + e.fim]; if (g.length >= 3) { if (g[0] === e) it.push({ k: 'todos', a: e.ini, b: e.fim, lista: g }); return; } }
    it.push({ k: e.origem === 'todo' ? 'todo' : 'evento', a: e.ini, b: e.fim, e });
  });
  planoFeitosDoDia(dia).forEach(f => it.push({ k: 'feito', a: f.ini, b: f.fim, f }));
  (porDia[dia]?.blocos || []).forEach(bl => it.push({ k: 'plano', a: bl.ini, b: bl.fim, bl }));
  if (dia <= ymd(new Date())) { const pr = planoVsReal(dia); (pr?.blocos || []).filter(b => !b.ok && (dia < ymd(new Date()) || b.fim <= new Date().getHours() + new Date().getMinutes() / 60)).forEach(b => it.push({ k: 'naofeito', a: b.ini, b: b.fim, bl: b })); }
  return it.filter(x => x.b > x.a);
}
/* Lado a lado: itens que se sobrepõem dividem a largura (colunas por grupo de sobreposição). */
function planoFaixas(itens, unico = true) {
  if (!unico) {
    // Semana: rotina vira fundo (largura toda), to-dos viram marcadores na borda direita, e o resto (registrado,
    // planejado, compromissos) usa a largura toda, dividindo só quando um cai em cima do outro.
    const fundo = itens.filter(x => x.k === 'fixo'), marc = itens.filter(x => x.k === 'todo' || x.k === 'todos');
    const resto = planoFaixasLivre(itens.filter(x => x.k !== 'fixo' && x.k !== 'todo' && x.k !== 'todos'));
    fundo.forEach(x => { x._left = 0; x._w = 100; x._fundo = true; });
    resto.forEach(x => { x._left = x._l * (100 / x._n); x._w = 100 / x._n; });
    marc.forEach(x => { x._marc = true; });
    return [...fundo, ...resto, ...marc];
  }
  // registrado fica sempre na primeira terça parte da coluna; o resto divide os outros dois terços (cada bloco no máximo 1/3)
  const reg = itens.filter(x => x.k === 'feito'); const resto = planoFaixasLivre(itens.filter(x => x.k !== 'feito'));
  reg.forEach(x => { x._left = 0; x._w = 100 / 3; });
  resto.forEach(x => { const w = Math.min(100 / 3, (200 / 3) / x._n); x._left = 100 / 3 + x._l * w; x._w = w; });
  return [...resto, ...reg];
}
function planoFaixasLivre(itens) {
  const ord = itens.slice().sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a));
  let grupo = [], fimG = -1;
  const fecha = () => { const n = Math.max(1, ...grupo.map(x => x._l + 1)); grupo.forEach(x => { x._n = n; }); grupo = []; };
  ord.forEach(x => {
    if (grupo.length && x.a >= fimG - 1e-9) { fecha(); fimG = -1; }
    const usados = new Set(grupo.filter(g => g.b > x.a + 1e-9).map(g => g._l));
    let l = 0; while (usados.has(l)) l++;
    x._l = l; grupo.push(x); fimG = Math.max(fimG, x.b);
  });
  if (grupo.length) fecha();
  return ord;
}
/* Puxadores de cima e de baixo (blocos que não são registro). */
const PL_PUX = '<i class="dg-t" title="Puxe para mudar o começo"></i><i class="dg-b" title="Puxe para mudar o fim"></i>';
function planoItemHTML(x, dia, { alt, unico, auto }) {
  const y = x.a * alt, h = (x.b - x.a) * alt;
  const pos = `top:${y}px;height:${Math.max(x.k === 'feito' ? 3 : 14, h - (x.k === 'feito' ? 1 : 2))}px;left:calc(${(x._left ?? 0).toFixed(3)}% + 1px);width:calc(${(x._w ?? 100).toFixed(3)}% - 3px)`;
  const curto = h < 30;
  if (x._marc) {   // to-do na Semana: marcador pequeno na borda direita (bolinha e hora; nome no hover)
    const l = x.k === 'todos' ? x.lista : [x.e]; const feito = l.every(e => e.feito);
    return `<div class="pl-marc${feito ? ' feito' : ''}" style="top:${y}px"${l.length === 1 ? ` data-act="todo-modal" data-id="${l[0].id}"` : ''} data-tip="${esc(`${l.length > 1 ? l.length + ' to-dos às ' : 'To-do às '}${planoHora(x.a)}\n` + l.map(e => (e.feito ? '✓ ' : '• ') + e.titulo).join('\n'))}"><i></i>${l.length > 1 ? l.length + ' · ' : ''}${planoHora(x.a)}</div>`;
  }
  if (x.k === 'fixo') { const { n, m } = x;
    return `<div class="pl-fixo${x._fundo ? ' fundo' : ''}${m.ajustado ? ' ajustado' : ''}${m.real ? ' real' : ''}" data-dg="fixo" data-dia="${dia}" data-g="${esc(m.grupo)}" data-ini="${x.a}" data-fim="${x.b}" style="${pos}" data-tip="${esc(`${n}\n${planoHora(x.a)}–${planoHora(x.b)}${m.real ? '\nAjustado ao que aconteceu (bloco flexível)' : ''}${m.ajustado ? '\nMudado só neste dia' : ''}\nArraste ou puxe as bordas: muda só neste dia`)}"><span class="pl-tx"><b>${esc(n)}</b>${curto ? '' : `<em>${planoHora(x.a)}–${planoHora(x.b)}</em>`}</span><span class="pl-fx-bt">${m.ajustado ? `<button data-act="pl-fixo-reset" data-dia="${dia}" data-g="${esc(m.grupo)}" title="Voltar ao horário da rotina" aria-label="Voltar ao padrão">↺</button>` : ''}<button data-act="pl-fixo-off" data-dia="${dia}" data-g="${esc(m.grupo)}" title="Tirar só deste dia" aria-label="Tirar deste dia">×</button></span>${PL_PUX}</div>`; }
  if (x.k === 'evento') { const e = x.e; const bloq = e.origem === 'bloqueio';
    return `<div class="pl-evento ${e.origem}"${bloq ? ` data-dg="bloq" data-dia="${dia}" data-id="${e.id}" data-ini="${x.a}" data-fim="${x.b}"` : ''} style="${pos}" data-tip="${esc(`${e.origem === 'google' ? 'Google Agenda' + (e.agenda ? ' · ' + e.agenda : '') : 'Bloqueio'}\n${e.titulo}\n${planoHora(e.ini)}–${planoHora(e.fim)}`)}">${icon(e.origem === 'google' ? 'calendar' : 'clock')}<span class="pl-tx"><b>${esc(e.titulo)}</b>${curto ? '' : `<em>${planoHora(e.ini)}–${planoHora(e.fim)}</em>`}</span>${bloq ? PL_PUX : ''}</div>`; }
  if (x.k === 'todo') { const e = x.e;
    return `<div class="pl-evento todo${e.feito ? ' feito' : ''}"${e.feito ? '' : ` data-dg="todo" data-dia="${dia}" data-id="${e.id}" data-ini="${x.a}" data-fim="${x.b}"`} style="${pos}" data-act="todo-modal" data-id="${e.id}" data-tip="${esc(`To-do: ${e.titulo}\n${planoHora(e.ini)}–${planoHora(e.fim)}${e.feito ? '\nFeito' : '\nArraste para mudar a hora; puxe as bordas para mudar a duração'}`)}">${icon('check')}<span class="pl-tx"><b>${esc(e.titulo)}</b></span>${e.feito ? '' : PL_PUX}</div>`; }
  if (x.k === 'naofeito') { const p = db.get('tempo_projects', x.bl.pid); const c = planoCor(x.bl.pid);
    return `<div class="pl-naofeito" style="${pos};--fc:${c}" data-tip="${esc(`Planejado e não aconteceu: ${p?.name || ''}\n${planoHora(x.a)}–${planoHora(x.b)} (plano da manhã)`)}"><span class="pl-tx"><b>${esc(p?.name || '')}</b>${curto ? '' : '<em>não aconteceu</em>'}</span></div>`; }
  if (x.k === 'todos') { const l = x.lista;
    return `<div class="pl-evento todo grupo" style="${pos}" data-tip="${esc(`${l.length} to-dos às ${planoHora(x.a)}\n` + l.map(e => (e.feito ? '✓ ' : '• ') + e.titulo).join('\n'))}">${icon('check')}<span class="pl-tx"><b>${l.length} to-dos</b>${curto ? '' : `<em>${l.filter(e => e.feito).length} feitos</em>`}</span></div>`; }
  if (x.k === 'feito') { const f = x.f; const pr = db.get('tempo_projects', f.pid);
    return `<div class="pl-feito" style="${pos};--fc:${planoCor(f.pid)}" data-tip="${esc(`Registrado: ${pr?.name || 'Sem projeto'}${pr ? '\n' + (clientOf(pr)?.name || '') : ''}\n${planoHora(f.ini)}–${planoHora(f.fim)} · ${fmtH(f.ms)} trabalhado`)}"${f.pid ? ` data-act="proj-open" data-id="${f.pid}"` : ''}>${h >= 15 ? `<span class="pl-tx"><b>${esc(pr?.name || 'Sem projeto')}</b>` : '<span class="pl-tx">'}${h >= 34 ? `<em>${unico && pr ? esc(clientOf(pr)?.name || '') + ' · ' : ''}${fmtH(f.ms)}</em>` : ''}</span></div>`; }
  const b = x.bl; const p = db.get('tempo_projects', b.pid); const c = planoCor(b.pid);
  return `<div class="pl-bloco${b.atrasado ? ' late' : ''}${b.pin ? ' pin' : ' auto'}" data-dg="plano" data-dia="${dia}" data-pid="${b.pid}" data-ini="${b.ini}" data-fim="${b.fim}" style="${pos};--fc:${c}" data-act="proj-open" data-id="${b.pid}" data-tip="${esc(`Planejado: ${p?.name}\n${clientOf(p)?.name || ''}\n${planoHora(b.ini)}–${planoHora(b.fim)} · ${fmtH(b.h * 36e5)}${b.atrasado ? '\nDepois do prazo' : ''}${b.pin ? '\nFixado à mão' : '\nColocado pelo app · arraste para mudar o horário ou o dia'}`)}"><span class="pl-tx"><b>${esc(p?.name || '')}</b>${curto ? '' : `<em>${planoHora(b.ini)} · ${fmtH(b.h * 36e5)}${unico && p ? ' · ' + esc(clientOf(p)?.name || '') : ''}</em>`}</span>${b.pin ? `<button class="pl-unpin" data-act="pl-unpin" data-id="${b.pin}" title="Soltar: o app volta a encaixar este bloco sozinho" aria-label="Soltar bloco">×</button>` : ''}${PL_PUX}</div>`;
}
/* Coluna de um dia: cabeçalho, linha "dia todo" (to-do só com data, evento de dia inteiro) e a grade de 24 h. */
function planoColHTML(dia, porDia, { alt = PL_ALT, unico = false, linhasTopo = 0, cabecalho = true, semana = '' } = {}) {
  const cfg = planoCfg(); const v = porDia[dia]; const util = planoDiaUtil(dia); const hoje = ymd(new Date());
  const itens = planoFaixas(planoItensDoDia(dia, porDia), unico).map(x => planoItemHTML(x, dia, { alt, unico })).join('');
  const agora = dia === hoje ? (() => { const n = new Date(); const h = n.getHours() + n.getMinutes() / 60; return `<div class="pl-agora" style="top:${h * alt}px"></div>`; })() : '';
  const h = v?.horas || 0, est = planoEsticados()[dia], fer = planoFer(dia);
  const wd = new Date(dia + 'T12:00:00').getDay();
  const sexta = wd === 5 ? `<button class="btn sm ghost pl-rafa${planoSextaRafa(dia) ? ' on' : ''}" data-act="pl-sexta" data-dia="${dia}" title="Sexta com o Rafa (T) ou com a Amanda (A)? Clique para trocar só esta sexta (muda também no Dias de Rafa).">Rafa ${planoSextaRafa(dia) ? '✓' : '–'}</button>` : '';
  const cab = !cabecalho ? '' : `<div class="pl-cab">${semana ? `<span class="pl-sem-rot">${esc(semana)}</span>` : ''}<span class="pl-cab-l1"><button class="pl-cab-dia" data-act="pl-ir-dia" data-dia="${dia}" title="Ver o dia">${new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</button>${planoRafaLetraHTML(dia)}</span>
      <span class="pl-cab-l2">${(() => { const pr = dia <= hoje ? planoVsReal(dia) : null; return pr ? `<span class="pl-pvr ${pr.pct >= 80 ? 'ok' : pr.pct >= 50 ? 'meio' : 'baixo'}" data-tip="${esc(`Plano × real: ${fmtH(pr.reg * 36e5)} registrados das ${fmtH(pr.plan * 36e5)} planejadas de manhã (mesmo projeto)`)}">${pr.pct}%</span>` : ''; })()}<span class="small ${h > cfg.horasDia + 0.05 ? 'late' : 'muted'}">${util ? (h > 0.01 ? `${fmtH(h * 36e5)} plano${est ? ` de ${est} h` : ''}` : '') : (fer ? '[FERIADO] ' + esc(fer.nome) : '')}</span>${sexta}</span></div>`;
  const todoDia = planoEventos(dia).filter(e => e.diaTodo);
  const topo = linhasTopo ? `<div class="pl-topo" style="height:${linhasTopo * 20}px">${todoDia.map(e => e.origem === 'todo'
    ? `<button class="pl-chip todo${e.feito ? ' feito' : ''}" data-act="todo-modal" data-id="${e.id}" title="To-do do dia (sem hora)">${icon('check')}${esc(e.titulo)}</button>`
    : `<span class="pl-chip ${e.origem}" title="Dia todo">${esc(e.titulo)}</span>`).join('')}</div>` : '';
  return `<div class="pl-dia${dia === hoje ? ' hoje' : ''}${!util ? ' off' : ''}${(v?.cap || 0) > cfg.horasDia + 0.05 ? ' esticado' : ''}${wd === 1 ? ' pl-segunda' : ''}" data-pl-col="${dia}">${cab}${topo}<div class="pl-grade" style="height:${24 * alt}px">${itens}${agora}</div></div>`;
}
const planoRegua = (alt = PL_ALT) => `<div class="pl-horas" style="height:${24 * alt}px">${Array.from({ length: 24 }, (_, h) => `<div class="pl-h" style="top:${h * alt}px">${String(h).padStart(2, '0')}h</div>`).join('')}</div>`;

/* Semana: segunda a domingo, várias semanas lado a lado com rolagem horizontal (8 antes, 12 depois). */
function planoSemanaHTML(porDia) {
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  const seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
  const ini = new Date(seg); ini.setDate(seg.getDate() - 8 * 7);
  const dias = Array.from({ length: 21 * 7 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return ymd(d); });
  const lt = Math.max(0, ...dias.map(d => planoEventos(d).filter(e => e.diaTodo).length));
  const cols = dias.map(d => planoColHTML(d, porDia, { linhasTopo: lt, semana: new Date(d + 'T12:00:00').getDay() === 1 ? `Semana de ${fmtDate(d)}` : '' })).join('');
  return `<div class="pl-scroll pl-semscroll" data-pl-scroll data-pl-sem="${ymd(seg)}"><div class="pl-semana pl-semana-h" style="--lt:${lt * 20}px">
    <div class="pl-regua-col"><div class="pl-cab pl-cab-vazio"></div>${lt ? `<div style="height:${lt * 20}px"></div>` : ''}${planoRegua()}</div>${cols}</div></div>`;
}

/* Filtros do calendário (Mês): esconder Alice, Rafa, trabalho, to-dos ou rotina. Guardado em planoMesFiltro { k: false }. */
const PL_FILTROS = [['alice', 'Alice'], ['rafa', 'Rafa'], ['trabalho', 'Trabalho'], ['todos', 'To-dos'], ['rotina', 'Rotina']];
const planoMostra = (k) => (db.setting('planoMesFiltro', {}) || {})[k] !== false;
CHANGES['pl-filtro'] = (el) => { const f = { ...(db.setting('planoMesFiltro', {}) || {}) }; f[el.dataset.k] = el.checked; db.setSetting('planoMesFiltro', f); db.emit(); };

/* Um dia do calendário (Mês): número grande e chips à direita; feriado, compromissos do dia todo e observação;
   tempo trabalhado (ou planejado) por projeto; à direita, a lista de horários do dia, com rolagem própria. */
function planoMesCelHTML(dia, porDia, hoje, cfg) {
  const dt = new Date(dia + 'T12:00:00'); const n = dt.getDate(); const util = planoDiaUtil(dia); const fer = planoFer(dia);
  const plan = planoSomaPor(porDia[dia]?.blocos || []); const feito = planoSomaPor(planoFeitosDoDia(dia), 'ms');
  const base = feito;   // à esquerda: o que foi trabalhado; o previsto vai em destaque na lista da direita
  const pids = Object.keys(base).filter(k => base[k] > 0.001).sort((a, b) => base[b] - base[a]);
  const tot = pids.reduce((t, k) => t + base[k], 0);
  const ev = planoEventos(dia); const prz = planoPrazos(dia);
  const rafa = typeof rafaDiaDe === 'function' ? rafaDiaDe(dia) : null;
  const al = planoMostra('alice') && typeof aliceChipsHTML === 'function' ? aliceChipsHTML(dia) : '';
  const verRafa = planoMostra('rafa'), verTrab = planoMostra('trabalho'), verTodo = planoMostra('todos'), verRot = planoMostra('rotina');
  const topo = [
    fer ? `<div class="pl-mc-tag fer" title="${esc(fer.nome)}">[FERIADO] ${esc(fer.nome)}</div>` : '',
    ...prz.map(p => `<div class="pl-mc-tag prazo" title="Prazo: ${esc(p.name)}">${icon('flag')} ${esc(p.name)}</div>`),
    ...ev.filter(e => e.diaTodo && (verTodo || e.origem !== 'todo')).map(e => `<div class="pl-mc-tag ev ${e.origem}${e.feito ? ' feito' : ''}" title="${esc(e.titulo)}">${esc(e.titulo)}</div>`),
    ...(!verRafa ? [] : typeof rafaNotas === 'function' ? rafaNotas(dia) : (rafa && rafa.note ? [{ t: rafa.note, q: 'N' }] : [])).map(n => `<div class="pl-mc-tag obs nq-${n.q || 'N'}" title="${esc(n.t)}">${esc(n.t)}</div>`)
  ].join('');
  // rotina (fixos) só na semana atual, para os meses seguintes não ficarem carregados; to-dos e projetos previstos sempre
  const semIni = (() => { const h = new Date(hoje + 'T12:00:00'); h.setDate(h.getDate() - ((h.getDay() + 6) % 7)); return ymd(h); })();
  const semanaAtual = dia >= semIni && dia <= (() => { const f = new Date(semIni + 'T12:00:00'); f.setDate(f.getDate() + 6); return ymd(f); })();
  const previstos = dia >= hoje && verTrab ? Object.keys(plan).filter(k => plan[k] > 0.001).sort((a, b) => plan[b] - plan[a]) : [];
  const horarios = [
    ...(semanaAtual && verRot ? planoFixosDoDia(dia).map(f => ({ ini: f[0], titulo: f[2], cls: 'fixo' })) : []),
    ...ev.filter(e => !e.diaTodo && (verTodo || e.origem !== 'todo')).map(e => ({ ini: e.ini, titulo: e.titulo, cls: e.origem + (e.feito ? ' feito' : '') }))
  ].sort((x, y) => x.ini - y.ini);
  const proj = pids.map(pid => { const p = db.get('tempo_projects', pid);
    return `<div class="pl-mc-p" style="--fc:${planoCor(pid === '_' ? null : pid)}"><i></i><span>${esc(p?.name || 'Sem projeto')}</span><em>${fmtH(base[pid] * 36e5)}</em></div>`; }).join('');
  return `<div class="pl-mc${dt.getMonth() % 2 === 0 ? ' par' : ''}${dia === hoje ? ' hoje' : ''}${!util ? ' off' : ''}${dia < hoje ? ' passado' : ''}" data-act="pl-ir-dia" data-dia="${dia}" data-pl-pop="${dia}"${dia === hoje ? ' data-hoje="1"' : ''}>
    <div class="pl-mc-in">
      <div class="pl-mc-esq">
        <div class="pl-mc-n"><b>${n === 1 ? dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '') : n}</b><span class="pl-mc-chips"><button class="pl-mc-nota" data-act="rafa-open" data-day="${dia}" title="Adicionar nota (as mesmas de Dias de Rafa)" aria-label="Adicionar nota">${icon('plus')}</button>${al}${verRafa ? planoRafaLetraHTML(dia) : ''}</span></div>
        ${topo}
      </div>
      ${horarios.length || previstos.length ? `<div class="pl-mc-dir" data-pl-noclick>${previstos.map(pid => { const p = db.get('tempo_projects', pid); const ab = p && typeof agencyAbbr === 'function' ? agencyAbbr(agencyOf(p)) : ''; const nm = `${ab ? '[' + ab + '] ' : ''}${p?.name || 'Sem projeto'}`;
        return `<div class="pl-mc-prev${plan[pid] && dia === hoje ? ' hoje' : ''}" style="--fc:${planoCor(pid === '_' ? null : pid)}" title="${esc(`Previsto: ${nm} · ${fmtH(plan[pid] * 36e5)}`)}"><span>${esc(nm)}</span><em>${fmtH(plan[pid] * 36e5)}</em></div>`; }).join('')}${horarios.map(h => `<div class="pl-mc-hr ${h.cls}" title="${esc(planoHora(h.ini) + ' ' + h.titulo)}"><b>${planoHora(h.ini)}</b> ${esc(h.titulo)}</div>`).join('')}</div>` : ''}
      ${pids.length && verTrab ? `<div class="pl-mc-reg"><div class="pl-mc-tt"><span>Tempo trabalhado</span><em>${fmtH(tot * 36e5)}</em></div>${proj}</div>` : ''}
    </div>
  </div>`;
}

/* Mês: um calendário corrido (semanas em sequência, seg a dom), rolando para meses anteriores e seguintes. */
function planoMesHTML(porDia) {
  const hoje = ymd(new Date()); const cfg = planoCfg();
  const ini = new Date(); ini.setHours(12, 0, 0, 0); ini.setMonth(ini.getMonth() - 3, 1); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7));
  const fim = new Date(); fim.setHours(12, 0, 0, 0); fim.setMonth(fim.getMonth() + 7, 0);
  let html = '';
  for (const d = new Date(ini); d <= fim; d.setDate(d.getDate() + 7)) {
    const dias = Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(x.getDate() + i); return ymd(x); });
    const primeiro = dias.find(x => x.endsWith('-01'));
    if (primeiro) html += `<div class="pl-mes-rot" data-mes="${primeiro.slice(0, 7)}">${new Date(primeiro + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase())}</div>`;
    html += dias.map(dia => planoMesCelHTML(dia, porDia, hoje, cfg)).join('');
  }
  return `<div class="pl-mes-cab">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="pl-mes-scroll" data-pl-mes><div class="pl-mes">${html}</div></div>
    <div class="pl-legenda small muted"><span><i class="f"></i> registrado</span><span><i class="p"></i> planejado</span><span><i class="fp"></i> os dois</span><span>${icon('flag')} prazo</span><span class="pl-mc-ev google">Google Agenda</span><span class="pl-mc-ev bloqueio">bloqueio</span><span class="pl-rf T">T</span><span class="pl-rf A">A</span> Rafa · passe o mouse para ver o dia · clique para abrir</div>`;
}
/* Janela ao passar o mouse num dia do mês: a grade do dia em miniatura e a lista do que tem nele. */
function planoPopHTML(dia) {
  const porDia = PLANO.porDia || {}; const alt = 9; const ini = 5, fim = 24;
  const itens = planoFaixas(planoItensDoDia(dia, porDia)).filter(x => x.b > ini);
  const mini = itens.map(x => { const a = Math.max(x.a, ini), b = Math.min(x.b, fim); if (b <= a) return '';
    const cor = x.k === 'plano' ? planoCor(x.bl.pid) : x.k === 'feito' ? planoCor(x.f.pid) : x.k === 'todo' || x.k === 'todos' ? 'var(--accent)' : x.k === 'evento' && x.e.origem === 'google' ? '#4285F4' : '#CBD5E1';
    return `<span class="pl-pop-b ${x.k}" style="top:${(a - ini) * alt}px;height:${Math.max(2, (b - a) * alt - 1)}px;left:${(x._left ?? 0).toFixed(2)}%;width:${(x._w ?? 100).toFixed(2)}%;--c:${cor}"></span>`; }).join('');
  const nome = (x) => x.k === 'todos' ? `${x.lista.length} to-dos` : x.k === 'fixo' ? x.n : x.k === 'evento' || x.k === 'todo' ? x.e.titulo : x.k === 'feito' ? (db.get('tempo_projects', x.f.pid)?.name || 'Sem projeto') : (db.get('tempo_projects', x.bl.pid)?.name || '');
  const rot = { fixo: 'rotina', evento: 'compromisso', todo: 'to-do', todos: 'to-dos', feito: 'registrado', plano: 'planejado' };
  const lista = planoFaixas(planoItensDoDia(dia, porDia)).map(x => `<div class="pl-pop-l ${x.k}"><span class="mono">${planoHora(x.a)}–${planoHora(x.b)}</span><span>${esc(nome(x))}</span><em>${rot[x.k]}</em></div>`).join('');
  const t = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="pl-pop-t">${esc(t.replace(/^./, c => c.toUpperCase()))} ${planoRafaLetraHTML(dia)}</div>
    <div class="pl-pop-c"><div class="pl-pop-g" style="height:${(fim - ini) * alt}px">${Array.from({ length: fim - ini }, (_, i) => `<span class="pl-pop-h" style="top:${i * alt}px">${(i + ini) % 3 === 0 ? String(i + ini).padStart(2, '0') + 'h' : ''}</span>`).join('')}<div class="pl-pop-area">${mini}</div></div>
    <div class="pl-pop-lista">${lista || '<div class="small muted">Nada neste dia.</div>'}</div></div>`;
}

/* Dia: a grade grande e, ao lado, o resumo (planejado × registrado por projeto, compromissos, prazos, to-dos sem data). */
function planoDiaHTML(dia, porDia) {
  const plan = planoSomaPor(porDia[dia]?.blocos || []); const feito = planoSomaPor(planoFeitosDoDia(dia), 'ms');
  const pids = [...new Set([...Object.keys(feito), ...Object.keys(plan)])];
  const linhas = pids.map(pid => { const p = db.get('tempo_projects', pid); const f = feito[pid] || 0, pl = plan[pid] || 0; const tot = f + pl;
    return `<div class="bar-row"><span class="lab">${esc(p?.name || 'Sem projeto')}</span><div class="bar-track"><div class="bar-fill" style="width:${tot ? (f / tot * 100).toFixed(1) : 0}%;background:${planoCor(pid === '_' ? null : pid)}"></div></div><span class="mono small">${fmtH(f * 36e5)} registrado${pl ? ` + ${fmtH(pl * 36e5)} plano` : ''}</span></div>`; }).join('');
  const ev = planoEventos(dia), prz = planoPrazos(dia), fer = planoFer(dia);
  const sd = planoTodosSemData();
  const lado = `<div class="stack" style="gap:12px">
    ${fer ? `<div class="banner info small">[FERIADO] ${esc(fer.nome)}</div>` : ''}
    ${(() => { const r = typeof rafaDiaDe === 'function' ? rafaDiaDe(dia) : null; return r?.who ? `<div class="small">Rafa: ${planoRafaLetraHTML(dia)} ${esc(RF_NOME?.[r.who] || '')}${r.auto ? ' <span class="faint">(marcado pelo app)</span>' : ''}${r.horario ? ' · ' + esc(r.horario) : ''}</div>` : ''; })()}
    ${(() => { const pr = planoVsReal(dia); return pr ? `<div class="pl-pvr-box"><b>${fmtH(pr.reg * 36e5)} de ${fmtH(pr.plan * 36e5)} planejadas</b> <span class="pl-pvr ${pr.pct >= 80 ? 'ok' : pr.pct >= 50 ? 'meio' : 'baixo'}">${pr.pct}%</span><div class="small muted">Comparado com o plano do começo do dia; o que não aconteceu aparece tracejado.</div></div>` : ''; })()}
    ${planoDiaUtil(dia) ? (() => { const cfg = planoCfg(); const est = planoEsticados()[dia]; const hd = est ?? cfg.horasDia; return `<div class="row between small"><span>Horas de trabalho neste dia <span class="faint" data-tip="Quanto o app pode planejar de trabalho neste dia. O padrão é ${cfg.horasDia} h; estique quando precisar virar a noite, ou encurte num dia mais leve.">(padrão ${cfg.horasDia} h)</span></span><span class="row" style="gap:4px"><button class="btn sm" data-act="pl-dia" data-dia="${dia}" data-d="-1" aria-label="Menos 1 hora">−</button><b class="mono">${hd} h</b><button class="btn sm" data-act="pl-dia" data-dia="${dia}" data-d="1" aria-label="Mais 1 hora">+</button></span></div>`; })() : ''}
    <div><div class="lbl">Projetos do dia</div>${linhas ? `<div class="bars">${linhas}</div>` : '<div class="small muted">Nada registrado nem planejado.</div>'}</div>
    ${prz.length ? `<div><div class="lbl">Prazos</div>${prz.map(p => `<div class="small">${icon('flag')} ${esc(p.name)}</div>`).join('')}</div>` : ''}
    <div><div class="lbl">Compromissos</div>${ev.length ? ev.map(e => `<div class="small row between"><span>${e.diaTodo ? 'Dia todo' : planoHora(e.ini) + '–' + planoHora(e.fim)} · ${esc(e.titulo)} <span class="faint">${e.origem === 'google' ? 'Google' : e.origem === 'todo' ? 'to-do' : 'bloqueio'}</span></span>${e.origem === 'bloqueio' ? `<button class="btn sm ghost" data-act="pl-bloq-del" data-id="${e.id}" aria-label="Remover bloqueio">${icon('x')}</button>` : ''}</div>`).join('') : '<div class="small muted">Nenhum. Os eventos do Google Agenda vão aparecer aqui quando a integração for ligada.</div>'}
      <button class="btn sm" style="margin-top:6px" data-act="pl-bloq" data-dia="${dia}">${icon('plus')} Bloqueio</button></div>
    ${sd.length ? `<div><div class="lbl">To-do sem data <span class="faint">(${sd.length})</span></div>${sd.slice(0, 12).map(n => `<div class="small row between pl-sd"><span data-act="todo-modal" data-id="${n.id}" style="cursor:pointer">${esc(n.title)}</span><button class="btn sm ghost" data-act="pl-encaixar" data-id="${n.id}" data-dia="${dia}" title="Põe no primeiro horário livre deste dia (15 min, ou a estimativa)">Encaixar</button></div>`).join('')}${sd.length > 12 ? `<div class="small muted">+${sd.length - 12}</div>` : ''}</div>` : ''}
  </div>`;
  const lt = planoEventos(dia).filter(e => e.diaTodo).length;
  return `<div class="pl-diaview"><div><div class="pl-colrot"><span></span><span>Registrado</span><span>Agenda · planejado, rotina, to-dos e compromissos</span></div><div class="pl-scroll" data-pl-scroll><div class="pl-semana pl-um"><div class="pl-regua-col">${lt ? `<div style="height:${lt * 20}px"></div>` : ''}${planoRegua()}</div>${planoColHTML(dia, porDia, { unico: true, linhasTopo: lt, cabecalho: false })}</div></div></div>${lado}</div>`;
}

VIEWS.plano = () => {
  PL_ALT = Math.max(16, Math.min(160, Number(db.setting('planoZoom', 44)) || 44));
  if (typeof rafaAutoPreencher === 'function') rafaAutoPreencher();
  const lista = planoProjetos(); const cfg = planoCfg(); const modo = planoModo();
  const { porDia, estouro } = planejar(lista, new Date(), modo === 'mes' ? 220 : 100);
  PLANO.porDia = porDia;
  planoFotoDoDia(porDia);
  const hoje = ymd(new Date()); const dia = PLANO.dia || hoje;
  const semEst = projects().filter(p => ['todo', 'active'].includes(statusCat(p.status_id)) && !(Number(p.estimated_hours) > 0));
  const seg = `<div class="seg">${[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, l]) => `<button class="${modo === k ? 'on' : ''}" data-act="pl-modo" data-m="${k}">${l}</button>`).join('')}</div>`;
  let titulo, nav, corpo; let titulo2 = '';
  if (modo === 'dia') {
    titulo = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
    nav = `<button class="btn sm" data-act="pl-nav" data-d="-1" aria-label="Dia anterior">${icon('chevL')}</button><button class="btn sm" data-act="pl-nav" data-d="1" aria-label="Próximo dia">${icon('chevR')}</button>${dia !== hoje ? '<button class="btn sm ghost" data-act="pl-nav" data-d="0">Hoje</button>' : ''}`;
    corpo = planoDiaHTML(dia, porDia);
  } else if (modo === 'mes') {
    titulo = 'Calendário'; nav = `<button class="btn sm ghost" data-act="pl-mes-hoje">Hoje</button>`;
    titulo2 = `<div class="pl-filtros" role="group" aria-label="Mostrar no calendário">${PL_FILTROS.map(([k, l]) => `<label class="check small"><input type="checkbox" data-on="pl-filtro" data-k="${k}" ${planoMostra(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>`;
    corpo = planoMesHTML(porDia);
  } else {
    titulo = 'Semana'; nav = `<button class="btn sm" data-act="pl-sem" data-d="-1" aria-label="Semana anterior">${icon('chevL')}</button><button class="btn sm" data-act="pl-sem" data-d="1" aria-label="Próxima semana">${icon('chevR')}</button><button class="btn sm ghost" data-act="pl-sem" data-d="0">Hoje</button>`;
    corpo = planoSemanaHTML(porDia);
  }
  const nota = `${lista.length} projeto(s) com horas a fazer, distribuídas por prazo até ${cfg.horasDia} h por dia útil. Cheio = planejado (mais claro = colocado pelo app; fixado à mão fica forte) · chip com bolinha = registrado · cinza = rotina · tracejado = compromisso (bloqueio ou Google Agenda). Arraste ou puxe as bordas do que não é registro; a janelinha mostra o horário novo.${semEst.length ? ` ${semEst.length} projeto(s) ativo(s) sem horas estimadas não entram.` : ''}`;
  const html = `${estouro.length ? `<div class="panel" style="border-color:var(--warn)"><div class="panel-b small"><b>Não cabe no prazo:</b> ${estouro.map(x => `${esc(x.p.name)} (faltam ${fmtH(x.horas * 36e5)} até ${fmtDate(x.p.deadline)})`).join(' · ')}. Estique algum dia (+) ou mude o prazo.</div></div>` : ''}
    <div class="panel"><div class="panel-h">${seg}${nav}<h3>${esc(titulo)}</h3>${titulo2}<span class="grow"></span><button class="btn sm" data-act="pl-bloq">${icon('plus')} Bloqueio</button></div>
      <div class="panel-b">${corpo}<div class="small muted" style="margin-top:8px">${nota}</div></div></div>
    ${planoRotinaHTML()}`;
  setTimeout(() => (modo === 'mes' ? planoMesRolar() : planoGradeRolar(modo === 'semana')), 0);
  return { title: 'Planejamento', actions: '', html };
};
/* Grade de 24 h: abre perto das 5h (ou 1 h antes de agora) e guarda a rolagem; na semana, abre na semana de hoje. */
function planoGradeRolar(semana = false, irHoje = false) {
  const sc = typeof document !== 'undefined' && document.querySelector && document.querySelector('[data-pl-scroll]'); if (!sc) return;
  if (PLANO.gradeTop == null) { const n = new Date(); PLANO.gradeTop = Math.max(0, Math.min(5, n.getHours() - 1)) * PL_ALT; }
  sc.scrollTop = PLANO.gradeTop;
  if (semana) {
    const regua0 = sc.querySelector('.pl-regua-col')?.offsetWidth || 44;
    sc.style.setProperty('--plw', Math.max(110, Math.floor((sc.clientWidth - regua0 - 8) / 7) - 6) + 'px');
    const alvo = sc.querySelector(`[data-pl-col="${sc.dataset.plSem}"]`);
    const regua = sc.querySelector('.pl-regua-col')?.offsetWidth || 44;
    if (irHoje || PLANO.semLeft == null) { if (alvo) sc.scrollLeft = alvo.offsetLeft - regua - 4; } else sc.scrollLeft = PLANO.semLeft;
  }
  if (!sc._plScroll) { sc._plScroll = true; sc.addEventListener('scroll', () => { PLANO.gradeTop = sc.scrollTop; if (semana) PLANO.semLeft = sc.scrollLeft; }, { passive: true }); }
}
/* Mês: abre (e "Hoje" volta) com a semana de hoje inteira, encostada no topo da janela, logo abaixo do nome do mês. */
function planoMesRolar(forcarHoje = false) {
  const sc = typeof document !== 'undefined' && document.querySelector && document.querySelector('[data-pl-mes]'); if (!sc) return;
  if (forcarHoje || PLANO.mesTop == null) {
    const h = sc.querySelector('[data-hoje]');
    if (h) { const rot = sc.querySelector('.pl-mes-rot'); const alto = rot ? rot.offsetHeight : 0;
      sc.scrollTop = Math.max(0, h.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - alto - 6); }
  } else sc.scrollTop = PLANO.mesTop;
  if (!sc._plScroll) { sc._plScroll = true; sc.addEventListener('scroll', () => { PLANO.mesTop = sc.scrollTop; }, { passive: true }); }
}
ACTIONS['pl-modo'] = (el) => { PLANO.modo = el.dataset.m; db.setSetting('planoModo', el.dataset.m); render(); };
ACTIONS['pl-ir-dia'] = (el) => { PLANO.dia = el.dataset.dia; PLANO.modo = 'dia'; render(); };
ACTIONS['pl-nav'] = (el) => { const d = Number(el.dataset.d); if (!d) PLANO.dia = null; else PLANO.dia = planoDiaMais(PLANO.dia || ymd(new Date()), d); render(); };
ACTIONS['pl-mes-hoje'] = () => planoMesRolar(true);
ACTIONS['pl-sem'] = (el) => {
  const sc = document.querySelector('[data-pl-scroll]'); if (!sc) return;
  const d = Number(el.dataset.d); if (!d) return planoGradeRolar(true, true);
  const col = sc.querySelector('.pl-dia'); const w = col ? col.offsetWidth + 6 : 160;
  sc.scrollBy({ left: d * 7 * w, behavior: 'smooth' });
};
ACTIONS['pl-rafa-ir'] = (el) => { if (typeof RF !== 'undefined') RF.ym = el.dataset.dia.slice(0, 7); go('rafa'); };
ACTIONS['pl-dia'] = (el) => {
  const m = { ...planoEsticados() }; const cfg = planoCfg();
  const v = Math.max(0, Math.min(14, (m[el.dataset.dia] ?? cfg.horasDia) + Number(el.dataset.d)));
  if (v === cfg.horasDia) delete m[el.dataset.dia]; else m[el.dataset.dia] = v;
  db.setSetting('planoDias', m); render();
};

ACTIONS['pl-bloq-del'] = (el) => { db.setSetting('planoBloqueios', planoBloqueios().filter(b => b.id !== el.dataset.id)); render(); };

ACTIONS['pl-bloq'] = (el) => {
  const diaPre = el?.dataset?.dia || (planoModo() === 'dia' && PLANO.dia) || ymd(new Date());
  const l = openLayer({ html: `<div class="dh"><h2>Novo bloqueio</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db grid2"><div class="field span2"><label for="pb-n">O quê</label><input id="pb-n" class="input" placeholder="Médico, reunião, compromisso…"></div>
    <div class="field span2"><label for="pb-d">Dia</label><input id="pb-d" type="date" class="input" value="${diaPre}"></div>
    <div class="field"><label for="pb-i">Início</label><input id="pb-i" type="time" class="input" value="15:00"></div><div class="field"><label for="pb-f">Fim</label><input id="pb-f" type="time" class="input" value="16:00"></div></div>
    <div class="df"><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-pb-ok>Bloquear</button></div>` });
  l.box.addEventListener('click', (e) => {
    if (!e.target.closest('[data-pb-ok]')) return;
    const h = (v) => { const [a, b] = String(v || '').split(':').map(Number); return a + (b || 0) / 60; };
    const ini = h($('#pb-i', l.box).value), fim = h($('#pb-f', l.box).value), dia = $('#pb-d', l.box).value;
    if (!dia || !(fim > ini)) return toast('Confira o dia e os horários.');
    db.setSetting('planoBloqueios', [...planoBloqueios(), { id: uid(), dia, ini, fim, nome: $('#pb-n', l.box).value.trim() }]);
    l.close(); render(); toast('Bloqueio marcado; o plano se reorganiza em volta');
  });
};


ACTIONS['pl-unpin'] = (el) => { db.setSetting('planoPins', planoPins().filter(p => p.id !== el.dataset.id)); render(); };
/* Sexta: troca só esta sexta entre T e A no Dias de Rafa (fica como marcada à mão). */
ACTIONS['pl-sexta'] = (el) => {
  const dia = el.dataset.dia; const novo = planoSextaRafa(dia) ? 'A' : 'T';
  if (typeof rafaMarcar === 'function') { rafaMarcar(dia, { who: novo }); db.emit(); toast(`Sexta ${fmtDate(dia)}: ${novo === 'T' ? 'com o Rafa' : 'com a Amanda'} (só esta sexta)`); }
};
const planoRotinaSalvar = (l) => db.setSetting('planoRotina', l);
/* Mudar a rotina "de hoje em diante": a versão em vigor termina ontem e a nova começa hoje (o passado fica como era). */
function planoRotinaMudar(id, patch) {
  const hoje = ymd(new Date()); const ontem = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); })();
  const l = planoRotina().slice(); const i = l.findIndex(r => r.id === id); if (i < 0) return;
  const r = l[i];
  if ((r.desde || '') >= hoje) l[i] = { ...r, ...patch };
  else { l[i] = { ...r, ate: ontem }; l.push({ ...r, ...patch, id: uid(), desde: hoje, ate: null }); }
  planoRotinaSalvar(l);
}
const planoHoraDe = (v) => { const [a, b] = String(v || '').split(':').map(Number); return Number.isFinite(a) ? a + (b || 0) / 60 : null; };
/* Painel "Rotina fixa": os blocos em vigor de hoje em diante, com dia, horário e repetição. */
function planoRotinaHTML() {
  const hoje = ymd(new Date()); const SEM = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const ativos = planoRotina().filter(r => !r.ate || r.ate >= hoje).sort((a, b) => a.ini - b.ini);
  const linha = (r) => `<div class="pl-rot-l">
    <input class="input sm" value="${esc(r.nome)}" data-on="pl-rot" data-id="${r.id}" data-f="nome" aria-label="Nome">
    <span class="pl-rot-dias">${SEM.map((l, wd) => `<button type="button" class="${(r.dias || []).includes(wd) ? 'on' : ''}" data-act="pl-rot-dia" data-id="${r.id}" data-wd="${wd}" title="${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][wd]}">${l}</button>`).join('')}</span>
    <input type="time" class="input sm" value="${planoHora(r.ini)}" data-on="pl-rot" data-id="${r.id}" data-f="ini" aria-label="Começa">
    <input type="time" class="input sm" value="${planoHora(r.fim)}" data-on="pl-rot" data-id="${r.id}" data-f="fim" aria-label="Termina">
    <select class="input sm" data-on="pl-rot" data-id="${r.id}" data-f="rafa" aria-label="Com o Rafa" title="Liga o bloco ao Dias de Rafa"><option value="" ${!r.rafa ? 'selected' : ''}>Sempre</option><option value="T" ${r.rafa === 'T' ? 'selected' : ''}>Dia T</option><option value="manha" ${r.rafa === 'manha' ? 'selected' : ''}>Manhã depois de T</option></select>
    <label class="check small" title="Flexível: num dia que já passou, o bloco vira o espaço real sem trabalho registrado (ex.: almoço 12h–14h, trabalhou até 12h40 e voltou 13h50 → 12h40–13h50)"><input type="checkbox" data-on="pl-rot" data-id="${r.id}" data-f="flex" ${r.flex ? 'checked' : ''}> Flexível</label>
    <select class="input sm" data-on="pl-rot" data-id="${r.id}" data-f="repete" aria-label="Repete"><option value="semanal" ${r.repete !== 'quinzenal' ? 'selected' : ''}>Toda semana</option><option value="quinzenal" ${r.repete === 'quinzenal' ? 'selected' : ''}>A cada 2 semanas</option></select>
    <button class="btn sm ghost icon" data-act="pl-rot-del" data-id="${r.id}" title="Tirar da rotina de hoje em diante" aria-label="Tirar">${icon('x')}</button></div>`;
  return `<div class="panel"><div class="panel-h"><h3>Rotina fixa</h3><span class="small muted">mudanças valem de hoje em diante; o passado não muda. Para mexer num dia só, arraste ou puxe o bloco no calendário. "Rafa" liga o bloco ao Dias de Rafa.</span><span class="grow"></span><button class="btn sm" data-act="pl-rot-novo">${icon('plus')} Bloco fixo</button></div>
    <div class="panel-b"><div class="pl-rot-cab small muted"><span>Bloco</span><span>Dias</span><span>Começa</span><span>Termina</span><span>Rafa</span><span>Acompanha</span><span>Repete</span><span></span></div>${ativos.map(linha).join('')}</div></div>`;
}
CHANGES['pl-rot'] = (el) => {
  const f = el.dataset.f; let v = f === 'flex' ? el.checked : el.value;
  if (f === 'ini' || f === 'fim') { v = planoHoraDe(v); if (v == null) return; }
  if (f === 'nome') v = String(v).trim() || 'Bloco fixo';
  const patch = { [f]: v };
  if (f === 'repete' && v === 'quinzenal') patch.ref = ymd(new Date());
  planoRotinaMudar(el.dataset.id, patch); render();
};
ACTIONS['pl-rot-dia'] = (el) => { const r = planoRotina().find(x => x.id === el.dataset.id); if (!r) return; const wd = Number(el.dataset.wd); const dias = (r.dias || []).includes(wd) ? r.dias.filter(x => x !== wd) : [...(r.dias || []), wd].sort(); planoRotinaMudar(r.id, { dias }); render(); };
ACTIONS['pl-rot-del'] = (el) => { const ontem = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); })(); const hoje = ymd(new Date());
  planoRotinaSalvar(planoRotina().flatMap(r => r.id !== el.dataset.id ? [r] : (r.desde || '') >= hoje ? [] : [{ ...r, ate: ontem }])); render(); toast('Bloco tirado da rotina de hoje em diante'); };
ACTIONS['pl-rot-novo'] = () => { planoRotinaSalvar([...planoRotina(), { id: uid(), grupo: uid(), nome: 'Novo bloco', ini: 15, fim: 16, dias: [1, 2, 3, 4, 5], repete: 'semanal', rafa: '', flex: false, desde: ymd(new Date()), ate: null }]); render(); };
/* Ajuste de um dia só: tirar o bloco fixo daquele dia, ou voltar ao padrão. */
ACTIONS['pl-fixo-off'] = (el) => { const m = { ...planoRotinaDia() }; m[el.dataset.dia] = { ...(m[el.dataset.dia] || {}), [el.dataset.g]: { off: true } }; db.setSetting('planoRotinaDia', m); render(); toast('Tirado só deste dia'); };
ACTIONS['pl-fixo-reset'] = (el) => { const m = { ...planoRotinaDia() }; const d = { ...(m[el.dataset.dia] || {}) }; delete d[el.dataset.g]; m[el.dataset.dia] = d; db.setSetting('planoRotinaDia', m); render(); };

/* To-do sem data → primeiro horário livre do dia (a partir de agora, se for hoje), com 15 min ou a estimativa. */
ACTIONS['pl-encaixar'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return; const dia = el.dataset.dia;
  const dur = (Number(n.data?.est) > 0 ? Number(n.data.est) : 15) / 60;
  const agora = dia === ymd(new Date()) ? (() => { const x = new Date(); return Math.ceil((x.getHours() + x.getMinutes() / 60) * 4) / 4; })() : 0;
  const ocupado = (planejar(planoProjetos(), new Date(), 120).porDia[dia]?.blocos || []).map(b => [b.ini, b.fim]);
  let achou = null;
  for (const [a0, b] of planoJanelas(dia).jan) {
    let a = Math.max(a0, agora);
    for (const [p, q] of ocupado.sort((x, y) => x[0] - y[0])) { if (a + dur <= p) break; if (q > a && p < a + dur) a = q; }
    if (a + dur <= b) { achou = a; break; }
  }
  if (achou == null) achou = Math.max(agora, planoInicioDia(dia));
  const fim = achou + dur; const hm = (h) => planoHora(h);
  db.update('tempo_notices', n.id, { data: { ...(n.data || {}), due: `${dia}T${hm(achou)}`, end: fim < 24 ? hm(fim) : null, semHora: false } }, true);
  db.emit(); toast(`Encaixado: ${fmtDate(dia)} ${hm(achou)}–${hm(fim)}`);
};

/* ---------- Arrastar e puxar (tudo que não é registro) ----------
   Arrastar muda o horário (de 15 em 15 min; o planejado e o bloqueio também mudam de dia); puxar a borda de cima ou
   de baixo muda o começo ou o fim. Uma janelinha mostra o horário novo enquanto mexe.
   planejado → fica fixado · rotina → só naquele dia · to-do → muda o to-do · bloqueio → muda o bloqueio. */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  let d = null, mexeu = false, tip = null;
  const q = (h) => Math.round(h * 4) / 4;
  const calc = (x, dy) => {
    const dh = dy / PL_ALT; let a = x.ini, b = x.fim;
    if (x.modo === 'top') a = Math.min(b - 0.25, Math.max(0, q(a + dh)));
    else if (x.modo === 'bot') b = Math.max(a + 0.25, Math.min(24, q(b + dh)));
    else { const dur = b - a; a = Math.max(0, Math.min(24 - dur, q(a + dh))); b = a + dur; }
    return [a, b];
  };
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.target.closest) return;
    if (e.target.closest('.pl-unpin, .pl-fx-bt')) return;
    const el = e.target.closest('[data-dg]'); if (!el) return;
    const modo = e.target.closest('.dg-t') ? 'top' : e.target.closest('.dg-b') ? 'bot' : 'move';
    d = { el, modo, kind: el.dataset.dg, dia: el.dataset.dia, ini: Number(el.dataset.ini), fim: Number(el.dataset.fim), y0: e.clientY, x0: e.clientX, top0: el.offsetTop, h0: el.offsetHeight };
    mexeu = false;
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!d) return; const dy = e.clientY - d.y0, dx = e.clientX - d.x0;
    if (!mexeu && Math.hypot(dx, dy) < 4) return;
    if (!mexeu) { mexeu = true; d.el.classList.add('arrastando'); tip = document.createElement('div'); tip.className = 'pl-dg-tip'; document.body.appendChild(tip); }
    const [a, b] = calc(d, dy);
    d.el.style.top = (a * PL_ALT) + 'px'; d.el.style.height = Math.max(10, (b - a) * PL_ALT - 2) + 'px';
    if (d.modo === 'move' && (d.kind === 'plano' || d.kind === 'bloq')) d.el.style.transform = `translateX(${dx}px)`;
    tip.textContent = `${planoHora(a)}–${planoHora(b)} · ${fmtH((b - a) * 36e5)}`;
    tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 12) + 'px';
  });
  document.addEventListener('pointerup', (e) => {
    if (!d) return; const x = d; d = null; if (tip) { tip.remove(); tip = null; }
    if (!mexeu) return;
    x.el.style.pointerEvents = 'none';
    const [a, b] = calc(x, e.clientY - x.y0);
    let dia = x.dia;
    if (x.modo === 'move' && (x.kind === 'plano' || x.kind === 'bloq')) { const col = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-pl-col]'); if (col) dia = col.dataset.plCol; }
    x.el.style.pointerEvents = '';
    if (x.kind === 'plano') {
      const pid = x.el.dataset.pid;
      const pins = planoPins().filter(p => !(p.pid === pid && (p.dia === x.dia || p.dia === dia)));
      pins.push({ id: uid(), dia, pid, ini: a, h: b - a }); db.setSetting('planoPins', pins);
    } else if (x.kind === 'fixo') {
      const m = { ...planoRotinaDia() }; m[x.dia] = { ...(m[x.dia] || {}), [x.el.dataset.g]: { ini: a, fim: b } }; db.setSetting('planoRotinaDia', m);
    } else if (x.kind === 'todo') {
      const n = db.get('tempo_notices', x.el.dataset.id);
      if (n) db.update('tempo_notices', n.id, { data: { ...(n.data || {}), due: `${x.dia}T${planoHora(a)}`, end: b < 24 ? planoHora(b) : null, semHora: false } }, true);
    } else if (x.kind === 'bloq') {
      db.setSetting('planoBloqueios', planoBloqueios().map(bq => bq.id === x.el.dataset.id ? { ...bq, dia, ini: a, fim: b } : bq));
    }
    db.emit(); render();
    toast(`${x.kind === 'fixo' ? 'Só neste dia: ' : x.kind === 'plano' ? 'Fixado: ' : ''}${dia !== x.dia ? fmtDate(dia) + ' ' : ''}${planoHora(a)}–${planoHora(b)}`);
  });
  // o clique que termina um arrasto não abre nada
  document.addEventListener('click', (e) => { if (mexeu && e.target.closest && e.target.closest('[data-dg]')) { e.stopPropagation(); e.preventDefault(); mexeu = false; } }, true);
  // mês: janela com o dia em detalhe ao passar o mouse
  let pop = null, popDia = null, timer = null;
  const fecha = () => { clearTimeout(timer); timer = null; if (pop) { pop.remove(); pop = null; popDia = null; } };
  document.addEventListener('mouseover', (e) => {
    const c = e.target.closest && e.target.closest('[data-pl-pop]');
    if (!c) { if (pop && !(e.target.closest && e.target.closest('.pl-pop'))) fecha(); return; }
    if (popDia === c.dataset.plPop) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fecha(); popDia = c.dataset.plPop;
      pop = document.createElement('div'); pop.className = 'pl-pop'; pop.innerHTML = planoPopHTML(popDia); document.body.appendChild(pop);
      const r = c.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      let left = r.right + 8; if (left + pw > window.innerWidth - 8) left = r.left - pw - 8;
      let top = Math.min(Math.max(8, r.top), window.innerHeight - ph - 8);
      pop.style.left = Math.max(8, left) + 'px'; pop.style.top = top + 'px';
    }, 280);
  });
  document.addEventListener('scroll', fecha, true);
})();

/* ---------- Criar arrastando no vazio (como no Google Agenda) ----------
   Clique e arraste num horário livre da grade: abre o menu para criar bloqueio, to-do ou bloco de projeto.
   Clique simples cria 30 min. */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  let c = null;
  const hDe = (grade, y) => Math.max(0, Math.min(24, Math.round(((y - grade.getBoundingClientRect().top) / PL_ALT) * 4) / 4));
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.target.classList || !e.target.classList.contains('pl-grade')) return;
    const col = e.target.closest('[data-pl-col]'); if (!col) return;
    const h0 = hDe(e.target, e.clientY);
    const fx = document.createElement('div'); fx.className = 'pl-novo'; e.target.appendChild(fx);
    c = { grade: e.target, dia: col.dataset.plCol, h0, fx, y0: e.clientY };
    const pinta = (a, b) => { fx.style.top = (a * PL_ALT) + 'px'; fx.style.height = Math.max(6, (b - a) * PL_ALT) + 'px'; fx.textContent = `${planoHora(a)}–${planoHora(b)}`; };
    c.pinta = pinta; pinta(h0, h0 + 0.5);
  });
  document.addEventListener('pointermove', (e) => {
    if (!c) return; const h = hDe(c.grade, e.clientY);
    const a = Math.min(c.h0, h), b = Math.max(c.h0, h); c.a = a; c.b = Math.abs(e.clientY - c.y0) < 5 ? c.h0 + 0.5 : Math.max(a + 0.25, b);
    c.pinta(c.a, c.b);
  });
  document.addEventListener('pointerup', () => {
    if (!c) return; const x = c; c = null;
    const a = x.a ?? x.h0, b = x.b ?? x.h0 + 0.5;
    planoCriarMenu(x.dia, a, b, () => x.fx.remove());
  });
})();
function planoCriarMenu(dia, a, b, fim) {
  const projs = projects().filter(p => ['todo', 'active'].includes(statusCat(p.status_id))).sort((x, y) => String(x.name).localeCompare(String(y.name), 'pt-BR'));
  const l = openLayer({
    html: `<div class="dh"><h2>${fmtDate(dia)} · ${planoHora(a)}–${planoHora(b)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:10px">
      <div class="field"><label for="pn-t">Nome</label><input id="pn-t" class="input" placeholder="Para bloqueio ou to-do" autocomplete="off"></div>
      <div class="field"><label for="pn-p">Projeto (para bloco de trabalho)</label><select id="pn-p" class="input"><option value="">—</option>${projs.map(p => `<option value="${p.id}">${esc(p.name)}${clientOf(p) ? ' · ' + esc(clientOf(p).name) : ''}</option>`).join('')}</select></div>
    </div>
    <div class="df"><button class="btn" data-pn="bloq">${icon('clock')} Bloqueio</button><button class="btn" data-pn="todo">${icon('check')} To-do</button><button class="btn primary" data-pn="proj">Bloco de projeto</button></div>`,
    onClose: fim,
  });
  setTimeout(() => l.box.querySelector('#pn-t')?.focus(), 30);
  l.box.addEventListener('click', (e) => {
    const bt = e.target.closest('[data-pn]'); if (!bt) return;
    const nome = l.box.querySelector('#pn-t').value.trim(), pid = l.box.querySelector('#pn-p').value;
    if (bt.dataset.pn === 'bloq') db.setSetting('planoBloqueios', [...planoBloqueios(), { id: uid(), dia, ini: a, fim: b, nome: nome || 'Bloqueio' }]);
    else if (bt.dataset.pn === 'todo') { if (!nome) return toast('Escreva o nome do to-do.'); db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: nome, body: '', data: { due: `${dia}T${planoHora(a)}`, end: b < 24 ? planoHora(b) : null, semHora: false }, decision: '', decided_at: null, snooze_until: null }, true); }
    else { if (!pid) return toast('Escolha o projeto.'); db.setSetting('planoPins', [...planoPins(), { id: uid(), dia, pid, ini: a, h: b - a }]); }
    l.close(); db.emit(); render(); toast('Criado');
  });
}
/* Semana: ao mudar o tamanho da janela, os 7 dias continuam cabendo na largura. */
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', () => {
  const sc = document.querySelector && document.querySelector('.pl-semscroll'); if (!sc) return;
  const r = sc.querySelector('.pl-regua-col')?.offsetWidth || 44;
  sc.style.setProperty('--plw', Math.max(110, Math.floor((sc.clientWidth - r - 8) / 7) - 6) + 'px');
});

/* Zoom do tempo: Alt (Option) + rolagem do mouse na grade aproxima ou afasta as horas, mantendo a hora sob o cursor. */
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('wheel', (e) => {
  if (!e.altKey) return; const sc = e.target.closest && e.target.closest('[data-pl-scroll]'); if (!sc) return;
  e.preventDefault();
  const grade = sc.querySelector('.pl-grade'); if (!grade) return;
  const y = e.clientY - grade.getBoundingClientRect().top;          // px desde 0h
  const hora = y / PL_ALT; const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const novo = Math.max(16, Math.min(160, Math.round(PL_ALT * fator)));
  if (novo === PL_ALT) return;
  const naTela = e.clientY - sc.getBoundingClientRect().top;
  const topoGrade = grade.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  PLANO.gradeTop = Math.max(0, topoGrade + hora * novo - naTela);
  db.setSetting('planoZoom', novo); PL_ALT = novo; render();
}, { passive: false });
