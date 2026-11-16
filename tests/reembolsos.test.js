// Reembolsos: virada de mês, notas fiscais e comprovantes do WhatsApp.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

function setup() {
  const toasts = []; const ref = {};
  const m = load(['js/store.js', 'js/domain.js', 'js/view-reimb.js', 'js/wa-nfse.js'],
    ['db', 'rbCreateNextMonth', 'rbStatusId', 'rbName', 'nfseParse', 'nfseJanelaMes', 'nfseValorBR', 'nfseIsoBR', 'nfseReport', 'ACTIONS', 'DEFAULT_STATUS'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, TABLE_DEFS: {}, toast: (t) => toasts.push(t), render() {}, icon: () => '', esc: (s) => String(s),
      addNotice(o) { if (o.key && ref.db.all('tempo_notices').some(n => n.key === o.key)) return null; return ref.db.insert('tempo_notices', { status: 'pending', data: {}, ...o }, true); },
      decideNotice(n, status, decision) { ref.db.update('tempo_notices', n.id, { status, decision }, true); } });
  const { db } = m; ref.db = db;
  db.data = db.empty(); db.loaded = true;
  Object.entries(m.DEFAULT_STATUS).forEach(([kind, list]) => list.forEach(([name, color], i) => db.insert('tempo_status_options', { kind, name, color, order: i }, true)));
  ['reimb_req', 'reimb_refund'].forEach(kind => db.insert('tempo_status_options', { kind, name: 'Não se aplica', color: 'gray', order: 9 }, true));
  const st = (kind, name) => m.rbStatusId(kind, name);
  const rows = (ym) => db.all('tempo_reimb_rows').filter(r => r.month === ym);
  return { ...m, st, rows, toasts };
}

test('mês novo: "Não se aplica" se repete e o valor vira só sugestão', () => {
  const t = setup();
  t.db.insert('tempo_reimb_rows', { month: '2026-10', name: 'Raquel', amount: 1500, order: 0, pay_id: t.st('reimb_pay', 'Pago'), refund_id: t.st('reimb_refund', 'Feito!'), req_id: t.st('reimb_req', 'Feito') }, true);
  t.db.insert('tempo_reimb_rows', { month: '2026-10', name: 'Dentista', amount: null, order: 1, pay_id: t.st('reimb_pay', 'Pago'), refund_id: t.st('reimb_refund', 'Não se aplica'), req_id: t.st('reimb_req', 'Não se aplica') }, true);
  assert.equal(t.rbCreateNextMonth(), '2026-11');
  const [raquel, dentista] = t.rows('2026-11');
  assert.equal(raquel.amount, null, 'valor real não é copiado');
  assert.equal(raquel.suggested_amount, 1500, 'valor anterior vira sugestão');
  assert.equal(t.rbName('reimb_pay', raquel.pay_id), 'a Pagar');
  assert.equal(t.rbName('reimb_req', raquel.req_id), 'a Fazer');
  assert.equal(t.rbName('reimb_req', dentista.req_id), 'Não se aplica');
  assert.equal(t.rbName('reimb_refund', dentista.refund_id), 'Não se aplica');
  assert.equal(t.rbCreateNextMonth(), '2026-12');
  assert.equal(t.rows('2026-12')[0].suggested_amount, 1500, 'sugestão segue para o mês seguinte se você não digitou valor');
});

test('janela de datas: até dia 19 é o mês atual, do dia 20 em diante é o seguinte', () => {
  const t = setup();
  assert.equal(t.nfseJanelaMes('2026-10-19'), '2026-10');
  assert.equal(t.nfseJanelaMes('2026-10-20'), '2026-11');
  assert.equal(t.nfseJanelaMes('2026-11-03'), '2026-11');
  assert.equal(t.nfseJanelaMes('2026-12-25'), '2027-01');
});

const NOTA = `DANFSe v2.0\nCHAVE DE ACESSO DA NFS-e\n26116062259426844000141000000000002426116124049591\nNÚMERO DA NFS-e   COMPETÊNCIA DA NFS-e   DATA E HORA DA EMISSÃO\n24   03/11/2026   03/11/2026 11:07:23\nPRESTADOR / FORNECEDOR\nNome / Nome Empresarial      Município\nTERAPIAS EXEMPLO LTDA        Recife / PE\nVALOR TOTAL DA NFS-e   VALOR DA OPERAÇÃO\nR$ 9.000,00\nVALOR LÍQUIDO DA NFS-e\nR$ 9.000,00   R$ 0,00\nINFORMAÇÕES COMPLEMENTARES\n`;

