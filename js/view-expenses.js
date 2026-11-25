/* =====================================================================
   DESPESAS (custos pessoais e da empresa)
   Uma tabela por mês, com entradas em cima (+) e saídas embaixo (−).
   O valor é sempre positivo; o sinal vem do tipo da linha.
   Ao começar um mês novo, copia o anterior: mesmo dia de vencimento,
   status "Não pago" / "Não recebido", "Paga em" vazio, anotação vazia. Linhas "Não teve"
   não são copiadas; parcelas que terminaram também não.
   ===================================================================== */

const EX_CATS = {
  PESSOAL: ['Moradia', 'Contas da casa', 'Casa e serviços', 'Saúde', 'Educação', 'Cartão e dívidas', 'Renda', 'Filho', 'Alimentação', 'Transporte', 'Lazer', 'Viagem', 'Compras', 'Roupas', 'Assinaturas', 'Outros'],
  EMPRESA: ['Impostos', 'Contabilidade', 'Assinaturas e programas', 'Freelas']
};
const EX_STATUS = { out: ['Não pago', 'Pago', 'Não teve'], in: ['Não recebido', 'Recebido', 'Não teve'] };
const EX_DONE = { out: 'Pago', in: 'Recebido' };
const EX_OPEN = { out: 'Não pago', in: 'Não recebido' };
const EX_OFF = 'Não teve';

