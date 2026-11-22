/* =====================================================================
   EXTRATOS BANCÁRIOS (Gmail → Nubank). Lançamentos vêm de tempo_bank_txns,
   separados por entidade (pf / pj) e marcados "novo" até você revisar.
   ===================================================================== */
const BANK = { status: null, txns: { pf: [], pj: [] }, all: { pf: [], pj: [] }, month: null, mode: { pf: 'novo', pj: 'novo' }, busy: false, checkedAt: 0, msg: '' };
async function bankToken() {
  const { data } = await db.adapter.client.auth.getSession();
  return data && data.session ? data.session.access_token : null;
}
async function bankApi(path, opts = {}) {
  const token = await bankToken();
  const r = await fetch('/api/gmail/' + path, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('falha ' + r.status));
  return j;
}
// Busca todas as linhas em páginas: o servidor corta cada resposta em 1000 linhas, então um limite fixo escondia os meses mais antigos.
async function bankFetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function bankLoadRaw() {
  const cl = db.adapter.client;
  const sorted = (q) => q.order('posted_on', { ascending: false }).order('id');
  for (const entity of ['pf', 'pj']) {
    BANK.txns[entity] = await bankFetchAll(() => sorted(cl.from('tempo_bank_txns').select('*').eq('entity', entity).eq('review_status', BANK.mode[entity])));
  }
  // resumo: lançamento conta para PJ se marcado como PJ, senão para a conta de origem
  const every = await bankFetchAll(() => sorted(cl.from('tempo_bank_txns').select('*')));
  for (const e of ['pf', 'pj']) BANK.all[e] = every.filter(t => (t.biz_entity || t.entity) === e);
  BANK.every = every;
  BANK.learned = bankBuildLearned(every);
  BANK.links = await bankFetchAll(() => cl.from('tempo_bank_reimb_links').select('*').order('reimb_row_id'));
  BANK.plinks = await bankFetchAll(() => cl.from('tempo_bank_payment_links').select('*').order('txn_id'));
  bankSyncIncomeRows();
}
// Pagamentos às terapeutas e à dentista ligam sozinhos à linha da tabela de terapias do mesmo mês (pelo nome).
const bankFamily = (name) => {
  const n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(\d+\)/g, '').replace(/^dra\.?\s+/, '').trim();
  if (/^patricia/.test(n) || /psicomotricidade|psicomotrocidade/.test(n)) return 'patricia';
  if (/^(claudiane|clau)(\s|$)/.test(n)) return 'claudiane';
  if (/^at$/.test(n) || /sarah egiza/.test(n)) return 'at';
  if (/^adelia/.test(n)) return 'adelia';
  if (/^aloma/.test(n)) return 'aloma';
  if (/^raquel/.test(n)) return 'raquel';
  if (/^homero/.test(n)) return 'homero';
  if (/^dentista/.test(n)) return 'dentista';
  return null;
};
async function bankAutoTherapy() {
  const every = BANK.every || [];
  const taken = new Set(every.map(x => x.reimb_row_id).filter(Boolean));
  const rows = db.all('tempo_reimb_rows');
  const todo = [];
  every.forEach(t => {
    if (t.flow !== 'out' || t.scope === 'interna' || t.reimb_row_id || t.expense_id) return;
    const fam = bankFamily(t.counterpart || t.memo); if (!fam) return;
    const ym = (t.posted_on || '').slice(0, 7), amt = Math.abs(Number(t.amount));
    const c = rows.filter(r => r.month === ym && !taken.has(r.id) && bankFamily(r.name) === fam);
    if (!c.length) {
      // Pagamento de terapia sem linha no mês: cria a linha já com a data paga.
      const n = rows.filter(r => r.month === ym).length;
      const row = db.insert('tempo_reimb_rows', { month: ym, name: t.counterpart, note: '', amount: amt, date: null, paid_on: t.posted_on, order: n,
        pay_id: rbStatusId('reimb_pay', 'Pago'), refund_id: rbStatusId('reimb_refund', 'a Pagar'), req_id: rbStatusId('reimb_req', 'a Fazer') });
      rows.push(row); taken.add(row.id);
      todo.push({ id: t.id, rowId: row.id, created: row.id });
      return;
    }
    const best = c.slice().sort((a, b) => Math.abs(Number(a.amount) - amt) - Math.abs(Number(b.amount) - amt))[0];
    taken.add(best.id);
    // O extrato vale: valor e data pagos vêm do banco.
    const diffs = {};
    if (best.paid_on !== t.posted_on) diffs.paid_on = t.posted_on;
    if (Math.abs(Number(best.amount) - amt) > 0.005) diffs.amount = amt;
    if (rbStatusId('reimb_pay', 'Pago') && best.pay_id !== rbStatusId('reimb_pay', 'Pago')) diffs.pay_id = rbStatusId('reimb_pay', 'Pago');
    if (Object.keys(diffs).length) db.update('tempo_reimb_rows', best.id, diffs);
    todo.push({ id: t.id, rowId: best.id });
  });
  if (!todo.length) return false;
  const cl = db.adapter.client;
  for (let i = 0; i < todo.length; i++) {
    const x = todo[i];
    const { error } = await cl.from('tempo_bank_txns').update({ reimb_row_id: x.rowId, category: 'Terapia', updated_at: new Date().toISOString() }).eq('id', x.id);
    if (error) { toast('Erro: ' + error.message); todo.slice(i).forEach(y => { if (y.created) db.remove('tempo_reimb_rows', y.created, true); }); break; }
  }
  return true;
}
// Guarda, por contraparte, se a categoria veio do app (sugestão) ou foi escolhida por você.
function bankMarkCats(cps, cat, auto) {
  const map = { ...db.setting('bankAutoCat', {}) };
  cps.forEach(cp => { if (auto) map[cp] = cat; else delete map[cp]; });
  db.setSetting('bankAutoCat', map);
}
// Reembolso recebido pode cobrir várias terapias: cada linha de terapia liga a um lançamento (tempo_bank_reimb_links).
const bankLinksOf = (txnId) => (BANK.links || []).filter(l => l.txn_id === txnId).map(l => l.reimb_row_id);
// Linhas de terapia já ligadas a um reembolso recebido. Pagamento à terapeuta não ocupa a linha.
const bankTakenRows = () => new Set((BANK.links || []).map(l => l.reimb_row_id).filter(Boolean));
// Conjunto de linhas cuja soma é exatamente o valor (em centavos). Candidatas na ordem dada (mês atual primeiro).
function bankSubsetFor(cands, target) {
  const reach = new Map([[0, []]]);
  for (const r of cands) {
    const c = Math.round(Number(r.amount) * 100);
    for (const [sum, ids] of [...reach.entries()]) {
      const ns = sum + c;
      if (ns <= target && !reach.has(ns)) reach.set(ns, [...ids, r.id]);
    }
    if (reach.has(target)) break;
  }
  return reach.get(target) || null;
}
const bankSkipKey = 'bankReimbSkip';
// Lançamento de reembolso de terapia liga sozinho às linhas cuja soma é exatamente o valor recebido.
async function bankAutoReimb() {
  const skip = db.setting(bankSkipKey, {});
  const taken = bankTakenRows();
  const rows = db.all('tempo_reimb_rows');
  const todo = [];
  (BANK.every || []).forEach(t => {
    if (t.flow !== 'in' || !isReembTer(t.category) || skip[t.id] || bankLinksOf(t.id).length) return;
    const months = bankReimbMonths(t);
    const cands = rows.filter(r => months.includes(r.month) && !taken.has(r.id) && Number(r.amount) > 0)
      .sort((a, b) => (b.month === months[0] ? 1 : 0) - (a.month === months[0] ? 1 : 0) || Number(b.amount) - Number(a.amount)).slice(0, 30);
    if (!cands.length) return;
    const ids = bankSubsetFor(cands, Math.round(Math.abs(Number(t.amount)) * 100));
    if (!ids || !ids.length) return;
    ids.forEach(id => taken.add(id));
    todo.push({ txn: t.id, ids });
  });
  if (!todo.length) return false;
  const cl = db.adapter.client;
  for (const x of todo) {
    const { error } = await cl.from('tempo_bank_reimb_links').insert(x.ids.map(r => ({ reimb_row_id: r, txn_id: x.txn })));
    if (error) { toast('Erro: ' + error.message); break; }
  }
  return true;
}
// Sugestões por nome/CNAE viram categoria de verdade (só saídas, e só contrapartes ainda sem categoria).
// Modo viagem: saída pessoal sem categoria dentro de um período de viagem (Ajustes → Férias e viagens) vira Viagem.
async function bankAutoViagem() {
  const viagens = (db.setting('viagens', []) || []).filter(v => v.inicio && v.fim);
  if (!viagens.length) return false;
  const ids = (BANK.every || []).filter(t => t.flow === 'out' && t.entity === 'pf' && !t.category && t.scope !== 'interna' && t.review_status !== 'revisado'
    && viagens.some(v => t.posted_on >= v.inicio && t.posted_on <= v.fim)).map(t => t.id);
  if (!ids.length) return false;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ category: 'Viagem', updated_at: new Date().toISOString() }).in('id', ids);
  if (error) { toast('Erro: ' + error.message); return false; }
  (BANK.every || []).forEach(t => { if (ids.includes(t.id)) t.category = 'Viagem'; });
  return true;
}
// IOF de compra internacional e a devolução ("IOF de volta de X") formam um par: a cobrança vira Viagem e a devolução
// "Reembolso Outros→Viagem", que se anulam. Assinatura no exterior (ex.: Anthropic) fica em Assinaturas.
// Não mexe no que você já revisou.
async function bankAutoIof() {
  const every = BANK.every || [];
  const isOut = (t) => t.flow === 'out' && /^IOF de compra internacional/i.test(t.counterpart || '');
  const volta = (t) => t.flow === 'in' && (/^IOF de volta de\s+(.+)/i.exec(t.counterpart || '') || [])[1];
  const livre = (t) => t.review_status !== 'revisado' && t.scope !== 'interna';
  const base = (merch) => (merch && suggestCat(merch, null) === 'Assinaturas') ? 'Assinaturas' : 'Viagem';
  const usados = new Set(); const set = {};
  const dia = (d) => new Date((d || '') + 'T12:00').getTime();
  every.filter(t => volta(t)).forEach(v => {
    const b = base(volta(v));
    const par = every.find(o => isOut(o) && !usados.has(o.id) && Math.abs(Math.abs(Number(o.amount)) - Number(v.amount)) < 0.005 && Math.abs(dia(o.posted_on) - dia(v.posted_on)) <= 5 * 864e5);
    if (par) { usados.add(par.id); if (livre(par) && par.category !== b) (set[b] ||= []).push(par.id); }
    const cv = REEMB_OUT + '→' + b;
    if (livre(v) && v.category !== cv) (set[cv] ||= []).push(v.id);
  });
  every.filter(o => isOut(o) && !usados.has(o.id) && !o.category && livre(o)).forEach(o => (set.Viagem ||= []).push(o.id));
  const cats = Object.keys(set); if (!cats.length) return false;
  const cl = db.adapter.client;
  for (const c of cats) {
    const { error } = await cl.from('tempo_bank_txns').update({ category: c, updated_at: new Date().toISOString() }).in('id', set[c]);
    if (error) { toast('Erro: ' + error.message); break; }
    every.forEach(t => { if (set[c].includes(t.id)) t.category = c; });
  }
  return true;
}
async function bankAutoCategory() {
  const every = BANK.every || [];
  const has = new Set(every.filter(x => x.category).map(x => x.counterpart || '—'));
  const groups = {};
  every.forEach(t => {
    if (t.category || t.scope === 'interna') return;
    const k = t.counterpart || '—';
    if (has.has(k)) return;
    const sug = t.flow === 'out' ? suggestCat(k, t.counterpart_doc) : suggestIncCat(k);
    if (!sug) return;
    const g = (groups[sug] = groups[sug] || { ids: [], cps: new Set() });
    g.ids.push(t.id); g.cps.add(k);
  });
  Object.values(groups).forEach(g => { g.cps = [...g.cps]; });
  const cats = Object.keys(groups);
  if (!cats.length) return false;
  const cl = db.adapter.client;
  for (const c of cats) {
    const { error } = await cl.from('tempo_bank_txns').update({ category: c, updated_at: new Date().toISOString() }).in('id', groups[c].ids);
    if (error) { toast('Erro: ' + error.message); break; }
    bankMarkCats(groups[c].cps, c, true);
  }
  return true;
}
// Entrada da conta PJ: contraparte já ligada a um projeto vira pagamento daquele projeto (valor com folga de 6%; senão cria).
// Contraparte marcada como Fee (sem projeto fixo) recebe a categoria Fee.
const bankIsPJ = (t) => (BANK.all.pj || []).some(x => x.id === t.id);
// Quem pagou indica o cliente/agência (aprendido dos vínculos anteriores); o projeto sai dos que ainda têm algo a receber.
// Ordem: parcela prevista com esse valor › projeto cujo saldo bate › projeto recorrente (fee) com valores parecidos ›
// único projeto em aberto que comporta o valor. Sem candidato claro, fica sem vínculo (não joga em projeto encerrado).
function bankProjetoDoPix(hist, amt, dia, taken) {
  if (!hist || !hist.length) return null;
  const perto = (v) => v != null && Math.abs(Number(v) - amt) <= Math.max(5, Number(v) * 0.06);
  const clis = new Set(), ags = new Set();
  hist.forEach(h => { const pr = db.get('tempo_projects', h.pid); const c = pr && db.get('tempo_clients', pr.client_id); if (c) { clis.add(c.id); if (c.agency_id) ags.add(c.agency_id); } });
  const cands = db.all('tempo_projects').filter(pr => {
    if (pr.archived || statusCat(pr.status_id) === 'cancelled') return false;
    const c = db.get('tempo_clients', pr.client_id); return c && (clis.has(c.id) || (c.agency_id && ags.has(c.agency_id)));
  });
  const ids = new Set(cands.map(x => x.id));
  const prev = db.all('tempo_payments').filter(x => ids.has(x.project_id) && !taken.has(x.id) && x.date == null && perto(x.amount));
  if (prev.length) return prev[0].project_id;
  const rem = (pr) => { const r = remainingOf(pr); return r == null ? null : Number(r); };
  const saldo = cands.filter(pr => perto(rem(pr))).sort((a, b) => String(a.deadline || '9').localeCompare(String(b.deadline || '9')));
  if (saldo.length) return saldo[0].id;
  const rec = {}; hist.filter(h => ids.has(h.pid) && perto(h.amt)).forEach(h => { rec[h.pid] = (rec[h.pid] || 0) + 1; });
  const recTop = Object.entries(rec).filter(([pid, n]) => n >= 2 && rem(db.get('tempo_projects', pid)) !== 0).sort((a, b) => b[1] - a[1])[0];
  if (recTop) return recTop[0];
  const cabe = cands.filter(pr => { const r = rem(pr); return r != null && r >= amt * 0.94; });
  return cabe.length === 1 ? cabe[0].id : null;
}
async function bankAutoPJ() {
  const cl = db.adapter.client; const learned = {}; const lastFee = {};
  (BANK.every || []).forEach(t => {
    if (t.flow !== 'in' || !t.counterpart || !bankIsPJ(t)) return;
    // aprende todos os vínculos da contraparte (valor → projeto), não só o primeiro
    if (t.payment_id) { const p = db.get('tempo_payments', t.payment_id); if (p) (learned[bankCpKey(t.counterpart)] ||= []).push({ pid: p.project_id, amt: Math.abs(Number(t.amount)) }); }
    if (t.category === 'Fee' && (t.posted_on || '') > (lastFee[t.counterpart] || '')) lastFee[t.counterpart] = t.posted_on;
  });
  // Fee só vale enquanto a contraparte ainda paga fee (último fee nos últimos 60 dias).
  const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const fee = new Set(Object.keys(lastFee).filter(k => lastFee[k] >= cutoff));
  const taken = new Set((BANK.every || []).map(t => t.payment_id).filter(Boolean));
  let did = false;
  for (const t of (BANK.every || [])) {
    if (t.flow !== 'in' || t.payment_id || !t.counterpart || !bankIsPJ(t)) continue;
    // Regras de Fee: Brenda (e Pala Films, alias) só vira fee a partir de 12/01/2026; depois disso, valor < 15.000 não é fee.
    const feeOk = !((/brenda|pala films/i.test(t.counterpart) && (t.posted_on || '') < '2026-01-12') || ((t.posted_on || '') >= '2026-01-12' && Math.abs(Number(t.amount)) < 15000));
    if (fee.has(t.counterpart) && feeOk && !t.category) {
      const { error } = await cl.from('tempo_bank_txns').update({ category: 'Fee', updated_at: new Date().toISOString() }).eq('id', t.id);
      if (error) { toast('Erro: ' + error.message); break; }
      t.category = 'Fee'; did = true; continue;
    }
    const amt = Math.abs(Number(t.amount));
    const pid = bankProjetoDoPix(learned[bankCpKey(t.counterpart)], amt, t.posted_on, taken); if (!pid) continue;
    const perto = (v) => v != null && Math.abs(Number(v) - amt) <= Math.max(5, Number(v) * 0.06);
    let p = db.all('tempo_payments').find(x => x.project_id === pid && !taken.has(x.id) && (x.date == null || x.date === t.posted_on) && perto(x.amount));
    let created = null;
    if (!p) { p = db.insert('tempo_payments', { project_id: pid, amount: amt, date: t.posted_on, note: 'Extrato' }); created = p.id; }
    else db.update('tempo_payments', p.id, { amount: amt, date: t.posted_on });
    taken.add(p.id);
    const { error } = await cl.from('tempo_bank_txns').update({ payment_id: p.id, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) { toast('Erro: ' + error.message); if (created) db.remove('tempo_payments', created, true); break; }
    t.payment_id = p.id; did = true;
  }
  return did;
}
// Fatura do cartão paga no mês → linha "Cartão…" de Despesas do mesmo mês. Duas faturas no mês somam.
// Sem linha de cartão no mês, cria "Cartão Nubank". Lançamento que você ligou à mão a outra coisa fica como está.
async function bankAutoCartao() {
  const cl = db.adapter?.client; if (!cl) return false;
  const fat = (BANK.every || []).filter(t => t.flow === 'out' && t.scope === 'cartao' && /fatura/i.test(t.counterpart || '') && t.posted_on);
  if (!fat.length) return false;
  const porMes = {}; fat.forEach(t => (porMes[t.posted_on.slice(0, 7)] ||= []).push(t));
  let did = false;
  for (const [ym, lista] of Object.entries(porMes)) {
    const rows = db.all('tempo_expenses').filter(e => e.kind === 'out' && e.month === ym && /cart[aã]o|fatura/i.test(e.name || ''));
    let e = rows.find(x => lista.some(t => t.expense_id === x.id)) || rows.find(x => /nubank/i.test(x.name)) || rows[0];
    const ultimo = lista.map(t => t.posted_on).sort().pop();
    if (!e) {
      e = db.insert('tempo_expenses', { month: ym, kind: 'out', name: 'Cartão Nubank', cat: 'PESSOAL/Cartão e dívidas', note: '', amount: 0, amount_sug: null, due_date: null, paid_on: ultimo, status: 'Pago', inst_no: null, inst_total: null, order: db.all('tempo_expenses').filter(x => x.month === ym).length });
      did = true;
    }
    for (const t of lista) {
      if (t.expense_id) continue;
      const { error } = await cl.from('tempo_bank_txns').update({ expense_id: e.id, updated_at: new Date().toISOString() }).eq('id', t.id);
      if (error) { toast('Erro: ' + error.message); return did; }
      t.expense_id = e.id; did = true;
    }
    const soma = Math.round(lista.filter(t => t.expense_id === e.id).reduce((x, t) => x + Math.abs(Number(t.amount)), 0) * 100) / 100;
    if (soma && (Math.abs(Number(e.amount || 0) - soma) > 0.004 || e.status !== 'Pago' || e.paid_on !== ultimo || e.amount_sug != null)) {
      db.update('tempo_expenses', e.id, { amount: soma, amount_sug: null, status: 'Pago', paid_on: ultimo }); did = true;
    }
  }
  return did;
}
async function bankLoadTxns() {
  await bankLoadRaw();
  let changed = await bankAutoTherapy();
  if (await bankAutoViagem()) changed = true;
  if (await bankAutoIof()) changed = true;
  if (await bankAutoCategory()) changed = true;
  if (await bankAutoReimb()) changed = true;
  if (await bankAutoCartao()) changed = true;
  if (await bankAutoFixed()) changed = true;
  if (await bankAutoPJ()) changed = true;
  if (changed) await bankLoadRaw();
}
// Conta do mês do lançamento ou do seguinte (conta de novembro paga no fim de outubro). Em aberto vem antes da já paga à mão; empate → mesmo mês.
const bankNextYm = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const bankMonthsFor = (ym) => [ym, bankNextYm(ym)];
const bankDone = (e) => e.status === 'Pago' || e.status === 'Recebido';
const bankPickExp = (list, ym) => list.slice().sort((a, b) => (bankDone(a) - bankDone(b)) || ((a.month !== ym) - (b.month !== ym)))[0] || null;
// Mesma pessoa escrita de jeitos diferentes no extrato ("HUDSON ALVES PINHEIRO" e "Hudson Alves Pinheiro (Transferência enviada)").
const bankCpKey = (cp) => String(cp || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
// Gasto fixo aprendido: a contraparte → nomes de gasto fixo que você já vinculou a ela.
function bankFixedLearned() {
  const map = {};
  (BANK.every || []).forEach(t => {
    if (!t.expense_id || !t.counterpart) return;
    const e = db.get('tempo_expenses', t.expense_id); if (!e || !e.name) return;
    const k = t.flow + '|' + bankCpKey(t.counterpart); // entrada e saída aprendem separado (ex.: BRENDA → Salário)
    (map[k] = map[k] || new Set()).add(e.name);
  });
  return map;
}
// Saída de uma contraparte já vinculada a um gasto fixo: liga sozinha ao gasto do mesmo nome e mês (valor com folga de 6%).
async function bankAutoFixed() {
  const learned = bankFixedLearned();
  const taken = new Set((BANK.every || []).map(t => t.expense_id).filter(Boolean));
  const expenses = db.all('tempo_expenses');
  const todo = [];
  (BANK.every || []).forEach(t => {
    const lk = t.flow + '|' + bankCpKey(t.counterpart);
    if (t.expense_id || t.scope === 'interna' || !t.counterpart || !learned[lk]) return;
    const ym = (t.posted_on || '').slice(0, 7), amt = Math.abs(Number(t.amount));
    const names = learned[lk]; const kind = t.flow === 'in' ? 'in' : 'out';
    const meses = bankMonthsFor(ym);
    // Mês do lançamento ou o seguinte: se o deste mês já está ligado (ex.: salário de outubro pago em 30/09), vai para o próximo.
    let e = bankPickExp(expenses.filter(x => x.kind === kind && meses.includes(x.month) && !taken.has(x.id) && (x.amount ?? x.amount_sug) != null
      && names.has(x.name) && Math.abs(Number(x.amount ?? x.amount_sug) - amt) <= Math.max(5, Number(x.amount ?? x.amount_sug) * 0.06)), ym);
    if (!e) {
      if (kind === 'in') return; // entrada sem linha no mês: espera a tabela do mês existir (abre no dia 25)
      // Sem gasto fixo deste nome no mês: cria com o valor do banco (não cria duplicado se já existe um com esse nome).
      if (expenses.some(x => x.kind === 'out' && meses.includes(x.month) && names.has(x.name) && !taken.has(x.id))) return;
      e = db.insert('tempo_expenses', { month: ym, kind: 'out', name: [...names][0], cat: '', note: '', amount: amt, due_date: null, paid_on: t.posted_on, status: 'Pago', inst_no: null, inst_total: null, order: expenses.filter(x => x.month === ym).length });
      expenses.push(e);
      taken.add(e.id); todo.push({ t, e, created: true });
      return;
    }
    taken.add(e.id); todo.push({ t, e });
  });
  if (!todo.length) return false;
  for (let i = 0; i < todo.length; i++) {
    const { t, e } = todo[i];
    const { error } = await db.adapter.client.from('tempo_bank_txns').update({ expense_id: e.id, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) { toast('Erro: ' + error.message); todo.slice(i).forEach(y => { if (y.created) db.remove('tempo_expenses', y.e.id, true); }); break; }
    db.update('tempo_expenses', e.id, { amount: Math.abs(Number(t.amount)), amount_sug: null, status: e.kind === 'in' ? 'Recebido' : 'Pago', paid_on: t.posted_on });
  }
  return true;
}
// Resumo geral: entradas, saídas e sobra (sem movimentos internos) e onde o dinheiro saiu.
// Filtro escondido das saídas (busca por nome, categoria, meio, conta e valor).
const bnorm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function bankFilterOn() { const f = BANK.f || {}; return !!(f.q || f.cat || f.meth || f.acc || f.min || f.max); }
function bankFilterHTML(catBy) {
  const f = BANK.f || {};
  const cats = [...new Set(Object.values(catBy).concat(bankCats()))].filter(c => c && c !== '__none').sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return `<div class="panel-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;border-bottom:1px solid var(--line)">
    <div class="field"><label for="bf-q">Nome</label><input id="bf-q" class="input" value="${esc(f.q || '')}" placeholder="Buscar por nome" data-on="bank-f" data-k="q"></div>
    <div class="field"><label for="bf-cat">Categoria</label><select id="bf-cat" class="input" data-on="bank-f" data-k="cat"><option value="">Todas</option><option value="__none" ${f.cat === '__none' ? 'selected' : ''}>Sem categoria</option>${cats.map(c => `<option value="${esc(c)}" ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label for="bf-meth">Meio</label><select id="bf-meth" class="input" data-on="bank-f" data-k="meth"><option value="">Todos</option>${METHODS.map(x => `<option value="${x}" ${f.meth === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label for="bf-acc">Conta</label><select id="bf-acc" class="input" data-on="bank-f" data-k="acc"><option value="">Todas</option><option value="pf" ${f.acc === 'pf' ? 'selected' : ''}>PF</option><option value="pj" ${f.acc === 'pj' ? 'selected' : ''}>PJ</option></select></div>
    <div class="field"><label for="bf-min">Valor mínimo</label><input id="bf-min" class="input" type="number" min="0" value="${esc(f.min || '')}" data-on="bank-f" data-k="min"></div>
    <div class="field"><label for="bf-max">Valor máximo</label><input id="bf-max" class="input" type="number" min="0" value="${esc(f.max || '')}" data-on="bank-f" data-k="max"></div>
    <div class="row"><button class="btn sm ghost" data-act="bank-f-clear">Limpar filtro</button></div>
  </div>`;
}
CHANGES['bank-f'] = (el) => { BANK.f = { ...(BANK.f || {}), [el.dataset.k]: el.value }; render(); };
ACTIONS['bank-f-toggle'] = () => { BANK.fOpen = !BANK.fOpen; render(); };
ACTIONS['bank-f-clear'] = () => { BANK.f = {}; render(); };
// Relatório de entradas: período (mês, últimos 3, últimos X, ano, tudo) e agrupamento por cliente ou por mês.
const inAddM = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
function bankInReportHTML(entity, ym, base, excl) {
  const P = BANK.inP || 'mes';
  const X = Math.max(1, Number(BANK.inX) || 6);
  const years = [...new Set(base.filter(t => t.flow === 'in' && t.posted_on).map(t => t.posted_on.slice(0, 4)))].sort().reverse();
  const Y = BANK.inY || ym.slice(0, 4);
  const range = P === 'mes' ? [ym, ym] : P === 'q3' ? [inAddM(ym, -2), ym] : P === 'mx' ? [inAddM(ym, -(X - 1)), ym] : P === 'ano' ? [Y + '-01', Y + '-12'] : ['0000-00', '9999-12'];
  const selM = BANK.inSel || {};
  const inRange = (t) => { const m = (t.posted_on || '').slice(0, 7); return P === 'sel' ? !!selM[m] : (m >= range[0] && m <= range[1]); };
  const allMonths = [...new Set(base.filter(t => t.flow === 'in' && t.scope === 'externa' && t.posted_on && !excl(t)).map(t => t.posted_on.slice(0, 7)))].sort().reverse();
  const ins = base.filter(t => t.flow === 'in' && t.scope === 'externa' && !excl(t) && inRange(t));
  const total = ins.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const byMes = {}, byCli = {}, agOf = {};
  const pl = BANK.plinks || [];
  const addC = (k, v, ag) => { byCli[k] = (byCli[k] || 0) + v; if (ag) agOf[k] = ag; };
  ins.forEach(t => {
    const a = Math.abs(Number(t.amount));
    const m = (t.posted_on || '').slice(0, 7);
    byMes[m] = (byMes[m] || 0) + a;
    const links = pl.filter(l => l.txn_id === t.id);
    const parts = links.length ? links.map(l => ({ v: Number(l.amount), pid: l.payment_id })) : (t.payment_id ? [{ v: a, pid: t.payment_id }] : []);
    if (!parts.length) {
      const cp = t.counterpart || '—';
      if (!bankIsPJ(t)) addC(cp, a);
      else addC(cp + (t.category === 'Fee' ? ' · Fee' : ' · sem vínculo'), a);
      return;
    }
    parts.forEach(pt => {
      const p = db.get('tempo_payments', pt.pid);
      const pr = p && db.get('tempo_projects', p.project_id);
      const c = pr && clientOf(pr);
      if (!c) { addC((t.counterpart || '—') + ' · sem projeto', pt.v); return; }
      const ag = c.agency_id ? db.get('tempo_agencies', c.agency_id) : null;
      addC(c.name, pt.v, ag ? ag.name : 'Cliente direto');
    });
  });
  const cliRows = Object.entries(byCli).sort((a, b) => b[1] - a[1]);
  const mesRows = Object.entries(byMes).sort((a, b) => a[0] < b[0] ? 1 : -1);
  const V = BANK.inV || 'cli';
  const rows = V === 'cli' ? cliRows : mesRows;
  const mx = Math.max(1, ...rows.map(r => r[1]));
  const nMeses = Object.keys(byMes).length;
  const bars = rows.length ? `<div style="display:flex;flex-direction:column;gap:10px">${rows.map(([k, v]) => `<div style="display:flex;align-items:center;gap:12px"><span class="small" style="flex:0 0 200px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(k)}">${esc(V === 'mes' ? rbLabel(k) : k)}${V === 'cli' && agOf[k] ? ` <span class="faint">· ${esc(agOf[k])}</span>` : ''}</span><div style="flex:1;min-width:0;height:16px;border-radius:8px;background:var(--surface-2);overflow:hidden;margin-right:14px"><div style="height:100%;width:${v / mx * 100}%;border-radius:8px;background:var(--accent,#22a06b)"></div></div><span class="mono small" style="flex:0 0 150px;text-align:right;white-space:nowrap">${fmtMoney0(v)} <span class="faint">${total ? Math.round(v / total * 100) : 0}%</span></span></div>`).join('')}</div>` : '<div class="empty small">Nenhuma entrada no período.</div>';
  const segP = [['mes', 'Mês'], ['q3', 'Últimos 3 meses'], ['mx', 'Últimos ' + X + ' meses'], ['ano', 'Ano'], ['sel', 'Meses escolhidos'], ['tudo', 'Tudo']];
  const monthChips = P === 'sel' ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">${allMonths.map(m => `<button class="btn sm ${selM[m] ? '' : 'ghost'}" data-act="bank-insel" data-v="${m}">${rbLabel(m)}</button>`).join('')}</div>` : '';
  const yearSel = P === 'ano' ? `<select data-on="bank-iny" class="input" style="width:auto;padding:4px 8px">${years.map(y => `<option value="${y}" ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select>` : '';
  const xInp = P === 'mx' ? `<input type="number" min="1" value="${X}" data-on="bank-inx" class="input" style="width:70px;padding:4px 6px">` : '';
  return `<div class="panel bank-report" style="margin-bottom:12px"><div class="panel-h"><h3>Entradas</h3><span class="small muted">${entity === 'pf' ? 'PF e PJ' : 'só PJ'} · ${ins.length} lançamento(s)</span></div><div class="panel-b">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><div class="seg" style="flex-wrap:wrap">${segP.map(([k, l]) => `<button class="${P === k ? 'on' : ''}" data-act="bank-inp" data-v="${k}">${l}</button>`).join('')}</div>${xInp}${yearSel}</div>
    <div class="row" style="gap:16px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px"><span><span class="small muted">Total</span> <b class="mono">${fmtMoney0(total)}</b></span><span><span class="small muted">Média por mês</span> <b class="mono">${fmtMoney0(nMeses ? total / nMeses : 0)}</b></span><span><span class="small muted">Meses com entrada</span> <b class="mono">${nMeses}</b></span></div>
    <div class="seg" style="margin-bottom:12px">${[['cli', 'Por cliente'], ['mes', 'Por mês']].map(([k, l]) => `<button class="${V === k ? 'on' : ''}" data-act="bank-inv" data-v="${k}">${l}</button>`).join('')}</div>
    ${monthChips}
    ${bars}
  </div></div>`;
}
ACTIONS['bank-inp'] = (el) => { BANK.inP = el.dataset.v; if (BANK.inP === 'sel' && !Object.keys(BANK.inSel || {}).length) BANK.inSel = { [bankMonthNow()]: true }; render(); };
ACTIONS['bank-insel'] = (el) => { const sel = { ...(BANK.inSel || {}) }; const m = el.dataset.v; if (sel[m]) delete sel[m]; else sel[m] = true; BANK.inSel = sel; render(); };
const bankMonthNow = () => (BANK.month || ymd(new Date()).slice(0, 7));
ACTIONS['bank-inv'] = (el) => { BANK.inV = el.dataset.v; render(); };
CHANGES['bank-inx'] = (el) => { BANK.inX = Math.max(1, Number(el.value) || 6); render(); };
CHANGES['bank-iny'] = (el) => { BANK.inY = el.value; render(); };
function bankSummaryHTML(entity) {
  const ym = BANK.month || ymd(new Date()).slice(0, 7);
  const key = entity + ':' + ym;
  const closed = db.setting('closedMonths', {})[key];
  const inBase = entity === 'pf' ? (BANK.every || []) : (BANK.all[entity] || []);   // PF financeiro = PF + PJ como uma conta só
  const inMonth = inBase.filter(t => t.scope === 'externa' && (t.posted_on || '').slice(0, 7) === ym);
  // Saídas: PF mostra tudo (contas PF e PJ); PJ mostra só o que é PJ
  const poolOut = (entity === 'pf' ? (BANK.every || []) : (BANK.all.pj || [])).filter(t => t.scope === 'externa' && t.flow === 'out');
  // Categoria por contraparte e fluxo: entrada e saída da mesma contraparte podem ter categorias diferentes.
  const cbk = (t) => (t.counterpart || '—') + '|' + (t.flow || '');
  const catBy = {};
  // categoria da contraparte = a mais usada (uma exceção marcada num lançamento não muda as outras)
  const catCount = {};
  (BANK.every || []).forEach(x => { if (x.category) { const c = (catCount[cbk(x)] ||= {}); c[x.category] = (c[x.category] || 0) + 1; } });
  Object.entries(catCount).forEach(([k, c]) => { catBy[k] = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; });
  // terapia ligada à tabela, ou ainda sem ligar mas já com a categoria Terapia: nos dois casos é reembolsável
  const isTher = (t) => t.flow === 'out' && (!!t.reimb_row_id || (t.category || catBy[cbk(t)]) === 'Terapia');
  const isReimb = (t) => t.flow === 'in' && isReembCat(t.category);
  const isExt = (t) => t.flow === 'in' && /^Estorno/.test(t.category || '');
  const extSum = inBase.filter(t => isExt(t) && (t.posted_on || '').slice(0, 7) === ym).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const ent = inMonth.filter(t => t.flow === 'in' && !isReimb(t) && !isExt(t)).reduce((s, t) => s + Number(t.amount), 0);
  const outMonth = poolOut.filter(t => (t.posted_on || '').slice(0, 7) === ym);
  const sai = outMonth.filter(t => !isTher(t)).reduce((s, t) => s + Number(t.amount), 0) + extSum;
  const reimbIn = inMonth.filter(isReimb).reduce((s, t) => s + Number(t.amount), 0);
  const ther = Math.abs(outMonth.filter(isTher).reduce((s, t) => s + Number(t.amount), 0));
  const cartao = Math.abs((BANK.all[entity] || []).filter(t => t.scope === 'cartao' && (t.posted_on || '').slice(0, 7) === ym).reduce((s, t) => s + Number(t.amount), 0));
  const origin = entity === 'pf' ? (BANK.origin || 'all') : 'all';
  const originOf = (t) => (/d660$/.test(t.account_tail || '') ? 'cartao' : 'conta');
  const f = BANK.f || {};
  const catOf = (t) => t.category || catBy[cbk(t)] || null;
  const passes = (t) => {
    if (origin !== 'all' && originOf(t) !== origin) return false;
    const k = t.counterpart || '—';
    if (f.q && !bnorm(k).includes(bnorm(f.q))) return false;
    if (f.cat === '__none' ? !!catOf(t) : (f.cat && catOf(t) !== f.cat)) return false;
    if (f.meth && bankMethod(t) !== f.meth) return false;
    if (f.acc && t.entity !== f.acc) return false;
    const a = Math.abs(Number(t.amount) || 0);
    if (f.min && a < Number(f.min)) return false;
    if (f.max && a > Number(f.max)) return false;
    return true;
  };
  // Transferências internas (PJ → PF) ficam fora dos totais, mas podem aparecer na lista da PJ.
  const listPool = entity === 'pj' && BANK.showT !== false ? poolOut.concat((BANK.all.pj || []).filter(t => t.flow === 'out' && t.scope === 'interna')) : poolOut;
  const outsAll = listPool.filter(passes).sort((a, b) => (b.posted_on || '').localeCompare(a.posted_on || ''));
  const showTBtn = entity === 'pj' ? `<button class="btn sm ghost" data-act="bank-showt">${BANK.showT !== false ? 'Ocultar' : 'Mostrar'} transferências para PF</button>` : '';
  const barInner = `${BANK.cmp ? '<button class="btn sm" data-act="bank-cmp" style="border:1px solid var(--line,#d8dbe0)">← Voltar ao mês</button>' : ''}${showTBtn}`;
  const bar = barInner ? `<div class="row" style="gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">${barInner}</div>` : '';
  const closeRow = `<div class="row" style="gap:8px;align-items:center;justify-content:flex-end;margin-top:10px;flex-wrap:wrap">${closed ? `<span class="tag tg" style="background:var(--surface-2)">Mês fechado em ${fmtDate(closed.closed_at)}</span><button class="btn sm ghost" data-act="bank-reopen" data-entity="${entity}" data-ym="${ym}">Reabrir</button>` : `<button class="btn sm ghost" data-act="bank-close" data-entity="${entity}" data-ym="${ym}">Fechar mês</button>`}</div>`;
  const rowHTML = (t) => {
    const k = t.counterpart || '—';
    const cat = catOf(t);
    const sug = cat ? null : (t.flow === 'out' ? suggestCat(k, t.counterpart_doc) : suggestIncCat(k));
    const autoCat = db.setting('bankAutoCat', {});
    if (t.counterpart_doc) bankCnpjLookup(t.counterpart_doc);
    const info = t.counterpart_doc && cnpjCache()[String(t.counterpart_doc).replace(/\D/g, '')];
    const eff = t.biz_entity || t.entity;
    return `<div class="bank-row">
      <span><input type="checkbox" data-on="bank-sel" data-id="${t.id}" ${BANK.sel && BANK.sel[t.id] ? 'checked' : ''} aria-label="Selecionar lançamento"></span>
      <span class="mono small">${fmtDateShort(t.posted_on)}</span>
      <span class="bn" title="${esc(info?.nome || k)}">${esc(k)}${alias(k) ? ` <span class="faint">· ${esc(alias(k))}</span>` : ''} <button class="bank-cat-btn faint small" data-act="bank-alias" data-cp="${esc(k)}" title="Dar apelido">✎</button></span>
      <span class="mono small" style="color:${t.scope === 'interna' ? 'var(--accent)' : t.flow === 'in' ? 'var(--ok)' : 'var(--danger)'}">${dotHTML(t.scope === 'interna' ? '#2563eb' : t.flow === 'in' ? '#22a06b' : '#d64545', t.scope === 'interna' ? 'Interno' : t.flow === 'in' ? 'Entrada' : 'Saída')}${fmtMoney(Math.abs(Number(t.amount)))}</span>
      <span class="small muted">${bankMethod(t)}</span>
      <span><button class="bank-cat-btn" data-act="bank-biz" data-id="${t.id}" title="Trocar entre PF e PJ">${accTag(eff)}</button></span>
      <span>${cat ? `<button class="bank-cat-btn" data-act="bank-cat" data-entity="${t.entity}" data-cp="${esc(k)}" data-flow="${t.flow}">${catTag(cat)}${autoCat[k] === cat ? ' <span class="faint small">sugerido</span>' : ''}</button>`
        : sug ? `<span class="bank-cat-btn" style="cursor:default">${catTag(sug)} <span class="faint small">sugerido</span></span>`
        : `<button class="btn sm ghost" data-act="bank-cat" data-entity="${t.entity}" data-cp="${esc(k)}" data-flow="${t.flow}">Definir categoria</button>`}${t.tag ? ` <span class="tag tg" style="${cssTb(TAG_COLOR[t.tag] || '#8a8f98')}">${esc(t.tag)}</span>` : ''}</span>
      <span class="small muted bm">${bankRowExtra(t)}</span></div>`;
  };
  BANK.openM = BANK.openM || {};
  const lst = BANK.lst || 'tudo';
  const outList = lst === 'in' ? [] : outsAll;
  const inList = lst === 'out' ? [] : (BANK.all[entity] || []).filter(t => t.flow === 'in' && passes(t));
  const listAll = outList.concat(inList).sort((a, b) => (b.posted_on || '').localeCompare(a.posted_on || ''));
  const months = [...new Set(listAll.map(t => (t.posted_on || '').slice(0, 7)))];
  const groups = months.map(m => {
    const open = BANK.openM[entity + ':' + m] ?? (m === ym);
    const items = listAll.filter(t => (t.posted_on || '').slice(0, 7) === m);
    const real = items.filter(t => t.scope !== 'interna');
    const tot = real.filter(t => t.flow === 'out').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const totIn = real.filter(t => t.flow === 'in').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const trf = items.filter(t => t.scope === 'interna').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    return `<div class="bank-group">
      <button class="bank-ghead bank-gcols" data-act="bank-mtoggle" data-k="${entity}:${m}" aria-expanded="${open}"><span class="bg-m">${icon(open ? 'chevD' : 'chevR')}${rbLabel(m)}</span><span class="bg-c"><span class="bg-l">Lançamentos</span><span class="bg-v">${real.length}</span></span><span class="bg-c in"><span class="bg-l">Entradas</span><span class="bg-v">${lst === 'out' ? '—' : fmtMoney0(totIn)}</span></span><span class="bg-c out"><span class="bg-l">Saídas</span><span class="bg-v">${lst === 'in' ? '—' : fmtMoney0(tot)}</span></span><span class="bg-c int" data-tip="Transferências entre as suas contas (PF ↔ PJ): não entram nos totais"><span class="bg-l">Interno</span><span class="bg-v">${trf ? fmtMoney0(trf) : '—'}</span></span></button>
      ${open ? `<div class="bank-rows bank-head"><span></span><span>Data</span><span>Descrição</span><span>Valor</span><span>Meio</span><span>Conta</span><span>Categoria</span><span>Onde foi</span></div>${items.map(rowHTML).join('')}` : ''}
    </div>`;
  }).join('');
  const sum = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + Math.abs(Number(x.amount)); return acc; }, {});
  const monthOuts = outMonth.filter(passes);
  // Terapia reembolsável fica separada e sempre no fim da lista, mesmo sendo o maior valor
  const catKey = (t) => (isTher(t) ? THER_LABEL : (catOf(t) || 'Sem categoria'));
  const catSums = sum(monthOuts, catKey);
  // Estorno "Estorno→Categoria" abate essa categoria
  (BANK.all[entity] || []).filter(t => t.flow === 'in' && abatesCat(t.category) && (t.posted_on || '').slice(0, 7) === ym).forEach(t => { const tg = t.category.split('→')[1]; catSums[tg] = (catSums[tg] || 0) - Math.abs(Number(t.amount)); });
  const byCat = Object.entries(catSums).filter(([k, v]) => k !== THER_LABEL && v > 0 && (BANK.reemb === true || !isReembCat(k))).sort((a, b) => b[1] - a[1]);
  if (catSums[THER_LABEL] && BANK.reemb === true) byCat.push([THER_LABEL, catSums[THER_LABEL]]);
  const byMeth = Object.entries(sum(monthOuts, bankMethod)).sort((a, b) => b[1] - a[1]);
  const byCp = Object.entries(sum(monthOuts, t => t.counterpart || '—')).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const bars = (arr) => (arr.length ? stdBarsHTML(arr.map(([k, v]) => ({ key: k, label: k, v })), fmtMoney0) : '<div class="empty small">Sem saídas neste mês.</div>');
  const byAcc = Object.entries(sum(monthOuts, t => (t.biz_entity || t.entity).toUpperCase())).sort((a, b) => b[1] - a[1]);
  const views = { cat: ['Categoria', () => donutHTML(byCat, 'Por categoria', chartCat, true)], meio: ['Meio', () => donutHTML(byMeth, 'Por meio')], conta: ['PF / PJ', () => donutHTML(byAcc, 'PF e PJ', (k) => exColor(k === 'PJ' ? 'EMPRESA' : 'PESSOAL'))], onde: ['Onde foi', () => bars(byCp)] };
  const cur = views[BANK.rep] ? BANK.rep : 'cat';
  const tabs = `<div class="seg" style="margin-bottom:12px;flex-wrap:wrap">${Object.entries(views).map(([k, [l]]) => `<button class="${cur === k ? 'on' : ''}" data-act="bank-rep" data-v="${k}">${l}</button>`).join('')}</div>`;
  const report = `<div class="panel bank-report"><div class="panel-h"><h3 class="row" style="gap:6px;align-items:center;flex-wrap:wrap">Relatório de <select data-on="bank-rmonth" class="input" style="width:auto;font:inherit;font-weight:600;padding:4px 8px">${[...new Set([ym, ...(BANK.all[entity] || []).filter(t => t.posted_on).map(t => t.posted_on.slice(0, 7))])].sort().reverse().map(m => `<option value="${m}" ${m === ym ? 'selected' : ''}>${rbLabel(m)}</option>`).join('')}</select></h3></div><div class="panel-b"><label class="row" style="gap:6px;margin-bottom:10px;align-items:center"><input type="checkbox" data-on="bank-reemb" ${BANK.reemb === true ? 'checked' : ''}> Mostrar reembolsos no relatório</label>${tabs}${views[cur][1]()}</div></div>`;
  const dot = (c) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;vertical-align:middle"></span>`;
  const GREEN = '#22a06b', RED = '#d64545';
  const fOn = bankFilterOn() || BANK.fOpen;
  if (BANK.cmp) return `${bar}${compareHTML(entity)}`;
  const inRep = bankInReportHTML(entity, ym, inBase, (t) => isExt(t) || (BANK.reemb !== true && isReimb(t)));
  const nSel = Object.keys(BANK.sel || {}).length;
  const selBar = nSel ? `<div class="row" style="gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;padding:8px 12px;background:var(--surface-2);border-radius:10px"><b class="small">${nSel} selecionado(s)</b><button class="btn sm primary" data-act="bank-bulk-cat">Mudar categoria</button><button class="btn sm danger" data-act="bank-bulk-del">Excluir</button><button class="btn sm ghost" data-act="bank-bulk-clear">Limpar seleção</button></div>` : '';
  return `${bar}${selBar}<div class="kpis">
    <div class="kpi"><span class="k">${dot(GREEN)}Entradas</span><span class="v">${fmtMoney0(ent)}</span><span class="s">externas, sem reembolsos</span></div>
    <div class="kpi"><span class="k">${dot(RED)}Saídas</span><span class="v">${fmtMoney0(Math.abs(sai))}</span><span class="s">${entity === 'pf' ? 'PF + PJ, sem terapias' : 'só PJ, sem terapias'}</span></div>
    <div class="kpi"><span class="k">${dot(GREEN)}Reembolsos recebidos</span><span class="v">${fmtMoney0(reimbIn)}</span><span class="s">plano de saúde</span></div>
    <div class="kpi"><span class="k">${dot(RED)}Terapias pagas</span><span class="v">${fmtMoney0(ther)}</span><span class="s">pagas pelo PF</span></div>
    <div class="kpi"><span class="k">Sobra</span><span class="v">${fmtMoney0(ent + sai)}</span><span class="s">entradas − saídas</span></div>
    ${cartao ? `<div class="kpi"><span class="k">Fatura do cartão</span><span class="v">${fmtMoney0(cartao)}</span><span class="s">paga · conta uma vez, pelos itens</span></div>` : ''}
  </div>
  <div class="bank-layout">
    <div class="panel bank-list"><div class="panel-h"><h3>Saídas</h3><span class="small muted">${entity === 'pf' ? 'PF e PJ' : 'só PJ'} · por mês</span><span class="grow"></span><span class="row" style="gap:4px;align-items:center"><button class="btn sm ghost" data-act="bank-mprev" title="Mês anterior">‹</button><button class="btn sm" data-act="bank-mnow" style="min-width:150px">${rbLabel(ym)}</button><button class="btn sm ghost" data-act="bank-mnext" title="Próximo mês">›</button></span><button class="btn sm ${BANK.cmp ? 'on' : ''}" data-act="bank-cmp" style="margin-left:6px">${BANK.cmp ? 'Voltar ao mês' : 'Comparar meses'}</button><button class="btn sm ${fOn ? 'on' : ''}" data-act="bank-f-toggle" style="margin-left:6px">${icon('search')} Filtrar${bankFilterOn() ? ' · ativo' : ''}</button></div>
      ${fOn ? bankFilterHTML(catBy) : ''}
      <div class="panel-b"><div style="display:flex;flex-wrap:wrap;gap:28px;align-items:center;margin-bottom:10px">${entity === 'pf' ? `<div class="seg">${[['all', 'Tudo'], ['conta', 'Conta'], ['cartao', 'Cartão']].map(([k, l]) => `<button class="${origin === k ? 'on' : ''}" data-act="bank-origin" data-v="${k}">${l}</button>`).join('')}</div>` : ''}${`<div class="seg">${[['tudo', 'Tudo'], ['in', 'Entradas'], ['out', 'Saídas']].map(([k, l]) => `<button class="${lst === k ? 'on' : ''}" data-act="bank-lst" data-v="${k}">${l}</button>`).join('')}</div>`}</div><div style="max-height:65vh;overflow:auto">${groups || '<div class="empty small">Nenhum lançamento.</div>'}</div></div></div>
    ${report}
  </div>
  ${inRep}${closeRow}`;
}
CHANGES['bank-month'] = (el) => { BANK.month = el.value; render(); };
ACTIONS['bank-origin'] = (el) => { BANK.origin = el.dataset.v; render(); };
ACTIONS['bank-lst'] = (el) => { BANK.lst = el.dataset.v; render(); };
ACTIONS['bank-showt'] = () => { BANK.showT = BANK.showT === false; render(); };
ACTIONS['bank-rep'] = (el) => { BANK.rep = el.dataset.v; render(); };
ACTIONS['bank-mtoggle'] = (el) => { BANK.openM = BANK.openM || {}; const k = el.dataset.k; const [ent, m] = k.split(':'); const cur = BANK.openM[k] ?? (m === (BANK.month || ymd(new Date()).slice(0, 7)) && ent); BANK.openM[k] = !cur; render(); };
// Categorias de gasto: as padrão mais as que o Tulio criar.
// Mesmas categorias e cores da tela de Despesas (PF/PJ), mais as de extrato.
let BANK_CATS = [...Object.values(EX_CATS).flat(), 'Terapia', 'Estorno'];   // mesmos tipos de Despesas, mais os especiais do extrato
const exKeyOf = (name) => { for (const [g, subs] of Object.entries(EX_CATS)) if (subs.includes(name)) return `${g}/${name}`; return `PESSOAL/${name}`; };
// Reembolso Outros→Compras aparece como "Reembolso > Compras" (o valor guardado não muda).
const catLabel = (name) => String(name || '').replace(/^Reembolso Outros→/, 'Reembolso > ');
// Cor da marcação de pessoa: Alice rosinha, Rafa azulzinha.
const TAG_COLOR = { Alice: '#e07ab0', Rafa: '#5b8fe0' };
const catTag = (name) => (name ? `<span class="tag tg" style="${cssTb(exColor(exKeyOf(name)))}">${esc(catLabel(name))}</span>` : '');
const accTag = (acc) => `<span class="tag tg abbr" style="${cssTb(exColor(acc === 'pj' ? 'EMPRESA' : 'PESSOAL'))}">${acc === 'pj' ? 'PJ' : 'PF'}</span>`;
const THER_LABEL = 'Terapia reembolsável';
// Categorias que costumam ser da empresa (PJ) por padrão.
const PJ_CATS = ['Contabilidade', 'Impostos'];
const bankCats = () => [...new Set([...BANK_CATS, ...db.setting('bankCats', [])])];
// Sugestão automática pelo nome do estabelecimento. Só sugere; quem confirma é você.
const CAT_RULES = [
  [/hudson|aluguel/i, 'Moradia'],
  [/amazon|shopee|mercadolivre|mercado livre|magalu|magazine|shein|aliexpress|americanas|renner|c&a|zara|riachuelo|melimais/i, 'Compras'],
  [/mercad|supermerc|atacad|varej|hortifr|padaria|a[cç]ougue|sacol[aã]o|assa[ií]|carrefour|p[ãa]o de a[cç]|feira|multifood|ampm|am\/pm|conveni|biscuit|bisc|rosarinho|palato|recibom|maralco|clube portugues|minuto pa|bembom|benfica|gaivota|novo mercatto|bem mais|spress|freitas varejo|mercadinho/i, 'Alimentação'],
  [/ifd|ifood|rappi|uber ?eats|delivery|restaur|lanche|pizza|hamburg|burger|sushi|teppan|china in box|donut|popeyes|deli\b|frios|cafe|caf[eé]|sorvet|doceria|bistr|churr/i, 'Alimentação'],
  [/farma\b|medicament|drogasil|extra farma|dose certa|rd saude|tradicao medic/i, 'Remédios'],
  [/\bbar\b|boteco|cervej|chopp|cinema|cinemark|ingresso|teatro|show|sympla|steam|playstation|playst|xbox|livrar|kaizen|barraca|esperanto|choribar|rosa e silva/i, 'Lazer'],
  [/posto|gasolin|combust|ipiranga|shell|petrobras|petrocal|petroservice|multipostos|auto posto|estacion|uber(?! ?eats)|99app|\b99\b|cabify|pedagio|ped[aá]gio|estacionamento|park\b|parking|detran|cloudpark|pop \d|nutag/i, 'Transporte'],
  [/barbear|cabeleireir|beleza|perfum|cosm[eé]t|est[eé]tica|sal[aã]o|manicure|depila|kali/i, 'Estética'],
  [/farm[aá]c|drogaria|droga|raia|pacheco|laborat|consult[oó]rio|cl[ií]nica|hospital|academ|smart fit|dentist|fitness|assistencia dos funcion|caixa de assist/i, 'Saúde'],
  [/inditex|centauro|osklen|\bosk\b/i, 'Roupas'],
  [/booking|airasia|12go|2c2p|hotel|flight|cars on/i, 'Viagem'],
  [/contador|contabil|cart[oó]rio|junta comercial|receita federal|receita|\bdas\b|inss|darf|simples nacional|cnpj|registro|taxa|pjbank/i, 'Contabilidade'],
  [/netflix|spotify|apple|dropbox|google|youtube|adobe|icloud|prime|hbo|disney|notion|chatgpt|openai|anthropic|claude|cinema 4d|linkedin|mubi|microsoft|onedrive/i, 'Assinaturas'],
  [/celpe|enel|energia|[aá]gua|compesa|sabesp|claro|vivo|tim |oi |internet|gás|gas /i, 'Contas da casa'],
  [/kalunga/i, 'Material de Trabalho'],
];
// Atividade principal (CNAE) da empresa -> categoria.
function cnaeCat(c) {
  const p = String(c || '');
  if (/^4711|^4721|^5611|^5612|^5620/.test(p)) return 'Alimentação';
  if (/^5630|^9001|^9329/.test(p)) return 'Lazer';
  if (/^4731/.test(p)) return 'Transporte';
  if (/^4771/.test(p)) return 'Saúde';
  if (/^49|^50|^51|^52/.test(p)) return 'Transporte';
  if (/^35|^61/.test(p)) return 'Contas da casa';
  if (/^62|^63/.test(p)) return 'Assinaturas';
  if (/^86/.test(p)) return 'Saúde';
  if (/^47/.test(p)) return 'Compras';
  return null;
}
const cnpjCache = () => db.setting('cnpjCache', {});
const cnpjPending = new Set();
// Consulta o CNPJ na BrasilAPI (uma vez por CNPJ; guarda no banco de configurações).
async function bankCnpjLookup(doc) {
  const digits = String(doc || '').replace(/\D/g, '');
  if (digits.length !== 14 || cnpjCache()[digits] || cnpjPending.has(digits)) return;
  cnpjPending.add(digits);
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + digits);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    db.setSetting('cnpjCache', { ...cnpjCache(), [digits]: { nome: j.nome_fantasia || j.razao_social || '', cnae: j.cnae_fiscal ? String(j.cnae_fiscal) : '' } });
    render();
  } catch (e) { /* sem internet ou CNPJ inválido: segue com as regras por nome */ }
  finally { cnpjPending.delete(digits); }
}
// Sugestão: primeiro pela atividade da empresa (CNPJ), depois pelo nome.
// Meio de pagamento pela origem do lançamento (conta de cartão, memo do Pix, etc.).
const METHODS = ['Crédito', 'Débito', 'Pix', 'Outro'];
const GREEN = '#22a06b', RED = '#d64545', PF_C = '#2E43D6', PJ_C = '#b45309';
const CHART_PAL = ['#2E43D6', '#22a06b', '#d64545', '#b45309', '#7c3aed', '#0ea5a4', '#db2777', '#64748b', '#84cc16', '#f59e0b'];
const CAT_COLORS = ['#B9C8F5', '#A8DCC4', '#F5B5B5', '#F2D39B', '#D2BEF5', '#A6E3E1', '#F7C2DA', '#C9D1DC', '#D7EFA6', '#F8E08E', '#B7D9F7', '#E8C79B', '#C7CBFA', '#B6E2C6', '#F1B3C0', '#A7E6DC', '#E3B8F5', '#F2D27A', '#A5EDEF', '#FBC7A4', '#C3CAD6', '#CFE7A0'];
const chartCat = (k) => exColor(exKeyOf(k));   // mesma cor que o tipo tem em Despesas
const palColor = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CHART_PAL[h % CHART_PAL.length]; };
const dotHTML = (c, title = '') => `<span title="${esc(title)}" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;vertical-align:middle;flex:none"></span>`;
// Rosca centralizada com chips claros na legenda (mesmas cores das categorias)
const chipHTML = (c, label, val, pct, hex) => `<span class="tag tg" style="${cssTb(hex)}">${esc(label)} <span class="mono">${fmtMoney0(val)}</span>${pct !== undefined ? ` <span style="opacity:.7">${pct}%</span>` : ''}</span>`;
function donutHTML(arr, centerLabel = 'Total', colorFn = (k) => palColor(k), legendBelow = false) {
  const tot = arr.reduce((a, x) => a + x[1], 0);
  if (!tot) return '<div class="empty small">Sem saídas neste mês.</div>';
  const R = 70, C = 2 * Math.PI * R; let acc = 0; const gap = arr.length > 1 ? 2 : 0;
  const colorOf = (k) => (k === THER_LABEL ? '#cbd5e1' : colorFn(k));
  const segs = arr.map(([k, v]) => { const f = v / tot; const len = Math.max(0, f * C - gap); const seg = `<circle data-seg="${esc(k)}" r="${R}" cx="110" cy="110" fill="none" stroke="${colorOf(k)}" stroke-width="26" stroke-dasharray="${len} ${C}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 110 110)" style="transition:opacity .15s"><title>${esc(k)}: ${fmtMoney0(v)} (${Math.round(f * 100)}%)</title></circle>`; acc += f; return seg; }).join('');
  const legend = arr.map(([k, v]) => { const pct = Math.round(v / tot * 100); return `<div data-seg="${esc(k)}" data-val="${esc(fmtMoney0(v) + ' · ' + pct + '%')}" style="transition:opacity .15s">${chipHTML(colorOf(k), k, v, pct, colorOf(k))}</div>`; }).join('');
  const svg = `<svg viewBox="0 0 220 220" width="220" height="220" role="img" aria-label="${esc(centerLabel)}">${segs}
      <text class="dc1" x="110" y="104" text-anchor="middle" font-size="12" fill="var(--fg-3)">${esc(centerLabel)}</text>
      <text class="dc2" x="110" y="126" text-anchor="middle" font-size="17" font-weight="600" fill="currentColor">${fmtMoney0(tot)}</text></svg>`;
  if (legendBelow) return `<div data-donut data-d1="${esc(centerLabel)}" data-d2="${esc(fmtMoney0(tot))}" style="display:flex;flex-direction:column;align-items:center;gap:18px">
    ${svg}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px 18px;width:100%;max-width:680px">${legend}</div>
  </div>`;
  return `<div data-donut data-d1="${esc(centerLabel)}" data-d2="${esc(fmtMoney0(tot))}" style="display:flex;gap:28px;align-items:center;justify-content:center;flex-wrap:wrap">
    <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:300px">${legend}</div>
    ${svg}
  </div>`;
}
// Ao passar o mouse numa categoria (no gráfico ou na legenda), destaca só ela.
const donutFocus = (box, key) => {
  box.querySelectorAll('[data-seg]').forEach(x => { x.style.opacity = !key || x.dataset.seg === key ? '' : '0.25'; });
  const leg = key ? Array.from(box.querySelectorAll('[data-val]')).find(x => x.dataset.seg === key) : null;
  const c1 = box.querySelector('.dc1'), c2 = box.querySelector('.dc2');
  if (c1) c1.textContent = key || box.dataset.d1;
  if (c2) c2.textContent = key ? (leg ? leg.dataset.val : '') : box.dataset.d2;
};
document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-seg]'); const box = el && el.closest('[data-donut]'); if (box) donutFocus(box, el.dataset.seg); });
document.addEventListener('mouseout', (e) => { const el = e.target.closest && e.target.closest('[data-seg]'); const box = el && el.closest('[data-donut]'); if (box) donutFocus(box, null); });
function bankMethod(t) {
  if (/d660$/.test(t.account_tail || '')) return 'Crédito';
  const m = String(t.memo || '');
  if (/pix/i.test(m)) return 'Pix';
  if (/d[ée]bito/i.test(m)) return 'Débito';
  return 'Outro';
}
// Entradas: sugestão de reembolso pelo nome (mesmo critério das saídas).
// Reembolso com nome de compra (ex.: "reembolso amazon") sugere "Reembolso Outros→Compras": abate Compras.
// Entrada cujo nome bate com uma compra (ex.: AMAZON) é reembolso dessa categoria: "Reembolso Outros→Compras".
function suggestIncCat(name) {
  if (/sul\s*america/i.test(name || '')) return REEMB_TER;
  const t = suggestCat(name, null);
  if (t) return REEMB_OUT + '→' + t;
  if (/reembols|estorno|devol/i.test(name || '')) return REEMB_OUT;
  return null;
}
// Aprendizado: o conjunto de palavras do nome (sem "da/de/do", parênteses e "transferência") que sempre levou
// à mesma categoria, em 2+ contrapartes e 80%+. O nome precisa conter TODAS essas palavras, em qualquer ordem:
// "Cristiana Abrantes da Fonte" só casa se tiver as três juntas, nunca só "Fonte Abrantes".
const LEARN_STOP = new Set(['da', 'de', 'do', 'dos', 'das', 'e', 'a', 'o', 'the', 'and', 'com', 'para', 'pela', 'ltda', 'sa', 'pix', 'me', 'eireli', 'pagamento', 'transferencia', 'enviada', 'recebida', 'compra', 'debito', 'credito', 'parcelado', 'parcela', 'brasil', 'comercio', 'servicos']);
const normWords = (name) => bnorm(String(name || '').replace(/\(.*?\)/g, ' ')).split(/[^a-z0-9]+/).filter(w => w && !LEARN_STOP.has(w) && !/^\d+$/.test(w));
function bankBuildLearned(every) {
  const per = {};   // contraparte -> categoria dominante (saídas)
  (every || []).forEach(t => {
    if (t.flow !== 'out' || !t.category || !t.counterpart || /^(Estorno|Reembolso|Terapia)/.test(t.category)) return;
    per[t.counterpart] = per[t.counterpart] || {};
    per[t.counterpart][t.category] = (per[t.counterpart][t.category] || 0) + 1;
  });
  const sets = {};   // conjunto de palavras -> { categoria: nº de contrapartes }
  Object.entries(per).forEach(([cp, cats]) => {
    const best = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];
    const w = [...new Set(normWords(cp))].filter(x => x.length >= 3);
    if (w.length < 2) return;
    const key = w.sort().join('|');
    sets[key] = sets[key] || {};
    sets[key][best] = (sets[key][best] || 0) + 1;
  });
  const out = [];
  Object.entries(sets).forEach(([key, cats]) => {
    const total = Object.values(cats).reduce((a, b) => a + b, 0);
    const [cat, n] = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (total >= 2 && n / total >= 0.8) out.push({ words: key.split('|'), cat, n: total });
  });
  return out.sort((a, b) => b.n - a.n);
}
function suggestCat(name, doc) {
  const digits = String(doc || '').replace(/\D/g, '');
  const c = digits && cnpjCache()[digits];
  if (c && c.cnae) { const v = cnaeCat(c.cnae); if (v) return v; }
  const hit = CAT_RULES.find(([re]) => re.test(name || ''));
  if (hit) return hit[1];
  const ws = new Set(normWords(name));
  const learnedHit = (BANK.learned || []).find(r => r.words.every(x => ws.has(x)));
  return learnedHit ? learnedHit.cat : null;
}
// Estorno: pergunta de qual categoria abater.
function bankEstornoTarget(cp) {
  const cats = bankCats().filter(c => c !== 'Estorno' && c !== 'Terapia');
  return new Promise(res => {
    let done = false;
    const l = openLayer({
      html: `<div class="dh"><h2>Abater de qual categoria?</h2></div><div class="db"><p style="margin:0">“${esc(cp)}” · o valor sai dessa categoria no relatório.</p>
        <div class="row" style="flex-wrap:wrap;gap:6px">${cats.map(c => `<button class="btn sm tg" data-t="${esc(c)}" style="${cssTb(exColor(exKeyOf(c)))}">${esc(c)}</button>`).join('')}</div>
        <div class="field"><label for="bext-new">Outra categoria</label><div class="row"><input id="bext-new" class="input" placeholder="Nova categoria"><button class="btn sm" data-t="__new">Usar</button></div></div></div>`,
      onClose: () => { if (!done) res(null); }
    });
    l.box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      let v = b.dataset.t;
      if (v === '__new') v = $('#bext-new', l.box).value.trim();
      if (!v) return toast('Digite o nome da categoria.');
      done = true; res(v); l.close();
    });
  });
}
// Entrada só mostra opções de entrada; Estorno continua aqui e, ao escolher, pede a saída a abater.
// Reembolsos recebidos: de terapia (liga à tabela de terapias) ou de outras coisas que você pagou (liga a um gasto).
const REEMB_TER = 'Reembolso Terapias', REEMB_OUT = 'Reembolso Outros';
// Reembolso Outros aponta a categoria que abate ("Reembolso Outros→Lazer"), como o Estorno.
const isReembTer = (c) => c === REEMB_TER || c === 'Reembolso';
const isReembOut = (c) => c === REEMB_OUT || /^Reembolso Outros→/.test(c || '');
const isReembCat = (c) => c === REEMB_TER || isReembOut(c) || c === 'Reembolso';
const abatesCat = (c) => /^Estorno→/.test(c || '') || (isReembOut(c) && BANK.reemb === true && /→/.test(c));
const BANK_IN_CATS = ['Renda', 'Freelas', REEMB_TER, REEMB_OUT, 'Estorno'];
function bankCatDialog(cp, bulk, flow) {
  // Estorno e reembolso só existem em entradas.
  const cats = (flow === 'in' ? BANK_IN_CATS : bankCats().filter(c => c !== 'Estorno' && !isReembCat(c))).slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return new Promise(res => {
    let done = false;
    const l = openLayer({
      html: `<div class="dh"><h2>Categoria</h2></div><div class="db"><p style="margin:0">${bulk ? `“${esc(cp)}”. Só os lançamentos selecionados.` : `“${esc(cp)}”. Vale para todos os lançamentos com esse nome.`}</p>
        <div class="field"><span class="lbl">Conta</span><div class="seg" id="bcat-biz"><button data-biz="pf" class="on">PF</button><button data-biz="pj">PJ</button></div></div>
        <div class="row" style="flex-wrap:wrap;gap:6px">${cats.map(c => `<button class="btn sm tg" data-cat="${esc(c)}" style="${cssTb(exColor(exKeyOf(c)))}">${esc(c)}</button>`).join('')}</div>
        <div class="field"><label for="bcat-new">Outra categoria</label><div class="row"><input id="bcat-new" class="input" placeholder="Nova categoria"><button class="btn sm" data-cat="__new">Usar</button></div></div>
        <div class="field"><span class="lbl">Pessoa (opcional)</span><div class="seg" id="bcat-tag"><button data-tag="">Eu</button><button data-tag="Rafa">Rafa</button><button data-tag="Alice">Alice</button></div></div></div>`,
      onClose: () => { if (!done) res(null); }
    });
    let bizTouched = false;
    const pickBiz = (b) => { bizTouched = true; l.box.querySelectorAll('#bcat-biz button').forEach(x => x.classList.toggle('on', x === b)); };
    l.box.addEventListener('click', async (e) => {
      const bz = e.target.closest('#bcat-biz [data-biz]'); if (bz) return pickBiz(bz);
      const tg = e.target.closest('#bcat-tag [data-tag]');
      if (tg) { done = true; res({ tagOnly: true, tag: tg.dataset.tag || null }); l.close(); return; }
      const b = e.target.closest('[data-cat]'); if (!b) return;
      let v = b.dataset.cat;
      if (v === '__new') v = $('#bcat-new', l.box).value.trim();
      if (!v) return toast('Digite o nome da categoria.');
      let biz = bizTouched ? (l.box.querySelector('#bcat-biz button.on')?.dataset.biz || 'pf') : 'pf';
      if (v === 'Estorno' || v === REEMB_OUT) {
        const target = await bankEstornoTarget(cp);
        if (!target) return;
        v = (v === 'Estorno' ? 'Estorno→' : REEMB_OUT + '→') + target;
        if (!bizTouched) biz = null;   // estorno fica na conta de origem, a não ser que você troque
      }
      done = true; res({ cat: v, biz }); l.close();
    });
  });
}
// Apelido: um nome amigável (ex.: "Diogo Oliveira" → "Kinay") mostrado em cor mais clara ao lado do nome original.
const alias = (cp) => (db.setting('bankAliases', {}) || {})[cp] || '';
ACTIONS['bank-alias'] = (el) => {
  const cp = el.dataset.cp, cur = alias(cp);
  const l = openLayer({
    html: `<div class="dh"><h2>Apelido</h2></div><div class="db"><p style="margin:0">“${esc(cp)}” aparece com este apelido ao lado do nome original. Deixe vazio para remover.</p>
      <div class="field"><label for="bal-v">Apelido</label><input id="bal-v" class="input" value="${esc(cur)}" placeholder="Ex.: Kinay" autocomplete="off"></div>
      <div class="row" style="gap:8px;justify-content:flex-end"><button class="btn sm ghost" data-t="cancel">Cancelar</button><button class="btn sm primary" data-t="ok">Salvar</button></div></div>`
  });
  l.box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'ok') {
      const v = l.box.querySelector('#bal-v').value.trim();
      const map = { ...(db.setting('bankAliases', {}) || {}) };
      if (v) map[cp] = v; else delete map[cp];
      db.setSetting('bankAliases', map);
      render();
    }
    l.close();
  });
  setTimeout(() => { const i = l.box.querySelector('#bal-v'); if (i) { i.focus(); i.select(); } }, 0);
};
ACTIONS['bank-cat'] = async (el) => {
  const entity = el.dataset.entity, cp = el.dataset.cp;
  const pick = el.dataset.v ? { cat: el.dataset.v, biz: PJ_CATS.includes(el.dataset.v) ? 'pj' : null } : await bankCatDialog(cp, false, el.dataset.flow);
  if (!pick) return;
  if (pick.tagOnly) {
    const qt0 = db.adapter.client.from('tempo_bank_txns').update({ tag: pick.tag, updated_at: new Date().toISOString() });
    const qt = el.dataset.flow ? qt0.eq('flow', el.dataset.flow) : qt0;
    const { error: et } = cp === '—' ? await qt.is('counterpart', null) : await qt.eq('counterpart', cp);
    if (et) return toast('Erro: ' + et.message);
    await bankLoadTxns(); return render();
  }
  const { cat, biz } = pick;
  // Só as linhas do mesmo fluxo (entrada ou saída): categorizar uma entrada não muda as saídas da mesma contraparte.
  const q = db.adapter.client.from('tempo_bank_txns').update({ category: cat, ...(biz ? { biz_entity: biz } : {}), updated_at: new Date().toISOString() });
  const qf = el.dataset.flow ? q.eq('flow', el.dataset.flow) : q;
  const { error } = cp === '—' ? await qf.is('counterpart', null) : await qf.eq('counterpart', cp);
  if (error) return toast('Erro: ' + error.message);
  bankMarkCats([cp], cat, false);
  await bankLoadTxns();
  if (!/^(Estorno|Reembolso Outros)→/.test(cat) && !BANK_CATS.includes(cat) && !db.setting('bankCats', []).includes(cat)) db.setSetting('bankCats', [...db.setting('bankCats', []), cat]);
  render();
};
CHANGES['bank-sel'] = (el) => {
  BANK.sel = { ...(BANK.sel || {}) };
  if (el.checked) BANK.sel[el.dataset.id] = true; else delete BANK.sel[el.dataset.id];
  render();
};
ACTIONS['bank-bulk-clear'] = () => { BANK.sel = {}; render(); };
// Excluir lançamentos selecionados (apaga também os vínculos com reembolsos/pagamentos).
ACTIONS['bank-bulk-del'] = async () => {
  const ids = Object.keys(BANK.sel || {});
  if (!ids.length) return;
  if (!await confirmBox({ title: `Excluir ${ids.length} lançamento(s)?`, body: 'Essa ação não pode ser desfeita.', ok: 'Excluir', danger: true })) return;
  const cl = db.adapter.client;
  const r1 = await cl.from('tempo_bank_reimb_links').delete().in('txn_id', ids);
  if (r1.error) return toast('Erro: ' + r1.error.message);
  const r2 = await cl.from('tempo_bank_payment_links').delete().in('txn_id', ids);
  if (r2.error) return toast('Erro: ' + r2.error.message);
  const r3 = await cl.from('tempo_bank_txns').delete().in('id', ids);
  if (r3.error) return toast('Erro: ' + r3.error.message);
  BANK.sel = {};
  await bankLoadTxns();
  toast(`${ids.length} lançamento(s) excluídos`);
  render();
};
ACTIONS['bank-cmp'] = () => { BANK.cmp = !BANK.cmp; render(); };
CHANGES['bank-rmonth'] = (el) => { BANK.month = el.value; render(); };
// Soma de um mês: entradas, saídas (sem terapias), sobra e saídas por categoria.
function monthSnap(entity, ym) {
  const withRe = BANK.reemb === true;
  const cats = {}; let ent = 0, sai = 0;
  // Mesma resolução do relatório: categoria pela contraparte e fluxo (como no donut), senão a própria categoria.
  const cm = {};
  (BANK.every || []).forEach(x => { if (x.category) cm[(x.counterpart || '—') + '|' + (x.flow || '')] = x.category; });
  (BANK.all[entity] || []).forEach(t => {
    if (t.scope === 'interna' || t.scope === 'cartao' || !t.posted_on || t.posted_on.slice(0, 7) !== ym) return;   // pagamento de fatura não é gasto: as compras do cartão já entram
    const v = Math.abs(Number(t.amount)), c = cm[(t.counterpart || '—') + '|' + (t.flow || '')] || t.category || 'Sem categoria';
    if (t.flow === 'out' && (t.reimb_row_id || c === 'Terapia')) return;   // terapias ficam fora da comparação
    if (!withRe && isReembCat(c)) return;
    if (t.flow === 'in') {
      if (abatesCat(c)) { const tg = c.split('→')[1]; cats[tg] = (cats[tg] || 0) - v; return; }   // estorno abate a categoria
      if (/^Estorno/.test(c)) return;
      ent += v; return;
    }
    sai += v; cats[c] = (cats[c] || 0) + v;
  });
  return { ent, sai, sobra: ent - sai, cats };
}
const CMP_COLS = ['#2563eb', '#f59e0b', '#22a06b', '#d64545', '#8b5cf6', '#0ea5e9'];
const cmpMonthsOf = () => { const cur = BANK.month || ymd(new Date()).slice(0, 7); return (BANK.cmpList && BANK.cmpList.length) ? BANK.cmpList : [cur, bankPrevYm(cur)]; };
CHANGES['bank-cmp-add'] = (el) => { const v = el.value; if (!v) return; const l = cmpMonthsOf(); if (!l.includes(v) && l.length < CMP_COLS.length) BANK.cmpList = [...l, v]; render(); };
ACTIONS['bank-cmp-rm'] = (el) => { const v = el.dataset.k; const l = cmpMonthsOf(); if (l.length > 1) BANK.cmpList = l.filter(m => m !== v); render(); };
// Comparador: quantos meses quiser (até 6), lado a lado, com números, barras e tabela.
function compareHTML(entity) {
  const GREEN = '#22a06b', RED = '#d64545';
  const months = [...new Set((BANK.all[entity] || []).filter(t => t.scope !== 'interna' && t.posted_on).map(t => t.posted_on.slice(0, 7)))].sort().reverse();
  const L = cmpMonthsOf();
  const col = (i) => CMP_COLS[i % CMP_COLS.length];
  const snaps = L.map(m => monthSnap(entity, m));
  const two = L.length === 2;
  const addOpts = `<option value="">+ mês</option>` + months.filter(m => !L.includes(m)).map(m => `<option value="${m}">${rbLabel(m)}</option>`).join('');
  const diff = (a, b, inverse) => {
    const d = a - b, pct = b ? Math.round(d / Math.abs(b) * 100) : null;
    const good = inverse ? d <= 0 : d >= 0;
    return `<span style="color:${d === 0 ? 'var(--fg-2)' : good ? GREEN : RED};font-weight:600">${d === 0 ? '—' : (d > 0 ? '▲ ' : '▼ ') + fmtMoney0(Math.abs(d))}${pct !== null && d !== 0 ? ` <span class="small">(${pct > 0 ? '+' : ''}${pct}%)</span>` : ''}</span>`;
  };
  const kpi = (label, key, inverse) => `<div class="kpi" style="flex:1;min-width:200px">
      <span class="k">${label}</span>
      <div style="display:flex;flex-wrap:wrap;gap:2px 14px">${L.map((m, i) => `<span class="v" style="color:${col(i)};${L.length > 2 ? 'font-size:1.05em' : ''}">${fmtMoney0(snaps[i][key])}</span>`).join('')}</div>
      ${two ? `<span class="s">${diff(snaps[0][key], snaps[1][key], inverse)}</span>` : ''}</div>`;
  const keys = [...new Set(snaps.flatMap(s => Object.keys(s.cats)))]
    .filter(k => snaps.some(s => Math.abs(s.cats[k] || 0) > 0))
    .sort((x, y) => Math.max(...snaps.map(s => Math.abs(s.cats[y] || 0))) - Math.max(...snaps.map(s => Math.abs(s.cats[x] || 0))));
  const mx = Math.max(1, ...keys.flatMap(k => snaps.map(s => Math.abs(s.cats[k] || 0))));
  const bar = (v, c) => `<div style="height:9px;border-radius:5px;background:${c};width:${Math.max(0, Math.abs(v) / mx * 100)}%;min-width:${v ? 2 : 0}px"></div>`;
  const rows = keys.map(k => `<div style="display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:12px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)">
      <span style="font-size:.92em">${esc(k)}</span>
      <div style="display:grid;gap:4px">${L.map((m, i) => { const v = snaps[i].cats[k] || 0; return `<div class="row" style="gap:8px;align-items:center">${bar(v, col(i))}<span class="mono small" style="white-space:nowrap;color:${col(i)}">${fmtMoney0(v)}</span></div>`; }).join('')}</div>
    </div>`).join('');
  const tableRows = keys.map(k => `<tr><td>${esc(k)}</td>${L.map((m, i) => `<td class="num" style="color:${col(i)}">${fmtMoney0(snaps[i].cats[k] || 0)}</td>`).join('')}${two ? `<td class="num">${diff(snaps[0].cats[k] || 0, snaps[1].cats[k] || 0, true)}</td>` : ''}</tr>`).join('');
  const chips = L.map((m, i) => `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 10px;border:1px solid var(--line,#d8dbe0);border-radius:999px;font-size:.9em"><span style="width:9px;height:9px;border-radius:50%;background:${col(i)}"></span>${rbLabel(m)}${L.length > 1 ? `<button data-act="bank-cmp-rm" data-k="${m}" title="Remover" style="border:0;background:none;cursor:pointer;color:var(--fg-3);font-size:1.15em;line-height:1;padding:0 4px">×</button>` : ''}</span>`).join('');
  return `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Comparar meses</h3><span class="faint small">${BANK.reemb === true ? 'com reembolsos' : 'sem reembolsos'}</span></div>
    <div class="panel-b">
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
        ${chips}
        ${L.length < CMP_COLS.length ? `<select data-on="bank-cmp-add" class="input" style="width:auto;padding:3px 8px;font-size:.9em">${addOpts}</select>` : ''}
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        ${kpi('Entradas', 'ent', false)}
        ${kpi('Saídas', 'sai', true)}
        ${kpi('Sobra', 'sobra', false)}
      </div>
      <div class="row small" style="gap:16px;margin-bottom:6px;flex-wrap:wrap"><b>Saídas por categoria</b>${L.map((m, i) => `<span style="color:${col(i)}">● ${rbLabel(m)}</span>`).join('')}</div>
      ${keys.length ? rows : '<div class="empty small">Nenhuma saída nesses meses.</div>'}
      <div style="margin-top:16px;overflow:auto"><table class="grid compact"><thead><tr><th>Categoria</th>${L.map((m, i) => `<th class="num" style="color:${col(i)}">${rbLabel(m)}</th>`).join('')}${two ? '<th class="num">Diferença</th>' : ''}</tr></thead><tbody>${tableRows}</tbody></table></div>
      <details style="margin-top:16px"><summary class="small" style="cursor:pointer"><b>Todos os meses</b></summary><div style="margin-top:10px">${trendHTML(entity)}</div></details>
    </div></div>`;
}
// Troca de mês pelos botões ‹ ›; o nome do mês volta ao mês atual ao clicar nele.
const bankShiftMonth = (d) => { const [y, m] = (BANK.month || ymd(new Date()).slice(0, 7)).split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); BANK.month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; render(); };
ACTIONS['bank-mprev'] = () => bankShiftMonth(-1);
ACTIONS['bank-mnext'] = () => bankShiftMonth(1);
ACTIONS['bank-mnow'] = () => { BANK.month = null; render(); };
CHANGES['bank-reemb'] = (el) => { BANK.reemb = el.checked; render(); };
// Comparar meses: categorias (saídas) e totais de entrada, saída e sobra, mês a mês. Mostra até 12 meses.
function trendHTML(entity) {
  const withRe = BANK.reemb === true;
  const txns = (BANK.all[entity] || []).filter(t => t.scope !== 'interna' && t.posted_on);
  const months = [...new Set(txns.map(t => t.posted_on.slice(0, 7)))].sort().slice(-12);
  const cats = {}; const ent = {}; const sai = {};
  const add = (bag, k, ym, v) => { bag[k] = bag[k] || {}; bag[k][ym] = (bag[k][ym] || 0) + v; };
  txns.forEach(t => {
    const ym = t.posted_on.slice(0, 7), v = Math.abs(Number(t.amount)), c = t.category || 'Sem categoria';
    if (t.flow === 'in') {
      if (/^Estorno/.test(c)) return;                       // estorno não é entrada
      if (!withRe && isReembCat(c)) return;
      add(ent, 'Entradas', ym, v);
    } else {
      if (!withRe && isReembCat(c)) return;
      if (abatesCat(c)) { add(cats, c.split('→')[1], ym, -v); add(sai, 'Saídas', ym, v); return; }
      add(cats, c, ym, v); add(sai, 'Saídas', ym, v);
    }
  });
  const sumRow = (row) => Object.values(row || {}).reduce((a, b) => a + b, 0);
  const cell = (row, ym) => { const v = (row || {})[ym] || 0; return v ? fmtMoney0(v) : '<span class="faint">—</span>'; };
  const catList = Object.keys(cats).sort((a, b) => sumRow(cats[b]) - sumRow(cats[a]));
  const line = (label, row, cls, bold) => `<tr><td ${bold ? 'style="font-weight:600"' : ''}>${label}</td>${months.map(m => `<td class="num ${cls || ''}">${cell(row, m)}</td>`).join('')}<td class="num" style="font-weight:600">${fmtMoney0(sumRow(row))}</td></tr>`;
  const sobra = {}; months.forEach(m => { sobra[m] = (ent.Entradas || {})[m] || 0; sobra[m] -= (sai.Saídas || {})[m] || 0; });
  const sobraCells = months.map(m => `<td class="num">${sobra[m] ? fmtMoney0(sobra[m]) : '<span class="faint">—</span>'}</td>`).join('');
  const sobraTotal = Object.values(sobra).reduce((a, b) => a + b, 0);
  return `<div class="panel"><div class="panel-h"><h3>Comparar meses · ${entity === 'pj' ? 'PJ' : 'PF e PJ'}</h3><span class="faint small">${withRe ? 'com reembolsos' : 'sem reembolsos'}</span></div>
    <div class="panel-b" style="overflow:auto"><table class="grid compact"><thead><tr><th>Categoria</th>${months.map(m => `<th class="num">${m.slice(5)}/${m.slice(2, 4)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${line('Entradas', ent.Entradas, 'bank-in')}
      ${line('Saídas', sai.Saídas, 'bank-out', true)}
      <tr><td style="font-weight:600">Sobra</td>${sobraCells}<td class="num" style="font-weight:600">${fmtMoney0(sobraTotal)}</td></tr>
      <tr><td colspan="${months.length + 2}" class="faint small" style="padding-top:12px">Saídas por categoria</td></tr>
      ${catList.map(c => line(esc(c), cats[c])).join('')}
    </tbody></table></div></div>`;
}
ACTIONS['bank-bulk-cat'] = async () => {
  const ids = Object.keys(BANK.sel || {});
  if (!ids.length) return;
  const flows = new Set(ids.map(id => ((BANK.every || []).find(x => x.id === id) || {}).flow));
  const pick = await bankCatDialog(`${ids.length} lançamento(s)`, true, flows.size === 1 ? [...flows][0] : null);
  if (!pick) return;
  if (pick.tagOnly) {
    const { error: et } = await db.adapter.client.from('tempo_bank_txns').update({ tag: pick.tag, updated_at: new Date().toISOString() }).in('id', ids);
    if (et) return toast('Erro: ' + et.message);
    BANK.sel = {}; await bankLoadTxns(); return render();
  }
  const { cat, biz } = pick;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ category: cat, ...(biz ? { biz_entity: biz } : {}), updated_at: new Date().toISOString() }).in('id', ids);
  if (error) return toast('Erro: ' + error.message);
  bankMarkCats(ids.map(id => ((BANK.every || []).find(x => x.id === id) || {}).counterpart || '—'), cat, false);
  await bankLoadTxns();
  if (!/^(Estorno|Reembolso Outros)→/.test(cat) && !BANK_CATS.includes(cat) && !db.setting('bankCats', []).includes(cat)) db.setSetting('bankCats', [...db.setting('bankCats', []), cat]);
  BANK.sel = {};
  toast(`${ids.length} lançamento(s) atualizados`);
  render();
};
ACTIONS['bank-close'] = (el) => {
  const entity = el.dataset.entity, ym = el.dataset.ym, key = entity + ':' + ym;
  const all = (BANK.all[entity] || []).filter(t => t.scope === 'externa' && (t.posted_on || '').slice(0, 7) === ym);
  const ent = all.filter(t => t.flow === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const sai = all.filter(t => t.flow === 'out').reduce((s, t) => s + Number(t.amount), 0);
  const closed = db.setting('closedMonths', {});
  db.setSetting('closedMonths', { ...closed, [key]: { entradas: ent, saidas: Math.abs(sai), sobra: ent + sai, closed_at: new Date().toISOString() } });
  toast('Mês fechado: ' + ym);
  render();
};
ACTIONS['bank-reopen'] = (el) => {
  const closed = { ...db.setting('closedMonths', {}) };
  delete closed[el.dataset.entity + ':' + el.dataset.ym];
  db.setSetting('closedMonths', closed); render();
};
// Sincroniza ao abrir a tela se a última leitura tiver mais de 2h.
// checkedAt evita loop: render() chama a tela de novo, e a checagem não roda de novo por 60s.
async function bankRefresh(force) {
  if (!db.adapter || !db.adapter.client || BANK.busy) return;
  if (!force && Date.now() - BANK.checkedAt < 60000) return;
  BANK.checkedAt = Date.now(); BANK.busy = true;
  // mostra logo o que já está salvo; a busca no Gmail atualiza em seguida
  try { await bankLoadTxns(); BANK.busy = true; render(); } catch (e) { /* segue para a busca */ }
  try {
    BANK.status = await bankApi('status');
    if (BANK.status.connected) {
      // sincroniza sempre que a tela financeira (ou o app) pede; o intervalo de 60 s evita repetir à toa
      const r = await bankApi('sync', { method: 'POST' });
      const lidas = r.results.reduce((s, x) => s + (x.transacoes_lidas || 0), 0);
      BANK.msg = 'Última leitura: ' + lidas + ' movimentações';
      BANK.status = await bankApi('status');
    }
    await bankLoadTxns();
  } catch (e) { BANK.msg = 'Erro: ' + e.message; }
  finally { BANK.busy = false; render(); setTimeout(pixAlert, 400); }
}
function bankPanel(entity) {
  const st = BANK.status, connected = !!(st && st.connected);
  const label = entity === 'pf' ? 'PF' : 'PJ';
  const reviewedNow = BANK.mode[entity] === 'revisado';
  const head = `<div class="panel-h"><h3>Extratos ${label}${reviewedNow ? ' · revisadas' : ''}</h3><span class="grow"></span>${connected
    ? `<button class="btn sm" data-act="bank-sync">Atualizar</button>`
    : `<button class="btn sm primary" data-act="bank-connect">Conectar Gmail</button>`}</div>`;
  const sub = connected
    ? `<div class="panel-b small muted" style="padding:8px 16px">Conta: ${esc(st.account_email || '')} · última leitura: ${st.last_sync_at ? fmtDate(st.last_sync_at) : 'nunca'}${BANK.msg ? ' · ' + esc(BANK.msg) : ''}</div>`
    : `<div class="panel-b small muted" style="padding:8px 16px">Conecte o Gmail que recebe os extratos da Nubank. Nada entra no Financeiro sem você revisar.</div>`;
  const rows = BANK.txns[entity] || [];
  const body = rows.length
    ? `<table class="grid compact fin"><tbody>${rows.map(t => `<tr><td class="mono small">${fmtDateShort(t.posted_on)}</td><td>${esc(t.counterpart || t.memo)}</td><td class="num">${fmtMoney(t.amount)}</td><td>${t.scope === 'interna' ? '<span class="tag tg" style="background:var(--surface-2);color:var(--fg-3)">Interna</span>' : t.scope === 'cartao' ? '<span class="tag tg" style="background:var(--surface-2);color:var(--fg-3)">Cartão</span>' : '<span class="tag tg">Externa</span>'}</td><td>${bankRowExtra(t)}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty small">${reviewedNow ? 'Nenhuma movimentação revisada.' : 'Nenhuma movimentação nova.'}</div>`;
  const reviewed = BANK.mode[entity] === 'revisado';
  const foot = `<div class="panel-b" style="padding:8px 16px;display:flex;gap:8px;justify-content:flex-end"><button class="btn sm ghost" data-act="bank-mode" data-entity="${entity}">${reviewed ? 'Ver novas' : 'Ver revisadas'}</button>${rows.length && !reviewed ? `<button class="btn sm" data-act="bank-review-all" data-entity="${entity}">Marcar como revisadas</button>` : ''}</div>`;
  return `<div class="panel">${head}${sub}<div class="panel-b tight" style="max-height:320px;overflow:auto">${body}</div>${foot}</div>`;
}
