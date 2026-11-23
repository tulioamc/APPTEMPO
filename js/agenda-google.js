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
    let fim = n.data.end ? aggHM(n.data.end) : ini + (Number(n.data.est) > 0 ? Number(n.data.est) : 15) / 60;
    if (!(fim > ini)) fim = ini + 0.25;
    itens.push({ key: 'todo:' + n.id, titulo: n.title, ini: aggISO(dia, ini), fim: aggISO(dia, Math.min(24, fim)), descricao: n.body || '' });
  });
  // planejado: blocos seguidos do mesmo projeto viram um evento; chave por dia, projeto e ordem no dia
  if (typeof planejar === 'function' && typeof planoProjetos === 'function') {
    const { porDia } = planejar(planoProjetos(), agora, AGG_DIAS_PLANO);
    Object.entries(porDia).forEach(([dia, v]) => {
      const juntos = [];
      (v.blocos || []).slice().sort((a, b) => a.ini - b.ini).forEach(b => { const l = juntos[juntos.length - 1]; if (l && l.pid === b.pid && b.ini - l.fim < 0.02) l.fim = b.fim; else juntos.push({ ...b }); });
      const conta = {};
      juntos.forEach(b => {
        if (dia === hoje && aggISO(dia, b.fim) <= agora.toISOString()) return;
        const p = db.get('tempo_projects', b.pid); if (!p) return;
        conta[b.pid] = (conta[b.pid] || 0) + 1;
        const ab = typeof agencyAbbr === 'function' ? agencyAbbr(agencyOf(p)) : '';
        itens.push({ key: `plano:${dia}:${b.pid}:${conta[b.pid]}`, titulo: `${ab ? '[' + ab + '] ' : ''}${p.name}`, ini: aggISO(dia, b.ini), fim: aggISO(dia, b.fim), descricao: `Planejado pelo Tempo · ${clientOf(p)?.name || ''}` });
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
      db.setSetting('planoPins', pins); n++;
    }
  });
  if (n) { toast(`${n} horário${n > 1 ? 's' : ''} mudado${n > 1 ? 's' : ''} no Google Agenda ${n > 1 ? 'vieram' : 'veio'} para o Tempo`); db.emit(); }
}

async function aggSync(manual = false) {
  if (AGG.rodando || !db.adapter?.client) return;
  if (!manual && document.hidden) return;
  AGG.rodando = true; if (manual) render();
  try {
    if (AGG.status === null || manual) { const s = await aggApi('sync'); AGG.status = !!s.connected; AGG.conta = s.account_email; }
    if (!AGG.status) return;
    const r = await aggApi('sync', { method: 'POST', body: JSON.stringify(aggItens()) });
    if (r.erro) { AGG.erro = r.erro === 'api-desligada' ? 'A API do Google Agenda não está ligada no projeto do Google Cloud.' : r.erro; return; }
    AGG.erro = null; AGG.ultimo = new Date(); AGG.n = r.feitos;
    aggAplicar(r.editados);
    const novos = JSON.stringify(r.eventos || []);
    if (novos !== JSON.stringify(db.setting('agendaEventos', []) || [])) { db.setSetting('agendaEventos', r.eventos || []); db.emit(); }
    if (manual) toast('Google Agenda sincronizado');
  } catch (e) { AGG.erro = e.message; if (manual) toast('Google Agenda: ' + e.message); }
  finally { AGG.rodando = false; if (manual || AGG.erro) render(); }
}

/* Botão no Calendário: conectar ou sincronizar agora. */
function aggBotaoHTML() {
  if (AGG.status === false) return `<button class="btn sm" data-act="agg-conectar">${icon('calendar')} Conectar Google Agenda</button>`;
  const quando = AGG.ultimo ? AGG.ultimo.toTimeString().slice(0, 5) : '';
  const tip = AGG.erro ? 'Erro: ' + AGG.erro : `Google Agenda${AGG.conta ? ' · ' + AGG.conta : ''}${quando ? '\nSincronizado às ' + quando : ''}\nTo-dos e planejado vão para a agenda "Tempo"; os outros compromissos vêm para cá. Clique para sincronizar agora.`;
  return `<button class="btn sm${AGG.erro ? ' danger' : ''}" data-act="agg-sync" data-tip="${esc(tip)}"${AGG.rodando ? ' disabled' : ''}>${icon('calendar')} ${AGG.rodando ? 'Sincronizando…' : AGG.erro ? 'Google Agenda: erro' : 'Google' + (quando ? ' · ' + quando : '')}</button>`;
}
ACTIONS['agg-sync'] = () => aggSync(true);
ACTIONS['agg-conectar'] = async () => {
  const w = window.open('about:blank', 'tempo-gcal', 'width=480,height=680');
  try { const r = await aggApi('start'); if (w && !w.closed) w.location.href = r.url; else location.href = r.url; }
  catch (e) { if (w) w.close(); toast('Não consegui conectar: ' + e.message); }
};
window.addEventListener('message', (e) => { if (e.origin !== location.origin) return; if (e.data === 'gcal-ok') { toast('Google Agenda conectado'); AGG.status = null; aggSync(true); } });
if (typeof window !== 'undefined' && !window.__aggTimer) {
  window.__aggTimer = true;
  setTimeout(() => aggSync(), 20e3);
  setInterval(() => aggSync(), 5 * 60e3);
  if (/[?&]gcal=ok/.test(location.search)) setTimeout(() => aggSync(true), 3e3);
}
