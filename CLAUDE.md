# JZA Applications website — CLAUDE.md

The portfolio site for JZA Applications, Jaisah's indie iOS/watchOS studio. Live at **https://jza.app** (GitHub Pages, custom domain in `CNAME`, DNS at Cloudflare). Read `README.md` too.

## Who you're working with

- Jaisah is a structural engineer and a solo indie developer. He is **new to coding** but has strong product and design judgement. Explain what you changed and why in plain language, with no analogies. Keep it direct.
- He cares about detail and polish. Fit in with the existing look rather than "improving" the design system unless he asks.
- Each app has its own project in `~/Documents/<AppName>` (PowerGlass, PointFoundry, GhostDelta, BananaBomb, BikeSpec, Parlato, ThumbControl). These usually include their own `CLAUDE.md` and `STYLE_GUIDE.md`. **They are the source of truth** for an app's features, colours and wording. Read them before writing copy or a demo, and never claim a feature you haven't confirmed in that app's code or docs.

## Hard rules

- **Hand-written static site.** Plain HTML/CSS/JS. No frameworks, no build step, no npm, no new libraries, no trackers or analytics.
- **Dark only.** `color-scheme: dark`.
- **Don't change the `<head>` meta tags** (`og:*`, `twitter:card`, canonical) on `index.html` without asking. They control link previews and were set up deliberately. `og-image.png` (1200×630) is the preview image.
- **Never set `overflow-x` on `html` or `body`.** It breaks the homepage scroll snapping. Clip overflow on the container instead (`.chapter` does this).
- **Every animation must:** respect `prefers-reduced-motion` (show a still frame instead), pause when offscreen (IntersectionObserver), and stay light enough for an older iPhone.
- **Privacy policies and App Store links matter legally and commercially.** Policy text must match what the app actually does: check the app's code. Don't remove or rename existing pages. App Store Connect links to their exact URLs (`<app>/support.html`, `<app>/<Name>PrivacyPolicy.html`); a renamed file breaks a live listing.
- **Cache-busting:** CSS and JS are linked with `?v=N` (e.g. `site.css?v=14`, `dock.js?v=11`, `main.js?v=13`). When you change one of these files, bump its number **in every HTML file that links it**: the homepage and all `<app>/*.html` pages. Check with `grep -rho "site.css?v=[0-9]*\|dock.js?v=[0-9]*\|main.js?v=[0-9]*" --include=*.html . | sort | uniq -c`; each file should show a single version.

## Structure

