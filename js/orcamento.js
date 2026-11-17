/* Conta do orçamento (decidida em 21/10/2026, doc "Ideias organizadas", seção 5):
   1) horas = etapas × duração do vídeo (mín. 30 s) × complexidade + 1 h de reunião por aprovação
   2) minha parte = horas × hora base × porte × mercado
   3) urgência = prazo fechado ÷ prazo pedido (só quando o pedido é menor; teto 2×), só na minha parte
   4) desconto (R$ ou %) só na minha parte, mostrando quanto a hora cai
   5) + terceirizado (pelo custo, sem desconto)
   6) BV sobre minha parte + terceirizado; 7) imposto por último (por fora, ou por dentro)
   Nos dois sentidos: se o total final for digitado, só a minha parte se ajusta (vira o desconto ou o acréscimo). */
const PRECO_PADRAO = { hora: 200, porte: { pequeno: 0.85, medio: 1.15, grande: 1.5 }, mercado: { local: 1, nacional: 1.5, internacional: 2.5 } };
const PORTES = [['pequeno', 'Pequeno'], ['medio', 'Médio'], ['grande', 'Grande']];
const MERCADOS = [['local', 'Local (Recife)'], ['nacional', 'Nacional'], ['internacional', 'Internacional']];
const COMPLEXIDADES = [['simples', 'Simples', 1], ['padrao', 'Padrão', 1.3], ['complexo', 'Complexo / personagem', 1.7]];
const URGENCIA_TETO = 2;
const HORAS_DIA = 8;

/* Modelos por subcategoria (decididos em 21/10/2026). Horas de trabalho e prazo do cliente (dias úteis) por etapa;
   motion é por minuto de vídeo. ap = etapa termina com aprovação do cliente (+1 h de reunião, ajuste previsto);
   par = corre em paralelo com a anterior (não soma prazo). Terceirizados ficam com 0 h (custo na linha "Terceirizado"). */
const MODELOS = {
  identidade: { nome: 'Identidade visual', etapas: [
    { name: 'Pesquisa e moodboard', wt: 'Branding / marcas', h: 2, prazo: 2, ap: true },
    { name: 'Marca', wt: 'Branding / marcas', h: 12, prazo: 4 },
    { name: 'Sistema da identidade e aplicações', wt: 'Branding / marcas', h: 10, prazo: 3 },
    { name: 'Apresentação', wt: 'Design gráfico', h: 10, prazo: 3, ap: true }] },
  manual: { nome: 'Manual de marca', etapas: [{ name: 'Manual da marca', wt: 'Branding / marcas', h: 16, prazo: 5, ap: true }] },
  motion2d: { nome: 'Motion 2D', video: true, etapas: [
    { name: 'Roteiro', wt: '', h: 0, prazo: 5, ap: true, terc: true },
    { name: 'Style frames', wt: 'Direção de arte', h: 10, prazo: 5, ap: true },
    { name: 'Storyboard', wt: 'Ilustração 2D', h: 16, prazo: 5, ap: true },
    { name: 'Locução', wt: '', h: 0, prazo: 0, par: true, terc: true },
    { name: 'Animação 2D', wt: 'Animação 2D', h: 16, prazo: 5 },
    { name: 'Trilha e sound effects', wt: '', h: 0, prazo: 1, ap: true, terc: true }] },
  motion3d: { nome: 'Motion 3D', video: true, etapas: [
    { name: 'Roteiro', wt: '', h: 0, prazo: 5, ap: true, terc: true },
    { name: 'Style frames', wt: 'Direção de arte', h: 10, prazo: 5, ap: true },
    { name: 'Modelagem e storyboard', wt: 'Modelagem 3D', h: 20, prazo: 7.5, ap: true },
    { name: 'Locução', wt: '', h: 0, prazo: 0, par: true, terc: true },
    { name: 'Animação 3D', wt: 'Animação 3D', h: 16, prazo: 5 },
    { name: 'Render 3D', wt: '', h: 0, prazo: 2 },
    { name: 'Animação 2D', wt: 'Animação 2D', h: 16, prazo: 5 },
    { name: 'Trilha e sound effects', wt: '', h: 0, prazo: 1, ap: true, terc: true }] },
  traducao: { nome: 'Tradução de vídeo', etapas: [
    { name: 'Tradução Língua 01', wt: '', h: 0, prazo: 3, terc: true },
    { name: 'Locução Língua 01', wt: '', h: 0, prazo: 3, terc: true },
    { name: 'Adaptação Estática Língua 01', wt: 'Design gráfico', h: 4, prazo: 2 },
    { name: 'Adaptação Animada Língua 01', wt: 'Animação 2D', h: 4, prazo: 2, ap: true }] },
};
/* Projetos do orçamento: cada modelo vira um projeto (grupo de etapas). Ao aprovar, cada grupo vira um projeto no app.
   modo 'substitui' (padrão) troca tudo; 'adiciona' acrescenta o modelo como mais um projeto (ex.: Identidade + Manual + Vídeo 2D). */
