/* Planejamento (seção 4 do doc "Ideias organizadas"), etapa 1:
   as horas que faltam em cada projeto ativo (estimado − real) são distribuídas na agenda livre até o prazo,
   prazo mais perto primeiro, até 8 h por dia útil (o dia pode ser esticado). Horários fixos: trabalho das 9h às 19h,
   almoço 12h–14h; às segundas, buscar o Rafa 11h30–14h. Feriados, férias e bloqueios avulsos ficam fora.
   Não grava nada sozinho: o plano é refeito a cada abertura, a partir do que já foi trabalhado. */
const PLANO_PADRAO = { inicio: 9, fim: 19, horasDia: 8, folga: 0.25 };
// horários fixos por dia da semana (0 = domingo): [início, fim, nome] em horas decimais
const PLANO_FIXOS = { 1: [[11.5, 14, 'Buscar o Rafa e almoço']], 2: [[12, 14, 'Almoço']], 3: [[12, 14, 'Almoço']], 4: [[12, 14, 'Almoço']], 5: [[12, 14, 'Almoço']] };
/* Sexta com o Rafa: semanas alternadas. 'planoSextaRef' = uma sexta com ele (a alternância sai dali);
   'planoSextas' = troca manual de uma sexta específica { 'AAAA-MM-DD': true/false }. */
function planoSextaRafa(dia) {
  const m = db.setting('planoSextas', {}) || {}; if (dia in m) return !!m[dia];
  const ref = db.setting('planoSextaRef', null); if (!ref) return false;
  const sem = Math.round((new Date(dia + 'T12:00:00') - new Date(ref + 'T12:00:00')) / (7 * 864e5));
  return sem % 2 === 0;
}
/* Todos os horários fixos do dia (doc, seção 4): almoço; segunda buscar o Rafa na escola; manhãs de terça e quinta
   (escola + academia); buscar o Rafa na casa da mãe (seg, qua e sexta alternada); jantar. Só aparecem dentro da grade. */
