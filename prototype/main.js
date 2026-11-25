'use strict';
/* Cast in Stone prototype — main.js
   Starts everything: loads the saved world (or starts a new one), fits the
   16:9 stage to the screen, runs the fixed-step loop (60 steps a second,
   independent of the screen's frame rate), passes each step's actions to the
   game, draws, and keeps the HUD, the panels (start, spell book, pause, rest
   at a Lodestone) and the notices up to date. Saves now and then. */

(() => {
  const { elements, elementOrder, spells, spellKey, view: V, step: STEP } = KData;
  const VERSION = 'v0.13';

  const $ = id => document.getElementById(id);
  const stage = $('stage'), view = $('view'), glow = $('glow');
  let game = KSave.load() || new KGame.Game(randomSeed());
  const hadSave = KSave.exists();
  const R = new KRender.Renderer(view, glow);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function randomSeed() { return (Math.random() * 1e9) | 0; }

  // ---------- layout ----------
  function fit() {
    const s = Math.min(innerWidth / V.w, innerHeight / V.h);
    const w = Math.floor(V.w * s), h = Math.floor(V.h * s);
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    stage.classList.toggle('compact', w < 760);
    R.resize(w, h);
  }
  addEventListener('resize', fit);
  fit();

  // ---------- element chips ----------
  const els = $('els');
  for (const el of elementOrder) {
    const e = elements[el], b = document.createElement('button');
    b.type = 'button'; b.className = 'el'; b.style.setProperty('--c', e.css);
    b.innerHTML = `<i></i><span>${e.name}</span><kbd>${e.label}</kbd>`;
    b.setAttribute('aria-label', `Load ${e.name}`);
    b.addEventListener('click', () => KInput.queue({ type: 'load', el }));
    els.appendChild(b);
  }

  // ---------- spell book: ten pairs x three ways to cast ----------
  const book = $('book');
  const MODE_LABEL = { shot: ['Shot', 'left click'], burst: ['Burst', 'right click'], move: ['Move', 'hold Space'] };
  book.insertAdjacentHTML('beforeend', '<span></span>' + KData.modes.map(md => `<span class="hd">${MODE_LABEL[md][0]}<small>${MODE_LABEL[md][1]}</small></span>`).join(''));
  const showSpell = (btn, key, md) => {
    const [a, b] = key.split('+'), sp = spells[key][md];
    book.querySelectorAll('button.on').forEach(x => x.classList.remove('on'));
    btn.classList.add('on');
    $('bookDetail').innerHTML = `<b>${sp.name} <small style="color:var(--dim);font-weight:500">· ${elements[a].name} + ${elements[b].name} · ${MODE_LABEL[md][0]} · ${sp.drain ? sp.drain + ' mana a second' : sp.cost + ' mana'}</small></b><span>${sp.desc}</span>`;
  };
  for (const key of Object.keys(spells)) {
    const [a, b] = key.split('+');
    book.insertAdjacentHTML('beforeend', `<span class="pairc" title="${elements[a].name} + ${elements[b].name}"><i style="--c:${elements[a].css}"></i><i style="--c:${elements[b].css}"></i></span>`);
    for (const md of KData.modes) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = spells[key][md].name;
      btn.addEventListener('mouseenter', () => showSpell(btn, key, md));
      btn.addEventListener('focus', () => showSpell(btn, key, md));
      btn.addEventListener('click', () => showSpell(btn, key, md));
      book.appendChild(btn);
    }
  }

  // ---------- golem picker (the look; also kept in the save) ----------
  let skin = game.players[0].skin || 0;
  if (!hadSave) try { const v = parseInt(localStorage.getItem('castinstone.golem'), 10); if (v >= 0 && v < KData.golems.length) skin = v; } catch {}
  const golemBtns = KData.golems.map((g, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'golem'; b.setAttribute('role', 'radio');
    const c = document.createElement('canvas');
    KRender.preview(c, i, ['fire', 'water']);
    c.style.width = (c.width * 3) + 'px'; c.style.height = (c.height * 3) + 'px';
    b.append(c, Object.assign(document.createElement('span'), { textContent: g.name }));
    b.title = g.desc;
    b.addEventListener('click', () => pickGolem(i));
    $('golems').appendChild(b);
    return b;
  });
  function pickGolem(i) {
    skin = i; game.players[0].skin = i;
    golemBtns.forEach((b, k) => b.setAttribute('aria-checked', k === i ? 'true' : 'false'));
    try { localStorage.setItem('castinstone.golem', String(i)); } catch {}
  }
  pickGolem(skin);

  // ---------- saving ----------
  let saveTimer = 0;
  function save() { if (KSave.store(game)) saveTimer = 0; }
  addEventListener('pagehide', save);

  // ---------- modes: start, help, pause, rest, play ----------
  let mode = 'start', confirmNew = false;
  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    KInput.clearHeld();
    $('restWrap').hidden = m !== 'rest';
    $('panelWrap').hidden = m === 'play' || m === 'rest';
    confirmNew = false; $('btnNewCave').textContent = 'New game';
    if (m === 'play') { view.focus({ preventScroll: true }); return; }
    if (m === 'rest') { buildRest(); $('btnLeave').focus({ preventScroll: true }); return; }
    $('panelEyebrow').textContent = m === 'pause' ? 'Paused' : m === 'help' ? 'Spell book' : `Prototype · one player · ${VERSION}`;
    $('btnGo').textContent = m === 'start' ? (hadSave ? 'Continue' : 'Start') : 'Resume';
    $('btnPanelReset').hidden = m === 'start';
    showBook(m === 'help');
    $('btnGo').focus({ preventScroll: true });
  }
  view.tabIndex = -1;
  function showBook(on) {
    $('viewBook').hidden = !on; $('viewMain').hidden = on;
    document.querySelector('.picker').hidden = on; $('panelLede').hidden = on;
    $('btnBook').textContent = on ? 'Controls' : 'Spell book';
  }
  $('btnBook').addEventListener('click', () => showBook($('viewBook').hidden));
  const resume = () => setMode('play');
  // Reset map: rebuild the cave from its seed, keeping the golem's progress.
  const resetMap = () => { game.reset(true); game.players[0].skin = skin; acc = 0; mapTick = 0; save(); };
  $('btnGo').addEventListener('click', resume);
  $('btnPanelReset').addEventListener('click', () => { resetMap(); resume(); });
  $('btnNewCave').addEventListener('click', () => {
    // a second press confirms: this replaces the saved world and the golem's progress
    if (!confirmNew) { confirmNew = true; $('btnNewCave').textContent = 'Press again to start over'; return; }
    game = new KGame.Game(randomSeed()); game.players[0].skin = skin; window.cis.game = game;
    KSave.clear(); save(); acc = 0; mapTick = 0; toasts.length = 0; resume();
  });
  $('btnPause').addEventListener('click', () => setMode('pause'));
  $('btnSpells').addEventListener('click', () => setMode('help'));
  $('btnReset').addEventListener('click', () => { resetMap(); view.focus(); });
  $('btnLeave').addEventListener('click', resume);
  for (const b of document.querySelectorAll('.hud button')) b.addEventListener('pointerdown', e => e.stopPropagation());

  KInput.attach(view, {
    blocked: () => mode !== 'play',
    onClose: () => { if (mode !== 'start') resume(); },
    onPause: () => setMode(mode === 'play' ? 'pause' : 'play'),
    onHelp: () => setMode(mode === 'help' ? 'play' : 'help'),
    onReset: resetMap,
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (mode === 'play') setMode('pause'); } });
  // a controller's Menu or A button resumes from a panel
  let padMenuPrev = false;
  function pollPadMenu() {
    if (mode === 'play') { padMenuPrev = false; return; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(x => x && x.connected);
    const down = !!(p && p.buttons[9] && p.buttons[9].pressed);
    if (down && !padMenuPrev) resume();
    padMenuPrev = down;
  }

  // ---------- rest at a Lodestone: spend stat points, travel ----------
  let restTab = 'stats';
  function buildRest() {
    const p = game.players[0], P = KData.progression, here = p.nearStone || game.world.lodestones[game.checkpoint];
    $('restWhere').textContent = here ? `${here.region} · Level ${here.level}` : '';
    $('restLevel').textContent = `Level ${p.level}`;
    $('restXp').textContent = `${Math.floor(p.xp)} of ${P.xpFor(p.level)} experience to level ${p.level + 1}`;
    $('restPoints').textContent = p.points ? `${p.points} stat point${p.points === 1 ? '' : 's'} to spend` : 'No stat points to spend';
    $('restPoints').classList.toggle('has', p.points > 0);
    for (const t of document.querySelectorAll('.rest-tab')) t.setAttribute('aria-selected', t.dataset.tab === restTab ? 'true' : 'false');
    for (const v of document.querySelectorAll('.rest-view')) v.hidden = v.dataset.view !== restTab;
    // stats
    const grid = $('statGrid');
    grid.innerHTML = '';
    for (const s of P.stats) {
      const n = p.alloc[s.id] || 0, row = document.createElement('div');
      row.className = 'stat';
      const dot = s.el ? `<i style="--c:${elements[s.el].css}"></i>` : '';
      row.innerHTML = `<span class="sn">${dot}${s.name}</span><span class="sv">${s.show(n)}</span><span class="sd">${s.desc}</span>`;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'plus'; b.textContent = '+'; b.disabled = p.points <= 0;
      b.setAttribute('aria-label', `Add a point to ${s.name}`);
      b.addEventListener('click', () => { if (game.spendPoint(p, s.id)) { buildRest(); save(); const nb = grid.querySelectorAll('.plus')[P.stats.indexOf(s)]; if (nb && !nb.disabled) nb.focus(); } });
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
      const isHere = here && here.id === l.id;
      b.innerHTML = `<b>${l.hub ? 'The hub' : l.region}</b><span>Level ${l.level}${isHere ? ' · you are here' : ''}</span>`;
      b.disabled = isHere;
      b.addEventListener('click', () => { game.travel(p, l.id); save(); resume(); });
      tl.appendChild(b);
    }
    const unfound = game.world.lodestones.length - game.found.size;
    $('travelNote').textContent = unfound ? `${unfound} more Lodestone${unfound === 1 ? '' : 's'} somewhere in the cave.` : 'You have found every Lodestone.';
    if (window.KRest) window.KRest.build(game, p, restTab);
  }
  for (const t of document.querySelectorAll('.rest-tab')) t.addEventListener('click', () => { restTab = t.dataset.tab; buildRest(); });

  // ---------- notices (top centre): experience, levels, finds ----------
  const toasts = [];
  function toast(text, kind = '') { toasts.push({ text, kind, t: 0 }); if (toasts.length > 4) toasts.shift(); renderToasts(); }
  function renderToasts() {
    const box = $('toasts');
    box.innerHTML = toasts.map(t => `<div class="toast ${t.kind}">${t.text}</div>`).join('');
  }
  let xpPending = 0, xpTimer = 0;
  function handleEvents(dt) {
    for (const e of game.events) {
      if (e.type === 'xp') { xpPending += e.amount; xpTimer = 0.6; }
      else if (e.type === 'level') toast(`Level ${e.level} · ${e.points} stat point${e.points === 1 ? '' : 's'} to spend at a Lodestone`, 'big');
      else if (e.type === 'found') toast(`Lodestone found · ${e.stone.hub ? 'the hub' : e.stone.region}`, 'stone');
      else if (e.type === 'rest') { save(); setMode('rest'); }
      else if (e.type === 'save') save();
      else if (e.type === 'died') toast('Your golem crumbled. It rises again at the last Lodestone.', '');
      else if (e.type === 'toast') toast(e.text, e.kind || '');
    }
    game.events.length = 0;
    if (xpPending && (xpTimer -= dt) <= 0) { toast(`+${xpPending} experience`, 'xp'); xpPending = 0; }
    let changed = false;
    for (const t of toasts) t.t += dt;
    while (toasts.length && toasts[0].t > (toasts[0].kind === 'big' ? 4.5 : 3)) { toasts.shift(); changed = true; }
    if (changed) renderToasts();
  }

  // ---------- HUD ----------
  const hud = { hp: -1, mana: -1, maxHp: -1, maxMana: -1, s0: undefined, s1: undefined, name: '', flash: 0, mflash: 0, lv: '' };
  function updateHud() {
    const p = game.players[0];
    const hp = Math.round(p.hp);
    if (hp !== hud.hp || p.maxHp !== hud.maxHp) {
      hud.hp = hp; hud.maxHp = p.maxHp;
      $('hpFill').style.transform = `scaleX(${Math.max(0, hp) / p.maxHp})`;
      $('hpMeter').setAttribute('aria-valuenow', Math.max(0, hp));
      $('hpMeter').setAttribute('aria-valuemax', p.maxHp);
      $('hpMeter').classList.toggle('low', hp < p.maxHp * 0.35);
    }
    const mana = Math.round(p.mana);
    if (mana !== hud.mana || p.maxMana !== hud.maxMana) {
      hud.mana = mana; hud.maxMana = p.maxMana;
      $('manaFill').style.transform = `scaleX(${mana / p.maxMana})`;
      $('manaMeter').setAttribute('aria-valuenow', mana);
      $('manaMeter').setAttribute('aria-valuemax', p.maxMana);
      $('manaMeter').classList.toggle('empty', p.manaWait > 0.4 && mana < 1);
    }
    if (p.manaFlash > 0.3 && hud.mflash <= 0.3) { const mm = $('manaMeter'); mm.classList.remove('flash'); void mm.offsetWidth; mm.classList.add('flash'); }
    hud.mflash = p.manaFlash;
    const P = KData.progression, lv = `${p.level}|${Math.floor(p.xp)}|${p.points}`;
    if (lv !== hud.lv) {
      hud.lv = lv;
      $('lvText').textContent = `Level ${p.level}`;
      $('xpFill').style.transform = `scaleX(${Math.min(1, p.xp / P.xpFor(p.level))})`;
      $('ptsBadge').hidden = !p.points;
      $('ptsBadge').textContent = `+${p.points}`;
    }
    for (const i of [0, 1]) {
      const el = p.slots[i];
      if (el !== hud['s' + i]) {
        hud['s' + i] = el;
        const s = $('slot' + i);
        s.classList.toggle('on', !!el);
        s.style.setProperty('--c', el ? elements[el].css : 'transparent');
      }
    }
    if (p.slotFlash > 0.3 && hud.flash <= 0.3) for (const i of [0, 1]) { const s = $('slot' + i); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
    hud.flash = p.slotFlash;
    const pad = KInput.device === 'pad';
    const set = p.slots[0] && p.slots[1] ? spells[spellKey(p.slots[0], p.slots[1])] : null;
    const name = (set ? KData.modes.map(md => set[md].name).join('|') : p.slots[0] ? 'Load one more' : 'Load two elements') + (pad ? '#pad' : '');
    if (name !== hud.name) {
      hud.name = name;
      const n = $('spellName');
      n.classList.toggle('idle', !set);
      if (!set) n.textContent = name.replace('#pad', '');
      else {
        const keysFor = pad ? { shot: 'RT', burst: 'LT', move: 'LB' } : { shot: 'L', burst: 'R', move: 'Space' };
        n.innerHTML = KData.modes.map(md => `<span class="mode"><kbd>${keysFor[md]}</kbd>${set[md].name}</span>`).join('');
      }
    }
    // the rest prompt next to a Lodestone
    const near = !!p.nearStone && mode === 'play';
    if (near !== hud.near) { hud.near = near; $('restPrompt').hidden = !near; $('restPrompt').innerHTML = pad ? 'D-pad up · Rest' : '<kbd>W</kbd> Rest'; }
  }

  // ---------- what is under the mouse (a note in the corner) ----------
  let lookText = '';
  function describe(wx, wy) {
    const pad = 1;
    for (const a of game.actors) {
      if (a.dead || a.asleep || !game.inBox(a, wx, wy, pad)) continue;
      const hp = `Health ${Math.max(0, Math.ceil(a.hp))} of ${a.maxHp}`;
      const status = (a.slowT > 0 || a.inMud ? ' Slowed by mud.' : '') + (window.KStatus ? window.KStatus.describe(a) : '');
      if (a.kind === 'player') return [`You (${KData.golems[a.skin].name}) · Level ${a.level}`, `${hp}. Mana ${Math.round(a.mana)} of ${a.maxMana}.`];
      if (a.kind === 'dummy') return ['Training dummy', `${hp}. Heals when left alone.`];
      const E = KData.enemies[a.kind];
      if (E) return [`${a.elite ? 'Elite ' : ''}${E.name} · Level ${a.level}`, `${hp}.${status} ${E.desc || ''}`.trim()];
    }
    const w = game.world, x = Math.floor(wx), y = Math.floor(wy);
    for (const l of w.lodestones) if (Math.abs(wx - l.x) < 5 && wy > l.y - 15 && wy < l.y + 1)
      return [game.found.has(l.id) ? 'Lodestone' : 'Lodestone (not yet found)', 'Touch it to make it your checkpoint and repair. Stand by it and press W to rest: spend stat points and travel.'];
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
  const mm = $('minimap'), mctx = mm.getContext('2d'), mimg = mctx.createImageData(mm.width, mm.height), mbuf = new Uint32Array(mimg.data.buffer);
  const pk = (r, g, b, a = 255) => (a << 24) | (b << 16) | (g << 8) | r;
  let mapTick = 0, regionText = '';
  function updateMap() {
    if (mapTick++ % 12) return;
    const w = game.world, M = KData.M, sx = w.w / mm.width, sy = w.h / mm.height;
    for (let y = 0; y < mm.height; y++) for (let x = 0; x < mm.width; x++) {
      const wx = Math.floor((x + 0.5) * sx), wy = Math.floor((y + 0.5) * sy), o = y * mm.width + x;
      if (!w.explored[(wy >> 5) * w.cw + (wx >> 5)]) { mbuf[o] = pk(8, 6, 12, 0); continue; }
      const m = w.get(wx, wy), B = KData.biomes[w.biomeAt(wx, wy)].strata[0];
      mbuf[o] = m === M.ROCK ? pk(52, 58, 84) : m === M.WATER ? pk(44, 90, 190) : m === M.MAGMA ? pk(230, 100, 40)
        : KWorld.SOLID[m] || m === M.MUD ? pk(B[0] * 0.75, B[1] * 0.75, B[2] * 0.75) : pk(24, 20, 34);
    }
    const dot = (wx, wy, c, big) => {
      const X = Math.floor(wx / sx), Y = Math.floor(wy / sy);
      for (const [dx, dy] of big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]) if (X + dx >= 0 && Y + dy >= 0 && X + dx < mm.width && Y + dy < mm.height) mbuf[(Y + dy) * mm.width + X + dx] = c;
    };
    for (const l of w.lodestones) {
      if (game.found.has(l.id)) dot(l.x, l.y - 4, pk(201, 182, 255), true);
      else if (w.explored[(l.y >> 5) * w.cw + (l.x >> 5)]) dot(l.x, l.y - 4, pk(120, 108, 150), true);
    }
    if (window.KLoot) window.KLoot.mapDots(game, dot, pk);
    const p = game.players[0], px = Math.floor(p.x / sx), py = Math.floor((p.y - 8) / sy);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) { const X = px + dx, Y = py + dy; if (X >= 0 && Y >= 0 && X < mm.width && Y < mm.height) mbuf[Y * mm.width + X] = pk(255, 255, 255); }
    mctx.putImageData(mimg, 0, 0);
    const t = `${KData.biomes[w.biomeAt(p.x, p.y - 8)].name} · Level ${w.levelAt(p.x, p.y)}`;
    if (t !== regionText) { regionText = t; $('region').textContent = t; }
  }

  // ---------- loop ----------
  let acc = 0, last = performance.now();
  const origin = () => { const p = game.players[0]; const c = game.chest(p); return R.worldToClient(c.x, c.y); };
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    pollPadMenu();
    if (mode === 'play') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) { game.step([KInput.sample(origin)]); acc -= STEP; n++; }
      if (n === 4) acc = 0;
      saveTimer += dt;
      if (saveTimer > 20) save();
    }
    handleEvents(mode === 'play' ? dt : 0);
    const p = game.players[0];
    let reticle = null;
    if (mode === 'play') {
      if (KInput.device === 'pad') { const c = game.chest(p); reticle = { x: c.x + Math.cos(p.aim) * 26, y: c.y + Math.sin(p.aim) * 26 }; }
      else if (KInput.mouse.moved) reticle = R.clientToWorld(KInput.mouse.x, KInput.mouse.y);
    }
    R.draw(game, { reticle, reduced: reduced.matches, dt: mode === 'play' ? dt : 0 });
    updateHud();
    updateLook();
    updateMap();
    requestAnimationFrame(frame);
  }
  setMode('start');
  requestAnimationFrame(frame);

  // for testing from the console
  window.cis = { get game() { return game; }, set game(g) { game = g; }, R, save, setMode, toast };
})();
