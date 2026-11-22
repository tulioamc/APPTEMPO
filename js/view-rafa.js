/* =====================================================================
   DIAS DE RAFA — calendário mensal da escala com a mãe.
   Cada dia: quem fica com ele (letra grande), horário e observações.
   T = Túlio (azul), A = Amanda (rosa), T/A = troca no mesmo dia.
   As semanas aparecem sempre completas: os dias do mês anterior e do
   próximo que completam a semana aparecem esmaecidos, mas editáveis.
   ===================================================================== */
const RF = { ym: null };
const RF_WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const RF_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const RF_NOME = { T: 'Túlio', A: 'Amanda', M: 'Maria Adélia (mãe do Túlio)', X: 'Troca' };
const rafaWd = (y, m, d) => (new Date(y, m - 1, d).getDay() + 6) % 7; /* 0 = segunda */

/* ---------- Escala automática (decidida em 20/11/2026) ----------
   Segunda e quarta = T; terça e quinta = A; sexta alterna T/A semana sim, semana não (âncora 'rafaSextaRef' = uma
   sexta T). Sábado e domingo não são preenchidos sozinhos. O app só preenche dia vazio ou que ele mesmo preencheu
   (auto = true); o que você marcou à mão nunca é mexido, e mexer num dia vale só para aquele dia. */
const rafaDiaDe = (dia) => db.all('tempo_rafa_days').find(x => x.day === dia) || null;
const rafaQuem = (dia) => rafaDiaDe(dia)?.who || null;
function rafaSextaRef() {
  const ref = db.setting('rafaSextaRef', null); if (ref) return ref;
  // primeira vez: parte da sexta mais recente marcada (T ou A)
  const sx = db.all('tempo_rafa_days').filter(r => (r.who === 'T' || r.who === 'A') && new Date(r.day + 'T12:00:00').getDay() === 5).sort((a, b) => b.day.localeCompare(a.day))[0];
  if (!sx) return null;
  const d = new Date(sx.day + 'T12:00:00'); if (sx.who === 'A') d.setDate(d.getDate() + 7);
  return ymd(d);
}
function rafaQuemAuto(dia) {
  const wd = new Date(dia + 'T12:00:00').getDay();
  if (wd === 1 || wd === 3) return 'T';
  if (wd === 2 || wd === 4) return 'A';
  if (wd === 5) { const ref = rafaSextaRef(); if (!ref) return null; const sem = Math.round((new Date(dia + 'T12:00:00') - new Date(ref + 'T12:00:00')) / (7 * 864e5)); return ((sem % 2) + 2) % 2 === 0 ? 'T' : 'A'; }
  return null;
}
let _rafaAutoEm = 0;
/* Preenche de hoje até ~4 meses. Grava calado (sem redesenhar a tela). */
function rafaAutoPreencher(forcar = false) {
  if (!forcar && Date.now() - _rafaAutoEm < 10 * 60e3) return 0;
  _rafaAutoEm = Date.now();
  let n = 0; const d = new Date(); d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 125; i++, d.setDate(d.getDate() + 1)) {
    const dia = ymd(d); const q = rafaQuemAuto(dia); const r = rafaDiaDe(dia);
    if (r && !r.auto) continue;                       // à mão: não mexe
    if (!q) { if (r && r.auto && r.who) { db.update('tempo_rafa_days', r.id, { who: null }, true); n++; } continue; }
    if (!r) { db.insert('tempo_rafa_days', { day: dia, who: q, auto: true }, true); n++; }
    else if (r.who !== q) { db.update('tempo_rafa_days', r.id, { who: q }, true); n++; }
  }
  return n;
}
/* Marca um dia à mão (o app não mexe mais nele). */
function rafaMarcar(dia, patch) {
  const r = rafaDiaDe(dia);
  if (r) db.update('tempo_rafa_days', r.id, { ...patch, auto: false }, true); else db.insert('tempo_rafa_days', { day: dia, ...patch, auto: false }, true);
}

