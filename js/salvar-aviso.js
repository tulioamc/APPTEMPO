/* Aviso para salvar (app do Mac). Quem avisa é o Mac, na hora: conta só o tempo em que você está trabalhando no arquivo
   (programa na frente + mouse/teclado) e, aos 20 min sem salvar, mostra um painel com Salvar / Daqui a 5 min / Não avisar
   deste arquivo. Photoshop avisa em qualquer arquivo; Illustrator, After Effects e Cinema 4D (têm salvamento automático)
   só enquanto o arquivo for novo / sem título.
   Aqui no site fica só o que o Mac não sabe: a pasta do projeto em andamento, para o [Salvar] abrir o "Salvar como" já nela.
   O Mac também avisa o site (window.TempoMacSalvar) para o aviso antigo, que só via o registro depois, ficar quieto. */
function salvarPastaDe(entryId) {
  const recs = (typeof actList === 'function' ? actList(entryId) : []).filter(r => r && r.folder && (typeof DESIGN_APP_RE === 'undefined' || DESIGN_APP_RE.test(String(r.app || ''))));
  if (!recs.length) return null;
  recs.sort((a, b) => new Date(a.to) - new Date(b.to));
  return recs[recs.length - 1].folder;
}
/* Pasta do projeto em andamento: a do último arquivo de criação desta sessão; sem ela, a das últimas sessões do mesmo projeto. */
function salvarPastaAtual() {
  const e = typeof activeEntry === 'function' ? activeEntry() : null;
  if (!e) return null;
  const aqui = salvarPastaDe(e.id);
  if (aqui) return aqui;
  if (!e.project_id) return null;
  const outras = db.all('tempo_time_entries').filter(x => x.id !== e.id && x.project_id === e.project_id && entryStart(x))
    .sort((a, b) => new Date(entryStart(b)) - new Date(entryStart(a))).slice(0, 6);
  for (const o of outras) { const p = salvarPastaDe(o.id); if (p) return p; }
  return null;
}
let _salvarEnviado = '';
function salvarSyncMac(forcar) {
  if (!isMacApp()) return;
  const msg = { type: 'salvar', pasta: salvarPastaAtual() };
  const s = JSON.stringify(msg);
  if (!forcar && s === _salvarEnviado) return;
  _salvarEnviado = s;
  try { window.webkit.messageHandlers.tempo.postMessage(msg); } catch (e) {}
}
setInterval(() => { if (db.loaded) { try { salvarSyncMac(false); } catch (e) { console.warn('salvarSyncMac', e); } } }, 20000);
