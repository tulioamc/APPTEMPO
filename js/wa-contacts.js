/* WhatsApp: contagem de mensagens que você mandou, por contato e dia.
   O app do Mac manda a contagem (window.TempoBridge.reportWhatsApp). Só nome, tipo e quantidade; nunca o texto.
   Contato novo entra como "amigo" (pausa), como combinado. Quem já tem tipo mantém o tipo (ignoreDuplicates). */
async function waReport(linhas) {
  const c = window.tempoClient;
  if (!c || !Array.isArray(linhas) || !linhas.length) return;
  try {
    const { data: { user } } = await c.auth.getUser();
    if (!user) return;
    const contatos = new Map();
    // hora da última mensagem (enviada ou recebida): a lista do Tempo fica na mesma ordem do WhatsApp.
    // Só vai quando todas as linhas trazem a hora (app do Mac antigo não manda; sem isso, não apaga a que já existe).
    const comHora = linhas.every(l => Number(l.ultima) > 0);
    const ultima = {};
    linhas.forEach(l => { if (comHora && (!ultima[l.jid] || l.ultima > ultima[l.jid])) ultima[l.jid] = Number(l.ultima); });
    linhas.forEach(l => contatos.set(l.jid, { user_id: user.id, jid: l.jid, name: l.name || l.jid, tipo: l.grupo ? 'grupo' : 'amigo',
      ...(comHora ? { last_at: new Date(ultima[l.jid] * 1000).toISOString() } : {}) }));
    // sem ignoreDuplicates: se você renomear o contato no WhatsApp, o nome aqui acompanha.
    // A classificação (tipo_id) fica presa à conversa, então não se perde na troca de nome.
    await c.from('tempo_wa_contacts').upsert([...contatos.values()], { onConflict: 'user_id,jid' });
    const diario = linhas.map(l => ({ user_id: user.id, jid: l.jid, day: l.dia, sent: l.enviadas }));
    await c.from('tempo_wa_daily').upsert(diario, { onConflict: 'user_id,jid,day' });
  } catch (e) { console.warn('waReport', e); }
}

/* Contato da conversa aberta no WhatsApp (o app do Mac manda o nome junto da atividade). */
function waContato(nome) {
  const n = String(nome || '').trim().toLowerCase();
  if (!n || n === 'whatsapp') return null;
  return (db.all('tempo_wa_contacts') || []).find(c => String(c.name || '').trim().toLowerCase() === n) || null;
}
/* Conversa de trabalho? Cliente, agência, colega, fornecedor, administrativo e "misto mais cliente".
   Sem classificação, o contato conta como amigo: o tempo vira pausa. */
function waEhTrabalho(c) {
  const o = c && c.tipo_id ? db.get('tempo_status_options', c.tipo_id) : null;
  return !!o && o.category === 'trabalho';
}
const waTipoNome = (c) => { const o = c && c.tipo_id ? db.get('tempo_status_options', c.tipo_id) : null; return o ? o.name : 'Amigo'; };

/* ---------- Sugestão de tipo pelo nome ----------
   Contato cujo nome contém o nome de um cliente, de uma agência (ou da sigla dela) ou, nos grupos, de um projeto ativo
   ganha uma sugestão. Ex.: "[BRENDA] OPEN TO WORKS" → Agência · Brenda; "Carla BB" → Cliente · BB. Nada entra sem você aceitar. */
const waNorm = (t) => ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
function waSugestaoCrua(c) {
  const nome = waNorm(c.name); if (nome.trim().length < 2) return null;
  const bate = (t, min = 3) => { const n = waNorm(t); return n.trim().length >= min && nome.includes(n); };
  if (c.tipo === 'grupo') {
    const p = (db.all('tempo_projects') || []).filter(x => !x.archived && bate(x.name, 4)).sort((a, b) => String(b.name).length - String(a.name).length)[0];
    if (p) { const cl = db.get('tempo_clients', p.client_id); return { tipo: 'Cliente', client_id: p.client_id || null, project_id: p.id, label: `Projeto · ${p.name}${cl ? ` (${cl.name})` : ''}` }; }
  }
  const cl = (db.all('tempo_clients') || []).filter(x => !x.archived && bate(x.name)).sort((a, b) => String(b.name).length - String(a.name).length)[0];
  if (cl) return { tipo: 'Cliente', client_id: cl.id, label: `Cliente · ${cl.name}` };
  const ag = (db.all('tempo_agencies') || []).filter(x => !x.archived && (bate(x.name) || (x.abbr && bate(x.abbr, 2)))).sort((a, b) => String(b.name).length - String(a.name).length)[0];
  if (ag) return { tipo: 'Agência', agency_id: ag.id, label: `Agência · ${ag.name}` };
  return null;
}
/* Sugestões negadas não voltam: guarda, por contato, o texto da sugestão que você negou. */
const waSugNegadas = () => db.setting('waSugNegadas', {}) || {};
function waSugestao(c) {
  const s = waSugestaoCrua(c);
  return s && waSugNegadas()[c.id] === s.label ? null : s;
}
function waNegarSugestao(c) {
  const s = waSugestaoCrua(c); if (!s) return;
  db.setSetting('waSugNegadas', { ...waSugNegadas(), [c.id]: s.label });
}
/* Aplica a sugestão: tipo + cliente/agência/projeto. */
function waAceitarSugestao(c) {
  const s = waSugestao(c); if (!s) return false;
  const tipo = statuses('wa_tipo').find(o => o.name === s.tipo); if (!tipo) return false;
  const patch = { client_id: s.client_id || null, agency_id: s.agency_id || null, project_id: s.project_id || null };
  if (!c.tipo_id || !waEhTrabalho(c)) patch.tipo_id = tipo.id;
  db.update('tempo_wa_contacts', c.id, patch, true);
  return true;
}

