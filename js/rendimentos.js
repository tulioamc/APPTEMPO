/* =====================================================================
   RENDIMENTOS (V2.06.189)
   Previsão das Caixinhas do Nubank: saldo, quanto rende, entra, sai e imposto, mês a mês.
   Regras usadas (Nubank, conferidas em nov/2026):
   · Rende em todo dia útil, a partir do 1º dia útil depois do depósito (não precisa esperar 30 dias).
   · Rendimento = % do CDI da caixinha (100%; Turbo 120%, limite de R$ 10 mil de aplicação).
   · IR regressivo só sobre o rendimento: 22,5% até 180 dias, 20% até 360, 17,5% até 720, 15% depois. O saldo do app já vem com o IR descontado.
   · IOF só se resgatar antes de 30 dias do depósito: 96% do rendimento no 1º dia, caindo até 0 no 30º.
   · Resgate parcial: o Nubank tira do depósito com menos imposto, na prática o mais antigo.
   ===================================================================== */

const REND_IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0];
const rendIofPct = (idade) => idade >= 30 ? 0 : (REND_IOF[Math.max(1, idade) - 1] || 0) / 100;
const rendIrPct = (idade) => idade <= 180 ? 0.225 : idade <= 360 ? 0.2 : idade <= 720 ? 0.175 : 0.15;
const rendYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rendDate = (s) => new Date(s + 'T12:00:00');
const rendDias = (a, b) => Math.round((rendDate(b) - rendDate(a)) / 864e5);
const rendAddDias = (s, n) => { const d = rendDate(s); d.setDate(d.getDate() + n); return rendYmd(d); };
function rendPascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia, 12);
}
const rendFeriadosCache = {};
function rendFeriados(y) {
  if (rendFeriadosCache[y]) return rendFeriadosCache[y];
  const p = rendPascoa(y), mv = (n) => { const d = new Date(p); d.setDate(d.getDate() + n); return rendYmd(d); };
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(x => `${y}-${x}`);
  return (rendFeriadosCache[y] = new Set([...fixos, mv(-48), mv(-47), mv(-2), mv(60)]));   // carnaval (seg e ter), sexta santa, Corpus Christi
}
const rendDiaUtil = (s) => { const d = rendDate(s), w = d.getDay(); return w > 0 && w < 6 && !rendFeriados(d.getFullYear()).has(s); };
/* taxa de um dia útil: % do CDI aplicado ao CDI diário (252 dias úteis) */
const rendTaxaDia = (cdiAno, pct) => pct / 100 * (Math.pow(1 + cdiAno / 100, 1 / 252) - 1);

/* Movimentos previstos viram eventos com data: { data, cx, valor (+ entra, − sai), para? } */
function rendEventos(fluxos, ini, fim) {
  const out = [];
  (fluxos || []).forEach(f => {
    if (!f || !f.cx || !(Number(f.valor) > 0)) return;
    const v = Number(f.valor), sinal = f.tipo === 'saida' || f.tipo === 'transf' ? -1 : 1;
    const add = (data) => { if (data > ini && data <= fim) out.push({ data, cx: f.cx, valor: sinal * v, para: f.tipo === 'transf' ? f.para : null, id: f.id }); };
    if (f.mensal) {
      let d = rendDate(ini.slice(0, 7) + '-01'); const dia = Math.min(28, Math.max(1, Number(f.dia) || 1));
      while (rendYmd(d) <= fim) { add(`${rendYmd(d).slice(0, 7)}-${String(dia).padStart(2, '0')}`); d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12); }
    } else if (f.data) add(f.data);
  });
  return out.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
}

