/* =====================================================================
   BANCO ONLINE (Supabase) + LOGIN
   SupabaseAdapter: mesmo contrato do MemoryAdapter (loadAll, insert,
   update, remove, replaceAll). As gravações são enfileiradas, na ordem
   em que aconteceram, para respeitar as chaves estrangeiras.
   O RLS do banco garante que cada conta só enxerga as próprias linhas.
   ===================================================================== */

const SUPA_JSON_TABLES = { tempo_reminders: true }; // guardadas em uma coluna "data" (jsonb)
const SUPA_META = ['id', 'created_at', 'updated_at', 'user_id'];

class SupabaseAdapter {
  constructor(client) {
    this.client = client; this.name = 'supabase'; this.label = 'Banco online (Supabase)'; this.persistent = true;
    this.queue = Promise.resolve(); this.dropped = new Set();
  }
  enqueue(fn) { const p = this.queue.then(fn); this.queue = p.catch(() => {}); return p; }
  /* Só envia colunas que existem no banco. Campos extras de tabelas JSON vão para "data". */
  payload(t, row) {
    const cols = (window.DB_COLUMNS || {})[t] || [];
    if (SUPA_JSON_TABLES[t]) { const d = {}; Object.keys(row).forEach(k => { if (!SUPA_META.includes(k)) d[k] = row[k]; }); return { data: d }; }
    const o = {};
    Object.keys(row).forEach(k => {
      if (k === 'user_id') return;
      if (cols.includes(k)) o[k] = row[k];
      else if (!this.dropped.has(t + '.' + k)) { this.dropped.add(t + '.' + k); console.warn(`[Tempo] campo sem coluna no banco: ${t}.${k} (não será salvo)`); }
    });
    return o;
  }
  unpack(t, r) {
    if (SUPA_JSON_TABLES[t]) return { ...(r.data || {}), id: r.id, created_at: r.created_at, updated_at: r.updated_at };
    return r;
  }
  async fetchAll(t) {
    let rows = [], from = 0; const step = 1000;
    for (;;) {
      const { data, error } = await this.client.from(t).select('*').order('created_at', { ascending: true }).range(from, from + step - 1);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows = rows.concat(data || []);
      if (!data || data.length < step) break;
      from += step;
    }
    return rows.map(r => this.unpack(t, r));
  }
  async loadAll() {
    const out = {};
    for (const t of TABLES) out[t] = await this.fetchAll(t);
    return out;
  }
  check(res, what) {
    if (res && res.error) {
      // trava do banco: o mesmo horário não pode estar em duas sessões
      if (/tempo_sobreposto|sem_sobreposicao|exclusion/i.test(res.error.message || '')) { setTimeout(() => { try { toast('Esse horário já está em outra sessão. Não salvei para não duplicar tempo.', { ms: 6000 }); db.refresh(); } catch (e) {} }); throw new Error('Horário já ocupado por outra sessão'); }
      throw new Error(`${what}: ${res.error.message}`);
    }
    return res;
  }
  insert(t, row) {
    return this.enqueue(async () => {
      if (SUPA_JSON_TABLES[t]) return this.check(await this.client.from(t).insert({ id: row.id, data: this.payload(t, row).data }), `inserir ${t}`);
      return this.check(await this.client.from(t).insert({ id: row.id, ...this.payload(t, row) }), `inserir ${t}`);
    });
  }
  update(t, id, patch) {
    return this.enqueue(async () => {
      if (SUPA_JSON_TABLES[t]) {
        // tabela JSON: lê o conteúdo atual e mescla antes de gravar
        const cur = this.check(await this.client.from(t).select('data').eq('id', id).maybeSingle(), `ler ${t}`);
        const merged = { ...((cur && cur.data) || {}), ...this.payload(t, patch).data };
        return this.check(await this.client.from(t).update({ data: merged }).eq('id', id), `atualizar ${t}`);
      }
      const body = this.payload(t, patch);
      if (!Object.keys(body).length) return null;
      return this.check(await this.client.from(t).update(body).eq('id', id), `atualizar ${t}`);
    });
  }
  remove(t, id) {
    return this.enqueue(async () => this.check(await this.client.from(t).delete().eq('id', id), `remover ${t}`));
  }
  /* Usado ao restaurar um backup: apaga tudo do usuário e regrava na ordem correta. */
  replaceAll(snap) {
    return this.enqueue(async () => {
      for (const t of [...TABLES].reverse()) this.check(await this.client.from(t).delete().not('id', 'is', null), `limpar ${t}`);
      for (const t of TABLES) {
        const rows = snap[t] || [];
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map(r => SUPA_JSON_TABLES[t] ? { id: r.id, data: this.payload(t, r).data } : { id: r.id, ...this.payload(t, r) });
          this.check(await this.client.from(t).insert(chunk), `restaurar ${t}`);
        }
      }
      return true;
    });
  }
}

/* Tela de entrar. Resolve true quando há sessão ativa. */
function authGate(client) {
  return client.auth.getSession().then(({ data }) => {
    if (data && data.session) return true;
    const app = document.querySelector('.app'); if (app) app.style.display = 'none';
    const box = document.createElement('div'); box.id = 'login'; box.className = 'login-wrap';
    box.innerHTML = `<form class="login-card" id="login-form">
      <div class="login-brand">${'<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'}<b>Tempo</b></div>
      <label class="login-field">E-mail<input type="email" name="email" autocomplete="username" required></label>
      <label class="login-field">Senha<input type="password" name="password" autocomplete="current-password" required minlength="6"></label>
      <div class="login-msg" id="login-msg" role="alert"></div>
      <div class="login-actions"><button class="btn primary" type="submit" data-mode="in">Entrar</button><button class="btn ghost" type="button" id="login-up">Criar conta</button></div>
    </form>`;
    document.body.appendChild(box);
    return new Promise(resolve => {
      const form = box.querySelector('#login-form'), msg = box.querySelector('#login-msg');
      const run = async (mode) => {
        const email = form.email.value.trim(), password = form.password.value;
        msg.textContent = mode === 'up' ? 'Criando conta…' : 'Entrando…';
        const res = mode === 'up' ? await client.auth.signUp({ email, password }) : await client.auth.signInWithPassword({ email, password });
        if (res.error) { msg.textContent = res.error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : res.error.message; return; }
        if (mode === 'up' && !res.data.session) { msg.textContent = 'Conta criada. Confirme o e-mail e depois entre.'; return; }
        box.remove(); if (app) app.style.display = ''; resolve(true);
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); run('in'); });
      box.querySelector('#login-up').addEventListener('click', () => run('up'));
    });
  });
}

