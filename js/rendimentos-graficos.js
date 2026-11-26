/* Rendimentos: gráficos, meta de adicionar por mês e histórico previsto × real (V2.06.192).
   - "Adicionado por mês" = quanto as caixinhas SEM o Giro cresceram, menos o rendimento estimado. O Giro (reembolsos que vão e voltam) não conta.
   - Meta: começa em metaMes.valor e sobe de forma gradual até metaMes.alvo em metaMes.meses (padrão 3 mil → 6 mil em 12 meses).
   - A meta vale pela MÉDIA dos últimos 3 meses (tirar muito num mês e colocar no outro não pune). Verde = média bateu; vermelho = não.
   Dados: o.snaps (prints) e a previsão do motor. Guardado em tempo_settings 'rend' (metaMes). */
const REND_META_PADRAO = () => ({ valor: 3000, alvo: 6000, meses: 12, desde: '2026-11' });
const rendMetaCfg = (o) => ({ ...REND_META_PADRAO(), ...(o.metaMes || {}) });
const rendYmAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
function rendMetaDe(o, ym) {
  const c = rendMetaCfg(o); const i = Math.max(0, (Number(ym.slice(0, 4)) - Number(c.desde.slice(0, 4))) * 12 + Number(ym.slice(5, 7)) - Number(c.desde.slice(5, 7)));
  return Math.round(c.valor + (c.alvo - c.valor) * Math.min(1, i / Math.max(1, c.meses)));
}
const rendSemGiro = (o, saldos) => o.caixinhas.filter(c => c.id !== 'giro').reduce((s, c) => s + (saldos[c.id] || 0), 0);
const rendRendEst = (o, saldos) => o.caixinhas.filter(c => c.id !== 'giro').reduce((s, c) => s + (saldos[c.id] || 0) * (Math.pow(1 + rendTaxaDia(o.cdi, c.pct), 21) - 1) * (1 - rendIrPct(c.idade)), 0);
/* Saldo (sem Giro) no fim de cada mês, pelo último print até aquele mês; meses sem print nem anterior ficam de fora. */
function rendMesesReais(o) {
  const sn = o.snaps.slice().sort((a, b) => a.data < b.data ? -1 : 1); if (sn.length < 2) return [];
  const fimDe = (ym) => { const l = sn.filter(s => s.data.slice(0, 7) <= ym); return l[l.length - 1]; };
  const ini = sn[0].data.slice(0, 7), fim = sn[sn.length - 1].data.slice(0, 7), out = [];
  for (let ym = rendYmAdd(ini, 1); ym <= fim; ym = rendYmAdd(ym, 1)) {
    const a = fimDe(rendYmAdd(ym, -1)), b = fimDe(ym); if (!a || !b || a === b) continue;
    const aum = rendSemGiro(o, b.saldos) - rendSemGiro(o, a.saldos);
    out.push({ ym, aum, add: aum - rendRendEst(o, a.saldos), real: true });
  }
  return out;
}
/* Meses de previsão: entrou − saiu das caixinhas sem Giro (movimentos previstos). */
function rendMesesPrev(o, sim) {
  return sim.meses.slice(1, 13).map(m => {
    let e = 0, s = 0; o.caixinhas.filter(c => c.id !== 'giro').forEach(c => { e += m.porCx[c.id]?.entrou || 0; s += m.porCx[c.id]?.saiu || 0; });
    return { ym: m.ym, aum: e - s, add: e - s, real: false };
  });
}
function rendComMedia(o, meses) {
  return meses.map((m, i) => { const j = meses.slice(Math.max(0, i - 2), i + 1), media = j.reduce((t, x) => t + x.add, 0) / j.length, meta = rendMetaDe(o, m.ym); return { ...m, media, meta, ok: media >= meta - 0.5 }; });
}
const rendCorOk = 'var(--ok-ink, #1F7A3A)', rendCorBad = 'var(--bad, #C0392B)';
function rendBarrasSVG(itens) {
  if (!itens.length) return '';
  const W = 760, H = 220, pl = 52, pr = 10, pt = 14, pb = 28, n = itens.length;
  const vmax = Math.max(1, ...itens.map(x => Math.max(x.add, x.meta))), vmin = Math.min(0, ...itens.map(x => x.add));
  const y = (v) => pt + (vmax - v) / (vmax - vmin) * (H - pt - pb), bw = Math.min(34, (W - pl - pr) / n * 0.6), x = (i) => pl + (i + 0.5) * (W - pl - pr) / n;
  const grade = [0, 0.5, 1].map(f => { const v = vmin + (vmax - vmin) * f; return `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity=".1" stroke-width="1"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".55">${fmtMoney0(v)}</text>`; }).join('');
  const bars = itens.map((it, i) => {
    const cor = it.ok ? rendCorOk : rendCorBad, y0 = y(0), y1 = y(it.add), top = Math.min(y0, y1), h = Math.max(2, Math.abs(y1 - y0));
    const tip = `${rendMes(it.ym)}${it.real ? '' : ' (previsto)'}\nAdicionado: ${fmtMoney0(it.add)}\nMeta do mês: ${fmtMoney0(it.meta)}\nMédia dos 3 meses: ${fmtMoney0(it.media)} · ${it.ok ? 'bateu a meta' : 'abaixo da meta'}`;
    return `<g data-tip="${esc(tip)}"><rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="4" fill="${cor}" fill-opacity="${it.real ? .85 : .35}"${it.real ? '' : ` stroke="${cor}" stroke-dasharray="3 2"`}/><rect x="${x(i) - (W - pl - pr) / n / 2}" y="${pt}" width="${(W - pl - pr) / n}" height="${H - pt - pb}" fill="transparent"/><text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">${rendMes(it.ym)}</text></g>`;
  }).join('');
  const linMeta = itens.map((it, i) => `${i ? 'L' : 'M'}${x(i)},${y(it.meta)}`).join(' '), linMed = itens.map((it, i) => `${i ? 'L' : 'M'}${x(i)},${y(it.media)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-height:260px" role="img" aria-label="Quanto foi adicionado por mês nas caixinhas, sem o Giro, contra a meta">${grade}${bars}<path d="${linMeta}" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="4 3"/><path d="${linMed}" fill="none" stroke="currentColor" stroke-width="1.5"/>${itens.map((it, i) => `<circle cx="${x(i)}" cy="${y(it.media)}" r="3" fill="var(--bg, #fff)" stroke="currentColor" stroke-width="1.5"/>`).join('')}</svg>`;
}
const REND_CORES = ['#2F6FDB', '#E08A00', '#1F9D6B', '#8E5BD6', '#C0392B'];
function rendLinhasSVG(o, sim) {
  const ms = sim.meses.slice(0, 13); if (ms.length < 2) return '';
  const W = 760, H = 230, pl = 62, pr = 12, pt = 14, pb = 28, cx = o.caixinhas;
  const ser = cx.map(c => ms.map(m => (m.porCx[c.id]?.fim ?? m.porCx[c.id]?.ini ?? 0)));
  const tot = ms.map((m, i) => ser.reduce((s, l) => s + l[i], 0)); const all = [...tot];
  const vmax = Math.max(...all) * 1.05, vmin = Math.min(0, ...all);
  const x = (i) => pl + i * (W - pl - pr) / (ms.length - 1), y = (v) => pt + (vmax - v) / (vmax - vmin) * (H - pt - pb);
  const grade = [0, 0.5, 1].map(f => { const v = vmin + (vmax - vmin) * f; return `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity=".1"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".55">${fmtMoney0(v)}</text>`; }).join('');
  const linha = (vals, cor, w) => `<path d="${vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="${w}" stroke-linejoin="round"/>`;
  const pts = (vals, cor) => vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${cor}" fill-opacity=".25" stroke="${cor}" stroke-width="1.5"/>`).join('');
  const lab = ms.map((m, i) => (i % 2 === 0 || ms.length < 8) ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">${rendMes(m.ym)}</text>` : '').join('');
  const hit = ms.map((m, i) => `<rect x="${x(i) - (W - pl - pr) / (ms.length - 1) / 2}" y="${pt}" width="${(W - pl - pr) / (ms.length - 1)}" height="${H - pt - pb}" fill="transparent" data-tip="${esc(`${rendMes(m.ym)} (fim do mês)\nTotal: ${fmtMoney0(tot[i])}\n` + cx.map((c, k) => `${c.nome.split(' ')[0]}: ${fmtMoney0(ser[k][i])}`).join('\n'))}"/>`).join('');
  const leg = [...cx.map((c, k) => [c.nome.split(' ')[0], REND_CORES[k % 5]]), ['Total', 'currentColor']].map(([n, c]) => `<span class="row" style="gap:5px;align-items:center"><i style="width:14px;height:3px;border-radius:2px;background:${c};display:inline-block"></i><span class="small">${esc(n)}</span></span>`).join('');
  return `<div class="row" style="gap:12px;flex-wrap:wrap;margin-bottom:6px">${leg}</div><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-height:270px" role="img" aria-label="Saldo previsto de cada caixinha e o total nos próximos meses">${grade}${lab}${ser.map((l, k) => linha(l, REND_CORES[k % 5], 1.5) + pts(l, REND_CORES[k % 5])).join('')}${linha(tot, 'currentColor', 2)}${hit}</svg>`;
}
/* Histórico previsto × real: uma linha por print que tinha previsão. Pede revisão quando a diferença passa de 2% do total. */
function rendHistoricoHTML(o) {
  const l = o.snaps.filter(s => s.conf).sort((a, b) => a.data < b.data ? 1 : -1);
  if (!l.length) return `<div class="panel"><div class="panel-h"><h3>Previsto × real, mês a mês</h3></div><div class="panel-b small muted">Ainda não tem conferência. A cada print novo o app compara com o que tinha previsto e guarda aqui. Para criar o registro de meses passados, use "Atualizar com o print" com a data de prints antigos.</div></div>`;
  const nomeDe = (id) => o.caixinhas.find(c => c.id === id)?.nome || id;
  const rows = l.map(s => { const p = Object.values(s.conf).reduce((t, c) => t + c.prev, 0), r = Object.values(s.conf).reduce((t, c) => t + c.real, 0), d = r - p, pct = p ? d / p * 100 : 0, mau = Math.abs(pct) > 2;
    const det = Object.entries(s.conf).map(([id, c]) => `${nomeDe(id)}: previsto ${fmtMoney0(c.prev)}, real ${fmtMoney0(c.real)}`).join('\n');
    return `<tr data-tip="${esc(det)}"><td>${fmtDate(s.data)}</td><td class="num">${fmtMoney0(p)}</td><td class="num">${fmtMoney0(r)}</td><td class="num" style="color:${mau ? rendCorBad : rendCorOk}">${d >= 0 ? '+' : '−'} ${fmtMoney0(Math.abs(d))} (${pct.toFixed(1).replace('.', ',')}%)</td></tr>`; }).join('');
  const ult = l[0], pu = Object.values(ult.conf).reduce((t, c) => t + c.prev, 0), ru = Object.values(ult.conf).reduce((t, c) => t + c.real, 0), mal = pu && Math.abs((ru - pu) / pu) > 0.02;
  return `<div class="panel"><div class="panel-h"><h3>Previsto × real, mês a mês</h3></div>${mal ? `<div class="banner warn" style="margin:0 16px 8px"><span class="small">A previsão errou mais de 2% no último print. Entrou ou saiu algum valor que não está nos movimentos previstos? Me conte o que foi e eu ajusto as regras.</span></div>` : ''}<div class="panel-b tight"><table class="grid compact fin"><thead><tr><th>Print</th><th class="num">Previsto</th><th class="num">Real</th><th class="num">Diferença</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function rendGraficosHTML(o, sim, sn) {
  const itens = rendComMedia(o, [...rendMesesReais(o), ...rendMesesPrev(o, sim)]);
  const c = rendMetaCfg(o), hoje = ymd(new Date()).slice(0, 7), atual = itens.filter(x => x.ym <= hoje).slice(-1)[0] || itens[0];
  const status = atual ? `<span class="tag" style="color:${atual.ok ? rendCorOk : rendCorBad}" data-tip="Média dos últimos 3 meses contra a meta do mês. O Giro não entra na conta.">${atual.ok ? 'Meta batida' : 'Abaixo da meta'} · média ${fmtMoney0(atual.media)} de ${fmtMoney0(atual.meta)}</span>` : '';
  const campos = `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap" class="small"><span class="small muted">Meta de adicionar por mês:</span><input class="input sm" style="width:84px;text-align:right" value="${String(c.valor).replace('.', ',')}" data-on="rend-meta" data-k="valor" data-tip="Quanto você quer adicionar por mês (Apartamento, Turbo e Freelas; o Giro não conta)"><span class="small muted">chegando a</span><input class="input sm" style="width:84px;text-align:right" value="${String(c.alvo).replace('.', ',')}" data-on="rend-meta" data-k="alvo" data-tip="Valor que a meta atinge ao fim do prazo, subindo aos poucos"><span class="small muted">em</span><input class="input sm" style="width:46px;text-align:right" value="${c.meses}" data-on="rend-meta" data-k="meses" data-tip="Meses para subir da meta inicial até a final"><span class="small muted">meses</span></div>`;
  const barras = itens.length ? rendBarrasSVG(itens) : '<div class="empty small">Mande mais um print para ver o quanto cresceu; enquanto isso, a previsão aparece quando você lança movimentos previstos.</div>';
  const nota = `<div class="small muted" style="padding:6px 16px 12px">Adicionado = quanto as caixinhas (sem o Giro) cresceram, menos o rendimento estimado. A meta vale pela média dos últimos 3 meses: tirar muito num mês e repor no outro não pune. Barras vazadas são previsão. Linha cheia: média de 3 meses; tracejada: meta do mês.</div>`;
  return `<div class="panel"><div class="panel-h"><h3>Quanto foi adicionado por mês</h3><span class="grow"></span>${status}</div><div class="panel-b" style="display:grid;gap:10px">${campos}${barras}</div>${nota}</div>
    <div class="panel"><div class="panel-h"><h3>Saldo previsto das caixinhas</h3></div><div class="panel-b">${rendLinhasSVG(o, sim)}</div></div>
    ${rendHistoricoHTML(o)}`;
}
CHANGES['rend-meta'] = (el) => {
  const o = rendGet(), n = rendNum(el.value); if (n === null || n < 0) return;
  o.metaMes = { ...rendMetaCfg(o), [el.dataset.k]: el.dataset.k === 'meses' ? Math.max(1, Math.round(n)) : n }; rendSave(o);
};
