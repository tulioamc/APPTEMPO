/* Planejamento (seção 4 do doc "Ideias organizadas"), etapa 1:
   as horas que faltam em cada projeto ativo (estimado − real) são distribuídas na agenda livre até o prazo,
   prazo mais perto primeiro, até 8 h por dia útil (o dia pode ser esticado). Horários fixos: trabalho das 9h às 19h,
   almoço 12h–14h; às segundas, buscar o Rafa 11h30–14h. Feriados, férias e bloqueios avulsos ficam fora.
   Não grava nada sozinho: o plano é refeito a cada abertura, a partir do que já foi trabalhado. */
const PLANO_PADRAO = { inicio: 9, fim: 19, horasDia: 8, folga: 0.25 };
// horários fixos por dia da semana (0 = domingo): [início, fim, nome] em horas decimais
const PLANO_FIXOS = { 1: [[11.5, 14, 'Buscar o Rafa e almoço']], 2: [[12, 14, 'Almoço']], 3: [[12, 14, 'Almoço']], 4: [[12, 14, 'Almoço']], 5: [[12, 14, 'Almoço']] };

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
  const tira = [...(PLANO_FIXOS[wd] || []), ...planoBloqueios().filter(b => b.dia === dia).map(b => [Number(b.ini), Number(b.fim), b.nome])].sort((a, b) => a[0] - b[0]);
  let jan = [[cfg.inicio, cfg.fim + Math.max(0, (planoEsticados()[dia] || cfg.horasDia) - cfg.horasDia)]];
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
    for (let [a, b] of jan) {
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

const PLANO = { semana: 0 };
const planoHora = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
VIEWS.plano = () => {
  const lista = planoProjetos(); const cfg = planoCfg();
  const { porDia, estouro } = planejar(lista);
  const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + PLANO.semana * 7);
  const dias = Array.from({ length: 5 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return ymd(d); });
  const hoje = ymd(new Date());
  const altura = 44;   // px por hora
  const top = cfg.inicio - 0.5, bot = cfg.fim + 3;
  const feitoHoje = {}; db.all('tempo_time_entries').filter(e => ymd(entryStart(e) || 0) === hoje).forEach(e => { feitoHoje[e.project_id] = (feitoHoje[e.project_id] || 0) + entryMs(e) / 36e5; });
  const col = (dia) => {
    const v = porDia[dia]; const util = planoDiaUtil(dia);
    const { fixos } = planoJanelas(dia, cfg);
    const est = planoEsticados()[dia];
    const cor = (pid) => hexOf(clientOf(db.get('tempo_projects', pid))?.color);
    const bl = (v?.blocos || []).map(b => { const p = db.get('tempo_projects', b.pid); return `<div class="pl-bloco${b.atrasado ? ' late' : ''}" style="top:${(b.ini - top) * altura}px;height:${Math.max(16, b.h * altura - 2)}px;background:${cor(b.pid)};color:${textOn(cor(b.pid))}" data-tip="${esc(`${p?.name}\n${clientOf(p)?.name || ''}\n${planoHora(b.ini)}–${planoHora(b.fim)} · ${fmtH(b.h * 36e5)}${b.atrasado ? '\nDepois do prazo' : ''}`)}" data-act="proj-open" data-id="${b.pid}"><b>${esc(p?.name || '')}</b><span>${planoHora(b.ini)} · ${fmtH(b.h * 36e5)}</span></div>`; }).join('');
    const fx = fixos.map(([a, b, n]) => `<div class="pl-fixo" style="top:${(a - top) * altura}px;height:${(b - a) * altura - 2}px">${esc(n || 'Bloqueio')}</div>`).join('');
    const h = v?.horas || 0;
    return `<div class="pl-dia${dia === hoje ? ' hoje' : ''}${!util ? ' off' : ''}"><div class="pl-cab"><b>${new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</b>
      <span class="small ${h > cfg.horasDia + 0.05 ? 'late' : 'muted'}">${util ? `${fmtH(h * 36e5)}${est ? ` de ${est} h` : ''}` : 'folga'}</span>
      ${util ? `<span class="pl-estica"><button class="btn sm ghost" data-act="pl-dia" data-dia="${dia}" data-d="-1" aria-label="Encurtar o dia" title="Encurtar o dia em 1 h">−</button><button class="btn sm ghost" data-act="pl-dia" data-dia="${dia}" data-d="1" aria-label="Esticar o dia" title="Esticar o dia em 1 h">+</button></span>` : ''}</div>
      <div class="pl-grade" style="height:${(bot - top) * altura}px">${fx}${bl}</div></div>`;
  };
  const horas = Array.from({ length: Math.ceil(bot - top) }, (_, i) => Math.ceil(top) + i).map(h => `<div class="pl-h" style="top:${(h - top) * altura}px">${String(h).padStart(2, '0')}h</div>`).join('');
  const planHoje = {}; (porDia[hoje]?.blocos || []).forEach(b => { planHoje[b.pid] = (planHoje[b.pid] || 0) + b.h; });
  const idsHoje = [...new Set([...Object.keys(planHoje), ...Object.keys(feitoHoje).filter(k => k !== 'null' && k !== 'undefined')])];
  const hojeHTML = idsHoje.length ? `<div class="panel"><div class="panel-h"><h3>Hoje: planejado × feito</h3></div><div class="panel-b"><div class="bars">${idsHoje.map(pid => { const p = db.get('tempo_projects', pid); const pl = (planHoje[pid] || 0) + (feitoHoje[pid] || 0); const f = feitoHoje[pid] || 0; return p ? `<div class="bar-row"><span class="lab">${esc(p.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${pl ? Math.min(100, f / pl * 100).toFixed(1) : 100}%;background:${hexOf(clientOf(p)?.color)}"></div></div><span class="mono small">${fmtH(f * 36e5)} de ${fmtH(pl * 36e5)}</span></div>` : ''; }).join('')}</div></div></div>` : '';
  const semEst = projects().filter(p => ['todo', 'active'].includes(statusCat(p.status_id)) && !(Number(p.estimated_hours) > 0));
  const html = `${estouro.length ? `<div class="panel" style="border-color:var(--warn)"><div class="panel-b small"><b>Não cabe no prazo:</b> ${estouro.map(x => `${esc(x.p.name)} (faltam ${fmtH(x.horas * 36e5)} até ${fmtDate(x.p.deadline)})`).join(' · ')}. Estique algum dia (+) ou mude o prazo.</div></div>` : ''}
    ${hojeHTML}
    <div class="panel"><div class="panel-h"><button class="btn sm" data-act="pl-sem" data-d="-1" aria-label="Semana anterior">${icon('chevL')}</button><h3>Semana de ${fmtDate(dias[0])}</h3><button class="btn sm" data-act="pl-sem" data-d="1" aria-label="Próxima semana">${icon('chevR')}</button>${PLANO.semana ? '<button class="btn sm ghost" data-act="pl-sem" data-d="0">Hoje</button>' : ''}<span class="grow"></span><button class="btn sm" data-act="pl-bloq">${icon('plus')} Bloqueio</button></div>
      <div class="panel-b"><div class="pl-semana"><div class="pl-horas" style="height:${(bot - top) * altura}px;margin-top:46px">${horas}</div>${dias.map(col).join('')}</div>
      <div class="small muted" style="margin-top:8px">${lista.length} projeto(s) com horas a fazer, distribuídas por prazo até ${cfg.horasDia} h por dia útil (9h–19h, almoço 12h–14h; segunda 11h30–14h com o Rafa). Feriados e férias ficam fora.${semEst.length ? ` ${semEst.length} projeto(s) ativo(s) sem horas estimadas não entram.` : ''}</div></div></div>
    ${planoBloqueios().filter(b => b.dia >= hoje).length ? `<div class="panel"><div class="panel-h"><h3>Bloqueios</h3></div><div class="panel-b stack" style="gap:4px">${planoBloqueios().filter(b => b.dia >= hoje).sort((a, b) => (a.dia + a.ini).localeCompare(b.dia + b.ini)).map(b => `<div class="row between small"><span>${fmtDate(b.dia)} · ${planoHora(b.ini)}–${planoHora(b.fim)} · ${esc(b.nome || 'Bloqueio')}</span><button class="btn sm ghost" data-act="pl-bloq-del" data-id="${b.id}" aria-label="Remover bloqueio">${icon('x')}</button></div>`).join('')}</div></div>` : ''}`;
  return { title: 'Planejamento', actions: '', html };
};
ACTIONS['pl-sem'] = (el) => { const d = Number(el.dataset.d); PLANO.semana = d ? PLANO.semana + d : 0; render(); };
ACTIONS['pl-dia'] = (el) => {
  const m = { ...planoEsticados() }; const cfg = planoCfg();
  const v = Math.max(0, Math.min(14, (m[el.dataset.dia] ?? cfg.horasDia) + Number(el.dataset.d)));
  if (v === cfg.horasDia) delete m[el.dataset.dia]; else m[el.dataset.dia] = v;
  db.setSetting('planoDias', m); render();
};
ACTIONS['pl-bloq-del'] = (el) => { db.setSetting('planoBloqueios', planoBloqueios().filter(b => b.id !== el.dataset.id)); render(); };
ACTIONS['pl-bloq'] = () => {
  const l = openLayer({ html: `<div class="dh"><h2>Novo bloqueio</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db grid2"><div class="field span2"><label for="pb-n">O quê</label><input id="pb-n" class="input" placeholder="Médico, reunião, compromisso…"></div>
    <div class="field span2"><label for="pb-d">Dia</label><input id="pb-d" type="date" class="input" value="${ymd(new Date())}"></div>
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
