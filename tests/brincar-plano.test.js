// "Brincar" no Calendário: sessões aleatórias de edição (arrastar para outro dia/hora, esticar, soltar, fixar o dia,
// encolher/tirar o almoço), com as MESMAS contas que a tela usa ao soltar (planoEmpurrar + planoPinsSalvar).
// Depois de cada ação o plano tem de seguir as regras. Uma falha diz a sessão (seed), o passo e a ação.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const NOMES = ['db', 'tkMotor', 'planoPins', 'planoPinsSalvar', 'planoEmpurrar', 'planoOcupadosDoDia', 'planoProximoUtil', 'planoJanelas', 'planoFixosDoDia', 'planoFixarDiaLista'];
const setup = () => {
  const m = load(['js/store.js', 'js/colors.js', 'js/domain.js', 'js/ui.js', 'js/notices.js', 'js/plano-seguro.js', 'js/planejamento.js', 'js/plano-extras.js', 'js/view-rafa.js', 'js/tarefas-prazo.js'],
    NOMES, { statusCat: (id) => String(id || '').replace(/^s-/, '') || undefined, VIEWS: {}, ACTIONS: {}, CHANGES: {}, S: {}, toast() {}, render() {}, go() {} });
  m.db.data = m.db.empty(); m.db.loaded = true;
  const st = (cat) => ({ id: 's-' + cat, kind: 'work', category: cat, name: cat });
  m.db.data.tempo_status_options = [st('todo'), st('active'), st('done')];
  return m;
};
const R = (grupo, ini, fim, dias, pin) => ({ id: grupo, grupo, nome: grupo, ini, fim, dias, repete: 'semanal', desde: '2000-01-01', ate: null, rafa: '', flex: false, pin });
const ROTINA = [R('almoco', 12, 14, [1, 2, 3, 4, 5], false), R('rafa', 19, 20, [1, 3], true), R('jantar', 20, 21, [1, 2, 3, 4, 5], false)];
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const DIAS = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18', '2026-12-21', '2026-12-22'];
const AGORA = new Date(2026, 11, 14, 8, 0);
const bump = (m) => { m.db.writes = (m.db.writes || 0) + 1; m.db.ver = (m.db.ver || 0) + 1; };
const setSet = (m, key, value) => { const l = m.db.data.tempo_settings; const i = l.findIndex(x => x.key === key); if (i >= 0) l[i] = { ...l[i], value }; else l.push({ id: key, key, value }); bump(m); };
const getSet = (m, key, d) => (m.db.data.tempo_settings.find(x => x.key === key) || {}).value ?? d;

