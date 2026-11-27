/* Reunião automática (27/11). O app do Mac avisa quando começa uma chamada (microfone ligado + Meet/Zoom/Teams aberto)
   e quando ela termina. Na chamada, tudo conta como reunião, qualquer app que esteja na frente.
   Começou: grava na tarefa fixa "Reuniões" do projeto (o do evento da agenda que está acontecendo, se o nome bater;
   senão o da sessão em andamento; senão o último usado). A sessão que estava rodando fica aberta e parada.
   Terminou: encerra a sessão da reunião e retoma a que estava rodando antes. Liga/desliga em db.setting('reuniaoAuto'). */
const reuniaoAutoLigada = () => db.setting('reuniaoAuto', true) !== false;

/* Projeto do evento da agenda que está acontecendo agora (nome do projeto ou do cliente aparece no título). */
function reuniaoProjetoDaAgenda(agora = Date.now()) {
  if (typeof agendaTodosEventos !== 'function') return null;
  const evs = agendaTodosEventos().filter(ev => !ev.diaTodo && new Date(ev.ini).getTime() <= agora + 15 * 60e3 && new Date(ev.fim).getTime() >= agora);
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ativos = projects().filter(p => !['done', 'cancelled'].includes(statusCat(p.status_id)));
  for (const ev of evs) {
    const t = norm(ev.titulo);
    const p = ativos.find(p => p.name && t.includes(norm(p.name))) || ativos.find(p => { const c = clientOf(p); return c && c.name && c.name.length > 2 && t.includes(norm(c.name)); });
    if (p) return p;
  }
  return null;
}
function reuniaoProjetoPadrao() {
  const a = activeEntry(); if (a && a.project_id) return db.get('tempo_projects', a.project_id);
  const ult = db.all('tempo_time_entries').filter(e => e.project_id).sort((x, y) => String(entryStart(y)).localeCompare(String(entryStart(x))))[0];
  return ult ? db.get('tempo_projects', ult.project_id) : null;
}

function reuniaoComecou(quandoISO) {
  if (!reuniaoAutoLigada()) return;
  const quando = new Date(quandoISO || Date.now()).getTime();
  if (Date.now() - quando > 3 * 3600e3) return;   // aviso velho (o app ficou fechado): ignora
  const cur = db.all('tempo_time_entries').find(e => e.state === 'running') || null;
  if (cur && ehReuniaoTk(db.get('tempo_tasks', cur.task_id))) return;   // já está gravando reunião
  const p = reuniaoProjetoDaAgenda() || reuniaoProjetoPadrao();
  if (!p) { toast('Reunião detectada, mas não sei de qual projeto. Inicie o registro e escolha o projeto.', { ms: 9000 }); return; }
  const tk = reuniaoTarefa(p.id, true);
  db.setSetting('reuniaoAntes', cur ? cur.id : null);
  if (cur || openEntries().length) switchTo(p, tk.id);
  else {
    const c = clientOf(p);
    startEntry({ agency_id: c?.agency_id || null, client_id: c?.id || null, project_id: p.id, task_id: tk.id, work_type_id: tk.work_type_id || null, revision_id: null, notes: 'Reunião (detectada pelo Mac)' }, quando);
    db.emit();
  }
  db.setSetting('reuniaoAutoId', (db.all('tempo_time_entries').find(e => e.state === 'running') || {}).id || null);
  toast(`Reunião detectada: gravando em ${esc(p.name)} › Reuniões`, { ms: 10000, actions: [{ label: 'Trocar projeto', run: () => ACTIONS['ts-switch']() }] });
}

function reuniaoTerminou(quandoISO) {
  const id = db.setting('reuniaoAutoId', null); if (!id) return;
  db.setSetting('reuniaoAutoId', null);
  const e = db.get('tempo_time_entries', id);
  if (!e || e.state === 'done') return;
  const fim = new Date(Math.min(Date.now(), new Date(quandoISO || Date.now()).getTime())).toISOString();
  stopEntry(e, fim, null);
  const antesId = db.setting('reuniaoAntes', null); db.setSetting('reuniaoAntes', null);
  const antes = antesId && db.get('tempo_time_entries', antesId);
  if (antes && antes.state === 'paused') resumeEntry(antes);
  db.emit();
  const feita = db.get('tempo_time_entries', id);
  toast(`Reunião encerrada · ${fmtDur(entryMs(feita || e))}${antes && antes.state !== 'done' ? '. Voltei para o que estava rodando.' : ''}`, { ms: 9000, actions: [{ label: 'Revisar', run: () => openEntryModal(id) }] });
}
