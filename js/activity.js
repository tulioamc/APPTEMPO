/* Atividade por programa e por arquivo dentro de cada sessão.
   Registro bruto: db.setting('act:<entryId>') = [{from,to,app,doc,folder}] — cada versão fica separada.
   Agrupamento automático: mesmo programa e (mesmo nome em qualquer pasta, ou mesmo nome sem número de versão na mesma pasta).
   Ajuste manual: db.setting('actLinks') = {itemKey: groupId}. "Desfazer" vira 'solo:<chave>'; "Agrupar" copia o id do grupo de destino.
   Mover: o tempo do grupo sai desta sessão e vira uma sessão nova no projeto/tarefa escolhido. */

const ACT_COLORS = ['#F59E0B', '#7C3AED', '#2563EB', '#60A5FA', '#DB2777', '#059669', '#92400E', '#64748B'];
const ACT_START_H = 7, ACT_SPAN = 17 * 3600000;
const ACT_PALETTE = ['#F59E0B', '#7C3AED', '#2563EB', '#60A5FA', '#DB2777', '#059669', '#92400E', '#64748B', '#EF4444', '#14B8A6', '#84CC16', '#111827',
  '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#A3E635', '#78716C', '#FDE047'];
/* cor escolhida por grupo (chave = id do grupo): db.setting('actColors') */
const actColorMap = () => db.setting('actColors', {}) || {};
/* Cor global por ferramenta (programa ou site do Chrome): chave 'n:<nome>'. Mudou uma vez, muda em todas as sessões,
   na faixa "por programa", na faixa "por arquivo" (sites) e no resumo de semana/mês. */
const CHROME_SITE_NAMES = ['Behance', 'Pinterest', 'Magnific', 'Reunião', 'Claude', 'ChatGPT', 'Docs', 'Sheets', 'Slides', 'Gmail', 'Drive'];
/* o app do ChatGPT e o site contam como a mesma ferramenta */
const toolAlias = (app) => (/chatgpt/i.test(String(app || '')) ? 'ChatGPT' : app);
const isChromeSite = (app, doc) => !!doc && /chrome/i.test(String(app || '')) && CHROME_SITE_NAMES.includes(doc);
const toolName = (r) => (isChromeSite(r.app, r.doc) ? r.doc : toolAlias(r.app));
/* cor padrão estável por nome (o mesmo nome sempre tem a mesma cor padrão, em qualquer sessão) */
/* cor padrão de cada programa/site (a mesma em todos os gráficos); o que não estiver aqui ganha uma cor pelo nome */
const TOOL_DEFAULTS = [['illustrator', '#F97316'], ['photoshop', '#1D6FE0'], ['after effects', '#7C3AED'], ['premiere', '#6D28D9'],
  ['claude', '#C8A02A'], ['chatgpt', '#10A37F'], ['gpt', '#10A37F'], ['magnific', '#111827'], ['whatsapp', '#25D366'],
  ['telegram', '#229ED9'], ['tempo', '#2563EB'], ['ajustes', '#64748B'], ['figma', '#A259FF'], ['chrome', '#EA4335'],
  ['docs', '#4285F4'], ['sheets', '#0F9D58'], ['slides', '#F4B400'], ['gmail', '#D93025'], ['drive', '#1FA463']];
const actDefaultColor = (name) => {
  const n = String(name).toLowerCase();
  const hit = TOOL_DEFAULTS.find(([k]) => n.includes(k)); if (hit) return hit[1];
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return ACT_COLORS[h % ACT_COLORS.length];
};
const colorKeyOf = (gid) => {
  if (gid.startsWith('p:')) return 'n:' + gid.slice(2);
  if (gid.startsWith('a:')) {
    const parts = gid.slice(2).split('|');
    if (parts.length >= 3 && isChromeSite(parts[0], parts[parts.length - 1])) return 'n:' + parts[parts.length - 1];
  }
  return gid;
};
const toolColor = (name) => actColorMap()['n:' + name] || actDefaultColor(name);
/* Cor de um grupo na faixa:
   - programa e site do Chrome: a cor da ferramenta (global, 'n:<nome>');
   - arquivo de um programa: herda a cor do programa (a não ser que a cor do próprio arquivo tenha sido escolhida);
   - sem nada disso: cor da lista, por posição. */
