/* =====================================================================
   NOTAS FISCAIS EMITIDAS (NFS-e da sua empresa)
   ---------------------------------------------------------------------
   Fonte: pasta do iCloud FINANCEIRO/NOTAS FISCAIS. O app do Mac lê cada PDF e manda o texto
   (TempoBridge.reportNotasEmitidas). Nota que chega pelo WhatsApp também vai para a pasta.
   Aqui: lê os campos, liga agência/cliente e pagamento, marca canceladas/substituídas sozinho,
   confere com o Simples (receita declarada e DAS) e mostra o chip [NF36] em todo o app.
   ===================================================================== */
const NF_MEU_CNPJ = '55504134000131';
const nfDig = (s) => String(s || '').replace(/\D/g, '');
const nfNorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nfBR = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const nfIso = (m) => (m ? `${m[3]}-${m[2]}-${m[1]}` : null);
const nfPad = (n) => String(n).padStart(2, '0');
const nfBase = (p) => String(p || '').split('/').pop();

/* Lê a nota a partir do texto do PDF (ordem do texto pode vir embaralhada; o essencial sai da chave de acesso). */
function nfParse(texto, arquivo) {
  const t = String(texto || ''), nome = nfBase(arquivo);
  if (/Programa Gerador do Documento de Arrecada/i.test(t)) return null;   // declaração do Simples, não é nota
  const chaves = [...new Set(t.match(/\d{50}/g) || [])].filter(k => k.slice(9, 23) === NF_MEU_CNPJ);
  const citadas = [...t.matchAll(/Subst\w*\s*:?\s*(\d{50})/gi)].map(m => m[1]);
  const propria = chaves.find(k => !citadas.includes(k)) || null;
  const out = { chave: propria, substitui: citadas.filter(k => k !== propria) };
  if (propria) {
    out.serie = 'nacional'; out.numero = Number(propria.slice(23, 36));
  } else {
    const minha = nfDig(t).includes('504134') || /TULIO DE AZEVEDO/i.test(t);
    const ehNota = /NFS-?e|Nota Fiscal de Servi|N[uú]mero da Nota/i.test(t);
    if (!minha || !ehNota) return null;
    out.serie = 'municipal';
    const m = t.match(/\b0000(\d{4})\b/) || nome.match(/NF\s?0*(\d+)/i);
    out.numero = m ? Number(m[1]) : null;
    const sp = t.match(/SUBSTITU\w*\s+pela\s+NFS-?e\s+0*(\d+)/i); if (sp) out.substituidaPor = Number(sp[1]);
    const ss = t.match(/substitui\w*\s+a\s+NFS-?e\s+0*(\d+)/i); if (ss) out.substituiNumero = Number(ss[1]);
    if (/CANCELAD/i.test(t)) out.situacao = 'cancelada';
  }
  if (!out.numero) return null;
  const emis = t.match(/\b(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}/);
  const comp = t.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b(?!\s+\d{2}:)/);
  out.emitida_em = nfIso(emis) || nfIso(comp) || (propria ? `20${propria.slice(36, 38)}-${propria.slice(38, 40)}-01` : null);
  out.competencia = nfIso(comp) || out.emitida_em;
  if (!out.situacao) { const s = t.match(/NFS-e\s+(Gerada|Cancelada|Substitu\w+)/i); out.situacao = s ? (/cancel/i.test(s[1]) ? 'cancelada' : /substitu/i.test(s[1]) ? 'substituida' : 'gerada') : 'gerada'; }
  const antes = t.split(/INFORMA[ÇC][ÕO]ES COMPLEMENTARES|OUTRAS INFORMA/i)[0];
  const vt = antes.match(/VAL\w*\s+TOTAL DO SERVI\w*\s*=?\s*R\$\s*([\d.]+,\d{2})/i);
  const vals = [...antes.matchAll(/R\$\s?([\d.]+,\d{2})/g)].map(m => nfBR(m[1]));
  out.valor = vt ? nfBR(vt[1]) : (vals.length ? Math.max(...vals) : null);
  const docs = (t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/g) || []).filter(d => nfDig(d) !== NF_MEU_CNPJ);
  out.tomador_doc = docs[0] || null;
  const rz = t.match(/TOMADOR[\s\S]{0,120}?Raz\w+ Social:\s*([^\n]+)/i);
  if (rz) out.tomador_nome = rz[1].trim();
  else if (out.tomador_doc) {
    const linhas = t.slice(t.indexOf(out.tomador_doc) + out.tomador_doc.length).split('\n');
    const l = linhas.map(x => x.trim()).find(x => x && x !== '-' && (x.match(/[A-Za-zÀ-ú]/g) || []).length >= 3 && !/^(Nome|E-?mail|Endere|Munic|Telefone|Inscri|Indicador|C[óo]digo|CEP|CNPJ)/i.test(x));
    out.tomador_nome = l ? l.split(/\s{2,}/)[0] : null;
  }
  const ds = t.match(/(?:Descri[çc][ãa]o do Servi[çc]o|DISCRIMINA\w+ DOS SERVI\w+)\s*\n\s*([^\n]+)/i);
  out.descricao = ds ? ds[1].replace(/\s*(Banco|PIX)\s*[:\s][\s\S]*$/i, '').trim().slice(0, 200) : null;
  return out;
}

