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
const AN_CORES = GRAF_CORES;   // paleta única dos gráficos (colors.js)
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

/* Nos gráficos, reais ficam curtos: R$ 32,8 mil. */
function anFmtC(n, u) {
  if (u !== 'R$' || n === null || n === undefined || isNaN(n) || Math.abs(n) < 1000) return anFmt(n, u);
  const x = Number(n) / 1000;
  return 'R$ ' + x.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(x) < 100 ? 1 : 0 }) + ' mil';
}
/* ===== Visual das análises (25/11): títulos em negrito antes do texto, números realçados, gráficos na paleta do app,
   seções em cartões com ícone, prioridades numeradas, metas em blocos e o que é detalhe técnico recolhido. ===== */
/* Gráficos em SVG com cores fixas (paleta única): o mesmo desenho serve na tela e no PDF. */
const AN_TXT = '#565C6B', AN_TXT2 = '#8A909F', AN_GRADE = '#EEF0F4';
function anChartSVG(g) {
  const rot = Array.isArray(g.rotulos) ? g.rotulos.map(String) : [];
  const series = (Array.isArray(g.series) ? g.series : []).filter(s => Array.isArray(s.valores)).slice(0, 6);
  if (!rot.length || !series.length) return '';
  const u = g.unidade || '';
  // colunas com mais de uma série viram pilha (como os gráficos de produtividade do app): a altura é o total do dia
  const pilha = g.tipo === 'colunas' && series.length > 1;
  const somas = rot.map((_, i) => series.reduce((t, s) => t + (Number(s.valores[i]) || 0), 0));
  const all = pilha ? somas : series.flatMap(s => s.valores.map(Number).filter(x => !isNaN(x)));
  // topo do eixo arredondado (1, 2, 2,5, 5 × 10ⁿ) para as linhas de grade caírem em números redondos
  const bruto = Math.max(0, ...all) || 1, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const max = [1, 2, 2.5, 5, 10].map(f => f * pot).find(x => x >= bruto);
  const legenda = series.length > 1 ? `<div class="an-leg">${series.map((s, i) => `<span><i style="background:${AN_CORES[i]}"></i>${esc(s.nome || '')}</span>`).join('')}</div>` : '';
  const head = `<div class="an-chart"><div class="an-chart-t">${esc(g.titulo || '')}</div>${legenda}`;
  const foot = `${g.nota ? `<div class="an-note">${anRealce(g.nota)}</div>` : ''}</div>`;
  if (g.tipo === 'barras') {
    const lh = 30, W = 640, lab = 200, valW = 70, bw = W - lab - valW;
    const bh = Math.min(14, Math.max(8, (lh - 12) / series.length));
    let y = 2, out = '';
    rot.forEach((r, i) => {
      out += `<text x="0" y="${y + lh / 2 + 4}" font-size="12" fill="${AN_TXT}">${esc(r.length > 30 ? r.slice(0, 29) + '…' : r)}</text>`;
      const y0 = y + (lh - bh * series.length) / 2;
      series.forEach((s, k) => {
        const v = Number(s.valores[i]) || 0, w = Math.max(v > 0 ? 3 : 0, bw * v / max);
        out += `<rect x="${lab}" y="${(y0 + k * bh).toFixed(1)}" width="${bw}" height="${bh - 2}" rx="${(bh - 2) / 2}" fill="${AN_GRADE}"/><rect x="${lab}" y="${(y0 + k * bh).toFixed(1)}" width="${w.toFixed(1)}" height="${bh - 2}" rx="${(bh - 2) / 2}" fill="${AN_CORES[k]}"><title>${esc(r)}: ${esc(anFmtC(s.valores[i], u))}</title></rect>`;
        if (series.length === 1 || k === series.length - 1) out += `<text x="${W}" y="${(y0 + k * bh + bh - 3).toFixed(1)}" font-size="11.5" font-weight="600" text-anchor="end" fill="#15171C">${esc(anFmtC(s.valores[i], u))}</text>`;
      });
      y += lh;
    });
    return `${head}<svg viewBox="0 0 ${W} ${y + 2}" width="100%" role="img" aria-label="${esc(g.titulo || '')}" font-family="inherit">${out}</svg>${foot}`;
  }
  // colunas e linha: eixo com linhas de grade bem claras
  const W = 640, H = 220, L = 48, B = 26, T = 16, R = 8, pw = W - L - R, ph = H - B - T;
  const grid = [0, 0.5, 1].map(f => { const yy = T + ph - ph * f; return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${AN_GRADE}"/><text x="${L - 8}" y="${yy + 4}" font-size="10" text-anchor="end" fill="${AN_TXT2}">${esc(anFmtC(max * f, u))}</text>`; }).join('');
  const step = pw / rot.length;
  const xl = rot.map((r, i) => `<text x="${L + step * i + step / 2}" y="${H - 7}" font-size="10.5" text-anchor="middle" fill="${AN_TXT}">${esc(r.length > 10 ? r.slice(0, 9) + '…' : r)}</text>`).join('');
  let marks = '';
  if (g.tipo === 'linha') {
    series.forEach((s, k) => {
      const pts = rot.map((_, i) => { const v = Number(s.valores[i]); return isNaN(v) ? null : [L + step * i + step / 2, T + ph - ph * v / max, v]; });
      const ok = pts.filter(Boolean); if (!ok.length) return;
      const d = ok.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      if (series.length === 1) marks += `<path d="M${ok[0][0].toFixed(1)},${T + ph} ${ok.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${ok[ok.length - 1][0].toFixed(1)},${T + ph} Z" fill="${AN_CORES[k]}" opacity=".16"/>`;
      marks += `<path d="${d}" fill="none" stroke="${AN_CORES[k]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      ok.forEach((p) => {
        const i = pts.indexOf(p);
        marks += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="#fff" stroke="${AN_CORES[k]}" stroke-width="2.2"><title>${esc(rot[i])}: ${esc(anFmtC(p[2], u))}</title></circle>`;
        if (series.length === 1 && rot.length <= 12) marks += `<text x="${p[0].toFixed(1)}" y="${(p[1] - 9).toFixed(1)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="#15171C">${esc(anFmtC(p[2], u))}</text>`;
      });
    });
  } else if (pilha) {
    const bw = Math.min(46, step * 0.62);
    rot.forEach((r, i) => {
      let base = T + ph; const x = L + step * i + (step - bw) / 2;
      series.forEach((s, k) => {
        const v = Number(s.valores[i]) || 0; if (v <= 0) return; const h = ph * v / max; base -= h;
        marks += `<rect x="${x.toFixed(1)}" y="${base.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, h - 1).toFixed(1)}" rx="2" fill="${AN_CORES[k]}"><title>${esc(r)} · ${esc(s.nome || '')}: ${esc(anFmtC(v, u))}</title></rect>`;
      });
      if (somas[i] > 0 && rot.length <= 14) marks += `<text x="${(x + bw / 2).toFixed(1)}" y="${(base - 5).toFixed(1)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="#15171C">${esc(anFmtC(somas[i], u))}</text>`;
    });
  } else {
    const bw = Math.min(46, step * 0.62);
    rot.forEach((r, i) => {
      const v = Number(series[0].valores[i]) || 0, h = ph * v / max, x = L + step * i + (step - bw) / 2;
      marks += `<rect x="${x.toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${AN_CORES[0]}"><title>${esc(r)}: ${esc(anFmtC(v, u))}</title></rect>`;
      if (rot.length <= 14 && v > 0) marks += `<text x="${(x + bw / 2).toFixed(1)}" y="${(T + ph - h - 5).toFixed(1)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="#15171C">${esc(anFmtC(v, u))}</text>`;
    });
  }
  return `${head}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(g.titulo || '')}" font-family="inherit">${grid}${marks}${xl}</svg>${foot}`;
}

