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
/* Mensagem dele sem resposta sua: há quanto tempo. */
const waEsperando = (c) => { const i = c.last_in ? new Date(c.last_in).getTime() : 0, o = c.last_out ? new Date(c.last_out).getTime() : 0; return i > o ? Date.now() - i : 0; };
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
  const p = c.project_id && db.get('tempo_projects', c.project_id);
  if (p) { const cl = db.get('tempo_clients', p.client_id); return `<span data-tip="Grupo ligado ao projeto">${cl ? clientTag(cl) + ' ' : ''}${esc(p.name)}</span>`; }
  // vale o que estiver ligado (agência ou cliente), qualquer que seja o tipo; o tipo só sugere o padrão
  const a = c.agency_id && db.get('tempo_agencies', c.agency_id); if (a) return agencyTag(a);
  const cl = c.client_id && db.get('tempo_clients', c.client_id); return cl ? clientTag(cl) : `<span class="faint">Escolher ${waLigaAgencia(c) ? 'agência' : 'cliente'}</span>`;
}

const WACOLS = {
  name: { label: 'Contato', ico: 'text', cls: 'name', w: 260, sort: c => String(c.name || ''), cell: c => esc(c.name || '') },
  tipo: { label: 'Tipo', ico: 'spin', w: 190, sort: c => waTipoNome(c), cell: c => { const o = c.tipo_id ? db.get('tempo_status_options', c.tipo_id) : null; return o ? tag(o.name, o.color, { pill: true }) : '<span class="faint">Sem tipo (conta como Amigo)</span>'; },
    edit: { type: 'combo', kind: 'wa_tipo', allowEmpty: true, emptyLabel: 'Sem tipo', get: c => c.tipo_id, set: (c, v) => db.update('tempo_wa_contacts', c.id, { tipo_id: v || null }) } },
  vinc: { label: 'Cliente / agência', ico: 'users', w: 220, sort: c => (db.get('tempo_clients', c.client_id)?.name || db.get('tempo_agencies', c.agency_id)?.name || '~'), cell: waVinculoCell,
    edit: { type: 'combo', when: c => waEhTrabalho(c), kind: 'party', allowEmpty: true, emptyLabel: 'Nenhum',
      get: c => c.agency_id ? 'a:' + c.agency_id : c.client_id ? 'c:' + c.client_id : null,
      set: (c, v) => db.update('tempo_wa_contacts', c.id, { agency_id: v && v.startsWith('a:') ? v.slice(2) : null, client_id: v && v.startsWith('c:') ? v.slice(2) : null, project_id: null }) } },
  sug: { label: 'Sugestão', ico: 'spin', w: 260, sort: c => waSugestao(c)?.label || '~', cell: c => {
    if (c.tipo_id && (c.client_id || c.agency_id || c.project_id)) return '';   // já ligado: nada a sugerir
    const s = waSugestao(c); if (!s) return '';
    return `<span class="row gap-s" style="flex-wrap:nowrap"><span class="small" data-tip="O nome do contato bate com um cadastro do Tempo">${esc(s.label)}</span><button class="btn sm" data-act="wa-sug" data-id="${c.id}">Aceitar</button></span>`;
  } },
  resp: { label: 'Resposta média', ico: 'clock', w: 140, money: true, sort: c => c.resp_med_s ?? 1e12, cell: c => c.resp_n ? `<span data-tip="${esc(`Quanto você leva para responder, em média\n${c.resp_n} respostas nos últimos 30 dias (qualquer horário)`)}">${fmtDur(c.resp_med_s * 1000)}</span>` : '' },
  esperando: { label: 'Esperando você', ico: 'alert', w: 140, sort: c => waEsperando(c) || 0, cell: c => { const ms = waEsperando(c); return ms ? `<span data-tip="${esc(`Última mensagem dele às ${fmtTime(c.last_in)}, sem resposta sua depois`)}">${fmtDur(ms)}</span>` : ''; } },
  tempo: { label: 'Tempo no WhatsApp', ico: 'clock', w: 150, money: true, sort: c => waTempoDe(c), cell: c => { const ms = waTempoDe(c); return ms ? `<span data-tip="${esc(`Tempo com a conversa aberta no WhatsApp\nDesde ${fmtDate(waTempo().desde)}`)}">${fmtDur(ms)}</span>` : ''; } },
  last: { label: 'Última mensagem', ico: 'clock', w: 150, sort: c => c.last_at || '', cell: c => waUltima(c) ? `<span data-tip="Última mensagem na conversa, enviada ou recebida">${esc(waUltima(c))}</span>` : '<span class="faint">—</span>' },
  semana: { label: 'Mensagens/semana', ico: 'hash', w: 150, money: true, sort: c => c.msgs_7d ?? -1, cell: c => c.msgs_7d ? `<span data-tip="${esc('Mensagens trocadas (enviadas e recebidas) nos últimos 7 dias, de qualquer aparelho')}">${c.msgs_7d}</span>` : '' },
  fora: { label: 'Fora do horário', ico: 'clock', w: 140, money: true, sort: c => c.fora_30d ?? -1, cell: c => c.fora_30d ? `<span data-tip="${esc(`Mensagens nos últimos 30 dias em fim de semana ou antes das 9h / depois das 19h${waEhTrabalho(c) ? '\nCom contato de trabalho: é trabalho escondido' : ''}`)}" ${waEhTrabalho(c) && c.fora_30d >= 10 ? 'style="color:var(--warn)"' : ''}>${c.fora_30d}</span>` : '' },
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
  const novos = lista.filter(c => !c.tipo_id), trab = lista.filter(c => c.tipo_id && waEhTrabalho(c)), serv = lista.filter(c => c.tipo_id && waEhServico(c)), outros = lista.filter(c => c.tipo_id && !waEhTrabalho(c) && !waEhServico(c));
  const semVinculo = trab.filter(c => !c.agency_id && !c.client_id && !c.project_id).length;
  const comSug = [...novos, ...trab.filter(c => !c.client_id && !c.agency_id && !c.project_id)].filter(c => waSugestao(c));
  const bloco = (id, titulo, rows, extra, vazio, ocultas = []) => `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>${titulo} <span class="muted">(${rows.length})</span></h3><span class="grow"></span>${extra || ''}${rows.length ? colsBtn(id) : ''}</div>
    <div class="panel-b tight">${rows.length ? gridTable({ id, cols: WACOLS, rows, defHidden: ocultas, rowById: (rid) => db.get('tempo_wa_contacts', rid) }) : `<div class="empty small">${vazio}</div>`}</div></div>`;
  const html = (S.contacts.revisar && comSug.length ? waRevisaoHTML(comSug) : '') + `<div class="filters" style="margin-bottom:12px"><input class="input search" placeholder="Buscar contato" value="${esc(S.contacts.q || '')}" data-input="contacts-q"></div>
    ${bloco('wa-novos', 'Não classificados', novos,
      (comSug.length ? `<button class="btn sm primary" data-act="wa-revisar" data-tip="Ver uma por uma e aceitar ou negar">Analisar ${comSug.length} sugestões</button>` : '')
      + (novos.length ? `<button class="btn sm" data-act="wa-amigos" data-tip="Os ${novos.length} contatos sem tipo passam a ser Amigo (o tempo com eles continua sendo pausa)">Marcar ${novos.length} como Amigo</button>` : ''),
      'Nenhum contato esperando. Contato novo do WhatsApp aparece aqui.', ['vinc', 'resp', 'esperando'])}
    ${bloco('wa-trab', 'Trabalho', trab,
      semVinculo ? `<span class="small muted" data-tip="Ligue cada contato a um cliente ou agência para o tempo somar lá">${semVinculo} sem cliente ou agência</span>` : '',
      'Cliente, agência, colega, fornecedor e administrativo aparecem aqui. O tempo de WhatsApp com eles conta como trabalho.', ['msgs'])}
    ${bloco('wa-serv', 'Serviços', serv, '', 'Quem te atende: plano de saúde, seguro, terapias, condomínio, contabilidade, lojas. Não é trabalho nem amigo; o tempo com eles é pausa, fora do alerta de amigos.', ['vinc', 'resp', 'esperando', 'sug'])}
    ${bloco('wa-outros', 'Outros', outros,
      `<label class="small row gap-s" data-tip="Passou disso num dia, aparece um aviso (conta quem não é de trabalho)">Alerta de amigos: <input type="number" min="5" step="5" class="input" style="width:70px" value="${waAmigosLimiteMin()}" data-input="wa-amigos-min"> min por dia · hoje ${fmtDur(waAmigosHojeMs())}</label>`,
      'Amigos e contatos mistos mais amigo. O tempo com eles é pausa.', ['vinc', 'resp', 'esperando', 'sug'])}`;
  return { title: 'Contatos', html };
};
CHANGES['contacts-q'] = (el) => { S.contacts.q = el.value; render(); };
CHANGES['wa-amigos-min'] = (el) => { const v = Math.max(5, Number(el.value) || 30); db.setSetting('waAmigosMin', v); };
ACTIONS['wa-sug'] = (el) => { const c = db.get('tempo_wa_contacts', el.dataset.id); if (c && waAceitarSugestao(c)) { db.emit(); toast('Sugestão aceita'); } };
ACTIONS['wa-sug-todas'] = async () => {
  const lista = waTodos().filter(c => (!c.tipo_id || (waEhTrabalho(c) && !c.client_id && !c.agency_id && !c.project_id)) && waSugestao(c));
  if (!lista.length) return;
  if (!await confirmBox({ title: `Aceitar ${lista.length} sugestões?`, body: lista.slice(0, 12).map(c => `${esc(c.name)} → ${esc(waSugestao(c).label)}`).join('<br>') + (lista.length > 12 ? '<br>…' : ''), ok: 'Aceitar' })) return;
  lista.forEach(waAceitarSugestao); db.emit(); toast(`${lista.length} sugestões aceitas`);
};
ACTIONS['wa-amigos'] = async () => {
  const lista = waNovos(); if (!lista.length) return;
  const amigo = statuses('wa_tipo').find(s => s.name === 'Amigo'); if (!amigo) return toast('Tipo Amigo não encontrado.');
  if (!await confirmBox({ title: `Marcar ${lista.length} contatos como Amigo?`, body: 'Todos os contatos ainda sem tipo viram Amigo. Você pode mudar qualquer um depois.', ok: 'Marcar como Amigo' })) return;
  lista.forEach(c => db.update('tempo_wa_contacts', c.id, { tipo_id: amigo.id }, true));
  db.emit(); toast(`${lista.length} contatos marcados como Amigo`);
};
/* Aviso "contatos sem classificar" leva direto para cá. */
ACTIONS['wa-abrir'] = () => go('contacts');