/* Declaração do Simples (PGDAS-D): receita do mês, histórico dos meses anteriores e valor do DAS. */
function nfParseSimples(texto) {
  const t = String(texto || ''); if (!/Programa Gerador do Documento de Arrecada/i.test(t)) return null;
  const p = t.match(/Per[ií]odo de Apura[çc][ãa]o:\s*\d{2}\/(\d{2})\/(\d{4})/i); if (!p) return null;
  const ym = `${p[2]}-${p[1]}`, receita = {}, das = {};
  const rpa = t.match(/Receita Bruta do PA \(RPA\)[^\d]*([\d.]+,\d{2})/i); if (rpa) receita[ym] = nfBR(rpa[1]);
  const mi = t.split(/Mercado Interno/i)[1]?.split(/Mercado Externo/i)[0] || '';
  for (const m of mi.matchAll(/(\d{2})\/(\d{4})\s+([\d.]+,\d{2})/g)) receita[`${m[2]}-${m[1]}`] = nfBR(m[3]);
  const tg = t.split(/Total Geral da Empresa/i)[1]?.split(/Exigibilidade Suspensa/i)[0] || '';
  const vs = [...tg.matchAll(/([\d.]+,\d{2})/g)].map(m => nfBR(m[1]));
  if (vs.length) das[ym] = Math.max(...vs);
  return { ym, receita, das };
}

/* ---------- estado e regras ---------- */
const nfTodas = () => db.all('tempo_invoices');
const nfArquivoStatus = (nf) => { const b = nfNorm(nfBase(nf.arquivo)); const m = b.match(/pela nf (\d+)/); return /cancelad/.test(b) ? { st: 'cancelada', por: m ? Number(m[1]) : null } : /substitu/.test(b) ? { st: 'substituida', por: m ? Number(m[1]) : null } : null; };
function nfStatus(nf) {
  const m = nf.status_manual;
  if (m === 'cancelada' || m === 'substituida') return m;
  if (m !== 'valida') {
    const a = nfArquivoStatus(nf);
    if (nf.situacao === 'cancelada' || a?.st === 'cancelada') return 'cancelada';
    if (nf.situacao === 'substituida' || a?.st === 'substituida' || nf.substituida_por) return 'substituida';
  }
  if (m === 'paga' || (nf.payment_id && db.get('tempo_payments', nf.payment_id))) return 'paga';
  if (nf.enviada_em) return 'enviada';
  return 'emitida';
}
const nfValida = (nf) => !['cancelada', 'substituida'].includes(nfStatus(nf));
const NF_ST = { emitida: ['Nota emitida', 'blue'], enviada: ['Nota enviada', 'purple'], paga: ['Paga', 'green'], cancelada: ['Cancelada', 'red'], substituida: ['Substituída', 'gray'] };
const nfStLabel = (nf) => { const st = nfStatus(nf); return st === 'substituida' && nf.substituida_por ? `Substituída pela NF${nfPad(nf.substituida_por)}` : NF_ST[st][0]; };

/* Chip [NF36]: clique abre o PDF no iCloud; botão direito tem as ações. */
function nfChip(nf, opts = {}) {
  if (!nf) return '';
  const st = nfStatus(nf); const [, cor] = NF_ST[st];
  const tip = `NF ${nfPad(nf.numero)}${nf.serie === 'municipal' ? ' (Recife)' : ''} · ${nfStLabel(nf)}\n${fmtMoney(nf.valor) || ''} · emitida ${fmtDate(nf.emitida_em)}${nf.arquivo ? '\nClique para abrir o PDF' : '\nSem arquivo na pasta'}`;
  return `<span class="tag c-${cor} nf-chip nf-${st}" role="button" tabindex="0" data-act="nf-open" data-id="${nf.id}" data-tip="${esc(tip)}">NF${nfPad(nf.numero)}</span>${opts.label ? ` <span class="small muted">${esc(nfStLabel(nf).toLowerCase())}</span>` : ''}`;
}
const nfsDoPagamento = (pid) => nfTodas().filter(n => n.payment_id === pid);
function nfsDoProjeto(pid) {
  const pays = new Set(db.where('tempo_payments', x => x.project_id === pid).map(x => x.id));
  return nfTodas().filter(n => n.payment_id && pays.has(n.payment_id)).sort((a, b) => (a.emitida_em || '').localeCompare(b.emitida_em || ''));
}
const nfChips = (lista, opts) => lista.map(n => nfChip(n, opts)).join(' ');

