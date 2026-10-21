/* Página Metas: financeiro, portfólio e produtividade (estrelas e desafios da semana e do mês).
   Os números são calculados na hora; a meta financeira fica salva e pode ser trocada aqui. */
const META_FIN_DEFAULT = 30000;
const META_PORTFOLIO_INICIO = '2026-11'; /* 1 projeto novo por mês vale a partir de novembro de 2026 */

/* Estrelas valem para cada área (produtividade, financeiro e portfólio), guardadas por período. */
function metasAward(key, id, pts, nome) {
  const store = db.setting('prodEstrelas', {}) || {};
  const got = store[key] || {};
  if (got[id]) return;
  got[id] = pts; store[key] = got; db.setSetting('prodEstrelas', store);
  try { toast(`⭐ ${nome} conquistada (+${pts} estrelas)`); } catch (e) {}
}
function metasEstrelasMes(mk) {
  const store = db.setting('prodEstrelas', {}) || {};
  return Object.values(store['mes:' + mk] || {}).reduce((s, x) => s + x, 0);
}
function metasFinanceiroHTML() {
  const goal = Number(db.setting('metaFinanceira', META_FIN_DEFAULT)) || 0;
  const mk = ymd(new Date()).slice(0, 7);
  const recebido = db.all('tempo_payments').filter(p => String(p.date || '').startsWith(mk)).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (goal > 0 && recebido >= goal) metasAward('mes:' + mk, 'financeiro', 2, 'Meta de faturamento do mês');
  const pct = goal > 0 ? Math.min(100, recebido / goal * 100) : 0;
  const faltam = Math.max(0, goal - recebido);
  const horasMs = prodStats(prodCollectFor('mes')).tot.prod;
  const horaReal = horasMs > 0 ? recebido / (horasMs / 36e5) : null;
  return `<div class="panel"><div class="panel-h"><h3>Financeiro</h3><span class="small muted">⭐ ${metasEstrelasMes(mk)} neste mês · mês até agora</span></div><div class="panel-b stack">
    <div class="row between" style="flex-wrap:wrap;gap:8px"><span>Recebido no mês</span><b class="mono">${fmtMoney0(recebido)}</b></div>
    <div class="pm-bar"><span style="width:${Math.round(pct)}%"></span></div>
    <div class="small muted">${goal > 0 ? (faltam > 0 ? `Faltam ${fmtMoney0(faltam)} para ${fmtMoney0(goal)}` : `Meta de ${fmtMoney0(goal)} batida`) : 'Defina a meta do mês abaixo.'}</div>
    <div class="row between" style="flex-wrap:wrap;gap:8px"><span>Hora real (recebido ÷ horas líquidas do mês)</span><b class="mono">${horaReal ? fmtMoney0(horaReal) : '—'}</b></div>
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-end"><div class="field" style="max-width:220px"><label for="meta-fin">Meta de faturamento do mês (já com impostos e custos)</label><input id="meta-fin" class="input mono" inputmode="decimal" value="${goal}"></div><button class="btn sm" data-act="meta-fin-save">Salvar meta</button></div>
  </div></div>`;
}
ACTIONS['meta-fin-save'] = () => {
  const v = numIn(document.getElementById('meta-fin')?.value) || 0;
  db.setSetting('metaFinanceira', v); db.emit(); toast('Meta do mês salva');
};

function metasPortfolioHTML() {
  const now = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  const projetos = db.all('tempo_projects').filter(p => !p.archived);
  const contagem = meses.map(d => {
    const a = d.getTime(), b = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    return { d, n: projetos.filter(p => { const t = new Date(p.created_at).getTime(); return t >= a && t < b; }).length };
  });
  const max = Math.max(1, ...contagem.map(x => x.n));
  const atual = contagem[contagem.length - 1];
  const bars = contagem.map(x => `<div class="meta-col"><div class="meta-bar"><span style="height:${Math.round(x.n / max * 100)}%"></span></div><span class="small">${x.d.toLocaleDateString('pt-BR', { month: 'short' })}</span><b class="mono small">${x.n}</b></div>`).join('');
  const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const info = mk < META_PORTFOLIO_INICIO ? 'A meta de 1 projeto novo por mês começa em novembro de 2026.'
    : atual.n >= 1 ? `Meta do mês batida: ${atual.n} projeto(s) novo(s).` : 'Falta 1 projeto novo neste mês.';
  return `<div class="panel"><div class="panel-h"><h3>Portfólio</h3><span class="small muted">⭐ ${metasEstrelasMes(mk)} neste mês · projetos novos por mês (últimos 6)</span></div><div class="panel-b stack"><div class="meta-cols">${bars}</div><div class="small">${info}</div></div></div>`;
}

