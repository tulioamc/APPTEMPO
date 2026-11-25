/* Calendário à prova de erro (24/11).
   Quatro camadas, para o plano não quebrar nem ficar "doido" sem você perceber:
   1) PORTA ÚNICA dos blocos fixados: tudo que entra ou sai passa por planoPinsSalvar / planoPins, que arredonda, descarta o
      que não faz sentido (sem projeto, tarefa já concluída, horário inválido) e nunca deixa um bloco "fantasma" ocupando horas;
   2) EMPURRAR sem choque: planoEmpurrar é a única conta de "o que acontece com os outros blocos quando um bate neles";
   3) AÇÃO ATÔMICA + DESFAZER: planoMudar roda a mudança como UM passo do Ctrl+Z; se der erro no meio, volta tudo como estava;
   4) DIAGNÓSTICO: planoDiagnostico confere as regras do plano (sobra de bloco, choque, dependência em volta, prazo, dados
      inválidos) e cada aviso vem com o botão que conserta. */

/* ---------- 1. Blocos fixados ---------- */
const PL_DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const planoQuarto = (h) => Math.round(h * 4) / 4;
const planoFechada = (id) => ['done', 'cancelled'].includes(statusCat(id));
/* Um bloco fixado, já corrigido; ou null se não serve mais (projeto ou tarefa que acabou/sumiu, data ou hora sem sentido). */
function planoPinOk(pn) {
  if (!pn || typeof pn !== 'object' || !pn.id || !PL_DIA_RE.test(pn.dia || '') || isNaN(new Date(pn.dia + 'T12:00:00'))) return null;
  let ini = Number(pn.ini), h = Number(pn.h);
  if (!Number.isFinite(ini) || !Number.isFinite(h) || h <= 0) return null;
  ini = Math.max(0, Math.min(23.75, planoQuarto(ini))); h = Math.max(0.25, Math.min(24 - ini, planoQuarto(h)));
  const p = db.get('tempo_projects', pn.pid);
  if (!p || p.archived || planoFechada(p.status_id)) return null;
  const tid = pn.tid || null;
  if (tid) { const t = db.get('tempo_tasks', tid); if (!t || t.project_id !== pn.pid || planoFechada(t.status_id)) return null; }
  return { ...pn, ini, h, tid };
}
function planoPinsLimpar(lista) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).map(planoPinOk).filter(x => x && !vistos.has(x.id) && vistos.add(x.id));
}
let _plPins = { raw: null, w: -1, v: [] };
/* Blocos fixados válidos (lidos já limpos; o que sobrou de tarefa concluída ou projeto apagado nem aparece). */
function planoPins() {
  const raw = db.setting('planoPins', []) || []; const w = db.writes || 0;
  if (_plPins.raw === raw && _plPins.w === w) return _plPins.v;
  const v = planoPinsLimpar(raw); _plPins = { raw, w, v }; return v;
}
/* Única porta de escrita: grava só o que é válido (então o lixo antigo some na primeira mudança que você fizer). */
const planoPinsSalvar = (lista) => db.setSetting('planoPins', planoPinsLimpar(lista));
/* O que ocupa o dia para quem é empurrado: rotina + compromissos (Google e bloqueios; to-do não ocupa, pode sobrepor). */
function planoOcupadosDoDia(dia) {
  return [...planoFixosDoDia(dia), ...planoEventos(dia, true).filter(e => !e.diaTodo && e.ocupa !== false && e.fim > e.ini).map(e => [e.ini, e.fim, e.titulo])];
}
const planoProximoUtil = (dia) => { let d = planoDiaMais(dia, 1); for (let i = 0; i < 14 && !planoDiaUtil(d); i++) d = planoDiaMais(d, 1); return d; };

