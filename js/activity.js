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
const ACT_BROWSER_RE = /chrome|safari|edge|firefox|arc|brave|opera|vivaldi/i; /* registros de navegador são sites, não programas */
function actAnalyzeList(list0, mode) {
  // Terminal e Finder não têm arquivo nem pasta na análise (registros antigos podem ter guardado nome de usuário ou pasta): viram só o app
  // Programa: o navegador conta como programa (Chrome), além dos sites dentro dele. Arquivo: sem navegador (os sites ficam em Site).
const SYSTEM_WINDOW_RE = /^(save as|save|open|import|export|composition settings|composition settings\b|project settings|render settings|render queue|preferences|settings|new composition|new project|file info|document setup|print|page setup|font|color settings|output module|interpret footage|media encoder|dialog|window)$/i;
const list = list0.filter(x => mode === "site" ? ACT_BROWSER_RE.test(String(x.app || "")) : mode === "file" ? !ACT_BROWSER_RE.test(String(x.app || "")) : true).map(x => {
    if (/^(terminal|finder)$/i.test(String(x.app || ''))) return { ...x, doc: null, folder: null };
    const family = appFamily(x.app);
    if (family && SYSTEM_WINDOW_RE.test(String(x.doc || '').trim()) && !x.folder) return { ...x, doc: 'Janelas do sistema', folder: null, _systemWindow: family };
    return x;
  });
  if (!list.length) return { groups: [], records: [] };
  const info = {};
  list.forEach(x => { const k = actKeyOf(x); info[k] = info[k] || { key: k, app: x.app, doc: x.doc, folder: x.folder }; });
  const find = actRoots(Object.values(info));
  const links = db.setting('actLinks', {}) || {};
  const gidOf = (x) => {
    if (mode === "site") return "site:" + (String(x.doc || "").trim() || "(sem título)");
    if (mode === "program") return "p:" + toolAlias(x.app);
    const k = actKeyOf(x);
    if (links[k]) return links[k];
    if (x.doc === 'Janelas do sistema') return 'syswin:' + (appFamily(x.app) || 'Aplicativo');
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
  // Apps de sistema e de pouca utilidade (ajustes, fotos, extensões, Spotify, teclado...) viram a pasta "Outros".
  // Cada um continua com o próprio endereço, tempo e organização: só fica oculto nos chips e aparece ao abrir "Outros".
  const OTHERS_RE = /ajustes do sistema|system settings|system preferences|^fotos$|^photos$|itens de in[ií]cio|extens[õo]es|^notas$|^notes$|spotify|^teclado$|^keyboard$|armazenamento|^storage$|^rel[óo]gio$|^clock$|configura[çc][õo]es/i;
  // Também vão para "Outros" os que somam pouco (menos de 5 min), fora os 4 maiores de cada lista.
  let arr = Object.values(groups);
  const topIds = new Set([...arr].sort((a, b) => b.ms - a.ms).slice(0, 4).map(g => g.id));
  const isOther = (g) => { const its = Object.values(g.items); return its.length > 0 && (its.every(it => OTHERS_RE.test(String(it.app || '').trim())) || (!topIds.has(g.id) && g.ms < 5 * 60e3)); };
  const oth = arr.filter(isOther);
  if (oth.length) {
    const ids = new Set(oth.map(g => g.id));
    arr = arr.map(g => (ids.has(g.id) ? { ...g, parent: 'outros', hidden: true } : g));
    arr.push({ id: 'outros', items: oth.flatMap(g => Object.values(g.items)), ms: oth.reduce((t, g) => t + g.ms, 0) });
  }
  const sorted = arr.sort((a, b) => b.ms - a.ms).map((g, i) => {
    const items = Object.values(g.items).sort((a, b) => b.ms - a.ms);
    // Terminal: a janela não tem nome de arquivo útil (aparece com o nome de usuário), então aparece como "Terminal" e em cinza
    const termOnly = items.every(it => /^terminal$/i.test(String(it.app || '')));
    const nameOf = (it) => (/^terminal$/i.test(String(it.app || '')) ? 'Terminal' : (it.doc || it.app));
    const names = [...new Set(items.map(nameOf))];
    let label;
    if (mode === 'program') label = shortProgram(items[0].app);
    else if (String(g.id).startsWith('app:')) label = shortProgram(items[0].app);
    else if (String(g.id).startsWith('syswin:')) label = 'Janelas do sistema';
    else if (String(g.id).startsWith('pre:')) {
      const exts = [...new Set(items.map(it => (String(it.doc || '').match(/\.[^.]+$/) || [''])[0]))];
      label = docPre(items[0].doc) + (exts.length === 1 ? exts[0] : '');
    } else label = names.length <= 2 ? names.map(n => shortName(n)).join(' · ') : `${names.slice(0, 2).map(n => shortName(n)).join(' · ')} +${names.length - 2}`;
    if (g.id === 'outros') return { id: 'outros', items, ms: g.ms, label: 'Outros', color: '#94A3B8' };
    if (g.parent) return { id: g.id, items, ms: g.ms, label, color: groupColor(g.id, i), parent: g.parent, hidden: true };
    const color = termOnly ? '#374151' : groupColor(g.id, i);
    return { id: g.id, items, ms: g.ms, label, color };
  });
  // "Outros" fica sempre por último, em todas as listas e barras
  return { groups: [...sorted.filter(g => g.id !== 'outros'), ...sorted.filter(g => g.id === 'outros')], records };
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
    .map(p => ({ s: new Date(p.s).toISOString(), e: p.e === null ? null : new Date(p.e).toISOString(), ...(p.why ? { why: p.why } : {}), ...(p.movedTo ? { movedTo: p.movedTo } : {}) }))
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
    const g = [...actAnalyze(id, "program").groups, ...actAnalyze(id, "both").groups, ...actAnalyze(id, "site").groups].find(x => x.id === gid); if (!g) return sum;
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
    // o espaço entre os pedaços recebidos não é tempo deste projeto: guarda de onde era (a origem) e não entra em pausa nem no bruto
    moved.forEach((x, i) => { if (i < moved.length - 1 && new Date(moved[i + 1].s) > new Date(x.e)) { x.why = 'moved'; x.movedFrom = e.project_id; } });
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
// 1ª linha = nome do grupo + tempo total (vira o título da dica); depois, um arquivo por linha
const actTip = (g) => `${g.label} ${fmtDur(g.ms)}\n${g.items.map(i => {
  const name = i.doc && i.doc !== 'Janelas do sistema' ? i.doc : (i.doc || i.app);
  const path = i.folder ? ` · Caminho: ${i.folder}${i.doc ? '/' + i.doc : ''}` : '';
  return `${name}: ${fmtDur(i.ms)}${path}`;
}).join('\n')}`;

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

/* Espaço "fora" de um lançamento (trecho movido ou trabalho recebido), na faixa de qualquer tela. */
function actMovedSpanHTML(seg, x, w) {
  const recebido = !!seg.troca || (!seg.movedTo && !!seg.movedFrom);   // troca de projeto ou pedaços recebidos: o trabalho foi em outro projeto
  const idOutro = seg.movedTo || seg.movedFrom || '';
  const dst = db.get('tempo_projects', idOutro);
  const nome = dst ? tkProjectLabel(dst) : null;
  const cor = (dst && (clientOf(dst)?.color || dst.color)) || '#94A3B8';
  const texto = recebido ? 'Trabalho em ' + (nome || 'outro projeto') : (nome ? 'Movido → ' + nome : 'Movido');
  const dica = recebido ? texto + ' · clique para abrir'
    : (nome ? 'Movido para ' + nome + ' · clique para abrir'
      : 'Movido para [destino não registrado]\nObs.: este trecho está marcado como movido, mas o projeto de destino não ficou gravado. Abra a sessão para conferir ou refazer a movimentação.');
  return `<span class="act-moved" data-pid="${esc(idOutro)}" style="left:${x}%;width:${w}%;--mv:${esc(cor)}" data-tip="${esc(dica)}"></span>`;   // o texto aparece só no hover (data-tip)
}
/* Checkbox "Mostrar trabalho em outros projetos": aparece só se houver espaços "fora" nas sessões. Igual na revisão e no resumo. */
function actForaToggleHTML(ents) {
  if (!ents.some(e => (e.segments || []).some(x => x.why === 'moved'))) return '';
  return `<label class="row small" style="gap:6px;cursor:pointer"><input type="checkbox" data-x="act-fora-toggle" ${db.setting('actShowFora', true) ? 'checked' : ''}> Mostrar trabalho em outros projetos</label>`;
}
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
    if (b <= a || isForaWhy(segs[i - 1].why)) continue;
    pauses += `<span class="seg-b pausa act-pause" data-pk="${pauseKind(segs[i - 1].why || 'manual')}" style="--ph:${pauseHatch(segs[i - 1].why)};--pg:${pauseGapOf(pauseHatch(segs[i - 1].why))};left:${pct(a)}%;width:${Math.max(.3, pct(b) - pct(a))}%" data-tip="${esc(`Pausa ${hhmm(a)}–${hhmm(b)} · ${fmtDur(b - a)}\n${pauseWhy(segs[i - 1].why)}`)}"></span>`;
  }
  let bars = '';
  // trechos que saíram desta sessão para outro projeto: lacuna clicável com o destino
  const mostrarFora = db.setting('actShowFora', true);
  for (let i = 0; i < segs.length - 1 && mostrarFora; i++) {
    const a = e.segments[i].e, b = e.segments[i + 1].s;
    if (e.segments[i].why !== 'moved' || !a || !b || new Date(b) <= new Date(a)) continue;
    const x = pct(new Date(a).getTime()), y = pct(new Date(b).getTime());
    bars += actMovedSpanHTML(e.segments[i], x, Math.max(.3, y - x));
  }
  A.records.forEach(r => {
    const g = byId[r.gid]; if (!g) return;
    const x = pct(new Date(r.from).getTime()), y = pct(new Date(r.to).getTime());
    if (y <= x) return;
    bars += `<span class="seg-b fill act-b" data-g="${esc(g.id)}"${g.parent ? ` data-par="${esc(g.parent)}" data-tbc="${esc(g.color)}"` : ''} data-a="${new Date(r.from).getTime()}" data-b="${new Date(r.to).getTime()}" style="--tb:${g.parent ? '#94A3B8' : g.color};left:${x}%;width:${Math.max(.3, y - x)}%" data-tip="${esc(actTip(g))}"></span>`;
  });
  // trechos marcados para mover (seleção em andamento nesta sessão)
  if (mode === 'program' && ACT_SEL && ACT_SEL.key === e.id) {
    ACT_SEL.ranges.concat(ACT_SEL.drag ? [ACT_SEL.drag] : []).forEach(r => { const x = pct(r.a), y = pct(r.b); if (y > x) bars += `<span class="res-sel-range" style="left:${x}%;width:${Math.max(.3, y - x)}%"></span>`; });
  }
  return `<div class="act-strip" data-ent="${esc(e.id)}" data-mode="${mode}" data-t0="${t0}" data-span="${span}" style="position:relative">${pauses}${bars}</div>`;
}

