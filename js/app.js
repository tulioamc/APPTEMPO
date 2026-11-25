/* =====================================================================
   SHELL — navegação, renderização, cronômetro, inatividade, lembretes
   ===================================================================== */
const S = {
  route: 'timesheet',
  tsDay: ymd(new Date()),
  proj: { view: 'table', q: '', agency: '', client: '', status: '', pay: '', wt: '', year: '', month: '', from: '', to: '', situ: 'active', sort: { key: 'deadline', dir: 1 },
          cols: null, hidden: null, calMonth: null },
  task: { q: '', project: '', status: '', mine: 'open' },
  quote: { q: '', status: '' },
  fin: { agency: '', client: '', status: '', pay: '', year: '', month: '', from: '', to: '' },
  rep: { period: 'month', from: '', to: '', agency: '', client: '', group: 'client' },
  reg: { tab: 'agencies', q: '' },
  contacts: { q: '' },
  pref: 'appearance',
  imp: null,
  navOpen: false
};
/* Pendências: itens que precisam de ação. O número ao lado do menu abre a lista, e cada item leva para resolver. */
const PEND_KIND = { pause: 'Pausa para confirmar', activity: 'Atividade para anotar', start: 'Início de sessão para confirmar' };
function pendingOf(id) {
  if (id === 'expenses') {
    const ym = S.exMonth || ymd(new Date()).slice(0, 7);
    return exRows(ym).filter(r => !['Não teve', 'Pago', 'Recebido'].includes(r.status)).map(r => ({ label: r.name || '(sem nome)', why: `${ym} · ${r.status}${r.due_date ? ' · vence ' + fmtDate(r.due_date) : ''}`, route: 'expenses' }));
  }
  if (id === 'reimb') {
    return db.all('tempo_reimb_rows').filter(r => r.refund_id !== rbStatusId('reimb_refund', 'Feito!')).map(r => ({ label: r.name || '(sem nome)', why: `${r.month} · ${fmtMoney(r.amount) || 'sem valor'} · reembolso ainda não feito`, route: 'reimb' }));
  }
  if (id === 'notas') {
    if (typeof nfFaltando !== 'function' || !db.data?.tempo_invoices) return [];
    return nfFaltando().flatMap(f => f.falta.map(x => ({ label: `NF ${String(x).padStart(2, '0')} falta na pasta`, why: 'a numeração pula essa nota: ponha o PDF na pasta de notas fiscais', route: 'notas' })));
  }
  if (id === 'notices') {
    return db.all('tempo_notices').filter(n => n.status === 'pending' && n.kind !== 'todo').map(n => ({ label: PEND_KIND[n.kind] || n.kind, why: n.created_at ? 'desde ' + fmtDate(n.created_at) : 'aguardando sua decisão', route: 'notices' }));
  }
  return [];
}
const NAV = [
  { id: 'timesheet', label: 'Time Sheet', icon: 'clock' },
  { id: 'todo', label: 'To-do', icon: 'check' },
  { id: 'plano', label: 'Calendário', icon: 'cal' },
  { group: 'PJ' },
  { id: 'registry', label: 'Agências e clientes', icon: 'users' },
  { id: 'contacts', label: 'Contatos', icon: 'users' },
  { id: 'projects', label: 'Projetos', icon: 'folder' },
  { id: 'tasks', label: 'Tarefas', icon: 'check' },
  { id: 'quotes', label: 'Orçamentos', icon: 'doc' },
  { id: 'finance', label: 'Financeiro PJ', icon: 'money' },
  { id: 'notas', label: 'Notas fiscais', icon: 'doc', pend: true },
  { group: 'PF' },
  { id: 'financepf', label: 'Financeiro PF', icon: 'money' },
  { id: 'expenses', label: 'Despesas', icon: 'money', pend: true },
  { id: 'reimb', label: 'Reembolsos', icon: 'layers', pend: true },
  { group: 'Filho' },
  { id: 'shared', label: 'Despesas Rafa', icon: 'users' },
  { id: 'rafa', label: 'Dias de Rafa', icon: 'users' },
  { group: 'Relatórios' },
  { id: 'reports', label: 'Receita PJ', icon: 'chart', tip: 'Faturamento, recebido, em aberto e clientes (PJ)' },
  { id: 'productivity', label: 'Produtividade', icon: 'chart', tip: 'Quanto você rende: por hora do dia, por dia da semana, foco e pausas' },
  { id: 'usage', label: 'Uso de programas', icon: 'chart', tip: 'Em quais programas e sites o tempo foi' },
  { id: 'reportspf', label: 'Gastos PF', icon: 'chart', tip: 'Para onde foi o dinheiro da conta pessoal, mês a mês' },
  { id: 'relfilho', label: 'Gastos e dias do Rafa', icon: 'chart', tip: 'Gasto mês a mês, parte da Amanda, saldo e dias com você' },
  { id: 'analises', label: 'Análises', icon: 'doc', tip: 'Análises semanal, mensal, trimestral, semestral e anual' },
  { id: 'metas', label: 'Metas', icon: 'flag', tip: 'Metas e estrelas conquistadas' },
  { group: 'Geral' },
  { id: 'notices', label: 'Avisos', icon: 'bell', pend: true },
  { id: 'ajustes', label: 'Fila de ajustes', icon: 'layers', tip: 'Ajustes e ideias para o app, com prints (⌃⌥F de qualquer tela)' },
  { id: 'lixeira', label: 'Lixeira de log', icon: 'trash' },
  { id: 'prefs', label: 'Configurações', icon: 'gear' }
];
const VIEWS = {};
/* Relatórios: uma seção só, com abas. Cada aba continua sendo a sua tela (rota própria). */
/* Relatórios e análises numa seção só (25/11): grupos PJ · PF · Filho · Relatórios · Geral, cada um com as suas abas. */
const REL_GRUPOS = [
  { id: 'pj', label: 'PJ', tabs: [['reports', 'Financeiro'], ['productivity', 'Produtividade'], ['usage', 'Uso de programas']] },
  { id: 'pf', label: 'PF', tabs: [['reportspf', 'Financeiro']] },
  { id: 'filho', label: 'Filho', tabs: [['relfilho', 'Despesas e dias']] },
  { id: 'rel', label: 'Relatórios', tabs: [['analises', 'Semanal, mensal e mais']] },
  { id: 'geral', label: 'Geral', tabs: [['metas', 'Metas']] },
];
const REL_TABS = REL_GRUPOS.flatMap(g => g.tabs);
const relGrupoDe = (r) => REL_GRUPOS.find(g => g.tabs.some(([k]) => k === r)) || REL_GRUPOS[0];
const relTab = (r) => REL_TABS.some(([k]) => k === r);
const navOn = (id) => S.route === id;