function groupColor(gid, i) {
  const ck = colorKeyOf(gid);
  if (ck.startsWith('n:')) return toolColor(ck.slice(2));
  if (gid.startsWith('a:')) return actColorMap()[gid] || toolColor(gid.slice(2).split('|')[0]);
  return actColorMap()[gid] || ACT_COLORS[i % ACT_COLORS.length];
}
function actSetColor(gid, color) {
  const key = colorKeyOf(gid); const m = { ...actColorMap() };
  if (color) m[key] = color; else delete m[key];
  db.setSetting('actColors', m); db.emit();
}
const actSwatches = (gid) => `<div class="act-swatches">${ACT_PALETTE.map(c => `<button type="button" class="act-swatch" data-x="act-color" data-c="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}<button type="button" class="act-swatch none" data-x="act-color" data-c="" aria-label="Cor padrão">×</button><label class="act-swatch" title="Outra cor" style="position:relative;background:conic-gradient(#EF4444,#F59E0B,#84CC16,#06B6D4,#2563EB,#DB2777,#EF4444);cursor:pointer"><input type="color" data-x="act-custom" data-g="${esc(gid || '')}" value="#2563eb" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0" aria-label="Outra cor"></label></div>`;

function actList(entryId) { return db.setting('act:' + entryId, []) || []; }

/* Chamado a cada segmento de Mac vindo com sessão rodando (ver suggestActivity em app.js). */
function recordActivity(a, seg) {
  const list = actList(a.id);
  if (list.some(x => x.from === seg.from && x.app === seg.app && x.doc === (seg.doc || null))) return;
  // Terminal não grava o nome da janela (que é o usuário): fica só como "Terminal"
  const doc = /^terminal$/i.test(String(seg.app || '')) ? null : (seg.doc || null);
  db.setSetting('act:' + a.id, [...list, { from: seg.from, to: seg.to, app: seg.app, doc, folder: seg.folder || null }]);
}

const actKeyOf = (x) => [x.app || '', x.folder || '', x.doc || ''].join('|');
/* "Video Promo 01.aep" -> "video promo.aep" (só número de versão separado por espaço, _ ou -) */
const actStripVer = (doc) => String(doc || '').toLowerCase().replace(/[\s_-]+(v\s?\d{1,3}|\d{1,3})(?=\.[^.]+$|$)/, '').trim();

/* Agrupamento automático por união: mesmo nome em qualquer pasta, ou mesmo nome sem versão na mesma pasta. */
function actRoots(keys) {
  const parent = {}; keys.forEach(k => { parent[k.key] = k.key; });
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = keys[i], b = keys[j];
    if (!a.doc || !b.doc || a.app !== b.app) continue;
    const same = a.doc.toLowerCase() === b.doc.toLowerCase() || (a.folder === b.folder && actStripVer(a.doc) === actStripVer(b.doc));
    if (same) parent[find(a.key)] = find(b.key);
  }
  return find;
}

/* Analisa a sessão: grupos (ordenados por tempo e com cor) e cada registro bruto com seu grupo.
   mode 'program' agrupa por programa; 'file' agrupa por arquivo (com os ajustes manuais). */
