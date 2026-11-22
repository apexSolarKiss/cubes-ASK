/* =========================================================================
   cubes-engine.js // cubes-ASK: the work, the color sampler, the renderer

   PRODUCT CODE. Everything in this file knows about cubes; nothing in it knows
   about the page, the controls, the view or the save machinery. It has no
   DOM dependency: give it a Canvas 2D context and a pixel size and it draws.

   The work is a list of cubes on one unbounded lattice. A frame (square, 4:3,
   widescreen, or whatever shape the window has) is a viewfinder onto that
   lattice: 18 grid units on its short side, centered on the middle of the
   widescreen field. So a resize, a frame change or a save re-draws the same
   work at another size; nothing is regenerated, and a cube outside a narrower
   frame is hidden, not deleted.

   Geometry and tempo follow the two Python versions (isometric_cubes_v1.py,
   isometric_cubes_v2.py): grid unit u = short side / 18 (60 px at 1080 high),
   lattice spacing u*cos(30deg) by u, five radii at quarter units, one
   translucent fill, a hexagon outline and three spokes.

   The colors are design-system-ASK's artwork palettes (art-palettes.json),
   handed in by the page. How often each color is drawn, its opacity, the
   ground and the edges are this product's.
   ========================================================================= */
(function (root) {
  'use strict';

  var COS30 = Math.cos(Math.PI / 6);
  var SHORT = 18;                // every frame is 18 grid units on its short side
  var CENTER_X = 16;             // frames are centered on the middle of the
  var CENTER_Y = 9;              //   32 x 18 widescreen field, as in the Python
  var RADII = [0.25, 0.5, 0.75, 1, 1.25];
  var ALPHA_LO = 96;             // Python: random(3, 7) * 32, on a 0..255 scale:
  var ALPHA_HI = 224;            //   whole values 96..223
  /* ASK: red and orange must not go transparent, but keep some range. They
     take whole values from the `solidFloor` setting up to 239 (94%). */
  var SOLID = { '#FA3838': true, '#FF8000': true };
  var SOLID_HI = 240;
  /* A work holds at most this many cubes. At the cap it is full: no cube is
     added and none is removed, so the picture stays exactly as it was made. */
  var CAP = 30000;
  var REFERENCE_STROKE_UNITS = 1 / 60;   // Python: 1 px at a 60 px grid unit

  /* Fixed physical values. The canvas is not theme-responsive. */
  var EDGE = '#6A637F';                               // DS --ask-fg-light
  var GROUND_FROM = '#D4C6E1';                        // DS light gradient, bottom-left
  var GROUND_TO = '#E2D3F0';                          // DS light gradient, top-right

  /* The palettes this product offers, by their ids in art-palettes.json, in
     the order the page shows them. The data file supplies their colors. */
  var PALETTE_IDS = ['muted-purple', 'ask-emphasis', 'rainbow', 'red-pink-cyan'];
  var DATA_VERSION = 1;
  var HEX = /^#[0-9A-Fa-f]{6}$/;

  var DEFAULTS = {
    mode: 'field',            // 'field' | 'pointer'
    palette: 'muted-purple',  // a palette id
    /* Share of picks from the muted-purple base, per palette with featured colors. */
    base: { 'ask-emphasis': 0.8, 'rainbow': 0.5, 'red-pink-cyan': 0.8 },
    darkEach: 0.05,           // share of the base taken by EACH rarer color
    rate: 60,                 // cubes per second
    spread: 3,                // pointer mode: +/- lattice cells in each axis
    edgeWeight: 1,            // 1 = the Python stroke (1 px at 1080 high)
    solidFloor: 0.82          // red and orange: lowest opacity (their highest is 239 of 255)
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* Read art-palettes.json (already parsed) into what the sampler uses, or
     throw an Error that says what is wrong. Order is kept exactly: a seeded
     work picks colors by index, so order is part of the artwork. */
  function readPalettes(data) {
    function fail(why) { throw new Error('art-palettes.json ' + why); }
    function colors(list, where, allowEmpty) {
      if (!Array.isArray(list)) fail('has no color list for ' + where);
      if (!allowEmpty && !list.length) fail('has an empty color list for ' + where);
      return list.map(function (value) {
        if (typeof value !== 'string' || !HEX.test(value)) fail('has a color that is not #RRGGBB in ' + where);
        return value.toUpperCase();
      });
    }
    if (!data || typeof data !== 'object') fail('is not a JSON object');
    if (data.version !== DATA_VERSION) fail('is version ' + data.version + '; this page reads version ' + DATA_VERSION);
    if (!data.base || typeof data.base !== 'object') fail('has no base');
    var common = colors(data.base.common, 'base.common', false);
    var rare = colors(data.base.rare, 'base.rare', true);
    if (!Array.isArray(data.palettes)) fail('has no palettes list');
    var byId = Object.create(null);
    data.palettes.forEach(function (p) {
      if (p && typeof p.id === 'string') byId[p.id] = p;
    });
    var palettes = Object.create(null);
    PALETTE_IDS.forEach(function (id) {
      if (!byId[id]) fail('has no palette "' + id + '"');
      palettes[id] = { id: id, label: String(byId[id].label || id), featured: colors(byId[id].featured, id, true) };
    });
    return { version: data.version, common: common, rare: rare, base: common.concat(rare), palettes: palettes, order: PALETTE_IDS.slice() };
  }

  /* mulberry32: small, fast, seedable. Two streams per work (placement, color)
     so a palette change never moves a cube. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    return (Math.floor(Math.random() * 4294967296)) >>> 0;
  }

  /* The frame for an aspect (width / height), in grid units. */
  function frameOf(aspect) {
    var w = aspect >= 1 ? SHORT * aspect : SHORT;
    var h = aspect >= 1 ? SHORT : SHORT / aspect;
    return { left: CENTER_X - w / 2, right: CENTER_X + w / 2, top: CENTER_Y - h / 2, bottom: CENTER_Y + h / 2, width: w, height: h };
  }

  function create(options) {
    options = options || {};
    var settings = JSON.parse(JSON.stringify(DEFAULTS));
    var data = null;          // readPalettes() result; nothing is made until it is set
    var cubes = [];
    var seed = 0;
    var placeRng = null;
    var colorRng = null;
    var generated = 0;        // cubes made since the last clear
    var carry = 0;            // fractional cubes owed by the clock
    var aspect = 16 / 9;      // the frame new full-field cubes are spread across

    function reseed(next) {
      seed = (next == null ? randomSeed() : next) >>> 0;
      placeRng = mulberry32(seed);
      colorRng = mulberry32((seed ^ 0x9E3779B9) >>> 0);
    }

    /* ---- color ---------------------------------------------------------- */

    /* The base: the common colors share what the rarer ones leave, equally;
       each rarer color takes `darkEach`. */
    function pickBase(x) {
      var nMain = data.common.length, nRare = data.rare.length;
      if (!nRare) return data.common[Math.min(nMain - 1, Math.floor(x * nMain))];
      var dark = clamp(settings.darkEach, 0, 1 / nRare);
      var main = (1 - nRare * dark) / nMain;
      if (x < nMain * main) return data.base[Math.min(nMain - 1, Math.floor(x / main))];
      return data.base[nMain + Math.min(nRare - 1, Math.floor((x - nMain * main) / dark))];
    }

    /* Always two draws from the color stream, whichever pool wins, so the
       stream stays aligned across palettes and slider positions. */
    function pickColor() {
      var a = colorRng(), b = colorRng();
      var palette = data.palettes[settings.palette] || data.palettes[PALETTE_IDS[0]];
      var featured = palette.featured;
      var share = featured.length ? clamp(settings.base[palette.id], 0, 1) : 1;
      if (a < share) return pickBase(b);
      return featured[Math.min(featured.length - 1, Math.floor(b * featured.length))];
    }

    /* ---- placement ------------------------------------------------------ */

    /* Always four draws from the placement stream per cube. */
    function makeCube(pointer) {
      var u1 = placeRng(), u2 = placeRng(), u3 = placeRng(), u4 = placeRng();
      var c, r;
      if (settings.mode === 'pointer') {
        var reach = Math.max(0, Math.round(settings.spread));
        var c0 = Math.round(pointer.x / COS30);
        var r0 = Math.round(pointer.y);
        c = c0 + Math.floor(u1 * (2 * reach + 1)) - reach;
        r = r0 + Math.floor(u2 * (2 * reach + 1)) - reach;
      } else {
        /* From the last lattice line at or before each near edge to the first
           at or after each far edge. At 16:9 that is columns 0..37 and rows
           0..18, as in the Python. */
        var f = frameOf(aspect);
        var cMin = Math.floor(f.left / COS30 + 1e-9);
        var cMax = Math.ceil(f.right / COS30 - 1e-9);
        var rMin = Math.floor(f.top + 1e-9);
        var rMax = Math.ceil(f.bottom - 1e-9);
        c = cMin + Math.floor(u1 * (cMax - cMin + 1));
        r = rMin + Math.floor(u2 * (rMax - rMin + 1));
      }
      var k = Math.min(RADII.length - 1, Math.floor(u3 * RADII.length));
      var hex = pickColor();
      /* The same draw, u4, sets the opacity of every cube; red and orange map it
         into their own narrower, higher range. */
      var lo = ALPHA_LO, hi = ALPHA_HI;
      if (SOLID[hex]) {
        lo = clamp(Math.round(clamp(settings.solidFloor, 0, 1) * 255), ALPHA_LO, SOLID_HI - 1);
        hi = SOLID_HI;
      }
      var level = lo + Math.min(hi - lo - 1, Math.floor(u4 * (hi - lo)));
      var alpha = level / 255;
      var rgb = hexToRgb(hex);
      return { c: c, r: r, k: k, a: alpha, hex: hex, f: 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha.toFixed(4) + ')' };
    }

    /* Make up to n cubes, never past the cap. */
    function make(n, pointer) {
      var fresh = [];
      if (!data) return fresh;
      n = Math.min(n, CAP - cubes.length);
      for (var i = 0; i < n; i++) {
        if (settings.mode === 'pointer' && !(pointer && pointer.active)) break;
        var cube = makeCube(pointer);
        cubes.push(cube);
        fresh.push(cube);
      }
      generated += fresh.length;
      return fresh;
    }

    /* ---- drawing -------------------------------------------------------- */

    /* The DS light gradient, placed as CSS places `linear-gradient(45deg, ...)`
       on a box of this size: bottom-left corner to top-right corner. */
    function paintGround(ctx, width, height) {
      var half = (width + height) / 4;
      var g = ctx.createLinearGradient(width / 2 - half, height / 2 + half, width / 2 + half, height / 2 - half);
      g.addColorStop(0, GROUND_FROM);
      g.addColorStop(1, GROUND_TO);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    function drawList(ctx, list, width, height) {
      var scale = Math.min(width, height) / SHORT;     // pixels per grid unit
      var left = CENTER_X - (width / scale) / 2;       // lattice x at the frame's left edge
      var top = CENTER_Y - (height / scale) / 2;       // lattice y at the frame's top edge
      var weight = Math.max(0, settings.edgeWeight) * REFERENCE_STROKE_UNITS * scale;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = weight;
      ctx.strokeStyle = EDGE;
      for (var i = 0; i < list.length; i++) {
        var cube = list[i];
        var R = RADII[cube.k] * scale;
        var cx = (cube.c * COS30 - left) * scale;
        var cy = (cube.r - top) * scale;
        var dx = R * COS30, dy = R / 2;
        if (cx + dx + weight < 0 || cx - dx - weight > width) continue;
        if (cy + R + weight < 0 || cy - R - weight > height) continue;
        ctx.beginPath();
        ctx.moveTo(cx + dx, cy - dy);                  // up-right
        ctx.lineTo(cx + dx, cy + dy);                  // down-right
        ctx.lineTo(cx, cy + R);                        // bottom
        ctx.lineTo(cx - dx, cy + dy);                  // down-left
        ctx.lineTo(cx - dx, cy - dy);                  // up-left
        ctx.lineTo(cx, cy - R);                        // top
        ctx.closePath();
        ctx.fillStyle = cube.f;
        ctx.fill();
        if (weight > 0) {
          ctx.moveTo(cx, cy); ctx.lineTo(cx + dx, cy - dy);
          ctx.moveTo(cx, cy); ctx.lineTo(cx - dx, cy - dy);
          ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + R);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* ---- the engine object ---------------------------------------------- */

    var engine = {
      settings: settings,

      get seed() { return seed; },
      get count() { return cubes.length; },
      get generated() { return generated; },
      get full() { return cubes.length >= CAP; },
      get ready() { return !!data; },
      get palettes() { return data; },
      get cubes() { return cubes; },
      get aspect() { return aspect; },

      /* Hand in the result of readPalettes(). Until then the engine makes no cube. */
      usePalettes: function (next) { data = next; },

      /* The frame new full-field cubes are spread across (width / height). */
      setAspect: function (next) {
        if (next > 0 && isFinite(next)) aspect = next;
      },

      /* Advance the clock by dtMs and return the cubes made (already added to
         the work). `pointer` is { active, x, y } in grid units, or null. A long
         gap is clamped, so a hidden tab never repays a backlog. A full work
         makes nothing. */
      step: function (dtMs, pointer) {
        if (settings.mode === 'pointer' && !(pointer && pointer.active)) { carry = 0; return []; }
        if (!(dtMs > 0)) dtMs = 0;                          // also catches NaN
        carry += Math.min(dtMs, 100) * Math.max(0, settings.rate) / 1000;
        var n = Math.floor(carry);
        carry -= n;
        if (n > 240) n = 240;
        if (cubes.length >= CAP) carry = 0;
        return make(n, pointer);
      },

      /* Make up to n cubes now (tests, and filling a still image). */
      generate: function (n, pointer) {
        return make(n, pointer);
      },

      /* Start a fresh work. Keeps the settings. Returns a function that puts
         the previous work back exactly as it was, random streams included. */
      clear: function (nextSeed) {
        var before = { cubes: cubes, seed: seed, placeRng: placeRng, colorRng: colorRng, generated: generated };
        cubes = [];
        generated = 0;
        carry = 0;
        reseed(nextSeed);
        return function undo() {
          cubes = before.cubes; seed = before.seed; placeRng = before.placeRng; colorRng = before.colorRng;
          generated = before.generated; carry = 0;
        };
      },

      /* Draw the whole work, ground included, into a context of this pixel
         size. The frame is width / height. This is the function the
         instrument pattern calls for the screen and for every save. */
      render: function (ctx, width, height) {
        paintGround(ctx, width, height);
        drawList(ctx, cubes, width, height);
      },

      /* Draw only these cubes on top of what is already there. */
      draw: function (ctx, list, width, height) {
        drawList(ctx, list, width, height);
      },

      /* A point given as fractions of the frame (0..1 across, 0..1 down), in grid units. */
      toUnits: function (nx, ny, frameAspect) {
        var f = frameOf(frameAspect || aspect);
        return { x: f.left + nx * f.width, y: f.top + ny * f.height };
      },

      /* The work as plain data: enough to redraw it in order, anywhere. */
      snapshot: function () {
        return {
          format: 'cubes-ASK work 1',
          seed: seed,
          settings: JSON.parse(JSON.stringify(settings)),
          cubes: cubes.map(function (q) { return [q.c, q.r, q.k, Math.round(q.a * 255), q.hex]; })
        };
      }
    };

    reseed(options.seed);
    if (options.palettes) data = options.palettes;
    return engine;
  }

  var api = {
    create: create,
    readPalettes: readPalettes,
    PALETTE_IDS: PALETTE_IDS,
    DATA_VERSION: DATA_VERSION,
    DEFAULTS: DEFAULTS,
    CAP: CAP,
    SHORT: SHORT,
    COS30: COS30,
    RADII: RADII,
    EDGE: EDGE,
    SOLID: SOLID,
    SOLID_HI: SOLID_HI,
    GROUND: [GROUND_FROM, GROUND_TO],
    frameOf: frameOf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CubesEngine = api;
})(typeof self !== 'undefined' ? self : this);