function cenario(m, r) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const projs = [], tks = [];
  for (let i = 0; i < int(2, 4); i++) {
    projs.push({ id: 'p' + i, name: 'P' + i, status_id: 's-active', archived: false });
    const n = int(1, 4);
    for (let j = 0; j < n; j++) {
      const deps = j > 0 && r() < .4 ? ['p' + i + 't' + (j - 1)] : [];
      tks.push({ id: `p${i}t${j}`, project_id: 'p' + i, parent_id: null, name: `p${i}t${j}`, status_id: 's-todo', owner: 'Tulio', order: j, depends_on: deps,
        est_min: int(2, 16) * 15, deadline: r() < .6 ? DIAS[int(1, 6)] : null, deadline_time: r() < .5 ? '17:00' : null });
    }
  }
  m.db.data.tempo_projects = projs; m.db.data.tempo_tasks = tks; m.db.data.tempo_time_entries = [];
  m.db.data.tempo_settings = [{ id: 'r', key: 'planoRotina', value: ROTINA }, { id: 'p', key: 'planoPins', value: [] }];
  bump(m);
}
// blocos planejados como a tela os mostra: { tid, pid, dia, ini, fim, pins }
const blocosDe = (mo) => Object.entries(mo.porDia).flatMap(([dia, v]) => (v.blocos || []).map(b => ({ ...b, dia })));
// ações que a pessoa faz na tela, com a mesma conta do soltar
const ACOES = {
  arrastar(m, r, bs) { // leva um bloco para outro dia/hora (empurra os fixados que ele cobre)
    if (!bs.length) return null; const b = bs[Math.floor(r() * bs.length)]; const dia = DIAS[Math.floor(r() * DIAS.length)];
    const h = b.fim - b.ini; const ini = Math.round((8 + r() * 10) * 4) / 4;
    const outros = m.planoPins().filter(p => !(b.pins || []).includes(p.id));
    const rr = m.planoEmpurrar(outros, [{ dia, ini, fim: ini + h }], m.planoOcupadosDoDia, { proximoDia: m.planoProximoUtil });
    m.planoPinsSalvar([...rr.base, ...rr.empurrados, { id: 'x' + Math.floor(r() * 1e9), dia, pid: b.pid, tid: b.tid, ini, h }]); bump(m);
    return `arrastar ${b.tid} ${b.dia} ${b.ini}→${dia} ${ini}`;
  },
  esticar(m, r, bs) { // puxa a borda de baixo (mais ou menos tempo no bloco)
    if (!bs.length) return null; const b = bs[Math.floor(r() * bs.length)]; const fim = Math.max(b.ini + 0.25, Math.min(23, b.fim + (Math.floor(r() * 9) - 4) * 0.25));
    const outros = m.planoPins().filter(p => !(b.pins || []).includes(p.id));
    const rr = m.planoEmpurrar(outros, [{ dia: b.dia, ini: b.ini, fim }], m.planoOcupadosDoDia, { proximoDia: m.planoProximoUtil });
    m.planoPinsSalvar([...rr.base, ...rr.empurrados, { id: 'x' + Math.floor(r() * 1e9), dia: b.dia, pid: b.pid, tid: b.tid, ini: b.ini, h: fim - b.ini }]); bump(m);
    return `esticar ${b.tid} ${b.dia} até ${fim}`;
  },
  soltar(m, r) { const l = m.planoPins(); if (!l.length) return null; const p = l[Math.floor(r() * l.length)]; m.planoPinsSalvar(l.filter(x => x.id !== p.id)); bump(m); return `soltar ${p.tid}`; },
  fixarDia(m, r, bs) { const dia = DIAS[Math.floor(r() * DIAS.length)]; if (!bs.some(b => b.dia === dia && !b.pin)) return null;
    m.planoPinsSalvar(m.planoFixarDiaLista(m.planoPins(), dia, m.tkMotor(AGORA, 30))); bump(m); return `fixar o dia ${dia}`; },
  almoco(m, r) { const dia = DIAS[Math.floor(r() * DIAS.length)]; const rd = { ...getSet(m, 'planoRotinaDia', {}) };
    const opc = [{ ini: 12, fim: 13 }, { ini: 12.5, fim: 13.5 }, { ini: 13, fim: 14 }, { off: true }, null][Math.floor(r() * 5)];
    const d = { ...(rd[dia] || {}) }; if (opc) d.almoco = opc; else delete d.almoco; rd[dia] = d; setSet(m, 'planoRotinaDia', rd); return `almoço ${dia} ${JSON.stringify(opc)}`; },
};
// as regras que o plano tem de seguir depois de qualquer ação
function confere(m, mo) {
  const erros = []; const bs = blocosDe(mo);
  bs.forEach(b => { if (!(b.fim > b.ini) || b.ini < 0 || b.fim > 24) erros.push(`bloco estranho ${JSON.stringify(b)}`); });
  // nada sobreposto
  bs.forEach((a, i) => bs.slice(i + 1).forEach(b => { if (a.dia === b.dia && a.ini < b.fim - 1e-6 && b.ini < a.fim - 1e-6) erros.push(`sobreposto ${a.tid} ${a.ini}-${a.fim} × ${b.tid} ${b.ini}-${b.fim} em ${a.dia}`); }));
  // cada tarefa: o que o app coloca sozinho cai em horário livre (rotina inegociável e compromissos fora)
  bs.filter(b => !b.pin).forEach(b => { const jan = m.planoJanelas(b.dia, undefined, { solto: true }).jan; const ult = jan.length ? jan[jan.length - 1][1] : -1;
    if (!jan.some(([x, y]) => b.ini >= x - 1e-6 && b.fim <= y + (y === ult ? 1 : 0) + 1e-6)) erros.push(`${b.tid} fora das horas livres ${b.dia} ${b.ini}-${b.fim}`); });
  // a soma de cada tarefa = o que falta dela (dentro do horizonte), nem mais nem menos
  Object.values(mo.itens).filter(x => x.t && x.eu).forEach(x => { const soma = x.blocos.reduce((t, b) => t + (b.fim - b.ini) * 60, 0);
    if (soma > x.resto + 15 + 1e-6 && x.resto >= 15) erros.push(`${x.t.id} com ${soma} min planejados, mas faltam ${x.resto}`);
    if (soma < x.resto - 1e-6 && !(x.fim && x.fim.getHours() === 23)) erros.push(`${x.t.id} com só ${soma} de ${x.resto} min`); });
  // dependência
  Object.values(mo.itens).filter(x => x.t && x.eu).forEach(x => x.deps.forEach(d => { const dep = mo.itens[d]; if (!dep || !dep.blocos.length) return;
    x.blocos.filter(b => !b.pin).forEach(b => { if (new Date(`${b.dia}T00:00:00`).getTime() + b.ini * 36e5 < dep.fim.getTime() - 61e3) erros.push(`${x.t.id} antes de ${d} terminar`); }); }));
  // sobra de bloco fixado só com motivo (espera outra tarefa); "o plano não usa" sem motivo é erro
  (mo.pinsSobra || []).forEach(p => { if (!p.motivo) erros.push(`bloco fixado sobrando sem motivo: ${p.tid} ${p.dia} ${p.ini}-${p.fim}`); });
  return erros;
}
test('brincar: 300 sessões de 25 ações aleatórias no Calendário — o plano segue as regras depois de cada uma', () => {
  const m = setup(); const falhas = [];
  for (let seed = 1; seed <= 300 && falhas.length < 15; seed++) {
    const r = rng(seed * 7919); cenario(m, r); const passos = [];
    for (let k = 0; k < 25; k++) {
      let mo; try { mo = m.tkMotor(AGORA, 30); } catch (e) { falhas.push(`seed ${seed} passo ${k}: quebrou (${e.message}) depois de ${passos.slice(-3).join(' | ')}`); break; }
      const err = confere(m, mo); if (err.length) { falhas.push(`seed ${seed} passo ${k}: ${err[0]}${err.length > 1 ? ` (+${err.length - 1})` : ''} ← ${passos.slice(-2).join(' | ')}`); break; }
      const nome = Object.keys(ACOES)[Math.floor(r() * Object.keys(ACOES).length)];
      const feito = ACOES[nome](m, r, blocosDe(mo)); if (feito) passos.push(feito);
    }
  }
  assert.deepEqual(falhas, []);
});