function actAnalyze(entryId, mode) { return actAnalyzeList(actList(entryId), mode); }
function actAnalyzeList(list0, mode) {
  // registros antigos do Terminal podem ter guardado o nome de usuário como arquivo: aqui ele vira só "Terminal"
  const list = list0.map(x => (/^terminal$/i.test(String(x.app || '')) ? { ...x, doc: null, folder: null } : x));
  if (!list.length) return { groups: [], records: [] };
  const info = {};
  list.forEach(x => { const k = actKeyOf(x); info[k] = info[k] || { key: k, app: x.app, doc: x.doc, folder: x.folder }; });
  const find = actRoots(Object.values(info));
  const links = db.setting('actLinks', {}) || {};
  const gidOf = (x) => mode === 'program' ? 'p:' + toolAlias(x.app) : (links[actKeyOf(x)] || 'a:' + find(actKeyOf(x)));
  const groups = {};
  const records = list.map(x => {
    const id = gidOf(x), ms = new Date(x.to) - new Date(x.from), k = actKeyOf(x);
    const g = groups[id] || (groups[id] = { id, items: {}, ms: 0 });
    const it = g.items[k] || (g.items[k] = { key: k, app: x.app, doc: x.doc, ms: 0 });
    it.ms += ms; g.ms += ms;
    return { ...x, gid: id, ms };
  });
  const sorted = Object.values(groups).sort((a, b) => b.ms - a.ms).map((g, i) => {
    const items = Object.values(g.items).sort((a, b) => b.ms - a.ms);
    // Terminal: a janela não tem nome de arquivo útil (aparece com o nome de usuário), então aparece como "Terminal" e em cinza
    const termOnly = items.every(it => /^terminal$/i.test(String(it.app || '')));
    const nameOf = (it) => (/^terminal$/i.test(String(it.app || '')) ? 'Terminal' : (it.doc || it.app));
    const names = [...new Set(items.map(nameOf))];
    const label = mode === 'program' ? toolAlias(items[0].app) : (names.length <= 2 ? names.join(' · ') : `${names.slice(0, 2).join(' · ')} +${names.length - 2}`);
    const color = termOnly ? '#374151' : groupColor(g.id, i);
    return { id: g.id, items, ms: g.ms, label, color };
  });
  return { groups: sorted, records };
}

function actUngroup(g) {
  const links = { ...(db.setting('actLinks', {}) || {}) };
  g.items.forEach(i => { links[i.key] = 'solo:' + i.key; });
  db.setSetting('actLinks', links); db.emit();
}
function actMerge(g, targetId) {
  const links = { ...(db.setting('actLinks', {}) || {}) };
  g.items.forEach(i => { links[i.key] = targetId; });
  db.setSetting('actLinks', links); db.emit();
}

/* ---------- mover o tempo de um arquivo para outro projeto/tarefa ---------- */
function actMergeIntervals(iv) {
  const s = iv.slice().sort((p, q) => p.a - q.a); const out = [];
  s.forEach(c => { const last = out[out.length - 1]; if (last && c.a <= last.b) last.b = Math.max(last.b, c.b); else out.push({ ...c }); });
  return out;
}
/* Segmentos de sessão (ISO) com os trechos "cortes" (ms) retirados. Trecho aberto (e null) continua aberto. */
function actSubtract(segs, cuts) {
  const out = [];
  segs.forEach(s => {
    let pieces = [{ s: new Date(s.s).getTime(), e: s.e ? new Date(s.e).getTime() : null, why: s.why }];
    cuts.forEach(c => {
      pieces = pieces.flatMap(p => {
        const pe = p.e ?? Infinity;
        if (c.b <= p.s || c.a >= pe) return [p];
        const res = [];
        if (c.a > p.s) res.push({ s: p.s, e: c.a, why: p.why });
        if (c.b < pe) res.push({ s: c.b, e: p.e, why: p.why });
        return res;
      });
    });
    out.push(...pieces);
  });
  return out.filter(p => p.e === null || p.e > p.s)
    .map(p => ({ s: new Date(p.s).toISOString(), e: p.e === null ? null : new Date(p.e).toISOString(), ...(p.why ? { why: p.why } : {}) }))
    .sort((p, q) => new Date(p.s) - new Date(q.s));
}
/* Partes dos segmentos que caem dentro dos cortes: é o tempo que vai para o novo registro. */
function actIntersect(segs, cuts, now) {
  const out = [];
  segs.forEach(s => {
    const a = new Date(s.s).getTime(), b = s.e ? new Date(s.e).getTime() : now;
    cuts.forEach(c => { const x = Math.max(a, c.a), y = Math.min(b, c.b); if (y > x) out.push({ s: new Date(x).toISOString(), e: new Date(y).toISOString() }); });
  });
  return out.sort((p, q) => new Date(p.s) - new Date(q.s));
}

