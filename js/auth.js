/* =====================================================================
   BANCO ONLINE (Supabase) + LOGIN
   SupabaseAdapter: mesmo contrato do MemoryAdapter (loadAll, insert,
   update, remove, replaceAll). As gravações entram numa fila guardada no
   aparelho, na ordem em que aconteceram (respeita as chaves estrangeiras);
   se a internet cair, a fila espera e tenta de novo até o banco confirmar.
   O RLS do banco garante que cada conta só enxerga as próprias linhas.
   ===================================================================== */

const SUPA_JSON_TABLES = { tempo_reminders: true }; // guardadas em uma coluna "data" (jsonb)
const SUPA_META = ['id', 'created_at', 'updated_at', 'user_id'];

const OUTBOX_KEY = 'tempo-outbox-v1';

class SupabaseAdapter {
  constructor(client) {
    this.client = client; this.name = 'supabase'; this.label = 'Banco online (Supabase)'; this.persistent = true;
    this.dropped = new Set();
    // fila de gravações: fica guardada no aparelho até o banco confirmar (sobrevive a queda de internet e a recarregar)
    this.outbox = this.loadOutbox(); this.pumping = null; this.waitT = null; this.attempt = 0; this.waiting = false;
    window.addEventListener('online', () => this.pump());
  }
  loadOutbox() {
    try { const a = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); return Array.isArray(a) ? a.map(op => ({ op })) : []; }
    catch (e) { return []; }
  }
  saveOutbox() { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox.map(x => x.op))); } catch (e) { /* sem armazenamento: a fila vale só nesta aba */ } }
  /* db.refresh espera esta promessa: resolve quando a fila esvazia ou para para tentar de novo depois. */
  get queue() { return this.pumping || Promise.resolve(); }
  flush() { return this.pump(); }
  write(op) {
    return new Promise((resolve, reject) => {
      // alterações seguidas da mesma linha (ex.: cronômetro sem internet) viram uma só na fila
      const last = this.outbox.length > 1 ? this.outbox[this.outbox.length - 1] : null;
      if (last && op.k === 'update' && last.op.k === 'update' && last.op.t === op.t && last.op.id === op.id) {
        Object.assign(last.op.body, op.body);
        const r0 = last.resolve, j0 = last.reject;
        last.resolve = (v) => { if (r0) r0(v); resolve(v); }; last.reject = (e) => { if (j0) j0(e); reject(e); };
      } else this.outbox.push({ op: { ...op, body: op.body ? { ...op.body } : undefined }, resolve, reject });
      this.saveOutbox(); this.pump();
    });
  }
  /* Falha de rede ou do servidor: tenta de novo. Recusa do banco (regra, coluna, permissão): não adianta repetir. */
  retryable(res) {
    const st = res.status, msg = String((res.error && res.error.message) || '');
    return !st || st === 401 || st === 408 || st === 429 || st >= 500 || /failed to fetch|networkerror|load failed|timeout|jwt expired/i.test(msg);
  }
  setWaiting(v) { if (this.waiting === v) return; this.waiting = v; try { db.emit(); } catch (e) { /* tela ainda não montada */ } }
  pump() {
    if (this.pumping) return this.pumping;
    clearTimeout(this.waitT);
    let hard = false;
    this.pumping = (async () => {
      while (this.outbox.length) {
        const item = this.outbox[0];
        let res;
        try { res = await this.exec(item.op); } catch (e) { res = { status: 0, error: { message: String((e && e.message) || e) } }; }
        if (res && res.error && this.retryable(res)) {
          this.attempt++; this.setWaiting(true);
          this.waitT = setTimeout(() => this.pump(), Math.min(60000, 3000 * 2 ** Math.min(this.attempt - 1, 5)));
          return;
        }
        this.outbox.shift(); this.saveOutbox(); this.attempt = 0;
        if (res && res.error) {
          hard = true;
          const err = this.explain(res, item.op);
          if (item.reject) item.reject(err); else console.warn('[Tempo] gravação recusada', err.message);
        } else if (item.resolve) item.resolve(res);
      }
      this.setWaiting(false);
    })().finally(() => {
      this.pumping = null;
      // o banco recusou algo: a tela pode estar mostrando o que não foi salvo. Busca a verdade de novo.
      if (hard && !this.outbox.length) setTimeout(() => { try { db.sig = null; db.refresh(); } catch (e) {} }, 300);
    });
    return this.pumping;
  }
  explain(res, op) {
    const msg = (res.error && res.error.message) || 'erro';
    // trava do banco: o mesmo horário não pode estar em duas sessões
    if (/tempo_sobreposto|sem_sobreposicao|exclusion/i.test(msg)) {
      setTimeout(() => { try { toast('Esse horário já está em outra sessão. Não salvei para não duplicar tempo.', { ms: 6000 }); } catch (e) {} });
      return new Error('Horário já ocupado por outra sessão');
    }
    const what = { insert: 'inserir', update: 'atualizar', remove: 'remover' }[op.k] || op.k;
    setTimeout(() => { try { toast(`Não consegui salvar (${what} em ${op.t.replace('tempo_', '')}). Recarreguei os dados do banco.`, { ms: 7000 }); } catch (e) {} });
    return new Error(`${what} ${op.t}: ${msg}`);
  }
  async exec(op) {
    const { k, t, id } = op, c = this.client;
    if (k === 'insert') {
      const body = SUPA_JSON_TABLES[t] ? { id, data: this.payload(t, op.body).data } : { id, ...this.payload(t, op.body) };
      const res = await c.from(t).insert(body);
      // repetição de um envio que já tinha chegado (resposta perdida): a linha já existe, está certo
      if (res.error && res.error.code === '23505' && /_pkey/.test(res.error.message || '')) return { status: 200 };
      return res;
    }
    if (k === 'update') {
      if (SUPA_JSON_TABLES[t]) {
        // tabela JSON: lê o conteúdo atual e mescla antes de gravar
        const cur = await c.from(t).select('data').eq('id', id).maybeSingle();
        if (cur.error) return cur;
        const merged = { ...((cur.data && cur.data.data) || {}), ...this.payload(t, op.body).data };
        return c.from(t).update({ data: merged }).eq('id', id);
      }
      const body = this.payload(t, op.body);
      if (!Object.keys(body).length) return { status: 204 };
      return c.from(t).update(body).eq('id', id);
    }
    if (k === 'remove') return c.from(t).delete().eq('id', id);
    return { status: 400, error: { message: 'operação desconhecida: ' + k } };
  }
  /* Só envia colunas que existem no banco. Campos extras de tabelas JSON vão para "data". */
  payload(t, row) {
    const cols = (window.DB_COLUMNS || {})[t] || [];
    if (SUPA_JSON_TABLES[t]) { const d = {}; Object.keys(row).forEach(k => { if (!SUPA_META.includes(k)) d[k] = row[k]; }); return { data: d }; }
    const o = {};
    Object.keys(row).forEach(k => {
      if (k === 'user_id') return;
      if (cols.includes(k)) o[k] = row[k];
      else if (!this.dropped.has(t + '.' + k)) {
        this.dropped.add(t + '.' + k); console.warn(`[Tempo] campo sem coluna no banco: ${t}.${k} (não será salvo)`);
        setTimeout(() => { try { toast(`Atenção: o campo "${k}" (${t.replace('tempo_', '')}) não foi salvo, falta a coluna no banco.`, { ms: 8000 }); } catch (e) {} });
      }
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
      const { data, error } = await this.client.from(t).select('*').order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + step - 1);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows = rows.concat(data || []);
      if (!data || data.length < step) break;
      from += step;
    }
    return rows.map(r => this.unpack(t, r));
  }
  /* Tabelas em paralelo: a abertura não espera uma por uma. */
  async fetchTables(list) {
    // uma tabela com problema não pode travar a leitura das outras: fica de fora e é tentada de novo na próxima vez
    const out = {};
    const got = await Promise.all(list.map(t => this.fetchAll(t).catch(e => { console.warn('ler', t, e.message); return undefined; })));
    list.forEach((t, i) => { if (got[i] !== undefined) out[t] = got[i]; });
    if (list.length && !Object.keys(out).length) throw new Error('Não consegui ler nenhuma tabela.');
    return out;
  }
  loadAll() { return this.fetchTables(TABLES); }
  /* Retrato leve do banco: por tabela, "quantidade|última alteração". Serve para baixar só o que mudou. */
  async syncState() {
    try { const { data, error } = await this.client.rpc('tempo_sync_state'); return error || !data ? null : data; }
    catch (e) { return null; }
  }
  insert(t, row) { return this.write({ k: 'insert', t, id: row.id, body: row }); }
  update(t, id, patch) { return this.write({ k: 'update', t, id, body: patch }); }
  remove(t, id) { return this.write({ k: 'remove', t, id }); }
  /* Restaurar backup: primeiro grava o backup por cima, só depois apaga o que sobrou.
     Se falhar no meio, os dados antigos continuam no banco. */
  async replaceAll(snap) {
    await this.queue;
    this.outbox.forEach(x => x.resolve && x.resolve(null)); this.outbox = []; this.saveOutbox();   // o backup substitui tudo: alterações pendentes perdem o sentido
    const c = this.client;
    const ok = (res, what) => { if (res && res.error) throw new Error(`${what}: ${res.error.message}`); return res; };
    const idsOf = async (t) => {
      let ids = [], from = 0;
      for (;;) { const { data } = ok(await c.from(t).select('id').order('id').range(from, from + 999), `ler ${t}`); ids = ids.concat((data || []).map(r => r.id)); if (!data || data.length < 1000) break; from += 1000; }
      return ids;
    };
    const dropExtras = async (t) => {
      const keep = new Set((snap[t] || []).map(r => r.id));
      const extra = (await idsOf(t)).filter(id => !keep.has(id));
      for (let i = 0; i < extra.length; i += 100) ok(await c.from(t).delete().in('id', extra.slice(i, i + 100)), `limpar ${t}`);
    };
    const put = async (t) => {
      const rows = snap[t] || [];
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map(r => SUPA_JSON_TABLES[t] ? { id: r.id, data: this.payload(t, r).data } : { id: r.id, ...this.payload(t, r) });
        ok(await c.from(t).upsert(chunk, { onConflict: 'id' }), `restaurar ${t}`);
      }
    };
    for (const t of TABLES) {
      // linha antiga que conflita com o backup (mesma chave, horário sobreposto): tira as sobras dessa tabela e tenta de novo
      try { await put(t); } catch (e) { await dropExtras(t); await put(t); }
    }
    for (const t of [...TABLES].reverse()) await dropExtras(t);
    return true;
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