const ACT_FV_MODES = ["file", "site", "both"];
const ACT_FV_LBL = { file: "Arquivo", site: "Site", both: "Arquivo / site" };
/* Arquivo e Site são dois botões liga/desliga; os dois ligados = "both" (padrão).
   Não deixa desligar os dois: clicar no único ligado não faz nada. */
const actFileView = () => { const v = db.setting('actFileView2', 'both'); return ACT_FV_MODES.includes(v) ? v : 'both'; };
ACTIONS["act-fview"] = (el) => {
  const on = { file: true, site: true }; const cur = actFileView();
  if (cur !== 'both') { on.file = cur === 'file'; on.site = cur === 'site'; }
  on[el.dataset.v] = !on[el.dataset.v];
  if (!on.file && !on.site) return;
  db.setSetting("actFileView2", on.file && on.site ? 'both' : on.file ? 'file' : 'site'); db.emit();
};
/* Itens que estão dentro do chip "Outros" (para o balãozinho do hover). */
function actOthMembersAttr(A) {
  const m = A.groups.filter(x => x.parent === 'outros').map(x => ({ l: x.label, ms: x.ms, c: x.color }));
  return m.length ? ` data-members="${esc(JSON.stringify(m))}"` : '';
}
function actChipsHTML(A, mode) {
  return `<div class="act-chips">${A.groups.filter(g => !g.hidden).map(g => `<button type="button" class="act-chip" data-x="act-chip"${g.id === 'outros' ? ' data-hl="outros"' + actOthMembersAttr(A) : ''} data-g="${esc(g.id)}" data-ms="${g.ms}" data-mode="${mode}" data-label="${esc(g.label)}" style="--tb:${g.color}" title="${esc(actTip(g))}"><i></i>${esc(g.label)}${mode !== "site" && g.items.length > 1 ? ` <span class="act-more" title="Ver os ${g.items.length} arquivos">+${g.items.length}</span>` : ''} <span class="faint">${fmtDur(g.ms)}</span></button>`).join('')}</div>`;
}

