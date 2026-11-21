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
const PLANO_ROTINA_PADRAO = [
  { grupo: 'acordar', nome: 'Acordar e arrumar o Rafa', ini: 5.5, fim: 6.5, dias: [2, 4] },
  { grupo: 'escola', nome: 'Levar o Rafa à escola', ini: 6.5, fim: 7, dias: [2, 4] },
  { grupo: 'academia', nome: 'Academia', ini: 7 + 20 / 60, fim: 8 + 20 / 60, dias: [2, 4] },
  { grupo: 'volta', nome: 'Volta para casa', ini: 8 + 20 / 60, fim: 8 + 40 / 60, dias: [2, 4] },
  { grupo: 'rafa-escola-seg', nome: 'Buscar o Rafa na escola', ini: 11.5, fim: 13.5, dias: [1] },
  { grupo: 'almoco-seg', nome: 'Almoço', ini: 13.5, fim: 14, dias: [1] },
  { grupo: 'almoco', nome: 'Almoço', ini: 12, fim: 14, dias: [2, 3, 4, 5] },
  { grupo: 'rafa-mae', nome: 'Buscar o Rafa na casa da mãe', ini: 19, fim: 20, dias: [1, 3] },
  { grupo: 'rafa-sexta', nome: 'Buscar o Rafa (sexta alternada)', ini: 19, fim: 20, dias: [5], repete: 'quinzenal' },
  { grupo: 'jantar', nome: 'Jantar', ini: 20, fim: 21, dias: [1, 2, 3, 4, 5] },
];
function planoRotina() {
  const r = db.setting('planoRotina', null);
  if (Array.isArray(r)) return r;
  const ref = db.setting('planoSextaRef', null);
  return PLANO_ROTINA_PADRAO.map(x => ({ id: 'pad-' + x.grupo, repete: 'semanal', desde: '2000-01-01', ate: null, ...x, ...(x.repete === 'quinzenal' ? { ref } : {}) }));
}
const planoRotinaDia = () => db.setting('planoRotinaDia', {}) || {};
/* A regra vale neste dia? (versão em vigor, dia da semana e, no quinzenal, semana certa) */
function planoRegraVale(r, dia) {
  if ((r.desde && dia < r.desde) || (r.ate && dia > r.ate)) return false;
  const wd = new Date(dia + 'T12:00:00').getDay(); if (!(r.dias || []).includes(wd)) return false;
  if (r.repete === 'quinzenal') { if (!r.ref) return false; const sem = Math.round((new Date(dia + 'T12:00:00') - new Date(r.ref + 'T12:00:00')) / (7 * 864e5)); return ((sem % 2) + 2) % 2 === 0; }
  return true;
}
/* Sexta com o Rafa (botão na coluna da sexta). */
function planoSextaRafa(dia) { return planoRotina().some(r => r.grupo === 'rafa-sexta' && planoRegraVale(r, dia)); }
/* Blocos fixos do dia: [ini, fim, nome, { grupo, rid, ajustado }] com os ajustes daquele dia. */
function planoFixosDoDia(dia) {
  const aj = planoRotinaDia()[dia] || {};
  return planoRotina().filter(r => planoRegraVale(r, dia)).map(r => {
    const a = aj[r.grupo]; if (a && a.off) return null;
    return [a ? Number(a.ini) : Number(r.ini), a ? Number(a.fim) : Number(r.fim), r.nome, { grupo: r.grupo, rid: r.id, ajustado: !!a }];
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
  return out.sort((x, y) => x.ini - y.ini);
}
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

const PLANO = { modo: null, semana: 0, dia: null, mesTop: null };
const planoHora = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const PL_ALT = 44;   // px por hora
const planoModo = () => PLANO.modo || db.setting('planoModo', 'semana');
const planoFer = (dia) => typeof feriadosDoAno === 'function' ? feriadosDoAno(Number(dia.slice(0, 4))).find(f => f.data === dia) : null;
const planoPrazos = (dia) => projects().filter(p => p.deadline === dia && ['todo', 'active'].includes(statusCat(p.status_id)));

/* Coluna de um dia com a grade de horas: fixos, compromissos (bloqueio/Google), o que foi feito e o planejado. */
function planoColHTML(dia, porDia, { top, bot, unico = false } = {}) {
  const cfg = planoCfg(); const v = porDia[dia]; const util = planoDiaUtil(dia); const hoje = ymd(new Date());
  const alt = PL_ALT; const y = (h) => (h - top) * alt;
  const fx = planoFixosDoDia(dia).map(([a0, b0, n, m]) => { const a = Math.max(a0, top), b = Math.min(b0, bot); if (b <= a) return '';
    return `<div class="pl-fixo${m.ajustado ? ' ajustado' : ''}" data-fx-g="${esc(m.grupo)}" data-fx-dia="${dia}" data-fx-ini="${a0}" data-fx-fim="${b0}" style="top:${y(a)}px;height:${(b - a) * alt - 2}px" data-tip="${esc(`${n}\n${planoHora(a0)}–${planoHora(b0)}${m.ajustado ? '\nMudado só neste dia' : ''}\nArraste para mudar só neste dia`)}"><span>${esc(n || '')}${(b - a) * alt >= 26 ? ` <em>${planoHora(a0)}–${planoHora(b0)}</em>` : ''}</span><span class="pl-fx-bt">${m.ajustado ? `<button data-act="pl-fixo-reset" data-dia="${dia}" data-g="${esc(m.grupo)}" title="Voltar ao horário da rotina" aria-label="Voltar ao padrão">↺</button>` : ''}<button data-act="pl-fixo-off" data-dia="${dia}" data-g="${esc(m.grupo)}" title="Tirar só deste dia" aria-label="Tirar deste dia">×</button></span></div>`; }).join('');
  const ev = planoEventos(dia).filter(e => !e.diaTodo).map(e => { const a = Math.max(e.ini, top), b = Math.min(e.fim, bot); if (b <= a) return '';
    return `<div class="pl-evento ${e.origem}" style="top:${y(a)}px;height:${Math.max(14, (b - a) * alt - 2)}px" data-tip="${esc(`${e.origem === 'google' ? 'Google Agenda' + (e.agenda ? ' · ' + e.agenda : '') : 'Bloqueio'}\n${e.titulo}\n${planoHora(e.ini)}–${planoHora(e.fim)}`)}">${icon(e.origem === 'google' ? 'calendar' : 'clock')}<span>${esc(e.titulo)}</span></div>`; }).join('');
  const fe = planoFeitosDoDia(dia).map(f => { const a = Math.max(f.ini, top), b = Math.min(f.fim, bot); if (b <= a) return ''; const pr = db.get('tempo_projects', f.pid);
    return `<div class="pl-feito" style="top:${y(a)}px;height:${Math.max(6, (b - a) * alt - 1)}px;--fc:${planoCor(f.pid)}" data-tip="${esc(`Feito: ${pr?.name || 'Sem projeto'}${pr ? '\n' + (clientOf(pr)?.name || '') : ''}\n${planoHora(f.ini)}–${planoHora(f.fim)} · ${fmtH(f.ms)} trabalhado`)}"${f.pid ? ` data-act="proj-open" data-id="${f.pid}"` : ''}>${(b - a) * alt >= 30 ? `<b>${esc(pr?.name || 'Sem projeto')}</b><span>${unico && pr ? esc(clientOf(pr)?.name || '') + ' · ' : ''}${fmtH(f.ms)}</span>` : ''}</div>`; }).join('');
  const bl = (v?.blocos || []).map(b => { const p = db.get('tempo_projects', b.pid); const c = planoCor(b.pid);
    return `<div class="pl-bloco${b.atrasado ? ' late' : ''}${b.pin ? ' pin' : ''}" data-pl-pid="${b.pid}" data-pl-dia="${dia}" data-pl-ini="${b.ini}" data-pl-h="${b.h}" style="top:${y(b.ini)}px;height:${Math.max(16, b.h * alt - 2)}px;background:${c};color:${textOn(c)}" data-tip="${esc(`Planejado: ${p?.name}\n${clientOf(p)?.name || ''}\n${planoHora(b.ini)}–${planoHora(b.fim)} · ${fmtH(b.h * 36e5)}${b.atrasado ? '\nDepois do prazo' : ''}${b.pin ? '\nFixado à mão' : '\nArraste para mudar o horário ou o dia'}`)}" data-act="proj-open" data-id="${b.pid}"><b>${esc(p?.name || '')}</b><span>${planoHora(b.ini)} · ${fmtH(b.h * 36e5)}${unico && p ? ' · ' + esc(clientOf(p)?.name || '') : ''}${b.pin ? ' · fixado' : ''}</span>${b.pin ? `<button class="pl-unpin" data-act="pl-unpin" data-id="${b.pin}" title="Soltar: o app volta a encaixar este bloco sozinho" aria-label="Soltar bloco">×</button>` : ''}</div>`; }).join('');
  const agora = dia === hoje ? (() => { const n = new Date(); const h = n.getHours() + n.getMinutes() / 60; return h > top && h < bot ? `<div class="pl-agora" style="top:${y(h)}px"></div>` : ''; })() : '';
  const h = v?.horas || 0, est = planoEsticados()[dia], fer = planoFer(dia);
  const wd = new Date(dia + 'T12:00:00').getDay();
  const sexta = wd === 5 && util ? `<button class="btn sm ghost pl-rafa${planoSextaRafa(dia) ? ' on' : ''}" data-act="pl-sexta" data-dia="${dia}" title="Buscar o Rafa nesta sexta (19h–20h)? Clique para trocar; as próximas sextas alternam a partir daqui.">Rafa ${planoSextaRafa(dia) ? '✓' : '–'}</button>` : '';
  const cab = unico ? '' : `<div class="pl-cab"><button class="pl-cab-dia" data-act="pl-ir-dia" data-dia="${dia}" title="Ver o dia">${new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</button>
      <span class="small ${h > cfg.horasDia + 0.05 ? 'late' : 'muted'}">${util ? `${fmtH(h * 36e5)}${est ? ` de ${est} h` : ''}` : (fer ? esc(fer.nome) : 'folga')}</span>
      ${sexta}${util ? `<span class="pl-estica"><button class="btn sm ghost" data-act="pl-dia" data-dia="${dia}" data-d="-1" aria-label="Encurtar o dia" title="Encurtar o dia em 1 h">−</button><button class="btn sm ghost" data-act="pl-dia" data-dia="${dia}" data-d="1" aria-label="Esticar o dia" title="Esticar o dia em 1 h">+</button></span>` : ''}</div>`;
  return `<div class="pl-dia${dia === hoje ? ' hoje' : ''}${!util ? ' off' : ''}${(v?.cap || 0) > cfg.horasDia + 0.05 ? ' esticado' : ''}" data-pl-col="${dia}">${cab}<div class="pl-grade" style="height:${(bot - top) * alt}px">${fx}${ev}${fe}${bl}${agora}</div></div>`;
}
const planoRegua = (top, bot, mt = 46) => `<div class="pl-horas" style="height:${(bot - top) * PL_ALT}px;margin-top:${mt}px">${Array.from({ length: Math.ceil(bot - top) }, (_, i) => Math.ceil(top) + i).map(h => `<div class="pl-h" style="top:${(h - top) * PL_ALT}px">${String(h).padStart(2, '0')}h</div>`).join('')}</div>`;

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
    html += dias.map(dia => {
      const dt = new Date(dia + 'T12:00:00'); const n = dt.getDate(); const util = planoDiaUtil(dia); const fer = planoFer(dia);
      const plan = planoSomaPor(porDia[dia]?.blocos || []); const feito = planoSomaPor(planoFeitosDoDia(dia), 'ms');
      const pids = [...new Set([...Object.keys(feito), ...Object.keys(plan)])].sort((a, b) => ((feito[b] || 0) + (plan[b] || 0)) - ((feito[a] || 0) + (plan[a] || 0)));
      const linhas = pids.slice(0, 3).map(pid => { const p = db.get('tempo_projects', pid); const f = feito[pid] || 0, pl = plan[pid] || 0;
        return `<div class="pl-mc-l" style="--fc:${planoCor(pid === '_' ? null : pid)}"><i class="${f && !pl ? 'f' : !f ? 'p' : 'fp'}"></i><span>${esc(p?.name || 'Sem projeto')}</span><em>${f ? fmtH(f * 36e5) : ''}${f && pl ? ' + ' : ''}${pl ? fmtH(pl * 36e5) : ''}</em></div>`; }).join('');
      const ev = planoEventos(dia); const prz = planoPrazos(dia);
      const tf = Object.values(feito).reduce((a, b) => a + b, 0), tp = Object.values(plan).reduce((a, b) => a + b, 0);
      const mesPar = (dt.getMonth() % 2) === 0;
      return `<div class="pl-mc${mesPar ? ' par' : ''}${dia === hoje ? ' hoje' : ''}${!util ? ' off' : ''}${dia < hoje ? ' passado' : ''}" data-act="pl-ir-dia" data-dia="${dia}"${dia === hoje ? ' data-hoje="1"' : ''}>
        <div class="pl-mc-n"><b>${n === 1 ? dt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '') : n}</b>${tf + tp > 0 ? `<span class="${tf + tp > cfg.horasDia + 0.05 ? 'late' : ''}" data-tip="${esc(`Feito ${fmtH(tf * 36e5)} · planejado ${fmtH(tp * 36e5)}`)}">${fmtH((tf + tp) * 36e5)}</span>` : ''}</div>
        ${fer ? `<div class="pl-mc-fer">${esc(fer.nome)}</div>` : ''}
        ${prz.map(p => `<div class="pl-mc-prazo" data-tip="Prazo do projeto">${icon('flag')} ${esc(p.name)}</div>`).join('')}
        ${ev.slice(0, 2).map(e => `<div class="pl-mc-ev ${e.origem}">${e.diaTodo ? '' : planoHora(e.ini) + ' '}${esc(e.titulo)}</div>`).join('')}${ev.length > 2 ? `<div class="pl-mc-mais">+${ev.length - 2} compromisso(s)</div>` : ''}
        ${linhas}${pids.length > 3 ? `<div class="pl-mc-mais">+${pids.length - 3} projeto(s)</div>` : ''}
      </div>`;
    }).join('');
  }
  return `<div class="pl-mes-cab">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="pl-mes-scroll" data-pl-mes><div class="pl-mes">${html}</div></div>
    <div class="pl-legenda small muted"><span><i class="f"></i> feito</span><span><i class="p"></i> planejado</span><span><i class="fp"></i> os dois</span><span>${icon('flag')} prazo</span><span class="pl-mc-ev google">Google Agenda</span><span class="pl-mc-ev bloqueio">bloqueio</span> · clique num dia para abrir</div>`;
}

