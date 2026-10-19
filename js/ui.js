/* =====================================================================
   INFRA DE INTERFACE — ícones, modais, toasts, confirmação, ações
   ===================================================================== */
const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>', chevR: '<path d="M9 6l6 6-6 6"/>', chevD: '<path d="M6 9l6 6 6-6"/>', chevU: '<path d="M6 15l6-6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  cols: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
  text: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  spin: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  arrowIn: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M3 12h11M10 8l4 4-4 4"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
};
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function tag(name, color, opts = {}) {
  if (!name) return '<span class="faint">—</span>';
  return `<span class="tag tg ${opts.pill ? 'pill' : ''} ${opts.upper ? 'upper' : ''}" style="${cssTb(color)}${opts.fg ? ';color:' + opts.fg : ''}">${esc(name)}</span>`;
}
/* cor da letra: opcional, guardada à parte (não entra na paleta). Sem escolha = padrão do tema. */
const partyFg = (kind, id) => (db.setting('textColors', {}) || {})[`${kind}:${id}`] || null;
function setPartyFg(kind, id, c) { const m = { ...(db.setting('textColors', {}) || {}) }; const k = `${kind}:${id}`; if (c) m[k] = c; else delete m[k]; db.setSetting('textColors', m); db.emit(); }
function statusTag(id, pill = true) { const s = db.get('tempo_status_options', id); return s ? tag(s.name, s.color, { pill }) : '<span class="faint">—</span>'; }
function wtTag(id) { const w = db.get('tempo_work_types', id); return w ? tag(w.name, w.color) : ''; }
function clientTag(c, opts = {}) {
  if (!c) return '<span class="faint">—</span>';
  const a = db.get('tempo_agencies', c.agency_id);
  return `<span class="ctag">${a && agencyAbbr(a) ? `<span class="tag tg abbr" style="${cssTb(a.color)}${partyFg('agency', a.id) ? ';color:' + partyFg('agency', a.id) : ''}" title="${esc(a.name)}">${esc(agencyAbbr(a))}</span>` : `<span class="tag tg abbr" style="background:var(--surface-2);color:var(--fg-3)" title="Cliente direto">&nbsp;&nbsp;</span>`}<span class="tag tg" style="${cssTb(c.color)}">${esc(c.name)}</span></span>`;
}
function agencyTag(a) { return a ? tag(a.name, a.color, { upper: true, fg: partyFg('agency', a.id) }) : '<span class="faint small">Direto</span>'; }

function options(list, selected, { empty, emptyLabel = '—', label = (x) => x.name, value = (x) => x.id } = {}) {
  let h = empty ? `<option value="">${esc(emptyLabel)}</option>` : '';
  list.forEach(x => { const v = value(x); h += `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(label(x))}</option>`; });
  return h;
}
const swatchPicker = colorPicker;

/* ---------- modal / drawer ---------- */
const layers = [];
function openLayer({ kind = 'modal', wide = false, html, onMount, onClose, render }) {
  const ov = document.createElement('div');
  ov.className = 'overlay' + (kind === 'modal' ? ' center' : '');
  const box = document.createElement('div');
  box.className = kind === 'modal' ? 'modal' + (wide ? ' wide' : '') : 'drawer';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  ov.appendChild(box); document.body.appendChild(ov);
  const layer = { ov, box, onClose, render, close: () => closeLayer(layer) };
  layers.push(layer);
  layer.refresh = () => { if (layer.render) { const st = box.querySelector('.db')?.scrollTop; box.innerHTML = layer.render(layer); const b = box.querySelector('.db'); if (b && st) b.scrollTop = st; onMount && onMount(layer); } };
  box.innerHTML = html || (render ? render(layer) : '');
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) layer.close(); });
  onMount && onMount(layer);
  setTimeout(() => { const f = box.querySelector('[autofocus]') || box.querySelector('input:not([type=hidden]),select,textarea'); if (f && kind === 'modal') f.focus(); }, 30);
  return layer;
}
function closeLayer(layer) {
  const i = layers.indexOf(layer); if (i < 0) return;
  layers.splice(i, 1); layer.ov.remove(); layer.onClose && layer.onClose();
}
const topLayer = () => layers[layers.length - 1];
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && layers.length) { topLayer().close(); } });

function confirmBox({ title, body, ok = 'Confirmar', danger = false }) {
  return new Promise(res => {
    let done = false;
    const l = openLayer({
      html: `<div class="dh"><h2>${esc(title)}</h2></div><div class="db"><div>${body}</div></div>
      <div class="df"><button class="btn" data-x="no">Cancelar</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-x="yes" autofocus>${esc(ok)}</button></div>`,
      onClose: () => { if (!done) res(false); }
    });
    l.box.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; done = true; res(b.dataset.x === 'yes'); l.close(); });
  });
}

function toast(msg, opts = {}) {
  let host = $('.toasts'); if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const t = document.createElement('div'); t.className = 'toast' + (opts.cls ? ' ' + opts.cls : '');
  t.innerHTML = msg;
  if (opts.actions) {
    const row = document.createElement('div'); row.className = 'row';
    opts.actions.forEach(a => { const b = document.createElement('button'); b.className = 'btn sm ' + (a.primary ? 'primary' : ''); b.textContent = a.label; b.onclick = () => { a.run(); t.remove(); }; row.appendChild(b); });
    t.appendChild(row);
  }
  host.appendChild(t);
  const plain = [...host.children].filter(x => !x.classList.contains('rem')); if (plain.length > 2) plain[0].remove();
  if (!opts.sticky) setTimeout(() => t.remove(), opts.ms || 2600);
  return t;
}

function formData(root) {
  const o = {};
  $$('input[name],select[name],textarea[name]', root).forEach(el => {
    if (el.type === 'checkbox') { if (el.dataset.multi) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked; }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.dataset.money !== undefined) o[el.name] = moneyVal(el);
    else o[el.name] = el.value;
  });
  return o;
}

/* ---------- ações por delegação ---------- */
const ACTIONS = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el, e);
});
const CHANGES = {};
document.addEventListener('change', (e) => { const el = e.target.closest('[data-on]'); if (el && CHANGES[el.dataset.on]) CHANGES[el.dataset.on](el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && CHANGES[el.dataset.input]) CHANGES[el.dataset.input](el, e); });

ACTIONS['pick-swatch'] = (el) => {
  const wrap = el.closest('.swatches'); $$('.swatch', wrap).forEach(s => s.classList.toggle('on', s === el));
  const inp = wrap.querySelector('input[type=hidden]'); inp.value = el.dataset.color; inp.dispatchEvent(new Event('change', { bubbles: true }));
};
ACTIONS['close-layer'] = () => topLayer()?.close();
