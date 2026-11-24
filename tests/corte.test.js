const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
function setup() {
  const m = load(['js/store.js', 'js/domain.js', 'js/corte.js'], ['db', 'corteLivre', 'corteImantar', 'corteCortar', 'corteVao', 'corteSalvar', 'corteKeyOf', 'corteTirarOciosos'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', tkProjectsSorted: () => [], tkProjectLabel: () => '', openLayer() {}, topLayer() {}, fmtDur: String, actPoolBetween: () => [], clientOf: () => null });
  m.db.data = m.db.empty(); m.db.loaded = true; return m;
}
test('livre: limites entre vizinhos', () => {
  const m = setup(); const segs = [{ a: 5, b: 10 }, { a: 20, b: 25 }];
  assert.deepStrictEqual(Array.from(m.corteLivre(segs, 15, 40)), [10, 20]);
  assert.deepStrictEqual(Array.from(m.corteLivre(segs, 2, 40)), [0, 5]);
  assert.deepStrictEqual(Array.from(m.corteLivre(segs, 30, 40)), [25, 40]);
});
test('ímã: gruda perto, solta longe', () => {
  const m = setup(); assert.strictEqual(m.corteImantar(11, [10, 30], 2), 10); assert.strictEqual(m.corteImantar(15, [10, 30], 2), 15);
});
test('cortar vira dois trechos que não se sobrepõem', () => {
  const m = setup(); const segs = [{ id: 1, a: 10, b: 30, task: 't:x' }];
  const n = m.corteCortar(segs, 20, 2); assert.strictEqual(segs.length, 2);
  assert.strictEqual(segs[0].b, 20); assert.strictEqual(n.a, 20); assert.strictEqual(n.b, 30); assert.strictEqual(n.task, 't:x');
  assert.strictEqual(m.corteCortar(segs, 5, 3), null);
});
test('vão livre: o maior', () => {
  const m = setup(); assert.deepStrictEqual(Array.from(m.corteVao([{ a: 0, b: 10 }, { a: 15, b: 20 }], 40)), [20, 40]);
});
test('salvar: trecho da mesma tarefa volta para a sessão, sem sobrepor, e o resto fica pausa', () => {
  const m = setup(); const t0 = Date.parse('2026-11-24T18:00:00Z');
  const proj = m.db.insert('tempo_projects', { name: 'P' }); const tk = m.db.insert('tempo_tasks', { project_id: proj.id, name: 'Rio' });
  const e = m.db.insert('tempo_time_entries', { project_id: proj.id, task_id: tk.id, state: 'running', segments: [
    { s: new Date(t0 - 3600e3).toISOString(), e: new Date(t0).toISOString() }, { s: new Date(t0 + 40 * 60e3).toISOString(), e: null }] });
  const r = m.corteSalvar({ origemId: e.id, from: t0, to: t0 + 40 * 60e3, W: 40, segs: [{ id: 1, a: 20, b: 40, task: 't:' + tk.id }] });
  assert.ok(r.ok);
  const g = m.db.get('tempo_time_entries', e.id);
  assert.strictEqual(g.segments.length, 3);
  assert.strictEqual(g.segments[1].s, new Date(t0 + 20 * 60e3).toISOString());
  assert.strictEqual(g.segments[1].e, new Date(t0 + 40 * 60e3).toISOString());
  assert.strictEqual(g.segments[2].e, null);
});
test('salvar: recusa horário que já está em outra sessão', () => {
  const m = setup(); const t0 = Date.parse('2026-11-24T18:00:00Z');
  const proj = m.db.insert('tempo_projects', { name: 'P' });
  m.db.insert('tempo_time_entries', { project_id: proj.id, state: 'done', segments: [{ s: new Date(t0 + 5 * 60e3).toISOString(), e: new Date(t0 + 15 * 60e3).toISOString() }] });
  const r = m.corteSalvar({ origemId: null, from: t0, to: t0 + 30 * 60e3, W: 30, segs: [{ id: 1, a: 10, b: 20, task: 'p:' + proj.id }] });
  assert.strictEqual(r.ok, false);
});

test('tirar ociosos: separa o trecho onde não há trabalho por mais que o limite', () => {
  const m = setup();
  const r = m.corteTirarOciosos([{ id: 1, a: 0, b: 40, task: 't:x' }], [[2, 10], [12, 14], [30, 38]], 5, 2);
  const l = Array.from(r.segs).map(s => [s.a, s.b, s.id]);
  assert.deepStrictEqual(l, [[2, 14, 1], [30, 38, 2]]);
});
test('desfazer depois de computar devolve a sessão e apaga o que foi criado', () => {
  const m = setup(); const t0 = Date.parse('2026-11-24T18:00:00Z');
  const proj = m.db.insert('tempo_projects', { name: 'P' }), outro = m.db.insert('tempo_projects', { name: 'Q' });
  const e = m.db.insert('tempo_time_entries', { project_id: proj.id, state: 'running', segments: [{ s: new Date(t0 - 3600e3).toISOString(), e: new Date(t0).toISOString() }, { s: new Date(t0 + 30 * 60e3).toISOString(), e: null }] });
  const antes = JSON.stringify(m.db.get('tempo_time_entries', e.id).segments);
  const r = m.corteSalvar({ origemId: e.id, from: t0, to: t0 + 30 * 60e3, W: 30, segs: [{ id: 1, a: 5, b: 15, task: 'p:' + outro.id }, { id: 2, a: 15, b: 25, task: 'p:' + proj.id }] });
  assert.ok(r.ok); assert.strictEqual(m.db.all('tempo_time_entries').length, 2);
  r.desfazer();
  assert.strictEqual(m.db.all('tempo_time_entries').length, 1);
  assert.strictEqual(JSON.stringify(m.db.get('tempo_time_entries', e.id).segments), antes);
});