/* Agência / cliente da nota: o que você escolheu > mapa salvo > CNPJ aprendido > cadastro > nome do tomador > nome do arquivo e descrição. */
function nfPartido(nf) {
  const ags = db.all('tempo_agencies'), cls = db.all('tempo_clients');
  const porNome = (lista, n) => n ? lista.find(x => nfNorm(x.name) === nfNorm(n)) : null;
  const v = (db.setting('nfVinculos', {}) || {})[`${nf.serie}:${nf.numero}`];
  if (v) { const a = porNome(ags, v[0]), c = porNome(cls, v[1]); if (a || c) return { agency_id: a?.id || c?.agency_id || null, client_id: c?.id || null }; }
  const doc = nfDig(nf.tomador_doc);
  const apr = doc && (db.setting('nfTomador', {}) || {})[doc];
  if (apr) return apr;
  if (doc) {
    const c = cls.find(x => nfDig(x.cnpj) === doc); if (c) return { agency_id: c.agency_id || null, client_id: c.id };
    const a = ags.find(x => nfDig(x.cnpj) === doc); if (a) return { agency_id: a.id, client_id: null };
  }
  const txt = nfNorm(`${nfBase(nf.arquivo)} ${nf.descricao || ''}`).replace(/[^a-z0-9]+/g, ' ');
  const junto = txt.replace(/ /g, ''), tokens = new Set(txt.split(' '));
  const cli = cls.filter(c => { const n = nfNorm(c.name).replace(/[^a-z0-9]/g, ''); return n.length >= 5 ? junto.includes(n) : n.length >= 3 && tokens.has(n); }).sort((a, b) => b.name.length - a.name.length)[0];
  const primeira = nfNorm(nf.tomador_nome).split(/\s+/)[0] || '';
  const ag = primeira.length >= 4 ? ags.find(a => nfNorm(a.name).replace(/\s+/g, '') === primeira) : null;
  if (cli && (!ag || cli.agency_id === ag.id)) return { agency_id: cli.agency_id || null, client_id: cli.id };
  return { agency_id: ag?.id || null, client_id: null };
}

/* Pagamento da nota: mesmo valor, do mesmo cliente/agência, a partir de 10 dias antes da emissão. Nota mais antiga pega primeiro. */
function nfPagamentos(notas) {
  const usados = new Set(); const res = {};
  const add = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); };
  notas.filter(n => nfValida(n) && n.valor && n.emitida_em && (n.client_id || n.agency_id))
    .sort((a, b) => (a.emitida_em || '').localeCompare(b.emitida_em || '') || a.numero - b.numero)
    .forEach(n => {
      const projs = new Set(projects().filter(p => n.client_id ? p.client_id === n.client_id : agencyOf(p)?.id === n.agency_id).map(p => p.id));
      const de = add(n.emitida_em, -10), ate = add(n.emitida_em, 120);
      const p = db.all('tempo_payments').filter(x => projs.has(x.project_id) && x.date && x.date >= de && x.date <= ate && !usados.has(x.id) && Math.abs(Number(x.amount) - Number(n.valor)) <= Math.max(1, Number(n.valor) * 0.005))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (p) { usados.add(p.id); res[n.id] = p.id; } else res[n.id] = null;
    });
  return res;
}

