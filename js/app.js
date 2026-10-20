/* =====================================================================
   SHELL — navegação, renderização, cronômetro, inatividade, lembretes
   ===================================================================== */
const S = {
  route: 'timesheet',
  tsDay: ymd(new Date()),
  proj: { view: 'table', q: '', agency: '', client: '', status: '', pay: '', wt: '', year: '', month: '', from: '', to: '', situ: 'all', sort: { key: 'deadline', dir: 1 },
          cols: null, hidden: null, calMonth: null },
  task: { q: '', project: '', status: '', mine: 'open' },
  quote: { q: '', status: '' },
  fin: { agency: '', client: '', status: '', pay: '', year: '', month: '', from: '', to: '' },
  rep: { period: 'month', from: '', to: '', agency: '', client: '', group: 'client' },
  reg: { tab: 'agencies', q: '' },
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
  if (id === 'notices') {
    return db.all('tempo_notices').filter(n => n.status === 'pending' && n.kind !== 'todo').map(n => ({ label: PEND_KIND[n.kind] || n.kind, why: n.created_at ? 'desde ' + fmtDate(n.created_at) : 'aguardando sua decisão', route: 'notices' }));
  }
  return [];
}
const NAV = [
  { id: 'timesheet', label: 'Time Sheet', icon: 'clock' },
  { group: 'PJ' },
  { id: 'registry', label: 'Agências e clientes', icon: 'users' },
  { id: 'projects', label: 'Projetos', icon: 'folder' },
  { id: 'tasks', label: 'Tarefas', icon: 'check' },
  { id: 'quotes', label: 'Orçamentos', icon: 'doc' },
  { id: 'finance', label: 'Financeiro PJ', icon: 'money' },
  { id: 'reports', label: 'Relatórios PJ', icon: 'chart' },
  { group: 'PF' },
  { id: 'financepf', label: 'Financeiro PF', icon: 'money' },
  { id: 'expenses', label: 'Despesas', icon: 'money', pend: true },
  { id: 'reimb', label: 'Reembolsos', icon: 'layers', pend: true },
  { id: 'shared', label: 'Despesas Rafa', icon: 'users' },
  { id: 'reportspf', label: 'Relatórios PF', icon: 'chart' },
  { group: 'Geral' },
  { id: 'todo', label: 'To-do', icon: 'check' },
  { id: 'notices', label: 'Avisos', icon: 'bell', pend: true },
  { id: 'lixeira', label: 'Lixeira de log', icon: 'trash' },
  { id: 'prefs', label: 'Configurações', icon: 'gear' }
];
const VIEWS = {};