function go(route) {
  if (route === 'relatorios') route = relTab(db.setting('relTab', '')) ? db.setting('relTab', '') : 'productivity';
  S.route = route; S.navOpen = false; $('.app')?.classList.remove('nav-open'); $$('.colorpop,.combo-pop,.colmenu').forEach(x => x.remove());
  try { history.replaceState(null, '', '#' + route); } catch (e) {}
  render(); window.scrollTo(0, 0);
}
ACTIONS.go = (el) => go(el.dataset.route);
/* Lista de pendências: explica cada item e leva para resolver. */
ACTIONS.pend = (el) => {
  const id = el.dataset.id; const items = pendingOf(id);
  const title = NAV.find(n => n.id === id)?.label || 'Pendências';
  const l = openLayer({ html: `<div class="dh"><h2>Pendências · ${esc(title)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db"><div class="stack" style="gap:8px"><span class="small muted">Cada item precisa da sua ação. Clique para ir resolver.</span>
    ${items.length ? items.map(it => `<button type="button" class="btn ghost" style="justify-content:flex-start;text-align:left;height:auto;padding:10px" data-pgo="${it.route}"><span><b>${esc(it.label)}</b><br><span class="small muted">${esc(it.why)}</span></span></button>`).join('') : '<div class="empty small">Nada pendente.</div>'}
    </div></div>` });
  l.box.addEventListener('click', (e) => { const b = e.target.closest('[data-pgo]'); if (!b) return; l.close(); go(b.dataset.pgo); });
};
ACTIONS['toggle-nav'] = () => { S.navOpen = !S.navOpen; $('.app').classList.toggle('nav-open', S.navOpen); };

/* Menu lateral: cada grupo (PJ, PF, Geral) recolhe ou expande com o chevron; o estado fica salvo. */
function sidebarNavHTML() {
  const folded = db.setting('navFold', []) || [];
  let cur = null; const out = [];
  NAV.forEach(n => {
    if (n.group) { cur = n.group; const f = folded.includes(n.group); out.push(`<button class="nav-group nav-fold" data-act="nav-fold" data-g="${n.group}" aria-expanded="${!f}">${n.group}${icon(f ? 'chevR' : 'chevD')}</button>`); return; }
    if (cur && folded.includes(cur)) return;
    out.push(`<button class="nav-btn ${navOn(n.id) ? 'active' : ''}" data-act="go" data-route="${n.id}" ${n.tip ? `data-tip="${esc(n.tip)}"` : ''} ${navOn(n.id) ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${n.pend && pendingOf(n.id).length ? `<span class="count pend-count" data-act="pend" data-id="${n.id}" role="button" tabindex="0" title="Ver o que está pendente">${pendingOf(n.id).length}</span>` : ''}</button>`);
  });
  return out.join('');
}
ACTIONS['nav-fold'] = (el) => { const g = el.dataset.g; const cur = db.setting('navFold', []) || []; db.setSetting('navFold', cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g]); render(); };

function sidebarHTML() {
  const a = activeEntry();
  return `<div class="brand"><div class="brand-mark">${icon('clock')}</div><div><div class="brand-name">Tempo</div><div class="brand-sub">time sheet e projetos</div></div></div>
  ${sidebarNavHTML()}
  <div class="sidebar-foot">
    ${a ? `<button class="mini-timer" data-act="go" data-route="timesheet"><span class="row small"><span class="dot ${a.state === 'running' ? 'live' : 'paused'}"></span>${a.state === 'running' ? 'Registrando' : 'Pausado'}</span><span class="t" data-tick="${a.id}">${fmtClock(entryMs(a))}</span><span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(entryTitle(a))}</span>${pausesOf(a.id).length ? `<span class="small" style="color:var(--warn);font-weight:600">${pausesOf(a.id).length} pausa(s) para revisar</span>` : ''}</button>` : ''}
    <div class="data-mode"><span class="dot ${db.adapter.persistent ? 'live' : 'mem'}"></span>${db.adapter.waiting ? `Sem conexão · ${db.unsent()} alteraç${db.unsent() === 1 ? 'ão' : 'ões'} aguardando envio` : db.syncError ? 'Falha de sincronização' : db.adapter.persistent ? 'Sincronizado' : 'Em memória · some ao recarregar'} · ${APP_VERSION}${` · <a href="#" class="btn sm ghost" data-act="app-update" title="${window.TEMPO_NEW_VERSION ? 'Nova versão ' + esc(window.TEMPO_NEW_VERSION) + ' disponível' : 'Recarregar com a versão mais nova'}" ${window.TEMPO_NEW_VERSION ? 'style="color:var(--accent);font-weight:600"' : ''}>Atualizar</a>`}${db.adapter.persistent ? ` · <a href="#" class="btn sm ghost" data-act="signout">Sair</a>` : ''}</div>
    ${window.TEMPO_MAC_UPDATE ? `<button class="btn sm primary" data-act="mac-update" style="margin-top:6px;width:100%" title="O app do Mac fecha e abre sozinho em cerca de 1 minuto">Atualizar app do Mac (${esc(window.TEMPO_MAC_UPDATE)})</button>` : ''}
  </div>`;
}

function topTimerHTML() {
  const a = activeEntry();
  if (!a) return '';   // sem sessão: iniciar fica só na tela inicial ("Iniciar registro"), sem o botão de setinha aqui
  const trocar = `<button class="btn icon" data-act="ts-switch" aria-label="Trocar de projeto" title="Trocar de projeto sem pausar">${icon('switchplay')}</button>`;
  return (a.state === 'running'
    ? `<button class="btn icon" data-act="ts-pause" aria-label="Pausar" title="Pausar">${icon('pause')}</button>`
    : `<button class="btn icon" data-act="ts-resume" aria-label="Retomar" title="Retomar">${icon('play')}</button>`) + trocar;
}
function mobileTimerHTML() {
  const a = activeEntry();
  if (!a) return `<div class="grow"><div class="t">00:00:00</div><div class="p">Nenhuma sessão ativa</div></div><button class="btn primary" data-act="ts-start">${icon('play')} Iniciar</button>`;
  return `<div class="grow" data-act="go" data-route="timesheet"><div class="t" data-tick="${a.id}">${fmtClock(entryMs(a))}</div><div class="p">${esc(entryTitle(a))}</div></div>
    ${a.state === 'running' ? `<button class="btn icon" data-act="ts-pause" aria-label="Pausar">${icon('pause')}</button>` : `<button class="btn icon" data-act="ts-resume" aria-label="Retomar">${icon('play')}</button>`}
    <button class="btn icon danger" data-act="ts-stop" aria-label="Encerrar">${icon('stop')}</button>`;
}

