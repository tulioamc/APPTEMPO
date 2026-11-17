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
};
/* Aplica o modelo nas etapas da calculadora; tipo de trabalho pelo nome (o que não existir fica em branco). */
function aplicaModelo(st, chave, tipos = []) {
  const mo = MODELOS[chave]; if (!mo) return st;
  const wtId = (n) => (tipos.find(t => t.name === n) || {}).id || '';
  st.modelo = chave;
  st.lines = mo.etapas.map(e => ({ name: e.name, wt: wtId(e.wt), h: e.h || '', prazo: e.prazo || '', ap: !!e.ap, par: !!e.par }));
  st.aprov = mo.etapas.filter(e => e.ap).length;
  if (mo.video && !(Number(st.duracao) > 0)) st.duracao = 1;
  if (!mo.video) st.duracao = '';
  return st;
}
/* Prazo das etapas (dias úteis): fechado = soma das etapas em sequência × duração; provável = + ajuste de 40% do prazo
   de cada etapa com aprovação (o mínimo combinado). Sem prazos nas etapas, vale horas ÷ 8 h. */
function prazosEtapas(st, h) {
  const dur = MODELOS[st.modelo]?.video ? durMult(st.duracao) : 1;
  const temPrazo = st.lines.some(x => Number(x.prazo) > 0);
  if (!temPrazo) { const f = h ? Math.max(1, Math.ceil(h / HORAS_DIA)) : 0; return { fechado: f, provavel: f, doModelo: false }; }
  const seq = st.lines.filter(x => !x.par).reduce((s, x) => s + (Number(x.prazo) || 0), 0) * dur;
  const aj = st.lines.filter(x => x.ap).reduce((s, x) => s + 0.4 * (Number(x.prazo) || 0), 0) * dur;
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
  const hEtapas = st.lines.reduce((s, x) => s + (Number(x.h) || 0), 0);
  // duração só vale nos modelos de vídeo (horas do modelo são por minuto); fora deles, 1×
  const dur = MODELOS[st.modelo]?.video ? durMult(st.duracao) : 1, cx = cxMult(st.cx);
  // reuniões de aprovação somam horas (não multiplicam): quantidade × horas por reunião (padrão 1 h)
  const reun = Math.max(0, Number(st.aprov) || 0) * (st.hAprov === '' || st.hAprov == null ? 1 : Math.max(0, Number(st.hAprov) || 0));
  const h = hEtapas * dur * cx + reun;
  const M = h * r;
  // urgência: prazo fechado = o trabalho sozinho no ritmo normal (horas ÷ 8 h por dia útil)
  const pz = prazosEtapas(st, h); const fechado = pz.fechado;
  const pedido = Number(st.pedido) || 0;
  const urgBruta = pedido > 0 && fechado && pedido < fechado ? fechado / pedido : 1;
  const urg = Math.min(URGENCIA_TETO, urgBruta);
  const Mu = M * urg; const U = Mu - M;
  const B = st.ext.on ? st.ext.items.reduce((s, x) => s + (Number(x.value) || 0), 0) : 0;
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
  const porEtapa = st.lines.map(x => hEtapas ? Mf * (Number(x.h) || 0) / hEtapas : 0);
  return { r, hEtapas, dur, cx, reun, h, M, fechado, provavel: pz.provavel, prazoModelo: pz.doModelo, pedido, urgBruta, urg, U, Mu, desc, Mf, B, C, D,
    total: pre + D, horaEf: h ? Mf / h : 0, porEtapa, semPrazo: urgBruta > URGENCIA_TETO };
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
