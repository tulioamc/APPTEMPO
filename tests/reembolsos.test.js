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
  assert.match(row.note, /\[LINK NF\] \/iCloud/);
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
  assert.equal(t.rbName('reimb_pay', homero.pay_id), 'Pago'); assert.equal(homero.paid_on, '2026-11-05'); assert.match(homero.note, /LINK PAGAMENTO/);
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
