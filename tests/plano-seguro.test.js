// Calendário à prova de erro: blocos fixados sempre válidos, empurrar sem choque, desfazer atômico, diagnóstico com conserto
// e testes aleatórios (centenas de cenários) conferindo as regras do plano.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { load, ROOT } = require('./helpers');

const NOMES = ['db', 'tkMotor', 'planoPins', 'planoPinsSalvar', 'planoPinsLimpar', 'planoEmpurrar', 'planoDiagnostico', 'planoMudar', 'planoFixosDoDia', 'planoOcupadosDoDia', 'planoJanelas', 'planejar', 'PLANO', 'planoProximoUtil', 'tkCiclos', 'planoSaudeHTML', 'planoSoltarTarefa', 'planoBandejaLista', 'planoCapHTML', 'planoSemTotalHTML', 'planoCorCli', 'projEntregas', 'projEntregasSalvar', 'planoCor'];
const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/plano-seguro.js', 'js/planejamento.js', 'js/plano-extras.js', 'js/view-rafa.js', 'js/tarefas-prazo.js'], NOMES,
    { statusCat: (id) => String(id || '').replace(/^s-/, '') || undefined, VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {}, icon: () => '' });
  m.ctx.toast = () => {}; m.ctx.render = () => {};   // ui.js define os dois com DOM de verdade; aqui não há tela
  m.db.data = m.db.empty(); m.db.loaded = true;
  const st = (cat) => ({ id: 's-' + cat, kind: 'work', category: cat, name: cat });
  m.db.data.tempo_status_options = [st('todo'), st('active'), st('done'), st('cancelled')];
  return m;
};
const proj = (id, extra = {}) => ({ id, name: 'Proj ' + id, client_id: null, status_id: 's-active', work_type_id: 'wt', archived: false, ...extra });
const tarefa = (id, pid, extra = {}) => ({ id, project_id: pid, parent_id: null, name: id, status_id: 's-todo', owner: 'Tulio', depends_on: [], order: 0, ...extra });
const bump = (m) => { m.db.writes = (m.db.writes || 0) + 1; };
const setPins = (m, pins) => { m.db.data.tempo_settings = (m.db.data.tempo_settings || []).filter(s => s.key !== 'planoPins'); m.db.data.tempo_settings.push({ id: 'pp', key: 'planoPins', value: pins }); bump(m); };
const AGORA = new Date(2026, 10, 24, 9, 0);   // terça 24/11, 9h

// ---------- 1. Blocos fixados: porta única ----------
test('bloco fixado inválido ou órfão nunca entra: sem projeto, tarefa concluída, hora ou data sem sentido', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a'), proj('feito', { status_id: 's-done' }), proj('arq', { archived: true })];
  m.db.data.tempo_tasks = [tarefa('t1', 'a'), tarefa('t2', 'a', { status_id: 's-done' }), tarefa('t3', 'feito')];
  setPins(m, [
    { id: 'ok', dia: '2026-11-25', pid: 'a', tid: 't1', ini: 9.1, h: 1.9 },          // vale (arredonda para 15 min)
    { id: 'ok', dia: '2026-11-25', pid: 'a', ini: 15, h: 1 },                          // id repetido
    { id: 'sem-proj', dia: '2026-11-25', pid: 'x', ini: 9, h: 1 },
    { id: 'proj-feito', dia: '2026-11-25', pid: 'feito', ini: 9, h: 1 },
    { id: 'proj-arq', dia: '2026-11-25', pid: 'arq', ini: 9, h: 1 },
    { id: 'tk-feita', dia: '2026-11-25', pid: 'a', tid: 't2', ini: 9, h: 1 },
    { id: 'tk-outro-proj', dia: '2026-11-25', pid: 'a', tid: 't3', ini: 9, h: 1 },
    { id: 'nan', dia: '2026-11-25', pid: 'a', ini: NaN, h: 1 }, { id: 'h0', dia: '2026-11-25', pid: 'a', ini: 9, h: 0 }, { id: 'neg', dia: '2026-11-25', pid: 'a', ini: 9, h: -2 },
    { id: 'dia-ruim', dia: '2026-13-45', pid: 'a', ini: 9, h: 1 }, { id: 'dia-texto', dia: 'amanhã', pid: 'a', ini: 9, h: 1 }, null, 'lixo',
    { id: 'passa', dia: '2026-11-25', pid: 'a', ini: 22, h: 5 },                       // passa da meia-noite: encolhe
  ]);
  const v = m.planoPins();
  assert.deepEqual(v.map(p => p.id).sort(), ['ok', 'passa']);
  const ok = v.find(p => p.id === 'ok'); assert.equal(ok.ini, 9); assert.equal(ok.h, 2);
  const passa = v.find(p => p.id === 'passa'); assert.ok(passa.ini + passa.h <= 24 + 1e-9);
  // a porta de escrita só grava o que vale: o lixo some na primeira mudança
  m.planoPinsSalvar(m.planoPins().concat([{ id: 'novo', dia: '2026-11-26', pid: 'sumiu', ini: 9, h: 1 }]));
  assert.deepEqual(m.db.setting('planoPins', []).map(p => p.id).sort(), ['ok', 'passa']);
});

