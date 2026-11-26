/* Fila de ajustes dentro do app (25/11).
   ⌃⌥F (de qualquer tela; no Mac, de qualquer programa) abre a janelinha: você escreve o ajuste e cola prints (⌘V).
   O app do Mac já traz a imagem que estiver copiada (print com ⌃⇧⌘4). Vai para a tabela tempo_ajustes (fora da
   sincronização geral, por causa das imagens); a tela "Fila de ajustes" (menu Geral) lista o que está aberto e o feito.
   O Claude lê dali quando você pede "faça a fila de ajustes" e marca como feito com a versão. */
const AJ = { imgs: [], texto: '', lista: null, carregando: false, erro: '', editId: null };
const ajCli = () => db.adapter && db.adapter.client;
const AJ_MAX = 1600;   // lado maior das imagens (px), em JPEG 0,82: um print fica com uns 150–300 KB

/* Reduz e converte a imagem colada para JPEG (data URL). */
function ajReduz(src) {
  return new Promise((ok) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, AJ_MAX / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = () => ok(null);
    im.src = src;
  });
}
const ajLerArquivo = (f) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(f); });
async function ajAddImgs(srcs, ly) {
  for (const s of srcs) { const d = s && await ajReduz(s); if (d) AJ.imgs.push(d); }
  ly && ly.refresh();
}

function ajJanelaHTML() {
  const tela = (NAV.find(n => n.id === S.route) || {}).label || S.route;
  return `<div class="dh"><h2>${AJ.editId ? 'Editar ajuste' : 'Ajuste no app'}</h2><span class="small muted">na tela ${esc(tela)} · ${esc(APP_VERSION)}</span><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar" title="Fechar (Esc)">${icon('x')}</button></div>
  <div class="db aj-db">
    <textarea class="input aj-txt" rows="6" placeholder="O que ajustar? Escreva como quiser e cole prints aqui (⌘V)." autofocus>${esc(AJ.texto)}</textarea>
    <div class="aj-imgs">${AJ.imgs.map((d, i) => `<div class="aj-img"><img src="${d}" alt="Print ${i + 1}"><button type="button" class="aj-img-x" data-aj-tira="${i}" aria-label="Tirar este print" title="Tirar este print">×</button></div>`).join('')}
      <button type="button" class="aj-add" data-aj-print title="Tira um print da tela do app que está atrás desta janela e já coloca aqui">${icon('camera')}<span>Print da tela</span></button>
      <label class="aj-add" title="Anexar imagem do computador">${icon('plus')}<span>Arquivo</span><input type="file" accept="image/*" multiple hidden data-aj-arq></label></div>
    <div class="small muted">Dica: tire o print com ⌃⇧⌘4 (vai para a área de transferência) e aperte ⌃⌥F; o print já entra aqui.</div>
  </div>
  <div class="df"><button class="btn ghost left" data-act="go" data-route="ajustes" title="Ver a fila inteira">Ver a fila</button><button class="btn primary" data-aj-envia title="${AJ.editId ? 'Salvar a alteração (⌘Enter)' : 'Enviar para a fila (⌘Enter)'}">${AJ.editId ? 'Salvar' : 'Enviar para a fila'}</button></div>`;
}
function ajAbrir(imgClip) {
  if (layers.some(l => l.box.classList.contains('aj-modal'))) { if (imgClip) ajAddImgs([imgClip], layers.find(l => l.box.classList.contains('aj-modal'))); return; }
  const ly = openLayer({ render: ajJanelaHTML, onClose: () => { AJ.texto = ''; AJ.imgs = []; AJ.editId = null; } });
  ly.box.classList.add('aj-modal');
  const sync = () => { const t = ly.box.querySelector('.aj-txt'); if (t) AJ.texto = t.value; };
  ly.box.addEventListener('input', sync);
  ly.box.addEventListener('paste', (e) => {
    const its = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith('image/'));
    if (!its.length) return;
    e.preventDefault(); sync();
    Promise.all(its.map(it => ajLerArquivo(it.getAsFile()))).then(srcs => ajAddImgs(srcs, ly));
  });
  ly.box.addEventListener('change', (e) => { const f = e.target.closest?.('[data-aj-arq]'); if (!f) return; sync(); Promise.all([...f.files].map(ajLerArquivo)).then(srcs => ajAddImgs(srcs, ly)); });
  ly.box.addEventListener('click', async (e) => {
    const x = e.target.closest?.('[data-aj-tira]'); if (x) { sync(); AJ.imgs.splice(Number(x.dataset.ajTira), 1); ly.refresh(); return; }
    if (e.target.closest?.('[data-aj-envia]')) { sync(); if (await ajEnviar()) ly.close(); }
    if (e.target.closest?.('[data-aj-print]')) { sync(); ajPrintTela(ly); }
  });
  ly.box.addEventListener('keydown', async (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sync(); if (await ajEnviar()) ly.close(); } });
  if (imgClip) ajAddImgs([imgClip], ly);
}
async function ajEnviar() {
  const texto = AJ.texto.trim();
  if (!texto && !AJ.imgs.length) { toast('Escreva o ajuste ou cole um print'); return false; }
  const cli = ajCli(); if (!cli) { toast('Sem conexão com o banco agora'); return false; }
  const tela = (NAV.find(n => n.id === S.route) || {}).label || S.route;
  const { error } = AJ.editId
    ? await cli.from('tempo_ajustes').update({ texto, imagens: AJ.imgs }).eq('id', AJ.editId)
    : await cli.from('tempo_ajustes').insert({ texto, imagens: AJ.imgs, tela, versao: APP_VERSION });
  if (error) { toast(/relation|does not exist|schema cache/i.test(error.message || '') ? 'A fila de ajustes ainda não foi criada no banco' : 'Não consegui enviar: ' + (error.message || 'erro')); return false; }
  toast(AJ.editId ? 'Ajuste salvo' : 'Ajuste na fila');
  AJ.texto = ''; AJ.imgs = []; AJ.lista = null; AJ.editId = null;
  if (S.route === 'ajustes') ajCarregar();
  return true;
}
/* Print da tela atual (o que está atrás da janelinha). No app do Mac, a própria janela tira a foto da página (sem pedir nada);
   no navegador, pede para compartilhar a aba e pega um quadro. A janelinha some durante a foto e volta com o print anexado. */
