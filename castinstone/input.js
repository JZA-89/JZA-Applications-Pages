'use strict';
/* Cast in Stone — input.js
   Turns keyboard, mouse and controller into ACTIONS. The game never reads a
   device directly: each fixed step it receives one action object per player:
     { move: -1..1, moveY: -1..1, jump, cast, burst, moveSpell, aim: radians, aimDist: cells, events: [...] }
   events: { type: 'load', el: 'fire' } (adds to the recipe), { type: 'undo' },
   { type: 'clear' } and { type: 'interact' } (rest at a Lodestone).
   A second player's actions will later arrive over the network in this same
   form, so nothing in the game has to change for online play.

   The keys and buttons below are the usual ones. Both sets can be changed in the
   Controls tab (`bind`, kept in localStorage under castinstone.controls.v1);
   everything on screen that names a key asks `label()` for it.

   Keyboard and mouse: A/D run, Space jump and Lift, Shift Move, left click
   Shot, right click Burst, Q W S E elements, C take off the last, X clear,
   R rest, F full screen, M and N sound and music, Tab map, H spell book, Esc
   pause. Fixed: the arrow keys also run and jump, 1 to 4 also add the
   elements, Esc always pauses.

   Controller (standard layout, named as on an Xbox pad):
     left stick run · right stick aim · LT jump and Lift · RT Shot · LB Move
     (dash) · RB Burst · B X A Y fire, water, earth, lightning · d-pad up rest,
     down take off the last, left map, right spell book · View clear · Menu pause.
   In a menu: d-pad or left stick moves between buttons, A presses, B goes
   back, LB and RB change tab, Menu resumes.

   Touch: on-screen controls (touch.js) write into `touch` below; a finger on
   the screen makes the device 'touch'.

   ONE DEVICE AT A TIME. `device` is 'kbm', 'pad' or 'touch', and only that device's
   input counts. A controller takes over on a new button press, or a stick
   pushed past half after having been at rest; the keyboard and mouse take
   over on a new key press, a click, or the mouse moving. Whatever the other
   device was holding is dropped at that moment (a held key, a held trigger),
   and it has to be let go and pressed again before it counts. */

