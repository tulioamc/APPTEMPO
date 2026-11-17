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
  const dur = durMult(st.duracao), cx = cxMult(st.cx);
  const reun = Math.max(0, Number(st.aprov) || 0);
  const h = hEtapas * dur * cx + reun;
  const M = h * r;
  // urgência: prazo fechado = o trabalho sozinho no ritmo normal (horas ÷ 8 h por dia útil)
  const fechado = h ? Math.max(1, Math.ceil(h / HORAS_DIA)) : 0;
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
  return { r, hEtapas, dur, cx, reun, h, M, fechado, pedido, urgBruta, urg, U, Mu, desc, Mf, B, C, D,
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
