/* =====================================================================
   CORES DAS ETIQUETAS
   O usuário escolhe sempre o tom CLARO; o tom escuro (texto da etiqueta,
   contorno) e a versão do tema escuro são derivados no CSS (color-mix).
   Predefinidas nunca somem; personalizadas existem enquanto algum item usar.
   ===================================================================== */
const PRESET_COLORS = [
  ['#D9DCE2', 'Cinza'], ['#E6CDB9', 'Areia'], ['#F7C6A0', 'Laranja'], ['#F4DE8C', 'Amarelo'],
  ['#CFE59A', 'Lima'], ['#AEDFC0', 'Verde'], ['#A6DCD7', 'Turquesa'], ['#AFCBF3', 'Azul'],
  ['#C2C5F6', 'Índigo'], ['#D6C1F2', 'Roxo'], ['#F2BAD4', 'Rosa'], ['#F2B3AC', 'Vermelho']
];
const LEGACY_COLOR = { gray: '#D9DCE2', brown: '#E6CDB9', orange: '#F7C6A0', yellow: '#F4DE8C', green: '#AEDFC0', blue: '#AFCBF3', purple: '#D6C1F2', pink: '#F2BAD4', red: '#F2B3AC', teal: '#A6DCD7', lime: '#CFE59A', indigo: '#C2C5F6' };
const COLORS = PRESET_COLORS.map(c => c[0]);
const COLOR_NAMES = Object.fromEntries(PRESET_COLORS);
function hexOf(c) { if (!c) return '#D9DCE2'; if (c[0] === '#') return c.toUpperCase(); return LEGACY_COLOR[c] || '#D9DCE2'; }
const cssTb = (c) => `--tb:${hexOf(c)}`;
const presetAt = (i) => COLORS[i % COLORS.length];

/* conversões para gerar variações (cor do cliente a partir da agência) */
function hexToHsl(hex) {
  const n = parseInt(hexOf(hex).slice(1), 16); let r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255).toString(16).padStart(2, '0');
  return ('#' + f(0) + f(8) + f(4)).toUpperCase();
}
/* variação: gira o matiz e ajusta levemente a luminosidade, evitando repetir cores dos irmãos */
function colorVariant(base, taken = []) {
  const [h, s, l] = hexToHsl(base);
  const steps = [22, -22, 44, -44, 66, -66, 11, -11];
  for (const d of steps) { const c = hslToHex(h + d, Math.max(.35, s), Math.min(.86, Math.max(.76, l))); if (!taken.map(hexOf).includes(c)) return c; }
  return hslToHex(h + 30, s, l);
}
/* cores personalizadas = todas as cores em uso que não são predefinidas */
function customColorsInUse() {
  const used = new Set();
  ['tempo_agencies', 'tempo_clients', 'tempo_work_types', 'tempo_status_options'].forEach(t => db.all(t).forEach(r => { if (r.color) used.add(hexOf(r.color)); }));
  return [...used].filter(c => !COLORS.includes(c));
}

function colorPicker(name, current) {
  const cur = hexOf(current); const customs = customColorsInUse(); if (!COLORS.includes(cur) && !customs.includes(cur)) customs.push(cur);
  const sw = (c, title) => `<button type="button" class="swatch fill ${c === cur ? 'on' : ''}" style="${cssTb(c)}" data-act="pick-swatch" data-color="${c}" title="${title}" aria-label="${title}"></button>`;
  return `<div class="swatches" role="radiogroup">${COLORS.map(c => sw(c, COLOR_NAMES[c])).join('')}
    ${customs.length ? `<span class="sw-sep" aria-hidden="true"></span>${customs.map(c => sw(c, 'Personalizada ' + c)).join('')}` : ''}
    <label class="swatch swatch-add" title="Escolher outra cor">+<input type="color" value="${cur.toLowerCase()}" data-color-free aria-label="Escolher outra cor"></label>
    <input type="hidden" name="${name}" value="${cur}"></div>`;
}
document.addEventListener('input', (e) => {
  const inp = e.target.closest?.('[data-color-free]'); if (!inp) return;
  const wrap = inp.closest('.swatches'); const hex = inp.value.toUpperCase();
  $$('.swatch.on', wrap).forEach(s => s.classList.remove('on'));
  let sw = $$('.swatch[data-color]', wrap).find(s => s.dataset.color === hex);
  if (!sw) { sw = document.createElement('button'); sw.type = 'button'; sw.className = 'swatch fill'; sw.dataset.act = 'pick-swatch'; sw.dataset.color = hex; sw.style.cssText = cssTb(hex); sw.title = 'Personalizada ' + hex; inp.closest('label').before(sw); }
  sw.classList.add('on');
  const h = wrap.querySelector('input[type=hidden]'); h.value = hex; h.dispatchEvent(new Event('change', { bubbles: true }));
});

/* popover de cor (usado nas listas de preferências) */
function openColorPop(anchor, current, onPick) {
  $('.colorpop')?.remove();
  const pop = document.createElement('div'); pop.className = 'colormenu colorpop';
  pop.innerHTML = colorPicker('c', current);
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect(); pop.style.top = (r.bottom + window.scrollY + 6) + 'px'; pop.style.left = Math.max(8, Math.min(window.innerWidth - 300, r.left + window.scrollX)) + 'px';
  pop.addEventListener('change', (e) => { if (e.target.name === 'c') { onPick(e.target.value); } });
  pop.addEventListener('click', (e) => { const sw = e.target.closest('[data-act="pick-swatch"]'); e.stopPropagation(); if (sw) { e.preventDefault(); ACTIONS['pick-swatch'](sw); setTimeout(() => pop.remove(), 60); } });
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
}

/* ---------- siglas das agências ---------- */
function abbrFor(name, excludeId) {
  const L = (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'AG';
  const used = new Set(db.all('tempo_agencies').filter(a => a.id !== excludeId).map(a => (a.abbr || '').toUpperCase()));
  for (let i = 1; i < L.length; i++) { const c = L[0] + L[i]; if (!used.has(c)) return c; }
  for (let i = 2; i < 10; i++) { const c = L[0] + i; if (!used.has(c)) return c; }
  return L.slice(0, 2);
}
const agencyAbbr = (a) => a ? (a.abbr || a.name.slice(0, 2).toUpperCase()) : '';

/* aparência (fica aqui para carregar antes de app.js) */
const ACCENTS = {
  cobalto: ['#2E43D6', '#7487FF'], verde: ['#1D7A4A', '#5CCB8E'], laranja: ['#C2560F', '#F59A5B'],
  rosa: ['#C42E78', '#F07DB5'], roxo: ['#6B3FD0', '#A98BFF'], grafite: ['#2F3542', '#C9CED9']
};
const FONTS = {
  sonoma: ['BR Sonoma (se instalada no aparelho)', '"BR Sonoma", "Manrope", -apple-system, BlinkMacSystemFont, sans-serif'],
  manrope: ['Manrope', '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif'],
  sora: ['Sora', '"Sora", -apple-system, BlinkMacSystemFont, sans-serif'],
  system: ['Fonte do sistema (SF Pro no Mac/iPhone)', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif']
};
const DEFAULT_RADIUS = 10;