/* De quem é a nota do dia: T (Tulio), A (Amanda) ou N (neutro, cinza). */
const rafaNotaQuem = (dia) => (db.setting('rafaNotaQuem', {}) || {})[dia] || 'N';
ACTIONS['rafa-nq'] = (el) => { const inp = document.getElementById('rf-nq'); if (inp) inp.value = el.dataset.q; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); };
function rafaMap() {
  const map = {};
  db.all('tempo_rafa_days').forEach(r => { map[r.day] = r; });
  return map;
}

function rafaCount(rows) {
  const c = { T: 0, A: 0, M: 0, X: 0, vazio: 0 };
  rows.forEach(r => { if (r.who && c[r.who] !== undefined) c[r.who]++; else c.vazio++; });
  return c;
}

/* soma por dia da semana, só dos dias marcados */
function rafaByWeekday(rows) {
  const out = RF_WD.map(() => ({ T: 0, A: 0, M: 0, X: 0 }));
  rows.forEach(r => {
    if (!r.who) return;
    const [y, m, d] = r.day.split('-').map(Number);
    out[rafaWd(y, m, d)][r.who]++;
  });
  return out;
}

/* abre o editor de um dia */
ACTIONS['rafa-open'] = (el) => {
  const iso = el.dataset.day;
  const row = db.all('tempo_rafa_days').find(x => x.day === iso) || {};
  const [y, m, d] = iso.split('-').map(Number);
  const titulo = `${RF_WD[rafaWd(y, m, d)]}, ${d} de ${RF_MES[m - 1]} de ${y}`;
  const cur = row.who || '';
  const btn = (who, rot) => `<button type="button" class="rf-pick rf-pk-${who || 'none'}${cur === who ? ' on' : ''}" data-act="rafa-pick" data-who="${who}" aria-pressed="${cur === who}">${rot}</button>`;
  openLayer({
    html: `<div class="dh"><h2>${esc(titulo)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db">
      <div class="small muted" style="margin-bottom:6px">Quem fica com o Rafa</div>
      <div class="rf-picks">${btn('T', 'T')}${btn('A', 'A')}${btn('M', 'M')}${btn('X', 'T/A')}${btn('', 'Limpar')}</div>
      <input type="hidden" id="rf-who" value="${esc(cur)}">
      <div class="field" style="margin-top:14px"><span class="lbl">Horário</span>
        <input id="rf-hora" class="input" value="${esc(row.horario || '')}" placeholder="ex.: 8h às 18h"></div>
      <div class="field" style="margin-top:10px"><span class="lbl">Nota do dia <span class="faint">(aparece também no calendário do Planejamento)</span></span>
        <textarea id="rf-obs" class="input" rows="3" placeholder="ex.: dentista às 16h10">${esc(row.note || '')}</textarea>
        <div class="seg rf-nq" style="margin-top:6px">${[['T', 'Tulio'], ['A', 'Amanda'], ['N', 'Neutro']].map(([k, l]) => `<button type="button" class="${rafaNotaQuem(iso) === k ? 'on' : ''}" data-act="rafa-nq" data-q="${k}">${l}</button>`).join('')}</div>
        <input type="hidden" id="rf-nq" value="${rafaNotaQuem(iso)}"></div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn ghost" data-act="close-layer">Cancelar</button>
        <button class="btn" data-act="rafa-save" data-day="${iso}">Salvar</button>
      </div>
    </div>`,
  });
};

