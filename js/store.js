/* =====================================================================
   CAMADA DE DADOS
   ---------------------------------------------------------------------
   O app nunca fala direto com um banco. Ele usa o `db` abaixo, que guarda
   um cache em memória e repassa cada operação para um "adapter".

   - MemoryAdapter   → sem login: não persiste nada (dados de exemplo).
   - SupabaseAdapter → banco online (js/auth.js), com fila de gravação.

   As tabelas têm os mesmos nomes do schema planejado (tempo_*), então trocar
   o adapter não muda nenhuma tela.
   ===================================================================== */

const TABLES = [
  'tempo_agencies', 'tempo_clients', 'tempo_projects', 'tempo_tasks',
  'tempo_time_entries', 'tempo_revisions', 'tempo_quotes', 'tempo_payments',
  'tempo_deadline_changes', 'tempo_work_types', 'tempo_status_options',
  'tempo_reminders', 'tempo_status_history', 'tempo_settings', 'tempo_notices', 'tempo_reimb_rows', 'tempo_expenses', 'tempo_rafa_days', 'tempo_wa_contacts', 'tempo_wa_daily', 'tempo_invoices'
];

/* Retrato do banco só das tabelas que vieram: a que falhou fica sem assinatura e é lida de novo na próxima atualização. */
function sigLidas(sig, snap, pedidas = TABLES) {
  if (!sig) return sig;
  const out = { ...sig };
  // só esquece a assinatura da tabela que foi pedida e não veio (27/11: antes esquecia também as que nem foram pedidas
  // por não terem mudado, e a atualização seguinte baixava TODAS as tabelas de novo)
  Object.keys(out).forEach(t => { if (pedidas.includes(t) && !snap[t]) delete out[t]; });
  return out;
}

