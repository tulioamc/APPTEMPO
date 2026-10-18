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
const NAV = [
  { group: 'Workspace' },
  { id: 'timesheet', label: 'Time Sheet', icon: 'clock' },
  { id: 'projects', label: 'Projetos', icon: 'folder', count: () => projects().length },
  { id: 'tasks', label: 'Tarefas', icon: 'check', count: () => db.all('tempo_tasks').length },
  { id: 'quotes', label: 'Orçamentos', icon: 'doc', count: () => db.all('tempo_quotes').length },
  { id: 'finance', label: 'Financeiro', icon: 'money' },
  { id: 'financepf', label: 'Financeiro PF', icon: 'money' },
  { id: 'expenses', label: 'Despesas', icon: 'money', count: () => exRows(S.exMonth || ymd(new Date()).slice(0, 7)).filter(r => r.status !== 'Não teve' && r.status !== 'Pago' && r.status !== 'Recebido').length },
  { id: 'reimb', label: 'Reembolsos', icon: 'layers', count: () => db.all('tempo_reimb_rows').filter(r => r.refund_id !== rbStatusId('reimb_refund', 'Feito!')).length },
  { id: 'notices', label: 'Avisos', icon: 'bell', count: () => db.all('tempo_notices').filter(n => n.status === 'pending' && n.kind !== 'todo').length },
  { id: 'reports', label: 'Relatórios', icon: 'chart' },
  { group: 'Cadastros' },
  { id: 'registry', label: 'Agências e clientes', icon: 'users', count: () => agencies().length + clients().length },
  { id: 'import', label: 'Importar do Notion', icon: 'upload' },
  { id: 'prefs', label: 'Preferências', icon: 'gear' }
];
const VIEWS = {};

function go(route) {
  S.route = route; S.navOpen = false; $('.app')?.classList.remove('nav-open'); $$('.colorpop,.combo-pop,.colmenu').forEach(x => x.remove());
  try { history.replaceState(null, '', '#' + route); } catch (e) {}
  render(); window.scrollTo(0, 0);
}
ACTIONS.go = (el) => go(el.dataset.route);
ACTIONS['toggle-nav'] = () => { S.navOpen = !S.navOpen; $('.app').classList.toggle('nav-open', S.navOpen); };

function sidebarHTML() {
  const a = activeEntry();
  return `<div class="brand"><div class="brand-mark">${icon('clock')}</div><div><div class="brand-name">Tempo</div><div class="brand-sub">time sheet e projetos</div></div></div>
  ${NAV.map(n => n.group ? `<div class="nav-group">${n.group}</div>` :
    `<button class="nav-btn ${S.route === n.id ? 'active' : ''}" data-act="go" data-route="${n.id}" ${S.route === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${n.count ? `<span class="count">${n.count()}</span>` : ''}</button>`).join('')}
  <div class="sidebar-foot">
    ${a ? `<button class="mini-timer" data-act="go" data-route="timesheet"><span class="row small"><span class="dot ${a.state === 'running' ? 'live' : 'paused'}"></span>${a.state === 'running' ? 'Registrando' : 'Pausado'}</span><span class="t" data-tick="${a.id}">${fmtClock(entryMs(a))}</span><span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(entryTitle(a))}</span>${pausesOf(a.id).length ? `<span class="small" style="color:var(--warn);font-weight:600">${pausesOf(a.id).length} pausa(s) para revisar</span>` : ''}</button>` : ''}
    <div class="data-mode"><span class="dot ${db.adapter.persistent ? 'live' : 'mem'}"></span>${db.syncError ? 'Falha de sincronização' : db.adapter.persistent ? 'Sincronizado' : 'Em memória · some ao recarregar'} · ${APP_VERSION}${` · <a href="#" data-act="app-update" title="${window.TEMPO_NEW_VERSION ? 'Nova versão ' + esc(window.TEMPO_NEW_VERSION) + ' disponível' : 'Recarregar com a versão mais nova'}" ${window.TEMPO_NEW_VERSION ? 'style="color:var(--accent);font-weight:600"' : ''}>Atualizar</a>`}${db.adapter.persistent ? ` · <a href="#" data-act="signout">Sair</a>` : ''}</div>
  </div>`;
}

function mobileTimerHTML() {
  const a = activeEntry();
  if (!a) return `<div class="grow"><div class="t">00:00:00</div><div class="p">Nenhuma sessão ativa</div></div><button class="btn primary" data-act="ts-start">${icon('play')} Iniciar</button>`;
  return `<div class="grow" data-act="go" data-route="timesheet"><div class="t" data-tick="${a.id}">${fmtClock(entryMs(a))}</div><div class="p">${esc(entryTitle(a))}</div></div>
    ${a.state === 'running' ? `<button class="btn icon" data-act="ts-pause" aria-label="Pausar">${icon('pause')}</button>` : `<button class="btn icon" data-act="ts-resume" aria-label="Retomar">${icon('play')}</button>`}
    <button class="btn icon danger" data-act="ts-stop" aria-label="Encerrar">${icon('stop')}</button>`;
}

