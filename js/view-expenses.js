/* =====================================================================
   DESPESAS (custos pessoais e da empresa)
   Uma tabela por mês, com entradas em cima (+) e saídas embaixo (−).
   O valor é sempre positivo; o sinal vem do tipo da linha.
   Ao começar um mês novo, copia o anterior: mesmo dia de vencimento,
   status "Não pago" / "Não recebido", "Paga em" vazio. Linhas "Não teve"
   não são copiadas; parcelas que terminaram também não.
   ===================================================================== */

const EX_CATS = {
  PESSOAL: ['Moradia', 'Contas da casa', 'Casa e serviços', 'Saúde', 'Educação', 'Cartão e dívidas', 'Renda', 'Filho'],
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

const exMesCurto = (ym) => { const [y, m] = ym.split('-').map(Number); return `${RB_MONTHS[m - 1]} ${y}`; };
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
  cat: { label: 'Categoria', ico: 'layers', w: 170, cell: r => r.cat ? exCatTags(r.cat) : '<span class="faint">—</span>', edit: { type: 'combo', kind: 'ex_cat', allowEmpty: true, emptyLabel: 'Sem categoria', get: r => r.cat, set: (r, v) => db.update('tempo_expenses', r.id, { cat: v || null }) } },
  name: { label: 'Nome', ico: 'text', cls: 'name', sort: r => r.name || '', w: 220, cell: r => esc(r.name || '') || '<span class="faint">—</span>', edit: { type: 'text', get: r => r.name, set: (r, v) => db.update('tempo_expenses', r.id, { name: (v || '').trim() }) } },
  due_date: { label: 'Vencimento', ico: 'cal', w: 120, cell: r => r.due_date ? fmtDate(r.due_date) : '<span class="faint">—</span>', sort: r => r.due_date || '', edit: { type: 'date', get: r => r.due_date, set: (r, v) => db.update('tempo_expenses', r.id, { due_date: v || null }) } },
  amount: { label: 'Valor', ico: 'money', sort: r => r.amount || 0, money: true, w: 130, cell: r => `<span class="ex-sign">${r.kind === 'in' ? '+' : '−'}</span> ${fmtMoney(r.amount || 0)}`, val: r => (r.status === EX_OFF ? 0 : (r.amount || 0)), edit: { type: 'money', get: r => r.amount, set: (r, v) => db.update('tempo_expenses', r.id, { amount: Math.abs(v || 0) }) } },
  status: { label: 'Status', ico: 'spin', w: 150, cell: r => { const c = exComboItems(r.kind === 'in' ? 'ex_in' : 'ex_out').find(x => x.id === r.status); return c ? c.html : esc(r.status || ''); }, edit: { type: 'combo', kind: r => r.kind === 'in' ? 'ex_in' : 'ex_out', get: r => r.status, set: (r, v) => exSetStatus(r, v) } },
  paid_on: { label: 'Paga em', ico: 'cal', w: 120, cell: r => r.paid_on ? fmtDate(r.paid_on) : '<span class="faint">—</span>', sort: r => r.paid_on || '', edit: { type: 'date', get: r => r.paid_on, set: (r, v) => db.update('tempo_expenses', r.id, { paid_on: v || null }) } },
  inst: { label: 'Parcela', ico: 'hash', w: 90, cell: r => exInstLabel(r) || '<span class="faint">—</span>', edit: { type: 'text', get: r => exInstLabel(r), set: (r, v) => { const m = String(v || '').match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/); db.update('tempo_expenses', r.id, m ? { inst_no: Number(m[1]), inst_total: Number(m[2]) } : { inst_no: null, inst_total: null }); } } },
  note: { label: 'Anotação', ico: 'text', w: 240, cell: r => esc(r.note || '') || '<span class="faint">—</span>', edit: { type: 'text', get: r => r.note, set: (r, v) => db.update('tempo_expenses', r.id, { note: (v || '').trim() }) } },
  del: { label: '', w: 44, cell: r => `<button class="icon-btn ghost" data-act="ex-del" data-id="${r.id}" title="Remover linha">×</button>` }
};
/* Categoria em etiquetas: [PF] [Renda]. PF roxo, PJ amarelo. Entradas em cores frias, saídas em cores quentes. Clique para mudar a cor. */
const EX_IN_CATS = ['PESSOAL/Renda', 'EMPRESA/Freelas'];
const EX_GROUP_LABEL = { PESSOAL: 'PF', EMPRESA: 'PJ' };
const EX_GROUP_DEF = { PESSOAL: '#D6C1F2', EMPRESA: '#F4DE8C' };
const exDefColor = (key) => EX_GROUP_DEF[key] || (EX_IN_CATS.includes(key) ? '#AFCBF3' : '#F7C6A0');
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
const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  if (f.q && !norm(r.name).includes(norm(f.q))) return false;
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
    <div class="field"><label for="exf-q">Nome</label><input id="exf-q" class="input" value="${esc(f.q || '')}" placeholder="Buscar por nome" data-input="ex-f" data-k="q"></div>
    <div class="field"><label for="exf-cat">Categoria</label><select id="exf-cat" class="input" data-on="ex-f" data-k="cat"><option value="">Todas</option>${cats.map(c => `<option value="${esc(c)}" ${f.cat === c ? 'selected' : ''}>${esc(c.replace('/', ' › '))}</option>`).join('')}</select></div>
    <div class="field"><label for="exf-st">Status</label><select id="exf-st" class="input" data-on="ex-f" data-k="st"><option value="">Todos</option>${[...new Set([...EX_STATUS.out, ...EX_STATUS.in])].map(x => `<option value="${esc(x)}" ${f.st === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label for="exf-meth">Meio</label><select id="exf-meth" class="input" data-on="ex-f" data-k="meth"><option value="">Todos</option>${[...METHODS, '—'].map(x => `<option value="${x}" ${f.meth === x ? 'selected' : ''}>${x === '—' ? 'Sem vínculo' : x}</option>`).join('')}</select></div>
    <div class="field"><label for="exf-min">Valor mínimo</label><input id="exf-min" class="input" type="number" min="0" value="${esc(f.min || '')}" data-input="ex-f" data-k="min"></div>
    <div class="field"><label for="exf-max">Valor máximo</label><input id="exf-max" class="input" type="number" min="0" value="${esc(f.max || '')}" data-input="ex-f" data-k="max"></div>
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
    <div class="panel-b tight">${rows.length ? gridTable({ id: kind === 'in' ? 'ex-in' : 'ex-out', group: 'ex', cols: EX_COLS, rows, rowById: (rid) => db.get('tempo_expenses', rid) }) : `<div class="faint small" style="padding:10px">${kind === 'in' ? 'Nenhuma entrada' : 'Nenhuma saída'} neste mês.</div>`}</div>
    <div class="row" style="padding:8px 2px"><button class="btn sm ghost" data-act="ex-add" data-kind="${kind}" data-m="${ym}">${icon('plus')} ${kind === 'in' ? 'Entrada' : 'Saída'}</button></div>
  </div>`;
}

VIEWS.expenses = () => {
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

  const block = (ym) => {
    const t = exMonthTotals(ym);
    return `<section class="ex-month">
      <div class="ex-month-h">
        <span class="ex-title">${rbLabel(ym)}</span>
        <span class="small muted">previsto ${fmtMoney0(t.inPrev - t.outPrev)} · realizado ${fmtMoney0(t.inDone - t.outDone)}</span>
      </div>
      <div class="ex-box">${exSectionHTML(ym, 'in')}${exSectionHTML(ym, 'out')}</div>
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
