/* Smooth scroll, the exit from the tunnel, reveals and the folder stack. */
(function () {
  'use strict';

  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasMotion = !reduced && window.gsap && window.ScrollTrigger;
  let lenis = null;

  if (hasMotion) {
    root.classList.add('has-motion');
    gsap.registerPlugin(ScrollTrigger);
    /* A phone's address bar sliding away is not a layout change. */
    ScrollTrigger.config({ ignoreMobileResize: true });

    /* Smooth scroll is for wheels. A finger gets the phone's own scrolling, which nothing can delay. */
    if (window.Lenis && !window.matchMedia('(pointer: coarse)').matches) {
      lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
  }

  /* In-page links travel through the same smooth scroll. */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.8 });
      else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });

  /* The nav steps aside while reading downwards, so it never sits on top of the text,
     and returns on the way back up. */
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');
  if (nav) {
    let lastY = window.scrollY;
    const update = function () {
      const y = window.scrollY;
      nav.classList.toggle('nav--over-content', y > window.innerHeight * 0.5);
      if (Math.abs(y - lastY) > 6) {
        nav.classList.toggle('nav--hidden', !nav.classList.contains('nav--stay') && y > lastY && y > window.innerHeight * 0.5);
        lastY = y;
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* Back returns to the exact place on the home page when that is where the visitor came from. */
  const back = document.querySelector('.back');
  if (back) {
    back.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !document.referrer) return;
      const from = new URL(document.referrer);
      if (from.origin === location.origin && !from.pathname.includes('/projects/')) {
        e.preventDefault();
        history.back();
      }
    });
  }

  /* Opening a folder grows a window from it over the project's first view, then hands over
     to the real page. Links with data-hero reveal that page's opening photo in its exact place. */
  function openFolder(link, from) {
    const rect = from.getBoundingClientRect();
    const stock = getComputedStyle(from).backgroundColor;
    const heroSrc = link.dataset.hero;
    const layer = document.createElement('div');
    layer.className = 'folder-opening' + (heroSrc ? ' doc-head--photo' : '');
    layer.style.backgroundColor = stock;
    layer.setAttribute('aria-hidden', 'true');

    const clone = from.cloneNode(true);
    clone.classList.add('folder-opening__from');
    clone.style.cssText = 'left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;background:' + stock;
    layer.appendChild(clone);

    let photo = null;
    if (heroSrc) {
      photo = new Image();
      photo.className = 'doc-head__photo';
      photo.alt = '';
      photo.src = heroSrc;
      photo.style.opacity = 0;
      layer.appendChild(photo);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    layer.style.clipPath = 'inset(' + Math.max(rect.top, 0) + 'px ' + (w - rect.right) + 'px ' + Math.max(h - rect.bottom, 0) + 'px ' + rect.left + 'px round 8px)';
    document.body.appendChild(layer);
    if (lenis) lenis.stop();

    const run = function () {
      const tl = gsap.timeline({ onComplete: function () { window.location.href = link.href; } });
      tl.to(layer, { clipPath: 'inset(0px 0px 0px 0px round 0px)', duration: 0.95, ease: 'power3.inOut' }, 0);
      tl.to(clone, { opacity: 0, duration: 0.38, ease: 'power1.out' }, 0);
      if (photo) {
        tl.to(layer, { backgroundColor: 'rgb(15, 30, 40)', duration: 0.5, ease: 'none' }, 0.1);
        tl.to(photo, { opacity: 1, duration: 0.6, ease: 'power1.inOut' }, 0.12);
      }
    };
    /* A photo that is not ready yet gets a moment to decode, without making the click feel slow. */
    if (photo && photo.decode) {
      Promise.race([photo.decode().catch(function () {}), new Promise(function (r) { setTimeout(r, 250); })]).then(run);
    } else {
      run();
    }
  }

  document.querySelectorAll('.folder, .next').forEach(function (link) {
    const from = link.querySelector('.folder__front, .next__body');
    const preload = function () { if (link.dataset.hero) new Image().src = link.dataset.hero; };
    link.addEventListener('pointerenter', preload, { once: true });
    link.addEventListener('focus', preload, { once: true });
    link.addEventListener('click', function (e) {
      if (!hasMotion || !from || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      openFolder(link, from);
    });
  });

  /* Coming back from a project restores this page as it was left. */
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('.folder-opening').forEach(function (l) { l.remove(); });
    if (lenis) lenis.start();
  });

  /* A stacked folder taller than a short screen stops higher up, so all of it can be read. */
  if (window.ResizeObserver) {
    const heights = new ResizeObserver(function (entries) {
      entries.forEach(function (e) {
        e.target.style.setProperty('--h', e.target.getBoundingClientRect().height + 'px');
      });
    });
    document.querySelectorAll('.folders .folder').forEach(function (f) { heights.observe(f); });
  }

  /* The replay frame takes the height of its content, so it never scrolls inside the page. */
  const replay = document.querySelector('.embed iframe');
  if (replay) {
    const fit = function () {
      try {
        const doc = replay.contentDocument.documentElement;
        const size = function () {
          replay.style.height = doc.scrollHeight + 'px';
          if (hasMotion) ScrollTrigger.refresh();
        };
        replay.style.height = '';
        size();
        new ResizeObserver(function () {
          if (Math.abs(doc.scrollHeight - replay.offsetHeight) > 1) size();
        }).observe(doc);
      } catch (err) { /* Opened from disk: the fixed height in the stylesheet stands. */ }
    };
    replay.addEventListener('load', fit);
  }

  if (!hasMotion) return;

  /* On phones scroll-linked motion stays close behind the finger. */
  const phone = window.innerWidth < 860;
  const follow = function (s) { return phone ? 0.25 : s; };

  /* Leaving the tunnel */
  if (hero) {
    const flowLayers = ['.hero__canvas', '.hero__car', '.hero__still'];
    gsap.timeline({
      scrollTrigger: {
        trigger: hero, start: 'top top', end: 'bottom bottom', scrub: true,
        onUpdate: function (st) {
          if (window.FlowHero) window.FlowHero.setScrollPaused(st.progress > (phone ? 0.6 : 0.97));
        }
      },
      defaults: { ease: 'none' }
    })
      .to('.hero__text, .hero__cue', { opacity: 0, y: -40, duration: 0.3 }, 0)
      .to(flowLayers, { yPercent: -9, duration: 1 }, 0)
      .to('.hero__exit', { opacity: 1, duration: 0.8 }, 0.15);
  }

  /* Lead sentence in About: words come up to full strength as they are read. */
  document.querySelectorAll('[data-words]').forEach(function (el) {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', words.join(' '));
    el.textContent = '';
    const spans = words.map(function (w) {
      const s = document.createElement('span');
      s.textContent = w;
      s.setAttribute('aria-hidden', 'true');
      el.appendChild(s);
      el.appendChild(document.createTextNode(' '));
      return s;
    });
    gsap.fromTo(spans, { opacity: 0.18 }, {
      opacity: 1, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 52%', scrub: follow(0.6) }
    });
  });

  /* The contraction in Education draws in along the flow direction. */
  const contraction = document.querySelector('.contraction__flow');
  if (contraction) {
    gsap.fromTo(contraction, { clipPath: 'inset(0 100% 0 0)' }, {
      clipPath: 'inset(0 0% 0 0)', ease: 'none',
      scrollTrigger: { trigger: contraction, start: 'top 92%', end: 'top 48%', scrub: follow(0.8) }
    });
  }

  /* The Achievements line climbs through each result, which appears as it is reached. */
  const climb = document.querySelector('.climb');
  if (climb) {
    const points = climb.querySelectorAll('.climb__point');
    const tl = gsap.timeline({
      scrollTrigger: { trigger: climb, start: 'top 85%', end: 'top 42%', scrub: follow(0.8) },
      defaults: { ease: 'none' }
    });
    tl.fromTo('.climb__line', { clipPath: 'inset(-4% 94% -4% 0)' }, { clipPath: 'inset(-4% 28% -4% 0)', duration: 1 }, 0);
    [0, 0.5, 0.86].forEach(function (at, i) {
      tl.fromTo(points[i], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.14 }, at);
    });
  }

  /* Skills rows drift with the scroll, alternating direction. */
  const drift = window.innerWidth < 860 ? 16 : 46;
  document.querySelectorAll('[data-drift]').forEach(function (el, i) {
    gsap.fromTo(el, { x: i % 2 ? drift : -drift }, {
      x: 0, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 98%', end: 'top 55%', scrub: follow(0.8) }
    });
  });

  document.querySelectorAll('[data-rise]').forEach(function (el) {
    gsap.from(el, {
      y: 26, opacity: 0, duration: 1.3, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true }
    });
  });

  /* Folder stack */
  const section = document.querySelector('.folders');
  if (section) {
    const folders = gsap.utils.toArray('.folders .folder');
    const lead = section.querySelector('.folders__lead');
    const mm = gsap.matchMedia();

    mm.add('(min-width: 860px)', function () {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section, start: 'top top', end: 'bottom bottom', scrub: 0.7, invalidateOnRefresh: true
        },
        defaults: { ease: 'power2.out' }
      });
      folders.forEach(function (f, i) {
        tl.fromTo(f, { y: function () { return window.innerHeight; } }, { y: 0, duration: 1 }, i * 1.25);
      });
      tl.to(lead, { opacity: 0, y: -24, duration: 0.5, ease: 'none' }, 0.8);
      tl.to({}, { duration: 0.8 });

      /* Keyboard users land on a folder that has not slid in yet: bring it in. */
      const onFocus = [];
      folders.forEach(function (f, i) {
        const fn = function () {
          const st = tl.scrollTrigger;
          const at = st.start + (st.end - st.start) * (((i * 1.25) + 1) / tl.duration());
          if (window.scrollY < at) {
            if (lenis) lenis.scrollTo(at, { duration: 1 });
            else window.scrollTo(0, at);
          }
        };
        f.addEventListener('focus', fn);
        onFocus.push([f, fn]);
      });
      return function () {
        onFocus.forEach(function (p) { p[0].removeEventListener('focus', p[1]); });
      };
    });

  }

  /* Formula Student: the opening photo settles slowly as the page starts to move. */
  const headPhoto = document.querySelector('.doc-head__photo');
  if (headPhoto) {
    gsap.to(headPhoto, {
      yPercent: 5, ease: 'none',
      scrollTrigger: { trigger: '.doc-head--photo', start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  /* The three events run sideways while the section is pinned. */
  const events = document.querySelector('.events');
  if (events) {
    gsap.matchMedia().add('(min-width: 860px)', function () {
      const track = events.querySelector('.events__track');
      gsap.timeline({
        scrollTrigger: { trigger: events, start: 'top top', end: 'bottom bottom', scrub: 0.7, invalidateOnRefresh: true },
        defaults: { ease: 'none' }
      })
        .to(track, { x: function () { return window.innerWidth - track.scrollWidth; }, duration: 1 }, 0)
        .to('.events__progress span', { scaleX: 1, duration: 1 }, 0);
    });
  }

  /* The next folder rises from the bottom of each project page. */
  const next = document.querySelector('.next');
  if (next) {
    gsap.from(next, {
      y: 110, duration: 1.4, ease: 'power3.out',
      scrollTrigger: { trigger: next, start: 'top 100%', once: true }
    });
  }

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
