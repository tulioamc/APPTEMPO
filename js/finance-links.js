/* =====================================================================
   EXTRATOS: VÍNCULOS (custos fixos, terapias, reembolsos e recebimentos),
   tela de Finanças PF e avisos de Pix. Continuação de finance-bank.js.
   ===================================================================== */
// Vínculos sugeridos: custo fixo (nome parecido + valor dentro da tolerância) e reembolso SulAmérica (lote com o mesmo valor).
function bankFixedMatch(t) {
  if (t.expense_id || t.flow !== 'out' || !t.counterpart) return null;
  const amt = Math.abs(Number(t.amount)), cp = t.counterpart.toLowerCase();
  const linked = new Set((BANK.all[t.entity] || []).map(x => x.expense_id).filter(Boolean));
  const ym = (t.posted_on || '').slice(0, 7);
  const word = cp.split(/\s+/)[0];
  const meses = bankMonthsFor(ym);
  const conhecido = bankLearnedNames(bankFixedLearned(), t);   // já vinculada antes (ou combinada à mão), por nome ou CPF/CNPJ
  const porRegra = conhecido && bankPickExp(db.all('tempo_expenses').filter(e => e.kind === 'out' && meses.includes(e.month) && !linked.has(e.id) && conhecido.has(e.name)), ym);
  if (porRegra) return porRegra;
  return bankPickExp(db.all('tempo_expenses').filter(e => {
    if (e.kind !== 'out' || !meses.includes(e.month) || linked.has(e.id) || !e.name || (e.amount ?? e.amount_sug) == null) return false;
    const nm = e.name.toLowerCase();
    const nameOk = word.length >= 4 && nm.includes(word);
    const v = Number(e.amount ?? e.amount_sug);
    return nameOk && Math.abs(v - amt) <= Math.max(5, v * 0.03);
  }), ym) || bankFixedByValue(t, amt, ym, linked);
}
/* Casamento só pelo valor: sem nome parecido, sugere o custo fixo do mês com o valor exato,
   desde que seja o único em aberto com esse valor e não haja outra saída igual no mês esperando vínculo. */
