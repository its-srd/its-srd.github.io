/* Scroll figures: every part in a stage carries data-at, its moment in the scroll from 0 to 1.
   A page can add its own steps to the timeline through the optional callback. */
window.buildStage = function (stage, extend) {
  'use strict';

  if (!document.documentElement.classList.contains('has-motion')) return;
  const phone = window.innerWidth < 860;
  const tl = gsap.timeline({
    /* On phones the drawing starts as the figure comes up, so it never arrives on an empty screen,
       and it stays close behind the finger. */
    scrollTrigger: { trigger: stage, start: phone ? 'top 55%' : 'top top', end: 'bottom bottom', scrub: phone ? 0.25 : 0.9 },
    defaults: { ease: 'none' }
  });
  stage.querySelectorAll('[data-at]').forEach(function (el) {
    const at = parseFloat(el.dataset.at);
    const dur = parseFloat(el.dataset.dur || 0.07);
    if (el.classList.contains('draw')) {
      tl.fromTo(el, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur, ease: 'power1.inOut' }, at);
    } else if (el.classList.contains('grow')) {
      tl.fromTo(el, { scaleY: 0, opacity: 0, transformOrigin: '50% 100%' }, { scaleY: 1, opacity: 1, duration: dur, ease: 'power2.out' }, at);
    } else {
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: dur }, at);
    }
  });
  stage.querySelectorAll('.stage__step').forEach(function (step) {
    const from = parseFloat(step.dataset.from);
    const to = parseFloat(step.dataset.to);
    if (from > 0) tl.fromTo(step, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.05, ease: 'power1.out' }, from);
    if (to < 1) tl.to(step, { opacity: 0, y: -10, duration: 0.04 }, to);
  });
  if (extend) extend(tl);
  tl.to({}, { duration: 0.001 }, 1);
};