let _gid = 0;
const novoGrupoId = () => 'g' + Date.now().toString(36) + (++_gid);
/* Normaliza estados antigos (sem grupos): um grupo só, com todas as etapas. */
function gruposDe(st) {
  if (!Array.isArray(st.grupos) || !st.grupos.length) st.grupos = [{ id: 'g1', nome: '', mod: (st.modelos && st.modelos[0]) || st.modelo || null }];
  const ids = new Set(st.grupos.map(g => g.id));
  (st.lines || []).forEach(l => { if (!l.grp || !ids.has(l.grp)) l.grp = st.grupos[0].id; });
  return st.grupos;
}
/* Modelos próprios (salvos de uma proposta): em tempo_settings 'modelosProprios' { chave: { nome, video, etapas } }. */
const modelosProprios = () => (typeof db !== 'undefined' && db.setting('modelosProprios', null)) || {};
/* Todos os modelos: os prontos (editáveis: a versão editada fica em modelosProprios com a mesma chave) e os criados;
   os apagados ficam em 'modelosOcultos'. Favoritos ('modelosFav') aparecem como botões; o resto em "Outros". */
const modelosOcultos = () => (typeof db !== 'undefined' && db.setting('modelosOcultos', null)) || [];
const todosModelos = () => { const t = { ...MODELOS, ...modelosProprios() }; modelosOcultos().forEach(k => delete t[k]); return t; };
const modelosFav = () => { const f = (typeof db !== 'undefined' && db.setting('modelosFav', null)); return (f || ['identidade', 'manual', 'motion2d', 'motion3d']).filter(k => todosModelos()[k]); };
function aplicaModelo(st, chave, tipos = [], modo = 'substitui') {
  const mo = todosModelos()[chave]; if (!mo) return st;
  const wtId = (n) => (tipos.find(t => t.name === n) || {}).id || '';
  gruposDe(st);
  const vazias = (st.lines || []).every(l => !(l.name || '').trim() && !Number(l.h));
  const g = { id: novoGrupoId(), nome: mo.nome, mod: chave };
  if (mo.video) g.duracao = 1;
  const novas = mo.etapas.map(e => ({ name: e.name, wt: e.wtId || wtId(e.wt), h: e.par || e.terc ? '' : (e.h || ''), prazo: e.par ? '' : (e.prazo || ''), qtd: e.qtd || '', ap: !!e.ap, par: !!e.par, terc: !!e.terc, valor: e.terc ? (e.valor ?? null) : null, mod: chave, grp: g.id }));
  if (modo === 'adiciona' && !vazias) {
    const usados = new Set(st.lines.filter(l => (l.name || '').trim() || Number(l.h)).map(l => l.grp));
    st.grupos = [...st.grupos.filter(x => usados.has(x.id)), g];
    st.lines = [...st.lines.filter(l => (l.name || '').trim() || Number(l.h)), ...novas];
    st.aprov = (Number(st.aprov) || 0) + mo.etapas.filter(e => e.ap).length;
  } else {
    st.grupos = [g]; st.lines = novas; st.aprov = mo.etapas.filter(e => e.ap).length;
  }
  st.modelos = [...new Set(st.grupos.map(x => x.mod).filter(Boolean))];
  st.modelo = st.modelos[0] || null;
  return st;
}
const modelosDe = (st) => Array.isArray(st.grupos) && st.grupos.length ? [...new Set(st.grupos.map(g => g.mod).filter(Boolean))] : (st.modelos || (st.modelo ? [st.modelo] : []));
const temVideo = (st) => modelosDe(st).some(k => todosModelos()[k]?.video);
/* Multiplicador de duração de cada etapa: só nas etapas de projeto de vídeo. Etapa em paralelo não conta horas nem prazo. */
const grupoVideo = (g) => !!(g && (g.video || todosModelos()[g.mod]?.video));
/* Duração é de cada projeto de vídeo (3 vídeos podem ter durações diferentes); fora de vídeo, 1×. */
function multEtapa(st, l) {
  const gs = gruposDe(st); const g = gs.find(x => x.id === l.grp) || gs[0];
  return grupoVideo(g) ? durMult(g.duracao ?? st.duracao ?? 1) : 1;
}
/* Etapa em paralelo ou terceirizada não conta horas minhas (a terceirizada entra pelo valor, sem multiplicar). */
/* Quantidade (ex.: 50 ícones): multiplica as horas e o valor do terceirizado da etapa; vazio = 1. */
const qtdEtapa = (l) => Math.max(0, Number(l.qtd) > 0 ? Number(l.qtd) : 1);
const horasEtapa = (st, l) => l.par || l.terc ? 0 : (Number(l.h) || 0) * qtdEtapa(l) * multEtapa(st, l);
const valorTerc = (l) => l.terc && !l.par ? (Number(l.valor) || 0) * qtdEtapa(l) : 0;
const tercEtapas = (st) => (st.lines || []).reduce((s, l) => s + valorTerc(l), 0);
/* Prazo das etapas (dias úteis): fechado = soma das etapas em sequência × duração; provável = + ajuste de 40% do prazo
   de cada etapa com aprovação (o mínimo combinado). Sem prazos nas etapas, vale horas ÷ 8 h. */
