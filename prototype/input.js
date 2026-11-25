'use strict';
/* Cast in Stone prototype — input.js
   Turns keyboard, mouse and controller into ACTIONS. The game never reads a
   device directly: each fixed step it receives one action object per player:
     { move: -1..1, moveY: -1..1, jump: bool, cast: bool, burst: bool, moveSpell: bool, aim: radians, events: [...] }
   move: A/D. moveY: only a controller's stick (up/down). jump: Space. cast:
   left click (Shot). burst: right click (Burst). moveSpell: Shift (Move).
   events: load an element (Q W S E), clear (X), interact (F, rest at a Lodestone).
   events: { type: 'load', el: 'fire' } and { type: 'clear' }.
   A second player's actions will later arrive over the network in this same
   form, so nothing in the game has to change for online play. */

const KInput = (() => {
  const { elements, elementOrder } = KData;
  const keys = new Set();
  let events = [];
  const mouse = { x: 0, y: 0, moved: false, left: false, right: false };
  let device = 'kbm';
  let aim = 0;
  let padPrev = [];
  let hooks = {};
  const keyToEl = {};
  for (const el of elementOrder) for (const k of elements[el].keys) keyToEl[k] = el;

  // controller: RT shot, LT burst, LB jump, RB Move, d-pad up rests, View clears, Menu pauses
  const PAD = { jump: [4], move: [5], cast: [7], burst: [6], clear: [8], interact: [12], pause: 9 };

  function attach(target, h) {
    hooks = h;
    addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (hooks.blocked && hooks.blocked()) {
        if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyH') { e.preventDefault(); hooks.onClose && hooks.onClose(); }
        return;
      }
      device = 'kbm';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) { keys.add(e.code); return; }
      keys.add(e.code);
      if (keyToEl[e.code]) events.push({ type: 'load', el: keyToEl[e.code] });
      else if (e.code === 'KeyX' || e.code === 'KeyC') events.push({ type: 'clear' });
      else if (e.code === 'KeyF') events.push({ type: 'interact' });
      else if (e.code === 'Escape' || e.code === 'KeyP') hooks.onPause && hooks.onPause();
      else if (e.code === 'KeyH') hooks.onHelp && hooks.onHelp();
      else if (e.code === 'Backspace') hooks.onReset && hooks.onReset();
    });
    addEventListener('keyup', e => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; });
    target.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; device = 'kbm';
    });
    target.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; device = 'kbm';
      if (e.button === 0) mouse.left = true;
      if (e.button === 2) mouse.right = true;
    });
    addEventListener('pointerup', e => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; });
    target.addEventListener('contextmenu', e => e.preventDefault());
  }

  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  const btn = (p, i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));

  // Called once per fixed step. origin(): the player's chest in client pixels.
  function sample(origin) {
    const out = { move: 0, moveY: 0, jump: false, cast: false, burst: false, moveSpell: false, aim, events };
    events = [];

    const pad = readPad();
    let padMove = 0, padMoveY = 0, padJump = false, padCast = false, padBurst = false, padMoveSpell = false;
    if (pad) {
      const now = pad.buttons.map((b, i) => btn(pad, i));
      const pressed = i => now[i] && !padPrev[i];
      const lx = pad.axes[0] || 0, rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
      const anyPress = now.some((v, i) => v && !padPrev[i]);
      if (anyPress || Math.abs(lx) > 0.5 || Math.hypot(rx, ry) > 0.5) device = 'pad';
      if (device === 'pad') {
        for (const el of elementOrder) if (pressed(elements[el].pad)) out.events.push({ type: 'load', el });
        if (PAD.clear.some(pressed)) out.events.push({ type: 'clear' });
        if (PAD.interact.some(pressed)) out.events.push({ type: 'interact' });
        if (pressed(PAD.pause)) hooks.onPause && hooks.onPause();
        const ly = pad.axes[1] || 0;
        padMove = Math.abs(lx) > 0.22 ? lx : 0;
        padMoveY = Math.abs(ly) > 0.4 ? Math.sign(ly) : 0;
        if (now[14]) padMove = -1; if (now[15]) padMove = 1;
        if (now[12]) padMoveY = -1; if (now[13]) padMoveY = 1;
        padJump = PAD.jump.some(i => now[i]);
        padCast = PAD.cast.some(i => now[i]);
        padBurst = PAD.burst.some(i => now[i]);
        padMoveSpell = PAD.move.some(i => now[i]);
        if (Math.hypot(rx, ry) > 0.3) aim = Math.atan2(ry, rx);
        else if (Math.abs(lx) > 0.5) aim = lx > 0 ? 0 : Math.PI;
      }
      padPrev = now;
    }

    if (device === 'pad') {
      out.move = padMove; out.moveY = padMoveY; out.jump = padJump; out.cast = padCast; out.burst = padBurst; out.moveSpell = padMoveSpell;
    } else {
      const L = keys.has('KeyA') || keys.has('ArrowLeft'), R = keys.has('KeyD') || keys.has('ArrowRight');
      out.move = (R ? 1 : 0) - (L ? 1 : 0);
      out.moveY = 0;
      out.jump = keys.has('Space') || keys.has('ArrowUp');
      out.moveSpell = keys.has('ShiftLeft') || keys.has('ShiftRight');
      out.cast = mouse.left;
      out.burst = mouse.right;
      if (mouse.moved) {
        const o = origin();
        if (o) aim = Math.atan2(mouse.y - o.y, mouse.x - o.x);
      }
    }
    out.aim = aim;
    return out;
  }

  function clearHeld() { keys.clear(); mouse.left = mouse.right = false; events = []; }
  function queue(e) { events.push(e); }

  return { attach, sample, clearHeld, queue, get device() { return device; }, mouse };
})();