test('leitura da nota: chave, valor e prestador', () => {
  const t = setup(); const n = t.nfseParse(NOTA);
  assert.equal(n.valor, 9000); assert.equal(n.prestador, 'TERAPIAS EXEMPLO LTDA'); assert.equal(n.ym, '2026-11');
  assert.equal(t.nfseParse('um texto qualquer R$ 10,00'), null);
});

test('nota fiscal: entra como sugestão e só vira valor real quando você confirma', () => {
  const t = setup();
  const item = { id: 'sha1', contato: 'Carol AT', tipo: 'nota', texto: NOTA, data: '2026-11-03', arquivo: '/iCloud/Terapias/2026_11/NotaFiscal_2026_11_AT.pdf' };
  assert.deepEqual([...t.nfseReport([item])], ['sha1']);
  const [row] = t.rows('2026-11');
  assert.equal(row.name, 'AT'); assert.equal(row.amount, null); assert.equal(row.suggested_amount, 9000);
  assert.deepEqual(row.files.map(f => [f.tipo, f.path]), [['nota', item.arquivo]]); assert.ok(!row.note, 'a anotação fica livre');
  const aviso = t.db.all('tempo_notices').find(n => n.kind === 'nfse');
  assert.ok(aviso && aviso.status === 'pending');
  t.nfseReport([item]);
  assert.equal(t.db.all('tempo_notices').length, 1, 'a mesma nota não gera aviso duas vezes');
  t.ACTIONS['nfse-usar']({ dataset: { id: aviso.id } });
  assert.equal(t.rows('2026-11')[0].amount, 9000); assert.equal(t.rows('2026-11')[0].suggested_amount, null);
});

test('comprovante: marca Pago sozinho só quando o valor bate com a linha', () => {
  const t = setup();
  t.db.insert('tempo_reimb_rows', { month: '2026-11', name: 'Homero', amount: 1250, note: '', order: 0, pay_id: t.st('reimb_pay', 'a Pagar') }, true);
  t.db.insert('tempo_reimb_rows', { month: '2026-11', name: 'Aloma', amount: 1960, note: '', order: 1, pay_id: t.st('reimb_pay', 'a Pagar') }, true);
  t.nfseReport([{ id: 'c1', contato: 'Homero Futebol/ Bicicleta/ Skate', tipo: 'comprovante', texto: 'Comprovante de Pix R$ 1.250,00 em 05/11/2026', data: '2026-11-05', arquivo: '/x/Comprovante.png' }]);
  const homero = t.rows('2026-11')[0];
  assert.equal(t.rbName('reimb_pay', homero.pay_id), 'Pago'); assert.equal(homero.paid_on, '2026-11-05'); assert.equal(homero.files[0].tipo, 'comprovante'); assert.equal(homero.note, '');
  // valor diferente da linha: não mexe, pede confirmação
  t.nfseReport([{ id: 'c2', contato: 'Aloma Consultório', tipo: 'comprovante', texto: 'Pix enviado R$ 50,00 em 06/11/2026', data: '2026-11-06', arquivo: null }]);
  const aloma = t.rows('2026-11')[1];
  assert.equal(t.rbName('reimb_pay', aloma.pay_id), 'a Pagar', 'não marca Pago sem o valor bater');
  const aviso = t.db.all('tempo_notices').find(n => n.key === 'comp:c2');
  assert.equal(aviso.kind, 'nfse'); assert.equal(aviso.status, 'pending');
  t.ACTIONS['nfse-usar']({ dataset: { id: aviso.id } });
  assert.equal(t.rbName('reimb_pay', t.rows('2026-11')[1].pay_id), 'Pago');
  assert.equal(t.rows('2026-11')[1].amount, 1960, 'o valor da linha não é trocado pelo do comprovante');
});

test('contato fora da lista é ignorado (mas confirmado ao Mac)', () => {
  const t = setup();
  assert.deepEqual([...t.nfseReport([{ id: 'z', contato: 'Fulano', tipo: 'nota', texto: NOTA, data: '2026-11-03' }])], ['z']);
  assert.equal(t.db.all('tempo_reimb_rows').length, 0); assert.equal(t.db.all('tempo_notices').length, 0);
});

