/* Proposta em PDF no visual dos orçamentos do Tulio (modelos 1010–1020): DM Mono, data em vermelho, cliente e contato,
   descrição do escopo, tabela de itens entre linhas vermelhas, condições em tópicos, assinatura e contato no rodapé.
   Textos ficam na proposta (calc.proposta); rodapé e numeração em tempo_settings ('propostaRodape', 'propostaNum'). */
const PROP_MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const propData = (iso) => { const d = iso ? new Date(iso + 'T12:00:00') : new Date(); return `${String(d.getDate()).padStart(2, '0')} ${PROP_MESES[d.getMonth()]} ${d.getFullYear()}`; };
const propMoeda = (v) => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const propNumExtenso = (n) => ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis'][n] || String(n);

/* Itens da tabela. Com calculadora e mais de uma etapa com horas: uma linha por etapa, com a parte do total
   proporcional às horas (o total já com BV, imposto e terceirizado). Sem isso, uma linha só com o nome. */
function propItens(x) {
  const total = Number(x.value) || 0;
  // vários projetos na proposta: uma linha por projeto, com a parte do total pelas horas
  if (x.calc?.lines && Array.isArray(x.calc.grupos) && x.calc.grupos.length > 1) {
    const k = calcQuote({ ...x.calc }, precoBase());
    const gs = k.porGrupo.filter(g => g.h > 0); let acc = 0;
    if (gs.length > 1) return gs.map((g, i) => { const v = i === gs.length - 1 ? total - acc : Math.round(total * g.h / gs.reduce((s, y) => s + y.h, 0) / 50) * 50; acc += v; return { desc: g.nome || `Projeto ${i + 1}`, unit: '', qtd: '', valor: v }; });
  }
  const ls = (x.calc?.lines || []).filter(l => Number(l.h) > 0 && !l.par && (l.name || '').trim());
  if (ls.length < 2) return [{ desc: x.name || 'Projeto', unit: '', qtd: '', valor: total }];
  const soma = ls.reduce((s, l) => s + Number(l.h), 0);
  let acc = 0;
  return ls.map((l, i) => {
    const v = i === ls.length - 1 ? total - acc : Math.round(total * Number(l.h) / soma / 50) * 50; acc += v;
    return { desc: l.name.trim(), unit: '', qtd: '', valor: v };
  });
}
/* Condições padrão, tiradas dos modelos que ele já manda. */
function propCondicoes(x) {
  const ls = (x.calc?.lines || []).filter(l => (l.name || '').trim() && (Number(l.h) > 0 || Number(l.prazo) > 0));
  const nomes = ls.map(l => l.name.trim().toLowerCase());
  const lista = nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] : nomes[0];
  const k = x.calc && x.calc.lines ? calcQuote({ ...x.calc }, precoBase()) : null;
  const rod = Number(x.revisions_included ?? 2);
  const out = [];
  out.push(nomes.length > 1 ? `A criação será realizada com base no briefing enviado pelo cliente e dividida em ${propNumExtenso(nomes.length)} etapas: ${lista}.` : 'A criação será realizada com base no briefing enviado pelo cliente.');
  out.push('O pagamento deverá ser efetuado ao final do serviço.');
  if (k && k.fechado) out.push(`O prazo estimado é de ${k.fechado} dias úteis, sem contar o tempo de aprovação do cliente e possíveis ajustes.`);
  if (rod) out.push(`O valor inclui até ${propNumExtenso(rod)} rodada${rod > 1 ? 's' : ''} de ajustes${nomes.length > 1 ? ' por etapa' : ''}. Alterações fora do briefing ou em etapas já aprovadas poderão gerar custos adicionais.`);
  const dv = x.sent_at && x.valid_until ? daysBetween(x.sent_at, x.valid_until) : 30;
  out.push(`Este orçamento tem validade de ${dv > 0 ? dv : 30} dias.`);
  out.push('O envio dos textos e a revisão do material final são de responsabilidade do cliente.');
  return out;
}
function propRodape() {
  const r = db.setting('propostaRodape', null) || {};
  return { linhas: r.linhas || [], cargo: r.cargo || 'Designer, Ilustrador e\nMotion Designer 2D e 3D' };
}
/* Estado da proposta em PDF de uma proposta (salvo ou o padrão). */
function propEstado(x) {
  const p = x.calc?.proposta || {};
  const cli = db.get('tempo_clients', x.client_id); const ag = cli?.agency_id ? db.get('tempo_agencies', cli.agency_id) : null;
  const cliNome = ag && !/direto/i.test(ag.name || '') ? `${ag.name} // ${cli.name}` : (cli?.name || '');
  return {
    num: p.num || null, data: p.data || x.sent_at || ymd(new Date()), cliente: p.cliente ?? cliNome, contato: p.contato ?? (cli?.contact || ''),
    desc: p.desc ?? (x.name || ''), itens: p.itens || propItens(x), cond: p.cond || propCondicoes(x),
  };
}
function propHTML(e) {
  const rod = propRodape();
  const ass = `${location.origin}/icons/assinatura.png`;
  const totalItens = e.itens.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const letra = (i) => e.itens.length > 1 ? `${'abcdefghij'[i] || i + 1}. ` : '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento ${esc(e.num || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: 'DM Mono', ui-monospace, monospace; color: #111; font-size: 12.4px; line-height: 1.75; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pg { width: 794px; height: 1123px; padding: 56px 72px 60px; position: relative; display: flex; flex-direction: column; }
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .data { color: #e31b1b; font-size: 19px; font-weight: 500; letter-spacing: .02em; }
  .cli { margin-top: 26px; }
  .desc { margin-top: 82px; text-align: justify; white-space: pre-wrap; hyphens: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 30px; }
  table tr.first td { border-top: 1.2px solid #e31b1b; padding-top: 10px; }
  td { padding: 2px 0; vertical-align: top; }
  td.u { width: 150px; } td.q { width: 90px; } td.r { width: 40px; } td.v { width: 64px; text-align: right; }
  tr.tot td { border-top: 1px solid #111; padding-top: 6px; }
  tr.fim td { border-bottom: 1.2px solid #e31b1b; padding-bottom: 8px; }
  ul { margin: 26px 0 0; padding: 0; list-style: none; }
  li { position: relative; padding-left: 26px; text-align: justify; }
  li:before { content: '▪'; position: absolute; left: 4px; }
  .pe { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; }
  .pe img { height: 30px; display: block; margin-bottom: 14px; }
  .cargo { text-align: right; white-space: pre-line; }
</style></head><body><div class="pg">
  <div class="top"><span>Orçamento</span><span class="data">${esc(propData(e.data))}</span></div>
  <div class="cli">Cliente: ${esc(e.cliente || '')}<br>Contato: ${esc(e.contato || '')}</div>
  <div class="desc">${esc(e.desc || '')}</div>
  <table>
    ${e.itens.map((i, n) => `<tr class="${n === 0 ? 'first' : ''}"><td>${letra(n)}${esc(i.desc || '')}</td><td class="u">${esc(i.unit || '')}</td><td class="q">${esc(i.qtd || '')}</td><td class="r">R$</td><td class="v">${esc(propMoeda(i.valor).replace('R$ ', ''))}</td></tr>`).join('')}
    <tr class="tot fim"><td>Total</td><td class="u"></td><td class="q"></td><td class="r">R$</td><td class="v">${esc(propMoeda(totalItens).replace('R$ ', ''))}</td></tr>
  </table>
  <ul>${e.cond.filter(c => String(c).trim()).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
  <div class="pe"><div><img src="${ass}" alt="">${rod.linhas.map(l => esc(l)).join('<br>')}</div><div class="cargo">${esc(rod.cargo)}</div></div>
</div></body></html>`;
}
const propNome = (e, x) => {
  const limpa = (s) => String(s || '').normalize('NFC').replace(/[\/\\:]+/g, '-').replace(/\s*\/\/\s*/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const cli = db.get('tempo_clients', x.client_id)?.name || '';
  return `${e.num}_${limpa(cli)}_${limpa(x.name)}`.slice(0, 120);
};

/* Tela da proposta em PDF: edita os textos, mostra a prévia e gera o arquivo. */
function openPropostaPDF(qid) {
  const x = db.get('tempo_quotes', qid); if (!x) return;
  const e = propEstado(x);
  if (!e.num) e.num = Number(db.setting('propostaNum', 1020)) + 1;
  const prev = () => `<iframe class="prop-prev" title="Prévia da proposta" srcdoc="${esc(propHTML(e))}"></iframe>`;
  const draw = () => `<div class="dh">${icon('doc')}<h2>Proposta em PDF · ${esc(x.name)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db"><div class="prop-grid">
      <div class="stack" style="gap:10px">
        <div class="grid2"><div class="field"><label for="pp-n">Número</label><input id="pp-n" type="number" class="input" data-p="num" value="${e.num}"></div>
          <div class="field"><label for="pp-d">Data</label><input id="pp-d" type="date" class="input" data-p="data" value="${e.data}"></div></div>
        <div class="field"><label for="pp-c">Cliente</label><input id="pp-c" class="input" data-p="cliente" value="${esc(e.cliente)}"></div>
        <div class="field"><label for="pp-ct">Contato</label><input id="pp-ct" class="input" data-p="contato" value="${esc(e.contato)}"></div>
        <div class="field"><label for="pp-ds">Descrição do escopo</label><textarea id="pp-ds" class="input" rows="5" data-p="desc">${esc(e.desc)}</textarea></div>
        <div class="field"><span class="lbl">Itens</span>${e.itens.map((i, n) => `<div class="row" style="flex-wrap:nowrap;gap:6px;margin-bottom:6px"><input class="input sm grow" data-it="${n}" data-k="desc" value="${esc(i.desc)}" aria-label="Item"><input class="input sm" style="width:110px" data-it="${n}" data-k="unit" value="${esc(i.unit)}" placeholder="R$/und" aria-label="Valor unitário"><input class="input sm" style="width:70px" data-it="${n}" data-k="qtd" value="${esc(i.qtd)}" placeholder="qtd" aria-label="Quantidade"><input class="input sm mono" style="width:110px" data-it="${n}" data-k="valor" type="number" value="${Math.round(Number(i.valor) || 0)}" aria-label="Valor"><button type="button" class="btn sm icon ghost" data-itdel="${n}" aria-label="Remover">${icon('x')}</button></div>`).join('')}
          <div class="row" style="gap:6px"><button type="button" class="btn sm" data-itadd>${icon('plus')} Item</button><button type="button" class="btn sm" data-itrefaz title="Volta aos itens calculados pela proposta">Refazer pelos valores</button></div>
          <span class="hint">Total dos itens: <b data-tot>${fmtMoney0(e.itens.reduce((s, i) => s + (Number(i.valor) || 0), 0))}</b> · proposta: ${fmtMoney0(x.value)}</span></div>
        <div class="field"><label for="pp-cd">Condições (uma por linha)</label><textarea id="pp-cd" class="input" rows="8" data-p="cond">${esc(e.cond.join('\n'))}</textarea><button type="button" class="btn sm" style="margin-top:6px;align-self:flex-start" data-condrefaz>Condições padrão</button></div>
      </div>
      <div class="prop-wrap">${prev()}</div>
    </div></div>
    <div class="df"><button class="btn" data-act="close-layer">Fechar</button><button class="btn" data-psave>Salvar textos</button><button class="btn primary" data-pgera>${icon('doc')} Gerar PDF</button></div>`;
  const l = openLayer({ wide: true, render: draw });
  let t = null;
  const atualizaPrev = () => { clearTimeout(t); t = setTimeout(() => { const w = $('.prop-wrap', l.box); if (w) w.innerHTML = prev(); const tt = $('[data-tot]', l.box); if (tt) tt.textContent = fmtMoney0(e.itens.reduce((s, i) => s + (Number(i.valor) || 0), 0)); }, 250); };
  l.box.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.p) { const k = el.dataset.p; e[k] = k === 'cond' ? el.value.split('\n') : k === 'num' ? Number(el.value) || e.num : el.value; atualizaPrev(); }
    else if (el.dataset.it) { e.itens[el.dataset.it][el.dataset.k] = el.dataset.k === 'valor' ? Number(el.value) || 0 : el.value; atualizaPrev(); }
  });
  const guarda = () => {
    const atual = db.get('tempo_quotes', qid);
    db.update('tempo_quotes', qid, { calc: { ...(atual.calc || {}), proposta: { ...clone(e), cond: e.cond.filter(c => String(c).trim()) } } }, true);
    if (e.num > Number(db.setting('propostaNum', 1020))) db.setSetting('propostaNum', e.num);
  };
  l.box.addEventListener('click', (ev) => {
    const d = ev.target.closest('[data-itdel]'); if (d) { e.itens.splice(Number(d.dataset.itdel), 1); if (!e.itens.length) e.itens.push({ desc: '', unit: '', qtd: '', valor: 0 }); l.refresh(); return; }
    if (ev.target.closest('[data-itadd]')) { e.itens.push({ desc: '', unit: '', qtd: '', valor: 0 }); l.refresh(); return; }
    if (ev.target.closest('[data-itrefaz]')) { e.itens = propItens(db.get('tempo_quotes', qid)); l.refresh(); return; }
    if (ev.target.closest('[data-condrefaz]')) { e.cond = propCondicoes(db.get('tempo_quotes', qid)); l.refresh(); return; }
    if (ev.target.closest('[data-psave]')) { guarda(); toast('Textos da proposta salvos'); return; }
    if (ev.target.closest('[data-pgera]')) {
      guarda();
      const html = propHTML(e), nome = propNome(e, x);
      if (isMacApp()) {
        try { window.webkit.messageHandlers.tempo.postMessage({ type: 'pdf', html, nome, pasta: 'Propostas' }); toast('Gerando a proposta…'); }
        catch (err) { toast('Não consegui gerar o PDF.'); }
        return;
      }
      const w = window.open('', '_blank');
      if (!w) { toast('Permita janelas pop-up para gerar o PDF.'); return; }
      w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (err) {} }, 600);
    }
  });
}
ACTIONS['qt-pdf'] = (el) => openPropostaPDF(el.dataset.id);
