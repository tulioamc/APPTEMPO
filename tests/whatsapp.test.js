// WhatsApp: sugestão pelo nome, "Responder [contato]" e pausas rotuladas pelo celular.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/wa-contacts.js'],
    ['db', 'waSugestao', 'waAceitarSugestao', 'waRotularPausas', 'waMinutosUteis', 'waAmigosHojeMs']);
  m.db.data = m.db.empty();
  m.db.data.tempo_status_options = [
    { id: 'cli', kind: 'wa_tipo', name: 'Cliente', color: 'green', category: 'trabalho', order: 0 },
    { id: 'age', kind: 'wa_tipo', name: 'Agência', color: 'blue', category: 'trabalho', order: 1 },
    { id: 'col', kind: 'wa_tipo', name: 'Colega', color: 'purple', category: 'trabalho', order: 2 },
    { id: 'ami', kind: 'wa_tipo', name: 'Amigo', color: 'red', category: 'pausa', order: 7 },
  ];
  m.db.data.tempo_agencies = [{ id: 'ag1', name: 'Brenda', abbr: 'BRD' }];
  m.db.data.tempo_clients = [{ id: 'cl1', name: 'Bem Brasil', agency_id: null }];
  m.db.data.tempo_projects = [{ id: 'p1', name: 'Segunda Temporada', client_id: 'cl1' }];
  return m;
};

test('sugestão pelo nome: agência, cliente e grupo de projeto', () => {
  const m = setup();
  assert.equal(m.waSugestao({ name: '[BRENDA] OPEN TO WORKS' }).label, 'Agência · Brenda');
  assert.equal(m.waSugestao({ name: 'Carla Bem Brasil' }).label, 'Cliente · Bem Brasil');
  const g = m.waSugestao({ name: '[BRENDA] SEGUNDA TEMPORADA', tipo: 'grupo' });
  assert.equal(g.project_id, 'p1'); assert.equal(g.client_id, 'cl1');
  assert.equal(m.waSugestao({ name: 'Alice Pires' }), null);
  // aceitar grava tipo e ligação
  m.db.data.tempo_wa_contacts = [{ id: 'w1', jid: '1@x', name: '[BRENDA] OPEN TO WORKS', tipo: 'grupo', tipo_id: null }];
  m.db.data.tempo_wa_contacts[0].tipo = 'amigo';
  assert.ok(m.waAceitarSugestao(m.db.data.tempo_wa_contacts[0]));
  const c = m.db.get('tempo_wa_contacts', 'w1');
  assert.equal(c.tipo_id, 'age'); assert.equal(c.agency_id, 'ag1');
});

test('horário de trabalho: só seg a sex, das 9h às 19h', () => {
  const m = setup();
  const t = (s) => new Date(s).getTime();
  assert.equal(m.waMinutosUteis(t('2026-11-16T08:00:00'), t('2026-11-16T10:00:00')), 60);   // segunda
  assert.equal(m.waMinutosUteis(t('2026-11-14T10:00:00'), t('2026-11-14T12:00:00')), 0);    // sábado
  assert.equal(m.waMinutosUteis(t('2026-11-16T18:30:00'), t('2026-11-17T09:30:00')), 60);   // vira a noite
});

test('celular só dá nome a pausa que já existe, e só com mensagem a quem não é de trabalho', () => {
  const m = setup();
  const s = (h) => new Date(Date.now() - h * 36e5).toISOString();
  m.db.data.tempo_wa_contacts = [{ id: 'k', jid: 'k@x', name: 'Carla', tipo: 'amigo', tipo_id: 'cli' }];
  m.db.data.tempo_time_entries = [{ id: 'e', segments: [
    { s: s(5), e: s(4), why: 'mac' },      // pausa de parado das -4h às -3h: mensagem a amigo → WhatsApp
    { s: s(3), e: s(2.5), why: 'sono' },   // computador fechado: não muda
    { s: s(2), e: s(1.5), why: 'mac' },    // só mensagem a cliente: não muda
    { s: s(1), e: s(0.5) },
  ] }];
  const em = (h) => (Date.now() - h * 36e5) / 1000;
  const n = m.waRotularPausas([{ name: 'Fulano', t: em(3.5) }, { name: 'Fulano', t: em(2.2) }, { name: 'Carla', t: em(1.2) }]);
  assert.equal(n, 1);
  const segs = m.db.get('tempo_time_entries', 'e').segments;
  assert.deepEqual(segs.map(x => x.why || null), ['WhatsApp', 'sono', 'mac', null]);
});

test('tempo de hoje com amigos soma só quem não é de trabalho', () => {
  const m = setup();
  m.db.data.tempo_wa_contacts = [{ id: 'k', jid: 'k@x', name: 'Carla', tipo: 'amigo', tipo_id: 'cli' }];
  m.db.data.tempo_settings = [{ key: 'actlog:2026-11-16', value: [
    { from: '2026-11-16T10:00:00Z', to: '2026-11-16T10:20:00Z', app: 'WhatsApp', doc: 'Fulano' },
    { from: '2026-11-16T11:00:00Z', to: '2026-11-16T11:30:00Z', app: 'WhatsApp', doc: 'Carla' },
    { from: '2026-11-16T12:00:00Z', to: '2026-11-16T12:05:00Z', app: 'WhatsApp', doc: null },
  ] }];
  assert.equal(m.waAmigosHojeMs('2026-11-16'), 25 * 60e3);
});

