/* =====================================================================
   CICLO DA ALICE (marcado no calendário do Planejamento)
   ---------------------------------------------------------------------
   O app do Mac lê só a conversa da Alice no WhatsApp e só as mensagens dela com "menstru…" ou "cistite".
   Isso roda 1x por dia, no horário configurado (padrão 9h; se o app estava fechado ou o WhatsApp não estava aberto,
   roda assim que der) ou na hora, pelo botão "Procurar agora" do painel da Alice. Só lê mensagens novas desde a última
   varredura (aliceUltimoId). Cada achado vira um aviso ("Alice teve cistite / menstruou em DD/MM?"): Sim marca no
   calendário, Não ignora. A data sai do texto quando a mensagem é curta ("dia 20", "20/11", "ontem"); senão, o dia da mensagem.
   Marcas: AL:M menstruação (vermelho; no primeiro dia o app já conta o dia e os 4 seguintes, porque ela costuma menstruar por 5 dias),
   AL:F período fértil (verde, do 10º ao 20º dia depois do início), AL:PM pré-menstrual (amarelo, 5 dias antes do próximo início previsto), AL:C cistite.
   Guardado em tempo_settings: aliceDias { 'AAAA-MM-DD': ['M','C'] }, aliceVistos [ids das mensagens],
   aliceHorario ('09:00'), aliceUltimaVarredura (ISO) e aliceUltimoId (última mensagem lida).
   '-M' num dia = você tirou o AL:M de um dia que o app tinha projetado (a projeção respeita e não volta).
   ===================================================================== */
const AL_PM_DIAS = 5, AL_CICLO_PADRAO = 28, AL_PREVER = 3, AL_M_DIAS = 5;
const AL_INFO = { M: ['AL:M', 'Alice · Menstruação', 'm'], F: ['AL:F', 'Alice · Período fértil', 'f'], PM: ['AL:PM', 'Alice · Pré-menstrual', 'pm'], C: ['AL:C', 'Alice · Cistite', 'c'] };
const alDias = () => db.setting('aliceDias', {}) || {};
const alAdd = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const alDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

function alMarcar(dia, tipo, on = true) {
  const m = { ...alDias() }; const l = new Set(m[dia] || []);
  if (tipo === 'M') {
    if (on) { l.add('M'); l.delete('-M'); }
    else { l.delete('M'); if (alDerivadoM(dia, l)) l.add('-M'); }     // dia projetado pelo app: guarda que você tirou
  } else if (on) l.add(tipo); else l.delete(tipo);
  if (l.size) m[dia] = [...l]; else delete m[dia];
  db.setSetting('aliceDias', m);
}
/* O dia cai na projeção de 5 dias de algum início de menstruação? (sem contar as marcas que você tirou) */
function alDerivadoM(dia, marcasDoDia) {
  const dias = { ...alDias() }; if (marcasDoDia && marcasDoDia.size) dias[dia] = [...marcasDoDia]; else delete dias[dia];
  return alSeqs(dias).some(q => dia >= q.ini && dia <= q.fim);
}
/* Sequências de menstruação: cada uma começa no 1º AL:M guardado e vai até o 5º dia ou até o último AL:M guardado (o que for mais tarde); até 2 dias de folga. */
function alSeqs(dias) {
  const ms = Object.keys(dias).filter(d => (dias[d] || []).includes('M')).sort();
  const seqs = [];
  ms.forEach(d => {
    const u = seqs[seqs.length - 1];
    if (u && alDiff(u.fim, d) <= 3) { if (d > u.fim) u.fim = d; }
    else seqs.push({ ini: d, fim: alAdd(d, AL_M_DIAS - 1) });
  });
  return seqs;
}
/* Tem esse tipo marcado no dia (guardado ou projetado)? */
const alTem = (dia, tipo) => { const s = alMapa()[dia]; return !!(s && s.has(tipo)); };

/* Data citada na mensagem curta; senão, o dia em que ela mandou. */
function alDataDoTexto(texto, ts) {
  const base = new Date(ts * 1000); const t = String(texto || '').toLowerCase();
  if (/\bontem\b/.test(t)) { base.setDate(base.getDate() - 1); return ymd(base); }
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) { let y = dm[3] ? Number(dm[3].length === 2 ? '20' + dm[3] : dm[3]) : base.getFullYear(); const d = new Date(y, Number(dm[2]) - 1, Number(dm[1]), 12); if (!dm[3] && d > base) d.setFullYear(y - 1); return ymd(d); }
  const so = t.match(/\bdia\s+(\d{1,2})\b/);
  if (so) { const d = new Date(base.getFullYear(), base.getMonth(), Number(so[1]), 12); if (d > base) d.setMonth(d.getMonth() - 1); return ymd(d); }
  return ymd(base);
}