function planoFixosDoDia(dia) {
  const wd = new Date(dia + 'T12:00:00').getDay();
  const f = [...(PLANO_FIXOS[wd] || [])];
  if (wd === 2 || wd === 4) f.push([6.5, 8 + 40 / 60, 'Escola do Rafa e academia']);
  if (wd === 1 || wd === 3 || (wd === 5 && planoSextaRafa(dia))) f.push([19, 20, 'Buscar o Rafa']);
  if (wd >= 1 && wd <= 5) f.push([20, 21, 'Jantar']);
  return f;
}
const planoPins = () => db.setting('planoPins', []) || [];   // [{ id, dia, pid, ini, h }] blocos arrastados à mão

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
  const tira = [...planoFixosDoDia(dia), ...planoBloqueios().filter(b => b.dia === dia).map(b => [Number(b.ini), Number(b.fim), b.nome])].sort((a, b) => a[0] - b[0]);
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
    const cor = (pid) => { const pr = db.get('tempo_projects', pid); return hexOf(pr?.color || clientOf(pr)?.color || 'gray'); };
    // o que foi registrado no dia (intervalos trabalhados, sem as pausas), com a cor do projeto
    const d0 = new Date(dia + 'T00:00:00').getTime(), d1 = d0 + 864e5;
    const brutos = [];
    db.all('tempo_time_entries').forEach(e => (e.segments || []).forEach(sg => {
      if (!sg.s) return; const a = Math.max(d0, new Date(sg.s).getTime()), b = Math.min(d1, sg.e ? new Date(sg.e).getTime() : Date.now());
      if (b > a) brutos.push({ pid: e.project_id || null, a, b });
    }));
    brutos.sort((x, y) => x.a - y.a);
    // emenda trechos do mesmo projeto separados por pausas curtas (menos de 10 min), para ficar legível
    const feitos = [];
    brutos.forEach(x => { const l = feitos[feitos.length - 1]; if (l && l.pid === x.pid && x.a - l.b < 10 * 60e3) { l.b = Math.max(l.b, x.b); l.ms += x.b - x.a; } else feitos.push({ ...x, ms: x.b - x.a }); });
    const hDe = (t) => (t - d0) / 36e5;
    const fe = feitos.map(f => { const a = Math.max(hDe(f.a), top), b = Math.min(hDe(f.b), bot); if (b <= a) return ''; const pr = db.get('tempo_projects', f.pid); const c = f.pid ? cor(f.pid) : '#94A3B8';
      return `<div class="pl-feito" style="top:${(a - top) * altura}px;height:${Math.max(6, (b - a) * altura - 1)}px;--fc:${c}" data-tip="${esc(`Feito: ${pr?.name || 'Sem projeto'}${pr ? '\n' + (clientOf(pr)?.name || '') : ''}\n${planoHora(hDe(f.a))}–${planoHora(hDe(f.b))} · ${fmtH(f.ms)} trabalhado`)}"${f.pid ? ` data-act="proj-open" data-id="${f.pid}"` : ''}>${(b - a) * altura >= 30 ? `<b>${esc(pr?.name || 'Sem projeto')}</b><span>${fmtH(f.ms)}</span>` : ''}</div>`; }).join('');
    const bl = (v?.blocos || []).map(b => { const p = db.get('tempo_projects', b.pid); return `<div class="pl-bloco${b.atrasado ? ' late' : ''}${b.pin ? ' pin' : ''}" data-pl-pid="${b.pid}" data-pl-dia="${dia}" data-pl-ini="${b.ini}" data-pl-h="${b.h}" style="top:${(b.ini - top) * altura}px;height:${Math.max(16, b.h * altura - 2)}px;background:${cor(b.pid)};color:${textOn(cor(b.pid))}" data-tip="${esc(`${p?.name}\n${clientOf(p)?.name || ''}\n${planoHora(b.ini)}–${planoHora(b.fim)} · ${fmtH(b.h * 36e5)}${b.atrasado ? '\nDepois do prazo' : ''}`)}" data-act="proj-open" data-id="${b.pid}"><b>${esc(p?.name || '')}</b><span>${planoHora(b.ini)} · ${fmtH(b.h * 36e5)}${b.pin ? ' · fixado' : ''}</span>${b.pin ? `<button class="pl-unpin" data-act="pl-unpin" data-id="${b.pin}" title="Soltar: o app volta a encaixar este bloco sozinho" aria-label="Soltar bloco">×</button>` : ''}</div>`; }).join('');
    const fx = fixos.map(([a0, b0, n]) => { const a = Math.max(a0, top), b = Math.min(b0, bot); return b > a ? `<div class="pl-fixo" style="top:${(a - top) * altura}px;height:${(b - a) * altura - 2}px">${esc(n || 'Bloqueio')}</div>` : ''; }).join('');
    const h = v?.horas || 0;
    const wd = new Date(dia + 'T12:00:00').getDay();
    const sexta = wd === 5 && util ? `<button class="btn sm ghost pl-rafa${planoSextaRafa(dia) ? ' on' : ''}" data-act="pl-sexta" data-dia="${dia}" title="Buscar o Rafa nesta sexta (19h–20h)? Clique para trocar; as próximas sextas alternam a partir daqui.">Rafa ${planoSextaRafa(dia) ? '✓' : '–'}</button>` : '';
    return `<div class="pl-dia${dia === hoje ? ' hoje' : ''}${!util ? ' off' : ''}${(v?.cap || 0) > cfg.horasDia + 0.05 ? ' esticado' : ''}" data-pl-col="${dia}"><div class="pl-cab"><b>${new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</b>
      <span class="small ${h > cfg.horasDia + 0.05 ? 'late' : 'muted'}">${util ? `${fmtH(h * 36e5)}${est ? ` de ${est} h` : ''}` : 'folga'}</span>
      ${sexta}${util ? `<span class="pl-estica"><button class="btn sm ghost" data-act="pl-dia" data-dia="${dia}" data-d="-1" aria-label="Encurtar o dia" title="Encurtar o dia em 1 h">−</button><button class="btn sm ghost" data-act="pl-dia" data-dia="${dia}" data-d="1" aria-label="Esticar o dia" title="Esticar o dia em 1 h">+</button></span>` : ''}</div>
      <div class="pl-grade" style="height:${(bot - top) * altura}px">${fx}${fe}${bl}</div></div>`;
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
      <div class="small muted" style="margin-top:8px">${lista.length} projeto(s) com horas a fazer, distribuídas por prazo até ${cfg.horasDia} h por dia útil (9h–19h, almoço 12h–14h; segunda 11h30–14h com o Rafa; jantar 20h–21h; Rafa 19h–20h seg, qua e sexta alternada). Arraste um bloco para mudar o horário ou o dia; o × solta. Blocos claros com borda = o que já foi registrado, na cor do projeto. Feriados e férias ficam fora.${semEst.length ? ` ${semEst.length} projeto(s) ativo(s) sem horas estimadas não entram.` : ''}</div></div></div>
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

