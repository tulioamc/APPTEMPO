// Notas fiscais emitidas: leitura do PDF, substituição/cancelamento automáticos, vínculo com agência e pagamento, tela.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/view-reimb.js', 'js/notas-fiscais.js'],
    ['db', 'nfParse', 'nfParseSimples', 'nfReport', 'nfRegras', 'nfStatus', 'nfChip', 'nfMesesSimples', 'nfFaltando', 'nfRenomeacoes', 'nfPartyHTML', 'VIEWS'],
    { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {}, isMacApp: () => false });
  m.db.data = m.db.empty(); m.db.loaded = true;
  return m;
};
// chave de 50 dígitos: município(7) + 2 + CNPJ(14) + número(13) + AAMM + 10
const chave = (n, aamm = '2610', resto = '1910325581') => `2611606${'22'}55504134000131${String(n).padStart(13, '0')}${aamm}${resto}`;
// texto como o PDFKit devolve (rótulos e valores fora de ordem)
const nacional = (n, { valor = '20.198,00', data = '30/10/2026', tomador = 'BRENDA COMUNICACAO E CONSULTORIA DE MARKETING LTDA', doc = '15.444.106/0001-51', desc = 'Serviços de Design e Animação prestados no mês de Outubro 2026.', subst = null, sit = 'NFS-e Gerada' } = {}) =>
  `DANFSe v2.0\nCHAVE DE ACESSO DA NFS-e\n${chave(n)}\nNÚMERO DA NFS-e\nCOMPETÊNCIA DA NFS-e\n${n}\n${data}\nDATA E HORA DA EMISSÃO DA NFS-e\n${data} 10:04:58\nSITUAÇÃO DA NFS-e\n${sit}\nCNPJ / CPF / NIF\n55.504.134/0001-31\nTULIO DE AZEVEDO MELO COUCEIRO LTDA\nTOMADOR / ADQUIRENTE\nCNPJ / CPF / NIF\n${doc}\n-\nNome / Nome Empresarial\nE-mail\n${tomador}\nDescrição do Serviço\n${desc}\nVALOR TOTAL DA NFS-e\nR$ ${valor}\nR$ 0,00\nINFORMAÇÕES COMPLEMENTARES\n${subst ? 'NFSe Subst: ' + chave(subst) : ''}\n`;
const municipal = `[OCR]\nNumero da Nota\nPREFEITURA DO 00000052\nRE C I F E 16/09/2025 11:24:00\nNota Fiscal de Servigos Eletrénica\nCPF/CNPJ: §5.504.134/0001-31\nTOMADOR DE SERVICOS\nNome/Razao Social: LEAN PERFORMANCE CRIATIVA LTDA\nCPF/CNPJ: 44.265.294/0001-59\nDISCRIMINACAO DOS SERVICOS\nSERVIGO PRESTADO DE PUBLICIDADE NO PERIODO DE SETEMBRO\nVALOR TOTAL DO SERVICO = R$ 15.800,00\nOUTRAS INFORMAGOES\n- Esta NFS-e foi CANCELADA em 30/09/2025 e SUBSTITUIDA pela NFS-e 00000054, emitida em 30/09/2025`;

