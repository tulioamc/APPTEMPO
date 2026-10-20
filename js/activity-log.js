/* =====================================================================
   LOG DE ATIVIDADE DIÁRIO + LIXEIRA
   - Todo registro de programa/arquivo entra no log do dia (actlog:AAAA-MM-DD), com um id fixo (rid),
     mesmo sem sessão ativa.
   - 24 h depois do último registro do dia, o dia inteiro vai para a lixeira (lixeira:AAAA-MM-DD).
     O log some do dia a dia, mas fica guardado para ser usado.
   - A lixeira guarda por N dias (Preferências, padrão 365; 0 = para sempre). Depois, apaga.
   - Na lixeira, você arrasta sobre a barra do dia e copia o trecho para um projeto/tarefa.
     A cópia leva os mesmos rid. O log original continua intacto.
   - Edições por programa/arquivo (agrupar, renomear) valem para os dois lados, porque são guardadas pela
     chave do programa/arquivo (actLinks), não por registro.
   ===================================================================== */

const LOG_AFTER_MS = 24 * 3600 * 1000;
const LOG_DEFAULT_DAYS = 365;
const logKeyOf = (day) => 'actlog:' + day;
const trashKeyOf = (day) => 'lixeira:' + day;
const logRidNew = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const logSettings = () => (db.data && db.data.tempo_settings) || [];

/* Grava um registro de atividade no log do dia. Devolve o registro (com rid), ou o já existente. */
function logAppend(seg) {
  const app = String(seg.app || '').trim(); if (!app || !seg.from || !seg.to) return null;
  const terminal = /^terminal$/i.test(app);
  const rec = { from: seg.from, to: seg.to, app, doc: terminal ? null : (seg.doc || null), folder: terminal ? null : (seg.folder || null) };
  const day = ymd(new Date(rec.from));
  const k = logKeyOf(day);
  const arr = db.setting(k, null) || [];
  const dup = arr.find(x => x.from === rec.from && x.app === rec.app && (x.doc || null) === rec.doc);
  if (dup) return dup;
  const out = { rid: logRidNew(), ...rec };
  db.setSetting(k, [...arr, out]);
  return out;
}

/* Hora em hora: dias sem registro há 24 h vão para a lixeira. */
function logSweep() {
  const now = Date.now();
  logSettings().filter(r => r.key.startsWith('actlog:') && Array.isArray(r.value) && r.value.length).forEach(r => {
    const last = Math.max(...r.value.map(x => new Date(x.to).getTime()));
    if (!(now - last >= LOG_AFTER_MS)) return;
    const day = r.key.slice('actlog:'.length);
    const prev = db.setting(trashKeyOf(day), null);
    const seen = new Set(); const merged = [];
    [...(prev?.records || []), ...r.value].forEach(x => { const id = x.rid || (x.from + x.app); if (!seen.has(id)) { seen.add(id); merged.push(x); } });
    db.setSetting(trashKeyOf(day), { savedAt: nowISO(), records: merged });
    db.setSetting(r.key, null);
  });
}

/* Apaga da lixeira o que passou do prazo de retenção (0 = nunca apaga). */
function logPurge() {
  const days = Number(db.setting('logRetentionDays', LOG_DEFAULT_DAYS));
  if (!days) return;
  const cut = Date.now() - days * 864e5;
  logSettings().filter(r => r.key.startsWith('lixeira:') && r.value && r.value.savedAt && new Date(r.value.savedAt).getTime() < cut)
    .forEach(r => db.setSetting(r.key, null));
}

