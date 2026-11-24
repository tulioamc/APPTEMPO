const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
test('Calendário › Tarefas (Gantt): barras, entrega e a tela abre', () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/plano-seguro.js', 'js/planejamento.js', 'js/view-rafa.js', 'js/tarefas-prazo.js'],
    ['db', 'VIEWS', 'planoGanttHTML', 'PLANO'], { statusCat: (id) => ({ a: 'active', t: 'todo', d: 'done' })[id], VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  m.db.data.tempo_status_options = [{ id: 'a', kind: 'work', name: 'Em andamento', category: 'active' }, { id: 't', kind: 'work', name: 'A fazer', category: 'todo' }, { id: 'd', kind: 'work', name: 'Concluído', category: 'done' }];
  m.db.data.tempo_projects = [{ id: 'p', name: 'Campanha', status_id: 'a', archived: false, deadline: '2026-11-26' }];
  m.db.data.tempo_tasks = [{ id: 'k1', project_id: 'p', name: 'KV', status_id: 'a', est_min: 180, deadline: '2026-11-25', order: 0 }, { id: 'k2', project_id: 'p', name: 'OOH', status_id: 't', est_min: 120, deadline: '2026-11-26', order: 1, depends_on: ['k1'] }];
  m.db.data.tempo_settings = [{ id: 's', key: 'projEntregas', value: { p: [{ id: 'e', nome: 'ENTREGA 01', dia: '2026-11-26', hora: '18:00', depois: 'k2' }] } }];
  const h = m.planoGanttHTML();
  assert.ok(h.includes('plg-bar') && h.includes('KV') && h.includes('ENTREGA 01'), h.slice(0, 300));
  m.db.setSetting('planoModo', 'tarefas');
  assert.ok(m.VIEWS.plano().html.includes('plg'));
});