let lastRoute = null;
/* Guarda a rolagem da página e das áreas com rolagem própria, para a tela não "subir" ao redesenhar. */
function keepScroll() {
  const content = $('.content');
  const anc = [...document.querySelectorAll('body *')].filter(e => e.scrollTop > 0 && !(content && content.contains(e))).map(e => [e, e.scrollTop]);
  const inner = content ? [...content.querySelectorAll('[style*="overflow"]')].map(e => e.scrollTop) : [];
  return { win: window.scrollY, anc, inner };
}
function restoreScroll(k) {
  k.anc.forEach(([e, t]) => { e.scrollTop = t; });
  const content = $('.content');
  if (content) [...content.querySelectorAll('[style*="overflow"]')].forEach((e, i) => { if (k.inner[i]) e.scrollTop = k.inner[i]; });
  window.scrollTo(0, k.win);
}
function render() {
  try { faixaCoresAplicar(); } catch (e) { /* antes do activity.js carregar */ }
  if (S.route === 'relatorios') S.route = relTab(db.setting('relTab', '')) ? db.setting('relTab', '') : 'productivity';
  const view = VIEWS[S.route] || VIEWS.timesheet;
  const v = { ...view() };
  // relatórios: cada um é um item do grupo Relatórios no menu; guarda o último aberto (rota antiga "relatorios" volta nele)
  if (relTab(S.route) && db.setting('relTab', '') !== S.route) { const r = S.route; setTimeout(() => db.setSetting('relTab', r), 0); }
  const scrollKeep = keepScroll();
  // preserva foco/cursor quando a tela é redesenhada durante a digitação
  const ae = document.activeElement; const fid = ae && ae.id && $('.content')?.contains(ae) ? ae.id : null; const sel = fid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null; const fval = fid ? ae.value : null;
  const fresh = lastRoute !== S.route; lastRoute = S.route;   // tela nova: monta do zero; mesma tela: mexe só no que mudou
  paint($('.sidebar'), sidebarHTML());
  $('.page-title').textContent = v.title;
  $('.crumb').textContent = NAV.find(n => navOn(n.id)) ? (['registry', 'import', 'prefs'].includes(S.route) ? 'Cadastros' : 'Workspace') : '';
  paint($('.top-actions'), (v.actions || '') + topTimerHTML(), fresh);
  const demo = db.setting('demo', false);
  const banner = demo ? `<div class="banner info">${icon('db', 'ico')}<span class="grow"><b>Dados fictícios</b> para testar as telas. Nada é salvo: ao recarregar, o app volta a este exemplo.</span><button class="btn sm" data-act="demo-clear">Começar vazio</button></div>` : '';
  paint($('.content'), banner + v.html, fresh);
  paint($('.mobile-timer'), mobileTimerHTML());
  restoreScroll(scrollKeep);
  document.title = 'Tempo';
  v.after && v.after();
  if (fid) { const el = document.getElementById(fid); if (el) { if (fval != null && el.value !== fval) el.value = fval; el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
}
db.subscribe(() => { render(); layers.forEach(l => l.live && l.refresh()); });

ACTIONS['demo-clear'] = async () => {
  if (!await confirmBox({ title: 'Começar vazio?', body: 'Remove todos os clientes, projetos, sessões e valores de exemplo. Tipos de trabalho, status e lembretes padrão continuam.', ok: 'Limpar dados', danger: true })) return;
  const keep = ['tempo_work_types', 'tempo_status_options', 'tempo_reminders', 'tempo_settings'];
  const snap = db.snapshot(); Object.keys(snap).forEach(t => { if (!keep.includes(t)) snap[t] = []; });
  snap.tempo_settings = snap.tempo_settings.filter(s => s.key !== 'demo');
  db.restore(snap); toast('Pronto. O app está vazio.');
};

/* ---------- relógio: atualiza só os números, sem redesenhar a tela ---------- */
setInterval(() => {
  const a = activeEntry();
  $$('[data-tick]').forEach(el => { const e = db.get('tempo_time_entries', el.dataset.tick); if (e) el.innerHTML = el.dataset.fmt === 'big' ? bigClock(entryMs(e)) : fmtClock(entryMs(e)); });
  $$('[data-tick-day]').forEach(el => { el.textContent = fmtDur(entriesOn(parseYmd(el.dataset.tickDay)).reduce((s, e) => s + entryMs(e), 0)); });
  if (a && a.state === 'running' && S.route === 'timesheet') $$('[data-strip-live]').forEach(el => updateLiveStrip(el, a));
  $$('[data-now-needle]').forEach(updateNowNeedle);
}, 1000);
function bigClock(ms) { const c = fmtClock(ms); return `${c.slice(0, 5)}<span class="sec">${c.slice(5)}</span>`; }

/* ---------- inatividade: pausas ----------
   Fontes: (1) app de Mac (mouse/teclado de verdade, e sono do computador) via window.TempoBridge.reportIdle;
   (2) aba do navegador, só quando o Mac não está registrando ("suspenso");
   (3) WhatsApp/Telegram (ver suggestActivity).
   Pausa por ociosidade é aplicada sozinha; o aviso fica só no registro. */
const idleLimit = () => Number(db.setting('idleMinutes', 2)) || 2;
/* Só o app de Mac cria pausas e registra atividade sozinho. Navegador e celular não contam nada automaticamente. */
const isMacApp = () => !!window.webkit?.messageHandlers?.tempo;
/* Trechos já cobertos da sessão: atividade registrada e pausas aceitas. Pausa nova nunca sobrepõe esses trechos. */
function coveredIntervals(a) {
  const act = actList(a.id).map(r => [new Date(r.from).getTime(), new Date(r.to).getTime()]);
  const paused = db.all('tempo_notices').filter(n => n.kind === 'pause' && n.status === 'accepted' && n.data?.entry_id === a.id)
    .map(n => [new Date(n.data.from).getTime(), new Date(n.data.to).getTime()]);
  return [...act, ...paused];
}
function uncoveredGap(a, fromMs, toMs) {
  const cov = coveredIntervals(a).filter(([x, y]) => y > fromMs && x < toMs).sort((p, q) => p[0] - q[0]);
  let best = null, cur = fromMs;
  cov.forEach(([x, y]) => { if (x > cur && (!best || x - cur > best[1] - best[0])) best = [cur, x]; cur = Math.max(cur, y); });
  if (toMs > cur && (!best || toMs - cur > best[1] - best[0])) best = [cur, toMs];
  return best || [fromMs, fromMs];
}
function suggestPause(fromMs, toMs, source, app) {
  if (!isMacApp()) return;   // navegador e celular não criam pausa sozinhos
  // app de distração (WhatsApp de amigo, Instagram…): conta a partir de 10 s, que é o mínimo que o Mac registra
  // tela bloqueada também: qualquer bloqueio é pausa, mesmo curto (antes, menos de 2 min contava como trabalho)
  const minMs = source === 'app' || app === 'Tela bloqueada' ? 10000 : idleLimit() * 60000;
  const a = activeEntry(); if (!a || toMs - fromMs < minMs) return;
  // só dentro do tempo trabalhado: o maior trecho de intervalo trabalhado que cai no período (antes, cortava pelo
  // início do último intervalo e perdia o buraco quando outra pausa, ex.: sono, já tinha entrado depois dele)
  const work = (a.segments || []).map(s => [Math.max(fromMs, new Date(s.s).getTime()), Math.min(toMs, s.e ? new Date(s.e).getTime() : Infinity)])
    .filter(([x, y]) => y > x).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
  if (!work.length) return; [fromMs, toMs] = work[0];
  // inatividade não pode cobrir uso de app: a pausa vai só para o maior trecho sem atividade registrada
  if (source !== 'app') [fromMs, toMs] = uncoveredGap(a, fromMs, toMs);
  if (toMs - fromMs < minMs) return;
  if (pausesOf(a.id).some(n => Math.abs(new Date(n.data.from) - fromMs) < (source === 'app' ? 5000 : 60000))) return;
  const from = new Date(fromMs).toISOString(), to = new Date(toMs).toISOString();
  addNotice({ kind: 'pause', key: `pause:${a.id}:${from}`, title: `Pausa sugerida: ${fmtDur(toMs - fromMs)}`, body: `Parado entre ${fmtTime(from)} e ${fmtTime(to)}; voltou às ${fmtTime(to)}.`, entity: 'entry', entity_id: a.id, project_id: a.project_id, data: { entry_id: a.id, from, to, source, app: app || null } }, true);   // calado: entra já aplicada, sem piscar o cartão de "pausa sugerida"
  // inatividade vira pausa sozinha (sem aprovação): o aviso fica só para registro
  const auto = db.all('tempo_notices').find(x => x.key === `pause:${a.id}:${from}`);
  // espiada curta (menos de 1 min) entra calada; só pausa maior mostra o aviso
  if (auto) { applyPause(a, auto, 'insert'); if (lockCheck()) return; db.emit(); if (toMs - fromMs >= 60000) toast(`${icon('alert', 'ico')} Pausa aplicada: ${fmtDur(toMs - fromMs)} parado, voltou às ${fmtTime(to)}`); return; }
  toast(`${icon('alert', 'ico')} Pausa sugerida: ${fmtDur(toMs - fromMs)} parado, voltou às ${fmtTime(to)}`, { actions: [{ label: 'Revisar', run: () => go('timesheet') }] });
  notifyNative('Pausa sugerida', `${fmtDur(toMs - fromMs)} parado (${fmtTime(from)}–${fmtTime(to)})`);
}
/* Tela bloqueada > 1 h: encerra a sessão ativa no começo do bloqueio (avisa). */
function lockCheck() {
  if (!isMacApp()) return null;
  const a = activeEntry(); if (!a) return null;
  const cut = lockAutoEnd(db.get('tempo_time_entries', a.id) || a); if (!cut) return null;
  db.emit(); toast(`${icon('alert', 'ico')} Sessão encerrada às ${fmtTime(cut)}: a tela ficou bloqueada por mais de 1 h.`, { ms: 8000 });
  notifyNative('Sessão encerrada', `Tela bloqueada por mais de 1 h; encerrada às ${fmtTime(cut)}.`);
  return cut;
}
/* Atualiza os dados a cada minuto e ao voltar para a janela, para o Mac enxergar a sessão iniciada em outro lugar. */
setInterval(() => db.refresh(), 60000);
setInterval(() => { try { pzReverTudo(); lockCheck(); } catch (e) { console.warn('pausas', e); } }, 60000);
setTimeout(() => { try { pzReverTudo(); lockCheck(); } catch (e) { console.warn('pausas', e); } }, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') db.refresh(); });
/* Ponte do app de Mac. O app guarda os eventos numa fila e só tira da fila quando esta função roda. */
window.TempoBridge = {
  reportNfse: (itens) => nfseReport(itens),
  // notas fiscais emitidas (pasta do iCloud): devolve { ids, renomear }
  reportNotasEmitidas: (itens, inventario) => (typeof nfReport === 'function' ? nfReport(itens, inventario) : { ids: [], renomear: [] }),
  // o app do Mac avisa que há versão nova dele mesmo: mostra o botão "Atualizar app do Mac"
  macUpdate: (v) => { if (window.TEMPO_MAC_UPDATE !== v) { window.TEMPO_MAC_UPDATE = v; render(); } },
  reportIdle: async (fromISO, toISO, app) => {
    try { await db.refresh(); suggestPause(new Date(fromISO).getTime(), new Date(toISO).getTime(), 'mac', app); }
    catch (e) { console.warn('reportIdle', e); }
  },
  reportActivity: (seg) => suggestActivity(seg),
  reportWhatsApp: (linhas) => waReport(linhas),
  // conversas: última recebida/enviada, resposta média e mensagens enviadas (para o celular rotular pausas)
  reportWhatsAppConversas: (d) => waReportConversas(d),
  // o app do Mac avisa se criou o lembrete (alarme de to-do) no app Lembretes
  reminderDone: (id, ok) => todoAlarmDone(id, ok),
  version: 3,
};

/* Atividade em primeiro plano vinda do app de Mac: { from, to, app, doc?, folder? }.
   Grava sozinha (sem Aceitar) se houver sessão rodando e a atividade tiver ao menos 10 segundos. */
const pathNorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const FOLDER_STOP = new Set(['projetos', 'projeto', 'arquivos', 'arquivo', 'desktop', 'documentos', 'documents', 'downloads', 'pasta', 'library', 'volumes', 'icloud', 'drive', 'mobile documents', 'com apple cloud docs', 'final', 'finais', 'sources', 'assets', 'trabalho']);
/* Pedaços da pasta que servem de chave: sem /Users/<nome>, do mais fundo para o mais raso. */
function folderParts(folder) {
  const n = String(folder || '').split('/').map(pathNorm);
  const cut = n.findIndex(p => p === 'users' || p === 'home');
  return n.slice(cut >= 0 ? cut + 2 : 0).filter(p => p.length >= 3 && !FOLDER_STOP.has(p)).reverse();
}
function folderRule(folder) {
  const rules = db.setting('folderRules', []) || [];
  for (const part of folderParts(folder)) { const r = rules.find(x => x.key === part); if (r) return r; }
  return null;
}
/* Aprende: ao aceitar uma sugestão ligada a um projeto, a pasta passa a apontar para ele. Última confirmação vence. */
function learnFolderRule(folder, projectId, clientId) {
  const parts = folderParts(folder); if (!parts.length || !projectId) return;
  const rules = (db.setting('folderRules', []) || []).filter(r => !parts.includes(r.key));
  parts.forEach(k => rules.push({ key: k, project_id: projectId, client_id: clientId || null }));
  db.setSetting('folderRules', rules);
}
/* Sem sessão e app de trabalho (pasta/projeto conhecido, ou app de design mesmo sem projeto): começa a contar
   desde o horário em que você estava ali (provisório). Confirmar = entra no bruto. Negar = arquiva (pode resgatar).
   Sem projeto, vira sessão avulsa para você ligar depois. */
const DESIGN_APP_RE = /adobe|illustrator|photoshop|indesign|after effects|premiere|lightroom|cinema ?4d|blender|figma|sketch|affinity|procreate|davinci/i;
const DEFAULT_PAUSE_APPS = ['WhatsApp', 'Telegram', 'Mensagens', 'Messages', 'Netflix'];
const DEFAULT_PAUSE_SITES = ['instagram', 'youtube', 'tiktok', 'netflix', 'prime video', 'disney', 'hbo max', 'globoplay', 'crunchyroll', 'twitch', 'paramount', 'apple tv'];   // streaming e redes: pelo título da aba
const BROWSER_RE = /chrome|safari|edge|firefox|arc|brave/i;
/* Cronômetro para a barra de menus do Mac: manda o estado a cada 5 s (no navegador não faz nada). */
setInterval(() => {
  const a = activeEntry();
  try { window.webkit?.messageHandlers?.tempo?.postMessage({ type: 'timer', running: !!a && a.state === 'running', paused: !!a && a.state === 'paused', ms: a ? entryMs(a) : 0 }); } catch (e) {}
}, 5000);
/* Notificação do sistema (só no app de Mac; no navegador não faz nada). */
function notifyNative(title, body) { try { window.webkit?.messageHandlers?.tempo?.postMessage({ title, body }); } catch (e) {} }
/* Avisos de atividade já decididos e com mais de 30 dias saem do banco, para a lista não crescer para sempre. */
function pruneOldActivity() {
  const limit = Date.now() - 30 * 86400000;
  db.where('tempo_notices', n => n.kind === 'activity' && n.status !== 'pending' && new Date(n.created_at || 0).getTime() < limit).forEach(n => db.remove('tempo_notices', n.id, true));
}
let _pruned = false;
function suggestStart(p, seg) {
  const pid = p ? p.id : null;
  const pending = db.all('tempo_notices').some(n => n.kind === 'start' && n.status === 'pending' && (n.data?.project_id || null) === pid);
  if (pending || activeEntry()) return;
  const client = p ? clientOf(p) : null;
  const sel = { project_id: pid, client_id: client?.id || null, agency_id: client?.agency_id || null, task_id: null, work_type_id: null, notes: '', revision_id: null };
  const e = startEntry(sel); if (!e) return;
  db.update('tempo_time_entries', e.id, { segments: [{ s: new Date(freeStartFrom(new Date(seg.from).getTime(), e.id)).toISOString(), e: null }] }, true);
  notifyNative(p ? `Contando em ${p.name}` : `Detectada atividade no ${shortProgram(seg.app)}`, `Confirme para entrar no bruto, negue para arquivar.`);
  const unsaved = !seg.folder ? 'Arquivo ainda não salvo. ' : '';
  addNotice({ kind: 'start', key: `start:${e.id}`, title: p ? `Começar ${p.name}?` : `Detectada atividade no ${shortProgram(seg.app)}`, body: `${unsaved}Confirme para entrar no bruto, negue para arquivar.`, entity: 'entry', entity_id: e.id, project_id: pid, data: { project_id: pid, entry_id: e.id, snapshot: null, from: seg.from, app: seg.app, unsaved: !seg.folder } });
}
async function suggestActivity(seg) {
  if (!isMacApp() || !seg || !seg.app) return;   // atividade só vem do app de Mac
  // o macOS às vezes manda o nome com marcas invisíveis (ex.: "‎WhatsApp"); sem limpar, a lista de pausa não reconhece
  seg = { ...seg, app: String(seg.app).replace(/[‎‏‪-‮⁦-⁩]/g, '').trim() };
  // dados atuais antes de gravar: com uma cópia antiga, a gravação apagaria registros feitos pelo outro lado
  try { await db.refresh(); } catch (e) { console.warn('refresh', e); }
  if (!_pruned) { _pruned = true; pruneOldActivity(); }
  const fromMs = new Date(seg.from).getTime(), toMs = new Date(seg.to).getTime();
  // troca de app com menos de 10 s é ignorada; a partir disso entra no log e no gráfico
  if (!(toMs > fromMs) || toMs - fromMs < 10000) return;
  // fim do último registro antes deste (para achar o tempo sem nenhum registro do computador)
  const prevEnd = [ymd(new Date(fromMs - 86400000)), ymd(new Date(fromMs))].flatMap(d => logRecsDay(d))
    .map(r => new Date(r.to).getTime()).filter(t => t <= fromMs + 1000).reduce((m, t) => Math.max(m, t), 0);
  // o log do dia recebe tudo, com ou sem sessão ativa
  const logged = logAppend(seg);
  // revisão das pausas pelo registro (pega o que um evento de ociosidade/sono deixou passar)
  setTimeout(() => { try { pzReverTudo(); lockCheck(); } catch (e) { console.warn('pausas', e); } }, 1500);
  trackUnsaved(seg, toMs - fromMs);
  const a = activeEntry();
  const pauseApps = (db.setting('pauseApps', DEFAULT_PAUSE_APPS) || []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  // sites que pausam: navegador em primeiro plano com um desses termos no título da aba (ex.: Instagram no Chrome)
  const pauseSites = (db.setting('pauseSites', DEFAULT_PAUSE_SITES) || []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const siteHit = BROWSER_RE.test(String(seg.app)) ? pauseSites.find(s => String(seg.doc || '').toLowerCase().includes(s)) : null;
  const isPauseApp = pauseApps.includes(String(seg.app).toLowerCase()) || !!siteHit;
  const rule = folderRule(seg.folder);
  const ruleProject = rule ? db.get('tempo_projects', rule.project_id) : null;
  // computador sem nenhum registro (desligado, sem bateria, app do Mac fechado): é sempre pausa
  if (a && a.state === 'running' && prevEnd && fromMs - prevEnd >= idleLimit() * 60000) suggestPause(prevEnd, fromMs, 'mac', 'Sem registro');
  // Mac bloqueado (loginwindow): nunca é trabalho; com sessão rodando vira pausa sozinha, como ociosidade
  if (/^loginwindow$/i.test(seg.app)) { if (a && a.state === 'running') suggestPause(fromMs, toMs, 'mac', 'Tela bloqueada'); return; }
  if (!a) { if (!isPauseApp && (ruleProject || DESIGN_APP_RE.test(seg.app))) suggestStart(ruleProject, seg); return; }
  if (a.state === 'running' && !isPauseApp) recordActivity(a, { ...seg, rid: logged?.rid || null });
  // WhatsApp de trabalho (cliente, agência, colega, fornecedor, administrativo) conta como trabalho, sem perguntar;
  // qualquer outra conversa vira pausa sozinha, sem aprovação (ela entra como distração nos relatórios).
  if (isPauseApp) {
    const contato = waContato(seg.doc);
    if (contato && waEhTrabalho(contato)) {
      if (a.state === 'running') recordActivity(a, { ...seg, rid: logged?.rid || null });
      return;
    }
    suggestPause(fromMs, toMs, 'app', siteHit ? siteHit.replace(/^./, c => c.toUpperCase()) : (contato && waEhServico(contato) ? WA_SERVICOS : seg.app));
  }
}
/* Arquivo sem salvar há muito tempo (programas de criação). "Nunca salvo" (Untitled, Sem título, sem caminho):
   avisa com 15 min de uso; alterações não salvas (título com "*"): com 30 min. Repete a cada novo bloco do mesmo tamanho.
   Salvou (sumiu o "*" e tem caminho) → zera. Janelas internas (Save As, Composition Settings…) não contam. */
const UNSAVED_NEW_MS = 15 * 60e3, UNSAVED_DIRTY_MS = 30 * 60e3;
const UNSAVED_RE = /untitled|sem t[ií]tulo|sem nome|novo arquivo|novo documento|arquivo sem nome|unnamed|unsaved|^documento ?\d*$/i;
const UNSAVED_STATE = {};
function trackUnsaved(seg, ms) {
  if (!DESIGN_APP_RE.test(seg.app) || !seg.doc) return;
  const doc = String(seg.doc);
  const fam = appFamily(seg.app);
  const inf = fam ? actDocInfo(seg.app, doc) : { win: false, name: doc.replace(/\s*\*\s*$/, ''), path: seg.folder || '' };
  if (inf.win) return;
  const nunca = UNSAVED_RE.test(inf.name) || (!inf.path && !seg.folder && !/\.[a-z0-9]{2,5}$/i.test(inf.name));   // sem caminho e sem extensão = ainda não foi salvo
  const sujo = /\*\s*$/.test(doc) || nunca;
  const key = shortProgram(seg.app) + '|' + inf.name.toLowerCase();
  if (!sujo) { delete UNSAVED_STATE[key]; return; }
  const st = UNSAVED_STATE[key] || (UNSAVED_STATE[key] = { ms: 0, n: 0 });
  st.ms += ms;
  const lim = nunca ? UNSAVED_NEW_MS : UNSAVED_DIRTY_MS;
  const n = Math.floor(st.ms / lim);
  if (n <= st.n) return;
  st.n = n;
  const title = nunca ? `Arquivo nunca salvo há ${fmtDur(st.ms)}` : `Sem salvar há ${fmtDur(st.ms)}`;
  const body = `${inf.name} no ${shortProgram(seg.app)}. ${nunca ? 'Dê um nome e salve numa pasta do projeto' : 'Salve (Cmd+S)'} para não perder o trabalho.`;
  addNotice({ kind: 'salvar', key: `salvar:${key}:${ymd(new Date())}:${n}`, title, body, data: { app: seg.app, doc: inf.name, ms: st.ms } });
  notifyNative(title, body);
}
CHANGES['pause-apps'] = (el) => { db.setSetting('pauseApps', el.value.split(',').map(x => x.trim()).filter(Boolean)); };
CHANGES['ia-key'] = (el) => { db.setSetting('anthropicKey', el.value.trim()); toast('Chave salva'); };
CHANGES['pause-sites'] = (el) => { db.setSetting('pauseSites', el.value.split(',').map(x => x.trim()).filter(Boolean)); };

let idleDetector = null;
async function startIdleDetection(ask) {
  if (!('IdleDetector' in window)) { if (ask) toast('Este navegador não tem detecção de ociosidade. Funciona no Chrome/Edge do Mac e, no futuro, pelo app de Mac.'); return false; }
  try {
    if (ask && (await IdleDetector.requestPermission()) !== 'granted') { toast('Permissão negada.'); return false; }
    idleDetector = new IdleDetector(); let idleSince = null;
    idleDetector.addEventListener('change', () => {
      const idle = idleDetector.userState === 'idle' || idleDetector.screenState === 'locked';
      if (idle && !idleSince) idleSince = Date.now() - 60000;
      if (!idle && idleSince) { suggestPause(idleSince, Date.now(), 'ocioso'); idleSince = null; }
    });
    await idleDetector.start({ threshold: 60000 });
    db.setSetting('idleDetect', true); return true;
  } catch (e) { if (ask) toast('Não foi possível ativar aqui. Na versão publicada no Chrome do Mac funciona.'); return false; }
}
const pausesOf = (entryId) => db.all('tempo_notices').filter(n => n.kind === 'pause' && n.status === 'pending' && n.data?.entry_id === entryId);
function applyPause(a, n, mode) {
  const sug = n.data; const before = clone(a.segments); let segs = clone(a.segments); const f = sug.from, t = sug.to;
  if (mode === 'end') {
    segs = segs.filter(s => new Date(s.s) < new Date(f)); const last = segs[segs.length - 1]; if (last && (!last.e || new Date(last.e) > new Date(f))) last.e = f;
    db.update('tempo_time_entries', a.id, { segments: segs, state: 'done', edits: auditEdit(a, before, `Encerrada às ${fmtTime(f)} (sugestão de inatividade)`) }, true);
    decideNotice(n, 'done', `Sessão encerrada às ${fmtTime(f)}`);   // o antes fica no histórico de correções da sessão (a tabela de avisos não tem coluna para isso)
    pausesOf(a.id).forEach(o => decideNotice(o, 'ignored', 'Descartada ao encerrar a sessão'));
    return;
  }
  const out = []; segs.forEach(s => { const S0 = new Date(s.s), E0 = s.e ? new Date(s.e) : null; const F = new Date(f), T = new Date(t);
    if (E0 && E0 <= F || S0 >= T) { out.push(s); return; }
    // motivo da pausa: "mac"/"suspenso"/"ocioso", ou o nome do app que pausou (ex.: WhatsApp)
    if (S0 < F) out.push({ s: s.s, e: f, why: sug.source === 'app' && sug.app ? sug.app : (sug.source === 'mac' && (sug.app === 'sono' || sug.app === 'Tela bloqueada' || sug.app === 'Sem registro') ? sug.app : sug.source) });
    if (!E0 || E0 > T) out.push({ s: t, e: s.e });
  });
  db.update('tempo_time_entries', a.id, { segments: out, edits: auditEdit(a, before, `Pausa de ${fmtDur(new Date(t) - new Date(f))} inserida (${fmtTime(f)}–${fmtTime(t)})`) }, true);
  decideNotice(n, 'accepted', `Pausa inserida (${fmtTime(f)}–${fmtTime(t)})`);
}
function pauseSuggestionsHTML(a) {
  const list = pausesOf(a.id).sort((x, y) => x.data.from.localeCompare(y.data.from)); if (!list.length) return '';
  return `<div class="sugs"><div class="row between"><b class="small">${icon('alert', 'ico')} ${list.length} pausa(s) sugerida(s)</b>${list.length > 1 ? `<button class="btn sm" data-act="sug-all" data-id="${a.id}">Aceitar todas</button>` : ''}</div>
    ${list.map(n => `<div class="sug"><div class="grow small">${pauseText(n)}</div>${noticeButtons(n)}</div>`).join('')}</div>`;
}
const PAUSE_SRC = { suspenso: 'modo espera / computador suspenso', ocioso: 'sem mouse/teclado', mac: 'app de Mac', app: 'app de pausa' };
function pauseText(n) { const x = n.data; return `Você ficou parado <b>${fmtDur(new Date(x.to) - new Date(x.from))}</b> (${fmtTime(x.from)}–${fmtTime(x.to)}) e voltou às <b>${fmtTime(x.to)}</b>.<span class="faint"> ${PAUSE_SRC[x.source] || ''}${x.app ? ' · ' + esc(x.app) : ''}</span>`; }
ACTIONS['sug-all'] = (el) => { pausesOf(el.dataset.id).forEach(n => applyPause(db.get('tempo_time_entries', el.dataset.id), n)); db.emit(); toast('Pausas inseridas'); };

/* ---------- lembretes ---------- */
const remState = {}; // último disparo por lembrete nesta sessão do navegador
function reminderDue(r, now) {
  if (!r.active || r.done) return false;
  const dow = now.getDay(), hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  const dayOk = r.days === 'all' || (r.days === 'weekdays' && dow >= 1 && dow <= 5) || (r.days === 'weekends' && (dow === 0 || dow === 6)) ||
    (r.days === 'custom' && (r.customDays || []).map(Number).includes(dow)) || (r.days === 'date' && r.date === ymd(now));
  if (!dayOk) return false;
  if (r.nightWeekendOnly) { const h = now.getHours(); if (!(dow === 0 || dow === 6 || h >= 22 || h < 8)) return false; }
  const a = activeEntry();
  if (r.kind === 'start' && a) return false;
  if ((r.kind === 'stop' || r.kind === 'review_session') && !a) return false;
  const last = remState[r.id] ?? r.lastFired ?? null;
  if (r.freq === 'fixed' || r.freq === 'once') {
    if (hm < r.time) return false;
    const [h, m] = r.time.split(':').map(Number); const target = new Date(now); target.setHours(h, m, 0, 0);
    if (now - target > 30 * 60000) return false;           // só dispara perto do horário
    return !last || new Date(last) < target;
  }
  if (r.freq === 'interval') {
    const step = (Number(r.intervalHours) || 1) * 3600000;
    if (r.kind === 'review_session') { if (entryMs(a) < step) return false; }
    return last ? now - new Date(last) >= step : false;
  }
  return false;
}
function reminderText(r) {
  const a = activeEntry();
  const k = r.kind === 'context' ? (a ? 'stop' : 'start') : r.kind;
  return { start: 'Nenhuma sessão ativa. Quer iniciar um registro?', stop: `Sessão “${a ? esc(entryTitle(a)) : ''}” em andamento. Encerrar ou revisar?`, review_session: `A sessão atual já tem ${a ? fmtDur(entryMs(a)) : ''}. Ainda está trabalhando nela?`, review_day: 'Hora de conferir os registros de hoje.', custom: esc(r.message || r.name) }[k];
}
function fireReminder(r) {
  const a = activeEntry(); const actions = [];
  addNotice({ kind: 'reminder', key: `rem:${r.id}:${new Date().toISOString().slice(0, 16)}`, title: r.name, body: reminderText(r).replace(/<[^>]+>/g, ''), entity: 'reminder', entity_id: r.id, status: 'done', decision: 'Lembrete exibido' });
  if (!a && ['start', 'context'].includes(r.kind)) actions.push({ label: 'Iniciar registro', primary: true, run: () => openStartModal() });
  if (a && ['stop', 'context', 'review_session'].includes(r.kind)) { actions.push({ label: 'Encerrar', primary: true, run: () => ACTIONS['ts-stop']() }); actions.push({ label: 'Revisar', run: () => openEntryModal(a.id) }); }
  if (r.kind === 'review_day') actions.push({ label: 'Abrir Time Sheet', primary: true, run: () => { S.tsDay = ymd(new Date()); go('timesheet'); } });
  actions.push({ label: 'Dispensar', run: () => {} });
  toast(`<div class="row">${icon('bell', 'ico')}<b>${esc(r.name)}</b></div><div class="small">${reminderText(r)}</div>`, { cls: 'rem', sticky: true, actions });
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Tempo — ' + r.name, { body: reminderText(r).replace(/<[^>]+>/g, '') }); } catch (e) {}
}
function checkReminders() {
  const now = new Date();
  db.all('tempo_reminders').forEach(r => {
    if (reminderDue(r, now)) {
      remState[r.id] = now.toISOString();
      db.update('tempo_reminders', r.id, { lastFired: now.toISOString(), ...(r.freq === 'once' ? { done: true } : {}) }, true);
      fireReminder(r);
    }
  });
}
setInterval(() => checkReminders(), 30000);
setInterval(() => { try { logSweep(); logPurge(); } catch (e) { console.warn('log', e); } }, 3600000);
setTimeout(() => { try { logSweep(); logPurge(); } catch (e) { console.warn('log', e); } }, 8000);
setInterval(() => scanAlerts(), 300000);
setInterval(() => ensureMonthSheets(), 3600000);
// ao abrir o app, busca extratos e avisos de Pix novos (também acontece ao abrir PJ/PF)
setTimeout(() => { checkEntries(); if (db.adapter && db.adapter.persistent) bankRefresh(); }, 4000);

/* ---------- aparência ---------- */
function applyAppearance() {
  if (typeof applyExCats === 'function') applyExCats();
  const root = document.documentElement;
  const pt = themePreview || activeThemeOf(); const theme = (pt && pt.mode) || db.setting('theme', 'system');   // tema com base Dia/Noite manda no modo
  if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  const [l, d] = ACCENTS[db.setting('accent', 'cobalto')] || ACCENTS.cobalto;
  const css = (c, dark) => `--accent:${c};--accent-soft:color-mix(in srgb, ${c} ${dark ? 22 : 12}%, var(--surface));--accent-line:color-mix(in srgb, ${c} ${dark ? 45 : 35}%, var(--surface));--accent-fg:${dark ? '#0D1030' : '#FFFFFF'};`;
  $('#accent-style').textContent = `:root{${css(l)}} @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${css(d, 1)}}} :root[data-theme="dark"]{${css(d, 1)}}`;
  root.style.setProperty('--font-ui', fontFamilyOf(db.setting('font', 'sonoma')));
  applyThemeVars();
  root.style.setProperty('--fs', db.setting('fontSize', 14) + 'px');
  root.style.setProperty('--row-pad', db.setting('rowPad', 3) + 'px');
  root.style.setProperty('--row-pad-fin', db.setting('rowPadFin', 0) + 'px');
  const r = Number(db.setting('radius', DEFAULT_RADIUS));
  root.style.setProperty('--radius', r + 'px'); root.style.setProperty('--radius-sm', Math.max(0, Math.round(r * .6)) + 'px');
}

/* ---------- inicialização ---------- */
ACTIONS.signout = async () => {
  try { await window.tempoClient?.auth.signOut(); } catch (e) { /* segue mesmo assim */ }
  try { localStorage.removeItem('tempo-cache-v1'); localStorage.removeItem('tempo-outbox-v1'); } catch (e) { /* sem armazenamento */ }
  location.reload();
};

// Compara a versão desta página com a publicada no site (sem cache) e mostra "Atualizar" no rodapé se for mais nova.
async function checkAppVersion() {
  try {
    const txt = await (await fetch('/js/config.js?t=' + Date.now(), { cache: 'no-store' })).text();
    const m = txt.match(/APP_VERSION\s*=\s*'([^']+)'/);
    if (m && m[1] !== APP_VERSION) { window.TEMPO_NEW_VERSION = m[1]; render(); }
  } catch (e) { /* sem internet: não mostra nada */ }
}
ACTIONS['mac-update'] = async () => {
  // app do Mac (Swift): ele mesmo baixa, compila e reabre
  if (isMacApp()) { window.webkit.messageHandlers.tempo.postMessage({ type: 'update' }); return toast('Procurando atualização do app do Mac. Se houver, ele fecha e abre sozinho.', { ms: 8000 }); }
  const api = window.pywebview && window.pywebview.api;
  if (!api || !api.atualizar_app) return toast('Abra o Tempo no Mac para atualizar o app.');
  try { await api.atualizar_app(); toast('Atualizando o app do Mac. Ele fecha e abre sozinho em cerca de 1 minuto.', { ms: 8000 }); }
  catch (e) { toast('Não consegui iniciar a atualização do app do Mac.'); }
};
/* Link de arquivo na Anotação (nota fiscal, comprovante): abre no Mac. No navegador, copia o caminho. */
ACTIONS['file-open'] = async (el) => {
  const path = el.dataset.path; if (!path) return;
  if (isMacApp()) { try { window.webkit.messageHandlers.tempo.postMessage({ type: 'open', path }); } catch (e) { toast('Não consegui abrir o arquivo.'); } return; }
  try { await navigator.clipboard.writeText(path); toast('Caminho copiado. No app do Mac, o link abre o arquivo direto.'); }
  catch (e) { toast('Abra pelo app do Mac para o arquivo abrir com um clique.'); }
};
ACTIONS['app-update'] = async () => {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map(r => r.unregister()));
    const keys = await caches?.keys?.() || [];
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch (e) { /* segue e recarrega mesmo assim */ }
  location.reload();
};

async function boot() {
  const online = !!(TEMPO_CFG.supabaseUrl && window.supabase);
  let adapter = new MemoryAdapter();
  if (online) {
    const client = window.supabase.createClient(TEMPO_CFG.supabaseUrl, TEMPO_CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
    window.tempoClient = client;
    await authGate(client);
    adapter = new SupabaseAdapter(client);
  }
  db.onCache = () => { try { render(); } catch (e) { /* tela completa vem depois */ } };
  await db.init(adapter);
  db.onCache = null;
  if (db.syncError) {
    // não semeia nem mostra nada por cima: evita duplicar dados se a leitura falhou
    document.querySelector('.content').innerHTML = `<div class="banner warn">${icon('alert', 'ico')}<span class="grow"><b>Não consegui ler seus dados.</b> ${esc(db.syncError)}</span><button class="btn sm" onclick="location.reload()">Tentar de novo</button></div>`;
    return;
  }
  if (!db.all('tempo_work_types').length) seedConfig();
  if (db.all('tempo_status_options').length && !db.where('tempo_status_options', s => s.kind === 'payment' && s.name === 'Fee').length) db.insert('tempo_status_options', { kind: 'payment', name: 'Fee', color: 'blue', category: 'closed', order: 9 }, true);
  if (db.all('tempo_status_options').length && !db.where('tempo_status_options', s => s.kind === 'payment' && s.name === 'Projeto pessoal').length) db.insert('tempo_status_options', { kind: 'payment', name: 'Projeto pessoal', color: 'purple', category: 'closed', order: 10 }, true);
  ensureStatusKinds();
  ensureDirectAgency();
  ensureMonthSheets();
  exEnsureMonths();
  if (!online && !db.all('tempo_projects').length && !db.setting('startedEmpty', false)) seedDemo();
  const now = new Date().toISOString();
  db.all('tempo_reminders').forEach(r => { if (r.freq === 'interval' && !r.lastFired) remState[r.id] = now; });
  const h = (location.hash || '').slice(1); if (NAV.some(n => n.id === h) || relTab(h)) S.route = h;
  applyAppearance();
  db.subscribe(applyAppearance);
  // quando uma despesa, projeto ou orçamento muda, reavalia os avisos (com pequena folga para agrupar mudanças)
  let scanT = null;
  db.subscribe(() => { clearTimeout(scanT); scanT = setTimeout(() => { scanAlerts(); try { reunioesVincular(); } catch (e) { /* ok */ } }, 1500); });
  scanAlerts();
  try { reunioesVincular(); } catch (e) { /* reuniões sem tarefa entram na tarefa fixa do projeto */ }
  if (db.setting('idleDetect', false)) startIdleDetection(false);
  render();
  checkAppVersion();
  setInterval(checkAppVersion, 30 * 60 * 1000);
  todoAlarmSync();   // alarmes de to-do ainda não criados no app Lembretes (app do Mac)
}
