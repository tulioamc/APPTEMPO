/* =====================================================================
   DESPESAS (custos pessoais e da empresa)
   Uma tabela por mês, com entradas em cima (+) e saídas embaixo (−).
   O valor é sempre positivo; o sinal vem do tipo da linha.
   Ao começar um mês novo, copia o anterior: mesmo dia de vencimento,
   status "Não pago" / "Não recebido", "Paga em" vazio. Linhas "Não teve"
   não são copiadas; parcelas que terminaram também não.
   ===================================================================== */

const EX_CATS = {
  PESSOAL: ['Moradia', 'Contas da casa', 'Casa e serviços', 'Saúde', 'Educação', 'Cartão e dívidas', 'Renda'],
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

/* Copia um mês para outro. Não copia linhas "Não teve" nem parcelas já encerradas. */
function exCopyMonth(target, src) {
  if (exRows(target).length || !src) return false;
  exRows(src).forEach(r => {
    if (r.status === EX_OFF) return;
    if (r.inst_total && (r.inst_no || 1) >= r.inst_total) return;
    db.insert('tempo_expenses', {
      month: target, kind: r.kind, name: r.name || '', cat: r.cat || '', note: r.note || '', amount: r.amount ?? null,
      due_date: r.due_date ? exDateIn(target, exDayOf(r.due_date)) : null, paid_on: null, status: EX_OPEN[r.kind],
      inst_no: r.inst_total ? (r.inst_no || 1) + 1 : null, inst_total: r.inst_total || null, order: r.order ?? 0
    }, true);
  });
  return true;
}
/* Chamado ao abrir o app: cria os meses que faltam até o atual, copiando o último existente. */
function exEnsureMonths() {
  const now = ymd(new Date()).slice(0, 7);
  const months = exMonths().filter(m => m <= now); if (!months.length) return;
  let cur = months[0], guard = 0, changed = false;
  while (cur < now && guard++ < 24) { const t = rbAddMonth(cur, 1); if (exCopyMonth(t, cur)) changed = true; cur = t; }
  if (changed) db.emit();
}

const exNow = () => ymd(new Date()).slice(0, 7);
/* intervalo mostrado: de (mês inicial) até (mês final), o mais recente em cima */
const exRange = () => { let from = S.exFrom || rbAddMonth(exNow(), -2), to = S.exTo || exNow(); if (from > to) [from, to] = [to, from]; return { from, to }; };
ACTIONS['ex-create'] = (el) => {
  const ym = el.dataset.m;
  const prev = exMonths().find(m => m < ym);
  if (!exCopyMonth(ym, prev)) { exAddRow(ym, 'out'); }
  db.emit(); toast(prev ? `Mês criado a partir de ${rbLabel(prev)}` : 'Mês criado');
};
ACTIONS['ex-preset'] = (el) => {
  const now = exNow(); const m = el.dataset.p;
  if (m === 'all') { const all = exMonths(); S.exFrom = all[all.length - 1] || now; S.exTo = now; }
  else { S.exTo = now; S.exFrom = rbAddMonth(now, -(Number(m) - 1)); }
  render();
};
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
  const done = el.value === EX_DONE[r.kind];
  db.update('tempo_expenses', r.id, { status: el.value, paid_on: done ? (r.paid_on || ymd(new Date())) : (el.value === EX_OFF ? r.paid_on : null) });
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

const exCatOptions = (cur) => `<option value="">Sem categoria</option>` + Object.entries(EX_CATS).map(([main, subs]) =>
  `<optgroup label="${main}">${subs.map(s => { const v = main + '/' + s; return `<option value="${v}" ${v === cur ? 'selected' : ''}>${s}</option>`; }).join('')}</optgroup>`).join('');

/* resumo de um mês: previsto e realizado */
function exMonthTotals(ym) {
  const ins = exRows(ym, 'in'), outs = exRows(ym, 'out');
  const live = (rows) => rows.filter(r => r.status !== EX_OFF);
  return {
    inPrev: exSum(live(ins)), inDone: exSum(ins.filter(r => r.status === EX_DONE.in)),
    outPrev: exSum(live(outs)), outDone: exSum(outs.filter(r => r.status === EX_DONE.out))
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
  db.update('tempo_expenses', r.id, { status: v, paid_on: done ? (r.paid_on || ymd(new Date())) : (v === EX_OFF ? r.paid_on : null) });
}
const EX_COLS = {
  cat: { label: 'Categoria', w: 170, cell: r => { if (!r.cat) return '<span class="faint">—</span>'; const [m, sub] = r.cat.split('/'); return `<span class="faint small">${esc(m)} · </span>${esc(sub || r.cat)}`; }, edit: { type: 'combo', kind: 'ex_cat', allowEmpty: true, emptyLabel: 'Sem categoria', get: r => r.cat, set: (r, v) => db.update('tempo_expenses', r.id, { cat: v || null }) } },
  name: { label: 'Nome', w: 220, cell: r => esc(r.name || '') || '<span class="faint">—</span>', edit: { type: 'text', get: r => r.name, set: (r, v) => db.update('tempo_expenses', r.id, { name: (v || '').trim() }) } },
  due_date: { label: 'Vencimento', w: 120, cell: r => r.due_date ? fmtDate(r.due_date) : '<span class="faint">—</span>', sort: r => r.due_date || '', edit: { type: 'date', get: r => r.due_date, set: (r, v) => db.update('tempo_expenses', r.id, { due_date: v || null }) } },
  amount: { label: 'Valor', money: true, w: 130, cell: r => `<span class="ex-sign">${r.kind === 'in' ? '+' : '−'}</span> ${fmtMoney(r.amount || 0)}`, val: r => (r.status === EX_OFF ? 0 : (r.amount || 0)), edit: { type: 'money', get: r => r.amount, set: (r, v) => db.update('tempo_expenses', r.id, { amount: Math.abs(v || 0) }) } },
  status: { label: 'Status', w: 150, cell: r => { const c = exComboItems(r.kind === 'in' ? 'ex_in' : 'ex_out').find(x => x.id === r.status); return c ? c.html : esc(r.status || ''); }, edit: { type: 'combo', kind: r => r.kind === 'in' ? 'ex_in' : 'ex_out', get: r => r.status, set: (r, v) => exSetStatus(r, v) } },
  paid_on: { label: 'Paga em', w: 120, cell: r => r.paid_on ? fmtDate(r.paid_on) : '<span class="faint">—</span>', sort: r => r.paid_on || '', edit: { type: 'date', get: r => r.paid_on, set: (r, v) => db.update('tempo_expenses', r.id, { paid_on: v || null }) } },
  inst: { label: 'Parcela', w: 90, cell: r => exInstLabel(r) || '<span class="faint">—</span>', edit: { type: 'text', get: r => exInstLabel(r), set: (r, v) => { const m = String(v || '').match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/); db.update('tempo_expenses', r.id, m ? { inst_no: Number(m[1]), inst_total: Number(m[2]) } : { inst_no: null, inst_total: null }); } } },
  note: { label: 'Anotação', w: 240, cell: r => esc(r.note || '') || '<span class="faint">—</span>', edit: { type: 'text', get: r => r.note, set: (r, v) => db.update('tempo_expenses', r.id, { note: (v || '').trim() }) } },
  del: { label: '', w: 44, cell: r => `<button class="icon-btn ghost" data-act="ex-del" data-id="${r.id}" title="Remover linha">×</button>` }
};
function exSectionHTML(ym, kind) {
  const rows = exRows(ym, kind); const total = exSum(rows.filter(r => r.status !== EX_OFF));
  const title = kind === 'in' ? 'Entradas' : 'Saídas';
  return `<div class="ex-sec">
    <div class="ex-sec-h"><b>${title}</b><span class="grow"></span><span class="mono ${kind === 'in' ? 'ex-plus' : 'ex-minus'}">${kind === 'in' ? '+' : '−'} ${fmtMoney(total)}</span></div>
    <div class="panel-b tight">${rows.length ? gridTable({ id: kind === 'in' ? 'ex-in' : 'ex-out', cols: EX_COLS, rows, rowById: (rid) => db.get('tempo_expenses', rid), sortable: false }) : `<div class="faint small" style="padding:10px">${kind === 'in' ? 'Nenhuma entrada' : 'Nenhuma saída'} neste mês.</div>`}</div>
    <div class="row" style="padding:8px 2px"><button class="btn sm ghost" data-act="ex-add" data-kind="${kind}" data-m="${ym}">${icon('plus')} ${kind === 'in' ? 'Entrada' : 'Saída'}</button></div>
  </div>`;
}

VIEWS.expenses = () => {
  const { from, to } = exRange(); S.exFrom = from; S.exTo = to;
  const now = exNow();
  const existing = exMonths().filter(m => m >= from && m <= to); // mais recente primeiro
  const missing = !existing.includes(to) && to <= now ? to : null; // mês final ainda não existe

  const controls = `<div class="ex-controls">
      <label class="ex-pick">De <input class="input" type="month" value="${from}" data-on="ex-range" data-k="from" aria-label="Mês inicial"></label>
      <label class="ex-pick">Até <input class="input" type="month" value="${to}" data-on="ex-range" data-k="to" aria-label="Mês final"></label>
      <div class="seg ex-presets">
        <button data-act="ex-preset" data-p="1">Este mês</button>
        <button data-act="ex-preset" data-p="3">Últimos 3</button>
        <button data-act="ex-preset" data-p="6">Últimos 6</button>
        <button data-act="ex-preset" data-p="all">Tudo</button>
      </div>
    </div>`;

  const block = (ym) => {
    const t = exMonthTotals(ym);
    return `<section class="ex-month">
      <div class="ex-month-h">
        <span class="ex-title">${rbLabel(ym)}</span>
        <span class="small muted">previsto ${fmtMoney0(t.inPrev - t.outPrev)} · realizado ${fmtMoney0(t.inDone - t.outDone)}</span>
      </div>
      ${exSectionHTML(ym, 'in')}${exSectionHTML(ym, 'out')}
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
      <p class="small faint">Valores sempre positivos: entradas com + e saídas com −. Previsto = todas as linhas exceto "Não teve". Realizado = só o que já foi recebido ou pago.</p>`
  };
};
