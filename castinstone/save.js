'use strict';
/* Cast in Stone — save.js
   One ongoing world, saved in this browser (localStorage). A save holds the
   seed (which rebuilds the starting cave exactly), only the chunks that have
   changed since then (compressed), the golem's progress, and which Lodestones
   have been found. Saves are checked before they are stored (readable, complete), so a
   broken save never replaces a good one. */

const KSave = (() => {
  const KEY = 'castinstone.save.v8';   // v5: new materials in the cave (v0.64); older saves do not fit
  const VERSION = 1;

  // a golem's progress (also what a guest brings to a co-op game, and takes home)
  function packPlayer(p) {
    return {
      x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), mana: Math.round(p.mana),
      level: p.level, xp: p.xp, points: p.points, alloc: p.alloc, queue: p.queue, known: p.known, skin: p.skin,
      runes: p.runes || null, inventory: p.inventory || null, shards: p.shards || 0, bought: p.bought || 0,
    };
  }
  function serialize(game) {
    const p = game.players[0], w = game.world;
    return {
      v: VERSION, seed: game.seed, depth: game.depth, at: Date.now(),
      found: [...game.found], checkpoint: game.checkpoint,
      explored: btoa(String.fromCharCode(...packBits(w.explored))),
      chunks: w.saveChunks(),
      player: packPlayer(p),
      extra: game.saveExtra ? game.saveExtra() : null,
      loot: game.loot.map(L => ({ x: Math.round(L.x), y: Math.round(L.y), rune: L.rune })),
    };
  }

  function packBits(arr) {
    const out = new Uint8Array(Math.ceil(arr.length / 8));
    for (let i = 0; i < arr.length; i++) if (arr[i]) out[i >> 3] |= 1 << (i & 7);
    return out;
  }
  function unpackBits(str, n) {
    const s = atob(str), out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
    return out;
  }

  // Rebuild a game from a save. Returns the game, or null if the save is unusable.
  function applyPlayer(game, p, s) {
    const num = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    p.level = num(s.level, 1, 999, 1); p.xp = num(s.xp, 0, 1e7, 0); p.points = num(s.points, 0, 9999, 0);
    p.alloc = {};
    for (const st of KData.progression.stats) if (s.alloc && Number.isFinite(s.alloc[st.id])) p.alloc[st.id] = num(s.alloc[st.id], 0, 999, 0);
    const q = Array.isArray(s.queue) ? s.queue : Array.isArray(s.slots) ? s.slots : [];   // slots: saves from before recipes
    p.queue = q.filter(e => KData.elements[e]).slice(0, KData.recipe.max);
    if (Array.isArray(s.known)) p.known = s.known.filter(k => KData.specials[k]);
    if (Number.isFinite(s.skin)) p.skin = num(s.skin, 0, KData.golems.length - 1, 0);
    const RU = KData.runes;
    const okRune = r => r && RU.types[r.type] && Number.isInteger(r.tier) && r.tier >= 0 && r.tier < RU.tiers.length && Number.isFinite(r.level)
      ? { id: String(r.id || ''), type: r.type, tier: r.tier, level: num(r.level, 1, 99, 1) } : null;
    if (s.runes) for (const slot of RU.slots) { const r = okRune(s.runes[slot]); p.runes[slot] = r && RU.types[r.type].slot === slot ? r : null; }
    if (Array.isArray(s.inventory)) p.inventory = s.inventory.map(okRune).filter(Boolean).slice(0, RU.bag);
    p.shards = num(s.shards, 0, 1e7, 0); p.bought = num(s.bought, 0, 999, 0);
    game.applyStats(p);
    p.hp = num(s.hp, 1, p.maxHp, p.maxHp); p.mana = num(s.mana, 0, p.maxMana, p.maxMana);
  }
  const okRuneOf = r => { const RU = KData.runes; return r && RU.types[r.type] && Number.isInteger(r.tier) && r.tier >= 0 && r.tier < RU.tiers.length && Number.isFinite(r.level) ? { id: String(r.id || ''), type: r.type, tier: r.tier, level: Math.max(1, Math.min(99, r.level)) } : null; };

  // world: in co-op, a cave already built (the host's), used as it is
  function restore(data, world) {
    if (!data || data.v !== VERSION || !Number.isFinite(data.seed)) return null;
    const game = new KGame.Game(data.seed, world, data.depth);
    const w = game.world, p = game.players[0], s = data.player || {};
    if (!world) w.loadChunks(data.chunks || {});
    if (data.explored) { const e = unpackBits(data.explored, w.explored.length); w.explored.set(e); }
    game.found = new Set((data.found || [0]).filter(id => id >= 0 && id < w.lodestones.length));
    game.found.add(0);
    game.checkpoint = game.found.has(data.checkpoint) ? data.checkpoint : 0;
    applyPlayer(game, p, s);
    const num = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    // stand where the golem was, if that is still a free spot; otherwise at the checkpoint
    if (Number.isFinite(s.x) && Number.isFinite(s.y) && s.x > 8 && s.y > 8 && s.x < w.w - 8 && s.y < w.h - 8) {
      p.x = s.x; p.y = s.y;
      if (game.collides(p, p.x, p.y)) game.respawn(p);
    } else game.respawn(p);
    if (game.loadExtra && data.extra) game.loadExtra(data.extra);
    // runestones lying in the cave
    if (Array.isArray(data.loot)) for (const L of data.loot.slice(0, 60)) { const r = okRuneOf(L.rune); if (r && Number.isFinite(L.x) && Number.isFinite(L.y)) game.loot.push({ x: L.x, y: L.y, vx: 0, vy: 0, rune: r, t: 1 }); }
    return game;
  }

  function valid(d) {
    if (!d || d.v !== VERSION || !Number.isFinite(d.seed) || !d.player || !Number.isFinite(d.player.level)) return false;
    for (const k in d.chunks) { const parts = d.chunks[k].split('|'); if (parts.length !== 2) return false; atob(parts[0]); atob(parts[1]); }
    return true;
  }

  function store(game) {
    try {
      const data = serialize(game);
      const text = JSON.stringify(data);
      // check before storing (cheaply: rebuilding the cave would freeze the game)
      if (!valid(JSON.parse(text))) return false;
      localStorage.setItem(KEY, text);
      return text.length;
    } catch (e) { return false; }
  }
  function load() {
    try { const t = localStorage.getItem(KEY); return t ? restore(JSON.parse(t)) : null; } catch (e) { return null; }
  }
  function exists() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // After co-op as a guest: put the golem's progress into this device's own save, leaving its own cave
  // (and where the golem stood in it) as they were. With no save yet, a new cave is started for it.
  function storeGuest(p) {
    try {
      const mine = packPlayer(p); delete mine.x; delete mine.y;
      let data = null;
      try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
      if (!data || data.v !== VERSION || !Number.isFinite(data.seed)) data = { v: VERSION, seed: (Math.random() * 1e9) | 0, at: Date.now(), found: [0], checkpoint: 0, chunks: {}, player: {}, extra: null, loot: [] };
      data.player = Object.assign(mine, Number.isFinite(data.player && data.player.x) ? { x: data.player.x, y: data.player.y } : {});
      data.at = Date.now();
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }

  return { serialize, restore, store, load, exists, clear, KEY, packPlayer, applyPlayer, storeGuest };
})();
