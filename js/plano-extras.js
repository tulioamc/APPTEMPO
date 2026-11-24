/* Calendário — extras: bandeja de tarefas para arrastar até a grade e clique na barra do Gantt abrindo a tarefa. */

/* Tarefas abertas (suas, com previsão) na ordem do plano; o tamanho do bloco é o que falta, de 15 em 15 min (máx. 8 h). */
function planoBandejaLista() {
  let m; try { m = tkMotor(new Date(), 60); } catch (e) { return []; }
  return Object.values(m.itens).filter(x => x.t && x.eu && x.pid && (x.resto || 0) > 0)
    .sort((a, b) => String(a.blocos?.[0] ? a.blocos[0].dia + (Number(a.blocos[0].ini) || 0).toFixed(3).padStart(7, '0') : 'z').localeCompare(String(b.blocos?.[0] ? b.blocos[0].dia + (Number(b.blocos[0].ini) || 0).toFixed(3).padStart(7, '0') : 'z'))).slice(0, 14)
    .map(x => ({ tid: x.t.id, pid: x.pid, nome: x.t.name, h: Math.max(0.25, Math.min(8, Math.round(x.resto / 15) / 4)) }));
}
const planoBandejaBtn = (modo) => (modo === 'dia' || modo === 'semana')
  ? `<button class="btn sm ghost${PLANO.bandeja ? ' on' : ''}" data-act="pl-bandeja" data-tip="Mostra suas tarefas para você arrastar até um horário da grade">${icon('plus')} Tarefas</button>` : '';
function planoBandejaHTML() {
  if (!PLANO.bandeja) return '';
  const l = planoBandejaLista();
  return `<div class="pl-bandeja"><span class="small muted">Arraste uma tarefa até o horário que quiser:</span>${l.map(x => `<span class="pl-bj" draggable="true" data-bj="${x.tid}" data-pid="${x.pid}" data-h="${x.h}" style="--fc:${planoCor(x.pid)}" data-tip="${esc((db.get('tempo_projects', x.pid)?.name || '') + ' · ' + fmtH(x.h * 36e5))}"><i></i>${esc(x.nome)}<em>${fmtH(x.h * 36e5)}</em></span>`).join('') || '<span class="small muted">Nenhuma tarefa aberta com tempo previsto.</span>'}</div>`;
}
ACTIONS['pl-bandeja'] = () => { PLANO.bandeja = !PLANO.bandeja; render(); };

