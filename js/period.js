/* Relatório do Time Sheet (caixa principal da tela inicial): o dia de hoje e o resumo de semana, 15 dias ou mês
   no mesmo painel. Filtros: tudo, só pausas, só programas ou só arquivos. Arrastar sobre a linha do tempo faz zoom. */

const TS_PERIODS = [['dia', 'Dia'], ['semana', 'Semana'], ['q15', '15 dias'], ['mes', 'Mês']];
const TS_VIEWS = [['tudo', 'Tudo'], ['pausas', 'Pausas'], ['programas', 'Programas'], ['arquivos', 'Arquivos']];
const PAUSE_LABEL = { mac: 'Ocioso (mouse e teclado)', sono: 'Computador fechado / dormiu', suspenso: 'Página parada', ocioso: 'Ociosidade (navegador)', app: 'WhatsApp / Telegram', manual: 'Intervalo manual' };
const pauseLabel = (k) => PAUSE_LABEL[k] || k;

/* Início e fim (inclusive) do período que contém o dia. */
function tsPeriodRange(day, p) {
  const d0 = new Date(day); d0.setHours(0, 0, 0, 0);
  if (p === 'semana') { const s = new Date(d0); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)]; }
  if (p === 'q15') return [new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 14), d0];
  if (p === 'mes') return [new Date(d0.getFullYear(), d0.getMonth(), 1), new Date(d0.getFullYear(), d0.getMonth() + 1, 0)];
  return [d0, d0];
}

/* Faixa do dia nos modos pausas, programas ou arquivos (a visão "tudo" é a faixa de sessões, em dayStrip).
   Tem o mesmo formato e o mesmo arrastar para zoom da faixa principal. */
function reportStrip(entries, day, mode) {
  const START = 7, END = 24; const span = (END - START) * 3600000;
  const base = new Date(day); base.setHours(START, 0, 0, 0);
  const clip = (t) => Math.min(span, Math.max(0, t - base));
  let bars = '';
  if (mode === 'pausas') {
    entries.forEach(e => {
      const lista = [
        ...entryGaps(e).map(g => ({ s: new Date(g.s).getTime(), e: new Date(g.e).getTime(), why: g.why })),
        ...db.all('tempo_notices').filter(n => n.kind === 'pause' && n.status === 'accepted' && n.data?.source === 'app' && n.data?.entry_id === e.id)
          .map(n => ({ s: new Date(n.data.from).getTime(), e: new Date(n.data.to).getTime(), why: n.data.app || 'app' })),
      ];
      lista.forEach(p => {
        const st = clip(p.s), en = clip(p.e); if (en <= st) return;
        bars += `<span class="seg-b pausa" style="--ph:${pauseHatch(p.why)};left:${st / span * 100}%;width:${Math.max(.3, (en - st) / span * 100)}%" data-tip="${esc(`Pausa ${fmtTime(new Date(p.s).toISOString())}–${fmtTime(new Date(p.e).toISOString())} · ${fmtDur(p.e - p.s)}\n${pauseWhy(p.why)}`)}"></span>`;
      });
    });
  } else {
    entries.forEach(e => {
      const A = actAnalyze(e.id, mode === 'programas' ? 'program' : 'file');
      A.records.forEach(r => {
        const g = A.groups.find(x => x.id === r.gid); if (!g) return;
        const st = clip(new Date(r.from).getTime()), en = clip(new Date(r.to).getTime()); if (en <= st) return;
        bars += `<span class="seg-b fill act-b" style="--tb:${g.color};left:${st / span * 100}%;width:${Math.max(.3, (en - st) / span * 100)}%" data-tip="${esc(actTip(g))}"></span>`;
      });
    });
  }
  return `<div class="day-strip" data-report="1" data-t0="${base.getTime()}" data-span="${span}" data-ents="${entries.map(e => e.id).join(',')}" aria-label="Linha do tempo do dia">${bars}</div><div class="day-axis">${[7, 10, 13, 16, 19, 22].map(h => `<span>${pad(h)}h</span>`).join('')}<span>24h</span></div>`;
}

