'use strict';
/* Cast in Stone prototype — audio.js
   Every sound is made in code with the Web Audio API (oscillators and
   filtered noise): no sound files. The game reports what happened as named
   sounds with a position; this file plays them, quieter and panned with
   distance from the listener. Held spells (water jet, scald, steam, hover,
   drill) get a sound that runs while they are held. Starts on the first
   click (browsers only allow sound after one), mutable with M or the
   sound button, and remembered. */

const KAudio = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  try { muted = localStorage.getItem('castinstone.mute') === '1'; } catch {}
  const loops = new Map();

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('castinstone.mute', m ? '1' : '0'); } catch {}
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
  }

  // ----- building blocks -----
  function out(vol, pan) {
    const g = ctx.createGain(); g.gain.value = vol;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); p.connect(master); }
    else g.connect(master);
    return g;
  }
  function tone(type, f0, f1, dur, vol, pan, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out(vol, pan)); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(filter, f0, f1, q, dur, vol, pan, delay = 0) {
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    fl.type = filter; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out(vol, pan)); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ----- the sounds -----
  const S = {
    fireball: (v, p) => { noise('bandpass', 400, 1800, 1.2, 0.25, v * 0.5, p); tone('sawtooth', 180, 90, 0.2, v * 0.12, p); },
    explosion: (v, p) => { noise('lowpass', 1600, 120, 0.7, 0.7, v * 0.9, p); tone('sine', 110, 38, 0.5, v * 0.7, p); },
    bigboom: (v, p) => { noise('lowpass', 1200, 60, 0.7, 1.1, v, p); tone('sine', 80, 28, 0.9, v * 0.9, p); },
    water: (v, p) => { noise('lowpass', 900, 500, 1, 0.3, v * 0.4, p); },
    splash: (v, p) => { noise('bandpass', 1200, 300, 1.5, 0.35, v * 0.55, p); },
    earth: (v, p) => { noise('lowpass', 500, 90, 1, 0.35, v * 0.8, p); tone('sine', 90, 45, 0.3, v * 0.5, p); },
    rumble: (v, p) => { noise('lowpass', 300, 80, 1, 0.5, v * 0.6, p); },
    bolt: (v, p) => { noise('highpass', 2500, 1200, 0.5, 0.18, v * 0.6, p); tone('square', 900, 120, 0.12, v * 0.15, p); noise('bandpass', 5000, 3000, 2, 0.08, v * 0.4, p, 0.05); },
    shock: (v, p) => { for (let k = 0; k < 4; k++) noise('highpass', 3000, 1500, 0.6, 0.06, v * 0.4, p, k * 0.035); },
    whoosh: (v, p) => { noise('bandpass', 300, 1500, 1.5, 0.3, v * 0.5, p); },
    blink: (v, p) => { tone('sine', 400, 1600, 0.15, v * 0.3, p); noise('highpass', 4000, 2000, 1, 0.1, v * 0.3, p); },
    mud: (v, p) => { noise('lowpass', 600, 200, 4, 0.25, v * 0.6, p); tone('sine', 140, 90, 0.18, v * 0.3, p); },
    magma: (v, p) => { tone('sine', 200, 70, 0.25, v * 0.35, p); noise('lowpass', 700, 200, 2, 0.3, v * 0.35, p); },
    spear: (v, p) => { noise('bandpass', 2000, 700, 3, 0.18, v * 0.5, p); tone('triangle', 600, 200, 0.15, v * 0.2, p); },
    lance: (v, p) => { tone('sawtooth', 1200, 400, 0.18, v * 0.18, p); noise('bandpass', 2500, 1500, 2, 0.15, v * 0.35, p); },
    nova: (v, p) => { noise('lowpass', 2000, 200, 0.8, 0.5, v * 0.8, p); tone('sawtooth', 220, 80, 0.4, v * 0.2, p); },
    hit: (v, p) => { noise('lowpass', 1400, 300, 1, 0.12, v * 0.6, p); tone('sine', 160, 90, 0.1, v * 0.4, p); },
    hurt: (v, p) => { noise('lowpass', 900, 150, 1, 0.22, v * 0.8, p); tone('square', 120, 60, 0.18, v * 0.25, p); },
    crumble: (v, p) => { for (let k = 0; k < 5; k++) noise('lowpass', 900 - k * 120, 150, 1, 0.12, v * 0.45, p, k * 0.05); },
    shard: (v, p) => { tone('sine', 1800 + Math.random() * 600, 2400, 0.12, v * 0.18, p); },
    rune: (v, p) => { [660, 880, 1320].forEach((f, k) => tone('triangle', f, f, 0.25, v * 0.25, p, k * 0.07)); },
    cache: (v, p) => { [523, 659, 784, 1046].forEach((f, k) => tone('triangle', f, f, 0.35, v * 0.28, p, k * 0.08)); },
    level: (v, p) => { [392, 523, 659, 784].forEach((f, k) => tone('triangle', f, f * 1.002, 0.45, v * 0.3, p, k * 0.1)); },
    stone: (v, p) => { [262, 392, 523].forEach((f, k) => tone('sine', f, f, 1.2, v * 0.25, p, k * 0.04)); },
    nomana: (v, p) => { tone('square', 220, 180, 0.08, v * 0.12, p); },
    // warnings: an enemy is about to attack
    warnCrawler: (v, p) => { for (let k = 0; k < 3; k++) tone('square', 900 + k * 120, 700, 0.04, v * 0.08, p, k * 0.06); },
    warnMoth: (v, p) => { tone('sine', 300, 900, 0.5, v * 0.18, p); },
    warnDelver: (v, p) => { noise('lowpass', 250, 120, 1, 0.5, v * 0.8, p); },
    warnSpitter: (v, p) => { noise('bandpass', 800, 2400, 3, 0.45, v * 0.3, p); },
    warnWarden: (v, p) => { tone('sawtooth', 70, 55, 0.8, v * 0.35, p); },
    slam: (v, p) => { noise('lowpass', 900, 60, 0.7, 0.8, v, p); tone('sine', 70, 30, 0.7, v * 0.9, p); },
    bubble: (v, p) => { for (let k = 0; k < 5; k++) tone('sine', 120 + Math.random() * 120, 60, 0.12, v * 0.35, p, k * 0.14); },
    roar: (v, p) => { tone('sawtooth', 160, 60, 0.9, v * 0.45, p); noise('lowpass', 800, 150, 1, 0.9, v * 0.6, p); },
    stirs: (v, p) => { tone('sawtooth', 55, 45, 1.6, v * 0.4, p); noise('lowpass', 200, 80, 1, 1.6, v * 0.5, p); },
  };
  // held spells: a filtered noise that runs while they are held
  const LOOPS = {
    jet: { type: 'lowpass', f: 900, q: 0.8, vol: 0.22 },
    cone: { type: 'bandpass', f: 2500, q: 0.8, vol: 0.2 },
    thrust: { type: 'highpass', f: 1800, q: 0.5, vol: 0.2 },
    hover: { type: 'lowpass', f: 600, q: 1, vol: 0.2 },
    drill: { type: 'bandpass', f: 220, q: 2, vol: 0.4 },
    climb: { type: 'lowpass', f: 300, q: 2, vol: 0.12 },
  };

  // play a game sound at world (x, y), heard from (lx, ly)
  function play(name, x, y, lx, ly, vol = 1) {
    if (!ctx || muted || !S[name]) return;
    const dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy);
    const v = vol * Math.max(0, 1 - d / 320);
    if (v < 0.03) return;
    S[name](v, dx / 200);
  }
  // keep held-spell sounds matching what is being held
  function hold(active) {
    if (!ctx) return;
    for (const [key, L] of loops) if (!active.has(key)) { L.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); L.s.stop(ctx.currentTime + 0.2); loops.delete(key); }
    for (const key of active) {
      if (loops.has(key) || muted) continue;
      const D = LOOPS[key]; if (!D) continue;
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; fl.type = D.type; fl.frequency.value = D.f; fl.Q.value = D.q;
      g.gain.value = 0; g.gain.setTargetAtTime(D.vol, ctx.currentTime, 0.04);
      s.connect(fl); fl.connect(g); g.connect(master); s.start();
      loops.set(key, { s, g });
    }
  }

  return { start, play, hold, setMuted, get muted() { return muted; } };
})();