/* Solta a tarefa na grade: vira um bloco fixado naquele horário (substitui os blocos fixados antigos dela); quem estava ali vai para depois. */
function planoSoltarTarefa(tid, pid, h, dia, ini) {
  const hoje = ymd(new Date()); h = Math.max(0.25, Math.min(24, Number(h) || 1)); ini = Math.max(0, Math.min(24 - h, Math.round(ini * 4) / 4));
  if (dia < hoje) { toast('Esse dia já passou.'); return false; }
  return planoMudar('Tarefa encaixada', () => {
    const base = planoPins().filter(p => !(p.tid === tid && p.dia >= hoje));
    const r = planoEmpurrar(base, [{ dia, ini, fim: ini + h }], planoOcupadosDoDia, { proximoDia: planoProximoUtil });
    planoPinsSalvar([...r.base, ...r.empurrados, { id: uid(), dia, pid, tid, ini, h }]);
  }, `Encaixada: ${fmtDate(dia)} ${planoHora(ini)}–${planoHora(ini + h)}`);
}
if (typeof document !== 'undefined' && document.addEventListener) {
  let arrasta = null;
  document.addEventListener('dragstart', (e) => { const b = e.target.closest?.('[data-bj]'); if (!b) return; arrasta = { tid: b.dataset.bj, pid: b.dataset.pid, h: Number(b.dataset.h) }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', b.dataset.bj); } catch (x) { /* ok */ } });
  document.addEventListener('dragend', () => { arrasta = null; document.querySelectorAll?.('.pl-drop').forEach(g => g.classList.remove('pl-drop')); });
  document.addEventListener('dragover', (e) => { if (!arrasta) return; const g = e.target.closest?.('.pl-grade'); if (!g) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
  document.addEventListener('drop', (e) => {
    if (!arrasta) return; const g = e.target.closest?.('.pl-grade'); const col = g?.closest('[data-pl-col]'); if (!col) return;
    e.preventDefault(); const a = arrasta; arrasta = null;
    planoSoltarTarefa(a.tid, a.pid, a.h, col.dataset.plCol, (e.clientY - g.getBoundingClientRect().top) / PL_ALT);
  });
  // clique na barra do Gantt (sem arrastar) abre a tarefa na lista do projeto
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.plg-bar[data-plg]'); if (!b || window.__plgMoved) return;
    const t = db.get('tempo_tasks', b.dataset.plg); if (t) ACTIONS['proj-open']({ dataset: { id: t.project_id, tab: 'tasks', tk: t.id } });
  });
}

/* Espaço + arrastar (como no Illustrator): com o mouse sobre o Gantt ou a grade do Calendário, segurar a barra de espaço vira a mãozinha. */
if (typeof document !== 'undefined' && document.addEventListener) {
  let espaco = false, pan = null;
  const alvo = (el) => el && el.closest ? el.closest('.plg-dir, [data-pl-scroll], .pl-mes-scroll') : null;
  const digitando = (el) => el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]');
  const sobre = () => [...document.querySelectorAll('.plg-dir, [data-pl-scroll], .pl-mes-scroll')].find(x => x.matches(':hover'));
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || digitando(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!espaco && !sobre()) return;   // fora do Calendário, o espaço continua sendo o espaço de sempre
    e.preventDefault(); if (e.repeat) return; espaco = true; document.body.classList.add('pl-mao');
  });
  document.addEventListener('keyup', (e) => { if (e.code !== 'Space') return; espaco = false; document.body.classList.remove('pl-mao', 'pl-mao-on'); });
  window.addEventListener('blur', () => { espaco = false; pan = null; document.body.classList.remove('pl-mao', 'pl-mao-on'); });
  document.addEventListener('pointerdown', (e) => {
    if (!espaco || e.button !== 0) return; const c = alvo(e.target); if (!c) return;
    e.preventDefault(); e.stopImmediatePropagation();   // nada por baixo (bloco, barra, clique) reage enquanto a mão está ativa
    pan = { c, x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop, wy: window.scrollY, gantt: c.classList.contains('plg-dir') };
    document.body.classList.add('pl-mao-on'); try { c.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!pan) return; e.preventDefault();
    pan.c.scrollLeft = pan.sl - (e.clientX - pan.x);
    if (pan.gantt) window.scrollTo(window.scrollX, pan.wy - (e.clientY - pan.y)); else pan.c.scrollTop = pan.st - (e.clientY - pan.y);
  }, true);
  const solta = (e) => { if (!pan) return; pan = null; document.body.classList.remove('pl-mao-on'); window.__plgMoved = true; setTimeout(() => { window.__plgMoved = false; }, 150); e.stopImmediatePropagation(); };
  document.addEventListener('pointerup', solta, true); document.addEventListener('pointercancel', solta, true);
  document.addEventListener('click', (e) => { if (espaco || window.__plgMoved && alvo(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}

/* Depois de soltar um bloco: se o app não vai usá-lo porque a tarefa espera outra (dependência), avisa na hora e oferece tirar a espera. */
function planoAvisaSobra(ids) {
  try {
    const m = tkMotor(new Date(), 60);
    const sob = (m.pinsSobra || []).filter(p => ids.has(p.pin) && /^antes:/.test(p.motivo || ''));
    if (!sob.length) return;
    const p = sob[0], t = db.get('tempo_tasks', p.tid), espera = String(p.motivo).slice(6);
    const dep = t && (t.depends_on || []).map(i => db.get('tempo_tasks', i)).find(d => d && d.name === espera);
    toast(`Esse bloco não vale ainda: “${t ? t.name : 'a tarefa'}” espera “${espera}” terminar. O app só usa o horário depois disso.`, { ms: 15000, actions: dep ? [{ label: `Tirar a espera de “${espera}”`, run: () => { db.update('tempo_tasks', t.id, { depends_on: (t.depends_on || []).filter(i => i !== dep.id) }); db.emit(); render(); toast('Espera removida'); } }] : [] });
  } catch (_) { /* aviso é só ajuda */ }
}

/* Prévia ao arrastar (24/11): enquanto você segura um bloco planejado, os outros blocos da MESMA semana (ou do dia, no Dia)
   deslizam para onde vão ficar se você soltar ali. Os mais perto do bloco andam primeiro; cada um seguinte espera 1/24 s.
   É só "e se": usa a mesma conta do soltar (empurra os fixados que batem, refaz o plano), sem gravar nada.
   Outras semanas não animam (seria movimento demais). Soltar ou cancelar redesenha tudo como fica de verdade. */
let _pv = null;
function planoSemanaDe(dia) { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const a = ymd(d); d.setDate(d.getDate() + 6); return [a, ymd(d)]; }
function planoPrevia(d, e, a, b) {
  if (typeof document === 'undefined' || !d || !d.el) return;
  d.el.style.pointerEvents = 'none';
  const col = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-pl-col]');
  const dia = d.modo === 'move' && col ? col.dataset.plCol : d.dia;
  const chave = `${dia}|${a}|${b}`; if (_pv && _pv.chave === chave) return;
  _pv = { ...(_pv || {}), chave, d };
  clearTimeout(_pv.t); _pv.t = setTimeout(() => planoPreviaCalc(d, dia, a, b, chave), 70);
}
function planoPreviaCalc(d, dia, a, b, chave) {
  if (!_pv || _pv.chave !== chave) return;
  let porDia;
  try {
    const meus = (d.el.dataset.pin || '').split(',').filter(Boolean);
    const outros = planoPins().filter(p => !meus.includes(p.id));
    const r = planoEmpurrar(outros, [{ dia, ini: a, fim: b }], planoOcupadosDoDia, { proximoDia: planoProximoUtil });
    const pins = [...r.base, ...r.empurrados, { id: '__pv', dia, pid: d.el.dataset.pid, tid: d.el.dataset.tid || null, ini: a, h: b - a }];
    porDia = tkMotor(new Date(), 60, { pins }).porDia;
  } catch (_) { return; }   // prévia é só ajuda: se a conta falhar, não mexe em nada
  const [s0, s1] = planoSemanaDe(d.dia);
  const els = [...document.querySelectorAll('.pl-bloco[data-dia]')].filter(el => el !== d.el && el.dataset.dia >= s0 && el.dataset.dia <= s1 && !el.closest('.pl-dg-fly'));
  // pares velho → novo: mesma tarefa (ou projeto) no mesmo dia, na ordem do horário
  const chaveDe = (pid, tid) => tid ? 't:' + tid : 'p:' + pid;
  const grupos = {};
  els.forEach(el => { const k = el.dataset.dia + '|' + chaveDe(el.dataset.pid, el.dataset.tid); (grupos[k] ||= { velhos: [], novos: [] }).velhos.push(el); });
  Object.entries(porDia || {}).forEach(([dd, v]) => (v.blocos || []).forEach(bl => { if (bl.pins && bl.pins.includes('__pv')) return; const k = dd + '|' + chaveDe(bl.pid, bl.tid); if (grupos[k]) grupos[k].novos.push(bl); }));
  const alvo = new Map();
  Object.values(grupos).forEach(g => { g.velhos.sort((x, y) => Number(x.dataset.ini) - Number(y.dataset.ini)); g.novos.sort((x, y) => x.ini - y.ini);
    g.velhos.forEach((el, i) => alvo.set(el, g.novos[i] || null)); });
  // ordem: mais perto do bloco arrastado primeiro (mesmo dia pelo horário; outros dias depois, pela distância em dias)
  const dist = (el) => { const dd = Math.abs((new Date(el.dataset.dia + 'T12:00:00') - new Date(dia + 'T12:00:00')) / 864e5); return dd * 100 + Math.abs(Number(el.dataset.ini) - a); };
  const mexe = [...alvo.entries()].filter(([el, nv]) => {
    const ini = Number(el.dataset.ini), fim = Number(el.dataset.fim);
    const top = nv ? nv.ini : ini, fimN = nv ? nv.fim : fim; const some = !nv;
    const ja = el._pv || { top: ini, fim, some: false };
    return Math.abs(ja.top - top) > 1e-6 || Math.abs(ja.fim - fimN) > 1e-6 || ja.some !== some;
  }).sort((x, y) => dist(x[0]) - dist(y[0]));
  mexe.forEach(([el, nv], i) => {
    const ini = Number(el.dataset.ini), fim = Number(el.dataset.fim);
    const top = nv ? nv.ini : ini, fimN = nv ? nv.fim : fim;
    el._pv = { top, fim: fimN, some: !nv };
    el.classList.add('pl-pv');
    el.style.transitionDelay = Math.round(i * 1000 / 24) + 'ms';
    el.style.transform = `translateY(${(top - ini) * PL_ALT}px)`;
    el.style.height = Math.max(10, (fimN - top) * PL_ALT - 2) + 'px';
    el.classList.toggle('pl-pv-some', !nv);
  });
  _pv.els = [...new Set([...(_pv.els || []), ...mexe.map(x => x[0])])];
}
function planoPreviaFim() {
  if (!_pv) return; clearTimeout(_pv.t);
  (_pv.els || []).forEach(el => { el.classList.remove('pl-pv', 'pl-pv-some'); el.style.transitionDelay = ''; el.style.transform = ''; el.style.height = ''; delete el._pv; });
  if (_pv.d && _pv.d.el) _pv.d.el.style.pointerEvents = '';
  _pv = null;
}

/* Fixar / soltar e mover pelo menu do clique direito e pelo teclado (24/11). */
function planoBlocoDados(el) { return { dia: el.dataset.dia, pid: el.dataset.pid, tid: el.dataset.tid || null, ini: Number(el.dataset.ini), fim: Number(el.dataset.fim), pins: (el.dataset.pin || '').split(',').filter(Boolean) }; }
function planoFixarBloco(el) {
  const b = planoBlocoDados(el); if (b.pins.length) return toast('Este bloco já está fixado');
  planoMudar('Bloco fixado aqui', () => planoPinsSalvar([...planoPins(), { id: uid(), dia: b.dia, pid: b.pid, tid: b.tid, ini: b.ini, h: b.fim - b.ini }]));
}
/* Mover um bloco: muda dia e/ou hora (fica fixado); os fixados que ele cobre vão para depois, inteiros. */
function planoMoverBloco(el, novoDia, novoIni, rotulo) {
  const b = planoBlocoDados(el); const h = b.fim - b.ini; const ini = Math.max(0, Math.min(24 - h, novoIni));
  planoMudar(rotulo, () => {
    const outros = planoPins().filter(p => !b.pins.includes(p.id));
    const r = planoEmpurrar(outros, [{ dia: novoDia, ini, fim: ini + h }], planoOcupadosDoDia, { proximoDia: planoProximoUtil });
    planoPinsSalvar([...r.base, ...r.empurrados, { id: uid(), dia: novoDia, pid: b.pid, tid: b.tid, ini, h }]);
  });
}
const planoMoverAmanha = (el) => planoMoverBloco(el, planoProximoUtil(el.dataset.dia), Number(el.dataset.ini), 'Bloco movido para o próximo dia útil');
/* Fixar o dia: todos os blocos planejados do dia viram fixados como estão. Soltar o dia: tira todos os fixados dele. */
function planoFixarDia(dia) {
  let m; try { m = tkMotor(new Date(), 60); } catch (_) { return; }
  const bl = m.porDia[dia]?.blocos || []; const soltos = bl.filter(b => !b.pin);
  if (!soltos.length) return toast('Nada solto para fixar neste dia');
  planoMudar(`Dia fixado (${soltos.length} bloco${soltos.length > 1 ? 's' : ''})`, () => planoPinsSalvar(planoFixarDiaLista(planoPins(), dia, m)));
}
/* O dia fica salvo EXATAMENTE como aparece: os fixados antigos do dia saem e cada bloco da tela vira um fixado do tamanho
   que está (um fixado encolhido ou juntado pelo plano não volta a crescer por cima de outro depois). Os que esperam outra
   tarefa (não aparecem) continuam como estavam. */
function planoFixarDiaLista(pins, dia, m) {
  const bl = m.porDia[dia]?.blocos || []; const fant = new Set((m.pinsSobra || []).filter(q => q.dia === dia).map(q => q.pin));
  return [...pins.filter(p => p.dia !== dia || fant.has(p.id)), ...bl.map(b => ({ id: uid(), dia, pid: b.pid, tid: b.tid || null, ini: b.ini, h: b.fim - b.ini }))];
}
function planoSoltarDia(dia) {
  const n = planoPins().filter(p => p.dia === dia).length; if (!n) return toast('Nenhum bloco fixado neste dia');
  planoMudar(`Dia solto (${n} bloco${n > 1 ? 's' : ''})`, () => planoPinsSalvar(planoPins().filter(p => p.dia !== dia)), 'Dia solto: o app encaixa de novo');
}
ACTIONS['pl-fixar-dia'] = (el) => { const dia = el.dataset.dia; planoPins().some(p => p.dia === dia) && el.dataset.modo === 'soltar' ? planoSoltarDia(dia) : planoFixarDia(dia); };

/* Teclado: com UM bloco planejado selecionado (Shift + clique), ↑/↓ movem 15 min e Shift + ←/→ trocam de dia útil.
   Esc solta a seleção (já existia). O clique simples continua abrindo o projeto. */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', (e) => {
    if (typeof PLANO === 'undefined' || PLANO.sel.size !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = [...PLANO.sel][0]; if (!k.startsWith('p:')) return;
    const el = [...document.querySelectorAll('.pl-bloco[data-sk]')].find(o => o.dataset.sk === k); if (!el) return;
    let dia = el.dataset.dia, ini = Number(el.dataset.ini); const h = Number(el.dataset.fim) - ini;
    if (e.key === 'ArrowUp' && !e.shiftKey) ini -= 0.25;
    else if (e.key === 'ArrowDown' && !e.shiftKey) ini += 0.25;
    else if (e.key === 'ArrowRight' && e.shiftKey) dia = planoProximoUtil(dia);
    else if (e.key === 'ArrowLeft' && e.shiftKey) { let d = planoDiaMais(dia, -1); for (let i = 0; i < 14 && !planoDiaUtil(d); i++) d = planoDiaMais(d, -1); dia = d; }
    else return;
    e.preventDefault();
    if (dia < ymd(new Date())) return toast('Não dá para mover para um dia que já passou');
    ini = Math.max(0, Math.min(24 - h, ini));
    PLANO.sel.clear(); PLANO.sel.add(`p:${dia}:${el.dataset.tid || el.dataset.pid}:${ini.toFixed(2)}`);   // a seleção acompanha o bloco
    planoMoverBloco(el, dia, ini, dia !== el.dataset.dia ? `Bloco movido para ${fmtDate(dia)}` : `Bloco movido para ${planoHora(ini)}`);
  });
}
