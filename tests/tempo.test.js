// Cálculos de tempo: trabalho, bruto e pausas.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const H = 3600e3, M = 60e3;
const setup = (entries) => {
  const m = load(['js/store.js', 'js/domain.js'], ['db', 'entryMs', 'entryBrutoMs', 'entryBruIntervals', 'pauseGapsOf', 'entryGaps']);
  m.db.data = m.db.empty(); m.db.data.tempo_time_entries = entries; return m;
};
const seg = (s, e, why) => ({ s: `2026-11-16T${s}:00-03:00`, e: e ? `2026-11-16T${e}:00-03:00` : null, ...(why ? { why } : {}) });
const total = (gaps) => gaps.reduce((t, g) => t + (new Date(g.e) - new Date(g.s)), 0);

test('trabalho soma só os segmentos; pausa é a lacuna entre eles', () => {
  const e = { id: 'a', segments: [seg('08:00', '10:00', 'mac'), seg('10:30', '12:00')] };
  const m = setup([e]);
  assert.equal(m.entryMs(e), 3.5 * H);
  assert.equal(m.entryBrutoMs(e), 4 * H);
  assert.equal(total(m.pauseGapsOf([e])), 30 * M);
  assert.equal(m.pauseGapsOf([e])[0].why, 'mac');
});

test('sessão rodando conta até o instante pedido', () => {
  const e = { id: 'a', state: 'running', segments: [seg('08:00', null)] };
  const m = setup([e]);
  assert.equal(m.entryMs(e, new Date('2026-11-16T09:15:00-03:00').getTime()), 75 * M);
});

test('trecho movido para outro projeto sai do bruto e não é pausa', () => {
  const e = { id: 'a', segments: [seg('08:00', '09:00', 'moved'), seg('10:00', '11:00')] };
  const m = setup([e]);
  assert.equal(m.entryMs(e), 2 * H);
  assert.equal(m.entryBrutoMs(e), 2 * H);
  assert.equal(m.entryBruIntervals(e).length, 2);
  assert.equal(m.pauseGapsOf([e]).length, 0);
});

test('tempo parado numa sessão enquanto outra trabalha não é pausa', () => {
  const a = { id: 'a', segments: [seg('08:00', '09:00'), seg('11:00', '12:00')] };
  const b = { id: 'b', segments: [seg('09:00', '10:30')] };
  const m = setup([a, b]);
  // lacuna de 09:00 a 11:00 em "a"; "b" trabalhou de 09:00 a 10:30 → pausa real só de 10:30 a 11:00
  assert.equal(total(m.pauseGapsOf([a])), 30 * M);
});

test('sessão com Mac fechado: lacuna longa vira pausa, não trabalho', () => {
  const e = { id: 'a', segments: [seg('08:04', '11:42', 'mac'), seg('12:38', '14:23')] };
  const m = setup([e]);
  assert.equal(m.entryMs(e), (3 * 60 + 38 + 105) * M);
  assert.equal(total(m.pauseGapsOf([e])), 56 * M);
});
