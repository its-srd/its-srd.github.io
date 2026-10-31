/* Hero flow: runs a lattice Boltzmann solve around the car on the GPU and draws
   streaklines from an inlet rake. If WebGL2 float targets are missing, or the
   visitor prefers reduced motion, the still image in the page stays visible. */
(function () {
  'use strict';

  const stage = document.querySelector('[data-flow]');
  if (!stage || !window.FlowShaders || !window.CarShape) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = stage.querySelector('.hero__canvas');
  const overlay = stage.querySelector('.hero__car');

  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: true, depth: false, stencil: false,
    powerPreference: 'high-performance'
  });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return;

  const S = window.FlowShaders;
  const U = 0.1;              /* inlet speed, lattice units */
  const TAU = 0.54;          /* molecular relaxation time */
  const STEPS_PER_SECOND = 360;
  const RELEASE_EVERY = 5;    /* steps between smoke parcels, about half a cell of travel */
  const WARMUP_STEPS = 1800;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  let P;
  try {
    P = {
      step: program(S.fullscreenVert, S.stepFrag),
      particle: program(S.fullscreenVert, S.particleFrag),
      line: program(S.lineVert, S.lineFrag),
      bg: program(S.fullscreenVert, S.bgFrag)
    };
  } catch (err) {
    console.warn('Flow hero: using the still image.', err);
    return;
  }

  function texture(w, h, internal, format, type, filter, data) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
    return t;
  }

  function latticeFields(W, H) {
    const weights = [4/9, 1/9, 1/9, 1/9, 1/9, 1/36, 1/36, 1/36, 1/36];
    const c = [[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
    const feq = weights.map(function (w, i) {
      const cu = c[i][0] * U;
      return w * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * U * U);
    });
    const a = new Float32Array(W * H * 4);
    const b = new Float32Array(W * H * 4);
    const d = new Float32Array(W * H * 4);
    for (let k = 0; k < W * H; k++) {
      for (let j = 0; j < 4; j++) { a[k*4+j] = feq[j]; b[k*4+j] = feq[j+4]; }
      d[k*4] = feq[8]; d[k*4+3] = 1;
    }
    return [a, b, d];
  }

  function makeLatticeTarget(W, H, init) {
    const f = init.map(function (data) {
      return texture(W, H, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, data);
    });
    const macro = texture(W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    f.concat(macro).forEach(function (t, i) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    });
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Lattice target incomplete');
    return { f, macro, fbo };
  }

  function makeParticleTarget(N, R) {
    const tex = texture(N, R, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Particle target incomplete');
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo };
  }

  function layout(W, H) {
    const a = W / H;
    const t = Math.max(0, Math.min(1, (a - 0.7) / 0.8));
    const L = W * (0.9 + (0.54 - 0.9) * t);
    const x0 = W * (0.05 + (0.2 - 0.05) * t);
    const ground = Math.round(H * 0.33);
    return { L, x0, ground };
  }

  function buildMask(W, H, g) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(g.L, 0, 0, -g.L, g.x0, H - g.ground);
    ctx.fill(new Path2D(window.CarShape.BODY));
    const px = ctx.getImageData(0, 0, W, H).data;
    const car = new Float32Array(W * H);
    const mask = new Uint8Array(W * H * 4);
    for (let row = 0; row < H; row++) {
      const srcRow = H - 1 - row;
      for (let col = 0; col < W; col++) {
        const inCar = px[(srcRow * W + col) * 4 + 3] > 127;
        car[row * W + col] = inCar ? 1 : 0;
        mask[(row * W + col) * 4] = inCar ? 255 : row < g.ground ? 128 : 0;
      }
    }
    /* Surface normals, from the gradient of a blurred mask, are stored in green and blue. */
    const R = 3;
    const at = function (x, y) {
      return car[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let gx = 0;
        let gy = 0;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const v = at(x + dx, y + dy);
            gx -= v * dx;
            gy -= v * dy;
          }
        }
        const len = Math.hypot(gx, gy) || 1;
        const k = (y * W + x) * 4;
        mask[k + 1] = Math.round((gx / len * 0.5 + 0.5) * 255);
        mask[k + 2] = Math.round((gy / len * 0.5 + 0.5) * 255);
        mask[k + 3] = 255;
      }
    }
    return mask;
  }

  function drawCar(g, cssW, cssH, W) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = Math.round(cssW * dpr);
    overlay.height = Math.round(cssH * dpr);
    const ctx = overlay.getContext('2d');
    const s = (cssW * dpr) / W;
    const groundPx = overlay.height - g.ground * s;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    ctx.strokeStyle = 'rgba(230,236,238,0.22)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(0, groundPx);
    ctx.lineTo(overlay.width, groundPx);
    ctx.stroke();

    const L = g.L * s;
    ctx.setTransform(L, 0, 0, -L, g.x0 * s, groundPx);
    const unit = dpr / L;
    ctx.fillStyle = '#132530';
    const body = new Path2D(window.CarShape.BODY);
    ctx.fill(body);
    ctx.strokeStyle = 'rgba(230,236,238,0.72)';
    ctx.lineWidth = unit * 1.1;
    ctx.stroke(body);
    ctx.strokeStyle = 'rgba(230,236,238,0.34)';
    ctx.lineWidth = unit;
    ctx.stroke(new Path2D(window.CarShape.DETAIL));
    const helmet = window.CarShape.HELMET;
    ctx.beginPath();
    ctx.arc(helmet[0], helmet[1], helmet[2], 0, Math.PI * 2);
    ctx.fillStyle = '#0B171F';
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,236,238,0.6)';
    ctx.stroke();
    window.CarShape.WHEELS.forEach(function (w) {
      ctx.beginPath();
      ctx.arc(w[0], w[1], w[2], 0, Math.PI * 2);
      ctx.fillStyle = '#0B171F';
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,236,238,0.5)';
      ctx.lineWidth = unit;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w[0], w[1], w[2] * 0.58, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(230,236,238,0.2)';
      ctx.stroke();
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  let sim = null;
  const phone = window.innerWidth < 760;
  const warmBatch = phone ? 20 : 40;
  let cellTarget = phone ? 30000 : 88000;
  let maxSteps = phone ? 8 : 12;
  let qualityDrops = 0;

  function disposeSim() {
    if (!sim) return;
    [sim.a, sim.b].forEach(function (t) {
      t.f.forEach(function (x) { gl.deleteTexture(x); });
      gl.deleteTexture(t.macro);
      gl.deleteFramebuffer(t.fbo);
    });
    [sim.pa, sim.pb].forEach(function (t) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    });
    gl.deleteTexture(sim.mask);
    sim = null;
  }

  function buildSim() {
    disposeSim();
    const rect = stage.getBoundingClientRect();
    const cssW = Math.max(rect.width, 1);
    const cssH = Math.max(stage.offsetHeight, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const aspect = cssW / cssH;
    const H = Math.max(80, Math.round(Math.sqrt(cellTarget / aspect)));
    const W = Math.max(80, Math.round(H * aspect));
    const g = layout(W, H);

    const init = latticeFields(W, H);
    const a = makeLatticeTarget(W, H, init);
    const b = makeLatticeTarget(W, H, init);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const mask = texture(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST, buildMask(W, H, g));

    const rakes = Math.min(32, cssW < 760 ? 18 : 30);
    const yLow = g.ground + g.L * 0.052;
    const yHigh = Math.min(H - 6, g.ground + g.L * 0.62);
    const rakeY = new Float32Array(32);
    for (let i = 0; i < rakes; i++) rakeY[i] = yLow + (yHigh - yLow) * Math.pow(i / (rakes - 1), 1.6);

    const N = Math.min(1500, Math.ceil(W * 3.4));
    sim = {
      W, H, a, b, mask, N, rakes, rakeY, g,
      pa: makeParticleTarget(N, rakes),
      pb: makeParticleTarget(N, rakes),
      head: 0, sinceRelease: 0, warm: 0, tint: 0, lastW: cssW
    };
    drawCar(g, cssW, cssH, W);
  }

  const force = { x: -1000, y: -1000, fx: 0, fy: 0 };
  let lastPointer = null;

  function disturb(clientX, clientY, gain, lim) {
    if (!sim) return;
    const r = canvas.getBoundingClientRect();
    const sc = sim.W / r.width;
    const x = (clientX - r.left) * sc;
    const y = (r.bottom - clientY) * sc;
    if (lastPointer) {
      force.fx = Math.max(-lim, Math.min(lim, (x - lastPointer.x) * gain));
      force.fy = Math.max(-lim, Math.min(lim, (y - lastPointer.y) * gain));
      force.x = x; force.y = y;
    }
    lastPointer = { x, y };
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') disturb(e.clientX, e.clientY, 0.0012, 0.0045);
  }, { passive: true });

  /* A finger stirs the flow too. Sideways strokes stay on the hero, and upward ones still
     scroll the page, because these listeners never block the browser's own scrolling. */
  stage.addEventListener('touchstart', function () { lastPointer = null; }, { passive: true });
  stage.addEventListener('touchmove', function (e) {
    disturb(e.touches[0].clientX, e.touches[0].clientY, 0.004, 0.014);
  }, { passive: true });

  /* While the page moves on a phone the solver eases off, so scrolling gets the GPU first. */
  let lastScroll = -1000;
  if (phone) window.addEventListener('scroll', function () { lastScroll = performance.now(); }, { passive: true });

  function bindTex(unit, tex, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  function lattice(n) {
    const { p, u } = P.step;
    gl.useProgram(p);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, sim.W, sim.H);
    gl.uniform2i(u.uSize, sim.W, sim.H);
    gl.uniform1f(u.uTau, TAU);
    gl.uniform1f(u.uU, U);
    gl.uniform1f(u.uWakeX, sim.g.x0 + sim.g.L * 0.8);
    gl.uniform1f(u.uWakeY, sim.g.ground + sim.g.L * 0.22);
    gl.uniform1f(u.uWakeS, sim.g.L * 0.17);
    gl.uniform4f(u.uForce, force.x, force.y, force.fx, force.fy);
    bindTex(3, sim.mask, u.uMask);
    for (let i = 0; i < n; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sim.b.fbo);
      bindTex(0, sim.a.f[0], u.uF0);
      bindTex(1, sim.a.f[1], u.uF1);
      bindTex(2, sim.a.f[2], u.uF2);
      bindTex(4, sim.a.macro, u.uPrev);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const t = sim.a; sim.a = sim.b; sim.b = t;
    }
  }

  function advect(dt) {
    sim.sinceRelease += dt;
    if (sim.sinceRelease >= RELEASE_EVERY) {
      sim.sinceRelease -= RELEASE_EVERY;
      sim.head = (sim.head + 1) % sim.N;
    }
    const { p, u } = P.particle;
    gl.useProgram(p);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, sim.N, sim.rakes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.pb.fbo);
    gl.uniform2f(u.uGrid, sim.W, sim.H);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uRakeX, 1.0);
    gl.uniform1f(u.uHead, sim.head);
    gl.uniform1fv(u.uRakeY, sim.rakeY);
    bindTex(0, sim.pa.tex, u.uPos);
    bindTex(1, sim.a.macro, u.uMacro);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const t = sim.pa; sim.pa = sim.pb; sim.pb = t;
  }

  function render(lines) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);

    let q = P.bg;
    gl.useProgram(q.p);
    gl.uniform2f(q.u.uGrid, sim.W, sim.H);
    gl.uniform1f(q.u.uTint, sim.tint);
    bindTex(0, sim.a.macro, q.u.uMacro);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!lines) return;
    q = P.line;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(q.p);
    gl.uniform2f(q.u.uGrid, sim.W, sim.H);
    gl.uniform1i(q.u.uHead, sim.head);
    gl.uniform1i(q.u.uN, sim.N);
    bindTex(0, sim.pa.tex, q.u.uPos);
    for (let r = 0; r < sim.rakes; r++) {
      gl.uniform1i(q.u.uRake, r);
      gl.uniform1f(q.u.uAlpha, r === 0 ? 0.22 : r % 2 ? 0.34 : 0.56);
      gl.drawArrays(gl.LINES, 0, (sim.N - 1) * 2);
    }
  }

  /* Frame loop */
  let running = false;
  let inView = true;
  let scrollPaused = false;
  let rafId = 0;
  let last = 0;
  let budget = 0;
  let slowSum = 0;
  let slowCount = 0;
  let totalSteps = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dtMs = Math.min(now - last, 100);
    last = now;
    if (!sim) return;

    if (sim.warm < WARMUP_STEPS) {
      lattice(warmBatch);
      sim.warm += warmBatch;
      sim.tint = 0;
      render(false);
      return;
    }

    budget += (dtMs / 1000) * STEPS_PER_SECOND;
    const cap = now - lastScroll < 180 ? Math.min(3, maxSteps) : maxSteps;
    const n = Math.max(1, Math.min(cap, Math.floor(budget)));
    budget = Math.max(0, budget - n);
    if (budget > maxSteps * 2) budget = 0;

    lattice(n);
    advect(n);
    totalSteps += n;
    force.fx *= phone ? 0.93 : 0.86;
    force.fy *= phone ? 0.93 : 0.86;
    sim.tint = Math.min(1, sim.tint + dtMs / 2400);
    render(true);

    slowSum += dtMs;
    if (++slowCount >= 120) {
      const avg = slowSum / slowCount;
      slowSum = 0;
      slowCount = 0;
      if (avg > 25) {
        if (maxSteps > 6) {
          maxSteps -= 3;
        } else if (qualityDrops < 2) {
          qualityDrops++;
          cellTarget = Math.round(cellTarget * 0.62);
          buildSim();
        }
      }
    }
  }

  function start() {
    if (running || !sim) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function sync() {
    if (inView && !scrollPaused && !document.hidden) start();
    else stop();
  }

  new IntersectionObserver(function (entries) {
    inView = entries[0].isIntersecting;
    sync();
  }).observe(stage);
  document.addEventListener('visibilitychange', sync);

  let resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      /* Ignore height-only changes, which on phones are just the address bar. */
      if (sim && Math.abs(stage.getBoundingClientRect().width - sim.lastW) > 2) buildSim();
    }, 220);
  });

  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    stop();
    sim = null;
    document.documentElement.classList.remove('flow-live');
  });

  try {
    buildSim();
  } catch (err) {
    console.warn('Flow hero: using the still image.', err);
    return;
  }

  document.documentElement.classList.add('flow-live');

  window.FlowHero = {
    setScrollPaused: function (v) { scrollPaused = v; sync(); },
    stats: function () {
      return { running, steps: totalSteps, W: sim && sim.W, H: sim && sim.H, maxSteps, qualityDrops };
    },
    /* Flattens both canvases, used to refresh assets/hero-fallback.webp. */
    capture: function () {
      render(true);
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      const x = c.getContext('2d');
      x.drawImage(canvas, 0, 0);
      x.drawImage(overlay, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.86);
    }
  };

  sync();
})();
