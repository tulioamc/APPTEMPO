/* Relatório do mês para o cliente (ou agência): horas por projeto e tarefa e o que foi entregue, sem valores.
   Mesmo visual da proposta (DM Mono, data em vermelho). No Mac, salva em iCloud/Tempo/Clientes e abre. */
const RC_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
function relClienteDados(kind, id, ym) {
  const ps = projects().filter(p => kind === 'agency' ? agencyOf(p)?.id === id : p.client_id === id);
  const noMes = (iso) => String(iso ? ymd(iso) : '').slice(0, 7) === ym;
  const linhas = ps.map(p => {
    const es = db.where('tempo_time_entries', e => e.project_id === p.id && noMes(entryStart(e)));
    const ms = es.reduce((s, e) => s + entryMs(e), 0);
    const porTarefa = {};
    es.forEach(e => { const t = e.task_id ? db.get('tempo_tasks', e.task_id) : null; const pai = t?.parent_id ? db.get('tempo_tasks', t.parent_id) : t; const k = pai?.name || 'Geral'; porTarefa[k] = (porTarefa[k] || 0) + entryMs(e); });
    const entregue = noMes(p.sent_at);
    const rodadas = db.where('tempo_revisions', r => r.project_id === p.id && noMes(r.resent_at)).length;
    return { p, ms, tarefas: Object.entries(porTarefa).sort((a, b) => b[1] - a[1]), entregue, rodadas };
  }).filter(x => x.ms > 0 || x.entregue || x.rodadas);
  return { linhas, total: linhas.reduce((s, x) => s + x.ms, 0) };
}
function relClienteHTML(kind, id, ym) {
  const x = db.get(kind === 'agency' ? 'tempo_agencies' : 'tempo_clients', id);
  const d = relClienteDados(kind, id, ym); const [a, m] = ym.split('-');
  const rod = (typeof propRodape === 'function' ? propRodape() : { linhas: [], cargo: '' });
  const h = (ms) => fmtH(ms);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(x?.name || '')} ${m}/${a}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; } * { box-sizing: border-box; } html, body { margin: 0; background: #fff; }
  body { font-family: 'DM Mono', ui-monospace, monospace; color: #111; font-size: 12.4px; line-height: 1.75; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pg { width: 794px; min-height: 1123px; padding: 56px 72px 60px; display: flex; flex-direction: column; }
  .top { display: flex; justify-content: space-between; align-items: baseline; } .data { color: #e31b1b; font-size: 19px; font-weight: 500; }
  h2 { font-size: 12.4px; font-weight: 500; margin: 28px 0 0; padding-top: 10px; border-top: 1.2px solid #e31b1b; display: flex; justify-content: space-between; }
  .t { display: flex; justify-content: space-between; padding-left: 18px; } .faint { color: #777; }
  .tot { margin-top: 26px; padding: 8px 0; border-top: 1px solid #111; border-bottom: 1.2px solid #e31b1b; display: flex; justify-content: space-between; }
  .pe { margin-top: auto; padding-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; } .pe img { height: 30px; display: block; margin-bottom: 14px; } .cargo { text-align: right; white-space: pre-line; }
</style></head><body><div class="pg">
  <div class="top"><span>Relatório de horas</span><span class="data">${esc(RC_MESES[Number(m) - 1].toUpperCase())} ${a}</span></div>
  <div style="margin-top:26px">${kind === 'agency' ? 'Agência' : 'Cliente'}: ${esc(x?.name || '')}<br>Período: ${RC_MESES[Number(m) - 1].toLowerCase()} de ${a}</div>
  ${d.linhas.length ? d.linhas.map(l => `<h2><span>${esc(l.p.name)}</span><span>${h(l.ms)}</span></h2>
    ${l.tarefas.map(([n, ms]) => `<div class="t"><span>${esc(n)}</span><span>${h(ms)}</span></div>`).join('')}
    ${l.entregue || l.rodadas ? `<div class="t faint"><span>${[l.entregue ? `Entregue em ${fmtDate(l.p.sent_at)}` : '', l.rodadas ? `${l.rodadas} rodada(s) de ajuste reenviada(s)` : ''].filter(Boolean).join(' · ')}</span><span></span></div>` : ''}`).join('')
    : '<p style="margin-top:40px">Nenhuma hora registrada neste mês.</p>'}
  <div class="tot"><span>Total de horas no mês</span><span>${h(d.total)}</span></div>
  <div class="pe"><div><img src="${location.origin}/icons/assinatura.png" alt="">${rod.linhas.map(esc).join('<br>')}</div><div class="cargo">${esc(rod.cargo)}</div></div>
</div></body></html>`;
}
function relClienteGerar(kind, id, ym) {
  const x = db.get(kind === 'agency' ? 'tempo_agencies' : 'tempo_clients', id); if (!x) return;
  const html = relClienteHTML(kind, id, ym);
  const nome = `${ym}_${String(x.name).replace(/[\/\\:]+/g, '-').replace(/\s+/g, '_')}_relatorio`;
  if (isMacApp()) {
    try { window.webkit.messageHandlers.tempo.postMessage({ type: 'pdf', html, nome, pasta: 'Clientes' }); toast('Gerando o relatório…'); } catch (e) { toast('Não consegui gerar o PDF.'); }
    return;
  }
  const w = window.open('', '_blank'); if (!w) { toast('Permita janelas pop-up para gerar o PDF.'); return; }
  w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 600);
}
ACTIONS['rel-cliente'] = (el) => {
  const ym = (el.closest('.panel')?.querySelector('[data-rc-ym]')?.value) || ymd(new Date()).slice(0, 7);
  relClienteGerar(el.dataset.kind, el.dataset.id, ym);
};
