/* Relatório Produtividade: quando e como você trabalha. Usa o bruto de todas as sessões (sem contar duas vezes)
   e as pausas já corrigidas (pauseGapsOf). Três tipos de tempo:
   - Produtivo (verde claro): trabalho no computador.
   - Distração (vermelho claro): WhatsApp, Telegram e Instagram.
   - Ocioso (amarelo): todas as demais pausas (sem motivo, página parada, intervalo manual, computador fechado ou dormindo).
    . */
const PROD = { period: '30d' };
const PROD_GAP = 60e3; /* blocos de foco: pausas de até 1 min não quebram o foco; acima disso, a pausa corta o bloco */
const PROD_DOW = [1, 2, 3, 4, 5, 6, 0]; /* segunda primeiro */
const PROD_DOW_LBL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PROD_NAME = { prod: "Produtivo", dist: "Distração", ocio: "Ocioso" };
const PROD_COLOR = { prod: "#4ADE80", dist: "#F87171", ocio: "#FACC15" };
const PROD_CLS = { prod: "prod-p", dist: "prod-d", ocio: "prod-y" };
const PROD_KEYS = ["prod", "dist", "ocio"];
const PROD_TYPE = { dist: "Distração", ocio: "Ocioso" };

function prodRange() {
  const now = Date.now();
  if (PROD.period === 'semana') return prodPeriodRange('semana');
  if (PROD.period === 'custom') return PROD.range;
  if (PROD.period === 'mes') { const d = new Date(); return { a: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), b: now }; }
  if (PROD.period === 'tudo') {
    let a = now;
    db.all('tempo_time_entries').forEach(e => (e.segments || []).forEach(s => { if (s.s) a = Math.min(a, new Date(s.s).getTime()); }));
    return { a, b: now };
  }
  return { a: now - 30 * 864e5, b: now };
}
/* Une intervalos [s,e] ordenados; junta os que estão a até "gap" ms um do outro. */
function prodMerge(sorted, gap) {
  const out = [];
  sorted.forEach(([s, e]) => { const l = out[out.length - 1]; if (l && s - l[1] <= gap) l[1] = Math.max(l[1], e); else out.push([s, e]); });
  return out;
}
function prodCollect() {
  const { a, b } = prodRange();
  const all = db.all('tempo_time_entries');
  const clip = (s, e) => { const x = Math.max(s, a), y = Math.min(e, b); return y > x ? [x, y] : null; };
  const work = [];
  all.forEach(e => entryBruIntervals(e).forEach(([s, t]) => { const c = clip(s, t); if (c) work.push(c); }));
  work.sort((x, y) => x[0] - y[0]);
  const union = prodMerge(work, 0);
  const pauses = pauseGapsOf(all).map(g => {
    const c = clip(new Date(g.s).getTime(), new Date(g.e).getTime());
    return c ? { s: c[0], e: c[1], why: g.why || null } : null;
  }).filter(Boolean);
  return { a, b, union, pauses };
}
/* Classe de cada pausa: distração (apps de conversa/redes) ou ocioso (o resto). */
function prodPauseCls(why) {
  const w = String(why || '').trim().toLowerCase();
  const k = pauseKind(why);
  if (k === 'whatsapp' || k === 'telegram' || k === 'instagram') return "dist";
  return "ocio";
}
/* Reparte [s,e] em pedaços de uma hora (horário local) e chama cb(data, ms) para cada um. */
function prodSpread(s, e, cb) {
  let t = s;
  while (t < e) {
    const d = new Date(t);
    const nx = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    const end = Math.min(Math.max(nx, t + 1), e);
    cb(d, end - t);
    t = end;
  }
}
/* Dias de cada dia da semana no período (para média por dia). */
function prodDowDays(a, b) {
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  const d = new Date(a); d.setHours(0, 0, 0, 0);
  while (d.getTime() < b) { cnt[d.getDay()]++; d.setDate(d.getDate() + 1); }
  return cnt;
}
function prodZero() { return { prod: 0, dist: 0, ocio: 0 }; }
function prodStats(C) {
  const hours = Array.from({ length: 24 }, prodZero);
  const dows = Array.from({ length: 7 }, prodZero);
  C.union.forEach(([s, e]) => prodSpread(s, e, (d, ms) => { hours[d.getHours()].prod += ms; dows[d.getDay()].prod += ms; }));
  C.pauses.forEach(p => {
    const k = prodPauseCls(p.why);
    prodSpread(p.s, p.e, (d, ms) => { hours[d.getHours()][k] += ms; dows[d.getDay()][k] += ms; });
  });
  const tot = prodZero();
  hours.forEach(h => PROD_KEYS.forEach(k => { tot[k] += h[k]; }));
  const base = tot.prod + tot.dist + tot.ocio; /* */
  const blocks = prodMerge(C.union, PROD_GAP);
  const longest = blocks.reduce((m, [s, e]) => Math.max(m, e - s), 0);
  const dayKey = (t) => new Date(t).toDateString();
  const byDay = new Map();
  blocks.forEach(([s, e]) => {
    const k = dayKey(s); const r = byDay.get(k) || { n: 0, max: 0, ms: 0 };
    r.n++; r.max = Math.max(r.max, e - s); r.ms += e - s; byDay.set(k, r);
  });
  const days = [...byDay.entries()].map(([k, r]) => ({ key: k, ...r })).sort((x, y) => new Date(y.key) - new Date(x.key));
  /* Tempo de cada dia por tipo, com os blocos de foco do mesmo dia. */
  const dt = new Map();
  const addDay = (t, k, ms) => { const key = dayKey(t); const r = dt.get(key) || prodZero(); r[k] += ms; dt.set(key, r); };
  C.union.forEach(([s, e]) => prodSpread(s, e, (d, ms) => addDay(d.getTime(), 'prod', ms)));
  C.pauses.forEach(p => { const k = prodPauseCls(p.why); prodSpread(p.s, p.e, (d, ms) => addDay(d.getTime(), k, ms)); });
  const dayTable = [...dt.entries()]
    .map(([key, r]) => { const b = byDay.get(key) || { n: 0, max: 0 }; return { key, ...r, n: b.n, max: b.max }; })
    .sort((x, y) => new Date(y.key) - new Date(x.key));
  const dowDays = prodDowDays(C.a, C.b);
  return {
    hours, dows, dowDays, tot, base, blocks, longest, days, dayTable,
    pctProd: base > 0 ? tot.prod / base * 100 : 0,
    blocksPerDay: days.length ? blocks.length / days.length : 0,
    longestPerDay: days.length ? days.reduce((s, d) => s + d.max, 0) / days.length : 0,
  };
}
/* Colunas empilhadas: cada item tem partes [{cls, ms}]; a altura é proporcional ao maior total. */
/* Tempo curto (ex.: 1h05, 40m) para escrever dentro das colunas. */
function prodShort(ms) {
  const m = Math.round(ms / 6e4);
  if (m <= 0) return '0m';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60), r = m % 60;
  return h + 'h' + (r ? String(r).padStart(2, '0') : '');
}
/* Rótulo da coluna: produtivo em tempo e % do tempo no computador (produtivo + distração + ocioso). */
function prodVal(prod, dist, ocio) {
  const b = prod + dist + ocio;
  return `${prodShort(prod)}<br>${Math.round(b > 0 ? prod / b * 100 : 0)}%`;
}
function prodColsHTML(items) {
  const max = Math.max(1, ...items.map(i => i.parts.reduce((s, p) => s + p.ms, 0)));
  /* Empilhamento de baixo para cima: produtivo, ocioso, distração (a ordem do DOM vai de cima para baixo). */
  const ORDER = ["ocio", "dist", "prod"];
  return `<div class="prod-cols">${items.map(i => {
    const by = Object.fromEntries(i.parts.map(p => [p.cls, p.ms]));
    const tot = PROD_KEYS.reduce((s, k) => s + (by[k] || 0), 0);
    const segs = ORDER.filter(k => (by[k] || 0) > 0).map(k => `<span class="prod-seg ${PROD_CLS[k]}" data-hk="${k}" style="height:${((by[k] || 0) / max * 100).toFixed(2)}%"></span>`).join('');
    const rows = PROD_KEYS.map(k => `<div class="prod-tip-row"><i style="background:${PROD_COLOR[k]}"></i>${PROD_NAME[k]}<b class="mono">${usePctTxt(tot > 0 ? (by[k] || 0) / tot * 100 : 0)}</b><span class="mono muted">${fmtDur(by[k] || 0)}</span></div>`).join('');
    return `<div class="prod-col">${i.val ? `<span class="prod-val">${i.val}</span>` : ''}<div class="prod-stack">${segs}</div><span class="prod-lbl">${esc(i.label)}</span><div class="prod-tip"><div class="prod-tip-h">${esc(i.head || i.label || '')}</div>${rows}</div></div>`;
  }).join('')}</div>`;
}
/* Legenda em chips (como na timesheet): passar o mouse acende os segmentos dessa cor e esmaece o resto.
   Com "items", cada chip mostra a % do período e o total; "pctOnly" mostra só a % (médias por dia). */