/* Chamado pela varredura: [{ id, ts, tipo: 'M'|'C', curta, texto? }]. Cada achado vira um aviso; devolve quantos avisos novos. */
function alReport(itens) {
  if (!db.loaded) return 0;
  const vistos = new Set(db.setting('aliceVistos', []) || []); let novo = false, avisos = 0;
  const abertos = new Set(db.all('tempo_notices').filter(n => n.kind === 'alice' && n.status === 'pending').map(n => `${n.data?.dia}|${n.data?.tipo}`));
  (itens || []).forEach(it => {
    if (!it || !it.id || vistos.has(it.id)) return;
    vistos.add(it.id); novo = true;
    const tipo = it.tipo === 'M' ? 'M' : 'C';
    const dia = alDataDoTexto(it.texto, Number(it.ts) || Date.now() / 1000);
    if (alTem(dia, tipo) || abertos.has(`${dia}|${tipo}`)) return;      // já marcado, ou já perguntei desse dia
    if (typeof addNotice !== 'function') return;
    abertos.add(`${dia}|${tipo}`); avisos++;
    addNotice({ kind: 'alice', key: 'alice:' + it.id, title: `Alice ${tipo === 'M' ? 'menstruou' : 'teve cistite'} em ${fmtDate(dia)}?`, body: 'Achei no WhatsApp da Alice. Sim marca no calendário; Não ignora.', data: { dia, tipo } });
  });
  if (novo) { db.setSetting('aliceVistos', [...vistos].slice(-800)); db.emit(); }
  return avisos;
}

/* ---- Varredura agendada ---- */
const AL_HORARIO_PADRAO = '09:00';
const alHorario = () => { const v = String(db.setting('aliceHorario', AL_HORARIO_PADRAO) || ''); return /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : AL_HORARIO_PADRAO; };
/* Passou do horário de hoje e a última varredura é anterior a ele? (app fechado no horário → roda quando abrir) */
function alVarreduraDevida(agora = new Date()) {
  const [h, m] = alHorario().split(':').map(Number);
  const marca = new Date(agora); marca.setHours(h, m, 0, 0);
  if (agora < marca) return false;
  const u = db.setting('aliceUltimaVarredura', '');
  return !u || new Date(u) < marca;
}
let alProcurando = false, alPedidoEm = 0, alNaoAntes = 0;
/* Pede ao app do Mac para ler o WhatsApp da Alice (só mensagens novas). auto = veio do agendamento (espera o WhatsApp abrir). */
function alProcurar(auto) {
  if (!isMacApp()) { if (!auto) toast('Procurar no WhatsApp só funciona no app do Mac.'); return false; }
  if (alProcurando && Date.now() - alPedidoEm < 120000) { if (!auto) toast('Já estou procurando…'); return false; }
  alProcurando = true; alPedidoEm = Date.now();
  try { window.webkit.messageHandlers.tempo.postMessage({ type: 'aliceProcurar', desde: Number(db.setting('aliceUltimoId', 0)) || 0, auto: !!auto }); }
  catch (e) { alProcurando = false; if (!auto) toast('Não consegui falar com o app do Mac.'); return false; }
  return true;
}
/* A cada minuto: está na hora e ainda não rodou? */
function alTique() {
  if (!db.loaded || !isMacApp() || Date.now() < alNaoAntes) return;
  if (alVarreduraDevida()) alProcurar(true);
}
/* Resposta do app do Mac: { ok, motivo?, itens, ultimoId, auto } */
function alResultado(r) {
  alProcurando = false;
  const auto = !!(r && r.auto);
  if (!r || !r.ok || !db.loaded) {
    const motivo = r && r.motivo;
    if (auto) alNaoAntes = Date.now() + (motivo === 'acesso' ? 30 * 60000 : 2 * 60000);   // WhatsApp fechado: tenta de novo em 2 min
    else toast(motivo === 'acesso' ? 'Não consegui ler o WhatsApp. Ative o Acesso Total ao Disco para o Tempo nos Ajustes do Sistema.' : 'Não consegui procurar agora. Tente de novo em instantes.');
    return;
  }
  const avisos = alReport(r.itens);
  db.setSetting('aliceUltimaVarredura', new Date().toISOString());
  const id = Number(r.ultimoId) || 0; if (id > (Number(db.setting('aliceUltimoId', 0)) || 0)) db.setSetting('aliceUltimoId', id);
  db.emit();
  const el = typeof document !== 'undefined' && document.getElementById('al-ultima'); if (el) el.textContent = alUltimaTexto();
  if (!auto) toast(avisos ? `Achei ${avisos} ${avisos === 1 ? 'coisa nova' : 'coisas novas'} no WhatsApp da Alice. Veja os avisos.` : 'Nada novo no WhatsApp da Alice.', { ms: 6000 });
}
if (window.TempoBridge) window.TempoBridge.aliceResultado = alResultado;
function alUltimaTexto() {
  const u = db.setting('aliceUltimaVarredura', ''); if (!u) return 'ainda não rodou';
  const d = new Date(u); return `${ymd(d) === ymd(new Date()) ? 'hoje' : fmtDate(ymd(d))} às ${fmtTime(u)}`;
}
CHANGES['alice-horario'] = (el) => { if (/^\d{1,2}:\d{2}$/.test(el.value)) { db.setSetting('aliceHorario', el.value); toast(`A varredura diária da Alice será às ${el.value}.`); } };
ACTIONS['alice-procurar'] = () => { alProcurar(false); };
ACTIONS['alice-painel'] = () => {
  const c = alCiclos(); const prox = c.prev[0];
  openLayer({ html: `<div class="dh">${icon('calendar')}<h2>Ciclo da Alice</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:10px">
      <div class="small muted">O app do Mac olha o WhatsApp da Alice uma vez por dia e pergunta (nos Avisos) se ela teve cistite ou menstruou. Só lê as mensagens dela com essas palavras.</div>
      <div class="row" style="gap:8px;align-items:center"><span class="grow">Última varredura</span><b id="al-ultima" data-tip="Quando o app do Mac olhou o WhatsApp da Alice pela última vez">${esc(alUltimaTexto())}</b></div>
      <label class="row" style="gap:8px;align-items:center"><span class="grow">Procurar todo dia às</span><input type="time" class="input" style="width:110px" value="${esc(alHorario())}" data-on="alice-horario" data-tip="Horário da varredura diária. Se o app estiver fechado ou o WhatsApp não estiver aberto, roda assim que abrir."></label>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-act="alice-procurar" data-tip="${esc(isMacApp() ? 'Lê o WhatsApp da Alice agora, sem esperar o horário' : 'Só funciona no app do Mac')}">${icon('search')} Procurar agora</button></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:2px 0">
      <div class="small muted">Ciclo médio: <b>${c.ciclo} dias</b>${prox ? ` · próximo início previsto: <b>${esc(fmtDate(prox))}</b>` : ''}. A menstruação conta o dia marcado e os 4 seguintes.</div>
    </div>` });
};
ACTIONS['alice-sim'] = (el) => { const n = db.get('tempo_notices', el.dataset.id); if (!n) return; alMarcar(n.data.dia, n.data.tipo); db.update('tempo_notices', n.id, { status: 'accepted', decision: 'Marcado no calendário', decided_at: new Date().toISOString() }); };
ACTIONS['alice-nao'] = (el) => { db.update('tempo_notices', el.dataset.id, { status: 'ignored', decision: 'Não era', decided_at: new Date().toISOString() }); };