let lastHTML = '';
function render() {
  const view = VIEWS[S.route] || VIEWS.timesheet;
  const v = view();
  // preserva foco/cursor quando a tela é redesenhada durante a digitação
  const ae = document.activeElement; const fid = ae && ae.id && $('.content')?.contains(ae) ? ae.id : null; const sel = fid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  $('.sidebar').innerHTML = sidebarHTML();
  $('.page-title').textContent = v.title;
  $('.crumb').textContent = NAV.find(n => n.id === S.route) ? (['registry', 'import', 'prefs'].includes(S.route) ? 'Cadastros' : 'Workspace') : '';
  $('.top-actions').innerHTML = v.actions || '';
  const demo = db.setting('demo', false);
  const banner = demo ? `<div class="banner info">${icon('db', 'ico')}<span class="grow"><b>Dados fictícios</b> para testar as telas. Nada é salvo: ao recarregar, o app volta a este exemplo.</span><button class="btn sm" data-act="demo-clear">Começar vazio</button></div>` : '';
  $('.content').innerHTML = banner + v.html;
  $('.mobile-timer').innerHTML = mobileTimerHTML();
  document.title = 'Tempo';
  v.after && v.after();
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
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

/* ---------- inatividade: sugestões de pausa ----------
   Fontes: (1) app/computador suspenso (intervalo sem "batimento" da página);
   (2) Idle Detection do Chrome/Edge, quando ativada;
   (3) futuro app de Mac: window.TempoBridge.reportIdle(inicioISO, fimISO, app).
   Nada é aplicado sozinho: cada intervalo vira uma sugestão Aceitar/Ignorar. */
let lastBeat = Date.now();
const idleLimit = () => Number(db.setting('idleMinutes', 5)) || 5;
function suggestPause(fromMs, toMs, source, app) {
  const a = activeEntry(); if (!a || toMs - fromMs < idleLimit() * 60000) return;
  const segStart = new Date(a.segments[a.segments.length - 1].s).getTime(); fromMs = Math.max(fromMs, segStart);
  if (toMs - fromMs < idleLimit() * 60000) return;
  if (pausesOf(a.id).some(n => Math.abs(new Date(n.data.from) - fromMs) < 60000)) return;
  const from = new Date(fromMs).toISOString(), to = new Date(toMs).toISOString();
  addNotice({ kind: 'pause', key: `pause:${a.id}:${from}`, title: `Pausa sugerida: ${fmtDur(toMs - fromMs)}`, body: `Parado entre ${fmtTime(from)} e ${fmtTime(to)}; voltou às ${fmtTime(to)}.`, entity: 'entry', entity_id: a.id, project_id: a.project_id, data: { entry_id: a.id, from, to, source, app: app || null } });
  toast(`${icon('alert', 'ico')} Pausa sugerida: ${fmtDur(toMs - fromMs)} parado, voltou às ${fmtTime(to)}`, { actions: [{ label: 'Revisar', run: () => go('timesheet') }] });
}
function heartbeat() {
  const now = Date.now(); const gap = now - lastBeat; const a = activeEntry();
  if (a && a.state === 'running' && gap > 90000) suggestPause(lastBeat, now, 'suspenso');
  lastBeat = now;
}
setInterval(heartbeat, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') heartbeat(); });
window.TempoBridge = { reportIdle: (fromISO, toISO, app) => suggestPause(new Date(fromISO).getTime(), new Date(toISO).getTime(), 'mac', app), version: 1 };

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
    if (S0 < F) out.push({ s: s.s, e: f });
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
const PAUSE_SRC = { suspenso: 'app ou computador suspenso', ocioso: 'sem mouse/teclado', mac: 'app de Mac' };
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
  toast(`<div class="row">${icon('bell')}<b>${esc(r.name)}</b></div><div class="small">${reminderText(r)}</div>`, { cls: 'rem', sticky: true, actions });
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
setInterval(() => scanAlerts(), 300000);
setInterval(() => ensureMonthSheets(), 3600000);

/* ---------- aparência ---------- */
function applyAppearance() {
  const root = document.documentElement;
  const theme = db.setting('theme', 'system');
  if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  const [l, d] = ACCENTS[db.setting('accent', 'cobalto')] || ACCENTS.cobalto;
  const css = (c, dark) => `--accent:${c};--accent-soft:color-mix(in srgb, ${c} ${dark ? 22 : 12}%, var(--surface));--accent-line:color-mix(in srgb, ${c} ${dark ? 45 : 35}%, var(--surface));--accent-fg:${dark ? '#0D1030' : '#FFFFFF'};`;
  $('#accent-style').textContent = `:root{${css(l)}} @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${css(d, 1)}}} :root[data-theme="dark"]{${css(d, 1)}}`;
  root.style.setProperty('--font-ui', (FONTS[db.setting('font', 'sonoma')] || FONTS.sonoma)[1]);
  root.style.setProperty('--fs', db.setting('fontSize', 14) + 'px');
  root.style.setProperty('--row-pad', db.setting('rowPad', 3) + 'px');
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
  scanAlerts();
  if (db.setting('idleDetect', false)) startIdleDetection(false);
  render();
  checkAppVersion();
  setInterval(checkAppVersion, 30 * 60 * 1000);
}