// ---------- 2. Empurrar sem choque ----------
test('empurrar: quem bate vai inteiro para depois (em cadeia, pulando a rotina); quem não encosta fica', () => {
  const m = setup();
  const fixos = (dia) => [[12, 14, 'Almoço']];
  const base = [{ id: 'a', dia: '2026-11-25', pid: 'p', ini: 10, h: 1 }, { id: 'b', dia: '2026-11-25', pid: 'p', ini: 11, h: 1 }, { id: 'c', dia: '2026-11-25', pid: 'p', ini: 16, h: 1 }];
  const r = m.planoEmpurrar(base, [{ dia: '2026-11-25', ini: 10, fim: 11.5 }], fixos);
  const novo = Object.fromEntries(r.empurrados.map(p => [p.id, p.ini]));
  assert.equal(novo.a, 14, 'a iria das 11h30 às 12h30 e atravessaria o almoço (12–14): vai para depois dele');
  assert.equal(novo.b, 15, 'b também pula o almoço e ainda desvia de a');
  assert.ok(!('c' in novo) && r.base.some(p => p.id === 'c'), 'c não encosta e fica');
  assert.ok(r.empurrados.every(p => p.h === 1), 'nunca divide: a duração fica inteira');
});
test('empurrar: o que não cabe mais no dia vai inteiro para o próximo dia útil', () => {
  const m = setup();
  const base = [{ id: 'a', dia: '2026-11-25', pid: 'p', ini: 22, h: 1.5 }];
  const r = m.planoEmpurrar(base, [{ dia: '2026-11-25', ini: 21, fim: 23 }], () => [], { proximoDia: () => '2026-11-26' });
  assert.equal(r.empurrados[0].dia, '2026-11-26'); assert.equal(r.empurrados[0].h, 1.5);
});
test('desfazer choques que já existem: sem partes novas, ninguém fica em cima de ninguém', () => {
  const m = setup();
  const base = [{ id: 'a', dia: '2026-11-25', pid: 'p', ini: 10, h: 2 }, { id: 'b', dia: '2026-11-25', pid: 'p', ini: 11, h: 2 }, { id: 'c', dia: '2026-11-25', pid: 'p', ini: 12, h: 1 }];
  const r = m.planoEmpurrar(base, [], () => [], { dias: ['2026-11-25'] });
  const tudo = [...r.base, ...r.empurrados].sort((x, y) => x.ini - y.ini);
  tudo.forEach((p, i) => { if (i) assert.ok(p.ini >= tudo[i - 1].ini + tudo[i - 1].h - 1e-9, `${p.id} fica depois de ${tudo[i - 1].id}`); });
});