class MemoryAdapter {
  constructor() { this.name = 'memory'; this.label = 'Em memória'; this.persistent = false; }
  async loadAll() { return null; }            // nada salvo: começa do zero
  async insert(table, row) { return row; }
  async update(table, id, patch) { return patch; }
  async remove(table, id) { return true; }
  async replaceAll(snapshot) { return true; }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowISO = () => new Date().toISOString();
const clone = (o) => JSON.parse(JSON.stringify(o));

/* Desfazer (Ctrl+Z / ⌘Z): cada alteração de dados vira uma operação inversa na pilha.
   Configurações (tempo_settings) ficam de fora: são preferências de tela, não lançamentos. */
const UNDO_SKIP = new Set(['tempo_settings', 'tempo_notices', 'tempo_reminders', 'tempo_status_history']);
/* Do que fica de fora, entra no desfazer só o que é trabalho de planejamento: blocos fixados, bloqueios, ajustes de rotina e
   de dia, faixas, entregas (configurações) e to-dos. Mexer no Calendário nunca é definitivo (24/11). */
const UNDO_SETTINGS = new Set(['planoPins', 'planoBloqueios', 'planoRotinaDia', 'planoRotina', 'planoFaixaFix', 'planoDias', 'projEntregas']);
const undoEntra = (t, row) => !UNDO_SKIP.has(t) || (t === 'tempo_settings' && !!row && UNDO_SETTINGS.has(row.key)) || (t === 'tempo_notices' && !!row && row.kind === 'todo');
const UNDO_MAX = 80;
const undoStack = [];
let undoing = false;
/* Grupo: tudo o que uma ação do Calendário muda (ex.: prazo + histórico + bloco) vira UM passo do desfazer. */
let undoGrupo = null;
const undoPush = (op, row) => {
  if (undoing || !undoEntra(op.t, row)) return;
  if (undoGrupo) { op.g = undoGrupo.id; op.r = undoGrupo.rotulo; }
  undoStack.push(op); if (undoStack.length > UNDO_MAX) undoStack.shift();
};

const CACHE_KEY = 'tempo-cache-v1';
const db = {
  adapter: new MemoryAdapter(),
  data: {},
  listeners: new Set(),
  syncError: null,

  empty() { const d = {}; TABLES.forEach(t => d[t] = []); return d; },
  async init(adapter) {
    if (adapter) this.adapter = adapter;
    this.data = this.empty();
    // mostra já o último retrato salvo neste aparelho; o servidor atualiza logo depois
    const cached = this.loadCache();
    if (cached && this.onCache) { try { this.onCache(); } catch (e) { /* segue: a tela completa vem depois */ } }
    try {
      // alterações que ficaram na fila da última vez vão primeiro, para o retrato do banco já vir com elas
      if (this.adapter.flush) await this.adapter.flush();
      const sig = this.adapter.syncState ? await this.adapter.syncState() : null;
      const snap = await this.adapter.loadAll();
      if (snap) {
        // ainda há alterações sem enviar: o retrato deste aparelho é o mais novo, fica com ele
        if (!(cached && this.unsent())) { TABLES.forEach(t => { if (snap[t]) this.data[t] = snap[t]; }); this.sig = sigLidas(sig, snap); this.saveCache(); }
        this.loaded = true;
      }
    } catch (e) { if (!cached) this.syncError = e.message; }
  },
  loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY); if (!raw) return false;
      const snap = JSON.parse(raw); TABLES.forEach(t => this.data[t] = Array.isArray(snap[t]) ? snap[t] : []);
      return true;
    } catch (e) { return false; }
  },
  saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(this.data)); }
    catch (e) { try { localStorage.removeItem(CACHE_KEY); } catch (e2) { /* sem armazenamento: segue sem cache */ } }
  },
  /* Depois de cada alteração, guarda o retrato no aparelho (com folga, para agrupar várias seguidas). */
  saveCacheSoon() { clearTimeout(this.cacheT); this.cacheT = setTimeout(() => this.saveCache(), 1500); },
  /* Quantas alterações ainda não chegaram ao banco. */
  unsent() { return (this.adapter && this.adapter.outbox && this.adapter.outbox.length) || 0; },
  /* Busca do servidor de novo (mudanças feitas em outro aparelho). Espera as gravações pendentes.
     Pergunta primeiro o que mudou (um pedido leve) e baixa só as tabelas alteradas. */
  async refresh() {
    if (!this.adapter || !this.adapter.loadAll) return;
    try {
      const seq = this.writes || 0;
      if (this.adapter.queue) await this.adapter.queue;
      if (this.unsent()) return;   // há alterações sem enviar: não troca o retrato local por um mais antigo
      const sig = this.adapter.syncState ? await this.adapter.syncState() : null;
      const tables = sig && this.sig ? TABLES.filter(t => sig[t] !== this.sig[t]) : TABLES;
      if (!tables.length) { this.loaded = true; return; }
      // 27/11: tabela que só ganhou/alterou linhas → baixa só essas linhas e junta; se o total não bater (algo foi apagado), baixa a tabela inteira
      const parcial = {}, inteiras = [];
      if (sig && this.sig && this.adapter.fetchSince) {
        await Promise.all(tables.map(async t => {
          const [nAnt, eAnt] = String(this.sig[t] || '').split('|'); const [nNovo] = String(sig[t] || '').split('|');
          if (!eAnt || !Array.isArray(this.data[t]) || this.data[t].length !== Number(nAnt)) { inteiras.push(t); return; }
          try {
            const novas = await this.adapter.fetchSince(t, new Date(Number(eAnt) * 1000 - 1000).toISOString());
            const m = new Map(this.data[t].map(r => [r.id, r])); novas.forEach(r => m.set(r.id, r));
            const junto = [...m.values()];
            if (junto.length !== Number(nNovo)) inteiras.push(t); else parcial[t] = junto;
          } catch (e) { inteiras.push(t); }
        }));
      } else inteiras.push(...tables);
      const cheio = inteiras.length ? (this.adapter.fetchTables ? await this.adapter.fetchTables(inteiras) : await this.adapter.loadAll()) : {}; if (!cheio) return;
      const snap = { ...cheio, ...parcial };
      // se alguém gravou durante a busca, o retrato do servidor pode ser antigo: descarta e deixa para a próxima
      if ((this.writes || 0) !== seq || this.pending > 0 || this.unsent()) return;
      tables.forEach(t => { if (snap[t]) this.data[t] = snap[t]; }); if (sig) this.sig = sigLidas(sig, snap, tables); this.loaded = true; this.saveCache(); this.emit();
    } catch (e) { /* sem rede: tenta de novo na próxima vez */ }
  },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.ver = (this.ver || 0) + 1; this.listeners.forEach(fn => fn()); },
  /* Envia ao adapter sem travar a interface; falhas aparecem na barra lateral. */
  push(p) {
    this.writes = (this.writes || 0) + 1; this.pending = (this.pending || 0) + 1; this.saveCacheSoon();
    Promise.resolve(p).then(() => { if (this.syncError) { this.syncError = null; this.emit(); } }).catch(e => { this.syncError = e.message; this.emit(); }).finally(() => { this.pending--; });
  },

  all(t) { return this.data[t]; },
  get(t, id) { return id ? this.data[t].find(r => r.id === id) || null : null; },
  where(t, fn) { return this.data[t].filter(fn); },
  insert(t, row, silent) {
    const r = { id: uid(), created_at: nowISO(), ...row };
    if (t === 'tempo_tasks' && !r.owner) r.owner = 'Túlio';   // responsável padrão de tarefa nova
    if (t === 'tempo_time_entries' && !r.work_type_id && (r.task_id || r.project_id)) {   // sessão nova: tipo da tarefa (ou da mãe) ou do projeto
      const tk = r.task_id ? (this.data.tempo_tasks || []).find(x => x.id === r.task_id) : null;
      const mae = tk?.parent_id ? (this.data.tempo_tasks || []).find(x => x.id === tk.parent_id) : null;
      const pj = r.project_id ? (this.data.tempo_projects || []).find(x => x.id === r.project_id) : null;
      r.work_type_id = tk?.work_type_id || mae?.work_type_id || pj?.work_type_id || null;
    }
    if (t === 'tempo_tasks' && !r.work_type_id && r.project_id) {   // tarefa nova herda o tipo de trabalho do projeto (ou da tarefa mãe)
      const mae = r.parent_id ? (this.data.tempo_tasks || []).find(x => x.id === r.parent_id) : null;
      const pj = (this.data.tempo_projects || []).find(x => x.id === r.project_id);
      r.work_type_id = mae?.work_type_id || pj?.work_type_id || null;
    }
    this.data[t].push(r); undoPush({ k: 'insert', t, id: r.id }, r); this.push(this.adapter.insert(t, r)); if (!silent) this.emit(); return r;
  },
  update(t, id, patch, silent) {
    const r = this.get(t, id); if (!r) return null;
    const prev = {}; ['updated_at', ...Object.keys(patch)].forEach(k => { prev[k] = r[k] === undefined ? null : clone(r[k]); });
    if (!(t === 'tempo_time_entries' && r.state === 'running')) undoPush({ k: 'update', t, id, prev }, r);   // o cronômetro atualiza sozinho: não entra no desfazer
    Object.assign(r, patch, { updated_at: nowISO() }); this.push(this.adapter.update(t, id, patch)); if (!silent) this.emit(); return r;
  },
  remove(t, id, silent) {
    const i = this.data[t].findIndex(r => r.id === id); if (i < 0) return;
    undoPush({ k: 'remove', t, row: clone(this.data[t][i]) }, this.data[t][i]);
    this.data[t].splice(i, 1); this.push(this.adapter.remove(t, id)); if (!silent) this.emit();
  },
  /* Desfaz a última alteração (ou o grupo inteiro de uma ação do Calendário). Devolve false se não há nada a desfazer. */
  undo() {
    const op = undoStack.pop(); if (!op) return false;
    const grupo = [op]; while (op.g && undoStack.length && undoStack[undoStack.length - 1].g === op.g) grupo.push(undoStack.pop());
    undoing = true;
    try {
      grupo.forEach(o => {
        if (o.k === 'insert') { this.remove(o.t, o.id, true); }
        else if (o.k === 'update') {
          const r = this.get(o.t, o.id); if (r) { Object.assign(r, o.prev); this.push(this.adapter.update(o.t, o.id, o.prev)); }
        } else if (o.k === 'remove') { this.data[o.t].push(o.row); this.push(this.adapter.insert(o.t, o.row)); }
      });
    } finally { undoing = false; }
    this.emit(); return true;
  },
  /* Rótulo do que o próximo desfazer desfaz (null se não há nada). */
  desfazerRotulo() { const op = undoStack[undoStack.length - 1]; return op && op.r ? op.r : null; },   // só ações agrupadas (Calendário): o botão do cabeçalho nunca desfaz coisa de outra tela
  /* Roda `fn` como UMA ação desfazível. Se `fn` der erro no meio, tudo o que ela já tinha mudado volta como estava. */
  agrupar(rotulo, fn) {
    if (undoGrupo) return fn();
    undoGrupo = { id: uid(), rotulo }; const n0 = undoStack.length;
    try { return fn(); }
    catch (e) { const g = undoGrupo.id; undoGrupo = null; while (undoStack.length > n0 && undoStack[undoStack.length - 1].g === g) this.undo(); throw e; }
    finally { undoGrupo = null; }
  },
  snapshot() { return clone(this.data); },
  restore(snap) { const d = this.empty(); TABLES.forEach(t => d[t] = Array.isArray(snap[t]) ? snap[t] : []); this.data = d; this.push(this.adapter.replaceAll(d)); this.emit(); },
  setting(key, fallback) { const s = this.data.tempo_settings.find(r => r.key === key); return s ? s.value : fallback; },
  setSetting(key, value) {
    this.setRev = (this.setRev || 0) + 1;   // a lista única de atividade (activity.js) se refaz quando muda
    const s = this.data.tempo_settings.find(r => r.key === key);
    if (s) this.update('tempo_settings', s.id, { value }); else this.insert('tempo_settings', { key, value });
  }
};
