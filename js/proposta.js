/* Proposta em PDF no visual dos orçamentos do Tulio (modelos 1010–1020): DM Mono, data em vermelho, cliente e contato,
   descrição do escopo, tabela de itens entre linhas vermelhas, condições em tópicos, assinatura e contato no rodapé.
   Textos ficam na proposta (calc.proposta); rodapé e numeração em tempo_settings ('propostaRodape', 'propostaNum'). */
/* Condições de pagamento: o padrão dele é tudo no final. */
const PAGAMENTOS = {
  final: { nome: '100% no final', texto: 'O pagamento deverá ser efetuado ao final do serviço.', parcelas: [[1, 'Na entrega']] },
  '5050': { nome: '50% + 50%', texto: 'O pagamento será feito em duas parcelas: 50% na aprovação do orçamento e 50% na entrega final.', parcelas: [[0.5, 'Na aprovação'], [0.5, 'Na entrega']] },
  '3x': { nome: '3 parcelas', texto: 'O pagamento será feito em três parcelas iguais: na aprovação, na metade do projeto e na entrega final.', parcelas: [[1 / 3, 'Na aprovação'], [1 / 3, 'Na metade'], [1 / 3, 'Na entrega']] },
  mensal: { nome: 'Mensal', texto: 'Os pagamentos deverão ser realizados ao final de cada mês, considerando o valor proporcional ao que foi entregue no período.', parcelas: [[1, 'Mensal']] },
};
/* Agenda: quando dá para começar e entregar, pelo Planejamento (horas livres por dia) e pelo prazo fechado das etapas.
   extraH: horas de outros orçamentos em aberto que entrariam antes (para o "e se eu aceitar tudo?"). */
function propAgenda(x, extraH = 0) {
  if (typeof planejar !== 'function' || !x?.calc?.lines) return null;
  const k = calcQuote({ ...x.calc }, precoBase()); if (!k.h) return null;
  const cfg = planoCfg(); const { porDia } = planejar(planoProjetos());
  const usado = (dia) => (porDia[dia]?.horas || 0);
  const proxUtil = (d) => { const n = new Date(d); do { n.setDate(n.getDate() + 1); } while (!planoDiaUtil(ymd(n))); return n; };
  let d = proxUtil(new Date()); let extra = extraH;
  // os outros orçamentos ocupam as horas livres primeiro
  for (let i = 0; i < 400 && extra > 0.05; i++) { const livre = Math.max(0, cfg.horasDia - usado(ymd(d))); extra -= livre; if (extra > 0.05) d = proxUtil(d); }
  for (let i = 0; i < 400 && usado(ymd(d)) >= cfg.horasDia - 1; i++) d = proxUtil(d);
  const inicio = ymd(d);
  let falta = k.h; let fimAg = new Date(d); let dias = 0;
  for (let i = 0; i < 400 && falta > 0.05; i++) { falta -= Math.max(0, cfg.horasDia - usado(ymd(fimAg))); dias++; if (falta > 0.05) fimAg = proxUtil(fimAg); }
  let fimPz = new Date(d); for (let i = 1; i < Math.max(1, k.fechado); i++) fimPz = proxUtil(fimPz);
  const fim = fimAg > fimPz ? fimAg : fimPz;
  return { inicio, fim: ymd(fim), apertado: fimAg > fimPz };
}
const PROP_MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const propData = (iso) => { const d = iso ? new Date(iso + 'T12:00:00') : new Date(); return `${String(d.getDate()).padStart(2, '0')} ${PROP_MESES[d.getMonth()]} ${d.getFullYear()}`; };
const propMoeda = (v, moeda) => {
  const m = moeda && typeof MOEDAS !== 'undefined' && MOEDAS[moeda.cod];
  return m && moeda.taxa > 0 ? m.simb + ' ' + Math.round((Number(v) || 0) / moeda.taxa).toLocaleString(m.loc) : 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
};
const propNumExtenso = (n) => ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'][n] || String(n);