ACTIONS['rafa-pick'] = (el) => {
  document.getElementById('rf-who').value = el.dataset.who;
  $$('.rf-pick').forEach(b => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
};

ACTIONS['rafa-save'] = (el) => {
  const iso = el.dataset.day;
  const patch = {
    who: document.getElementById('rf-who').value || null,
    horario: document.getElementById('rf-hora').value.trim() || null,
    note: document.getElementById('rf-obs').value.trim() || null,
  };
  rafaMarcar(iso, patch);
  const nq = { ...(db.setting('rafaNotaQuem', {}) || {}) }; const q = document.getElementById('rf-nq')?.value || 'N';
  if (patch.note && q !== 'N') nq[iso] = q; else delete nq[iso];
  db.setSetting('rafaNotaQuem', nq); db.emit();
  document.querySelector('[data-act="close-layer"]')?.click();
  rafaPerguntarFimDeSemana(iso, patch.who);
};
/* Domingo T → "marcar o sábado como A?" (e o contrário; vale para sábado → domingo também). */
async function rafaPerguntarFimDeSemana(iso, who) {
  if (who !== 'T' && who !== 'A') return;
  const d = new Date(iso + 'T12:00:00'); const wd = d.getDay(); if (wd !== 0 && wd !== 6) return;
  const par = new Date(d); par.setDate(d.getDate() + (wd === 0 ? -1 : 1)); const pdia = ymd(par);
  const outro = who === 'T' ? 'A' : 'T'; if (rafaQuem(pdia) === outro) return;
  const nome = wd === 0 ? 'sábado' : 'domingo';
  if (await confirmBox({ title: `Marcar o ${nome} como ${outro}?`, body: `${nome[0].toUpperCase() + nome.slice(1)}, ${par.getDate()}/${par.getMonth() + 1}: ${RF_NOME[outro]}.`, ok: `Marcar ${outro}` })) { rafaMarcar(pdia, { who: outro }); db.emit(); }
}

ACTIONS['rafa-nav'] = (el) => {
  const [y, m] = RF.ym.split('-').map(Number);
  const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
  RF.ym = ymd(d).slice(0, 7);
  render();
};

ACTIONS['rafa-today'] = () => { RF.ym = ymd(new Date()).slice(0, 7); render(); };

VIEWS.rafa = () => {
  rafaAutoPreencher();
  const ym = RF.ym || ymd(new Date()).slice(0, 7);
  RF.ym = ym;
  const [y, m] = ym.split('-').map(Number);
  const map = rafaMap();
  const total = new Date(y, m, 0).getDate();

  /* semanas completas: da segunda do primeiro dia até o domingo do último */
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m - 1, total);
  const start = new Date(first); start.setDate(first.getDate() - rafaWd(y, m, 1));
  const end = new Date(last); end.setDate(last.getDate() + (6 - rafaWd(y, m, total)));
  const weeks = [];
  for (let cur = new Date(start); cur <= end;) {
    const w = [];
    for (let i = 0; i < 7; i++) { w.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(w);
  }

  const cellHTML = (dt) => {
    const iso = ymd(dt);
    const inMes = dt.getMonth() === m - 1;
    const r = map[iso] || {};
    const who = r.who || null;
    const we = rafaWd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()) >= 5 ? ' rf-we' : '';
    const off = inMes ? '' : ' rf-off';
    const tip = [who ? RF_NOME[who] : 'Sem marcação', r.auto && who ? 'marcado pelo app' : '', r.horario, r.note].filter(Boolean).join(' · ');
    return `<button type="button" class="rf-cell rf-${who || 'none'}${we}${off}${r.auto && who ? ' rf-auto' : ''}" data-act="rafa-open" data-day="${iso}" title="${esc(tip + (who ? ' · arraste para outro dia para trocar' : ''))}"${who ? ' draggable="true"' : ''} data-rf-drag="${iso}">
      <span class="rf-top"><span class="rf-n">${dt.getDate()}</span>${r.horario ? `<span class="rf-hr">${esc(r.horario)}</span>` : ''}</span>
      <span class="rf-w">${who === 'X' ? 'T/A' : (who || '·')}</span>
      ${r.note ? `<span class="rf-obs nq-${rafaNotaQuem(iso)}">${esc(r.note)}</span>` : ''}</button>`;
  };

  const weekRows = weeks.map(w => {
    const rows = w.map(dt => map[ymd(dt)]).filter(r => r && r.who);
    const c = rafaCount(rows);
    const lab = (c.T || c.A || c.M || c.X) ? `<span class="rf-t">T${c.T}</span> <span class="rf-a">A${c.A}</span>${c.M ? ` <span class="rf-m">M${c.M}</span>` : ''}${c.X ? ` <span class="rf-x">T/A${c.X}</span>` : ''}` : '<span class="faint">—</span>';
    return `<div class="rf-row">${w.map(cellHTML).join('')}<div class="rf-sum">${lab}</div></div>`;
  }).join('');

  /* totais do mês (só dias do próprio mês) */
  const monthRows = Object.values(map).filter(r => r.day.startsWith(ym));
  const mc = rafaCount(monthRows);
  const mwe = { T: 0, A: 0, M: 0 };
  monthRows.forEach(r => {
    const [yy, mm, dd] = r.day.split('-').map(Number);
    if (r.who && rafaWd(yy, mm, dd) >= 5 && mwe[r.who] !== undefined) mwe[r.who]++;
  });

  /* totais do ano */
  const yearRows = Object.values(map).filter(r => r.day.startsWith(String(y)));
  const yc = rafaCount(yearRows);
  const wdRows = rafaByWeekday(yearRows);
  const wdTable = RF_WD.map((nome, i) => `<tr><td>${nome}</td><td class="mono" style="text-align:right">${wdRows[i].T}</td><td class="mono" style="text-align:right">${wdRows[i].A}</td><td class="mono" style="text-align:right">${wdRows[i].M}</td><td class="mono" style="text-align:right">${wdRows[i].X}</td></tr>`).join('');

  const byMonth = RF_MES.map((nome, i) => {
    const rows = yearRows.filter(r => Number(r.day.slice(5, 7)) === i + 1);
    if (!rows.length) return '';
    const c = rafaCount(rows);
    return `<tr><td>${nome}</td><td class="mono" style="text-align:right">${c.T}</td><td class="mono" style="text-align:right">${c.A}</td><td class="mono" style="text-align:right">${c.M}</td><td class="mono" style="text-align:right">${c.X}</td><td class="mono" style="text-align:right">${c.vazio}</td></tr>`;
  }).join('');

  const mesTitulo = `${RF_MES[m - 1][0].toUpperCase()}${RF_MES[m - 1].slice(1)} de ${y}`;

  return { title: 'Dias de Rafa', html: `
  <div class="row" style="gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
    <span class="grow"></span>
    <button class="btn sm ghost" data-act="rafa-nav" data-d="-1">‹</button>
    <button class="btn sm ghost" data-act="rafa-today">Hoje</button>
    <button class="btn sm ghost" data-act="rafa-nav" data-d="1">›</button>
  </div>
  <div class="panel"><div class="panel-b">
    <div class="row between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <b>${mesTitulo}</b>
      <span class="small muted">T = Túlio (azul) · A = Amanda (rosa) · M = Maria Adélia (verde) · T/A = troca no dia · mais claro = preenchido pelo app (seg/qua T, ter/qui A, sexta alterna) · clique num dia para editar</span>
    </div>
    <div class="rf-head">${RF_WD.map(d => `<div>${d}</div>`).join('')}<div>Semana</div></div>
    ${weekRows}
  </div></div>

  <div class="grid2" style="margin-top:14px">
    <div class="panel"><div class="panel-h"><h3>Este mês</h3></div><div class="panel-b">
      <div class="row between"><span>Túlio</span><span class="mono">${mc.T} dias</span></div>
      <div class="row between"><span>Amanda</span><span class="mono">${mc.A} dias</span></div>
      <div class="row between"><span>Maria Adélia</span><span class="mono">${mc.M} dias</span></div>
      <div class="row between"><span>Troca no dia</span><span class="mono">${mc.X}</span></div>
      <div class="row between"><span>Sem marcação</span><span class="mono">${total - (mc.T + mc.A + mc.M + mc.X)}</span></div>
      <div class="row between small muted" style="margin-top:8px"><span>Fim de semana: Túlio ${mwe.T} · Amanda ${mwe.A} · M. Adélia ${mwe.M}</span></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h3>Ano ${y}</h3></div><div class="panel-b">
      <div class="row between"><span>Túlio</span><span class="mono">${yc.T} dias</span></div>
      <div class="row between"><span>Amanda</span><span class="mono">${yc.A} dias</span></div>
      <div class="row between"><span>Maria Adélia</span><span class="mono">${yc.M} dias</span></div>
      <div class="row between"><span>Troca no dia</span><span class="mono">${yc.X}</span></div>
      <div class="row between"><span>Sem marcação</span><span class="mono">${yc.vazio}</span></div>
    </div></div>
  </div>

  <div class="grid2" style="margin-top:14px">
    <div class="panel"><div class="panel-h"><h3>Por dia da semana (ano)</h3></div><div class="panel-b">
      <table class="rf-tbl"><thead><tr><th>Dia</th><th style="text-align:right">Túlio</th><th style="text-align:right">Amanda</th><th style="text-align:right">M. Adélia</th><th style="text-align:right">Troca</th></tr></thead><tbody>${wdTable}</tbody></table>
    </div></div>
    <div class="panel"><div class="panel-h"><h3>Por mês (ano)</h3></div><div class="panel-b">
      <table class="rf-tbl"><thead><tr><th>Mês</th><th style="text-align:right">Túlio</th><th style="text-align:right">Amanda</th><th style="text-align:right">M. Adélia</th><th style="text-align:right">Troca</th><th style="text-align:right">Vazio</th></tr></thead><tbody>${byMonth}</tbody></table>
    </div></div>
  </div>` };
};

