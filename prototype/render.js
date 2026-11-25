'use strict';
/* KILN prototype — render.js
   Draws the game. The world, actors and effects are plotted pixel by pixel
   into a 320x180 image (one pixel per world cell), which the page scales up
   with crisp edges. A second, smooth canvas on top carries the glow from
   fire, magma, lightning and the character's kiln. Drawing never changes
   the game. */

const KRender = (() => {
  const { M, materials, elements, view: V } = KData;

  // The character: a small bottle kiln, facing right, 11 x 15.
  // k soot outline, o glazed body, d body shade, a door arch,
  // L / M / R the furnace door (left slot, mix, right slot). Eyes are drawn on top.
  const KILN = [
    '...kkkkk...',
    '....kod....',
    '....kod....',
    '...koodk...',
    '..koooodk..',
    '.koooooodk.',
    'koooooooodk',
    'koooooooodk',
    'koooaaaoodk',
    'kooaLMRaodk',
    'kooaLMRaodk',
    'kooaLMRaodk',
    '.kdddddddk.',
    '.kok...kok.',
    '.kkk...kkk.',
  ];
  const KW = 11, KH = KILN.length;
  const DUMMY = [
    '.kkkkk.',
    'ksssssk',
    'ksxsxsk',
    'kssxssk',
    'ksxsxsk',
    'ksssssk',
    'ksssssk',
    '.kkkkk.',
    '...p...',
    '...p...',
    '...p...',
    '..ppp..',
    '.ppppp.',
  ];
  const CLAY = { o: [240, 228, 206], d: [198, 178, 160], k: [44, 28, 36], a: [86, 44, 40], e: [40, 22, 30], door: [58, 26, 24] };
  const SACK = { k: [44, 36, 56], s: [138, 128, 160], x: [206, 198, 226], p: [96, 70, 74] };
  // body pixels that can chip off, in a fixed shuffled order
  const kilnBody = [];
  KILN.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'o' || ch === 'd') kilnBody.push(y * KW + x); }));
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  function hash(i, j, s) { const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }
  function noise(x, y, scale, s) {
    x /= scale; y /= scale;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // Dirt is layered: bands of dusky rose, plum and sand that follow a gentle
  // wave, blended into each other with an ordered dot pattern.
  const STRATA = [[124, 76, 92], [142, 92, 96], [104, 64, 90], [160, 114, 104], [92, 58, 84], [132, 84, 100]];
  // Rock is faceted slate.
  const SLATE0 = [34, 40, 64], SLATE1 = [66, 76, 110], SLATE_EDGE = [22, 24, 40];

  const pack = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;

  class Renderer {
    constructor(base, glow) {
      base.width = V.w; base.height = V.h;
      this.base = base; this.ctx = base.getContext('2d');
      this.img = this.ctx.createImageData(V.w, V.h);
      this.buf = new Uint32Array(this.img.data.buffer);
      this.glow = glow; this.gctx = glow.getContext('2d');
      this.sprites = new Map();
      this.cam = { x: 0, y: 0 };
      this.gw = Math.ceil(V.w / 8); this.gh = Math.ceil(V.h / 8);
      this.heat = new Float32Array(this.gw * this.gh);
      this.spark = new Float32Array(this.gw * this.gh);
      // palettes: [variant][edge] edge 0 normal, 1 lit top, 2 shaded bottom
      this.pal = materials.map(m => (m.colors || [[0, 0, 0]]).map(c => [
        pack(c[0], c[1], c[2]),
        pack(clamp(c[0] * 1.22 + 8), clamp(c[1] * 1.22 + 8), clamp(c[2] * 1.2 + 8)),
        pack(clamp(c[0] * 0.72), clamp(c[1] * 0.72), clamp(c[2] * 0.75)),
      ]));
    }

    setWorld(world) {
      // cave back wall: deep violet, darker far rock shapes, faint spores
      const { w, h } = world, n = w * h;
      this.bgR = new Uint8Array(n); this.bgG = new Uint8Array(n); this.bgB = new Uint8Array(n);
      this.bg = new Uint32Array(n);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, t = y / h;
        let r = 30 - 14 * t, g = 22 - 10 * t, b = 46 - 20 * t;
        const far = noise(x, y * 1.6, 30, 21) * 0.7 + noise(x, y, 9, 22) * 0.3;
        if (far > 0.6) { r -= 9; g -= 7; b -= 11; }
        else if (far > 0.52 && BAYER[(y & 3) * 4 + (x & 3)] < (far - 0.52) / 0.08) { r -= 9; g -= 7; b -= 11; }
        if (hash(x, y, 31) < 0.0018) { r += 40; g += 34; b += 60; }
        this.bgR[i] = r; this.bgG[i] = g; this.bgB[i] = b;
        this.bg[i] = pack(r | 0, g | 0, b | 0);
      }
      // dirt and rock colours depend on where the cell is, so the layers stay put
      const tone = (c, k) => [pack(c[0], c[1], c[2]),
        pack(clamp(c[0] * 1.25 + 14), clamp(c[1] * 1.2 + 12), clamp(c[2] * 1.15 + 12)),
        pack(clamp(c[0] * 0.55), clamp(c[1] * 0.5), clamp(c[2] * 0.6))];
      this.dirtC = [new Uint32Array(n), new Uint32Array(n), new Uint32Array(n)];
      this.rockC = [new Uint32Array(n), new Uint32Array(n), new Uint32Array(n)];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, b4 = BAYER[(y & 3) * 4 + (x & 3)];
        const v = (y + 11 * noise(x, 0, 46, 3) + 4 * noise(x, y, 13, 4)) / 6.5;
        let band = Math.floor(v);
        if (v - band > 0.68 && (v - band - 0.68) / 0.32 > b4) band++;
        let c = STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length];
        if (noise(x, y, 5, 6) > 0.62 && b4 < 0.5) c = c.map(q => q * 0.88);
        let t = tone(c);
        this.dirtC[0][i] = t[0]; this.dirtC[1][i] = t[1]; this.dirtC[2][i] = t[2];
        const f = noise(x, y, 7, 9) * 0.7 + noise(x, y, 3, 10) * 0.3, q = f * 4, lv = Math.floor(q) / 3;
        let rc = SLATE0.map((s, k) => s + (SLATE1[k] - s) * Math.min(1, lv));
        if (Math.abs(q - Math.round(q)) < 0.045) rc = SLATE_EDGE;
        t = tone(rc);
        this.rockC[0][i] = t[0]; this.rockC[1][i] = t[1]; this.rockC[2][i] = t[2];
      }
      this.world = world;
    }

    resize(cssW, cssH) {
      const k = Math.min(1, 640 / cssW); // glow is soft, half resolution is plenty
      this.glow.width = Math.max(1, Math.round(cssW * k)); this.glow.height = Math.max(1, Math.round(cssH * k));
      this.gs = this.glow.width / V.w;
    }

    // ---------- helpers ----------
    plot(x, y, r, g, b, a = 1) {
      x = x | 0; y = y | 0;
      if (x < 0 || y < 0 || x >= V.w || y >= V.h) return;
      const i = y * V.w + x;
      if (a >= 1) { this.buf[i] = pack(r, g, b); return; }
      const c = this.buf[i], cr = c & 255, cg = (c >> 8) & 255, cb = (c >> 16) & 255;
      this.buf[i] = pack(clamp(cr + (r - cr) * a), clamp(cg + (g - cg) * a), clamp(cb + (b - cb) * a));
    }
    line(x0, y0, x1, y1, col, a = 1) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy, n = 0;
      while (n++ < 600) {
        this.plot(x0, y0, col[0], col[1], col[2], a);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    sprite(col) {
      const key = col.join(',');
      let s = this.sprites.get(key);
      if (!s) {
        s = document.createElement('canvas'); s.width = s.height = 64;
        const c = s.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, `rgba(${col},1)`); g.addColorStop(0.35, `rgba(${col},.45)`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
        this.sprites.set(key, s);
      }
      return s;
    }
    light(x, y, r, col, a) {
      if (a <= 0.01) return;
      const g = this.gctx, s = this.gs, sx = (x - this.cam.x) * s, sy = (y - this.cam.y) * s, sr = r * s;
      if (sx < -sr || sy < -sr || sx > this.glow.width + sr || sy > this.glow.height + sr) return;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(this.sprite(col), sx - sr, sy - sr, sr * 2, sr * 2);
    }

    worldToClient(x, y) {
      const r = this.base.getBoundingClientRect();
      return { x: r.left + (x - this.cam.x + 0.5) * r.width / V.w, y: r.top + (y - this.cam.y + 0.5) * r.height / V.h };
    }
    clientToWorld(cx, cy) {
      const r = this.base.getBoundingClientRect();
      return { x: (cx - r.left) / r.width * V.w + this.cam.x, y: (cy - r.top) / r.height * V.h + this.cam.y };
    }

    // ---------- frame ----------
    draw(game, opt) {
      const world = game.world;
      if (world !== this.world) this.setWorld(world);
      const p = game.players[0];
      let cx = Math.round(p.x - V.w / 2), cy = Math.round(p.y - 8 - V.h / 2);
      if (game.shake > 0 && !opt.reduced) { cx += Math.round((Math.random() - 0.5) * game.shake); cy += Math.round((Math.random() - 0.5) * game.shake); }
      cx = Math.max(0, Math.min(world.w - V.w, cx)); cy = Math.max(0, Math.min(world.h - V.h, cy));
      this.cam.x = cx; this.cam.y = cy;

      this.drawCells(world, game.time);
      for (const d of game.dummies) this.drawDummy(d);
      this.drawSmoke(game, opt.dt || 0);
      for (const pl of game.players) this.drawKiln(pl);
      this.drawProjectiles(game);
      this.drawParticles(game);
      this.drawFx(game);
      if (opt.reticle && !p.dead) this.drawReticle(opt.reticle);
      this.ctx.putImageData(this.img, 0, 0);
      this.drawGlow(game);
    }

    drawCells(world, time) {
      const { w, mat, shade, life, charge } = world, buf = this.buf, pal = this.pal;
      const bg = this.bg, bgR = this.bgR, bgG = this.bgG, bgB = this.bgB;
      const heat = this.heat, spark = this.spark, gw = this.gw;
      heat.fill(0); spark.fill(0);
      const fire = materials[M.FIRE].colors, magma = materials[M.MAGMA].colors;
      const pulse = time * 3;
      for (let vy = 0; vy < V.h; vy++) {
        const wy = vy + this.cam.y, row = wy * w, grow = (vy >> 3) * gw;
        for (let vx = 0; vx < V.w; vx++) {
          const i = row + vx + this.cam.x, m = mat[i], o = vy * V.w + vx;
          if (m === M.EMPTY) { buf[o] = bg[i]; continue; }
          if (m === M.WATER) {
            const top = mat[i - w] === M.EMPTY || mat[i - w] === M.STEAM;
            let r = top ? 130 : 44, g = top ? 176 : 84 + (shade[i] & 7), b = top ? 255 : 196;
            if (charge[i]) {
              const f = Math.min(1, charge[i] / 60) * (0.35 + Math.random() * 0.65);
              r += (235 - r) * f; g += (245 - g) * f; b += (255 - b) * f;
              spark[grow + (vx >> 3)] += 0.5;
            }
            const a = 0.8;
            buf[o] = pack(clamp(bgR[i] + (r - bgR[i]) * a), clamp(bgG[i] + (g - bgG[i]) * a), clamp(bgB[i] + (b - bgB[i]) * a));
            continue;
          }
          if (m === M.STEAM) {
            const a = 0.16 + 0.42 * Math.min(1, life[i] / 120), c = materials[M.STEAM].colors[shade[i] % 3];
            buf[o] = pack(clamp(bgR[i] + (c[0] - bgR[i]) * a), clamp(bgG[i] + (c[1] - bgG[i]) * a), clamp(bgB[i] + (c[2] - bgB[i]) * a));
            continue;
          }
          if (m === M.FIRE) {
            const l = life[i] + ((shade[i] + time * 60) % 7) - 3;
            const c = fire[l > 24 ? 0 : l > 16 ? 1 : l > 8 ? 2 : 3];
            buf[o] = pack(c[0], c[1], c[2]);
            heat[grow + (vx >> 3)] += 1;
            continue;
          }
          if (m === M.MAGMA) {
            const c = magma[shade[i] & 3], f = 0.82 + 0.18 * Math.sin(pulse + shade[i] * 0.1);
            buf[o] = pack(clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f));
            heat[grow + (vx >> 3)] += 0.8;
            continue;
          }
          const above = mat[i - w], st = KWorld.STATE[m];
          const open = q => q === M.EMPTY || q === M.STEAM || q === M.FIRE;
          let e = 0;
          if (st === 1 || st === 2) {
            if (open(above) || above === M.WATER) e = 1;
            else if (st === 1 && (open(mat[i + w]) || open(mat[i - 1]) || open(mat[i + 1]))) e = 2;
          }
          if (m === M.DIRT) buf[o] = this.dirtC[e][i];
          else if (m === M.ROCK) buf[o] = this.rockC[e][i];
          else { const v = pal[m]; buf[o] = v[shade[i] % v.length][e]; }
        }
      }
    }

    drawKiln(p) {
      if (p.dead) return;
      const ox = Math.round(p.x - this.cam.x) - 5, oy = Math.round(p.y - this.cam.y) - KH;
      const flip = p.facing < 0;
      const hurt = 1 - p.hp / p.maxHp;
      const chipped = new Set();
      const nChip = Math.floor(hurt * kilnBody.length * 0.45);
      for (let k = 0, n = 0; k < p.chips.length && n < nChip; k++) if (p.chips[k] < kilnBody.length) { chipped.add(kilnBody[p.chips[k]]); n++; }
      const e0 = p.slots[0] && elements[p.slots[0]].color, e1 = p.slots[1] && elements[p.slots[1]].color;
      const mix = e0 && e1 ? e0.map((v, i) => (v + e1[i]) / 2) : (e0 || e1 || CLAY.door);
      // eyes look towards the aim
      const ax = Math.cos(p.aim), ay = Math.sin(p.aim);
      const eyeRow = 6 + (ay > 0.6 ? 1 : 0), eyeShift = Math.abs(ax) > 0.35 ? 1 : 0;
      for (let y = 0; y < KH; y++) {
        const row = KILN[y];
        for (let x = 0; x < KW; x++) {
          const ch = row[x];
          if (ch === '.') continue;
          if (chipped.has(y * KW + x)) continue;
          const sx = flip ? KW - 1 - x : x;
          let col = CLAY[ch];
          if (ch === 'L' || ch === 'M' || ch === 'R') {
            // the door: the left half shows the first element, the right half the second
            const side = sx < 5 ? 0 : sx > 5 ? 1 : 2;
            col = side === 2 ? mix : (side === 0 ? e0 : e1) || CLAY.door;
            if (p.slotFlash > 0) col = (e0 && e1) ? [255, 255, 255] : [255, 120, 90];
            if (y === 9 && side !== 2) col = col.map(v => v * 0.8);
          } else if (y === eyeRow && (x === 3 + eyeShift || x === 6 + eyeShift)) col = CLAY.e;
          if (p.flash > 0) col = [255, 246, 236];
          this.plot(ox + sx, oy + y, col[0], col[1], col[2]);
        }
      }
    }

    // Smoke from the chimney, tinted by what is loaded. Drawing only.
    drawSmoke(game, dt) {
      if (!this.smoke) this.smoke = [];
      for (const p of game.players) {
        if (p.dead || dt <= 0) continue;
        p._smokeT = (p._smokeT || 0) - dt;
        if (p._smokeT <= 0) {
          p._smokeT = 0.12 + Math.random() * 0.1;
          const e0 = p.slots[0] && elements[p.slots[0]].color, e1 = p.slots[1] && elements[p.slots[1]].color;
          const base = e0 && e1 ? e0.map((v, i) => (v + e1[i]) / 2) : (e0 || e1);
          const col = base ? base.map(v => v * 0.75 + 150 * 0.25) : [128, 118, 140];
          this.smoke.push({ x: p.x + (p.facing < 0 ? -0.5 : 0.5), y: p.y - KH - 0.5, vx: (Math.random() - 0.5) * 4 - p.vx * 0.05, vy: -10 - Math.random() * 6, t: 0, T: 1 + Math.random() * 0.6, col });
        }
      }
      for (const s of this.smoke) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx += (Math.random() - 0.5) * 20 * dt; }
      this.smoke = this.smoke.filter(s => s.t < s.T);
      for (const s of this.smoke) {
        const a = 0.55 * (1 - s.t / s.T), x = s.x - this.cam.x, y = s.y - this.cam.y;
        this.plot(x, y, s.col[0], s.col[1], s.col[2], a);
        if (s.t > 0.35) this.plot(x + 1, y, s.col[0], s.col[1], s.col[2], a * 0.6);
      }
    }

    drawDummy(d) {
      if (d.dead) return;
      const ox = Math.round(d.x - this.cam.x) - 3, oy = Math.round(d.y - this.cam.y) - DUMMY.length;
      for (let y = 0; y < DUMMY.length; y++) for (let x = 0; x < 7; x++) {
        const ch = DUMMY[y][x];
        if (ch === '.') continue;
        const col = d.flash > 0 ? [255, 246, 236] : SACK[ch];
        this.plot(ox + x, oy + y, col[0], col[1], col[2]);
      }
      if (d.hp < d.maxHp) {
        const n = Math.ceil(9 * d.hp / d.maxHp);
        for (let x = 0; x < 9; x++) this.plot(ox - 1 + x, oy - 3, ...(x < n ? [230, 218, 198] : [52, 46, 58]));
      }
    }

    drawProjectiles(game) {
      for (const pr of game.projectiles) {
        const x = pr.x - this.cam.x, y = pr.y - this.cam.y, sp = Math.hypot(pr.vx, pr.vy) || 1;
        const ux = pr.vx / sp, uy = pr.vy / sp;
        if (pr.kind === 'fireball') {
          for (let k = 1; k <= 4; k++) this.plot(x - ux * k * 1.5, y - uy * k * 1.5, 255, 140 - k * 18, 40, 0.9 - k * 0.18);
          for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) this.plot(x + dx, y + dy, 255, dx || dy ? 170 : 245, dx || dy ? 70 : 200);
        } else if (pr.kind === 'blob') {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.plot(x + dx, y + dy, 255, dx || dy ? 120 : 190, dx || dy ? 40 : 90);
        } else if (pr.kind === 'spear') {
          this.line(x - ux * 5, y - uy * 5, x, y, [150, 156, 170]);
          this.plot(x, y, 255, 252, 230); this.plot(x + ux, y + uy, 230, 232, 240);
        }
      }
    }

    drawParticles(game) {
      for (const pt of game.parts) {
        const x = pt.x - this.cam.x, y = pt.y - this.cam.y;
        if (pt.mat < 0) { const c = pt.color; this.plot(x, y, c[0], c[1], c[2], Math.min(1, pt.life * 3)); continue; }
        const c = pt.mat === M.WATER ? [90, 160, 240] : materials[pt.mat].colors[0];
        this.plot(x, y, c[0], c[1], c[2]);
      }
    }

    drawFx(game) {
      for (const f of game.fx) {
        const k = f.t / f.T, a = 1 - k;
        if (f.kind === 'ring') {
          const r = f.r0 + (f.r1 - f.r0) * Math.sqrt(k), n = Math.max(12, Math.round(r * 6));
          for (let i = 0; i < n; i++) {
            const an = i / n * Math.PI * 2;
            this.plot(f.x - this.cam.x + Math.cos(an) * r, f.y - this.cam.y + Math.sin(an) * r, f.color[0], f.color[1], f.color[2], a * 0.8);
          }
        } else if (f.kind === 'bolt' || f.kind === 'trail') {
          const core = f.kind === 'bolt' ? [255, 255, 245] : f.color;
          for (let i = 1; i < f.pts.length; i++) {
            const p0 = f.pts[i - 1], p1 = f.pts[i];
            this.line(p0.x - this.cam.x, p0.y - this.cam.y, p1.x - this.cam.x, p1.y - this.cam.y, core, f.kind === 'bolt' ? Math.min(1, a * 1.6) : a * 0.7);
          }
        }
      }
    }

    drawReticle(r) {
      const x = Math.round(r.x - this.cam.x), y = Math.round(r.y - this.cam.y);
      for (const [dx, dy] of [[2, 0], [3, 0], [-2, 0], [-3, 0], [0, 2], [0, 3], [0, -2], [0, -3]]) this.plot(x + dx, y + dy, 240, 232, 220, 0.85);
    }

    drawGlow(game) {
      const g = this.gctx;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, this.glow.width, this.glow.height);
      g.globalCompositeOperation = 'lighter';
      const gw = this.gw;
      for (let gy = 0; gy < this.gh; gy++) for (let gx = 0; gx < gw; gx++) {
        const h = this.heat[gy * gw + gx], s = this.spark[gy * gw + gx];
        const wx = this.cam.x + gx * 8 + 4, wy = this.cam.y + gy * 8 + 4;
        if (h > 0) this.light(wx, wy, 10 + Math.min(14, h * 0.35), [255, 120, 50], 0.12 + Math.min(0.4, h / 70));
        if (s > 0) this.light(wx, wy, 9 + Math.min(10, s * 0.3), [140, 190, 255], 0.1 + Math.min(0.4, s / 50));
      }
      for (const pr of game.projectiles) {
        if (pr.kind === 'fireball') this.light(pr.x, pr.y, 16, [255, 150, 60], 0.85);
        else if (pr.kind === 'blob') this.light(pr.x, pr.y, 12, [255, 120, 40], 0.7);
        else if (pr.kind === 'spear') this.light(pr.x, pr.y, 6, [220, 225, 240], 0.5);
      }
      for (const f of game.fx) {
        const a = 1 - f.t / f.T;
        if (f.kind === 'flash') this.light(f.x, f.y, f.r, f.color, a);
        else if (f.kind === 'bolt') for (let i = 0; i < f.pts.length; i += 2) this.light(f.pts[i].x, f.pts[i].y, 11, [255, 246, 190], a * 0.7);
        else if (f.kind === 'trail') for (let i = 0; i < f.pts.length; i += 3) this.light(f.pts[i].x, f.pts[i].y, 7, f.color, a * 0.35);
      }
      for (const p of game.players) {
        if (p.dead) continue;
        const cy = p.y - 4.5, f = p.facing;
        p.slots.forEach((el, i) => { if (el) this.light(p.x + (i ? 1 : -1) * f, cy, 8, elements[el].color, 0.55); });
        this.light(p.x + f, p.y - 8.5, 4, [255, 236, 200], 0.22);
      }
    }
  }

  return { Renderer };
})();
