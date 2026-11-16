// Cálculos de tempo: trabalho, bruto e pausas.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const H = 3600e3, M = 60e3;
const setup = (entries) => {
  const m = load(['js/store.js', 'js/domain.js'], ['db', 'entryMs', 'entryBrutoMs', 'entryBruIntervals', 'pauseGapsOf', 'entryGaps', 'segsMarkFora']);
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

test('lacuna apagada sai do bruto e das pausas (computador fechado)', () => {
  const m = setup([]);
  const segs = [seg('08:00', '09:00'), seg('18:00', '18:30')];
  const e = { id: 'x', segments: segs };
  m.db.data.tempo_time_entries = [e];
  assert.equal(m.entryBrutoMs(e), 10.5 * H);            // antes: a lacuna de 9h conta no bruto
  assert.equal(total(m.pauseGapsOf([e])), 9 * H);        // e conta como pausa

  const a = new Date('2026-11-16T12:00:00-03:00').getTime(), b = new Date('2026-11-16T15:00:00-03:00').getTime();
  const fora = { id: 'x', segments: m.segsMarkFora(segs, a, b) };
  m.db.data.tempo_time_entries = [fora];
  assert.equal(m.entryBrutoMs(fora), 1.5 * H);           // depois: só os dois trechos de trabalho
  assert.equal(total(m.pauseGapsOf([fora])), 0);
});

test('marcar fora só mexe na lacuna que contém o trecho apagado', () => {
  const m = setup([]);
  const segs = [seg('08:00', '09:00'), seg('09:30', '10:00'), seg('18:00', '18:30')];
  const a = new Date('2026-11-16T12:00:00-03:00').getTime(), b = new Date('2026-11-16T15:00:00-03:00').getTime();
  const out = m.segsMarkFora(segs, a, b);
  assert.equal(out[0].why, undefined);                   // pausa de 30min continua pausa
  assert.equal(out[1].why, 'fora');
  assert.equal(out[2].why, undefined);
});