/* ---------- 2. Empurrar sem choque ----------
   `partes` = o que acabou de ser colocado ([{ dia, ini, fim }]); `base` = os outros blocos fixados. Quem bate numa parte vai
   para logo depois dela (inteiro, sem dividir), em cadeia, pulando a rotina. Quem não encosta fica onde está.
   `dias` (opcional) limita os dias conferidos; sem `partes`, serve para desfazer choques que já existem. */
function planoEmpurrar(base0, partes, fixosDe, { dias = null, proximoDia = null } = {}) {
  let base = base0.slice(); const empurrados = [];
  const lista = (dias || [...new Set(partes.map(pt => pt.dia))]).slice().sort();
  lista.forEach(dd => {
    const fx = fixosDe(dd).slice().sort((p, q) => p[0] - q[0]);
    const ocup = partes.filter(pt => pt.dia === dd).map(pt => [pt.ini, pt.fim]);
    const outros = base.filter(p => p.dia === dd).sort((p, q) => Number(p.ini) - Number(q.ini));
    outros.forEach(o => {
      const h = Number(o.h); let ini = Number(o.ini);
      for (let k = 0; k < 20; k++) {
        const bate = ocup.find(([u, v]) => u < ini + h - 1e-6 && v > ini + 1e-6);
        const rot = fx.find(z => z[0] < ini + h - 1e-6 && z[1] > ini + 1e-6);
        if (bate) ini = bate[1]; else if (rot && ini !== Number(o.ini)) ini = rot[1]; else break;
      }
      let novo = o;
      if (Math.abs(ini - Number(o.ini)) > 1e-6) {
        novo = { ...o, ini };
        if (ini + h > 24 + 1e-6) {   // não cabe mais neste dia: vai inteiro para o começo do próximo dia útil
          if (proximoDia) { const nd = proximoDia(dd); novo = { ...o, dia: nd, ini: typeof planoInicioDia === 'function' ? planoInicioDia(nd) : 9 }; }
          else novo = { ...o, ini: Math.max(0, 24 - h) };
        }
        base = base.filter(p => p.id !== o.id); empurrados.push(novo);
      }
      if (novo.dia === dd) ocup.push([Number(novo.ini), Number(novo.ini) + h]);
    });
  });
  // quem foi para o próximo dia útil também não pode cair em cima de outro bloco de lá: empurra lá também, em cadeia (24/11)
  const foram = empurrados.filter(n => !lista.includes(n.dia));
  if (foram.length && (arguments[4] || 0) < 6) {
    let todos = [...base, ...empurrados]; const mexidos = new Set(empurrados.map(n => n.id));
    foram.forEach(n => {
      const atual = todos.find(x => x.id === n.id) || n;
      const r = planoEmpurrar(todos.filter(x => x.id !== atual.id), [{ dia: atual.dia, ini: Number(atual.ini), fim: Number(atual.ini) + Number(atual.h) }], fixosDe, { proximoDia }, (arguments[4] || 0) + 1);
      r.empurrados.forEach(x => mexidos.add(x.id));
      todos = [...r.base, ...r.empurrados, atual];
    });
    return { base: todos.filter(x => !mexidos.has(x.id)), empurrados: todos.filter(x => mexidos.has(x.id)) };
  }
  return { base, empurrados };
}

