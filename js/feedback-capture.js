/* Cmd+J no app do Mac: marca um ponto ou arrasta uma área, tira o print com a marcação e
   abre a caixa de comentário. Comentário + print vão para a pasta APPTEMPO-feedback (ver main.py). */
(() => {
  let modo = null; // { overlay, box, start }
  const nativo = () => typeof window.pywebview?.api?.capturar_feedback === 'function';

  function fechar() { modo?.overlay.remove(); modo = null; }

  function retangulo(a, b) {
    if (Math.abs(b.x - a.x) < 6 && Math.abs(b.y - a.y) < 6) return { x: a.x - 40, y: a.y - 40, w: 80, h: 80 };
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }
  function desenhar(r) {
    Object.assign(modo.box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    modo.box.hidden = false;
  }

  function iniciar() {
    if (modo) return;
    if (!nativo()) return toast('O Cmd+J funciona no app do Mac.');
    const ov = document.createElement('div');
    ov.className = 'fb-overlay';
    ov.innerHTML = '<div class="fb-hint">Clique para marcar um ponto ou arraste uma área · Esc cancela</div><div class="fb-box" hidden></div>';
    document.body.appendChild(ov);
    modo = { overlay: ov, box: ov.querySelector('.fb-box'), start: null };
    ov.addEventListener('pointerdown', (e) => { modo.start = { x: e.clientX, y: e.clientY }; ov.setPointerCapture(e.pointerId); });
    ov.addEventListener('pointermove', (e) => { if (modo?.start) desenhar(retangulo(modo.start, { x: e.clientX, y: e.clientY })); });
    ov.addEventListener('pointerup', (e) => {
      if (!modo?.start) return;
      const r = retangulo(modo.start, { x: e.clientX, y: e.clientY });
      modo.start = null;
      desenhar(r);
      concluir(r);
    });
  }

  async function concluir(r) {
    await new Promise(res => setTimeout(res, 120)); // a marcação aparece antes do print
    const pagina = (location.hash || '#inicio').slice(1);
    const versao = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
    let id;
    try {
      id = await window.pywebview.api.capturar_feedback({ ...r, pagina, versao });
    } catch (err) {
      fechar();
      return toast('Não foi possível tirar o print. Confira a permissão de gravação de tela do Mac.');
    }
    fechar();
    const l = openLayer({ html: `<div class="dh"><h2>Comentário</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db"><div class="stack" style="gap:8px"><span class="small muted">O print com a marcação vai junto. Tela: ${esc(pagina)}</span>
        <textarea id="fb-texto" class="input" style="min-height:120px" placeholder="O que está errado ou o que você quer?"></textarea></div></div>
      <div class="df"><span class="grow"></span><button class="btn" data-fb-cancel>Cancelar</button><button class="btn primary" data-fb-send>Enviar</button></div>` });
    let enviado = false;
    l.box.addEventListener('click', async (e) => {
      if (e.target.closest('[data-fb-cancel]')) {
        window.pywebview.api.descartar_feedback(id).catch(() => {});
        return l.close();
      }
      if (!e.target.closest('[data-fb-send]')) return;
      const txt = l.box.querySelector('#fb-texto').value.trim();
      if (!txt) return toast('Escreva o comentário.');
      try {
        await window.pywebview.api.salvar_feedback(id, txt);
        enviado = true; l.close(); toast('Comentário salvo com o print.');
      } catch (err) { toast('Não foi possível salvar o comentário.'); }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modo) return fechar();
    if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') { e.preventDefault(); iniciar(); }
  }, true);
})();
