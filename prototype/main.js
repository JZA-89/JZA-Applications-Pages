'use strict';
/* Cast in Stone prototype — main.js
   Starts everything: fits the 16:9 stage to the screen, runs the fixed-step
   loop (60 steps a second, independent of the screen's frame rate), passes
   each step's actions to the game, draws, and keeps the HUD and the panel
   (start, spells, pause) up to date. */

(() => {
  const { elements, elementOrder, spells, spellKey, view: V, step: STEP } = KData;
  const SEED = 20261125;

  const $ = id => document.getElementById(id);
  const stage = $('stage'), view = $('view'), glow = $('glow');
  const game = new KGame.Game(SEED);
  const R = new KRender.Renderer(view, glow);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

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

  // ---------- element chips and spell list ----------
  const els = $('els');
  for (const el of elementOrder) {
    const e = elements[el], b = document.createElement('button');
    b.type = 'button'; b.className = 'el'; b.style.setProperty('--c', e.css);
    b.innerHTML = `<i></i><span>${e.name}</span><kbd>${e.label}</kbd>`;
    b.setAttribute('aria-label', `Load ${e.name}`);
    b.addEventListener('click', () => KInput.queue({ type: 'load', el }));
    els.appendChild(b);
  }
  // spell book: ten pairs x three ways to cast; pointing at a name shows what it does
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

  // ---------- golem picker (remembered in this browser only) ----------
  let skin = 0;
  try { const v = parseInt(localStorage.getItem('castinstone.golem') ?? localStorage.getItem('kiln.golem'), 10); if (v >= 0 && v < KData.golems.length) skin = v; } catch {}
  game.players[0].skin = skin;
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

  // ---------- modes: start, help, pause, play ----------
  let mode = 'start';
  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    KInput.clearHeld();
    if (m === 'play') { view.focus({ preventScroll: true }); return; }
    $('panelEyebrow').textContent = m === 'pause' ? 'Paused' : m === 'help' ? 'Spell book' : 'Prototype · one player · v0.11';
    $('btnGo').textContent = m === 'start' ? 'Start' : 'Resume';
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
  const reset = () => { game.reset(); game.players[0].skin = skin; acc = 0; };
  $('btnGo').addEventListener('click', resume);
  $('btnPanelReset').addEventListener('click', () => { reset(); resume(); });
  $('btnNewCave').addEventListener('click', () => { game.seed = (Math.random() * 1e9) | 0; reset(); mapTick = 0; resume(); });
  $('btnPause').addEventListener('click', () => setMode('pause'));
  $('btnSpells').addEventListener('click', () => setMode('help'));
  $('btnReset').addEventListener('click', () => { reset(); view.focus(); });
  for (const b of document.querySelectorAll('.hud button')) b.addEventListener('pointerdown', e => e.stopPropagation());

  KInput.attach(view, {
    blocked: () => mode !== 'play',
    onClose: () => { if (mode !== 'start') resume(); },
    onPause: () => setMode(mode === 'play' ? 'pause' : 'play'),
    onHelp: () => setMode(mode === 'help' ? 'play' : 'help'),
    onReset: reset,
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') setMode('pause'); });
  // a controller's Menu button resumes from the panel too
  let padMenuPrev = false;
  function pollPadMenu() {
    if (mode === 'play') { padMenuPrev = false; return; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(x => x && x.connected);
    const down = !!(p && (p.buttons[9]?.pressed || p.buttons[0]?.pressed));
    if (down && !padMenuPrev) resume();
    padMenuPrev = down;
  }

  // ---------- HUD ----------
  const hud = { hp: -1, mana: -1, s0: undefined, s1: undefined, name: '', flash: 0, mflash: 0 };
  function updateHud() {
    const p = game.players[0];
    const hp = Math.round(p.hp);
    if (hp !== hud.hp) {
      hud.hp = hp;
      $('hpFill').style.transform = `scaleX(${Math.max(0, hp) / p.maxHp})`;
      $('hpMeter').setAttribute('aria-valuenow', Math.max(0, hp));
      $('hpMeter').classList.toggle('low', hp < 35);
    }
    const mana = Math.round(p.mana);
    if (mana !== hud.mana) {
      hud.mana = mana;
      $('manaFill').style.transform = `scaleX(${mana / p.maxMana})`;
      $('manaMeter').setAttribute('aria-valuenow', mana);
      $('manaMeter').classList.toggle('empty', p.manaWait > 0.4 && mana < 1);
    }
    if (p.manaFlash > 0.3 && hud.mflash <= 0.3) { const mm = $('manaMeter'); mm.classList.remove('flash'); void mm.offsetWidth; mm.classList.add('flash'); }
    hud.mflash = p.manaFlash;
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
  }

  // ---------- what is under the mouse (a note in the corner) ----------
  let lookText = '';
  function describe(wx, wy) {
    const pad = 1;
    for (const a of game.actors) {
      if (a.dead || !game.inBox(a, wx, wy, pad)) continue;
      const hp = `Health ${Math.max(0, Math.ceil(a.hp))} of ${a.maxHp}`;
      const slowed = a.slowT > 0 || a.inMud ? ' Slowed by mud.' : '';
      if (a.kind === 'crawler') return [`Shale crawler · Level ${a.level}`, `${hp}.${slowed} Winds up, then lunges. A hard hit staggers it.`];
      if (a.kind === 'dummy') return ['Training dummy', `${hp}. Heals when left alone.`];
      if (a.kind === 'player') return [`You (${KData.golems[a.skin].name})`, `${hp}. Mana ${Math.round(a.mana)} of ${a.maxMana}.`];
    }
    const w = game.world, x = Math.floor(wx), y = Math.floor(wy);
    for (const wl of w.wells) if (Math.abs(wx - wl.x) < 4 && wy > wl.y - 9 && wy < wl.y + 1) return ['Mana well', 'Stand next to it to refill mana fast.'];
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
    for (const wl of w.wells) if (w.explored[(wl.y >> 5) * w.cw + (wl.x >> 5)]) { const o = Math.floor(wl.y / sy) * mm.width + Math.floor(wl.x / sx); mbuf[o] = pk(201, 182, 255); }
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
    }
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
  window.cis = { game, R };
})();
