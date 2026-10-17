/* =====================================================================
   IMPORTAR DO NOTION (CSV)
   ===================================================================== */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split('\n')[0]; const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return { head, rows: rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}
const IMP_FIELDS = [['', 'Ignorar'], ['name', 'Nome do projeto'], ['agency', 'Agência contratante'], ['client', 'Cliente'], ['deadline', 'Prazo'], ['status', 'Status do trabalho'], ['pay', 'Status de pagamento'], ['budget', 'Orçamento'], ['paid', 'Valor pago'], ['remaining', 'Valor restante'], ['notes', 'Observação'], ['parent', 'Tarefa-mãe (vira tarefa do projeto)'], ['est', 'Horas estimadas'], ['wt', 'Tipo de trabalho'], ['created', 'Data de criação']];
function guessField(h) {
  const n = h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rules = [['name', /^(projeto|nome|name|titulo)/], ['agency', /agencia|contratante/], ['client', /cliente/], ['deadline', /prazo|entrega|deadline|data limite/], ['pay', /pagamento|financeiro/], ['status', /^status|situacao|etapa/], ['budget', /orcamento|valor total|valor contratado|budget/], ['paid', /valor pago|pago|recebido/], ['remaining', /restante|saldo|a receber/], ['notes', /observ|nota|obs/], ['parent', /tarefa-mae|tarefa mae|parent|item pai/], ['est', /horas? estimad/], ['wt', /tipo/], ['created', /criad|created/]];
  for (const [k, re] of rules) if (re.test(n)) return k; return '';
}
function parseMoney(s) { if (!s) return null; const t = s.replace(/\s| |R\$/g, ''); if (!/\d/.test(t)) return NaN; const n = Number(t.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? NaN : n; }
function parseDateBR(s) {
  if (!s) return { v: null }; const parts = s.split('→').map(x => x.trim()); const last = parts[parts.length - 1];
  const one = (x) => { let m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`; m = x.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; const d = new Date(x); return isNaN(d) ? undefined : ymd(d); };
  const v = one(last); return v === undefined ? { v: null, bad: true } : { v, range: parts.length > 1 ? one(parts[0]) : null };
}
const stripLink = (s) => s.replace(/\s*\(https?:\/\/[^)]*\)/g, '').trim();
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

VIEWS.import = () => {
  const st = S.imp;
  if (!st) return { title: 'Importar do Notion', html: `<div class="panel"><div class="panel-b stack">
    <label class="import-drop" id="imp-drop" for="imp-file">${icon('upload')}<b>Arraste os CSV exportados do Notion</b><span class="small">ou clique para escolher. Pode selecionar vários arquivos de uma vez.</span><input id="imp-file" type="file" accept=".csv,text/csv" multiple style="display:none" data-on="imp-file"></label>
    <div class="small muted stack" style="gap:4px"><b style="color:var(--fg)">Como exportar no Notion</b><span>Na base de dados: ••• → Exportar → Markdown &amp; CSV. Prefira o arquivo terminado em <span class="mono">_all.csv</span>: ele traz todas as colunas, inclusive “Tarefa-mãe”, que guarda a relação entre projeto e subitens.</span></div>
  </div></div>
  <div class="panel"><div class="panel-h"><h3>O que acontece na importação</h3></div><div class="panel-b stack small">
    <div>1. Você confere qual coluna do Notion vira qual campo do Tempo.</div><div>2. O app mostra uma prévia com avisos: datas ou valores ilegíveis, possíveis duplicatas e relações não encontradas.</div><div>3. Agências, clientes e status novos só são criados depois da sua confirmação.</div><div>4. No fim aparece um relatório com o que foi importado, ignorado e o que precisa de revisão.</div>
  </div></div>` };
  if (st.step === 'report') return { title: 'Importar do Notion', html: importReport(st.report) };
  return { title: 'Importar do Notion', html: importMapping(st) };
};
CHANGES['imp-file'] = async (el) => { await loadImportFiles([...el.files]); };
document.addEventListener('dragover', (e) => { const d = e.target.closest?.('#imp-drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { e.target.closest?.('#imp-drop')?.classList.remove('over'); });
document.addEventListener('drop', async (e) => { const d = e.target.closest?.('#imp-drop'); if (!d) return; e.preventDefault(); await loadImportFiles([...e.dataTransfer.files].filter(f => /\.csv$/i.test(f.name))); });
async function loadImportFiles(files) {
  if (!files.length) return toast('Escolha arquivos .csv');
  const parsed = [];
  for (const f of files) { const p = parseCSV(await f.text()); parsed.push({ name: f.name, ...p, map: Object.fromEntries(p.head.map(h => [h, guessField(h)])) }); }
  // usa o arquivo com mais colunas como principal (o _all do Notion)
  parsed.sort((a, b) => b.head.length - a.head.length);
  S.imp = { step: 'map', files: parsed, active: 0, clientFallback: 'agency', payDate: 'deadline', dupes: 'skip', clearDemo: !!db.setting('demo', false) };
  render();
}

/* Interpreta as linhas conforme o mapeamento, sem gravar nada */
function importPlan(st) {
  const f = st.files[st.active]; const M = {}; Object.entries(f.map).forEach(([h, k]) => { if (k) M[k] = h; });
  const get = (r, k) => M[k] ? r[M[k]] : '';
  const work = statuses('work'), payS = statuses('payment');
  const findSt = (list, v) => list.find(s => norm(s.name) === norm(v)) || (norm(v) === 'standby' ? list.find(s => norm(s.name) === 'standby') : null);
  const newStatus = { work: new Set(), payment: new Set() }; const newAg = new Set(), newCl = new Set();
  const existingByKey = new Set(st.clearDemo ? [] : projects().map(p => norm(p.name) + '|' + norm(agencyOf(p)?.name || '')));
  const rows = f.rows.map((r, i) => {
    const w = []; const name = stripLink(get(r, 'name'));
    const parent = M.parent ? stripLink(get(r, 'parent')).split(',')[0].trim() : '';
    const agency = get(r, 'agency'); const client = get(r, 'client');
    const dl = parseDateBR(get(r, 'deadline')); if (dl.bad) w.push('prazo ilegível');
    const money = {}; ['budget', 'paid', 'remaining'].forEach(k => { const v = parseMoney(get(r, k)); if (Number.isNaN(v)) { w.push(`${k === 'budget' ? 'orçamento' : k === 'paid' ? 'valor pago' : 'valor restante'} ilegível`); money[k] = null; } else money[k] = v; });
    const sv = get(r, 'status'), pv = get(r, 'pay');
    if (sv && !findSt(work, sv) && !(st.clearDemo && false)) newStatus.work.add(sv);
    if (pv && !findSt(payS, pv)) newStatus.payment.add(pv);
    const agName = agency.trim(); const clName = client.trim() || (st.clientFallback === 'agency' && agName ? agName : '');
    if (agName && !(st.clearDemo ? [] : agencies()).some(a => norm(a.name) === norm(agName))) newAg.add(agName);
    if (!name) w.push('sem nome');
    const isTask = !!parent;
    const key = norm(name) + '|' + norm(agName);
    let dup = false;
    if (!isTask && existingByKey.has(key)) { dup = true; w.push('já existe no Tempo'); }
    return { i, name, parent, agency: agName, client: clName, deadline: dl.v, status: sv, pay: pv, ...money, notes: get(r, 'notes'), est: num(get(r, 'est')), wt: get(r, 'wt'), created: parseDateBR(get(r, 'created')).v, isTask, dup, warn: w };
  });
  // duplicadas dentro do próprio arquivo
  const seen = new Map();
  rows.forEach(r => { const k = (r.isTask ? 'T' + norm(r.parent) : 'P') + '|' + norm(r.name) + '|' + norm(r.agency); if (seen.has(k)) { r.dupFile = true; r.warn.push('linha repetida no arquivo'); } else seen.set(k, r); });
  const projNames = new Set(rows.filter(r => !r.isTask).map(r => norm(r.name)));
  rows.filter(r => r.isTask).forEach(r => { if (!projNames.has(norm(r.parent)) && !projects().some(p => norm(p.name) === norm(r.parent))) r.warn.push('projeto-mãe não encontrado'); });
  rows.filter(r => !r.isTask).forEach(r => { if (r.client && !clients().some(c => norm(c.name) === norm(r.client))) newCl.add((r.agency || '—') + '›' + r.client); });
  rows.filter(r => !r.isTask && !r.client).forEach(r => newCl.add('—›Sem cliente (importado)'));
  return { rows, newStatus, newAg, newCl, M };
}

function importMapping(st) {
  const f = st.files[st.active]; const plan = importPlan(st);
  const projs = plan.rows.filter(r => !r.isTask), tasks = plan.rows.filter(r => r.isTask);
  const skip = (r) => r.dupFile || (r.dup && st.dupes === 'skip') || !r.name;
  const warnN = plan.rows.filter(r => r.warn.length).length;
  return `<div class="panel"><div class="panel-h"><h3>1. Arquivo</h3><span class="grow"></span><button class="btn sm ghost" data-act="imp-reset">Escolher outros arquivos</button></div><div class="panel-b stack">
    ${st.files.length > 1 ? `<div class="seg">${st.files.map((x, i) => `<button class="${st.active === i ? 'on' : ''}" data-act="imp-file-sel" data-i="${i}">${esc(x.name.replace(/_[0-9a-f]{32}/, ''))} · ${x.rows.length} linhas · ${x.head.length} colunas</button>`).join('')}</div><span class="small muted">Os arquivos parecem ser a mesma base. O com mais colunas foi escolhido; troque se quiser.</span>` : `<span>${esc(f.name)} · ${f.rows.length} linhas</span>`}
  </div></div>
  <div class="panel"><div class="panel-h"><h3>2. Colunas</h3><span class="small muted">o que cada coluna do Notion vira no Tempo</span></div><div class="panel-b"><div class="grid3">
    ${f.head.map(h => `<div class="field"><label for="map-${norm(h)}">${esc(h)} <span class="faint" style="font-weight:400">· ${esc(f.rows.find(r => r[h])?.[h]?.slice(0, 28) || 'vazio')}</span></label><select id="map-${norm(h)}" class="input sm" data-on="imp-map" data-h="${esc(h)}">${IMP_FIELDS.map(([k, l]) => `<option value="${k}" ${f.map[h] === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}
  </div></div></div>
  <div class="panel"><div class="panel-h"><h3>3. Regras</h3></div><div class="panel-b stack">
    ${!plan.M.client ? `<div class="field"><label for="imp-cf">Não há coluna de cliente. Para cada projeto:</label><select id="imp-cf" class="input" style="max-width:520px" data-on="imp-opt" data-k="clientFallback"><option value="agency" ${st.clientFallback === 'agency' ? 'selected' : ''}>Criar um cliente com o nome da agência (dá para reorganizar depois)</option><option value="none" ${st.clientFallback === 'none' ? 'selected' : ''}>Agrupar em “Sem cliente (importado)”</option></select></div>` : ''}
    ${plan.M.paid ? `<div class="field"><label for="imp-pd">Data do pagamento ao importar “Valor pago”</label><select id="imp-pd" class="input" style="max-width:520px" data-on="imp-opt" data-k="payDate"><option value="deadline" ${st.payDate === 'deadline' ? 'selected' : ''}>Usar o prazo do projeto (sem prazo = pagamento sem data)</option><option value="today" ${st.payDate === 'today' ? 'selected' : ''}>Usar a data de hoje</option></select><span class="hint">O Notion guarda só o total pago. Cada valor vira um pagamento com a observação “Importado do Notion”.</span></div>` : ''}
    <div class="field"><label for="imp-dp">Projetos que já existem no Tempo</label><select id="imp-dp" class="input" style="max-width:520px" data-on="imp-opt" data-k="dupes"><option value="skip" ${st.dupes === 'skip' ? 'selected' : ''}>Pular</option><option value="import" ${st.dupes === 'import' ? 'selected' : ''}>Importar mesmo assim</option></select></div>
    ${db.setting('demo', false) ? `<label class="check"><input type="checkbox" data-on="imp-opt" data-k="clearDemo" ${st.clearDemo ? 'checked' : ''}> Remover os dados fictícios antes de importar</label>` : ''}
  </div></div>
  <div class="panel"><div class="panel-h"><h3>4. Prévia</h3><span class="grow"></span><span class="small muted">${projs.filter(r => !skip(r)).length} projetos · ${tasks.filter(r => !skip(r)).length} tarefas · ${plan.rows.filter(skip).length} ignorados · ${warnN} com aviso</span></div>
    <div class="panel-b stack">
      ${plan.newAg.size || plan.newCl.size || plan.newStatus.work.size || plan.newStatus.payment.size ? `<div class="banner info small" style="align-items:flex-start"><div class="stack" style="gap:4px">
        ${plan.newAg.size ? `<div><b>${plan.newAg.size} agência(s) nova(s):</b> ${[...plan.newAg].map(esc).join(', ')}</div>` : ''}
        ${plan.newCl.size ? `<div><b>${plan.newCl.size} cliente(s) novo(s)</b></div>` : ''}
        ${plan.newStatus.work.size ? `<div><b>Status de trabalho novos:</b> ${[...plan.newStatus.work].map(esc).join(', ')}</div>` : ''}
        ${plan.newStatus.payment.size ? `<div><b>Status de pagamento novos:</b> ${[...plan.newStatus.payment].map(esc).join(', ')}</div>` : ''}
      </div></div>` : ''}
    </div>
    <div class="panel-b tight"><div class="table-wrap" style="max-height:440px;overflow:auto"><table class="grid static compact"><thead><tr><th></th><th>Projeto / tarefa</th><th>Agência</th><th>Cliente</th><th>Prazo</th><th>Status</th><th>Pagamento</th><th class="money">Orçamento</th><th class="money">Pago</th><th class="money">Restante</th><th>Avisos</th></tr></thead>
    <tbody>${plan.rows.map(r => `<tr style="${skip(r) ? 'opacity:.45' : ''}"><td class="faint small">${skip(r) ? 'pular' : r.isTask ? 'tarefa' : 'projeto'}</td><td class="name">${r.isTask ? `<span class="faint">↳ ${esc(r.parent)} › </span>` : ''}${esc(r.name)}</td><td>${r.agency ? tag(r.agency, 'gray', { upper: true }) : ''}</td><td class="small">${r.isTask ? '' : esc(r.client || 'Sem cliente (importado)')}</td><td class="nowrap">${fmtDate(r.deadline)}</td><td>${r.status ? tag(r.status, plan.newStatus.work.has(r.status) ? 'yellow' : 'gray', { pill: true }) : ''}</td><td>${r.pay ? tag(r.pay, plan.newStatus.payment.has(r.pay) ? 'yellow' : 'gray') : ''}</td><td class="money">${fmtMoney(r.budget)}</td><td class="money">${fmtMoney(r.paid)}</td><td class="money">${fmtMoney(r.remaining)}</td><td class="small" style="color:var(--warn)">${r.warn.map(esc).join('; ')}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="df"><span class="left small muted">Nada é gravado até você confirmar.</span><button class="btn" data-act="imp-reset">Cancelar</button><button class="btn primary" data-act="imp-run">Importar ${projs.filter(r => !skip(r)).length} projetos e ${tasks.filter(r => !skip(r)).length} tarefas</button></div>
  </div>`;
}
CHANGES['imp-map'] = (el) => { S.imp.files[S.imp.active].map[el.dataset.h] = el.value; render(); };
CHANGES['imp-opt'] = (el) => { S.imp[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; render(); };
ACTIONS['imp-file-sel'] = (el) => { S.imp.active = Number(el.dataset.i); render(); };
ACTIONS['imp-reset'] = () => { S.imp = null; render(); };

ACTIONS['imp-run'] = async () => {
  const st = S.imp; const f = st.files[st.active]; const M = Object.fromEntries(Object.entries(f.map).filter(([, k]) => k).map(([h, k]) => [k, h]));
  if (!M.name) return toast('Indique qual coluna é o nome do projeto.');
  if (st.clearDemo) {
    const keep = ['tempo_work_types', 'tempo_status_options', 'tempo_reminders', 'tempo_settings'];
    TABLES.forEach(t => { if (!keep.includes(t)) db.data[t] = []; });
    db.data.tempo_settings = db.data.tempo_settings.filter(s => s.key !== 'demo');
  }
  const plan = importPlan(st);
  const rep = { projects: 0, tasks: 0, agencies: 0, clients: 0, statuses: 0, payments: 0, skipped: [], warnings: [], unresolved: [] };
  const findOrCreateStatus = (kind, v) => {
    if (!v) return null; const list = statuses(kind);
    let s = list.find(x => norm(x.name) === norm(v)); if (s) return s.id;
    const cat = kind === 'work' ? (/cancel/i.test(v) ? 'cancelled' : /conclu|finaliz|entreg/i.test(v) ? 'done' : 'active') : (/cancel/i.test(v) ? 'closed' : /^pago$/i.test(v) ? 'closed' : 'open');
    s = db.insert('tempo_status_options', { kind, name: v.trim(), color: /cancel/i.test(v) ? 'red' : 'brown', category: cat, order: list.length }, true); rep.statuses++; return s.id;
  };
  const agCache = {}; const getAgency = (n) => { if (!n) return null; const k = norm(n); if (agCache[k]) return agCache[k]; let a = db.all('tempo_agencies').find(x => norm(x.name) === k); if (!a) { a = db.insert('tempo_agencies', { name: n.trim(), abbr: abbrFor(n.trim()), color: presetAt(db.all('tempo_agencies').length + 1), cnpj: '', contact: '', address: '', notes: 'Importada do Notion', archived: false }, true); rep.agencies++; } return agCache[k] = a; };
  const clCache = {}; const getClient = (n, ag0) => { const ag = ag0 || directAgency(); const name = n || 'Sem cliente (importado)'; const k = norm(name) + '|' + (ag?.id || ''); if (clCache[k]) return clCache[k]; let c = db.all('tempo_clients').find(x => norm(x.name) === norm(name) && (x.agency_id || null) === (ag?.id || null)); if (!c) { c = db.insert('tempo_clients', { name, agency_id: ag?.id || null, color: ag ? colorVariant(ag.color, db.all('tempo_clients').filter(x => x.agency_id === ag.id).map(x => x.color)) : presetAt(0), cnpj: '', contact: '', address: '', notes: n ? 'Importado do Notion' : 'Criado na importação para projetos sem cliente. Reorganize quando quiser.', archived: false }, true); rep.clients++; } return clCache[k] = c; };
  const byName = {};
  const skip = (r) => r.dupFile || (r.dup && st.dupes === 'skip') || !r.name;
  plan.rows.filter(r => !r.isTask).forEach(r => {
    if (skip(r)) { rep.skipped.push(`${r.name || '(sem nome)'} — ${r.dupFile ? 'linha repetida' : r.dup ? 'já existia' : 'sem nome'}`); return; }
    const ag = getAgency(r.agency); const cl = getClient(r.client, ag);
    const sid = findOrCreateStatus('work', r.status) || statusByCat('work', 'todo').id; const pid = findOrCreateStatus('payment', r.pay) || statuses('payment')[0].id;
    const p = db.insert('tempo_projects', { name: r.name, client_id: cl.id, description: '', status_id: sid, payment_status_id: pid, deadline: r.deadline, deadline_original: r.deadline, budget: r.budget, remaining_override: plan.M.remaining ? (r.remaining ?? 0) : null, estimated_hours: r.est, notes: r.notes, revisions_included: null, archived: false, imported_from: 'notion', created_at: r.created ? parseYmd(r.created).toISOString() : nowISO(), completed_at: statusCat(sid) === 'done' && r.deadline ? parseYmd(r.deadline).toISOString() : null }, true);
    logEvent('project', p.id, 'created', 'Importado do Notion');
    if (r.paid) { db.insert('tempo_payments', { project_id: p.id, amount: r.paid, date: st.payDate === 'deadline' ? (r.deadline || null) : ymd(new Date()), note: 'Importado do Notion (total pago)', invoice: '' }, true); rep.payments++; }
    if (r.warn.length) rep.warnings.push(`${r.name}: ${r.warn.join('; ')}`);
    (byName[norm(r.name)] ||= []).push(p); rep.projects++;
  });
  plan.rows.filter(r => r.isTask).forEach(r => {
    if (skip(r)) { rep.skipped.push(`${r.name} (tarefa de ${r.parent}) — linha repetida`); return; }
    const p = byName[norm(r.parent)]?.[0] || projects().find(x => norm(x.name) === norm(r.parent));
    if (!p) { rep.unresolved.push(`${r.name} → projeto-mãe “${r.parent}” não encontrado`); return; }
    const sid = findOrCreateStatus('work', r.status) || p.status_id;
    db.insert('tempo_tasks', { project_id: p.id, parent_id: null, name: r.name, status_id: sid, status_inherited: sid === p.status_id, deadline: r.deadline, notes: r.notes, order: tasksOf(p.id).length, work_type_id: null }, true);
    rep.tasks++;
  });
  db.emit();
  S.imp = { step: 'report', report: rep }; render();
};
function importReport(rep) {
  const list = (title, arr, cls = '') => arr.length ? `<div class="panel"><div class="panel-h"><h3>${title} (${arr.length})</h3></div><div class="panel-b small stack ${cls}" style="gap:4px;max-height:260px;overflow:auto">${arr.map(x => `<div>${esc(x)}</div>`).join('')}</div></div>` : '';
  return `<div class="banner info">${icon('check')}<span class="grow"><b>Importação concluída.</b> Confira alguns projetos e os totais no Financeiro.</span><button class="btn sm" data-act="go" data-route="projects">Ver projetos</button><button class="btn sm" data-act="go" data-route="finance">Ver financeiro</button></div>
  <div class="kpis">${[['Projetos', rep.projects], ['Tarefas', rep.tasks], ['Agências novas', rep.agencies], ['Clientes novos', rep.clients], ['Status novos', rep.statuses], ['Pagamentos', rep.payments]].map(([k, v]) => `<div class="kpi"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
  ${list('Relações não resolvidas', rep.unresolved)}${list('Importados com aviso', rep.warnings)}${list('Ignorados', rep.skipped)}
  <div><button class="btn" data-act="imp-reset">Importar outro arquivo</button></div>`;
}