const exRows = (ym, kind) => db.all('tempo_expenses').filter(r => r.month === ym && (!kind || r.kind === kind)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const exMonths = () => [...new Set(db.all('tempo_expenses').map(r => r.month))].sort().reverse();
const exAmt = (r) => Number(r.amount) || 0;
const exSum = (rows) => rows.reduce((t, r) => t + exAmt(r), 0);
const exDayOf = (iso) => iso ? Number(iso.slice(8, 10)) : 1;
/* mesmo dia do mês, limitado ao último dia do mês (dia 31 em fevereiro vira 28) */
const exDateIn = (ym, day) => { const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return `${ym}-${String(Math.min(day, last)).padStart(2, '0')}`; };
const exInstLabel = (r) => r.inst_total ? `${r.inst_no || 1}/${r.inst_total}` : '';

/* Valor ainda não confirmado: veio do mês anterior como sugestão, aparece em cinza claro e não entra nas somas. */
const exIsSug = (r) => r.amount == null && r.amount_sug != null;
/* Entrada que se repete todo mês: só renda (salário, Amanda…). Freela e entrada ligada a projeto não se repetem. */
const exInRepete = (r) => !r.project_id && /renda/i.test(r.cat || '') && !/freela/i.test(r.cat || '');
/* Copia um mês para outro. Não copia linhas "Não teve", parcelas já encerradas nem entradas que não são renda.
   Os valores vão como sugestão (amount_sug); só contam depois de confirmados. */
function exCopyMonth(target, src) {
  if (exRows(target).length || !src) return false;
  exRows(src).forEach(r => {
    if (r.status === EX_OFF) return;
    if (r.kind === 'in' && !exInRepete(r)) return;
    if (r.inst_total && (r.inst_no || 1) >= r.inst_total) return;
    db.insert('tempo_expenses', {
      month: target, kind: r.kind, name: r.name || '', cat: r.cat || '', note: '', amount: null, amount_sug: exPorDiaValor(r, target) ?? r.amount ?? r.amount_sug ?? null,
      due_date: r.due_date ? exDateIn(target, exDayOf(r.due_date)) : null, paid_on: null, status: EX_OPEN[r.kind],
      inst_no: r.inst_total ? (r.inst_no || 1) + 1 : null, inst_total: r.inst_total || null, order: r.order ?? 0
    }, true);
  });
  return true;
}
/* Chamado ao abrir o app: cria os meses que faltam até o atual, copiando o último existente. */
function exEnsureMonths() {
  const now = exNow();
  const months = exMonths().filter(m => m <= now); if (!months.length) return;
  let cur = months[0], guard = 0, changed = false;
  while (cur < now && guard++ < 24) { const t = rbAddMonth(cur, 1); if (exCopyMonth(t, cur)) changed = true; cur = t; }
  if (changed) db.emit();
}

/* Mês "atual" das despesas: a partir do dia 25, o mês seguinte já abre (criado e mostrado), para lançar as contas antes da virada. */
const EX_ABRE_DIA = 25;
const exNow = () => { const d = new Date(); const ym = ymd(d).slice(0, 7); return d.getDate() >= EX_ABRE_DIA ? rbAddMonth(ym, 1) : ym; };
/* intervalo mostrado: de (mês inicial) até (mês final), o mais recente em cima */
const exRange = () => { let from = S.exFrom || exMonths().slice(-1)[0] || exNow(), to = S.exTo || exNow(); if (from > to) [from, to] = [to, from]; return { from, to }; };
ACTIONS['ex-create'] = (el) => {
  const ym = el.dataset.m;
  const prev = exMonths().find(m => m < ym);
  if (!exCopyMonth(ym, prev)) { exAddRow(ym, 'out'); }
  db.emit(); toast(prev ? `Mês criado a partir de ${rbLabel(prev)}` : 'Mês criado');
};
ACTIONS['ex-toggle'] = (el) => { const ym = el.dataset.m; S.exOpenM = S.exOpenM || {}; S.exOpenM[ym] = el.getAttribute('aria-expanded') !== 'true'; render(); };
ACTIONS['ex-preset'] = (el) => {
  const now = exNow(); const m = el.dataset.p;
  if (m === 'all') { const all = exMonths(); S.exFrom = all[all.length - 1] || now; S.exTo = now; }
  else { S.exTo = now; S.exFrom = rbAddMonth(now, -(Number(m) - 1)); }
  render();
};
ACTIONS['ex-pick-open'] = (el) => { const k = el.dataset.k; S.exPick = S.exPick === k ? null : k; S.exPickYear = null; render(); };
ACTIONS['ex-pick-year'] = (el) => { const cur = S.exPick === 'from' ? S.exFrom : S.exTo; const y = S.exPickYear || Number(String(cur).slice(0, 4)); S.exPickYear = y + Number(el.dataset.d); render(); };
ACTIONS['ex-pick-set'] = (el) => { if (S.exPick === 'from') S.exFrom = el.dataset.m; else S.exTo = el.dataset.m; S.exPick = null; render(); };
CHANGES['ex-range'] = (el) => {
  if (!el.value) return;
  if (el.dataset.k === 'from') S.exFrom = el.value; else S.exTo = el.value;
  render();
};
function exAddRow(ym, kind) {
  db.insert('tempo_expenses', { month: ym, kind, name: '', cat: '', note: '', amount: null, due_date: exDateIn(ym, 10), paid_on: null, status: EX_OPEN[kind], inst_no: null, inst_total: null, order: exRows(ym).length });
}
ACTIONS['ex-add'] = (el) => { exAddRow(el.dataset.m, el.dataset.kind); };
ACTIONS['ex-del'] = (el) => { db.remove('tempo_expenses', el.dataset.id); };
CHANGES['ex-field'] = (el) => {
  const k = el.dataset.k; const id = el.dataset.id;
  if (k === 'inst') {
    const m = (el.value || '').match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
    return db.update('tempo_expenses', id, m ? { inst_no: Number(m[1]), inst_total: Number(m[2]) } : { inst_no: null, inst_total: null });
  }
  let v = el.dataset.money !== undefined ? moneyVal(el) : el.value;
  if (k === 'name' || k === 'note') v = (v || '').trim();
  if (k === 'due_date' || k === 'paid_on' || k === 'cat') v = v || null;
  db.update('tempo_expenses', id, { [k]: v });
};
CHANGES['ex-status'] = (el) => {
  const r = db.get('tempo_expenses', el.dataset.id); if (!r) return;
  exSetStatus(r, el.value);
};
CHANGES['ex-import'] = async (el) => {
  const file = el.files[0]; if (!file) return;
  const { rows } = parseCSV(await file.text());
  const existing = new Set(exMonths()); const skipped = new Set(); let n = 0;
  const pos = {};
  rows.forEach(o => {
    const name = (o['Despesa'] || '').trim(); const val = rbMoney(o['Valor']);
    if (!name || val === null) return;
    const iso = rbISO(o['Data']); const ym = iso ? iso.slice(0, 7) : ymd(new Date()).slice(0, 7);
    if (existing.has(ym)) { skipped.add(ym); return; }
    const kind = val < 0 ? 'in' : 'out';
    const p = (o['Pagamento'] || '').trim();
    const status = p === EX_OFF || p === 'Não teve este mes' ? EX_OFF : (p === 'Pago' || p === 'Recebido') ? EX_DONE[kind] : EX_OPEN[kind];
    const key = ym + kind; pos[key] = (pos[key] ?? -1) + 1;
    db.insert('tempo_expenses', { month: ym, kind, name, cat: '', note: (o['Anotação'] || '').trim(), amount: Math.abs(val), due_date: iso || null, paid_on: status === EX_DONE[kind] ? (iso || null) : null, status, inst_no: null, inst_total: null, order: pos[key] }, true);
    n++;
  });
  db.emit(); el.value = '';
  S.exMonth = exMonths()[0];
  toast(`${n} linhas importadas${skipped.size ? `; já existiam: ${[...skipped].map(rbLabel).join(', ')}` : ''}`);
  render();
};


/* Freelas automáticos em Entradas (daqui pra frente, a partir de nov/2026):
   - pagamento de projeto lançado → linha "Recebido" no mês do pagamento, ligada ao projeto;
   - nota fiscal emitida e ainda sem pagamento → linha "Não recebido" no mês da emissão; quando a nota é paga, a mesma linha vira "Recebido".
   Não duplica o que já está na lista (mesmo projeto, ou mesmo valor no mês ou no seguinte, ex.: Salário = fee).
   Linha apagada à mão não volta (fica marcada em exAuto). */
const EX_AUTO_DESDE = '2026-11';
function exFreelaSync() {
  if (!db.loaded || !db.data.tempo_payments) return;
  const auto = { ...(db.setting('exAuto', {}) || {}) }; let mudou = false;
  const meses = new Set(exMonths());
  const usados = new Set(Object.values(auto));
  const mesDe = (d) => String(d || '').slice(0, 7);
  const proxMes = (ym) => rbAddMonth(ym, 1), antMes = (ym) => rbAddMonth(ym, -1);
  const nomeDe = (pr) => { const ag = agencyOf(pr), cl = clientOf(pr); return ag && !(typeof isDirectAgency === 'function' && isDirectAgency(ag)) ? ag.name : (cl?.name || pr?.name || 'Freela'); };
  const jaTem = (ym, amt, pid) => db.all('tempo_expenses').some(r => r.kind === 'in' && !usados.has(r.id) && [ym, proxMes(ym), antMes(ym)].includes(r.month) && (Math.abs(Number(r.amount ?? r.amount_sug ?? -1) - amt) < 0.01 || (pid && r.project_id === pid && Math.abs(Number(r.amount || 0) - amt) < 0.01)));
  const notas = typeof nfTodas === 'function' ? nfTodas() : [];
  const nfDoPag = (pid) => notas.find(n => n.payment_id === pid);
  const linha = (key, campos) => {
    const id = auto[key];
    if (id) { const r = db.get('tempo_expenses', id); if (!r) return; const upd = {}; Object.entries(campos).forEach(([k, v]) => { if ((r[k] ?? null) !== (v ?? null) && !(k === 'month' && r.status === EX_DONE.in && campos.status === EX_DONE.in)) upd[k] = v; }); if (Object.keys(upd).length) { db.update('tempo_expenses', id, upd, true); mudou = true; } return; }
    if (!meses.has(campos.month)) return;
    const r = db.insert('tempo_expenses', { kind: 'in', cat: 'EMPRESA/Freelas', note: '', due_date: null, inst_no: null, inst_total: null, amount_sug: null, order: exRows(campos.month, 'in').length, ...campos }, true);
    auto[key] = r.id; usados.add(r.id); mudou = true;
  };
  db.all('tempo_payments').forEach(p => {
    const ym = mesDe(p.date); if (!ym || ym < EX_AUTO_DESDE) return;
    const amt = Math.round(Number(p.amount || 0) * 100) / 100; if (!(amt > 0)) return;
    const pr = db.get('tempo_projects', p.project_id);
    const nf = nfDoPag(p.id);
    const key = nf && auto['nf:' + nf.id] ? 'nf:' + nf.id : 'pay:' + p.id;
    if (!auto[key] && (jaTem(ym, amt, p.project_id) || /^Entrada: /.test(p.note || ''))) return;   // já existe (ou nasceu de uma linha de Entradas)
    linha(key, { month: auto[key] ? (db.get('tempo_expenses', auto[key])?.month || ym) : ym, name: nomeDe(pr), project_id: p.project_id, amount: amt, status: EX_DONE.in, paid_on: p.date, note: nf ? `NF${String(nf.numero).padStart(2, '0')}` : '' });
  });
  notas.forEach(n => {
    if (typeof nfValida === 'function' && !nfValida(n)) return;
    const ym = mesDe(n.emitida_em); if (!ym || ym < EX_AUTO_DESDE || n.payment_id || auto['nf:' + n.id] === undefined && nfStatus(n) === 'paga') return;
    const amt = Math.round(Number(n.valor || 0) * 100) / 100; if (!(amt > 0)) return;
    if (!auto['nf:' + n.id] && jaTem(ym, amt, null)) return;
    const ag = db.get('tempo_agencies', n.agency_id), cl = db.get('tempo_clients', n.client_id);
    linha('nf:' + n.id, { month: ym, name: (ag && !(typeof isDirectAgency === 'function' && isDirectAgency(ag)) ? ag.name : cl?.name) || n.tomador_nome || 'Nota fiscal', amount: amt, status: EX_OPEN.in, paid_on: null, note: `NF${String(n.numero).padStart(2, '0')}` });
  });
  if (mudou) db.setSetting('exAuto', auto);
}
/* Vínculo da entrada: projeto, cliente e agência (para o painel da linha). */
function exVinculoHTML(r) {
  if (r.kind !== 'in') return '';
  const pr = r.project_id ? db.get('tempo_projects', r.project_id) : null;
  const nfN = /^NF(\d+)/.exec(r.note || ''); const nf = nfN && typeof nfTodas === 'function' ? nfTodas().find(n => n.serie === 'nacional' && n.numero === Number(nfN[1])) : null;
  if (!pr && !nf) return '';
  const cl = pr ? clientOf(pr) : null, ag = pr ? agencyOf(pr) : null;
  return `<div class="field"><span class="lbl">Vínculo</span><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">${pr ? `<a href="#" data-act="proj-open" data-id="${pr.id}">${esc(pr.name)}</a><span class="small muted">${esc([cl?.name, ag && ag.name !== cl?.name ? ag.name : null].filter(Boolean).join(' · '))}</span>` : ''}${nf && typeof nfChip === 'function' ? nfChip(nf, { label: true }) : ''}</div></div>`;
}

const exMesCurto = (ym) => { const [y, m] = ym.split('-').map(Number); return `${RB_MONTHS[m - 1]} ${y}`; };
/* resumo de um mês: previsto e realizado */
function exMonthTotals(ym) {
  const ins = exRows(ym, 'in'), outs = exRows(ym, 'out');
  const live = (rows) => rows.filter(r => r.status !== EX_OFF);
  return {
    inPrev: exSum(live(ins)), inDone: exSum(ins.filter(r => r.status === EX_DONE.in)),
    outPrev: exSum(live(outs)), outDone: exSum(outs.filter(r => r.status === EX_DONE.out)),
    outOpen: exSum(outs.filter(r => r.status === EX_OPEN.out && r.amount != null)), outOpenN: outs.filter(r => r.status === EX_OPEN.out && r.amount != null && Number(r.amount) > 0).length
  };
}
/* opções das listas de Despesas (categoria e status), para a tabela e o seletor */
function exComboItems(kind) {
  if (kind === 'ex_cat') return Object.entries(EX_CATS).flatMap(([main, subs]) => subs.map(sub => ({ id: `${main}/${sub}`, name: sub, color: main === 'PESSOAL' ? 'blue' : 'purple', html: `<span class="faint small">${main} · </span>${esc(sub)}` })));
  const k = kind === 'ex_in' ? 'in' : 'out';
  return EX_STATUS[k].map(s => { const color = s === EX_DONE[k] ? 'green' : s === EX_OFF ? 'gray' : 'red'; return { id: s, name: s, color, html: tag(s, color, { pill: true }) }; });
}
function exSetStatus(r, v) {
  const done = v === EX_DONE[r.kind];
  const antes = { ...r };
  const conf = done && exIsSug(r) ? { amount: Number(r.amount_sug), amount_sug: null } : {}; // pago/recebido confirma a sugestão
  db.update('tempo_expenses', r.id, { status: v, paid_on: done ? (r.paid_on || ymd(new Date())) : (v === EX_OFF ? r.paid_on : null), ...conf });
  exSyncPayment(antes, db.get('tempo_expenses', r.id));
}
/* Entrada ligada a um projeto marcada como Recebido → pagamento do projeto.
   Liga a um pagamento que já existe (mesmo valor, até 30 dias de distância) ou cria um com a nota "Entrada: <nome>".
   Ao desmarcar, apaga só o pagamento que ela mesma criou. */
const EX_PAY_NOTE = (r) => `Entrada: ${r.name || 'sem nome'}`;
function exSyncPayment(antes, r) {
  if (!r || r.kind !== 'in' || !r.project_id) return;
  const amt = Math.round(Number(r.amount || 0) * 100) / 100; if (!(amt > 0)) return;
  const era = antes.status === EX_DONE.in, agora = r.status === EX_DONE.in;
  if (era === agora) return;
  const mesmo = (x) => Math.abs(Number(x.amount || 0) - amt) < 0.005;
  if (agora) {
    const dia = r.paid_on || ymd(new Date()); const t0 = new Date(dia + 'T12:00').getTime();
    const perto = (x) => !x.date || Math.abs(new Date(x.date + 'T12:00').getTime() - t0) <= 30 * 864e5;
    const ja = db.where('tempo_payments', x => x.project_id === r.project_id && mesmo(x) && perto(x))[0];
    if (ja) { if (!ja.date) db.update('tempo_payments', ja.id, { date: dia }); toast('Ligado ao pagamento do projeto que já existia.'); return; }
    db.insert('tempo_payments', { project_id: r.project_id, amount: amt, date: dia, note: EX_PAY_NOTE(r), invoice: '' });
    const p = db.get('tempo_projects', r.project_id); toast(`Pagamento de ${fmtMoney(amt)} lançado em ${p ? p.name : 'projeto'}.`);
  } else {
    const meu = db.where('tempo_payments', x => x.project_id === r.project_id && mesmo(x) && x.note === EX_PAY_NOTE(r) && (!antes.paid_on || x.date === antes.paid_on))[0];
    if (meu) { db.remove('tempo_payments', meu.id); toast('Pagamento do projeto desfeito.'); }
  }
}
/* Anotação: "LINK COMPROVANTE: <arquivo>" vira botão que mostra o arquivo no Finder (no Mac). */
function exNotaHTML(nota) {
  const t = String(nota || ''); if (!t) return '<span class="faint">—</span>';
  const m = t.match(/LINK COMPROVANTE: (\S+)/); if (!m) return esc(t);
  const resto = t.replace(m[0], '').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
  return `${resto ? esc(resto) + ' ' : ''}<span class="tag c-blue rb-file" role="button" tabindex="0" data-act="file-open" data-path="${esc(m[1])}" data-tip="${esc('Mostrar o comprovante no Finder\n' + m[1].split('/').pop())}">${icon('doc', 'ico')}Comprovante</span>`;
}
const EX_COLS = {
  cat: { label: 'Categoria', ico: 'layers', w: 170, cell: r => r.cat ? exCatTags(r.cat) : '<span class="faint">—</span>', edit: { type: 'combo', kind: 'ex_cat', allowEmpty: true, emptyLabel: 'Sem categoria', get: r => r.cat, set: (r, v) => db.update('tempo_expenses', r.id, { cat: v || null }) } },
  name: { label: 'Nome', ico: 'text', cls: 'name', sort: r => r.name || '', w: 220, cell: r => `<span class="cell-name"><span class="ct">${esc(r.name || '') || '<span class="faint">—</span>'}${r.kind === 'in' && r.project_id && db.get('tempo_projects', r.project_id) ? ` <a href="#" class="small muted ex-lig" data-act="proj-open" data-id="${r.project_id}" title="Abrir o projeto">↗ ${esc(db.get('tempo_projects', r.project_id).name)}</a>` : ''}</span>${typeof openBtn === 'function' ? openBtn('ex-open', r.id) : ''}</span>`, edit: { type: 'text', get: r => r.name, set: (r, v) => db.update('tempo_expenses', r.id, { name: (v || '').trim() }) } },
  due_date: { label: 'Vencimento', ico: 'cal', w: 120, cell: r => r.due_date ? fmtDate(r.due_date) : '<span class="faint">—</span>', sort: r => r.due_date || '', edit: { type: 'date', get: r => r.due_date, set: (r, v) => db.update('tempo_expenses', r.id, { due_date: v || null }) } },
  amount: { label: 'Valor', ico: 'money', sort: r => r.amount || 0, money: true, w: 130, cell: r => { const v = exIsSug(r) ? `<span class="ex-sug" title="${exPorDiaTxt(r) ? 'Conta das sessões. Clique para confirmar ou mudar (ou marque como pago); até lá não entra na soma.' : 'Sugestão do mês anterior. Clique para confirmar ou mudar; até lá não entra na soma.'}"><span class="ex-sign">${r.kind === 'in' ? '+' : '−'}</span> ${fmtMoney(r.amount_sug)}</span>` : `<span class="ex-sign">${r.kind === 'in' ? '+' : '−'}</span> ${fmtMoney(r.amount || 0)}`;
    return exPorDiaTxt(r) ? `<span class="ex-val"><span class="faint small ex-ses" title="Valor por sessão (Abrir na linha para mudar)">${exPorDiaTxt(r)}</span><span>${v}</span></span>` : v; }, val: r => (r.status === EX_OFF ? 0 : (r.amount || 0)), edit: { type: 'money', get: r => exIsSug(r) ? r.amount_sug : r.amount, confirm: exIsSug, set: (r, v) => db.update('tempo_expenses', r.id, { amount: Math.abs(v || 0), amount_sug: null }) } },
  status: { label: 'Status', ico: 'spin', w: 150, cell: r => { const c = exComboItems(r.kind === 'in' ? 'ex_in' : 'ex_out').find(x => x.id === r.status); return c ? c.html : esc(r.status || ''); }, edit: { type: 'combo', kind: r => r.kind === 'in' ? 'ex_in' : 'ex_out', get: r => r.status, set: (r, v) => exSetStatus(r, v) } },
  paid_on: { label: 'Paga em', ico: 'cal', w: 120, cell: r => r.paid_on ? fmtDate(r.paid_on) : '<span class="faint">—</span>', sort: r => r.paid_on || '', edit: { type: 'date', get: r => r.paid_on, set: (r, v) => db.update('tempo_expenses', r.id, { paid_on: v || null }) } },
  inst: { label: 'Parcela', ico: 'hash', w: 90, cell: r => exInstLabel(r) || '<span class="faint">—</span>', edit: { type: 'text', get: r => exInstLabel(r), set: (r, v) => { const m = String(v || '').match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/); db.update('tempo_expenses', r.id, m ? { inst_no: Number(m[1]), inst_total: Number(m[2]) } : { inst_no: null, inst_total: null }); } } },
  note: { label: 'Anotação', ico: 'text', w: 240, cell: r => exNotaHTML(r.note), edit: { type: 'text', get: r => r.note, set: (r, v) => db.update('tempo_expenses', r.id, { note: (v || '').trim() }) } },
  del: { label: '', w: 44, cell: r => `<button class="icon-btn ghost" data-act="ex-del" data-id="${r.id}" title="Remover linha">×</button>` }
};
/* Categoria em etiquetas: [PF] [Renda]. PF roxo, PJ amarelo. Entradas em cores frias, saídas em cores quentes. Clique para mudar a cor. */
const EX_IN_CATS = ['PESSOAL/Renda', 'EMPRESA/Freelas'];
const EX_GROUP_LABEL = { PESSOAL: 'PF', EMPRESA: 'PJ' };
const EX_GROUP_DEF = { PESSOAL: '#D6C1F2', EMPRESA: '#F4DE8C' };
const exDefColor = (key) => {
  if (EX_GROUP_DEF[key]) return EX_GROUP_DEF[key];
  if (EX_IN_CATS.includes(key)) return '#AFCBF3';
  const i = Object.entries(EX_CATS).flatMap(([g, subs]) => subs.map(sub => `${g}/${sub}`)).indexOf(key);
  return i >= 0 ? CAT_COLORS[i % CAT_COLORS.length] : '#E2E8F0';   // cor clara e diferente por tipo
};
const exColor = (key) => (db.setting('ex_colors', {}) || {})[key] || exDefColor(key);
const exCatTags = (cat) => { const [g, sub] = cat.split('/');
  return `<span class="ctag"><span class="tag tg abbr" style="${cssTb(exColor(g))}" data-act="ex-color" data-key="${esc(g)}" title="Mudar cor">${esc(EX_GROUP_LABEL[g] || g)}</span><span class="tag tg" style="${cssTb(exColor(cat))}" data-act="ex-color" data-key="${esc(cat)}" title="Mudar cor">${esc(sub || cat)}</span></span>`; };
