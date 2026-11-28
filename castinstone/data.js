'use strict';
/* Cast in Stone — data.js
   Every material, element and spell is described here as data. The rest of the
   game reads these tables; adding a material or element should mostly mean
   adding entries here (plus a spell "kind" in game.js only if it needs a new
   behaviour). Numbers are in world cells and seconds unless noted. */

const KData = (() => {
  // ---------- Materials ----------
  // state: 'empty' | 'static' (never moves) | 'powder' (falls, piles) |
  //        'liquid' (falls, spreads) | 'gas' (rises) | 'fire'
  // solid: actors collide with it. hard: explosions and digging cannot remove it.
  // density: heavier sinks through lighter (only between moving states).
  // colors: [r,g,b] variants picked per cell for texture.
  const M = {
    EMPTY: 0, ROCK: 1, DIRT: 2, EARTH: 3, WATER: 4, STEAM: 5, FIRE: 6, MUD: 7, MAGMA: 8, MOSS: 9, CRYSTAL: 10,
    WOOD: 11, OIL: 12, GAS: 13, ICE: 14, COAL: 15, EMBER: 16, ACID: 17,   // v0.64
    BRICK: 18,   // v0.67
  };

  const materials = [];
  materials[M.EMPTY] = { name: 'Empty', state: 'empty', density: 0 };
  materials[M.ROCK]  = { desc: 'Unbreakable.', name: 'Rock', state: 'static', solid: true, hard: true, density: 99,
    colors: [[42, 48, 74], [50, 58, 88]] };  // drawn as faceted slate by position (render.js)
  materials[M.DIRT]  = { desc: 'Solid. Spells can break it.', name: 'Dirt', state: 'static', solid: true, density: 99,
    colors: [[132, 84, 100], [142, 92, 96]] };  // drawn as layered strata by position (render.js)
  materials[M.EARTH] = { desc: 'Falls and piles up. Turns to mud in water.', name: 'Loose earth', state: 'powder', solid: true, density: 6, slide: 0.9,
    colors: [[184, 140, 128], [172, 128, 118], [194, 152, 136], [178, 134, 124]] };
  materials[M.WATER] = { desc: 'Flows and pools. Lightning electrifies it.', name: 'Water', state: 'liquid', density: 3, flow: 5, conducts: true, alpha: 0.78,
    colors: [[44, 86, 196], [48, 92, 204], [40, 80, 188]] };
  materials[M.STEAM] = { desc: 'Rises and blocks the view, then fades.', name: 'Steam', state: 'gas', density: 1, life: [90, 170], condense: 0.06,
    colors: [[204, 206, 230], [218, 218, 238], [190, 192, 220]] };
  materials[M.FIRE]  = { desc: 'Burns whatever touches it. Spreads to lichen.', name: 'Fire', state: 'fire', density: 0.5, life: [14, 34], glow: true, burns: 22,
    colors: [[255, 214, 120], [255, 150, 52], [232, 84, 30], [150, 40, 20]] };
  materials[M.MUD]   = { desc: 'Slows anything inside it. Fire bakes it into dirt.', name: 'Mud', state: 'powder', density: 5, slide: 0.25, moveChance: 0.45, slows: 0.38,
    colors: [[96, 84, 104], [88, 76, 96], [104, 92, 112], [92, 80, 100]] };
  materials[M.MAGMA] = { desc: 'Burns on touch. Cools into dirt.', name: 'Magma', state: 'liquid', density: 7, flow: 1, moveChance: 0.35, glow: true,
    burns: 45, life: [200, 255], coolsTo: M.DIRT,
    colors: [[255, 120, 40], [255, 168, 64], [236, 84, 28], [255, 196, 96]] };
  materials[M.MOSS]  = { desc: 'Solid, and burns easily.', name: 'Lichen', state: 'static', solid: true, flammable: true, density: 99,
    colors: [[118, 168, 146], [104, 154, 134], [132, 182, 156], [110, 160, 140]] };

  materials[M.CRYSTAL] = { desc: 'Break it with any digging spell: its shards fly to you. Spend shards at a Lodestone.', name: 'Crystal vein', state: 'static', solid: true, density: 99, glow: true,
    colors: [[96, 224, 214], [130, 240, 228], [80, 200, 196], [170, 250, 240]] };

  // v0.64: things to burn, melt, dissolve and set off.
  materials[M.WOOD] = { desc: 'Props, posts and planks. Blocks the way, cannot be dug by hand, burns, and blasts break it.', name: 'Wood', state: 'static', solid: true, flammable: true, density: 99,
    colors: [[122, 84, 52], [136, 96, 60], [108, 74, 46], [146, 104, 66]] };
  materials[M.OIL] = { desc: 'Floats on water. Catches at once and burns for a long time.', name: 'Oil', state: 'liquid', density: 2, flow: 3, alpha: 0.9,
    colors: [[58, 40, 50], [74, 52, 56], [48, 34, 46]] };
  materials[M.GAS] = { desc: 'Collects under roofs and in sealed pockets. A flame sets it off.', name: 'Marsh gas', state: 'gas', density: 0.6, life: [255, 255],
    colors: [[150, 190, 110], [136, 176, 100], [164, 200, 122]] };
  materials[M.ICE] = { desc: 'Solid. Fire and magma melt it into water.', name: 'Ice', state: 'static', solid: true, density: 99,
    colors: [[170, 214, 240], [190, 228, 248], [150, 198, 230], [208, 238, 252]] };
  materials[M.COAL] = { desc: 'Solid. Fire sets it smouldering, and it burns for a long time.', name: 'Coal', state: 'static', solid: true, density: 99,
    colors: [[46, 44, 58], [60, 56, 72], [38, 36, 48], [86, 82, 104]] };
  materials[M.EMBER] = { desc: 'Burning coal or wood. Burns on touch, lights what is beside it, and goes out in water.', name: 'Ember', state: 'static', solid: true, density: 99, glow: true, life: [170, 254],
    colors: [[255, 150, 60], [236, 96, 36], [255, 190, 90], [200, 70, 30]] };
  materials[M.ACID] = { desc: 'Eats dirt, earth, wood and lichen, and burns on touch. Water thins it away.', name: 'Acid', state: 'liquid', density: 4, flow: 4, glow: true, alpha: 0.85,
    colors: [[150, 232, 60], [170, 244, 80], [130, 214, 50]] };

  materials[M.BRICK] = { desc: 'Old masonry. Hands cannot dig it; blasts and digging spells break it.', name: 'Brick', state: 'static', solid: true, density: 99,
    colors: [[150, 136, 114], [138, 124, 104], [162, 148, 122], [126, 114, 98]] };

  // ---------- Reactions ----------
  // When a cell of material a touches b, with this chance per tick, a becomes ra
  // and b becomes rb. Checked in both orders, so list each pair once.
  const reactions = [
    { a: M.FIRE,  b: M.WATER, chance: 0.7,  ra: M.EMPTY, rb: M.STEAM },  // fire boils water
    // v1.01: the water always boils off; the magma it touched cools only some of the time (keepA), so a splash hisses away and
    // it takes a good deal of water to crust a pool over. Under standing water the crust then thickens (world.js chill).
    { a: M.MAGMA, b: M.WATER, chance: 0.5,  ra: M.DIRT,  rb: M.STEAM, keepA: 0.6 },  // magma quenched
    { a: M.FIRE,  b: M.MOSS,  chance: 0.06, ra: M.FIRE,  rb: M.FIRE  },  // moss catches
    { a: M.MAGMA, b: M.MOSS,  chance: 0.2,  ra: M.MAGMA, rb: M.FIRE  },
    { a: M.FIRE,  b: M.MUD,   chance: 0.04, ra: M.FIRE,  rb: M.DIRT  },  // fire bakes mud
    { a: M.MAGMA, b: M.MUD,   chance: 0.08, ra: M.MAGMA, rb: M.DIRT  },
    { a: M.WATER, b: M.EARTH, chance: 0.01, ra: M.EMPTY, rb: M.MUD   },  // earth soaks
    // wood catches and burns down as embers; oil and gas burn; `blast` is the chance that a cell catching also goes off with a bang (world.blasts)
    { a: M.FIRE,  b: M.WOOD,  chance: 0.12, ra: M.FIRE,  rb: M.EMBER },
    { a: M.MAGMA, b: M.WOOD,  chance: 0.2,  ra: M.MAGMA, rb: M.EMBER },
    { a: M.EMBER, b: M.WOOD,  chance: 0.05, ra: M.EMBER, rb: M.EMBER },
    { a: M.FIRE,  b: M.OIL,   chance: 0.45, ra: M.FIRE,  rb: M.FIRE  },
    { a: M.MAGMA, b: M.OIL,   chance: 0.6,  ra: M.MAGMA, rb: M.FIRE  },
    { a: M.EMBER, b: M.OIL,   chance: 0.4,  ra: M.EMBER, rb: M.FIRE  },
    { a: M.FIRE,  b: M.GAS,   chance: 0.9,  ra: M.FIRE,  rb: M.FIRE, blast: 0.05 },
    { a: M.MAGMA, b: M.GAS,   chance: 0.9,  ra: M.MAGMA, rb: M.FIRE, blast: 0.05 },
    { a: M.EMBER, b: M.GAS,   chance: 0.9,  ra: M.EMBER, rb: M.FIRE, blast: 0.05 },
    // coal smoulders: it catches slowly, passes it on, throws up flame, and water puts it out
    { a: M.FIRE,  b: M.COAL,  chance: 0.07, ra: M.FIRE,  rb: M.EMBER },
    { a: M.MAGMA, b: M.COAL,  chance: 0.12, ra: M.MAGMA, rb: M.EMBER },
    { a: M.EMBER, b: M.COAL,  chance: 0.012, ra: M.EMBER, rb: M.EMBER },
    { a: M.EMBER, b: M.EMPTY, chance: 0.03, ra: M.EMBER, rb: M.FIRE  },
    { a: M.EMBER, b: M.WATER, chance: 0.5,  ra: M.COAL,  rb: M.STEAM },
    { a: M.EMBER, b: M.MOSS,  chance: 0.1,  ra: M.EMBER, rb: M.FIRE  },
    // ice melts
    { a: M.FIRE,  b: M.ICE,   chance: 0.25, ra: M.EMPTY, rb: M.WATER },
    { a: M.MAGMA, b: M.ICE,   chance: 0.4,  ra: M.MAGMA, rb: M.WATER },
    { a: M.EMBER, b: M.ICE,   chance: 0.2,  ra: M.EMBER, rb: M.WATER },
    { a: M.STEAM, b: M.ICE,   chance: 0.03, ra: M.WATER, rb: M.WATER },
    // acid eats what it touches, a cell for a cell, and water thins it
    { a: M.ACID,  b: M.DIRT,  chance: 0.06, ra: M.EMPTY, rb: M.EMPTY },
    { a: M.ACID,  b: M.EARTH, chance: 0.06, ra: M.EMPTY, rb: M.EMPTY },
    { a: M.ACID,  b: M.WOOD,  chance: 0.06, ra: M.EMPTY, rb: M.EMPTY },
    { a: M.ACID,  b: M.MOSS,  chance: 0.12, ra: M.EMPTY, rb: M.EMPTY },
    { a: M.ACID,  b: M.MUD,   chance: 0.06, ra: M.EMPTY, rb: M.EMPTY },
    { a: M.ACID,  b: M.WATER, chance: 0.03, ra: M.WATER, rb: M.WATER },
    { a: M.ACID,  b: M.FIRE,  chance: 0.3,  ra: M.STEAM, rb: M.EMPTY },
  ];

  // ---------- Elements ----------
  // key: keyboard keys. pad: standard gamepad button index (colours match an
  // Xbox-style pad: A green-ish earth, B red fire, X blue water, Y yellow lightning).
  const elements = {
    fire:      { name: 'Fire',      color: [255, 122, 47],  css: '#ff7a2f', keys: ['KeyQ', 'Digit1'], label: 'Q', pad: 1 },
    water:     { name: 'Water',     color: [63, 169, 255],  css: '#3fa9ff', keys: ['KeyW', 'Digit2'], label: 'W', pad: 2 },
    earth:     { name: 'Earth',     color: [200, 154, 74],  css: '#c89a4a', keys: ['KeyS', 'Digit3'], label: 'S', pad: 0 },
    lightning: { name: 'Lightning', color: [255, 242, 122], css: '#fff27a', keys: ['KeyE', 'Digit4'], label: 'E', pad: 3 },
  };
  const elementOrder = ['fire', 'water', 'earth', 'lightning'];

  // ---------- Spells ----------
  // Each pair of elements (keyed by the two names in alphabetical order,
  // "fire+water") gives three spells:
  //   shot  (left click)  aimed at the cursor
  //   burst (right click) an area around you
  //   lift  (hold Space in the air) carries you up or across; each pair
  //         lifts differently: thrust (fire), slow and cheap (water),
  //         steps you build (earth), hops and glides (lightning)
  //   move  (Shift: tap, or hold for held moves) moves you; A/D steer
  // kind: the behaviour in game.js. cd: seconds before that spell again.
  // cost: mana per cast. drain/min: held spells use mana per second and need
  // min to start. power: base damage before stats (game.js damage()).
  // dir (moves): direction when no direction key is held: up, down or facing.
  const spells = {
    'fire+fire': {
      shot: { name: 'Fireball', kind: 'projectile', cd: 0.5, cost: 14, desc: 'Explodes, carves dirt and starts fires.',
        speed: 230, gravity: 70, radius: 7, power: 34, knock: 210, ignite: 0.55, color: [255, 150, 52] },
      burst: { name: 'Fire nova', kind: 'nova', cd: 0.4, cost: 20, desc: 'A ring of flame bursts out around you.',
        radius: 24, power: 34, knock: 220, color: [255, 150, 60] },
      lift: { name: 'Flame jet', kind: 'lthrust', drain: 22, min: 6, desc: 'Fire roars from your feet and drives you up fast, burning anything below you. Strong, but uses mana quickly.',
        accel: 850, maxSpeed: 125, sideSpeed: 85, sideAccel: 600, emit: 'FIRE', power: 22, reach: 34 },
      move: { name: 'Flame dash', kind: 'dash', cd: 0.35, cost: 18, dir: 'facing', desc: 'Dash the way you press (A or D), or the way you face, leaving a trail of fire.',
        speed: 290, time: 0.13, waterTime: 0.13, power: 18, trail: 'FIRE' },
    },
    'water+water': {
      shot: { name: 'Water jet', kind: 'jet', cd: 0.25, drain: 14, min: 5, desc: 'Hold to spray water. Pushes things and fills hollows.',
        speed: 210, spread: 0.12, perTick: 3, push: 0.008, recoil: 70, power: 22 },
      burst: { name: 'Tidal wave', kind: 'wave', cd: 0.4, cost: 18, desc: 'Water surges out both sides and shoves enemies away.',
        reach: 42, power: 16, knock: 320, count: 56 },
      lift: { name: 'Water jet', kind: 'lhover', drain: 8, min: 4, desc: 'Rise slowly on jets of water. The slowest lift, but the cheapest: it lasts a long time. Soaks anything below you.',
        rise: 48, sideSpeed: 70, perTick: 2 },
      move: { name: 'Surf', kind: 'dash', cd: 0.4, cost: 16, dir: 'facing', desc: 'Ride a rush of water the way you press (A or D), or the way you face, soaking whatever you hit.',
        speed: 230, time: 0.24, waterTime: 0.3, power: 8, trail: 'WATER' },
    },
    'earth+earth': {
      shot: { name: 'Boulder', kind: 'boulder', cd: 0.7, cost: 16, desc: 'A heavy lobbed rock. Big knockback, leaves rubble.',
        speed: 200, gravity: 380, power: 44, knock: 300, dig: 8, rubble: 10 },
      burst: { name: 'Stone shell', kind: 'shell', cd: 0.5, cost: 16, desc: 'A ring of dirt rises around you: instant cover.',
        radius: 14, thick: 2, knock: 140 },
      lift: { name: 'Earth spray', kind: 'lhover', drain: 11, min: 5, desc: 'A spray of loose earth from your feet lifts you steadily. Faster than water and dearer; the earth lands below you and stays as a heap.',
        rise: 62, sideSpeed: 62, perTick: 2, emit: 'EARTH' },
      move: { name: 'Shoulder charge', kind: 'dash', cd: 0.5, cost: 20, dir: 'facing', desc: 'Charge the way you press (A or D), or the way you face, smashing through dirt and hitting hard.',
        speed: 220, time: 0.22, waterTime: 0.22, power: 30, dig: 8 },
    },
    'lightning+lightning': {
      shot: { name: 'Bolt', kind: 'bolt', cd: 0.55, cost: 14, desc: 'An instant bolt. Electrifies any water it touches.',
        range: 170, power: 27, knock: 90, chains: 1, chainRange: 16, charge: 70, chargeCells: 2200, color: [255, 246, 170] },
      burst: { name: 'Shock field', kind: 'field', cd: 0.4, cost: 20, desc: 'Shocks everything near you.',
        radius: 34, power: 34, knock: 80, charge: 60, color: [255, 246, 170] },
      lift: { name: 'Spark hops', kind: 'lhops', cost: 14, desc: 'Leap again off a crack of lightning, up to three times before you land. Each hop is quick and shocks whatever is under you.',
        jump: 160, side: 125, hops: 3, power: 14, radius: 14 },
      move: { name: 'Blink', kind: 'blink', cd: 0.5, cost: 20, dir: 'facing', desc: 'Jump through space the way you press (A or D), or the way you face.',
        dist: 36 },
    },
    'fire+water': {
      shot: { name: 'Scald', kind: 'cone', cd: 0.2, drain: 20, min: 5, desc: 'Hold: a short cone of scalding steam.',
        range: 34, spread: 0.45, power: 40, perTick: 3 },
      burst: { name: 'Steam cloud', kind: 'cloud', cd: 0.4, cost: 16, desc: 'A thick cloud to hide in. Scalds anyone inside.',
        radius: 24, power: 20, fill: 0.6 },
      lift: { name: 'Steam flight', kind: 'lthrust', drain: 16, min: 6, desc: 'Steam blasts straight down: the strongest, fastest lift. Steer with A and D.',
        accel: 1000, maxSpeed: 155, sideSpeed: 95, sideAccel: 700, emit: 'STEAM' },
      move: { name: 'Vanish', kind: 'dash', cd: 0.45, cost: 18, dir: 'facing', desc: 'Dash the way you press (A or D), or the way you face, in a burst of steam that leaves a cloud to hide in.',
        speed: 300, time: 0.12, waterTime: 0.12, power: 10, trail: 'STEAM', cloud: 16 },
    },
    'earth+fire': {
      shot: { name: 'Magma', kind: 'lob', cd: 0.7, cost: 16, desc: 'A lobbed blob of magma. Burns, then cools into dirt.',
        speed: 175, gravity: 380, count: 38, mat: 'MAGMA', power: 15, color: [255, 140, 50] },
      burst: { name: 'Eruption', kind: 'eruption', cd: 0.45, cost: 22, desc: 'Magma bursts out of the ground around you.',
        reach: 28, power: 32, knock: 260, count: 40 },
      lift: { name: 'Cinder spray', kind: 'lhover', drain: 15, min: 6, desc: 'Earth spray, glowing hot: it lifts you faster and burns whatever is under you.',
        rise: 80, sideSpeed: 66, perTick: 2, emit: 'EARTH', hot: true, power: 30, reach: 40 },
      move: { name: 'Magma slam', kind: 'slam', cd: 0.6, cost: 22, dir: 'down', desc: 'Dive and smash down, splashing magma.',
        speed: 360, radius: 20, power: 30, knock: 240, count: 26 },
    },
    'earth+water': {
      shot: { name: 'Mud', kind: 'spray', cd: 0.6, cost: 12, desc: 'A spray of mud. Anything it hits, or that walks through it, is slowed.',
        speed: 220, spread: 0.28, count: 50, gravity: 220, mat: 'MUD' },
      burst: { name: 'Mire', kind: 'mire', cd: 0.5, cost: 16, desc: 'The ground around you turns to mud.',
        radius: 32, depth: 2 },
      lift: { name: 'Mud tower', kind: 'lcolumn', drain: 9, min: 4, desc: 'A column of packed mud grows under you and carries you up. Slow, but it stays as a pillar you can stand on.',
        rise: 50, width: 9 },
      move: { name: 'Wall climb', kind: 'climb', drain: 8, min: 3, dir: 'up', desc: 'Hold next to a wall to climb it.',
        speed: 55 },
    },
    'lightning+water': {
      shot: { name: 'Arc', kind: 'bolt', cd: 0.55, cost: 16, desc: 'Lightning that jumps between nearby targets.',
        range: 140, power: 22, knock: 60, chains: 3, chainRange: 45, charge: 50, chargeCells: 1500, color: [190, 230, 255] },
      burst: { name: 'Storm', kind: 'storm', cd: 0.4, cost: 22, desc: 'Lightning arcs to every enemy near you.',
        range: 75, power: 28, knock: 90, color: [190, 230, 255] },
      lift: { name: 'Storm glide', kind: 'lglide', drain: 6, min: 3, desc: 'Glide down slowly on a charged wind, moving fast with A and D. Lightning strikes enemies below you. It cannot climb.',
        fall: 32, side: 125, power: 12, range: 60, every: 0.5 },
      move: { name: 'Arc dash', kind: 'dash', cd: 0.35, cost: 22, dir: 'facing', desc: 'Dash the way you press (A or D), or the way you face. Further from water.',
        speed: 310, time: 0.12, waterTime: 0.2, power: 20 },
    },
    'earth+lightning': {
      shot: { name: 'Stone spear', kind: 'spear', cd: 0.7, cost: 18, desc: 'A heavy shard that bores a short tunnel through dirt. It drops as it flies and hits hardest close up.',
        // v0.75 (Jaisah: too accurate from too far, and too good at digging): slower, falls, spreads, weaker with distance, bores half as far
        speed: 300, bore: 3, boreLength: 14, power: 34, knock: 160, range: 180, gravity: 150, spread: 0.06, falloff: 0.45, color: [190, 196, 210] },
      burst: { name: 'Spikes', kind: 'spikes', cd: 0.45, cost: 20, desc: 'Stone spikes burst from the ground around you.',
        reach: 30, power: 38, knock: 240, height: 7 },
      lift: { name: 'Magnet float', kind: 'lmagnet', drain: 9, min: 4, desc: 'Lightning charges you against the ground: you float at head height above whatever is below, and run fast. Over a deep drop you only sink slowly.',
        height: 26, range: 60, side: 120, sink: 60 },
      move: { name: 'Drill', kind: 'drill', drain: 24, min: 6, dir: 'facing', desc: 'Hold to bore through dirt the way you press (A or D), or the way you face.',
        speed: 110, radius: 10 },
    },
    'fire+lightning': {
      shot: { name: 'Ember lance', kind: 'lance', cd: 0.4, cost: 14, desc: 'A fast burning beam that pierces through enemies.',
        range: 150, power: 28, knock: 60, color: [255, 170, 80] },
      burst: { name: 'Flare', kind: 'flare', cd: 0.4, cost: 20, desc: 'A blast all around you that throws things back hard.',
        radius: 24, power: 38, knock: 340, ignite: 0.3, color: [255, 220, 140] },
      lift: { name: 'Plasma thrust', kind: 'lthrust', drain: 26, min: 6, desc: 'A searing jet that flies you the way you press: up, or hard to the side with A and D. The fastest across, the costliest.',
        accel: 800, maxSpeed: 115, sideSpeed: 175, sideAccel: 900, emit: 'SPARK' },
      move: { name: 'Blast dash', kind: 'blastdash', cd: 0.45, cost: 18, dir: 'facing', desc: 'An explosion behind you throws you forward.',
        speed: 280, power: 16 },
    },
  };
  const modes = ['shot', 'burst', 'lift', 'move'];

  // ---------- Recipes ----------
  // You type elements into a recipe (recipe.js has the rules). There are no
  // slots: mana is the limit, up to `max` elements. Each element after the
  // second multiplies the cost by costStep (lifts and moves: costStepGentle)
  // and the power by powerStep, so long recipes are costly bursts.
  // owner: first>modifier pairs that are a hand-made spell in that mode.
  const recipe = {
    max: 7, costStep: 1.75, costStepGentle: 1.4, powerStep: 1.4, sizeStep: 0.2, sizeOther: 0.07, sizeMax: 2.2,
    single: 0.65,        // one element alone: this share of the cost and of the power
    visStep: 0.3,        // how much bigger a spell is drawn per element after the second
    owner: {
      shot: ['earth>fire', 'earth>water', 'earth>lightning', 'lightning>water', 'lightning>fire', 'water>fire'],
      burst: ['fire>water', 'earth>fire', 'earth>water', 'lightning>water', 'earth>lightning', 'fire>lightning'],
      lift: ['fire>water', 'earth>fire', 'earth>water', 'lightning>water', 'lightning>earth', 'fire>lightning'],
      move: ['fire>water', 'earth>fire', 'earth>water', 'lightning>water', 'earth>lightning', 'fire>lightning'],
    },
    // what a modifier element adds to a Shot or Burst, per copy
    burn: 2,            // seconds of burning, +1 per extra copy
    knock: 0.3,         // earth: more knockback
    chainRange: 46, chainShare: 0.5,   // lightning: jumps to one more enemy per copy for half the damage
  };

  // ---------- Special spells ----------
  // An exact sequence (order matters). It replaces the Shot while the recipe
  // matches and your mana bar is big enough to hold its cost; until then you
  // cannot tell it exists. Learned from tomes in relic caches, or by typing it.
  // tier: 1 to 5. Tomes and tablets teach by tier (see treasure.tierFor): the
  // deeper the cave, the higher the tier it can teach.
  const F = 'fire', W = 'water', E = 'earth', L = 'lightning';
  const specials = {
    // ----- tier 1: three elements -----
    geyser: { tier: 1, name: 'Geyser', seq: [W, F, W], cost: 32, cd: 0.8,
      desc: 'Boiling water bursts from the ground under your pointer, throwing enemies into the air.', power: 44, radius: 18, range: 170 },
    haste: { tier: 1, name: 'Haste', seq: [F, L, F], cost: 30, cd: 1,
      desc: 'For 8 seconds you run half again as fast and jump higher.', time: 8, speed: 1.5 },
    phase: { tier: 1, name: 'Phase', seq: [L, E, L], cost: 30, cd: 0.6,
      desc: 'Step through walls: you appear at your pointer, or the nearest open spot to it along the way.', dist: 72 },
    mend: { tier: 1, name: 'Mend', seq: [W, E, W], cost: 35, cd: 1,
      desc: 'Wet clay seals your cracks: you regain 35% of your health over 4 seconds.', heal: 0.35, time: 4 },
    lantern: { tier: 1, name: 'Lantern', seq: [L, F, L], cost: 25, cd: 1.5,
      desc: 'A flash lights the cave far around you and draws it onto your map.', radius: 420 },
    bridge: { tier: 1, name: 'Bridge', seq: [E, W, E], cost: 30, cd: 0.8,
      desc: 'A span of packed earth grows from your feet towards your pointer, over gaps, water and magma.', length: 76, thick: 4 },
    // ----- tier 2: four elements -----
    meteor: { tier: 2, name: 'Meteor', seq: [E, F, E, F], cost: 55, cd: 0.9,
      desc: 'A burning rock falls from above onto the ground under your pointer.', power: 95, radius: 16, range: 220 },
    quake: { tier: 2, name: 'Quake', seq: [E, E, E, W], cost: 50, cd: 1.2,
      desc: 'The ground heaves: everything near you is hurt, thrown and slowed, and rubble falls from the roof.', power: 38, radius: 140 },
    chain: { tier: 2, name: 'Chain lightning', seq: [L, L, W, L], cost: 60, cd: 0.8,
      desc: 'A bolt that leaps from enemy to enemy, up to eight of them.', power: 42, range: 210, hop: 75, hops: 8 },
    firewall: { tier: 2, name: 'Firewall', seq: [F, E, F, F], cost: 55, cd: 1.2,
      desc: 'A wall of flame burns on the ground under your pointer for 5 seconds.', power: 24, width: 34, height: 16, time: 5, range: 200 },
    deluge: { tier: 2, name: 'Deluge', seq: [W, W, E, W], cost: 60, cd: 1.5,
      desc: 'Water pours out of the air at your pointer for 3 seconds: enough to drown a fire, fill a pit or cool a pool of magma.', time: 3, perTick: 3, spread: 26, range: 200, air: true },
    well: { tier: 2, name: 'Lodestone pull', seq: [L, E, E, L], cost: 55, cd: 1.5,
      desc: 'For 3 seconds everything near your pointer is dragged to it and crushed together.', power: 14, radius: 90, time: 3, range: 200, air: true },
    // ----- tier 3: five elements -----
    stoneskin: { tier: 3, name: 'Stoneskin', seq: [E, E, L, E, E], cost: 80, cd: 1,
      desc: 'For 10 seconds you take 60% less damage.', time: 10, reduce: 0.6 },
    thunderstorm: { tier: 3, name: 'Thunderstorm', seq: [W, W, L, W, L], cost: 90, cd: 1.5,
      desc: 'A storm hangs at your pointer for 6 seconds: rain soaks everything under it and lightning strikes again and again.', power: 12, radius: 80, time: 6, every: 0.35,   /* v1.05: 12 a strike (was 28): 17 strikes on a soaked target came to 670 for 90 mana, three times its circle */ range: 200, air: true },
    inferno: { tier: 3, name: 'Inferno', seq: [F, F, L, F, F], cost: 100, cd: 1.5,
      desc: 'Three rings of fire burst out from you, each wider than the last.', power: 70, radii: [32, 58, 86] },
    sanctuary: { tier: 3, name: 'Sanctuary', seq: [W, E, L, E, W], cost: 110, cd: 2,
      desc: 'A circle of calm where you stand for 8 seconds: inside it you mend quickly and enemies are slowed.', radius: 52, time: 8, heal: 0.06 },
    tunnel: { tier: 3, name: 'Tunnel', seq: [E, L, E, L, E], cost: 85, cd: 1.5,
      desc: 'Bores a wide tunnel through dirt towards your pointer, and hurts whatever is in the way.', length: 210, radius: 9, power: 55 },
    prism: { tier: 3, name: 'Prism', seq: [L, W, F, E, L], cost: 90, cd: 2,
      desc: 'All four elements in balance: for 10 seconds every spell costs half.', time: 10 },
    // ----- tier 4: six elements -----
    avalanche: { tier: 4, name: 'Avalanche', seq: [E, E, W, E, E, E], cost: 150, cd: 2,
      desc: 'Nine boulders drop from the roof across the ground around your pointer, smashing through dirt.', power: 115, count: 9, spread: 70, range: 220 },
    maelstrom: { tier: 4, name: 'Maelstrom', seq: [W, L, W, L, W, L], cost: 170, cd: 2,
      desc: 'A storm that follows you for 12 seconds, wider and faster than a Thunderstorm.', power: 14, radius: 115, time: 12, every: 0.24 },   // v1.05: 14 a strike (was 34): about 1,050 on one target for 170 mana, in line with Avalanche
    phoenix: { tier: 4, name: 'Phoenix', seq: [F, W, F, W, F, F], cost: 160, cd: 2,
      desc: 'For 60 seconds, a blow that would break you instead restores half your health in a burst of flame. Once.', time: 60, power: 90, radius: 60 },
    titan: { tier: 4, name: 'Titan', seq: [E, F, E, L, E, E], cost: 180, cd: 2,
      desc: 'For 15 seconds your spells hit 60% harder, blows barely move you and you take a quarter less damage.', time: 15, damage: 1.6, reduce: 0.25 },
    meltdown: { tier: 4, name: 'Meltdown', seq: [F, E, F, F, E, F], cost: 165, cd: 2,
      desc: 'Rock at your pointer melts into magma, which cools into dirt you can dig. The only spell that opens rock without the Crucible.', power: 70, radius: 14, range: 150, air: true },
    // ----- tier 5: seven elements -----
    cataclysm: { tier: 5, name: 'Cataclysm', seq: [F, E, F, E, L, F, E], cost: 240, cd: 2,
      desc: 'Nine great meteors rain down around the ground under your pointer.', power: 135, radius: 20, range: 220, count: 9, spread: 62 },
    judgement: { tier: 5, name: 'Judgement', seq: [L, L, F, L, L, F, L], cost: 280, cd: 2.5,
      desc: 'One colossal bolt from above onto the ground under your pointer. What survives the strike is hit again by the lightning that leaps from it.', power: 380, radius: 34, chainPower: 110, chainRadius: 115, range: 240 },
    worldbreaker: { tier: 5, name: 'Worldbreaker', seq: [E, E, L, E, F, E, E], cost: 300, cd: 3,
      desc: 'The cave itself breaks: everything far around you is hurt, hurled and slowed, and the dirt near you is torn open.', power: 200, radius: 260 },
    stillness: { tier: 5, name: 'Stillness', seq: [L, W, L, E, L, W, L], cost: 300, cd: 14,
      desc: 'For 6 seconds every creature in the cave is frozen in place, bosses too. You are not.', time: 6 },
  };
  function spellKey(a, b) { return a <= b ? a + '+' + b : b + '+' + a; }
  for (const k in spells) { const [a, b] = k.split('+'); if (spellKey(a, b) !== k) throw new Error('Spell key out of order: ' + k); }

  // ---------- Actors ----------
  // Stats feed the damage formula (game.js damage()). Everyone starts equal for now;
  // upgrade cards and co-op finds will change them later.
  const baseStats = () => ({ attack: 10, defence: 10, power: { fire: 1, water: 1, earth: 1, lightning: 1 } });
  const player = {
    // the body that collides is smaller than the golem as drawn (21 wide, 17 to 20 tall), so it
    // slips through gaps a little narrower and lower than it looks (was 11 x 17 until v0.36)
    w: 9, h: 15,
    // clawing through dirt by walking into it: starts after `wait` s of pushing, then a stroke every
    // `every` s that clears `depth` cells ahead, the body's height plus `room` (measured: about 12 cells a second; running is 72)
    dig: { wait: 0.3, every: 0.1, depth: 4, room: 2, lean: 0.5, maxUp: 0.35 }, hp: 100, run: 72, accel: 900, airAccel: 520, friction: 14,
    jump: 168, gravity: 480, maxFall: 330, coyote: 0.1, buffer: 0.12,
    respawn: 1.4,   // health does not come back by itself: a Lodestone mends you, and so do the Mend spell and a few runestones
    // mana: refills on its own, faster on the ground. Spending pauses the refill
    // briefly; running dry pauses it longer.
    regen: 1.5, regenDelay: 6, mana: 60, manaRegen: 16, manaGroundRegen: 30, manaDelay: 0.35, manaEmptyDelay: 0.9,
    // damage per second from touching these (before defence)
    hurt: { fire: 22, magma: 45, charged: 60, acid: 26, ember: 30 },
  };
  const dummy = { w: 7, h: 13, hp: 100, regenDelay: 2.5, respawn: 2 };

  // ---------- Enemies ----------
  // Shale crawler: patrols, chases what it can see, winds up (rears and its eyes
  // flare), lunges, then needs a moment to recover. Big hits stagger it.
  // affinity: damage multiplier by element (a spell averages its two elements).
  // spawn: weight per region (rose, drowned, ember) and the lowest level it appears at.
  const enemies = {
    crawler: { name: 'Shale crawler', desc: 'Winds up, then lunges. A hard hit staggers it.', w: 13, h: 8, hp: 85, attack: 10, defence: 8,
      walk: 22, run: 50, sight: 130, sense: 50, hearing: 110, forget: 4, jump: 165,
      lungeRange: 34, windup: 0.45, lungeSpeed: 215, lungeLift: 90, lungeTime: 0.35, recover: 0.7,
      power: 18, knock: 170, staggerAt: 12, stagger: 0.35,
      respawn: 25, awake: 380, respawnClear: 300,
      // tougher further from the hub: per level above 1
      perLevel: { hp: 0.3, attack: 2, defence: 1 },
      affinity: {}, xp: 1, spawn: { weights: [1, 1, 1], from: 1 } },
    moth: { name: 'Glowmoth', desc: 'Flies. Hovers and glows, then swoops at you. Weak to lightning.', w: 13, h: 7, hp: 50, attack: 9, defence: 6,
      fly: 60, swoop: 230, windup: 0.55, swoopTime: 0.45, recover: 0.9, range: 70, power: 14, knock: 130,
      affinity: { lightning: 1.6, earth: 0.8 }, xp: 1, spawn: { weights: [0.5, 0.8, 0.4], from: 1 } },
    delver: { name: 'Delver', desc: 'Swims through dirt and bursts out to bite. Weak to water; earth barely hurts it.', w: 13, h: 9, hp: 70, attack: 12, defence: 9,
      dig: 48, emergeRange: 34, windup: 0.4, lunge: 200, power: 22, knock: 160, surface: 1.6,
      affinity: { water: 1.6, earth: 0.4 }, xp: 1.3, spawn: { weights: [0.35, 0.35, 0.3], from: 2 } },
    spitter: { name: 'Cinder spitter', desc: 'Sits in a wall and lobs magma. Fire does nothing to it; water hurts it badly.', w: 11, h: 11, hp: 55, attack: 10, defence: 10,
      range: 190, every: 2.4, speed: 175, power: 14, glob: 10,
      affinity: { fire: 0, water: 1.8, lightning: 1.1 }, xp: 1.2, spawn: { weights: [0.15, 0.1, 0.7], from: 1 } },
    warden: { name: 'Slate warden', float: -0.3, desc: 'Armoured. Slow, but its ground slam hits hard. Fire and lightning glance off; earth and water crack it.', w: 17, h: 16, hp: 170, attack: 14, defence: 18,
      walk: 22, slamRange: 30, windup: 0.9, radius: 30, power: 30, knock: 260, recover: 1.1,
      affinity: { fire: 0.4, lightning: 0.4, earth: 1.6, water: 1.3 }, xp: 2.5, spawn: { weights: [0.15, 0.25, 0.25], from: 3 } },
  };
  // Four kinds that the cave's generator never places itself (spawn.from 99): the game turns some
  // crawler and moth homes into them by region and level (KData.remix, game.kindFor), so the
  // cave and old saves stay the same.
  Object.assign(enemies, {
    slinger: { name: 'Shard slinger', float: 0.3, desc: 'Keeps its distance and hurls stone shards on an arc. Get close or burn it: it is weak to fire.', w: 11, h: 12, hp: 62, attack: 10, defence: 6,
      walk: 36, near: 60, far: 115, range: 175, windup: 0.6, every: 2.3, speed: 165, power: 16, knock: 130,
      affinity: { fire: 1.4, earth: 0.6 }, xp: 1.2, spawn: { weights: [0, 0, 0], from: 99 } },
    wisp: { name: 'Stormwisp', desc: 'Hovers out of reach, takes aim along a line, then fires lightning down it. Step off the line. Earth shatters it.', w: 9, h: 9, hp: 42, attack: 11, defence: 5,
      fly: 55, keep: 86, aim: 0.8, every: 2.8, range: 210, power: 18, knock: 110,
      affinity: { earth: 1.7, lightning: 0.3, water: 1.2 }, xp: 1.3, spawn: { weights: [0, 0, 0], from: 99 } },
    frog: { name: 'Mirehopper', float: 1, swim: 70, desc: 'Crouches, then leaps at you. Where it lands it spatters mud that slows you. Weak to lightning.', w: 13, h: 8, hp: 70, attack: 10, defence: 7,
      crouch: 0.35, hop: 95, lift: 175, rest: 0.6, power: 16, knock: 150, mud: 8,
      affinity: { lightning: 1.5, water: 0.5, fire: 1.2 }, xp: 1.1, spawn: { weights: [0, 0, 0], from: 99 } },
    imp: { name: 'Cinder imp', float: 0.6, desc: 'Runs straight at you, flares, and bursts. Kill it before it reaches you, or get clear. Fire does nothing to it; water snuffs it.', w: 9, h: 10, hp: 36, attack: 12, defence: 4,
      run: 84, fuseRange: 17, fuse: 0.55, radius: 26, power: 30, knock: 220,
      affinity: { fire: 0, water: 1.9 }, xp: 1.1, spawn: { weights: [0, 0, 0], from: 99 } },
  });
  // The warden's two extra attacks: a thrown boulder at range, and a wave along the ground after its slam.
  Object.assign(enemies.warden, { throwNear: 55, throwFar: 190, throwWind: 0.7, throwEvery: 3.4, throwSpeed: 175, throwPower: 22, waveSpeed: 150, waveTime: 0.6, wavePower: 15,
    desc: 'Armoured. Hurls boulders from range; up close it slams the ground, and a wave runs out along the floor: jump it. Fire and lightning glance off; earth and water crack it.' });
  // Which homes change kind: [kind it becomes, from level, share out of 100] by region (0 Rose Hollows, 1 Drowned Galleries, 2 Ember Veins)
  const remix = {
    crawler: [[['slinger', 2, 30]], [['frog', 2, 45], ['slinger', 3, 15]], [['imp', 2, 40], ['slinger', 2, 18]]],
    moth: [[['wisp', 4, 25]], [['wisp', 3, 50]], [['wisp', 4, 25]]],
  };
  // The second cave's creatures (the Sunless Deep). Like the four above, the generator never places them:
  // the game turns the first cave's kinds into them (acts[1].remix).
  Object.assign(enemies, {
    shade: { name: 'Shade', float: 0.5, desc: 'Fades out and steps out of the air behind you, then slashes. Watch for the shimmer where it will appear. Weak to fire.', w: 9, h: 13, hp: 74, attack: 13, defence: 6,
      walk: 40, blinkEvery: 3.2, fade: 0.5, behind: 16, power: 20, knock: 170, affinity: { fire: 1.4, earth: 0.7 }, xp: 1.3, spawn: { weights: [0, 0, 0], from: 99 } },
    urchin: { name: 'Glass urchin', float: -0.2, desc: 'Rolls slowly towards you, swells, and throws spines in every direction. Keep your distance or get under cover. Weak to water.', w: 11, h: 9, hp: 70, attack: 11, defence: 10,
      roll: 20, trigger: 75, swell: 0.6, spikes: 8, speed: 150, power: 13, reach: 100, every: 3.0, affinity: { water: 1.5, earth: 0.5 }, xp: 1.3, spawn: { weights: [0, 0, 0], from: 99 } },
    wraith: { name: 'Ash wraith', desc: 'Drifts straight through rock towards you, slowly, and burns on touch. Walls will not save you; lightning will.', w: 11, h: 11, hp: 68, attack: 12, defence: 4,
      fly: 38, power: 18, knock: 120, touchCd: 0.8, affinity: { lightning: 1.6, fire: 1.2, earth: 0.4 }, xp: 1.3, spawn: { weights: [0, 0, 0], from: 99 } },
    geode: { name: 'Geode', desc: 'Set in a wall. It glows, then fires three shards in a fan. Earth cracks it; lightning does little.', w: 11, h: 11, hp: 60, attack: 12, defence: 8,
      glow: 0.75, every: 2.8, spread: 0.22, speed: 190, power: 13, range: 220, affinity: { earth: 1.6, lightning: 0.5 }, xp: 1.3, spawn: { weights: [0, 0, 0], from: 99 } },
  });
  // The third cave's creatures (the Root of the World).
  Object.assign(enemies, {
    boar: { name: 'Rootboar', float: -0.3, desc: 'Paws the ground, then charges flat out and does not stop until it hits something. Jump it; when it hits a wall it is dazed. Weak to lightning.', w: 15, h: 9, hp: 110, attack: 13, defence: 9,
      walk: 28, see: 170, paw: 0.6, charge: 230, chargeTime: 1.6, daze: 1.4, every: 3, power: 24, knock: 260, affinity: { lightning: 1.5, earth: 0.6 }, xp: 1.4, spawn: { weights: [0, 0, 0], from: 99 } },
    mender: { name: 'Bloomwisp', desc: 'Harmless itself. It keeps away from you and mends any hurt creature near it along a green thread. Kill it first. Weak to fire.', w: 9, h: 9, hp: 60, attack: 8, defence: 4,
      fly: 60, keep: 115, reach: 115, mend: 0.06, shot: 14, shotEvery: 1.7, affinity: { fire: 1.7, water: 0.6 }, xp: 1.4, spawn: { weights: [0, 0, 0], from: 99 } },
    lasher: { name: 'Lasher', float: 0.8, desc: 'Barely moves. It throws out a vine and drags you to its mouth. Get out of its sight, or kill it while it pulls. Weak to fire.', w: 9, h: 13, hp: 95, attack: 13, defence: 8,
      walk: 12, reach: 100, wind: 0.5, pullTime: 1.1, pull: 420, every: 3.5, power: 24, knock: 140, affinity: { fire: 1.5, water: 0.7 }, xp: 1.4, spawn: { weights: [0, 0, 0], from: 99 } },
  });
  // v0.80: one new creature for each cave, each built round that cave's materials (the generator never places them:
  // each cave's remix turns some of its crawlers or moths into them)
  Object.assign(enemies, {
    tinder: { name: 'Tinder beetle', float: -0.2, dodge: true, desc: 'Scrapes up sparks, then charges, leaving fire behind it, and bursts into flame when it dies. Near oil, gas or wood it sets everything off. Water puts it out.', w: 11, h: 7, hp: 64, attack: 10, defence: 7,
      walk: 30, run: 125, see: 165, scrape: 0.7, chargeTime: 1.2, every: 2.6, power: 16, knock: 150, burst: 14, affinity: { fire: 0, water: 1.7, earth: 0.9 }, xp: 1.2, spawn: { weights: [0, 0, 0], from: 99 } },
    rime: { name: 'Rime crawler', float: -0.2, dodge: true, desc: 'Keeps its distance and spits frost on an arc. Where it lands water freezes solid and ice grows, and a hit chills you. Fire cracks it.', w: 12, h: 7, hp: 80, attack: 11, defence: 9,
      walk: 26, near: 55, far: 120, range: 185, windup: 0.6, every: 2.5, speed: 170, power: 13, chill: 2.2, freeze: 8, affinity: { fire: 1.6, water: 0.3, lightning: 0.9 }, xp: 1.3, spawn: { weights: [0, 0, 0], from: 99 } },
    bladder: { name: 'Blight bladder', desc: 'A floating sac of acid. It drifts towards you and bursts when it is close or popped, and the acid eats the ground and you. Pop it from far off; lightning pops it best.', w: 11, h: 11, hp: 40, attack: 12, defence: 3,
      fly: 28, trigger: 26, swell: 0.7, acid: 46, power: 22, affinity: { lightning: 1.8, earth: 0.8 }, xp: 1.3, spawn: { weights: [0, 0, 0], from: 99 } },
  });
  enemies.crawler.dodge = enemies.frog.dodge = enemies.slinger.dodge = true;   // these sometimes jump clear of a spell coming at them
  // shared by every enemy kind
  for (const k in enemies) Object.assign(enemies[k], { sight: enemies.crawler.sight, sense: enemies.crawler.sense, hearing: enemies.crawler.hearing, forget: enemies.crawler.forget,
    respawn: 25, awake: 380, respawnClear: 300, perLevel: enemies.crawler.perLevel }, { ...enemies[k] });
  // status effects: a status makes one element hit harder
  const statuses = {
    wet: { name: 'Wet', boosts: 'lightning', by: 1.5, time: 4 },
    muddy: { name: 'Muddy', boosts: 'fire', by: 1.4 },
    burning: { name: 'Burning', boosts: 'water', by: 1.4 },
  };
  // Champions: one giant, named creature of each of these kinds, the
  // highest-level one in the cave (at least `apart` from each other). They do
  // not come back once beaten, and each gives a Legendary runestone, a tome,
  // shards and a lot of experience.
  const champions = {
    size: 1.8, hp: { warden: 4, moth: 14, delver: 9, shade: 8, urchin: 6, wraith: 10, boar: 6, lasher: 7, mender: 12 },   // times an ordinary one's health   // times an ordinary one's health: about 2,100 to 2,300 at level 8
    attack: 1.25, xp: 8, shards: 30, apart: 500,
    // One per region, in this order (Rose Hollows, Drowned Galleries, Ember Veins). Each has an attack of
    // its own (game.championTick): every `every` seconds, more of it (`rageCount`) below `rage` of its health.
    sig: {
      warden: { every: 9, wind: 1.0, count: 6, rageCount: 10, rage: 0.4, gap: 0.3, power: 24, spread: 80, open: 1.5 },      // Rockfall: boulders drop from the roof around you
      moth: { every: 7, wind: 0.9, count: 5, rageCount: 8, rage: 0.5, range: 170, power: 20, open: 1.5 },                    // Lantern burst: lightning along lines you can see
      delver: { every: 8, wind: 1.1, count: 1, rageCount: 2, rage: 0.4, gap: 0.9, radius: 28, power: 26, open: 2.6 },   // Eruption: it bursts up through the floor where you stood
      // the third cave's three
      boar: { every: 7, wind: 0.5, count: 3, rageCount: 5, rage: 0.4, gap: 0.5, speed: 270, time: 0.7, power: 26, open: 2.2 },   // Stampede: charge after charge, back and forth
      lasher: { every: 6, wind: 0.4, count: 4, rageCount: 6, rage: 0.4, gap: 0.3, range: 130, power: 20, open: 1.8 },          // Thrash: its vine strikes along lines you can see
      mender: { every: 9, wind: 2.6, count: 1, rageCount: 1, rage: 0.4, heal: 0.14, breakAt: 0.05, radius: 70, power: 28, open: 3 },   // Bloom: it mends itself, then bursts, unless you hurt it enough first
      // the second cave's three
      shade: { every: 7, wind: 0.4, count: 3, rageCount: 5, rage: 0.4, gap: 0.45, power: 22, open: 1.8 },          // Reflections: it steps out of the air again and again, slashing each time
      urchin: { every: 8, wind: 0.9, count: 3, rageCount: 5, rage: 0.4, gap: 0.4, spikes: 12, power: 13, open: 2.0 },  // Spiral: volley after volley of spines, each turned a little
      wraith: { every: 7, wind: 1.1, count: 1, rageCount: 2, rage: 0.5, gap: 0.8, radius: 60, power: 26, open: 1.6 },  // Ash bloom: a ring shows, then everything inside it burns
    },
  };
  const elites = { chance: 0.08, from: 2, hp: 1.8, attack: 1.3 };

  // ---------- Bosses ----------
  // The Emberwyrm lives in a magma lake in the Ember Veins. It can only swim
  // through magma: cool its lake with water (magma + water makes dirt) and a
  // breach that lands on solid ground leaves it stranded, taking double damage.
  const bosses = {
    emberwyrm: { name: 'The Emberwyrm', region: 'ember', core: 'Ember core',
      desc: 'Swims through magma. Bubbles mark where it will breach. Fire does nothing; water hurts it and cools its lake into dirt. Stranded on solid ground, it takes double damage.',
      hp: 900, attack: 14, defence: 14, perLevel: { hp: 0.3, attack: 2, defence: 1 },
      swim: 95, bubble: 0.85, breach: 270, breachUp: 300, gravity: 420, contact: 26, knock: 220, touchCd: 0.8,
      spitEvery: 3.6, spitCount: 3, spitCountRage: 5, glob: 12, globPower: 16, strand: 4.5, strandMul: 2,
      rise: 6, segments: 12, rageAt: 0.5, reset: 8, xpMul: 15, shardsMul: 40,
      affinity: { fire: 0, water: 1.6, lightning: 1.2 } },
  };

  bosses.hollowking = { name: 'The Hollow King', region: 'deep', core: 'Hollow crown',
    desc: 'Hangs in the air over its lake. A fan of shards, a pull that ends in a blast, and lightning that falls where a light marks the ground. Lightning hurts it most.',
    hp: 1100, attack: 15, defence: 15, perLevel: { hp: 0.3, attack: 2, defence: 1 }, rageAt: 0.5, reset: 8, xpMul: 18, shardsMul: 50,
    speed: 70, fanWind: 0.7, fanSpread: 0.2, fanPower: 16, fanSpeed: 200, wellTime: 2.2, pull: 260, blast: 62, blastPower: 34,
    rainWarn: 0.7, rainGap: 0.55, rainCount: 4, rainPower: 22, contact: 20, knock: 200, touchCd: 0.9,
    affinity: { lightning: 1.4, earth: 0.7 } };

  bosses.heartroot = { name: 'The Heartroot', region: 'root', core: 'Heartseed',
    desc: 'The cave\'s own heart, hanging over its lake. Shut, it shrugs off most of what you throw. After each attack it opens for a few seconds: that is when to hit it. Fire hurts it most.',
    hp: 1250, attack: 16, defence: 16, perLevel: { hp: 0.3, attack: 2, defence: 1 }, rageAt: 0.5, reset: 8, xpMul: 20, shardsMul: 60,
    shut: 0.3, openTime: 2.4, seeds: 4, seedPower: 22, lashWarn: 0.85, lashPower: 26, lashHalf: 7, pulseWind: 1.1, pulseRadius: 95, pulsePower: 18, pulseKnock: 330,
    contact: 22, knock: 220, touchCd: 0.9, affinity: { fire: 1.5, water: 0.7 } };

  // Weak spots: an aimed shot (not a blast or a burst) that lands there does `mul` times the damage.
  // Upright creatures: the top `topPart` of the body. Four-footed and burrowing ones: the front `frontPart`.
  // Everything else (the round and the winged): within `corePart` of the middle.
  const weakSpot = { mul: 1.5, topPart: 0.38, frontPart: 0.36, corePart: 0.2, top: ['warden', 'slinger', 'shade', 'lasher', 'imp', 'wraith'], front: ['crawler', 'delver', 'boar', 'frog'] };

  // ---------- Regions ----------
  // The cave spreads in every direction from the hub. Each region has its own
  // stone colours (strata), background, lichen, and pools in its chambers.
  // Difficulty (level) grows with distance from the hub: 1 + distance / levelEvery.
  // poolFrom: where a chamber's pool surface sits, from its top (0) to its bottom (1).
  const biomes = [
    { id: 'rose', name: 'Rose Hollows', feat: { wood: 0.55, coal: 0.25 }, dark: 0.57, bg: [30, 22, 46], lichen: 0.55, hang: 0.3, pool: null, mud: 0,
      crust: [200, 150, 118], strata: [[124, 76, 92], [142, 92, 96], [104, 64, 90], [160, 114, 104], [92, 58, 84], [132, 84, 100]] },
    { id: 'drowned', name: 'Drowned Galleries', feat: { wood: 0.25, gas: 0.3, oil: 0.15 }, dark: 0.69, bg: [16, 26, 44], lichen: 0.3, hang: 0.4, pool: 'WATER', poolFrom: 0.6, mud: 0.3,
      crust: [138, 172, 162], strata: [[72, 94, 108], [86, 108, 118], [60, 80, 98], [100, 122, 128], [54, 72, 90], [80, 100, 112]] },
    { id: 'ember', name: 'Ember Veins', feat: { coal: 0.45, oil: 0.35, gas: 0.3 }, dark: 0.63, bg: [34, 16, 24], lichen: 0.3, hang: 0.12, pool: 'MAGMA', poolFrom: 0.8, mud: 0,
      crust: [200, 124, 72], strata: [[112, 58, 52], [128, 70, 58], [88, 46, 48], [148, 88, 66], [74, 40, 44], [118, 64, 56]] },
  ];
  // the second cave's regions
  const biomesDeep = [
    { id: 'glass', name: 'Glass Warrens', feat: { ice: 0.65, gas: 0.2 }, dark: 0.66, bg: [22, 26, 40], lichen: 0.15, hang: 0.5, pool: null, mud: 0,
      crust: [184, 194, 236], strata: [[96, 108, 150], [120, 130, 170], [78, 88, 132], [146, 156, 190], [66, 74, 116], [108, 118, 160]] },
    { id: 'sunless', name: 'Sunless Sea', feat: { ice: 0.35, oil: 0.3, wood: 0.2 }, dark: 0.82, bg: [8, 14, 26], lichen: 0.1, hang: 0.25, pool: 'WATER', poolFrom: 0.25, mud: 0.5,
      crust: [92, 126, 146], strata: [[40, 58, 74], [50, 70, 84], [32, 46, 64], [62, 84, 94], [26, 38, 56], [46, 64, 80]] },
    { id: 'ashen', name: 'Ashen Maw', feat: { coal: 0.5, gas: 0.4, oil: 0.3 }, dark: 0.75, bg: [22, 18, 20], lichen: 0.05, hang: 0.1, pool: 'MAGMA', poolFrom: 0.5, mud: 0,
      crust: [176, 166, 154], strata: [[92, 86, 84], [110, 102, 98], [72, 66, 68], [128, 118, 110], [58, 54, 58], [100, 92, 90]] },
  ];
  // the third cave's regions
  const biomesRoot = [
    { id: 'verdant', name: 'Verdant Hollow', feat: { wood: 0.7, acid: 0.2 }, dark: 0.63, bg: [14, 26, 22], lichen: 0.9, hang: 0.6, pool: 'WATER', poolFrom: 0.7, mud: 0.4,
      crust: [156, 196, 104], strata: [[70, 104, 84], [86, 120, 92], [58, 88, 76], [104, 138, 100], [48, 74, 66], [78, 110, 88]] },
    { id: 'bone', name: 'Bone Orchard', feat: { acid: 0.35, coal: 0.2, gas: 0.2 }, dark: 0.6, bg: [26, 24, 26], lichen: 0.2, hang: 0.3, pool: null, mud: 0,
      crust: [226, 214, 180], strata: [[150, 142, 128], [170, 160, 142], [128, 120, 112], [188, 178, 156], [108, 102, 98], [158, 150, 134]] },
    { id: 'heartwood', name: 'Heartwood', feat: { wood: 0.4, acid: 0.3, oil: 0.3, coal: 0.2 }, dark: 0.75, bg: [30, 12, 18], lichen: 0.5, hang: 0.4, pool: 'MAGMA', poolFrom: 0.7, mud: 0,
      crust: [198, 112, 90], strata: [[120, 56, 60], [138, 68, 66], [98, 44, 54], [156, 84, 72], [80, 36, 48], [128, 62, 62]] },
  ];
  // The game in acts. Each cave you descend to is the next act: its own regions, creatures (which kinds
  // the generator's five become, by region: [kind, from level, share of 100]), champions and last boss.
  // Past the last act they come round again, eight levels higher each time.
  const acts = [
    { name: 'The Waking Cave', ending: 'The lake goes still. Under it the stone is warm, and it goes down further than anyone dug.', biomes, remix, boss: 'emberwyrm', order: ['warden', 'moth', 'delver'], champions: { warden: 'The Slate Colossus', moth: 'The Lantern Queen', delver: 'Deepjaw' } },
    { name: 'The Sunless Deep', ending: 'The crown rolls into the black water and does not come up. Something below has stopped holding its breath.', biomes: biomesDeep, boss: 'hollowking', order: ['shade', 'urchin', 'wraith'], champions: { shade: 'The Mirror', urchin: 'The Thousand Spines', wraith: 'The Pale Regent' },
      // nothing of the first cave's crawlers, moths or spitters is left down here; delvers and wardens live in both
      remix: { crawler: [[['shade', 0, 60], ['urchin', 0, 40]], [['urchin', 0, 60], ['shade', 0, 40]], [['shade', 0, 50], ['urchin', 0, 50]]], moth: [[['wraith', 0, 50], ['shade', 0, 25], ['urchin', 0, 25]], [['wraith', 0, 50], ['urchin', 0, 30], ['shade', 0, 20]], [['wraith', 0, 60], ['shade', 0, 20], ['urchin', 0, 20]]], spitter: [[['geode', 0, 100]], [['geode', 0, 100]], [['geode', 0, 100]]] } },
    { name: 'The Root of the World', ending: 'The root lets go. The cave settles, grain by grain, and for the first time since you woke, nothing moves but you.', biomes: biomesRoot, boss: 'heartroot', order: ['boar', 'mender', 'lasher'], champions: { boar: 'The Tusk', mender: 'The Gardener', lasher: 'The Strangler' },
      remix: { crawler: [[['boar', 0, 45], ['lasher', 0, 55]], [['boar', 0, 60], ['lasher', 0, 40]], [['lasher', 0, 50], ['boar', 0, 50]]], moth: [[['mender', 0, 45], ['lasher', 0, 30], ['boar', 0, 25]], [['mender', 0, 40], ['boar', 0, 35], ['lasher', 0, 25]], [['mender', 0, 45], ['boar', 0, 30], ['lasher', 0, 25]]], spitter: [[['geode', 0, 100]], [['geode', 0, 100]], [['geode', 0, 100]]] } },
  ];
  // the new creatures take a share of each cave's mix: tinder beetles where there is coal and oil, rime crawlers where
  // there is ice, blight bladders in the root caves
  acts[0].remix.crawler[0].push(['tinder', 1, 22]); acts[0].remix.crawler[2].push(['tinder', 1, 22]);
  const share = (act, base, biome, kind, part) => { const R = acts[act].remix[base]; R[biome] = [[kind, 0, part], ...R[biome].map(([k, f, s]) => [k, f, Math.round(s * (100 - part) / 100)])]; };
  share(1, 'crawler', 0, 'rime', 30); share(1, 'crawler', 1, 'rime', 30);
  for (const b of [0, 1, 2]) share(2, 'moth', b, 'bladder', 30);
  const cave = { returnAfter: 480, returnJitter: 0.25, returnClear: 480,   // a killed creature comes back 6 to 10 minutes later (v0.72), out of every golem's sight
    chambers: 104, spacing: 150, hubRadius: 320, regionDistance: 800, levelEvery: 200, depthLevels: 8,
    tunnel: [12, 17], plugChance: 0.16, loopChance: 0.55, lodestones: 15, stoneReach: 46, stoneUp: 30, stoneDown: 50,   // how near counts as at a Lodestone: sideways, above it, below it
    stoneRepair: 90 };

  // ---------- Getting stronger ----------
  // Experience from kills and discoveries; each level gives stat points, spent at a Lodestone.
  // xpFor(L): experience needed to go from level L to L+1.
  // ---------- Treasure ----------
  // Relic caches are sealed in by the cave (buried, under magma, under water,
  // high in a ceiling, or inside rock). Crystal veins break into shards.
  const treasure = {
    cacheChance: 0.6,          // per chamber
    tomeChance: 0.4,           // a cache teaches a special spell (about 16 tomes in a cave of 40 caches)
    // the highest tier of special spell a find of this level can teach
    tierFor: L => L <= 3 ? 1 : L <= 6 ? 2 : L <= 9 ? 3 : L <= 12 ? 4 : 5,   // the fourth and fifth circles are found in the second cave
    // lasting gifts for what you have done in the cave (game.boons)
    boons: { core: { mana: 40, regen: 0.15 }, champion: { mana: 20, hp: 20 }, tablet: { mana: 5 } },
    tablets: 9, tabletApart: 300,   // rune tablets: carved stones that each teach one special spell
    kinds: { buried: 0.28, high: 0.45, pool: 0.7, rock: 0.4 },
    xp: L => 25 * L, shards: L => 12 * L,
    crucibleChance: L => L >= 5 ? 0.1 : 0,   // a deep cache may hold the Crucible
    veinChance: 0.6, extraVeins: 40,
    // the Forge, at a Lodestone
    pointCost: n => 80 + 40 * n,              // n = points already bought
    levelUpCost: r => Math.round((8 + 5 * r.level) * [1, 2, 4, 8][r.tier]),
    maxRuneLevel: 30,
  };

  const progression = {
    xpFor: L => Math.round(120 + 80 * (L - 1) + 30 * (L - 1) * (L - 1)),
    pointsPerLevel: 3,
    killXp: (level, kind, elite) => Math.round((elite ? 3 : 1) * ((enemies[kind] && enemies[kind].xp) || 1) * (6 + 4 * level)),
    // enemies well below your level are worth less (stops farming the start)
    underLevel: gap => gap <= 1 ? 1 : Math.max(0.1, 1 - 0.3 * (gap - 1)),
    lodestoneXp: 25,
    // per point spent
    stats: [
      { id: 'attack', name: 'Attack', desc: 'Every spell does more damage.', per: 1, show: v => 10 + v },
      { id: 'defence', name: 'Defence', desc: 'You take less damage.', per: 1, show: v => 10 + v },
      { id: 'vitality', name: 'Vitality', desc: '+10 maximum health.', per: 10, show: v => 100 + 10 * v },
      { id: 'mana', name: 'Mana', desc: '+6 maximum mana.', per: 6, show: v => 60 + 6 * v },
      { id: 'focus', name: 'Focus', desc: 'Mana refills 8% faster.', per: 0.08, show: v => '+' + Math.round(8 * v) + '%' },
      { id: 'fire', name: 'Fire power', desc: 'Spells with fire hit 6% harder.', per: 0.06, show: v => '+' + Math.round(6 * v) + '%', el: 'fire' },
      { id: 'water', name: 'Water power', desc: 'Spells with water hit 6% harder.', per: 0.06, show: v => '+' + Math.round(6 * v) + '%', el: 'water' },
      { id: 'earth', name: 'Earth power', desc: 'Spells with earth hit 6% harder.', per: 0.06, show: v => '+' + Math.round(6 * v) + '%', el: 'earth' },
      { id: 'lightning', name: 'Lightning power', desc: 'Spells with lightning hit 6% harder.', per: 0.06, show: v => '+' + Math.round(6 * v) + '%', el: 'lightning' },
    ],
  };

  // ---------- Runestones (loot) ----------
  // The golem has four slots. A runestone adds stats (in stat points, the same
  // as spending points at a Lodestone, scaled by its grade and the level it was
  // found at) and usually a trait that changes how spells behave.
  const runes = {
    slots: ['head', 'core', 'arms', 'legs'],
    slotNames: { head: 'Head', core: 'Core', arms: 'Arms', legs: 'Legs' },
    tiers: [
      { name: 'Common', mult: 1, color: [214, 206, 228] },
      { name: 'Rare', mult: 1.6, color: [120, 190, 255] },
      { name: 'Epic', mult: 2.3, color: [206, 140, 255] },
      { name: 'Legendary', mult: 3.2, color: [255, 200, 90] },
    ],
    // extra stat: speed (+5% run speed per point)
    types: {
      glimmerBrow: { slot: 'head', name: 'Glimmer brow', stats: { focus: 1.5 }, desc: 'A clear stone. Mana refills faster.' },
      stormCrown:  { slot: 'head', name: 'Storm crown', stats: { lightning: 1.5 }, trait: 'chain', desc: 'Bolt and Arc jump to one more target.' },
      emberVisor:  { slot: 'head', name: 'Ember visor', stats: { fire: 1.5 }, trait: 'burn', desc: 'Your fire spells set enemies burning.' },
      deepCore:    { slot: 'core', name: 'Deep core', stats: { mana: 2 }, desc: 'A dense stone. More mana.' },
      magmaHeart:  { slot: 'core', name: 'Magma heart', stats: { vitality: 1.5 }, trait: 'magmaproof', desc: 'Fire and magma no longer hurt you. You can wade through magma.' },
      tidalCore:   { slot: 'core', name: 'Tidal core', stats: { water: 1.5 }, trait: 'tidal', desc: 'Steam flight, Flame jet, Plasma thrust, Water jet and Storm glide cost no mana while you are in or just above water.' },
      crucible:    { slot: 'core', name: 'Crucible', stats: { fire: 2 }, trait: 'melt', desc: 'Your fire melts rock: Fireball, Fire nova, Flare and Ember lance turn rock into magma.', rare: true },
      quarryFists: { slot: 'arms', name: 'Quarry fists', stats: { attack: 1.5 }, trait: 'quarry', desc: 'Spells with earth knock enemies back much harder.' },
      splitArms:   { slot: 'arms', name: 'Splitting arms', stats: { fire: 1 }, trait: 'split', desc: 'Fireballs burst into three smaller fireballs.' },
      thriftArms:  { slot: 'arms', name: 'Thrifty arms', stats: { focus: 1 }, trait: 'thrifty', desc: 'Every fourth Shot costs no mana.' },
      mireArms:    { slot: 'arms', name: 'Mire arms', stats: { earth: 1, water: 0.5 }, trait: 'mudburst', desc: 'Your Bursts leave mud on the ground around you.' },
      springLegs:  { slot: 'legs', name: 'Spring legs', stats: { speed: 1 }, trait: 'spring', desc: 'You jump much higher.' },
      anchorLegs:  { slot: 'legs', name: 'Anchor legs', stats: { defence: 2 }, trait: 'anchor', desc: 'You barely get knocked back.' },
      swiftLegs:   { slot: 'legs', name: 'Swift legs', stats: { speed: 1.5 }, trait: 'swift', desc: 'Every dash (Blink, Flame dash, Surf, Shoulder charge, Vanish, Arc dash, Blast dash) costs half.' },
      diverLegs:   { slot: 'legs', name: 'Diver legs', stats: { water: 1 }, trait: 'diver', desc: 'You swim fast and mud never slows you.' },
    },
    dropChance: 0.1, eliteDrop: 1, bag: 24,
    // grade odds by the level of the place it drops
    tierFor(level, r) {
      const epic = Math.min(0.2, 0.03 + 0.02 * level), rare = Math.min(0.45, 0.18 + 0.04 * level);
      return r < epic ? 2 : r < epic + rare ? 1 : 0;
    },
    // a stone's stat value: points x grade x (1 + 15% per level above 1)
    value: (base, tier, level) => Math.round(base * runesTierMult[tier] * (1 + 0.15 * (level - 1)) * 10) / 10,
    statNames: { attack: 'Attack', defence: 'Defence', vitality: 'Vitality', mana: 'Mana', focus: 'Focus', fire: 'Fire power', water: 'Water power', earth: 'Earth power', lightning: 'Lightning power', speed: 'Speed' },
    // what v points of a stat actually do, in words
    effect(k, v) {
      const pct = x => '+' + Math.round(x) + '%';
      switch (k) {
        case 'attack': return `+${Math.round(v * 10) / 10} Attack`;
        case 'defence': return `+${Math.round(v * 10) / 10} Defence`;
        case 'vitality': return `+${Math.round(v * 10)} maximum health`;
        case 'mana': return `+${Math.round(v * 6)} maximum mana`;
        case 'focus': return `${pct(8 * v)} mana refill`;
        case 'speed': return `${pct(5 * v)} run speed`;
        default: return `${pct(6 * v)} ${this.statNames[k]}`;
      }
    },
  };
  const runesTierMult = runes.tiers.map(t => t.mult);

  // ---------- Golems (the player's look) ----------
  // Pixel rows, facing right. k outline, h/m/d stone light/mid/dark, s seam,
  // g lichen, e eye, L/R the two element slots, c crack that glows with both.
  // empty: colour of an unloaded slot.
  const golems = [
    { name: 'Brute', desc: 'Huge shoulders and fists, head sunk between them.', empty: [58,  30,  34],
      rows: [
        '...kkkkk.kkk.kkkkk...',
        '..khhgghkhhhkhhhghk..',
        '.khhhmmshhmmshhhmmhk.',
        '.khmmmmshLmRshmmmmdk.',
        '.ksmmddssmddsmmmddsk.',
        'khsssssssssssssssshhk',
        'khhhhhshhhhhhshhhhmdk',
        'khmmmmshhhmcmshmmmmdk',
        'kdmmddshmmcmmssmmdddk',
        '.ksssshmmmmcmmsssssk.',
        '.khhhsmmmmcmmdshhhhk.',
        'khhmmssmmmddddshhmmhk',
        'khmmmsssssdsssshmmmdk',
        'kdmddshhhsshhhsmmdddk',
        '.kdddshmmdkdmmsddddk.',
        '..kkkkmmdk.kmddkkkk..',
        '.....kdddk.kdddk.....',
      ] },
    { name: 'Titan', desc: 'A wide V-shaped chest with a glowing crack.', empty: [58,  30,  34],
      rows: [
        '..........k..........',
        '.........khk.........',
        '........khmhk........',
        '...kkkkkhLmRhkkkkk...',
        '..khghhkdmdddkhhggk..',
        '.khmmmmhkssskhmmmmhk.',
        '.ksmmmdshhhhssmmmdsk.',
        '.kssssshhhhhhssssshk.',
        '.khhhshhhhcmmmshhhdk.',
        'khmmmsdmmmcmmmshmmmhk',
        'kdmmmdkdmmmcmdkhmmmdk',
        '.kmsddkksmcmskkdmsdk.',
        '.ksssk.ksscshk.ksssk.',
        'khhhhkkhhsshmhkkhhhhk',
        'khmmmhksmssmdskhmmmdk',
        'khmmmshssshsshsdmmmdk',
        'kddddkhhhhkhhmdkddddk',
        '.kkdkkhmmdkhmmdkkdkk.',
        '...k.kdmddkdmddk.k...',
        '......kddk.kddk......',
      ] },
    { name: 'Crystal', desc: 'A hunched boulder with two crystals on its back.', empty: [96,  88,  124],
      rows: [
        '......k..............',
        '.....kLk..kk.........',
        '.....kLLkkRRk.kkk....',
        '....kLLLkRRRkkhhhk...',
        '....kLLLkRRRkhhmmhk..',
        '....kLLLhhhssmmmeehk.',
        '...kLLhhhhhhssmddsk..',
        '....khhhhhmmssssshhk.',
        '...khhhmmmmmshhhhmdk.',
        '...kssmmmmmmshmmmmdk.',
        '..khgssmmmmmssmmssdk.',
        '.khghmsmmmcmmssshhk..',
        '.khmmmsmmcmcddshhhhk.',
        '.khmmmsmdddddshmmmmhk',
        '.kdmddssddddsshmmmmdk',
        '..kdddkssssshssmmmddk',
        '...kkkhhhhshhmsddddk.',
        '......khmdkkmmdkddk..',
        '......kdddkkdddkkk...',
        '.......kdk..kdk......',
      ] },
    { name: 'Sentinel', desc: 'A stone helm with a glowing visor.', empty: [58,  30,  34],
      rows: [
        '.........kkk.........',
        '........khhhk........',
        '.......khhhhhk.......',
        '......khhmmmmhk......',
        '......khmLLRRdk......',
        '..kkkkksmmmmddkkkkkk.',
        '.khgghhssdddskhhhhghk',
        '.khmmmmssssshshmmmmdk',
        '.ksssssshhhhhssssssdk',
        '.khhhshhhhmmmmshhhhk.',
        '.khhmshmmmmcmmshhmdk.',
        '.khmmshmmmcmmmshmmdk.',
        '.kmmdsmmmmcmmdsmmddk.',
        '.kssssdmmmddddsssssk.',
        '.khhhhksdddddskhhhhk.',
        '.khmmdksssddshshmmdk.',
        '.kmmmdkhhhkkhmsmmmdk.',
        '.kddddkhmdkkhmsddddk.',
        '..kkkkkmddkkmddkkkk..',
        '......kdddkkdddk.....',
      ] },
  ];

  return { M, materials, reactions, elements, elementOrder, spells, spellKey, player, dummy, golems, baseStats, enemies, statuses, elites, bosses, modes, recipe, specials, champions, remix, acts, weakSpot, biomes, cave, progression, runes, treasure,
    world: { w: 3072, h: 1536, chunk: 32 }, view: { w: 384, h: 216 }, step: 1 / 60 };
})();
