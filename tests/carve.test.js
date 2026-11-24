const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
test('carveOutSegments tira o intervalo das pausas sem tocar no trecho aberto', () => {
  const m = load(['js/store.js', 'js/domain.js'], ['db', 'carveOutSegments', 'overlapOf'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '' });
  m.db.data = m.db.empty(); m.db.loaded = true;
  const e = m.db.insert('tempo_time_entries', { state: 'running', segments: [
    { s: '2026-11-24T15:00:00.000Z', e: '2026-11-24T15:03:00.000Z' },
    { s: '2026-11-24T15:03:00.000Z', e: '2026-11-24T16:32:00.000Z', why: 'WhatsApp' },
    { s: '2026-11-24T16:32:00.000Z', e: null }] });
  const a = new Date('2026-11-24T16:05:00.000Z').getTime(), b = new Date('2026-11-24T16:32:00.000Z').getTime();
  assert.ok(m.carveOutSegments(e.id, a, b, b + 60000) >= 1);
  const g = m.db.get('tempo_time_entries', e.id);
  assert.strictEqual(g.segments[1].e, '2026-11-24T16:05:00.000Z');
  assert.strictEqual(g.segments[2].e, null);
  assert.strictEqual(g.segments[2].s, '2026-11-24T16:32:00.000Z');
});
