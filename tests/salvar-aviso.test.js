// Aviso de salvar (Mac): o site só informa a pasta do projeto em andamento; o resto é feito pelo app do Mac.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

function setup(acts = {}) {
  const msgs = [];
  const m = load(['js/store.js', 'js/domain.js', 'js/salvar-aviso.js'], ['db', 'salvarPastaAtual', 'salvarSyncMac'],
    { isMacApp: () => true, DESIGN_APP_RE: /photoshop|illustrator|after effects|cinema ?4d/i, actList: (id) => acts[id] || [] });
  m.ctx.window.webkit = { messageHandlers: { tempo: { postMessage: (x) => msgs.push(x) } } };
  m.db.data = m.db.empty(); m.db.loaded = true;
  return { ...m, msgs };
}
const sessao = (t, id, projeto, ini, state = 'done') => t.db.insert('tempo_time_entries', { id, project_id: projeto, state, segments: [{ s: ini, e: state === 'done' ? ini : null }] }, true);

test('pasta do projeto = a do último arquivo de criação da sessão em andamento', () => {
  const t = setup({ s1: [
    { app: 'Adobe Photoshop 2025', folder: '/Users/t/Reel/Antigas', from: '2026-11-25T10:00:00Z', to: '2026-11-25T10:20:00Z' },
    { app: 'Adobe Illustrator', folder: '/Users/t/Reel/Arte', from: '2026-11-25T10:20:00Z', to: '2026-11-25T10:40:00Z' },
    { app: 'Google Chrome', folder: '/Users/t/Downloads', from: '2026-11-25T10:40:00Z', to: '2026-11-25T10:50:00Z' },   // não é programa de criação
  ] });
  sessao(t, 's1', 'p1', '2026-11-25T10:00:00Z', 'running');
  assert.equal(t.salvarPastaAtual(), '/Users/t/Reel/Arte');
});

test('sem arquivo na sessão, usa a pasta das sessões anteriores do mesmo projeto; outro projeto não vale', () => {
  const t = setup({ antiga: [{ app: 'Adobe After Effects 2025', folder: '/Users/t/Cartela', from: '2026-11-20T10:00:00Z', to: '2026-11-20T11:00:00Z' }],
    outro: [{ app: 'Adobe Photoshop 2025', folder: '/Users/t/Outro', from: '2026-11-24T10:00:00Z', to: '2026-11-24T11:00:00Z' }] });
  sessao(t, 'antiga', 'p1', '2026-11-20T10:00:00Z');
  sessao(t, 'outro', 'p2', '2026-11-24T10:00:00Z');
  sessao(t, 'agora', 'p1', '2026-11-25T10:00:00Z', 'running');
  assert.equal(t.salvarPastaAtual(), '/Users/t/Cartela');
});

test('sem sessão aberta ou sem pasta conhecida: nada (o Salvar só manda ⌘S)', () => {
  const t = setup();
  assert.equal(t.salvarPastaAtual(), null);
  sessao(t, 'agora', 'p1', '2026-11-25T10:00:00Z', 'running');
  assert.equal(t.salvarPastaAtual(), null);
});

test('manda a pasta ao Mac só quando muda', () => {
  const t = setup({ s1: [{ app: 'Adobe Photoshop 2025', folder: '/Users/t/Reel', from: '2026-11-25T10:00:00Z', to: '2026-11-25T10:20:00Z' }] });
  sessao(t, 's1', 'p1', '2026-11-25T10:00:00Z', 'running');
  t.salvarSyncMac(false); t.salvarSyncMac(false);
  assert.equal(t.msgs.length, 1);
  assert.deepEqual({ ...t.msgs[0] }, { type: 'salvar', pasta: '/Users/t/Reel' });
});
