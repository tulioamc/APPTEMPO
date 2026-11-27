/* Planejamento (seção 4 do doc "Ideias organizadas"), etapa 1:
   as horas que faltam em cada projeto ativo (estimado − real) são distribuídas na agenda livre até o prazo,
   prazo mais perto primeiro, até 8 h por dia útil (o dia pode ser esticado). Horários fixos: trabalho das 9h às 19h,
   almoço 12h–14h; às segundas, buscar o Rafa 11h30–14h. Feriados, férias e bloqueios avulsos ficam fora.
   Não grava nada sozinho: o plano é refeito a cada abertura, a partir do que já foi trabalhado. */
const TODO_MIN_H = 0.5;   /* to-do ocupa no mínimo 30 min no Calendário */
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
/* Pin (24/11): inegociável (fixado: Rafa, buscar, arrumar, acordar…) × maleável (almoço, jantar, academia).
   O plano automático pode passar por cima de um bloco maleável quando precisa (a tarefa não cabe na entrega sem ele). */
const PL_MALEAVEL = ['academia', 'almoco', 'almoco-seg', 'jantar'];
const planoRotinaPin = (r) => (r && typeof r.pin === 'boolean') ? r.pin : !PL_MALEAVEL.includes(r?.grupo);
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
    return [ini, fim, r.nome, { grupo: r.grupo, rid: r.id, ajustado: !!a, flex: !!r.flex, real, pin: planoRotinaPin(r) }];
  }).filter(Boolean).sort((x, y) => x[0] - y[0]);
}
/* Início do trabalho no dia: 9h, ou antes se a rotina da manhã acaba antes disso (ex.: volta às 8h40 → trabalha 8h40). */
function planoInicioDia(dia, cfg = planoCfg()) {
  const manha = planoFixosDoDia(dia).filter(f => f[0] < cfg.inicio && f[1] <= cfg.inicio);
  return manha.length ? Math.min(cfg.inicio, Math.max(...manha.map(f => f[1]))) : cfg.inicio;
}
/* planoPins / planoPinsSalvar (porta única dos blocos fixados) ficam em plano-seguro.js */
/* Compromissos de fora: Google (servidor, 'agendaEventos') + Calendário da Apple (app do Mac, 'agendaEventosMac'),
   sem repetir o mesmo evento que chega pelos dois caminhos (mesmo id do iCal, ou mesmo título e início). */
/* Cada conta (Gmail, brenda.ag, iCloud…) pode ser escondida na visualização do Calendário; escondida, continua ocupando o planejamento. */
const agendaContaDe = (ev) => ev.conta || ev.agenda || 'Outros';
const agendaContaNome = (c) => { const d = String(c).split('@')[1]; return d ? (/^(gmail|googlemail)\.com$/i.test(d) ? 'Gmail' : d) : c; };
const agendaContasOff = () => db.setting('agendaContasOff', {}) || {};
function agendaContas() {
  const s = new Set(); [...(db.setting('agendaEventos', []) || []), ...(db.setting('agendaEventosMac', []) || [])].forEach(ev => s.add(agendaContaDe(ev)));
  return [...s].sort((x, y) => agendaContaNome(x).localeCompare(agendaContaNome(y)));
}
let _agTodos = { a: null, b: null, off: null, l: [] };
function agendaTodosEventos() {
  const a = db.setting('agendaEventos', []) || [], b = db.setting('agendaEventosMac', []) || [], off = agendaContasOff();
  if (_agTodos.a === a && _agTodos.b === b && _agTodos.off === off) return _agTodos.l;
  const visto = new Set(), out = [];
  const min = (x) => Math.round(new Date(x).getTime() / 60e3);
  [...a, ...b].forEach(ev => {
    const k1 = ev.uid ? 'u' + ev.uid + '|' + min(ev.ini) : null, k2 = 't' + String(ev.titulo || '').trim().toLowerCase() + '|' + min(ev.ini);
    if ((k1 && visto.has(k1)) || visto.has(k2)) return;
    if (k1) visto.add(k1); visto.add(k2); out.push(off[agendaContaDe(ev)] ? { ...ev, oculto: true } : ev);
  });
  _agTodos = { a, b, off, l: out }; return out;
}
/* Compromissos do dia, de qualquer origem, num formato só: { id, ini, fim (horas decimais), titulo, origem, diaTodo }.
   Hoje: bloqueios marcados no app. Google Agenda: o app do Mac vai gravar os eventos em tempo_settings 'agendaEventos'
   ([{ id, ini: ISO, fim: ISO, titulo, agenda, diaTodo }]) e eles entram aqui sozinhos, ocupando a agenda como bloqueio.
   A volta (Tempo → Google) leva só o FUTURO: blocos planejados (e bloqueios) de agora em diante, com id estável por
   projeto e dia. O que foi feito (registro) nunca vai para o Google: o Tempo é passado, presente e futuro; o Google é futuro. */
function planoEventos(dia, paraPlano = false) {
  const out = planoBloqueios().filter(b => b.dia === dia).map(b => ({ id: b.id, ini: Number(b.ini), fim: Number(b.fim), titulo: b.nome || 'Bloqueio', origem: 'bloqueio' }));
  const d0 = new Date(dia + 'T00:00:00').getTime(), d1 = d0 + 864e5;
  agendaTodosEventos().forEach(ev => {
    if (ev.oculto && !paraPlano) return;
    const a = new Date(ev.ini).getTime(), b = new Date(ev.fim).getTime(); if (!(b > d0 && a < d1)) return;
    out.push({ id: ev.id, ini: Math.max(0, (a - d0) / 36e5), fim: Math.min(24, (b - d0) / 36e5), titulo: ev.titulo || 'Evento', origem: 'google', agenda: ev.agenda || '', diaTodo: !!ev.diaTodo, ocupa: !ev.livre });
  });
  // to-dos com data: com hora = compromisso no horário (fim marcado ou estimativa; no mínimo 30 min no gráfico); só com data = no topo do dia
  db.all('tempo_notices').filter(n => n.kind === 'todo' && n.data?.due && n.data.due.slice(0, 10) === dia).forEach(n => {
    const feito = n.status === 'done';
    if (typeof todoSemHora === 'function' && todoSemHora(n.data)) { out.push({ id: n.id, ini: 0, fim: 0, titulo: n.title, origem: 'todo', diaTodo: true, feito }); return; }
    const [hh, mm] = n.data.due.slice(11, 16).split(':').map(Number); const ini = hh + mm / 60;
    let fim = n.data.end ? (([a, b]) => a + b / 60)(n.data.end.split(':').map(Number)) : ini + (Number(n.data.est) > 0 ? Number(n.data.est) : 30) / 60;
    fim = Math.max(fim, ini + TODO_MIN_H);   // lembrete só com a hora também ocupa 30 min
    /* to-do NÃO ocupa o horário do planejamento (25/11): pode coexistir com tarefas planejadas; o plano passa por baixo e a grade desenha o to-do por cima */
    out.push({ id: n.id, ini, fim: Math.min(24, fim), titulo: n.title, origem: 'todo', feito, ocupa: false });
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
    if (b > a) brutos.push({ pid: e.project_id || null, tid: e.task_id || null, a, b });
  }));
  brutos.sort((x, y) => x.a - y.a);
  const out = [];
  brutos.forEach(x => { const l = out[out.length - 1]; if (l && l.pid === x.pid && l.tid === x.tid && x.a - l.b < 10 * 60e3) { l.b = Math.max(l.b, x.b); l.ms += x.b - x.a; } else out.push({ ...x, ms: x.b - x.a }); });
  return out.map(f => ({ ...f, ini: (f.a - d0) / 36e5, fim: (f.b - d0) / 36e5 }));
}
const planoCorCli = (pid) => { const pr = pid && db.get('tempo_projects', pid); const c = pr && clientOf(pr); return c?.color ? hexOf(c.color) : planoCor(pid); };   // Mês: a cor é a do cliente (a do projeto só se o cliente não tem)
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
/* solto: true = os blocos maleáveis da rotina não tiram horário (o plano passa por cima deles quando precisa). */
function planoJanelas(dia, cfg = planoCfg(), { solto = false } = {}) {
  const tira = [...planoFixosDoDia(dia), ...planoEventos(dia, true).filter(ev => !ev.diaTodo && ev.ocupa !== false).map(ev => [ev.ini, ev.fim, ev.titulo])].sort((a, b) => a[0] - b[0]);
  let jan = [[planoInicioDia(dia, cfg), cfg.fim + Math.max(0, (planoEsticados()[dia] || cfg.horasDia) - cfg.horasDia)]];
  tira.filter(f => !(solto && f[3] && f[3].pin === false)).forEach(([a, b]) => { jan = jan.flatMap(([x, y]) => b <= x || a >= y ? [[x, y]] : [[x, Math.min(a, y)], [Math.max(b, x), y]].filter(([p, q]) => q - p > 0.01)); });
  return { jan, fixos: tira };
}
/* Horas que faltam em cada projeto ativo com estimativa. */
function planoProjetos() {
  return projects().filter(p => ['todo', 'active'].includes(statusCat(p.status_id)) && Number(p.estimated_hours) > 0)
    .map(p => ({ p, falta: Math.max(0, Number(p.estimated_hours) - projectMs(p.id) / 36e5), prazo: p.deadline || null }))
    .filter(x => x.falta > 0.05)
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
}
/* Planejado do Calendário: vem da fila única de tarefas (tarefas-prazo.js › tkMotor), com o tempo previsto de cada
   tarefa, dependências, entregas, horas livres e blocos fixados à mão. `lista` fica só por compatibilidade. */
function planejar(lista, hoje = new Date(), dias = 60) {
  if (typeof tkMotor !== 'function') return planejarPorProjeto(lista, hoje, dias);   // sem a fila de tarefas (testes antigos)
  try { const m = tkMotor(hoje, Math.max(dias, 60)); PLANO.erroMotor = null; return { porDia: m.porDia, estouro: m.estouro }; }
  catch (e) {   // o cálculo quebrou (dado estranho): mostra o último plano que funcionou, em vez de apagar o Calendário
    console.error('Plano:', e); PLANO.erroMotor = String(e?.message || e);
    const u = typeof tkUltimoBom === 'function' ? tkUltimoBom() : null; return u ? { porDia: u.porDia, estouro: u.estouro } : { porDia: {}, estouro: [] };
  }
}

/* Distribuição antiga, só por projeto (horas estimadas), usada quando a fila de tarefas não está carregada. */
function planejarPorProjeto(lista, hoje = new Date(), dias = 60) {
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

const PLANO = { modo: null, dia: null, mesTop: null, semLeft: null, gradeTop: null, porDia: {}, sel: new Set() };
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
  // bloco maleável que o plano usou: aparece esmaecido, com a dica explicando
  it.forEach(x => { if (x.k === 'fixo' && x.m.pin === false && (porDia[dia]?.blocos || []).some(bl => bl.ini < x.b - 1e-6 && bl.fim > x.a + 1e-6)) x._porCima = true; });
  (porDia[dia]?.fantasmas || []).forEach(f => it.push({ k: 'fantasma', a: f.ini, b: f.fim, f }));
  // linha de entrega: cada tarefa aberta com prazo neste dia (na hora da entrega; sem hora = fim do expediente)
  // entregas (deadlines) dos projetos ativos neste dia
  projects().filter(p => !p.archived && ['todo', 'active'].includes(statusCat(p.status_id))).forEach(p => (typeof projEntregas === 'function' ? projEntregas(p.id) : []).filter(e => e.dia === dia).forEach(e => {
    const h = planoHoraDe(e.hora || '19:00'); if (h != null) it.push({ k: 'prazo', a: h, b: h + 0.001, ent: e, p });
  }));
  // só as entregas (deadlines) viram linha; a hora de entrega de cada tarefa não aparece mais na grade (pedido do Tulio, 24/11)
  // Modo "Não rolou" (botão, começa desligado): mostra o plano da manhã sobreposto — verde = rolou, amarelo = não rolou como planejado mas houve trabalho no projeto depois, vermelho = não rolou e nada foi feito depois
  if (planoMostra('naofeito') && dia <= ymd(new Date())) { const pr = planoVsReal(dia); const agoraH = new Date().getHours() + new Date().getMinutes() / 60; const hojeS = ymd(new Date());
    (pr?.blocos || []).forEach(b => {
      if (!b.ok && dia === hojeS && b.fim > agoraH) return;   // ainda vai acontecer
      let st = 'ok';
      if (!b.ok) { const dias = [dia]; for (let d = planoDiaMais(dia, 1); d <= hojeS; d = planoDiaMais(d, 1)) dias.push(d);
        const depois = dias.some(d => planoFeitosDoDia(d).some(f => f.pid === b.pid && (d > dia || f.ini >= b.fim - 1e-6)));
        st = depois ? 'ajustado' : 'falhou'; }
      it.push({ k: 'naofeito', a: b.ini, b: b.fim, bl: b, st }); }); }
  const tipoFiltro = { fantasma: 'trabalho', fixo: 'rotina', todo: 'todos', todos: 'todos', feito: 'trabalho', plano: 'trabalho', prazo: 'trabalho' };
  return it.filter(x => x.b > x.a && (!tipoFiltro[x.k] || planoMostra(tipoFiltro[x.k])));
}
/* Lado a lado: itens que se sobrepõem dividem a largura (colunas por grupo de sobreposição). */
/* Compromisso da agenda (Google/Apple) que aconteceu enquanto você registrava trabalho vira uma coisa só com o registro:
   se pelo menos metade dele cai dentro do registrado, some como bloco separado e aparece no registro (nome e horário). */
function planoJuntaAgenda(itens) {
  const feitos = itens.filter(x => x.k === 'feito');
  if (!feitos.length) return itens;
  return itens.filter(x => {
    if (x.k !== 'evento' || x.e?.origem !== 'google') return true;
    const dur = x.b - x.a; if (dur <= 0) return true;
    let sob = 0, alvo = null, melhor = 0;
    feitos.forEach(f => { const o = Math.max(0, Math.min(f.b, x.b) - Math.max(f.a, x.a)); sob += o; if (o > melhor) { melhor = o; alvo = f; } });
    if (sob < dur * 0.5 || !alvo) return true;
    (alvo.agenda ||= []).push(x.e); return false;
  });
}
/* Três faixas em cada dia (só no Dia): esquerda = rotina; meio = to-dos e trabalho planejado; direita = registrado e
   compromissos. Dentro de cada faixa, o que cai no mesmo horário divide a largura e, no meio, ganha o aviso de choque.
   Arrastar um item para o lado, dentro do mesmo dia, troca a faixa só dele (planoFaixaFix). */
const PL_FAIXA = { fixo: 0, todo: 1, todos: 1, plano: 1, naofeito: 1, feito: 2, evento: 2 };
const planoFaixaFix = () => db.setting('planoFaixaFix', {}) || {};
function planoFk(x, dia) {
  if (x.k === 'fixo') return 'f:' + (x.m?.grupo || x.n) + ':' + dia;
  if (x.k === 'plano') return 'p:' + x.bl.pid + ':' + (x.bl.tid || '') + ':' + dia;
  if (x.k === 'todo') return 't:' + x.e.id;
  if (x.k === 'evento') return 'e:' + x.e.id;
  return '';
}
/* Semana: como no Google Agenda / iCal. Rotina fica de fundo (largura toda); o resto se sobrepõe em cascata: quem começa
   depois entra um pouco mais para a direita e fica por cima, então o texto de cima de cada bloco nunca é coberto.
   Os que começam juntos (até 20 min de diferença) dividem a largura lado a lado. */
function planoCascata(itens) {
  // 24/11: o que cai no mesmo horário divide a largura lado a lado (como no Dia), em vez de entrar em cascata por cima.
  // 25/11: to-dos e rotina maleável ficam POR CIMA (fundo translúcido), ocupando parte do bloco de baixo (planoSobrepor).
  const fundo = itens.filter(x => x.k === 'fixo' && !planoSobreTipo(x)); fundo.forEach(x => { x._left = 0; x._w = 100; x._fundo = true; x._z = 0; });
  const ord = planoFaixasLivre(itens.filter(x => x.k !== 'fixo' && !planoSobreTipo(x)));
  ord.forEach((x, k) => { x._left = x._l * (100 / x._n) * PL_CALHA; x._w = 100 / x._n * PL_CALHA; x._nivel = 0; x._z = k + 1; });
  return [...fundo, ...ord, ...planoSobrepor(itens.filter(planoSobreTipo), ord)];
}
/* Itens que ficam por cima dos outros, com fundo translúcido e contorno inteiro: to-dos e rotina maleável
   (a fixada, inegociável, continua de fundo). */
