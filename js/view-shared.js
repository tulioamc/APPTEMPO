/* Despesas do filho, divididas com a Amanda.
   Gastos fixos vêm da tela Despesas (subcategoria PESSOAL/Filho). Extras são lançados aqui.
   Regra geral: a Amanda paga metade do que não é plano de saúde.
   Plano de saúde (linha com "plano" no nome): a Amanda paga a parte dela (enquanto estiver no plano)
   mais metade da parte do Rafa. Depois que ela sai do plano, paga só a metade da parte do Rafa.
   A Amanda transfere um valor fixo; a diferença mês a mês vira saldo acumulado. */
const SK_FIXED_KEY = 'PESSOAL/Filho';
const SK = { month: null };
const skId = () => Math.random().toString(36).slice(2, 10);
const skData = () => { const d = db.setting('sharedKid', null) || {}; return { months: d.months || {}, plan: d.plan || {} }; };
const skSave = (d) => db.setSetting('sharedKid', d);
const skMonth = (d, ym) => d.months[ym] || { received: 0, extras: [] };
const skFixed = (ym) => db.all('tempo_expenses').filter(r => r.month === ym && r.kind === 'out' && r.cat === SK_FIXED_KEY && r.status !== 'Não teve');
const skIsPlan = (r) => /plano/i.test(r.name || '');
const skElaIn = (plan, ym) => !plan.elaSaiEm || ym < plan.elaSaiEm;
const skCalc = (d, ym) => {
  const m = skMonth(d, ym), plan = d.plan || {};
  const fixed = skFixed(ym);
  const planRows = fixed.filter(skIsPlan), other = fixed.filter(r => !skIsPlan(r));
  const planTotal = planRows.reduce((t, r) => t + (Number(r.amount) || 0), 0);
  const otherSum = other.reduce((t, r) => t + (Number(r.amount) || 0), 0) + m.extras.reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const amandaPlan = planRows.length ? (skElaIn(plan, ym) ? (Number(plan.ela) || 0) : 0) + (Number(plan.filho) || 0) / 2 : 0;
  const total = planTotal + otherSum;
  const due = otherSum / 2 + amandaPlan;            // parte da Amanda no mês
  const received = Number(m.received) || 0;
  return { m, fixed, planRows, planTotal, otherSum, amandaPlan, total, due, received, diff: received - due, has: fixed.length > 0 || m.extras.length > 0 || received > 0 };
};
const skMonths = (d) => [...new Set([...Object.keys(d.months), ...db.all('tempo_expenses').filter(r => r.cat === SK_FIXED_KEY).map(r => r.month)])].filter(Boolean).sort().reverse();
const skBalance = (d) => skMonths(d).reduce((t, ym) => { const c = skCalc(d, ym); return c.fixed.length || c.m.extras.length ? t + c.diff : t; }, 0);
const skStatus = (diff) => {
  if (Math.abs(diff) < 0.005) return '<span class="tag tg">Quites</span>';
  return diff > 0 ? `<span class="tag tg">Você deve a Amanda ${fmtMoney(diff)}</span>` : `<span class="tag tg">Amanda deve a você ${fmtMoney(-diff)}</span>`;
};