const AN_COMP_NOMES = { semana_anterior: 'Semana anterior', media_mes: 'Média do mês', media_ano: 'Média do ano', media_sempre: 'Média de sempre', mes_passado: 'Mês passado', mes_anterior: 'Mês anterior', mesmo_mes_ano_passado: 'Mesmo mês do ano passado', mesmo_periodo_mes_passado: 'Mesmo período do mês passado', meses: 'Meses entre si', trimestres: 'Trimestres', trimestre_ano_passado: 'Trimestre do ano passado', meta_financeira: 'Meta financeira' };

/* Números no meio do texto ficam em destaque (horas, minutos, dinheiro, %, datas), para o olho achar rápido. */
const AN_NUM_RE = /(R\$\s?[\d.]+(?:,\d+)?(?:\s?mil)?|[+−-]?\b\d+h\d{2}\b|\b\d+(?:,\d+)?\s?h\b|\b\d+\s?min\b|[+−-]?\b\d+(?:,\d+)?%|\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b)/g;
function anRealce(t) { return esc(String(t ?? '')).replace(AN_NUM_RE, '<b class="an-n">$1</b>'); }
/* Item de texto → título em negrito + o resto. Usa o que vem antes de ":" (ex.: "Horas líquidas: 34h34…");
   sem isso, a primeira frase vira o título quando há mais de uma. */