function bankFixedByValue(t, amt, ym, linked) {
  const igual = (v) => Math.abs(Number(v) - amt) < 0.01;
  const cands = db.all('tempo_expenses').filter(e => e.kind === 'out' && bankMonthsFor(ym).includes(e.month) && !linked.has(e.id) && e.name && (e.amount ?? e.amount_sug) != null && e.status !== 'Pago' && igual(e.amount ?? e.amount_sug));
  if (cands.length !== 1) return null;
  const rivais = (BANK.all[t.entity] || []).filter(x => x.id !== t.id && x.flow === 'out' && !x.expense_id && (x.posted_on || '').slice(0, 7) === ym && igual(Math.abs(Number(x.amount))));
  return rivais.length ? null : cands[0];
}
function bankReimbMatch(t) {
  if (t.flow !== 'in' || !/sulam/i.test(t.counterpart || '') || t.reimb_linked) return null;
  const amt = Number(t.amount);
  const pend = db.all('tempo_reimb_rows').filter(r => !r.refunded_on && Number(r.amount) > 0 && db.get('tempo_status_options', r.req_id)?.name !== 'Não se aplica');
  const byMonth = {};
  pend.forEach(r => { byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.amount); });
  const m = Object.keys(byMonth).find(k => Math.abs(byMonth[k] - amt) <= 1);
  return m ? { month: m, total: byMonth[m] } : null;
}
// Transferência interna: procura o par (valor igual, sentido contrário, até 3 dias) entre contas e caixinhas.
function bankPairOf(t) {
  if (t.scope !== 'interna') return null;
  const amt = Math.abs(Number(t.amount)), d0 = new Date(t.posted_on).getTime();
  const c = (BANK.every || []).filter(x => x.id !== t.id && x.scope === 'interna' && x.flow !== t.flow
    && Math.abs(Math.abs(Number(x.amount)) - amt) < 0.01 && Math.abs(new Date(x.posted_on).getTime() - d0) <= 3 * 86400000);
  return c[0] || null;
}
const bankSrc = (x) => (/RDB|Resgate|Aplica[cç][aã]o|Caixinha|Rendimento/i.test(x.memo || '') ? 'CAIXINHA' : (x.biz_entity || x.entity || '').toUpperCase());
const bankOther = (src) => (src === 'PJ' ? 'PF' : src === 'PF' ? 'PJ' : 'PF');
function bankRowExtra(t) {
  if (t.scope === 'interna') {
    const pr = bankPairOf(t);
    let from, to;
    if (pr) { from = bankSrc(t.flow === 'out' ? t : pr); to = bankSrc(t.flow === 'out' ? pr : t); }
    else { const me = bankSrc(t); from = t.flow === 'out' ? me : bankOther(me); to = t.flow === 'out' ? bankOther(me) : me; }
    const lbl = `[Interno] [${from}>${to}]${pr ? '' : ' [a confirmar]'}`;
    return `<span class="tag tg" style="${cssTb('#2563eb')}">${esc(lbl)}</span>`;
  }
  const lk = t.flow === 'in' ? bankLinksOf(t.id) : [];
  if (lk.length) {
    const rs = lk.map(id => db.get('tempo_reimb_rows', id)).filter(Boolean);
    const tot = rs.reduce((a, r) => a + Number(r.amount), 0);
    return `<span class="small muted">→ ${rs.map(r => esc(r.name)).join(', ')} (${fmtMoney0(tot)})</span> <button class="btn sm ghost" data-act="bank-unlink" data-id="${t.id}">Desvincular</button>`;
  }
  const unl = `<button class="btn sm ghost" data-act="bank-unlink-any" data-id="${t.id}">Desvincular</button>`;
  const pls = t.flow === 'in' ? (BANK.plinks || []).filter(l => l.txn_id === t.id && l.payment_id) : [];
  if (pls.length) return `<span class="small muted">→ ${pls.map(l => { const pay = db.get('tempo_payments', l.payment_id); const pr = pay ? db.get('tempo_projects', pay.project_id) : null; return `${esc(pr?.name || 'Projeto')} (${fmtMoney0(l.amount)})`; }).join(' + ')}</span> ${unl}`;
  if (t.payment_id) { const p = db.get('tempo_payments', t.payment_id); const pr = p ? db.get('tempo_projects', p.project_id) : null; return `<span class="small muted">→ ${esc(pr?.name || 'Projeto')} (${fmtMoney0(p?.amount)})</span> ${unl}`; }
  if (t.category === 'Fee' && bankIsPJ(t)) return `<span class="small muted">→ Fee</span> ${unl}`;
  if (t.reimb_row_id) { const r = db.get('tempo_reimb_rows', t.reimb_row_id); return r ? `<span class="small muted">→ Terapia: ${esc(r.name)}</span> ${unl}` : ''; }
  if (t.expense_id) { const e = db.get('tempo_expenses', t.expense_id); return e ? `<span class="small muted">→ ${esc(e.name)}</span> ${unl}` : ''; }
  if (t.flow !== 'out' && isReembOut(t.category)) return `<button class="btn sm ghost" data-act="bank-rexp" data-id="${t.id}">Vincular a gasto…</button>`;
  if (t.flow !== 'out' && isReembCat(t.category)) {
    // reembolso de terapia: linha da tabela de terapias (ou um custo, como plano de saúde)
    const rr = bankTherapyMatch(t);
    const tb = rr ? `<button class="btn sm" data-act="bank-tlink" data-id="${t.id}" data-kind="reimb" data-target="${rr.id}">Vincular a terapia ${esc(rr.name)}</button>` : `<button class="btn sm ghost" data-act="bank-rlink" data-id="${t.id}">Vincular a terapia…</button>`;
    return `${tb} <button class="btn sm ghost" data-act="bank-rexp" data-id="${t.id}">Vincular a gasto…</button>`;
  }
  if (t.flow === 'in' && bankIsPJ(t)) {
    const sp = bankOpenMatch(t);
    if (sp) return `<button class="btn sm" data-act="bank-psug" data-id="${t.id}" data-pids="${sp.id}">Sugestão: ${esc(sp.name)} · marcar como pago</button> <button class="btn sm ghost" data-act="bank-tpick" data-id="${t.id}">Outro…</button>`;
    const combos = bankComboMatch(t);
    if (combos.length) return combos.map(c => `<button class="btn sm" data-act="bank-psug" data-id="${t.id}" data-pids="${c.map(p => p.id).join(',')}">${c.map(p => esc(p.name)).join(' + ')} · ${fmtMoney0(c.reduce((a, p) => a + remainingOf(p), 0))}</button>`).join(' ') + ` <button class="btn sm ghost" data-act="bank-tpick" data-id="${t.id}">Outro…</button>`;
    return `<button class="btn sm ghost" data-act="bank-tpick" data-id="${t.id}">Vincular a projeto…</button>`;
  }
  if (t.flow !== 'out') { const r = bankReimbMatch(t); return r ? `<button class="btn sm" data-act="bank-reimb" data-id="${t.id}" data-month="${r.month}">Lote ${r.month} (${fmtMoney0(r.total)})</button>` : `<button class="btn sm ghost" data-act="bank-rexp" data-id="${t.id}">${isReembCat(t.category) ? 'Vincular a gasto…' : 'Vincular a entrada…'}</button>`; }
  const e = bankFixedMatch(t);
  if (e) return `<button class="btn sm" data-act="bank-link" data-id="${t.id}" data-eid="${e.id}">Vincular a ${esc(e.name)}</button>`;
  const rr = bankTherapyMatch(t);
  if (rr) return `<button class="btn sm" data-act="bank-tlink" data-id="${t.id}" data-kind="reimb" data-target="${rr.id}">Vincular a terapia ${esc(rr.name)}</button>`;
  return `<button class="btn sm ghost" data-act="bank-tpick" data-id="${t.id}">Vincular…</button>`;
}
// Pagamento de terapia (PF) que bate com uma linha de reembolso do mesmo mês pelo valor.
// Mês anterior: reembolso recebido costuma chegar depois da terapia.
const bankPrevYm = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
// Entrada de reembolso: mês do pagamento e os 3 meses anteriores (terapias podem ser de meses bem anteriores).
const bankReimbMonths = (t) => {
  const ym = (t.posted_on || '').slice(0, 7);
  if (t.flow !== 'in') return [ym];
  const out = [ym]; for (let i = 0; i < 3; i++) out.push(bankPrevYm(out[out.length - 1]));
  return out;
};
function bankTherapyMatch(t) {
  const amt = Math.abs(Number(t.amount)), months = bankReimbMonths(t);
  const taken = bankTakenRows();
  const c = db.all('tempo_reimb_rows').filter(r => months.includes(r.month) && !taken.has(r.id) && Number(r.amount) > 0 && Math.abs(Number(r.amount) - amt) <= 1);
  return c.length === 1 ? c[0] : null;
}
// Escolha manual: lista as linhas de terapia e os custos do mês.
function bankPickDialog(t) {
  const ym = (t.posted_on || '').slice(0, 7);
  const rows = db.all('tempo_reimb_rows').filter(r => r.month === ym && Number(r.amount) > 0).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const exps = db.all('tempo_expenses').filter(e => e.month === ym && e.kind === 'out' && e.amount != null);
  const btn = (kind, id, label, val) => `<button class="btn sm" style="justify-content:space-between;width:100%" data-kind="${kind}" data-id="${id}">${esc(label)} <span class="mono small">${fmtMoney(val)}</span></button>`;
  const fixedBlock = `<div class="field"><span class="lbl">Custos fixos do mês</span><div class="stack" style="gap:6px">${exps.length ? exps.map(e => btn('expense', e.id, e.name, e.amount)).join('') : '<span class="small muted">Nenhum custo fixo neste mês.</span>'}</div></div>`;
  // Terapias vêm só da conta PF: entrada da PJ nunca é terapia.
  const isPJin = t.flow === 'in' && bankIsPJ(t);
  const therContent = isPJin ? '<span class="small muted">Terapias só recebem entradas da conta PF.</span>'
    : (rows.length ? rows.map(r => btn('reimb', r.id, r.name, r.amount)).join('') : '<span class="small muted">Nenhuma linha de terapia neste mês.</span>');
  const therBlock = `<div class="field"><span class="lbl">Terapias do mês ${ym}</span><div class="stack" style="gap:6px">${therContent}</div></div>`;
  // Saída: custo fixo primeiro. Entrada: terapias primeiro.
  // Entrada da PJ: projeto (cria o pagamento) ou Fee, sem projeto fixo.
  // Projetos sem pagamento vinculado a nenhuma entrada. Recente = criado nos últimos 6 meses (em relação à entrada); Antigo = mais antigo.
  const linkedPay = new Set((BANK.every || []).map(b => b.payment_id).filter(Boolean));
  const allPays = db.all('tempo_payments');
  const hasLink = (p) => allPays.some(x => x.project_id === p.id && linkedPay.has(x.id));
  const cut = (() => { const d = new Date((t.posted_on || '') + 'T12:00:00'); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })();
  const dateOf = (p) => String(p.started_at || p.created_at || '').slice(0, 10);
  const pend = db.all('tempo_projects').filter(p => !p.archived && !hasLink(p)).sort((a, b) => ((clientOf(a)?.name || '') + a.name).localeCompare((clientOf(b)?.name || '') + b.name));
  const rowP = (p) => { const c = clientOf(p); return btn('project', p.id, (c ? c.name + ' · ' : '') + p.name, p.budget).replace('class="btn sm"', 'class="btn sm bpk-p"'); };
  const recList = pend.filter(p => dateOf(p) >= cut).map(rowP).join('') || '<span class="small muted">Nenhum projeto recente sem vínculo.</span>';
  const oldList = pend.filter(p => dateOf(p) < cut).map(rowP).join('') || '<span class="small muted">Nenhum projeto antigo sem vínculo.</span>';
  const projBlock = (t.flow === 'in' && bankIsPJ(t)) ? `<div class="field"><span class="lbl">Projeto (pagamento recebido)</span>
    <div class="row" style="gap:6px;margin-bottom:6px"><button class="btn sm" data-tab="rec">Recente (6 meses)</button><button class="btn sm ghost" data-tab="old">Antigo</button><button class="btn sm ghost" data-tab="ther">Terapias</button></div>
    <input id="bpk-q" class="input" placeholder="Buscar cliente ou projeto" autocomplete="off" style="margin-bottom:6px">
    <div class="stack" style="gap:6px">${btn('fee', 'fee', 'Fee (sem projeto fixo)', Math.abs(Number(t.amount)))}
      <div id="bpk-rec" class="stack" style="gap:6px">${recList}</div>
      <div id="bpk-old" class="stack" style="gap:6px;display:none">${oldList}</div>
      <div id="bpk-ther" class="stack" style="gap:6px;display:none">${therBlock}</div></div></div>` : '';
  const html = `<div class="dh"><h2>Vincular lançamento</h2></div><div class="db">
    <p style="margin:0">${esc(t.counterpart || t.memo)} · ${fmtMoney(Math.abs(Number(t.amount)))} · ${fmtDate(t.posted_on)}</p>
    ${projBlock}
    ${t.flow === 'out' ? (/sul\s*americ/i.test(t.counterpart || '') ? fixedBlock : fixedBlock + therBlock) : (isPJin ? fixedBlock : therBlock + fixedBlock)}
    </div><div class="df"><button class="btn" data-x="no">Cancelar</button></div>`;
  return new Promise(res => {
    let done = false;
    const l = openLayer({ html, onClose: () => { if (!done) res(null); } });
    l.box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind]'); if (b) { done = true; res({ kind: b.dataset.kind, id: b.dataset.id }); l.close(); return; }
      if (e.target.closest('[data-x]')) { done = true; res(null); l.close(); }
    });
    l.box.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]'); if (!tab) return;
      const key = tab.dataset.tab;
      ['rec', 'old', 'ther'].forEach(k => { const el = l.box.querySelector('#bpk-' + k); if (el) el.style.display = k === key ? '' : 'none'; });
      l.box.querySelectorAll('[data-tab]').forEach(b => b.className = 'btn sm' + (b.dataset.tab === key ? '' : ' ghost'));
    });
    l.box.addEventListener('input', (e) => {
      if (e.target.id !== 'bpk-q') return;
      const q = bnorm(e.target.value);
      l.box.querySelectorAll('.bpk-p').forEach(el => { el.style.display = bnorm(el.textContent).includes(q) ? '' : 'none'; });
    });
  });
}
ACTIONS['bank-tpick'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const pick = await bankPickDialog(t); if (!pick) return;
  await linkBankTxn(t, pick.kind, pick.id);
};
// Reembolso recebido ligado a um custo do mesmo mês. Não altera o valor nem o status do custo.
function bankExpPick(t) {
  const ym = (t.posted_on || '').slice(0, 7);
  // entrada que não é reembolso se vincula a um recebimento; reembolso e saídas, a um custo
  const want = (t.flow === 'in' && !isReembCat(t.category)) ? 'in' : 'out';
  const exps = db.all('tempo_expenses').filter(e => e.month === ym && e.kind === want).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const html = `<div class="dh"><h2>${want === 'in' ? 'Entrada de qual recebimento?' : 'Reembolso de qual gasto?'}</h2></div><div class="db">
    <p style="margin:0">${esc(t.counterpart || t.memo)} · ${fmtMoney(Math.abs(Number(t.amount)))} · ${fmtDate(t.posted_on)}</p>
    <div class="field"><span class="lbl">${want === 'in' ? 'Recebimentos' : 'Custos'} de ${ym}</span><div class="stack" style="gap:6px">${exps.length ? exps.map(e => `<button class="btn sm" style="justify-content:space-between;width:100%" data-id="${e.id}">${esc(e.name)} <span class="mono small">${fmtMoney(e.amount)}</span></button>`).join('') : '<span class="small muted">Nenhum custo neste mês.</span>'}</div></div>
    </div><div class="df"><button class="btn" data-x="no">Cancelar</button></div>`;
  return new Promise(res => {
    let done = false;
    const l = openLayer({ html, onClose: () => { if (!done) res(null); } });
    l.box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]'); if (b) { done = true; res(b.dataset.id); l.close(); return; }
      if (e.target.closest('[data-x]')) { done = true; res(null); l.close(); }
    });
  });
}
ACTIONS['bank-rexp'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const id = await bankExpPick(t); if (!id) return;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ expense_id: id, updated_at: new Date().toISOString() }).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  await bankLoadTxns(); toast('Reembolso vinculado'); render();
};
// Escolhe a linha de terapia do mês para um reembolso recebido.
function bankReimbPick(t) {
  const months = bankReimbMonths(t);
  const taken = bankTakenRows();
  const rows = db.all('tempo_reimb_rows').filter(r => months.includes(r.month) && !taken.has(r.id) && Number(r.amount) > 0).sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.name).localeCompare(String(b.name)));
  const target = Math.abs(Number(t.amount));
  const sumText = (sum) => { const diff = Math.round((sum - target) * 100); return `Marcado: ${fmtMoney(sum)} de ${fmtMoney(target)}` + (diff === 0 ? ' · bate' : ` · diferença ${fmtMoney(Math.abs(diff) / 100)}`); };
  // Sugestão: mesma busca de soma exata do auto-vínculo, com as candidatas na mesma ordem (mês atual primeiro, maior valor).
  const cands = rows.slice().sort((a, b) => (b.month === months[0] ? 1 : 0) - (a.month === months[0] ? 1 : 0) || Number(b.amount) - Number(a.amount)).slice(0, 30);
  const sugg = bankSubsetFor(cands, Math.round(target * 100)) || [];
  const suggSet = new Set(sugg);
  const suggSum = cands.filter(r => suggSet.has(r.id)).reduce((a, r) => a + Number(r.amount), 0);
  const html = `<div class="dh"><h2>Reembolso de quais terapias?</h2></div><div class="db">
    <p style="margin:0">${esc(t.counterpart || t.memo)} · ${fmtMoney(target)} · ${fmtDate(t.posted_on)}</p>
    <div class="field"><span class="lbl">Terapias de ${months.join(', ')} · marque todas que estão neste pagamento</span><div class="stack" style="gap:6px">${rows.length ? rows.map(r => `<label class="row" style="justify-content:space-between;gap:8px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;cursor:pointer"><span><input type="checkbox" value="${r.id}" data-amt="${Number(r.amount)}" style="margin-right:8px"${suggSet.has(r.id) ? ' checked' : ''}>${esc(r.name)} <span class="small muted">${esc(r.month)}</span></span><span class="mono small">${fmtMoney(r.amount)}</span></label>`).join('') : '<span class="small muted">Nenhuma terapia sem vínculo neste mês.</span>'}</div></div>
    ${sugg.length ? '<p class="small muted" style="margin:0">Sugestão: marquei as terapias que fecham o valor exato. Confira e clique em Vincular.</p>' : '<p class="small muted" style="margin:0">Nenhuma combinação fecha o valor exato. Marque manualmente.</p>'}
    <p class="small" data-sum style="margin:0">${sumText(suggSum)}</p>
    <div class="df"><button class="btn" data-x="no">Cancelar</button><button class="btn primary" data-x="ok">Vincular</button></div></div>`;
  return new Promise(res => {
    let done = false;
    const l = openLayer({ html, onClose: () => { if (!done) res(null); } });
    const sumEl = l.box.querySelector('[data-sum]');
    const picked = () => [...l.box.querySelectorAll('input[type=checkbox]:checked')];
    l.box.addEventListener('change', () => {
      const sum = picked().reduce((a, c) => a + Number(c.dataset.amt), 0);
      sumEl.textContent = sumText(sum);
    });
    l.box.addEventListener('click', (e) => {
      if (e.target.closest('[data-x="ok"]')) {
        const ids = picked().map(c => c.value);
        if (!ids.length) return toast('Marque pelo menos uma terapia.');
        done = true; res(ids); l.close(); return;
      }
      if (e.target.closest('[data-x="no"]')) { done = true; res(null); l.close(); }
    });
  });
}
ACTIONS['bank-rlink'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const id = await bankReimbPick(t); if (!id) return;
  await linkBankTxn(t, 'reimb', id);
};
ACTIONS['bank-unlink'] = async (el) => {
  const id = el.dataset.id;
  const { error } = await db.adapter.client.from('tempo_bank_reimb_links').delete().eq('txn_id', id);
  if (error) return toast('Erro: ' + error.message);
  db.setSetting(bankSkipKey, { ...db.setting(bankSkipKey, {}), [id]: true });
  await bankLoadTxns(); toast('Desvinculado'); render();
};
// Desfaz qualquer vínculo de um lançamento: projeto (pagamento criado pelo extrato é apagado), Fee, terapia, gasto e vínculos de vários pagamentos.
ACTIONS['bank-unlink-any'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const cl = db.adapter.client;
  const patch = { updated_at: new Date().toISOString(), payment_id: null, expense_id: null, reimb_row_id: null };
  if (t.category === 'Fee' || (t.reimb_row_id && t.category === 'Terapia')) patch.category = null;
  const { error } = await cl.from('tempo_bank_txns').update(patch).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  await cl.from('tempo_bank_payment_links').delete().eq('txn_id', t.id);
  if (t.payment_id) {
    const p = db.get('tempo_payments', t.payment_id);
    const others = (BANK.every || []).some(b => b.id !== t.id && b.payment_id === t.payment_id);
    if (p && p.note === 'Extrato' && !others) { await cl.from('tempo_payments').delete().eq('id', p.id); db.data.tempo_payments = db.data.tempo_payments.filter(x => x.id !== p.id); }
  }
  await bankLoadTxns(); toast('Desvinculado'); render();
};
ACTIONS['bank-tlink'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  await linkBankTxn(t, el.dataset.kind, el.dataset.target);
};
async function linkBankTxn(t, kind, id) {
  if (kind === 'fee' || kind === 'project') {
    const cl = db.adapter.client; const patch = { updated_at: new Date().toISOString() };
    if (kind === 'fee') patch.category = 'Fee';
    else {
      const amt = Math.abs(Number(t.amount)); const taken = (BANK.every || []).map(b => b.payment_id).filter(Boolean);
      let p = db.all('tempo_payments').find(x => x.project_id === id && !taken.includes(x.id) && (x.date == null || x.date === t.posted_on) && x.amount != null && Math.abs(Number(x.amount) - amt) <= Math.max(5, Number(x.amount) * 0.06));
      if (p) db.update('tempo_payments', p.id, { amount: amt, date: t.posted_on });
      else p = db.insert('tempo_payments', { project_id: id, amount: amt, date: t.posted_on, note: 'Extrato' });
      patch.payment_id = p.id;
    }
    const { error } = await cl.from('tempo_bank_txns').update(patch).eq('id', t.id);
    if (error) return toast('Erro: ' + error.message);
    await bankLoadTxns(); toast('Vinculado'); render(); return;
  }
  if (kind === 'reimb' && t.flow !== 'out') {
    const ids = Array.isArray(id) ? id : [id];
    const { error } = await db.adapter.client.from('tempo_bank_reimb_links').insert(ids.map(r => ({ reimb_row_id: r, txn_id: t.id })));
    if (error) return toast('Erro: ' + error.message);
    const skip = { ...db.setting(bankSkipKey, {}) }; delete skip[t.id]; db.setSetting(bankSkipKey, skip);
    await bankLoadTxns(); toast('Vinculado'); render(); return;
  }
  const patch = { updated_at: new Date().toISOString() };
  if (kind === 'reimb') { patch.reimb_row_id = id; patch.category = 'Terapia'; }
  else { patch.expense_id = id; db.update('tempo_expenses', id, { amount: Math.abs(Number(t.amount)), amount_sug: null, status: 'Pago', paid_on: t.posted_on }); }
  const { error } = await db.adapter.client.from('tempo_bank_txns').update(patch).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  await bankLoadTxns(); toast('Vinculado'); render();
}
ACTIONS['bank-link'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id);
  const e = db.get('tempo_expenses', el.dataset.eid); if (!t || !e) return;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ expense_id: e.id, updated_at: new Date().toISOString() }).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  // o documento (extrato) vence: valor e data pagos vêm do banco
  db.update('tempo_expenses', e.id, { amount: Math.abs(Number(t.amount)), status: 'Pago', paid_on: t.posted_on });
  t.expense_id = e.id; toast('Vinculado a ' + e.name); render();
};
ACTIONS['bank-reimb'] = async (el) => {
  const t = (BANK.all.pj || []).concat(BANK.all.pf || []).find(x => x.id === el.dataset.id); if (!t) return;
  const m = el.dataset.month;
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ category: REEMB_TER, updated_at: new Date().toISOString() }).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  const lote = db.all('tempo_reimb_rows').filter(r => r.month === m && !r.refunded_on && Number(r.amount) > 0);
  const feito = rbStatusId('reimb_refund', 'Feito!');
  lote.forEach(r => db.update('tempo_reimb_rows', r.id, { refunded_on: t.posted_on, ...(feito ? { refund_id: feito } : {}) }, true));
  if (lote.length) addNotice({ kind: 'reembolso', key: `reemb-lote:${m}:${t.id}`, title: `Reembolso de ${rbLabel(m)} marcado como Feito!`, body: `${lote.length} linha(s) · ${fmtMoney(lote.reduce((a, r) => a + Number(r.amount), 0))} · data do extrato: ${fmtDate(t.posted_on)}. Confira na aba Reembolsos.`, entity: 'reimb', data: { month: m, txn_id: t.id } });
  db.emit(); t.reimb_linked = true; await bankLoadTxns(); toast('Lote ' + m + ' marcado como reembolsado em ' + fmtDate(t.posted_on)); render();
};
ACTIONS['bank-biz'] = async (el) => {
  const t = (BANK.all.pf || []).concat(BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const cur = t.biz_entity || t.entity;
  const next = cur === 'pf' ? 'pj' : 'pf';
  const { error } = await db.adapter.client.from('tempo_bank_txns').update({ biz_entity: next === t.entity ? null : next, updated_at: new Date().toISOString() }).eq('id', t.id);
  if (error) return toast('Erro: ' + error.message);
  await bankLoadTxns(); render();
};
// Conectar Gmail abre o login do Google numa janela pequena; o app continua aberto.
window.addEventListener('message', (e) => { if (e.origin !== location.origin) return; if (e.data === 'gmail-ok') { toast('Gmail conectado'); render(); } });
ACTIONS['bank-connect'] = async () => {
  const w = window.open('about:blank', 'tempo-gmail', 'width=480,height=680');
  try {
    const r = await bankApi('start');
    if (w && !w.closed) w.location.href = r.url; else location.href = r.url;
  } catch (e) { if (w) w.close(); toast('Não consegui conectar: ' + e.message); }
};
ACTIONS['bank-sync'] = () => bankRefresh(true);
ACTIONS['bank-mode'] = async (el) => {
  const entity = el.dataset.entity;
  BANK.mode[entity] = BANK.mode[entity] === 'novo' ? 'revisado' : 'novo';
  await bankLoadTxns(); render();
};
ACTIONS['bank-review-all'] = async (el) => {
  const entity = el.dataset.entity;
  const ids = (BANK.txns[entity] || []).map(t => t.id);
  if (!ids.length) return;
  const { error } = await db.adapter.client.from('tempo_bank_txns')
    .update({ review_status: 'revisado', updated_at: new Date().toISOString() }).in('id', ids);
  if (error) return toast('Erro: ' + error.message);
  BANK.txns[entity] = []; render();
};
// Abas do Financeiro PF: Visão geral, Conta, Cartão e Investimentos (caixinhas).
const PF_TABS = [['geral', 'Visão geral'], ['conta', 'Conta corrente'], ['cartao', 'Cartão'], ['invest', 'Investimentos']];
// Caixinhas: saldo informado por você (print do app), guardado por data.
const CX_KEY = 'caixinhaSnaps';
const cxSnaps = () => (db.setting(CX_KEY, []) || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
function cxSave(list) { db.setSetting(CX_KEY, list); db.emit(); }
const cxFmt = (v) => fmtMoney(v);
function pfInvestHTML() {
  const snaps = cxSnaps();
  const last = snaps[0];
  const today = ymd(new Date());
  const names = last ? last.boxes.map(b => b.name) : ['Turbo Ultravioleta', 'APARTAMENTO', 'FREELAS', 'GIRO'];
  const form = `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Atualizar caixinhas</h3><span class="small muted">use o saldo que aparece no app do Nubank</span></div><div class="panel-b">
    <form data-form="cx-snap" class="stack" style="gap:8px">
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><span class="small muted">Data do saldo</span><input type="date" name="date" class="input" value="${today}" style="width:170px"></div>
      ${names.map((n, i) => `<div class="row" style="gap:8px;align-items:center"><input class="input" name="n${i}" value="${esc(n)}" style="width:240px"><input class="input" name="v${i}" type="number" step="0.01" min="0" placeholder="0,00" style="width:170px;text-align:right"></div>`).join('')}
      <div class="row" style="gap:8px"><button type="button" class="btn sm ghost" data-act="cx-add-row">+ caixinha</button><button class="btn primary sm">Salvar atualização</button></div>
    </form></div></div>`;
  const current = last ? `<div class="kpis">
    <div class="kpi"><span class="k">Total em caixinhas</span><span class="v">${fmtMoney0(last.total)}</span><span class="s">saldo de ${esc(last.date)}</span></div>
    ${last.boxes.map(b => `<div class="kpi"><span class="k">${esc(b.name)}</span><span class="v">${fmtMoney0(b.value)}</span><span class="s">${last.total ? Math.round(b.value / last.total * 100) : 0}% do total</span></div>`).join('')}
  </div>` : '<div class="empty small" style="margin-bottom:14px">Nenhuma atualização ainda. Preencha o formulário abaixo.</div>';
  const hist = snaps.length ? `<div class="panel"><div class="panel-h"><h3>Últimas atualizações</h3><span class="small muted">mais recente primeiro</span></div><div class="panel-b tight"><table class="grid compact fin"><thead><tr><th>Data</th><th>Caixinha</th><th style="text-align:right">Saldo</th><th style="text-align:right">Total</th><th></th></tr></thead><tbody>${snaps.map(sn => sn.boxes.map((b, i) => `<tr><td class="mono small">${i === 0 ? esc(sn.date) : ''}</td><td>${esc(b.name)}</td><td class="num">${cxFmt(b.value)}</td><td class="num">${i === 0 ? cxFmt(sn.total) : ''}</td><td>${i === 0 ? `<button class="btn sm ghost" data-act="cx-del" data-date="${esc(sn.date)}">Apagar</button>` : ''}</td></tr>`).join('')).join('')}</tbody></table></div></div>` : '';
  return current + form + hist;
}
ACTIONS['cx-add-row'] = (el) => {
  const form = el.closest('form'); const i = form.querySelectorAll('input[name^="n"]').length;
  const wrap = document.createElement('div'); wrap.className = 'row'; wrap.style.cssText = 'gap:8px;align-items:center';
  wrap.innerHTML = `<input class="input" name="n${i}" placeholder="Nome da caixinha" style="width:240px"><input class="input" name="v${i}" type="number" step="0.01" min="0" placeholder="0,00" style="width:170px;text-align:right">`;
  el.closest('.row').before(wrap);
};
ACTIONS['cx-del'] = async (el) => {
  const ok = await confirmBox({ title: 'Apagar esta atualização?', body: 'Os saldos de ' + el.dataset.date + ' serão removidos.', ok: 'Apagar', danger: true });
  if (!ok) return;
  cxSave(cxSnaps().filter(x => x.date !== el.dataset.date)); render();
};
document.addEventListener('submit', (e) => {
  const form = e.target.closest && e.target.closest('[data-form="cx-snap"]'); if (!form) return;
  e.preventDefault();
  saveCxSnap(form);
});
function saveCxSnap(form) {
  const fd = new FormData(form);
  const boxes = [];
  for (let i = 0; i < 50; i++) {
    if (!fd.has('n' + i)) break;
    const name = String(fd.get('n' + i) || '').trim(), raw = fd.get('v' + i);
    if (name && raw !== null && String(raw).trim() !== '') boxes.push({ name, value: Number(raw) || 0 });
  }
  const date = String(fd.get('date') || ymd(new Date()));
  if (!boxes.length) return toast('Informe pelo menos uma caixinha com saldo');
  const total = boxes.reduce((t, b) => t + b.value, 0);
  cxSave([...cxSnaps().filter(x => x.date !== date), { date, boxes, total }]);
  toast('Atualização salva'); render();
};
VIEWS.financepf = () => {
  bankRefresh();
  const tab = BANK.pfTab || 'geral';
  const body = tab === 'invest' ? pfInvestHTML() : `${bankSummaryHTML('pf')}${bankPanel('pf')}`;
  const tabs = `<div class="seg" style="margin-bottom:12px">${PF_TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="pf-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  return { title: 'Financeiro PF', actions: '', html: tabs + body };
};
ACTIONS['pf-tab'] = (el) => { const v = el.dataset.v; BANK.pfTab = v; BANK.origin = v === 'conta' ? 'conta' : v === 'cartao' ? 'cartao' : 'all'; render(); };

/* Sugestão de Pix: um projeto em aberto cujo saldo bate com o valor recebido (tolerância de R$ 1); o cliente já ligado ao pagador tem prioridade. */
function bankOpenMatch(t) {
  const amt = Math.abs(Number(t.amount));
  const hits = db.all('tempo_projects').filter(p => { const rem = remainingOf(p); return rem !== null && rem > 0 && Math.abs(rem - amt) <= 1; });
  const cid = bankClientOf(t);
  const mine = cid ? hits.filter(p => clientOf(p)?.id === cid) : [];
  const pick = mine.length ? mine : hits;
  return pick.length === 1 ? pick[0] : null;
}
/* Cliente que já pagou esta contraparte (pelos lançamentos já ligados a projetos). */
function bankClientOf(t) {
  const pl = BANK.plinks || [];
  const rows = (BANK.every || []).filter(x => x.flow === 'in' && x.counterpart === t.counterpart && x.id !== t.id);
  for (const r of rows) {
    const pids = [r.payment_id, ...pl.filter(l => l.txn_id === r.id).map(l => l.payment_id)].filter(Boolean);
    for (const pid of pids) {
      const pay = db.get('tempo_payments', pid); const pr = pay ? db.get('tempo_projects', pay.project_id) : null;
      const c = pr ? clientOf(pr) : null; if (c) return c.id;
    }
  }
  return null;
}
/* Combinações de projetos em aberto cuja soma do saldo bate com o valor recebido (tolerância de R$ 1). */
function bankComboMatch(t) {
  const amt = Math.abs(Number(t.amount));
  const cid = bankClientOf(t);
  const all = db.all('tempo_projects').filter(p => (remainingOf(p) || 0) > 0).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  // cliente já ligado a esse pagador tem prioridade; se não houver combinação dele, vale qualquer projeto em aberto
  const mine = cid ? all.filter(p => clientOf(p)?.id === cid) : [];
  const search = (open) => { const out = []; bankSumCombos(open, amt, out); return out; };
  const own = search(mine.slice(0, 14));
  return own.length ? own : search(all.slice(0, 14));
}
function bankSumCombos(open, amt, out) {
  const rec = (i, chosen, sum) => {
    if (out.length >= 4) return;
    if (chosen.length && Math.abs(sum - amt) <= 1) { out.push(chosen.slice()); return; }
    if (sum > amt + 1) return;
    for (let k = i; k < open.length && out.length < 4; k++) { chosen.push(open[k]); rec(k + 1, chosen, sum + remainingOf(open[k])); chosen.pop(); }
  };
  rec(0, [], 0);
}
/* Aceita a sugestão (um ou vários projetos): um pagamento por projeto (saldo total de cada um), todos ligados à entrada. */
ACTIONS['bank-psug'] = async (el) => {
  const t = (BANK.all.pj || []).find(x => x.id === el.dataset.id); if (!t) return;
  const projs = el.dataset.pids.split(',').map(id => db.get('tempo_projects', id)).filter(Boolean);
  if (!projs.length) return;
  const made = projs.map(p => { const amt = remainingOf(p); return { p, amt, pay: db.insert('tempo_payments', { project_id: p.id, amount: amt, date: t.posted_on, note: 'Pix', invoice: '' }, true) }; });
  const rows = made.map(x => ({ txn_id: t.id, payment_id: x.pay.id, amount: x.amt }));
  const { error } = await db.adapter.client.from('tempo_bank_payment_links').insert(rows);
  if (error) { made.forEach(x => db.remove('tempo_payments', x.pay.id, true)); return toast('Erro: ' + error.message); }
  // com um projeto só, o vínculo também fica no lançamento (usado pela leitura e pelo desfazer)
  if (made.length === 1) {
    const { error: e2 } = await db.adapter.client.from('tempo_bank_txns').update({ payment_id: made[0].pay.id, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (!e2) t.payment_id = made[0].pay.id;
  }
  BANK.plinks = [...(BANK.plinks || []), ...rows];
  made.forEach(x => {
    logEvent('payment', x.pay.id, 'payment', `Recebido ${fmtMoney(x.amt)} (Pix)`, null, null, { project_id: x.p.id });
    const pr = db.get('tempo_projects', x.p.id);
    const full = remainingOf(pr) === 0;
    const target = statuses('payment').find(s => s.name === (full ? 'Pago' : 'Pago Parcial'));
    if (target) setPaymentStatus(pr, target.id);
    if (full && !pr.paid_at) db.update('tempo_projects', x.p.id, { paid_at: nowISO() }, true);
  });
  toast(made.length === 1 ? `${made[0].p.name}: ${remainingOf(made[0].p) === 0 ? 'marcado como pago' : 'pagamento parcial lançado'}` : `Entrada ligada a ${made.length} projetos`);
  render();
};

/* Pix recebido (PJ, últimos 30 dias) ainda sem vínculo e com alguma sugestão de projeto. */
function pixPending() {
  const ign = new Set(db.setting('pixIgnored', []));
  const cut = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const linked = new Set((BANK.plinks || []).map(l => l.txn_id));
  return (BANK.all.pj || [])
    .filter(t => t.flow === 'in' && !t.payment_id && !linked.has(t.id) && (t.posted_on || '') >= cut && !ign.has(t.id))
    .map(t => { const one = bankOpenMatch(t); return { t, one, combos: one ? [] : bankComboMatch(t) }; })
    .filter(x => x.one || x.combos.length);
}
/* Cartão no início (Time Sheet) com os Pix que esperam confirmação. */
function pixSideHTML() {
  const list = pixPending();
  if (!list.length) return '';
  const linha = (x) => x.one
    ? `bate com <b>${esc(x.one.name)}</b>`
    : `combina com ${x.combos.slice(0, 2).map(c => c.map(p => esc(p.name)).join(' + ')).join(' ou ')}`;
  return `<div class="card pix-alert"><div class="row between"><b>Pix recebido · confirmar</b><button class="btn sm ghost" data-act="go" data-route="finance">Ver</button></div>
    ${list.slice(0, 4).map(x => `<div class="small" style="margin-top:6px"><b>${fmtMoney(Math.abs(Number(x.t.amount)))}</b> de ${esc(x.t.counterpart || 'pagador')} · ${linha(x)}</div>`).join('')}</div>`;
}
/* Popup de uma vez por Pix: aparece quando chega um recebimento novo com sugestão. */
let PIX_LAYER = null;
function pixAlert() {
  if (PIX_LAYER || !db.adapter || !db.adapter.persistent) return;
  const seen = new Set(db.setting('pixSeen', []));
  const next = pixPending().find(x => !seen.has(x.t.id));
  if (!next) return;
  db.setSetting('pixSeen', [...seen, next.t.id]);
  const t = next.t, amt = Math.abs(Number(t.amount));
  const opcoes = next.one ? [[next.one]] : next.combos.slice(0, 3);
  const botoes = opcoes.map(c => `<button class="btn primary" data-act="pix-do" data-id="${t.id}" data-pids="${c.map(p => p.id).join(',')}">${c.map(p => esc(p.name)).join(' + ')} · ${fmtMoney0(c.reduce((a, p) => a + remainingOf(p), 0))}</button>`).join('');
  PIX_LAYER = openLayer({
    html: `<div class="dh"><h2>Você recebeu um pagamento</h2><span class="grow"></span><button class="btn icon ghost" data-act="pix-later" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db" style="padding:16px">
        <div><b>${fmtMoney(amt)}</b> de ${esc(t.counterpart || 'pagador')} em ${esc(t.posted_on || '')}</div>
        <p class="small muted" style="margin:10px 0">Temos sugestão${opcoes.length > 1 ? 'ões' : ''} de projeto${next.one ? '' : ' (combinação de saldos em aberto)'}. Confirme para marcar como pago, ou deixe para depois.</p>
        <div class="row gap-s" style="flex-wrap:wrap">${botoes}</div>
        <div class="row gap-s" style="margin-top:14px"><button class="btn sm ghost" data-act="pix-open">Ver no financeiro</button><span class="grow"></span><button class="btn sm ghost" data-act="pix-ignore" data-id="${t.id}">Ignorar este Pix</button></div>
      </div>`,
    onClose: () => { PIX_LAYER = null; }
  });
}
ACTIONS['pix-do'] = async (el) => { await ACTIONS['bank-psug'](el); PIX_LAYER && PIX_LAYER.close(); };
ACTIONS['pix-later'] = () => { PIX_LAYER && PIX_LAYER.close(); };
ACTIONS['pix-open'] = () => { PIX_LAYER && PIX_LAYER.close(); go('finance'); };
ACTIONS['pix-ignore'] = (el) => {
  db.setSetting('pixIgnored', [...new Set([...db.setting('pixIgnored', []), el.dataset.id])]);
  PIX_LAYER && PIX_LAYER.close(); render(); toast('Pix ignorado');
};

/* Entradas da tabela de despesas (linhas "Não recebido" de freelas) acompanham os pagamentos de projeto nos dois sentidos:
   - extrato ligado a um pagamento de projeto (vínculo do banco) → a linha do mesmo nome e mês vira "Recebido" na data do extrato;
   - pagamento lançado no projeto (sem extrato) → a linha do mesmo nome e mês vira "Recebido" na data do pagamento. */
const incNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const incMatch = (rowName, projName) => { const a = incNorm(rowName), b = incNorm(projName); return !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)))); };
function bankSyncIncomeRows() {
  const every = BANK.every || [];
  const marks = []; // { month, projectId, date }
  every.forEach(t => {
    if (t.flow !== 'in' || !t.posted_on) return;
    const pids = new Set([t.payment_id, ...((BANK.plinks || []).filter(l => l.txn_id === t.id && l.payment_id).map(l => l.payment_id))].filter(Boolean));
    pids.forEach(pid => { const pay = db.get('tempo_payments', pid); if (pay) marks.push({ month: String(t.posted_on).slice(0, 7), projectId: pay.project_id, date: t.posted_on }); });
  });
  db.all('tempo_payments').forEach(pay => { if (pay.date) marks.push({ month: String(pay.date).slice(0, 7), projectId: pay.project_id, date: pay.date }); });
  let changed = false;
  const incomeRows = db.all('tempo_expenses').filter(e => e.kind === 'in' && e.status === 'Não recebido');
  marks.forEach(m => {
    const pr = db.get('tempo_projects', m.projectId); if (!pr) return;
    const row = incomeRows.find(e => e.month === m.month && incMatch(e.name, pr.name));
    if (!row) return;
    db.update('tempo_expenses', row.id, { status: 'Recebido', paid_on: m.date }, true);
    row.status = 'Recebido'; changed = true;
  });
  if (changed) db.emit();
}