// ---------- 3. Ação atômica + desfazer ----------
test('uma ação do Calendário vira UM passo do desfazer, mesmo mexendo em várias coisas', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a')];
  m.planoMudar('Teste', () => { m.planoPinsSalvar([{ id: 'x', dia: '2026-11-25', pid: 'a', ini: 9, h: 1 }]); m.db.setSetting('planoBloqueios', [{ id: 'b', dia: '2026-11-25', ini: 14, fim: 15, nome: 'Médico' }]); });
  assert.equal(m.planoPins().length, 1); assert.equal(m.db.setting('planoBloqueios', []).length, 1);
  assert.equal(m.db.desfazerRotulo(), 'Teste');
  assert.ok(m.db.undo());
  assert.equal(m.planoPins().length, 0, 'o bloco voltou a não existir'); assert.equal(m.db.setting('planoBloqueios', []).length, 0, 'e o bloqueio também, no mesmo Ctrl+Z');
});
test('se a ação der erro no meio, tudo volta como estava', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a')]; setPins(m, [{ id: 'x', dia: '2026-11-25', pid: 'a', ini: 9, h: 1 }]);
  const ok = m.planoMudar('Quebra', () => { m.planoPinsSalvar([]); m.db.setSetting('planoBloqueios', [{ id: 'b', dia: '2026-11-25', ini: 14, fim: 15 }]); throw new Error('boom'); });
  assert.equal(ok, false);
  assert.deepEqual(m.planoPins().map(p => p.id), ['x'], 'o bloco continua lá'); assert.equal(m.db.setting('planoBloqueios', []).length, 0);
});
test('só o trabalho de planejamento entra no desfazer (zoom e filtros não)', () => {
  const m = setup();
  m.db.setSetting('planoZoom', 80); m.db.setSetting('planoMesFiltro', { rafa: false });
  assert.equal(m.db.desfazerRotulo(), null); assert.equal(m.db.undo(), false);
  m.db.setSetting('planoBloqueios', [{ id: 'b', dia: '2026-11-25', ini: 9, fim: 10 }]);
  assert.ok(m.db.undo(), 'bloqueio é desfazível');
});