function anPartes(txt) {
  const s = String(txt ?? '').trim();
  const m = s.match(/^([^:]{2,90}):\s+([\s\S]+)$/);
  if (m && !/\d$/.test(m[1]) && !/[.!?]\s/.test(m[1])) return { t: m[1], c: m[2] };
  const fr = s.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/);
  if (fr.length > 1 && fr[0].length <= 150) return { t: fr[0].replace(/\.$/, ''), c: fr.slice(1).join(' ') };
  // uma frase só: a primeira oração (até a primeira vírgula ou dois-pontos fora de parênteses) vira o título
  let dep = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const ch = s[i]; if (ch === '(') dep++; else if (ch === ')') dep = Math.max(0, dep - 1);
    else if (!dep && (ch === ',' || ch === ':') && s[i + 1] === ' ' && i >= 25 && i <= 110 && s.length - i > 20) return { t: s.slice(0, i), c: s.slice(i + 2) };
  }
  return { t: '', c: s };
}
function anItem(txt, n) {
  const p = anPartes(txt);
  if (!p.t && p.c.length <= 90) { p.t = p.c.replace(/\.$/, ''); p.c = ''; }   // frase curta: vira só o título
  if (p.c) p.c = p.c.charAt(0).toUpperCase() + p.c.slice(1);
  return `<div class="an-it${n ? ' num' : ''}">${n ? `<span class="an-it-n">${n}</span>` : ''}<div class="an-it-b">${p.t ? `<div class="an-it-t">${esc(p.t)}</div>` : ''}${p.c ? `<div class="an-it-c">${anRealce(p.c)}</div>` : ''}</div></div>`;
}
function anItens(xs, numerado) { return Array.isArray(xs) && xs.length ? `<div class="an-its">${xs.map((x, i) => anItem(x, numerado ? i + 1 : 0)).join('')}</div>` : ''; }
/* Ícone de cada seção pelo assunto do título. */
function anIcone(t) {
  const s = String(t || '').toLowerCase();
  return /produtiv|foco|hor[aá]rio/.test(s) ? 'clock' : /projet/.test(s) ? 'folder' : /dinheiro|receb|financ|r\$/.test(s) ? 'money' : /whats|contat/.test(s) ? 'users'
    : /priorid|meta/.test(s) ? 'flag' : /brecha|erro|aten/.test(s) ? 'alert' : /integra|ideia|tempo/.test(s) ? 'layers' : /compar/.test(s) ? 'chart' : /sugest|acompanh/.test(s) ? 'check' : 'doc';
}
/* Seção: cartão com ícone, título e contagem. recolhida = detalhe técnico, fechado na tela (aberto no PDF). */
function anSec(titulo, corpo, o = {}) {
  if (!corpo) return '';
  const id = 'an-' + String(titulo).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const h = `<span class="an-sec-ic">${icon(o.ic || anIcone(titulo))}</span><h4>${esc(titulo)}</h4>${o.n ? `<span class="an-sec-n">${o.n}</span>` : ''}`;
  if (o.recolhe && !o.pdf) return `<details class="an-sec an-mais${o.largo ? ' largo' : ''}" id="${id}"><summary class="an-sec-h">${h}<span class="an-sec-v">ver</span></summary>${corpo}</details>`;
  return `<section class="an-sec${o.largo ? ' largo' : ''}" id="${id}"><div class="an-sec-h">${h}</div>${corpo}</section>`;
}
function anBloco(titulo, corpo) { return anSec(titulo, corpo); }
function anLista2(xs) { return anItens(xs); }

