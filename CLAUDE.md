# JZA Applications website — CLAUDE.md

The portfolio site for JZA Applications, Jaisah's indie iOS/watchOS studio. Live at **https://jza.app** (GitHub Pages, custom domain in `CNAME`, DNS at Cloudflare). Read `README.md` too.

## Who you're working with

- Jaisah is a structural engineer and a solo indie developer. He is **new to coding** but has strong product and design judgement. Explain what you changed and why in plain language, with no analogies. Keep it direct.
- He cares about detail and polish. Fit in with the existing look rather than "improving" the design system unless he asks.
- Each app has its own project in `~/Documents/<AppName>` (PowerGlass, PointFoundry, GhostDelta, BananaBomb, BikeSpec, Parlato, ThumbControl, MORPHOS). These usually include their own `CLAUDE.md` and `STYLE_GUIDE.md`. **They are the source of truth** for an app's features, colours and wording. Read them before writing copy or a demo, and never claim a feature you haven't confirmed in that app's code or docs.

## Hard rules

- **Hand-written static site.** Plain HTML/CSS/JS. No frameworks, no build step, no npm, no new libraries, no trackers or analytics.
- **Dark only.** `color-scheme: dark`.
- **Don't change the `<head>` meta tags** (`og:*`, `twitter:card`, canonical) on `index.html` without asking. They control link previews and were set up deliberately. `og-image.png` (1200×630) is the preview image.
- **Never set `overflow-x` on `html` or `body`.** It breaks the homepage scroll snapping. Clip overflow on the container instead (`.chapter` does this).
- **Every animation must:** respect `prefers-reduced-motion` (show a still frame instead), pause when offscreen (IntersectionObserver), and stay light enough for an older iPhone.
- **Privacy policies and App Store links matter legally and commercially.** Policy text must match what the app actually does: check the app's code. Don't remove or rename existing pages. App Store Connect links to their exact URLs (`<app>/support.html`, `<app>/<Name>PrivacyPolicy.html`); a renamed file breaks a live listing.
- **Cache-busting:** CSS and JS are linked with `?v=N` (e.g. `site.css?v=17`, `dock.js?v=12`, `main.js?v=18`). When you change one of these files, bump its number **in every HTML file that links it**: the homepage and all `<app>/*.html` pages. Check with `grep -rho "site.css?v=[0-9]*\|dock.js?v=[0-9]*\|main.js?v=[0-9]*" --include=*.html . | sort | uniq -c`; each file should show a single version.

## Structure