let ajPrintEspera = null;
window.TempoPrint = (dataUrl) => { const f = ajPrintEspera; ajPrintEspera = null; f && f(dataUrl || null); };
async function ajPrintTela(ly) {
  const ov = ly.ov; const volta = () => { ov.style.visibility = ''; };
  ov.style.visibility = 'hidden';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  let src = null;
  try {
    if (window.webkit?.messageHandlers?.tempo) {
      src = await new Promise((ok) => { ajPrintEspera = ok; window.webkit.messageHandlers.tempo.postMessage({ type: 'print' }); setTimeout(() => { if (ajPrintEspera === ok) { ajPrintEspera = null; ok(null); } }, 5000); });
    } else if (navigator.mediaDevices?.getDisplayMedia) {
      const st = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, preferCurrentTab: true, audio: false });
      try {
        const v = document.createElement('video'); v.srcObject = st; v.muted = true; await v.play();
        await new Promise(r => setTimeout(r, 250));
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); src = c.toDataURL('image/png');
      } finally { st.getTracks().forEach(t => t.stop()); }
    }
  } catch (e) { src = null; }
  volta();
  if (!src) { toast('Não consegui tirar o print. Use ⌃⇧⌘4 e cole aqui (⌘V).'); return; }
  ajAddImgs([src], ly);
}
window.TempoAjuste = (img) => ajAbrir(typeof img === 'string' && img.startsWith('data:image') ? img : null);
/* ⌃⌥F dentro do app (no navegador e no Mac; no Mac, de fora do app, quem pega é o atalho global). */
document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.altKey && !e.metaKey && (e.code === 'KeyF' || (e.key || '').toLowerCase() === 'f')) { e.preventDefault(); ajAbrir(null); } });

