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
/* Cadastro único de programas (Configurações → Programas): nome que aparece, palavra que identifica o app e cor.
   Tudo que mostra programa (faixas, caixinhas, Resumo, relatórios) lê daqui. */
const PROG_DEFAULTS = [
  { match: 'illustrator', name: 'Illustrator', color: '#F97316' }, { match: 'photoshop', name: 'Photoshop', color: '#1D6FE0' },
  { match: 'after effects', name: 'After Effects', color: '#7C3AED' }, { match: 'premiere', name: 'Premiere', color: '#6D28D9' },
  { match: 'cinema 4d', name: 'Cinema 4D', color: '#0891B2' }, { match: 'audition', name: 'Audition', color: '#00A58C' },
  { match: 'acrobat', name: 'Acrobat', color: '#B91C1C' }, { match: 'claude', name: 'Claude', color: '#C8A02A' },
  { match: 'chatgpt', name: 'ChatGPT', color: '#10A37F' }, { match: 'gpt', name: 'ChatGPT', color: '#10A37F' },
  { match: 'magnific', name: 'Magnific', color: '#111827' }, { match: 'whatsapp', name: 'WhatsApp', color: '#25D366' },
  { match: 'telegram', name: 'Telegram', color: '#229ED9' }, { match: 'tempo', name: 'Tempo', color: '#2563EB' },
  { match: 'ajustes', name: 'Ajustes do Sistema', color: '#64748B' }, { match: 'figma', name: 'Figma', color: '#A259FF' },
  { match: 'chrome', name: 'Google Chrome', color: '#EA4335' }, { match: 'docs', name: 'Google Docs', color: '#4285F4' },
  { match: 'sheets', name: 'Google Sheets', color: '#0F9D58' }, { match: 'slides', name: 'Google Slides', color: '#F4B400' },
  { match: 'gmail', name: 'Gmail', color: '#D93025' }, { match: 'drive', name: 'Google Drive', color: '#1FA463' },
];
const programas = () => { const v = db.setting('programas', null); return Array.isArray(v) ? v : PROG_DEFAULTS; };
const programFor = (app) => { const a = String(app || '').toLowerCase(); return programas().find(p => p.match && a.includes(String(p.match).toLowerCase())) || null; };
const shortProgram = (app) => { const p = programFor(app); return p ? p.name : toolAlias(app); };
const isChromeSite = (app, doc) => !!doc && /chrome/i.test(String(app || '')) && CHROME_SITE_NAMES.includes(doc);
const toolName = (r) => (isChromeSite(r.app, r.doc) ? r.doc : toolAlias(r.app));
/* cor padrão estável por nome (o mesmo nome sempre tem a mesma cor padrão, em qualquer sessão) */
/* cor padrão de cada programa/site (a mesma em todos os gráficos); o que não estiver aqui ganha uma cor pelo nome */
const actDefaultColor = (name) => {
  const n = String(name).toLowerCase();
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
const toolColor = (name) => actColorMap()['n:' + name] || programFor(name)?.color || actDefaultColor(name);
/* Cor de um grupo na faixa:
   - programa e site do Chrome: a cor da ferramenta (global, 'n:<nome>');
   - arquivo de um programa: herda a cor do programa (a não ser que a cor do próprio arquivo tenha sido escolhida);
   - sem nada disso: cor da lista, por posição. */
function groupColor(gid, i) {
  const ck = colorKeyOf(gid);
  if (ck.startsWith('n:')) return toolColor(ck.slice(2));
  if (gid.startsWith('a:')) return actColorMap()[gid] || toolColor(gid.slice(2).split('|')[0]);
  if (gid.startsWith('app:')) return actColorMap()[gid] || toolColor(gid.slice(4));
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
  db.setSetting('act:' + a.id, [...list, { from: seg.from, to: seg.to, app: seg.app, doc, folder: seg.folder || null, rid: seg.rid || null }]);
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
/* Nomes longos: "magnific__upscale-...-94894.png" vira "magnific__" (prefixo antes de "__") e ellipsis no meio. */
/* Arquivos do mesmo programa Adobe/Maxon (ex.: todos os do Photoshop) ficam num grupo só na aba de arquivos; o [+] abre a lista para separar. */
const appFamily = (app) => {
  const a = String(app || '');
  if (/^adobe\b/i.test(a) || /\b(photoshop|illustrator|after effects|premiere|indesign|animate|audition|lightroom)\b/i.test(a)) return 'Adobe';
  if (/cinema ?4d|maxon|redshift|zbrush/i.test(a)) return 'Maxon';
  return null;
};
const docPre = (doc) => { const m = String(doc || '').match(/^(.+?__)/); return m ? m[1] : null; };
const shortName = (s, max = 30) => { s = String(s || ''); return s.length > max ? s.slice(0, max - 9) + '…' + s.slice(-8) : s; };
function actAnalyzeList(list0, mode) {
  // Terminal e Finder não têm arquivo nem pasta na análise (registros antigos podem ter guardado nome de usuário ou pasta): viram só o app
  const list = list0.map(x => (/^(terminal|finder)$/i.test(String(x.app || '')) ? { ...x, doc: null, folder: null } : x));
  if (!list.length) return { groups: [], records: [] };
  const info = {};
  list.forEach(x => { const k = actKeyOf(x); info[k] = info[k] || { key: k, app: x.app, doc: x.doc, folder: x.folder }; });
  const find = actRoots(Object.values(info));
  const links = db.setting('actLinks', {}) || {};
  const gidOf = (x) => {
    if (mode === 'program') return 'p:' + toolAlias(x.app);
    const k = actKeyOf(x);
    if (links[k]) return links[k];
    const fam = appFamily(x.app);
    if (fam) return 'app:' + String(x.app || '').toLowerCase();
    const pre = docPre(x.doc);
    return pre ? 'pre:' + (x.folder || '') + '|' + pre.toLowerCase() : 'a:' + find(k);
  };
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
    let label;
    if (mode === 'program') label = shortProgram(items[0].app);
    else if (String(g.id).startsWith('app:')) label = shortProgram(items[0].app);
    else if (String(g.id).startsWith('pre:')) {
      const exts = [...new Set(items.map(it => (String(it.doc || '').match(/\.[^.]+$/) || [''])[0]))];
      label = docPre(items[0].doc) + (exts.length === 1 ? exts[0] : '');
    } else label = names.length <= 2 ? names.map(n => shortName(n)).join(' · ') : `${names.slice(0, 2).map(n => shortName(n)).join(' · ')} +${names.length - 2}`;
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
/* Separa só os arquivos marcados: cada um vira um grupo próprio. */
function actSplit(keys) {
  const links = { ...(db.setting('actLinks', {}) || {}) };
  keys.forEach(k => { links[k] = 'solo:' + k; });
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
function actSubtract(segs, cuts, movedTo = null) {
  const out = [];
  segs.forEach(s => {
    let pieces = [{ s: new Date(s.s).getTime(), e: s.e ? new Date(s.e).getTime() : null, why: s.why, movedTo: s.movedTo || null }];
    cuts.forEach(c => {
      pieces = pieces.flatMap(p => {
        const pe = p.e ?? Infinity;
        if (c.b <= p.s || c.a >= pe) return [p];
        const res = [];
        if (c.a > p.s) res.push({ s: p.s, e: c.a, why: c.b < pe ? 'moved' : p.why, movedTo: c.b < pe ? movedTo : p.movedTo });   // o corte vira lacuna "movida", não pausa
        if (c.b < pe) res.push({ s: c.b, e: p.e, why: p.why, movedTo: p.movedTo });
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

/* Separa registros entre os trechos marcados (ranges em ms) e o resto; quem cruza a borda é cortado. Sem trechos, tudo é "dentro". */
function actClipRecs(recs, ranges) {
  const inside = [], outside = [];
  recs.forEach(x => {
    const a = new Date(x.from).getTime(), b = new Date(x.to).getTime();
    if (!(b > a)) return;
    if (!ranges) { inside.push(x); return; }
    ranges.forEach(r => { const s0 = Math.max(a, r.a), e0 = Math.min(b, r.b); if (e0 > s0) inside.push({ ...x, from: new Date(s0).toISOString(), to: new Date(e0).toISOString() }); });
    let pieces = [{ a, b }];
    ranges.forEach(r => { pieces = pieces.flatMap(p => { if (r.b <= p.a || r.a >= p.b) return [p]; const out = []; if (r.a > p.a) out.push({ a: p.a, b: r.a }); if (r.b < p.b) out.push({ a: r.b, b: p.b }); return out; }); });
    pieces.filter(p => p.b > p.a).forEach(p => outside.push({ ...x, from: new Date(p.a).toISOString(), to: new Date(p.b).toISOString() }));
  });
  return { inside, outside };
}
/* Registros de um programa (grupo) dentro de uma sessão. */
function progRecsOf(entryId, g) {
  const keys = new Set(g.items.map(i => i.key));
  return actList(entryId).filter(x => keys.has(actKeyOf(x)));
}
/* Tempo de um programa nas sessões dadas (todo o tempo, ou só dentro dos trechos marcados). */
function progMsOf(ids, gid, ranges) {
  return ids.reduce((sum, id) => {
    const g = actAnalyze(id, 'program').groups.find(x => x.id === gid); if (!g) return sum;
    if (!ranges) return sum + g.ms;
    return sum + actClipRecs(progRecsOf(id, g), ranges).inside.reduce((t, x) => t + (new Date(x.to) - new Date(x.from)), 0);
  }, 0);
}

function actMoveGroup(entryId, g, pick, ranges = null) {
  const e = db.get('tempo_time_entries', entryId); if (!e) return false;
  const keys = new Set(g.items.map(i => i.key));
  const list = actList(entryId);
  const parts = actClipRecs(progRecsOf(entryId, g), ranges ? actMergeIntervals(ranges) : null);
  const mine = parts.inside, leftover = parts.outside;
  const cuts = actMergeIntervals(mine.map(x => ({ a: new Date(x.from).getTime(), b: new Date(x.to).getTime() })).filter(c => c.b > c.a));
  const now = Date.now();
  const moved = actIntersect(e.segments || [], cuts, now);
  if (!moved.length) return false;
  const p = db.get('tempo_projects', pick.project_id); if (!p) return false;
  const c = clientOf(p);
  const rest = actSubtract(e.segments || [], cuts, p.id);
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
  db.setSetting('act:' + entryId, [...list.filter(x => !keys.has(actKeyOf(x))), ...leftover]);
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
const PAUSE_HATCH = { idle: '#b2deff', whatsapp: '#6cf1ae', telegram: '#1E40AF', instagram: '#F9A8D4', other: '#d1d1d1' };
/* Cor do espaço entre as listras: par da cor da listra (WhatsApp e demais pausas); os outros usam a própria cor, clareada. */
const PAUSE_GAP = { '#6cf1ae': '#9ef5c7', '#d1d1d1': '#dfdfdf', '#b2deff': '#cae8ff' };
const pauseGapOf = (c) => PAUSE_GAP[c] || (c && c.length === 7 ? c + '52' : 'transparent');
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

function actStripHTML(e, A, mode = '') {
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
    if (b <= a || segs[i - 1].why === 'moved') continue;
    pauses += `<span class="seg-b pausa act-pause" style="--ph:${pauseHatch(segs[i - 1].why)};--pg:${pauseGapOf(pauseHatch(segs[i - 1].why))};left:${pct(a)}%;width:${Math.max(.3, pct(b) - pct(a))}%" data-tip="${esc(`Pausa ${hhmm(a)}–${hhmm(b)} · ${fmtDur(b - a)}\n${pauseWhy(segs[i - 1].why)}`)}"></span>`;
  }
  let bars = '';
  // trechos que saíram desta sessão para outro projeto: lacuna clicável com o destino
  for (let i = 0; i < segs.length - 1; i++) {
    const a = e.segments[i].e, b = e.segments[i + 1].s;
    if (e.segments[i].why !== 'moved' || !a || !b || new Date(b) <= new Date(a)) continue;
    const x = pct(new Date(a).getTime()), y = pct(new Date(b).getTime());
    const dst = db.get('tempo_projects', e.segments[i].movedTo);
    const nome = dst ? tkProjectLabel(dst) : 'outro projeto';
    bars += `<span class="act-moved" data-pid="${esc(e.segments[i].movedTo || '')}" style="left:${x}%;width:${Math.max(.3, y - x)}%" data-tip="${esc('Movido para ' + nome + ' · clique para abrir')}">${(y - x) > 6 ? 'Movido → ' + esc(nome) : ''}</span>`;
  }
  A.records.forEach(r => {
    const g = byId[r.gid]; if (!g) return;
    const x = pct(new Date(r.from).getTime()), y = pct(new Date(r.to).getTime());
    if (y <= x) return;
    bars += `<span class="seg-b fill act-b" data-g="${esc(g.id)}" data-a="${new Date(r.from).getTime()}" data-b="${new Date(r.to).getTime()}" style="--tb:${g.color};left:${x}%;width:${Math.max(.3, y - x)}%" data-tip="${esc(actTip(g))}"></span>`;
  });
  // trechos marcados para mover (seleção em andamento nesta sessão)
  if (mode === 'program' && ACT_SEL && ACT_SEL.key === e.id) {
    ACT_SEL.ranges.concat(ACT_SEL.drag ? [ACT_SEL.drag] : []).forEach(r => { const x = pct(r.a), y = pct(r.b); if (y > x) bars += `<span class="res-sel-range" style="left:${x}%;width:${Math.max(.3, y - x)}%"></span>`; });
  }
  return `<div class="act-strip" data-ent="${esc(e.id)}" data-mode="${mode}" data-t0="${t0}" data-span="${span}" style="position:relative">${pauses}${bars}</div>`;
}

function actChipsHTML(A, mode) {
  return `<div class="act-chips">${A.groups.map(g => `<button type="button" class="act-chip" data-x="act-chip" data-g="${esc(g.id)}" data-mode="${mode}" data-label="${esc(g.label)}" style="--tb:${g.color}" title="${esc(actTip(g))}"><i></i>${esc(g.label)}${mode === 'file' && g.items.length > 1 ? ` <span class="act-more" title="Ver os ${g.items.length} arquivos">+${g.items.length}</span>` : ''} <span class="faint">${fmtDur(g.ms)}</span></button>`).join('')}</div>`;
}

/* Pausas da sessão em caixinhas: o total, e dentro dele ócio, bloqueada, WhatsApp, Telegram e manual, com o tempo de cada um. */
function pauseChipsHTML(e) {
  const items = entryGaps(e).map(g => ({ key: g.why || 'manual', label: pauseLabel(g.why || 'manual'), ms: new Date(g.e) - new Date(g.s) })).filter(x => x.ms > 0);
  if (!items.length) return '';
  const total = items.reduce((t, x) => t + x.ms, 0);
  return `<div class="act-chips"><span class="act-chip act-chip-total" style="--tb:#64748B">Pausas <span class="faint">${fmtDur(total)}</span></span>${pauseBucketsOf(items).map(pauseBucketChip).join('')}</div>`;
}

/* Bloco da tela "Revisar sessão": uma faixa por programa e uma por arquivo. */
function actSectionHTML(e) {
  if (!actList(e.id).length) return '';
  const prog = actAnalyze(e.id, 'program'), file = actAnalyze(e.id, 'file');
  const sec = (title, mode, A) => `<div class="act-sec"><div class="row between"><span class="lbl">${title}</span></div>${actStripHTML(e, A, mode)}${actChipsHTML(A, mode)}</div>`;
  return `<div class="stack" style="gap:8px">${actSelBarHTML(e.id)}${sec('Por programa', 'program', prog)}${sec('Por arquivo / página', 'file', file)}<div class="act-sec"><div class="row between"><span class="lbl">Pausas</span></div>${pauseChipsHTML(e)}</div><span class="small muted">Passe o mouse para ver o tempo. Faixa hachurada = pausa. Clique num arquivo para desfazer, juntar versões ou mover para outro projeto.</span></div>`;
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
        ${g.items.map(i => `<label class="row between" style="cursor:pointer"><span class="row" style="gap:8px">${g.items.length > 1 ? `<input type="checkbox" data-sel="${esc(i.key)}">` : ''}<span>${esc(i.doc || i.app)}</span></span><span class="mono small">${fmtDur(i.ms)}</span></label>`).join('')}
        <div class="row between"><span class="lbl">Total</span><span class="mono small">${fmtDur(g.ms)}</span></div>
        ${g.items.length > 1 ? `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-x="act-split">Separar selecionados</button><button class="btn ghost" data-x="act-ungroup">Desfazer agrupamento</button></div>` : ''}
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
        else if (x === 'act-split') { const keys = [...ly.box.querySelectorAll('[data-sel]:checked')].map(c => c.dataset.sel); if (!keys.length) return toast('Marque os arquivos que quer separar.'); actSplit(keys); }
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

/* Move o tempo de um programa (das sessões dadas, em todos os trechos ou só nos marcados) para um projeto/tarefa. */
function openProgMove(entryIds, gid, label, opts = {}) {
  const ranges = opts.ranges && opts.ranges.length ? opts.ranges : null;
  const N = progMsOf(entryIds, gid, ranges);
  openLayer({
    render: () => `<div class="dh"><h2>${esc(label)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:10px">
        <div class="row between"><span class="lbl">${ranges ? 'Trechos marcados' : 'Todos os trechos'}</span><span class="mono small">${fmtDur(N)}</span></div>
        <div class="field"><label for="pm-proj">Mover para o projeto</label><select id="pm-proj" class="input"><option value="">Escolha um projeto</option>${tkProjectsSorted().map(p => `<option value="${esc(p.id)}">${esc(tkProjectLabel(p))}</option>`).join('')}</select></div>
        <div class="field"><label for="pm-task">Tarefa (opcional)</label><select id="pm-task" class="input" disabled><option value="">Sem tarefa</option></select></div>
        <div class="row" style="gap:8px"><button class="btn" data-x="pm-move">Mover</button><span class="small muted">${ranges ? 'Só os trechos marcados saem da sessão.' : 'Só o que aparece aqui, agora. Não se repete em outros trechos ou no futuro.'}</span></div>
      </div>
      <div class="df"><button class="btn" data-act="close-layer">Fechar</button></div>`,
    onMount: (ly) => {
      const proj = ly.box.querySelector('#pm-proj'), task = ly.box.querySelector('#pm-task');
      proj.addEventListener('change', () => {
        const tasks = proj.value ? db.where('tempo_tasks', t => t.project_id === proj.value) : [];
        task.innerHTML = `<option value="">Sem tarefa</option>${tasks.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}`;
        task.disabled = !proj.value;
      });
      ly.box.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-x="pm-move"]'); if (!b) return;
        if (!proj.value) return toast('Escolha um projeto.');
        if (!N) return toast('Nada para mover.');
        const dest = tkProjectLabel(db.get('tempo_projects', proj.value));
        const quem = ranges ? `Os trechos marcados de ${label}` : `Todo o tempo de ${label} nesta(s) sessão(ões)`;
        if (!await confirmBox({ title: 'Mover programa?', body: `${quem} vai para ${dest}.`, ok: 'Mover' })) return;
        let moved = 0;
        entryIds.forEach(id => { const g = actAnalyze(id, 'program').groups.find(x => x.id === gid); if (g && actMoveGroup(id, g, { project_id: proj.value, task_id: task.value || null }, ranges)) moved++; });
        if (!moved) return toast('Nada para mover.');
        toast('Tempo movido');
        ly.close(); opts.onDone && opts.onDone();
      });
    },
  });
}

/* Seleção de trechos na faixa "Por programa" (revisão ou resumo): arrastar marca trechos do programa. */
let ACT_SEL = null;   // { key, entryIds, gid, label, ranges: [{a,b}], drag, dragging, start, redraw, done }
const ACT_MIN_MS = 60000;
const actSelKey = (ids) => ids.join(',');
function actSelBarHTML(key) {
  if (!ACT_SEL || ACT_SEL.key !== key) return '';
  const tot = ACT_SEL.ranges.length ? progMsOf(ACT_SEL.entryIds, ACT_SEL.gid, ACT_SEL.ranges) : 0;
  return `<div class="res-sel-bar"><span class="small">Arraste sobre a faixa <b>Por programa</b> para marcar trechos de <b>${esc(ACT_SEL.label)}</b>.</span>
    <span class="mono small muted">${esc(ACT_SEL.label)} ${fmtDur(tot)} nesses trechos</span><span class="grow"></span>
    <button class="btn sm ghost" data-x="act-sel-cancel">Cancelar</button><button class="btn sm ghost" data-x="act-sel-clear">Limpar</button><button class="btn sm primary" data-x="act-sel-done" ${ACT_SEL.ranges.length ? '' : 'disabled'}>Concluir</button></div>`;
}
/* Faixa com vários dias/sessões (resumo cronológico) tem data-slices; faixa de uma sessão usa t0 e span. */
function resPctToMs(slices, pct) {
  const s = slices.find(x => pct >= x.l && pct <= x.l + x.w) || (pct < slices[0].l ? slices[0] : slices[slices.length - 1]);
  return s.st + (s.w > 0 ? Math.min(s.w, Math.max(0, pct - s.l)) / s.w : 0) * s.span;
}
const actStripTime = (st, x) => {
  const r = st.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (x - r.left) / r.width));
  if (st.dataset.slices) return resPctToMs(JSON.parse(st.dataset.slices), p * 100);
  return +st.dataset.t0 + p * +st.dataset.span;
};
/* Acrescenta um trecho marcado: só une com os vizinhos se houver sobreposição de fato (trechos colados continuam separados). */
function actAddRange(ranges, d) {
  const out = ranges.map(r => ({ ...r })).sort((p, q) => p.a - q.a);
  const hit = out.filter(r => r.a < d.b && d.a < r.b);
  if (!hit.length) return [...out, { ...d }].sort((p, q) => p.a - q.a);
  const a = Math.min(d.a, ...hit.map(r => r.a)), b = Math.max(d.b, ...hit.map(r => r.b));
  return out.filter(r => !hit.includes(r)).concat([{ a, b }]).sort((p, q) => p.a - q.a);
}
function actSelOverlays(key, slices) {
  if (!ACT_SEL || ACT_SEL.key !== key) return '';
  let out = '';
  ACT_SEL.ranges.concat(ACT_SEL.drag ? [ACT_SEL.drag] : []).forEach(r => slices.forEach(s => {
    const a = Math.max(r.a, s.st), b = Math.min(r.b, s.st + s.span); if (b <= a) return;
    out += `<span class="res-sel-range" style="left:${s.l + (a - s.st) / s.span * s.w}%;width:${Math.max(.3, (b - a) / s.span * s.w)}%"></span>`;
  }));
  return out;
}
document.addEventListener('mousedown', (ev) => {
  if (!ACT_SEL || ev.button !== 0) return;
  const st = ev.target.closest?.('.act-strip[data-mode="program"]'); if (!st || st.dataset.ent !== ACT_SEL.key) return;
  ev.preventDefault();
  const t = actStripTime(st, ev.clientX);
  ACT_SEL.dragging = true; ACT_SEL.start = t; ACT_SEL.drag = { a: t, b: t }; ACT_SEL.redraw();
});
document.addEventListener('mousemove', (ev) => {
  if (!ACT_SEL || !ACT_SEL.dragging) return;
  const st = document.querySelector(`.act-strip[data-mode="program"][data-ent="${ACT_SEL.key}"]`); if (!st) return;
  const t = actStripTime(st, ev.clientX);
  ACT_SEL.drag = { a: Math.min(ACT_SEL.start, t), b: Math.max(ACT_SEL.start, t) }; ACT_SEL.redraw();
});
document.addEventListener('mouseup', () => {
  if (!ACT_SEL || !ACT_SEL.dragging) return;
  ACT_SEL.dragging = false; const d = ACT_SEL.drag; ACT_SEL.drag = null;
  if (!d) { ACT_SEL.redraw(); return; }
  if (d.b - d.a < ACT_MIN_MS) console.log('[tempo-sel] arraste descartado (curto):', d.b - d.a, 'ms');
  else {
    const antes = ACT_SEL.ranges.length;
    ACT_SEL.ranges = actAddRange(ACT_SEL.ranges, d);
    if (ACT_SEL.ranges.length === antes) console.log('[tempo-sel] trecho unido a outro:', d);
  }
  ACT_SEL.redraw();
});
document.addEventListener('click', (ev) => {
  const b = ev.target.closest?.('[data-x^="act-sel-"]'); if (!b || !ACT_SEL) return;
  const x = b.dataset.x;
  if (x === 'act-sel-cancel') { const s0 = ACT_SEL; ACT_SEL = null; return s0.redraw(); }
  if (x === 'act-sel-clear') { ACT_SEL.ranges = []; return ACT_SEL.redraw(); }
  if (x === 'act-sel-done' && ACT_SEL.ranges.length) { const s0 = ACT_SEL; ACT_SEL = null; return openProgMove(s0.entryIds, s0.gid, s0.label, { ranges: s0.ranges, onDone: s0.done }); }
});
/* Menu do programa (clicar no chip ou num trecho): esse trecho, todos os trechos, selecionar trechos ou mudar cor.
   opts.seg: trecho clicado; opts.redraw: atualiza a tela; opts.done: depois de mover. */
function openProgChoice(entryIds, gid, label, opts = {}) {
  const seg = opts.seg || null;
  openLayer({
    render: () => `<div class="dh"><h2>${esc(label)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:8px">
        ${seg ? `<button class="btn" data-x="pc-seg">Esse trecho <span class="mono small muted">${fmtDur(seg.b - seg.a)}</span></button>` : ''}
        <button class="btn" data-x="pc-all">Todos os trechos de ${esc(label)} <span class="mono small muted">${fmtDur(progMsOf(entryIds, gid, null))}</span></button>
        <button class="btn" data-x="pc-sel">Selecionar trechos</button>
        <button class="btn ghost" data-x="pc-color">Mudar cor</button>
      </div>`,
    onMount: (ly) => ly.box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-x]'); if (!b) return;
      const x = b.dataset.x;
      ly.close();
      const done = opts.done || opts.redraw;
      if (x === 'pc-color') return openActColor(gid, label, opts.redraw);
      if (x === 'pc-seg') return openProgMove(entryIds, gid, label, { ranges: [seg], onDone: done });
      if (x === 'pc-all') return openProgMove(entryIds, gid, label, { onDone: done });
      if (x === 'pc-sel') { ACT_SEL = { key: actSelKey(entryIds), entryIds, gid, label, ranges: [], drag: null, dragging: false, start: 0, redraw: opts.redraw, done }; opts.redraw(); }
    }),
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
