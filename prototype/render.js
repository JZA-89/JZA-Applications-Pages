'use strict';
/* Cast in Stone prototype — render.js
   Draws the game. The world, actors and effects are plotted pixel by pixel
   into a 320x180 image (one pixel per world cell), which the page scales up
   with crisp edges. A second, smooth canvas on top carries the glow from
   fire, magma, lightning and the golem's element slots. Drawing never changes
   the game. */

const KRender = (() => {
  const { M, materials, elements, view: V } = KData;

  // The player is a rock golem; its look (one of four) comes from KData.golems.
  const STONE = { h: [214, 206, 192], m: [150, 143, 138], d: [96, 90, 94], s: [52, 44, 54], k: [20, 16, 24], g: [122, 172, 150], e: [255, 236, 196] };
  // per golem: width, the pixels that can chip off, and where the slots sit (for the glow)
  const SKINS = KData.golems.map(g => {
    const W = g.rows[0].length, body = [], L = [], R = [];
    g.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === 'h' || ch === 'm' || ch === 'd') body.push(y * W + x);
      if (ch === 'L') L.push([x, y]); if (ch === 'R') R.push([x, y]);
    }));
    const mid = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    return { ...g, W, H: g.rows.length, body, L: mid(L), R: mid(R), big: L.length > 4 };
  });
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
  // Shale crawler, facing right; legs alternate between two frames.
  const CRAWLER = [
    '....kkkkkk.....',
    '..kkhhhhhhkk...',
    '.khhmmsmmsmhkk.',
    'khmmmsmmmsmmhek',
    'kmmmmsmmmsmmmek',
    'kddddsdddsddddk',
    '.kdddddddddddk.',
  ];
  const CRAWLER_LEGS = ['.d.d..d.d..d.d.', '..d.d..d.d..d.d'];
  const SHALE = { k: [14, 10, 20], h: [154, 144, 174], m: [108, 100, 128], d: [72, 64, 88], s: [50, 42, 62], e: [255, 70, 160] };
  // the other enemies, facing right (frames for animation where there are two)
  const ENEMY_ART = {"moth": [[".www.....www.", "wwwww...wwwww", "wwwwwkbkwwwww", ".wwwkbbbekww.", "..wwkbbbkww..", ".....kbk....."], [".............", ".....kbk.....", "..wwkbbbekw..", ".wwwkbbbkwww.", "wwwwwkbkwwwww", ".www.....www."]], "delver": [["....kkkkk....", "..kkmmmmmkk..", ".kmmhhhhhmmk.", "kmmhmmmmmhmek", "kmmmmmmmmmmtk", ".kmmmmmmmmmk.", "..kddddddk...", "...kk.kk....."]], "spitter": [["...kkkkk...", "..kmmmmmk..", ".kmhhmmmmk.", "kmhmmmmoook", "kmmmmmmooo.", "kmmmmmmoook", "kmmmmmmmmk.", ".kmmdmmmk..", "..kddddk...", "...kkkk...."]], "warden": [["......kkkkk......", ".....kmmmmmk.....", ".....kmememk.....", "..kkkkmmmmmkkkk..", ".kpppkkkkkkkpppk.", "kpppkmmmmmmmkpppk", "kmmkmmmmmmmmmkmmk", "kmmkmmmssmmmmkmmk", "kmmkmmmmmmmmmkmmk", "kffkmmmmmmmmmkffk", "kffkkmmmmmmmkkffk", ".kk..kmmmmmk..kk.", ".....kmmkmmk.....", ".....kmmkmmk.....", "....kddk.kddk....", "....kkkk.kkkk...."]]};
  const ENEMY_COL = {
    moth: { w: [222, 196, 244], k: [40, 30, 50], b: [124, 104, 146], e: [255, 70, 160] },
    delver: { k: [24, 16, 20], m: [122, 98, 92], h: [154, 126, 112], d: [84, 66, 64], t: [240, 230, 210], e: [255, 70, 160] },
    spitter: { k: [24, 14, 18], m: [92, 62, 60], h: [134, 92, 82], d: [60, 40, 42], o: [255, 140, 50] },
    warden: { k: [16, 14, 22], m: [112, 120, 142], p: [156, 162, 184], s: [72, 76, 94], f: [128, 134, 154], d: [72, 76, 94], e: [255, 70, 160] },
  };
  const SACK = { k: [44, 36, 56], s: [138, 128, 160], x: [206, 198, 226], p: [96, 70, 74] };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
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
  // Dirt is layered: bands of dusky rose, plum and sand that follow a gentle
  // wave, blended into each other with an ordered dot pattern.
  // Rock is faceted slate.
  const SLATE0 = [34, 40, 64], SLATE1 = [66, 76, 110], SLATE_EDGE = [22, 24, 40];

  // a 3x5 pixel font for damage numbers (each row is 3 bits)
  const DIGITS = { 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 7, 1, 7], 4: [5, 5, 7, 1, 1], 5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7] };
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

    // Colours for the background, dirt and rock depend on where a cell is (and
    // which region it is in). They are worked out one 32x32 chunk at a time when
    // the chunk is first on screen, and the most recent few hundred are kept.
    setWorld(world) {
      this.world = world;
      this.cc = new Map();
    }

    chunkColours(ckx, cky) {
      const k = cky * 4096 + ckx;
      let c = this.cc.get(k);
      if (c) return c;
      const world = this.world, BI = KData.biomes, h = world.h;
      c = { bg: new Uint32Array(1024), dirt: new Uint32Array(1024), rock: new Uint32Array(1024) };
      for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
        const x = ckx * 32 + lx, y = cky * 32 + ly, i = ly * 32 + lx, b4 = BAYER[(y & 3) * 4 + (x & 3)];
        // region, with a dithered border so regions blend instead of meeting in squares
        const B = BI[world.biomeAt(x + (hash(x, y, 41) - 0.5) * 18, y + (hash(x, y, 42) - 0.5) * 18)];
        // back wall: the region's tint, darker far rock shapes, faint spores
        const t = y / h;
        let r = B.bg[0] - 6 * t, g = B.bg[1] - 4 * t, bl = B.bg[2] - 8 * t;
        const far = noise(x, y * 1.6, 30, 21) * 0.7 + noise(x, y, 9, 22) * 0.3;
        if (far > 0.6 || (far > 0.52 && b4 < (far - 0.52) / 0.08)) { r -= 9; g -= 7; bl -= 11; }
        if (hash(x, y, 31) < 0.0018) { r += 40; g += 34; bl += 60; }
        c.bg[i] = pack(clamp(r), clamp(g), clamp(bl));
        // dirt: layered bands of the region's colours
        const v = (y + 11 * noise(x, 0, 46, 3) + 4 * noise(x, y, 13, 4)) / 6.5;
        let band = Math.floor(v);
        if (v - band > 0.68 && (v - band - 0.68) / 0.32 > b4) band++;
        const S = B.strata;
        let dc = S[((band % S.length) + S.length) % S.length];
        if (noise(x, y, 5, 6) > 0.62 && b4 < 0.5) dc = dc.map(q => q * 0.88);
        c.dirt[i] = pack(dc[0] | 0, dc[1] | 0, dc[2] | 0);
        // rock: faceted slate
        const f = noise(x, y, 7, 9) * 0.7 + noise(x, y, 3, 10) * 0.3, q = f * 4, lv = Math.floor(q) / 3;
        let rc = SLATE0.map((s0, kk) => s0 + (SLATE1[kk] - s0) * Math.min(1, lv));
        if (Math.abs(q - Math.round(q)) < 0.045) rc = SLATE_EDGE;
        c.rock[i] = pack(rc[0] | 0, rc[1] | 0, rc[2] | 0);
      }
      this.cc.set(k, c);
      if (this.cc.size > 320) this.cc.delete(this.cc.keys().next().value);
      return c;
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
      this.drawLodestones(game, game.time);
      for (const d of game.dummies) this.drawDummy(d);
      for (const e of game.enemies) if (!e.asleep && !e.dead) { if (e.kind === 'crawler') this.drawCrawler(e, game.time); else this.drawEnemy(e, game.time); }
      if (game.boss && !game.boss.dead) this.drawBoss(game.boss, game);
      for (const pl of game.players) this.drawGolem(pl, game.time, opt.reduced);
      this.drawCaches(game);
      this.drawTablets(game);
      this.drawLoot(game);
      this.drawProjectiles(game);
      this.drawParticles(game);
      this.drawFx(game);
      if (opt.mark) {
        // where an aimed special spell will land: a gold dotted ring its size
        const m = opt.mark, mx = m.x - this.cam.x, my = m.y - this.cam.y - (m.feet ? 8 : 0), n = Math.max(10, Math.round(m.r * 2.2));
        for (let i = 0; i < n; i++) { const an = i / n * Math.PI * 2 + game.time * 1.5; this.plot(mx + Math.cos(an) * m.r, my + Math.sin(an) * m.r, 255, 211, 122, 0.9); }
        this.plot(mx, my, 255, 240, 200, 0.9);
      }
      if (opt.reticle && !p.dead) this.drawReticle(opt.reticle);
      this.ctx.putImageData(this.img, 0, 0);
      this.drawGlow(game);
    }

    drawCells(world, time) {
      const { w, mat, shade, life, charge } = world, buf = this.buf, pal = this.pal;
      const heat = this.heat, spark = this.spark, gw = this.gw;
      heat.fill(0); spark.fill(0);
      const fire = materials[M.FIRE].colors, magma = materials[M.MAGMA].colors;
      const pulse = time * 3;
      const lit = c => pack(clamp((c & 255) * 1.25 + 14), clamp(((c >> 8) & 255) * 1.2 + 12), clamp(((c >> 16) & 255) * 1.15 + 12));
      const dark = c => pack(clamp((c & 255) * 0.55), clamp(((c >> 8) & 255) * 0.5), clamp(((c >> 16) & 255) * 0.6));
      const open = q => q === M.EMPTY || q === M.STEAM || q === M.FIRE;
      // mark what is on screen as explored (for the map)
      for (let cy = this.cam.y >> 5; cy <= (this.cam.y + V.h - 1) >> 5; cy++) for (let cx = this.cam.x >> 5; cx <= (this.cam.x + V.w - 1) >> 5; cx++) world.explored[cy * world.cw + cx] = 1;
      for (let vy = 0; vy < V.h; vy++) {
        const wy = vy + this.cam.y, row = wy * w, grow = (vy >> 3) * gw, cky = wy >> 5, ly = (wy & 31) * 32;
        for (let vx = 0; vx < V.w;) {
          const ckx = (vx + this.cam.x) >> 5, C = this.chunkColours(ckx, cky);
          const end = Math.min(V.w, (ckx + 1) * 32 - this.cam.x);
          for (; vx < end; vx++) {
            const wx = vx + this.cam.x, i = row + wx, m = mat[i], o = vy * V.w + vx, li = ly + (wx & 31);
            if (m === M.EMPTY) { buf[o] = C.bg[li]; continue; }
            const bgc = C.bg[li], bR = bgc & 255, bG = (bgc >> 8) & 255, bB = (bgc >> 16) & 255;
            if (m === M.WATER) {
              const top = mat[i - w] === M.EMPTY || mat[i - w] === M.STEAM;
              let r = top ? 130 : 44, g = top ? 176 : 84 + (shade[i] & 7), b = top ? 255 : 196;
              if (charge[i]) {
                const f = Math.min(1, charge[i] / 60) * (0.35 + Math.random() * 0.65);
                r += (235 - r) * f; g += (245 - g) * f; b += (255 - b) * f;
                spark[grow + (vx >> 3)] += 0.5;
              }
              buf[o] = pack(clamp(bR + (r - bR) * 0.8), clamp(bG + (g - bG) * 0.8), clamp(bB + (b - bB) * 0.8));
              continue;
            }
            if (m === M.STEAM) {
              const a = 0.16 + 0.42 * Math.min(1, life[i] / 120), c = materials[M.STEAM].colors[shade[i] % 3];
              buf[o] = pack(clamp(bR + (c[0] - bR) * a), clamp(bG + (c[1] - bG) * a), clamp(bB + (c[2] - bB) * a));
              continue;
            }
            if (m === M.FIRE) {
              const l = life[i] + ((shade[i] + time * 60) % 7) - 3;
              const c = fire[l > 24 ? 0 : l > 16 ? 1 : l > 8 ? 2 : 3];
              buf[o] = pack(c[0], c[1], c[2]);
              heat[grow + (vx >> 3)] += 1;
              continue;
            }
            if (m === M.CRYSTAL) {
              const cc = materials[M.CRYSTAL].colors[shade[i] & 3], tw = ((shade[i] * 7 + (time * 4 | 0)) % 23) === 0 ? 1.25 : 1;
              buf[o] = pack(clamp(cc[0] * tw), clamp(cc[1] * tw), clamp(cc[2] * tw));
              spark[grow + (vx >> 3)] += 0.15;
              continue;
            }
            if (m === M.MAGMA) {
              const c = magma[shade[i] & 3], f = 0.82 + 0.18 * Math.sin(pulse + shade[i] * 0.1);
              buf[o] = pack(clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f));
              heat[grow + (vx >> 3)] += 0.25;
              continue;
            }
            const above = mat[i - w], st = KWorld.STATE[m];
            let e = 0;
            if (st === 1 || st === 2) {
              if (open(above) || above === M.WATER) e = 1;
              else if (st === 1 && (open(mat[i + w]) || open(mat[i - 1]) || open(mat[i + 1]))) e = 2;
            }
            if (m === M.DIRT || m === M.ROCK) {
              const base = m === M.DIRT ? C.dirt[li] : C.rock[li];
              buf[o] = e === 1 ? lit(base) : e === 2 ? dark(base) : base;
            } else { const v = pal[m]; buf[o] = v[shade[i] % v.length][e]; }
          }
        }
      }
    }

    // Lodestones: a standing stone with a rune; the rune glows lilac once found.
    drawLodestones(game, time) {
      const S = ['..kkk..', '.kmmmk.', 'kmmhmmk', 'kmhrhmk', 'kmmrmmk', 'kmrrrmk', 'kmmrmmk', 'kmrmrmk', 'kmmmmmk', 'kmmmmdk', 'kmmmmdk', 'kmmmmdk', 'sssssss', 'ddddddd'];
      const col = { k: [24, 20, 36], m: [70, 78, 108], h: [96, 106, 140], d: [50, 56, 80], s: [150, 143, 138], dd: [96, 90, 94] };
      for (const l of game.world.lodestones) {
        const ox = Math.round(l.x - this.cam.x) - 3, oy = Math.round(l.y - this.cam.y) - S.length;
        if (ox < -8 || oy < -16 || ox > V.w || oy > V.h) continue;
        const lit = game.found.has(l.id), pulse = 0.8 + 0.2 * Math.sin(time * 2.5 + l.x);
        for (let y = 0; y < S.length; y++) for (let x = 0; x < 7; x++) {
          const ch = S[y][x]; if (ch === '.') continue;
          let c = ch === 'r' ? (lit ? [201 * pulse, 182 * pulse, 255 * pulse] : [44, 40, 60]) : (y >= 12 && ch === 'd' ? col.dd : col[ch]);
          this.plot(ox + x, oy + y, clamp(c[0]), clamp(c[1]), clamp(c[2]));
        }
      }
    }

    // One golem, top-left at (ox, oy). Also used for the picker previews.
    plotGolem(skin, ox, oy, flip, slots, opts = {}) {
      const S = SKINS[skin], e0 = slots[0] && elements[slots[0]].color, e1 = slots[1] && elements[slots[1]].color;
      const mix = e0 && e1 ? e0.map((v, i) => (v + e1[i]) / 2) : null;
      // opts.pose: { body, legL, legR, armL, armR, lean } in pixels (see golemPose). The feet are
      // the bottom three rows, split down the middle; the arms are the outer columns of the lower half.
      const P = opts.pose, legs = S.H - 3, half = S.W / 2;
      const off = (y, x) => y >= legs ? (x < half ? P.legL : P.legR) : P.body + (y >= S.H * 0.45 && (x <= 4 || x >= S.W - 5) ? (x <= 4 ? P.armL : P.armR) : 0);
      for (let y = 0; y < S.H; y++) {
        const row = S.rows[y];
        for (let x = 0; x < S.W; x++) {
          const ch = row[x];
          if (ch === '.') continue;
          if (opts.chipped && opts.chipped.has(y * S.W + x)) continue;
          let col;
          if (ch === 'L') col = e0 || S.empty;
          else if (ch === 'R') col = e1 || S.empty;
          else if (ch === 'c') col = mix || STONE.s;
          else col = STONE[ch];
          if (opts.flashSlots && (ch === 'L' || ch === 'R')) col = opts.flashSlots;
          if (opts.flash) col = [255, 246, 236];
          const sx = ox + (flip ? S.W - 1 - x : x);
          if (!P) { this.plot(sx, oy + y, col[0], col[1], col[2]); continue; }
          // the pose moves whole parts by a pixel; a part pulled away from the one above it is filled in
          const o = off(y, x), dx = y < S.H * 0.4 ? P.lean : 0;
          this.plot(sx + dx, oy + y + o, col[0], col[1], col[2]);
          if (y + 1 < S.H && off(y + 1, x) > o && row !== undefined && S.rows[y + 1][x] !== '.') this.plot(sx + dx, oy + y + o + 1, col[0], col[1], col[2]);
        }
      }
    }

    // How the golem stands this frame: a walk cycle, breathing when still,
    // stretched going up and tucked coming down, a squash on landing, a lean
    // into a run or dash and back from a cast, braced while lifting.
    golemPose(p, time) {
      const P = { body: 0, legL: 0, legR: 0, armL: 0, armR: 0, lean: 0 };
      if (!this._pose) this._pose = new WeakMap();
      const st = this._pose.get(p) || { g: true, land: -9 };
      if (p.grounded && !st.g) st.land = time;
      st.g = p.grounded; this._pose.set(p, st);
      const prevT = st.t; st.t = time;
      const speed = Math.abs(p.vx);
      if (p.dashT > 0) { P.lean = Math.sign(p.dashVX || p.facing) * 2; P.legL = -1; P.armL = P.armR = -1; }
      else if (p.channels.lift) { P.legL = P.legR = 1; P.armL = P.armR = 1; P.body = Math.sin(time * 30) > 0 ? 0 : -1; }
      else if (!p.grounded) {
        if (p.vy < -30) { P.legL = P.legR = 1; P.armL = P.armR = -1; }          // going up: stretched, arms raised
        else if (p.vy > 60) { P.legL = P.legR = -1; P.armL = P.armR = -1; }     // coming down: feet tucked
      } else if (time - st.land < 0.12) { P.body = 1; P.armL = P.armR = 1; }    // just landed: a squash
      else if (speed > 10) {
        // four beats to a stride, faster the faster it runs
        st.walk = (st.walk || 0) + speed * 0.13 * Math.min(0.05, Math.max(0, time - (prevT || time)));
        const ph = Math.floor(st.walk) & 3;
        if (ph === 0) { P.legL = -1; P.armR = -1; } else if (ph === 2) { P.legR = -1; P.armL = -1; } else P.body = -1;
        if (speed > 45) P.lean = Math.sign(p.vx);
      } else {
        // breathing: the chest rises, and the arms follow a moment later
        if (Math.sin(time * 2.4 + p.id) > 0.5) P.body = -1;
        if (Math.sin(time * 2.4 + p.id - 0.7) > 0.5) P.armL = P.armR = -1;
      }
      // a cast throws the upper body back from the aim
      if (p.lock > 0.05 && !P.lean) P.lean = -Math.sign(Math.cos(p.aim));
      return P;
    }

    drawGolem(p, time, reduced) {
      if (p.dead) return;
      const S = SKINS[p.skin] || SKINS[0];
      const ox = Math.round(p.x - this.cam.x) - (S.W >> 1), oy = Math.round(p.y - this.cam.y) - S.H;
      const hurt = 1 - p.hp / p.maxHp, chipped = new Set();
      const n = Math.floor(hurt * S.body.length * 0.3);
      for (let k = 0, c = 0; k < p.chips.length && c < n; k++) {
        const idx = Math.floor(p.chips[k] / p.chips.length * S.body.length);
        if (!chipped.has(S.body[idx])) { chipped.add(S.body[idx]); c++; }
      }
      let flashSlots = null;
      if (p.slotFlash > 0) flashSlots = p.slots[0] && p.slots[1] ? [255, 255, 255] : [255, 120, 90];
      this.plotGolem(p.skin, ox, oy, p.facing < 0, p.slots, { chipped, flash: p.flash > 0, flashSlots, pose: reduced ? null : this.golemPose(p, time) });
    }

    // The Emberwyrm: a chain of basalt plates with glowing cracks, and a head
    // with jaws. Under the magma it shows faintly.
    drawBoss(b, game) {
      const w = game.world, cx = this.cam.x, cy = this.cam.y;
      const disc = (x, y, r, col, a, crack) => {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const edge = dx * dx + dy * dy > (r - 1.2) ** 2;
          let c = edge ? [40, 14, 12] : dy < -r * 0.35 ? col.map(v => v * 1.25) : dy > r * 0.4 ? col.map(v => v * 0.75) : col;
          if (crack && !edge && (dx + dy * 2 + 40) % 5 === 0) c = [255, 170, 80];
          if (b.flash > 0) c = [255, 246, 236];
          this.plot(x + dx - cx, y + dy - cy, clamp(c[0]), clamp(c[1]), clamp(c[2]), a);
        }
      };
      // under the magma it shows as a dark shape moving beneath the surface
      const under = (x, y) => w.get(Math.round(x), Math.round(y)) === M.MAGMA ? 0.8 : 1;
      const body = b.stranded ? [176, 104, 84] : [150, 74, 58];
      for (let i = 76; i >= 4; i -= 4) {
        const s = b.trail[i]; if (!s) continue;
        const r = Math.max(3, Math.round(7 - i / 16));
        const sub = under(s.x, s.y) < 1;
        disc(Math.round(s.x), Math.round(s.y), r, sub ? [58, 24, 20] : body, under(s.x, s.y), !sub);
      }
      // head
      const hx = Math.round(b.x), hy = Math.round(b.y - 6), f = b.facing, a = under(hx, hy), sub = a < 1;
      disc(hx, hy, 8, sub ? [58, 24, 20] : [168, 84, 64], a, false);
      const jaw = b.state === 'breach' || b.state === 'spit' ? 2 : 0;
      for (let k = 0; k < 7; k++) { this.plot(hx + f * (6 + k) - cx, hy - 2 - jaw - cy, 70, 30, 26, a); this.plot(hx + f * (6 + k) - cx, hy + 2 + jaw - cy, 70, 30, 26, a); }
      for (let k = 1; k < 7; k += 2) { this.plot(hx + f * (6 + k) - cx, hy - 1 - jaw - cy, 240, 230, 210, a); this.plot(hx + f * (6 + k) - cx, hy + 1 + jaw - cy, 240, 230, 210, a); }
      for (const ex of [3, 4]) this.plot(hx + f * ex - cx, hy - 4 - cy, 255, 230, 120, 1);
      // where it will breach: the bubbling spot
      if (b.state === 'bubble' && b.target) for (let k = 0; k < 5; k++) this.plot(b.target.x + (Math.random() - 0.5) * 16 - cx, b.target.y - 1 - Math.random() * 4 - cy, 255, 240, 190, 0.95);
    }

    drawEnemy(e, time) {
      const frames = ENEMY_ART[e.kind], C = ENEMY_COL[e.kind];
      const rows = frames.length > 1 ? frames[Math.floor(time * (e.state === 'swoop' ? 18 : 8) + e.id) & 1] : frames[0];
      const W = rows[0].length, H = rows.length, flip = (e.kind === 'spitter' ? e.face : e.facing) < 0;
      const S = e.champion ? 2 : 1;   // champions are drawn at twice the size
      const lift = e.kind === 'warden' && e.state === 'windup' ? 1 : 0;
      const ox = Math.round(e.x - this.cam.x) - ((W * S) >> 1), oy = Math.round(e.y - this.cam.y) - H * S - lift;
      const warn = (e.state === 'windup' || (e.kind === 'spitter' && e.charging)) ? 0.5 + 0.5 * Math.sin((e.t || time) * 40) : 0;
      const muddy = e.slowT > 0 || e.inMud;
      const a = e.ghost ? 0.45 : 1; // a delver inside the ground shows faintly
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        let col = C[ch];
        if (ch === 'e') col = e.elite || e.champion ? [255, 200, 90] : warn ? [255, 170 + 85 * warn, 230] : col;
        if ((ch === 'o' || ch === 'w') && warn) col = col.map(v => Math.min(255, v + 60 * warn));
        if (ch === 'p' && warn) col = col.map(v => Math.min(255, v + 70 * warn));
        if (muddy && ch !== 'e' && ch !== 'k') col = [col[0] * 0.55 + 96 * 0.45, col[1] * 0.55 + 84 * 0.45, col[2] * 0.55 + 104 * 0.45];
        if (e.flash > 0) col = [255, 246, 236];
        if (S === 1) this.plot(ox + (flip ? W - 1 - x : x), oy + y, col[0] | 0, col[1] | 0, col[2] | 0, a);
        else for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) this.plot(ox + (flip ? W - 1 - x : x) * S + sx, oy + y * S + sy, col[0] | 0, col[1] | 0, col[2] | 0, a);
      }
      if (e.wetT > 0 && Math.random() < 0.3) this.plot(ox + Math.random() * W * S, oy + H * S, 120, 170, 255, 0.8);
      if (e.hp < e.maxHp && !e.champion) {
        const n = Math.ceil(13 * e.hp / e.maxHp), bx = ox + (W >> 1) - 6;
        for (let x = 0; x < 13; x++) this.plot(bx + x, oy - 3, ...(x < n ? (e.elite ? [255, 200, 90] : [255, 110, 180]) : [52, 46, 58]));
      }
    }

    drawCrawler(e, time) {
      if (e.dead) return;
      const flip = e.facing < 0, W = 15;
      const rear = e.state === 'windup' ? 2 : 0;           // rears up before a lunge
      const ox = Math.round(e.x - this.cam.x) - 7, oy = Math.round(e.y - this.cam.y) - 8 - rear;
      const moving = Math.abs(e.vx) > 5 && e.grounded;
      const legs = CRAWLER_LEGS[moving ? (Math.floor(time * 10) & 1) : 0];
      const rows = CRAWLER.concat([legs]);
      const warn = e.state === 'windup' ? 0.5 + 0.5 * Math.sin(e.t * 40) : 0;
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < W; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        let col = SHALE[ch];
        if (ch === 'e' && warn) col = [255, 170 + 85 * warn, 230];
        if (ch === 'e' && e.elite) col = [255, 200, 90];
        if ((e.slowT > 0 || e.inMud) && ch !== 'e' && ch !== 'k') col = [col[0] * 0.55 + 96 * 0.45, col[1] * 0.55 + 84 * 0.45, col[2] * 0.55 + 104 * 0.45]; // coated in mud
        if (e.flash > 0 || e.state === 'stagger' && e.t < 0.08) col = [255, 246, 236];
        this.plot(ox + (flip ? W - 1 - x : x), oy + y + (y === rows.length - 1 ? rear : 0), col[0], col[1], col[2]);
      }
      if (e.hp < e.maxHp) {
        const n = Math.ceil(13 * e.hp / e.maxHp);
        for (let x = 0; x < 13; x++) this.plot(ox + 1 + x, oy - 3, ...(x < n ? [255, 110, 180] : [52, 46, 58]));
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

    // relic caches: a stone casket with a gold band; open ones lose their lid
    // Rune tablets: a standing slab; its runes glow until you have read it.
    drawTablets(game) {
      const T = ['.kkkkk.', 'kmmmmmk', 'kmrmrmk', 'kmmrmmk', 'kmrmrmk', 'kmmmmmk', 'kmrrrmk', 'kmmmmmk', 'kdmmmdk', 'kdddddk', 'kkkkkkk'];
      for (const t of game.tablets) {
        const ox = Math.round(t.x - this.cam.x) - 3, oy = Math.round(t.y - this.cam.y) - 11;
        if (ox < -10 || oy < -12 || ox > V.w || oy > V.h) continue;
        const read = game.read.has(t.id), pulse = 0.75 + 0.25 * Math.sin(game.time * 3 + t.x);
        for (let y = 0; y < 11; y++) for (let x = 0; x < 7; x++) {
          const ch = T[y][x]; if (ch === '.') continue;
          const c = ch === 'k' ? [26, 22, 32] : ch === 'd' ? [70, 66, 84] : ch === 'm' ? [112, 108, 130] : read ? [84, 96, 110] : [150 * pulse, 240 * pulse, 230 * pulse];
          this.plot(ox + x, oy + y, c[0] | 0, c[1] | 0, c[2] | 0);
        }
      }
    }

    drawCaches(game) {
      const S = ['.kkkkkkk.', 'kgggggggk', 'kmmmymmmk', 'kssssssks', 'kmmmmmmmk', 'kdddddddk'];
      const O = ['.........', '.........', 'kk.....kk', 'kssssssks', 'kmmmmmmmk', 'kdddddddk'];
      const col = { k: [30, 24, 34], g: [255, 211, 122], y: [255, 245, 210], m: [110, 104, 120], s: [200, 160, 90], d: [70, 64, 80] };
      for (const c of game.world.caches) {
        const ox = Math.round(c.x - this.cam.x) - 4, oy = Math.round(c.y - this.cam.y) - 6;
        if (ox < -10 || oy < -8 || ox > V.w || oy > V.h) continue;
        const open = game.opened.has(c.id), rows = open ? O : S;
        // buried caches are hidden by the ground in front of them; only the glow shows
        for (let y = 0; y < 6; y++) for (let x = 0; x < 9; x++) {
          const ch = rows[y][x]; if (ch === '.') continue;
          const wx = c.x - 4 + x, wy = c.y - 6 + y, m = game.world.get(wx, wy);
          if (KWorld.SOLID[m] && m !== KData.M.EARTH) continue;
          const k = open ? col[ch].map(v => v * 0.6) : col[ch];
          this.plot(ox + x, oy + y, k[0] | 0, k[1] | 0, k[2] | 0);
        }
      }
      // shards flying to the player
      for (const b of game.bits) this.plot(b.x - this.cam.x, b.y - this.cam.y, 170, 250, 240);
    }

    // runestones lying in the cave: a small stone in its grade's colour
    drawLoot(game) {
      const tiers = KData.runes.tiers;
      for (const L of game.loot) {
        const x = Math.round(L.x - this.cam.x), y = Math.round(L.y - this.cam.y + Math.sin(game.time * 3 + L.x) * 0.6) - 2;
        const c = tiers[L.rune.tier].color;
        for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) this.plot(x + dx, y + dy, ...(dy === -2 || (dx === 0 && dy === 0) ? [255, 255, 255] : c));
      }
    }

    // Projectiles are drawn bigger the longer the recipe (sp.vis), with a
    // fleck of the strongest modifier's colour circling them (sp.tint).
    drawProjectiles(game) {
      const TINT = { fire: [255, 190, 90], water: [110, 170, 255], earth: [150, 110, 96], lightning: [255, 250, 190] };
      for (const pr of game.projectiles) {
        const x = pr.x - this.cam.x, y = pr.y - this.cam.y, sp = Math.hypot(pr.vx, pr.vy) || 1;
        const ux = pr.vx / sp, uy = pr.vy / sp, v = (pr.sp.vis || 1) * (pr.mini ? 0.6 : 1);
        const disc = (r, col) => { const R = Math.ceil(r); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const d = Math.hypot(dx, dy); if (d <= r + 0.3) { const c = col(d / (r + 0.3), dx, dy); this.plot(x + dx, y + dy, c[0], c[1], c[2]); } } };
        if (pr.kind === 'fireball') {
          const r = 1.1 * v, n = Math.round(3 + 2 * v);
          for (let k = 1; k <= n; k++) this.plot(x - ux * k * 1.5, y - uy * k * 1.5, 255, 140 - k * (72 / n), 40, 0.9 - k * (0.72 / n));
          disc(r, t => t < 0.45 ? [255, 245, 200] : [255, 170 - t * 40, 70]);
        } else if (pr.kind === 'blob') {
          disc(1.3 * v, t => t < 0.4 ? [255, 190, 90] : [255, 120, 40]);
        } else if (pr.kind === 'boulder') {
          disc(1.5 * v, (t, dx, dy) => dx + dy < 0 ? [196, 186, 176] : [130, 120, 118]);
        } else if (pr.kind === 'spear') {
          const len = 5 * v;
          this.line(x - ux * len, y - uy * len, x, y, [150, 156, 170]);
          if (v > 1.4) this.line(x - ux * len - uy, y - uy * len + ux, x - uy, y + ux, [120, 126, 140]);
          this.plot(x, y, 255, 252, 230); this.plot(x + ux, y + uy, 230, 232, 240);
        }
        const tc = TINT[pr.sp.tint];
        if (tc) for (let k = 0; k < 2; k++) { const an = game.time * 14 + k * Math.PI, rr = 1.6 * v + 1.2; this.plot(x + Math.cos(an) * rr, y + Math.sin(an) * rr, tc[0], tc[1], tc[2]); }
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
        } else if (f.kind === 'num') {
          // rises and fades
          const s = String(f.val), y = Math.round(f.y - this.cam.y - k * 10), x0 = Math.round(f.x - this.cam.x - s.length * 2);
          for (let i = 0; i < s.length; i++) {
            const g = DIGITS[s[i]];
            for (let r2 = 0; r2 < 5; r2++) for (let c = 0; c < 3; c++) if (g[r2] >> (2 - c) & 1) {
              this.plot(x0 + i * 4 + c + 1, y + r2 + 1, 20, 14, 24, Math.min(1, a * 1.6) * 0.8);
              this.plot(x0 + i * 4 + c, y + r2, f.color[0], f.color[1], f.color[2], Math.min(1, a * 1.6));
            }
          }
        } else if (f.kind === 'beam') {
          // thicker for a longer recipe
          const half = Math.max(0, Math.round(((f.wide || 1) - 1) * 1.6));
          for (let o = -half; o <= half + 1; o++) this.line(f.x0 - this.cam.x, f.y0 - this.cam.y + o, f.x1 - this.cam.x, f.y1 - this.cam.y + o, o === 0 ? [255, 240, 200] : f.color, o === 0 ? Math.min(1, a * 1.5) : a * 0.8);
        } else if (f.kind === 'bolt' || f.kind === 'trail') {
          const core = f.kind === 'bolt' ? [255, 255, 245] : f.color;
          for (let i = 1; i < f.pts.length; i++) {
            const p0 = f.pts[i - 1], p1 = f.pts[i];
            this.line(p0.x - this.cam.x, p0.y - this.cam.y, p1.x - this.cam.x, p1.y - this.cam.y, core, f.kind === 'bolt' ? Math.min(1, a * 1.6) : a * 0.7);
            if (f.wide > 1.25) this.line(p0.x - this.cam.x, p0.y - this.cam.y + 1, p1.x - this.cam.x, p1.y - this.cam.y + 1, f.color, a);
            if (f.wide > 1.8) this.line(p0.x - this.cam.x + 1, p0.y - this.cam.y - 1, p1.x - this.cam.x + 1, p1.y - this.cam.y - 1, f.color, a * 0.8);
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
        // a few burning cells glow strongly; a whole lake of magma only warmly (it would wash out to white)
        if (h > 0) this.light(wx, wy, 10 + Math.min(10, h * 0.3), [255, 120, 50], 0.1 + Math.min(0.28, h / 60));
        if (s > 0) this.light(wx, wy, 9 + Math.min(10, s * 0.3), [140, 190, 255], 0.1 + Math.min(0.4, s / 50));
      }
      for (const L of game.loot) this.light(L.x, L.y - 2, 9, KData.runes.tiers[L.rune.tier].color, 0.55);
      for (const c of game.world.caches) if (!game.opened.has(c.id)) this.light(c.x, c.y - 4, 16, [255, 200, 110], 0.38 + 0.12 * Math.sin(game.time * 2 + c.id));
      for (let k = 0; k < game.bits.length; k += 3) this.light(game.bits[k].x, game.bits[k].y, 5, [140, 240, 230], 0.5);
      for (const pr of game.projectiles) {
        const v = Math.min(2.6, pr.sp.vis || 1);
        if (pr.kind === 'fireball') this.light(pr.x, pr.y, 12 + 6 * v, [255, 150, 60], 0.85);
        else if (pr.kind === 'blob') this.light(pr.x, pr.y, 8 + 5 * v, [255, 120, 40], 0.7);
        else if (pr.kind === 'spear') this.light(pr.x, pr.y, 6, [220, 225, 240], 0.5);
      }
      for (const f of game.fx) {
        const a = 1 - f.t / f.T;
        if (f.kind === 'flash') this.light(f.x, f.y, f.r, f.color, a);
        else if (f.kind === 'bolt') for (let i = 0; i < f.pts.length; i += 2) this.light(f.pts[i].x, f.pts[i].y, 8 + 4 * Math.min(2.6, f.wide || 1), [255, 246, 190], a * 0.7);
        else if (f.kind === 'trail') for (let i = 0; i < f.pts.length; i += 3) this.light(f.pts[i].x, f.pts[i].y, 7, f.color, a * 0.35);
        else if (f.kind === 'beam') for (let k = 0; k <= 6; k++) this.light(f.x0 + (f.x1 - f.x0) * k / 6, f.y0 + (f.y1 - f.y0) * k / 6, 9, f.color, a * 0.6);
      }
      for (const t of game.tablets) if (!game.read.has(t.id)) this.light(t.x, t.y - 6, 14, [150, 240, 230], 0.4 + 0.1 * Math.sin(game.time * 3 + t.x));
      for (const l of game.world.lodestones) if (game.found.has(l.id)) this.light(l.x, l.y - 8, 18, [201, 182, 255], 0.5 + 0.12 * Math.sin(game.time * 2.5 + l.x));
      if (game.boss && !game.boss.dead) {
        const b = game.boss;
        this.light(b.x, b.y - 6, 22, [255, 140, 50], 0.55);
        for (let i = 12; i < 72; i += 12) if (b.trail[i]) this.light(b.trail[i].x, b.trail[i].y, 12, [255, 120, 40], 0.3);
        if (b.state === 'bubble' && b.target) this.light(b.target.x, b.target.y, 26, [255, 210, 120], 0.75);
      }
      for (const e of game.enemies) {
        if (e.dead || e.asleep) continue;
        const col = e.elite ? [255, 200, 90] : e.kind === 'spitter' ? [255, 140, 50] : e.kind === 'moth' ? [222, 196, 244] : [255, 70, 160];
        const hot = e.state === 'windup' || (e.kind === 'spitter' && e.charging) || e.state === 'swoop';
        const ex = e.x + (e.kind === 'spitter' ? e.face : e.facing) * (e.w / 2 - 1), ey = e.y - e.h * 0.6;
        this.light(ex, ey, hot ? 14 : e.kind === 'moth' ? 10 : 6, col, (hot ? 0.75 : 0.35) * (e.ghost ? 0.4 : 1));
        if (e.elite) this.light(e.x, e.y - e.h / 2, 16, [255, 200, 90], 0.25);
      }
      for (const p of game.players) {
        if (p.dead) continue;
        const S = SKINS[p.skin] || SKINS[0], flip = p.facing < 0;
        const at = pt => ({ x: p.x - (S.W >> 1) + (flip ? S.W - 1 - pt[0] : pt[0]) + 0.5, y: p.y - S.H + pt[1] + 0.5 });
        p.slots.forEach((el, i) => {
          if (!el) return;
          const q = at(i ? S.R : S.L);
          this.light(q.x, q.y, S.big ? 11 : 7, elements[el].color, S.big ? 0.6 : 0.5);
        });
      }
    }
  }

  // Draw a golem on its own small canvas (for the picker).
  function preview(canvas, skin, slots) {
    const S = SKINS[skin], pad = 2;
    canvas.width = S.W + pad * 2; canvas.height = 22;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(canvas.width, canvas.height);
    const fake = { buf: new Uint32Array(img.data.buffer), plot(x, y, r, g, b) {
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
      this.buf[y * canvas.width + x] = pack(r, g, b);
    } };
    Renderer.prototype.plotGolem.call(fake, skin, pad, canvas.height - S.H, false, slots);
    ctx.putImageData(img, 0, 0);
  }

  return { Renderer, preview, SKINS };
})();
