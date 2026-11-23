// Google Agenda ↔ Tempo, direto no servidor (não depende do Mac).
// GET: status da conexão. POST { itens, desde, ate }: o app manda o que deve estar na agenda "Tempo"
// (to-dos e planejado), o servidor cria/atualiza/apaga lá e devolve:
//   eventos  — compromissos das outras agendas (entram no Calendário do Tempo como ocupado)
//   editados — itens que você mudou de horário no Google (o app aplica: to-do muda a hora, planejado vira bloco fixado)
// Cada evento da agenda "Tempo" guarda (propriedades privadas) a chave do item e o horário que o Tempo gravou;
// se o horário no Google for outro, foi você que mexeu lá.
const { userFromRequest, rest, gmailAccessToken } = require('../../lib/tempo-server');

const G = 'https://www.googleapis.com/calendar/v3';
const TZ = 'America/Recife';
async function g(token, path, opts = {}) {
  const r = await fetch(G + path, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || 'HTTP ' + r.status); e.status = r.status; throw e; }
  return j;
}
async function todos(token, path) {
  let out = [], page = '';
  for (let i = 0; i < 10; i++) {
    const j = await g(token, path + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
    out = out.concat(j.items || []); page = j.nextPageToken; if (!page) break;
  }
  return out;
}
// em lotes, para não estourar o tempo da função nem o limite do Google
async function emLotes(lista, n, fn) { for (let i = 0; i < lista.length; i += n) await Promise.all(lista.slice(i, i + n).map(fn)); }

const ms = (x) => new Date(x).getTime();
const mesmo = (a, b) => Math.abs(ms(a) - ms(b)) < 60e3;
const diaMais = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// início/fim de um evento do Google: dia todo vem como data (fica "AAAA-MM-DDT00:00:00", hora local)
const iniDe = (ev) => ev.start.dateTime || (ev.start.date + 'T00:00:00-03:00');
const fimDe = (ev) => ev.end.dateTime || (ev.end.date + 'T00:00:00-03:00');

function corpo(it) {
  const tempo = { tempoKey: it.key, tempoIni: it.ini, tempoFim: it.fim };
  const quando = it.diaTodo
    ? { start: { date: it.dia }, end: { date: diaMais(it.dia, 1) } }
    : { start: { dateTime: new Date(it.ini).toISOString(), timeZone: TZ }, end: { dateTime: new Date(it.fim).toISOString(), timeZone: TZ } };
  return { summary: it.titulo, description: it.descricao || '', ...quando, transparency: it.livre ? 'transparent' : 'opaque', extendedProperties: { private: tempo } };
}

module.exports = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'entre na sua conta' });
  // várias contas Google: "gcal" é a principal (guarda a agenda "Tempo"); "gcal:xxxx" são as outras (só leitura)
  const rows = (await rest(`tempo_integrations?provider=like.gcal*&user_id=eq.${user.id}&select=id,provider,account_email,last_sync_at,refresh_token&order=created_at.asc`)) || [];
  const contas = rows.filter(r => r.refresh_token);
  const integ = contas.find(r => r.provider === 'gcal') || contas[0];
  const conectado = !!integ;
  const lista = contas.map(r => ({ provider: r.provider, email: r.account_email, principal: r === integ, last_sync_at: r.last_sync_at }));
  if (req.method !== 'POST') return res.json({ connected: conectado, account_email: integ ? integ.account_email : null, contas: lista });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (body.remover) {   // desconectar uma conta
    const r = rows.find(x => x.provider === body.remover);
    if (r) await rest(`tempo_integrations?id=eq.${r.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return res.json({ ok: true });
  }
  if (!conectado) return res.json({ connected: false });
  const itens = Array.isArray(body.itens) ? body.itens.slice(0, 600) : [];
  const desde = new Date(body.desde || Date.now() - 7 * 864e5).toISOString();
  const ate = new Date(body.ate || Date.now() + 30 * 864e5).toISOString();
  try {
    const token = await gmailAccessToken(integ.refresh_token);
    // agenda "Tempo" (cria na primeira vez)
    const cals = await todos(token, '/users/me/calendarList?maxResults=250');
    let cal = cals.find(c => c.summary === 'Tempo' && c.accessRole === 'owner');
    if (!cal) cal = await g(token, '/calendars', { method: 'POST', body: JSON.stringify({ summary: 'Tempo', description: 'To-dos e planejamento do app Tempo', timeZone: TZ }) });
    const cid = encodeURIComponent(cal.id);

    // o que já está na agenda Tempo
    const atuais = await todos(token, `/calendars/${cid}/events?singleEvents=true&showDeleted=false&maxResults=2500&timeMin=${encodeURIComponent(desde)}&timeMax=${encodeURIComponent(ate)}`);
    const porChave = new Map(); const sobras = [];
    atuais.forEach(ev => { const k = ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.tempoKey; if (k && !porChave.has(k)) porChave.set(k, ev); else if (k) sobras.push(ev); });

    // 1) mudanças feitas no Google: horário diferente do que o Tempo gravou
    const editados = []; const mexidos = new Set();
    for (const [k, ev] of porChave) {
      const p = ev.extendedProperties.private;
      if (!p.tempoIni || !p.tempoFim) continue;
      if (!mesmo(iniDe(ev), p.tempoIni) || !mesmo(fimDe(ev), p.tempoFim)) {
        editados.push({ key: k, ini: iniDe(ev), fim: fimDe(ev), diaTodo: !!ev.start.date, dia: ev.start.date || null });
        mexidos.add(k);
      }
    }
    // 2) gravar o que o Tempo manda
    const criar = [], mudar = [], quer = new Set();
    for (const it of itens) {
      if (!it || !it.key) continue; quer.add(it.key);
      const ev = porChave.get(it.key);
      if (mexidos.has(it.key)) {   // você mexeu no Google: guarda o novo horário como o "gravado"; o app atualiza e confirma na próxima
        mudar.push({ ev, patch: { extendedProperties: { private: { tempoKey: it.key, tempoIni: iniDe(ev), tempoFim: fimDe(ev) } } } });
        continue;
      }
      if (!ev) { criar.push(it); continue; }
      const igual = ev.summary === it.titulo && (it.diaTodo ? ev.start.date === it.dia : (mesmo(iniDe(ev), it.ini) && mesmo(fimDe(ev), it.fim)))
        && ev.extendedProperties.private.tempoIni && mesmo(ev.extendedProperties.private.tempoIni, it.ini);
      if (!igual) mudar.push({ ev, patch: corpo(it) });
    }
    const apagar = sobras.concat([...porChave].filter(([k]) => !quer.has(k) && !mexidos.has(k)).map(([, ev]) => ev));
    await emLotes(criar, 8, it => g(token, `/calendars/${cid}/events`, { method: 'POST', body: JSON.stringify(corpo(it)) }));
    await emLotes(mudar, 8, x => g(token, `/calendars/${cid}/events/${encodeURIComponent(x.ev.id)}`, { method: 'PATCH', body: JSON.stringify(x.patch) }));
    await emLotes(apagar, 8, ev => g(token, `/calendars/${cid}/events/${encodeURIComponent(ev.id)}`, { method: 'DELETE' }).catch(() => null));

    // 3) compromissos das outras agendas, de todas as contas (sem feriados nem aniversários: o Tempo já tem os feriados).
    //    A mesma agenda compartilhada em duas contas e o mesmo convite nas duas entram uma vez só.
    const eventos = [], erros = [], vistasCal = new Set([cal.id]), vistosEv = new Set();
    const leContas = async (conta, tk, lista) => {
      const outras = lista.filter(c => !vistasCal.has(c.id) && c.selected !== false && !c.hidden && !/#holiday@|#contacts@|addressbook#/.test(c.id) && !(c.summary === 'Tempo' && c.accessRole === 'owner'));
      outras.forEach(c => vistasCal.add(c.id));
      await emLotes(outras, 5, async c => {
        const evs = await todos(tk, `/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${encodeURIComponent(desde)}&timeMax=${encodeURIComponent(ate)}`).catch(() => []);
        evs.forEach(ev => {
          if (ev.status === 'cancelled' || !ev.start) return;
          const eu = (ev.attendees || []).find(a => a.self); if (eu && eu.responseStatus === 'declined') return;
          const k = (ev.iCalUID || ev.id) + '|' + iniDe(ev); if (vistosEv.has(k)) return; vistosEv.add(k);
          eventos.push({ id: c.id + '|' + ev.id, uid: ev.iCalUID || '', ini: iniDe(ev), fim: fimDe(ev), titulo: ev.summary || (ev.visibility === 'private' ? 'Ocupado' : '(sem título)'), agenda: c.summaryOverride || c.summary || '', conta, diaTodo: !!ev.start.date, livre: ev.transparency === 'transparent' });
        });
      });
    };
    await leContas(integ.account_email, token, cals);
    for (const r of contas.filter(x => x !== integ)) {
      try { const tk = await gmailAccessToken(r.refresh_token); await leContas(r.account_email, tk, await todos(tk, '/users/me/calendarList?maxResults=250')); }
      catch (e) { erros.push({ conta: r.account_email, erro: /has not been used|is disabled/i.test(e.message) ? 'api-desligada' : e.message }); }
    }
    eventos.sort((a, b) => ms(a.ini) - ms(b.ini));
    await rest(`tempo_integrations?id=in.(${contas.map(r => r.id).join(',')})`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_sync_at: new Date().toISOString() }) });
    res.json({ connected: true, conta: integ.account_email, contas: lista, erros, eventos, editados, feitos: { criados: criar.length, mudados: mudar.length, apagados: apagar.length } });
  } catch (e) {
    const semApi = /has not been used|is disabled|accessNotConfigured/i.test(e.message);
    res.status(200).json({ connected: true, erro: semApi ? 'api-desligada' : e.message });
  }
};