function actMoveGroup(entryId, g, pick) {
  const e = db.get('tempo_time_entries', entryId); if (!e) return false;
  const keys = new Set(g.items.map(i => i.key));
  const list = actList(entryId);
  const mine = list.filter(x => keys.has(actKeyOf(x)));
  const cuts = actMergeIntervals(mine.map(x => ({ a: new Date(x.from).getTime(), b: new Date(x.to).getTime() })).filter(c => c.b > c.a));
  const now = Date.now();
  const moved = actIntersect(e.segments || [], cuts, now);
  if (!moved.length) return false;
  const p = db.get('tempo_projects', pick.project_id); if (!p) return false;
  const c = clientOf(p);
  const rest = actSubtract(e.segments || [], cuts);
  const label = tkProjectLabel(p);
  // trava: se o mesmo tempo já está lançado nesse projeto, não cria duplicata (só tira da origem)
  if (!segsCoveredIn(moved, p.id, e.id)) {
    // o registro novo leva o tempo do arquivo e os registros brutos dele
    const nova = db.insert('tempo_time_entries', {
      project_id: p.id, client_id: c?.id || null, agency_id: c?.agency_id || null, task_id: pick.task_id || null,
      work_type_id: lastWorkType(p.id), revision_id: null, notes: `Movido de outra sessão: ${g.label}`,
      state: 'done', segments: moved, edits: [{ at: nowISO(), reason: `Arquivo ${g.label} movido para ${label}`, before: e.segments }],
    });
    db.setSetting('act:' + nova.id, mine);
  }
  // a sessão de origem perde esse tempo (e os registros brutos desse arquivo)
  db.setSetting('act:' + entryId, list.filter(x => !keys.has(actKeyOf(x))));
  if (!rest.length && e.state !== 'running') db.remove('tempo_time_entries', e.id);
  else db.update('tempo_time_entries', e.id, { segments: rest.length ? rest : [{ s: nowISO(), e: null }], edits: [...(e.edits || []), { at: nowISO(), reason: `${g.label} movido para ${label}`, before: e.segments }] }, true);
  db.emit();
  return true;
}

/* Dica do bloco: cada grupo com o tempo de cada versão/arquivo. */
const actTip = (g) => `${g.label}\n${g.items.map(i => `${i.doc || i.app}: ${fmtDur(i.ms)}`).join('\n')}${g.items.length > 1 ? `\nTotal ${fmtDur(g.ms)}` : ''}`;

/* Uma faixa só, com 100% da largura = todo o tempo da sessão. Cada trecho ocupa a parte proporcional ao seu tempo;
   o que não tem registro fica cinza. Os pausas saem da conta (a faixa mostra só o tempo trabalhado). */
/* Motivo de uma pausa (o campo "why" fica no trabalho que vem antes da pausa; ver entryGaps). */
const PAUSE_WHY = { mac: 'Ocioso (mouse e teclado parados) ou computador dormiu', app: 'WhatsApp / Telegram', suspenso: 'Página parada (computador dormiu)', ocioso: 'Ociosidade (navegador)' };
const pauseWhy = (why) => PAUSE_WHY[why] || why || 'Intervalo manual';
/* pausa de app (WhatsApp, Telegram…) aparece em verde claro; ociosidade fica cinza */
const isAppPause = (why) => !!why && (why === 'app' || (db.setting('pauseApps', DEFAULT_PAUSE_APPS) || []).some(x => String(x).trim().toLowerCase() === String(why).trim().toLowerCase()));
/* Cor da listra de cada tipo de pausa (igual na linha do tempo principal e nas faixas da sessão):
   ociosidade = azul bem claro · WhatsApp (e apps de mensagem) = verde claro · Telegram = azul escuro · outros = cinza */
const PAUSE_HATCH = { idle: '#BFDBFE', whatsapp: '#86EFAC', telegram: '#1E40AF', instagram: '#F9A8D4', other: '#A1A1AA' };
const pauseKind = (why) => {
  const w = String(why || '').trim().toLowerCase();
  if (!w) return 'other';
  if (w.includes('telegram')) return 'telegram';
  if (w.includes('instagram')) return 'instagram';
  if (w === 'app' || w.includes('whatsapp') || isAppPause(why)) return 'whatsapp';
  if (w === 'mac' || w === 'ocioso' || w.includes('ocios')) return 'idle';
  return 'other';
};
const pauseHatch = (why) => PAUSE_HATCH[pauseKind(why)];