/* Ciclos: início = primeiro dia de cada sequência de AL:M (até 2 dias de folga). Previsão pela média dos últimos 6 ciclos. */
function alCiclos() {
  const seqs = alSeqs(alDias());
  const inicios = seqs.map(q => q.ini);
  const dur = seqs.map(q => alDiff(q.ini, q.fim) + 1);
  const ints = inicios.slice(1).map((d, i) => alDiff(inicios[i], d)).filter(x => x >= 15 && x <= 60).slice(-6);
  const ciclo = ints.length ? Math.round(ints.reduce((a, b) => a + b, 0) / ints.length) : AL_CICLO_PADRAO;
  const prev = []; if (inicios.length) for (let k = 1; k <= AL_PREVER; k++) prev.push(alAdd(inicios[inicios.length - 1], ciclo * k));
  return { inicios, dur, ciclo, prev, ints, seqs };
}
let AL_CACHE = { rev: -1, mapa: {} };
function alMapa() {
  const rev = JSON.stringify(alDias()); if (AL_CACHE.rev === rev) return AL_CACHE.mapa;
  const mapa = {}; const add = (d, t) => { (mapa[d] = mapa[d] || new Set()).add(t); };
  Object.entries(alDias()).forEach(([d, l]) => l.forEach(t => { if (t !== '-M') add(d, t); }));
  const { inicios, prev, seqs } = alCiclos();
  // menstruação: o dia marcado e os seguintes até completar 5 dias (menos os que você tirou)
  seqs.forEach(q => { for (let d = q.ini; d <= q.fim; d = alAdd(d, 1)) if (!(alDias()[d] || []).includes('-M')) add(d, 'M'); });
  [...inicios, ...prev].forEach(s => { for (let i = 10; i <= 20; i++) add(alAdd(s, i), 'F'); });
  // pré-menstrual: antes de cada início real e antes de cada início previsto (depois que ela menstrua, o PM previsto daquele ciclo some)
  const ultimo = inicios[inicios.length - 1] || '';
  [...inicios, ...prev].forEach(s => { for (let i = 1; i <= AL_PM_DIAS; i++) { const d = alAdd(s, -i); if (d > ultimo || inicios.includes(s)) add(d, 'PM'); } });
  Object.keys(mapa).forEach(d => { if (mapa[d].has('M')) { mapa[d].delete('PM'); mapa[d].delete('F'); } });
  AL_CACHE = { rev, mapa }; return mapa;
}
/* Chips do dia no calendário (ao lado esquerdo do A/T). */
function aliceChipsHTML(dia) {
  const s = alMapa()[dia]; if (!s || !s.size) return '';
  return ['M', 'PM', 'F', 'C'].filter(t => s.has(t)).map(t => `<span class="al-chip ${AL_INFO[t][2]}" data-tip="${esc(AL_INFO[t][1])}" title="${esc(AL_INFO[t][1])}">${AL_INFO[t][0]}</span>`).join('');
}
