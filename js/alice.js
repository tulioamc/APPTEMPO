/* =====================================================================
   CICLO DA ALICE (marcado no calendário do Planejamento)
   ---------------------------------------------------------------------
   O app do Mac lê só a conversa da Alice no WhatsApp e só as mensagens dela com "menstru…" ou "cistite"
   (TempoBridge.reportAlice). Mensagem curta marca o dia sozinha (a data sai do texto: "dia 20", "20/11",
   "ontem"; senão, o dia da mensagem). Mensagem longa vira aviso para você confirmar (Sim / Não).
   Marcas: AL:M menstruação (vermelho), AL:F período fértil (verde, do 10º ao 20º dia depois do início),
   AL:PM pré-menstrual (amarelo, 5 dias antes do próximo início previsto), AL:C cistite.
   Guardado em tempo_settings: aliceDias { 'AAAA-MM-DD': ['M','C'] } e aliceVistos [ids das mensagens].
   ===================================================================== */
const AL_PM_DIAS = 5, AL_CICLO_PADRAO = 28, AL_PREVER = 3;
const AL_INFO = { M: ['AL:M', 'Alice · Menstruação', 'm'], F: ['AL:F', 'Alice · Período fértil', 'f'], PM: ['AL:PM', 'Alice · Pré-menstrual', 'pm'], C: ['AL:C', 'Alice · Cistite', 'c'] };
const alDias = () => db.setting('aliceDias', {}) || {};
const alAdd = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const alDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

function alMarcar(dia, tipo, on = true) {
  const m = { ...alDias() }; const l = new Set(m[dia] || []);
  if (on) l.add(tipo); else l.delete(tipo);
  if (l.size) m[dia] = [...l]; else delete m[dia];
  db.setSetting('aliceDias', m);
}

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

/* Chamado pelo app do Mac: [{ id, ts, tipo: 'M'|'C', curta, texto? }] */
function alReport(itens) {
  if (!db.loaded) return;
  const vistos = new Set(db.setting('aliceVistos', []) || []); let novo = false;
  (itens || []).forEach(it => {
    if (!it || !it.id || vistos.has(it.id)) return;
    vistos.add(it.id); novo = true;
    const dia = alDataDoTexto(it.texto, Number(it.ts) || Date.now() / 1000);
    if (it.curta) { alMarcar(dia, it.tipo === 'M' ? 'M' : 'C'); return; }
    if (typeof addNotice === 'function') {
      const nome = it.tipo === 'M' ? 'menstruou' : 'teve cistite';
      addNotice({ kind: 'alice', key: 'alice:' + it.id, title: `Alice ${nome} em ${fmtDate(dia)}?`, body: 'Mensagem mais longa da Alice no WhatsApp. Sim marca no calendário; Não ignora.', data: { dia, tipo: it.tipo === 'M' ? 'M' : 'C' } });
    }
  });
  if (novo) { db.setSetting('aliceVistos', [...vistos].slice(-800)); db.emit(); }
}
if (window.TempoBridge) window.TempoBridge.reportAlice = alReport;
ACTIONS['alice-sim'] = (el) => { const n = db.get('tempo_notices', el.dataset.id); if (!n) return; alMarcar(n.data.dia, n.data.tipo); db.update('tempo_notices', n.id, { status: 'accepted', decision: 'Marcado no calendário', decided_at: new Date().toISOString() }); };
ACTIONS['alice-nao'] = (el) => { db.update('tempo_notices', el.dataset.id, { status: 'ignored', decision: 'Não era', decided_at: new Date().toISOString() }); };

/* Ciclos: início = primeiro dia de cada sequência de AL:M (até 2 dias de folga). Previsão pela média dos últimos 6 ciclos. */
function alCiclos() {
  const ms = Object.keys(alDias()).filter(d => alDias()[d].includes('M')).sort();
  const inicios = []; let ult = null;
  ms.forEach(d => { if (!ult || alDiff(ult, d) > 3) inicios.push(d); ult = d; });
  const dur = inicios.map(s => { let f = s; ms.forEach(d => { if (d >= s && alDiff(f, d) <= 3 && alDiff(s, d) < 12) f = d; }); return alDiff(s, f) + 1; });
  const ints = inicios.slice(1).map((d, i) => alDiff(inicios[i], d)).filter(x => x >= 15 && x <= 60).slice(-6);
  const ciclo = ints.length ? Math.round(ints.reduce((a, b) => a + b, 0) / ints.length) : AL_CICLO_PADRAO;
  const prev = []; if (inicios.length) for (let k = 1; k <= AL_PREVER; k++) prev.push(alAdd(inicios[inicios.length - 1], ciclo * k));
  return { inicios, dur, ciclo, prev, ints };
}
let AL_CACHE = { rev: -1, mapa: {} };
function alMapa() {
  const rev = JSON.stringify(alDias()); if (AL_CACHE.rev === rev) return AL_CACHE.mapa;
  const mapa = {}; const add = (d, t) => { (mapa[d] = mapa[d] || new Set()).add(t); };
  Object.entries(alDias()).forEach(([d, l]) => l.forEach(t => add(d, t)));
  const { inicios, prev } = alCiclos();
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