function trashDays() {
  return logSettings().filter(r => r.key.startsWith('lixeira:') && r.value && Array.isArray(r.value.records))
    .map(r => ({ day: r.key.slice('lixeira:'.length), savedAt: r.value.savedAt, records: r.value.records }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

CHANGES['log-retention'] = (el) => { db.setSetting('logRetentionDays', Number(el.value)); toast('Lixeira de log: ' + (Number(el.value) ? `guarda por ${el.value} dias` : 'guarda para sempre')); };
function logRetentionPanel() {
  const cur = Number(db.setting('logRetentionDays', LOG_DEFAULT_DAYS));
  const opts = [[30, '30 dias'], [90, '90 dias'], [180, '180 dias'], [365, '1 ano'], [0, 'Para sempre']];
  return `<div class="panel"><div class="panel-h"><h3>Lixeira de log</h3></div><div class="panel-b row between" style="flex-wrap:wrap;gap:10px">
    <span class="small muted">Dias sem uso vão para a lixeira depois de 24 h. Ela guarda por:</span>
    <select class="input sm" data-on="log-retention" style="width:auto" aria-label="Tempo de guarda da lixeira de log">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`;
}

/* ---- Tela da lixeira ---- */
const LOG_DAY_MS = 86400000;
function logBlocksOf(day, recs) {
  const dayStart = new Date(day + 'T00:00:00').getTime();
  const an = actAnalyzeList(recs, 'program');
  const colorOf = Object.fromEntries(an.groups.map(g => [g.id, g.color]));
  const blocks = an.records.map(r => {
    const a = Math.max(new Date(r.from).getTime(), dayStart), b = Math.min(new Date(r.to).getTime(), dayStart + LOG_DAY_MS);
    if (b <= a) return '';
    const left = (a - dayStart) / LOG_DAY_MS * 100, width = Math.max(0.25, (b - a) / LOG_DAY_MS * 100);
    return `<span class="log-blk" style="left:${left}%;width:${width}%;background:${colorOf[r.gid] || 'var(--accent)'}" title="${esc(r.app)}${r.doc ? ' · ' + esc(r.doc) : ''} · ${fmtTime(r.from)}–${fmtTime(r.to)}"></span>`;
  }).join('');
  return { blocks, an };
}
function logDayCard(d) {
  const { blocks, an } = logBlocksOf(d.day, d.records);
  const total = d.records.reduce((s, r) => s + (new Date(r.to) - new Date(r.from)), 0);
  const byApp = {}; d.records.forEach(r => { const k = /^terminal$/i.test(r.app) ? 'Terminal' : (r.app); byApp[k] = (byApp[k] || 0) + (new Date(r.to) - new Date(r.from)); });
  const top = Object.entries(byApp).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const label = new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const ticks = [0, 6, 12, 18, 24].map(h => `<span style="left:${h / 24 * 100}%">${pad(h)}h</span>`).join('');
  return `<div class="panel log-card" data-logday="${d.day}">
    <div class="panel-h"><h3 style="text-transform:capitalize">${esc(label)}</h3><span class="grow"></span><span class="small muted">${d.records.length} registros · ${fmtDur(total)}</span></div>
    <div class="panel-b stack" style="gap:8px">
      <div class="log-bar" data-logday="${d.day}"><div class="log-grid"></div>${blocks}<div class="log-sel" hidden></div></div>
      <div class="log-ticks small muted">${ticks}</div>
      <div class="row small" style="gap:8px;flex-wrap:wrap">${top.map(([k, ms]) => `<span class="tag tg">${esc(k)} · ${fmtDur(ms)}</span>`).join('')}</div>
      <div class="small muted">Arraste sobre a barra para escolher um trecho e copiar para um projeto. Guardado em ${esc(new Date(d.savedAt).toLocaleDateString('pt-BR'))}.</div>
    </div></div>`;
}
VIEWS.lixeira = () => {
  const days = trashDays();
  const keep = Number(db.setting('logRetentionDays', LOG_DEFAULT_DAYS));
  return { title: 'Lixeira de log', actions: '', html: `
    <div class="banner info small">O log sai do dia a dia 24 h depois do último registro e vem para cá. Guardado ${keep ? 'por ' + keep + ' dias' : 'para sempre'} (ajuste em Configurações).</div>
    <div class="stack" style="gap:12px;margin-top:10px">${days.map(logDayCard).join('') || '<div class="empty">Nenhum dia na lixeira ainda.</div>'}</div>` };
};

/* ---- Seleção por arrastar ---- */
let logDrag = null;
const logFracOf = (d, x) => Math.min(1, Math.max(0, (x - d.r.left) / d.r.width));
document.addEventListener('pointerdown', (e) => {
  const bar = e.target.closest && e.target.closest('.log-bar'); if (!bar) return;
  const r = bar.getBoundingClientRect();
  logDrag = { bar, day: bar.dataset.logday, r, x0: e.clientX, x1: e.clientX };
  e.preventDefault();
  window.addEventListener('pointermove', logMove);
  window.addEventListener('pointerup', logUp, { once: true });
});
function logMove(e) {
  if (!logDrag) return;
  logDrag.x1 = e.clientX;
  const lo = Math.min(logDrag.x0, logDrag.x1), hi = Math.max(logDrag.x0, logDrag.x1);
  const sel = logDrag.bar.querySelector('.log-sel');
  const a = logFracOf(logDrag, lo), b = logFracOf(logDrag, hi);
  sel.hidden = false; sel.style.left = (a * 100) + '%'; sel.style.width = ((b - a) * 100) + '%';
}
function logUp() {
  const d = logDrag; logDrag = null;
  window.removeEventListener('pointermove', logMove);
  if (!d) return;
  d.bar.querySelector('.log-sel').hidden = true;
  const lo = Math.min(d.x0, d.x1), hi = Math.max(d.x0, d.x1);
  if (hi - lo < 6) return;
  const ds = new Date(d.day + 'T00:00:00').getTime();
  openLogMove(d.day, ds + logFracOf(d, lo) * LOG_DAY_MS, ds + logFracOf(d, hi) * LOG_DAY_MS);
}

/* Cresce o trecho até cobrir os registros que ele toca (como no intervalo da sessão). */
function logExpand(recs, a, b) {
  let changed = true;
  while (changed) {
    changed = false;
    recs.forEach(r => { const x = new Date(r.from).getTime(), y = new Date(r.to).getTime(); if (y > a && x < b) { if (x < a) { a = x; changed = true; } if (y > b) { b = y; changed = true; } } });
  }
  return [a, b];
}

function openLogMove(day, a0, b0) {
  const t = db.setting(trashKeyOf(day), null); if (!t) return;
  const [a, b] = logExpand(t.records, a0, b0);
  const recs = t.records.filter(r => new Date(r.to) > new Date(a) && new Date(r.from) < new Date(b));
  const ly = openLayer({
    render: () => `<div class="dh"><h2>Copiar trecho do log</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:10px">
        <div class="row between"><span class="mono">${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())}</span><span class="mono small">${fmtDur(b - a)}</span></div>
        <div class="stack" style="gap:4px">${recs.map(r => `<div class="row between small"><span>${esc(/^terminal$/i.test(r.app) ? 'Terminal' : r.app)}${r.doc ? ' · ' + esc(r.doc) : ''}</span><span class="mono">${fmtDur(new Date(r.to) - new Date(r.from))}</span></div>`).join('') || '<span class="muted small">Trecho sem registros.</span>'}</div>
        <div class="field"><label for="lg-proj">Copiar para o projeto</label><select id="lg-proj" class="input"><option value="">Escolha um projeto</option>${tkProjectsSorted().map(p => `<option value="${esc(p.id)}">${esc(tkProjectLabel(p))}</option>`).join('')}</select></div>
        <div class="field"><label for="lg-task">Tarefa (opcional)</label><select id="lg-task" class="input" disabled><option value="">Sem tarefa</option></select></div>
        <div class="row"><button class="btn primary" data-x="lg-copy">Copiar</button><span class="small muted">Cria uma sessão nova com esse trecho. O log da lixeira continua intacto.</span></div>
      </div>
      <div class="df"><button class="btn" data-act="close-layer">Fechar</button></div>`,
    onMount: (l) => {
      const proj = l.box.querySelector('#lg-proj'), task = l.box.querySelector('#lg-task');
      proj.addEventListener('change', () => {
        const tasks = proj.value ? db.where('tempo_tasks', x => x.project_id === proj.value) : [];
        task.innerHTML = `<option value="">Sem tarefa</option>${tasks.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}`;
        task.disabled = !proj.value;
      });
      l.box.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-x="lg-copy"]'); if (!btn) return;
        if (!proj.value) return toast('Escolha um projeto.');
        const label = tkProjectLabel(db.get('tempo_projects', proj.value));
        if (!await confirmBox({ title: 'Copiar trecho?', body: `${fmtDur(b - a)} do log vira sessão em ${label}. O log original fica na lixeira.`, ok: 'Copiar' })) return;
        if (!logCopyToTask(day, a, b, { project_id: proj.value, task_id: task.value || null })) return toast('Nada para copiar.');
        toast('Trecho copiado');
        ly.close();
        if (S.route === 'lixeira') render();
      });
    },
  });
}

