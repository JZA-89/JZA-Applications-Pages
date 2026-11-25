'use strict';
/* Cast in Stone prototype — data.js
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

  // ---------- Reactions ----------
  // When a cell of material a touches b, with this chance per tick, a becomes ra
  // and b becomes rb. Checked in both orders, so list each pair once.
  const reactions = [
    { a: M.FIRE,  b: M.WATER, chance: 0.7,  ra: M.EMPTY, rb: M.STEAM },  // fire boils water
    { a: M.MAGMA, b: M.WATER, chance: 0.5,  ra: M.DIRT,  rb: M.STEAM },  // magma quenched
    { a: M.FIRE,  b: M.MOSS,  chance: 0.06, ra: M.FIRE,  rb: M.FIRE  },  // moss catches
    { a: M.MAGMA, b: M.MOSS,  chance: 0.2,  ra: M.MAGMA, rb: M.FIRE  },
    { a: M.FIRE,  b: M.MUD,   chance: 0.04, ra: M.FIRE,  rb: M.DIRT  },  // fire bakes mud
    { a: M.MAGMA, b: M.MUD,   chance: 0.08, ra: M.MAGMA, rb: M.DIRT  },
    { a: M.WATER, b: M.EARTH, chance: 0.01, ra: M.EMPTY, rb: M.MUD   },  // earth soaks
  ];

  // ---------- Elements ----------
  // key: keyboard keys. pad: standard gamepad button index (colours match an
  // Xbox-style pad: A green-ish earth, B red fire, X blue water, Y yellow lightning).
  const elements = {
    fire:      { name: 'Fire',      color: [255, 122, 47],  css: '#ff7a2f', keys: ['KeyQ', 'Digit1'], label: 'Q', pad: 1 },
    water:     { name: 'Water',     color: [63, 169, 255],  css: '#3fa9ff', keys: ['KeyE', 'Digit2'], label: 'E', pad: 2 },
    earth:     { name: 'Earth',     color: [200, 154, 74],  css: '#c89a4a', keys: ['KeyR', 'Digit3'], label: 'R', pad: 0 },
    lightning: { name: 'Lightning', color: [255, 242, 122], css: '#fff27a', keys: ['KeyF', 'Digit4'], label: 'F', pad: 3 },
  };
  const elementOrder = ['fire', 'water', 'earth', 'lightning'];

  // ---------- Spells ----------
  // Each pair of elements (keyed by the two names in alphabetical order,
  // "fire+water") gives three spells:
  //   shot  (left click)  aimed at the cursor
  //   burst (right click) an area around you
  //   move  (hold Space after jumping) moves you, in the direction you press
  // kind: the behaviour in game.js. cd: seconds before that spell again.
  // cost: mana per cast. drain/min: held spells use mana per second and need
  // min to start. power: base damage before stats (game.js damage()).
  // dir (moves): direction when no direction key is held: up, down or facing.
  const spells = {
    'fire+fire': {
      shot: { name: 'Fireball', kind: 'projectile', cd: 0.5, cost: 14, desc: 'Explodes, carves dirt and starts fires.',
        speed: 230, gravity: 70, radius: 9, power: 40, knock: 210, ignite: 0.55, color: [255, 150, 52] },
      burst: { name: 'Fire nova', kind: 'nova', cd: 0.4, cost: 26, desc: 'A ring of flame bursts out around you.',
        radius: 24, power: 26, knock: 220, color: [255, 150, 60] },
      move: { name: 'Rocket jump', kind: 'rocket', cd: 0.45, cost: 16, dir: 'up', desc: 'Blasts under you throw you upwards (A and D lean sideways). They do not hurt you.',
        impulse: 250, radius: 5, power: 18, knock: 160 },
    },
    'water+water': {
      shot: { name: 'Water jet', kind: 'jet', cd: 0.25, drain: 14, min: 5, desc: 'Hold to spray water. Pushes things and fills hollows.',
        speed: 210, spread: 0.12, perTick: 3, push: 0.008, recoil: 70 },
      burst: { name: 'Tidal wave', kind: 'wave', cd: 0.4, cost: 24, desc: 'Water surges out both sides and shoves enemies away.',
        reach: 42, power: 10, knock: 320, count: 56 },
      move: { name: 'Hover', kind: 'hover', drain: 10, min: 4, dir: 'up', desc: 'Hold to rise gently on jets of water; S to sink. Slower than steam, but cheaper.',
        rise: 45, sink: 14, perTick: 2 },
    },
    'earth+earth': {
      shot: { name: 'Boulder', kind: 'boulder', cd: 0.7, cost: 16, desc: 'A heavy lobbed rock. Big knockback, leaves rubble.',
        speed: 200, gravity: 380, power: 32, knock: 300, dig: 3, rubble: 18 },
      burst: { name: 'Stone shell', kind: 'shell', cd: 0.5, cost: 24, desc: 'A ring of dirt rises around you: instant cover.',
        radius: 14, thick: 2, knock: 140 },
      move: { name: 'Pillar', kind: 'pillar', cd: 0.55, cost: 16, dir: 'up', desc: 'Earth rises under you and lifts you up.',
        range: 70, length: 26, width: 7, growRate: 80 },
    },
    'lightning+lightning': {
      shot: { name: 'Bolt', kind: 'bolt', cd: 0.55, cost: 16, desc: 'An instant bolt. Electrifies any water it touches.',
        range: 170, power: 30, knock: 90, chains: 1, chainRange: 16, charge: 70, chargeCells: 2200, color: [255, 246, 170] },
      burst: { name: 'Shock field', kind: 'field', cd: 0.4, cost: 26, desc: 'Shocks everything near you.',
        radius: 34, power: 28, knock: 80, charge: 60, color: [255, 246, 170] },
      move: { name: 'Blink', kind: 'blink', cd: 0.5, cost: 20, dir: 'facing', desc: 'Jump through space in the direction you press.',
        dist: 36 },
    },
    'fire+water': {
      shot: { name: 'Scald', kind: 'cone', cd: 0.2, drain: 20, min: 5, desc: 'Hold: a short cone of scalding steam.',
        range: 34, spread: 0.45, power: 32, perTick: 3 },
      burst: { name: 'Steam cloud', kind: 'cloud', cd: 0.4, cost: 20, desc: 'A thick cloud to hide in. Scalds anyone inside.',
        radius: 24, power: 14, fill: 0.6 },
      move: { name: 'Steam flight', kind: 'thrust', drain: 18, min: 6, dir: 'up', desc: 'Hold Space to fly: steam blasts straight down. Steer with A and D; S to drop.',
        accel: 900, maxSpeed: 150, sideSpeed: 95, sideAccel: 700, steamPerTick: 3 },
    },
    'earth+fire': {
      shot: { name: 'Magma', kind: 'lob', cd: 0.7, cost: 16, desc: 'A lobbed blob of magma. Burns, then cools into dirt.',
        speed: 175, gravity: 380, count: 38, mat: 'MAGMA', power: 15, color: [255, 140, 50] },
      burst: { name: 'Eruption', kind: 'eruption', cd: 0.45, cost: 28, desc: 'Magma bursts out of the ground around you.',
        reach: 28, power: 24, knock: 260, count: 40 },
      move: { name: 'Magma slam', kind: 'slam', cd: 0.6, cost: 22, dir: 'down', desc: 'Dive and smash down, splashing magma.',
        speed: 360, radius: 20, power: 30, knock: 240, count: 26 },
    },
    'earth+water': {
      shot: { name: 'Mud', kind: 'spray', cd: 0.6, cost: 12, desc: 'A spray of mud. Anything it hits, or that walks through it, is slowed.',
        speed: 220, spread: 0.28, count: 50, gravity: 220, mat: 'MUD' },
      burst: { name: 'Mire', kind: 'mire', cd: 0.5, cost: 22, desc: 'The ground around you turns to mud.',
        radius: 32, depth: 2 },
      move: { name: 'Wall climb', kind: 'climb', drain: 8, min: 3, dir: 'up', desc: 'Hold next to a wall to climb it; S to slide down.',
        speed: 55 },
    },
    'lightning+water': {
      shot: { name: 'Arc', kind: 'bolt', cd: 0.55, cost: 18, desc: 'Lightning that jumps between nearby targets.',
        range: 140, power: 20, knock: 60, chains: 3, chainRange: 45, charge: 50, chargeCells: 1500, color: [190, 230, 255] },
      burst: { name: 'Storm', kind: 'storm', cd: 0.4, cost: 28, desc: 'Lightning arcs to every enemy near you.',
        range: 75, power: 22, knock: 90, color: [190, 230, 255] },
      move: { name: 'Arc dash', kind: 'dash', cd: 0.35, cost: 22, dir: 'facing', desc: 'Dash in the direction you press. Further from water.',
        speed: 310, time: 0.12, waterTime: 0.2, power: 20 },
    },
    'earth+lightning': {
      shot: { name: 'Stone spear', kind: 'spear', cd: 0.6, cost: 18, desc: 'A fast shard that bores a tunnel through dirt.',
        speed: 380, bore: 3, boreLength: 90, power: 45, knock: 160, range: 260, color: [190, 196, 210] },
      burst: { name: 'Spikes', kind: 'spikes', cd: 0.45, cost: 26, desc: 'Stone spikes burst from the ground around you.',
        reach: 30, power: 30, knock: 240, height: 7 },
      move: { name: 'Drill', kind: 'drill', drain: 24, min: 6, dir: 'facing', desc: 'Hold to bore through dirt in the direction you press.',
        speed: 110, radius: 10 },
    },
    'fire+lightning': {
      shot: { name: 'Ember lance', kind: 'lance', cd: 0.4, cost: 14, desc: 'A fast burning beam that pierces through enemies.',
        range: 150, power: 24, knock: 60, color: [255, 170, 80] },
      burst: { name: 'Flare', kind: 'flare', cd: 0.4, cost: 24, desc: 'A blast all around you that throws things back hard.',
        radius: 24, power: 32, knock: 340, ignite: 0.3, color: [255, 220, 140] },
      move: { name: 'Blast dash', kind: 'blastdash', cd: 0.45, cost: 18, dir: 'facing', desc: 'An explosion behind you throws you forward.',
        speed: 280, power: 16 },
    },
  };
  const modes = ['shot', 'burst', 'move'];
  function spellKey(a, b) { return a <= b ? a + '+' + b : b + '+' + a; }
  for (const k in spells) { const [a, b] = k.split('+'); if (spellKey(a, b) !== k) throw new Error('Spell key out of order: ' + k); }

  // ---------- Actors ----------
  // Stats feed the damage formula (game.js damage()). Everyone starts equal for now;
  // upgrade cards and co-op finds will change them later.
  const baseStats = () => ({ attack: 10, defence: 10, power: { fire: 1, water: 1, earth: 1, lightning: 1 } });
  const player = {
    w: 11, h: 17, hp: 100, run: 72, accel: 900, airAccel: 520, friction: 14,
    jump: 168, gravity: 480, maxFall: 330, coyote: 0.1, buffer: 0.12,
    regenDelay: 3, regen: 12, respawn: 1.4,
    // mana: refills on its own, faster on the ground. Spending pauses the refill
    // briefly; running dry pauses it longer.
    mana: 100, manaRegen: 16, manaGroundRegen: 30, manaDelay: 0.35, manaEmptyDelay: 0.9,
    // damage per second from touching these (before defence)
    hurt: { fire: 22, magma: 45, charged: 60 },
  };
  const dummy = { w: 7, h: 13, hp: 100, regenDelay: 2.5, respawn: 2 };

  // ---------- Enemies ----------
  // Shale crawler: patrols, chases what it can see, winds up (rears and its eyes
  // flare), lunges, then needs a moment to recover. Big hits stagger it.
  // affinity: damage multiplier by element (a spell averages its two elements).
  // spawn: weight per region (rose, drowned, ember) and the lowest level it appears at.
  const enemies = {
    crawler: { name: 'Shale crawler', desc: 'Winds up, then lunges. A hard hit staggers it.', w: 13, h: 8, hp: 60, attack: 10, defence: 8,
      walk: 22, run: 50, sight: 130, sense: 50, hearing: 110, forget: 4, jump: 165,
      lungeRange: 34, windup: 0.45, lungeSpeed: 215, lungeLift: 90, lungeTime: 0.35, recover: 0.7,
      power: 18, knock: 170, staggerAt: 12, stagger: 0.35,
      respawn: 25, awake: 380, respawnClear: 300,
      // tougher further from the hub: per level above 1
      perLevel: { hp: 0.3, attack: 2, defence: 1 },
      affinity: {}, xp: 1, spawn: { weights: [1, 1, 1], from: 1 } },
    moth: { name: 'Glowmoth', desc: 'Flies. Hovers and glows, then swoops at you. Weak to lightning.', w: 13, h: 7, hp: 36, attack: 9, defence: 6,
      fly: 60, swoop: 230, windup: 0.55, swoopTime: 0.45, recover: 0.9, range: 70, power: 14, knock: 130,
      affinity: { lightning: 1.6, earth: 0.8 }, xp: 1, spawn: { weights: [0.5, 0.8, 0.4], from: 1 } },
    delver: { name: 'Delver', desc: 'Swims through dirt and bursts out to bite. Weak to water; earth barely hurts it.', w: 13, h: 9, hp: 70, attack: 12, defence: 9,
      dig: 48, emergeRange: 34, windup: 0.4, lunge: 200, power: 22, knock: 160, surface: 1.6,
      affinity: { water: 1.6, earth: 0.4 }, xp: 1.3, spawn: { weights: [0.35, 0.35, 0.3], from: 2 } },
    spitter: { name: 'Cinder spitter', desc: 'Sits in a wall and lobs magma. Fire does nothing to it; water hurts it badly.', w: 11, h: 11, hp: 55, attack: 10, defence: 10,
      range: 190, every: 2.4, speed: 175, power: 14, glob: 10,
      affinity: { fire: 0, water: 1.8, lightning: 1.1 }, xp: 1.2, spawn: { weights: [0.15, 0.1, 0.7], from: 1 } },
    warden: { name: 'Slate warden', desc: 'Armoured. Slow, but its ground slam hits hard. Fire and lightning glance off; earth and water crack it.', w: 17, h: 16, hp: 170, attack: 14, defence: 18,
      walk: 22, slamRange: 30, windup: 0.9, radius: 30, power: 30, knock: 260, recover: 1.1,
      affinity: { fire: 0.4, lightning: 0.4, earth: 1.6, water: 1.3 }, xp: 2.5, spawn: { weights: [0.15, 0.25, 0.25], from: 3 } },
  };
  // shared by every enemy kind
  for (const k in enemies) Object.assign(enemies[k], { sight: enemies.crawler.sight, sense: enemies.crawler.sense, hearing: enemies.crawler.hearing, forget: enemies.crawler.forget,
    respawn: 25, awake: 380, respawnClear: 300, perLevel: enemies.crawler.perLevel }, { ...enemies[k] });
  // status effects: a status makes one element hit harder
  const statuses = {
    wet: { name: 'Wet', boosts: 'lightning', by: 1.5, time: 4 },
    muddy: { name: 'Muddy', boosts: 'fire', by: 1.4 },
    burning: { name: 'Burning', boosts: 'water', by: 1.4 },
  };
  const elites = { chance: 0.08, from: 2, hp: 1.8, attack: 1.3 };

  // ---------- Regions ----------
  // The cave spreads in every direction from the hub. Each region has its own
  // stone colours (strata), background, lichen, and pools in its chambers.
  // Difficulty (level) grows with distance from the hub: 1 + distance / levelEvery.
  // poolFrom: where a chamber's pool surface sits, from its top (0) to its bottom (1).
  const biomes = [
    { id: 'rose', name: 'Rose Hollows', bg: [30, 22, 46], lichen: 0.55, hang: 0.3, pool: null, mud: 0,
      strata: [[124, 76, 92], [142, 92, 96], [104, 64, 90], [160, 114, 104], [92, 58, 84], [132, 84, 100]] },
    { id: 'drowned', name: 'Drowned Galleries', bg: [16, 26, 44], lichen: 0.3, hang: 0.4, pool: 'WATER', poolFrom: 0.6, mud: 0.3,
      strata: [[72, 94, 108], [86, 108, 118], [60, 80, 98], [100, 122, 128], [54, 72, 90], [80, 100, 112]] },
    { id: 'ember', name: 'Ember Veins', bg: [34, 16, 24], lichen: 0.3, hang: 0.12, pool: 'MAGMA', poolFrom: 0.8, mud: 0,
      strata: [[112, 58, 52], [128, 70, 58], [88, 46, 48], [148, 88, 66], [74, 40, 44], [118, 64, 56]] },
  ];
  const cave = { chambers: 46, spacing: 150, hubRadius: 300, regionDistance: 540, levelEvery: 250,
    tunnel: [12, 17], plugChance: 0.16, loopChance: 0.55, lodestones: 8, stoneReach: 22, stoneRepair: 90 };

  // ---------- Getting stronger ----------
  // Experience from kills and discoveries; each level gives stat points, spent at a Lodestone.
  // xpFor(L): experience needed to go from level L to L+1.
  // ---------- Treasure ----------
  // Relic caches are sealed in by the cave (buried, under magma, under water,
  // high in a ceiling, or inside rock). Crystal veins break into shards.
  const treasure = {
    cacheChance: 0.6,          // per chamber
    kinds: { buried: 0.28, high: 0.45, pool: 0.7, rock: 0.4 },
    xp: L => 30 * L, shards: L => 12 * L,
    crucibleChance: L => L >= 5 ? 0.1 : 0,   // a deep cache may hold the Crucible
    veinChance: 0.6, extraVeins: 40,
    // the Forge, at a Lodestone
    pointCost: n => 80 + 40 * n,              // n = points already bought
    levelUpCost: r => Math.round((8 + 5 * r.level) * [1, 2, 4, 8][r.tier]),
    maxRuneLevel: 30,
  };

  const progression = {
    xpFor: L => Math.round(50 + 30 * (L - 1) + 6 * (L - 1) * (L - 1)),
    pointsPerLevel: 3,
    killXp: (level, kind, elite) => Math.round((elite ? 3 : 1) * ((enemies[kind] && enemies[kind].xp) || 1) * (8 + 6 * level)),
    lodestoneXp: 25,
    // per point spent
    stats: [
      { id: 'attack', name: 'Attack', desc: 'Every spell does more damage.', per: 1, show: v => 10 + v },
      { id: 'defence', name: 'Defence', desc: 'You take less damage.', per: 1, show: v => 10 + v },
      { id: 'vitality', name: 'Vitality', desc: '+10 maximum health.', per: 10, show: v => 100 + 10 * v },
      { id: 'mana', name: 'Mana', desc: '+10 maximum mana.', per: 10, show: v => 100 + 10 * v },
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
      tidalCore:   { slot: 'core', name: 'Tidal core', stats: { water: 1.5 }, trait: 'tidal', desc: 'Steam flight and Hover cost no mana while you are in or just above water.' },
      crucible:    { slot: 'core', name: 'Crucible', stats: { fire: 2 }, trait: 'melt', desc: 'Your fire melts rock: Fireball, Fire nova, Rocket jump, Flare and Ember lance turn rock into magma.', rare: true },
      quarryFists: { slot: 'arms', name: 'Quarry fists', stats: { attack: 1.5 }, trait: 'quarry', desc: 'Spells with earth knock enemies back much harder.' },
      splitArms:   { slot: 'arms', name: 'Splitting arms', stats: { fire: 1 }, trait: 'split', desc: 'Fireballs burst into three smaller fireballs.' },
      thriftArms:  { slot: 'arms', name: 'Thrifty arms', stats: { focus: 1 }, trait: 'thrifty', desc: 'Every fourth Shot costs no mana.' },
      mireArms:    { slot: 'arms', name: 'Mire arms', stats: { earth: 1, water: 0.5 }, trait: 'mudburst', desc: 'Your Bursts leave mud on the ground around you.' },
      springLegs:  { slot: 'legs', name: 'Spring legs', stats: { speed: 1 }, trait: 'spring', desc: 'You jump much higher.' },
      anchorLegs:  { slot: 'legs', name: 'Anchor legs', stats: { defence: 2 }, trait: 'anchor', desc: 'You barely get knocked back.' },
      swiftLegs:   { slot: 'legs', name: 'Swift legs', stats: { speed: 1.5 }, trait: 'swift', desc: 'Blink, Arc dash and Blast dash cost half.' },
      diverLegs:   { slot: 'legs', name: 'Diver legs', stats: { water: 1 }, trait: 'diver', desc: 'You swim fast and mud never slows you.' },
    },
    dropChance: 0.14, eliteDrop: 1, bag: 24,
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
        case 'mana': return `+${Math.round(v * 10)} maximum mana`;
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

  return { M, materials, reactions, elements, elementOrder, spells, spellKey, player, dummy, golems, baseStats, enemies, statuses, elites, modes, biomes, cave, progression, runes, treasure,
    world: { w: 2048, h: 1024, chunk: 32 }, view: { w: 320, h: 180 }, step: 1 / 60 };
})();
