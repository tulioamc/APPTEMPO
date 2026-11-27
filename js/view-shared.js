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
/* Gastos do Rafa que vêm sozinhos do extrato (V2.06.191): transações de saída com a etiqueta "Rafa" (escola, dentista, remédios…) e a parte do Rafa no plano
   (valor em plan.filho, a partir de plan.desde, nos meses em que há pagamento da SulAmérica). Entram em "Despesas Rafa" e na conta da Amanda (metade). */
const SK_MIN_YM = '2026-01';
const skBankLoad = () => { if (typeof BANK === 'undefined' || BANK.every || BANK.skPediu || typeof bankLoadTxns !== 'function') return; BANK.skPediu = true; bankLoadTxns().then(() => render()).catch(() => {}); };
const SK_DENTISTA = /cristiana\s+abrantes|cristiana.*fonte|crescer\s*odonto/i;   // dentista do Rafa (27/11): entra sozinha, salvo se o lançamento tiver outra etiqueta
const skTxns = (ym) => (typeof BANK !== 'undefined' && BANK.every || []).filter(t => (t.tag === 'Rafa' || (!t.tag && SK_DENTISTA.test(String(t.counterpart || '') + ' ' + String(t.memo || '')))) && t.flow === 'out' && t.scope !== 'interna' && (t.posted_on || '').slice(0, 7) === ym && Number(t.amount) < 0)
  .map(t => ({ id: t.id, name: String(t.counterpart || t.memo || 'Gasto').replace(/\s*\(Transferência enviada\)/i, ''), amount: Math.abs(Number(t.amount)), cat: t.category || '', date: t.posted_on, txn: true }));
/* Plano de saúde (V2.06.195): vale todo mês desde o começo, não só nos meses com pagamento. O valor acompanha a mensalidade real da SulAmérica
   (última cobrança até o mês, em proporção ao valor de referência plan.base), então um reajuste entra sozinho; sem cobrança lida, usa o valor fixo. */