let NF_REGRAS_AT = 0;
/* Aplica as regras automáticas (só grava o que mudou). force: ignora o intervalo mínimo. */
function nfRegras(force) {
  if (!db.loaded || !db.data.tempo_invoices) return;
  if (!force && Date.now() - NF_REGRAS_AT < 30000) return;
  NF_REGRAS_AT = Date.now();
  const notas = nfTodas(); const porChave = {}, porNum = {};
  notas.forEach(n => { if (n.chave) porChave[n.chave] = n; porNum[`${n.serie}:${n.numero}`] = n; });
  const mud = {}; const set = (n, k, v) => { if ((n[k] ?? null) !== (v ?? null)) (mud[n.id] ||= {})[k] = v; };
  notas.forEach(n => {
    (n.substitui || []).forEach(k => { const x = porChave[k]; if (x && x.id !== n.id) set(x, 'substituida_por', n.numero); });
    const a = nfArquivoStatus(n); if (a?.por) set(n, 'substituida_por', a.por);
  });
  // mesma descrição, mesmo tomador, até 3 dias depois: a nova substituiu a antiga
  // números contam (OC 5313 ≠ OC 5862; Parte 01 ≠ Parte 02); valor parecido (±10%); uma descrição pode conter a outra
  const chaveDesc = (n) => nfNorm(n.descricao).replace(/[^a-z0-9]+/g, '');
  const mesmaDesc = (a, b) => { const x = chaveDesc(a), y = chaveDesc(b); return x.length >= 15 && y.length >= 15 && (x === y || x.includes(y) || y.includes(x)); };
  const valorPerto = (a, b) => a.valor && b.valor && Math.abs(Number(a.valor) - Number(b.valor)) <= 0.1 * Math.max(Number(a.valor), Number(b.valor));
  notas.forEach(x => {
    if (x.substituida_por || x.status_manual === 'valida' || !chaveDesc(x)) return;
    if (/parcela|parte/i.test(x.descricao || '')) return;   // parcelas e partes de um mesmo job não se substituem
    const y = notas.find(o => o.id !== x.id && o.serie === x.serie && o.numero > x.numero && o.tomador_doc && o.tomador_doc === x.tomador_doc && mesmaDesc(o, x) && valorPerto(o, x) && o.emitida_em && x.emitida_em && Math.abs(new Date(o.emitida_em) - new Date(x.emitida_em)) <= 3 * 864e5);
    if (y) set(x, 'substituida_por', y.numero);
  });
  notas.forEach(n => { if (n.vinculo_manual) return; const p = nfPartido({ ...n, ...(mud[n.id] || {}) }); set(n, 'agency_id', p.agency_id); set(n, 'client_id', p.client_id); });
  const pg = nfPagamentos(notas.map(n => ({ ...n, ...(mud[n.id] || {}) })));
  Object.entries(pg).forEach(([id, pid]) => set(db.get('tempo_invoices', id), 'payment_id', pid));
  notas.filter(n => n.payment_id && !(n.id in pg)).forEach(n => set(n, 'payment_id', null));   // cancelada/substituída não fica com pagamento
  const ids = Object.keys(mud);
  ids.forEach(id => db.update('tempo_invoices', id, mud[id], true));
  if (ids.length) db.emit();
}

/* Nome padrão do arquivo: NF 36 - AGÊNCIA - CLIENTE - PROJETO (Parcela) - STATUS */
function nfNomePadrao(nf) {
  const ag = db.get('tempo_agencies', nf.agency_id), cl = db.get('tempo_clients', nf.client_id);
  const pay = nf.payment_id ? db.get('tempo_payments', nf.payment_id) : null; const pr = pay ? db.get('tempo_projects', pay.project_id) : null;
  const agN = ag ? ((typeof isDirectAgency === 'function' && isDirectAgency(ag)) ? 'DIRETO' : ag.name.toUpperCase()) : (nf.tomador_nome || '').split(/\s+/).slice(0, 2).join(' ').toUpperCase();
  const proj = pr?.name || String(nf.descricao || '').replace(/^(servi[çc]os?\s+(prestados?\s+)?(de\s+)?)/i, '').slice(0, 45).trim();
  const st = nfStatus(nf);
  const parts = [`NF ${nfPad(nf.numero)}`, agN, cl && nfNorm(cl.name) !== nfNorm(ag?.name) ? cl.name.toUpperCase() : null, proj || null].filter(Boolean);
  const suf = st === 'cancelada' ? ' - CANCELADA' : st === 'substituida' ? ` - SUBSTITUIDA${nf.substituida_por ? ' pela NF ' + nfPad(nf.substituida_por) : ''}` : '';
  return (parts.join(' - ') + suf).replace(/[/\\:]/g, '-') + '.pdf';
}
/* Arquivos a renomear: nota nova "(nova)" ganha o nome padrão; nota que virou cancelada/substituída ganha o aviso no nome. */
function nfRenomeacoes() {
  const out = [];
  nfTodas().forEach(n => {
    if (!n.arquivo) return; const b = nfBase(n.arquivo); const st = nfStatus(n);
    if (/\(nova\)/i.test(b) && (n.agency_id || n.tomador_nome)) out.push({ de: n.arquivo, para: nfNomePadrao(n) });
    else if ((st === 'cancelada' || st === 'substituida') && !nfArquivoStatus(n)) out.push({ de: n.arquivo, para: b.replace(/\.pdf$/i, '') + (st === 'cancelada' ? ' - CANCELADA' : ` - SUBSTITUIDA${n.substituida_por ? ' pela NF ' + nfPad(n.substituida_por) : ''}`) + '.pdf' });
  });
  return out;
}