/* Pausas da sessão em caixinhas: o total, e dentro dele ócio, bloqueada, WhatsApp, Telegram e manual, com o tempo de cada um. */
function pauseChipsHTML(e) {
  const items = pauseGapsOf([e]).map(g => ({ key: g.why || 'manual', label: pauseLabel(g.why || 'manual'), ms: new Date(g.e) - new Date(g.s) })).filter(x => x.ms > 0);
  if (!items.length) return '';
  const total = items.reduce((t, x) => t + x.ms, 0);
  return `<div class="act-chips"><span class="act-chip act-chip-total" style="--tb:#64748B">Pausas <span class="faint">${fmtDur(total)}</span></span>${pauseBucketsOf(items).map(pauseBucketChip).join('')}</div>`;
}

/* Bloco da tela "Revisar sessão": uma faixa por programa e uma por arquivo. */
function actSectionHTML(e) {
  if (!actList(e.id).length) return '';
  const prog = actAnalyze(e.id, 'program');
  const sec = (title, mode, A) => `<div class="act-sec"><div class="row between"><span class="lbl">${title}</span></div>${actStripHTML(e, A, mode)}${actChipsHTML(A, mode)}</div>`;
  const fv = actFileView();
  const file = actAnalyze(e.id, fv);
  const fvBtns = ['file', 'site'].map(v => `<button class="btn sm ${fv === v || fv === 'both' ? 'primary' : ''}" data-act="act-fview" data-v="${v}" aria-pressed="${fv === v || fv === 'both'}">${ACT_FV_LBL[v]}</button>`).join('');
  const fileSec = `<div class="act-sec"><div class="row between"><span class="lbl">${ACT_FV_LBL[fv]}</span><span class="row" style="gap:4px">${fvBtns}</span></div>${actStripHTML(e, file, fv)}${actChipsHTML(file, fv)}</div>`;
  const toggle = actForaToggleHTML([e]);
  return `<div class="stack" style="gap:8px">${toggle}${actSelBarHTML(e.id)}${sec('Por programa', 'program', prog)}${fileSec}<div class="act-sec"><div class="row between"><span class="lbl">Pausas</span></div>${pauseChipsHTML(e)}</div><span class="small muted">Passe o mouse para ver o tempo. Faixa hachurada = pausa. Clique num arquivo para desfazer, juntar versões ou mover para outro projeto.</span></div>`;
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
  if (gid === 'outros') return openOthersPanel([entryId], 'both', onDone);
  const A = ["both", "site", "file"].map(m => actAnalyze(entryId, m)).find(x => x.groups.some(g => g.id === gid)) || actAnalyze(entryId, "both");
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
        entryIds.forEach(id => { const g = [...actAnalyze(id, "program").groups, ...actAnalyze(id, "both").groups, ...actAnalyze(id, "site").groups].find(x => x.id === gid); if (g && actMoveGroup(id, g, { project_id: proj.value, task_id: task.value || null }, ranges)) moved++; });
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
  if (gid === 'outros') return openOthersPanel(entryIds, 'program', opts.redraw);
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
let ACT_COLOR_CTX = null;   // quem abriu o seletor: a tela é redesenhada depois de escolher a cor
function openActColor(gid, label, onDone) {
  const l = openLayer({
    render: () => `<div class="dh"><h2>${esc(label)}</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db"><span class="lbl">Cor na linha do tempo</span>${actSwatches(gid)}</div>`,
    onMount: (ly) => ly.box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-x="act-color"]'); if (!b) return;
      actSetColor(gid, b.dataset.c); ly.close(); onDone && onDone();
    }),
  });
  ACT_COLOR_CTX = { onDone, layer: l };
}

