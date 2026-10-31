# Soham Dhage portfolio

A static site with no build step: plain HTML, CSS and JavaScript.

## Run it

Serve the folder, because the security policy in each page blocks scripts opened straight from disk:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Where things live

| Path | What it is |
|---|---|
| `index.html` | Home page: hero, About, Education, Skills, Achievements, folders, contact |
| `projects/*.html` | One page per folder |
| `css/main.css` | All styling. Colours and fonts are at the top |
| `js/main.js` | Smooth scroll, the exit from the tunnel, reveals, folder stack |
| `js/flow/` | The live solver: `solver.js`, `shaders.js`, and the car outline in `car-shape.js` |
| `assets/vendor/` | GSAP 3.12.5, ScrollTrigger and Lenis 1.1.13 |
| `assets/projects/` | Project images |

## Add a photo to a project

1. Put the image in `assets/projects/<project>/`. Keep it under about 500 KB.
2. Paste this into the project page where it should appear:

```html
<figure class="doc-fig">
  <img src="../assets/projects/<project>/photo.jpg" alt="What the photo shows" loading="lazy">
  <figcaption>Caption here.</figcaption>
</figure>
```

## Add or change a folder

Copy an `<a class="folder">` block in `index.html` and a page in `projects/`. Update the "Next folder" link at the bottom of the page before it. A fifth folder also needs a tab position and colour in `css/main.css`, and more scroll length on `.has-motion .folders`.

## Refresh the still image

Visitors see `assets/hero-fallback.webp` if their browser can't run the solver, or if they prefer reduced motion. To replace it after changing the car or the flow, wait for the wake to develop, then run this in the browser console:

```js
const a = document.createElement('a');
a.href = FlowHero.capture();
a.download = 'hero-fallback.webp';
a.click();
```
