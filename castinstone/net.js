'use strict';
/* Cast in Stone — net.js
   Two-player co-op over a direct browser-to-browser connection (WebRTC).

   HOW THE TWO DEVICES STAY THE SAME. Each device runs the whole game itself.
   The only thing they send each other during play is button presses: one small
   message per step (60 a second). A press made now is used a few steps later
   (`delay`), which gives it time to reach the other device, and a device never
   runs a step until it has both players' presses for it. Because the rules use
   seeded dice and the same arithmetic everywhere (dmath.js), the same presses
   give the same game on both. Every two seconds both work out one number from
   the state of play (game.checksum) and compare; if they ever differ, the host
   sends the cave again and both start from it.

   STARTING. The guest sends its golem. The host stops, sends its save and a
   number for each chunk of its cave; the guest builds the cave from the seed,
   asks for the chunks whose numbers differ (everything dug or flooded since the
   cave was made), and both then build the same game on the same cave.

   CONNECTING. The two browsers first swap connection details through small
   mailboxes at coop.jza.app (the service MORPHOS uses; a message is deleted
   when collected, or after two minutes) and ask public STUN servers for their
   own internet address. After that everything goes directly between them.
   privacy.html says exactly this; keep it in step with this file. */

const KNet = (() => {
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('signal') === 'local';
  const SIGNAL = 'https://coop.jza.app';
  const ICE = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }] };
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: they read as 1 and 0
  const SUM_EVERY = 120, PART = 12000;
  const EMPTY = [0, 0, 0, 0, 90, null, null];

  let H = {};                 // hooks from main.js
  let pc = null, dc = null, role = null, state = 'off', code = '', session = 0;
  let me = 0, frame = 0, delay = 3, mine = new Map(), theirs = new Map(), sums = new Map(), theirSums = new Map();
  let syncAt = 0;   // when the two games began matching up (main.js gives up after a minute)
  let lastStep = 0, parts = {}, pend = null, resyncs = [], pingAt = 0, rtt = 60, epoch = 0;

  const say = (text, kind) => H.status && H.status(text, kind || '');
  const rnd = (n, set) => { let s = ''; const a = new Uint32Array(n); crypto.getRandomValues(a); for (const v of a) s += set[v % set.length]; return s; };

  // ----- the mailboxes -----
  async function sigSend(box, data) {
    if (LOCAL) { const k = 'cis-sig:' + box, a = JSON.parse(localStorage.getItem(k) || '[]'); a.push(data); localStorage.setItem(k, JSON.stringify(a)); return; }
    const r = await fetch(SIGNAL + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: box, msg: JSON.stringify(data) }), cache: 'no-store' });
    if (!r.ok) throw Error('signal ' + r.status);
  }
  async function sigRecv(box) {
    if (LOCAL) { const k = 'cis-sig:' + box, a = JSON.parse(localStorage.getItem(k) || '[]'); localStorage.removeItem(k); return a; }
    const r = await fetch(SIGNAL + '/recv?box=' + encodeURIComponent(box), { cache: 'no-store' });
    if (!r.ok) throw Error('signal ' + r.status);
    const out = []; for (const t of (await r.json()).messages || []) { try { out.push(JSON.parse(t)); } catch (e) {} }
    return out;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // a browser needs a moment to list every address it can be reached at
  const gathered = p => new Promise(done => {
    if (p.iceGatheringState === 'complete') return done();
    const t = setTimeout(done, 2500);
    p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(t); done(); } });
  });

  function reset() {
    session++;
    try { if (dc) dc.close(); } catch (e) {} try { if (pc) pc.close(); } catch (e) {}
    pc = dc = null; role = null; state = 'off'; code = ''; mine = new Map(); theirs = new Map(); sums = new Map(); theirSums = new Map(); parts = {}; pend = null; resyncs = [];
  }
  // the session is over: tell main.js, which puts each player back in their own game
  function end(why, quiet) {
    if (state === 'off') return;
    const was = state, r = role;
    if (!quiet) try { send({ t: 'bye' }); } catch (e) {}
    reset();
    H.ended && H.ended(why, was === 'on' || was === 'sync', r);
  }

  function wire(ch) {
    dc = ch; const my = session;
    dc.onopen = () => { if (my !== session) return; state = 'sync'; syncAt = performance.now(); if (role === 'guest') { say('Connected. Sending your golem…'); send({ t: 'hello', v: H.version, player: H.myPlayer() }); } else say('A friend has connected…'); };
    dc.onmessage = e => { if (my !== session) return; let m; try { m = JSON.parse(e.data); } catch (x) { return; } try { got(m); } catch (x) { console.error(x); end('Something went wrong in co-op, so it was stopped.'); } };
    dc.onclose = () => { if (my === session && state !== 'off') end('The connection to the other player was lost.', true); };
  }
  function send(m) { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(m)); }
  // a large message, in pieces
  async function sendBig(kind, obj) {
    const text = JSON.stringify(obj), n = Math.ceil(text.length / PART), my = session;
    for (let i = 0; i < n; i++) {
      while (dc && dc.bufferedAmount > 1500000) await wait(20);
      if (my !== session) return;
      send({ t: 'part', k: kind, i, n, d: text.slice(i * PART, (i + 1) * PART) });
    }
  }

  // ----- host: wait in a mailbox named after the code -----
  async function host() {
    reset(); role = 'host'; state = 'waiting'; me = 0; code = rnd(5, LETTERS);
    const my = session, box = 'cis-h-' + code, until = performance.now() + 15 * 60000; let down = false;
    say(`Your code is ${code}. Waiting for a friend to join…`, 'code');
    while (my === session && state === 'waiting' && performance.now() < until) {
      let offers = [];
      // v1.05: the code is only shown as usable while the connection service answers
      try { offers = await sigRecv(box); if (down) { down = false; say(`Your code is ${code}. Waiting for a friend to join…`, 'code'); } }
      catch (e) { down = true; say('The connection service cannot be reached, so nobody can join yet. Trying again…', 'bad'); await wait(2000); }
      if (my !== session || state !== 'waiting') return;
      const o = offers.find(m => m && typeof m.sdp === 'string' && typeof m.id === 'string');
      if (o) {
        try {
          pc = new RTCPeerConnection(ICE);
          pc.ondatachannel = e => wire(e.channel);
          await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
          await pc.setLocalDescription(await pc.createAnswer());
          await gathered(pc);
          if (my !== session) return;
          await sigSend(o.id, { sdp: pc.localDescription.sdp });
          state = 'connecting'; say('A friend is joining…');
          setTimeout(() => { if (my === session && state === 'connecting') end('The two browsers could not reach each other. Some networks block direct connections.'); }, 25000);
          return;
        } catch (e) { try { pc && pc.close(); } catch (x) {} pc = null; }
      }
      await wait(1500);
    }
    if (my === session && state === 'waiting') end('Nobody joined, so the code has expired. Host again for a new one.');
  }

  // ----- guest: leave an offer in the host's mailbox and wait for the answer -----
  async function join(text) {
    const c = String(text || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (c.length !== 5) { say('A code is five letters.', 'bad'); return; }
    reset(); role = 'guest'; state = 'connecting'; me = 1; code = c;
    const my = session, id = 'cis-g-' + rnd(20, 'abcdefghijklmnopqrstuvwxyz0123456789');
    say('Connecting…');
    try {
      pc = new RTCPeerConnection(ICE);
      wire(pc.createDataChannel('cis'));
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      if (my !== session) return;
      await sigSend('cis-h-' + c, { id, sdp: pc.localDescription.sdp });
      let answer = null;
      for (let i = 0; i < 30 && !answer && my === session; i++) { await wait(1000); answer = (await sigRecv(id)).find(m => m && typeof m.sdp === 'string'); }
      if (my !== session) return;
      if (!answer) return end('No game was found with that code. Check it with your friend; a code works while they are waiting on the Co-op page.');
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      setTimeout(() => { if (my === session && state === 'connecting') end('The two browsers could not reach each other. Some networks block direct connections.'); }, 25000);
    } catch (e) { if (my === session) end('The connection service cannot be reached. Check your internet connection and try again.'); }
  }

  // ----- starting from the same cave -----
  const b64 = a => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 4096) s += String.fromCharCode.apply(null, u.subarray(i, i + 4096)); return btoa(s); };
  const unb64 = t => { const s = atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

  // host: stop, and send the save and the cave's chunk numbers
  function beginSync(guestPlayer) {
    state = 'sync'; syncAt = performance.now(); say('Sending the cave…');
    const game = H.game(), data = KSave.serialize(game);
    data.chunks = {};
    rtt = Math.max(20, Math.min(400, rtt));
    delay = Math.max(2, Math.min(9, Math.ceil((rtt / 2 + 14) / (1000 / 60)) + 1));
    // v1.05: what a rebuild would otherwise reset: each hurt creature's health, the boss's, and where the guest stood
    const gq = game.players[1], live = { foes: game.enemies.filter(e => !e.dead && e.hp < e.maxHp).slice(0, 400).map(e => [e.id, Math.round(e.hp)]), boss: game.boss && !game.boss.dead ? Math.round(game.boss.hp) : null,
      guestAt: gq ? { x: Math.round(gq.x), y: Math.round(gq.y), checkpoint: gq.checkpoint } : null };
    pend = { save: JSON.parse(JSON.stringify(data)), guest: guestPlayer, live, syncSeed: (Math.random() * 2147483647) | 0, delay, epoch: epoch + 1 };
    sendBig('world', { ...pend, meta: game.world.meta(), hashes: b64(game.world.chunkHashes()) });
  }
  // both: build the game on the cave and reset the step count
  function build(world) {
    const game = KSave.restore(pend.save, world);
    if (!game) throw Error('save');
    const gp = game.addPlayer(pend.guest), lv = pend.live;
    if (lv && typeof lv === 'object') {
      if (Array.isArray(lv.foes)) for (const f of lv.foes.slice(0, 400)) { const e = Array.isArray(f) && game.enemies[f[0]]; if (e && !e.dead && Number.isFinite(f[1])) e.hp = Math.max(1, Math.min(e.maxHp, f[1])); }
      if (game.boss && Number.isFinite(lv.boss)) game.boss.hp = Math.max(1, Math.min(game.boss.maxHp, lv.boss));
      const at = lv.guestAt;
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y) && at.x > 8 && at.y > 8 && at.x < world.w - 8 && at.y < world.h - 8 && !game.collides(gp, at.x, at.y)) { gp.x = at.x; gp.y = at.y; if (Number.isInteger(at.checkpoint) && game.found.has(at.checkpoint)) gp.checkpoint = at.checkpoint; }
    }
    world.syncStart(pend.syncSeed);
    delay = pend.delay; epoch = pend.epoch; frame = 0; mine = new Map(); theirs = new Map(); sums = new Map(); theirSums = new Map();
    H.setGame(game, me);
    return game;
  }
  const okEvent = e => e && (e.type === 'load' ? typeof e.el === 'string' && Object.prototype.hasOwnProperty.call(KData.elements, e.el) : e.type === 'clear' || e.type === 'undo' || e.type === 'interact' ? true
    : e.type === 'ui' && typeof e.name === 'string' && e.name.length < 20 && Array.isArray(e.args) && e.args.length < 4 && e.args.every(v => Number.isFinite(v) || (typeof v === 'string' && /^[a-z]{1,16}$/.test(v))));

  function got(m) {
    switch (m.t) {
      case 'part': {   // pieces of a large message
        const p = parts[m.k] || (parts[m.k] = []);
        if (!Number.isInteger(m.i) || m.i < 0 || m.i > 4000 || typeof m.d !== 'string') return;
        p[m.i] = m.d;
        if (m.k === 'world' && role === 'guest') say(`Receiving the cave… ${Math.round(100 * (m.i + 1) / m.n)}%`);
        if (m.i === m.n - 1) { const text = p.join(''); delete parts[m.k]; got({ t: m.k, big: JSON.parse(text) }); }
        return;
      }
      case 'hello':   // host: a guest and its golem
        if (role !== 'host' || state !== 'sync' || pend) return;   // v1.02: only as a connection starts (a later one could rebuild the game with any golem)
        if (m.v !== H.version) { send({ t: 'no', why: `The host is on ${H.version} and you are on ${String(m.v).slice(0, 12)}. Both of you need to reload the page.` }); say('Your friend has a different version of the game. Both of you need to reload the page.', 'bad'); return; }
        pend = { guestFirst: m.player }; pingAt = performance.now(); send({ t: 'ping' });
        return;
      case 'ping': send({ t: 'pong' }); return;
      case 'pong': if (role === 'host' && pend && pend.guestFirst) { rtt = performance.now() - pingAt; const g = pend.guestFirst; H.pause(); beginSync(g); } return;
      case 'no': end(String(m.why || 'The host refused the connection.').slice(0, 300)); return;
      case 'world': {   // guest: the host's save; build the cave and ask for what differs
        if (role !== 'guest') return;
        state = 'sync'; syncAt = performance.now(); H.pause(); say('Building the cave…');
        const b = m.big, my = session;
        setTimeout(() => {   // after the message is on screen: building takes a second or two
          if (my !== session) return;
          try {
          pend = { save: b.save, guest: b.guest, live: b.live, syncSeed: b.syncSeed | 0, delay: Math.max(2, Math.min(9, b.delay | 0)), epoch: b.epoch | 0 };
          const w = new KWorld.World(b.save.seed, b.meta.lift | 0, (b.meta.act | 0) % KData.acts.length);
          w.adopt(b.meta);
          const theirsH = new Uint32Array(unb64(b.hashes).buffer), mineH = w.chunkHashes(), need = [];
          for (let k = 0; k < mineH.length; k++) if (mineH[k] !== theirsH[k]) need.push(k);
          pend.world = w; pend.need = need.length; pend.got = 0;
          send({ t: 'need', ids: need });
          if (!need.length) { build(w); send({ t: 'ready' }); }
          } catch (e) { end('The cave could not be built, so co-op was stopped.'); }   // v1.02: it hung on "Building the cave…"
        }, 60);
        return;
      }
      case 'need': {   // host: send those chunks
        if (role !== 'host' || !Array.isArray(m.ids)) return;
        const w = H.game().world, ids = m.ids.filter(k => Number.isInteger(k) && k >= 0 && k < w.cw * w.ch), my = session;
        (async () => {
          for (let i = 0; i < ids.length; i += 2) {
            while (dc && dc.bufferedAmount > 1500000) await wait(20);
            if (my !== session) return;
            const c = {}; for (const k of ids.slice(i, i + 2)) c[k] = w.packChunk(k);
            send({ t: 'chunks', c });
          }
        })();
        return;
      }
      case 'chunks': {
        if (role !== 'guest' || !pend || !pend.world) return;
        for (const k in m.c) { pend.world.unpackChunk(+k, m.c[k]); pend.got++; }
        say(`Receiving the cave… ${Math.round(100 * pend.got / Math.max(1, pend.need))}%`);
        if (pend.got >= pend.need) { build(pend.world); send({ t: 'ready' }); }
        return;
      }
      case 'ready':   // host: the guest has the cave; build the same game here and begin
        if (role !== 'host' || !pend || !pend.save) return;
        build(H.game().world); send({ t: 'go' }); begin();
        return;
      case 'go': if (role === 'guest') begin(); return;
      case 'i':   // the other player's presses for one step
        if (m.e === epoch && state === 'on' || (m.e === epoch && state === 'sync')) if (Number.isInteger(m.f) && Array.isArray(m.a) && m.f >= frame && m.f < frame + 600) theirs.set(m.f, m.a);
        return;
      case 's':
        if (m.e === epoch && Number.isInteger(m.f)) { theirSums.set(m.f, m.h); compare(m.f); }
        return;
      case 'resync': if (role === 'host' && state === 'on') resync(); return;
      case 'bye': end('The other player left.', true); return;
    }
  }
  function begin() { state = 'on'; pend = null; lastStep = performance.now(); say(''); H.started && H.started(role); }

  function compare(f) {
    if (!sums.has(f) || !theirSums.has(f)) return;
    const same = sums.get(f) === theirSums.get(f);
    sums.delete(f); theirSums.delete(f);
    if (same || state !== 'on') return;
    if (role === 'host') resync(); else send({ t: 'resync' });
  }
  // the two games have drifted apart: the host sends the cave again
  function resync() {
    const now = performance.now();
    resyncs = resyncs.filter(t => now - t < 120000); resyncs.push(now);
    if (resyncs.length > 5) return end('The two games kept drifting apart, so co-op was stopped. Your progress is saved.');
    H.note && H.note('Matching the two games up again…');
    const g = H.game();
    H.pause(); H.saveNow();
    beginSync(KSave.packPlayer(g.players[1]));
  }

  // ----- play: one step, if both players' presses for it are here -----
  // sample(): this device's action for a step. Returns true if a step was run.
  function step(sample) {
    if (state !== 'on') return false;
    if (frame >= delay && !theirs.has(frame)) return false;
    const a = sample(), ev = (a.events || []).filter(okEvent);
    const packed = [a.move || 0, a.moveY || 0, (a.jump ? 1 : 0) | (a.cast ? 2 : 0) | (a.burst ? 4 : 0) | (a.moveSpell ? 8 : 0) | (a.away ? 16 : 0), a.aim || 0, a.aimDist || 0, ev.length ? ev : null, Number.isFinite(a.tilt) ? a.tilt : null];
    mine.set(frame + delay, packed);
    send({ t: 'i', e: epoch, f: frame + delay, a: packed });
    const acts = [];
    acts[me] = unpack(mine.get(frame) || EMPTY); acts[1 - me] = unpack(theirs.get(frame) || EMPTY);
    mine.delete(frame); theirs.delete(frame);
    const game = H.game();
    game.step(acts);
    frame++; lastStep = performance.now();
    if (frame % SUM_EVERY === 0) { const h = game.checksum(); sums.set(frame, h); send({ t: 's', e: epoch, f: frame, h }); compare(frame); }
    return true;
  }
  const num = (v, lo, hi) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0;
  function unpack(a) {
    const b = a[2] | 0;
    return { move: num(a[0], -1, 1), moveY: num(a[1], -1, 1), jump: !!(b & 1), cast: !!(b & 2), burst: !!(b & 4), moveSpell: !!(b & 8), away: !!(b & 16), aim: num(a[3], -7, 7), aimDist: num(a[4], 0, 400), events: Array.isArray(a[5]) ? a[5].filter(okEvent).slice(0, 12) : [], tilt: Number.isFinite(a[6]) ? num(a[6], -1, 1) : undefined };
  }

  return {
    init(hooks) { H = hooks; },
    host, join, step,
    leave() { if (state !== 'off') end('You left co-op.'); },
    stop(why) { end(why); },
    get on() { return state === 'on'; },
    get busy() { return state !== 'off'; },
    get state() { return state; }, get role() { return role; }, get code() { return code; }, get me() { return me; },
    get behind() { return theirs.size - delay; },          // how many steps the other device is ahead of this one
    get syncFor() { return state === 'sync' ? performance.now() - syncAt : 0; },
    get waited() { return state === 'on' ? performance.now() - lastStep : 0; },   // ms since the last step ran
    get frame() { return frame; }, get delay() { return delay; }, get resyncs() { return resyncs.length; },
  };
})();