/* Cor personalizada: o seletor de cor do sistema grava a cor do grupo e redesenha a tela. */
document.addEventListener('change', (ev) => {
  const i = ev.target.closest?.('input[data-x="act-custom"]'); if (!i || !i.dataset.g) return;
  actSetColor(i.dataset.g, i.value);
  toast('Cor aplicada');
  const ctx = ACT_COLOR_CTX; ACT_COLOR_CTX = null;
  if (ctx) { if (ctx.layer && ctx.layer.close) ctx.layer.close(); ctx.onDone && ctx.onDone(); }
});

/* Balãozinho do chip "Outros": ao passar o mouse, lista os itens de dentro (cada um com a cor original). */
let actOthPop = null;
document.addEventListener('mouseover', (e) => {
  const c = e.target.closest?.('[data-members]'); if (!c) return;
  let arr = []; try { arr = JSON.parse(c.dataset.members) || []; } catch (x) { arr = []; }
  if (!arr.length) return;
  if (!actOthPop) { actOthPop = document.createElement('div'); actOthPop.className = 'act-oth-pop'; document.body.appendChild(actOthPop); }
  actOthPop.innerHTML = arr.map(m => `<span class="act-chip" style="--tb:${esc(m.c)}"><i></i>${esc(m.l)} <span class="faint">${fmtDur(m.ms)}</span></span>`).join('');
  const r = c.getBoundingClientRect();
  actOthPop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 340)) + 'px';
  actOthPop.style.top = (r.bottom + 6) + 'px';
  actOthPop.style.display = 'flex';
});
document.addEventListener('mouseout', (e) => {
  if (!actOthPop) return; const c = e.target.closest?.('[data-members]'); if (!c) return;
  if (e.relatedTarget?.closest?.('[data-members]') === c) return;
  actOthPop.style.display = 'none';
});