/* Como no Google Agenda: os blocos de baixo deixam uma calha à direita (7%), por onde os de cima passam e se destacam. */
const PL_CALHA = 0.93;
const planoSobreTipo = (x) => x.k === 'todo' || x.k === 'todos' || (x.k === 'fixo' && x.m && x.m.pin === false);
let PL_ALT_AGORA = null, PL_COLW_AGORA = null;   // altura de 1 h na grade que está sendo desenhada (para saber quanto ocupa o texto de um bloco)
/* Regra (25/11): o item de cima entra um pouco recuado (o bloco de baixo continua aparecendo na esquerda) e pode cobrir
   o corpo do bloco de baixo. Se ele cair em cima do TEXTO de outro:
   - bloco de trabalho (texto no topo, ~44 px): vai para a metade da direita dele;
   - outro to-do/rotina: começa logo depois de onde o texto do outro termina (texto curto = sobra mais espaço);
   - se o texto do outro é grande e não sobra espaço: os dois dividem a largura no meio (o de baixo quebra o texto). */
const planoTxtDe = (x) => (x.k === 'todo' ? x.e?.titulo : x.k === 'todos' ? `${(x.lista || []).length} to-dos` : x.k === 'fixo' ? x.n || x.m?.nome : '') || '';
function planoSobrepor(over, base) {
  const alt = PL_ALT_AGORA || (typeof PL_ALT !== 'undefined' ? PL_ALT : 48);
  const colW = PL_COLW_AGORA || globalThis.__PL_COLW || 160;   // largura da coluna em px (estimada), para medir o texto
  const tH = 44 / alt, tH1 = 20 / alt, INSET = 8;
  const larguraTxt = (x) => Math.min(100, (30 + planoTxtDe(x).length * 6.3) / colW * 100);   // % da coluna
  const postos = [...base];
  over.slice().sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a)).forEach((x, i) => {
    const fimX = planoFimVisual(x);
    const viz = postos.filter(p => p.a < fimX - 1e-9 && planoFimVisual(p) > x.a + 1e-9);
    let left = viz.length ? INSET : 0; let divide = null;
    // nada embaixo: ocupa como um bloco comum (com a calha), e outro item pode passar por cima dele depois
    if (!viz.length) { x._left = 0; x._w = 100 * PL_CALHA; x._sobre = true; x._z = 60 + i; x._n = 1; postos.push(x); return; }
    viz.forEach(p => {
      const zona = p._sobre ? (p.k === 'fixo' ? tH : tH1) : tH;
      if (!(x.a < p.a + zona - 1e-9 && fimX > p.a + 1e-9)) return;   // não encosta no texto dele
      if (!p._sobre) { left = Math.max(left, (p._left ?? 0) + (p._w ?? 100) * 0.5); return; }
      const fimTxt = (p._left ?? 0) + Math.min(p._w ?? 100, larguraTxt(p)) + 2;
      if (100 - fimTxt >= Math.max(28, Math.min(40, larguraTxt(x)))) left = Math.max(left, fimTxt);
      else divide = p;
    });
    if (divide) { const meio = (divide._left ?? 0) + (divide._w ?? 100) / 2; divide._w = meio - (divide._left ?? 0); left = Math.max(left, meio); }
    let w = 100 - left;
    if (w < 30) { left = 50; w = 50; }
    x._left = left; x._w = w; x._sobre = true; x._z = 60 + i; x._n = 1;
    postos.push(x);
  });
  return over;
}
function planoFaixas(itens0, unico = true, dia = '') {
  const prazos = itens0.filter(x => x.k === 'prazo'); prazos.forEach(x => { x._left = 0; x._w = 100; x._z = 90; });
  const itens = itens0.filter(x => x.k !== 'prazo');
  if (!unico) return [...planoCascata(itens), ...prazos];
  const fix = planoFaixaFix(); const lanes = [[], [], []];
  itens.forEach(x => {
    let l = x.k === 'evento' && x.e?.origem === 'bloqueio' ? 1 : (PL_FAIXA[x.k] ?? 1);
    const k = planoFk(x, dia); if (k && fix[k] !== undefined) l = fix[k];
    x._fk = k; x._lane = l; lanes[l].push(x);
  });
  const W = 100 / 3; const out = [];
  lanes.forEach((ls, li) => {
    const base = planoFaixasLivre(ls.filter(x => !planoSobreTipo(x)));
    base.forEach(x => { x._left = x._l * (100 / x._n) * PL_CALHA; x._w = 100 / x._n * PL_CALHA; });
    const over = planoSobrepor(ls.filter(planoSobreTipo), base);
    [...base, ...over].forEach(x => {
      x._left = li * W + (x._left ?? 0) * W / 100; x._w = (x._w ?? 100) * W / 100;
      if (li === 1 && x._n > 1 && ['plano', 'todo', 'todos'].includes(x.k)) x._choque = true;
      out.push(x);
    });
  });
  return [...out, ...prazos];
}
/* Como no Google Agenda: o que se sobrepõe na tela divide a largura. Item curto (to-do sem duração, compromisso de
   poucos minutos) ocupa na tela pelo menos ~20 min de altura, então conta com esse tamanho para não ficar um por cima do outro. */
const PL_MIN_VISUAL = 0.34;
const planoFimVisual = (x) => Math.max(x.b, x.a + (['todo', 'todos', 'evento', 'plano'].includes(x.k) ? PL_MIN_VISUAL : 0));
function planoFaixasLivre(itens) {
  const ord = itens.slice().sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a));
  let grupo = [], fimG = -1;
  const fecha = () => { const n = Math.max(1, ...grupo.map(x => x._l + 1)); grupo.forEach(x => { x._n = n; }); grupo = []; };
  ord.forEach(x => {
    if (grupo.length && x.a >= fimG - 1e-9) { fecha(); fimG = -1; }
    const usados = new Set(grupo.filter(g => planoFimVisual(g) > x.a + 1e-9).map(g => g._l));
    let l = 0; while (usados.has(l)) l++;
    x._l = l; grupo.push(x); fimG = Math.max(fimG, planoFimVisual(x));
  });
  if (grupo.length) fecha();
  return ord;
}
/* Puxadores de cima e de baixo (blocos que não são registro). */
/* Chip do cliente (na cor dele) no começo dos blocos de trabalho; o cliente diz mais que a agência. */
const planoCliChip = (p) => { const c = p && clientOf(p); return c ? `<span class="tag tg pl-cli" style="${cssTb(c.color)}${partyFg('client', c.id) ? ';color:' + partyFg('client', c.id) : ''}">${esc(c.name)}</span>` : ''; };
const PL_PUX = '<i class="dg-t" title="Puxe para mudar o começo"></i><i class="dg-b" title="Puxe para mudar o fim"></i>';
function planoItemHTML(x, dia, { alt, unico, auto }) {
  const y = x.a * alt, h = (x.b - x.a) * alt;
  const pos = `top:${y}px;height:${Math.max(x.k === 'feito' ? 3 : 14, h - (x.k === 'feito' ? 1 : 2))}px;left:calc(${(x._left ?? 0).toFixed(3)}% + 1px);width:calc(${(x._w ?? 100).toFixed(3)}% - 3px)`;
  const curto = h < 30;
  if (x._marc) {   // to-do na Semana: marcador pequeno na borda direita (bolinha e hora; nome no hover)
    const l = x.k === 'todos' ? x.lista : [x.e]; const feito = l.every(e => e.feito);
    return `<div class="pl-marc${feito ? ' feito' : ''}" style="top:${y}px"${l.length === 1 ? ` data-act="todo-modal" data-id="${l[0].id}"` : ''} data-tip="${esc(`${l.length > 1 ? l.length + ' to-dos às ' : 'To-do às '}${planoHora(x.a)}\n` + l.map(e => (e.feito ? '✓ ' : '• ') + e.titulo).join('\n'))}"><i></i>${l.length > 1 ? l.length + ' · ' : ''}${planoHora(x.a)}</div>`;
  }
  if (x.k === 'prazo' && x.ent) { const e = x.ent, p = x.p;
    return `<div class="pl-prazo ent" data-dg="prazo" data-dia="${dia}" data-ent="${e.id}" data-pid="${p.id}" data-ini="${x.a}" data-fim="${x.a}" style="top:${y}px" data-tip="${esc(`Deadline: ${e.nome || 'Entrega'} · ${p.name}\n${fmtDate(dia)} às ${planoHora(x.a)}\nAs tarefas acima dela na lista do projeto não podem passar desta linha. Arraste para mudar o dia ou a hora.`)}"><span>${esc(e.nome || 'Entrega')}</span></div>`; }
  if (x.k === 'prazo') { const t = x.t; const p = db.get('tempo_projects', t.project_id);
    return `<div class="pl-prazo" data-dg="prazo" data-dia="${dia}" data-id="${t.id}" data-ini="${x.a}" data-fim="${x.a}" style="top:${y}px" data-tip="${esc(`Entrega da tarefa: ${t.name}${p ? ' · ' + p.name : ''}\n${planoHora(x.a)}\nArraste para mudar a entrega (hora ou dia).`)}"><span>${esc(t.name)}</span></div>`; }
  if (x.k === 'fixo') { const { n, m } = x; const pinTip = m.pin ? 'Inegociável (fixado): o plano nunca passa por cima. Clique para deixar maleável' : 'Maleável: quando uma tarefa não cabe até a entrega, o plano automático pode passar por cima. Clique para fixar (inegociável)';
    return `<div class="pl-fixo${x._fundo ? ' fundo' : ''}${m.ajustado ? ' ajustado' : ''}${m.real ? ' real' : ''}${m.pin ? ' pin' : ' maleavel'}${x._porCima ? ' por-cima' : ''}" data-dg="fixo" data-dia="${dia}" data-g="${esc(m.grupo)}" data-ini="${x.a}" data-fim="${x.b}" style="${pos}" data-tip="${esc(`${n}\n${planoHora(x.a)}–${planoHora(x.b)}\n${m.pin ? 'Inegociável (fixado)' : 'Maleável'}${x._porCima ? '\nO plano passou por cima deste horário para a tarefa caber na entrega' : ''}${m.real ? '\nAjustado ao que aconteceu (bloco flexível)' : ''}${m.ajustado ? '\nMudado só neste dia' : ''}\nArraste ou puxe as bordas: muda só neste dia`)}"><span class="pl-tx"><b>${m.pin ? `<span class="pl-fx-pin" aria-hidden="true">${icon('pin')}</span>` : ''}${esc(n)}</b>${curto ? '' : `<em>${planoHora(x.a)}–${planoHora(x.b)}</em>`}</span><span class="pl-fx-bt"><button data-act="pl-rot-pin" data-rid="${esc(m.rid || '')}" data-g="${esc(m.grupo)}" title="${pinTip}" aria-label="${m.pin ? 'Deixar maleável' : 'Fixar (inegociável)'}" class="${m.pin ? 'on' : ''}">${icon('pin')}</button>${m.ajustado ? `<button data-act="pl-fixo-reset" data-dia="${dia}" data-g="${esc(m.grupo)}" title="Voltar ao horário da rotina" aria-label="Voltar ao padrão">↺</button>` : ''}<button data-act="pl-fixo-off" data-dia="${dia}" data-g="${esc(m.grupo)}" title="Tirar só deste dia" aria-label="Tirar deste dia">×</button></span>${PL_PUX}</div>`; }
  if (x.k === 'evento') { const e = x.e; const bloq = e.origem === 'bloqueio';
    return `<div class="pl-evento ${e.origem}"${bloq ? ` data-dg="bloq" data-dia="${dia}" data-id="${e.id}" data-ini="${x.a}" data-fim="${x.b}"` : ''} style="${pos}" data-tip="${esc(`${e.origem === 'google' ? 'Google Agenda' + (e.agenda ? ' · ' + e.agenda : '') : 'Bloqueio'}\n${e.titulo}\n${planoHora(e.ini)}–${planoHora(e.fim)}`)}">${icon(e.origem === 'google' ? 'calendar' : 'clock')}<span class="pl-tx"><b>${esc(e.titulo)}</b>${curto ? '' : `<em>${planoHora(e.ini)}–${planoHora(e.fim)}</em>`}</span>${bloq ? PL_PUX : ''}</div>`; }
  if (x.k === 'todo') { const e = x.e;
    const atras = !e.feito && new Date(new Date(dia + 'T00:00:00').getTime() + e.fim * 36e5) < new Date();
    return `<div class="pl-evento todo${e.feito ? ' feito' : ''}${atras ? ' atrasado' : ''}"${e.feito ? '' : ` data-dg="todo" data-dia="${dia}" data-id="${e.id}" data-ini="${x.a}" data-fim="${x.b}"`} style="${pos}" data-act="todo-modal" data-id="${e.id}" data-tip="${esc(`To-do: ${e.titulo}\n${planoHora(e.ini)}–${planoHora(e.fim)}${e.feito ? '\nFeito' : '\nArraste para mudar a hora ou o dia; puxe as bordas para mudar a duração'}${atras ? '\nPassou do horário e está em aberto' : ''}`)}"><button type="button" class="pl-todo-ck${e.feito ? ' on' : ''}" data-act="todo-toggle" data-id="${e.id}" aria-label="${e.feito ? 'Reabrir' : 'Concluir'}">${e.feito ? icon('check') : ''}</button><span class="pl-tx"><b>${esc(e.titulo)}</b></span>${e.feito ? '' : PL_PUX}</div>`; }
  if (x.k === 'fantasma') { const f = x.f; const p = db.get('tempo_projects', f.pid), tk = f.tid ? db.get('tempo_tasks', f.tid) : null;
    const por = /^antes:/.test(f.motivo || '') ? `espera “${String(f.motivo).slice(6)}” terminar` : ({ terceiro: 'é de outra pessoa', parada: 'está parada', fora: 'não está mais no plano' }[f.motivo] || 'o plano não usa');
    return `<div class="pl-fantasma" data-dg="plano" data-dia="${dia}" data-pid="${f.pid}" data-tid="${f.tid || ''}" data-pin="${f.pin}" data-ini="${f.ini}" data-fim="${f.fim}" style="${pos};--fc:${planoCor(f.pid)}" data-tip="${esc(`Não vale: ${tk ? tk.name + ' · ' : ''}${p?.name || ''}\nNão foi feito porque ${por}.\nO horário fica segurado, mas sem uso. Arraste para outro lugar ou solte no ×.`)}"><span class="pl-tx"><b>${esc(tk ? tk.name : p?.name || '')}</b>${curto ? '' : `<em>não vale: ${esc(por)}</em>`}</span><button class="pl-unpin" data-act="pl-unpin" data-id="${f.pin}" title="Soltar este bloco" aria-label="Soltar bloco">×</button></div>`; }
  if (x.k === 'naofeito') { const p = db.get('tempo_projects', x.bl.pid); const c = planoCor(x.bl.pid);
    return `<div class="pl-naofeito nr-${x.st || 'falhou'}" style="${pos};--fc:${c}" data-tip="${esc(`${({ ok: 'Rolou como planejado', ajustado: 'Não rolou como planejado, mas foi ajustado depois', falhou: 'Planejado e não aconteceu' })[x.st || 'falhou']}: ${p?.name || ''}\n${planoHora(x.a)}–${planoHora(x.b)} (plano da manhã)`)}"><span class="pl-tx"><b>${esc(p?.name || '')}</b>${curto ? '' : '<em>não aconteceu</em>'}</span></div>`; }
  if (x.k === 'todos') { const l = x.lista;
    return `<div class="pl-evento todo grupo" style="${pos}" data-tip="${esc(`${l.length} to-dos às ${planoHora(x.a)}\n` + l.map(e => (e.feito ? '✓ ' : '• ') + e.titulo).join('\n'))}">${icon('check')}<span class="pl-tx"><b>${l.length} to-dos</b>${curto ? '' : `<em>${l.filter(e => e.feito).length} feitos</em>`}</span></div>`; }
  if (x.k === 'feito') { const f = x.f; const pr = db.get('tempo_projects', f.pid); const tk = f.tid ? db.get('tempo_tasks', f.tid) : null; const cl = pr && clientOf(pr);
    // registrado no mesmo desenho do planejado (chip do cliente · tarefa / projeto · hora · duração), na cor do cliente
    const cc = cl ? hexOf(cl.color || 'gray') : planoCor(f.pid); const ct = typeof textOn === 'function' ? textOn(cc) : '#fff';
    const nome = tk ? tk.name : pr?.name || 'Sem projeto';
    return `<div class="pl-feito cli${x.agenda ? ' com-agenda' : ''}" data-pid="${esc(f.pid || '')}" data-tid="${esc(f.tid || '')}" style="${pos};--fc:${cc};--cc:${cc};--ct:${ct}" data-tip="${esc(`Registrado: ${tk ? tk.name + ' · ' : ''}${pr?.name || 'Sem projeto'}${cl ? '\n' + cl.name : ''}\n${planoHora(f.ini)}–${planoHora(f.fim)} · ${fmtH(f.ms)} trabalhado${x.agenda ? '\n' + x.agenda.map(e => `Agenda: ${e.titulo} (${planoHora(e.ini)}–${planoHora(e.fim)})`).join('\n') : ''}`)}"${f.pid ? ` data-act="proj-open" data-id="${f.pid}"${f.tid ? ` data-tab="tasks" data-tk="${f.tid}"` : ''}` : ''}>${h >= 12 ? `<span class="pl-tx"><b>${planoCliChip(pr)}${esc(nome)}</b>${!curto ? `<em>${tk && pr ? esc(pr.name) + ' · ' : ''}${planoHora(f.ini)} · ${fmtH(f.ms)}${unico && cl ? ' · ' + esc(cl.name) : ''}${x.agenda ? ' · ' + esc(x.agenda[0].titulo) : ''}</em>` : ''}</span>` : ''}${x.agenda ? `<span class="pl-feito-ag">${icon('calendar')}</span>` : ''}</div>`; }
  const b = x.bl; const p = db.get('tempo_projects', b.pid); const c = planoCor(b.pid);
  // "Cor do cliente": o texto segue a cor de texto definida no cliente (senão, preto ou branco pela leitura) e o chip fica invertido
  const cc = true;   // "Cor do cliente" fica sempre ligado (27/11): o botão saiu const cli = cc ? clientOf(p) : null; const hpx = (b.fim - b.ini) * alt;
  const ccCor = cc ? planoCorCli(b.pid) : null; const ccTxt = cc ? ((cli && partyFg('client', cli.id)) || (typeof textOn === 'function' ? textOn(ccCor) : '#fff')) : null;
  const hm = (h) => planoHora(h).replace(':', 'h'); const dur = (h) => `${String(Math.floor(h + 1e-9)).padStart(2, '0')}h${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
  const corpoCC = () => `<span class="pl-cc-top"><span class="pl-tx"><b>${cli ? `<span class="pl-cc-chip">${esc(cli.name)}</span>` : ''}${esc(b.tarefa || p?.name || '')}</b></span>${b.tarefa && p ? `<span class="pl-cc-proj" data-tip="Projeto">${esc(p.name)}</span>` : ''}${b.pin ? `<button class="pl-unpin pl-cc-x" data-act="pl-unpin" data-id="${b.pin}" title="Soltar: o app volta a encaixar este bloco sozinho" aria-label="Soltar bloco">×</button>` : ''}</span>`
    // regra do que cabe: só o título até ~40 px de altura; começo/duração a partir daí; "Depois de X" a partir de ~58 px
    + (hpx < 40 ? '' : `<span class="pl-cc-l2"><b>Começo Est.</b> ${hm(b.ini)} - <b>Duração Est.</b> ${dur(b.h)}</span>${b.espera && hpx >= 58 ? `<span class="pl-cc-l3">Depois de ${esc(b.espera)}</span>` : ''}`);
  return `<div class="pl-bloco${b.atrasado ? ' late' : ''}${b.pin ? ' pin' : ' auto'} cc" data-dg="plano" data-dia="${dia}" data-pid="${b.pid}" data-tid="${b.tid || ''}" data-pin="${(b.pins || (b.pin ? [b.pin] : [])).join(',')}" data-ini="${b.ini}" data-fim="${b.fim}" style="${pos};--fc:${c}${planoMostra('corcli') ? `;--cc:${ccCor};--ct:${ccTxt}` : ''}" data-act="proj-open" data-id="${b.pid}"${b.tid ? ` data-tab="tasks" data-tk="${b.tid}"` : ''} data-tip="${esc(`Planejado: ${b.tarefa ? b.tarefa + ' · ' : ''}${p?.name}\n${clientOf(p)?.name || ''}\n${planoHora(b.ini)}–${planoHora(b.fim)} · ${fmtH(b.h * 36e5)}${b.atrasado ? '\nDepois do prazo' : ''}${b.espera ? `\nComeça depois de “${b.espera}” (uma espera a outra, ou a fila)` : ''}${(() => { const l = []; if (b.porque) l.push('Por que aqui: ' + b.porque);
      const mal = planoFixosDoDia(dia).filter(f => f[3] && f[3].pin === false && f[0] < b.fim - 1e-6 && f[1] > b.ini + 1e-6).map(f => f[2]);
      if (mal.length) l.push(`Passou por cima de: ${mal.join(', ')} (maleável), para caber na entrega`);
      if (b.fim > planoCfg().fim + 1e-6 && b.ini < planoCfg().fim) l.push('Dia esticado: faltava até 1 h para terminar a tarefa');
      return l.length ? '\n' + l.join('\n') : ''; })()}${b.pin ? '\nFixado à mão · clique direito para mais opções' : '\nColocado pelo app · arraste para mudar o horário ou o dia · clique direito para mais opções'}`)}">${cc ? corpoCC() + PL_PUX + '</div>' : `<span class="pl-tx"><b>${planoCliChip(p)}${esc(b.tarefa || p?.name || '')}</b>${curto ? '' : `<em>${b.tarefa ? esc(p?.name || '') + ' · ' : ''}${planoHora(b.ini)} · ${fmtH(b.h * 36e5)}${unico && p ? ' · ' + esc(clientOf(p)?.name || '') : ''}${b.espera ? ' · depois de ' + esc(b.espera) : ''}</em>`}</span>${b.pin ? `<button class="pl-unpin" data-act="pl-unpin" data-id="${b.pin}" title="Soltar: o app volta a encaixar este bloco sozinho" aria-label="Soltar bloco">×</button>` : ''}${PL_PUX}</div>`}`;
}
/* Coluna de um dia: cabeçalho, linha "dia todo" (to-do só com data, evento de dia inteiro) e a grade de 24 h. */
/* Chips do dia (Alice e Rafa) e notas do dia, iguais no Mês, na Semana e no Dia; respeitam os filtros. */
const planoChipsHTML = (dia) => `<span class="pl-mc-chips">${planoMostra('alice') && typeof aliceChipsHTML === 'function' ? aliceChipsHTML(dia) : ''}${planoMostra('rafa') ? planoRafaLetraHTML(dia) : ''}</span>`;
function planoNotasHTML(dia) {
  if (!planoMostra('rafa') || typeof rafaNotas !== 'function') return '';
  const l = rafaNotas(dia); return l.length ? `<div class="pl-notas">${l.map(n => `<div class="pl-mc-tag obs nq-${n.q || 'N'}" title="${esc(n.t)}">${esc(n.t)}</div>`).join('')}</div>` : '';
}
/* Semana e Dia: o registrado vira blocos de 15 min — cada quarto de hora fica com o projeto que mais teve tempo nele
   (quarto com menos de 5 min de registro fica vazio), e quartos seguidos do mesmo projeto se juntam. */
