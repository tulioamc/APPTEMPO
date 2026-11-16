/* =====================================================================
   ATUALIZAÇÃO DA TELA SEM RECONSTRUIR (morph)
   As telas continuam sendo geradas como HTML, mas em vez de trocar tudo
   (innerHTML), comparamos o HTML novo com o que já está na página e
   mexemos só no que mudou. Com isso o campo em que você está digitando,
   o cursor, a rolagem e os menus abertos não se perdem quando a tela é
   redesenhada por um motivo que não foi você (sincronização, avisos...).

   Regras para campos (input, textarea, select):
   - redesenho por ação sua (clique, Enter, Esc, troca de valor): os campos
     voltam ao que o HTML diz, como sempre foi; só o campo em foco com id
     mantém o texto (a tela já contava com isso).
   - redesenho em segundo plano: o que você digitou fica; só muda o campo
     cujo valor o próprio app alterou.
   ===================================================================== */

let RENDER_USER = false;   // verdadeiro durante um clique, Enter, Esc, envio ou troca de valor feitos por você
function markUserAction() { RENDER_USER = true; clearTimeout(markUserAction.t); markUserAction.t = setTimeout(() => { RENDER_USER = false; }, 0); }
['click', 'submit', 'change', 'drop'].forEach(ev => document.addEventListener(ev, markUserAction, true));
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') markUserAction(); }, true);

const morphKey = (n) => n.nodeType === 1 ? (n.id || n.getAttribute('data-tid') || n.getAttribute('data-rid') || null) : null;
const morphSame = (o, n) => o.nodeType === n.nodeType && o.nodeName === n.nodeName && morphKey(o) === morphKey(n)
  && !(o.nodeName === 'INPUT' && o.getAttribute('type') !== n.getAttribute('type'));

/* Editor montado por JS dentro da tela (célula em edição): em segundo plano, não mexe nele. */
function morphKeepRoot() {
  const ae = document.activeElement; if (!ae || ae === document.body || !ae.closest) return null;
  if (ae.classList.contains('cell-input')) return ae.parentNode;
  return ae.closest('[data-morph-keep]');
}

function morphAttrs(o, n) {
  const oa = o.attributes;
  for (let i = oa.length - 1; i >= 0; i--) { const a = oa[i]; if (!n.hasAttribute(a.name)) o.removeAttribute(a.name); }
  const na = n.attributes;
  for (let i = 0; i < na.length; i++) {
    const a = na[i];
    if (o.getAttribute(a.name) !== a.value) { if (a.namespaceURI) o.setAttributeNS(a.namespaceURI, a.name, a.value); else o.setAttribute(a.name, a.value); }
  }
}
const morphSelIdx = (sel) => { const os = sel.options || []; for (let i = 0; i < os.length; i++) if (os[i].hasAttribute('selected')) return i; return -1; };

function morphNode(o, n, keep) {
  if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
  if (keep && keep === o) return;
  const tag = o.nodeName;
  const focused = o === document.activeElement;
  // em segundo plano o que foi digitado fica; por ação sua, só o campo em foco com id fica (como antes)
  const hold = RENDER_USER ? (focused && !!o.id) : true;
  if (tag === 'INPUT') {
    const type = (o.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      const was = o.hasAttribute('checked'), now = n.hasAttribute('checked');
      morphAttrs(o, n);
      if ((!hold || was !== now) && o.checked !== now) o.checked = now;
    } else if (type === 'file') { morphAttrs(o, n); }
    else {
      const was = o.getAttribute('value') || '', now = n.getAttribute('value') || '';
      morphAttrs(o, n);
      if ((!hold || (was !== now && !(focused && o.id))) && o.value !== now) o.value = now;
    }
    return;
  }
  if (tag === 'TEXTAREA') {
    const was = o.defaultValue, now = n.defaultValue;
    morphAttrs(o, n);
    if (was !== now) o.textContent = now;
    if ((!hold || (was !== now && !(focused && o.id))) && o.value !== now) o.value = now;
    return;
  }
  if (tag === 'SELECT') {
    const was = morphSelIdx(o), count = o.options.length, now = morphSelIdx(n);
    morphAttrs(o, n); morphChildren(o, n, keep);
    if (!hold || was !== now || count !== o.options.length) {
      let any = false;
      for (const op of o.options) { const s = op.hasAttribute('selected'); if (op.selected !== s) op.selected = s; any = any || s; }
      if (!any && !o.multiple && o.options.length) o.selectedIndex = 0;
    }
    return;
  }
  morphAttrs(o, n);
  morphChildren(o, n, keep);
}

function morphChildren(op, np, keep) {
  let o = op.firstChild, keyed = null;
  const kid = (x) => x.nodeName + '|' + morphKey(x);
  for (let n = np.firstChild; n;) {
    const next = n.nextSibling;
    let match = null;
    if (o && morphSame(o, n)) { match = o; if (keyed && morphKey(o)) keyed.delete(kid(o)); }
    else if (morphKey(n)) {
      // item com identidade (id, data-tid, data-rid): procura o mesmo item mais adiante e traz para cá
      if (!keyed) { keyed = new Map(); for (let c = o; c; c = c.nextSibling) if (morphKey(c)) keyed.set(kid(c), c); }
      const c = keyed.get(kid(n));
      if (c && c.parentNode === op && morphSame(c, n)) { keyed.delete(kid(n)); if (c !== o) op.insertBefore(c, o); match = c; }
    }
    if (match) { if (match === o) o = o.nextSibling; morphNode(match, n, keep); }
    else op.insertBefore(n, o);
    n = next;
  }
  while (o) { const nx = o.nextSibling; if (!(keep && keep === o)) op.removeChild(o); o = nx; }
}

/* Troca o conteúdo de `el` pelo `html`, mexendo só no que mudou. */
function morphInto(el, html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  morphChildren(el, tpl.content, RENDER_USER ? null : morphKeepRoot());
}
/* Usado pelo render(): se algo der errado, cai no jeito antigo (reconstrói). */
function paint(el, html, fresh) {
  if (!el) return;
  if (fresh || window.TEMPO_NO_MORPH) { el.innerHTML = html; return; }
  try { morphInto(el, html); } catch (e) { console.warn('[Tempo] morph falhou, reconstruindo', e); el.innerHTML = html; }
}
