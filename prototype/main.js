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
  const list = $('spellList');
  for (const key of Object.keys(spells)) {
    const sp = spells[key], [a, b] = key.split('+'), li = document.createElement('li');
    li.innerHTML = `<span class="pair"><i style="--c:${elements[a].css}"></i><i style="--c:${elements[b].css}"></i></span>` +
      `<b>${sp.name} <small style="color:var(--dim);font-weight:500">· ${elements[a].name} + ${elements[b].name}</small></b><span class="desc">${sp.desc}</span>`;
    list.appendChild(li);
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
    $('panelEyebrow').textContent = m === 'pause' ? 'Paused' : m === 'help' ? 'Spells and controls' : 'Prototype · one player · v0.5';
    $('btnGo').textContent = m === 'start' ? 'Start' : 'Resume';
    $('btnPanelReset').hidden = m === 'start';
    $('panelLede').hidden = m === 'help';
    $('btnGo').focus({ preventScroll: true });
  }
  view.tabIndex = -1;
  const resume = () => setMode('play');
  const reset = () => { game.reset(); game.players[0].skin = skin; acc = 0; };
  $('btnGo').addEventListener('click', resume);
  $('btnPanelReset').addEventListener('click', () => { reset(); resume(); });
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
    const name = p.slots[0] && p.slots[1] ? spells[spellKey(p.slots[0], p.slots[1])].name : p.slots[0] ? 'Load one more' : 'Load two elements';
    if (name !== hud.name) {
      hud.name = name;
      const n = $('spellName');
      n.textContent = name;
      n.classList.toggle('idle', !(p.slots[0] && p.slots[1]));
    }
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
    requestAnimationFrame(frame);
  }
  setMode('start');
  requestAnimationFrame(frame);

  // for testing from the console
  window.cis = { game, R };
})();