/* Cartão de número: rótulo, valor grande, seta da tendência e a meta (se o detalhe começa com "Meta …: batida"). */
function anKpiHTML(k) {
  const cls = k.bom === true ? 'bom' : k.bom === false ? 'ruim' : '';
  const tend = { sobe: ['▲', 'subiu'], desce: ['▼', 'caiu'], igual: ['■', 'igual'] }[k.tendencia];
  let det = String(k.detalhe || ''), meta = '';
  const mm = det.match(/^(Meta[^:.]*?)(?::\s*(batida|não batida|bateu|não bateu))?\.\s*/i);
  if (mm) { det = det.slice(mm[0].length); const ok = mm[2] ? !/não/i.test(mm[2]) : null; meta = `<span class="an-meta-p ${ok === true ? 'bom' : ok === false ? 'ruim' : ''}">${ok === true ? '✓ ' : ok === false ? '✕ ' : ''}${esc(mm[1])}${mm[2] ? ' · ' + esc(mm[2]) : ''}</span>`; }
  return `<div class="an-kpi ${cls}"><div class="k">${esc(k.rotulo || '')}</div><div class="an-kpi-vr"><span class="v">${esc(k.valor ?? '')}</span>${tend ? `<span class="an-tend ${k.tendencia}" title="Comparado ao período anterior: ${tend[1]}">${tend[0]} ${tend[1]}</span>` : ''}</div>${meta}${det ? `<div class="d">${anRealce(det)}</div>` : ''}</div>`;
}