/* ---------- Conversas: última recebida/enviada, resposta média e mensagens do celular ----------
   O app do Mac manda a cada 5 min: { conversas: [{ jid, name, grupo, lastIn, lastOut, respMed, respN }], enviadas: [{ name, t }] }
   (horários em segundos Unix; enviadas = mensagens que você mandou nas últimas 24 h, de qualquer aparelho). Nunca o texto. */
async function waReportConversas(d) {
  const c = window.tempoClient;
  if (!c || !d || !Array.isArray(d.conversas)) return;
  try {
    const { data: { user } } = await c.auth.getUser(); if (!user) return;
    const iso = (t) => t > 0 ? new Date(t * 1000).toISOString() : null;
    const linhas = d.conversas.filter(x => x.jid).map(x => ({ user_id: user.id, jid: x.jid, name: x.name || x.jid, tipo: x.grupo ? 'grupo' : 'amigo',
      last_in: iso(x.lastIn), last_out: iso(x.lastOut), resp_med_s: x.respN > 0 ? Math.round(x.respMed) : null, resp_n: x.respN || 0 }));
    if (linhas.length) await c.from('tempo_wa_contacts').upsert(linhas, { onConflict: 'user_id,jid' });
    await db.refresh();
  } catch (e) { console.warn('waReportConversas', e); }
  try { waRotularPausas(d.enviadas || []); } catch (e) { console.warn('waRotularPausas', e); }
}

/* Celular: o WhatsApp do celular nunca cria pausa, só dá nome a uma que já existe.
   Pausa de parado (mouse e teclado, ou pausa sem motivo) com mensagem sua a quem não é de trabalho no mesmo horário → "WhatsApp".
   Pausa de computador fechado, trecho movido e trabalho não mudam. */
const WA_ROTULAVEL = (w) => !w || w === 'mac' || w === 'ocioso' || w === 'manual';
function waRotularPausas(enviadas) {
  const amigos = enviadas.filter(m => m && m.t > 0 && !waEhTrabalho(waContato(m.name))).map(m => m.t * 1000);
  if (!amigos.length) return 0;
  const desde = Date.now() - 48 * 36e5; let n = 0;
  (db.all('tempo_time_entries') || []).forEach(e => {
    const segs = e.segments || []; if (segs.length < 2) return;
    let mudou = false; const novos = segs.map(x => ({ ...x }));
    for (let i = 0; i < segs.length - 1; i++) {
      const a = segs[i].e ? new Date(segs[i].e).getTime() : null, b = segs[i + 1].s ? new Date(segs[i + 1].s).getTime() : null;
      if (!a || !b || b <= a || b < desde || !WA_ROTULAVEL(segs[i].why)) continue;
      if (amigos.some(t => t >= a && t <= b)) { novos[i].why = 'WhatsApp'; mudou = true; n++; }
    }
    if (mudou) db.update('tempo_time_entries', e.id, { segments: novos, edits: [...(e.edits || []), { at: nowISO(), reason: 'Pausa rotulada como WhatsApp (mensagens pelo celular no mesmo horário)', before: segs }] }, true);
  });
  if (n) db.emit();
  return n;
}

/* Minutos de horário de trabalho (seg a sex, 9h às 19h, fora das férias) entre dois instantes. */
const WA_INICIO_H = 9, WA_FIM_H = 19;
function waMinutosUteis(deMs, ateMs) {
  let total = 0; const d = new Date(deMs); d.setHours(0, 0, 0, 0);
  for (let guard = 0; d.getTime() < ateMs && guard < 60; guard++, d.setDate(d.getDate() + 1)) {
    const dia = ymd(d), sem = d.getDay();
    if (sem === 0 || sem === 6 || (typeof emFerias === 'function' && emFerias(dia))) continue;
    const ini = new Date(d); ini.setHours(WA_INICIO_H, 0, 0, 0);
    const fim = new Date(d); fim.setHours(WA_FIM_H, 0, 0, 0);
    const a = Math.max(deMs, ini.getTime()), b = Math.min(ateMs, fim.getTime());
    if (b > a) total += (b - a) / 60e3;
  }
  return total;
}
/* Tempo de hoje no WhatsApp com quem não é de trabalho (registro de atividade). */
function waAmigosHojeMs(dia = ymd(new Date())) {
  return (db.setting('actlog:' + dia, null) || []).filter(r => /whatsapp/i.test(String(r.app || '')) && !waEhTrabalho(waContato(r.doc)))
    .reduce((t, r) => t + Math.max(0, new Date(r.to) - new Date(r.from)), 0);
}
const waAmigosLimiteMin = () => Number(db.setting('waAmigosMin', 30)) || 30;
