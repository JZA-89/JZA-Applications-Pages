'use strict';
/* Cast in Stone — main.js
   Starts everything: loads the saved world (or starts a new one), fits the
   16:9 stage to the screen, runs the fixed-step loop (60 steps a second,
   independent of the screen's frame rate), passes each step's actions to the
   game, draws, and keeps the interface up to date: the in-game HUD (corner
   map, cockpit with health, mana, the recipe and its four spells, level),
   the tabbed panels (golem, spell book, controls; the map; resting at a
   Lodestone) and the notices. Saves now and then. Icons and the runestone
   screens are in loot.js. */

(() => {
  const { elements, elementOrder, view: V, step: STEP } = KData;
  const VERSION = 'v1.05';

  const $ = id => document.getElementById(id);
  const stage = $('stage'), view = $('view'), glow = $('glow');
  const loaded = KSave.load();
  let game = loaded || new KGame.Game(randomSeed());
  const hadSave = !!loaded;   // v1.02: a save that loaded (one that could not be read is kept aside, see KSave.load)
  let frozenDrawn = false;   // a still menu scene already drawn (frame)
  let ME = 0;            // which golem is this device's: 0, or 1 as the guest in co-op
  let guestGame = false; // true while `game` is a friend's cave (never stored as this device's save)
  const R = new KRender.Renderer(view, glow);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function randomSeed() { return (Math.random() * 1e9) | 0; }
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  for (const n of document.querySelectorAll('[data-icon]')) n.insertAdjacentHTML('afterbegin', KIcon(n.dataset.icon));

  // ---------- layout: the HUD scales with the stage (--u = stage width / 1280) ----------
  let VW = 432, VH = 243;   // cells shown on a 16:9 screen (fit() picks them)
  let fitKey = '', fitAsked = false;
  // at most once a frame, however many times the browser reports a change
  const askFit = () => { if (fitAsked) return; fitAsked = true; requestAnimationFrame(() => { fitAsked = false; fit(); }); };
  function fit() {
    // The view takes the screen's shape. A 16:9 screen shows VW x VH cells (384 x 216 from v0.64, 432 x 243 from v0.66; it was 320 x 180); a wider one keeps the
    // height and shows more to the sides, a taller one keeps the width and shows more above and below.
    // Nobody sees further for it: past SIGHT cells from the golem the picture fades to black (fade()).
    // v0.66: a computer or tablet shows 432 x 243 (about what Noita shows); a phone, whose screen is small anyway, 384 x 216.
    // the visible area (on iPhone Safari's bars come and go, and innerHeight can lag behind them)
    // (v0.86: always the area the browser reports. v0.82 stretched it to 100vh on the Home Screen, but on an iPad that is
    // taller than the area really shown, so the bottom of the HUD was cut off)
    const VV = window.visualViewport, W = Math.round(VV ? VV.width : innerWidth), H = Math.round(VV ? VV.height : innerHeight), wide = W / H >= 16 / 9;
    const top = VV ? Math.round(VV.offsetTop + H / 2) : null, left = VV ? Math.round(VV.offsetLeft + W / 2) : null;
    // v0.77: nothing to do unless the size or place really changed (Safari reports the visible area moving many times
    // a second while a finger is on an iPad; re-fitting every time cleared the picture and made it flicker)
    const key = W + ',' + H + ',' + top + ',' + left;
    if (key === fitKey) return;
    fitKey = key;

    // v0.94: the menus, the title and the touch controls take the visible area too, like the game picture. On Jaisah's iPad the
    // page's own area (what position: fixed; inset: 0 fills) is wider than the screen, so they were cut off on the right,
    // while the game picture, sized from the visible area, always fitted.
    const ds = document.documentElement.style;
    ds.setProperty('--vw', W + 'px'); ds.setProperty('--vh', H + 'px');
    ds.setProperty('--vx', (VV ? Math.round(VV.offsetLeft) : 0) + 'px'); ds.setProperty('--vy', (VV ? Math.round(VV.offsetTop) : 0) + 'px');
    if (Math.min(W, H) >= 600) { VW = 432; VH = 243; } else { VW = 384; VH = 216; }
    SIGHT = Math.round(224 * VW / 384); SIGHT_END = Math.round(290 * VW / 384); R.sightR = SIGHT_END + 2;
    R.setView(wide ? Math.min(VW * 2, Math.round(VH * W / H)) : VW, wide ? VH : Math.min(Math.round(VW * 2.25), Math.round(VW * H / W)));
    const s = Math.min(W / V.w, H / V.h), w = Math.floor(V.w * s), h = Math.floor(V.h * s);
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    // v1.00: placed on whole pixels (centring by a half translate could land on half a pixel and blur the picture)
    stage.style.left = ((VV ? Math.round(VV.offsetLeft) : 0) + Math.round((W - w) / 2)) + 'px'; stage.style.top = ((VV ? Math.round(VV.offsetTop) : 0) + Math.round((H - h) / 2)) + 'px';
    // The HUD keeps to a 16:9 frame in the middle (--hx is the margin each side), so on a very wide
    // monitor it is not out in the corners. A phone is too short to give any width away.
    stage.style.setProperty('--u', Math.max(0.55, Math.min(1.5, Math.min(w / 1280, h / 720))).toFixed(3));
    // menus are laid out for 1280 x 720 or smaller and enlarged as one piece on anything bigger
    document.documentElement.style.setProperty('--m', Math.max(1, Math.min(W / 1280, H / 720)).toFixed(3));
    stage.style.setProperty('--hx', (h <= 600 ? 0 : Math.max(0, Math.round((w - h * 16 / 9) / 2))) + 'px');
    R.resize(w, h);
  }
  // v0.95: a version check, as in MORPHOS. The browser (above all a Home Screen copy on an iPad) can keep an old copy of
  // this page; ask the server, bypassing every cache, which version is current, and offer a reload when this copy is older.
  // Only the page itself is fetched; nothing is sent.
  const pageVersion = (document.title.match(/v(\d+)\.(\d+)/) || []).slice(1).map(Number);
  let versionCheckedAt = 0;
  async function checkForUpdate() {
    if (!pageVersion.length || !location.protocol.startsWith('http') || (versionCheckedAt && performance.now() - versionCheckedAt < 5 * 60000)) return;
    versionCheckedAt = performance.now();
    try {
      const r = await fetch(location.pathname + '?check=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const m = (await r.text()).match(/<title>[^<]*v(\d+)\.(\d+)/); if (!m) return;
      const live = [+m[1], +m[2]], newer = live[0] > pageVersion[0] || (live[0] === pageVersion[0] && live[1] > pageVersion[1]);
      if (!newer) return;
      const b = $('updateBanner'); b.dataset.v = live[0] + '.' + live[1];
      b.innerHTML = `<b>v${live[0]}.${String(live[1]).padStart(2, '0')} is ready</b><span>Tap to reload. Your game is saved.</span>`; b.hidden = false;
    } catch (e) {}
  }
  $('updateBanner').addEventListener('click', () => { try { save(); } catch (e) {} location.replace(location.pathname + '?v=' + ($('updateBanner').dataset.v || Date.now())); });
  setTimeout(checkForUpdate, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
  // v0.97: the same for touches on the game picture in play (not its buttons, which work by click): no loupe, no selection
  stage.addEventListener('touchstart', e => { if (mode === 'play' && e.cancelable && !e.target.closest('button, a, input, #mapBox')) e.preventDefault(); }, { passive: false });
  addEventListener('resize', askFit);
  // the page never scrolls (as in MORPHOS): if Safari ever shifts it, put it back
  addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); }, { passive: true });
  if (window.visualViewport) { visualViewport.addEventListener('resize', askFit); visualViewport.addEventListener('scroll', askFit); }
  addEventListener('orientationchange', () => { askFit(); setTimeout(askFit, 250); setTimeout(askFit, 700); });   // iOS reports the new size a moment late (as MORPHOS)   // iOS reports the new size a moment late
  // how far the golem sees: clear to SIGHT cells (the corner of a 16:9 screen), black by SIGHT_END
  let SIGHT = 224, SIGHT_END = 290;   // set by fit() with the view's size
  // v0.93: the darkness is one large ring drawn once per screen size and slid under the golem with a transform,
  // instead of a new full-screen gradient every frame (which Safari repainted under the HUD, and the HUD flickered)
  const fadeRing = document.createElement('div'); fadeRing.className = 'fade-ring'; $('fade').appendChild(fadeRing);
  let fadeKey = '', fadeR = 0, fadeWas = '';
  function fade() {
    const p = game.players[ME], s = stage.clientWidth / V.w;
    // on a screen no wider or taller than the golem's sight there is nothing to fade: drop the layer altogether
    const need = Math.hypot(V.w / 2, V.h / 2) > SIGHT + 4 || R.cam.x <= 0 || R.cam.y <= 0 || R.cam.x >= game.world.w - V.w || R.cam.y >= game.world.h - V.h;
    if ($('fade').hidden === need) $('fade').hidden = !need;
    if (!need) return;
    const key = Math.round(SIGHT * s) + ',' + Math.round(SIGHT_END * s) + ',' + stage.clientWidth + ',' + stage.clientHeight;
    if (key !== fadeKey) {   // only when the screen's size changes
      fadeKey = key; fadeR = Math.ceil(Math.hypot(stage.clientWidth, stage.clientHeight)) + 4;
      fadeRing.style.width = fadeRing.style.height = (fadeR * 2) + 'px';
      fadeRing.style.background = `radial-gradient(circle at 50% 50%, #0000 ${Math.round(SIGHT * s)}px, #000 ${Math.round(SIGHT_END * s)}px)`;
    }
    const x = Math.round((p.x - R.cam.x + 0.5) * s) - fadeR, y = Math.round((p.y - 8 - R.cam.y) * s) - fadeR, t = `translate3d(${x}px, ${y}px, 0)`;
    if (t !== fadeWas) { fadeWas = t; fadeRing.style.transform = t; }
  }
  // full screen (where the browser allows it; an iPhone does not)
  const fullScreen = () => { const d = document; try { if (d.fullscreenElement) d.exitFullscreen(); else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {}); } catch (x) {} };
  fit();

  // ---------- the four element keys ----------
  const els = $('els');
  for (const el of elementOrder) {
    const e = elements[el], b = document.createElement('button');
    b.type = 'button'; b.className = 'el'; b.style.setProperty('--c', e.css);
    b.dataset.el = el;
    b.innerHTML = `${KIcon(el)}<kbd>${KInput.label('kbm', el)}</kbd>`;
    b.title = `${e.name} (${KInput.label('kbm', el)})`;
    b.setAttribute('aria-label', `Add ${e.name} to the recipe`);
    b.addEventListener('click', () => KInput.queue({ type: 'load', el }));
    els.appendChild(b);
  }

  // ---------- spell book: the forms, what a second element does, and special spells ----------
  const book = $('book');
  const MODE_LABEL = { shot: ['Shot', 'left click'], burst: ['Burst', 'right click'], lift: ['Lift', 'hold Space in the air'], move: ['Move', 'Shift'] };
  const MOD_TEXT = {
    shot: { fire: 'sets what it hits burning and scatters flames where it lands', water: 'soaks what it hits and splashes water where it lands', earth: 'hits with more knockback, digs where it lands and throws rubble', lightning: 'jumps on to another enemy for half the damage and electrifies water' },
    lift: { fire: 'lifts 12% harder', water: 'costs 12% less', earth: 'you take 15% less damage while lifting', lightning: 'moves 15% faster sideways' },
    move: { fire: 'hits 25% harder and leaves fire', water: 'goes 20% further', earth: 'digs through dirt', lightning: 'is 12% faster' },
  };
  MOD_TEXT.burst = MOD_TEXT.shot;
  const MOD_SHORT = { fire: 'burns what it hits and scatters flames', water: 'soaks what it hits and splashes water', earth: 'adds knockback, digs and throws rubble', lightning: 'jumps on to another enemy' };
  const dots = q => q.map(e => `<i style="--c:${elements[e].css}" title="${elements[e].name}"></i>`).join('');
  // the four forms: what the first element makes
  $('forms').innerHTML = elementOrder.map(el => {
    const R2 = KRecipe.resolve([el, el]);
    return `<div class="form" style="--c:${elements[el].css}"><h3>${KIcon(el)}${elements[el].name}<kbd data-el="${el}">${KInput.label('kbm', el)}</kbd></h3><dl>` +
      KData.modes.map(md => `<div><dt>${MODE_LABEL[md][0]}</dt><dd>${R2[md].name}</dd></div>`).join('') + '</dl></div>';
  }).join('');
  $('mods').innerHTML = elementOrder.map(el => `<div class="mod" style="--c:${elements[el].css}">${KIcon(el)}<span><b>${elements[el].name} after the first</b> ${MOD_SHORT[el]}.</span></div>`).join('');
  book.insertAdjacentHTML('beforeend', '<span></span>' + KData.modes.map(md => `<span class="hd">${KIcon(md)}${MODE_LABEL[md][0]}<small>${MODE_LABEL[md][1]}</small></span>`).join(''));
  const showSpell = (btn, q, md) => {
    const sp = KRecipe.resolve(q)[md], [a, b] = q;
    book.querySelectorAll('button.on').forEach(x => x.classList.remove('on'));
    btn.classList.add('on');
    const extra = Object.keys(sp.mods).filter(e => sp.mods[e] > 0).map(e => `${elements[e].name}: ${MOD_TEXT[md][e]}.`).join(' ');
    $('bookDetail').innerHTML = `<b>${sp.name} <small>· ${elements[a].name} first, then ${elements[b].name} · ${MODE_LABEL[md][0]} · ${sp.drain ? sp.drain + ' mana a second' : sp.cost + ' mana'}</small></b><span>${sp.desc}${extra ? ' ' + extra : ''}</span>`;
  };
  for (const a of elementOrder) for (const b of [a, ...elementOrder.filter(e => e !== a)]) {
    book.insertAdjacentHTML('beforeend', `<span class="pairc" title="${elements[a].name} first, then ${elements[b].name}">${dots([a, b])}</span>`);
    for (const md of KData.modes) {
      const sp = KRecipe.resolve([a, b])[md], btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = sp.name;
      if (sp.name === sp.baseName) btn.className = 'own';
      for (const ev of ['mouseenter', 'focus', 'click']) btn.addEventListener(ev, () => showSpell(btn, [a, b], md));
      book.appendChild(btn);
    }
  }
  // special spells: the ones you know show their sequence; the rest stay hidden.
  // For testing only: opening the game with ?dev in the address (remembered on this device; ?dev=0 forgets it)
  // adds a switch here that shows every spell's sequence. It changes nothing in the game itself.
  const DEV = (() => { try { const q = new URLSearchParams(location.search).get('dev'); if (q !== null) localStorage.setItem('castinstone.dev', q === '0' ? '' : '1'); return localStorage.getItem('castinstone.dev') === '1'; } catch (e) { return false; } })();
  let peekAll = false; try { peekAll = DEV && localStorage.getItem('castinstone.dev.peek') === '1'; } catch (e) {}
  function renderSpecials() {
    const known = game.players[ME].known, S = KData.specials, ids = Object.keys(S);
    $('specialsTitle').textContent = `Special spells · ${known.length} of ${ids.length}`;
    // by tier: the number of elements tells you how long an unknown one is
    const TIER = ['', 'First circle · three elements', 'Second circle · four elements', 'Third circle · five elements', 'Fourth circle · six elements', 'Fifth circle · seven elements'];
    let html = '<p class="note" style="margin:0 0 4px">Type one in its exact order, then left click. Tomes in relic caches, rune tablets, champions and the Emberwyrm teach them; the deeper the cave, the higher the circle.</p>';
    if (DEV) html += `<button type="button" class="btn ghost small" id="btnPeek" role="switch" aria-checked="${peekAll}">Testing: ${peekAll ? 'showing every spell' : 'show every spell'}</button>`;
    for (let t = 1; t <= 5; t++) {
      const list = ids.filter(id => S[id].tier === t), have = list.filter(id => known.includes(id)).length;
      html += `<h3 class="circle">${TIER[t]}<small>${have} of ${list.length}</small></h3><div class="specials">` + list.map(id => known.includes(id) || peekAll
        ? `<div class="special${known.includes(id) ? '' : ' peek'}"><b>${S[id].name}<small>${known.includes(id) ? '' : 'not learned · '}${S[id].cost} mana</small></b><span class="pairc">${dots(S[id].seq)}</span><span>${S[id].desc}</span></div>`
        : `<div class="special unknown"><b>Unknown</b><span class="pairc">${S[id].seq.map(() => '<i></i>').join('')}</span><span>Not yet learned.</span></div>`).join('') + '</div>';
    }
    $('specials').innerHTML = html;
    const pk = $('btnPeek'); if (pk) pk.addEventListener('click', () => { peekAll = !peekAll; try { localStorage.setItem('castinstone.dev.peek', peekAll ? '1' : ''); } catch (e) {} renderSpecials(); $('btnPeek').focus({ preventScroll: true }); });
  }

  // ---------- controls, as key caps ----------
  // Keyboard and mouse, and Controller: every action with the key or button it is on. Click one, then
  // press the new key (or, for the held actions, a mouse button). Touch has nothing to change.
  const BIND_GROUPS = {
    kbm: [['golem', 'Move', [['left', 'Run left'], ['right', 'Run right'], ['jump', 'Jump · hold in the air to Lift'], ['move', 'Move: a dash, a blink, a climb'], ['rest', 'Rest at a Lodestone']]],
      ['shot', 'Cast', [['shot', 'Shot, aimed with the mouse'], ['burst', 'Burst, around you']]],
      ['rune', 'Recipe', [['fire', 'Add Fire'], ['water', 'Add Water'], ['earth', 'Add Earth'], ['lightning', 'Add Lightning'], ['undo', 'Take off the last element'], ['clear', 'Clear the recipe']]],
      ['keys', 'Menus', [['map', 'Map'], ['book', 'Spell book'], ['pause', 'Pause'], ['full', 'Full screen'], ['mute', 'All sound on or off'], ['music', 'Music on or off']]]],
    pad: [['golem', 'Move and cast', [['jump', 'Jump · hold in the air to Lift'], ['shot', 'Shot, aimed with the right stick'], ['burst', 'Burst, around you'], ['move', 'Move: a dash, a blink, a climb'], ['rest', 'Rest at a Lodestone']]],
      ['rune', 'Recipe', [['fire', 'Add Fire'], ['water', 'Add Water'], ['earth', 'Add Earth'], ['lightning', 'Add Lightning'], ['undo', 'Take off the last element'], ['clear', 'Clear the recipe']]],
      ['keys', 'Menus', [['map', 'Map'], ['book', 'Spell book'], ['pause', 'Pause']]]],
  };
  const BIND_NOTE = { kbm: 'Click a key, then press the one you want instead. Run, jump, Move, Shot and Burst can also go on a mouse button. Esc cancels. The arrow keys always run and jump, 1 to 4 always add the elements, and Esc always pauses.',
    pad: 'Select a button, then press the one you want instead. The left stick always runs and the right stick aims. In a menu the d-pad moves, A presses, B goes back, and LB and RB change tab.' };
  const TOUCH_CARD = [['golem', 'Touch', [['Left thumb', 'A stick appears where you touch: run, and push into dirt to dig. Push it up or down as well to slope the tunnel'], ['Shot', 'Hold to cast. The golem aims at the nearest creature; drag from the button to aim yourself'], ['Jump · Move · Burst', 'The three buttons round Shot. Hold Jump in the air to Lift'],
    ['Elements', 'The buttons that fan round those; the arrow takes off the last one'], ['', 'Tap the Lodestone notice to rest; the map and the round buttons at the top open the menus']]]];
  function buildControls() {
    for (const dev of ['kbm', 'pad']) {
      const cap = KInput.capturing;
      $(dev === 'kbm' ? 'keysKbm' : 'keysPad').innerHTML = BIND_GROUPS[dev].map(([ic, title, rows]) => `<div class="keycard"><h3>${KIcon(ic)}${title}</h3>` + rows.map(([act, text]) => {
        const waiting = cap && cap.dev === dev && cap.action === act, col = elements[act] ? ` style="--c:${elements[act].css}"` : '';
        return `<div class="keyrow"><span>${text}</span><button type="button" class="rebind${waiting ? ' waiting' : ''}" data-dev="${dev}" data-act="${act}" aria-label="${text}: ${KInput.label(dev, act)}. Change"><kbd${col}>${waiting ? 'Press…' : KInput.label(dev, act)}</kbd></button></div>`;
      }).join('') + '</div>').join('') + `<div class="bind-foot"><p class="note">${BIND_NOTE[dev]}</p><button type="button" class="btn ghost small" data-reset="${dev}">Back to the usual ${dev === 'kbm' ? 'keys' : 'buttons'}</button></div>`;
    }
    $('keysTouch').innerHTML = TOUCH_CARD.map(([ic, title, rows]) => `<div class="keycard"><h3>${KIcon(ic)}${title}</h3>` + rows.map(([k, t]) => `<div class="keyrow"><span class="k">${k}</span><span>${t}</span></div>`).join('') + '</div>').join('');
  }
  $('viewControls').addEventListener('click', e => {
    const b = e.target.closest('.rebind'), r = e.target.closest('[data-reset]');
    if (r) { KInput.resetBindings(r.dataset.reset); return; }
    if (!b) return;
    const sel = `.rebind[data-dev="${b.dataset.dev}"][data-act="${b.dataset.act}"]`;
    KInput.startCapture(b.dataset.dev, b.dataset.act, () => { buildControls(); const again = document.querySelector(sel); if (again) again.focus({ preventScroll: true }); });
    buildControls();
  });
  // everything on screen that names a key: the element buttons, the spell book, the map and rest hints
  const hintDev = () => KInput.device === 'pad' ? 'pad' : 'kbm';   // v1.03: hints name the controller's buttons while one is in use
  function relabel(light) {
    if (!light) buildControls();
    for (const b of $('els').children) { const el = b.dataset.el, e = elements[el]; b.querySelector('kbd').textContent = KInput.label(hintDev(), el); b.title = `${e.name} (${KInput.label(hintDev(), el)})`; }
    for (const k of document.querySelectorAll('.form kbd[data-el]')) k.textContent = KInput.label('kbm', k.dataset.el);
    for (const k of document.querySelectorAll('[data-key]')) k.textContent = KInput.label(hintDev(), k.dataset.key);
    hud.near = -1; hud.name = '';
  }
  // pages inside a tab: a row of buttons (.seg), each showing one .segview
  const showSeg = (view, name) => {
    KInput.cancelCapture();
    for (const b of view.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', b.dataset.seg === name ? 'true' : 'false');
    for (const v of view.querySelectorAll('.segview')) v.hidden = v.dataset.segview !== name;
  };
  for (const b of document.querySelectorAll('.seg button')) b.addEventListener('click', () => showSeg(b.closest('.view'), b.dataset.seg));

  // ---------- golem picker (the look; also kept in the save) ----------
  let skin = game.players[ME].skin || 0;
  if (!hadSave) try { const v = parseInt(localStorage.getItem('castinstone.golem'), 10); if (v >= 0 && v < KData.golems.length) skin = v; } catch {}
  const golemBtns = KData.golems.map((g, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'golem'; b.setAttribute('role', 'radio');
    const c = document.createElement('canvas');
    KRender.preview(c, i, ['fire', 'water']);
    c.style.width = (c.width * 4) + 'px'; c.style.height = (c.height * 4) + 'px';
    b.append(c, Object.assign(document.createElement('span'), { textContent: g.name }), Object.assign(document.createElement('small'), { textContent: g.desc || '' }));
    b.addEventListener('click', () => pickGolem(i));
    $('golems').appendChild(b);
    return b;
  });
  function pickGolem(i) {
    skin = i; game.players[ME].skin = i; frozenDrawn = false;
    golemBtns.forEach((b, k) => b.setAttribute('aria-checked', k === i ? 'true' : 'false'));
    try { localStorage.setItem('castinstone.golem', String(i)); } catch {}
  }
  pickGolem(skin);

  // ---------- saving ----------
  let saveTimer = 0, saveFailed = false;
  function save() {
    // as a guest in co-op only the golem's progress goes home; the cave is the host's
    if (guestGame) { if (game.players[ME]) KSave.storeGuest(game.players[ME]); saveTimer = 0; return; }
    if (KNet.state === 'sync' && KNet.role === 'guest') return;
    // v1.02: whether or not it worked, wait the usual time before trying again (a failing save was retried every frame,
    // which cost most of the frame rate), and say so once
    saveTimer = 0;
    if (!KSave.store(game) && !saveFailed) { saveFailed = true; toast('The game could not be saved: this browser\'s storage for jza.app may be full.', 'big'); }
  }
  // A menu choice that changes the golem. Alone it happens at once; in co-op it travels with the
  // button presses, so both devices make it on the same step (the panel is rebuilt when it lands).
  const act = (name, ...args) => {
    if (KNet.on) { KInput.queue({ type: 'ui', name, args }); return true; }
    const r = game[name](game.players[ME], ...args);
    return r === undefined ? true : r;
  };
  addEventListener('pagehide', save);

  function regenLabel() { $('btnRegen').setAttribute('aria-checked', game.regen ? 'true' : 'false'); }

  // ---------- modes: start, help (spell book), pause, map, rest, play ----------
  let mode = 'start', confirmNew = false, panelTab = 'game', titleSub = false;   // titleSub: which page the title screen opened, if any
  const chip = (icon, text, cls = '') => `<span class="chip ${cls}">${KIcon(icon)}${text}</span>`;
  function showPanelTab(t) {
    panelTab = t; KInput.cancelCapture();
    confirmNew = false; $('btnNewCave').textContent = 'New game';   // v1.03: New game does not stay armed when you look elsewhere
    for (const b of document.querySelectorAll('#panelTabs .tab')) b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false');
    for (const v of document.querySelectorAll('#panel .view')) v.hidden = v.dataset.view !== t;
    if (t === 'book') renderSpecials();
    if (t === 'controls') showSeg($('viewControls'), KInput.device);   // the controls for what is in your hands
  }
  for (const b of document.querySelectorAll('#panelTabs .tab')) b.addEventListener('click', () => showPanelTab(b.dataset.tab));
  function setMode(m) {
    mode = m; frozenDrawn = false; KInput.cancelCapture();
    document.body.dataset.mode = m;
    KInput.clearHeld();
    $('restWrap').hidden = m !== 'rest';
    $('mapWrap').hidden = m !== 'map';
    $('endWrap').hidden = m !== 'end';
    // the title screen covers the start; the pages open from it (titleSub) and have a way back
    $('titleWrap').hidden = m !== 'start' || titleSub;
    $('btnBack').hidden = m !== 'start';
    $('panelWrap').hidden = m === 'play' || m === 'rest' || m === 'map' || m === 'end' || (m === 'start' && !titleSub);
    if (m !== 'start') titleSub = false;
    confirmNew = false; $('btnNewCave').textContent = 'New game'; $('tsNew').textContent = 'New game'; $('tsNew').classList.remove('confirm');
    if (m === 'play') { view.focus({ preventScroll: true }); return; }
    if (m === 'rest') { buildRest(); $('btnLeave').focus({ preventScroll: true }); return; }
    if (m === 'end') { buildEnd(); $('btnDescend').focus({ preventScroll: true }); return; }
    if (m === 'map') { drawBigMap(); $('btnMapClose').focus({ preventScroll: true }); return; }
    const p = game.players[ME], started = m !== 'start' || hadSave;
    $('panelEyebrow').textContent = KNet.on ? 'Co-op · the game goes on while this is open' : (m === 'start' ? KData.acts[game.act].name : `Paused · ${KData.acts[game.act].name}`);   // the version shows only in the title screen's corner
    $('deeperRow').hidden = !game.won || KNet.busy; regenLabel(); showOpts();
    $('btnGo').textContent = m === 'start' ? (hadSave ? 'Continue' : 'Start') : 'Resume';
    $('saveLine').innerHTML = !started ? '' : chip('star', `Level ${p.level}`) + (p.shards ? chip('shard', `${p.shards} shards`, 'teal') : '');
    $('panelLede').hidden = started;
    // the journey: what there is to find in this cave, and what it has given you
    const w = game.world, B = game.boons(), champs = game.enemies.filter(e => e.champion);
    const tile = (icon, n, of, name, note) => `<div class="jt${n >= of ? ' done' : ''}">${KIcon(icon)}<b>${n}<small> of ${of}</small></b><span>${name}</span><i>${note}</i></div>`;
    $('journeyTitle').hidden = $('journey').hidden = !started;
    if (started) $('journey').innerHTML =
      tile('stone', game.found.size, w.lodestones.length, 'Lodestones', 'Rest, travel') +
      tile('rune', game.opened.size, w.caches.length, 'Relic caches', 'Runestones, tomes') +
      tile('book', game.read.size, game.tablets.length, 'Rune tablets', B.tabs ? `+${KData.treasure.boons.tablet.mana * B.tabs} mana so far` : 'A spell, +5 mana each') +
      tile('crown', B.champs, champs.length, 'Champions', B.champs ? `+${KData.treasure.boons.champion.hp * B.champs} health and mana so far` : '+20 health and mana each') +
      tile('fire', B.cores, w.lair ? 1 : 0, w.lair ? KData.bosses[w.lair.boss].name : 'The last fight', w.lair ? (B.cores ? `${KData.bosses[w.lair.boss].core}: +40 mana` : `Guards the ${KData.bosses[w.lair.boss].core}`) : '') +
      tile('star', p.known.length, Object.keys(KData.specials).length, 'Special spells', 'Five circles');
    showPanelTab(m === 'help' ? 'book' : m === 'start' && titleSub ? titleSub : 'game');
    if (m === 'start' && !titleSub) { buildTitle(); return; }
    $('btnGo').focus({ preventScroll: true });
  }
  function buildTitle() {
    const p = game.players[ME];
    $('tsGo').textContent = hadSave ? 'Continue' : 'Begin';
    $('tsNew').hidden = !hadSave;
    $('tsSave').innerHTML = hadSave ? `<b>Level ${p.level}</b> · ${game.world.biomes[game.world.biomeAt(p.x, p.y - 8)].name} · ${KData.acts[game.act].name}` : '';
    if (KSave.unreadable) $('tsSave').textContent = 'Your saved game could not be read, so this is a new one. A copy of the old save has been kept.';   // v1.02
    $('tsVer').textContent = `Beta · ${VERSION}`;
    $('tsGo').focus({ preventScroll: true });
    fitTitle();
  }
  // The title shrinks as one piece until it fits the visible area with a margin (v0.80: on an iPad it ran off the screen)
  function fitTitle() {
    const t = $('ts'); if (!t || $('titleWrap').hidden) return;
    t.style.setProperty('--tss', 1);
    const VV = window.visualViewport, W = VV ? VV.width : innerWidth, H = VV ? VV.height : innerHeight, r = t.getBoundingClientRect();
    const s = Math.min(1, (W * 0.88) / r.width, (H * 0.86) / r.height);
    t.style.setProperty('--tss', s.toFixed(3));
  }
  addEventListener('resize', fitTitle); if (window.visualViewport) visualViewport.addEventListener('resize', fitTitle);
  $('tsGo').addEventListener('click', () => $('btnGo').click());
  for (const b of document.querySelectorAll('.ts-item[data-open]')) b.addEventListener('click', () => { titleSub = b.dataset.open; setMode('start'); });
  $('btnBack').addEventListener('click', () => { titleSub = false; setMode('start'); });
  view.tabIndex = -1;
  const resume = () => setMode('play');
  // Reset the cave: rebuild it from its seed, keeping the golem's progress.
  // the Options tab: what can be done to the save here (in co-op, neither: the cave is the host's)
  function showOpts() {
    $('rowReset').hidden = mode === 'start' || KNet.busy;
    $('rowNew').hidden = KNet.busy;
    $('caveTitle').hidden = $('caveOpts').hidden = $('rowReset').hidden && $('rowNew').hidden;
    $('optMusic').setAttribute('aria-checked', KAudio.music ? 'true' : 'false');
    $('optSound').setAttribute('aria-checked', KAudio.muted ? 'false' : 'true');
  }
  const resetMap = () => { game.reset(true); game.players[ME].skin = skin; acc = 0; mapTick = 0; save(); };
  $('btnGo').addEventListener('click', () => { const first = mode === 'start' && !hadSave && !toldPremise; KAudio.start(); resume(); if (first) { toldPremise = true; toast('Three champions hold the seals on the Emberwyrm. Find them.', 'big'); } });
  let toldPremise = false;
  for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) addEventListener(type, () => KAudio.start(), { capture: true, passive: true });   // v1.00: every time, as MORPHOS (iOS can interrupt sound at any point)
  const muteBtn = $('btnMute');
  const showMute = () => { muteBtn.setAttribute('aria-pressed', KAudio.muted ? 'true' : 'false'); muteBtn.innerHTML = KIcon(KAudio.muted ? 'mute' : 'sound'); muteBtn.title = KAudio.muted ? 'Sound is off (M)' : 'Sound is on (M)'; showOpts(); };
  muteBtn.addEventListener('click', () => { KAudio.start(); KAudio.setMuted(!KAudio.muted); showMute(); view.focus({ preventScroll: true }); });
  showMute();
  const musicBtn = $('btnMusic');
  const showMusic = () => { musicBtn.setAttribute('aria-pressed', KAudio.music ? 'false' : 'true'); musicBtn.innerHTML = KIcon(KAudio.music ? 'music' : 'nomusic'); musicBtn.title = KAudio.music ? 'Music is on (N)' : 'Music is off (N)'; showOpts(); };
  const toggleMusic = () => { KAudio.start(); KAudio.setMusic(!KAudio.music); showMusic(); };
  musicBtn.addEventListener('click', () => { toggleMusic(); view.focus({ preventScroll: true }); });
  showMusic();
  $('btnPanelReset').addEventListener('click', () => { resetMap(); resume(); });
  // a new game: a second press confirms, as it replaces the saved world and the golem's progress
  function newGame() {
    game = new KGame.Game(randomSeed()); game.players[ME].skin = skin; window.cis.game = game;
    KSave.clear(); save(); acc = 0; mapTick = 0; toasts.length = 0; KAudio.start(); resume();
  }
  $('btnNewCave').addEventListener('click', () => {
    if (!confirmNew) { confirmNew = true; $('btnNewCave').textContent = 'Press again to confirm'; return; }
    newGame();
  });
  $('tsNew').addEventListener('click', () => {
    if (!confirmNew) { confirmNew = true; $('tsNew').textContent = 'Start over? Press again'; $('tsNew').classList.add('confirm'); return; }
    newGame();
  });
  $('optMusic').addEventListener('click', () => { toggleMusic(); showOpts(); });
  $('optSound').addEventListener('click', () => { KAudio.start(); KAudio.setMuted(!KAudio.muted); showMute(); showOpts(); });
  $('btnPause').addEventListener('click', () => setMode('pause'));
  $('btnSpells').addEventListener('click', () => setMode('help'));
  $('btnMap').addEventListener('click', () => setMode('map'));
  $('btnLeave').addEventListener('click', resume);
  for (const b of document.querySelectorAll('.hud button')) b.addEventListener('pointerdown', e => e.stopPropagation());

  KInput.attach(view, {
    blocked: () => mode !== 'play',
    onClose: () => { if (mode !== 'start') resume(); else if (titleSub) { titleSub = false; setMode('start'); } },
    onPause: () => { if (mode === 'start') { if (titleSub) { titleSub = false; setMode('start'); } return; } setMode(mode === 'play' ? 'pause' : 'play'); },
    onHelp: () => setMode(mode === 'help' ? 'play' : 'help'),
    onMap: () => { if (mode === 'play') setMode('map'); else if (mode === 'map') setMode('play'); },
    onReset: () => {},
    onFull: fullScreen,
    onMute: () => { KAudio.start(); KAudio.setMuted(!KAudio.muted); showMute(); },
    onMusic: () => toggleMusic(),
    onBindings: () => relabel(),
    onNav: (dx, dy) => padMenu({ dx, dy }),
    // touch: with no finger aiming, aim at the nearest creature in view, if any
    autoAim: () => {
      const p = game.players[ME], c = game.chest(p), w = game.world; let best = null, bd = 185;
      const look = a => { if (!a || a.dead || a.asleep) return; const tx = a.x, ty = a.y - a.h / 2, d = Math.hypot(tx - c.x, ty - c.y); if (d < bd && d > 1 && !w.ray(c.x, c.y, (tx - c.x) / d, (ty - c.y) / d, Math.max(0, d - Math.max(a.w, a.h) / 2 - 1)).hit) { bd = d; best = { aim: Math.atan2(ty - c.y, tx - c.x), dist: d }; } };
      for (const e of game.enemies) if (Math.abs(e.x - c.x) < 190) look(e);
      look(game.boss);
      return best;
    },
    onTouchDrop: () => touchPad && touchPad.release(),
  });
  const touchPad = KTouch.build($('touch'));
  $('restPrompt').addEventListener('pointerdown', e => { e.stopPropagation(); KInput.queue({ type: 'interact' }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { KInput.clearHeld(); save(); if (mode === 'play') setMode('pause'); } else KAudio.wake(); });
  // v1.00: as MORPHOS: losing focus (Control Centre, a notification, a call, Slide Over) lets go of everything held and pauses,
  // since iOS can end the touches without telling the page
  document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); }, { capture: true });
  addEventListener('blur', () => { KInput.clearHeld(); if (mode === 'play') setMode('pause'); });
  addEventListener('pagehide', () => { KInput.clearHeld(); save(); });
  // ---------- a controller in the menus ----------
  // The d-pad or left stick moves to the nearest button in that direction, A
  // presses it, B or Menu goes back to the game, LB and RB change tab.
  const openWrap = () => mode === 'end' ? $('endWrap') : mode === 'rest' ? $('restWrap') : mode === 'map' ? $('mapWrap') : mode === 'start' && !titleSub ? $('titleWrap') : $('panelWrap');
  const shown = e => !e.disabled && e.offsetParent !== null;
  function padMenu(a) {
    if (mode === 'play') return;
    const wrap = openWrap();
    if (a.map && mode === 'map') { resume(); return; }   // v1.05: the map button closes the map it opened
    if (a.pause || a.back) { if (mode !== 'start') resume(); else if (titleSub) { titleSub = false; setMode('start'); } return; }   // on a page opened from the title, back returns to it
    if (a.tab) {
      const tabs = [...wrap.querySelectorAll('.tab')].filter(shown);
      if (!tabs.length) return;
      const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'), n = tabs[(i + a.tab + tabs.length) % tabs.length];
      n.click(); n.focus({ preventScroll: true });
      return;
    }
    const list = [...wrap.querySelectorAll('button')].filter(shown);
    if (!list.length) return;
    let cur = document.activeElement;
    if (!wrap.contains(cur) || !shown(cur)) cur = null;
    const first = () => { const f = [...wrap.querySelectorAll('.shell-body button')].filter(shown)[0] || list[0]; f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'nearest' }); };
    if (a.accept) {
      if (!cur) return first();
      cur.click();
      // the press may have redrawn the panel: keep the cursor somewhere sensible
      const f = document.activeElement;
      if (mode !== 'play' && !(openWrap().contains(f) && shown(f))) { if (document.contains(cur) && shown(cur)) cur.focus({ preventScroll: true }); else first(); }
      return;
    }
    if (!cur) return first();
    // the nearest button in the direction pressed; one in line with this one beats one off to the side
    // down from a tab goes to the first control of that tab, in reading order
    if (a.dy > 0 && cur.classList.contains('tab')) { const f = [...wrap.querySelectorAll('.shell-body button')].filter(shown)[0]; if (f) { f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'nearest' }); return; } }
    // v1.03: the four places round the golem on the Runestones tab have fixed neighbours (as MORPHOS's ring), since the
    // nearest-button rule sent Left from Core to Head
    if (cur.classList.contains('rr-node')) {
      const s = cur.dataset.place, to = a.dx < 0 ? (s === 'arms' ? null : 'arms') : a.dx > 0 ? (s === 'arms' ? 'core' : null) : a.dy < 0 ? (s === 'head' ? null : 'head') : a.dy > 0 ? (s === 'legs' ? null : 'legs') : null;
      const go = to && wrap.querySelector(`.rr-node[data-place="${to}"]`);
      if (go) { go.focus({ preventScroll: true }); return; }
    }
    const pick = (pool) => {
    const r = cur.getBoundingClientRect();
    let best = null, bs = 1e9;
    for (const c of pool) {
      if (c === cur) continue;
      const q = c.getBoundingClientRect();
      let along, across;
      if (a.dx) { along = a.dx > 0 ? q.left - r.right : r.left - q.right; across = q.bottom < r.top ? r.top - q.bottom : q.top > r.bottom ? q.top - r.bottom : 0; }
      else { along = a.dy > 0 ? q.top - r.bottom : r.top - q.bottom; across = q.right < r.left ? r.left - q.right : q.left > r.right ? q.left - r.right : 0; }
      if (along < -2) continue;
      const score = along + across * 1.2;
      if (score < bs) { bs = score; best = c; }
    }
    return best;
    };
    const best = pick(list);
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest' }); }
  }

  // ---------- rest at a Lodestone: stats, runestones, the forge, travel ----------
  let restTab = 'stats';
  const STAT_ICON = { attack: 'attack', defence: 'defence', vitality: 'heart', mana: 'drop', focus: 'focus', fire: 'fire', water: 'water', earth: 'earth', lightning: 'lightning' };
  const STAT_COL = { attack: '#ffd37a', defence: '#c9c2d6', vitality: '#e0705c', mana: '#b79cff', focus: '#b79cff' };
  function buildRest() {
    const p = game.players[ME], P = KData.progression, here = p.nearStone || game.world.lodestones[ME ? p.checkpoint ?? game.checkpoint : game.checkpoint];
    $('restWhere').textContent = here ? `${here.hub ? 'The hub' : here.region} · Level ${here.level}` : '';
    $('restLevel').textContent = p.level;
    $('restGem').style.setProperty('--pct', Math.min(100, 100 * p.xp / P.xpFor(p.level)).toFixed(1));
    $('restXp').textContent = `${Math.floor(p.xp)} of ${P.xpFor(p.level)} experience to level ${p.level + 1}`;
    $('restChips').innerHTML = chip('star', p.points ? `${p.points} stat point${p.points === 1 ? '' : 's'}` : 'No stat points', p.points ? 'gold' : '') + chip('shard', `${p.shards || 0} shards`, 'teal');
    for (const t of document.querySelectorAll('.rest-tab')) {
      t.setAttribute('aria-selected', t.dataset.tab === restTab ? 'true' : 'false');
      const dot = t.querySelector('.dot'); if (dot) dot.remove();
      if (t.dataset.tab === 'stats' && p.points > 0) t.insertAdjacentHTML('beforeend', '<i class="dot"></i>');
    }
    for (const v of document.querySelectorAll('.rest-view')) v.hidden = v.dataset.view !== restTab;
    // stats
    const grid = $('statGrid');
    grid.innerHTML = '';
    for (const s of P.stats) {
      const n = p.alloc[s.id] || 0, row = document.createElement('div');
      row.className = 'stat';
      row.style.setProperty('--c', s.el ? elements[s.el].css : STAT_COL[s.id]);
      let pips = ''; for (let k = 0; k < 12; k++) pips += `<i class="${k < n ? 'on' : ''}"></i>`;
      row.innerHTML = `<span class="si">${KIcon(STAT_ICON[s.id])}</span><span class="sn">${s.name}</span><span class="sv">${s.show(n)}</span><span class="sd">${s.desc}</span><span class="pips" title="${n} point${n === 1 ? '' : 's'} spent">${pips}</span>`;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'plus'; b.textContent = '+'; b.disabled = p.points <= 0;
      b.setAttribute('aria-label', `Add a point to ${s.name}`);
      b.addEventListener('click', () => { if (act('spendPoint', s.id)) { buildRest(); save(); const nb = grid.querySelectorAll('.plus')[P.stats.indexOf(s)]; if (nb && !nb.disabled) nb.focus({ preventScroll: true }); } });
      row.appendChild(b);
      grid.appendChild(row);
    }
    // travel
    const tl = $('travelList');
    tl.innerHTML = '';
    for (const l of game.world.lodestones) {
      if (!game.found.has(l.id)) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'trip';
      const isHere = here && here.id === l.id, biome = game.world.biomes.find(x => x.name === l.region);
      if (biome) b.style.setProperty('--c', rgb(biome.strata[0]));
      const d = here ? Math.round(Math.hypot(l.x - here.x, l.y - here.y)) : 0;
      b.innerHTML = `<b>${l.hub ? 'The hub' : l.region}</b><span>Level ${l.level}</span><small>${isHere ? 'You are here' : d + ' away'}</small>`;
      b.disabled = isHere;
      b.addEventListener('click', () => { act('travel', l.id); save(); resume(); });
      tl.appendChild(b);
    }
    const unfound = game.world.lodestones.length - game.found.size;
    $('travelNote').textContent = unfound ? `${unfound} more Lodestone${unfound === 1 ? '' : 's'} somewhere in the cave.` : 'You have found every Lodestone.';
    if (window.KRest) window.KRest.build(game, p, restTab);
  }
  for (const t of document.querySelectorAll('.rest-tab')) t.addEventListener('click', () => { restTab = t.dataset.tab; buildRest(); });
  // v0.82: on a touch screen, a swipe left or right across a menu moves to the next or previous tab
  function swipeTabs(body, tabSel, viewSel, pick) {
    let sx = 0, sy = 0, st = 0, on = false;
    body.addEventListener('touchstart', e => {
      on = e.touches.length === 1 && !e.target.closest('input, textarea, select, .seg, [data-noswipe]');
      if (!on) return; const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = performance.now();
    }, { passive: true });
    body.addEventListener('touchend', e => {
      if (!on) return; on = false;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - st > 700) return;   // a clear sideways flick only
      const list = [...document.querySelectorAll(tabSel)].filter(b => !b.hidden && b.offsetParent !== null);
      const i = list.findIndex(b => b.getAttribute('aria-selected') === 'true'), j = i + (dx < 0 ? 1 : -1);
      if (i < 0 || j < 0 || j >= list.length) return;
      pick(list[j]); body.scrollTop = 0;
      const v = document.querySelector(viewSel); if (v) { v.classList.remove('slide-l', 'slide-r'); void v.offsetWidth; v.classList.add(dx < 0 ? 'slide-l' : 'slide-r'); }
    }, { passive: true });
    body.addEventListener('touchcancel', () => { on = false; }, { passive: true });
  }
  swipeTabs(document.querySelector('#panel .shell-body'), '#panelTabs .tab', '#panel .view:not([hidden])', b => showPanelTab(b.dataset.tab));
  swipeTabs(document.querySelector('#restWrap .shell-body'), '.rest-tab', '.rest-view:not([hidden])', b => { restTab = b.dataset.tab; buildRest(); });

  // ---------- notices (top centre): experience, levels, finds ----------
  const toasts = [];
  const TOAST_ICON = { xp: 'star', shard: 'shard', loot: 'rune', stone: 'stone', big: 'crown', died: 'skull' };
  function toast(text, kind = '') { toasts.push({ text, kind, t: 0 }); if (toasts.length > 4) toasts.shift(); renderToasts(); }
  function renderToasts() {
    $('toasts').innerHTML = toasts.map(t => `<div class="toast ${t.kind}">${KIcon(TOAST_ICON[t.kind] || 'info')}<span>${t.text}</span></div>`).join('');
  }
  let xpPending = 0, xpTimer = 0, shardPending = 0, shardTimer = 0, endAt = 0;
  function handleEvents(dt) {
    for (const e of game.events) {
      if (e.p !== undefined && e.p !== ME) continue;   // the other golem's news
      if (e.type === 'ui') { if (mode === 'rest') buildRest(); regenLabel(); continue; }
      if (e.type === 'xp') { xpPending += e.amount; xpTimer = 0.6; saveTimer = Math.max(saveTimer, 17); }   // a kill is saved within 3 s
      else if (e.type === 'shard') { shardPending++; shardTimer = 0.7; }
      else if (e.type === 'level') {
        // point the way to the nearest Lodestone you have found, where points are spent
        const p = game.players[ME];
        let best = null, bd = 1e9;
        for (const id of game.found) { const l = game.world.lodestones[id]; if (!l) continue; const d = Math.hypot(l.x - p.x, l.y - p.y); if (d < bd) { bd = d; best = l; } }
        const where = !best ? '' : bd < 40 ? (KInput.device === 'touch' ? ' · tap the notice to rest here' : ` · press ${KInput.label(KInput.device === 'pad' ? 'pad' : 'kbm', 'rest')} at the Lodestone here`) : ` · nearest Lodestone ${Math.round(bd)} ${Math.abs(best.x - p.x) > Math.abs(best.y - p.y) ? (best.x < p.x ? 'west' : 'east') : (best.y < p.y ? 'up' : 'down')}`;
        toast(`Level ${e.level} · ${e.points} stat point${e.points === 1 ? '' : 's'} to spend at a Lodestone${where}`, 'big');
      }
      else if (e.type === 'found') toast(`Lodestone found · ${e.stone.hub ? 'the hub' : e.stone.region}`, 'stone');
      else if (e.type === 'ending') { save(); endAt = 2.2; }
      else if (e.type === 'rest') { save(); if (e.p === ME) KAudio.play('rest', 0, 0, 0, 0, 1); if (mode === 'play') setMode('rest'); }
      else if (e.type === 'save') save();
      else if (e.type === 'died') toast('Your golem crumbled. It rises again at the last Lodestone.', 'died');
      else if (e.type === 'toast') toast(e.text, e.kind || '');
      else if (e.type === 'learn') { const S = KData.specials[e.id]; toast(`${e.how === 'tome' ? 'A tome' : 'Discovered'}: ${S.name} · ${S.seq.map(x => elements[x].name).join(', ')} · ${S.cost} mana`, 'big'); }
    }
    game.events.length = 0;
    if (endAt > 0 && (endAt -= dt) <= 0 && mode === 'play') setMode('end');   // a moment to watch it fall, then the ending
    if (xpPending && (xpTimer -= dt) <= 0) { toast(`+${xpPending} experience`, 'xp'); xpPending = 0; }
    if (shardPending && (shardTimer -= dt) <= 0) { toast(`+${shardPending} shard${shardPending === 1 ? '' : 's'} · ${game.players[ME].shards} in all`, 'shard'); shardPending = 0; }
    let changed = false;
    for (const t of toasts) t.t += dt;
    while (toasts.length && toasts[0].t > (toasts[0].kind === 'big' ? 4.5 : 3)) { toasts.shift(); changed = true; }
    if (changed) renderToasts();
  }

  // ---------- HUD ----------
  const hud = { hp: -1, mana: -1, maxHp: -1, maxMana: -1, q: null, name: '', flash: 0, mflash: 0, lv: '', boss: '', buffs: '' };
  function updateHud() {
    const p = game.players[ME];
    if (KInput.device !== hud.dev) { hud.dev = KInput.device; relabel(true); }
    // health and mana: the liquid in the two orbs
    const hp = Math.round(p.hp);
    if (hp !== hud.hp || p.maxHp !== hud.maxHp) {
      hud.hp = hp; hud.maxHp = p.maxHp;
      const o = $('hpOrb');
      o.style.setProperty('--f', (Math.max(0, hp) / p.maxHp).toFixed(3));
      $('hpText').textContent = Math.max(0, hp);
      o.setAttribute('aria-valuenow', Math.max(0, hp)); o.setAttribute('aria-valuemax', p.maxHp);
      o.classList.toggle('low', hp < p.maxHp * 0.35);
    }
    const mana = Math.round(p.mana);
    if (mana !== hud.mana || p.maxMana !== hud.maxMana) {
      hud.mana = mana; hud.maxMana = p.maxMana;
      const o = $('manaOrb');
      o.style.setProperty('--f', (mana / p.maxMana).toFixed(3));
      $('manaText').textContent = mana;
      o.setAttribute('aria-valuenow', mana); o.setAttribute('aria-valuemax', p.maxMana);
      o.classList.toggle('empty', p.manaWait > 0.4 && mana < 1);
    }
    if (p.manaFlash > 0.3 && hud.mflash <= 0.3) { const o = $('manaOrb'); o.classList.remove('short'); void o.offsetWidth; o.classList.add('short'); }
    hud.mflash = p.manaFlash;
    // level: the gem and its ring of experience
    const P = KData.progression, lv = `${p.level}|${Math.floor(p.xp)}|${p.points}`;
    if (lv !== hud.lv) {
      hud.lv = lv;
      $('lvNum').textContent = p.level;
      $('lvGem').style.setProperty('--pct', Math.min(100, 100 * p.xp / P.xpFor(p.level)).toFixed(1));
      $('ptsBadge').hidden = !p.points;
      $('ptsBadge').textContent = `+${p.points}`;
    }
    // the recipe: seven sockets, the first one the form
    const qsig = p.queue.join('+') + (p.used ? '!' : '');
    if (qsig !== hud.q) {
      // v0.93: the seven sockets are made once and changed in place; only a socket whose element changed is redrawn
      // (and only it plays the drop-in animation)
      hud.q = qsig;
      const qn = $('queue');
      if (qn.children.length !== KData.recipe.max) { let h = ''; for (let i = 0; i < KData.recipe.max; i++) h += `<span class="sock${i === 0 ? ' form' : ''}"></span>`; qn.innerHTML = h; }
      for (let i = 0; i < KData.recipe.max; i++) {
        const e = p.queue[i] || '', sk = qn.children[i];
        if (sk.dataset.el === e) continue;
        sk.dataset.el = e; sk.classList.toggle('on', !!e);
        if (e) { sk.style.setProperty('--c', elements[e].css); sk.innerHTML = KIcon(e); } else { sk.style.removeProperty('--c'); sk.innerHTML = ''; }
      }
      qn.classList.toggle('used', !!p.used);
    }
    if (p.slotFlash > 0.3 && hud.flash <= 0.3) { const s = $('queue'); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
    hud.flash = p.slotFlash;
    // what each way of casting gives, and what it costs
    const pad = KInput.device === 'pad', tch = KInput.device === 'touch';
    const RC = KRecipe.resolve(p.queue);
    p.recipe = RC;
    const specs = KData.modes.map(md => RC ? game.spec(p, md) : null);
    const name = p.queue.join('+') + specs.map((sp, i) => !sp ? '-' : (sp.special ? 'S' : '') + (p.mana >= (sp.drain ? sp.min : sp.cost) ? 1 : 0) + (p.channels[KData.modes[i]] ? 'L' : '')).join('') + (pad ? '#pad' : '') + KInput.rev;
    if (name !== hud.name) {
      hud.name = name;
      const dev = pad ? 'pad' : 'kbm', keysFor = { shot: KInput.label(dev, 'shot'), burst: KInput.label(dev, 'burst'), lift: KInput.label(dev, 'jump'), move: KInput.label(dev, 'move') };
      $('plates').innerHTML = KData.modes.map((md, i) => {
        const sp = specs[i];
        if (!sp) return `<div class="plate idle"><span class="pi">${KIcon(md)}</span><span class="pn">${MODE_LABEL[md][0]}</span><span class="pc"><kbd>${keysFor[md]}</kbd></span></div>`;
        const ok = p.mana >= (sp.drain ? sp.min : sp.cost);
        return `<div class="plate${sp.special ? ' special' : ''}${ok ? '' : ' no'}${p.channels[md] ? ' live' : ''}" title="${sp.name}"><span class="pi">${KIcon(md)}</span><span class="pn">${sp.special ? sp.name : sp.baseName}</span>` +
          `<span class="pc"><kbd>${keysFor[md]}</kbd>${sp.drain ? Math.round(sp.drain) + ' /s' : sp.cost}</span></div>`;
      }).join('');
    }
    // lasting effects of special spells
    const B = [['hasteT', 'Haste'], ['skinT', 'Stoneskin'], ['mendT', 'Mend'], ['prismT', 'Prism'], ['titanT', 'Titan'], ['phoenixT', 'Phoenix']];
    const buffs = B.filter(([k]) => p[k] > 0).map(([k, n]) => `${n} ${Math.ceil(p[k])}`).concat(game.stillT > 0 ? [`Stillness ${Math.ceil(game.stillT)}`] : []).join('|');
    if (buffs !== hud.buffs) { hud.buffs = buffs; $('buffs').innerHTML = buffs.split('|').filter(Boolean).map(t => `<span class="buff">${t}s</span>`).join(''); }
    // the health of the boss, or of a champion that has noticed you
    let b = game.boss; if (!(b && !b.dead && b.engaged)) b = game.championNear(p);
    const bossName = b ? (b.champion || KData.bosses[b.type].name) : '';
    if (bossName !== hud.boss) { hud.boss = bossName; $('bossBar').hidden = !b; $('bossName').textContent = bossName; stage.classList.toggle('has-boss', !!b); }
    if (b) $('bossFill').style.transform = `scaleX(${Math.max(0, b.hp) / b.maxHp})`;
    // the rest prompt next to a Lodestone
    const near = !!p.nearStone && mode === 'play';
    if ((near ? (pad ? 2 : tch ? 3 : 1) : 0) !== hud.near) { hud.near = near ? (pad ? 2 : tch ? 3 : 1) : 0; $('restPrompt').hidden = !near; $('restPrompt').innerHTML = tch ? `${KIcon('stone')}Tap to rest at the Lodestone` : pad ? `<kbd>${KInput.label('pad', 'rest')}</kbd>Rest at the Lodestone` : `<kbd>${KInput.label('kbm', 'rest')}</kbd>Rest at the Lodestone`; }
  }

  // ---------- what is under the mouse (a note in the corner) ----------
  let lookText = '';
  function describe(wx, wy) {
    const pad = 1;
    for (const a of game.actors) {
      if (a.dead || a.asleep || !game.inBox(a, wx, wy, pad)) continue;
      const hp = `Health ${Math.max(0, Math.ceil(a.hp))} of ${a.maxHp}`;
      const status = game.statusText(a);
      if (a.kind === 'player') return [`You (${KData.golems[a.skin].name}) · Level ${a.level}`, `${hp}. Mana ${Math.round(a.mana)} of ${a.maxMana}.`];
      if (a.kind === 'dummy') return ['Training dummy', `${hp}. Heals when left alone.`];
      if (a.kind === 'boss') { const B = KData.bosses[a.type]; return [`${B.name} · Level ${a.level}`, `${hp}.${status} ${B.desc}`]; }
      const E = KData.enemies[a.kind];
      if (E) return [`${a.elite ? 'Elite ' : ''}${E.name} · Level ${a.level}`, `${hp}.${status} ${E.desc || ''}`.trim()];
    }
    const w = game.world, x = Math.floor(wx), y = Math.floor(wy);
    for (const l of w.lodestones) if (Math.abs(wx - l.x) < 5 && wy > l.y - 15 && wy < l.y + 1)
      return [game.found.has(l.id) ? 'Lodestone' : 'Lodestone (not yet found)', 'Touch it to make it your checkpoint and repair. Stand by it and press ' + KInput.label('kbm', 'rest') + ' to rest: spend points, change runestones, travel.'];
    if (window.KLoot) { const d = window.KLoot.describe(game, wx, wy); if (d) return d; }
    if (!w.inb(x, y)) return null;
    const m = w.get(x, y);
    if (m === KData.M.EMPTY) return null;
    if (m === KData.M.WATER && w.charge[y * w.w + x]) return ['Electrified water', 'Hurts anything inside it, for a moment.'];
    const mat = KData.materials[m];
    return [mat.name, mat.desc || ''];
  }
  function updateLook() {
    let info = null;
    if (mode === 'play' && KInput.device === 'kbm' && KInput.mouse.moved) {
      const r = view.getBoundingClientRect(), mx = KInput.mouse.x, my = KInput.mouse.y;
      if (mx >= r.left && mx < r.right && my >= r.top && my < r.bottom) { const p = R.clientToWorld(mx, my); info = describe(p.x, p.y); }
    }
    const t = info ? info.join('|') : '';
    if (t === lookText) return;
    lookText = t;
    $('look').hidden = !info;
    if (info) { $('lookName').textContent = info[0]; $('lookDesc').textContent = info[1]; }
  }

  // ---------- map of the explored cave, and the region you are in ----------
  // The small map in the corner shows the cave around you (6 cells a pixel);
  // Tab or a click on it opens the whole explored cave (4 cells a pixel).
  const mm = $('minimap'), mctx = mm.getContext('2d'), mimg = mctx.createImageData(mm.width, mm.height), mbuf = new Uint32Array(mimg.data.buffer);
  const big = $('bigMap'), bctx = big.getContext('2d'), bimg = bctx.createImageData(big.width, big.height), bbuf = new Uint32Array(bimg.data.buffer);
  const pk = (r, g, b, a = 255) => (a << 24) | (b << 16) | (g << 8) | r;
  let mapTick = 0, regionText = '';
  // paint the explored cave from world point (x0, y0), s world cells to a pixel, into buf (W x H)
  function paintMap(buf, W, H, x0, y0, s) {
    const w = game.world, M = KData.M;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wx = Math.floor(x0 + (x + 0.5) * s), wy = Math.floor(y0 + (y + 0.5) * s), o = y * W + x;
      if (wx < 0 || wy < 0 || wx >= w.w || wy >= w.h || !w.explored[(wy >> 5) * w.cw + (wx >> 5)]) { buf[o] = pk(8, 6, 12, W === mm.width ? 0 : 255); continue; }
      const m = w.get(wx, wy), B = game.world.biomes[w.biomeAt(wx, wy)].strata[0];
      buf[o] = m === M.ROCK ? pk(52, 58, 84) : m === M.WATER ? pk(44, 90, 190) : m === M.MAGMA ? pk(230, 100, 40) : m === M.CRYSTAL ? pk(96, 224, 214)
        : KWorld.SOLID[m] || m === M.MUD ? pk(B[0] * 0.75, B[1] * 0.75, B[2] * 0.75) : pk(24, 20, 34);
    }
    const dot = (wx, wy, c, bigDot) => {
      const X = Math.floor((wx - x0) / s), Y = Math.floor((wy - y0) / s), r = bigDot ? (W === mm.width ? 1 : 2) : 0;
      for (let dy = -r + (r === 1 ? 1 : 0); dy <= r; dy++) for (let dx = -r + (r === 1 ? 1 : 0); dx <= r; dx++) if (X + dx >= 0 && Y + dy >= 0 && X + dx < W && Y + dy < H) buf[(Y + dy) * W + X + dx] = c;
    };
    for (const l of w.lodestones) {
      if (game.found.has(l.id)) dot(l.x, l.y - 4, pk(201, 182, 255), true);
      else if (w.explored[(l.y >> 5) * w.cw + (l.x >> 5)]) dot(l.x, l.y - 4, pk(120, 108, 150), true);
    }
    if (window.KLoot) window.KLoot.mapDots(game, dot, pk);
    for (const e of game.enemies) if (e.champion && !e.dead && w.explored[(e.home.y >> 5) * w.cw + (e.home.x >> 5)]) dot(e.home.x, e.home.y - 6, pk(255, 110, 180), true);
    const L = w.lair;
    if (L && !game.defeated.has(L.boss) && w.explored[(L.y >> 5) * w.cw + (L.x >> 5)]) { dot(L.x - 3 * s / 4, L.y, pk(255, 90, 40), true); dot(L.x + 3 * s / 4, L.y, pk(255, 90, 40), true); }
    const p = game.players[ME];
    for (const q of game.players) if (q !== p) dot(q.x, q.y - 8, pk(120, 230, 255), true);   // a friend
    dot(p.x, p.y - 8, pk(255, 255, 255), true);
    if (W !== mm.width) { const X = Math.floor((p.x - x0) / s), Y = Math.floor((p.y - 8 - y0) / s); for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, 0], [3, 0], [0, -3], [0, 3]]) if (X + dx >= 0 && Y + dy >= 0 && X + dx < W && Y + dy < H) buf[(Y + dy) * W + X + dx] = pk(255, 255, 255); }
  }
  function drawBigMap() {
    const w = game.world, p = game.players[ME];
    paintMap(bbuf, big.width, big.height, 0, 0, w.w / big.width);
    bctx.putImageData(bimg, 0, 0);
    const found = game.found.size, all = w.lodestones.length;
    const champs = game.enemies.filter(e => e.champion), left = champs.filter(e => !e.dead).length;
    $('mapInfo').innerHTML = chip('map', `${game.world.biomes[w.biomeAt(p.x, p.y - 8)].name} · Level ${w.levelAt(p.x, p.y)}`) + chip('stone', `${found} of ${all} Lodestones`) + chip('crown', `${champs.length - left} of ${champs.length} champions beaten`);
  }
  $('mapBox').addEventListener('click', () => { if (mode === 'play') setMode('map'); });
  $('btnMapClose').addEventListener('click', () => setMode('play'));
  function updateMap() {
    if (mapTick++ % 12) return;
    const w = game.world, p = game.players[ME], S = 6;
    const x0 = Math.max(0, Math.min(w.w - mm.width * S, p.x - mm.width * S / 2)), y0 = Math.max(0, Math.min(w.h - mm.height * S, p.y - mm.height * S / 2));
    paintMap(mbuf, mm.width, mm.height, x0, y0, S);
    mctx.putImageData(mimg, 0, 0);
    const t = `${game.world.biomes[w.biomeAt(p.x, p.y - 8)].name}|Level ${w.levelAt(p.x, p.y)}`;
    if (t !== regionText) { regionText = t; $('region').textContent = t.split('|')[0]; $('regionLv').textContent = t.split('|')[1]; }
  }

  // ---------- loop ----------
  let acc = 0, last = performance.now();
  const origin = () => { const p = game.players[ME]; const c = game.chest(p), q = R.worldToClient(c.x, c.y); q.scale = view.getBoundingClientRect().width / V.w; return q; };
  // in co-op, with a panel open this golem stands still and cannot be hurt; menu choices still go through
  const coopSample = () => {
    const a = KInput.sample(origin);
    return mode === 'play' ? a : { move: 0, moveY: 0, jump: false, cast: false, burst: false, moveSpell: false, away: true, aim: a.aim, aimDist: a.aimDist, events: a.events.filter(e => e.type === 'ui') };
  };
  let frameN = 0;
  function frameBody(now) {
    if (KNet.syncFor > 120000) KNet.stop('The two games could not be matched up, so co-op was stopped. Your progress is saved.');   // v1.02: it could wait for ever
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // v1.00, as MORPHOS: the size is checked every frame (fit() returns at once when nothing changed), so a size iOS changes
    // without telling the page is caught within a frame; and every 20 frames the page is put back if anything scrolled it
    fit();
    if (++frameN % 20 === 0) { const vv = window.visualViewport; if (scrollX || scrollY || document.documentElement.scrollTop || document.body.scrollTop || (vv && Math.abs(vv.offsetTop) > 1)) { scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; } }
    const padAct = KInput.poll(mode === 'play', now);
    if (padAct) padMenu(padAct);
    if (KNet.on) {
      // co-op: the game goes on whatever is open, and a step runs only when both players' presses for it are here
      game.hitStop = 0; acc = Math.min(acc + dt, STEP * 8);
      if (KNet.behind > 1) acc += STEP;   // the other device is ahead: catch up
      let n = 0;
      while (acc >= STEP && n < 8) { if (!KNet.step(coopSample)) break; acc -= STEP; n++; }
      saveTimer += dt;
      if (saveTimer > 20) save();
      const w = KNet.waited;
      $('netWait').hidden = w < 900;
      if (w > 45000) KNet.stop('The other player stopped responding, so co-op was stopped.');
    } else if (mode === 'play' && KNet.state !== 'sync') {
      if (game.hitStop > 0) { game.hitStop -= dt; acc = 0; }   // a brief freeze on heavy blows
      else acc += dt;
      let n = 0;
      // at most two steps a frame (v0.77): full speed at 30 frames a second (an iPhone in Low Power Mode); a device slower
      // than that runs the game a little slower instead of piling up steps and stuttering
      while (acc >= STEP && n < 2) { game.step([KInput.sample(origin)]); acc -= STEP; n++; }
      if (n === 2) acc = 0;
      saveTimer += dt;
      if (saveTimer > 20) save();
    }
    handleEvents(mode === 'play' || KNet.on ? dt : 0);
    // sounds, heard from the golem
    const me = game.players[ME];
    for (const [name, x, y, v] of game.sounds) KAudio.play(name, x, y, me.x, me.y - 8, v);
    game.sounds.length = 0;
    const held = new Set();
    if (mode === 'play' && !me.dead) for (const md of KData.modes) { const k = me.channels[md]; if (k) { const sp = game.spec(me, md); if (sp) held.add(sp.kind); } }
    KAudio.hold(held);
    const AM = R.amounts || {};
    KAudio.ambience(mode === 'play' && !me.dead ? { fire: Math.min(1, (AM.fire || 0) / 120), magma: Math.min(1, (AM.magma || 0) / 1500), acid: Math.min(1, (AM.acid || 0) / 300) } : {});
    // music: calm in the cave, ominous while a boss or champion is fighting you
    const foe = game.boss && !game.boss.dead && game.boss.engaged ? game.boss : game.championNear(me);
    KAudio.setMood(mode === 'start' ? 'title' : foe && !me.dead ? 'boss' : 'cave');
    const p = game.players[ME];
    let reticle = null;
    if (mode === 'play') {
      // v0.91: on touch the aim marker shows only while a thumb drags the Shot button to aim by hand; a plain press aims itself
      if (KInput.device === 'touch' && KInput.touch.aim == null) reticle = null;
      else if (KInput.device !== 'kbm') { const c = game.chest(p); reticle = { x: c.x + Math.cos(p.aim) * 26, y: c.y + Math.sin(p.aim) * 26 }; }
      else if (KInput.mouse.moved) reticle = R.clientToWorld(KInput.mouse.x, KInput.mouse.y);
    }
    // an aimed special spell shows where it will land
    let mark = null;
    if (mode === 'play' && !p.dead && p.recipe) { const sp = game.spec(p, 'shot'); if (sp && sp.special && p.mana >= sp.cost) mark = game.specialTarget(p, sp.id); }
    const onTitle = mode === 'start' && !titleSub, wideTitle = onTitle && innerWidth > innerHeight && innerWidth > 640;
    // v1.00: playing alone with a menu open, the scene cannot change: draw it once and leave it (as MORPHOS), so nothing
    // under the menu's blur repaints every frame
    const still = !KNet.on && mode !== 'play' && !onTitle;
    if (!(still && frozenDrawn)) R.draw(game, { reticle, mark, reduced: reduced.matches, dt: mode === 'play' || onTitle ? dt : 0, lookX: wideTitle ? 0.68 : 0.5, lookY: onTitle && !wideTitle ? 0.82 : 0.5 });   // the title screen's cave keeps its dust and embers moving
    frozenDrawn = still;
    fade();
    objective(dt);
    friendMark();
    updateHud();
    updateLook();
    updateMap();
  }
  // v1.02: an error in one frame never stops the game for good (the next frame was only asked for at the end of this one)
  let frameErrors = 0, frameErrorAt = -1e9;
  function frame(now) {
    try { frameBody(now); }
    catch (e) {
      console.error(e);
      if (now - frameErrorAt > 5000) { frameErrorAt = now; frameErrors++; try { if (KNet.busy) KNet.stop('Something went wrong in the game, so co-op was stopped. Your progress is saved.'); else toast('Something went wrong for a moment. If it keeps happening, reload the page.', 'big'); } catch (x) {} }
    }
    requestAnimationFrame(frame);
  }
  setMode('start');
  requestAnimationFrame(frame);

  // for testing from the console
  // ---------- co-op (net.js) ----------
  const coopSay = (text, kind) => {
    const el = $('coopStatus'); el.textContent = text; el.dataset.kind = kind || ''; el.hidden = !text;
    $('btnHost').disabled = $('btnJoin').disabled = $('coopCode').disabled = KNet.busy;
    showOpts();
    $('btnLeaveCoop').hidden = !KNet.busy; $('btnLeaveCoop').textContent = KNet.on ? 'Leave co-op' : 'Cancel';
  };
  KNet.init({
    version: VERSION,
    game: () => game,
    myPlayer: () => KSave.packPlayer(game.players[ME]),
    status: coopSay,
    note: text => toast(text, 'big'),
    pause: () => { KInput.clearHeld(); },
    saveNow: () => save(),
    setGame: (g, me) => { game = g; ME = me; g.me = me; guestGame = me === 1; acc = 0; mapTick = 0; },
    started: role => {
      toasts.length = 0; renderToasts();
      toast(role === 'host' ? 'A friend has joined your cave' : 'You have joined your friend\'s cave', 'big');
      coopSay(role === 'host' ? 'Playing co-op: a friend is in your cave.' : 'Playing co-op in your friend\'s cave. Your golem\'s progress is saved to this device.', 'ok');
      KAudio.start(); setMode('play');
    },
    ended: (why, wasPlaying, role) => {
      $('netWait').hidden = true;
      if (guestGame) {
        // back to this device's own cave, with whatever the golem gained
        if (game.players[ME]) KSave.storeGuest(game.players[ME]);
        guestGame = false; ME = 0;
        game = KSave.load() || new KGame.Game(randomSeed()); game.me = 0;
      } else if (game.players.length > 1) {
        // the host carries on alone in the same cave
        const data = JSON.parse(JSON.stringify(KSave.serialize(game)));
        const g = KSave.restore(data, game.world);
        if (g) { game = g; game.me = 0; }
        ME = 0; save();
      }
      acc = 0; mapTick = 0;
      coopSay(why, 'bad');
      if (wasPlaying) { toast(why, 'big'); setMode('pause'); showPanelTab('coop'); }
    },
  });
  $('btnHost').addEventListener('click', () => { save(); KNet.host(); });
  $('btnJoin').addEventListener('click', () => { save(); KNet.join($('coopCode').value); });
  $('coopCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
  $('btnLeaveCoop').addEventListener('click', () => KNet.leave());
  addEventListener('pagehide', () => { if (KNet.busy) KNet.leave(); });

  // ---------- the goal: what to do next, the ending, and going deeper ----------
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const dirTo = (p, x, y) => DIRS[((Math.round(Math.atan2(y - p.y, x - p.x) / (Math.PI / 4)) % 8) + 8) % 8];
  const regionOf = (x, y) => game.world.biomes[game.world.biomeAt(x, y)].name;
  let objText = '', objTick = 0;
  function objective(dt) {
    if ((objTick -= dt) > 0) return;
    objTick = 0.5;
    const p = game.players[ME], left = game.sealsLeft(), L = game.world.lair, bossName = L ? KData.bosses[L.boss].name : 'the last of them';
    let title, hint;
    // the first minutes of a first golem: how to cast, in the same place the goal will be
    if (p.level === 1 && !game.depth && game.kills === 0 && game.played < 180 && !p.used && !p.lastSpell) {
      title = 'Shape a spell';
      hint = KInput.device === 'touch' ? 'Tap two element buttons, then hold the gold button to cast' : KInput.device === 'pad' ? `Press two of ${KData.elementOrder.map(e => KInput.label('pad', e)).join(' ')}, then hold ${KInput.label('pad', 'shot')} to cast` : `Press two of ${KData.elementOrder.map(e => KInput.label('kbm', e)).join(' ')}, then hold ${KInput.label('kbm', 'shot')} to cast`;
    } else
    if (game.won) { title = `${bossName} has fallen`; hint = KNet.busy ? 'The cave is yours' : 'A deeper cave waits: open the menu to descend'; }
    else if (left > 0) {
      let c = null, bd = 1e9;
      for (const e of game.enemies) if (e.champion && !game.defeated.has('champ:' + e.kind)) { const d = Math.hypot(e.home.x - p.x, e.home.y - p.y); if (d < bd) { bd = d; c = e; } }
      title = `Break the seals · ${3 - left} of 3`;
      hint = c ? (bd < 260 ? `${c.champion} is close` : `${c.champion} waits to the ${dirTo(p, c.home.x, c.home.y)}, in the ${regionOf(c.home.x, c.home.y)}`) : '';
    } else { title = `Wake ${bossName}`; hint = L ? (Math.hypot(L.x - p.x, L.y - p.y) < 300 ? 'Its lair is close' : `Its lair lies to the ${dirTo(p, L.x, L.y)}, in the ${regionOf(L.x, L.y)}`) : ''; }
    if (title + hint !== objText) { objText = title + hint; $('objTitle').textContent = title; $('objHint').textContent = hint; }
  }
  // co-op: an arrow at the edge of the screen towards a friend who is out of sight, with how far
  function friendMark() {
    const el = $('friend'), q = game.players.length > 1 ? game.players[1 - ME] : null;
    if (!q || mode !== 'play') { if (!el.hidden) el.hidden = true; return; }
    const sx = q.x - R.cam.x, sy = q.y - 8 - R.cam.y;
    if (sx > 4 && sy > 4 && sx < V.w - 4 && sy < V.h - 4) { if (!el.hidden) el.hidden = true; return; }
    const p = game.players[ME], s = stage.clientWidth / V.w, hud = el.parentElement, W = hud.clientWidth, H = hud.clientHeight;
    const cx = (p.x - R.cam.x) * s - hud.offsetLeft, cy = (p.y - 8 - R.cam.y) * s, an = Math.atan2(q.y - p.y, q.x - p.x), m = 46, c = Math.cos(an), v = Math.sin(an);
    // out from the golem along that direction until the edge of the HUD's frame
    const kx = c > 0 ? (W - m - cx) / c : c < 0 ? (m - cx) / c : 1e9, ky = v > 0 ? (H - m - cy) / v : v < 0 ? (m - cy) / v : 1e9, k = Math.max(0, Math.min(kx, ky));
    el.hidden = false; el.style.left = Math.round(cx + c * k) + 'px'; el.style.top = Math.round(cy + v * k) + 'px';
    el.firstElementChild.style.transform = `rotate(${an}rad)`;
    const d = String(Math.round(Math.hypot(q.x - p.x, q.y - p.y) / 10) * 10); if ($('friendDist').textContent !== d) $('friendDist').textContent = d;
  }
  const clock = s => { const h = Math.floor(s / 3600), mn = Math.floor(s % 3600 / 60); return h ? `${h} h ${mn} min` : `${mn} min`; };
  function buildEnd() {
    const p = game.players[ME], tile = (icon, big, name) => `<div class="jt done">${KIcon(icon)}<b>${big}</b><span>${name}</span></div>`;
    const A = KData.acts, B = KData.bosses[game.world.lair.boss], next = A[(game.depth + 1) % A.length], nb = KData.bosses[next.boss];
    $('endEyebrow').textContent = `${A[game.act].name} is won` + (game.depth >= A.length ? ` · depth ${game.depth + 1}` : '');
    $('endTitle').textContent = `${B.name} has fallen`;
    $('endLine').textContent = A[game.act].ending || '';
    $('endText').textContent = `The three seals are broken and the ${B.core} is yours. ` + (game.depth + 1 < A.length ? `Below lies ${next.name}: the ${next.biomes.map(b => b.name).join(', the ')}, creatures you have not met, three new champions and ${nb.name.replace(/^The /, 'the ')}.` : `The way down goes on. ${next.name} waits again, eight levels harder.`);
    $('endNote').textContent = 'Everything below is eight levels stronger and the treasure is better. Your golem keeps its level, runestones, spells and shards. This cave is left behind for good.';
    $('endStats').innerHTML = tile('star', p.level, 'Level') + tile('stats', clock(game.played), 'Time in the cave') + tile('skull', game.kills, 'Creatures felled') + tile('heart', game.deaths, 'Times crumbled') + tile('book', `${p.known.length}<small> of ${Object.keys(KData.specials).length}</small>`, 'Special spells') + tile('stone', `${game.found.size}<small> of ${game.world.lodestones.length}</small>`, 'Lodestones');
    $('btnDescend').hidden = $('endNote').hidden = KNet.busy;
  }
  // a new, deeper cave: the golem and its progress go with it, the old cave is left behind
  function descend() {
    if (KNet.busy || !game.won) return;
    const old = game, mine = KSave.packPlayer(old.players[ME]); delete mine.x; delete mine.y;
    game = new KGame.Game(randomSeed(), undefined, old.depth + 1); game.me = 0;
    KSave.applyPlayer(game, game.players[0], mine);
    game.played = old.played; game.deaths = old.deaths; game.kills = old.kills; game.regen = old.regen;
    acc = 0; mapTick = 0; toasts.length = 0; objTick = 0; save(); resume();
    toast(`${KData.acts[game.act].name} · from level ${1 + game.depth * KData.cave.depthLevels}`, 'big');
  }
  $('btnDescend').addEventListener('click', descend);
  $('btnDeeper').addEventListener('click', descend);
  $('btnRegen').addEventListener('click', () => { act('setRegen', game.regen ? 0 : 1);   // a number: co-op passes on only numbers and short words
    regenLabel(); save(); });
  $('btnStay').addEventListener('click', resume);

  buildControls();

  window.cis = { get game() { return game; }, set game(g) { game = g; }, R, save, setMode, toast, rest: buildRest, act, get me() { return ME; } };
})();
