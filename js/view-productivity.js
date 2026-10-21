/* Relatório Produtividade: quando e como você trabalha. Usa o bruto de todas as sessões (sem contar duas vezes)
   e as pausas já corrigidas (pauseGapsOf). Produtivo = trabalho; distração = WhatsApp/Telegram/Instagram;
   ocioso = pausa sem motivo ou ociosidade do sistema; outras = demais pausas (intervalo manual, sono, página parada). */
const PROD = { period: '30d' };
const PROD_GAP = 3 * 60e3; /* blocos de foco: pausas de até 3 min não quebram o foco */
const PROD_DOW = [1, 2, 3, 4, 5, 6, 0]; /* segunda primeiro */
const PROD_DOW_LBL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PROD_COLOR = { prod: '#22a06b', dist: '#d64545', ocio: '#94A3B8', outras: '#b45309', pausa: '#CBD5E1' };
const PROD_CLS = { prod: 'prod-p', dist: 'prod-d', ocio: 'prod-o', outras: 'prod-x', pausa: 'prod-z' };

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
/* Classe da pausa para o gráfico: distração, ocioso, ou outras. */
function prodPauseCls(why) {
  if (!why) return 'ocio';
  const k = pauseKind(why);
  if (k === 'whatsapp' || k === 'telegram' || k === 'instagram') return 'dist';
  if (k === 'idle') return 'ocio';
  return 'outras';
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
function prodStats(C) {
  const hours = Array.from({ length: 24 }, () => ({ prod: 0, dist: 0, ocio: 0, outras: 0 }));
  const dows = Array.from({ length: 7 }, () => ({ prod: 0, pausa: 0 }));
  C.union.forEach(([s, e]) => prodSpread(s, e, (d, ms) => { hours[d.getHours()].prod += ms; dows[d.getDay()].prod += ms; }));
  C.pauses.forEach(p => {
    const k = prodPauseCls(p.why);
    prodSpread(p.s, p.e, (d, ms) => { hours[d.getHours()][k] += ms; dows[d.getDay()].pausa += ms; });
  });
  const tot = { prod: 0, dist: 0, ocio: 0, outras: 0 };
  hours.forEach(h => Object.keys(tot).forEach(k => { tot[k] += h[k]; }));
  const pausaMs = tot.dist + tot.ocio + tot.outras;
  const base = tot.prod + pausaMs;
  const blocks = prodMerge(C.union, PROD_GAP);
  const longest = blocks.reduce((m, [s, e]) => Math.max(m, e - s), 0);
  const dayKey = (t) => new Date(t).toDateString();
  const byDay = new Map();
  blocks.forEach(([s, e]) => {
    const k = dayKey(s); const r = byDay.get(k) || { n: 0, max: 0, ms: 0 };
    r.n++; r.max = Math.max(r.max, e - s); r.ms += e - s; byDay.set(k, r);
  });
  const days = [...byDay.entries()].map(([k, r]) => ({ key: k, ...r })).sort((x, y) => new Date(y.key) - new Date(x.key));
  const dowDays = prodDowDays(C.a, C.b);
  return {
    hours, dows, dowDays, tot, pausaMs, base, blocks, longest, days,
    pctProd: base > 0 ? tot.prod / base * 100 : 0,
    blocksPerDay: days.length ? blocks.length / days.length : 0,
    longestPerDay: days.length ? days.reduce((s, d) => s + d.max, 0) / days.length : 0,
  };
}
/* Colunas empilhadas: cada item tem partes [{cls, ms}]; a altura é proporcional ao maior total. */
function prodColsHTML(items) {
  const max = Math.max(1, ...items.map(i => i.parts.reduce((s, p) => s + p.ms, 0)));
  return `<div class="prod-cols">${items.map(i => {
    const tot = i.parts.reduce((s, p) => s + p.ms, 0);
    return `<div class="prod-col" title="${esc(i.tip)}"><div class="prod-stack">${i.parts.filter(p => p.ms > 0).map(p => `<span class="prod-seg ${PROD_CLS[p.cls]}" style="height:${(p.ms / max * 100).toFixed(2)}%"></span>`).join('')}</div><span class="prod-lbl">${esc(i.label)}</span></div>`;
  }).join('')}</div>`;
}
function prodLegendHTML(keys) {
  const names = { prod: 'Produtivo', dist: 'Distração', ocio: 'Ocioso', outras: 'Outras pausas', pausa: 'Pausa' };
  return `<div class="prod-legend">${keys.map(k => `<span class="prod-leg"><span class="prod-sw" style="background:${PROD_COLOR[k]}"></span>${names[k]}</span>`).join('')}</div>`;
}
function prodWeeks(C) {
  const weekKey = (t) => { const d = new Date(t); const off = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - off).getTime(); };
  const out = new Map();
  const add = (t, f) => { const k = weekKey(t); const r = out.get(k) || { prod: 0, pausa: 0 }; f(r); out.set(k, r); };
  C.union.forEach(([s, e]) => prodSpread(s, e, (d, ms) => add(d.getTime(), r => { r.prod += ms; })));
  C.pauses.forEach(p => prodSpread(p.s, p.e, (d, ms) => add(d.getTime(), r => { r.pausa += ms; })));
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
    <thead><tr><th>Motivo</th><th>Tempo</th><th>% das pausas</th><th>Vezes</th><th>Média por vez</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.why ? pauseLabel(r.why) : 'Sem motivo')}</td><td class="mono small">${fmtDur(r.ms)}</td><td class="mono small">${usePctTxt(r.ms / total * 100)}</td><td class="mono small">${r.n}</td><td class="mono small">${fmtDur(r.ms / r.n)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

VIEWS.productivity = () => {
  const C = prodCollect();
  const S = prodStats(C);
  const hasData = C.union.length > 0 || C.pauses.length > 0;
  const hourItems = S.hours.map((h, i) => ({
    label: i % 3 === 0 ? String(i).padStart(2, '0') : '',
    parts: [{ cls: 'prod', ms: h.prod }, { cls: 'dist', ms: h.dist }, { cls: 'ocio', ms: h.ocio }, { cls: 'outras', ms: h.outras }],
    tip: `${String(i).padStart(2, '0')}h · produtivo ${fmtDur(h.prod)} · distração ${fmtDur(h.dist)} · ocioso ${fmtDur(h.ocio)} · outras ${fmtDur(h.outras)}`,
  }));
  const dowItems = PROD_DOW.map(di => {
    const r = S.dows[di]; const n = Math.max(1, S.dowDays[di]);
    return {
      label: PROD_DOW_LBL[di],
      parts: [{ cls: 'prod', ms: r.prod / n }, { cls: 'pausa', ms: r.pausa / n }],
      tip: `${PROD_DOW_LBL[di]} · média por dia: produtivo ${fmtDur(r.prod / n)} · pausa ${fmtDur(r.pausa / n)} (${S.dowDays[di]} dia(s) no período)`,
    };
  });
  const weeks = prodWeeks(C);
  const weekItems = weeks.map(([k, r]) => {
    const d = new Date(k);
    const pct = r.prod + r.pausa > 0 ? r.prod / (r.prod + r.pausa) * 100 : 0;
    return {
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      parts: [{ cls: 'prod', ms: r.prod }, { cls: 'pausa', ms: r.pausa }],
      tip: `Semana de ${d.toLocaleDateString('pt-BR')} · produtivo ${fmtDur(r.prod)} · ${usePctTxt(pct)} do tempo`,
    };
  });
  const weekRows = weeks.slice(-8).reverse().map(([k, r]) => {
    const pct = r.prod + r.pausa > 0 ? r.prod / (r.prod + r.pausa) * 100 : 0;
    return `<tr><td>${esc(new Date(k).toLocaleDateString('pt-BR'))}</td><td class="mono small">${fmtDur(r.prod)}</td><td class="mono small">${fmtDur(r.pausa)}</td><td class="mono small">${usePctTxt(pct)}</td></tr>`;
  }).join('');
  const dayRows = S.days.slice(0, 10).map(d => `<tr><td>${esc(new Date(d.key).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</td><td class="mono small">${fmtDur(d.ms)}</td><td class="mono small">${d.n}</td><td class="mono small">${fmtDur(d.max)}</td></tr>`).join('');
  const periods = [['mes', 'Mês atual'], ['30d', 'Últimos 30 dias'], ['tudo', 'Tudo']];

  const body = !hasData
    ? '<div class="muted small">Sem registro de trabalho no período escolhido.</div>'
    : `<div class="kpi-row">
        <div class="kpi"><span class="k">Produtivo</span><span class="v mono">${fmtDur(S.tot.prod)}</span><span class="s">trabalho sem contar duplicado</span></div>
        <div class="kpi"><span class="k">% produtivo</span><span class="v mono">${usePctTxt(S.pctProd)}</span><span class="s">trabalho ÷ (trabalho + pausas)</span></div>
        <div class="kpi"><span class="k">Maior bloco de foco</span><span class="v mono">${fmtDur(S.longest)}</span><span class="s">pausas de até 3 min não quebram</span></div>
        <div class="kpi"><span class="k">Blocos por dia</span><span class="v mono">${S.blocksPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span><span class="s">${S.blocks.length} bloco(s) em ${S.days.length} dia(s)</span></div>
        <div class="kpi"><span class="k">Maior bloco por dia</span><span class="v mono">${fmtDur(S.longestPerDay)}</span><span class="s">média dos dias com trabalho</span></div>
      </div>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Por hora do dia</h3>
        ${prodColsHTML(hourItems)}${prodLegendHTML(['prod', 'dist', 'ocio', 'outras'])}
        <div class="small muted">Soma de todo o período em cada hora. Mostra os horários em que você produz, se distrai e fica ocioso.</div>
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Por dia da semana</h3>
        ${prodColsHTML(dowItems)}${prodLegendHTML(['prod', 'pausa'])}
        <div class="small muted">Média por dia: o total de cada dia da semana dividido pelos dias que ele aparece no período.</div>
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Blocos de foco por dia</h3>
        ${S.days.length ? `<div class="usage-table-wrap"><table class="usage-table">
          <thead><tr><th>Dia</th><th>Trabalho</th><th>Blocos</th><th>Maior bloco</th></tr></thead>
          <tbody>${dayRows}</tbody></table></div>
          <div class="small muted">Mostra os 10 dias mais recentes.</div>` : '<div class="muted small">Sem blocos no período.</div>'}
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Pausas que mais custam</h3>
        ${prodPausesHTML(C)}
      </section>

      <section class="card stack" style="gap:10px;margin-top:14px"><h3>Tendência semanal</h3>
        ${weekItems.length ? `${prodColsHTML(weekItems)}${prodLegendHTML(['prod', 'pausa'])}
        <div class="usage-table-wrap"><table class="usage-table">
          <thead><tr><th>Semana (segunda)</th><th>Produtivo</th><th>Pausa</th><th>% produtivo</th></tr></thead>
          <tbody>${weekRows}</tbody></table></div>` : '<div class="muted small">Sem semanas no período.</div>'}
      </section>`;

  return {
    title: 'Relatório Produtividade',
    actions: `<select class="input sm" data-on="prod-period" aria-label="Período">${periods.map(([k, l]) => `<option value="${k}" ${PROD.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
    html: `<div class="stack" style="gap:6px">${body}</div>`,
  };
};

CHANGES['prod-period'] = (el) => { PROD.period = el.value; render(); };