function prodTotal(items) { return items.reduce((s, i) => s + i.parts.reduce((t, p) => t + p.ms, 0), 0); }
function prodLegendHTML(keys, items = null, pctOnly = false) {
  const sum = {};
  if (items) items.forEach(i => i.parts.forEach(p => { sum[p.cls] = (sum[p.cls] || 0) + p.ms; }));
  const all = Object.values(sum).reduce((s, v) => s + v, 0);
  const tag = (k) => {
    if (!items) return '';
    const pct = all > 0 ? (sum[k] || 0) / all * 100 : 0;
    return ` <span class="faint">${usePctTxt(pct)}${pctOnly ? '' : ` · ${fmtDur(sum[k] || 0)}`}</span>`;
  };
  return `<div class="act-chips prod-legend">${keys.map(k => `<span class="act-chip" data-hk="${k}" data-hkv="${items ? (sum[k] || 0) : 0}" style="--tb:${PROD_COLOR[k]}"><i></i>${PROD_NAME[k]}${tag(k)}</span>`).join('')}</div>`;
}
function prodWeeks(C) {
  const weekKey = (t) => { const d = new Date(t); const off = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - off).getTime(); };
  const out = new Map();
  const add = (t, f) => { const k = weekKey(t); const r = out.get(k) || prodZero(); f(r); out.set(k, r); };
  C.union.forEach(([s, e]) => prodSpread(s, e, (d, ms) => add(d.getTime(), r => { r.prod += ms; })));
  C.pauses.forEach(p => { const k = prodPauseCls(p.why); prodSpread(p.s, p.e, (d, ms) => add(d.getTime(), r => { r[k] += ms; })); });
  return [...out.entries()].sort((x, y) => x[0] - y[0]).slice(-26);
}
function prodPausesHTML(C) {
  const by = new Map();
  C.pauses.forEach(p => {
    const k = p.why || '_none';
    const r = by.get(k) || { why: p.why, ms: 0, n: 0 };
    r.ms += p.e - p.s; r.n++; by.set(k, r);
  });
  const rows = [...by.values()].sort((x, y) => y.ms - x.ms);
  if (!rows.length) return '<div class="muted small">Nenhuma pausa no período.</div>';
  const total = rows.reduce((s, r) => s + r.ms, 0);
  return `<div class="usage-table-wrap"><table class="usage-table">
    <thead><tr><th>Motivo</th><th>Tipo</th><th>Tempo</th><th>% das pausas</th><th>Vezes</th><th>Média por vez</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.why ? pauseLabel(r.why) : 'Sem motivo')}</td><td class="small">${PROD_TYPE[prodPauseCls(r.why)]}</td><td class="mono small">${fmtDur(r.ms)}</td><td class="mono small">${usePctTxt(r.ms / total * 100)}</td><td class="mono small">${r.n}</td><td class="mono small">${fmtDur(r.ms / r.n)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

/* Análise da semana: gerada toda segunda (7h13) por tarefa agendada e gravada em tempo_settings (prodSemanal:AAAA-MM-DD). */
/* Metas, desafios e estrelas (gamificação): calculados na hora sobre a semana e o mês até agora.
   Cada meta fixa conquistada vale 1 estrela; o desafio do período vale 2. Ao conquistar, aparece um aviso com as estrelas.
   O desafio muda a cada semana (e a cada mês, no mensal), na ordem da lista. */
function prodPeriodRange(kind) {
  const d = new Date();
  if (kind === 'mes') return { a: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), b: Date.now() };
  const dow = (d.getDay() + 6) % 7;
  return { a: new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime(), b: Date.now() };
}
function prodCollectFor(kind) {
  const old = PROD.period; PROD.period = kind;
  try { return prodCollect(); } finally { PROD.period = old; }
}
/* Menor número de pausas (até 1 min cada) até completar 1 h de trabalho num bloco. null = nenhum bloco chegou a 1 h. */
function prodJanelaHora(C) {
  let best = null;
  prodMerge(C.union, PROD_GAP).forEach(([bs, be]) => {
    const pieces = C.union.filter(([s, e]) => s >= bs && e <= be);
    let acc = 0, gaps = 0;
    for (let i = 0; i < pieces.length; i++) {
      if (i > 0) gaps++;
      const len = pieces[i][1] - pieces[i][0];
      if (acc + len >= 36e5) { if (best === null || gaps < best) best = gaps; return; }
      acc += len;
    }
  });
  return best;
}
const PROD_METAS_FIXAS = {
  semana: [
    { id: 'prod', nome: '70% produtivo', hint: 'produtivo ÷ (produtivo + distração + ocioso)', alvo: 70, pct: true, sobe: true, valor: (S) => S.pctProd },
    { id: 'horas', nome: '30 h líquidas na semana', hint: 'tempo produtivo somado', alvo: 30 * 36e5, sobe: true, valor: (S) => S.tot.prod },
    { id: 'dist', nome: 'Distração até 5 h', hint: 'WhatsApp, Telegram e Instagram (limite)', alvo: 5 * 36e5, sobe: false, valor: (S) => S.tot.dist },
  ],
  mes: [
    { id: 'prod', nome: '70% produtivo', hint: 'produtivo ÷ (produtivo + distração + ocioso)', alvo: 70, pct: true, sobe: true, valor: (S) => S.pctProd },
    { id: 'horas', nome: '120 h líquidas no mês', hint: 'tempo produtivo somado', alvo: 120 * 36e5, sobe: true, valor: (S) => S.tot.prod },
    { id: 'dist', nome: 'Distração até 20 h', hint: 'WhatsApp, Telegram e Instagram (limite)', alvo: 20 * 36e5, sobe: false, valor: (S) => S.tot.dist },
    { id: 'projeto', nome: '1 projeto novo no portfólio', hint: 'projetos criados no mês', alvo: 1, sobe: true, inicio: '2026-11', valor: () => db.all('tempo_projects').filter(p => !p.archived && new Date(p.created_at).getTime() >= prodPeriodRange('mes').a).length },
  ],
};
/* Desafios: um por período, na ordem da lista (semana 1 = primeiro, semana 2 = segundo...). */
const PROD_DESAFIOS = [
  { id: 'janela', nome: '1 h de trabalho com no máximo 5 pausas', hint: 'pausas de até 1 min dentro de um bloco, contadas até completar 1 h', alvo: 5, cont: true, sobe: false, valor: (S, C) => prodJanelaHora(C) },
  { id: 'bloco2', nome: 'Bloco de foco de 2 h', hint: 'maior bloco de foco do período', alvo: 2 * 36e5, sobe: true, valor: (S) => S.longest },
  { id: 'pausa10', nome: 'Pausa de até 10% do tempo', hint: 'pausas ÷ tempo no computador (distração + ocioso)', alvo: 10, pct: true, sobe: false, valor: (S) => (S.base > 0 ? (S.tot.dist + S.tot.ocio) / S.base * 100 : 0) },
  { id: 'dia6', nome: 'Um dia com 6 h produtivas', hint: 'melhor dia do período', alvo: 6 * 36e5, sobe: true, valor: (S) => Math.max(0, ...S.dayTable.map(d => d.prod)) },
  { id: 'semdist', nome: 'Um dia com no máximo 15 min de distração', hint: 'menor distração num dia com trabalho', alvo: 15 * 6e4, sobe: false, valor: (S) => { const ds = S.dayTable.filter(d => d.prod > 0); return ds.length ? Math.min(...ds.map(d => d.dist)) : null; } },
];
function prodDesafioDoPeriodo(kind) {
  const r = prodPeriodRange(kind);
  const idx = kind === 'mes'
    ? (new Date(r.a).getFullYear() * 12 + new Date(r.a).getMonth())
    : Math.floor(r.a / (7 * 864e5));
  return PROD_DESAFIOS[((idx % PROD_DESAFIOS.length) + PROD_DESAFIOS.length) % PROD_DESAFIOS.length];
}
function prodPeriodoKey(kind) {
  const r = prodPeriodRange(kind); const d = new Date(r.a);
  return kind === 'mes' ? `mes:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : `semana:${ymd(d)}`;
}
const prodWon = (m, v) => v !== null && v !== undefined && (m.sobe ? v >= m.alvo : v <= m.alvo);
function prodMetasBloco(kind) {
  const C = prodCollectFor(kind), S = prodStats(C);
  const fmtV = (m, v) => (m.cont ? v + ' pausas' : m.pct ? Math.round(v) + '%' : fmtDur(v));
  const mesAtual = ymd(new Date(prodPeriodRange('mes').a)).slice(0, 7);
  const fixas = PROD_METAS_FIXAS[kind];
  const ativas = fixas.filter(m => !m.inicio || kind !== 'mes' || mesAtual >= m.inicio);
  const aguardando = fixas.filter(m => m.inicio && kind === 'mes' && mesAtual < m.inicio);
  const des = prodDesafioDoPeriodo(kind);
  const itens = ativas.map(m => ({ m, v: m.valor(S, C), desafio: false }))
    .concat([{ m: des, v: des.valor(S, C), desafio: true }]);
  // estrelas: guarda o que já foi conquistado neste período e avisa só o que é novo
  const store = db.setting('prodEstrelas', {}) || {};
  const key = prodPeriodoKey(kind);
  const got = store[key] || {};
  const novos = [];
  itens.forEach(({ m, v, desafio }) => { if (prodWon(m, v) && !got[m.id]) { got[m.id] = desafio ? 2 : 1; novos.push({ m, pts: desafio ? 2 : 1 }); } });
  if (novos.length) {
    store[key] = got; db.setSetting('prodEstrelas', store);
    novos.forEach(({ m, pts }) => { try { toast(`⭐ ${m.nome} conquistada (+${pts} estrela${pts > 1 ? 's' : ''})`); } catch (e) {} });
  }
  const cards = itens.map(({ m, v, desafio }) => {
    if (v === null || v === undefined) return `<div class="pm-card ${desafio ? 'pm-desafio' : ''}"><div class="row between"><b>${desafio ? 'Desafio: ' : ''}${esc(m.nome)}</b><span class="small muted">ainda sem dados</span></div><div class="small muted">${esc(m.hint)}</div></div>`;
    const ok = prodWon(m, v);
    const p = m.sobe ? Math.min(1, v / m.alvo) : Math.max(0, Math.min(1, 1 - (v - m.alvo) / m.alvo));
    const falta = m.sobe ? m.alvo - v : v - m.alvo;
    const status = ok ? `<span class="pm-badge">⭐ conquistada${desafio ? ' · 2' : ''}</span>` : `<span class="small muted">${m.sobe ? 'faltam ' : 'passou '}${fmtV(m, Math.max(0, falta))}</span>`;
    return `<div class="pm-card ${ok ? 'ok' : ''} ${desafio ? 'pm-desafio' : ''}"><div class="row between"><b>${desafio ? 'Desafio: ' : ''}${esc(m.nome)}</b>${status}</div><div class="pm-bar"><span style="width:${Math.round(p * 100)}%"></span></div><div class="small muted">${fmtV(m, v)} de ${fmtV(m, m.alvo)} · ${esc(m.hint)}</div></div>`;
  }).join('');
  const espera = aguardando.map(m => `<div class="pm-card"><div class="row between"><b>${esc(m.nome)}</b><span class="small muted">começa em ${new Date(m.inicio + '-01T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span></div></div>`).join('');
  const pts = Object.values(got).reduce((s, x) => s + x, 0);
  const titulo = kind === 'mes' ? 'Metas do mês' : 'Metas da semana';
  const sub = kind === 'mes' ? 'mês até agora' : 'semana até agora';
  return `<div class="panel"><div class="panel-h"><h3>${titulo}</h3><span class="small muted">⭐ ${pts} neste ${kind === 'mes' ? 'mês' : 'semana'} · ${sub}</span></div><div class="panel-b stack">${cards}${espera}</div></div>`;
}
function prodEstrelasTotal() {
  const store = db.setting('prodEstrelas', {}) || {};
  return Object.values(store).reduce((t, g) => t + Object.values(g).reduce((s, x) => s + x, 0), 0);
}
function prodMetasHTML() {
  const blocos = prodMetasBloco('semana') + prodMetasBloco('mes');
  return `<div class="pm-total">⭐ ${prodEstrelasTotal()} estrelas no total</div>` + blocos;
}
function prodWeeklyLatest() {
  const rows = db.all('tempo_settings').filter(r => String(r.key || '').startsWith('prodSemanal:'));
  if (!rows.length) return null;
  rows.sort((a, b) => String(b.key).localeCompare(String(a.key)));
  let v = rows[0].value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
  return v && typeof v === 'object' ? v : null;
}
function prodMetasListaHTML(titulo, xs) {
  if (!Array.isArray(xs) || !xs.length) return '';
  return `<div class="small muted" style="margin-top:6px">${esc(titulo)}</div><div class="stack" style="gap:6px">${xs.map(x => `<div class="pm-card ${x.conquistada ? 'ok' : ''}"><div class="row between"><b>${esc(x.nome || '')}</b>${x.resultado ? `<span class="small muted">${esc(x.resultado)}</span>` : ''}${x.conquistada === true ? '<span class="pm-badge">⭐ conquistada</span>' : (x.conquistada === false ? '<span class="small muted">não bateu</span>' : '')}</div>${x.alvo ? `<div class="small muted">Meta: ${esc(x.alvo)}${x.nota ? ' · ' + esc(x.nota) : ''}</div>` : ''}</div>`).join('')}</div>`;
}
/* Análise de um período (semana ou mês): números, análises, sugestões e metas passadas e novas. */
function prodAnaliseHTML(w, titulo, vazio) {
  if (!w) return `<section class="card stack" style="gap:8px"><h3>${esc(titulo)}</h3><div class="muted small">${esc(vazio)}</div></section>`;
  const n = w.numeros || {};
  const lista = (xs) => (Array.isArray(xs) && xs.length ? `<ul class="prod-ul">${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const pct = n.pct_produtivo !== undefined ? `<div class="small"><b>% produtivo:</b> ${usePctTxt(Number(n.pct_produtivo))}${n.pct_produtivo_semana_anterior !== undefined ? ` (semana anterior: ${usePctTxt(Number(n.pct_produtivo_semana_anterior))})` : ''}</div>` : '';
  const meta = w.meta?.texto ? `<div class="small"><b>Meta sugerida:</b> ${esc(w.meta.texto)}</div>` : '';
  return `<section class="card stack" style="gap:8px"><h3>${esc(titulo)}</h3>
    <div class="small muted">Período de ${esc(w.semana_inicio || w.mes_inicio || '')} a ${esc(w.semana_fim || w.mes_fim || '')} · gerada em ${esc(String(w.gerado_em || '').slice(0, 16).replace('T', ' '))}</div>
    ${pct}${lista(w.analises)}
    ${lista(w.sugestoes) ? `<div class="small muted" style="margin-top:4px">Sugestões</div>${lista(w.sugestoes)}` : ''}
    ${meta}
    ${prodMetasListaHTML('Metas do período que passou', w.metas_passadas)}
    ${prodMetasListaHTML('Metas do próximo período', w.metas_novas)}
    ${w.metas_nota ? `<div class="small" style="margin-top:4px">${esc(w.metas_nota)}</div>` : ''}
  </section>`;
}
function prodMensalLatest() {
  const rows = db.all('tempo_settings').filter(r => String(r.key || '').startsWith('prodMensal:'));
  if (!rows.length) return null;
  rows.sort((a, b) => String(b.key).localeCompare(String(a.key)));
  let v = rows[0].value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
  return v && typeof v === 'object' ? v : null;
}

VIEWS.productivity = () => {
  const C = prodCollect();
  const S = prodStats(C);
  const hasData = C.union.length > 0 || C.pauses.length > 0;
  /* Nas horas, escreve o rótulo só nas 6 com mais produtivo, para não embolar. */
  const topHours = new Set(S.hours.map((h, i) => [h.prod, i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 6).map(x => x[1]));
  const hourItems = S.hours.map((h, i) => ({
    label: i % 3 === 0 ? String(i).padStart(2, '0') : '',
    val: topHours.has(i) ? prodVal(h.prod, h.dist, h.ocio) : '',
    parts: PROD_KEYS.map(k => ({ cls: k, ms: h[k] })),
    head: `${String(i).padStart(2, '0')}h`,
  }));
  const dowItems = PROD_DOW.map(di => {
    const r = S.dows[di]; const n = Math.max(1, S.dowDays[di]);
    return {
      label: PROD_DOW_LBL[di],
      val: prodVal(r.prod / n, r.dist / n, r.ocio / n),
      parts: PROD_KEYS.map(k => ({ cls: k, ms: r[k] / n })),
      head: `${PROD_DOW_LBL[di]} · média por dia`,
    };
  });
  const weeks = prodWeeks(C);
  const weekPct = (r) => { const b = r.prod + r.dist + r.ocio; return b > 0 ? r.prod / b * 100 : 0; };
  const weekItems = weeks.map(([k, r]) => {
    const d = new Date(k);
    return {
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      val: weeks.length <= 12 ? prodVal(r.prod, r.dist, r.ocio) : '',
      parts: PROD_KEYS.map(kk => ({ cls: kk, ms: r[kk] })),
      head: `Semana de ${d.toLocaleDateString('pt-BR')}`,
    };
  });
  const weekRows = weeks.slice(-8).reverse().map(([k, r]) =>
    `<tr><td>${esc(new Date(k).toLocaleDateString('pt-BR'))}</td><td class="mono small">${fmtDur(r.prod)}</td><td class="mono small">${fmtDur(r.dist)}</td><td class="mono small">${fmtDur(r.ocio)}</td><td class="mono small">${usePctTxt(weekPct(r))}</td></tr>`).join('');
  const dayRows = S.dayTable.slice(0, 10).map(d => `<tr><td>${esc(new Date(d.key).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</td><td class="mono small">${fmtDur(d.prod)}</td><td class="mono small">${fmtDur(d.dist)}</td><td class="mono small">${fmtDur(d.ocio)}</td><td class="mono small">${d.n}</td><td class="mono small">${fmtDur(d.max)}</td></tr>`).join('');
  const periods = [['mes', 'Mês atual'], ['30d', 'Últimos 30 dias'], ['tudo', 'Tudo']];

  const body = !hasData
    ? '<div class="muted small">Sem registro de trabalho no período escolhido.</div>'
    : `<div class="kpi-row">
        <div class="kpi"><span class="k">Produtivo</span><span class="v mono">${fmtDur(S.tot.prod)}</span><span class="s">trabalho sem contar duplicado</span></div>
        <div class="kpi"><span class="k">% produtivo</span><span class="v mono">${usePctTxt(S.pctProd)}</span><span class="s">produtivo ÷ (produtivo + distração + ocioso)</span></div>
        <div class="kpi"><span class="k">Maior bloco de foco</span><span class="v mono">${fmtDur(S.longest)}</span><span class="s">pausas de até 1 min não quebram</span></div>
        <div class="kpi"><span class="k">Blocos por dia</span><span class="v mono">${S.blocksPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span><span class="s">${S.blocks.length} bloco(s) em ${S.days.length} dia(s)</span></div>
      </div>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Por hora do dia</h3>
        <div data-hkroot data-hktot="${prodTotal(hourItems)}" data-hkfmt="dur">${prodColsHTML(hourItems)}${prodLegendHTML(PROD_KEYS, hourItems)}</div>
        <div class="small muted">Soma de todo o período em cada hora.</div>
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Por dia da semana</h3>
        <div data-hkroot data-hktot="${prodTotal(dowItems)}" data-hkfmt="dur">${prodColsHTML(dowItems)}${prodLegendHTML(PROD_KEYS, dowItems, true)}</div>
        <div class="small muted">Média por dia: o total de cada dia da semana dividido pelos dias que ele aparece no período.</div>
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Tempo por dia</h3>
        ${S.dayTable.length ? `<div class="usage-table-wrap"><table class="usage-table">
          <thead><tr><th>Dia</th><th>Produtivo</th><th>Distração</th><th>Ocioso</th><th>Blocos de foco</th><th>Maior bloco</th></tr></thead>
          <tbody>${dayRows}</tbody></table></div>
          <div class="small muted">Mostra os 10 dias mais recentes. Blocos de foco: pausas de até 1 min não quebram.</div>` : '<div class="muted small">Sem tempo no período.</div>'}
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Pausas que mais custam</h3>
        ${prodPausesHTML(C)}
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Tendência semanal</h3>
        ${weekItems.length ? `<div data-hkroot data-hktot="${prodTotal(weekItems)}" data-hkfmt="dur">${prodColsHTML(weekItems)}${prodLegendHTML(PROD_KEYS, weekItems)}</div>
        <div class="usage-table-wrap"><table class="usage-table">
          <thead><tr><th>Semana (segunda)</th><th>Produtivo</th><th>Distração</th><th>Ocioso</th><th>% produtivo</th></tr></thead>
          <tbody>${weekRows}</tbody></table></div>` : '<div class="muted small">Sem semanas no período.</div>'}
      </section>`;

  return {
    title: 'Relatório Produtividade',
    actions: `<select class="input sm" data-on="prod-period" aria-label="Período">${periods.map(([k, l]) => `<option value="${k}" ${PROD.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
    html: `<div class="stack" style="gap:14px">${body}${prodComparacoesHTML()}</div>`,
  };
};

CHANGES['prod-period'] = (el) => { PROD.period = el.value; render(); };

/* Comparações (análise da segunda, feitas aqui na hora): semana, mês, meses e trimestres. Sem dados = "sem dados". */
function prodMetrics(a, b) {
  const oldP = PROD.period, oldR = PROD.range;
  PROD.period = 'custom'; PROD.range = { a, b };
  try {
    const C = prodCollect(); const S = prodStats(C);
    const has = C.union.length > 0 || C.pauses.length > 0;
    return has ? { prod: S.tot.prod, dist: S.tot.dist, ocio: S.tot.ocio, pct: S.pctProd, base: S.base } : null;
  } finally { PROD.period = oldP; PROD.range = oldR; }
}
function prodComparacoesHTML() {
  const now = new Date();
  const first = (() => { let t = Infinity; db.all('tempo_time_entries').forEach(e => (e.segments || []).forEach(s => { if (s.s) t = Math.min(t, new Date(s.s).getTime()); })); return t === Infinity ? null : new Date(t); })();
  if (!first) return '<div class="panel"><div class="panel-b muted small">Comparações aparecem quando houver registro de trabalho.</div></div>';
  const Y = now.getFullYear(), M = now.getMonth();
  const semIni = prodPeriodRange('semana').a, semPrev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7).getTime();
  const mesIni = new Date(Y, M, 1).getTime(), mesPrevIni = new Date(Y, M - 1, 1).getTime();
  const mesAnoPassadoIni = new Date(Y - 1, M, 1).getTime(), mesAnoPassadoFim = new Date(Y - 1, M + 1, 1).getTime();
  const anoIni = new Date(Y, 0, 1).getTime();
  const SEM = 7 * 864e5, nowT = now.getTime();
  const semana = prodMetrics(semIni, nowT), semanaPrev = prodMetrics(semPrev, semIni);
  const mes = prodMetrics(mesIni, nowT), mesPrev = prodMetrics(mesPrevIni, mesIni), mesAA = prodMetrics(mesAnoPassadoIni, mesAnoPassadoFim);
  const ano = prodMetrics(anoIni, nowT);
  const tudo = prodMetrics(first.getTime(), nowT);
  const semanasNoMes = Math.max(1, Math.ceil((nowT - mesIni) / SEM));
  const semanasNoAno = Math.max(1, Math.ceil((nowT - anoIni) / SEM));
  const semanasDesdeInicio = Math.max(1, Math.ceil((nowT - first.getTime()) / SEM));
  const mesesDesdeInicio = Math.max(1, (Y - first.getFullYear()) * 12 + (M - first.getMonth()) + 1);
  const H = (ms) => (ms == null ? 'sem dados' : fmtDur(ms));
  const P = (v) => (v == null ? 'sem dados' : Math.round(v) + '%');
  const dH = (cur, ref) => (cur == null || ref == null ? '—' : `${cur - ref >= 0 ? '+' : '−'}${fmtDur(Math.abs(cur - ref))}`);
  const dP = (cur, ref) => (cur == null || ref == null ? '—' : `${cur - ref >= 0 ? '+' : '−'}${Math.abs(Math.round(cur - ref))} pp`);
  const row = (lab, val, pct, ref, dh, dp) => `<tr><td>${lab}</td><td class="mono">${val}</td><td class="mono">${pct}</td><td class="mono">${ref}</td><td class="mono">${dh}</td><td class="mono">${dp}</td></tr>`;
  const cabec = '<thead><tr><th>Comparação</th><th>Horas líquidas</th><th>% produtivo</th><th>Referência (horas)</th><th>Δ horas</th><th>Δ % produtivo</th></tr></thead>';
  const semanaMedMes = mes ? mes.prod / semanasNoMes : null, semanaMedAno = ano ? ano.prod / semanasNoAno : null, semanaMedTudo = tudo ? tudo.prod / semanasDesdeInicio : null;
  const semTab = `<table class="tbl">${cabec}<tbody>
    ${row('<b>Semana</b> até agora', H(semana?.prod), P(semana?.pct), '', '', '')}
    ${row('↳ contra a semana anterior', H(semanaPrev?.prod), P(semanaPrev?.pct), H(semanaPrev?.prod), dH(semana?.prod, semanaPrev?.prod), dP(semana?.pct, semanaPrev?.pct))}
    ${row('↳ contra a média semanal do mês', H(semanaMedMes), '', H(semanaMedMes), dH(semana?.prod, semanaMedMes), '—')}
    ${row('↳ contra a média semanal do ano', H(semanaMedAno), '', H(semanaMedAno), dH(semana?.prod, semanaMedAno), '—')}
    ${row('↳ contra a média semanal de sempre', H(semanaMedTudo), '', H(semanaMedTudo), dH(semana?.prod, semanaMedTudo), '—')}
  </tbody></table>`;
  const mesTab = `<table class="tbl">${cabec}<tbody>
    ${row('<b>Mês</b> até agora', H(mes?.prod), P(mes?.pct), '', '', '')}
    ${row('↳ contra o mês passado', H(mesPrev?.prod), P(mesPrev?.pct), H(mesPrev?.prod), dH(mes?.prod, mesPrev?.prod), dP(mes?.pct, mesPrev?.pct))}
    ${row('↳ contra o mesmo mês do ano passado', H(mesAA?.prod), P(mesAA?.pct), H(mesAA?.prod), dH(mes?.prod, mesAA?.prod), dP(mes?.pct, mesAA?.pct))}
    ${row('↳ contra a média mensal de sempre', H(tudo ? tudo.prod / mesesDesdeInicio : null), P(tudo?.pct), H(tudo ? tudo.prod / mesesDesdeInicio : null), dH(mes?.prod, tudo ? tudo.prod / mesesDesdeInicio : null), '—')}
  </tbody></table>`;
  // meses entre si (últimos 12, só os com dados)
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Y, M - i, 1); const r = prodMetrics(d.getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime());
    if (r) meses.push({ d, r });
  }
  const mesesTab = meses.length ? `<table class="tbl"><thead><tr><th>Mês</th><th>Horas líquidas</th><th>% produtivo</th><th>Distração</th></tr></thead><tbody>${meses.map(x => `<tr><td>${x.d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</td><td class="mono">${fmtDur(x.r.prod)}</td><td class="mono">${Math.round(x.r.pct)}%</td><td class="mono">${fmtDur(x.r.dist)}</td></tr>`).join('')}</tbody></table>` : '<span class="muted small">Sem meses com dados.</span>';
  // trimestres: este ano e o mesmo trimestre do ano passado
  const tri = (ano0, q) => { const a = new Date(ano0, q * 3, 1).getTime(), b = new Date(ano0, q * 3 + 3, 1).getTime(); return prodMetrics(a, Math.min(b, nowT) > a ? Math.min(b, nowT) : b); };
  const trimLinhas = [0, 1, 2, 3].map(q => {
    const at = tri(Y, q), pa = tri(Y - 1, q);
    if (!at && !pa) return null;
    return `<tr><td>T${q + 1} ${Y}</td><td class="mono">${H(at?.prod)}</td><td class="mono">${P(at?.pct)}</td><td class="mono">T${q + 1} ${Y - 1}: ${H(pa?.prod)} · ${P(pa?.pct)}</td><td class="mono">${at && pa ? dH(at.prod, pa.prod) : '—'}</td></tr>`;
  }).filter(Boolean).join('');
  const trimTab = trimLinhas ? `<table class="tbl"><thead><tr><th>Trimestre</th><th>Horas líquidas</th><th>% produtivo</th><th>Mesmo trimestre do ano passado</th><th>Δ horas</th></tr></thead><tbody>${trimLinhas}</tbody></table>` : '<span class="muted small">Sem trimestres com dados.</span>';
  // análise geral (texto automático, com os números)
  const frases = [];
  if (semana && semanaPrev) frases.push(`Semana: ${fmtDur(semana.prod)} líquidas, ${dP(semana.pct, semanaPrev.pct)} de % produtivo contra a semana anterior.`);
  if (mes && mesPrev) frases.push(`Mês: ${fmtDur(mes.prod)} líquidas até agora, ${dP(mes.pct, mesPrev.pct)} de % produtivo contra o mês passado.`);
  if (mes && mesAA) frases.push(`Contra o mesmo mês do ano passado: ${dH(mes.prod, mesAA.prod)} de horas líquidas.`);
  else frases.push('Mesmo mês do ano passado: sem dados ainda (o histórico começa em 17/10/2026).');
  return `<section class="panel"><div class="panel-h"><h3>Comparações</h3><span class="small muted">média = total ÷ períodos decorridos desde o primeiro registro</span></div><div class="panel-b stack">
    <span class="lbl">Semana</span>${semTab}
    <span class="lbl">Mês</span>${mesTab}
    <span class="lbl">Meses entre si (últimos 12)</span>${mesesTab}
    <span class="lbl">Trimestres (este ano e ano passado)</span>${trimTab}
    <span class="lbl">Análise geral</span><div class="small">${frases.map(f => `<div>${esc(f)}</div>`).join('')}</div>
  </div></section>`;
}
