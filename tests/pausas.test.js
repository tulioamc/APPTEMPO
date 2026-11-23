// Pausas pelo registro do computador: todo tempo da sessão sem trabalho registrado vira pausa.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const { pzReconciliar } = load(['js/pausas.js'], ['pzReconciliar']);
const H = (h, m = 0, s = 0) => new Date(2026, 10, 18, h, m, s).getTime();
const I = (t) => new Date(t).toISOString();
const W = (a, b) => ({ a, b, work: true });
const P = (a, b, why) => ({ a, b, work: false, why });

test('buraco de 10 min sem registro antes de uma pausa de sono vira pausa', () => {
  // trabalho 8h–8h24 (registro só até 8h14), sono 8h24–8h31, trabalho 8h31–9h
  const segs = [{ s: I(H(8)), e: I(H(8, 24)), why: 'sono' }, { s: I(H(8, 31)), e: I(H(9)) }];
  const recs = [W(H(8), H(8, 14)), W(H(8, 31), H(9))];
  const r = pzReconciliar(segs, recs, { T: 120e3 });
  assert.equal(r.n, 1);
  assert.deepEqual(r.segs.map(s => [s.s, s.e, s.why || '']), [
    [I(H(8)), I(H(8, 14)), 'Sem registro'], [I(H(8, 24)), I(H(8, 24)), 'sono'], [I(H(8, 31)), I(H(9)), ''],
  ]);
});

test('buraco menor que 2 min continua trabalho', () => {
  const segs = [{ s: I(H(9)), e: I(H(10)) }];
  const r = pzReconciliar(segs, [W(H(9), H(9, 30)), W(H(9, 31), H(10))], { T: 120e3 });
  assert.equal(r.n, 0);
});

test('tela bloqueada de 1 min e WhatsApp de amigo viram pausa com o nome', () => {
  const segs = [{ s: I(H(9)), e: I(H(10)) }];
  const recs = [W(H(9), H(9, 20)), P(H(9, 20), H(9, 21), 'Tela bloqueada'), W(H(9, 21), H(9, 40)), P(H(9, 40), H(9, 41), 'WhatsApp'), W(H(9, 41), H(10))];
  const r = pzReconciliar(segs, recs, { T: 120e3 });
  assert.equal(r.n, 2);
  assert.deepEqual(r.segs.map(s => s.why || ''), ['Tela bloqueada', 'WhatsApp', '']);
  assert.equal(r.segs.length, 3);
});

test('sessão rodando: não mexe depois do último registro e mantém o fim aberto', () => {
  const segs = [{ s: I(H(9)), e: null }];
  const recs = [W(H(9), H(9, 10)), W(H(9, 30), H(9, 40))];
  const r = pzReconciliar(segs, recs, { T: 120e3, at: H(10), p1: H(9, 40), aberta: true });
  assert.equal(r.n, 1);
  assert.deepEqual(r.segs.map(s => [s.s, s.e, s.why || '']), [[I(H(9)), I(H(9, 10)), 'Sem registro'], [I(H(9, 30)), null, '']]);
});

test('sessão encerrada: começo e fim parados saem da sessão', () => {
  const segs = [{ s: I(H(8)), e: I(H(12)) }];
  const r = pzReconciliar(segs, [W(H(9), H(11))], { T: 120e3 });
  assert.deepEqual(r.segs.map(s => [s.s, s.e]), [[I(H(9)), I(H(11))]]);
});

test('trecho já revisto (marca) não é mexido de novo', () => {
  const segs = [{ s: I(H(8)), e: I(H(12)) }];
  const r = pzReconciliar(segs, [W(H(8), H(9)), W(H(11), H(12))], { T: 120e3, p0: H(12) });
  assert.equal(r.n, 0);
});

test('pausas existentes (manual, ociosidade) ficam como estão', () => {
  const segs = [{ s: I(H(9)), e: I(H(9, 30)), why: 'mac' }, { s: I(H(9, 45)), e: I(H(10)) }];
  const r = pzReconciliar(segs, [W(H(9), H(10))], { T: 120e3 });
  assert.equal(r.n, 0);
});

test('pausa de WhatsApp que continuou com o computador parado: o trecho sem registro vira "Sem registro"', () => {
  // saiu de casa logo depois de abrir o WhatsApp: WhatsApp 12h08–12h11, nada até 14h36
  const { pzReconciliar: pz } = load(['js/activity.js', 'js/pausas.js'], ['pzReconciliar'], { db: { setting: () => null, all: () => [], get: () => null }, VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {} });
  const segs = [{ s: I(H(11)), e: I(H(12, 8)), why: 'WhatsApp' }, { s: I(H(14, 36)), e: I(H(15)) }];
  const r = pz(segs, [W(H(11), H(12, 8)), P(H(12, 8), H(12, 11), 'WhatsApp'), W(H(14, 36), H(15))], { T: 120e3, at: H(15) });
  assert.deepEqual(r.segs.map(x => x.why || null), ['WhatsApp', 'Sem registro', null]);
  assert.equal(r.segs[1].s, I(H(12, 11)));
});
