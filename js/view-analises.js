/* Análises: relatórios gerados por tarefas agendadas (Claude) e gravados em tempo_settings.
   Chaves: prodSemanal:AAAA-MM-DD (segunda), prodMensal:AAAA-MM, relTrimestral:AAAA-Tn, relSemestral:AAAA-Sn, relAnual:AAAA.
   Formato do valor (todos os campos opcionais; os antigos da semana e do mês continuam valendo):
   { periodo_inicio, periodo_fim, gerado_em, titulo, resumo,
     kpis: [{ rotulo, valor, detalhe, tendencia: 'sobe'|'desce'|'igual', bom: true|false|null }],
     graficos: [{ titulo, tipo: 'barras'|'colunas'|'linha', unidade: 'h'|'R$'|'%'|'', rotulos: [], series: [{ nome, valores: [] }], nota }],
     secoes: [{ titulo, itens: [] }], comparacoes: { chave: texto }, analises: [], sugestoes: [],
     acompanhamento: [{ sugestao, seguiu: 'sim'|'não'|'parcial'|'sem dados', resultado }],
     metas_passadas, metas_novas, metas_nota, meta, ideias_tempo: [] }
   O botão PDF monta uma página A4 com estilo próprio: no app do Mac vira arquivo em iCloud/Tempo/Análises; no navegador, imprimir. */
const AN_TIPOS = [
  { id: 'semana', label: 'Semana', prefix: 'prodSemanal:', quando: 'toda segunda às 7h13' },
  { id: 'mes', label: 'Mês', prefix: 'prodMensal:', quando: 'no dia 1 às 7h20' },
  { id: 'tri', label: '3 meses', prefix: 'relTrimestral:', quando: 'em 1º de janeiro, abril, julho e outubro' },
  { id: 'sem', label: '6 meses', prefix: 'relSemestral:', quando: 'em 1º de janeiro e 1º de julho' },
  { id: 'ano', label: 'Ano', prefix: 'relAnual:', quando: 'em 1º de janeiro' },
];
const AN_CORES = ['#3B5BDB', '#2F9E44', '#E8590C', '#9C36B5', '#1098AD', '#C2255C'];
const AN = { tipo: 'semana', key: null };

function anLista(prefix) {
  return db.all('tempo_settings').filter(r => String(r.key || '').startsWith(prefix)).map(r => {
    let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    return v && typeof v === 'object' ? { key: r.key, v } : null;
  }).filter(Boolean).sort((a, b) => String(b.key).localeCompare(String(a.key)));
}
const anIni = (v) => v.periodo_inicio || v.semana_inicio || v.mes_inicio || '';
const anFim = (v) => v.periodo_fim || v.semana_fim || v.mes_fim || '';
const anData = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? fmtDate(String(s).slice(0, 10)) : esc(s || ''));
function anTitulo(t, v) {
  if (v.titulo) return v.titulo;
  return `${t.id === 'semana' ? 'Semana' : t.id === 'mes' ? 'Mês' : t.label} · ${anData(anIni(v))} a ${anData(anFim(v))}`;
}
function anFmt(n, u) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const x = Number(n);
  if (u === 'R$') return fmtMoney(x);
  const t = x.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(x) < 10 ? 1 : 0 });
  return u === '%' ? t + '%' : u ? `${t} ${u}` : t;
}