function planoRegistro15(itens) {
  const feitos = itens.filter(x => x.k === 'feito'); if (!feitos.length) return itens;
  const Q = 0.25, slots = {};
  feitos.forEach(x => { for (let q = Math.floor(x.a / Q) * Q; q < x.b; q += Q) { const ov = Math.min(x.b, q + Q) - Math.max(x.a, q); if (ov <= 0) continue; const k = q.toFixed(2); const m = (slots[k] ||= {}); const pid = (x.f.pid || '_') + '|' + (x.f.tid || ''); m[pid] = (m[pid] || 0) + ov; } });
  const blocos = [];
  Object.keys(slots).map(Number).sort((a, b) => a - b).forEach(q => {
    const m = slots[q.toFixed(2)]; const [pid, h] = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    if (Object.values(m).reduce((t, v) => t + v, 0) < 5 / 60) return;
    const l = blocos[blocos.length - 1];
    if (l && l.pid === pid && Math.abs(l.b - q) < 1e-6) { l.b = q + Q; l.h += h; } else blocos.push({ pid, a: q, b: q + Q, h });
  });
  const novos = blocos.map(bl => { const [p0, t0] = bl.pid.split('|'); const pid = p0 === '_' ? null : p0; return { k: 'feito', a: bl.a, b: bl.b, f: { pid, tid: t0 || null, ini: bl.a, fim: bl.b, ms: bl.h * 36e5 } }; });
  return [...itens.filter(x => x.k !== 'feito'), ...novos];
}
/* Capacidade do dia: feito (registrado), planejado e livre (horas de trabalho que sobram). */
function planoCapacidade(dia, porDia) {
  if (!planoDiaUtil(dia)) return null;
  const hoje = ymd(new Date()); if (dia < hoje) return null;
  const jan = planoJanelas(dia).jan; const cap = jan.reduce((t, [a, b]) => t + (b - a), 0); if (!(cap > 0)) return null;
  const feito = dia === hoje ? planoFeitosDoDia(dia).reduce((t, f) => t + (f.fim - f.ini), 0) : 0;
  const plan = (porDia[dia]?.blocos || []).reduce((t, b) => t + (b.fim - b.ini), 0);
  const tot = Math.max(cap, feito + plan);
  return { feito, plan, cap, livre: Math.max(0, cap - feito - plan), tot };
}
function planoCapHTML(dia, porDia) {
  const c = planoCapacidade(dia, porDia); if (!c) return '';
  const pc = (x) => (x / c.tot * 100).toFixed(1);
  const pct = (c.feito + c.plan) / c.cap; const cls = pct > 1.0001 ? ' estouro' : pct >= 0.8 ? ' quase' : '';
  const tip = `Feito ${fmtH(c.feito * 36e5)} · planejado ${fmtH(c.plan * 36e5)} · livre ${fmtH(c.livre * 36e5)}${cls ? (pct > 1.0001 ? ' · passou do que cabe no dia' : ' · dia quase cheio') : ''}`;
  return `${cls ? `<em class="pl-cap-pct${cls}" data-tip="${esc(tip)}">${Math.round(pct * 100)}%</em>` : ''}<span class="pl-cap${cls}" data-tip="${esc(tip)}"><span class="pl-cap-f" style="width:${pc(c.feito)}%"></span><span class="pl-cap-p" style="width:${pc(c.plan)}%"></span></span>`;
}
/* Horas livres de 1 h ou mais dentro do horário de trabalho (de agora em diante): viram "livre 1h" na grade. */
function planoLivres(dia, porDia) {
  const hoje = ymd(new Date()); if (dia < hoje || !planoDiaUtil(dia)) return [];
  const agora = dia === hoje ? (() => { const n = new Date(); return Math.ceil((n.getHours() + n.getMinutes() / 60) * 4) / 4; })() : 0;
  const ocup = [...(porDia[dia]?.blocos || []).map(b => [b.ini, b.fim]), ...(dia === hoje ? planoFeitosDoDia(dia).map(f => [f.ini, f.fim]) : []),
    ...planoEventos(dia).filter(e => !e.diaTodo).map(e => [e.ini, e.fim])].sort((x, y) => x[0] - y[0]);
  const out = [];
  planoJanelas(dia).jan.forEach(([a0, b]) => { let a = Math.max(a0, agora);
    ocup.forEach(([p, q]) => { if (q <= a || p >= b) return; if (p - a >= 1) out.push([a, p]); a = Math.max(a, q); });
    if (b - a >= 1) out.push([a, b]); });
  return out;
}
function planoColHTML(dia, porDia, { alt = PL_ALT, unico = false, linhasTopo = 0, cabecalho = true, semana = '' } = {}) {
  const cfg = planoCfg(); const v = porDia[dia]; const util = planoDiaUtil(dia); const hoje = ymd(new Date());
  PL_ALT_AGORA = alt;
  // largura aproximada da coluna (px), para a regra do texto dos to-dos: Dia = 1/3 da área (3 faixas); Semana = 1/7
  try { const W = Math.max(600, (window.innerWidth || 1400) - 300); PL_COLW_AGORA = unico ? W / 3 : W / 7; } catch (e) { PL_COLW_AGORA = 160; }
  const itens = planoFaixas(planoJuntaAgenda(planoRegistro15(planoItensDoDia(dia, porDia))), unico, dia).map(x => {
    let h; try { h = planoItemHTML(x, dia, { alt, unico }); } catch (e) { console.error('Calendário: item com problema', x?.k, e); PLANO.itensRuins = (PLANO.itensRuins || 0) + 1; return ''; }
    if (x._choque) h = h.replace('class="', 'class="choque ').replace('data-tip="', 'data-tip="⚠ Bate no horário com outro item.&#10;');
    if (x._z) h = h.replace('style="', `style="z-index:${2 + x._z};`);
    if (x._sobre) h = h.replace('class="', 'class="pl-sobre ');
    const sk = x.k === 'plano' ? `p:${dia}:${x.bl.tid || x.bl.pid}:${x.bl.ini.toFixed(2)}` : x.k === 'todo' ? 't:' + x.e.id : '';
    if (sk && PLANO.sel.has(sk)) h = h.replace('class="', 'class="pl-sel ');
    return h.replace(/^<div /, `<div data-fk="${esc(x._fk || '')}" data-lane="${x._lane ?? ''}" data-sk="${esc(sk)}" `);
  }).join('');
  const agora = dia === hoje ? (() => { const n = new Date(); const h = n.getHours() + n.getMinutes() / 60; return `<div class="pl-agora" style="top:${h * alt}px"><span class="pl-agora-h">${planoHora(h).replace(':', 'h')}</span></div>`; })() : '';
  const livres = planoMostra('trabalho') ? planoLivres(dia, porDia).map(([a, b]) => `<button type="button" class="pl-livre" data-act="pl-livre" data-dia="${dia}" data-a="${a}" data-b="${b}" style="top:${a * alt + 2}px;height:${(b - a) * alt - 4}px" data-tip="Horário livre ${planoHora(a)}–${planoHora(b)}. Clique para encaixar um bloco de projeto, to-do ou bloqueio.">${icon('plus')} livre ${fmtH((b - a) * 36e5)}</button>`).join('') : '';
  const h = v?.horas || 0, est = planoEsticados()[dia], fer = planoFer(dia);
  const wd = new Date(dia + 'T12:00:00').getDay();
  const sexta = wd === 5 ? `<button class="btn sm ghost pl-rafa${planoSextaRafa(dia) ? ' on' : ''}" data-act="pl-sexta" data-dia="${dia}" title="Sexta com o Rafa (T) ou com a Amanda (A)? Clique para trocar só esta sexta (muda também no Dias de Rafa).">Rafa ${planoSextaRafa(dia) ? '✓' : '–'}</button>` : '';
  const cab = !cabecalho ? '' : `<div class="pl-cab">${semana ? `<span class="pl-sem-rot">${esc(semana)}</span>` : ''}<span class="pl-cab-l1"><button class="pl-cab-dia" data-act="pl-ir-dia" data-dia="${dia}" title="Ver o dia">${new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</button>${planoChipsHTML(dia)}</span>
      <span class="pl-cab-l2">${dia >= hoje && util ? (() => { const soltos = (porDia[dia]?.blocos || []).filter(b => !b.pin).length, fix = planoPins().filter(pn => pn.dia === dia).length; if (!soltos && !fix) return '';
        return soltos ? `<button class="pl-fixdia" data-act="pl-fixar-dia" data-dia="${dia}" data-modo="fixar" data-tip="Fixar o dia: os ${soltos} bloco${soltos > 1 ? 's' : ''} que o app colocou ficam fixados onde estão">${icon('pin')}</button>`
          : `<button class="pl-fixdia on" data-act="pl-fixar-dia" data-dia="${dia}" data-modo="soltar" data-tip="Dia fixado. Clique para soltar todos os ${fix} bloco${fix > 1 ? 's' : ''} e deixar o app encaixar de novo">${icon('pin')}</button>`; })() : ''}${dia >= hoje && planoPins().some(pn => pn.dia === dia) ? `<button class="pl-reorg" data-act="pl-reorg" data-dia="${dia}" data-tip="Reorganizar: solta os blocos que você fixou neste dia e o app encaixa tudo de novo, sem sobrepor">↺</button>` : ''}${(() => { const pr = dia <= hoje ? planoVsReal(dia) : null; return pr ? `<span class="pl-pvr ${pr.pct >= 80 ? 'ok' : pr.pct >= 50 ? 'meio' : 'baixo'}" data-tip="${esc(`Plano × real: ${fmtH(pr.reg * 36e5)} registrados das ${fmtH(pr.plan * 36e5)} planejadas de manhã (mesmo projeto)`)}">${pr.pct}%</span>` : ''; })()}<span class="small ${h > cfg.horasDia + 0.05 ? 'late' : 'muted'}">${util ? (h > 0.01 ? `${fmtH(h * 36e5)} plano${est ? ` de ${est} h` : ''}` : '') : (fer ? '[FERIADO] ' + esc(fer.nome) : '')}</span>${sexta}</span>${planoCapHTML(dia, porDia)}${planoNotasHTML(dia)}</div>`;
  const todoDia = planoEventos(dia).filter(e => e.diaTodo && (planoMostra('todos') || e.origem !== 'todo'));
  const topo = linhasTopo ? `<div class="pl-topo" style="height:${linhasTopo * 20}px">${todoDia.map(e => e.origem === 'todo'
    ? `<button class="pl-chip todo${e.feito ? ' feito' : ''}" data-act="todo-modal" data-id="${e.id}" title="To-do do dia (sem hora)">${icon('check')}${esc(e.titulo)}</button>`
    : `<span class="pl-chip ${e.origem}" title="Dia todo">${esc(e.titulo)}</span>`).join('')}</div>` : '';
  return `<div class="pl-dia${planoMostra('naofeito') ? ' nr-on' : ''}${dia === hoje ? ' hoje' : ''}${!util ? ' off' : ''}${(v?.cap || 0) > cfg.horasDia + 0.05 ? ' esticado' : ''}${wd === 1 ? ' pl-segunda' : ''}" data-pl-col="${dia}">${cab}${topo}<div class="pl-grade" style="height:${24 * alt}px">${livres}${itens}${agora}</div></div>`;
}
const planoRegua = (alt = PL_ALT) => `<div class="pl-horas" style="height:${24 * alt}px">${Array.from({ length: 24 }, (_, h) => `<div class="pl-h" style="top:${h * alt}px">${String(h).padStart(2, '0')}h</div>`).join('')}</div>`;