/* Destaque: ao passar o mouse sobre um trecho ou chip, os outros grupos da mesma faixa esmaecem. */
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest?.('.act-b[data-g], .act-chip[data-g]'); if (!t || t.dataset.hl) return;
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
  return `<div class="stack" style="gap:10px;margin-bottom:14px">${sec('Por programa', 'program')}${sec('Por arquivo / página', 'both')}</div>`;
}


/* Seleção múltipla: Shift + clique num programa/arquivo (chips) marca vários e mostra a soma deles, com o % do total.
   Funciona igual na revisão, no resumo e onde houver chips de tempo. O clique sem Shift continua como antes. */
function actPickPaint(box) {
  const set = new Set((box.dataset.pick || '').split('|').filter(Boolean));
  const chips = [...box.querySelectorAll('[data-g][data-ms]')];
  chips.forEach(c => c.classList.toggle('is-pick', set.has(c.dataset.g)));
  const total = chips.reduce((t, c) => t + Number(c.dataset.ms || 0), 0);
  const picked = chips.filter(c => set.has(c.dataset.g)).reduce((t, c) => t + Number(c.dataset.ms || 0), 0);
  let sum = box.nextElementSibling && box.nextElementSibling.classList.contains('act-pick-sum') ? box.nextElementSibling : null;
  if (!set.size) { if (sum) sum.remove(); }
  else {
    if (!sum) { sum = document.createElement('div'); sum.className = 'act-pick-sum'; box.insertAdjacentElement('afterend', sum); }
    const names = chips.filter(c => set.has(c.dataset.g)).map(c => esc(c.dataset.label || '')).join(' + ');
    const pct = total > 0 ? ` · ${(picked / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total` : '';
    sum.innerHTML = `<span><b>${set.size} selecionado(s)</b>: ${names}</span><span class="mono">${fmtDur(picked)}${pct}</span><button type="button" class="btn sm ghost" data-pickclear>Limpar</button>`;
  }
  const root = box.parentElement || box;
  root.querySelectorAll('[data-g].act-b, .act-b[data-g]').forEach(b => b.classList.toggle('act-dim', set.size > 0 && !set.has(b.dataset.g)));
}
document.addEventListener('click', (ev) => {
  const clr = ev.target.closest && ev.target.closest('[data-pickclear]');
  if (clr) {
    ev.preventDefault(); ev.stopImmediatePropagation();
    const box = clr.closest('.act-pick-sum')?.previousElementSibling; if (box && box.classList.contains('act-chips')) { box.dataset.pick = ''; actPickPaint(box); }
    return;
  }
  if (!ev.shiftKey) return;
  const chip = ev.target.closest && ev.target.closest('.act-chip[data-g], [data-x="res-prog"][data-g]');
  if (!chip) return;
  const box = chip.closest('.act-chips'); if (!box) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const set = new Set((box.dataset.pick || '').split('|').filter(Boolean));
  const g = chip.dataset.g; if (set.has(g)) set.delete(g); else set.add(g);
  box.dataset.pick = [...set].join('|');
  actPickPaint(box);
}, true);

