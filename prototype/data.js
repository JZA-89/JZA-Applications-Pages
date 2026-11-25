'use strict';
/* KILN prototype — data.js
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
  materials[M.ROCK]  = { name: 'Rock', state: 'static', solid: true, hard: true, density: 99,
    colors: [[42, 48, 74], [50, 58, 88]] };  // drawn as faceted slate by position (render.js)
  materials[M.DIRT]  = { name: 'Dirt', state: 'static', solid: true, density: 99,
    colors: [[132, 84, 100], [142, 92, 96]] };  // drawn as layered strata by position (render.js)
  materials[M.EARTH] = { name: 'Loose earth', state: 'powder', solid: true, density: 6, slide: 0.9,
    colors: [[184, 140, 128], [172, 128, 118], [194, 152, 136], [178, 134, 124]] };
  materials[M.WATER] = { name: 'Water', state: 'liquid', density: 3, flow: 5, conducts: true, alpha: 0.78,
    colors: [[44, 86, 196], [48, 92, 204], [40, 80, 188]] };
  materials[M.STEAM] = { name: 'Steam', state: 'gas', density: 1, life: [90, 170], condense: 0.06,
    colors: [[204, 206, 230], [218, 218, 238], [190, 192, 220]] };
  materials[M.FIRE]  = { name: 'Fire', state: 'fire', density: 0.5, life: [14, 34], glow: true, burns: 22,
    colors: [[255, 214, 120], [255, 150, 52], [232, 84, 30], [150, 40, 20]] };
  materials[M.MUD]   = { name: 'Mud', state: 'powder', density: 5, slide: 0.25, moveChance: 0.45, slows: 0.38,
    colors: [[96, 84, 104], [88, 76, 96], [104, 92, 112], [92, 80, 100]] };
  materials[M.MAGMA] = { name: 'Magma', state: 'liquid', density: 7, flow: 1, moveChance: 0.35, glow: true,
    burns: 45, life: [200, 255], coolsTo: M.DIRT,
    colors: [[255, 120, 40], [255, 168, 64], [236, 84, 28], [255, 196, 96]] };
  materials[M.MOSS]  = { name: 'Lichen', state: 'static', solid: true, flammable: true, density: 99,
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
  // Keyed by the two element names in alphabetical order ("fire+water").
  // kind: which behaviour in game.js runs it. Everything else is its numbers.
  // cd: seconds before the same spell can be cast again.
  // cost: mana per cast. drain: mana per second while held (jet, thrust).
  // power: base damage, before stats (see game.js damage()).
  const spells = {
    'fire+fire': { name: 'Fireball', kind: 'projectile', cd: 0.5, cost: 14,
      desc: 'Explodes, carves dirt and starts fires.',
      speed: 230, gravity: 70, radius: 9, power: 40, knock: 210, ignite: 0.55, color: [255, 150, 52] },
    'water+water': { name: 'Water jet', kind: 'jet', cd: 0.25, drain: 14, min: 5,
      desc: 'Hold to spray water. Pushes things and fills hollows.',
      speed: 210, spread: 0.12, perTick: 3, push: 0.008, recoil: 70, mat: 'WATER' },
    'earth+earth': { name: 'Earth pillar', kind: 'pillar', cd: 0.55, cost: 16,
      desc: 'Grows dirt out of the surface you aim at. Aim down to rise.',
      range: 70, length: 26, width: 7, growRate: 70 },
    'lightning+lightning': { name: 'Bolt', kind: 'bolt', cd: 0.55, cost: 16,
      desc: 'An instant bolt. Electrifies any water it touches.',
      range: 170, power: 30, knock: 90, charge: 70, chargeCells: 2200, color: [255, 246, 170] },
    'fire+water': { name: 'Steam', kind: 'thrust', cd: 0, drain: 18, min: 6,
      desc: 'Hold to fly away from where you aim. Drains mana fast.',
      accel: 1050, maxSpeed: 190, steamPerTick: 2 },
    'earth+fire': { name: 'Magma', kind: 'lob', cd: 0.7, cost: 16,
      desc: 'A lobbed blob of magma. Burns, then cools into dirt.',
      speed: 175, gravity: 380, count: 38, mat: 'MAGMA', power: 15, color: [255, 140, 50] },
    'earth+water': { name: 'Mud', kind: 'spray', cd: 0.6, cost: 12,
      desc: 'A spray of mud that slows anything inside it.',
      speed: 190, spread: 0.32, count: 50, gravity: 300, mat: 'MUD' },
    'lightning+water': { name: 'Arc dash', kind: 'dash', cd: 0.35, cost: 22, freshPress: true,
      desc: 'Dash where you aim. Goes further from water.',
      speed: 310, time: 0.12, waterTime: 0.2, power: 20 },
    'earth+lightning': { name: 'Stone spear', kind: 'spear', cd: 0.6, cost: 18,
      desc: 'A fast shard that bores a tunnel through dirt.',
      speed: 380, bore: 3, boreLength: 90, power: 45, knock: 160, range: 260, color: [190, 196, 210] },
    'fire+lightning': { name: 'Flare', kind: 'blast', cd: 0.75, cost: 18,
      desc: 'A close-range blast that throws things back hard.',
      reach: 15, radius: 11, power: 35, knock: 330, recoil: 90, ignite: 0.3, color: [255, 220, 140] },
  };
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

  return { M, materials, reactions, elements, elementOrder, spells, spellKey, player, dummy, golems, baseStats,
    world: { w: 512, h: 192, chunk: 32 }, view: { w: 320, h: 180 }, step: 1 / 60 };
})();
