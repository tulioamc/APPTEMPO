/* Relatório Produtividade: quando e como você trabalha. Usa o bruto de todas as sessões (sem contar duas vezes)
   e as pausas já corrigidas (pauseGapsOf). Três tipos de tempo:
   - Produtivo (verde claro): trabalho no computador.
   - Distração (vermelho claro): WhatsApp, Telegram e Instagram.
   - Ocioso (amarelo): todas as demais pausas (sem motivo, página parada, intervalo manual, computador fechado ou dormindo).
   Ocioso = fora do computador (almoço, trânsito, buscar o Rafa): NÃO é "não produtivo". Não produtivo é só distração.
   Por isso o % produtivo é produtivo ÷ (produtivo + distração); o ócio aparece à parte, sem entrar na conta. */
const PROD = { period: '30d' };
const PROD_GAP = 60e3; /* blocos de foco: pausas de até 1 min não quebram o foco; acima disso, a pausa corta o bloco */
const PROD_DOW = [1, 2, 3, 4, 5, 6, 0]; /* segunda primeiro */
const PROD_DOW_LBL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PROD_NAME = { prod: "Produtivo", dist: "Distração", ocio: "Ocioso" };
const PROD_COLOR = { prod: "#9FD6AE", dist: "#EFAFAF", ocio: "#EED9A0" };   /* tons pastel (mesmas das barras) */
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
  // produtivo = só os intervalos trabalhados (pausa nunca é trabalho); a união evita contar o mesmo horário duas vezes
  all.forEach(e => (e.segments || []).forEach(x => { if (!x.s) return; const c = clip(new Date(x.s).getTime(), x.e ? new Date(x.e).getTime() : Date.now()); if (c) work.push(c); }));
  work.sort((x, y) => x[0] - y[0]);
  const union = prodMerge(work, 0);
  // pausa em rotina ou compromisso do Calendário não entra (nem distração nem ócio)
  const pauses = pauseGapsOf(all).flatMap(g => {
    const c = clip(new Date(g.s).getTime(), new Date(g.e).getTime());
    return c ? prodSemFora(c[0], c[1]).map(([x, y]) => ({ s: x, e: y, why: g.why || null })) : [];
  });
  return { a, b, union, pauses };
}
/* Classe de cada pausa: distração (apps de conversa/redes) ou ocioso (o resto). */
function prodPauseCls(why) {
  const w = String(why || '').trim().toLowerCase();
  if (/servi[cç]os/.test(w)) return "ocio";   // WhatsApp com Serviços (plano, seguro, terapias…): não é distração
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
  const base = tot.prod + tot.dist; /* ócio fica fora: é tempo fora do computador, não é não produtivo */
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
  // média por dia da semana: divide só pelos dias com registro (antes do histórico começar não conta)
  const dowDays = [0, 0, 0, 0, 0, 0, 0];
  dt.forEach((r, key) => { if (r.prod + r.dist + r.ocio > 0) dowDays[new Date(key).getDay()]++; });
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
/* Rótulo da coluna: produtivo em tempo e % produtivo (produtivo ÷ produtivo + distração; ócio fora). */
function prodVal(prod, dist, ocio) {
  const b = prod + dist;
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
    const bp = (by.prod || 0) + (by.dist || 0); /* % só sobre produtivo + distração; ócio (fora do computador) sem % */
    const rows = PROD_KEYS.map(k => `<div class="prod-tip-row"><i style="background:${PROD_COLOR[k]}"></i>${PROD_NAME[k]}<b class="mono">${k === 'ocio' ? 'fora' : usePctTxt(bp > 0 ? (by[k] || 0) / bp * 100 : 0)}</b><span class="mono muted">${fmtDur(by[k] || 0)}</span></div>`).join('');
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
    { id: 'prod', nome: '70% produtivo', hint: 'produtivo ÷ (produtivo + distração); ócio fora', alvo: 70, pct: true, sobe: true, valor: (S) => S.pctProd },
    { id: 'horas', nome: '30 h líquidas na semana', hint: 'tempo produtivo somado', alvo: 30 * 36e5, sobe: true, valor: (S) => S.tot.prod },
    { id: 'dist', nome: 'Distração até 5 h', hint: 'WhatsApp, Telegram e Instagram (limite)', alvo: 5 * 36e5, sobe: false, valor: (S) => S.tot.dist },
  ],
  mes: [
    { id: 'prod', nome: '70% produtivo', hint: 'produtivo ÷ (produtivo + distração); ócio fora', alvo: 70, pct: true, sobe: true, valor: (S) => S.pctProd },
    { id: 'horas', nome: '120 h líquidas no mês', hint: 'tempo produtivo somado', alvo: 120 * 36e5, sobe: true, valor: (S) => S.tot.prod },
    { id: 'dist', nome: 'Distração até 20 h', hint: 'WhatsApp, Telegram e Instagram (limite)', alvo: 20 * 36e5, sobe: false, valor: (S) => S.tot.dist },
    { id: 'projeto', nome: '1 projeto novo no portfólio', hint: 'projetos criados no mês', alvo: 1, sobe: true, inicio: '2026-11', valor: () => db.all('tempo_projects').filter(p => !p.archived && new Date(p.created_at).getTime() >= prodPeriodRange('mes').a).length },
  ],
};
/* Desafios: um por período, na ordem da lista (semana 1 = primeiro, semana 2 = segundo...). */
const PROD_DESAFIOS = [
  { id: 'janela', nome: '1 h de trabalho com no máximo 5 pausas', hint: 'pausas de até 1 min dentro de um bloco, contadas até completar 1 h', alvo: 5, cont: true, sobe: false, valor: (S, C) => prodJanelaHora(C) },
  { id: 'bloco2', nome: 'Bloco de foco de 2 h', hint: 'maior bloco de foco do período', alvo: 2 * 36e5, sobe: true, valor: (S) => S.longest },
  { id: 'pausa10', nome: 'Pausa de até 10% do tempo', hint: 'distração ÷ (produtivo + distração); ócio (fora do computador) não conta', alvo: 10, pct: true, sobe: false, valor: (S) => (S.base > 0 ? S.tot.dist / S.base * 100 : 0) },
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
  const weekPct = (r) => { const b = r.prod + r.dist; return b > 0 ? r.prod / b * 100 : 0; };
  const weekItems = weeks.map(([k, r]) => {
    const d = new Date(k);
    return {
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      val: weeks.length <= 12 ? prodVal(r.prod, r.dist, r.ocio) : '',
      parts: PROD_KEYS.map(kk => ({ cls: kk, ms: r[kk] })),
      head: `Semana de ${d.toLocaleDateString('pt-BR')}`,
    };
  });
  const dayRows = S.dayTable.slice(0, 10).map(d => `<tr><td>${esc(new Date(d.key).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</td><td class="mono small">${fmtDur(d.prod)}</td><td class="mono small">${fmtDur(d.dist)}</td><td class="mono small">${fmtDur(d.ocio)}</td><td class="mono small">${d.n}</td><td class="mono small">${fmtDur(d.max)}</td></tr>`).join('');
  const periods = [['mes', 'Mês atual'], ['30d', 'Últimos 30 dias'], ['tudo', 'Tudo']];

  const body = !hasData
    ? '<div class="muted small">Sem registro de trabalho no período escolhido.</div>'
    : `<div class="kpi-row">
        <div class="kpi" data-tip="${esc(`Produtivo ${fmtDur(S.tot.prod)}\nSó trabalho: as pausas ficam fora.\nMédia por dia com registro: ${fmtDur(S.tot.prod / Math.max(1, S.dayTable.length))}\nDistração ${fmtDur(S.tot.dist)} · ocioso ${fmtDur(S.tot.ocio)}`)}"><span class="k">Produtivo</span><span class="v mono">${fmtDur(S.tot.prod)}</span><span class="s">só trabalho, sem pausas e sem contar duplicado</span></div>
        <div class="kpi" data-tip="${esc(`${usePctTxt(S.pctProd)} produtivo\nBase ${fmtDur(S.base)}: produtivo ${fmtDur(S.tot.prod)} + distração ${fmtDur(S.tot.dist)}\nOcioso ${fmtDur(S.tot.ocio)} fica fora: é tempo fora do computador (almoço, trânsito, buscar o Rafa)`)}"><span class="k">% produtivo</span><span class="v mono">${usePctTxt(S.pctProd)}</span><span class="s">produtivo ÷ (produtivo + distração) · ócio fora</span></div>
        <div class="kpi" data-tip="${esc(`Maior bloco ${fmtDur(S.longest)}\nTrabalho contínuo; uma pausa de mais de 1 min encerra o bloco.\nMédia do maior bloco por dia: ${fmtDur(S.longestPerDay)}`)}"><span class="k">Maior bloco de foco</span><span class="v mono">${fmtDur(S.longest)}</span><span class="s">pausas de até 1 min não quebram</span></div>
        <div class="kpi" data-tip="${esc(`${S.blocks.length} blocos em ${S.days.length} dia(s)\nBloco = trabalho contínuo sem pausa de mais de 1 min.`)}"><span class="k">Blocos por dia</span><span class="v mono">${S.blocksPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span><span class="s">${S.blocks.length} bloco(s) em ${S.days.length} dia(s)</span></div>
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
` : '<div class="muted small">Sem semanas no período.</div>'}
      </section>`;

  return {
    title: 'Produtividade',
    actions: `<select class="input sm" data-on="prod-period" aria-label="Período">${periods.map(([k, l]) => `<option value="${k}" ${PROD.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
    html: `<div class="stack" style="gap:14px">${body}${prodWhatsAppHTML()}${prodComparacoesHTML()}</div>`,
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
  const now = new Date(), nowT = now.getTime();
  const first = (() => { let t = Infinity; db.all('tempo_time_entries').forEach(e => (e.segments || []).forEach(s => { if (s.s) t = Math.min(t, new Date(s.s).getTime()); })); return t === Infinity ? null : new Date(t); })();
  if (!first) return '<div class="panel"><div class="panel-b muted small">Comparações aparecem quando houver registro de trabalho.</div></div>';
  const Y = now.getFullYear(), M = now.getMonth();
  const semIni = prodPeriodRange('semana').a, SEM = 7 * 864e5;
  const semPrevIni = semIni - SEM, decSem = nowT - semIni;
  const mesIni = new Date(Y, M, 1).getTime(), mesPrevIni = new Date(Y, M - 1, 1).getTime();
  // mesmo ponto do mês passado: mesmo dia e hora (limitado ao fim daquele mês)
  const mesPrevPonto = Math.min(mesPrevIni + (nowT - mesIni), mesIni);
  const semana = prodMetrics(semIni, nowT), semPonto = prodMetrics(semPrevIni, semPrevIni + decSem), semInteira = prodMetrics(semPrevIni, semIni);
  const mes = prodMetrics(mesIni, nowT), mesPonto = prodMetrics(mesPrevIni, mesPrevPonto), mesInteiro = prodMetrics(mesPrevIni, mesIni);
  const mesAA = prodMetrics(new Date(Y - 1, M, 1).getTime(), new Date(Y - 1, M + 1, 1).getTime());
  const tudo = prodMetrics(first.getTime(), nowT);
  // médias sem contar os dias de férias (não entram nas médias)
  let diasAtivos = 0; for (let d = new Date(first); d.getTime() <= nowT; d.setDate(d.getDate() + 1)) if (!(typeof emFerias === 'function' && emFerias(ymd(d)))) diasAtivos++;
  const semMedia = tudo && diasAtivos >= 7 ? tudo.prod / (diasAtivos / 7) : null;
  const mesMedia = tudo && diasAtivos >= 28 ? tudo.prod / (diasAtivos / 30.44) : null;
  const H = (ms) => (ms == null ? '—' : fmtDur(ms));
  const delta = (cur, ref, tipo = 'h') => {
    if (cur == null || ref == null) return '<span class="cmp-d muted">sem dados</span>';
    const d = cur - ref; if (tipo === 'h' && Math.abs(d) < 60e3 || tipo === 'p' && Math.abs(d) < 1) return '<span class="cmp-d">igual</span>';
    const txt = tipo === 'h' ? fmtDur(Math.abs(d)) : `${Math.abs(Math.round(d))} pontos`;
    return `<span class="cmp-d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${d > 0 ? 'mais' : 'menos'} ${txt}</span>`;
  };
  const linha = (rot, ref, dica) => `<div class="cmp-row" data-tip="${esc(dica)}"><span>${rot}</span><span class="mono">${H(ref?.prod ?? ref)}</span>${delta(cardCur, ref?.prod ?? ref)}</div>`;
  let cardCur = null;
  const card = (titulo, cur, linhas) => { cardCur = cur?.prod ?? null;
    return `<div class="cmp-card"><div class="cmp-head"><span class="small muted">${titulo}</span><b>${H(cur?.prod)}</b><span class="small" data-tip="Do tempo com sessão aberta, quanto foi trabalho no computador. Do tempo no computador, quanto foi trabalho: o resto foi distração. Ócio (fora do computador) não entra.">${cur ? Math.round(cur.pct) + '% produtivo' : ''}</span></div>${linhas.map(l => linha(...l)).join('')}</div>`; };
  const semCard = card('Esta semana, até agora', semana, [
    ['Semana passada, até o mesmo ponto', semPonto, 'Mesmo dia da semana e mesma hora: comparação justa com uma semana que ainda não acabou'],
    ['Semana passada inteira', semInteira, 'De segunda a domingo'],
    ['Sua semana média', semMedia, `Total trabalhado ÷ semanas desde ${fmtDate(ymd(first))}, sem contar férias`],
  ]);
  const mesCard = card('Este mês, até agora', mes, [
    ['Mês passado, até o mesmo dia', mesPonto, 'Do dia 1 até o mesmo dia e hora do mês passado'],
    ['Mês passado inteiro', mesInteiro, 'O mês passado completo'],
    ['Seu mês médio', mesMedia, `Total trabalhado ÷ meses desde ${fmtDate(ymd(first))}, sem contar férias`],
    ['Mesmo mês do ano passado', mesAA, 'Mesmo mês, um ano antes'],
  ]);
  // em palavras, para ler rápido
  const frases = [];
  const comp = (a, b) => a == null || b == null ? null : (Math.abs(a - b) < 60e3 ? 'o mesmo que' : `${fmtDur(Math.abs(a - b))} ${a > b ? 'a mais que' : 'a menos que'}`);
  if (semana) {
    const c = comp(semana.prod, semPonto?.prod);
    frases.push(c ? `Esta semana você trabalhou <b>${fmtDur(semana.prod)}</b>, ${c} no mesmo ponto da semana passada (${fmtDur(semPonto.prod)}).` : `Esta semana você trabalhou <b>${fmtDur(semana.prod)}</b>. Ainda não há semana passada para comparar.`);
    if (semPonto && semPonto.base > 0) {
      const d = semana.pct - semPonto.pct;
      frases.push(`Do tempo no computador, <b>${Math.round(semana.pct)}%</b> foi trabalho de verdade (semana passada: ${Math.round(semPonto.pct)}%). ${d <= -5 ? 'Teve mais distração que na semana passada.' : d >= 5 ? 'Teve menos distração que na semana passada.' : 'Parecido com a semana passada.'}`);
    }
  }
  if (mes) { const c = comp(mes.prod, mesPonto?.prod); frases.push(c ? `No mês, <b>${fmtDur(mes.prod)}</b> até agora: ${c} no mesmo dia do mês passado.` : `No mês, <b>${fmtDur(mes.prod)}</b> até agora.`); }
  if (semMedia != null && semana) frases.push(`Uma semana sua costuma ter <b>${fmtDur(semMedia)}</b> de trabalho (sem contar férias).`);
  if (!mesAA) { const um = new Date(first.getFullYear() + 1, first.getMonth(), 1); frases.push(`A comparação com o ano passado começa em ${um.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}, quando houver um ano de histórico.`); }
  // meses lado a lado (últimos 12 com dados)
  const meses = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(Y, M - i, 1); const r = prodMetrics(d.getTime(), Math.min(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), nowT)); if (r) meses.push({ d, r, atual: i === 0 }); }
  const maxM = Math.max(1, ...meses.map(x => x.r.prod));
  const mesesHTML = meses.length > 1 ? `<div class="cmp-sub">Mês a mês</div><div class="cmp-meses">${meses.map(x => `<div class="cmp-mes" data-tip="${esc(`${x.d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}${x.atual ? ' (até agora)' : ''}\n${fmtDur(x.r.prod)} de trabalho · ${Math.round(x.r.pct)}% produtivo\nDistração ${fmtDur(x.r.dist)}`)}"><span class="mono small">${fmtDur(x.r.prod)}</span><div class="cmp-mes-bar"><span style="height:${Math.round(x.r.prod / maxM * 100)}%;background:${PROD_COLOR.prod}${x.atual ? ';opacity:.6' : ''}"></span></div><span class="small muted">${x.d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span><span class="small">${Math.round(x.r.pct)}%</span></div>`).join('')}</div>` : '';
  return `<section class="panel"><div class="panel-h"><h3>Comparações</h3><span class="small muted">horas = trabalho no computador, sem pausas</span></div><div class="panel-b stack" style="gap:16px">
    <div class="cmp-resumo">${frases.map(f => `<p>${f}</p>`).join('')}</div>
    <div class="cmp-grid">${semCard}${mesCard}</div>
    ${mesesHTML}
  </div></section>`;
}