/* Painel "Outros": lista os apps dentro da pasta, cada um com o tempo e a opção de separar. */
function actOthersOf(entryIds, mode) {
  const recs = entryIds.flatMap(id => actList(id));
  return actAnalyzeList(recs, mode).groups.filter(g => g.parent === 'outros');
}
function openOthersPanel(entryIds, mode, redraw) {
  const mem = actOthersOf(entryIds, mode);
  const total = mem.reduce((t, g) => t + g.ms, 0);
  openLayer({
    render: () => `<div class="dh"><h2>Outros</h2><span class="grow"></span><button class="btn icon ghost" data-act="close-layer" aria-label="Fechar">${icon('x')}</button></div>
      <div class="db stack" style="gap:8px">
        <div class="row between small muted"><span>${mem.length} item(ns)</span><span class="mono">${fmtDur(total)}</span></div>
        ${mem.map(g => `<div class="row between"><span>${esc(g.label)}</span><span class="row" style="gap:10px"><span class="mono small">${fmtDur(g.ms)}</span><button class="btn sm ghost" data-x="oth-split" data-g="${esc(g.id)}">Separar</button></span></div>`).join('') || '<span class="muted small">Nada aqui.</span>'}
      </div>`,
    onMount: (ly) => ly.box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-x="oth-split"]'); if (!b) return;
      const g = mem.find(x => x.id === b.dataset.g); if (!g) return;
      actUngroup(g); toast(`${g.label} separado de Outros`); ly.close(); if (redraw) redraw();
    }),
  });
}


/* Destaque de pasta e de pausas agrupadas: ao passar o mouse no chip "Outros" ou "Pausa +N"/"WhatsApp",
   os trechos do grupo acendem nas próprias cores e o resto da faixa esmaece. Vale para revisão e resumo. */
function actHlPaint(root, tok, on) {
  root.querySelectorAll('.usage-sub').forEach(el => { el.style.background = on && el.dataset.par === tok ? el.dataset.tbc : ''; });
  root.querySelectorAll('.usage-subarc').forEach(el => el.setAttribute('stroke', on && el.dataset.par === tok ? el.dataset.tbc : '#CBD5E1'));
  root.querySelectorAll('.seg-b.act-b[data-g], .seg-b.pausa, .usage-seg[data-g], .prod-seg[data-g], .usage-arc[data-g]').forEach(el => {
    const isOth = tok === 'outros' && el.dataset.par === 'outros';
    const isPk = tok.startsWith('pk:') && el.dataset.pk === tok.slice(3);
    const isG = (el.classList.contains('usage-seg') || el.classList.contains('prod-seg') || el.classList.contains('usage-arc')) && el.dataset.g === tok;
    if (!on) { el.classList.remove('act-dim', 'act-hl'); if (el.dataset.tbc) el.style.setProperty('--tb', '#94A3B8'); return; }
    if (isOth || isPk || isG) { el.classList.add('act-hl'); el.classList.remove('act-dim'); if (isOth && el.dataset.tbc) el.style.setProperty('--tb', el.dataset.tbc); }
    else el.classList.add('act-dim');
  });
}
function actHlRoot(chip) {
  let n = chip;
  while (n && n.parentElement && !n.querySelector('.seg-b.act-b[data-g], .seg-b.pausa, .usage-seg[data-g], .prod-seg[data-g], .usage-arc[data-g]')) n = n.parentElement;
  return n || chip.parentElement;
}
document.addEventListener('mouseover', (e) => {
  const c = e.target.closest?.('[data-hl]'); if (!c) return;
  actHlPaint(actHlRoot(c), c.dataset.hl, true);
});
document.addEventListener('mouseout', (e) => {
  const c = e.target.closest?.('[data-hl]'); if (!c || (e.relatedTarget && c.contains(e.relatedTarget))) return;
  actHlPaint(actHlRoot(c), c.dataset.hl, false);
});