/* Corpo do relatório (igual na tela e no PDF). pdf = true abre as seções recolhidas. */
function anCorpoHTML(v, pdf = false) {
  const kpis = Array.isArray(v.kpis) && v.kpis.length ? `<div class="an-kpis">${v.kpis.slice(0, 8).map(anKpiHTML).join('')}</div>` : '';
  // análises antigas (só números de produtividade) ganham destaques a partir de "numeros"
  const n = v.numeros || {};
  const kpisAntigos = !kpis && Object.keys(n).length ? `<div class="an-kpis">${[
    ['Produtivo', n.produtivo_ms !== undefined ? fmtH(n.produtivo_ms) : null],
    ['% produtivo', n.pct_produtivo !== undefined ? usePctTxt(Number(n.pct_produtivo)) : null],
    ['Distração', n.distracao_ms !== undefined ? fmtH(n.distracao_ms) : null],
    ['Maior bloco', n.maior_bloco_ms !== undefined ? fmtH(n.maior_bloco_ms) : null],
    ['Recebido', n.recebido !== undefined ? fmtMoney(Number(n.recebido)) : null],
  ].filter(x => x[1] !== null && x[1] !== undefined).map(([k, val]) => `<div class="an-kpi"><div class="k">${k}</div><div class="an-kpi-vr"><span class="v">${esc(val)}</span></div></div>`).join('')}</div>` : '';
  // resumo: a primeira frase em destaque, o resto em texto normal com os números realçados
  const rs = v.resumo ? String(v.resumo).split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/) : [];
  const resumo = rs.length ? `<div class="an-resumo"><p class="an-lead">${anRealce(rs[0])}</p>${rs.length > 1 ? `<p>${anRealce(rs.slice(1).join(' '))}</p>` : ''}</div>` : '';
  const graficos = Array.isArray(v.graficos) ? v.graficos.map(anChartSVG).filter(Boolean) : [];
  const comps = v.comparacoes && typeof v.comparacoes === 'object' ? Object.entries(v.comparacoes).filter(([, t]) => t) : [];
  const compsHTML = comps.length ? `<div class="an-comps">${comps.map(([k, t]) => `<div class="an-comp"><div class="an-comp-k">${esc(AN_COMP_NOMES[k] || k.replace(/_/g, ' '))}</div><div class="an-comp-t">${anRealce(t)}</div></div>`).join('')}</div>` : '';
  const SEG = { sim: ['bom', '✓ Seguiu'], 'não': ['ruim', '✕ Não seguiu'], parcial: ['meio', '◐ Em parte'] };
  const acomp = Array.isArray(v.acompanhamento) && v.acompanhamento.length ? `<div class="an-its">${v.acompanhamento.map(a => { const s = SEG[a.seguiu] || ['', esc(a.seguiu || 'sem dados')]; return `<div class="an-it an-acomp"><div class="an-it-b"><div class="an-it-t">${esc(a.sugestao || '')} <span class="an-pill ${s[0]}">${s[1]}</span></div>${a.resultado ? `<div class="an-it-c">${anRealce(a.resultado)}</div>` : ''}</div></div>`; }).join('')}</div>` : '';
  const metas = (titulo, xs, novas) => Array.isArray(xs) && xs.length ? `<div class="an-metas"><div class="an-sub">${esc(titulo)}</div><div class="an-meta-g">${xs.map(x => `<div class="an-meta ${x.conquistada === true ? 'bom' : x.conquistada === false ? 'ruim' : ''}${novas ? ' nova' : ''}"><span class="an-meta-i">${x.conquistada === true ? '⭐' : x.conquistada === false ? '✕' : '◎'}</span><div><b>${esc(x.nome || '')}</b><span>${x.alvo ? 'Meta: ' + anRealce(x.alvo) : ''}${x.resultado ? `<br>${anRealce(x.resultado)}` : ''}</span></div></div>`).join('')}</div></div>` : '';
  // seções vindas do gerador: prioridades numeradas; detalhes técnicos (brechas, integrações) recolhidos
  const secs = (Array.isArray(v.secoes) ? v.secoes : []).map(s => {
    const t = s.titulo || ''; const prior = /priorid/i.test(t); const tec = /brecha|integra/i.test(t);
    return anSec(t, anItens(s.itens, prior), { n: Array.isArray(s.itens) ? s.itens.length : 0, recolhe: tec, pdf, largo: prior });
  });
  const sug = Array.isArray(v.sugestoes) && v.sugestoes.length ? anItens(v.sugestoes, true) : '';
  const metaSug = v.meta?.texto ? `<div class="an-destaque"><span class="an-sec-ic">${icon('flag')}</span><div><div class="an-sub">Meta sugerida</div>${anRealce(v.meta.texto)}</div></div>` : '';
  const metasHTML = metas('Período que passou', v.metas_passadas) + metas('Próximo período', v.metas_novas, true) + (v.metas_nota ? `<div class="an-note">${anRealce(v.metas_nota)}</div>` : '');
  return `${resumo}
    ${kpis || kpisAntigos}
    ${graficos.length ? `<div class="an-graficos">${graficos.join('')}</div>` : ''}
    <div class="an-secs">
    ${anSec('O que os números dizem', anItens(v.analises), { ic: 'chart', n: (v.analises || []).length, largo: true })}
    ${secs.join('')}
    ${anSec('Sugestões', sug + metaSug, { ic: 'check', largo: true })}
    ${anSec('Sugestões anteriores: o que aconteceu', acomp, { ic: 'check', largo: true })}
    ${anSec('Comparações', compsHTML, { ic: 'chart', largo: true })}
    ${anSec('Metas', metasHTML, { ic: 'flag', largo: true })}
    ${anSec('Ideias para o Tempo', anItens(v.ideias_tempo), { ic: 'layers', n: (v.ideias_tempo || []).length, recolhe: true, pdf, largo: true })}
    </div>`;
}