function go(route) {
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

function sidebarHTML() {
  const a = activeEntry();
  return `<div class="brand"><div class="brand-mark">${icon('clock')}</div><div><div class="brand-name">Tempo</div><div class="brand-sub">time sheet e projetos</div></div></div>
  ${NAV.map(n => n.group ? `<div class="nav-group">${n.group}</div>` :
    `<button class="nav-btn ${S.route === n.id ? 'active' : ''}" data-act="go" data-route="${n.id}" ${S.route === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${n.pend && pendingOf(n.id).length ? `<span class="count pend-count" data-act="pend" data-id="${n.id}" role="button" tabindex="0" title="Ver o que está pendente">${pendingOf(n.id).length}</span>` : ''}</button>`).join('')}
  <div class="sidebar-foot">
    ${a ? `<button class="mini-timer" data-act="go" data-route="timesheet"><span class="row small"><span class="dot ${a.state === 'running' ? 'live' : 'paused'}"></span>${a.state === 'running' ? 'Registrando' : 'Pausado'}</span><span class="t" data-tick="${a.id}">${fmtClock(entryMs(a))}</span><span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(entryTitle(a))}</span>${pausesOf(a.id).length ? `<span class="small" style="color:var(--warn);font-weight:600">${pausesOf(a.id).length} pausa(s) para revisar</span>` : ''}</button>` : ''}
    <div class="data-mode"><span class="dot ${db.adapter.persistent ? 'live' : 'mem'}"></span>${db.syncError ? 'Falha de sincronização' : db.adapter.persistent ? 'Sincronizado' : 'Em memória · some ao recarregar'} · ${APP_VERSION}${` · <a href="#" class="btn sm ghost" data-act="app-update" title="${window.TEMPO_NEW_VERSION ? 'Nova versão ' + esc(window.TEMPO_NEW_VERSION) + ' disponível' : 'Recarregar com a versão mais nova'}" ${window.TEMPO_NEW_VERSION ? 'style="color:var(--accent);font-weight:600"' : ''}>Atualizar</a>`}${db.adapter.persistent ? ` · <a href="#" class="btn sm ghost" data-act="signout">Sair</a>` : ''}</div>
  </div>`;
}

function topTimerHTML() {
  const a = activeEntry();
  if (!a) return `<button class="btn icon" data-act="ts-start" aria-label="Iniciar registro" title="Iniciar registro">${icon('play')}</button>`;
  return a.state === 'running'
    ? `<button class="btn icon" data-act="ts-pause" aria-label="Pausar" title="Pausar">${icon('pause')}</button>`
    : `<button class="btn icon" data-act="ts-resume" aria-label="Retomar" title="Retomar">${icon('play')}</button>`;
}
function mobileTimerHTML() {
  const a = activeEntry();
  if (!a) return `<div class="grow"><div class="t">00:00:00</div><div class="p">Nenhuma sessão ativa</div></div><button class="btn primary" data-act="ts-start">${icon('play')} Iniciar</button>`;
  return `<div class="grow" data-act="go" data-route="timesheet"><div class="t" data-tick="${a.id}">${fmtClock(entryMs(a))}</div><div class="p">${esc(entryTitle(a))}</div></div>
    ${a.state === 'running' ? `<button class="btn icon" data-act="ts-pause" aria-label="Pausar">${icon('pause')}</button>` : `<button class="btn icon" data-act="ts-resume" aria-label="Retomar">${icon('play')}</button>`}
    <button class="btn icon danger" data-act="ts-stop" aria-label="Encerrar">${icon('stop')}</button>`;
}

let lastHTML = '';
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
  const view = VIEWS[S.route] || VIEWS.timesheet;
  const v = view();
  const scrollKeep = keepScroll();
  // preserva foco/cursor quando a tela é redesenhada durante a digitação
  const ae = document.activeElement; const fid = ae && ae.id && $('.content')?.contains(ae) ? ae.id : null; const sel = fid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null; const fval = fid ? ae.value : null;
  $('.sidebar').innerHTML = sidebarHTML();
  $('.page-title').textContent = v.title;
  $('.crumb').textContent = NAV.find(n => n.id === S.route) ? (['registry', 'import', 'prefs'].includes(S.route) ? 'Cadastros' : 'Workspace') : '';
  $('.top-actions').innerHTML = (v.actions || '') + topTimerHTML();
  const demo = db.setting('demo', false);
  const banner = demo ? `<div class="banner info">${icon('db', 'ico')}<span class="grow"><b>Dados fictícios</b> para testar as telas. Nada é salvo: ao recarregar, o app volta a este exemplo.</span><button class="btn sm" data-act="demo-clear">Começar vazio</button></div>` : '';
  $('.content').innerHTML = banner + v.html;
  $('.mobile-timer').innerHTML = mobileTimerHTML();
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
  const minMs = source === 'app' ? 60000 : idleLimit() * 60000;
  const a = activeEntry(); if (!a || toMs - fromMs < minMs) return;
  const segStart = new Date(a.segments[a.segments.length - 1].s).getTime(); fromMs = Math.max(fromMs, segStart);
  // inatividade não pode cobrir uso de app: a pausa vai só para o maior trecho sem atividade registrada
  if (source !== 'app') [fromMs, toMs] = uncoveredGap(a, fromMs, toMs);
  if (toMs - fromMs < minMs) return;
  if (pausesOf(a.id).some(n => Math.abs(new Date(n.data.from) - fromMs) < 60000)) return;
  const from = new Date(fromMs).toISOString(), to = new Date(toMs).toISOString();
  addNotice({ kind: 'pause', key: `pause:${a.id}:${from}`, title: `Pausa sugerida: ${fmtDur(toMs - fromMs)}`, body: `Parado entre ${fmtTime(from)} e ${fmtTime(to)}; voltou às ${fmtTime(to)}.`, entity: 'entry', entity_id: a.id, project_id: a.project_id, data: { entry_id: a.id, from, to, source, app: app || null } });
  // inatividade vira pausa sozinha (sem aprovação): o aviso fica só para registro
  const auto = db.all('tempo_notices').find(x => x.key === `pause:${a.id}:${from}`);
  if (auto) { applyPause(a, auto, 'insert'); toast(`${icon('alert', 'ico')} Pausa aplicada: ${fmtDur(toMs - fromMs)} parado, voltou às ${fmtTime(to)}`); return; }
  toast(`${icon('alert', 'ico')} Pausa sugerida: ${fmtDur(toMs - fromMs)} parado, voltou às ${fmtTime(to)}`, { actions: [{ label: 'Revisar', run: () => go('timesheet') }] });
  notifyNative('Pausa sugerida', `${fmtDur(toMs - fromMs)} parado (${fmtTime(from)}–${fmtTime(to)})`);
}
/* Atualiza os dados a cada minuto e ao voltar para a janela, para o Mac enxergar a sessão iniciada em outro lugar. */
setInterval(() => db.refresh(), 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') db.refresh(); });
/* Ponte do app de Mac. O app guarda os eventos numa fila e só tira da fila quando esta função roda. */
window.TempoBridge = {
  reportIdle: async (fromISO, toISO, app) => {
    try { await db.refresh(); suggestPause(new Date(fromISO).getTime(), new Date(toISO).getTime(), 'mac', app); }
    catch (e) { console.warn('reportIdle', e); }
  },
  reportActivity: (seg) => suggestActivity(seg),
  version: 3,
};

/* Atividade em primeiro plano vinda do app de Mac: { from, to, app, doc?, folder? }.
   Grava sozinha (sem Aceitar) se houver sessão rodando e a atividade tiver ao menos 10 segundos. */
const pathNorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* Sugere o cliente pelo caminho da pasta: procura nomes de cliente e de projeto nos pedaços do caminho,
   do mais profundo para o mais raso. Só sugere; nunca grava sozinho. */
function clientFromPath(folder) {
  const parts = String(folder || '').split('/').map(pathNorm).filter(p => p.length >= 3).reverse();
  const clients = db.all('tempo_clients'), projects = db.all('tempo_projects');
  for (const part of parts) {
    const c = clients.find(x => pathNorm(x.name) === part) || projects.map(p => ({ p, c: clients.find(x => x.id === p.client_id) })).find(o => o.c && pathNorm(o.p.name) === part)?.c;
    if (c) return c;
  }
  for (const part of parts) {
    const c = clients.find(x => { const n = pathNorm(x.name); return n.length >= 4 && part.includes(n); });
    if (c) return c;
  }
  return null;
}
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
const DEFAULT_PAUSE_APPS = ['WhatsApp', 'Telegram', 'Mensagens', 'Messages'];
const DEFAULT_PAUSE_SITES = ['instagram'];
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
  db.update('tempo_time_entries', e.id, { segments: [{ s: seg.from, e: null }] }, true);
  notifyNative(p ? `Contando em ${p.name}` : `Detectada atividade no ${shortProgram(seg.app)}`, `Confirme para entrar no bruto, negue para arquivar.`);
  const unsaved = !seg.folder ? 'Arquivo ainda não salvo. ' : '';
  addNotice({ kind: 'start', key: `start:${e.id}`, title: p ? `Contando em ${p.name}` : `Detectada atividade no ${shortProgram(seg.app)}`, body: `${unsaved}Confirme para entrar no bruto, negue para arquivar.`, entity: 'entry', entity_id: e.id, project_id: pid, data: { project_id: pid, entry_id: e.id, snapshot: null, from: seg.from, app: seg.app, unsaved: !seg.folder } });
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
  // o log do dia recebe tudo, com ou sem sessão ativa
  const logged = logAppend(seg);
  const a = activeEntry();
  const pauseApps = (db.setting('pauseApps', DEFAULT_PAUSE_APPS) || []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  // sites que pausam: navegador em primeiro plano com um desses termos no título da aba (ex.: Instagram no Chrome)
  const pauseSites = (db.setting('pauseSites', DEFAULT_PAUSE_SITES) || []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const siteHit = BROWSER_RE.test(String(seg.app)) ? pauseSites.find(s => String(seg.doc || '').toLowerCase().includes(s)) : null;
  const isPauseApp = pauseApps.includes(String(seg.app).toLowerCase()) || !!siteHit;
  const rule = folderRule(seg.folder);
  const ruleProject = rule ? db.get('tempo_projects', rule.project_id) : null;
  if (!a) { if (!isPauseApp && (ruleProject || DESIGN_APP_RE.test(seg.app))) suggestStart(ruleProject, seg); return; }
  if (a.state === 'running' && !isPauseApp) recordActivity(a, { ...seg, rid: logged?.rid || null });
  // app que pausa: só marca no bruto (o cronômetro segue) e vira aviso para você conferir
  // WhatsApp/Telegram não são atividade: viram pausa (a partir de 1 minuto, como as outras atividades)
  if (isPauseApp) suggestPause(fromMs, toMs, 'app', siteHit ? siteHit.replace(/^./, c => c.toUpperCase()) : seg.app);
}
CHANGES['pause-apps'] = (el) => { db.setSetting('pauseApps', el.value.split(',').map(x => x.trim()).filter(Boolean)); };
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
    decideNotice(n, 'done', `Sessão encerrada às ${fmtTime(f)}`, { before });
    pausesOf(a.id).forEach(o => decideNotice(o, 'ignored', 'Descartada ao encerrar a sessão'));
    return;
  }
  const out = []; segs.forEach(s => { const S0 = new Date(s.s), E0 = s.e ? new Date(s.e) : null; const F = new Date(f), T = new Date(t);
    if (E0 && E0 <= F || S0 >= T) { out.push(s); return; }
    // motivo da pausa: "mac"/"suspenso"/"ocioso", ou o nome do app que pausou (ex.: WhatsApp)
    if (S0 < F) out.push({ s: s.s, e: f, why: sug.source === 'app' && sug.app ? sug.app : (sug.source === 'mac' && sug.app === 'sono' ? 'sono' : sug.source) });
    if (!E0 || E0 > T) out.push({ s: t, e: s.e });
  });
  db.update('tempo_time_entries', a.id, { segments: out, edits: auditEdit(a, before, `Pausa de ${fmtDur(new Date(t) - new Date(f))} inserida (${fmtTime(f)}–${fmtTime(t)})`) }, true);
  decideNotice(n, 'accepted', `Pausa inserida (${fmtTime(f)}–${fmtTime(t)})`, { before });
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

/* ---------- aparência ---------- */
function applyAppearance() {
  if (typeof applyExCats === 'function') applyExCats();
  const root = document.documentElement;
  const theme = db.setting('theme', 'system');
  if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  const [l, d] = ACCENTS[db.setting('accent', 'cobalto')] || ACCENTS.cobalto;
  const css = (c, dark) => `--accent:${c};--accent-soft:color-mix(in srgb, ${c} ${dark ? 22 : 12}%, var(--surface));--accent-line:color-mix(in srgb, ${c} ${dark ? 45 : 35}%, var(--surface));--accent-fg:${dark ? '#0D1030' : '#FFFFFF'};`;
  $('#accent-style').textContent = `:root{${css(l)}} @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${css(d, 1)}}} :root[data-theme="dark"]{${css(d, 1)}}`;
  root.style.setProperty('--font-ui', (FONTS[db.setting('font', 'sonoma')] || FONTS.sonoma)[1]);
  root.style.setProperty('--fs', db.setting('fontSize', 14) + 'px');
  root.style.setProperty('--row-pad', db.setting('rowPad', 3) + 'px');
  root.style.setProperty('--row-pad-fin', db.setting('rowPadFin', 0) + 'px');
  const r = Number(db.setting('radius', DEFAULT_RADIUS));
  root.style.setProperty('--radius', r + 'px'); root.style.setProperty('--radius-sm', Math.max(0, Math.round(r * .6)) + 'px');
}

/* ---------- inicialização ---------- */
ACTIONS.signout = async () => {
  try { await window.tempoClient?.auth.signOut(); } catch (e) { /* segue mesmo assim */ }
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
  await db.init(adapter);
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
  const h = (location.hash || '').slice(1); if (NAV.some(n => n.id === h)) S.route = h;
  applyAppearance();
  db.subscribe(applyAppearance);
  // quando uma despesa, projeto ou orçamento muda, reavalia os avisos (com pequena folga para agrupar mudanças)
  let scanT = null;
  db.subscribe(() => { clearTimeout(scanT); scanT = setTimeout(scanAlerts, 1500); });
  scanAlerts();
  if (db.setting('idleDetect', false)) startIdleDetection(false);
  render();
  checkAppVersion();
  setInterval(checkAppVersion, 30 * 60 * 1000);
}
