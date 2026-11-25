// Subtarefas por programa: sugestão na tarefa mãe, só move quando aceita.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const t = (h) => `2026-11-24T${h}:00.000Z`;
function setup() {
  const m = load(['js/store.js', 'js/domain.js', 'js/activity.js', 'js/sub-programas.js'], ['db', 'subSugestoes', 'subCasa', 'ACTIONS', 'CHANGES'],
    { ACTIONS: {}, CHANGES: {}, VIEWS: {}, S: {}, toast() {}, render() {}, icon: () => '', $: () => null, $$: () => [], tkProjectLabel: (p) => p.name });
  m.db.data = m.db.empty();
  m.db.insert('tempo_projects', { id: 'p', name: 'Vídeo' }, true);
  m.db.insert('tempo_tasks', { id: 'mae', project_id: 'p', parent_id: null, name: 'Vídeo 30s' }, true);
  m.db.insert('tempo_tasks', { id: 'anim', project_id: 'p', parent_id: 'mae', name: 'Animar 2D' }, true);
  m.db.insert('tempo_tasks', { id: 'telas', project_id: 'p', parent_id: 'mae', name: 'Preparar telas' }, true);
  m.db.insert('tempo_time_entries', { id: 'e1', project_id: 'p', task_id: 'mae', state: 'done', segments: [{ s: t('10:00'), e: t('13:00') }] }, true);
  const recs = [{ from: t('10:00'), to: t('11:00'), app: 'Adobe After Effects 2026', doc: 'cena.aep' }, { from: t('11:00'), to: t('12:30'), app: 'Adobe Photoshop 2026', doc: 'tela.psd' }, { from: t('12:30'), to: t('13:00'), app: 'Finder' }];
  m.ctx.actList = (id) => (id === 'e1' ? recs : []);
  return m;
}
test('sem programas escolhidos não sugere nada; com programas sugere o tempo de cada um', () => {
  const m = setup();
  assert.equal(m.subSugestoes(m.db.get('tempo_tasks', 'mae')).length, 0);
  m.db.setSetting('subProgs', { anim: ['After Effects'], telas: ['Photoshop', 'Illustrator'] });
  const sg = m.subSugestoes(m.db.get('tempo_tasks', 'mae'));
  assert.deepEqual(sg.map(x => [x.sub.id, x.ms / 6e4]), [['anim', 60], ['telas', 90]]);
  assert.equal(m.db.all('tempo_time_entries').length, 1, 'sugerir não mexe em nada');
});
test('aceitar move só aquele tempo para uma sessão da subtarefa; ignorar não sugere de novo', () => {
  const m = setup();
  m.db.setSetting('subProgs', { anim: ['After Effects'], telas: ['Photoshop'] });
  m.ACTIONS['sp-aceita']({ dataset: { id: 'mae', sub: 'anim' } });
  const nova = m.db.all('tempo_time_entries').find(e => e.task_id === 'anim');
  assert.ok(nova); assert.equal(new Date(nova.segments[0].e) - new Date(nova.segments[0].s), 36e5);
  const orig = m.db.get('tempo_time_entries', 'e1');
  assert.equal(orig.segments.reduce((s, x) => s + (new Date(x.e) - new Date(x.s)), 0), 2 * 36e5);
  m.ACTIONS['sp-ignora']({ dataset: { id: 'mae', sub: 'telas' } });
  assert.equal(m.subSugestoes(m.db.get('tempo_tasks', 'mae')).filter(x => x.sub.id === 'telas').length, 0);
});