/* Trechos de [a, b] que caem em rotina fixa ou compromisso do Calendário (unidos, sem repetir horário). */
function prodForaIntervalos(a, b) {
  if (typeof planoFixosDoDia !== 'function' || !(b > a)) return [];
  const iv = [];
  for (let d = new Date(a); d.getTime() < b; d = new Date(new Date(ymd(d) + 'T00:00:00').getTime() + 864e5 + 3600e3)) {
    const dia = ymd(d), base = new Date(dia + 'T00:00:00').getTime();
    planoFixosDoDia(dia).forEach(f => iv.push([base + f[0] * 36e5, base + f[1] * 36e5]));
    (typeof planoEventos === 'function' ? planoEventos(dia, true) : []).filter(e => !e.diaTodo && e.origem !== 'todo' && e.ocupa !== false).forEach(e => iv.push([base + e.ini * 36e5, base + e.fim * 36e5]));
  }
  const cl = iv.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]);
  const un = []; cl.forEach(([x, y]) => { const l = un[un.length - 1]; if (l && x <= l[1]) l[1] = Math.max(l[1], y); else un.push([x, y]); });
  return un;
}
const prodForaDoTrabalho = (a, b) => prodForaIntervalos(a, b).reduce((t, [x, y]) => t + (y - x), 0);
/* [a, b] sem os trechos de rotina/compromisso (pedaços que sobram). */
function prodSemFora(a, b) {
  const out = []; let c = a;
  prodForaIntervalos(a, b).forEach(([x, y]) => { if (x > c) out.push([c, x]); c = Math.max(c, y); });
  if (b > c) out.push([c, b]);
  return out;
}
/* Barrinha de produtividade de um conjunto de sessões (janela da sessão e Resumo): produtivo, distração e ocioso,
   em tempo e % — mesma conta do Relatório Produtividade (pausa nunca é trabalho). */