/* Simula dia a dia. caixinhas: [{id, pct, saldo, idade}] (idade = dias do saldo atual, vale para o IR). */
function rendSimular({ caixinhas, cdi, inicio, fim, fluxos }) {
  const lotes = {}, mes = {};
  caixinhas.forEach(c => { lotes[c.id] = [{ dep: rendAddDias(inicio, -(Number(c.idade) || 0)), val: Number(c.saldo) || 0, rb: 0 }]; });
  const acc = (ym, cx) => { mes[ym] = mes[ym] || {}; return (mes[ym][cx] = mes[ym][cx] || { ini: null, entrou: 0, saiu: 0, rend: 0, imposto: 0, fim: 0 }); };
  const total = (cx) => lotes[cx].reduce((s, l) => s + l.val, 0);
  const eventos = rendEventos(fluxos, inicio, fim); let ei = 0; const faltou = [];
  const retirar = (cx, valor, data) => {   // do depósito mais antigo (menos imposto) para o mais novo
    let resto = valor, iof = 0, tirado = 0;
    const ls = lotes[cx].filter(l => l.val > 0.004).sort((a, b) => a.dep < b.dep ? -1 : 1);
    for (const l of ls) {
      if (resto <= 0.004) break;
      const t = Math.min(l.val, resto), fr = t / l.val;
      iof += l.rb * fr * rendIofPct(rendDias(l.dep, data));
      l.rb -= l.rb * fr; l.val -= t; resto -= t; tirado += t;
    }
    if (resto > 0.01) faltou.push({ data, cx, falta: resto });
    return { tirado, iof };
  };
  caixinhas.forEach(c => { const ym = inicio.slice(0, 7); acc(ym, c.id).ini = total(c.id); });
  const pctDe = Object.fromEntries(caixinhas.map(c => [c.id, Number(c.pct) || 100]));
  for (let d = rendAddDias(inicio, 1); d <= fim; d = rendAddDias(d, 1)) {
    const ym = d.slice(0, 7);
    caixinhas.forEach(c => { const a = acc(ym, c.id); if (a.ini === null) a.ini = total(c.id); });
    if (rendDiaUtil(d)) caixinhas.forEach(c => {
      const taxa = rendTaxaDia(cdi, pctDe[c.id]), a = acc(ym, c.id);
      lotes[c.id].forEach(l => { if (l.val <= 0) return; const bruto = l.val * taxa, ir = bruto * rendIrPct(rendDias(l.dep, d)); l.val += bruto - ir; l.rb += bruto; a.rend += bruto - ir; a.imposto += ir; });
    });
    while (ei < eventos.length && eventos[ei].data === d) {
      const e = eventos[ei++]; if (!lotes[e.cx]) continue;
      if (e.valor > 0) { lotes[e.cx].push({ dep: d, val: e.valor, rb: 0 }); acc(ym, e.cx).entrou += e.valor; }
      else {
        const { tirado, iof } = retirar(e.cx, -e.valor, d), a = acc(ym, e.cx);
        a.saiu += tirado; a.imposto += iof;
        if (e.para && lotes[e.para]) { lotes[e.para].push({ dep: d, val: tirado - iof, rb: 0 }); acc(ym, e.para).entrou += tirado - iof; }
      }
    }
    caixinhas.forEach(c => { acc(ym, c.id).fim = total(c.id); });
  }
  const meses = Object.keys(mes).sort().map(ym => {
    const porCx = mes[ym], soma = { ini: 0, entrou: 0, saiu: 0, rend: 0, imposto: 0, fim: 0 };
    Object.values(porCx).forEach(a => Object.keys(soma).forEach(k => { soma[k] += a[k] || 0; }));
    return { ym, ...soma, porCx };
  });
  return { meses, faltou, saldo: Object.fromEntries(caixinhas.map(c => [c.id, total(c.id)])) };
}

/* ---------- Dados guardados ---------- */
const REND_DEFAULT = () => ({
  cdi: 13.65,
  caixinhas: [
    { id: 'turbo', nome: 'Turbo Ultravioleta', pct: 120, idade: 200, nota: 'Só rende com até R$ 10 mil aplicados; o resto é rendimento. Não mexer.', meta: 0 },
    { id: 'apto', nome: 'Apartamento', pct: 100, idade: 200, nota: 'Reserva grande. Evitar tirar daqui.', meta: 0 },
    { id: 'freelas', nome: 'Freelas (desde 29.09.26)', pct: 100, idade: 60, nota: 'Lucro dos freelas entra aqui.', meta: 0 },
    { id: 'giro', nome: 'Giro', pct: 100, idade: 30, nota: 'Reembolsos e dinheiro que entra e sai todo mês.', meta: 27000 },
  ],
  snaps: [{ data: '2026-11-25', saldos: { turbo: 12401.38, apto: 103824.50, freelas: 6116.89, giro: 3.01 }, rend12: 18079.62 }],
  fluxos: [],
});
const rendGet = () => { const s = db.setting('rend', null); return s && s.caixinhas ? s : REND_DEFAULT(); };
const rendSave = (o) => { db.setSetting('rend', o); render(); };
const rendUltimo = (o) => o.snaps.slice().sort((a, b) => a.data < b.data ? 1 : -1)[0];

