/* =====================================================================
   PREFERÊNCIAS
   ===================================================================== */
const PREF_TABS = [['appearance', 'Aparência', 'gear'], ['types', 'Tipos de trabalho', 'tag'], ['extypes', 'Tipos de despesa', 'layers'], ['programs', 'Programas', 'tag'], ['status', 'Status', 'spin'], ['reminders', 'Lembretes', 'bell'], ['timesheet', 'Time Sheet', 'clock'], ['periods', 'Férias e viagens', 'cal'], ['data', 'Dados e backup', 'db'], ['integrations', 'Integrações', 'layers']];
VIEWS.prefs = () => {
  const body = { appearance: prefAppearance, types: prefTypes, extypes: prefExTypes, programs: programasPanel, status: prefStatus, reminders: prefReminders, timesheet: prefTimesheet, periods: prefPeriods, data: prefData, integrations: prefIntegrations }[S.pref]();
  return { title: 'Configurações', html: `<div class="row" style="justify-content:flex-end;margin-bottom:8px"><button class="btn sm" data-act="go" data-route="import">Importar do Notion</button></div><div class="pref-layout"><nav class="pref-nav">${PREF_TABS.map(([k, l, i]) => `<button class="nav-btn ${S.pref === k ? 'active' : ''}" data-act="pref-tab" data-v="${k}">${icon(i)}<span>${l}</span></button>`).join('')}</nav><div class="stack" style="min-width:0">${body}${logRetentionPanel()}</div></div>` };
};
ACTIONS['pref-tab'] = (el) => { S.pref = el.dataset.v; render(); };
/* Férias (não geram aviso) e viagens (compras no período viram Viagem no extrato). Feriados ficam listados. */
function prefPeriods() {
  const lista = (key, titulo, dica) => { const arr = db.setting(key, []) || [];
    return `<div class="panel"><div class="panel-h"><h3>${titulo}</h3><span class="small muted">${dica}</span></div><div class="panel-b stack">
      ${arr.length ? arr.map((p, i) => `<div class="row between small"><span>${fmtDate(p.inicio)} a ${fmtDate(p.fim)}${p.nome ? ' · ' + esc(p.nome) : ''}</span><button class="icon-btn ghost" data-act="per-del" data-k="${key}" data-i="${i}" title="Remover">×</button></div>`).join('') : '<span class="faint small">Nenhum período.</span>'}
      <div class="row" style="flex-wrap:wrap;gap:8px"><input id="per-${key}-i" type="date" class="input sm" aria-label="Início"><input id="per-${key}-f" type="date" class="input sm" aria-label="Fim"><input id="per-${key}-n" class="input sm" placeholder="Nome (opcional)" style="max-width:200px"><button class="btn sm" data-act="per-add" data-k="${key}">Adicionar</button></div></div></div>`; };
  const hoje = ymd(new Date()), ano = new Date().getFullYear();
  const prox = [...feriadosDoAno(ano), ...feriadosDoAno(ano + 1)].filter(f => f.data >= hoje).slice(0, 12);
  return lista('ferias', 'Férias e folgas', 'não geram aviso de prazo, cobrança, orçamento nem conta') +
    lista('viagens', 'Viagens', 'compras e gastos no período viram Viagem no extrato') +
    `<div class="panel"><div class="panel-h"><h3>Próximos feriados</h3><span class="small muted">nacionais, de Pernambuco e de Recife</span></div><div class="panel-b small stack">${prox.map(f => `<div class="row between"><span>${fmtDate(f.data)} · ${esc(f.nome)}</span><span class="faint">${f.tipo}</span></div>`).join('')}</div></div>`;
}
ACTIONS['per-add'] = (el) => {
  const k = el.dataset.k; const i = document.getElementById(`per-${k}-i`)?.value, f = document.getElementById(`per-${k}-f`)?.value, n = (document.getElementById(`per-${k}-n`)?.value || '').trim();
  if (!i || !f || f < i) return toast('Informe início e fim (o fim depois do início).');
  db.setSetting(k, [...(db.setting(k, []) || []), { inicio: i, fim: f, nome: n }].sort((a, b) => a.inicio.localeCompare(b.inicio)));
  toast('Período salvo'); render();
};
ACTIONS['per-del'] = (el) => { const k = el.dataset.k, arr = (db.setting(k, []) || []).slice(); arr.splice(Number(el.dataset.i), 1); db.setSetting(k, arr); render(); };