VIEWS.shared = () => {
  const d = skData();
  const ym = SK.month || ymd(new Date()).slice(0, 7); SK.month = ym;
  const c = skCalc(d, ym);
  const bal = skBalance(d);
  const plan = d.plan;
  const fixedRows = c.fixed.map(r => `<tr><td>${esc(r.name)}${skIsPlan(r) ? ' <span class="small muted">· plano</span>' : ''}</td><td class="mono" style="text-align:right">${fmtMoney(r.amount)}</td><td class="small muted">Fixo · editar em Despesas</td><td></td></tr>`).join('');
  const extraRows = c.m.extras.map(l => `<tr>
    <td><input class="input" value="${esc(l.name || '')}" placeholder="Ex.: dentista, remédio" data-on="sk-extra" data-id="${l.id}" data-k="name"></td>
    <td><input class="input" type="number" step="0.01" min="0" value="${l.amount || ''}" style="text-align:right" data-on="sk-extra" data-id="${l.id}" data-k="amount"></td>
    <td class="small muted">Extra do mês</td>
    <td><button class="btn sm ghost" data-act="sk-del" data-id="${l.id}">Remover</button></td></tr>`).join('');
  const months = skMonths(d).filter(k => skCalc(d, k).has).map(k => {
    const mc = skCalc(d, k);
    return `<tr><td><button class="btn sm ghost" data-act="sk-go" data-ym="${k}">${esc(rbLabel(k))}</button></td><td class="mono" style="text-align:right">${fmtMoney(mc.total)}</td><td class="mono" style="text-align:right">${fmtMoney(mc.due)}</td><td class="mono" style="text-align:right">${fmtMoney(mc.received)}</td><td>${skStatus(mc.diff)}</td></tr>`;
  }).join('');
  const planBox = `
    <div class="field"><span class="lbl">Plano de saúde: parte da Amanda (ela)</span>
      <input type="number" step="0.01" min="0" class="input" style="width:200px" value="${plan.ela || ''}" data-on="sk-plan" data-k="ela" aria-label="Parte da Amanda no plano"></div>
    <div class="field"><span class="lbl">Plano de saúde: parte do Rafa</span>
      <input type="number" step="0.01" min="0" class="input" style="width:200px" value="${plan.filho || ''}" data-on="sk-plan" data-k="filho" aria-label="Parte do Rafa no plano"></div>
    <div class="field"><span class="lbl">Amanda sai do plano a partir de (vazio = ainda está)</span>
      <input type="month" class="input" style="width:170px" value="${plan.elaSaiEm || ''}" data-on="sk-plan" data-k="elaSaiEm" aria-label="Mês em que ela sai do plano"></div>`;
  const html = `
    <div class="row" style="gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <input type="month" class="input" style="width:170px" value="${ym}" data-on="sk-month" aria-label="Mês">
      <span class="small muted">Saldo acumulado: ${skStatus(bal)}</span>
    </div>
    <div class="row" style="gap:24px;flex-wrap:wrap;margin-bottom:16px">
      <div><div class="small muted">Gastos do filho no mês</div><div class="mono">${fmtMoney(c.total)}</div></div>
      <div><div class="small muted">Parte da Amanda</div><div class="mono">${fmtMoney(c.due)}</div><div class="small muted">${c.planRows.length ? `inclui plano ${fmtMoney(c.amandaPlan)}` : ''}</div></div>
      <div><div class="small muted">Amanda transferiu</div><div class="mono">${fmtMoney(c.received)}</div></div>
      <div><div class="small muted">Neste mês</div>${skStatus(c.diff)}</div>
    </div>
    <div class="field"><span class="lbl">Valor fixo recebido da Amanda neste mês</span>
      <input type="number" step="0.01" min="0" class="input" style="width:200px" value="${c.m.received || ''}" data-on="sk-recv" aria-label="Recebido"></div>
    <details style="margin:12px 0"><summary class="small">Configuração do plano de saúde</summary><div style="margin-top:10px">${planBox}</div></details>
    <div class="row" style="gap:8px;margin:12px 0"><button class="btn sm" data-act="sk-add">+ Extra do mês</button></div>
    <table class="grid"><thead><tr><th>Descrição</th><th style="text-align:right">Valor pago</th><th>Origem</th><th></th></tr></thead>
      <tbody>${(fixedRows + extraRows) || '<tr><td colspan="4" class="small muted">Nenhum gasto neste mês. Lance os fixos em Despesas com a subcategoria Filho.</td></tr>'}</tbody></table>
    <h3 style="margin:22px 0 8px">Histórico mensal</h3>
    <table class="grid"><thead><tr><th>Mês</th><th style="text-align:right">Gastos</th><th style="text-align:right">Parte da Amanda</th><th style="text-align:right">Recebido</th><th>Diferença</th></tr></thead>
      <tbody>${months || '<tr><td colspan="5" class="small muted">Sem histórico ainda.</td></tr>'}</tbody></table>`;
  return { title: 'Despesas do filho', actions: '', html };
};

CHANGES['sk-month'] = (el) => { SK.month = el.value || SK.month; render(); };
CHANGES['sk-plan'] = (el) => {
  const d = skData(); const k = el.dataset.k;
  d.plan = { ...d.plan, [k]: k === 'elaSaiEm' ? (el.value || null) : (Number(el.value) || 0) };
  skSave(d); render();
};
CHANGES['sk-recv'] = (el) => { const d = skData(); const ym = SK.month; const m = skMonth(d, ym); m.received = Number(el.value) || 0; d.months[ym] = m; skSave(d); render(); };
CHANGES['sk-extra'] = (el) => {
  const d = skData(), ym = SK.month, m = skMonth(d, ym);
  const l = m.extras.find(x => x.id === el.dataset.id); if (!l) return;
  l[el.dataset.k] = el.dataset.k === 'amount' ? (Number(el.value) || 0) : el.value;
  d.months[ym] = m; skSave(d); render();
};
ACTIONS['sk-add'] = () => {
  const d = skData(), ym = SK.month, m = skMonth(d, ym);
  m.extras = [...m.extras, { id: skId(), name: '', amount: 0 }];
  d.months[ym] = m; skSave(d); render();
};
ACTIONS['sk-del'] = (el) => {
  const d = skData(), ym = SK.month, m = skMonth(d, ym);
  m.extras = m.extras.filter(l => l.id !== el.dataset.id);
  d.months[ym] = m; skSave(d); render();
};
ACTIONS['sk-go'] = (el) => { SK.month = el.dataset.ym; render(); };