/* Gráficos em SVG com cores fixas: o mesmo desenho serve na tela e no PDF. */
function anChartSVG(g) {
  const rot = Array.isArray(g.rotulos) ? g.rotulos.map(String) : [];
  const series = (Array.isArray(g.series) ? g.series : []).filter(s => Array.isArray(s.valores)).slice(0, 6);
  if (!rot.length || !series.length) return '';
  const u = g.unidade || '';
  const all = series.flatMap(s => s.valores.map(Number).filter(x => !isNaN(x)));
  // topo do eixo arredondado (1, 2, 2,5, 5 × 10ⁿ) para as linhas de grade caírem em números redondos
  const bruto = Math.max(0, ...all) || 1, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const max = [1, 2, 2.5, 5, 10].map(f => f * pot).find(x => x >= bruto);
  const legenda = series.length > 1 ? `<div class="an-leg">${series.map((s, i) => `<span><i style="background:${AN_CORES[i]}"></i>${esc(s.nome || '')}</span>`).join('')}</div>` : '';
  const head = `<div class="an-chart"><div class="an-chart-t">${esc(g.titulo || '')}</div>`;
  const foot = `${legenda}${g.nota ? `<div class="an-note">${esc(g.nota)}</div>` : ''}</div>`;
  if (g.tipo === 'barras') {
    const lh = 26, W = 640, lab = 150, valW = 90;
    const bh = Math.max(8, (lh - 8) / series.length);
    let y = 4, out = '';
    rot.forEach((r, i) => {
      out += `<text x="0" y="${y + (lh - 6) / 2 + 4}" font-size="12" fill="#495057">${esc(r.length > 22 ? r.slice(0, 21) + '…' : r)}</text>`;
      series.forEach((s, k) => {
        const v = Number(s.valores[i]) || 0, w = Math.max(v > 0 ? 2 : 0, (W - lab - valW) * v / max);
        out += `<rect x="${lab}" y="${y + k * bh}" width="${w.toFixed(1)}" height="${bh - 2}" rx="3" fill="${AN_CORES[k]}"/>`;
        if (series.length === 1 || k === series.length - 1) out += `<text x="${lab + w + 6}" y="${y + k * bh + bh - 4}" font-size="11" fill="#212529">${esc(anFmt(s.valores[i], u))}</text>`;
      });
      y += Math.max(lh, bh * series.length + 6);
    });
    return `${head}<svg viewBox="0 0 ${W} ${y + 4}" width="100%" role="img" aria-label="${esc(g.titulo || '')}" font-family="inherit">${out}</svg>${foot}`;
  }
  // colunas e linha: eixo com 4 linhas de grade
  const W = 640, H = 220, L = 54, B = 28, T = 10, R = 10, pw = W - L - R, ph = H - B - T;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => { const yy = T + ph - ph * f; return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E9ECEF"/><text x="${L - 6}" y="${yy + 4}" font-size="10" text-anchor="end" fill="#868E96">${esc(anFmt(max * f, u))}</text>`; }).join('');
  const step = pw / rot.length;
  const xl = rot.map((r, i) => `<text x="${L + step * i + step / 2}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#495057">${esc(r.length > 10 ? r.slice(0, 9) + '…' : r)}</text>`).join('');
  let marks = '';
  if (g.tipo === 'linha') {
    series.forEach((s, k) => {
      const pts = rot.map((_, i) => { const v = Number(s.valores[i]); return isNaN(v) ? null : [L + step * i + step / 2, T + ph - ph * v / max]; });
      const d = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      marks += `<path d="${d}" fill="none" stroke="${AN_CORES[k]}" stroke-width="2.5" stroke-linejoin="round"/>`;
      pts.forEach((p, i) => { if (p) marks += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="#fff" stroke="${AN_CORES[k]}" stroke-width="2"><title>${esc(rot[i])}: ${esc(anFmt(s.valores[i], u))}</title></circle>`; });
    });
  } else {
    const gw = step * 0.7, bw = gw / series.length;
    series.forEach((s, k) => rot.forEach((r, i) => {
      const v = Number(s.valores[i]) || 0, h = ph * v / max, x = L + step * i + (step - gw) / 2 + bw * k;
      marks += `<rect x="${x.toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${AN_CORES[k]}"><title>${esc(r)}: ${esc(anFmt(s.valores[i], u))}</title></rect>`;
      if (series.length === 1 && rot.length <= 14 && v > 0) marks += `<text x="${(x + (bw - 2) / 2).toFixed(1)}" y="${(T + ph - h - 4).toFixed(1)}" font-size="10" text-anchor="middle" fill="#212529">${esc(anFmt(v, u))}</text>`;
    }));
  }
  return `${head}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(g.titulo || '')}" font-family="inherit">${grid}${marks}${xl}</svg>${foot}`;
}

const AN_COMP_NOMES = { semana_anterior: 'Semana anterior', media_mes: 'Média do mês', media_ano: 'Média do ano', media_sempre: 'Média de sempre', mes_passado: 'Mês passado', mes_anterior: 'Mês anterior', mesmo_mes_ano_passado: 'Mesmo mês do ano passado', meses: 'Meses entre si', trimestres: 'Trimestres', trimestre_ano_passado: 'Trimestre do ano passado', meta_financeira: 'Meta financeira' };
function anLista2(xs) { return Array.isArray(xs) && xs.length ? `<ul class="an-ul">${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''; }
function anBloco(titulo, corpo) { return corpo ? `<section class="an-sec"><h4>${esc(titulo)}</h4>${corpo}</section>` : ''; }

/* Corpo do relatório (igual na tela e no PDF). */
function anCorpoHTML(v) {
  const kpis = Array.isArray(v.kpis) && v.kpis.length ? `<div class="an-kpis">${v.kpis.slice(0, 8).map(k => {
    const seta = k.tendencia === 'sobe' ? '▲' : k.tendencia === 'desce' ? '▼' : k.tendencia === 'igual' ? '■' : '';
    const cls = k.bom === true ? 'bom' : k.bom === false ? 'ruim' : '';
    return `<div class="an-kpi ${cls}"><div class="k">${esc(k.rotulo || '')}</div><div class="v">${esc(k.valor ?? '')}</div>${k.detalhe ? `<div class="d">${seta ? `<b>${seta}</b> ` : ''}${esc(k.detalhe)}</div>` : ''}</div>`;
  }).join('')}</div>` : '';
  // análises antigas (só números de produtividade) ganham destaques a partir de "numeros"
  const n = v.numeros || {};
  const kpisAntigos = !kpis && Object.keys(n).length ? `<div class="an-kpis">${[
    ['Produtivo', n.produtivo_ms !== undefined ? fmtH(n.produtivo_ms) : null],
    ['% produtivo', n.pct_produtivo !== undefined ? usePctTxt(Number(n.pct_produtivo)) : null],
    ['Distração', n.distracao_ms !== undefined ? fmtH(n.distracao_ms) : null],
    ['Maior bloco', n.maior_bloco_ms !== undefined ? fmtH(n.maior_bloco_ms) : null],
  ].filter(x => x[1] !== null).map(([k, val]) => `<div class="an-kpi"><div class="k">${k}</div><div class="v">${esc(val)}</div></div>`).join('')}</div>` : '';
  const graficos = Array.isArray(v.graficos) ? v.graficos.map(anChartSVG).filter(Boolean) : [];
  const comps = v.comparacoes && typeof v.comparacoes === 'object' ? Object.entries(v.comparacoes).filter(([, t]) => t) : [];
  const acomp = Array.isArray(v.acompanhamento) && v.acompanhamento.length ? `<table class="an-tab"><thead><tr><th>Sugestão</th><th>Seguiu?</th><th>Resultado</th></tr></thead><tbody>${v.acompanhamento.map(a => `<tr><td>${esc(a.sugestao || '')}</td><td><span class="an-pill ${a.seguiu === 'sim' ? 'bom' : a.seguiu === 'não' ? 'ruim' : ''}">${esc(a.seguiu || '—')}</span></td><td>${esc(a.resultado || '')}</td></tr>`).join('')}</tbody></table>` : '';
  const metas = (titulo, xs) => Array.isArray(xs) && xs.length ? `<div class="an-metas"><div class="an-sub">${esc(titulo)}</div>${xs.map(x => `<div class="an-meta ${x.conquistada === true ? 'bom' : ''}"><b>${esc(x.nome || '')}</b><span>${x.alvo ? 'Meta: ' + esc(x.alvo) : ''}${x.resultado ? ' · ' + esc(x.resultado) : ''}</span>${x.conquistada === true ? '<em>⭐ conquistada</em>' : x.conquistada === false ? '<em class="no">não bateu</em>' : ''}</div>`).join('')}</div>` : '';
  return `${v.resumo ? `<p class="an-resumo">${esc(v.resumo)}</p>` : ''}
    ${kpis || kpisAntigos}
    ${graficos.length ? `<div class="an-graficos">${graficos.join('')}</div>` : ''}
    ${(Array.isArray(v.secoes) ? v.secoes : []).map(s => anBloco(s.titulo || '', anLista2(s.itens))).join('')}
    ${anBloco('Análise', anLista2(v.analises))}
    ${comps.length ? anBloco('Comparações', `<dl class="an-dl">${comps.map(([k, t]) => `<dt>${esc(AN_COMP_NOMES[k] || k.replace(/_/g, ' '))}</dt><dd>${esc(t)}</dd>`).join('')}</dl>`) : ''}
    ${anBloco('Sugestões', anLista2(v.sugestoes) + (v.meta?.texto ? `<div class="an-destaque">Meta sugerida: ${esc(v.meta.texto)}</div>` : ''))}
    ${anBloco('Sugestões anteriores: o que aconteceu', acomp)}
    ${anBloco('Metas', metas('Período que passou', v.metas_passadas) + metas('Próximo período', v.metas_novas) + (v.metas_nota ? `<div class="an-note">${esc(v.metas_nota)}</div>` : ''))}
    ${anBloco('Ideias para o Tempo', anLista2(v.ideias_tempo))}`;
}

/* Estilo do PDF (A4), independente do CSS do app. */
const AN_PDF_CSS = `@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;color:#212529;font-size:11.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{padding:44px 48px}.capa{background:#1F2A44;color:#fff;padding:40px 48px 30px}.capa .tag{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.7}.capa h1{font-size:26px;margin:6px 0 4px;font-weight:700}.capa .per{opacity:.8;font-size:12px}
.an-resumo{font-size:13.5px;line-height:1.55;margin:0 0 18px;padding:14px 16px;background:#F1F3F5;border-left:4px solid #3B5BDB;border-radius:6px}
.an-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 18px}.an-kpi{border:1px solid #DEE2E6;border-radius:10px;padding:10px 12px;break-inside:avoid}.an-kpi .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#868E96;font-weight:600}.an-kpi .v{font-size:19px;font-weight:700;margin:2px 0}.an-kpi .d{font-size:10px;color:#495057}.an-kpi.bom .d b{color:#2F9E44}.an-kpi.ruim .d b{color:#E03131}.an-kpi.bom{border-top:3px solid #2F9E44}.an-kpi.ruim{border-top:3px solid #E03131}
.an-graficos{display:grid;grid-template-columns:1fr;gap:14px;margin:0 0 10px}.an-chart{border:1px solid #DEE2E6;border-radius:10px;padding:12px 14px;break-inside:avoid}.an-chart-t{font-weight:700;font-size:12.5px;margin-bottom:6px}.an-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:#495057;margin-top:4px}.an-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.an-sec{margin:16px 0 0;break-inside:avoid}.an-sec h4{font-size:13px;margin:0 0 6px;padding-bottom:4px;border-bottom:2px solid #E9ECEF;color:#1F2A44}.an-ul{margin:0;padding-left:18px}.an-ul li{margin:3px 0}
.an-dl{display:grid;grid-template-columns:150px 1fr;gap:4px 12px;margin:0}.an-dl dt{font-weight:600;color:#495057}.an-dl dd{margin:0}
.an-tab{width:100%;border-collapse:collapse;font-size:10.5px}.an-tab th{text-align:left;background:#F1F3F5;padding:6px 8px}.an-tab td{padding:6px 8px;border-top:1px solid #E9ECEF;vertical-align:top}
.an-pill{display:inline-block;padding:1px 8px;border-radius:99px;background:#E9ECEF;font-size:10px}.an-pill.bom{background:#D3F9D8;color:#2B8A3E}.an-pill.ruim{background:#FFE3E3;color:#C92A2A}
.an-metas{margin-top:6px}.an-sub{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#868E96;margin:6px 0 4px}.an-meta{display:flex;gap:10px;align-items:baseline;padding:6px 10px;border:1px solid #E9ECEF;border-radius:8px;margin:4px 0}.an-meta.bom{background:#EBFBEE;border-color:#B2F2BB}.an-meta span{color:#495057;flex:1}.an-meta em{font-style:normal;font-size:10px;color:#2B8A3E}.an-meta em.no{color:#868E96}
.an-destaque{margin-top:8px;padding:8px 12px;background:#EDF2FF;border-radius:8px;font-weight:600;color:#3B5BDB}.an-note{font-size:10px;color:#868E96;margin-top:4px}
.rod{margin-top:28px;padding-top:8px;border-top:1px solid #E9ECEF;font-size:9.5px;color:#ADB5BD;display:flex;justify-content:space-between}`;
function anPdfHTML(t, v) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(anTitulo(t, v))}</title><style>${AN_PDF_CSS}</style></head><body>
<div class="capa"><div class="tag">Tempo · Análise ${esc(t.label.toLowerCase())}</div><h1>${esc(anTitulo(t, v))}</h1><div class="per">Período de ${anData(anIni(v))} a ${anData(anFim(v))}</div></div>
<div class="pg">${anCorpoHTML(v)}<div class="rod"><span>Tulio · APP TEMPO</span><span>Gerado em ${esc(String(v.gerado_em || '').slice(0, 16).replace('T', ' '))}</span></div></div></body></html>`;
}
function anPdfNome(t, v) { return `Analise_${t.label.replace(/\s+/g, '')}_${String(anIni(v) || 'periodo').slice(0, 10)}`; }

function anAtual() {
  const t = AN_TIPOS.find(x => x.id === AN.tipo) || AN_TIPOS[0];
  const lista = anLista(t.prefix);
  const item = lista.find(x => x.key === AN.key) || lista[0] || null;
  return { t, lista, item };
}
ACTIONS['an-tipo'] = (el) => { AN.tipo = el.dataset.tipo; AN.key = null; render(); };
CHANGES['an-periodo'] = (el) => { AN.key = el.value; render(); };
ACTIONS['an-pdf'] = () => {
  const { t, item } = anAtual(); if (!item) return;
  const html = anPdfHTML(t, item.v);
  if (isMacApp()) {
    try { window.webkit.messageHandlers.tempo.postMessage({ type: 'pdf', html, nome: anPdfNome(t, item.v) }); toast('Gerando o PDF…'); }
    catch (e) { toast('Não consegui gerar o PDF.'); }
    return;
  }
  // navegador/celular: abre a página do relatório e chama imprimir (dá para salvar como PDF)
  const w = window.open('', '_blank');
  if (!w) { toast('Permita janelas pop-up para gerar o PDF.'); return; }
  w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
};
if (window.TempoBridge) window.TempoBridge.pdfDone = (ok) => toast(ok ? 'PDF salvo em iCloud › Tempo › Análises' : 'Não consegui gerar o PDF.');

VIEWS.analises = () => {
  const { t, lista, item } = anAtual();
  const abas = `<div class="an-abas" role="tablist">${AN_TIPOS.map(x => `<button class="btn sm ${x.id === t.id ? '' : 'ghost'}" role="tab" aria-selected="${x.id === t.id}" data-act="an-tipo" data-tipo="${x.id}">${x.label}</button>`).join('')}</div>`;
  const periodo = lista.length ? `<select class="input sm" data-on="an-periodo" aria-label="Período">${lista.map(x => `<option value="${esc(x.key)}" ${item && x.key === item.key ? 'selected' : ''}>${esc(anData(anIni(x.v)))} a ${esc(anData(anFim(x.v)))}</option>`).join('')}</select>` : '';
  const pdf = item ? `<button class="btn sm" data-act="an-pdf" data-tip="Gera o relatório em PDF (A4) e abre">${icon('doc', 'ico')} PDF</button>` : '';
  const corpo = item
    ? `<article class="an-rel"><header class="an-capa"><div class="tag">Análise ${esc(t.label.toLowerCase())}</div><h2>${esc(anTitulo(t, item.v))}</h2><div class="per">Período de ${anData(anIni(item.v))} a ${anData(anFim(item.v))} · gerada em ${esc(String(item.v.gerado_em || '').slice(0, 16).replace('T', ' '))}</div></header><div class="an-body">${anCorpoHTML(item.v)}</div></article>`
    : `<section class="card"><div class="muted">A análise ${t.id === 'semana' ? 'da semana' : t.id === 'mes' ? 'do mês' : 'de ' + t.label} aparece aqui depois da primeira geração, ${t.quando} (Recife).</div></section>`;
  return { title: 'Análises', actions: `<div class="row" style="gap:6px">${periodo}${pdf}</div>`, html: `<div class="stack" style="gap:14px">${abas}${corpo}</div>` };
};