/* Arrastar um dia para cima de outro troca quem fica com o Rafa nos dois (A ↔ T). Horário e nota ficam em cada dia. */
function rafaTrocar(a, b) {
  if (!a || !b || a === b) return;
  const ra = rafaDiaDe(a), rb = rafaDiaDe(b);
  const wa = ra?.who || null, wb = rb?.who || null;
  if (wa === wb) return;
  rafaMarcar(a, { who: wb }); rafaMarcar(b, { who: wa }); db.emit();
  toast(`Trocado: ${fmtDate(a)} agora ${wb || 'sem marcação'}, ${fmtDate(b)} agora ${wa || 'sem marcação'}.`);
}
if (typeof document !== 'undefined' && document.addEventListener) {
  let rfDe = null;
  document.addEventListener('dragstart', (e) => { const c = e.target.closest && e.target.closest('[data-rf-drag]'); if (!c) return; rfDe = c.dataset.rfDrag; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', rfDe); } catch (x) {} c.classList.add('rf-arrastando'); });
  document.addEventListener('dragover', (e) => { if (!rfDe) return; const c = e.target.closest && e.target.closest('[data-rf-drag]'); if (!c) return; e.preventDefault(); document.querySelectorAll('.rf-alvo').forEach(x => x !== c && x.classList.remove('rf-alvo')); c.classList.add('rf-alvo'); });
  document.addEventListener('drop', (e) => { if (!rfDe) return; const c = e.target.closest && e.target.closest('[data-rf-drag]'); if (!c) return; e.preventDefault(); const de = rfDe; rfDe = null; rafaTrocar(de, c.dataset.rfDrag); });
  document.addEventListener('dragend', () => { rfDe = null; document.querySelectorAll('.rf-alvo,.rf-arrastando').forEach(x => x.classList.remove('rf-alvo', 'rf-arrastando')); });
}
