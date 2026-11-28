'use strict';
/* Cast in Stone — touch.js
   The on-screen controls for a phone or tablet. They only feed KInput's touch
   state (KInput.touch) and its event queue, so the game still receives plain
   actions and knows nothing about fingers.

   Left: a stick that appears where the thumb lands (run; push into dirt to dig).
   Right: Shot (large), Jump, Move and Burst round it, and the four elements in
   a row above with a button that takes off the last one.

   Aim: with no finger dragging, the golem aims by itself at the nearest
   creature it can see, else the way it is running (main.js `autoAim`). Press
   Shot and drag away from the middle of the button to aim by hand: the
   direction of the drag is the aim, and its length how far away a targeted
   special spell lands. */

const KTouch = (() => {
  function build(root) {
    const T = KInput.touch, { elements, elementOrder } = KData;
    root.innerHTML =
      `<div class="t-zone"><i class="t-base"><i class="t-knob"></i></i></div>
       <div class="t-els">${elementOrder.map(el => `<button type="button" class="t-btn t-el" data-el="${el}" style="--c:${elements[el].css}" aria-label="Add ${elements[el].name}">${KIcon(el)}</button>`).join('')}
         <button type="button" class="t-btn t-el t-undo" data-undo aria-label="Take off the last element"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/></svg></button></div>
       <div class="t-acts">
         <button type="button" class="t-btn t-burst" data-hold="burst" aria-label="Burst">${KIcon('burst')}</button>
         <button type="button" class="t-btn t-dash" data-hold="moveSpell" aria-label="Move">${KIcon('move')}</button>
         <button type="button" class="t-btn t-jump" data-hold="jump" aria-label="Jump and Lift">${KIcon('lift')}</button>
         <button type="button" class="t-btn t-shot" data-hold="cast" aria-label="Shot. Drag to aim"><i class="t-aim"></i>${KIcon('shot')}</button>
       </div>`;
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    // v0.97: iOS's own touch handling (the magnifying loupe on a held or double tap, text selection) never starts on the
    // controls: every control here is driven by pointer events, so the touches themselves can be cancelled
    for (const type of ['touchstart', 'touchend']) root.addEventListener(type, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    root.addEventListener('contextmenu', stop);

    // ----- the run stick
    const zone = root.querySelector('.t-zone'), base = zone.querySelector('.t-base'), knob = zone.querySelector('.t-knob');
    let stickId = null, sx = 0, sy = 0;
    const reach = () => base.offsetWidth * 0.5;
    const stickEnd = e => {
      if (e && e.pointerId !== stickId) return;
      stickId = null; T.move = 0; T.moveY = 0; T.tilt = 0;
      base.classList.remove('on'); base.style.removeProperty('--x'); base.style.removeProperty('--y'); knob.style.removeProperty('--kx'); knob.style.removeProperty('--ky');
    };
    zone.addEventListener('pointerdown', e => {
      stop(e);
      if (stickId !== null) return;
      stickId = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch {}
      const r = zone.getBoundingClientRect(); sx = e.clientX; sy = e.clientY;
      base.style.setProperty('--x', (sx - r.left) + 'px'); base.style.setProperty('--y', (sy - r.top) + 'px'); base.classList.add('on');
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== stickId) return;
      const R = reach(); let dx = (e.clientX - sx) / R, dy = (e.clientY - sy) / R; const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      knob.style.setProperty('--kx', (dx * R) + 'px'); knob.style.setProperty('--ky', (dy * R) + 'px');
      T.move = Math.abs(dx) > 0.22 ? dx : 0; T.moveY = dy > 0.6 ? 1 : dy < -0.6 ? -1 : 0;
      T.tilt = Math.abs(dy) > 0.25 ? Math.max(-1, Math.min(1, dy * 1.3)) : 0;   // which way a tunnel slopes while digging
    });
    zone.addEventListener('pointerup', stickEnd); zone.addEventListener('pointercancel', stickEnd);

    // ----- the held buttons; Shot is also the aim
    const ends = [() => stickEnd()];
    for (const b of root.querySelectorAll('[data-hold]')) {
      const name = b.dataset.hold, aims = name === 'cast', dot = b.querySelector('.t-aim');
      let id = null;
      const end = e => {
        if (e && e.pointerId !== id) return;
        id = null; T[name] = false; b.classList.remove('on');
        if (aims) { T.aim = null; b.classList.remove('aiming'); dot.style.removeProperty('--kx'); dot.style.removeProperty('--ky'); }
      };
      ends.push(() => end());
      b.addEventListener('pointerdown', e => { stop(e); if (id !== null) return; id = e.pointerId; try { b.setPointerCapture(e.pointerId); } catch {} T[name] = true; b.classList.add('on'); });
      b.addEventListener('pointermove', e => {
        if (!aims || e.pointerId !== id) return;
        const r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy), dead = r.width * 0.3;
        if (d < dead && T.aim === null) return;   // a plain press keeps the automatic aim
        if (d < 4) return;
        const far = Math.min(1, Math.max(0, (d - dead) / (r.width * 1.3)));
        T.aim = Math.atan2(dy, dx); T.dist = 36 + 150 * far;
        b.classList.add('aiming'); const k = Math.min(d, r.width * 0.8);
        dot.style.setProperty('--kx', (dx / d * k) + 'px'); dot.style.setProperty('--ky', (dy / d * k) + 'px');
      });
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
    }
    // ----- the taps
    for (const b of root.querySelectorAll('[data-el]')) b.addEventListener('pointerdown', e => { stop(e); KInput.queue({ type: 'load', el: b.dataset.el }); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120); });
    root.querySelector('[data-undo]').addEventListener('pointerdown', e => { stop(e); KInput.queue({ type: 'undo' }); });
    return { release() { for (const f of ends) f(); } };
  }
  return { build };
})();