const skPlanScale = (plan, ym) => {
  const base = Number(plan && plan.base) || 0; if (!base) return 1;
  const cobr = (typeof BANK !== 'undefined' && BANK.every || []).filter(t => t.flow === 'out' && t.scope !== 'interna' && /sul ?am[eé]rica/i.test(t.counterpart || '') && Math.abs(Number(t.amount)) >= 1500)
    .map(t => ({ m: (t.posted_on || '').slice(0, 7), v: Math.abs(Number(t.amount)) })).sort((a, b) => a.m.localeCompare(b.m));
  if (!cobr.length) return 1;
  const ate = cobr.filter(c => c.m <= ym), c = ate.length ? ate[ate.length - 1] : cobr[0];
  return c.v / base;
};
const skPlanRafa = (plan, ym) => {
  const v = (Number(plan && plan.filho) || 0) * skPlanScale(plan, ym); if (!v || ym < (plan.desde || SK_MIN_YM)) return [];
  return [{ id: 'plano-rafa', name: 'Plano de saúde (parte do Rafa)', amount: Math.round(v * 100) / 100, cat: 'Saúde', plano: true }];
};
const skPlanEla = (plan, ym) => (skElaIn(plan, ym) && ym >= (plan.desde || SK_MIN_YM) ? Math.round((Number(plan.ela) || 0) * skPlanScale(plan, ym) * 100) / 100 : 0);
const skFixed = (ym) => db.all('tempo_expenses').filter(r => r.month === ym && r.kind === 'out' && r.cat === SK_FIXED_KEY && r.status !== 'Não teve');
const skIsPlan = (r) => /plano/i.test(r.name || '');
const skElaIn = (plan, ym) => !plan.elaSaiEm || ym < plan.elaSaiEm;
/* Mês sem pagamento da Amanda e, no seguinte, quase o dobro (ou mais): o valor é dividido (média) entre os meses em questão. */
const skYmAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const x = new Date(y, m - 1 + n, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const skRecRaw = (d, ym) => {
  const m = skMonth(d, ym);
  const lancado = Number(m.received) || db.all('tempo_expenses').filter(r => r.month === ym && r.kind === 'in' && /amanda/i.test(r.name || '') && r.status === 'Recebido').reduce((t, r) => t + (Number(r.amount) || 0), 0);
  if (lancado) return lancado;
  /* Sem valor digitado nem lançamento em Despesas: vale o que a Amanda transferiu no extrato naquele mês (V2.06.199). */
  return (typeof BANK !== 'undefined' && BANK.every || []).filter(t => t.flow === 'in' && t.scope !== 'interna' && /amanda/i.test(t.counterpart || '') && (t.posted_on || '').slice(0, 7) === ym && ym >= SK_MIN_YM)
    .reduce((x, t) => x + Math.abs(Number(t.amount)), 0);
};
function skRecAdj(d, ym) {
  const raw = skRecRaw(d, ym), hoje = new Date().toISOString().slice(0, 7);
  const dueDe = (y) => skCalc(d, y, true).due;
  const dobra = (r, meses) => r >= (1 + 0.8 * (meses.length - 1)) * (meses.reduce((t, y) => t + dueDe(y), 0) / meses.length);   // "quase o dobro" com 1 mês de falta
  if (raw > 0) {   // mês que pagou: olha para trás
    const gap = []; for (let i = 1; i <= 6; i++) { const y = skYmAdd(ym, -i); if (skRecRaw(d, y) > 0 || dueDe(y) <= 0) break; gap.push(y); }
    if (gap.length && dobra(raw, [ym, ...gap])) return raw / (gap.length + 1);
    return raw;
  }
  if (ym >= hoje || dueDe(ym) <= 0) return raw;
  let k = 0, p = null; for (let i = 1; i <= 6; i++) { const y = skYmAdd(ym, i); if (y > hoje) break; if (skRecRaw(d, y) > 0) { p = y; k = i; break; } }   // mês sem pagamento: olha para frente
  if (!p) return raw;
  const grupo = [p]; for (let i = 1; i < k; i++) grupo.push(skYmAdd(p, -i));
  const r = skRecRaw(d, p); if (!dobra(r, [...grupo, ym])) return raw;
  const gapAll = []; for (let i = 1; i <= k; i++) gapAll.push(skYmAdd(p, -i)); if (!gapAll.includes(ym)) return raw;
  return r / (gapAll.length + 1);
}
const skCalc = (d, ym, noAdj) => {
  const m = skMonth(d, ym), plan = d.plan || {};
  const fixed = skFixed(ym);
  const planRows = fixed.filter(skIsPlan), other = fixed.filter(r => !skIsPlan(r));
  const planTotal = planRows.reduce((t, r) => t + (Number(r.amount) || 0), 0);
  const otherSum = other.reduce((t, r) => t + (Number(r.amount) || 0), 0) + m.extras.reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const planEla = skPlanEla(plan, ym);   // o plano dela é só dela: ela paga integral, sem dividir por 2
  const amandaPlan = planEla + (planRows.length ? (Number(plan.filho) || 0) / 2 : 0);
  const auto = [...skTxns(ym), ...(planRows.length ? [] : skPlanRafa(plan, ym))];
  const autoSum = auto.reduce((t, x) => t + x.amount, 0);
  const total = planTotal + otherSum + autoSum;
  const due = (otherSum + autoSum) / 2 + amandaPlan;            // parte da Amanda no mês: metade de tudo do Rafa
  const received = noAdj ? skRecRaw(d, ym) : skRecAdj(d, ym);   // sem valor digitado vale o que a Amanda mandou ("Amanda - Contas Rafa" em Despesas); mês pulado e depois quase o dobro: média
  return { m, fixed, auto, planRows, planEla, planTotal, otherSum, amandaPlan, total, due, received, diff: received - due, has: fixed.length > 0 || auto.length > 0 || m.extras.length > 0 || received > 0 };
};
const skRange = (de) => { const a = [], hoje = new Date().toISOString().slice(0, 7); for (let m = de < SK_MIN_YM ? SK_MIN_YM : de; m <= hoje; m = skYmAdd(m, 1)) a.push(m); return a; };
const skMonths = (d) => [...new Set([...(Number(d.plan && d.plan.filho) ? skRange(d.plan.desde || SK_MIN_YM) : []), ...Object.keys(d.months), ...db.all('tempo_expenses').filter(r => r.cat === SK_FIXED_KEY).map(r => r.month), ...(typeof BANK !== 'undefined' && BANK.every || []).filter(t => (t.tag === 'Rafa' || (!t.tag && SK_DENTISTA.test(String(t.counterpart || '') + ' ' + String(t.memo || '')))) && t.flow === 'out').map(t => (t.posted_on || '').slice(0, 7)).filter(m => m >= SK_MIN_YM)])].filter(Boolean).sort().reverse();
const skBalance = (d) => skMonths(d).filter(ym => ym <= new Date().toISOString().slice(0, 7)).reduce((t, ym) => { const c = skCalc(d, ym); return c.fixed.length || c.auto.length || c.m.extras.length ? t + c.diff : t; }, 0);
const skStatus = (diff) => {
  if (Math.abs(diff) < 0.005) return '<span class="tag tg">Quites</span>';
  return diff > 0 ? `<span class="tag tg">Você deve a Amanda ${fmtMoney(diff)}</span>` : `<span class="tag tg">Amanda deve a você ${fmtMoney(-diff)}</span>`;
};

VIEWS.shared = () => {
  skBankLoad();
  const d = skData();
  const ym = SK.month || ymd(new Date()).slice(0, 7); SK.month = ym;
  const c = skCalc(d, ym);
  const bal = skBalance(d);
  const plan = d.plan;
  const fixedRows = c.fixed.map(r => `<tr><td>${esc(r.name)}${skIsPlan(r) ? ' <span class="small muted">· plano</span>' : ''}</td><td class="mono" style="text-align:right">${fmtMoney(r.amount)}</td><td class="small muted">Fixo · editar em Despesas</td><td></td></tr>`).join('');
  const autoRows = c.auto.map(x => `<tr><td>${esc(x.name)}${x.cat ? ` <span class="small muted">· ${esc(x.cat)}</span>` : ''}</td><td class="mono" style="text-align:right">${fmtMoney(x.amount)}</td><td class="small muted" data-tip="${x.plano ? 'Valor da parte do Rafa no plano, definido em Configuração do plano de saúde' : 'Transação do extrato com a etiqueta Rafa'}">${x.plano ? 'Plano · parte do Rafa' : `Extrato · ${fmtDate(x.date).slice(0, 5)}`}</td><td></td></tr>`).join('');
  const elaRow = c.planEla ? `<tr><td>Plano de saúde (parte da Amanda) <span class="small muted">· Saúde</span></td><td class="mono" style="text-align:right">${fmtMoney(c.planEla)}</td><td class="small muted" data-tip="Você paga o plano dela e ela devolve. Não divide por 2: entra inteiro na parte da Amanda e não conta nos gastos do filho.">Plano · só dela (integral)</td><td></td></tr>` : '';
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
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi tom-neu"><span class="k">Gastos do filho no mês</span><span class="v">${fmtMoney(c.total)}</span></div>
      <div class="kpi tom-cinza"><span class="k">Parte da Amanda</span><span class="v">${fmtMoney(c.due)}</span><span class="s">${c.amandaPlan ? `inclui plano ${fmtMoney(c.amandaPlan)}` : ''}</span></div>
      <div class="kpi tom-cinza"><span class="k">Amanda transferiu</span><span class="v">${fmtMoney(c.received)}</span></div>
      <div class="kpi ${Math.abs(c.diff) < 0.005 ? 'tom-pos' : 'tom-warn'}"><span class="k">Neste mês</span><span class="v" style="font-size:1em">${skStatus(c.diff)}</span></div>
    </div>
    <div class="panel"><div class="panel-b stack" style="gap:10px">
    <div class="field"><span class="lbl">Valor fixo recebido da Amanda neste mês</span>
      <input type="number" step="0.01" min="0" class="input" style="width:200px" value="${c.m.received || ''}" data-on="sk-recv" aria-label="Recebido"></div>
    <details style="margin:12px 0"><summary class="small">Configuração do plano de saúde</summary><div style="margin-top:10px">${planBox}</div></details>
    <div class="row" style="gap:8px;margin:12px 0"><button class="btn sm" data-act="sk-add">+ Extra do mês</button></div>
    <table class="grid"><thead><tr><th>Descrição</th><th style="text-align:right">Valor pago</th><th>Origem</th><th></th></tr></thead>
      <tbody>${(fixedRows + autoRows + elaRow + extraRows) || '<tr><td colspan="4" class="small muted">Nenhum gasto do Rafa neste mês. Entram sozinhos os do extrato com a etiqueta Rafa; fixos em Despesas com a subcategoria Filho; extras aqui.</td></tr>'}</tbody></table>
    </div></div>
    <div class="panel" style="margin-top:14px"><div class="panel-h"><h3>Histórico mensal</h3></div><div class="panel-b">
    <table class="grid"><thead><tr><th>Mês</th><th style="text-align:right">Gastos</th><th style="text-align:right">Parte da Amanda</th><th style="text-align:right">Recebido</th><th>Diferença</th></tr></thead>
      <tbody>${months || '<tr><td colspan="5" class="small muted">Sem histórico ainda.</td></tr>'}</tbody></table></div></div>`;
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

/* ---------- Card de projeto (Projetos ativos e cliente/agência) ----------
   Fechado: nome, barra de tarefas concluídas (%), status, prazo e cliente.
   1º clique abre ali mesmo com as tarefas (marcar como feita no círculo); 2º clique (no título) abre a janela do projeto. */
const PJC_ABERTOS = new Set();
function pjcDados(p) {
  const tks = tasksOf(p.id).filter(t => statusCat(t.status_id) !== 'cancelled' && t.tipo !== 'reuniao');   // reuniões: tarefa fixa, não conta no %
  const feitas = tks.filter(t => statusCat(t.status_id) === 'done').length;
  return { tks, feitas, pct: tks.length ? Math.round(feitas / tks.length * 100) : 0 };
}
function pjcPrazoHTML(p) {
  if (!p.deadline) return '';
  const d = daysBetween(ymd(new Date()), p.deadline);
  const txt = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : d < 0 ? `${-d}d atrasado` : fmtDate(p.deadline).slice(0, 5);
  return `<span class="pjc-meta${d < 0 ? ' late' : d <= 1 ? ' perto' : ''}">${icon('flag')}${txt}</span>`;
}
function pjcHTML(p, { extra = '' } = {}) {
  const { tks, feitas, pct } = pjcDados(p); const c = clientOf(p); const aberto = PJC_ABERTOS.has(p.id);
  const st = db.get('tempo_status_options', p.status_id);
  const barra = `<span class="pjc-bar"><i style="width:${pct}%"></i></span><span class="pjc-pct mono">${tks.length ? pct + '%' : '—'}</span>`;
  if (!aberto) return `<div class="pjc" data-act="pjc" data-id="${p.id}" title="Clique para ver as tarefas">
    <div class="pjc-l1"><span class="pjc-nome">${esc(p.name)}</span>${barra}</div>
    <div class="pjc-l2">${st ? `<span class="pjc-meta">${icon('clock')}${esc(st.name)}</span>` : ''}${pjcPrazoHTML(p)}<span class="grow"></span>${c ? clientTag(c) : ''}</div>${extra}</div>`;
  const lista = tks.map(t => { const ok = statusCat(t.status_id) === 'done';
    return `<div class="pjc-tk${ok ? ' ok' : ''}"><button class="pjc-ck" data-act="pjc-tk" data-id="${t.id}" aria-label="${ok ? 'Reabrir' : 'Concluir'}">${ok ? icon('check') : ''}</button><span>${esc(t.name)}</span>${t.deadline ? `<span class="faint small mono">${fmtDate(t.deadline).slice(0, 5)}</span>` : ''}</div>`; }).join('');
  return `<div class="pjc aberto">
    <div class="pjc-cab"><button class="pjc-nome grande" data-act="pjc-abrir" data-id="${p.id}" title="Abrir o projeto">${esc(p.name)}</button><button class="btn sm" data-act="ap-resumo" data-id="${p.id}">Resumo</button><button class="btn sm icon ghost" data-act="pjc" data-id="${p.id}" aria-label="Recolher">${icon('chevU')}</button></div>
    <div class="pjc-l1"><span class="pjc-meta">${feitas} de ${tks.length}</span>${barra}</div>
    <div class="pjc-tks">${lista || '<div class="small muted">Sem tarefas.</div>'}</div>
    <div class="pjc-props"><span class="pjc-meta">${icon('clock')}Status</span>${comboBtn('work', p.status_id, 'proj-status', p.id)}${p.deadline ? `<span class="pjc-meta">${icon('flag')}Prazo</span><span class="small">${fmtDate(p.deadline)} ${pjcPrazoHTML(p)}</span>` : ''}${c ? `<span class="pjc-meta">Cliente</span><span>${clientTag(c)}</span>` : ''}</div>${extra}</div>`;
}
ACTIONS['pjc'] = (el) => { const id = el.dataset.id; PJC_ABERTOS.has(id) ? PJC_ABERTOS.delete(id) : PJC_ABERTOS.add(id); db.emit(); };
ACTIONS['pjc-abrir'] = (el) => openProject(el.dataset.id, 'tasks');
ACTIONS['pjc-tk'] = (el) => {
  const t = db.get('tempo_tasks', el.dataset.id); if (!t) return;
  const ok = statusCat(t.status_id) === 'done';
  const alvo = statuses('work').find(s => s.category === (ok ? 'todo' : 'done')); if (alvo) setTaskStatus(t, alvo.id); db.emit();
};

/* Relatórios › Filho (25/11): mês a mês, o que foi gasto com o Rafa, a parte da Amanda, o que ela mandou, a diferença e o
   saldo acumulado, e quantos dias ele ficou com você (Dias de Rafa). Mesmas contas da tela Despesas Rafa. */
/* Detalhe do mês (clicar na linha ou passar o mouse em Gasto / Recebido): cada gasto e cada entrada da Amanda. */
const RF_MES_ABERTO = new Set();
ACTIONS['rf-mes'] = (el) => { const ym = el.dataset.ym; if (RF_MES_ABERTO.has(ym)) RF_MES_ABERTO.delete(ym); else RF_MES_ABERTO.add(ym); render(); };
function skGastoLista(c) {
  const l = [];
  c.fixed.forEach(r => l.push({ nome: r.name || 'Gasto', v: Number(r.amount) || 0, cat: r.cat === SK_FIXED_KEY ? '' : r.cat }));
  c.m.extras.forEach(r => l.push({ nome: r.name || 'Extra', v: Number(r.amount) || 0, cat: 'extra' }));
  c.auto.forEach(r => l.push({ nome: r.name, v: r.amount, cat: r.cat || '', dt: r.date || '' }));
  return l.filter(x => x.v).sort((a, b) => b.v - a.v);
}
/* Entradas da Amanda do mês, uma por linha: valor digitado, lançamentos "Recebido" em Despesas ou, sem eles, as transferências do extrato. */
function skAmandaLista(d, ym) {
  const m = skMonth(d, ym); let l = [];
  if (Number(m.received)) l = [{ nome: 'Valor digitado em Despesas Rafa', v: Number(m.received) }];
  else {
    l = db.all('tempo_expenses').filter(r => r.month === ym && r.kind === 'in' && /amanda/i.test(r.name || '') && r.status === 'Recebido').map(r => ({ nome: r.name, v: Number(r.amount) || 0, dt: r.paid_on || '' }));
    if (!l.length) l = (typeof BANK !== 'undefined' && BANK.every || []).filter(t => t.flow === 'in' && t.scope !== 'interna' && /amanda/i.test(t.counterpart || '') && (t.posted_on || '').slice(0, 7) === ym && ym >= SK_MIN_YM)
      .map(t => ({ nome: t.counterpart || 'Amanda', v: Math.abs(Number(t.amount)), dt: t.posted_on })).sort((a, b) => (a.dt < b.dt ? -1 : 1));
  }
  return { l, soma: l.reduce((t, x) => t + x.v, 0) };
}
VIEWS.relfilho = () => {
  skBankLoad();
  const d = skData(); const meses = skMonths(d).slice(0, 12);
  const nomeMes = (ym) => { const s = new Date(ym + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
  const diasT = (ym) => { if (typeof rafaQuem !== 'function') return null; const [y, m] = ym.split('-').map(Number); let n = 0; const fim = new Date(y, m, 0).getDate(); for (let i = 1; i <= fim; i++) if (rafaQuem(`${ym}-${String(i).padStart(2, '0')}`) === 'T') n++; return n; };
  const linhas = meses.map(ym => ({ ym, c: skCalc(d, ym), dias: diasT(ym) })).filter(x => x.c.has);
  const ant = [...linhas].reverse(); let saldo = 0; const saldoDe = {};
  ant.forEach(x => { if (x.c.fixed.length || x.c.auto.length || x.c.m.extras.length) saldo += x.c.diff; saldoDe[x.ym] = saldo; });
  const soma = (k) => linhas.reduce((t, x) => t + (x.c[k] || 0), 0);
  const n = linhas.length || 1; const ano = String(new Date().getFullYear());
  const doAno = linhas.filter(x => x.ym.startsWith(ano));
  const kpis = `<div class="kpis">
    <div class="kpi"><span class="k">Gasto por mês</span><span class="v" data-tip="Média dos meses mostrados (até 12)">${fmtMoney(soma('total') / n)}</span><span class="s">média de ${linhas.length} ${linhas.length === 1 ? 'mês' : 'meses'}</span></div>
    <div class="kpi"><span class="k">Gasto em ${ano}</span><span class="v">${fmtMoney(doAno.reduce((t, x) => t + x.c.total, 0))}</span><span class="s">${doAno.length} ${doAno.length === 1 ? 'mês' : 'meses'}</span></div>
    <div class="kpi"><span class="k">Parte da Amanda</span><span class="v" data-tip="Soma do que cabia à Amanda nos meses mostrados">${fmtMoney(soma('due'))}</span><span class="s">recebido ${fmtMoney(soma('received'))}</span></div>
    <div class="kpi"><span class="k">Saldo acumulado</span><span class="v" style="color:${skBalance(d) < 0 ? 'var(--danger)' : 'var(--ok-ink, #1F7A3A)'}" data-tip="Positivo: a Amanda mandou mais do que a parte dela. Negativo: ficou faltando">${fmtMoney(skBalance(d))}</span><span class="s">desde o começo</span></div>
  </div>`;
  const tab = linhas.length ? `<div class="panel"><div class="panel-h"><h3>Mês a mês</h3><span class="grow"></span><button class="btn sm ghost" data-act="go" data-route="shared" data-tip="Abrir Despesas Rafa para lançar extras ou o valor recebido">Abrir Despesas Rafa</button></div><div class="panel-b tight"><table class="grid">
    <thead><tr><th>Mês</th><th style="text-align:right">Gasto</th><th style="text-align:right">Parte da Amanda</th><th style="text-align:right">Recebido</th><th style="text-align:right">Diferença</th><th style="text-align:right">Saldo</th><th style="text-align:right" data-tip="Dias T no Dias de Rafa (com você)">Dias com você</th></tr></thead>
    <tbody>${linhas.map(x => { const ab = RF_MES_ABERTO.has(x.ym), G = skGastoLista(x.c), R = skAmandaLista(d, x.ym);
      const tipG = `Gasto de ${nomeMes(x.ym)}\n` + (G.length ? G.map(g => `${g.nome}: ${fmtMoney(g.v)}`).join('\n') : 'Nada lançado');
      const tipR = `Entradas da Amanda em ${nomeMes(x.ym)}\n` + (R.l.length ? R.l.map(r => `${r.dt ? fmtDateShort(r.dt) + ' · ' : ''}${r.nome}: ${fmtMoney(r.v)}`).join('\n') : 'Nenhuma') + (Math.abs(R.soma - x.c.received) > 0.5 ? `\nConta como ${fmtMoney(x.c.received)} (média com o mês sem pagamento)` : '');
      return `<tr class="rf-mrow${ab ? ' on' : ''}" data-act="rf-mes" data-ym="${x.ym}" style="cursor:pointer" data-tip="${ab ? 'Fechar' : 'Ver'} o detalhe do mês: o que você gastou e o que a Amanda mandou"><td><b>${icon(ab ? 'chevD' : 'chevR')} ${nomeMes(x.ym)}</b></td><td class="mono" style="text-align:right" data-tip="${esc(tipG)}">${fmtMoney(x.c.total)}</td><td class="mono" style="text-align:right">${fmtMoney(x.c.due)}</td><td class="mono" style="text-align:right" data-tip="${esc(tipR)}">${fmtMoney(x.c.received)}</td><td class="mono" style="text-align:right;color:${x.c.diff < -0.5 ? 'var(--danger)' : 'inherit'}">${fmtMoney(x.c.diff)}</td><td class="mono" style="text-align:right">${fmtMoney(saldoDe[x.ym] ?? 0)}</td><td class="mono" style="text-align:right">${x.dias ?? '—'}</td></tr>${ab ? `<tr class="rf-mdet"><td colspan="7"><div class="rf-mdet-g">
        <div><div class="lbl">O que você gastou</div>${G.length ? G.map(g => `<div class="row between small"><span>${g.dt ? `<span class="mono muted">${fmtDateShort(g.dt)}</span> ` : ''}${esc(g.nome)}${g.cat ? ` <span class="faint">· ${esc(g.cat)}</span>` : ''}</span><span class="mono">${fmtMoney(g.v)}</span></div>`).join('') + `<div class="row between small rf-mdet-t"><b>Total</b><b class="mono">${fmtMoney(x.c.total)}</b></div>` : '<div class="small muted">Nada lançado.</div>'}${x.c.planEla ? `<div class="row between small rf-mdet-ela" data-tip="Você paga o plano de saúde da Amanda e ela devolve inteiro (não divide por 2). Não entra no gasto do Rafa, mas já está somado na parte da Amanda do mês."><span>Plano de saúde da Amanda <span class="faint">· você paga, ela devolve inteiro</span></span><span class="mono">${fmtMoney(x.c.planEla)}</span></div><div class="row between small"><span class="muted" data-tip="Metade dos gastos do Rafa + plano de saúde (o dela inteiro e metade do dele)">Parte da Amanda no mês</span><span class="mono">${fmtMoney((x.c.total - x.c.planTotal) / 2)} + ${fmtMoney(x.c.amandaPlan)} = <b>${fmtMoney(x.c.due)}</b></span></div>` : ''}</div>
        <div><div class="lbl">Entradas da Amanda</div>${R.l.length ? R.l.map(r => `<div class="row between small"><span>${r.dt ? `<span class="mono muted">${fmtDateShort(r.dt)}</span> ` : ''}${esc(r.nome)}</span><span class="mono">${fmtMoney(r.v)}</span></div>`).join('') + `<div class="row between small rf-mdet-t"><b>Total</b><b class="mono">${fmtMoney(R.soma)}</b></div>${Math.abs(R.soma - x.c.received) > 0.5 ? `<div class="small muted">Na conta vale ${fmtMoney(x.c.received)}: mês pulado e depois quase o dobro, então o valor é dividido entre os meses.</div>` : ''}` : `<div class="small muted">Nenhuma entrada.${x.c.received > 0.5 ? ` Na conta vale ${fmtMoney(x.c.received)} (média com o mês seguinte).` : ''}</div>`}</div>
      </div></td></tr>` : ''}`; }).join('')}</tbody></table></div></div>` : '<div class="empty">Ainda não há despesas do Rafa lançadas.</div>';
  return { title: 'Gastos e dias do Rafa', html: kpis + tab };
};
