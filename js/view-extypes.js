/* Tipos de despesas: lista editável (nome, cor, mesclar, novo). Mesma lista usada em Despesas e no Financeiro. */
const EX_SPECIAL = ['Terapia', 'Estorno'];
const exAllKeys = () => Object.entries(EX_CATS).flatMap(([g, subs]) => subs.map(sub => `${g}/${sub}`));
function applyExCats() {
  const s = db.setting('exCats', null);
  if (s && typeof s === 'object') Object.keys(EX_CATS).forEach(k => delete EX_CATS[k]);
  if (s && typeof s === 'object') Object.assign(EX_CATS, s);
  BANK_CATS = [...Object.values(EX_CATS).flat(), ...EX_SPECIAL];
}
function saveExCats() { db.setSetting('exCats', EX_CATS); applyExCats(); db.emit(); }

function exTypesPanel() {
  const rows = Object.entries(EX_CATS).flatMap(([g, subs]) => subs.map(sub => {
    const key = `${g}/${sub}`;
    return `<div class="opt-row" style="grid-template-columns:28px minmax(0,240px) 1fr 110px">
      <button class="swatch fill" style="${cssTb(exColor(key))};flex:none" data-act="ex-color" data-key="${esc(key)}" title="Mudar cor" aria-label="Mudar cor"></button>
      <input class="input" value="${esc(sub)}" data-on="ex-ren" data-key="${esc(key)}" aria-label="Nome">
      <span class="small muted">${esc(EX_GROUP_LABEL[g] || g)}</span>
      <button class="btn sm" data-act="ex-merge" data-key="${esc(key)}">Mesclar</button>
    </div>`;
  })).join('');
  return `<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>Tipos de despesas</h3><span class="small muted">usados em Despesas, Financeiro PF/PJ e relatórios</span></div><div class="panel-b">${rows}
    <form class="row" style="margin:12px 0 0 28px;gap:8px" data-form="ex-add"><select class="input" name="g" style="max-width:120px"><option value="PESSOAL">PF</option><option value="EMPRESA">PJ</option></select><input class="input" style="max-width:300px" name="name" placeholder="Novo tipo de despesa" aria-label="Novo tipo"><button class="btn primary">${icon('plus')} Adicionar</button></form>
    <p class="small muted" style="margin:10px 0 0 28px">Mesclar junta este tipo com outro: os lançamentos passam para o tipo escolhido e este some da lista.</p></div></div>`;
}

// Renomear: troca o nome em todas as telas e nos lançamentos
CHANGES['ex-ren'] = async (el) => {
  const oldKey = el.dataset.key, [g, oldName] = oldKey.split('/'), name = el.value.trim();
  if (!name || name === oldName) return render();
  const arr = EX_CATS[g]; if (!arr) return;
  if (exAllKeys().includes(`${g}/${name}`)) { toast('Já existe um tipo com esse nome'); return render(); }
  EX_CATS[g] = arr.map(x => (x === oldName ? name : x));
  const cols = { ...(db.setting('ex_colors', {}) || {}) };
  if (cols[oldKey]) { cols[`${g}/${name}`] = cols[oldKey]; delete cols[oldKey]; db.setSetting('ex_colors', cols); }
  await exMigrate(`${g}/${oldName}`, `${g}/${name}`, oldName, name);
  saveExCats(); toast('Renomeado'); render();
};

// Mesclar: escolhe o tipo de destino e move os lançamentos
ACTIONS['ex-merge'] = (el) => {
  const from = el.dataset.key, [, fromName] = from.split('/');
  const targets = exAllKeys().filter(k => k !== from);
  let done = false;
  const l = openLayer({
    html: `<div class="dh"><h2>Mesclar “${esc(fromName)}” com:</h2></div><div class="db"><p class="small muted" style="margin:0">Os lançamentos de “${esc(fromName)}” passam para o tipo escolhido. Esta ação não se desfaz.</p>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:10px">${targets.map(k => `<button class="btn sm" data-t="${esc(k)}">${esc(k.split('/')[1])} <span class="faint small">${esc(EX_GROUP_LABEL[k.split('/')[0]] || '')}</span></button>`).join('')}</div></div>`,
  });
  l.box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-t]'); if (!b || done) return;
    done = true;
    const to = b.dataset.t, [, toName] = to.split('/');
    await exMigrate(from, to, fromName, toName);
    const [g] = from.split('/');
    EX_CATS[g] = EX_CATS[g].filter(x => x !== fromName);
    const cols = { ...(db.setting('ex_colors', {}) || {}) }; delete cols[from]; db.setSetting('ex_colors', cols);
    saveExCats(); l.close(); toast(`Mesclado em ${toName}`); render();
  });
};

// Move lançamentos de Despesas (cat = Grupo/Nome) e do extrato (category = nome)
async function exMigrate(oldKey, newKey, oldName, newName) {
  const c = db.adapter.client;
  await c.from('tempo_expenses').update({ cat: newKey, updated_at: new Date().toISOString() }).eq('cat', oldKey);
  await c.from('tempo_bank_txns').update({ category: newName, updated_at: new Date().toISOString() }).eq('category', oldName);
  const custom = db.setting('bankCats', []) || [];
  if (custom.includes(oldName)) db.setSetting('bankCats', custom.map(x => (x === oldName ? newName : x)));
  await bankLoadTxns();
}