function exSetColor(key, hex) {
  const m = { ...(db.setting('ex_colors', {}) || {}) };
  if (hex) m[key] = hex; else delete m[key];
  db.setSetting('ex_colors', m); db.emit();
}
ACTIONS['ex-color'] = (el) => {
  const key = el.dataset.key; const cur = exColor(key);
  openLayer({ html: `<div class="dh">${icon('layers')}<h2>Cor de ${esc(key.replace('/', ' › '))}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db"><div class="row wrap" style="gap:8px">${PRESET_COLORS.map(([hex, name]) => `<button class="btn sm" data-act="ex-color-set" data-key="${esc(key)}" data-c="${hex}" style="${cssTb(hex)}" title="${name}">${name}</button>`).join('')}</div>
    <div class="row" style="gap:8px;margin-top:12px"><label class="small muted">Cor livre</label><input type="color" value="${cur}" data-on="ex-free" data-key="${esc(key)}" aria-label="Cor livre"><button class="btn sm ghost" data-act="ex-color-set" data-key="${esc(key)}" data-c="">Padrão</button></div></div>` });
};
ACTIONS['ex-color-set'] = (el) => { exSetColor(el.dataset.key, el.dataset.c || null); document.querySelector('[data-act="close-layer"]')?.click(); };
CHANGES['ex-free'] = (el) => exSetColor(el.dataset.key, el.value);
// Filtro escondido: só aparece quando o botão Filtrar está aberto.
const exFilterState = () => S.exF || {};
const normExp = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Meio de pagamento de um gasto = meio do lançamento do extrato vinculado a ele.
let EX_METHOD = {};
function exMethodMap() {
  const m = {};
  if (typeof BANK !== 'undefined') (BANK.all.pf || []).concat(BANK.all.pj || []).forEach(t => { if (t.expense_id) m[t.expense_id] = bankMethod(t); });
  return m;
}
function exMatch(r) {
  const f = exFilterState();
  if (f.meth && (EX_METHOD[r.id] || '—') !== f.meth) return false;
  if (f.q && !normExp(r.name).includes(normExp(f.q))) return false;
  if (f.cat && `${r.cat || ''}` !== f.cat) return false;
  if (f.st && r.status !== f.st) return false;
  const a = Math.abs(Number(r.amount) || 0);
  if (f.min && a < Number(f.min)) return false;
  if (f.max && a > Number(f.max)) return false;
  return true;
}
function exFilterOn() { const f = exFilterState(); return !!(f.q || f.cat || f.st || f.min || f.max || f.meth); }
function exFilterHTML() {
  const f = exFilterState();
  const cats = Object.entries(EX_CATS).flatMap(([main, subs]) => subs.map(sub => `${main}/${sub}`));
  return `<div class="ex-filter panel-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end">
    <div class="field"><label for="exf-q">Nome</label><input id="exf-q" class="input" value="${esc(f.q || '')}" placeholder="Buscar por nome" data-on="ex-f" data-k="q"></div>
    <div class="field"><label for="exf-cat">Categoria</label><select id="exf-cat" class="input" data-on="ex-f" data-k="cat"><option value="">Todas</option>${cats.map(c => `<option value="${esc(c)}" ${f.cat === c ? 'selected' : ''}>${esc(c.replace('/', ' › '))}</option>`).join('')}</select></div>
    <div class="field"><label for="exf-st">Status</label><select id="exf-st" class="input" data-on="ex-f" data-k="st"><option value="">Todos</option>${[...new Set([...EX_STATUS.out, ...EX_STATUS.in])].map(x => `<option value="${esc(x)}" ${f.st === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label for="exf-meth">Meio</label><select id="exf-meth" class="input" data-on="ex-f" data-k="meth"><option value="">Todos</option>${[...METHODS, '—'].map(x => `<option value="${x}" ${f.meth === x ? 'selected' : ''}>${x === '—' ? 'Sem vínculo' : x}</option>`).join('')}</select></div>
    <div class="field"><label for="exf-min">Valor mínimo</label><input id="exf-min" class="input" type="number" min="0" value="${esc(f.min || '')}" data-on="ex-f" data-k="min"></div>
    <div class="field"><label for="exf-max">Valor máximo</label><input id="exf-max" class="input" type="number" min="0" value="${esc(f.max || '')}" data-on="ex-f" data-k="max"></div>
    <div class="row"><button class="btn sm ghost" data-act="ex-filter-clear">Limpar filtro</button></div>
  </div>`;
}
CHANGES['ex-f'] = (el) => { S.exF = { ...exFilterState(), [el.dataset.k]: el.value }; render(); };
ACTIONS['ex-filter-toggle'] = () => { S.exFOpen = !S.exFOpen; render(); };
ACTIONS['ex-filter-clear'] = () => { S.exF = {}; render(); };

function exSectionHTML(ym, kind) {
  const rows = exRows(ym, kind).filter(exMatch); const total = exSum(rows.filter(r => r.status !== EX_OFF));
  const title = kind === 'in' ? 'Entradas' : 'Saídas';
  return `<div class="ex-sec">
    <div class="ex-sec-h"><b>${title}</b><span class="grow"></span><span class="mono ${kind === 'in' ? 'ex-plus' : 'ex-minus'}">${kind === 'in' ? '+' : '−'} ${fmtMoney(total)}</span></div>
    <div class="panel-b tight">${rows.length ? gridTable({ id: kind === 'in' ? 'ex-in' : 'ex-out', group: 'ex', widthRows: db.all('tempo_expenses'), cols: EX_COLS, rows, rowById: (rid) => db.get('tempo_expenses', rid) }) : `<div class="faint small" style="padding:10px">${kind === 'in' ? 'Nenhuma entrada' : 'Nenhuma saída'} neste mês.</div>`}</div>
    <div class="row" style="padding:8px 2px"><button class="btn sm ghost" data-act="ex-add" data-kind="${kind}" data-m="${ym}">${icon('plus')} ${kind === 'in' ? 'Entrada' : 'Saída'}</button></div>
  </div>`;
}

VIEWS.expenses = () => {
  exReembSync();
  exFreelaSync();
  exPorDiaSync();
  const { from, to } = exRange(); S.exFrom = from; S.exTo = to;
  const now = exNow();
  const existing = exMonths().filter(m => m >= from && m <= to); // mais recente primeiro
  const missing = !existing.includes(to) && to <= now ? to : null; // mês final ainda não existe

  /* seletor de mês compacto: botão com o mês (ex.: Agosto 2026) abre uma grade de meses */
  const mesBtn = (k, ym) => `<button class="btn sm ex-mes ${S.exPick === k ? 'on' : ''}" data-act="ex-pick-open" data-k="${k}">${exMesCurto(ym)}</button>`;
  const grade = S.exPick ? (() => {
    const y = S.exPickYear || Number(String(S.exPick === 'from' ? from : to).slice(0, 4));
    const cur = S.exPick === 'from' ? from : to;
    return `<div class="ex-grade">
      <div class="row between"><button class="icon-btn ghost" data-act="ex-pick-year" data-d="-1" aria-label="Ano anterior">‹</button><b class="small">${y}</b><button class="icon-btn ghost" data-act="ex-pick-year" data-d="1" aria-label="Próximo ano">›</button></div>
      <div class="ex-meses">${RB_MONTHS.map((nome, i) => { const v = `${y}-${String(i + 1).padStart(2, '0')}`; return `<button class="ex-m ${v === cur ? 'on' : ''}" data-act="ex-pick-set" data-m="${v}">${nome.slice(0, 3)}</button>`; }).join('')}</div>
    </div>`;
  })() : '';
  EX_METHOD = exMethodMap();
  const fbtn = `<button class="btn sm ${S.exFOpen || exFilterOn() ? 'on' : ''}" data-act="ex-filter-toggle">${icon('search')} Filtrar${exFilterOn() ? ' · ativo' : ''}</button>`;
  const controls = `<div class="ex-controls">
      <div class="ex-faixa">
        <span class="small muted">De</span>${mesBtn('from', from)}
        <span class="small muted">até</span>${mesBtn('to', to)}
        <span class="ex-sep"></span>
        <div class="seg ex-presets">
          <button data-act="ex-preset" data-p="1">Este mês</button>
          <button data-act="ex-preset" data-p="3">Últimos 3</button>
          <button data-act="ex-preset" data-p="6">Últimos 6</button>
          <button data-act="ex-preset" data-p="all">Tudo</button>
        </div>
      </div>
      ${grade}
      ${S.exFOpen || exFilterOn() ? exFilterHTML() : ''}
      <div class="row" style="justify-content:flex-end">${fbtn}</div>
    </div>`;

  // mês atual (ou o mais recente) aberto; os outros fechados, com o resumo na mesma linha, alinhado em colunas
  const aberto = (ym) => (S.exOpenM && ym in S.exOpenM) ? S.exOpenM[ym] : ym === (existing.includes(now) ? now : existing[0]);
  const cel = (lab, val, cls = '', tip = '') => `<span class="ex-mc ${cls}" ${tip ? `data-tip="${esc(tip)}"` : ''}><span class="ex-ml">${lab}</span><span class="ex-mv">${val}</span></span>`;
  const block = (ym) => {
    const t = exMonthTotals(ym), op = aberto(ym);
    const saldo = t.inPrev - t.outPrev, real = t.inDone - t.outDone;
    return `<section class="ex-month ${op ? 'open' : ''}">
      <div class="ex-month-h" data-act="ex-toggle" data-m="${ym}" role="button" tabindex="0" aria-expanded="${op}">
        <span class="ex-mt">${icon(op ? 'chevD' : 'chevR')}<b>${rbLabel(ym).toUpperCase()}</b></span>
        ${cel('Entradas', fmtMoney(t.inPrev) || 'R$ 0,00', 'in', 'Tudo que entra no mês (menos "Não teve")')}
        ${cel('Saídas', fmtMoney(t.outPrev) || 'R$ 0,00', 'out', 'Tudo que sai no mês (menos "Não teve")')}
        ${cel('Saldo do mês', fmtMoney(saldo) || 'R$ 0,00', saldo >= 0 ? 'pos' : 'neg', 'Entradas − Saídas (previsto)')}
        ${cel('Realizado', fmtMoney(real) || 'R$ 0,00', '', 'Só o que já foi recebido menos o que já foi pago')}
        ${cel('Falta pagar', t.outOpen ? fmtMoney(t.outOpen) + (t.outOpenN ? ` <span class="faint small">(${t.outOpenN})</span>` : '') : '—', t.outOpen ? 'neg' : '', 'Saídas com valor definido que ainda não foram pagas')}
      </div>
      ${op ? `<div class="ex-box">${exSectionHTML(ym, 'in')}${exSectionHTML(ym, 'out')}</div>` : ''}
    </section>`;
  };
  const body = existing.length
    ? existing.map(block).join('')
    : `<div class="empty">${icon('money')}<b>Nenhum mês nesse intervalo</b><span>Escolha outro período acima.</span></div>`;
  const createBtn = missing ? `<div class="ex-missing"><span class="small muted">${rbLabel(missing)} ainda não existe.</span> <button class="btn sm" data-act="ex-create" data-m="${missing}">${icon('plus')} Criar ${rbLabel(missing)}</button></div>` : '';

  return {
    title: 'Despesas',
    actions: `<label class="btn sm">${icon('upload')} Importar CSV do Notion<input type="file" accept=".csv,text/csv" hidden data-on="ex-import"></label>`,
    html: `${controls}${createBtn}${body}
      <p class="small faint">Valores sempre positivos: entradas com + e saídas com −. Entradas e Saídas = todas as linhas exceto "Não teve"; Saldo do mês = Entradas − Saídas. Realizado = só o que já foi recebido ou pago. Clique no mês para abrir ou fechar.</p>`
  };
};

/* Linha que existe nas duas tabelas (ex.: Dentista em Reembolsos e em Despesas, mesmo mês e mesmo nome):
   pago de um lado vira pago do outro, com a mesma data; valor que só um lado tem passa para o outro. */
function exReembSync() {
  if (!db.loaded || typeof rbStatusId !== 'function') return;
  const pagoId = rbStatusId('reimb_pay', 'Pago'); if (!pagoId) return;
  const nome = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  db.all('tempo_reimb_rows').forEach(r => {
    if (!r.name) return;
    const e = db.all('tempo_expenses').find(x => x.kind === 'out' && x.month === r.month && nome(x.name) === nome(r.name)); if (!e) return;
    const rPago = r.pay_id === pagoId || !!r.paid_on, ePago = e.status === EX_DONE.out;
    const ue = {}, ur = {};
    if (rPago && !ePago) { ue.status = EX_DONE.out; ue.paid_on = r.paid_on || e.paid_on || null; }
    if (ePago && !rPago) { ur.pay_id = pagoId; ur.paid_on = e.paid_on || null; }
    if (r.paid_on && ePago && !e.paid_on) ue.paid_on = r.paid_on;
    if (e.paid_on && rPago && !r.paid_on) ur.paid_on = e.paid_on;
    if (rPago && r.pay_id !== pagoId) ur.pay_id = pagoId;
    if (r.amount != null && e.amount == null) { ue.amount = Number(r.amount); ue.amount_sug = null; }
    if (e.amount != null && r.amount == null) { ur.amount = Number(e.amount); ur.suggested_amount = null; }
    if (Object.keys(ue).length) db.update('tempo_expenses', e.id, ue, true);
    if (Object.keys(ur).length) db.update('tempo_reimb_rows', r.id, ur, true);
  });
}

/* Valor por dia da semana: ex.: Diarista = R$ 160 por terça → o mês com 5 terças sugere R$ 800.
   Guardado em exPorDia: { "<nome sem acento, minúsculo>": { dow: 0-6 (domingo = 0), valor } }. */
const EX_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const exNomeKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const exPorDiaGeral = (r) => (r && r.kind === 'out' && (db.setting('exPorDia', {}) || {})[exNomeKey(r.name)]) || null;
/* ajuste só desta linha (só este mês): { dow?, valor?, n? } — n = quantas sessões teve de fato */
const exSessaoMes = (r) => (r && (db.setting('exSessaoMes', {}) || {})[r.id]) || null;
const exPorDiaDe = (r) => { const g = exPorDiaGeral(r), o = exSessaoMes(r); if (!g && !(o && o.valor != null)) return null; return { ...(g || {}), ...(o || {}) }; };
const exSessoesN = (r) => { const q = exPorDiaDe(r); if (!q) return 0; return q.n ?? exContaDia(r.month, q.dow); };
const exDatasDia = (ym, dow) => { const [y, m] = ym.split('-').map(Number); const n = new Date(y, m, 0).getDate(); const out = []; for (let d = 1; d <= n; d++) if (new Date(y, m - 1, d).getDay() === dow) out.push(d); return out; };
function exContaDia(ym, dow) { const [y, m] = ym.split('-').map(Number); const n = new Date(y, m, 0).getDate(); let c = 0; for (let d = 1; d <= n; d++) if (new Date(y, m - 1, d).getDay() === dow) c++; return c; }
// ym = mês novo (cópia): só a regra geral; sem ym: a linha, com o ajuste do mês
const exPorDiaValor = (r, ym) => { if (ym) { const g = exPorDiaGeral(r); return g ? Math.round(g.valor * exContaDia(ym, g.dow) * 100) / 100 : null; } const q = exPorDiaDe(r); return q ? Math.round(q.valor * exSessoesN(r) * 100) / 100 : null; };
const exPorDiaTxt = (r) => { const q = exPorDiaDe(r); if (!q) return ''; const n = exSessoesN(r), tot = exContaDia(r.month, q.dow); return `${n}${n !== tot ? ' de ' + tot : ''} ${EX_DIAS[q.dow]}${tot > 1 ? 's' : ''} × ${fmtMoney(q.valor)}`; };
/* linha ainda sem valor confirmado: a sugestão segue a conta do mês */
function exPorDiaSync() {
  const regras = db.setting('exPorDia', {}) || {}; if (!Object.keys(regras).length) return;
  db.all('tempo_expenses').forEach(r => {
    if (r.amount != null || r.status !== EX_OPEN.out) return;
    const v = exPorDiaValor(r); if (v != null && Number(r.amount_sug) !== v) db.update('tempo_expenses', r.id, { amount_sug: v }, true);
  });
}
/* Painel de edição de uma despesa (clique em Abrir na linha, ou botão direito): nome, categoria, anotação
   e cobrança por sessão (dia da semana × valor), que vale para todos os meses dessa despesa. */
function exPorDiaEditar(id) {
  const r = db.get('tempo_expenses', id); if (!r) return;
  const q = exPorDiaDe(r), o = exSessaoMes(r);
  const base = q || { dow: 2, valor: '' };
  const nAtual = q ? exSessoesN(r) : exContaDia(r.month, base.dow);
  const cats = Object.entries(EX_CATS).map(([g, subs]) => `<optgroup label="${g === 'PESSOAL' ? 'Pessoal' : 'Empresa'}">${subs.map(c => `<option value="${g}/${c}" ${r.cat === `${g}/${c}` ? 'selected' : ''}>${c}</option>`).join('')}</optgroup>`).join('');
  const l = openLayer({ html: `<div class="dh"><h2>${esc(r.name || 'Despesa')}</h2><span class="small muted">${rbLabel(r.month)}</span><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db">
      <div class="grid2"><div class="field"><label for="ed-n">Nome</label><input id="ed-n" class="input" value="${esc(r.name || '')}"></div>
      <div class="field"><label for="ed-c">Categoria</label><select id="ed-c" class="input"><option value="">Sem categoria</option>${cats}</select></div></div>
      <div class="field"><label for="ed-o">Anotação (só deste mês)</label><input id="ed-o" class="input" value="${esc(r.note || '')}"></div>
      ${exVinculoHTML(r)}
      ${r.kind === 'out' ? `<label class="check"><input type="checkbox" id="ed-s" ${q ? 'checked' : ''}> Cobrança por sessão (ex.: diarista, psicóloga)</label>
      <div id="ed-sess" ${q ? '' : 'hidden'} class="stack" style="gap:10px">
        <div class="grid2"><div class="field"><label for="ed-d">Dia da semana</label><select id="ed-d" class="input">${EX_DIAS.map((d, k) => `<option value="${k}" ${k === base.dow ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field"><label for="ed-v">Valor por sessão</label><input id="ed-v" class="input mono" type="number" step="0.01" min="0" value="${base.valor}"></div></div>
        <div class="field"><span class="lbl">Sessões neste mês</span><div class="row" style="gap:6px;align-items:center"><button type="button" class="btn sm" data-x="menos" aria-label="Menos uma">−</button><input id="ed-q" class="input mono" type="number" min="0" style="width:70px;text-align:center" value="${nAtual}"><button type="button" class="btn sm" data-x="mais" aria-label="Mais uma">+</button><span class="small muted" id="ed-datas"></span></div></div>
        <div class="field"><span class="lbl">Dia e valor valem para</span><div class="seg"><button type="button" data-x="esc-todos" class="${o && o.valor != null ? '' : 'on'}">Este mês e os próximos</button><button type="button" data-x="esc-mes" class="${o && o.valor != null ? 'on' : ''}">Só este mês</button></div></div>
      </div>
      <span class="hint" id="ed-h"></span>` : ''}
    </div>
    <div class="df"><span class="grow"></span><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="ok">Salvar</button></div>` });
  const $l = (sel) => l.box.querySelector(sel);
  let soMes = !!(o && o.valor != null), qMexeu = !!(o && o.n != null);
  const dica = () => {
    const h = $l('#ed-h'); if (!h) return;
    if (!$l('#ed-s').checked) { h.textContent = ''; return; }
    const dw = Number($l('#ed-d').value), v = Number($l('#ed-v').value) || 0;
    if (!qMexeu) $l('#ed-q').value = exContaDia(r.month, dw);
    const n = Number($l('#ed-q').value) || 0, ds = exDatasDia(r.month, dw);
    $l('#ed-datas').textContent = `${EX_DIAS[dw]}s do mês: ${ds.join(', ')} (${ds.length})`;
    h.textContent = `${rbLabel(r.month)}: ${n} × ${fmtMoney(v) || 'R$ 0,00'} = ${fmtMoney(n * v) || 'R$ 0,00'}.${soMes ? ' Dia e valor só neste mês.' : ' Os próximos meses usam o mesmo dia e valor (com a quantidade de ' + EX_DIAS[dw] + 's de cada mês).'}`;
  };
  l.box.addEventListener('input', (e) => { if (e.target.id === 'ed-q') qMexeu = true; dica(); });
  l.box.addEventListener('change', (e) => { if (e.target.id === 'ed-s') $l('#ed-sess').hidden = !e.target.checked; if (e.target.id === 'ed-d') qMexeu = false; dica(); });
  dica();
  l.box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'menos' || b.dataset.x === 'mais') { const inp = $l('#ed-q'); inp.value = Math.max(0, (Number(inp.value) || 0) + (b.dataset.x === 'mais' ? 1 : -1)); qMexeu = true; return dica(); }
    if (b.dataset.x === 'esc-todos' || b.dataset.x === 'esc-mes') { soMes = b.dataset.x === 'esc-mes'; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); return dica(); }
    if (b.dataset.x !== 'ok') return;
    const nome = $l('#ed-n').value.trim();
    db.update('tempo_expenses', r.id, { name: nome, cat: $l('#ed-c').value || null, note: $l('#ed-o').value.trim() });
    if (r.kind === 'out') {
      const geral = { ...(db.setting('exPorDia', {}) || {}) }, mes = { ...(db.setting('exSessaoMes', {}) || {}) };
      const kOld = exNomeKey(r.name), kNew = exNomeKey(nome);
      if (kOld !== kNew && geral[kOld]) { geral[kNew] = geral[kOld]; delete geral[kOld]; }
      delete mes[r.id];
      if ($l('#ed-s').checked) {
        const v = Number($l('#ed-v').value), dw = Number($l('#ed-d').value), n = Number($l('#ed-q').value);
        if (!v) return toast('Informe o valor por sessão.');
        if (soMes) mes[r.id] = { dow: dw, valor: v, n };
        else { geral[kNew] = { dow: dw, valor: v }; if (n !== exContaDia(r.month, dw)) mes[r.id] = { n }; }
      } else if (!soMes) delete geral[kNew];
      db.setSetting('exPorDia', geral); db.setSetting('exSessaoMes', mes);
      const atual = db.get('tempo_expenses', r.id);
      // valor das sessões fica cinza (sugestão) até ser confirmado ou pago
      if ($l('#ed-s').checked) db.update('tempo_expenses', r.id, atual.status === EX_DONE.out ? { amount: exPorDiaValor(atual), amount_sug: null } : { amount: null, amount_sug: exPorDiaValor(atual) }, true);
      exPorDiaSync();
    }
    l.close(); render();
  });
}
ACTIONS['ex-open'] = (el) => exPorDiaEditar(el.dataset.id);
