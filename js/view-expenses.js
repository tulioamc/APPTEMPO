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
function exSectionHTML(ym, kind) {
  const rows = exRows(ym, kind); const total = exSum(rows.filter(r => r.status !== EX_OFF));
  const title = kind === 'in' ? 'Entradas' : 'Saídas';
  return `<div class="ex-sec">
    <div class="ex-sec-h"><b>${title}</b><span class="grow"></span><span class="mono ${kind === 'in' ? 'ex-plus' : 'ex-minus'}">${kind === 'in' ? '+' : '−'} ${fmtMoney(total)}</span></div>
    <div class="card rb-table-wrap"><table class="rb-table ex-table"><colgroup><col style="width:15%"><col style="width:16%"><col style="width:11%"><col style="width:14%"><col style="width:15%"><col style="width:11%"><col style="width:7%"><col><col style="width:44px"></colgroup>
      <thead><tr><th>Categoria</th><th>Nome</th><th>Vencimento</th><th class="num">Valor</th><th>Status</th><th>Paga em</th><th>Parcela</th><th>Anotação</th><th></th></tr></thead>
      <tbody>${rows.map(exRowHTML).join('') || `<tr><td colspan="9" class="faint">${kind === 'in' ? 'Nenhuma entrada' : 'Nenhuma saída'} neste mês.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="8"><button class="btn sm ghost" data-act="ex-add" data-kind="${kind}" data-m="${ym}">${icon('plus')} ${kind === 'in' ? 'Entrada' : 'Saída'}</button></td><td></td></tr></tfoot>
    </table></div></div>`;
}
function exRowHTML(r) {
  const sign = r.kind === 'in' ? '+' : '−';
  return `<tr class="${r.status === EX_OFF ? 'ex-off' : ''}">
    <td><select class="rb-in" data-on="ex-field" data-id="${r.id}" data-k="cat" aria-label="Categoria">${exCatOptions(r.cat)}</select></td>
    <td><input class="rb-in" value="${esc(r.name || '')}" data-on="ex-field" data-id="${r.id}" data-k="name" aria-label="Nome"></td>
    <td><input class="rb-in" type="date" value="${r.due_date || ''}" data-on="ex-field" data-id="${r.id}" data-k="due_date" aria-label="Vencimento"></td>
    <td class="num"><span class="ex-sign">${sign}</span><input class="rb-in num" ${moneyAttrs(r.amount)} data-on="ex-field" data-id="${r.id}" data-k="amount" aria-label="Valor"></td>
    <td><select class="rb-in" data-on="ex-status" data-id="${r.id}" aria-label="Status">${EX_STATUS[r.kind].map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><input class="rb-in" type="date" value="${r.paid_on || ''}" data-on="ex-field" data-id="${r.id}" data-k="paid_on" aria-label="Paga em"></td>
    <td><input class="rb-in" value="${exInstLabel(r)}" placeholder="—" data-on="ex-field" data-id="${r.id}" data-k="inst" aria-label="Parcela"></td>
    <td><input class="rb-in" value="${esc(r.note || '')}" data-on="ex-field" data-id="${r.id}" data-k="note" aria-label="Anotação"></td>
    <td><button class="icon-btn ghost" data-act="ex-del" data-id="${r.id}" title="Remover linha">×</button></td>
  </tr>`;
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
