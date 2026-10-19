/* =====================================================================
   AGÊNCIAS E CLIENTES
   ===================================================================== */
const partyProjects = (kind, id) => projects().filter(p => kind === 'agency' ? agencyOf(p)?.id === id : p.client_id === id);
VIEWS.registry = () => {
  const r = S.reg; const q = r.q.toLowerCase().trim();
  const ma = (x) => !q || [x.name, x.cnpj, x.contact].some(s => (s || '').toLowerCase().includes(q));
  const showArch = r.arch;
  const ags = db.all('tempo_agencies').filter(a => (showArch || !a.archived) && ma(a)).sort(agencySort);
  const cls = db.all('tempo_clients').filter(c => (showArch || !c.archived) && (ma(c) || (db.get('tempo_agencies', c.agency_id)?.name || '').toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  const sumP = (ps, fn) => ps.reduce((s, p) => s + (fn(p) || 0), 0);
  let body;
  if (r.tab === 'agencies') body = ags.length ? gridTable({ id: 'agencies', cols: AGCOLS, rows: ags, rowAttrs: a => `data-act="party-open" data-kind="agency" data-id="${a.id}"`, rowById: (id) => db.get('tempo_agencies', id) })
    : `<div class="empty">${icon('users')}<b>${q ? 'Nada encontrado' : 'Nenhuma agência cadastrada'}</b><span>Agência contratante é quem contrata ou intermedeia o trabalho. Um cliente pode existir sem agência.</span><button class="btn primary" data-act="party-new" data-kind="agency">${icon('plus')} Nova agência</button></div>`;
  else body = cls.length ? gridTable({ id: 'clients', cols: CLCOLS, rows: cls, rowAttrs: c => `data-act="party-open" data-kind="client" data-id="${c.id}"`, rowById: (id) => db.get('tempo_clients', id) })
    : `<div class="empty">${icon('users')}<b>${q ? 'Nada encontrado' : 'Nenhum cliente cadastrado'}</b><button class="btn primary" data-act="party-new" data-kind="client">${icon('plus')} Novo cliente</button></div>`;
  const html = `<div class="panel"><div class="panel-h"><div class="seg">${[['agencies', `Agências (${db.all('tempo_agencies').filter(a => !a.archived).length})`], ['clients', `Clientes (${clients().length})`]].map(([k, l]) => `<button class="${r.tab === k ? 'on' : ''}" data-act="reg-tab" data-v="${k}">${l}</button>`).join('')}</div><span class="grow"></span>${colsBtn(r.tab)}<label class="check small"><input type="checkbox" data-on="reg-arch" ${r.arch ? 'checked' : ''}> Mostrar arquivados</label></div>
    <div class="filters"><input id="rg-q" class="input search" placeholder="Buscar por nome, CNPJ ou contato" value="${esc(r.q)}" data-input="reg-q"></div>
    <div class="panel-b tight">${body}</div></div>`;
  return { title: 'Agências e clientes', actions: `<button class="btn" data-act="party-new" data-kind="agency">${icon('plus')} Agência</button><button class="btn primary" data-act="party-new" data-kind="client">${icon('plus')} Cliente</button>`, html };
};
const pSum = (kind, id, fn) => partyProjects(kind, id).reduce((s, p) => s + (fn(p) || 0), 0);
const txtEdit = (t, k, req) => ({ type: 'text', required: req, get: x => x[k], set: (x, v) => db.update(t, x.id, { [k]: v }) });
const AGCOLS = {
  name: { label: 'Agência contratante', ico: 'text', w: 260, sort: a => a.name, cell: a => `<span class="cell-name"><span class="ct row" style="gap:4px;flex-wrap:nowrap">${agencyAbbr(a) ? `<span class="tag tg abbr" style="${cssTb(a.color)}${partyFg('agency', a.id) ? ';color:' + partyFg('agency', a.id) : ''}">${esc(agencyAbbr(a))}</span>` : isDirectAgency(a) ? `<span class="tag tg abbr" style="${cssTb(a.color)}" aria-hidden="true">&nbsp;</span>` : ''}${tag(a.name, a.color, { upper: true, fg: partyFg('agency', a.id) })}${a.archived ? ' <span class="inh">arquivada</span>' : ''}</span>${openBtn('party-open', a.id, 'data-kind="agency"')}</span>`, edit: { ...txtEdit('tempo_agencies', 'name', true), when: a => !isDirectAgency(a) } },
  abbr: { label: 'Sigla', ico: 'tag', w: 80, sort: a => agencyAbbr(a), cell: a => `<span class="mono">${esc(agencyAbbr(a))}</span>`, edit: { type: 'text', when: a => !isDirectAgency(a), get: a => agencyAbbr(a), set: (a, v) => { const ab = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); if (!ab) return; if (db.all('tempo_agencies').some(x => x.id !== a.id && (x.abbr || '').toUpperCase() === ab)) return toast(`A sigla ${ab} já é usada.`); db.update('tempo_agencies', a.id, { abbr: ab }); } } },
  cnpj: { label: 'CNPJ', ico: 'hash', w: 170, cls: 'mono', sort: a => a.cnpj || '', cell: a => esc(a.cnpj || ''), edit: txtEdit('tempo_agencies', 'cnpj') },
  contact: { label: 'Contato', ico: 'users', w: 240, cls: 'obs', sort: a => a.contact || '', cell: a => esc(a.contact || ''), edit: txtEdit('tempo_agencies', 'contact') },
  nclients: { label: 'Clientes', ico: 'hash', w: 90, money: true, sort: a => clients(a.id).length, cell: a => clients(a.id).length },
  nprojects: { label: 'Projetos', ico: 'hash', w: 90, money: true, sort: a => partyProjects('agency', a.id).length, cell: a => partyProjects('agency', a.id).length },
  hours: { label: 'Horas', ico: 'clock', w: 100, money: true, sort: a => pSum('agency', a.id, p => projectMs(p.id)), val: a => pSum('agency', a.id, p => projectMs(p.id)), fmt: v => fmtH(v), cell: a => fmtH(pSum('agency', a.id, p => projectMs(p.id))) },
  budget: { label: 'Orçado', ico: 'hash', w: 140, money: true, sort: a => pSum('agency', a.id, p => Number(p.budget)), val: a => pSum('agency', a.id, p => Number(p.budget)), cell: a => fmtMoney0(pSum('agency', a.id, p => Number(p.budget))) },
  open: { label: 'Em aberto', ico: 'hash', w: 140, money: true, sort: a => pSum('agency', a.id, remainingOf), val: a => pSum('agency', a.id, remainingOf), cell: a => fmtMoney0(pSum('agency', a.id, remainingOf)) }
};
const CLCOLS = {
  name: { label: 'Cliente', ico: 'text', w: 260, sort: c => c.name, cell: c => `<span class="cell-name"><span class="ct">${clientTag(c)}${c.archived ? ' <span class="inh">arquivado</span>' : ''}</span>${openBtn('party-open', c.id, 'data-kind="client"')}</span>`, edit: txtEdit('tempo_clients', 'name', true) },
  agency: { label: 'Agência', ico: 'spin', w: 150, sort: c => db.get('tempo_agencies', c.agency_id)?.name || '~', cell: c => agencyTag(db.get('tempo_agencies', c.agency_id)), edit: { type: 'combo', kind: 'agency', get: c => c.agency_id, set: (c, v) => db.update('tempo_clients', c.id, { agency_id: v || directAgency()?.id || null }) } },
  contact: { label: 'Contato', ico: 'users', w: 220, cls: 'obs', sort: c => c.contact || '', cell: c => esc(c.contact || ''), edit: txtEdit('tempo_clients', 'contact') },
  nprojects: { label: 'Projetos', ico: 'hash', w: 90, money: true, sort: c => partyProjects('client', c.id).length, cell: c => partyProjects('client', c.id).length },
  hours: { label: 'Horas', ico: 'clock', w: 100, money: true, sort: c => pSum('client', c.id, p => projectMs(p.id)), val: c => pSum('client', c.id, p => projectMs(p.id)), fmt: v => fmtH(v), cell: c => fmtH(pSum('client', c.id, p => projectMs(p.id))) },
  budget: { label: 'Orçado', ico: 'hash', w: 140, money: true, sort: c => pSum('client', c.id, p => Number(p.budget)), val: c => pSum('client', c.id, p => Number(p.budget)), cell: c => fmtMoney0(pSum('client', c.id, p => Number(p.budget))) },
  paid: { label: 'Pago', ico: 'hash', w: 140, money: true, sort: c => pSum('client', c.id, paidOf), val: c => pSum('client', c.id, paidOf), cell: c => fmtMoney0(pSum('client', c.id, paidOf)) },
  open: { label: 'Em aberto', ico: 'hash', w: 140, money: true, sort: c => pSum('client', c.id, remainingOf), val: c => pSum('client', c.id, remainingOf), cell: c => fmtMoney0(pSum('client', c.id, remainingOf)) }
};
ACTIONS['reg-tab'] = (el) => { S.reg.tab = el.dataset.v; render(); };
CHANGES['reg-q'] = (el) => { S.reg.q = el.value; render(); };
CHANGES['reg-arch'] = (el) => { S.reg.arch = el.checked; render(); };
ACTIONS['party-new'] = (el) => openPartyForm(el.dataset.kind, null);
ACTIONS['party-open'] = (el) => openParty(el.dataset.kind, el.dataset.id);
ACTIONS['party-color'] = (el) => {
  const T = el.dataset.kind === 'agency' ? 'tempo_agencies' : 'tempo_clients'; const id = el.dataset.id;
  openColorPop(el, db.get(T, id).color, (c) => db.update(T, id, { color: c }), { onText: (c) => setPartyFg(el.dataset.kind, id, c), currentText: partyFg(el.dataset.kind, id) });
};

function openPartyForm(kind, id, cb, preset = {}) {
  const T = kind === 'agency' ? 'tempo_agencies' : 'tempo_clients';
  const x = id ? db.get(T, id) : null; const lab = kind === 'agency' ? 'agência' : 'cliente';
  const l = openLayer({
    html: `<div class="dh"><h2>${x ? 'Editar ' + lab : (kind === 'agency' ? 'Nova agência contratante' : 'Novo cliente')}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <form class="db" id="ptf">
      <div class="field"><label for="pt-n">Nome *</label><input id="pt-n" class="input" name="name" value="${esc(x?.name || preset.name || '')}" autofocus><span class="hint" id="pt-dup"></span></div>
      ${kind === 'agency' ? `<div class="field"><label for="pt-ab">Sigla</label><input id="pt-ab" class="input mono" name="abbr" maxlength="4" style="max-width:120px;text-transform:uppercase" value="${esc(x?.abbr || '')}" placeholder="${esc(abbrFor(x?.name || '', id))}"><span class="hint">Aparece antes do nome do cliente, ex.: <b>[${esc(x?.abbr || 'BR')}][ABA]</b>. Vazio = automática (2 primeiras letras, sem repetir outra agência).</span></div>` : ''}
      ${kind === 'client' ? `<div class="field"><label for="pt-a">Agência contratante</label><select id="pt-a" class="input" name="agency_id">${options(agencies(), x?.agency_id || preset.agency_id || directAgency()?.id)}</select></div>` : ''}
      <div class="grid2"><div class="field"><label for="pt-c">CNPJ</label><input id="pt-c" class="input" name="cnpj" value="${esc(x?.cnpj || '')}" inputmode="numeric" placeholder="00.000.000/0000-00"></div>
      <div class="field"><label for="pt-ct">Contato</label><input id="pt-ct" class="input" name="contact" value="${esc(x?.contact || '')}" placeholder="Nome, e-mail, telefone"></div></div>
      <div class="field"><label for="pt-e">Endereço</label><input id="pt-e" class="input" name="address" value="${esc(x?.address || '')}"></div>
      <div class="field"><label for="pt-o">Observações gerais</label><textarea id="pt-o" class="input" name="notes">${esc(x?.notes || '')}</textarea></div>
      <div class="field"><span class="lbl">Cor da etiqueta</span>${colorPicker('color', x?.color || (preset.agency_id ? colorVariant(db.get('tempo_agencies', preset.agency_id).color, clients(preset.agency_id).map(k => k.color)) : presetAt(db.all(kind === 'agency' ? 'tempo_agencies' : 'tempo_clients').length)))}</div>
      <div class="field"><span class="lbl">Cor da letra</span><input type="hidden" id="pt-fg" name="fg" value="${esc(partyFg(kind, id) || '')}">
        <div class="swatches" role="radiogroup">
          <button type="button" class="swatch tx ${!partyFg(kind, id) ? 'on' : ''}" data-fg="" title="Padrão do tema" aria-label="Padrão">A</button>
          ${TEXT_COLORS.map(c => `<button type="button" class="swatch tx ${partyFg(kind, id) === c ? 'on' : ''}" style="color:${c}${c === '#FFFFFF' ? ';background:#374151' : ''}" data-fg="${c}" title="${c}" aria-label="Letra ${c}">A</button>`).join('')}
          <label class="swatch swatch-add" title="Outra cor">+<input type="color" value="${partyFg(kind, id) || '#111111'}" data-fg-free aria-label="Outra cor da letra"></label>
        </div>
        <span class="hint">Vale para a etiqueta do ${lab} em todo o app.</span></div>
    </form>
    <div class="df"><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="save">${x ? 'Salvar' : 'Cadastrar'}</button></div>`
  });
  const dupCheck = () => { const v = $('#pt-n', l.box).value.trim().toLowerCase(); const d = v && db.all(T).find(o => o.id !== id && o.name.trim().toLowerCase() === v); $('#pt-dup', l.box).innerHTML = d ? `<span style="color:var(--warn)">Já existe ${lab} com esse nome.</span>` : ''; return d; };
  $('#pt-n', l.box).addEventListener('input', () => { dupCheck(); const ab = $('#pt-ab', l.box); if (ab) ab.placeholder = abbrFor($('#pt-n', l.box).value, id); });
  let colorTouched = !!x;
  l.box.addEventListener('click', (e) => { if (e.target.closest('.swatches')) colorTouched = true; });
  l.box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fg]'); if (!b) return;
    l.box.querySelectorAll('[data-fg]').forEach(x => x.classList.toggle('on', x === b));
    $('#pt-fg', l.box).value = b.dataset.fg;
  });
  l.box.addEventListener('input', (e) => {
    if (!e.target.matches('[data-fg-free]')) return;
    $('#pt-fg', l.box).value = e.target.value;
    l.box.querySelectorAll('[data-fg]').forEach(x => x.classList.remove('on'));
  });
  l.box.addEventListener('input', (e) => { if (e.target.matches('[data-color-free]')) colorTouched = true; });
  const agSel = $('#pt-a', l.box);
  const autoColor = () => { if (colorTouched || !agSel) return; const a = db.get('tempo_agencies', agSel.value); if (!a) return; const c = colorVariant(a.color, clients(a.id).map(k => k.color)); const wrap = $('.swatches', l.box); wrap.outerHTML = colorPicker('color', c); };
  agSel?.addEventListener('change', autoColor);
  $('#pt-c', l.box).addEventListener('input', (e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 14); e.target.value = d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d; });
  l.box.addEventListener('submit', e => e.preventDefault());
  l.box.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-x="save"]')) return;
    const f = formData($('#ptf', l.box)); if (!f.name.trim()) return toast('Informe o nome.');
    if (dupCheck() && !x && !await confirmBox({ title: 'Nome repetido', body: `Já existe ${lab} chamado “${esc(f.name)}”. Cadastrar mesmo assim?`, ok: 'Cadastrar' })) return;
    const data = { name: f.name.trim(), cnpj: f.cnpj, contact: f.contact, address: f.address, notes: f.notes, color: f.color };
    if (kind === 'agency') {
      const ab = (f.abbr || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (ab && db.all('tempo_agencies').some(a => a.id !== id && (a.abbr || '').toUpperCase() === ab)) return toast(`A sigla ${ab} já é usada por outra agência.`);
      data.abbr = ab || abbrFor(data.name, id);
    }
    if (kind === 'client') data.agency_id = f.agency_id || directAgency()?.id || null;
    let row; if (x) row = db.update(T, x.id, data); else row = db.insert(T, { ...data, archived: false });
    if (row?.id) setPartyFg(kind, row.id, $('#pt-fg', l.box).value || null);
    l.close(); toast(x ? 'Cadastro atualizado' : `${lab[0].toUpperCase() + lab.slice(1)} cadastrad${kind === 'agency' ? 'a' : 'o'}`); cb && cb(row);
  });
}