/* Copia os registros do trecho para uma sessão nova. Mantém o rid de cada registro (o elo com o log). */
function logCopyToTask(day, a, b, pick) {
  const t = db.setting(trashKeyOf(day), null); if (!t) return null;
  const inR = t.records.filter(r => new Date(r.to) > new Date(a) && new Date(r.from) < new Date(b))
    .map(r => ({ ...r, from: new Date(Math.max(new Date(r.from).getTime(), a)).toISOString(), to: new Date(Math.min(new Date(r.to).getTime(), b)).toISOString() }));
  if (!inR.length) return null;
  const p = db.get('tempo_projects', pick.project_id); if (!p) return null;
  const c = clientOf(p);
  const merged = actMergeIntervals(inR.map(r => ({ a: new Date(r.from).getTime(), b: new Date(r.to).getTime() })).filter(x => x.b > x.a));
  const intervalo = `${fmtTime(new Date(a).toISOString())}–${fmtTime(new Date(b).toISOString())}`;
  const nova = db.insert('tempo_time_entries', {
    project_id: p.id, client_id: c?.id || null, agency_id: c?.agency_id || null, task_id: pick.task_id || null,
    work_type_id: lastWorkType(p.id), revision_id: null, notes: `Copiado do log de ${day} (${intervalo})`,
    state: 'done', segments: merged.map(m => ({ s: new Date(m.a).toISOString(), e: new Date(m.b).toISOString() })),
    edits: [{ at: nowISO(), reason: `Trecho do log de ${day} (${intervalo}) copiado para ${tkProjectLabel(p)}`, before: null }],
  });
  db.setSetting('act:' + nova.id, inR);
  db.emit();
  return nova;
}