ACTIONS['pl-unpin'] = (el) => { db.setSetting('planoPins', planoPins().filter(p => p.id !== el.dataset.id)); render(); };
ACTIONS['pl-sexta'] = (el) => {
  const dia = el.dataset.dia; const novo = !planoSextaRafa(dia);
  // a alternância passa a contar desta sexta: com o Rafa aqui = referência aqui; sem = referência na semana seguinte
  const d = new Date(dia + 'T12:00:00'); if (!novo) d.setDate(d.getDate() + 7);
  db.setSetting('planoSextaRef', ymd(d));
  const m = { ...(db.setting('planoSextas', {}) || {}) }; delete m[dia]; db.setSetting('planoSextas', m);
  render();
};
/* Arrastar bloco: para cima/baixo muda o horário (de 15 em 15 min); para outra coluna muda o dia. Fica "fixado". */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  let d = null, arrastou = false;
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.pl-bloco[data-pl-pid]'); if (!b || e.target.closest('.pl-unpin')) return;
    d = { b, y0: e.clientY, x0: e.clientX, ini: Number(b.dataset.plIni), h: Number(b.dataset.plH), pid: b.dataset.plPid, dia: b.dataset.plDia };
    arrastou = false;
  });
  document.addEventListener('pointermove', (e) => {
    if (!d) return; const dy = e.clientY - d.y0, dx = e.clientX - d.x0;
    if (!arrastou && Math.hypot(dx, dy) < 5) return;
    arrastou = true; d.b.style.transform = `translate(${dx}px, ${dy}px)`; d.b.style.zIndex = 5; d.b.style.opacity = .85; d.b.style.pointerEvents = 'none';
  });
  document.addEventListener('pointerup', (e) => {
    if (!d) return; const x = d; d = null;
    if (!arrastou) return;
    x.b.style.pointerEvents = '';
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-pl-col]');
    const dia = col ? col.dataset.plCol : x.dia;
    const ini = Math.max(0, Math.min(23.75 - x.h, Math.round((x.ini + (e.clientY - x.y0) / 44) * 4) / 4));
    const pins = planoPins().filter(p => !(p.pid === x.pid && (p.dia === x.dia || p.dia === dia)));
    pins.push({ id: uid(), dia, pid: x.pid, ini, h: x.h });
    db.setSetting('planoPins', pins); render();
    toast(`Bloco fixado: ${fmtDate(dia)} às ${planoHora(ini)}`);
  });
  // o clique que termina um arrasto não abre o projeto
  document.addEventListener('click', (e) => { if (arrastou && e.target.closest && e.target.closest('.pl-bloco')) { e.stopPropagation(); e.preventDefault(); arrastou = false; } }, true);
})();