/* Faixa agregada de um dia: cada projeto soma o seu tempo (cor do cliente/agência), pausas pela cor da categoria. */
function dayAggHTML(d) {
  const ds = entriesOn(d);
  if (!ds.length) return '<div class="muted small">Sem registro neste dia.</div>';
  const bruto = unionBrutoMs(ds);
  const proj = new Map(), pz = new Map();
  ds.forEach(e => { const k = e.project_id || '_'; proj.set(k, (proj.get(k) || 0) + entryMs(e)); });
  ds.forEach(e => entryGaps(e).forEach(g => { const k = g.why || 'manual'; pz.set(k, (pz.get(k) || 0) + (new Date(g.e) - new Date(g.s))); }));
  const sumP = [...proj.values()].reduce((t, x) => t + x, 0), sumZ = [...pz.values()].reduce((t, x) => t + x, 0);
  const rest = Math.max(0, bruto - sumP - sumZ);
  const total = Math.max(1, sumP + sumZ + rest);
  let off = 0, parts = '';
  const projItems = [...proj.entries()].sort((a, b) => b[1] - a[1]).map(([k, ms]) => {
    const pr = db.get('tempo_projects', k);
    const c = pr ? clientOf(pr) : null;
    const col = hexOf((c && c.color) || (pr && agOfProject(pr)?.color) || 'gray');
    return { label: pr?.name || 'Sem projeto', ms, color: col };
  });
  projItems.forEach(it => { const w = it.ms / total * 100; if (w <= 0) return; parts += `<span class="seg-b act-b" title="${esc(it.label)} · ${fmtDur(it.ms)}" style="--tb:${it.color};left:${off}%;width:${Math.max(.3, w)}%"></span>`; off += w; });
  const pauseItems = [...pz.entries()].sort((a, b) => b[1] - a[1]).map(([k, ms]) => ({ label: 'Pausa · ' + pauseLabel(k), ms, color: pauseHatch(k), key: k }));
  pauseItems.forEach(it => { const w = it.ms / total * 100; if (w <= 0) return; parts += `<span class="seg-b pausa" title="${esc(it.label)} · ${fmtDur(it.ms)}" style="--ph:${it.color};left:${off}%;width:${Math.max(.3, w)}%"></span>`; off += w; });
  if (rest > 1000 && off < 100) parts += `<span class="act-track" style="left:${off}%;width:${100 - off}%"></span>`;
  const chip = (it) => `<span class="act-chip" style="--tb:${it.color}"><i></i>${esc(it.label)} <span class="faint">${fmtDur(it.ms)}</span></span>`;
  // WhatsApp fica à parte (verde); as outras pausas viram um chip só, "Pausa +N", com o detalhe no passar do mouse
  const isWA = (it) => pauseKind(it.key) === 'whatsapp';
  const others = pauseItems.filter(it => !isWA(it));
  const othersMs = others.reduce((t, it) => t + it.ms, 0);
  const pauseChips = pauseItems.filter(isWA).map(chip).join('') + (others.length ? `<span class="act-chip act-chip-total" style="--tb:#A1A1AA" title="${esc(others.map(o => `${o.label} · ${fmtDur(o.ms)}`).join('\n'))}"><i></i>Pausa <span class="act-more">+${others.length}</span> <span class="faint">${fmtDur(othersMs)}</span></span>` : '');
  return `<div class="act-strip" style="height:30px">${parts}</div>
    <div class="act-chips">${projItems.map(chip).join('')}${pauseChips}</div>`;
}