test('foto da nota: chave com espaços é recuperada e lança como nota normal', () => {
  const t = setup();
  const foto = ['Prefeitura do Recife', 'NFS-e', 'CHAVE DE ACESSO DA NFS-e',
    '2611 6062 2335 0492 0001 4000 0000 0001 0862 6114 7654', 'COMPETENCIA DA NFS-e 01/11/2026',
    'Nome / Nome Empresarial', 'RAQUEL BARRETO', 'VALOR R$ 800,00'].join('\n');
  const n = t.nfseParse(foto);
  assert.equal(n.valor, 800);
  assert.equal(n.chave.length, 44);
  assert.deepEqual([...t.nfseReport([{ id: 'f1', contato: 'Dra Raquel Barreto Psicopedagoga', tipo: 'nota', texto: foto, data: '2026-11-03', arquivo: null }])], ['f1']);
  const linha = t.db.all('tempo_reimb_rows').find(r => r.name === 'Raquel' && r.month === '2026-11');
  assert.equal(Number(linha.suggested_amount), 800);   // valor em cinza até ele confirmar
});

test('foto ruim: sem a chave, ainda lança com confirmação e não duplica', () => {
  const t = setup();
  const foto = ['NOTA FISCAL DE SERVICOS ELETRONICA', 'Nome / Nome Empresarial', 'RAQUEL BARRETO',
    'VALOR TOTAL R$ 800,00'].join('\n');
  const n = t.nfseParse(foto);
  assert.equal(n.chave, null);
  assert.equal(n.valor, 800);
  const item = { id: 'foto1', contato: 'Dra Raquel Barreto Psicopedagoga', tipo: 'nota', texto: foto, data: '2026-11-03', arquivo: null };
  assert.deepEqual([...t.nfseReport([item])], ['foto1']);
  const aviso = t.db.all('tempo_notices').find(x => x.title.includes('(foto)'));
  assert.equal(aviso.status, 'pending');               // nunca entra sozinho
  const linha = t.db.all('tempo_reimb_rows').find(r => r.name === 'Raquel' && r.month === '2026-11');
  assert.equal(linha.amount, null);
  assert.equal(Number(linha.suggested_amount), 800);
  t.nfseReport([item]);                                 // de novo: não duplica
  assert.equal(t.db.all('tempo_notices').filter(x => x.title.includes('(foto)')).length, 1);
});

test('texto que não é nota continua sendo recusado', () => {
  const t = setup();
  assert.equal(t.nfseParse('um texto qualquer R$ 10,00'), null);
  assert.equal(t.nfseParse('NFS-e sem valor nenhum'), null);
});

test('dentista: comprovante das duas conversas vai para a linha Dentista (sem nota)', () => {
  const t = setup();
  t.nfseReport([{ id: 'd1', contato: 'CRESCERODONTO  DENTISTA', tipo: 'comprovante', texto: 'Comprovante Pix R$ 350,00 03/11/2026', data: '2026-11-03', arquivo: null }]);
  t.nfseReport([{ id: 'd2', contato: '‎Cristiana da Fonte (Dentista Rafa)', tipo: 'comprovante', texto: 'Pix enviado R$ 200,00 05/11/2026', data: '2026-11-05', arquivo: null }]);
  const avisos = t.db.all('tempo_notices').filter(n => /Dentista/.test(n.title));
  assert.equal(avisos.length, 2);
});

test('reler nota já lançada: não avisa de novo, só põe o arquivo na coluna Arquivos', () => {
  const t = setup();
  const item = { id: 'sha9', contato: 'Carol AT', tipo: 'nota', texto: NOTA, data: '2026-11-03', arquivo: null };
  t.nfseReport([item]);
  t.db.update('tempo_reimb_rows', t.rows('2026-11')[0].id, { note: '3176255643 - Req em 16/11' }, true);
  t.nfseReport([{ ...item, arquivo: '/iCloud/Terapias/2026_11/AT_2026_11_Nota.pdf' }]);
  const [row] = t.rows('2026-11');
  assert.equal(t.db.all('tempo_notices').length, 1, 'sem aviso novo');
  assert.equal(row.files.length, 1); assert.equal(row.note, '3176255643 - Req em 16/11', 'anotação intacta');
  t.nfseReport([{ ...item, arquivo: '/iCloud/Terapias/2026_11/AT_2026_11_Nota.pdf' }]);
  assert.equal(t.rows('2026-11')[0].files.length, 1, 'o mesmo arquivo não entra duas vezes');
  t.nfseReport([{ ...item, id: 'sha10', arquivo: '/iCloud/Patrícia_2026_11_Nota.pdf'.normalize('NFD') }]);
  t.nfseReport([{ ...item, id: 'sha10', arquivo: '/iCloud/Patrícia_2026_11_Nota.pdf'.normalize('NFC') }]);
  assert.equal(t.rows('2026-11')[0].files.length, 2, 'acento escrito de outro jeito não duplica');
});
