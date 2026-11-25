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
    EMPTY: 0, ROCK: 1, DIRT: 2, EARTH: 3, WATER: 4, STEAM: 5, FIRE: 6, MUD: 7, MAGMA: 8, MOSS: 9,
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
  const enemies = {
    crawler: { name: 'Shale crawler', w: 13, h: 8, hp: 60, attack: 10, defence: 8,
      walk: 22, run: 50, sight: 130, sense: 50, hearing: 110, forget: 4, jump: 165,
      lungeRange: 34, windup: 0.45, lungeSpeed: 215, lungeLift: 90, lungeTime: 0.35, recover: 0.7,
      power: 18, knock: 170, staggerAt: 12, stagger: 0.35,
      count: 3, spots: [214, 338, 480], respawn: 7 },
  };

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

  return { M, materials, reactions, elements, elementOrder, spells, spellKey, player, dummy, golems, baseStats, enemies, modes,
    world: { w: 512, h: 192, chunk: 32 }, view: { w: 320, h: 180 }, step: 1 / 60 };
})();
