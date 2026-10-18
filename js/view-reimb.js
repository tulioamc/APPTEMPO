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
ACTIONS['rb-filter'] = (el) => { S.rbFilter = el.dataset.f; render(); };
ACTIONS['rb-month'] = (el) => { const m = rbMonths(); const cur = S.rbMonth || m[0]; S.rbMonth = rbAddMonth(cur, Number(el.dataset.d)); render(); };
ACTIONS['rb-add'] = (el) => {
  const ym = el.dataset.m || rbMonths()[0]; const order = rbRows(ym).length;
  db.insert('tempo_reimb_rows', { month: ym, name: '', note: '', amount: null, order, date: `${ym}-10`, pay_id: rbStatusId('reimb_pay', 'a Pagar'), refund_id: rbStatusId('reimb_refund', 'a Pagar'), req_id: rbStatusId('reimb_req', 'a Fazer') });
};
ACTIONS['rb-del'] = (el) => { db.remove('tempo_reimb_rows', el.dataset.id); };
CHANGES['rb-field'] = (el) => {
  const k = el.dataset.k; let v = el.dataset.money !== undefined ? moneyVal(el) : el.value;
  if (k === 'name' || k === 'note') v = (v || '').trim();
  if (k === 'date') { const iso = parseDataBR(v); if (!iso && String(v).trim()) { toast('Use a data dd/mm/aaaa.'); return render(); } v = iso || null; }
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
    const notRequested = all.filter(r => ['a Fazer', 'Falta Nota'].includes(reqOf(r)) && amt(r) > 0);
  const refused = all.filter(r => ['Negado', 'Parcial (Errado)'].includes(refOf(r)));
  const toPayThird = all.filter(r => payOf(r) === 'a Pagar' && amt(r) > 0);
  const li = (txt) => `<li>${txt}</li>`;
  const money = (v) => fmtMoney0(v);

  /* Filtros de pendência (clicáveis): filtram as linhas das tabelas */
  const now = ymd(new Date()).slice(0, 7);
  /* Três etapas, cada linha em uma só: pagar -> requerer -> receber (depois do Feito!/Negado, sai da lista) */
  const etapa = (r) => {
    if (amt(r) <= 0) return null;
    if (payOf(r) !== 'Pago') return 'pagar';
    if (reqOf(r) !== 'Feito') return 'requerer';
    if (!['Feito!', 'Negado'].includes(refOf(r))) return 'receber';
    return null;
  };
  const FILTERS = {
    all: { label: 'Tudo', test: () => true },
    pagar: { label: 'Falta você pagar', test: r => etapa(r) === 'pagar' },
    requer: { label: 'Falta você requerer', test: r => etapa(r) === 'requerer' },
    receber: { label: 'Falta você receber', test: r => etapa(r) === 'receber' },
    refazer: { label: 'Negado / refazer', test: r => ['Negado', 'Parcial (Errado)'].includes(refOf(r)) }
  };
  const f = FILTERS[S.rbFilter] ? S.rbFilter : 'all'; S.rbFilter = f;
  const countOf = (k) => { const rs = all.filter(FILTERS[k].test); return `${rbN(rs)} · ${money(rbSum(rs))}`; };

  /* Média mensal dos últimos 6 meses fechados (o mês atual ainda não conta) */
  const closed = months.filter(m => m < now).slice(0, 6);
  const monthPaid = (m) => rbSum(rbRows(m).filter(r => payOf(r) === 'Pago'));
  const monthRef = (m) => rbSum(rbRows(m).filter(r => refOf(r) === 'Feito!'));
  const avgPaid = closed.length ? closed.reduce((t, m) => t + monthPaid(m), 0) / closed.length : 0;
  const avgNet = closed.length ? closed.reduce((t, m) => t + monthPaid(m) - monthRef(m), 0) / closed.length : 0;

  const summary = all.length ? `
    <div class="rb-top">
      <div class="rb-etapas">
        ${[['pagar', 'Falta você pagar'], ['requer', 'Falta você requerer'], ['receber', 'Falta você receber']].map(([k, lab]) => { const rs = all.filter(FILTERS[k].test); return `<button class="card rb-etapa ${f === k ? 'on' : ''}" data-act="rb-filter" data-f="${k}"><span class="k">${lab}</span><b class="v">${money(rbSum(rs))}</b><span class="small muted">${rbN(rs)}</span></button>`; }).join('')}
      </div>
      <div class="card rb-avg">
        <span class="k">Média mensal · últimos ${closed.length} ${closed.length === 1 ? 'mês fechado' : 'meses fechados'}</span>
        <b class="v">${money(avgPaid)}</b>
        <span class="small muted">pago por você · custo líquido ${money(avgNet)}/mês</span>
      </div>
      <div class="rb-side">
        <div class="card rb-mini"><span>Pago por você (total)</span><b>${money(rbSum(paid))}</b></div>
        <div class="card rb-mini"><span>Já reembolsado</span><b>${money(rbSum(refunded))}</b></div>
        <div class="card rb-mini"><span>Saldo líquido</span><b>${money(net)}</b></div>
      </div>
    </div>
    <div class="seg rb-filters" role="group" aria-label="Filtrar pendências">
      ${Object.keys(FILTERS).map(k => `<button class="${f === k ? 'on' : ''}" data-act="rb-filter" data-f="${k}">${FILTERS[k].label}${k === 'all' ? '' : ` <span class="faint">${countOf(k)}</span>`}</button>`).join('')}
    </div>` : '';

  const monthBlock = (ym) => {
    const all_rows = rbRows(ym); const rows = all_rows.filter(FILTERS[f].test);
    if (f !== 'all' && !rows.length) return '';
    const total = rbSum(all_rows), p = rbSum(all_rows.filter(r => payOf(r) === 'Pago')), rf = rbSum(all_rows.filter(r => refOf(r) === 'Feito!'));
    const pend = rbSum(all_rows.filter(r => payOf(r) === 'Pago' && !['Feito!', 'Negado'].includes(refOf(r))));
    return `<details class="rb-month" open>
      <summary><span class="rb-mt">${rbLabel(ym)}</span><span class="rb-mtot">${money(total)}</span><span class="small muted">pago ${money(p)} · reembolsado ${money(rf)} · pendente ${money(pend)}</span></summary>
      <div class="panel-b tight">${rows.length ? gridTable({ id: 'reimb', cols: RB_COLS, rows, rowById: (rid) => db.get('tempo_reimb_rows', rid) }) : '<div class="faint small" style="padding:10px">Sem linhas neste mês.</div>'}</div>
      <div class="row" style="padding:8px 2px"><button class="btn sm ghost" data-act="rb-add" data-m="${ym}">${icon('plus')} Linha</button></div>
    </details>`;
  };

  const html = `${summary}
    ${f !== 'all' && months.every(m => !rbRows(m).some(FILTERS[f].test)) ? '<div class="empty">' + icon('check') + '<b>Nada nesse filtro</b><span>Tudo resolvido por aqui.</span></div>' : ''}${months.map(monthBlock).join('') || '<div class="empty">' + icon('layers') + '<b>Nenhum reembolso cadastrado</b><span>Importe o CSV do Notion ou comece pelo botão Linha.</span></div>'}
    <p class="small faint">Pago por você = Pagamento "Pago". Já reembolsado = Reembolso "Feito!". Saldo líquido = pago − reembolsado. Negados não entram em "ainda a reembolsar".</p>`;
  return {
    title: 'Reembolsos',
    actions: `<label class="btn sm">${icon('upload')} Importar CSV do Notion<input type="file" accept=".csv,text/csv" hidden data-on="rb-import"></label><button class="btn sm primary" data-act="rb-new-month">${icon('plus')} Novo mês</button>`,
    html
  };
};