/* ---------- 3. Ação atômica + desfazer ---------- */
function planoAvisoDesfazer(msg) {
  if (typeof toast !== 'function') return;
  toast(msg, { ms: 8000, actions: [{ label: 'Desfazer', run: () => { if (db.undo() && typeof render === 'function') render(); } }] });
}
/* Roda `fn` como UM passo do Ctrl+Z. Se algo der errado no meio, volta tudo como estava e avisa. */
function planoMudar(rotulo, fn, aviso) {
  try { db.agrupar(rotulo, fn); }
  catch (e) { console.error('Calendário:', rotulo, e); db.emit(); if (typeof render === 'function') render(); if (typeof toast === 'function') toast('Não consegui fazer isso. Deixei tudo como estava.'); return false; }
  db.emit(); if (typeof render === 'function') render();
  if (aviso !== false) planoAvisoDesfazer(aviso === undefined ? rotulo : aviso);   // false = ação rápida e repetida (sem aviso; o botão Desfazer do cabeçalho vale)
  return true;
}
ACTIONS['pl-desfazer'] = () => { if (db.undo()) { toast('Desfeito'); if (typeof render === 'function') render(); } else toast('Nada para desfazer'); };
/* Botão de desfazer do cabeçalho: só aparece quando o último passo foi do Calendário (não desfaz coisa de outra tela). */
const planoDesfazerHTML = () => { const r = db.desfazerRotulo(); return r ? `<button class="btn sm ghost" data-act="pl-desfazer" data-tip="${esc(`Desfazer: ${r} (Ctrl+Z)`)}">↶ Desfazer</button>` : ''; };

