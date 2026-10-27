/* Ported from React Bits by David Haz, MIT + Commons Clause */
/*
 * Threads background, plain browser JS (WebGL2, no dependencies).
 * Usage: var fx = window.Threads(container, { color: '#02A6FE', accentColor: '#FE9D47' });
 *        fx.setPaused(true); fx.destroy();
 */
(function () {
  'use strict';

  var LINE_VERTEX = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 aPoint;',
    'uniform float uTime;',
    'uniform vec2 uResolution;',
    'uniform vec2 uFrame;',
    'uniform float uAmplitude;',
    'uniform float uDistance;',
    'uniform vec2 uMouse;',
    'uniform float uCount;',
    'uniform float uThickness;',
    'uniform float uSoftness;',
    'uniform float uWaves;',
    'uniform float uSplit;',
    'uniform float uFray;',
    'uniform float uSeed;',
    'uniform vec2 uTurn;',
    'uniform vec4 uPart;',
    'uniform float uTaper;',
    'out float vEdge;',
    'out float vBand;',
    'out float vDraw;',
    'out float vAlpha;',
    'out float vIndex;',
    '',
    'float Perlin2D(vec2 P) {',
    '  vec2 Pi = floor(P);',
    '  vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);',
    '  vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);',
    '  Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;',
    '  Pt += vec2(26.0, 161.0).xyxy;',
    '  Pt *= Pt;',
    '  Pt = Pt.xzxz * Pt.yyww;',
    '  vec4 hash_x = fract(Pt * (1.0 / 951.135664));',
    '  vec4 hash_y = fract(Pt * (1.0 / 642.949883));',
    '  vec4 grad_x = hash_x - 0.49999;',
    '  vec4 grad_y = hash_y - 0.49999;',
    '  vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y) * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);',
    '  grad_results *= 1.4142135623730950;',
    '  vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);',
    '  vec4 blend2 = vec4(blend, vec2(1.0 - blend));',
    '  return dot(grad_results, blend2.zxzx * blend2.wwyy);',
    '}',
    '',
    'void main() {',
    '  float perc = float(gl_InstanceID) / uCount;',
    '  float x = aPoint.x;',
    '  float pixel = 1.0 / max(uResolution.x, uResolution.y);',
    '  float splitPoint = uSplit + perc * uFray;',
    '  float amplitudeNormal = smoothstep(splitPoint, max(0.7, splitPoint + 0.2), x);',
    '  float finalAmplitude = amplitudeNormal * 0.5 * uAmplitude * (1.0 + (uMouse.y - 0.5) * 0.2);',
    '  float timeScaled = uTime / 10.0 + (uMouse.x - 0.5);',
    '  float blur = smoothstep(splitPoint, splitPoint + 0.05, x) * perc;',
    '  float xnoise = mix(',
    '    Perlin2D(vec2(timeScaled * 2.5 + uSeed, (x * uWaves + perc) * 2.5)),',
    '    Perlin2D(vec2(timeScaled * 3.5 + uSeed, (x * uWaves + timeScaled) * 3.5)) / 1.5,',
    '    x * 0.3',
    '  );',
    '  float y = 0.5 + (perc - 0.5) * uDistance + xnoise / 2.0 * finalAmplitude;',
    '  vec2 local = vec2((x - 0.5) * uFrame.x, (y - 0.5) * uFrame.y);',
    '  if (uPart.z > 0.0) {',
    '    vec2 delta = local - uPart.xy;',
    '    float reach = uPart.w;',
    '    float pull = exp(-dot(delta, delta) / (reach * reach));',
    '    local.y += delta.y * pull * uPart.z;',
    '  }',
    '  float width = 7.0 * uThickness * pixel * (1.0 - perc);',
    '  float band = (width / 2.0 + 10.0 * uSoftness * pixel * blur) * uFrame.y;',
    '  float draw = max(band, 1.0);',
    '  local.y += aPoint.y * draw;',
    '  vec2 turned = vec2(local.x * uTurn.x - local.y * uTurn.y, local.x * uTurn.y + local.y * uTurn.x);',
    '  gl_Position = vec4(turned / (uResolution * 0.5), 0.0, 1.0);',
    '  vEdge = aPoint.y * draw;',
    '  vBand = band;',
    '  vDraw = draw;',
    '  vAlpha = 1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3)) * uTaper;',
    '  vIndex = perc;',
    '}'
  ].join('\n');

  var LINE_FRAGMENT = [
    '#version 300 es',
    'precision highp float;',
    'in float vEdge;',
    'in float vBand;',
    'in float vDraw;',
    'in float vAlpha;',
    'in float vIndex;',
    'uniform vec3 uColor;',
    'uniform vec3 uAccent;',
    'out vec4 outColor;',
    'void main() {',
    '  float coverage = (1.0 - smoothstep(0.0, vDraw, abs(vEdge))) * (vBand / vDraw) * vAlpha;',
    '  outColor = vec4(mix(uColor, uAccent, vIndex) * coverage, coverage);',
    '}'
  ].join('\n');

  var SCREEN_VERTEX = [
    '#version 300 es',
    'in vec2 aPosition;',
    'out vec2 vUv;',
    'void main() {',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var SCREEN_FRAGMENT = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'uniform sampler2D uLines;',
    'uniform vec2 uResolution;',
    'uniform float uFade;',
    'uniform float uOpacity;',
    'uniform float uCurve;',
    'out vec4 outColor;',
    '',
    'float smootherstep(float edge, float x) {',
    '  float t = clamp(x / edge, 0.0, 1.0);',
    '  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);',
    '}',
    '',
    'void main() {',
    '  vec4 lines = texture(uLines, vUv);',
    '  float alpha = lines.a;',
    '  vec3 color = alpha > 0.0001 ? lines.rgb / alpha : vec3(0.0);',
    '  float mask = uOpacity;',
    '  if (uFade > 0.0) {',
    '    vec2 px = vUv * uResolution;',
    '    float edge = uFade * min(uResolution.x, uResolution.y) * 0.5;',
    '    mask *= smootherstep(edge, px.x) * smootherstep(edge, uResolution.x - px.x);',
    '    mask *= smootherstep(edge, px.y) * smootherstep(edge, uResolution.y - px.y);',
    '  }',
    '  outColor = vec4(color * pow(alpha, uCurve), alpha) * mask;',
    '}'
  ].join('\n');

  var MAX_RENDER_DIM = 1920;

  var NOOP = { destroy: function () {}, setPaused: function () {} };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pick(opts, key, fallback) {
    return opts[key] === undefined || opts[key] === null ? fallback : opts[key];
  }

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  }

  function link(gl, vertexSource, fragmentSource) {
    var vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    var program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
    gl.deleteProgram(program);
    return null;
  }

  function locate(gl, program, names) {
    var result = {};
    for (var i = 0; i < names.length; i++) result[names[i]] = gl.getUniformLocation(program, names[i]);
    return result;
  }

  function Threads(container, opts) {
    opts = opts || {};
    if (!container || typeof window === 'undefined') return NOOP;

    var color = pick(opts, 'color', [1, 1, 1]);
    var accentColor = opts.accentColor;
    var settings = {
      amplitude: pick(opts, 'amplitude', 1.7),
      distance: pick(opts, 'distance', 0.4),
      enableMouseInteraction: !!opts.enableMouseInteraction,
      lineCount: clamp(Math.round(pick(opts, 'lineCount', 90)), 1, 400),
      thickness: Math.max(0, pick(opts, 'thickness', 0.6)),
      softness: Math.max(0, pick(opts, 'softness', 1.3)),
      speed: pick(opts, 'speed', 0.6),
      waves: Math.max(0, pick(opts, 'waves', 1.05)),
      split: clamp(pick(opts, 'split', 0.04), 0, 1),
      fray: clamp(pick(opts, 'fray', 0.5), 0, 1),
      angle: pick(opts, 'angle', 25),
      seed: pick(opts, 'seed', 0),
      parting: clamp(pick(opts, 'parting', 0), 0, 1),
      taper: clamp(pick(opts, 'taper', 0.85), 0, 1),
      brightness: clamp(pick(opts, 'brightness', 1.4), 0.25, 2),
      fade: clamp(pick(opts, 'fade', 0), 0, 1),
      opacity: clamp(pick(opts, 'opacity', 1), 0, 1),
      paused: !!opts.paused
    };
    var still = !!opts.still;

    var canvas = document.createElement('canvas');
    var gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false
      });
    } catch (e) {
      gl = null;
    }
    if (!gl) return NOOP;

    var lineProgram = link(gl, LINE_VERTEX, LINE_FRAGMENT);
    var screenProgram = link(gl, SCREEN_VERTEX, SCREEN_FRAGMENT);
    if (!lineProgram || !screenProgram) return NOOP;

    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'threads-canvas';
    var cs = canvas.style;
    cs.position = 'absolute';
    cs.top = '0';
    cs.left = '0';
    cs.right = '0';
    cs.bottom = '0';
    cs.width = '100%';
    cs.height = '100%';
    cs.display = 'block';
    cs.pointerEvents = 'none';
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(canvas);

    var lineUniforms = locate(gl, lineProgram, [
      'uTime', 'uResolution', 'uFrame', 'uAmplitude', 'uDistance', 'uMouse', 'uCount', 'uThickness',
      'uSoftness', 'uWaves', 'uSplit', 'uFray', 'uSeed', 'uTurn', 'uPart', 'uTaper', 'uColor', 'uAccent'
    ]);
    var screenUniforms = locate(gl, screenProgram, ['uLines', 'uResolution', 'uFade', 'uOpacity', 'uCurve']);

    var lineVao = gl.createVertexArray();
    var lineBuffer = gl.createBuffer();
    gl.bindVertexArray(lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    var pointLocation = gl.getAttribLocation(lineProgram, 'aPoint');
    gl.enableVertexAttribArray(pointLocation);
    gl.vertexAttribPointer(pointLocation, 2, gl.FLOAT, false, 0, 0);

    var screenVao = gl.createVertexArray();
    var screenBuffer = gl.createBuffer();
    gl.bindVertexArray(screenVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, screenBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var positionLocation = gl.getAttribLocation(screenProgram, 'aPosition');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    var target = gl.createTexture();
    var framebuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    function toRgb(value) {
      if (Array.isArray(value)) {
        return [0, 1, 2].map(function (i) {
          var v = value[i] === undefined || value[i] === null ? 1 : Number(value[i]);
          return clamp(v, 0, 1);
        });
      }
      var probe = document.createElement('canvas');
      probe.width = 1;
      probe.height = 1;
      var ctx = probe.getContext('2d');
      if (!ctx) return [1, 1, 1];
      ctx.fillStyle = '#ffffff';
      ctx.fillStyle = String(value);
      ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    }

    var rgb = toRgb(color);
    var accent = accentColor === undefined || accentColor === null ? rgb : toRgb(accentColor);

    var state = {
      time: 0,
      width: 1,
      height: 1,
      segments: 0,
      mouse: [0.5, 0.5],
      targetMouse: [0.5, 0.5],
      pointer: [0, 0],
      targetPointer: [0, 0],
      presence: 0,
      inside: false
    };
    var raf = 0;
    var last = 0;
    var visible = true;
    var alive = true;

    function buildStrip(segments) {
      if (segments === state.segments) return;
      state.segments = segments;
      var points = new Float32Array((segments + 1) * 4);
      for (var i = 0; i <= segments; i++) {
        var u = i / segments;
        points.set([u, -1, u, 1], i * 4);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    }

    function render() {
      var s = settings;
      var w = canvas.width;
      var h = canvas.height;
      var radians = (s.angle * Math.PI) / 180;
      var cos = Math.cos(radians);
      var sin = Math.sin(radians);
      var length = Math.abs(w * cos) + Math.abs(h * sin);
      var across = Math.abs(w * sin) + Math.abs(h * cos);
      var scale = w / state.width;
      var mouse = s.enableMouseInteraction ? state.mouse : [0.5, 0.5];
      var strength = s.parting * state.presence * 2;
      var px = state.pointer[0] * scale;
      var py = state.pointer[1] * scale;
      var localX = px * cos + py * sin;
      var localY = -px * sin + py * cos;

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(lineProgram);
      gl.uniform1f(lineUniforms.uTime, state.time);
      gl.uniform2f(lineUniforms.uResolution, w, h);
      gl.uniform2f(lineUniforms.uFrame, length, across);
      gl.uniform1f(lineUniforms.uAmplitude, s.amplitude);
      gl.uniform1f(lineUniforms.uDistance, s.distance);
      gl.uniform2f(lineUniforms.uMouse, mouse[0], mouse[1]);
      gl.uniform1f(lineUniforms.uCount, s.lineCount);
      gl.uniform1f(lineUniforms.uThickness, s.thickness);
      gl.uniform1f(lineUniforms.uSoftness, s.softness);
      gl.uniform1f(lineUniforms.uWaves, s.waves);
      gl.uniform1f(lineUniforms.uSplit, s.split);
      gl.uniform1f(lineUniforms.uFray, s.fray);
      gl.uniform1f(lineUniforms.uSeed, s.seed * 13.37);
      gl.uniform2f(lineUniforms.uTurn, cos, sin);
      gl.uniform4f(lineUniforms.uPart, localX, localY, strength, Math.min(w, h) * 0.16);
      gl.uniform1f(lineUniforms.uTaper, s.taper);
      gl.uniform3f(lineUniforms.uColor, rgb[0], rgb[1], rgb[2]);
      gl.uniform3f(lineUniforms.uAccent, accent[0], accent[1], accent[2]);
      gl.bindVertexArray(lineVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (state.segments + 1) * 2, s.lineCount);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(screenProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.uniform1i(screenUniforms.uLines, 0);
      gl.uniform2f(screenUniforms.uResolution, w, h);
      gl.uniform1f(screenUniforms.uFade, s.fade);
      gl.uniform1f(screenUniforms.uOpacity, s.opacity);
      gl.uniform1f(screenUniforms.uCurve, 2 / s.brightness);
      gl.bindVertexArray(screenVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }

    function resize() {
      if (!alive) return;
      var width = Math.max(1, container.clientWidth);
      var height = Math.max(1, container.clientHeight);
      var cap = 1.5; // ponytail: phones get 1.5 too (crisper threads); drop phones to 1 if low-end devices stutter
      var baseDpr = Math.min(window.devicePixelRatio || 1, cap);
      var longest = Math.max(width, height) * baseDpr;
      var dpr = longest > MAX_RENDER_DIM ? (baseDpr * MAX_RENDER_DIM) / longest : baseDpr;
      var cw = Math.max(1, Math.round(width * dpr));
      var ch = Math.max(1, Math.round(height * dpr));
      state.width = width;
      state.height = height;
      if (cw !== canvas.width || ch !== canvas.height || !resize.done) {
        canvas.width = cw;
        canvas.height = ch;
        gl.bindTexture(gl.TEXTURE_2D, target);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        resize.done = true;
      }
      buildStrip(clamp(Math.round(width / 3), 96, 640));
      render();
    }

    function frame(now) {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      var s = settings;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      var moving = !s.paused && !still;
      if (moving) state.time += dt * s.speed;
      var follow = 1 - Math.exp(-dt * 3);
      state.mouse[0] += (state.targetMouse[0] - state.mouse[0]) * follow;
      state.mouse[1] += (state.targetMouse[1] - state.mouse[1]) * follow;
      var glide = 1 - Math.exp(-dt * 10);
      state.pointer[0] += (state.targetPointer[0] - state.pointer[0]) * glide;
      state.pointer[1] += (state.targetPointer[1] - state.pointer[1]) * glide;
      var wantPresence = state.inside && s.parting > 0 ? 1 : 0;
      state.presence += (wantPresence - state.presence) * (1 - Math.exp(-dt * 4));
      render();
      var settling =
        Math.abs(state.targetMouse[0] - state.mouse[0]) > 0.0005 ||
        Math.abs(state.targetMouse[1] - state.mouse[1]) > 0.0005 ||
        Math.abs(state.targetPointer[0] - state.pointer[0]) > 0.05 ||
        Math.abs(state.targetPointer[1] - state.pointer[1]) > 0.05 ||
        Math.abs(wantPresence - state.presence) > 0.002;
      if (moving || settling) raf = requestAnimationFrame(frame);
      else last = 0;
    }

    function wake() {
      if (still) return;
      if (!raf && alive && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function onPointerMove(event) {
      var rect = container.getBoundingClientRect();
      var x = (event.clientX - rect.left) / Math.max(1, rect.width);
      var y = (event.clientY - rect.top) / Math.max(1, rect.height);
      var inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (inside) {
        state.targetMouse = [x, 1 - y];
        state.targetPointer = [event.clientX - rect.left - rect.width / 2, rect.height / 2 - (event.clientY - rect.top)];
        if (!state.inside && state.presence < 0.01) state.pointer = state.targetPointer.slice();
      } else if (state.inside) {
        state.targetMouse = [0.5, 0.5];
      }
      state.inside = inside;
      wake();
    }

    function onPointerLeave() {
      state.inside = false;
      state.targetMouse = [0.5, 0.5];
      wake();
    }

    function onVisibility() {
      last = 0;
      wake();
    }

    var tracksPointer = !still && (settings.enableMouseInteraction || settings.parting > 0);

    var resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(container);
    else window.addEventListener('resize', resize);

    var intersection = null;
    if (!still) {
      if (typeof IntersectionObserver !== 'undefined') {
        intersection = new IntersectionObserver(function (entries) {
          visible = entries.some(function (entry) {
            return entry.isIntersecting;
          });
          if (visible) {
            last = 0;
            wake();
          }
        });
        intersection.observe(container);
      }
      document.addEventListener('visibilitychange', onVisibility);
      if (tracksPointer) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        document.documentElement.addEventListener('pointerleave', onPointerLeave);
      }
    }

    resize();
    wake();

    return {
      setPaused: function (value) {
        if (!alive) return;
        settings.paused = !!value;
        if (settings.paused) return;
        last = 0;
        wake();
      },
      destroy: function () {
        if (!alive) return;
        alive = false;
        cancelAnimationFrame(raf);
        raf = 0;
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener('resize', resize);
        if (intersection) intersection.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        if (tracksPointer) {
          window.removeEventListener('pointermove', onPointerMove);
          document.documentElement.removeEventListener('pointerleave', onPointerLeave);
        }
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(target);
        gl.deleteBuffer(lineBuffer);
        gl.deleteBuffer(screenBuffer);
        gl.deleteVertexArray(lineVao);
        gl.deleteVertexArray(screenVao);
        gl.deleteProgram(lineProgram);
        gl.deleteProgram(screenProgram);
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  window.Threads = Threads;
})();
