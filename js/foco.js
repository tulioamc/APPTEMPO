/* Modo foco: quem liga é você (tela inicial ou barra do Mac), por 30, 60, 90 ou 120 min.
   Durante o foco o app do Mac esconde os apps de distração (os mesmos que pausam a sessão) e pergunta antes de
   abrir um deles ou um site de distração; nada é bloqueado. Mensagem de cliente ou agência avisa mesmo no foco.
   Estado em tempo_settings 'foco' = { inicio, ate, minutos, aberturas: [{ app, at }], avisados: { jid: t } }.
   Cada foco encerrado vai para 'focoLog' (até 200), para as análises. */
const FOCO_OPCOES = [30, 60, 90, 120];
const FOCO_PADRAO = 90;
const FOCO_TIPOS_AVISAM = ['Cliente', 'Misto (mais cliente)', 'Agência'];

function focoAtual() {
  const f = db.setting('foco', null);
  return f && f.ate && new Date(f.ate).getTime() > Date.now() ? f : null;
}
function focoLigar(min) {
  min = Math.max(5, Math.min(480, Math.round(Number(min) || FOCO_PADRAO)));
  if (focoAtual()) focoDesligar('trocou');
  const agora = Date.now();
  db.setSetting('foco', { inicio: new Date(agora).toISOString(), ate: new Date(agora + min * 6e4).toISOString(), minutos: min, aberturas: [], avisados: {} });
  focoSyncMac(true);
  toast(`${icon('target', 'ico')} Foco ligado até ${fmtTime(new Date(agora + min * 6e4).toISOString())}`);
  render();
}
/* motivo: 'manual' (você encerrou), 'fim' (acabou o tempo), 'trocou' (ligou outro por cima). */
function focoDesligar(motivo = 'manual') {
  const f = db.setting('foco', null); if (!f || !f.inicio) return;
  const fimMs = motivo === 'fim' ? new Date(f.ate).getTime() : Math.min(Date.now(), new Date(f.ate).getTime());
  const log = (db.setting('focoLog', []) || []).slice(-199);
  log.push({ inicio: f.inicio, fim: new Date(fimMs).toISOString(), planejado_min: f.minutos,
    real_min: Math.round((fimMs - new Date(f.inicio).getTime()) / 6e4), aberturas: f.aberturas || [], motivo });
  db.setSetting('focoLog', log);
  db.setSetting('foco', null);
  focoSyncMac(true);
  if (motivo === 'fim') { toast('Foco concluído'); notifyNative('Foco concluído', `${f.minutos} min de foco.`); }
  render();
}

/* Manda o estado para o app do Mac (só quando muda). */
let _focoEnviado = '';
function focoSyncMac(forcar) {
  if (!isMacApp()) return;
  const f = focoAtual();
  const msg = { type: 'foco', ate: f ? f.ate : null,
    apps: (db.setting('pauseApps', DEFAULT_PAUSE_APPS) || []).map(String),
    sites: (db.setting('pauseSites', DEFAULT_PAUSE_SITES) || []).map(String) };
  const s = JSON.stringify(msg);
  if (!forcar && s === _focoEnviado) return;
  _focoEnviado = s;
  try { window.webkit.messageHandlers.tempo.postMessage(msg); } catch (e) {}
}
/* A cada 15 s: encerra o foco que passou da hora e mantém o Mac em dia (o foco pode ter sido ligado em outro aparelho). */
setInterval(() => {
  if (!db.loaded) return;
  const f = db.setting('foco', null);
  if (f && f.ate && new Date(f.ate).getTime() <= Date.now()) focoDesligar('fim');
  else focoSyncMac(false);
  const g = focoAtual();
  if (g) document.querySelectorAll('[data-foco-resta]').forEach(el => { el.textContent = `Foco · ${Math.ceil((new Date(g.ate).getTime() - Date.now()) / 6e4)} min`; });
}, 15000);