/* ---------- 4. Diagnóstico do plano ---------- */
const TK_HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const planoNomePin = (pn) => { const t = pn.tid && db.get('tempo_tasks', pn.tid); const p = db.get('tempo_projects', pn.pid); return t ? t.name : p ? p.name : 'Bloco'; };
const planoHM = (h) => planoHora(h).replace(':', 'h').replace(/h00$/, 'h');
/* Dependências que dão a volta (A espera B e B espera A): cada uma como { t, dep }. */
function tkCiclos(m) { return (m?.ciclos || []).map(c => ({ t: db.get('tempo_tasks', c.de), dep: db.get('tempo_tasks', c.para) })).filter(c => c.t && c.dep); }
function planoChoquesPins(hoje = ymd(new Date())) {
  const porDia = {}; const out = [];
  planoPins().filter(p => p.dia >= hoje).forEach(p => (porDia[p.dia] ||= []).push(p));
  Object.entries(porDia).forEach(([dia, l]) => {
    l.sort((a, b) => a.ini - b.ini); const pares = [];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (l[j].ini < l[i].ini + l[i].h - 1e-6 && l[i].ini < l[j].ini + l[j].h - 1e-6) pares.push([l[i], l[j]]);
    if (pares.length) out.push({ dia, pares });
  });
  return out;
}
/* Tira do bloco fixado a parte que sobra (ou solta o bloco inteiro, se nada dele é usado). */
function planoAparar(lista, sobra) {
  return lista.flatMap(p => { if (p.id !== sobra.pin) return [p]; const usado = Number(sobra.ini) - Number(p.ini); return usado >= 0.25 ? [{ ...p, h: planoQuarto(usado) }] : []; });
}
function planoDiagnostico(agora = new Date()) {
  const out = []; let m;
  try { m = tkMotor(agora, 120); }
  catch (e) { return [{ id: 'motor', nivel: 'erro', titulo: 'Não consegui recalcular o plano', texto: 'Estou mostrando o último plano que funcionou. Se continuar assim, recarregue o app.', corrigir: null }]; }
  const hoje = ymd(agora);
  // 1) bloco fixado que sobra: o horário fica ocupado sem servir a nenhuma tarefa
  (m.pinsSobra || []).forEach(s => {
    const pn = planoPins().find(p => p.id === s.pin); if (!pn) return;
    const nome = planoNomePin(pn); const quando = `${fmtDate(s.dia)} ${planoHM(s.ini)}–${planoHM(s.fim)}`; const quanto = fmtH((s.fim - s.ini) * 36e5);
    const motivo = s.motivo || '';
    let titulo, texto;
    if (motivo.startsWith('antes:')) { const dep = motivo.slice(6); titulo = `${nome}: fixada antes de terminar o que ela espera`; texto = `O bloco de ${quando} cai antes de ${dep ? `“${dep}”` : 'a tarefa anterior'} acabar, então o app não usa esse horário. Ele fica ocupado sem servir a ninguém.`; }
    else if (motivo === 'terceiro') { titulo = `${nome}: tarefa de outra pessoa`; texto = `O bloco de ${quando} segura ${quanto} de uma tarefa que não é sua.`; }
    else if (motivo === 'parada') { titulo = `${nome}: tarefa esperando`; texto = `A tarefa está parada (esperando cliente ou aprovação), mas o bloco de ${quando} continua segurando ${quanto}.`; }
    else if (motivo === 'fora') { titulo = `${nome}: fora da fila`; texto = `O projeto não está na fila do planejamento, e o bloco de ${quando} segura ${quanto}.`; }
    else { titulo = `${nome}: bloco fixado maior que o necessário`; texto = `Sobram ${quanto} em ${quando} que a tarefa não usa. Esse horário fica bloqueado para as outras.`; }
    out.push({ id: 'sobra:' + s.pin, nivel: 'aviso', dia: s.dia, titulo, texto, corrigir: { rotulo: 'Soltar o que sobra', run: () => planoPinsSalvar(planoAparar(planoPins(), s)) } });
  });
  // 2) dois blocos fixados no mesmo horário
  planoChoquesPins(hoje).forEach(c => {
    const nomes = [...new Set(c.pares.flat().map(planoNomePin))];
    out.push({ id: 'choque:' + c.dia, nivel: 'aviso', dia: c.dia, titulo: `${fmtDate(c.dia)}: blocos fixados no mesmo horário`, texto: `${nomes.map(n => `“${n}”`).join(' e ')} estão fixados por cima um do outro. Só uma coisa pode acontecer de cada vez.`,
      corrigir: { rotulo: 'Empurrar para depois, sem sobrepor', run: () => { const r = planoEmpurrar(planoPins(), [], planoOcupadosDoDia, { dias: [c.dia], proximoDia: planoProximoUtil }); planoPinsSalvar([...r.base, ...r.empurrados]); } } });
  });
  // 3) bloco fixado por cima de um compromisso (Google ou bloqueio; to-do pode coexistir)
  const vistoEv = new Set();
  planoPins().filter(p => p.dia >= hoje).forEach(p => {
    planoEventos(p.dia, true).filter(e => !e.diaTodo && e.ocupa !== false && e.fim > e.ini && e.ini < p.ini + p.h - 1e-6 && e.fim > p.ini + 1e-6).forEach(e => {
      const k = p.id + ':' + e.id; if (vistoEv.has(k)) return; vistoEv.add(k);
      out.push({ id: 'evento:' + k, nivel: 'aviso', dia: p.dia, titulo: `${planoNomePin(p)}: bate com “${e.titulo}”`, texto: `O bloco de ${fmtDate(p.dia)} ${planoHM(p.ini)}–${planoHM(p.ini + p.h)} cai em cima de ${planoHM(e.ini)}–${planoHM(e.fim)}. Abra o dia e escolha qual dos dois muda.`, ver: p.dia,
        corrigir: { rotulo: 'Soltar o bloco (o app reencaixa)', run: () => planoPinsSalvar(planoPins().filter(x => x.id !== p.id)) } });
    });
  });
  // 4) dependência que dá a volta
  tkCiclos(m).forEach(c => out.push({ id: `ciclo:${c.t.id}:${c.dep.id}`, nivel: 'erro', titulo: `“${c.t.name}” e “${c.dep.name}” esperam uma pela outra`, texto: 'Uma depende da outra, então nenhuma pode começar. O app ignora essa dependência para não travar o plano.',
    corrigir: { rotulo: `Tirar a espera de “${c.t.name}” por “${c.dep.name}”`, run: () => db.update('tempo_tasks', c.t.id, { depends_on: (Array.isArray(c.t.depends_on) ? c.t.depends_on : []).filter(d => d !== c.dep.id) }, true) } }));
  // 5) tarefas que não cabem no prazo (o botão abre a janela de Resolver, que pede confirmação)
  const porProj = {}; Object.values(m.itens).filter(x => x.aviso && x.t).forEach(x => { (porProj[x.pid] ||= []).push(x); });
  Object.entries(porProj).forEach(([pid, l]) => { const p = db.get('tempo_projects', pid); if (!p) return;
    out.push({ id: 'prazo:' + pid, nivel: 'aviso', titulo: `${p.name}: ${l.length} tarefa${l.length > 1 ? 's' : ''} não cabe${l.length > 1 ? 'm' : ''} no prazo`, texto: `Com o tempo previsto e as horas livres, ${l.slice(0, 3).map(x => `“${x.t.name}”`).join(', ')}${l.length > 3 ? ` e mais ${l.length - 3}` : ''} ficam prontas depois da entrega.`,
      corrigir: { rotulo: 'Resolver…', proprio: true, run: () => tkResolver(pid) } }); });
  // 6) dados de tarefa que quebram o cálculo
  db.all('tempo_tasks').filter(t => !t.parent_id && !planoFechada(t.status_id)).forEach(t => {
    if (t.deadline && (!PL_DIA_RE.test(t.deadline) || isNaN(new Date(t.deadline + 'T12:00:00')))) out.push({ id: 'dados:prazo:' + t.id, nivel: 'erro', titulo: `${t.name}: prazo inválido`, texto: `A data “${t.deadline}” não existe. Sem ela, a tarefa fica fora da conta de prazos.`, corrigir: { rotulo: 'Limpar o prazo', run: () => db.update('tempo_tasks', t.id, { deadline: null, deadline_time: null }, true) } });
    else if (t.deadline_time && !TK_HORA_RE.test(t.deadline_time)) out.push({ id: 'dados:hora:' + t.id, nivel: 'aviso', titulo: `${t.name}: hora do prazo inválida`, texto: `A hora “${t.deadline_time}” não vale; o app usa o fim do expediente.`, corrigir: { rotulo: 'Usar o fim do expediente', run: () => db.update('tempo_tasks', t.id, { deadline_time: null }, true) } });
  });
  // 7) dicas: tarefas na fila sem tempo previsto (o plano usa uma sugestão)
  const sem = Object.values(m.itens).filter(x => x.t && x.eu && !tkPrev(x.t).manual);
  if (sem.length) out.push({ id: 'dica:previsao', nivel: 'info', titulo: `${sem.length} tarefa${sem.length > 1 ? 's' : ''} sem tempo previsto`, texto: `O plano usa uma sugestão (ou 1h) para: ${sem.slice(0, 4).map(x => `“${x.t.name}”`).join(', ')}${sem.length > 4 ? ` e mais ${sem.length - 4}` : ''}. Digite o previsto aqui para o plano ficar certo.`, corrigir: null,
    estimar: sem.slice(0, 8).map(x => ({ id: x.t.id, nome: x.t.name, min: Math.round(tkPrev(x.t).min / 15) * 15 || 60 })) });
  return out;
}

