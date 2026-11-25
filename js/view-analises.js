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
/* Produtivo, Distração e Ocioso têm sempre a mesma cor (como na Produtividade); o resto segue a paleta pela posição. */
function anCorSerie(nome, i) {
  const n = String(nome || '').toLowerCase();
  return /produtiv|trabalh/.test(n) ? GRAF_CORES[1] : /distra/.test(n) ? GRAF_CORES[7] : /ocios|fora do comp/.test(n) ? GRAF_CORES[6] : AN_CORES[i % AN_CORES.length];
}
const AN_TXT = '#565C6B', AN_TXT2 = '#8A909F', AN_GRADE = '#EEF0F4';
function anChartSVG(g) {
  const rot = Array.isArray(g.rotulos) ? g.rotulos.map(String) : [];
  const series = (Array.isArray(g.series) ? g.series : []).filter(s => Array.isArray(s.valores)).slice(0, 6);
  if (!rot.length || !series.length) return '';
  const u = g.unidade || '';
  const COR = series.map((s, i) => s.cor || anCorSerie(s.nome, i));
  // colunas com mais de uma série viram pilha (como os gráficos de produtividade do app): a altura é o total do dia
  const pilha = g.tipo === 'colunas' && series.length > 1;
  const somas = rot.map((_, i) => series.reduce((t, s) => t + (Number(s.valores[i]) || 0), 0));
  const all = pilha ? somas : series.flatMap(s => s.valores.map(Number).filter(x => !isNaN(x)));
  // topo do eixo arredondado (1, 2, 2,5, 5 × 10ⁿ) para as linhas de grade caírem em números redondos
  const bruto = Math.max(0, ...all) || 1, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const max = [1, 2, 2.5, 5, 10].map(f => f * pot).find(x => x >= bruto);
  const legenda = series.length > 1 ? `<div class="an-leg">${series.map((s, i) => `<span><i style="background:${COR[i]}"></i>${esc(s.nome || '')}</span>`).join('')}</div>` : '';
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
        out += `<rect x="${lab}" y="${(y0 + k * bh).toFixed(1)}" width="${bw}" height="${bh - 2}" rx="${(bh - 2) / 2}" fill="${AN_GRADE}"/><rect x="${lab}" y="${(y0 + k * bh).toFixed(1)}" width="${w.toFixed(1)}" height="${bh - 2}" rx="${(bh - 2) / 2}" fill="${COR[k]}"><title>${esc(r)}: ${esc(anFmtC(s.valores[i], u))}</title></rect>`;
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
      if (series.length === 1) marks += `<path d="M${ok[0][0].toFixed(1)},${T + ph} ${ok.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${ok[ok.length - 1][0].toFixed(1)},${T + ph} Z" fill="${COR[k]}" opacity=".16"/>`;
      marks += `<path d="${d}" fill="none" stroke="${COR[k]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      ok.forEach((p) => {
        const i = pts.indexOf(p);
        marks += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="#fff" stroke="${COR[k]}" stroke-width="2.2"><title>${esc(rot[i])}: ${esc(anFmtC(p[2], u))}</title></circle>`;
        if (series.length === 1 && rot.length <= 12) marks += `<text x="${p[0].toFixed(1)}" y="${(p[1] - 9).toFixed(1)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="#15171C">${esc(anFmtC(p[2], u))}</text>`;
      });
    });
  } else if (pilha) {
    const bw = Math.min(46, step * 0.62);
    rot.forEach((r, i) => {
      let base = T + ph; const x = L + step * i + (step - bw) / 2;
      series.forEach((s, k) => {
        const v = Number(s.valores[i]) || 0; if (v <= 0) return; const h = ph * v / max; base -= h;
        marks += `<rect x="${x.toFixed(1)}" y="${base.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, h - 1).toFixed(1)}" rx="2" fill="${COR[k]}"><title>${esc(r)} · ${esc(s.nome || '')}: ${esc(anFmtC(v, u))}</title></rect>`;
      });
      if (somas[i] > 0 && rot.length <= 14) marks += `<text x="${(x + bw / 2).toFixed(1)}" y="${(base - 5).toFixed(1)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="#15171C">${esc(anFmtC(somas[i], u))}</text>`;
    });
  } else {
    const bw = Math.min(46, step * 0.62);
    rot.forEach((r, i) => {
      const v = Number(series[0].valores[i]) || 0, h = ph * v / max, x = L + step * i + (step - bw) / 2;
      marks += `<rect x="${x.toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${COR[0]}"><title>${esc(r)}: ${esc(anFmtC(v, u))}</title></rect>`;
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
let AN_TELA = null;   // contexto do desenho atual: { t, v, tela } (tela = links e botões; no PDF fica sem)
function anItem(txt, n, acao) {
  const p = anPartes(txt);
  if (!p.t && p.c.length <= 90) { p.t = p.c.replace(/\.$/, ''); p.c = ''; }   // frase curta: vira só o título
  if (p.c) p.c = p.c.charAt(0).toUpperCase() + p.c.slice(1);
  return `<div class="an-it${n ? ' num' : ''}">${n ? `<span class="an-it-n">${n}</span>` : ''}<div class="an-it-b">${p.t ? `<div class="an-it-t">${anLk(esc(p.t))}</div>` : ''}${p.c ? `<div class="an-it-c">${anLk(anRealce(p.c))}</div>` : ''}</div>${acao && AN_TELA?.tela ? `<button type="button" class="btn sm ghost an-todo" data-act="an-todo" data-txt="${esc(anTodoTxt(txt))}" title="Criar um to-do com este item">${icon('plus')} To-do</button>` : ''}</div>`;
}
function anItens(xs, numerado, acao) { return Array.isArray(xs) && xs.length ? `<div class="an-its">${xs.map((x, i) => anItem(x, numerado ? i + 1 : 0, acao)).join('')}</div>` : ''; }
const anLk = (h) => (AN_TELA?.tela && typeof anLinkProj === 'function' ? anLinkProj(h) : h);
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
function anCorpoHTML(v, pdf = false, ctx = {}) {
  AN_TELA = { t: ctx.t || null, v, tela: !pdf };
  try { return anCorpoMonta(v, pdf, ctx); } finally { AN_TELA = null; }
}
function anCorpoMonta(v, pdf, ctx) {
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
  // gráficos: evolução das análises do mesmo tipo, os do relatório e os do registro do app (quando faltam)
  const evol = ctx.t && ctx.key ? anEvolucao(ctx.t, ctx.key) : [];
  const proprios = Array.isArray(v.graficos) ? v.graficos : [];
  const igual = (g) => proprios.some(x => String(x.titulo || '').trim().toLowerCase() === String(g.titulo || '').trim().toLowerCase());
  const graficos = [...evol.filter(g => !igual(g)), ...proprios, ...anGraficosApp(v)].map(anChartSVG).filter(Boolean);
  const cmp = ctx.cmp ? anComparaHTML(v, ctx.cmp.v, ctx.cmpRot || 'outro período') : '';
  const comps = v.comparacoes && typeof v.comparacoes === 'object' ? Object.entries(v.comparacoes).filter(([, t]) => t) : [];
  const compsHTML = comps.length ? `<div class="an-comps">${comps.map(([k, t]) => `<div class="an-comp"><div class="an-comp-k">${esc(AN_COMP_NOMES[k] || k.replace(/_/g, ' '))}</div><div class="an-comp-t">${anRealce(t)}</div></div>`).join('')}</div>` : '';
  const SEG = { sim: ['bom', '✓ Seguiu'], 'não': ['ruim', '✕ Não seguiu'], parcial: ['meio', '◐ Em parte'] };
  const acomp = Array.isArray(v.acompanhamento) && v.acompanhamento.length ? `<div class="an-its">${v.acompanhamento.map(a => { const s = SEG[a.seguiu] || ['', esc(a.seguiu || 'sem dados')]; return `<div class="an-it an-acomp"><div class="an-it-b"><div class="an-it-t">${esc(a.sugestao || '')} <span class="an-pill ${s[0]}">${s[1]}</span></div>${a.resultado ? `<div class="an-it-c">${anRealce(a.resultado)}</div>` : ''}</div></div>`; }).join('')}</div>` : '';
  const metas = (titulo, xs, novas) => Array.isArray(xs) && xs.length ? `<div class="an-metas"><div class="an-sub">${esc(titulo)}</div><div class="an-meta-g">${xs.map(x => `<div class="an-meta ${x.conquistada === true ? 'bom' : x.conquistada === false ? 'ruim' : ''}${novas ? ' nova' : ''}"><span class="an-meta-i">${x.conquistada === true ? '⭐' : x.conquistada === false ? '✕' : '◎'}</span><div class="an-meta-b"><b>${esc(x.nome || '')}</b>${(() => { const barra = anMetaBarra(x, { t: ctx.t, v }, novas); return `<span class="an-meta-s">${x.alvo ? 'Meta: ' + anRealce(x.alvo) : ''}${x.resultado && !barra ? ` · ${anRealce(x.resultado)}` : ''}</span>${barra}`; })()}</div></div>`).join('')}</div></div>` : '';
  // seções vindas do gerador: prioridades numeradas; detalhes técnicos (brechas, integrações) recolhidos
  const secs = (Array.isArray(v.secoes) ? v.secoes : []).map(s => {
    const t = s.titulo || ''; const prior = /priorid/i.test(t); const tec = /brecha|integra/i.test(t);
    return anSec(t, anItens(s.itens, prior, prior), { n: Array.isArray(s.itens) ? s.itens.length : 0, recolhe: tec, pdf, largo: prior });
  });
  const sug = Array.isArray(v.sugestoes) && v.sugestoes.length ? anItens(v.sugestoes, true, true) : '';
  const metaSug = v.meta?.texto ? `<div class="an-destaque"><span class="an-sec-ic">${icon('flag')}</span><div><div class="an-sub">Meta sugerida</div>${anRealce(v.meta.texto)}</div></div>` : '';
  const metasHTML = metas('Período que passou', v.metas_passadas) + metas('Próximo período', v.metas_novas, true) + (v.metas_nota ? `<div class="an-note">${anRealce(v.metas_nota)}</div>` : '');
  return `${resumo}
    ${kpis || kpisAntigos}
    ${cmp}
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

/* ===== Dados do próprio app para a análise (25/11): gráficos do período, evolução, comparação e metas ao vivo ===== */
const anDia = (s) => { const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d).getTime() : null; };
/* Intervalo [a, b) do período da análise (fim inclusivo vira o começo do dia seguinte), sem passar de agora. */
function anRange(v) {
  const a = anDia(anIni(v)), f = anDia(anFim(v)); if (a === null || f === null) return null;
  return { a, b: Math.min(Date.now(), new Date(f).setDate(new Date(f).getDate() + 1)) };
}
/* Estatísticas de produtividade de um intervalo, com as mesmas regras da tela Produtividade. */
function anStats(a, b) {
  if (typeof prodCollect !== 'function' || typeof prodStats !== 'function' || !(b > a)) return null;
  const oldP = PROD.period, oldR = PROD.range;
  PROD.period = 'custom'; PROD.range = { a, b };
  try { const C = prodCollect(); if (!C.union.length && !C.pauses.length) return null; return { C, S: prodStats(C) }; }
  catch (e) { return null; } finally { PROD.period = oldP; PROD.range = oldR; }
}
const anRecebido = (a, b) => db.all('tempo_payments').filter(p => { const t = anDia(p.date); return t !== null && t >= a && t < b; }).reduce((s, p) => s + (Number(p.amount) || 0), 0);
const anH = (ms) => Math.round((ms || 0) / 36e3) / 100;   // ms → horas decimais (2 casas)

/* 1) Gráficos do registro do app para o período, quando o relatório não trouxe um parecido. */
function anGraficosApp(v) {
  const r = anRange(v); const st = r && anStats(r.a, r.b); if (!st) return [];
  const S = st.S, tem = (re) => (v.graficos || []).some(g => re.test(String(g.titulo || '')));
  const out = [];
  if (!tem(/hor[aá]ri|faixa|hora do dia|por hora/i)) {
    const hs = S.hours.map((h, i) => [i, h]).filter(([, h]) => h.prod + h.dist > 0);
    if (hs.length) {
      const de = hs[0][0], ate = hs[hs.length - 1][0], xs = S.hours.slice(de, ate + 1);
      out.push({ titulo: 'Por hora do dia', tipo: 'colunas', unidade: 'h', rotulos: xs.map((_, i) => `${de + i}h`), series: [{ nome: 'Produtivo', valores: xs.map(h => anH(h.prod)) }, { nome: 'Distração', valores: xs.map(h => anH(h.dist)) }], nota: 'Do registro do app, somando o período. A coluna mais alta é a hora em que você mais rende.' });
    }
  }
  if (!tem(/por dia|dia da semana|horas por dia/i)) {
    const ord = [1, 2, 3, 4, 5, 6, 0], nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    out.push({ titulo: 'Por dia da semana', tipo: 'colunas', unidade: 'h', rotulos: ord.map(d => nomes[d]), series: [{ nome: 'Produtivo', valores: ord.map(d => anH(S.dows[d].prod)) }, { nome: 'Distração', valores: ord.map(d => anH(S.dows[d].dist)) }, { nome: 'Ocioso', valores: ord.map(d => anH(S.dows[d].ocio)) }], nota: 'Do registro do app. Ocioso é tempo fora do computador (almoço, trânsito…), não é desperdício.' });
  }
  return out;
}

/* 2) Evolução: as análises do mesmo tipo, uma ao lado da outra (até 12). Usa os números gravados; sem eles, o registro do app. */
function anEvolucao(t, key) {
  const xs = anLista(t.prefix).filter(x => String(x.key) <= String(key)).reverse().slice(-12);
  if (xs.length < 2) return [];
  const pts = xs.map(x => {
    const n = x.v.numeros || {}; let prod = n.produtivo_ms, dist = n.distracao_ms, pct = n.pct_produtivo;
    if (prod === undefined || dist === undefined) { const r = anRange(x.v); const st = r && anStats(r.a, r.b); if (st) { prod = st.S.tot.prod; dist = st.S.tot.dist; pct = st.S.pctProd; } }
    const ini = anIni(x.v);
    const rot = t.id === 'semana' ? (ini ? ini.slice(8, 10) + '/' + ini.slice(5, 7) : '') : t.id === 'mes' && ini ? new Date(anDia(ini)).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/') : String(x.key).split(':')[1] || '';
    return { rot, prod: prod ?? null, dist: dist ?? null, pct: pct ?? null };
  });
  const quem = t.id === 'semana' ? 'semana' : t.id === 'mes' ? 'mês' : 'período';
  const out = [];
  if (pts.some(p => p.prod)) out.push({ titulo: `Horas por ${quem}`, tipo: 'colunas', unidade: 'h', rotulos: pts.map(p => p.rot), series: [{ nome: 'Produtivo', valores: pts.map(p => anH(p.prod)) }, { nome: 'Distração', valores: pts.map(p => anH(p.dist)) }], nota: `Evolução das análises de ${t.label.toLowerCase()}: a última coluna é esta.` });
  if (pts.filter(p => p.pct !== null && p.pct !== undefined).length >= 2) out.push({ titulo: `% produtivo por ${quem}`, tipo: 'linha', unidade: '%', rotulos: pts.map(p => p.rot), series: [{ nome: '% produtivo', valores: pts.map(p => (p.pct === null || p.pct === undefined ? NaN : Math.round(Number(p.pct) * 10) / 10)) }], nota: 'Produtivo ÷ (produtivo + distração). Meta: 70%.' });
  return out;
}

/* 4) Comparar com outra análise do mesmo tipo: os números dos dois períodos lado a lado, com a diferença. */
function anComparaHTML(v, w, rotW) {
  const ra = anRange(v), rb = anRange(w); if (!ra || !rb) return '';
  const A = anStats(ra.a, ra.b), B = anStats(rb.a, rb.b);
  const n1 = v.numeros || {}, n2 = w.numeros || {};
  const val = (st, n, k) => {
    if (k === 'prod') return st ? st.S.tot.prod : n.produtivo_ms ?? null;
    if (k === 'pct') return st ? st.S.pctProd : n.pct_produtivo ?? null;
    if (k === 'dist') return st ? st.S.tot.dist : n.distracao_ms ?? null;
    if (k === 'ocio') return st ? st.S.tot.ocio : n.ocioso_ms ?? null;
    if (k === 'bloco') return st ? st.S.longest : n.maior_bloco_ms ?? null;
    if (k === 'dias') return st ? st.S.days.length : null;
    return null;
  };
  const linhas = [
    ['prod', 'Horas líquidas', 'ms', 1], ['pct', '% produtivo', '%', 1], ['dist', 'Distração', 'ms', -1],
    ['ocio', 'Fora do computador (ocioso)', 'ms', 0], ['bloco', 'Maior bloco de foco', 'ms', 1], ['dias', 'Dias com registro', 'n', 0], ['rec', 'Recebido (PJ)', 'R$', 1],
  ];
  const fmt = (x, u) => (x === null || x === undefined || isNaN(x) ? '—' : u === 'ms' ? fmtDur(x) : u === '%' ? (Math.round(x * 10) / 10).toLocaleString('pt-BR') + '%' : u === 'R$' ? fmtMoney0(x) : String(Math.round(x)));
  const rows = linhas.map(([k, nome, u, bom]) => {
    const a = k === 'rec' ? anRecebido(ra.a, ra.b) : val(A, n1, k), b = k === 'rec' ? anRecebido(rb.a, rb.b) : val(B, n2, k);
    if ((a === null || a === undefined) && (b === null || b === undefined)) return '';
    const d = (a ?? 0) - (b ?? 0); const sinal = Math.abs(d) < (u === 'ms' ? 6e4 : 0.05) ? 0 : Math.sign(d);
    const cls = !sinal || !bom ? '' : sinal * bom > 0 ? 'bom' : 'ruim';
    const dtxt = !sinal ? 'igual' : `${sinal > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(d), u)}`;
    return `<tr><td>${nome}</td><td class="num mono"><b>${fmt(a, u)}</b></td><td class="num mono muted">${fmt(b, u)}</td><td class="num"><span class="an-dif ${cls}">${dtxt}</span></td></tr>`;
  }).join('');
  return `<div class="an-cmp"><div class="an-cmp-h"><span class="an-sec-ic">${icon('chart')}</span><h4>Comparando com ${esc(rotW)}</h4><button class="btn sm icon ghost" data-act="an-cmp-x" aria-label="Fechar a comparação" title="Fechar a comparação">${icon('x')}</button></div>
    <table class="an-cmp-t"><thead><tr><th></th><th class="num">Este período</th><th class="num">${esc(rotW)}</th><th class="num">Diferença</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="an-note">Calculado do registro do app com as regras da Produtividade (quando o período tem registro). Verde = melhorou, vermelho = piorou; ocioso e dias não são julgados.</div></div>`;
}

/* 5) Metas com barra de progresso. As do próximo período são acompanhadas ao vivo com o registro do app. */
function anNum(str) {
  const s = String(str || '');
  let m = s.match(/R\$\s?([\d.]+(?:,\d+)?)/); if (m) return { n: Number(m[1].replace(/\./g, '').replace(',', '.')), u: 'R$' };
  m = s.match(/(\d+)h(\d{2})/); if (m) return { n: (Number(m[1]) * 60 + Number(m[2])) * 6e4, u: 'ms' };
  m = s.match(/(\d+(?:,\d+)?)\s?h\b/); if (m) return { n: Number(m[1].replace(',', '.')) * 36e5, u: 'ms' };
  m = s.match(/(\d+)\s?min\b/); if (m) return { n: Number(m[1]) * 6e4, u: 'ms' };
  m = s.match(/(\d+(?:,\d+)?)\s?%/); if (m) return { n: Number(m[1].replace(',', '.')), u: '%' };
  m = s.match(/(\d+(?:,\d+)?)/); if (m) return { n: Number(m[1].replace(',', '.')), u: 'n' };
  return null;
}
/* Período seguinte ao da análise (onde valem as metas novas). */
function anProximo(t, v) {
  const f = anDia(anFim(v)); if (f === null) return null;
  const a = new Date(f); a.setDate(a.getDate() + 1);
  if (t.id === 'semana') { const b = new Date(a); b.setDate(b.getDate() + 7); return { a: a.getTime(), b: b.getTime() }; }
  if (t.id === 'mes') return { a: a.getTime(), b: new Date(a.getFullYear(), a.getMonth() + 1, 1).getTime() };
  return null;
}
/* Valor ao vivo de uma meta pelo nome dela (horas, %, distração, pausa, bloco, dia, dinheiro, projeto novo). */
function anMetaAoVivo(x, alvo, r) {
  if (!r || Date.now() < r.a) return null;
  const b = Math.min(Date.now(), r.b), nome = String(x.nome || '').toLowerCase();
  if (/financeir|receb|r\$/.test(nome) || alvo.u === 'R$') return anRecebido(r.a, b);
  if (/projeto novo/.test(nome)) return db.all('tempo_projects').filter(p => !p.archived && new Date(p.created_at).getTime() >= r.a && new Date(p.created_at).getTime() < b).length;
  const st = anStats(r.a, b); if (!st) return alvo.u === '%' ? null : 0;
  const S = st.S;
  if (/pausa/.test(nome) && alvo.u === '%') return S.base > 0 ? S.tot.dist / S.base * 100 : 0;
  if (/produtivo/.test(nome) && alvo.u === '%') return S.pctProd;
  if (/distra/.test(nome)) return S.tot.dist;
  if (/bloco/.test(nome)) return S.longest;
  if (/um dia/.test(nome)) return Math.max(0, ...S.dayTable.map(d => d.prod));
  if (/hora|líquid|produtiv/.test(nome) && alvo.u === 'ms') return S.tot.prod;
  return null;
}
function anMetaBarra(x, ctx, nova) {
  const alvo = anNum(x.alvo); if (!alvo) return '';
  const sobe = !/até|no máximo|máx/i.test(`${x.alvo} ${x.nome}`);
  let v = null, aoVivo = false;
  if (nova) { const r = ctx && ctx.t ? anProximo(ctx.t, ctx.v) : null; v = anMetaAoVivo(x, alvo, r); aoVivo = v !== null && r && Date.now() < r.b; }
  else { const n = anNum(x.resultado); if (n && n.u === alvo.u) v = n.n; }
  if (v === null || v === undefined || isNaN(v)) return '';
  const num1 = (n) => (Math.round(n * 10) / 10).toLocaleString('pt-BR');
  const fmt = (n) => (alvo.u === 'ms' ? fmtDur(n) : alvo.u === '%' ? num1(n) + '%' : alvo.u === 'R$' ? fmtMoney0(n) : num1(n));
  const ok = sobe ? v >= alvo.n : v <= alvo.n;
  // meta que já passou: se a conta daqui discorda do que a análise concluiu (desafio com regra própria), não desenha a barra
  if (!nova && typeof x.conquistada === 'boolean' && ok !== x.conquistada) return '';
  const p = alvo.n > 0 ? Math.min(1, v / alvo.n) : 0;
  const txt = ok ? (sobe ? 'bateu' : 'dentro do limite') : sobe ? `faltam ${fmt(alvo.n - v)}` : `passou ${fmt(v - alvo.n)}`;
  return `<div class="an-mbar ${ok ? 'ok' : sobe ? '' : 'over'}"><span style="width:${Math.round(p * 100)}%"></span></div><div class="an-mbar-t"><b>${fmt(v)}</b> de ${fmt(alvo.n)} · ${txt}${aoVivo ? ' · <em class="an-vivo" title="Atualiza sozinho com o registro do app">ao vivo</em>' : ''}</div>`;
}

/* 3) Itens que viram ação: "+ To-do" nas prioridades e sugestões; nomes de projeto viram link para o projeto. */
function anTodoTxt(txt) { const p = anPartes(txt); const f = (p.c || '').split(/(?<=[.!?])\s+/)[0]; return (p.t ? `${p.t}${f ? ': ' + f : ''}` : f || String(txt)).replace(/\.$/, '').slice(0, 160); }
function anLinkProj(html) {
  const ps = db.all('tempo_projects').filter(p => !p.archived && String(p.name || '').length >= 4).sort((a, b) => String(b.name).length - String(a.name).length);
  if (!ps.length) return html;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\wÀ-ú])(${ps.map(p => escRe(esc(p.name))).join('|')})(?=$|[^\\wÀ-ú])`, 'g');
  const porNome = new Map(ps.map(p => [esc(p.name), p.id]));
  return html.split(/(<[^>]+>)/).map(part => part.startsWith('<') ? part : part.replace(re, (m, pre, nome) => `${pre}<button type="button" class="an-proj" data-act="proj-open" data-id="${porNome.get(nome)}" title="Abrir o projeto">${nome}</button>`)).join('');
}
ACTIONS['an-todo'] = (el) => {
  const txt = el.dataset.txt || ''; if (!txt) return;
  if (db.all('tempo_notices').some(n => n.kind === 'todo' && n.status === 'open' && n.title === txt)) { toast('Já está no To-do'); return; }
  if (typeof todoAddRaw === 'function') { todoAddRaw(txt); toast('Virou to-do'); }
};
CHANGES['an-cmp'] = (el) => { AN.cmp = el.value || null; render(); };
ACTIONS['an-cmp-x'] = () => { AN.cmp = null; render(); };

/* Estilo do PDF (A4), independente do CSS do app. */
const AN_PDF_CSS = `@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;color:#15171C;font-size:11px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{padding:30px 40px}.capa{background:#E7EAFD;color:#15171C;padding:34px 40px 24px}.capa .tag{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#565C6B}.capa h1{font-size:24px;margin:6px 0 4px;font-weight:700}.capa .per{color:#565C6B;font-size:11.5px}
.an-n{font-weight:700;color:#15171C;white-space:nowrap}
.an-resumo{margin:0 0 16px;padding:14px 16px;background:#F5F6F8;border-radius:8px}.an-resumo p{margin:6px 0 0;color:#565C6B}.an-resumo .an-lead{margin:0;font-size:14px;font-weight:600;color:#15171C;line-height:1.4}
.an-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 16px}.an-kpi{border:1px solid #E0E3EA;border-radius:10px;padding:9px 11px;break-inside:avoid}.an-kpi .k{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8A909F;font-weight:600}.an-kpi-vr{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}.an-kpi .v{font-size:18px;font-weight:700}.an-kpi .d{font-size:9.5px;color:#565C6B;margin-top:3px}.an-tend{font-size:8.5px;color:#8A909F}
.an-kpi.bom{border-top:3px solid #77DB89}.an-kpi.ruim{border-top:3px solid #F2958B}.an-meta-p{display:inline-block;margin-top:4px;font-size:9px;font-weight:600;padding:1px 7px;border-radius:99px;background:#EEF0F4;color:#565C6B}.an-meta-p.bom{background:#E3F7E7;color:#1F6B35}.an-meta-p.ruim{background:#FBE0DD;color:#9B2C22}
.an-graficos{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}.an-chart{border:1px solid #E0E3EA;border-radius:10px;padding:10px 12px;break-inside:avoid}.an-chart-t{font-weight:700;font-size:11.5px;margin-bottom:4px}.an-leg{display:flex;gap:10px;flex-wrap:wrap;font-size:9px;color:#565C6B;margin:0 0 4px}.an-leg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.an-secs{display:block}.an-sec{margin:14px 0 0;break-inside:avoid-page}.an-sec-h{display:flex;align-items:center;gap:8px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #E0E3EA}.an-sec-h h4{margin:0;font-size:13px}.an-sec-ic svg{width:14px;height:14px;color:#8C9CF2;display:block}.an-sec-n{font-size:9.5px;color:#8A909F}.an-sec-v{display:none}
.an-its{display:flex;flex-direction:column;gap:7px}.an-it{display:flex;gap:9px;break-inside:avoid}.an-it-n{flex:none;width:18px;height:18px;border-radius:50%;background:#E7EAFD;color:#2E43D6;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center}.an-it-t{font-weight:700;font-size:11.5px;color:#15171C}.an-it-c{color:#565C6B}
.an-comps{display:grid;grid-template-columns:1fr 1fr;gap:8px}.an-comp{border:1px solid #E0E3EA;border-radius:8px;padding:8px 10px;break-inside:avoid}.an-comp-k{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8A909F;font-weight:600;margin-bottom:2px}.an-comp-t{color:#565C6B}
.an-pill{display:inline-block;padding:1px 8px;border-radius:99px;background:#EEF0F4;font-size:9px;font-weight:600;color:#565C6B;margin-left:4px;vertical-align:1px}.an-pill.bom{background:#E3F7E7;color:#1F6B35}.an-pill.ruim{background:#FBE0DD;color:#9B2C22}.an-pill.meio{background:#FFF2DC;color:#A86400}
.an-sub{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8A909F;font-weight:600;margin:8px 0 4px}.an-meta-g{display:grid;grid-template-columns:1fr 1fr;gap:6px}.an-meta{display:flex;gap:8px;align-items:flex-start;padding:7px 10px;border:1px solid #E0E3EA;border-radius:8px;break-inside:avoid}.an-meta.bom{background:#E3F7E7;border-color:#BFEBC9}.an-meta span{color:#565C6B;display:block}.an-meta-i{font-size:12px;line-height:1.2}
.an-destaque{display:flex;gap:10px;align-items:flex-start;margin-top:8px;padding:10px 12px;background:#E7EAFD;border-radius:8px;font-weight:600}.an-destaque .an-sub{margin:0 0 2px}.an-note{font-size:9.5px;color:#8A909F;margin-top:6px}
.an-mbar{height:5px;border-radius:99px;background:#E5E8EE;overflow:hidden;margin-top:6px}.an-mbar>span{display:block;height:100%;background:#8C9CF2}.an-mbar.ok>span{background:#77DB89}.an-mbar.over>span{background:#F2958B}.an-mbar-t{font-size:9.5px;color:#565C6B;margin-top:3px}.an-vivo{font-style:normal;color:#1F6B35;font-weight:600}.an-todo{display:none}.an-proj{all:unset;font-weight:600}
.rod{margin-top:24px;padding-top:8px;border-top:1px solid #E0E3EA;font-size:9px;color:#8A909F;display:flex;justify-content:space-between}`;
function anPdfHTML(t, v) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(anTitulo(t, v))}</title><style>${AN_PDF_CSS}</style></head><body>
<div class="capa"><div class="tag">Tempo · Análise ${esc(t.label.toLowerCase())}</div><h1>${esc(anTitulo(t, v))}</h1><div class="per">Período de ${anData(anIni(v))} a ${anData(anFim(v))}</div></div>
<div class="pg">${anCorpoHTML(v, true, { t, key: anChave(t, v) })}<div class="rod"><span>Tulio · APP TEMPO</span><span>Gerado em ${esc(String(v.gerado_em || '').slice(0, 16).replace('T', ' '))}</span></div></div></body></html>`;
}
function anChave(t, v) { const x = anLista(t.prefix).find(y => y.v === v || (anIni(y.v) === anIni(v) && anFim(y.v) === anFim(v))); return x ? x.key : null; }
function anPdfNome(t, v) { return `Analise_${t.label.replace(/\s+/g, '')}_${String(anIni(v) || 'periodo').slice(0, 10)}`; }

function anAtual() {
  const t = AN_TIPOS.find(x => x.id === AN.tipo) || AN_TIPOS[0];
  const lista = anLista(t.prefix);
  const item = lista.find(x => x.key === AN.key) || lista[0] || null;
  return { t, lista, item };
}
ACTIONS['an-ir'] = (el) => { const sec = document.getElementById(el.dataset.id); if (!sec) return; if (sec.tagName === 'DETAILS') sec.open = true; sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
ACTIONS['an-tipo'] = (el) => { AN.tipo = el.dataset.tipo; AN.key = null; AN.cmp = null; render(); };
CHANGES['an-periodo'] = (el) => { AN.key = el.value; AN.cmp = null; render(); };
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
  // comparar com outra análise do mesmo tipo (a anterior vem sugerida primeiro)
  const outras = item ? lista.filter(x => x.key !== item.key) : [];
  const cmpItem = AN.cmp ? outras.find(x => x.key === AN.cmp) || null : null;
  const cmpSel = outras.length ? `<select class="input sm" data-on="an-cmp" aria-label="Comparar com outro período" title="Mostra os números deste período lado a lado com outro"><option value="">Comparar com…</option>${outras.map(x => `<option value="${esc(x.key)}" ${cmpItem && cmpItem.key === x.key ? 'selected' : ''}>${esc(anData(anIni(x.v)))} a ${esc(anData(anFim(x.v)))}</option>`).join('')}</select>` : '';
  const pdf = item ? `<button class="btn sm" data-act="an-pdf" data-tip="Gera o relatório em PDF (A4) e abre">${icon('doc', 'ico')} PDF</button>` : '';
  const corpo = item
    ? `<article class="an-rel"><header class="an-capa"><div class="tag">Análise ${esc(t.label.toLowerCase())}</div><h2>${esc(anTitulo(t, item.v))}</h2><div class="per">Período de ${anData(anIni(item.v))} a ${anData(anFim(item.v))} · gerada em ${esc(String(item.v.gerado_em || '').slice(0, 16).replace('T', ' '))}</div></header><div class="an-body">${anCorpoHTML(item.v, false, { t, key: item.key, cmp: cmpItem, cmpRot: cmpItem ? `${anData(anIni(cmpItem.v))} a ${anData(anFim(cmpItem.v))}` : '' })}</div></article>`
    : `<section class="card"><div class="muted">A análise ${t.id === 'semana' ? 'da semana' : t.id === 'mes' ? 'do mês' : 'de ' + t.label} aparece aqui depois da primeira geração, ${t.quando} (Recife).</div></section>`;
  // sumário: atalhos para cada seção do relatório (pula e abre a seção, se estiver recolhida)
  const secs = item ? [...corpo.matchAll(/class="an-sec[^"]*" id="(an-[^"]+)"[^>]*>(?:<summary[^>]*>|<div class="an-sec-h">)<span class="an-sec-ic">[\s\S]*?<\/span><h4>([^<]+)<\/h4>/g)].map(m => [m[1], m[2]]) : [];
  const sumario = secs.length > 2 ? `<nav class="an-sumario" aria-label="Seções da análise">${secs.map(([id, t]) => `<button class="an-ir" data-act="an-ir" data-id="${id}" data-tip="Ir para ${t}">${t.replace(/ \(.*\)$/, '')}</button>`).join('')}</nav>` : '';
  // metas ao vivo: redesenha a cada minuto enquanto a tela está aberta
  clearTimeout(AN.timer);
  if (typeof S !== 'undefined' && S.route === 'analises') AN.timer = setTimeout(() => { if (S.route === 'analises') render(); }, 60000);
  return { title: 'Análises', actions: `<div class="row" style="gap:6px">${periodo}${cmpSel}${pdf}</div>`, html: `<div class="stack" style="gap:14px">${abas}${sumario}${corpo}</div>` };
};