test('lê a NFS-e nacional pela chave, mesmo com o texto embaralhado', () => {
  const m = setup();
  const p = m.nfParse(nacional(36), '/x/NF 36.pdf');
  assert.equal(p.serie, 'nacional'); assert.equal(p.numero, 36);
  assert.equal(p.emitida_em, '2026-10-30'); assert.equal(p.valor, 20198);
  assert.equal(p.tomador_doc, '15.444.106/0001-51'); assert.match(p.tomador_nome, /^BRENDA/);
  assert.equal(p.situacao, 'gerada'); assert.match(p.descricao, /Design e Animação/);
});
test('nota de substituição cita a chave da antiga; antiga vira substituída sozinha', () => {
  const m = setup();
  m.db.setSetting('nfVinculos', {});
  const r = m.nfReport([{ id: 'a', arquivo: '/p/NF 05.pdf', texto: nacional(5, { valor: '6.000,00' }) }, { id: 'b', arquivo: '/p/NF 06.pdf', texto: nacional(6, { valor: '6.500,00', subst: 5 }) }], []);
  assert.deepEqual([...r.ids], ['a', 'b']);
  const n5 = m.db.all('tempo_invoices').find(n => n.numero === 5);
  assert.equal(n5.substituida_por, 6); assert.equal(m.nfStatus(n5), 'substituida');
  // e o arquivo da antiga ganha o aviso no nome
  assert.ok(r.renomear.some(x => x.de === '/p/NF 05.pdf' && /SUBSTITUIDA pela NF 06/.test(x.para)));
});
test('mesma descrição e tomador no mesmo dia: a nota nova substitui a anterior', () => {
  const m = setup();
  m.nfReport([{ id: 'a', arquivo: '/p/NF 35.pdf', texto: nacional(35, { valor: '20.385,50' }) }, { id: 'b', arquivo: '/p/NF 36.pdf', texto: nacional(36) }], []);
  const n35 = m.db.all('tempo_invoices').find(n => n.numero === 35);
  assert.equal(m.nfStatus(n35), 'substituida');
  assert.equal(m.nfStatus(m.db.all('tempo_invoices').find(n => n.numero === 36)), 'emitida');
});
test('nota antiga de Recife (OCR): número, valor, tomador e substituição', () => {
  const m = setup();
  const p = m.nfParse(municipal, '/p/x.pdf');
  assert.equal(p.serie, 'municipal'); assert.equal(p.numero, 52); assert.equal(p.valor, 15800);
  assert.equal(p.situacao, 'cancelada'); assert.equal(p.substituidaPor, 54); assert.match(p.tomador_nome, /^LEAN/);
});
test('nome do arquivo com CANCELADA vale como cancelada', () => {
  const m = setup();
  m.nfReport([{ id: 'a', arquivo: '/p/NF 03 - BRENDA - ES - CANCELADA.pdf', texto: nacional(3, { valor: '6.000,00', desc: 'Vídeos' }) }], []);
  assert.equal(m.nfStatus(m.db.all('tempo_invoices')[0]), 'cancelada');
});
test('liga agência pelo nome do tomador e o pagamento do mesmo valor (nota mais antiga primeiro)', () => {
  const m = setup();
  const ag = m.db.insert('tempo_agencies', { name: 'BRENDA' }, true);
  const cl = m.db.insert('tempo_clients', { name: 'BRENDA', agency_id: ag.id }, true);
  const pr = m.db.insert('tempo_projects', { name: 'Fee', client_id: cl.id }, true);
  const p1 = m.db.insert('tempo_payments', { project_id: pr.id, amount: 20198, date: '2026-10-30' }, true);
  const p2 = m.db.insert('tempo_payments', { project_id: pr.id, amount: 20198, date: '2026-11-28' }, true);
  m.nfReport([{ id: 'b', arquivo: '/p/NF 36.pdf', texto: nacional(36, { desc: 'Fee outubro' }) }, { id: 'a', arquivo: '/p/NF 33.pdf', texto: nacional(33, { data: '01/10/2026', desc: 'Fee setembro' }) }], []);
  const n = (k) => m.db.all('tempo_invoices').find(x => x.numero === k);
  assert.equal(n(33).agency_id, ag.id);
  assert.equal(n(33).payment_id, p1.id); assert.equal(n(36).payment_id, p2.id);
  assert.equal(m.nfStatus(n(33)), 'paga');
  assert.match(m.nfPartyHTML('agency', ag.id), /NF33/);
});
test('declaração do Simples alimenta a conferência; tela abre e lista faltantes', () => {
  const m = setup();
  const pgdas = 'Programa Gerador do Documento de Arrecadação\nPeríodo de Apuração: 01/10/2026 a 31/10/2026\nReceita Bruta do PA (RPA) - Competência 43.396,00 0,00 43.396,00\n2.2.1) Mercado Interno\n09/2026 6.000,00\n2.2.2) Mercado Externo\n2.8) Total Geral da Empresa\n144,79 126,69 508,57 110,40 1.570,97 0,00 0,00 1.158,32 3.619,74\nTotal do Débito com Exigibilidade Suspensa';
  m.nfReport([{ id: 's', arquivo: '/p/PGDAS.pdf', texto: pgdas }, { id: 'x', arquivo: '/p/NF 34.pdf', texto: nacional(34, { valor: '43.396,00', data: '15/10/2026', desc: 'BTS' }) }, { id: 'y', arquivo: '/p/NF 31.pdf', texto: nacional(31, { valor: '395,00', data: '29/07/2026', desc: 'C4D' }) }], []);
  const out = m.nfMesesSimples().find(x => x.ym === '2026-10');
  assert.equal(out.declarado, 43396); assert.equal(out.das, 3619.74); assert.ok(Math.abs(out.pct - 8.34) < 0.01);
  assert.deepEqual([...m.nfFaltando()[0].falta], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33]);
  m.ctx.S.nfAno = 'todos';
  const v = m.VIEWS.notas();
  assert.ok(v.html.includes('Conferência com o Simples') && v.html.includes('NF34'));
});
test('partes e ordens diferentes do mesmo cliente no mesmo dia não viram substituição', () => {
  const m = setup();
  m.nfReport([
    { id: 'a', arquivo: '/p/NF 16.pdf', texto: nacional(16, { valor: '19.200,00', data: '24/02/2026', desc: 'OC 5313 2013182 | PO 4500875444 | PP 5285' }) },
    { id: 'b', arquivo: '/p/NF 17.pdf', texto: nacional(17, { valor: '2.400,00', data: '24/02/2026', desc: 'OC 5862 2013182 | PO 4500874244 | PP 5828' }) },
    { id: 'c', arquivo: '/p/NF 39.pdf', texto: nacional(39, { valor: '10.000,00', data: '30/06/2025', desc: 'Ajuste de Identidade Visual e KV (parcela 02 de 03)' }) },
    { id: 'd', arquivo: '/p/NF 40.pdf', texto: nacional(40, { valor: '10.000,00', data: '30/06/2025', desc: 'Ajuste de Identidade Visual e KV (parcela 03 de 03)' }) }], []);
  m.db.all('tempo_invoices').forEach(n => assert.equal(m.nfStatus(n), 'emitida', 'NF' + n.numero));
});