/* Chip do cabeçalho: verde quando está tudo em ordem; senão, quantos avisos (clique para ver e consertar). */
function planoSaudeHTML() {
  let l = []; try { l = planoDiagnostico(); } catch (e) { console.error('Diagnóstico:', e); }
  const av = l.filter(x => x.nivel !== 'info');
  if (!av.length) return `<span class="pl-saude ok" data-tip="${esc(l.length ? 'O plano está em ordem. Há dicas (tarefas sem tempo previsto): clique para ver.' : 'O plano está em ordem: nada fixado sobrando, sem choque, dependências e prazos conferidos.')}"${l.length ? ' data-act="pl-saude"' : ''}>${icon('check')} Plano em ordem${l.length ? ` · ${l.length} dica${l.length > 1 ? 's' : ''}` : ''}</span>`;
  const erro = av.some(x => x.nivel === 'erro');
  return `<button class="pl-saude ${erro ? 'erro' : 'aviso'}" data-act="pl-saude" data-tip="Clique para ver o que está estranho no plano e consertar">${icon('alert')} ${av.length} aviso${av.length > 1 ? 's' : ''}</button>`;
}
function planoSaudeLayerHTML() {
  const l = planoDiagnostico(); const av = l.filter(x => x.nivel !== 'info'), di = l.filter(x => x.nivel === 'info');
  const fix = av.filter(x => x.corrigir && !x.corrigir.proprio);
  const item = (x) => `<div class="pl-sd-i ${x.nivel}"><div class="pl-sd-t">${icon(x.nivel === 'info' ? 'clock' : 'alert')}<b>${esc(x.titulo)}</b></div><div class="small muted">${esc(x.texto)}</div>
    <div class="row" style="gap:6px;margin-top:6px">${x.corrigir ? `<button class="btn sm primary" data-fix="${esc(x.id)}">${esc(x.corrigir.rotulo)}</button>` : ''}${x.ver ? `<button class="btn sm" data-ver="${x.ver}">Abrir o dia</button>` : ''}</div>
    ${(x.estimar || []).map(e => `<div class="row pl-sd-est"><span class="grow small">${esc(e.nome)}</span><input class="input" type="number" min="5" step="5" value="${e.min}" data-est-in="${e.id}" aria-label="Minutos previstos de ${esc(e.nome)}"><span class="small muted">min</span><button class="btn sm primary" data-est="${e.id}">Definir</button></div>`).join('')}</div>`;
  return `<div class="dh">${icon(av.length ? 'alert' : 'check')}<h2>${av.length ? 'O que está estranho no plano' : 'Plano em ordem'}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:10px">${av.length ? av.map(item).join('') : '<div class="small muted">Nada fixado sobrando, nenhum choque, dependências e prazos conferidos.</div>'}
    ${di.length ? `<div class="lbl" style="margin-top:4px">Dicas</div>${di.map(item).join('')}` : ''}</div>
    ${fix.length > 1 ? `<div class="df"><button class="btn primary" data-fix-tudo>Corrigir tudo (${fix.length})</button></div>` : ''}`;
}
ACTIONS['pl-saude'] = () => {
  const l = openLayer({ html: planoSaudeLayerHTML() });
  const refaz = () => { const av = planoDiagnostico().filter(x => x.nivel !== 'info'); l.box.innerHTML = planoSaudeLayerHTML(); if (!av.length && !l.box.querySelector('.pl-sd-i')) setTimeout(() => l.close(), 600); };
  l.box.addEventListener('click', (e) => {
    const ver = e.target.closest('[data-ver]'); if (ver) { l.close(); PLANO.dia = ver.dataset.ver; PLANO.modo = 'dia'; if (typeof go === 'function') go('plano'); else render(); return; }
    const est = e.target.closest('[data-est]');
    if (est) { const v = Math.round(Number(l.box.querySelector(`[data-est-in="${est.dataset.est}"]`)?.value)); if (!(v >= 5 && v <= 24 * 60)) { toast('Digite os minutos (de 5 a 1440).'); return; }
      planoMudar('Tempo previsto', () => db.update('tempo_tasks', est.dataset.est, { est_min: v }, true), false); refaz(); return; }
    const tudo = e.target.closest('[data-fix-tudo]');
    if (tudo) { const fs = planoDiagnostico().filter(x => x.nivel !== 'info' && x.corrigir && !x.corrigir.proprio); planoMudar(`Plano arrumado (${fs.length} ajustes)`, () => fs.forEach(x => x.corrigir.run())); refaz(); return; }
    const b = e.target.closest('[data-fix]'); if (!b) return;
    const it = planoDiagnostico().find(x => x.id === b.dataset.fix); if (!it?.corrigir) { refaz(); return; }
    if (it.corrigir.proprio) { l.close(); it.corrigir.run(); return; }
    planoMudar(`Corrigido: ${it.titulo}`, it.corrigir.run); refaz();
  });
};