/* Abriu um app ou site de distração mesmo no foco (o Mac avisa). */
function focoAbriu(app) {
  const f = focoAtual(); if (!f) return;
  db.setSetting('foco', { ...f, aberturas: [...(f.aberturas || []), { app: String(app || ''), at: nowISO() }] });
}
/* Mensagem de cliente ou agência chegou durante o foco: avisa (uma vez por mensagem). */
function focoAvisarClientes(d) {
  const f = focoAtual(); if (!f || !d || !Array.isArray(d.conversas)) return 0;
  const ini = new Date(f.inicio).getTime() / 1000;
  const vistos = { ...(f.avisados || {}) }; let n = 0;
  d.conversas.forEach(cv => {
    if (!cv || !cv.jid || !(cv.lastIn > ini) || cv.lastIn <= (vistos[cv.jid] || 0) || cv.lastIn <= (cv.lastOut || 0)) return;
    const c = db.all('tempo_wa_contacts').find(x => x.jid === cv.jid) || waContato(cv.name);
    if (!FOCO_TIPOS_AVISAM.includes(waTipoNome(c))) return;
    vistos[cv.jid] = cv.lastIn; n++;
    notifyNative(`${cv.name || 'Cliente'} mandou mensagem`, 'Chegou durante o foco.');
  });
  if (n) db.setSetting('foco', { ...f, avisados: vistos });
  return n;
}
if (typeof waReportConversas === 'function') {
  const _waRC = waReportConversas;
  waReportConversas = async (d) => { await _waRC(d); try { focoAvisarClientes(d); } catch (e) { console.warn('focoAvisarClientes', e); } };
}
if (window.TempoBridge) {
  window.TempoBridge.focoMenu = (min) => (Number(min) > 0 ? focoLigar(min) : focoDesligar('manual'));
  window.TempoBridge.focoAbriu = (app) => focoAbriu(app);
}

ACTIONS['foco-ligar'] = (el) => focoLigar(Number(el.dataset.min) || FOCO_PADRAO);
ACTIONS['foco-desligar'] = () => focoDesligar('manual');
/* Botão da tela inicial, do mesmo tamanho do "Iniciar registro". */
function focoBtnHTML() {
  const f = focoAtual();
  if (!f) return `<button class="btn" data-act="foco-abrir" data-tip="WhatsApp e distrações escondidos; cliente ainda avisa">${icon('target')} Modo foco</button>`;
  const resta = Math.ceil((new Date(f.ate).getTime() - Date.now()) / 6e4);
  return `<button class="btn foco-on" data-act="foco-abrir" data-tip="Foco até ${fmtTime(f.ate)}. Clique para encerrar.">${icon('target')} <span data-foco-resta>Foco · ${resta} min</span></button>`;
}
/* Clique: sem foco, pergunta o tempo (30/60/90/120 ou outro); com foco, oferece encerrar. */
ACTIONS['foco-abrir'] = async () => {
  const f = focoAtual();
  if (f) {
    const ab = (f.aberturas || []).length;
    if (await confirmBox({ title: 'Encerrar o foco?', body: `Foco até ${fmtTime(f.ate)}${ab ? ` · ${ab} ${ab === 1 ? 'abertura' : 'aberturas'} de distração` : ''}.`, ok: 'Encerrar foco', no: 'Continuar' })) focoDesligar('manual');
    return;
  }
  const l = openLayer({ html: `<div class="dh">${icon('target')}<h2>Modo foco</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack"><div class="small muted">Por quanto tempo? WhatsApp e distrações ficam escondidos; mensagem de cliente ainda avisa.</div>
      <div class="row" style="gap:6px;flex-wrap:wrap">${FOCO_OPCOES.map(m => `<button class="btn ${m === FOCO_PADRAO ? 'primary' : ''}" data-x="min" data-min="${m}">${m} min</button>`).join('')}</div>
      <div class="row" style="gap:6px;align-items:center"><label for="foco-outro" class="small">Outro</label><input id="foco-outro" class="input sm" type="number" min="5" max="480" step="5" placeholder="minutos" style="width:110px"><button class="btn" data-x="outro">Ativar</button></div></div>` });
  l.box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    const min = b.dataset.x === 'outro' ? Number(l.box.querySelector('#foco-outro').value) : Number(b.dataset.min);
    if (!(min >= 5)) { toast('Digite os minutos (5 ou mais).'); return; }
    l.close(); focoLigar(min);
  });
  l.box.querySelector('#foco-outro').addEventListener('keydown', (e) => { if (e.key === 'Enter') l.box.querySelector('[data-x="outro"]').click(); });
};
