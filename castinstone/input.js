'use strict';
/* Cast in Stone — input.js
   Turns keyboard, mouse and controller into ACTIONS. The game never reads a
   device directly: each fixed step it receives one action object per player:
     { move: -1..1, moveY: -1..1, jump, cast, burst, moveSpell, aim: radians, aimDist: cells, events: [...] }
   events: { type: 'load', el: 'fire' } (adds to the recipe), { type: 'undo' },
   { type: 'clear' } and { type: 'interact' } (rest at a Lodestone).
   A second player's actions will later arrive over the network in this same
   form, so nothing in the game has to change for online play.

   Keyboard and mouse: A/D run, Space jump and Lift, Shift Move, left click
   Shot, right click Burst, Q W E S elements, C or Z take off the last, X
   clear, F rest, Tab map, H spell book, Esc pause.

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
  const mouse = { x: 0, y: 0, moved: false, left: false, right: false };
  let device = 'kbm';
  let aim = 0, aimDist = 90;   // aimDist: how far the pointer is from the golem, in world cells
  let hooks = {};
  const keyToEl = {};
  for (const el of elementOrder) for (const k of elements[el].keys) keyToEl[k] = el;

  // standard gamepad button numbers
  const PAD = { earth: 0, fire: 1, water: 2, lightning: 3, move: 4, burst: 5, jump: 6, cast: 7, clear: 8, pause: 9, rest: 12, undo: 13, map: 14, book: 15 };
  const NONE = () => ({ move: 0, moveY: 0, jump: false, cast: false, burst: false, moveSpell: false });
  // the controller as last read (poll): what is held now, the time before, and the actions held
  let padNow = [], padPrev = [], padHeld = NONE();
  let sticksRested = true;       // the sticks have been near the centre since the controller last lost control
  let padBlocked = new Set();    // buttons that were down when the controller lost control: ignored until let go
  let navHeld = null, navAt = 0; // menu direction being held, and when it next repeats
  // what the on-screen controls are holding; aim is null while the golem aims by itself
  const touch = { move: 0, moveY: 0, jump: false, cast: false, burst: false, moveSpell: false, aim: null, dist: 90 };
  const touchDrop = () => { Object.assign(touch, { move: 0, moveY: 0, jump: false, cast: false, burst: false, moveSpell: false, aim: null }); hooks.onTouchDrop && hooks.onTouchDrop(); };

  function setDevice(d) {
    if (d === device) return;
    device = d;
    document.body.dataset.device = d;
    if (d !== 'kbm') { keys.clear(); mouse.left = mouse.right = false; mouse.moved = false; }   // drop whatever the keyboard and mouse were holding
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
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // a key that is only repeating (held since before the controller took over) does not count
      if (e.repeat && !keys.has(e.code)) return;
      if (!e.repeat) setDevice('kbm');
      if (hooks.blocked && hooks.blocked()) {
        if (e.code === 'Tab') { e.preventDefault(); hooks.onMap && hooks.onMap(); }
        if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyH') { e.preventDefault(); hooks.onClose && hooks.onClose(); }
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      keys.add(e.code);
      if (keyToEl[e.code]) events.push({ type: 'load', el: keyToEl[e.code] });
      else if (e.code === 'KeyX') events.push({ type: 'clear' });
      else if (e.code === 'KeyC' || e.code === 'KeyZ') events.push({ type: 'undo' });
      else if (e.code === 'KeyF') events.push({ type: 'interact' });
      else if (e.code === 'Escape' || e.code === 'KeyP') hooks.onPause && hooks.onPause();
      else if (e.code === 'KeyH') hooks.onHelp && hooks.onHelp();
      else if (e.code === 'Tab') hooks.onMap && hooks.onMap();
    });
    addEventListener('keyup', e => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; });
    // The mouse buttons are read from the browser's own record of what is held
    // (event.buttons), on every press, release and movement. Counting presses
    // and releases is not enough: while one mouse button is down, pressing or
    // letting go of the other sends no press or release at all, only a
    // movement, so a button could be left "held" for good. A button starts
    // counting only when pressed over the game, and stops as soon as it is up.
    const sync = (e, onGame) => {
      if (e.pointerType !== 'mouse' || device !== 'kbm') return;
      const L = !!(e.buttons & 1), R2 = !!(e.buttons & 2);
      mouse.left = L && (mouse.left || onGame);
      mouse.right = R2 && (mouse.right || onGame);
    };
    // the mouse takes over when it really moves (a few pixels), or on a click
    let lastX = null, lastY = null;
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const moved = lastX === null || Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) >= 3;
      if (moved) { lastX = e.clientX; lastY = e.clientY; setDevice('kbm'); }
      if (device !== 'kbm') return;
      if (e.target === target) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; }
      sync(e, e.target === target && (mouse.left || mouse.right));   // a second button pressed while the first is held arrives as a movement
    });
    addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') setDevice('kbm'); else if (e.pointerType === 'touch' || e.pointerType === 'pen') setDevice('touch'); }, true);
    target.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true;
      sync(e, true);
    });
    addEventListener('pointerup', e => sync(e, false));
    addEventListener('pointercancel', () => { mouse.left = mouse.right = false; });
    document.addEventListener('mouseleave', () => { mouse.left = mouse.right = false; });
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
    if (device !== 'pad') return null;

    if (inPlay) {
      for (const el of elementOrder) if (pressed(PAD[el])) events.push({ type: 'load', el });
      if (pressed(PAD.clear)) events.push({ type: 'clear' });
      if (pressed(PAD.undo)) events.push({ type: 'undo' });
      if (pressed(PAD.rest)) events.push({ type: 'interact' });
      padHeld = { move: Math.abs(lx) > 0.22 ? lx : 0, moveY: Math.abs(ly) > 0.4 ? Math.sign(ly) : 0,
        jump: down(PAD.jump), cast: down(PAD.cast), burst: down(PAD.burst), moveSpell: down(PAD.move) };
      if (rMag > 0.3) { aim = Math.atan2(ry, rx); aimDist = 30 + 130 * Math.min(1, rMag); }
      else if (Math.abs(lx) > 0.5) aim = lx > 0 ? 0 : Math.PI;
      if (pressed(PAD.pause)) hooks.onPause && hooks.onPause();
      else if (pressed(PAD.map)) hooks.onMap && hooks.onMap();
      else if (pressed(PAD.book)) hooks.onHelp && hooks.onHelp();
      return null;
    }
    // a menu: a direction from the d-pad or the left stick, repeating while held
    padHeld = NONE();
    let dir = null;
    if (down(12) || ly < -0.6) dir = 'up'; else if (down(13) || ly > 0.6) dir = 'down';
    else if (down(14) || lx < -0.6) dir = 'left'; else if (down(15) || lx > 0.6) dir = 'right';
    // a direction already held when the menu opened does nothing until it is let go
    if (navHeld === 'wait') { if (dir) dir = null; else navHeld = null; }
    const act = { dx: 0, dy: 0, accept: pressed(0), back: pressed(1), tab: pressed(4) ? -1 : pressed(5) ? 1 : 0, pause: pressed(PAD.pause) };
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
      out.move = touch.move; out.moveY = touch.moveY; out.jump = touch.jump; out.cast = touch.cast; out.burst = touch.burst; out.moveSpell = touch.moveSpell;
      const auto = touch.aim === null && hooks.autoAim ? hooks.autoAim() : null;
      if (touch.aim !== null) { aim = touch.aim; aimDist = touch.dist; }
      else if (auto) { aim = auto.aim; aimDist = auto.dist; }
      else if (Math.abs(touch.move) > 0.3) { aim = touch.move > 0 ? 0 : Math.PI; aimDist = 90; }
    } else if (device === 'pad') {
      out.move = padHeld.move; out.moveY = padHeld.moveY; out.jump = padHeld.jump; out.cast = padHeld.cast; out.burst = padHeld.burst; out.moveSpell = padHeld.moveSpell;
    } else {
      const L = keys.has('KeyA') || keys.has('ArrowLeft'), R = keys.has('KeyD') || keys.has('ArrowRight');
      out.move = (R ? 1 : 0) - (L ? 1 : 0);
      out.jump = keys.has('Space') || keys.has('ArrowUp');
      out.moveSpell = keys.has('ShiftLeft') || keys.has('ShiftRight');
      out.cast = mouse.left;
      out.burst = mouse.right;
      if (mouse.moved) {
        const o = origin();
        if (o) { aim = Math.atan2(mouse.y - o.y, mouse.x - o.x); aimDist = Math.hypot(mouse.y - o.y, mouse.x - o.x) / (o.scale || 1); }
      }
    }
    out.aim = aim; out.aimDist = aimDist;
    return out;
  }

  // a panel opened or closed: nothing held carries over (a controller button still down is not a new press)
  function clearHeld() { keys.clear(); mouse.left = mouse.right = false; events = []; padHeld = NONE(); navHeld = 'wait'; touchDrop(); }
  function queue(e) { events.push(e); }

  return { attach, sample, poll, clearHeld, queue, get device() { return device; }, mouse, PAD, touch };
})();
