// Paleta única dos gráficos (25/11): nada escuro, cores claras passam iguais, gráfico de linha da dica.
const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000; };

test('corGraf clareia as escuras, mantém as claras e cinza escuro vira cinza', () => {
  const { corGraf, GRAF_CORES } = load(['js/colors.js'], ['corGraf', 'GRAF_CORES']);
  ['#111827', '#2c1376', '#1E40AF', '#92400E', '#000000'].forEach(c => assert.ok(lum(corGraf(c)) > 120, `${c} → ${corGraf(c)} ainda escuro`));
  GRAF_CORES.forEach(c => assert.strictEqual(corGraf(c), c.toUpperCase()));
  const cinza = corGraf('#111827'); const n = parseInt(cinza.slice(1), 16);
  assert.ok(Math.max(n >> 16, n >> 8 & 255, n & 255) - Math.min(n >> 16, n >> 8 & 255, n & 255) < 50, 'cinza escuro não pode virar cor forte');
  assert.strictEqual(corGraf('var(--accent)'), 'var(--accent)');
  assert.strictEqual(corGraf(null), null);
});

test('a paleta inteira é clara o bastante para texto escuro por cima', () => {
  const { GRAF_CORES } = load(['js/colors.js'], ['GRAF_CORES']);
  GRAF_CORES.forEach(c => assert.ok(lum(c) > 140, c));
});

test('gráfico de linha da dica: SVG com um ponto por mês e valores escapados', () => {
  const m = load(['js/store.js', 'js/domain.js', 'js/charts-time.js'], ['linhaMiniSVG', 'tipGrafHTML'], { esc: (s) => String(s).replace(/</g, '&lt;'), fmtH: (v) => v + 'h', hexOf: (c) => c });
  const svg = m.linhaMiniSVG(['jan', 'fev', 'mar'], [100, 2500, 0], (v) => 'R$ ' + v);
  assert.strictEqual((svg.match(/<circle/g) || []).length, 3);
  assert.ok(svg.startsWith('<svg'));
  const tip = m.tipGrafHTML(JSON.stringify({ t: '<b>Moradia</b>', r: ['jan'], v: [10], u: 'R$' }));
  assert.ok(!tip.includes('<b>Moradia') && tip.includes('Moradia') && tip.includes('<svg'));
  assert.strictEqual(m.tipGrafHTML('não é json'), '');
});
