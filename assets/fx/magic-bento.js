/* Ported from React Bits by David Haz, MIT + Commons Clause */
/*
 * MagicBento effects, plain browser port. Enhances EXISTING cards, renders no content.
 *
 *   var mb = window.MagicBento(gridEl, { cardSelector: '.sys', enableStars: true });
 *   mb.destroy();
 *
 * Adds to each card: a spotlight layer (.mb-light, behind content), an optional
 * particle canvas (.mb-stars, behind content) and a border glow ring (.mb-border,
 * over the card's own border). Pointer position, glow strength, tilt, magnet,
 * press and click ripple are written as CSS custom properties on each card.
 * Touch devices and widths < 768px get a static border glow only (plus the tap
 * ripple). prefers-reduced-motion keeps the pointer glow and spotlight but drops
 * tilt, magnetism, press, particles and ripple, unless the URL has ?motion=1.
 */
(function () {
  'use strict';

  var TILT = 6;
  var MAGNET = 6;
  var THEMES = {
    dark: { glowAlpha: 0.85, spotAlpha: 0.07 },
    light: { glowAlpha: 0.5, spotAlpha: 0.035 }
  };

  var DEFAULTS = {
    cardSelector: '.sys',
    glowColor: '2, 166, 254',
    theme: 'dark',
    enableBorderGlow: true,
    enableSpotlight: true,
    spotlightRadius: 300,
    enableStars: false,
    particleCount: 24,
    enableTilt: false,
    enableMagnetism: false,
    clickEffect: true,
    disableAnimations: false,
    staticBreakpoint: 768
  };

  var clamp = function (v, min, max) { return Math.min(max, Math.max(min, v)); };

  function parseRgb(value) {
    if (!value) return null;
    if (Array.isArray(value) && value.length >= 3) return value.slice(0, 3).map(function (c) { return clamp(Math.round(+c), 0, 255); });
    var text = String(value).trim();
    var hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
    if (hex) {
      var full = hex[1].length === 3 ? hex[1].replace(/./g, function (d) { return d + d; }) : hex[1];
      return [0, 2, 4].map(function (i) { return parseInt(full.slice(i, i + 2), 16); });
    }
    var nums = text.match(/[\d.]+/g);
    if (nums && nums.length >= 3 && /^(rgba?\(|[\d.\s,]+$)/i.test(text)) {
      return nums.slice(0, 3).map(function (c) { return clamp(Math.round(parseFloat(c)), 0, 255); });
    }
    return null;
  }

  function motionForced() {
    try { return /[?&]motion=1(&|$)/.test(window.location.search); } catch (e) { return false; }
  }

  function mq(query) {
    return window.matchMedia ? window.matchMedia(query) : { matches: false, addEventListener: null };
  }

  function listen(m, fn) {
    if (!m) return;
    if (m.addEventListener) m.addEventListener('change', fn);
    else if (m.addListener) m.addListener(fn);
  }

  function unlisten(m, fn) {
    if (!m) return;
    if (m.removeEventListener) m.removeEventListener('change', fn);
    else if (m.removeListener) m.removeListener(fn);
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) target[k] = src[k];
    }
    return target;
  }

  function span(cls) {
    var el = document.createElement('span');
    el.className = cls;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function MagicBento(root, options) {
    if (!root) return null;
    if (root.__magicBento) root.__magicBento.destroy();

    var s = assign({}, DEFAULTS, options || {});
    s.spotlightRadius = Math.max(40, s.spotlightRadius);
    s.particleCount = clamp(Math.round(s.particleCount), 0, 120);
    var glow = parseRgb(s.glowColor) || [2, 166, 254];
    var theme = THEMES[s.theme === 'light' ? 'light' : 'dark'];

    var mqReduce = mq('(prefers-reduced-motion: reduce)');
    var mqTouch = mq('(hover: none), (pointer: coarse)');
    var mqNarrow = mq('(max-width: ' + (s.staticBreakpoint - 0.02) + 'px)');

    var motion = true;   // tilt / magnet / press / stars / ripple allowed
    var isStatic = false; // touch or narrow: static border glow only

    root.classList.add('mb-grid');
    var rootVars = {
      '--mb-glow-rgb': glow.join(', '),
      '--mb-glow-alpha': String(theme.glowAlpha),
      '--mb-spot-alpha': String(theme.spotAlpha),
      '--mb-spot-size': s.spotlightRadius + 'px',
      '--mb-border-size': Math.round(s.spotlightRadius * 0.75) + 'px'
    };
    Object.keys(rootVars).forEach(function (k) { root.style.setProperty(k, rootVars[k]); });

    var cards = [];
    var states = [];
    var rects = [];
    var bounds = null;
    var dirty = true;
    var raf = 0;
    var last = 0;
    var visible = true;
    var pointer = { x: -1e5, y: -1e5, inside: false, down: -1 };
    var light = { x: -1e5, y: -1e5, near: 0, ready: false };
    var wave = { x: 0, y: 0, t: -1, duration: 1.1, reach: 800 };

    function setup() {
      cards = Array.prototype.slice.call(root.querySelectorAll(s.cardSelector));
      cards.forEach(function (card, i) {
        card.classList.add('mb-card');
        var cs = window.getComputedStyle(card);
        if (cs.position === 'static') card.classList.add('mb-pos');
        card.style.setProperty('--mb-bw', (parseFloat(cs.borderTopWidth) || 0) + 'px');
        var layers = { light: span('mb-light'), border: span('mb-border'), stars: null };
        card.insertBefore(layers.light, card.firstChild);
        if (s.enableStars) {
          var canvas = document.createElement('canvas');
          canvas.className = 'mb-stars';
          canvas.setAttribute('aria-hidden', 'true');
          layers.stars = canvas;
          layers.light.parentNode.insertBefore(canvas, layers.light.nextSibling);
        }
        card.appendChild(layers.border);
        states[i] = {
          layers: layers, hot: 0, rx: 0, ry: 0, tx: 0, ty: 0, vrx: 0, vry: 0, vtx: 0, vty: 0,
          press: 1, vpress: 0, stars: 0, particles: null, drawn: false, active: false, written: {}
        };
      });
    }

    function applyMode() {
      var reduced = !motionForced() && mqReduce.matches;
      motion = !s.disableAnimations && !reduced;
      isStatic = mqTouch.matches || mqNarrow.matches;
      root.classList.toggle('mb-static', isStatic);
      root.classList.toggle('mb-motion', motion);
      root.classList.toggle('mb-tilt', motion && !isStatic && s.enableTilt);
      root.classList.toggle('mb-magnet', motion && !isStatic && s.enableMagnetism);
      root.classList.toggle('mb-press', motion && s.clickEffect);
      if (isStatic) {
        pointer.inside = false;
        light.near = 0;
      }
      dirty = true;
      wake();
    }

    function write(card, state, name, value) {
      if (state.written[name] === value) return;
      state.written[name] = value;
      card.style.setProperty(name, value);
    }

    function measure() {
      dirty = false;
      bounds = root.getBoundingClientRect();
      rects = cards.map(function (c) { return c.getBoundingClientRect(); });
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      states.forEach(function (st, i) {
        var canvas = st.layers.stars;
        var r = rects[i];
        if (!canvas || !r) return;
        var w = Math.max(1, Math.round(r.width * ratio));
        var h = Math.max(1, Math.round(r.height * ratio));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      });
    }

    function seed(state, rect) {
      var count = s.particleCount;
      if (state.particles && state.particles.length === count) return state.particles;
      state.particles = [];
      for (var i = 0; i < count; i++) {
        state.particles.push({
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          vx: (Math.random() - 0.5) * 6,
          vy: -4 - Math.random() * 10,
          size: 0.6 + Math.random() * 1.1,
          phase: Math.random() * Math.PI * 2,
          rate: 1.2 + Math.random() * 2.4
        });
      }
      return state.particles;
    }

    function drawStars(state, rect, lx, ly, dt, now) {
      var canvas = state.layers.stars;
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var ratio = canvas.width / Math.max(1, rect.width);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (state.stars < 0.004) return;
      var particles = seed(state, rect);
      var reach = s.spotlightRadius * 0.75;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -4) { p.y = rect.height + 4; p.x = Math.random() * rect.width; }
        if (p.x < -4) p.x = rect.width + 4;
        if (p.x > rect.width + 4) p.x = -4;
        var d = Math.hypot(p.x - lx, p.y - ly) / reach;
        if (d >= 1) continue;
        var falloff = 1 - d * d * (3 - 2 * d);
        var twinkle = 0.55 + 0.45 * Math.sin(now * 0.001 * p.rate + p.phase);
        var alpha = state.stars * falloff * twinkle;
        if (alpha < 0.01) continue;
        ctx.fillStyle = 'rgba(' + glow[0] + ', ' + glow[1] + ', ' + glow[2] + ', ' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function startWave(x, y, duration) {
      if (!motion || !bounds) return;
      wave.x = x; wave.y = y; wave.t = 0; wave.duration = duration;
      wave.reach = Math.max(
        Math.hypot(x - bounds.left, y - bounds.top),
        Math.hypot(x - bounds.right, y - bounds.top),
        Math.hypot(x - bounds.left, y - bounds.bottom),
        Math.hypot(x - bounds.right, y - bounds.bottom)
      ) + 140;
    }

    var KEYS = [['rx', 'vrx'], ['ry', 'vry'], ['tx', 'vtx'], ['ty', 'vty']];

    function frame(now) {
      raf = 0;
      var dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (dirty) measure();
      var busy = false;
      var interactive = !isStatic;

      var margin = s.spotlightRadius * 0.5;
      var near = interactive && pointer.inside && bounds &&
        pointer.x > bounds.left - margin && pointer.x < bounds.right + margin &&
        pointer.y > bounds.top - margin && pointer.y < bounds.bottom + margin ? 1 : 0;
      if (!light.ready && near) { light.x = pointer.x; light.y = pointer.y; light.ready = true; }
      var follow = 1 - Math.exp(-dt / 0.05);
      light.x += (pointer.x - light.x) * follow;
      light.y += (pointer.y - light.y) * follow;
      var fade = 1 - Math.exp(-dt / (near > light.near ? 0.12 : 0.4));
      light.near += (near - light.near) * fade;
      if (Math.abs(near - light.near) < 0.002) light.near = near;
      else busy = true;
      if (Math.abs(pointer.x - light.x) + Math.abs(pointer.y - light.y) > 0.3) busy = true;

      var waveRadius = 0;
      var waveAlpha = 0;
      if (wave.t >= 0) {
        wave.t += dt;
        var progress = Math.min(1, wave.t / wave.duration);
        waveRadius = wave.reach * (1 - Math.pow(1 - progress, 2.2));
        waveAlpha = Math.pow(1 - progress, 1.3);
        if (progress >= 1) { wave.t = -1; waveAlpha = 0; } else busy = true;
      }

      var steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      var h = dt / steps;

      cards.forEach(function (card, index) {
        var rect = rects[index];
        var state = states[index];
        if (!rect || !state) return;
        var lx = light.x - rect.left;
        var ly = light.y - rect.top;
        var px = pointer.x - rect.left;
        var py = pointer.y - rect.top;
        var inside = interactive && pointer.inside && px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;

        if (inside !== state.active) {
          state.active = inside;
          if (inside) card.setAttribute('data-mb-active', '');
          else card.removeAttribute('data-mb-active');
        }

        var hotTarget = inside && s.enableSpotlight ? 1 : 0;
        state.hot += (hotTarget - state.hot) * (1 - Math.exp(-dt / (hotTarget > state.hot ? 0.14 : 0.32)));
        if (Math.abs(hotTarget - state.hot) < 0.002) state.hot = hotTarget;
        else busy = true;

        var u = clamp(px / Math.max(1, rect.width), 0, 1) - 0.5;
        var v = clamp(py / Math.max(1, rect.height), 0, 1) - 0.5;
        var tilt = inside && s.enableTilt && motion;
        var magnet = inside && s.enableMagnetism && motion;
        var targets = [
          tilt ? -v * 2 * TILT : 0,
          tilt ? u * 2 * TILT : 0,
          magnet ? u * 2 * MAGNET : 0,
          magnet ? v * 2 * MAGNET : 0
        ];
        for (var k = 0; k < 4; k++) {
          var key = KEYS[k][0];
          var vel = KEYS[k][1];
          for (var st = 0; st < steps; st++) {
            state[vel] += (170 * (targets[k] - state[key]) - 20 * state[vel]) * h;
            state[key] += state[vel] * h;
          }
          if (Math.abs(targets[k] - state[key]) < 0.002 && Math.abs(state[vel]) < 0.01) {
            state[key] = targets[k];
            state[vel] = 0;
          } else busy = true;
        }
        var pressTarget = pointer.down === index && s.clickEffect && motion ? 0.985 : 1;
        for (var sp = 0; sp < steps; sp++) {
          state.vpress += (420 * (pressTarget - state.press) - 28 * state.vpress) * h;
          state.press += state.vpress * h;
        }
        if (Math.abs(pressTarget - state.press) < 0.0002 && Math.abs(state.vpress) < 0.001) {
          state.press = pressTarget;
          state.vpress = 0;
        } else busy = true;

        write(card, state, '--mb-x', lx.toFixed(1) + 'px');
        write(card, state, '--mb-y', ly.toFixed(1) + 'px');
        write(card, state, '--mb-near', (s.enableBorderGlow ? light.near : 0).toFixed(3));
        write(card, state, '--mb-hot', state.hot.toFixed(3));
        write(card, state, '--mb-rx', state.rx.toFixed(3) + 'deg');
        write(card, state, '--mb-ry', state.ry.toFixed(3) + 'deg');
        write(card, state, '--mb-tx', state.tx.toFixed(2) + 'px');
        write(card, state, '--mb-ty', state.ty.toFixed(2) + 'px');
        write(card, state, '--mb-press', state.press.toFixed(4));
        write(card, state, '--mb-wx', (wave.x - rect.left).toFixed(1) + 'px');
        write(card, state, '--mb-wy', (wave.y - rect.top).toFixed(1) + 'px');
        write(card, state, '--mb-wr', waveRadius.toFixed(1) + 'px');
        write(card, state, '--mb-wa', waveAlpha.toFixed(3));

        if (state.layers.stars) {
          var starTarget = inside && motion ? 1 : 0;
          state.stars += (starTarget - state.stars) * (1 - Math.exp(-dt / (starTarget ? 0.3 : 0.5)));
          if (state.stars < 0.004 && !starTarget) state.stars = 0;
          if (state.stars > 0 || starTarget) {
            drawStars(state, rect, lx, ly, dt, now);
            state.drawn = true;
            busy = true;
          } else if (state.drawn) {
            drawStars(state, rect, lx, ly, dt, now);
            state.drawn = false;
          }
        }
      });

      if (busy && visible) raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (raf || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function cardIndex(target) {
      if (!(target instanceof Element)) return -1;
      for (var i = 0; i < cards.length; i++) if (cards[i] === target || cards[i].contains(target)) return i;
      return -1;
    }

    function onPointerMove(e) {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
      wake();
    }
    function onPointerOut(e) {
      if (e.relatedTarget) return;
      pointer.inside = false; pointer.down = -1;
      wake();
    }
    function onPointerDown(e) {
      if (e.pointerType !== 'touch') { pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; }
      pointer.down = cardIndex(e.target);
      wake();
    }
    function release() {
      if (pointer.down < 0) return;
      pointer.down = -1;
      wake();
    }
    function onClick(e) {
      var index = cardIndex(e.target);
      var card = cards[index];
      if (!card || !s.clickEffect) return;
      if (dirty) measure();
      if (e.detail === 0) {
        var r = card.getBoundingClientRect();
        startWave(r.left + r.width / 2, r.top + r.height / 2, 1.1);
      } else startWave(e.clientX, e.clientY, 1.1);
      wake();
    }
    function onScroll() { dirty = true; wake(); }

    setup();

    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null;
    if (ro) ro.observe(root);
    var vis = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (entries) {
      visible = entries.some(function (en) { return en.isIntersecting; });
      if (visible) { dirty = true; wake(); }
    }) : null;
    if (vis) vis.observe(root);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    document.addEventListener('pointerout', onPointerOut);
    root.addEventListener('click', onClick);
    listen(mqReduce, applyMode);
    listen(mqTouch, applyMode);
    listen(mqNarrow, applyMode);
    applyMode();

    var api = {
      root: root,
      get cards() { return cards.slice(); },
      get motion() { return motion; },
      get isStatic() { return isStatic; },
      refresh: function () { dirty = true; wake(); },
      destroy: function () {
        cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect();
        if (vis) vis.disconnect();
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        window.removeEventListener('scroll', onScroll, { capture: true });
        window.removeEventListener('resize', onScroll);
        document.removeEventListener('pointerout', onPointerOut);
        root.removeEventListener('click', onClick);
        unlisten(mqReduce, applyMode);
        unlisten(mqTouch, applyMode);
        unlisten(mqNarrow, applyMode);
        cards.forEach(function (card, i) {
          var L = states[i] && states[i].layers;
          if (L) [L.light, L.stars, L.border].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
          card.classList.remove('mb-card', 'mb-pos');
          card.removeAttribute('data-mb-active');
          ['--mb-bw', '--mb-x', '--mb-y', '--mb-near', '--mb-hot', '--mb-rx', '--mb-ry', '--mb-tx', '--mb-ty',
            '--mb-press', '--mb-wx', '--mb-wy', '--mb-wr', '--mb-wa'].forEach(function (p) { card.style.removeProperty(p); });
        });
        root.classList.remove('mb-grid', 'mb-static', 'mb-motion', 'mb-tilt', 'mb-magnet', 'mb-press');
        Object.keys(rootVars).forEach(function (k) { root.style.removeProperty(k); });
        if (root.__magicBento === api) root.__magicBento = null;
      }
    };
    root.__magicBento = api;
    return api;
  }

  window.MagicBento = MagicBento;
})();