function prefAppearance() {
  const th = db.setting('theme', 'system'), ac = db.setting('accent', 'cobalto'), fo = db.setting('font', 'sonoma'), fs = db.setting('fontSize', 14), rd = db.setting('radius', DEFAULT_RADIUS), rp = db.setting('rowPad', 3), rf = db.setting('rowPadFin', 0);
  return `<div class="panel"><div class="panel-h"><h3>Tema</h3></div><div class="panel-b stack">
    <div class="seg">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button class="${th === k ? 'on' : ''}" data-act="set" data-k="theme" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="field"><span class="lbl">Cor de destaque</span><div class="row">${Object.entries(ACCENTS).map(([k, [c]]) => `<button class="swatch ${ac === k ? 'on' : ''}" style="background:${c};width:30px;height:30px" data-act="set" data-k="accent" data-v="${k}" title="${k}" aria-label="${k}"></button>`).join('')}</div></div>
  </div></div>
  <div class="panel"><div class="panel-h"><h3>Texto</h3></div><div class="panel-b stack">
    <div class="field"><label for="pf-font">Fonte</label><select id="pf-font" class="input" style="max-width:360px" data-on="set" data-k="font">${Object.entries(FONTS).map(([k, [l]]) => `<option value="${k}" ${fo === k ? 'selected' : ''}>${l}</option>`).join('')}${Object.entries(customFontsOf()).map(([k, f]) => `<option value="${k}" ${fo === k ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select>
      <span class="hint">A BR Sonoma é uma fonte paga da Brink e não está no Google Fonts. Ela aparece se estiver instalada no aparelho; senão, o app usa a Manrope, que tem desenho parecido. Na versão publicada dá para incluir a BR Sonoma se você tiver a licença web.</span></div>
    <div class="field"><label for="pf-fs">Tamanho do texto: <span class="mono">${fs}px</span></label><input id="pf-fs" type="range" min="12" max="18" step="1" value="${fs}" data-on="set" data-k="fontSize" style="max-width:360px;accent-color:var(--accent)"></div>
    <div class="field"><label for="pf-rp">Altura das linhas: clientes, trabalhos e geral <span class="mono">${rp}px</span></label><input id="pf-rp" type="range" min="0" max="12" step="1" value="${rp}" data-on="set" data-k="rowPad" style="max-width:360px;accent-color:var(--accent)"><span class="hint">3 = padrão.</span><div class="field"><span class="lbl">Prévia</span><div style="max-width:420px;border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden"><table class="grid" style="width:100%"><thead><tr><th>Cliente</th><th>Trabalho</th><th>Status</th></tr></thead><tbody><tr><td>LEAN</td><td>KV Magrão</td><td>Em andamento</td></tr><tr><td>BAQUESOLTO</td><td>FILME</td><td>Concluído</td></tr></tbody></table></div></div></div><div class="field"><label for="pf-rf">Altura das linhas: financeiro <span class="mono">${rf}px</span></label><input id="pf-rf" type="range" min="0" max="12" step="1" value="${rf}" data-on="set" data-k="rowPadFin" style="max-width:360px;accent-color:var(--accent)"><span class="hint">0 = bem fina, para ver mais lançamentos na tela.</span><div class="field"><span class="lbl">Prévia</span><div style="max-width:420px;border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden"><table class="grid fin" style="width:100%"><thead><tr><th>Data</th><th>Projeto</th><th>Valor</th></tr></thead><tbody><tr><td>13/10</td><td>KV Magrão</td><td>R$ 19.700,00</td></tr><tr><td>15/10</td><td>Enxoval de Motion</td><td>R$ 8.000,00</td></tr></tbody></table></div></div></div>
    <div class="field"><span class="lbl">Prévia</span><div style="max-width:420px;border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden"><table class="grid" style="width:100%"><thead><tr><th>Nome</th><th>Data</th><th>Valor</th></tr></thead><tbody><tr><td>Aloma</td><td class="mono small">13/10</td><td class="num">R$ 1.960,00</td></tr><tr><td>Homero</td><td class="mono small">13/10</td><td class="num">R$ 1.250,00</td></tr><tr><td>Raquel</td><td class="mono small">13/10</td><td class="num">R$ 1.500,00</td></tr></tbody></table></div></div>
  </div></div>
  ${themePanelHTML()}
  <div class="panel"><div class="panel-h"><h3>Cards</h3></div><div class="panel-b stack">
    <div class="field"><label for="pf-rd">Raio das bordas (px)</label><div class="row"><input id="pf-rd" type="number" min="0" max="28" step="1" class="input" style="width:100px" value="${rd}" data-on="set" data-k="radius"><button class="btn sm" data-act="set" data-k="radius" data-v="${DEFAULT_RADIUS}">Restaurar padrão (${DEFAULT_RADIUS}px)</button></div></div>
    <div class="row"><div class="kpi" style="width:200px"><span class="k">Exemplo</span><span class="v">12,5 h</span><span class="s">prévia do card</span></div></div>
  </div></div>`;
}
ACTIONS.set = (el) => { let v = el.dataset.v; if (['radius', 'fontSize', 'rowPad', 'rowPadFin'].includes(el.dataset.k)) v = Number(v); db.setSetting(el.dataset.k, v); };
CHANGES.set = (el) => { let v = el.value; if (['radius', 'fontSize', 'rowPad', 'rowPadFin', 'idleMinutes'].includes(el.dataset.k)) v = Math.max(0, Number(v) || 0); db.setSetting(el.dataset.k, v); };

function optionRows(list, kind) {
  return list.map((o, i) => `<div class="opt-row${kind === 'wt' ? ' wt' : ''}">
    <button class="swatch fill" style="${cssTb(o.color)};flex:none" data-act="opt-color" data-t="${kind === 'wt' ? 'tempo_work_types' : 'tempo_status_options'}" data-id="${o.id}" title="Mudar cor" aria-label="Mudar cor"></button>
    <span style="white-space:nowrap;overflow:hidden">${tag(o.name, o.color, { pill: kind !== 'wt' })}</span>
    <input class="input sm" value="${esc(o.name)}" data-on="opt" data-t="${kind === 'wt' ? 'tempo_work_types' : 'tempo_status_options'}" data-id="${o.id}" data-k="name" aria-label="Nome">
    ${kind !== 'wt' ? `<select class="input sm" data-on="opt" data-t="tempo_status_options" data-id="${o.id}" data-k="category" aria-label="Significado">${({ work: [['todo', 'A fazer'], ['active', 'Em andamento'], ['done', 'Concluído'], ['cancelled', 'Cancelado']], payment: [['open', 'Em aberto'], ['closed', 'Quitado']], quote: [['open', 'Em aberto'], ['won', 'Aprovado'], ['lost', 'Perdido']] })[kind].map(([v, l]) => `<option value="${v}" ${o.category === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
    <button class="btn sm icon ghost" data-act="opt-move" data-kind="${kind}" data-id="${o.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icon('chevU')}</button>
    <button class="btn sm icon ghost" data-act="opt-move" data-kind="${kind}" data-id="${o.id}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Descer">${icon('chevD')}</button>
    ${kind === 'wt' ? `<button class="btn sm ghost" data-act="wt-arch" data-id="${o.id}">${o.archived ? 'Reativar' : 'Arquivar'}</button>` : `<button class="btn sm icon ghost" data-act="opt-del" data-id="${o.id}" aria-label="Excluir">${icon('trash')}</button>`}
  </div>`).join('');
}
function wtRows(list) {
  return list.map((o, i) => `<div class="opt-row wt">
    <button class="swatch fill" style="${cssTb(o.color)};flex:none" data-act="opt-color" data-t="tempo_work_types" data-id="${o.id}" title="Mudar cor" aria-label="Mudar cor"></button>
    <span style="white-space:nowrap;overflow:hidden">${tag(o.name, o.color, { pill: false })}</span>
    <input class="input sm" value="${esc(o.name)}" data-on="opt" data-t="tempo_work_types" data-id="${o.id}" data-k="name" aria-label="Nome">
    <button class="btn sm icon ghost" data-act="opt-move" data-kind="wt" data-id="${o.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icon('chevU')}</button>
    <button class="btn sm icon ghost" data-act="opt-move" data-kind="wt" data-id="${o.id}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Descer">${icon('chevD')}</button>
    <button class="btn sm" data-act="wt-merge" data-id="${o.id}">Mesclar</button>
    <button class="btn sm" data-act="wt-arch" data-id="${o.id}">Arquivar</button>
  </div>`).join('');
}
function prefTypes() {
  const arch = db.all('tempo_work_types').filter(w => w.archived).sort((a, b) => a.order - b.order);
  const archPanel = arch.length ? `<div class="panel"><div class="panel-h"><h3>Arquivados</h3><span class="small muted">somem das listas; os registros antigos continuam com eles</span></div><div class="panel-b">${arch.map(o => `<div class="opt-row arch">
    <button class="swatch fill" style="${cssTb(o.color)};flex:none" data-act="opt-color" data-t="tempo_work_types" data-id="${o.id}" title="Mudar cor" aria-label="Mudar cor"></button>
    <span style="white-space:nowrap;overflow:hidden">${tag(o.name, o.color, { pill: false })}</span><span></span>
    <button class="btn sm" data-act="wt-merge" data-id="${o.id}">Mesclar</button>
    <button class="btn sm danger" data-act="wt-delete" data-id="${o.id}">Apagar</button>
    <button class="btn sm" data-act="wt-arch" data-id="${o.id}">Desarquivar</button>
  </div>`).join('')}</div></div>` : '';
  return `<div class="panel"><div class="panel-h"><h3>Tipos de trabalho</h3><span class="small muted">usados nas sessões, tarefas e relatórios</span></div><div class="panel-b">${wtRows(workTypes())}
    <form class="row" style="margin:12px 0 0 244px" data-form="add-opt" data-kind="wt"><input class="input" style="max-width:300px" name="name" placeholder="Novo tipo de trabalho" aria-label="Novo tipo"><button class="btn primary">${icon('plus')} Adicionar</button></form></div></div>` + archPanel;
}
function prefStatus() {
  const block = (kind, title, hint) => `<div class="panel"><div class="panel-h"><h3>${title}</h3><span class="small muted">${hint}</span></div><div class="panel-b">${optionRows(statuses(kind), kind)}
    <form class="row" style="margin:12px 0 0 244px" data-form="add-opt" data-kind="${kind}"><input class="input" style="max-width:300px" name="name" placeholder="Novo status" aria-label="Novo status"><button class="btn primary">${icon('plus')} Adicionar</button></form></div></div>`;
  return block('work', 'Status do trabalho', 'projetos, tarefas e subtarefas') + block('payment', 'Status de pagamento', 'independente do status do trabalho') + block('quote', 'Status de orçamento', 'propostas enviadas') +
    `<div class="small muted">O “significado” diz ao app como tratar cada status: quais contam como ativos, concluídos ou em aberto nos filtros e relatórios.</div>`;
}
ACTIONS['opt-color'] = (el) => { const t = el.dataset.t, id = el.dataset.id; openColorPop(el, db.get(t, id).color, (c) => db.update(t, id, { color: c })); };
CHANGES.opt = (el) => { if (el.dataset.k === 'name' && !el.value.trim()) return render(); db.update(el.dataset.t, el.dataset.id, { [el.dataset.k]: el.dataset.k === 'name' ? el.value.trim() : el.value }); };
ACTIONS['opt-move'] = (el) => {
  const list = el.dataset.kind === 'wt' ? workTypes() : statuses(el.dataset.kind); const T = el.dataset.kind === 'wt' ? 'tempo_work_types' : 'tempo_status_options';
  const i = list.findIndex(o => o.id === el.dataset.id); const j = i + Number(el.dataset.d); if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]]; list.forEach((o, k) => db.update(T, o.id, { order: k }, true)); db.emit();
};
ACTIONS['wt-arch'] = (el) => { const w = db.get('tempo_work_types', el.dataset.id); db.update('tempo_work_types', w.id, { archived: !w.archived }); };
// Escolhe o tipo que recebe os registros de outro (existente ou novo). Retorna o id do destino ou null.
function wtDialog({ title, intro, src, okLabel, allowNew, danger }) {
  return new Promise(res => {
    let done = false;
    const others = db.all('tempo_work_types').filter(w => w.id !== src.id).sort((a, b) => (a.archived - b.archived) || a.order - b.order);
    const opts = others.map(w => `<option value="${w.id}">${esc(w.name)}${w.archived ? ' (arquivado)' : ''}</option>`).join('');
    const newOpt = allowNew ? '<option value="__new">+ Criar nova…</option>' : '';
    const l = openLayer({
      html: `<div class="dh"><h2>${esc(title)}</h2></div><div class="db"><p style="margin:0">${intro}</p>
        <div class="field"><label for="wtd-to">Registros de “${esc(src.name)}” vão para</label><select id="wtd-to" class="input">${opts}${newOpt}</select></div>
        <div class="field" id="wtd-newbox" style="${others.length ? 'display:none' : ''}"><label for="wtd-new">Nome do novo tipo</label><input id="wtd-new" class="input" placeholder="Ex.: Ilustração 3D"></div></div>
        <div class="df"><button class="btn" data-x="no">Cancelar</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-x="yes">${esc(okLabel)}</button></div>`,
      onClose: () => { if (!done) res(null); }
    });
    const sel = $('#wtd-to', l.box);
    if (!others.length && sel.options.length) sel.value = '__new';
    l.box.addEventListener('change', (e) => { if (e.target.id === 'wtd-to') $('#wtd-newbox', l.box).style.display = e.target.value === '__new' ? '' : 'none'; });
    l.box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'no') { done = true; res(null); return l.close(); }
      let target = sel.value;
      if (target === '__new') {
        const name = $('#wtd-new', l.box).value.trim();
        if (!name) return toast('Dê um nome ao novo tipo.');
        const n = workTypes(true).length;
        target = db.insert('tempo_work_types', { name, color: presetAt(n), order: n, archived: false }, true).id;
      }
      done = true; res(target); l.close();
    });
  });
}
// Move os registros de um tipo para outro e remove o de origem.
function wtMerge(srcId, targetId) {
  ['tempo_quotes', 'tempo_tasks', 'tempo_time_entries'].forEach(t => db.all(t).filter(r => r.work_type_id === srcId).forEach(r => db.update(t, r.id, { work_type_id: targetId }, true)));
  db.emit();
  db.remove('tempo_work_types', srcId);
}
ACTIONS['wt-merge'] = async (el) => {
  const src = db.get('tempo_work_types', el.dataset.id);
  if (db.all('tempo_work_types').length < 2) return toast('Não há outro tipo para mesclar.');
  const target = await wtDialog({ title: 'Mesclar tipo', src, okLabel: 'Mesclar', intro: `Junta “${esc(src.name)}” com outro tipo existente. Os registros passam para ele e “${esc(src.name)}” some da lista.` });
  if (target) wtMerge(src.id, target);
};
ACTIONS['wt-delete'] = async (el) => {
  const src = db.get('tempo_work_types', el.dataset.id);
  if (!await confirmBox({ title: 'Você tem certeza?', body: `Apagar “${esc(src.name)}” é permanente e não tem como desfazer.`, ok: 'Continuar', danger: true })) return;
  const target = await wtDialog({ title: 'Apagar tipo', src, okLabel: 'Apagar definitivamente', danger: true, allowNew: true, intro: `Antes de apagar, escolha para onde vão os registros de “${esc(src.name)}”: outro tipo existente ou um novo.` });
  if (target) wtMerge(src.id, target);
};
ACTIONS['opt-del'] = async (el) => {
  const o = db.get('tempo_status_options', el.dataset.id);
  const used = db.all('tempo_projects').some(p => p.status_id === o.id || p.payment_status_id === o.id) || db.all('tempo_tasks').some(t => t.status_id === o.id) || db.all('tempo_quotes').some(q => q.status_id === o.id);
  if (used) return confirmBox({ title: 'Status em uso', body: `“${esc(o.name)}” está aplicado a registros. Mude esses registros para outro status antes de excluir, ou só renomeie.`, ok: 'Entendi' });
  if (statuses(o.kind).length <= 1) return toast('Mantenha pelo menos um status.');
  if (!await confirmBox({ title: 'Excluir status?', body: esc(o.name), ok: 'Excluir', danger: true })) return;
  db.remove('tempo_status_options', o.id);
};
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form="add-opt"]'); if (!f) return; e.preventDefault();
  const name = f.querySelector('input').value.trim(); if (!name) return; const kind = f.dataset.kind;
  if (kind === 'wt') db.insert('tempo_work_types', { name, color: presetAt(workTypes(true).length), order: workTypes(true).length, archived: false });
  else db.insert('tempo_status_options', { kind, name, color: 'gray', category: { work: 'active', payment: 'open', quote: 'open' }[kind], order: statuses(kind).length });
  toast('Adicionado');
});

function prefReminders() {
  const rs = db.all('tempo_reminders'); const pending = rs.filter(r => !r.done); const done = rs.filter(r => r.done);
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const card = (r) => `<div class="rem-card ${r.active ? '' : 'off'}">
    <div class="row"><label class="switch" title="Ativar ou desativar"><input type="checkbox" ${r.active ? 'checked' : ''} data-on="rem" data-id="${r.id}" data-k="active" aria-label="Ativo"><span></span></label>
      <input class="input" style="flex:1;min-width:160px;font-weight:600" id="rem-name-${r.id}" value="${esc(r.name)}" data-on="rem" data-id="${r.id}" data-k="name" aria-label="Nome do lembrete">
      <button class="btn sm" data-act="rem-rename" data-id="${r.id}">${icon('edit')} Renomear</button>
      <button class="btn sm" data-act="rem-test" data-id="${r.id}">Testar</button>
      <button class="btn sm icon ghost" data-act="rem-del" data-id="${r.id}" aria-label="Excluir">${icon('trash')}</button></div>
    <div class="grid3">
      <div class="field"><label for="rk-${r.id}">Tipo</label><select id="rk-${r.id}" class="input" data-on="rem" data-id="${r.id}" data-k="kind">${Object.entries(REMINDER_KINDS).map(([k, l]) => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="rd-${r.id}">Quando lembrar</label><select id="rd-${r.id}" class="input" data-on="rem" data-id="${r.id}" data-k="days">${[['all', 'Todos os dias'], ['weekdays', 'Dias úteis'], ['weekends', 'Finais de semana'], ['custom', 'Dias da semana…'], ['date', 'Data específica']].map(([k, l]) => `<option value="${k}" ${r.days === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="rf-${r.id}">Frequência</label><select id="rf-${r.id}" class="input" data-on="rem" data-id="${r.id}" data-k="freq">${[['fixed', 'Horário definido'], ['interval', 'De X em X horas'], ['once', 'Uma vez']].map(([k, l]) => `<option value="${k}" ${r.freq === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      ${r.days === 'custom' ? `<div class="days">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" ${(r.customDays || []).map(Number).includes(d) ? 'checked' : ''} data-on="rem-day" data-id="${r.id}" data-d="${d}"><span>${WEEKDAYS[d]}</span></label>`).join('')}</div>` : ''}
      ${r.days === 'date' || r.freq === 'once' ? `<input type="date" class="input" style="width:auto" value="${r.date || ''}" data-on="rem" data-id="${r.id}" data-k="date" aria-label="Data">` : ''}
      ${r.freq === 'interval' ? `<span class="row small">a cada <input type="number" min="0.25" step="0.25" class="input sm" style="width:70px" value="${r.intervalHours}" data-on="rem" data-id="${r.id}" data-k="intervalHours" aria-label="Horas"> hora(s)</span>` : `<input type="time" class="input" style="width:auto" value="${r.time}" data-on="rem" data-id="${r.id}" data-k="time" aria-label="Horário">`}
      <label class="check small"><input type="checkbox" ${r.nightWeekendOnly ? 'checked' : ''} data-on="rem" data-id="${r.id}" data-k="nightWeekendOnly"> Só à noite (22h–8h) e fins de semana</label>
    </div>
    <div class="small muted">${remSummary(r)}</div>
  </div>`;
  return `<div class="banner info small">${icon('bell')}<span class="grow">Os lembretes aparecem dentro do app enquanto ele estiver aberto. ${perm === 'granted' ? 'Notificações do sistema permitidas.' : perm === 'denied' ? 'Notificações do sistema bloqueadas neste navegador.' : 'Notificações do sistema (fora do app) dependem do navegador e, no iPhone, do app instalado na Tela de Início — vão funcionar na versão publicada na Vercel.'}</span>${perm === 'default' ? `<button class="btn sm" data-act="rem-perm">Permitir notificações</button>` : ''}</div>
  <div class="row between"><span class="lbl">Lembretes de tempo</span><button class="btn primary sm" data-act="rem-new">${icon('plus')} Novo lembrete</button></div>
  ${pending.map(card).join('') || '<div class="empty small">Nenhum lembrete.</div>'}
  ${done.length ? `<div class="lbl">Concluídos (lembretes únicos já disparados)</div>${done.map(r => `<div class="row subtle-box small"><span class="grow">${esc(r.name)} · ${fmtDateTime(r.lastFired)}</span><button class="btn sm" data-act="rem-reopen" data-id="${r.id}">Reativar</button><button class="btn sm icon ghost" data-act="rem-del" data-id="${r.id}" aria-label="Excluir">${icon('trash')}</button></div>`).join('')}` : ''}`;
}
function remSummary(r) {
  const days = { all: 'todos os dias', weekdays: 'em dias úteis', weekends: 'nos finais de semana', custom: 'em ' + ((r.customDays || []).map(d => WEEKDAYS[d]).join(', ') || 'nenhum dia'), date: 'em ' + (r.date ? fmtDate(r.date) : 'data a definir') }[r.days];
  const when = r.freq === 'interval' ? `a cada ${String(r.intervalHours).replace('.', ',')} h` : r.freq === 'once' ? `uma vez às ${r.time}` : `às ${r.time}`;
  const ctx = { start: 'só quando não houver sessão ativa', stop: 'só quando houver sessão ativa', review_session: 'quando a sessão passar desse tempo', review_day: '', context: 'pede para iniciar ou encerrar conforme haja sessão ativa', custom: '' }[r.kind];
  return `Avisa ${days}, ${when}${r.nightWeekendOnly ? ', apenas à noite e fins de semana' : ''}${ctx ? ' — ' + ctx : ''}.`;
}
CHANGES.rem = (el) => { const k = el.dataset.k; let v = el.type === 'checkbox' ? el.checked : el.value; if (k === 'intervalHours') v = Math.max(.25, Number(v) || 1); if (k === 'name' && !v.trim()) return render(); db.update('tempo_reminders', el.dataset.id, { [k]: v, done: false }); };
CHANGES['rem-day'] = (el) => { const r = db.get('tempo_reminders', el.dataset.id); const d = Number(el.dataset.d); const s = new Set((r.customDays || []).map(Number)); el.checked ? s.add(d) : s.delete(d); db.update('tempo_reminders', r.id, { customDays: [...s] }); };
ACTIONS['rem-rename'] = (el) => { const i = $('#rem-name-' + el.dataset.id); i.focus(); i.select(); };
ACTIONS['rem-test'] = (el) => fireReminder(db.get('tempo_reminders', el.dataset.id));
ACTIONS['rem-del'] = async (el) => { const r = db.get('tempo_reminders', el.dataset.id); if (await confirmBox({ title: 'Excluir lembrete?', body: esc(r.name), ok: 'Excluir', danger: true })) db.remove('tempo_reminders', r.id); };
ACTIONS['rem-reopen'] = (el) => db.update('tempo_reminders', el.dataset.id, { done: false, active: true });
ACTIONS['rem-new'] = () => db.insert('tempo_reminders', { name: 'Novo lembrete', kind: 'custom', active: true, days: 'weekdays', customDays: [1, 2, 3, 4, 5], freq: 'fixed', time: '09:00', intervalHours: 1, nightWeekendOnly: false, done: false, lastFired: null, message: '' });
ACTIONS['rem-perm'] = async () => { try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notificações permitidas' : 'Este ambiente não permitiu notificações. Na versão publicada isso funciona.'); } catch (e) { toast('Este ambiente não permite notificações do sistema.'); } render(); };

function prefTimesheet() {
  return `<div class="panel"><div class="panel-h"><h3>Detecção de inatividade</h3></div><div class="panel-b stack">
    <div class="field"><label for="pf-idle">Sugerir pausa quando ficar parado por mais de (minutos)</label><input id="pf-idle" type="number" min="1" step="1" class="input" style="width:120px" value="${db.setting('idleMinutes', 5)}" data-on="set" data-k="idleMinutes"><span class="hint">Cada intervalo vira uma sugestão no Time Sheet com Aceitar / Encerrar / Ignorar. Nada é alterado sem você confirmar.</span></div>
    <div class="stack small" style="gap:6px"><b>De onde vem a detecção</b>
      <div class="row"><span class="dot live"></span>Computador suspenso ou app fechado — sempre ativo.</div>
      <div class="row"><span class="dot ${idleDetector ? 'live' : ''}"></span>Mouse e teclado parados (Chrome/Edge no Mac) — ${idleDetector ? 'ativo' : `<button class="btn sm" data-act="idle-on">Ativar</button>`}</div>
      <div class="row"><span class="dot"></span>App em uso (ex.: WhatsApp) e ociosidade em qualquer navegador — virá com o app de Mac.</div>
    </div>
  </div></div>
  <div class="panel"><div class="panel-h"><h3>Regras do cronômetro</h3></div><div class="panel-b stack small">
    <div>• Só pode haver uma sessão ativa ou pausada por vez.</div><div>• A duração é calculada pelos horários de início e fim de cada intervalo, não por um contador.</div><div>• Tempo pausado não entra no total.</div><div>• Toda correção guarda os horários anteriores e o motivo.</div>
  </div></div>`;
}

ACTIONS['idle-on'] = async () => { if (await startIdleDetection(true)) { toast('Detecção de ociosidade ativada'); render(); } };
function prefData() {
  return `<div class="panel"><div class="panel-h"><h3>Onde os dados ficam</h3></div><div class="panel-b stack">
    <div class="row"><span class="dot mem"></span><b>${db.adapter.label}</b><span class="muted small">— ${db.adapter.persistent ? 'salvo no banco online' : 'nada é salvo; recarregar a página apaga tudo'}</span></div>
    <div class="small muted">O app já usa uma camada de dados separada com as tabelas do banco (tempo_agencies, tempo_clients, tempo_projects, tempo_tasks, tempo_time_entries…). Para ligar o banco na Vercel basta trocar o adaptador de memória pelo adaptador online; as telas não mudam.</div>
    <div class="row small">${TABLES.filter(t => t !== 'tempo_settings').map(t => `<span class="tag c-gray mono">${t.replace('tempo_', '')}: ${db.all(t).length}</span>`).join('')}</div>
  </div></div>
  <div class="panel"><div class="panel-h"><h3>Backup</h3></div><div class="panel-b stack">
    <div class="row"><button class="btn" data-act="bk-export">${icon('copy')} Copiar backup (JSON)</button><button class="btn" data-act="bk-import">${icon('upload')} Restaurar backup</button></div>
    <span class="small muted">Enquanto não houver banco, use o backup para levar os dados de uma sessão para outra.</span>
  </div></div>
  <div class="panel"><div class="panel-h"><h3>Dados de exemplo</h3></div><div class="panel-b row">
    <button class="btn" data-act="demo-load">Carregar dados fictícios</button><button class="btn danger" data-act="demo-clear">Começar vazio</button>
  </div></div>`;
}
ACTIONS['bk-export'] = async () => {
  const json = JSON.stringify({ app: 'tempo', version: 1, exported_at: nowISO(), data: db.snapshot() });
  try { await navigator.clipboard.writeText(json); toast('Backup copiado. Cole num arquivo de texto e salve como .json.'); }
  catch (e) { const l = openLayer({ wide: true, html: `<div class="dh"><h2>Backup</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer">${icon('x')}</button></div><div class="db"><textarea class="input mono" style="min-height:320px;font-size:.75em">${esc(json)}</textarea></div>` }); $('textarea', l.box).select(); }
};
ACTIONS['bk-import'] = () => {
  const l = openLayer({ wide: true, html: `<div class="dh"><h2>Restaurar backup</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer">${icon('x')}</button></div><div class="db"><div class="field"><label for="bk-file">Arquivo .json</label><input id="bk-file" type="file" accept=".json,application/json" class="input"></div><div class="field"><label for="bk-txt">Ou cole o conteúdo</label><textarea id="bk-txt" class="input mono" style="min-height:200px;font-size:.8em"></textarea></div><div class="banner danger small">Restaurar substitui todos os dados atuais.</div></div><div class="df"><button class="btn" data-act="close-layer">Cancelar</button><button class="btn danger solid" data-x="go">Substituir dados</button></div>` });
  $('#bk-file', l.box).addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) $('#bk-txt', l.box).value = await f.text(); });
  l.box.addEventListener('click', (e) => {
    if (!e.target.closest('[data-x="go"]')) return;
    try { const o = JSON.parse($('#bk-txt', l.box).value); const d = o.data || o; if (!d.tempo_projects) throw new Error(); db.restore(d); l.close(); toast('Backup restaurado'); }
    catch (err) { toast('Esse conteúdo não é um backup do Tempo válido.'); }
  });
};
ACTIONS['demo-load'] = async () => {
  if (projects().length && !await confirmBox({ title: 'Carregar exemplos?', body: 'Os dados fictícios serão somados aos que já existem.', ok: 'Carregar' })) return;
  seedDemo(); db.emit(); toast('Dados fictícios carregados');
};

function prefIntegrationsBase() {
  return `<div class="panel"><div class="panel-h"><h3>Gmail</h3><span class="tag c-gray">etapa futura</span></div><div class="panel-b stack small">
    <div>Vai ler e-mails recebidos e enviados (com sua autorização) e sugerir atualizações em cards com <b>Aprovar</b>, <b>Editar</b> ou <b>Ignorar</b>: pedido de orçamento, pedido de ajuste, entrega enviada, mudança de prazo, aprovação e pagamento.</div>
    <div class="muted">Nunca envia e-mails e nunca altera dados sem aprovação. Depende do banco online e da autorização do Google.</div></div></div>
  <div class="panel"><div class="panel-h"><h3>ChatGPT / assistente</h3><span class="tag c-gray">etapa futura</span></div><div class="panel-b small">Consultar tarefas do dia, prazos, atrasos e rentabilidade, e registrar atualizações com confirmação. Depende do banco online.</div></div><div class="panel"><div class="panel-h"><h3>Time Sheet automático</h3></div><div class="panel-b stack small"><label for="pause-apps">Apps que pausam a sessão (separados por vírgula)</label><input id="pause-apps" class="input" data-on="pause-apps" value="${esc((db.setting('pauseApps', DEFAULT_PAUSE_APPS) || []).join(', '))}" placeholder="WhatsApp, Telegram"><div class="muted">Se um desses apps ficar em primeiro plano por mais de 1 minuto com uma sessão rodando, o Tempo sugere pausar. Você decide.</div><label for="pause-sites">Sites que pausam (no navegador, pelo título da aba)</label><input id="pause-sites" class="input" data-on="pause-sites" value="${esc((db.setting('pauseSites', DEFAULT_PAUSE_SITES) || []).join(', '))}" placeholder="instagram, youtube"><div class="muted">Navegador (Chrome, Safari, Edge…) com a aba desses termos em primeiro plano vira pausa sugerida, igual aos apps acima.</div></div></div>`;
}

/* Configurações → Programas: nome, palavra que identifica o app e cor. Mudou aqui, muda em todas as telas. */
function programasPanel() {
  const list = programas();
  const rows = list.map((p, i) => `<div class="row" style="gap:8px;flex-wrap:wrap">
      <input class="input sm" value="${esc(p.name)}" data-on="prog-edit" data-i="${i}" data-f="name" style="width:180px" aria-label="Nome">
      <input class="input sm" value="${esc(p.match)}" data-on="prog-edit" data-i="${i}" data-f="match" style="width:180px" placeholder="palavra no nome do app" aria-label="Identificador">
      <input type="color" value="${esc(p.color)}" data-on="prog-edit" data-i="${i}" data-f="color" aria-label="Cor" style="width:40px;height:32px;padding:2px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface)">
      <button class="btn sm ghost icon" data-act="prog-del" data-i="${i}" aria-label="Remover">${icon('x')}</button></div>`).join('');
  return `<div class="panel"><div class="panel-h"><h3>Programas</h3></div><div class="panel-b stack" style="gap:10px">
    <span class="small muted">Nome que aparece nas telas, a palavra que identifica o programa no nome do app e a cor. Quem tiver a mesma palavra usa este cadastro.</span>
    ${rows || '<span class="muted small">Nenhum programa cadastrado.</span>'}
    <div class="row" style="gap:8px"><button class="btn sm" data-act="prog-add">${icon('plus')} Adicionar programa</button><button class="btn sm ghost" data-act="prog-reset">Restaurar padrões</button></div>
  </div></div>`;
}
ACTIONS['prog-add'] = () => { db.setSetting('programas', [...programas(), { match: '', name: 'Novo programa', color: '#64748B' }]); render(); };
ACTIONS['prog-del'] = (el) => { const l = programas().slice(); l.splice(Number(el.dataset.i), 1); db.setSetting('programas', l); render(); };
ACTIONS['prog-reset'] = async () => { if (!await confirmBox({ title: 'Restaurar padrões?', body: 'Os programas voltam à lista original. As cores que você escolheu em grupos específicos continuam.', ok: 'Restaurar' })) return; db.setSetting('programas', null); render(); };
CHANGES['prog-edit'] = (el) => { const l = programas().map(x => ({ ...x })); const i = Number(el.dataset.i); l[i][el.dataset.f] = el.value.trim() || (el.dataset.f === 'color' ? l[i].color : ''); db.setSetting('programas', l); render(); };

/* Configurações → Tipos de despesa (separado dos tipos de trabalho). */
function prefExTypes() { return exTypesPanel(); }

/* Integrações e próximos passos: o que já está combinado e ainda não foi feito. */
const PLANNED = [
  ['Mac: confirmar se ainda está trabalhando', 'Perguntar a cada 1 h, 2 h ou 3 h se você ainda está trabalhando e registrar a pausa quando você confirmar. Nada muda sem a sua resposta.'],
  ['Mac: início retroativo de sessão', 'Começar a sessão no horário em que o trabalho realmente começou, mesmo que você tenha apertado play depois.'],
  ['Time Sheet: período em cada gráfico', 'Seletor Dia / Semana / 15 dias / Mês em cada gráfico de barras (semana, tipos de trabalho, pausas e programas), não só no relatório.'],
  ['Versão para celular', 'Usar o Tempo no celular pelo navegador, com a mesma tela e os mesmos dados.'],
  ['Notificações no celular', 'Avisos de sessão, pausa e prazo também no celular.'],
];
function prefIntegrations() {
  const cards = PLANNED.map(([t, d]) => `<div class="panel"><div class="panel-h"><h3>${esc(t)}</h3><span class="tag c-gray">etapa futura</span></div><div class="panel-b small">${esc(d)}</div></div>`).join('');
  return prefIntegrationsBase() + cards;
}

/* ---------- temas: destaque, fundo e texto + fonte própria, salvos com nome ---------- */
let themeDraft = null;     // rascunho do editor de tema (não salvo)
let themePreview = null;   // prévia ao vivo enquanto se escolhe as cores
const loadedFonts = new Set();
const themesOf = () => db.setting('themes', []) || [];
const customFontsOf = () => db.setting('customFonts', {}) || {};
const activeThemeOf = () => themesOf().find(t => t.id === db.setting('activeTheme', '')) || null;
const themeDraftGet = () => themeDraft || (activeThemeOf() && { ...activeThemeOf() }) || { name: '', mode: 'light', accent: '#2E43D6', bg: '#F6F7F9', fg: '#15171C' };
function themeVars(t) {
  const mix = (a, p, b) => `color-mix(in srgb, ${a} ${p}%, ${b})`;
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * .2126 + ((n >> 8) & 255) * .7152 + (n & 255) * .0722) / 255; };
  return {
    '--bg': t.bg, '--surface': t.bg, '--surface-2': mix(t.bg, 94, t.fg), '--surface-3': mix(t.bg, 88, t.fg),
    '--line': mix(t.bg, 84, t.fg), '--line-strong': mix(t.bg, 72, t.fg), '--fg': t.fg, '--fg-2': mix(t.fg, 72, t.bg), '--fg-3': mix(t.fg, 55, t.bg),
    '--accent': t.accent, '--accent-fg': lum(t.accent) > .55 ? '#15171C' : '#FFFFFF', '--accent-soft': mix(t.accent, 12, t.bg), '--accent-line': mix(t.accent, 35, t.bg)
  };
}
const THEME_KEYS = Object.keys(themeVars({ accent: '#000000', bg: '#FFFFFF', fg: '#000000' }));
function applyThemeVars() {
  const root = document.documentElement; const t = themePreview || activeThemeOf();
  if (!t) { THEME_KEYS.forEach(k => root.style.removeProperty(k)); return; }
  const v = themeVars(t); THEME_KEYS.forEach(k => root.style.setProperty(k, v[k]));
}
const fontFamilyOf = (k) => {
  if (FONTS[k]) return FONTS[k][1];
  if (customFontsOf()[k]) {
    Object.entries(customFontsOf()).forEach(([id, f]) => {
      if (loadedFonts.has(id)) return; loadedFonts.add(id);
      try { new FontFace('tempo-' + id, `url("${f.data}")`).load().then(ff => document.fonts.add(ff)).catch(() => {}); } catch (e) { /* sem suporte: segue com a padrão */ }
    });
    return `"tempo-${k}", "Manrope", sans-serif`;
  }
  return FONTS.sonoma[1];
};
function themeColorField(k, label, c) {
  return `<label class="theme-pick" style="display:flex;flex-direction:column;gap:4px"><span class="small faint">${label}</span><input type="color" value="${c}" data-input="theme-draft" data-k="${k}" aria-label="${label}"></label>`;
}
function themePanelHTML() {
  const d = themeDraftGet(), cur = db.setting('activeTheme', ''), fo = db.setting('font', 'sonoma'), fonts = customFontsOf(), themes = themesOf();
  return `<div class="panel"><div class="panel-h"><h3>Temas</h3></div><div class="panel-b stack">
    <span class="hint">Escolha as cores de destaque, de fundo e de texto, e a fonte. Salve o conjunto com um nome e aplique quando quiser. As cores valem nos modos Claro e Escuro.</span>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="btn sm ${!cur ? 'primary' : ''}" data-act="theme-apply" data-id="">Padrão do app</button>
      ${themes.map(t => `<span class="row" style="gap:4px"><button class="btn sm ${cur === t.id ? 'primary' : ''}" data-act="theme-apply" data-id="${t.id}"><span class="swatch-mini" style="background:${t.accent}"></span>${esc(t.name)}</button><button class="btn sm ghost" data-act="theme-del" data-id="${t.id}" title="Excluir tema" aria-label="Excluir tema ${esc(t.name)}">×</button></span>`).join('')}
    </div>
    <div class="row" style="gap:8px;align-items:center"><span class="small faint">Base</span><div class="seg">${[['light', 'Dia'], ['dark', 'Noite']].map(([k, l]) => `<button class="${(d.mode || 'light') === k ? 'on' : ''}" data-act="theme-mode" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="row" style="gap:16px;flex-wrap:wrap;align-items:flex-end">
      ${themeColorField('accent', 'Destaque', d.accent)}
      ${themeColorField('bg', 'Fundo', d.bg)}
      ${themeColorField('fg', 'Texto', d.fg)}
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <input class="input" style="max-width:240px" placeholder="Nome do tema" aria-label="Nome do tema" value="${esc(d.name || '')}" data-input="theme-name">
      <button class="btn primary" data-act="theme-save">Salvar tema</button>
      <button class="btn" data-act="theme-reset-draft">Voltar às cores do app</button>
    </div>
    <div class="field"><span class="lbl">Fonte própria</span>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn sm" data-act="font-pick">Enviar fonte do computador</button><input id="font-file" type="file" accept=".woff2,.woff,.ttf,.otf" data-on="font-upload" hidden>
        ${Object.entries(fonts).map(([k, f]) => `<span class="row" style="gap:4px"><button class="btn sm ${fo === k ? 'primary' : ''}" data-act="set" data-k="font" data-v="${k}">${esc(f.label)}</button><button class="btn sm ghost" data-act="font-del" data-id="${k}" title="Excluir fonte" aria-label="Excluir fonte ${esc(f.label)}">×</button></span>`).join('')}
      </div>
      <span class="hint">.woff2, .woff, .ttf ou .otf, até 2 MB. Fica salva no app e entra na lista de fontes acima.</span>
    </div>
  </div></div>`;
}
CHANGES['theme-draft'] = (el) => { themeDraft = { ...themeDraftGet(), [el.dataset.k]: el.value }; themePreview = themeDraft; applyThemeVars(); };
CHANGES['theme-name'] = (el) => { themeDraft = { ...themeDraftGet(), name: el.value }; };
ACTIONS['theme-apply'] = (el) => {
  const id = el.dataset.id; themePreview = null; themeDraft = null;
  if (id) { const t = themesOf().find(x => x.id === id); if (t && t.font) db.setSetting('font', t.font); }
  db.setSetting('activeTheme', id);
};
ACTIONS['theme-save'] = () => {
  const d = themeDraftGet(); const list = themesOf();
  const t = { id: 't' + Date.now().toString(36), name: (d.name || '').trim() || `Tema ${list.length + 1}`, mode: d.mode || 'light', accent: d.accent, bg: d.bg, fg: d.fg, font: db.setting('font', 'sonoma') };
  db.setSetting('themes', [...list, t]); db.setSetting('activeTheme', t.id);
  themePreview = null; themeDraft = null; toast(`Tema "${t.name}" salvo`);
};
ACTIONS['theme-del'] = (el) => {
  const list = themesOf().filter(t => t.id !== el.dataset.id);
  db.setSetting('themes', list); if (db.setting('activeTheme', '') === el.dataset.id) db.setSetting('activeTheme', '');
  toast('Tema excluído');
};
ACTIONS['theme-reset-draft'] = () => { themeDraft = null; themePreview = null; applyThemeVars(); render(); };
ACTIONS['font-del'] = (el) => {
  const fonts = { ...customFontsOf() }; delete fonts[el.dataset.id];
  db.setSetting('customFonts', fonts); if (db.setting('font', 'sonoma') === el.dataset.id) db.setSetting('font', 'sonoma');
  toast('Fonte excluída');
};
CHANGES['font-upload'] = (el) => {
  const f = el.files && el.files[0]; if (!f) return;
  if (f.size > 2 * 1024 * 1024) { toast('Fonte grande demais (máximo 2 MB)'); el.value = ''; return; }
  const r = new FileReader();
  r.onload = () => {
    const id = 'f' + Date.now().toString(36), label = f.name.replace(/\.(woff2?|ttf|otf)$/i, '');
    db.setSetting('customFonts', { ...customFontsOf(), [id]: { label, data: r.result } });
    db.setSetting('font', id); toast(`Fonte "${label}" adicionada`);
  };
  r.onerror = () => toast('Não consegui ler esse arquivo. Se ele estiver só na nuvem (Dropbox, iCloud), baixe antes: clique com o botão direito e escolha Disponibilizar offline.');
  toast('Lendo a fonte…');
  r.readAsDataURL(f);
};

ACTIONS['font-pick'] = () => { const i = document.getElementById('font-file'); if (i) i.click(); };

ACTIONS['theme-mode'] = (el) => { themeDraft = { ...themeDraftGet(), mode: el.dataset.v }; themePreview = themeDraft; applyAppearance(); render(); };