function prazosEtapas(st, h) {
  const temPrazo = st.lines.some(x => !x.par && Number(x.prazo) > 0);
  if (!temPrazo) { const f = h ? Math.max(1, Math.ceil(h / HORAS_DIA)) : 0; return { fechado: f, provavel: f, doModelo: false }; }
  const seq = st.lines.filter(x => !x.par).reduce((s, x) => s + (Number(x.prazo) || 0) * multEtapa(st, x), 0);
  const aj = st.lines.filter(x => x.ap && !x.par).reduce((s, x) => s + 0.4 * (Number(x.prazo) || 0) * multEtapa(st, x), 0);
  return { fechado: Math.ceil(seq), provavel: Math.ceil(seq + aj), doModelo: true };
}
function precoBase() {
  const v = db.setting('precoBase', null) || {};
  return { hora: v.hora ?? PRECO_PADRAO.hora, porte: { ...PRECO_PADRAO.porte, ...(v.porte || {}) }, mercado: { ...PRECO_PADRAO.mercado, ...(v.mercado || {}) } };
}
function calcRate(st, pb) {
  if (st.outro) return Number(st.customRate) || 0;
  return (Number(pb.hora) || 0) * (Number(pb.porte[st.porte]) || 1) * (Number(pb.mercado[st.mercado]) || 1);
}
const fmtX = (n) => String(Math.round(Number(n || 0) * 100) / 100).replace('.', ',') + '×';
const cxMult = (k) => (COMPLEXIDADES.find(x => x[0] === k) || COMPLEXIDADES[0])[2];
/* duração do vídeo em minutos: vazio = não é vídeo (1×); abaixo de 30 s conta 30 s */
const durMult = (min) => { const d = Number(min); return d > 0 ? Math.max(0.5, d) : 1; };

