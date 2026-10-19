/* Resumo do período (abaixo do cronômetro na tela de tempo): dia, semana, 15 dias ou mês.
   Mostra o tempo bruto, as pausas com o motivo, os programas e os arquivos usados. */

const TS_PERIODS = [['dia', 'Dia'], ['semana', 'Semana'], ['q15', '15 dias'], ['mes', 'Mês']];
const PAUSE_LABEL = { mac: 'Ocioso (mouse e teclado)', sono: 'Computador fechado / dormiu', suspenso: 'Página parada', ocioso: 'Ociosidade (navegador)', app: 'WhatsApp / Telegram', manual: 'Intervalo manual' };
const pauseLabel = (k) => PAUSE_LABEL[k] || k;
const pauseColor = (k) => pauseHatch(k);

/* Início e fim (inclusive) do período que contém o dia. */
function periodRange(day, p) {
  const d0 = new Date(day); d0.setHours(0, 0, 0, 0);
  if (p === 'semana') { const s = new Date(d0); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)]; }
  if (p === 'q15') return [new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 14), d0];
  if (p === 'mes') return [new Date(d0.getFullYear(), d0.getMonth(), 1), new Date(d0.getFullYear(), d0.getMonth() + 1, 0)];
  return [d0, d0];
}

function periodPanelHTML(day) {
  const p = db.setting('tsPeriod', 'dia');
  const [a, b] = periodRange(day, p);
  const es = [];
  for (let d = new Date(a); d <= b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) es.push(...entriesOn(d));
  const net = es.reduce((s, e) => s + entryMs(e), 0);
  const bruto = es.reduce((s, e) => s + entryBrutoMs(e), 0);

  const pauses = new Map(), progs = new Map(), files = new Map();
  es.forEach(e => {
    entryGaps(e).forEach(g => { const k = g.why || 'manual'; pauses.set(k, (pauses.get(k) || 0) + (new Date(g.e) - new Date(g.s))); });
    actList(e.id).forEach(r => {
      const ms = new Date(r.to) - new Date(r.from); if (!(ms > 0)) return;
      const tn = toolName(r); progs.set(tn, (progs.get(tn) || 0) + ms);
      const fk = `${r.app}|${r.doc || ''}`;
      const f = files.get(fk) || { label: r.doc ? `${r.doc} · ${r.app}` : r.app, ms: 0 };
      f.ms += ms; files.set(fk, f);
    });
  });

  const rows = (m, labelOf, colorOf) => [...m.entries()].map(([k, ms]) => ({ label: labelOf(k), ms, color: colorOf ? colorOf(k) : null })).sort((x, y) => y.ms - x.ms);
  const list = (items) => {
    if (!items.length) return '<div class="muted small">Nada neste período.</div>';
    const max = Math.max(1, ...items.map(i => i.ms));
    const shown = items.slice(0, 8);
    return `<div class="bars">${shown.map(i => `<div class="bar-row"><span class="lab">${esc(i.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${(i.ms / max * 100).toFixed(1)}%;background:${i.color || 'var(--accent)'}"></div></div><span class="val">${fmtDur(i.ms)}</span></div>`).join('')}</div>${items.length > 8 ? `<div class="small muted">+${items.length - 8} outros</div>` : ''}`;
  };
  const fileItems = [...files.values()].sort((x, y) => y.ms - x.ms).map(f => ({ label: f.label, ms: f.ms }));

  return `<div class="panel" style="margin-bottom:14px">
    <div class="panel-h">
      <div class="seg" style="display:flex;gap:6px">${TS_PERIODS.map(([k, l]) => `<button class="btn sm ${p === k ? 'primary' : ''}" data-tsp="${k}">${l}</button>`).join('')}</div>
      <span class="grow"></span>
      <span class="small muted">${fmtDate(ymd(a))}${ymd(a) !== ymd(b) ? ' a ' + fmtDate(ymd(b)) : ''} · bruto ${fmtDur(bruto)} · trabalho ${fmtDur(net)} · pausas ${fmtDur(Math.max(0, bruto - net))}</span>
    </div>
    <div class="panel-b stack" style="gap:14px">
      <div class="stack" style="gap:6px"><span class="lbl">Pausas por motivo</span>${list(rows(pauses, pauseLabel, pauseColor))}</div>
      <div class="stack" style="gap:6px"><span class="lbl">Programas e sites (Claude, GPT, Illustrator…)</span>${list(rows(progs, k => k, toolColor))}</div>
      <div class="stack" style="gap:6px"><span class="lbl">Arquivos e páginas</span>${list(fileItems)}</div>
    </div>
  </div>`;
}

/* Troca o período: fica salvo (db.setting 'tsPeriod') e a tela é redesenhada. */
document.addEventListener('click', (ev) => {
  const b = ev.target.closest?.('[data-tsp]'); if (!b) return;
  db.setSetting('tsPeriod', b.dataset.tsp); db.emit();
});
