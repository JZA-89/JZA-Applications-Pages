'use strict';
/* Cast in Stone prototype — game.js
   The rules: players, training dummies, spells, projectiles, particles and
   actor physics. game.step(actions) advances everything by one fixed step,
   where actions[i] is player i's action object from input.js (or, later,
   from the network). Nothing here reads a device or draws anything. */

const KGame = (() => {
  const { M, spells, spellKey, player: PD, dummy: DD, step: DT } = KData;
  const { World, makeRng, STATE, SOLID, ST } = KWorld;
  const counts = new Int32Array(KData.materials.length);
  const MUD_COAT = 2.5;     // seconds a mud hit keeps slowing
  // what stops spells: anything solid, and mud (you can wade through mud, spells cannot)
  const BLOCKS = m => SOLID[m] === 1 || m === M.MUD;
  const MUD_SLOW = 0.35;    // enemy speed while in mud or coated

  class Game {
    constructor(seed) { this.seed = seed; this.found = new Set(); this.opened = new Set(); this.defeated = new Set(); this.cores = new Set(); this.checkpoint = 0; this.events = []; this.reset(); }

    // Build (or rebuild) the cave from the seed. keepPlayers keeps the golems'
    // progress (levels, stats, runestones) and puts them at their checkpoint.
    reset(keepPlayers) {
      const kept = keepPlayers ? this.players : null, explored = keepPlayers && this.world ? this.world.explored : null;
      this.world = new World(this.seed);
      if (explored) this.world.explored.set(explored);
      this.rand = makeRng(this.seed + 17);
      this.time = 0;
      this.projectiles = [];
      this.parts = [];
      this.fx = [];
      this.growths = [];
      this._special = {};
      this.storms = [];   // special spells that last a while (never saved)
      this.loot = [];
      this.sounds = [];   // [name, x, y, volume], played and cleared by main.js
      this.hitStop = 0;   // a brief freeze on heavy blows (main.js)
      this.shake = 0;
      this.players = kept || [this.makePlayer(0)];
      if (kept) for (const p of kept) this.respawn(p);
      else { this.found = new Set([0]); this.opened = new Set(); this.defeated = new Set(); this.cores = new Set(); this.checkpoint = 0; }
      this.makeBoss();
      this.bits = [];   // shards flying to a player
      this.dummies = this.world.dummySpots.map((s, i) => this.makeDummy(s, i));
      this.enemies = this.world.enemyHomes.map((home, i) => this.makeEnemy(home, i));
    }

    get actors() { const a = this.players.concat(this.dummies, this.enemies); if (this.boss && !this.boss.dead) a.push(this.boss); return a; }

    makePlayer(id) {
      const s = this.world.spawn;
      const chips = [];
      for (let i = 0; i < 64; i++) chips.push(i);
      for (let i = chips.length - 1; i > 0; i--) { const j = (this.rand() * (i + 1)) | 0; [chips[i], chips[j]] = [chips[j], chips[i]]; }
      return {
        kind: 'player', id, x: s.x, y: s.y, vx: 0, vy: 0, w: PD.w, h: PD.h,
        hp: PD.hp, maxHp: PD.hp, grounded: false, facing: 1, aim: 0,
        slots: [null, null], queue: [], known: [], cds: {}, lock: 0, mana: PD.mana, maxMana: PD.mana, manaWait: 0, manaFlash: 0,
        stats: KData.baseStats(), skin: 0,
        coyote: 0, jumpBuf: 0, jumpHeld: false, rising: false, castHeld: false,
        channels: { shot: null, burst: null, lift: null, move: null }, dashT: 0, dashVX: 0, dashVY: 0, dashHit: null,
        dead: false, respawnT: 0, lastHurt: -9, flash: 0, slotFlash: 0, lastSpell: null,
        chips, inWater: false, inMud: false, hurtBy: {},
        level: 1, xp: 0, points: 0, alloc: {}, regenMul: 1,
        runes: { head: null, core: null, arms: null, legs: null }, inventory: [], traits: new Set(), shotCount: 0, shards: 0, speedMul: 1,
      };
    }

    // ---------- getting stronger ----------
    // Stats come from points spent (alloc); derived values are rebuilt from them.
    applyStats(p) {
      // points spent plus what the equipped runestones add
      const a = { ...p.alloc }, RU = KData.runes;
      p.traits = new Set();
      for (const slot of RU.slots) {
        const r = p.runes && p.runes[slot];
        if (!r || !RU.types[r.type]) continue;
        const T = RU.types[r.type];
        for (const k in T.stats) a[k] = (a[k] || 0) + RU.value(T.stats[k], r.tier, r.level);
        if (T.trait) p.traits.add(T.trait);
      }
      const v = id => a[id] || 0;
      p.speedMul = 1 + 0.05 * v('speed');
      p.stats.attack = 10 + v('attack');
      p.stats.defence = 10 + v('defence');
      for (const el of KData.elementOrder) p.stats.power[el] = 1 + 0.06 * v(el);
      const hpFrac = p.hp / p.maxHp, mFrac = p.mana / p.maxMana;
      p.maxHp = PD.hp + 10 * v('vitality');
      p.maxMana = PD.mana + 10 * v('mana');
      p.hp = Math.min(p.maxHp, Math.max(1, hpFrac * p.maxHp));
      p.mana = Math.min(p.maxMana, mFrac * p.maxMana);
      p.regenMul = 1 + 0.08 * v('focus');
    }
    // ---------- runestones ----------
    makeRune(level, opts = {}) {
      const RU = KData.runes, R = this.rand;
      const pool = Object.keys(RU.types).filter(k => opts.type ? k === opts.type : !RU.types[k].rare);
      const type = pool[(R() * pool.length) | 0];
      const tier = opts.tier ?? RU.tierFor(level, R());
      return { id: ((R() * 1e9) | 0).toString(36), type, tier, level: Math.max(1, level | 0) };
    }
    dropRune(x, y, rune) {
      this.loot.push({ x, y, vx: (this.rand() - 0.5) * 60, vy: -90, rune, t: 0 });
    }
    // loose runestones fall, rest, and are picked up by touch
    lootTick() {
      const w = this.world, RU = KData.runes;
      for (const L of this.loot) {
        L.t += DT;
        // runestones float on water and magma (so a drop is never lost at the bottom of a lake)
        const inLiquid = KWorld.STATE[w.get(Math.round(L.x), Math.round(L.y))] === KWorld.ST.liquid;
        L.vy = inLiquid ? Math.max(L.vy - 600 * DT, -40) : Math.min(L.vy + 300 * DT, 200);
        const nx = L.x + L.vx * DT, ny = L.y + L.vy * DT;
        if (!SOLID[w.get(Math.round(nx), Math.round(ny))]) { L.x = nx; L.y = ny; }
        else { L.vx *= -0.3; L.vy = 0; if (!SOLID[w.get(Math.round(L.x), Math.round(L.y) + 1)]) L.y += 0.5; }
        L.vx *= Math.exp(-2 * DT);
        if (L.t < 0.4) continue;
        for (const p of this.players) {
          if (p.dead || Math.abs(p.x - L.x) > 10 || Math.abs((p.y - p.h / 2) - L.y) > 14) continue;
          if (p.inventory.length >= RU.bag) { if (!L.fullWarned) { this.events.push({ type: 'toast', text: 'Your bag of runestones is full. Break some at a Lodestone.' }); L.fullWarned = true; } continue; }
          p.inventory.push(L.rune); L.taken = true; this.sfx('rune', L.x, L.y);
          const T = RU.types[L.rune.type];
          this.events.push({ type: 'toast', kind: 'loot', text: `Found: ${T.name} · ${RU.tiers[L.rune.tier].name} · level ${L.rune.level}` });
          this.events.push({ type: 'save' });
          break;
        }
      }
      this.loot = this.loot.filter(L => !L.taken);
    }
    // ---------- treasure: shards from crystal, relic caches ----------
    treasureTick() {
      const w = this.world, T = KData.treasure;
      // each broken crystal cell throws out a shard that flies to the nearest player
      // (at most 400 in flight; the rest wait their turn instead of being lost)
      let k = 0;
      for (; k < w.broken.length && this.bits.length < 400; k += 2) this.bits.push({ x: w.broken[k] + 0.5, y: w.broken[k + 1] + 0.5, vx: (this.rand() - 0.5) * 120, vy: -40 - this.rand() * 80, t: 0 });
      w.broken.splice(0, k);
      for (const b of this.bits) {
        b.t += DT;
        let tgt = null, best = 160;
        for (const p of this.players) { if (p.dead) continue; const d = Math.hypot(p.x - b.x, p.y - p.h / 2 - b.y); if (d < best) { best = d; tgt = p; } }
        if (tgt && b.t > 0.25) {
          const dx = tgt.x - b.x, dy = tgt.y - tgt.h / 2 - b.y, d = Math.hypot(dx, dy) || 1, a = 900;
          b.vx += dx / d * a * DT; b.vy += dy / d * a * DT;
          b.vx *= Math.exp(-2 * DT); b.vy *= Math.exp(-2 * DT);
          if (d < 6) { tgt.shards = (tgt.shards || 0) + 1; b.done = true; this.events.push({ type: 'shard' }); if (this.time - (this.shardSndAt || -1) > 0.05) { this.shardSndAt = this.time; this.sfx('shard', b.x, b.y, 0.7); } }
        } else { b.vy += 200 * DT; b.vx *= Math.exp(-3 * DT); }
        b.x += b.vx * DT; b.y += b.vy * DT;
        if (b.t > 6) b.done = true;
      }
      this.bits = this.bits.filter(b => !b.done);
      // caches open at a touch
      for (const c of w.caches) {
        if (this.opened.has(c.id)) continue;
        for (const p of this.players) {
          if (p.dead || Math.abs(p.x - c.x) > 9 || Math.abs(p.y - c.y) > 10) continue;
          this.openCache(p, c);
          break;
        }
      }
    }
    openCache(p, c) {
      const T = KData.treasure, RU = KData.runes;
      this.opened.add(c.id);
      const shards = T.shards(c.level);
      p.shards = (p.shards || 0) + shards;
      // a runestone a grade better than a drop would usually be; deep caches may hold the Crucible
      const crucible = this.rand() < T.crucibleChance(c.level) && !this.hasRune(p, 'crucible');
      const rune = crucible ? this.makeRune(c.level, { type: 'crucible', tier: 2 }) : this.makeRune(c.level, { tier: Math.min(2, RU.tierFor(c.level, this.rand()) + 1) });
      if (p.inventory.length < RU.bag) p.inventory.push(rune); else this.dropRune(c.x, c.y - 6, rune);
      this.events.push({ type: 'toast', kind: 'loot', text: `Relic cache opened · ${RU.types[rune.type].name} (${RU.tiers[rune.tier].name}) · ${shards} shards` });
      if (this.rand() < 0.7) this.tome(p);
      this.gainXp(p, T.xp(c.level), 'cache');
      this.sfx('cache', c.x, c.y);
      this.burst(c.x, c.y - 4, 24, [[255, 211, 122], [255, 240, 200]], 120);
      this.fx.push({ kind: 'flash', x: c.x, y: c.y - 4, r: 30, t: 0, T: 0.4, color: [255, 211, 122] });
      this.events.push({ type: 'save' });
    }
    // ---------- special spells ----------
    learn(p, id, how) {
      if (p.known.includes(id)) return false;
      p.known.push(id);
      this.events.push({ type: 'learn', id, how });
      this.events.push({ type: 'save' });
      return true;
    }
    // a tome teaches one special spell you do not know: one of the three cheapest, or a named one
    tome(p, id) {
      const S = KData.specials;
      if (!id || p.known.includes(id)) {
        const left = Object.keys(S).filter(k => !p.known.includes(k)).sort((a, b) => S[a].cost - S[b].cost).slice(0, 3);
        if (!left.length) return;
        id = left[(this.rand() * left.length) | 0];
      }
      this.learn(p, id, 'tome');
    }
    meteor(p, S, x, y) {
      const w = this.world;
      let sy = y;
      for (let k = 0; k < 150 && sy > 4 && !BLOCKS(w.get(Math.round(x), Math.round(sy - 1))); k++) sy--;
      const sp = { radius: S.radius, power: S.power, knock: 300, ignite: 0.6, color: [255, 150, 52] };
      this.projectiles.push({ kind: 'fireball', sp, key: 'earth+fire', owner: p, x, y: sy + 3, vx: (this.rand() - 0.5) * 16, vy: 230, g: 220, age: 0 });
      this.fx.push({ kind: 'flash', x, y: sy + 3, r: 20, t: 0, T: 0.25, color: [255, 150, 60] });
    }
    castSpecial(p, id) {
      const S = KData.specials[id], w = this.world, R = this.rand;
      this.learn(p, id, 'typed');
      const c = this.chest(p), dx = Math.cos(p.aim), dy = Math.sin(p.aim);
      const aimAt = () => { const h = w.ray(c.x, c.y, dx, dy, S.range); return { x: h.hit ? h.lx : h.x, y: h.hit ? h.ly : h.y }; };
      const ring = (x, y, r, color) => { this.fx.push({ kind: 'ring', x, y, r0: 3, r1: r, t: 0, T: 0.3, color }); this.fx.push({ kind: 'flash', x, y, r: r + 10, t: 0, T: 0.2, color }); };
      if (id === 'geyser') {
        const t = aimAt();
        let gy = t.y; for (let k = 0; k < 90 && !KWorld.SOLID[w.get(Math.round(t.x), Math.round(gy + 1))]; k++) gy++;
        this.hitRadius(t.x, gy - 8, S.radius, S.power, 0, p, p, 'water+fire');
        for (const o of this.actors) if (o !== p && !o.dead && Math.abs(o.x - t.x) < S.radius && Math.abs(o.y - gy) < S.radius + 6) o.vy = Math.min(o.vy, -300);
        for (let k = 0; k < 60; k++) this.parts.push({ x: t.x + (R() - 0.5) * 8, y: gy - 1, vx: (R() - 0.5) * 60, vy: -200 - R() * 220, g: 380, mat: R() < 0.7 ? M.WATER : M.STEAM, life: 3, owner: p });
        for (let k = 0; k < 40; k++) { const x = Math.round(t.x + (R() - 0.5) * 8), y = Math.round(gy - R() * 40); if (w.get(x, y) === M.EMPTY) w.set(x, y, M.STEAM); }
        ring(t.x, gy - 6, S.radius, [200, 220, 255]);
        this.sfx('splash', t.x, gy, 1.2); this.sfx('whoosh', t.x, gy, 1);
        this.shake = Math.max(this.shake, 2);
      } else if (id === 'haste') {
        p.hasteT = S.time;
        ring(p.x, p.y - 8, 20, [255, 220, 140]); this.sfx('blink', p.x, p.y, 1);
      } else if (id === 'phase') {
        const c0 = { x: p.x, y: p.y - p.h / 2 };
        for (let d = S.dist; d >= 6; d -= 1) {
          const x = p.x + dx * d, y = p.y + dy * d;
          if (x > 8 && y > 20 && x < w.w - 8 && y < w.h - 8 && !this.collides(p, x, y)) { p.x = x; p.y = y; break; }
        }
        p.vx *= 0.2; p.vy = 0; p.safeT = 0.6;
        this.fx.push({ kind: 'bolt', pts: this.jagged(c0.x, c0.y, p.x, p.y - p.h / 2), t: 0, T: 0.25, color: [200, 196, 255] });
        ring(p.x, p.y - 8, 16, [200, 196, 255]); this.sfx('blink', p.x, p.y, 1);
      } else if (id === 'meteor') {
        const t = aimAt();
        this.meteor(p, S, t.x, t.y); this.sfx('whoosh', t.x, t.y, 1);
      } else if (id === 'cataclysm') {
        const t = aimAt();
        this.storms.push({ kind: 'meteors', x: t.x, y: t.y, t: S.count * 0.45, next: 0, left: S.count, owner: p });
        this.sfx('stirs', p.x, p.y, 1);
      } else if (id === 'quake') {
        for (const o of this.actors) {
          if (o === p || o.dead || o.kind === 'player') continue;
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d > S.radius) continue;
          this.hurt(o, S.power * (1 - d / S.radius * 0.5), Math.sign(o.x - p.x) * 60, -170, 'quake', p, 'earth+earth+earth+water');
          o.slowT = Math.max(o.slowT || 0, 2.5);
        }
        for (let k = 0; k < 14; k++) {
          const x = p.x + (R() - 0.5) * 2 * S.radius;
          let y = p.y - 12, n = 0;
          while (n++ < 90 && !KWorld.SOLID[w.get(Math.round(x), Math.round(y))]) y--;
          if (n < 90 && n > 6) for (let j = 0; j < 6; j++) this.parts.push({ x: x + (R() - 0.5) * 8, y: y + 2, vx: (R() - 0.5) * 30, vy: R() * 40, g: 380, mat: M.EARTH, life: 4, owner: p });
        }
        ring(p.x, p.y - 4, 60, [196, 152, 136]);
        this.sfx('bigboom', p.x, p.y, 1); this.sfx('rumble', p.x, p.y, 1);
        this.shake = Math.max(this.shake, 6);
      } else if (id === 'stoneskin') {
        p.skinT = S.time;
        ring(p.x, p.y - 8, 18, [190, 196, 210]); this.sfx('earth', p.x, p.y, 1);
      } else if (id === 'thunderstorm') {
        const t = aimAt();
        this.storms.push({ kind: 'storm', x: t.x, y: t.y, t: S.time, next: 0.2, owner: p });
        this.sfx('stirs', t.x, t.y, 0.8);
      }
    }
    updateStorms() {
      if (!this.storms.length) return;
      const w = this.world, R = this.rand, SP = KData.specials;
      for (const s of this.storms) {
        s.t -= DT; s.next -= DT;
        if (s.kind === 'meteors') {
          if (s.next <= 0 && s.left > 0) { s.left--; s.next = 0.45; this.meteor(s.owner, SP.cataclysm, s.x + (R() - 0.5) * 2 * SP.cataclysm.spread, s.y); this.sfx('whoosh', s.x, s.y, 0.8); }
          continue;
        }
        const S = SP.thunderstorm;
        // rain
        for (let k = 0; k < 2; k++) {
          const x = s.x + (R() - 0.5) * 2 * S.radius;
          let y = s.y; for (let n = 0; n < 60 && !BLOCKS(w.get(Math.round(x), Math.round(y - 1))); n++) y--;
          this.parts.push({ x, y: y + 1, vx: 0, vy: 160, g: 200, mat: M.WATER, life: 3, owner: s.owner });
        }
        if (s.next > 0) continue;
        s.next = S.every;
        const near = this.actors.filter(o => !o.dead && o.kind !== 'player' && Math.hypot(o.x - s.x, o.y - s.y) < S.radius);
        let tx, ty, target = null;
        if (near.length) { target = near[(R() * near.length) | 0]; tx = target.x; ty = target.y - target.h / 2; }
        else { tx = s.x + (R() - 0.5) * 2 * S.radius; ty = s.y; for (let n = 0; n < 60 && !BLOCKS(w.get(Math.round(tx), Math.round(ty + 1))); n++) ty++; }
        let top = ty; for (let n = 0; n < 90 && !BLOCKS(w.get(Math.round(tx), Math.round(top - 1))); n++) top--;
        this.fx.push({ kind: 'bolt', pts: this.jagged(tx + (R() - 0.5) * 10, top, tx, ty), t: 0, T: 0.18, color: [190, 230, 255] });
        this.fx.push({ kind: 'flash', x: tx, y: ty, r: 16, t: 0, T: 0.15, color: [190, 230, 255] });
        if (target) { target.wetT = KData.statuses.wet.time; this.hurt(target, S.power, 0, -30, 'bolt', s.owner, 'lightning+water'); }
        this.sfx('bolt', tx, ty, 0.8);
      }
      this.storms = this.storms.filter(s => s.t > 0);
    }

    hasRune(p, type) { return Object.values(p.runes).some(r => r && r.type === type) || p.inventory.some(r => r.type === type); }
    describeTreasure(wx, wy) {
      for (const c of this.world.caches) if (Math.abs(wx - c.x) < 6 && wy > c.y - 7 && wy < c.y + 1) {
        const how = { buried: 'Buried in the dirt. Dig to it.', rock: 'Sealed inside rock. Only fire that melts rock reaches it.', magma: 'At the bottom of a magma pool. Wade, or cool the magma with water and dig.', flooded: 'At the bottom of a flooded basin. Swim down to it.', high: 'High in the ceiling. Fly, climb or build up to it.' }[c.kind];
        return this.opened.has(c.id) ? ['Relic cache (empty)', 'Already opened.'] : [`Relic cache · Level ${c.level}`, `${how} Touch it to open it.`];
      }
      return null;
    }
    treasureDots(dot, pk) {
      const w = this.world;
      for (const c of w.caches) if (!this.opened.has(c.id) && w.explored[(c.y >> 5) * w.cw + (c.x >> 5)]) dot(c.x, c.y - 3, pk(255, 211, 122), true);
    }
    // the Forge: shards buy stat points and raise a worn runestone's level
    buyPoint(p) {
      const cost = KData.treasure.pointCost(p.bought || 0);
      if ((p.shards || 0) < cost) return false;
      p.shards -= cost; p.bought = (p.bought || 0) + 1; p.points++;
      return true;
    }
    levelUpRune(p, slot) {
      const r = p.runes[slot], T = KData.treasure;
      if (!r || r.level >= T.maxRuneLevel) return false;
      const cost = T.levelUpCost(r);
      if ((p.shards || 0) < cost) return false;
      p.shards -= cost; r.level++;
      this.applyStats(p);
      return true;
    }
    saveExtra() { return { opened: [...this.opened], defeated: [...this.defeated], cores: [...this.cores] }; }
    loadExtra(x) {
      if (!x) return;
      if (Array.isArray(x.opened)) this.opened = new Set(x.opened.filter(Number.isInteger));
      if (Array.isArray(x.defeated)) this.defeated = new Set(x.defeated.filter(id => KData.bosses[id]));
      if (Array.isArray(x.cores)) this.cores = new Set(x.cores.filter(c => typeof c === 'string'));
      if (this.boss && this.defeated.has(this.boss.type)) this.boss = null;
    }

    // ---------- the Emberwyrm ----------
    makeBoss() {
      const L = this.world.lair;
      this.boss = null;
      if (!L || this.defeated.has(L.boss)) return;
      const B = KData.bosses[L.boss], lv = L.level - 1, stats = KData.baseStats();
      stats.attack = B.attack + B.perLevel.attack * lv; stats.defence = B.defence + B.perLevel.defence * lv;
      const hp = Math.round(B.hp * (1 + B.perLevel.hp * lv));
      const x = L.x, y = L.surface + 18;
      this.boss = { kind: 'boss', type: L.boss, boss: true, level: L.level, x, y, vx: 0, vy: 0, w: 18, h: 12, segR: 6,
        hp, maxHp: hp, stats, dead: false, state: 'swim', t: 0, flash: 0, engaged: false, awayT: 0, raged: false, touchT: 0,
        trail: Array.from({ length: 80 }, (_, i) => ({ x: x - i * 2, y })), facing: 1, lastHurt: -9 };
    }
    // distance from (x, y) to the nearest part of the wyrm
    bossNearest(b, x, y) {
      let best = { x: b.x, y: b.y - 6, d: Math.hypot(b.x - x, b.y - 6 - y) };
      for (let i = 4; i < b.trail.length; i += 5) { const s = b.trail[i], d = Math.hypot(s.x - x, s.y - y); if (d < best.d) best = { x: s.x, y: s.y, d }; }
      return best;
    }
    bossNear(b, x, y) { return this.bossNearest(b, x, y).d; }
    lakeTop(x) {
      // the highest magma cell in this column of the lair
      const L = this.world.lair, w = this.world;
      for (let y = Math.floor(L.y - L.ry); y < L.y + L.ry * 2; y++) if (w.get(Math.round(x), y) === M.MAGMA) return y;
      return null;
    }
    // open lake below (x, y): the first thing straight down is magma
    openLakeBelow(x, y) {
      const w = this.world;
      for (let yy = Math.round(y); yy < w.h - 2; yy++) { const m = w.get(Math.round(x), yy); if (m === M.MAGMA) return yy; if (SOLID[m]) return null; }
      return null;
    }
    bossTick() {
      const b = this.boss;
      if (!b || b.dead) return;
      const B = KData.bosses[b.type], L = this.world.lair, w = this.world;
      b.flash = Math.max(0, b.flash - DT); b.t += DT; b.touchT = Math.max(0, b.touchT - DT);
      if (b.wetT > 0) b.wetT -= DT;
      if (b.slowT > 0) b.slowT -= DT;
      if (b.burnT > 0) b.burnT -= DT;
      const inLair = q => ((q.x - L.x) / (L.rx * 1.15)) ** 2 + ((q.y - L.y) / (L.ry * 1.5)) ** 2 < 1;
      let p = null, best = 1e9;
      for (const q of this.players) if (!q.dead && inLair(q)) { const d = Math.hypot(q.x - b.x, q.y - b.y); if (d < best) { best = d; p = q; } }
      if (!p) {
        b.awayT += DT;
        if (b.engaged && b.awayT > B.reset) {
          // calm again: heals, and returns to the deepest magma in its lair
          b.engaged = false; b.hp = b.maxHp; b.state = 'swim'; b.stranded = false;
          if (w.get(Math.round(b.x), Math.round(b.y - 6)) !== M.MAGMA) {
            let best = null;
            for (let x = Math.floor(L.x - L.rx); x <= L.x + L.rx && !best; x += 3) for (let y = Math.floor(L.y + L.ry * 1.6); y > L.surface; y -= 2) if (w.get(x, y) === M.MAGMA && w.get(x, y - 6) === M.MAGMA) { best = { x, y }; break; }
            if (best) { b.x = best.x; b.y = best.y + 6; b.trail.forEach(s => { s.x = best.x; s.y = best.y; }); }
          }
        }
      } else {
        b.awayT = 0;
        if (!b.engaged) { b.engaged = true; this.events.push({ type: 'toast', kind: 'big', text: `${B.name} stirs in the magma` }); this.sfx('stirs', b.x, b.y, 1.4); }
      }
      const set = s => { b.state = s; b.t = 0; };
      const headIn = () => w.get(Math.round(b.x), Math.round(b.y - 6));
      const swimTo = (tx, ty, speed) => {
        const dx = tx - b.x, dy = ty - (b.y - 6), d = Math.hypot(dx, dy);
        if (d < 1) return;
        const sx = dx / d * speed * DT, sy = dy / d * speed * DT;
        const ok = (x, y) => w.get(Math.round(x), Math.round(y - 6)) === M.MAGMA;
        if (ok(b.x + sx, b.y + sy)) { b.x += sx; b.y += sy; }
        else if (ok(b.x + sx, b.y)) b.x += sx;
        else if (ok(b.x, b.y + sy)) b.y += sy;
        b.facing = sx >= 0 ? 1 : -1;
      };
      // below half health the lake rises once and it strikes more often
      if (b.engaged && !b.raged && b.hp < b.maxHp * B.rageAt) {
        b.raged = true;
        for (let x = Math.floor(L.x - L.rx * 1.1); x <= L.x + L.rx * 1.1; x++) {
          const top = this.lakeTop(x);
          if (top == null) continue;
          for (let k = 1; k <= B.rise; k++) if (w.get(x, top - k) === M.EMPTY) { w.set(x, top - k, M.MAGMA); w.life[(top - k) * w.w + x] = 255; }
        }
        this.events.push({ type: 'toast', kind: 'big', text: 'The magma lake rises' });
        this.sfx('bigboom', b.x, b.y, 1.3);
        this.shake = Math.max(this.shake, 3);
      }
      if (!b.engaged || (!p && b.state !== 'breach' && b.state !== 'stranded')) {
        // nobody in the lair: it circles under the surface
        if (b.state !== 'swim' && b.state !== 'stranded') set('swim');
        if (headIn() === M.MAGMA) swimTo(L.x + Math.sin(this.time * 0.3) * L.rx * 0.5, L.surface + 20, B.swim * 0.4);
        else b.y += 60 * DT;
      } else switch (b.state) {
        case 'swim': {
          // cooled all round: stranded
          if (headIn() !== M.MAGMA) {
            // just above the surface (after spitting): sink back in; no magma anywhere near (the lake cooled): stranded
            let near = false;
            for (let dy = 0; dy <= 14 && !near; dy += 2) for (let dx = -8; dx <= 8; dx += 4) if (w.get(Math.round(b.x + dx), Math.round(b.y - 6 + dy)) === M.MAGMA) { near = true; break; }
            if (near) { b.y += 80 * DT; break; }
            b.strandFor = B.strand; set('stranded'); b.stranded = true; b.vy = 0; this.events.push({ type: 'toast', text: `${B.name} is stranded` }); break;
          }
          const top = this.lakeTop(p.x) ?? L.surface;
          swimTo(p.x, top + 14, B.swim);
          if (b.t > (b.raged ? 1.3 : 2.1)) {
            // pick where to come up: beside you, with nothing between that spot and you
            const spot = (offsets) => {
              for (const o of offsets) {
                const tx = p.x + p.vx * 0.3 + o, tt = this.lakeTop(tx);
                if (tt == null) continue;
                const dx = p.x - tx, dy = (p.y - p.h - 2) - (tt - 4), d = Math.hypot(dx, dy) || 1;
                if (!w.ray(tx, tt - 4, dx / d, dy / d, d).hit) return { x: tx, y: tt };
              }
              return null;
            };
            if (this.rand() < 0.62) {
              const t = spot([26, -26, 40, -40, 14, -14, 56, -56, 0]);
              if (t) { b.target = t; set('bubble'); this.sfx('bubble', t.x, t.y, 1.2); } else set('spit');
            } else {
              // spitting lobs over edges, so it only needs some distance from you
              b.target = null;
              for (const o of [70, -70, 90, -90, 55, -55, 110, -110]) { const tt = this.lakeTop(p.x + o); if (tt != null) { b.target = { x: p.x + o, y: tt }; break; } }
              set('spit');
            }
          }
          break;
        }
        case 'bubble': {
          // the warning: the magma bubbles where it will breach
          swimTo(b.target.x, b.target.y + 10, B.swim * 1.6);
          if (this.rand() < 0.5) this.burst(b.target.x + (this.rand() - 0.5) * 16, b.target.y - 1, 1, [[255, 196, 96], [255, 120, 40]], 60);
          if (b.t > B.bubble) {
            // a leap sized to reach just above you (not the ceiling)
            const rise = Math.max(24, (b.y - 6) - (p.y - p.h / 2) + 14);
            b.vy = -Math.min(B.breachUp, Math.sqrt(2 * B.gravity * rise));
            const tApex = -b.vy / B.gravity;
            b.vx = Math.max(-B.breach, Math.min(B.breach, (p.x - b.x) / (tApex * 1.15)));
            b.hitDone = false;
            this.burst(b.x, b.y - 6, 26, [[255, 196, 96], [255, 120, 40]], 160);
            this.shake = Math.max(this.shake, 2);
            this.sfx('roar', b.x, b.y, 1.3);
            set('breach');
          }
          break;
        }
        case 'breach': {
          b.vy += B.gravity * DT;
          // past the top of its leap it steers back towards the lake
          if (b.vy > 0) {
            let tx = null;
            for (let d = 0; d < 160 && tx == null; d += 4) for (const s of [Math.sign(b.vx) || 1, -(Math.sign(b.vx) || 1)]) if (this.openLakeBelow(b.x + s * d, b.y - 6) != null) { tx = b.x + s * d; break; }
            if (tx != null) b.vx += Math.sign(tx - b.x) * Math.min(Math.abs(tx - b.x) * 6, 600) * DT;
          }
          b.x += b.vx * DT; b.y += b.vy * DT;
          b.facing = b.vx >= 0 ? 1 : -1;
          // bonk on a ceiling or a wall on the way up
          if (b.vy < 0 && SOLID[headIn()]) { b.y -= b.vy * DT; b.vy = 30; }
          const m = headIn();
          if (b.vy > 0 && m === M.MAGMA && b.t > 0.3) { this.burst(b.x, b.y - 6, 20, [[255, 196, 96], [255, 120, 40]], 140); set('swim'); }
          else if (b.vy > 0 && SOLID[m]) {
            // landed on something that is not magma
            for (let k = 0; k < 20 && SOLID[w.get(Math.round(b.x), Math.round(b.y - 6))]; k++) b.y--;
            // magma close by: it is only stunned for a moment; none (the lake cooled): truly stranded
            let near = false;
            for (let d = -40; d <= 40 && !near; d += 4) { const top = this.lakeTop(b.x + d); if (top != null && top - b.y < 70 && top - b.y > -30) near = true; }
            b.strandFor = near ? 1.1 : B.strand;
            b.stranded = true; this.shake = Math.max(this.shake, 3);
            if (!near) this.events.push({ type: 'toast', text: `${B.name} is stranded` });
            set('stranded');
          }
          if (b.y > w.h - 20 || b.t > 4) { b.strandFor = 1.1; b.stranded = true; set('stranded'); }
          break;
        }
        case 'stranded': {
          // flops on the ground; after a while wriggles towards the lake and drops back in
          const below = w.get(Math.round(b.x), Math.round(b.y - 5 + 6));
          if (!SOLID[below] && below !== M.MAGMA) b.y += 110 * DT;
          if (headIn() === M.MAGMA && b.t > 0.5) { b.stranded = false; set('swim'); break; }
          if (b.t > (b.strandFor || B.strand)) {
            let tx = null;
            for (let d = 4; d < 400 && tx == null; d += 3) for (const s of [1, -1]) if (this.openLakeBelow(b.x + s * d, b.y - 4) != null) { tx = b.x + s * d; break; }
            if (tx == null) tx = L.x;
            b.x += Math.sign(tx - b.x) * 34 * DT; b.facing = Math.sign(tx - b.x) || 1;
            // can't go on: slip down through whatever is underneath
            if (b.t > (b.strandFor || B.strand) + 6) b.y += 40 * DT;
          }
          break;
        }
        case 'spit': {
          // swims to a spot with a clear line to you, rises and spits a volley of magma
          if (b.t < 0.05) b.goT = 0;
          if (b.target && Math.abs(b.target.x - b.x) > 4 && (b.goT += DT) < 1.6) { swimTo(b.target.x, b.target.y + 10, B.swim * 1.8); b.t = 0.06; break; }
          const top = this.lakeTop(b.x) ?? L.surface;
          b.y += ((top + 2) - b.y) * Math.min(1, 4 * DT);
          b.facing = Math.sign(p.x - b.x) || 1;
          const n = b.raged ? B.spitCountRage : B.spitCount;
          b.spat = b.spat || 0;
          if (b.t > 0.6 + b.spat * 0.3 && b.spat < n) {
            b.spat++;
            const mx = b.x + b.facing * 9, my = b.y - 10, dx = p.x + (this.rand() - 0.5) * 24 - mx, dy = (p.y - 6) - my, g = 380, v = 230;
            const disc = v ** 4 - g * (g * dx * dx + 2 * dy * v * v);
            // a high lob that comes down on you over ledges
            const an = disc >= 0 ? Math.atan2(v * v + Math.sqrt(disc), g * Math.abs(dx)) : Math.PI / 3;
            this.sfx('magma', mx, my, 0.9);
            this.projectiles.push({ kind: 'blob', sp: { power: B.globPower, count: B.glob, mat: 'MAGMA' }, key: 'earth+fire', owner: b, x: mx, y: my, vx: Math.cos(an) * v * Math.sign(dx || 1), vy: -Math.sin(an) * v, g, age: 0 });
          }
          if (b.spat >= n && b.t > 0.6 + n * 0.3 + 0.4) { b.spat = 0; set('swim'); }
          break;
        }
      }
      // never below the bottom of its lair
      b.y = Math.min(b.y, L.y + L.ry * 1.9);
      // the body follows the head
      const h0 = b.trail[0];
      if (Math.hypot(b.x - h0.x, b.y - 6 - h0.y) > 1.5) { b.trail.unshift({ x: b.x, y: b.y - 6 }); b.trail.length = 80; }
      // touching any part of it hurts
      if (b.engaged && !b.touchT) for (const q of this.players) {
        if (q.dead) continue;
        const n = this.bossNearest(b, q.x, q.y - q.h / 2);
        if (n.d < b.segR + 6) { this.hurt(q, B.contact, Math.sign(q.x - n.x || 1) * B.knock, -B.knock * 0.6, 'wyrm', b, null); b.touchT = B.touchCd; this.hitStop = Math.max(this.hitStop, 0.08); }
      }
    }
    bossDefeated(b) {
      const B = KData.bosses[b.type], RU = KData.runes, p = b.lastHitBy && !b.lastHitBy.dead ? b.lastHitBy : this.players[0];
      b.dead = true; b.hp = 0;
      this.defeated.add(b.type); this.cores.add(B.region);
      this.gainXp(p, KData.progression.killXp(b.level, 'crawler', false) * B.xpMul, 'boss');
      p.shards = (p.shards || 0) + B.shardsMul * b.level;
      this.tome(p, 'cataclysm');
      const first = this.hasRune(p, 'crucible') ? this.makeRune(b.level + 1, { tier: 3 }) : this.makeRune(b.level + 1, { type: 'crucible', tier: 3 });
      const second = this.makeRune(b.level + 1, { tier: 2 + (this.rand() < 0.4 ? 1 : 0) });
      // straight into the bag (it usually dies under the magma); dropped beside you only if the bag is full
      for (const r of [first, second]) {
        if (p.inventory.length < RU.bag) { p.inventory.push(r); this.events.push({ type: 'toast', kind: 'loot', text: `Found: ${RU.types[r.type].name} · ${RU.tiers[r.tier].name} · level ${r.level}` }); }
        else this.dropRune(p.x, p.y - 10, r);
      }
      for (const s of b.trail.filter((_, i) => i % 6 === 0)) this.burst(s.x, s.y, 8, [[255, 140, 50], [90, 40, 36], [255, 220, 140]], 160);
      this.fx.push({ kind: 'flash', x: b.x, y: b.y - 6, r: 60, t: 0, T: 0.6, color: [255, 160, 70] });
      this.shake = Math.max(this.shake, 4); this.hitStop = 0.25;
      this.sfx('bigboom', b.x, b.y, 1.5); this.sfx('level', b.x, b.y);
      this.events.push({ type: 'toast', kind: 'big', text: `${B.name} falls · ${B.core} claimed · ${B.shardsMul * b.level} shards` });
      this.events.push({ type: 'save' });
    }

    equip(p, index) {
      const r = p.inventory[index];
      if (!r || !KData.runes.types[r.type]) return;
      const slot = KData.runes.types[r.type].slot;
      p.inventory.splice(index, 1);
      if (p.runes[slot]) p.inventory.push(p.runes[slot]);
      p.runes[slot] = r;
      this.applyStats(p);
    }
    unequip(p, slot) {
      if (!p.runes[slot] || p.inventory.length >= KData.runes.bag) return;
      p.inventory.push(p.runes[slot]); p.runes[slot] = null;
      this.applyStats(p);
    }
    has(a, trait) { return !!(a && a.traits && a.traits.has(trait)); }
    sfx(name, x, y, vol = 1) { if (this.sounds.length < 40) this.sounds.push([name, x, y, vol]); }

    spendPoint(p, id) {
      if (p.points <= 0 || !KData.progression.stats.some(s => s.id === id)) return false;
      p.points--; p.alloc[id] = (p.alloc[id] || 0) + 1;
      this.applyStats(p);
      return true;
    }
    gainXp(p, amount, why) {
      const P = KData.progression;
      p.xp += amount;
      this.events.push({ type: 'xp', amount, why });
      while (p.xp >= P.xpFor(p.level)) {
        p.xp -= P.xpFor(p.level); p.level++; p.points += P.pointsPerLevel;
        p.hp = p.maxHp; p.mana = p.maxMana;
        this.events.push({ type: 'level', level: p.level, points: p.points });
        this.sfx('level', p.x, p.y);
      }
    }

    // ---------- Lodestones ----------
    // Touching one: found (first time, experience), checkpoint, and full repair
    // while you stand by it. W (or up) on the ground next to it opens the rest panel.
    lodestonesTick() {
      const C = KData.cave;
      for (const p of this.players) {
        const was = p.nearStone;
        p.nearStone = null;
        if (p.dead) continue;
        for (const l of this.world.lodestones) {
          if (Math.abs(p.x - l.x) < C.stoneReach && Math.abs(p.y - l.y) < 20) { p.nearStone = l; break; }
        }
        const l = p.nearStone;
        if (!l) continue;
        if (!this.found.has(l.id)) {
          this.found.add(l.id);
          this.events.push({ type: 'found', stone: l });
          this.sfx('stone', l.x, l.y);
          this.gainXp(p, KData.progression.lodestoneXp, 'Lodestone found');
        }
        if (this.checkpoint !== l.id) { this.checkpoint = l.id; this.events.push({ type: 'checkpoint', stone: l }); }
        if (was !== l) this.events.push({ type: 'save' });
        p.hp = Math.min(p.maxHp, p.hp + C.stoneRepair * DT);
        p.mana = Math.min(p.maxMana, p.mana + C.stoneRepair * DT);

      }
    }
    travel(p, id) {
      const l = this.world.lodestones[id];
      if (!l || !this.found.has(id)) return;
      Object.assign(p, { x: l.x + 14, y: this.world.floorBelow(l.x + 14, l.y - 10), vx: 0, vy: 0 });
      this.checkpoint = id;
      for (const e of this.enemies) e.lastSeen = -9;
    }

    makeDummy(s, i) {
      return { kind: 'dummy', id: i, home: { x: s.x, y: s.y }, x: s.x, y: s.y, vx: 0, vy: 0, w: DD.w, h: DD.h,
        hp: DD.hp, maxHp: DD.hp, grounded: false, dead: false, respawnT: 0, lastHurt: -9, flash: 0, facing: 1,
        stats: KData.baseStats() };
    }

    // An enemy lives in one chamber (its home) and is tougher further from the hub.
    // A few are elites: tougher, gold-eyed, and always drop a runestone.
    makeEnemy(home, i) {
      const kind = home.kind || 'crawler', E = KData.enemies[kind], L = home.level - 1, EL = KData.elites;
      const elite = home.level >= EL.from && this.rand() < EL.chance;
      const stats = KData.baseStats();
      stats.attack = (E.attack + E.perLevel.attack * L) * (elite ? EL.attack : 1);
      stats.defence = E.defence + E.perLevel.defence * L;
      const hp = Math.round(E.hp * (1 + E.perLevel.hp * L) * (elite ? EL.hp : 1));
      return { kind, id: i, home, level: home.level, elite, x: home.x, y: home.y, vx: 0, vy: 0, w: E.w, h: E.h,
        flying: kind === 'moth', anchored: kind === 'spitter', ghost: kind === 'delver', face: home.face || 1, fireT: 1 + this.rand() * 2,
        hp, maxHp: hp, stats, grounded: false, dead: false, respawnT: 0, lastHurt: -9, flash: 0, asleep: true,
        facing: i % 2 ? 1 : -1, dir: i % 2 ? 1 : -1, state: 'patrol', t: 0, lastSeen: -9, hit: false };
    }

    // ---------- one fixed step ----------
    step(actions) {
      this.time += DT;
      for (const p of this.players) this.control(p, actions[p.id] || { move: 0, events: [], aim: p.aim });
      this.world.step();
      this.updateGrowths();
      this.updateStorms();
      this.updateParticles();
      this.updateProjectiles();
      for (const e of this.enemies) this.enemyTick(e);
      for (const a of this.actors) if (!a.asleep) this.physics(a);
      this.bossTick();
      this.lodestonesTick();
      this.lootTick();
      this.treasureTick();
      for (const d of this.dummies) this.dummyTick(d);
      for (const f of this.fx) f.t += DT;
      this.fx = this.fx.filter(f => f.t < f.T);
      this.shake = Math.max(0, this.shake - DT * 12);
    }

    // ---------- player control ----------
    control(p, a) {
      p.flash = Math.max(0, p.flash - DT);
      p.slotFlash = Math.max(0, p.slotFlash - DT);
      p.manaFlash = Math.max(0, p.manaFlash - DT);
      if (p.dead) {
        p.respawnT -= DT;
        if (p.respawnT <= 0) this.respawn(p);
        return;
      }
      for (const e of a.events) {
        // the recipe: type elements onto the end (no slots; mana is the limit)
        if (e.type === 'load') { if (p.queue.length < KData.recipe.max) p.queue.push(e.el); else p.slotFlash = 0.35; }
        else if (e.type === 'clear') p.queue = [];
        else if (e.type === 'undo') p.queue.pop();
      }
      const RC = KRecipe.resolve(p.queue);
      p.recipe = RC;
      p.slots = RC ? [RC.form, RC.second] : [null, null];   // the golem's two colours: form and strongest modifier
      for (const t of ['hasteT', 'skinT', 'guardT']) if (p[t] > 0) p[t] -= DT;
      p.aim = a.aim;
      const ax = Math.cos(p.aim);
      if (Math.abs(ax) > 0.15) p.facing = ax > 0 ? 1 : -1;
      p.moveX = a.move || 0; p.moveY = a.moveY || 0;
      if (p.moveX) p.lastMoveX = Math.sign(p.moveX);

      for (const k in p.cds) if (p.cds[k] > 0) p.cds[k] -= DT;
      p.lock = Math.max(0, p.lock - DT);

      // run
      if (p.slowT > 0) p.slowT -= DT;
      const muddy = (p.inMud || p.slowT > 0) && !this.has(p, 'diver');
      const slow = muddy ? KData.materials[M.MUD].slows : 1;
      const run = PD.run * slow * (p.speedMul || 1) * (p.hasteT > 0 ? KData.specials.haste.speed : 1);
      const target = p.moveX * run;
      if (p.dashT <= 0) {
        const acc = (p.grounded ? PD.accel : PD.airAccel) * (muddy ? 0.5 : 1);
        if (p.moveX !== 0) {
          if (Math.abs(p.vx) <= run || Math.sign(p.moveX) !== Math.sign(p.vx)) {
            const dv = target - p.vx;
            p.vx += Math.sign(dv) * Math.min(Math.abs(dv), acc * DT);
          }
        } else if (p.grounded) p.vx *= Math.exp(-PD.friction * DT);
      }

      // jump: Space, and only ever a jump (the Move has its own key, Shift)
      const jumpPressed = a.jump && !p.jumpHeld;
      if (jumpPressed) p.jumpBuf = PD.buffer;
      if (p.grounded) p.coyote = PD.coyote; else p.coyote = Math.max(0, p.coyote - DT);
      p.jumpBuf = Math.max(0, p.jumpBuf - DT);
      let jumpedNow = false;
      if (p.jumpBuf > 0 && p.coyote > 0 && p.dashT <= 0) {
        p.vy = -PD.jump * (muddy ? 0.55 : 1) * (this.has(p, 'spring') ? 1.3 : 1) * (p.hasteT > 0 ? 1.15 : 1);
        p.jumpBuf = 0; p.coyote = 0; p.rising = true; p.grounded = false;
        p.jumpT = this.time; jumpedNow = true;
      }
      if (p.inWater && a.jump && p.dashT <= 0 && !p.channels.move) p.vy = Math.max(p.vy - (this.has(p, 'diver') ? 900 : 520) * DT, this.has(p, 'diver') ? -160 : -95);
      if (!a.jump && p.rising && p.vy < 0) { p.vy *= 0.5; p.rising = false; }
      if (p.vy >= 0) p.rising = false;
      p.jumpHeld = a.jump;
      // Lift: holding Space in the air. It starts when you press Space while
      // already in the air, or when a held jump reaches its top (so a full
      // jump is still just a jump).
      if (!a.jump) p.liftArmed = false;
      else if ((jumpPressed && !jumpedNow && !p.grounded) || (!p.grounded && p.vy > -40)) p.liftArmed = true;
      const moveActive = !!a.moveSpell, movePressed = moveActive && !p.moveWas;
      p.moveWas = moveActive;
      if (p.safeT > 0) p.safeT -= DT;
      for (const e of a.events) if (e.type === 'interact' && p.nearStone) this.events.push({ type: 'rest', stone: p.nearStone });

      // mana refills on its own, faster on the ground
      if (p.manaWait > 0) p.manaWait -= DT;
      else p.mana = Math.min(p.maxMana, p.mana + (p.grounded ? PD.manaGroundRegen : PD.manaRegen) * (p.regenMul || 1) * DT);

      // the three ways to cast
      const key = RC ? RC.key : null;
      const input = {
        shot: { held: a.cast, pressed: a.cast && !p.castHeld },
        burst: { held: !!a.burst, pressed: !!a.burst && !p.burstHeld },
        move: { held: moveActive, pressed: movePressed },
      };
      p.castHeld = a.cast; p.burstHeld = !!a.burst;
      this.liftTick(p, a, key);
      for (const mode of KData.modes) {
        if (mode === 'lift') continue;
        const { held, pressed } = input[mode];
        const ch = p.channels[mode];
        if (ch) {
          if (held && ch === key && p.mana > 0) this.channelTick(p, mode);
          else this.endChannel(p, mode);
          continue;
        }
        if (!held) continue;
        if (!key) { if (pressed && mode !== 'move') p.slotFlash = 0.35; continue; }
        const sp = this.spec(p, mode), cdKey = key + ':' + mode;
        if ((p.cds[cdKey] || 0) > 0) continue;
        if (sp.drain) {
          if (p.mana < sp.min) { if (pressed) { p.manaFlash = 0.35; this.sfx('nomana', p.x, p.y); } continue; }
          p.channels[mode] = key;
          if (mode !== 'shot') p.safeT = 0.8;
          this.alert(p, p.x, p.y, KData.enemies.crawler.hearing);
          this.channelTick(p, mode);
          continue;
        }
        if (mode === 'move' && sp.kind === 'slam' && (p.slam || p.grounded)) continue; // a slam needs air under you, one at a time
        if (mode === 'move' && !pressed && !sp.drain) continue;                      // one-shot moves: once per press
        if (mode !== 'move' && p.lock > 0) continue;
        let cost = sp.cost;
        if (this.has(p, 'swift') && (sp.kind === 'blink' || sp.kind === 'dash' || sp.kind === 'blastdash')) cost *= 0.5;
        if (p.mana < cost) { if (pressed) { p.manaFlash = 0.35; this.sfx('nomana', p.x, p.y); } continue; }
        if (mode === 'shot' && this.has(p, 'thrifty') && ++p.shotCount % 4 === 0) cost = 0;
        p.cds[cdKey] = sp.cd;
        if (mode !== 'move') p.lock = 0.12;
        this.spend(p, cost);
        this.alert(p, p.x, p.y, KData.enemies.crawler.hearing);
        if (mode !== 'shot') p.safeT = 0.8;   // your own Moves and Bursts never burn you
        this.cast(p, key, mode, sp);
        if (mode === 'burst' && sp.mods) { const r = (sp.radius || sp.reach || 20) * 0.7; this.landing(p.x - r, p.y - 6, sp, p); this.landing(p.x + r, p.y - 6, sp, p); }
        if (mode === 'burst' && this.has(p, 'mudburst')) this.mireAround(p, 20, 1);
      }
    }

    // The spell a way of casting gives right now. An exact special sequence
    // takes over the Shot once your mana bar could hold its cost.
    spec(p, mode) {
      const RC = p.recipe;
      if (!RC) return null;
      if (mode === 'shot' && RC.special) {
        const S = KData.specials[RC.special];
        if (p.maxMana >= S.cost) return this._special[RC.special] || (this._special[RC.special] = { kind: 'special', id: RC.special, name: S.name, cost: S.cost, cd: S.cd, special: true });
      }
      return RC[mode];
    }

    // What a Shot or Burst's modifier elements do where it lands:
    // fire scatters flames, water splashes, earth digs and throws rubble,
    // lightning electrifies water. (What they do to whoever is hit is in hurt().)
    landing(x, y, sp, owner) {
      const m = sp.mods;
      if (!m || !(m.fire || m.water || m.earth || m.lightning)) return;
      const w = this.world, R = this.rand, ix = Math.round(x), iy = Math.round(y);
      if (m.earth) {
        w.explode(x, y, Math.min(9, 2 + 1.5 * m.earth));
        for (let k = 0; k < Math.min(20, 5 * m.earth); k++) this.parts.push({ x: x + (R() - 0.5) * 6, y: y - 2, vx: (R() - 0.5) * 120, vy: -60 - R() * 90, g: 380, mat: M.EARTH, life: 3, owner });
      }
      if (m.fire) {
        const r = 3 + 2 * Math.min(4, m.fire);
        for (let k = 0; k < Math.min(30, 7 * m.fire); k++) { const fx = ix + ((R() - 0.5) * 2 * r | 0), fy = iy + ((R() - 0.5) * 2 * r | 0); if (w.get(fx, fy) === M.EMPTY) w.set(fx, fy, M.FIRE); }
      }
      if (m.water) for (let k = 0; k < Math.min(36, 9 * m.water); k++) this.parts.push({ x: x + (R() - 0.5) * 6, y: y - 2, vx: (R() - 0.5) * 150, vy: -40 - R() * 110, g: 300, mat: M.WATER, life: 3, owner });
      if (m.lightning) {
        this.fx.push({ kind: 'flash', x, y, r: 10 + 4 * m.lightning, t: 0, T: 0.15, color: [255, 246, 170] });
        for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) if (w.get(ix + dx, iy + dy) === M.WATER) { w.electrify(ix + dx, iy + dy, 40 + 15 * m.lightning, 800); dy = 99; break; }
      }
    }

    // turn the top of the ground around p into mud (not under p's own feet)
    mireAround(p, radius, depth) {
      const w = this.world;
      for (let x = Math.round(p.x - radius); x <= p.x + radius; x++) {
        if (Math.abs(x - p.x) < p.w / 2 + 2) continue;
        let y = Math.floor(p.y - 12);
        while (y < p.y + 20 && !KWorld.SOLID[w.get(x, y)]) y++;
        for (let k = 0; k < depth; k++) { const m = w.get(x, y + k); if (m === M.DIRT || m === M.EARTH || m === M.MOSS) w.set(x, y + k, M.MUD); }
      }
    }

    spend(p, amount) {
      p.mana -= amount;
      if (p.mana <= 0) { p.mana = 0; p.manaWait = PD.manaEmptyDelay; }
      else p.manaWait = Math.max(p.manaWait, PD.manaDelay);
    }

    chest(p) { return { x: p.x, y: p.y - p.h * 0.55 }; }

    // Direction for a Move: the keys held, or the spell's default.
    moveDir(p, sp) {
      let x = p.moveX || 0, y = p.moveY || 0;
      if (!x && !y) { if (sp.dir === 'down') y = 1; else if (sp.dir === 'facing') x = p.facing; else y = -1; }
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }

    cast(p, key, mode, sp) {
      const SND = { projectile: 'fireball', boulder: 'earth', lob: 'magma', spear: 'spear', spray: 'mud', bolt: 'bolt', lance: 'lance', nova: 'nova', wave: 'splash',
        shell: 'earth', field: 'shock', cloud: 'whoosh', eruption: 'rumble', mire: 'mud', storm: 'bolt', spikes: 'earth', flare: 'nova',
        blink: 'blink', slam: 'whoosh', dash: 'whoosh', blastdash: 'nova' };
      if (SND[sp.kind]) this.sfx(SND[sp.kind], p.x, p.y - 8, mode === 'burst' ? 1 : 0.8);
      const dx = Math.cos(p.aim), dy = Math.sin(p.aim);
      const c = this.chest(p), ox = c.x + dx * 6, oy = c.y + dy * 6;
      const R = this.rand, w = this.world;
      const md = mode === 'move' ? this.moveDir(p, sp) : null;
      switch (sp.kind) {
        case 'special': this.castSpecial(p, sp.id); break;
        // ----- shots -----
        case 'projectile':
          this.projectiles.push({ kind: 'fireball', sp, key, owner: p, x: ox, y: oy, vx: dx * sp.speed, vy: dy * sp.speed, g: sp.gravity, age: 0 });
          break;
        case 'boulder':
          this.projectiles.push({ kind: 'boulder', sp, key, owner: p, x: ox, y: oy, vx: dx * sp.speed + p.vx * 0.3, vy: dy * sp.speed + p.vy * 0.2, g: sp.gravity, age: 0 });
          break;
        case 'lob':
          this.projectiles.push({ kind: 'blob', sp, key, owner: p, x: ox, y: oy, vx: dx * sp.speed + p.vx * 0.3, vy: dy * sp.speed + p.vy * 0.2, g: sp.gravity, age: 0 });
          break;
        case 'spear':
          this.projectiles.push({ kind: 'spear', sp, key, owner: p, x: ox, y: oy, vx: dx * sp.speed, vy: dy * sp.speed, g: 0, age: 0, bore: sp.boreLength, travelled: 0 });
          break;
        case 'spray':
          for (let i = 0; i < sp.count; i++) {
            const an = p.aim + (R() - 0.5) * 2 * sp.spread, s = sp.speed * (0.7 + R() * 0.5);
            this.parts.push({ x: ox, y: oy, vx: Math.cos(an) * s, vy: Math.sin(an) * s, g: sp.gravity, mat: M[sp.mat], life: 3, owner: p });
          }
          break;
        case 'bolt': this.castBolt(p, sp, key, c, dx, dy); break;
        case 'lance': this.castLance(p, sp, key, c, dx, dy); break;
        // ----- bursts (around you) -----
        case 'nova': {
          this.hitRadius(c.x, c.y, sp.radius, sp.power, sp.knock, p, p, key);
          for (let k = 0; k < 90; k++) {
            const an = k / 90 * Math.PI * 2, r = sp.radius - 3 + R() * 4;
            const x = Math.round(c.x + Math.cos(an) * r), y = Math.round(c.y + Math.sin(an) * r), m = w.get(x, y);
            if (m === M.EMPTY && R() < 0.7) w.set(x, y, M.FIRE);
            else if (m === M.MOSS) w.set(x, y, M.FIRE);
          }
          if (this.has(p, 'melt')) w.meltRock(c.x, c.y, sp.radius);
          this.fx.push({ kind: 'ring', x: c.x, y: c.y, r0: 4, r1: sp.radius, t: 0, T: 0.25, color: sp.color });
          this.fx.push({ kind: 'flash', x: c.x, y: c.y, r: sp.radius * 2, t: 0, T: 0.2, color: sp.color });
          this.shake = Math.max(this.shake, 2);
          break;
        }
        case 'wave': {
          for (let i = 0; i < sp.count; i++) {
            const side = i % 2 ? 1 : -1;
            this.parts.push({ x: p.x + side * 6, y: p.y - 3 - R() * 6, vx: side * (150 + R() * 120), vy: -40 - R() * 90, g: 300, mat: M.WATER, life: 3, owner: p, push: 0.02 });
          }
          for (const o of this.actors) {
            if (o === p || o.dead) continue;
            const ddx = o.x - p.x, ddy = (o.y - o.h / 2) - c.y;
            if (Math.abs(ddx) < sp.reach && Math.abs(ddy) < 22) this.hurt(o, sp.power, Math.sign(ddx || 1) * sp.knock, -90, 'wave', p, key);
          }
          this.fx.push({ kind: 'ring', x: c.x, y: p.y - 4, r0: 4, r1: sp.reach * 0.6, t: 0, T: 0.25, color: [120, 180, 255] });
          break;
        }
        case 'shell': {
          for (let k = 0; k < 160; k++) {
            const an = k / 160 * Math.PI * 2;
            for (let r = sp.radius; r < sp.radius + sp.thick + 0.5; r += 0.7) {
              const x = Math.round(c.x + Math.cos(an) * r), y = Math.round(c.y + Math.sin(an) * r);
              if (!KWorld.SOLID[w.get(x, y)] && !this.actorAt(x + 0.5, y + 0.5)) w.set(x, y, M.DIRT);
            }
          }
          for (const o of this.actors) {
            if (o === p || o.dead) continue;
            const ddx = o.x - c.x, ddy = (o.y - o.h / 2) - c.y, d = Math.hypot(ddx, ddy);
            if (d < sp.radius + 8) { o.vx += ddx / (d || 1) * sp.knock; o.vy += ddy / (d || 1) * sp.knock - 40; }
          }
          this.burst(c.x, c.y, 18, [[184, 140, 128], [132, 84, 100]], 90);
          break;
        }
        case 'field': {
          let water = null;
          for (const o of this.actors) {
            if (o === p || o.dead) continue;
            const oc = { x: o.x, y: o.y - o.h / 2 }, d = Math.hypot(oc.x - c.x, oc.y - c.y);
            if (d > sp.radius) continue;
            this.hurt(o, sp.power, (oc.x - c.x) / (d || 1) * sp.knock, -40, 'shock', p, key);
            this.fx.push({ kind: 'bolt', pts: this.jagged(c.x, c.y, oc.x, oc.y), t: 0, T: 0.18, color: sp.color });
          }
          for (let k = 0; k < 5; k++) {
            const an = R() * Math.PI * 2, r = sp.radius * (0.5 + R() * 0.5);
            this.fx.push({ kind: 'bolt', pts: this.jagged(c.x, c.y, c.x + Math.cos(an) * r, c.y + Math.sin(an) * r), t: 0, T: 0.14, color: sp.color });
          }
          for (let y = -sp.radius; y <= sp.radius && !water; y += 2) for (let x = -sp.radius; x <= sp.radius; x += 2) {
            if (x * x + y * y > sp.radius * sp.radius) continue;
            if (w.get(Math.round(c.x + x), Math.round(c.y + y)) === M.WATER) { water = [Math.round(c.x + x), Math.round(c.y + y)]; break; }
          }
          if (water) w.electrify(water[0], water[1], sp.charge, 1500);
          this.fx.push({ kind: 'flash', x: c.x, y: c.y, r: sp.radius * 1.4, t: 0, T: 0.2, color: sp.color });
          break;
        }
        case 'cloud': {
          for (let y = -sp.radius; y <= sp.radius; y++) for (let x = -sp.radius; x <= sp.radius; x++) {
            if (x * x + y * y > sp.radius * sp.radius || R() > sp.fill) continue;
            const cx = Math.round(c.x + x), cy = Math.round(c.y + y);
            if (w.get(cx, cy) === M.EMPTY) w.set(cx, cy, M.STEAM);
          }
          this.hitRadius(c.x, c.y, sp.radius, sp.power, 40, p, p, key);
          break;
        }
        case 'eruption': {
          for (let i = 0; i < sp.count; i++) {
            // the magma bursts out of the ground around you and falls away from you, never on you
            const side = i % 2 ? 1 : -1, x = p.x + side * (p.w / 2 + 6 + R() * (sp.reach - p.w / 2 - 6));
            let y = Math.floor(p.y - 10);
            while (y < p.y + 24 && !KWorld.SOLID[w.get(Math.round(x), y)]) y++;
            this.parts.push({ x, y: y - 1, vx: side * (30 + R() * 50), vy: -120 - R() * 110, g: 380, mat: M.MAGMA, life: 3, owner: p });
          }
          for (const o of this.actors) {
            if (o === p || o.dead) continue;
            if (Math.abs(o.x - p.x) < sp.reach && Math.abs(o.y - p.y) < 26) this.hurt(o, sp.power, Math.sign(o.x - p.x || 1) * 80, -sp.knock, 'magma', p, key);
          }
          this.fx.push({ kind: 'flash', x: p.x, y: p.y - 4, r: sp.reach * 1.6, t: 0, T: 0.25, color: [255, 120, 40] });
          this.shake = Math.max(this.shake, 2);
          break;
        }
        case 'mire': {
          for (let x = Math.round(p.x - sp.radius); x <= p.x + sp.radius; x++) {
            if (Math.abs(x - p.x) < p.w / 2 + 2) continue; // not under your own feet
            let y = Math.floor(p.y - 12);
            while (y < p.y + 20 && !KWorld.SOLID[w.get(x, y)]) y++;
            for (let k = 0; k < sp.depth; k++) { const m = w.get(x, y + k); if (m === M.DIRT || m === M.EARTH || m === M.MOSS) w.set(x, y + k, M.MUD); }
          }
          this.burst(p.x, p.y, 14, [[96, 84, 104], [104, 92, 112]], 70);
          break;
        }
        case 'storm': {
          let n = 0;
          for (const o of this.actors) {
            if (o === p || o.dead || o.kind === 'player') continue;
            const oc = { x: o.x, y: o.y - o.h / 2 }, d = Math.hypot(oc.x - c.x, oc.y - c.y);
            if (d > sp.range || w.ray(c.x, c.y, (oc.x - c.x) / d, (oc.y - c.y) / d, d).hit) continue;
            this.hurt(o, sp.power, (oc.x - c.x) / d * sp.knock, -40, 'shock', p, key);
            this.fx.push({ kind: 'bolt', pts: this.jagged(c.x, c.y, oc.x, oc.y), t: 0, T: 0.2, color: sp.color });
            n++;
          }
          if (!n) for (let k = 0; k < 4; k++) { const an = R() * Math.PI * 2; this.fx.push({ kind: 'bolt', pts: this.jagged(c.x, c.y, c.x + Math.cos(an) * 30, c.y + Math.sin(an) * 30), t: 0, T: 0.14, color: sp.color }); }
          this.fx.push({ kind: 'flash', x: c.x, y: c.y, r: 30, t: 0, T: 0.18, color: sp.color });
          break;
        }
        case 'spikes': {
          for (let x = Math.round(p.x - sp.reach); x <= p.x + sp.reach; x += 4) {
            if (Math.abs(x - p.x) < p.w / 2 + 3) continue;
            let y = Math.floor(p.y - 12);
            while (y < p.y + 20 && !KWorld.SOLID[w.get(x, y)]) y++;
            if (y >= p.y + 20) continue;
            for (let k = 1; k <= sp.height; k++) {
              const half = k < sp.height - 2 ? 1 : 0;
              for (let ox2 = -half; ox2 <= half; ox2++) if (!KWorld.SOLID[w.get(x + ox2, y - k)] && !this.actorAt(x + ox2 + 0.5, y - k + 0.5)) w.set(x + ox2, y - k, M.DIRT);
            }
            for (const o of this.actors) if (o !== p && !o.dead && Math.abs(o.x - x) < o.w / 2 + 2 && Math.abs(o.y - y) < 10) {
              if (!o._spiked) { o._spiked = true; this.hurt(o, sp.power, 0, -sp.knock, 'spikes', p, key); }
            }
          }
          for (const o of this.actors) o._spiked = false;
          this.burst(p.x, p.y, 14, [[184, 140, 128], [132, 84, 100]], 80);
          break;
        }
        case 'flare': {
          this.hitRadius(c.x, c.y, sp.radius, sp.power, sp.knock, p, p, key);
          if (this.has(p, 'melt')) w.meltRock(c.x, c.y, sp.radius * 0.8);
          for (let k = 0; k < 40; k++) {
            const an = R() * Math.PI * 2, r = sp.radius * (0.6 + R() * 0.5);
            const x = Math.round(c.x + Math.cos(an) * r), y = Math.round(c.y + Math.sin(an) * r), m = w.get(x, y);
            if (m === M.MOSS || (m === M.EMPTY && R() < sp.ignite)) w.set(x, y, M.FIRE);
          }
          this.fx.push({ kind: 'ring', x: c.x, y: c.y, r0: 4, r1: sp.radius + 3, t: 0, T: 0.22, color: sp.color });
          this.fx.push({ kind: 'flash', x: c.x, y: c.y, r: 34, t: 0, T: 0.16, color: sp.color });
          this.burst(c.x, c.y, 18, [[255, 220, 140], [255, 160, 60]], 130);
          this.shake = Math.max(this.shake, 2);
          break;
        }
        // ----- moves (in the direction you press) -----
        case 'blink': {
          const c0 = { x: p.x, y: p.y - p.h / 2 };
          let tx = p.x, ty = p.y;
          for (let d = sp.dist; d > 0; d -= 1) {
            const x = p.x + md.x * d, y = p.y + md.y * d;
            if (!this.collides(p, x, y) && !w.ray(c0.x, c0.y, md.x, md.y, d).hit) { tx = x; ty = y; break; }
            if (!this.collides(p, x, y) && d < sp.dist * 0.5) { tx = x; ty = y; break; }
          }
          p.x = tx; p.y = ty; p.vx *= 0.3; p.vy = Math.min(p.vy, 0) * 0.3;
          this.fx.push({ kind: 'bolt', pts: this.jagged(c0.x, c0.y, p.x, p.y - p.h / 2), t: 0, T: 0.2, color: [255, 246, 170] });
          this.fx.push({ kind: 'flash', x: p.x, y: p.y - p.h / 2, r: 18, t: 0, T: 0.15, color: [255, 246, 170] });
          break;
        }
        case 'slam': {
          p.vx = md.x * sp.speed; p.vy = md.y * sp.speed; p.slam = { sp, key, t: 0 };
          p.rising = false;
          break;
        }
        case 'dash': {
          this.world.sample(p.x - p.w / 2, p.y - p.h, p.x + p.w / 2, p.y, counts);
          const wet = counts[M.WATER] > 6 || p.inWater;
          p.dashT = wet ? sp.waterTime : sp.time;
          p.dashVX = md.x * sp.speed; p.dashVY = md.y * sp.speed;
          p.dashHit = new Set(); p.dashSp = sp; p.dashKey = key;
          p.rising = false;
          if (sp.trail) this.sfx(sp.trail === 'FIRE' ? 'fireball' : sp.trail === 'WATER' ? 'splash' : 'whoosh', p.x, p.y - 8, 0.7);
          else if (sp.dig) this.sfx('earth', p.x, p.y - 8, 0.8);
          else this.sfx('bolt', p.x, p.y - 8, 0.7);
          if (sp.cloud) for (let k = 0; k < sp.cloud * 12; k++) {
            const an = R() * Math.PI * 2, d = Math.sqrt(R()) * sp.cloud, x = Math.round(c.x + Math.cos(an) * d), y = Math.round(c.y + Math.sin(an) * d);
            if (w.get(x, y) === M.EMPTY) w.set(x, y, M.STEAM);
          }
          const TC = { FIRE: [255, 170, 80], WATER: [120, 170, 255], STEAM: [220, 222, 240] };
          this.fx.push({ kind: 'trail', pts: [{ x: c.x, y: c.y }], owner: p, t: 0, T: 0.45, color: TC[sp.trail] || (sp.dig ? [196, 152, 136] : [255, 246, 170]) });
          break;
        }
        case 'blastdash': {
          p.vx = md.x * sp.speed; p.vy = md.y * sp.speed - (md.y === 0 ? 40 : 0);
          p.grounded = false; p.rising = false;
          const bx = c.x - md.x * 8, by = c.y - md.y * 8;
          this.hitRadius(bx, by, 14, sp.power, 200, p, p, key);
          for (let k = 0; k < 14; k++) { const x = Math.round(bx + (R() - 0.5) * 8), y = Math.round(by + (R() - 0.5) * 8); if (w.get(x, y) === M.EMPTY) w.set(x, y, M.FIRE); }
          this.fx.push({ kind: 'flash', x: bx, y: by, r: 22, t: 0, T: 0.15, color: [255, 200, 120] });
          this.burst(bx, by, 12, [[255, 220, 140], [255, 160, 60]], 120);
          break;
        }
      }
    }

    // Lift: hold Space in the air. Each pair lifts differently (data.js
    // spells[pair].lift): thrust (Flame jet, Steam flight, Plasma thrust),
    // a slow cheap rise (Water jet), steps you build and jump off (Stone and
    // Ember steps), a mud column that carries you (Mud tower), extra hops
    // (Spark hops), a slow glide (Storm glide) and floating above the ground
    // (Magnet float). Lifts never hurt you.
    liftTick(p, a, key) {
      const sp = key && p.recipe.lift;
      if (p.grounded) p.hops = 0;
      const ok = sp && a.jump && p.liftArmed && !p.dead && !p.inWater && p.dashT <= 0 && !p.slam && !p.channels.move &&
        (!p.grounded || sp.kind === 'lcolumn');
      if (!ok) { p.channels.lift = null; p.liftNoMana = false; return; }
      const R = this.rand, w = this.world, kind = sp.kind;
      const noMana = () => { if (!p.liftNoMana) { p.liftNoMana = true; p.manaFlash = 0.35; this.sfx('nomana', p.x, p.y); } };
      if (sp.drain) {
        if (!p.channels.lift) {
          if (p.mana < sp.min) return noMana();
          p.channels.lift = key;
          this.alert(p, p.x, p.y, KData.enemies.crawler.hearing);
        }
        if (p.mana <= 0) { p.channels.lift = null; p.liftArmed = false; return; }
      }
      p.safeT = Math.max(p.safeT || 0, 0.4);
      if (sp.guard) { p.guard = sp.guard; p.guardT = 0.2; }
      p.rising = false; p.coyote = 0;
      const steer = (speed, acc) => { const tx = (p.moveX || 0) * speed; p.vx += Math.sign(tx - p.vx) * Math.min(Math.abs(tx - p.vx), acc * DT); };
      const free = this.has(p, 'tidal') && this.nearWater(p) && (kind === 'lthrust' || kind === 'lhover' || kind === 'lglide');
      if (kind === 'lthrust') {
        // a jet straight down pushes you up; Plasma thrust trades height for speed when you steer
        const side = p.moveX || 0, top = sp.emit === 'SPARK' && side ? sp.maxSpeed * 0.45 : sp.maxSpeed;
        if (p.moveY <= 0) p.vy = Math.max(p.vy - sp.accel * DT, Math.min(p.vy, -top));
        steer(sp.sideSpeed, sp.sideAccel);
        if (sp.emit === 'STEAM') for (let i = 0; i < 3; i++) {
          const x = Math.round(p.x + (R() - 0.5) * 6), y = Math.round(p.y + 2 + R() * 8);
          if (w.get(x, y) === M.EMPTY) w.set(x, y, M.STEAM);
        } else if (sp.emit === 'FIRE') {
          for (let i = 0; i < 2; i++) {
            const x = Math.round(p.x + (R() - 0.5) * 6), y = Math.round(p.y + 3 + R() * 10);
            if (w.get(x, y) === M.EMPTY) w.set(x, y, M.FIRE);
          }
          for (const o of this.actors) {
            if (o === p || o.dead || o.kind === 'player') continue;
            const top = o.y - o.h;
            if (Math.abs(o.x - p.x) < 5 + o.w / 2 && top > p.y - 4 && top - p.y < sp.reach) this.hurt(o, sp.power * DT, 0, 50, 'burn', p, key);
          }
        } else if (R() < 0.6) this.burst(p.x - side * 3, p.y + 2, 1, [[255, 220, 140], [255, 246, 170]], 70);
      } else if (kind === 'lhover') {
        const target = p.moveY > 0 ? 60 : -sp.rise;
        p.vy += Math.sign(target - p.vy) * Math.min(Math.abs(target - p.vy), 1100 * DT);
        steer(sp.sideSpeed, 500);
        for (let i = 0; i < sp.perTick; i++) this.parts.push({ x: p.x + (R() - 0.5) * 6, y: p.y, vx: (R() - 0.5) * 30, vy: 120 + R() * 60, g: 200, mat: M.WATER, life: 2, owner: p });
      } else if (kind === 'lsteps') {
        // when you start to fall, a step forms under your feet and you jump off it
        if (p.vy > -10 && this.time - (p.stepT || -9) > sp.gap) {
          if (p.mana < sp.cost) return noMana();
          const half = sp.width >> 1, y0 = Math.round(p.y) + 1;
          let placed = 0;
          for (let y = 0; y < 2; y++) for (let x = -half; x <= half; x++) {
            const cx = Math.round(p.x + x), cy = y0 + y, m = w.get(cx, cy);
            if ((m === M.EMPTY || m === M.STEAM || m === M.FIRE) && !this.actorAt(cx, cy, p)) { w.set(cx, cy, M.DIRT); placed++; }
            else if (KWorld.SOLID[m]) placed++;
          }
          if (placed < sp.width) return;   // no room for a step here
          this.spend(p, sp.cost);
          p.stepT = this.time; p.vy = -sp.jump * (this.has(p, 'spring') ? 1.15 : 1); p.grounded = false;
          this.alert(p, p.x, p.y, KData.enemies.crawler.hearing);
          this.sfx('earth', p.x, p.y, 0.6);
          this.burst(p.x, p.y + 2, 6, [[184, 140, 128], [132, 84, 100]], 50);
          if (sp.hot) {
            this.hitRadius(p.x, p.y + 10, 16, sp.power, 120, p, p, key);
            for (let k = 0; k < 10; k++) { const x = Math.round(p.x + (R() - 0.5) * sp.width), y = y0 + 2 + Math.floor(R() * 6); if (w.get(x, y) === M.EMPTY) w.set(x, y, M.FIRE); }
            this.fx.push({ kind: 'flash', x: p.x, y: p.y + 4, r: 18, t: 0, T: 0.15, color: [255, 150, 60] });
            this.sfx('fireball', p.x, p.y, 0.6);
          }
        }
      } else if (kind === 'lcolumn') {
        // a column of packed mud grows under your feet and lifts you
        p.noGravity = true;
        p.vy = -sp.rise;
        const half = sp.width >> 1, y0 = Math.round(p.y) + 1;
        for (let y = 0; y < 2; y++) for (let x = -half; x <= half; x++) {
          const cx = Math.round(p.x + x), cy = y0 + y, m = w.get(cx, cy);
          if ((m === M.EMPTY || m === M.STEAM || m === M.FIRE) && !this.actorAt(cx, cy, p)) w.set(cx, cy, M.DIRT);
        }
        if (R() < 0.3) this.burst(p.x + (R() - 0.5) * sp.width, p.y + 2, 1, [[150, 110, 96], [120, 86, 80]], 40);
      } else if (kind === 'lhops') {
        // up to three extra jumps before you land, each off a crack of lightning
        if (p.vy > -20 && (p.hops || 0) < sp.hops && this.time - (p.hopT || -9) > 0.15) {
          if (p.mana < sp.cost) return noMana();
          this.spend(p, sp.cost);
          p.hops = (p.hops || 0) + 1; p.hopT = this.time;
          p.vy = -sp.jump * (this.has(p, 'spring') ? 1.15 : 1);
          if (p.moveX) p.vx = p.moveX * sp.side;
          this.hitRadius(p.x, p.y + 6, sp.radius, sp.power, 90, p, p, key);
          this.fx.push({ kind: 'bolt', pts: this.jagged(p.x, p.y, p.x + (R() - 0.5) * 10, p.y + 14), t: 0, T: 0.15, color: [255, 246, 170] });
          this.fx.push({ kind: 'ring', x: p.x, y: p.y + 2, r0: 2, r1: sp.radius, t: 0, T: 0.18, color: [255, 246, 170] });
          this.sfx('shock', p.x, p.y, 0.7);
          this.alert(p, p.x, p.y, KData.enemies.crawler.hearing);
        }
      } else if (kind === 'lglide') {
        // a slow fall, fast sideways, striking enemies below
        if (p.vy > sp.fall) p.vy = Math.max(sp.fall, p.vy - 1400 * DT);
        if (p.moveX) steer(sp.side, 600);
        p.glideT = (p.glideT || 0) - DT;
        if (p.glideT <= 0) {
          let best = null, bd = sp.range;
          for (const o of this.actors) {
            if (o === p || o.dead || o.kind === 'player' || o.y < p.y) continue;
            const d = Math.hypot(o.x - p.x, o.y - o.h / 2 - p.y);
            if (d < bd && Math.abs(o.x - p.x) < d * 0.8 + 6 && !w.ray(p.x, p.y, (o.x - p.x) / d, (o.y - o.h / 2 - p.y) / d, d - 3).hit) { best = o; bd = d; }
          }
          if (best) {
            this.hurt(best, sp.power, 0, -30, 'shock', p, key);
            this.fx.push({ kind: 'bolt', pts: this.jagged(p.x, p.y, best.x, best.y - best.h / 2), t: 0, T: 0.15, color: [190, 230, 255] });
            this.sfx('bolt', best.x, best.y, 0.5);
            p.glideT = sp.every;
          } else p.glideT = 0.1;
        }
        if (R() < 0.4) this.burst(p.x + (R() - 0.5) * 10, p.y - 2, 1, [[190, 230, 255], [140, 180, 255]], 30);
      } else if (kind === 'lmagnet') {
        // pushed off the surface below: ground, water or magma
        p.noGravity = true;
        let ground = -1;
        for (let d = 1; d <= sp.range && ground < 0; d++) for (const ox of [-4, 0, 4]) {
          const m = w.get(Math.round(p.x + ox), Math.round(p.y + d));
          if (KWorld.SOLID[m] || m === M.WATER || m === M.MAGMA) { ground = d; break; }
        }
        const want = ground < 0 ? sp.sink : Math.max(-90, Math.min(90, (ground - sp.height) * 6));
        p.vy += Math.sign(want - p.vy) * Math.min(Math.abs(want - p.vy), 900 * DT);
        steer(sp.side, 800);
        if (ground >= 0 && R() < 0.35) this.fx.push({ kind: 'bolt', pts: this.jagged(p.x, p.y, p.x + (R() - 0.5) * 8, p.y + ground), t: 0, T: 0.08, color: [200, 210, 255] });
      }
      if (sp.drain && !free) this.spend(p, sp.drain * DT);
    }

    // Held spells: water jet and scald (shots); wall climb and drill (moves).
    channelTick(p, mode) {
      const key = p.channels[mode], sp = this.spec(p, mode), R = this.rand, w = this.world;
      const dx = Math.cos(p.aim), dy = Math.sin(p.aim), c = this.chest(p);
      let drain = sp.drain;
      if (mode === 'move') p.safeT = Math.max(p.safeT || 0, 0.4);
      if (sp.kind === 'jet') {
        for (let i = 0; i < sp.perTick; i++) {
          const an = p.aim + (R() - 0.5) * 2 * sp.spread, s = sp.speed * (0.85 + R() * 0.3);
          this.parts.push({ x: c.x + dx * 6, y: c.y + dy * 6, vx: Math.cos(an) * s, vy: Math.sin(an) * s, g: 170, mat: M.WATER, life: 3, owner: p, push: sp.push });
        }
        if (!p.grounded) { p.vx -= dx * sp.recoil * DT; p.vy -= dy * sp.recoil * DT; }
      } else if (sp.kind === 'cone') {
        for (let i = 0; i < sp.perTick; i++) {
          const an = p.aim + (R() - 0.5) * 2 * sp.spread, d = 6 + R() * sp.range;
          const x = Math.round(c.x + Math.cos(an) * d), y = Math.round(c.y + Math.sin(an) * d);
          if (w.get(x, y) === M.EMPTY && R() < 0.6) w.set(x, y, M.STEAM);
        }
        for (const o of this.actors) {
          if (o === p || o.dead) continue;
          const ox = o.x - c.x, oy = (o.y - o.h / 2) - c.y, d = Math.hypot(ox, oy);
          let da = Math.atan2(oy, ox) - p.aim; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (d < sp.range + o.w / 2 && Math.abs(da) < sp.spread + 0.15) this.hurt(o, sp.power * DT, ox / (d || 1) * 4, 0, 'scald', p, key);
        }
      } else if (sp.kind === 'climb') {
        const touching = this.collides(p, p.x + 1.5, p.y) || this.collides(p, p.x - 1.5, p.y);
        if (touching) {
          p.noGravity = true;
          p.vy = p.moveY > 0 ? sp.speed : -sp.speed;
          if (R() < 0.3) this.burst(p.x, p.y - 4, 1, [[96, 84, 104]], 20);
        } else drain = 0; // only costs mana while clinging
      } else if (sp.kind === 'drill') {
        const md = this.moveDir(p, sp);
        p.noGravity = true;
        p.vx = md.x * sp.speed; p.vy = md.y * sp.speed;
        const bx = p.x + md.x * 6, by = p.y - p.h / 2 + md.y * 8;
        w.explode(bx, by, sp.radius);
        if (R() < 0.4) this.burst(bx + md.x * 6, by + md.y * 6, 2, [[184, 140, 128], [132, 84, 100]], 60);
        for (const o of this.actors) if (o !== p && !o.dead && Math.hypot(o.x - bx, (o.y - o.h / 2) - by) < sp.radius) {
          if (!o._drillT || this.time - o._drillT > 0.3) { o._drillT = this.time; this.hurt(o, 12, md.x * 120, md.y * 120 - 40, 'drill', p, key); }
        }
      }
      if (drain) this.spend(p, drain * DT);
      if (p.mana <= 0) this.endChannel(p, mode);
    }
    // in water, or water within a dozen cells under the feet
    nearWater(p) {
      if (p.inWater) return true;
      const w = this.world;
      for (let k = 0; k < 14; k++) for (const dx of [-3, 0, 3]) if (w.get(Math.round(p.x + dx), Math.round(p.y + k)) === M.WATER) return true;
      return false;
    }
    endChannel(p, mode) {
      const key = p.channels[mode];
      if (key && mode !== 'lift') p.cds[key + ':' + mode] = KRecipe.resolve(key.split('+'))[mode].cd || 0;
      p.channels[mode] = null;
    }
    endAllChannels(p) { for (const m of KData.modes) this.endChannel(p, m); p.liftArmed = false; }

    // Magma slam lands
    slamImpact(p) {
      const { sp, key } = p.slam;
      p.slam = null;
      // the magma splashes out to either side, not where you land
      this.fillBlob(Math.round(p.x - p.w), Math.round(p.y) - 1, M.MAGMA, sp.count >> 1);
      this.fillBlob(Math.round(p.x + p.w), Math.round(p.y) - 1, M.MAGMA, sp.count >> 1);
      p.safeT = 1;
      this.hitRadius(p.x, p.y - 4, sp.radius, sp.power, sp.knock, p, p, key);
      this.fx.push({ kind: 'ring', x: p.x, y: p.y - 2, r0: 3, r1: sp.radius, t: 0, T: 0.25, color: [255, 140, 50] });
      this.fx.push({ kind: 'flash', x: p.x, y: p.y - 2, r: 34, t: 0, T: 0.2, color: [255, 120, 40] });
      this.burst(p.x, p.y - 2, 20, [[255, 168, 64], [255, 120, 40], [184, 140, 128]], 140);
      this.shake = Math.max(this.shake, 3);
    }

    castPillar(p, sp, c, dx, dy, underSelf) {
      const w = this.world;
      const hit = w.ray(c.x, c.y, dx, dy, sp.range);
      const snap = Math.round(Math.atan2(-dy, -dx) / (Math.PI / 4)) * (Math.PI / 4);
      const gx = Math.round(Math.cos(snap)), gy = Math.round(Math.sin(snap));
      if (!hit.hit && underSelf) {
        // nothing below: a slab right under your feet to stand on
        for (let y = 0; y <= 2; y++) for (let x = -6; x <= 6; x++) {
          const cx = Math.round(p.x + x), cy = Math.round(p.y + 1 + y);
          if (w.get(cx, cy) === M.EMPTY) w.set(cx, cy, M.DIRT);
        }
        p.vy = Math.min(p.vy, 0);
        this.burst(p.x, p.y + 2, 10, [[184, 140, 128]], 50);
        return;
      }
      if (!hit.hit) {
        // nothing in range: a small slab where the ray ended
        for (let y = -1; y <= 1; y++) for (let x = -5; x <= 5; x++) {
          const cx = Math.round(hit.x + x), cy = Math.round(hit.y + y);
          if (w.get(cx, cy) === M.EMPTY && !this.actorAt(cx, cy)) w.set(cx, cy, M.DIRT);
        }
        this.burst(hit.x, hit.y, 8, [[184, 140, 128]], 40);
        return;
      }
      // start in the open cell next to the surface
      let sx = Math.floor(hit.lx), sy = Math.floor(hit.ly);
      if (gx === 0 && gy === -1) sy = Math.floor(hit.y) - 1;
      this.growths.push({ x: sx + 0.5, y: sy + 0.5, gx, gy, left: sp.length, acc: 0, rate: sp.growRate, half: (sp.width - 1) / 2 });
      this.burst(hit.x, hit.y, 10, [[184, 140, 128], [132, 84, 100]], 60);
    }

    updateGrowths() {
      const w = this.world;
      for (const g of this.growths) {
        g.acc += g.rate * DT;
        while (g.acc >= 1 && g.left > 0) {
          g.acc -= 1; g.left--;
          const px = -g.gy, py = g.gx;
          let blocked = true;
          const pushed = new Set();
          for (let o = -g.half; o <= g.half; o++) {
            const cx = Math.round(g.x + px * o - 0.5), cy = Math.round(g.y + py * o - 0.5);
            const m = w.get(cx, cy);
            if (m === M.ROCK) continue;
            if (!w.inb(cx, cy)) continue;
            blocked = false;
            if (!SOLID[m]) {
              for (const a of this.actors) if (!a.dead && !pushed.has(a) && this.inBox(a, cx + 0.5, cy + 0.5)) { pushed.add(a); this.pushActor(a, g.gx, g.gy, g.rate); }
              w.set(cx, cy, M.DIRT);
              if (g.gx && g.gy) { const ex = cx - g.gx; if (w.get(ex, cy) === M.EMPTY) w.set(ex, cy, M.DIRT); }
            }
          }
          if (blocked) { g.left = 0; break; }
          g.x += g.gx; g.y += g.gy;
        }
      }
      this.growths = this.growths.filter(g => g.left > 0);
    }

    pushActor(a, gx, gy, rate) {
      a.x += gx; a.y += gy;
      if (gy < 0) { a.vy = Math.min(a.vy, 0); a.grounded = true; }
      if (gx) a.vx = gx * Math.max(Math.abs(a.vx), rate * 0.6);
    }

    // Bolt and Arc: an instant line that stops at the first enemy, water or
    // solid. It then jumps to up to sp.chains more targets within sp.chainRange.
    castBolt(p, sp, key, c, dx, dy) {
      const w = this.world;
      let ex = c.x, ey = c.y, target = null, water = null;
      for (let d = 3; d <= sp.range; d += 1) {
        const x = c.x + dx * d, y = c.y + dy * d, ix = Math.floor(x), iy = Math.floor(y);
        const m = w.get(ix, iy);
        ex = x; ey = y;
        const a = this.actorAt(x, y, p);
        if (a) { target = a; break; }
        if (m === M.WATER) { water = { x: ix, y: iy }; break; }
        if (BLOCKS(m)) {
          if (m === M.MOSS && this.rand() < 0.8) w.set(ix, iy, M.FIRE);
          break;
        }
      }
      this.fx.push({ kind: 'bolt', pts: this.jagged(c.x + dx * 3, c.y + dy * 3, ex, ey), t: 0, T: 0.16, color: sp.color });
      if (target) this.hurt(target, sp.power, dx * sp.knock, dy * sp.knock - 30, 'bolt', p, key);
      this.landing(ex - dx * 2, ey - dy * 2, sp, p);
      if (water) {
        const n = w.electrify(water.x, water.y, sp.charge, sp.chargeCells);
        this.fx.push({ kind: 'flash', x: ex, y: ey, r: 18 + Math.min(40, n / 30), t: 0, T: 0.2, color: [180, 220, 255] });
      }
      // jump on to nearby targets
      const hitSet = new Set([p, target]);
      let lx = ex, ly = ey;
      const chains = (sp.chains || 0) + (this.has(p, 'chain') ? 1 : 0);
      for (let k = 0; k < chains && !water; k++) {
        let next = null, best = sp.chainRange;
        for (const a of this.actors) {
          if (hitSet.has(a) || a.dead) continue;
          const d = Math.hypot(a.x - lx, a.y - a.h / 2 - ly);
          if (d < best && !w.ray(lx, ly, (a.x - lx) / d, (a.y - a.h / 2 - ly) / d, d).hit) { best = d; next = a; }
        }
        if (!next) break;
        hitSet.add(next);
        this.hurt(next, sp.power * 0.7, (next.x - lx) / best * sp.knock * 0.5, -20, 'bolt', p, key);
        this.fx.push({ kind: 'bolt', pts: this.jagged(lx, ly, next.x, next.y - next.h / 2), t: 0, T: 0.18, color: sp.color });
        lx = next.x; ly = next.y - next.h / 2;
      }
      this.fx.push({ kind: 'flash', x: ex, y: ey, r: 14, t: 0, T: 0.1, color: sp.color });
      this.burst(ex, ey, 6, [[255, 246, 170], [255, 255, 255]], 90);
    }

    // Ember lance: a straight burning beam that passes through enemies.
    castLance(p, sp, key, c, dx, dy) {
      const w = this.world, hit = new Set([p]);
      let ex = c.x, ey = c.y;
      for (let d = 3; d <= sp.range; d += 1) {
        const x = c.x + dx * d, y = c.y + dy * d, ix = Math.floor(x), iy = Math.floor(y);
        ex = x; ey = y;
        const a = this.actorAt(x, y, null);
        if (a && !hit.has(a)) { hit.add(a); this.hurt(a, sp.power, dx * sp.knock, dy * sp.knock - 20, 'lance', p, key); }
        const m = w.get(ix, iy);
        if (m === M.WATER) { w.set(ix, iy, M.STEAM); break; }
        if (BLOCKS(m)) {
          if (m === M.ROCK && this.has(p, 'melt')) w.meltRock(ix, iy, 5);
          for (let k = 0; k < 6; k++) { const fx = ix + ((this.rand() - 0.5) * 6 | 0), fy = iy + ((this.rand() - 0.5) * 6 | 0), fm = w.get(fx, fy); if (fm === M.MOSS || (fm === M.EMPTY && this.rand() < 0.5)) w.set(fx, fy, M.FIRE); }
          break;
        }
      }
      this.landing(ex - dx * 2, ey - dy * 2, sp, p);
      this.fx.push({ kind: 'beam', x0: c.x + dx * 4, y0: c.y + dy * 4, x1: ex, y1: ey, t: 0, T: 0.14, color: sp.color });
      this.fx.push({ kind: 'flash', x: ex, y: ey, r: 12, t: 0, T: 0.12, color: sp.color });
    }

    jagged(x0, y0, x1, y1) {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 6));
      const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1), pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, off = (i === 0 || i === n) ? 0 : (this.rand() - 0.5) * 6;
        pts.push({ x: x0 + (x1 - x0) * t + nx * off, y: y0 + (y1 - y0) * t + ny * off });
      }
      return pts;
    }

    // ---------- projectiles ----------
    updateProjectiles() {
      const w = this.world;
      for (const pr of this.projectiles) {
        pr.age += DT;
        pr.vy += pr.g * DT;
        const sp = Math.hypot(pr.vx, pr.vy), n = Math.max(1, Math.ceil(sp * DT / 0.75));
        for (let s = 0; s < n && !pr.dead; s++) {
          const px = pr.x, py = pr.y;
          pr.x += pr.vx * DT / n; pr.y += pr.vy * DT / n;
          const ix = Math.floor(pr.x), iy = Math.floor(pr.y);
          if (!w.inb(ix, iy)) { pr.dead = true; break; }
          const m = w.mat[iy * w.w + ix];
          // your own projectiles can hit you after a moment; an enemy's never hit itself
          const hit = this.actorAt(pr.x, pr.y, pr.age < 0.15 || pr.owner.kind !== 'player' ? pr.owner : null, 1);
          if (pr.kind === 'spear') {
            pr.travelled += sp * DT / n;
            if (hit) { this.hurt(hit, pr.sp.power, pr.vx / sp * pr.sp.knock, pr.vy / sp * pr.sp.knock - 30, 'spear', pr.owner, pr.key); this.spark(pr.x, pr.y); pr.dead = true; break; }
            if (m === M.ROCK) { this.spark(pr.x, pr.y); pr.dead = true; break; }
            if (BLOCKS(m)) {
              w.explode(pr.x, pr.y, pr.sp.bore);
              pr.bore -= sp * DT / n;
              if (this.rand() < 0.25) this.burst(pr.x, pr.y, 1, [[184, 140, 128]], 40);
              if (pr.bore <= 0) { pr.dead = true; break; }
            }
            if (pr.travelled > pr.sp.range) pr.dead = true;
            continue;
          }
          if (pr.kind === 'fireball' && m === M.WATER) {
            for (let k = 0; k < 18; k++) { const x = ix + ((this.rand() - 0.5) * 8 | 0), y = iy - 1 - ((this.rand() * 5) | 0); if (w.get(x, y) === M.EMPTY) w.set(x, y, M.STEAM); }
            this.fx.push({ kind: 'ring', x: pr.x, y: pr.y, r0: 2, r1: 7, t: 0, T: 0.2, color: [220, 230, 240] });
            pr.dead = true; break;
          }
          if (hit || BLOCKS(m)) {
            this.impact(pr, px, py, hit);
            pr.dead = true; break;
          }
        }
        if (pr.age > 6) pr.dead = true;
      }
      this.projectiles = this.projectiles.filter(p => !p.dead);
    }

    impact(pr, px, py, hit) {
      const w = this.world, sp = pr.sp;
      if (!pr.mini) this.landing(px, py, sp, pr.owner);
      if (pr.kind === 'fireball') {
        const x = pr.x, y = pr.y;
        w.explode(x, y, sp.radius * (pr.mini ? 0.55 : 1), { fire: sp.ignite, boil: 0.5, melt: this.has(pr.owner, 'melt') });
        if (!pr.mini && this.has(pr.owner, 'split')) for (const an of [-2.2, -1.57, -0.9]) {
          this.projectiles.push({ kind: 'fireball', mini: true, sp, key: pr.key, owner: pr.owner, x: px, y: py, vx: Math.cos(an) * 150, vy: Math.sin(an) * 150, g: 260, age: 0.2 });
        }
        this.hitRadius(x, y, (sp.radius + 6) * (pr.mini ? 0.6 : 1), sp.power * (pr.mini ? 0.4 : 1), sp.knock * (pr.mini ? 0.5 : 1), null, pr.owner, pr.key);
        this.fx.push({ kind: 'ring', x, y, r0: 3, r1: sp.radius + 4, t: 0, T: 0.25, color: [255, 190, 90] });
        this.fx.push({ kind: 'flash', x, y, r: 34, t: 0, T: 0.18, color: [255, 160, 70] });
        this.burst(x, y, 26, [[184, 140, 128], [132, 84, 100], [255, 170, 70]], 150);
        this.sfx('explosion', x, y, pr.mini ? 0.5 : 1);
        this.shake = Math.max(this.shake, 3);
      } else if (pr.kind === 'blob') {
        if (hit) this.hurt(hit, sp.power, pr.vx * 0.3, -40, 'magma', pr.owner, pr.key);
        this.fillBlob(Math.floor(px), Math.floor(py), M[sp.mat], sp.count);
        this.burst(px, py, 8, [[255, 168, 64], [255, 120, 40]], 70);
        this.sfx('magma', px, py, 0.7);
      } else if (pr.kind === 'boulder') {
        const s = Math.hypot(pr.vx, pr.vy) || 1;
        if (hit) this.hurt(hit, sp.power, pr.vx / s * sp.knock, pr.vy / s * sp.knock - 60, 'boulder', pr.owner, pr.key);
        else this.hitRadius(pr.x, pr.y, 8, sp.power * 0.5, sp.knock * 0.5, null, pr.owner, pr.key);
        w.explode(pr.x, pr.y, sp.dig);
        this.fillBlob(Math.floor(px), Math.floor(py), M.EARTH, sp.rubble);
        this.sfx('earth', px, py);
        this.burst(px, py, 14, [[184, 140, 128], [150, 143, 138], [96, 90, 94]], 100);
        this.shake = Math.max(this.shake, 2);
      }
    }

    // Fill up to count empty cells around (x,y), nearest first.
    fillBlob(x, y, m, count) {
      const w = this.world, seen = new Set([y * w.w + x]), q = [[x, y]];
      let placed = 0;
      while (q.length && placed < count) {
        const [cx, cy] = q.shift();
        if (Math.hypot(cx - x, cy - y) > 6) continue;
        const here = w.get(cx, cy);
        if (here === M.EMPTY) { w.set(cx, cy, m); placed++; }
        else if (SOLID[here]) continue;
        for (const [nx, ny] of [[cx, cy - 1], [cx - 1, cy], [cx + 1, cy], [cx, cy + 1]]) {
          const k = ny * w.w + nx;
          if (!seen.has(k) && w.inb(nx, ny)) { seen.add(k); q.push([nx, ny]); }
        }
      }
    }

    // ---------- particles ----------
    // Material particles fly freely and become a cell when they land.
    // Visual particles (mat -1) are only drawn.
    updateParticles() {
      const w = this.world;
      for (const pt of this.parts) {
        pt.life -= DT;
        pt.vy += pt.g * DT;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(pt.vx), Math.abs(pt.vy)) * DT));
        for (let s = 0; s < n; s++) {
          const ox = pt.x, oy = pt.y;
          pt.x += pt.vx * DT / n; pt.y += pt.vy * DT / n;
          const ix = Math.floor(pt.x), iy = Math.floor(pt.y);
          if (!w.inb(ix, iy)) { pt.life = 0; break; }
          const m = w.mat[iy * w.w + ix];
          if (pt.mat < 0) {
            if (SOLID[m]) { pt.x = ox; pt.y = oy; pt.vx *= -0.3; pt.vy *= -0.3; }
            continue;
          }
          if (pt.push && !pt.pushed) {
            const a = this.actorAt(pt.x, pt.y, pt.owner);
            if (a) { a.vx += pt.vx * pt.push; a.vy += pt.vy * pt.push * 0.6; pt.pushed = true; pt.vx *= 0.3; }
          }
          if (pt.mat === M.WATER && m === M.FIRE) { w.set(ix, iy, M.STEAM); pt.life = 0; break; }
          if (pt.mat === M.MUD) {
            // mud that hits someone coats them and slows them for a while
            const a = this.actorAt(pt.x, pt.y, pt.owner);
            if (a) { a.slowT = Math.max(a.slowT || 0, MUD_COAT); pt.life = 0; pt.landed = true; break; }
          }
          if (m !== M.EMPTY) {
            const lx = Math.floor(ox), ly = Math.floor(oy);
            if (w.get(lx, ly) === M.EMPTY) w.set(lx, ly, pt.mat);
            else if (w.get(lx, ly - 1) === M.EMPTY) w.set(lx, ly - 1, pt.mat);
            pt.life = 0; pt.landed = true; break;
          }
        }
        if (pt.life <= 0 && pt.mat >= 0 && !pt.landed) {
          // timed out in the air: drop it where it is
          const ix = Math.floor(pt.x), iy = Math.floor(pt.y);
          if (w.get(ix, iy) === M.EMPTY) w.set(ix, iy, pt.mat);
          pt.landed = true;
        }
      }
      this.parts = this.parts.filter(p => p.life > 0);
      if (this.parts.length > 2500) this.parts.splice(0, this.parts.length - 2500);
    }

    burst(x, y, n, colors, speed) {
      const R = this.rand;
      for (let i = 0; i < n; i++) {
        const an = R() * Math.PI * 2, s = speed * (0.3 + R() * 0.7);
        this.parts.push({ x, y, vx: Math.cos(an) * s, vy: Math.sin(an) * s - speed * 0.3, g: 300, mat: -1, life: 0.4 + R() * 0.5, color: colors[(R() * colors.length) | 0] });
      }
    }
    spark(x, y) { this.burst(x, y, 8, [[255, 246, 170], [200, 205, 215]], 110); }

    // ---------- actors ----------
    inBox(a, x, y, pad = 0) {
      if (a.kind === 'boss') return this.bossNear(a, x, y) < a.segR + pad;
      return x >= a.x - a.w / 2 - pad && x <= a.x + a.w / 2 + pad && y >= a.y - a.h - pad && y <= a.y + pad; }
    actorAt(x, y, except, pad = 0) {
      for (const a of this.actors) if (a !== except && !a.dead && this.inBox(a, x, y, pad)) return a;
      return null;
    }

    hitRadius(x, y, r, dmg, knock, except, src, spell) {
      for (const a of this.actors) {
        if (a.dead || a === except) continue;
        let cx = a.x, cy = a.y - a.h / 2, d = Math.hypot(cx - x, cy - y);
        if (a.kind === 'boss') { const n = this.bossNearest(a, x, y); cx = n.x; cy = n.y; d = Math.max(0, n.d - a.segR); }
        if (d > r) continue;
        const f = 1 - (d / r) * 0.6, nx = (cx - x) / (d || 1), ny = (cy - y) / (d || 1);
        this.hurt(a, dmg * f, nx * knock * f, ny * knock * f - 60 * f, 'blast', src, spell);
      }
    }

    // Damage from stats. base: the spell's power (or a hazard's rate).
    // src: who cast it (null for hazards). spell: the spell key, whose two
    // elements (the whole recipe, averaged) set which element powers apply.
    //   damage = base x element power x 2A/(A+D) x modifiers
    // With equal attack and defence the middle term is 1, so base is the damage.
    damage(src, target, base, spell) {
      const ts = target.stats || KData.baseStats();
      const atk = src && src.stats ? src.stats.attack : ts.defence;
      let pow = 1;
      const els = spell ? KRecipe.parse(spell).q : null;
      if (src && src.stats && els) { pow = 0; for (const e of els) pow += src.stats.power[e] || 1; pow /= els.length; }
      // the target's element affinity (averaged over the spell's two elements) and status combos
      let mods = 1;
      if (spell) {
        const S = KData.statuses;
        mods = 0; for (const e of els) mods += this.affinity(target, e); mods /= els.length;
        if (target.wetT > 0 && els.includes(S.wet.boosts)) mods *= S.wet.by;
        if (target.stranded) mods *= KData.bosses[target.type].strandMul;
        if ((target.slowT > 0 || target.inMud) && els.includes(S.muddy.boosts)) mods *= S.muddy.by;
        if (target.burnT > 0 && els.includes(S.burning.boosts)) mods *= S.burning.by;
      }
      return base * pow * (2 * atk / (atk + ts.defence)) * mods;
    }
    affinity(a, el) { const E = a.kind === 'boss' ? KData.bosses[a.type] : KData.enemies[a.kind]; return E && E.affinity && E.affinity[el] != null ? E.affinity[el] : 1; }
    statusText(a) {
      const t = [];
      if (a.wetT > 0) t.push('Wet: lightning hits it 50% harder.');
      if (a.slowT > 0 || a.inMud) t.push('Muddy: slowed, and fire hits it 40% harder.');
      if (a.burnT > 0) t.push('Burning: water hits it 40% harder.');
      if (a.stranded) t.push('Stranded: takes double damage.');
      return t.length ? ' ' + t.join(' ') : '';
    }

    hurt(a, amount, kx, ky, kind, src, spell) {
      if (a.dead || amount <= 0) return;
      if (src && src.kind === 'player') { a.lastHitBy = src; a.lastHitAt = this.time; }
      if (spell && spell.includes('earth') && this.has(src, 'quarry')) { kx = (kx || 0) * 1.6; ky = (ky || 0) * 1.6; }
      if (this.has(a, 'anchor')) { kx = (kx || 0) * 0.25; ky = (ky || 0) * 0.25; }
      if (kind !== 'burn' && spell && spell.includes('fire') && this.has(src, 'burn') && a !== src) { a.burnT = 3; a.burnBy = src; }
      // what a recipe's modifier elements do to whoever is hit
      let chain = 0;
      const raw = amount;
      if (spell && src && src.kind === 'player' && a !== src && kind !== 'chain' && kind !== 'burn') {
        const o = KRecipe.parse(spell).other, RC = KData.recipe;
        if (o.fire) { a.burnT = Math.max(a.burnT || 0, RC.burn + o.fire - 1); a.burnBy = src; }
        if (o.earth) { kx = (kx || 0) * (1 + RC.knock * o.earth); ky = (ky || 0) * (1 + RC.knock * o.earth); }
        chain = o.lightning;
      }
      amount = this.damage(src || null, a, amount, spell);
      if (a.kind === 'player') { if (a.skinT > 0) amount *= 1 - KData.specials.stoneskin.reduce; if (a.guardT > 0) amount *= 1 - (a.guard || 0); }
      this.showDamage(a, amount, kind, src);
      if (chain) {
        // lightning jumps on to one more enemy per copy, for a share of the damage (held spells: in pulses)
        a._chainAcc = (a._chainAcc || 0) + raw;
        if (this.time - (a._chainAt || -9) > 0.3) {
          const share = a._chainAcc * KData.recipe.chainShare; a._chainAcc = 0; a._chainAt = this.time;
          const near = this.actors.filter(o => o !== a && o !== src && !o.dead && o.kind !== 'player' && Math.hypot(o.x - a.x, o.y - a.y) < KData.recipe.chainRange)
            .sort((u, v) => Math.hypot(u.x - a.x, u.y - a.y) - Math.hypot(v.x - a.x, v.y - a.y)).slice(0, chain);
          for (const o of near) {
            this.fx.push({ kind: 'bolt', pts: this.jagged(a.x, a.y - a.h / 2, o.x, o.y - o.h / 2), t: 0, T: 0.14, color: [255, 246, 170] });
            this.hurt(o, share, 0, -20, 'chain', src, 'lightning');
          }
          if (near.length) this.sfx('shock', a.x, a.y, 0.4);
        }
      }
      if (spell && spell.includes('water')) { if (a.burnT > 0) { a.burnT = 0; this.burst(a.x, a.y - a.h / 2, 6, [[204, 206, 230]], 50); } a.wetT = KData.statuses.wet.time; }
      a.hp -= amount; a.lastHurt = this.time;
      a.vx += kx || 0; a.vy += ky || 0;
      if (amount >= 4) {
        a.flash = 0.1;
        const col = a.kind === 'player' ? [[240, 228, 206], [198, 178, 160]] : a.kind === 'crawler' ? [[78, 72, 94], [112, 104, 128]] : [[150, 140, 165], [200, 194, 214]];
        this.burst(a.x, a.y - a.h / 2, Math.min(14, 2 + amount / 5), col, 80);
      }
      if (a.kind !== 'player' && a.kind !== 'dummy' && src && src.kind === 'player') { a.lastSeen = this.time; a.knownX = src.x; }
      if (a.kind === 'crawler' && amount >= KData.enemies.crawler.staggerAt && a.hp > 0) { a.state = 'stagger'; a.t = 0; }
      if (a.kind === 'moth' && amount >= 10 && a.hp > 0 && a.state === 'windup') { a.state = 'recover'; a.t = 0; }
      if (a.kind === 'warden' && amount >= 40 && a.hp > 0 && a.state === 'windup') { a.state = 'recover'; a.t = 0; }
      if (a.hp <= 0) this.kill(a);
    }

    // Damage numbers, hit sounds and the hit-stop. Damage over time adds up
    // and shows every 4 points or so.
    showDamage(a, amount, kind, src) {
      if (amount <= 0) return;
      const dot = kind === 'fire' || kind === 'magma' || kind === 'shock' || kind === 'burn' || kind === 'scald' || kind === 'drill';
      let show = amount;
      if (dot) { a.dotAcc = (a.dotAcc || 0) + amount; if (a.dotAcc < 4) return; show = a.dotAcc; a.dotAcc = 0; }
      const color = a.kind === 'player' ? [255, 110, 100] : a.elite || a.kind === 'boss' ? [255, 211, 122] : [240, 236, 228];
      const n = this.bossNearest && a.kind === 'boss' ? this.bossNearest(a, a.x, a.y) : { x: a.x, y: a.y - a.h };
      this.fx.push({ kind: 'num', x: n.x + (this.rand() - 0.5) * 6, y: (a.kind === 'boss' ? n.y - 8 : a.y - a.h - 2), val: Math.max(1, Math.round(show)), t: 0, T: 0.8, color });
      if (dot) return;
      const now = this.time;
      if (now - (a.sndAt || -1) > 0.06) { a.sndAt = now; this.sfx(a.kind === 'player' ? 'hurt' : 'hit', a.x, a.y - a.h / 2, Math.min(1, 0.4 + amount / 40)); }
      if (a.kind === 'player' && amount >= 15) this.hitStop = Math.max(this.hitStop, 0.06);
      else if (src && src.kind === 'player' && amount >= 30) this.hitStop = Math.max(this.hitStop, 0.045);
    }

    kill(a) {
      if (a.kind === 'boss') return this.bossDefeated(a);
      this.sfx('crumble', a.x, a.y - a.h / 2, a.kind === 'player' ? 1.2 : 0.8);
      a.dead = true; a.hp = 0;
      // experience to whoever hit it last (hazards a player caused count for 8 s)
      if (a.kind !== 'player' && a.kind !== 'dummy' && a.lastHitBy && this.time - a.lastHitAt < 8 && !a.lastHitBy.dead)
        this.gainXp(a.lastHitBy, Math.max(1, Math.round(KData.progression.killXp(a.level || 1, a.kind, a.elite) * KData.progression.underLevel(a.lastHitBy.level - (a.level || 1)))), 'kill');
      if (a.kind === 'player') this.events.push({ type: 'died' });
      else if (a.kind !== 'dummy' && a.lastHitBy && (a.elite || a.boss || this.rand() < KData.runes.dropChance)) {
        const n = a.boss ? 2 : 1;
        for (let k = 0; k < n; k++) this.dropRune(a.x, a.y - a.h / 2, this.makeRune(a.level || 1, a.boss ? { tier: Math.min(3, 2 + k) } : a.elite ? { tier: Math.max(1, KData.runes.tierFor(a.level, this.rand())) } : {}));
      }
      a.respawnT = a.kind === 'player' ? PD.respawn : KData.enemies[a.kind] ? KData.enemies[a.kind].respawn : DD.respawn;
      const col = a.kind === 'player' ? [[240, 228, 206], [198, 178, 160], [44, 28, 36]] : a.kind === 'dummy' ? [[150, 140, 165], [200, 194, 214], [74, 58, 48]] : [[78, 72, 94], [112, 104, 128], [255, 70, 160]];
      if (a.kind === 'crawler' || a.kind === 'warden' || a.kind === 'delver') {
        // it crumbles into loose earth
        const w = this.world;
        for (let k = 0; k < 14; k++) {
          const x = Math.round(a.x + (this.rand() - 0.5) * 8), y = Math.round(a.y - 1 - this.rand() * 5);
          if (w.get(x, y) === M.EMPTY) w.set(x, y, M.EARTH);
        }
      }
      this.burst(a.x, a.y - a.h / 2, 40, col, 140);
      if (a.kind === 'player') { this.endAllChannels(a); a.slam = null; a.dashT = 0; this.shake = Math.max(this.shake, 3); }
    }

    // ---------- enemies ----------
    // Shared by every kind: sleeping when far away, coming back after death,
    // noticing players. Then each kind's own behaviour.
    enemyTick(e) {
      const E = KData.enemies[e.kind];
      e.flash = Math.max(0, e.flash - DT);
      if (e.wetT > 0) e.wetT -= DT;
      e.asleep = !e.dead && !this.players.some(q => Math.abs(q.x - e.x) < E.awake && Math.abs(q.y - e.y) < E.awake * 0.7);
      if (e.asleep) return;
      if (e.dead) { e.respawnT -= DT; if (e.respawnT <= 0) this.respawnCrawler(e); return; }
      if (e.kind === 'crawler') return this.crawlerTick(e);
      e.t = (e.t || 0) + DT;
      const w = this.world;
      let p = null, best = 1e9;
      for (const q of this.players) if (!q.dead) { const dd = Math.hypot(q.x - e.x, q.y - e.y); if (dd < best) { best = dd; p = q; } }
      let see = false;
      if (p) {
        // look from the eyes (a spitter's mouth sticks out of its wall)
        const ex = e.x + (e.kind === 'spitter' ? e.face * 7 : 0), ey = e.y - (e.kind === 'spitter' ? 7 : e.h / 2);
        const dx = p.x - ex, dy = (p.y - p.h / 2) - ey, dist = Math.hypot(dx, dy);
        if (dist < E.sight + (e.kind === 'spitter' ? 60 : 0)) see = !w.ray(ex, ey, dx / dist, dy / dist, dist).hit;
        // delvers feel footsteps through the ground
        if (see || dist < E.sense || (e.kind === 'delver' && dist < 150)) { e.lastSeen = this.time; e.knownX = p.x; }
      }
      const aware = p && this.time - (e.lastSeen ?? -9) < E.forget;
      const set = s => { e.state = s; e.t = 0; };
      if (!e.state || e.state === 'patrol') e.state = aware ? 'chase' : 'idle';
      if (e.slowT > 0) e.slowT -= DT;
      const slow = (e.inMud || e.slowT > 0) ? 0.35 : 1;
      this['tick_' + e.kind](e, E, p, aware, see, set, slow, w);
    }

    // Glowmoth: drifts near home; aware, it hovers off to one side above you,
    // glows (the warning), swoops, then flutters away.
    tick_moth(e, E, p, aware, see, set, slow, w) {
      const steer = (tx, ty, speed, rate) => {
        const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
        e.vx += (dx / d * speed - e.vx) * Math.min(1, rate * DT); e.vy += (dy / d * speed - e.vy) * Math.min(1, rate * DT);
      };
      switch (e.state) {
        case 'idle':
          steer(e.home.x + Math.sin(this.time * 0.7 + e.id) * 20, e.home.y + Math.cos(this.time * 0.9 + e.id) * 10, E.fly * 0.5 * slow, 2);
          if (aware) set('chase');
          break;
        case 'chase': {
          if (!aware) { set('idle'); break; }
          const side = e.x < p.x ? -1 : 1, tx = p.x + side * 40, ty = p.y - p.h - 28;
          steer(tx, ty, E.fly * slow, 3);
          if (see && Math.hypot(e.x - tx, e.y - ty) < 16 && e.t > 0.6) { set('windup'); this.sfx('warnMoth', e.x, e.y); }
          break;
        }
        case 'windup':
          if (!p) { set('recover'); break; }
          e.vx *= Math.exp(-6 * DT); e.vy *= Math.exp(-6 * DT);
          if (e.t > E.windup / Math.sqrt(slow)) {
            const dx = p.x - e.x, dy = (p.y - p.h / 2) - e.y, d = Math.hypot(dx, dy) || 1;
            e.vx = dx / d * E.swoop * Math.sqrt(slow); e.vy = dy / d * E.swoop * Math.sqrt(slow); e.hit = false; set('swoop');
          }
          break;
        case 'swoop':
          this.contactHit(e, E);
          if (e.t > E.swoopTime) set('recover');
          break;
        case 'recover':
          steer(e.x + (e.x < (p ? p.x : e.x) ? -30 : 30), e.y - 40, E.fly * slow, 2.5);
          if (e.t > E.recover) set(aware ? 'chase' : 'idle');
          break;
        default: set('idle');
      }
      e.facing = e.vx >= 0 ? 1 : -1;
    }

    // Delver: inside dirt it swims towards you (no collision); close by it
    // bursts out, winds up and bites, then dives back into the ground.
    tick_delver(e, E, p, aware, see, set, slow, w) {
      const inDirt = this.inDiggable(e);
      switch (e.state) {
        case 'idle':
        case 'chase': {
          // only a delver inside the ground swims through it; above ground it walks until it can dive
          if (!inDirt && e.t > 0.6) { e.ghost = false; set('out'); break; }   // (0.6 s to sink in after a dive)
          e.ghost = true;
          if (!aware) { e.vx *= 0.9; e.vy *= 0.9; break; }
          // head for a spot just under the ground beside you, on the side it is coming from
          const side = e.x < (e.knownX ?? p.x) ? -1 : 1;
          const tx = (e.knownX ?? p.x) + side * 26, ty = p.y + 7, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
          let vx = dx / d * E.dig * slow, vy = dy / d * E.dig * slow;
          // stay inside the ground until close
          const nx = e.x + vx * DT * 4, ny = e.y + vy * DT * 4;
          if (!this.diggableAt(nx, ny - e.h / 2) && d > E.emergeRange) { vx *= 0.2; vy = this.diggableAt(e.x, e.y - e.h / 2 + 4) ? 20 : vy; }
          e.vx = vx; e.vy = vy;
          if (d < 10 && p && Math.abs(p.x - e.x) < E.emergeRange + 10) { set('emerge'); this.sfx('warnDelver', e.x, e.y); }

          break;
        }
        case 'emerge': {
          // burst up out of the ground and stand on it
          w.explode(e.x, e.y - e.h / 2, 7);
          let y = Math.round(e.y);
          for (let k = 0; k < 30 && this.collides(e, e.x, y); k++) y--;
          e.y = y;
          this.burst(e.x, e.y - e.h / 2, 16, [[184, 140, 128], [132, 84, 100]], 120);
          e.ghost = false; e.vx = 0; e.vy = -80; this.shake = Math.max(this.shake, 1.5);
          set('windup');
          break;
        }
        case 'windup':
          e.vx *= Math.exp(-10 * DT);
          if (p && e.t > E.windup / Math.sqrt(slow)) {
            const dx = p.x - e.x, dy = (p.y - p.h / 2) - (e.y - e.h / 2), d = Math.hypot(dx, dy) || 1;
            e.dir = Math.sign(dx) || 1; e.vx = dx / d * E.lunge * Math.sqrt(slow); e.vy = Math.min(-90, dy / d * E.lunge); e.hit = false; set('lunge');
          }
          break;
        case 'lunge':
          this.contactHit(e, E);
          if (e.t > 0.45) set('out');
          break;
        case 'out':
          // above ground: head down into the nearest dirt and dive back in
          e.ghost = false;
          if (e.grounded && this.diggableAt(e.x, e.y + 3)) { if (e.t > E.surface) { e.ghost = true; e.vy = 40; set('chase'); } }
          else if (e.grounded && p) e.vx = Math.sign(p.x - e.x) * 30 * slow;
          if (e.t > 6 && this.diggableAt(e.x, e.y + 3)) { e.ghost = true; e.vy = 40; set('chase'); }
          break;
        default: set('chase');
      }
      e.facing = e.vx >= 0 ? 1 : -1;
    }
    diggableAt(x, y) { const m = this.world.get(Math.round(x), Math.round(y)); return m === M.DIRT || m === M.EARTH || m === M.MOSS || m === M.MUD || m === M.CRYSTAL; }
    inDiggable(e) { return this.diggableAt(e.x, e.y - e.h / 2) || this.diggableAt(e.x - 4, e.y - 2) || this.diggableAt(e.x + 4, e.y - 2); }

    // Cinder spitter: set in a wall; when it sees you in range it glows, then
    // lobs a glob of magma on an arc that lands on you. If its wall is dug
    // away, it falls.
    tick_spitter(e, E, p, aware, see, set, slow, w) {
      if (e.anchored) {
        e.vx = e.vy = 0;
        let held = false;
        for (let k = -6; k <= 6 && !held; k += 2) if (SOLID[w.get(Math.round(e.x - e.face * 7), Math.round(e.y - 5 + k))] || SOLID[w.get(Math.round(e.x), Math.round(e.y + 1))]) held = true;
        if (!held) e.anchored = false;
      }
      if (p) e.face = Math.sign(p.x - e.x) || e.face;
      e.fireT -= DT * slow;
      const wasCharging = e.charging;
      e.charging = e.fireT < 0.5;
      if (e.charging && !wasCharging && see) this.sfx('warnSpitter', e.x, e.y);
      if (e.fireT <= 0) {
        e.fireT = E.every;
        if (!p || !see || Math.hypot(p.x - e.x, p.y - e.y) > E.range) return;
        const mx = e.x + e.face * 5, my = e.y - 7;
        const dx = p.x - mx, dy = (p.y - 6) - my, g = 380, v = E.speed;
        // aim on a falling arc: the lower of the two angles that reach the target
        const disc = v ** 4 - g * (g * dx * dx + 2 * dy * v * v);
        let an;
        if (disc >= 0) an = Math.atan2(v * v - Math.sqrt(disc), g * Math.abs(dx));
        else an = Math.PI / 4;
        const vx = Math.cos(an) * v * Math.sign(dx || 1), vy = -Math.sin(an) * v;
        const sp = { power: E.power, count: E.glob, mat: 'MAGMA' };
        this.projectiles.push({ kind: 'blob', sp, key: 'earth+fire', owner: e, x: mx, y: my, vx, vy, g, age: 0 });
        this.sfx('magma', mx, my, 0.6);
        this.burst(mx, my, 6, [[255, 168, 64], [255, 120, 40]], 60);
      }
    }

    // Slate warden: walks to you, raises its arms (the warning), slams the
    // ground: a shockwave around it. Big hits barely stagger it.
    tick_warden(e, E, p, aware, see, set, slow, w) {
      const toward = (v, target, rate) => v + Math.sign(target - v) * Math.min(Math.abs(target - v), rate * DT);
      switch (e.state) {
        case 'idle':
          if (e.grounded) e.vx = toward(e.vx, 0, 200);
          if (aware) set('chase');
          break;
        case 'chase':
          if (!aware) { set('idle'); break; }
          e.dir = Math.sign((e.knownX ?? p.x) - e.x) || 1;
          if (e.grounded) {
            e.vx = toward(e.vx, e.dir * E.walk * slow, 300);
            const fx = Math.round(e.x + e.dir * (e.w / 2 + 1));
            if (SOLID[w.get(fx, Math.round(e.y - 3))] && SOLID[w.get(fx, Math.round(e.y - 6))] && this.time - (e.jumpedAt || -9) > 0.6) { e.vy = -150; e.jumpedAt = this.time; }
          }
          if (p && e.grounded && Math.abs(p.x - e.x) < E.slamRange && Math.abs(p.y - e.y) < 24) { set('windup'); this.sfx('warnWarden', e.x, e.y); }
          break;
        case 'windup':
          e.vx *= Math.exp(-10 * DT);
          if (e.t > E.windup / Math.sqrt(slow)) {
            // the slam
            for (const a of this.actors) {
              if (a === e || a.dead || a.kind !== 'player') continue;
              const d = Math.hypot(a.x - e.x, (a.y - a.h / 2) - (e.y - 4));
              if (d < E.radius) this.hurt(a, E.power * (1 - d / E.radius * 0.5), Math.sign(a.x - e.x) * E.knock * 0.6, -E.knock, 'slam', e, 'earth+earth');
            }
            w.explode(e.x, e.y + 2, 4);
            this.sfx('slam', e.x, e.y);
            this.fx.push({ kind: 'ring', x: e.x, y: e.y - 2, r0: 4, r1: E.radius, t: 0, T: 0.3, color: [200, 190, 180] });
            this.burst(e.x, e.y - 2, 20, [[150, 143, 138], [184, 140, 128]], 140);
            this.shake = Math.max(this.shake, 3);
            set('recover');
          }
          break;
        case 'recover':
          e.vx *= Math.exp(-8 * DT);
          if (e.t > E.recover) set(aware ? 'chase' : 'idle');
          break;
        default: set('idle');
      }
      e.facing = e.dir || 1;
    }

    // one touch hit during a swoop or a lunge
    contactHit(e, E) {
      if (e.hit) return;
      for (const q of this.players) {
        if (q.dead) continue;
        if (Math.abs(q.x - e.x) < (q.w + e.w) / 2 && Math.abs((q.y - q.h / 2) - (e.y - e.h / 2)) < (q.h + e.h) / 2) {
          this.hurt(q, E.power, Math.sign(q.x - e.x || 1) * E.knock, -80, 'bite', e, null);
          e.hit = true;
        }
      }
    }

    // ---------- Shale crawler ----------
    crawlerTick(e) {
      const E = KData.enemies.crawler, w = this.world;
      e.t += DT;
      const set = s => { e.state = s; e.t = 0; };
      if (e.slowT > 0) e.slowT -= DT;
      const slow = (e.inMud || e.slowT > 0) ? MUD_SLOW : 1;
      // nearest living player, and whether it can be seen
      let p = null, best = 1e9;
      for (const q of this.players) if (!q.dead) { const dd = Math.hypot(q.x - e.x, q.y - e.y); if (dd < best) { best = dd; p = q; } }
      let see = false, dx = 0, dy = 0;
      if (p) {
        dx = p.x - e.x; dy = (p.y - p.h / 2) - (e.y - e.h / 2);
        const dist = Math.hypot(dx, dy);
        if (dist < E.sight) see = !w.ray(e.x, e.y - e.h + 1, dx / dist, dy / dist, dist).hit;
      }
      // it notices you by sight, by being close, by being hurt or by hearing a spell (alert())
      if (see || (p && Math.hypot(dx, dy) < E.sense)) { e.lastSeen = this.time; e.knownX = p.x; }
      const aware = this.time - e.lastSeen < E.forget;
      if (p && aware && !see) dx = (e.knownX ?? p.x) - e.x;
      const fx = dir => Math.round(e.x + dir * (e.w / 2 + 1));
      const wallAhead = dir => w.solid(fx(dir), Math.round(e.y - 2)) && w.solid(fx(dir), Math.round(e.y - 4));
      const ledgeAhead = dir => !w.solid(fx(dir), Math.round(e.y + 1)) && !w.solid(fx(dir), Math.round(e.y + 5));
      const toward = (v, target, rate) => v + Math.sign(target - v) * Math.min(Math.abs(target - v), rate * DT);
      switch (e.state) {
        case 'stagger':
          if (e.t > E.stagger) set(see ? 'chase' : 'patrol');
          break;
        case 'patrol':
          if (e.grounded) {
            if (ledgeAhead(e.dir) || (wallAhead(e.dir) && e.stuckT >= 1)) { e.dir = -e.dir; e.stuckT = 0; }
            else if (wallAhead(e.dir)) this.crawlerJump(e, 1);
            e.vx = toward(e.vx, e.dir * E.walk * slow, 300 * slow);
          }
          this.crawlerStuck(e, true);
          if (aware) set('chase');
          break;
        case 'chase': {
          if (!p || !aware) { set('patrol'); break; }
          if (Math.abs(dx) > 2) e.dir = Math.sign(dx);
          // you are above it and something is overhead: walk out to the side first
          const above = dy < -14;
          const roof = above && w.ray(e.x, e.y - e.h, 0, -1, Math.min(60, -dy + 6)).hit;
          if (roof && e.grounded && !(e.flankT > 0)) { e.flankT = 1.1; e.flankDir = Math.abs(dx) < 4 ? e.dir : -Math.sign(dx); }
          let moveDir = e.dir;
          if (e.flankT > 0) { e.flankT -= DT; moveDir = e.flankDir; if (!roof) e.flankT = 0; }
          if (e.grounded) {
            e.vx = toward(e.vx, moveDir * E.run * slow, 500 * slow);
            // jump at walls, onto ledges you stand on, and across gaps towards you
            // (after a second of no progress it stops jumping and chews instead)
            if (e.stuckT >= 1) { /* chewing: see crawlerStuck */ }
            else if (wallAhead(moveDir)) this.crawlerJump(e, 1);
            else if (above && !roof && Math.abs(dx) < 70) this.crawlerJump(e, Math.min(1.4, Math.sqrt(2 * PD.gravity * (-dy + 10)) / E.jump));
            else if (ledgeAhead(moveDir) && Math.abs(dx) > 16 && dy < 30) this.crawlerJump(e, 0.9);
          } else {
            e.vx = toward(e.vx, e.dir * E.run * slow, 160 * slow); // steer a little in the air
          }
          this.crawlerStuck(e, false);
          if (see && e.grounded && Math.abs(dx) < E.lungeRange && Math.abs(dy) < 18) { set('windup'); this.sfx('warnCrawler', e.x, e.y); }
          break;
        }
        case 'windup':
          // the warning: it stops, rears up and its eyes flare
          e.vx *= Math.exp(-12 * DT);
          if (p && Math.abs(dx) > 2) e.dir = Math.sign(dx);
          if (e.t > E.windup / Math.sqrt(slow)) { set('lunge'); e.vx = e.dir * E.lungeSpeed * Math.sqrt(slow); e.vy = -E.lungeLift * Math.sqrt(slow); e.grounded = false; e.hit = false; }
          break;
        case 'lunge':
          if (!e.hit) for (const q of this.players) {
            if (q.dead) continue;
            if (Math.abs(q.x - e.x) < (q.w + e.w) / 2 && Math.abs((q.y - q.h / 2) - (e.y - e.h / 2)) < (q.h + e.h) / 2) {
              this.hurt(q, E.power, e.dir * E.knock, -80, 'bite', e, null);
              e.hit = true;
            }
          }
          if ((e.t > 0.1 && e.grounded) || e.t > E.lungeTime + 0.6) set('recover');
          break;
        case 'recover':
          if (e.grounded) e.vx *= Math.exp(-8 * DT);
          if (e.t > E.recover) set(see ? 'chase' : 'patrol');
          break;
      }
      e.facing = e.dir;
    }

    crawlerJump(e, k) {
      if (!e.grounded || this.time - (e.jumpedAt || -9) < 0.35) return;
      const slow = (e.inMud || e.slowT > 0) ? 0.7 : 1;
      e.vy = -KData.enemies.crawler.jump * k * slow; e.grounded = false; e.jumpedAt = this.time;
    }

    // Trying to get somewhere but not making progress (jumps included):
    // after half a second jump high, after one second chew through dirt.
    crawlerStuck(e, patrolling) {
      e.progT = (e.progT || 0) + DT;
      if (e.progX === undefined) e.progX = e.x;
      if (e.progT >= 0.5) {
        if (Math.abs(e.x - e.progX) < 3) e.stuckT = (e.stuckT || 0) + e.progT; else e.stuckT = 0;
        e.progT = 0; e.progX = e.x;
      }
      if (!e.stuckT) return;
      if (e.stuckT >= 0.5 && e.stuckT < 1) this.crawlerJump(e, 1.35);
      if (!patrolling && e.stuckT >= 1 && e.grounded) {
        // chew the dirt in front (never rock)
        const w = this.world, x0 = Math.round(e.x + e.dir * (e.w / 2 + 1));
        let chewed = 0;
        for (let cx = x0; cx !== x0 + e.dir * 3; cx += e.dir)
          for (let cy = Math.floor(e.y - e.h); cy < e.y; cy++) {
            const m = w.get(cx, cy);
            if (KWorld.SOLID[m] && !w.isHard(m) && this.rand() < 0.35) { if (m === M.CRYSTAL) w.broken.push(cx, cy); w.set(cx, cy, M.EMPTY); chewed++; }
          }
        if (chewed) w.cleanup(x0 - 4, e.y - e.h - 4, x0 + 4, e.y + 2);
        if (chewed && this.rand() < 0.5) this.burst(x0, e.y - 4, 2, [[132, 84, 100], [184, 140, 128]], 50);
        if (e.stuckT > 5) { e.dir = -e.dir; e.stuckT = 0; } // rock or worse: try the other way
      }
    }

    // Something drew the enemies' attention to player p (a hit, or a spell nearby).
    alert(p, x, y, radius) {
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < radius) { e.lastSeen = this.time; e.knownX = p.x; }
    }

    respawnCrawler(e) {
      // back home, but only while nobody is close enough to see it appear
      const E = KData.enemies[e.kind];
      if (this.players.some(p => Math.hypot(p.x - e.home.x, p.y - e.home.y) < E.respawnClear)) { e.respawnT = 2; return; }
      const y = e.kind === 'crawler' || e.kind === 'warden' ? this.world.floorBelow(e.home.x, e.home.y - 6) : e.home.y;
      Object.assign(e, { x: e.home.x, y, vx: 0, vy: 0, hp: e.maxHp, dead: false, state: e.kind === 'crawler' ? 'patrol' : 'idle', t: 0, lastHurt: -9, lastSeen: -9, slowT: 0, burnT: 0, wetT: 0, lastHitBy: null,
        anchored: e.kind === 'spitter', ghost: e.kind === 'delver' });
    }

    respawn(p) {
      // back at the last Lodestone touched (the hub's at first)
      const l = this.world.lodestones[this.checkpoint] || this.world.lodestones[0];
      const s = l ? { x: l.x + 14, y: this.world.floorBelow(l.x + 14, l.y - 10) } : this.world.spawn;
      Object.assign(p, { x: s.x, y: s.y, vx: 0, vy: 0, hp: p.maxHp, dead: false, mana: p.maxMana, manaWait: 0, dashT: 0, slam: null, lastHurt: -9, burnT: 0, slowT: 0 });
      this.endAllChannels(p);
    }

    dummyTick(d) {
      d.flash = Math.max(0, d.flash - DT);
      if (d.wetT > 0) d.wetT -= DT;
      if (d.slowT > 0) d.slowT -= DT;
      if (d.dead) {
        d.respawnT -= DT;
        if (d.respawnT <= 0) {
          Object.assign(d, { x: d.home.x, y: this.world.floorBelow(d.home.x, d.home.y - 10), vx: 0, vy: 0, hp: d.maxHp, dead: false, lastHurt: -9, wetT: 0, slowT: 0, burnT: 0 });
        }
        return;
      }
      if (this.time - d.lastHurt > DD.regenDelay) d.hp = Math.min(d.maxHp, d.hp + 60 * DT);
    }

    collides(a, x, y) {
      const w = this.world;
      const x0 = Math.floor(x - a.w / 2), x1 = Math.floor(x + a.w / 2 - 0.001);
      const y0 = Math.floor(y - a.h), y1 = Math.floor(y - 0.001);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (w.solid(cx, cy)) return true;
      return false;
    }

    unstick(a) {
      if (!this.collides(a, a.x, a.y)) return;
      for (let k = 1; k <= 5; k++) if (!this.collides(a, a.x, a.y - k)) { a.y -= k; return; }
      for (let k = 1; k <= 4; k++) for (const s of [1, -1]) if (!this.collides(a, a.x + s * k, a.y)) { a.x += s * k; return; }
      // last resort: break what is inside the body (never rock)
      const w = this.world;
      for (let cy = Math.floor(a.y - a.h); cy < a.y; cy++) for (let cx = Math.floor(a.x - a.w / 2); cx < a.x + a.w / 2; cx++) {
        const m = w.get(cx, cy);
        if (SOLID[m] && !w.isHard(m)) w.set(cx, cy, M.EMPTY);
      }
      w.cleanup(a.x - a.w, a.y - a.h - 3, a.x + a.w, a.y + 3);
      if (this.collides(a, a.x, a.y)) a.y -= 1;
    }

    physics(a) {
      if (a.dead || a.kind === 'boss') return;
      const w = this.world;
      if (a.anchored) return;                 // a spitter in its wall
      if (a.ghost) {                          // a delver inside the ground: no collision
        a.x += a.vx * DT; a.y += a.vy * DT;
        a.x = Math.max(12, Math.min(w.w - 12, a.x)); a.y = Math.max(20, Math.min(w.h - 12, a.y));
        if (this.rand() < 0.15) this.burst(a.x + (this.rand() - 0.5) * a.w, a.y - this.rand() * a.h, 1, [[184, 140, 128]], 20);
        return;
      }
      this.unstick(a);
      const charged = w.sample(a.x - a.w / 2, a.y - a.h, a.x + a.w / 2, a.y, counts);
      const area = a.w * a.h;
      a.inWater = counts[M.WATER] > area * 0.3;
      a.inMud = counts[M.MUD] > 4;
      const proof = this.has(a, 'magmaproof') || a.safeT > 0;
      const fireMul = proof ? 0 : this.affinity(a, 'fire');
      if (counts[M.FIRE] && fireMul) { this.hurt(a, PD.hurt.fire * fireMul * DT * Math.min(1, counts[M.FIRE] / 4), 0, 0, 'fire'); if (a.kind !== 'player') a.burnT = Math.max(a.burnT || 0, 1.5); }
      if (counts[M.MAGMA] && fireMul) this.hurt(a, PD.hurt.magma * fireMul * DT * Math.min(1, counts[M.MAGMA] / 4), 0, 0, 'magma');
      if (a.inWater) { a.wetT = KData.statuses.wet.time; a.burnT = 0; }
      if (a.burnT > 0) {
        // burning (Ember visor): 6 a second for 3 s, from whoever set it
        a.burnT -= DT;
        this.hurt(a, 6 * DT, 0, 0, 'burn', a.burnBy && !a.burnBy.dead ? a.burnBy : null, 'fire+fire');
        if (a.dead) return;
        if (this.rand() < 0.3) this.burst(a.x + (this.rand() - 0.5) * a.w, a.y - this.rand() * a.h, 1, [[255, 150, 52], [255, 214, 120]], 30);
      }
      if (charged) this.hurt(a, PD.hurt.charged * DT, 0, 0, 'shock');
      if (a.dead) return;

      if (a.kind === 'player' && a.dashT > 0) {
        a.dashT -= DT;
        a.vx = a.dashVX; a.vy = a.dashVY;
        const ds = a.dashSp, R = this.rand;
        if (ds.dig) w.explode(a.x + Math.sign(a.dashVX) * 7, a.y - a.h / 2, ds.dig);
        if (ds.trail) for (let k = 0; k < 4; k++) {
          const x = Math.round(a.x - Math.sign(a.dashVX) * (4 + R() * 6)), y = Math.round(a.y - 1 - R() * (a.h - 2));
          if (w.get(x, y) !== M.EMPTY) continue;
          if (ds.trail === 'WATER') { if (R() < 0.5) w.set(x, y, M.WATER); }
          else if (R() < 0.7) w.set(x, y, M[ds.trail]);
        }
        for (const o of this.actors) {
          if (o === a || o.dead || a.dashHit.has(o)) continue;
          if (Math.abs(o.x - a.x) < (o.w + a.w) / 2 && Math.abs((o.y - o.h / 2) - (a.y - a.h / 2)) < (o.h + a.h) / 2) {
            a.dashHit.add(o);
            this.hurt(o, a.dashSp.power, a.dashVX * 0.4, a.dashVY * 0.4 - 40, 'dash', a, a.dashKey);
          }
        }
        const tr = this.fx.find(f => f.kind === 'trail' && f.owner === a);
        if (tr) { tr.pts.push({ x: a.x, y: a.y - a.h / 2 }); tr.t = 0; }
        if (a.dashT <= 0) { a.vx *= 0.4; a.vy *= 0.4; }
      } else {
        const water = a.inWater;
        if (a.flying) { a.vx *= Math.exp(-0.8 * DT); a.vy *= Math.exp(-0.8 * DT); }
        else if (!a.noGravity) a.vy += PD.gravity * DT * (water ? 0.28 : 1);
        if (water && !this.has(a, 'diver')) { a.vx *= Math.exp(-2.5 * DT); a.vy *= Math.exp(-3 * DT); }
        if (a.inMud && !this.has(a, 'diver')) { a.vx *= Math.exp(-7 * DT); a.vy *= Math.exp(-5 * DT); }
        if (!a.grounded && a.kind === 'player') a.vx *= Math.exp(-0.6 * DT);
        if ((a.kind === 'dummy' || (a.kind === 'spitter' && !a.anchored)) && a.grounded) a.vx *= Math.exp(-10 * DT);
        if (!a.slam) a.vy = Math.min(a.vy, PD.maxFall);
      }

      // move in steps of at most one cell
      const mx = a.vx * DT, my = a.vy * DT;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my))));
      a.grounded = false;
      for (let s = 0; s < n; s++) {
        const sx = mx / n, sy = my / n;
        if (sx) {
          if (!this.collides(a, a.x + sx, a.y)) a.x += sx;
          else {
            let up = 0;
            for (let k = 1; k <= 3; k++) if (!this.collides(a, a.x + sx, a.y - k)) { up = k; break; }
            if (up && a.vy >= -40) { a.x += sx; a.y -= up; }
            else { a.vx = a.kind === 'dummy' ? -a.vx * 0.3 : 0; if (a.dashT > 0) a.dashVX = 0; }
          }
        }
        if (sy) {
          if (!this.collides(a, a.x, a.y + sy)) a.y += sy;
          else {
            if (sy > 0) {
              const ty = Math.floor(a.y + sy);
              if (ty > a.y && !this.collides(a, a.x, ty)) a.y = ty;
              a.grounded = true;
            }
            a.vy = 0; if (a.dashT > 0) a.dashVY = 0;
          }
        }
      }
      if (!a.grounded && this.collides(a, a.x, a.y + 0.6)) a.grounded = true;
      a.noGravity = false; // climbing and drilling set it again each step
      if (a.slam) { a.slam.t += DT; if (a.grounded || a.slam.t > 1.5) this.slamImpact(a); }
      if (a.grounded && a.vy > 0) a.vy = 0;
      a.x = Math.max(4, Math.min(w.w - 4, a.x));

      if (a.kind === 'player' && this.time - a.lastHurt > PD.regenDelay) a.hp = Math.min(a.maxHp, a.hp + PD.regen * DT);
      if (a.y > w.h + 20) this.kill(a);
    }
  }

  return { Game };
})();