function calcQuote(st, pb) {
  const r = calcRate(st, pb);
  gruposDe(st);
  const hBruto = st.lines.reduce((s, x) => s + (x.par || x.terc ? 0 : Number(x.h) || 0), 0);   // por unidade/minuto, como digitado   // como digitado (por minuto, no vídeo)
  const hEt = st.lines.map(x => horasEtapa(st, x));
  const hEtapas = hEt.reduce((s, v) => s + v, 0);
  // duração só vale nos modelos de vídeo (horas do modelo são por minuto); fora deles, 1×
  const dur = 1, cx = cxMult(st.cx);
  // reuniões de aprovação somam horas (não multiplicam): quantidade × horas por reunião (padrão 1 h)
  const reun = Math.max(0, Number(st.aprov) || 0) * (st.hAprov === '' || st.hAprov == null ? 1 : Math.max(0, Number(st.hAprov) || 0));
  const h = hEtapas * cx + reun;
  const M = h * r;
  // urgência: prazo fechado = o trabalho sozinho no ritmo normal (horas ÷ 8 h por dia útil)
  const pz = prazosEtapas(st, h); const fechado = pz.fechado;
  const pedido = Number(st.pedido) || 0;
  const urgBruta = pedido > 0 && fechado && pedido < fechado ? fechado / pedido : 1;
  const urg = Math.min(URGENCIA_TETO, urgBruta);
  const Mu = M * urg; const U = Mu - M;
  const Bext = st.ext?.on ? st.ext.items.reduce((s, x) => s + (Number(x.value) || 0), 0) : 0;
  const Bterc = tercEtapas(st); const B = Bext + Bterc;
  const bvP = st.bv.on ? (Number(st.bv.pct) || 0) / 100 : 0;
  const nfP = st.nf.on ? (Number(st.nf.pct) || 0) / 100 : 0;
  const nfF = !nfP ? 1 : st.nf.inside && nfP < 1 ? 1 / (1 - nfP) : 1 + nfP;
  let Mf, desc;
  if (Number(st.alvo) > 0) {   // total digitado: só a minha parte se ajusta
    Mf = Math.max(0, Number(st.alvo) / ((1 + bvP) * nfF) - B); desc = Mu - Mf;
  } else {
    const dv = Number(st.desc) || 0;
    desc = st.descTipo === '%' ? Mu * Math.min(100, dv) / 100 : dv;
    desc = Math.min(Math.max(0, desc), Mu); Mf = Mu - desc;
  }
  const C = (Mf + B) * bvP;
  const pre = Mf + B + C; const D = pre * nfF - pre;
  // etapas com o valor proporcional da minha parte final (o ajuste do total se espalha entre elas)
  const porEtapa = hEt.map(v => hEtapas ? Mf * v / hEtapas : 0);
  // por projeto (grupo): horas com complexidade e a parte do total (reuniões e impostos na mesma proporção)
  // parte de cada projeto: minha parte pelas horas + terceirizados das etapas dele + custo extra geral pelas horas
  const baseTot = Mf + B;
  const porGrupo = st.grupos.map(g => {
    const hg = st.lines.reduce((s, x, i) => s + (x.grp === g.id ? hEt[i] : 0), 0);
    const tg = st.lines.reduce((s, x) => s + (x.grp === g.id ? valorTerc(x) : 0), 0);
    const sh = hEtapas ? hg / hEtapas : (st.grupos.length ? 1 / st.grupos.length : 0);
    return { id: g.id, nome: g.nome, mod: g.mod, h: hg * cx, terc: tg, parte: baseTot ? (Mf * sh + tg + Bext * sh) / baseTot : 0 };
  });
  return { r, hBruto, hEtapas, porGrupo, dur, cx, reun, Bext, Bterc, h, M, fechado, provavel: pz.provavel, prazoModelo: pz.doModelo, pedido, urgBruta, urg, U, Mu, desc, Mf, B, C, D,
    total: pre + D, horaEf: h ? Mf / h : 0, porEtapa, semPrazo: urgBruta > URGENCIA_TETO };
}
/* Move a etapa i para a posição de j (e para o grupo de j). */
function moveEtapa(st, i, j, grp) {
  if (i === j && !grp) return st;
  const [l] = st.lines.splice(i, 1); if (grp) l.grp = grp;
  st.lines.splice(j > i ? j - 1 : j, 0, l);
  return st;
}
/* Muda o total de horas das etapas mantendo a proporção entre elas (ex.: 6/18/6 com 40 h vira 8/24/8). */
function redistribuiHoras(lines, total) {
  const t = Math.max(0, Number(total) || 0); const soma = lines.reduce((s, x) => s + (Number(x.h) || 0), 0);
  if (!lines.length) return lines;
  if (!soma) { lines.forEach((x, i) => { x.h = i ? '' : t; }); return lines; }
  let acc = 0;
  lines.forEach((x, i) => {
    if (i === lines.length - 1) { x.h = Math.round((t - acc) * 2) / 2; return; }
    const v = Math.round(t * (Number(x.h) || 0) / soma * 2) / 2; x.h = v; acc += v;
  });
  return lines;
}