/* Semana: só os 7 dias da semana escolhida (segunda a domingo). Sem rolagem para os lados: as setas, "Hoje" e o
   arrastar para os lados no trackpad trocam a semana. Assim a tela não tem posição para perder ao redesenhar
   (antes eram 21 semanas lado a lado e a rolagem lateral pulava de semana em alguns redesenhos). */
const planoSegunda = (d) => { const x = new Date((typeof d === 'string' ? d : ymd(d)) + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
/* Semana: quanto já foi feito, quanto está planejado e quanto ainda cabe (dias úteis, de hoje em diante). */
function planoSemTotalHTML(dias, porDia) {
  const hoje = ymd(new Date()); let f = 0, p = 0, livre = 0, cap = 0;
  dias.forEach(d => { if (d <= hoje) f += planoFeitosDoDia(d).reduce((t, x) => t + (x.fim - x.ini), 0); const c = planoCapacidade(d, porDia); if (c) { p += c.plan; livre += c.livre; cap += c.cap; } });
  if (!(f + p + livre > 0)) return '';
  const cheia = cap > 0 && (p + (dias.includes(hoje) ? 0 : 0)) / cap >= 0.8 && livre < cap * 0.2;
  return `<div class="pl-sem-tot${cheia ? ' cheia' : ''}"><span>Semana</span><b>${fmtH(f * 36e5)}</b> feito <i>·</i> <b>${fmtH(p * 36e5)}</b> planejado <i>·</i> <b>${fmtH(livre * 36e5)}</b> livre${cheia ? ' <span class="pl-sem-av">semana quase cheia</span>' : ''}</div>`;
}
function planoSemanaHTML(porDia) {
  const seg = PLANO.semIni || planoSegunda(new Date());
  const dias = Array.from({ length: 7 }, (_, i) => planoDiaMais(seg, i));
  const lt = Math.max(0, ...dias.map(d => planoEventos(d).filter(e => e.diaTodo).length));
  const cols = dias.map(d => planoColHTML(d, porDia, { linhasTopo: lt })).join('');
  return `${planoSemTotalHTML(dias, porDia)}<div class="pl-scroll pl-semscroll" data-pl-scroll data-pl-sem="${seg}"><div class="pl-semana pl-semana-h" style="--lt:${lt * 20}px">
    <div class="pl-regua-col"><div class="pl-cab pl-cab-vazio"></div>${lt ? `<div style="height:${lt * 20}px"></div>` : ''}${planoRegua()}</div>${cols}</div></div>`;
}

/* Filtros do calendário (Mês): esconder Alice, Rafa, trabalho, to-dos ou rotina. Guardado em planoMesFiltro { k: false }. */
const PL_FILTROS = [['alice', 'Alice'], ['rafa', 'Rafa'], ['trabalho', 'Trabalho'], ['todos', 'To-dos'], ['rotina', 'Rotina']];
// 'Não rolou' (planejado que não aconteceu) começa desligado; os outros começam ligados
const PL_FILTRO_PADRAO = { naofeito: false, corcli: false };
const planoMostra = (k) => { const v = (db.setting('planoMesFiltro', {}) || {})[k]; return v === undefined ? PL_FILTRO_PADRAO[k] !== false : v !== false; };
/* Filtros sempre à vista: um botão por tipo (ligado = aparece), no padrão dos seletores do app. */
function planoFiltroHTML() {
  return `<div class="seg pl-filtros" role="group" aria-label="Mostrar no calendário"><span class="pl-filtros-l">Mostrar</span>${PL_FILTROS.map(([k, l]) => `<button type="button" class="${planoMostra(k) ? 'on' : ''}" data-act="pl-filtro" data-k="${k}" aria-pressed="${planoMostra(k)}">${l}</button>`).join('')}<button type="button" class="pl-nr-btn${planoMostra('naofeito') ? ' on' : ''}" data-act="pl-filtro" data-k="naofeito" aria-pressed="${planoMostra('naofeito')}" data-tip="Não rolou: esmaece o calendário e mostra o plano da manhã por cima. Verde = rolou, amarelo = não rolou mas foi ajustado, vermelho = não rolou e não foi feito.">Não rolou</button>${(() => { const cs = agendaContas(); const vis = cs.filter(c => !agendaContasOff()[c]).length; const erro = typeof AGG !== 'undefined' && (AGG.erro || (AGG.errosContas || []).length);
    return `<button type="button" class="${vis ? 'on' : ''}${erro ? ' erro' : ''}" data-act="pl-agendas" data-tip="${esc(erro ? 'Google Agenda com erro. Clique para ver.' : 'Escolher quais agendas aparecem; Google: sincronizar e contas')}">${icon('calendar')} Agendas${cs.length ? ` ${vis}/${cs.length}` : ''}${erro ? ' ⚠' : ''}</button>`; })()}${typeof alMarcar === 'function' ? `<button type="button" data-act="alice-painel" data-tip="Ciclo da Alice: procurar agora no WhatsApp (cistite e menstruação), horário da busca diária e previsão do próximo ciclo">${icon('search')} Ciclo Alice</button>` : ''}</div>`;
}
ACTIONS['pl-filtro'] = (el) => { const f = { ...(db.setting('planoMesFiltro', {}) || {}) }; f[el.dataset.k] = !planoMostra(el.dataset.k); db.setSetting('planoMesFiltro', f); db.emit(); };
/* Um botão só para as agendas: caixinha para mostrar/esconder cada uma e, embaixo, o Google (sincronizar, contas). */
ACTIONS['pl-agendas'] = () => {
  const nomeLongo = (c) => { const n = agendaContaNome(c); return n === c ? c : `${n} · ${c}`; };
  const html = () => { const off = agendaContasOff(); const cs = agendaContas();
    const g = typeof AGG === 'undefined' ? '' : AGG.status === false
      ? `<button class="btn sm" data-x="g-con">${icon('plus')} Conectar Google Agenda</button>`
      : `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="small muted grow">${AGG.erro ? `<span style="color:var(--danger)">Erro: ${esc(AGG.erro)}</span>` : AGG.ultimo ? 'Google sincronizado às ' + AGG.ultimo.toTimeString().slice(0, 5) : 'Google'}</span><button class="btn sm" data-x="g-sync">Sincronizar agora</button><button class="btn sm" data-x="g-contas">Contas Google</button></div>`;
    return `<div class="dh">${icon('calendar')}<h2>Agendas</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:6px">${cs.length ? cs.map(c => `<label class="check"><input type="checkbox" data-c="${esc(c)}" ${off[c] ? '' : 'checked'}> ${esc(nomeLongo(c))}</label>`).join('') : '<div class="small muted">Nenhuma agenda com eventos ainda.</div>'}
    <div class="small muted" style="margin-top:4px">Desmarcada, a agenda some da tela mas continua ocupando o horário no planejamento. As do Google chegam pela conexão do Google; iCloud e as outras do Calendário da Apple, pelo app do Mac.</div>
    <hr style="border:0;border-top:1px solid var(--line);margin:8px 0">${g}</div>`; };
  const l = openLayer({ html: html() });
  l.box.addEventListener('change', (e) => { const c = e.target.dataset.c; if (c === undefined) return; const f = { ...agendaContasOff() }; if (e.target.checked) delete f[c]; else f[c] = true; db.setSetting('agendaContasOff', f); db.emit(); });
  l.box.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'g-sync') { l.close(); aggSync(true); }
    if (b.dataset.x === 'g-contas') { l.close(); ACTIONS['agg-contas'](); }
    if (b.dataset.x === 'g-con') { l.close(); ACTIONS['agg-conectar'](); } });
};
ACTIONS['pl-conta'] = (el) => { const f = { ...agendaContasOff() }; const c = el.dataset.c; if (f[c]) delete f[c]; else f[c] = true; db.setSetting('agendaContasOff', f); db.emit(); };
ACTIONS['pl-filtro-toggle'] = () => { PLANO.filtroOpen = !PLANO.filtroOpen; render(); };
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
    ...(verRot && semanaAtual ? planoFixosDoDia(dia).filter(f => planoRotina().find(r => r.id === f[3]?.rid)?.mes).map(f => ({ ini: f[0], titulo: f[2], cls: 'fixo' })) : []),
    ...ev.filter(e => !e.diaTodo && (verTodo || e.origem !== 'todo')).map(e => ({ ini: e.ini, titulo: e.titulo, cls: e.origem + (e.feito ? ' feito' : '') }))
  ].sort((x, y) => x.ini - y.ini);
  const proj = pids.map(pid => { const p = db.get('tempo_projects', pid);
    return `<div class="pl-mc-p" style="--fc:${planoCorCli(pid === '_' ? null : pid)}"><i></i><span>${esc(p?.name || 'Sem projeto')}</span><em>${fmtH(base[pid] * 36e5)}</em></div>`; }).join('');
  return `<div class="pl-mc${dt.getMonth() % 2 === 0 ? ' par' : ''}${dia === hoje ? ' hoje' : ''}${!util ? ' off' : ''}${dia < hoje ? ' passado' : ''}" data-act="pl-ir-dia" data-dia="${dia}" data-pl-pop="${dia}"${dia === hoje ? ' data-hoje="1"' : ''}>
    <div class="pl-mc-in">
      <div class="pl-mc-esq">
        <div class="pl-mc-n"><b>${n === 1 ? dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '') : n}</b><span class="pl-mc-chips"><button class="pl-mc-nota" data-act="rafa-open" data-day="${dia}" title="Adicionar nota (as mesmas de Dias de Rafa)" aria-label="Adicionar nota">${icon('plus')}</button>${al}${verRafa ? planoRafaLetraHTML(dia) : ''}</span></div>
        ${topo}
      </div>
      ${horarios.length || previstos.length ? `<div class="pl-mc-dir" data-pl-noclick>${previstos.map(pid => { const p = db.get('tempo_projects', pid); const cl = p ? clientOf(p)?.name : ''; const nm = `${cl ? '[' + cl + '] ' : ''}${p?.name || 'Sem projeto'}`;
        return `<div class="pl-mc-prev${plan[pid] && dia === hoje ? ' hoje' : ''}" style="--fc:${planoCorCli(pid === '_' ? null : pid)}" title="${esc(`Previsto: ${nm} · ${fmtH(plan[pid] * 36e5)}`)}"><span>${esc(nm)}</span><em>${fmtH(plan[pid] * 36e5)}</em></div>`; }).join('')}${horarios.map(h => `<div class="pl-mc-hr ${h.cls}" title="${esc(planoHora(h.ini) + ' ' + h.titulo)}"><b>${planoHora(h.ini)}</b> ${esc(h.titulo)}</div>`).join('')}</div>` : ''}
      ${pids.length && verTrab ? `<div class="pl-mc-reg"><div class="pl-mc-tt${!topo.trim() && !(horarios.length || previstos.length) ? ' sem-linha' : ''}"><span>Tempo trabalhado</span><em>${fmtH(tot * 36e5)}</em></div>${proj}</div>` : ''}
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
  return `<div class="pl-pop-t">${esc(t.replace(/^./, c => c.toUpperCase()))} ${planoChipsHTML(dia)}</div>${planoNotasHTML(dia)}
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
    <div class="row between" style="align-items:center"><span class="lbl" style="margin:0">Dia</span><span class="row" style="gap:6px;align-items:center">${planoChipsHTML(dia)}<button class="btn sm ghost" data-act="rafa-open" data-day="${dia}">${icon('plus')} Nota / Alice</button></span></div>
    ${fer ? `<div class="pl-mc-tag fer">[FERIADO] ${esc(fer.nome)}</div>` : ''}
    ${planoNotasHTML(dia)}
    ${(() => { const r = typeof rafaDiaDe === 'function' ? rafaDiaDe(dia) : null; return r?.who ? `<div class="small">Rafa: ${planoRafaLetraHTML(dia)} ${esc(RF_NOME?.[r.who] || '')}${r.auto ? ' <span class="faint">(marcado pelo app)</span>' : ''}${r.horario ? ' · ' + esc(r.horario) : ''}</div>` : ''; })()}
    ${(() => { const c = planoCapacidade(dia, porDia); return c ? `<div class="pl-pvr-box"><div class="row between small"><b>${c.livre > 0.01 ? `Cabe mais ${fmtH(c.livre * 36e5)}` : 'Dia cheio'}</b><span class="muted">${fmtH((c.feito + c.plan + c.livre) * 36e5)} de trabalho</span></div><span class="pl-cap grande">${planoCapHTML(dia, porDia).replace(/^<span class="pl-cap"[^>]*>|<\/span>$/g, '')}</span><div class="row small" style="gap:12px"><span><i class="pl-cap-dot f"></i>feito ${fmtH(c.feito * 36e5)}</span><span><i class="pl-cap-dot p"></i>planejado ${fmtH(c.plan * 36e5)}</span><span><i class="pl-cap-dot l"></i>livre ${fmtH(c.livre * 36e5)}</span></div></div>` : ''; })()}
    ${(() => { const pr = planoVsReal(dia); return pr ? `<div class="pl-pvr-box"><b>${fmtH(pr.reg * 36e5)} de ${fmtH(pr.plan * 36e5)} planejadas</b> <span class="pl-pvr ${pr.pct >= 80 ? 'ok' : pr.pct >= 50 ? 'meio' : 'baixo'}">${pr.pct}%</span><div class="small muted">Comparado com o plano do começo do dia; o que não aconteceu aparece tracejado.</div>${dia === ymd(new Date()) ? `<button class="btn sm" style="margin-top:6px" data-act="pl-empurrar" data-dia="${dia}" data-tip="Leva para o próximo dia útil os blocos que você fixou daqui para a frente e os to-dos abertos de hoje com hora">Empurrar para amanhã</button>` : ''}</div>` : ''; })()}
    ${planoDiaUtil(dia) ? (() => { const cfg = planoCfg(); const est = planoEsticados()[dia]; const hd = est ?? cfg.horasDia; return `<div class="row between small"><span>Horas de trabalho neste dia <span class="faint" data-tip="Quanto o app pode planejar de trabalho neste dia. O padrão é ${cfg.horasDia} h; estique quando precisar virar a noite, ou encurte num dia mais leve.">(padrão ${cfg.horasDia} h)</span></span><span class="row" style="gap:4px"><button class="btn sm" data-act="pl-dia" data-dia="${dia}" data-d="-1" aria-label="Menos 1 hora">−</button><b class="mono">${hd} h</b><button class="btn sm" data-act="pl-dia" data-dia="${dia}" data-d="1" aria-label="Mais 1 hora">+</button></span></div>`; })() : ''}
    <div><div class="lbl">Projetos do dia</div>${linhas ? `<div class="bars">${linhas}</div>` : '<div class="small muted">Nada registrado nem planejado.</div>'}</div>
    ${prz.length ? `<div><div class="lbl">Prazos</div>${prz.map(p => `<div class="small">${icon('flag')} ${esc(p.name)}</div>`).join('')}</div>` : ''}
    <div><div class="lbl">Compromissos</div>${ev.length ? ev.map(e => `<div class="small row between"><span>${e.diaTodo ? 'Dia todo' : planoHora(e.ini) + '–' + planoHora(e.fim)} · ${esc(e.titulo)} <span class="faint">${e.origem === 'google' ? 'Google' : e.origem === 'todo' ? 'to-do' : 'bloqueio'}</span></span>${e.origem === 'bloqueio' ? `<button class="btn sm ghost" data-act="pl-bloq-del" data-id="${e.id}" aria-label="Remover bloqueio">${icon('x')}</button>` : ''}</div>`).join('') : '<div class="small muted">Nenhum.</div>'}
      <button class="btn sm" style="margin-top:6px" data-act="pl-bloq" data-dia="${dia}">${icon('plus')} Bloqueio</button></div>
    ${sd.length ? `<div><div class="lbl">To-do sem data <span class="faint">(${sd.length})</span></div>${sd.slice(0, 12).map(n => `<div class="small row between pl-sd"><span data-act="todo-modal" data-id="${n.id}" style="cursor:pointer">${esc(n.title)}</span><button class="btn sm ghost" data-act="pl-encaixar" data-id="${n.id}" data-dia="${dia}" title="Põe no primeiro horário livre deste dia (30 min, ou a estimativa)">Encaixar</button></div>`).join('')}${sd.length > 12 ? `<div class="small muted">+${sd.length - 12}</div>` : ''}</div>` : ''}
  </div>`;
  const lt = planoEventos(dia).filter(e => e.diaTodo).length;
  return `<div class="pl-diaview"><div><div class="pl-colrot"><span></span><span>Registrado</span><span>Agenda · planejado, rotina, to-dos e compromissos</span></div><div class="pl-scroll" data-pl-scroll><div class="pl-semana pl-um"><div class="pl-regua-col">${lt ? `<div style="height:${lt * 20}px"></div>` : ''}${planoRegua()}</div>${planoColHTML(dia, porDia, { unico: true, linhasTopo: lt, cabecalho: false })}</div></div></div>${lado}</div>`;
}

/* ---------- Tarefas (Gantt): projetos ativos nas linhas, dias nas colunas ----------
   Barra = do começo ao fim da tarefa pelo planejamento (cor do cliente; verde se concluída). Deadline (entrega) = linha
   roxa no dia e hora; prazo da tarefa = bandeirinha. Dependências = setas. Arrastar a barra para os lados muda o prazo
   da tarefa em dias (o planejamento se reorganiza). */
let PLG_W = 76; const PLG_ROW = 30; const PLG_MAX = 720;   // zoom máximo: ~60 px por hora, dá para ler tarefa de 30 min
const PLG_DIAS = 240, PLG_ATRAS = 60;   // o Gantt é uma faixa de 60 dias para trás e 180 para a frente; quem anda nela é a rolagem de verdade (trackpad, barra, espaço + arrastar)
const planoGanttIni = () => planoDiaMais(ymd(new Date()), -PLG_ATRAS);
const planoGanttX0 = () => (PLG_W >= 300 ? PLG_ATRAS - 1 : daysBetween(planoGanttIni(), planoSegunda(new Date()))) * PLG_W;   // onde abre: hoje (zoom grande) ou a segunda desta semana
function planoGanttX(t, ini) {   // Date|ms → px (horas de trabalho 8h–20h ocupam a largura do dia)
  const d = new Date(t); const di = daysBetween(ini, ymd(d)); const h = d.getHours() + d.getMinutes() / 60;
  return (di + Math.max(0, Math.min(1, (h - 8) / 12))) * PLG_W;
}
function planoGanttHTML() {
  if (!window.__plgZoomT) PLG_W = Math.max(28, Math.min(PLG_MAX, Number(db.setting('planoGanttZoom', 76)) || 76));
  const ini = planoGanttIni(); const fim = planoDiaMais(ini, PLG_DIAS); const hoje = ymd(new Date());
  let itens = {}; try { itens = (typeof tkMotor === 'function' ? tkMotor(new Date(), 120).itens : {}) || {}; } catch (e) {}
  const projs = db.all('tempo_projects').filter(p => !p.archived && ['todo', 'active'].includes(statusCat(p.status_id)) && tasksOf(p.id).length);
  const proxData = (p) => { const ds = [p.deadline, ...projEntregas(p.id).map(e => e.dia), ...tasksOf(p.id).filter(t => statusCat(t.status_id) !== 'done').map(t => t.deadline)].filter(Boolean).sort(); return ds.find(d => d >= hoje) || ds[0] || '9999'; };
  projs.sort((a, b) => proxData(a).localeCompare(proxData(b)));
  const fech = PLANO.ganttFech || (PLANO.ganttFech = new Set());
  const dias = Array.from({ length: PLG_DIAS }, (_, i) => planoDiaMais(ini, i));
  const W = PLG_DIAS * PLG_W; let y = 0; const linhas = [], barras = [], marcas = [], pos = {};
  projs.forEach(p => {
    const c = clientOf(p); const cc = c ? hexOf(c.color || 'gray') : planoCor(p.id); const fechado = fech.has(p.id);
    const tks = tasksOf(p.id).filter(t => statusCat(t.status_id) !== 'cancelled'); const feitas = tks.filter(t => statusCat(t.status_id) === 'done').length;
    linhas.push(`<div class="plg-nome proj" style="top:${y}px"><button class="plg-tg" data-act="plg-tg" data-id="${p.id}" aria-label="${fechado ? 'Abrir' : 'Recolher'}">${icon(fechado ? 'chevR' : 'chevD')}</button><button class="plg-pn" data-act="proj-open" data-id="${p.id}" data-tab="tasks">${planoCliChip(p)}<b>${esc(p.name)}</b></button><span class="faint small">${feitas}/${tks.length}</span></div>`);
    const y0 = y; y += PLG_ROW;
    // resumo do projeto: barra fina do primeiro começo ao último fim
    const xs = tks.map(t => itens[t.id]).filter(x => x && x.ini && x.fim);
    if (xs.length) { const a = Math.min(...xs.map(x => +x.ini)), b = Math.max(...xs.map(x => +x.fim)); const xa = planoGanttX(a, ini), xb = planoGanttX(b, ini);
      if (xb > 0 && xa < W) barras.push(`<div class="plg-resumo" style="top:${y0 + 12}px;left:${Math.max(0, xa)}px;width:${Math.max(4, Math.min(W, xb) - Math.max(0, xa))}px;--cc:${cc}"></div>`); }
    if (!fechado) tks.forEach(t => {
      const x = itens[t.id]; const ok = statusCat(t.status_id) === 'done'; const parado = typeof statusParado === 'function' && statusParado(t.status_id);
      linhas.push(`<div class="plg-nome${ok ? ' ok' : ''}" style="top:${y}px"><button class="plg-tn" data-act="proj-open" data-id="${p.id}" data-tab="tasks" data-tk="${t.id}">${ok ? icon('check') : ''}${esc(t.name)}</button></div>`);
      let a = null, b = null;
      if (x && x.ini && x.fim && !ok) { a = planoGanttX(x.ini, ini); b = planoGanttX(x.fim, ini); }
      else if (t.deadline) { const d = new Date(`${t.deadline}T${t.deadline_time || '19:00'}:00`); b = planoGanttX(d, ini); a = b - PLG_W * 0.35; }
      if (a != null && b > 0 && a < W) {
        const l = Math.max(0, a), w = Math.max(10, Math.min(W, b) - l); const late = !!x?.aviso;
        pos[t.id] = { a: l, b: l + w, y: y + PLG_ROW / 2 };
        const rotulo = `${late ? '⚠ ' : ''}${t.name}`; const cabe = w >= rotulo.length * 6.2 + 14;   // o nome só fica dentro se couber; senão vai ao lado, legível
        const hh = (d) => planoHora(d.getHours() + d.getMinutes() / 60).replace(':', 'h').replace(/h00$/, 'h');
        if (!cabe) marcas.push(`<span class="plg-bl${late ? ' late' : ''}" style="top:${y + 6}px;left:${l + w + 6}px">${esc(rotulo)}${PLG_W >= 300 && x?.ini && !ok ? `<i>${hh(x.ini)}–${hh(x.fim)}</i>` : ''}</span>`);
        barras.push(`<div class="plg-bar${ok ? ' ok' : ''}${late ? ' late' : ''}${parado ? ' parado' : ''}${cabe ? '' : ' sem-texto'}" data-plg="${t.id}" style="top:${y + 6}px;left:${l}px;width:${w}px;--cc:${cc};--ct:${typeof textOn === 'function' ? textOn(cc) : '#fff'}" data-tip="${esc(`${t.name} · ${p.name}${x?.ini && !ok ? `\nDo planejamento: ${fmtDate(ymd(x.ini))} ${planoHora(x.ini.getHours() + x.ini.getMinutes() / 60)} → ${fmtDate(ymd(x.fim))} ${planoHora(x.fim.getHours() + x.fim.getMinutes() / 60)}` : ''}${t.deadline ? `\nPrazo: ${fmtDate(t.deadline)}${t.deadline_time ? ' ' + t.deadline_time : ''}` : ''}${late ? '\n⚠ passa do prazo' : ''}${ok ? '\nConcluída' : '\nArraste para os lados para mudar o prazo (dias)'}`)}">${cabe ? esc(rotulo) : ''}</div>`);
      }
      if (t.deadline && !ok) { const xd = planoGanttX(new Date(`${t.deadline}T${t.deadline_time || '19:00'}:00`), ini); if (xd >= 0 && xd <= W) marcas.push(`<span class="plg-flag" style="top:${y + 4}px;left:${xd - 5}px" title="Prazo da tarefa">${icon('flag')}</span>`); }
      y += PLG_ROW;
    });
    // entregas (deadlines): linha roxa vertical no bloco do projeto
    projEntregas(p.id).forEach(e => { if (!e.dia) return; const xd = planoGanttX(new Date(`${e.dia}T${e.hora || '19:00'}:00`), ini); if (xd < 0 || xd > W) return;
      marcas.push(`<div class="plg-ent" style="top:${y0}px;height:${y - y0}px;left:${xd}px" data-tip="${esc(`Deadline: ${e.nome || 'Entrega'} · ${p.name}\n${fmtDate(e.dia)} ${e.hora || '19:00'}`)}"><span>${esc(e.nome || 'Entrega')}</span></div>`); });
  });
  // dependências: seta do fim da tarefa anterior ao começo da seguinte
  const setas = []; projs.forEach(p => tasksOf(p.id).forEach(t => (Array.isArray(t.depends_on) ? t.depends_on : []).forEach(d => { const A = pos[d], B = pos[t.id]; if (!A || !B) return;
    const mx = Math.max(A.b + 6, B.a - 8); setas.push(`<path d="M${A.b} ${A.y} H${mx} V${B.y} H${B.a - 2}" />`); })));
  const H = Math.max(y, PLG_ROW * 3);
  const horas = PLG_W >= 300 ? [10, 12, 14, 16, 18].map(h => `<i class="plg-hh" style="left:${(h - 8) / 12 * 100}%">${h}h</i>`).join('') : '';
  const cab = dias.map((d, i) => { const dd = new Date(d + 'T12:00:00'); const off = !planoDiaUtil(d); return `<div class="plg-dia${d === hoje ? ' hoje' : ''}${off ? ' off' : ''}${horas ? ' com-horas' : ''}" style="left:${i * PLG_W}px;width:${PLG_W}px"><span>${dd.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span><b>${dd.getDate()}</b>${horas}</div>`; }).join('');
  const fundo = dias.map((d, i) => `<div class="plg-col${d === hoje ? ' hoje' : ''}${!planoDiaUtil(d) ? ' off' : ''}${PLG_W >= 200 ? ' hrs' : ''}" style="left:${i * PLG_W}px;width:${PLG_W}px;--hw:${(PLG_W / 12).toFixed(2)}px"></div>`).join('');
  const agora = (() => { const x = planoGanttX(Date.now(), ini); return x >= 0 && x <= W ? `<div class="plg-agora" style="left:${x}px"></div>` : ''; })();
  if (!projs.length) return '<div class="empty small">Nenhum projeto ativo com tarefas.</div>';
  return `<div class="plg"><div class="plg-esq"><div class="plg-cab-esq">Projeto · tarefa</div><div class="plg-nomes" style="height:${H}px">${linhas.join('')}</div></div>
    <div class="plg-dir" data-plg-scroll><div style="width:${W}px"><div class="plg-cab">${cab}</div><div class="plg-area" style="height:${H}px">${fundo}<svg class="plg-setas" width="${W}" height="${H}">${setas.join('')}</svg>${barras.join('')}${marcas.join('')}${agora}</div></div></div></div>`;
}
function planoGanttRolar() { const sc = document.querySelector('.plg-dir'); if (sc) sc.scrollLeft = PLANO.ganttX ?? (PLANO.ganttX = planoGanttX0()); }
ACTIONS['plg-tg'] = (el) => { const f = PLANO.ganttFech || (PLANO.ganttFech = new Set()); f.has(el.dataset.id) ? f.delete(el.dataset.id) : f.add(el.dataset.id); render(); };
ACTIONS['plg-nav'] = (el) => { const d = Number(el.dataset.d); const sc = document.querySelector('.plg-dir'); if (!sc) return;
  if (d) sc.scrollBy({ left: d * 7 * PLG_W, behavior: 'smooth' }); else sc.scrollTo({ left: Math.max(0, (PLG_ATRAS - 1) * PLG_W), behavior: 'smooth' }); };
const planoGanttTitulo = (x) => { const d = planoDiaMais(planoGanttIni(), Math.max(0, Math.floor((x ?? PLANO.ganttX ?? planoGanttX0()) / PLG_W))); return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase()); };
/* Arrastar barra do Gantt: muda o prazo da tarefa em dias inteiros. */
(function () {
  let drag = null;
  document.addEventListener('pointerdown', (e) => { const b = e.target.closest?.('.plg-bar:not(.ok)'); if (!b || e.button !== 0) return; drag = { el: b, x0: e.clientX, l0: parseFloat(b.style.left), moved: false }; b.setPointerCapture?.(e.pointerId); });
  document.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x0; if (Math.abs(dx) > 4) drag.moved = true; drag.el.style.left = (drag.l0 + Math.round(dx / PLG_W) * PLG_W) + 'px'; });
  document.addEventListener('pointerup', (e) => { if (!drag) return; const d = drag; drag = null; window.__plgMoved = d.moved; setTimeout(() => { window.__plgMoved = false; }, 150); const n = Math.round((e.clientX - d.x0) / PLG_W); if (!d.moved || !n) { d.el.style.left = d.l0 + 'px'; return; }
    const t = db.get('tempo_tasks', d.el.dataset.plg); if (!t) return; const base = t.deadline || ymd(new Date());
    const novo = planoDiaMais(base, n); planoMudar('Prazo movido', () => changeTaskDeadline(t, novo, 'Movido no Gantt'), `Prazo de “${esc(t.name)}”: ${fmtDate(novo)}`); });
})();
VIEWS.plano = () => {
  PLANO.itensRuins = 0; PLANO.desenhando = Date.now();   // a rolagem que o redesenho provocar não é guardada
  if (!window.__plZoomT || !PL_ALT) PL_ALT = Math.max(16, Math.min(160, Number(db.setting('planoZoom', 44)) || 44));
  if (typeof rafaAutoPreencher === 'function') rafaAutoPreencher();
  const lista = planoProjetos(); const cfg = planoCfg(); const modo = planoModo();
  const { porDia, estouro } = planejar(lista, new Date(), modo === 'mes' ? 220 : 100);
  PLANO.porDia = porDia;
  planoFotoDoDia(porDia);
  const hoje = ymd(new Date()); const dia = PLANO.dia || hoje;
  const semEst = projects().filter(p => ['todo', 'active'].includes(statusCat(p.status_id)) && !(Number(p.estimated_hours) > 0));
  const seg = `<div class="seg">${[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['tarefas', 'Tarefas']].map(([k, l]) => `<button class="${modo === k ? 'on' : ''}" data-act="pl-modo" data-m="${k}">${l}</button>`).join('')}</div>`;
  let titulo, nav, corpo;
  if (modo === 'dia') {
    titulo = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
    nav = `<button class="btn sm" data-act="pl-nav" data-d="-1" aria-label="Dia anterior">${icon('chevL')}</button><button class="btn sm" data-act="pl-nav" data-d="1" aria-label="Próximo dia">${icon('chevR')}</button>${dia !== hoje ? '<button class="btn sm ghost" data-act="pl-nav" data-d="0">Hoje</button>' : ''}`;
    corpo = planoDiaHTML(dia, porDia);
  } else if (modo === 'tarefas') {
    corpo = planoGanttHTML(); titulo = planoGanttTitulo();
    nav = `<button class="btn sm" data-act="plg-nav" data-d="-1" aria-label="Semana anterior">${icon('chevL')}</button><button class="btn sm" data-act="plg-nav" data-d="1" aria-label="Próxima semana">${icon('chevR')}</button><button class="btn sm ghost" data-act="plg-nav" data-d="0">Hoje</button>`;
  } else if (modo === 'mes') {
    titulo = ''; nav = `<button class="btn sm ghost" data-act="pl-mes-hoje">Hoje</button>`;
    corpo = planoMesHTML(porDia);
  } else {
    titulo = (() => { const seg = PLANO.semIni || planoSegunda(new Date()); const dom = planoDiaMais(seg, 6); return `${fmtDate(seg).slice(0, 5)} – ${fmtDate(dom)}`; })(); nav = `<button class="btn sm" data-act="pl-sem" data-d="-1" aria-label="Semana anterior">${icon('chevL')}</button><button class="btn sm" data-act="pl-sem" data-d="1" aria-label="Próxima semana">${icon('chevR')}</button><button class="btn sm ghost" data-act="pl-sem" data-d="0">Hoje</button>`;
    corpo = planoSemanaHTML(porDia);
  }
  const nota = `Planejado = suas tarefas abertas de todos os projetos, uma por vez, pela entrega mais perto e pelas dependências, com o tempo previsto de cada uma (até ${cfg.horasDia} h por dia útil). Cheio = planejado (mais claro = colocado pelo app; fixado à mão fica forte) · chip com bolinha = registrado · cinza = rotina · tracejado = compromisso (bloqueio ou Google Agenda). Arraste ou puxe as bordas do que não é registro; a janelinha mostra o horário novo.${semEst.length ? ` ${semEst.length} projeto(s) ativo(s) sem horas estimadas não entram.` : ''}`;
  const html = `${PLANO.erroMotor ? `<div class="banner danger small row" style="margin:0 0 8px">${icon('alert')} Não consegui recalcular o plano agora; estou mostrando o último que funcionou. <span class="grow"></span><button class="btn sm" data-act="pl-saude">Ver</button></div>` : ''}${estouro.length ? `<div class="panel" style="border-color:var(--warn)"><div class="panel-b small"><b>Não cabe no prazo:</b> ${estouro.map(x => `${esc(x.p.name)} (faltam ${fmtH(x.horas * 36e5)} até ${fmtDate(x.p.deadline)})`).join(' · ')}. Estique algum dia (+) ou mude o prazo.</div></div>` : ''}
    <div class="panel"><div class="panel-h">${seg}${nav}${titulo ? `<h3${modo === 'tarefas' ? ' data-plg-titulo' : ''}>${esc(titulo)}</h3>` : ''}<span class="grow"></span>${planoBandejaBtn(modo)}${planoSaudeHTML()}${planoDesfazerHTML()}${planoFiltroHTML()}<button class="btn sm" data-act="pl-bloq">${icon('plus')} Bloqueio</button></div>
      <div class="panel-b">${modo === 'dia' || modo === 'semana' ? planoBandejaHTML() : ''}${corpo}<div class="small muted" style="margin-top:8px">${nota}</div></div></div>
    ${planoRotinaHTML()}`;
  // restaura a rolagem logo depois de desenhar (antes de o navegador mandar qualquer evento de rolagem da troca)
  const rolar = () => (modo === 'tarefas' ? planoGanttRolar() : modo === 'mes' ? planoMesRolar() : planoGradeRolar(modo === 'semana'));
  return { title: 'Calendário', actions: '', html, after: rolar };
};
/* Grade de 24 h: abre perto das 5h (ou 1 h antes de agora) e guarda a rolagem; na semana, abre na semana de hoje. */
function planoGradeRolar(semana = false, irHoje = false) {
  const sc = typeof document !== 'undefined' && document.querySelector && document.querySelector('[data-pl-scroll]'); if (!sc) return;
  if (PLANO.gradeTop == null) { const n = new Date(); PLANO.gradeTop = Math.max(0, Math.min(5, n.getHours() - 1)) * PL_ALT; }
  sc.scrollTop = PLANO.gradeTop;
  if (semana) {
    const regua0 = sc.querySelector('.pl-regua-col')?.offsetWidth || 44;
    sc.style.setProperty('--plw', Math.max(90, Math.floor((sc.clientWidth - regua0 - 8) / 7) - 6) + 'px');
    sc.scrollLeft = 0;
    // trackpad para os lados troca a semana (um gesto = uma semana)
    if (!sc._plSwipe) { sc._plSwipe = true; let acc = 0, ult = 0;
      sc.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.altKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault(); const agora = Date.now(); if (agora - ult < 700) return;
        acc += e.deltaX; if (Math.abs(acc) < 60) return;
        const d = acc > 0 ? 1 : -1; acc = 0; ult = agora; ACTIONS['pl-sem']({ dataset: { d: String(d) } });
      }, { passive: false }); }
  }
  // sinais de que é VOCÊ rolando: roda/trackpad, toque, teclado, ou clicar na própria barra de rolagem. Clicar num bloco
  // não conta (o clique redesenha a tela, e a rolagem que o redesenho provoca era guardada como se fosse sua).
  if (!sc._plScroll) {
    ['wheel', 'touchstart', 'keydown'].forEach(ev => sc.addEventListener(ev, () => { sc._usuario = Date.now(); }, { passive: true }));
    sc.addEventListener('pointerdown', (e) => { if (e.target === sc) sc._usuario = Date.now(); }, { passive: true });
  }
  if (!sc._plScroll) { sc._plScroll = true; sc.addEventListener('scroll', () => {
    if (PLANO.desenhando && Date.now() - PLANO.desenhando < 250) return;   // rolagem provocada pelo redesenho
    PLANO.gradeTop = sc.scrollTop;
    // só guarda a posição quando é VOCÊ rolando (roda do mouse, trackpad, toque, teclado, arrastar a barra) — rolagens
    // que o navegador faz sozinho ao redesenhar ou encaixar nas segundas não contam


  }, { passive: true }); }
}
/* Mês: abre (e "Hoje" volta) com a semana de hoje inteira, encostada no topo da janela, logo abaixo do nome do mês. */
function planoMesRolar(forcarHoje = false) {
  const sc = typeof document !== 'undefined' && document.querySelector && document.querySelector('[data-pl-mes]'); if (!sc) return;
  if (forcarHoje || PLANO.mesTop == null) {
    const h = sc.querySelector('[data-hoje]');
    if (h) { const rot = sc.querySelector('.pl-mes-rot'); const alto = rot ? rot.offsetHeight : 0;
      sc.scrollTop = Math.max(0, h.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - alto - 6); }
  } else {
    // volta para o mesmo dia que estava no topo (a altura das linhas muda conforme o conteúdo, então o pixel antigo pulava)
    const c = PLANO.mesAnc ? sc.querySelector(`.pl-mc[data-dia="${PLANO.mesAnc.dia}"]`) : null;
    sc.scrollTop = c ? c.offsetTop + PLANO.mesAnc.dy : PLANO.mesTop;
  }
  if (!sc._plScroll) {
    ['wheel', 'touchstart', 'keydown'].forEach(ev => sc.addEventListener(ev, () => { sc._usuario = Date.now(); }, { passive: true }));
    sc.addEventListener('pointerdown', (e) => { if (e.target === sc) sc._usuario = Date.now(); }, { passive: true });
  }
  if (!sc._plScroll) { sc._plScroll = true; sc.addEventListener('scroll', () => {
    if (PLANO.desenhando && Date.now() - PLANO.desenhando < 250) return;
    if (!(sc._usuario && Date.now() - sc._usuario < 1500)) return;   // só a rolagem que você faz
    PLANO.mesTop = sc.scrollTop;
    const c = [...sc.querySelectorAll('.pl-mc')].find(x => x.offsetTop + x.offsetHeight > sc.scrollTop);
    if (c) PLANO.mesAnc = { dia: c.dataset.dia, dy: sc.scrollTop - c.offsetTop };
  }, { passive: true }); }
}
ACTIONS['pl-modo'] = (el) => { PLANO.modo = el.dataset.m; db.setSetting('planoModo', el.dataset.m); render(); };
ACTIONS['pl-ir-dia'] = (el) => { PLANO.dia = el.dataset.dia; PLANO.modo = 'dia'; render(); };
ACTIONS['pl-nav'] = (el) => { const d = Number(el.dataset.d); if (!d) PLANO.dia = null; else PLANO.dia = planoDiaMais(PLANO.dia || ymd(new Date()), d); render(); };
ACTIONS['pl-mes-hoje'] = () => { PLANO.mesAnc = null; planoMesRolar(true); };
ACTIONS['pl-sem'] = (el) => {
  const d = Number(el.dataset.d);
  PLANO.semIni = d ? planoDiaMais(PLANO.semIni || planoSegunda(new Date()), d * 7) : planoSegunda(new Date());
  render();
};
ACTIONS['pl-rafa-ir'] = (el) => { if (typeof RF !== 'undefined') RF.ym = el.dataset.dia.slice(0, 7); go('rafa'); };
ACTIONS['pl-dia'] = (el) => {
  const m = { ...planoEsticados() }; const cfg = planoCfg();
  const v = Math.max(0, Math.min(14, (m[el.dataset.dia] ?? cfg.horasDia) + Number(el.dataset.d)));
  if (v === cfg.horasDia) delete m[el.dataset.dia]; else m[el.dataset.dia] = v;
  planoMudar('Horas do dia mudadas', () => db.setSetting('planoDias', m), false);
};

ACTIONS['pl-bloq-del'] = (el) => planoMudar('Bloqueio removido', () => db.setSetting('planoBloqueios', planoBloqueios().filter(b => b.id !== el.dataset.id)));

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
    const nome = $('#pb-n', l.box).value.trim(); l.close();
    planoMudar('Bloqueio marcado', () => db.setSetting('planoBloqueios', [...planoBloqueios(), { id: uid(), dia, ini, fim, nome }]), 'Bloqueio marcado; o plano se reorganiza em volta');
  });
};


ACTIONS['pl-reorg'] = async (el) => {
  const dia = el.dataset.dia; const n = planoPins().filter(p => p.dia === dia).length;
  if (!await confirmBox({ title: 'Reorganizar o dia?', body: `Solta ${n} bloco${n > 1 ? 's' : ''} fixado${n > 1 ? 's' : ''} em ${fmtDate(dia)}. O app encaixa as tarefas de novo nas horas livres, pela entrega e pelas dependências.`, ok: 'Reorganizar' })) return;
  planoMudar('Dia reorganizado', () => planoPinsSalvar(planoPins().filter(p => p.dia !== dia)));
};
ACTIONS['pl-livre'] = (el) => planoCriarMenu(el.dataset.dia, Number(el.dataset.a), Math.min(Number(el.dataset.b), Number(el.dataset.a) + 1));
/* Empurrar para amanhã: blocos fixados de hoje (de agora em diante) e to-dos abertos de hoje com hora vão para o próximo dia útil, no mesmo horário. */
ACTIONS['pl-empurrar'] = async (el) => {
  const dia = el.dataset.dia; let prox = planoDiaMais(dia, 1); for (let i = 0; i < 14 && !planoDiaUtil(prox); i++) prox = planoDiaMais(prox, 1);
  const n0 = new Date(); const agora = n0.getHours() + n0.getMinutes() / 60;
  const pins = planoPins().filter(p => p.dia === dia && (p.ini + (Number(p.h) || 0)) > agora);
  const todos = db.all('tempo_notices').filter(n => n.kind === 'todo' && n.status !== 'done' && n.data?.due && n.data.due.slice(0, 10) === dia && !todoSemHora(n.data));
  if (!pins.length && !todos.length) return toast('Nada fixado nem to-do com hora para empurrar. O planejado já se reorganiza sozinho.');
  if (!await confirmBox({ title: 'Empurrar para amanhã?', body: `${pins.length ? `${pins.length} bloco(s) fixado(s)` : ''}${pins.length && todos.length ? ' e ' : ''}${todos.length ? `${todos.length} to-do(s)` : ''} vão para ${fmtDate(prox)}, no mesmo horário. O resto do planejado se reorganiza sozinho.`, ok: 'Empurrar' })) return;
  const ids = new Set(pins.map(p => p.id));
  planoMudar(`Levado para ${fmtDate(prox)}`, () => {
    // os que chegam entram no mesmo horário; quem já estava lá e fica por baixo vai para depois (sem sobrepor)
    const movidos = planoPins().filter(p => ids.has(p.id)).map(p => ({ ...p, dia: prox }));
    const r = planoEmpurrar(planoPins().filter(p => !ids.has(p.id)), movidos.map(p => ({ dia: prox, ini: Number(p.ini), fim: Number(p.ini) + Number(p.h) })), planoOcupadosDoDia, { dias: [prox], proximoDia: planoProximoUtil });
    planoPinsSalvar([...r.base, ...r.empurrados, ...movidos]);
    todos.forEach(n => db.update('tempo_notices', n.id, { data: { ...n.data, due: prox + n.data.due.slice(10) } }, true));
  });
};
ACTIONS['pl-unpin'] = (el) => { const ids = (el.closest('[data-pin]')?.dataset.pin || el.dataset.id || '').split(',').filter(Boolean); planoMudar('Bloco solto', () => planoPinsSalvar(planoPins().filter(p => !ids.includes(p.id))), 'Bloco solto: o app encaixa de novo'); };
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
    <button type="button" class="btn sm ghost icon pl-rot-pin${planoRotinaPin(r) ? ' on' : ''}" data-act="pl-rot-pin" data-rid="${r.id}" data-g="${esc(r.grupo)}" title="${planoRotinaPin(r) ? 'Inegociável (fixado): o plano automático nunca passa por cima. Clique para deixar maleável' : 'Maleável: quando uma tarefa não cabe até a entrega, o plano automático pode passar por cima (ex.: almoço, jantar, academia). Clique para fixar'}" aria-label="${planoRotinaPin(r) ? 'Inegociável' : 'Maleável'}">${icon('pin')}</button>
    <label class="check small" title="Mostrar este bloco no Mês, só na semana atual (desmarcado não aparece no Mês; Semana e Dia mostram sempre)"><input type="checkbox" data-on="pl-rot" data-id="${r.id}" data-f="mes" ${r.mes ? 'checked' : ''}> No mês</label>
    <select class="input sm" data-on="pl-rot" data-id="${r.id}" data-f="repete" aria-label="Repete"><option value="semanal" ${r.repete !== 'quinzenal' ? 'selected' : ''}>Toda semana</option><option value="quinzenal" ${r.repete === 'quinzenal' ? 'selected' : ''}>A cada 2 semanas</option></select>
    <button class="btn sm ghost icon" data-act="pl-rot-del" data-id="${r.id}" title="Tirar da rotina de hoje em diante" aria-label="Tirar">${icon('x')}</button></div>`;
  return `<div class="panel"><div class="panel-h"><h3>Rotina fixa</h3><span class="small muted">mudanças valem de hoje em diante; o passado não muda. Para mexer num dia só, arraste ou puxe o bloco no calendário. "Rafa" liga o bloco ao Dias de Rafa.</span><span class="grow"></span><button class="btn sm" data-act="pl-rot-novo">${icon('plus')} Bloco fixo</button></div>
    <div class="panel-b"><div class="pl-rot-cab small muted"><span>Bloco</span><span>Dias</span><span>Começa</span><span>Termina</span><span>Rafa</span><span>Acompanha</span><span title="Pin = inegociável; sem pin = maleável (o plano pode passar por cima)">Fixo</span><span>Mês</span><span>Repete</span><span></span></div>${ativos.map(linha).join('')}</div></div>`;
}
CHANGES['pl-rot'] = (el) => {
  const f = el.dataset.f; let v = f === 'flex' || f === 'mes' ? el.checked : el.value;
  if (f === 'ini' || f === 'fim') { v = planoHoraDe(v); if (v == null) return; }
  if (f === 'nome') v = String(v).trim() || 'Bloco fixo';
  const patch = { [f]: v };
  if (f === 'repete' && v === 'quinzenal') patch.ref = ymd(new Date());
  planoRotinaMudar(el.dataset.id, patch); render();
};
ACTIONS['pl-rot-dia'] = (el) => { const r = planoRotina().find(x => x.id === el.dataset.id); if (!r) return; const wd = Number(el.dataset.wd); const dias = (r.dias || []).includes(wd) ? r.dias.filter(x => x !== wd) : [...(r.dias || []), wd].sort(); planoRotinaMudar(r.id, { dias }); render(); };
ACTIONS['pl-rot-del'] = (el) => { const ontem = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); })(); const hoje = ymd(new Date());
  planoRotinaSalvar(planoRotina().flatMap(r => r.id !== el.dataset.id ? [r] : (r.desde || '') >= hoje ? [] : [{ ...r, ate: ontem }])); render(); toast('Bloco tirado da rotina de hoje em diante'); };