function rendPrever(o, fim) {
  const sn = rendUltimo(o);
  return rendSimular({ caixinhas: o.caixinhas.map(c => ({ id: c.id, pct: c.pct, idade: c.idade, saldo: sn.saldos[c.id] || 0 })), cdi: o.cdi, inicio: sn.data, fim, fluxos: o.fluxos });
}

/* Lembrete: todo dia 1 pede um print novo das Caixinhas; some quando o print entra. */
function rendLembrete(hoje) {
  const o = db.setting('rend', null); if (!o || !o.snaps) return;
  const d = hoje ? rendDate(hoje) : new Date(), ym = rendYmd(d).slice(0, 7), key = 'rend-print:' + ym;
  const ja = db.all('tempo_notices').find(n => n.key === key);
  const temPrint = o.snaps.some(s => s.data.slice(0, 7) === ym);
  if (temPrint) { if (ja && ja.status === 'open') db.update('tempo_notices', ja.id, { status: 'done', decision: 'Resolvido: print enviado', decided_at: new Date().toISOString() }); return; }
  if (ja) return;
  db.insert('tempo_notices', { kind: 'todo', key, status: 'open', decision: '', decided_at: null, snooze_until: null, title: 'Mandar o print das Caixinhas do Nubank', body: 'Abra Guardar no Nubank, tire o print das Caixinhas e mande aqui (aba Rendimentos, "Atualizar com o print"). Serve para conferir se a previsão está perto do real.', data: { auto: true } }, true);
}

