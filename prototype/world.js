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

      // Countdown materials (steam, fire, magma). 255 means permanent (pools the cave starts with).
      if (LIFE1[m] && this.life[i] !== 255) {
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
      if (!this.seenAt) this.seenAt = new Uint16Array(mat.length);
      if (++this.seenStamp >= 65535 || !this.seenStamp) { this.seenAt.fill(0); this.seenStamp = 1; }
      const seenAt = this.seenAt, st = this.seenStamp;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (!breakable(mat[i]) || seenAt[i] === st) continue;
        const piece = [i], q = [i];
        seenAt[i] = st;
        while (q.length && piece.length < MIN) {
          const j = q.pop();
          for (const k of [j - 1, j + 1, j - w, j + w]) {
            if (seenAt[k] !== st && breakable(mat[k])) { seenAt[k] = st; piece.push(k); q.push(k); }
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
    // A web of caves spreading in every direction from a hub: chambers joined
    // by winding tunnels (every chamber reachable, plus extra links for loops
    // and forks), unbreakable rock masses that shape the routes, three regions
    // with their own pools, dirt plugs to dig through, mana wells, and homes
    // for the crawlers. Everything comes from the seed.
    generate() {
      const { w, h } = this, mat = this.mat, s = this.seed % 997, C = KData.cave;
      const R = makeRng(this.seed ^ 0x9e3779b9);
      const BIOMES = KData.biomes;

      // 1. dirt everywhere, with large rock masses
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = noise(x, y, 95, s + 1) * 0.65 + noise(x, y, 24, s + 2) * 0.35;
        mat[y * w + x] = n > 0.66 ? M.ROCK : M.DIRT;
      }

      // 2. chambers: the hub in the middle, the rest spread around it
      const hub = { x: w >> 1, y: h >> 1, rx: 84, ry: 42, hub: true };
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

      // 9. pools in chambers (water in the Drowned Galleries, magma in the Ember Veins)
      for (const n of nodes) {
        const B = BIOMES[n.biome];
        if (!B.pool || R() < 0.25) continue;
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
      for (let i = 0; i < mat.length; i++) this.shade[i] = (R() * 255) | 0;
      this.cleanup(0, 0, w, h, M.EMPTY); // no crumbs in the starting cave
      this.awake.fill(3);
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
      this.crawlerHomes = [];
      for (const n of nodes) {
        if (n.hub) continue;
        const level = this.levelAt(n.x, n.y);
        const count = Math.min(4, 1 + Math.floor(n.dist / 420) + (R() < 0.5 ? 1 : 0));
        for (let k = 0; k < count; k++) {
          const sp = spotIn(n, 8, 10);
          if (sp && this.get(sp.x, sp.y - 2) === M.EMPTY) this.crawlerHomes.push({ x: sp.x, y: sp.y, level });
        }
      }
      const far = nodes.filter(n => !n.hub && n.dist > 220);
      for (let i = far.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [far[i], far[j]] = [far[j], far[i]]; }
      this.wells = far.map(n => spotIn(n, 12, 14)).filter(Boolean).slice(0, C.wells);
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
    levelAt(x, y) { return 1 + Math.floor(Math.hypot(x - this.hub.x, y - this.hub.y) / KData.cave.levelEvery); }
    // kept for tests: the first floor below the first open cell from the top
    surfaceAt(x) {
      let y = 6;
      while (y < this.h - 6 && this.mat[y * this.w + x] !== M.EMPTY) y++;
      return this.floorBelow(x, y);
    }
  }

  World.MIN_PIECE = 10;
  return { World, makeRng, ST, STATE, SOLID, CONDUCT };
})();