/* Tela "Fila de ajustes": abertos primeiro (mais antigos em cima, na ordem em que serão feitos), feitos embaixo. */
async function ajCarregar() {
  const cli = ajCli(); if (!cli || AJ.carregando) return;
  AJ.carregando = true;
  try {
    const { data, error } = await cli.from('tempo_ajustes').select('*').order('created_at', { ascending: true });
    AJ.erro = error ? (/relation|does not exist|schema cache/i.test(error.message || '') ? 'A fila ainda não foi criada no banco.' : error.message) : '';
    AJ.lista = error ? [] : data || [];
  } finally { AJ.carregando = false; if (S.route === 'ajustes') render(); }
}
ACTIONS['aj-novo'] = () => ajAbrir(null);
/* Editar um ajuste já enviado: abre a mesma janelinha com o texto e os prints dele (dá para tirar e colar mais). */
ACTIONS['aj-edita'] = (el) => {
  const a = (AJ.lista || []).find(x => x.id === el.dataset.id); if (!a) return;
  AJ.editId = a.id; AJ.texto = a.texto || ''; AJ.imgs = [...(a.imagens || [])];
  const imgs = AJ.imgs; ajAbrir(null); AJ.imgs = imgs; AJ.editId = a.id; AJ.texto = a.texto || '';
  const ly = layers.find(l => l.box.classList.contains('aj-modal')); ly && ly.refresh();
};
ACTIONS['aj-feito'] = async (el) => {
  const cli = ajCli(); if (!cli) return; const feito = el.dataset.v === '1';
  await cli.from('tempo_ajustes').update(feito ? { status: 'feito', feito_em: new Date().toISOString(), feito_versao: APP_VERSION } : { status: 'aberto', feito_em: null, feito_versao: null }).eq('id', el.dataset.id);
  ajCarregar();
};
ACTIONS['aj-apaga'] = async (el) => {
  if (!await confirmBox({ title: 'Apagar este ajuste?', body: 'Some da fila, com os prints.', ok: 'Apagar', danger: true })) return;
  const cli = ajCli(); if (!cli) return; await cli.from('tempo_ajustes').delete().eq('id', el.dataset.id); ajCarregar();
};
ACTIONS['aj-img'] = (el) => openLayer({ wide: true, html: `<div class="dh"><h2>Print</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div><div class="db"><img src="${el.getAttribute('src')}" alt="Print" style="max-width:100%;display:block;margin:0 auto;border-radius:8px"></div>` });
const ajData = (s) => { const d = new Date(s); return isNaN(d) ? '' : `${fmtDate(ymd(d))} ${fmtTime(d.toISOString())}`; };
function ajItemHTML(a, n) {
  const feito = a.status === 'feito';
  return `<div class="aj-it${feito ? ' feito' : ''}">
    <div class="aj-it-h">${feito ? '<span class="aj-ok">✓</span>' : `<span class="aj-n">${n}</span>`}<span class="small muted" data-tip="${esc(`Enviado em ${ajData(a.created_at)}${a.versao ? '\nVersão ' + a.versao : ''}${a.tela ? '\nTela ' + a.tela : ''}`)}">${ajData(a.created_at)}${a.tela ? ' · ' + esc(a.tela) : ''}</span>${feito ? `<span class="small aj-fv">feito${a.feito_versao ? ' na ' + esc(a.feito_versao) : ''}${a.feito_em ? ' · ' + ajData(a.feito_em) : ''}</span>` : ''}<span class="grow"></span>
      <button class="btn sm ghost" data-act="aj-feito" data-id="${a.id}" data-v="${feito ? 0 : 1}" title="${feito ? 'Voltar para a fila' : 'Marcar como feito'}">${feito ? 'Reabrir' : '✓ Feito'}</button><button class="btn sm ghost" data-act="aj-edita" data-id="${a.id}" title="Editar o texto e os prints deste ajuste">${icon('edit')} Editar</button><button class="btn sm icon ghost" data-act="aj-apaga" data-id="${a.id}" aria-label="Apagar ajuste" title="Apagar este ajuste">${icon('trash')}</button></div>
    ${a.texto ? `<div class="aj-it-t">${esc(a.texto).replace(/\n/g, '<br>')}</div>` : ''}
    ${(a.imagens || []).length ? `<div class="aj-imgs">${a.imagens.map((d, i) => `<img class="aj-thumb" src="${d}" alt="Print ${i + 1}" data-act="aj-img" title="Ver o print grande">`).join('')}</div>` : ''}
    ${a.nota ? `<div class="small muted aj-nota">${esc(a.nota)}</div>` : ''}</div>`;
}
VIEWS.ajustes = () => {
  if (AJ.lista === null) { ajCarregar(); }
  const l = AJ.lista || [];
  const abertos = l.filter(a => a.status !== 'feito'), feitos = l.filter(a => a.status === 'feito').reverse();
  const corpo = AJ.lista === null ? '<div class="muted small">Carregando…</div>' : AJ.erro ? `<div class="card muted">${esc(AJ.erro)}</div>`
    : `<section class="panel"><div class="panel-h"><h3>Na fila</h3><span class="small muted">${abertos.length} ${abertos.length === 1 ? 'ajuste' : 'ajustes'}</span></div><div class="panel-b">${abertos.length ? abertos.map((a, i) => ajItemHTML(a, i + 1)).join('') : '<div class="muted small">Nada na fila. Aperte ⌃⌥F de qualquer tela para mandar um ajuste.</div>'}</div></section>
      ${feitos.length ? `<details class="panel aj-feitos"><summary class="panel-h"><h3>Feitos</h3><span class="small muted">${feitos.length}</span></summary><div class="panel-b">${feitos.map(a => ajItemHTML(a, 0)).join('')}</div></details>` : ''}`;
  return { title: 'Fila de ajustes', actions: `<button class="btn sm primary" data-act="aj-novo" title="Novo ajuste (⌃⌥F de qualquer tela)">${icon('plus')} Novo ajuste</button>`, html: `<div class="stack" style="gap:14px">${corpo}</div>` };
};