/* Itens da tabela. Com calculadora e mais de uma etapa com horas: uma linha por etapa, com a parte do total
   proporcional às horas (o total já com BV, imposto e terceirizado). Sem isso, uma linha só com o nome. */
function propItens(x, sep = {}) {
  const total = Number(x.value) || 0;
  const lines = x.calc?.lines || [];
  const cheias = lines.map((l, i) => [l, i]).filter(([l]) => (!l.par || l.terc) && (Number(l.h) > 0 || Number(l.valor) > 0) && (l.name || '').trim());
  if (!cheias.length) return [{ desc: x.name || 'Projeto', unit: '', qtd: '', valor: total, nivel: 0 }];
  const k = calcQuote({ ...x.calc }, precoBase());
  // imposto separado: os itens ficam sem o imposto (ele aparece embaixo, antes do total)
  const fator = sep.imposto && k.total ? (k.total - k.D) / k.total : 1;
  const gs = gruposDe(x.calc);
  const arred = (v) => Math.round(v / 10) * 10;
  const qtdTxt = (l, v) => { const q = Number(l.qtd) > 1 ? Number(l.qtd) : 0; return q ? { unit: propMoeda(v / q, x.calc?.moeda) + '/und', qtd: q + 'und' } : { unit: '', qtd: '' }; };
  const out = [];
  gs.forEach((g, gi) => {
    const doG = cheias.filter(([l]) => l.grp === g.id); if (!doG.length) return;
    const pg = k.porGrupo.find(y => y.id === g.id); const G = total * (pg?.parte || 0) * fator;
    const sh = k.hEtapas ? doG.reduce((s2, [l]) => s2 + horasEtapa(x.calc, l), 0) / k.hEtapas : 0;
    const extra = k.Bext * sh;   // custos extras gerais entram na minha parte
    const partes = doG.map(([l, i]) => ({ l, v: (k.porEtapa[i] || 0) + valorTerc(l) }));
    const base = partes.reduce((s2, p) => s2 + p.v, 0) + extra || 1;
    const valorDe = (v) => G * v / base;
    const nome = g.nome || (gs.length > 1 ? `Entrega ${gi + 1}` : x.name || 'Entrega');
    const dur = grupoVideo(g) ? ` ${String(durMult(g.duracao ?? 1)).replace('.', ',')} min` : '';
    let subs = [];
    if (sep.etapas) subs = partes.map((p, n) => ({ desc: p.l.name.trim() + (p.l.terc ? '' : ''), valor: valorDe(p.v + (n === 0 ? extra : 0)), l: p.l }));
    else if (sep.terc && partes.some(p => p.l.terc)) {
      const minhas = partes.filter(p => !p.l.terc);
      if (minhas.length) subs.push({ desc: minhas.length <= 2 ? minhas.map(p => p.l.name.trim()).join(' e ') : 'Criação e produção', valor: valorDe(minhas.reduce((s2, p) => s2 + p.v, 0) + extra), l: minhas.length === 1 ? minhas[0].l : null });
      partes.filter(p => p.l.terc).forEach(p => subs.push({ desc: p.l.name.trim(), valor: valorDe(p.v), l: p.l }));
    }
    const Gr = arred(G);
    if (subs.length) {
      let acc = 0; subs = subs.map((sb, n) => { const v = n === subs.length - 1 ? Gr - acc : arred(sb.valor); acc += v; return { desc: sb.desc, ...(sb.l ? qtdTxt(sb.l, v) : { unit: '', qtd: '' }), valor: v, nivel: 1 }; });
      out.push({ desc: nome + dur, unit: '', qtd: '', valor: Gr, nivel: 0, sub: true }, ...subs);
    } else {
      const so = doG.length === 1 ? doG[0][0] : null;
      out.push({ desc: (gs.length > 1 || doG.length === 1 ? nome : nome) + dur, ...(so ? qtdTxt(so, Gr) : { unit: '', qtd: '' }), valor: Gr, nivel: 0 });
    }
  });
  // um projeto só, sem separar nada: item único com o nome da proposta
  if (out.length === 1 && !sep.etapas && !sep.terc) out[0].desc = (gs[0]?.nome || x.name || 'Projeto') + (out[0].desc.match(/ [\d,]+ min$/)?.[0] || '');
  // fecha a soma no total (sem o imposto, se separado)
  const alvo = arred(total * fator); const topo = out.filter(i => !i.nivel);
  const soma = topo.reduce((s2, i) => s2 + i.valor, 0);
  if (topo.length && soma !== alvo) { const ult = topo[topo.length - 1]; const d = alvo - soma; ult.valor += d; const filhos = out.slice(out.indexOf(ult) + 1); if (filhos.length) filhos[filhos.length - 1].valor += d; }
  return out;
}
/* Imposto da proposta (para mostrar separado): valor arredondado e %. */
function propImposto(x) {
  if (!x.calc?.lines || !x.calc.nf?.on) return null;
  const k = calcQuote({ ...x.calc }, precoBase()); const total = Number(x.value) || 0;
  const v = Math.round(total * (k.total ? k.D / k.total : 0) / 10) * 10;
  return v ? { valor: v, pct: x.calc.nf.pct } : null;
}
/* Condições padrão, tiradas dos modelos que ele já manda. */
function propCondicoes(x) {
  const ls = (x.calc?.lines || []).filter(l => (l.name || '').trim() && (Number(l.h) > 0 || Number(l.prazo) > 0));
  const nomes = ls.map(l => l.name.trim().toLowerCase());
  const k = x.calc && x.calc.lines ? calcQuote({ ...x.calc }, precoBase()) : null;
  const rod = Number(x.revisions_included ?? 2);
  const out = [];
  const gs = x.calc?.lines ? gruposDe(x.calc).filter(g => x.calc.lines.some(l => l.grp === g.id && (l.name || '').trim())) : [];
  const lista = (arr) => arr.length > 1 ? arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1] : arr[0] || '';
  if (gs.length > 1) {
    // vários projetos: um tópico por projeto; projetos iguais (ex.: 2 vídeos) viram um tópico só
    const blocos = [];
    gs.forEach((g, i) => {
      const et = x.calc.lines.filter(l => l.grp === g.id && (l.name || '').trim()).map(l => l.name.trim().toLowerCase().replace(/\b2d\b/g, '2D').replace(/\b3d\b/g, '3D'));
      const base = (g.nome || `Entrega ${i + 1}`).replace(/\s*\(cópia\)\s*/gi, '').trim();
      const dur = grupoVideo(g) ? durMult(g.duracao ?? 1) : null;
      const sig = base + '|' + et.join('|') + '|' + (dur || '');
      const pz = prazoGrupo(x.calc, g.id);
      const b = blocos.find(y => y.sig === sig); if (b) b.n++; else blocos.push({ sig, base, et, pz, dur, video: grupoVideo(g), n: 1 });
    });
    out.push(`O projeto será realizado com base no briefing enviado pelo cliente e dividido em ${propNumExtenso(blocos.reduce((s, b) => s + b.n, 0))} entregas:`);
    blocos.forEach(b => out.push(`${b.base}${b.n > 1 ? ` (${b.n} ${b.video ? 'vídeos' : 'unidades'})` : ''}${b.dur ? `, ${String(b.dur).replace('.', ',')} min${b.n > 1 ? ' cada' : ''}` : ''}: ${lista(b.et)}. Prazo de ${b.pz} dias úteis${b.n > 1 ? ' cada' : ''}.`));
  } else out.push(nomes.length > 1 ? `A criação será realizada com base no briefing enviado pelo cliente e dividida em ${propNumExtenso(nomes.length)} etapas: ${lista(nomes)}.` : 'A criação será realizada com base no briefing enviado pelo cliente.');
  out.push(PAGAMENTOS[x.calc?.pagto || 'final']?.texto || PAGAMENTOS.final.texto);
  if (x.calc?.proposta?.datas) { const ag = propAgenda(x); if (ag) out.push(`Início previsto em ${fmtDate(ag.inicio)} e entrega em ${fmtDate(ag.fim)} (dias úteis). Se a aprovação de alguma etapa atrasar, a entrega anda junto.`); }
  if (k && k.fechado) out.push(gs.length > 1 ? `O prazo total estimado é de ${k.fechado} dias úteis, com as entregas em sequência, sem contar o tempo de aprovação do cliente e possíveis ajustes.` : `O prazo estimado é de ${k.fechado} dias úteis, sem contar o tempo de aprovação do cliente e possíveis ajustes.`);
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
    desc: p.desc ?? (x.name || ''), itens: p.itens || propItens(x, p.sep || {}), cond: p.cond || propCondicoes(x), sep: p.sep || {}, imposto: propImposto(x), total: Number(x.value) || 0, moeda: x.calc?.moeda || null,
    letra: p.letra || '', dia: p.dia || null, datas: !!p.datas,
  };
}
function propHTML(e) {
  const rod = propRodape();
  const ass = `${location.origin}/icons/assinatura.png`;
  const totalItens = e.itens.filter(i => !Number(i.nivel)).reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const simb = propMoeda(0, e.moeda).split(' ')[0];
  const impV = e.sep?.imposto && e.imposto ? Math.max(0, (e.total || 0) - totalItens) : 0;
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
  tr.sub td { font-size: 11.2px; color: #444; } tr.sub td:first-child { padding-left: 22px; } tr.grp td { padding-top: 8px; } .pt { color: #e31b1b; }
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
    ${(() => { let n0 = -1; return e.itens.map((i, n) => { const sub = Number(i.nivel) > 0; if (!sub) n0++; return `<tr class="${n === 0 ? 'first' : ''}${sub ? ' sub' : ''}${i.sub ? ' grp' : ''}"><td>${sub ? '<span class="pt">·</span> ' : letra(n0)}${esc(i.desc || '')}</td><td class="u">${esc(i.unit || '')}</td><td class="q">${esc(i.qtd || '')}</td><td class="r">${esc(simb)}</td><td class="v">${esc(propMoeda(i.valor, e.moeda).replace(/^\S+ /, ''))}</td></tr>`; }).join(''); })()}
    ${impV ? `<tr class="tot"><td>Subtotal</td><td class="u"></td><td class="q"></td><td class="r">${esc(simb)}</td><td class="v">${esc(propMoeda(totalItens, e.moeda).replace(/^\S+ /, ''))}</td></tr>
    <tr><td>Imposto (nota fiscal)${e.imposto.pct ? ` · ${String(e.imposto.pct).replace('.', ',')}%` : ''}</td><td class="u"></td><td class="q"></td><td class="r">${esc(simb)}</td><td class="v">${esc(propMoeda(impV, e.moeda).replace(/^\S+ /, ''))}</td></tr>` : ''}
    <tr class="tot fim"><td>Total</td><td class="u"></td><td class="q"></td><td class="r">${esc(simb)}</td><td class="v">${esc(propMoeda(totalItens + impV, e.moeda).replace(/^\S+ /, ''))}</td></tr>
  </table>
  <ul>${e.cond.filter(c => String(c).trim()).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
  <div class="pe"><div><img src="${ass}" alt="">${rod.linhas.map(l => esc(l)).join('<br>')}</div><div class="cargo">${esc(rod.cargo)}</div></div>
</div></body></html>`;
}
/* Nome do arquivo: NÚMERO+versão_AGÊNCIA_CLIENTE_ANOMÊSDIA, tudo junto (ex.: 1021A_BRENDA_BEMBRASIL_2026NOV17).
   Cliente direto fica sem agência. A versão (A, B, C…) só aparece quando a proposta foi alterada depois de salva. */
const propNome = (e, x) => {
  const limpa = (t) => String(t || '').normalize('NFC').replace(/[\s\-\/\\:*?"<>|.]+/g, '');
  const cli = db.get('tempo_clients', x.client_id); const ag = cli?.agency_id ? db.get('tempo_agencies', cli.agency_id) : null;
  const d = new Date((e.dia || e.data || ymd(new Date())) + 'T12:00:00');
  return [`${e.num}${e.letra || ''}`, ag && !isDirectAgency(ag) ? limpa(ag.name) : '', limpa(cli?.name), `${d.getFullYear()}${PROP_MESES[d.getMonth()]}${String(d.getDate()).padStart(2, '0')}`].filter(Boolean).join('_');
};
/* O que entra no PDF: se mudar depois de salvo, vira uma versão nova (B, C…). */
const propAssinatura = (e) => JSON.stringify([e.datas ? 1 : 0, e.cliente, e.contato, e.desc, e.cond, e.itens.map(i => [i.desc, Math.round(Number(i.valor) || 0)]), e.moeda?.cod || '', e.data]);
const PROP_PASTA = '~/BAQUER Dropbox/Tulio Couceiro/_TULIO COUCEIRO LTDA/_ADMIN/Orçamento';
const propPasta = () => db.setting('propostaPasta', null) || PROP_PASTA;
/* Grava o PDF da proposta na pasta de orçamentos (app do Mac). abrir=false: salva calado (ao salvar a proposta). */
function propSalvaArquivo(qid, abrir = false) {
  const x = db.get('tempo_quotes', qid); if (!x || !isMacApp()) return false;
  const e = propEstado(x); if (!e.num) return false;
  try { window.webkit.messageHandlers.tempo.postMessage({ type: 'pdf', html: propHTML(e), nome: propNome(e, x), dir: propPasta(), abrir }); return true; } catch (err) { return false; }
}
/* Depois de salvar: primeira vez guarda a assinatura; se o conteúdo do PDF mudou, vira versão nova
   (o original 1021 é renomeado para 1021A e a nova sai como 1021B; depois C, D…). Grava o PDF na pasta. */
function propVersionar(qid, abrir = false) {
  const x = db.get('tempo_quotes', qid); if (!x) return null;
  const p = { ...(x.calc?.proposta || {}) }; if (!p.num) return null;
  const e = propEstado(x); const assin = propAssinatura(e); const hoje = ymd(new Date());
  let renomear = null;
  if (!p.assin) { p.assin = assin; p.dia = p.dia || hoje; p.letra = p.letra || ''; }
  else if (p.assin !== assin) {
    if (!p.letra) { renomear = { de: propNome({ ...e, letra: '', dia: p.dia }, x), para: propNome({ ...e, letra: 'A', dia: p.dia }, x) }; p.letra = 'B'; }
    else p.letra = String.fromCharCode(Math.min(90, p.letra.charCodeAt(0) + 1));
    p.dia = hoje; p.assin = assin;
  }
  // histórico: cada versão gravada (o original passa a se chamar A quando sai a B)
  const vs = [...(p.versoes || [])];
  const nomeAtual = propNome({ ...e, letra: p.letra, dia: p.dia }, x);
  if (renomear) { const o = vs.find(v => v.nome === renomear.de); if (o) o.nome = renomear.para; }
  if (!vs.some(v => v.nome === nomeAtual)) vs.push({ nome: nomeAtual, dia: p.dia, valor: Number(x.value) || 0 });
  else { const v = vs.find(v => v.nome === nomeAtual); v.valor = Number(x.value) || 0; }
  p.versoes = vs;
  db.update('tempo_quotes', qid, { calc: { ...(x.calc || {}), proposta: p } }, true);
  if (isMacApp()) {
    try {
      if (renomear) window.webkit.messageHandlers.tempo.postMessage({ type: 'pdfRenomear', dir: propPasta(), ...renomear });
      const e2 = propEstado(db.get('tempo_quotes', qid));
      window.webkit.messageHandlers.tempo.postMessage({ type: 'pdf', html: propHTML(e2), nome: propNome(e2, x), dir: propPasta(), abrir });
      return { nome: propNome(e2, x), gravou: true };
    } catch (err) { return { nome: propNome(e, x), gravou: false }; }
  }
  return { nome: propNome(propEstado(db.get('tempo_quotes', qid)), x), gravou: false };
}
/* Próximo número de orçamento (o último feito à mão foi 1020). */
const propProximoNum = () => Number(db.setting('propostaNum', 1020)) + 1;
/* Tela da proposta em PDF: edita os textos, mostra a prévia e gera o arquivo. */
function openPropostaPDF(qid) {
  const x = db.get('tempo_quotes', qid); if (!x) return;
  const e = propEstado(x);
  if (!e.num) e.num = propProximoNum();
  const prev = () => `<iframe class="prop-prev" title="Prévia da proposta" srcdoc="${esc(propHTML(e))}"></iframe>`;
  const draw = () => `<div class="dh">${icon('doc')}<h2>Proposta em PDF · ${esc(x.name)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db"><div class="prop-grid">
      <div class="stack" style="gap:10px">
        <div class="grid2"><div class="field"><label for="pp-n">Número</label><input id="pp-n" type="number" class="input" data-p="num" value="${e.num}"></div>
          <div class="field"><label for="pp-d">Data</label><input id="pp-d" type="date" class="input" data-p="data" value="${e.data}"></div></div>
        <div class="field"><label for="pp-c">Cliente</label><input id="pp-c" class="input" data-p="cliente" value="${esc(e.cliente)}"></div>
        <div class="field"><label for="pp-ct">Contato</label><input id="pp-ct" class="input" data-p="contato" value="${esc(e.contato)}"></div>
        <div class="field"><label for="pp-ds">Descrição do escopo</label><textarea id="pp-ds" class="input" rows="5" data-p="desc">${esc(e.desc)}</textarea></div>
        <div class="field"><span class="lbl">Itens</span>
          <div class="row" style="gap:14px;flex-wrap:wrap;margin-bottom:8px">${[['terc', 'Terceirizados', 'Separa o valor dos terceirizados do seu dentro de cada entrega'], ['etapas', 'Separar etapas', 'Cada entrega com o subtotal e as etapas embaixo'], ['imposto', 'Imposto', 'Itens sem imposto, com subtotal + imposto = total no fim']].map(([k2, lab, tip]) => `<label class="check small" title="${tip}"><input type="checkbox" data-sep="${k2}" ${e.sep?.[k2] ? 'checked' : ''}> ${lab}</label>`).join('')}</div>
          ${e.itens.map((i, n) => `<div class="row" style="flex-wrap:nowrap;gap:6px;margin-bottom:6px;${Number(i.nivel) ? 'padding-left:22px' : ''}"><input class="input sm grow" data-it="${n}" data-k="desc" value="${esc(i.desc)}" aria-label="Item"><input class="input sm" style="width:110px" data-it="${n}" data-k="unit" value="${esc(i.unit)}" placeholder="R$/und" aria-label="Valor unitário"><input class="input sm" style="width:70px" data-it="${n}" data-k="qtd" value="${esc(i.qtd)}" placeholder="qtd" aria-label="Quantidade"><input class="input sm mono" style="width:110px" data-it="${n}" data-k="valor" type="number" value="${Math.round(Number(i.valor) || 0)}" aria-label="Valor"><button type="button" class="btn sm icon ghost" data-itdel="${n}" aria-label="Remover">${icon('x')}</button></div>`).join('')}
          <div class="row" style="gap:6px"><button type="button" class="btn sm" data-itadd>${icon('plus')} Item</button><button type="button" class="btn sm" data-itrefaz title="Volta aos itens calculados pela proposta">Refazer pelos valores</button></div>
          <span class="hint">Total dos itens: <b data-tot>${fmtMoney0(e.itens.filter(i => !Number(i.nivel)).reduce((s, i) => s + (Number(i.valor) || 0), 0))}</b>${e.sep?.imposto && e.imposto ? ' + imposto' : ''} · proposta: ${fmtMoney0(x.value)}</span></div>
        <div class="field"><label for="pp-cd">Condições (uma por linha)</label><textarea id="pp-cd" class="input" rows="8" data-p="cond">${esc(e.cond.join('\n'))}</textarea><button type="button" class="btn sm" style="margin-top:6px;align-self:flex-start" data-condrefaz>Condições padrão</button></div>
      </div>
      <div class="prop-wrap">${prev()}</div>
    </div></div>
    <div class="df"><button class="btn" data-act="close-layer">Fechar</button><button class="btn" data-psave>Salvar textos</button><button class="btn primary" data-pgera>${icon('doc')} Gerar PDF</button></div>`;
  const l = openLayer({ wide: true, render: draw });
  let t = null;
  const atualizaPrev = () => { clearTimeout(t); t = setTimeout(() => { const w = $('.prop-wrap', l.box); if (w) w.innerHTML = prev(); const tt = $('[data-tot]', l.box); if (tt) tt.textContent = fmtMoney0(e.itens.filter(i => !Number(i.nivel)).reduce((s, i) => s + (Number(i.valor) || 0), 0)); }, 250); };
  l.box.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.p) { const k = el.dataset.p; e[k] = k === 'cond' ? el.value.split('\n') : k === 'num' ? Number(el.value) || e.num : el.value; atualizaPrev(); }
    else if (el.dataset.it) { e.itens[el.dataset.it][el.dataset.k] = el.dataset.k === 'valor' ? Number(el.value) || 0 : el.value; atualizaPrev(); }
  });
  const guarda = () => {
    const atual = db.get('tempo_quotes', qid);
    const { moeda, ...resto } = clone(e);
    db.update('tempo_quotes', qid, { calc: { ...(atual.calc || {}), proposta: { ...(atual.calc?.proposta || {}), ...resto, cond: e.cond.filter(c => String(c).trim()) } } }, true);
    if (e.num > Number(db.setting('propostaNum', 1020))) db.setSetting('propostaNum', e.num);
  };
  l.box.addEventListener('change', (ev) => {
    const c = ev.target.closest('[data-sep]'); if (!c) return;
    e.sep = { ...(e.sep || {}), [c.dataset.sep]: c.checked };
    e.itens = propItens(db.get('tempo_quotes', qid), e.sep); l.refresh();
  });
  l.box.addEventListener('click', (ev) => {
    const d = ev.target.closest('[data-itdel]'); if (d) { e.itens.splice(Number(d.dataset.itdel), 1); if (!e.itens.length) e.itens.push({ desc: '', unit: '', qtd: '', valor: 0 }); l.refresh(); return; }
    if (ev.target.closest('[data-itadd]')) { e.itens.push({ desc: '', unit: '', qtd: '', valor: 0 }); l.refresh(); return; }
    if (ev.target.closest('[data-itrefaz]')) { e.itens = propItens(db.get('tempo_quotes', qid), e.sep || {}); l.refresh(); return; }
    if (ev.target.closest('[data-condrefaz]')) { e.cond = propCondicoes(db.get('tempo_quotes', qid)); l.refresh(); return; }
    if (ev.target.closest('[data-psave]')) { guarda(); toast('Textos da proposta salvos'); return; }
    if (ev.target.closest('[data-pgera]')) {
      guarda();
      if (isMacApp()) { const r = propVersionar(qid, true); toast(r?.gravou ? `Gerando ${r.nome}.pdf na pasta Orçamento…` : 'Não consegui gerar o PDF.'); return; }
      const html = propHTML(propEstado(db.get('tempo_quotes', qid)));
      const w = window.open('', '_blank');
      if (!w) { toast('Permita janelas pop-up para gerar o PDF.'); return; }
      w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (err) {} }, 600);
    }
  });
}
ACTIONS['qt-pdf'] = (el) => openPropostaPDF(el.dataset.id);
