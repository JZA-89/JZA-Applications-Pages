'use strict';
/* Cast in Stone prototype — save.js
   One ongoing world, saved in this browser (localStorage). A save holds the
   seed (which rebuilds the starting cave exactly), only the chunks that have
   changed since then (compressed), the golem's progress, and which Lodestones
   have been found. Saves are checked before they are stored (readable, complete), so a
   broken save never replaces a good one. */

const KSave = (() => {
  const KEY = 'castinstone.save.v1';
  const VERSION = 1;

  function serialize(game) {
    const p = game.players[0], w = game.world;
    return {
      v: VERSION, seed: game.seed, at: Date.now(),
      found: [...game.found], checkpoint: game.checkpoint,
      explored: btoa(String.fromCharCode(...packBits(w.explored))),
      chunks: w.saveChunks(),
      player: {
        x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), mana: Math.round(p.mana),
        level: p.level, xp: p.xp, points: p.points, alloc: p.alloc, slots: p.slots, skin: p.skin,
        runes: p.runes || null, inventory: p.inventory || null, shards: p.shards || 0,
      },
      extra: game.saveExtra ? game.saveExtra() : null,
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
  function restore(data) {
    if (!data || data.v !== VERSION || !Number.isFinite(data.seed)) return null;
    const game = new KGame.Game(data.seed);
    const w = game.world, p = game.players[0], s = data.player || {};
    w.loadChunks(data.chunks || {});
    if (data.explored) { const e = unpackBits(data.explored, w.explored.length); w.explored.set(e); }
    game.found = new Set((data.found || [0]).filter(id => id >= 0 && id < w.lodestones.length));
    game.found.add(0);
    game.checkpoint = game.found.has(data.checkpoint) ? data.checkpoint : 0;
    const num = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    p.level = num(s.level, 1, 999, 1); p.xp = num(s.xp, 0, 1e7, 0); p.points = num(s.points, 0, 9999, 0);
    p.alloc = {};
    for (const st of KData.progression.stats) if (s.alloc && Number.isFinite(s.alloc[st.id])) p.alloc[st.id] = num(s.alloc[st.id], 0, 999, 0);
    if (Array.isArray(s.slots)) p.slots = s.slots.map(e => KData.elements[e] ? e : null).slice(0, 2);
    if (Number.isFinite(s.skin)) p.skin = num(s.skin, 0, KData.golems.length - 1, 0);
    if (s.runes) p.runes = s.runes;
    if (s.inventory) p.inventory = s.inventory;
    p.shards = num(s.shards, 0, 1e7, 0);
    game.applyStats(p);
    p.hp = num(s.hp, 1, p.maxHp, p.maxHp); p.mana = num(s.mana, 0, p.maxMana, p.maxMana);
    // stand where the golem was, if that is still a free spot; otherwise at the checkpoint
    if (Number.isFinite(s.x) && Number.isFinite(s.y) && s.x > 8 && s.y > 8 && s.x < w.w - 8 && s.y < w.h - 8) {
      p.x = s.x; p.y = s.y;
      if (game.collides(p, p.x, p.y)) game.respawn(p);
    } else game.respawn(p);
    if (game.loadExtra && data.extra) game.loadExtra(data.extra);
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

  return { serialize, restore, store, load, exists, clear, KEY };
})();