/* Moeda da proposta: cotação do dia (AwesomeAPI, reais por unidade). Os valores continuam em reais por dentro;
   a tela e o PDF mostram convertido. */
const MOEDAS = { USD: { nome: 'Dólar', simb: 'US$', loc: 'en-US' }, EUR: { nome: 'Euro', simb: '€', loc: 'de-DE' }, GBP: { nome: 'Libra', simb: '£', loc: 'en-GB' } };
async function cotacaoHoje(cod) {
  const r = await fetch(`https://economia.awesomeapi.com.br/json/last/${cod}-BRL`); const j = await r.json();
  const v = j[cod + 'BRL']; if (!v || !(Number(v.bid) > 0)) throw new Error('sem cotação');
  return { cod, taxa: Number(v.bid), data: (v.create_date || '').slice(0, 10) };
}
function fmtNaMoeda(v, moeda, casas = 0) {
  const m = moeda && MOEDAS[moeda.cod];
  if (!m || !(moeda.taxa > 0)) return casas ? fmtMoney(v) : fmtMoney0(v);
  return m.simb + ' ' + (Number(v) / moeda.taxa).toLocaleString(m.loc, { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/* Sua média real por etapa: tarefas de projetos concluídos com "Estimado: X h" e o mesmo nome de etapa.
   Devolve { h, n } (horas reais médias por tarefa) só com 2 ou mais exemplos. */
const _normEtapa = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
let _mediasCache = null;
function mediasReais() {
  const rev = (db.data.tempo_time_entries || []).length + ':' + (db.data.tempo_tasks || []).length;
  if (_mediasCache && _mediasCache.rev === rev) return _mediasCache.m;
  const m = {};
  (db.data.tempo_tasks || []).forEach(t => {
    if (t.parent_id || !/Estimado:/i.test(t.notes || '')) return;
    const p = db.get('tempo_projects', t.project_id); if (!p || statusCat(p.status_id) !== 'done') return;
    const ms = taskMs(t.id); if (!ms) return;
    const k = _normEtapa(t.name); (m[k] ||= []).push(ms / 36e5);
  });
  const out = {}; Object.entries(m).forEach(([k, v]) => { if (v.length >= 2) out[k] = { h: v.reduce((s, x) => s + x, 0) / v.length, n: v.length }; });
  _mediasCache = { rev, m: out }; return out;
}
const mediaDaEtapa = (nome) => mediasReais()[_normEtapa(nome)] || null;

/* Prazo (dias úteis) só das etapas de um projeto: etapas em sequência, sem as paralelas. */
const prazoGrupo = (st, gid) => Math.ceil(st.lines.filter(l => l.grp === gid && !l.par).reduce((s, l) => s + (Number(l.prazo) || 0) * multEtapa(st, l), 0));

/* Escopo por texto: o Claude lê o pedido do cliente e devolve projetos e etapas no formato da calculadora.
   Chamada direta do navegador à API da Anthropic com a chave dos Ajustes ('anthropicKey'). */
async function escopoPorTexto(texto) {
  const key = db.setting('anthropicKey', ''); if (!key) throw new Error('sem chave');
  const ref = Object.values(todosModelos()).map(m => `- ${m.nome}${m.video ? ' (vídeo, horas e dias por minuto)' : ''}: ${m.etapas.map(e => `${e.name} ${e.terc ? '(terceirizado)' : e.par ? '(paralelo)' : e.h + ' h'} ${e.prazo ? e.prazo + ' dias' : ''}`).join('; ')}`).join('\n');
  const sistema = `Você monta orçamentos para um designer e motion designer freelancer brasileiro (identidade visual, design gráfico, motion 2D/3D, 3D).
Responda SÓ com JSON, sem texto em volta, no formato:
{"descricao": "1 a 3 frases descrevendo o escopo para o cliente, em português",
 "projetos": [{"nome": "...", "video_min": número ou null, "etapas": [{"nome": "...", "horas": número, "dias": número, "qtd": número ou null, "terceirizado": true/false, "paralelo": true/false}]}]}
Regras: um projeto por entrega distinta (ex.: identidade, manual, cada vídeo); vídeos iguais podem ser projetos separados; horas são do trabalho do designer (terceirizado = 0 h, mas com dias);
para vídeo, horas e dias são por minuto e video_min é a duração; use quantidade quando o pedido for por unidade (ex.: 50 ícones, horas por ícone).
Use como referência os modelos do designer:\n${ref}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 2000, system: sistema, messages: [{ role: 'user', content: texto }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'erro da API');
  const txt = (j.content || []).map(c => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('resposta sem JSON');
  return JSON.parse(m[0]);
}
/* Transforma a resposta em grupos e etapas da calculadora (substitui as atuais). */
function aplicaEscopo(st, res, tipos = []) {
  const wtGuess = (n) => { const t = String(n || '').toLowerCase(); const by = (nm) => (tipos.find(x => x.name === nm) || {}).id || '';
    if (/anima[cç][aã]o 3d|render/.test(t)) return by('Animação 3D'); if (/anima/.test(t)) return by('Animação 2D'); if (/modelag/.test(t)) return by('Modelagem 3D');
    if (/marca|identidade|manual|logo/.test(t)) return by('Branding / marcas'); if (/style|dire[cç][aã]o/.test(t)) return by('Direção de arte'); if (/ilustra|storyboard/.test(t)) return by('Ilustração 2D'); return by('Design gráfico'); };
  st.grupos = []; st.lines = [];
  (res.projetos || []).forEach(pj => {
    const g = { id: novoGrupoId(), nome: pj.nome || 'Projeto', mod: null, video: !!pj.video_min, duracao: pj.video_min || undefined };
    st.grupos.push(g);
    (pj.etapas || []).forEach(e => st.lines.push({ name: e.nome || 'Etapa', wt: e.terceirizado ? '' : wtGuess(e.nome), h: e.terceirizado || e.paralelo ? '' : (Number(e.horas) || ''), prazo: e.paralelo ? '' : (Number(e.dias) || ''), qtd: Number(e.qtd) > 1 ? Number(e.qtd) : '', terc: !!e.terceirizado, par: !!e.paralelo, valor: null, ap: false, grp: g.id }));
  });
  if (!st.grupos.length) { st.grupos = [{ id: novoGrupoId(), nome: '', mod: null }]; st.lines = [{ name: '', h: '', grp: st.grupos[0].id }]; }
  st.modelos = []; st.modelo = null;
  return st;
}
