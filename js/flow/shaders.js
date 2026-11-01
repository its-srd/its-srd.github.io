/* GLSL for the hero flow. D2Q9 lattice Boltzmann with a Smagorinsky term,
   streaklines advected through the solved velocity field. */
window.FlowShaders = (function () {
  'use strict';

  const fullscreenVert = `#version 300 es
  out vec2 vUv;
  void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  /* One lattice step: pull streaming, boundaries, then BGK collision.
     Output 3 is the macro field (u, v, unused, solid) used by everything else. */
  const stepFrag = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  uniform sampler2D uF0, uF1, uF2, uMask, uPrev;
  uniform ivec2 uSize;
  uniform float uTau, uU, uWakeX, uWakeY, uWakeS;
  uniform vec4 uForce;
  layout(location = 0) out vec4 o0;
  layout(location = 1) out vec4 o1;
  layout(location = 2) out vec4 o2;
  layout(location = 3) out vec4 oMacro;

  const ivec2 C[9] = ivec2[9](ivec2(0,0), ivec2(1,0), ivec2(0,1), ivec2(-1,0), ivec2(0,-1),
                              ivec2(1,1), ivec2(-1,1), ivec2(-1,-1), ivec2(1,-1));
  const int OPP[9] = int[9](0, 3, 4, 1, 2, 7, 8, 5, 6);
  const int MIRROR_Y[9] = int[9](0, 1, 4, 3, 2, 8, 7, 6, 5);
  const float W[9] = float[9](4.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0,
                              1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0);

  float fetchF(ivec2 p, int i) {
    if (i < 4) return texelFetch(uF0, p, 0)[i];
    if (i < 8) return texelFetch(uF1, p, 0)[i - 4];
    return texelFetch(uF2, p, 0).r;
  }

  float feq(int i, float rho, vec2 u) {
    float cu = dot(vec2(C[i]), u);
    return W[i] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * dot(u, u));
  }

  void writeAll(float f[9]) {
    o0 = vec4(f[0], f[1], f[2], f[3]);
    o1 = vec4(f[4], f[5], f[6], f[7]);
    o2 = vec4(f[8], 0.0, 0.0, 1.0);
  }

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float solid = texelFetch(uMask, p, 0).r;
    float f[9];

    if (solid > 0.25) {
      for (int i = 0; i < 9; i++) f[i] = W[i];
      writeAll(f);
      oMacro = vec4(0.0, 0.0, 0.0, solid);
      return;
    }

    vec2 inflow = vec2(uU, 0.0);
    for (int i = 0; i < 9; i++) {
      ivec2 q = p - C[i];
      if (q.x < 0) {
        f[i] = feq(i, 1.0, inflow);                         /* velocity inlet */
      } else if (q.x >= uSize.x) {
        f[i] = fetchF(p - ivec2(1, 0), i);                  /* zero gradient outlet */
      } else if (q.y >= uSize.y) {
        f[i] = fetchF(ivec2(clamp(p.x - C[i].x, 0, uSize.x - 1), p.y), MIRROR_Y[i]);  /* free slip top */
      } else if (q.y < 0) {
        f[i] = fetchF(p, OPP[i]);
      } else {
        float ms = texelFetch(uMask, q, 0).r;
        if (ms > 0.25) {
          /* Bounce back from a wall moving with the air: the floor at free stream, the
             car at the local tangential speed. That makes the car a slip surface, with
             no boundary layer to separate, so the flow stays attached to the end. */
          vec2 wallU = inflow;
          if (ms > 0.75) {
            vec2 n = texelFetch(uMask, p, 0).gb * 2.0 - 1.0;
            vec2 local = texelFetch(uPrev, p, 0).xy;
            wallU = (local - n * dot(local, n)) * 0.98;
          }
          f[i] = fetchF(p, OPP[i]) + 6.0 * W[i] * dot(vec2(C[i]), wallU);
        } else {
          f[i] = fetchF(q, i);
        }
      }
    }

    float rho = 0.0;
    vec2 mom = vec2(0.0);
    for (int i = 0; i < 9; i++) { rho += f[i]; mom += f[i] * vec2(C[i]); }

    /* A cell that has gone non-physical resets to free stream rather than spreading NaNs. */
    if (!(rho > 0.6 && rho < 1.4)) {
      for (int i = 0; i < 9; i++) f[i] = feq(i, 1.0, inflow);
      writeAll(f);
      oMacro = vec4(inflow, 0.0, 0.0);
      return;
    }

    vec2 u = mom / rho;
    float speed = length(u);
    if (speed > 0.28) u *= 0.28 / speed;

    float Pxx = 0.0, Pyy = 0.0, Pxy = 0.0;
    for (int i = 0; i < 9; i++) {
      float ne = f[i] - feq(i, rho, u);
      vec2 c = vec2(C[i]);
      Pxx += c.x * c.x * ne;
      Pyy += c.y * c.y * ne;
      Pxy += c.x * c.y * ne;
    }
    float Q = sqrt(Pxx * Pxx + Pyy * Pyy + 2.0 * Pxy * Pxy);
    const float Cs2 = 0.0225;
    float tau = 0.5 * (uTau + sqrt(uTau * uTau + 18.0 * 1.41421 * Cs2 * Q / rho));

    /* Absorbing zones at the outlet, inlet and top. Pressure waves and old vortices
       relax back to free stream here instead of reflecting across the domain. */
    float xn = float(p.x) / float(uSize.x);
    float yn = float(p.y) / float(uSize.y);
    /* The first term starts at the rear wing's leading edge and keeps the wake from rolling up. */
    float wake = smoothstep(uWakeX, uWakeX + 0.1 * float(uSize.x), float(p.x)) * 0.85;
    float sponge = max(max(wake, smoothstep(0.92, 1.0, xn)),
                   max(1.0 - smoothstep(0.0, 0.05, xn), smoothstep(0.9, 1.0, yn)));
    tau += sponge * 0.9;

    vec2 d = vec2(p) - uForce.xy;
    float g = exp(-dot(d, d) / 220.0);
    vec2 uShift = u + uForce.zw * g;

    /* A wing making downforce throws air upward, so the wake relaxes toward an upwash
       behind the wing that fades back to free stream further downstream. */
    float ux = (float(p.x) - uWakeX - 0.12 * float(uSize.x)) / (0.17 * float(uSize.x));
    float uy = (float(p.y) - uWakeY) / uWakeS;
    vec2 target = inflow + vec2(0.0, uU * 0.85 * exp(-ux * ux - uy * uy));

    float absorb = sponge * sponge * 0.14;
    for (int i = 0; i < 9; i++) {
      f[i] += (feq(i, rho, uShift) - f[i]) / tau;
      f[i] += (feq(i, 1.0, target) - f[i]) * absorb;
    }

    writeAll(f);
    oMacro = vec4(u, 0.0, 0.0);
  }`;

  /* Each texel is one smoke parcel: xy in cells, z alive. Rows are rake lines,
     columns a ring buffer of release times, so a row is a true streakline. */
  const particleFrag = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  uniform sampler2D uPos, uMacro;
  uniform vec2 uGrid;
  uniform float uDt, uRakeX, uHead;
  uniform float uRakeY[32];
  out vec4 o;
  /* Averaged over a few cells, so lines ride the flow and not lattice-scale ripple. */
  vec2 vel(vec2 x) {
    const float r = 1.5;
    return 0.25 * (texture(uMacro, (x + vec2(r, 0.0)) / uGrid).xy + texture(uMacro, (x - vec2(r, 0.0)) / uGrid).xy
                 + texture(uMacro, (x + vec2(0.0, r)) / uGrid).xy + texture(uMacro, (x - vec2(0.0, r)) / uGrid).xy);
  }
  void main() {
    ivec2 t = ivec2(gl_FragCoord.xy);
    vec4 s = texelFetch(uPos, t, 0);
    if (t.x == int(uHead)) {
      o = vec4(uRakeX, uRakeY[t.y], 1.0, 0.0);
      return;
    }
    if (s.z < 0.5) { o = s; return; }
    vec2 mid = s.xy + vel(s.xy) * uDt * 0.5;
    vec2 x = s.xy + vel(mid) * uDt;
    float solid = texture(uMacro, x / uGrid).a;
    float alive = (solid > 0.6 || x.x > uGrid.x - 1.0) ? 0.0 : 1.0;
    o = vec4(x, alive, 0.0);
  }`;

  const lineVert = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  uniform sampler2D uPos;
  uniform vec2 uGrid;
  uniform int uRake, uHead, uN;
  out float vA;
  void main() {
    /* Drawn as separate segments, so one dead parcel can't connect across the screen. */
    int seg = gl_VertexID / 2;
    int end = gl_VertexID & 1;
    int colA = (uHead - seg + uN * 2) % uN;
    vec4 a = texelFetch(uPos, ivec2(colA, uRake), 0);
    vec4 b = texelFetch(uPos, ivec2((uHead - seg - 1 + uN * 2) % uN, uRake), 0);
    vec4 s = end == 0 ? a : b;
    float age = float(seg + end) / float(uN);
    float xn = s.x / uGrid.x;
    float len = length(a.xy - b.xy);
    /* Slow parcels bunch up in boundary layers; dim them so they don't burn white. */
    float density = clamp(len / 0.26, 0.0, 1.0);
    float stretch = 1.0 - smoothstep(4.0, 13.0, len);
    /* Hide any segment that turns sharply from the one before it: real streaklines don't. */
    vec4 c = texelFetch(uPos, ivec2((uHead - seg - 2 + uN * 2) % uN, uRake), 0);
    vec2 ab = b.xy - a.xy;
    vec2 bc = c.xy - b.xy;
    float smoothness = smoothstep(-0.6, 0.1, dot(ab, bc) / max(length(ab) * length(bc), 1e-5));
    /* The flow is steady, so soft pulses tied to the parcels show it moving. The wave
       count is a whole number, so the pattern joins up around the ring buffer. */
    float colP = float((uHead - seg - end + uN * 2) % uN);
    float wave = 6.2832 * floor(float(uN) / 150.0) * colP / float(uN) + float(uRake) * 2.399;
    float pulse = 0.5 + 0.5 * pow(0.5 + 0.5 * sin(wave), 3.0) * 1.3;
    vA = a.z * b.z * density * stretch * smoothness * pulse
       * (1.0 - smoothstep(0.72, 1.0, age)) * (1.0 - smoothstep(0.86, 1.0, xn));
    gl_Position = vec4(s.xy / uGrid * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const lineFrag = `#version 300 es
  precision highp float;
  in float vA;
  uniform float uAlpha;
  out vec4 o;
  void main() {
    o = vec4(vec3(0.902, 0.925, 0.933) * vA * uAlpha, 1.0);
  }`;

  /* Background: tunnel colour, tinted faintly by the sign of vorticity. */
  const bgFrag = `#version 300 es
  precision highp float;
  precision highp sampler2D;
  in vec2 vUv;
  uniform sampler2D uMacro;
  uniform vec2 uGrid;
  uniform float uTint;
  out vec4 o;
  float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 t = 1.0 / uGrid;
    /* Wide stencil, which keeps the rasterised car surface from showing as a saw tooth. */
    vec2 dx = vec2(t.x * 2.5, 0.0);
    vec2 dy = vec2(0.0, t.y * 2.5);
    float dvdx = texture(uMacro, vUv + dx).y - texture(uMacro, vUv - dx).y;
    float dudy = texture(uMacro, vUv + dy).x - texture(uMacro, vUv - dy).x;
    float w = (dvdx - dudy) * 0.2 / 0.022;
    float a = texture(uMacro, vUv).a;
    vec3 tunnel = vec3(0.059, 0.118, 0.157);
    vec3 floorCol = vec3(0.043, 0.090, 0.122);
    vec3 cool = vec3(0.231, 0.298, 0.753);
    vec3 warm = vec3(0.914, 0.631, 0.357);
    float k = smoothstep(0.12, 1.3, abs(w)) * 0.14 * uTint * (1.0 - smoothstep(0.1, 0.4, a));
    vec3 col = mix(tunnel, w > 0.0 ? warm : cool, k);
    col = mix(col, floorCol, smoothstep(0.2, 0.45, a));
    col += (noise(gl_FragCoord.xy) - 0.5) / 255.0 * 1.5;
    o = vec4(col, 1.0);
  }`;

  return { fullscreenVert, stepFrag, particleFrag, lineVert, lineFrag, bgFrag };
})();