/* ---------- Tela ---------- */
const REND_ST = { cx: 'todas' };
const rendMes = (ym) => { const [y, m] = ym.split('-').map(Number); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1]}/${String(y).slice(2)}`; };
const rendNum = (v) => { const n = parseMoney(String(v || '')); return isNaN(n) || n === null ? null : n; };
const rendNeg = (v) => Math.abs(v) < 0.005 ? '' : v < 0 ? 'neg' : '';

VIEWS.rendimentos = () => {
  try { rendLembrete(); } catch (e) { /* lembrete extra não trava a tela */ }
  const o = rendGet(), sn = rendUltimo(o), hoje = sn.data;
  const fim = rendYmd(new Date(rendDate(hoje).getFullYear(), rendDate(hoje).getMonth() + 13, 0, 12));
  const sim = rendPrever(o, fim);
  const cxs = o.caixinhas, escolha = REND_ST.cx === 'todas' ? null : cxs.find(c => c.id === REND_ST.cx);
  const totalHoje = cxs.reduce((s, c) => s + (sn.saldos[c.id] || 0), 0);
  const prox = sim.meses[1] || sim.meses[0];
  const ano = sim.meses.slice(0, 12).reduce((s, m) => s + m.rend, 0);
  const nomeDe = (id) => cxs.find(c => c.id === id)?.nome || id;
  const kpi = (k, v, s, tip) => `<div class="kpi" data-tip="${esc(tip)}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  const kpis = `<div class="kpis">${kpi('Total em Caixinhas', fmtMoney0(totalHoje), `print de ${fmtDate(hoje)}`, 'Soma dos saldos do último print que você mandou.')}
    ${kpi('Rende por mês (líquido)', fmtMoney0(prox?.rend || 0), prox ? rendMes(prox.ym) : '', 'Previsão do próximo mês cheio, já sem Imposto de Renda e com os movimentos previstos.')}
    ${kpi('Rende em 12 meses', fmtMoney0(ano), 'líquido de IR', 'Soma dos próximos 12 meses da previsão. Sobe se você colocar dinheiro e cai se tirar.')}
    ${kpi('CDI usado', `${String(o.cdi).replace('.', ',')}% a.a.`, 'Selic 13,75%', 'CDI anual usado na conta. Mude aqui se o Copom mudar a Selic.')}</div>`;

  /* Caixinhas hoje */
  const linhas = cxs.map(c => {
    const s = sn.saldos[c.id] || 0, rm = s * (Math.pow(1 + rendTaxaDia(o.cdi, c.pct), 21) - 1) * (1 - rendIrPct(c.idade));
    const gap = c.meta > 0 ? c.meta - s : 0;
    return `<tr><td><b>${esc(c.nome)}</b><div class="small muted">${esc(c.nota || '')}</div></td>
      <td class="num"><input class="input sm" style="width:64px;text-align:right" value="${c.pct}" data-on="rend-set" data-id="${c.id}" data-k="pct" data-tip="Quanto do CDI essa caixinha rende (100% comum, 120% Turbo)"> %</td>
      <td class="num">${fmtMoney0(s)}</td>
      <td class="num" data-tip="Estimativa de um mês com 21 dias úteis, já sem IR, sem contar movimentos">${fmtMoney0(rm)}</td>
      <td class="num"><select class="input sm" data-on="rend-set" data-id="${c.id}" data-k="idade" data-tip="Há quanto tempo o dinheiro dessa caixinha está parado. Define o IR: até 180 dias 22,5%, até 360 20%, até 720 17,5%, depois 15%.">${[[30, 'até 6 meses'], [200, '6 a 12 meses'], [400, '1 a 2 anos'], [800, 'mais de 2 anos']].map(([v, l]) => `<option value="${v}" ${(c.idade <= 180 && v === 30) || (c.idade > 180 && c.idade <= 360 && v === 200) || (c.idade > 360 && c.idade <= 720 && v === 400) || (c.idade > 720 && v === 800) ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td class="num">${c.id === 'giro' ? `<span class="small muted" data-tip="O Giro fica perto de vazio uns 15 dias por mês enquanto os reembolsos voltam. Isso é normal: os ${fmtMoney0(c.meta)} vão e voltam, não é falta.">vai e volta · ~${fmtMoney0(c.meta)}</span>` : c.meta > 0 ? `<input class="input sm" style="width:92px;text-align:right" value="${String(c.meta).replace('.', ',')}" data-on="rend-set" data-id="${c.id}" data-k="meta" data-tip="Quanto você quer manter nessa caixinha">${gap > 0 ? `<div class="small" style="color:var(--warn)" data-tip="Quanto falta para chegar na meta">faltam ${fmtMoney0(gap)}</div>` : ''}` : `<span class="muted">—</span>`}</td></tr>`;
  }).join('');
  const painelCx = `<div class="panel"><div class="panel-h"><h3>Caixinhas hoje</h3><span class="grow"></span><button class="btn sm primary" data-act="rend-print" data-tip="Digite os saldos do print mais recente. O app compara com o que tinha previsto e recomeça a previsão daqui.">Atualizar com o print</button></div>
    <div class="panel-b tight"><table class="grid compact fin"><thead><tr><th>Caixinha</th><th class="num">% do CDI</th><th class="num">Saldo</th><th class="num">Rende/mês</th><th class="num">Tempo parado</th><th class="num">Meta</th></tr></thead><tbody>${linhas}
      <tr><td><b>Total</b></td><td></td><td class="num"><b>${fmtMoney0(totalHoje)}</b></td><td class="num"><b>${fmtMoney0(cxs.reduce((s, c) => s + (sn.saldos[c.id] || 0) * (Math.pow(1 + rendTaxaDia(o.cdi, c.pct), 21) - 1) * (1 - rendIrPct(c.idade)), 0))}</b></td><td></td><td></td></tr></tbody></table></div></div>`;

  /* Previsão */
  const seg = `<div class="seg"><button class="${!escolha ? 'on' : ''}" data-act="rend-cx" data-v="todas">Todas</button>${cxs.map(c => `<button class="${escolha?.id === c.id ? 'on' : ''}" data-act="rend-cx" data-v="${c.id}">${esc(c.nome.split(' ')[0])}</button>`).join('')}</div>`;
  const get = (m, k) => escolha ? (m.porCx[escolha.id]?.[k] || 0) : m[k];
  const prev = sim.meses.slice(0, 13).map(m => `<tr><td><b>${rendMes(m.ym)}</b></td><td class="num">${fmtMoney0(get(m, 'ini'))}</td><td class="num in">${get(m, 'entrou') ? '+ ' + fmtMoney0(get(m, 'entrou')) : '—'}</td><td class="num out">${get(m, 'saiu') ? '− ' + fmtMoney0(get(m, 'saiu')) : '—'}</td><td class="num in">+ ${fmtMoney0(get(m, 'rend'))}</td><td class="num out">${get(m, 'imposto') ? '− ' + fmtMoney0(get(m, 'imposto')) : '—'}</td><td class="num"><b>${fmtMoney0(get(m, 'fim'))}</b></td></tr>`).join('');
  const painelPrev = `<div class="panel"><div class="panel-h"><h3>Previsão mês a mês</h3><span class="grow"></span>${seg}</div>
    <div class="panel-b tight"><table class="grid compact fin"><thead><tr><th>Mês</th><th class="num" data-tip="Saldo no começo do mês">Início</th><th class="num" data-tip="Dinheiro que você colocou (movimentos previstos)">Entrou</th><th class="num" data-tip="Dinheiro que você tirou (movimentos previstos)">Saiu</th><th class="num" data-tip="Rendimento do mês, já descontado o IR">Rendeu</th><th class="num" data-tip="IR do rendimento (já fora do saldo do app) mais IOF dos resgates feitos antes de 30 dias">Imposto</th><th class="num" data-tip="Saldo no fim do mês">Fim</th></tr></thead><tbody>${prev}</tbody></table></div>
    <div class="panel-b small muted" style="padding:8px 16px">O primeiro mês conta só do dia do print até o fim do mês. Sem movimentos previstos, é só o rendimento correndo.${sim.faltou.length ? ` <b style="color:var(--bad)">Atenção: ${sim.faltou.length} saída(s) maior(es) que o saldo da caixinha.</b>` : ''}</div></div>`;

  /* Movimentos previstos */
  const fl = (o.fluxos || []).map(f => `<tr><td>${esc(nomeDe(f.cx))}${f.tipo === 'transf' ? ` → ${esc(nomeDe(f.para))}` : ''}</td><td>${f.tipo === 'entrada' ? 'Entra' : f.tipo === 'saida' ? 'Sai' : 'Transfere'}</td><td class="num">${fmtMoney0(f.valor)}</td><td>${f.mensal ? `todo dia ${f.dia}` : fmtDate(f.data)}</td><td class="small muted">${esc(f.nota || '')}</td><td><button class="icon-btn ghost" data-act="rend-del" data-id="${f.id}" aria-label="Remover movimento" title="Remover">×</button></td></tr>`).join('');
  const painelFl = `<div class="panel"><div class="panel-h"><h3>Movimentos previstos</h3><span class="grow"></span><button class="btn sm" data-act="rend-add" data-tip="Dinheiro que vai entrar, sair ou passar de uma caixinha para outra. A previsão usa isso.">+ Movimento</button></div>
    <div class="panel-b tight">${fl ? `<table class="grid compact fin"><thead><tr><th>Caixinha</th><th>Tipo</th><th class="num">Valor</th><th>Quando</th><th>Nota</th><th></th></tr></thead><tbody>${fl}</tbody></table>` : `<div class="empty small">Nenhum movimento. Ex.: reembolso que entra no Giro todo mês, ou a volta do Apartamento.</div>`}</div></div>`;

  /* Regras */
  const regra = (t, d) => `<li><b>${t}</b> ${d}</li>`;
  const painelRegras = `<div class="panel"><div class="panel-h"><h3>Regras do Nubank usadas na conta</h3></div><div class="panel-b"><ul class="small" style="margin:0;padding-left:18px;display:grid;gap:6px">
    ${regra('Dinheiro novo rende já no 1º dia útil.', 'Colocou hoje, começa a render no próximo dia útil. Não precisa esperar 30 dias (isso vale para o saldo da conta, não para as Caixinhas). Sábado, domingo e feriado não rendem.')}
    ${regra('Resgate parcial sai do depósito com menos imposto.', 'Na prática, o mais antigo. Quem já passou de 30 dias não paga IOF e tem IR menor. Por isso tirar um pouco do Apartamento costuma custar pouco.')}
    ${regra('IR só sobre o rendimento, já descontado no saldo.', '22,5% até 180 dias, 20% até 360, 17,5% até 720, 15% depois. Você não paga boleto: o app desconta sozinho. O valor aparece no informe de rendimentos para o IR anual.')}
    ${regra('IOF só se resgatar com menos de 30 dias.', `Come 96% do rendimento no 1º dia e cai até 0 no 30º. Ex.: colocar e tirar na mesma semana perde quase tudo o que rendeu. Dinheiro do Giro que fica menos de 30 dias paga IOF (pouco, porque o rendimento é pequeno).`)}
    ${regra('Turbo (120% do CDI):', 'só rende o extra com até R$ 10 mil aplicados. O que passa disso (rendimento acumulado) segue na caixinha. Tirar e colocar de novo faz recomeçar a contagem de IR e IOF.')}
    ${regra('A previsão se corrige a cada print.', 'Mandou o print, o app compara com o que tinha previsto e recomeça dali. Sem print, usa o último saldo e os movimentos previstos.')}
    </ul></div></div>`;

  /* Conferência do último print */
  const conf = sn.conf ? `<div class="panel"><div class="panel-h"><h3>Previsto × real no print de ${fmtDate(sn.data)}</h3></div><div class="panel-b tight"><table class="grid compact fin"><thead><tr><th>Caixinha</th><th class="num">Previsto</th><th class="num">Real</th><th class="num">Diferença</th></tr></thead><tbody>${Object.entries(sn.conf).map(([id, c]) => `<tr><td>${esc(nomeDe(id))}</td><td class="num">${fmtMoney0(c.prev)}</td><td class="num">${fmtMoney0(c.real)}</td><td class="num ${c.real - c.prev < 0 ? 'out' : 'in'}">${fmtMoney0(c.real - c.prev)}</td></tr>`).join('')}</tbody></table></div></div>` : '';

  /* Alertas */
  const al = [];
  cxs.filter(c => c.meta > 0 && c.id !== 'giro').forEach(c => { const s = sn.saldos[c.id] || 0; if (s < c.meta - 1) al.push(`<b>${esc(c.nome)}</b> está com ${fmtMoney0(s)} e a meta é ${fmtMoney0(c.meta)}. Faltam ${fmtMoney0(c.meta - s)}; enquanto isso, o que falta está saindo da reserva (${esc(nomeDe('apto'))}). Quando os reembolsos entrarem, devolva.`); });
  const painelAl = al.length ? `<div class="banner warn"><span class="grow small">${al.join('<br>')}</span></div>` : '';

  return { title: 'Rendimentos', html: `<div class="stack" style="gap:16px">${painelAl}${kpis}${painelCx}${typeof rendGraficosHTML === 'function' ? rendGraficosHTML(o, sim, sn) : conf}${painelPrev}${painelFl}${painelRegras}</div>` };
};

