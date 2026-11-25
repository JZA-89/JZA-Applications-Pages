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

  class Game {
    constructor(seed) { this.seed = seed; this.reset(); }

    reset() {
      this.world = new World(this.seed);
      this.rand = makeRng(this.seed + 17);
      this.time = 0;
      this.projectiles = [];
      this.parts = [];
      this.fx = [];
      this.growths = [];
      this.shake = 0;
      this.players = [this.makePlayer(0)];
      this.dummies = this.world.dummySpots.map((s, i) => this.makeDummy(s, i));
      const EC = KData.enemies.crawler;
      this.enemies = EC.spots.slice(0, EC.count).map((x, i) => this.makeCrawler(x, i));
    }

    get actors() { return this.players.concat(this.dummies, this.enemies); }

    makePlayer(id) {
      const s = this.world.spawn;
      const chips = [];
      for (let i = 0; i < 64; i++) chips.push(i);
      for (let i = chips.length - 1; i > 0; i--) { const j = (this.rand() * (i + 1)) | 0; [chips[i], chips[j]] = [chips[j], chips[i]]; }
      return {
        kind: 'player', id, x: s.x, y: s.y, vx: 0, vy: 0, w: PD.w, h: PD.h,
        hp: PD.hp, maxHp: PD.hp, grounded: false, facing: 1, aim: 0,
        slots: [null, null], cds: {}, lock: 0, mana: PD.mana, maxMana: PD.mana, manaWait: 0, manaFlash: 0,
        stats: KData.baseStats(), skin: 0,
        coyote: 0, jumpBuf: 0, jumpHeld: false, rising: false, castHeld: false,
        channel: null, dashT: 0, dashVX: 0, dashVY: 0, dashHit: null,
        dead: false, respawnT: 0, lastHurt: -9, flash: 0, slotFlash: 0, lastSpell: null,
        chips, inWater: false, inMud: false, hurtBy: {},
      };
    }

    makeDummy(s, i) {
      return { kind: 'dummy', id: i, home: { x: s.x, y: s.y }, x: s.x, y: s.y, vx: 0, vy: 0, w: DD.w, h: DD.h,
        hp: DD.hp, maxHp: DD.hp, grounded: false, dead: false, respawnT: 0, lastHurt: -9, flash: 0, facing: 1,
        stats: KData.baseStats() };
    }

    makeCrawler(x, i) {
      const E = KData.enemies.crawler;
      const stats = KData.baseStats(); stats.attack = E.attack; stats.defence = E.defence;
      return { kind: 'crawler', id: i, x, y: this.world.surfaceAt(x), vx: 0, vy: 0, w: E.w, h: E.h,
        hp: E.hp, maxHp: E.hp, stats, grounded: false, dead: false, respawnT: 0, lastHurt: -9, flash: 0,
        facing: i % 2 ? 1 : -1, dir: i % 2 ? 1 : -1, state: 'patrol', t: 0, lastSeen: -9, hit: false };
    }

    // ---------- one fixed step ----------
    step(actions) {
      this.time += DT;
      for (const p of this.players) this.control(p, actions[p.id] || { move: 0, events: [], aim: p.aim });
      this.world.step();
      this.updateGrowths();
      this.updateParticles();
      this.updateProjectiles();
      for (const e of this.enemies) this.crawlerTick(e);
      for (const a of this.actors) this.physics(a);
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
        if (e.type === 'load') {
          if (!p.slots[0]) p.slots[0] = e.el;
          else if (!p.slots[1]) p.slots[1] = e.el;
          else { p.slots[0] = p.slots[1]; p.slots[1] = e.el; }
        } else if (e.type === 'clear') p.slots = [null, null];
      }
      p.aim = a.aim;
      const ax = Math.cos(p.aim);
      if (Math.abs(ax) > 0.15) p.facing = ax > 0 ? 1 : -1;

      for (const k in p.cds) if (p.cds[k] > 0) p.cds[k] -= DT;
      p.lock = Math.max(0, p.lock - DT);

      // run
      const slow = p.inMud ? KData.materials[M.MUD].slows : 1;
      const run = PD.run * slow;
      const target = a.move * run;
      if (p.dashT <= 0) {
        const acc = (p.grounded ? PD.accel : PD.airAccel) * (p.inMud ? 0.5 : 1);
        if (a.move !== 0) {
          if (Math.abs(p.vx) <= run || Math.sign(a.move) !== Math.sign(p.vx)) {
            const dv = target - p.vx;
            p.vx += Math.sign(dv) * Math.min(Math.abs(dv), acc * DT);
          }
        } else if (p.grounded) p.vx *= Math.exp(-PD.friction * DT);
      }

      // jump
      if (a.jump && !p.jumpHeld) p.jumpBuf = PD.buffer;
      if (p.grounded) p.coyote = PD.coyote; else p.coyote = Math.max(0, p.coyote - DT);
      p.jumpBuf = Math.max(0, p.jumpBuf - DT);
      if (p.jumpBuf > 0 && p.coyote > 0 && p.dashT <= 0) {
        p.vy = -PD.jump * (p.inMud ? 0.55 : 1);
        p.jumpBuf = 0; p.coyote = 0; p.rising = true; p.grounded = false;
      }
      if (p.inWater && a.jump && p.dashT <= 0) p.vy = Math.max(p.vy - 520 * DT, -95);
      if (!a.jump && p.rising && p.vy < 0) { p.vy *= 0.5; p.rising = false; }
      if (p.vy >= 0) p.rising = false;
      p.jumpHeld = a.jump;

      // mana refills on its own, faster on the ground
      if (p.manaWait > 0) p.manaWait -= DT;
      else p.mana = Math.min(p.maxMana, p.mana + (p.grounded ? PD.manaGroundRegen : PD.manaRegen) * DT);

      // cast
      const pressed = a.cast && !p.castHeld;
      p.castHeld = a.cast;
      const key = p.slots[0] && p.slots[1] ? spellKey(p.slots[0], p.slots[1]) : null;
      if (p.channel) {
        // held spells (water jet, steam) run while held and while there is mana
        if (a.cast && key === p.channel && p.mana > 0) this.channelTick(p);
        else this.endChannel(p);
        return;
      }
      if (!a.cast) return;
      if (!key) { if (pressed) p.slotFlash = 0.35; return; }
      const sp = spells[key];
      if (sp.freshPress && !pressed) return; // dash only on a fresh press
      if (p.lock > 0 || (p.cds[key] || 0) > 0) return;
      if (p.mana < (sp.drain ? sp.min : sp.cost)) { if (pressed) p.manaFlash = 0.35; return; }
      this.cast(p, key, sp);
    }

    spend(p, amount) {
      p.mana -= amount;
      if (p.mana <= 0) { p.mana = 0; p.manaWait = PD.manaEmptyDelay; }
      else p.manaWait = Math.max(p.manaWait, PD.manaDelay);
    }

    chest(p) { return { x: p.x, y: p.y - p.h * 0.55 }; }

    cast(p, key, sp) {
      const dx = Math.cos(p.aim), dy = Math.sin(p.aim);
      const c = this.chest(p), ox = c.x + dx * 4, oy = c.y + dy * 4;
      p.cds[key] = sp.cd; p.lock = 0.12; p.lastSpell = key;
      if (sp.cost) this.spend(p, sp.cost);
      this.alert(p, p.x, p.y, KData.enemies.crawler.hearing);
      const R = this.rand;
      switch (sp.kind) {
        case 'projectile':
          this.projectiles.push({ kind: 'fireball', sp, owner: p, x: ox, y: oy, vx: dx * sp.speed, vy: dy * sp.speed, g: sp.gravity, age: 0 });
          break;
        case 'lob':
          this.projectiles.push({ kind: 'blob', sp, owner: p, x: ox, y: oy, vx: dx * sp.speed + p.vx * 0.3, vy: dy * sp.speed + p.vy * 0.2, g: sp.gravity, age: 0 });
          break;
        case 'spear':
          this.projectiles.push({ kind: 'spear', sp, owner: p, x: ox, y: oy, vx: dx * sp.speed, vy: dy * sp.speed, g: 0, age: 0, bore: sp.boreLength, travelled: 0 });
          break;
        case 'jet':
        case 'thrust':
          p.channel = key; p.cds[key] = 0;
          this.channelTick(p);
          break;
        case 'spray':
          for (let i = 0; i < sp.count; i++) {
            const an = p.aim + (R() - 0.5) * 2 * sp.spread, s = sp.speed * (0.7 + R() * 0.5);
            this.parts.push({ x: ox, y: oy, vx: Math.cos(an) * s, vy: Math.sin(an) * s, g: sp.gravity, mat: M[sp.mat], life: 3, owner: p });
          }
          break;
        case 'pillar': this.castPillar(p, sp, c, dx, dy); break;
        case 'bolt': this.castBolt(p, sp, c, dx, dy); break;
        case 'dash': {
          this.world.sample(p.x - p.w / 2, p.y - p.h, p.x + p.w / 2, p.y, counts);
          const wet = counts[M.WATER] > 6 || p.inWater;
          p.dashT = wet ? sp.waterTime : sp.time;
          p.dashVX = dx * sp.speed; p.dashVY = dy * sp.speed;
          p.dashHit = new Set(); p.dashSp = sp;
          p.rising = false;
          this.fx.push({ kind: 'trail', pts: [{ x: c.x, y: c.y }], owner: p, t: 0, T: 0.45, color: [255, 246, 170] });
          break;
        }
        case 'blast': {
          const bx = c.x + dx * sp.reach, by = c.y + dy * sp.reach;
          this.world.explode(bx, by, 5, { fire: sp.ignite });
          this.hitRadius(bx, by, sp.radius + 4, sp.power, sp.knock, p, p, key);
          p.vx -= dx * sp.recoil; p.vy -= dy * sp.recoil * 0.8;
          this.fx.push({ kind: 'ring', x: bx, y: by, r0: 3, r1: sp.radius + 3, t: 0, T: 0.22, color: sp.color });
          this.fx.push({ kind: 'flash', x: bx, y: by, r: 26, t: 0, T: 0.14, color: sp.color });
          this.burst(bx, by, 14, [[255, 220, 140], [255, 160, 60]], 120);
          this.shake = Math.max(this.shake, 2);
          break;
        }
      }
    }

    channelTick(p) {
      const sp = spells[p.channel], R = this.rand;
      const dx = Math.cos(p.aim), dy = Math.sin(p.aim), c = this.chest(p);
      if (sp.kind === 'jet') {
        for (let i = 0; i < sp.perTick; i++) {
          const an = p.aim + (R() - 0.5) * 2 * sp.spread, s = sp.speed * (0.85 + R() * 0.3);
          this.parts.push({ x: c.x + dx * 6, y: c.y + dy * 6, vx: Math.cos(an) * s, vy: Math.sin(an) * s, g: 170, mat: M.WATER, life: 3, owner: p, push: sp.push });
        }
        if (!p.grounded) { p.vx -= dx * sp.recoil * DT; p.vy -= dy * sp.recoil * DT; }
      } else if (sp.kind === 'thrust') {
        // steam pushes you away from where you aim, for as long as it is held
        p.vx -= dx * sp.accel * DT; p.vy -= dy * sp.accel * DT;
        const s = Math.hypot(p.vx, p.vy);
        if (s > sp.maxSpeed) { p.vx *= sp.maxSpeed / s; p.vy *= sp.maxSpeed / s; }
        if (dy > 0.3) { p.grounded = false; p.coyote = 0; }
        p.rising = false;
        const w = this.world;
        for (let i = 0; i < sp.steamPerTick; i++) {
          const d = 5 + R() * 7, side = (R() - 0.5) * 5;
          const x = Math.round(c.x + dx * d - dy * side), y = Math.round(c.y + dy * d + dx * side);
          if (w.get(x, y) === M.EMPTY) w.set(x, y, M.STEAM);
        }
      }
      this.spend(p, sp.drain * DT);
      if (p.mana <= 0) this.endChannel(p);
    }
    endChannel(p) { if (p.channel) p.cds[p.channel] = spells[p.channel].cd; p.channel = null; }

    castPillar(p, sp, c, dx, dy) {
      const w = this.world;
      const hit = w.ray(c.x, c.y, dx, dy, sp.range);
      const snap = Math.round(Math.atan2(-dy, -dx) / (Math.PI / 4)) * (Math.PI / 4);
      const gx = Math.round(Math.cos(snap)), gy = Math.round(Math.sin(snap));
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

    castBolt(p, sp, c, dx, dy) {
      const w = this.world;
      let ex = c.x, ey = c.y, target = null, water = null;
      for (let d = 3; d <= sp.range; d += 1) {
        const x = c.x + dx * d, y = c.y + dy * d, ix = Math.floor(x), iy = Math.floor(y);
        const m = w.get(ix, iy);
        ex = x; ey = y;
        const a = this.actorAt(x, y, p);
        if (a) { target = a; break; }
        if (m === M.WATER) { water = { x: ix, y: iy }; break; }
        if (SOLID[m]) {
          if (m === M.MOSS && this.rand() < 0.8) w.set(ix, iy, M.FIRE);
          break;
        }
      }
      if (target) this.hurt(target, sp.power, dx * sp.knock, dy * sp.knock - 30, 'bolt', p, 'lightning+lightning');
      if (water) {
        const n = w.electrify(water.x, water.y, sp.charge, sp.chargeCells);
        this.fx.push({ kind: 'flash', x: ex, y: ey, r: 18 + Math.min(40, n / 30), t: 0, T: 0.2, color: [180, 220, 255] });
      }
      // chain to one more target near the end
      const pts = this.jagged(c.x + dx * 3, c.y + dy * 3, ex, ey);
      this.fx.push({ kind: 'bolt', pts, t: 0, T: 0.16, color: sp.color });
      const near = this.actors.find(a => a !== p && a !== target && !a.dead && Math.hypot(a.x - ex, a.y - a.h / 2 - ey) < 16);
      if (near && !water) {
        this.hurt(near, sp.power * 0.5, dx * sp.knock * 0.5, -20, 'bolt', p, 'lightning+lightning');
        this.fx.push({ kind: 'bolt', pts: this.jagged(ex, ey, near.x, near.y - near.h / 2), t: 0, T: 0.16, color: sp.color });
      }
      this.fx.push({ kind: 'flash', x: ex, y: ey, r: 14, t: 0, T: 0.1, color: sp.color });
      this.burst(ex, ey, 6, [[255, 246, 170], [255, 255, 255]], 90);
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
          const hit = this.actorAt(pr.x, pr.y, pr.age < 0.15 ? pr.owner : null, 1);
          if (pr.kind === 'spear') {
            pr.travelled += sp * DT / n;
            if (hit) { this.hurt(hit, pr.sp.power, pr.vx / sp * pr.sp.knock, pr.vy / sp * pr.sp.knock - 30, 'spear', pr.owner, 'earth+lightning'); this.spark(pr.x, pr.y); pr.dead = true; break; }
            if (m === M.ROCK) { this.spark(pr.x, pr.y); pr.dead = true; break; }
            if (SOLID[m]) {
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
          if (hit || SOLID[m]) {
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
      if (pr.kind === 'fireball') {
        const x = pr.x, y = pr.y;
        w.explode(x, y, sp.radius, { fire: sp.ignite, boil: 0.5 });
        this.hitRadius(x, y, sp.radius + 6, sp.power, sp.knock, null, pr.owner, 'fire+fire');
        this.fx.push({ kind: 'ring', x, y, r0: 3, r1: sp.radius + 4, t: 0, T: 0.25, color: [255, 190, 90] });
        this.fx.push({ kind: 'flash', x, y, r: 34, t: 0, T: 0.18, color: [255, 160, 70] });
        this.burst(x, y, 26, [[184, 140, 128], [132, 84, 100], [255, 170, 70]], 150);
        this.shake = Math.max(this.shake, 3);
      } else if (pr.kind === 'blob') {
        if (hit) this.hurt(hit, sp.power, pr.vx * 0.3, -40, 'magma', pr.owner, 'earth+fire');
        this.fillBlob(Math.floor(px), Math.floor(py), M[sp.mat], sp.count);
        this.burst(px, py, 8, [[255, 168, 64], [255, 120, 40]], 70);
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
    inBox(a, x, y, pad = 0) { return x >= a.x - a.w / 2 - pad && x <= a.x + a.w / 2 + pad && y >= a.y - a.h - pad && y <= a.y + pad; }
    actorAt(x, y, except, pad = 0) {
      for (const a of this.actors) if (a !== except && !a.dead && this.inBox(a, x, y, pad)) return a;
      return null;
    }

    hitRadius(x, y, r, dmg, knock, except, src, spell) {
      for (const a of this.actors) {
        if (a.dead || a === except) continue;
        const cx = a.x, cy = a.y - a.h / 2, d = Math.hypot(cx - x, cy - y);
        if (d > r) continue;
        const f = 1 - (d / r) * 0.6, nx = (cx - x) / (d || 1), ny = (cy - y) / (d || 1);
        this.hurt(a, dmg * f, nx * knock * f, ny * knock * f - 60 * f, 'blast', src, spell);
      }
    }

    // Damage from stats. base: the spell's power (or a hazard's rate).
    // src: who cast it (null for hazards). spell: the spell key, whose two
    // elements set which element powers apply.
    //   damage = base x element power x 2A/(A+D) x modifiers
    // With equal attack and defence the middle term is 1, so base is the damage.
    damage(src, target, base, spell) {
      const ts = target.stats || KData.baseStats();
      const atk = src && src.stats ? src.stats.attack : ts.defence;
      let pow = 1;
      if (src && src.stats && spell) { const [e1, e2] = spell.split('+'); pow = (src.stats.power[e1] + src.stats.power[e2]) / 2; }
      const mods = 1; // buffs and debuffs go here
      return base * pow * (2 * atk / (atk + ts.defence)) * mods;
    }

    hurt(a, amount, kx, ky, kind, src, spell) {
      if (a.dead || amount <= 0) return;
      amount = this.damage(src || null, a, amount, spell);
      a.hp -= amount; a.lastHurt = this.time;
      a.vx += kx || 0; a.vy += ky || 0;
      if (amount >= 4) {
        a.flash = 0.1;
        const col = a.kind === 'player' ? [[240, 228, 206], [198, 178, 160]] : a.kind === 'crawler' ? [[78, 72, 94], [112, 104, 128]] : [[150, 140, 165], [200, 194, 214]];
        this.burst(a.x, a.y - a.h / 2, Math.min(14, 2 + amount / 5), col, 80);
      }
      if (a.kind === 'crawler' && src && src.kind === 'player') { a.lastSeen = this.time; a.knownX = src.x; }
      if (a.kind === 'crawler' && amount >= KData.enemies.crawler.staggerAt && a.hp > 0) { a.state = 'stagger'; a.t = 0; }
      if (a.hp <= 0) this.kill(a);
    }

    kill(a) {
      a.dead = true; a.hp = 0;
      a.respawnT = a.kind === 'player' ? PD.respawn : a.kind === 'crawler' ? KData.enemies.crawler.respawn : DD.respawn;
      const col = a.kind === 'player' ? [[240, 228, 206], [198, 178, 160], [44, 28, 36]] : a.kind === 'crawler' ? [[78, 72, 94], [112, 104, 128], [255, 70, 160]] : [[150, 140, 165], [200, 194, 214], [74, 58, 48]];
      if (a.kind === 'crawler') {
        // it crumbles into loose earth
        const w = this.world;
        for (let k = 0; k < 14; k++) {
          const x = Math.round(a.x + (this.rand() - 0.5) * 8), y = Math.round(a.y - 1 - this.rand() * 5);
          if (w.get(x, y) === M.EMPTY) w.set(x, y, M.EARTH);
        }
      }
      this.burst(a.x, a.y - a.h / 2, 40, col, 140);
      if (a.kind === 'player') { this.endChannel(a); a.dashT = 0; this.shake = Math.max(this.shake, 3); }
    }

    // ---------- Shale crawler ----------
    crawlerTick(e) {
      const E = KData.enemies.crawler, w = this.world;
      e.flash = Math.max(0, e.flash - DT);
      e.t += DT;
      if (e.dead) {
        e.respawnT -= DT;
        if (e.respawnT <= 0) this.respawnCrawler(e);
        return;
      }
      const set = s => { e.state = s; e.t = 0; };
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
            e.vx = toward(e.vx, e.dir * E.walk, 300);
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
            e.vx = toward(e.vx, moveDir * E.run, 500);
            // jump at walls, onto ledges you stand on, and across gaps towards you
            // (after a second of no progress it stops jumping and chews instead)
            if (e.stuckT >= 1) { /* chewing: see crawlerStuck */ }
            else if (wallAhead(moveDir)) this.crawlerJump(e, 1);
            else if (above && !roof && Math.abs(dx) < 70) this.crawlerJump(e, Math.min(1.4, Math.sqrt(2 * PD.gravity * (-dy + 10)) / E.jump));
            else if (ledgeAhead(moveDir) && Math.abs(dx) > 16 && dy < 30) this.crawlerJump(e, 0.9);
          } else {
            e.vx = toward(e.vx, e.dir * E.run, 160); // steer a little in the air
          }
          this.crawlerStuck(e, false);
          if (see && e.grounded && Math.abs(dx) < E.lungeRange && Math.abs(dy) < 18) set('windup');
          break;
        }
        case 'windup':
          // the warning: it stops, rears up and its eyes flare
          e.vx *= Math.exp(-12 * DT);
          if (p && Math.abs(dx) > 2) e.dir = Math.sign(dx);
          if (e.t > E.windup) { set('lunge'); e.vx = e.dir * E.lungeSpeed; e.vy = -E.lungeLift; e.grounded = false; e.hit = false; }
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
      e.vy = -KData.enemies.crawler.jump * k; e.grounded = false; e.jumpedAt = this.time;
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
            if (KWorld.SOLID[m] && !w.isHard(m) && this.rand() < 0.35) { w.set(cx, cy, M.EMPTY); chewed++; }
          }
        if (chewed && this.rand() < 0.5) this.burst(x0, e.y - 4, 2, [[132, 84, 100], [184, 140, 128]], 50);
        if (e.stuckT > 5) { e.dir = -e.dir; e.stuckT = 0; } // rock or worse: try the other way
      }
    }

    // Something drew the enemies' attention to player p (a hit, or a spell nearby).
    alert(p, x, y, radius) {
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < radius) { e.lastSeen = this.time; e.knownX = p.x; }
    }

    respawnCrawler(e) {
      // come back at the spawn spot furthest from any player
      const E = KData.enemies.crawler;
      let bx = E.spots[0], bd = -1;
      for (const x of E.spots) {
        const d = Math.min(...this.players.map(p => Math.abs(p.x - x)));
        if (d > bd) { bd = d; bx = x; }
      }
      Object.assign(e, { x: bx, y: this.world.surfaceAt(bx), vx: 0, vy: 0, hp: e.maxHp, dead: false, state: 'patrol', t: 0, lastHurt: -9, lastSeen: -9 });
      this.burst(e.x, e.y - 3, 10, [[78, 72, 94], [112, 104, 128]], 60);
    }

    respawn(p) {
      const s = this.world.spawn;
      Object.assign(p, { x: s.x, y: s.y, vx: 0, vy: 0, hp: p.maxHp, dead: false, mana: p.maxMana, manaWait: 0, dashT: 0, channel: null, lastHurt: -9 });
    }

    dummyTick(d) {
      d.flash = Math.max(0, d.flash - DT);
      if (d.dead) {
        d.respawnT -= DT;
        if (d.respawnT <= 0) {
          const y = this.world.surfaceAt(Math.round(d.home.x));
          Object.assign(d, { x: d.home.x, y: Math.min(y, d.home.y + 40), vx: 0, vy: 0, hp: d.maxHp, dead: false, lastHurt: -9 });
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
      if (this.collides(a, a.x, a.y)) a.y -= 1;
    }

    physics(a) {
      if (a.dead) return;
      const w = this.world;
      this.unstick(a);
      const charged = w.sample(a.x - a.w / 2, a.y - a.h, a.x + a.w / 2, a.y, counts);
      const area = a.w * a.h;
      a.inWater = counts[M.WATER] > area * 0.3;
      a.inMud = counts[M.MUD] > 4;
      if (counts[M.FIRE]) this.hurt(a, PD.hurt.fire * DT * Math.min(1, counts[M.FIRE] / 4), 0, 0, 'fire');
      if (counts[M.MAGMA]) this.hurt(a, PD.hurt.magma * DT * Math.min(1, counts[M.MAGMA] / 4), 0, 0, 'magma');
      if (charged) this.hurt(a, PD.hurt.charged * DT, 0, 0, 'shock');
      if (a.dead) return;

      if (a.kind === 'player' && a.dashT > 0) {
        a.dashT -= DT;
        a.vx = a.dashVX; a.vy = a.dashVY;
        for (const o of this.actors) {
          if (o === a || o.dead || a.dashHit.has(o)) continue;
          if (Math.abs(o.x - a.x) < (o.w + a.w) / 2 && Math.abs((o.y - o.h / 2) - (a.y - a.h / 2)) < (o.h + a.h) / 2) {
            a.dashHit.add(o);
            this.hurt(o, a.dashSp.power, a.dashVX * 0.4, a.dashVY * 0.4 - 40, 'dash', a, 'lightning+water');
          }
        }
        const tr = this.fx.find(f => f.kind === 'trail' && f.owner === a);
        if (tr) { tr.pts.push({ x: a.x, y: a.y - a.h / 2 }); tr.t = 0; }
        if (a.dashT <= 0) { a.vx *= 0.4; a.vy *= 0.4; }
      } else {
        const water = a.inWater;
        a.vy += PD.gravity * DT * (water ? 0.28 : 1);
        if (water) { a.vx *= Math.exp(-2.5 * DT); a.vy *= Math.exp(-3 * DT); }
        if (a.inMud) { a.vx *= Math.exp(-7 * DT); a.vy *= Math.exp(-5 * DT); }
        if (!a.grounded && a.kind === 'player') a.vx *= Math.exp(-0.6 * DT);
        if (a.kind === 'dummy' && a.grounded) a.vx *= Math.exp(-10 * DT);
        a.vy = Math.min(a.vy, PD.maxFall);
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
      if (a.grounded && a.vy > 0) a.vy = 0;
      a.x = Math.max(4, Math.min(w.w - 4, a.x));

      if (a.kind === 'player' && this.time - a.lastHurt > PD.regenDelay) a.hp = Math.min(a.maxHp, a.hp + PD.regen * DT);
      if (a.y > w.h + 20) this.kill(a);
    }
  }

  return { Game };
})();
