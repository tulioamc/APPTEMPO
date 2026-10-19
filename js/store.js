/* =====================================================================
   CAMADA DE DADOS
   ---------------------------------------------------------------------
   O app nunca fala direto com um banco. Ele usa o `db` abaixo, que guarda
   um cache em memória e repassa cada operação para um "adapter".

   - MemoryAdapter  → versão atual: não persiste nada (some ao recarregar).
   - HttpAdapter    → esqueleto para a próxima etapa: chama rotas /api/*
                      (Vercel Functions + Postgres/Neon ou Supabase).

   As tabelas têm os mesmos nomes do schema planejado (tempo_*), então trocar
   o adapter não muda nenhuma tela.
   ===================================================================== */

const TABLES = [
  'tempo_agencies', 'tempo_clients', 'tempo_projects', 'tempo_tasks',
  'tempo_time_entries', 'tempo_revisions', 'tempo_quotes', 'tempo_payments',
  'tempo_deadline_changes', 'tempo_work_types', 'tempo_status_options',
  'tempo_reminders', 'tempo_status_history', 'tempo_settings', 'tempo_notices', 'tempo_reimb_rows', 'tempo_expenses'
];

class MemoryAdapter {
  constructor() { this.name = 'memory'; this.label = 'Em memória'; this.persistent = false; }
  async loadAll() { return null; }            // nada salvo: começa do zero
  async insert(table, row) { return row; }
  async update(table, id, patch) { return patch; }
  async remove(table, id) { return true; }
  async replaceAll(snapshot) { return true; }
}

/* Próxima etapa (não ativo). Exemplo de contrato esperado na Vercel:
   GET    /api/data            → { tempo_projects:[...], ... }
   POST   /api/:table          → cria linha
   PATCH  /api/:table/:id      → atualiza
   DELETE /api/:table/:id      → remove
   Cada rota valida o usuário (auth) e filtra por user_id. */
class HttpAdapter {
  constructor(base = '/api') { this.base = base; this.name = 'http'; this.label = 'Banco online'; this.persistent = true; }
  async req(method, path, body) {
    const r = await fetch(this.base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'include' });
    if (!r.ok) throw new Error(`Falha ${r.status} em ${method} ${path}`);
    return r.status === 204 ? null : r.json();
  }
  loadAll() { return this.req('GET', '/data'); }
  insert(t, row) { return this.req('POST', `/${t}`, row); }
  update(t, id, patch) { return this.req('PATCH', `/${t}/${id}`, patch); }
  remove(t, id) { return this.req('DELETE', `/${t}/${id}`); }
  replaceAll(snap) { return this.req('PUT', '/data', snap); }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowISO = () => new Date().toISOString();
const clone = (o) => JSON.parse(JSON.stringify(o));

const db = {
  adapter: new MemoryAdapter(),
  data: {},
  listeners: new Set(),
  syncError: null,

  empty() { const d = {}; TABLES.forEach(t => d[t] = []); return d; },
  async init(adapter) {
    if (adapter) this.adapter = adapter;
    this.data = this.empty();
    try { const snap = await this.adapter.loadAll(); if (snap) TABLES.forEach(t => this.data[t] = snap[t] || []); }
    catch (e) { this.syncError = e.message; }
  },
  /* Busca do servidor de novo (sessões iniciadas em outro lugar, ex.: Chrome). Espera as gravações pendentes. */
  async refresh() {
    if (!this.adapter || !this.adapter.loadAll) return;
    try {
      if (this.adapter.queue) await this.adapter.queue;
      const snap = await this.adapter.loadAll(); if (!snap) return;
      TABLES.forEach(t => this.data[t] = snap[t] || []); this.emit();
    } catch (e) { /* sem rede: tenta de novo na próxima vez */ }
  },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.listeners.forEach(fn => fn()); },
  /* Envia ao adapter sem travar a interface; falhas aparecem na barra lateral. */
  push(p) { Promise.resolve(p).then(() => { if (this.syncError) { this.syncError = null; this.emit(); } }).catch(e => { this.syncError = e.message; this.emit(); }); },

  all(t) { return this.data[t]; },
  get(t, id) { return id ? this.data[t].find(r => r.id === id) || null : null; },
  where(t, fn) { return this.data[t].filter(fn); },
  insert(t, row, silent) {
    const r = { id: uid(), created_at: nowISO(), ...row };
    this.data[t].push(r); this.push(this.adapter.insert(t, r)); if (!silent) this.emit(); return r;
  },
  update(t, id, patch, silent) {
    const r = this.get(t, id); if (!r) return null;
    Object.assign(r, patch, { updated_at: nowISO() }); this.push(this.adapter.update(t, id, patch)); if (!silent) this.emit(); return r;
  },
  remove(t, id, silent) {
    const i = this.data[t].findIndex(r => r.id === id); if (i < 0) return;
    this.data[t].splice(i, 1); this.push(this.adapter.remove(t, id)); if (!silent) this.emit();
  },
  snapshot() { return clone(this.data); },
  restore(snap) { const d = this.empty(); TABLES.forEach(t => d[t] = Array.isArray(snap[t]) ? snap[t] : []); this.data = d; this.push(this.adapter.replaceAll(d)); this.emit(); },
  setting(key, fallback) { const s = this.data.tempo_settings.find(r => r.key === key); return s ? s.value : fallback; },
  setSetting(key, value) {
    const s = this.data.tempo_settings.find(r => r.key === key);
    if (s) this.update('tempo_settings', s.id, { value }); else this.insert('tempo_settings', { key, value });
  }
};
