const test = require('node:test'), assert = require('node:assert');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/notices.js', 'utf8');
const m = src.match(/function todoHoraNorm\(x\) \{[\s\S]*?\n\}/)[0];
const pad = (n) => String(n).padStart(2, '0');
const todoHoraNorm = new Function('pad', m + '; return todoHoraNorm;')(pad);
test('hora digitada só com números', () => {
  assert.equal(todoHoraNorm('1300'), '13:00');
  assert.equal(todoHoraNorm('13:00'), '13:00');
  assert.equal(todoHoraNorm('930'), '09:30');
  assert.equal(todoHoraNorm('9:30'), '09:30');
  assert.equal(todoHoraNorm('13'), '13:00');
  assert.equal(todoHoraNorm('13h30'), '13:30');
  assert.equal(todoHoraNorm('2560'), '');
  assert.equal(todoHoraNorm(''), '');
});