/* Estilo do PDF (A4), independente do CSS do app. */
const AN_PDF_CSS = `@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;color:#15171C;font-size:11px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{padding:30px 40px}.capa{background:#E7EAFD;color:#15171C;padding:34px 40px 24px}.capa .tag{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#565C6B}.capa h1{font-size:24px;margin:6px 0 4px;font-weight:700}.capa .per{color:#565C6B;font-size:11.5px}
.an-n{font-weight:700;color:#15171C;white-space:nowrap}
.an-resumo{margin:0 0 16px;padding:14px 16px;background:#F5F6F8;border-left:4px solid #8C9CF2;border-radius:8px}.an-resumo p{margin:6px 0 0;color:#565C6B}.an-resumo .an-lead{margin:0;font-size:14px;font-weight:600;color:#15171C;line-height:1.4}
.an-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 16px}.an-kpi{border:1px solid #E0E3EA;border-radius:10px;padding:9px 11px;break-inside:avoid}.an-kpi .k{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8A909F;font-weight:600}.an-kpi-vr{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}.an-kpi .v{font-size:18px;font-weight:700}.an-kpi .d{font-size:9.5px;color:#565C6B;margin-top:3px}.an-tend{font-size:8.5px;color:#8A909F}
.an-kpi.bom{border-top:3px solid #77DB89}.an-kpi.ruim{border-top:3px solid #F2958B}.an-meta-p{display:inline-block;margin-top:4px;font-size:9px;font-weight:600;padding:1px 7px;border-radius:99px;background:#EEF0F4;color:#565C6B}.an-meta-p.bom{background:#E3F7E7;color:#1F6B35}.an-meta-p.ruim{background:#FBE0DD;color:#9B2C22}
.an-graficos{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}.an-chart{border:1px solid #E0E3EA;border-radius:10px;padding:10px 12px;break-inside:avoid}.an-chart-t{font-weight:700;font-size:11.5px;margin-bottom:4px}.an-leg{display:flex;gap:10px;flex-wrap:wrap;font-size:9px;color:#565C6B;margin:0 0 4px}.an-leg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.an-secs{display:block}.an-sec{margin:14px 0 0;break-inside:avoid-page}.an-sec-h{display:flex;align-items:center;gap:8px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #E0E3EA}.an-sec-h h4{margin:0;font-size:13px}.an-sec-ic svg{width:14px;height:14px;color:#8C9CF2;display:block}.an-sec-n{font-size:9.5px;color:#8A909F}.an-sec-v{display:none}
.an-its{display:flex;flex-direction:column;gap:7px}.an-it{display:flex;gap:9px;break-inside:avoid}.an-it-n{flex:none;width:18px;height:18px;border-radius:50%;background:#E7EAFD;color:#2E43D6;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center}.an-it-t{font-weight:700;font-size:11.5px;color:#15171C}.an-it-c{color:#565C6B}
.an-comps{display:grid;grid-template-columns:1fr 1fr;gap:8px}.an-comp{border:1px solid #E0E3EA;border-radius:8px;padding:8px 10px;break-inside:avoid}.an-comp-k{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8A909F;font-weight:600;margin-bottom:2px}.an-comp-t{color:#565C6B}
.an-pill{display:inline-block;padding:1px 8px;border-radius:99px;background:#EEF0F4;font-size:9px;font-weight:600;color:#565C6B;margin-left:4px;vertical-align:1px}.an-pill.bom{background:#E3F7E7;color:#1F6B35}.an-pill.ruim{background:#FBE0DD;color:#9B2C22}.an-pill.meio{background:#FFF2DC;color:#A86400}
.an-sub{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8A909F;font-weight:600;margin:8px 0 4px}.an-meta-g{display:grid;grid-template-columns:1fr 1fr;gap:6px}.an-meta{display:flex;gap:8px;align-items:flex-start;padding:7px 10px;border:1px solid #E0E3EA;border-radius:8px;break-inside:avoid}.an-meta.bom{background:#E3F7E7;border-color:#BFEBC9}.an-meta span{color:#565C6B;display:block}.an-meta-i{font-size:12px;line-height:1.2}
.an-destaque{display:flex;gap:10px;align-items:flex-start;margin-top:8px;padding:10px 12px;background:#E7EAFD;border-radius:8px;font-weight:600}.an-destaque .an-sub{margin:0 0 2px}.an-note{font-size:9.5px;color:#8A909F;margin-top:6px}
.rod{margin-top:24px;padding-top:8px;border-top:1px solid #E0E3EA;font-size:9px;color:#8A909F;display:flex;justify-content:space-between}`;
function anPdfHTML(t, v) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(anTitulo(t, v))}</title><style>${AN_PDF_CSS}</style></head><body>
<div class="capa"><div class="tag">Tempo · Análise ${esc(t.label.toLowerCase())}</div><h1>${esc(anTitulo(t, v))}</h1><div class="per">Período de ${anData(anIni(v))} a ${anData(anFim(v))}</div></div>
<div class="pg">${anCorpoHTML(v, true)}<div class="rod"><span>Tulio · APP TEMPO</span><span>Gerado em ${esc(String(v.gerado_em || '').slice(0, 16).replace('T', ' '))}</span></div></div></body></html>`;
}
function anPdfNome(t, v) { return `Analise_${t.label.replace(/\s+/g, '')}_${String(anIni(v) || 'periodo').slice(0, 10)}`; }

function anAtual() {
  const t = AN_TIPOS.find(x => x.id === AN.tipo) || AN_TIPOS[0];
  const lista = anLista(t.prefix);
  const item = lista.find(x => x.key === AN.key) || lista[0] || null;
  return { t, lista, item };
}
ACTIONS['an-ir'] = (el) => { const sec = document.getElementById(el.dataset.id); if (!sec) return; if (sec.tagName === 'DETAILS') sec.open = true; sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
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
if (window.TempoBridge) window.TempoBridge.pdfDone = (ok) => toast(ok ? 'PDF salvo no iCloud, na pasta Tempo' : 'Não consegui gerar o PDF.');

VIEWS.analises = () => {
  const { t, lista, item } = anAtual();
  const abas = `<div class="an-abas" role="tablist">${AN_TIPOS.map(x => `<button class="btn sm ${x.id === t.id ? '' : 'ghost'}" role="tab" aria-selected="${x.id === t.id}" data-act="an-tipo" data-tipo="${x.id}">${x.label}</button>`).join('')}</div>`;
  const periodo = lista.length ? `<select class="input sm" data-on="an-periodo" aria-label="Período">${lista.map(x => `<option value="${esc(x.key)}" ${item && x.key === item.key ? 'selected' : ''}>${esc(anData(anIni(x.v)))} a ${esc(anData(anFim(x.v)))}</option>`).join('')}</select>` : '';
  const pdf = item ? `<button class="btn sm" data-act="an-pdf" data-tip="Gera o relatório em PDF (A4) e abre">${icon('doc', 'ico')} PDF</button>` : '';
  const corpo = item
    ? `<article class="an-rel"><header class="an-capa"><div class="tag">Análise ${esc(t.label.toLowerCase())}</div><h2>${esc(anTitulo(t, item.v))}</h2><div class="per">Período de ${anData(anIni(item.v))} a ${anData(anFim(item.v))} · gerada em ${esc(String(item.v.gerado_em || '').slice(0, 16).replace('T', ' '))}</div></header><div class="an-body">${anCorpoHTML(item.v)}</div></article>`
    : `<section class="card"><div class="muted">A análise ${t.id === 'semana' ? 'da semana' : t.id === 'mes' ? 'do mês' : 'de ' + t.label} aparece aqui depois da primeira geração, ${t.quando} (Recife).</div></section>`;
  // sumário: atalhos para cada seção do relatório (pula e abre a seção, se estiver recolhida)
  const secs = item ? [...corpo.matchAll(/class="an-sec[^"]*" id="(an-[^"]+)"[^>]*>(?:<summary[^>]*>|<div class="an-sec-h">)<span class="an-sec-ic">[\s\S]*?<\/span><h4>([^<]+)<\/h4>/g)].map(m => [m[1], m[2]]) : [];
  const sumario = secs.length > 2 ? `<nav class="an-sumario" aria-label="Seções da análise">${secs.map(([id, t]) => `<button class="an-ir" data-act="an-ir" data-id="${id}" data-tip="Ir para ${t}">${t.replace(/ \(.*\)$/, '')}</button>`).join('')}</nav>` : '';
  return { title: 'Análises', actions: `<div class="row" style="gap:6px">${periodo}${pdf}</div>`, html: `<div class="stack" style="gap:14px">${abas}${sumario}${corpo}</div>` };
};