/* colunas da tabela de reembolsos (mesmo componente da lista de Freelas) */
const rbTagOf = (kind, id) => { const st = statuses(kind).find(x => x.id === id); return st ? tag(st.name, st.color, { pill: true }) : '<span class="faint">—</span>'; };
const RB_COLS = {
  name: { label: 'Despesa', w: 230, cell: r => esc(r.name || '') || '<span class="faint">—</span>', edit: { type: 'text', get: r => r.name, set: (r, v) => db.update('tempo_reimb_rows', r.id, { name: (v || '').trim() }) } },
  date: { label: 'Data', w: 110, cell: r => r.date ? fmtDate(r.date) : '<span class="faint">—</span>', sort: r => r.date || '', edit: { type: 'date', get: r => r.date, set: (r, v) => db.update('tempo_reimb_rows', r.id, { date: v || null }) } },
  pay: { label: 'Pagamento', w: 130, cell: r => rbTagOf('reimb_pay', r.pay_id), edit: { type: 'combo', kind: 'reimb_pay', get: r => r.pay_id, set: (r, v) => db.update('tempo_reimb_rows', r.id, { pay_id: v }) } },
  req: { label: 'Requerimento', w: 170, cell: r => rbTagOf('reimb_req', r.req_id), edit: { type: 'combo', kind: 'reimb_req', get: r => r.req_id, set: (r, v) => db.update('tempo_reimb_rows', r.id, { req_id: v }) } },
  amount: { label: 'Valor', money: true, w: 120, cell: r => r.amount ? fmtMoney(r.amount) : '<span class="faint">—</span>', val: r => r.amount || 0, edit: { type: 'money', get: r => r.amount, set: (r, v) => db.update('tempo_reimb_rows', r.id, { amount: v ?? null }) } },
  refund: { label: 'Reembolso', w: 150, cell: r => rbTagOf('reimb_refund', r.refund_id), edit: { type: 'combo', kind: 'reimb_refund', get: r => r.refund_id, set: (r, v) => db.update('tempo_reimb_rows', r.id, { refund_id: v }) } },
  note: { label: 'Anotação', w: 240, cell: r => esc(r.note || '') || '<span class="faint">—</span>', edit: { type: 'text', get: r => r.note, set: (r, v) => db.update('tempo_reimb_rows', r.id, { note: (v || '').trim() }) } },
  del: { label: '', w: 44, cell: r => `<button class="icon-btn ghost" data-act="rb-del" data-id="${r.id}" title="Remover linha">×</button>` }
};
