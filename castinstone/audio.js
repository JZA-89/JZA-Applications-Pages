'use strict';
/* Cast in Stone — audio.js
   Every sound is made in code with the Web Audio API (oscillators and
   filtered noise): no sound files. The game reports what happened as named
   sounds with a position; this file plays them, quieter and panned with
   distance from the listener. Held spells (water jet, scald, steam, hover,
   drill) get a sound that runs while they are held. Starts on the first
   click (browsers only allow sound after one), mutable with M or the
   sound button, and remembered.

   Music is made the same way, with no files: a calm piece for the cave
   (slow soft chords, a low hum, and single bell notes like drips, in a long
   echo) and an ominous one for a boss or champion (a low growling drone,
   clashing notes, and a slow heartbeat drum). They cross-fade over a couple
   of seconds. Notes are scheduled a little ahead on the audio clock, and
   nothing is scheduled while the page is hidden. N or the music button turns
   music off and on (remembered); M silences everything. */

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
    buildMusic();
  }

  // ---------- music ----------
  let musicOn = true, mood = 'cave', mus = null;
  try { musicOn = localStorage.getItem('castinstone.music') !== '0'; } catch {}
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);   // a note number to its frequency
  // the cave: five open, gentle chords (note numbers), about 14 s each
  const CAVE_CHORDS = [[50, 57, 64, 65], [46, 53, 57, 62], [53, 60, 67, 69], [48, 55, 62, 64], [45, 52, 55, 60]];
  const DRIPS = [74, 77, 79, 81, 84, 86, 89];          // high notes for the bell drips
  // the boss: low notes that clash
  const BOSS_CHORDS = [[38, 44, 51], [38, 45, 53, 56], [37, 44, 50], [38, 44, 53, 55]];

  function buildMusic() {
    const out = ctx.createGain(); out.gain.value = musicOn ? 0.6 : 0; out.connect(master);
    // a long echo, made from fading noise
    const len = Math.floor(ctx.sampleRate * 3.2), imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const verb = ctx.createConvolver(); verb.buffer = imp;
    const wet = ctx.createGain(); wet.gain.value = 0.55; verb.connect(wet); wet.connect(out);
    const bus = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(out); g.connect(verb); return g; };
    const cave = bus(), boss = bus();
    const drone = (dest, type, f, vol, cutoff) => {
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cutoff; g.gain.value = vol;
      o.connect(fl); fl.connect(g); g.connect(dest); o.start();
      return fl;
    };
    drone(cave, 'sine', hz(38), 0.07, 400);
    // the boss's growl: two low saws through a filter that slowly opens and closes
    const growl = drone(boss, 'sawtooth', hz(26), 0.16, 150);
    drone(boss, 'sawtooth', hz(38) * 1.006, 0.07, 190);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.09; lg.gain.value = 55; lfo.connect(lg); lg.connect(growl.frequency); lfo.start();
    mus = { out, cave, boss, nextChord: 0, chord: 0, nextDrip: 0, nextBossChord: 0, bossChord: 0, nextBeat: 0, beat: 0, nextBell: 0 };
    setInterval(musicTick, 120);
  }
  // one soft held note: two slightly detuned oscillators, slow in and slow out
  function pad(dest, f, t, dur, vol, type, cutoff, attack) {
    const fl = ctx.createBiquadFilter(), g = ctx.createGain();
    fl.type = 'lowpass'; fl.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.setValueAtTime(vol, t + dur - attack); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const cents of [-5, 5]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents; o.connect(fl); o.start(t); o.stop(t + dur + 0.1); }
    fl.connect(g); g.connect(dest);
  }
  // a bell: a quick start and a long fade
  function bell(dest, f, t, vol, decay) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g);
    o.connect(g); g.connect(dest); o.start(t); o2.start(t); o.stop(t + decay + 0.1); o2.stop(t + decay + 0.1);
  }
  // the heartbeat drum: a low note that drops in pitch
  function thump(dest, t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(82, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.5);
  }
  function musicTick() {
    if (!ctx || !mus || ctx.state !== 'running') return;
    const now = ctx.currentTime, on = musicOn && !muted && !document.hidden;
    mus.cave.gain.setTargetAtTime(on && mood === 'cave' ? 1 : 0, now, 0.9);
    mus.boss.gain.setTargetAtTime(on && mood === 'boss' ? 1 : 0, now, 0.6);
    if (!on) { mus.nextChord = mus.nextDrip = mus.nextBossChord = mus.nextBeat = mus.nextBell = 0; return; }
    const ahead = now + 0.4;
    if (mood === 'cave') {
      if (mus.nextChord < now) mus.nextChord = now + 0.1;
      if (mus.nextDrip < now) mus.nextDrip = now + 2;
      while (mus.nextChord < ahead) {
        const ch = CAVE_CHORDS[mus.chord++ % CAVE_CHORDS.length];
        ch.forEach((m, i) => pad(mus.cave, hz(m), mus.nextChord + i * 0.6, 17, 0.05, i < 2 ? 'sine' : 'triangle', 900, 4.5));
        mus.nextChord += 13;
      }
      while (mus.nextDrip < ahead) {
        const n = DRIPS[(Math.random() * DRIPS.length) | 0];
        bell(mus.cave, hz(n), mus.nextDrip, 0.05 + Math.random() * 0.03, 3);
        if (Math.random() < 0.35) bell(mus.cave, hz(n + (Math.random() < 0.5 ? 7 : 5)), mus.nextDrip + 0.42, 0.035, 2.6);
        mus.nextDrip += 2.2 + Math.random() * 4.5;
      }
    } else if (mood === 'boss') {
      if (mus.nextBossChord < now) mus.nextBossChord = now + 0.05;
      if (mus.nextBeat < now) { mus.nextBeat = now + 0.1; mus.beat = 0; }
      if (mus.nextBell < now) mus.nextBell = now + 3;
      while (mus.nextBossChord < ahead) {
        const ch = BOSS_CHORDS[mus.bossChord++ % BOSS_CHORDS.length];
        ch.forEach(m => pad(mus.boss, hz(m), mus.nextBossChord, 9, 0.045, 'sawtooth', 520, 2.5));
        mus.nextBossChord += 7.5;
      }
      // eight steps to the bar: a heavy beat, its echo, and two lighter ones
      while (mus.nextBeat < ahead) {
        const st = mus.beat++ % 8;
        if (st === 0) thump(mus.boss, mus.nextBeat, 0.6); else if (st === 1) thump(mus.boss, mus.nextBeat, 0.34);
        else if (st === 4) thump(mus.boss, mus.nextBeat, 0.45); else if (st === 6) thump(mus.boss, mus.nextBeat, 0.22);
        mus.nextBeat += 0.36;
      }
      while (mus.nextBell < ahead) {
        const n = [69, 70, 75, 63][(Math.random() * 4) | 0];
        bell(mus.boss, hz(n), mus.nextBell, 0.04, 4); bell(mus.boss, hz(n + 1), mus.nextBell + 0.03, 0.03, 4);
        mus.nextBell += 4 + Math.random() * 5;
      }
    }
  }
  function setMood(m) { mood = m; }
  // for testing: how loud each piece is right now (0 to 1 on its fader, and the measured level of the music)
  function probe() {
    if (!mus) return null;
    if (!mus.an) { mus.an = ctx.createAnalyser(); mus.an.fftSize = 2048; mus.out.connect(mus.an); mus.buf = new Float32Array(2048); }
    mus.an.getFloatTimeDomainData(mus.buf);
    let sum = 0; for (const v of mus.buf) sum += v * v;
    return { state: ctx.state, mood, cave: +mus.cave.gain.value.toFixed(2), boss: +mus.boss.gain.value.toFixed(2), level: +Math.sqrt(sum / mus.buf.length).toFixed(4) };
  }
  function setMusic(on) {
    musicOn = on;
    try { localStorage.setItem('castinstone.music', on ? '1' : '0'); } catch {}
    if (mus) mus.out.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.2);
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
    spot: (v, p) => { tone('triangle', 1500, 950, 0.09, v * 0.4, p); tone('sine', 2200, 1600, 0.06, v * 0.2, p); },   // a shot on a weak spot: a bright crack over the usual hit
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
    lthrust: { type: 'highpass', f: 1500, q: 0.5, vol: 0.2 },
    lhover: { type: 'lowpass', f: 600, q: 1, vol: 0.2 },
    lcolumn: { type: 'lowpass', f: 260, q: 2, vol: 0.3 },
    lglide: { type: 'bandpass', f: 1200, q: 0.6, vol: 0.1 },
    lmagnet: { type: 'bandpass', f: 140, q: 4, vol: 0.3 },
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

  // The cave's own sound (v0.67): fire crackles, magma rumbles and blorps, acid hisses, each as loud as how
  // much of it is on screen (levels 0 to 1 from main.js, counted by the renderer). Loops fade in and out;
  // the crackles and bubbles are short sounds scattered at random.
  const AMB = { fire: { type: 'bandpass', f: 1700, q: 0.7, vol: 0.09 }, magma: { type: 'lowpass', f: 130, q: 1.5, vol: 0.32 }, acid: { type: 'highpass', f: 5200, q: 0.4, vol: 0.05 } };
  const amb = new Map();
  function ambience(levels) {
    if (!ctx) return;
    for (const k in AMB) {
      const lv = muted ? 0 : Math.max(0, Math.min(1, levels[k] || 0));
      let L = amb.get(k);
      if (!L && lv > 0.01) {
        const D = AMB[k], s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noiseBuf; s.loop = true; fl.type = D.type; fl.frequency.value = D.f; fl.Q.value = D.q; g.gain.value = 0;
        s.connect(fl); fl.connect(g); g.connect(master); s.start(); L = { s, g }; amb.set(k, L);
      }
      if (L) L.g.gain.setTargetAtTime(AMB[k].vol * lv, ctx.currentTime, 0.35);
    }
    if (muted) return;
    const r = Math.random, f = levels.fire || 0, m = levels.magma || 0, a = levels.acid || 0;
    if (r() < f * 0.3) noise('highpass', 2500 + r() * 3500, 1800, 1, 0.025 + r() * 0.03, 0.08 + 0.12 * f * r(), (r() - 0.5) * 0.8);
    if (r() < m * 0.035) tone('sine', 80 + r() * 90, 45, 0.16 + r() * 0.1, 0.22 * m, (r() - 0.5) * 0.6);
    if (r() < a * 0.07) tone('sine', 1100 + r() * 900, 2600, 0.04, 0.04 + 0.04 * a, (r() - 0.5) * 0.6);
  }

  return { start, play, hold, ambience, setMuted, setMood, setMusic, probe, get muted() { return muted; }, get music() { return musicOn; } };
})();