function prodOfEntries(entries, at = Date.now()) {
  const work = entries.flatMap(e => (e.segments || []).filter(x => x.s).map(x => [new Date(x.s).getTime(), x.e ? new Date(x.e).getTime() : at])).filter(([a, b]) => b > a);
  const r = { prod: unionMs(work), dist: 0, ocio: 0 };
  // pausa que cai em rotina ou compromisso do Calendário (buscar o Rafa, almoço, reunião fora…) não conta como
  // distração nem ócio: você não estava trabalhando por um motivo marcado. Vai para "fora" (fora da base).
  r.fora = 0;
  pauseGapsOf(entries, at).forEach(g => {
    const a = new Date(g.s).getTime(), b = new Date(g.e).getTime(); const fora = prodForaDoTrabalho(a, b);
    r[prodPauseCls(g.why)] += (b - a) - fora; r.fora += fora;
  });
  r.base = r.prod + r.dist; /* ócio (fora do computador) não entra na base */
  return r;
}
function prodMiniHTML(entries) {
  const r = prodOfEntries(entries); if (!r.base && !r.ocio) return '';
  // barra = produtivo × distração (não produtivo); ócio é fora do computador e aparece à parte, sem %
  const pct = (k) => r.base ? r[k] / r.base * 100 : 0;
  const DESC = { prod: 'Trabalho no computador, sem pausas.', dist: 'Não produtivo: pausas em WhatsApp (amigos), Telegram e Instagram.', ocio: 'Fora do computador: parado, tela bloqueada, Mac dormindo ou pausa manual (almoço, trânsito…), e WhatsApp com Serviços. Não conta como não produtivo.' };
  const tip = (k) => k === 'ocio' ? `${PROD_NAME[k]} ${fmtDur(r[k])}\n${DESC[k]}` : `${PROD_NAME[k]} ${fmtDur(r[k])} · ${usePctTxt(pct(k))}\n${DESC[k]}\nBase: ${fmtDur(r.base)} (produtivo + distração; ócio fora)`;
  const bar = ['prod', 'dist'].filter(k => r[k] > 0).map(k => `<span class="pm-seg" data-hk="${k}" data-tip="${esc(tip(k))}" style="width:${pct(k).toFixed(2)}%;background:${PROD_COLOR[k]}"></span>`).join('');
  const txt = ['prod', 'dist'].map(k => `<span class="pm-lbl" data-hk="${k}" data-tip="${esc(tip(k))}"><i style="background:${PROD_COLOR[k]}"></i>${PROD_NAME[k]} <b class="mono">${fmtDur(r[k])}</b> <span class="mono muted">${Math.round(pct(k))}%</span></span>`).join('')
    + (r.ocio > 0 ? `<span class="pm-lbl" data-tip="${esc(tip('ocio'))}"><i style="background:${PROD_COLOR.ocio}"></i>${PROD_NAME.ocio} <b class="mono">${fmtDur(r.ocio)}</b> <span class="muted small">fora do computador</span></span>` : '');
  const fora = r.fora > 60e3 ? `<span class="pm-lbl" data-tip="${esc('Pausas que caíram em rotina ou compromisso do Calendário (buscar o Rafa, almoço, reunião…). Não contam como distração nem ócio.')}"><i style="background:transparent;border:1px dashed var(--line-strong)"></i>Rotina/compromisso <b class="mono">${fmtDur(r.fora)}</b></span>` : '';
  return `<div class="pm-wrap" data-hkroot="1">${bar ? `<div class="pm-bar">${bar}</div>` : ''}<div class="pm-txt">${txt}${fora}</div></div>`;
}

