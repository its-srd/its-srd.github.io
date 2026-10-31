/* Formula 1 side profile in car lengths, y up, ground at y = 0, nose to the left.
   BODY is the solver's solid mask and the outline on screen. It is a centre-line
   slice, so the wheels and DETAIL are drawn on top and sit outboard of the flow. */
window.CarShape = (function () {
  'use strict';

  const CHASSIS =
    'M0.04 0.056 C0.09 0.068 0.16 0.088 0.25 0.098 C0.31 0.104 0.37 0.112 0.42 0.128 ' +
    'C0.46 0.142 0.49 0.168 0.515 0.172 C0.55 0.175 0.62 0.14 0.7 0.112 ' +
    'C0.78 0.092 0.85 0.082 0.905 0.072 L0.905 0.066 C0.86 0.05 0.81 0.03 0.76 0.018 ' +
    'L0.3 0.018 L0.27 0.03 C0.25 0.052 0.2 0.052 0.15 0.05 C0.1 0.046 0.07 0.046 0.04 0.056 Z ';

  const FRONT_WING =
    'M0 0.032 C0.03 0.02 0.06 0.02 0.09 0.028 L0.09 0.035 C0.06 0.029 0.03 0.031 0 0.039 Z ' +
    'M0.062 0.042 C0.078 0.04 0.092 0.048 0.104 0.062 L0.099 0.068 C0.088 0.056 0.075 0.05 0.059 0.05 Z ';

  /* Two-element inverted wing: a cambered main plane, a slot, then a steep flap.
     The air turns upward through it, and the reaction pushes the car down. */
  const REAR_WING =
    'M0.875 0.12 C0.89 0.106 0.925 0.104 0.948 0.118 C0.96 0.126 0.97 0.138 0.976 0.15 ' +
    'C0.957 0.133 0.928 0.125 0.903 0.125 C0.888 0.126 0.878 0.127 0.875 0.12 Z ' +
    'M0.968 0.172 C0.982 0.172 1 0.2 1.01 0.245 C0.998 0.228 0.98 0.205 0.962 0.183 C0.96 0.177 0.963 0.173 0.968 0.172 Z';

  const BODY = CHASSIS + FRONT_WING + REAR_WING;

  const DETAIL =
    'M0.395 0.118 C0.41 0.15 0.44 0.158 0.485 0.158 ' +                 /* halo */
    'M0.355 0.102 C0.45 0.104 0.6 0.08 0.74 0.032 ' +                   /* sidepod top */
    'M0.355 0.102 L0.345 0.045 L0.4 0.022 ' +                           /* sidepod inlet */
    'M0.875 0.09 L0.875 0.215 L1.012 0.255 L1.012 0.125 Z ' +             /* rear endplate */
    'M0 0.02 L0 0.062 L0.03 0.062 L0.045 0.02 Z ' +                     /* front endplate */
    'M0.17 0.075 L0.3 0.098 M0.17 0.055 L0.3 0.06 ' +                   /* front suspension */
    'M0.82 0.075 L0.72 0.088 M0.82 0.06 L0.72 0.05 ' +                  /* rear suspension */
    'M0.045 0.052 L0.05 0.034 M0.875 0.078 L0.925 0.108';               /* wing mounts */

  const HELMET = [0.445, 0.133, 0.016];
  const WHEELS = [[0.17, 0.065, 0.065], [0.82, 0.065, 0.065]];
  const HEIGHT = 0.25;

  return { BODY, DETAIL, HELMET, WHEELS, HEIGHT };
})();
