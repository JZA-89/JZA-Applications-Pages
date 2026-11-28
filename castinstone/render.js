'use strict';
/* Cast in Stone — render.js
   Draws the game. The world, actors and effects are plotted pixel by pixel
   into an image one pixel per world cell (432 x 243 on a 16:9 computer screen),
   lit cell by cell (lightFrame), which the page scales up with crisp edges. A second, smooth canvas on top carries the glow from
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

  // the four kinds added in v0.40 (see KData.remix)
  Object.assign(ENEMY_ART, {
    slinger: [[
      "....kkk....",
      "...kmhmk.pp",
      "...kemek.pp",
      "...kmmmk.k.",
      "..kkmmmkkk.",
      ".kmhmmmmk..",
      ".kmmmmmdk..",
      ".kmmmmmdk..",
      "..kmmmdk...",
      "..kdkkdk...",
      "..kdk.kdk..",
      ".kkk..kkk..",
    ]],
    wisp: [[
      "....o....",
      "..o.w.o..",
      "...www...",
      ".owwewwo.",
      "owwekeww.",
      ".owwewwo.",
      "...www...",
      "..o.w.o..",
      "....o....",
    ], [
      ".........",
      "...owo...",
      "..owwwo..",
      ".owwewwo.",
      ".wwekeww.",
      ".owwewwo.",
      "..owwwo..",
      "...owo...",
      ".........",
    ]],
    frog: [[
      "...kk...kk...",
      "..kehk.kehk..",
      ".kmmmmkmmmmk.",
      "kmhmmmmmmmhmk",
      "kmmmmmmmmmmmk",
      "kddmmmmmmmddk",
      "kdkkddddkkkdk",
      "kk..kkkk...kk",
    ]],
    imp: [[
      ".k.....k.",
      ".kk...kk.",
      ".kmkkkmk.",
      ".kemmmek.",
      ".kmmommk.",
      "kkmooomkk",
      "kmkooomkm",
      ".kmmommk.",
      ".kdk.kdk.",
      ".kk...kk.",
    ]],
  });
  // the second cave's creatures, and its king (drawn at twice the size)
  Object.assign(ENEMY_ART, {
    shade: [[
      "...kkk...", "..kdddk..", "..kedek..", "..kdddk..", ".kkdmdkk.", "kdkmmmkdk", "kdkmmmkdk", ".k.kmk.k.", "...kmk...", "..kmkmk..", "..kd.dk..", "..kd.dk..", ".kk...kk.",
    ]],
    urchin: [[
      "p....p....p", ".p..kkk..p.", "..kkmhmkk..", "pkmhmmmhmkp", ".kmmmemmmk.", "pkmmmmmmmkp", "..kkmmmkk..", ".p..kkk..p.", "p....p....p",
    ]],
    wraith: [[
      "...kkkkk...", "..kwwwwwk..", ".kwwwwwwwk.", ".kwekwkewk.", ".kwwwwwwwk.", ".kwwkkkwwk.", ".kwwwwwwwk.", "..kwwwwwk..", "..kw.kw.k..", ".kw..kw..k.", ".k...k.....",
    ], [
      "...kkkkk...", "..kwwwwwk..", ".kwwwwwwwk.", ".kwekwkewk.", ".kwwwwwwwk.", ".kwwkkkwwk.", ".kwwwwwwwk.", "..kwwwwwk..", ".kw.kw..k..", "..k..kw..k.", ".....k...k.",
    ]],
    geode: [[
      "....kkkkk..", "..kkmmmmhk.", ".kmmmhhmmhk", "kmmhooohmmk", "kmhooooohmk", "kmhooooohmk", "kmmhooohmmk", ".kmmmhhmmk.", "..kkmmmmk..", "....kkkk...", "...........",
    ]],
    hollowking: [[
      "...g...g.g...g...", "...g..ggggg..g...", "...ggggggggggg...", "...gkgggkgggkg...", "..kkkkkkkkkkkkk..", ".kbbbbbbbbbbbbbk.", ".kbbkkkbbbkkkbbk.", ".kbkkekkbkkekkbk.", ".kbbkkkbbbkkkbbk.", ".kbbbbbbkbbbbbbk.", "..kbbkbkbkbkbbk..", "...kkbkbkbkbkk...", "..krrkkkkkkkrrk..", ".krrrrrrorrrrrrk.", "krrrkrroooorkrrrk", "krrk.krrorrk.krrk", "kbk..krrrrrk..kbk", ".....krrkrrk.....", "....krrk.krrk....", "....kr.....rk....",
    ]],
  });
  // the third cave's creatures and its heart
  Object.assign(ENEMY_ART, {
    boar: [["....kk.........", "...kmmkkkkkk...", "..kmmmmmmmmmkk.", ".kmhmmmmmmmmmek", "kmmmmmmmmmmmmtt", "kmmmmmmmmmmmkt.", ".kdmmddmmmddk..", ".kdk.kdk.kdkk..", ".kk..kk..kk...."]],
    mender: [["....o....", "..okgko..", ".okgggko.", "okggeggko", ".okgggko.", "..okgko..", "...kok...", "....k....", "....o...."]],
    lasher: [["...ggg...", "..gkkkg..", ".gktttkg.", ".gktttkg.", "..gkkkg..", "...gdg...", "..gdgdg..", "...gdg...", "..gdgdg..", "...gdg...", "..gdddg..", ".gddgddg.", "gdg...gdg"]],
    heartroot: [["......kdk.kdk....", "......kdk.kdk....", ".....kddkkddk....", "...kkkrrrrrrkkk..", "..krrrrrrrrrrrrk.", ".krrhrrrrrrrrhrrk", ".krrrrrkkkrrrrrrk", "krrrrrkoookrrrrrk", "krrrrkoooookrrrrk", "krrrrkoooookrrrrk", "krrrrrkoookrrrrrk", ".krrrrrkkkrrrrrk.", ".krrhrrrrrrrhrrk.", "..krrrrrrrrrrrk..", "...kkrrrrrrrkk...", ".....kkrrrkk.....", ".......kdk.......", "......kd.dk......"]],
  });
  Object.assign(ENEMY_ART, {
    tinder: [["...kkkkk...", "..kcccccck.", ".kcchccccek", "kccccccccck", "kfffffffffk", ".kdk.kdk.k.", ".k...k...k."],
             ["...kkkkk...", "..kcccccck.", ".kcchccccek", "kccccccccck", "kfffffffffk", "..kdk.kdk.k", "..k...k...k"]],
    rime: [["...kkkkkk...", ".kkiiiiiikk.", "kiihiiiiiiek", "kiiiiiiiiiwk", "kbbbbbbbbbbk", ".kdkdkkdkdk.", ".k.k....k.k."]],
    bladder: [["....kkk....", "..kkgggkk..", ".kgggggggk.", ".kgghggggk.", "kggggggoggk", "kgggeggeggk", "kgggggggggk", ".kgggggggk.", "..kkgggkk..", "....kdk....", ".....d....."],
              ["....kkk....", "..kkgggkk..", ".kgggggggk.", ".kgghgoggk.", "kgggggggggk", "kgggeggeggk", "kgogggggggk", ".kgggggggk.", "..kkgggkk..", "....kdk....", "....d......"]],
  });
  const ENEMY_COL = {
    tinder: { k: [26, 14, 12], c: [78, 44, 30], h: [126, 80, 54], f: [255, 140, 50], d: [44, 26, 20], e: [255, 210, 110] },
    rime: { k: [18, 30, 46], i: [124, 172, 210], h: [206, 232, 250], b: [92, 132, 172], d: [40, 60, 80], w: [226, 246, 255], e: [170, 240, 255] },
    bladder: { k: [30, 40, 16], g: [150, 200, 70], h: [222, 255, 160], o: [192, 240, 92], e: [255, 232, 92], d: [70, 90, 40] },
    moth: { w: [222, 196, 244], k: [40, 30, 50], b: [124, 104, 146], e: [255, 70, 160] },
    delver: { k: [24, 16, 20], m: [122, 98, 92], h: [154, 126, 112], d: [84, 66, 64], t: [240, 230, 210], e: [255, 70, 160] },
    spitter: { k: [24, 14, 18], m: [92, 62, 60], h: [134, 92, 82], d: [60, 40, 42], o: [255, 140, 50] },
    slinger: { k: [26, 20, 18], m: [150, 120, 96], h: [196, 166, 132], d: [100, 78, 66], p: [168, 160, 150], e: [255, 70, 160] },
    wisp: { k: [20, 26, 60], w: [150, 190, 255], o: [80, 120, 230], e: [240, 250, 255] },
    frog: { k: [14, 28, 30], m: [70, 132, 110], h: [120, 180, 140], d: [44, 88, 84], e: [255, 220, 90] },
    imp: { k: [36, 12, 10], m: [150, 52, 36], d: [100, 34, 28], o: [255, 150, 50], e: [255, 230, 120] },
    shade: { k: [14, 10, 26], d: [58, 44, 92], m: [88, 70, 132], e: [210, 170, 255] },
    urchin: { k: [20, 28, 44], m: [110, 150, 190], h: [180, 215, 240], p: [200, 230, 255], e: [255, 90, 150] },
    wraith: { k: [40, 34, 34], w: [176, 166, 160], e: [255, 120, 60] },
    geode: { k: [26, 24, 34], m: [96, 92, 110], h: [140, 136, 156], o: [150, 110, 255] },
    hollowking: { k: [12, 10, 18], g: [255, 211, 122], b: [214, 206, 190], r: [64, 50, 96], o: [170, 130, 255], e: [200, 170, 255] },
    boar: { k: [24, 16, 14], m: [128, 92, 70], h: [170, 130, 98], d: [84, 58, 50], t: [236, 226, 200], e: [255, 80, 80] },
    mender: { k: [14, 40, 26], g: [90, 200, 120], o: [170, 255, 190], e: [255, 255, 255] },
    lasher: { k: [16, 30, 18], g: [70, 140, 80], d: [48, 96, 58], t: [240, 230, 210] },
    heartroot: { k: [28, 8, 14], r: [170, 50, 62], h: [220, 96, 100], d: [84, 58, 50], o: [255, 190, 120] },
    warden: { k: [16, 14, 22], m: [112, 120, 142], p: [156, 162, 184], s: [72, 76, 94], f: [128, 134, 154], d: [72, 76, 94], e: [255, 70, 160] },
  };
  // v0.81: the weaker sprites redrawn with a lit top edge, a shadowed underside and two-frame walks
  Object.assign(ENEMY_ART, {
    delver: [[
      "....kkkkk....",
      "..kkhhhhhkk..",
      ".khhmmmmmhhk.",
      "khmdmmdmmdmek",
      "kmmdmmdmmdkkt",
      "kmmdmmdmmmk.t",
      ".kddddddddkkt",
      "..kt.kt..kt..",
      "..k..k...k...",
    ], [
      "....kkkkk....",
      "..kkhhhhhkk..",
      ".khhmmmmmhhk.",
      "khmdmmdmmdmek",
      "kmmdmmdmmdkkt",
      "kmmdmmdmmmk.t",
      ".kddddddddkkt",
      "...kt.kt.kt..",
      "...k..k..k...",
    ]],
    spitter: [[
      "..kkkkk....",
      ".khhhhhkk..",
      "khmmmmmhek.",
      "kmmdmhkook.",
      "kmdmmkoooo.",
      "kmmdmhkook.",
      "kmdmmmhkk..",
      "kmmdmdmmk..",
      ".kmmmmmmk..",
      "..kdddddk..",
    ]],
    boar: [[
      "....k.k.k......",
      "...kdkdkdkk....",
      "..khhhhhhhhkk..",
      ".khmmmmmmmmhhk.",
      "khmmmmmmmmmmmek",
      "kdmmmmmmmmmmmmt",
      ".kddmmmmddmmktk",
      "..kdk.kk.kdkk..",
      "..kk...kk.kk...",
    ], [
      "....k.k.k......",
      "...kdkdkdkk....",
      "..khhhhhhhhkk..",
      ".khmmmmmmmmhhk.",
      "khmmmmmmmmmmmek",
      "kdmmmmmmmmmmmmt",
      ".kddmmmmddmmktk",
      "..kkdk.kdkk.k..",
      "...kk..kk..kk..",
    ]],
    tinder: [[
      "....kkkkk.k..",
      "..kkchhhck.k.",
      ".kchhccccfkk.",
      "kccfcccccfkek",
      "kcfffffffffk.",
      ".kdk.kdk.kdk.",
      ".k...k...k...",
    ], [
      "....kkkkk.k..",
      "..kkchhhck.k.",
      ".kchhccccfkk.",
      "kccfcccccfkek",
      "kcfffffffffk.",
      "..kdk.kdk.kd.",
      "..k...k...k..",
    ]],
    rime: [[
      "....w...w...",
      "..w.kw.kwk..",
      ".kwkhikkiik.",
      "khiihiiiihik",
      "kiiiiiiiiiek",
      "kbbkbbkbbbbk",
      ".dk.dk.dk.k.",
    ], [
      "....w...w...",
      "..w.kw.kwk..",
      ".kwkhikkiik.",
      "khiihiiiihik",
      "kiiiiiiiiiek",
      "kbbkbbkbbbbk",
      "..kd.kd.kd.k",
    ]],
    bladder: [[
      "...kkkkk...",
      ".kkgghggkk.",
      "kgghhgoggdk",
      "kgggggggddk",
      "kgogeggegdk",
      "kgggggggdgk",
      ".kggdddddk.",
      "..kkdkdkk..",
      "...d.d.d...",
      "..d...d..d.",
      "...........",
    ], [
      "...kkkkk...",
      ".kkgghggkk.",
      "kgghhggggdk",
      "kgogggggddk",
      "kgggeggegdk",
      "kggggoggdgk",
      ".kggdddddk.",
      "..kkdkdkk..",
      "...d.d.d...",
      "....d.d..d.",
      "...........",
    ]],
    moth: [[
      ".kk.......kk.",
      "kwwk.k.k.kwwk",
      "kwvwk.k.kwvwk",
      "kwwvwkbkwvwwk",
      ".kwwwkbekwwk.",
      "..kwvkbbkvwk.",
      "...kk.kk.kk..",
    ], [
      ".............",
      "....k...k....",
      ".....kbk.....",
      ".kkkkbekkkkk.",
      "kwvwwkbkwwvwk",
      "kwwvwkbkwvwwk",
      ".kkkk.k.kkkk.",
    ]],
    wraith: [[
      "...kkkkk...",
      "..kwwwwwk..",
      ".kwhwwwwwk.",
      ".kwkekkewk.",
      ".kwwwwwwwk.",
      ".kwwkdkwwk.",
      "kwwwwwwwwwk",
      "kwdwwwwwdwk",
      ".kdwkwdwwk.",
      "..kdk.kdk..",
      "...k...k...",
    ], [
      "...kkkkk...",
      "..kwwwwwk..",
      ".kwhwwwwwk.",
      ".kwkekkewk.",
      ".kwwwwwwwk.",
      ".kwwkdkwwk.",
      "kwwwwwwwwwk",
      "kwdwwwwwdwk",
      ".kwwdwkwdk.",
      "..kdk..kdk.",
      "..k.....k..",
    ]],
    lasher: [[
      "...kkk...",
      "..kgggk..",
      ".kgtttgk.",
      "kgtkkktgk",
      "kgtkekt.k",
      ".kgtttgk.",
      "..kgggk..",
      "...kdk...",
      "...kdk.k.",
      "..kdkkdk.",
      "..kdk.k..",
      ".kddk....",
      "kdkdkdk..",
    ]],
    frog: [[
      "..kkk..kkk...",
      ".khehkkhehk..",
      "kmmmmmmmmmmk.",
      "khmmmmmmmmmhk",
      "kmmllllllmmmk",
      "kddmmmmmmmddk",
      "kddkkmmmkkddk",
      "kk..kkkkk..kk",
    ]],
    slinger: [[
      "........kk.",
      "...kkk.kppk",
      "..khhmk.kpk",
      "..kmhek.kk.",
      "..kkmkkkmk.",
      ".kmhmmmmk..",
      ".kmmmmmdk..",
      ".kmmmmmdk..",
      "..kmmmdk...",
      "..kdkkdk...",
      "..kdk.kdk..",
      ".kkk..kkk..",
    ]],
    geode: [[
      "....kkk....",
      "..kkhmmkk..",
      ".khmmmmmhk.",
      "khmkkokkmhk",
      "kmkooeookmk",
      "kmkoooookmk",
      "kmmkkokkmmk",
      ".kmmmmmmmk.",
      "..kdmmmdk..",
      "...kkkkk...",
      "...........",
    ]],
  });
  Object.assign(ENEMY_COL, {
    delver: { k: [24, 16, 20], m: [122, 98, 92], h: [166, 138, 122], d: [84, 66, 64], t: [240, 230, 210], e: [255, 70, 160] },
    spitter: { k: [24, 14, 18], m: [92, 62, 60], h: [140, 98, 84], d: [60, 40, 42], o: [255, 140, 50], e: [255, 210, 110] },
    boar: { k: [24, 16, 14], m: [128, 92, 70], h: [176, 136, 100], d: [84, 58, 50], t: [236, 226, 200], e: [255, 80, 80] },
    moth: { w: [222, 196, 244], v: [170, 140, 200], k: [40, 30, 50], b: [124, 104, 146], e: [255, 70, 160] },
    wraith: { k: [40, 34, 34], w: [176, 166, 160], h: [214, 206, 200], d: [116, 106, 104], e: [255, 120, 60] },
    lasher: { k: [16, 30, 18], g: [70, 140, 80], d: [48, 96, 58], t: [240, 230, 210], e: [255, 80, 80] },
    frog: { k: [14, 28, 30], m: [70, 132, 110], h: [120, 180, 140], d: [44, 88, 84], l: [150, 196, 150], e: [255, 220, 90] },
    geode: { k: [26, 24, 34], m: [96, 92, 110], h: [140, 136, 156], d: [64, 60, 76], o: [150, 110, 255], e: [230, 210, 255] },
  });
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
  // The far back wall: a tile 256 cells square that repeats, of tall pillars and hanging rock, lit along their tops,
  // drawn behind the cave at half the camera's speed so the cave has depth. Values are brightness changes.
  function backWall() {
    const N = 256, out = new Int8Array(N * N);
    const tn = (x, y, cx, cy, s) => {   // smooth noise that repeats every 256 cells: cx by cy squares
      const u = x * cx / N, v = y * cy / N, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
      const H = (a, b) => hash(((a % cx) + cx) % cx, ((b % cy) + cy) % cy, s);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), d = H(i + 1, j + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
    const pillar = (x, y) => tn(x, y, 14, 3, 51) * 0.7 + tn(x, y, 32, 8, 52) * 0.3;
    // boulders: a jittered grid of rounded stones, 16 across the tile, each slightly lighter than the wall,
    // with a dark seam round it and a lit top
    const G = 16, CS = N / G, cen = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) cen.push([(i + 0.2 + hash(i, j, 56) * 0.6) * CS, (j + 0.2 + hash(i, j, 57) * 0.6) * CS, CS * (0.42 + hash(i, j, 58) * 0.3), hash(i, j, 59)]);
    const stone = (x, y) => {   // which boulder covers (x, y), and how far inside it (0 at the rim, 1 at the middle)
      const ci = Math.floor(x / CS), cj = Math.floor(y / CS); let best = -1, bk = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + G) % G, jj = (cj + dj + G) % G, C = cen[jj * G + ii];
        let dx = x - C[0] - (ci + di - ii) * CS * 0, dy = y - C[1];
        dx = ((dx + N * 1.5) % N) - N / 2; dy = ((dy + N * 1.5) % N) - N / 2;
        const f = 1 - Math.sqrt(dx * dx + dy * dy * 1.3) / C[2];
        if (f > best) { best = f; bk = C[3]; }
      }
      return [best, bk];
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let d = 0;
      const [f, k] = stone(x, y);
      if (f > 0) { d += 3 + Math.round(k * 4); if (f < 0.12) d -= 7; else if (stone(x, (y + N - 2) % N)[0] <= 0.12) d += 6; }
      else d -= 3;
      const p = pillar(x, y);
      if (p > 0.62) { d = -10; if (pillar(x, (y + N - 2) % N) <= 0.62) d += 12; }
      if (hash(x, y, 55) < 0.0012) d += 26;
      out[y * N + x] = Math.max(-127, Math.min(127, d));
    }
    return out;
  }
  // Smooth noise that repeats every 256 cells, worked out once (v0.77): magma's drifting crust reads it instead of
  // computing noise for every magma cell every frame.
  function noiseTile(cells, seed) {
    const N = 256, out = new Uint8Array(N * N), sc = N / cells;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / sc, v = y / sc, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
      const H = (a, b) => hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, seed);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), d = H(i + 1, j + 1);
      out[y * N + x] = Math.round((a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 255);
    }
    return out;
  }
  const pack = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;

  class Renderer {
    constructor(base, glow) {
      base.width = V.w; base.height = V.h;
      this.base = base; this.ctx = base.getContext('2d');
      this.img = this.ctx.createImageData(V.w, V.h);
      this.buf = new Uint32Array(this.img.data.buffer);
      this.glow = glow; this.gctx = glow.getContext('2d');
      this.lightsNow = []; this.lightsPrev = []; this.amb = 0.3; this.motes = []; this.seenFx = new WeakSet();
      this.kind = new Uint8Array(V.w * V.h);
      this.par = backWall();
      this.magA = noiseTile(28, 81); this.magB = noiseTile(64, 82);
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
      this.gc = new Map(); this.frameNo = 0;
    }

    chunkColours(ckx, cky) {
      const k = cky * 4096 + ckx;
      let c = this.cc.get(k);
      if (c) return c;
      const world = this.world, BI = world.biomes, h = world.h;
      c = { bg: new Uint32Array(1024), dirt: new Uint32Array(1024), rock: new Uint32Array(1024), crust: new Uint32Array(1024), rim: new Uint32Array(1024) };
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
        // dirt (v0.66): the region's colours in soft blobs, with stones set in it (darker, speckled, outlined),
        // and a gently waving band of strata kept faintly underneath
        const S = B.strata;
        const v = (y + 11 * noise(x, 0, 46, 3) + 4 * noise(x, y, 13, 4)) / 9;
        let band = Math.floor(v);
        if (v - band > 0.7 && (v - band - 0.7) / 0.3 > b4) band++;
        const mot = noise(x, y, 17, 6) * 0.65 + noise(x, y, 6, 7) * 0.35;
        let dc = S[(((band + (mot > 0.55 ? 2 : mot < 0.38 ? 4 : 0)) % S.length) + S.length) % S.length];
        const st = noise(x + 300, y, 11, 61) * 0.7 + noise(x, y + 300, 4, 62) * 0.3;
        if (st > 0.66) {
          const dk = S[4] || S[0], sv = 0.62 + 0.25 * noise(x, y, 3, 63);
          dc = [dk[0] * sv * 0.8 + 22, dk[1] * sv * 0.85 + 24, dk[2] * sv + 34];
          if (hash(x, y, 64) < 0.1) dc = dc.map(q => q * 1.35 + 10);         // grains in the stone
          if (st < 0.69) dc = dc.map(q => q * 0.55);                          // its dark edge
        } else if (noise(x, y, 5, 6) > 0.64 && b4 < 0.5) dc = dc.map(q => q * 0.88);
        const gr = 0.9 + 0.2 * hash(x, y, 77) - (hash(x >> 1, y >> 1, 78) < 0.08 ? 0.12 : 0);   // grit: single grains and small dark pits
        c.dirt[i] = pack(clamp(dc[0] * gr), clamp(dc[1] * gr), clamp(dc[2] * gr));
        // the crust every open face of dirt has: lighter, sandy, speckled; the rim is its very edge
        const K = B.crust || S[3], ck = 0.86 + 0.24 * hash(x, y, 65) + (noise(x, y, 4, 66) - 0.5) * 0.25;
        c.crust[i] = pack(clamp(K[0] * ck), clamp(K[1] * ck), clamp(K[2] * ck));
        c.rim[i] = pack(clamp(K[0] * ck * 1.2 + 16), clamp(K[1] * ck * 1.2 + 16), clamp(K[2] * ck * 1.15 + 14));
        // rock: faceted slate
        const f = noise(x, y, 7, 9) * 0.7 + noise(x, y, 3, 10) * 0.3, q = f * 4, lv = Math.floor(q) / 3;
        let rc = SLATE0.map((s0, kk) => s0 + (SLATE1[kk] - s0) * Math.min(1, lv));
        if (Math.abs(q - Math.round(q)) < 0.045) rc = SLATE_EDGE;
        const gk = 0.93 + 0.14 * hash(x, y, 79);
        c.rock[i] = pack(clamp(rc[0] * gk), clamp(rc[1] * gk), clamp(rc[2] * gk));
      }
      this.cc.set(k, c);
      if (this.cc.size > 320) this.cc.delete(this.cc.keys().next().value);
      return c;
    }

    // How much of the cave is drawn, in cells. main.js picks it to match the screen's shape.
    setView(w, h) {
      if (w === V.w && h === V.h && this.img.width === w) return;
      V.w = w; V.h = h;
      this.base.width = w; this.base.height = h;
      this.img = this.ctx.createImageData(w, h);
      this.buf = new Uint32Array(this.img.data.buffer);
      this.gw = Math.ceil(w / 8); this.gh = Math.ceil(h / 8);
      this.heat = new Float32Array(this.gw * this.gh);
      this.spark = new Float32Array(this.gw * this.gh);
      this.kind = new Uint8Array(w * h);
    }
    resize(cssW, cssH) {
      const k = Math.min(1, 640 / cssW); // glow is soft, half resolution is plenty
      const gw = Math.max(1, Math.round(cssW * k)), gh = Math.max(1, Math.round(cssH * k));
      if (this.glow.width !== gw || this.glow.height !== gh) { this.glow.width = gw; this.glow.height = gh; }   // setting a canvas's size clears it, even to the same size
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
    // A soft glow on the smooth canvas; it also lights the cave next frame (lightFrame), unless `plain`.
    light(x, y, r, col, a, plain) {
      if (a <= 0.01) return;
      if (!plain && this.lightsNow.length < 7 * 400) this.lightsNow.push(x, y, r, col[0], col[1], col[2], Math.min(1, a));
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
      const p = game.players[game.me || 0];   // this device's golem (the second one for a co-op guest)
      let cx = Math.round(p.x - V.w * (opt.lookX || 0.5)), cy = Math.round(p.y - 8 - V.h * (opt.lookY || 0.5));   // lookX, lookY: where across the screen the golem stands (the title screen puts it right of centre)
      if (game.shake > 0 && !opt.reduced) { cx += Math.round((Math.random() - 0.5) * game.shake); cy += Math.round((Math.random() - 0.5) * game.shake); }
      cx = Math.max(0, Math.min(world.w - V.w, cx)); cy = Math.max(0, Math.min(world.h - V.h, cy));
      this.cam.x = cx; this.cam.y = cy;
      const lt = this.lightsPrev; this.lightsPrev = this.lightsNow; this.lightsNow = lt; lt.length = 0;

      this.frameNo++;
      // v0.77: only cells within the golem's sight are drawn and lit; past it the picture is black anyway (main.js fade)
      { const R = this.sightR || 1e5, sx = p.x - cx, sy = p.y - 8 - cy, sp = this.span || (this.span = new Int16Array(4096));
        for (let vy = 0; vy < V.h; vy++) { const dy = vy - sy, q = R * R - dy * dy; if (q <= 0) { sp[vy * 2] = 0; sp[vy * 2 + 1] = 0; continue; } const r = Math.sqrt(q); sp[vy * 2] = Math.max(0, Math.floor(sx - r)); sp[vy * 2 + 1] = Math.min(V.w, Math.ceil(sx + r)); } }
      this.drawCells(world, game.time);
      this.drawDecor(game);
      this.ambient(game, opt.dt);
      this.drawMotes(false);
      this.drawLodestones(game, game.time);
      for (const d of game.dummies) this.drawDummy(d);
      for (const e of game.enemies) if (!e.asleep && !e.dead) { if (e.kind === 'crawler') this.drawCrawler(e, game.time); else this.drawEnemy(e, game.time); }
      if (game.boss && !game.boss.dead) this.drawBoss(game.boss, game);
      for (const pl of game.players) this.drawGolem(pl, game.time, opt.reduced);
      this.drawCaches(game);
      this.drawTablets(game);
      this.drawLoot(game);
      if (!opt.flat) this.lightFrame(game);
      this.drawMotes(true);
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
      const { w, mat, shade, life, charge } = world, buf = this.buf, pal = this.pal, kind = this.kind, par = this.par, pcx = this.cam.x >> 1, pcy = this.cam.y >> 1;
      const heat = this.heat, spark = this.spark, gw = this.gw;
      heat.fill(0); spark.fill(0);
      let nFire = 0, nMagma = 0, nAcid = 0;   // how much of each is on screen, for the cave's sound (audio.js ambience)
      const fire = materials[M.FIRE].colors, magma = materials[M.MAGMA].colors;
      const pulse = time * 3, magA = this.magA, magB = this.magB, mt1 = (time * 2.2) | 0, mt2 = (time * 1.4) | 0;
      const lit = c => pack(clamp((c & 255) * 1.25 + 14), clamp(((c >> 8) & 255) * 1.2 + 12), clamp(((c >> 16) & 255) * 1.15 + 12));
      const dark = c => pack(clamp((c & 255) * 0.55), clamp(((c >> 8) & 255) * 0.5), clamp(((c >> 16) & 255) * 0.6));
      const open = q => q === M.EMPTY || q === M.STEAM || q === M.FIRE || q === M.GAS;
      const moss = materials[M.MOSS].colors;
      // mark what is on screen as explored (for the map)
      for (let cy = this.cam.y >> 5; cy <= (this.cam.y + V.h - 1) >> 5; cy++) for (let cx = this.cam.x >> 5; cx <= (this.cam.x + V.w - 1) >> 5; cx++) world.explored[cy * world.cw + cx] = 1;
      const bandC = this._bandC || (this._bandC = []), bandG = this._bandG || (this._bandG = []), ck0 = this.cam.x >> 5;
      let band = -1;
      for (let vy = 0; vy < V.h; vy++) {
        const wy = vy + this.cam.y, row = wy * w, grow = (vy >> 3) * gw, cky = wy >> 5, ly = (wy & 31) * 32;
        if (cky !== band) {   // the chunks along this band of 32 rows, looked up once
          band = cky; bandC.length = 0; bandG.length = 0;
          for (let ckx = ck0; ckx <= (this.cam.x + V.w - 1) >> 5; ckx++) { const C = this.chunkColours(ckx, cky); bandC.push(C); bandG.push(this.groundChunk(world, ckx, cky, C)); }
        }
        const sa = this.span[vy * 2], sb = this.span[vy * 2 + 1], BLACK = 0xff000000;
        for (let o = vy * V.w, e = o + sa; o < e; o++) { buf[o] = BLACK; kind[o] = 1; }
        for (let o = vy * V.w + sb, e = (vy + 1) * V.w; o < e; o++) { buf[o] = BLACK; kind[o] = 1; }
        for (let vx = sa; vx < sb;) {
          const ckx = (vx + this.cam.x) >> 5, C = bandC[ckx - ck0], G = bandG[ckx - ck0], gf = G.flag, gc = G.col;
          const end = Math.min(sb, (ckx + 1) * 32 - this.cam.x);
          for (; vx < end; vx++) {
            const wx = vx + this.cam.x, i = row + wx, m = mat[i], o = vy * V.w + vx, li = ly + (wx & 31);
            let f = gf[li];
            // v1.04: only ground is kept for sure; an open cell may since have filled with a liquid, or a liquid's cell emptied
            if (f !== 1) { if (m === M.EMPTY) { if (f === 0) f = 3; } else f = 0; }
            if (f === 3) {
              // the back wall, with a far layer of pillars that moves at half speed (backWall)
              const bc = C.bg[li], d = par[((wy - pcy) & 255) * 256 + ((wx - pcx) & 255)];
              buf[o] = d ? pack(clamp((bc & 255) + d), clamp(((bc >> 8) & 255) + d * 0.9), clamp(((bc >> 16) & 255) + d * 1.25)) : bc; kind[o] = 2;
              continue;
            }
            if (f) { buf[o] = gc[li]; kind[o] = 0; continue; }   // ground, and lichen and roots, worked out once (groundChunk)
            kind[o] = m === M.FIRE || m === M.MAGMA || m === M.EMBER || m === M.CRYSTAL || m === M.ACID ? 1 : 0;
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
              buf[o] = pack(clamp(bR + (c[0] - bR) * a), clamp(bG + (c[1] - bG) * a), clamp(bB + (c[2] - bB) * a)); kind[o] = 3;
              continue;
            }
            if (m === M.FIRE) {
              const l = life[i] + ((shade[i] + time * 60) % 7) - 3;
              const c = fire[l > 24 ? 0 : l > 16 ? 1 : l > 8 ? 2 : 3];
              buf[o] = pack(c[0], c[1], c[2]);
              heat[grow + (vx >> 3)] += 1; nFire++;
              continue;
            }
            if (m === M.CRYSTAL) {
              const cc = materials[M.CRYSTAL].colors[shade[i] & 3], tw = ((shade[i] * 7 + (time * 4 | 0)) % 23) === 0 ? 1.25 : 1;
              buf[o] = pack(clamp(cc[0] * tw), clamp(cc[1] * tw), clamp(cc[2] * tw));
              spark[grow + (vx >> 3)] += 0.15;
              continue;
            }
            if (m === M.MAGMA) {
              // a dark crust that drifts slowly, split by bright cracks; the open surface glows hottest
              const n1 = (magA[(wy & 255) * 256 + ((wx + mt1) & 255)] * 0.7 + magB[((wy - mt2) & 255) * 256 + (wx & 255)] * 0.3) / 255, crack = Math.abs(n1 - 0.5);
              const top = mat[i - w] !== M.MAGMA;
              if (top || crack < 0.045) { const c = magma[3]; buf[o] = pack(c[0], clamp(c[1] + (shade[i] & 15)), c[2]); }
              else if (crack < 0.1) { const c = magma[shade[i] & 1]; buf[o] = pack(c[0], c[1], c[2]); }
              else { const k = 0.32 + (0.5 - crack) * 0.5 + 0.06 * Math.sin(pulse + shade[i] * 0.1); buf[o] = pack(clamp(150 * k + 20), clamp(52 * k + 6), clamp(30 * k + 8)); }
              heat[grow + (vx >> 3)] += 0.1; nMagma++;   // a lake is hundreds of cells: each adds little, or the glow washes its crust out
              continue;
            }
            if (m === M.GAS) {   // a faint green haze
              const c = materials[M.GAS].colors[shade[i] % 3], a = 0.2 + 0.08 * Math.sin(pulse * 0.6 + shade[i]);
              buf[o] = pack(clamp(bR + (c[0] - bR) * a), clamp(bG + (c[1] - bG) * a), clamp(bB + (c[2] - bB) * a));
              continue;
            }
            if (m === M.OIL || m === M.ACID) {   // a liquid with a sheen along its top
              const c = materials[m].colors[shade[i] % 3], top = mat[i - w] === M.EMPTY || mat[i - w] === M.GAS;
              if (m === M.ACID) { nAcid++; const f = 0.85 + 0.15 * Math.sin(pulse + shade[i] * 0.2); buf[o] = top ? pack(214, 255, 150) : pack(clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)); spark[grow + (vx >> 3)] += 0.04; }
              else buf[o] = top ? pack(96, 84, 110) : pack(c[0], c[1], c[2]);
              continue;
            }
            if (m === M.EMBER) {
              const c = materials[M.EMBER].colors[(shade[i] + ((time * 6) | 0)) & 3];
              buf[o] = pack(c[0], c[1], c[2]); heat[grow + (vx >> 3)] += 0.6; nFire++;
              continue;
            }
            { const v = pal[m]; buf[o] = v[shade[i] % v.length][0]; }   // anything else (groundChunk covers the ground)
          }
        }
      }
      this.amounts = { fire: nFire, magma: nMagma, acid: nAcid };
    }

    // The ground, worked out once per chunk (v0.77): dirt with its crust, rock, brick, wood, ice, coal, lichen,
    // earth and mud, and the lichen tufts and roots in the open cells beside them. Kept until anything in the chunk
    // or its eight neighbours changes (world.rev counts every change). flag: 0 drawn each frame (liquids, gas,
    // fire, magma, embers, crystal), 1 ground (col), 2 a tuft or root (col), 3 open back wall (drawn each frame).
    groundChunk(world, ckx, cky, C) {
      const key = cky * 4096 + ckx, rev = world.rev, cw = world.cw, chh = world.ch;
      let G = this.gc.get(key);
      if (G && G.seen === this.frameNo) return G;
      const sig = G ? G.sig : new Uint32Array(9);
      let same = !!G, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, n++) {
        const x = ckx + dx, y = cky + dy, r = x >= 0 && y >= 0 && x < cw && y < chh ? rev[y * cw + x] : 0;
        if (sig[n] !== r) { sig[n] = r; same = false; }
      }
      if (!G) { G = { sig, flag: new Uint8Array(1024), col: new Uint32Array(1024), seen: 0 }; this.gc.set(key, G); if (this.gc.size > 420) this.gc.delete(this.gc.keys().next().value); }
      G.seen = this.frameNo;
      if (same) return G;
      const { w, h, mat, shade } = world, ST = KWorld.STATE, pal = this.pal, flag = G.flag, col = G.col, moss = materials[M.MOSS].colors;
      const lit = c => pack(clamp((c & 255) * 1.25 + 14), clamp(((c >> 8) & 255) * 1.2 + 12), clamp(((c >> 16) & 255) * 1.15 + 12));
      const dark = c => pack(clamp((c & 255) * 0.55), clamp(((c >> 8) & 255) * 0.5), clamp(((c >> 16) & 255) * 0.6));
      const open = q => q === M.EMPTY || q === M.STEAM || q === M.FIRE || q === M.GAS;
      const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? M.ROCK : mat[y * w + x];
      // how deep each cell sits from an open one (1 at the face, up to 5), over the chunk and 5 cells round it
      const x0 = ckx * 32 - 5, y0 = cky * 32 - 5, N = 42, D = this._gd || (this._gd = new Uint8Array(N * N));
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = ST[at(x0 + x, y0 + y)], o = y * N + x;
        let d = s === 1 || s === 2 ? 5 : 0;
        if (d) {
          if (x > 0 && D[o - 1] + 1 < d) d = D[o - 1] + 1;
          if (y > 0) { const u = o - N; if (D[u] + 1 < d) d = D[u] + 1; if (x > 0 && D[u - 1] + 1 < d) d = D[u - 1] + 1; if (x < N - 1 && D[u + 1] + 1 < d) d = D[u + 1] + 1; }
        }
        D[o] = d;
      }
      for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
        const o = y * N + x; let d = D[o]; if (d <= 1) continue;
        if (x < N - 1 && D[o + 1] + 1 < d) d = D[o + 1] + 1;
        if (y < N - 1) { const u = o + N; if (D[u] + 1 < d) d = D[u] + 1; if (x > 0 && D[u - 1] + 1 < d) d = D[u - 1] + 1; if (x < N - 1 && D[u + 1] + 1 < d) d = D[u + 1] + 1; }
        D[o] = d;
      }
      for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
        const wx = ckx * 32 + lx, wy = cky * 32 + ly, li = ly * 32 + lx;
        if (wx >= w || wy >= h) { flag[li] = 3; continue; }
        const i = wy * w + wx, m = mat[i];
        if (m === M.EMPTY) {
          // tufts of lichen on the tops of dirt, and roots hanging from its roofs
          const below = at(wx, wy + 1), above = at(wx, wy - 1);
          let c = 0;
          if (below === M.DIRT && hash(wx, wy, 68) < 0.42) { const g = moss[(hash(wx, 0, 69) * 4) | 0]; c = pack(g[0], g[1], g[2]); }
          else if (below === M.EMPTY && at(wx, wy + 2) === M.DIRT && hash(wx, wy + 1, 68) < 0.42 && hash(wx, wy, 70) < 0.3) { const g = moss[(hash(wx, 0, 69) * 4) | 0]; c = pack(g[0] * 0.8, g[1] * 0.8, g[2] * 0.8); }
          else if (above === M.DIRT && hash(wx, 0, 71) < 0.22) c = pack(70, 56, 52);
          else if (above === M.EMPTY && at(wx, wy - 2) === M.DIRT && hash(wx, 0, 71) < 0.22 && hash(wx, 1, 72) < 0.6) c = pack(58, 46, 46);
          if (c) { flag[li] = 2; col[li] = c; } else flag[li] = 3;
          continue;
        }
        const st = ST[m];
        if (!(st === 1 || st === 2) || m === M.CRYSTAL || m === M.EMBER) { flag[li] = 0; continue; }
        const above = at(wx, wy - 1);
        let e = 0;
        if (open(above) || above === M.WATER) e = 1;
        else if (st === 1 && (open(at(wx, wy + 1)) || open(at(wx - 1, wy)) || open(at(wx + 1, wy)))) e = 2;
        const dd = D[(ly + 5) * N + lx + 5];
        let c;
        if (m === M.DIRT) {
          // a crust two or three cells thick on every open face, brightest at the edge and on top
          if (dd === 1) c = e === 1 ? lit(C.rim[li]) : C.rim[li];
          else if (dd === 2 || (dd === 3 && hash(wx, wy, 67) < 0.55)) c = C.crust[li];
          else if (dd === 3) { const p1 = C.crust[li], p2 = C.dirt[li]; c = 0xff000000 | ((((p1 >> 16) & 255) + ((p2 >> 16) & 255)) >> 1) << 16 | ((((p1 >> 8) & 255) + ((p2 >> 8) & 255)) >> 1) << 8 | (((p1 & 255) + (p2 & 255)) >> 1); }
          else c = C.dirt[li];
        } else if (m === M.BRICK) {
          // courses three cells high, bricks eight long, every other course set over by half; darker mortar
          const row = (wy / 3) | 0, off = (row & 1) * 4, bcol = ((wx + off) >> 3), v = pal[m];
          c = v[(hash(bcol, row, 93) * v.length) | 0][dd === 1 && e === 1 ? 1 : 0];
          if (wy % 3 === 0 || ((wx + off) & 7) === 0 || hash(wx, wy, 94) < 0.07) c = dark(c);
        } else if (m === M.ROCK) {
          const base = C.rock[li]; c = e === 1 ? lit(base) : e === 2 ? dark(base) : base;
        } else if (m === M.WOOD) {
          // grain: long streaks down the timber
          const v = pal[m], gk = (hash(wx, wy >> 3, 7) * 4) | 0; c = v[(gk + (hash(wx, wy, 8) < 0.12 ? 2 : 0)) % v.length][e];
        } else if (m === M.ICE) {
          // facets: broad pale flats with bright cracks
          const v = pal[m], f = noise(wx, wy, 6, 12); c = Math.abs(f * 5 - Math.round(f * 5)) < 0.06 ? pack(236, 248, 255) : v[Math.min(v.length - 1, (f * 4) | 0)][e];
        } else { const v = pal[m]; c = v[shade[i] % v.length][e]; }
        flag[li] = 1; col[li] = c;
      }
      return G;
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
      else if (p.digT > 0 && p.grounded) { const sw = Math.sin(time * 26) > 0; P.armL = sw ? -1 : 1; P.armR = sw ? 1 : -1; P.lean = p.facing; P.body = sw ? 0 : -1; }   // clawing at dirt
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
      if (b.type !== 'emberwyrm') { const y = b.y; b.y = y + b.h / 2; this.drawEnemy(b, game.time); b.y = y; this.light(b.x, y, b.state === 'hover' ? 26 : 40, b.type === 'heartroot' ? [255, 120, 110] : [170, 130, 255], 0.6); return; }
      const w = game.world, cx = this.cam.x, cy = this.cam.y;
      const EDGE = [40, 14, 12], CRACK = [255, 170, 80], FLASH = [255, 246, 236];
      const disc = (x, y, r, col, a, crack) => {
        const hi = [col[0] * 1.25, col[1] * 1.25, col[2] * 1.25], lo = [col[0] * 0.75, col[1] * 0.75, col[2] * 0.75], r2 = r * r, e2 = (r - 1.2) ** 2;   // shades made once, not for every cell
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const edge = d2 > e2;
          let c = edge ? EDGE : dy < -r * 0.35 ? hi : dy > r * 0.4 ? lo : col;
          if (crack && !edge && (dx + dy * 2 + 40) % 5 === 0) c = CRACK;
          if (b.flash > 0) c = FLASH;
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
      const key = e.kind === 'boss' ? e.type : e.kind, frames = ENEMY_ART[key], C = ENEMY_COL[key];
      const still = !e.flying && !e.anchored && Math.abs(e.vx || 0) < 5;   // walkers step only while moving
      const rows = frames.length > 1 && !still ? frames[Math.floor(time * (e.state === 'swoop' ? 18 : 8) + e.id) & 1] : frames[0];
      const W = rows[0].length, H = rows.length, flip = (e.anchored ? e.face : e.facing) < 0;
      const S = e.champion || e.boss ? 2 : 1;   // champions and the king are drawn at twice the size
      const lift = (e.kind === 'warden' && (e.state === 'windup' || e.state === 'throw') ? 1 : 0) - (e.kind === 'frog' && e.state === 'windup' ? 1 : 0);
      const ox = Math.round(e.x - this.cam.x) - ((W * S) >> 1), oy = Math.round(e.y - this.cam.y) - H * S - lift;
      const warn = (e.state === 'windup' || e.state === 'throw' || e.charging || (e.boss && e.state !== 'hover' && e.state !== 'idle')) ? 0.5 + 0.5 * Math.sin((e.t || time) * 40) : 0;
      const muddy = e.slowT > 0 || e.inMud;
      const a = e.ghost || e.state === 'fade' ? 0.45 : e.kind === 'wraith' ? 0.8 : 1; // a delver inside the ground shows faintly
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        let col = C[ch];
        if (e.shut && ch === 'o') col = [70, 30, 36];   // the Heartroot, closed
        if (ch === 'e') col = e.elite || e.champion ? [255, 200, 90] : warn ? [255, 170 + 85 * warn, 230] : col;
        if ((ch === 'o' || ch === 'w') && warn) col = col.map(v => Math.min(255, v + 60 * warn));
        if (ch === 'p' && warn) col = col.map(v => Math.min(255, v + 70 * warn));
        if (muddy && ch !== 'e' && ch !== 'k') col = [col[0] * 0.55 + 96 * 0.45, col[1] * 0.55 + 84 * 0.45, col[2] * 0.55 + 104 * 0.45];
        if (e.flash > 0) col = [255, 246, 236];
        if (S === 1) this.plot(ox + (flip ? W - 1 - x : x), oy + y, col[0] | 0, col[1] | 0, col[2] | 0, a);
        else for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) this.plot(ox + (flip ? W - 1 - x : x) * S + sx, oy + y * S + sy, col[0] | 0, col[1] | 0, col[2] | 0, a);
      }
      if (e.wetT > 0 && Math.random() < 0.3) this.plot(ox + Math.random() * W * S, oy + H * S, 120, 170, 255, 0.8);
      if (e.hp < e.maxHp && !e.champion && !e.boss) {
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

    // Things drawn behind (world.decor, v0.71): mine posts and lanterns. Each hangs from (or stands on) a cell;
    // when that cell is gone (burnt, blasted) it is not drawn. Posts only cover the back wall, never sand.
    drawDecor(game) {
      const W = game.world, D = W.decor; if (!D || !D.length) return;
      const buf = this.buf, kind = this.kind, VW = V.w, VH = V.h, cx = this.cam.x, cy = this.cam.y;
      for (const d of D) {
        if (d.hold && W.get(d.hold[0], d.hold[1]) !== M.WOOD) continue;
        if (d.kind === 'post') {
          const sx = d.x - cx; if (sx < -2 || sx > VW) continue;
          for (let y = Math.max(d.y0, cy); y <= Math.min(d.y1, cy + VH - 1); y++) for (let k = 0; k < 2; k++) {
            const vx = sx + k, o = (y - cy) * VW + vx; if (vx < 0 || vx >= VW || kind[o] !== 2) continue;
            const g = hash(d.x + k, y >> 2, 99) < 0.2 ? 0.8 : 1, r = k ? 74 : 96;
            buf[o] = pack(r * g | 0, (r * 0.68) * g | 0, (r * 0.44) * g | 0);
          }
        } else if (d.kind === 'column' || d.kind === 'banner') {
          const x0 = d.x - cx, top = d.kind === 'column' ? d.y0 : d.y0, bottom = d.kind === 'column' ? d.y1 : d.y0 + d.len;
          if (x0 > VW || x0 + (d.w || 7) < 0 || bottom < cy || top > cy + VH) continue;
          for (let y = Math.max(top, cy); y <= Math.min(bottom, cy + VH - 1); y++) {
            const vy = y - cy;
            if (d.kind === 'column') {
              const end = y - d.y0 < 3 && d.cap || d.y1 - y < 3, ww = end ? d.w + 2 : d.w, xs = end ? -1 : 0;
              for (let i = 0; i < ww; i++) {
                const vx = x0 + xs + i, o = vy * VW + vx; if (vx < 0 || vx >= VW || kind[o] !== 2) continue;
                const row = (y / 3) | 0, mortar = y % 3 === 0 || ((d.x + xs + i + (row & 1) * 3) % 6) === 0, edge = i === 0 || i === ww - 1;
                const v = mortar ? 0.62 : 0.86 + 0.14 * hash(d.x + i >> 1, row, 101), lit = edge ? 0.8 : 1;
                buf[o] = pack(108 * v * lit | 0, 100 * v * lit | 0, 112 * v * lit | 0);
              }
            } else {
              const fray = d.y0 + d.len - Math.floor(hash(d.seed, y, 102) * 0);
              for (let i = 0; i < 7; i++) {
                const vx = x0 + i, o = vy * VW + vx; if (vx < 0 || vx >= VW || kind[o] !== 2) continue;
                if (y > d.y0 + d.len - 1 - Math.floor(hash(d.seed + i, 0, 103) * 6)) continue;   // a torn bottom
                const c = d.col, sh = i === 0 || i === 6 ? 0.7 : 1, emb = (y - d.y0 === 6 || y - d.y0 === 7) && (i === 3) ? 1 : 0;
                buf[o] = emb ? pack(200, 166, 90) : pack(c[0] * sh | 0, c[1] * sh | 0, c[2] * sh | 0);
              }
            }
          }
        } else if (d.kind === 'lamp') {
          const sx = d.x - cx, sy = d.y - cy; if (sx < -3 || sy < -8 || sx > VW + 3 || sy > VH + 3) continue;
          if (d.hold) for (let y = d.hold[1] + 1 - cy; y < sy - 2; y++) if (y >= 0 && y < VH && sx >= 0 && sx < VW) { const o = y * VW + sx; buf[o] = pack(60, 54, 58); kind[o] = 0; }
          const T = ['.kkk.', 'kyoyk', 'koyok', 'kyoyk', '.kkk.'], C = { k: [44, 36, 34], y: [255, 214, 130], o: [255, 170, 80] };
          for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) { const ch = T[j][i]; if (ch === '.') continue; const vx = sx - 2 + i, vy = sy - 2 + j; if (vx < 0 || vy < 0 || vx >= VW || vy >= VH) continue; const o = vy * VW + vx, c = C[ch]; buf[o] = pack(c[0], c[1], c[2]); kind[o] = ch === 'k' ? 0 : 1; }
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

    // ---------- light (v0.66) ----------
    // The cave is lit cell by cell. Every light (the golem, fire, magma, embers, crystals, spells, loot, Lodestones)
    // is put on a coarse grid, one square for each 4 x 4 cells, with a margin round the screen so lights just off it
    // still reach in. The light then spreads out square by square, dimming at each step, and almost stops at rock:
    // it runs along tunnels and round corners but not through walls, and only the face of a wall catches it.
    // Each cell's colour is multiplied by the light where it is; burning and glowing cells keep their own colour,
    // and the back wall gets a little less. Drawing only: no rule depends on it.
    lightFrame(game) {
      const LS = 4, MG = 10, lw = Math.ceil(V.w / LS) + MG * 2 + 1, lh = Math.ceil(V.h / LS) + MG * 2 + 1, n = lw * lh;
      let L = this.L;
      let fresh = false;
      if (!L || L.lw !== lw || L.lh !== lh) { L = this.L = { lw, lh, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), t: new Float32Array(n) }; fresh = true; }
      // The grid is worked out every other frame (light changes slowly; the grid is fixed to the cave, not the
      // screen, so it still fits after the camera moves a little). The shading below runs every frame.
      this._lf = (this._lf + 1) & 1;
      if (fresh || this._lf || Math.abs(Math.floor(this.cam.x / LS) - MG - L.gx0) > 4 || Math.abs(Math.floor(this.cam.y / LS) - MG - L.gy0) > 4) this.lightGrid(game, L, LS, MG);
      this.shadeCells(game, L, LS);
    }
    lightGrid(game, L, LS, MG) {
      const lw = L.lw, lh = L.lh;
      const gx0 = Math.floor(this.cam.x / LS) - MG, gy0 = Math.floor(this.cam.y / LS) - MG;
      L.gx0 = gx0; L.gy0 = gy0;
      const { r: LR, g: LG, b: LB, t: T } = L, world = game.world, mat = world.mat, W = world.w, H = world.h, ST = KWorld.STATE;
      LR.fill(0); LG.fill(0); LB.fill(0);
      // how much light gets into each square: open cave 1, water 0.7, solid 0.4
      for (let gy = 0; gy < lh; gy++) for (let gx = 0; gx < lw; gx++) {
        const x0 = (gx0 + gx) * LS, y0 = (gy0 + gy) * LS;
        let open = 0;
        if (x0 >= 0 && y0 >= 0 && x0 + LS <= W && y0 + LS <= H) {
          for (let yy = 0; yy < LS; yy += 1) { const xx = (yy * 3 + 1) & 3;   // one cell in each row, staggered
            const m = mat[(y0 + yy) * W + x0 + xx], s = ST[m];
            open += s === 1 || s === 2 ? 0 : s === 3 ? 0.55 : 1;
          }
          open /= LS;
        }
        T[gy * lw + gx] = 0.55 + 0.45 * open;
      }
      const seed = (x, y, rad, cr, cg, cb, v) => {
        const fx = x / LS - gx0 - 0.5, fy = y / LS - gy0 - 0.5, rr = Math.max(0.6, rad / LS);
        const ax = Math.max(0, Math.floor(fx - rr)), bx = Math.min(lw - 1, Math.ceil(fx + rr)), ay = Math.max(0, Math.floor(fy - rr)), by = Math.min(lh - 1, Math.ceil(fy + rr));
        for (let gy = ay; gy <= by; gy++) for (let gx = ax; gx <= bx; gx++) {
          const dx = gx - fx, dy = gy - fy, d2 = dx * dx + dy * dy; if (d2 > (rr + 0.5) * (rr + 0.5)) continue;
          const d = Math.sqrt(d2);
          const k = v * Math.min(1, 1.25 - d / (rr + 0.5)), i = gy * lw + gx;
          LR[i] += cr * k; LG[i] += cg * k; LB[i] += cb * k;
        }
      };
      // the golems carry their own light, a little more the way they look
      for (const p of game.players) if (!p.dead) {
        seed(p.x, p.y - 8, 30, 1, 0.94, 0.86, 1.05);
        seed(p.x + Math.cos(p.aim) * 30, p.y - 8 + Math.sin(p.aim) * 30, 14, 1, 0.94, 0.86, 0.45);
      }
      // burning and glowing cells, from the counts drawCells made (one square of 8 x 8 cells each)
      const gw = this.gw;
      for (let gy = 0; gy < this.gh; gy++) for (let gx = 0; gx < gw; gx++) {
        const h = this.heat[gy * gw + gx], s = this.spark[gy * gw + gx], wx = this.cam.x + gx * 8 + 4, wy = this.cam.y + gy * 8 + 4;
        if (h > 0) seed(wx, wy, 6, 1, 0.52, 0.2, Math.min(2.2, 0.25 + h * 0.06));
        if (s > 0) seed(wx, wy, 6, 0.55, 0.78, 1, Math.min(1.4, 0.15 + s * 0.05));
      }
      // everything else that glows: the lights drawGlow asked for last frame
      const Q = this.lightsPrev;
      for (let k = 0; k < Q.length; k += 7) seed(Q[k], Q[k + 1], Q[k + 2] * 0.8, Q[k + 3] / 255, Q[k + 4] / 255, Q[k + 5] / 255, Q[k + 6] * 1.5);
      // spread: one sweep each way (down-right, then up-left), which reaches round one corner; a step of 4 cells costs 11.5% in the open
      const k1 = 0.885, k2 = 0.841;
      for (let pass = 0; pass < 1; pass++) {
        for (let gy = 1; gy < lh; gy++) for (let gx = 1, i = gy * lw + 1; gx < lw - 1; gx++, i++) {
          const t = T[i], a = t * k1, d = t * k2, u = i - lw;
          let v = LR[i], c;
          if ((c = LR[i - 1] * a) > v) v = c; if ((c = LR[u] * a) > v) v = c; if ((c = LR[u - 1] * d) > v) v = c; if ((c = LR[u + 1] * d) > v) v = c; LR[i] = v;
          v = LG[i]; if ((c = LG[i - 1] * a) > v) v = c; if ((c = LG[u] * a) > v) v = c; if ((c = LG[u - 1] * d) > v) v = c; if ((c = LG[u + 1] * d) > v) v = c; LG[i] = v;
          v = LB[i]; if ((c = LB[i - 1] * a) > v) v = c; if ((c = LB[u] * a) > v) v = c; if ((c = LB[u - 1] * d) > v) v = c; if ((c = LB[u + 1] * d) > v) v = c; LB[i] = v;
        }
        for (let gy = lh - 2; gy >= 0; gy--) for (let gx = lw - 2, i = gy * lw + gx; gx >= 1; gx--, i--) {
          const t = T[i], a = t * k1, d = t * k2, u = i + lw;
          let v = LR[i], c;
          if ((c = LR[i + 1] * a) > v) v = c; if ((c = LR[u] * a) > v) v = c; if ((c = LR[u - 1] * d) > v) v = c; if ((c = LR[u + 1] * d) > v) v = c; LR[i] = v;
          v = LG[i]; if ((c = LG[i + 1] * a) > v) v = c; if ((c = LG[u] * a) > v) v = c; if ((c = LG[u - 1] * d) > v) v = c; if ((c = LG[u + 1] * d) > v) v = c; LG[i] = v;
          v = LB[i]; if ((c = LB[i + 1] * a) > v) v = c; if ((c = LB[u] * a) > v) v = c; if ((c = LB[u - 1] * d) > v) v = c; if ((c = LB[u + 1] * d) > v) v = c; LB[i] = v;
        }
      }
      // the region's own dim light, everywhere
      const me = game.players[game.me || 0], B = world.biomes[world.biomeAt(me.x, me.y - 8)];
      const amb = Math.max(0.2, Math.min(0.46, 0.08 + (1 - (B.dark == null ? 0.6 : B.dark)) * 0.75));
      this.amb += (amb - this.amb) * 0.1;
    }
    shadeCells(game, L, LS) {
      const lw = L.lw, gx0 = L.gx0, gy0 = L.gy0, LR = L.r, LG = L.g, LB = L.b;
      // shade: the grid's light is spread smoothly between square centres, a row at a time, in whole numbers (256 = 1)
      const buf = this.buf, kind = this.kind, VW = V.w, hr = this.hrow || (this.hrow = new Int32Array(6 * 2048));
      const A = (this.amb * 256) | 0, Ab = (this.amb * 287) | 0, CAP = 400;
      const gxs = this.gxs || (this.gxs = new Int32Array(2048)), gxf = this.gxf || (this.gxf = new Int32Array(2048));
      for (let vx = 0; vx < VW; vx++) { const q = (vx + this.cam.x) / LS - gx0 - 0.5, gi = Math.floor(q); gxs[vx] = gi; gxf[vx] = ((q - gi) * 256) | 0; }
      let rowA = -1;
      for (let vy = 0; vy < V.h; vy++) {
        const u = (vy + this.cam.y) / LS - gy0 - 0.5, j = Math.floor(u), f = ((u - j) * 256) | 0;
        if (j !== rowA) {
          rowA = j;
          for (let h2 = 0; h2 < 2; h2++) {
            const base = (j + h2) * lw, off = h2 * 6144;
            for (let vx = 0; vx < VW; vx++) {
              const i0 = base + gxs[vx], e = gxf[vx] / 256;
              hr[off + vx] = ((LR[i0] + (LR[i0 + 1] - LR[i0]) * e) * 256) | 0;
              hr[off + 2048 + vx] = ((LG[i0] + (LG[i0 + 1] - LG[i0]) * e) * 256) | 0;
              hr[off + 4096 + vx] = ((LB[i0] + (LB[i0 + 1] - LB[i0]) * e) * 256) | 0;
            }
          }
        }
        // the light is worked out for every second cell and used for both (it changes over 4-cell squares, so this does not show)
        const sa = this.span[vy * 2] & ~1, sb = this.span[vy * 2 + 1];
        for (let vx = sa, o = vy * VW + sa; vx < sb; vx += 2, o += 2) {
          const r0 = hr[vx], g0 = hr[2048 + vx], b0 = hr[4096 + vx];
          const LR0 = A + r0 + (((hr[6144 + vx] - r0) * f) >> 8), LG0 = A + g0 + (((hr[8192 + vx] - g0) * f) >> 8), LB0 = Ab + b0 + (((hr[10240 + vx] - b0) * f) >> 8);
          for (let q = 0; q < 2 && vx + q < VW; q++) {
            const oo = o + q, kd = kind[oo];
            let lr = LR0, lg = LG0, lb = LB0;
            if (kd === 1) { lr = 256; lg = 256; lb = 256; }   // burning and glowing cells show their own colour
            else if (kd === 2) { lr = (lr * 205) >> 8; lg = (lg * 205) >> 8; lb = (lb * 205) >> 8; }
            else if (kd === 3) { if (lr > 256) lr = 256; if (lg > 256) lg = 256; if (lb > 256) lb = 256; }   // steam takes the light but never shines white
            if (lr > CAP) lr = CAP; if (lg > CAP) lg = CAP; if (lb > CAP) lb = CAP;
            const c = buf[oo];
            let r = ((c & 255) * lr) >> 8, g = (((c >> 8) & 255) * lg) >> 8, b = (((c >> 16) & 255) * lb) >> 8;
            if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
            buf[oo] = 0xff000000 | (b << 16) | (g << 8) | r;
          }
        }
      }
    }

    // ---------- the cave's own small movements (v0.66) ----------
    // Dust drifting in the light, embers and smoke rising off fire, drips from the roof under water, glints on
    // crystal, bubbles on acid, and sparks from every blast. Drawing only, with the browser's own dice: two
    // players in co-op see different dust, and that is fine.
    ambient(game, realDt) {
      const dt = Math.max(0, Math.min(0.05, realDt != null ? realDt : game.time - (this._lt ?? game.time))); this._lt = game.time;
      const P = this.motes, world = game.world, mat = world.mat, W = world.w, cam = this.cam, rnd = Math.random;
      const add = (x, y, vx, vy, T, kind, c) => { if (P.length < 900) P.push({ x, y, vx, vy, t: 0, T, kind, c }); };
      if (dt > 0) {
        // dust in the open, never many
        let dust = 0; for (const q of P) if (q.kind === 0) dust++;
        for (let k = 0; k < 3 && dust < 90; k++) {
          const x = cam.x + rnd() * V.w, y = cam.y + rnd() * V.h;
          if (mat[(y | 0) * W + (x | 0)] === M.EMPTY) { add(x, y, (rnd() - 0.5) * 4, (rnd() - 0.5) * 3, 5 + rnd() * 6, 0, null); dust++; }
        }
        // embers and smoke over fire
        const gw = this.gw;
        for (let gy = 0; gy < this.gh; gy++) for (let gx = 0; gx < gw; gx++) {
          const h = this.heat[gy * gw + gx]; if (h <= 0) continue;
          const x = cam.x + gx * 8 + rnd() * 8, y = cam.y + gy * 8 + rnd() * 8;
          if (rnd() < Math.min(0.6, h * 0.03)) add(x, y, (rnd() - 0.5) * 14, -18 - rnd() * 36, 0.5 + rnd() * 1.1, 1, null);
          if (rnd() < Math.min(0.25, h * 0.008)) add(x, y - 2, (rnd() - 0.5) * 6, -8 - rnd() * 8, 2 + rnd() * 2, 2, null);
          const s = this.spark[gy * gw + gx];
          if (s > 0 && rnd() < Math.min(0.3, s * 0.02)) add(x, y, 0, 0, 0.35, 3, null);
        }
        // look at a few cells: drips under water and wet roofs, bubbles on acid
        for (let k = 0; k < 90; k++) {
          const x = (cam.x + rnd() * V.w) | 0, y = (cam.y + rnd() * V.h) | 0, i = y * W + x, m = mat[i];
          if (mat[i + W] !== M.EMPTY) continue;
          if ((m === M.WATER && rnd() < 0.05) || ((m === M.MOSS || m === M.MUD) && rnd() < 0.004)) add(x + 0.5, y + 1, 0, 0, 3, 4, m === M.WATER ? [110, 160, 255] : [90, 120, 150]);
        }
        for (let k = 0; k < 40; k++) {
          const x = (cam.x + rnd() * V.w) | 0, y = (cam.y + rnd() * V.h) | 0, i = y * W + x;
          if (mat[i] === M.ACID && mat[i - W] === M.EMPTY && rnd() < 0.3) add(x + 0.5, y - 1, (rnd() - 0.5) * 4, -6 - rnd() * 8, 0.6 + rnd() * 0.6, 5, null);
          else if (mat[i] === M.MAGMA && mat[i - W] === M.EMPTY && rnd() < 0.15) add(x + 0.5, y - 1, (rnd() - 0.5) * 20, -25 - rnd() * 40, 0.6 + rnd() * 0.8, 1, null);
        }
        // spells in flight leave a trail: embers behind fire, grit behind stone
        for (const pr of game.projectiles) {
          if (pr.kind === 'fireball') for (let s = 0; s < 2; s++) add(pr.x + (rnd() - 0.5) * 3, pr.y + (rnd() - 0.5) * 3, -pr.vx * 0.08 + (rnd() - 0.5) * 16, -pr.vy * 0.08 + (rnd() - 0.5) * 16 - 8, 0.25 + rnd() * 0.4, 1, null);
          else if ((pr.kind === 'spear' || pr.kind === 'boulder' || pr.kind === 'stone') && rnd() < 0.7) add(pr.x, pr.y, (rnd() - 0.5) * 10, (rnd() - 0.5) * 6, 0.5 + rnd() * 0.5, 7, null);
          else if (pr.kind === 'blob' && rnd() < 0.6) add(pr.x, pr.y, (rnd() - 0.5) * 12, (rnd() - 0.5) * 12, 0.3 + rnd() * 0.3, 1, null);
        }
        // lightning crackles where it strikes
        for (const f of game.fx) if (f.kind === 'bolt' && !this.seenFx.has(f) && f.pts && f.pts.length) {
          this.seenFx.add(f);
          const e = f.pts[f.pts.length - 1];
          for (let k = 0; k < 14; k++) { const an = rnd() * Math.PI * 2, sp = 40 + rnd() * 120; add(e.x, e.y, Math.cos(an) * sp, Math.sin(an) * sp, 0.15 + rnd() * 0.35, 8, null); }
        }
        // every blast throws sparks and a puff of smoke, once
        for (const f of game.fx) if (f.kind === 'flash' && !this.seenFx.has(f)) {
          this.seenFx.add(f);
          const nn = Math.min(40, 8 + f.r * 1.2);
          for (let k = 0; k < nn; k++) { const an = rnd() * Math.PI * 2, sp = 30 + rnd() * 110; add(f.x, f.y, Math.cos(an) * sp, Math.sin(an) * sp - 20, 0.3 + rnd() * 0.7, 1, null); }
          for (let k = 0; k < nn / 3; k++) add(f.x + (rnd() - 0.5) * f.r, f.y + (rnd() - 0.5) * f.r, (rnd() - 0.5) * 10, -6 - rnd() * 10, 1.5 + rnd() * 2, 2, null);
        }
      }
      // move
      for (let k = P.length - 1; k >= 0; k--) {
        const q = P[k]; q.t += dt;
        if (q.t >= q.T) { P[k] = P[P.length - 1]; P.pop(); continue; }
        if (q.kind === 0) { q.vx += (rnd() - 0.5) * 6 * dt; q.vy += (rnd() - 0.5) * 6 * dt; }
        else if (q.kind === 1) { q.vy += 30 * dt; q.vx += Math.sin(q.t * 9 + q.x) * 30 * dt; }
        else if (q.kind === 7) q.vy += 60 * dt;
        else if (q.kind === 8) { q.vx *= 0.9; q.vy *= 0.9; }
        else if (q.kind === 4) q.vy += 260 * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
        const c = mat[(q.y | 0) * W + (q.x | 0)];
        if ((q.kind === 1 || q.kind === 4) && c !== M.EMPTY && c !== M.GAS && c !== M.STEAM && c !== M.FIRE) {
          if (q.kind === 4) for (let s = 0; s < 2; s++) add(q.x, q.y - 1, (rnd() - 0.5) * 30, -20 - rnd() * 20, 0.25, 6, q.c);
          P[k] = P[P.length - 1]; P.pop();
        }
      }
    }
    // lit is false for what the light should fall on (dust, drips), true for what glows by itself (embers, glints)
    drawMotes(lit) {
      const P = this.motes;
      for (const q of P) {
        const glow = q.kind === 1 || q.kind === 3 || q.kind === 5 || q.kind === 8;
        if (glow !== lit && !(lit && q.kind === 2)) continue;
        const x = q.x - this.cam.x, y = q.y - this.cam.y, a = q.t / q.T;
        if (q.kind === 0) { const f = Math.min(1, Math.min(q.t, q.T - q.t) / 1.5); this.plot(x, y, 220, 214, 236, 0.55 * f); }
        else if (q.kind === 1) { const r = 255, g = 230 - a * 170, b = 140 - a * 120; this.plot(x, y, r, clamp(g), clamp(b), 1 - a * 0.5); }
        else if (q.kind === 2) { const s = a < 0.5 ? 1 : 2; for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) this.plot(x + xx, y + yy, 46, 42, 52, 0.28 * (1 - a)); }
        else if (q.kind === 3) { const f = 1 - Math.abs(a * 2 - 1); this.plot(x, y, 235, 255, 252, f); this.plot(x + 1, y, 160, 240, 235, f * 0.5); this.plot(x - 1, y, 160, 240, 235, f * 0.5); this.plot(x, y - 1, 160, 240, 235, f * 0.5); this.plot(x, y + 1, 160, 240, 235, f * 0.5); }
        else if (q.kind === 4 || q.kind === 6) this.plot(x, y, q.c[0], q.c[1], q.c[2], 0.9);
        else if (q.kind === 5) this.plot(x, y, 200, 255, 140, 1 - a);
        else if (q.kind === 7) this.plot(x, y, 170, 160, 150, 0.8 * (1 - a));
        else if (q.kind === 8) this.plot(x, y, 220 + 35 * (1 - a), 235, 255, 1 - a * 0.6);
      }
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
        if (h > 0) this.light(wx, wy, 10 + Math.min(10, h * 0.3), [255, 120, 50], 0.1 + Math.min(0.28, h / 60), true);   // these light the cave through lightFrame's own counts
        if (s > 0) this.light(wx, wy, 9 + Math.min(10, s * 0.3), [140, 190, 255], 0.1 + Math.min(0.4, s / 50), true);
      }
      for (const L of game.loot) this.light(L.x, L.y - 2, 9, KData.runes.tiers[L.rune.tier].color, 0.55);
      for (const d of game.world.decor || []) if (d.kind === 'lamp' && (!d.hold || game.world.get(d.hold[0], d.hold[1]) === M.WOOD)) this.light(d.x, d.y, 22, [255, 186, 110], 0.55 + 0.05 * Math.sin(game.time * 7 + d.x));
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
        const col = e.elite ? [255, 200, 90] : e.kind === 'spitter' ? [255, 140, 50] : e.kind === 'moth' ? [222, 196, 244] : e.kind === 'wisp' ? [150, 190, 255] : e.kind === 'imp' ? [255, 150, 50] : [255, 70, 160];
        const hot = e.state === 'windup' || (e.kind === 'spitter' && e.charging) || e.state === 'swoop';
        const ex = e.x + (e.kind === 'spitter' ? e.face : e.facing) * (e.w / 2 - 1), ey = e.y - e.h * 0.6;
        this.light(ex, ey, hot ? 14 : e.kind === 'moth' || e.kind === 'wisp' ? 10 : 6, col, (hot ? 0.75 : 0.35) * (e.ghost ? 0.4 : 1));
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