| Path | What it is |
|---|---|
| `index.html` | The homepage: hero (rotating taglines), then one full-screen "chapter" per app, an "All apps" strip, and contact/footer. Page-only CSS lives in its `<style>` block. |
| `site.css` | Shared design system: base tokens, liquid-glass components, per-app themes (`[data-app="<slug>"]`), wordmarks (`.wm-<slug>`), dock, view-transition names (`.vt-<slug>`). |
| `dock.js` | Floating dock, injected on every page. The app list is the `items` array. On the homepage it scrolls to chapters; on app pages it links back to them. |
| `main.js` | Homepage choreography, in numbered sections: 1 chapter takeover (sets `html[data-view]` so the ambient light changes), 2 scroll reveals, 3 parallax, 4 glass highlight, 5 GhostDelta watch demo, 6 BananaBomb card feed, 7 PointFoundry point cloud, 8 PowerGlass dashboard, 9 hero tagline rotation, 10 Parlato chat demo, 11 ThumbControl rule demo. |
| `assets/` | `icon-<slug>.jpg` (512×512, made from each app's 1024px App Store icon) and Barry the Banana images. |
| `<slug>/` | Per-app pages: `index.html` (About), `support.html`, `<AppName>PrivacyPolicy.html`. Each page sets `<body data-app="<slug>">` to pick up its theme. |

Slugs: `powerglass`, `pointfoundry`, `ghostdelta`, `bananabomb`, `bikespec`, `parlato`, `thumbcontrol`.

## Homepage chapter pattern

Every app chapter in `index.html` follows the same shape. Copy an existing one rather than inventing a new layout:

- `<section class="chapter" id="<slug>" data-chapter="<slug>" data-app="<slug>">`. Alternate `chapter alt` on every other chapter, which swaps the sides on desktop.
- The copy column: kicker (`<b>NN</b> · devices`), icon (`.chapter-icon .vt-<slug>`), wordmark, description, About/Support/Privacy links, then the App Store badge.
- The art column holds a **live HTML/CSS replica of the app's real UI**, not a screenshot, drawn from that app's `STYLE_GUIDE.md`. Its JS gets its own numbered section in `main.js`.
- Elements use `.reveal` with a `--reveal-delay` for the staggered entrance.
- Each app also has an ambient light layer: `<div class="amb amb-<slug">` plus its CSS and `html[data-view="<slug>"]` rule near the top of `index.html`.

### Adding an app (checklist)

1. `assets/icon-<slug>.jpg`: 512px JPEG from the app's `AppIcon` 1024px PNG.
2. `site.css`: theme block `[data-app="<slug>"]`, wordmark `.wm-<slug>`, `.vt-<slug>`.
3. `index.html`: ambient layer + rule, chapter (next number), "All apps" strip entry, and the app name in `<meta name="description">`. Add the demo's root class to the `<noscript>` hide list if it's JS-drawn.
4. `dock.js`: an entry in `items`. Then, in `site.css`, update the number of dock items in the phone-width dock rule (`max-width: 480px`), so the icons still fit across a phone screen.
5. `main.js`: a new numbered section for the demo (reduced-motion still frame, IntersectionObserver pause).
6. `<slug>/index.html`, `support.html`, `<AppName>PrivacyPolicy.html`, modelled on an existing app's pages.
7. Bump the `?v=` numbers everywhere (see Hard rules).

### Beta apps (TestFlight)

Parlato and ThumbControl are shown before their App Store release. Each chapter has a `.beta-tag` in the wordmark, and a `.beta-cta` block in place of the App Store badge: a "Join the TestFlight beta" button (public links: Parlato `https://testflight.apple.com/join/zTvM7Seb`, ThumbControl `https://testflight.apple.com/join/KvbUzRVB`), plus a link to Apple's TestFlight app. Open TestFlight links in the same tab: on iPhone they hand off to the TestFlight app.

**When an app goes live:** swap the `.beta-cta` block for a `.store-badge` link like the other chapters, remove the beta tag and the "Public beta" kicker text, and update the About, Support and Privacy pages (they mention TestFlight). There's a comment above each beta chapter saying the same.

**ThumbControl trap:** the app's Settings has a "Privacy Policy" row whose link is still a placeholder in the app's code. It should open `https://jza.app/thumbcontrol/ThumbControlPrivacyPolicy.html`, which is also the URL to give App Store Connect.

## Checking your work

- Run it locally with `python3 -m http.server` from this folder, then open `http://localhost:8000`.
- Check desktop (~1400px wide) and phone (~390px) widths. On the homepage, also check: scroll snapping lands on each chapter, the dock highlights the right app, every demo runs and pauses offscreen, and reduced motion shows still frames.
- Check the browser console for errors. The App Store badge images load from Apple's servers, so they fail offline; that's expected.
- Check the new app's About/Support/Privacy pages and the dock on another app's page.

## Publishing

- Pushing to `main` on GitHub (`JZA-89/JZA-Applications-Pages`) deploys automatically; GitHub Pages updates within a few minutes. Jaisah usually commits and pushes from Xcode (Integrate → Commit, then Push). Don't push without his go-ahead: it's a public website.
- Write commit messages in the existing style: a short summary of what changed for the visitor (see `git log --oneline`).
- After a push that changes how links preview (`og:image` etc.), Facebook/Messenger keep old previews until refreshed at developers.facebook.com/tools/debug ("Scrape Again").
