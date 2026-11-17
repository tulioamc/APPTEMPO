/* Modelos de orçamento: janela "Outros" com todos (estrela = favorito, lápis = editar, lixeira = apagar, clicar = usar)
   e o editor de modelo (criar do zero ou editar um pronto). */
function openModelos(onUsar) {
  const draw = () => {
    const ms = todosModelos(); const fav = modelosFav();
    const lista = Object.entries(ms).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
    return `<div class="dh">${icon('doc')}<h2>Modelos</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:4px">${lista.map(([k, m]) => `<div class="row mod-row" style="flex-wrap:nowrap;gap:6px;align-items:center">
        <button type="button" class="btn sm icon ghost" data-mfav="${k}" aria-label="${fav.includes(k) ? 'Tirar dos favoritos' : 'Favoritar'}" title="${fav.includes(k) ? 'Tirar dos favoritos' : 'Favorito: aparece direto na proposta'}" style="${fav.includes(k) ? 'color:#e9a400' : ''}">${fav.includes(k) ? '★' : '☆'}</button>
        <button type="button" class="btn sm ghost grow" style="justify-content:flex-start" data-musar="${k}" title="Usar este modelo">${esc(m.nome)} <span class="faint small">${m.etapas.length} etapa(s)${m.video ? ' · vídeo' : ''}</span></button>
        <button type="button" class="btn sm icon ghost" data-medit="${k}" aria-label="Editar" title="Editar">${icon('edit')}</button>
        <button type="button" class="btn sm icon ghost" data-mdel="${k}" aria-label="Apagar" title="Apagar">${icon('trash')}</button></div>`).join('') || '<div class="muted small">Nenhum modelo.</div>'}</div>
    <div class="df">${modelosOcultos().some(k => MODELOS[k]) ? '<button class="btn left ghost" data-mrestaura>Restaurar os prontos apagados</button>' : ''}<button class="btn" data-act="close-layer">Fechar</button><button class="btn primary" data-mnovo>${icon('plus')} Criar novo</button></div>`;
  };
  const l = openLayer({ render: draw });
  l.box.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-mfav]'); if (f) { const k = f.dataset.mfav; const fav = modelosFav(); db.setSetting('modelosFav', fav.includes(k) ? fav.filter(x => x !== k) : [...fav, k]); l.refresh(); onUsar && onUsar(null); return; }
    const u = e.target.closest('[data-musar]'); if (u) { l.close(); onUsar && onUsar(u.dataset.musar); return; }
    const ed = e.target.closest('[data-medit]'); if (ed) { openEditorModelo(ed.dataset.medit, () => { l.refresh(); onUsar && onUsar(null); }); return; }
    const d = e.target.closest('[data-mdel]'); if (d) {
      const k = d.dataset.mdel; const m = todosModelos()[k];
      if (!await confirmBox({ title: 'Apagar o modelo?', body: `<b>${esc(m.nome)}</b> sai da lista. Propostas já feitas não mudam.`, ok: 'Apagar', danger: true })) return;
      const mp = { ...modelosProprios() }; delete mp[k]; db.setSetting('modelosProprios', mp);
      if (MODELOS[k]) db.setSetting('modelosOcultos', [...new Set([...modelosOcultos(), k])]);
      db.setSetting('modelosFav', modelosFav().filter(x => x !== k)); l.refresh(); onUsar && onUsar(null); return;
    }
    if (e.target.closest('[data-mrestaura]')) { db.setSetting('modelosOcultos', modelosOcultos().filter(k => !MODELOS[k])); l.refresh(); onUsar && onUsar(null); return; }
    if (e.target.closest('[data-mnovo]')) { openEditorModelo(null, (k) => { db.setSetting('modelosFav', [...modelosFav(), k]); l.refresh(); onUsar && onUsar(null); }); }
  });
}
/* Editor: nome, se é vídeo (horas e dias por minuto) e as etapas. Editar um pronto grava a versão sua por cima dele. */
function openEditorModelo(chave, onSalvar) {
  const base = chave ? todosModelos()[chave] : null;
  const tipos = workTypes();
  const m = { nome: base?.nome || '', video: !!base?.video, etapas: (base?.etapas || [{ name: '', h: 0, prazo: 0 }]).map(e => ({ name: e.name, wtId: e.wtId || (tipos.find(t => t.name === e.wt) || {}).id || '', h: e.h || '', prazo: e.prazo || '', qtd: e.qtd || '', ap: !!e.ap, par: !!e.par, terc: !!e.terc, valor: e.valor ?? null })) };
  const draw = () => `<div class="dh">${icon('edit')}<h2>${chave ? 'Editar modelo' : 'Novo modelo'}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
    <div class="db stack" style="gap:10px">
      <div class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap"><div class="field grow"><label for="me-n">Nome</label><input id="me-n" class="input" data-me="nome" value="${esc(m.nome)}" placeholder="Ex.: Pacote de ícones"></div>
        <label class="check small" style="padding-bottom:8px"><input type="checkbox" data-me-video ${m.video ? 'checked' : ''}> É vídeo <span class="faint">(horas e dias por minuto)</span></label></div>
      <div class="me-line me-head small faint"><span></span><span>Etapa</span><span>Tipo</span><span>Qtd</span><span>Horas</span><span>Dias</span><span title="Termina com aprovação do cliente">Aprov.</span><span title="Em paralelo com a de cima">Paral.</span><span title="Terceirizado">Terc.</span><span></span></div>
      ${m.etapas.map((e, i) => `<div class="me-line"><span class="row" style="gap:0;flex-direction:column"><button type="button" class="btn sm icon ghost me-seta" data-meup="${i}" ${i ? '' : 'disabled'} aria-label="Subir">${icon('chevU')}</button><button type="button" class="btn sm icon ghost me-seta" data-medown="${i}" ${i < m.etapas.length - 1 ? '' : 'disabled'} aria-label="Descer">${icon('chevD')}</button></span>
        <input class="input sm" data-mei="${i}" data-k="name" value="${esc(e.name)}" placeholder="Etapa" aria-label="Etapa">
        <select class="input sm" data-mei="${i}" data-k="wtId" aria-label="Tipo">${options(tipos, e.wtId, { empty: true, emptyLabel: 'Tipo' })}</select>
        <input type="number" min="1" class="input sm" data-mei="${i}" data-k="qtd" value="${e.qtd}" placeholder="1" aria-label="Quantidade">
        ${e.terc ? `<input type="number" min="0" class="input sm mono" data-mei="${i}" data-k="valor" value="${e.valor ?? ''}" placeholder="R$" aria-label="Valor do terceirizado">` : `<input type="number" step="0.5" min="0" class="input sm" data-mei="${i}" data-k="h" value="${e.h}" placeholder="h" aria-label="Horas" ${e.par ? 'disabled' : ''}>`}
        <input type="number" step="0.5" min="0" class="input sm" data-mei="${i}" data-k="prazo" value="${e.prazo}" placeholder="dias" aria-label="Dias úteis" ${e.par ? 'disabled' : ''}>
        ${['ap', 'par', 'terc'].map(c => `<label class="qf-par"><input type="checkbox" data-meck="${i}" data-k="${c}" ${e[c] ? 'checked' : ''} aria-label="${c}"></label>`).join('')}
        <button type="button" class="btn sm icon ghost" data-medel="${i}" aria-label="Remover">${icon('x')}</button></div>`).join('')}
      <div><button type="button" class="btn sm" data-meadd>${icon('plus')} Etapa</button></div>
      <div class="small muted">Total: ${m.etapas.reduce((s, e) => s + (e.par || e.terc ? 0 : (Number(e.h) || 0) * (Number(e.qtd) > 0 ? Number(e.qtd) : 1)), 0)} h · ${m.etapas.reduce((s, e) => s + (e.par ? 0 : Number(e.prazo) || 0), 0)} dias úteis${m.video ? ' por minuto' : ''}</div>
    </div>
    <div class="df"><button class="btn" data-act="close-layer">Cancelar</button><button class="btn primary" data-mesalva>Salvar modelo</button></div>`;
  const l = openLayer({ wide: true, render: draw });
  l.box.addEventListener('input', (ev) => { const t = ev.target; if (t.dataset.me) m[t.dataset.me] = t.value; else if (t.dataset.mei !== undefined && t.tagName !== 'SELECT') m.etapas[t.dataset.mei][t.dataset.k] = t.value; });
  l.box.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.hasAttribute('data-me-video')) { m.video = t.checked; l.refresh(); return; }
    if (t.dataset.meck !== undefined) { const e = m.etapas[t.dataset.meck]; e[t.dataset.k] = t.checked; if (t.dataset.k === 'terc' && t.checked) { e.h = ''; e.par = false; } if (t.dataset.k === 'par' && t.checked) { e.h = ''; e.prazo = ''; e.terc = false; } l.refresh(); return; }
    if (t.dataset.mei !== undefined) m.etapas[t.dataset.mei][t.dataset.k] = t.value;
  });
  l.box.addEventListener('click', (ev) => {
    const up = ev.target.closest('[data-meup]'); if (up) { const i = Number(up.dataset.meup); [m.etapas[i - 1], m.etapas[i]] = [m.etapas[i], m.etapas[i - 1]]; l.refresh(); return; }
    const dn = ev.target.closest('[data-medown]'); if (dn) { const i = Number(dn.dataset.medown); [m.etapas[i + 1], m.etapas[i]] = [m.etapas[i], m.etapas[i + 1]]; l.refresh(); return; }
    const d = ev.target.closest('[data-medel]'); if (d) { m.etapas.splice(Number(d.dataset.medel), 1); if (!m.etapas.length) m.etapas.push({ name: '', h: '', prazo: '' }); l.refresh(); return; }
    if (ev.target.closest('[data-meadd]')) { m.etapas.push({ name: '', wtId: '', h: '', prazo: '', qtd: '' }); l.refresh(); return; }
    if (ev.target.closest('[data-mesalva]')) {
      const nome = m.nome.trim(); if (!nome) return toast('Dê um nome ao modelo.');
      const etapas = m.etapas.filter(e => (e.name || '').trim()).map(e => ({ name: e.name.trim(), wtId: e.wtId || '', h: Number(e.h) || 0, prazo: Number(e.prazo) || 0, qtd: Number(e.qtd) > 1 ? Number(e.qtd) : '', ap: !!e.ap, par: !!e.par, terc: !!e.terc, valor: e.terc ? (Number(e.valor) || null) : null }));
      if (!etapas.length) return toast('Coloque pelo menos uma etapa.');
      const k = chave || ('p' + Date.now().toString(36));
      db.setSetting('modelosProprios', { ...modelosProprios(), [k]: { nome, video: m.video, etapas } });
      l.close(); toast(`Modelo “${esc(nome)}” salvo`); onSalvar && onSalvar(k);
    }
  });
}