/* Caixa "Relatório do Time Sheet". */
function reportPanelHTML(day) {
  const p = db.setting('tsPeriod', 'dia');
  const v = db.setting('tsReportView', 'tudo');
  const [a, b] = tsPeriodRange(day, p);
  const days = [];
  for (let d = new Date(a); d <= b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(new Date(d));
  const es = days.flatMap(d => entriesOn(d));
  const net = es.reduce((s, e) => s + entryMs(e), 0);
  const bruto = unionBrutoMs(es);

  // barras dos dias: no modo dia, a semana do dia; nos outros, os dias do período
  const ws = new Date(day); ws.setHours(0, 0, 0, 0); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  const chartDays = p === 'dia' ? [...Array(7)].map((_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; }) : days;
  const chart = chartDays.map(d => ({ d, ms: entriesOn(d).reduce((s, e) => s + entryMs(e), 0) }));
  const chartSum = chart.reduce((s, x) => s + x.ms, 0);
  const maxW = Math.max(3600000, ...chart.map(x => x.ms));

  const pauses = new Map(), progs = new Map(), files = new Map(), types = new Map();
  es.forEach(e => {
    entryGaps(e).forEach(g => { const k = g.why || 'manual'; pauses.set(k, (pauses.get(k) || 0) + (new Date(g.e) - new Date(g.s))); });
    const tk = e.work_type_id || '_'; types.set(tk, (types.get(tk) || 0) + entryMs(e));
    actList(e.id).forEach(r => {
      const ms = new Date(r.to) - new Date(r.from); if (!(ms > 0)) return;
      const tn = toolName(r); progs.set(tn, (progs.get(tn) || 0) + ms);
      const fk = `${r.app}|${r.doc || ''}`;
      const f = files.get(fk) || { label: r.doc ? `${r.doc} · ${r.app}` : r.app, app: r.app, doc: r.doc || null, ms: 0 };
      f.ms += ms; files.set(fk, f);
    });
  });

  const items = (m, labelOf, colorOf) => [...m.entries()].map(([k, ms]) => ({ label: labelOf(k), ms, color: colorOf(k) })).sort((x, y) => y.ms - x.ms);
  const typeItems = items(types, k => { const w = db.get('tempo_work_types', k); return w?.name || 'Sem tipo'; }, k => hexOf(db.get('tempo_work_types', k)?.color || 'gray'));
  const pauseItems = items(pauses, pauseLabel, k => pauseHatch(k));
  const progItems = items(progs, k => k, k => toolColor(k));
  // arquivos sem nome próprio (só o programa), nomes iguais ao do programa e sites do Chrome já aparecem em "Programas e sites"
  const fileItems = [...files.values()].filter(f => f.doc && !f.app.toLowerCase().includes(f.doc.toLowerCase()) && !isChromeSite(f.app, f.doc))
    .sort((x, y) => y.ms - x.ms).map(f => ({ label: f.label, ms: f.ms, color: toolColor(f.app) }));

  const section = (title, list) => {
    const total = list.reduce((s, i) => s + i.ms, 0);
    let body = '<div class="muted small">Nada neste período.</div>';
    if (list.length) {
      const max = Math.max(1, ...list.map(i => i.ms));
      const rowOf = (i) => `<div class="bar-row"><span class="lab">${esc(i.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${(i.ms / max * 100).toFixed(1)}%;background:${i.color || 'var(--accent)'}"></div></div><span class="val">${fmtDur(i.ms)}</span></div>`;
      const head = list.slice(0, 8).map(rowOf).join(''), more = list.slice(8).map(rowOf).join('');
      body = `<div class="bars">${head}</div>${more ? `<details class="rep-more"><summary class="small muted" style="cursor:pointer;padding:4px 0">+${list.length - 8} outros (clique para ver todos)</summary><div class="bars" style="margin-top:6px">${more}</div></details>` : ''}`;
    }
    return `<details class="rep-det" style="border-top:1px solid var(--line);padding-top:8px">
      <summary style="cursor:pointer;font-weight:600"><span class="lbl" style="display:inline">${title}</span> <span class="mono small muted">${list.length ? fmtDur(total) : ''}</span></summary>
      <div class="stack" style="gap:6px;margin-top:10px">${body}</div>
    </details>`;
  };
  const sections = [];
  if (p === 'dia' && v === 'tudo') sections.push(section('Tipos de trabalho', typeItems));
  if (v === 'tudo' || v === 'pausas') sections.push(section('Pausas por motivo', pauseItems));
  if (v === 'tudo' || v === 'programas') sections.push(section('Programas e sites (Claude, GPT, Illustrator…)', progItems));
  if (v === 'tudo' || v === 'arquivos') sections.push(section('Arquivos e páginas', fileItems));

  const seg = (list, cur, attr) => `<div class="seg" style="display:flex;gap:6px;flex-wrap:wrap">${list.map(([k, l]) => `<button class="btn sm ${cur === k ? 'primary' : ''}" ${attr}="${k}">${l}</button>`).join('')}</div>`;
  const stripHTML = p === 'dia' ? (v === 'tudo' ? dayStrip(es, day) : reportStrip(es, day, v)) : '';
  const chartHTML = `<div class="stack" style="gap:6px">
      <div class="row between"><span class="lbl">${p === 'dia' ? 'Semana' : 'Dias do período'}</span><span class="mono small">${fmtDur(chartSum)}</span></div>
      <div style="display:grid;grid-template-columns:repeat(${chart.length},1fr);gap:${chart.length > 8 ? 3 : 6}px;align-items:end;height:70px">
        ${chart.map(x => `<button data-act="ts-day" data-day="${ymd(x.d)}" data-agg-day="${ymd(x.d)}" title="${fmtDate(ymd(x.d))} · ${fmtDur(x.ms)}" style="border:0;background:none;padding:0;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-end;height:100%;gap:4px"><span style="display:block;height:${Math.max(3, x.ms / maxW * 46)}px;border-radius:3px;background:${ymd(x.d) === S.tsDay ? 'var(--accent)' : 'var(--surface-3)'}"></span><span class="small ${ymd(x.d) === S.tsDay ? '' : 'faint'}" style="text-align:center;font-size:11px">${chart.length <= 7 ? WEEKDAYS[x.d.getDay()] : x.d.getDate()}</span></button>`).join('')}
      </div>
      <div class="ts-agg-box" id="ts-agg-box" data-agg-cur="${ymd(day)}">${dayAggHTML(day)}</div>
      <div hidden id="ts-agg-store-html">${chart.map(x => `<span data-store="${ymd(x.d)}">${dayAggHTML(x.d)}</span>`).join('')}</div>
    </div>`;

  return `<div class="panel report-panel">
    <div class="panel-h">
      <h3>Relatório do Time Sheet</h3><span class="grow"></span>
      <span class="small muted">${fmtDate(ymd(a))}${ymd(a) !== ymd(b) ? ' a ' + fmtDate(ymd(b)) : ''}</span>
      <span class="mono" style="font-weight:600;font-size:1.1em;margin-left:10px" ${p === 'dia' ? `data-tick-day="${S.tsDay}"` : ''}>${fmtDur(net)}</span>
    </div>
    <div class="panel-b stack" style="gap:12px">
      <div class="row between" style="flex-wrap:wrap;gap:8px">${seg(TS_PERIODS, p, 'data-tsp')}${seg(TS_VIEWS, v, 'data-tsv')}</div>
      <div class="small muted">bruto ${fmtDur(bruto)} · trabalho ${fmtDur(net)} · pausas ${fmtDur(Math.max(0, bruto - net))}</div>
      ${stripHTML}
      ${chartHTML}
      <div class="stack" style="gap:6px">${sections.join('')}</div>
    </div>
  </div>`;
}

/* Troca o período ou o filtro: ficam salvos (db.setting 'tsPeriod' e 'tsReportView') e a tela é redesenhada. */
document.addEventListener('click', (ev) => {
  const p = ev.target.closest?.('[data-tsp]');
  if (p) { db.setSetting('tsPeriod', p.dataset.tsp); db.emit(); return; }
  const v = ev.target.closest?.('[data-tsv]');
  if (v) { db.setSetting('tsReportView', v.dataset.tsv); db.emit(); }
});

/* Passar o mouse (ou tocar) num dia mostra a faixa agregada dele logo abaixo do gráfico. */
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest?.('[data-agg-day]'); if (!b) return;
  const box = document.getElementById('ts-agg-box'); if (!box || box.dataset.aggCur === b.dataset.aggDay) return;
  const src = document.querySelector(`#ts-agg-store-html [data-store="${b.dataset.aggDay}"]`); if (!src) return;
  box.innerHTML = src.innerHTML; box.dataset.aggCur = b.dataset.aggDay;
});