/* Análise das sugestões: uma linha por contato, com Aceitar ou Negar. Negada não volta a ser sugerida. */
function waRevisaoHTML(lista) {
  const r = S.contacts.rev || (S.contacts.rev = {});
  const nOk = lista.filter(c => r[c.id] === 'ok').length, nNo = lista.filter(c => r[c.id] === 'no').length;
  const linha = (c) => { const s = waSugestao(c), v = r[c.id];
    return `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line);gap:12px">
      <span class="grow"><b>${esc(c.name)}</b> <span class="muted">→ ${esc(s.label)}</span></span>
      <label class="check small"><input type="checkbox" data-act="wa-rev" data-id="${c.id}" data-v="ok" ${v === 'ok' ? 'checked' : ''}> Aceitar</label>
      <label class="check small"><input type="checkbox" data-act="wa-rev" data-id="${c.id}" data-v="no" ${v === 'no' ? 'checked' : ''}> Negar</label></div>`; };
  return `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Analisar sugestões <span class="muted">(${lista.length})</span></h3><span class="grow"></span>
      <button class="btn sm" data-act="wa-rev-todas" data-v="ok">Aceitar todas</button><button class="btn sm" data-act="wa-rev-todas" data-v="no">Negar todas</button><button class="btn sm ghost" data-act="wa-rev-fechar">Fechar</button></div>
    <div class="panel-b"><p class="small muted" style="margin:0 0 6px">A sugestão vem do nome do contato, que bate com um cliente, agência ou projeto cadastrado. Aceitar marca o tipo e liga ao cadastro. Negar faz essa sugestão não aparecer mais.</p>
      ${lista.map(linha).join('')}
      <div class="row" style="margin-top:12px;gap:8px"><button class="btn primary" data-act="wa-rev-aplicar" ${nOk + nNo ? '' : 'disabled'}>Aplicar (${nOk} aceitas, ${nNo} negadas)</button><span class="small muted">As que ficarem sem marcar continuam aqui.</span></div></div></div>`;
}
const waRevLista = () => waTodos().filter(c => (!c.tipo_id || (waEhTrabalho(c) && !c.client_id && !c.agency_id && !c.project_id)) && waSugestao(c));
ACTIONS['wa-revisar'] = () => { S.contacts.revisar = true; S.contacts.rev = {}; render(); window.scrollTo(0, 0); };
ACTIONS['wa-rev-fechar'] = () => { S.contacts.revisar = false; S.contacts.rev = {}; render(); };
ACTIONS['wa-rev'] = (el) => { const r = S.contacts.rev || (S.contacts.rev = {}); r[el.dataset.id] = r[el.dataset.id] === el.dataset.v ? null : el.dataset.v; render(); };
ACTIONS['wa-rev-todas'] = (el) => { const r = S.contacts.rev || (S.contacts.rev = {}); waRevLista().forEach(c => { r[c.id] = el.dataset.v; }); render(); };
ACTIONS['wa-rev-aplicar'] = () => {
  const r = S.contacts.rev || {}; let ok = 0, no = 0;
  waRevLista().forEach(c => { if (r[c.id] === 'ok' && waAceitarSugestao(c)) ok++; else if (r[c.id] === 'no') { waNegarSugestao(c); no++; } });
  S.contacts.rev = {}; if (!waRevLista().length) S.contacts.revisar = false;
  db.emit(); toast(`${ok} aceitas, ${no} negadas`);
};
