// engine-check.cjs // checks the cubes engine against the palette data beside it.
// From web/:  node checks/engine-check.cjs [app/cubes-engine.js] [art-palettes.json]
'use strict';
const fs = require('fs');
const path = require('path');
const enginePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app', 'cubes-engine.js'));
const dataPath = path.resolve(process.argv[3] || path.join(__dirname, '..', 'art-palettes.json'));
const E = require(enginePath);
const json = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
let failures = 0;
function check(name, ok, detail) { if (!ok) failures++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined && !ok ? ' ' + JSON.stringify(detail) : '')); }

// 1. The engine reads the data in its own order: the base, then each palette's featured colors.
const data = E.readPalettes(json);
check('the base is common then rare, in the file\'s order', data.base.join() === json.base.common.concat(json.base.rare).join().toUpperCase());
for (const id of E.PALETTE_IDS) {
  const p = json.palettes.find(x => x.id === id);
  check(`palette ${id} keeps the file's featured order`, !!p && data.palettes[id].featured.join() === p.featured.join().toUpperCase());
}

// 2. Data the engine cannot read is refused with a reason, never replaced.
const bad = {
  'version 2': j => { j.version = 2; },
  'a palette missing': j => { j.palettes = j.palettes.filter(p => p.id !== 'rainbow'); },
  'a color not #RRGGBB': j => { j.base.common[0] = 'white'; },
  'no base': j => { delete j.base; },
};
for (const [label, edit] of Object.entries(bad)) {
  const j = JSON.parse(JSON.stringify(json)); edit(j);
  let threw = '';
  try { E.readPalettes(j); } catch (e) { threw = e.message; }
  check(`refused: ${label}`, /^art-palettes\.json /.test(threw), threw);
}

// 3. The same seed makes the same work; the palette never moves a cube.
function work(seed, palette, n, mode) {
  const e = E.create({ seed, palettes: data });
  e.settings.palette = palette; if (mode) e.settings.mode = mode;
  e.generate(n, { active: true, x: 9, y: 8 });
  return e;
}
const a = work(2026, 'rainbow', 5000), b = work(2026, 'rainbow', 5000);
check('the same seed makes the same 5,000 cubes', JSON.stringify(a.snapshot().cubes) === JSON.stringify(b.snapshot().cubes));
const places = (e) => e.cubes.map(q => [q.c, q.r, q.k].join()).join(';');
const ref = places(work(7, 'muted-purple', 3000));
check('every palette puts the cubes in the same places', E.PALETTE_IDS.every(id => places(work(7, id, 3000)) === ref));
check('muted purple draws only base colors', work(11, 'muted-purple', 5000).cubes.every(q => data.base.includes(q.hex)));

// 4. Opacity: red and orange 209..239 of 255 at the default floor, every other color 96..223.
const rb = work(3, 'rainbow', 30000);
const level = (q) => Math.round(q.a * 255);
const solid = rb.cubes.filter(q => E.SOLID[q.hex]), other = rb.cubes.filter(q => !E.SOLID[q.hex]);
check('red and orange take 209 to 239', solid.length > 0 && Math.min(...solid.map(level)) >= 209 && Math.max(...solid.map(level)) <= 239, [Math.min(...solid.map(level)), Math.max(...solid.map(level))]);
check('every other color takes 96 to 223', Math.min(...other.map(level)) >= 96 && Math.max(...other.map(level)) <= 223, [Math.min(...other.map(level)), Math.max(...other.map(level))]);

// 5. The cap: a work holds at most 30,000 cubes, and none is removed.
const full = work(5, 'red-pink-cyan', 45000);
const before = JSON.stringify(full.snapshot().cubes);
const more = full.step(1000, null).length + full.generate(10, { active: true, x: 9, y: 8 }).length;
check('a work stops at 30,000 cubes and says it is full', E.CAP === 30000 && full.count === 30000 && full.full === true && more === 0, { count: full.count, more });
check('a full work keeps every cube it made', JSON.stringify(full.snapshot().cubes) === before);
const first = work(5, 'red-pink-cyan', 29999);
check('the first 29,999 cubes of a full work are the cubes made without reaching it', JSON.stringify(first.snapshot().cubes) === JSON.stringify(full.snapshot().cubes.slice(0, 29999)));

// 6. Clear and its undo put back the same work.
const c = work(9, 'ask-emphasis', 2000);
const kept = JSON.stringify(c.snapshot());
const undo = c.clear();
c.generate(100, { active: true, x: 9, y: 8 });
undo();
check('undo after clear restores the work exactly', JSON.stringify(c.snapshot()) === kept);

console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