function actStripHTML(e, A) {
  const now = Date.now();
  const segs = (e.segments || []).map(s => ({ a: new Date(s.s).getTime(), b: s.e ? new Date(s.e).getTime() : now, why: s.why || null }))
    .filter(x => x.b > x.a).sort((p, q) => p.a - q.a);
  if (!segs.length) return '';
  // a faixa cobre a sessão inteira (do começo ao fim); as pausas (espaços entre trabalhos) ficam hachuradas
  const t0 = segs[0].a, t1 = Math.max(...segs.map(x => x.b)), span = t1 - t0;
  if (span <= 0) return '';
  const pct = (t) => (Math.min(Math.max(t, t0), t1) - t0) / span * 100;
  const hhmm = (t) => fmtTime(new Date(t).toISOString());
  const byId = Object.fromEntries(A.groups.map(g => [g.id, g]));
  let pauses = '';
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1].b, b = segs[i].a;
    if (b <= a) continue;
    pauses += `<span class="seg-b pausa act-pause" style="--ph:${pauseHatch(segs[i - 1].why)};left:${pct(a)}%;width:${Math.max(.3, pct(b) - pct(a))}%" data-tip="${esc(`Pausa ${hhmm(a)}–${hhmm(b)} · ${fmtDur(b - a)}\n${pauseWhy(segs[i - 1].why)}`)}"></span>`;
  }
  let bars = '';
  A.records.forEach(r => {
    const g = byId[r.gid]; if (!g) return;
    const x = pct(new Date(r.from).getTime()), y = pct(new Date(r.to).getTime());
    if (y <= x) return;
    bars += `<span class="seg-b fill act-b" data-g="${esc(g.id)}" style="--tb:${g.color};left:${x}%;width:${Math.max(.3, y - x)}%" data-tip="${esc(actTip(g))}"></span>`;
  });
  return `<div class="act-strip" data-ent="${esc(e.id)}" data-t0="${t0}" data-span="${span}" style="position:relative">${pauses}${bars}</div>`;
}

function actChipsHTML(A, mode) {
  return `<div class="act-chips">${A.groups.map(g => `<button type="button" class="act-chip" data-x="act-chip" data-g="${esc(g.id)}" data-mode="${mode}" data-label="${esc(g.label)}" style="--tb:${g.color}" title="${esc(actTip(g))}"><i></i>${esc(g.label)} <span class="faint">${fmtDur(g.ms)}</span></button>`).join('')}</div>`;
}

/* Pausas da sessão em caixinhas: o total, e dentro dele ócio, bloqueada, WhatsApp, Telegram e manual, com o tempo de cada um. */
function pauseChipsHTML(e) {
  const tot = {};
  const add = (key, label, ms, color) => { const t = tot[key] || (tot[key] = { label, ms: 0, color }); t.ms += ms; };
  entryGaps(e).forEach(g => {
    const ms = new Date(g.e) - new Date(g.s); if (!(ms > 0)) return;
    const w = String(g.why || '').trim().toLowerCase();
    if (w === 'mac' || w === 'ocioso' || w.includes('ocios')) add('idle', 'Ócio (mouse e teclado)', ms, PAUSE_HATCH.idle);
    else if (w === 'sono' || w === 'suspenso') add('lock', 'Bloqueada / dormiu', ms, '#9CA3AF');
    else if (pauseKind(g.why) === 'telegram') add('telegram', 'Telegram', ms, PAUSE_HATCH.telegram);
    else if (pauseKind(g.why) === 'instagram') add('instagram', 'Instagram', ms, PAUSE_HATCH.instagram);
    else if (pauseKind(g.why) === 'whatsapp') { const name = g.why === 'app' ? 'WhatsApp' : String(g.why); add('wa:' + name, name, ms, PAUSE_HATCH.whatsapp); }
    else add('manual', 'Manual', ms, '#A1A1AA');
  });
  const items = Object.values(tot).sort((x, y) => y.ms - x.ms);
  if (!items.length) return '';
  const total = items.reduce((sum, i) => sum + i.ms, 0);
  return `<div class="act-chips"><span class="act-chip act-chip-total" style="--tb:#64748B">Pausas <span class="faint">${fmtDur(total)}</span></span>${items.map(i => `<span class="act-chip act-chip-sub" style="--tb:${i.color}"><i></i>${esc(i.label)} <span class="faint">${fmtDur(i.ms)}</span></span>`).join('')}</div>`;
}

