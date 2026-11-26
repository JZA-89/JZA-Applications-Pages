'use strict';
/* Cast in Stone — world.js
   The falling-sand world: a grid of cells, one material per cell, updated every
   fixed step. The grid is split into 32x32 chunks. Only chunks where something
   changed recently ("awake") are simulated, and every changed chunk is flagged
   "dirty" so that, later, a host can send only the changed chunks to the other
   player. All randomness comes from a seeded generator, so the same seed and
   the same actions give the same world. */

const KWorld = (() => {
  const Math = KMath;   // the same arithmetic on every device (dmath.js)
  const { M, materials, reactions } = KData;
  const N = materials.length;

  // Seeded random numbers (mulberry32).
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Material properties copied into flat arrays so the inner loop is fast.
  const ST = { empty: 0, static: 1, powder: 2, liquid: 3, gas: 4, fire: 5 };
  const STATE = new Uint8Array(N), DENS = new Float32Array(N), SOLID = new Uint8Array(N),
    HARD = new Uint8Array(N), FLOW = new Uint8Array(N), MOVE = new Float32Array(N),
    SLIDE = new Float32Array(N), CONDUCT = new Uint8Array(N), REACTIVE = new Uint8Array(N),
    LIFE0 = new Uint8Array(N), LIFE1 = new Uint8Array(N), COOL = new Uint8Array(N);
  materials.forEach((m, i) => {
    STATE[i] = ST[m.state]; DENS[i] = m.density; SOLID[i] = m.solid ? 1 : 0; HARD[i] = m.hard ? 1 : 0;
    FLOW[i] = m.flow || 0; MOVE[i] = m.moveChance == null ? 1 : m.moveChance; SLIDE[i] = m.slide == null ? 1 : m.slide;
    CONDUCT[i] = m.conducts ? 1 : 0;
    if (m.life) { LIFE0[i] = m.life[0]; LIFE1[i] = m.life[1]; }
    COOL[i] = m.coolsTo || 0;
  });
  // react[a*N+b] -> { chance, ra, rb } (a is the cell being updated)
  const REACT = new Array(N * N).fill(null);
  // Only the side that does something looks for a reaction: fire, magma, embers, acid, water, steam,
  // and whatever moves. Solid ground (dirt, wood, coal, ice, lichen) waits to be acted on, or every
  // cell of dirt in an awake chunk would roll dice each step. The acting side gets both sides' chance.
  for (const r of reactions) { REACTIVE[r.a] = 1; if (STATE[r.b] !== ST.static) REACTIVE[r.b] = 1; }
  for (const r of reactions) {
    const both = REACTIVE[r.a] && REACTIVE[r.b] && r.b !== M.EMPTY, chance = both ? r.chance : 1 - (1 - r.chance) * (1 - r.chance);
    REACT[r.a * N + r.b] = { chance, ra: r.ra, rb: r.rb, blast: r.blast || 0 };
    REACT[r.b * N + r.a] = { chance, ra: r.rb, rb: r.ra, blast: r.blast || 0 };
  }

  // Put a short list in a random order, asking the dice in a fixed sequence. (Never shuffle with
  // `list.sort(() => R() - 0.5)`: how many times a browser's sort asks depends on the browser, and in
  // Chrome on how long the page has been open, so the same seed gave different caves.)
  function shuffle(list, R) {
    for (let start = 1; start < list.length; start++) {
      const item = list[start]; let left = 0, right = start;
      while (left < right) { const mid = left + ((right - left) >> 1); if (R() - 0.5 < 0) right = mid; else left = mid + 1; }
      for (let k = start; k > left; k--) list[k] = list[k - 1];
      list[left] = item;
    }
    return list;
  }

  // Deterministic smooth noise for the map shape.
  // fast integer hash -> 0..1
  function hash(i, j, s) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x, y, scale, s) {
    x /= scale; y /= scale;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  class World {
    // lift: levels added everywhere in the cave (a deeper cave after the Emberwyrm falls: game.depth)
    // act: which act's regions and boss this cave has (KData.acts)
    constructor(seed, lift = 0, act = 0) {
      this.lift = lift | 0; this.act = act | 0; this.biomes = KData.acts[this.act].biomes;
      const { w, h, chunk } = KData.world;
      this.w = w; this.h = h; this.cs = chunk; this.shift = Math.log2(chunk);
      this.cw = Math.ceil(w / chunk); this.ch = Math.ceil(h / chunk);
      this.mat = new Uint8Array(w * h);
      this.shade = new Uint8Array(w * h);   // texture variant per cell
      this.life = new Uint8Array(w * h);    // countdown for steam, fire, magma
      this.charge = new Uint8Array(w * h);  // electrified water
      this.stamp = new Uint8Array(w * h);   // last tick this cell moved
      this.awake = new Uint8Array(this.cw * this.ch);
      this.dirty = new Uint8Array(this.cw * this.ch);
      this.tick = 0;
      this.seed = seed;
      this.rand = makeRng(seed);
      this.spawn = { x: 40, y: 100 };
      this.blasts = [];   // where gas has just gone off (x, y pairs), for the game to turn into explosions
      this.broken = []; this.cooled = [];   // crystal cells broken since the game last looked (x, y pairs)
      this.caches = [];
      this.dummySpots = [];
      this.generate();
    }

    // ----- basic access -----
    inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) { return this.inb(x, y) ? this.mat[y * this.w + x] : M.ROCK; }
    solid(x, y) { return SOLID[this.get(x, y)] === 1; }
    isHard(m) { return HARD[m] === 1; }
    state(m) { return STATE[m]; }

    wakeAt(x, y) {
      const s = this.shift, cx = x >> s, cy = y >> s, cw = this.cw;
      const k = cy * cw + cx;
      this.awake[k] = 3; this.dirty[k] = 1;
      if (this.changed) this.changed[k] = 1;
      const lx = x & (this.cs - 1), ly = y & (this.cs - 1), e = this.cs - 1;
      if (lx === 0 && cx > 0) { this.awake[k - 1] = 3; }
      if (lx === e && cx < cw - 1) { this.awake[k + 1] = 3; }
      if (ly === 0 && cy > 0) { this.awake[k - cw] = 3; }
      if (ly === e && cy < this.ch - 1) { this.awake[k + cw] = 3; }
    }

    // Put material m into the cell at index i (no bounds check).
    put(i, m) {
      this.mat[i] = m;
      this.shade[i] = (this.rand() * 255) | 0;
      this.life[i] = LIFE1[m] ? LIFE0[m] + ((this.rand() * (LIFE1[m] - LIFE0[m])) | 0) : 0;
      this.charge[i] = 0;
      this.stamp[i] = this.tick;
      this.wakeAt(i % this.w, (i / this.w) | 0);
    }
    set(x, y, m) { if (this.inb(x, y)) this.put(y * this.w + x, m); }

    swap(i, j) {
      const { mat, shade, life, charge, stamp } = this;
      let t = mat[i]; mat[i] = mat[j]; mat[j] = t;
      t = shade[i]; shade[i] = shade[j]; shade[j] = t;
      t = life[i]; life[i] = life[j]; life[j] = t;
      t = charge[i]; charge[i] = charge[j]; charge[j] = t;
      stamp[i] = stamp[j] = this.tick;
      const w = this.w;
      this.wakeAt(i % w, (i / w) | 0); this.wakeAt(j % w, (j / w) | 0);
    }

    // Can a moving cell of material m enter a cell holding t?
    // dir: +1 moving down, -1 moving up, 0 sideways.
    canEnter(m, t, dir) {
      if (t === M.EMPTY) return true;
      const st = STATE[t];
      if (st === ST.static || st === ST.powder) return false;
      if (dir > 0) return DENS[m] > DENS[t];
      if (dir < 0) return DENS[m] < DENS[t];
      return false;
    }

    // ----- simulation -----
    // One step of the sand. Only chunks that are awake are worked through, and of those only the ones
    // within reach of a golem (`near`: [x, y] for each): what is further off waits, still awake, until
    // someone comes close. Nothing can be seen there, and a far-off mud slide used to cost every step.
    step(near) {
      this.tick = (this.tick + 1) & 255;
      if (this.tick === 0) this.tick = 1;
      const { w, h, cs, cw, ch, awake } = this, now = this._now || (this._now = new Uint8Array(awake.length)), rows = this._rows || (this._rows = new Uint8Array(ch));
      const RX = World.REACH_X, RY = World.REACH_Y;
      for (let cy = 0; cy < ch; cy++) {
        let any = 0;
        for (let cx = 0; cx < cw; cx++) {
          const k = cy * cw + cx; let on = 0;
          if (awake[k]) {
            if (!near) on = 1;
            else for (const p of near) if (Math.abs((p[0] >> this.shift) - cx) <= RX && Math.abs((p[1] >> this.shift) - cy) <= RY) { on = 1; break; }
            if (on) { awake[k]--; any = 1; }
          }
          now[k] = on;
        }
        rows[cy] = any;
      }
      for (let cy = ch - 1; cy >= 0; cy--) {
        if (!rows[cy]) continue;   // nothing awake in this band of the cave
        for (let y = Math.min(h, (cy + 1) * cs) - 1; y >= cy * cs; y--) {
          const ltr = ((y + this.tick) & 1) === 0;
          for (let c = 0; c < cw; c++) {
            const cx = ltr ? c : cw - 1 - c;
            if (!now[cy * cw + cx]) continue;
            const x0 = cx * cs, x1 = Math.min(w, x0 + cs);
            if (ltr) { for (let x = x0; x < x1; x++) this.cell(x, y); }
            else { for (let x = x1 - 1; x >= x0; x--) this.cell(x, y); }
          }
        }
      }
    }
    cell(x, y) {
      const w = this.w, i = y * w + x, mat = this.mat, m = mat[i];
      if (m === M.EMPTY) return;
      if (this.charge[i]) { this.charge[i]--; this.wakeAt(x, y); }
      if (this.stamp[i] === this.tick) return;
      const R = this.rand;

      // Reactions with one random neighbour.
      if (REACTIVE[m]) {
        const d = (R() * 4) | 0;
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (this.inb(nx, ny)) {
          const j = ny * w + nx, r = REACT[m * N + mat[j]];
          if (r && R() < r.chance) {
            if (r.ra !== m) this.put(i, r.ra);
            if (r.rb !== mat[j]) this.put(j, r.rb);
            if (r.blast && this.blasts.length < 24 && R() < r.blast) this.blasts.push(nx, ny);   // gas going off (game.blastsTick)
            return;
          }
        }
      }

      const st = STATE[m];
      if (st === ST.static) {
        // an ember is the one solid that changes by itself: it burns down, then is gone
        if (m === M.EMBER) { if (this.life[i] > 0 && --this.life[i] === 0) this.put(i, M.EMPTY); else this.wakeAt(x, y); }
        return;
      }

      // Countdown materials (steam, fire, magma). 255 means permanent (pools the cave starts with).
      if (LIFE1[m] && this.life[i] !== 255) {
        if (st === ST.liquid ? R() < 0.5 : true) {
          if (this.life[i] > 0) this.life[i]--;
          if (this.life[i] === 0) {
            if (st === ST.gas) this.put(i, R() < materials[m].condense ? M.WATER : M.EMPTY);
            else if (COOL[m]) { this.put(i, COOL[m]); if (this.cooled.length < 4000) this.cooled.push(i); }   // cooled magma is checked for crumbs (settle)
            else this.put(i, M.EMPTY);
            return;
          }
        }
        this.wakeAt(x, y);
      }

      if (MOVE[m] < 1 && R() > MOVE[m]) {
        // a slow material skipped this step; stay awake only if it could still move
        if (y + 1 < this.h && (this.canEnter(m, mat[i + w], 1) || (x > 0 && this.canEnter(m, mat[i + w - 1], 1)) || (x + 1 < w && this.canEnter(m, mat[i + w + 1], 1)) ||
            (st === ST.liquid && ((x > 0 && mat[i - 1] === M.EMPTY) || (x + 1 < w && mat[i + 1] === M.EMPTY))))) this.wakeAt(x, y);
        return;
      }

      if (st === ST.powder) {
        if (y + 1 < this.h && this.canEnter(m, mat[i + w], 1)) { this.swap(i, i + w); return; }
        if (R() < SLIDE[m] && y + 1 < this.h) {
          const d = R() < 0.5 ? 1 : -1;
          for (const dx of [d, -d]) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            if (this.canEnter(m, mat[i + w + dx], 1) && mat[i + dx] === M.EMPTY) { this.swap(i, i + w + dx); return; }
          }
        }
        return;
      }

      if (st === ST.liquid) {
        if (y + 1 < this.h && this.canEnter(m, mat[i + w], 1)) { this.swap(i, i + w); return; }
        const d = R() < 0.5 ? 1 : -1;
        if (y + 1 < this.h) {
          for (const dx of [d, -d]) {
            const nx = x + dx;
            if (nx >= 0 && nx < w && this.canEnter(m, mat[i + w + dx], 1)) { this.swap(i, i + w + dx); return; }
          }
        }
        // Spread sideways only towards somewhere lower (a drop within reach), so
        // pools level out and then rest instead of jittering for ever.
        for (const dx of [d, -d]) {
          let target = 0;
          for (let k = 1; k <= FLOW[m] * 3; k++) {
            const nx = x + dx * k;
            if (nx < 0 || nx >= w) break;
            const t = mat[i + dx * k];
            if (t !== M.EMPTY && !(STATE[t] === ST.gas || STATE[t] === ST.fire)) break;
            if (y + 1 < this.h && this.canEnter(m, mat[i + dx * k + w], 1)) { target = k; break; }
          }
          if (target) { this.swap(i, i + dx * Math.min(target, FLOW[m])); return; }
        }
        return;
      }

      if (st === ST.gas) {
        // Marsh gas keeps for ever only while it is shut in. Once it has room to move it starts to thin
        // out (a few seconds), so a breached pocket empties and its chunks can go back to sleep.
        if (this.life[i] === 255 && (mat[i - 1] === M.EMPTY || mat[i + 1] === M.EMPTY || (y > 0 && mat[i - w] === M.EMPTY))) { this.life[i] = 170 + ((R() * 80) | 0); this.wakeAt(x, y); }
        if (R() < 0.75 && y > 0) {
          const dx = R() < 0.5 ? 0 : (R() < 0.5 ? 1 : -1);
          const nx = x + dx;
          if (nx >= 0 && nx < w && this.canEnter(m, mat[i - w + dx], -1)) { this.swap(i, i - w + dx); return; }
        }
        const dx = R() < 0.5 ? 1 : -1, nx = x + dx;
        if (nx >= 0 && nx < w && mat[i + dx] === M.EMPTY) this.swap(i, i + dx);
        return;
      }

      if (st === ST.fire) {
        if (R() < 0.25 && y > 0) {
          const dx = R() < 0.5 ? 0 : (R() < 0.5 ? 1 : -1), nx = x + dx;
          if (nx >= 0 && nx < w && mat[i - w + dx] === M.EMPTY) this.swap(i, i - w + dx);
        }
      }
    }

    // ----- tools used by spells -----
    // Remove everything breakable inside a circle. Returns cells removed.
    // opts.fire: chance to leave fire on the rim; opts.boil: chance water turns to steam.
    explode(cx, cy, r, opts = {}) {
      let removed = 0;
      const r2 = r * r, R = this.rand, ring = r + 2.5;
      for (let y = Math.floor(cy - ring); y <= cy + ring; y++) {
        for (let x = Math.floor(cx - ring); x <= cx + ring; x++) {
          if (!this.inb(x, y)) continue;
          const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
          const i = y * this.w + x, m = this.mat[i];
          if (d2 <= r2) {
            if (m === M.ROCK && opts.melt && d2 <= r2 * 0.6 && x >= 8 && y >= 8 && x < this.w - 8 && y < this.h - 8) { this.put(i, M.MAGMA); removed++; continue; }
            if (m === M.EMPTY || HARD[m] || m === M.MAGMA) continue;   // magma cannot be blasted away, only cooled
            if (m === M.WATER) { if (R() < (opts.boil || 0)) this.put(i, M.STEAM); continue; }
            if (STATE[m] === ST.liquid || STATE[m] === ST.gas) continue;   // a blast does not remove oil, acid or gas: the fire it leaves deals with them
            const edge = d2 > (r - 2) * (r - 2);
            if (m === M.CRYSTAL) this.broken.push(x, y);
            this.put(i, edge && opts.fire && R() < opts.fire ? M.FIRE : M.EMPTY);
            removed++;
          } else if (d2 <= ring * ring && opts.fire) {
            if (m === M.EMPTY && R() < opts.fire * 0.35) this.put(i, M.FIRE);
            else if (m === M.MOSS && R() < opts.fire) this.put(i, M.FIRE);
          }
        }
      }
      if (removed) this.cleanup(cx - ring - 2, cy - ring - 2, cx + ring + 2, cy + ring + 2);
      return removed;
    }

    // No crumbs: after terrain breaks, any loose piece of dirt or lichen smaller
    // than MIN_PIECE cells, and any single cell sticking out with at most one
    // neighbour, crumbles into loose earth and falls. Rock is never changed.
    cleanup(x0, y0, x1, y1, into = M.EARTH) {
      const { w, h, mat } = this, MIN = World.MIN_PIECE;
      x0 = Math.max(1, Math.floor(x0)); y0 = Math.max(1, Math.floor(y0));
      x1 = Math.min(w - 2, Math.ceil(x1)); y1 = Math.min(h - 2, Math.ceil(y1));
      const breakable = m => m === M.DIRT || m === M.MOSS;
      if (!this.seenAt) this.seenAt = new Uint16Array(mat.length);
      if (++this.seenStamp >= 65535 || !this.seenStamp) { this.seenAt.fill(0); this.seenStamp = 1; }
      const seenAt = this.seenAt, st = this.seenStamp;
      const crumb = k => this.put(k, into === M.EARTH && this.rand() > 0.35 ? M.EMPTY : into);   // mostly dust; a third falls as loose earth
      // first, single cells sticking out with at most one solid neighbour
      for (let pass = 0; pass < 2; pass++) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          if (!breakable(mat[i])) continue;
          const n = SOLID[mat[i - 1]] + SOLID[mat[i + 1]] + SOLID[mat[i - w]] + SOLID[mat[i + w]];
          if (n <= 1) crumb(i);
        }
      }
      // then whole pieces smaller than MIN. A fill stops at MIN cells, so the rest of a big
      // piece is met again from another side: touching dirt already counted means "part of
      // something bigger", not a small piece.
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (!breakable(mat[i]) || seenAt[i] === st) continue;
        const piece = [i], q = [i];
        seenAt[i] = st;
        let joined = false;
        while (q.length && piece.length < MIN && !joined) {
          const j = q.pop();
          for (const k of [j - 1, j + 1, j - w, j + w]) {
            if (!breakable(mat[k])) continue;
            if (seenAt[k] !== st) { seenAt[k] = st; piece.push(k); q.push(k); }
            else if (!piece.includes(k)) { joined = true; break; }
          }
        }
        if (piece.length < MIN && !q.length && !joined) for (const k of piece) crumb(k);
      }
    }

    // Dirt that formed where magma cooled is checked for crumbs, a few chunks at a time.
    settle() {
      if (!this.cooled.length) return;
      const cs = this.cs, done = new Set(), later = [];
      for (const i of this.cooled) {
        const cx = ((i % this.w) / cs) | 0, cy = ((i / this.w) / cs) | 0, k = cy * this.cw + cx;
        if (done.has(k)) continue;
        if (done.size >= 6) { later.push(i); continue; }   // the rest wait for the next call
        done.add(k);
        this.cleanup(cx * cs - 6, cy * cs - 6, (cx + 1) * cs + 6, (cy + 1) * cs + 6);
      }
      this.cooled = later;
    }

    // The Crucible: rock within r of (cx, cy) melts into (cooling) magma.
    meltRock(cx, cy, r) {
      let n = 0;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 8 || y < 8 || x >= this.w - 8 || y >= this.h - 8) continue; // never the world's frame
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
        const i = y * this.w + x;
        if (this.mat[i] === M.ROCK) { this.put(i, M.MAGMA); n++; }
      }
      return n;
    }

    // Electrify the body of water touching (x,y). Returns cells charged.
    electrify(x, y, amount, maxCells) {
      const w = this.w, seen = new Set(), queue = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (this.inb(nx, ny) && CONDUCT[this.mat[ny * w + nx]]) { const j = ny * w + nx; if (!seen.has(j)) { seen.add(j); queue.push(j); } }
      }
      let n = 0;
      while (queue.length && n < maxCells) {
        const i = queue.shift(); n++;
        if (this.charge[i] < amount) this.charge[i] = amount;
        const cx = i % w, cy = (i / w) | 0;
        this.wakeAt(cx, cy);
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          if (j < 0 || j >= this.mat.length || seen.has(j)) continue;
          if (Math.abs((j % w) - cx) > 1) continue;
          if (CONDUCT[this.mat[j]]) { seen.add(j); queue.push(j); }
        }
      }
      return n;
    }

    // Walk from (x,y) along (dx,dy) (unit vector) until a solid cell or max.
    // Returns { x, y, hit, dist, lx, ly } where l is the last open point.
    ray(x, y, dx, dy, max, stop) {
      let lx = x, ly = y;
      for (let d = 0; d <= max; d += 0.5) {
        const px = x + dx * d, py = y + dy * d, ix = Math.floor(px), iy = Math.floor(py);
        const m = this.get(ix, iy);
        if (stop ? stop(m, ix, iy) : SOLID[m]) return { x: px, y: py, ix, iy, hit: true, dist: d, lx, ly };
        lx = px; ly = py;
      }
      return { x: lx, y: ly, ix: Math.floor(lx), iy: Math.floor(ly), hit: false, dist: max, lx, ly };
    }

    // Count materials inside a box (for actors). Returns counts per material.
    sample(x0, y0, x1, y1, out) {
      out.fill(0);
      let charged = 0;
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) {
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
          const i = y * this.w + x;
          out[this.mat[i]]++;
          if (this.charge[i]) charged++;
        }
      }
      return charged;
    }

    // ----- saving: only the chunks that changed since the cave was generated -----
    // Each chunk's materials and life values are run-length encoded (value, run length
    // up to 255) and stored as base64 text.
    // ----- co-op: giving another device exactly this cave -----
    // One number per chunk that changes if any cell in it differs.
    chunkHashes() {
      const { cw, ch, cs, w } = this, out = new Uint32Array(cw * ch), A = [this.mat, this.shade, this.life, this.charge];
      for (let k = 0; k < out.length; k++) {
        const x0 = (k % cw) * cs, y0 = ((k / cw) | 0) * cs; let h = 2166136261;
        for (const a of A) for (let y = 0; y < cs; y++) { let i = (y0 + y) * w + x0; for (let x = 0; x < cs; x++) h = Math.imul(h ^ a[i++], 16777619); }
        out[k] = h >>> 0;
      }
      return out;
    }
    // one chunk's cells (material, texture, life, charge) as text
    packChunk(k) {
      const { cw, cs, w } = this, x0 = (k % cw) * cs, y0 = ((k / cw) | 0) * cs; let s = '';
      for (const a of [this.mat, this.shade, this.life, this.charge]) for (let y = 0; y < cs; y++) s += String.fromCharCode.apply(null, a.subarray((y0 + y) * w + x0, (y0 + y) * w + x0 + cs));
      return btoa(s);
    }
    unpackChunk(k, text) {
      const { cw, cs, w } = this, x0 = (k % cw) * cs, y0 = ((k / cw) | 0) * cs, s = atob(text);
      if (s.length !== cs * cs * 4) return false;
      let n = 0;
      for (const a of [this.mat, this.shade, this.life, this.charge]) for (let y = 0; y < cs; y++) { let i = (y0 + y) * w + x0; for (let x = 0; x < cs; x++) a[i++] = s.charCodeAt(n++); }
      this.dirty[k] = 1;
      return true;
    }
    // everything about the cave that is not a cell: where things are, and which chunks are awake or changed
    meta() {
      const b64 = a => { let s = ''; for (let i = 0; i < a.length; i += 4096) s += String.fromCharCode.apply(null, a.subarray(i, i + 4096)); return btoa(s); };
      return { spawn: this.spawn, caches: this.caches, dummySpots: this.dummySpots, hub: this.hub, lair: this.lair, nodes: this.nodes, edges: this.edges, enemyHomes: this.enemyHomes, lodestones: this.lodestones,
        broken: this.broken, cooled: this.cooled, bw: this.bw, lift: this.lift, act: this.act, biomeMap: b64(this.biomeMap), awake: b64(this.awake), changed: b64(this.changed) };
    }
    adopt(m) {
      const put = (a, text) => { const s = atob(text); if (s.length === a.length) for (let i = 0; i < a.length; i++) a[i] = s.charCodeAt(i); };
      for (const k of ['spawn', 'caches', 'dummySpots', 'hub', 'lair', 'nodes', 'edges', 'enemyHomes', 'lodestones', 'broken', 'cooled']) this[k] = m[k];
      this.lift = m.lift | 0;
      put(this.biomeMap, m.biomeMap); put(this.awake, m.awake); put(this.changed, m.changed);
    }
    // both devices call this at the same moment, so the cave's clock and dice agree from here on
    syncStart(seed) { this.tick = 0; this.stamp.fill(0); this.rand = makeRng(seed); this.dirty.fill(1); }

    saveChunks() {
      const out = {}, cs = this.cs;
      const enc = bytes => {
        const runs = [];
        for (let i = 0; i < bytes.length;) { let n = 1; while (i + n < bytes.length && bytes[i + n] === bytes[i] && n < 255) n++; runs.push(bytes[i], n); i += n; }
        let s = ''; for (const b of runs) s += String.fromCharCode(b);
        return btoa(s);
      };
      for (let k = 0; k < this.changed.length; k++) {
        if (!this.changed[k]) continue;
        const cx = k % this.cw, cy = (k / this.cw) | 0, m = new Uint8Array(cs * cs), l = new Uint8Array(cs * cs);
        for (let y = 0; y < cs; y++) for (let x = 0; x < cs; x++) { const i = (cy * cs + y) * this.w + cx * cs + x; m[y * cs + x] = this.mat[i]; l[y * cs + x] = this.life[i]; }
        out[k] = enc(m) + '|' + enc(l);
      }
      return out;
    }
    loadChunks(saved) {
      const cs = this.cs;
      const dec = str => { const s = atob(str), out = []; for (let i = 0; i < s.length; i += 2) for (let n = 0; n < s.charCodeAt(i + 1); n++) out.push(s.charCodeAt(i)); return out; };
      for (const k in saved) {
        const [ms, ls] = saved[k].split('|'), m = dec(ms), l = dec(ls), cx = k % this.cw, cy = (k / this.cw) | 0;
        if (m.length !== cs * cs) continue;
        for (let y = 0; y < cs; y++) for (let x = 0; x < cs; x++) {
          const i = (cy * cs + y) * this.w + cx * cs + x, v = m[y * cs + x];
          if (v >= N) continue;
          this.mat[i] = v; this.life[i] = l[y * cs + x] || 0; this.charge[i] = 0;
        }
        this.changed[k] = 1; this.awake[k] = 3; this.dirty[k] = 1;
      }
    }

    // Chunks changed since the last call (for sending to another player later).
    takeDirty() {
      const list = [];
      for (let k = 0; k < this.dirty.length; k++) if (this.dirty[k]) { list.push(k); this.dirty[k] = 0; }
      return list;
    }

    // ----- the map -----
    // A web of caves spreading in every direction from a hub: chambers joined
    // by winding tunnels (every chamber reachable, plus extra links for loops
    // and forks), unbreakable rock masses that shape the routes, three regions
    // with their own pools, dirt plugs to dig through, Lodestones, and homes
    // for the crawlers. Everything comes from the seed.
    generate() {
      const { w, h } = this, mat = this.mat, s = this.seed % 997, C = KData.cave;
      const R = makeRng(this.seed ^ 0x9e3779b9);
      const BIOMES = this.biomes;

      // 1. dirt everywhere, with large rock masses
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = noise(x, y, 95, s + 1) * 0.65 + noise(x, y, 24, s + 2) * 0.35;
        mat[y * w + x] = n > 0.66 ? M.ROCK : M.DIRT;
      }

      // 2. chambers: the hub in the middle, the rest spread around it
      const hub = { x: w >> 1, y: h >> 1, rx: 84, ry: 42, hub: true };
      this.hub = hub;
      const nodes = [hub];
      for (let tries = 0; tries < 4000 && nodes.length < C.chambers; tries++) {
        const x = 100 + R() * (w - 200), y = 80 + R() * (h - 160);
        if (nodes.some(n => Math.hypot(n.x - x, (n.y - y) * 1.3) < C.spacing)) continue;
        nodes.push({ x, y, rx: 30 + R() * 40, ry: 20 + R() * 20 });
      }
      for (const n of nodes) n.dist = Math.hypot(n.x - hub.x, n.y - hub.y);

      // 3. links: a tree that reaches every chamber, then extra links for loops
      const edges = [], inTree = new Set([0]), key = (a, b) => a < b ? a + ',' + b : b + ',' + a, have = new Set();
      const dd = (a, b) => Math.hypot(nodes[a].x - nodes[b].x, (nodes[a].y - nodes[b].y) * 1.2);
      while (inTree.size < nodes.length) {
        let best = null;
        for (const a of inTree) for (let b = 0; b < nodes.length; b++) {
          if (inTree.has(b)) continue;
          const d = dd(a, b);
          if (!best || d < best.d) best = { a, b, d };
        }
        inTree.add(best.b); edges.push(best); have.add(key(best.a, best.b));
      }
      for (let a = 0; a < nodes.length; a++) {
        const near = nodes.map((_, b) => b).filter(b => b !== a).sort((p, q) => dd(a, p) - dd(a, q)).slice(0, 3);
        for (const b of near) if (!have.has(key(a, b)) && dd(a, b) < 330 && R() < C.loopChance * 0.6) { edges.push({ a, b, d: dd(a, b) }); have.add(key(a, b)); }
      }

      const disc = (cx, cy, r, m) => {
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r * r) mat[y * w + x] = m;
        }
      };
      // 4. tunnels: winding, of varying width
      for (const e of edges) {
        const A = nodes[e.a], B = nodes[e.b], len = Math.hypot(B.x - A.x, B.y - A.y);
        const nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
        const amp = Math.min(45, len * 0.18) * (R() - 0.5) * 2, waves = 1 + ((R() * 2) | 0), ph = R() * 6;
        const rad = C.tunnel[0] + R() * (C.tunnel[1] - C.tunnel[0]);
        e.path = [];
        for (let d = 0; d <= len; d += 3) {
          const t = d / len, off = amp * Math.sin(t * Math.PI) * Math.sin(t * Math.PI * waves + ph);
          const x = A.x + (B.x - A.x) * t + nx * off, y = A.y + (B.y - A.y) * t + ny * off;
          const r = rad + (noise(x, y, 17, s + 4) - 0.5) * 7;
          disc(x, y, r, M.EMPTY);
          e.path.push([x, y, r]);
        }
      }
      // 5. chambers: noisy ellipses, with floating ledges in the big ones
      for (const n of nodes) {
        for (let y = Math.floor(n.y - n.ry * 1.4); y <= n.y + n.ry * 1.4; y++) for (let x = Math.floor(n.x - n.rx * 1.4); x <= n.x + n.rx * 1.4; x++) {
          if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
          const ex = (x - n.x) / n.rx, ey = (y - n.y) / n.ry;
          if (ex * ex + ey * ey + (noise(x, y, 11, s + 3) - 0.5) * 0.6 < 1) mat[y * w + x] = M.EMPTY;
        }
        if (n.rx > 50 || n.hub) {
          const count = n.hub ? 2 : 1 + (R() < 0.5);
          for (let k = 0; k < count; k++) {
            const lx = n.x + (R() - 0.5) * n.rx * 1.1, ly = n.y + (R() - 0.2) * n.ry * 0.6, lrx = 12 + R() * 10, lry = 3 + R() * 1.5;
            for (let y = Math.floor(ly - lry - 2); y <= ly + lry + 2; y++) for (let x = Math.floor(lx - lrx - 3); x <= lx + lrx + 3; x++) {
              const ex = (x - lx) / lrx, ey = (y - ly) / lry;
              if (ex * ex + ey * ey + (noise(x, y, 4, s + 7) - 0.5) * 0.5 < 1 && mat[y * w + x] === M.EMPTY) mat[y * w + x] = M.DIRT;
            }
          }
        }
      }
      // 6. dirt plugs: some tunnels are blocked midway and must be dug through
      for (const e of edges) {
        if (nodes[e.a].hub || nodes[e.b].hub || R() > C.plugChance || e.path.length < 30) continue;
        const mid = e.path.length >> 1;
        for (let k = mid - 3; k <= mid + 3; k++) { const [x, y, r] = e.path[k]; disc(x, y, r + 2, M.DIRT); }
        e.plugged = true;
      }
      // 7. rock frame around the world
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x > 14 && x < w - 15 && y > 14 && y < h - 15) { x = w - 16; continue; }
        const n = noise(x, y, 7, s + 11) * 6;
        if (x < 6 + n || x > w - 7 - n || y < 6 + n || y > h - 7 - n) mat[y * w + x] = M.ROCK;
      }

      // 8. regions: rose around the hub; further out, the nearest region seed
      const seeds = [], turn = R() * Math.PI * 2;
      for (let k = 0; k < 6; k++) {
        const an = turn + k / 6 * Math.PI * 2;
        seeds.push({ x: hub.x + Math.cos(an) * C.regionDistance, y: hub.y + Math.sin(an) * C.regionDistance * 0.5, b: 1 + (k % 2) });
      }
      for (const n of nodes) {
        if (n.dist < C.hubRadius) { n.biome = 0; continue; }
        let best = 1e9; for (const sd of seeds) { const d = Math.hypot(sd.x - n.x, sd.y - n.y); if (d < best) { best = d; n.biome = sd.b; } }
      }
      const bw = w >> 4, bh = h >> 4;
      this.biomeMap = new Uint8Array(bw * bh);
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const x = bx * 16 + 8, y = by * 16 + 8;
        let best = 1e9, b = 0;
        for (const n of nodes) { const d = Math.hypot((n.x - x) / (n.rx + 60), (n.y - y) / (n.ry + 60)); if (d < best) { best = d; b = n.biome; } }
        this.biomeMap[by * bw + bx] = b;
      }
      this.bw = bw;

      // 8b. the Emberwyrm's lair: the biggest far Ember chamber becomes a great hall with a magma lake
      const lairNode = nodes.filter(n => n.biome === 2 && n.dist > 750).sort((a, b) => b.rx * b.ry - a.rx * a.ry)[0];
      this.lair = null;
      if (lairNode) {
        const n = lairNode;
        n.lair = true; n.rx = Math.max(n.rx, 185); n.ry = Math.max(n.ry, 82);
        n.x = Math.max(n.rx + 30, Math.min(w - n.rx - 30, n.x)); n.y = Math.max(n.ry + 40, Math.min(h - n.ry * 2 - 30, n.y));
        for (let y = Math.floor(n.y - n.ry * 1.2); y <= n.y + n.ry * 1.9; y++) for (let x = Math.floor(n.x - n.rx * 1.2); x <= n.x + n.rx * 1.2; x++) {
          if (x < 12 || y < 12 || x >= w - 12 || y >= h - 12) continue;
          const ex = (x - n.x) / n.rx, ey = (y - n.y) / n.ry;
          const bey = (y - (n.y + n.ry * 0.8)) / (n.ry * 0.9), bex = (x - n.x) / (n.rx * 0.9);
          if (ex * ex + ey * ey + (noise(x, y, 11, s + 3) - 0.5) * 0.3 < 1 || bex * bex + bey * bey < 1) mat[y * w + x] = M.EMPTY;
        }
        // the lake: every open cell below the chamber's middle, inside a box
        const lx0 = Math.max(12, Math.floor(n.x - n.rx * 1.2)), lx1 = Math.min(w - 13, Math.ceil(n.x + n.rx * 1.2));
        const ly0 = Math.floor(n.y + n.ry * 0.15), ly1 = Math.min(h - 13, Math.ceil(n.y + n.ry * 1.75));
        for (let y = ly0; y <= ly1; y++) for (let x = lx0; x <= lx1; x++) {
          const i = y * w + x;
          if (mat[i] === M.EMPTY) { mat[i] = M.MAGMA; this.life[i] = 255; }
        }
        // a rock rim 3 cells thick around the magma (so digging cannot drain it), and
        // tunnel mouths at the box's edge sealed with rock
        for (let y = ly0 - 3; y <= ly1 + 3; y++) for (let x = lx0 - 3; x <= lx1 + 3; x++) {
          const i = y * w + x;
          if (mat[i] !== M.DIRT && mat[i] !== M.MOSS && mat[i] !== M.EMPTY) continue;
          if (mat[i] === M.EMPTY && y < ly0) continue;
          let nearMagma = false;
          for (let k = 1; k <= 3 && !nearMagma; k++) for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) if (mat[i + dy * w + dx] === M.MAGMA) { nearMagma = true; break; }
          if (nearMagma) mat[i] = M.ROCK;
        }
        // ledges above the lake to fight from
        for (const [fx, fy, fr] of [[-0.72, -0.2, 16], [-0.4, -0.5, 17], [0, -0.25, 18], [0.4, -0.5, 17], [0.72, -0.2, 16], [0, -0.72, 15], [-0.2, -0.06, 7], [0.2, -0.06, 7], [-0.55, -0.02, 7], [0.55, -0.02, 7]]) {
          const lx = n.x + fx * n.rx, ly = n.y + fy * n.ry;
          for (let y = Math.floor(ly - 4); y <= ly + 4; y++) for (let x = Math.floor(lx - fr - 2); x <= lx + fr + 2; x++) {
            const ex = (x - lx) / fr, ey = (y - ly) / 3.5;
            if (ex * ex + ey * ey < 1 && mat[y * w + x] === M.EMPTY) mat[y * w + x] = M.DIRT;
          }
        }
        this.lair = { x: n.x, y: n.y, rx: n.rx, ry: n.ry, surface: Math.floor(n.y + n.ry * 0.15), level: this.levelAt(n.x, n.y), boss: KData.acts[this.act].boss };
      }

      // 9. pools in chambers (water in the Drowned Galleries, magma in the Ember Veins)
      for (const n of nodes) {
        const B = BIOMES[n.biome];
        if (n.lair || !B.pool || R() < 0.25) continue;
        // poolFrom: where the surface sits, from the chamber's top (0) to its bottom (1)
        const pm = M[B.pool];
        // dig a basin into the floor, below where the tunnels join, so the pool holds
        const bx = n.x, by = n.y + n.ry * 0.85, brx = n.rx * 0.75, bry = n.ry * (pm === M.WATER ? 0.55 : 0.35);
        for (let y = Math.floor(by - bry); y <= by + bry; y++) for (let x = Math.floor(bx - brx); x <= bx + brx; x++) {
          if (x < 8 || y < 8 || x >= w - 8 || y >= h - 8) continue;
          const ex = (x - bx) / brx, ey = (y - by) / bry;
          if (ex * ex + ey * ey + (noise(x, y, 6, s + 9) - 0.5) * 0.3 < 1 && mat[y * w + x] !== M.ROCK) mat[y * w + x] = M.EMPTY;
        }
        for (let y = Math.floor(n.y + n.ry * (2 * B.poolFrom - 1)); y <= n.y + n.ry * 1.6; y++)
          for (let x = Math.floor(n.x - n.rx * 1.4); x <= n.x + n.rx * 1.4; x++) {
            if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
            const ex = (x - n.x) / n.rx, ey = (y - n.y) / n.ry;
            const bex = (x - bx) / brx, bey = (y - by) / bry;
            if ((ex * ex + ey * ey < 1.05 || bex * bex + bey * bey < 1.1) && mat[y * w + x] === M.EMPTY) { mat[y * w + x] = pm; this.life[y * w + x] = 255; }
          }
        n.pooled = true;
        // drain the pool down to its lowest opening, so it starts at rest instead of leaking for a minute
        const x0 = Math.max(2, Math.floor(n.x - n.rx * 1.5)), x1 = Math.min(w - 3, Math.ceil(n.x + n.rx * 1.5));
        const y0 = Math.max(2, Math.floor(n.y - n.ry * 1.5)), y1 = Math.min(h - 3, Math.ceil(n.y + n.ry * 1.6));
        for (let pass = 0, changed = true; changed && pass < 400; pass++) {
          changed = false;
          for (let y = y1; y >= y0; y--) for (let x = x0; x <= x1; x++) {
            const i = y * w + x;
            if (mat[i] !== pm) continue;
            if (mat[i + w] === M.EMPTY || mat[i - 1] === M.EMPTY || mat[i + 1] === M.EMPTY) { mat[i] = M.EMPTY; this.life[i] = 0; changed = true; }
          }
        }
      }

      // 10. lichen on floors and hanging from ceilings; mud patches in wet regions
      for (let y = 6; y < h - 6; y++) for (let x = 5; x < w - 5; x++) {
        const i = y * w + x;
        if (mat[i] !== M.DIRT) continue;
        const B = BIOMES[this.biomeMap[(y >> 4) * bw + (x >> 4)]];
        if (mat[i - w] === M.EMPTY) {
          if (R() < B.mud) { mat[i] = M.MUD; if (mat[i + w] === M.DIRT) mat[i + w] = M.MUD; }
          else if (R() < B.lichen) { mat[i] = M.MOSS; if (R() < 0.4 && mat[i + w] === M.DIRT) mat[i + w] = M.MOSS; }
        } else if (mat[i + w] === M.EMPTY && R() < B.hang) {
          const len = 1 + ((R() * 4) | 0);
          for (let k = 1; k <= len && mat[i + k * w] === M.EMPTY; k++) mat[i + k * w] = M.MOSS;
        }
      }
      // 10b. crystal veins in chamber walls, and a few deeper in the dirt
      const T = KData.treasure;
      const blob = (cx, cy, r, m, onlyIn) => {
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (x < 10 || y < 10 || x >= w - 10 || y >= h - 10) continue;
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy + (noise(x, y, 3, s + 12) - 0.5) * r * 2 > r * r) continue;
          const i = y * w + x;
          if (!onlyIn || onlyIn.includes(mat[i])) mat[i] = m;
        }
      };
      const wallPoint = (n, an, extra) => {
        // walk out from the chamber's centre to its wall, then a little further
        let x = n.x, y = n.y, k = 0;
        while (k++ < 160 && mat[Math.round(y) * w + Math.round(x)] !== M.DIRT && mat[Math.round(y) * w + Math.round(x)] !== M.ROCK) { x += Math.cos(an); y += Math.sin(an); }
        return { x: x + Math.cos(an) * extra, y: y + Math.sin(an) * extra };
      };
      for (const n of nodes) {
        if (n.hub || R() > T.veinChance) continue;
        const pt = wallPoint(n, R() * Math.PI * 2, 2);
        blob(pt.x, pt.y, 3 + R() * 3, M.CRYSTAL, [M.DIRT, M.ROCK, M.MOSS]);
      }
      for (let k = 0; k < T.extraVeins; k++) {
        const x = 40 + R() * (w - 80), y = 40 + R() * (h - 80);
        if (mat[(y | 0) * w + (x | 0)] === M.DIRT) blob(x, y, 2 + R() * 3, M.CRYSTAL, [M.DIRT]);
      }

      for (let i = 0; i < mat.length; i++) this.shade[i] = (R() * 255) | 0;
      this.cleanup(0, 0, w, h, M.EMPTY); // no crumbs in the starting cave

      // 10b. what each region's chambers hold (biome.feat: the chance of each for one chamber): wooden props
      // standing in the chamber, and seams and pockets in the dirt just outside it that are found by digging
      // or set off by a spell: coal, oil, marsh gas, ice, acid.
      const seam = (bx, by, r, into) => {
        for (let yy = Math.floor(by - r); yy <= by + r; yy++) for (let xx = Math.floor(bx - r); xx <= bx + r; xx++) {
          if (xx < 12 || yy < 12 || xx >= w - 12 || yy >= h - 12) continue;
          const dd = Math.hypot(xx - bx, yy - by) + (hash(xx, yy, s + 71) - 0.5) * 3;
          if (dd < r && mat[yy * w + xx] === M.DIRT) mat[yy * w + xx] = into;
        }
      };
      for (const n of nodes) {
        if (n.hub || n.lair) continue;
        const F = this.biomes[n.biome].feat || {};
        const beside = r => { const an = R() * Math.PI * 2; return [n.x + Math.cos(an) * (n.rx + r * 0.7), n.y + Math.sin(an) * (n.ry + r * 0.7)]; };
        if (R() < (F.wood || 0)) {
          // a plank on two posts, or a single prop from floor to roof
          const px = Math.round(n.x + (R() - 0.5) * n.rx), fy = this.floorBelow(px, Math.round(n.y));
          if (R() < 0.5) { for (let yy = fy; yy > fy - 90 && mat[yy * w + px] === M.EMPTY; yy--) for (const dx of [-1, 0, 1]) if (mat[yy * w + px + dx] === M.EMPTY) mat[yy * w + px + dx] = M.WOOD; }
          else {
            const len = 14 + Math.floor(R() * 16), top = fy - 14 - Math.floor(R() * 10);
            for (let xx = px - len; xx <= px + len; xx++) for (let t = 0; t < 3; t++) if (mat[(top + t) * w + xx] === M.EMPTY) mat[(top + t) * w + xx] = M.WOOD;
            for (const ex of [px - len + 2, px + len - 2]) for (let yy = top + 3; yy < top + 60 && mat[yy * w + ex] === M.EMPTY; yy++) { mat[yy * w + ex] = M.WOOD; if (mat[yy * w + ex + 1] === M.EMPTY) mat[yy * w + ex + 1] = M.WOOD; }
          }
        }
        if (R() < (F.coal || 0)) { const [bx, by] = beside(6); seam(bx, by, 5 + R() * 4, M.COAL); }
        if (R() < (F.oil || 0)) { const [bx, by] = beside(7); seam(bx, by, 5 + R() * 3, M.OIL); }
        if (R() < (F.gas || 0)) { const bx = n.x + (R() - 0.5) * n.rx, by = n.y - n.ry - 8 - R() * 6; seam(bx, by, 5 + R() * 4, M.GAS); }
        if (R() < (F.ice || 0)) { const [bx, by] = beside(9); seam(bx, by, 8 + R() * 7, M.ICE); }
        if (R() < (F.acid || 0)) { const [bx, by] = beside(7); seam(bx, by, 5 + R() * 3, M.ACID); }
      }
      // Pockets of oil, gas and acid are sealed: where one would open into the cave it keeps a skin of dirt,
      // so nothing leaks (or keeps the sand awake) until somebody breaks in.
      const skin = [];
      for (let i = w; i < mat.length - w; i++) { const m = mat[i]; if ((m === M.GAS || m === M.OIL || m === M.ACID) && (mat[i - 1] === M.EMPTY || mat[i + 1] === M.EMPTY || mat[i - w] === M.EMPTY || mat[i + w] === M.EMPTY)) skin.push(i); }
      for (const i of skin) mat[i] = M.DIRT;
      for (let i = 0; i < mat.length; i++) if (mat[i] === M.GAS) this.life[i] = 255;   // pocket gas does not fade

      // 10c. relic caches, sealed in by the cave (after the clean-up, so pockets stay)
      const solidAround = (x, y, r, kinds) => {
        for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (!kinds.includes(this.get(xx, yy))) return false;
        return true;
      };
      const addCache = (x, y, kind, n) => this.caches.push({ id: this.caches.length, x: Math.round(x), y: Math.round(y), kind, level: this.levelAt(x, y) });
      for (const n of nodes) {
        if (n.hub || n.lair || R() > T.cacheChance) continue;
        const B = this.biomes[n.biome];
        const kinds = Object.keys(T.kinds).filter(k => k !== 'pool' || (B.pool && n.pooled));
        shuffle(kinds, R);
        let placed = false;
        for (const kind of kinds) {
          if (placed || R() > T.kinds[kind] * 1.6) continue;
          if (kind === 'pool') {
            // at the bottom of the chamber's basin, under the water or magma
            const y = this.floorBelow(n.x, n.y + n.ry * 0.6);
            if (mat[(y - 2) * w + Math.round(n.x)] === M[B.pool]) { addCache(n.x, y, B.pool === 'MAGMA' ? 'magma' : 'flooded', n); placed = true; }
          } else if (kind === 'high') {
            // an alcove dug into the ceiling
            let y = Math.round(n.y);
            while (y > 12 && !SOLID[mat[y * w + Math.round(n.x)]]) y--;
            if (y > 14 && solidAround(Math.round(n.x), y - 6, 4, [M.DIRT, M.MOSS, M.ROCK, M.CRYSTAL])) {
              for (let yy = y - 9; yy <= y + 1; yy++) for (let xx = Math.round(n.x) - 5; xx <= n.x + 5; xx++) if (mat[yy * w + xx] !== M.ROCK) mat[yy * w + xx] = M.EMPTY;
              for (let xx = Math.round(n.x) - 6; xx <= n.x + 6; xx++) if (!SOLID[mat[(y - 2) * w + xx]]) mat[(y - 2) * w + xx] = M.DIRT; // a shelf to sit on
              addCache(n.x, y - 3, 'high', n); placed = true;
            }
          } else {
            // buried in dirt, or (rarer) encased in rock beside the chamber
            const want = kind === 'rock' ? [M.ROCK] : [M.DIRT, M.MOSS, M.CRYSTAL];
            for (let t = 0; t < 12 && !placed; t++) {
              const an = R() * Math.PI * 2, pt = wallPoint(n, an, kind === 'rock' ? 10 : 9 + R() * 10), x = Math.round(pt.x), y = Math.round(pt.y);
              if (x < 20 || y < 20 || x > w - 20 || y > h - 20 || !solidAround(x, y, 7, want)) continue;
              for (let yy = y - 4; yy <= y + 3; yy++) for (let xx = x - 5; xx <= x + 5; xx++) mat[yy * w + xx] = M.EMPTY;
              addCache(x, y + 4, kind === 'rock' ? 'rock' : 'buried', n); placed = true;
            }
          }
        }
      }
      // the generated cave starts at rest (pools drained, crumbs removed): nothing needs
      // simulating until something touches it, which wakes its chunk
      this.awake.fill(0);
      this.dirty.fill(1);
      this.explored = new Uint8Array(this.cw * this.ch);

      // 11. where things start
      this.nodes = nodes; this.edges = edges; this.hub = hub;
      const spotIn = (n, tries, head, centreFirst = true) => {
        for (let k = 0; k < tries; k++) {
          const sp = this.standSpot(n.x + (k || !centreFirst ? (R() - 0.5) * n.rx * 1.2 : 0), n.y - n.ry * 0.3, head);
          if (sp && sp.y < n.y + n.ry * 1.5) return sp;
        }
        return null;
      };
      this.spawn = spotIn(hub, 120, 22);
      // fallback: search the hub on a grid for any spot with headroom
      for (let gy = hub.y - hub.ry; !this.spawn && gy <= hub.y + hub.ry; gy += 6)
        for (let gx = hub.x - hub.rx; !this.spawn && gx <= hub.x + hub.rx; gx += 6) this.spawn = this.standSpot(gx, gy, 20);
      if (!this.spawn) this.spawn = { x: hub.x, y: this.floorBelow(hub.x, hub.y) };
      this.dummySpots = [];
      for (let k = 0; k < 40 && this.dummySpots.length < 2; k++) {
        const sp = spotIn(hub, 1, 16, false);
        if (sp && Math.abs(sp.x - this.spawn.x) > 24 && this.dummySpots.every(d => Math.abs(d.x - sp.x) > 20)) this.dummySpots.push(sp);
      }
      // enemies: a few per chamber (more further out), chosen by region and level
      this.enemyHomes = [];
      const EN = KData.enemies;
      for (const n of nodes) {
        if (n.hub || n.lair) continue;
        const level = this.levelAt(n.x, n.y);
        const count = Math.min(4, 1 + Math.floor(n.dist / 420) + (R() < 0.5 ? 1 : 0));
        let wardens = 0;
        for (let k = 0; k < count; k++) {
          const pool = Object.keys(EN).filter(id => EN[id].spawn.from <= level && !(id === 'warden' && wardens));
          const total = pool.reduce((t, id) => t + EN[id].spawn.weights[n.biome], 0);
          let r = R() * total, kind = pool[0];
          for (const id of pool) { r -= EN[id].spawn.weights[n.biome]; if (r <= 0) { kind = id; break; } }
          let home = null;
          if (kind === 'moth') {
            // somewhere open in the upper part of the chamber
            for (let t = 0; t < 10 && !home; t++) {
              const x = Math.round(n.x + (R() - 0.5) * n.rx), y = Math.round(n.y - n.ry * (0.1 + R() * 0.4));
              let clear = true;
              for (let yy = y - 8; yy <= y + 8 && clear; yy += 2) for (let xx = x - 8; xx <= x + 8; xx += 2) if (SOLID[this.get(xx, yy)] || this.get(xx, yy) === M.WATER) { clear = false; break; }
              if (clear) home = { x, y };
            }
          } else if (kind === 'spitter') {
            // set into a side wall, facing into the chamber
            const side = R() < 0.5 ? 1 : -1, an = (side > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.6;
            let x = n.x, y = n.y, t = 0;
            while (t++ < 200 && !SOLID[this.get(Math.round(x), Math.round(y))]) { x += Math.cos(an); y += Math.sin(an); }
            if (t < 200 && this.get(Math.round(x), Math.round(y)) !== M.WATER) home = { x: Math.round(x + side * 2), y: Math.round(y + 5), face: -side };
          } else {
            home = spotIn(n, 8, kind === 'warden' ? 18 : 10);
            if (home && this.get(home.x, home.y - 2) !== M.EMPTY) home = null;
          }
          if (!home) continue;
          if (kind === 'warden') wardens++;
          this.enemyHomes.push({ ...home, level, kind, biome: n.biome });
        }
      }
      const far = nodes.filter(n => !n.hub && n.dist > 220);
      for (let i = far.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [far[i], far[j]] = [far[j], far[i]]; }
      // Lodestones: one in the hub next to where you start, the rest spread through the cave
      this.lodestones = [];
      const hubStone = this.standSpot(this.spawn.x - 18, this.spawn.y - 4, 16) || { x: this.spawn.x - 18, y: this.spawn.y };
      this.lodestones.push({ id: 0, x: hubStone.x, y: hubStone.y, hub: true });
      if (lairNode) {
        // the chamber nearest the lair always gets a Lodestone
        // the nearest chamber to the lair with room for one gets a Lodestone
        const byDist = nodes.filter(n => !n.hub && !n.lair).sort((a, b) => Math.hypot(a.x - lairNode.x, a.y - lairNode.y) - Math.hypot(b.x - lairNode.x, b.y - lairNode.y));
        for (const near of byDist.slice(0, 4)) {
          const sp = spotIn(near, 30, 16);
          if (sp) { this.lodestones.push({ id: this.lodestones.length, x: sp.x, y: sp.y, nearLair: true }); break; }
        }
      }
      for (const n of far) {
        if (n.lair) continue;
        if (this.lodestones.length >= C.lodestones) break;
        if (this.lodestones.some(l => Math.hypot(l.x - n.x, l.y - n.y) < 260)) continue;
        const sp = spotIn(n, 12, 16);
        if (sp) this.lodestones.push({ id: this.lodestones.length, x: sp.x, y: sp.y });
      }
      for (const l of this.lodestones) { l.region = this.biomes[this.biomeAt(l.x, l.y - 8)].name; l.level = this.levelAt(l.x, l.y); }
      // specks left by the last steps (shelves under high caches are 13 cells and stay)
      { const keep = World.MIN_PIECE; World.MIN_PIECE = 10; this.cleanup(0, 0, w, h, M.EMPTY); World.MIN_PIECE = keep; }
      this.changed = new Uint8Array(this.cw * this.ch); // chunks changed since generation (for saving)
    }

    // A place to stand near (x, y): climb out of anything solid, drop to the
    // floor, and check there is headroom (returns null if there is not).
    standSpot(x, y, head = 20) {
      x = Math.round(x); y = Math.round(y);
      for (let k = 0; k < 60 && SOLID[this.get(x, y)]; k++) y--;
      y = this.floorBelow(x, y);
      for (let k = 1; k <= head; k++) for (const dx of [-6, -3, 0, 3, 6]) if (SOLID[this.get(x + dx, y - k)]) return null;
      return { x, y };
    }

    // First solid cell at or below (x, y): where something standing there rests.
    floorBelow(x, y) {
      x = Math.max(1, Math.min(this.w - 2, Math.round(x))); y = Math.max(1, Math.round(y));
      while (y < this.h - 2 && !SOLID[this.get(x, y)]) y++;
      return y;
    }
    biomeAt(x, y) { return this.biomeMap[(Math.max(0, Math.min(this.h - 1, y | 0)) >> 4) * this.bw + (Math.max(0, Math.min(this.w - 1, x | 0)) >> 4)]; }
    levelAt(x, y) { return 1 + this.lift + Math.floor(Math.hypot(x - this.hub.x, y - this.hub.y) / KData.cave.levelEvery); }
    // kept for tests: the first floor below the first open cell from the top
    surfaceAt(x) {
      let y = 6;
      while (y < this.h - 6 && this.mat[y * this.w + x] !== M.EMPTY) y++;
      return this.floorBelow(x, y);
    }
  }

  World.REACH_X = 14; World.REACH_Y = 15;   // chunks either side of a golem that are simulated (448 x 416 cells: past the edge of any screen)
  World.MIN_PIECE = 48;   // a loose piece of dirt smaller than this (about 8 x 6) crumbles
  return { World, makeRng, ST, STATE, SOLID, CONDUCT };
})();
