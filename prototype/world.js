'use strict';
/* Cast in Stone prototype — world.js
   The falling-sand world: a grid of cells, one material per cell, updated every
   fixed step. The grid is split into 32x32 chunks. Only chunks where something
   changed recently ("awake") are simulated, and every changed chunk is flagged
   "dirty" so that, later, a host can send only the changed chunks to the other
   player. All randomness comes from a seeded generator, so the same seed and
   the same actions give the same world. */

const KWorld = (() => {
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
  for (const r of reactions) {
    REACT[r.a * N + r.b] = { chance: r.chance, ra: r.ra, rb: r.rb };
    REACT[r.b * N + r.a] = { chance: r.chance, ra: r.rb, rb: r.ra };
    REACTIVE[r.a] = 1; REACTIVE[r.b] = 1;
  }

  // Deterministic smooth noise for the map shape.
  function hash(i, j, s) {
    const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  }
  function noise(x, y, scale, s) {
    x /= scale; y /= scale;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  class World {
    constructor(seed) {
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
    step() {
      this.tick = (this.tick + 1) & 255;
      if (this.tick === 0) this.tick = 1;
      const nowAwake = this.awake.slice();
      for (let k = 0; k < this.awake.length; k++) if (this.awake[k]) this.awake[k]--;
      const { w, h, cs, cw } = this;
      for (let y = h - 1; y >= 0; y--) {
        const cy = y >> this.shift, ltr = ((y + this.tick) & 1) === 0;
        for (let c = 0; c < cw; c++) {
          const cx = ltr ? c : cw - 1 - c;
          if (!nowAwake[cy * cw + cx]) continue;
          const x0 = cx * cs, x1 = Math.min(w, x0 + cs);
          if (ltr) { for (let x = x0; x < x1; x++) this.cell(x, y); }
          else { for (let x = x1 - 1; x >= x0; x--) this.cell(x, y); }
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
            return;
          }
        }
      }

      const st = STATE[m];
      if (st === ST.static) return;

      // Countdown materials (steam, fire, magma).
      if (LIFE1[m]) {
        if (st === ST.liquid ? R() < 0.5 : true) {
          if (this.life[i] > 0) this.life[i]--;
          if (this.life[i] === 0) {
            if (st === ST.gas) this.put(i, R() < materials[m].condense ? M.WATER : M.EMPTY);
            else if (COOL[m]) this.put(i, COOL[m]);
            else this.put(i, M.EMPTY);
            return;
          }
        }
        this.wakeAt(x, y);
      }

      if (MOVE[m] < 1 && R() > MOVE[m]) { this.wakeAt(x, y); return; }

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
        // Spread sideways as far as the flow allows.
        for (const dx of [d, -d]) {
          let far = 0;
          for (let k = 1; k <= FLOW[m]; k++) {
            const nx = x + dx * k;
            if (nx < 0 || nx >= w) break;
            const t = mat[i + dx * k];
            if (t !== M.EMPTY && !(STATE[t] === ST.gas || STATE[t] === ST.fire)) break;
            far = k;
            if (y + 1 < this.h && mat[i + dx * k + w] === M.EMPTY) break; // found a drop
          }
          if (far) { this.swap(i, i + dx * far); return; }
        }
        return;
      }

      if (st === ST.gas) {
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
            if (m === M.EMPTY || HARD[m]) continue;
            if (m === M.WATER) { if (R() < (opts.boil || 0)) this.put(i, M.STEAM); continue; }
            const edge = d2 > (r - 2) * (r - 2);
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
      const seen = new Set();
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (!breakable(mat[i]) || seen.has(i)) continue;
        const piece = [i], q = [i];
        seen.add(i);
        while (q.length && piece.length < MIN) {
          const j = q.pop();
          for (const k of [j - 1, j + 1, j - w, j + w]) {
            if (!seen.has(k) && breakable(mat[k])) { seen.add(k); piece.push(k); q.push(k); }
          }
        }
        if (piece.length < MIN && !q.length) for (const k of piece) this.put(k, into);
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          if (!breakable(mat[i])) continue;
          const n = SOLID[mat[i - 1]] + SOLID[mat[i + 1]] + SOLID[mat[i - w]] + SOLID[mat[i + w]];
          if (n <= 1) this.put(i, into);
        }
      }
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

    // Chunks changed since the last call (for sending to another player later).
    takeDirty() {
      const list = [];
      for (let k = 0; k < this.dirty.length; k++) if (this.dirty[k]) { list.push(k); this.dirty[k] = 0; }
      return list;
    }

    // ----- the map -----
    // One hand-shaped cave: rock frame, dirt to dig, ledges, a rock outcrop,
    // a pool on the right, moss to burn.
    generate() {
      const { w, h } = this, mat = this.mat, s = this.seed % 997;
      const R = makeRng(this.seed ^ 0x9e3779b9);
      const floorY = x => 148 + 8 * Math.sin(x / 41) + 5 * Math.sin(x / 17 + 2);
      const ceilY = x => 42 + 10 * Math.sin(x / 57 + 1) + 5 * Math.sin(x / 19);
      const poolA = 372, poolB = 452;
      const poolFloor = x => (x > poolA && x < poolB) ? floorY(x) + 24 * Math.sin(Math.PI * (x - poolA) / (poolB - poolA)) : floorY(x);

      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const n = (noise(x, y, 9, s) - 0.5) * 7;
        const top = ceilY(x) + n, bot = poolFloor(x) + n * 0.6;
        mat[i] = (y > top && y < bot) ? M.EMPTY : M.DIRT;
        // rock lining under the pool so the water stays
        if (x > poolA - 4 && x < poolB + 4 && y >= bot && y < bot + 5 && y > floorY(x) - 2) mat[i] = M.ROCK;
      }
      // rock outcrop in the middle
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        // a jagged rock spur rising from the floor
        const sx = (x - 262) / (11 - Math.max(0, floorY(262) - y) * 0.22), sy = y - (floorY(262) - 28);
        if (sy > 0 && Math.abs(sx) + (noise(x, y, 4, s + 5) - 0.5) * 0.7 < 1) mat[y * w + x] = M.ROCK;
        // a few rock lumps in the ceiling and deep floor
        const lumps = [[120, ceilY(120) - 6, 12, 7], [330, ceilY(330) - 4, 14, 8], [200, 176, 18, 6], [60, 172, 10, 8]];
        for (const [lx, ly, rx, ry] of lumps) {
          const ex = (x - lx) / rx, ey = (y - ly) / ry;
          if (ex * ex + ey * ey + (noise(x, y, 5, s + 3) - 0.5) * 0.6 < 1) mat[y * w + x] = M.ROCK;
        }
      }
      // floating dirt ledges
      const ledges = [[188, 106, 24, 4], [308, 96, 17, 4], [104, 104, 13, 3]];
      for (const [lx, ly, rx, ry] of ledges) {
        for (let y = ly - ry - 2; y <= ly + ry + 2; y++) for (let x = lx - rx - 3; x <= lx + rx + 3; x++) {
          const ex = (x - lx) / rx, ey = (y - ly) / ry;
          if (ex * ex + ey * ey + (noise(x, y, 4, s + 7) - 0.5) * 0.5 < 1) mat[y * w + x] = M.DIRT;
        }
      }
      // rock frame
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = noise(x, y, 6, s + 11) * 4;
        if (x < 4 + n || x > w - 5 - n || y < 4 + n || y > h - 5 - n) mat[y * w + x] = M.ROCK;
      }
      // water in the pool, up to just under the lower rim
      const surface = Math.ceil(Math.max(floorY(poolA), floorY(poolB))) + 2;
      for (let x = poolA; x <= poolB; x++) for (let y = surface; y < h; y++) {
        const i = y * w + x;
        if (mat[i] !== M.EMPTY) break;
        mat[i] = M.WATER;
      }
      // moss on floors and hanging from ceilings
      for (let x = 5; x < w - 5; x++) {
        for (let y = 6; y < h - 6; y++) {
          const i = y * w + x;
          if (mat[i] !== M.DIRT) continue;
          if (mat[i - w] === M.EMPTY && R() < 0.55) { mat[i] = M.MOSS; if (R() < 0.4 && mat[i + w] === M.DIRT) mat[i + w] = M.MOSS; }
          else if (mat[i + w] === M.EMPTY && R() < 0.3) {
            const len = 1 + ((R() * 4) | 0);
            for (let k = 1; k <= len && mat[i + k * w] === M.EMPTY; k++) mat[i + k * w] = M.MOSS;
          }
        }
      }
      for (let i = 0; i < mat.length; i++) this.shade[i] = (R() * 255) | 0;
      this.cleanup(0, 0, w, h, M.EMPTY); // no crumbs in the starting cave either
      this.awake.fill(3);
      this.dirty.fill(1);

      // first floor below the first open cell from the top
      const surfaceAt = x => {
        let y = 6;
        while (y < h - 6 && mat[y * w + x] !== M.EMPTY) y++;
        while (y < h - 6 && mat[y * w + x] === M.EMPTY) y++;
        return y;
      };
      this.spawn = { x: 40, y: surfaceAt(40) };
      this.dummySpots = [140, 188, 318, 486].map(x => ({ x, y: surfaceAt(x) }));
      this.surfaceAt = surfaceAt;
    }
  }

  World.MIN_PIECE = 10;
  return { World, makeRng, ST, STATE, SOLID, CONDUCT };
})();
