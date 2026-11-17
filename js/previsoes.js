/* Previsão de pagamento: ao aprovar a proposta, abre uma janela com as parcelas (pela condição de pagamento)
   para conferir datas e valores. Ficam em tempo_settings 'previsoes' [{ id, project_id, quote_id, valor, data, desc, recebido }].
   Entram na previsão de entradas do Financeiro e, no projeto, viram pagamento recebido com um clique. */
const previsoes = () => db.setting('previsoes', []) || [];
const previsoesDo = (pid) => previsoes().filter(v => v.project_id === pid);
function previsoesPadrao(q, pagto, fim) {
  const total = Number(q.value) || 0; const hoje = ymd(new Date());
  const fimD = fim || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return ymd(d); })();
  const meio = (() => { const a = new Date(hoje + 'T12:00:00'), b = new Date(fimD + 'T12:00:00'); return ymd(new Date((a.getTime() + b.getTime()) / 2)); })();
  const P = (typeof PAGAMENTOS !== 'undefined' && PAGAMENTOS[pagto]) || { parcelas: [[1, 'Na entrega']] };
  if (pagto === 'mensal') {
    const out = []; const a = new Date(hoje + 'T12:00:00'); const b = new Date(fimD + 'T12:00:00');
    const meses = []; for (let d = new Date(a.getFullYear(), a.getMonth() + 1, 0); d <= new Date(b.getFullYear(), b.getMonth() + 1, 0); d = new Date(d.getFullYear(), d.getMonth() + 2, 0)) meses.push(ymd(d));
    const n = Math.max(1, meses.length); let acc = 0;
    meses.forEach((m, i) => { const v = i === n - 1 ? total - acc : Math.round(total / n); acc += v; out.push({ desc: `Mensal (${i + 1}/${n})`, data: m, valor: v }); });
    return out.length ? out : [{ desc: 'Mensal', data: fimD, valor: total }];
  }
  let acc = 0;
  return P.parcelas.map(([f, desc], i) => {
    const v = i === P.parcelas.length - 1 ? total - acc : Math.round(total * f); acc += v;
    const data = /aprova/i.test(desc) ? hoje : /metade/i.test(desc) ? meio : fimD;
    return { desc, data, valor: v };
  });
}
/* Janela da previsão; depois chama fim() (ex.: abrir o projeto). */
function openPrevisao(q, pid, fim) {
  const ag = typeof propAgenda === 'function' ? propAgenda(q) : null;
  const linhas = previsoesPadrao(q, q.calc?.pagto || 'final', ag?.fim);
  const draw = () => `<div class="dh">${icon('money')}<h2>Previsão de pagamento</h2></div>
    <div class="db stack" style="gap:10px"><div class="small muted">${esc(q.name)} · ${fmtMoney(q.value)} · ${esc(PAGAMENTOS?.[q.calc?.pagto || 'final']?.nome || '')}${ag ? ` · entrega prevista em ${fmtDate(ag.fim)}` : ''}</div>
      ${linhas.map((r, i) => `<div class="row" style="flex-wrap:nowrap;gap:8px"><input class="input sm grow" data-pv="${i}" data-k="desc" value="${esc(r.desc)}" aria-label="Descrição"><input type="date" class="input sm" style="width:160px" data-pv="${i}" data-k="data" value="${r.data}" aria-label="Data prevista"><input type="number" class="input sm mono" style="width:120px" data-pv="${i}" data-k="valor" value="${Math.round(r.valor)}" aria-label="Valor"><button type="button" class="btn sm icon ghost" data-pvdel="${i}" aria-label="Remover">${icon('x')}</button></div>`).join('')}
      <div class="row between small"><button type="button" class="btn sm" data-pvadd>${icon('plus')} Parcela</button><span>Soma: <b data-pvsoma>${fmtMoney0(linhas.reduce((s, r) => s + (Number(r.valor) || 0), 0))}</b> de ${fmtMoney0(q.value)}</span></div></div>
    <div class="df"><button class="btn" data-pvpula>Agora não</button><button class="btn primary" data-pvok>Criar previsão</button></div>`;
  const l = openLayer({ render: draw, onClose: () => fim && fim() });
  l.box.addEventListener('input', (e) => { const t = e.target; if (t.dataset.pv === undefined) return; linhas[t.dataset.pv][t.dataset.k] = t.dataset.k === 'valor' ? Number(t.value) || 0 : t.value; const sm = $('[data-pvsoma]', l.box); if (sm) sm.textContent = fmtMoney0(linhas.reduce((s, r) => s + (Number(r.valor) || 0), 0)); });
  l.box.addEventListener('click', (e) => {
    const d = e.target.closest('[data-pvdel]'); if (d) { linhas.splice(Number(d.dataset.pvdel), 1); l.refresh(); return; }
    if (e.target.closest('[data-pvadd]')) { linhas.push({ desc: 'Parcela', data: ymd(new Date()), valor: 0 }); l.refresh(); return; }
    if (e.target.closest('[data-pvpula]')) { l.close(); return; }
    if (e.target.closest('[data-pvok]')) {
      const novas = linhas.filter(r => Number(r.valor) > 0 && r.data).map(r => ({ id: uid(), project_id: pid, quote_id: q.id, valor: Number(r.valor), data: r.data, desc: r.desc || 'Parcela', recebido: false }));
      db.setSetting('previsoes', [...previsoes().filter(v => v.project_id !== pid), ...novas]);
      toast(`${novas.length} previsão(ões) de pagamento criada(s)`); l.close();
    }
  });
}
/* No projeto: previsões em aberto, com "Recebido" (vira pagamento) e remover. */
function previsoesProjetoHTML(p) {
  const vs = previsoesDo(p.id); if (!vs.length) return '';
  const hoje = ymd(new Date());
  return `<div class="panel"><div class="panel-h"><h3>Previsão de pagamento</h3></div><div class="panel-b stack" style="gap:6px">${vs.sort((a, b) => a.data.localeCompare(b.data)).map(v => `<div class="row between small" style="gap:8px"><span>${esc(v.desc)}</span><span class="muted ${!v.recebido && v.data < hoje ? 'late' : ''}">${fmtDate(v.data)}${!v.recebido && v.data < hoje ? ' · atrasada' : ''}</span><span class="mono">${fmtMoney0(v.valor)}</span>${v.recebido ? '<span class="tag c-green">recebido</span>' : `<span class="row" style="gap:4px"><button class="btn sm" data-act="pv-rec" data-id="${v.id}">Recebido</button><button class="btn sm icon ghost" data-act="pv-del" data-id="${v.id}" aria-label="Remover previsão">${icon('x')}</button></span>`}</div>`).join('')}</div></div>`;
}
ACTIONS['pv-rec'] = (el) => {
  const vs = previsoes(); const v = vs.find(x => x.id === el.dataset.id); if (!v) return;
  db.insert('tempo_payments', { project_id: v.project_id, amount: v.valor, date: ymd(new Date()), note: v.desc, invoice: null });
  db.setSetting('previsoes', vs.map(x => x.id === v.id ? { ...x, recebido: true } : x)); toast('Pagamento registrado');
};
ACTIONS['pv-del'] = (el) => { db.setSetting('previsoes', previsoes().filter(x => x.id !== el.dataset.id)); render(); };