/* Padrão de gráficos: itens e chips com data-hk dentro de um [data-hkroot]. Passar o mouse acende o item de mesma
   chave (no gráfico e na legenda) e esmaece o resto. Shift + clique seleciona mais de um (como na timesheet): os
   escolhidos acendem, o resto esmaece e aparece a soma deles. Clique simples sem Shift limpa a seleção. */
const HK_PICKS = new WeakMap();
const HK_FMT = { dur: (v) => fmtDur(v), h: (v) => fmtH(v), money: (v) => fmtMoney0(v) };
const hkPicksOf = (root) => HK_PICKS.get(root) || new Set();
/* "Demais" (subs) e as fatias de rosca do Demais ganham a cor do programa agrupado quando a chave ativa é o Demais. */
function hkColorSubs(root, keys) {
  root.querySelectorAll('.usage-sub').forEach(el => { el.style.background = keys.has(el.dataset.par) ? el.dataset.tbc : ''; });
  root.querySelectorAll('.usage-subarc').forEach(el => el.setAttribute('stroke', keys.has(el.dataset.par) ? el.dataset.tbc : '#CBD5E1'));
}
function hkPaint(root, key, on) {
  if (hkPicksOf(root).size) return; /* com seleção, o hover não mexe */
  root.querySelectorAll('[data-hk]').forEach(el => { el.classList.toggle('hk-dim', on && el.dataset.hk !== key); el.classList.toggle('hk-hl', on && el.dataset.hk === key); });
  hkColorSubs(root, new Set(on ? [key] : []));
}
function hkRender(root) {
  const picks = hkPicksOf(root);
  root.querySelectorAll('[data-hk]').forEach(el => {
    const sel = picks.has(el.dataset.hk);
    el.classList.toggle('hk-pick', picks.size > 0 && sel);
    el.classList.toggle('hk-dim', picks.size > 0 && !sel);
    el.classList.remove('hk-hl');
  });
  hkColorSubs(root, picks);
  root.querySelectorAll(':scope > .hk-sum').forEach(x => x.remove());
  if (!picks.size) return;
  const seen = new Set(); let sum = 0, n = 0;
  root.querySelectorAll('[data-hkv][data-hk]').forEach(el => { if (picks.has(el.dataset.hk) && !seen.has(el.dataset.hk)) { seen.add(el.dataset.hk); sum += Number(el.dataset.hkv) || 0; n++; } });
  const tot = Number(root.dataset.hktot) || 0; const fmt = HK_FMT[root.dataset.hkfmt];
  const pct = (tot > 0 ? sum / tot * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const div = document.createElement('div'); div.className = 'hk-sum small';
  div.textContent = `${n} selecionado(s) · ${pct}${fmt ? ' · ' + fmt(sum) : ''}`;
  root.appendChild(div);
}
document.addEventListener('mouseover', (e) => { const c = e.target.closest?.('[data-hk]'); const root = c?.closest('[data-hkroot]'); if (c && root) hkPaint(root, c.dataset.hk, true); });
document.addEventListener('mouseout', (e) => { const c = e.target.closest?.('[data-hk]'); const root = c?.closest('[data-hkroot]'); if (c && root && !(e.relatedTarget && c.contains(e.relatedTarget))) hkPaint(root, c.dataset.hk, false); });
/* Só o Shift mexe na seleção. O clique simples segue a função que cada gráfico já tem. */
document.addEventListener('click', (e) => {
  if (!e.shiftKey) return;
  const c = e.target.closest?.('[data-hk]'); const root = c?.closest('[data-hkroot]');
  if (!c || !root) return;
  e.preventDefault();
  const set = new Set(hkPicksOf(root));
  if (set.has(c.dataset.hk)) set.delete(c.dataset.hk); else set.add(c.dataset.hk);
  HK_PICKS.set(root, set); hkRender(root);
});