ACTIONS['pl-rot-novo'] = () => { planoRotinaSalvar([...planoRotina(), { id: uid(), grupo: uid(), nome: 'Novo bloco', ini: 15, fim: 16, dias: [1, 2, 3, 4, 5], repete: 'semanal', rafa: '', flex: false, pin: true, desde: ymd(new Date()), ate: null }]); render(); };
/* Pin da rotina: inegociável × maleável. É a natureza do bloco (não muda horário), então vale para todas as versões dele. */
ACTIONS['pl-rot-pin'] = (el) => {
  const l = planoRotina(); const r = l.find(x => x.id === el.dataset.rid) || l.find(x => x.grupo === el.dataset.g); if (!r) return;
  const novo = !planoRotinaPin(r);
  planoMudar(novo ? `${r.nome}: inegociável` : `${r.nome}: maleável`, () => planoRotinaSalvar(l.map(x => x.grupo === r.grupo ? { ...x, pin: novo } : x)));
};
/* Ajuste de um dia só: tirar o bloco fixo daquele dia, ou voltar ao padrão. */
ACTIONS['pl-fixo-off'] = (el) => { const m = { ...planoRotinaDia() }; m[el.dataset.dia] = { ...(m[el.dataset.dia] || {}), [el.dataset.g]: { off: true } }; planoMudar('Tirado só deste dia', () => db.setSetting('planoRotinaDia', m)); };
ACTIONS['pl-fixo-reset'] = (el) => { const m = { ...planoRotinaDia() }; const d = { ...(m[el.dataset.dia] || {}) }; delete d[el.dataset.g]; m[el.dataset.dia] = d; planoMudar('Voltou ao horário da rotina', () => db.setSetting('planoRotinaDia', m)); };