function openParty(kind, id) {
  const T = kind === 'agency' ? 'tempo_agencies' : 'tempo_clients';
  const l = openLayer({
    kind: 'drawer',
    render: () => {
      const x = db.get(T, id); if (!x) return `<div class="dh"><h2>Removido</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer">${icon('x')}</button></div>`;
      const ps = partyProjects(kind, id); const ms = ps.reduce((s, p) => s + projectMs(p.id), 0);
      const sum = (fn) => ps.reduce((s, p) => s + (fn(p) || 0), 0);
      const ag = kind === 'client' ? db.get('tempo_agencies', x.agency_id) : null;
      return `<div class="dh"><div class="grow"><div class="small muted">${kind === 'agency' ? 'Agência contratante' : 'Cliente' + (ag ? ' · ' + esc(ag.name) : ' direto')}</div>${kind === 'agency'
  ? `<h2 class="party-name">${esc(x.name)}</h2><button type="button" class="party-color row" style="gap:8px" data-act="party-color" data-kind="${kind}" data-id="${id}" title="Mudar cor" aria-label="Mudar cor">${tag(x.name, x.color, { upper: true, fg: partyFg(kind, id) })}<span class="tag tg abbr mono small" style="${cssTb(x.color)}${partyFg(kind, id) ? ';color:' + partyFg(kind, id) : ''}">${esc(agencyAbbr(x))}</span></button>`
  : `<h2 class="row" style="gap:8px;margin-top:2px"><button type="button" class="party-color" data-act="party-color" data-kind="${kind}" data-id="${id}" title="Mudar cor" aria-label="Mudar cor">${clientTag(x)}</button></h2>`}</div><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db">
        <div class="kpis"><div class="kpi"><span class="k">Projetos</span><span class="v">${ps.length}</span></div><div class="kpi"><span class="k">Horas</span><span class="v">${fmtH(ms)}</span><span class="s">bruto ${fmtH(ps.reduce((t, p) => t + db.where('tempo_time_entries', e => e.project_id === p.id).reduce((u, e) => u + entryBrutoMs(e), 0), 0))}</span></div><div class="kpi"><span class="k">Orçado</span><span class="v">${fmtMoney0(sum(p => Number(p.budget)))}</span></div><div class="kpi"><span class="k">Em aberto</span><span class="v">${fmtMoney0(sum(remainingOf))}</span></div></div>
        <div class="props"><span class="k">CNPJ</span><span class="mono">${esc(x.cnpj || '—')}</span><span class="k">Contato</span><span>${esc(x.contact || '—')}</span><span class="k">Endereço</span><span>${esc(x.address || '—')}</span><span class="k">Observações</span><span class="muted">${esc(x.notes || '—')}</span><span class="k">Cadastrado em</span><span>${fmtDate(x.created_at)}</span></div>
        ${kind === 'agency' ? `<div class="stack" style="gap:6px"><div class="row between"><span class="lbl">Clientes</span><button class="btn sm" data-x="new-client">${icon('plus')} Cliente desta agência</button></div><div class="row">${clients(id).map(c => `<button class="btn sm ghost" data-x="open-client" data-id="${c.id}" style="padding:2px">${clientTag(c)}</button>`).join('') || '<span class="small muted">Nenhum cliente vinculado.</span>'}</div></div>` : ''}
        ${feeHTML(kind, id, ps)}
        ${partyChartsHTML(ps)}
        <div class="panel"><div class="panel-h"><h3>Projetos</h3><span class="grow"></span>${kind === 'client' ? `<button class="btn sm" data-act="proj-new" data-client="${id}">${icon('plus')} Projeto</button>` : ''}</div><div class="panel-b tight">${ps.length ? `<div class="list">${ps.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(p => `<div class="li" data-x="open-proj" data-id="${p.id}"><div class="grow"><div class="t">${esc(p.name)}</div><div class="meta">${kind === 'agency' ? esc(clientOf(p)?.name || '') + ' · ' : ''}${fmtH(projectMs(p.id))}${p.deadline ? ' · prazo ' + fmtDate(p.deadline) : ''}</div></div><div class="meta">${statusTag(p.status_id)}${statusTag(p.payment_status_id, false)}<span class="mono">${fmtMoney(p.budget)}</span></div></div>`).join('')}</div>` : '<div class="empty small">Nenhum projeto.</div>'}</div></div>
      </div>
      ${kind === 'agency' && isDirectAgency(x) ? `<div class="df"><span class="small muted grow">Agência interna: clientes sem agência contratante. Não pode ser editada nem excluída.</span></div>` : `<div class="df"><button class="btn danger left" data-x="del">${icon('trash')} Excluir</button><button class="btn" data-x="arch">${x.archived ? 'Desarquivar' : 'Arquivar'}</button><button class="btn primary" data-x="edit">${icon('edit')} Editar</button></div>`}`;
    }
  });
  l.live = true;
  l.box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return; const x = db.get(T, id);
    if (b.dataset.x === 'edit') openPartyForm(kind, id);
    if (b.dataset.x === 'open-proj') openProject(b.dataset.id);
    if (b.dataset.x === 'open-client') openParty('client', b.dataset.id);
    if (b.dataset.x === 'new-client') openPartyForm('client', null, null, { agency_id: id });
    if (b.dataset.x === 'arch') { db.update(T, id, { archived: !x.archived }); toast(x.archived ? 'Arquivado' : 'Desarquivado'); }
    if (b.dataset.x === 'del') {
      const ps = partyProjects(kind, id).length + db.all('tempo_projects').filter(p => p.archived && (kind === 'agency' ? agencyOf(p)?.id === id : p.client_id === id)).length;
      const cs = kind === 'agency' ? db.all('tempo_clients').filter(c => c.agency_id === id).length : 0;
      if (ps || (kind === 'client' && db.all('tempo_quotes').some(q => q.client_id === id))) return confirmBox({ title: 'Não dá para excluir', body: `Há projetos ou propostas vinculados. Use <b>Arquivar</b> para tirar das listas sem perder o histórico.`, ok: 'Entendi' });
      if (!await confirmBox({ title: `Excluir ${x.name}?`, body: cs ? `${cs} cliente(s) desta agência passarão para a agência Cliente Direto.` : 'Esta ação não pode ser desfeita.', ok: 'Excluir', danger: true })) return;
      if (kind === 'agency') db.all('tempo_clients').filter(c => c.agency_id === id).forEach(c => db.update('tempo_clients', c.id, { agency_id: directAgency()?.id || null }, true));
      l.close(); db.remove(T, id); toast('Excluído');
    }
  });
}

