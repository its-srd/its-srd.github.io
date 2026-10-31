/* Caltec page: water and gas through a generic surface jet pump, built up by the scroll.
   Everything is in the sketch's own units, with the flow running left to right along y = 230. */
(function () {
  'use strict';

  const canvas = document.querySelector('.jet__flow');
  if (!canvas) return;
  const hasMotion = document.documentElement.classList.contains('has-motion');
  const ctx = canvas.getContext('2d');
  const W = 1000, H = 420, AXIS = 230, START = 54, END = 985, THROAT = 420, MIXED = 600;
  const small = window.innerWidth < 860;

  /* How far each part of the flow has got. The scroll moves these from 0 to 1. */
  const front = hasMotion ? { water: 0, gas: 0, mix: 0 } : { water: 1, gas: 1, mix: 1 };

  const lerp = function (a, b, k) { return a + (b - a) * k; };
  const smooth = function (a, b, x) {
    const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };

  /* Half height of the water stream: pipe, nozzle, jet opening out, mixing tube, diffuser. */
  function halfHeight(x) {
    if (x < 205) return 27;
    if (x < 322) return lerp(27, 6, smooth(205, 322, x));
    if (x < 480) return lerp(6, 10.5, smooth(322, 480, x));
    if (x < 620) return 10.5;
    if (x < 900) return lerp(10.5, 31, (x - 620) / 280);
    return 31;
  }

  /* Equal steps in time along x: narrow passages run fast, the diffuser slows the flow. */
  const TIMELINE = (function () {
    const xs = [];
    let x = START;
    while (x < END) {
      xs.push(x);
      x += 0.55 * Math.pow(30 / halfHeight(x), 0.8) * 2.2;
    }
    return xs;
  })();
  const STEPS = TIMELINE.length;

  const WATER_LINES = small ? [-0.72, -0.36, 0, 0.36, 0.72] : [-0.84, -0.56, -0.28, 0, 0.28, 0.56, 0.84];
  const PULSES = WATER_LINES.reduce(function (list, u, n) {
    for (let i = 0; i < 4; i++) list.push({ u: u, at: ((i / 4) + n * 0.17) % 1 });
    return list;
  }, []);

  function sampleCurve(c) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
      pts.push([a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]]);
    }
    return pts;
  }

  /* Gas comes down the inlet and around the nozzle on both sides, into the throat. */
  const GAS_LANES = [
    sampleCurve([[243, 74], [243, 184], [340, 205], [THROAT, 223]]),
    sampleCurve([[256, 74], [256, 180], [345, 211], [THROAT, 225]]),
    sampleCurve([[269, 74], [269, 178], [350, 216], [THROAT, 227]]),
    sampleCurve([[282, 74], [282, 178], [350, 219], [THROAT, 229]]),
    /* These two pass just beyond the nozzle tip, then along the lower side of the throat. */
    sampleCurve([[292, 74], [292, 175], [328, 205], [334, 232]]).concat(sampleCurve([[334, 232], [336, 266], [372, 262], [THROAT, 234]]).slice(1)),
    sampleCurve([[298, 74], [298, 175], [336, 205], [342, 232]]).concat(sampleCurve([[342, 232], [344, 256], [378, 254], [THROAT, 236]]).slice(1))
  ];
  const laneEnd = function (lane) { return GAS_LANES[lane][GAS_LANES[lane].length - 1]; };

  /* The inlet and chamber, leaving out the inside of the nozzle. */
  const INTERIOR = new Path2D('M238 74H302V165C302 180 340 192 420 221V239C380 250 350 298 300 298C265 298 240 275 214 266C250 260 285 246 324 238V222C285 214 250 200 214 194C226 190 238 183 238 170Z');

  function spawn(bubble, anywhere) {
    bubble.lane = Math.floor(Math.random() * GAS_LANES.length);
    bubble.along = anywhere ? Math.random() : 0;
    bubble.x = null;
    bubble.place = (Math.random() * 2 - 1) * 0.86;
    bubble.wobble = Math.random() * 6.28;
    return bubble;
  }
  const bubbles = [];
  for (let i = 0; i < (small ? 70 : 150); i++) {
    const b = spawn({}, true);
    /* Start spread along the whole pump, so the mixed flow is full from its first frame. */
    if (Math.random() > 0.3) {
      b.x = THROAT + Math.random() * (END - THROAT);
      b.entry = (laneEnd(b.lane)[1] - AXIS) / 10.5;
    }
    bubbles.push(b);
  }

  let scale = 1, time = 0, last = 0, visible = false;

  function waterFront() { return lerp(START, END, front.water); }
  function gasFront() { return lerp(THROAT, END, front.mix); }
  function edgeFade(x) { return 1 - smooth(930, END, x); }

  function drawTints() {
    if (front.gas > 0.001) {
      ctx.fillStyle = 'rgba(232,178,122,' + 0.05 * front.gas + ')';
      ctx.fill(INTERIOR);
    }
    if (front.water <= 0.001) return;
    const reach = waterFront();
    const g = ctx.createLinearGradient(START, 0, END, 0);
    const blue = 'rgba(92,140,255,';
    g.addColorStop(0, blue + '0.3)');
    g.addColorStop(0.28, blue + '0.42)');
    /* The mixed flow pales from water blue towards a blend of the two. */
    g.addColorStop(0.42, blue + '0.36)');
    g.addColorStop(0.62, 'rgba(' + lerp(92, 150, front.mix) + ',' + lerp(140, 165, front.mix) + ',' + lerp(255, 205, front.mix) + ',0.32)');
    g.addColorStop(0.93, 'rgba(' + lerp(92, 150, front.mix) + ',' + lerp(140, 165, front.mix) + ',' + lerp(255, 205, front.mix) + ',0.26)');
    g.addColorStop(1, 'rgba(150,165,205,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    let x = START;
    ctx.moveTo(x, AXIS - halfHeight(x));
    for (x = START; x <= reach; x += 6) ctx.lineTo(x, AXIS - halfHeight(x));
    for (x = Math.min(x, reach); x >= START; x -= 6) ctx.lineTo(x, AXIS + halfHeight(x));
    ctx.closePath();
    ctx.fill();
  }

  function drawWater(dt) {
    if (front.water <= 0.001) return;
    const reach = waterFront();
    ctx.lineCap = 'round';
    ctx.lineWidth = small ? 2 : 1;
    ctx.strokeStyle = 'rgba(190,212,255,0.16)';
    WATER_LINES.forEach(function (u) {
      ctx.beginPath();
      ctx.moveTo(START, AXIS + u * halfHeight(START));
      for (let x = START; x <= reach && x <= END; x += 6) ctx.lineTo(x, AXIS + u * halfHeight(x));
      ctx.stroke();
    });
    ctx.lineWidth = small ? 3 : 1.5;
    PULSES.forEach(function (p) {
      p.at = (p.at + dt * 0.3) % 1;
      const head = Math.floor(p.at * (STEPS - 1));
      const x = TIMELINE[head];
      if (x > reach) return;
      ctx.strokeStyle = 'rgba(214,228,255,' + 0.85 * smooth(0, 0.05, p.at) * edgeFade(x) + ')';
      ctx.beginPath();
      const tail = Math.max(0, head - 22);
      ctx.moveTo(TIMELINE[tail], AXIS + p.u * halfHeight(TIMELINE[tail]));
      for (let i = tail + 2; i <= head; i += 2) ctx.lineTo(TIMELINE[i], AXIS + p.u * halfHeight(TIMELINE[i]));
      ctx.stroke();
    });
  }

  function drawGasLanes() {
    if (front.gas <= 0.001) return;
    ctx.lineWidth = small ? 2 : 1;
    ctx.strokeStyle = 'rgba(232,178,122,' + 0.22 * front.gas + ')';
    GAS_LANES.forEach(function (pts) {
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
    });
  }

  function drawBubbles(dt) {
    if (front.gas <= 0.001) return;
    const reach = gasFront();
    const size = small ? 1.7 : 1;
    bubbles.forEach(function (b) {
      let x, y, r;
      if (b.x === null) {
        b.along += dt * (0.2 + b.along * 0.5);
        if (b.along >= 1) {
          b.x = THROAT;
          b.entry = (laneEnd(b.lane)[1] - AXIS) / 10.5;
          b.along = 1;
        }
        const pts = GAS_LANES[b.lane];
        const at = Math.min(pts.length - 1, b.along * (pts.length - 1));
        const i = Math.min(pts.length - 2, Math.floor(at));
        x = lerp(pts[i][0], pts[i + 1][0], at - i);
        y = lerp(pts[i][1], pts[i + 1][1], at - i);
        r = lerp(3.1, 1.9, smooth(0.5, 1, b.along));
      } else {
        const h = halfHeight(b.x);
        b.x += dt * 150 * Math.pow(30 / h, 0.8);
        if (b.x >= END) { spawn(b, false); return; }
        /* Over the mixing tube each bubble drifts from where it arrived to its own place in the
           stream, which is what spreads the gas evenly by the end of the tube. */
        const settled = smooth(THROAT, MIXED, b.x);
        const u = lerp(b.entry, b.place, settled) + Math.sin(time * 3 + b.wobble + b.x * 0.03) * 0.07 * settled;
        x = b.x;
        y = AXIS + Math.max(-0.92, Math.min(0.92, u)) * h;
        /* Small under the high pressure of the tube, growing a little as the diffuser slows the flow. */
        r = lerp(1.5, 2.3, smooth(620, 900, b.x));
      }
      if (x > reach) return;
      ctx.fillStyle = 'rgba(240,196,146,' + 0.92 * front.gas * edgeFade(x) + ')';
      ctx.beginPath();
      ctx.arc(x, y, r * size, 0, 6.2832);
      ctx.fill();
    });
  }

  function draw(dt) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawTints();
    drawGasLanes();
    drawWater(dt);
    drawBubbles(dt);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
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
  if (!hasMotion) return;

  new IntersectionObserver(function (entries) {
    const was = visible;
    visible = entries[0].isIntersecting;
    if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(canvas);

  buildStage(document.querySelector('.stage--jet'), function (tl) {
    tl.fromTo(front, { water: 0 }, { water: 1, duration: 0.24, ease: 'power1.inOut' }, 0.18);
    tl.fromTo(front, { gas: 0 }, { gas: 1, duration: 0.12, ease: 'power1.inOut' }, 0.44);
    tl.fromTo(front, { mix: 0 }, { mix: 1, duration: 0.3, ease: 'power1.inOut' }, 0.6);
  });
})();
