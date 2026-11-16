/* =====================================================================
   CONTATOS (WhatsApp)
   Três blocos: primeiro os não classificados, depois Trabalho (todos que não são amigos)
   e por último Outros (o tempo com eles é pausa). Contato de trabalho fica ligado a um cliente
   ou a uma agência, e o tempo de WhatsApp com ele soma lá (colunas "WhatsApp" em Agências e clientes).
   Dentro de cada bloco, a ordem é a do WhatsApp: última mensagem primeiro.
   ===================================================================== */
const waTodos = () => db.all('tempo_wa_contacts') || [];
const waNovos = () => waTodos().filter(c => !c.tipo_id);
const waMsgs = (jid) => (db.all('tempo_wa_daily') || []).filter(d => d.jid === jid).reduce((t, d) => t + (d.sent || 0), 0);
const waUltima = (c) => {
  if (!c.last_at) return '';
  const d = new Date(c.last_at);
  return ymd(new Date()) === ymd(d) ? `hoje ${fmtTime(c.last_at)}` : `${fmtDate(ymd(d))} ${fmtTime(c.last_at)}`;
};
const waOrdem = (a, b) => String(b.last_at || '').localeCompare(String(a.last_at || '')) || waMsgs(b.jid) - waMsgs(a.jid) || String(a.name || '').localeCompare(String(b.name || ''));

/* Tempo com cada conversa aberta, somado do registro de atividade (o app do Mac manda o nome da conversa).
   Guardado até o registro mudar, para a tela não refazer a conta a cada desenho. */
let _waTempo = null;
function waTempo() {
  const arr = db.data.tempo_settings || [];
  if (_waTempo && _waTempo.arr === arr && _waTempo.rev === (db.setRev || 0)) return _waTempo;
  const ms = {}; let desde = null;
  arr.forEach(r => {
    if (!String(r.key || '').startsWith('actlog:') || !Array.isArray(r.value)) return;
    const dia = String(r.key).slice(7);
    r.value.forEach(x => {
      if (!/whatsapp/i.test(String(x.app || '')) || !x.doc) return;
      const d = new Date(x.to) - new Date(x.from); if (!(d > 0)) return;
      const k = String(x.doc).trim().toLowerCase();
      ms[k] = (ms[k] || 0) + d;
      if (!desde || dia < desde) desde = dia;
    });
  });
  return (_waTempo = { arr, rev: db.setRev || 0, ms, desde });
}
const waTempoDe = (c) => waTempo().ms[String(c.name || '').trim().toLowerCase()] || 0;
const waTempoDoCliente = (id) => waTodos().filter(c => c.client_id === id).reduce((t, c) => t + waTempoDe(c), 0);
const waTempoDaAgencia = (id) => waTodos().filter(c => c.agency_id === id).reduce((t, c) => t + waTempoDe(c), 0);

/* Agência liga à agência; os outros tipos de trabalho ligam ao cliente. */
const waLigaAgencia = (c) => waTipoNome(c) === 'Agência';
function waVinculoCell(c) {
  if (!waEhTrabalho(c)) return '<span class="faint">—</span>';
  if (waLigaAgencia(c)) { const a = c.agency_id && db.get('tempo_agencies', c.agency_id); return a ? agencyTag(a) : '<span class="faint">Escolher agência</span>'; }
  const cl = c.client_id && db.get('tempo_clients', c.client_id); return cl ? clientTag(cl) : '<span class="faint">Escolher cliente</span>';
}

