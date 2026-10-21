/* Relatório Produtividade: quando e como você trabalha. Usa o bruto de todas as sessões (sem contar duas vezes)
   e as pausas já corrigidas (pauseGapsOf). Quatro tipos de tempo:
   - Produtivo (verde claro): trabalho no computador.
   - Distração (vermelho claro): WhatsApp, Telegram e Instagram.
   - Ocioso (amarelo): as demais pausas no computador (sem motivo, página parada, intervalo manual).
   - Descanso (cinza): fora do computador (computador fechado/dormiu, ou ocioso de mouse e teclado). */
const PROD = { period: '30d' };
const PROD_GAP = 3 * 60e3; /* blocos de foco: pausas de até 3 min não quebram o foco */
const PROD_DOW = [1, 2, 3, 4, 5, 6, 0]; /* segunda primeiro */
const PROD_DOW_LBL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PROD_NAME = { prod: 'Produtivo', dist: 'Distração', ocio: 'Ocioso', descanso: 'Descanso (fora do computador)' };
const PROD_COLOR = { prod: '#4ADE80', dist: '#F87171', ocio: '#FACC15', descanso: '#CBD5E1' };
const PROD_CLS = { prod: 'prod-p', dist: 'prod-d', ocio: 'prod-y', descanso: 'prod-z' };
const PROD_KEYS = ['prod', 'dist', 'ocio', 'descanso'];
const PROD_TYPE = { dist: 'Distração', ocio: 'Ocioso', descanso: 'Descanso' };

function prodRange() {
  const now = Date.now();
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
/* Classe de cada pausa: descanso (fora do computador), distração (apps de conversa/redes) ou ocioso (o resto). */
function prodPauseCls(why) {
  const w = String(why || '').trim().toLowerCase();
  if (w === 'sono' || w === 'mac') return 'descanso';
  const k = pauseKind(why);
  if (k === 'whatsapp' || k === 'telegram' || k === 'instagram') return 'dist';
  return 'ocio';
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
function prodZero() { return { prod: 0, dist: 0, ocio: 0, descanso: 0 }; }
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
  const base = tot.prod + tot.dist + tot.ocio; /* descanso fica fora da base: não é tempo no computador */
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
  /* Empilhamento de baixo para cima: produtivo, ocioso, distração, descanso (a ordem do DOM vai de cima para baixo). */
  const ORDER = ['descanso', 'ocio', 'dist', 'prod'];
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
    `<tr><td>${esc(new Date(k).toLocaleDateString('pt-BR'))}</td><td class="mono small">${fmtDur(r.prod)}</td><td class="mono small">${fmtDur(r.dist)}</td><td class="mono small">${fmtDur(r.ocio)}</td><td class="mono small">${fmtDur(r.descanso)}</td><td class="mono small">${usePctTxt(weekPct(r))}</td></tr>`).join('');
  const dayRows = S.dayTable.slice(0, 10).map(d => `<tr><td>${esc(new Date(d.key).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</td><td class="mono small">${fmtDur(d.prod)}</td><td class="mono small">${fmtDur(d.dist)}</td><td class="mono small">${fmtDur(d.ocio)}</td><td class="mono small">${fmtDur(d.descanso)}</td><td class="mono small">${d.n}</td><td class="mono small">${fmtDur(d.max)}</td></tr>`).join('');
  const periods = [['mes', 'Mês atual'], ['30d', 'Últimos 30 dias'], ['tudo', 'Tudo']];

  const body = !hasData
    ? '<div class="muted small">Sem registro de trabalho no período escolhido.</div>'
    : `<div class="kpi-row">
        <div class="kpi"><span class="k">Produtivo</span><span class="v mono">${fmtDur(S.tot.prod)}</span><span class="s">trabalho sem contar duplicado</span></div>
        <div class="kpi"><span class="k">% produtivo</span><span class="v mono">${usePctTxt(S.pctProd)}</span><span class="s">produtivo ÷ (produtivo + distração + ocioso), sem descanso</span></div>
        <div class="kpi"><span class="k">Maior bloco de foco</span><span class="v mono">${fmtDur(S.longest)}</span><span class="s">pausas de até 3 min não quebram</span></div>
        <div class="kpi"><span class="k">Blocos por dia</span><span class="v mono">${S.blocksPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span><span class="s">${S.blocks.length} bloco(s) em ${S.days.length} dia(s)</span></div>
        <div class="kpi"><span class="k">Descanso</span><span class="v mono">${fmtDur(S.tot.descanso)}</span><span class="s">fora do computador</span></div>
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
          <thead><tr><th>Dia</th><th>Produtivo</th><th>Distração</th><th>Ocioso</th><th>Descanso</th><th>Blocos de foco</th><th>Maior bloco</th></tr></thead>
          <tbody>${dayRows}</tbody></table></div>
          <div class="small muted">Mostra os 10 dias mais recentes. Blocos de foco: pausas de até 3 min não quebram.</div>` : '<div class="muted small">Sem tempo no período.</div>'}
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Pausas que mais custam</h3>
        ${prodPausesHTML(C)}
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Tendência semanal</h3>
        ${weekItems.length ? `<div data-hkroot data-hktot="${prodTotal(weekItems)}" data-hkfmt="dur">${prodColsHTML(weekItems)}${prodLegendHTML(PROD_KEYS, weekItems)}</div>
        <div class="usage-table-wrap"><table class="usage-table">
          <thead><tr><th>Semana (segunda)</th><th>Produtivo</th><th>Distração</th><th>Ocioso</th><th>Descanso</th><th>% produtivo</th></tr></thead>
          <tbody>${weekRows}</tbody></table></div>` : '<div class="muted small">Sem semanas no período.</div>'}
      </section>`;

  return {
    title: 'Relatório Produtividade',
    actions: `<select class="input sm" data-on="prod-period" aria-label="Período">${periods.map(([k, l]) => `<option value="${k}" ${PROD.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
    html: `<div class="stack" style="gap:6px">${body}</div>`,
  };
};

CHANGES['prod-period'] = (el) => { PROD.period = el.value; render(); };