/* WhatsApp no período escolhido (registro do Mac: conversa aberta em primeiro plano).
   Ranking de pessoas e grupos, trabalho × amigos por dia, horários e clientes que mais chamam. */
function prodWhatsAppDados() {
  const { a, b } = prodRange();
  const pessoas = {}, dias = {}, horas = Array(24).fill(0);
  (db.data.tempo_settings || []).forEach(r => {
    if (!String(r.key || '').startsWith('actlog:') || !Array.isArray(r.value)) return;
    r.value.forEach(x => {
      if (!/whatsapp/i.test(String(x.app || ''))) return;
      const f = new Date(x.from).getTime(), t = new Date(x.to).getTime();
      const ini = Math.max(f, a), fim = Math.min(t, b); if (!(fim > ini)) return;
      const ms = fim - ini; const c = waContato(x.doc); const trab = waEhTrabalho(c);
      const k = String(x.doc || '(sem conversa)').trim();
      (pessoas[k] ||= { nome: k, c, ms: 0 }).ms += ms;
      const d = ymd(ini); (dias[d] ||= { trab: 0, amigo: 0 })[trab ? 'trab' : 'amigo'] += ms;
      horas[new Date(ini).getHours()] += ms;
    });
  });
  return { pessoas: Object.values(pessoas).sort((p, q) => q.ms - p.ms), dias, horas };
}
function prodWhatsAppHTML() {
  const d = prodWhatsAppDados(); if (!d.pessoas.length) return '';
  const tot = d.pessoas.reduce((s2, p) => s2 + p.ms, 0);
  const trab = Object.values(d.dias).reduce((s2, x) => s2 + x.trab, 0);
  const max = Math.max(1, ...d.pessoas.slice(0, 12).map(p => p.ms));
  const chip = (c) => { const o = c?.tipo_id ? db.get('tempo_status_options', c.tipo_id) : null; return o ? tag(o.name, o.color, { pill: true }) : '<span class="faint small">Amigo</span>'; };
  const diasK = Object.keys(d.dias).sort().slice(-14);
  const maxD = Math.max(1, ...diasK.map(k => d.dias[k].trab + d.dias[k].amigo));
  const maxH = Math.max(1, ...d.horas);
  const clientes = {}; d.pessoas.filter(p => waEhTrabalho(p.c)).forEach(p => { const cl = p.c.client_id ? db.get('tempo_clients', p.c.client_id) : p.c.agency_id ? db.get('tempo_agencies', p.c.agency_id) : null; const k = cl?.name || p.nome; clientes[k] = (clientes[k] || 0) + p.ms; });
  const topCli = Object.entries(clientes).sort((x, y) => y[1] - x[1]).slice(0, 5);
  return `<section class="panel"><div class="panel-h"><h3>WhatsApp</h3><span class="small muted">no período: ${fmtDur(tot)} · trabalho ${fmtDur(trab)} (${Math.round(trab / tot * 100)}%) · amigos ${fmtDur(tot - trab)}</span></div><div class="panel-b grid2" style="align-items:start;gap:18px">
    <div><div class="lbl" style="margin-bottom:6px">Com quem</div><div class="bars">${d.pessoas.slice(0, 12).map(p => `<div class="bar-row"><span class="lab">${esc(p.nome)} ${chip(p.c)}</span><div class="bar-track"><div class="bar-fill" style="width:${(p.ms / max * 100).toFixed(1)}%;background:${waEhTrabalho(p.c) ? '#47BD86' : '#6cf1ae'}"></div></div><span class="mono small">${fmtDur(p.ms)}</span></div>`).join('')}</div></div>
    <div class="stack" style="gap:14px">
      <div><div class="lbl" style="margin-bottom:6px">Por dia (trabalho × amigos)</div><div class="wa-dias">${diasK.map(k => { const x = d.dias[k]; return `<div class="wa-dia" data-tip="${esc(`${fmtDate(k)}\nTrabalho ${fmtDur(x.trab)} · amigos ${fmtDur(x.amigo)}`)}"><div class="wa-col"><span style="height:${(x.amigo / maxD * 100).toFixed(1)}%;background:#6cf1ae"></span><span style="height:${(x.trab / maxD * 100).toFixed(1)}%;background:#47BD86"></span></div><span class="small faint">${k.slice(8)}</span></div>`; }).join('')}</div></div>
      <div><div class="lbl" style="margin-bottom:6px">Horários</div><div class="wa-dias">${d.horas.map((ms, h) => `<div class="wa-dia" data-tip="${String(h).padStart(2, '0')}h · ${fmtDur(ms)}"><div class="wa-col"><span style="height:${(ms / maxH * 100).toFixed(1)}%;background:#47BD86;opacity:.7"></span></div><span class="small faint">${h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span></div>`).join('')}</div></div>
      ${topCli.length ? `<div><div class="lbl" style="margin-bottom:6px">Clientes que mais chamam</div>${topCli.map(([n, ms]) => `<div class="row between small"><span>${esc(n)}</span><span class="mono">${fmtDur(ms)}</span></div>`).join('')}</div>` : ''}
    </div>
  </div></section>`;
}
