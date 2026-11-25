// Avisos que você já resolveu por outro caminho saem sozinhos (25/11).
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const setup = () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/notices.js'], ['db', 'avisosResolvidosSozinhos'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', esc: (s) => String(s), $: () => null, $$: () => [], FERIAS_HOJE: false, SCAN_SEEN: null, SCAN_CHANGED: false, todoAlarmSync() {} });
  m.db.data = m.db.empty();
  return m;
};
const aviso = (m, o) => m.db.insert('tempo_notices', { status: 'pending', decision: '', data: {}, ...o }, true);

test('pausa sugerida: some quando a sessão foi encerrada ou o trecho já virou pausa; fica se ainda é trabalho', () => {
  const m = setup();
  m.db.insert('tempo_time_entries', { id: 'run', state: 'running', segments: [{ s: '2026-11-25T10:00:00Z', e: '2026-11-25T10:30:00Z' }, { s: '2026-11-25T10:40:00Z', e: null }] }, true);
  m.db.insert('tempo_time_entries', { id: 'fim', state: 'done', segments: [{ s: '2026-11-25T08:00:00Z', e: '2026-11-25T09:00:00Z' }] }, true);
  const jaCortada = aviso(m, { kind: 'pause', data: { entry_id: 'run', from: '2026-11-25T10:31:00Z', to: '2026-11-25T10:39:00Z' } });
  const aindaTrabalho = aviso(m, { kind: 'pause', data: { entry_id: 'run', from: '2026-11-25T10:05:00Z', to: '2026-11-25T10:20:00Z' } });
  const encerrada = aviso(m, { kind: 'pause', data: { entry_id: 'fim', from: '2026-11-25T08:10:00Z', to: '2026-11-25T08:20:00Z' } });
  const sumiu = aviso(m, { kind: 'start', data: { entry_id: 'apagada' } });
  m.avisosResolvidosSozinhos();
  const st = (n) => m.db.get('tempo_notices', n.id).status;
  assert.strictEqual(st(jaCortada), 'accepted');
  assert.strictEqual(st(aindaTrabalho), 'pending');
  assert.strictEqual(st(encerrada), 'accepted');
  assert.strictEqual(st(sumiu), 'accepted');
  assert.ok(m.db.get('tempo_notices', jaCortada.id).decision.startsWith('Resolvido'));
});

test('sem sessões carregadas não resolve nada (dados ainda chegando)', () => {
  const m = setup();
  const n = aviso(m, { kind: 'pause', data: { entry_id: 'x', from: '2026-11-25T10:31:00Z', to: '2026-11-25T10:39:00Z' } });
  m.avisosResolvidosSozinhos();
  assert.strictEqual(m.db.get('tempo_notices', n.id).status, 'pending');
});

test('dia útil sem registro: conta só o trabalho do dia (pausas fora) e some quando as horas entram', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/notices.js'], ['db', 'trabalhoDoDiaMs', 'avisosResolvidosSozinhos'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', esc: (s) => String(s), $: () => null, $$: () => [], FERIAS_HOJE: false, SCAN_SEEN: null, SCAN_CHANGED: false, todoAlarmSync() {} });
  m.db.data = m.db.empty();
  const d = '2026-11-24', t = (h) => new Date(`${d}T${h}:00`).toISOString();
  m.db.insert('tempo_time_entries', { id: 'a', state: 'done', segments: [{ s: t('09:00'), e: t('09:20') }, { s: t('09:20'), e: t('09:50'), why: 'WhatsApp' }] }, true);
  assert.equal(m.trabalhoDoDiaMs(d), 20 * 6e4);
  const n = m.db.insert('tempo_notices', { kind: 'semreg', status: 'pending', decision: '', data: { dia: d } }, true);
  m.avisosResolvidosSozinhos(); assert.equal(m.db.get('tempo_notices', n.id).status, 'pending');
  m.db.insert('tempo_time_entries', { id: 'b', state: 'done', segments: [{ s: t('14:00'), e: t('16:00') }] }, true);
  m.avisosResolvidosSozinhos(); assert.equal(m.db.get('tempo_notices', n.id).status, 'accepted');
});