/* Dia: a grade grande e, ao lado, o resumo (planejado × feito por projeto, compromissos, prazos). */
function planoDiaHTML(dia, porDia) {
  const cfg = planoCfg();
  const top = 0, bot = 24;   // dia inteiro, 0h–24h
  const plan = planoSomaPor(porDia[dia]?.blocos || []); const feito = planoSomaPor(planoFeitosDoDia(dia), 'ms');
  const pids = [...new Set([...Object.keys(feito), ...Object.keys(plan)])];
  const linhas = pids.map(pid => { const p = db.get('tempo_projects', pid); const f = feito[pid] || 0, pl = plan[pid] || 0; const tot = f + pl;
    return `<div class="bar-row"><span class="lab">${esc(p?.name || 'Sem projeto')}</span><div class="bar-track"><div class="bar-fill" style="width:${tot ? (f / tot * 100).toFixed(1) : 0}%;background:${planoCor(pid === '_' ? null : pid)}"></div></div><span class="mono small">${fmtH(f * 36e5)} feito${pl ? ` + ${fmtH(pl * 36e5)} plano` : ''}</span></div>`; }).join('');
  const ev = planoEventos(dia), prz = planoPrazos(dia), fer = planoFer(dia);
  const lado = `<div class="stack" style="gap:12px">
    ${fer ? `<div class="banner info small">${esc(fer.nome)} (feriado)</div>` : ''}
    <div><div class="lbl">Projetos do dia</div>${linhas ? `<div class="bars">${linhas}</div>` : '<div class="small muted">Nada registrado nem planejado.</div>'}</div>
    ${prz.length ? `<div><div class="lbl">Prazos</div>${prz.map(p => `<div class="small">${icon('flag')} ${esc(p.name)}</div>`).join('')}</div>` : ''}
    <div><div class="lbl">Compromissos</div>${ev.length ? ev.map(e => `<div class="small row between"><span>${e.diaTodo ? 'Dia todo' : planoHora(e.ini) + '–' + planoHora(e.fim)} · ${esc(e.titulo)} <span class="faint">${e.origem === 'google' ? 'Google' : 'bloqueio'}</span></span>${e.origem === 'bloqueio' ? `<button class="btn sm ghost" data-act="pl-bloq-del" data-id="${e.id}" aria-label="Remover bloqueio">${icon('x')}</button>` : ''}</div>`).join('') : '<div class="small muted">Nenhum. Os eventos do Google Agenda vão aparecer aqui quando a integração for ligada.</div>'}
      <button class="btn sm" style="margin-top:6px" data-act="pl-bloq" data-dia="${dia}">${icon('plus')} Bloqueio</button></div>
  </div>`;
  return `<div class="pl-diaview"><div class="pl-scroll" data-pl-scroll><div class="pl-semana pl-um">${planoRegua(top, bot, 0)}${planoColHTML(dia, porDia, { top, bot, unico: true })}</div></div>${lado}</div>`;
}

