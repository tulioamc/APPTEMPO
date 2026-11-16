// Carrega arquivos do app (scripts clássicos de navegador) num contexto isolado do Node, com o mínimo de "navegador" simulado.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function makeContext(extra = {}) {
  const store = {};
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, _store: store };
  const noop = () => {};
  const el = () => ({ addEventListener: noop, classList: { add: noop, remove: noop, contains: () => false }, style: {}, dataset: {}, querySelector: () => null, querySelectorAll: () => [], appendChild: noop, remove: noop });
  const document = { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, documentElement: el(), body: el(), activeElement: null, visibilityState: 'visible' };
  const window = { addEventListener: noop, removeEventListener: noop, localStorage, document, scrollTo: noop };
  const ctx = { window, document, localStorage, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop, crypto: require('crypto').webcrypto, Intl, navigator: { onLine: true }, location: { hash: '', origin: 'http://localhost' }, history: { replaceState: noop }, ...extra };
  ctx.globalThis = ctx; window.crypto = ctx.crypto;
  return vm.createContext(ctx);
}
/* Carrega os arquivos na ordem dada e devolve os nomes pedidos (const/let/function de topo). */
function load(files, names, extra) {
  const ctx = makeContext(extra);
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
    + `\n;globalThis.__out = {${names.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')}};`;
  vm.runInContext(src, ctx, { filename: files.join('+') });
  return { ctx, ...ctx.__out };
}
const iso = (s) => new Date(s).toISOString();
module.exports = { load, makeContext, ROOT, iso };
