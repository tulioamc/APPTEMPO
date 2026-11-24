/* Google Agenda ↔ Tempo (direto pelo servidor, sem depender do Mac).
   Vai para a agenda "Tempo" do Google: to-dos com data e o planejado dos projetos (próximos 14 dias).
   Volta do Google: compromissos das outras agendas (setting 'agendaEventos', já usados no Calendário como ocupado)
   e horários que você mudou lá (to-do muda a hora; planejado vira bloco fixado naquele dia e hora).
   Roda com o app aberto (qualquer aparelho): ao abrir e a cada 5 min. A agenda da Apple recebe tudo pela conta Google. */
const AGG = { status: null, ultimo: null, erro: null, rodando: false, n: null };
const AGG_DIAS_PLANO = 14;

async function aggApi(path, opts = {}) {
  const token = typeof bankToken === 'function' ? await bankToken() : null;
  if (!token) throw new Error('sem login');
  const r = await fetch('/api/gcal/' + path, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}
const aggISO = (dia, h) => { const d = new Date(dia + 'T00:00:00'); d.setMinutes(Math.round(h * 60)); return d.toISOString(); };
const aggHM = (v) => { const [a, b] = String(v || '').split(':').map(Number); return a + (b || 0) / 60; };

/* O que o Tempo manda para o Google. */
function aggItens(agora = new Date()) {
  const hoje = ymd(agora); const desde = new Date(agora); desde.setDate(desde.getDate() - 7);
  const ate = new Date(agora); ate.setDate(ate.getDate() + 30);
  const lim0 = ymd(desde), lim1 = ymd(ate);
  const itens = [];
  // to-dos abertos com data
  db.all('tempo_notices').filter(n => n.kind === 'todo' && n.status !== 'done' && n.data?.due).forEach(n => {
    const dia = n.data.due.slice(0, 10); if (dia < lim0 || dia > lim1) return;
    if (typeof todoSemHora === 'function' && todoSemHora(n.data)) { const d2 = new Date(dia + 'T12:00:00'); d2.setDate(d2.getDate() + 1); itens.push({ key: 'todo:' + n.id, titulo: n.title, diaTodo: true, dia, ini: dia + 'T00:00:00-03:00', fim: ymd(d2) + 'T00:00:00-03:00', livre: true }); return; }
    const ini = aggHM(n.data.due.slice(11, 16));
    let fim = n.data.end ? aggHM(n.data.end) : ini + (Number(n.data.est) > 0 ? Number(n.data.est) : 30) / 60;
    fim = Math.max(fim, ini + 0.5);   // no mínimo 30 min, como no Calendário
    itens.push({ key: 'todo:' + n.id, titulo: n.title, ini: aggISO(dia, ini), fim: aggISO(dia, Math.min(24, fim)), descricao: n.body || '' });
  });
  // planejado: blocos seguidos do mesmo projeto viram um evento; chave por dia, projeto e ordem no dia
  if (typeof planejar === 'function' && typeof planoProjetos === 'function') {
    const { porDia } = planejar(planoProjetos(), agora, AGG_DIAS_PLANO);
    Object.entries(porDia).forEach(([dia, v]) => {
      const juntos = [];
      (v.blocos || []).slice().sort((a, b) => a.ini - b.ini).forEach(b => { const l = juntos[juntos.length - 1]; if (l && l.pid === b.pid && l.tid === b.tid && b.ini - l.fim < 0.02) l.fim = b.fim; else juntos.push({ ...b }); });
      const conta = {};
      juntos.forEach(b => {
        if (dia === hoje && aggISO(dia, b.fim) <= agora.toISOString()) return;
        const p = db.get('tempo_projects', b.pid); if (!p) return;
        conta[b.pid] = (conta[b.pid] || 0) + 1;
        const ab = clientOf(p)?.name || '';
        itens.push({ key: `plano:${dia}:${b.pid}:${conta[b.pid]}`, titulo: `${ab ? '[' + ab + '] ' : ''}${b.tarefa ? b.tarefa + ' · ' : ''}${p.name}`, ini: aggISO(dia, b.ini), fim: aggISO(dia, b.fim), descricao: `Planejado pelo Tempo · ${clientOf(p)?.name || ''}` });
      });
    });
  }
  return { itens, desde: new Date(lim0 + 'T00:00:00').toISOString(), ate: new Date(lim1 + 'T23:59:59').toISOString() };
}

/* Horários mudados no Google voltam para o Tempo. */
function aggAplicar(editados) {
  let n = 0;
  (editados || []).forEach(x => {
    const [tipo, ...resto] = x.key.split(':');
    const ini = new Date(x.ini), fim = new Date(x.fim);
    const dia = x.diaTodo ? x.dia : ymd(ini);
    const hIni = ini.getHours() + ini.getMinutes() / 60, hFim = fim.getHours() + fim.getMinutes() / 60 || 24;
    if (tipo === 'todo') {
      const t = db.get('tempo_notices', resto.join(':')); if (!t) return;
      const data = x.diaTodo ? { ...(t.data || {}), due: `${dia}T20:00`, end: null, semHora: true }
        : { ...(t.data || {}), due: `${dia}T${planoHora(hIni)}`, end: ymd(fim) === dia && hFim < 24 ? planoHora(hFim) : null, semHora: false };
      db.update('tempo_notices', t.id, { data }, true); n++;
    } else if (tipo === 'plano' && !x.diaTodo) {
      const [diaAntes, pid] = resto;
      const h = Math.max(0.25, (fim - ini) / 36e5);
      const pins = planoPins().filter(p => !(p.pid === pid && (p.dia === diaAntes || p.dia === dia)));
      pins.push({ id: uid(), dia, pid, ini: hIni, h, google: true });
      planoPinsSalvar(pins); n++;
    }
  });
  if (n) { toast(`${n} horário${n > 1 ? 's' : ''} mudado${n > 1 ? 's' : ''} no Google Agenda ${n > 1 ? 'vieram' : 'veio'} para o Tempo`); db.emit(); }
}

async function aggSync(manual = false) {
  if (AGG.rodando || !db.adapter?.client) return;
  if (!manual && document.hidden) return;
  AGG.rodando = true; if (manual) render();
  try {
    if (AGG.status === null || manual) { const s = await aggApi('sync'); AGG.status = !!s.connected; AGG.conta = s.account_email; AGG.contas = s.contas || []; }
    if (!AGG.status) return;
    const r = await aggApi('sync', { method: 'POST', body: JSON.stringify(aggItens()) });
    if (r.erro) { AGG.erro = r.erro === 'api-desligada' ? 'A API do Google Agenda não está ligada no projeto do Google Cloud.' : r.erro; return; }
    AGG.erro = null; AGG.ultimo = new Date(); AGG.n = r.feitos; AGG.contas = r.contas || AGG.contas; AGG.errosContas = r.erros || [];
    aggAplicar(r.editados);
    const novos = JSON.stringify(r.eventos || []);
    if (novos !== JSON.stringify(db.setting('agendaEventos', []) || [])) { db.setSetting('agendaEventos', r.eventos || []); db.emit(); }
    if (manual) toast('Google Agenda sincronizado');
  } catch (e) { AGG.erro = e.message; if (manual) toast('Google Agenda: ' + e.message); }
  finally { AGG.rodando = false; if (manual || AGG.erro) render(); }
}

/* Botão no Calendário: conectar ou abrir as contas (sincronizar agora, adicionar outra conta, desconectar). */
function aggBotaoHTML() {
  if (AGG.status === false) return `<button class="btn sm" data-act="agg-conectar">${icon('calendar')} Conectar Google Agenda</button>`;
  const quando = AGG.ultimo ? AGG.ultimo.toTimeString().slice(0, 5) : '';
  const erro = AGG.erro || (AGG.errosContas || []).length;
  const tip = AGG.erro ? 'Erro: ' + AGG.erro : `Google Agenda${quando ? ' · sincronizado às ' + quando : ''}\n${(AGG.contas || []).map(c => c.email).join('\n')}`;
  return `<button class="btn sm${erro ? ' danger' : ''}" data-act="agg-contas" data-tip="${esc(tip)}">${icon('calendar')} ${AGG.rodando ? 'Sincronizando…' : erro ? 'Google Agenda: erro' : 'Google' + (quando ? ' · ' + quando : '')}</button>`;
}
function aggContasHTML() {
  const errDe = (email) => (AGG.errosContas || []).find(e => e.conta === email);
  const linhas = (AGG.contas || []).map(c => { const e = errDe(c.email);
    return `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><div><b>${esc(c.email || 'Conta Google')}</b><div class="small muted">${c.principal ? 'Principal: guarda a agenda "Tempo" (to-dos e planejado) e traz as outras agendas' : 'Só traz as agendas desta conta'}</div>${e ? `<div class="small" style="color:var(--danger)">${e.erro === 'api-desligada' ? 'A API do Google Agenda não está ligada no Google Cloud.' : esc(e.erro)}</div>` : ''}</div><button class="btn sm ghost" data-x="rem" data-p="${esc(c.provider)}">Desconectar</button></div>`; }).join('');
  return `<div class="dh">${icon('calendar')}<h2>Google Agenda</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
  <div class="db">${AGG.erro ? `<div class="banner danger small">${esc(AGG.erro)}</div>` : ''}${linhas || '<div class="muted">Nenhuma conta conectada.</div>'}
  <div class="small muted" style="margin-top:10px">${AGG.ultimo ? 'Sincronizado às ' + AGG.ultimo.toTimeString().slice(0, 5) + '. ' : ''}Sincroniza sozinho a cada 5 min com o app aberto.</div></div>
  <div class="df"><button class="btn" data-x="add">${icon('plus')} Adicionar outra conta</button><span class="grow"></span><button class="btn primary" data-x="sync">Sincronizar agora</button></div>`;
}
ACTIONS['agg-contas'] = () => {
  const l = openLayer({ html: aggContasHTML() });
  l.box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'sync') { l.close(); aggSync(true); }
    else if (b.dataset.x === 'add') { l.close(); aggConectar(true); }
    else if (b.dataset.x === 'rem') {
      if (!(await confirmBox({ title: 'Desconectar conta?', body: 'Os eventos dela somem do Calendário do Tempo na próxima sincronização.', ok: 'Desconectar', danger: true }))) return;
      try { await aggApi('sync', { method: 'POST', body: JSON.stringify({ remover: b.dataset.p }) }); l.close(); AGG.status = null; aggSync(true); } catch (err) { toast('Não consegui: ' + err.message); }
    }
  });
};
async function aggConectar(nova = false) {
  const w = window.open('about:blank', 'tempo-gcal', 'width=480,height=680');
  try { const r = await aggApi('start' + (nova ? '?nova=1' : '')); if (w && !w.closed) w.location.href = r.url; else location.href = r.url; }
  catch (e) { if (w) w.close(); toast('Não consegui conectar: ' + e.message); }
}
ACTIONS['agg-sync'] = () => aggSync(true);
ACTIONS['agg-conectar'] = () => aggConectar(false);
window.addEventListener('message', (e) => { if (e.origin !== location.origin) return; if (e.data === 'gcal-ok') { toast('Google Agenda conectado'); AGG.status = null; aggSync(true); } });
if (typeof window !== 'undefined' && !window.__aggTimer) {
  window.__aggTimer = true;
  setTimeout(() => aggSync(), 20e3);
  setInterval(() => aggSync(), 5 * 60e3);
  if (/[?&]gcal=ok/.test(location.search)) setTimeout(() => aggSync(true), 3e3);
}

/* Calendário da Apple pelo app do Mac (só leitura): traz agendas que não passam pelo Google (ex.: Brenda). */
function aggReportMac(itens) {
  const lista = Array.isArray(itens) ? itens : [];
  if (JSON.stringify(lista) === JSON.stringify(db.setting('agendaEventosMac', []) || [])) return true;
  db.setSetting('agendaEventosMac', lista); db.emit(); return true;
}
if (window.TempoBridge) window.TempoBridge.reportAgendaMac = aggReportMac;