VIEWS.plano = () => {
  const lista = planoProjetos(); const cfg = planoCfg(); const modo = planoModo();
  const { porDia, estouro } = planejar(lista, new Date(), modo === 'mes' ? 220 : 60);
  const hoje = ymd(new Date()); const dia = PLANO.dia || hoje;
  const semEst = projects().filter(p => ['todo', 'active'].includes(statusCat(p.status_id)) && !(Number(p.estimated_hours) > 0));
  const seg = `<div class="seg">${[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, l]) => `<button class="${modo === k ? 'on' : ''}" data-act="pl-modo" data-m="${k}">${l}</button>`).join('')}</div>`;
  let titulo, nav, corpo;
  if (modo === 'dia') {
    titulo = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
    nav = `<button class="btn sm" data-act="pl-nav" data-d="-1" aria-label="Dia anterior">${icon('chevL')}</button><button class="btn sm" data-act="pl-nav" data-d="1" aria-label="Próximo dia">${icon('chevR')}</button>${dia !== hoje ? '<button class="btn sm ghost" data-act="pl-nav" data-d="0">Hoje</button>' : ''}`;
    corpo = planoDiaHTML(dia, porDia);
  } else if (modo === 'mes') {
    titulo = 'Calendário'; nav = `<button class="btn sm ghost" data-act="pl-mes-hoje">Hoje</button>`;
    corpo = planoMesHTML(porDia);
  } else {
    const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + PLANO.semana * 7);
    const dias = Array.from({ length: 5 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return ymd(d); });
    const top = 0, bot = 24;   // dia inteiro, 0h–24h
    titulo = `Semana de ${fmtDate(dias[0])}`;
    nav = `<button class="btn sm" data-act="pl-sem" data-d="-1" aria-label="Semana anterior">${icon('chevL')}</button><button class="btn sm" data-act="pl-sem" data-d="1" aria-label="Próxima semana">${icon('chevR')}</button>${PLANO.semana ? '<button class="btn sm ghost" data-act="pl-sem" data-d="0">Hoje</button>' : ''}`;
    corpo = `<div class="pl-scroll" data-pl-scroll><div class="pl-semana">${planoRegua(top, bot)}${dias.map(d => planoColHTML(d, porDia, { top, bot })).join('')}</div></div>`;
  }
  const nota = `${lista.length} projeto(s) com horas a fazer, distribuídas por prazo até ${cfg.horasDia} h por dia útil. Cheio = planejado (arraste para mudar horário ou dia; × solta) · claro com borda = registrado · tracejado = compromisso (bloqueio ou Google Agenda).${semEst.length ? ` ${semEst.length} projeto(s) ativo(s) sem horas estimadas não entram.` : ''}`;
  const html = `${estouro.length ? `<div class="panel" style="border-color:var(--warn)"><div class="panel-b small"><b>Não cabe no prazo:</b> ${estouro.map(x => `${esc(x.p.name)} (faltam ${fmtH(x.horas * 36e5)} até ${fmtDate(x.p.deadline)})`).join(' · ')}. Estique algum dia (+) ou mude o prazo.</div></div>` : ''}
    <div class="panel"><div class="panel-h">${seg}${nav}<h3>${esc(titulo)}</h3><span class="grow"></span><button class="btn sm" data-act="pl-bloq">${icon('plus')} Bloqueio</button></div>
      <div class="panel-b">${corpo}<div class="small muted" style="margin-top:8px">${nota}</div></div></div>
    ${planoRotinaHTML()}`;
  if (modo === 'mes') setTimeout(planoMesRolar, 0); else setTimeout(planoGradeRolar, 0);
  return { title: 'Planejamento', actions: '', html };
};
/* Grade de 24 h: abre perto das 5h (ou uma hora antes de agora, se for mais tarde) e depois guarda a rolagem. */
function planoGradeRolar() {
  const sc = typeof document !== 'undefined' && document.querySelector && document.querySelector('[data-pl-scroll]'); if (!sc) return;
  if (PLANO.gradeTop == null) { const n = new Date(); PLANO.gradeTop = Math.max(0, Math.min(5, n.getHours() - 1)) * PL_ALT; }
  sc.scrollTop = PLANO.gradeTop;
  if (!sc._plScroll) { sc._plScroll = true; sc.addEventListener('scroll', () => { PLANO.gradeTop = sc.scrollTop; }, { passive: true }); }
}
/* Mês: volta para onde estava (ou para a semana de hoje na primeira vez) e guarda a rolagem. */
function planoMesRolar(forcarHoje = false) {
  const sc = typeof document !== 'undefined' && document.querySelector && document.querySelector('[data-pl-mes]'); if (!sc) return;
  if (forcarHoje || PLANO.mesTop == null) { const h = sc.querySelector('[data-hoje]'); if (h) sc.scrollTop = Math.max(0, h.offsetTop - 70); }
  else sc.scrollTop = PLANO.mesTop;
  if (!sc._plScroll) { sc._plScroll = true; sc.addEventListener('scroll', () => { PLANO.mesTop = sc.scrollTop; }, { passive: true }); }
}
ACTIONS['pl-modo'] = (el) => { PLANO.modo = el.dataset.m; db.setSetting('planoModo', el.dataset.m); render(); };
ACTIONS['pl-ir-dia'] = (el) => { if (window._plArrastou) return; PLANO.dia = el.dataset.dia; PLANO.modo = 'dia'; render(); };
ACTIONS['pl-nav'] = (el) => { const d = Number(el.dataset.d); if (!d) PLANO.dia = null; else { const x = new Date((PLANO.dia || ymd(new Date())) + 'T12:00:00'); x.setDate(x.getDate() + d); PLANO.dia = ymd(x); } render(); };
ACTIONS['pl-mes-hoje'] = () => planoMesRolar(true);
ACTIONS['pl-sem'] = (el) => { const d = Number(el.dataset.d); PLANO.semana = d ? PLANO.semana + d : 0; render(); };
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
ACTIONS['pl-sexta'] = (el) => {
  const dia = el.dataset.dia; const novo = !planoSextaRafa(dia);
  // a alternância passa a contar desta sexta: com o Rafa aqui = referência aqui; sem = referência na semana seguinte
  const d = new Date(dia + 'T12:00:00'); if (!novo) d.setDate(d.getDate() + 7);
  planoRotinaSalvar(planoRotina().map(r => r.grupo === 'rafa-sexta' && !r.ate ? { ...r, ref: ymd(d) } : r));
  render();
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
    <select class="input sm" data-on="pl-rot" data-id="${r.id}" data-f="repete" aria-label="Repete"><option value="semanal" ${r.repete !== 'quinzenal' ? 'selected' : ''}>Toda semana</option><option value="quinzenal" ${r.repete === 'quinzenal' ? 'selected' : ''}>A cada 2 semanas</option></select>
    <button class="btn sm ghost icon" data-act="pl-rot-del" data-id="${r.id}" title="Tirar da rotina de hoje em diante" aria-label="Tirar">${icon('x')}</button></div>`;
  return `<div class="panel"><div class="panel-h"><h3>Rotina fixa</h3><span class="small muted">mudanças valem de hoje em diante; o passado não muda. Para mexer num dia só, arraste o bloco no calendário.</span><span class="grow"></span><button class="btn sm" data-act="pl-rot-novo">${icon('plus')} Bloco fixo</button></div>
    <div class="panel-b"><div class="pl-rot-cab small muted"><span>Bloco</span><span>Dias</span><span>Começa</span><span>Termina</span><span>Repete</span><span></span></div>${ativos.map(linha).join('')}</div></div>`;
}
CHANGES['pl-rot'] = (el) => {
  const f = el.dataset.f; let v = el.value;
  if (f === 'ini' || f === 'fim') { v = planoHoraDe(v); if (v == null) return; }
  if (f === 'nome') v = v.trim() || 'Bloco fixo';
  const patch = { [f]: v };
  if (f === 'repete' && v === 'quinzenal') patch.ref = ymd(new Date());
  planoRotinaMudar(el.dataset.id, patch); render();
};
ACTIONS['pl-rot-dia'] = (el) => { const r = planoRotina().find(x => x.id === el.dataset.id); if (!r) return; const wd = Number(el.dataset.wd); const dias = (r.dias || []).includes(wd) ? r.dias.filter(x => x !== wd) : [...(r.dias || []), wd].sort(); planoRotinaMudar(r.id, { dias }); render(); };
ACTIONS['pl-rot-del'] = (el) => { const ontem = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); })(); const hoje = ymd(new Date());
  planoRotinaSalvar(planoRotina().flatMap(r => r.id !== el.dataset.id ? [r] : (r.desde || '') >= hoje ? [] : [{ ...r, ate: ontem }])); render(); toast('Bloco tirado da rotina de hoje em diante'); };
ACTIONS['pl-rot-novo'] = () => { planoRotinaSalvar([...planoRotina(), { id: uid(), grupo: uid(), nome: 'Novo bloco', ini: 15, fim: 16, dias: [1, 2, 3, 4, 5], repete: 'semanal', desde: ymd(new Date()), ate: null }]); render(); };
/* Ajuste de um dia só: tirar o bloco fixo daquele dia, ou voltar ao padrão. */
ACTIONS['pl-fixo-off'] = (el) => { const m = { ...planoRotinaDia() }; m[el.dataset.dia] = { ...(m[el.dataset.dia] || {}), [el.dataset.g]: { off: true } }; db.setSetting('planoRotinaDia', m); render(); toast('Tirado só deste dia'); };
ACTIONS['pl-fixo-reset'] = (el) => { const m = { ...planoRotinaDia() }; const d = { ...(m[el.dataset.dia] || {}) }; delete d[el.dataset.g]; m[el.dataset.dia] = d; db.setSetting('planoRotinaDia', m); render(); };
/* Arrastar bloco: para cima/baixo muda o horário (de 15 em 15 min); para outra coluna muda o dia. Fica "fixado". */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  let d = null, arrastou = false;
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.pl-unpin, .pl-fx-bt')) return;
    const fx = e.target.closest && e.target.closest('.pl-fixo[data-fx-g]');
    if (fx) { d = { b: fx, fixo: true, y0: e.clientY, x0: e.clientX, ini: Number(fx.dataset.fxIni), h: Number(fx.dataset.fxFim) - Number(fx.dataset.fxIni), g: fx.dataset.fxG, dia: fx.dataset.fxDia }; arrastou = false; return; }
    const b = e.target.closest && e.target.closest('.pl-bloco[data-pl-pid]'); if (!b) return;
    d = { b, y0: e.clientY, x0: e.clientX, ini: Number(b.dataset.plIni), h: Number(b.dataset.plH), pid: b.dataset.plPid, dia: b.dataset.plDia };
    arrastou = false;
  });
  document.addEventListener('pointermove', (e) => {
    if (!d) return; const dy = e.clientY - d.y0, dx = e.clientX - d.x0;
    if (!arrastou && Math.hypot(dx, dy) < 5) return;
    arrastou = true; d.b.style.transform = d.fixo ? `translateY(${dy}px)` : `translate(${dx}px, ${dy}px)`; d.b.style.zIndex = 5; d.b.style.opacity = .85; d.b.style.pointerEvents = 'none';
  });
  document.addEventListener('pointerup', (e) => {
    if (!d) return; const x = d; d = null;
    if (!arrastou) return;
    x.b.style.pointerEvents = '';
    if (x.fixo) {
      // bloco da rotina: muda só neste dia, mantendo a duração
      const ini = Math.max(0, Math.min(24 - x.h, Math.round((x.ini + (e.clientY - x.y0) / PL_ALT) * 4) / 4));
      const m = { ...planoRotinaDia() }; m[x.dia] = { ...(m[x.dia] || {}), [x.g]: { ini, fim: ini + x.h } };
      db.setSetting('planoRotinaDia', m); render(); toast(`Só neste dia: ${planoHora(ini)}–${planoHora(ini + x.h)}`); return;
    }
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-pl-col]');
    const dia = col ? col.dataset.plCol : x.dia;
    const ini = Math.max(0, Math.min(23.75 - x.h, Math.round((x.ini + (e.clientY - x.y0) / PL_ALT) * 4) / 4));
    const pins = planoPins().filter(p => !(p.pid === x.pid && (p.dia === x.dia || p.dia === dia)));
    pins.push({ id: uid(), dia, pid: x.pid, ini, h: x.h });
    db.setSetting('planoPins', pins); render();
    toast(`Bloco fixado: ${fmtDate(dia)} às ${planoHora(ini)}`);
  });
  // o clique que termina um arrasto não abre o projeto
  document.addEventListener('click', (e) => { if (arrastou && e.target.closest && e.target.closest('.pl-bloco, .pl-fixo')) { e.stopPropagation(); e.preventDefault(); arrastou = false; } }, true);
})();
