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
function aplicaModelo(st, chave, tipos = [], modo = 'substitui') {
  const mo = MODELOS[chave]; if (!mo) return st;
  const wtId = (n) => (tipos.find(t => t.name === n) || {}).id || '';
  gruposDe(st);
  const vazias = (st.lines || []).every(l => !(l.name || '').trim() && !Number(l.h));
  const g = { id: novoGrupoId(), nome: mo.nome, mod: chave };
  if (mo.video) g.duracao = 1;
  const novas = mo.etapas.map(e => ({ name: e.name, wt: wtId(e.wt), h: e.par || e.terc ? '' : (e.h || ''), prazo: e.par ? '' : (e.prazo || ''), ap: !!e.ap, par: !!e.par, terc: !!e.terc, valor: null, mod: chave, grp: g.id }));
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
const temVideo = (st) => modelosDe(st).some(k => MODELOS[k]?.video);
/* Multiplicador de duração de cada etapa: só nas etapas de projeto de vídeo. Etapa em paralelo não conta horas nem prazo. */
const grupoVideo = (g) => !!(g && (g.video || MODELOS[g.mod]?.video));
/* Duração é de cada projeto de vídeo (3 vídeos podem ter durações diferentes); fora de vídeo, 1×. */
function multEtapa(st, l) {
  const gs = gruposDe(st); const g = gs.find(x => x.id === l.grp) || gs[0];
  return grupoVideo(g) ? durMult(g.duracao ?? st.duracao ?? 1) : 1;
}
/* Etapa em paralelo ou terceirizada não conta horas minhas (a terceirizada entra pelo valor, sem multiplicar). */
const horasEtapa = (st, l) => l.par || l.terc ? 0 : (Number(l.h) || 0) * multEtapa(st, l);
const tercEtapas = (st) => (st.lines || []).reduce((s, l) => s + (l.terc && !l.par ? Number(l.valor) || 0 : 0), 0);
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
  const hBruto = st.lines.reduce((s, x) => s + (x.par || x.terc ? 0 : Number(x.h) || 0), 0);   // como digitado (por minuto, no vídeo)
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
    const tg = st.lines.reduce((s, x) => s + (x.grp === g.id && x.terc && !x.par ? Number(x.valor) || 0 : 0), 0);
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