/* Bloco da tela "Revisar sessão": uma faixa por programa e uma por arquivo. */
function actSectionHTML(e) {
  if (!actList(e.id).length) return '';
  const prog = actAnalyze(e.id, 'program'), file = actAnalyze(e.id, 'file');
  const sec = (title, mode, A) => `<div class="act-sec"><div class="row between"><span class="lbl">${title}</span></div>${actStripHTML(e, A)}${actChipsHTML(A, mode)}</div>`;
  return `<div class="stack" style="gap:8px">${sec('Por programa', 'program', prog)}${sec('Por arquivo / página', 'file', file)}<div class="act-sec"><div class="row between"><span class="lbl">Pausas</span></div>${pauseChipsHTML(e)}</div><span class="small muted">Passe o mouse para ver o tempo. Faixa hachurada = pausa. Clique num arquivo para desfazer, juntar versões ou mover para outro projeto.</span></div>`;
}

/* Log discreto no fim do formulário da sessão: cada registro de atividade (programa e arquivo) e cada pausa, por horário.
   Linhas de texto antigas (legado, em Notas) também entram aqui, para não sumirem. */
function actLogFootHTML(e, legacyLines) {
  const rows = (legacyLines || []).map(l => ({ k: l.slice(0, 5), line: l }));
  actList(e.id).forEach(r => rows.push({ k: fmtTime(r.from), line: `${fmtTime(r.from)}–${fmtTime(r.to)}  ${r.app}${r.doc ? ' · ' + r.doc : ''}` }));
  const segs = e.segments || [];
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i].e, b = segs[i + 1].s;
    if (a && b && new Date(b) > new Date(a)) rows.push({ k: fmtTime(a), line: `${fmtTime(a)}–${fmtTime(b)}  pausa · ${pauseWhy(segs[i].why)}` });
  }
  if (!rows.length) return '';
  rows.sort((p, q) => (p.k < q.k ? -1 : p.k > q.k ? 1 : 0));
  return `<div class="act-foot"><span class="lbl">Log</span><div class="act-log">${rows.map(r => esc(r.line)).join('<br>')}</div></div>`;
}

/* Janela de um grupo de arquivos: desfazer, juntar com outro grupo ou mover o tempo para outro projeto/tarefa. */
function openActGroup(entryId, gid, onDone) {
  const A = actAnalyze(entryId, 'file');
  const g = A.groups.find(x => x.id === gid); if (!g) return;
  const others = A.groups.filter(x => x.id !== gid);
  openLayer({
    render: () => `<div class="dh"><h2>${esc(g.label)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:8px">
        <span class="lbl">Tempo por versão</span>
        ${g.items.map(i => `<div class="row between"><span>${esc(i.doc || i.app)}</span><span class="mono small">${fmtDur(i.ms)}</span></div>`).join('')}
        <div class="row between"><span class="lbl">Total</span><span class="mono small">${fmtDur(g.ms)}</span></div>
        ${g.items.length > 1 ? `<div class="row"><button class="btn" data-x="act-ungroup">Desfazer agrupamento</button></div>` : ''}
        ${others.length ? `<div class="field"><label for="act-target">Agrupar com outro</label><select id="act-target" class="input">${others.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('')}</select></div><div class="row"><button class="btn" data-x="act-merge">Agrupar</button></div>` : ''}
        <div class="field"><label for="act-proj">Mover este tempo para o projeto</label><select id="act-proj" class="input"><option value="">Escolha um projeto</option>${tkProjectsSorted().map(p => `<option value="${esc(p.id)}">${esc(tkProjectLabel(p))}</option>`).join('')}</select></div>
        <div class="field"><label for="act-task">Tarefa (opcional)</label><select id="act-task" class="input" disabled><option value="">Sem tarefa</option></select></div>
        <div class="field"><label>Cor</label>${actSwatches(gid)}</div>
        <div class="row"><button class="btn" data-x="act-move">Mover</button><span class="small muted">Sai desta sessão e vai para o projeto escolhido.</span></div>
      </div>
      <div class="df"><button class="btn" data-act="close-layer">Fechar</button></div>`,
    onMount: (ly) => {
      const proj = ly.box.querySelector('#act-proj'), task = ly.box.querySelector('#act-task');
      proj.addEventListener('change', () => {
        const tasks = proj.value ? db.where('tempo_tasks', t => t.project_id === proj.value) : [];
        task.innerHTML = `<option value="">Sem tarefa</option>${tasks.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}`;
        task.disabled = !proj.value;
      });
      ly.box.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-x]'); if (!b) return;
        const x = b.dataset.x;
        if (x === 'act-color') { actSetColor(g.id, b.dataset.c); ly.close(); onDone && onDone(); return; }
        if (x === 'act-ungroup') { actUngroup(g); }
        else if (x === 'act-merge') { actMerge(g, ly.box.querySelector('#act-target').value); }
        else if (x === 'act-move') {
          if (!proj.value) return toast('Escolha um projeto.');
          const label = tkProjectLabel(db.get('tempo_projects', proj.value));
          if (!await confirmBox({ title: 'Mover tempo?', body: `O tempo de ${g.label} sai desta sessão e vai para ${label}.`, ok: 'Mover' })) return;
          if (!actMoveGroup(entryId, g, { project_id: proj.value, task_id: task.value || null })) return toast('Nada para mover.');
          toast('Tempo movido');
        }
        else return;
        ly.close(); onDone && onDone();
      });
    },
  });
}

