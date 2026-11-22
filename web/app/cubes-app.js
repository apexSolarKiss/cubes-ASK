/* =========================================================================
   cubes-app.js // the cubes-ASK instrument: controls, loop and pointer

   PRODUCT CODE. It joins the cubes engine (the work and how it is drawn) to
   design-system-ASK's instrument pattern (frame, view, save) and to the
   controls on the page. It never draws a cube itself and never sizes the
   canvas.

   The colors come from art-palettes.json beside the page, read with fetch.
   Until it loads no cube is made; if it cannot load, the page says so and
   makes none, rather than painting with another palette.

   URL parameters, for review and for tests (none is needed for ordinary use):
     seed=<n>          start from this seed
     cubes=<n>         make n cubes at once on load (at most the cap)
     play=0            start paused
     mode, palette, frame          as the control values
     base=<0..100>     muted purple base for the chosen palette
     dark=<0..20>      share of each darker purple, percent
     rate, spread, edge            tuning values
     solid=<70..93>    lowest opacity of red and orange, percent
     store=0           neither read nor write remembered settings
   A value that cannot be read is ignored; the value in force stays.
   ========================================================================= */
(function () {
  'use strict';

  var STORE = 'cubes-ASK';
  var PALETTE_FILE = 'art-palettes.json';
  var params = new URLSearchParams(location.search);
  var useStore = params.get('store') !== '0';
  var number = new Intl.NumberFormat('en-US');
  var IDS = CubesEngine.PALETTE_IDS;
  var CAP = CubesEngine.CAP;
  /* [lowest, highest, step] as the sliders have them. */
  var LIMITS = { base: [0, 100, 1], dark: [0, 20, 1], rate: [1, 240, 1], spread: [0, 8, 1], edge: [0, 3, 0.25], solid: [70, 93, 1] };
  var UNDO_MS = 8000;
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

  function $(id) { return document.getElementById(id); }
  function has(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function isNumber(v) { return typeof v === 'number' && isFinite(v); }
  function isPalette(v) { return typeof v === 'string' && IDS.indexOf(v) !== -1; }
  function word(n) { return n >= 0 && n < WORDS.length ? WORDS[n] : String(n); }
  /* A number from text, or null when there is none to read. */
  function parse(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    var n = Number(raw);
    return isFinite(n) ? n : null;
  }
  /* Bring a value into a slider's range and onto its step. */
  function snap(v, limit) {
    var clamped = v < limit[0] ? limit[0] : (v > limit[1] ? limit[1] : v);
    return Math.round(Math.round((clamped - limit[0]) / limit[2]) * limit[2] * 1000 + limit[0] * 1000) / 1000;
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function radios(name) { return document.querySelectorAll('input[type="radio"][name="' + name + '"]'); }
  function checkRadio(name, value) {
    var list = radios(name);
    for (var i = 0; i < list.length; i++) list[i].checked = list[i].value === value;
  }
  function onRadio(name, fn) {
    var list = radios(name);
    for (var i = 0; i < list.length; i++) list[i].addEventListener('change', function (e) { if (e.target.checked) fn(e.target.value); });
  }

  var host = $('inst');
  var canvas = $('canvas');
  var seedParam = parse(params.get('seed'));
  var engine = CubesEngine.create({ seed: seedParam == null ? undefined : Math.floor(Math.abs(seedParam)) % 4294967296 });
  var settings = engine.settings;
  var defaults = JSON.parse(JSON.stringify(CubesEngine.DEFAULTS));
  var loadError = '';

  /* ---- remembered settings, then the URL ------------------------------- */

  function recall() {
    if (!useStore) return;
    try {
      var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!saved || typeof saved !== 'object') return;
      if (saved.mode === 'field' || saved.mode === 'pointer') settings.mode = saved.mode;
      if (isPalette(saved.palette)) settings.palette = saved.palette;
      if (saved.base && typeof saved.base === 'object') {
        for (var k in settings.base) {
          if (has(settings.base, k) && isNumber(saved.base[k])) settings.base[k] = snap(saved.base[k] * 100, LIMITS.base) / 100;
        }
      }
      if (isNumber(saved.darkEach)) settings.darkEach = snap(saved.darkEach * 100, LIMITS.dark) / 100;
      if (isNumber(saved.rate)) settings.rate = snap(saved.rate, LIMITS.rate);
      if (isNumber(saved.spread)) settings.spread = snap(saved.spread, LIMITS.spread);
      if (isNumber(saved.edgeWeight)) settings.edgeWeight = snap(saved.edgeWeight, LIMITS.edge);
      if (isNumber(saved.solidFloor)) settings.solidFloor = snap(saved.solidFloor * 100, LIMITS.solid) / 100;
    } catch (e) { /* storage is a convenience only */ }
  }

  function remember() {
    if (!useStore) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({
        mode: settings.mode, palette: settings.palette, base: settings.base,
        darkEach: settings.darkEach, rate: settings.rate, spread: settings.spread, edgeWeight: settings.edgeWeight,
        solidFloor: settings.solidFloor
      }));
    } catch (e) { /* ignore */ }
  }

  recall();
  (function fromUrl() {
    var v = params.get('mode');
    if (v === 'field' || v === 'pointer') settings.mode = v;
    v = params.get('palette');
    if (isPalette(v)) settings.palette = v;
    v = parse(params.get('base'));
    if (v != null && has(settings.base, settings.palette)) settings.base[settings.palette] = snap(v, LIMITS.base) / 100;
    v = parse(params.get('dark'));
    if (v != null) settings.darkEach = snap(v, LIMITS.dark) / 100;
    v = parse(params.get('rate'));
    if (v != null) settings.rate = snap(v, LIMITS.rate);
    v = parse(params.get('spread'));
    if (v != null) settings.spread = snap(v, LIMITS.spread);
    v = parse(params.get('edge'));
    if (v != null) settings.edgeWeight = snap(v, LIMITS.edge);
    v = parse(params.get('solid'));
    if (v != null) settings.solidFloor = snap(v, LIMITS.solid) / 100;
  })();

  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  /* `playing` is whether the clock runs. It starts once the colors have loaded. */
  var wantPlay = params.get('play') === '0' ? false : !reducedMotion;
  var playing = false;
  /* True while the work is full and it was the cap, not a person, that paused
     it: clearing then starts the next work playing. */
  var heldByCap = false;

  /* What the engine reads: is something asking for cubes, and where.
     A mouse places cubes while it is over the canvas. A finger or a pen places
     them while it is held down on the canvas; the first one down owns the
     placement until it is lifted or cancelled, and any other contact is
     ignored meanwhile. */
  var pointer = { active: false, x: 0, y: 0 };
  var mouseInside = false;
  var mousePoint = null;          // the mouse's last point on the canvas, as fractions of it
  var owner = null;
  var ownerInside = false;
  function refreshPointer() { pointer.active = owner !== null ? ownerInside : mouseInside; }

  var undoStack = [];
  var undoTimer = 0;
  var notice = '';
  var noticeUntil = 0;
  var noticeTimer = 0;

  /* ---- the instrument pattern ------------------------------------------ */

  var instrument = INSTRUMENT.create({
    root: host,
    stage: $('fit'),
    canvas: canvas,
    pin: $('pin'),
    name: 'cubes-ASK',
    frame: params.get('frame') || undefined,
    storageKey: useStore ? STORE + '/frame' : null,
    render: function (ctx, width, height) { engine.render(ctx, width, height); },
    fileSuffix: function () {
      var s = String(engine.generated);
      while (s.length < 5) s = '0' + s;
      return s;
    }
  });

  /* New full-field cubes are spread over the frame. A fixed frame uses its
     exact shape, not the rounded pixel shape of the canvas, so the lattice
     does not gain or lose a column with the window size. */
  function spawnAspect() { return instrument.frame.aspect || instrument.metrics.aspect; }
  engine.setAspect(spawnAspect());
  instrument.on('resize', function () { engine.setAspect(spawnAspect()); });
  instrument.on('change', function () { engine.setAspect(spawnAspect()); });
  instrument.on('export', function (result) {
    if (!result.downloaded) return;
    say('download started // ' + result.width + ' × ' + result.height + ' px',
      'Download started, ' + result.width + ' by ' + result.height + ' pixels.', 6000);
  });
  instrument.on('error', function (error) {
    var why = error && error.message ? error.message : 'unknown error';
    say('could not save // ' + why, 'Could not save. ' + why, 8000);
  });
  instrument.bind({
    frame: $('frame'),
    size: $('save-size'),
    save: $('save'),
    fullWindow: $('view-window'),
    fullscreen: [$('view-fullscreen'), $('view-fullscreen-bar')],
    exit: $('view-exit'),
    panelToggle: $('panel-toggle')
  });

  /* ---- status ----------------------------------------------------------
     The line on screen changes freely. The spoken region gets only what a
     person did or needs to know, in plain words, once. */

  function announce(text) {
    var node = $('announce');
    node.textContent = node.textContent === text ? text + ' ' : text;
  }

  function say(shown, spoken, ms) {
    notice = shown;
    noticeUntil = performance.now() + (ms || 4000);
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(renderStatus, (ms || 4000) + 30);
    if (spoken) announce(spoken);
    renderStatus();
  }

  var FULL_SHOWN = 'full // save PNG, or clear to start another';
  var FULL_SPOKEN = 'The picture is full at ' + number.format(CAP) + ' cubes. Save it, or clear to start another.';

  function stateWord() {
    if (loadError) return 'colors did not load';
    if (!engine.ready) return 'loading colors';
    if (engine.full) return FULL_SHOWN;
    if (!playing) return reducedMotion && engine.generated === 0 ? 'paused // reduce motion is on' : 'paused';
    if (settings.mode === 'pointer' && !pointer.active) return 'waiting for pointer';
    return 'running';
  }

  function renderStatus() {
    var text = notice && performance.now() < noticeUntil ? notice : stateWord();
    var count = number.format(engine.count) + (engine.count === 1 ? ' cube' : ' cubes');
    setText($('status'), text + ' // ' + count);
  }

  /* ---- controls --------------------------------------------------------- */

  function percent(v) { return Math.round(v * 100); }
  function trim(v) { return String(Math.round(v * 100) / 100); }

  function setRange(id, value, valueId, shown, spoken) {
    var input = $(id);
    if (String(input.value) !== String(value)) input.value = value;
    if (input.getAttribute('aria-valuetext') !== spoken) input.setAttribute('aria-valuetext', spoken);
    setText($(valueId), shown);
  }

  function mixed() {
    var data = engine.palettes;
    if (data) return data.palettes[settings.palette].featured.length > 0;
    return has(settings.base, settings.palette);
  }

  /* Focus never stays on a button that has gone. On a phone in full window a button trades places
     (cubes.css): clear for play while the picture is full, undo for save while a clear can be undone,
     and focus moves to the one now in that place. Elsewhere, when undo goes, focus moves to clear.
     A browser may drop focus as soon as a button is hidden, so the focused button is noted first. */
  function focusedButton() {
    var b = document.activeElement;
    if (!b || ['play', 'clear', 'save', 'undo'].indexOf(b.id) < 0) return null;
    return { id: b.id, undoInSavesPlace: b.id === 'undo' && !$('save').getClientRects().length };
  }
  function keepFocusVisible(was) {
    if (!was) return;
    var now = document.activeElement;
    if (now && now !== document.body && now !== $(was.id)) return;
    if ($(was.id).getClientRects().length) return;
    var next = { play: ['clear'], clear: ['play'], save: ['undo'],
      undo: was.undoInSavesPlace ? ['save', 'clear', 'play'] : ['clear', 'save', 'play'] }[was.id];
    next.some(function (id) {
      if (!$(id).getClientRects().length) return false;
      $(id).focus();
      return true;
    });
  }

  function syncControls() {
    var focused = focusedButton();
    var data = engine.palettes;
    host.setAttribute('data-mode', settings.mode);
    canvas.setAttribute('data-draw', settings.mode === 'pointer' ? 'true' : 'false');
    checkRadio('mode', settings.mode);
    checkRadio('palette', settings.palette);

    var isMixed = mixed();
    var base = isMixed ? percent(settings.base[settings.palette]) : 100;
    $('base').disabled = !isMixed;
    $('base-field').setAttribute('data-off', isMixed ? 'false' : 'true');
    setRange('base', base, 'base-value', base + '%', base + ' percent');
    setText($('base-note'), isMixed ? 'Share of new cubes drawn from muted purple. The rest come from the featured colors.'
      : 'Muted purple draws every cube from the base, so there is nothing to mix.');

    setRange('rate', settings.rate, 'rate-value', settings.rate + ' /s', settings.rate + ' cubes per second');

    var spreadOff = settings.mode !== 'pointer';
    $('spread').disabled = spreadOff;
    $('spread-field').setAttribute('data-off', spreadOff ? 'true' : 'false');
    setRange('spread', settings.spread, 'spread-value', '± ' + settings.spread,
      'plus or minus ' + settings.spread + (settings.spread === 1 ? ' grid step' : ' grid steps'));

    var nMain = data ? data.common.length : 5;
    var nRare = data ? data.rare.length : 2;
    var dark = percent(settings.darkEach);
    var main = trim((100 - nRare * dark) / nMain);
    setRange('dark', dark, 'dark-value', dark + '% each', dark + ' percent each');
    setText($('dark-note'), 'Share of the base taken by each of the ' + word(nRare) + ' darker purples. The ' + word(nMain) +
      ' main colors then take ' + main + '% each.');

    setRange('edge', settings.edgeWeight, 'edge-value', trim(settings.edgeWeight) + ' ×', trim(settings.edgeWeight) + ' times');

    var solid = percent(settings.solidFloor);
    setRange('solid', solid, 'solid-value', solid + '–94%', solid + ' to 94 percent');

    setText($('play'), playing ? 'pause' : 'play');
    $('play').disabled = !!loadError;
    $('undo').hidden = undoStack.length === 0;
    host.setAttribute('data-full', engine.full ? 'true' : 'false');
    host.setAttribute('data-undo', undoStack.length ? 'true' : 'false');
    keepFocusVisible(focused);

    setText($('settings-line'),
      'main colors ' + main + '% each // darker ' + dark + '% each' +
      ' // base: ASK emphasis ' + percent(settings.base['ask-emphasis']) + '%, rainbow ' + percent(settings.base.rainbow) +
      '%, red/pink/cyan ' + percent(settings.base['red-pink-cyan']) + '%' +
      ' // rate ' + settings.rate + ' // spread ' + settings.spread + ' // edge ' + trim(settings.edgeWeight) + ' // red + orange from ' + percent(settings.solidFloor) + '%' +
      ' // seed ' + engine.seed);
    renderStatus();
  }

  function changed() { remember(); syncControls(); }

  onRadio('mode', function (value) { settings.mode = value; refreshPointer(); changed(); });
  onRadio('palette', function (value) { if (isPalette(value)) settings.palette = value; changed(); });

  $('base').addEventListener('input', function (e) {
    if (!has(settings.base, settings.palette)) return;
    settings.base[settings.palette] = snap(Number(e.target.value), LIMITS.base) / 100;
    changed();
  });
  $('rate').addEventListener('input', function (e) { settings.rate = snap(Number(e.target.value), LIMITS.rate); changed(); });
  $('spread').addEventListener('input', function (e) { settings.spread = snap(Number(e.target.value), LIMITS.spread); changed(); });
  $('dark').addEventListener('input', function (e) { settings.darkEach = snap(Number(e.target.value), LIMITS.dark) / 100; changed(); });
  $('solid').addEventListener('input', function (e) { settings.solidFloor = snap(Number(e.target.value), LIMITS.solid) / 100; changed(); });
  $('edge').addEventListener('input', function (e) {
    settings.edgeWeight = snap(Number(e.target.value), LIMITS.edge);
    instrument.requestRedraw();
    changed();
  });
  $('values-reset').addEventListener('click', function () {
    Object.keys(defaults.base).forEach(function (id) { settings.base[id] = defaults.base[id]; });
    settings.darkEach = defaults.darkEach;
    settings.rate = defaults.rate;
    settings.spread = defaults.spread;
    settings.edgeWeight = defaults.edgeWeight;
    settings.solidFloor = defaults.solidFloor;
    instrument.requestRedraw();
    changed();
    announce('Values reset.');
  });

  $('tuning-trigger').addEventListener('click', function (e) {
    var trigger = e.currentTarget;
    var open = trigger.getAttribute('aria-expanded') !== 'true';
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    $('tuning').hidden = !open;
  });

  /* ---- clear, with undo ------------------------------------------------
     Each clear can be taken back, newest first, until 8 seconds pass with no
     further clear. A second clear never throws the first one away. Undo puts
     back the work as it was, full or not; a full work comes back paused. */

  function endUndo() {
    undoStack = [];
    window.clearTimeout(undoTimer);
    syncControls();
  }
  $('clear').addEventListener('click', function () {
    var resume = heldByCap;
    undoStack.push({ restore: engine.clear(), heldByCap: heldByCap });
    if (undoStack.length > 8) undoStack.shift();
    heldByCap = false;
    instrument.redraw();
    window.clearTimeout(undoTimer);
    undoTimer = window.setTimeout(endUndo, UNDO_MS);
    if (resume) setPlaying(true, true);
    syncControls();
    say('cleared // undo for 8 s', 'Cleared. Undo is available for 8 seconds.', UNDO_MS);
  });
  $('undo').addEventListener('click', function () {
    var entry = undoStack.pop();
    if (!entry) return;
    entry.restore();
    instrument.redraw();
    if (engine.full) {
      /* The work that comes back is full: it stays as it was, paused. */
      heldByCap = entry.heldByCap || playing;
      setPlaying(false, true);
    }
    if (undoStack.length === 0) window.clearTimeout(undoTimer);
    syncControls();
    say('restored', 'Restored.', 3000);
  });

  /* ---- pointer ----------------------------------------------------------
     No pointer event ever saves a file. */

  function place(event) {
    var p = instrument.pointFromEvent(event);
    var u = engine.toUnits(p.nx, p.ny, instrument.metrics.aspect);
    pointer.x = u.x;
    pointer.y = u.y;
    return p;
  }
  function isMouse(e) { return e.pointerType === 'mouse'; }
  function releaseOwner(e) {
    if (owner === null || e.pointerId !== owner) return;
    owner = null;
    ownerInside = false;
    /* A mouse still over the canvas takes placement back where it is, not where the finger was. */
    if (mouseInside && mousePoint) {
      var u = engine.toUnits(mousePoint.nx, mousePoint.ny, instrument.metrics.aspect);
      pointer.x = u.x;
      pointer.y = u.y;
    }
    refreshPointer();
  }
  function noteMouse(e) {
    var p = instrument.pointFromEvent(e);
    mousePoint = { nx: p.nx, ny: p.ny };
    return p;
  }

  canvas.addEventListener('pointerenter', function (e) {
    if (!isMouse(e)) return;
    noteMouse(e);
    if (owner !== null) { mouseInside = instrument.pointFromEvent(e).inside; return; }
    mouseInside = place(e).inside;
    refreshPointer();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (isMouse(e)) {
      noteMouse(e);
      if (owner !== null) { mouseInside = instrument.pointFromEvent(e).inside; return; }
      mouseInside = place(e).inside;
    } else {
      if (e.pointerId !== owner) return;
      ownerInside = place(e).inside;
    }
    refreshPointer();
  });
  canvas.addEventListener('pointerleave', function (e) {
    if (isMouse(e)) { mouseInside = false; refreshPointer(); }
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (isMouse(e)) return;
    if (owner !== null) return;                  // a second contact changes nothing
    owner = e.pointerId;
    ownerInside = place(e).inside;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
    refreshPointer();
  });
  canvas.addEventListener('pointerup', releaseOwner);
  canvas.addEventListener('pointercancel', releaseOwner);
  canvas.addEventListener('lostpointercapture', releaseOwner);

  canvas.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.code === 'Space') && !e.repeat) { e.preventDefault(); setPlaying(!playing); }
  });

  /* ---- the loop ---------------------------------------------------------
     Time based, so the display's refresh rate does not set the tempo. A long
     gap (a hidden tab, a stalled frame) is clamped by the engine, so nothing
     is repaid in a burst. New cubes are painted on top of what is there, so
     the screen stays exactly a drawing of the list. At the cap the work is
     full and the clock stops. Paused, nothing runs. */

  var frameRequest = 0;
  var last = 0;
  var lastStatus = 0;
  function frame(now) {
    frameRequest = 0;
    if (!playing) return;
    var dt = last ? now - last : 0;
    last = now;
    if (!document.hidden) {
      var fresh = engine.step(dt, pointer);
      if (fresh.length) {
        var m = instrument.metrics;
        engine.draw(instrument.context, fresh, m.width, m.height);
      }
      if (engine.full) { capStop(); return; }
    }
    if (now - lastStatus > 200) { lastStatus = now; renderStatus(); }
    frameRequest = window.requestAnimationFrame(frame);
  }
  function fullNotice() {
    notice = '';
    announce(FULL_SPOKEN);
    renderStatus();
  }
  function capStop() {
    heldByCap = true;
    setPlaying(false, true);
    fullNotice();
  }
  function setPlaying(next, quiet) {
    if (next && (loadError || !engine.ready)) return;
    if (next && engine.full) {
      /* A full work never resumes: play explains instead. */
      fullNotice();
      return;
    }
    if (next) heldByCap = false;
    playing = !!next;
    last = 0;
    if (playing && !frameRequest) frameRequest = window.requestAnimationFrame(frame);
    syncControls();
    if (!quiet) announce(playing ? 'Playing.' : 'Paused.');
  }
  $('play').addEventListener('click', function () { setPlaying(!playing); });
  document.addEventListener('visibilitychange', function () { last = 0; });

  /* ---- the colors -------------------------------------------------------
     Served, the page reads art-palettes.json beside it. Opened from a file,
     a browser does not let it, and the page says so. */

  function showLoadError(why, unreadable) {
    loadError = why;
    var text = 'The color palettes did not load (' + PALETTE_FILE + '), so no cubes can be made. ' +
      (unreadable ? 'The file arrived, but it is not one this page can read.'
        : location.protocol === 'file:' ? 'A page opened from a file cannot read them: serve this folder over HTTP instead.' : 'Reload the page to try again.');
    var p = $('load-error');
    if (!p) {
      p = document.createElement('p');
      p.id = 'load-error';
      p.className = 'inst-note';
      p.setAttribute('role', 'alert');
      document.body.insertBefore(p, document.body.firstChild);
      p.textContent = text;
    }
    syncControls();
  }

  function start() {
    var n = parse(params.get('cubes'));
    if (n != null && n >= 1) {
      engine.generate(Math.min(CAP, Math.floor(n)), { active: true, x: 16, y: 9 });
      instrument.redraw();
    }
    if (engine.full) { heldByCap = wantPlay; syncControls(); return; }
    if (wantPlay) setPlaying(true, true);
    else syncControls();
  }

  function loadPalettes() {
    var request;
    try {
      request = fetch(PALETTE_FILE, { cache: 'no-cache' });
    } catch (e) {
      showLoadError(e && e.message ? e.message : 'fetch failed');
      return;
    }
    request.then(function (response) {
      if (!response.ok) throw new Error(PALETTE_FILE + ' returned ' + response.status);
      /* From here on the file has arrived: a failure means its contents, not the connection. */
      return response.json().then(function (json) {
        engine.usePalettes(CubesEngine.readPalettes(json));
      }).catch(function (e) {
        e.unreadable = true;
        throw e;
      });
    }).then(start, function (e) {
      showLoadError(e && e.message ? e.message : 'unknown error', !!(e && e.unreadable));
    });
  }

  syncControls();
  loadPalettes();

  /* Verification hook: what this repository's own checks reach in. Not an API. */
  window.__cubes = {
    engine: engine,
    instrument: instrument,
    setPlaying: setPlaying,
    get playing() { return playing; },
    get loadError() { return loadError; },
    get heldByCap() { return heldByCap; },
    pointer: pointer,
    get owner() { return owner; },
    get undoDepth() { return undoStack.length; }
  };
})();
