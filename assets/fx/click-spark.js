/* Ported from React Bits by David Haz, MIT + Commons Clause */
/*
 * ClickSpark, plain browser JS. One fixed full-viewport canvas, sparks on every pointerdown.
 * Usage: var sparks = window.ClickSpark({ sparkColor: '#FE9D47' });
 *        sparks.spark(x, y); sparks.destroy();
 * Does nothing under prefers-reduced-motion unless the URL carries ?motion=1.
 */
(function () {
  'use strict';

  var EASINGS = {
    linear: function (t) { return t; },
    'ease-in': function (t) { return t * t; },
    'ease-out': function (t) { return 1 - Math.pow(1 - t, 3); },
    'ease-in-out': function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    spring: function (t) { return 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2); }
  };

  var SHAPES = ['line', 'streak', 'dot', 'star'];
  var MAX_BURSTS = 32;
  var GRAVITY = 500;

  var NOOP = { spark: function () {}, destroy: function () {} };
  var current = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function pick(opts, key, fallback) {
    return opts[key] === undefined || opts[key] === null ? fallback : opts[key];
  }

  function toColors(value) {
    var list = (Array.isArray(value) ? value : [value]).filter(Boolean);
    return list.length ? list : ['#ffffff'];
  }

  function starPath(ctx, x, y, radius, rotation) {
    var pinch = radius * 0.16;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rotation) * radius, y + Math.sin(rotation) * radius);
    for (var i = 1; i <= 4; i++) {
      var a = rotation + (i * Math.PI) / 2;
      var mid = a - Math.PI / 4;
      ctx.quadraticCurveTo(x + Math.cos(mid) * pinch, y + Math.sin(mid) * pinch, x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
    ctx.closePath();
  }

  function channels(ctx, color) {
    ctx.fillStyle = color;
    var normal = String(ctx.fillStyle);
    var hex = /^#([0-9a-f]{6})$/i.exec(normal);
    if (hex) {
      var value = parseInt(hex[1], 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }
    var rgb = /^rgba?\(([^)]+)\)$/i.exec(normal);
    if (rgb) {
      return rgb[1].split(',').slice(0, 3).map(function (part) {
        return parseFloat(part);
      });
    }
    return [0, 0, 0];
  }

  function motionForced() {
    try {
      return new URLSearchParams(window.location.search).get('motion') === '1';
    } catch (e) {
      return false;
    }
  }

  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function ClickSpark(opts) {
    opts = opts || {};
    if (typeof window === 'undefined' || !document.body) return NOOP;
    if (prefersReduced() && !motionForced()) return NOOP;
    if (current) current.destroy();

    var easing = pick(opts, 'easing', 'ease-out');
    var shape = pick(opts, 'shape', 'line');
    var s = {
      colors: toColors(pick(opts, 'sparkColor', '#FE9D47')),
      size: Math.max(0, pick(opts, 'sparkSize', 14)),
      radius: Math.max(0, pick(opts, 'sparkRadius', 30)) * Math.max(0, pick(opts, 'extraScale', 1)),
      count: clamp(Math.round(pick(opts, 'sparkCount', 8)), 1, 64),
      width: Math.max(0.5, pick(opts, 'sparkWidth', 2)),
      duration: Math.max(60, pick(opts, 'duration', 500)),
      ease: EASINGS[easing] || EASINGS['ease-out'],
      shape: SHAPES.indexOf(shape) >= 0 ? shape : 'line',
      randomness: clamp(pick(opts, 'randomness', 0.2), 0, 1),
      gravity: Math.max(0, pick(opts, 'gravity', 0)),
      spread: clamp(pick(opts, 'spread', 360), 0, 360),
      direction: pick(opts, 'direction', 0),
      glow: clamp(pick(opts, 'glow', 0), 0, 1),
      ring: !!opts.ring,
      disabled: !!opts.disabled
    };

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'click-spark-canvas';
    var cs = canvas.style;
    cs.position = 'fixed';
    cs.top = '0';
    cs.left = '0';
    cs.width = '100vw';
    cs.height = '100vh';
    cs.display = 'block';
    cs.pointerEvents = 'none';
    cs.zIndex = '9999';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.parentNode.removeChild(canvas);
      return NOOP;
    }

    var bursts = [];
    var raf = 0;
    var ratio = 1;
    var sizedW = 0;
    var sizedH = 0;
    var alive = true;

    function fit() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var r = Math.min(window.devicePixelRatio || 1, 2);
      if (w === sizedW && h === sizedH && r === ratio) return;
      sizedW = w;
      sizedH = h;
      ratio = r;
      canvas.width = Math.max(1, Math.ceil(w * r));
      canvas.height = Math.max(1, Math.ceil(h * r));
    }

    function drop(seconds) {
      return 0.5 * s.gravity * GRAVITY * seconds * seconds;
    }

    function position(burst, spark, distance, seconds) {
      return [burst.x + Math.cos(spark.angle) * distance, burst.y + Math.sin(spark.angle) * distance + drop(seconds)];
    }

    function drawSpark(burst, spark, elapsed) {
      var life = s.duration * spark.life;
      var p = elapsed / life;
      if (p >= 1) return false;
      var e = s.ease(clamp(p, 0, 1));
      var seconds = elapsed / 1000;
      var distance = s.radius * spark.reach * e;
      var width = s.width * spark.scale;
      var fade = 1 - smoothstep(s.shape === 'line' ? 0.55 : 0.7, 1, p);
      if (fade <= 0) return true;
      ctx.strokeStyle = spark.color;
      ctx.fillStyle = spark.color;
      var a, b, x, y, radius;

      if (s.shape === 'line') {
        var length = s.size * spark.scale * Math.pow(1 - p, 1.6);
        a = position(burst, spark, distance, seconds);
        b = position(burst, spark, distance + Math.max(0.01, length), seconds);
        ctx.lineCap = 'round';
        if (spark.glow > 0) {
          ctx.globalAlpha = fade * 0.14 * spark.glow;
          ctx.lineWidth = width * 4.5;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
        ctx.globalAlpha = fade;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        return true;
      }

      if (s.shape === 'streak') {
        var lag = Math.min(elapsed, 70 + s.size * 4 * spark.scale);
        var back = s.ease(clamp((elapsed - lag) / life, 0, 1));
        var head = position(burst, spark, distance, seconds);
        var tail = position(burst, spark, s.radius * spark.reach * back, Math.max(0, seconds - lag / 1000));
        var hx = head[0], hy = head[1], tx = tail[0], ty = tail[1];
        var dx = hx - tx;
        var dy = hy - ty;
        var len = Math.hypot(dx, dy) || 1;
        var nx = (-dy / len) * width * 0.5;
        var ny = (dx / len) * width * 0.5;
        var paint = function (spreadWidth, alpha) {
          var gradient = ctx.createLinearGradient(tx, ty, hx, hy);
          gradient.addColorStop(0, spark.clear);
          gradient.addColorStop(1, spark.color);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(hx + nx * spreadWidth, hy + ny * spreadWidth);
          ctx.lineTo(hx - nx * spreadWidth, hy - ny * spreadWidth);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = spark.color;
          ctx.beginPath();
          ctx.arc(hx, hy, width * 0.5 * spreadWidth, 0, Math.PI * 2);
          ctx.fill();
        };
        if (spark.glow > 0) paint(3.2, fade * 0.16 * spark.glow);
        paint(1, fade);
        return true;
      }

      if (s.shape === 'dot') {
        a = position(burst, spark, distance, seconds);
        radius = width * 1.25 * (1 - 0.5 * e);
        if (spark.glow > 0) {
          ctx.globalAlpha = fade * 0.18 * spark.glow;
          ctx.beginPath();
          ctx.arc(a[0], a[1], radius * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(a[0], a[1], radius, 0, Math.PI * 2);
        ctx.fill();
        return true;
      }

      a = position(burst, spark, distance, seconds);
      x = a[0];
      y = a[1];
      var twinkle = Math.pow(Math.sin(Math.PI * clamp(p * 1.1, 0, 1)), 0.7);
      radius = s.size * 0.6 * spark.scale * twinkle;
      var rotation = spark.angle + spark.spin * p * Math.PI * 0.5;
      if (radius <= 0.05) return true;
      if (spark.glow > 0) {
        ctx.globalAlpha = fade * 0.2 * spark.glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = fade;
      starPath(ctx, x, y, radius, rotation);
      ctx.fill();
      return true;
    }

    function drawRing(burst, elapsed) {
      var life = s.duration * 0.8;
      var p = elapsed / life;
      if (p >= 1) return false;
      var radius = 2 + s.radius * 0.6 * EASINGS['ease-out'](p);
      ctx.globalAlpha = Math.pow(1 - p, 2) * 0.7;
      ctx.strokeStyle = burst.sparks.length ? burst.sparks[0].color : s.colors[0];
      ctx.lineWidth = Math.max(0.5, s.width * (1 - p) * 0.9);
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    }

    function frame(now) {
      raf = 0;
      if (!alive) return;
      var i, burst;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (i = 0; i < bursts.length; i++) {
        burst = bursts[i];
        ctx.clearRect(
          Math.floor(burst.box.left * ratio) - 1,
          Math.floor(burst.box.top * ratio) - 1,
          Math.ceil((burst.box.right - burst.box.left) * ratio) + 2,
          Math.ceil((burst.box.bottom - burst.box.top) * ratio) + 2
        );
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      var survivors = [];
      for (i = 0; i < bursts.length; i++) {
        burst = bursts[i];
        var elapsed = now - burst.start;
        var live = false;
        if (s.ring && drawRing(burst, elapsed)) live = true;
        for (var j = 0; j < burst.sparks.length; j++) {
          if (drawSpark(burst, burst.sparks[j], elapsed)) live = true;
        }
        if (live) survivors.push(burst);
      }
      ctx.globalAlpha = 1;
      bursts = survivors;
      if (bursts.length) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    function spawn(clientX, clientY) {
      if (!alive || s.disabled) return;
      fit();
      var offset = Math.floor(Math.random() * s.colors.length);
      var full = s.spread >= 359.5;
      var arc = (s.spread * Math.PI) / 180;
      var heading = ((s.direction - 90) * Math.PI) / 180;
      var step = full ? (Math.PI * 2) / s.count : s.count > 1 ? arc / (s.count - 1) : 0;
      var sparks = [];
      for (var i = 0; i < s.count; i++) {
        var base = full ? heading + step * i : s.count > 1 ? heading - arc / 2 + step * i : heading;
        var jitter = (Math.random() - 0.5) * s.randomness;
        var color = s.colors[(i + offset) % s.colors.length];
        var ch = channels(ctx, color);
        sparks.push({
          angle: base + jitter * (step || arc || 1) * 0.9,
          reach: 1 + (Math.random() - 0.5) * 0.7 * s.randomness,
          scale: 1 + (Math.random() - 0.5) * 0.8 * s.randomness,
          life: 1 + (Math.random() - 0.5) * 0.5 * s.randomness,
          spin: Math.random() - 0.5,
          color: color,
          clear: 'rgba(' + ch[0] + ', ' + ch[1] + ', ' + ch[2] + ', 0)',
          glow: s.glow * (0.35 + 0.65 * ((0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]) / 255))
        });
      }
      var longest = s.duration * (1 + 0.25 * s.randomness);
      var fall = drop(longest / 1000);
      var reach =
        s.radius * (1 + 0.35 * s.randomness) * (s.ease === EASINGS.spring ? 1.15 : 1) +
        s.size * (1 + 0.4 * s.randomness) +
        s.width * (s.glow > 0 ? 6 : 2) +
        6;
      var box = {
        left: Math.max(clientX - reach, 0),
        top: Math.max(clientY - reach, 0),
        right: Math.min(clientX + reach, sizedW),
        bottom: Math.min(clientY + reach + fall, sizedH)
      };
      if (box.right - box.left < 1 || box.bottom - box.top < 1) return;
      bursts.push({ x: clientX, y: clientY, start: performance.now(), sparks: sparks, box: box });
      if (bursts.length > MAX_BURSTS) bursts.splice(0, bursts.length - MAX_BURSTS);
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;
      spawn(event.clientX, event.clientY);
    }

    function onClick(event) {
      // Keyboard activation (Enter/Space on a button or link) fires click with detail 0 and no pointerdown.
      if (event.detail !== 0) return;
      var target = event.target && event.target.getBoundingClientRect ? event.target : null;
      if (!target) return;
      var rect = target.getBoundingClientRect();
      spawn(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    function onResize() {
      if (!bursts.length) return;
      fit();
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    document.addEventListener('click', onClick, true);
    window.addEventListener('resize', onResize, { passive: true });
    fit();

    var api = {
      spark: function (x, y) {
        spawn(x === undefined ? window.innerWidth / 2 : x, y === undefined ? window.innerHeight / 2 : y);
      },
      destroy: function () {
        if (!alive) return;
        alive = false;
        cancelAnimationFrame(raf);
        raf = 0;
        bursts = [];
        document.removeEventListener('pointerdown', onPointerDown, { capture: true });
        document.removeEventListener('click', onClick, true);
        window.removeEventListener('resize', onResize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (current === api) current = null;
      }
    };
    current = api;
    return api;
  }

  window.ClickSpark = ClickSpark;
})();