// ---------- 4. Diagnóstico ----------
const amanha = () => '2026-11-25';
const ids = (l, pre) => l.filter(x => x.id.startsWith(pre));
test('diagnóstico: plano saudável não tem aviso', () => {
  const m = setup(); const dia = amanha(m);
  m.db.data.tempo_projects = [proj('a')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 120, deadline: '2026-12-14' })];
  setPins(m, [{ id: 'x', dia, pid: 'a', tid: 't1', ini: 10, h: 2 }]);
  assert.deepEqual(m.planoDiagnostico(AGORA).filter(x => x.nivel !== 'info'), []);
  assert.match(m.planoSaudeHTML(), /Plano em ordem/);
});
test('bloco fixado maior que a tarefa: encolhe sozinho ao tamanho dela e o resto do horário fica livre (sem sobra, sem aviso)', () => {
  const m = setup(); const dia = amanha(m);
  m.db.data.tempo_projects = [proj('a')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 60 }), tarefa('t2', 'a', { est_min: 60, order: 1, depends_on: ['t1'] })];
  setPins(m, [{ id: 'x', dia, pid: 'a', tid: 't1', ini: 10, h: 3 }]);
  assert.equal(ids(m.planoDiagnostico(AGORA), 'sobra:').length, 0);
  const mo = m.tkMotor(AGORA, 10);
  assert.deepEqual(mo.itens.t1.blocos.map(b => [b.ini, b.fim]), [[10, 11]]);
  assert.equal(mo.pinsSobra.length, 0);
  assert.equal(mo.itens.t2.blocos[0].dia, dia); assert.equal(mo.itens.t2.blocos[0].ini, 11, 'a próxima encosta no fim do bloco');
  assert.equal(m.planoPins()[0].h, 3, 'o salvo não muda');
});
test('diagnóstico: bloco fixado antes de a tarefa anterior terminar não fica segurando horas', () => {
  const m = setup(); const dia = amanha(m);
  m.db.data.tempo_projects = [proj('a')];
  m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 120, order: 0 }), tarefa('t2', 'a', { est_min: 60, order: 1, depends_on: ['t1'] })];
  setPins(m, [{ id: 'x', dia: '2026-11-24', pid: 'a', tid: 't2', ini: 9, h: 1 }]);   // t2 fixada às 9h, mas t1 (que ela espera) só termina às 11h
  const l = ids(m.planoDiagnostico(AGORA), 'sobra:'); assert.equal(l.length, 1); assert.match(l[0].titulo, /antes de terminar/);
  m.planoMudar('c', l[0].corrigir.run, false); assert.equal(m.planoPins().length, 0, 'soltou o bloco; o app reencaixa depois de t1');
});
test('diagnóstico: dependência em volta (A espera B, B espera A) é erro e tem conserto', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 60, depends_on: ['t2'] }), tarefa('t2', 'a', { est_min: 60, depends_on: ['t1'] })];
  const l = ids(m.planoDiagnostico(AGORA), 'ciclo:'); assert.ok(l.length >= 1); assert.equal(l[0].nivel, 'erro');
  m.planoMudar('c', l[0].corrigir.run, false);
  assert.equal(ids(m.planoDiagnostico(AGORA), 'ciclo:').length, 0);
});
test('diagnóstico: dois blocos fixados no mesmo horário → conserto empurra sem sobrepor', () => {
  const m = setup(); const dia = amanha(m);
  m.db.data.tempo_projects = [proj('a'), proj('b')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 120 }), tarefa('t2', 'b', { est_min: 120 })];
  setPins(m, [{ id: 'x', dia, pid: 'a', tid: 't1', ini: 10, h: 2 }, { id: 'y', dia, pid: 'b', tid: 't2', ini: 11, h: 2 }]);
  const l = ids(m.planoDiagnostico(AGORA), 'choque:'); assert.equal(l.length, 1);
  m.planoMudar('c', l[0].corrigir.run, false);
  const [p1, p2] = m.planoPins().sort((a, b) => a.ini - b.ini); assert.ok(p2.ini >= p1.ini + p1.h - 1e-9);
  assert.equal(ids(m.planoDiagnostico(AGORA), 'choque:').length, 0);
});
test('diagnóstico: prazo ou hora de tarefa que não existe é apontado e limpo', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 60, deadline: '2026-13-45' }), tarefa('t2', 'a', { est_min: 60, deadline: '2026-12-01', deadline_time: '25:99' })];
  const l = m.planoDiagnostico(AGORA).filter(x => x.id.startsWith('dados:')); assert.equal(l.length, 2);
  assert.doesNotThrow(() => m.tkMotor(AGORA, 10), 'e o cálculo não quebra com esses dados');
  l.forEach(x => x.corrigir.run());
  assert.equal(m.planoDiagnostico(AGORA).filter(x => x.id.startsWith('dados:')).length, 0);
});
test('se o cálculo do plano quebrar, o Calendário mostra o último plano bom em vez de apagar', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 60 })];
  const bom = m.planejar([], AGORA, 20); assert.ok(Object.keys(bom.porDia).length);
  m.ctx.tkMotor = () => { throw new Error('dado estranho'); };
  const r = m.planejar([], new Date(2026, 10, 25, 9, 0), 20);
  assert.ok(m.PLANO.erroMotor); assert.deepEqual(Object.keys(r.porDia), Object.keys(bom.porDia));
});

