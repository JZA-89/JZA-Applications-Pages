'use strict';
/* Cast in Stone prototype — input.js
   Turns keyboard, mouse and controller into ACTIONS. The game never reads a
   device directly: each fixed step it receives one action object per player:
     { move: -1..1, jump: bool, cast: bool, aim: radians, events: [...] }
   events: { type: 'load', el: 'fire' } and { type: 'clear' }.
   A second player's actions will later arrive over the network in this same
   form, so nothing in the game has to change for online play. */

const KInput = (() => {
  const { elements, elementOrder } = KData;
  const keys = new Set();
  let events = [];
  const mouse = { x: 0, y: 0, moved: false, left: false };
  let device = 'kbm';
  let aim = 0;
  let padPrev = [];
  let hooks = {};
  const keyToEl = {};
  for (const el of elementOrder) for (const k of elements[el].keys) keyToEl[k] = el;

  const PAD = { jump: [4, 6, 12], cast: [5, 7], clear: [13], pause: 9, help: 8 };

  function attach(target, h) {
    hooks = h;
    addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (hooks.blocked && hooks.blocked()) {
        if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyH') { e.preventDefault(); hooks.onClose && hooks.onClose(); }
        return;
      }
      device = 'kbm';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) { keys.add(e.code); return; }
      keys.add(e.code);
      if (keyToEl[e.code]) events.push({ type: 'load', el: keyToEl[e.code] });
      else if (e.code === 'KeyX') events.push({ type: 'clear' });
      else if (e.code === 'Escape' || e.code === 'KeyP') hooks.onPause && hooks.onPause();
      else if (e.code === 'KeyH') hooks.onHelp && hooks.onHelp();
      else if (e.code === 'Backspace') hooks.onReset && hooks.onReset();
    });
    addEventListener('keyup', e => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); mouse.left = false; });
    target.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; device = 'kbm';
    });
    target.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; device = 'kbm';
      if (e.button === 0) mouse.left = true;
      if (e.button === 2) events.push({ type: 'clear' });
    });
    addEventListener('pointerup', e => { if (e.button === 0) mouse.left = false; });
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
    const out = { move: 0, jump: false, cast: false, aim, events };
    events = [];

    const pad = readPad();
    let padMove = 0, padJump = false, padCast = false;
    if (pad) {
      const now = pad.buttons.map((b, i) => btn(pad, i));
      const pressed = i => now[i] && !padPrev[i];
      const lx = pad.axes[0] || 0, rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
      const anyPress = now.some((v, i) => v && !padPrev[i]);
      if (anyPress || Math.abs(lx) > 0.5 || Math.hypot(rx, ry) > 0.5) device = 'pad';
      if (device === 'pad') {
        for (const el of elementOrder) if (pressed(elements[el].pad)) out.events.push({ type: 'load', el });
        if (PAD.clear.some(pressed)) out.events.push({ type: 'clear' });
        if (pressed(PAD.pause)) hooks.onPause && hooks.onPause();
        if (pressed(PAD.help)) hooks.onHelp && hooks.onHelp();
        padMove = Math.abs(lx) > 0.22 ? lx : 0;
        if (now[14]) padMove = -1; if (now[15]) padMove = 1;
        padJump = PAD.jump.some(i => now[i]);
        padCast = PAD.cast.some(i => now[i]);
        if (Math.hypot(rx, ry) > 0.3) aim = Math.atan2(ry, rx);
        else if (Math.abs(lx) > 0.5) aim = lx > 0 ? 0 : Math.PI;
      }
      padPrev = now;
    }

    if (device === 'pad') {
      out.move = padMove; out.jump = padJump; out.cast = padCast;
    } else {
      const L = keys.has('KeyA') || keys.has('ArrowLeft'), R = keys.has('KeyD') || keys.has('ArrowRight');
      out.move = (R ? 1 : 0) - (L ? 1 : 0);
      out.jump = keys.has('KeyW') || keys.has('Space') || keys.has('ArrowUp');
      out.cast = mouse.left;
      if (mouse.moved) {
        const o = origin();
        if (o) aim = Math.atan2(mouse.y - o.y, mouse.x - o.x);
      }
    }
    out.aim = aim;
    return out;
  }

  function clearHeld() { keys.clear(); mouse.left = false; events = []; }
  function queue(e) { events.push(e); }

  return { attach, sample, clearHeld, queue, get device() { return device; }, mouse };
})();
