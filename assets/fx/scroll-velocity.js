/* Ported from React Bits by David Haz, MIT + Commons Clause */
/*
 * ScrollVelocity, plain browser port.
 *
 *   var sv = window.ScrollVelocity(el, { texts: ['One ·', 'Two ·'], velocity: 100 });
 *   sv.destroy();
 *
 * Builds one infinite marquee row per text inside `el`. Rows alternate direction.
 * Speed and direction follow scroll velocity: window.lenis.velocity while Lenis is
 * smooth-scrolling, else window.scrollY deltas. Velocity is smoothed with the same
 * spring as the original (damping 50, stiffness 400, mass 1) and mapped with
 * velocityMapping (default [0,1000] px/s -> [0,5]). Loop runs on gsap.ticker
 * (requestAnimationFrame fallback). prefers-reduced-motion renders static rows
 * unless the URL has ?motion=1.
 */
(function () {
  'use strict';

  var smootherstep = function (t) { return t * t * t * (t * (t * 6 - 15) + 10); };
  var FADE_MASK = (function () {
    var stops = [];
    var i, t;
    for (i = 0; i < 9; i++) { t = i / 8; stops.push('rgba(0, 0, 0, ' + smootherstep(t).toFixed(3) + ') ' + (t * 12).toFixed(1) + '%'); }
    for (i = 0; i < 9; i++) { t = i / 8; stops.push('rgba(0, 0, 0, ' + smootherstep(1 - t).toFixed(3) + ') ' + (88 + t * 12).toFixed(1) + '%'); }
    return 'linear-gradient(to right, ' + stops.join(', ') + ')';
  })();

  var DEFAULTS = {
    texts: [],
    velocity: 100,
    className: '',
    damping: 50,
    stiffness: 400,
    numCopies: 6,
    velocityMapping: { input: [0, 1000], output: [0, 5] },
    separator: '',
    pauseOnHover: false,
    fadeEdges: false,
    skewWithVelocity: 0,
    scaleWithVelocity: 0,
    outlineAlternate: false,
    gap: 0,
    fontSize: undefined,
    fontWeight: undefined,
    color: undefined,
    draggable: false,
    reducedMotion: undefined // true/false forces; undefined = media query (overridden by ?motion=1)
  };

  function wrap(min, max, v) {
    var range = max - min;
    if (range <= 0) return min;
    return ((((v - min) % range) + range) % range) + min;
  }

  function motionForced() {
    try { return /[?&]motion=1(&|$)/.test(window.location.search); } catch (e) { return false; }
  }

  function prefersReduced() {
    if (motionForced()) return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) target[k] = src[k];
    }
    return target;
  }

  function ScrollVelocity(el, options) {
    if (!el) return null;
    if (el.__scrollVelocity) el.__scrollVelocity.destroy();
    var o = assign({}, DEFAULTS, options || {});
    var mapIn = (o.velocityMapping && o.velocityMapping.input) || [0, 1000];
    var mapOut = (o.velocityMapping && o.velocityMapping.output) || [0, 5];
    var reduce = typeof o.reducedMotion === 'boolean' ? o.reducedMotion : prefersReduced();

    var root = document.createElement('div');
    root.className = 'sv-root';
    if (o.fadeEdges) { root.style.webkitMaskImage = FADE_MASK; root.style.maskImage = FADE_MASK; }

    var hovered = false;
    var onEnter = function () { hovered = true; };
    var onLeave = function () { hovered = false; };
    root.addEventListener('pointerenter', onEnter);
    root.addEventListener('pointerleave', onLeave);

    var rows = [];
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function (entries) {
      entries.forEach(function (entry) {
        rows.forEach(function (row) {
          if (row.first === entry.target) row.copyWidth = entry.target.offsetWidth;
        });
      });
    }) : null;

    (o.texts || []).forEach(function (text, index) {
      var row = {
        baseVelocity: index % 2 !== 0 ? -o.velocity : o.velocity,
        baseX: 0, skew: 0, scale: 1, direction: 1, pace: 1, fling: 0,
        drag: { active: false, pointerId: -1, lastX: 0, lastTime: 0, velocity: 0, travel: 0 },
        copyWidth: 0, lastX: null
      };
      var parallax = document.createElement('div');
      parallax.className = 'sv-parallax';
      var scroller = document.createElement('div');
      scroller.className = 'sv-scroller';
      if (o.fontSize !== undefined) {
        scroller.style.fontSize = typeof o.fontSize === 'number' ? o.fontSize + 'px' : o.fontSize;
        scroller.style.lineHeight = '1';
      }
      if (o.fontWeight !== undefined) scroller.style.fontWeight = String(o.fontWeight);
      if (o.color) scroller.style.color = o.color;
      if (o.outlineAlternate && index % 2 !== 0) scroller.classList.add('sv-outline');

      for (var i = 0; i < Math.max(1, o.numCopies); i++) {
        var span = document.createElement('span');
        span.className = 'sv-copy' + (o.className ? ' ' + o.className : '');
        if (i > 0) span.setAttribute('aria-hidden', 'true');
        if (!o.separator && o.gap > 0) span.style.paddingRight = o.gap + 'px';
        span.appendChild(document.createTextNode(String(text) + ' '));
        if (o.separator) {
          var sep = document.createElement('span');
          sep.className = 'sv-sep';
          if (o.gap > 0) sep.style.margin = '0 ' + o.gap / 2 + 'px';
          sep.textContent = o.separator;
          span.appendChild(sep);
          span.appendChild(document.createTextNode(' '));
        }
        scroller.appendChild(span);
        if (i === 0) row.first = span;
      }
      parallax.appendChild(scroller);
      root.appendChild(parallax);
      row.parallax = parallax;
      row.scroller = scroller;
      rows.push(row);
      if (ro) ro.observe(row.first);

      if (o.draggable && !reduce) bindDrag(row);
    });

    el.classList.add('sv-host');
    el.appendChild(root);

    var measure = function () { rows.forEach(function (row) { row.copyWidth = row.first.offsetWidth; }); };
    measure();
    var onResize = function () { measure(); };
    if (!ro) window.addEventListener('resize', onResize);
    // Webfonts can change the copy width after first layout.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(function () {});

    function bindDrag(row) {
      var p = row.parallax;
      p.classList.add('sv-draggable');
      row.onDown = function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var g = row.drag;
        g.active = true; g.pointerId = e.pointerId; g.lastX = e.clientX; g.lastTime = e.timeStamp;
        g.velocity = 0; g.travel = 0; row.fling = 0;
        if (p.setPointerCapture) p.setPointerCapture(e.pointerId);
        p.style.cursor = 'grabbing';
      };
      row.onMove = function (e) {
        var g = row.drag;
        if (!g.active || e.pointerId !== g.pointerId) return;
        var dx = e.clientX - g.lastX;
        var dt = Math.max(e.timeStamp - g.lastTime, 1);
        g.lastX = e.clientX; g.lastTime = e.timeStamp; g.travel += Math.abs(dx);
        row.baseX += dx;
        g.velocity += ((dx / dt) * 1000 - g.velocity) * (1 - Math.exp(-dt / 50));
      };
      row.onUp = function (e) {
        var g = row.drag;
        if (!g.active || e.pointerId !== g.pointerId) return;
        g.active = false;
        var resting = e.timeStamp - g.lastTime > 90;
        row.fling = resting ? 0 : Math.max(-5000, Math.min(5000, g.velocity));
        g.velocity = 0;
        if (p.hasPointerCapture && p.hasPointerCapture(e.pointerId)) p.releasePointerCapture(e.pointerId);
        p.style.cursor = '';
      };
      row.onClickCapture = function (e) {
        if (row.drag.travel > 6) { e.preventDefault(); e.stopPropagation(); }
      };
      p.addEventListener('pointerdown', row.onDown);
      p.addEventListener('pointermove', row.onMove);
      p.addEventListener('pointerup', row.onUp);
      p.addEventListener('pointercancel', row.onUp);
      p.addEventListener('click', row.onClickCapture, true);
    }

    // Scroll velocity source + spring (motion's useVelocity -> useSpring).
    var lastScrollY = window.scrollY || window.pageYOffset || 0;
    var smooth = 0;
    var smoothV = 0;
    var visible = true;
    var io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (entries) {
      visible = entries.some(function (en) { return en.isIntersecting; });
    }) : null;
    if (io) io.observe(root);

    function readVelocity(seconds) {
      var y = window.scrollY || window.pageYOffset || 0;
      var dy = y - lastScrollY;
      lastScrollY = y;
      var lenis = window.lenis;
      if (lenis && lenis.isScrolling === 'smooth' && typeof lenis.velocity === 'number') {
        // Lenis velocity is px per Lenis frame; Lenis runs once per ticker frame.
        return lenis.velocity / seconds;
      }
      return dy / seconds;
    }

    function mapVelocity(v) {
      var i0 = mapIn[0], i1 = mapIn[1], o0 = mapOut[0], o1 = mapOut[1];
      if (i1 === i0) return o0;
      return o0 + ((v - i0) / (i1 - i0)) * (o1 - o0);
    }

    function render(row) {
      var x = row.copyWidth === 0 ? 0 : wrap(-row.copyWidth, 0, row.baseX);
      var t = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      if (row.skew !== 0) t += ' skewX(' + row.skew.toFixed(3) + 'deg)';
      if (row.scale !== 1) t += ' scaleY(' + row.scale.toFixed(4) + ')';
      if (t !== row.lastX) { row.scroller.style.transform = t; row.lastX = t; }
    }

    function tick(deltaMs) {
      var delta = Math.min(Math.max(deltaMs || 16.67, 1), 100);
      var seconds = delta / 1000;
      var raw = readVelocity(seconds);

      // Spring toward raw velocity, semi-implicit Euler substeps at 240 Hz.
      var steps = Math.max(1, Math.ceil(seconds / (1 / 240)));
      var h = seconds / steps;
      for (var s = 0; s < steps; s++) {
        smoothV += (o.stiffness * (raw - smooth) - o.damping * smoothV) * h;
        smooth += smoothV * h;
      }
      if (Math.abs(smooth) < 0.01 && Math.abs(smoothV) < 0.01 && raw === 0) { smooth = 0; smoothV = 0; }
      var factor = mapVelocity(smooth);

      if (reduce) return;

      rows.forEach(function (row) {
        var grab = row.drag;
        var sec = Math.min(delta, 64) / 1000;
        var targetPace = grab.active || (o.pauseOnHover && hovered) ? 0 : 1;
        row.pace += (targetPace - row.pace) * (1 - Math.exp(-delta / 150));

        var moveBy = row.direction * row.baseVelocity * (delta / 1000);
        if (factor < 0) row.direction = -1;
        else if (factor > 0) row.direction = 1;
        moveBy += row.direction * moveBy * factor;
        var travel = moveBy * row.pace;

        if (!grab.active && row.fling !== 0) {
          travel += row.fling * sec;
          row.fling *= Math.exp(-delta / 420);
          if (Math.abs(row.fling) < 4) row.fling = 0;
        }
        row.baseX += travel;

        if (o.skewWithVelocity || o.scaleWithVelocity || row.skew !== 0 || row.scale !== 1) {
          var thrown = grab.active ? grab.velocity : row.fling;
          var scrollSurge = Math.tanh(Math.abs(smooth) / 1600) * row.pace;
          var throwSurge = Math.tanh(Math.abs(thrown) / 2000);
          var surge = Math.max(scrollSurge, throwSurge);
          var heading = throwSurge > scrollSurge
            ? Math.sign(thrown)
            : Math.sign(travel) || row.direction * Math.sign(row.baseVelocity);
          var ease = 1 - Math.exp(-delta / 110);
          var nextSkew = row.skew + (-heading * o.skewWithVelocity * surge - row.skew) * ease;
          var nextScale = row.scale + (1 + o.scaleWithVelocity * surge - row.scale) * ease;
          row.skew = Math.abs(nextSkew) < 0.01 && !o.skewWithVelocity ? 0 : nextSkew;
          row.scale = Math.abs(nextScale - 1) < 0.0005 && !o.scaleWithVelocity ? 1 : nextScale;
        }

        if (visible) render(row);
      });
    }

    var useGsap = !!(window.gsap && window.gsap.ticker);
    var gsapCb = function (time, deltaTime) { tick(deltaTime); };
    var rafId = 0;
    var rafLast = 0;
    var rafCb = function (now) {
      tick(rafLast ? now - rafLast : 16.67);
      rafLast = now;
      rafId = requestAnimationFrame(rafCb);
    };
    if (useGsap) window.gsap.ticker.add(gsapCb);
    else rafId = requestAnimationFrame(rafCb);
    rows.forEach(render);

    var api = {
      el: el,
      root: root,
      get velocity() { return smooth; },
      get reducedMotion() { return reduce; },
      refresh: measure,
      destroy: function () {
        if (useGsap) window.gsap.ticker.remove(gsapCb);
        if (rafId) cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        window.removeEventListener('resize', onResize);
        root.removeEventListener('pointerenter', onEnter);
        root.removeEventListener('pointerleave', onLeave);
        rows.forEach(function (row) {
          if (!row.onDown) return;
          row.parallax.removeEventListener('pointerdown', row.onDown);
          row.parallax.removeEventListener('pointermove', row.onMove);
          row.parallax.removeEventListener('pointerup', row.onUp);
          row.parallax.removeEventListener('pointercancel', row.onUp);
          row.parallax.removeEventListener('click', row.onClickCapture, true);
        });
        if (root.parentNode) root.parentNode.removeChild(root);
        el.classList.remove('sv-host');
        if (el.__scrollVelocity === api) el.__scrollVelocity = null;
      }
    };
    el.__scrollVelocity = api;
    return api;
  }

  window.ScrollVelocity = ScrollVelocity;
})();