/* Chamado pelo app do Mac. itens: [{id, arquivo, texto}] (só os novos); inventario: [{id, arquivo}] (tudo que está na pasta).
   Devolve { ids recebidos, renomear: [{de, para}] }. */
function nfReport(itens, inventario) {
  if (!db.loaded || !db.data.tempo_invoices) return { ids: [], renomear: [] };
  const ids = [];
  (itens || []).forEach(it => {
    try {
      const s = nfParseSimples(it.texto);
      if (s) {
        const cur = db.setting('simples', {}) || {};
        db.setSetting('simples', { ...cur, receita: { ...(cur.receita || {}), ...s.receita }, das: { ...(cur.das || {}), ...s.das } });
        ids.push(it.id); return;
      }
      const p = nfParse(it.texto, it.arquivo);
      if (!p) { ids.push(it.id); return; }
      const ex = nfTodas().find(n => n.serie === p.serie && n.numero === p.numero);
      const campos = { chave: p.chave, emitida_em: p.emitida_em, competencia: p.competencia, valor: p.valor, tomador_nome: p.tomador_nome, tomador_doc: p.tomador_doc, descricao: p.descricao, situacao: p.situacao, substitui: p.substitui || [] };
      if (p.substituidaPor) campos.substituida_por = p.substituidaPor;
      if (ex) {
        const upd = {};
        Object.entries(campos).forEach(([k, v]) => { if (v !== null && v !== undefined && JSON.stringify(ex[k] ?? null) !== JSON.stringify(v)) upd[k] = v; });
        // arquivo: fica o que tem o carimbo de cancelada/substituída, senão o mais recente
        if (!ex.arquivo || (nfArquivoStatus({ arquivo: it.arquivo }) && !nfArquivoStatus(ex))) { upd.arquivo = it.arquivo; upd.sha = it.id; }
        else if (!ex.sha && nfBase(ex.arquivo) === nfBase(it.arquivo)) upd.sha = it.id;   // nota carregada antes: passa a acompanhar o arquivo
        if (Object.keys(upd).length) db.update('tempo_invoices', ex.id, upd, true);
      } else {
        const base = { serie: p.serie, numero: p.numero, ...campos, arquivo: it.arquivo, sha: it.id };
        db.insert('tempo_invoices', { ...base, ...nfPartido(base) }, true);
        if (p.serie === 'nacional' && typeof addNotice === 'function') addNotice({ kind: 'nfse', key: 'nf-emitida:' + (p.chave || it.id), title: `NF${nfPad(p.numero)} emitida: ${fmtMoney(p.valor) || ''}`, body: `${p.tomador_nome || ''} · ${fmtDate(p.emitida_em)}. Já está em Notas fiscais.`, entity: 'notas', data: {} });
      }
      if (p.substituiNumero) { const x = nfTodas().find(n => n.serie === p.serie && n.numero === p.substituiNumero); if (x && x.substituida_por !== p.numero) db.update('tempo_invoices', x.id, { substituida_por: p.numero }, true); }
      ids.push(it.id);
    } catch (e) { console.warn('nfReport', e); }
  });
  // arquivo renomeado ou movido: o sha continua o mesmo
  const porSha = {}; (inventario || []).forEach(x => { porSha[x.id] = x.arquivo; });
  if ((inventario || []).length) nfTodas().forEach(n => { const a = n.sha && porSha[n.sha]; if (a && a !== n.arquivo) db.update('tempo_invoices', n.id, { arquivo: a }, true); });
  nfRegras(true);
  db.emit();
  return { ids, renomear: nfRenomeacoes() };
}

