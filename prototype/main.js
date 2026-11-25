'use strict';
/* Cast in Stone prototype — main.js
   Starts everything: loads the saved world (or starts a new one), fits the
   16:9 stage to the screen, runs the fixed-step loop (60 steps a second,
   independent of the screen's frame rate), passes each step's actions to the
   game, draws, and keeps the HUD, the panels (start, spell book, pause, rest
   at a Lodestone) and the notices up to date. Saves now and then. */

(() => {
  const { elements, elementOrder, spells, spellKey, view: V, step: STEP } = KData;
  const VERSION = 'v0.25';

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

  // ---------- spell book: the forms, what a second element does, and special spells ----------
  const book = $('book');
  const MODE_LABEL = { shot: ['Shot', 'left click'], burst: ['Burst', 'right click'], lift: ['Lift', 'hold Space in the air'], move: ['Move', 'Shift'] };
  const MOD_TEXT = {
    shot: { fire: 'sets what it hits burning and scatters flames where it lands', water: 'soaks what it hits and splashes water where it lands', earth: 'hits with more knockback, digs where it lands and throws rubble', lightning: 'jumps on to another enemy for half the damage and electrifies water' },
    lift: { fire: 'lifts 12% harder', water: 'costs 12% less', earth: 'you take 15% less damage while lifting', lightning: 'moves 15% faster sideways' },
    move: { fire: 'hits 25% harder and leaves fire', water: 'goes 20% further', earth: 'digs through dirt', lightning: 'is 12% faster' },
  };
  MOD_TEXT.burst = MOD_TEXT.shot;
  const dots = q => q.map(e => `<i style="--c:${elements[e].css}" title="${elements[e].name}"></i>`).join('');
  book.insertAdjacentHTML('beforeend', '<span></span>' + KData.modes.map(md => `<span class="hd">${MODE_LABEL[md][0]}<small>${MODE_LABEL[md][1]}</small></span>`).join(''));
  const showSpell = (btn, q, md) => {
    const sp = KRecipe.resolve(q)[md], [a, b] = q;
    book.querySelectorAll('button.on').forEach(x => x.classList.remove('on'));
    btn.classList.add('on');
    const extra = Object.keys(sp.mods).filter(e => sp.mods[e] > 0).map(e => `${elements[e].name}: ${MOD_TEXT[md][e]}.`).join(' ');
    $('bookDetail').innerHTML = `<b>${sp.name} <small style="color:var(--dim);font-weight:500">· ${elements[a].name} first, then ${elements[b].name} · ${MODE_LABEL[md][0]} · ${sp.drain ? sp.drain + ' mana a second' : sp.cost + ' mana'}</small></b><span>${sp.desc}${extra ? ' ' + extra : ''}</span>`;
  };
  for (const a of elementOrder) for (const b of [a, ...elementOrder.filter(e => e !== a)]) {
    book.insertAdjacentHTML('beforeend', `<span class="pairc" title="${elements[a].name} first, then ${elements[b].name}">${dots([a, b])}</span>`);
    for (const md of KData.modes) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = KRecipe.resolve([a, b])[md].name;
      for (const ev of ['mouseenter', 'focus', 'click']) btn.addEventListener(ev, () => showSpell(btn, [a, b], md));
      book.appendChild(btn);
    }
  }
  // special spells: the ones you know show their sequence; the rest stay hidden
  function renderSpecials() {
    const known = game.players[0].known, S = KData.specials, ids = Object.keys(S);
    $('specials').innerHTML = `<h2 class="bag-title">Special spells · ${known.length} of ${ids.length} known</h2>` + ids.map(id => known.includes(id)
      ? `<div class="special"><span class="pairc">${dots(S[id].seq)}</span><div><b>${S[id].name} <small>· ${S[id].cost} mana · type it in this order, then left click</small></b><span>${S[id].desc}</span></div></div>`
      : `<div class="special unknown"><span class="pairc"><i></i><i></i><i></i></span><div><b>Unknown</b><span>Written in a tome somewhere in the cave, or found by trying sequences.</span></div></div>`).join('');
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
    $('mapWrap').hidden = m !== 'map';
    $('panelWrap').hidden = m === 'play' || m === 'rest' || m === 'map';
    confirmNew = false; $('btnNewCave').textContent = 'New game';
    if (m === 'play') { view.focus({ preventScroll: true }); return; }
    if (m === 'rest') { buildRest(); $('btnLeave').focus({ preventScroll: true }); return; }
    if (m === 'map') { drawBigMap(); $('btnMapClose').focus({ preventScroll: true }); return; }
    $('panelEyebrow').textContent = m === 'pause' ? 'Paused' : m === 'help' ? 'Spell book' : `Prototype · one player · ${VERSION}`;
    $('btnGo').textContent = m === 'start' ? (hadSave ? 'Continue' : 'Start') : 'Resume';
    $('btnPanelReset').hidden = m === 'start';
    showBook(m === 'help');
    $('btnGo').focus({ preventScroll: true });
  }
  view.tabIndex = -1;
  function showBook(on) {
    $('viewBook').hidden = !on; $('viewMain').hidden = on;
    if (on) renderSpecials();
    document.querySelector('.picker').hidden = on; $('panelLede').hidden = on;
    $('btnBook').textContent = on ? 'Controls' : 'Spell book';
  }
  $('btnBook').addEventListener('click', () => showBook($('viewBook').hidden));
  const resume = () => setMode('play');
  // Reset map: rebuild the cave from its seed, keeping the golem's progress.
  const resetMap = () => { game.reset(true); game.players[0].skin = skin; acc = 0; mapTick = 0; save(); };
  $('btnGo').addEventListener('click', () => { KAudio.start(); resume(); });
  addEventListener('pointerdown', () => KAudio.start(), { once: true });
  addEventListener('keydown', () => KAudio.start(), { once: true });
  const muteBtn = $('btnMute');
  const showMute = () => { muteBtn.setAttribute('aria-pressed', KAudio.muted ? 'true' : 'false'); muteBtn.innerHTML = KAudio.muted ? 'Sound off <kbd>M</kbd>' : 'Sound on <kbd>M</kbd>'; };
  muteBtn.addEventListener('click', () => { KAudio.start(); KAudio.setMuted(!KAudio.muted); showMute(); view.focus(); });
  addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat && !e.metaKey && !e.ctrlKey) { KAudio.start(); KAudio.setMuted(!KAudio.muted); showMute(); } });
  showMute();
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
    onMap: () => { if (mode === 'play') setMode('map'); else if (mode === 'map') setMode('play'); },
    onReset: resetMap,
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (mode === 'play') setMode('pause'); } });
  // a controller's Menu button resumes from a panel (in play, input.js pauses on it). The
  // button's real state is tracked all the time, so the press that paused does not also resume.
  let padMenuPrev = false;
  function pollPadMenu() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(x => x && x.connected);
    const down = !!(p && p.buttons[9] && p.buttons[9].pressed);
    if (mode !== 'play' && mode !== 'start' && down && !padMenuPrev) resume();
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
  let xpPending = 0, xpTimer = 0, shardPending = 0, shardTimer = 0;
  function handleEvents(dt) {
    for (const e of game.events) {
      if (e.type === 'xp') { xpPending += e.amount; xpTimer = 0.6; }
      else if (e.type === 'shard') { shardPending++; shardTimer = 0.7; }
      else if (e.type === 'level') {
        // point the way to the nearest Lodestone you have found, where points are spent
        const p = game.players[0];
        let best = null, bd = 1e9;
        for (const id of game.found) { const l = game.world.lodestones[id]; if (!l) continue; const d = Math.hypot(l.x - p.x, l.y - p.y); if (d < bd) { bd = d; best = l; } }
        const where = !best ? '' : bd < 40 ? ' · press F at the Lodestone here' : ` · nearest Lodestone ${Math.round(bd)} ${Math.abs(best.x - p.x) > Math.abs(best.y - p.y) ? (best.x < p.x ? 'west' : 'east') : (best.y < p.y ? 'up' : 'down')}`;
        toast(`Level ${e.level} · ${e.points} stat point${e.points === 1 ? '' : 's'} to spend at a Lodestone${where}`, 'big');
      }
      else if (e.type === 'found') toast(`Lodestone found · ${e.stone.hub ? 'the hub' : e.stone.region}`, 'stone');
      else if (e.type === 'rest') { save(); setMode('rest'); }
      else if (e.type === 'save') save();
      else if (e.type === 'died') toast('Your golem crumbled. It rises again at the last Lodestone.', '');
      else if (e.type === 'toast') toast(e.text, e.kind || '');
      else if (e.type === 'learn') { const S = KData.specials[e.id]; toast(`${e.how === 'tome' ? 'A tome' : 'Discovered'}: ${S.name} · ${S.seq.map(x => elements[x].label).join(' ')} · ${S.cost} mana`, 'big'); }
    }
    game.events.length = 0;
    if (xpPending && (xpTimer -= dt) <= 0) { toast(`+${xpPending} experience`, 'xp'); xpPending = 0; }
    if (shardPending && (shardTimer -= dt) <= 0) { toast(`+${shardPending} shard${shardPending === 1 ? '' : 's'} · ${game.players[0].shards} in all`, 'shard'); shardPending = 0; }
    let changed = false;
    for (const t of toasts) t.t += dt;
    while (toasts.length && toasts[0].t > (toasts[0].kind === 'big' ? 4.5 : 3)) { toasts.shift(); changed = true; }
    if (changed) renderToasts();
  }

  // ---------- HUD ----------
  const hud = { hp: -1, mana: -1, maxHp: -1, maxMana: -1, q: null, name: '', flash: 0, mflash: 0, lv: '' };
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
    // the recipe: one dot per element typed, then what each way of casting gives and costs
    const qsig = p.queue.join('+');
    if (qsig !== hud.q) {
      hud.q = qsig;
      $('queue').innerHTML = p.queue.map(e => `<span class="slot on" style="--c:${elements[e].css}"></span>`).join('') || '<span class="slot"></span>';
    }
    if (p.slotFlash > 0.3 && hud.flash <= 0.3) { const s = $('queue'); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
    hud.flash = p.slotFlash;
    const pad = KInput.device === 'pad';
    const RC = KRecipe.resolve(p.queue);
    p.recipe = RC;
    const specs = RC ? KData.modes.map(md => game.spec(p, md)) : null;
    const name = (specs ? qsig + specs.map(sp => (sp.special ? 'S' : '') + (p.mana >= (sp.drain ? sp.min : sp.cost) ? 1 : 0)).join('') : 'idle') + (pad ? '#pad' : '');
    if (name !== hud.name) {
      hud.name = name;
      const n = $('spellName');
      n.classList.toggle('idle', !specs);
      if (!specs) n.textContent = pad ? 'Press an element' : 'Type elements: Q W E S';
      else {
        const keysFor = pad ? { shot: 'RT', burst: 'LT', lift: 'LB', move: 'RB' } : { shot: 'L', burst: 'R', lift: 'Space', move: 'Shift' };
        n.innerHTML = KData.modes.map((md, i) => {
          const sp = specs[i], ok = p.mana >= (sp.drain ? sp.min : sp.cost);
          return `<span class="mode${sp.special ? ' special' : ''}${ok ? '' : ' no'}" title="${sp.name}"><kbd>${keysFor[md]}</kbd>${sp.special ? sp.name : sp.baseName}<small>${sp.drain ? Math.round(sp.drain) + '/s' : sp.cost}</small></span>`;
        }).join('');
      }
    }
    // the boss's health while you fight it
    // the health of the boss, or of a champion that has noticed you
    let b = game.boss; if (!(b && !b.dead && b.engaged)) b = game.championNear(p);
    const bossName = b ? (b.champion || KData.bosses[b.type].name) : '';
    if (bossName !== hud.boss) { hud.boss = bossName; $('bossBar').hidden = !b; $('bossName').textContent = bossName; }
    if (b) $('bossFill').style.transform = `scaleX(${Math.max(0, b.hp) / b.maxHp})`;
    // the rest prompt next to a Lodestone
    const near = !!p.nearStone && mode === 'play';
    if (near !== hud.near) { hud.near = near; $('restPrompt').hidden = !near; $('restPrompt').innerHTML = pad ? 'D-pad up · Rest' : '<kbd>F</kbd> Rest'; }
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
    const p = game.players[0];
    dot(p.x, p.y - 8, pk(255, 255, 255), true);
    if (W !== mm.width) { const X = Math.floor((p.x - x0) / s), Y = Math.floor((p.y - 8 - y0) / s); for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, 0], [3, 0], [0, -3], [0, 3]]) if (X + dx >= 0 && Y + dy >= 0 && X + dx < W && Y + dy < H) buf[(Y + dy) * W + X + dx] = pk(255, 255, 255); }
  }
  function drawBigMap() {
    const w = game.world, p = game.players[0];
    paintMap(bbuf, big.width, big.height, 0, 0, w.w / big.width);
    bctx.putImageData(bimg, 0, 0);
    const found = game.found.size, all = w.lodestones.length;
    $('mapInfo').textContent = `${KData.biomes[w.biomeAt(p.x, p.y - 8)].name} · Level ${w.levelAt(p.x, p.y)} · ${found} of ${all} Lodestones found`;
  }
  $('mapBox').addEventListener('click', () => { if (mode === 'play') setMode('map'); });
  $('btnMapClose').addEventListener('click', () => setMode('play'));
  function updateMap() {
    if (mapTick++ % 12) return;
    const w = game.world, p = game.players[0], S = 6;
    const x0 = Math.max(0, Math.min(w.w - mm.width * S, p.x - mm.width * S / 2)), y0 = Math.max(0, Math.min(w.h - mm.height * S, p.y - mm.height * S / 2));
    paintMap(mbuf, mm.width, mm.height, x0, y0, S);
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
      if (game.hitStop > 0) { game.hitStop -= dt; acc = 0; }   // a brief freeze on heavy blows
      else acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) { game.step([KInput.sample(origin)]); acc -= STEP; n++; }
      if (n === 4) acc = 0;
      saveTimer += dt;
      if (saveTimer > 20) save();
    }
    handleEvents(mode === 'play' ? dt : 0);
    // sounds, heard from the golem
    const me = game.players[0];
    for (const [name, x, y, v] of game.sounds) KAudio.play(name, x, y, me.x, me.y - 8, v);
    game.sounds.length = 0;
    const held = new Set();
    if (mode === 'play' && !me.dead) for (const md of KData.modes) { const k = me.channels[md]; if (k) { const sp = game.spec(me, md); if (sp) held.add(sp.kind); } }
    KAudio.hold(held);
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