/* To-do sem data → primeiro horário livre do dia (a partir de agora, se for hoje), com 30 min ou a estimativa. */
ACTIONS['pl-encaixar'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return; const dia = el.dataset.dia;
  const dur = Math.max(TODO_MIN_H, (Number(n.data?.est) > 0 ? Number(n.data.est) : 30) / 60);
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
  planoMudar('To-do encaixado', () => db.update('tempo_notices', n.id, { data: { ...(n.data || {}), due: `${dia}T${hm(achou)}`, end: fim < 24 ? hm(fim) : null, semHora: false } }, true), `Encaixado: ${fmtDate(dia)} ${hm(achou)}–${hm(fim)}`);
};

/* ---------- Arrastar e puxar (tudo que não é registro) ----------
   Arrastar muda o horário (de 15 em 15 min; o planejado e o bloqueio também mudam de dia); puxar a borda de cima ou
   de baixo muda o começo ou o fim. Uma janelinha mostra o horário novo enquanto mexe.
   planejado → fica fixado · rotina → só naquele dia · to-do → muda o to-do · bloqueio → muda o bloqueio. */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  let d = null, mexeu = false, tip = null, selClick = false;
  const q = (h) => Math.round(h * 4) / 4;
  // Ímã (24/11): o bloco gruda na borda do vizinho e na rotina quando chega perto (até 20 min), sem sobrar 15 min soltos.
  // Option (Alt) segurado solta o ímã. Registrado não conta (corre em paralelo).
  const IMA = 1 / 3;
  const bordas = (x) => { const col = x.colAlvo || x.col0; if (!col) return [];
    return [...col.querySelectorAll('[data-ini][data-fim]')].filter(o => o !== x.el && !x.grupo.includes(o) && !o.closest('.pl-dg-fly') && !o.classList.contains('pl-feito') && !o.classList.contains('pl-pv-some'))
      .flatMap(o => [Number(o.dataset.ini), Number(o.dataset.fim)]).filter(Number.isFinite); };
  const gruda = (h, l) => { let m = null; l.forEach(v => { if (Math.abs(v - h) <= IMA + 1e-6 && (m === null || Math.abs(v - h) < Math.abs(m - h))) m = v; }); return m; };
  const calc = (x, dy) => {
    const dh = dy / PL_ALT; let a = x.ini, b = x.fim; x.grudou = false;
    const ima = !x.alt && ['plano', 'bloq', 'todo', 'fixo'].includes(x.kind) ? bordas(x) : [];
    if (x.modo === 'top') { const r = x.ini + dh; const g = gruda(r, ima); a = Math.min(b - 0.25, Math.max(0, g ?? q(r))); x.grudou = g !== null; }
    else if (x.modo === 'bot') { const r = x.fim + dh; const g = gruda(r, ima); b = Math.max(a + 0.25, Math.min(24, g ?? q(r))); x.grudou = g !== null; }
    else { const dur = b - a; const r = x.ini + dh; const ga = gruda(r, ima), gb = gruda(r + dur, ima);
      const g = ga !== null && (gb === null || Math.abs(ga - r) <= Math.abs(gb - dur - r)) ? ga : gb !== null ? gb - dur : null;
      a = Math.max(0, Math.min(24 - dur, g ?? q(r))); b = a + dur; x.grudou = g !== null; }
    return [a, b];
  };
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.target.closest) return;
    if (e.target.closest('.pl-unpin, .pl-fx-bt')) return;
    const el = e.target.closest('[data-dg]'); if (!el) return;
    if (!e.target.closest('input, textarea, select, button')) e.preventDefault();   // não começa seleção de texto ao segurar o bloco
    // Shift + clique: seleciona/desseleciona (para arrastar vários juntos)
    if (e.shiftKey && el.dataset.sk) { const k = el.dataset.sk; PLANO.sel.has(k) ? PLANO.sel.delete(k) : PLANO.sel.add(k); el.classList.toggle('pl-sel', PLANO.sel.has(k)); selClick = true; return; }
    const modo = e.target.closest('.dg-t') ? 'top' : e.target.closest('.dg-b') ? 'bot' : 'move';
    const grupo = modo === 'move' && el.dataset.sk && PLANO.sel.has(el.dataset.sk) && PLANO.sel.size > 1
      ? [...document.querySelectorAll('[data-sk]')].filter(o => o !== el && PLANO.sel.has(o.dataset.sk)) : [];
    const rr = el.getBoundingClientRect();
    d = { el, grupo, modo, kind: el.dataset.dg, dia: el.dataset.dia, ini: Number(el.dataset.ini), fim: Number(el.dataset.fim), y0: e.clientY, x0: e.clientX, top0: el.offsetTop, h0: el.offsetHeight, ox: e.clientX - rr.left, oy: e.clientY - rr.top, col0: el.closest('[data-pl-col]') };
    mexeu = false;
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!d) return; const dy = e.clientY - d.y0, dx = e.clientX - d.x0; d.alt = e.altKey; d.meta = e.metaKey;
    if (d.modo === 'move' && mexeu) { d.el.style.pointerEvents = 'none'; const c = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-pl-col]'); d.colAlvo = c || d.col0; }
    if (!mexeu && Math.hypot(dx, dy) < 4) return;
    if (!mexeu) { mexeu = true; d.el.classList.add('arrastando'); document.body.classList.add('pl-arrastando'); try { window.getSelection()?.removeAllRanges(); } catch (_) { /* ok */ } tip = document.createElement('div'); tip.className = 'pl-dg-tip'; document.body.appendChild(tip); }
    if (d.modo === 'move') { // inclina só enquanto o mouse se mexe; parado, volta reto para encaixar
      const gira = (on) => [d.el, d.fly].forEach(o => o && o.classList.toggle('pl-gira', on));
      d.gira = gira; gira(true); clearTimeout(d.tGira); d.tGira = setTimeout(() => gira(false), 110);
    }
    const [a, b] = calc(d, dy);
    d.el.style.top = (a * PL_ALT) + 'px'; d.el.style.height = Math.max(10, (b - a) * PL_ALT - 2) + 'px';
    // Fora do próprio dia (ex.: no Mês, ou levando para outro dia), o bloco "flutua" com o mouse até onde for solto (24/11)
    const r0 = d.col0?.getBoundingClientRect(); const fora = d.modo === 'move' && (!r0 || e.clientX < r0.left || e.clientX > r0.right || !!d.el.closest('.pl-pop, [data-pl-mes]'));
    if (fora) {
      if (!d.fly) { d.fly = d.el.cloneNode(true); d.fly.classList.add('pl-dg-fly'); d.fly.removeAttribute('data-dg'); d.fly.style.cssText = d.el.style.cssText + `;position:fixed;right:auto;bottom:auto;z-index:999;pointer-events:none;margin:0;transform:none;width:${Math.max(90, d.el.offsetWidth)}px;height:${Math.min(Math.max(22, d.el.offsetHeight), 90)}px`; // as cores do bloco vêm de regras "dentro da grade": a cópia vai num invólucro com a mesma classe
        d.flyW = document.createElement('div'); d.flyW.className = 'pl-grade pl-fly-wrap'; d.flyW.appendChild(d.fly); document.body.appendChild(d.flyW); }
      d.fly.style.left = (e.clientX - Math.min(d.ox, d.fly.offsetWidth - 8)) + 'px'; d.fly.style.top = (e.clientY - Math.min(d.oy, 20)) + 'px';
      d.el.style.transform = ''; d.el.classList.add('pl-dg-orig');
    } else {
      if (d.fly) { (d.flyW || d.fly).remove(); d.fly = null; d.flyW = null; d.el.classList.remove('pl-dg-orig'); }
      if (d.modo === 'move') d.el.style.transform = `translateX(${dx}px)`;
    }
    d.grupo.forEach(o => { o.style.transform = `translate(${dx}px, ${(a - d.ini) * PL_ALT}px)`; o.classList.add('arrastando'); });
    const hh = (h) => planoHora(h).replace(':', 'h').replace(/h00$/, 'h');
    tip.textContent = d.kind === 'prazo' ? `Entrega: ${hh(a)}` : d.modo === 'top' ? `Novo início: ${hh(a)}` : d.modo === 'bot' ? `Novo fim: ${hh(b)}` : `Novo horário: ${hh(a)}–${hh(b)}`;
    const linhas = [`${fmtH((b - a) * 36e5)}${d.modo === 'move' ? (['plano', 'bloq', 'todo'].includes(d.kind) ? ' · para o lado: outro dia ou outra faixa' : ' · para o lado: outra faixa') : ''}`];
    // puxando a borda de um bloco de tarefa: ⌘ muda também a previsão da tarefa
    if (d.kind === 'plano' && d.modo !== 'move' && d.el.dataset.tid) {
      const t = db.get('tempo_tasks', d.el.dataset.tid); const pv = t && typeof tkPrevMin === 'function' ? tkPrevMin(t) : null;
      if (d.meta && pv) { const nv = Math.max(15, Math.round((pv + ((b - a) - (d.fim - d.ini)) * 60) / 15) * 15); linhas.push(`Previsão da tarefa: ${fmtH(pv * 60e3)} → ${fmtH(nv * 60e3)}`); }
      else linhas.push('Segure ⌘ para mudar também a previsão da tarefa');
    }
    if (['plano', 'bloq', 'todo', 'fixo'].includes(d.kind)) linhas.push(d.alt ? 'Ímã solto (Option)' : d.grudou ? 'Grudou na borda · segure Option para soltar o ímã' : 'Segure Option para soltar o ímã');
    tip.dataset.sub = linhas.join('\n');
    tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 12) + 'px';
    if (d.kind === 'plano' && !d.grupo.length && typeof planoPrevia === 'function') planoPrevia(d, e, a, b);
  });
  document.addEventListener('pointerup', async (e) => {
    if (!d) return; const x = d; d = null; clearTimeout(x.tGira); x.el.classList.remove('pl-gira'); if (tip) { tip.remove(); tip = null; }
    if (x.fly) { (x.flyW || x.fly).remove(); x.fly = null; x.flyW = null; } x.el.classList.remove('pl-dg-orig'); document.body.classList.remove('pl-arrastando');
    if (typeof planoPreviaFim === 'function') planoPreviaFim();
    x.alt = e.altKey; x.meta = e.metaKey;
    if (!mexeu) return;
    x.el.style.pointerEvents = 'none';
    let [a, b] = calc(x, e.clientY - x.y0);
    let dia = x.dia; let faixa = null;
    const col = x.modo === 'move' ? document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-pl-col]') : null;
    x.el.style.pointerEvents = ''; x.el.style.transform = '';
    if (col && col.dataset.plCol !== x.dia && ['plano', 'bloq', 'todo', 'prazo'].includes(x.kind)) dia = col.dataset.plCol;
    else if (col && col.dataset.plCol === x.dia && x.el.dataset.fk && x.el.dataset.lane !== '') {   // mesmo dia, outra terça parte: troca a faixa só deste item
      const r = col.querySelector('.pl-grade')?.getBoundingClientRect() || col.getBoundingClientRect();
      const l = Math.max(0, Math.min(2, Math.floor((e.clientX - r.left) / (r.width / 3))));
      if (String(l) !== x.el.dataset.lane && Math.abs(e.clientX - x.x0) > 12) faixa = l;
    }
    if (faixa !== null) {
      const f = { ...planoFaixaFix(), [x.el.dataset.fk]: faixa }; db.setSetting('planoFaixaFix', f);
      if (Math.abs(e.clientY - x.y0) < 6) { db.emit(); render(); return; }   // só mudou de faixa
    }
    // vários selecionados (Shift): todos andam o mesmo tanto, em hora e em dia, sem perguntas (mas nunca um por cima do outro)
    if (x.grupo.length) {
      const todos = [x.el, ...x.grupo];
      let dh = a - x.ini; dh = Math.max(-Math.min(...todos.map(o => Number(o.dataset.ini))), Math.min(24 - Math.max(...todos.map(o => Number(o.dataset.fim))), dh));
      const dd = Math.round((new Date(dia + 'T12:00:00') - new Date(x.dia + 'T12:00:00')) / 864e5);
      PLANO.sel.clear();
      planoMudar(`${todos.length} itens movidos`, () => {
        let pins = planoPins(); const novos = [];
        todos.forEach(o => {
          const ini = Number(o.dataset.ini) + dh, fim = Number(o.dataset.fim) + dh, nd = planoDiaMais(o.dataset.dia, dd);
          if (o.dataset.dg === 'plano') { const ids = (o.dataset.pin || '').split(',').filter(Boolean); pins = pins.filter(p => !ids.includes(p.id)); novos.push({ id: uid(), dia: nd, pid: o.dataset.pid, tid: o.dataset.tid || null, ini, h: fim - ini }); }
          else if (o.dataset.dg === 'todo') { const n = db.get('tempo_notices', o.dataset.id); if (n) db.update('tempo_notices', n.id, { data: { ...(n.data || {}), due: `${nd}T${planoHora(ini)}`, end: fim < 24 ? planoHora(fim) : null, semHora: false } }, true); }
        });
        const r = planoEmpurrar(pins, novos.map(n => ({ dia: n.dia, ini: n.ini, fim: n.ini + n.h })), planoOcupadosDoDia, { proximoDia: planoProximoUtil });
        planoPinsSalvar([...r.base, ...r.empurrados, ...novos]);
      });
      return;
    }
    let novosPins = null, extra = '';   // bloco planejado: a lista nova de fixados sai depois das perguntas
    if (x.kind === 'plano') {
      const pid = x.el.dataset.pid, tid = x.el.dataset.tid || null; const cfg = planoCfg();
      // só o bloco arrastado sai do lugar (os outros pedaços da mesma tarefa ficam). A lista de fixados é sempre lida na hora:
      // enquanto uma janela de pergunta está aberta, ela pode ter mudado.
      const meus = (x.el.dataset.pin || '').split(',').filter(Boolean);
      const outros = () => planoPins().filter(p => !meus.includes(p.id));
      // puxou por cima de outro pedaço da mesma tarefa no mesmo dia: junta num bloco só
      const mesma = (p) => p.dia === dia && (tid ? p.tid === tid : (p.pid === pid && !p.tid));
      const junta = outros().filter(p => mesma(p) && Number(p.ini) <= b + 0.01 && Number(p.ini) + Number(p.h) >= a - 0.01);
      if (junta.length) { a = Math.min(a, ...junta.map(p => Number(p.ini))); b = Math.max(b, ...junta.map(p => Number(p.ini) + Number(p.h))); }
      const semJunta = () => outros().filter(p => !junta.some(j => j.id === p.id));
      let partes = [{ dia, ini: a, fim: b }];
      // passou por cima da rotina: em paralelo ou dividir em volta dela? (juntando pedaços, fica um bloco só)
      const bate = junta.length ? [] : planoFixosDoDia(dia).filter(f => f[0] < b - 1e-6 && f[1] > a + 1e-6);
      if (bate.length && typeof choiceBox === 'function') {
        const v = await choiceBox({ title: 'Passou por cima da rotina', body: `O bloco bate com <b>${esc(bate.map(f => f[2]).join(', '))}</b>.`, opts: [['dividir', 'Dividir: o trabalho para durante a rotina e continua depois'], ['paralelo', 'Deixar em paralelo (faço junto)']] });
        if (v === null) { render(); return; }
        if (v === 'dividir') {
          let falta = b - a, cur = a; partes = [];
          const fx = planoFixosDoDia(dia).slice().sort((p, q) => p[0] - q[0]);
          while (falta > 0.01 && cur < 24) {
            const f = fx.find(z => z[0] <= cur + 1e-6 && z[1] > cur + 1e-6); if (f) { cur = f[1]; continue; }
            const prox = fx.find(z => z[0] > cur + 1e-6); const lim = Math.min(24, prox ? prox[0] : 24);
            const take = Math.min(falta, lim - cur); partes.push({ dia, ini: cur, fim: cur + take }); falta -= take; cur += take;
          }
          if (falta > 0.01) partes.push({ dia, ini: cur, fim: cur + falta });
        }
      }
      // passou do fim do expediente: continua no próximo dia útil?
      const ult = partes[partes.length - 1];
      // passou do fim do expediente: até 1h o dia estica e o bloco fica onde você soltou; mais que isso, pergunta (nunca muda sozinho)
      if (ult && ult.fim > cfg.fim + 1e-6 && ult.ini < cfg.fim) {
        const resto = ult.fim - cfg.fim;
        if (resto <= 1 + 1e-6) extra += ' · dia esticado';
        else if (typeof choiceBox === 'function') {
          const prox = planoProximoUtil(dia);
          const v = await choiceBox({ title: `Passa das ${planoHora(cfg.fim).replace(':00', 'h')}`, body: `O bloco vai até ${planoHora(ult.fim)}: sobram ${fmtH(resto * 36e5)} depois das ${planoHora(cfg.fim)}.`, opts: [['mesmo', 'Manter aqui, onde soltei'], ['prox', `Dividir: o que passa continua em ${fmtDate(prox)}`]] });
          if (v === null) { render(); return; }   // Cancelar: o bloco volta para onde estava
          if (v === 'prox') { ult.fim = cfg.fim; partes.push({ dia: prox, ini: cfg.inicio, fim: cfg.inicio + resto }); }
        }
      }
      // nunca deixa dois blocos fixados um em cima do outro: o arrastado fica onde você soltou e os fixados que ele cobre
      // vão para logo depois dele, em cadeia, pulando a rotina. Os que não encostam ficam onde estão. Bateu em outra atividade:
      // pergunta antes de mexer nela (ela nunca é dividida: vai inteira para depois).
      const empurra = () => planoEmpurrar(semJunta(), partes, planoOcupadosDoDia, { proximoDia: planoProximoUtil });
      // blocos que o app nem usa (esperam outra tarefa) ficam invisíveis na tela: não valem como "batida", só saem do caminho
      const fantasmas = (() => { try { return new Set((tkMotor(new Date(), 60).pinsSobra || []).map(q => q.pin)); } catch (_) { return new Set(); } })();
      let r = empurra();
      if (r.empurrados.some(q => !fantasmas.has(q.id)) && typeof choiceBox === 'function') {
        const nomes = r.empurrados.filter(q => !fantasmas.has(q.id)).map(planoNomePin).join(', ');
        const v = await choiceBox({ title: 'Mexer nas outras atividades?', body: `O bloco bate com <b>${esc(nomes)}</b>.`, opts: [['empurrar', 'Sim: empurrar para depois deste (inteiras, sem dividir)'], ['ficar', 'Não: deixar onde estão (fica sobreposto)']] });
        if (v === null) { render(); return; }
        r = v === 'ficar' ? { base: semJunta(), empurrados: [] } : empurra();   // relê: a lista pode ter mudado com a janela aberta
      }
      novosPins = [...r.base, ...r.empurrados, ...partes.map(pt => ({ id: uid(), dia: pt.dia, pid, tid, ini: pt.ini, h: pt.fim - pt.ini }))];
      // sobra da mesma tarefa lá na frente (pedaço dividido de antes): some, porque o bloco agora já cobre o tempo previsto
      { const novosIds = new Set(novosPins.slice(r.base.length + r.empurrados.length).map(q => q.id)); const prev = (() => { try { const it = Object.values(tkMotor(new Date(), 60).itens).find(z => z.t && tid && z.t.id === tid); return it ? it.prev / 60 : 0; } catch (_) { return 0; } })();
        if (tid && prev > 0) {
          const mesmaT = novosPins.filter(q => q.tid === tid), soma = mesmaT.reduce((t0, q) => t0 + Number(q.h), 0); let sobra = soma - prev; const tira = new Set(), corta = {};
          mesmaT.filter(q => !novosIds.has(q.id)).sort((q1, q2) => (q2.dia + (Number(q2.ini) || 0).toFixed(3).padStart(7, '0')).localeCompare(q1.dia + (Number(q1.ini) || 0).toFixed(3).padStart(7, '0'))).forEach(q => {
            if (sobra < 0.24) return; if (Number(q.h) <= sobra + 0.01) { tira.add(q.id); sobra -= Number(q.h); } else { corta[q.id] = Number(q.h) - sobra; sobra = 0; } });
          if (tira.size || Object.keys(corta).length) { novosPins = novosPins.filter(q => !tira.has(q.id)).map(q => corta[q.id] ? { ...q, h: Math.max(0.25, Math.round(corta[q.id] * 4) / 4) } : q); extra += ' · pedaço da frente juntado'; }
        } }
      if (r.empurrados.length) extra += ` · ${r.empurrados.length} bloco${r.empurrados.length > 1 ? 's' : ''} empurrado${r.empurrados.length > 1 ? 's' : ''}`;
      if (junta.length) extra += ' · pedaços juntados';
      a = partes[0].ini; b = partes[partes.length - 1].fim;
    }
    if (x.kind === 'prazo') b = a;
    if (x.kind === 'plano' && x.meta && x.modo !== 'move' && x.el.dataset.tid) extra += ' · previsão da tarefa atualizada';
    const ROT = { plano: 'Bloco fixado', fixo: 'Rotina mudada só neste dia', todo: 'To-do movido', prazo: 'Entrega movida', bloq: 'Bloqueio movido' };
    planoMudar(ROT[x.kind] || 'Item movido', () => {
      if (x.kind === 'plano') { planoPinsSalvar(novosPins);
        // ⌘ ao puxar a borda: a previsão da tarefa acompanha a mudança do bloco
        if (x.meta && x.modo !== 'move' && x.el.dataset.tid) { const t = db.get('tempo_tasks', x.el.dataset.tid); const pv = t && typeof tkPrevMin === 'function' ? tkPrevMin(t) : null;
          if (t && pv) db.update('tempo_tasks', t.id, { est_min: Math.max(15, Math.round((pv + ((b - a) - (x.fim - x.ini)) * 60) / 15) * 15) }, true); } }
      else if (x.kind === 'fixo') {
        const m = { ...planoRotinaDia() }; m[x.dia] = { ...(m[x.dia] || {}), [x.el.dataset.g]: { ini: a, fim: b } }; db.setSetting('planoRotinaDia', m);
      } else if (x.kind === 'todo') {
        const n = db.get('tempo_notices', x.el.dataset.id);
        if (n) db.update('tempo_notices', n.id, { data: { ...(n.data || {}), due: `${dia}T${planoHora(a)}`, end: b < 24 ? planoHora(b) : null, semHora: false } }, true);
      } else if (x.kind === 'prazo' && x.el.dataset.ent) {
        const pid = x.el.dataset.pid; projEntregasSalvar(pid, projEntregas(pid).map(z => z.id === x.el.dataset.ent ? { ...z, dia, hora: planoHora(a) } : z));
      } else if (x.kind === 'prazo') {
        const t = db.get('tempo_tasks', x.el.dataset.id);
        if (t) { if (dia !== t.deadline) changeTaskDeadline(t, dia, 'Movido no calendário'); db.update('tempo_tasks', t.id, { deadline_time: planoHora(a) }, true); }
      } else if (x.kind === 'bloq') {
        db.setSetting('planoBloqueios', planoBloqueios().map(bq => bq.id === x.el.dataset.id ? { ...bq, dia, ini: a, fim: b } : bq));
      }
    }, `${x.kind === 'fixo' ? 'Só neste dia: ' : x.kind === 'plano' ? 'Fixado: ' : ''}${dia !== x.dia ? fmtDate(dia) + ' ' : ''}${planoHora(a)}${x.kind === 'prazo' ? '' : '–' + planoHora(b)}${extra}`);
    if (x.kind === 'plano' && novosPins) planoAvisaSobra(new Set(novosPins.map(q => q.id)));
  });
  // o clique que termina um arrasto não abre nada
  document.addEventListener('click', (e) => {
    if ((mexeu || selClick) && e.target.closest && e.target.closest('[data-dg]')) { e.stopPropagation(); e.preventDefault(); mexeu = false; selClick = false; return; }
    // clique no vazio da grade ou Esc limpa a seleção
    if (PLANO.sel.size && e.target.classList && e.target.classList.contains('pl-grade')) { PLANO.sel.clear(); document.querySelectorAll('.pl-sel').forEach(o => o.classList.remove('pl-sel')); }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && PLANO.sel.size) { PLANO.sel.clear(); document.querySelectorAll('.pl-sel').forEach(o => o.classList.remove('pl-sel')); } });
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
    <div class="df"><button class="btn" data-pn="bloq">${icon('clock')} Bloqueio</button><button class="btn" data-pn="todo">${icon('check')} To-do</button><button class="btn" data-pn="entrega" data-tip="Marca a entrega (deadline) do projeto escolhido neste dia e hora">${icon('flag')} Entrega</button><button class="btn primary" data-pn="proj">Bloco de projeto</button></div>`,
    onClose: fim,
  });
  setTimeout(() => l.box.querySelector('#pn-t')?.focus(), 30);
  l.box.addEventListener('click', (e) => {
    const bt = e.target.closest('[data-pn]'); if (!bt) return;
    const nome = l.box.querySelector('#pn-t').value.trim(), pid = l.box.querySelector('#pn-p').value;
    if (bt.dataset.pn === 'todo' && !nome) return toast('Escreva o nome do to-do.');
    if ((bt.dataset.pn === 'proj' || bt.dataset.pn === 'entrega') && !pid) return toast('Escolha o projeto.');
    l.close();
    planoMudar('Criado', () => {
      if (bt.dataset.pn === 'entrega') projEntregasSalvar(pid, [...projEntregas(pid), { id: uid(), dia, hora: planoHora(a), nome: nome || 'Entrega' }]);
      else if (bt.dataset.pn === 'bloq') db.setSetting('planoBloqueios', [...planoBloqueios(), { id: uid(), dia, ini: a, fim: b, nome: nome || 'Bloqueio' }]);
      else if (bt.dataset.pn === 'todo') db.insert('tempo_notices', { kind: 'todo', key: '', status: 'open', title: nome, body: '', data: { due: `${dia}T${planoHora(a)}`, end: b < 24 ? planoHora(b) : null, semHora: false }, decision: '', decided_at: null, snooze_until: null }, true);
      else {   // bloco de projeto: se cair em cima de outro fixado, o outro vai para depois (nunca sobrepõe)
        const novo = { id: uid(), dia, pid, ini: a, h: b - a };
        const r = planoEmpurrar(planoPins(), [{ dia, ini: a, fim: b }], planoOcupadosDoDia, { proximoDia: planoProximoUtil });
        planoPinsSalvar([...r.base, ...r.empurrados, novo]);
      }
    });
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
  // Alt + rolagem, ou pinça no trackpad (o navegador manda como rolagem com Ctrl)
  if (!e.altKey && !e.ctrlKey) return; const sc = e.target.closest && e.target.closest('[data-pl-scroll]'); if (!sc) return;
  e.preventDefault();
  const grade = sc.querySelector('.pl-grade'); if (!grade) return;
  const y = e.clientY - grade.getBoundingClientRect().top;          // px desde 0h
  const hora = y / PL_ALT; const fator = e.ctrlKey ? Math.exp(-e.deltaY * 0.012) : (e.deltaY < 0 ? 1.15 : 1 / 1.15);
  const novo = Math.max(16, Math.min(160, Math.round(PL_ALT * fator)));
  if (novo === PL_ALT) return;
  const naTela = e.clientY - sc.getBoundingClientRect().top;
  const topoGrade = grade.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  PLANO.gradeTop = Math.max(0, topoGrade + hora * novo - naTela);
  PL_ALT = novo; render();
  clearTimeout(window.__plZoomT); window.__plZoomT = setTimeout(() => db.setSetting('planoZoom', PL_ALT), 500);   // grava só quando para
}, { passive: false });

/* Calendário › Tarefas: rolagem do mouse/trackpad anda nos dias; pinça (ou Ctrl/Alt + rolagem) dá zoom nos dias. */
if (typeof document !== 'undefined' && document.addEventListener) {
  let acc = 0;
  const zoom = (fator, clientX) => {
    const sc = document.querySelector('.plg-dir'); if (!sc) return;
    const x = clientX - sc.getBoundingClientRect().left; const dia = (sc.scrollLeft + x) / PLG_W;           // dia (fracionado) sob o cursor
    const novo = Math.max(28, Math.min(PLG_MAX, Math.round(PLG_W * fator))); if (novo === PLG_W) return;
    PLG_W = novo; PLANO.ganttX = Math.max(0, dia * novo - x); render();
    clearTimeout(window.__plgZoomT); window.__plgZoomT = setTimeout(() => { db.setSetting('planoGanttZoom', PLG_W); window.__plgZoomT = null; }, 500);
  };
  // rolagem normal é do navegador (trackpad, roda, barra); só Ctrl/Alt + roda (e a pinça) dão zoom
  document.addEventListener('wheel', (e) => {
    const g = e.target.closest && e.target.closest('.plg-dir'); if (!g || !(e.ctrlKey || e.altKey)) return;
    e.preventDefault(); zoom(e.ctrlKey ? Math.exp(-e.deltaY * 0.012) : (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX);
  }, { passive: false });
  document.addEventListener('scroll', (e) => { const t = e.target; if (!t || !t.classList || !t.classList.contains('plg-dir')) return;
    PLANO.ganttX = t.scrollLeft; const h = document.querySelector('[data-plg-titulo]'); if (h) { const tx = planoGanttTitulo(t.scrollLeft); if (h.textContent !== tx) h.textContent = tx; } }, true);
  // Safari/app do Mac: pinça chega como gesto
  let g0 = null;
  document.addEventListener('gesturestart', (e) => { if (!(e.target.closest && e.target.closest('.plg-dir'))) return; e.preventDefault(); g0 = PLG_W; });
  document.addEventListener('gesturechange', (e) => { if (g0 == null) return; e.preventDefault(); zoom((g0 * e.scale) / PLG_W, e.clientX || 0); });
  document.addEventListener('gestureend', () => { g0 = null; });
}