/* Janela de cor de um programa (e de qualquer grupo). */
function openActColor(gid, label, onDone) {
  openLayer({
    render: () => `<div class="dh"><h2>${esc(label)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db"><span class="lbl">Cor na linha do tempo</span>${actSwatches(gid)}</div>`,
    onMount: (ly) => ly.box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-x="act-color"]'); if (!b) return;
      actSetColor(gid, b.dataset.c); ly.close(); onDone && onDone();
    }),
  });
}

/* Cor personalizada: o seletor de cor do sistema grava a cor do grupo. */
document.addEventListener('change', (ev) => {
  const i = ev.target.closest?.('input[data-x="act-custom"]'); if (!i || !i.dataset.g) return;
  actSetColor(i.dataset.g, i.value);
  toast('Cor aplicada');
});

/* Destaque: ao passar o mouse sobre um trecho ou chip, os outros grupos da mesma faixa esmaecem. */
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest?.('.act-b[data-g], .act-chip[data-g]'); if (!t) return;
  const wrap = t.closest('.act-sec'); if (!wrap) return;
  const g = t.dataset.g;
  wrap.classList.add('focus');
  wrap.querySelectorAll('.act-b, .act-chip').forEach(x => x.classList.toggle('on', x.dataset.g === g));
});
document.addEventListener('mouseout', (e) => {
  const t = e.target.closest?.('.act-b[data-g], .act-chip[data-g]'); if (!t) return;
  const next = e.relatedTarget?.closest?.('.act-b[data-g], .act-chip[data-g]');
  if (next && t.closest('.act-sec') === next.closest('.act-sec')) return;
  const wrap = t.closest('.act-sec'); if (!wrap) return;
  wrap.classList.remove('focus');
  wrap.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
});

/* Aba Tempo do projeto: faixa de programas e de arquivos somando todas as sessões do projeto.
   A faixa tem 100% = tempo líquido do projeto; o que não tem registro fica cinza. */
function actProjectHTML(entries) {
  const list = entries.flatMap(e => actList(e.id));
  const total = entries.reduce((s, e) => s + entryMs(e), 0);
  if (!list.length || !total) return '';
  const sec = (title, mode) => {
    const A = actAnalyzeList(list, mode);
    let off = 0, bars = '';
    A.groups.forEach(g => {
      const w = Math.min(100 - off, g.ms / total * 100); if (w <= 0) return;
      bars += `<span class="seg-b fill act-b" data-g="${esc(g.id)}" style="--tb:${g.color};left:${off}%;width:${Math.max(.3, w)}%" data-tip="${esc(actTip(g))}"></span>`;
      off += w;
    });
    return `<div class="act-sec"><div class="row between"><span class="lbl">${title}</span></div><div class="act-strip">${bars}</div><div class="act-chips">${A.groups.map(g => `<span class="act-chip" data-g="${esc(g.id)}" style="--tb:${g.color}"><i></i>${esc(g.label)} <span class="faint">${fmtH(g.ms)}</span></span>`).join('')}</div></div>`;
  };
  return `<div class="stack" style="gap:10px;margin-bottom:14px">${sec('Por programa', 'program')}${sec('Por arquivo / página', 'file')}</div>`;
}