CHANGES['rend-set'] = (el) => {
  const o = rendGet(), c = o.caixinhas.find(x => x.id === el.dataset.id); if (!c) return;
  const k = el.dataset.k, n = rendNum(el.value);
  if (k === 'idade') c.idade = Number(el.value); else if (n === null || n < 0) return; else c[k] = n;
  rendSave(o);
};
ACTIONS['rend-cx'] = (el) => { REND_ST.cx = el.dataset.v; render(); };
ACTIONS['rend-del'] = (el) => { const o = rendGet(); o.fluxos = (o.fluxos || []).filter(f => f.id !== el.dataset.id); rendSave(o); };
ACTIONS['rend-print'] = () => {
  const o = rendGet(), sn = rendUltimo(o), hoje = ymd(new Date());
  const l = openLayer({ html: `<div class="dh"><h2>Atualizar com o print</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:10px"><span class="small muted">Digite os saldos que aparecem no app do Nubank (Guardar).</span>
    <div class="field"><label for="rp-d">Data do print</label><input id="rp-d" type="date" class="input" value="${hoje}"></div>
    ${o.caixinhas.map(c => `<div class="field"><label for="rp-${c.id}">${esc(c.nome)}</label><input id="rp-${c.id}" class="input" value="${String(sn.saldos[c.id] || 0).replace('.', ',')}" inputmode="decimal"></div>`).join('')}
    <div class="field"><label for="rp-r">Rendimento em 12 meses (opcional)</label><input id="rp-r" class="input" inputmode="decimal" placeholder="${String(sn.rend12 || '').replace('.', ',')}"></div></div>
    <div class="df"><span class="grow"></span><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="ok">Salvar</button></div>`,
    onMount: (ly) => ly.box.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-x="ok"]')) return;
      const q = (s) => ly.box.querySelector(s), data = q('#rp-d').value; if (!data) return;
      const saldos = {}; let ok = true;
      o.caixinhas.forEach(c => { const n = rendNum(q('#rp-' + c.id).value); if (n === null || n < 0) ok = false; else saldos[c.id] = n; });
      if (!ok) { toast('Confira os valores'); return; }
      let conf = null;
      if (data > sn.data) {   // compara com o que a previsão dizia para essa data
        const s = rendSimular({ caixinhas: o.caixinhas.map(c => ({ id: c.id, pct: c.pct, idade: c.idade, saldo: sn.saldos[c.id] || 0 })), cdi: o.cdi, inicio: sn.data, fim: data, fluxos: o.fluxos });
        conf = Object.fromEntries(o.caixinhas.map(c => [c.id, { prev: s.saldo[c.id], real: saldos[c.id] }]));
      }
      const r12 = rendNum(q('#rp-r').value);
      o.snaps = o.snaps.filter(x => x.data !== data).concat([{ data, saldos, ...(conf ? { conf } : {}), ...(r12 ? { rend12: r12 } : {}) }]).sort((a, b) => a.data < b.data ? -1 : 1).slice(-36);
      o.fluxos = (o.fluxos || []).filter(f => f.mensal || (f.data && f.data > data));   // movimentos já passados saem
      ly.close(); rendSave(o); try { rendLembrete(); } catch (e) { /* ok */ } toast('Print salvo');
    }) });
};
ACTIONS['rend-add'] = () => {
  const o = rendGet(), hoje = ymd(new Date()), opt = (sel) => o.caixinhas.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  openLayer({ html: `<div class="dh"><h2>Movimento previsto</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:10px">
    <div class="field"><label for="rm-t">Tipo</label><select id="rm-t" class="input"><option value="entrada">Entra dinheiro</option><option value="saida">Sai dinheiro</option><option value="transf">Passa para outra caixinha</option></select></div>
    <div class="field"><label for="rm-c">Caixinha (de onde sai ou onde entra)</label><select id="rm-c" class="input">${opt('giro')}</select></div>
    <div class="field"><label for="rm-p">Para (só em "passa para")</label><select id="rm-p" class="input">${opt('apto')}</select></div>
    <div class="field"><label for="rm-v">Valor</label><input id="rm-v" class="input" inputmode="decimal" placeholder="0,00"></div>
    <label class="check small"><input type="checkbox" id="rm-m"> Repete todo mês</label>
    <div class="row gap-s"><div class="field"><label for="rm-d">Dia (ou o mês inteiro, se repete)</label><input id="rm-d" type="date" class="input" value="${hoje}"></div></div>
    <div class="field"><label for="rm-n">Nota</label><input id="rm-n" class="input" placeholder="ex.: reembolso da terapia"></div></div>
    <div class="df"><span class="grow"></span><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-x="ok">Salvar</button></div>`,
    onMount: (ly) => ly.box.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-x="ok"]')) return;
      const q = (s) => ly.box.querySelector(s), v = rendNum(q('#rm-v').value), d = q('#rm-d').value;
      if (!(v > 0) || !d) { toast('Preencha valor e data'); return; }
      const mensal = q('#rm-m').checked;
      o.fluxos = [...(o.fluxos || []), { id: uid(), tipo: q('#rm-t').value, cx: q('#rm-c').value, para: q('#rm-p').value, valor: v, ...(mensal ? { mensal: true, dia: Number(d.slice(8, 10)) } : { data: d }), nota: q('#rm-n').value.trim() }];
      ly.close(); rendSave(o);
    }) });
};