/* Fee mensal: agência ou cliente com pagamento mensal fixo. Projetos com "Fee" não têm valor próprio.
   Os valores e limites ficam por agência/cliente e por mês. */
const feeFlags = () => db.setting('feeParties', {}) || {};
function feeEligible(clientId) {
  const c = db.get('tempo_clients', clientId); const f = feeFlags();
  return !!(f[`client:${clientId}`] || (c && f[`agency:${c.agency_id}`]));
}
function feeHTML(kind, id, ps) {
  const ym = S.feeYm || ymd(new Date()).slice(0, 7);
  const k = `${kind}:${id}`; const map = db.setting('feeByMonth', {}) || {};
  const val = map[`${k}|${ym}`]; const lim = map[`${k}|${ym}|h`];
  const flag = !!feeFlags()[k];
  const fps = ps.filter(p => statusName(p.payment_status_id) === 'Fee');
  const ids = fps.map(p => p.id);
  const usedMs = db.where('tempo_time_entries', e => ids.includes(e.project_id) && ymd(entryStart(e) || 0).slice(0, 7) === ym).reduce((t, e) => t + entryMs(e), 0);
  const usedH = usedMs / 3600000; const pct = lim ? Math.min(100, usedH / lim * 100) : 0;
  const warn = lim && usedH >= lim * .8;
  return `<div class="panel"><div class="panel-h"><h3>Fee mensal</h3><span class="grow"></span><label class="check small"><input type="checkbox" data-on="fee-flag" data-k="${k}" ${flag ? 'checked' : ''}> Tem fee mensal</label></div>${flag ? `<div class="panel-b stack small">
    <div class="row gap-s" style="flex-wrap:wrap"><input type="month" class="input" value="${ym}" data-on="fee-month" aria-label="Mês do fee" style="max-width:170px"><input class="input" inputmode="decimal" placeholder="Valor mensal" value="${val ? String(val).replace('.', ',') : ''}" data-on="fee-amount" data-k="${k}" data-ym="${ym}" aria-label="Valor mensal do fee" style="max-width:180px"><input class="input" inputmode="decimal" placeholder="Limite de horas" value="${lim ? String(lim).replace('.', ',') : ''}" data-on="fee-hours" data-k="${k}" data-ym="${ym}" aria-label="Limite de horas do mês" style="max-width:170px"></div>
    <div class="muted">${fps.length ? 'Projetos no fee: ' + fps.map(p => esc(p.name)).join(' · ') : 'Nenhum projeto com pagamento Fee.'}</div>
    <div>Pagamento do mês: <b>${val ? fmtMoney(val) : 'não definido'}</b></div>
    <div class="row between"><span>Horas usadas no mês: <b class="${warn ? 'late' : ''}">${fmtH(usedMs)}</b>${lim ? ` de ${String(lim).replace('.', ',')} h` : ''}</span>${warn ? '<span class="late">Perto do limite</span>' : ''}</div>
    ${lim ? `<div class="bar-track"><div class="bar-fill fill" style="--tb:${warn ? '#d64545' : '#2563eb'};width:${pct.toFixed(1)}%"></div></div>` : ''}</div>` : '<div class="panel-b muted small">Marque “Tem fee mensal” para cadastrar o valor e o limite de horas.</div>'}</div>`;
}
CHANGES['fee-flag'] = (el) => { const m = { ...feeFlags() }; if (el.checked) m[el.dataset.k] = true; else delete m[el.dataset.k]; db.setSetting('feeParties', m); db.emit(); };
CHANGES['fee-month'] = (el) => { S.feeYm = el.value; render(); };
CHANGES['fee-amount'] = (el) => {
  const m = { ...(db.setting('feeByMonth', {}) || {}) }; const kk = `${el.dataset.k}|${el.dataset.ym}`;
  const v = Number(String(el.value).replace(/\./g, '').replace(',', '.'));
  if (v > 0) m[kk] = v; else delete m[kk];
  db.setSetting('feeByMonth', m); db.emit();
};
CHANGES['fee-hours'] = (el) => {
  const m = { ...(db.setting('feeByMonth', {}) || {}) }; const kk = `${el.dataset.k}|${el.dataset.ym}|h`;
  const v = Number(String(el.value).replace(',', '.'));
  if (v > 0) m[kk] = v; else delete m[kk];
  db.setSetting('feeByMonth', m); db.emit();
};