const WACOLS = {
  name: { label: 'Contato', ico: 'text', cls: 'name', w: 260, sort: c => String(c.name || ''), cell: c => esc(c.name || '') },
  tipo: { label: 'Tipo', ico: 'spin', w: 190, sort: c => waTipoNome(c), cell: c => { const o = c.tipo_id ? db.get('tempo_status_options', c.tipo_id) : null; return o ? tag(o.name, o.color, { pill: true }) : '<span class="faint">Sem tipo (conta como Amigo)</span>'; },
    edit: { type: 'combo', kind: 'wa_tipo', allowEmpty: true, emptyLabel: 'Sem tipo', get: c => c.tipo_id, set: (c, v) => db.update('tempo_wa_contacts', c.id, { tipo_id: v || null }) } },
  vinc: { label: 'Cliente / agência', ico: 'users', w: 220, sort: c => (db.get('tempo_clients', c.client_id)?.name || db.get('tempo_agencies', c.agency_id)?.name || '~'), cell: waVinculoCell,
    edit: { type: 'combo', when: c => waEhTrabalho(c), kind: c => waLigaAgencia(c) ? 'agency' : 'client', allowEmpty: true, emptyLabel: 'Nenhum',
      get: c => waLigaAgencia(c) ? c.agency_id : c.client_id,
      set: (c, v) => db.update('tempo_wa_contacts', c.id, waLigaAgencia(c) ? { agency_id: v || null, client_id: null } : { client_id: v || null, agency_id: null }) } },
  tempo: { label: 'Tempo no WhatsApp', ico: 'clock', w: 150, money: true, sort: c => waTempoDe(c), cell: c => { const ms = waTempoDe(c); return ms ? `<span data-tip="${esc(`Tempo com a conversa aberta no WhatsApp\nDesde ${fmtDate(waTempo().desde)}`)}">${fmtDur(ms)}</span>` : ''; } },
  last: { label: 'Última mensagem', ico: 'clock', w: 150, sort: c => c.last_at || '', cell: c => waUltima(c) ? `<span data-tip="Última mensagem na conversa, enviada ou recebida">${esc(waUltima(c))}</span>` : '<span class="faint">—</span>' },
  msgs: { label: 'Mensagens enviadas', ico: 'hash', w: 160, money: true, sort: c => waMsgs(c.jid), cell: c => {
    const n = waMsgs(c.jid); if (!n) return '';
    const dias = (db.all('tempo_wa_daily') || []).filter(d => d.jid === c.jid).map(d => d.day).sort();
    const periodo = dias.length > 1 ? `${fmtDate(dias[0])} a ${fmtDate(dias[dias.length - 1])}` : dias.length ? fmtDate(dias[0]) : '';
    return `<span data-tip="${esc(`Mensagens que você mandou${periodo ? `\n${periodo}` : ''}\nAs recebidas não entram na conta.`)}">${n}</span>`;
  } },
  grupo: { label: 'Grupo', ico: 'users', w: 90, sort: c => c.tipo === 'grupo' ? 0 : 1, cell: c => c.tipo === 'grupo' ? 'Sim' : '' },
};

VIEWS.contacts = () => {
  const q = (S.contacts.q || '').toLowerCase().trim();
  const lista = waTodos().filter(c => !q || String(c.name || '').toLowerCase().includes(q)).sort(waOrdem);
  const novos = lista.filter(c => !c.tipo_id), trab = lista.filter(c => c.tipo_id && waEhTrabalho(c)), outros = lista.filter(c => c.tipo_id && !waEhTrabalho(c));
  const semVinculo = trab.filter(c => waLigaAgencia(c) ? !c.agency_id : !c.client_id).length;
  const bloco = (id, titulo, rows, extra, vazio, ocultas = []) => `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>${titulo} <span class="muted">(${rows.length})</span></h3><span class="grow"></span>${extra || ''}${rows.length ? colsBtn(id) : ''}</div>
    <div class="panel-b tight">${rows.length ? gridTable({ id, cols: WACOLS, rows, defHidden: ocultas, rowById: (rid) => db.get('tempo_wa_contacts', rid) }) : `<div class="empty small">${vazio}</div>`}</div></div>`;
  const html = `<div class="filters" style="margin-bottom:12px"><input class="input search" placeholder="Buscar contato" value="${esc(S.contacts.q || '')}" data-input="contacts-q"></div>
    ${bloco('wa-novos', 'Não classificados', novos,
      novos.length ? `<button class="btn sm" data-act="wa-amigos" data-tip="Os ${novos.length} contatos sem tipo passam a ser Amigo (o tempo com eles continua sendo pausa)">Marcar ${novos.length} como Amigo</button>` : '',
      'Nenhum contato esperando. Contato novo do WhatsApp aparece aqui.', ['vinc'])}
    ${bloco('wa-trab', 'Trabalho', trab,
      semVinculo ? `<span class="small muted" data-tip="Ligue cada contato a um cliente ou agência para o tempo somar lá">${semVinculo} sem cliente ou agência</span>` : '',
      'Cliente, agência, colega, fornecedor e administrativo aparecem aqui. O tempo de WhatsApp com eles conta como trabalho.')}
    ${bloco('wa-outros', 'Outros', outros, '', 'Amigos e contatos mistos mais amigo. O tempo com eles é pausa.', ['vinc'])}`;
  return { title: 'Contatos', html };
};
CHANGES['contacts-q'] = (el) => { S.contacts.q = el.value; render(); };
ACTIONS['wa-amigos'] = async () => {
  const lista = waNovos(); if (!lista.length) return;
  const amigo = statuses('wa_tipo').find(s => s.name === 'Amigo'); if (!amigo) return toast('Tipo Amigo não encontrado.');
  if (!await confirmBox({ title: `Marcar ${lista.length} contatos como Amigo?`, body: 'Todos os contatos ainda sem tipo viram Amigo. Você pode mudar qualquer um depois.', ok: 'Marcar como Amigo' })) return;
  lista.forEach(c => db.update('tempo_wa_contacts', c.id, { tipo_id: amigo.id }, true));
  db.emit(); toast(`${lista.length} contatos marcados como Amigo`);
};
/* Aviso "contatos sem classificar" leva direto para cá. */
ACTIONS['wa-abrir'] = () => go('contacts');
