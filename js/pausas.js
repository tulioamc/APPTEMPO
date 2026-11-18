/* Pausas pelo registro do computador — fonte única de verdade para "tempo parado".
   Regra (Tulio, 17–18/11/2026): dentro de uma sessão, todo tempo em que o computador não registrou trabalho é pausa.
   - Sem nenhum registro por 2 min ou mais (desligado, sem bateria, sono, tela de espera, app do Mac fechado) → "Sem registro".
   - Tela bloqueada (loginwindow) e apps/sites que pausam (WhatsApp de amigo, Instagram…) → pausa a partir de 10 s,
     com o nome do motivo.
   - WhatsApp com contato/grupo de trabalho conta como trabalho.
   Antes, as pausas dependiam de cada evento chegar na hora (ociosidade, sono, troca de app); quando um evento falhava,
   o buraco ficava como trabalho "Não especificado". Agora uma revisão confere a sessão contra o registro e insere o que
   faltou. Ela só ACRESCENTA pausas (nunca transforma pausa em trabalho) e cada trecho é revisado uma vez só (marca
   "pausasAte"), para não brigar com uma correção manual feita depois.
   Como tudo (horas, produtividade, relatórios, análises) lê os intervalos da sessão, a correção vale para tudo. */

const PZ_DESDE = new Date('2026-11-16T00:00:00-03:00').getTime();   // retroativo decidido em 17/11
const PZ_MIN_APP = 10e3;

/* Núcleo puro (testável). segs = intervalos da sessão; recs = [{a, b, work, why}] do registro.
   janela [p0, p1] = trecho a revisar. Devolve { segs, n } (n = pausas novas). */
function pzReconciliar(segs, recs, { T = 120e3, at = Date.now(), p0 = -Infinity, p1 = Infinity, aberta = false } = {}) {
  const ms = (x) => new Date(x).getTime();
  const lista = (segs || []).filter(s => s && s.s);
  if (!lista.length) return { segs, n: 0 };
  // 1) linha do tempo: trabalho (W) e os vãos, com o motivo e os dados extras do intervalo que vem antes
  const tl = [];
  lista.forEach((s, i) => {
    const a = ms(s.s), b = s.e ? ms(s.e) : at;
    if (b > a) tl.push({ a, b, lab: 'W' });
    const nx = lista[i + 1]; if (!nx) return;
    const ga = s.e ? ms(s.e) : at, gb = ms(nx.s);
    if (gb > ga) { const { s: _s, e: _e, why, ...extra } = s; tl.push({ a: ga, b: gb, lab: why || 'manual', extra }); }
  });
  const ini = tl.length ? tl[0].a : 0, fim = tl.length ? tl[tl.length - 1].b : 0;
  const w0 = Math.max(p0, ini), w1 = Math.min(p1, fim);
  if (!(w1 > w0)) return { segs, n: 0 };
  // 2) cobertura de trabalho: registros de trabalho, emendando buracos menores que T
  const work = recs.filter(r => r.work && r.b > r.a).map(r => [r.a, r.b]).sort((x, y) => x[0] - y[0]);
  const cov = [];
  work.forEach(([a, b]) => { const l = cov[cov.length - 1]; if (l && a - l[1] < T) l[1] = Math.max(l[1], b); else cov.push([a, b]); });
  // 3) trechos de pausa vindos do registro (apps que pausam, tela bloqueada): sempre cortam, a partir de 10 s
  const pz = recs.filter(r => !r.work && r.b - r.a >= PZ_MIN_APP).map(r => ({ a: r.a, b: r.b, why: r.why || 'Sem registro' })).sort((x, y) => x.a - y.a);
  // 4) novas pausas = trabalho da sessão (na janela) sem cobertura de trabalho
  const novas = [];
  tl.filter(x => x.lab === 'W').forEach(x => {
    let a = Math.max(x.a, w0); const b = Math.min(x.b, w1); if (!(b > a)) return;
    const vazios = []; let c = a;
    cov.forEach(([ca, cb]) => { if (cb <= c || ca >= b) return; if (ca > c) vazios.push([c, ca]); c = Math.max(c, cb); });
    if (b > c) vazios.push([c, b]);
    // trecho de app de pausa dentro da cobertura também é pausa (ex.: WhatsApp de amigo por 1 min entre dois trabalhos)
    pz.forEach(p => { const pa = Math.max(p.a, a), pb = Math.min(p.b, b); if (pb - pa >= PZ_MIN_APP) vazios.push([pa, pb]); });
    vazios.sort((p, q) => p[0] - q[0]);
    const un = []; vazios.forEach(([p, q]) => { const l = un[un.length - 1]; if (l && p <= l[1]) l[1] = Math.max(l[1], q); else un.push([p, q]); });
    un.forEach(([va, vb]) => {
      // dentro do vazio: pedaços com motivo (app de pausa) e o resto "Sem registro" (só se tiver T ou mais)
      let t = va; const pedacos = [];
      pz.forEach(p => { const pa = Math.max(p.a, va), pb = Math.min(p.b, vb); if (pb <= pa || pb <= t) return; if (pa > t) pedacos.push({ a: t, b: pa, why: null }); pedacos.push({ a: Math.max(pa, t), b: pb, why: p.why }); t = pb; });
      if (vb > t) pedacos.push({ a: t, b: vb, why: null });
      pedacos.forEach(p => { if (p.why) novas.push(p); else if (p.b - p.a >= T) novas.push({ ...p, why: 'Sem registro' }); });
    });
  });
  if (!novas.length) return { segs, n: 0 };
  // 5) aplica as novas pausas sobre o trabalho
  let out = tl.slice();
  novas.forEach(p => {
    const nx = [];
    out.forEach(x => {
      if (x.lab !== 'W' || x.b <= p.a || x.a >= p.b) { nx.push(x); return; }
      if (x.a < p.a) nx.push({ a: x.a, b: p.a, lab: 'W' });
      nx.push({ a: Math.max(x.a, p.a), b: Math.min(x.b, p.b), lab: p.why });
      if (x.b > p.b) nx.push({ a: p.b, b: x.b, lab: 'W' });
    });
    out = nx;
  });
  // junta vizinhos iguais (mesmo motivo e sem dados extras diferentes)
  const j = [];
  out.forEach(x => { const l = j[j.length - 1]; if (l && l.lab === x.lab && l.b === x.a && !l.extra && !x.extra) l.b = x.b; else j.push({ ...x }); });
  // pausa no começo: a sessão começa no primeiro trabalho; no fim (sessão encerrada): termina no último trabalho
  while (j.length && j[0].lab !== 'W') j.shift();
  if (!aberta) while (j.length && j[j.length - 1].lab !== 'W') j.pop();
  if (!j.length) return { segs, n: 0 };
  // 6) volta para intervalos: cada trabalho vira um intervalo; o motivo da pausa fica no intervalo de antes.
  //    Duas pausas seguidas de motivos diferentes: um intervalo de duração zero separa as duas.
  const res = [];
  const ultimoAberto = aberta && !lista[lista.length - 1].e;
  j.forEach((x, i) => {
    const iso = (t) => new Date(t).toISOString();
    if (x.lab === 'W') { res.push({ s: iso(x.a), e: (i === j.length - 1 && ultimoAberto) ? null : iso(x.b) }); return; }
    const prev = res[res.length - 1];
    if (prev && !prev.why && prev.e && new Date(prev.e).getTime() === x.a) Object.assign(prev, x.extra || {}, { why: x.lab });
    else res.push({ ...(x.extra || {}), s: iso(x.a), e: iso(x.a), why: x.lab });
  });
  res.forEach(s => { if (!s.why) delete s.why; });
  return { segs: res, n: novas.length };
}

