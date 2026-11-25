/* Gráficos de tempo: barras horizontais (tarefa, projeto) e colunas empilhadas por mês (projeto, cliente, agência). */
const CHART_FALLBACK = GRAF_CINZA;

/* Padrão de gráficos: cada item tem uma chave (data-hk). Dentro do mesmo [data-hkroot], passar o mouse num item
   ou num chip acende esse item e esmaece o resto. Tudo mostra a parte, a % e o valor. */
function hkPct(v, tot) { return (tot > 0 ? v / tot * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
const fmtKey = (f) => (f === fmtDur ? 'dur' : f === fmtH ? 'h' : f === fmtMoney0 ? 'money' : '');
function stdBarsHTML(items, fmtVal, total = null) {
  const rows = items.filter(i => i.v > 0);
  if (!rows.length) return '<div class="faint small">Sem registro.</div>';
  const tot = total || rows.reduce((s, i) => s + i.v, 0);
  const max = Math.max(...rows.map(i => i.v));
  const bars = rows.map(i => `<div class="bar-row" data-hk="${esc(i.key)}" data-hkv="${i.v}"><span class="lab" title="${esc(i.label)}">${esc(i.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${(i.v / max * 100).toFixed(1)}%;background:${corGraf(i.color) || GRAF_CORES[0]}"></div></div><span class="val mono">${fmtVal(i.v)} · ${hkPct(i.v, tot)}</span></div>`).join('');
  const chips = rows.map(i => `<span class="act-chip" data-hk="${esc(i.key)}" data-hkv="${i.v}" style="--tb:${corGraf(i.color) || GRAF_CORES[0]}"><i></i>${esc(i.label)} <span class="faint">${hkPct(i.v, tot)} · ${fmtVal(i.v)}</span></span>`).join('');
  return `<div data-hkroot data-hktot="${tot}" data-hkfmt="${fmtKey(fmtVal)}"><div class="bars">${bars}</div><div class="act-chips" style="margin-top:8px">${chips}</div></div>`;
}
function hbarsHTML(items) {
  const rows = items.filter(i => i.ms > 0).sort((a, b) => b.ms - a.ms);
  if (!rows.length) return '<div class="faint small">Sem tempo registrado.</div>';
  return stdBarsHTML(rows.map(r => ({ key: r.label, label: r.label, v: r.ms, color: r.color })), fmtH);
}

/* 12 meses, uma coluna por mês; cada coluna empilha o tempo de cada chave (projeto, por exemplo). */
function monthsHTML(entries, keyOf, labelOf, colorOf) {
  const now = new Date(); const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, name: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') });
  }
  const data = {}, keys = {};
  entries.forEach(e => {
    const m = ymd(entryStart(e)).slice(0, 7); if (!months.some(x => x.k === m)) return;
    const k = keyOf(e); data[m] = data[m] || {}; data[m][k] = (data[m][k] || 0) + entryMs(e); keys[k] = true;
  });
  const totals = months.map(m => Object.values(data[m.k] || {}).reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  if (!totals.some(Boolean)) return '<div class="faint small">Sem tempo nos últimos 12 meses.</div>';
  const cols = months.map((m, idx) => {
    const parts = Object.entries(data[m.k] || {}).sort((a, b) => b[1] - a[1]);
    return `<div class="mcol" title="${m.name}: ${fmtH(totals[idx])}"><div class="mstack" style="height:${(totals[idx] / max * 100).toFixed(1)}%">${parts.map(([k, ms]) => `<span data-hk="${esc(labelOf(k))}" style="flex:0 0 ${(ms / totals[idx] * 100).toFixed(2)}%;background:${corGraf(colorOf(k))}" title="${esc(labelOf(k))} · ${fmtH(ms)} · ${hkPct(ms, totals[idx])} deste mês"></span>`).join('')}</div><span class="mlab">${m.name}</span></div>`;
  }).join('');
  const grand = totals.reduce((s, v) => s + v, 0);
  const kt = (k) => months.reduce((s, m) => s + ((data[m.k] || {})[k] || 0), 0);
  const legend = Object.keys(keys).map(k => `<span class="act-chip" data-hk="${esc(labelOf(k))}" data-hkv="${kt(k)}" style="--tb:${corGraf(colorOf(k))}"><i></i>${esc(labelOf(k))} <span class="faint">${hkPct(kt(k), grand)} · ${fmtH(kt(k))}</span></span>`).join('');
  return `<div data-hkroot data-hktot="${grand}" data-hkfmt="h"><div class="mchart">${cols}</div><div class="act-chips" style="margin-top:8px">${legend}</div></div>`;
}

/* Aba Tempo do projeto: tempo por tarefa e valor por hora efetivo. */
function projectTaskChartHTML(p, es) {
  const byTask = {}; es.forEach(e => { const k = e.task_id || '_'; byTask[k] = (byTask[k] || 0) + entryMs(e); });
  const items = Object.entries(byTask).map(([k, ms], i) => ({ label: k === '_' ? 'Sem tarefa' : (db.get('tempo_tasks', k)?.name || 'Tarefa'), ms, color: ACT_COLORS[i % ACT_COLORS.length] }));
  const rate = effectiveRate(p);
  return `<div class="panel" style="margin-bottom:14px"><div class="panel-h"><h3>Tempo por tarefa</h3><span class="grow"></span><span class="small muted">Valor por hora efetivo: ${rate ? fmtMoney(rate) : '—'}</span></div><div class="panel-b">${hbarsHTML(items)}</div></div>`;
}

/* Cliente e agência: tempo por projeto e colunas mensais empilhadas por projeto. */
function partyChartsHTML(ps) {
  if (!ps.length) return '';
  const entries = ps.flatMap(p => db.where('tempo_time_entries', e => e.project_id === p.id));
  const pcol = Object.fromEntries(ps.map((p, i) => [p.id, p.color ? hexOf(p.color) : ACT_COLORS[i % ACT_COLORS.length]]));
  const pname = (k) => db.get('tempo_projects', k)?.name || 'Projeto';
  const items = ps.map(p => ({ label: p.name, ms: projectMs(p.id), color: pcol[p.id] }));
  return `<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Tempo por projeto</h3></div><div class="panel-b">${hbarsHTML(items)}</div></div>
    <div class="panel" style="margin-bottom:12px"><div class="panel-h"><h3>Últimos 12 meses</h3></div><div class="panel-b">${monthsHTML(entries, e => e.project_id, pname, k => pcol[k] || CHART_FALLBACK)}</div></div>`;
}

/* Gráfico de linha no padrão do app (paleta única, grade clara, rótulos cinza), pequeno o bastante para caber numa dica.
   Usado ao passar o mouse numa categoria: evolução mês a mês. fmt formata os valores (ex.: dinheiro curto). */
function linhaMiniSVG(rotulos, valores, fmt = (v) => String(v), cor = GRAF_CORES[0], W = 300, H = 120, fmtPonto = null) {
  const vs = valores.map(v => Number(v) || 0); if (!vs.length) return '';
  const bruto = Math.max(...vs) || 1, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const max = [1, 2, 2.5, 5, 10].map(f => f * pot).find(x => x >= bruto);
  const L = 44, R = 8, T = 8, B = 20, pw = W - L - R, ph = H - T - B, step = vs.length > 1 ? pw / (vs.length - 1) : 0;
  const px = (i) => L + (vs.length > 1 ? step * i : pw / 2), py = (v) => T + ph - ph * v / max;
  const grid = [0, .5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${py(max * f).toFixed(1)}" y2="${py(max * f).toFixed(1)}" stroke="#E0E3EA"/><text x="${L - 5}" y="${(py(max * f) + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="#8A909F">${esc(fmt(max * f))}</text>`).join('');
  const pts = vs.map((v, i) => [px(i), py(v)]);
  const area = `M${pts[0][0].toFixed(1)},${(T + ph).toFixed(1)} ${pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${pts[pts.length - 1][0].toFixed(1)},${(T + ph).toFixed(1)} Z`;
  const linha = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const cada = Math.ceil(rotulos.length / 6);
  const xl = rotulos.map((r, i) => i % cada && i !== rotulos.length - 1 ? '' : `<text x="${px(i).toFixed(1)}" y="${H - 6}" font-size="9" text-anchor="middle" fill="#8A909F">${esc(r)}</text>`).join('');
  // com fmtPonto (gráfico fixo): cada bolinha tem uma área maior de mouse e a dica com o mês e o valor exato
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 3.5 : 2.5}" fill="#fff" stroke="${cor}" stroke-width="2"/>${fmtPonto ? `<circle class="lm-alvo" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="11" fill="transparent" data-tip="${esc(`${rotulos[i]}\n${fmtPonto(vs[i])}`)}"/>` : ''}`).join('');
  return `<svg class="linha-mini" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${grid}<path d="${area}" fill="${cor}" opacity=".16"/><path d="${linha}" fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round"/>${dots}${xl}</svg>`;
}
/* Dica com gráfico: data-tipg='{"t":"Título","r":[rótulos],"v":[valores],"u":"R$","s":"linha extra"}'
   fixo = true: versão maior, para o cartão que fica parado depois do clique (bolinhas com o valor no mouse). */
function tipGrafHTML(raw, fixo = false) {
  let d; try { d = JSON.parse(raw); } catch (e) { return ''; }
  const exato = d.u === 'R$' ? (v) => fmtMoney(v) || 'R$ 0' : d.u === 'h' ? (v) => fmtH(v) : (v) => String(v);
  if (fixo) return `<div class="tg-fixo-h"><b>${esc(d.t || '')}</b><button type="button" class="btn sm icon ghost" data-tg-x aria-label="Fechar o gráfico" title="Fechar o gráfico">${icon('x')}</button></div>${d.s ? `<div class="small muted">${esc(d.s)}</div>` : ''}${linhaMiniSVG(d.r || [], d.v || [], (v) => (Math.abs(v) >= 1000 && d.u === 'R$' ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : d.u === 'R$' ? 'R$ ' + Math.round(v).toLocaleString('pt-BR') : exato(v)), corGraf(d.c) || GRAF_CORES[0], 460, 190, exato)}<div class="tg-fixo-rod small muted">Passe o mouse nas bolinhas para ver o valor de cada mês.</div>`;
  const fmt = d.u === 'R$' ? (v) => (Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : 'R$ ' + Math.round(v).toLocaleString('pt-BR')) : d.u === 'h' ? (v) => fmtH(v) : (v) => String(Math.round(v));
  return `<div class="tip-h">${esc(d.t || '')}</div>${d.s ? `<div>${esc(d.s)}</div>` : ''}${linhaMiniSVG(d.r || [], d.v || [], fmt, corGraf(d.c) || GRAF_CORES[0])}`;
}

/* Clicar num item com gráfico de dica (data-tipg) deixa o gráfico parado num cartão: dá para passar o mouse em cada
   bolinha e ver o valor. Fecha no X, clicando fora ou com Esc. */
let TG_FIXO = null;
function tgFecha() { if (TG_FIXO) { TG_FIXO.remove(); TG_FIXO = null; } }
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', (e) => {
    if (TG_FIXO && (e.target.closest?.('[data-tg-x]') || !TG_FIXO.contains(e.target))) { const era = TG_FIXO; tgFecha(); if (!e.target.closest?.('[data-tipg]') || era.dataset.src === e.target.closest('[data-tipg]')?.dataset.tipg) return; }
    const el = e.target.closest?.('[data-tipg]'); if (!el || (TG_FIXO && TG_FIXO.contains(el))) return;
    e.preventDefault(); e.stopPropagation();
    if (typeof tipEsconde === 'function') tipEsconde();
    const box = document.createElement('div'); box.className = 'tg-fixo'; box.dataset.src = el.dataset.tipg; box.setAttribute('role', 'dialog');
    box.innerHTML = tipGrafHTML(el.dataset.tipg, true); document.body.appendChild(box); TG_FIXO = box;
    const r = el.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    const x = Math.max(8, Math.min(r.left, innerWidth - w - 8)); const y = r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8);
    box.style.left = x + 'px'; box.style.top = y + 'px';
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tgFecha(); });
  document.addEventListener('scroll', (e) => { if (TG_FIXO && !TG_FIXO.contains(e.target)) tgFecha(); }, true);
}