VIEWS.metas = () => ({
  title: 'Metas',
  html: (() => { const analSem = prodAnaliseHTML(prodWeeklyLatest(), 'Análise da semana', 'A análise da semana aparece aqui depois da primeira geração, toda segunda às 7h13 (Recife).'); const analMes = prodAnaliseHTML(prodMensalLatest(), 'Análise do mês', 'A análise do mês aparece aqui depois da primeira geração, no dia 1 às 7h20 (Recife).'); const prod = prodMetasHTML(); const fin = metasFinanceiroHTML(); const port = metasPortfolioHTML(); return `<div class="stack" style="gap:14px">${analSem}${analMes}${fin}${port}${relClienteFormHTML()}<span class="lbl">Produtividade</span>${prod}</div>`; })(),
});

/* Relatório mensal do cliente: só o que interessa a ele (horas nos projetos dele, rodadas de alteração e previsto).
   Sem valores internos de hora, produtividade, distração ou pausa. */
function relMsNoMes(e, a, b) {
  return (e.segments || []).reduce((t, s) => {
    if (!s.s) return t;
    const x = Math.max(new Date(s.s).getTime(), a), y = Math.min(s.e ? new Date(s.e).getTime() : Date.now(), b);
    return t + Math.max(0, y - x);
  }, 0);
}
function relClienteFormHTML() {
  const cls = db.all('tempo_clients').filter(c => !c.archived).sort((x, y) => String(x.name).localeCompare(String(y.name), 'pt-BR'));
  const mk = ymd(new Date()).slice(0, 7);
  return `<div class="panel"><div class="panel-h"><h3>Relatório mensal do cliente</h3><span class="small muted">para enviar ao cliente: só horas, entregas e rodadas</span></div><div class="panel-b"><div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-end">
    <div class="field" style="min-width:220px"><label for="rc-cli">Cliente</label><select id="rc-cli" class="input">${cls.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field" style="max-width:180px"><label for="rc-mes">Mês</label><input id="rc-mes" type="month" class="input" value="${mk}"></div>
    <button class="btn primary" data-act="rel-cliente-gerar">Gerar relatório</button></div></div></div>`;
}
ACTIONS['rel-cliente-gerar'] = () => {
  const cid = document.getElementById('rc-cli')?.value, mk = document.getElementById('rc-mes')?.value;
  if (!cid || !mk) return toast('Escolha cliente e mês.');
  openRelatorioCliente(cid, mk);
};
ACTIONS['rel-print'] = () => window.print();
function openRelatorioCliente(cid, mk) {
  const cli = db.get('tempo_clients', cid); if (!cli) return toast('Cliente não encontrado.');
  const [yy, mm] = mk.split('-').map(Number);
  const a = new Date(yy, mm - 1, 1).getTime(), b = new Date(yy, mm, 1).getTime();
  const mesNome = new Date(yy, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const projs = db.all('tempo_projects').filter(p => p.client_id === cid && !p.archived);
  const ents = db.all('tempo_time_entries').filter(e => projs.some(p => p.id === e.project_id));
  const linhas = projs.map(p => {
    const es = ents.filter(e => e.project_id === p.id);
    const mes = es.reduce((t, e) => t + relMsNoMes(e, a, b), 0);
    const total = es.reduce((t, e) => t + entryMs(e), 0);
    const revs = db.all('tempo_revisions').filter(r => r.project_id === p.id && r.requested_at && new Date(r.requested_at).getTime() >= a && new Date(r.requested_at).getTime() < b).length;
    return { p, mes, total, revs };
  }).filter(x => x.mes > 0 || x.revs > 0);
  const totalMes = linhas.reduce((t, x) => t + x.mes, 0);
  const linhasHTML = linhas.length ? linhas.map(x => `<tr><td>${esc(x.p.name)}</td><td class="mono">${fmtDur(x.mes)}</td><td class="mono">${fmtDur(x.total)}</td><td class="mono">${x.p.estimated_hours ? x.p.estimated_hours + ' h' : '—'}</td><td class="mono">${x.revs}${x.p.revisions_included != null ? ` de ${x.p.revisions_included} incluídas` : ''}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">Nenhum trabalho registrado neste mês.</td></tr>';
  const l = openLayer({ wide: true, html: `<div class="dh"><h2>Relatório de ${esc(mesNome)}</h2><span class="grow"></span><button class="btn" data-act="rel-print">Imprimir / salvar PDF</button><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db rel-print">
      <div class="stack" style="gap:4px"><b style="font-size:18px">${esc(cli.name)}</b><span class="small muted">Período: ${esc(mesNome)}</span></div>
      <div class="row between" style="flex-wrap:wrap;gap:8px"><span>Horas trabalhadas no mês</span><b class="mono">${fmtDur(totalMes)}</b></div>
      <table class="tbl"><thead><tr><th>Projeto</th><th>Horas no mês</th><th>Horas no total</th><th>Previsto</th><th>Rodadas de alteração</th></tr></thead><tbody>${linhasHTML}</tbody></table>
      <span class="small muted">Gerado em ${esc(new Date().toLocaleDateString('pt-BR'))}. Horas são tempo líquido de trabalho, sem pausas.</span>
    </div>` });
  return l;
}