| Path | What it is |
|---|---|
| `index.html` | The homepage: hero (rotating taglines), then one full-screen "chapter" per app, an "All apps" strip, and contact/footer. Page-only CSS lives in its `<style>` block. |
| `site.css` | Shared design system: base tokens, liquid-glass components, per-app themes (`[data-app="<slug>"]`), wordmarks (`.wm-<slug>`), dock, view-transition names (`.vt-<slug>`). |
| `dock.js` | Floating dock, injected on every page. The app list is the `items` array. On the homepage it scrolls to chapters; on app pages it links back to them. |
| `main.js` | Homepage choreography, in numbered sections: 1 chapter takeover (sets `html[data-view]` so the ambient light changes), 2 scroll reveals, 3 parallax, 4 glass highlight, 5 GhostDelta iPhone ride page + Watch demo, 6 BananaBomb review screen (iPhone), 7 PointFoundry point cloud, 8 PowerGlass dashboard, 9 hero tagline rotation, 10 Parlato chat demo, 11 ThumbControl rule demo, 12 BikeSpec suspension card, 13 MORPHOS pond (canvas). |
| `assets/` | `icon-<slug>.jpg` (512×512, made from each app's 1024px App Store icon) and Barry the Banana images. |
| `<slug>/` | Per-app pages: `index.html` (About), `support.html`, `<AppName>PrivacyPolicy.html`. Each page sets `<body data-app="<slug>">` to pick up its theme. |

Slugs: `powerglass`, `pointfoundry`, `ghostdelta`, `bananabomb`, `bikespec`, `parlato`, `thumbcontrol`, `morphos`.

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

**Parlato wording:** every line about Parlato follows R26 in Parlato's own CLAUDE.md: lead with the motorcycle rider and passenger; other examples only where people stay within a few metres (tandem, sidecar, loud workshop, kitchen, job site, concert); state the range as "about 10 metres, the length of a bus"; never "walkie-talkie", hiking, trails, skiing or group rides; "private" never means encrypted.

**ThumbControl trap:** the app's Settings has a "Privacy Policy" row whose link is still a placeholder in the app's code. It should open `https://jza.app/thumbcontrol/ThumbControlPrivacyPolicy.html`, which is also the URL to give App Store Connect.

### MORPHOS (browser game)

MORPHOS is Jaisah's HTML game, not an App Store app, so it has **no About or Support pages**. It does have a privacy page, `morphos/MorphosPrivacyPolicy.html`, because co-op makes network connections (see below); the game's Co-Op dialog links to it, so don't rename it. Its chapter (08) has a "Play MORPHOS" button in place of the links and store badge, and the button opens the game in the same tab.

- The game is one self-contained file: `morphos.html` at the site root (jza.app/morphos.html), a copy of `~/Documents/MORPHOS/MORPHOS.html` (that project has its own CLAUDE.md; its version number is in the page title). To ship a new version, copy the newest file over `morphos.html` (keep that name, so the URL stays the same). Don't edit the game's code here; changes belong in Jaisah's MORPHOS file.
- It doesn't link `site.css`, `dock.js` or `main.js`, and gets no dock: it's a full-screen game with its own controls. The game saves progress in the browser (`localStorage`), so keep the URL stable or players lose their saved life.
- The homepage demo (main.js §13) is a scripted short life, not the game itself: its drawing routines are ported from the game's renderer (cell body, cilia, jaws, Pulse arc, division rings, YOU marker) at the game's real sizes, and the script follows the game's rules (Pulse reach r + 110, hunter wind-up → lunge → recovery, division at 80 growth without pausing: the body morphs over 1.8 s as two cells bud apart inside one membrane, and jaws grow outward after its kills). If the game's look or rules change, update §13 to match. Two things have drifted since v19 and v20 and are close enough to leave: the game's two-cell body is now 26 wide (the demo draws 28), and in the game jaws are now the Jaws weapon a hunter drops and you equip, not something Predator rank grows. The icon `assets/icon-morphos.jpg` is the game's own cell logo.
- How the game is built now (v20 to v25), for anyone changing it:
  - **Body size** grows with cells^0.25 (`BODY_GROWTH`); health, damage and food value use that width to the power `SIZE_POWER` (2.2), which keeps strength on its older curve.
  - **Water levels:** difficulty is fixed by place (`waterLevel`): level 0 in the nursery, then one more per 850 units from it. Creatures, food value and species follow the water's level, never the player's. The HUD shows it as level N+1, comparable with the colony's cell count.
  - **Weapons:** the primary attack comes only from a mutation in the Strike organ (`jaws`, `spitGland`, `needleSpine`, `surgeFin`, `commandGland`; none is Jab), dropped by the creature that uses it. Class ranks strengthen abilities only (`_rankPower`).
  - **Ancients** (code name "elder"): named territorial mini-bosses (`_maybeElder`), about one per fifty chunks of open water, that drop a Rare or better mutation. They stay in a fight while being hurt and go home when left alone.
  - **Levels:** every creature has its water's level (`o.lv`); each level of difference changes damage dealt and taken by 8% and what a kill, food or place is worth by 12% (`gapDeal`, `gapTake`, `gapWorth`).
  - **Nests** hold a mother and two young that squeeze in and out one at a time (`_nestEmerge`, `denT`).
  - **Bosses:** six, ending with the Kraken at level 36. A boss can be escaped by staying well clear of it (`_bossLost`); it returns after two minutes. Since v31 each boss has more health (`hits`) and its own damage multiplier (`dmg`, applied through `b.unit`), tuned with a dodging bot so a strong build takes about 45 s for the Gulper rising to about 3.5 min for the Kraken (scratchpad `bosssim.js`). Since v31.1 the five bosses before the Kraken have predator bodies (Gulper: amoeba with grasping arms and a toothed mouth; Broodmother: armoured queen with pincers and an abdomen of young; Glass Pike: an arrow worm with grasping hooks; Hydra: a plated crown and fanged heads on segmented necks; Undertow: a gulper eel with a lure). Drawing only changed; hit areas did not. The Kraken also has a tentacle grab (`grab`): a marked line, then a lash; if it catches you it drags you to its mouth over about 2 s, and a strike towards it (`_grabStrike`, from both `_strike` and `_pulse`) breaks the hold and leaves it open.
  - **Depth:** scenery (`DEEP_SCENERY`) and two places (glass vault, black smoker) appear only in deeper water.
  - **Vault wardens:** each glass vault is guarded by a warden, an ancient made by `_spawnWarden` and recorded under `'vault:'+id` in `stats.eldersFallen`. The vault opens only after its warden has fallen, and then gives a mutation as good as its water can drop.
  - **Lineage and stats:** each class has five ranks (`MAX_RANK`; forks at II and IV, a fixed capstone at V), then mastery. Stats reach rank 10, and rank 12 from 31 cells (`attributeCap`). A save with rank IV plus mastery is converted to rank V on load.
  - **Ambushes (v26.7):** a hit while concealed (`stealth>.65`) is an ambush only if the target has not noticed you: a creature that is not hunting or attacking you (`_unaware`), or a boss that has lost track of you (`b.knowsMe<.3`, kept on each player's own device). Hitting a boss, or being in its sight unconcealed, sets `knowsMe` to 1; while you stay concealed it falls, faster with distance and quickly while the boss is near one of your decoys (`_bossSenses`). No timers.
  - **Hits from the side and behind (v26.8):** every attack on a creature or boss does more damage the further round its body it lands, smoothly from +0% at the face to +15% on the side and +30% from behind (`_rearFactor`, `REAR_BONUS`). The direction is the attack's travel; the target's facing is its attack direction while it winds up or lunges. Jellies (round) are exempt. A 'FROM BEHIND' label shows on clear rear hits.
  - **Surge fin (v27.2):** each Surge costs 1.5x the base strike stamina, its dash length shrinks with your stamina (35% to 100% of reach), and it dodges only for its first 0.12 s, so it is slower than fast swimming for travel.
  - **Which way is up (v27.2):** from water level 6 the deep-water darkness is centred off towards the shallows and a faint light washes in from that edge of the screen, so the lighter side points home. Nothing is labelled.
  - **Checkpoints are checked before they are stored (v28.3/28.4):** `flushCheckpoint` runs just after the frame, test-loads the save with `fromSave`, and only then writes it, so a save that would not load never replaces the last good one. Any new value the game can produce must stay inside the validator's bounds in `fromSave` (a Legendary Undertow once pushed `slowTime` past 2 and corrupted saves).
  - **iPad memory (v27.4–v28.2):** sprites and gradients are cached and reused in place (`_poolSprite` max 12, `glow` max 48, `_grad` max 600, `_poolLayer`, `_grainPat`); never create a canvas, pattern or gradient per frame for a colour that changes smoothly. A solo scene that cannot change is drawn once (`frozenDrawn`).
  - **Wonders (v32):** eight one-of-a-kind places (`WONDERS`, landmark types `wonderBell` … `wonderEye`), one of each per pond at its own water level (4, 8, 12, 16, 20, 25, 31, 39) in a direction set by the seed (`_wonderSites`); a wonder takes the place of its chunk's ordinary landmark. Challenges (`_wonderTick`): a guardian ancient (`elderHome` `'wonder:'+id`, kept like a vault warden in co-op), six lanterns lit at once, staying hidden from drifting lights, holding the eye of a whirlpool, and surviving the Abyssal Eye's sweeping beams. Each gives a Legendary mutation and 1 stat point (the Eye 3), counted in `stats.earnedPoints.wonder`. Undiscovered wonders show as gold "?" rumours on both maps from four levels above their water (`wonderRumours`), and found ones as stars.
  - **In-game HUD (v30):** one cockpit in the bottom centre: health and stamina as liquid gauges (`.ck-orb`), the cell count with its growth ring (`.ck-gem`), nutrition as a thin bar, and the nine move buttons (the existing `.control-cluster`, restyled) between them. A navigation minimap (`drawMiniMap`, every frame; explored water on one reused layer, a line at each water-level boundary, places, lead, boss, friends, and a rim notch towards the shallows; no ordinary creatures) sits top-left with the water level under it; the study lead and buttons sit top-right. On screens wider than 16:9 everything stays inside a centred 16:9 frame (`--hx`), and the HUD scales with `--u`. Touch: a small cockpit between the thumbs in landscape, and a single top row (map, cockpit, buttons) in portrait. The old vitals bars remain only for screen readers.
  - **Saves** are version 20; versions 18 and 19 are converted on load (`fromSave`). Measurements such as reach are always recomputed, so a balance change does not invalidate a save.
- **Text size rule (Jaisah's, v25.7):** no tiny text anywhere in the game's interface. In menus and dialogs nothing is smaller than 11px, and sentences are 12.5px or more (the Co-Op dialog uses 13px and up). In the in-game HUD, where a phone has little room, the floor is 10px. New interface text follows the same floors; the exception is the numerals inside the Lineage tree's small circles, which scale with the circle.
- Playing alone, the game's only network request is a version check: a few seconds after opening (and when the tab comes back into view, at most every 5 minutes) it fetches its own page, `morphos.html`, with the cache bypassed, reads the version from the `<title>`, and offers a reload if it is newer. Nothing is sent. Keep the title in the form `MORPHOS | Living Waters · vX.Y` or the check stops working.
- **Co-op (the Co-Op button, up to eight players)** connects the players' browsers directly to each other with WebRTC. Game data never passes through a server. The network requests it makes are:
  - `https://coop.jza.app`: a Cloudflare Worker on Jaisah's Cloudflare account (source in the MORPHOS project, `coop-worker/worker.js`, with a D1 database bound as `DB`). It only passes the two browsers' connection details to each other, deletes them when collected or after two minutes, and accepts requests only from `https://jza.app`. If the game is ever served from another address, the Worker's `ALLOWED_ORIGINS` must change too.
  - Public STUN servers (`stun.cloudflare.com`, `stun.l.google.com`), which tell a browser its own internet address.
  - The direct connections to the other players.
  - "Connect by copy and paste" in the same dialog skips the Worker.
  The privacy page describes exactly this. If co-op's connections change, or the game adds any other request (analytics, leaderboards), update `morphos/MorphosPrivacyPolicy.html` to match.
- **Friendly fire (v26.0)** is always on in co-op: a player's Jab, Bite, Command pulse, Surge, shots and Pounce hurt the other players they touch (`_ff`, message `ff`). The attacker's device decides the hit; the victim's device takes the damage through its own defences. Rams, poison and broodlings do not hurt friends. A friendly hit is capped at 34% of the victim's maximum health, does not give the victim general invulnerability (a separate 0.6 s `ffGuard`), and does not land while the victim is away (paused, evolving).
- A co-op pond is saved separately from a solo life (`localStorage` key `morphos.coop.v1`), so it also depends on the URL staying the same.

## Checking your work

- Run it locally with `python3 -m http.server` from this folder, then open `http://localhost:8000`.
- Check desktop (~1400px wide) and phone (~390px) widths. On the homepage, also check: scroll snapping lands on each chapter, the dock highlights the right app, every demo runs and pauses offscreen, and reduced motion shows still frames.
- Check the browser console for errors. The App Store badge images load from Apple's servers, so they fail offline; that's expected.
- Check the new app's About/Support/Privacy pages and the dock on another app's page.

## Publishing

- Pushing to `main` on GitHub (`JZA-89/JZA-Applications-Pages`) deploys automatically; GitHub Pages updates within a few minutes. Jaisah usually commits and pushes from Xcode (Integrate → Commit, then Push). Don't push without his go-ahead: it's a public website.
- Write commit messages in the existing style: a short summary of what changed for the visitor (see `git log --oneline`).
- After a push that changes how links preview (`og:image` etc.), Facebook/Messenger keep old previews until refreshed at developers.facebook.com/tools/debug ("Scrape Again").
