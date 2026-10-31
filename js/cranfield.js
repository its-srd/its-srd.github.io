/* Cranfield page: the suction sketch and the UNet, both built up by the scroll. */
(function () {
  'use strict';

  const hasMotion = document.documentElement.classList.contains('has-motion');
  const flow = { strength: hasMotion ? 0 : 1 };

  /* Air drawn into the pocket, and the pressure falling inside it. All lengths are in the
     sketch's own units: car lengths from the nose and down from the ceiling. */
  function suction(canvas) {
    const ctx = canvas.getContext('2d');
    const X0 = 70, Y0 = 70, S = 860, W = 1000, H = 470;
    const FANS = [0.4, 0.6], WALLS = [0.29, 0.71], FLOOR = 0.06, DUCT_TOP = 0.135, ROTOR_Y = 0.098, ROTOR_R = 0.047;
    const px = function (x) { return X0 + S * x; };
    const py = function (y) { return Y0 + S * y; };
    let scale = 1;
    let visible = false;
    let time = 0;
    let last = 0;

    /* Fixed, nested streamlines: in under the walls and along the ceiling, then up through
       each fan. Those nearest the ceiling turn last, so the lines never cross. */
    function sample(c) {
      const pts = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
        pts.push([px(a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0]), py(a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1])]);
      }
      return pts;
    }
    const SAMPLES = 48;
    const lines = [];
    [false, true].forEach(function (mirror) {
      const mx = function (x) { return mirror ? 1 - x : x; };
      for (let i = 0; i < 5; i++) {
        const y = 0.005 + i * 0.0045, turn = 0.395 - i * 0.01;
        lines.push(sample([[mx(0.253), y], [mx(0.33), y], [mx(turn), y * 0.9], [mx(turn), DUCT_TOP + 0.01]]));
      }
      for (let i = 0; i < 3; i++) {
        const y = 0.004 + i * 0.005, turn = 0.41 + i * 0.0175;
        lines.push(sample([[mx(0.497), y], [mx(0.47), y], [mx(turn), y * 0.9], [mx(turn), DUCT_TOP + 0.01]]));
      }
    });
    const parts = [];
    lines.forEach(function (pts, n) {
      for (let i = 0; i < 2; i++) {
        parts.push({ pts: pts, t: (i / 2 + n * 0.137) % 1, speed: 0.34 + (n % 4) * 0.025 });
      }
    });

    function trace(pts, from, to) {
      const a = Math.max(0, Math.floor(from * SAMPLES)), b = Math.min(SAMPLES, Math.ceil(to * SAMPLES));
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      for (let i = a + 1; i <= b; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    function pressure(k) {
      const a = 0.62 * k * (0.93 + 0.07 * Math.sin(time * 1.6));
      const g = ctx.createLinearGradient(px(WALLS[0]), 0, px(WALLS[1]), 0);
      g.addColorStop(0, 'rgba(84,124,255,' + a * 0.08 + ')');
      g.addColorStop(0.2, 'rgba(84,124,255,' + a * 0.75 + ')');
      g.addColorStop(0.27, 'rgba(84,124,255,' + a + ')');
      g.addColorStop(0.73, 'rgba(84,124,255,' + a + ')');
      g.addColorStop(0.8, 'rgba(84,124,255,' + a * 0.75 + ')');
      g.addColorStop(1, 'rgba(84,124,255,' + a * 0.08 + ')');
      ctx.fillStyle = g;
      ctx.fillRect(px(WALLS[0]), py(0), px(WALLS[1]) - px(WALLS[0]), py(FLOOR) - py(0));
      FANS.forEach(function (f) {
        const d = ctx.createLinearGradient(0, py(FLOOR), 0, py(DUCT_TOP));
        d.addColorStop(0, 'rgba(84,124,255,' + a + ')');
        d.addColorStop(1, 'rgba(84,124,255,0)');
        ctx.fillStyle = d;
        ctx.fillRect(px(f - 0.052), py(FLOOR), px(f + 0.052) - px(f - 0.052), py(DUCT_TOP) - py(FLOOR));
      });
    }

    function rotors(k) {
      const blades = 7;
      FANS.forEach(function (f, n) {
        const cx = px(f), cy = py(ROTOR_Y), rx = S * ROTOR_R, ry = S * 0.009;
        ctx.lineWidth = 1.4;
        for (let i = 0; i < blades; i++) {
          const a = time * (1.2 + k * 11) * (n ? -1 : 1) + i * Math.PI * 2 / blades;
          const front = Math.sin(a) > 0;
          ctx.strokeStyle = 'rgba(230,236,238,' + (front ? 0.85 : 0.28) + ')';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
          ctx.stroke();
        }
      });
    }

    function draw(dt) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const k = flow.strength;
      if (k > 0.001) {
        pressure(k);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = window.innerWidth < 860 ? 2.2 : 1;
        ctx.strokeStyle = 'rgba(230,236,238,' + 0.2 * k + ')';
        lines.forEach(function (pts) { trace(pts, 0, 1); });
        ctx.lineWidth = window.innerWidth < 860 ? 3.2 : 1.6;
        parts.forEach(function (p) {
          p.t = (p.t + dt * p.speed * (0.25 + k)) % 1;
          /* Air speeds up as it nears the fan. */
          const s = Math.pow(p.t, 1.5);
          ctx.strokeStyle = 'rgba(230,236,238,' + Math.sin(Math.PI * p.t) * k * 0.95 + ')';
          trace(p.pts, s - 0.14, s);
        });
      }
      /* The rotors are hidden until the ducts are drawn. */
      if (k > 0.001 || !hasMotion) rotors(k);
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 860 ? 1.5 : 2);
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      scale = canvas.width / W;
      draw(0);
    }

    function frame(now) {
      if (!visible) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;
      draw(dt);
      requestAnimationFrame(frame);
    }

    resize();
    new ResizeObserver(resize).observe(canvas);
    if (hasMotion) {
      new IntersectionObserver(function (entries) {
        const was = visible;
        visible = entries[0].isIntersecting;
        if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
      }).observe(canvas);
    }
  }

  const canvas = document.querySelector('.suction__flow');
  if (canvas) suction(canvas);

  if (!hasMotion) return;

  buildStage(document.querySelector('.stage--suction'), function (tl) {
    tl.fromTo(flow, { strength: 0 }, { strength: 1, duration: 0.22, ease: 'power1.inOut' }, 0.46);
  });
  buildStage(document.querySelector('.stage--unet'));
})();
