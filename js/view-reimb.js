/* =====================================================================
   REEMBOLSOS (v2.01)
   Tabela separada dos custos fixos. Uma tabela por mês: no dia 1 o mês
   seguinte é criado sozinho, repetindo as linhas do mês anterior com
   Pagamento "a Pagar", Reembolso "a Pagar", Requerimento "a Fazer" e
   data no dia 10.
   ===================================================================== */

const RB_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const rbLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${RB_MONTHS[m - 1]} de ${y}`; };
const rbAddMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return ymd(d).slice(0, 7); };
const rbStatusId = (kind, name) => statuses(kind).find(s => s.name === name)?.id || null;
const rbRows = (ym) => db.all('tempo_reimb_rows').filter(r => r.month === ym).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const rbMonths = () => [...new Set(db.all('tempo_reimb_rows').map(r => r.month))].sort().reverse();
const rbName = (kind, id) => db.get('tempo_status_options', id)?.name || '';

/* Garante que os status de reembolso existam (dados antigos). */
function ensureStatusKinds() {
  Object.entries(DEFAULT_STATUS).forEach(([kind, list]) => list.forEach(([name, color, category], i) => {
    if (!db.all('tempo_status_options').some(s => s.kind === kind && s.name === name)) db.insert('tempo_status_options', { kind, name, color, category, order: i }, true);
  }));
}

/* Cria a tabela do próximo mês a partir do último existente. */
function rbCreateNextMonth() {
  const months = rbMonths(); if (!months.length) return null;
  const src = months[0], target = rbAddMonth(src, 1);
  if (db.all('tempo_reimb_rows').some(r => r.month === target)) return null;
  rbRows(src).forEach(r => db.insert('tempo_reimb_rows', {
    month: target, name: r.name, note: r.note || '', amount: r.amount ?? null, order: r.order ?? 0,
    date: `${target}-10`, pay_id: rbStatusId('reimb_pay', 'a Pagar'), refund_id: rbStatusId('reimb_refund', 'a Pagar'), req_id: rbStatusId('reimb_req', 'a Fazer')
  }, true));
  db.emit();
  return target;
}
/* Chamado ao abrir o app e de tempos em tempos: cria os meses que faltam até o atual. */
function ensureMonthSheets() {
  const months = rbMonths(); if (!months.length) return;
  const now = ymd(new Date()).slice(0, 7); let guard = 0;
  while (months[0] < now && guard++ < 24) { const t = rbCreateNextMonth(); if (!t) break; months.unshift(t); }
}

ACTIONS['rb-new-month'] = () => { const t = rbCreateNextMonth(); if (!t) return toast('Não há mês anterior para copiar ou o mês já existe.'); S.rbMonth = t; toast(`Tabela de ${rbLabel(t)} criada`); render(); };
ACTIONS['rb-month'] = (el) => { const m = rbMonths(); const cur = S.rbMonth || m[0]; S.rbMonth = rbAddMonth(cur, Number(el.dataset.d)); render(); };
ACTIONS['rb-add'] = (el) => {
  const ym = el.dataset.m || rbMonths()[0]; const order = rbRows(ym).length;
  db.insert('tempo_reimb_rows', { month: ym, name: '', note: '', amount: null, order, date: `${ym}-10`, pay_id: rbStatusId('reimb_pay', 'a Pagar'), refund_id: rbStatusId('reimb_refund', 'a Pagar'), req_id: rbStatusId('reimb_req', 'a Fazer') });
};
ACTIONS['rb-del'] = (el) => { db.remove('tempo_reimb_rows', el.dataset.id); };
CHANGES['rb-field'] = (el) => {
  const k = el.dataset.k; let v = el.dataset.money !== undefined ? moneyVal(el) : el.value;
  if (k === 'name' || k === 'note') v = (v || '').trim();
  db.update('tempo_reimb_rows', el.dataset.id, { [k]: v });
};

/* Importa o CSV exportado do Notion. Mês = mês da coluna Data; linhas sem data seguem o mês anterior. */
const rbISO = (br) => { const m = (br || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const rbMoney = (s) => { const t = (s || '').replace(/[R$\s ]/g, ''); if (!t) return null; const n = Number(t.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
CHANGES['rb-import'] = async (el) => {
  const file = el.files[0]; if (!file) return;
  const { rows } = parseCSV(await file.text());
  const body = rows.map(o => [o['Despesa'], o['Anotação'], o['Data'], o['Pagamento'], o['Reembolso'], o['Requerimento'], o['Valor']]);
  const existing = new Set(db.all('tempo_reimb_rows').map(r => r.month));
  const byMonth = {}; let last = null, unknown = 0, skipped = 0;
  body.forEach((r) => {
    const [name = '', note = '', date = '', pay = '', refund = '', req = '', val = ''] = r;
    if (!name.trim() && !rbMoney(val)) { skipped++; return; }
    const iso = rbISO(date); if (iso) last = iso.slice(0, 7);
    const month = iso ? iso.slice(0, 7) : (last || ymd(new Date()).slice(0, 7));
    const pick = (kind, n) => { const t = (n || '').trim(); if (!t) return null; const id = rbStatusId(kind, t); if (!id) unknown++; return id; };
    (byMonth[month] = byMonth[month] || []).push({ name: name.trim(), note: note.trim(), date: iso || `${month}-10`, amount: rbMoney(val), pay_id: pick('reimb_pay', pay), refund_id: pick('reimb_refund', refund), req_id: pick('reimb_req', req) });
  });
  let n = 0, pulados = [];
  Object.keys(byMonth).sort().forEach(ym => {
    if (existing.has(ym)) { pulados.push(ym); return; }
    byMonth[ym].forEach((r, i) => { db.insert('tempo_reimb_rows', { ...r, month: ym, order: i }, true); n++; });
  });
  db.emit(); el.value = '';
  S.rbMonth = rbMonths()[0];
  toast(`${n} linhas importadas em ${Object.keys(byMonth).length - pulados.length} mês(es)${pulados.length ? `; já existiam: ${pulados.map(rbLabel).join(', ')}` : ''}${unknown ? `; ${unknown} status não reconhecido(s)` : ''}`);
  render();
};

const rbSum = (rows) => rows.reduce((t, r) => t + (Number(r.amount) || 0), 0);
const rbN = (rows) => `${rows.length} linha${rows.length === 1 ? '' : 's'}`;

VIEWS.reimb = () => {
  const all = db.all('tempo_reimb_rows');
  const months = rbMonths();
  const nm = (kind, r) => rbName(kind, r[kind === 'reimb_pay' ? 'pay_id' : kind === 'reimb_refund' ? 'refund_id' : 'req_id']);
  const payOf = (r) => nm('reimb_pay', r), refOf = (r) => nm('reimb_refund', r), reqOf = (r) => nm('reimb_req', r);
  const amt = (r) => Number(r.amount) || 0;

  /* Resumo geral */
  const paid = all.filter(r => payOf(r) === 'Pago');
  const refunded = all.filter(r => refOf(r) === 'Feito!');
  const net = rbSum(paid) - rbSum(refunded);
  const toRefund = all.filter(r => payOf(r) === 'Pago' && !['Feito!', 'Negado'].includes(refOf(r)) && amt(r) > 0);
  const notRequested = all.filter(r => ['a Fazer', 'Falta Nota'].includes(reqOf(r)) && amt(r) > 0);
  const refused = all.filter(r => ['Negado', 'Parcial (Errado)'].includes(refOf(r)));
  const toPayThird = all.filter(r => payOf(r) === 'a Pagar' && amt(r) > 0);
  const li = (txt) => `<li>${txt}</li>`;
  const money = (v) => fmtMoney0(v);

  const summary = all.length ? `
    <div class="kpi-row">
      <div class="kpi"><span class="k">Pago por você (total)</span><b class="v">${money(rbSum(paid))}</b></div>
      <div class="kpi pos"><span class="k">Já reembolsado</span><b class="v">${money(rbSum(refunded))}</b></div>
      <div class="kpi ${net > 0 ? 'neg' : ''}"><span class="k">Saldo líquido (custo real)</span><b class="v">${money(net)}</b></div>
      <div class="kpi"><span class="k">Ainda a reembolsar</span><b class="v">${money(rbSum(toRefund))}</b></div>
    </div>
    <div class="card rb-summary">
      <div class="rb-cols">
        <div><b>Feito</b>
          <ul>${li(`${rbN(refunded)} reembolsada(s), ${money(rbSum(refunded))}`)}${li(`${rbN(paid)} paga(s) por você, ${money(rbSum(paid))}`)}</ul></div>
        <div><b>Falta</b>
          <ul>
            ${notRequested.length ? li(`Requerimento a fazer ou sem nota: ${rbN(notRequested)}, ${money(rbSum(notRequested))}`) : li('Todos os requerimentos estão feitos')}
            ${toRefund.length ? li(`Aguardando reembolso do plano: ${rbN(toRefund)}, ${money(rbSum(toRefund))}`) : ''}
            ${refused.length ? li(`Negados ou pagos errado (refazer): ${rbN(refused)}, ${money(rbSum(refused))}`) : ''}
            ${toPayThird.length ? li(`A pagar a profissionais: ${rbN(toPayThird)}, ${money(rbSum(toPayThird))}`) : ''}
          </ul></div>
      </div>
    </div>` : '';

  const monthBlock = (ym) => {
    const rows = rbRows(ym);
    const total = rbSum(rows), p = rbSum(rows.filter(r => payOf(r) === 'Pago')), rf = rbSum(rows.filter(r => refOf(r) === 'Feito!'));
    const pend = rbSum(rows.filter(r => payOf(r) === 'Pago' && !['Feito!', 'Negado'].includes(refOf(r))));
    const tr = (r) => `<tr>
      <td class="rb-name"><input class="rb-in" value="${esc(r.name || '')}" data-on="rb-field" data-id="${r.id}" data-k="name"></td>
      <td><input class="rb-in" type="date" value="${r.date || ''}" data-on="rb-field" data-id="${r.id}" data-k="date"></td>
      <td>${comboBtn('reimb_pay', r.pay_id, 'rb-pay', r.id)}</td>
      <td>${comboBtn('reimb_req', r.req_id, 'rb-req', r.id)}</td>
      <td class="num"><input class="rb-in num" ${moneyAttrs(r.amount)} data-on="rb-field" data-id="${r.id}" data-k="amount"></td>
      <td>${comboBtn('reimb_refund', r.refund_id, 'rb-refund', r.id)}</td>
      <td><input class="rb-in" value="${esc(r.note || '')}" data-on="rb-field" data-id="${r.id}" data-k="note"></td>
      <td><button class="icon-btn ghost" data-act="rb-del" data-id="${r.id}" title="Remover linha">×</button></td>
    </tr>`;
    return `<details class="rb-month" open>
      <summary><span class="rb-mt">${rbLabel(ym)}</span><span class="rb-mtot">${money(total)}</span><span class="small muted">pago ${money(p)} · reembolsado ${money(rf)} · pendente ${money(pend)}</span></summary>
      <div class="card rb-table-wrap"><table class="rb-table">
        <thead><tr><th>Despesa</th><th>Data</th><th>Pagamento</th><th>Requerimento</th><th class="num">Valor</th><th>Reembolso</th><th>Anotação</th><th></th></tr></thead>
        <tbody>${rows.map(tr).join('') || `<tr><td colspan="8" class="faint">Sem linhas neste mês.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="4">Total do mês</td><td class="num"><b>${money(total)}</b></td><td colspan="3"><button class="btn sm ghost" data-act="rb-add" data-m="${ym}">${icon('plus')} Linha</button></td></tr></tfoot>
      </table></div></details>`;
  };

  const html = `${summary}
    ${months.map(monthBlock).join('') || '<div class="empty">' + icon('layers') + '<b>Nenhum reembolso cadastrado</b><span>Importe o CSV do Notion ou comece pelo botão Linha.</span></div>'}
    <p class="small faint">Pago por você = Pagamento "Pago". Já reembolsado = Reembolso "Feito!". Saldo líquido = pago − reembolsado. Negados não entram em "ainda a reembolsar".</p>`;
  return {
    title: 'Reembolsos',
    actions: `<label class="btn sm">${icon('upload')} Importar CSV do Notion<input type="file" accept=".csv,text/csv" hidden data-on="rb-import"></label><button class="btn sm primary" data-act="rb-new-month">${icon('plus')} Novo mês</button>`,
    html
  };
};