// ---------- 5. Testes aleatórios do motor ----------
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const dd = (n) => { const d = new Date(2026, 10, 24 + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function cenario(m, seed) {
  const r = rng(seed); const pick = (a) => a[Math.floor(r() * a.length)]; const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const np = int(1, 4); const projs = [], tks = [], pins = [], bloq = [];
  for (let i = 0; i < np; i++) {
    projs.push(proj('p' + i, { deadline: r() < .6 ? dd(int(0, 12)) : null }));
    const n = int(1, 6);
    for (let j = 0; j < n; j++) {
      const id = `p${i}t${j}`; const deps = []; for (let k = 0; k < j; k++) if (r() < .35) deps.push(`p${i}t${k}`);
      if (r() < .05 && j > 0) deps.push(`p${i}t${j + 1 < n ? j + 1 : 0}`);   // às vezes uma dependência em volta
      tks.push(tarefa(id, 'p' + i, { name: id, est_min: int(1, 20) * 15, deadline: r() < .7 ? dd(int(0, 14)) : null, deadline_time: r() < .5 ? pick(['10:00', '12:30', '17:45', '19:00']) : null, order: j, depends_on: deps, owner: r() < .1 ? 'Outra pessoa' : 'Tulio', status_id: pick(['s-todo', 's-todo', 's-active', 's-done']) }));
    }
  }
  const nPins = int(0, 6);
  for (let k = 0; k < nPins; k++) { const t = r() < .7 ? pick(tks) : null; const p = t ? t.project_id : pick(projs).id; pins.push({ id: 'pin' + k, dia: dd(int(0, 8)), pid: p, tid: t ? t.id : null, ini: int(8, 17) + pick([0, .25, .5, .75]), h: pick([.5, 1, 1.5, 2, 3]) }); }
  if (r() < .4) pins.push({ id: 'lixo1', dia: 'xx', pid: 'p0', ini: 9, h: 1 }, { id: 'lixo2', dia: dd(1), pid: 'sumiu', ini: 9, h: 1 });
  const nB = int(0, 3); for (let k = 0; k < nB; k++) bloq.push({ id: 'b' + k, dia: dd(int(0, 8)), ini: int(9, 16), fim: int(17, 19), nome: 'Compromisso' });
  m.db.data.tempo_projects = projs; m.db.data.tempo_tasks = tks;
  m.db.data.tempo_settings = [{ id: 'pp', key: 'planoPins', value: pins }, { id: 'pb', key: 'planoBloqueios', value: bloq }];
  bump(m); m.db.ver = (m.db.ver || 0) + 1;
}
test('aleatório: 400 cenários — o plano sempre segue as regras (sem sobrepor, dependência, tarefa inteira, só em horas livres)', () => {
  const m = setup(); const falhas = [];
  for (let seed = 1; seed <= 400; seed++) {
    cenario(m, seed); let mo;
    try { mo = m.tkMotor(AGORA, 40); } catch (e) { falhas.push(`seed ${seed}: quebrou (${e.message})`); continue; }
    const itens = Object.values(mo.itens).filter(x => x.t && x.eu);
    const emCiclo = new Set((mo.ciclos || []).flatMap(c => [c.de, c.para]));
    const todos = [];   // [{ id, dia, ini, fim, pin }]
    itens.forEach(x => x.blocos.forEach(b => todos.push({ id: x.id, ...b })));
    const ruim = (msg) => falhas.push(`seed ${seed}: ${msg}`);
    // números sãos e dentro do dia
    todos.forEach(b => { if (![b.ini, b.fim].every(Number.isFinite) || b.ini < -1e-9 || b.fim > 24 + 1e-9 || b.fim - b.ini < 0.24) ruim(`bloco estranho ${JSON.stringify(b)}`); });
    // nada em cima de nada, a não ser dois blocos que VOCÊ fixou por cima um do outro
    todos.forEach((a, i) => todos.slice(i + 1).forEach(b => { if (a.dia === b.dia && a.ini < b.fim - 1e-6 && b.ini < a.fim - 1e-6 && !(a.pin && b.pin)) ruim(`${a.id} e ${b.id} sobrepostos em ${a.dia} (${a.ini}-${a.fim} × ${b.ini}-${b.fim})`); }));
    // o que o app encaixa sozinho cai só em hora livre (fora de rotina e compromissos)
    // "livres" inclui os blocos maleáveis da rotina (o plano pode passar por cima deles quando a tarefa não cabe na entrega)
    todos.filter(b => !b.pin).forEach(b => { const jan = m.planoJanelas(b.dia, undefined, { solto: true }).jan; const ult = jan.length ? jan[jan.length - 1][1] : -1; if (!jan.some(([x, y]) => b.ini >= x - 1e-6 && b.fim <= y + (y === ult ? 1 : 0) + 1e-6)) ruim(`${b.id} fora das horas livres em ${b.dia} (${b.ini}-${b.fim})`); });
    // nunca antes de agora
    // hoje o plano vale desde o começo do dia (não anda com o relógio): nada antes do início do expediente
    const ini0 = (m.planoJanelas('2026-11-24', undefined, { solto: true }).jan[0] || [9])[0];
    todos.forEach(b => { if (!b.pin && b.dia === '2026-11-24' && b.ini < ini0 - 1e-6) ruim(`${b.id} começa antes do expediente`); if (b.dia < '2026-11-24') ruim(`${b.id} no passado`); });
    // dependência respeitada
    itens.filter(x => !emCiclo.has(x.id)).forEach(x => x.deps.forEach(d => { const dep = mo.itens[d]; if (!dep || emCiclo.has(d)) return;
      x.blocos.forEach(b => { const ini = new Date(`${b.dia}T00:00:00`).getTime() + b.ini * 36e5; if (ini < dep.fim.getTime() - 61e3) ruim(`${x.id} começa antes de ${d} terminar`); }); }));
    // tarefa inteira: nenhuma outra tarefa que o app encaixa sozinho entra no vão entre dois pedaços (só rotina, compromisso e fim do dia dividem; um bloco que VOCÊ fixou ali vale)
    itens.forEach(x => {
      const aut = x.blocos.filter(b => !b.pin).map(b => ({ a: new Date(`${b.dia}T00:00:00`).getTime() + b.ini * 36e5, b: new Date(`${b.dia}T00:00:00`).getTime() + b.fim * 36e5 })).sort((p, q) => p.a - q.a);
      for (let i = 0; i + 1 < aut.length; i++) {
        itens.filter(y => y !== x).forEach(y => y.blocos.filter(o => !o.pin).forEach(o => { const oa = new Date(`${o.dia}T00:00:00`).getTime() + o.ini * 36e5, ob = new Date(`${o.dia}T00:00:00`).getTime() + o.fim * 36e5;
          if (oa < aut[i + 1].a - 1e3 && ob > aut[i].b + 1e3) ruim(`${y.id} no meio de ${x.id}`); }));
      }
    });
    // as horas batem com o que falta (quando cabe no horizonte)
    itens.filter(x => !emCiclo.has(x.id) && x.fim < new Date(2026, 11, 20)).forEach(x => { const soma = x.blocos.reduce((t, b) => t + (b.fim - b.ini) * 60, 0); if (soma > x.resto + 0.51) ruim(`${x.id}: planejou ${soma} min para ${x.resto}`); });
    // bloco fixado que sobrou é sempre explicado no diagnóstico (nunca um horário "fantasma")
    const sobra = new Set((mo.pinsSobra || []).map(s => s.pin)); const vistos = new Set(todos.filter(b => b.pin).map(b => b.pin));
    m.planoPins().filter(p => p.dia >= '2026-11-24').forEach(p => { const sob = (mo.pinsSobra || []).find(s => s.pin === p.id); // (aparado ou juntado de propósito: a tarefa dele já está toda planejada com os outros pedaços)
      const coberta = p.tid && mo.itens[p.tid] && mo.itens[p.tid].blocos.reduce((t, b) => t + (b.fim - b.ini) * 60, 0) >= mo.itens[p.tid].resto - 0.5 && mo.itens[p.tid].blocos.some(b => b.pin);
      const junto = p.tid && m.planoPins().some(q => q.id !== p.id && q.tid === p.tid && q.dia === p.dia && Number(q.ini) < Number(p.ini) + Number(p.h) + 1e-6 && Number(q.ini) + Number(q.h) > Number(p.ini) - 1e-6);   // juntado com outro da mesma tarefa
      if (!vistos.has(p.id) && !sob && !coberta && !junto && !(p.dia === '2026-11-24' && p.ini + p.h <= 9.01)) ruim(`bloco ${p.id} sumiu sem explicação`); });
    // planejar() e o Gantt nunca quebram
    try { m.planejar([], AGORA, 40); } catch (e) { ruim('planejar quebrou ' + e.message); }
  }
  assert.deepEqual(falhas.slice(0, 15), [], `${falhas.length} falhas em 400 cenários`);
});
test('aleatório: "Corrigir tudo" converge — depois de aplicar os consertos o plano fica sem avisos desse tipo', () => {
  const m = setup(); const falhas = [];
  for (let seed = 1000; seed < 1150; seed++) {
    cenario(m, seed);
    for (let volta = 0; volta < 4; volta++) {
      const l = m.planoDiagnostico(AGORA).filter(x => x.nivel !== 'info' && x.corrigir && !x.corrigir.proprio);
      if (!l.length) break;
      m.planoMudar('c', () => l.forEach(x => x.corrigir.run()), false); bump(m);
    }
    const resto = m.planoDiagnostico(AGORA).filter(x => x.nivel !== 'info' && x.corrigir && !x.corrigir.proprio);
    if (resto.length) falhas.push(`seed ${seed}: sobrou ${resto.map(x => x.id).join(', ')}`);
  }
  assert.deepEqual(falhas.slice(0, 10), []);
});

// ---------- 6. O verde de concluído/positivo ----------
test('verde único #77DB89 em concluído/positivo (claro e escuro) e nenhum verde antigo sobra', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  assert.equal((css.match(/--ok:\s*#77DB89/gi) || []).length, 3, '--ok no tema claro e nos dois do escuro');
  assert.match(css, /--t-green-bg:#77DB89/i);
  ['75ef86', '4ade80', '22a06b', '34a853'].forEach(c => assert.ok(!css.toLowerCase().includes(c), `sobrou ${c}`));
  assert.match(fs.readFileSync(path.join(ROOT, 'js/colors.js'), 'utf8'), /COR_OK = '#77DB89'/);
});

// ---------- 7. Extras do Calendário ----------
test('soltar uma tarefa na grade fixa o bloco, troca o antigo e empurra quem estava ali', () => {
  const m = setup(); const dia = '2026-12-02';
  m.db.data.tempo_projects = [proj('a'), proj('b')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 60 }), tarefa('t2', 'b', { est_min: 60 })];
  setPins(m, [{ id: 'velho', dia: '2027-01-05', pid: 'a', tid: 't1', ini: 9, h: 1 }, { id: 'outro', dia, pid: 'b', tid: 't2', ini: 10, h: 1 }]);
  assert.ok(m.planoSoltarTarefa('t1', 'a', 1, dia, 10.1));
  const pins = m.planoPins(); const novo = pins.find(p => p.tid === 't1'), outro = pins.find(p => p.id === 'outro');
  assert.equal(pins.filter(p => p.tid === 't1').length, 1, 'o bloco fixado antigo da mesma tarefa saiu');
  assert.equal(novo.dia, dia); assert.equal(novo.ini, 10);
  assert.ok(outro.ini >= 11 - 1e-9, 'quem estava ali foi para depois, sem sobrepor');
  assert.equal(m.planoSoltarTarefa('t1', 'a', 1, '2020-01-01', 10), false, 'dia que já passou não aceita');
});
test('bandeja lista só tarefas suas, abertas e com tempo a fazer', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', { est_min: 90 }), tarefa('t2', 'a', { est_min: 60, status_id: 's-done' }), tarefa('t3', 'a', { est_min: 60, owner: 'Outra pessoa' })];
  const l = m.planoBandejaLista(); assert.deepEqual(l.map(x => x.tid), ['t1']); assert.equal(l[0].h, 1.5);
});
test('dia quase cheio (80%) e estourado (100%+) avisam na barra do dia', () => {
  const m = setup(); const dia = '2030-11-26';   // data futura fixa: dias passados não têm capacidade
  const cap = m.planoJanelas(dia).jan.reduce((t, [a, b]) => t + (b - a), 0);
  const com = (h) => m.planoCapHTML(dia, { [dia]: { blocos: [{ ini: 9, fim: 9 + h, pid: 'a' }] } });
  assert.doesNotMatch(com(cap * 0.5), /pl-cap-pct/);
  assert.match(com(cap * 0.85), /pl-cap-pct quase/);
  assert.match(com(cap + 1), /pl-cap-pct estouro/);
});
test('Entrega pelo menu de criar: a entrega é salva no projeto e desfaz num passo', () => {
  const m = setup(); m.db.data.tempo_projects = [proj('a')];
  m.planoMudar('Criado', () => m.projEntregasSalvar('a', [...m.projEntregas('a'), { id: 'e1', dia: '2026-12-03', hora: '17:00', nome: 'Entrega final' }]));
  assert.equal(m.projEntregas('a').length, 1); assert.ok(m.db.undo()); assert.equal(m.projEntregas('a').length, 0);
});
test('tarefa sem tempo previsto aparece como dica com campo para digitar', () => {
  const m = setup(); const dia = '2026-11-25';
  m.db.data.tempo_projects = [proj('a')]; m.db.data.tempo_tasks = [tarefa('t1', 'a', {})];
  const d = m.planoDiagnostico(AGORA).find(x => x.id === 'dica:previsao'); assert.ok(d && d.estimar.length === 1 && d.estimar[0].id === 't1' && d.estimar[0].min >= 15);
  m.planoMudar('Tempo previsto', () => m.db.update('tempo_tasks', 't1', { est_min: 45 }, true), false);
  assert.ok(!m.planoDiagnostico(AGORA).some(x => x.id === 'dica:previsao'), 'depois de digitar a dica some');
});
test('cor do mês: a do cliente quando existe; senão a do projeto', () => {
  const m = setup(); m.db.data.tempo_clients = [{ id: 'c1', name: 'C', color: 'blue' }];
  m.db.data.tempo_projects = [proj('a', { client_id: 'c1', color: 'red' }), proj('b', { color: 'green' })];
  assert.notEqual(m.planoCorCli('a'), m.planoCor('a'));
  assert.equal(m.planoCorCli('b'), m.planoCor('b'));
});

test('to-do com hora pode coexistir com bloco fixado: não gera aviso, não empurra, mas compromisso do Google continua valendo', () => {
  const m = setup();
  m.db.data.tempo_projects = [proj('a')]; m.db.data.tempo_tasks = [tarefa('t1', 'a')];
  m.db.data.tempo_notices = [{ id: 'todo1', kind: 'todo', status: 'open', title: 'Ver IPTU', data: { due: '2026-11-25T13:00', semHora: false } }];
  setPins(m, [{ id: 'p1', dia: '2026-11-25', pid: 'a', tid: 't1', ini: 10.75, h: 3.25 }]);   // 10h45–14h por cima do to-do de 13h–13h30
  assert.ok(!m.planoDiagnostico(AGORA).some(x => x.id.startsWith('evento:')), 'to-do não é "bate com"');
  assert.ok(!m.planoOcupadosDoDia('2026-11-25').some(o => o[2] === 'Ver IPTU'), 'Reorganizar não trata o to-do como bloco');
  m.db.data.tempo_settings.push({ id: 'ag', key: 'agendaEventos', value: [{ id: 'g1', ini: new Date(2026, 10, 25, 13, 0).toISOString(), fim: new Date(2026, 10, 25, 13, 30).toISOString(), titulo: 'Reunião', agenda: 'x' }] }); bump(m);
  assert.ok(m.planoDiagnostico(AGORA).some(x => x.id.startsWith('evento:')), 'reunião do Google continua batendo');
});
