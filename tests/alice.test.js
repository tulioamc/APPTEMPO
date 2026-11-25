// Ciclo da Alice: mensagem curta marca o dia; longa vira aviso; fértil 10–20 dias depois; PM antes do próximo início.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/alice.js'], ['db', 'alReport', 'alDataDoTexto', 'aliceChipsHTML', 'alCiclos', 'alMapa', 'alMarcar', 'alTem', 'alVarreduraDevida', 'alResultado', 'alHorario'],
    { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  return m;
};
const ts = (s) => new Date(s).getTime() / 1000;
test('data da mensagem: "dia 20", "ontem", dd/mm ou o dia da mensagem', () => {
  const m = setup();
  assert.equal(m.alDataDoTexto('Menstruei dia 20', ts('2026-11-22T10:00')), '2026-11-20');
  assert.equal(m.alDataDoTexto('menstruei ontem', ts('2026-11-22T10:00')), '2026-11-21');
  assert.equal(m.alDataDoTexto('Menstruei 18/11', ts('2026-11-22T10:00')), '2026-11-18');
  assert.equal(m.alDataDoTexto('Menstruei', ts('2026-11-22T10:00')), '2026-11-22');
});
test('cada achado vira aviso (Sim marca); fértil e PM calculados', () => {
  const m = setup();
  m.alMarcar('2026-10-24', 'M'); m.alMarcar('2026-11-21', 'M');
  const n = m.alReport([{ id: 'c', ts: ts('2026-11-10T09:00'), tipo: 'C', curta: false },
                        { id: 'd', ts: ts('2026-12-01T09:00'), tipo: 'M', curta: true, texto: 'Menstruei' }]);
  assert.equal(n, 2);
  const av = m.db.all('tempo_notices').filter(x => x.kind === 'alice');
  assert.equal(av.length, 2);
  assert.ok(av.some(x => x.title.includes('teve cistite em 10/11/2026')) && av.some(x => x.title.includes('menstruou em 01/12/2026')));
  assert.ok(m.aliceChipsHTML('2026-11-21').includes('AL:M'));
  assert.equal(m.alCiclos().ciclo, 28);
  assert.ok(m.aliceChipsHTML('2026-12-03').includes('AL:F'));          // 21/11 + 12
  assert.ok(m.aliceChipsHTML('2026-12-17').includes('AL:PM'));         // próximo previsto 19/12
  assert.ok(!m.aliceChipsHTML('2026-11-26').includes('AL:PM'));
  assert.equal(m.alReport([{ id: 'c', ts: ts('2026-11-10T09:00'), tipo: 'C' }]), 0);   // repetida: ignora
  assert.equal(m.db.all('tempo_notices').filter(x => x.kind === 'alice').length, 2);
});
test('não pergunta de dia que já está marcado nem repete aviso do mesmo dia', () => {
  const m = setup();
  m.alMarcar('2026-11-21', 'M');
  // 23/11 já conta como AL:M pela projeção de 5 dias
  assert.equal(m.alReport([{ id: 'x', ts: ts('2026-11-23T09:00'), tipo: 'M', curta: true, texto: 'menstruada' }]), 0);
  // duas mensagens de cistite no mesmo dia: um aviso só
  assert.equal(m.alReport([{ id: 'y1', ts: ts('2026-11-25T09:00'), tipo: 'C' }, { id: 'y2', ts: ts('2026-11-25T10:00'), tipo: 'C' }]), 1);
});
test('varredura diária: devida depois do horário se ainda não rodou; app fechado no horário roda ao abrir', () => {
  const m = setup();
  const dia = (h, mi = 0) => new Date(2026, 10, 25, h, mi);
  assert.equal(m.alHorario(), '09:00');
  assert.equal(m.alVarreduraDevida(dia(8, 59)), false);          // antes do horário
  assert.equal(m.alVarreduraDevida(dia(9, 0)), true);            // na hora
  assert.equal(m.alVarreduraDevida(dia(15, 30)), true);          // app estava fechado às 9h: roda quando abrir
  m.db.setSetting('aliceUltimaVarredura', dia(9, 5).toISOString());
  assert.equal(m.alVarreduraDevida(dia(15, 30)), false);         // já rodou hoje
  assert.equal(m.alVarreduraDevida(new Date(2026, 10, 26, 9, 0)), true);   // amanhã de novo
  m.db.setSetting('aliceUltimaVarredura', dia(8, 0).toISOString());        // "Procurar agora" antes do horário não cancela a das 9h
  assert.equal(m.alVarreduraDevida(dia(9, 1)), true);
  m.db.setSetting('aliceHorario', '14:30');
  assert.equal(m.alVarreduraDevida(dia(14, 0)), false);
  assert.equal(m.alVarreduraDevida(dia(14, 30)), true);
});
test('resultado do Mac: guarda última varredura e último id; só avança o id; falha não conta como rodada', () => {
  const m = setup();
  m.alResultado({ ok: true, auto: true, ultimoId: 120, itens: [{ id: 'wa120', ts: ts('2026-11-24T09:00'), tipo: 'C', curta: false }] });
  assert.equal(m.db.setting('aliceUltimoId', 0), 120);
  assert.ok(m.db.setting('aliceUltimaVarredura', ''));
  assert.equal(m.db.all('tempo_notices').filter(x => x.kind === 'alice').length, 1);
  m.alResultado({ ok: true, auto: true, ultimoId: 0, itens: [] });   // nada novo: não volta o id
  assert.equal(m.db.setting('aliceUltimoId', 0), 120);
  const antes = m.db.setting('aliceUltimaVarredura', '');
  m.alResultado({ ok: false, motivo: 'fechado', auto: true });
  assert.equal(m.db.setting('aliceUltimaVarredura', ''), antes);
});
test('menstruação conta o dia marcado e os 4 seguintes (5 dias)', () => {
  const m = setup();
  m.alMarcar('2026-11-21', 'M');
  ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'].forEach(d => assert.ok(m.alTem(d, 'M'), d));
  assert.ok(!m.alTem('2026-11-26', 'M'));
  assert.ok(!m.alTem('2026-11-20', 'M'));
  assert.ok(m.aliceChipsHTML('2026-11-24').includes('AL:M'));
  assert.equal(m.alCiclos().inicios.length, 1);       // os dias projetados não viram início de outro ciclo
  assert.deepEqual(m.alCiclos().dur, [5]);
});
test('tirar o AL:M de um dia projetado guarda a exceção; marcar de novo volta', () => {
  const m = setup();
  m.alMarcar('2026-11-21', 'M');
  m.alMarcar('2026-11-23', 'M', false);
  assert.ok(!m.alTem('2026-11-23', 'M'));
  assert.ok(m.alTem('2026-11-22', 'M') && m.alTem('2026-11-24', 'M'));
  assert.deepEqual(m.db.setting('aliceDias', {})['2026-11-23'], ['-M']);
  m.alMarcar('2026-11-23', 'M');
  assert.ok(m.alTem('2026-11-23', 'M'));
  assert.ok(!(m.db.setting('aliceDias', {})['2026-11-23'] || []).includes('-M'));
});
test('menstruação mais longa que 5 dias: marcar o 6º dia estende a sequência sem criar outro início', () => {
  const m = setup();
  m.alMarcar('2026-11-21', 'M'); m.alMarcar('2026-11-26', 'M'); m.alMarcar('2026-11-27', 'M');
  assert.equal(m.alCiclos().inicios.length, 1);
  assert.deepEqual(m.alCiclos().dur, [7]);
  assert.ok(m.alTem('2026-11-25', 'M') && m.alTem('2026-11-27', 'M') && !m.alTem('2026-11-28', 'M'));
});
test('tirar o AL:M do 1º dia limpa a projeção inteira; cistite não é projetada', () => {
  const m = setup();
  m.alMarcar('2026-11-21', 'M'); m.alMarcar('2026-11-21', 'C');
  assert.ok(m.alTem('2026-11-21', 'C') && !m.alTem('2026-11-22', 'C'));
  m.alMarcar('2026-11-21', 'M', false);
  assert.ok(!m.alTem('2026-11-21', 'M') && !m.alTem('2026-11-23', 'M'));
});
