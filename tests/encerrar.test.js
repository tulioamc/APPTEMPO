// Encerrar: o tempo parado no fim (pausas, ocioso, WhatsApp) sai da sessão, mesmo com um uso curto de programa no meio.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const T = (h, m = 0) => new Date(2026, 10, 16, h, m).toISOString();   // 16/11/2026, hora local
const setup = (recs) => load(['js/store.js', 'js/domain.js'], ['db', 'stopPlan', 'cutSegmentsAt'], { actList: () => recs });

test('10 s no Claude antes de encerrar não salvam 2 h paradas (o caso do print)', () => {
  // trabalho 9h–11h; pausa 11h–12h; parado até 13h; 10 s no Claude às 12h59
  const recs = [{ from: T(9), to: T(11) }, { from: T(12, 59), to: new Date(new Date(T(12, 59)).getTime() + 10e3).toISOString() }];
  const e = { id: 'e', segments: [{ s: T(9), e: T(11), why: 'mac' }, { s: T(12), e: null }] };
  const m = setup(recs);
  const p = m.stopPlan(e, T(13));
  assert.equal(p.auto.cut, T(11));
  assert.equal(p.ask, null);
  const segs = m.cutSegmentsAt(e.segments, p.auto.cut);
  assert.equal(segs.length, 1); assert.equal(segs[0].e, T(11));
});

test('5 min ou mais de uso no meio de uma parada enorme: pergunta', () => {
  // trabalho 8h–9h; esquecido até 19h; 6 min de uso às 14h
  const recs = [{ from: T(8), to: T(9) }, { from: T(14), to: T(14, 6) }];
  const e = { id: 'e', segments: [{ s: T(8), e: null }] };
  const p = setup(recs).stopPlan(e, T(19));
  assert.equal(p.ask.cut, T(9));          // corte mais cedo precisa de confirmação
  assert.equal(p.auto.cut, T(14, 6));     // se disser não, corta depois do uso
});

test('trabalho de verdade no fim não é cortado', () => {
  const recs = [{ from: T(9), to: T(10) }, { from: T(10, 30), to: T(12) }];
  const e = { id: 'e', segments: [{ s: T(9), e: null }] };
  const p = setup(recs).stopPlan(e, T(12, 5));
  assert.equal(p.auto, null); assert.equal(p.ask, null);
});

test('uso acima de 5% da parada (e menos de 5 min) não é ignorado', () => {
  // parada de 20 min com 3 min de uso no meio: 15% → não corta antes dele
  const recs = [{ from: T(9), to: T(10) }, { from: T(10, 10), to: T(10, 13) }];
  const e = { id: 'e', segments: [{ s: T(9), e: null }] };
  const p = setup(recs).stopPlan(e, T(10, 20));
  assert.equal(p.auto, null);
});

test('ajustar automaticamente: tira os trechos de Mac bloqueado (2 min ou mais) do intervalo', () => {
  const { load } = require('./helpers');
  const m = load(['js/store.js', 'js/domain.js', 'js/activity-log.js', 'js/view-timesheet.js'], ['db', 'tiraBloqueios'], { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  const d = (h, mi) => new Date(2026, 10, 17, h, mi).toISOString();
  m.db.data.tempo_settings = [{ key: 'actlog:2026-11-17', value: [{ app: 'loginwindow', from: d(10, 0), to: d(11, 0) }, { app: 'loginwindow', from: d(12, 0), to: d(12, 1) }] }];
  const r = m.tiraBloqueios([{ s: d(9, 0), e: d(13, 0) }]);
  assert.equal(r.tirado, 60 * 60e3);
  assert.deepEqual(r.segs.map(x => [x.s, x.e]), [[d(9, 0), d(10, 0)], [d(11, 0), d(13, 0)]]);
});

// Mover um intervalo que começa exatamente onde um trecho termina: a lacuna vira "movido" (não pausa com o motivo antigo).
test('mover intervalo a partir do fim de um trecho não deixa pausa falsa na origem', () => {
  const { load } = require('./helpers');
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/activity.js'], ['actSubtract'], { VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {} });
  const T = (s) => new Date(s).getTime();
  const segs = [{ s: '2026-11-22T14:14:25Z', e: '2026-11-22T14:16:58Z', why: 'WhatsApp' }, { s: '2026-11-22T14:22:35Z', e: null }];
  const out = m.actSubtract(segs, [{ a: T('2026-11-22T14:16:58Z'), b: T('2026-11-22T17:04:54Z') }], 'proj-b');
  assert.equal(out[0].why, 'moved'); assert.equal(out[0].movedTo, 'proj-b');
  assert.equal(out[1].s, '2026-11-22T17:04:54.000Z'); assert.equal(out[1].e, null);
});