/* ---------- Simples: receita declarada × notas × DAS ---------- */
function nfMesesSimples() {
  const s = db.setting('simples', {}) || {}; const rec = s.receita || {}, das = s.das || {};
  const prox = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${nfPad(m + 1)}`; };
  const dasPago = (ym) => { const e = db.all('tempo_expenses').filter(x => /simples/i.test(x.name || '') && x.amount && (x.paid_on || '').slice(0, 7) === prox(ym)); return e.length ? e.reduce((t, x) => t + Number(x.amount), 0) : null; };
  const notas = {}; nfTodas().filter(nfValida).forEach(n => { const ym = (n.competencia || n.emitida_em || '').slice(0, 7); if (ym) notas[ym] = (notas[ym] || 0) + Number(n.valor || 0); });
  const meses = [...new Set([...Object.keys(rec), ...Object.keys(notas)])].sort().reverse();
  return meses.map(ym => { const d = das[ym] ?? dasPago(ym); const r = rec[ym] ?? null; return { ym, declarado: r, notas: notas[ym] || 0, das: d, pct: d && r ? d / r * 100 : null, fonteDas: das[ym] != null ? 'declaração' : d != null ? 'pago' : null }; });
}
function nfFaltando() {
  const out = [];
  ['nacional', 'municipal'].forEach(serie => {
    const nums = nfTodas().filter(n => n.serie === serie).map(n => n.numero).sort((a, b) => a - b);
    if (!nums.length) return; const set = new Set(nums); const falta = [];
    for (let i = 1; i < nums[nums.length - 1]; i++) if (!set.has(i)) falta.push(i);
    if (falta.length) out.push({ serie, falta });
  });
  return out;
}

/* ---------- tela ---------- */
VIEWS.notas = () => {
  nfRegras();
  const todas = nfTodas();
  const anos = [...new Set(todas.map(n => (n.emitida_em || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const ano = S.nfAno || anos[0] || String(new Date().getFullYear());
  const lista = todas.filter(n => ano === 'todos' || (n.emitida_em || '').startsWith(ano)).sort((a, b) => (b.emitida_em || '').localeCompare(a.emitida_em || '') || b.numero - a.numero);
  const val = lista.filter(nfValida); const soma = (l) => l.reduce((s, n) => s + Number(n.valor || 0), 0);
  const aReceber = val.filter(n => nfStatus(n) !== 'paga');
  const falt = nfFaltando();
  const ym = ymd(new Date()).slice(0, 7);
  const mesAtual = todas.filter(n => nfValida(n) && (n.emitida_em || '').startsWith(ym));
  const kpis = `<div class="kpis">
    <div class="kpi"><span class="k">Emitidas ${ano === 'todos' ? '' : 'em ' + ano}</span><span class="v">${fmtMoney0(soma(val))}</span><span class="s">${val.length} válidas · ${lista.length - val.length} canceladas/substituídas</span></div>
    <div class="kpi"><span class="k">Este mês</span><span class="v">${fmtMoney0(soma(mesAtual))}</span><span class="s">${mesAtual.length} nota(s)</span></div>
    <div class="kpi"><span class="k">Ainda sem pagamento</span><span class="v">${fmtMoney0(soma(aReceber))}</span><span class="s">${aReceber.length} nota(s)</span></div>
    <div class="kpi"><span class="k">Faltando na pasta</span><span class="v">${falt.reduce((s, f) => s + f.falta.length, 0)}</span><span class="s">${falt.map(f => (f.serie === 'nacional' ? 'nacional: ' : 'Recife: ') + f.falta.join(', ')).join(' · ') || 'nenhuma'}</span></div></div>`;
  const ms = nfMesesSimples().filter(m => ano === 'todos' || m.ym.startsWith(ano));
  const simples = ms.length ? `<table class="grid static compact"><thead><tr><th>Mês</th><th class="money">Notas válidas</th><th class="money">Declarado no Simples</th><th class="money">Diferença</th><th class="money">DAS</th><th class="money">% de imposto</th></tr></thead><tbody>${ms.map(m => {
    const dif = m.declarado == null ? null : m.declarado - m.notas;
    return `<tr><td>${rbLabel(m.ym)}</td><td class="money">${fmtMoney(m.notas)}</td><td class="money">${m.declarado == null ? '<span class="faint">—</span>' : fmtMoney(m.declarado)}</td><td class="money ${dif && Math.abs(dif) > 1 ? 'nf-dif' : ''}">${dif == null ? '' : Math.abs(dif) <= 1 ? '<span class="faint">bate</span>' : fmtMoney(dif)}</td><td class="money">${m.das == null ? '' : fmtMoney(m.das)}${m.fonteDas === 'pago' ? ' <span class="faint small" data-tip="Valor pago no mês seguinte, das Despesas">pago</span>' : ''}</td><td class="money">${m.pct == null ? '' : m.pct.toFixed(2).replace('.', ',') + '%'}</td></tr>`;
  }).join('')}</tbody></table><div class="small muted" style="padding:8px 12px">Diferença = declarado − notas válidas do mês (pela competência). Positivo: declarou mais do que tem de nota.</div>` : '<div class="empty small">Sem declaração do Simples ainda. Ponha o PDF do PGDAS na pasta de notas que ele é lido.</div>';
  const opts = (lista2, sel) => `<option value="">—</option>${lista2.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  const ags = db.all('tempo_agencies').filter(a => !a.archived).sort((a, b) => a.name.localeCompare(b.name));
  const rows = lista.map(n => {
    const st = nfStatus(n); const pay = n.payment_id ? db.get('tempo_payments', n.payment_id) : null; const pr = pay ? db.get('tempo_projects', pay.project_id) : null;
    const cls = db.all('tempo_clients').filter(c => !n.agency_id || c.agency_id === n.agency_id).sort((a, b) => a.name.localeCompare(b.name));
    return `<tr class="${nfValida(n) ? '' : 'nf-off'}">
      <td>${nfChip(n)}${n.serie === 'municipal' ? ' <span class="faint small">Recife</span>' : ''}</td>
      <td>${fmtDate(n.emitida_em)}</td>
      <td class="nf-tom"><div class="row" style="gap:4px;flex-wrap:nowrap"><select class="input sm" data-on="nf-ag" data-id="${n.id}" aria-label="Agência">${opts(ags, n.agency_id)}</select><select class="input sm" data-on="nf-cl" data-id="${n.id}" aria-label="Cliente">${opts(cls, n.client_id)}</select></div><div class="small faint nf-cut" title="${esc(n.tomador_nome || '')}">${esc(n.tomador_nome || '')}</div></td>
      <td class="money">${fmtMoney(n.valor)}</td>
      <td class="small nf-cut" title="${esc(n.descricao || '')}">${esc(n.descricao || '')}</td>
      <td><select class="input sm" data-on="nf-st" data-id="${n.id}" aria-label="Situação"><option value="" ${!n.status_manual ? 'selected' : ''}>${esc(nfStLabel({ ...n, status_manual: null }))} (auto)</option><option value="valida" ${n.status_manual === 'valida' ? 'selected' : ''}>Válida</option><option value="paga" ${n.status_manual === 'paga' ? 'selected' : ''}>Paga</option><option value="cancelada" ${n.status_manual === 'cancelada' ? 'selected' : ''}>Cancelada</option><option value="substituida" ${n.status_manual === 'substituida' ? 'selected' : ''}>Substituída</option></select></td>
      <td>${nfValida(n) ? `<button class="btn sm ${n.enviada_em ? 'primary' : 'ghost'}" data-act="nf-enviada" data-id="${n.id}" data-tip="${n.enviada_em ? 'Enviada em ' + fmtDate(n.enviada_em) + '. Clique para desmarcar.' : 'Marcar como enviada ao cliente'}">${n.enviada_em ? 'Enviada' : 'Enviar?'}</button>` : ''}</td>
      <td class="small nf-cut">${pay ? `<a href="#" data-act="fin-open" data-id="${pay.project_id}" title="${esc(pr?.name || '')}">${fmtDate(pay.date)} · ${esc(pr?.name || '')}</a>` : st === 'cancelada' || st === 'substituida' ? '' : '<span class="faint">sem pagamento</span>'}</td></tr>`;
  }).join('');
  const html = `${kpis}
    <div class="panel"><div class="panel-h"><h3>Conferência com o Simples</h3></div><div class="panel-b tight">${simples}</div></div>
    <div class="panel"><div class="panel-h"><h3>Notas</h3><span class="grow"></span><select class="input sm" data-on="nf-ano" style="width:auto">${[...anos, 'todos'].map(a => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a === 'todos' ? 'Todos os anos' : a}</option>`).join('')}</select></div>
    <div class="panel-b tight">${lista.length ? `<table class="grid static compact nf-tab"><colgroup><col style="width:80px"><col style="width:100px"><col style="width:300px"><col style="width:120px"><col><col style="width:190px"><col style="width:92px"><col style="width:220px"></colgroup><thead><tr><th>Nota</th><th>Emissão</th><th>Agência · cliente</th><th class="money">Valor</th><th>Descrição</th><th>Situação</th><th>Envio</th><th>Pagamento</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${icon('doc')}<b>Nenhuma nota ainda</b><span>O app do Mac lê a pasta FINANCEIRO/NOTAS FISCAIS do iCloud.</span></div>`}</div></div>`;
  const actions = isMacApp() ? `<button class="btn sm" data-act="nf-reler">${icon('undo')} Reler pasta</button>` : '';
  return { title: 'Notas fiscais', actions, html };
};

/* Seção da agência/cliente (gaveta): notas emitidas para ela. */
function nfPartyHTML(kind, id) {
  const l = nfTodas().filter(n => kind === 'agency' ? n.agency_id === id : n.client_id === id).sort((a, b) => (b.emitida_em || '').localeCompare(a.emitida_em || ''));
  if (!l.length) return '';
  const v = l.filter(nfValida), ano = String(new Date().getFullYear());
  const tot = (x) => x.reduce((s, n) => s + Number(n.valor || 0), 0);
  return `<div class="stack" style="gap:6px"><div class="row between"><span class="lbl">Notas fiscais</span><span class="small muted">${fmtMoney0(tot(v.filter(n => (n.emitida_em || '').startsWith(ano))))} em ${ano} · ${fmtMoney0(tot(v))} no total</span></div><div class="row" style="gap:4px;flex-wrap:wrap">${nfChips(l)}</div></div>`;
}

/* ---------- ações ---------- */
ACTIONS['nf-open'] = async (el) => {
  const n = db.get('tempo_invoices', el.dataset.id); if (!n) return;
  if (!n.arquivo) return toast('Essa nota não tem arquivo na pasta.');
  if (isMacApp()) { try { window.webkit.messageHandlers.tempo.postMessage({ type: 'open', path: n.arquivo, abrir: true }); } catch (e) { toast('Não consegui abrir o arquivo.'); } return; }
  try { await navigator.clipboard.writeText(n.arquivo); toast('Caminho copiado. No app do Mac o PDF abre com um clique.'); } catch (e) { toast('Abra pelo app do Mac para o PDF abrir com um clique.'); }
};
ACTIONS['nf-enviada'] = (el) => { const n = db.get('tempo_invoices', el.dataset.id); if (!n) return; db.update('tempo_invoices', n.id, { enviada_em: n.enviada_em ? null : ymd(new Date()) }); };
ACTIONS['nf-reler'] = () => { try { window.webkit.messageHandlers.tempo.postMessage({ type: 'nfReler' }); toast('Relendo a pasta de notas…'); } catch (e) { toast('Só no app do Mac.'); } };
CHANGES['nf-ano'] = (el) => { S.nfAno = el.value; render(); };
CHANGES['nf-st'] = (el) => { db.update('tempo_invoices', el.dataset.id, { status_manual: el.value || null }); nfRegras(true); };
function nfAprender(n, agency_id, client_id) {
  const doc = nfDig(n.tomador_doc); if (!doc) return;
  const m = { ...(db.setting('nfTomador', {}) || {}) }; m[doc] = { agency_id, client_id: null }; db.setSetting('nfTomador', m);
}
CHANGES['nf-ag'] = (el) => {
  const n = db.get('tempo_invoices', el.dataset.id); if (!n) return; const ag = el.value || null;
  const cl = n.client_id && db.get('tempo_clients', n.client_id)?.agency_id === ag ? n.client_id : null;
  db.update('tempo_invoices', n.id, { agency_id: ag, client_id: cl, vinculo_manual: true }); nfAprender(n, ag, cl); nfRegras(true);
};
CHANGES['nf-cl'] = (el) => {
  const n = db.get('tempo_invoices', el.dataset.id); if (!n) return; const c = el.value ? db.get('tempo_clients', el.value) : null;
  db.update('tempo_invoices', n.id, { client_id: c?.id || null, agency_id: c?.agency_id || n.agency_id, vinculo_manual: true }); nfRegras(true);
};

/* Botão direito no chip [NF36] */
function nfCtxItems(t) {
  const n = db.get('tempo_invoices', t.id); if (!n) return [];
  const out = []; const add = (label, run, o = {}) => out.push({ label, run, ...o });
  add('Abrir PDF', () => ACTIONS['nf-open']({ dataset: { id: n.id } }));
  if (nfValida(n)) add(n.enviada_em ? 'Desmarcar enviada' : 'Marcar como enviada', () => ACTIONS['nf-enviada']({ dataset: { id: n.id } }));
  if (nfValida(n) && n.status_manual !== 'paga') add('Marcar como paga', () => db.update('tempo_invoices', n.id, { status_manual: 'paga' }));
  add('Marcar como cancelada', () => db.update('tempo_invoices', n.id, { status_manual: 'cancelada' }));
  add('Marcar como substituída', () => db.update('tempo_invoices', n.id, { status_manual: 'substituida' }));
  if (n.status_manual) add('Voltar ao automático', () => db.update('tempo_invoices', n.id, { status_manual: null }));
  add('Ver em Notas fiscais', () => go('notas'));
  return out;
}
if (typeof CTX_ACT_KIND !== 'undefined') {
  CTX_ACT_KIND['nf-open'] = 'nf';
  const ctxItemsOrig = ctxItems;
  ctxItems = (t) => (t.kind === 'nf' ? nfCtxItems(t) : ctxItemsOrig(t));   // eslint-disable-line no-global-assign
}