const KInput = (() => {
  const { elements, elementOrder } = KData;
  const keys = new Set();
  let events = [];
  // b: the three buttons held (left, middle, right); left and right are kept as names for them
  const mouse = { x: 0, y: 0, moved: false, b: [false, false, false], get left() { return this.b[0]; }, set left(v) { this.b[0] = v; }, get right() { return this.b[2]; }, set right(v) { this.b[2] = v; } };
  let device = 'kbm';
  let aim = 0, aimDist = 90;   // aimDist: how far the pointer is from the golem, in world cells
  let hooks = {};
  const keyToEl = {};
  elementOrder.forEach((el, i) => { keyToEl['Digit' + (i + 1)] = el; });

  // standard gamepad button numbers
  // ----- which key or button does what. Both sets can be changed in the Controls tab and are kept on this device. -----
  // A keyboard binding is a key's code ('KeyA', 'Space') or, for the held actions, a mouse button ('Mouse0' left, 'Mouse1' middle, 'Mouse2' right).
  const DEFAULTS = {
    kbm: { left: 'KeyA', right: 'KeyD', jump: 'Space', move: 'ShiftLeft', shot: 'Mouse0', burst: 'Mouse2', fire: 'KeyQ', water: 'KeyW', earth: 'KeyS', lightning: 'KeyE',
      undo: 'KeyC', clear: 'KeyX', rest: 'KeyR', map: 'Tab', book: 'KeyH', pause: 'Escape', full: 'KeyF', mute: 'KeyM', music: 'KeyN' },
    pad: { jump: 6, shot: 7, move: 4, burst: 5, fire: 1, water: 2, earth: 0, lightning: 3, rest: 12, undo: 13, map: 14, book: 15, clear: 8, pause: 9 },
  };
  const HELD = new Set(['left', 'right', 'jump', 'move', 'shot', 'burst']);   // these may be on a mouse button
  const STORE = 'castinstone.controls.v1';
  const bind = { kbm: { ...DEFAULTS.kbm }, pad: { ...DEFAULTS.pad } };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) for (const dev of ['kbm', 'pad']) for (const a in DEFAULTS[dev]) { const v = saved[dev] && saved[dev][a]; if (dev === 'kbm' ? typeof v === 'string' && v.length < 24 : Number.isInteger(v) && v >= 0 && v < 20) bind[dev][a] = v; }
  } catch (e) {}
  const keep = () => { try { localStorage.setItem(STORE, JSON.stringify(bind)); } catch (e) {} rev++; hooks.onBindings && hooks.onBindings(); };
  let rev = 0, capture = null;   // capture: { dev, action, done } while the Controls tab waits for a key or button
  const norm = c => c === 'ShiftRight' ? 'ShiftLeft' : c;
  const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L stick', 'R stick', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right'];
  const KEY_NAMES = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', ShiftLeft: 'Shift', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Backspace: 'Bksp', CapsLock: 'Caps',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
  // what to show for an action: 'Q', 'Space', 'LMB', 'RT'
  function label(dev, action) { const v = bind[dev][action]; return dev === 'pad' ? PAD_NAMES[v] || 'Button ' + v : KEY_NAMES[v] || String(v).replace(/^(Key|Digit|Numpad)/, ''); }
  // give an action a new key or button; whatever had it before takes this action's old one, so nothing is left without
  function assign(dev, action, value) {
    const old = bind[dev][action];
    for (const a in bind[dev]) if (a !== action && bind[dev][a] === value) bind[dev][a] = (dev === 'kbm' && String(old).startsWith('Mouse') && !HELD.has(a)) ? DEFAULTS.kbm[a] : old;
    bind[dev][action] = value; keep();
  }
  function startCapture(dev, action, done) { capture = { dev, action, done, at: performance.now() }; }
  function endCapture(ok) { const c = capture; capture = null; if (c && c.done) c.done(ok); }
  function resetBindings(dev) { bind[dev] = { ...DEFAULTS[dev] }; keep(); }
  const actionOf = code => { for (const a in bind.kbm) if (bind.kbm[a] === code) return a; return null; };
  const NONE = () => ({ move: 0, moveY: 0, jump: false, cast: false, burst: false, moveSpell: false });
  // the controller as last read (poll): what is held now, the time before, and the actions held
  let padNow = [], padPrev = [], padHeld = NONE();
  let sticksRested = true;       // the sticks have been near the centre since the controller last lost control
  let padBlocked = new Set();    // buttons that were down when the controller lost control: ignored until let go
  let navHeld = null, navAt = 0; // menu direction being held, and when it next repeats
  // what the on-screen controls are holding; aim is null while the golem aims by itself
  const touch = { move: 0, moveY: 0, tilt: 0, jump: false, cast: false, burst: false, moveSpell: false, aim: null, dist: 90 };
  const touchDrop = () => { Object.assign(touch, { move: 0, moveY: 0, tilt: 0, jump: false, cast: false, burst: false, moveSpell: false, aim: null }); hooks.onTouchDrop && hooks.onTouchDrop(); };

  function setDevice(d) {
    if (d === device) return;
    device = d;
    document.body.dataset.device = d;
    if (d !== 'kbm') { keys.clear(); mouse.b.fill(false); mouse.moved = false; }   // drop whatever the keyboard and mouse were holding
    if (d !== 'touch') touchDrop();
    if (d !== 'pad') {
      // drop whatever the controller was holding; held buttons and pushed sticks must be released first
      padHeld = NONE();
      padBlocked = new Set(padNow.map((v, i) => v ? i : -1).filter(i => i >= 0));
      sticksRested = false; navHeld = null;
    }
  }

  function attach(target, h) {
    hooks = h;
    document.body.dataset.device = device;
    addEventListener('keydown', e => {
      if (capture && capture.dev === 'kbm') {   // the Controls tab is waiting for a key
        e.preventDefault(); e.stopPropagation();
        if (e.repeat) return;
        if (e.code === 'Escape') return endCapture(false);
        if (['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'].includes(e.code)) return;   // the browser uses these
        assign('kbm', capture.action, norm(e.code)); return endCapture(true);
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && e.target.tagName === 'INPUT') return;   // typing a co-op code
      const code = norm(e.code), act = actionOf(code);
      // a key that is only repeating (held since before the controller took over) does not count
      if (e.repeat && !keys.has(code)) return;
      if (!e.repeat) setDevice('kbm');
      if (!e.repeat && (act === 'full' || act === 'mute' || act === 'music')) { e.preventDefault(); const h = hooks[act === 'full' ? 'onFull' : act === 'mute' ? 'onMute' : 'onMusic']; h && h(); return; }
      if (hooks.blocked && hooks.blocked()) {
        if (act === 'map') { e.preventDefault(); hooks.onMap && hooks.onMap(); }
        if (code === 'Escape' || act === 'pause' || act === 'book') { e.preventDefault(); hooks.onClose && hooks.onClose(); }
        return;
      }
      if (act || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab'].includes(code)) e.preventDefault();
      if (e.repeat) return;
      keys.add(code);
      if (act && KData.elements[act]) events.push({ type: 'load', el: act });
      else if (!act && keyToEl[code]) events.push({ type: 'load', el: keyToEl[code] });   // 1 to 4 also add the elements, unless given another job
      else if (act === 'clear') events.push({ type: 'clear' });
      else if (act === 'undo') events.push({ type: 'undo' });
      else if (act === 'rest') events.push({ type: 'interact' });
      else if (act === 'pause' || code === 'Escape') hooks.onPause && hooks.onPause();
      else if (act === 'book') hooks.onHelp && hooks.onHelp();
      else if (act === 'map') hooks.onMap && hooks.onMap();
    }, true);
    addEventListener('keyup', e => keys.delete(norm(e.code)));
    addEventListener('blur', () => { keys.clear(); mouse.b.fill(false); });
    // The mouse buttons are read from the browser's own record of what is held
    // (event.buttons), on every press, release and movement. Counting presses
    // and releases is not enough: while one mouse button is down, pressing or
    // letting go of the other sends no press or release at all, only a
    // movement, so a button could be left "held" for good. A button starts
    // counting only when pressed over the game, and stops as soon as it is up.
    const sync = (e, onGame) => {
      if (e.pointerType !== 'mouse' || device !== 'kbm') return;
      [1, 4, 2].forEach((bit, i) => { mouse.b[i] = !!(e.buttons & bit) && (mouse.b[i] || onGame); });
    };
    // the mouse takes over when it really moves (a few pixels), or on a click
    let lastX = null, lastY = null;
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const moved = lastX === null || Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) >= 3;
      if (moved) { lastX = e.clientX; lastY = e.clientY; setDevice('kbm'); }
      if (device !== 'kbm') return;
      if (e.target === target) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; }
      sync(e, e.target === target && mouse.b.some(Boolean));   // a second button pressed while the first is held arrives as a movement
    });
    addEventListener('pointerdown', e => {
      // the Controls tab is waiting, and this action may go on a mouse button (not the click that started the wait)
      if (capture && capture.dev === 'kbm' && e.pointerType === 'mouse' && performance.now() - capture.at > 150) {
        e.preventDefault(); e.stopPropagation();
        if (HELD.has(capture.action) && e.button >= 0 && e.button <= 2) { assign('kbm', capture.action, 'Mouse' + e.button); endCapture(true); } else endCapture(false);
        return;
      }
      if (e.pointerType === 'mouse') setDevice('kbm'); else if (e.pointerType === 'touch' || e.pointerType === 'pen') setDevice('touch');
    }, true);
    target.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true;
      sync(e, true);
    });
    addEventListener('pointerup', e => sync(e, false));
    addEventListener('pointercancel', () => { mouse.b.fill(false); });
    document.addEventListener('mouseleave', () => { mouse.b.fill(false); });
    target.addEventListener('contextmenu', e => e.preventDefault());
  }

  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Called once a frame, in play and in menus. Reads the controller, decides
  // which device is in charge, queues the presses that are events (in play),
  // and returns what a menu should do: { dx, dy, accept, back, tab, pause } or null.
  function poll(inPlay, now = performance.now()) {
    const pad = readPad();
    if (!pad) { if (padNow.length) { padNow = []; padPrev = []; padHeld = NONE(); } return null; }
    padPrev = padNow;
    padNow = pad.buttons.map(b => !!(b && (b.pressed || b.value > 0.4)));
    for (const i of [...padBlocked]) if (!padNow[i]) padBlocked.delete(i);
    const lx = pad.axes[0] || 0, ly = pad.axes[1] || 0, rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
    const lMag = Math.hypot(lx, ly), rMag = Math.hypot(rx, ry);
    if (lMag < 0.3 && rMag < 0.3) sticksRested = true;
    const down = i => padNow[i] && !padBlocked.has(i);
    const pressed = i => down(i) && !padPrev[i];
    const anyPress = padNow.some((v, i) => pressed(i));
    if (anyPress || (sticksRested && (lMag > 0.5 || rMag > 0.5))) setDevice('pad');
    if (capture && capture.dev === 'pad') {   // the Controls tab is waiting for a button
      const i = padNow.findIndex((v, k) => v && !padPrev[k] && !padBlocked.has(k));
      if (i >= 0 && performance.now() - capture.at > 150) { assign('pad', capture.action, i); padBlocked.add(i); endCapture(true); }
      return null;
    }
    if (device !== 'pad') return null;

    if (inPlay) {
      for (const el of elementOrder) if (pressed(bind.pad[el])) events.push({ type: 'load', el });
      if (pressed(bind.pad.clear)) events.push({ type: 'clear' });
      if (pressed(bind.pad.undo)) events.push({ type: 'undo' });
      if (pressed(bind.pad.rest)) events.push({ type: 'interact' });
      padHeld = { move: Math.abs(lx) > 0.22 ? lx : 0, moveY: Math.abs(ly) > 0.4 ? Math.sign(ly) : 0,
        jump: down(bind.pad.jump), cast: down(bind.pad.shot), burst: down(bind.pad.burst), moveSpell: down(bind.pad.move) };
      if (rMag > 0.3) { aim = Math.atan2(ry, rx); aimDist = 30 + 130 * Math.min(1, rMag); }
      else if (Math.abs(lx) > 0.5) aim = lx > 0 ? 0 : Math.PI;
      if (pressed(bind.pad.pause)) hooks.onPause && hooks.onPause();
      else if (pressed(bind.pad.map)) hooks.onMap && hooks.onMap();
      else if (pressed(bind.pad.book)) hooks.onHelp && hooks.onHelp();
      return null;
    }
    // a menu: a direction from the d-pad or the left stick, repeating while held
    padHeld = NONE();
    let dir = null;
    if (down(12) || ly < -0.6) dir = 'up'; else if (down(13) || ly > 0.6) dir = 'down';
    else if (down(14) || lx < -0.6) dir = 'left'; else if (down(15) || lx > 0.6) dir = 'right';
    // a direction already held when the menu opened does nothing until it is let go
    if (navHeld === 'wait') { if (dir) dir = null; else navHeld = null; }
    const act = { dx: 0, dy: 0, accept: pressed(0), back: pressed(1), tab: pressed(4) ? -1 : pressed(5) ? 1 : 0, pause: pressed(bind.pad.pause) };
    if (dir && (dir !== navHeld || now >= navAt)) {
      navAt = now + (dir !== navHeld ? 380 : 130); navHeld = dir;
      act.dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0; act.dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    } else if (!dir && navHeld !== 'wait') navHeld = null;
    return act.dx || act.dy || act.accept || act.back || act.tab || act.pause ? act : null;
  }

  // Called once per fixed step. origin(): the player's chest in client pixels.
  function sample(origin) {
    const out = { move: 0, moveY: 0, jump: false, cast: false, burst: false, moveSpell: false, aim, aimDist, events };
    events = [];
    if (device === 'touch') {
      out.move = touch.move; out.moveY = touch.moveY; out.tilt = touch.tilt; out.jump = touch.jump; out.cast = touch.cast; out.burst = touch.burst; out.moveSpell = touch.moveSpell;
      const auto = touch.aim === null && hooks.autoAim ? hooks.autoAim() : null;
      if (touch.aim !== null) { aim = touch.aim; aimDist = touch.dist; }
      else if (auto) { aim = auto.aim; aimDist = auto.dist; }
      else if (Math.abs(touch.move) > 0.3) { aim = touch.move > 0 ? 0 : Math.PI; aimDist = 90; }
    } else if (device === 'pad') {
      out.move = padHeld.move; out.moveY = padHeld.moveY; out.jump = padHeld.jump; out.cast = padHeld.cast; out.burst = padHeld.burst; out.moveSpell = padHeld.moveSpell;
    } else {
      // held: on a key, or on a mouse button; the arrow keys always run and jump as well
      const h = a => { const c = bind.kbm[a]; return c.startsWith('Mouse') ? mouse.b[+c[5]] : keys.has(c); };
      const L = h('left') || keys.has('ArrowLeft'), R = h('right') || keys.has('ArrowRight');
      out.move = (R ? 1 : 0) - (L ? 1 : 0);
      out.jump = h('jump') || keys.has('ArrowUp');
      out.moveSpell = h('move');
      out.cast = h('shot');
      out.burst = h('burst');
      if (mouse.moved) {
        const o = origin();
        if (o) { aim = Math.atan2(mouse.y - o.y, mouse.x - o.x); aimDist = Math.hypot(mouse.y - o.y, mouse.x - o.x) / (o.scale || 1); }
      }
    }
    out.aim = aim; out.aimDist = aimDist;
    return out;
  }

  // a panel opened or closed: nothing held carries over (a controller button still down is not a new press)
  function clearHeld() { keys.clear(); mouse.b.fill(false); events = []; padHeld = NONE(); navHeld = 'wait'; touchDrop(); }
  function queue(e) { events.push(e); }

  return { attach, sample, poll, clearHeld, queue, get device() { return device; }, mouse, touch, label, startCapture, resetBindings, get capturing() { return capture; }, get rev() { return rev; }, DEFAULTS };
})();