/* Registros do computador numa faixa, já marcados como trabalho ou pausa (com o motivo). */
function pzRegistros(a, b) {
  return actPoolBetween(a, b).map(r => {
    const x = new Date(r.from).getTime(), y = new Date(r.to).getTime();
    const app = String(r.app || '').trim();
    if (/^loginwindow$/i.test(app)) return { a: x, b: y, work: false, why: 'Tela bloqueada' };
    if (pausaRec(r) && !actWaTrabalho(r)) return { a: x, b: y, work: false, why: BROWSER_RE.test(app) ? (r.doc || 'app') : shortProgram(app) };
    return { a: x, b: y, work: true };
  });
}

/* Revê uma sessão e grava as pausas que faltaram. Devolve quantas entraram. */
function pzRever(e, at = Date.now()) {
  if (!e || !(e.segments || []).length) return 0;
  if (/reuni/i.test(db.get('tempo_work_types', e.work_type_id)?.name || '')) return 0;   // reunião presencial não tem computador
  const ms = (x) => new Date(x).getTime();
  const ini = ms(e.segments[0].s), aberta = e.segments.some(s => s.s && !s.e);
  const fim = Math.max(...e.segments.map(s => s.e ? ms(s.e) : at));
  if (fim < PZ_DESDE) return 0;
  const marcas = db.setting('pausasAte', {}) || {};
  const p0 = Math.max(PZ_DESDE, marcas[e.id] || -Infinity);
  const recs = pzRegistros(ini - 60e3, fim);
  if (!recs.length) return 0;   // sessão sem registro do computador (manual, celular): não mexe
  // sessão rodando: só até o fim do último registro (o app em uso agora ainda não entrou no registro)
  const ultimo = Math.max(...recs.map(r => r.b));
  const p1 = aberta ? Math.min(at, ultimo) : fim;
  if (!(p1 > p0)) return 0;
  const T = (typeof idleLimit === 'function' ? idleLimit() : 2) * 60e3;
  const r = pzReconciliar(e.segments, recs, { T, at, p0, p1, aberta });
  const marcar = () => { marcas[e.id] = p1; db.setSetting('pausasAte', { ...marcas }); };
  if (!r.n || JSON.stringify(r.segs) === JSON.stringify(e.segments)) { marcar(); return 0; }
  db.update('tempo_time_entries', e.id, { segments: r.segs, edits: auditEdit(e, e.segments, `${r.n} pausa(s) do registro do computador inserida(s) (tempo sem trabalho registrado)`) }, true);
  marcar();
  return r.n;
}

/* Revisão geral: sessões desde 16/11 ainda não revistas por completo + a sessão rodando. Só no app do Mac,
   que é quem tem o registro (evita dois aparelhos gravando ao mesmo tempo). */
let _pzRodando = false;
function pzReverTudo() {
  if (_pzRodando || typeof isMacApp !== 'function' || !isMacApp()) return 0;
  _pzRodando = true;
  try {
    const marcas = db.setting('pausasAte', {}) || {};
    let n = 0;
    db.all('tempo_time_entries').forEach(e => {
      const segs = e.segments || []; if (!segs.length) return;
      const aberta = segs.some(s => s.s && !s.e);
      const fim = aberta ? Date.now() : Math.max(...segs.map(s => s.e ? new Date(s.e).getTime() : 0));
      if (fim < PZ_DESDE || (!aberta && (marcas[e.id] || 0) >= fim)) return;
      n += pzRever(e);
    });
    if (n) db.emit();
    return n;
  } finally { _pzRodando = false; }
}
