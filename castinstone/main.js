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
  const VERSION = 'v0.44';

  const $ = id => document.getElementById(id);
  const stage = $('stage'), view = $('view'), glow = $('glow');
  let game = KSave.load() || new KGame.Game(randomSeed());
  const hadSave = KSave.exists();
  let ME = 0;            // which golem is this device's: 0, or 1 as the guest in co-op
  let guestGame = false; // true while `game` is a friend's cave (never stored as this device's save)
  const R = new KRender.Renderer(view, glow);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function randomSeed() { return (Math.random() * 1e9) | 0; }
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  for (const n of document.querySelectorAll('[data-icon]')) n.insertAdjacentHTML('afterbegin', KIcon(n.dataset.icon));

  // ---------- layout: the HUD scales with the stage (--u = stage width / 1280) ----------
  function fit() {
    // The view takes the screen's shape. A 16:9 screen shows 320 x 180 cells; a wider one keeps the
    // 180 and shows more to the sides, a taller one keeps the 320 and shows more above and below.
    // Nobody sees further for it: past SIGHT cells from the golem the picture fades to black (fade()).
    const W = innerWidth, H = innerHeight, wide = W / H >= 16 / 9;
    R.setView(wide ? Math.min(640, Math.round(180 * W / H)) : 320, wide ? 180 : Math.min(720, Math.round(320 * H / W)));
    const s = Math.min(W / V.w, H / V.h), w = Math.floor(V.w * s), h = Math.floor(V.h * s);
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    // The HUD keeps to a 16:9 frame in the middle (--hx is the margin each side), so on a very wide
    // monitor it is not out in the corners. A phone is too short to give any width away.
    stage.style.setProperty('--u', Math.max(0.55, Math.min(1.5, Math.min(w / 1280, h / 720))).toFixed(3));
    // menus are laid out for 1280 x 720 or smaller and enlarged as one piece on anything bigger
    document.documentElement.style.setProperty('--m', Math.max(1, Math.min(W / 1280, H / 720)).toFixed(3));
    stage.style.setProperty('--hx', (h <= 600 ? 0 : Math.max(0, Math.round((w - h * 16 / 9) / 2))) + 'px');
    R.resize(w, h);
  }
  addEventListener('resize', fit);
  // how far the golem sees: clear to SIGHT cells (the corner of a 16:9 screen), black by SIGHT_END
  const SIGHT = 186, SIGHT_END = 250;
  let fadeWas = '';
  function fade() {
    const p = game.players[ME], s = stage.clientWidth / V.w;
    const css = `radial-gradient(circle at ${Math.round((p.x - R.cam.x + 0.5) * s)}px ${Math.round((p.y - 8 - R.cam.y) * s)}px, #0000 ${Math.round(SIGHT * s)}px, #000 ${Math.round(SIGHT_END * s)}px)`;
    if (css !== fadeWas) { fadeWas = css; $('fade').style.background = css; }
  }
  // F: full screen (where the browser allows it; an iPhone does not)
  addEventListener('keydown', e => {
    if (e.code !== 'KeyF' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || (e.target && e.target.tagName === 'INPUT')) return;
    const d = document;
    try { if (d.fullscreenElement) d.exitFullscreen(); else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {}); } catch (x) {}
  });
  fit();

  // ---------- the four element keys ----------
  const els = $('els');
  for (const el of elementOrder) {
    const e = elements[el], b = document.createElement('button');
    b.type = 'button'; b.className = 'el'; b.style.setProperty('--c', e.css);
    b.innerHTML = `${KIcon(el)}<kbd>${e.label}</kbd>`;
    b.title = `${e.name} (${e.label})`;
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
    return `<div class="form" style="--c:${elements[el].css}"><h3>${KIcon(el)}${elements[el].name}<kbd>${elements[el].label}</kbd></h3><dl>` +
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
  // special spells: the ones you know show their sequence; the rest stay hidden
  function renderSpecials() {
    const known = game.players[ME].known, S = KData.specials, ids = Object.keys(S);
    $('specialsTitle').textContent = `Special spells · ${known.length} of ${ids.length}`;
    // by tier: the number of elements tells you how long an unknown one is
    const TIER = ['', 'First circle · three elements', 'Second circle · four elements', 'Third circle · five elements', 'Fourth circle · six elements', 'Fifth circle · seven elements'];
    let html = '<p class="note" style="margin:0 0 4px">Type one in its exact order, then left click. Tomes in relic caches, rune tablets, champions and the Emberwyrm teach them; the deeper the cave, the higher the circle.</p>';
    for (let t = 1; t <= 5; t++) {
      const list = ids.filter(id => S[id].tier === t), have = list.filter(id => known.includes(id)).length;
      html += `<h3 class="circle">${TIER[t]}<small>${have} of ${list.length}</small></h3><div class="specials">` + list.map(id => known.includes(id)
        ? `<div class="special"><b>${S[id].name}<small>${S[id].cost} mana</small></b><span class="pairc">${dots(S[id].seq)}</span><span>${S[id].desc}</span></div>`
        : `<div class="special unknown"><b>Unknown</b><span class="pairc">${S[id].seq.map(() => '<i></i>').join('')}</span><span>Not yet learned.</span></div>`).join('') + '</div>';
    }
    $('specials').innerHTML = html;
  }

  // ---------- controls, as key caps ----------
  const K = (t, cls = '') => `<kbd class="${cls}">${t}</kbd>`, EK = el => `<kbd style="--c:${elements[el].css}">${elements[el].label}</kbd>`;
  const KEYCARDS = [
    ['golem', 'Move', [[K('A') + K('D'), 'Run. Walk into dirt to dig (hold Space too, to dig upwards)'], [K('Space', 'w'), 'Jump. Keep holding in the air to Lift'], [K('Shift', 'w'), 'Move: a dash, a blink, a climb'], [K('R'), 'Rest at a Lodestone']]],
    ['shot', 'Cast', [[KIcon('mouse'), 'Aim with the mouse'], [K('Left', 'w'), 'Shot, aimed where you point'], [K('Right', 'w'), 'Burst, around you'], ['', 'Hold any of them to keep casting']]],
    ['rune', 'Recipe', [[elementOrder.map(EK).join(''), 'Add Fire, Water, Earth or Lightning'], [K('C'), 'Take off the last element'], [K('X'), 'Clear the recipe'], ['', 'After a cast, the next element starts a new recipe']]],
    ['keys', 'Menus', [[K('Tab', 'w'), 'Map'], [K('H'), 'Spell book'], [K('M') + K('N'), 'All sound · music, on or off'], [K('F'), 'Full screen'], [K('Esc', 'w'), 'Pause']]],
    ['golem', 'Touch', [['Left thumb', 'A stick appears where you touch: run, and push into dirt to dig'], ['Shot', 'Hold to cast. The golem aims at the nearest creature; drag from the button to aim yourself'], ['Jump · Move · Burst', 'The three buttons round Shot. Hold Jump in the air to Lift'],
      ['Elements', 'The four buttons above; the arrow takes off the last one'], ['', 'Tap the Lodestone notice to rest; the map and the round buttons at the top open the menus']]],
    ['move', 'Controller: play', [[K('L stick', 'w') + K('R stick', 'w'), 'Run (push into dirt to dig) · aim'], [K('LT') + K('RT'), 'Jump and Lift · Shot'], [K('LB') + K('RB'), 'Move (dash) · Burst'],
      [`<kbd style="--c:${elements.fire.css}">B</kbd><kbd style="--c:${elements.water.css}">X</kbd><kbd style="--c:${elements.earth.css}">A</kbd><kbd style="--c:${elements.lightning.css}">Y</kbd>`, 'Fire, Water, Earth, Lightning']]],
    ['keys', 'Controller: the rest', [[K('D-pad', 'w'), 'Up rest · down take off the last element · left map · right spell book'], [K('View', 'w') + K('Menu', 'w'), 'Clear the recipe · pause'],
      [K('D-pad', 'w') + K('A') + K('B'), 'In a menu: move, press, go back'], [K('LB') + K('RB'), 'In a menu: change tab']]],
  ];
  const keycards = list => list.map(([ic, title, rows]) => `<div class="keycard"><h3>${KIcon(ic)}${title}</h3>` + rows.map(([k, t]) => `<div class="keyrow"><span class="k">${k}</span><span>${t}</span></div>`).join('') + '</div>').join('');
  $('keysKbm').innerHTML = keycards(KEYCARDS.slice(0, 4)); $('keysTouch').innerHTML = keycards(KEYCARDS.slice(4, 5)); $('keysPad').innerHTML = keycards(KEYCARDS.slice(5));
  // pages inside a tab: a row of buttons (.seg), each showing one .segview
  const showSeg = (view, name) => {
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
    skin = i; game.players[ME].skin = i;
    golemBtns.forEach((b, k) => b.setAttribute('aria-checked', k === i ? 'true' : 'false'));
    try { localStorage.setItem('castinstone.golem', String(i)); } catch {}
  }
  pickGolem(skin);

  // ---------- saving ----------
  let saveTimer = 0;
  function save() {
    // as a guest in co-op only the golem's progress goes home; the cave is the host's
    if (guestGame) { if (game.players[ME]) KSave.storeGuest(game.players[ME]); saveTimer = 0; return; }
    if (KNet.state === 'sync' && KNet.role === 'guest') return;
    if (KSave.store(game)) saveTimer = 0;
  }
  // A menu choice that changes the golem. Alone it happens at once; in co-op it travels with the
  // button presses, so both devices make it on the same step (the panel is rebuilt when it lands).
  const act = (name, ...args) => {
    if (KNet.on) { KInput.queue({ type: 'ui', name, args }); return true; }
    const r = game[name](game.players[ME], ...args);
    return r === undefined ? true : r;
  };
  addEventListener('pagehide', save);

  // ---------- modes: start, help (spell book), pause, map, rest, play ----------
  let mode = 'start', confirmNew = false, panelTab = 'game';
  const chip = (icon, text, cls = '') => `<span class="chip ${cls}">${KIcon(icon)}${text}</span>`;
  function showPanelTab(t) {
    panelTab = t;
    for (const b of document.querySelectorAll('#panelTabs .tab')) b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false');
    for (const v of document.querySelectorAll('#panel .view')) v.hidden = v.dataset.view !== t;
    if (t === 'book') renderSpecials();
    if (t === 'controls') showSeg($('viewControls'), KInput.device);   // the controls for what is in your hands
  }
  for (const b of document.querySelectorAll('#panelTabs .tab')) b.addEventListener('click', () => showPanelTab(b.dataset.tab));
  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    KInput.clearHeld();
    $('restWrap').hidden = m !== 'rest';
    $('mapWrap').hidden = m !== 'map';
    $('panelWrap').hidden = m === 'play' || m === 'rest' || m === 'map';
    confirmNew = false; $('btnNewCave').textContent = 'New game';
    if (m === 'play') { view.focus({ preventScroll: true }); return; }
    if (m === 'rest') { buildRest(); $('btnLeave').focus({ preventScroll: true }); return; }
    if (m === 'map') { drawBigMap(); $('btnMapClose').focus({ preventScroll: true }); return; }
    const p = game.players[ME], started = m !== 'start' || hadSave;
    $('panelEyebrow').textContent = KNet.on ? 'Co-op · the game goes on while this is open' : m === 'start' ? `Beta · ${VERSION}` : 'Paused';
    $('btnNewCave').hidden = KNet.busy; if (KNet.busy) $('btnPanelReset').hidden = true;
    $('btnGo').textContent = m === 'start' ? (hadSave ? 'Continue' : 'Start') : 'Resume';
    $('btnPanelReset').hidden = m === 'start' || KNet.busy;
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
      tile('fire', B.cores, w.lair ? 1 : 0, 'The Emberwyrm', B.cores ? 'Ember core: +40 mana' : 'Guards the Ember core') +
      tile('star', p.known.length, Object.keys(KData.specials).length, 'Special spells', 'Five circles');
    showPanelTab(m === 'help' ? 'book' : 'game');
    $('btnGo').focus({ preventScroll: true });
  }
  view.tabIndex = -1;
  const resume = () => setMode('play');
  // Reset the cave: rebuild it from its seed, keeping the golem's progress.
  const resetMap = () => { game.reset(true); game.players[ME].skin = skin; acc = 0; mapTick = 0; save(); };
  $('btnGo').addEventListener('click', () => { KAudio.start(); resume(); });
  addEventListener('pointerdown', () => KAudio.start(), { once: true });
  addEventListener('keydown', () => KAudio.start(), { once: true });
  const muteBtn = $('btnMute');
  const showMute = () => { muteBtn.setAttribute('aria-pressed', KAudio.muted ? 'true' : 'false'); muteBtn.innerHTML = KIcon(KAudio.muted ? 'mute' : 'sound'); muteBtn.title = KAudio.muted ? 'Sound is off (M)' : 'Sound is on (M)'; };
  muteBtn.addEventListener('click', () => { KAudio.start(); KAudio.setMuted(!KAudio.muted); showMute(); view.focus(); });
  addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') return; if (e.code === 'KeyM' && !e.repeat && !e.metaKey && !e.ctrlKey) { KAudio.start(); KAudio.setMuted(!KAudio.muted); showMute(); } });
  showMute();
  const musicBtn = $('btnMusic');
  const showMusic = () => { musicBtn.setAttribute('aria-pressed', KAudio.music ? 'false' : 'true'); musicBtn.innerHTML = KIcon(KAudio.music ? 'music' : 'nomusic'); musicBtn.title = KAudio.music ? 'Music is on (N)' : 'Music is off (N)'; };
  const toggleMusic = () => { KAudio.start(); KAudio.setMusic(!KAudio.music); showMusic(); };
  musicBtn.addEventListener('click', () => { toggleMusic(); view.focus(); });
  addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') return; if (e.code === 'KeyN' && !e.repeat && !e.metaKey && !e.ctrlKey) toggleMusic(); });
  showMusic();
  $('btnPanelReset').addEventListener('click', () => { resetMap(); resume(); });
  $('btnNewCave').addEventListener('click', () => {
    // a second press confirms: this replaces the saved world and the golem's progress
    if (!confirmNew) { confirmNew = true; $('btnNewCave').textContent = 'Press again to start over'; return; }
    game = new KGame.Game(randomSeed()); game.players[ME].skin = skin; window.cis.game = game;
    KSave.clear(); save(); acc = 0; mapTick = 0; toasts.length = 0; resume();
  });
  $('btnPause').addEventListener('click', () => setMode('pause'));
  $('btnSpells').addEventListener('click', () => setMode('help'));
  $('btnMap').addEventListener('click', () => setMode('map'));
  $('btnLeave').addEventListener('click', resume);
  for (const b of document.querySelectorAll('.hud button')) b.addEventListener('pointerdown', e => e.stopPropagation());

  KInput.attach(view, {
    blocked: () => mode !== 'play',
    onClose: () => { if (mode !== 'start') resume(); },
    onPause: () => setMode(mode === 'play' ? 'pause' : 'play'),
    onHelp: () => setMode(mode === 'help' ? 'play' : 'help'),
    onMap: () => { if (mode === 'play') setMode('map'); else if (mode === 'map') setMode('play'); },
    onReset: () => {},
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (mode === 'play') setMode('pause'); } });
  // ---------- a controller in the menus ----------
  // The d-pad or left stick moves to the nearest button in that direction, A
  // presses it, B or Menu goes back to the game, LB and RB change tab.
  const openWrap = () => mode === 'rest' ? $('restWrap') : mode === 'map' ? $('mapWrap') : $('panelWrap');
  const shown = e => !e.disabled && e.offsetParent !== null;
  function padMenu(a) {
    if (mode === 'play') return;
    const wrap = openWrap();
    if (a.pause || a.back) { if (mode !== 'start') resume(); return; }
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
    // the runestone ring has its own order (KRest.padMove): rows as drawn, not nearest-by-distance
    if (cur.closest('.ring') && window.KRest.padMove) {
      const to = window.KRest.padMove(cur, a.dx, a.dy);
      const go = to === 'up' ? wrap.querySelector('.tab[aria-selected="true"]') : to === 'down' ? $('btnLeave') : to;
      if (go) { go.focus({ preventScroll: true }); go.scrollIntoView({ block: 'nearest' }); }
      return;
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
      b.addEventListener('click', () => { if (act('spendPoint', s.id)) { buildRest(); save(); const nb = grid.querySelectorAll('.plus')[P.stats.indexOf(s)]; if (nb && !nb.disabled) nb.focus(); } });
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
      const isHere = here && here.id === l.id, biome = KData.biomes.find(x => x.name === l.region);
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

  // ---------- notices (top centre): experience, levels, finds ----------
  const toasts = [];
  const TOAST_ICON = { xp: 'star', shard: 'shard', loot: 'rune', stone: 'stone', big: 'crown', died: 'skull' };
  function toast(text, kind = '') { toasts.push({ text, kind, t: 0 }); if (toasts.length > 4) toasts.shift(); renderToasts(); }
  function renderToasts() {
    $('toasts').innerHTML = toasts.map(t => `<div class="toast ${t.kind}">${KIcon(TOAST_ICON[t.kind] || 'info')}<span>${t.text}</span></div>`).join('');
  }
  let xpPending = 0, xpTimer = 0, shardPending = 0, shardTimer = 0;
  function handleEvents(dt) {
    for (const e of game.events) {
      if (e.p !== undefined && e.p !== ME) continue;   // the other golem's news
      if (e.type === 'ui') { if (mode === 'rest') buildRest(); continue; }
      if (e.type === 'xp') { xpPending += e.amount; xpTimer = 0.6; }
      else if (e.type === 'shard') { shardPending++; shardTimer = 0.7; }
      else if (e.type === 'level') {
        // point the way to the nearest Lodestone you have found, where points are spent
        const p = game.players[ME];
        let best = null, bd = 1e9;
        for (const id of game.found) { const l = game.world.lodestones[id]; if (!l) continue; const d = Math.hypot(l.x - p.x, l.y - p.y); if (d < bd) { bd = d; best = l; } }
        const where = !best ? '' : bd < 40 ? ' · press F at the Lodestone here' : ` · nearest Lodestone ${Math.round(bd)} ${Math.abs(best.x - p.x) > Math.abs(best.y - p.y) ? (best.x < p.x ? 'west' : 'east') : (best.y < p.y ? 'up' : 'down')}`;
        toast(`Level ${e.level} · ${e.points} stat point${e.points === 1 ? '' : 's'} to spend at a Lodestone${where}`, 'big');
      }
      else if (e.type === 'found') toast(`Lodestone found · ${e.stone.hub ? 'the hub' : e.stone.region}`, 'stone');
      else if (e.type === 'rest') { save(); if (mode === 'play') setMode('rest'); }
      else if (e.type === 'save') save();
      else if (e.type === 'died') toast('Your golem crumbled. It rises again at the last Lodestone.', 'died');
      else if (e.type === 'toast') toast(e.text, e.kind || '');
      else if (e.type === 'learn') { const S = KData.specials[e.id]; toast(`${e.how === 'tome' ? 'A tome' : 'Discovered'}: ${S.name} · ${S.seq.map(x => elements[x].label).join(' ')} · ${S.cost} mana`, 'big'); }
    }
    game.events.length = 0;
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
      hud.q = qsig;
      let h = '';
      for (let i = 0; i < KData.recipe.max; i++) { const e = p.queue[i]; h += `<span class="sock${i === 0 ? ' form' : ''}${e ? ' on' : ''}"${e ? ` style="--c:${elements[e].css}"` : ''}>${e ? KIcon(e) : ''}</span>`; }
      const qn = $('queue'); qn.innerHTML = h; qn.classList.toggle('used', !!p.used);
    }
    if (p.slotFlash > 0.3 && hud.flash <= 0.3) { const s = $('queue'); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
    hud.flash = p.slotFlash;
    // what each way of casting gives, and what it costs
    const pad = KInput.device === 'pad', tch = KInput.device === 'touch';
    const RC = KRecipe.resolve(p.queue);
    p.recipe = RC;
    const specs = KData.modes.map(md => RC ? game.spec(p, md) : null);
    const name = p.queue.join('+') + specs.map((sp, i) => !sp ? '-' : (sp.special ? 'S' : '') + (p.mana >= (sp.drain ? sp.min : sp.cost) ? 1 : 0) + (p.channels[KData.modes[i]] ? 'L' : '')).join('') + (pad ? '#pad' : '');
    if (name !== hud.name) {
      hud.name = name;
      const keysFor = pad ? { shot: 'RT', burst: 'RB', lift: 'LT', move: 'LB' } : { shot: 'LMB', burst: 'RMB', lift: 'Spc', move: 'Shft' };
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
    if ((near ? (pad ? 2 : tch ? 3 : 1) : 0) !== hud.near) { hud.near = near ? (pad ? 2 : tch ? 3 : 1) : 0; $('restPrompt').hidden = !near; $('restPrompt').innerHTML = tch ? `${KIcon('stone')}Tap to rest at the Lodestone` : pad ? `${KIcon('stone')}D-pad up · Rest at the Lodestone` : '<kbd>R</kbd>Rest at the Lodestone'; }
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
      return [game.found.has(l.id) ? 'Lodestone' : 'Lodestone (not yet found)', 'Touch it to make it your checkpoint and repair. Stand by it and press F to rest: spend points, change runestones, travel.'];
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
      const m = w.get(wx, wy), B = KData.biomes[w.biomeAt(wx, wy)].strata[0];
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
    $('mapInfo').innerHTML = chip('map', `${KData.biomes[w.biomeAt(p.x, p.y - 8)].name} · Level ${w.levelAt(p.x, p.y)}`) + chip('stone', `${found} of ${all} Lodestones`) + chip('crown', `${champs.length - left} of ${champs.length} champions beaten`);
  }
  $('mapBox').addEventListener('click', () => { if (mode === 'play') setMode('map'); });
  $('btnMapClose').addEventListener('click', () => setMode('play'));
  function updateMap() {
    if (mapTick++ % 12) return;
    const w = game.world, p = game.players[ME], S = 6;
    const x0 = Math.max(0, Math.min(w.w - mm.width * S, p.x - mm.width * S / 2)), y0 = Math.max(0, Math.min(w.h - mm.height * S, p.y - mm.height * S / 2));
    paintMap(mbuf, mm.width, mm.height, x0, y0, S);
    mctx.putImageData(mimg, 0, 0);
    const t = `${KData.biomes[w.biomeAt(p.x, p.y - 8)].name}|Level ${w.levelAt(p.x, p.y)}`;
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
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
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
      while (acc >= STEP && n < 4) { game.step([KInput.sample(origin)]); acc -= STEP; n++; }
      if (n === 4) acc = 0;
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
    // music: calm in the cave, ominous while a boss or champion is fighting you
    const foe = game.boss && !game.boss.dead && game.boss.engaged ? game.boss : game.championNear(me);
    KAudio.setMood(foe && !me.dead ? 'boss' : 'cave');
    const p = game.players[ME];
    let reticle = null;
    if (mode === 'play') {
      if (KInput.device !== 'kbm') { const c = game.chest(p); reticle = { x: c.x + Math.cos(p.aim) * 26, y: c.y + Math.sin(p.aim) * 26 }; }
      else if (KInput.mouse.moved) reticle = R.clientToWorld(KInput.mouse.x, KInput.mouse.y);
    }
    // an aimed special spell shows where it will land
    let mark = null;
    if (mode === 'play' && !p.dead && p.recipe) { const sp = game.spec(p, 'shot'); if (sp && sp.special && p.mana >= sp.cost) mark = game.specialTarget(p, sp.id); }
    R.draw(game, { reticle, mark, reduced: reduced.matches, dt: mode === 'play' ? dt : 0 });
    fade();
    updateHud();
    updateLook();
    updateMap();
    requestAnimationFrame(frame);
  }
  setMode('start');
  requestAnimationFrame(frame);

  // for testing from the console
  // ---------- co-op (net.js) ----------
  const coopSay = (text, kind) => {
    const el = $('coopStatus'); el.textContent = text; el.dataset.kind = kind || ''; el.hidden = !text;
    $('btnHost').disabled = $('btnJoin').disabled = $('coopCode').disabled = KNet.busy;
    $('btnNewCave').hidden = KNet.busy; if (KNet.busy) $('btnPanelReset').hidden = true; else $('btnPanelReset').hidden = mode === 'start';
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

  window.cis = { get game() { return game; }, set game(g) { game = g; }, R, save, setMode, toast, rest: buildRest, act, get me() { return ME; } };
})();
