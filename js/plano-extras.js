/* Calendário — extras: bandeja de tarefas para arrastar até a grade e clique na barra do Gantt abrindo a tarefa. */

/* Tarefas abertas (suas, com previsão) na ordem do plano; o tamanho do bloco é o que falta, de 15 em 15 min (máx. 8 h). */
function planoBandejaLista() {
  let m; try { m = tkMotor(new Date(), 60); } catch (e) { return []; }
  return Object.values(m.itens).filter(x => x.t && x.eu && x.pid && (x.resto || 0) > 0)
    .sort((a, b) => String(a.blocos?.[0] ? a.blocos[0].dia + String(a.blocos[0].ini).padStart(5, '0') : 'z').localeCompare(String(b.blocos?.[0] ? b.blocos[0].dia + String(b.blocos[0].ini).padStart(5, '0') : 'z'))).slice(0, 14)
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
