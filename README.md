# JZA-Applications-Pages

Static portfolio site for JZA Applications, served via GitHub Pages at **https://jza.app** (see `CNAME`).

Hand-written HTML/CSS/JS — no frameworks, no build step, no trackers.

## Structure

- `index.html` — the showcase: full-viewport hero, then one "takeover chapter" per app where the page's ambient light and typography morph into that app's design language.
- `site.css` — shared design system. Dark-only (`color-scheme: dark`), liquid-glass components, and per-app brand themes keyed off `body[data-app="…"]` / `section[data-app="…"]`.
- `dock.js` — floating glass dock nav (macOS-style magnification on fine pointers). Injected on every page; resolves the site root from its own script src, so it works at any folder depth.
- `main.js` — index-only choreography: chapter takeover observer, scroll reveals, parallax, specular glass highlights, and a live demo per app — the GhostDelta stage ticker, the BananaBomb card feed, the PointFoundry room point cloud, the PowerGlass dashboard simulation, and the Parlato chat. All gated behind `prefers-reduced-motion` and paused offscreen.
- `assets/` — app icons (512px JPEG, `icon-<slug>.jpg`) and Barry the Banana poses. Sourced from the app projects in `~/Documents/<AppName>`.
- `<app>/index.html`, `support.html`, `*PrivacyPolicy.html` — per-app pages on the shared system, each in its own brand palette.

## Adding an app

1. Add a 512px JPEG icon to `assets/icon-<slug>.jpg` (from the app's 1024px AppIcon).
2. Add a theme block (`[data-app="<slug>"]`) and wordmark class (`.wm-<slug>`) to `site.css`.
3. Add the folder with the three pages, a chapter to `index.html`, and an entry to the `items` array in `dock.js`.
