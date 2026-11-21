/* MORPHOS: a deterministic little ecology, with no browser dependencies. */
(function (global) {
  'use strict';
  const TAU=Math.PI*2, PULSE_HALF_ANGLE=Math.PI/3, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const length=(x,y)=>Math.hypot(x,y), distance=(a,b)=>length(a.x-b.x,a.y-b.y);
  const thresholds=[];
  const CHUNK=960, NURSERY_RADIUS=1250, NURSERY_GRACE=60, FAMILIES=['venomist','predator','riptide','summoner','stalker'];
  // Every organism that can hurt the player. Jellies never pursue, so pursuit-based checks exclude them separately.
  const HOSTILE_KINDS=['hunter','apex','armoured','swarmer','sentinel','jelly'],ORGANISM_KINDS=['prey','grazer',...HOSTILE_KINDS];
  const isHostile=o=>!!o&&HOSTILE_KINDS.includes(o.kind);
  // Co-op. LOCAL: what each device keeps for itself about a creature (its own player's credit for the kill, and
  // bookkeeping). PRIVATE: behaviour fields only the owner needs; they travel when ownership is handed over.
  // STATUS: what a player's attack can leave on a creature, reported to its owner. SIGHT: how far around a
  // player creatures are shared.
  const COOP_LOCAL=new Set(['_bit','_ta','threatMine','threatBy','credit','huntCredit','stalkCredit','lastFamily','attackTokens','ramAt','puppet','owner','remoteCredit','heldUntil','venomFrom','bleedFrom','dotOut','_seen','_tx','_ty','_n','_dealt','_ownerHp']);
  const COOP_PRIVATE=new Set(['cooldown','stamina','exhausted','tx','ty','wander','lastSeenX','lastSeenY','pursuit','fedTime','shedClock','broodClock','missNear','targetId','foraging','huntBrood','broodAggroUntil','anchorX','anchorY','biome']);
  const COOP_UNSAVED=new Set(['_bit','_ta','threatMine','threatBy','puppet','owner','remoteCredit','heldUntil','venomFrom','bleedFrom','dotOut','_seen','_tx','_ty','_n','_dealt','_ownerHp']);
  // Co-op toughness is decided when something appears and never changes afterwards. Creatures are not given extra
  // health: each other player swimming nearby shifts the size roll towards larger ones (fewer small, more large),
  // and a larger creature is tougher, hits harder and is worth more, as in a solo life. A boss gets extra health
  // for each other player nearby. Both stop growing at three other players: a bigger party simply fights faster.
  const COOP_PARTY_CAP=3,COOP_FEWER_SMALL=.04,COOP_MORE_LARGE=.08,COOP_BOSS_HEALTH=.5, BOSS_HEALTH_UNIT=21;
  const COOP_VIEW_DELAY=.11,COOP_DOWN_SECONDS=60,COOP_REVIVE_SECONDS=4;
  const COOP_STATUS_MAX={poison:10,poisonDamage:1000,venomStacks:8,slowTime:2,stun:4,bleed:10,bleedDamage:1000,flee:6};
  const COOP_STATUS=['poison','poisonDamage','venomStacks','slowTime','stun','bleed','bleedDamage','flee'],COOP_SIGHT=1600,coopSight=b=>b&&b.lr>2?b.lr*CHUNK+200:COOP_SIGHT;
  const ancientName=name=>String(name).replace(/^The /,'The Ancient ');
  // Experience: each family banks its own experience from matching actions and climbs its own ladder.
  // Families never affect each other's costs: a rank only gets dearer the higher that family already is.
  // Size: one cell per level. The body's area grows with its cells, so its width grows with their square root,
  // up to MAX_BODY_CELLS; levels beyond that keep adding cells, stat points and mastery without a bigger body.
  // Growth is gentle on purpose: a 24-cell colony is a little over twice as wide as a single cell, not five times. The pond, its
  // landmarks and the camera stay in proportion all game, so it remains a world you explore rather than one you outgrow.
  // Wild predators keep pace with your level instead (WILD_TOUGH, WILD_MIGHT): their health and bite grow as your kit does.
  // Strength is separate from width: health, damage and food value follow SIZE_POWER, which keeps them on the curve they had when
  // bodies grew with the square root of the cell count (width^2.2 now equals the old width^1.1).
  const waterScale=(x,y)=>bodyScale(waterLevel(x,y)+1),waterPower=(x,y)=>Math.pow(waterScale(x,y),SIZE_POWER);
  const BODY_GROWTH=.25,SIZE_POWER=1.1*.5/BODY_GROWTH,wildTough=level=>1+2.6*(1-Math.exp(-Math.max(0,level-3)/8)),wildMight=level=>1+Math.min(.35,.02*Math.max(0,level));
// The pond has a fixed difficulty that depends only on where you are. Water has a level: 0 in the nursery, then one more for every
  // ZONE_STEP units from it. Everything that lives in water is made for that level (its size, health, bite and food value), whatever
  // the level of the colony that swims in. Shallow water stays easy for good; deep water has to be grown into.
// Level gap. A creature's level is its water's level; the colony's is its cell count less one. Each level of difference changes the
  // damage dealt and taken by 8% (you deal less to, and take more from, what is above you), and what a kill or a meal is worth by 12%.
  // This is what makes water above your level dangerous and water below it poor, at every size.
  // One curve for damage across a level gap (you dealing, d = your level − its level; or taking, d = its level − yours), and one for worth.
  const gapDamage=d=>clamp(1+.08*d,.35,2.2),gapDeal=gapDamage,gapTake=gapDamage,gapWorth=d=>clamp(1+.12*d,.2,1.3);
// Scenery changes slowly with depth. Each deep kind has a water level where it first shows, a level where it is commonest and a share
  // at that peak; between and beyond, its share rises and falls gradually, so the pond you swim through is never suddenly different.
  const DEEP_SCENERY=[['spire',8,16,.42,.18],['tube',14,22,.4,.22],['rib',20,30,.46,.46]];
  const deepScenery=(level,roll)=>{let acc=0;for(const [kind,from,peak,share,tail] of DEEP_SCENERY){const s=level<from?0:level<=peak?share*(level-from+1)/(peak-from+1):Math.max(tail,share-(level-peak)*.03);acc+=s;if(roll<acc)return kind;}return '';};
  const ZONE_STEP=850,MAX_WATER=40,waterLevel=(x,y)=>{const d=Math.hypot(x,y);return d<=1250?0:Math.min(MAX_WATER,1+Math.floor((d-1250)/ZONE_STEP));};
  const DEPTHS=[{from:0,name:'The Nursery'},{from:1,name:'Sunlit water'},{from:6,name:'The Reaches'},{from:12,name:'The Glass Fields'},{from:18,name:'The Deeps'},{from:24,name:'The Abyss'},{from:30,name:'The Trench'}],depthAt=level=>{let out=DEPTHS[0];for(const d of DEPTHS)if(level>=d.from)out=d;return out;};
  const MAX_BODY_CELLS=30,bodyScale=cells=>Math.pow(Math.max(1,Math.min(cells,MAX_BODY_CELLS)),BODY_GROWTH);
  // A boss is built from its own level, as RPG bosses usually are: its size, health, damage and cruise speed are those of a colony of
  // that many cells (base speed 144, the player's own base with no stats), whatever size you are when it wakes.
  function bossScale(type){return bodyScale(BOSSES[type]?BOSSES[type].level:1);}
  function bossPower(type){return Math.pow(bossScale(type),SIZE_POWER);}
  function bossCruise(type){return 144*Math.pow(bossScale(type),.45);}
  const RANK_COSTS=[240,700,1500,2800,4500],MASTERY_STEP=1000,MAX_RANK=5;
  // What wakes each class's ability: kills, divisions, venom stings or venom kills, close calls at speed, seconds hidden near a predator.
  const WAKE_NEEDS={predator:12,summoner:3,venomist:2,riptide:5,stalker:5};
  const XP_RATE={venomist:1.5,predator:.48,riptide:.5,summoner:2.1,stalker:1.05};
  const STAT_DEEP_STAGE=30,attributeCap=stage=>stage>=STAT_DEEP_STAGE?12:Math.min(10,2+stage);
  function rankCost(level){const n=Math.max(0,Math.floor(level||0));return n<RANK_COSTS.length?RANK_COSTS[n]:RANK_COSTS[RANK_COSTS.length-1]+(n-RANK_COSTS.length+1)*MASTERY_STEP;}
  // Body slots: one mutation per part. Every part is open from the first cell, so a mutation can be equipped as soon as it is found.
  const BODY_PARTS=[{key:'mouth',name:'Mouth',stage:0},{key:'membrane',name:'Membrane',stage:0},{key:'flagellum',name:'Flagellum',stage:0},{key:'organ',name:'Strike organ',stage:0},{key:'nucleus',name:'Nucleus',stage:0},{key:'senses',name:'Senses',stage:0}];
  const MUTATION_SLOT_STAGES=BODY_PARTS.map(b=>b.stage);
  const SANCTUARY_REST_SECONDS=3, SANCTUARY_REASONS={danger:'Lose the nearby threat',combat:'Let your attacks settle',hurt:'Let your membrane settle',resources:'Recovering health and stamina',nutrition:'Replenishing nutrition',moving:'Stay still and let abilities settle',resting:'Resting',complete:'Rest complete'};
  const biomeNames=['Nutrient shallows','Diatom reef','The bloom'];
  const traitNames={
    venomist:['Venom gland','Spitting fan','Virulent sacs','Plague bloom','Necrotic heart'],
    predator:['Feeding jaws','Rending jaws','Frenzy gland','Apex jaws','Leviathan jaws'],
    riptide:['Flagellum','Wide pull','Vortex colony','Maelstrom','Tidal engine'],
    summoner:['Budding membrane','Soldier brood','Brood chamber','Hive mind','Royal brood'],
    stalker:['Veiled membrane','Ghost cilia','Mimic organs','Phantom colony','Dread shroud']
  };
  // The evolution tree. Ranks I, III and V are fixed (V is the capstone, MAX_RANK); at ranks II and IV each family forks into two specialisations
  // (a keeps the original name). Hybrids grow on their own once two neighbouring families both reach rank II.
  const FORKS={
    venomist:{2:{a:{name:'Spitting fan',effect:'Venom volley fires two extra globs.'},b:{name:'Lingering toxin',effect:'Poison lasts twice as long.'}},4:{a:{name:'Plague bloom',effect:'A rupture passes all of its stacks to each neighbour, not half.'},b:{name:'Neurotoxin',effect:'Creatures carrying 5 or more stacks are slowed and bite 40% weaker.'}}},
    predator:{2:{a:{name:'Rending jaws',effect:'Bites make creatures bleed.'},b:{name:'Gullet',effect:'Devour creatures up to three quarters of your size, and devouring heals you.'}},4:{a:{name:'Apex jaws',effect:'A kill from Pounce resets Pounce.'},b:{name:'Blood rush',effect:'At full Frenzy, every bite heals you.'}}},
    riptide:{2:{a:{name:'Wide pull',effect:'Your whirlpool reaches further and holds creatures up to your own size.'},b:{name:'Grinding current',effect:'Creatures held in your whirlpool take damage the whole time.'}},4:{a:{name:'Maelstrom',effect:'Your whirlpool ends by hurling what it holds outward hard, hurting each creature thrown.'},b:{name:'Eye of the storm',effect:'Inside your own whirlpool you swim 25% faster and take 30% less damage.'}}},
    summoner:{2:{a:{name:'Soldier brood',effect:'Broodlings are 60% tougher and bite 40% harder.'},b:{name:'Spore brood',effect:'Broodlings burst into poison when they die, and bud back faster.'}},4:{a:{name:'Hive mind',effect:'One more broodling, and Swarm lasts twice as long.'},b:{name:'Devouring brood',effect:'Kills by your broodlings heal you.'}}},
    stalker:{2:{a:{name:'Ghost cilia',effect:'You conceal 30% faster.'},b:{name:'Ambush jaws',effect:'Ambushes deal 30% more damage.'}},4:{a:{name:'Phantom colony',effect:'Decoys last 50% longer.'},b:{name:'Shadow lattice',effect:'While sneaking, predators see you 25% less far.'}}}
  };
  const FAMILY_RING=['predator','venomist','summoner','riptide','stalker'];
  const HYBRIDS={
    venomFangs:{name:'Venom fangs',families:['predator','venomist'],effect:'Bites and Pounce add two poison stacks.'},
    sporeSwarm:{name:'Spore swarm',families:['venomist','summoner'],effect:'Broodling bites add a poison stack.'},
    shoal:{name:'Shoal',families:['summoner','riptide'],effect:'Broodlings keep pace when you swim fast, and strike whatever you ram.'},
    ghostCurrent:{name:'Ghost current',families:['riptide','stalker'],effect:'While swimming fast, predators see you 30% less far, and a near miss hides you.'},
    ambusher:{name:'Ambush predator',families:['stalker','predator'],effect:'Ambushes deal 40% more damage, and an ambush kill heals you.'}
  };
  const rankName=(family,rank,fork)=>rank===2||rank===4?(FORKS[family][rank][fork||'a']||FORKS[family][rank].a).name:traitNames[family][rank-1];
  const reasons={venomist:'Poisoning your prey grew venom glands.',predator:'Biting and killing grew stronger jaws.',riptide:'Fast swimming, close escapes and rams grew flagella and a sleeker body.',summoner:'Your broodlings\' fights grew a budding membrane.',stalker:'Useful stealth and ambushes grew a concealed membrane and a decoy organ.'};
  const ABILITIES={
    venomist:{name:'Venom volley',description:'Spit an aimed fan of venom. Each glob adds a poison stack. From rank I, a glob that hits a creature already carrying 3 or more stacks ruptures it: the poison bursts and spreads to its neighbours.',key:'W',cost:24,cooldown:8},
    predator:{name:'Pounce',description:'Lunge at your aim. The first creature you meet takes a heavy bite and is stunned. A kill refunds half the cooldown.',key:'E',cost:26,cooldown:8},
    riptide:{name:'Whirlpool',description:'Spin up a whirlpool where you are. Creatures much smaller than you are pulled to its centre and held there, unable to attack; bigger ones and bosses are slowed. Loose food is drawn in. When it ends it lets everything go outward.',key:'A',cost:26,cooldown:12},
    summoner:{name:'Swarm',description:'Bud a short-lived broodling and send every broodling at your aim, faster and harder-biting for a few seconds.',key:'S',cost:26,cooldown:10},
    stalker:{name:'Decoy',description:'Leave a convincing phantom to distract hunters and briefly conceal yourself.',key:'D',cost:24,cooldown:11}
  };
  // The basic attack ("Strike"). Unevolved cells Jab; afterwards the strongest family sets the shape
  // and every other grown family adds its trait to whatever that shape hits (CLAUDE.md R14).
  const STRIKES={
    pulse:{name:'Jab',description:'Short range. Your membrane punches forward as a blunt arm. Every cell starts with it.'},
    venomist:{name:'Spit',description:'Medium range. A fast glob of venom. Every hit adds a poison stack.'},
    predator:{name:'Bite',description:'Short range. Heavy jaws snap shut in front of you. Creatures much smaller than you are devoured whole.'},
    riptide:{name:'Surge',description:'Dart forward and strike everything you pass through. Briefly untouchable while surging.'},
    summoner:{name:'Command pulse',description:'A signal that reaches a little further than Jab. Whatever they hit is marked as your broodlings\' target.'},
    stalker:{name:'Needle',description:'Long range. A silent shot that locks onto the creature nearest your aim. Huge damage on targets that have not noticed you.'},
    spikes:{name:'Spike gun',description:'Medium range. Hold to fire a fast stream of small spikes.'},
    spores:{name:'Spore burst',description:'Short range. A wide spray of spores.'}
  };
  const STRIKE_TRAITS={venomist:'adds a poison stack',predator:'hits harder',riptide:'travels faster and further, and pushes you forward',summoner:'marks the target for your broodlings',stalker:'hits harder on unaware targets and keeps you better hidden'};
  const FAMILY_RGB={venomist:[157,224,135],predator:[240,164,126],riptide:[119,216,238],summoner:[226,204,143],stalker:[174,172,231]};
  const ATTRIBUTES={
    vitality:{key:'vitality',name:'Vitality',description:'+12% of base maximum health per point.',maxRank:12},
    reserves:{key:'reserves',name:'Reserves',description:'+12 maximum stamina per point.',maxRank:12},
    recovery:{key:'recovery',name:'Recovery',description:'+1.5 stamina and +0.12% of maximum health regenerated per second.',maxRank:12},
    power:{key:'power',name:'Power',description:'+8% base Strike, venom and poison damage per point.',maxRank:12},
    reach:{key:'reach',name:'Reach',description:'+6 feeding reach, +10% range for shots, +5% for Jab and Bite, and wider landmark sensing.',maxRank:12},
    mobility:{key:'mobility',name:'Mobility',description:'+6% base movement speed and 0.35 less stamina per second while swimming fast.',maxRank:12}
  };
  const MUTATIONS={
    barbedShell:{key:'barbedShell',perk:'Barbs stun an attacker for [0.25] seconds.',name:'Barbed shell',description:'Return {20}% of damage taken and {50}% of damage blocked to the attacker. Blocks send venom back too.',family:'summoner'},
    // v35.8 keyword mutations. Each effect comes from the body part that holds it. Triggers exist only at Rare or better (minTier 2);
    // class-move changes only at Epic or better (minTier 3) and sit in the Nucleus, the colony's command centre that grows each move's organs.
    bileSac:{key:'bileSac',minTier:2,perk:'Swallowing also restores [5] stamina.',name:'Bile sac',description:'Swallowing a creature whole makes you spit digestive acid: creatures beside you take {2} poison stacks.',family:'predator'},
    clingingSlime:{key:'clingingSlime',minTier:2,perk:'The slow lasts [0.3] seconds longer.',name:'Clinging slime',description:'Creatures that hit you get your slime on them and are slowed for {1.5} seconds.',family:'summoner'},
    tailFlick:{key:'tailFlick',minTier:2,perk:'Recharges [0.5] seconds sooner.',name:'Tail flick',description:'Starting a fast swim flicks your flagellum back: a creature right behind you is stunned for {0.6} seconds. Recharges in 4 seconds.',family:'riptide'},
    echoNucleus:{key:'echoNucleus',minTier:2,perk:'The window lasts [1] second longer.',name:'Echo nucleus',description:'After you use a class move, your next Strike within 4 seconds hits {30}% harder.',family:'summoner'},
    pitOrgan:{key:'pitOrgan',minTier:2,perk:'Poisoned creatures take a further [5]% more.',name:'Pit organ',description:'You sense poison: poisoned creatures stay fully visible, even cloaked ones, and take {10}% more damage from you.',family:'stalker'},
    rendingPounce:{key:'rendingPounce',minTier:3,perk:'The bleeding lasts [1] second longer.',name:'Rending pounce',description:'Pounce tears its target open: it bleeds for {35}% of your attack a second, for 4 seconds.',family:'predator'},
    clingingVenom:{key:'clingingVenom',minTier:3,perk:'Pools are [25]% wider.',name:'Clinging venom',description:'Venom volley globs that miss splash into a pool of venom for {3} seconds; creatures in it gain a poison stack every half second.',family:'venomist'},
    lastBreath:{key:'lastBreath',minTier:3,perk:'The burst also adds [1] poison stack.',name:'Last breath',description:'Broodlings that die burst into stinging cells, stunning creatures beside them for {0.8} seconds.',family:'summoner'},
    toxicHusk:{key:'toxicHusk',minTier:3,perk:'The burst is [25]% wider.',name:'Toxic husk',description:'Your decoy is a shed husk full of toxin: when it ends it bursts, giving creatures nearby {3} poison stacks.',family:'stalker'},
    venomEddy:{key:'venomEddy',minTier:3,perk:'Stacks build [20]% faster.',name:'Venom eddy',description:'Your venom rides your Whirlpool: creatures it holds gain {1} poison stacks a second.',family:'riptide'},
    // v36.1 Legendary rule changes (minTier 4): each changes what a move or a body part does. Written values are scaled by Legendary power (1.55).
    dartFlagellum:{key:'dartFlagellum',minTier:4,perk:'Darts cost [2] less stamina.',name:'Darting flagellum',description:'Your fast swim becomes a dart: pressing it throws you {155} forward in a fifth of a second, untouchable on the way, for 24 stamina. Holding it does nothing more.',family:'riptide'},
    gorgerStomach:{key:'gorgerStomach',minTier:4,perk:'The healing is [10]% stronger.',name:'Gorger stomach',description:'Your stomach holds half as much again. While it is more than two-thirds full you heal {0.4}% of your maximum health a second.',family:'predator'},
    wanderingEddy:{key:'wanderingEddy',minTier:4,perk:'Its pull is [10]% wider.',name:'Wandering eddy',description:'Your Whirlpool spins round your own body and travels with you, but it is a quarter smaller. It holds and lets go as before.',family:'riptide'},
    glassSkin:{key:'glassSkin',minTier:4,perk:'You can conceal again [0.3] seconds sooner after a glancing hit.',name:'Glass skin',description:'While you are concealed, the first hit that finds you glances off your clear skin and does no damage. It ends your concealment.',family:'stalker'},
    // v36.1 duo mutations: Legendary, and they appear only once you hold rank II in both of their classes. They cover the five pairs that have no hybrid.
    ramJaw:{key:'ramJaw',minTier:4,duo:['predator','riptide'],perk:'Ram bites heal [1]% of your health.',name:'Ramming jaw',description:'Ramming closes your jaws on what you hit: a ram also bites for {65}% of your attack.',family:'predator'},
    packFeeding:{key:'packFeeding',minTier:4,duo:['predator','summoner'],perk:'Also restores [3] stamina.',name:'Pack feeding',description:'A creature your broodlings kill feeds you: you gain a frenzy stack and heal {1.3}% of your maximum health.',family:'summoner'},
    toxicWake:{key:'toxicWake',minTier:4,duo:['venomist','riptide'],perk:'The wake is [15]% wider.',name:'Toxic wake',description:'Fast swimming leaves venom in your wake for {1} seconds. Creatures in it gain a poison stack every half second.',family:'venomist'},
    numbingVenom:{key:'numbingVenom',minTier:4,duo:['venomist','stalker'],perk:'Numbed creatures take [5]% more damage from you.',name:'Numbing venom',description:'Your venom numbs the senses: a creature carrying 3 or more poison stacks never notices you, so a hit on it from concealment is an ambush. Numbed creatures take {5}% more damage from you.',family:'stalker'},
    phantomBrood:{key:'phantomBrood',minTier:4,duo:['summoner','stalker'],perk:'Shedding them restores [4] stamina.',name:'Phantom brood',description:'Your decoy sheds {1.3} broodlings beside it, which live as long as it does.',family:'summoner'},
    keenEdge:{key:'keenEdge',perk:'Critical multiplier rises by [0.15].',name:'Keen edge',description:'Direct attacks have a {18}% chance to strike critically for 1.8 times the damage.',family:'predator'},
    scavenger:{key:'scavenger',perk:'Kills also restore [4] stamina.',name:'Scavenger',description:'Defeating or consuming an organism restores {4}% of maximum health.',family:'predator'},
    secondWind:{key:'secondWind',perk:'Recharges [5] seconds sooner.',name:'Second wind',description:'Emptying stamina gives {1.8} seconds of emergency speed. Recharges in 35 seconds.',family:'riptide'},
    // Weapons: the Strike organ holds the mutation that decides your primary attack. With none equipped you Jab.
    jaws:{key:'jaws',weapon:'predator',perk:'Bites recover [8]% faster.',name:'Jaws',description:'Your Strike becomes Bite. Short range. A wide bite for {300}% of your attack. Creatures much smaller than you are swallowed whole.',family:'predator'},
    spitGland:{key:'spitGland',weapon:'venomist',perk:'Spit costs [10]% less stamina.',name:'Spitting gland',description:'Your Strike becomes Spit. Medium range. A glob for {80}% of your attack that poisons what it hits.',family:'venomist'},
    needleSpine:{key:'needleSpine',weapon:'stalker',perk:'Needles recover [8]% faster.',name:'Needle spine',description:'Your Strike becomes Needle. Long range. A quiet shot that locks onto the creature nearest your aim and passes through everything on its line, for {135}% of your attack. A creature that has not noticed you takes 80% more.',family:'stalker'},
    spikeBattery:{key:'spikeBattery',weapon:'spikes',perk:'Spikes fire [8]% faster.',name:'Spike battery',description:'Your Strike becomes Spike gun. Medium range. Hold to fire a fast stream of small spikes, each for {30}% of your attack.',family:'riptide'},
    sporeSac:{key:'sporeSac',weapon:'spores',perk:'Spore burst recovers [8]% faster.',name:'Spore sac',description:'Your Strike becomes Spore burst. Short range. A wide spray of seven spores, each for {60}% of your attack.',family:'summoner'},
    chainPulse:{key:'chainPulse',perk:'Arcs reach [1f] more.',name:'Chain strike',description:'A successful Strike arcs to two further targets for {45}% damage. Recharges in 3 seconds.',family:'summoner'},
    photosynthesis:{key:'photosynthesis',perk:'Also restores [3] stamina a second.',name:'Photosynthesis',description:'After staying still for 2 seconds, health regeneration rises by {100}% and nutrition slowly recovers. Taking damage interrupts it.',family:'venomist'},
    undertow:{key:'undertow',perk:'Slowed creatures take [8]% more damage from you.',name:'Undertow',description:'Strikes draw in nearby food and slow what they hit by 40% for {1.5} seconds.',family:'venomist'},
    shadowMetabolism:{key:'shadowMetabolism',perk:'Ambushes hit [10]% harder.',name:'Shadow metabolism',description:'A successful ambush returns {12} stamina and lets you conceal again after 0.6 seconds. Recharges in 8 seconds.',family:'stalker'},
    engulfingMembrane:{key:'engulfingMembrane',perk:'Swallowing takes [1] second off your ability cooldowns.',name:'Engulfing membrane',description:'You can swallow creatures {15}% bigger whole, and swallowing heals {3}% of your health.',family:'predator'},
    regrowingOrgans:{key:'regrowingOrgans',perk:'Kills also restore [3] stamina.',name:'Regrowing organs',description:'Every kill takes {1.5} seconds off all your ability cooldowns.',family:'summoner'},
    fissionHeart:{key:'fissionHeart',perk:'The shield also restores [6]% of your health.',name:'Fission heart',description:'A hit that would leave you below 25% health raises a shield that cuts damage by 70% for {3} seconds. Recharges in 45 seconds.',family:'venomist'},
    storedImpact:{key:'storedImpact',perk:'Spending the charge restores [5] stamina.',name:'Stored impact',description:'Store 60% of damage blocked, up to {40}. Your next Strike spends that charge as extra damage.',family:'summoner'},
    phaseMembrane:{key:'phaseMembrane',perk:'Recharges [1.2] seconds sooner.',name:'Phase membrane',description:'Starting a fast swim makes you intangible for {0.38} seconds. Recharges in 8 seconds.',family:'riptide'}
  };
  // Mutations are found, not earned by totals. Each drops from one kind of creature (MUTATION_SOURCE), in one of five
  // tiers; a better copy replaces the one you hold. Numbers in a description's braces scale with the tier (TIER_POWER,
  // where Rare is the written value). Each boss carries one mutation nothing else drops, at a fixed tier.
  const TIER_COLOURS=['#cfdcc4','#9be08f','#7fc4f2','#c79df5','#f3c969'];
  const TIERS=['Common','Uncommon','Rare','Epic','Legendary'],TIER_POWER=[.7,.85,1,1.25,1.55];
  const MUTATION_SOURCE={dartFlagellum:'skimmer',gorgerStomach:'leviathan',wanderingEddy:'maw',glassSkin:'glassray',ramJaw:'thornback',packFeeding:'crowned',toxicWake:'sporemother',numbingVenom:'lurker',phantomBrood:'murk',jaws:'hunter',spitGland:'puffer',needleSpine:'needlefish',spikeBattery:'skimmer',sporeSac:'swarmer',bileSac:'apex',clingingSlime:'jelly',tailFlick:'murk',echoNucleus:'crowned',pitOrgan:'lurker',rendingPounce:'ripjaw',clingingVenom:'sporemother',lastBreath:'broodcarrier',toxicHusk:'glassray',venomEddy:'siren',keenEdge:'needlefish',serratedJaws:'crowned',scavenger:'hunter',devourerGullet:'leviathan',barbedShell:'shellback',chitinPlates:'thornback',mirrorMembrane:'glassray',
    secondWind:'skimmer',whipFlagellum:'lasher',jetSac:'murk',chainPulse:'swarmer',undertow:'jelly',staticCharge:'stormdiatom',sporeGland:'puffer',photosynthesis:'grazer',twinNucleus:'splitter',
    fedHeart:'broodcarrier',abyssalHeart:'maw',shadowMetabolism:'leech',eyespot:'sentinel',lateralLine:'siren',
    leechLining:'leech',bloodScent:'apex',causticGland:'puffer',broodPheromone:'hatchling',keelFin:'prey',mimicSkin:'murk',echoChamber:'wanderer'};
  const BOSS_MUTATION_TIER={gulper:2,brood:2,pike:3,hydra:3,undertow:4,kraken:4};
  // What each creature can drop: one or two mutations.
  const DROP_FROM={};for(const [k,v] of Object.entries(MUTATION_SOURCE))(DROP_FROM[v]||(DROP_FROM[v]=[])).push(k);
  const DROP_CHANCE={common:.05,uncommon:.09,rare:.22,legendary:1},KIND_NAMES={apex:'Apex organism',hunter:'Hunter',swarmer:'Swarmer',jelly:'Stinging jelly',grazer:'Grazer',sentinel:'Reef sentinel',prey:'Ciliate prey'};
  const PERK_POWER=[1,1.6,2.4];
  const fmt=v=>v>=10?String(Math.round(v)):String(Math.round(v*100)/100);
  function describePerk(key,tier=2){const pw=PERK_POWER[clamp(tier,2,4)-2];return MUTATIONS[key].perk.replace(/\[([\d.]+)(f?)\]/g,(_,n,f)=>f?String(Math.floor(+n*pw)):fmt(+n*pw));}
  function describeMutation(key,tier=2){const pow=TIER_POWER[clamp(tier,0,4)];return MUTATIONS[key].description.replace(/\{([\d.]+)\}/g,(_,n)=>{const v=+n*pow;return v>=10?String(Math.round(v)):String(Math.round(v*10)/10).replace(/\.0$/,'')+(v<1?'':'');});}
  Object.assign(MUTATIONS,{
    serratedJaws:{key:'serratedJaws',perk:'Bleeding creatures are slowed for [0.5] seconds.',name:'Serrated jaws',description:'Your attacks make the target bleed for another {30}% of the damage over three seconds.',family:'predator'},
    devourerGullet:{key:'devourerGullet',perk:'Each swallow also restores [6] stamina.',name:"Devourer's gullet",description:'Swallow organisms up to 95% of your size instead of 78%. Each swallow heals {5}% of your health.',family:'venomist'},
    chitinPlates:{key:'chitinPlates',perk:'The swim penalty shrinks by [2] points.',name:'Chitin plating',description:'{15}% more damage resistance, but you swim 6% slower.',family:'summoner'},
    mirrorMembrane:{key:'mirrorMembrane',perk:'Reflected shots hit [40]% harder.',name:'Mirror membrane',description:'Shots that hit you have a {30}% chance to bounce back at the shooter.',family:'summoner'},
    whipFlagellum:{key:'whipFlagellum',perk:'Fast swimming is also [4]% faster.',name:'Whip flagellum',description:'Fast swimming costs {25}% less stamina.',family:'riptide'},
    jetSac:{key:'jetSac',perk:'Rams hit [30]% harder.',name:'Jet sac',description:'Fast swimming is {15}% faster.',family:'riptide'},
    staticCharge:{key:'staticCharge',perk:'The ring stuns for [0.3] seconds.',name:'Static charge',description:'Every 72 stamina you spend on Strikes also releases a shock ring that hits everything around you for {60}% of your attack.',family:'summoner'},
    sporeGland:{key:'sporeGland',perk:'Spore poison lasts [1] second longer.',name:'Spore gland',description:'Every 18 stamina you spend on Strikes also launches two poison spores either side of your aim, each for {35}% of your attack.',family:'predator'},
    twinNucleus:{key:'twinNucleus',perk:'[6]% more maximum stamina.',name:'Twin nucleus',description:'{20}% more maximum health and {25}% faster health regeneration.',family:'venomist'},
    fedHeart:{key:'fedHeart',perk:'Each nutrient also heals [0.4]% of your health.',name:'Fed heart',description:'Every nutrient you eat restores {3} stamina.',family:'venomist'},
    abyssalHeart:{key:'abyssalHeart',perk:'[6]% more damage to apex predators.',name:'Abyssal heart',description:'{30}% more damage to rare and legendary creatures, and creatures cannot pull you.',family:'stalker'},
    eyespot:{key:'eyespot',perk:'[3]% critical chance from spotting weak points.',name:'Eyespot',description:'Glass rays and murks cannot hide from you, and you sense landmarks {50}% further away.',family:'stalker'},
    lateralLine:{key:'lateralLine',perk:'Sneaking costs [12]% less stamina.',name:'Lateral line',description:'Predators notice you {20}% later while you are not swimming fast.',family:'stalker'}
  });
  // Mutations added with the drop system: one or two more for each way of playing.
  Object.assign(MUTATIONS,{
    leechLining:{key:'leechLining',perk:'[2]% of the damage also returns as stamina.',name:'Leech lining',description:'Your Strikes heal you for {4}% of the damage they deal.',family:'predator'},
    bloodScent:{key:'bloodScent',perk:'[6]% more damage to creatures that are still unhurt.',name:'Blood scent',description:'{12}% more damage to creatures below half health.',family:'predator'},
    causticGland:{key:'causticGland',perk:'Poisoned creatures hurt you [8]% less.',name:'Caustic gland',description:'Your poison and bleeding deal {20}% more damage.',family:'venomist'},
    broodPheromone:{key:'broodPheromone',perk:'You take [3]% less damage for each living broodling.',name:'Brood pheromone',description:'Your broodlings deal {20}% more damage.',family:'summoner'},
    keelFin:{key:'keelFin',perk:'Fast swimming costs [8]% less stamina.',name:'Keel fin',description:'You swim {8}% faster.',family:'riptide'},
    mimicSkin:{key:'mimicSkin',perk:'[4]% critical chance.',name:'Mimic skin',description:'Strikes from concealment deal {15}% more damage.',family:'stalker'},
    echoChamber:{key:'echoChamber',perk:'Abilities cost [6]% less stamina.',name:'Echo chamber',description:'Your ability cooldowns are {8}% shorter.',family:'summoner'}
  });
  for(const [k,part] of Object.entries({leechLining:'mouth',bloodScent:'senses',causticGland:'mouth',broodPheromone:'nucleus',keelFin:'flagellum',mimicSkin:'membrane',echoChamber:'senses',engulfingMembrane:'mouth',regrowingOrgans:'nucleus',keenEdge:'mouth',scavenger:'mouth',serratedJaws:'mouth',devourerGullet:'mouth',barbedShell:'membrane',fissionHeart:'membrane',chitinPlates:'membrane',mirrorMembrane:'membrane',secondWind:'flagellum',phaseMembrane:'flagellum',whipFlagellum:'flagellum',jetSac:'flagellum',chainPulse:'nucleus',storedImpact:'membrane',undertow:'flagellum',staticCharge:'senses',sporeGland:'nucleus',photosynthesis:'nucleus',twinNucleus:'nucleus',fedHeart:'nucleus',abyssalHeart:'nucleus',shadowMetabolism:'senses',eyespot:'senses',lateralLine:'senses',jaws:'organ',spitGland:'organ',needleSpine:'organ',spikeBattery:'organ',sporeSac:'organ',bileSac:'mouth',clingingSlime:'membrane',tailFlick:'flagellum',echoNucleus:'nucleus',pitOrgan:'senses',rendingPounce:'nucleus',clingingVenom:'nucleus',lastBreath:'nucleus',toxicHusk:'nucleus',venomEddy:'nucleus',dartFlagellum:'flagellum',gorgerStomach:'mouth',wanderingEddy:'nucleus',glassSkin:'membrane',ramJaw:'mouth',packFeeding:'nucleus',toxicWake:'flagellum',numbingVenom:'nucleus',phantomBrood:'nucleus'}))MUTATIONS[k].part=part;
  // The five apex predators. Each wakes when you reach its level and hunts you until one of you dies.
  // size: radius as a multiple of yours when it appears. hits: health in your attacks at that moment. speed: as a
  // multiple of your cruising speed (fast swimming is always quicker). contact: share of your health a touch takes.
  const BOSSES={
    gulper:{key:'gulper',name:'The Gulper',level:6,size:4.4,hits:41,dmg:1,speed:.82,turn:1.6,contact:.08,cooldown:1.5,colour:'#c8d98f',genomeName:'Gulper genome',mutationKey:'engulfingMembrane',reward:2,phases:['Hungry','Double lunge','Feeding frenzy'],
      description:'A vast amoeba that engulfs anything smaller than itself. Slow, but it never stops coming. Once hurt it reaches out with its grasping arms and spits half-digested food.',hint:'Its body stretches before it lunges: swim sideways, then strike while it recovers. Poison stops it healing from its meals.'},
    brood:{key:'brood',name:'The Broodmother',level:12,size:4,hits:85,dmg:1.05,speed:.72,turn:1.3,contact:.08,cooldown:1.6,colour:'#e4a5c6',genomeName:'Brood genome',mutationKey:'fissionHeart',reward:2,phases:['Swelling','Fast births','Devouring her young'],
      description:'A bloated colony-mother that gives birth to hunters as she follows you. Once hurt she charges, and at the end she bursts out rings of spores.',hint:'She swells before each birth. Kill her young fast: once hurt, she eats them to heal. Swim around her spore clouds.'},
    pike:{key:'pike',name:'The Glass Pike',level:18,size:3.4,hits:74,dmg:1.1,speed:1.2,turn:2.6,contact:.1,cooldown:1.4,colour:'#c4e9f0',genomeName:'Glass genome',mutationKey:'storedImpact',reward:2,phases:['Hunting','Curving dashes','Relentless'],
      description:'A long glass predator, the fastest thing in the pond. It dashes in twos, then threes, sweeps its hooks at anything close, and sheds rings of glass as it goes.',hint:'A glowing line marks each dash: move off the line, not away along it. After its third dash it stalls. Strike then.'},
    hydra:{key:'hydra',name:'The Hydra',level:24,size:3,hits:145,dmg:1.1,speed:.5,turn:1.1,contact:.08,cooldown:2.2,colour:'#9fd3aa',genomeName:'Hydra genome',mutationKey:'regrowingOrgans',reward:2,phases:['Rooted','Uprooted','Fourth head'],
      description:'A many-headed predator. Each head strikes on its own, and every head feeds the body. Uprooted, it sprays venom; with its fourth head it throws rings of it.',hint:'Watch each head draw back before it snaps. Keep moving around it; standing still lets every head line up.'},
    undertow:{key:'undertow',name:'The Undertow',level:30,size:4.6,hits:208,dmg:1.4,speed:.9,turn:1.2,contact:.12,cooldown:1.5,colour:'#86b6da',genomeName:'Abyssal genome',mutationKey:'phaseMembrane',reward:2,phases:['Circling','Storm','Endless hunger'],
      description:'An abyssal leviathan whose mouth drags the water in. Everything it swallows heals it. It charges, slams what comes close, and at the end it dashes.',hint:'When it starts to pull, swim away from its mouth and keep creatures away from it. Dodge its charge sideways and find the gap in its rings.'},
    kraken:{key:'kraken',name:'The Kraken',level:36,size:4.4,hits:480,dmg:1.1,speed:.9,turn:1.4,contact:.12,cooldown:1.15,colour:'#d2a6dc',genomeName:'Kraken genome',mutationKey:'abyssalHeart',reward:2,phases:['Reaching','Ink','The grip'],
      description:'A giant squid from the bottom of the Trench, and the last thing the pond has to throw at you. It charges, hurls rings of ink, drags the water in, and when it is hurt it blacks out the water around you.',hint:'Sidestep its charge and find the gap in its rings. When the water goes black, keep moving and watch for the glow of its eyes. In its last phase it dashes three times in a row: step off each line, then strike while it gathers itself.'}
  };
  const BOSS_ORDER=['gulper','brood','pike','hydra','undertow','kraken'];
  // How much bigger than you a creature is (1 when it is your size or smaller, capped at 3). Bigger creatures
  // take far more hits to kill, hit harder and are worth more: being half its size should be a real fight.
  const heft=(r,playerR)=>clamp(r/Math.max(1,playerR||22),1,3);
  // A lunging predator this many times your width swallows you whole.
  // Elders: one old, named creature holds a territory in roughly one chunk in fifty of open water. It is larger, has four times the
  // health and bites a quarter harder than its kind at that water level, and it will not follow far from home, so it can always be
  // left alone. Bringing one down always yields a Rare or better mutation.
  const DEN_TIME=.75,REAR_BONUS=.3;
  const BOSS_ESCAPE_GAP=120,BOSS_REST_SECONDS=120;
  const ELDER_CHANCE=.02,ELDER_HEALTH=4,ELDER_MIGHT=1.25,ELDER_LEASH=950;
  const ELDER_NAMES=['Longtooth','Old Scar','The Patient One','Stonehide','Palewake','The Hollow','Deepmother','Greyfin','The Unhurried','Thornback Sire','Saltjaw','The Watcher','Driftking','Old Ember','Nightmouth','The Stillness'];
  const SWALLOW_LEVELS=3,SWALLOW_RATIO=2.8,canSwallow=(o,p)=>!!o&&!o.bossId&&!o.elder&&!o.mother&&['hunter','apex','armoured'].includes(o.kind)&&o.r>=p.r*SWALLOW_RATIO&&(Number.isFinite(o.lv)?o.lv:0)-(Number.isFinite(p.stage)?p.stage:0)>=SWALLOW_LEVELS;
  // Shortest distance from point v to the segment a-b.
  function segmentDistance(v,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,ll=dx*dx+dy*dy,t=ll?clamp(((v.x-ax)*dx+(v.y-ay)*dy)/ll,0,1):0;return length(v.x-ax-dx*t,v.y-ay-dy*t);}
  const LANDMARKS={bloom:{name:'Nutrient bloom',r:110,goal:1},sanctuary:{name:'Sanctuary',r:150,goal:3},geneCache:{name:'Gene cache',r:75,goal:3},nest:{name:'Predator nest',r:140,goal:3},current:{name:'Current vent',r:170,goal:1.2},carcass:{name:'Fallen giant',r:150,goal:1},garden:{name:'Toxic garden',r:175,goal:1},sanctum:{name:'Elder sanctum',r:250,goal:1},fossil:{name:'Ancient fossil',r:95,goal:3},vault:{name:'Glass vault',r:115,goal:3},smoker:{name:'Black smoker',r:165,goal:1},shell:{name:'Abandoned shell',r:120,goal:2},sealed:{name:'Sealed shell',r:110,goal:5},trail:{name:'Hidden garden',r:170,goal:1},silent:{name:'Silent current',r:150,goal:1},nursery:{name:'Empty nursery',r:200,goal:3},wonderBell:{name:'The Sunken Bell',r:270,goal:3},wonderLanterns:{name:'The Lantern Reef',r:430,goal:6},wonderRibs:{name:'The Leviathan Ribs',r:320,goal:3},wonderPool:{name:'The Still Pool',r:390,goal:12},wonderMaelstrom:{name:'The Maelstrom',r:450,goal:3},wonderSpire:{name:'The Crystal Spire',r:280,goal:3},wonderDrowned:{name:'The Drowned Colony',r:350,goal:3},wonderEye:{name:'The Abyssal Eye',r:430,goal:25}};
  // Wonders: one of each per pond, at its own depth (zone is the water level, counted from 0) and a direction set by the seed.
  // THE LAST WATER (v35.9). The First Colony's memory, told only through what the player finds. Echoes come from ancient fossils and
  // abandoned shells: each gives the earliest echo not yet heard whose water (index) is at or above the echo's. The keepers (bosses) and
  // the remains (wonders) add their own lines. The Field guide's Legend page gathers everything heard, across lives.
  const LEGEND=[
    {id:'e1',water:0,text:'We were water once, all of us. Then the water began to leave.'},
    {id:'e2',water:0,text:'The sky grew hot. The shallows went first, then the rivers. We drew together to keep what was left.'},
    {id:'e3',water:2,text:'Together we were a colony. A colony large enough to remember. A colony large enough to think.'},
    {id:'e4',water:4,text:'We dug this pond with our bodies and filled it with the last of the living water.'},
    {id:'e5',water:6,text:'We could not guard it as one. So we broke ourselves into keepers, each to hold a depth.'},
    {id:'e6',water:9,text:'Our hunger we set in the shallows, to keep the small things from growing careless.'},
    {id:'e7',water:12,text:'Our womb we set below it, to make more of us when we were gone.'},
    {id:'e8',water:15,text:'Our speed, our many minds, our pull: each went down into the dark to wait.'},
    {id:'e9',water:18,text:'We kept our heart for the bottom, wrapped in arms, so nothing could take it while it slept.'},
    {id:'e10',water:22,text:'But a keeper with no colony forgets what it keeps. Ours forgot. They became hunters.'},
    {id:'e11',water:26,text:'The ones who came before you grew as far as they dared. Then they stopped. They are waiting still.'},
    {id:'e12',water:30,text:'We left seeds in the nursery, one after another. Most did not wake. You did.'},
    {id:'e13',water:34,text:'Every cell you add, we grow again.'},
    {id:'e14',water:38,text:'Come to the bottom. The heart is still beating. It is waiting to know what you are.'}
  ];
  const KEEPER_LINES={
    gulper:{wake:'It remembers only hunger, and it smells yours.',fall:'The hunger lets go. Something of us comes home.'},
    brood:{wake:'She bore our children once. Now she bears hunters.',fall:'Her young scatter. The womb is quiet.'},
    pike:{wake:'It was our speed. It has not stopped since.',fall:'The glass stops moving. It had been running a long time.'},
    hydra:{wake:'Many heads, many thoughts, none of them ours any more.',fall:'The heads fall silent one by one, until only one thought is left: yours.'},
    undertow:{wake:'It was our pull, the thing that held us together. It wants to hold you.',fall:'The water lets go of you.'},
    kraken:{wake:'The heart wakes. It does not know you yet.',fall:'The heart is still. Or it is listening. Below, something answers.'}
  };
  const WONDER_LINES={
    wonderBell:'The Bell was our voice. When it rang, every cell in the pond turned at once.',
    wonderLanterns:'The Lanterns were our eyes. We lit them so the dark would never be empty.',
    wonderRibs:'These were the bones of the first of us who grew too large to feed.',
    wonderPool:'The Still Pool is where we went to think. Nothing moves there, so nothing interrupts.',
    wonderMaelstrom:'We made a current that would never stop, so the water would never rest and rot.',
    wonderSpire:'The Spire is the memory of our shape, grown in glass so we would not forget it.',
    wonderDrowned:'A colony grew too large and would not divide. Its walls are all that is left. We were warned.',
    wonderEye:'The Eye is the last thing we saw before we broke apart. It is still looking for us.'
  };
  // Story threads (v36.2), each heard in order: a hermit's fate when you finish its three tasks, the lost hunters when a named
  // ancient falls, the other nurseries in empty nurseries of deep water. Ids live in state.echoes beside the LEGEND ones.
  const THREADS={
    fate:[
      {id:'f1',text:'I was going to the bottom too, once. I reached the Glass Pike and turned back. I have been ashamed ever since.'},
      {id:'f2',text:'We were twelve when we left the nursery. At the Broodmother we were five. I stopped counting after that.'},
      {id:'f3',text:'The deeper you go, the more the water remembers you. I did not want to be remembered.'},
      {id:'f4',text:'I grew until I could hear the Kraken’s heart. It beat slower than mine. I was afraid of what that meant.'},
      {id:'f5',text:'I found an empty nursery in the deep. Someone was seeded there before me. Nothing was left but a ring in the silt.'},
      {id:'f6',text:'Every colony that reaches the bottom becomes part of it. That is why I stopped. You may not.'}],
    hunters:[
      {id:'a1',text:'We sent hunters out to keep the water clean. Some of them forgot to come home.'},
      {id:'a2',text:'A hunter that eats alone too long forgets it was ever part of us.'},
      {id:'a3',text:'They still hold the ground we gave them. They do not remember why.'},
      {id:'a4',text:'Each hunter carried a piece of our hunger. That is why they are so hard to kill.'},
      {id:'a5',text:'When one falls, its piece comes back to us. To you.'},
      {id:'a6',text:'We named them so we would not lose them. We lost them anyway.'},
      {id:'a7',text:'The oldest hunters guard the vaults. We asked them to. We are sorry.'},
      {id:'a8',text:'The last hunter we sent swam down. It has not come up.'}],
    nurseries:[
      {id:'n1',text:'A ring of silt where a seed once lay. The water is still warm, as if it only just left.'},
      {id:'n2',text:'Another seed. It grew as far as this, then the ring breaks. Something took it.'},
      {id:'n3',text:'This one grew large. Its ring is wider than yours. It went down and did not come back.'},
      {id:'n4',text:'We seeded many. We hoped one would reach us.'},
      {id:'n5',text:'You are the last seed. There will be no other.'}]
  };
  const STORY_IDS=new Set([...LEGEND.map(e=>e.id),...Object.values(THREADS).flat().map(e=>e.id)]);
  // What each hermit remembers, chosen by its sanctuary; told in its dialog.
  const HERMIT_MEMORIES=['I saw the Bell ring once. Nothing has been the same since.','When I was young the shallows were wider. The pond is smaller every time I look.','The Gulper was smaller once. Or I was bigger.','There were more of us. We went down together. I came back up alone.','Some nights the lanterns on the old reef light by themselves.','Do not trust a current you cannot see.','The deep water talks, if you keep still long enough.','I knew a colony that reached the Hydra. It never told me what it saw.','The sanctuaries are warm because something large once slept in them.','You swim like the first ones did. Straight down, never looking back.'];
  const WONDERS=[
    {type:'wonderBell',zone:3,challenge:'guardian',kind:'hunter',guardian:'The Bell-Warden',reward:'echoChamber',points:1,hint:'Defeat its warden, then rest inside',lore:'A giant bell of shell lies half buried here, and something has made it its home.'},
    {type:'wonderLanterns',zone:7,challenge:'lanterns',reward:'eyespot',points:1,hint:'Light all six lanterns at once',lore:'Six dead lanterns ring an old reef. They were never meant to burn alone.'},
    {type:'wonderRibs',zone:11,challenge:'guardian',kind:'armoured',guardian:'The Marrow-Eater',reward:'serratedJaws',points:1,hint:'Defeat what feeds here, then rest inside',lore:'The ribs of something vast. Whatever killed it is still eating.'},
    {type:'wonderPool',zone:15,challenge:'stealth',reward:'mimicSkin',points:1,hint:'Stay hidden inside · avoid the watching lights',lore:'Nothing moves in the Still Pool. Its lights search for anything that does.'},
    {type:'wonderMaelstrom',zone:19,challenge:'current',reward:'jetSac',points:1,hint:'Reach the eye of the whirlpool',lore:'A whirlpool that never stops turning. Something glitters at its heart.'},
    {type:'wonderSpire',zone:24,challenge:'guardian',species:'glassray',guardian:'The Spire Heart',reward:'chitinPlates',points:1,hint:'Defeat its keeper, then rest inside',lore:'A spire of living crystal, and an almost invisible thing that keeps it.'},
    {type:'wonderDrowned',zone:30,challenge:'guardian',species:'sporemother',guardian:'The Drowned Queen',reward:'twinNucleus',points:1,hint:'Defeat its queen, then rest inside',lore:'The empty walls of a colony that grew too large. Its queen never left.'},
    {type:'wonderEye',zone:38,challenge:'gaze',reward:'',points:3,hint:'Survive its gaze',lore:'An eye larger than any predator, at the bottom of the Trench. It wakes when you come close.'}];
  const WONDER_BY_TYPE=Object.fromEntries(WONDERS.map(w=>[w.type,w]));
  // Hermits: old, gentle colonies that live in about half the sanctuaries and give bounties on the water around them.
  const HERMIT_NAMES=['Oolo','Vesk','Tamsin','Pell','Ilu','Brannoch','Quill','Wend','Aster','Moss','Nim','Corra','Ebb','Lorn','Sedge','Marrow','Ysolde','Tull'],HERMIT_EPITHETS=['the Still','the Patient','of the Reeds','the Grey','the Old','the Listener','of the Silt','the Watcher','the Slow','of the Deep','the Kind'];
  const BOUNTY_PREY=['Ashjaw','Gristle','the Pale Hunter','Hookmaw','Silt-Eye','Old Rend','Thornmother','the Gutter King','Blackfin','Coilback','the Widow','Needlegrin'];
  // What hermits have lost, and the words they use.
  const KIN=[['sister','her'],['brother','him'],['daughter','her'],['son','him'],['little one','them']];
  const RELICS=['pearl of old light','shell-lens','first spore','glass seed','brood-stone','sun-flake'];
  const PLACE_WORDS={vault:'glass vault',fossil:'ancient fossil',shell:'abandoned shell',carcass:'fallen giant',garden:'toxic garden',smoker:'black smoker',geneCache:'gene cache'};
  const TASK_STORIES={
    hunt:[(w)=>`Something called ${w.prey} has been eating my neighbours. It keeps to the water ${w.dir} of here. I am too old to fight it. Will you?`,(w)=>`${w.Prey} took my ${w.kin}. I still hear it circling, out ${w.dir}. Make it stop.`,(w)=>`Every night ${w.prey} comes a little closer from the ${w.dir}. One night it will reach my door.`],
    nest:[(w)=>`Hunters have made a nest ${w.dir} of my home. Every night more young come sniffing at my walls. Clear it out.`,(w)=>`There is a nest ${w.dir} of here, and its mother is bold. I cannot rest with her so close.`],
    place:[(w)=>`There is a ${w.place} out ${w.dir}. I have dreamt of it for years and never dared go. Go for me, and come back and tell me what you found.`,(w)=>`My teacher spoke of a ${w.place} to the ${w.dir}. I would like to know it is still there before I die.`],
    rescue:[(w)=>`My ${w.kin} chased the light out ${w.dir} and has not come home. Please find ${w.pro} and bring ${w.pro} back to me.`,(w)=>`The current took my ${w.kin} ${w.dir} of here three nights ago, small and frightened. Bring ${w.pro} home.`],
    fetch:[(w)=>`The current tore my ${w.relic} away and dropped it somewhere ${w.dir} of here. It glows; you will see it. Bring it back to me.`,(w)=>`I hid my ${w.relic} out ${w.dir} when the hunters came. I am too slow to fetch it now. Will you?`]};
  const HERMIT_TASKS=3;
  const TASK_THANKS={hunt:'It is dead? Then I can sleep. Take this; you have earned it.',nest:'Quiet at last. Thank you. Take this.',place:'So it is real. Thank you for going where I could not. Take this.',rescue:'You found them! I thought I would never see them again. Take this; it is all I have.',fetch:'My relic! I thought it was lost for good. Take this for your trouble.'};
  const MAX_TASKS=3,BOUNTY_PLACES=['vault','fossil','shell','carcass','garden','smoker','geneCache'];
  // Places that only exist beyond the opening chunks, where the pond is meant to bite.
  const DEEP_LANDMARKS=['carcass','garden'];
  // Rare finds never come from the ordinary pool: each has its own small chance per region of open water.
  const RARE_LANDMARKS=['fossil','shell'];
  // Secrets (v36.0): never in an ordinary roll, never a study lead or task target. Each sits in an otherwise empty region of deeper water.
  const SECRET_LANDMARKS=['sealed','trail','silent','nursery'],SECRET_FROM={sealed:6,trail:10,silent:12,nursery:20};
  // Species: named creatures layered on a base behaviour (kind). The kind drives every shared system (AI, attacks, saves);
  // the species adds identity (name, look, size, strength), rarity, when it can appear, and one signature trait.
  // minStage is a tier: a species first appears at level minStage*3+1 (tier 1 from level 4, tier 4 from level 13, tier 7 from level 22).
  const RARITY_WEIGHT={common:6,uncommon:3,rare:1,legendary:0},RARITY_SCORE={common:45,uncommon:90,rare:350,legendary:2000};
  const SPECIES={
    skimmer:{name:'Skimmer',base:'prey',rarity:'common',minStage:0,r:[8,11],hp:7,speed:112,colour:[126,222,236],value:4,dart:true,blurb:'A quick, harmless ciliate that bursts away when chased. Worth more than ordinary prey if you can catch it.'},
    shellback:{name:'Shellback',base:'grazer',rarity:'common',minStage:1,r:[22,30],hp:46,speed:50,colour:[168,206,140],value:9,armour:.5,drops:'mineral',blurb:'A plated grazer. Strikes do half damage, and it leaves minerals behind.'},
    needlefish:{name:'Needlefish',base:'hunter',rarity:'common',minStage:1,r:[19,24],hp:28,speed:176,colour:[244,156,120],value:9,sight:480,profile:{reach:200},attack:{range:330,damage:14,lunge:.42},blurb:'A slender hunter with a long, fast lunge that hits lightly. Sidestep the line it takes.'},
    puffer:{name:'Puffer',base:'hunter',rarity:'uncommon',minStage:2,r:[25,31],hp:58,speed:88,colour:[214,162,228],value:14,sight:520,ranged:true,keepAway:280,sporeDamage:12,blurb:'Keeps its distance and lobs spore volleys. Close the gap and it panics.'},
    murk:{name:'Murk',base:'hunter',rarity:'uncommon',minStage:2,r:[27,34],hp:70,speed:150,colour:[128,118,176],value:16,blink:true,blurb:'Badly hurt, it vanishes in a cloud of ink and reappears out of reach.'},
    splitter:{name:'Splitter',base:'hunter',rarity:'uncommon',minStage:2,r:[33,40],hp:82,speed:132,colour:[238,146,96],value:14,splits:true,blurb:'Kill it and it divides into two smaller hunters.'},
    // The deeper water has its own creatures. Each first appears at water level minStage*3+1.
    shardling:{name:'Shardling',base:'swarmer',rarity:'common',minStage:4,group:[3,4],r:[10,13],hp:20,speed:192,colour:[176,232,240],value:6,blurb:'Glass-backed darts that hunt in fours. Each is fragile, but they arrive together.'},
    ironhide:{name:'Ironhide',base:'armoured',rarity:'uncommon',minStage:5,r:[40,48],hp:125,speed:64,colour:[154,166,180],value:26,blurb:'A slab of plate. Strikes glance off it until it has bitten: hit it while it recovers.'},
    lurker:{name:'Lurker',base:'hunter',rarity:'uncommon',minStage:6,r:[30,36],hp:92,speed:158,colour:[104,132,166],value:24,sight:520,cloaked:true,profile:{reach:190},attack:{range:300,damage:30},blurb:'All but invisible until it is close or striking. Watch for the shimmer in the dark water.'},
    sporemother:{name:'Spore mother',base:'hunter',rarity:'uncommon',minStage:7,r:[38,46],hp:130,speed:74,colour:[206,146,226],value:30,sight:600,ranged:true,keepAway:330,sporeDamage:17,blurb:'A swollen spore-thrower that keeps its distance and fires heavier volleys than a puffer. Close in and it has nothing.'},
    ripjaw:{name:'Ripjaw',base:'hunter',rarity:'common',minStage:8,r:[31,38],hp:110,speed:184,colour:[240,124,112],value:26,sight:560,profile:{reach:220},attack:{range:330,damage:38,lunge:.4},blurb:'Fast, with a long lunge and a heavy bite. It is slow to recover: make it miss, then punish it.'},
    voidling:{name:'Voidling',base:'swarmer',rarity:'uncommon',minStage:9,group:[3,5],r:[13,16],hp:34,speed:182,colour:[136,104,190],value:9,latch:true,blurb:'A pack from the deepest water. They latch on together and drain you fast. Strike or fast swim to throw them off.'},
    leech:{name:'Leech',base:'swarmer',rarity:'uncommon',minStage:3,group:[2,3],r:[12,15],hp:22,speed:168,colour:[196,92,124],value:6,latch:true,blurb:'Latches on and drains your health. Fast swim or strike to shake it off.'},
    lasher:{name:'Lasher',base:'sentinel',rarity:'uncommon',minStage:3,biomes:[0,2],r:[29,35],hp:110,colour:[160,214,138],value:18,tether:true,tetherReach:330,sting:9,blurb:'A rooted predator. Its tendril snares you and drags you towards its mouth. Fast swim breaks the pull.'},
    thornback:{name:'Thornback',base:'armoured',rarity:'rare',minStage:4,r:[52,62],hp:300,speed:96,colour:[222,170,92],value:60,sight:430,aggressive:true,thorns:.22,profile:{reach:130,turn:1.8},attack:{range:200,damage:32,lunge:.45},challenge:1,blurb:'A spined brute that charges. Hitting it up close hurts you too, so strike while it recovers.'},
    glassray:{name:'Glass ray',base:'hunter',rarity:'rare',minStage:4,r:[48,57],hp:220,speed:186,colour:[186,232,242],value:55,sight:540,cloaked:true,profile:{reach:200},attack:{range:330,damage:33},challenge:1,blurb:'Almost invisible until it is close. Watch for the shimmer.'},
    siren:{name:'Siren jelly',base:'jelly',rarity:'rare',minStage:4,biomes:[0],r:[62,76],hp:260,speed:40,colour:[204,172,252],value:50,pull:340,sting:20,challenge:1,blurb:'A vast jelly whose current draws you towards its stinging tentacles. Fast swim out of the pull.'},
    broodcarrier:{name:'Brood carrier',base:'armoured',rarity:'rare',minStage:5,r:[56,66],hp:340,speed:70,colour:[224,142,172],value:65,brood:true,challenge:1,blurb:'Carries a living brood and releases hatchling swarms when you come near.'},
    stormdiatom:{name:'Storm diatom',base:'sentinel',rarity:'rare',minStage:5,biomes:[1],r:[44,52],hp:300,colour:[250,232,150],value:60,doubleRing:true,challenge:1,blurb:'A charged reef sentinel that fires two rings of shards in quick succession.'},
    crowned:{name:'Crowned hunter',base:'hunter',rarity:'rare',minStage:5,r:[52,60],hp:260,speed:168,colour:[252,192,112],value:70,escort:3,profile:{reach:140},attack:{damage:36},challenge:1,blurb:'Leads a pack of hunters. Bring it down and the pack loses its nerve.'},
    leviathan:{name:'Leviathan larva',base:'apex',rarity:'legendary',minStage:6,r:[140,165],hp:1100,speed:118,colour:[156,124,214],value:260,sight:760,devour:true,profile:{capacity:160,turn:1.2,reach:200},attack:{range:300,damage:55,lunge:.5},challenge:2,score:2500,blurb:'An immense, half-grown predator that devours anything it touches. The pond empties ahead of it.'},
    maw:{name:'Abyssal maw',base:'apex',rarity:'legendary',minStage:7,r:[165,190],hp:1500,speed:52,colour:[118,96,150],value:340,sight:820,vortex:true,sting:45,sporeDamage:26,profile:{capacity:200,turn:.7,accel:1.5},challenge:2,score:3500,blurb:'A colossal mouth that drags everything nearby into itself. Keep stamina for the escape.'},
    wanderer:{name:'Wandering giant',base:'grazer',rarity:'rare',minStage:0,spawnOnly:true,r:[118,138],hp:900,speed:34,colour:[142,214,190],value:120,armour:.35,shed:true,blurb:'A vast, peaceful drifter that sheds food as it travels, and crushes anything that hurts it. Follow it and eat well.'},
    hatchling:{name:'Brood hatchling',base:'swarmer',rarity:'common',minStage:5,spawnOnly:true,r:[9,12],hp:12,speed:190,colour:[236,150,180],value:2,blurb:'Released by a brood carrier. Weak alone, dangerous in numbers.'}
  };
  const prefixes=['Amber','Emerald','Ancient','Glass','Whispering','Silver','Moonlit','Spiral','Hidden','Velvet','Opal','Luminous'];
  const zeroTraits=()=>Object.fromEntries(FAMILIES.map(k=>[k,0]));
  // Growth needed to reach the next level (one cell per level). A bigger body eats bigger meals, so income grows
  // about in step with the level; costs grow a little faster, so each level takes a little longer than the last
  // (measured with bots: an ordinary life reaches level 6 in about 7 minutes and level 30 in about 70).
  // Beyond the full-size body, levels keep a steady price. Cumulative, so it matches the biomass counter.
  const levelCost=stage=>Math.round(1.7*(100+60*Math.pow(Math.min(stage,MAX_BODY_CELLS-1),1.45)+Math.max(0,stage-MAX_BODY_CELLS+1)*300));
  const THRESHOLD_CACHE=[];
  const nextThreshold=stage=>{while(THRESHOLD_CACHE.length<=stage){const n=THRESHOLD_CACHE.length;THRESHOLD_CACHE.push((n?THRESHOLD_CACHE[n-1]:0)+levelCost(n));}return THRESHOLD_CACHE[stage];};
  function pulseAngle(player,aimX,aimY){
    const heading=Number.isFinite(player.angle)?player.angle:0,dx=aimX-player.x,dy=aimY-player.y;
    return Number.isFinite(dx)&&Number.isFinite(dy)&&length(dx,dy)>=1?Math.atan2(dy,dx):Math.atan2(Math.sin(heading),Math.cos(heading));
  }
  function pulseHits(player,target,angle,reachOverride){
    if(!player||!target||!Number.isFinite(angle))return false;
    const dx=target.x-player.x,dy=target.y-player.y;if(!Number.isFinite(dx)||!Number.isFinite(dy))return false;
    const along=dx*Math.cos(angle)+dy*Math.sin(angle),across=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
    // A target may graze the edge with its body, but a centre behind the
    // aim's forward plane is never hit by the basic Pulse.
    if(along<0)return false;
    const reach=Number.isFinite(reachOverride)?reachOverride:player.pulseRadius,padding=Math.max(0,target.r||0)*(Object.hasOwn(BOSSES,target.type)&&target.maxHp?.55:.4),c=Math.cos(PULSE_HALF_ANGLE),sn=Math.sin(PULSE_HALF_ANGLE);
    if(across*c<=along*sn)return dx*dx+dy*dy<=(reach+padding)*(reach+padding)+1e-8;
    const nearest=clamp(along*c+across*sn,0,reach),ex=along-nearest*c,ey=across-nearest*sn;
    return ex*ex+ey*ey<=padding*padding+1e-8;
  }
  // A boss recovering from a committed attack is open: it takes 30% more damage, and precision Strikes treat it as unaware.
  function bossExposure(state){
    const b=state&&state.bossEncounter;if(!b)return null;const exposed=b.mode==='recover';
    return{state:exposed?'exposed':'closed',exposed,protected:false,guardCount:0,damageMultiplier:exposed?1.3:1,label:exposed?'OPEN':''};
  }
  function sanctuaryThreat(state){
    const p=state.player;if(state.bossEncounter)return true;
    for(const o of state.organisms){if(o.dead||!(isHostile(o)||o.elite))continue;const d=distance(o,p);if(d<p.r+o.r+90||o.chasing&&d<420||(o.windup>0||o.lungeTime>0)&&d<(o.attackRange||0)+o.r+p.r+100)return true;}
    return state.projectiles.some(o=>o.owner==='enemy'&&o.life>0&&distance(o,p)<700)||state.hazards.some(h=>distance(h,p)<h.r+p.r+70);
  }
  function sanctuaryReason(state){
    const p=state.player;if(sanctuaryThreat(state))return'danger';if(p.refugeCombatTime>0)return'combat';if(p.regenDelay>0||p.hurt>0)return'hurt';if(p.hp<p.maxHp-.01||p.energy<p.maxEnergy-.01||p.exhausted)return'resources';if(p.nutrition<80)return'nutrition';if(p.stillTime<=0||length(p.vx,p.vy)>8||p.sprinting||p.sneaking||p.specialTime>0||p.pulseCooldown>0)return'moving';return'resting';
  }
  function sanctuaryStatus(state){
    const r=state&&state.sanctuaryRest;if(!r)return null;const l=state.landmarks.find(l=>l.id===r.id&&l.type==='sanctuary');if(!l||distance(l,state.player)>=l.r)return null;
    const fighting=state.player.refugeCombatTime>0;
    return{id:r.id,name:l.name,progress:r.progress,required:SANCTUARY_REST_SECONDS,savedThisVisit:r.completed,ready:r.completed&&sanctuaryReason(state)==='resting',phase:fighting?'blocked':r.completed?'complete':r.reason==='resting'?'resting':'blocked',reason:SANCTUARY_REASONS[fighting?'combat':r.reason]};
  }
  function localRng(seed){let state=seed>>>0;return()=>{let t=state=(state+0x6D2B79F5)>>>0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function seedHash(value){let h=2166136261;for(const c of String(value).normalize('NFC')){h^=c.codePointAt(0);h=Math.imul(h,16777619);}h^=h>>>16;return h>>>0||1;}
  class MorphosGame {
    constructor(seed='First light'){this.reset(seed);}
    random(){let t=this._rng=(this._rng+0x6D2B79F5)>>>0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
    range(a,b){return a+(b-a)*this.random();}
    reset(seed='First light'){
      seed=String(seed).trim().normalize('NFC').slice(0,80)||'First light';
      this._rng=seedHash(seed);this._id=1;this._events=[];this._maintain=0;this._ai=0;this._scoreClock=0;this._apexSpawned=false;this._lastEat=-10;this._hungryWarned=false;this._wakeClock=0;this._streamClock=0;this._chunks={};this._chunkCache={};this._cacheOrder=[];this._claimed=new Set();this.coop=null;
      this.state={seed,seedNumber:this._rng,time:0,status:'playing',endless:true,paused:false,tasks:[],trackedTask:'',pendingEvolution:null,pendingChoice:null,journeyComplete:false,journeyCompletedAt:0,sanctuaryRest:null,sanctumArrivalId:'',world:{infinite:true,chunkSize:CHUNK},biome:0,previousBiome:0,biomeTransition:1,biomeName:biomeNames[0],score:0,biomass:0,nextDivision:nextThreshold(0),divisionFrom:0,
        player:{id:0,x:0,y:0,vx:0,vy:0,angle:-Math.PI/2,r:22,hp:100,maxHp:100,energy:100,maxEnergy:100,cellCount:1,cellCountText:'1',cellExponent:0,colonyLevel:1,stage:0,skillPoints:0,mastery:zeroTraits(),attributes:Object.fromEntries(Object.keys(ATTRIBUTES).map(k=>[k,0])),mutations:[],unlockedMutations:[],mutationTiers:{},dropPity:{},mutationSlots:0,abilityCooldowns:zeroTraits(),abilityCosts:zeroTraits(),abilityCooldownMax:zeroTraits(),sprinting:false,exhausted:false,recoveryProgress:1,sprintSessionDistance:0,sprintSampleDistance:0,sprintDanger:false,escapeCooldown:0,secondWindTime:0,secondWindCooldown:0,chainCooldown:0,stillTime:0,photosynthesising:false,genomes:[],growthBlockedStage:-1,fissionShieldTime:0,fissionCooldown:0,impactCharge:0,phaseShieldTime:0,phaseCooldown:0,
          traits:{venomist:0,predator:0,riptide:0,summoner:0,stalker:0},forks:{},awakened:[],evidence:{venomist:0,predator:0,riptide:0,summoner:0,stalker:0},
          pulseCooldown:0,blockCooldown:0,blockHeld:false,feedingRecovery:0,parryTime:0,parryBuffer:0,parryAngle:0,parryRefunded:false,regenDelay:0,refugeCombatTime:0,shadowMetabolismCooldown:0,slipstreamCharged:false,broodTargetId:0,budTime:0,frenzy:0,frenzyTime:0,momentum:0,momentumTime:0,invulnerable:3,hurt:0,evolution:0,alive:true,combo:0,shield:0,
          stealth:0,sneaking:false,concealCooldown:0,nutrition:100,maxNutrition:100,
          specialActiveTrait:'',specialTime:0,
          swarmTime:0,slipstreamTime:0,pounceTime:0,veilTime:0},
        bossEncounter:null,bossLog:[],organisms:[],foods:[],hazards:[],scenery:[],particles:[],effects:[],projectiles:[],decoys:[],drops:[],brood:[],vortices:[],echoes:[],landmarks:[],claimedLandmarks:[],discoveredLandmarks:[],explored:[],landmarkRecords:{},objective:null,objectiveIndex:0,stats:{elders:0,deepest:1,bossRest:0,food:0,kills:0,dashes:0,pulses:0,specials:0,sneaks:0,ambushes:0,stealthTime:0,distance:0,discoveries:0,encounters:0,meaningfulDashes:0,objectives:0,algae:0,minerals:0,sprintDistance:0,blockedDamage:0,criticals:0,reflections:0,elites:0,nests:0,escapes:0,bosses:0,parries:0,hostileKills:0,nearMisses:0,ruptures:0,currentsRidden:0,earnedPoints:{evolution:0,elder:0,challenge:0,wonder:0}},evolutionLog:[]};
      this._derive();
      this._stream(true);
      // A safe, readable food trail begins immediately around the first cell.
      for(let i=0;i<28;i++){const a=i*2.399963+this.range(-.2,.2),r=55+Math.sqrt(i)*28,kind=i%8===7?'mineral':'algae';const f=this._food(Math.cos(a)*r,Math.sin(a)*r,kind,kind==='algae'?1.3:1.25);f.r+=.6;}
      // A separate golden pocket makes a mineral diet an intentional opening choice.
      for(let i=0;i<12;i++){const a=i*2.399963,r=12+Math.sqrt(i)*11;this._food(165+Math.cos(a)*r,-110+Math.sin(a)*r,'mineral');}
      for(let i=0;i<4;i++){const a=this.range(0,TAU),r=this.range(280,460);this._organism('prey',Math.cos(a)*r,Math.sin(a)*r);}
      // The first hunter waits just beyond the nursery, so it's met when the player leaves rather than at the spawn.
      this._organism('hunter',1160,690,{tier:0});
      this._newObjective();this._events=[];
      return this;
    }
    _home(x,y){return Math.floor(x/CHUNK)+','+Math.floor(y/CHUNK);}
    _biomeAt(x,y){if(length(x,y)<880)return 0;return seedHash(this.state.seed+'|biome|'+Math.floor(x/(CHUNK*2))+','+Math.floor(y/(CHUNK*2)))%3;}
    // Distance from the centre no longer sets difficulty: creatures are sized against you when they appear.
    _tierAt(x,y){return 0;}
    // Richer, more dangerous water further out: each distance tier is worth 25% more.
    _tierValue(tier){return 1+Math.max(0,tier||0)*.25;}
    // Exploration and challenge rewards are a share of the current division, so they stay meaningful at every size.
    _divisionShare(fraction){const s=this.state;return Math.max(0,(s.nextDivision-s.divisionFrom)*fraction);}
    _grantBiomass(amount){const s=this.state;if(amount<=0)return 0;s.biomass+=amount;if(!s.pendingEvolution&&s.biomass>=s.nextDivision)this._divide();return amount;}
    _chunkRandom(meta,fn){const previous=this._rng;this._rng=meta.rng;try{return fn();}finally{meta.rng=this._rng;this._rng=previous;}}
    // The screen tells the pond how far it can see (world units either side of the player); the pond keeps that much water loaded,
    // at least two chunks each way. Not saved: a fresh page reports it again on its first frame.
    setView(halfWidth,halfHeight){if(!(halfWidth>0&&halfHeight>0&&halfWidth<1e6&&halfHeight<1e6))return;if(halfWidth>0&&halfHeight>0)this._view=[Number(halfWidth),Number(halfHeight)];const reach=Math.max(Number(halfWidth)||0,Number(halfHeight)||0);const want=clamp(Math.ceil((reach+120)/CHUNK),2,6),cur=this._loadR||0;this._loadR=want>=cur?want:Math.min(cur,clamp(Math.ceil((reach+300)/CHUNK),2,6));}
    loadReach(){return (this._loadR||2)*CHUNK;}
    // Nothing is created where the player can see it. _inView tests a point against the screen (plus a margin); _edge gives the distance
    // from the player, along a direction, at which a point is just off the screen. Until a screen reports in, a typical one is assumed.
    _inView(x,y,margin=0){const p=this.state.player,v=this._view||[1100,700];return Math.abs(x-p.x)<v[0]+margin&&Math.abs(y-p.y)<v[1]+margin;}
    // A point moved straight away from the player until it is off the screen (unchanged if it already is).
    _offscreen(x,y,margin=160){if(!this._inView(x,y,margin))return [x,y];const p=this.state.player,a=Math.atan2(y-p.y,x-p.x),d=this._edge(a,margin)+1;return [p.x+Math.cos(a)*d,p.y+Math.sin(a)*d];}
    _edge(angle,margin=160){const v=this._view||[1100,700],c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));return Math.min(c>1e-6?(v[0]+margin)/c:1e9,s>1e-6?(v[1]+margin)/s:1e9);}
    _loadRadius(){return this._loadR||2;}
    // Caps on how much is kept loaded grow with the loaded area (25 chunks at the usual radius of two).
    _areaScale(){const n=2*this._loadRadius()+1;return n*n/25;}
    _orgCap(){return Math.round(120*Math.min(3,this._areaScale()));}
    // Wildlife thins out as you grow: the camera shows more water at larger sizes, and every creature in it is bigger, so a constant
    // density would crowd the screen. This keeps roughly the same number of creatures in view at any size.
    _lifeDensity(x,y){return Math.min(1,1/Math.pow(Math.max(1,Number.isFinite(x)?waterScale(x,y):(this.state.player.sizeScale||1)),1.1));}
    // A creature that has just appeared (spawned, hatched from a nest, or come back into range) cannot attack for two seconds.
    _markFresh(o){const born=this._born||(this._born=new Map()),now=this.state.time;if(born.size>300)for(const [id,until] of born)if(until<=now)born.delete(id);born.set(o.id,now+2);}
    _fresh(o){const born=this._born;if(!born)return false;const until=born.get(o.id);if(until===undefined)return false;if(until>this.state.time)return true;born.delete(o.id);return false;}
    _stream(force=false){
      const s=this.state,p=s.player,cx=Math.floor(p.x/CHUNK),cy=Math.floor(p.y/CHUNK),needed=new Set(),R=this._loadRadius();
      for(let y=cy-R;y<=cy+R;y++)for(let x=cx-R;x<=cx+R;x++)needed.add(x+','+y);
      // Mobile life belongs to where it is now, so nearby pursuers survive streaming.
      for(const o of this.state.organisms){const actual=this._home(o.x,o.y);if(needed.has(actual)||this._chunks[actual]){o.home=actual;o.biome=this._biomeAt(o.x,o.y);}}
      for(const key of Object.keys(this._chunks))if(!needed.has(key))this._unloadChunk(key);
      const ordered=[...needed].sort((a,b)=>{const [ax,ay]=a.split(',').map(Number),[bx,by]=b.split(',').map(Number);return length((ax+.5)*CHUNK-p.x,(ay+.5)*CHUNK-p.y)-length((bx+.5)*CHUNK-p.x,(by+.5)*CHUNK-p.y);});
      // Water another player is already in has its creatures on their device: take the place, not a second set.
      for(const key of ordered)if(!this._chunks[key]){const had=this.coop&&this._peerHad(key)?new Set(s.organisms):null;this._loadChunk(key);if(had)s.organisms=s.organisms.filter(o=>had.has(o)||o.nestId);}
      const area=this._areaScale();for(const [name,cap] of [['foods',Math.round(1100*Math.min(3,area))],['organisms',this._orgCap()],['scenery',Math.round(130*area)],['hazards',Math.round(64*area)]])if(s[name].length>cap){s[name].sort((a,b)=>distance(a,p)-distance(b,p));s[name].length=cap;}
      const b=this._biomeAt(p.x,p.y);if(b!==s.biome){s.previousBiome=s.biome;s.biome=b;s.biomeName=biomeNames[b];s.biomeTransition=0;this._event('biome',{name:s.biomeName,index:b});}
      if(this.coop)for(const q of this.coop.peers.values())q.was=q.body&&q.body.active&&Number.isFinite(q.body.x)?[Math.floor(q.body.x/CHUNK),Math.floor(q.body.y/CHUNK),q.body.lr||2]:null;
      s.world.chunkX=cx;s.world.chunkY=cy;s.world.loadedChunks=Object.keys(this._chunks).length;
      {const deep=waterLevel(p.x,p.y)+1;if(!(s.stats.deepest>=deep))s.stats.deepest=deep;}
      this._streamClock=.4;
    }
    // After an old save is converted its water has no creatures: give each loaded chunk its ordinary wildlife again, away from the player.
    _restock(){
      const s=this.state,p=s.player;
      for(const meta of Object.values(this._chunks)){const before=s.organisms.length,{key,cx,cy,biome}=meta;
        this._chunkRandom(meta,()=>{for(let i=0;i<3;i++){const x=(cx+.12+this.random()*.76)*CHUNK,y=(cy+.12+this.random()*.76)*CHUNK,roll=this.random();if(length(x-p.x,y-p.y)<700)continue;let kind=roll<.48?'prey':roll<.70?'grazer':roll<.88?'hunter':'armoured';if(length(x,y)<NURSERY_RADIUS&&kind!=='grazer')kind='prey';const sp=this._rollSpecies(x,y,biome,.34,HOSTILE_KINDS.includes(kind));if(sp)this._spawnSpecies(sp,x,y,{home:key,biome});else this._organism(kind,x,y,{home:key,biome});}});
        const keep=this._lifeDensity((cx+.5)*CHUNK,(cy+.5)*CHUNK),fresh=s.organisms.slice(before);s.organisms.length=before;for(const o of fresh)if(o.leaderId||this.random()<keep)s.organisms.push(o);}
    }
    _elderFell(o){if(!o||!o.elder||typeof o.elderHome!=='string')return;const st=this.state.stats,fallen=Array.isArray(st.eldersFallen)?st.eldersFallen:(st.eldersFallen=[]);if(!fallen.includes(o.elderHome)){fallen.push(o.elderHome);if(fallen.length>600)fallen.shift();}}
    _maybeElder(key,cx,cy,biome){
      const s=this.state,x=(cx+.3+this.random()*.4)*CHUNK,y=(cy+.3+this.random()*.4)*CHUNK,roll=this.random(),pick=this.random(),nameRoll=this.random();
      if(roll>=ELDER_CHANCE||waterLevel(x,y)<2||length(x,y)<NURSERY_RADIUS+900||(s.stats.eldersFallen||[]).includes(key))return null;
      if(s.organisms.some(o=>o.elder&&!o.dead&&length(o.x-x,o.y-y)<2600)||s.landmarks.some(l=>length(l.x-x,l.y-y)<l.r+420))return null;
      const able=['puffer','murk','splitter','ripjaw','sporemother','lurker'].filter(k=>SPECIES[k]&&SPECIES[k].minStage*3<=waterLevel(x,y)&&(!SPECIES[k].biomes||SPECIES[k].biomes.includes(biome))),sp=pick<.4&&able.length?able[Math.floor(pick/.4*able.length)]:'',big=waterScale(x,y)*1.1,o=sp?this._spawnSpecies(sp,x,y,{home:key,biome,scale:big}):this._organism(pick<.75?'hunter':'armoured',x,y,{home:key,biome,scale:big,plain:true});
      if(!o||!HOSTILE_KINDS.includes(o.kind)||o.kind==='jelly'||o.kind==='sentinel')return null;
      o.elderHome=key;return this._makeElder(o,ELDER_NAMES[Math.floor(nameRoll*ELDER_NAMES.length)]);
    }
    _makeElder(o,name){
      const spec=o.species?SPECIES[o.species]:null,kindName=(spec?spec.name:o.kind==='armoured'?'scavenger':KIND_NAMES[o.kind]||'predator').toLowerCase();
      o.elder=true;o.elderName=String(name||'Old one')+', ancient '+kindName;o.elite='';o.stamina=Math.min(o.stamina,this._profile(o).capacity);o.r*=1.35;o.attackWidth=o.r*1.4;o.maxHp*=ELDER_HEALTH;o.hp=o.maxHp;o.might=(Number.isFinite(o.might)?o.might:1)*ELDER_MIGHT;
      o.anchorX=o.x;o.anchorY=o.y;o.leaderId=undefined;delete o.leaderId;
      // Quicker than its kind, so backing away while shooting does not keep it off you.
      o.speed*=1.3;return o;
    }
    _unloadChunk(key){
      // Leaving water another player is still in: my creatures there carry on with them instead of being put away.
      if(this.coop){const s=this.state,q=this._peerHolding(key);if(q)for(const o of s.organisms)if(o.home===key&&!o.puppet&&!o.dead&&!o.bossId&&!o.nestId)this._give(o,q.id);s.organisms=s.organisms.filter(o=>!(o.puppet&&o.home===key));}
      const saved={meta:this._chunks[key]};
      for(const name of ['foods','organisms','hazards','scenery','landmarks']){saved[name]=this.state[name].filter(v=>v.home===key);this.state[name]=this.state[name].filter(v=>v.home!==key);}
      this._chunkCache[key]=saved;this._cacheOrder=this._cacheOrder.filter(k=>k!==key);this._cacheOrder.push(key);delete this._chunks[key];
      while(this._cacheOrder.length>20){const old=this._cacheOrder.shift();delete this._chunkCache[old];}
    }
    _loadChunk(key){
      const cached=this._chunkCache[key];
      if(cached){this._chunks[key]=cached.meta;for(const name of ['foods','organisms','hazards','scenery','landmarks'])this.state[name].push(...cached[name]);for(const o of cached.organisms)this._markFresh(o);delete this._chunkCache[key];this._cacheOrder=this._cacheOrder.filter(k=>k!==key);for(const l of cached.landmarks)this._restoreLandmark(l);return;}
      const [cx,cy]=key.split(',').map(Number),seed=seedHash(this.state.seed+'|chunk|'+key),biome=this._biomeAt((cx+.5)*CHUNK,(cy+.5)*CHUNK);
      const meta={key,cx,cy,biome,rng:seed,foodClock:7+seed%5,mobClock:35+seed%13};this._chunks[key]=meta;const lifeBefore=this.state.organisms.length;
      this._chunkRandom(meta,()=>{
        const patches=[];
        for(let patch=0;patch<3;patch++){const px=(cx+.16+this.random()*.68)*CHUNK,py=(cy+.16+this.random()*.68)*CHUNK,mineralPatch=patch===2&&(biome===1||this.random()<.42);patches.push([px,py]);for(let i=0;i<12;i++){const a=this.range(0,TAU),r=this.range(12,115);this._food(px+Math.cos(a)*r,py+Math.sin(a)*r,this.random()<(mineralPatch?.84:biome===1?.12:.08)?'mineral':'algae',undefined,key,biome);}}
        // Scenery and hazards come before the creatures: creature rolls depend on the player, and every
        // co-op device must build the same reef from the same seed.
        for(let i=0;i<4;i++){const x=(cx+this.random())*CHUNK,y=(cy+this.random())*CHUNK;this.state.scenery.push({id:this._id++,x,y,r:this.range(28,110),kind:deepScenery(waterLevel(x,y),this.random())||(biome===0?(i%2?'algae':'fibre'):biome===1?'diatom':(i%2?'fibre':'algae')),angle:this.range(0,TAU),phase:this.range(0,TAU),biome,home:key});}
        for(let i=0;i<biome;i++){let x=(cx+.2+this.random()*.6)*CHUNK,y=(cy+.2+this.random()*.6)*CHUNK;const hr=this.range(48,92);[x,y]=this._clearOfPlaces(x,y,hr);if(length(x,y)>NURSERY_RADIUS+100)this.state.hazards.push({id:this._id++,x,y,r:hr,kind:biome===1?'vent':'toxin',phase:this.range(0,TAU),biome,home:key});}
        for(let i=0;i<3;i++){const x=(cx+.12+this.random()*.76)*CHUNK,y=(cy+.12+this.random()*.76)*CHUNK,roll=this.random();let kind=roll<.48?'prey':roll<.70?'grazer':roll<.88?'hunter':'armoured';if(biome===2&&roll>.94&&length(x,y)>1200)kind='apex';if(length(x,y)<NURSERY_RADIUS&&(kind==='hunter'||kind==='apex'||kind==='armoured'))kind='prey';const sp=this._rollSpecies(x,y,biome,.34,HOSTILE_KINDS.includes(kind));if(sp)this._spawnSpecies(sp,x,y,{home:key,biome,tier:this._tierAt(x,y)});else this._organism(kind,x,y,{home:key,biome,tier:this._tierAt(x,y)});}
        this._signatureLife(key,cx,cy,biome,patches);
        this._maybeElder(key,cx,cy,biome);
      });
      {const keep=this._lifeDensity((cx+.5)*CHUNK,(cy+.5)*CHUNK);if(keep<1){const s=this.state,fresh=s.organisms.slice(lifeBefore);s.organisms.length=lifeBefore;for(const o of fresh)if(o.nestId||o.leaderId||o.elder||this.random()<keep)s.organisms.push(o);}}
      const l=this._landmarkFor(cx,cy);if(l){if(l.type==='sanctuary'||l.type==='garden')this.state.hazards=this.state.hazards.filter(h=>distance(h,l)>l.r+h.r+80);this._restoreLandmark(l);this.state.landmarks.push(l);if(l.type==='garden')this._growGarden(l);if(l.type==='smoker')this._growSmoker(l);if(l.type==='trail'&&!l.claimed)this._growHidden(l);if(l.type==='vault'&&this._wardenMine(l))this._spawnWarden(l,l.x,l.y);}
    }
    // Picks a named species for a spawn by rarity, colony size, habitat and distance; '' keeps the plain creature.
    // Hostile species stay out of the nursery, rare ones need open water (distance tier 1+) and only one rare is about at a time.
    // "hostile" keeps the pond's mix steady: a named species only takes the place of a creature of the same temper, so a peaceful
    // spawn is never swapped for a predator as the colony grows.
    _rollSpecies(x,y,biome,chance=.34,hostile){
      // Named species become more common in deeper water, and each first appears at its own depth (water level minStage*3).
      const water=waterLevel(x,y);if(this.random()>=Math.min(.62,chance+water*.016))return '';
      const s=this.state,p=s.player,d=length(x,y),tier=this._tierAt(x,y),rareNear=s.organisms.some(o=>!o.dead&&o.species&&SPECIES[o.species].rarity==='rare'&&distance(o,p)<2600);
      const pool=[];let total=0;
      for(const [key,sp] of Object.entries(SPECIES)){
        if(hostile!==undefined&&HOSTILE_KINDS.includes(sp.base)!==hostile)continue;
        if(sp.spawnOnly||sp.rarity==='legendary'||sp.minStage*3>water||(sp.biomes&&!sp.biomes.includes(biome)))continue;
        if(HOSTILE_KINDS.includes(sp.base)&&d<NURSERY_RADIUS+150)continue;
        if(sp.rarity==='rare'&&rareNear)continue;
        const w=RARITY_WEIGHT[sp.rarity];pool.push([key,w]);total+=w;
      }
      let roll=this.random()*total;for(const [key,w] of pool)if((roll-=w)<0)return key;return '';
    }
    _spawnSpecies(key,x,y,options={}){
      const sp=SPECIES[key],o=this._organism(sp.base,x,y,{...options,species:key});
      const extra=sp.group?Math.floor(this.range(sp.group[0],sp.group[1]+.999))-1:0;
      for(let i=0;i<extra;i++)this._organism(sp.base,x+this.range(-50,50),y+this.range(-50,50),{...options,species:key});
      if(sp.escort)for(let i=0;i<sp.escort;i++){const a=i*TAU/sp.escort,e=this._organism('hunter',x+Math.cos(a)*120,y+Math.sin(a)*120,{...options});e.leaderId=o.id;}
      return o;
    }
    // Legendary creatures are not placed with the world: every few minutes one may arrive from beyond view.
    _summonLegend(force=''){
      const s=this.state,p=s.player;if(s.bossEncounter||s.status!=='playing'||s.organisms.some(o=>!o.dead&&o.species&&SPECIES[o.species].rarity==='legendary'))return null;
      const pool=Object.keys(SPECIES).filter(k=>SPECIES[k].rarity==='legendary'&&(force?k===force:SPECIES[k].minStage*3<=waterLevel(p.x,p.y)));if(!pool.length)return null;
      if(!force&&(this.random()>.5||length(p.x,p.y)<NURSERY_RADIUS*2))return null;
      const key=pool[Math.floor(this.random()*pool.length)];let at=null;
      for(let i=0;i<10&&!at;i++){const a=this.range(0,TAU),far=Math.max(1500,this._edge(a,420)),x=p.x+Math.cos(a)*far,y=p.y+Math.sin(a)*far;if(length(x,y)<NURSERY_RADIUS+600||s.landmarks.some(l=>l.type==='sanctuary'&&length(l.x-x,l.y-y)<l.r+400))continue;at=[x,y];}
      if(!at)return null;at=this._offscreen(at[0],at[1],700);const lv=waterLevel(at[0],at[1]),o=this._spawnSpecies(key,at[0],at[1],{level:lv,scale:bodyScale(lv+1)});this._event('legendStirs',{species:key,name:SPECIES[key].name,x:o.x,y:o.y});return o;
    }
    // Per-frame signature traits. Runs after the organism has moved.
    _speciesTick(o,dt,dp){
      const s=this.state,p=s.player,sp=SPECIES[o.species];if(!sp)return;
      if(sp.rarity==='legendary'&&dp>4200){o.dead=true;return;}
      // Nothing outside an elder's arena reaches into the fight.
      if(s.bossEncounter&&!o.bossId){o.latchTime=0;o.tetherTime=0;o.vortexTime=0;o.vortexWind=0;return;}
      // Leech: rides the player and drains health until a fast swim or a hit shakes it off. It never takes the last 5%.
      if(o.latchTime>0){o.latchTime=Math.max(0,o.latchTime-dt);if(p.sprinting||s.status!=='playing')o.latchTime=0;else{const a=(o.latchAngle||0)+p.angle,k=p.r+o.r*.4;o.x=p.x+Math.cos(a)*k;o.y=p.y+Math.sin(a)*k;o.vx=p.vx;o.vy=p.vy;p.hp=Math.max(Math.min(p.hp,p.maxHp*.05),p.hp-dt*(3+Math.min(o.tier,5)*.6)*Math.pow(o.scale||1,SIZE_POWER)*clamp(o.might||1,1,2));p.regenDelay=Math.max(p.regenDelay,2);}if(o.latchTime===0){o.flee=1.2;o.cooldown=3;}}
      // Siren jelly: a current that draws the player in, unless swimming fast.
      const pullIn=p.r+o.r*.85,pullOut=pullIn+(sp.pull||0)*(o.scale||1);if(sp.pull&&dp<pullOut&&dp>o.r*.6&&!p.sprinting&&s.status==='playing'&&!this._hasMutation('abyssalHeart')){const k=clamp(1-(dp-pullIn)/(pullOut-pullIn),.15,1)*50*Math.sqrt(o.scale||1)*dt;p.x+=(o.x-p.x)/dp*k;p.y+=(o.y-p.y)/dp*k;}
      // Lasher: the tendril holds and drags while it lasts.
      if(o.tetherTime>0){o.tetherTime=Math.max(0,o.tetherTime-dt);if(p.sprinting||dp>(sp.tetherReach||330)+40||s.status!=='playing'||this._hasMutation('abyssalHeart'))o.tetherTime=0;else if(dp>o.r+p.r){const k=Math.min(dp-o.r-p.r,250*dt);p.x+=(o.x-p.x)/dp*k;p.y+=(o.y-p.y)/dp*k;}}
      // A bite at the mouth for rooted or slow giants (jellies sting through their own rule).
      if(sp.sting&&o.kind!=='jelly'&&dp<p.r+o.r*.96+2&&s.status==='playing')this._damagePlayer((sp.sting+Math.min(o.tier,5)*2)*Math.pow(o.scale||1,SIZE_POWER)*clamp(o.might||1,1,2),o);
      // Wandering giant: a trail of food behind it.
      // Hurt, it defends itself: it gathers for a moment (a swelling pulse) and then sends out a crushing shockwave round its body.
      if(sp.shed){if(Number.isFinite(o._lastHp)&&o.hp<o._lastHp-1e-6)o.roused=8;o._lastHp=o.hp;
        if(o.roused>0){o.roused-=dt;o.quakeClock=(o.quakeClock??1.5)-dt;const reach=o.r+170*Math.sqrt(o.scale||1);
          if(o.quakeWind>0){o.quakeWind-=dt;if(o.quakeWind<=0){this._effect(o.x,o.y,'burst',Math.min(10000,reach),'#bfe8d6',.55);this._event('hit',{target:'creature',x:o.x,y:o.y});
            if(s.status==='playing'&&dp<reach+p.r&&p.invulnerable<=0){this._damagePlayer(p.maxHp*.14,o);const a=Math.atan2(p.y-o.y,p.x-o.x);p.vx+=Math.cos(a)*520;p.vy+=Math.sin(a)*520;}}}
          else if(o.quakeClock<=0&&dp<reach+260){o.quakeClock=3.2;o.quakeWind=1.15;}}}
      if(sp.shed){o.shedClock=(o.shedClock??1.2)-dt;if(o.shedClock<=0){o.shedClock=1.2;const a=(o.angle||0)+Math.PI+this.range(-.5,.5);for(let i=0;i<3;i++)this._food(o.x+Math.cos(a)*o.r*(.9+i*.15),o.y+Math.sin(a)*o.r*(.9+i*.15),i===2?'mineral':'algae',2,o.home,o.biome);}}
      // Storm diatom: a second ring follows the first.
      if(o.ringAgain>0){o.ringAgain-=dt;if(o.ringAgain<=0){o.ringAgain=0;this._shardRing(o,o.attackAngle+Math.PI/8,185);}}
      // Brood carrier: a clutch of hatchlings when the player comes near, at most six alive per carrier.
      if(sp.brood){o.broodClock=(o.broodClock??2)-dt;if(o.broodClock<=0&&dp<620&&!this._nurseryCalm()){o.broodClock=9;const alive=s.organisms.filter(v=>!v.dead&&v.parentId===o.id).length;for(let i=0;i<Math.min(3,6-alive);i++){const a=this.range(0,TAU),h=this._organism('swarmer',o.x+Math.cos(a)*o.r,o.y+Math.sin(a)*o.r,{species:'hatchling',home:o.home,biome:o.biome,tier:o.tier});h.parentId=o.id;}this._particles(o.x,o.y,'#f2a7c4',14,80);}}
      // Leviathan: swallows smaller life it swims through; touching it hurts.
      if(sp.devour){for(const v of s.organisms){if(v===o||v.puppet||v.dead||v.bossId||v.nestId||(v.species&&SPECIES[v.species].rarity==='legendary'))continue;if(distance(o,v)<o.r*.75+v.r){v.dead=true;o.hp=Math.min(o.maxHp,o.hp+v.maxHp*.2);this._particles(v.x,v.y,'#d6a6ad',6,50);}}if(dp<o.r*.7+p.r&&s.status==='playing')this._damagePlayer((30+Math.min(o.tier,5)*3)*Math.pow(o.scale||1,SIZE_POWER)*clamp(o.might||1,1,2),o);}
      // Abyssal maw: a wind-up, then a vortex that drags everything towards the mouth. Fast swim resists most of it.
      if(sp.vortex){
        if(o.vortexTime>0){o.vortexTime=Math.max(0,o.vortexTime-dt);const reach=560;
          for(const v of s.organisms){if(v===o||v.puppet||v.dead||v.bossId||v.nestId)continue;const d=distance(o,v);if(d<reach&&d>1){const k=Math.min(d,((1-d/reach)*190+30)*dt);v.x+=(o.x-v.x)/d*k;v.y+=(o.y-v.y)/d*k;if(d<o.r*.55+v.r){v.dead=true;o.hp=Math.min(o.maxHp,o.hp+v.maxHp*.15);}}}
          if(dp<reach&&dp>1&&s.status==='playing'&&!this._hasMutation('abyssalHeart')){const k=Math.min(dp,((1-dp/reach)*150+25)*(p.sprinting?.35:1)*dt);p.x+=(o.x-p.x)/dp*k;p.y+=(o.y-p.y)/dp*k;}}
        else if(o.vortexWind>0){o.vortexWind=Math.max(0,o.vortexWind-dt);if(o.vortexWind===0){o.vortexTime=3.2;this._event('vortex',{x:o.x,y:o.y});}}
        else{o.vortexClock=(o.vortexClock??6)-dt;if(o.vortexClock<=0&&dp<720&&!this._nurseryCalm()){o.vortexClock=12;o.vortexWind=1.3;this._event('windup',{kind:o.kind,attackKind:'vortex',duration:1.3,x:o.x,y:o.y});}}
      }
    }
    // A legendary sends the pond running: once it is within range, a herd of smaller life streams past the player, away from it.
    _legend(){return this.state.organisms.find(o=>!o.dead&&o.species&&SPECIES[o.species].rarity==='legendary')||null;}
    _legendHerds(){
      const s=this.state,p=s.player,o=this._legend();if(!o||s.status!=='playing'||s.bossEncounter)return;const d=distance(o,p);
      if((o.herds||0)>=2||d<700||d>2600||(o.herdAt||0)>s.time)return;o.herds=(o.herds||0)+1;o.herdAt=s.time+9;
      const dx=(o.x-p.x)/d,dy=(o.y-p.y)/d,near=Math.max(480,this._edge(Math.atan2(dy,dx),260)),cx=p.x+dx*near,cy=p.y+dy*near,count=8+Math.floor(this.random()*5);
      for(let i=0;i<count;i++){const x=cx+this.range(-170,170),y=cy+this.range(-170,170),roll=this.random();const v=roll<.45?this._organism('prey',x,y,{species:roll<.25?'skimmer':undefined}):roll<.8?this._organism('grazer',x,y,{}):this._organism('hunter',x,y,{});v.flee=3;v.vx=-dx*120;v.vy=-dy*120;v.angle=Math.atan2(-dy,-dx);}
      this._event('herd',{x:cx,y:cy,count});
    }
    // Pond events: every few minutes, one change of pace while the player is out in open water.
    _pondEvents(dt){
      const s=this.state,p=s.player,e=s.pondEvent;
      if(e){e.time-=dt;
        if(e.type==='frenzy'&&e.time>0&&!s.bossEncounter){const near=s.foods.filter(f=>length(f.x-e.x,f.y-e.y)<200).length;if(near<45&&distance(e,p)<1600)for(let i=0;i<6;i++){const a=this.range(0,TAU),r=this.range(0,170);this._food(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r,this.random()<.35?'protein':'algae',this.random()<.35?6:1.6);}
          // At most four predators are drawn to the frenzy.
          let drawn=s.organisms.filter(o=>!o.dead&&o.frenzy).length;for(const o of s.organisms){if(drawn>=4)break;if(!o.dead&&!o.frenzy&&isHostile(o)&&o.kind!=='jelly'&&o.kind!=='sentinel'&&!o.bossId&&!o.nestId&&!(o.species&&SPECIES[o.species].rarity==='legendary')&&length(o.x-e.x,o.y-e.y)<800&&!o.chasing){o.frenzy=true;o.pursuit=4;o.lastSeenX=e.x;o.lastSeenY=e.y;drawn++;}}}
        if(e.type==='migration'||e.type==='giant')for(const o of s.organisms)if(o.drift&&e.time<=0){o.drift=null;if(distance(o,p)>1000)o.dead=true;}
        if(e.time<=0){if(e.type==='frenzy')for(const o of s.organisms)o.frenzy=false;s.pondEvent=null;this._event('pondEventEnd',{eventType:e.type});}
        return;}
      this._eventClock=(Number.isFinite(this._eventClock)?this._eventClock:150)-dt;
      if(this._eventClock>0||s.bossEncounter||this._legend()||s.status!=='playing'||length(p.x,p.y)<NURSERY_RADIUS+300)return;
      this._eventClock=this.range(200,320);this.startPondEvent();
    }
    startPondEvent(type=''){
      const s=this.state,p=s.player,types=['frenzy','migration','darkwater','giant'];type=types.includes(type)?type:this.random()<.13?'giant':types[Math.floor(this.random()*3)];
      const a=this.range(0,TAU),e={type,time:type==='frenzy'?65:type==='migration'?80:type==='giant'?120:70,x:p.x,y:p.y};
      if(type==='giant'){const far=Math.max(900,this._edge(a+Math.PI,620)),g=this._spawnSpecies('wanderer',p.x-Math.cos(a)*far,p.y-Math.sin(a)*far,{});g.drift={vx:Math.cos(a)*22,vy:Math.sin(a)*22};g.angle=a;e.x=g.x;e.y=g.y;}
      if(type==='frenzy'){const site=Math.max(560,this._edge(a,320));e.x=p.x+Math.cos(a)*site;e.y=p.y+Math.sin(a)*site;
        for(let i=0;i<40;i++){const b=this.range(0,TAU),r=this.range(0,180);this._food(e.x+Math.cos(b)*r,e.y+Math.sin(b)*r,this.random()<.35?'protein':'algae',this.random()<.35?6:1.6);}
        for(let i=0;i<4;i++)this._organism('prey',e.x+this.range(-120,120),e.y+this.range(-120,120),{species:i%2?'skimmer':undefined});
        for(let i=0;i<2;i++){const b=a+Math.PI+this.range(-.8,.8),from=this._edge(b,200),h=this._organism('hunter',p.x+Math.cos(b)*from,p.y+Math.sin(b)*from,{species:p.stage>=1&&i===0?'needlefish':undefined});h.frenzy=true;h.pursuit=4;h.lastSeenX=e.x;h.lastSeenY=e.y;}}
      if(type==='migration'){const dir=a,nx=-Math.sin(dir),ny=Math.cos(dir),count=7+Math.floor(this.random()*3);
        for(let i=0;i<count;i++){const off=(i-(count-1)/2)*130,back=Math.max(760,this._edge(dir+Math.PI,220)),x=p.x-Math.cos(dir)*back+nx*off+this.range(-40,40),y=p.y-Math.sin(dir)*back+ny*off+this.range(-40,40),siren=i===Math.floor(count/2)&&p.stage>=4&&this.random()<.35;
          const [jx,jy]=this._offscreen(x,y,220),j=this._organism('jelly',jx,jy,siren?{species:'siren'}:{});j.drift={vx:Math.cos(dir)*26,vy:Math.sin(dir)*26};}
        e.dirX=Math.cos(dir);e.dirY=Math.sin(dir);}
      s.pondEvent=e;this._event('pondEvent',{eventType:type,x:e.x,y:e.y,px:p.x,py:p.y});return e;
    }
    _shardRing(o,angle,speed){
      const s=this.state,n=o.species==='stormdiatom'?10:8;
      const ks=Math.sqrt(o.scale||1);for(let i=0;i<n;i++){const a=angle+i*TAU/n;s.projectiles.push({id:this._id++,x:o.x+Math.cos(a)*o.r,y:o.y+Math.sin(a)*o.r,vx:Math.cos(a)*speed*ks,vy:Math.sin(a)*speed*ks,r:6*(o.scale||1),life:o.attackRange/(speed*ks),life:o.attackRange/speed,damage:o.attackDamage,owner:'enemy',sourceId:o.id,colour:'#efe2a6'});}
      if(s.projectiles.length>80)s.projectiles.splice(0,s.projectiles.length-80);
    }
    // Each habitat has a signature creature, absent from the opening and more common and numerous with distance.
    _signatureLife(key,cx,cy,biome,patches=[],replenish=false){
      const mx=(cx+.5)*CHUNK,my=(cy+.5)*CHUNK;if(length(mx,my)<1500)return 0;
      const tier=this._tierAt(mx,my),chance=replenish?.3:Math.min(.75,.4+tier*.1);if(this.random()>=chance)return 0;
      const site=patches.length?patches[Math.floor(this.random()*patches.length)]:[(cx+.2+this.random()*.6)*CHUNK,(cy+.2+this.random()*.6)*CHUNK];
      if(length(site[0],site[1])<NURSERY_RADIUS+300)return 0;
      const kind=biome===0?'jelly':biome===1?'sentinel':'swarmer',count=kind==='swarmer'?Math.min(8,(replenish?3:4)+tier):kind==='jelly'?1+(tier>=2?1:0):1+(tier>=3?1:0),spread=kind==='swarmer'?60:kind==='jelly'?110:150;
      for(let i=0;i<count;i++)this._organism(kind,site[0]+this.range(-spread,spread),site[1]+this.range(-spread,spread),{home:key,biome,tier});
      return count;
    }
    // Where each wonder lies in this pond: its own depth, a direction from the seed, and the region (chunk) that holds it.
    _wonderSites(){
      if(this._wonderSeed===this.state.seed&&this._wonderMap)return this._wonderMap;const map=new Map(),rng=localRng(seedHash(this.state.seed+'|wonders'));
      for(const w of WONDERS){const a=rng()*TAU,d=1250+ZONE_STEP*(w.zone-1)+ZONE_STEP*(.3+rng()*.4),x=Math.cos(a)*d,y=Math.sin(a)*d,jx=(rng()-.5)*1800,jy=(rng()-.5)*1800;map.set(Math.floor(x/CHUNK)+','+Math.floor(y/CHUNK),{...w,x,y,rumourX:x+jx,rumourY:y+jy});}
      this._wonderSeed=this.state.seed;this._wonderMap=map;return map;
    }
    // Rumours: the rough area of every wonder you have not found, from a few levels above its water.
    wonderFound(){const s=this.state;return [...this._wonderSites()].filter(([key])=>s.landmarkRecords['lm:'+key]&&s.landmarkRecords['lm:'+key].discovered).map(([key,w])=>({type:w.type,x:w.x,y:w.y,claimed:!!s.landmarkRecords['lm:'+key].claimed}));}
    wonderRumours(){const s=this.state,p=s.player,here=waterLevel(p.x,p.y);return [...this._wonderSites()].filter(([key,w])=>!(s.landmarkRecords['lm:'+key]&&s.landmarkRecords['lm:'+key].discovered)&&here>=w.zone-4).map(([,w])=>w).map(w=>({type:w.type,x:w.rumourX,y:w.rumourY,r:1500,zone:w.zone}));}
    // Would this region's ordinary roll make a sanctuary? (The same draws _landmarkFor makes, without the spacing rule.)
    _rollsSanctuary(cx,cy){
      if(cx===0&&cy===-1)return true;if(cx===0&&cy===0||this._wonderSites().has(cx+','+cy))return false;const key=cx+','+cy,rng=localRng(seedHash(this.state.seed+'|landmark|'+key));
      if(rng()>.67)return false;const kinds=Object.keys(LANDMARKS).filter(k=>!k.startsWith('wonder')&&k!=='sanctum'&&k!=='vault'&&k!=='smoker'&&!RARE_LANDMARKS.includes(k)&&!SECRET_LANDMARKS.includes(k)&&(length(cx,cy)>=2||!DEEP_LANDMARKS.includes(k)));
      if(kinds[Math.floor(rng()*kinds.length)]!=='sanctuary')return false;if(length(cx,cy)>=2&&localRng(seedHash(this.state.seed+'|rare|'+key))()<.11)return false;return true;
    }
    _sanctuaryYields(cx,cy){
      const mine=seedHash(this.state.seed+'|sanc|'+cx+','+cy);
      for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){if(!dx&&!dy)continue;const nx=cx+dx,ny=cy+dy;if(!this._rollsSanctuary(nx,ny))continue;if(nx===0&&ny===-1||seedHash(this.state.seed+'|sanc|'+nx+','+ny)<mine)return true;}
      return false;
    }
    // A secret takes an empty region only (so no record, task or hazard of an older pond is moved), about one in fifty regions from water level 6.
    _secretFor(cx,cy){
      if(length(cx,cy)<2)return null;const key=cx+','+cy,rng=localRng(seedHash(this.state.seed+'|secret|'+key)),first=rng();if(first>=.075)return null;
      // Empty nurseries (v36.2) take their own slice of the roll, so the secrets placed in v36.0 stay where they are.
      const x=(cx+.25+rng()*.5)*CHUNK,y=(cy+.25+rng()*.5)*CHUNK,zone=waterLevel(x,y),kinds=first>=.06?(zone>=SECRET_FROM.nursery?['nursery']:[]):SECRET_LANDMARKS.filter(k=>k!=='nursery'&&zone>=SECRET_FROM[k]);if(!kinds.length)return null;
      const type=kinds[Math.floor(rng()*kinds.length)],def=LANDMARKS[type],turn=rng(),angle=type==='silent'?Math.atan2(y,x)+(turn-.5)*1.2:turn*TAU;
      return{id:'lm:'+key,type,bossType:'',x,y,r:def.r,name:def.name,biome:this._biomeAt(x,y),phase:rng()*TAU,angle,flowX:Math.cos(angle),flowY:Math.sin(angle),variant:0,discovered:false,claimed:false,active:false,progress:0,goal:def.goal,guardianIds:[],home:key};
    }
    // The lantern trail: seven faint lights running out from a hidden garden along its angle, the farthest about 1,500 away.
    static trailLights(l){const out=[];for(let i=0;i<7;i++){const d=300+i*200,w=Math.sin(i*1.7+(l.phase||0))*70,a=l.angle||0;out.push([l.x+Math.cos(a)*d-Math.sin(a)*w,l.y+Math.sin(a)*d+Math.cos(a)*w]);}return out;}
    // Where a silent current comes out: 2,800 along its flow, outside any place.
    _silentEnd(l){return this._clearOfPlaces(l.x+l.flowX*2800,l.y+l.flowY*2800,200);}
    _landmarkFor(cx,cy){
      {const w=this._wonderSites().get(cx+','+cy);if(w){const def=LANDMARKS[w.type],key=cx+','+cy;return{id:'lm:'+key,type:w.type,bossType:'',x:w.x,y:w.y,r:def.r,name:def.name,biome:this._biomeAt(w.x,w.y),phase:0,angle:Math.atan2(w.y,w.x),flowX:Math.cos(Math.atan2(w.y,w.x)),flowY:Math.sin(Math.atan2(w.y,w.x)),variant:0,discovered:false,claimed:false,active:false,progress:0,goal:def.goal,guardianIds:[],home:key};}}
      const key=cx+','+cy,rng=localRng(seedHash(this.state.seed+'|landmark|'+key));
      const fixed='',earlySanctuary=cx===0&&cy===-1;
      if(!fixed&&!earlySanctuary&&(cx!==0||cy!==0)&&rng()>.67)return this._secretFor(cx,cy);
      const kinds=Object.keys(LANDMARKS).filter(k=>!k.startsWith('wonder')&&k!=='sanctum'&&k!=='vault'&&k!=='smoker'&&!RARE_LANDMARKS.includes(k)&&!SECRET_LANDMARKS.includes(k)&&(length(cx,cy)>=2||!DEEP_LANDMARKS.includes(k)));let type=earlySanctuary?'sanctuary':cx===0&&cy===0?'bloom':kinds[Math.floor(rng()*kinds.length)],bossType=fixed||'';
      if(!fixed&&!earlySanctuary&&length(cx,cy)>=2){const roll=localRng(seedHash(this.state.seed+'|rare|'+key))();if(roll<.05)type='fossil';else if(roll<.11)type='shell';}if(type==='sanctuary'&&!earlySanctuary&&this._sanctuaryYields(cx,cy))type='geneCache';let def=LANDMARKS[type];
      const x=earlySanctuary?400:cx===0&&cy===0?520:fixed?(cx+.5)*CHUNK:(cx+.23+rng()*.54)*CHUNK,y=earlySanctuary?-350:cx===0&&cy===0?150:fixed?(cy+.5)*CHUNK:(cy+.23+rng()*.54)*CHUNK;
      // No predator nest, toxic garden or fallen giant near the start: one that would sit within reach of the nursery becomes a gene cache instead.
      if((type==='nest'||DEEP_LANDMARKS.includes(type))&&length(x,y)<NURSERY_RADIUS+400){type='geneCache';def=LANDMARKS[type];}
      const angle=rng()*TAU,variant=Math.floor(rng()*3);
      // Deep water has places of its own: glass vaults from water level 12, black smokers from 18.
      {const deep=rng(),zone=waterLevel(x,y);if(!fixed&&!earlySanctuary&&!RARE_LANDMARKS.includes(type)&&type!=='sanctuary'){if(zone>=17&&deep<.1)type='smoker';else if(zone>=11&&deep<.18)type='vault';def=LANDMARKS[type];}}
      return{id:'lm:'+key,type,bossType,x,y,r:type==='sanctum'?250:def.r+variant*8,name:bossType?BOSSES[bossType].name+' sanctum':prefixes[Math.floor(rng()*prefixes.length)]+' '+def.name.toLowerCase(),biome:this._biomeAt(x,y),phase:rng()*TAU,angle,flowX:Math.cos(angle),flowY:Math.sin(angle),variant,discovered:false,claimed:false,active:false,progress:0,goal:def.goal,guardianIds:[],home:key};
    }
    // The next boss you have not beaten, and the level it wakes at.
    nextBoss(){const p=this.state.player,type=BOSS_ORDER.find(k=>!p.genomes.includes(k));return type?{type,...BOSSES[type]}:null;}
    // Growth is never held back by a boss (v32.7). A boss you have outgrown hunts harder instead: see the hunt in _bossTick.
    growthGate(){return null;
      const p=this.state.player,gates=BOSS_ORDER.map((k,i)=>({stage:BOSSES[k].level,required:i+1,type:k})),gate=gates.find(g=>p.genomes.length<g.required);if(!gate)return null;
      return{required:gate.required,owned:p.genomes.length,atCells:gate.stage,blocked:p.stage+1>=gate.stage,nextBossType:gate.type,target:null};
    }
    _growthAllowed(){return true;
      const gate=this.growthGate(),p=this.state.player;if(!gate||!gate.blocked)return true;
      if(p.growthBlockedStage!==p.stage){p.growthBlockedStage=p.stage;this._event('growthBlocked',{...gate});}return false;
    }
    _restoreLandmark(l){
      const record=this.state.landmarkRecords[l.id];if(record){l.discovered=record.discovered;l.claimed=record.claimed;l.progress=Math.min(record.progress,l.goal);l.active=record.active;}
      if(this._claimed.has(l.id)){l.claimed=true;l.progress=l.goal;}
    }
    _recordLandmark(l){
      const old=this.state.landmarkRecords[l.id]||{};this.state.landmarkRecords[l.id]={discovered:!!l.discovered,claimed:!!l.claimed,active:!!l.active,progress:l.progress,defeated:old.defeated||[]};
      const entry=this.state.discoveredLandmarks.find(x=>x.id===l.id);if(entry){entry.claimed=l.claimed;entry.progress=l.progress;entry.goal=l.goal;}
    }
    _discoverLandmark(l){
      if(l.discovered)return false;l.discovered=true;const s=this.state;s.stats.discoveries++;s.score+=40;if(s.lead&&s.lead.id===l.id)s.lead=null;
      s.discoveredLandmarks.push({id:l.id,type:l.type,bossType:l.bossType||'',name:l.name,x:l.x,y:l.y,biome:l.biome,claimed:l.claimed,progress:l.progress,goal:l.goal,time:s.time});if(s.discoveredLandmarks.length>200)s.discoveredLandmarks.shift();
      this._recordLandmark(l);this._event('discovery',{id:l.id,landmarkType:l.type,name:l.name,x:l.x,y:l.y,biome:l.biome,reward:0});return true;
    }
    _awardPoints(amount,source){
      if(amount<=0)return 0;this.state.player.skillPoints+=amount;this.state.stats.earnedPoints[source]=(this.state.stats.earnedPoints[source]||0)+amount;return amount;
    }
    _challengeReward(){
      const s=this.state;return s.stats.earnedPoints.challenge<Math.floor(s.player.stage/2)?this._awardPoints(1,'challenge'):0;
    }
    // An ancient fossil or an abandoned shell holds an echo: the earliest one not yet heard in this life that its water can hold.
    _echo(l){const s=this.state;if(!Array.isArray(s.echoes))s.echoes=[];const w=waterLevel(l.x,l.y),e=LEGEND.find(x=>x.water<=w&&!s.echoes.includes(x.id));if(!e)return;s.echoes.push(e.id);this._event('echo',{id:e.id,text:e.text});}
    _thread(kind){const s=this.state;if(!Array.isArray(s.echoes))s.echoes=[];const e=(THREADS[kind]||[]).find(x=>!s.echoes.includes(x.id));if(!e)return null;s.echoes.push(e.id);this._event('echo',{id:e.id,text:e.text,thread:kind});return e;}
    _claimLandmark(l){
      if(!l||l.claimed||this._claimed.has(l.id))return false;
      const s=this.state,p=s.player;this._discoverLandmark(l);l.claimed=true;l.progress=l.goal;this._claimed.add(l.id);s.claimedLandmarks.push(l.id);s.stats.encounters++;
      if(l.type==='fossil'||l.type==='shell'||l.type==='sealed'||l.type==='trail')this._echo(l);
      const reward=l.type==='nest'?this._challengeReward():0,scoreReward=120+reward*40,biomassReward=Math.round(this._divisionShare(l.type.startsWith('wonder')?.35:l.type==='fossil'||l.type==='sealed'||l.type==='trail'||l.type==='nursery'?.09:l.type==='geneCache'?.09:l.type==='nest'?.2:l.type==='carcass'||l.type==='garden'||l.type==='smoker'?.07:l.type==='vault'?.05:0)*gapWorth(waterLevel(l.x,l.y)-s.player.stage));s.score+=scoreReward;this._recordLandmark(l);
      const descriptions={bloom:'The bloom released a rich cloud of nutrients.',sanctuary:'A safe refuge. Its restorative field remains available.',geneCache:'Ancient nutrients add biomass to your colony.',nest:'The nest is clear. Its genetic rewards are yours.',current:'You learned to ride this current. It still flows through the pond.',carcass:'You fed on the fallen giant before the scavengers stripped it.',garden:'You grazed the heart of the garden through the toxin.',fossil:'',vault:'',smoker:'You fed on the minerals pouring from the smoker, between its vents.',shell:'A hiding place. Predators cannot see you inside it while you are not fighting.'};
      if(l.type==='vault'){const all=Object.keys(MUTATION_SOURCE).filter(k=>!(SPECIES[MUTATION_SOURCE[k]]&&SPECIES[MUTATION_SOURCE[k]].rarity==='legendary')),cap=clamp(1+Math.floor(waterLevel(l.x,l.y)/6),2,4),pool=all.filter(k=>(p.mutationTiers[k]??-1)<cap&&this._mutationOpen(k,cap)),key=pool.length?pool[Math.floor(this.random()*pool.length)]:'';descriptions.vault=key?'The vault opened and gave up '+TIERS[cap].toLowerCase()+' '+MUTATIONS[key].name.toLowerCase()+'.':'The vault opened, but it holds nothing better than you already carry.';if(key)this._findMutation(key,cap,'Glass vault');}
      descriptions.sealed='The shell opened.';descriptions.nursery='Nothing is left here but the ring.';if(l.type==='nursery')this._thread('nurseries');descriptions.trail='The garden has never been grazed.';descriptions.silent='The current carried you out of the known water.';
      if(l.type==='trail'){p.hp=p.maxHp;p.nutrition=p.maxNutrition;}
      if(l.type==='fossil'||l.type==='sealed'){const pool=Object.keys(MUTATION_SOURCE).filter(k=>(p.mutationTiers[k]??-1)<2&&this._mutationOpen(k,2)),key=pool.length?pool[Math.floor(this.random()*pool.length)]:'';descriptions[l.type]=key?'You drew '+MUTATIONS[key].name.toLowerCase()+' from the ancient genome.':'Its genome holds nothing you have not found.';if(key)this._findMutation(key,2,l.type==='sealed'?'Sealed shell':'Ancient fossil');}
      if(l.type.startsWith('wonder'))descriptions[l.type]=this._wonderReward(l);
      if(l.type==='bloom'){p.nutrition=p.maxNutrition;for(let i=0;i<24;i++){const a=this.range(0,TAU),r=this.range(15,l.r*.9);this._food(l.x+Math.cos(a)*r,l.y+Math.sin(a)*r,i%6===0?'mineral':'algae',1.5,l.home,l.biome);}}
      if(l.type==='nest')s.stats.nests++;if(l.type==='current')s.stats.currentsRidden++;
      this._effect(l.x,l.y,'discovery',l.r*1.7,'#d7f3aa',1.2);this._event('encounter',{id:l.id,landmarkType:l.type,name:l.name,reward,rewardSource:reward?'challenge':'',scoreReward,biomassReward,description:descriptions[l.type]});this._grantBiomass(biomassReward);
      if(['bloom','geneCache','nest','sanctuary','carcass','garden','fossil','shell','vault','smoker','sealed','trail','nursery'].includes(l.type)||l.type.startsWith('wonder'))this._requestCheckpoint(l,'location');return true;
    }
    // A toxic garden: rich algae at the centre, ringed by toxin pockets that pulse out of step, so gaps open in turn.
    // A glass vault is guarded. Its warden is an ancient of the vault's own water that stands on the vault; the vault will not open while it
    // lives. It is recorded like any fallen ancient (under 'vault:' and the vault's id), so it stays dead and so does the claim.
    _vaultKey(l){return 'vault:'+l.id;}
    _peerKeeps(meta){const c=this.coop;if(!c)return false;for(const q of c.peers.values()){const b=q.body;if(q.id<c.me&&b&&b.active&&Number.isFinite(b.x)){const R=b.lr||2;if(Math.abs(Math.floor(b.x/CHUNK)-meta.cx)<=R&&Math.abs(Math.floor(b.y/CHUNK)-meta.cy)<=R)return true;}}return false;}
    _wardenMine(l){const c=this.coop;if(!c)return true;const cx=Math.floor(l.x/CHUNK),cy=Math.floor(l.y/CHUNK);for(const q of c.peers.values()){const b=q.body;if(!b||!b.active||q.id>=c.me||!Number.isFinite(b.x))continue;const r=Number.isFinite(b.lr)?b.lr:2,bx=Math.floor(b.x/CHUNK),by=Math.floor(b.y/CHUNK);if(Math.abs(bx-cx)<=r&&Math.abs(by-cy)<=r)return false;}return true;}
    _wardenDown(l){return (this.state.stats.eldersFallen||[]).includes(this._vaultKey(l));}
    _wardenAlive(l){const key=this._vaultKey(l);return this.state.organisms.some(o=>!o.dead&&o.elderHome===key);}
    _spawnWarden(l,x,y){
      if(l.claimed||this._wardenDown(l)||this._wardenAlive(l))return null;
      const rng=localRng(seedHash(this.state.seed+'|warden|'+l.id)),o=this._organism('hunter',x,y,{home:l.home,biome:l.biome,scale:waterScale(l.x,l.y)*1.18,level:waterLevel(l.x,l.y),tier:this._tierAt(l.x,l.y),plain:true});
      this._makeElder(o,['The Glass Warden','Vaultkeeper','The Sentinel of Glass','Shardfather','The Still Guard'][Math.floor(rng()*5)]);o.elderName=o.elderName.split(',')[0]+', vault warden';o.elderHome=this._vaultKey(l);o.noDrop=true;o.anchorX=l.x;o.anchorY=l.y;return o;
    }
    _growSmoker(l){
      const rng=localRng(seedHash(this.state.seed+'|smoker|'+l.id));
      for(let i=0;i<4;i++){const a=l.angle+i*TAU/4,rr=l.r*(.58+rng()*.16);this.state.hazards.push({id:this._id++,x:l.x+Math.cos(a)*rr,y:l.y+Math.sin(a)*rr,r:42+rng()*12,kind:'vent',pulse:true,phase:i*TAU/4,biome:l.biome,home:l.home});}
      if(!l.claimed)for(let i=0;i<30;i++){const a=rng()*TAU,rr=Math.sqrt(rng())*l.r*.4;this._food(l.x+Math.cos(a)*rr,l.y+Math.sin(a)*rr,'mineral',1.6,l.home,l.biome);}
    }
    // A hidden garden: rich algae and nothing that hurts.
    _growHidden(l){const rng=localRng(seedHash(this.state.seed+'|hidden|'+l.id)),value=2*this._tierValue(this._tierAt(l.x,l.y));for(let i=0;i<36;i++){const a=rng()*TAU,rr=Math.sqrt(rng())*l.r*.7;this._food(l.x+Math.cos(a)*rr,l.y+Math.sin(a)*rr,i%5===0?'mineral':'algae',value,l.home,l.biome);}}
    _growGarden(l){
      const rng=localRng(seedHash(this.state.seed+'|garden|'+l.id)),value=2*this._tierValue(this._tierAt(l.x,l.y));
      for(let i=0;i<5;i++){const a=l.angle+i*TAU/5,rr=l.r*(.62+rng()*.18);this.state.hazards.push({id:this._id++,x:l.x+Math.cos(a)*rr,y:l.y+Math.sin(a)*rr,r:44+rng()*14,kind:'toxin',pulse:true,phase:i*TAU/5,biome:l.biome,home:l.home});}
      if(!l.claimed)for(let i=0;i<30;i++){const a=rng()*TAU,rr=Math.sqrt(rng())*l.r*.42;this._food(l.x+Math.cos(a)*rr,l.y+Math.sin(a)*rr,'algae',value,l.home,l.biome);}
    }
    // A fallen giant spills protein once, and the smell draws scavengers and a hunter in from the open water.
    _openCarcass(l){
      const s=this.state,p=s.player,tier=this._tierAt(l.x,l.y);l.active=true;
      for(let i=0;i<34;i++){const a=this.range(0,TAU),rr=Math.sqrt(this.random())*l.r*.8;this._food(l.x+Math.cos(a)*rr,l.y+Math.sin(a)*rr,'protein',undefined,l.home,l.biome);}
      for(const [kind,offset] of [['armoured',0],['armoured',2.2],['hunter',4.1]]){const a=Math.atan2(p.y-l.y,p.x-l.x)+Math.PI+offset,[ox,oy]=this._offscreen(l.x+Math.cos(a)*(kind==='hunter'?330:400),l.y+Math.sin(a)*(kind==='hunter'?330:400),220),o=this._organism(kind,ox,oy,{biome:l.biome,tier:tier});o.fedTime=0;o.pursuit=4;o.lastSeenX=l.x;o.lastSeenY=l.y;o.angle=Math.atan2(l.y-oy,l.x-ox);}
      this._recordLandmark(l);this._event('warning',{message:'The scent of the fallen giant is spreading. Something is coming to feed.',x:l.x,y:l.y});
    }
    _feedAtLandmark(f){
      // Counted where it was eaten, with your feeding reach added: a large colony draws food in from beyond the outline before eating it.
      const s=this.state,reach=s.player.feedRadius||0;for(const l of s.landmarks){if(l.claimed||!(l.type==='carcass'&&f.kind==='protein'||l.type==='garden'&&f.kind==='algae'||l.type==='smoker'&&f.kind==='mineral')||distance(f,l)>l.r+reach)continue;
        l.progress=Math.min(l.goal,l.progress+1/22);l.active=true;this._recordLandmark(l);if(l.progress>=l.goal-1e-9)this._claimLandmark(l);return;}
    }
    // A nest holds a family: slot 0 is the mother, slots 1 and 2 her young. Whoever is alive and not outside is inside the nest,
    // which simply means it does not exist in the water until it squeezes out. DEN_TIME is how long a squeeze takes.
    _nestOut(l){return this.state.organisms.filter(o=>o.nestId===l.id&&!o.dead);}
    _nestInside(l){const record=this.state.landmarkRecords[l.id]||{defeated:[]},defeated=record.defeated||[],out=this._nestOut(l),slots=[];for(let slot=0;slot<l.goal;slot++)if(!defeated.includes(slot)&&!out.some(o=>o.nestSlot===slot))slots.push(slot);return slots;}
    _nestEmerge(l,slot){
      this._recordLandmark(l);// the nest must have a record before anyone can leave it, or a death outside would not be remembered
      const s=this.state,p=s.player,mother=slot===0,toward=Math.atan2(p.y-l.y,p.x-l.x),a=toward+(mother?0:slot===1?-.75:.75)+this.range(-.25,.25),scale=waterScale(l.x,l.y)*(mother?1.3:.58);
      const o=this._organism(mother&&l.variant>1?'armoured':'hunter',l.x,l.y,{home:l.home,biome:l.biome,scale});o.nestId=l.id;o.nestSlot=slot;o.elite='';o.stamina=Math.min(o.stamina,this._profile(o).capacity);
      if(mother){o.mother=true;o.maxHp*=1.25;o.hp=o.maxHp;}else{o.speed*=1.15;}
      // Squeezing out: it starts at the nest's mouth, thin and stretched, and takes DEN_TIME to pull itself free.
      o.denT=DEN_TIME;o.denX=l.x+Math.cos(a)*(l.r*.55+o.r);o.denY=l.y+Math.sin(a)*(l.r*.55+o.r);o.angle=a;o.vx=o.vy=0;o.anchorX=l.x;o.anchorY=l.y;
      this._event('nestSqueeze',{x:l.x,y:l.y,out:true,mother});return o;
    }
    // In co-op one device keeps a nest's family: the lowest-numbered player near the nest. Everyone else sees that family.
    _nestMine(l){const c=this.coop;if(!c)return true;for(const q of c.peers.values()){const b=q.body;if(b&&b.active&&q.id<c.me&&Number.isFinite(b.x)&&length(b.x-l.x,b.y-l.y)<2600)return false;}return true;}
    // Keeps the family honest: nobody alive twice, nobody alive who has been defeated.
    // How close the nearest player is (in co-op the nest's keeper answers for everyone).
    _nestNear(l,mine){const c=this.coop;let best=mine;if(c)for(const q of c.peers.values()){const b=q.body;if(b&&b.active&&!(b.down>0)&&Number.isFinite(b.x))best=Math.min(best,length(b.x-l.x,b.y-l.y));}return best;}
    _nestTidy(l){const record=this.state.landmarkRecords[l.id],defeated=record&&record.defeated||[],seen=new Set(),family=this.state.organisms.filter(o=>o.nestId===l.id&&!o.dead),theirs=new Set(family.filter(o=>o.puppet).map(o=>o.nestSlot)),keeper=this._nestMine(l);
      // Where another player keeps this nest and already shows me a member, my own copy of that member steps aside.
      for(const o of family){if(!o.puppet&&(defeated.includes(o.nestSlot)||seen.has(o.nestSlot)||(!keeper&&theirs.has(o.nestSlot)))){o.dead=true;continue;}if(!o.puppet||!seen.has(o.nestSlot))seen.add(o.nestSlot);}}
    _activateNest(l){
      const s=this.state,p=s.player,clocks=this._nestClock||(this._nestClock=new Map());this._recordLandmark(l);this._nestTidy(l);const inside=this._nestInside(l);l.active=true;if(s.bossEncounter||!this._nestMine(l)){l.guardianIds=this._nestOut(l).map(o=>o.id);return;}
      // One at a time: the young first, then the mother.
      if(inside.length&&!(clocks.get('out:'+l.id)>s.time)&&!this._nestOut(l).some(o=>o.denT)){const slot=inside.includes(1)?1:inside.includes(2)?2:inside[0];this._nestEmerge(l,slot);clocks.set('out:'+l.id,s.time+(slot===0?1.6:1.15));}
      l.guardianIds=this.state.organisms.filter(o=>o.nestId===l.id&&!o.dead).map(o=>o.id);
      this._recordLandmark(l);
    }
    // A hazard never sits on a place you have to reach: it is pushed out past the place's edge (the same on every device, from the seed).
    _clearOfPlaces(x,y,r){const qx=Math.floor(x/CHUNK),qy=Math.floor(y/CHUNK);for(let pass=0;pass<2;pass++)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const m=this._landmarkFor(qx+dx,qy+dy);if(!m)continue;const need=(m.r||100)+r+70,ddx=x-m.x,ddy=y-m.y,d=length(ddx,ddy);if(d<need){const a=d>1?Math.atan2(ddy,ddx):(m.angle||0);x=m.x+Math.cos(a)*need;y=m.y+Math.sin(a)*need;}}return [x,y];}
    _nestKill(o){
      if(!o.nestId)return;const s=this.state,record=s.landmarkRecords[o.nestId];
      // The nest may have streamed out while its guardian fought on; keep the cached copy in step with the record (it claims on return).
      let l=s.landmarks.find(x=>x.id===o.nestId);if(!l){const cached=Object.values(this._chunkCache).flatMap(c=>c.landmarks).find(x=>x.id===o.nestId);if(record&&!record.claimed){if(!record.defeated.includes(o.nestSlot))record.defeated.push(o.nestSlot);record.progress=Math.min(3,record.defeated.length);if(cached)cached.progress=Math.min(cached.goal,record.progress);}return;}if(!record||record.claimed)return;
      if(!record.defeated.includes(o.nestSlot))record.defeated.push(o.nestSlot);record.progress=record.defeated.length;
      if(l){l.progress=record.progress;this._recordLandmark(l);if(l.progress>=l.goal)this._claimLandmark(l);}
    }
    // Each wonder's challenge. Guardians work like a vault's warden (one keeper device in co-op); the rest are your own trial.
    _wonderKey(l){return 'wonder:'+l.id;}
    _wonderTick(l,d,dt){
      const s=this.state,p=s.player,w=WONDER_BY_TYPE[l.type];if(!w)return;
      if(w.challenge==='guardian'){
        const key=this._wonderKey(l),down=(s.stats.eldersFallen||[]).includes(key),alive=s.organisms.some(o=>!o.dead&&o.elderHome===key);
        if(this.coop){const ws=s.organisms.filter(o=>!o.dead&&o.elderHome===key);if(ws.length>1){const keep=ws.reduce((a,b)=>a.id<b.id?a:b);s.organisms=s.organisms.filter(o=>o===keep||o.puppet||o.dead||o.elderHome!==key);}}
        if(d<l.r+1200&&!down&&!alive&&this._wardenMine(l)){const [gx,gy]=this._offscreen(l.x,l.y,260),opt={home:l.home,biome:l.biome,scale:waterScale(l.x,l.y)*1.25,level:waterLevel(l.x,l.y),tier:this._tierAt(l.x,l.y)};
          const o=w.species&&SPECIES[w.species]?this._spawnSpecies(w.species,gx,gy,opt):this._organism(w.kind||'hunter',gx,gy,{...opt,plain:true});
          if(o){this._makeElder(o,w.guardian);o.elderName=w.guardian+', keeper of '+LANDMARKS[l.type].name.replace(/^The /,'the ');o.elderHome=key;o.noDrop=true;o.maxHp*=1.5;o.hp=o.maxHp;o.anchorX=l.x;o.anchorY=l.y;}}
        if(down&&d<l.r*.5){l.active=true;l.progress=Math.min(l.goal,l.progress+dt);if(l.progress>=l.goal)this._claimLandmark(l);}
      }else if(w.challenge==='lanterns'){
        // Touch a lantern to light it; each stays lit for 30 seconds. All six at once opens the reef.
        const lit=this._lit||(this._lit=new Map()),times=lit.get(l.id)||[0,0,0,0,0,0];let on=0,mask=0;
        for(let i=0;i<6;i++){const a=l.angle+i*TAU/6,lx=l.x+Math.cos(a)*l.r*.8,ly=l.y+Math.sin(a)*l.r*.8;if(Math.hypot(p.x-lx,p.y-ly)<p.r+34&&times[i]<s.time+29){if(times[i]<=s.time)this._effect(lx,ly,'burst',80,'#f6e8a6',.6);times[i]=s.time+30;}if(times[i]>s.time){on++;mask|=1<<i;}}
        lit.set(l.id,times);l.lit=mask;l.active=on>0;l.progress=on;if(on>=6)this._claimLandmark(l);
      }else if(w.challenge==='stealth'){
        // Inside, hidden time counts; being seen (by the pool's lights or by revealing yourself) drains it.
        const t=s.time;l.lights=[[.23,.17,0,1.3],[.13,.29,2.1,.4],[.31,.11,4.2,2.8]].map(([fa,fb,pa,pb])=>[l.x+Math.cos(t*fa+pa)*l.r*.72,l.y+Math.sin(t*fb+pb)*l.r*.72]);
        if(d<l.r){l.active=true;for(const [lx,ly] of l.lights)if(Math.hypot(p.x-lx,p.y-ly)<90+p.r*.5&&p.stealth>0){this._breakStealth(1.2);this._effect(lx,ly,'burst',90,'#f4f0c0',.5);}
          if(p.stealth>.65)l.progress=Math.min(l.goal,l.progress+dt);else l.progress=Math.max(0,l.progress-dt);if(l.progress>=l.goal)this._claimLandmark(l);}
        else l.progress=Math.max(0,l.progress-dt*2);
      }else if(w.challenge==='current'){
        // A whirlpool: it carries you round and flings you outward, harder the nearer the eye. Hold the eye for three seconds.
        if(d<l.r){l.active=true;const ux=(p.x-l.x)/(d||1),uy=(p.y-l.y)/(d||1),near=1-d/l.r,out=(70+190*near)*dt,round=(120+120*near)*dt;p.x+=ux*out-uy*round;p.y+=uy*out+ux*round;
          if(d<l.r*.16)l.progress=Math.min(l.goal,l.progress+dt);else l.progress=Math.max(0,l.progress-dt*.6);if(l.progress>=l.goal)this._claimLandmark(l);}
        else l.progress=Math.max(0,l.progress-dt);
      }else if(w.challenge==='gaze'){
        // The eye sweeps three beams round itself, faster as you hold out. Stay within its reach until it closes.
        const speed=.45+.035*l.progress;l.beam=((l.beam||0)+speed*dt)%TAU;
        if(d<l.r){l.active=true;l.progress=Math.min(l.goal,l.progress+dt);const a=Math.atan2(p.y-l.y,p.x-l.x);
          for(let i=0;i<3;i++){const b=l.beam+i*TAU/3,off=Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));if(off*d<p.r+30&&p.invulnerable<=0&&!(s.time<(l.gazeSafe||0))){l.gazeSafe=s.time+1;this._damagePlayer(p.maxHp*.16,{x:l.x,y:l.y,kind:'vent'});p.vx+=Math.cos(a)*300;p.vy+=Math.sin(a)*300;break;}}
          if(l.progress>=l.goal)this._claimLandmark(l);}
        else{l.active=false;l.progress=0;}
      }
    }
    _wonderReward(l){
      const s=this.state,p=s.player,w=WONDER_BY_TYPE[l.type];let key=w.reward&&MUTATIONS[w.reward]&&(p.mutationTiers[w.reward]??-1)<4?w.reward:'';
      if(!key){const pool=Object.keys(MUTATION_SOURCE).filter(k=>MUTATIONS[k]&&(p.mutationTiers[k]??-1)<4&&this._mutationOpen(k,4));key=pool.length?pool[Math.floor(this.random()*pool.length)]:'';}
      if(key)this._findMutation(key,4,LANDMARKS[l.type].name);const pts=this._awardPoints(w.points||1,'wonder');if(WONDER_LINES[l.type])this._event('wonderLine',{wonder:l.type,text:WONDER_LINES[l.type]});
      return (key?'It gave up legendary '+MUTATIONS[key].name.toLowerCase():'It had nothing better than you carry')+' · +'+pts+' stat '+(pts===1?'point':'points')+'.';
    }
    // Hermit tasks. A hermit offers one task on something within a few regions of its sanctuary; you accept it or not.
    // You carry up to MAX_TASKS, one per hermit. When the objective is done you return to that hermit to claim the reward.
    _compass(dx,dy){return ['east','south-east','south','south-west','west','north-west','north','north-east'][((Math.round(Math.atan2(dy,dx)/(Math.PI/4))%8)+8)%8];}
    _makeTask(l){
      const s=this.state,p=s.player,hermit=MorphosGame.hermitOf(l.id),n=(s.stats.tasksTaken||0)+(s.stats.bountiesDropped||0),cx=Math.floor(l.x/CHUNK),cy=Math.floor(l.y/CHUNK),rng=localRng(seedHash(s.seed+'|bounty|'+l.id+'|'+n));
      // Reachable: between about one and four thousand units from the hermit, in water no deeper than one level above the colony.
      const helped=this.hermitHelped(l.id),band=[[900,2200],[1500,3000],[2200,3800]][Math.min(2,helped)];
      const maxZone=p.stage+1,ok=(x,y)=>waterLevel(x,y)<=maxZone&&length(x,y)>NURSERY_RADIUS+250,inRange=(x,y)=>{const d=length(x-l.x,y-l.y);return d>=band[0]&&d<=band[1];};
      const claimed=id=>this._spentTarget(id),taken=new Set((s.tasks||[]).map(x=>x.target));if(this._lastDropped)taken.add(this._lastDropped);const nests=[],places=[];
      for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){if(!dx&&!dy)continue;const m=this._landmarkFor(cx+dx,cy+dy);if(!m||claimed(m.id)||taken.has(m.id)||!inRange(m.x,m.y)||!ok(m.x,m.y))continue;if(m.type==='nest')nests.push(m);else if(BOUNTY_PLACES.includes(m.type))places.push(m);}
      const near=list=>list.sort((a,b2)=>length(a.x-l.x,a.y-l.y)-length(b2.x-l.x,b2.y-l.y))[Math.floor(rng()*Math.min(3,list.length))];
      const clear=(x,y)=>{const qx=Math.floor(x/CHUNK),qy=Math.floor(y/CHUNK);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const m=this._landmarkFor(qx+dx,qy+dy);if(m&&length(m.x-x,m.y-y)<(m.r||100)+200)return false;}return true;};
      const out=Math.atan2(l.y,l.x),spread=[TAU,Math.PI*1.4,Math.PI*.9][Math.min(2,helped)];
      const spot=()=>{for(let i=0;i<60;i++){const wide=i>=40,a=wide?rng()*TAU:out+(rng()-.5)*spread,d=wide?1300+rng()*2200:Math.max(1300,band[0])+rng()*(band[1]-Math.max(1300,band[0])),x=l.x+Math.cos(a)*d,y=l.y+Math.sin(a)*d;if(ok(x,y)&&clear(x,y))return [x,y];}return null;};
      const kinds=[['hunt',3],['rescue',2],['fetch',2]];if(nests.length)kinds.push(['nest',2]);if(places.length)kinds.push(['place',1]);
      let roll=rng()*kinds.reduce((a,k)=>a+k[1],0),kind='hunt';for(const [k,w] of kinds){if(roll<w){kind=k;break;}roll-=w;}
      const kin=KIN[Math.floor(rng()*KIN.length)],first=String(hermit).split(' ')[0];let b=null,words={kin:kin[0],pro:kin[1]};
      if(kind==='nest'){const m=near(nests);b={kind,target:m.id,x:m.x,y:m.y,title:'Clear the '+this._compass(m.x-l.x,m.y-l.y)+' nest'};}
      else if(kind==='place'){const m=near(places),word=PLACE_WORDS[m.type]||m.name.toLowerCase();b={kind,target:m.id,x:m.x,y:m.y,title:(m.type==='vault'?'Open the ':m.type==='carcass'||m.type==='garden'||m.type==='smoker'?'Feed at the ':'Rest in the ')+word,ptype:m.type};words.place=word;}
      else{const at=spot();if(!at)return null;const [x,y]=at;
        if(kind==='hunt'){const prey=BOUNTY_PREY[Math.floor(rng()*BOUNTY_PREY.length)];const fallen=s.stats.eldersFallen||[];let id='bounty:'+l.id+':t'+n;for(let j=1;fallen.includes(id);j++)id='bounty:'+l.id+':t'+n+'.'+j;b={kind,target:id,x,y,title:'Hunt '+prey,prey};words.prey=prey;words.Prey=prey.charAt(0).toUpperCase()+prey.slice(1);}
        else if(kind==='rescue'){b={kind,target:'rescue:'+l.id+':'+n,x,y,fx:x,fy:y,found:false,kin:kin[0],pro:kin[1],title:'Find '+first+'’s '+kin[0]};}
        else{const relic=RELICS[Math.floor(rng()*RELICS.length)];b={kind,target:'fetch:'+l.id+':'+n,x,y,carried:false,relic,title:'Recover the '+relic};words.relic=relic;}}
      words.dir=this._compass(b.x-l.x,b.y-l.y);const tales=TASK_STORIES[kind];b.story=tales[Math.floor(rng()*tales.length)](words);
      b.zone=waterLevel(b.x,b.y);b.hermit=hermit;b.from=l.id;b.hx=l.x;b.hy=l.y;b.hermitAt=true;b.done=false;b.final=helped>=HERMIT_TASKS-1;b.reward=TIERS[MorphosGame.taskTier(b)];return b;
    }
    // A nest that has lost any of its family, or a place already claimed, can't be a fresh task.
    _spentTarget(id){const r=this.state.landmarkRecords[id];return this._claimed.has(id)||!!(r&&(r.claimed||(r.defeated||[]).length));}
    _offerFor(l){const s=this.state,key=l.id+'|'+(s.stats.tasksTaken||0)+'|'+(s.stats.bountiesDropped||0)+'|'+(s.tasks||[]).length,t=this._offer&&this._offer.task;
      const stale=t&&((t.kind==='nest'||t.kind==='place')&&this._spentTarget(t.target)||t.kind==='hunt'&&(s.stats.eldersFallen||[]).includes(t.target));
      if(!this._offer||this._offer.key!==key||stale)this._offer={key,task:this._makeTask(l)};return this._offer.task;}
    _nearestHermit(x,y){const cx=Math.floor(x/CHUNK),cy=Math.floor(y/CHUNK),used=new Set((this.state.tasks||[]).map(t=>t.from));let best=null,bd=1e18;
      for(let dx=-8;dx<=8;dx++)for(let dy=-8;dy<=8;dy++){const m=this._landmarkFor(cx+dx,cy+dy);if(!m||m.type!=='sanctuary'||!MorphosGame.hermitOf(m.id))continue;const d=length(m.x-x,m.y-y)+(used.has(m.id)?1e7:0);if(d<bd){bd=d;best=m;}}return best;}
    hermitHelped(id){const h=this.state.stats.helped;return h&&Number.isInteger(h[id])?h[id]:0;}
    _hermitSanctuary(){const s=this.state,p=s.player,l=s.landmarks.find(x=>x.type==='sanctuary'&&distance(x,p)<x.r);return l&&MorphosGame.hermitOf(l.id)?l:null;}
    taskProgress(t){
      if(t.kind==='rescue')return t.done?1:t.found?.5:0;if(t.kind==='fetch')return t.done?1:0;
      if(t.done)return 1;if(t.kind==='hunt')return 0;const r=this.state.landmarkRecords[t.target],def=null;
      if(t.kind==='nest')return r?Math.min(1,(r.defeated||[]).length/3):0;const l=this.state.landmarks.find(x=>x.id===t.target);return l?clamp(l.progress/Math.max(.01,l.goal),0,1):r?clamp(r.progress/3,0,1):0;
    }
    hermitHere(){const h=this._hermitHere();if(h)h.memory=HERMIT_MEMORIES[seedHash(this.state.seed+'|memory|'+h.id)%HERMIT_MEMORIES.length];return h;}
    _hermitHere(){
      const l=this._hermitSanctuary();if(!l)return null;const s=this.state,p=s.player,name=MorphosGame.hermitOf(l.id),mine=(s.tasks||[]).find(x=>x.from===l.id);
      if(mine)return{name,id:l.id,state:mine.done?'ready':'active',task:mine,helped:this.hermitHelped(l.id)};
      if(this.hermitHelped(l.id)>=HERMIT_TASKS)return{name,id:l.id,state:'spent'};if(p.stage<2)return{name,id:l.id,state:'young'};if((s.tasks||[]).length>=MAX_TASKS)return{name,id:l.id,state:'full'};
      const offer=this._offerFor(l);return{name,id:l.id,state:offer?'offer':'none',task:offer,helped:this.hermitHelped(l.id)};
    }
    trackTask(target){const s=this.state;if((s.tasks||[]).some(x=>x.target===target)){s.trackedTask=target;return true;}return false;}
    trackedTask(){const s=this.state,list=s.tasks||[];return list.find(x=>x.target===s.trackedTask)||list[0]||null;}
    acceptTask(){const l=this._hermitSanctuary(),s=this.state;if(!l||(s.tasks||[]).length>=MAX_TASKS||s.tasks.some(x=>x.from===l.id)||this.hermitHelped(l.id)>=HERMIT_TASKS)return false;const task=this._offerFor(l);if(!task)return false;s.tasks.push({...task});s.trackedTask=task.target;s.stats.tasksTaken=(s.stats.tasksTaken||0)+1;this._offer=null;this._event('taskAccepted',{title:task.title,hermit:task.hermit});return true;}
    dropTask(target){const s=this.state,i=(s.tasks||[]).findIndex(x=>x.target===target);if(i<0)return false;s.tasks.splice(i,1)[0];this._lastDropped=target;s.stats.bountiesDropped=(s.stats.bountiesDropped||0)+1;this._offer=null;return true;}
    claimTask(){this._lastThanks='';this.lastReward=null;
      const l=this._hermitSanctuary(),s=this.state,p=s.player;if(!l)return false;const i=s.tasks.findIndex(x=>x.from===l.id&&x.done);if(i<0)return false;const b=s.tasks.splice(i,1)[0];s.stats.bounties=(s.stats.bounties||0)+1;this._lastThanks=(TASK_THANKS[b.kind]||'Thank you.').replace(/them/g,b.pro||'them');this._offer=null;
      {const h=s.stats.helped||(s.stats.helped={});h[l.id]=Math.min(HERMIT_TASKS,(h[l.id]||0)+1);}
      const cap=MorphosGame.taskTier(b),pool=Object.keys(MUTATION_SOURCE).filter(k=>MUTATIONS[k]&&(p.mutationTiers[k]??-1)<cap&&this._mutationOpen(k,cap)),key=pool.length?pool[Math.floor(this.random()*pool.length)]:'';
      const had=key?p.mutationTiers[key]:undefined;if(key)this._findMutation(key,cap,b.hermit);this._grantBiomass(Math.round(this._divisionShare(.15)*gapWorth((b.zone||0)-p.stage)));s.score+=200;
      {const last=this.hermitHelped(l.id)>=HERMIT_TASKS,fate=last?this._thread('fate'):null;this.lastReward={key,tier:cap,upgrade:had!==undefined,last,fate:fate?fate.text:'',hermit:b.hermit};}
      this._event('bountyDone',{hermit:b.hermit,title:b.title,reward:key?TIERS[cap]+' '+MUTATIONS[key].name.toLowerCase():''});return true;
    }
    _bountyTick(){
      const s=this.state,p=s.player;
      for(const b of s.tasks||[]){
        // Where the hermit lives comes from its sanctuary, not the save (a task converted from an older bounty had no hermit position).
        if(!b.hermitAt){const m=/^lm:(-?\d+),(-?\d+)$/.exec(b.from||''),l=m&&this._landmarkFor(+m[1],+m[2]);if(l&&l.type==='sanctuary'&&MorphosGame.hermitOf(l.id)){b.hx=l.x;b.hy=l.y;}else{const h=this._nearestHermit(m?(+m[1]+.5)*CHUNK:b.x,m?(+m[2]+.5)*CHUNK:b.y);if(h){b.from=h.id;b.hermit=MorphosGame.hermitOf(h.id);b.hx=h.x;b.hy=h.y;}}b.hermitAt=true;}
        if(b.done)continue;let done=false;
        if(b.kind==='hunt'){done=(s.stats.eldersFallen||[]).includes(b.target);{const m=s.organisms.find(o=>!o.dead&&o.elderHome===b.target);if(m){b.ax=m.x;b.ay=m.y;}else{delete b.ax;delete b.ay;}}
          if(!done){
            // Two friends on the same hunt each make the marked ancient; the one with the lowest number stays and the other device removes its own.
            if(this.coop){const ws=s.organisms.filter(o=>!o.dead&&o.elderHome===b.target);if(ws.length>1){const keep=ws.reduce((x,y)=>x.id<y.id?x:y);s.organisms=s.organisms.filter(o=>o===keep||o.puppet||o.dead||o.elderHome!==b.target);}}
            if(length(p.x-b.x,p.y-b.y)<1300&&!s.organisms.some(o=>!o.dead&&o.elderHome===b.target)){const [gx,gy]=this._offscreen(b.x,b.y,220),opt={home:this._home(b.x,b.y),biome:this._biomeAt(b.x,b.y),scale:waterScale(b.x,b.y)*1.15,level:waterLevel(b.x,b.y),tier:this._tierAt(b.x,b.y)};
              const able=['puffer','murk','splitter','ripjaw','sporemother','lurker'].filter(k=>SPECIES[k]&&SPECIES[k].minStage*3<=waterLevel(b.x,b.y)),sp=able.length?able[Math.floor(this.random()*able.length)]:'',o=sp?this._spawnSpecies(sp,gx,gy,opt):this._organism('hunter',gx,gy,{...opt,plain:true});
              if(o){this._makeElder(o,b.prey||'The marked one');o.elderName=(b.prey||'The marked one')+', marked by '+b.hermit;o.elderHome=b.target;o.noDrop=true;o.anchorX=b.x;o.anchorY=b.y;}}}}
        else if(b.kind==='rescue'){
          if(!b.found){if(length(p.x-b.fx,p.y-b.fy)<p.r+110){b.found=true;this._event('taskFound',{title:b.title,x:b.fx,y:b.fy});}}
          else{const dx=p.x-b.fx,dy=p.y-b.fy,d=length(dx,dy)||1,gap=p.r+46;if(d>1400){b.fx=p.x-dx/d*gap*2;b.fy=p.y-dy/d*gap*2;}else if(d>gap){const step=Math.min(d-gap,Math.max(170,(p.sprintSpeed||p.speed*1.6)*1.05)*(1/60));b.fx+=dx/d*step;b.fy+=dy/d*step;}if(length(b.fx-b.hx,b.fy-b.hy)<150)done=true;}}
        else if(b.kind==='fetch'){if(!b.carried&&length(p.x-b.x,p.y-b.y)<p.r+70){b.carried=true;this._event('taskFound',{title:b.title,x:b.x,y:b.y});}done=!!b.carried;}
        else{const r=s.landmarkRecords[b.target],l=s.landmarks.find(x=>x.id===b.target);done=this._claimed.has(b.target)||!!(r&&r.claimed)||!!(l&&l.claimed)||(b.kind==='nest'&&!!r&&(r.defeated||[]).length>=3);}
        if(done){b.done=true;this._event('taskReady',{title:b.title,hermit:b.hermit});}}
      if(s.trackedTask&&!(s.tasks||[]).some(x=>x.target===s.trackedTask))s.trackedTask='';
    }
    _requestCheckpoint(l,policy){
      const s=this.state;if(s.status!=='playing'||!s.player.alive||s.bossEncounter)return;
      // Capture the earned state now: later events in this step must not turn an
      // arrival checkpoint into a running boss fight, or discard it after death.
      this._event('checkpointRequested',{id:l.id,name:l.name,policy,save:this.exportSave()});
    }
    _landmarks(dt){
      const s=this.state,p=s.player;p.shelterTime=Math.max(0,(p.shelterTime||0)-dt);this._bountyTick();
      s.sanctumArrivalId='';
      const refuge=s.landmarks.find(l=>l.type==='sanctuary'&&distance(l,p)<l.r);
      if(!refuge)s.sanctuaryRest=null;else if(s.sanctuaryRest?.id!==refuge.id)s.sanctuaryRest={id:refuge.id,progress:0,completed:false,reason:'moving'};
      for(const l of s.landmarks){
        const d=distance(l,p);if(d<l.r+p.landmarkSense)this._discoverLandmark(l);
        if(l.type==='nest'&&!l.claimed&&this._nestNear(l,d)<l.r+200){this._activateNest(l);if(l.progress>=l.goal)this._claimLandmark(l);}
        else if(l.type==='nest'&&!l.claimed&&d<2600&&(this._nestTidy(l),this._nestMine(l))){
          const clocks=this._nestClock||(this._nestClock=new Map()),out=this._nestOut(l),busy=out.some(o=>o.denT||o.chasing||o.windup>0||o.lungeTime>0||o.pursuit>0);
          if(!busy&&!(clocks.get(l.id)>s.time)){
            const home=out.filter(o=>distance(o,l)<l.r+260*(o.scale||1)).sort((a,b)=>(b.nestSlot===0)-(a.nestSlot===0));
            if(home.length&&(d>l.r+520||out.length>1)){const o=home[0];o.denT=-DEN_TIME;o.denX=o.x;o.denY=o.y;o.angle=Math.atan2(l.y-o.y,l.x-o.x);clocks.set(l.id,s.time+1.3);this._event('nestSqueeze',{x:l.x,y:l.y,out:false,mother:!!o.mother});}
            else if(!out.length&&d>l.r+420&&!s.bossEncounter){const young=this._nestInside(l).filter(slot=>slot>0);if(young.length&&this.random()<.5)this._nestEmerge(l,young[Math.floor(this.random()*young.length)]);clocks.set(l.id,s.time+this.range(5,11));}
          }
        }
        if(l.type==='sanctuary'&&d<l.r){l.active=true;const safe=p.refugeCombatTime===0&&p.regenDelay===0&&!sanctuaryThreat(s);if(safe){p.hp=Math.min(p.maxHp,p.hp+dt*p.maxHp*(.03+.01*l.variant));p.nutrition=Math.min(p.maxNutrition,p.nutrition+dt*8);}p.energy=Math.min(p.maxEnergy,p.energy+dt*6);this._recoverEnergy();if(!l.claimed){l.progress=Math.min(l.goal,l.progress+dt);if(l.progress>=l.goal)this._claimLandmark(l);}this._restAtSanctuary(l,dt);}
        if(l.type==='current'&&d<l.r){l.active=true;p.x+=l.flowX*dt*(55+l.variant*12);p.y+=l.flowY*dt*(55+l.variant*12);if(!l.claimed&&length(p.vx,p.vy)>75){l.progress=Math.min(l.goal,l.progress+dt);if(l.progress>=l.goal)this._claimLandmark(l);}}
        if(l.type==='geneCache'&&!l.claimed&&d<l.r*.72){l.active=true;l.progress=Math.min(l.goal,l.progress+dt);if(l.progress>=l.goal)this._claimLandmark(l);}
        // Ancient fossil: rest in it to extract an ancient mutation.
        if(l.type==='fossil'&&!l.claimed&&d<l.r*.6){l.active=true;l.progress=Math.min(l.goal,l.progress+dt);if(l.progress>=l.goal)this._claimLandmark(l);}
        // Glass vault: once its warden has fallen, wait at its centre and it opens, giving up a mutation as good as its water can drop.
        if(l.type==='vault'&&!l.claimed){
          // A vault that has somehow lost sight of its warden (water put away and brought back) gets it back, arriving from off screen.
          // In co-op two devices can each make the warden when both reach the vault together. The one with the lowest id stays; a device removes its own extra.
          if(this.coop){const key=this._vaultKey(l),ws=s.organisms.filter(o=>!o.dead&&o.elderHome===key);if(ws.length>1){const keep=ws.reduce((a,b)=>a.id<b.id?a:b);s.organisms=s.organisms.filter(o=>o===keep||o.puppet||o.dead||o.elderHome!==key);}}
          if(d<l.r+1200&&!this._wardenDown(l)&&!this._wardenAlive(l)&&this._wardenMine(l)){const [wx,wy]=this._offscreen(l.x,l.y,260);this._spawnWarden(l,wx,wy);}
          if(d<l.r*.6&&this._wardenDown(l)){l.active=true;l.progress=Math.min(l.goal,l.progress+dt);if(l.progress>=l.goal)this._claimLandmark(l);}}
        if(l.type.startsWith('wonder')&&!l.claimed)this._wonderTick(l,d,dt);
        // Abandoned shell: inside and not fighting, predators cannot see you.
        if(l.type==='shell'&&d<l.r*.72){l.active=true;p.shelterTime=.25;if(!l.claimed){l.progress=Math.min(l.goal,l.progress+dt);if(l.progress>=l.goal)this._claimLandmark(l);}}
        // Sealed shell: it opens only for a colony that stays still inside it for five seconds. Any movement starts it again.
        if(l.type==='sealed'&&!l.claimed){if(d<l.r*.5){l.active=true;l.progress=length(p.vx,p.vy)<14?Math.min(l.goal,l.progress+dt):0;if(l.progress>=l.goal)this._claimLandmark(l);}else if(l.progress){l.progress=0;l.active=false;}}
        // Empty nursery: rest at its heart for three seconds.
        if(l.type==='nursery'&&!l.claimed&&d<l.r*.4){l.active=true;l.progress=Math.min(l.goal,l.progress+dt);if(l.progress>=l.goal)this._claimLandmark(l);}
        if(l.type==='trail'&&!l.claimed&&d<l.r*.45){l.active=true;l.progress=l.goal;this._claimLandmark(l);}
        // Silent current: it takes you 2,800 along its flow in 3.5 s. The first time, something rare waits where it lets you go.
        if(l.type==='silent'&&d<l.r*.55&&!((p.surgeTime||0)>0)&&!s.bossEncounter&&p.alive){const [ex,ey]=this._silentEnd(l),dx=ex-p.x,dy=ey-p.y,dd=Math.hypot(dx,dy)||1;p.surgeDX=dx/dd;p.surgeDY=dy/dd;p.surgeSpeed=dd/3.5;p.surgeTime=3.5;p.surgeCtx=null;p.invulnerable=Math.max(p.invulnerable,3.6);
          if(!l.claimed){this._pocket={x:ex,y:ey,id:l.id};this._claimLandmark(l);}this._event('silentRide',{x:l.x,y:l.y});}
        if(l.type==='bloom'&&!l.claimed&&d<l.r*.7){l.active=true;l.progress=l.goal;this._claimLandmark(l);}
        if(l.type==='carcass'&&!l.claimed&&!l.active&&d<l.r+Math.max(...(this._view||[1100,700]))+220)this._openCarcass(l);
        // A fallen giant or garden that has run out (scavengers eat too) spills more while you are there, so the bar can always be filled.
        if((l.type==='carcass'&&l.active||l.type==='garden'||l.type==='smoker')&&!l.claimed&&d<l.r+240){const kind=l.type==='carcass'?'protein':l.type==='smoker'?'mineral':'algae',left=s.foods.reduce((n,f)=>n+(f.kind===kind&&distance(f,l)<l.r*1.4?1:0),0),refill=this._refill||(this._refill=new Map());
          if(left<3&&!(refill.get(l.id)>s.time)){refill.set(l.id,s.time+4);for(let i=0;i<12;i++){const a=this.range(0,TAU),rr=Math.sqrt(this.random())*l.r*(kind==='protein'?.8:.42);this._food(l.x+Math.cos(a)*rr,l.y+Math.sin(a)*rr,kind,kind==='algae'?2*this._tierValue(this._tierAt(l.x,l.y)):kind==='mineral'?1.6:undefined,l.home,l.biome);}}}
        if(l.discovered)this._recordLandmark(l);if(s.pendingEvolution)return;
      }
    }
    _restAtSanctuary(l,dt){
      const s=this.state,p=s.player,r=s.sanctuaryRest;if(!r||r.id!==l.id||r.completed)return;r.reason=sanctuaryReason(s);
      if(r.reason!=='resting'){r.progress=0;return;}r.progress=Math.min(SANCTUARY_REST_SECONDS,r.progress+dt);
      if(r.progress>=SANCTUARY_REST_SECONDS-1e-8){r.progress=SANCTUARY_REST_SECONDS;r.completed=true;r.reason='complete';p.hp=p.maxHp;p.energy=p.maxEnergy;p.nutrition=p.maxNutrition;p.exhausted=false;p.recoveryProgress=1;this._event('sanctuaryRested',{id:l.id,name:l.name});}
    }
    // ---- Apex bosses ----
    // One at a time. A boss wakes when you reach its level and comes looking for you. It never gives up: it tracks
    // you off screen, closes long gaps fast, ignores sanctuaries, and heals by eating (poison and bleeding cut that).
    // Hiding only buys a few seconds before it picks up your scent again. The hunt ends when one of you dies.
    _bossCheck(){
      const s=this.state,p=s.player;if(s.bossEncounter||s.status!=='playing'||this._nurseryCalm())return;
      // Co-op: give the others a moment to say whether the party already has a boss before making one of my own.
      if(this.coop&&(this.coop.clock<8||this.coop.clock<(this.coop.bossHold||0)))return;
      if(s.stats.bossRest>s.time)return;
      const next=this.nextBoss();if(next&&p.stage+1>=next.level)this._spawnBoss(next.type);
    }
    _spawnBoss(type){
      const s=this.state,p=s.player,def=BOSSES[type],a=this.random()*TAU,bs=bossScale(type),r=22*bs*def.size,far=Math.max(900+p.r*7,this._edge(a,r+140)),maxHp=def.hits*BOSS_HEALTH_UNIT*bossPower(type)*(1+COOP_BOSS_HEALTH*Math.min(COOP_PARTY_CAP,this._partyNear()));
      s.bossEncounter={id:this._id++,type,name:def.name,phaseLabel:def.phases[0],x:p.x+Math.cos(a)*far,y:p.y+Math.sin(a)*far,r,scale:bs,unit:100*bossPower(type)*(def.dmg||1),hp:maxHp,maxHp,phase:1,mode:'hunt',modeTime:0,angle:a+Math.PI,vx:0,vy:0,
        attackKind:'',attackAngle:0,attackHit:false,windup:0,windupMax:1,actTime:0,recoverTime:0,cooldown:3,chain:0,lungeSpeed:0,pullTime:0,ringDue:0,lastBirth:-99,nextMeal:0,lastSeenX:p.x,lastSeenY:p.y,lostTime:0,meals:0,feeding:false,healFlash:0,
        poison:0,poisonDamage:0,venomStacks:0,bleed:0,bleedDamage:0,huntCredit:0,flash:0,age:0,projectileTokens:[],heads:type==='hydra'?[-.8,0,.8].map(off=>this._hydraHead(off)):[]};
      (this._announced||(this._announced=new Map())).set(type,this.state.time);this._event('bossAwakened',{bossType:type,name:def.name});return true;
    }
    _hydraHead(off){return{off,mode:'rest',t:0,cooldown:1+this.random()*1.6,aim:0,reach:1.45,hit:false,tipX:0,tipY:0};}
    _bossMouth(b){return{x:b.x+Math.cos(b.angle)*b.r*.72,y:b.y+Math.sin(b.angle)*b.r*.72};}
    _bossHealFactor(b){return(b.poison>0?.25:1)*(b.bleed>0?.5:1);}
    // Everything small enough that touches its mouth (or a Hydra's head) is eaten and heals it.
    _bossEat(b){
      const s=this.state;if(b.hp>=b.maxHp||s.time<(b.nextMeal||0))return;const mouths=[this._bossMouth(b)];for(const h of b.heads)mouths.push({x:h.tipX,y:h.tipY});const heal=this._bossHealFactor(b);let ate=false;
      for(const o of s.organisms){if(o.dead||o.nestId||o.elder||(o.bossId&&!(b.type==='brood'&&b.phase===3))||o.r>b.r*.6)continue;
        if(!mouths.some(m=>distance(o,m)<b.r*.42+o.r))continue;o.dead=true;b.hp=Math.min(b.maxHp,b.hp+b.maxHp*(.015+.015*Math.min(1,o.r/(b.r*.4)))*heal*Math.pow(.9,b.meals));b.healFlash=1.2;ate=true;b.meals++;this._particles(o.x,o.y,'#d6a6ad',10,70);b.nextMeal=s.time+(b.attackKind==='vortex'&&b.mode==='act'?2:4);break;}
      if(ate){s.organisms=s.organisms.filter(o=>!o.dead);this._event('bossFeed',{bossType:b.type,x:b.x,y:b.y});}
    }
    _bossMeal(b){
      const s=this.state;let best=null,bd=b.r*6+500;for(const o of s.organisms){if(o.dead||o.nestId||o.elder||o.r>b.r*.6||(o.bossId&&!(b.type==='brood'&&b.phase===3)))continue;const d=distance(o,b);if(d<bd){bd=d;best=o;}}return best;
    }
    _bossSteer(b,tx,ty,speed,dt,turn){
      const want=Math.atan2(ty-b.y,tx-b.x),diff=Math.atan2(Math.sin(want-b.angle),Math.cos(want-b.angle));b.angle+=clamp(diff,-turn*dt,turn*dt);
      const f=1-Math.exp(-dt*2.4);b.vx+=(Math.cos(b.angle)*speed-b.vx)*f;b.vy+=(Math.sin(b.angle)*speed-b.vy)*f;b.x+=b.vx*dt;b.y+=b.vy*dt;
    }
    _bossHitPlayer(b,amount,angle){
      const s=this.state,p=s.player;if(p.invulnerable>0||s.status!=='playing')return false;b.lastBlow=s.time;this._damagePlayer(amount,{x:b.x,y:b.y,id:b.id,bossType:b.type,kind:'boss'});
      if(s.status==='playing'){p.vx+=Math.cos(angle)*420;p.vy+=Math.sin(angle)*420;}return true;
    }
    _bossShot(b,angle,speed,r,damage,life,colour){
      const s=this.state;s.projectiles.push({id:this._id++,x:b.x+Math.cos(angle)*b.r*.8,y:b.y+Math.sin(angle)*b.r*.8,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r,life,damage,owner:'enemy',sourceId:b.id,bossId:b.id,bossPhase:b.phase,colour});
      if(s.projectiles.length>90)s.projectiles.splice(0,s.projectiles.length-90);
    }
    _bossTick(dt){
      this._bossCheck();const s=this.state,b=s.bossEncounter;if(!b||s.status!=='playing')return;const p=s.player,def=BOSSES[b.type];
      // Co-op: a boss hunting another player is run on their device; here it is only shown.
      if(b.puppet){
        // Every one of its attacks can hit my player if I am in the way, judged here from where I really am.
        // Damage is the same share of my own health that the hunted player would lose of theirs.
        b.flash=Math.max(0,b.flash-dt);if(this.coop.clock-b._seen>.6)return;
        const ox=b.x,oy=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;const k=b.attackKind,act=b.mode==='act',u=100*this._sizePower()*(BOSSES[b.type]?.dmg||1);
        if(!act)b._bit=false;
        else if(!b._bit&&['engulf','dash','charge','slam'].includes(k)){const front=k==='slam'?b.r*.6:b.r*.85,ca=Math.cos(b.angle),sa=Math.sin(b.angle),width=k==='dash'?b.r*.38:b.r*.7;
          if(segmentDistance(p,ox+ca*front,oy+sa*front,b.x+ca*front,b.y+sa*front)<width+p.r*.7)b._bit=this._bossHitPlayer(b,u*({engulf:.3,dash:.22,charge:.32,slam:.22}[k]),b.angle);}
        else if(!b._bit&&k==='sweep'){b._bit=true;const a=b.attackAngle,dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy)||1,off=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-a),Math.cos(Math.atan2(dy,dx)-a)));
          if(d<b.r*2+p.r&&off<.8+Math.atan2(p.r,d))this._bossHitPlayer(b,u*.16,a);}
        else if(k==='vortex'){const m=this._bossMouth(b),R=b.r*3.8,dx=m.x-p.x,dy=m.y-p.y,d=Math.hypot(dx,dy)||1;
          if(d<=R&&!this._hasMutation('abyssalHeart')){const f=(240+p.speed*.5)*(p.sprinting?.5:1)*(1-d/R*.5)*dt;p.x+=dx/d*Math.min(f,d);p.y+=dy/d*Math.min(f,d);}
          if(distance(p,m)<b.r*.45+p.r)this._bossHitPlayer(b,u*.2,b.angle+Math.PI);}
        for(const h of b.heads||[])if(h.mode==='strike'&&Number.isFinite(h.aim)&&Number.isFinite(h.reach)&&distance(p,{x:b.x+Math.cos(h.aim)*b.r*h.reach,y:b.y+Math.sin(h.aim)*b.r*h.reach})<b.r*.32+p.r)this._bossHitPlayer(b,u*.14,h.aim);
        return;}
      b.age+=dt;b.flash=Math.max(0,b.flash-dt);b.healFlash=Math.max(0,b.healFlash-dt);b.cooldown=Math.max(0,b.cooldown-dt);b.slowTime=Math.max(0,(b.slowTime||0)-dt);if(b.inkTime>0)b.inkTime=Math.max(0,b.inkTime-dt);if(b.grabCool>0)b.grabCool=Math.max(0,b.grabCool-dt);if(b.inkCool>0)b.inkCool=Math.max(0,b.inkCool-dt);
      if(b.poison>0){b.poison=Math.max(0,b.poison-dt);this._hitBoss(b.poisonDamage*dt,{noCritical:true,dot:true});if(!s.bossEncounter)return;}else b.venomStacks=0;
      if(b.bleed>0){b.bleed=Math.max(0,b.bleed-dt);this._hitBoss(b.bleedDamage*dt,{noCritical:true,dot:true});if(!s.bossEncounter)return;}
      // Senses: full concealment loses it for a few seconds; then it smells you again.
      const dp=distance(b,p),hidden=p.stealth>.8&&dp>b.r+260;
      if(!hidden){b.lastSeenX=p.x;b.lastSeenY=p.y;b.lostTime=0;}else{b.lostTime+=dt;if(b.lostTime>5){b.lastSeenX=p.x;b.lastSeenY=p.y;b.lostTime=0;}}
      const decoy=s.decoys.find(d=>d.life>0&&distance(d,b)<b.r*3);if(decoy&&distance(b,decoy)<b.r+decoy.r)decoy.life=0;
      this._bossEat(b);if(!s.bossEncounter)return;
      // It also preys on other predators: any hunter that touches its body, or is caught by a lunge, is killed outright.
      {let crushed=false;const reach=b.r*(b.mode==='act'?1.05:.85);for(const o of s.organisms){if(o.dead||o.bossId||o.nestId||o.elder||!isHostile(o)||o.r>b.r*.6)continue;if(distance(o,b)<reach+o.r*.5){o.dead=true;this._elderFell(o);crushed=true;this._particles(o.x,o.y,'#e3a7a0',12,90);}}if(crushed)s.organisms=s.organisms.filter(o=>!o.dead);}
      if(b.type==='hydra')this._hydraHeads(b,dt,dp);if(s.status!=='playing')return;
      if(b.mode==='hunt'){
        let tx=decoy?decoy.x:b.lastSeenX,ty=decoy?decoy.y:b.lastSeenY;
        b.feeding=false;// A hurt boss never turns away to feed: it presses harder (see enraged below).
        // You can run from a boss. It follows a little faster when it falls behind, but a colony that gets far enough from it
        // loses it at once (in co-op, every player must be that far): the hunt ends, and it comes looking again BOSS_REST_SECONDS later, rested and at full health.
        const near=p.r*12+900;let clear=dp;if(this.coop)for(const q of this.coop.peers.values()){const pb=q.body;if(pb&&!(pb.down>0)&&Number.isFinite(pb.x))clear=Math.min(clear,length(pb.x-b.x,pb.y-b.y));}
        // Kept out of its reach, with no blow struck either way, it tires: it slows by a tenth for each second, down to under half speed.
        // (None of this starts until it has first reached you: a boss still on its way in is not one you have escaped.)
        if(clear<b.r*1.6+260*(b.scale||1))b.met=true;
        // A boss still on its way that has been left far behind arrives just off screen instead of crossing the whole pond.
        if(!b.met&&dp>p.r*30+2600){const a=Math.atan2(b.y-p.y,b.x-p.x),far=Math.max(near+300,this._edge(a,b.r+140));b.x=p.x+Math.cos(a)*far;b.y=p.y+Math.sin(a)*far;}
        const over=Math.max(0,p.stage+1-(def.level||0)),tireRate=over>=2?0:over>=1?.25:1;b.tire=b.met&&clear>b.r*2.2+420*(b.scale||1)&&s.time-(b.lastBlow||-99)>2.5?Math.min(8,(b.tire||0)+dt*tireRate):Math.max(0,(b.tire||0)-dt*3);
        // Distance alone decides it: once every player is further from it than BOSS_ESCAPE_GAP allows, it has lost the scent.
        // (It must also have begun to tire, which only happens once it has been out of reach with no blow struck for a few seconds: a boss
        // whose own charge carries it far past you has not lost you.)
        if(b.met&&!b.puppet&&over<2&&(b.tire||0)>=1.5&&clear>near*(over?2:1)+BOSS_ESCAPE_GAP*(b.scale||1)){this._bossLost(b);return;}
        // Two or more levels outgrown, it does not lose the scent: left far behind, it comes up just off screen behind you.
        if(over>=2&&b.met&&!b.puppet&&dp>p.r*24+2200){const a=Math.atan2(b.y-p.y,b.x-p.x),far=Math.max(near+200,this._edge(a,b.r+140));b.x=p.x+Math.cos(a)*far;b.y=p.y+Math.sin(a)*far;b.vx=b.vy=0;}
        const hydraPace=b.type==='hydra'?(b.phase===1?.55:1.15):1,enraged=b.hp<b.maxHp*.25,pace=(b.phase===3?1.25:b.phase===2?1.1:1)*hydraPace*(enraged?1.12:1);
        const speed=bossCruise(b.type)*def.speed*pace*(1+.12*Math.min(3,over))*clamp(1-.1*(b.tire||0),over?.75:.42,1)*(b.feeding?1.2:1)*(b.slowTime>0?.6:1);
        this._bossSteer(b,tx,ty,speed,dt,def.turn);
        if(!decoy&&!b.feeding&&!hidden&&b.cooldown<=0)this._bossChoose(b,dp);
      }else this._bossAct(b,dt);
      if(!s.bossEncounter||s.status!=='playing')return;
      // Touching its body hurts.
      {const d=distance(b,p)||1,wall=b.r*.8+p.r*.6;if(b.mode!=='transform'&&d<wall){const nx=(p.x-b.x)/d,ny=(p.y-b.y)/d,gap=(wall-d)*.7;p.x+=nx*gap;p.y+=ny*gap;const into=-(p.vx*nx+p.vy*ny);if(into>0){p.vx+=nx*into;p.vy+=ny*into;}}}
      const away=Math.atan2(p.y-b.y,p.x-b.x),facing=Math.abs(Math.atan2(Math.sin(away-b.angle),Math.cos(away-b.angle))),touching=b.mode!=='transform'&&distance(b,p)<b.r*.82+p.r*.6+2;
      // A fast-swimming ram lands on a boss as on anything else, and bounces you off; only an open boss can't hurt you back.
      if(touching&&p.sprinting&&s.time-(b.ramAt||0)>1.5){b.ramAt=s.time;p.refugeCombatTime=3;const rt=p.traits.riptide||0;this._hitBoss(p.attack*this._classPower('riptide')*(.5+rt*.25)*(rt>=5?1.25:1)*(1+p.momentum*.25)*(1+.3*this._pk('jetSac'))+this._ramBite(),{family:'riptide'});this._xp('riptide',8);this._awaken('riptide','ram');p.momentum=0;p.vx+=Math.cos(away)*360;p.vy+=Math.sin(away)*360;this._effect(p.x,p.y,'hit',Math.min(10000,p.r*2),'#95dafa',.3);if(!s.bossEncounter||s.status!=='playing'||s.pendingEvolution)return;if(b.mode==='recover')return;}
      // Brushing its flank or tail is safe; its front half is its mouth.
      this._bossTouch=Math.max(0,(this._bossTouch||0)-dt);if(touching&&facing<1.25&&!(this._bossTouch>0)&&this._bossHitPlayer(b,b.unit*def.contact,away)){this._bossTouch=1.1;p.invulnerable=Math.min(p.invulnerable,.3);}
    }
    _bossChoose(b,dp){
      const s=this.state,ph=b.phase,def=BOSSES[b.type];let kind='';
      // Each boss chooses from the attacks its body has, by range and phase (v36.3). The attack it used last is a third as likely,
      // so the same move rarely comes three times running. The Kraken keeps its own rules below.
      const R=b.r,opt=[];const add=(k,w,ok)=>{if(ok)opt.push([k,k===b.lastKind?w*.35:w]);};
      if(b.type==='gulper'){add('sweep',3,dp<R*1.9);add('slam',1.6,ph>=2&&dp<R*1.9);add('engulf',3,dp>R*1.9&&dp<R*3.6);add('grab',2.2,ph>=2&&!(b.grabCool>0)&&dp>R*1.8&&dp<R*5);add('spores',1.4,ph>=2&&dp>R*2.2&&dp<R*5.5);}
      else if(b.type==='brood'){const young=s.organisms.filter(o=>o.bossId===b.id&&!o.dead).length;if(young<(ph===1?3:5)&&b.age-b.lastBirth>(ph===1?9:5))kind='birth';else{add('slam',3,dp<R*1.7);add('spores',2,dp<R*4.5);add('charge',1.6,ph>=2&&dp>R*2.4&&dp<R*7);add('rings',1.2,ph>=3&&dp<R*6);}}
      else if(b.type==='pike'){add('dash',4,dp<R*5.5);add('sweep',3,dp<R*1.6);add('rings',1.3,ph>=2&&dp<R*6);add('charge',1,ph>=3&&dp>R*3&&dp<R*7);}
      else if(b.type==='hydra'){add('tendrils',2,ph>=2&&dp<R*4.5);add('spores',1.6,ph>=2&&dp<R*4);add('rings',1.2,ph>=3&&dp<R*6);add('',3,true);}
      else if(b.type==='undertow'){add('vortex',2,dp<R*2.8);add('slam',2,dp<R*1.7);add('charge',2,dp<R*6.5);add('rings',2,dp<R*6.5);add('dash',1.6,ph>=3&&dp<R*5.5);}
      if(b.type!=='kraken'&&!kind&&opt.length){let sum=opt.reduce((a,o)=>a+o[1],0),roll=this.random()*sum,pick=opt[opt.length-1][0];for(const [k,w] of opt){roll-=w;if(roll<=0){pick=k;break;}}kind=pick;
        if(kind==='grab')b.grabCool=ph===3?7:9;if(!kind){b.cooldown=1;return;}}
      else if(b.type==='kraken'){
        // From its second phase it blacks out the water every so often, then keeps hunting through the dark.
        if(ph>=2&&!(b.inkCool>0)&&this.random()<.35){b.inkTime=7;b.inkCool=ph===3?16:22;b.cooldown=1.1;this._event('bossInk',{x:b.x,y:b.y,name:def.name});this._effect(b.x,b.y,'burst',Math.min(10000,b.r*3),'#3a2a4a',1.1);return;}
        if(!(b.grabCool>0)&&dp>b.r*1.8&&dp<b.r*5&&this.random()<(ph===1?.3:.4)){b.grabCool=ph===3?8:11;kind='grab';}
        else if(dp<b.r*1.7)kind='slam';else if(ph>=2&&dp<b.r*2.9&&this.random()<.4)kind='vortex';else if(dp<b.r*6.5)kind=ph===3?(this.random()<.55?'dash':'rings'):(this.random()<.5?'charge':'rings');}
      if(kind){b.lastKind=kind;this._bossBegin(b,kind);}
    }
    _bossBegin(b,kind){
      const p=this.state.player,ph=b.phase,W={engulf:.9,sweep:.55,birth:1,spores:.75,slam:.5,dash:.6,tendrils:.8,vortex:.85,charge:.8,rings:.65,grab:.85}[kind]||.7;delete b.grab;
      b.mode='windup';b.attackKind=kind;b.windupMax=W*(ph===3?.82:1);b.windup=b.windupMax;b.attackHit=false;delete b.missNear;
      b.chain=kind==='dash'?(ph>=2?3:2):kind==='engulf'&&ph>=2?2:1;b.attackAngle=Math.atan2(p.y-b.y,p.x-b.x);
      this._event('bossWindup',{bossType:b.type,attackKind:kind,duration:b.windupMax,x:b.x,y:b.y});
    }
    _bossAct(b,dt){
      const s=this.state,p=s.player,def=BOSSES[b.type],k=b.attackKind;
      if(b.mode==='transform'){b.modeTime-=dt;b.vx*=Math.pow(.1,dt);b.vy*=Math.pow(.1,dt);if(b.modeTime<=0){b.mode='hunt';b.cooldown=.8;}return;}
      if(b.mode==='recover'){b.recoverTime-=dt;b.vx*=Math.pow(.15,dt);b.vy*=Math.pow(.15,dt);b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.recoverTime<=0){b.mode='hunt';b.cooldown=def.cooldown*(b.phase===3?.65:b.phase===2?.82:1)*(b.hp<b.maxHp*.25?.75:1);}return;}
      if(b.mode==='windup'){
        b.windup-=dt;b.vx*=Math.pow(.12,dt);b.vy*=Math.pow(.12,dt);b.x+=b.vx*dt;b.y+=b.vy*dt;
        // Charges commit to their line in the last 40% of the wind-up; everything else keeps tracking you.
        if(!((k==='dash'||k==='charge'||k==='engulf'||k==='slam'||k==='grab')&&b.windup<b.windupMax*(k==='dash'?.7:.4))){const lead=k==='dash'||k==='charge'?.2:0;b.attackAngle=Math.atan2(p.y+(p.vy||0)*lead-b.y,p.x+(p.vx||0)*lead-b.x);}
        b.angle+=clamp(Math.atan2(Math.sin(b.attackAngle-b.angle),Math.cos(b.attackAngle-b.angle)),-5*dt,5*dt);
        if(b.windup<=0)this._bossRelease(b);return;
      }
      if(b.mode==='act'){b.actTime-=dt;this._bossActive(b,dt);if(s.bossEncounter===b&&b.mode==='act'&&b.actTime<=0)this._bossFinish(b);}
    }
    _bossRelease(b){
      const s=this.state,p=s.player,def=BOSSES[b.type],k=b.attackKind,a=b.attackAngle,u=b.unit,ss=Math.sqrt(b.scale||1);b.mode='act';b.attackHit=false;
      if(k==='engulf'){b.actTime=.42;b.lungeSpeed=b.r*2.7/.42;}
      else if(k==='dash'){b.actTime=.3;b.lungeSpeed=b.r*3.6/.3;}
      else if(k==='charge'){b.actTime=.75;b.lungeSpeed=b.r*4.4/.75;}
      else if(k==='slam'){b.actTime=.28;b.lungeSpeed=b.r*1.7/.28;}
      else if(k==='sweep'){b.actTime=.22;const reach=b.r*2,half=.8,dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy)||1,off=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-a),Math.cos(Math.atan2(dy,dx)-a)));
        if(d<reach+p.r&&off<half+Math.atan2(p.r,d))b.attackHit=this._bossHitPlayer(b,u*.16,a);this._effect(b.x,b.y,'bite',Math.min(10000,reach),def.colour,.34,{angle:Math.atan2(Math.sin(a),Math.cos(a)),halfAngle:half,body:Math.min(5000,b.r)});}
      else if(k==='birth'){b.actTime=.4;b.lastBirth=b.age;const n=b.phase===1?2:3;for(let i=0;i<n;i++){const ang=b.angle+Math.PI+(i-(n-1)/2)*.7,o=this._organism('hunter',b.x+Math.cos(ang)*b.r*.95,b.y+Math.sin(ang)*b.r*.95,{scale:(b.scale||1)*.85,home:this._home(b.x,b.y),young:true});o.bossId=b.id;o.hue=330;o.vx=Math.cos(ang)*220;o.vy=Math.sin(ang)*220;o.cooldown=1.2;}this._effect(b.x,b.y,'burst',Math.min(10000,b.r*1.5),def.colour,.5);}
      else if(k==='spores'){b.actTime=.3;const col={gulper:'#d8e39a',hydra:'#b9e3ab'}[b.type]||'#d9a6d8',n=b.type==='brood'?7:5,spread=b.type==='brood'?.15:.26;for(let i=0;i<n;i++)this._bossShot(b,a+(i-(n-1)/2)*spread,150*ss,10*ss,u*.07,3.4,col);}
      else if(k==='rings'){b.actTime=.3;this._bossRing(b);}
      else if(k==='tendrils'){b.actTime=.3;for(let i=0;i<6;i++)this._bossShot(b,a+(i-2.5)*.2,280*ss,9*ss,u*.07,1.7,'#b9e3ab');}
      else if(k==='vortex'){b.actTime=b.phase>=2?3.6:2.8;b.pullTime=b.actTime;b.ringDue=1.1;}
      else if(k==='grab'){const m=this._bossMouth(b);b.actTime=.4;b.grab={stage:'reach',len:0,max:b.r*5.2,a,tipX:m.x,tipY:m.y,d:0,pull:0};}
      this._event('bossRelease',{bossType:b.type,attackKind:k,x:b.x,y:b.y});
    }
    _bossRing(b){
      const n=20,gap=Math.floor(this.random()*n),width=b.phase===3?3:4,ss=Math.sqrt(b.scale||1);
      for(let i=0;i<n;i++){if(((i-gap+n)%n)<width)continue;this._bossShot(b,i*TAU/n,190*ss,14*ss,b.unit*.12,3.6,'#a7cdea');}
    }
    _bossActive(b,dt){
      const s=this.state,p=s.player,k=b.attackKind;
      if(k==='engulf'||k==='dash'||k==='charge'||k==='slam'){
        if(k==='dash'&&b.phase>=2){const want=Math.atan2(p.y-b.y,p.x-b.x);b.attackAngle+=clamp(Math.atan2(Math.sin(want-b.attackAngle),Math.cos(want-b.attackAngle)),-1.1*dt,1.1*dt);}
        b.angle=b.attackAngle;b.vx=Math.cos(b.angle)*b.lungeSpeed;b.vy=Math.sin(b.angle)*b.lungeSpeed;const front=k==='slam'?b.r*.6:b.r*.85,ox=b.x+Math.cos(b.angle)*front,oy=b.y+Math.sin(b.angle)*front;b.x+=b.vx*dt;b.y+=b.vy*dt;
        const nx=b.x+Math.cos(b.angle)*front,ny=b.y+Math.sin(b.angle)*front,width=k==='dash'?b.r*.38:b.r*.7,near=segmentDistance(p,ox,oy,nx,ny)-(width+p.r*.7);
        if(!b.attackHit&&near<0)b.attackHit=this._bossHitPlayer(b,b.unit*({engulf:.3,dash:.22,charge:.32,slam:.22}[k]),b.angle);
        else if(!b.attackHit&&this._fastNow())b.missNear=Math.min(b.missNear??1e9,near);
        if(k==='dash'){b.shardClock=(b.shardClock||0)-dt;if(b.shardClock<=0){b.shardClock=.09;this._bossShot(b,b.angle+Math.PI+this.range(-.7,.7),40,7*Math.sqrt(b.scale||1),b.unit*.04,2.6,'#dcf4f8');}}
      }
      if(k==='grab'&&b.grab){const G=b.grab,m=this._bossMouth(b);
        if(G.stage==='reach'){G.len=Math.min(G.max,G.len+G.max/.32*dt);G.tipX=m.x+Math.cos(G.a)*G.len;G.tipY=m.y+Math.sin(G.a)*G.len;b.angle=G.a;
          if(p.invulnerable<=0&&!(p.down>0)&&segmentDistance(p,m.x,m.y,G.tipX,G.tipY)<p.r+b.r*.12){G.stage='hold';G.d=distance(p,m);G.pull=Math.max(b.r*1.1,(G.d-b.r*.7)/2);b.actTime=5;this._event('bossGrab',{x:p.x,y:p.y,name:BOSSES[b.type].name});}}
        else{const dx=p.x-m.x,dy=p.y-m.y,dd=Math.hypot(dx,dy)||1;G.d=Math.max(0,G.d-G.pull*dt);p.x=m.x+dx/dd*G.d;p.y=m.y+dy/dd*G.d;p.vx*=.2;p.vy*=.2;G.tipX=p.x;G.tipY=p.y;
          const want=Math.atan2(dy,dx);b.angle+=clamp(Math.atan2(Math.sin(want-b.angle),Math.cos(want-b.angle)),-2*dt,2*dt);
          if(G.d<=b.r*.72+p.r*.4){delete b.grab;p.invulnerable=0;this._bossHitPlayer(b,b.unit*.26,b.angle);b.actTime=0;}}
      }
      if(k==='vortex'){
        b.pullTime=Math.max(0,b.pullTime-dt);const want=Math.atan2(p.y-b.y,p.x-b.x);b.angle+=clamp(Math.atan2(Math.sin(want-b.angle),Math.cos(want-b.angle)),-.7*dt,.7*dt);
        const m=this._bossMouth(b),R=b.r*3.8,str=240+p.speed*.5;
        const pull=(v,mult)=>{const dx=m.x-v.x,dy=m.y-v.y,d=Math.hypot(dx,dy)||1;if(d>R)return;const f=str*mult*(1-d/R*.5)*dt;v.x+=dx/d*Math.min(f,d);v.y+=dy/d*Math.min(f,d);};
        if(!this._hasMutation('abyssalHeart'))pull(p,p.sprinting?.5:1);for(const o of s.organisms)if(!o.dead&&!o.bossId&&!o.nestId)pull(o,1.5);
        if(distance(p,m)<b.r*.45+p.r)this._bossHitPlayer(b,b.unit*.2,b.angle+Math.PI);
        if(b.phase>=2){b.ringDue-=dt;if(b.ringDue<=0){b.ringDue=1.5;this._bossRing(b);}}
      }
    }
    _bossFinish(b){
      const k=b.attackKind;if(!b.attackHit&&b.missNear!==undefined&&b.missNear<this._nearMissReach())this._nearMiss(b);delete b.missNear;
      if((k==='dash'||k==='engulf')&&b.chain>1){b.chain--;b.mode='windup';b.windupMax=k==='engulf'?(b.phase===3?.55:.7):(b.phase===3?.4:.55);b.windup=b.windupMax;b.attackHit=false;this._event('bossWindup',{bossType:b.type,attackKind:k,duration:b.windupMax,x:b.x,y:b.y});return;}
      delete b.grab;b.chain=0;b.vx*=.35;b.vy*=.35;b.mode='recover';b.recoverTime={grab:1,engulf:1.15,dash:b.phase===3?1.7:1.1,charge:1.5,slam:.9,sweep:.75,birth:.7,spores:.7,rings:.7,tendrils:.7,vortex:1.1}[k]||.9;
    }
    // Hydra heads: each one draws back, aims and snaps on its own, then returns to rest.
    _hydraHeads(b,dt,dp){
      const s=this.state,p=s.player,ph=b.phase;
      for(const h of b.heads){const base=b.angle+h.off;h.cooldown=Math.max(0,h.cooldown-dt);
        if(h.mode==='rest'){h.aim=base;h.reach+=(1.45-h.reach)*Math.min(1,dt*6);if(h.cooldown<=0&&b.mode!=='transform'&&dp<b.r*2.9){h.mode='windup';h.t=ph===3?.5:.7;h.hit=false;this._event('bossWindup',{bossType:b.type,attackKind:'head',duration:h.t,x:h.tipX,y:h.tipY});}}
        else if(h.mode==='windup'){h.t-=dt;h.reach+=(1.15-h.reach)*Math.min(1,dt*8);if(h.t>.22)h.aim=Math.atan2(p.y-b.y,p.x-b.x);if(h.t<=0){h.mode='strike';h.t=.18;}}
        else if(h.mode==='strike'){h.t-=dt;h.reach=1.15+(2.75-1.15)*(1-Math.max(0,h.t)/.18);if(!h.hit&&distance(p,{x:b.x+Math.cos(h.aim)*b.r*h.reach,y:b.y+Math.sin(h.aim)*b.r*h.reach})<b.r*.32+p.r){h.hit=true;if(this._bossHitPlayer(b,b.unit*.14,h.aim))p.invulnerable=Math.min(p.invulnerable,.6);}if(h.t<=0){h.mode='back';h.t=.4;}}
        else if(h.mode==='back'){h.t-=dt;h.reach+=(1.45-h.reach)*Math.min(1,dt*5);h.aim+=Math.atan2(Math.sin(base-h.aim),Math.cos(base-h.aim))*Math.min(1,dt*5);if(h.t<=0){h.mode='rest';h.cooldown=(ph===1?2.6:ph===2?2:1.5)+this.random()*.8;}}
        h.tipX=b.x+Math.cos(h.aim)*b.r*h.reach;h.tipY=b.y+Math.sin(h.aim)*b.r*h.reach;
      }
    }
    _hitBoss(amount,options={}){
      const s=this.state,b=s.bossEncounter,p=s.player;if(!b||b.hp<=0||amount<=0||b.mode==='transform')return false;if(!options.dot)b.lastBlow=s.time;
      if(options.token!==undefined){if(b.projectileTokens.includes(options.token))return false;b.projectileTokens.push(options.token);if(b.projectileTokens.length>40)b.projectileTokens.shift();}
      if(!options.dot&&!options.defence&&!options.brood){b.knowsMe=1;const f=this._rearFactor(b.mode==='windup'&&Number.isFinite(b.attackAngle)?b.attackAngle:b.angle,b.x-p.x,b.y-p.y);amount*=f.k;if(f.dot>.6)this._event('rearHit',{x:b.x,y:b.y});}
      if(options.ambush)this._creditAmbush(40);
      if(options.poison){b.poison=Math.max(b.poison,options.poison);b.poisonDamage=Math.max(b.poisonDamage,options.poisonDamage||0);}
      if(!options.noCritical&&p.criticalChance>0&&this.random()<p.criticalChance){amount*=1.8+.15*this._pk('keenEdge');s.stats.criticals++;this._effect(b.x,b.y,'critical',Math.min(10000,b.r*1.2),'#f4ce82',.45);this._event('critical',{amount});}
      amount*=bossExposure(s).damageMultiplier*(1+.06*this._pk('abyssalHeart'));const actual=Math.min(b.hp,amount);b.hp-=amount;b.flash=.2;
      if(!options.defence&&!options.dot&&options.family){const credit=Math.min(actual*.03,Math.max(0,60-b.huntCredit));this._xp(options.family,credit);b.huntCredit+=credit;}
      if(!options.dot){this._event('hit',{target:'boss',bossType:b.type,amount:actual,protected:false});b.myDamage=(b.myDamage||0)+actual;}
      if(b.puppet){this._net(b.owner,{t:'bh',a:Math.round(actual*100)/100,p:options.poison||0,pd:options.poisonDamage||0});return true;}
      if(b.hp<=0){this._defeatBoss();return true;}
      const next=b.hp<=b.maxHp/3?3:b.hp<=b.maxHp*2/3?2:1;
      if(next>b.phase){b.phase=next;b.phaseLabel=BOSSES[b.type].phases[next-1];delete b.grab;b.mode='transform';b.modeTime=.9;b.chain=0;b.windup=0;b.attackKind='';s.projectiles=s.projectiles.filter(shot=>shot.bossId!==b.id);
        if(b.type==='hydra'&&next===3)b.heads=[-1.05,-.35,.35,1.05].map(off=>this._hydraHead(off));
        this._effect(b.x,b.y,'division',Math.min(10000,b.r*1.8),BOSSES[b.type].colour,.8);this._event('bossPhase',{bossType:b.type,name:b.name,phase:next,phaseLabel:b.phaseLabel});}
      return true;
    }
    // The colony got away. The boss gives up for now and rests; _bossCheck wakes it again when the rest is over.
    _grabStrike(angle){
      const s=this.state,p=s.player,b=s.bossEncounter;if(!b||b.puppet||!b.grab||b.grab.stage!=='hold'||b.mode!=='act')return false;const m=this._bossMouth(b),toward=Math.atan2(m.y-p.y,m.x-p.x);
      if(Math.abs(Math.atan2(Math.sin(angle-toward),Math.cos(angle-toward)))>1.05)return false;
            delete b.grab;b.mode='recover';b.recoverTime=1.8;b.vx=-Math.cos(toward)*120;b.vy=-Math.sin(toward)*120;b.flash=.35;p.invulnerable=Math.max(p.invulnerable,.6);p.vx-=Math.cos(toward)*380;p.vy-=Math.sin(toward)*380;
      this._effect(p.x+Math.cos(toward)*p.r*1.5,p.y+Math.sin(toward)*p.r*1.5,'burst',p.r*2.4,'#f0c8ff',.5);this._event('bossGrabBroken',{x:p.x,y:p.y});return true;
    }
    _bossLost(b){
      const s=this.state,def=BOSSES[b.type];this._clearBossDependants(b.id);s.bossEncounter=null;s.stats.bossRest=s.time+BOSS_REST_SECONDS;s.projectiles=s.projectiles.filter(x=>x.bossId!==b.id);
      if(this.coop){this.coop.bossHold=this.coop.clock+BOSS_REST_SECONDS;this.coopSignal&&this.coopSignal('bossLost');}
      this._event('bossLost',{bossType:b.type,name:def.name,rest:BOSS_REST_SECONDS});
    }
    _clearBossDependants(id){
      const s=this.state;s.organisms=s.organisms.filter(o=>o.bossId!==id);s.projectiles=s.projectiles.filter(shot=>shot.bossId!==id);for(const c of Object.values(this._chunkCache))c.organisms=c.organisms.filter(o=>o.bossId!==id);
    }
    _defeatBoss(){
      const s=this.state,b=s.bossEncounter;if(!b)return false;const p=s.player,def=BOSSES[b.type];
      if(this.coop){
        if(!b.puppet)this._net(-1,{t:'bd',id:b.id});
        // Its genome goes to every player who wounded it, and to nobody who did not.
        if(!(b.myDamage>0)){this._clearBossDependants(b.id);s.bossEncounter=null;this._effect(b.x,b.y,'bossDeath',Math.min(10000,b.r*2),def.colour,1.5);this._event('bossGone',{bossType:b.type});return true;}
      }
      // Commit the unique reward before any biomass can trigger a division.
      const first=!p.genomes.includes(b.type);if(first)p.genomes.push(b.type);s.stats.encounters++;s.stats.bosses++;
      const reward=first?this._awardPoints(def.reward,'elder'):0;s.score+=1500*(BOSS_ORDER.indexOf(b.type)+1);s.biomass+=this._divisionShare(.4)*gapWorth((BOSSES[b.type].level-1)-s.player.stage);
      s.bossLog.push({type:b.type,name:b.name,time:s.time,first,reward});if(s.bossLog.length>40)s.bossLog.shift();this._clearBossDependants(b.id);s.bossEncounter=null;
      p.hp=p.maxHp;p.energy=p.maxEnergy;p.exhausted=false;p.recoveryProgress=1;p.nutrition=p.maxNutrition;p.invulnerable=3;p.growthBlockedStage=-1;
      this._effect(b.x,b.y,'bossDeath',Math.min(10000,b.r*2),def.colour,1.5);this._particles(b.x,b.y,def.colour,40,160);this._findMutation(def.mutationKey,BOSS_MUTATION_TIER[b.type],b.name);
      this._event('bossDefeated',{bossType:b.type,name:b.name,genomeName:def.genomeName,mutationKey:def.mutationKey,reward,rewardSource:reward?'elder':'',first,ancient:false});
      if(s.biomass>=s.nextDivision&&!s.pendingEvolution)this._divide();
      if(p.genomes.length===BOSS_ORDER.length&&!s.journeyComplete){s.journeyComplete=true;s.journeyCompletedAt=s.time;this._event('journeyComplete',{time:s.time,score:Math.round(s.score),cells:p.cellCount,cellCountText:p.cellCountText,genomes:[...p.genomes]});}return true;
    }
    _newObjective(){
      const s=this.state,defs=[['forage','Gather nutrients','Eat nutrients to strengthen this colony.',12,'food'],['travel','Follow the water','Explore further into the living pond.',1800,'distance'],['discover','Find hidden life','Discover two new landmarks.',2,'discoveries'],['hunt','Feed the colony','Consume or defeat eight organisms.',8,'kills'],['dash','Ride the open water','Cover 2400 distance while swimming fast.',2400,'sprintDistance'],['elder','Bring down an ancient','Ancients hold territories out in the open water. Each has a name, and each drops a Rare or better mutation. A vault warden counts too; its vault is its prize.',1,'elders']];
      const d=defs[s.objectiveIndex%defs.length];s.objective={id:s.objectiveIndex,kind:d[0],title:d[1],description:d[2],progress:0,target:d[3]+(d[0]==='forage'?Math.min(s.player.stage,10)*2:0),reward:0,scoreReward:100,biomassReward:0,stat:d[4],start:s.stats[d[4]]||0};
    }
    // A completed field study leaves a lead: the nearest undiscovered rare place, otherwise a nearby unexplored landmark.
    _studyLead(){
      const s=this.state,p=s.player,cx=Math.floor(p.x/CHUNK),cy=Math.floor(p.y/CHUNK),known=id=>{const rec=s.landmarkRecords[id],live=s.landmarks.find(v=>v.id===id);return !!(rec&&(rec.discovered||rec.claimed)||live&&(live.discovered||live.claimed));};
      let rare=null,rareD=Infinity,other=null,otherD=Infinity;
      for(let r=0;r<=7;r++)for(let x=cx-r;x<=cx+r;x++)for(let y=cy-r;y<=cy+r;y++){if(Math.max(Math.abs(x-cx),Math.abs(y-cy))!==r)continue;const l=this._landmarkFor(x,y);if(!l||l.type==='sanctum'||known(l.id))continue;const d=distance(l,p);if(d<l.r+300)continue;
        if(RARE_LANDMARKS.includes(l.type)){if(d<rareD){rareD=d;rare=l;}}else if(r<=3&&d<otherD&&['geneCache','nest','carcass','garden','bloom'].includes(l.type)){otherD=d;other=l;}}
      const l=rare||other;return l?{id:l.id,x:l.x,y:l.y,r:l.r,type:l.type,rare:!!rare}:null;
    }
    _checkObjective(){const s=this.state,o=s.objective;if(!o)return;o.progress=Math.min(o.target,Math.max(0,s.stats[o.stat]-o.start));if(o.progress>=o.target){s.stats.objectives++;s.score+=o.scoreReward;const biomassReward=Math.round(this._divisionShare(.03)*gapWorth(waterLevel(s.player.x,s.player.y)-s.player.stage));s.lead=this._studyLead();this._event('objective',{title:o.title,reward:0,scoreReward:o.scoreReward,biomassReward,id:o.id,lead:s.lead?{rare:s.lead.rare,dx:s.lead.x-s.player.x,dy:s.lead.y-s.player.y}:null});s.objectiveIndex++;this._newObjective();this._grantBiomass(biomassReward);}}
    _derive(){
      const p=this.state.player,t=p.traits,u=p.attributes,power=k=>t[k]+Math.log2(1+p.mastery[k])*.35;
      const g=power('venomist'),h=power('predator'),w=power('riptide'),d=power('summoner'),k=power('stalker'),growth=8*Math.log2(1+p.stage);
      const F=bodyScale(p.stage+1);p.sizeScale=F;p.r=22*F;p.cellCount=p.stage+1;p.cellExponent=Math.log2(p.cellCount);p.cellCountText=String(p.cellCount);p.colonyLevel=p.stage+1;
      p.maxHp=(100+u.vitality*12)*Math.pow(F,SIZE_POWER);p.maxEnergy=(100+w*10+u.reserves*12)*(1+.06*this._pk('twinNucleus'));
      p.speed=clamp((144+w*19)*(1+u.mobility*.06),95,300)*Math.pow(F,.45);if(this._hasMutation('chitinPlates'))p.speed*=.94+.02*Math.min(3,this._pk('chitinPlates'));p.speed*=1+.08*this._mp('keelFin');
      // Every body gets a usable Pulse: reach is measured past the membrane and grows with each division,
      // so a bigger cell never ends up hitting only what it touches. Hunters keep their edge through darts and +3.5/rank.
      p.attack=11*(1+u.power*.08)*Math.pow(F,SIZE_POWER);
      // Reach depends on the kind of attack. Shots and dashes (reachBase) gain the full 10% per point of Reach. A jab or a bite is
      // made with the body, so it gains only 3% per point, and a bite reaches a little over one body length: short, but the hardest-hitting strike.
      const reachBase=110*Math.pow(F,.85)*(1+u.reach*.10),touchBase=110*Math.pow(F,.85)*(1+u.reach*.05),biteReach=p.r*2.6*(1+u.reach*.05);
      p.pulseRadius=p.r+touchBase;
      p.feedRadius=p.r+(16+u.reach*6)*F;
      p.pulseCost=18;p.pulseCooldownMax=.68;
      // Strike shape and its numbers. Traits (other families' ranks) are applied on hit, not here.
      p.strike=this._strikeShape();const weapon=this._weapon(),wp=weapon?this._mp(weapon):1,wk=weapon?this._pk(weapon):0;
      if(p.strike==='venomist'){p.pulseCost*=.75*(1-.10*wk);p.pulseCooldownMax=.42;p.strikeReach=p.r+reachBase*2.4;p.strikeWidth=1;p.strikeDamage=.8*wp;}
      else if(p.strike==='predator'){p.pulseCooldownMax=.54*(1-.08*wk);p.strikeReach=p.r+biteReach;p.strikeWidth=0;p.strikeDamage=3*wp;}
      else if(p.strike==='spikes'){p.pulseCost*=.18;p.pulseCooldownMax=.13*(1-.08*wk);p.strikeReach=p.r+reachBase*1.8;p.strikeWidth=1;p.strikeDamage=.3*wp;}
      else if(p.strike==='spores'){p.pulseCooldownMax=.7*(1-.08*wk);p.strikeReach=p.r+reachBase*1.15;p.strikeWidth=7;p.strikeDamage=.6*wp;}
      else if(p.strike==='stalker'){p.pulseCooldownMax=.8*(1-.08*wk);p.strikeReach=p.r+reachBase*4;p.strikeWidth=0;p.strikeDamage=1.35*wp;}
      else{p.strikeReach=p.pulseRadius;p.strikeWidth=0;p.strikeDamage=1;}p.parryWindow=.9;p.parryRadius=p.r+28*F;p.blockCost=10;p.blockCooldownMax=1.9;
      p.sprintDrain=Math.max(12,25-w*1.25-u.mobility*.35);p.sprintSpeed=p.speed*(2.25+w*.035);p.sprintDrain*=1-Math.min(.6,.25*this._mp('whipFlagellum'));p.sprintSpeed*=1+.04*this._pk('whipFlagellum');p.sprintDrain*=1-.08*Math.min(3,this._pk('keelFin'));p.sprintSpeed*=1+.15*this._mp('jetSac');p.effectiveSprintDrain=p.sprintDrain;
      p.regeneration=p.maxHp*(.0045+u.recovery*.0012);p.energyRegeneration=17+w*2.2+u.recovery*1.5;
      p.resistance=.15*this._mp('chitinPlates');{const tn=this._mp('twinNucleus');p.maxHp*=1+.2*tn;p.regeneration*=1+.25*tn;}p.nutritionDrain=.75+Math.min(p.stage,8)*.12;
      p.concealRate=(1.45+k*.3)*(this._fork('stalker',2)==='a'?1.3:1);p.sneakDrain=Math.max(.7,3.5-k*.35)*(1-.12*Math.min(3,this._pk('lateralLine')));p.landmarkSense=(260+u.reach*25)*(1+.5*this._mp('eyespot'));
      // Class numbers that change during play (Frenzy, Momentum) are applied where they are used; these are the caps.
      {const vr=t.venomist,br=t.summoner,pr=t.predator;p.venomMax=vr>=3?8:5;p.frenzyMax=pr>=5?7:pr>=3?5:pr>=1?3:0;p.broodMax=br<=0?0:Math.min(7,(br>=5?4:br>=3?3:2)+(this._fork('summoner',4)==='a'?1:0)+Math.floor((p.mastery.summoner||0)/2));p.momentumMax=t.riptide>=3?5:3;}p.maxNutrition=this._hasMutation('gorgerStomach')?150:100;p.nutrition=Math.min(p.nutrition,p.maxNutrition);
      p.assimilation=.5;p.mutationSlots=BODY_PARTS.filter(b=>p.stage>=b.stage).length;
      p.criticalChance=.18*this._mp('keenEdge')+.03*this._pk('eyespot')+.04*this._pk('mimicSkin');p.critChance=p.criticalChance;
      for(const family of FAMILIES){const def=ABILITIES[family],rank=p.traits[family];p.abilityCosts[family]=Math.max(16,def.cost-Math.max(0,rank-1)*2);p.abilityCooldownMax[family]=Math.max(6,def.cooldown-Math.max(0,rank-1)*.5)*(1-.08*this._mp('echoChamber'));p.abilityCosts[family]*=1-.06*Math.min(3,this._pk('echoChamber'));}
    }
    // Rank limit: two more than your divisions, up to 10; from 31 cells (STAT_DEEP_STAGE) every stat can reach 12.
    attributeCap(){return attributeCap(this.state.player.stage);}
    buyAttribute(key){
      const p=this.state.player,def=Object.hasOwn(ATTRIBUTES,key)&&ATTRIBUTES[key];if(!def||this.state.status!=='playing'||p.attributes[key]>=this.attributeCap()||p.skillPoints<1)return false;
      const hp=p.maxHp,en=p.maxEnergy;p.attributes[key]++;p.skillPoints--;this._derive();p.hp=Math.min(p.maxHp,p.hp+Math.max(0,p.maxHp-hp));p.energy=Math.min(p.maxEnergy,p.energy+Math.max(0,p.maxEnergy-en));this._recoverEnergy();
      this._event('upgrade',{key,name:def.name,rank:p.attributes[key],cost:1});return true;
    }
    refundAttributes(){
      const s=this.state,p=s.player,total=Object.values(p.attributes).reduce((n,v)=>n+v,0);if(!s.paused||s.bossEncounter||s.status!=='playing'||p.hp<p.maxHp-.01||p.energy<p.maxEnergy-.01||p.exhausted||total===0)return false;
      const energyRatio=p.energy/p.maxEnergy,hp=p.hp;p.attributes=Object.fromEntries(Object.keys(ATTRIBUTES).map(k=>[k,0]));p.skillPoints+=total;this._derive();p.hp=Math.min(hp,p.maxHp);p.energy=p.maxEnergy*energyRatio;this._recoverEnergy();this._event('respec',{points:total});return true;
    }
    previewAttribute(key){
      if(!Object.hasOwn(ATTRIBUTES,key))return null;const p=this.state.player;if(p.attributes[key]>=this.attributeCap())return null;
      const ghost=Object.create(MorphosGame.prototype);ghost.state={player:{...p,attributes:{...p.attributes,[key]:p.attributes[key]+1},abilityCosts:{...p.abilityCosts},abilityCooldownMax:{...p.abilityCooldownMax}}};ghost._derive();return ghost.state.player;
    }
    // Strength of an equipped mutation: 0 when it is not equipped, otherwise its tier's power (Rare = 1).
    _mp(key){const p=this.state.player;return p.mutations.includes(key)?TIER_POWER[p.mutationTiers[key]??2]:0;}
    // The extra effect a mutation gains at Rare, stronger at Epic and Legendary; 0 below Rare or when not equipped.
    _pk(key){const p=this.state.player;if(!p.mutations.includes(key))return 0;const t=p.mutationTiers[key]??2;return t<2?0:PERK_POWER[t-2];}
    mutationTier(key){const t=this.state.player.mutationTiers[key];return t===undefined?-1:t;}
    // Ramming jaw: a ram also bites.
    _ramBite(){if(!this._hasMutation('ramJaw'))return 0;const p=this.state.player;p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.01*this._pk('ramJaw'));return p.attack*.65*this._mp('ramJaw');}
    _hasMutation(key){return this.state.player.mutations.includes(key);}
    // Can this mutation be given at this tier? A Legendary-only one needs a Legendary gift; a duo needs rank II in both its classes.
    _mutationOpen(key,tier){const m=MUTATIONS[key];if(!m)return false;if((m.minTier||0)>=4&&tier<4)return false;const t=this.state.player.traits;return !m.duo||m.duo.every(f=>(t[f]||0)>=2);}
    equipMutation(key){
      const s=this.state,p=s.player;if(s.status!=='playing'||(!s.paused&&!s.pendingEvolution)||s.bossEncounter||!p.unlockedMutations.includes(key))return false;
      const i=p.mutations.indexOf(key),part=BODY_PARTS.find(b=>b.key===MUTATIONS[key].part);if(i>=0)p.mutations.splice(i,1);else{if(!part||p.stage<part.stage)return false;const j=p.mutations.findIndex(k=>MUTATIONS[k].part===part.key);if(j>=0)p.mutations.splice(j,1);p.mutations.push(key);}if(!this._hasMutation('storedImpact'))p.impactCharge=0;this._derive();p.pulseCooldown=Math.min(p.pulseCooldown,p.pulseCooldownMax);p.hp=Math.min(p.hp,p.maxHp);p.energy=Math.min(p.energy,p.maxEnergy);this._event('mutation',{key,name:MUTATIONS[key].name,equipped:i<0});return true;
    }
    // A mutation can only be earned once the body part that holds it has grown.
    // Take a found mutation: new ones are added, better ones replace your copy, the rest are absorbed as a little growth.
    _findMutation(key,tier,source=''){
      const s=this.state,p=s.player;if(!Object.hasOwn(MUTATIONS,key))return false;tier=clamp(Math.max(Math.floor(tier),MUTATIONS[key].minTier||0),0,4);const had=p.mutationTiers[key];
      if(had!==undefined&&had>=tier){this._grantBiomass(Math.round(this._divisionShare(.02*(tier+1))));this._event('mutationAbsorbed',{key,name:MUTATIONS[key].name,tier});return false;}
      p.mutationTiers[key]=tier;if(had===undefined)p.unlockedMutations.push(key);this._derive();
      this._effect(p.x,p.y,'mutation',p.r*2.5,TIER_COLOURS[tier],.9);this._event('mutationUnlocked',{key,name:MUTATIONS[key].name,tier,upgrade:had!==undefined,source});return true;
    }
    // A kill you earned may drop its creature's mutation. Each dry kill of that creature raises the chance a little;
    // bigger and rarer creatures roll better tiers.
    _dropChance(o){
      const p=this.state.player,src=o.species||o.kind,own=DROP_FROM[src],fresh2=o.elder?1:0;if(o.elder)return 1;const keys=own&&own.length?own:null;if(!keys)return 0;
      const sp=o.species?SPECIES[o.species]:null,rarity=sp?sp.rarity:'common',pity=p.dropPity[src]||0,fresh=keys.some(k=>MUTATIONS[k].weapon&&p.mutationTiers[k]===undefined);
      return Math.min(1,(fresh?Math.max(.25,DROP_CHANCE[rarity]):DROP_CHANCE[rarity])*(1+pity*(fresh?.5:.2)));
    }
    _rollDrop(o){
      if(o.noDrop)return;
      const s=this.state,p=s.player,src=o.species||o.kind,own=DROP_FROM[src],fresh2=o.elder?Object.keys(MUTATION_SOURCE).filter(k=>!(SPECIES[MUTATION_SOURCE[k]]&&SPECIES[MUTATION_SOURCE[k]].rarity==='legendary')&&!MUTATIONS[k].duo&&(MUTATIONS[k].minTier||0)<4):null,unfound=fresh2?fresh2.filter(k=>p.mutationTiers[k]===undefined):null,keys=own&&own.length?own:fresh2?(unfound.length?unfound:fresh2):null;if(!keys||o.split||o.bossId)return;const key=keys.find(k=>MUTATIONS[k].weapon&&p.mutationTiers[k]===undefined)||keys[Math.floor(this.random()*keys.length)];
      const sp=o.species?SPECIES[o.species]:null,rarity=sp?sp.rarity:'common',pity=p.dropPity[src]||0,fresh=!!MUTATIONS[key].weapon&&p.mutationTiers[key]===undefined,chance=Math.min(1,(fresh?Math.max(.25,DROP_CHANCE[rarity]):DROP_CHANCE[rarity])*(1+pity*(fresh?.5:.2)));
      // In co-op the player who lands the kill decides whether it drops, and tells the others (_dropForce), so everyone who helped gets one or nobody does.
      if(!o.elder&&!(o._dropForce!==undefined?o._dropForce:o.forceDrop||this.random()<chance)){if(DROP_FROM[src])p.dropPity[src]=Math.min(60,pity+1);return;}
      let tier=0,roll=this.random()*100;for(const w of [50,28,14,6,2]){if(roll<w)break;roll-=w;tier++;}if(o.elder)tier=Math.max(2,tier+1);
      const luck=o.elder?0:clamp((o.r/Math.max(1,p.r)-1.6)*1.3,0,2)+(rarity==='rare'?.5:rarity==='legendary'?1.5:0);tier=Math.min(4,tier+Math.floor(luck+this.random()));
      // The water decides how good a copy can be: Uncommon at best in levels 1-6, Rare to 12, Epic to 18, Legendary below that. An elder's is one better.
      tier=Math.min(tier,Math.min(4,1+Math.floor(waterLevel(o.x,o.y)/6)+(o.elder?1:0)));
      // A mutation exists only from its minimum rarity; where the water cannot give that rarity it does not drop.
      {const need=MUTATIONS[key].minTier||0,cap=Math.min(4,1+Math.floor(waterLevel(o.x,o.y)/6)+(o.elder?1:0));if(need>cap||need>=4&&tier<4||!this._mutationOpen(key,Math.max(tier,need))){if(DROP_FROM[src])p.dropPity[src]=Math.min(60,pity+1);return;}tier=Math.max(tier,need);}
      // A copy no better than the one you hold never appears (v35.6): no glint, no notice, no growth. Bad-luck protection keeps counting.
      if(p.mutationTiers[key]!==undefined&&p.mutationTiers[key]>=tier){if(DROP_FROM[src])p.dropPity[src]=Math.min(60,pity+1);return;}
      delete p.dropPity[src];
      s.drops.push({id:this._id++,x:o.x,y:o.y,key,tier,source:sp?sp.name:KIND_NAMES[o.kind]||'creature',life:60});if(s.drops.length>12)s.drops.shift();
      this._effect(o.x,o.y,'mutation',Math.min(10000,o.r*2.2),TIER_COLOURS[tier],.9);this._event('mutationDropped',{key,tier,x:o.x,y:o.y});
    }
    // A dropped mutation waits a minute where its creature died; swim over it to take it.
    _drops(dt){
      const s=this.state,p=s.player;if(!s.drops.length)return;
      for(const d of s.drops){d.life-=dt;if(d.life>0&&distance(d,p)<p.r+26){d.life=0;this._findMutation(d.key,d.tier,d.source);}}
      s.drops=s.drops.filter(d=>d.life>0);
    }
    _spendEnergy(amount){const p=this.state.player;if(p.exhausted||p.energy+1e-9<amount)return false;p.energy=Math.max(0,p.energy-amount);if(p.energy<1)this._exhaust();return true;}
    _exhaust(){
      const p=this.state.player;if(p.exhausted)return;p.energy=0;p.exhausted=true;p.sprinting=false;p.sneaking=false;p.recoveryProgress=0;this._effect(p.x,p.y,'exhausted',p.r*1.8,'#f1a49a',.6);this._event('exhausted');
      if(this._hasMutation('secondWind')&&p.secondWindCooldown<=0){p.secondWindTime=1.8*this._mp('secondWind');p.secondWindCooldown=35-5*this._pk('secondWind');this._effect(p.x,p.y,'secondWind',p.r*2.2,'#8cdef2',.8);this._event('secondWind');}
    }
    _recoverEnergy(){const p=this.state.player;p.recoveryProgress=p.exhausted?p.energy/p.maxEnergy:1;if(p.exhausted&&p.energy>=p.maxEnergy-1e-7){p.energy=p.maxEnergy;p.exhausted=false;p.recoveryProgress=1;this._event('recovered');}}
    _breakStealth(duration=1.7){const p=this.state.player;p.stealth=0;p.concealCooldown=duration;p.veilTime=0;}
    _creditAmbush(evidence){
      const s=this.state,p=s.player;this._xp('stalker',evidence);s.stats.ambushes++;
      if(this._hasMutation('shadowMetabolism')&&p.shadowMetabolismCooldown===0){const before=p.energy;p.energy=Math.min(p.maxEnergy,p.energy+12*this._mp('shadowMetabolism'));p.concealCooldown=Math.min(p.concealCooldown,.6);p.shadowMetabolismCooldown=8;this._recoverEnergy();this._effect(p.x,p.y,'shadowMetabolism',p.r*1.8,'#c4b3f0',.6);this._event('shadowMetabolism',{energy:p.energy-before});}
    }
    _special(aimX,aimY,requested){
      // Every class's ability works from the start in a weaker novice form; ranks make it stronger. An ability costs
      // more stamina and waits far longer than a Strike, so even the novice form out-hits one Strike.
      const s=this.state,p=s.player,trait=requested,rank=p.traits[trait]||0,novice=rank?1:.75,size=this._sizePower();
      if(!Object.hasOwn(ABILITIES,trait)||!this.awakened(trait)||p.abilityCooldowns[trait]>0||!this._spendEnergy(p.abilityCosts[trait]))return false;
      p.abilityCooldowns[trait]=p.abilityCooldownMax[trait];p.specialActiveTrait=trait;if(this._hasMutation('echoNucleus'))p.echoUntil=s.time+4+this._pk('echoNucleus');s.stats.specials++;
      const a=Math.atan2(aimY-p.y,aimX-p.x),colour={venomist:'#b7ef91',predator:'#efba8d',riptide:'#95dafa',summoner:'#f3d48c',stalker:'#b9aceb'}[trait];
      if(trait==='venomist'||trait==='summoner'||trait==='predator'){p.angle=a;p.faceAngle=a;p.faceTime=.45;}
      if(trait==='venomist'){
        p.specialTime=.6;p.refugeCombatTime=3;this._breakStealth();const count=(rank?3:2)+(this._fork('venomist',2)==='a'?2:0),token=this._id++,stacks=1+(rank>=3?1:0);
        for(let i=0;i<count;i++){const dir=a+(i-(count-1)/2)*.13;s.projectiles.push({id:this._id++,x:p.x+Math.cos(dir)*(p.r+8),y:p.y+Math.sin(dir)*(p.r+8),vx:Math.cos(dir)*400,vy:Math.sin(dir)*400,r:5+rank,life:1.2+rank*.1,damage:(8+rank*4)*size*novice*(1+p.attributes.power*.08),venom:stacks,rupture:rank>=1,seek:true,family:'venomist',attackToken:token+i,owner:'player',colour});}
      }
      if(trait==='predator'){const reach=(260+rank*30)*(rank?1:.8);p.pounceTime=.26;p.pounceDamage=p.attack*this._classPower('predator')*(2.4+rank*.4)*(rank>=5?1.25:1)*novice;p.surgeTime=0;p.vx=Math.cos(a)*reach/.26;p.vy=Math.sin(a)*reach/.26;p.angle=a;p.invulnerable=Math.max(p.invulnerable,.2);p.specialTime=.26;this._breakStealth();}
      if(trait==='riptide'){
        // Whirlpool: a vortex where you are. Wide pull reaches further and holds bigger creatures; Grinding current hurts what it holds;
        // Maelstrom hurts what the release throws; Eye of the storm is checked while you are inside it; rank V grips a boss for 1 s.
        const wide=this._fork('riptide',2)==='a',R=(p.r+170)*(wide?1.35:1)*(rank?1:.85),life=(3+(rank>=3?1:0))*(rank?1:.75),power=p.attack*this._classPower('riptide');
        if(!s.vortices)s.vortices=[];s.vortices=s.vortices.filter(v=>v.remote);
        {const eddy=this._hasMutation('wanderingEddy');s.vortices.push({wid:this._id++,x:p.x,y:p.y,R:eddy?R*.75*(1+.1*this._pk('wanderingEddy')):R,follow:eddy,life,maxLife:life,holdR:p.r*(wide?1:.8),grind:this._fork('riptide',2)==='b'?power*.5:0,slam:this._fork('riptide',4)==='a'?power*1.6:0,grip:rank>=5?1:0,spin:0,tick:.5});}
        p.specialTime=life;this._breakStealth();this._event('whirlpool',{x:p.x,y:p.y});
      }
      if(trait==='summoner'){
        p.swarmTime=(3.5+rank*.5)*(this._fork('summoner',4)==='a'?2:1);p.specialTime=p.swarmTime;let temps=s.brood.filter(b=>b.life>0).length;while(temps<2){this._bud(10+rank*2);temps++;}
        let best=null,bd=280;for(const o of s.organisms){if(o.dead)continue;const d=Math.hypot(o.x-aimX,o.y-aimY)-(isHostile(o)?60:0);if(d<bd){bd=d;best=o;}}
        const boss=s.bossEncounter;if(boss&&Math.hypot(boss.x-aimX,boss.y-aimY)<boss.r+200)best=boss;if(best)p.broodTargetId=best.id;
      }
      if(trait==='stalker'){
        p.specialTime=(5+rank*1.3)*novice*(this._fork('stalker',4)==='a'?1.5:1);p.veilTime=(2.0+rank*.35)*novice;p.stealth=1;p.concealCooldown=0;
        const count=rank>=3?2:1;for(let i=0;i<count;i++){const direction=p.angle+Math.PI+(i===0?-.45:.45);s.decoys.push({x:p.x+Math.cos(direction)*(p.r+18),y:p.y+Math.sin(direction)*(p.r+18),r:p.r*.9,life:p.specialTime,maxLife:p.specialTime,angle:direction,phase:this.range(0,TAU)});}s.decoys=[...s.decoys.filter(d=>d.remote),...s.decoys.filter(d=>!d.remote).slice(-2)];
        if(this._hasMutation('phantomBrood')){const n=Math.round(1.3*this._mp('phantomBrood'));for(let i=0;i<n;i++)this._bud(p.specialTime);p.energy=Math.min(p.maxEnergy,p.energy+4*this._pk('phantomBrood'));}
      }
      if(s.projectiles.length>80)s.projectiles.splice(0,s.projectiles.length-80);
      this._effect(p.x,p.y,'special',p.r*3,colour,.6,{self:true});this._particles(p.x,p.y,colour,12,80);this._event('special',{trait,rank});return true;
    }
    _event(type,fields={}){if(this._events.length<100)this._events.push({type,...fields});}
    drainEvents(){const e=this._events;this._events=[];return e;}
    _food(x,y,kind='algae',value,home,biome){
      const f={id:this._id++,x,y,r:kind==='protein'?5.5:kind==='mineral'?5:3.7+this.random()*1.6,kind,value:(value===undefined?(kind==='mineral'?1.25:kind==='protein'?2:1):value)*waterPower(x,y),phase:this.range(0,TAU),home:home||this._home(x,y),biome:biome===undefined?this._biomeAt(x,y):biome};
      if(this.state.foods.length<Math.round(1100*Math.min(3,this._areaScale())))this.state.foods.push(f);return f;
    }
    _organism(kind,x,y,options={}){
      const spec=options.species&&SPECIES[options.species]?SPECIES[options.species]:null;if(spec)kind=spec.base;
      const tier=options.tier===undefined?this._tierAt(x,y):options.tier;
      const defs={prey:[9,15,9,77],grazer:[18,27,24,64],hunter:[33,45,48,146],armoured:[24,34,62,75],apex:[78,87,205,133],swarmer:[11,15,16,178],sentinel:[30,38,90,26],jelly:[26,34,60,60]};
      const d=spec?[spec.r[0],spec.r[1],spec.hp,spec.speed??defs[kind][3]]:defs[kind],r=this.range(d[0],d[1])+(spec?0:kind==='hunter'?tier*4:kind==='apex'?tier*5:kind==='swarmer'?tier:kind==='sentinel'?tier*3:0);
      const zone=waterLevel(x,y),k=options.scale??this._spawnScale(kind,x,y),bulk=heft(r*k,options.young?this.state.player.r:22*bodyScale(zone+1)),level=options.young?0:Number.isFinite(options.level)?options.level:zone,maxHp=d[2]*(1+tier*.22)*Math.pow(k,SIZE_POWER)*Math.pow(bulk,1.1)*(HOSTILE_KINDS.includes(kind)?wildTough(level):1),a=this.range(0,TAU);
      const o={id:this._id++,x,y,vx:Math.cos(a)*d[3]*.3,vy:Math.sin(a)*d[3]*.3,angle:a,r:r*k,scale:k,hp:maxHp,maxHp,kind,home:options.home||this._home(x,y),biome:options.biome===undefined?this._biomeAt(x,y):options.biome,tier,
        hue:{hunter:4,apex:330,armoured:41,prey:185,swarmer:345,sentinel:48,jelly:230}[kind]??113,anchorX:x,anchorY:y,phase:this.range(0,TAU),flash:0,dead:false,speed:d[3]*Math.pow(k,.45),tx:Math.cos(a),ty:Math.sin(a),wander:this.range(.3,2),cooldown:this.range(.3,1.2),flee:0,stun:0,charge:0,ramAt:-5,credit:0,pursuit:0,lastSeenX:x,lastSeenY:y,huntCredit:0,stalkCredit:0,lastFamily:'',venomStacks:0,attackTokens:[],slowTime:0,elite:'',windup:0,windupMax:.75,attackAngle:a,attackRange:0,attackWidth:r*1.4,attackKind:'',attackMode:'idle',lungeTime:0,lungeMax:.4,recoverTime:0,recoverMax:1.15,attackDamage:0,attackHit:false};o.attackWidth=o.r*1.4;o.might=wildMight(level);o.lv=options.young?this.state.player.stage:level;
      if(spec)o.species=options.species;
      if(!spec&&kind==='hunter'&&length(x,y)>1100&&this.random()<Math.min(.35,.11+tier*.05)&&!options.plain){o.elite='lancer';o.maxHp*=1.55;o.hp=o.maxHp;o.r*=1.12;o.speed*=1.08;o.cooldown=4.5;o.hue=34;}
      if(this.state.organisms.length>=this._orgCap()){const p=this.state.player;let index=-1,far=-1;this.state.organisms.forEach((v,i)=>{if(!v.nestId&&distance(v,p)>far){far=distance(v,p);index=i;}});if(index<0){index=0;this.state.organisms.forEach((v,i)=>{if(distance(v,p)>far){far=distance(v,p);index=i;}});}this.state.organisms.splice(index,1);}
      o.stamina=this._profile(o).capacity;o.exhausted=false;o.fedTime=0;o.targetId=-1;o.foraging=false;
      this.state.organisms.push(o);this._markFresh(o);return o;
    }
    // The size a newly appearing creature is built at, against the player's current size: mostly the same
    // generation as you, sometimes a smaller one (easy food) or a larger one (danger). Once born it keeps its size.
    _spawnScale(kind,x,y){const F=Number.isFinite(x)?waterScale(x,y):(this.state.player.sizeScale||1),roll=this.random(),crowd=Math.min(COOP_PARTY_CAP,this._partyNear()),small=.2-COOP_FEWER_SMALL*crowd,large=.14+COOP_MORE_LARGE*crowd;const m=roll<small?this.range(.45,.7):roll<1-large?this.range(.88,1.12):this.range(1.22,1.5);return Math.max(.5,F*m);}
    _effect(x,y,kind,r,colour,life=.5,fields={}){this.state.effects.push({x,y,r:0,maxR:r,life,maxLife:life,kind,colour,...fields});if(this.state.effects.length>36)this.state.effects.shift();
      // Co-op: the other players see my strikes and hits too, when one of them is near enough to.
      const c=this.coop;if(c){for(const q of c.peers.values())if(q.body&&length(q.body.x-x,q.body.y-y)<COOP_SIGHT){this._net(q.id,{t:'e',e:{x:Math.round(x),y:Math.round(y),maxR:Math.round(r),life,kind,colour,...fields}});}}
    }
    _particles(x,y,colour,count=8,speed=55){const list=this.state.particles;for(let i=0;i<count&&list.length<280;i++){const a=this.range(0,TAU),v=this.range(speed*.3,speed),life=this.range(.35,.85);list.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life,maxLife:life,r:this.range(1.4,3.8),colour,kind:'mote'});}}
    _gain(value,kind){
      // Growth keeps its pace with a smaller body: a colony sweeps up less food each second than it used to, so each piece builds
      // more biomass as it grows (matching what the old, wider body gathered). Kills use the same rule, which also pays for tougher prey.
      const s=this.state,p=s.player,cells=Math.min(p.stage+1,MAX_BODY_CELLS),pace=Math.pow(cells,(.5-BODY_GROWTH)*1.45);s.biomass+=value*p.assimilation*pace;
      p.combo=s.time-this._lastEat<2.4?Math.min(12,p.combo+1):1;this._lastEat=s.time;s.score+=Math.round(value*8)+Math.min(p.combo,6);
      // Refills (nutrition, stamina, the small algae heal) follow the food's own kind, not how deep it grew: deep food is worth more growth, not more filling.
      const raw=value/waterPower(p.x,p.y);
      p.nutrition=Math.min(p.maxNutrition,p.nutrition+raw*(kind==='protein'?6:kind==='algae'?3.2:1.8));
      if(kind==='algae'||kind==='protein')p.feedingRecovery=6;
      // Eating feeds growth and recovery only; it earns no class experience.
      if(kind==='algae')p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.0015*Math.min(raw,3));
      else if(kind==='protein')p.energy=Math.min(p.maxEnergy,p.energy+raw*1.6);
      else p.energy=Math.min(p.maxEnergy,p.energy+5);
      this._recoverEnergy();if(!s.pendingEvolution&&s.biomass>=s.nextDivision)this._divide();
    }
    _divide(){
      const s=this.state,p=s.player;if(s.biomass<s.nextDivision||!this._growthAllowed())return false;
      const strikeFrom=p.strike||this._strikeShape(),fromCellsText=p.cellCountText,fromStage=p.stage;let points=0,divisions=0;
      while(divisions<32&&s.biomass>=s.nextDivision&&this._growthAllowed()){
        p.stage++;divisions++;p.growthBlockedStage=-1;
        const healthRatio=p.hp/p.maxHp,energyRatio=p.energy/p.maxEnergy;this._derive();p.hp=p.maxHp*healthRatio;p.energy=p.maxEnergy*energyRatio;this._recoverEnergy();p.invulnerable=Math.max(p.invulnerable,1.2);p.evolution=3.2;
        points+=this._awardPoints(1,'evolution');s.score+=150+p.stage*50;
        s.divisionFrom=s.nextDivision;s.nextDivision=nextThreshold(p.stage);
        if(p.stage===4){s.score+=750;this._event('milestone',{title:'A colony takes shape',cells:p.cellCount,description:'Five cells now. Something vast will notice you at six.'});}
      }
      if(s.pendingChoice)s.pendingChoice.stage=p.stage;this._awaken('summoner','division');
      
      this._effect(p.x,p.y,'division',p.r*4,'#b0ffdb',1.5);this._particles(p.x,p.y,'#b0ffdb',28,140);
      this._event('divided',{divisions,fromStage,stage:p.stage,fromCellsText,cells:p.cellCount,cellCountText:p.cellCountText,colonyLevel:p.colonyLevel,points,strikeFrom,strikeTo:p.strike});return true;
    }
    // A family whose next rank is a fork it has not chosen, with enough experience banked to take it.
    forkReady(f){const p=this.state.player,next=(p.traits[f]||0)+1;return FAMILIES.includes(f)&&(next===2||next===4)&&!p.forks[f+next]&&p.evidence[f]>=this.rankCost(f);}
    // Every experience gain passes through here. The rates even out how fast each family's focused
    // play earns experience (measured with play-style bots), so no family is the quick route to ranks.
    _xp(f,amount){if(amount>0)this.state.player.evidence[f]+=amount*XP_RATE[f];}
    // ---- Classes: shared helpers ----
    // A class's ability appears once something in the pond wakes it (first kill, first division, ...).
    // An ability wakes once its class's deed has been done enough times (WAKE_NEEDS), not the first time.
    _awaken(f,reason,amount=1){const p=this.state.player;if(!p.awakened)p.awakened=[];if(p.awakened.includes(f))return;if(!p.wake)p.wake={};p.wake[f]=(p.wake[f]||0)+amount;if(p.wake[f]<WAKE_NEEDS[f])return;p.awakened.push(f);this._event('awaken',{trait:f,reason});}
    awakened(f){const p=this.state.player;return (p.traits[f]||0)>0||(p.awakened||[]).includes(f);}
    // Damage over time (poison, bleeding) earns its class experience like a hit, with the same per-creature cap.
    _classDamage(o,amount,fam){if(amount<=0)return;o.credit=Math.min(9999,o.credit+amount);o.lastFamily=fam;const credit=Math.min(amount*.30,Math.max(0,18-(o.huntCredit||0)));if(credit>0){this._xp(fam,credit);o.huntCredit=(o.huntCredit||0)+credit;}}
    // What a kill does for the class that made it.
    _classKill(o,consumed){
      const s=this.state,p=s.player,fam=o.lastFamily;
      if(fam==='predator'&&p.frenzyMax>0){p.frenzy=p.frenzyTime>0?Math.min(p.frenzyMax,p.frenzy+1):1;p.frenzyTime=4;if(p.frenzy>1)this._event('frenzy',{stacks:p.frenzy});}
      if(fam==='summoner'&&this._fork('summoner',4)==='b')p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.03);
      if(fam==='stalker'&&this._hybrid('ambusher'))p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.05);
      if(o.pounced&&p.abilityCooldowns.predator>0){o.pounced=false;p.abilityCooldowns.predator=this._fork('predator',4)==='a'?0:p.abilityCooldowns.predator*.5;}
    }
    _frenzyBoost(){const p=this.state.player;return 1+(p.frenzy||0)*.08;}
    // Riptide: moving fast enough for a close call to count.
    _fastNow(){const p=this.state.player;return p.sprinting||(p.pounceTime||0)>0;}
    _nearMissReach(){return 46+((this.state.player.traits.riptide||0)>=3?24:0);}
    _nearMiss(src){
      const s=this.state,p=s.player;if(s.time-(p.nearMissAt??-9)<.35)return;p.nearMissAt=s.time;
      this._awaken('riptide','nearMiss');p.momentum=Math.min(p.momentumMax||3,(p.momentum||0)+1);p.momentumTime=4;p.energy=Math.min(p.maxEnergy,p.energy+8);this._recoverEnergy();s.stats.nearMisses++;
      this._xp('riptide',25);if(this._hybrid('ghostCurrent')){p.stealth=Math.max(p.stealth,.7);p.concealCooldown=0;}
      this._effect(p.x,p.y,'special',p.r*1.8,'#95dafa',.35);this._event('nearMiss',{momentum:p.momentum,x:src.x,y:src.y});
    }
    // Venomist: poison stacks. Each stack adds damage over time; stacks fade together when the poison runs out.
    // Aim assist for precision Strikes: the creature (or elder) nearest the aim line within a narrow cone.
    _aimAssist(angle,reach,cone){
      const s=this.state,p=s.player,list=s.organisms.filter(o=>!o.dead);if(s.bossEncounter)list.push(s.bossEncounter);let best=null,score=cone;
      for(const o of list){const dx=o.x-p.x,dy=o.y-p.y,d=Math.hypot(dx,dy);if(d<1||d>reach+o.r)continue;const a=Math.atan2(dy,dx),off=Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle)))-Math.atan2(o.r,d);if(off<score){score=off;best={angle:a,id:o.id};}}
      return best;
    }
    // Venom globs curve gently towards a creature just ahead of them.
    _seekShot(shot,dt){
      const sp=Math.hypot(shot.vx,shot.vy)||1,dir=Math.atan2(shot.vy,shot.vx);let best=null,bd=170;
      // A locked shot (the Needle) follows only its own target, and stops seeking once it has passed it.
      if(shot.seekId){const s=this.state,b=s.bossEncounter;best=b&&b.id===shot.seekId?b:s.organisms.find(o=>o.id===shot.seekId&&!o.dead)||null;if(best&&((best.x-shot.x)*shot.vx+(best.y-shot.y)*shot.vy)<0)best=null;if(!best){shot.seek=false;return;}}
      else for(const o of this.state.organisms){if(o.dead)continue;const dx=o.x-shot.x,dy=o.y-shot.y,d=Math.hypot(dx,dy);if(d>bd)continue;const off=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-dir),Math.cos(Math.atan2(dy,dx)-dir)));if(off<1){bd=d;best=o;}}
      if(!best)return;const want=Math.atan2(best.y-shot.y,best.x-shot.x),diff=Math.atan2(Math.sin(want-dir),Math.cos(want-dir)),turn=clamp(diff,-3.2*dt,3.2*dt);shot.vx=Math.cos(dir+turn)*sp;shot.vy=Math.sin(dir+turn)*sp;
    }
    // Health, Strike damage and creature health all grow with body size to the power 1.1. Flat damage numbers are
    // multiplied by this so that they keep their worth as the body grows.
    _sizePower(){return Math.pow(this.state.player.sizeScale||1,SIZE_POWER);}
    _venomTick(){const p=this.state.player,r=p.traits.venomist||0;return ((1.2+r*.6)*this._sizePower()*(1+p.attributes.power*.08)+p.attack*.04)*(r>=3?1.3:1)*(r>=5?1.25:1);}
    _addVenom(o,n){
      const p=this.state.player;if(!o||o.dead||n<=0)return;const before=o.venomStacks||0;o.venomStacks=Math.min(p.venomMax||5,before+n);if(o.venomStacks>before)this._xp('venomist',(o.venomStacks-before)*2.5);
      o.poison=Math.min(10,Math.max(o.poison||0,4*(this._fork('venomist',2)==='b'?2:1)));o.poisonDamage=Math.min(1000,Math.max(o.poisonDamage||0,o.venomStacks*this._venomTick()));
    }
    _rupture(o){
      const s=this.state,p=s.player,stacks=o.venomStacks||0;if(!stacks||o.dead)return;const r=p.traits.venomist||0,share=this._fork('venomist',4)==='a'?stacks:Math.ceil(stacks/2);
      o.venomStacks=0;o.poison=0;o.poisonDamage=0;s.stats.ruptures++;this._xp('venomist',4+stacks*2);const token=this._id++;
      this._hit(o,stacks*((4+r*2)*this._sizePower()*(1+p.attributes.power*.08)+p.attack*this._classPower('venomist')*.15),0,0,{token,noCritical:true,family:'venomist'});
      for(const v of s.organisms){if(v===o||v.dead||v.bossId||distance(v,o)>o.r+v.r+110)continue;this._addVenom(v,share);}
      this._effect(o.x,o.y,'burst',o.r+110,'#b7ef91',.5);this._particles(o.x,o.y,'#c9f08f',14,120);this._event('rupture',{stacks,x:o.x,y:o.y});
    }
    // Brood: daughter cells that follow you and fight what you strike. Permanent broodlings bud back over time;
    // Swarm adds short-lived ones. Broodlings are not saved: they bud back when a life is loaded.
    _broodStats(){const p=this.state.player,r=p.traits.summoner||0,soldier=this._fork('summoner',2)==='a';return{hp:(18+r*8)*this._sizePower()*(soldier?1.6:1),damage:p.attack*this._classPower('summoner')*(.2+.01*r)*(soldier?1.4:1)*(r?1:.75),r:Math.max(7,p.r*.26)};}
    _bud(life){
      const s=this.state,p=s.player,st=this._broodStats(),a=this.random()*TAU;
      s.brood.push({id:this._id++,x:p.x+Math.cos(a)*(p.r+st.r+4),y:p.y+Math.sin(a)*(p.r+st.r+4),vx:0,vy:0,r:st.r,hp:st.hp,maxHp:st.hp,life,cd:.4,phase:a});
      this._particles(p.x+Math.cos(a)*p.r,p.y+Math.sin(a)*p.r,'#f3d48c',6,40);
    }
    // Whirlpools: your own and (in co-op) friends'. Each acts on the creatures this device runs: smaller ones are pulled in and held,
    // bigger ones slowed, food drawn in; at the end everything inside is thrown outward. A friend's whirlpool earns you nothing.
    _vortexTick(dt){
      const s=this.state,p=s.player;if(!s.vortices)s.vortices=[];if(!s.vortices.length)return;
      for(const v of s.vortices){
        if(v.follow&&!v.remote&&p.alive){v.x=p.x;v.y=p.y;}v.life-=dt;v.spin=(v.spin||0)+dt;const ending=v.life<=0,mine=!v.remote;v.tick=(v.tick??.5)-dt;const grindNow=v.grind>0&&v.tick<=0;if(v.tick<=0)v.tick+=.5;
        for(const o of [...s.organisms]){if(o.dead||o.puppet||o.bossId||o.denT)continue;const dx=v.x-o.x,dy=v.y-o.y,d=Math.hypot(dx,dy)||1;if(d>v.R+o.r*.5)continue;
          if(ending){o.vx=-dx/d*420;o.vy=-dy/d*420;o.x-=dx/d*16;o.y-=dy/d*16;o.vortexHeld=0;if(v.slam>0)this._hit(o,v.slam,-dx/d,-dy/d,{family:mine?'riptide':'',noCritical:true});if(s.pendingEvolution)return;continue;}
          if(o.r<=v.holdR){const pull=Math.min(d,(120+260*(1-d/v.R))*dt),swirl=Math.min(1,d/40)*90*dt;o.x+=dx/d*pull-dy/d*swirl;o.y+=dy/d*pull+dx/d*swirl;o.vx*=.5;o.vy*=.5;
            o.vortexHeld=s.time+.25;o.stun=Math.max(o.stun||0,.25);if(o.windup>0||o.lungeTime>0)this._recoverAttack(o);
            if(grindNow){this._hit(o,v.grind*.5,0,0,{family:mine?'riptide':'',noCritical:true});if(s.pendingEvolution)return;}
            if(mine)p.whirlHeld=(p.whirlHeld||0)+dt;
            if(mine&&this._hasMutation('venomEddy')){o.eddy=(o.eddy||0)+dt*this._mp('venomEddy')*(1+.2*this._pk('venomEddy'));if(o.eddy>=1){o.eddy-=1;this._addVenom(o,1);}}}
          else o.slowTime=Math.max(o.slowTime||0,.25);
        }
        for(const f of s.foods){const dx=v.x-f.x,dy=v.y-f.y,d=Math.hypot(dx,dy);if(d<v.R&&d>4){const pull=Math.min(d,200*dt);f.x+=dx/d*pull;f.y+=dy/d*pull;}}
        const b=s.bossEncounter;if(b&&!b.puppet&&!ending&&Math.hypot(b.x-v.x,b.y-v.y)<v.R+b.r*.6){if(v.grip>0){v.grip-=dt;b.gripped=true;}else b.slowed=true;}
      }
      if((p.whirlHeld||0)>=1){const n=Math.floor(p.whirlHeld);p.whirlHeld-=n;this._xp('riptide',3*n);}
      for(const v of s.vortices)if(v.remote&&v.life<=0)(this._wpGone||(this._wpGone=new Set())).add(Math.round(v.x)+','+Math.round(v.y)+':'+Math.round(v.maxLife*10));
      s.vortices=s.vortices.filter(v=>v.life>0);
    }
    _eyeOfStorm(){const p=this.state.player;return this._fork('riptide',4)==='b'&&(this.state.vortices||[]).some(v=>!v.remote&&Math.hypot(v.x-p.x,v.y-p.y)<v.R);}
    _broodTick(dt){
      const s=this.state,p=s.player;if(!s.brood)s.brood=[];const r=p.traits.summoner||0,perm=s.brood.filter(b=>b.life<0).length;
      if(r>0&&perm<p.broodMax){if(this._broodRefill){for(let i=perm;i<p.broodMax;i++)this._bud(-1);}else{p.budTime=Math.max(0,p.budTime-dt);if(p.budTime<=0){this._bud(-1);p.budTime=(11-r)*(this._fork('summoner',2)==='b'?.6:1);}}}
      this._broodRefill=false;if(!s.brood.length)return;
      const boss=s.bossEncounter;let target=p.broodTargetId?(boss&&boss.id===p.broodTargetId?boss:s.organisms.find(o=>o.id===p.broodTargetId&&!o.dead)):null;
      if(target&&distance(target,p)>700){target=null;p.broodTargetId=0;}
      if(!target){let best=null,bd=230;for(const o of s.organisms){if(o.dead||!isHostile(o))continue;const d=distance(o,p);if(d<bd){bd=d;best=o;}}target=best;}
      const st=this._broodStats(),swarm=p.swarmTime>0,speed=(p.speed*1.3+40)*(swarm?1.5:1)*(p.sprinting&&this._hybrid('shoal')?1.8:1),bite=st.damage*(swarm?1.5:1)*(1+.2*this._mp('broodPheromone'));
      for(const b of s.brood){
        if(b.life>0){b.life-=dt;if(b.life<=0)b.hp=0;}b.cd-=dt;
        let gx,gy;if(target){gx=target.x;gy=target.y;}else{const a=b.phase+s.time*.9;gx=p.x+Math.cos(a)*(p.r+b.r+16);gy=p.y+Math.sin(a)*(p.r+b.r+16);}
        const dx=gx-b.x,dy=gy-b.y,d=length(dx,dy)||1,want=target?speed:Math.min(speed,d*4);
        b.vx+=(dx/d*want-b.vx)*Math.min(1,dt*5);b.vy+=(dy/d*want-b.vy)*Math.min(1,dt*5);b.x+=b.vx*dt;b.y+=b.vy*dt;
        if(target&&b.cd<=0&&distance(b,target)<b.r+target.r+5){b.cd=.75;const k=distance(b,target)||1;
          if(target===boss)this._hitBoss(bite,{noCritical:true,family:'summoner',brood:true});else{target.broodAggroUntil=s.time+4;this._hit(target,bite,(target.x-b.x)/k,(target.y-b.y)/k,{noCritical:true,family:'summoner'});if(target.dead&&this._hasMutation('packFeeding')){if(p.frenzyMax>0){p.frenzy=p.frenzyTime>0?Math.min(p.frenzyMax,p.frenzy+1):1;p.frenzyTime=4;}p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.013*this._mp('packFeeding'));p.energy=Math.min(p.maxEnergy,p.energy+3*this._pk('packFeeding'));}if(this._hybrid('sporeSwarm'))this._addVenom(target,1);}
          if(s.status!=='playing')return;}
        for(const o of s.organisms){if(o.dead||!isHostile(o))continue;if(distance(o,b)<o.r+b.r+2)b.hp-=(o.attackDamage||8)*(o.lungeTime>0||o.windup>0?1.5:.6)*dt;}
      }
      for(let i=s.brood.length-1;i>=0;i--){const b=s.brood[i];if(b.hp>0)continue;s.brood.splice(i,1);if(this._hasMutation('lastBreath')){for(const o of s.organisms){if(o.dead||o.bossId||distance(o,b)>b.r+o.r+60)continue;o.stun=Math.max(o.stun||0,.8*this._mp('lastBreath'));const k=Math.floor(this._pk('lastBreath'));if(k)this._addVenom(o,k);}this._effect(b.x,b.y,'burst',b.r+60,'#f3d48c',.35);}this._particles(b.x,b.y,'#f3d48c',8,70);
        if(this._fork('summoner',2)==='b'){for(const o of s.organisms)if(!o.dead&&!o.bossId&&distance(o,b)<b.r+o.r+70)this._addVenom(o,2);this._effect(b.x,b.y,'burst',b.r+70,'#b7ef91',.4);}}
    }
    // Predator: Pounce carries the cell forward until it meets something, then bites it.
    _pounceTick(){
      const s=this.state,p=s.player;if(!(p.pounceTime>0))return;
      const hitOrg=s.organisms.find(o=>!o.dead&&distance(o,p)<p.r+o.r+6),boss=s.bossEncounter,hitBoss=!hitOrg&&boss&&distance(boss,p)<p.r+boss.r*.8;
      if(!hitOrg&&!hitBoss){if(this._ff(v=>distance(v,p)<p.r+v.r+6,p.pounceDamage*this._frenzyBoost())){p.pounceTime=0;p.vx*=.25;p.vy*=.25;}return;}p.pounceTime=0;p.vx*=.25;p.vy*=.25;const dmg=p.pounceDamage*this._frenzyBoost();
      if(hitBoss){p.broodTargetId=boss.id;this._hitBoss(dmg,{family:'predator'});}
      else{const o=hitOrg,d=distance(o,p)||1;o.pounced=true;p.broodTargetId=o.id;this._hit(o,dmg,(o.x-p.x)/d,(o.y-p.y)/d,{family:'predator'});if(!o.dead){o.stun=Math.max(o.stun,.6);if(this._hybrid('venomFangs'))this._addVenom(o,2);if(this._hasMutation('rendingPounce')){o.bleed=Math.max(o.bleed||0,4+this._pk('rendingPounce'));o.bleedDamage=Math.min(1000,Math.max(o.bleedDamage||0,p.attack*.35*this._mp('rendingPounce')));}}else o.pounced=false;}
      this._effect(p.x+p.vx*.02,p.y+p.vy*.02,'critical',p.r*1.4,'#efba8d',.35);this._event('pounce',{});
    }
    rankCost(f){const p=this.state.player;return rankCost((p.traits[f]||0)+(p.mastery[f]||0));}
    // Spend banked experience on ranks. A family that reaches a fork (rank II or IV) waits there for the
    // player's choice, still banking experience, while play and divisions carry on.
    _checkRanks(){
      const s=this.state,p=s.player;if(s.status!=='playing')return false;let grew=false;
      for(let guard=0;guard<20;guard++){
        const ready=FAMILIES.filter(f=>p.evidence[f]>=this.rankCost(f)).sort((a,b)=>p.evidence[b]/this.rankCost(b)-p.evidence[a]/this.rankCost(a));let done=false;
        for(const f of ready){const next=p.traits[f]+1;
          if(next<=4&&(next===2||next===4)&&!p.forks[f+next]){if(!s.pendingChoice){s.pendingChoice={options:[f],nodes:[{trait:f,fork:'a'},{trait:f,fork:'b'}],stage:p.stage};this._event('evolutionChoice',{options:[f],nodes:s.pendingChoice.nodes});}continue;}
          this._rankUp(f,'',false);grew=true;done=true;break;}
        if(!done)break;
      }
      return grew;
    }
    _rankUp(trait,fork,chosen){
      const s=this.state,p=s.player,cost=this.rankCost(trait),strikeFrom=p.strike||this._strikeShape(),hybridsBefore=this.hybrids(),newAbilities=[];
      p.evidence[trait]=Math.max(0,p.evidence[trait]-cost);
      if(fork&&p.traits[trait]<4)p.forks[trait+(p.traits[trait]+1)]=fork;
      if(p.traits[trait]===0)newAbilities.push(trait);if(!p.awakened)p.awakened=[];if(!p.awakened.includes(trait))p.awakened.push(trait);if(p.traits[trait]<MAX_RANK)p.traits[trait]++;else p.mastery[trait]++;
      const newHybrids=this.hybrids().filter(k=>!hybridsBefore.includes(k));
      const healthRatio=p.hp/p.maxHp,energyRatio=p.energy/p.maxEnergy;this._derive();p.hp=p.maxHp*healthRatio;p.energy=p.maxEnergy*energyRatio;this._recoverEnergy();p.evolution=3.2;
      const rank=p.traits[trait],title=rankName(trait,rank,p.forks[trait+rank])+(p.mastery[trait]?' · Mastery '+p.mastery[trait]:'');
      const entry={cells:p.cellCount,cellCountText:p.cellCountText,colonyLevel:p.colonyLevel,trait,rank,fork:(rank===2||rank===4)&&!p.mastery[trait]?p.forks[trait+rank]||'a':'',hybrids:newHybrids,mastery:p.mastery[trait],title,reason:reasons[trait],points:0,milestone:false,chosen:!!chosen,cost,newAbility:newAbilities.length>0,newAbilities,strikeFrom,strikeTo:p.strike};
      s.evolutionLog.push(entry);if(s.evolutionLog.length>120)s.evolutionLog.shift();s.score+=100+rank*40;
      // The Strike shape breaks ties by the latest rank, so derive again now that this rank is in the log.
      {const hr=p.hp/p.maxHp,er=p.energy/p.maxEnergy;this._derive();p.hp=p.maxHp*hr;p.energy=p.maxEnergy*er;entry.strikeTo=p.strike;}
      this._effect(p.x,p.y,'division',p.r*3,'#ffe9a8',1.2);this._particles(p.x,p.y,'#ffe9a8',20,120);this._event('evolve',entry);return entry;
    }
    // The nodes a division can take from these families: the next rank, or both sides of a fork.
    // A boss knows where I am (knowsMe = 1) whenever it can see me (I am not concealed and am within its sight) and whenever I hit it.
    // While I stay concealed it loses track of me, faster the further away I am, and quickly while it is going for one of my decoys. Only a boss that has lost track of me can be ambushed.
    _bossUnaware(b){return Number.isFinite(b.knowsMe)&&b.knowsMe<.3;}
    _bossSenses(b,dt){const p=this.state.player;if(!b||!p.alive)return;const d=Math.hypot(p.x-b.x,p.y-b.y),hidden=p.stealth>.65;
      if(!Number.isFinite(b.knowsMe))b.knowsMe=1;if(!hidden&&d<b.r*6+1400)b.knowsMe=1;else if(hidden){const lured=this.state.decoys.some(q=>q.life>0&&distance(q,b)<b.r*3);b.knowsMe=Math.max(0,b.knowsMe-dt*(lured?1.2:clamp(d/(b.r*6+600),.15,1)));}}
    _ambushBonus(){return ((this.state.player.traits.stalker||0)>=5?1.35:1)*(this._fork('stalker',2)==='b'?1.3:1)*(this._hybrid('ambusher')?1.4:1)*(1+.1*this._pk('shadowMetabolism'))*(1+.15*this._mp('mimicSkin'));}
    hybrids(){const t=this.state.player.traits;return Object.keys(HYBRIDS).filter(k=>HYBRIDS[k].families.every(f=>(t[f]||0)>=2));}
    _hybrid(k){const h=HYBRIDS[k],t=this.state.player.traits;return !!h&&h.families.every(f=>(t[f]||0)>=2);}
    _fork(f,rank){const p=this.state.player;return (p.traits[f]||0)>=rank&&p.forks?p.forks[f+rank]||'':'';}
    chooseEvolution(trait,fork=''){
      const s=this.state;if(s.status!=='playing'||!FAMILIES.includes(trait)||fork!=='a'&&fork!=='b')return false;
      if(!fork||!this.forkReady(trait))return false;
      if(s.pendingChoice&&s.pendingChoice.options[0]===trait)s.pendingChoice=null;this._rankUp(trait,fork,true);this._checkRanks();return true;
    }
    acknowledgeEvolution(){if(!this.state.pendingEvolution)return false;this.state.pendingEvolution=null;return true;}
    _blockedDamage(amount){const s=this.state,p=s.player;if(amount<=0)return;s.stats.blockedDamage+=amount;if(this._hasMutation('storedImpact'))p.impactCharge=Math.min(40*this._sizePower()*this._mp('storedImpact'),p.impactCharge+amount*.6);}
    _reflect(source,amount){
      if(!this._hasMutation('barbedShell')||!source||amount<=0)return;amount*=this._mp('barbedShell');const s=this.state,p=s.player,id=source.sourceId||source.id,b=s.bossEncounter;
      if(b&&id===b.id){this._hitBoss(amount,{defence:true,noCritical:true});s.stats.reflections++;this._event('reflect',{amount});return;}
      const o=s.organisms.find(v=>!v.dead&&v.id===id);if(!o||distance(o,p)>600)return;const d=distance(o,p)||1;this._hit(o,amount,(o.x-p.x)/d,(o.y-p.y)/d,{defence:true,noCritical:true});if(!o.dead)o.stun=Math.max(o.stun,.25*this._pk('barbedShell'));s.stats.reflections++;
      this._effect(o.x,o.y,'reflect',o.r*1.5,'#f0d898',.45);this._event('reflect',{amount});
    }
    _block(aimX,aimY){
      const p=this.state.player;if(p.blockCooldown>0||p.exhausted||p.energy<p.blockCost)return false;
      if(!this._spendEnergy(p.blockCost))return false;
      p.blockCooldown=p.blockCooldownMax;p.parryTime=p.parryWindow;p.parryAngle=pulseAngle(p,aimX,aimY);p.parryRefunded=false;
      p.refugeCombatTime=3;this._breakStealth(.7);return true;
    }
    // Block: the whole body hardens for a moment, from every side. It cuts the damage of whatever lands
    // (it never cancels it) and refunds some stamina once per block. Barbed shell
    // throws part of the blow back at the attacker.
    _hardenReduction(){return .65;}
    _hardenHit(source,amount){
      const s=this.state,p=s.player;if(!(p.parryTime>0)||amount<=0)return amount;
      const cut=this._hardenReduction(),blocked=amount*cut,g=1,reflected=this._hasMutation('barbedShell');s.stats.parries++;this._blockedDamage(blocked);
      if(!p.parryRefunded){p.energy=Math.min(p.maxEnergy,p.energy+8);p.parryRefunded=true;this._recoverEnergy();}
      const id=source&&(source.sourceId||source.id),target=!source?null:s.bossEncounter&&s.bossEncounter.id===id?s.bossEncounter:s.organisms.find(o=>!o.dead&&o.id===id);
      const from=source&&Number.isFinite(source.x)?source:target,d=from?distance(from,p)||1:1,ux=from?(from.x-p.x)/d:Math.cos(p.angle||0),uy=from?(from.y-p.y)/d:Math.sin(p.angle||0);
      if(target&&target!==s.bossEncounter&&!source.sourceId&&distance(target,p)<target.r+p.r+60){target.stun=Math.max(target.stun,.35);if(target.lungeTime>0)this._recoverAttack(target);target.vx+=ux*120;target.vy+=uy*120;if(reflected)this._hit(target,amount*(.35+g*.1),ux,uy,{defence:true,noCritical:true});}
      else if(target===s.bossEncounter&&reflected&&!source.sourceId)this._hitBoss(amount*(.35+g*.1),{defence:true,noCritical:true});
      this._effect(p.x+ux*p.r,p.y+uy*p.r,reflected?'parryReflect':'parry',p.r*1.3,reflected?'#f0d898':'#d8cfb8',.36);this._event('parry',{blocked,reflected,count:1,x:p.x+ux*p.r,y:p.y+uy*p.r});
      return amount-blocked;
    }
    _damagePlayer(amount,source){
      const s=this.state,p=s.player;if(p.invulnerable>0||p.phaseShieldTime>0||s.status!=='playing')return;if(this._hasMutation('glassSkin')&&p.stealth>.65&&amount>0){this._breakStealth(Math.max(.5,1.7-.3*this._pk('glassSkin')));p.invulnerable=.5;this._effect(p.x,p.y,'special',p.r*2,'#dff6ff',.35);this._event('glassGlance',{});return;}if(source){const src=source.sourceId?s.organisms.find(o=>o.id===source.sourceId):source;if(src&&(src.kind==='jelly'||src.species==='puffer'))this._awaken('venomist','stung');}{const src=source&&(source.sourceId?s.organisms.find(o=>o.id===source.sourceId):source);if(src&&Number.isFinite(src.lv)&&!src.bossId&&src.kind!=='boss')amount*=gapTake(src.lv-p.stage);if(s.bossEncounter&&(source&&(source.kind==='boss'||source.bossId!==undefined)||src&&src.bossId!==undefined))s.bossEncounter.lastBlow=s.time;}amount=this._hardenHit(source,amount);if(source&&source.poison>0)amount*=1-Math.min(.4,.08*this._pk('causticGland'));amount*=1-Math.min(.3,.03*this._pk('broodPheromone')*s.brood.length);
      const escape=this._eyeOfStorm()?.3:0,base=amount*(1-p.resistance)*(1-escape);
      if(this._hasMutation('fissionHeart')&&p.fissionCooldown<=0&&p.hp-base<=p.maxHp*.25){p.fissionShieldTime=3*this._mp('fissionHeart');p.fissionCooldown=45;p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.06*this._pk('fissionHeart'));this._effect(p.x,p.y,'special',p.r*2.5,'#edb3c0',.8);this._event('fissionShield');}
      const damage=base*(p.fissionShieldTime>0?.3:1),blocked=amount-damage;p.hp=Math.max(0,p.hp-damage);p.hurt=.45;p.invulnerable=1.1;p.stillTime=0;p.photosynthesising=false;
      const attacker=source&&(s.organisms.some(o=>o.id===(source.sourceId||source.id))||s.bossEncounter&&s.bossEncounter.id===(source.sourceId||source.id));
      if(attacker){this._blockedDamage(blocked);this._reflect(source,damage*.2+blocked*.5);}
      if(this._hasMutation('clingingSlime')){const src=source&&(source.sourceId?s.organisms.find(o=>o.id===source.sourceId):s.organisms.includes(source)?source:null);if(src&&!src.dead&&!src.bossId)src.slowTime=Math.min(2,Math.max(src.slowTime||0,1.5*this._mp('clingingSlime')+.3*this._pk('clingingSlime')));}
      this._effect(p.x,p.y,'hit',p.r*1.8,'#ff8b91',.4);this._particles(p.x,p.y,'#f4a7ba',9,60);p.regenDelay=5;this._event('hit',{target:'player',amount:damage});
      if(source){const dx=p.x-source.x,dy=p.y-source.y,d=length(dx,dy)||1;p.vx+=dx/d*90;p.vy+=dy/d*90;}
      if(p.hp<=0){p.alive=false;s.status='dead';p.deathCause=source&&source.species&&SPECIES[source.species]?(/^[AEIOU]/.test(SPECIES[source.species].name)?'An ':'A ')+SPECIES[source.species].name.toLowerCase():source&&source.bossType?BOSSES[source.bossType].name:source&&source.kind==='toxin'?'The toxic bloom':source&&source.kind==='vent'?'A mineral vent':source&&source.kind==='apex'?'An apex organism':source&&source.kind==='jelly'?'A stinging jelly':source&&source.kind==='sentinel'?'A reef sentinel':source&&source.kind==='swarmer'?'A swarm':source&&source.gulp?'Being swallowed whole':source&&source.elite?'A lancer':source&&source.kind==='friend'?'A friend':'A larger predator';this._particles(p.x,p.y,'#a8ead2',45,130);this._event('death',this.getSummary());}
    }
    // "assist" is a kill made on another player's device that mine also hurt: I take my rewards, but the remains
    // and anything else it leaves in the water are the killer's to make.
    _kill(o,consumed=false,assist=false){
      if(o.dead)return;o.dead=true;const s=this.state,p=s.player;
      // Co-op: growth is earned. A creature I never touched, finished by another player, pays me nothing.
      const coop=this.coop,earned=!coop||assist||consumed||o.credit>0||!o.remoteCredit;
      if(coop){coop.gone.set(o.id,coop.clock);if(!assist){if(o._dropForce===undefined&&!o.noDrop&&!o.bossId&&!o.split){o._dropForce=!!o.forceDrop||this.random()<this._dropChance(o);}this._net(-1,{t:'k',id:o.id,d:o._dropForce?1:0});}}
      const b=s.bossEncounter;if(b&&b.type==='brood'&&o.bossId===b.id&&bossExposure(s).exposed)this._event('bossExposed',{bossType:b.type,x:b.x,y:b.y});
      const sp=o.species?SPECIES[o.species]:null,values={prey:3,grazer:6,hunter:16,armoured:12,apex:48,swarmer:3,sentinel:14,jelly:9},value=(sp?sp.value:values[o.kind])*this._tierValue(o.tier)*Math.pow(o.scale||1,SIZE_POWER*1.15/1.1)*Math.sqrt(heft(o.r,this.state.player.r));
      if(earned){s.stats.kills++;s.score+=sp?(sp.score||RARITY_SCORE[sp.rarity]):({apex:400,hunter:100,sentinel:120,jelly:60,swarmer:25})[o.kind]??35;
      if(!o.bossId&&isHostile(o))s.stats.hostileKills++;
      if(consumed&&p.stealth>.60){this._breakStealth(1.2);if(isHostile(o))this._creditAmbush(36+value*.2);}
      this._particles(o.x,o.y,o.kind==='hunter'||o.kind==='apex'?'#f4a6bd':'#c9eeca',consumed?10:18,consumed?45:95);
      this._effect(o.x,o.y,'eat',o.r*1.6,'#c2ffd7',.35);
      // Class experience follows how hard the kill was, not how big you have grown: the size factor that
      // scales food with your body is taken back out, so ranks don't speed up as you grow.
      if(o.credit>0&&o.lastFamily)this._xp(o.lastFamily,value*1.5/Math.pow(this.state.player.sizeScale||1,SIZE_POWER*1.15/1.1));if(o.credit>0){this._awaken('predator','kill');if(o.kind==='jelly'||o.species==='puffer')this._awaken('venomist','venomKill');}if(!o.bossId)this._classKill(o,consumed);if(this._hasMutation('scavenger')){p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.04*this._mp('scavenger'));p.energy=Math.min(p.maxEnergy,p.energy+4*this._pk('scavenger'));}if(o.elite){s.stats.elites++;const reward=this._challengeReward();s.score+=250;this._event('eliteDefeated',{name:'Lancer',reward,rewardSource:reward?'challenge':'',scoreReward:250});}
      if(o.credit>0)this._rollDrop(o);
      this._elderFell(o);
      if(o.elder&&earned){s.stats.elders=(s.stats.elders||0)+1;s.score+=400;if(!/^(vault|wonder):/.test(String(o.elderHome||'')))this._thread('hunters');this._event('elderSlain',{name:o.elderName,x:o.x,y:o.y,count:s.stats.elders,marked:String(o.elderHome||'').startsWith('bounty:')});}
      if(consumed&&this._hasMutation('bileSac')){const n=Math.round(2*this._mp('bileSac'));for(const v of s.organisms)if(v!==o&&!v.dead&&!v.bossId&&distance(v,p)<p.r+v.r+90)this._addVenom(v,n);p.energy=Math.min(p.maxEnergy,p.energy+5*this._pk('bileSac'));this._effect(p.x,p.y,'burst',p.r+90,'#c9e08f',.4);}
      if(consumed&&this._hasMutation('devourerGullet')){p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.05*this._mp('devourerGullet'));p.energy=Math.min(p.maxEnergy,p.energy+6*this._pk('devourerGullet'));}if(consumed&&this._hasMutation('engulfingMembrane')){p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.03*this._mp('engulfingMembrane'));const em=this._pk('engulfingMembrane');if(em)for(const f of FAMILIES)p.abilityCooldowns[f]=Math.max(0,p.abilityCooldowns[f]-em);}if(this._hasMutation('regrowingOrgans'))for(const f of FAMILIES)p.abilityCooldowns[f]=Math.max(0,p.abilityCooldowns[f]-1.5*this._mp('regrowingOrgans'));p.energy=Math.min(p.maxEnergy,p.energy+3*this._pk('regrowingOrgans'));
      if(sp&&sp.challenge){s.stats.elites++;let reward=0;for(let i=0;i<sp.challenge;i++)reward+=this._challengeReward();this._event('eliteDefeated',{name:sp.name,species:o.species,rarity:sp.rarity,reward,rewardSource:reward?'challenge':'',scoreReward:sp.score||RARITY_SCORE[sp.rarity]});}this._gain(value*(o.bossId?.3:1)*(o.elder?4:1)*(Number.isFinite(o.lv)&&!o.bossId?gapWorth(o.lv-p.stage):1)*(this.coop&&!o.bossId?clamp((o.credit||0)/Math.max(1,o.maxHp)*1.25,.08,1):1)*(consumed||assist?1:.55),'protein');}else this._particles(o.x,o.y,'#c9eeca',14,80);
      if(!consumed&&!assist){const n=sp&&sp.rarity==='legendary'?14:sp&&sp.rarity==='rare'?6:3,spread=15+(n>3?o.r*.35:0);for(let i=0;i<n;i++){const a=i*TAU/n;this._food(o.x+Math.cos(a)*spread,o.y+Math.sin(a)*spread,sp&&sp.drops?sp.drops:o.kind==='armoured'||o.kind==='sentinel'?'mineral':'protein',value*(n>3?.6/n*3:.15)/waterPower(o.x,o.y),o.home,o.biome);}}
      if(sp&&sp.escort)for(const v of s.organisms)if(v.leaderId===o.id){v.leaderId=0;v.flee=3;v.pursuit=0;}
      // Splitter: the first death divides it into two smaller copies that do not split again.
      if(sp&&sp.splits&&!o.split&&!consumed&&!assist)for(const side of [-1,1]){const a=(o.angle||0)+side*Math.PI/2,c=this._organism(o.kind,o.x+Math.cos(a)*o.r*.6,o.y+Math.sin(a)*o.r*.6,{species:o.species,home:o.home,biome:o.biome,tier:o.tier});c.split=true;c.r=o.r*.66;c.maxHp=c.hp=o.maxHp*.35;c.flee=.4;c.vx=Math.cos(a)*120;c.vy=Math.sin(a)*120;}
      this._nestKill(o);
      if(earned)this._event('kill',{kind:o.kind,species:o.species||'',elite:o.elite||'',boss:!!o.bossId,value,consumed});
    }
    // Where a blow lands. 'travel' is the direction the attack is moving; 'facing' is where the target faces (along its attack while
    // it winds up or lunges). A blow to the face does normal damage, rising smoothly to +15% on the side and +30% from straight behind.
    _rearFactor(facing,tx,ty){const l=Math.hypot(tx,ty);if(!(l>0)||!Number.isFinite(facing))return {k:1,dot:-1};const dot=(Math.cos(facing)*tx+Math.sin(facing)*ty)/l;return {k:1+REAR_BONUS*(1+dot)/2,dot};}
    _hit(o,amount,dx,dy,options={}){
      if(o.dead)return false;const s=this.state,p=s.player;if(o.denT)return false;if(o.elder)o.hurtAt=s.time;
      if(options.token!==undefined){if(o.attackTokens.includes(options.token))return false;o.attackTokens.push(options.token);if(o.attackTokens.length>8)o.attackTokens.shift();}
      if(Number.isFinite(o.lv)&&!o.bossId)amount*=gapDeal(p.stage-o.lv);
      if((o.slowTime||0)>0)amount*=1+.08*this._pk('undertow');
      if((o.venomStacks||0)>=3&&this._hasMutation('numbingVenom'))amount*=1+.05*this._mp('numbingVenom')+.05*this._pk('numbingVenom');
   if(((o.venomStacks||0)>0||(o.poison||0)>0)&&this._hasMutation('pitOrgan'))amount*=1+.1*this._mp('pitOrgan')+.05*this._pk('pitOrgan');
      if(o.hp<o.maxHp*.5)amount*=1+.12*this._mp('bloodScent');else if(o.hp>=o.maxHp*.9)amount*=1+.06*this._pk('bloodScent');
      if(!options.defence&&o.kind!=='jelly'){const f=this._rearFactor((o.windup>0||o.lungeTime>0)&&Number.isFinite(o.attackAngle)?o.attackAngle:o.angle,dx,dy);amount*=f.k;if(f.dot>.6)this._event('rearHit',{x:o.x,y:o.y});}
      const critical=!options.noCritical&&p.criticalChance>0&&this.random()<p.criticalChance;if(critical){amount*=1.8+.15*this._pk('keenEdge');s.stats.criticals++;this._effect(o.x,o.y,'critical',o.r*1.8,'#f4ce82',.45);this._event('critical',{amount});}
      amount*=o.kind==='armoured'?(o.recoverTime>0?1.35:.4):o.kind==='sentinel'?(o.recoverTime>0?1.4:.35):1;const sp=o.species?SPECIES[o.species]:null;if(sp&&sp.armour)amount*=sp.armour;if(sp&&(sp.rarity==='rare'||sp.rarity==='legendary')&&!options.defence&&this._hasMutation('abyssalHeart'))amount*=1+.3*this._mp('abyssalHeart');const actual=Math.min(Math.max(0,o.hp),amount);o.hp-=amount;if(this.coop&&!o.puppet&&!options.defence)o.threatMine=(o.threatMine||0)+actual;if(!options.defence&&!options.dot){const ll=this._mp('leechLining');if(ll){p.hp=Math.min(p.maxHp,p.hp+actual*.04*ll);if(!p.exhausted)p.energy=Math.min(p.maxEnergy,p.energy+actual*.02*this._pk('leechLining'));}}o.flash=.22;const hostile=isHostile(o);o.stun=Math.max(o.stun,hostile?.10:.18);if(!o.bossId&&o.hp<o.maxHp*.2)o.flee=.7;
      if(!options.defence){const fam=options.stalk?'stalker':options.family||'';o.credit=Math.min(9999,o.credit+actual);if(fam)o.lastFamily=fam;if(fam&&!options.noXp){const credit=Math.min(actual*.30,Math.max(0,18-(o.huntCredit||0)));this._xp(fam,credit);o.huntCredit=(o.huntCredit||0)+credit;o.lastFamily=fam;}}
      const push=hostile?45:90;o.vx+=dx*push;o.vy+=dy*push;this._event('hit',{target:'enemy',amount,critical});if(o.latchTime>0)o.latchTime=0;
      if(!options.defence&&actual>0&&o.hp>0&&this._hasMutation('serratedJaws')){o.poison=Math.max(o.poison||0,3);o.poisonDamage=Math.min(1000,Math.max(o.poisonDamage||0,actual*.1*this._mp('serratedJaws')));const sj=this._pk('serratedJaws');if(sj)o.slowTime=Math.max(o.slowTime||0,.5*sj);}
      if(sp&&o.hp>0){
        // Murk: once, below half health, it blinks away in ink.
        if(sp.blink&&!o.blinked&&o.hp<o.maxHp*.5){if(o.windup>0||o.lungeTime>0)this._recoverAttack(o);const a=Math.atan2(o.y-p.y,o.x-p.x)+this.range(-.6,.6);this._particles(o.x,o.y,'#2a2340',26,80);o.x+=Math.cos(a)*190;o.y+=Math.sin(a)*190;o.vx=o.vy=0;o.blinked=true;o.flee=2.2;o.cloak=2.4;this._event('blink',{x:o.x,y:o.y});}
        // Thornback: striking its spines up close costs some health, except while it recovers from a charge.
        if(sp.thorns&&!options.defence&&o.recoverTime===0&&actual>0&&distance(o,p)<o.r+p.r+140)this._damagePlayer(Math.min(30*Math.pow(o.scale||1,SIZE_POWER),actual*sp.thorns),o);
      }
      if(o.hp<=0)this._kill(o);return true;
    }
    // Strongest family (rank + mastery) sets the Strike shape; ties go to the most recently evolved of them.
    _strikeShape(){
      // The weapon in the Strike organ decides it; with none, the plain Jab ('pulse'). Lineage plays no part.
      const key=this._weapon();return key?MUTATIONS[key].weapon:'pulse';
    }
    _weapon(){return this.state.player.mutations.find(k=>MUTATIONS[k]&&MUTATIONS[k].weapon)||'';}
    // What lineage adds to abilities (never to the Strike): Predator and Riptide ranks make pounces, venom, broodlings and rams hit harder.
    // A class move's strength: attack × its own class's power (rank, plus a little for mastery). One base for every class move.
    _classPower(f){const p=this.state.player,pw=(p.traits[f]||0)+Math.log2(1+(p.mastery[f]||0))*.35;return 1+pw*3.5/11;}
    // Class ranks no longer colour the Strike: a strike is the weapon, and the weapon alone.
    _strikeTraits(){const out={};for(const f of FAMILIES)out[f]=0;return out;}
    strikeColour(){
      const p=this.state.player;let total=0,c=[0,0,0];for(const f of FAMILIES){const w=(p.traits[f]||0)+(p.mastery[f]||0);total+=w;for(let i=0;i<3;i++)c[i]+=FAMILY_RGB[f][i]*w;}
      if(!total)return'#b5f6e5';return'#'+c.map(v=>Math.round(v/total).toString(16).padStart(2,'0')).join('');
    }
    _unaware(o){if(this._hasMutation('numbingVenom')&&(o.venomStacks||0)>=3)return true;if(o.elder&&o.hp<o.maxHp)return false;return!(o.chasing&&o.targetId===0)&&!(o.windup>0)&&!(o.lungeTime>0);}
    // One Strike hit on an organism, with every trait applied. ctx carries the strike's shared state.
    _strikeHit(o,dx,dy,ctx){
      const s=this.state,p=s.player,tr=ctx.traits;if(o.dead)return false;
      let dmg=ctx.damage*(1+tr.predator*.06);const unaware=this._unaware(o);
      if(unaware&&tr.stalker)dmg*=1+tr.stalker*.2;if(unaware&&ctx.shape==='stalker')dmg*=1.8;
      if(ctx.ambush)dmg*=unaware?this._ambushBonus():1/1.65;
      if(ctx.ambush&&unaware&&!ctx.ambushCredited&&isHostile(o)){this._creditAmbush(40);ctx.ambushCredited=true;}
      const family=FAMILIES.includes(ctx.family)?ctx.family:'predator';
      if(ctx.shape==='riptide'&&p.momentum>0){dmg*=1+p.momentum*.25;ctx.momentumUsed=true;}
      const landed=this._hit(o,dmg,dx,dy,{token:ctx.token,stalk:!!ctx.ambush,family});if(!landed)return false;ctx.struck.push(o);
      if(this._hasMutation('undertow'))o.slowTime=Math.min(2,1.5*this._mp('undertow'));
      if(tr.summoner||ctx.shape==='summoner'||s.brood.length)p.broodTargetId=o.id;
      if(ctx.shape==='predator'){
        // Devour: a bite finishes creatures much smaller than you outright.
        const gullet=this._fork('predator',2)==='b',limit=(gullet?.75:.55)+(.15*Math.min(1.3,this._mp('engulfingMembrane')));
        if(!o.dead&&!o.bossId&&o.kind!=='sentinel'&&o.r<p.r*limit){o.hp=0;this._kill(o,true);p.hp=Math.min(p.maxHp,p.hp+p.maxHp*(gullet?.06:.02));this._event('devour',{});}
        if(!o.dead&&this._fork('predator',2)==='a'){o.bleed=3;o.bleedDamage=Math.min(1000,Math.max(o.bleedDamage||0,p.attack*.12));}
        if(this._fork('predator',4)==='b'&&p.frenzyMax&&p.frenzy>=p.frenzyMax)p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.015);
        if(!o.dead&&this._hybrid('venomFangs'))this._addVenom(o,2);
      }
      if(!o.dead&&(ctx.shape==='venomist'||tr.venomist))this._addVenom(o,1);
      return true;
    }
    _spendMomentum(ctx){if(ctx&&ctx.momentumUsed){this.state.player.momentum=0;ctx.momentumUsed=false;}}
    _strikeBossHit(ctx){
      const s=this.state,b=s.bossEncounter;if(!b)return false;const tr=ctx.traits;let dmg=ctx.damage*(1+tr.predator*.06)*(ctx.ambush?(this._bossUnaware(b)?this._ambushBonus():1/1.65):1);if(tr.summoner||ctx.shape==='summoner'||s.brood.length)s.player.broodTargetId=b.id;
      // An exposed elder core is a weak point: precision Strikes treat it like an unaware target.
      if(bossExposure(s).exposed){if(ctx.shape==='stalker')dmg*=1.8;if(tr.stalker)dmg*=1+tr.stalker*.2;}
      if(ctx.shape==='predator'&&this._fork('predator',2)==='a'){b.bleed=3;b.bleedDamage=Math.max(b.bleedDamage||0,s.player.attack*.12);}const opts={ambush:ctx.ambush&&!ctx.ambushCredited,token:ctx.token,family:ctx.ambush?'stalker':FAMILIES.includes(ctx.family)?ctx.family:'predator'};if(tr.venomist||ctx.shape==='venomist'){b.venomStacks=Math.min(s.player.venomMax||5,(b.venomStacks||0)+1);opts.poison=4;opts.poisonDamage=b.venomStacks*this._venomTick();}
      const landed=this._hitBoss(dmg,opts);if(landed&&ctx.ambush)ctx.ambushCredited=true;return landed;
    }
    _chainFrom(struck){
      const s=this.state,p=s.player;if(!this._hasMutation('chainPulse')||p.chainCooldown>0||!struck.length)return;
      p.chainCooldown=3;let source=struck[0];const hit=new Set(struck.map(o=>o.id));
      for(let i=0;i<2+Math.floor(this._pk('chainPulse'));i++){const target=s.organisms.filter(o=>!o.dead&&!hit.has(o.id)&&distance(o,source)<190).sort((a,b)=>distance(a,source)-distance(b,source))[0];if(!target)break;const effect={x:target.x,y:target.y,x2:source.x,y2:source.y,r:0,maxR:target.r*1.8,life:.45,maxLife:.45,kind:'chain',colour:'#b3b5f0'};s.effects.push(effect);if(s.effects.length>36)s.effects.shift();const d=distance(target,source)||1;hit.add(target.id);this._hit(target,p.attack*.45*this._mp('chainPulse'),(target.x-source.x)/d,(target.y-source.y)/d,{noCritical:true});source=target;if(s.pendingEvolution)return;}
    }
    // Strike-organ mutations fire with every Strike, whatever its shape.
    // Strike-organ mutations count stamina spent on Strikes, not Strikes: one trigger per 18 stamina (one ordinary Strike),
    // so a rapid weapon such as the Spike gun triggers them no more often per stamina than any other.
    _strikeOrgans(angle){
      const s=this.state,p=s.player;p.organCharge=Math.min(36,(p.organCharge||0)+(p.pulseCost||18));if(p.organCharge<18-1e-6)return;p.organCharge-=18;
      if(this._hasMutation('sporeGland'))for(const off of [-.35,.35]){const dir=angle+off;s.projectiles.push({id:this._id++,x:p.x+Math.cos(dir)*(p.r+6),y:p.y+Math.sin(dir)*(p.r+6),vx:Math.cos(dir)*300,vy:Math.sin(dir)*300,r:6,life:1.1,damage:p.attack*.35*this._mp('sporeGland'),poison:2+this._pk('sporeGland'),poisonDamage:p.attack*.06,attackToken:this._id++,owner:'player',colour:'#e3b3ee'});}
      if(this._hasMutation('staticCharge')){p.staticCount=(p.staticCount||0)+1;if(p.staticCount>=4){p.staticCount=0;const reach=p.r+170,token=this._id++;for(const o of [...s.organisms]){if(o.dead)continue;const d=distance(o,p);if(d<reach+o.r)o.stun=Math.max(o.stun,.3*this._pk('staticCharge'));if(d<reach+o.r)this._hit(o,p.attack*.6*this._mp('staticCharge'),(o.x-p.x)/(d||1),(o.y-p.y)/(d||1),{token});if(s.pendingEvolution)return;}const b=s.bossEncounter;if(b&&distance(b,p)<b.r+reach)this._hitBoss(p.attack*.6*this._mp('staticCharge'),{token});this._effect(p.x,p.y,'burst',reach,'#f6eaa0',.5);this._event('staticCharge');}}
    }
    _strike(aimX,aimY){
      const s=this.state,p=s.player;if(p.strike==='pulse'||!p.strike)return this._pulse(aimX,aimY);
      if(p.pulseCooldown>0||!this._spendEnergy(p.pulseCost))return;
      p.pulseCooldown=p.pulseCooldownMax;p.refugeCombatTime=3;s.stats.pulses++;
      const stored=this._hasMutation('storedImpact')?p.impactCharge:0,boost=1;p.impactCharge=0;p.slipstreamCharged=false;if(stored>0)p.energy=Math.min(p.maxEnergy,p.energy+5*this._pk('storedImpact'));
      const traits=this._strikeTraits(),ambush=p.stealth>.65,angle=pulseAngle(p,aimX,aimY),ax=Math.cos(angle),ay=Math.sin(angle),colour=this.strikeColour();
      this._strikeOrgans(angle);if(s.pendingEvolution)return;
      const echo=(p.echoUntil||0)>s.time?1+.3*this._mp('echoNucleus'):1;p.echoUntil=0;
      const ctx={shape:p.strike,family:p.strike,traits,token:this._id++,damage:(p.attack+stored)*boost*echo*p.strikeDamage*this._frenzyBoost()*(ambush?1.65:1),ambush,ambushCredited:false,struck:[],healed:0};
      // Concealment: a Needle barely disturbs it; the Stalker trait shortens the reveal for every other shape.
      if(p.strike==='stalker'){p.stealth*=.5;p.concealCooldown=Math.max(p.concealCooldown,.3);}else this._breakStealth(1.7*Math.max(.3,1-traits.stalker*.2));this._grabStrike(angle);
      if(traits.riptide){p.vx+=ax*40*traits.riptide;p.vy+=ay*40*traits.riptide;}
      this._event('pulse',{level:p.traits.summoner,angle,halfAngle:PULSE_HALF_ANGLE,shape:p.strike});
      if(p.strike==='predator'){
        // Bite: a short, wide arc in front of the cell.
        const reach=p.strikeReach,half=.75;this._effect(p.x,p.y,'bite',reach,colour,.34,{angle,halfAngle:half,body:p.r,self:true});
        const inBite=v=>{const dx=v.x-p.x,dy=v.y-p.y,d=length(dx,dy)||1;if(d>reach+v.r*.5)return 0;const off=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-angle),Math.cos(Math.atan2(dy,dx)-angle)));return off<=half||d<p.r+v.r?d:0;};
        for(const o of s.organisms){if(o.dead)continue;const d=inBite(o);if(!d)continue;this._strikeHit(o,(o.x-p.x)/d,(o.y-p.y)/d,ctx);if(s.pendingEvolution||s.status!=='playing')return;}
        this._ff(v=>!!inBite(v),ctx.damage);
        const b=s.bossEncounter;if(b&&inBite(b)){this._strikeBossHit(ctx);if(s.pendingEvolution)return;}
      }else{
        // Spit, Needle, Spike gun and Spore burst are all shots; they differ in speed, spread, count and size.
        const needle=p.strike==='stalker',spores=p.strike==='spores',spikes=p.strike==='spikes',speed=needle?720:spores?480:spikes?820:600,count=needle||spikes?1:p.strikeWidth;
        const lock=needle?this._aimAssist(angle,p.strikeReach,.22):null;for(let i=0;i<count;i++){const a=lock?lock.angle:spores?angle+(i-(count-1)/2)*.15+(this.random()-.5)*.05:spikes?angle+(this.random()-.5)*.06:angle+(count>1?(i-.5)*.08:0);s.projectiles.push({id:this._id++,x:p.x+Math.cos(a)*(p.r+6),y:p.y+Math.sin(a)*(p.r+6),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:needle?11:spores?5:spikes?4:7,pierce:needle,seek:!!lock,seekId:lock?lock.id:0,life:(p.strikeReach-p.r)/speed,damage:ctx.damage,attackToken:this._id++,owner:'player',colour,strike:{shape:p.strike,traits,ambush,healed:0,damage:ctx.damage}});}
        if(s.projectiles.length>80)s.projectiles.splice(0,s.projectiles.length-80);
      }
      this._chainFrom(ctx.struck);
    }
    _pulse(aimX,aimY){
      const s=this.state,p=s.player;if(p.pulseCooldown>0||!this._spendEnergy(p.pulseCost))return;
      p.pulseCooldown=p.pulseCooldownMax;p.refugeCombatTime=3;s.stats.pulses++;const stored=this._hasMutation('storedImpact')?p.impactCharge:0,pulseBoost=1,attackToken=this._id++;p.impactCharge=0;p.slipstreamCharged=false;if(stored>0)p.energy=Math.min(p.maxEnergy,p.energy+5*this._pk('storedImpact'));
      const ambush=p.stealth>.65;let ambushCredited=false;const struck=[];this._breakStealth();const echo=(p.echoUntil||0)>s.time?1+.3*this._mp('echoNucleus'):1;p.echoUntil=0;
      const angle=pulseAngle(p,aimX,aimY);this._grabStrike(angle);
      this._strikeOrgans(angle);if(s.pendingEvolution)return;
      this._effect(p.x,p.y,'pulse',p.pulseRadius,'#b5f6e5',.42,{angle,halfAngle:PULSE_HALF_ANGLE,body:p.r,self:true});this._event('pulse',{level:p.traits.summoner,angle,halfAngle:PULSE_HALF_ANGLE});
      for(const o of s.organisms){if(o.dead||!pulseHits(p,o,angle))continue;const dx=o.x-p.x,dy=o.y-p.y,d=length(dx,dy)||1;
        const sneak=ambush&&this._unaware(o),damage=(p.attack+stored)*pulseBoost*echo*(sneak?1.65*this._ambushBonus():1);
        if(sneak&&!ambushCredited&&isHostile(o)){this._creditAmbush(40);ambushCredited=true;}
        struck.push(o);if(this._hasMutation('undertow'))o.slowTime=Math.min(2,1.5*this._mp('undertow'));this._hit(o,damage,dx/d,dy/d,{token:attackToken,family:ambush?'stalker':'predator'});if(s.brood.length)p.broodTargetId=o.id;
        if(s.pendingEvolution)return;
      }
      this._ff(v=>pulseHits(p,v,angle),(p.attack+stored)*pulseBoost*echo*(ambush?1.65*this._ambushBonus():1));
      const boss=s.bossEncounter;if(boss&&pulseHits(p,boss,angle)){const landed=this._hitBoss((p.attack+stored)*pulseBoost*echo*(ambush&&this._bossUnaware(boss)?1.65*this._ambushBonus():1),{ambush:ambush&&!ambushCredited,token:attackToken,family:ambush?'stalker':'predator'});if(landed&&ambush)ambushCredited=true;if(s.pendingEvolution)return;}
      if(this._hasMutation('undertow'))for(const f of s.foods){const d=distance(f,p);if(d<p.pulseRadius+110){f.x+=(p.x-f.x)*.48;f.y+=(p.y-f.y)*.48;}}
      if(this._hasMutation('chainPulse')&&p.chainCooldown<=0&&struck.length){p.chainCooldown=3;let source=struck[0];const hit=new Set(struck.map(o=>o.id));for(let i=0;i<2+Math.floor(this._pk('chainPulse'));i++){const target=s.organisms.filter(o=>!o.dead&&!hit.has(o.id)&&distance(o,source)<190).sort((a,b)=>distance(a,source)-distance(b,source))[0];if(!target)break;const effect={x:target.x,y:target.y,x2:source.x,y2:source.y,r:0,maxR:target.r*1.8,life:.45,maxLife:.45,kind:'chain',colour:'#b3b5f0'};s.effects.push(effect);if(s.effects.length>36)s.effects.shift();const d=distance(target,source)||1;hit.add(target.id);this._hit(target,p.attack*.45*this._mp('chainPulse'),(target.x-source.x)/d,(target.y-source.y)/d,{noCritical:true});source=target;if(s.pendingEvolution)return;}}

      if(s.projectiles.length>80)s.projectiles.splice(0,s.projectiles.length-80);
    }
    _finishSprint(){
      const s=this.state,p=s.player;if(p.sprintSessionDistance>100&&p.sprintDanger&&p.escapeCooldown<=0&&!s.organisms.some(o=>!o.dead&&isHostile(o)&&o.kind!=='jelly'&&distance(o,p)<240)){this._xp('riptide',12);this._awaken('riptide','escape');s.stats.escapes++;p.escapeCooldown=15;}p.sprintSessionDistance=0;p.sprintDanger=false;
    }
    update(dt,input={}){
      // Down in co-op: the pond carries on without you. Your body stays where it fell, untouchable and unseen, so your
      // creatures keep living for your friends (they are run on your device) while they come to revive you.
      {const s=this.state,c=this.coop;if(s.status==='dead'&&c&&c.down>0&&!c.wiped&&!s.paused&&Number.isFinite(dt)&&dt>0){this._downStep(dt);return;}}
      // A pending path choice no longer stops the pond: play continues and the division waits until the player picks (R1).
      if(this.state.status!=='playing'||this.state.paused||this.state.pendingEvolution||!Number.isFinite(dt)||dt<=0)return;
      if(this.state.biomass>=this.state.nextDivision&&this._growthAllowed())this._divide();
      let remaining=Math.min(dt,.15),first=true;
      while(remaining>1e-6&&this.state.status==='playing'&&!this.state.pendingEvolution){const step=Math.min(remaining,1/60);this._step(step,first?input:{...input,pulse:false,pulsePressed:false,blockPressed:false,ability:undefined});remaining-=step;first=false;}
      this._checkRanks();
    }
    _downStep(dt){
      const s=this.state,p=s.player,keep={hp:p.hp,energy:p.energy,nutrition:p.nutrition,x:p.x,y:p.y,angle:p.angle,stealth:p.stealth,invulnerable:p.invulnerable,alive:p.alive,biomass:s.biomass,score:s.score};
      s.status='playing';p.alive=true;p.hp=Math.max(1,p.maxHp*.01);
      try{let r=Math.min(dt,.15);while(r>1e-6&&s.status==='playing'){const st=Math.min(r,1/60);p.invulnerable=99;p.stealth=1;p.vx=p.vy=0;this._step(st,{});r-=st;p.x=keep.x;p.y=keep.y;p.vx=p.vy=0;}}
      finally{s.status='dead';Object.assign(p,{hp:keep.hp,energy:keep.energy,nutrition:keep.nutrition,x:keep.x,y:keep.y,angle:keep.angle,stealth:keep.stealth,invulnerable:keep.invulnerable,alive:keep.alive});s.biomass=keep.biomass;s.score=keep.score;}
    }
    // The map remembers every region of the pond you have been close enough to see.
    _explore(){
      const s=this.state,p=s.player,cx=Math.floor(p.x/CHUNK),cy=Math.floor(p.y/CHUNK),key=cx+','+cy;if(key===this._lastChunk)return;this._lastChunk=key;
      if(!this._exploredSet)this._exploredSet=new Set(s.explored);const sight=600+p.r*6,n=Math.ceil(sight/CHUNK);
      for(let x=cx-n;x<=cx+n;x++)for(let y=cy-n;y<=cy+n;y++){const k=x+','+y;if(this._exploredSet.has(k)||s.explored.length>=20000)continue;if(length((x+.5)*CHUNK-p.x,(y+.5)*CHUNK-p.y)>sight+CHUNK*.5)continue;this._exploredSet.add(k);s.explored.push(k);}
    }
    mapRegion(key){const [cx,cy]=key.split(',').map(Number);return{cx,cy,biome:this._biomeAt((cx+.5)*CHUNK,(cy+.5)*CHUNK)};}
    _step(dt,input){
      const s=this.state,p=s.player;s.time+=dt;s.biomeTransition=Math.min(1,s.biomeTransition+dt/2.5);
      this._explore();
      {const here=this._home(s.player.x,s.player.y);if(here!==this._hereChunk){this._hereChunk=here;this._streamClock=0;}}this._streamClock-=dt;if(this._streamClock<=0)this._stream();
      p.invulnerable=Math.max(0,p.invulnerable-dt);p.hurt=Math.max(0,p.hurt-dt);p.evolution=Math.max(0,p.evolution-dt);p.pulseCooldown=Math.max(0,p.pulseCooldown-dt);if(s.bossEncounter)this._bossSenses(s.bossEncounter,dt);
      p.surgeTime=Math.max(0,(p.surgeTime||0)-dt);
      if(this._hasMutation('gorgerStomach')&&p.alive&&p.nutrition>100&&p.hp<p.maxHp)p.hp=Math.min(p.maxHp,p.hp+dt*p.maxHp*.004*this._mp('gorgerStomach')*(1+.1*this._pk('gorgerStomach')));
      // The pocket at the end of a silent current: one rare creature of its water, chosen by the current, that always drops a mutation.
      if(this._pocket&&!(p.surgeTime>0)){const k=this._pocket;this._pocket=null;const lv=waterLevel(k.x,k.y),pool=Object.keys(SPECIES).filter(q=>{const sp=SPECIES[q];return (sp.rarity==='rare'||sp.rarity==='legendary')&&!sp.spawnOnly&&sp.minStage*3<=lv&&(!sp.biomes||sp.biomes.includes(this._biomeAt(k.x,k.y)));});
        if(pool.length){const key=pool[Math.floor(localRng(seedHash(s.seed+'|pocket|'+k.id))()*pool.length)],a=Math.atan2(p.surgeDY||0,p.surgeDX||1),o=this._spawnSpecies(key,p.x+Math.cos(a)*520,p.y+Math.sin(a)*520,{level:lv,scale:bodyScale(lv+1)});if(o){o._dropForce=true;o.forceDrop=true;o.angle=a+Math.PI;}}}
      for(const key of ['concealCooldown','specialTime','swarmTime','slipstreamTime','pounceTime','veilTime','frenzyTime','momentumTime','escapeCooldown','secondWindTime','secondWindCooldown','chainCooldown','fissionShieldTime','fissionCooldown','phaseShieldTime','phaseCooldown','blockCooldown','feedingRecovery','parryTime','parryBuffer','regenDelay','refugeCombatTime','shadowMetabolismCooldown'])p[key]=Math.max(0,p[key]-dt);
      for(const k of FAMILIES)p.abilityCooldowns[k]=Math.max(0,p.abilityCooldowns[k]-dt);if(p.slipstreamTime<=0)p.slipstreamCharged=false;if(p.frenzyTime<=0)p.frenzy=0;if(p.momentumTime<=0)p.momentum=0;
      let mx=Number.isFinite(input.moveX)?input.moveX:0,my=Number.isFinite(input.moveY)?input.moveY:0,m=length(mx,my);if(m>1){mx/=m;my/=m;m=1;}
      const aimX=Number.isFinite(input.aimX)?input.aimX:p.x+Math.cos(p.angle)*100,aimY=Number.isFinite(input.aimY)?input.aimY:p.y+Math.sin(p.angle)*100;
      const wasSprinting=p.sprinting,wasSneaking=p.sneaking;let requestedSprint=!!input.sprint&&m>.1;
      // Darting flagellum: a press throws you forward (the surge fields), untouchable on the way; it is your fast swim while it lasts.
      if(this._hasMutation('dartFlagellum')){const press=requestedSprint&&!p.dartHeld;p.dartHeld=requestedSprint;const cost=Math.max(10,24-2*this._pk('dartFlagellum'));
        if(press&&!p.exhausted&&p.energy>=cost&&!((p.surgeTime||0)>0)&&!(p.pounceTime>0)){const dist=155*this._mp('dartFlagellum');p.energy-=cost;p.surgeDX=mx/m;p.surgeDY=my/m;p.surgeSpeed=dist/.2;p.surgeTime=.2;p.surgeCtx=null;p.dartTime=.2;p.invulnerable=Math.max(p.invulnerable,.2);p.angle=Math.atan2(my,mx);this._effect(p.x,p.y,'burst',p.r*1.6,'#95dafa',.25);}
        p.dartTime=Math.max(0,(p.dartTime||0)-dt);requestedSprint=p.dartTime>0;}
      p.sprinting=requestedSprint&&!p.exhausted&&p.energy>0;p.sneaking=!!input.sneak&&!p.exhausted&&!p.sprinting&&p.energy>(wasSneaking?.01:2)&&p.concealCooldown===0;
      if(p.sneaking&&!wasSneaking)s.stats.sneaks++;
      const conceal=p.sneaking||p.veilTime>0?1:0;p.stealth+=(conceal-p.stealth)*(1-Math.exp(-dt*(conceal?p.concealRate:4.5)));
      p.stillTime=m<.05&&length(p.vx,p.vy)<8&&p.hurt===0?p.stillTime+dt:0;p.photosynthesising=this._hasMutation('photosynthesis')&&p.stillTime>=2;
      if(p.photosynthesising&&!p.exhausted)p.energy=Math.min(p.maxEnergy,p.energy+dt*3*this._pk('photosynthesis'));
      p.nutrition=clamp(p.nutrition+dt*(p.photosynthesising?.4:-p.nutritionDrain),0,p.maxNutrition);
      p.hp=Math.min(p.maxHp,p.hp+dt*(p.regeneration*(p.nutrition>25?1:p.nutrition>10?.3:0)*(p.photosynthesising?1+this._mp('photosynthesis'):1)+(p.feedingRecovery>0?p.maxHp*.015:0)));
      if(!p.sprinting&&!p.sneaking)p.energy=Math.min(p.maxEnergy,p.energy+dt*p.energyRegeneration*(p.nutrition>20?1:.55));
      if(p.sneaking){p.energy=Math.max(0,p.energy-dt*p.sneakDrain);if(p.energy<1)this._exhaust();}
      this._recoverEnergy();
      if(p.nutrition<=0){p.hp=Math.max(0,p.hp-dt*p.maxHp*.025);if(p.hp<=0){p.alive=false;p.deathCause='Starvation';s.status='dead';this._event('death',this.getSummary());return;}}
      if(p.nutrition<20&&!this._hungryWarned){this._hungryWarned=true;this._event('warning',{message:'Nutrition is low. Find algae or prey to keep your colony alive.'});}if(p.nutrition>40)this._hungryWarned=false;
      if(input.blockPressed||(input.block&&!p.blockHeld))this._block(aimX,aimY);p.blockHeld=!!input.block;
      if(input.ability)this._special(aimX,aimY,input.ability);if(input.pulse||input.pulsePressed)this._strike(aimX,aimY);if(s.pendingEvolution)return;
      p.effectiveSprintDrain=p.sprintDrain;
      p.sprinting=requestedSprint&&!p.exhausted&&p.energy>0;
      if(p.sprinting){if(!(p.dartTime>0))p.energy=Math.max(0,p.energy-p.effectiveSprintDrain*dt);this._breakStealth(.7);p.sneaking=false;if(p.energy<1)this._exhaust();}
      
      if(p.sprinting&&this._hasMutation('toxicWake')){p.wakeT=(p.wakeT||0)-dt;if(p.wakeT<=0){p.wakeT=.25;if(!s.pools)s.pools=[];const life=this._mp('toxicWake');s.pools.push({x:p.x-Math.cos(p.angle)*p.r,y:p.y-Math.sin(p.angle)*p.r,r:(26+p.r*.7)*(1+.15*this._pk('toxicWake')),life,maxLife:life,tick:0,wake:true});if(s.pools.length>12)s.pools.shift();}}
      if(p.sprinting&&!wasSprinting&&this._hasMutation('tailFlick')&&s.time-(p.tailFlickAt??-99)>=4-.5*this._pk('tailFlick')){const bx=-Math.cos(p.angle),by=-Math.sin(p.angle);let hit=false;for(const o of s.organisms){if(o.dead||o.bossId)continue;const dx=o.x-p.x,dy=o.y-p.y,d=Math.hypot(dx,dy)||1;if(d<p.r+o.r+70&&(dx*bx+dy*by)/d>.3){o.stun=Math.max(o.stun||0,.6*this._mp('tailFlick'));hit=true;}}if(hit){p.tailFlickAt=s.time;this._effect(p.x+bx*p.r,p.y+by*p.r,'burst',p.r+40,'#95dafa',.3);}}
      if(p.sprinting&&!wasSprinting){if(this._hasMutation('phaseMembrane')&&p.phaseCooldown<=0){p.phaseShieldTime=.38*this._mp('phaseMembrane');p.phaseCooldown=8-1.2*this._pk('phaseMembrane');this._effect(p.x,p.y,'special',p.r*2.2,'#8edfe0',.4);}s.stats.dashes++;p.sprintSessionDistance=0;p.sprintDanger=false;this._event('dash',{level:p.traits.riptide});}
      if(p.sprinting&&s.organisms.some(o=>!o.dead&&(o.chasing||o.windup>0||o.lungeTime>0)&&isHostile(o)&&distance(o,p)<320))p.sprintDanger=true;
      if(!p.sprinting&&wasSprinting)this._finishSprint();
      const surging=(p.surgeTime||0)>0;
      const follow=1-Math.exp(-dt*(p.sprinting?9:6.8)),speed=(p.sprinting?p.sprintSpeed:p.speed)*(1+(p.frenzy||0)*.05)*(1+(p.momentum||0)*.05)*(p.sneaking?.43+p.traits.stalker*.035:1)*(p.secondWindTime>0?1.55:1)*(this._eyeOfStorm()?1.25:1);
      if(surging){p.vx=p.surgeDX*p.surgeSpeed;p.vy=p.surgeDY*p.surgeSpeed;}else if(p.pounceTime>0){}else{p.vx+=(mx*speed-p.vx)*follow;p.vy+=(my*speed-p.vy)*follow;}const faceHeld=(p.faceTime||0)>0&&Number.isFinite(p.faceAngle);if(faceHeld){p.faceTime=Math.max(0,p.faceTime-dt);const diff=Math.atan2(Math.sin(p.faceAngle-p.angle),Math.cos(p.faceAngle-p.angle));p.angle+=diff*Math.min(1,dt*14);}
      const aimFace=!faceHeld&&input.faceAim&&Number.isFinite(input.aimX)&&Number.isFinite(input.aimY)&&Math.hypot(input.aimX-p.x,input.aimY-p.y)>1;if(m>.05&&!aimFace&&!faceHeld){const target=Math.atan2(my,mx),diff=Math.atan2(Math.sin(target-p.angle),Math.cos(target-p.angle));p.angle+=diff*Math.min(1,dt*10);}
      // Aiming an attack (input.faceAim) turns the body towards the aim, even while swimming another way, so Strikes leave from the front.
      else if(aimFace&&Number.isFinite(input.aimX)&&Number.isFinite(input.aimY)&&Math.hypot(input.aimX-p.x,input.aimY-p.y)>1){const target=Math.atan2(input.aimY-p.y,input.aimX-p.x),diff=Math.atan2(Math.sin(target-p.angle),Math.cos(target-p.angle));p.angle+=diff*Math.min(1,dt*12);}
      this._playerPrevious={x:p.x,y:p.y};const moved=length(p.vx,p.vy)*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;s.stats.distance+=moved;
      if(m>.1){if(p.sprinting){s.stats.sprintDistance+=moved;p.sprintSessionDistance+=moved;p.sprintSampleDistance+=moved;if(p.sprintSampleDistance>=200){s.stats.meaningfulDashes+=Math.floor(p.sprintSampleDistance/200);p.sprintSampleDistance%=200;}}}
      if(p.stealth>.55&&m>.2&&length(p.vx,p.vy)>16){
        const threat=s.organisms.filter(o=>!o.dead&&isHostile(o)&&o.kind!=='jelly'&&distance(o,p)<360&&(o.stalkCredit||0)<8).sort((a,b)=>distance(a,p)-distance(b,p))[0];
        if(threat){s.stats.stealthTime+=dt;if(p.stealth>.65)this._awaken('stalker','hidden',dt);}
      }
      if(p.sprinting||p.slipstreamTime>0){this._wakeClock-=dt;if(this._wakeClock<=0){this._wakeClock=.10;this._particles(p.x-Math.cos(p.angle)*p.r,p.y-Math.sin(p.angle)*p.r,'#9ddbef',2,25);}}
      this._pounceTick();if(s.status!=='playing')return;
      if(surging&&p.surgeCtx){const ctx=p.surgeCtx;for(const o of s.organisms){if(o.dead||distance(o,p)>p.r+o.r*.8+10)continue;const d=distance(o,p)||1;this._strikeHit(o,(o.x-p.x)/d,(o.y-p.y)/d,ctx);if(s.pendingEvolution)return;}this._ff(v=>distance(v,p)<p.r+v.r*.8+10,ctx.damage,ctx.ffSeen||(ctx.ffSeen=[]));const b=s.bossEncounter;if(b&&distance(b,p)<p.r+b.r*.75)this._strikeBossHit(ctx);if(p.surgeTime<=dt)this._spendMomentum(ctx);if(s.pendingEvolution||s.status!=='playing')return;}
      if(!((p.surgeTime||0)>dt)&&p.surgeCtx){this._chainFrom(p.surgeCtx.struck);p.surgeCtx=null;p.vx*=.35;p.vy*=.35;}
      this._eatFoods(dt);this._drops(dt);
      if(s.pendingEvolution)return;
      {const b=s.bossEncounter,bx=b&&b.x,by=b&&b.y;this._bossTick(dt);if(s.pendingEvolution||s.status!=='playing')return;const b2=s.bossEncounter;if(b2&&b2===b&&!b2.puppet&&Number.isFinite(bx)){if(b2.gripped){b2.x=bx;b2.y=by;}else if(b2.slowed){b2.x=bx+(b2.x-bx)*.5;b2.y=by+(b2.y-by)*.5;}}if(b2){delete b2.gripped;delete b2.slowed;}}
      this._ai-=dt;if(this._ai<=0){this._ai=.23;this._thinkOrganisms();}
      this._moveOrganisms(dt);
      if(s.pendingEvolution||s.status!=='playing')return;
      this._projectiles(dt);
      if(s.pendingEvolution||s.status!=='playing')return;
      this._hazards(dt);
      if(s.status!=='playing')return;
      this._broodTick(dt);if(s.status!=='playing')return;
      this._vortexTick(dt);if(s.pendingEvolution||s.status!=='playing')return;
      this._landmarks(dt);if(s.pendingEvolution||s.status!=='playing')return;
      this._animate(dt);
      this._maintain-=dt;if(this._maintain<=0){this._maintain=2;this._replenish();}
      this._scoreClock+=dt;if(this._scoreClock>=1){this._scoreClock-=1;s.score++;}
      if(s.time-this._lastEat>2.4)p.combo=0;
      this._checkObjective();this._recoverEnergy();
    }
    _eatFoods(dt){
      const s=this.state,p=s.player,food=s.foods;
      for(let i=food.length-1;i>=0;i--){const f=food[i],dx=p.x-f.x,dy=p.y-f.y,d=length(dx,dy);
        if(d<p.feedRadius*(p.sprinting?.6:1)+f.r){food.splice(i,1);s.stats.food++;if(f.kind==='algae')s.stats.algae++;if(f.kind==='mineral')s.stats.minerals++;this._gain(f.value*gapWorth(waterLevel(f.x,f.y)-p.stage),f.kind);if(this._hasMutation('fedHeart')){p.energy=Math.min(p.maxEnergy,p.energy+3*this._mp('fedHeart'));p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.004*this._pk('fedHeart'));this._recoverEnergy();}if(!s.pendingEvolution)this._feedAtLandmark(f);this._particles(f.x,f.y,f.kind==='mineral'?'#efd38c':f.kind==='protein'?'#efb0c3':'#b9f4a0',3,25);this._event('eat',{kind:f.kind,value:f.value});if(s.pendingEvolution)return;}
        else{f.x+=Math.sin(s.time*.35+f.phase)*dt*1.5;f.y+=Math.cos(s.time*.29+f.phase)*dt*1.1;}
      }
    }
    // Ecology decisions use bounded perception, persistent pursuit and shared resources.
    _hostile(o){return isHostile(o);}
    // The opening minute of a life, while the cell is still in the nursery: hostiles leave it alone so a new player can learn the controls.
    _nurseryCalm(){const s=this.state,p=s.player;return !s.bossEncounter&&s.time<NURSERY_GRACE&&length(p.x,p.y)<NURSERY_RADIUS;}
    _profile(o){const base=o.kind==='swarmer'?{capacity:60,regen:20,drain:7,cost:20,turn:4.6,accel:6,reach:60}:o.kind==='sentinel'?{capacity:100,regen:30,drain:0,cost:60,turn:1.2,accel:2,reach:0}:o.kind==='jelly'?{capacity:50,regen:10,drain:0,cost:999,turn:.8,accel:1.2,reach:0}:o.kind==='apex'?{capacity:120,regen:19,drain:14,cost:45,turn:1.65,accel:2.6,reach:125}:o.kind==='armoured'?{capacity:70,regen:17,drain:5,cost:24,turn:2.3,accel:3.2,reach:48}:o.elite==='lancer'?{capacity:105,regen:18,drain:13,cost:50,turn:1.9,accel:3.5,reach:150}:{capacity:82,regen:23,drain:9,cost:32,turn:3.8,accel:5,reach:92};const sp=o.species&&SPECIES[o.species];return sp&&sp.profile?{...base,...sp.profile}:base;}
    _covered(target){return this.state.scenery.some(c=>(c.kind==='algae'||c.kind==='fibre'||c.kind==='tube')&&distance(c,target)<c.r*.72);}
    _canHunt(o,v){
      if(v===o||v.puppet||o.puppet||v.dead||v.bossId||v.nestId||o.bossId||o.nestId||o.kind==='jelly'||v.kind==='jelly')return false;
      if(!this._hostile(v))return v.r<o.r*(o.kind==='armoured'?.75:1.05);
      // Territorial rivals are worthwhile only when smaller or badly injured.
      if(v.kind===o.kind)return v.hp/v.maxHp<.3&&v.r<o.r*.85;
      return (o.kind==='apex'&&v.r<o.r*.78)||(v.hp/v.maxHp<.45&&v.r<o.r*1.12);
    }
    _thinkOrganisms(){
      const s=this.state,p=s.player,legend=this._legend(),
        // Shared lookups, built once per think instead of once per organism: cover, scavengeable remains and nearby algae.
        playerCovered=this._covered(p),coverCache=new Map(),covered=v=>{let c=coverCache.get(v);if(c===undefined){c=this._covered(v);coverCache.set(v,c);}return c;},
        proteins=s.foods.filter(f=>f.kind==='protein'),ALGAE_CELL=190,algaeGrid=new Map();
      for(const f of s.foods){if(f.kind!=='algae')continue;const key=Math.floor(f.x/ALGAE_CELL)+','+Math.floor(f.y/ALGAE_CELL);let list=algaeGrid.get(key);if(!list)algaeGrid.set(key,list=[]);list.push(f);}
      const nearestAlgae=o=>{const cx=Math.floor(o.x/ALGAE_CELL),cy=Math.floor(o.y/ALGAE_CELL);let best=null,bd=ALGAE_CELL;for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){const list=algaeGrid.get(x+','+y);if(list)for(const f of list){const d=distance(f,o);if(d<bd){bd=d;best=f;}}}return best;};
      const occupiedRefuge=!s.bossEncounter&&s.landmarks.find(l=>l.type==='sanctuary'&&distance(l,p)<l.r),nursery=this._nurseryCalm()?{x:0,y:0,r:NURSERY_RADIUS-220}:null,refuge=p.refugeCombatTime===0&&occupiedRefuge||nursery;
      for(const o of s.organisms){if(o.dead||o.puppet)continue;let tx=Math.cos(o.angle),ty=Math.sin(o.angle);const dp=distance(o,p),hostile=this._hostile(o),sp=o.species?SPECIES[o.species]:null;o.chasing=false;o.targetId=-1;o.foraging=false;
        {const seenKey=o.species||(o.elite==='lancer'?'lancer':o.kind);if(!o.bossId&&dp<(sp&&sp.cloaked?300:560)&&!(s.seenSpecies||[]).includes(seenKey)){(s.seenSpecies||(s.seenSpecies=[])).push(seenKey);this._event(sp?'speciesSeen':'creatureSeen',{species:seenKey,name:sp?sp.name:seenKey,rarity:sp?sp.rarity:''});}}
        if(hostile){
          const decoy=o.kind==='jelly'?null:s.decoys.find(d=>d.life>0&&distance(d,o)<590);
          const k=o.scale||1,sight=k*(sp&&sp.sight?sp.sight:o.kind==='jelly'?0:o.kind==='sentinel'?360:o.kind==='swarmer'?380:o.kind==='apex'?690:o.kind==='armoured'?230:420+Math.min(o.tier,4)*25)*(1-p.stealth*(.67+p.traits.stalker*.025))*(playerCovered&&dp>o.r+p.r+35?.58:1)*(s.pondEvent&&s.pondEvent.type==='darkwater'&&!(sp&&sp.rarity==='legendary')?.6:1)*(!p.sprinting?1-.2*this._mp('lateralLine'):1)*((p.shelterTime||0)>0&&p.refugeCombatTime===0&&!(sp&&sp.rarity==='legendary')?0:1)*(p.sneaking&&this._fork('stalker',4)==='b'?.75:1)*(p.sprinting&&this._hybrid('ghostCurrent')?.7:1);
          let target=null,best=Infinity;
          if(!refuge&&dp<sight&&(o.kind!=='armoured'||sp?.aggressive||dp<o.r+p.r+70||p.hp<p.maxHp*.5)&&((o.fedTime||0)<=0||dp<o.r+p.r+65)) {target=p;best=dp*(.5+.5*p.hp/p.maxHp);}
          if(o.kind==='jelly'){const ax=o.anchorX??o.x,ay=o.anchorY??o.y,ad=length(ax-o.x,ay-o.y),a=o.angle+Math.sin(s.time*.3+o.phase)*.9;tx=Math.cos(a)+(ad>160?(ax-o.x)/ad*1.5:0);ty=Math.sin(a)+(ad>160?(ay-o.y)/ad*1.5:0);}
          if(o.kind==='sentinel'&&!target){const ax=o.anchorX??o.x,ay=o.anchorY??o.y,ad=length(ax-o.x,ay-o.y);if(ad>40){tx=(ax-o.x)/ad;ty=(ay-o.y)/ad;}else{tx=0;ty=0;}}
          if(!o.bossId&&!o.nestId&&(o.fedTime||0)<=0&&o.kind!=='jelly'&&o.kind!=='sentinel'){
            if(!(sp&&sp.rarity==='legendary')){const hr=(o.kind==='apex'?620:420)*k;for(const v of s.organisms){const hx=v.x-o.x,hy=v.y-o.y;if(hx>=hr||hx<=-hr||hy>=hr||hy<=-hr)continue;if(!this._canHunt(o,v))continue;const d=distance(o,v);if(d>=hr)continue;const range=(o.kind==='apex'?620:420)*k*(covered(v)&&d>o.r+v.r+35?.5:1),score=d*(.45+.55*v.hp/v.maxHp);if(d<range&&score<best){best=score;target=v;}}}
            // Armoured scavengers smell remains from farther away and prefer a meal to a fight.
            for(const f of proteins){const d=distance(o,f),score=d*(o.kind==='armoured'?.22:.8);if(d<(o.kind==='armoured'?680:260)*k&&score<best){best=score;target=f;}}
          }
          if(decoy){target=decoy;o.targetId=-2;}
          else if(target)o.targetId=target.id;
          // Broodlings are prey too: a hostile goes for one that is closer than its target, or one that bit it.
          o.huntBrood=0;if(hostile&&!decoy&&!o.bossId&&s.brood&&s.brood.length){const aggro=(o.broodAggroUntil||0)>s.time;let nb=null,nd=aggro?520:300;for(const b of s.brood){const d=distance(o,b);if(d<nd){nd=d;nb=b;}}
            const td=target?distance(o,target):1e9;if(nb&&(aggro||nd<td*.8)){target=null;o.targetId=-1;o.huntBrood=nb.id;const d=nd||1;tx=(nb.x-o.x)/d;ty=(nb.y-o.y)/d;o.chasing=true;o.foraging=false;o.pursuit=0;}}
          if(target){const d=distance(o,target)||1;tx=(target.x-o.x)/d;ty=(target.y-o.y)/d;o.foraging=target.kind==='protein';o.chasing=!o.foraging;if(o.targetId===0){o.pursuit=4;o.lastSeenX=p.x;o.lastSeenY=p.y;}else o.pursuit=0;}
          else if(!refuge&&o.pursuit>0){const d=length(o.lastSeenX-o.x,o.lastSeenY-o.y);if(d>35){tx=(o.lastSeenX-o.x)/d;ty=(o.lastSeenY-o.y)/d;o.chasing=true;}else o.pursuit=0;}
          // Species steering: ranged ones back off, escorts keep to their leader, legendaries roam towards the player.
          if(sp&&sp.keepAway&&o.targetId===0&&dp<sp.keepAway*k){tx=-tx;ty=-ty;}
          if(o.leaderId&&!target){const lead=s.organisms.find(v=>v.id===o.leaderId&&!v.dead);if(!lead)o.leaderId=0;else{const d=distance(o,lead);if(d>130){tx=(lead.x-o.x)/d;ty=(lead.y-o.y)/d;}}}
          o.creeping=false;if(sp&&sp.rarity==='legendary'&&!target&&!refuge&&dp>420&&dp<3000){tx=(p.x-o.x)/dp;ty=(p.y-o.y)/dp;o.creeping=dp>1100;}
          if(o.flee>0){tx=(o.x-p.x)/(dp||1);ty=(o.y-p.y)/(dp||1);o.chasing=false;o.targetId=-1;}
        }else{
          const k=o.scale||1;let threat=p.r>o.r*1.06&&dp<190*k*(1-p.stealth*.78)?p:null,nearest=threat?dp:280*k;
          for(const v of s.organisms){const qx=v.x-o.x,qy=v.y-o.y;if(qx>=nearest||qx<=-nearest||qy>=nearest||qy<=-nearest)continue;if(v.dead||!this._hostile(v)||!this._canHunt(v,o))continue;const d=distance(o,v);if(d<nearest){nearest=d;threat=v;}}
          if(threat){const d=distance(o,threat)||1;tx=(o.x-threat.x)/d;ty=(o.y-threat.y)/d;o.flee=Math.max(o.flee,.5);
            const covers=s.scenery.filter(c=>(c.kind==='algae'||c.kind==='fibre'||c.kind==='tube')&&distance(o,c)<260&&distance(c,threat)>distance(o,threat)+20).sort((a,b)=>distance(a,o)-distance(b,o));
            if(covers.length){const c=covers[0],cd=distance(c,o)||1;tx=tx*.35+(c.x-o.x)/cd;ty=ty*.35+(c.y-o.y)/cd;}
          }else{const food=nearestAlgae(o);if(food){const d=distance(food,o)||1;tx=(food.x-o.x)/d;ty=(food.y-o.y)/d;o.targetId=food.id;o.foraging=true;}else{const a=o.angle+Math.sin(s.time*.4+o.phase)*.5;tx=Math.cos(a);ty=Math.sin(a);}}
        }
        if(hostile&&refuge){o.targetId=-1;o.chasing=false;o.pursuit=0;const d=distance(o,refuge);if(d<refuge.r+220){tx=(o.x-refuge.x)/(d||1);ty=(o.y-refuge.y)/(d||1);}}
        if(hostile)for(const r of s.landmarks){if(r.type==='sanctuary'&&!(p.refugeCombatTime>0&&occupiedRefuge&&r.id===occupiedRefuge.id)&&distance(o,r)<r.r+80){const d=distance(o,r)||1;tx+=(o.x-r.x)/d*3;ty+=(o.y-r.y)/d*3;}}
        // Nest guardians are tied to their nest: they give up a chase that strays too far and drift home when idle.
        if(o.nestId&&!o.puppet&&!s.landmarks.some(l=>l.id===o.nestId)){o.dead=true;continue;}
        if(o.nestId){const nest=s.landmarks.find(l=>l.id===o.nestId);if(nest){const k=o.scale||1,d=distance(o,nest)||1,leash=nest.r+(o.mother?520:640)*Math.max(1,k);
          if(d>leash){tx=(nest.x-o.x)/d;ty=(nest.y-o.y)/d;o.chasing=false;o.pursuit=0;o.targetId=-1;}else if(!o.chasing&&d>nest.r+60*k){tx=tx*.3+(nest.x-o.x)/d;ty=ty*.3+(nest.y-o.y)/d;}}}
        if(o.elder&&Number.isFinite(o.anchorX)){const k=o.scale||1,hx=o.anchorX-o.x,hy=o.anchorY-o.y,d=length(hx,hy)||1,leash=ELDER_LEASH*Math.sqrt(k);
          // While something has hurt it in the last six seconds it stays in the fight, wherever that leads. Otherwise it will not chase
          // beyond its territory, and once left alone it drifts home and slowly recovers.
          const engaged=s.time-(Number.isFinite(o.hurtAt)?o.hurtAt:-99)<6;
          if(!engaged&&d>leash){tx=hx/d;ty=hy/d;o.chasing=false;o.pursuit=0;o.targetId=-1;}else if(!engaged&&!o.chasing&&d>260*k){tx=tx*.3+hx/d;ty=ty*.3+hy/d;}
          if(!engaged&&!o.chasing&&o.hp<o.maxHp&&distance(o,p)>700*k+o.r+p.r)o.hp=Math.min(o.maxHp,o.hp+o.maxHp*.004);
          const seen=this._elderSeen||(this._elderSeen=new Set());if(!seen.has(o.id)&&distance(o,p)<o.r+p.r+620){seen.add(o.id);this._event('elderSighted',{name:o.elderName,level:waterLevel(o.anchorX,o.anchorY)+1,x:o.x,y:o.y});}}
        // Other predators scatter from a hunting boss when it comes near: it is the one thing they fear.
        {const bb=s.bossEncounter;if(bb&&hostile&&o.nestId&&this._cowedByBoss(o)){const nest=s.landmarks.find(l=>l.id===o.nestId);if(nest){const d=distance(o,nest)||1;tx=(nest.x-o.x)/d;ty=(nest.y-o.y)/d;o.chasing=false;o.targetId=-1;o.pursuit=0;}}else if(bb&&hostile&&o.kind!=='sentinel'&&o.kind!=='jelly'&&this._cowedByBoss(o)){const d=distance(o,bb)||1;tx=(o.x-bb.x)/d;ty=(o.y-bb.y)/d;o.flee=Math.max(o.flee,.5);o.chasing=false;o.targetId=-1;o.pursuit=0;}}
        // Everything that can swim flees a legendary.
        if(legend&&legend!==o&&!o.bossId&&!o.nestId&&o.kind!=='sentinel'&&o.kind!=='jelly'&&!(o.latchTime>0)){const d=distance(o,legend);if(d<1300&&d>0){tx=(o.x-legend.x)/d;ty=(o.y-legend.y)/d;o.flee=Math.max(o.flee,.6);o.chasing=false;o.targetId=-1;o.pursuit=0;}}
        {const sep0=o.r+14*(o.scale||1);for(const other of s.organisms){const dx=o.x-other.x,dy=o.y-other.y,lim=sep0+other.r;if(dx>=lim||dx<=-lim||dy>=lim||dy<=-lim)continue;if(other===o||other.dead||other.id===o.targetId)continue;const d=length(dx,dy);if(d>0&&d<o.r+other.r+14*(o.scale||1)){const push=(o.r+other.r+14*(o.scale||1)-d)/(o.r+other.r+14*(o.scale||1));tx+=dx/d*push;ty+=dy/d*push;}}}
        const l=length(tx,ty);o.tx=l?tx/l:Math.cos(o.angle);o.ty=l?ty/l:Math.sin(o.angle);
      }
    }
    _swimOrganism(o,dt,slow=false){
      const profile=this._profile(o),desired=Math.atan2(o.ty,o.tx),diff=Math.atan2(Math.sin(desired-o.angle),Math.cos(desired-o.angle));o.angle+=clamp(diff,-profile.turn*dt,profile.turn*dt);
      const base=o.speed*(slow?.38:o.chasing?1.13:o.flee>0?(o.species==='skimmer'?2:1.2):.7)*(o.creeping?.5:1)*(o.slowTime>0?.6:1)*(o.stun>0?.4:1),follow=1-Math.exp(-dt*profile.accel);
      o.vx+=(Math.cos(o.angle)*base-o.vx)*follow;o.vy+=(Math.sin(o.angle)*base-o.vy)*follow;o.x+=o.vx*dt;o.y+=o.vy*dt;
    }
    _ecosystemHit(v,amount,attacker){
      if(v.dead||v.bossId||v.nestId)return;v.hp-=amount*(v.kind==='armoured'?(v.recoverTime>0?1.35:.4):v.kind==='sentinel'?(v.recoverTime>0?1.4:.35):1);v.flash=.18;v.flee=Math.max(v.flee,.7);
      if(v.hp>0)return;v.dead=true;this._elderFell(v);attacker.fedTime=12;attacker.hp=Math.min(attacker.maxHp,attacker.hp+4);
      // No player kill, skill, mutation or hunt credit for another organism's work.
      const value=v.kind==='apex'?4:v.kind==='hunter'?2.5:1.5;
      for(let i=0;i<3;i++){const a=i*TAU/3;this._food(v.x+Math.cos(a)*12,v.y+Math.sin(a)*12,'protein',value,v.home,v.biome);}
      this._particles(v.x,v.y,'#d6a6ad',8,55);
    }
    // Small enough to be food: you swim through it (and swallow it when you are not swimming fast).
    _edible(o){const p=this.state.player;return this._canEngulf(o,true)||(!o.bossId&&o.kind==='swarmer'&&o.r<p.r*.6);}
    _canEngulf(o,anySpeed=false){const p=this.state.player;return (anySpeed||!p.sprinting)&&!o.bossId&&o.kind!=='apex'&&o.kind!=='jelly'&&o.kind!=='sentinel'&&o.r<p.r*((this._hasMutation('devourerGullet')?.95:.78)+(.15*Math.min(1.3,this._mp('engulfingMembrane')))+p.traits.predator*.035)&&((o.kind==='prey'||o.kind==='grazer')||o.hp<=o.maxHp*.4);}
    _moveOrganisms(dt){
      const s=this.state,p=s.player;
      for(const o of s.organisms){if(s.pendingEvolution||s.status!=='playing')break;if(o.dead)continue;
        if(o.denT&&o.puppet){o.denT=o.denT>0?Math.max(0,o.denT-dt):Math.min(0,o.denT+dt);}
        if(o.denT&&!o.puppet){
          const nest=s.landmarks.find(l=>l.id===o.nestId),leaving=o.denT>0;o.denT=leaving?Math.max(0,o.denT-dt):Math.min(0,o.denT+dt);
          if(!nest){o.denT=0;continue;}
          const k=1-Math.abs(o.denT)/DEN_TIME,ease=k*k*(3-2*k),u=leaving?ease:1-ease;o.x=nest.x+(o.denX-nest.x)*u;o.y=nest.y+(o.denY-nest.y)*u;o.vx=o.vy=0;o.windup=0;o.lungeTime=0;o.chasing=false;o.cooldown=Math.max(o.cooldown,.4);
          if(o.denT===0){if(leaving){delete o.denX;delete o.denY;this._markFresh(o);}else{o.dead=true;}}
          continue;}
        if(o.drift&&!o.puppet){o.anchorX=(o.anchorX??o.x)+o.drift.vx*dt;o.anchorY=(o.anchorY??o.y)+o.drift.vy*dt;o.x+=o.drift.vx*dt;o.y+=o.drift.vy*dt;}
        o.flash=Math.max(0,(o.flash||0)-dt);o.pursuit=Math.max(0,(o.pursuit||0)-dt);o.flee=Math.max(0,(o.flee||0)-dt);o.stun=Math.max(0,(o.stun||0)-dt);o.slowTime=Math.max(0,(o.slowTime||0)-dt);o.fedTime=Math.max(0,(o.fedTime||0)-dt);o.charge=Math.max(0,(o.charge||0)-dt);o.cloak=Math.max(0,(o.cloak||0)-dt);o.cooldown-=dt;
        const hostile=this._hostile(o),oldX=o.x,oldY=o.y,profile=this._profile(o);
        if(o.puppet)this._puppetMove(o,dt);else{
        if(o.poison>0){o.poison=Math.max(0,o.poison-dt);const pd=o.poisonDamage*dt*(1+.2*this._mp('causticGland'))*(Number.isFinite(o.lv)&&!o.bossId?gapDeal(p.stage-o.lv):1),tick=Math.min(Math.max(0,o.hp),pd);o.hp-=pd;if(o.venomStacks>0){this._dot(o,tick,'venomist');if(o.venomStacks>=5&&this._fork('venomist',4)==='b')o.slowTime=Math.max(o.slowTime||0,.3);}if(o.poison===0)o.venomStacks=0;if(o.hp<=0){this._kill(o);continue;}}
        if(o.bleed>0){o.bleed=Math.max(0,o.bleed-dt);const tick=Math.min(Math.max(0,o.hp),o.bleedDamage*dt);o.hp-=o.bleedDamage*dt;this._dot(o,tick,'predator');if(o.hp<=0){this._kill(o);continue;}}
        if(hostile){const spending=o.chasing&&o.attackMode==='idle'&&!o.exhausted&&o.stun===0&&o.stamina>=profile.cost;
          o.stamina=clamp(o.stamina+dt*(spending?-profile.drain:o.lungeTime>0||o.windup>0?0:profile.regen),0,profile.capacity);
          if(o.stamina<=.01)o.exhausted=true;if(o.exhausted&&o.stamina>=profile.capacity-.001)o.exhausted=false;
        }
        if((o.windup>0||o.lungeTime>0)&&this._cowedByBoss(o)){o.windup=0;o.lungeTime=0;o.attackHit=true;this._recoverAttack(o);}
        if(o.windup>0){o.windup=Math.max(0,o.windup-dt);this._swimOrganism(o,dt,true);if(o.windup===0)this._releaseAttack(o);}
        else if(o.lungeTime>0){
          const active=Math.min(dt,o.lungeTime),speed=o.attackRange/o.lungeMax;o.vx=Math.cos(o.attackAngle)*speed;o.vy=Math.sin(o.attackAngle)*speed;o.x+=o.vx*active;o.y+=o.vy*active;o.lungeTime=Math.max(0,o.lungeTime-active);
          if(!o.attackHit){const previous=this._playerPrevious||p,hits=[];
            const swept=(v,prior=v)=>{const ax=oldX-prior.x,ay=oldY-prior.y,dx=o.x-v.x-ax,dy=o.y-v.y-ay,ll=dx*dx+dy*dy,t=ll?clamp(-(ax*dx+ay*dy)/ll,0,1):0;return{near:length(ax+dx*t,ay+dy*t),t};};
            // The bite is tested at the creature's mouth, a point at the front of its body, against the path the
            // player took this tick. Bodies are solid, so the two centres can never get close: testing the centre
            // only worked when one tick's travel happened to carry the creature into the player, which depended on the
            // screen's refresh rate. The jaws close after the first part of the lunge, so there is time to react.
            const mouth=o.r*.85,mx=Math.cos(o.attackAngle)*mouth,my=Math.sin(o.attackAngle)*mouth,biting=o.lungeTime<=o.lungeMax*.7;
            const ph=(()=>{const ax=oldX+mx-previous.x,ay=oldY+my-previous.y,dx=o.x+mx-p.x-ax,dy=o.y+my-p.y-ay,ll=dx*dx+dy*dy,t=ll?clamp(-(ax*dx+ay*dy)/ll,0,1):0;return{near:length(ax+dx*t,ay+dy*t),t};})();
            // A lunge is a bite: it only lands if you are ahead of the creature's middle, at its mouth, not beside or behind it.
            const front=(()=>{const ox=oldX+(o.x-oldX)*ph.t,oy=oldY+(o.y-oldY)*ph.t;return (p.x-ox)*Math.cos(o.attackAngle)+(p.y-oy)*Math.sin(o.attackAngle)>-p.r*.25;})();
            if(biting&&ph.near<p.r+o.r*.3&&front)hits.push({v:p,t:ph.t});else if(biting&&this._fastNow())o.missNear=Math.min(o.missNear??1e9,ph.near-(p.r+o.r*.3));if(s.brood)for(const b of s.brood){const hb=swept(b);if(hb.near<o.attackWidth*.5+b.r*.8)hits.push({v:b,t:hb.t,brood:true});}
            if(!o.bossId&&!o.nestId)for(const v of s.organisms){if(!this._canHunt(o,v))continue;const hit=swept(v);if(hit.near<o.attackWidth*.5+v.r*.7)hits.push({v,t:hit.t});}
            hits.sort((a,b)=>a.t-b.t);if(hits.length){o.attackHit=true;const v=hits[0].v;if(v===p){if(this._canEngulf(o)){this._kill(o,true);if(s.pendingEvolution)return;continue;}{const weak=o.venomStacks>=5&&this._fork('venomist',4)==='b'?.6:1,gulp=canSwallow(o,p);
              // A predator far bigger than you swallows you whole. Only a block, or enough resistance, survives it.
              if(gulp)o.gulp=true;this._damagePlayer(gulp?Math.max(o.attackDamage,p.maxHp*1.5)*weak:o.attackDamage*weak,o);delete o.gulp;
              if(s.status==='playing'){const kick=Math.min(520,260+o.r*2.2);p.vx+=Math.cos(o.attackAngle)*kick;p.vy+=Math.sin(o.attackAngle)*kick;}}if(s.status!=='playing')return;if(o.species&&SPECIES[o.species].latch&&!p.sprinting){o.latchTime=5;o.latchAngle=Math.atan2(o.y-p.y,o.x-p.x)-p.angle;}}else if(hits[0].brood){v.hp-=o.attackDamage*2.2;this._particles(v.x,v.y,'#f3d48c',6,60);}else this._ecosystemHit(v,o.attackDamage,o);}
          }
          for(const decoy of s.decoys)if(distance(o,decoy)<o.attackWidth*.5+decoy.r*.7)decoy.life=0;
          if(o.lungeTime===0&&!o.attackHit&&o.missNear!==undefined&&o.missNear<this._nearMissReach())this._nearMiss(o);if(o.lungeTime===0)delete o.missNear;
          if(o.lungeTime===0&&o.recoverTime===0)this._recoverAttack(o);
        }else if(o.recoverTime>0){o.recoverTime=Math.max(0,o.recoverTime-dt);this._swimOrganism(o,dt,true);if(o.recoverTime===0)o.attackMode='idle';}
        else this._swimOrganism(o,dt,hostile&&(o.exhausted||o.stamina<profile.cost));
        }
        const dp=distance(o,p),contact=p.r+o.r*.72;
        if(o.species&&!o.puppet){this._speciesTick(o,dt,dp);if(s.status!=='playing')return;if(o.dead)continue;}
        if(o.kind==='jelly'&&dp<p.r+o.r*.85&&s.status==='playing'&&!o.stun){this._damagePlayer(((o.species&&SPECIES[o.species].sting||12)+Math.min(o.tier,5)*2.5)*Math.pow(o.scale||1,SIZE_POWER)*clamp(o.might||1,1,2),o);if(s.status!=='playing')return;}
        if(dp<contact&&s.status==='playing'){
          if(this._canEngulf(o)){this._kill(o,true);if(s.pendingEvolution)return;continue;}
        }
        // Solid bodies: anything you cannot swallow pushes back. The heavier body gives way less; a rooted or far
        // bigger creature does not move at all. Food-sized creatures, jellies and anything latched on stay passable.
        if(s.status==='playing'&&!o.dead&&o.kind!=='jelly'&&!(o.latchTime>0)&&!this._edible(o)){
          const touch=p.r+o.r*.9-(p.sneaking?Math.min(p.r,o.r)*.25:0);
          if(dp<touch+4&&p.sprinting&&s.time-o.ramAt>1.5){o.ramAt=s.time;p.refugeCombatTime=3;const d=dp||1,rt=p.traits.riptide||0,nx=(o.x-p.x)/d,ny=(o.y-p.y)/d;if(this._hit(o,p.attack*this._classPower('riptide')*(.5+rt*.25)*(rt>=5?1.25:1)*(1+p.momentum*.25)*(1+.3*this._pk('jetSac'))+this._ramBite(),nx,ny,{noXp:true})&&isHostile(o)){this._xp('riptide',8);this._awaken('riptide','ram');}p.momentum=0;p.vx-=nx*240;p.vy-=ny*240;if(this._hybrid('shoal'))p.broodTargetId=o.id;this._effect(o.x,o.y,'hit',o.r*1.4,'#95dafa',.3);if(s.pendingEvolution)return;if(o.dead)continue;}
          if(dp<touch){const d=dp||1,nx=(o.x-p.x)/d,ny=(o.y-p.y)/d,gap=(touch-dp)*.7,fixed=o.kind==='sentinel'||o.r>p.r*2.5;
            let mine=fixed?1:o.r*o.r/(p.r*p.r+o.r*o.r);if(p.sprinting&&o.r<p.r)mine*=.3;
            p.x-=nx*gap*mine;p.y-=ny*gap*mine;if(!fixed){o.x+=nx*gap*(1-mine);o.y+=ny*gap*(1-mine);}
            const into=p.vx*nx+p.vy*ny;if(into>0){p.vx-=nx*into*mine;p.vy-=ny*into*mine;}}
        }
        if(!o.puppet&&hostile&&o.attackMode==='idle'&&o.cooldown<=0&&o.stun===0&&o.flee===0&&!o.exhausted&&o.stamina>=profile.cost){
          const target=o.huntBrood?s.brood.find(b=>b.id===o.huntBrood):o.targetId===0?p:o.targetId===-2?s.decoys.find(d=>d.life>0&&distance(d,o)<590):s.organisms.find(v=>v.id===o.targetId&&!v.dead);
          if(target&&o.chasing){const k=o.scale||1,d=distance(o,target),range=o.species&&SPECIES[o.species].ranged?520*k:o.kind==='sentinel'?340*k:o.kind==='apex'?560*k:o.r*.7+target.r*.7+profile.reach*k,a=Math.atan2(target.y-o.y,target.x-o.x),facing=Math.abs(Math.atan2(Math.sin(a-o.angle),Math.cos(a-o.angle)));
            if(d<range&&(o.kind==='sentinel'||(o.species&&SPECIES[o.species].ranged)||facing<(o.elite==='lancer'?.28:.6)))this._beginAttack(o,target);
          }
        }
        if(!o.puppet&&o.foraging&&o.cooldown<=0){if(!this._fm||this._fmT!==s.time||this._fmA!==s.foods){this._fm=new Map();for(const f of s.foods)if(!this._fm.has(f.id))this._fm.set(f.id,f);this._fmT=s.time;this._fmA=s.foods;}const ff=this._fm.get(o.targetId);const index=ff&&distance(ff,o)<o.r*.75+ff.r?s.foods.indexOf(ff):-1;if(index>=0)this._fm.delete(ff.id);if(index>=0){const f=s.foods[index];s.foods.splice(index,1);o.cooldown=1.2;o.hp=Math.min(o.maxHp,o.hp+f.value);if(hostile)o.fedTime=8;}}
      }
      for(const o of s.organisms)if(o.dead&&o.elder&&!o.puppet&&!o.letGo)this._elderFell(o);/* a puppet that is merely dropped (its owner swam off) has not fallen */
      s.organisms=s.organisms.filter(o=>!o.dead);
    }
    // Wild predators fear an apex boss. Any that sense it (within its fear range, measured from the boss) drop what they are doing and swim
    // away from it, and they stay frightened for a few seconds after leaving that range so they do not turn straight back at its edge.
    _cowedByBoss(o){
      const s=this.state,b=s.bossEncounter;if(!b){if(this._bossFear)this._bossFear.clear();return false;}if(o.bossId||o.elder||!this._hostile(o))return false;
      const fear=this._bossFear||(this._bossFear=new Map());
      if(distance(o,b)<b.r*4+1800*(b.scale||1)){fear.set(o.id,s.time+5);return true;}
      const until=fear.get(o.id);if(until===undefined)return false;if(until>s.time)return true;fear.delete(o.id);return false;
    }
    _beginAttack(o,target){
      if(this._cowedByBoss(o)||this._fresh(o)||(o.vortexHeld||0)>this.state.time)return false;
      const started=this._beginAttackBase(o,target);if(started){const k=o.scale||1;o.attackRange*=k;o.attackDamage*=Math.pow(k,SIZE_POWER)*(Number.isFinite(o.might)?clamp(o.might,1,2):1);}return started;
    }
    _beginAttackBase(o,target){
      const profile=this._profile(o);if(o.exhausted||o.stamina<profile.cost)return false;
      const tier=Math.min(o.tier,5),apex=o.kind==='apex',armoured=o.kind==='armoured',lancer=o.elite==='lancer',close=distance(o,target)<o.r+target.r+125*(o.scale||1);
      const sp=o.species?SPECIES[o.species]:null;
      o.attackKind=o.kind==='sentinel'?'shards':(apex||sp&&sp.ranged)&&!close?'spores':armoured?'bite':'lunge';
      if(sp&&sp.tether){o.attackKind='tether';o.attackAngle=Math.atan2(target.y-o.y,target.x-o.x);o.angle=o.attackAngle;o.windupMax=.7;o.windup=.7;o.attackRange=sp.tetherReach||330;o.attackWidth=o.r;o.lungeMax=.3;o.recoverMax=1.6;o.attackDamage=0;o.attackHit=false;o.stamina=Math.max(0,o.stamina-profile.cost);if(o.stamina<1)o.exhausted=true;o.attackMode='windup';this._event('windup',{kind:o.kind,attackKind:'tether',duration:.7,x:o.x,y:o.y});return true;}
      if(o.kind==='sentinel'||o.kind==='swarmer'){
        // Signature creatures: sentinels fire a radial shard ring after a long glow; swarmers make short, weak darts.
        const sentinel=o.kind==='sentinel';o.attackAngle=Math.atan2(target.y-o.y,target.x-o.x);o.angle=o.attackAngle;o.windupMax=sentinel?.9:.7;o.windup=sentinel?.9:0;o.attackRange=sentinel?400:130;o.attackWidth=o.r*1.4;o.lungeMax=.3;o.recoverMax=sentinel?1.7:.9;o.attackDamage=sentinel?15+tier*2.5:8+tier*1.5;o.attackHit=false;
        o.stamina=Math.max(0,o.stamina-profile.cost);if(o.stamina<1)o.exhausted=true;
        if(o.windup>0){o.attackMode='windup';this._event('windup',{kind:o.kind,attackKind:o.attackKind,duration:o.windupMax,x:o.x,y:o.y});}else this._releaseAttack(o);return true;
      }
      // Bounded prediction is committed once, never tracking a dodging target.
      // Every bite is announced: the creature rears for a moment (shown and heard) before it lunges along the line it
      // has already chosen. That moment is the time to step aside or block. It aims a little ahead of a moving target.
      const rear=(lancer?.4:.3)+Math.min(.3,.04*Math.max(0,(o.scale||1)-1)),lead=o.attackKind==='spores'?.28:rear+.1,dx=target.x-o.x+clamp(target.vx||0,-300,300)*lead,dy=target.y-o.y+clamp(target.vy||0,-300,300)*lead;
      o.attackAngle=Math.atan2(dy,dx);o.angle=o.attackAngle;o.windupMax=o.attackKind==='spores'?.7:rear;o.windup=o.windupMax;
      o.attackRange=o.attackKind==='spores'?610.5:armoured?95:lancer?310:apex?210:240;o.attackWidth=o.attackKind==='spores'?16:o.r*1.4;o.lungeMax=armoured?.32:lancer?.5:.4;o.recoverMax=apex?1.7:armoured?1.3:lancer?1.35:1.15;o.attackDamage=(apex?18:armoured?12:lancer?16:13)+tier*1.25;o.attackHit=false;
      if(sp&&sp.attack&&o.attackKind!=='spores'){const at=sp.attack;if(at.range)o.attackRange=at.range;if(at.damage)o.attackDamage=Math.min(100,at.damage*.5+tier*1.25);if(at.lunge)o.lungeMax=at.lunge;}
      o.stamina=Math.max(0,o.stamina-profile.cost);if(o.stamina<1)o.exhausted=true;
      if(o.windup>0){o.attackMode='windup';this._event('windup',{kind:o.kind,attackKind:o.attackKind,duration:o.windupMax,x:o.x,y:o.y});}else this._releaseAttack(o);return true;
    }
    _recoverAttack(o){o.windup=0;o.lungeTime=0;o.attackMode='recover';o.recoverTime=o.recoverMax;o.cooldown=o.recoverMax+(o.attackKind==='lunge'||o.attackKind==='bite'?.95:.15);
      const speed=length(o.vx,o.vy),limit=o.speed*.65;if(speed>limit){o.vx*=limit/speed;o.vy*=limit/speed;}
    }
    _releaseAttack(o){
      if(o.dead)return;if(o.attackKind==='tether'){o.tetherTime=1.3;o.charge=.3;this._recoverAttack(o);this._event('tether',{x:o.x,y:o.y});return;}
      if(o.attackKind==='shards'){this._shardRing(o,o.attackAngle,165);if(o.species&&SPECIES[o.species].doubleRing)o.ringAgain=.4;o.charge=.3;this._recoverAttack(o);return;}
      if(o.attackKind!=='spores'){o.attackMode='lunge';o.lungeTime=o.lungeMax;o.charge=o.lungeMax;return;}
      // Ranged species pause longer between volleys than an apex does.
      if(o.species&&SPECIES[o.species].ranged)o.recoverMax=1.7;
      const k=o.scale||1,ss=185*Math.sqrt(k);for(const offset of [-.16,0,.16]){const a=o.attackAngle+offset;this.state.projectiles.push({id:this._id++,x:o.x+Math.cos(a)*o.r,y:o.y+Math.sin(a)*o.r,vx:Math.cos(a)*ss,vy:Math.sin(a)*ss,r:8*k,life:o.attackRange/ss,damage:((o.species&&SPECIES[o.species].sporeDamage||21)+Math.min(o.tier,5)*2)*Math.pow(k,SIZE_POWER)*clamp(o.might||1,1,2),owner:'enemy',sourceId:o.id,colour:'#ed91c9'});}if(this.state.projectiles.length>80)this.state.projectiles.splice(0,this.state.projectiles.length-80);o.charge=.3;this._recoverAttack(o);
    }
    _projectiles(dt){
      const s=this.state,p=s.player;
      for(const shot of s.projectiles){if(shot.bossId&&(!s.bossEncounter||s.bossEncounter.id!==shot.bossId||s.bossEncounter.phase!==shot.bossPhase)){if(shot.remote||this.coop)shot.life=0;continue;}if(shot.warningTime>0){shot.warningTime=Math.max(0,shot.warningTime-dt);continue;}shot.life-=dt;if(shot.life<=0)shot.lapsed=true;if(shot.seek)this._seekShot(shot,dt);shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;if(shot.life<=0)continue;
        if(shot.owner==='player'&&this.coop&&!shot.remote&&shot.damage>0&&this._ff(v=>distance(shot,v)<v.r*.85+shot.r,shot.damage,shot.ffSeen||(shot.ffSeen=[]))&&!shot.pierce){shot.life=0;continue;}
        if(shot.owner==='player'){const b=s.bossEncounter;if(b&&shot.strike&&distance(shot,b)<b.r*.85+shot.r){const c=shot.strike;this._strikeBossHit({shape:c.shape,family:c.shape,traits:c.traits,damage:c.damage,ambush:c.ambush,ambushCredited:false,token:shot.attackToken});if(s.pendingEvolution)break;if(!shot.pierce){shot.life=0;continue;}}if(b&&distance(shot,b)<b.r*.85+shot.r){const glob=shot.venom&&!shot.reflected;if(glob)b.venomStacks=Math.min(p.venomMax||5,(b.venomStacks||0)+shot.venom);
          const landed=this._hitBoss(shot.damage,{token:shot.attackToken,defence:!!shot.reflected,noCritical:!!shot.reflected,poison:glob?4:shot.poison,poisonDamage:glob?b.venomStacks*this._venomTick():shot.poisonDamage,ambush:shot.ambush,family:shot.family||''});if(landed&&shot.ambush){for(const other of s.projectiles)if(other.ambushToken===shot.ambushToken)other.ambush=false;}shot.life=0;if(s.pendingEvolution)break;continue;}for(const o of s.organisms){if(!o.dead&&distance(shot,o)<o.r+shot.r){if(shot.strike){const c=shot.strike,d=length(shot.vx,shot.vy)||1,ctx={shape:c.shape,traits:c.traits,token:shot.attackToken,damage:c.damage,ambush:c.ambush,ambushCredited:false,struck:[],healed:c.healed||0};const landed=this._strikeHit(o,shot.vx/d,shot.vy/d,ctx);c.healed=ctx.healed;if(landed)c.ambush=false;this._chainFrom(ctx.struck);
            // A Needle threads through everything on its line (each target once, via the shot's token); darts stop at the first.
            if(shot.pierce)continue;shot.life=0;break;}if(shot.poison){o.poison=Math.max(o.poison||0,shot.poison);o.poisonDamage=Math.max(o.poisonDamage||0,shot.poisonDamage);}if(shot.ambush){this._creditAmbush(40);for(const other of s.projectiles)if(other.ambushToken===shot.ambushToken)other.ambush=false;}if(shot.venom&&!shot.reflected){if(shot.rupture&&(o.venomStacks||0)>=3)this._rupture(o);else this._addVenom(o,shot.venom);}this._hit(o,shot.damage,shot.vx/420,shot.vy/420,{token:shot.attackToken,defence:!!shot.reflected,noCritical:!!shot.reflected,family:shot.family||''});shot.life=0;break;}}}
        else if(shot.owner==='enemy'&&!shot.grazed&&this._fastNow()&&distance(shot,p)>=p.r+shot.r&&distance(shot,p)<p.r+shot.r+this._nearMissReach()*.7){shot.grazed=true;this._nearMiss(shot);}
        if(shot.owner==='enemy'&&shot.life>0&&s.brood&&s.brood.length){const hb=s.brood.find(b=>distance(b,shot)<b.r+shot.r);if(hb){hb.hp-=shot.damage*1.5;shot.life=0;this._particles(hb.x,hb.y,'#f3d48c',5,50);}}
        if(shot.owner!=='enemy'||shot.life<=0){}
        else if(distance(shot,p)<p.r+shot.r&&!shot.bossId&&this.random()<.3*this._mp('mirrorMembrane')){shot.owner='player';shot.reflected=true;shot.damage=Math.min(2000,shot.damage*(1+.4*this._pk('mirrorMembrane')));shot.vx*=-1.15;shot.vy*=-1.15;shot.life=Math.max(shot.life,1.4);shot.attackToken=this._id++;shot.colour='#d6f3fa';this._effect(p.x,p.y,'parry',p.r*1.6,'#d6f3fa',.35);}
        else if(distance(shot,p)<p.r+shot.r){{const bounce=p.parryTime>0&&this._hasMutation('barbedShell')&&p.invulnerable<=0&&!shot.bossId;this._damagePlayer(shot.damage,{...shot,kind:shot.bossId?'boss':(s.organisms.find(o=>o.id===shot.sourceId)?.kind||'toxin'),species:shot.bossId?undefined:s.organisms.find(o=>o.id===shot.sourceId)?.species,bossType:shot.bossId&&s.bossEncounter?s.bossEncounter.type:undefined});
          // With Barbed shell, a hardened body sends venom back the way it came.
          if(bounce){shot.owner='player';shot.reflected=true;shot.vx*=-1.1;shot.vy*=-1.1;shot.damage*=1.15;shot.life=Math.max(shot.life,1.6);shot.attackToken=this._id++;shot.colour='#efd999';continue;}}shot.life=0;}
        if(shot.owner==='enemy'&&!shot.bossId&&shot.life>0&&!s.bossEncounter){const attacker=s.organisms.find(o=>o.id===shot.sourceId&&!o.dead);if(attacker){const v=s.organisms.find(v=>this._canHunt(attacker,v)&&distance(shot,v)<v.r+shot.r);if(v){this._ecosystemHit(v,shot.damage,attacker);shot.life=0;}}}
        if(s.pendingEvolution)break;
      }
      if(this._hasMutation('clingingVenom'))for(const shot of s.projectiles){if(shot.life>0||!shot.lapsed||shot.owner!=='player'||shot.family!=='venomist'||!shot.venom||shot.reflected)continue;if(!s.pools)s.pools=[];const life=3*this._mp('clingingVenom');s.pools.push({x:shot.x,y:shot.y,r:(34+p.r*.6)*(1+.25*this._pk('clingingVenom')),life,maxLife:life,tick:0});if(s.pools.length>12)s.pools.shift();}
      s.projectiles=s.projectiles.filter(x=>x.life>0).slice(-80);
      if(s.pools&&s.pools.length){for(const q of s.pools){q.life-=dt;q.tick-=dt;if(q.tick<=0){q.tick+=.5;for(const o of s.organisms)if(!o.dead&&!o.bossId&&distance(o,q)<q.r+o.r*.5)this._addVenom(o,1);}}s.pools=s.pools.filter(q=>q.life>0);}
    }
    _hazards(dt){
      const s=this.state,p=s.player;
      for(const h of s.hazards){h.active=h.pulse?Math.max(0,Math.sin(s.time*.7+h.phase)):h.kind==='toxin'?.8+.2*Math.sin(s.time*.75+h.phase):Math.max(0,Math.sin(s.time*.9+h.phase));if(h.active>.45&&distance(p,h)<h.r*.75+p.r*.5){this._damagePlayer((h.kind==='toxin'?12:9)*waterPower(h.x,h.y),h);}}
    }
    _animate(dt){
      const s=this.state;
      for(const a of s.particles){a.life-=dt;a.x+=a.vx*dt;a.y+=a.vy*dt;a.vx*=Math.exp(-dt*2);a.vy*=Math.exp(-dt*2);}
      s.particles=s.particles.filter(a=>a.life>0);
      for(const e of s.effects){e.life-=dt;e.r=e.maxR*(1-Math.pow(Math.max(0,e.life/e.maxLife),2));}
      s.effects=s.effects.filter(e=>e.life>0);
      for(const d of s.decoys){d.life-=dt;d.x+=Math.cos(d.angle)*20*dt;d.y+=Math.sin(d.angle)*20*dt;if(s.organisms.some(o=>(o.kind==='hunter'||o.kind==='apex'||o.kind==='swarmer')&&distance(o,d)<o.r+d.r*.6))d.life-=dt*3;}
      if(this._hasMutation('toxicHusk'))for(const d of s.decoys){if(d.remote||d.life>0||d.burst)continue;d.burst=true;const R=(d.r+120)*(1+.25*this._pk('toxicHusk')),n=Math.round(3*this._mp('toxicHusk'));for(const o of s.organisms)if(!o.dead&&!o.bossId&&distance(o,d)<R+o.r)this._addVenom(o,n);this._effect(d.x,d.y,'burst',R,'#b7ef91',.5);}
      s.decoys=s.decoys.filter(d=>d.life>0);
    }
    _replenish(){
      const s=this.state,p=s.player;
      this._legendClock=(Number.isFinite(this._legendClock)?this._legendClock:150)-2;if(this._legendClock<=0){this._legendClock=this.range(170,280);this._summonLegend();}
      this._pondEvents(2);this._legendHerds();
      for(const meta of Object.values(this._chunks)){
        meta.foodClock-=2;meta.mobClock-=2;
        if(meta.foodClock<=0){meta.foodClock=7;const n=s.foods.filter(f=>f.home===meta.key).length;if(n<30)this._chunkRandom(meta,()=>{for(let i=0;i<4;i++){const fx=(meta.cx+.15+this.random()*.7)*CHUNK,fy=(meta.cy+.15+this.random()*.7)*CHUNK,kind=this.random()<(meta.biome===1?.38:.20)?'mineral':'algae';if(!this._inView(fx,fy,80))this._food(fx,fy,kind,undefined,meta.key,meta.biome);}});}
        if(meta.mobClock<=0){meta.mobClock=35;const n=s.organisms.filter(o=>o.home===meta.key&&!o.dead).length;if(n<3&&!this._peerKeeps(meta)&&this.random()<this._lifeDensity((meta.cx+.5)*CHUNK,(meta.cy+.5)*CHUNK))this._chunkRandom(meta,()=>{if(!this._inView((meta.cx+.5)*CHUNK,(meta.cy+.5)*CHUNK,CHUNK*.6)&&this._signatureLife(meta.key,meta.cx,meta.cy,meta.biome,[],true))return;const x=(meta.cx+.15+this.random()*.7)*CHUNK,y=(meta.cy+.15+this.random()*.7)*CHUNK;if(length(x-p.x,y-p.y)<520||this._inView(x,y,200))return;const r=this.random();let kind=r<.5?'prey':r<.75?'grazer':r<.9?'hunter':'armoured';if(length(x,y)<NURSERY_RADIUS&&kind!=='grazer')kind='prey';const sp=this._rollSpecies(x,y,meta.biome,.4,HOSTILE_KINDS.includes(kind));if(sp)this._spawnSpecies(sp,x,y,{home:meta.key,biome:meta.biome});else this._organism(kind,x,y,{home:meta.key,biome:meta.biome});});}
      }
    }
    // ---- Co-op ------------------------------------------------------------------------------------------
    // Every device runs its own player. Each creature has exactly one owner: the device that runs its
    // behaviour, normally that of the player it is nearest to or fighting. Every other device shows the
    // creature as a "puppet" drawn from the owner's updates. A hit on a puppet is worked out locally, so it
    // feels instant, and then reported to the owner. Ownership is handed over as players and creatures move,
    // so a creature attacking you is always run on your own device and your dodges are never late.
    // Messages leave through drainNet() and arrive through applyNet(); the engine knows nothing about how
    // they travel.
    startCoop(me,fresh=true,late=false){
      this.coop={me,clock:0,peers:new Map(),out:[],gone:new Map(),bodyClock:0,sendClock:0,houseClock:0,lookClock:0,lookKey:'',down:0,wiped:false};
      // Every device numbers the things it makes from its own random block, so two devices never use the same number.
      this._id=(1+Math.floor(Math.random()*60000))*4294967296+1;
      {const s=this.state,cache=Object.values(this._chunkCache||{}),all=[...s.organisms,...cache.flatMap(c=>c.organisms||[])],map=new Map();
        for(const o of all){map.set(o.id,this._id);o.id=this._id++;}const fix=v=>map.has(v)?map.get(v):v;
        for(const o of all){for(const k of ['targetId','leaderId','huntBrood','parentId'])if(o[k]!==undefined)o[k]=fix(o[k]);o.attackTokens=[];}
        for(const l of [...s.landmarks,...cache.flatMap(c=>c.landmarks||[])])if(Array.isArray(l.guardianIds))l.guardianIds=l.guardianIds.map(fix);
        s.player.broodTargetId=fix(s.player.broodTargetId);for(const x of s.projectiles){if(x.sourceId!==undefined)x.sourceId=fix(x.sourceId);if(x.seekId!==undefined)x.seekId=fix(x.seekId);}}
      // In a new pond the first player's device populates the starting water; the others arrive beside it.
      if(fresh&&me>0){this.state.player.x+=70*(1+(me-1)%8);this.coop.arriving=true;}
      // Back from my own checkpoint into a party that carried on without me: where any of them already has the water, theirs is the up-to-date world.
      if(late)this.coop.arriving=this.coop.late=true;
      return this;
    }
    // What is hunting my player right now, if anything: 'boss', 'predator' or ''.
    coopHunted(){
      const s=this.state,p=s.player,b=s.bossEncounter;if(!this.coop||s.status!=='playing')return'';
      if(b&&!b.puppet&&b.hp>0)return'boss';
      return s.organisms.some(o=>!o.dead&&!o.puppet&&isHostile(o)&&this._engaged(o)&&distance(o,p)<520+o.r)?'predator':'';
    }
    // Small party-wide notices the interface acts on (a checkpoint, a return to the checkpoint).
    coopSignal(kind,data=null){if(this.coop)this._net(-1,{t:'u',k:kind,d:data});}
    // Going down: the body stays where it fell. A friend who stays on it revives it; if nobody does in time, or
    // everyone is down at once, the whole party returns to its last checkpoint.
    coopDown(){const c=this.coop;if(!c||this.state.status!=='dead'||c.down>0)return false;c.down=COOP_DOWN_SECONDS;c.bodyClock=0;return true;}
    coopDownState(){
      const c=this.coop;if(!c||!(c.down>0))return null;let helper=-1,progress=0;
      for(const q of c.peers.values()){const b=q.body;if(b&&b.rv&&b.rv[0]===c.me&&b.rv[1]>progress){progress=b.rv[1];helper=q.id;}}
      return{time:c.down,helper,progress};
    }
    _coopWipe(){const c=this.coop;if(c.wiped)return;c.wiped=true;this._event('coopWipe',{});}
    _net(to,msg){this.coop.out.push({to,msg});}
    // Friendly fire. My own attacks hurt the other players they touch. I decide what I hit (from where I see them) and tell that
    // player's device, which takes the damage through its own defences (block, shields, resistance) like any other blow.
    // "seen" stops one attack from hitting the same player twice.
    _ff(test,damage,seen=null){
      const c=this.coop;if(!c||!(damage>0)||this.state.status!=='playing')return false;let any=false;
      for(const q of c.peers.values()){const b=q.body;if(!b||!b.active||!b.alive||!Number.isFinite(b.x)||!(b.r>0))continue;if(seen&&!Array.isArray(seen))seen=null;if(seen&&seen.includes(q.id))continue;if(!test(b))continue;if(seen)seen.push(q.id);
        this._net(q.id,{t:'ff',a:damage,x:this.state.player.x,y:this.state.player.y});this._effect(b.x,b.y,'hit',Math.min(10000,b.r*1.4),'#ffb3a8',.3);any=true;}
      return any;
    }
    drainNet(){const c=this.coop;if(!c)return[];const out=c.out;c.out=[];return out;}
    coopPeers(){return this.coop?[...this.coop.peers.values()].filter(q=>q.body&&q.body.r).map(q=>q.body):[];}
    _coopActive(){const s=this.state;return !this.coop.away&&s.status==='playing'&&!s.paused&&!s.pendingEvolution;}
    // Is this creature busy with my own player? If so it stays on my device.
    _engaged(o){return (o.chasing&&o.targetId===0)||o.windup>0||o.lungeTime>0||o.latchTime>0||o.tetherTime>0||o.vortexTime>0||!!o.huntBrood;}
    // For water I am about to load: is it already another player's? Yes if they were in range of it before my
    // last look, or, when we arrive together, if theirs is the lower player number. Otherwise it is mine to fill.
    _peerHad(key){
      const [cx,cy]=key.split(',').map(Number),near=(x,y,R)=>Math.abs(x-cx)<=R&&Math.abs(y-cy)<=R;
      for(const q of this.coop.peers.values()){const b=q.body;if(!b||!b.active||!Number.isFinite(b.x))continue;
        if(q.was&&near(q.was[0],q.was[1],q.was[2]||2))return true;
        // Where they are, and where they will be in a moment: what I see of them is a little behind, so two players crossing into new water together would both fill it.
        if(q.id<this.coop.me){const R=b.lr||2,vx=Number.isFinite(b.vx)?b.vx:0,vy=Number.isFinite(b.vy)?b.vy:0;if(near(Math.floor(b.x/CHUNK),Math.floor(b.y/CHUNK),R)||near(Math.floor((b.x+vx*.8)/CHUNK),Math.floor((b.y+vy*.8)/CHUNK),R))return true;}}
      return false;
    }
    // How many other players are swimming near mine (none in a solo life).
    _partyNear(){const c=this.coop;if(!c)return 0;const p=this.state.player;let n=0;for(const q of c.peers.values()){const b=q.body;if(b&&b.active&&Number.isFinite(b.x)&&length(b.x-p.x,b.y-p.y)<2000)n++;}return n;}
    _peerHolding(key){
      const [cx,cy]=key.split(',').map(Number);
      for(const q of this.coop.peers.values()){const b=q.body;if(!b||!b.active)continue;const R=b.lr||2;if(Math.abs(Math.floor(b.x/CHUNK)-cx)<=R&&Math.abs(Math.floor(b.y/CHUNK)-cy)<=R)return q;}
      return null;
    }
    // A creature as sent to another device. "full" adds the behaviour fields a new owner needs.
    _wire(o,full=false){
      const out={};
      for(const k in o){if(COOP_LOCAL.has(k)||(!full&&COOP_PRIVATE.has(k)))continue;const v=o[k];out[k]=typeof v==='number'&&!Number.isInteger(v)?Math.round(v*100)/100:v;}
      if(full)out.cr=(o.credit||0)+(o.remoteCredit||0);
      return out;
    }
    // Taking a creature over: clear the puppet bookkeeping and make sure every behaviour field is present.
    _adopt(o){
      if(Number.isFinite(o._ta))o.angle=o._ta;for(const k of ['puppet','owner','_seen','_tx','_ty','_n','_dealt','_ownerHp','_bit','_ta'])delete o[k];
      o.targetId=-1;o.chasing=false;o.foraging=false;o.pursuit=0;o.home=this._home(o.x,o.y);o.biome=this._biomeAt(o.x,o.y);
      const fill={cooldown:.5,stamina:this._profile(o).capacity,exhausted:false,tx:Math.cos(o.angle||0),ty:Math.sin(o.angle||0),wander:1,lastSeenX:o.x,lastSeenY:o.y,fedTime:0,anchorX:o.x,anchorY:o.y,flee:0,stun:0,charge:0,flash:0,slowTime:0,venomStacks:0,windup:0,lungeTime:0,recoverTime:0};
      for(const k in fill)if(typeof o[k]!==typeof fill[k]||(typeof fill[k]==='number'&&!Number.isFinite(o[k])))o[k]=fill[k];
      // Its attack state must agree with its timers, and its numbers must be ones a creature can really have.
      const fin=(v,d)=>Number.isFinite(v)?v:d,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));o.angle=wrap(fin(o.angle,0));o.attackAngle=wrap(fin(o.attackAngle,o.angle));o.attackHit=o.attackHit===true;o.dead=o.dead===true;o.windupMax=clamp(fin(o.windupMax,.75),.1,.9);o.lungeMax=clamp(fin(o.lungeMax,.4),.1,.5);o.recoverMax=clamp(fin(o.recoverMax,1.15),.1,1.7);o.windup=clamp(o.windup,0,.9);o.lungeTime=clamp(o.lungeTime,0,.5);o.recoverTime=clamp(o.recoverTime,0,1.7);o.attackRange=clamp(fin(o.attackRange,0),0,6000);o.attackWidth=clamp(fin(o.attackWidth,o.r*1.4),0,14000);o.attackDamage=clamp(fin(o.attackDamage,0),0,2000);o.tier=clamp(Math.round(fin(o.tier,0)),0,10);o.maxHp=clamp(fin(o.maxHp,1),1,1e6);o.vx=clamp(fin(o.vx,0),-1e4,1e4);o.vy=clamp(fin(o.vy,0),-1e4,1e4);o.tx=clamp(o.tx,-1,1);o.ty=clamp(o.ty,-1,1);o.lastSeenX=o.x;o.lastSeenY=o.y;for(const k of ['hue','phase','wander','speed'])o[k]=clamp(fin(o[k],0),0,10000);o.cooldown=Math.min(fin(o.cooldown,.5),10000);if(o.poison!==undefined){o.poison=clamp(fin(o.poison,0),0,10);o.poisonDamage=clamp(fin(o.poisonDamage,0),0,1000);}if(o.nestId!==undefined&&!(typeof o.nestId==='string'&&/^lm:-?\d+,-?\d+$/.test(o.nestId)&&Number.isInteger(o.nestSlot)&&o.nestSlot>=0&&o.nestSlot<=2)){delete o.nestId;delete o.nestSlot;}
      o.attackMode=o.windup>0?'windup':o.lungeTime>0?'lunge':o.recoverTime>0?'recover':'idle';if(o.elite!=='lancer')o.elite='';if(!['','lunge','bite','spores','shards','tether'].includes(o.attackKind))o.attackKind='';
      o.hp=clamp(o.hp,-1e6,o.maxHp);o.stamina=clamp(o.stamina,0,this._profile(o).capacity);o.fedTime=clamp(o.fedTime,0,12);o.pursuit=0;for(const k of ['flee','stun','charge','flash'])o[k]=clamp(o[k],0,12);o.slowTime=clamp(o.slowTime,0,2);
      return o;
    }
    // Everything arriving from another device is checked before use: a damaged or unexpected message must
    // never be able to break this game. Returns the cleaned creature record, or null to ignore it.
    _coopClean(e,full){
      if(!e||typeof e!=='object'||!Number.isInteger(e.id)||e.id<1)return null;const out={};
      for(const k in e){if(k[0]==='_'||COOP_LOCAL.has(k)||k==='constructor'||k==='prototype')continue;const v=e[k];
        if(typeof v==='number'){if(!Number.isFinite(v)||Math.abs(v)>1e15)return null;out[k]=v;}
        else if(typeof v==='boolean'||v===null)out[k]=v;
        else if(typeof v==='string'){if(v.length<=60)out[k]=v;}
        else if(k==='drift'&&v&&Number.isFinite(v.vx)&&Number.isFinite(v.vy))out[k]={vx:clamp(v.vx,-500,500),vy:clamp(v.vy,-500,500)};}
      if(full){
        if(!ORGANISM_KINDS.includes(out.kind)||(out.species!==undefined&&!Object.hasOwn(SPECIES,out.species)))return null;
        for(const k of ['x','y','vx','vy','angle','r','hp','maxHp','speed','attackRange','attackWidth','lungeMax','windupMax','recoverMax','attackDamage','tier','scale'])if(typeof out[k]!=='number')return null;
        if(!(out.lungeMax>0&&out.lungeMax<10)||!(out.windupMax>0&&out.windupMax<10)||!(out.recoverMax>0&&out.recoverMax<10)||!(out.scale>0&&out.scale<200)||!(out.speed>=0&&out.speed<5000)||out.tier<0||out.tier>50)return null;
        if(!(out.r>0&&out.r<=6000)||!(out.maxHp>0)||(out.elite!==undefined&&typeof out.elite!=='string'))return null;
        if(out.nestId!==undefined&&typeof out.nestId!=='string')return null;
      }else{delete out.kind;delete out.species;if(out.r!==undefined&&!(out.r>0&&out.r<=6000))return null;}
      return out;
    }
    _give(o,to){
      const c=this.coop;this._net(to,{t:'g',o:this._wire(o,true)});
      o.puppet=true;o.owner=to;o._seen=c.clock;o._tx=o.x;o._ty=o.y;o._n=null;o._dealt=[];o.targetId=-1;o.chasing=false;
    }
    coopTick(dt){
      const c=this.coop;if(!c||!(dt>0))return;const s=this.state,p=s.player;c.clock+=dt;
      // Positions arrive about 20 times a second. Each player is drawn about a tenth of a second behind, gliding
      // between the two positions on either side of that moment, so they move as smoothly as my own cell.
      for(const q of c.peers.values()){const b=q.body;if(!b)continue;const S=q.samples;
        if(S&&S.length){const at=c.clock-COOP_VIEW_DELAY;let i=S.length-1;while(i>0&&S[i].t>at)i--;const a=S[i],n=S[i+1];
          if(n&&n.t>a.t){const k=clamp((at-a.t)/(n.t-a.t),0,1);b.x=a.x+(n.x-a.x)*k;b.y=a.y+(n.y-a.y)*k;b.angle=a.angle+Math.atan2(Math.sin(n.angle-a.angle),Math.cos(n.angle-a.angle))*k;}
          else{const ahead=clamp(at-a.t,0,.25);b.x=a.x+a.vx*ahead;b.y=a.y+a.vy*ahead;b.angle=a.angle;}
          while(S.length>2&&S[1].t<at)S.shift();}
        if(b.brood)for(const v of b.brood){v.x+=v.vx*dt;v.y+=v.vy*dt;}
        if(b.decoys&&b.decoys.length){for(const d of b.decoys)d.life-=dt;b.decoys=b.decoys.filter(d=>d.life>0);}}
      // Other players' decoys stand in my water too, so the creatures my device runs are fooled by them as well.
      {const key=v=>v.wid?'w'+v.wo+':'+v.wid:Math.round(v.x)+','+Math.round(v.y)+':'+Math.round(v.maxLife*10),gone=this._wpGone||(this._wpGone=new Set()),had=(s.vortices||[]).filter(v=>v.remote&&!v.ending),theirs=[...c.peers.values()].flatMap(q=>q.body&&Array.isArray(q.body.wp)?q.body.wp.map(v=>v.wid?{...v,wo:q.id}:v):[]).filter(v=>!gone.has(key(v)));
        if(had.length||theirs.length){const keep=new Map(had.map(v=>[key(v),v])),now=new Set(theirs.map(key));
          for(const v of had)if(!now.has(key(v))){v.ending=true;v.life=Math.min(v.life,.001);gone.add(key(v));}
          s.vortices=[...(s.vortices||[]).filter(v=>!v.remote||v.ending),...theirs.map(v=>{const old=keep.get(key(v));return old?Object.assign(old,v.wid?{x:v.x,y:v.y,life:Math.min(old.life,v.life)}:{life:Math.min(old.life,v.life)}):{...v};})];if(gone.size>40)gone.clear();}}
      if(s.decoys.some(d=>d.remote)||[...c.peers.values()].some(q=>q.body&&q.body.decoys&&q.body.decoys.length)){s.decoys=s.decoys.filter(d=>!d.remote);for(const q of c.peers.values())if(q.body&&q.body.decoys)for(const d of q.body.decoys)s.decoys.push({...d});}
      for(const e of s.effects)if(e.follow!==undefined){const q=c.peers.get(e.follow);if(q&&q.body){e.x=q.body.x;e.y=q.body.y;}}
      c.bodyClock-=dt;if(c.bodyClock<=0){c.bodyClock=Math.max(c.bodyClock+.05,.02);
        const r2=v=>Math.round(v*100)/100;
        const body={t:'p',ts:Math.round(c.clock*1000)/1000,x:r2(p.x),y:r2(p.y),vx:r2(p.vx),vy:r2(p.vy),angle:r2(p.angle),hp:r2(p.hp),maxHp:r2(p.maxHp),r:r2(p.r),stealth:r2(p.stealth||0),hurt:r2(p.hurt||0),invulnerable:r2(p.invulnerable||0),sprinting:!!p.sprinting,sneaking:!!p.sneaking,exhausted:!!p.exhausted,alive:!!p.alive,active:this._coopActive(),lr:this._loadRadius(),decoys:s.decoys.filter(d=>!d.remote).slice(0,2).map(d=>({x:Math.round(d.x),y:Math.round(d.y),r:r2(d.r),life:r2(d.life),maxLife:r2(d.maxLife),angle:r2(d.angle),phase:r2(d.phase||0)})),wp:(this._coopActive()?s.vortices||[]:[]).filter(v=>!v.remote).slice(0,1).map(v=>({wid:v.wid||0,x:Math.round(v.x),y:Math.round(v.y),R:r2(v.R),life:r2(v.life),maxLife:r2(v.maxLife),holdR:r2(v.holdR),grind:r2(v.grind),slam:r2(v.slam),grip:r2(v.grip)})),down:c.down>0?Math.ceil(c.down):0,rv:c.reviving||null,brood:(s.brood||[]).slice(0,12).map(b=>({x:Math.round(b.x),y:Math.round(b.y),vx:Math.round(b.vx||0),vy:Math.round(b.vy||0),r:r2(b.r||6),phase:r2(b.phase||0)}))};
        // Players near me hear where I am 20 times a second. Players far away only need it now and then (for the
        // arrow that points to me), so they get every fifth update: that keeps a big party's traffic down.
        c.bodyTick=(c.bodyTick||0)+1;if(c.bodyTick%5===0)this._net(-1,body);else for(const q of c.peers.values()){const b=q.body;if(!b||!Number.isFinite(b.x)||length(b.x-p.x,b.y-p.y)<3200)this._net(q.id,body);}
      }
      // Down: count towards the party's return. Nobody left to help makes it short.
      if(c.down>0&&!c.wiped){
        const others=[...c.peers.values()].filter(q=>q.body&&q.body.r);if(!others.length&&!(c.clock-(c.quietAt??-1e9)<45))c.down=Math.min(c.down,3);
        c.down-=dt;const allDown=others.length>0&&others.every(q=>q.body.down>0);
        if(c.down<=0||allDown){c.down=Math.max(c.down,.01);this.coopSignal('wipe');this._coopWipe();}
      }
      // Reviving: stay touching a downed friend. Being hit does not interrupt it; drifting off loses progress gradually (a knock-back does not undo it).
      c.reviving=null;
      if(this._coopActive())for(const q of c.peers.values()){const b=q.body;if(!b||!(b.down>0)){q.rev=0;continue;}if(length(b.x-p.x,b.y-p.y)>p.r+b.r+16){q.rev=Math.max(0,(q.rev||0)-dt);continue;}
        q.rev=(q.rev||0)+dt;c.reviving=[q.id,Math.round(q.rev/COOP_REVIVE_SECONDS*100)/100];
        if(q.rev>=COOP_REVIVE_SECONDS){q.rev=0;b.down=0;this._net(q.id,{t:'v'});this._event('coopHelped',{peer:q.id});}
      }
      c.lookClock-=dt;const key=p.stage+'|'+FAMILIES.map(f=>p.traits[f]+(p.forks[f+2]||'')+(p.forks[f+4]||'')).join('')+'|'+p.mutations.join(',')+'|'+p.strike;
      if(key!==c.lookKey||c.lookClock<=0){c.lookKey=key;c.lookClock=4;this._net(-1,{t:'l',body:JSON.parse(JSON.stringify(p))});}
      c.sendClock-=dt;if(c.sendClock<=0){c.sendClock=1/12;this._coopReports();this._coopSnapshots();}
      c.houseClock-=dt;if(c.houseClock<=0){c.houseClock=.25;this._coopHouse();}
    }
    // Tell each owner what my player did to its creatures since the last report: damage, poison, slows, knockback.
    _coopReports(){
      for(const o of this.state.organisms)if(o.puppet&&!o.dead)this._coopReport(o);
    }
    _coopReport(o){
      const c=this.coop;{const n=o._n;if(!n){o._n=this._baseline(o);return;}
        const m={t:'d',id:o.id};let any=false;
        if(o.hp<n.hp-.005){m.dmg=Math.round((n.hp-o.hp)*100)/100;any=true;(o._dealt||(o._dealt=[])).push([c.clock,m.dmg]);}
        if(o.credit>n.credit+.005){m.cr=Math.round((o.credit-n.credit)*100)/100;any=true;}
        for(const k of COOP_STATUS){const v=o[k]||0;if(v>(n[k]||0)+.02){(m.st||(m.st={}))[k]=Math.round(v*100)/100;any=true;}}
        const ivx=o.vx-n.vx,ivy=o.vy-n.vy;if(Math.abs(ivx)+Math.abs(ivy)>1){m.iv=[Math.round(ivx),Math.round(ivy)];any=true;}
        if(any)this._net(o.owner,m);
        o._n=this._baseline(o);
      }
    }
    _baseline(o){const n={hp:o.hp,credit:o.credit||0,vx:o.vx,vy:o.vy};for(const k of COOP_STATUS)n[k]=o[k]||0;return n;}
    // Send each player the creatures I own that are near them: everything once, then only what changed.
    _coopSnapshots(){
      const c=this.coop,s=this.state;
      for(const q of c.peers.values()){const b=q.body;if(!b)continue;const list=[],fresh=new Map();let introduced=0;
        for(const o of s.organisms){if(o.puppet||o.dead||length(o.x-b.x,o.y-b.y)>coopSight(b)+o.r)continue;
          let last=q.known.get(o.id);
          if(!last){if(introduced>=8)continue;introduced++;last=this._wire(o);list.push({...last});}
          else{const d={id:o.id};for(const k in o){if(COOP_LOCAL.has(k)||COOP_PRIVATE.has(k))continue;let v=o[k];if(v!==null&&typeof v==='object')continue;if(typeof v==='number'&&!Number.isInteger(v))v=Math.round(v*100)/100;if(last[k]!==v){d[k]=v;last[k]=v;}}list.push(d);}
          fresh.set(o.id,last);
        }
        q.known=fresh;if(list.length)this._net(q.id,{t:'o',l:list});
      }
      const boss=s.bossEncounter;if(boss&&!boss.puppet){const w={...boss};delete w.myDamage;delete w._bit;delete w.heldUntil;c.bossTick=(c.bossTick||0)+1;
        // Everyone hears about the party's boss, however far away they are (those far off, once a second).
        for(const q of c.peers.values())if(q.body&&(length(q.body.x-boss.x,q.body.y-boss.y)<4000+boss.r||c.bossTick%12===0))this._net(q.id,{t:'b',b:w});}
      // Shots are sent once, when fired: they fly in a straight line, so every device can carry them on alone.
      for(const shot of s.projectiles){if(shot.remote||shot.sent)continue;shot.sent=true;const copy={...shot};delete copy.strike;delete copy.sent;this._net(-1,{t:'s',s:copy});}
    }
    _coopHouse(){
      const c=this.coop,s=this.state,p=s.player,active=this._coopActive();
      for(const [id,at] of c.gone)if(c.clock-at>12)c.gone.delete(id);
      // Nothing heard from a player for a while (their page is in the background, or they have gone): carry on without them until they are heard again.
      for(const q of [...c.peers.values()])if(c.clock-q.heard>8){c.quietAt=c.clock;this.peerLeft(q.id);}
      let dropped=false;
      for(const o of s.organisms){if(o.dead)continue;
        if(o.puppet){if(c.clock-o._seen>1.2||!c.peers.has(o.owner)){o.dead=true;dropped=true;}continue;}
        if(!(o.poison>0))delete o.venomFrom;if(!(o.bleed>0))delete o.bleedFrom;
        if(o.dotOut){for(const k in o.dotOut){const [from,fam]=k.split('|');if(c.peers.has(+from))this._net(+from,{t:'c',id:o.id,a:Math.round(o.dotOut[k]*100)/100,f:fam});}delete o.dotOut;}
        // Threat fades: what counts is who has been hurting it lately.
        if(o.threatMine)o.threatMine*=.95;if(o.threatBy)for(const k in o.threatBy)o.threatBy[k]*=.95;
        // A creature goes for whoever threatens it most: the player who has hurt it most lately, with nearness
        // counting for a little, and for nothing once someone has drawn blood. It finishes an attack it has begun
        // before turning. While I am paused, dead or choosing a path, everything near another player goes to them.
        if((o.bossId&&active)||o.nestId||(o.heldUntil||0)>c.clock||(active&&(o.windup>0||o.lungeTime>0||o.latchTime>0||o.tetherTime>0||o.vortexTime>0)))continue;
        if(active&&isHostile(o)){
          const big=Math.max(1,o.scale||1),score=(threat,d)=>(threat||0)/Math.max(1,o.maxHp)*100+Math.max(0,12*(1-d/(600*big))),mine=score(o.threatMine,length(o.x-p.x,o.y-p.y));let top=null,ts=-1;
          for(const q of c.peers.values()){const b=q.body;if(!b||!b.active||b.down>0)continue;const d=length(o.x-b.x,o.y-b.y);if(d>900*big)continue;const sc=score(o.threatBy&&o.threatBy[q.id],d);if(sc>ts){ts=sc;top=q;}}
          if(top&&ts>mine*1.25+2){this._give(o,top.id);continue;}
          if(length(o.x-p.x,o.y-p.y)<900*big)continue;
        }
        // A creature of mine that has ended up in water I do not have loaded, with no player near it, is let go.
        if(!this._chunks[this._home(o.x,o.y)]&&!o.bossId){let seen=false;for(const q of c.peers.values())if(q.body&&length(o.x-q.body.x,o.y-q.body.y)<coopSight(q.body))seen=true;if(!seen){o.dead=true;o.letGo=true;dropped=true;continue;}}
        let best=null,bd=Infinity;for(const q of c.peers.values()){const b=q.body;if(!b||!b.active)continue;const d=length(o.x-b.x,o.y-b.y);if(d<bd){bd=d;best=q;}}
        if(!best)continue;const mine=length(o.x-p.x,o.y-p.y);
        if(active?bd<mine*.7&&bd<1200:bd<COOP_SIGHT)this._give(o,best.id);
      }
      if(dropped&&!active)s.organisms=s.organisms.filter(o=>!o.dead);
      // Remains left in water I do not have loaded cannot be kept.
      if(s.foods.some(f=>!this._chunks[f.home]))s.foods=s.foods.filter(f=>this._chunks[f.home]||(this._chunks[this._home(f.x,f.y)]&&(f.home=this._home(f.x,f.y))));
      const boss=s.bossEncounter;
      if(boss&&boss.puppet&&(c.clock-boss._seen>5||!c.peers.has(boss.owner))){let heir=c.me;for(const [qid,q] of c.peers)if(qid!==boss.owner&&q.body&&q.body.active&&qid<heir)heir=qid;
        if(heir===c.me&&this._coopActive()){const p=s.player;delete boss.puppet;delete boss.owner;delete boss._seen;Object.assign(boss,{mode:boss.mode==='transform'?'transform':'hunt',attackKind:'',windup:0,actTime:0,cooldown:Math.max(1.5,boss.cooldown||0),lastSeenX:p.x,lastSeenY:p.y,lostTime:0,lastBlow:s.time,nextMeal:s.time+4,tire:0,grab:null,unit:100*bossPower(boss.type)*(BOSSES[boss.type]?.dmg||1)});delete boss.grab;}
        else if(c.clock-boss._seen<15&&heir!==c.me){}
        else{s.projectiles=s.projectiles.filter(x=>x.bossId!==boss.id);
        // Remember what I had done to it, and do not rush to make a boss of my own: its owner may only have dropped out for a moment.
        c.bossMemo={id:boss.id,myDamage:boss.myDamage||0,huntCredit:boss.huntCredit||0};c.bossHold=c.clock+12;s.bossEncounter=null;}}
      // A boss whose player is down or away turns on the nearest player still standing.
      if(boss&&!boss.puppet&&!active){let best=null,bd=Infinity;for(const q of c.peers.values()){const b=q.body;if(!b||!b.active)continue;const d=length(boss.x-b.x,boss.y-b.y);if(d<bd){bd=d;best=q;}}
        if(best&&!((boss.heldUntil||0)>c.clock)){const w={...boss};delete w.myDamage;delete w.heldUntil;this._net(best.id,{t:'bg',b:w});boss.puppet=true;boss.owner=best.id;boss._seen=c.clock;}}
    }
    // A player has gone. Their creatures near the rest of us carry on: the remaining device with the lowest
    // player number takes them over, and the others keep watching them through it.
    peerLeft(id){
      const c=this.coop;if(!c||!c.peers.has(id))return;c.peers.delete(id);
      const heir=Math.min(c.me,...c.peers.keys()),lowest=heir===c.me;
      for(const o of this.state.organisms){if(!o.puppet||o.owner!==id)continue;
        if(lowest)this._adopt(o);
        else{o._seen=c.clock;o.owner=heir;}
      }
      const b=this.state.bossEncounter;if(b&&b.puppet&&b.owner===id){if(lowest&&this._coopActive()){const p=this.state.player;delete b.puppet;delete b.owner;delete b._seen;Object.assign(b,{mode:b.mode==='transform'?'transform':'hunt',attackKind:'',windup:0,actTime:0,cooldown:Math.max(1.5,b.cooldown||0),lastSeenX:p.x,lastSeenY:p.y,lostTime:0,lastBlow:this.state.time,nextMeal:this.state.time+4,tire:0,unit:100*bossPower(b.type)*(BOSSES[b.type]?.dmg||1)});delete b.grab;}else{b.owner=heir;b._seen=c.clock;}}
    }
    // The page is about to go into the background (a phone call, another app): pass my creatures on first,
    // because a hidden page stops running and they would freeze for everyone else.
    coopAway(away){const c=this.coop;if(!c||!!c.away===!!away)return;c.away=!!away;c.bodyClock=0;if(away)this._coopHouse();this.coopTick(1e-4);}
    // Back on your feet after going down (the full downed-and-revive rules come later).
    coopRevive(){
      const c=this.coop,s=this.state,p=s.player;if(!c||s.status!=='dead')return false;c.down=0;c.bodyClock=0;
      p.alive=true;p.hp=p.maxHp*.4;p.energy=p.maxEnergy;p.nutrition=Math.max(p.nutrition,50);p.exhausted=false;p.invulnerable=4;p.hurt=0;p.vx=p.vy=0;p.deathCause='';s.status='playing';this._stream(true);
      return true;
    }
    applyNet(from,m){
      const c=this.coop;if(!c||!m||typeof m!=='object'||from===c.me)return;const s=this.state;
      let q=c.peers.get(from);if(!q){q={id:from,body:null,tx:0,ty:0,known:new Map()};c.peers.set(from,q);c.lookClock=0;}q.heard=c.clock;
      const find=id=>s.organisms.find(o=>o.id===id);
      if(m.t==='p'){
        if(!Number.isFinite(m.x)||!Number.isFinite(m.y))return;
        const first=!q.placed;q.placed=true;if(!q.body)q.body={};
        if(Math.abs(m.x)>1e7||Math.abs(m.y)>1e7)return;
        const {t,x,y,...rest}={t:'p',x:m.x,y:m.y,vx:Number.isFinite(m.vx)?clamp(m.vx,-5000,5000):0,vy:Number.isFinite(m.vy)?clamp(m.vy,-5000,5000):0,angle:Number.isFinite(m.angle)?m.angle:0,hp:Number.isFinite(m.hp)?m.hp:0,maxHp:m.maxHp>0?m.maxHp:1,r:m.r>0&&m.r<=6000?m.r:22,stealth:clamp(+m.stealth||0,0,1),hurt:clamp(+m.hurt||0,0,5),invulnerable:clamp(+m.invulnerable||0,0,60),sprinting:!!m.sprinting,sneaking:!!m.sneaking,exhausted:!!m.exhausted,alive:!!m.alive,active:!!m.active,lr:clamp(Math.round(+m.lr||2),2,6),down:clamp(+m.down||0,0,COOP_DOWN_SECONDS),rv:Array.isArray(m.rv)&&Number.isInteger(m.rv[0])&&Number.isFinite(m.rv[1])?[m.rv[0],clamp(m.rv[1],0,1)]:null,brood:m.brood,decoys:(Array.isArray(m.decoys)?m.decoys:[]).filter(d=>d&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&Math.abs(d.x)<1e7&&Math.abs(d.y)<1e7&&d.r>0&&d.r<6000&&d.life>0&&d.life<=24&&d.maxLife>0&&d.maxLife<=24&&Number.isFinite(d.angle)).slice(0,2).map(d=>({x:d.x,y:d.y,r:d.r,life:d.life,maxLife:d.maxLife,angle:d.angle,phase:+d.phase||0,remote:true})),wp:(Array.isArray(m.wp)?m.wp:[]).filter(v=>v&&[v.x,v.y,v.R,v.life,v.maxLife,v.holdR,v.grind,v.slam,v.grip].every(Number.isFinite)&&Math.abs(v.x)<1e7&&Math.abs(v.y)<1e7&&v.R>0&&v.R<8000&&v.life>0&&v.life<=8&&v.maxLife>0&&v.maxLife<=8&&v.holdR>=0&&v.holdR<6000&&v.grind>=0&&v.grind<1e6&&v.slam>=0&&v.slam<1e6&&v.grip>=0&&v.grip<=1).slice(0,1).map(v=>({...v,wid:Number.isSafeInteger(v.wid)&&v.wid>0?v.wid:0,spin:0,tick:.5,remote:true}))};if(!Array.isArray(rest.brood))rest.brood=[];rest.brood=rest.brood.filter(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.r>0&&v.r<500).slice(0,12).map(v=>({x:v.x,y:v.y,vx:+v.vx||0,vy:+v.vy||0,r:v.r,phase:+v.phase||0}));const shownAngle=q.body.angle;q.fast=rest;Object.assign(q.body,rest);q.body.peer=from;q.tx=x;q.ty=y;
        // Each position is filed under the moment it was sent, on my own clock: the sender's clock plus a steady
        // offset, so uneven arrival over the network does not show up as uneven movement.
        const sent=Number.isFinite(m.ts)?m.ts:c.clock,gap=c.clock-sent;if(q.offset===undefined||Math.abs(gap-q.offset)>1)q.gaps=[];(q.gaps||(q.gaps=[])).push(gap);if(q.gaps.length>24)q.gaps.shift();q.offset=Math.min(...q.gaps);
        const S=q.samples||(q.samples=[]),last=S[S.length-1],at=sent+q.offset;
        if(first||!last||length(last.x-x,last.y-y)>600||at-last.t>1){S.length=0;q.body.x=x;q.body.y=y;}else if(Number.isFinite(shownAngle))q.body.angle=shownAngle;
        if(!last||at>last.t)S.push({t:at,x,y,vx:rest.vx,vy:rest.vy,angle:rest.angle});if(S.length>12)S.shift();
        // Just arrived in a new pond: where a player who was here first already has the water, their device runs
        // its creatures, so mine drops its own copies of them. (The first player's device never does.)
        if(first&&c.arriving&&c.clock<6&&(from<c.me||c.late)){const cx=Math.floor(x/CHUNK),cy=Math.floor(y/CHUNK);s.organisms=s.organisms.filter(o=>{if(o.puppet||o.nestId)return true;const [hx,hy]=String(o.home).split(',').map(Number);const R=Math.max(2,rest.lr||2);return !(Math.abs(hx-cx)<=R&&Math.abs(hy-cy)<=R);});}
      }
      else if(m.t==='l'){
        const look=m.body;if(!look||typeof look!=='object'||!(look.r>0&&look.r<=6000)||!Number.isInteger(look.stage)||look.stage<0||look.stage>1e6)return;const keep=q.body||{};
        // Only what the drawing needs, each part checked.
        const numbers=(v,top)=>{const out=zeroTraits();if(v&&typeof v==='object')for(const f of FAMILIES)if(Number.isFinite(v[f]))out[f]=clamp(Math.floor(v[f]),0,top);return out;};
        m={t:'l',body:{r:look.r,stage:look.stage,cellCount:Number.isFinite(look.cellCount)?look.cellCount:look.stage+1,cellExponent:Number.isFinite(look.cellExponent)?look.cellExponent:0,colonyLevel:Number.isFinite(look.colonyLevel)?look.colonyLevel:look.stage+1,sizeScale:Number.isFinite(look.sizeScale)?look.sizeScale:1,traits:numbers(look.traits,MAX_RANK),mastery:numbers(look.mastery,500),
          forks:Object.fromEntries(Object.entries(look.forks&&typeof look.forks==='object'?look.forks:{}).filter(([k,v])=>k.length<20&&(v==='a'||v==='b'))),mutations:(Array.isArray(look.mutations)?look.mutations:[]).filter(k=>typeof k==='string'&&Object.hasOwn(MUTATIONS,k)).slice(0,12),
          mutationTiers:Object.fromEntries(Object.entries(look.mutationTiers&&typeof look.mutationTiers==='object'?look.mutationTiers:{}).filter(([k,v])=>Object.hasOwn(MUTATIONS,k)&&Number.isInteger(v)&&v>=0&&v<=4)),strike:FAMILIES.includes(look.strike)?look.strike:'pulse',genomes:(Array.isArray(look.genomes)?look.genomes:[]).filter(k=>BOSS_ORDER.includes(k)),hp:1,maxHp:1,angle:0,vx:0,vy:0,x:Number.isFinite(look.x)?look.x:0,y:Number.isFinite(look.y)?look.y:0}};
        q.body={...m.body,...(q.fast||{}),peer:from};if(Number.isFinite(keep.x)){q.body.x=keep.x;q.body.y=keep.y;}
        if(!Number.isFinite(keep.x)){q.tx=q.body.x;q.ty=q.body.y;}
      }
      else if(m.t==='o'){
        if(!Array.isArray(m.l))return;const byId=new Map(s.organisms.map(o=>[o.id,o]));
        if(m.l.length>400)return;
        for(const raw of m.l){if(!raw||!Number.isInteger(raw.id)||c.gone.has(raw.id))continue;let o=byId.get(raw.id);const e=this._coopClean(raw,!o);
          if(!o){
            if(!e){if(raw.kind===undefined)this._net(from,{t:'r',id:raw.id});continue;}
            o={...e,credit:0,huntCredit:0,stalkCredit:0,lastFamily:'',attackTokens:[],ramAt:-5,cooldown:1,stamina:0,puppet:true,_tx:e.x,_ty:e.y,_dealt:[]};s.organisms.push(o);byId.set(o.id,o);
          }else{
            // Two devices both think they run it (after a dropout, or saves from different moments): the lower player number keeps it.
            if(!o.puppet&&!o.dead&&from<c.me&&!o.bossId&&!o.nestId){o.puppet=true;o.owner=from;o._tx=o.x;o._ty=o.y;o._dealt=[];o._n=null;}
            if(!o.puppet||o.dead||!e)continue;
            // Anything my player has done to it since the last report goes out first, so the owner's figures arriving now cannot erase it.
            this._coopReport(o);
            const {x,y,hp,id,angle,...rest}=e;Object.assign(o,rest);if(Number.isFinite(angle))o._ta=angle;if(Number.isFinite(x))o._tx=x;if(Number.isFinite(y))o._ty=y;
            if(length(o._tx-o.x,o._ty-o.y)>260){o.x=o._tx;o.y=o._ty;}
            // My own recent hits may not have reached the owner yet: keep them taken off until they have.
            if(Number.isFinite(hp)){let fell=Number.isFinite(o._ownerHp)?o._ownerHp-hp:0;o._ownerHp=hp;const left=[];for(const d of o._dealt||[]){if(c.clock-d[0]>1)continue;if(fell>=d[1]-.01){fell-=d[1];continue;}left.push(d);}o._dealt=left;o.hp=hp-left.reduce((n,d)=>n+d[1],0);}
          }
          o.owner=from;o._seen=c.clock;o.targetId=-1;o._n=this._baseline(o);
        }
      }
      else if(m.t==='r'){q.known.delete(m.id);}
      else if(m.t==='ff'){if(Number.isFinite(m.a)&&m.a>0&&c.down<=0&&s.status==='playing'&&this._coopActive()&&!(s.player.ffGuard>s.time)){const before=s.player.hp,guard=s.player.invulnerable;this._damagePlayer(Math.min(m.a,s.player.maxHp*.34),{x:Number.isFinite(m.x)?m.x:s.player.x,y:Number.isFinite(m.y)?m.y:s.player.y,kind:'friend',peer:from});if(s.player.hp<before){s.player.invulnerable=guard;s.player.ffGuard=s.time+.6;this._event('friendlyFire',{peer:from,amount:before-s.player.hp});}}}
      else if(m.t==='v'){if(c.down>0&&!c.wiped&&this.coopRevive(true))this._event('coopRevived',{peer:from});}
      else if(m.t==='u'){if(m.k==='wipe'){if(c.clock>4)this._coopWipe();}else if(m.k==='bossLost'){const b=s.bossEncounter;s.stats.bossRest=s.time+BOSS_REST_SECONDS;c.bossHold=c.clock+BOSS_REST_SECONDS;if(b&&b.puppet){this._clearBossDependants(b.id);s.bossEncounter=null;this._event('bossLost',{bossType:b.type,name:BOSSES[b.type].name,rest:BOSS_REST_SECONDS});}}else if(typeof m.k==='string')this._event('coopSignal',{from,kind:m.k.slice(0,20),data:m.d});}
      else if(m.t==='d'){
        const o=find(m.id);if(!o||o.dead)return;
        // A report for a creature I have since handed on goes to its new owner; if that is the sender, it goes
        // back marked as their own, so the hit is not lost.
        if(o.puppet){if(o.owner!==from)this._net(o.owner,m);else if(!m.back)this._net(from,{...m,back:true});return;}
        const own=!!m.back,dmg=Number.isFinite(m.dmg)?clamp(m.dmg,0,1e6):0,cr=own?0:Number.isFinite(m.cr)?clamp(m.cr,0,1e6):0;
        if(dmg>0){o.hp-=dmg;o.flash=.22;if(!own){const by=o.threatBy||(o.threatBy={});by[from]=(by[from]||0)+dmg;}}
        if(cr>0)o.remoteCredit=(o.remoteCredit||0)+cr;
        if(m.st&&typeof m.st==='object')for(const k of COOP_STATUS){const v=m.st[k];if(Number.isFinite(v)&&v>0){o[k]=Math.max(o[k]||0,Math.min(v,COOP_STATUS_MAX[k]));if(!own){if(k==='poison'||k==='venomStacks')o.venomFrom=from;if(k==='bleed')o.bleedFrom=from;}}}
        if(Array.isArray(m.iv)&&Number.isFinite(m.iv[0])&&Number.isFinite(m.iv[1])){o.vx+=clamp(m.iv[0],-900,900);o.vy+=clamp(m.iv[1],-900,900);}
        if(o.hp<=0){this._kill(o);s.organisms=s.organisms.filter(v=>!v.dead);return;}
      }
      else if(m.t==='c'){const o=find(m.id);if(o&&!o.dead&&Number.isFinite(m.a)&&FAMILIES.includes(m.f))this._classDamage(o,clamp(m.a,0,1e5),m.f);}
      else if(m.t==='k'){
        if(!Number.isFinite(m.id))return;c.gone.set(m.id,c.clock);const o=find(m.id);if(!o||o.dead)return;
        // Someone else finished it. If I had hurt it too, I earn my share; otherwise it is simply gone.
        this._elderFell(o);if(m.d===0||m.d===1)o._dropForce=m.d===1;if(o.credit>0&&this._coopActive())this._kill(o,false,true);else{this._nestKill(o);o.dead=true;}
        s.organisms=s.organisms.filter(v=>!v.dead);
      }
      else if(m.t==='g'){
        const e=this._coopClean(m.o,true);if(!e||c.gone.has(e.id))return;
        let o=find(e.id);if(o&&!o.puppet)return;
        const mine=o?{credit:o.credit||0,huntCredit:o.huntCredit||0,stalkCredit:o.stalkCredit||0,lastFamily:o.lastFamily||'',attackTokens:o.attackTokens||[],ramAt:o.ramAt??-5}:{credit:0,huntCredit:0,stalkCredit:0,lastFamily:'',attackTokens:[],ramAt:-5};
        if(!o){o={};s.organisms.push(o);}
        // A hit of mine that had not been reported yet still counts once the creature is mine.
        const unsent=o._n&&Number.isFinite(o.hp)?Math.max(0,o._n.hp-o.hp):0;
        const cr=e.cr||0;Object.assign(o,e,mine);delete o.cr;this._adopt(o);o.threatMine=o.maxHp*.08;o.threatBy=null;o.hp-=unsent;if(o.hp<=0){o.remoteCredit=cr;this._kill(o);s.organisms=s.organisms.filter(v=>!v.dead);return;}o.remoteCredit=cr;o.heldUntil=c.clock+2.5;
      }
      else if(m.t==='b'||m.t==='bg'){
        const e=m.b;if(!e||!Number.isFinite(e.id)||!Number.isFinite(e.x)||!Number.isFinite(e.y)||!(e.r>0)||!Object.hasOwn(BOSSES,e.type)||!Number.isFinite(e.hp)||!Number.isFinite(e.maxHp))return;
        if(!['hunt','windup','act','recover','transform'].includes(e.mode)||typeof e.attackKind!=='string'||!Array.isArray(e.heads)||e.heads.length>4||e.heads.some(h=>!h||typeof h!=='object'||!Number.isFinite(h.off)||!Number.isFinite(h.aim)||!Number.isFinite(h.reach))||![1,2,3].includes(e.phase)||!Number.isFinite(e.angle)||!Number.isFinite(e.vx)||!Number.isFinite(e.vy)||!(e.r<=20000))return;
        delete e._bit;delete e.puppet;delete e.owner;delete e._seen;delete e.heldUntil;
        for(const k in e){const v=e[k];if(k==='heads'||k==='projectileTokens')continue;if(k==='grab'){if(v!==null&&!(v&&typeof v==='object'&&['reach','hold'].includes(v.stage)&&Object.keys(v).length<=10&&Object.entries(v).every(([f,x])=>f==='stage'||Number.isFinite(x))))return;continue;}if(!(typeof v==='boolean'||(typeof v==='string'&&v.length<=60)||(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e15)))return;}
        for(const h of e.heads)for(const k in h){const v=h[k];if(!(typeof v==='boolean'||(typeof v==='string'&&v.length<=20)||(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9)))return;}
        {const def=BOSSES[e.type];if(e.name!==def.name||!def.phases.includes(e.phaseLabel)||!Number.isSafeInteger(e.id)||e.id<1||!(e.r>=1)||!(e.maxHp>=1&&e.maxHp<=1e9)||e.hp>e.maxHp||typeof e.feeding!=='boolean'||typeof e.attackHit!=='boolean'||['scale','unit','modeTime','attackAngle','windup','windupMax','actTime','recoverTime','cooldown','chain','lungeSpeed','pullTime','ringDue','lastBirth','lastSeenX','lastSeenY','lostTime','meals','nextMeal','healFlash','poison','poisonDamage','venomStacks','bleed','bleedDamage','huntCredit','flash','age'].some(k=>typeof e[k]!=='number')||e.heads.some(h=>!['rest','windup','strike','back'].includes(h.mode)||!(Math.abs(h.off)<=2)||!(h.reach>=0&&h.reach<=4)||typeof h.hit!=='boolean'||![h.t,h.cooldown,h.tipX,h.tipY].every(Number.isFinite)))return;}
        let cur=s.bossEncounter;if(m.t==='bg'&&((cur&&!cur.puppet&&cur.id!==e.id)||!this._coopActive())){this._net(from,{t:'bn',id:e.id});return;}
        // Two devices each made a boss: the party keeps the one from the lower player number.
        if(m.t==='b'&&cur&&!cur.puppet&&from<c.me){if(cur.id!==e.id)this._clearBossDependants(cur.id);else c.bossMemo={id:cur.id,myDamage:cur.myDamage||0,huntCredit:cur.huntCredit||0};s.bossEncounter=cur=null;}
        if(cur&&!cur.puppet)return;if(!(e.maxHp>0))return;const same=cur&&cur.id===e.id,memo=!same&&c.bossMemo&&c.bossMemo.id===e.id?c.bossMemo:null,mine=same?{myDamage:cur.myDamage||0,huntCredit:cur.huntCredit||0,projectileTokens:cur.projectileTokens||[]}:{myDamage:memo?memo.myDamage:0,huntCredit:memo?memo.huntCredit:0,projectileTokens:[]};
        if(m.t==='b'){delete e.ambushAt;delete e.knowsMe;s.bossEncounter={...e,...mine,knowsMe:same&&cur?cur.knowsMe:1,puppet:true,owner:from,_seen:c.clock,_bit:same?!!cur._bit:false};if(!same){const an=this._announced||(this._announced=new Map());if(!(an.get(e.type)>s.time-120))this._event('bossAwakened',{bossType:e.type,name:e.name});an.set(e.type,s.time);}}
        else{
          // It is mine to run now: it starts its hunt afresh, on my player.
          const p=s.player;delete e.ambushAt;delete e.knowsMe;s.bossEncounter={...e,...mine,knowsMe:same&&cur?cur.knowsMe:1,unit:100*bossPower(e.type)*(BOSSES[e.type]?.dmg||1),mode:e.mode==='transform'?'transform':'hunt',attackKind:'',windup:0,actTime:0,cooldown:Math.max(1.5,e.cooldown||0),lastSeenX:p.x,lastSeenY:p.y,lostTime:0,lastBlow:s.time,nextMeal:s.time+4,tire:0};delete s.bossEncounter.grab;if(!same)this._event('bossAwakened',{bossType:e.type,name:e.name});
        }
      }
      else if(m.t==='bh'){
        const b=s.bossEncounter;if(!b||!Number.isFinite(m.a)||!(m.a>0))return;if(b.puppet){if(b.owner!==from)this._net(b.owner,m);return;}if(b.mode==='transform'||b.hp<=0)return;
        b.hp-=clamp(m.a,0,1e7);b.flash=.2;if(m.p>0&&Number.isFinite(m.pd)){b.poison=Math.max(b.poison,clamp(m.p,0,10));b.poisonDamage=Math.max(b.poisonDamage,clamp(m.pd,0,1e5));}
        // Run the usual checks for a new phase or its defeat, without crediting my player for the blow.
        if(b.hp<=0)this._defeatBoss();else this._hitBoss(1e-6,{noCritical:true,dot:true});
      }
      else if(m.t==='bn'){const b=s.bossEncounter;if(b&&b.puppet&&b.id===m.id&&b.owner===from){delete b.puppet;delete b.owner;delete b._seen;b.heldUntil=c.clock+3;}}
      else if(m.t==='bd'){const b=s.bossEncounter;if(b&&b.puppet&&b.id===m.id)this._defeatBoss();}
      else if(m.t==='e'){
        const e=m.e;if(!e||!Number.isFinite(e.x)||!Number.isFinite(e.y)||!(e.life>0)||!(e.maxR>=0)||typeof e.kind!=='string')return;
        // An effect that follows its maker's body follows that player here.
        s.effects.push({...e,r:0,life:Math.min(e.life,4),maxLife:Math.min(e.life,4),maxR:Math.min(e.maxR,2000),self:false,follow:e.self?from:undefined});if(s.effects.length>48)s.effects.shift();
      }
      else if(m.t==='s'){
        const e=m.s;if(!e||!Number.isFinite(e.x)||!Number.isFinite(e.y)||!Number.isFinite(e.vx)||!Number.isFinite(e.vy)||!(e.life>0)||!(e.r>0))return;
        // Another device's shot: a creature's can still hit my player; another player's is only there to be seen.
        if(s.projectiles.length>=110)return;
        if(e.r>600||(e.warningTime!==undefined&&!(e.warningTime>=0&&e.warningTime<=10)))return;
        // A boss's shots are sized for the player it hunts; on my screen they are sized for me.
        {const b=s.bossEncounter;if(e.bossId&&b&&b.id===e.bossId&&b.unit>0&&Number.isFinite(e.damage))e.damage=e.damage*100*this._sizePower()/b.unit;}
        s.projectiles.push({...e,remote:true,owner:e.owner==='enemy'?'enemy':'peer',seek:false,ambush:false,life:Math.min(e.life,12),damage:Number.isFinite(e.damage)?clamp(e.damage,0,5000):0});
      }
    }
    // Poison and bleed tick on the owner's device, but the class experience belongs to whoever applied them.
    _dot(o,tick,fam){
      const c=this.coop,from=fam==='venomist'?o.venomFrom:o.bleedFrom;
      if(c&&from!==undefined){const k=from+'|'+fam;(o.dotOut||(o.dotOut={}))[k]=(o.dotOut[k]||0)+tick;o.remoteCredit=(o.remoteCredit||0)+tick;}
      else this._classDamage(o,tick,fam);
    }
    // A creature run by another device: glide towards where its owner last said it was.
    _puppetMove(o,dt){
      for(const k of ['windup','lungeTime','recoverTime','poison','bleed','latchTime','tetherTime','vortexTime'])if(o[k]>0)o[k]=Math.max(0,o[k]-dt);
      o._tx+=o.vx*dt;o._ty+=o.vy*dt;const k=Math.min(1,dt*14);o.x+=(o._tx-o.x)*k;o.y+=(o._ty-o.y)*k;
      if(Number.isFinite(o._ta))o.angle+=Math.atan2(Math.sin(o._ta-o.angle),Math.cos(o._ta-o.angle))*Math.min(1,dt*(o.lungeTime>0?30:12));
      // Its lunge is aimed at another player, but a bite is a bite: if my player is at its mouth as it passes,
      // I am the one bitten. One bite per lunge, worked out here so my own dodge always counts.
      if(!(o.lungeTime>0)){o._bit=false;return;}
      const s=this.state,p=s.player;if(o._bit||o.attackHit||s.status!=='playing'||!isHostile(o)||!(o.attackDamage>0)||!Number.isFinite(o.attackAngle))return;
      const dx=p.x-o.x,dy=p.y-o.y,ahead=dx*Math.cos(o.attackAngle)+dy*Math.sin(o.attackAngle),reach=o.r*.85;
      if(!(o.lungeTime<=(o.lungeMax||.4)*.7)||length(dx-Math.cos(o.attackAngle)*reach,dy-Math.sin(o.attackAngle)*reach)>p.r+o.r*.3||ahead<-p.r*.25)return;
      o._bit=true;if(this._canEngulf(o)||this._cowedByBoss(o))return;
      const gulp=canSwallow(o,p),weak=o.venomStacks>=5&&this._fork('venomist',4)==='b'?.6:1;if(gulp)o.gulp=true;this._damagePlayer((gulp?Math.max(o.attackDamage,p.maxHp*1.5):o.attackDamage)*weak,o);delete o.gulp;
      if(s.status==='playing'){const kick=Math.min(520,260+o.r*2.2);p.vx+=Math.cos(o.attackAngle)*kick;p.vy+=Math.sin(o.attackAngle)*kick;}
    }
    // The live save data, not copied: for callers that turn it into text straight away.
    saveObject(){
      const runtime=this._saveRuntime(),state={...this.state,brood:undefined,vortices:undefined,pools:undefined};
      // Food is a quarter of a save: its positions and values are stored rounded (to a tenth and a thousandth), which halves its size.
      {const q=(v,k)=>Math.round(v*k)/k;state.foods=state.foods.map(f=>({...f,x:q(f.x,10),y:q(f.y,10),r:q(f.r,100),value:Math.max(.001,q(f.value,1000)),phase:q(f.phase||0,100)}));}if(state.player&&state.player.surgeCtx)state.player={...state.player,surgeCtx:null};
      // Anything standing in water that is not loaded (a boss's young born far away, say) is left out: a save holds loaded water only.
      if(state.organisms.some(o=>!runtime.chunks[o.home]))state.organisms=state.organisms.filter(o=>runtime.chunks[o.home]);
      // A wide screen keeps more water loaded than the usual five-by-five chunks; a save holds just those 25 around the player.
      if(Object.keys(runtime.chunks).length>25){const cx=state.world.chunkX,cy=state.world.chunkY,inner=k=>{const [x,y]=String(k).split(',').map(Number);return Math.abs(x-cx)<=2&&Math.abs(y-cy)<=2;};
        runtime.chunks=Object.fromEntries(Object.entries(runtime.chunks).filter(([k])=>inner(k)));
        for(const name of ['organisms','foods','hazards','scenery','landmarks'])state[name]=state[name].filter(v=>!v.home||inner(v.home)||(name==='organisms'&&v.bossId!==undefined));
        state.world={...state.world,loadedChunks:Object.keys(runtime.chunks).length};}
      if(this.coop){
        // Things made on other devices carry their numbers; the save's own counter must sit above all of them.
        let top=runtime.id;const lift=v=>{if(v&&Number.isInteger(v.id)&&v.id>=top)top=v.id+1;};
        // A co-op save holds only what this device owns, without the co-op bookkeeping.
        const clean=o=>{const out={};for(const k in o)if(!COOP_UNSAVED.has(k))out[k]=o[k];return out;};
        if(state.bossEncounter&&(state.bossEncounter.puppet||state.player.genomes.includes(state.bossEncounter.type)))state.bossEncounter=null;else if(state.bossEncounter)state.bossEncounter=clean(state.bossEncounter);
        // With no boss of mine in the save, nothing that belongs to a boss can stay in it either.
        const bossId=state.bossEncounter?state.bossEncounter.id:null;
        state.organisms=state.organisms.filter(o=>!o.puppet&&!o.dead&&this._chunks[o.home]&&(o.bossId===undefined||o.bossId===bossId)).map(clean);state.foods=state.foods.filter(f=>this._chunks[f.home]);state.projectiles=state.projectiles.filter(x=>!x.remote&&(x.bossId===undefined||(x.bossId===bossId&&x.bossPhase===state.bossEncounter.phase))).map(x=>{const y={...x};delete y.sent;return y;});state.effects=[];state.decoys=state.decoys.filter(d=>!d.remote);
        runtime.chunkCache=Object.fromEntries(Object.entries(runtime.chunkCache).map(([k,v])=>[k,{...v,organisms:v.organisms.filter(o=>!o.puppet).map(clean)}]));
        for(const name of ['organisms','foods','hazards','scenery','projectiles','drops'])for(const v of state[name])lift(v);for(const v of Object.values(runtime.chunkCache))for(const name of ['organisms','foods','hazards','scenery'])for(const x of v[name])lift(x);for(const o of [...state.organisms,...Object.values(runtime.chunkCache).flatMap(v=>v.organisms)]){for(const id of o.attackTokens||[])lift({id});for(const k of ['targetId','leaderId','huntBrood'])lift({id:o[k]});}for(const x of state.projectiles)for(const k of ['sourceId','attackToken','ambushToken'])lift({id:x[k]});
        for(const l of [...state.landmarks,...Object.values(runtime.chunkCache).flatMap(v=>v.landmarks||[])])for(const id of l.guardianIds||[])lift({id});
        if(state.player.broodTargetId&&!state.organisms.some(o=>o.id===state.player.broodTargetId))state.player={...state.player,broodTargetId:0};if(state.bossEncounter)lift(state.bossEncounter);runtime.id=top;
      }
      return{format:'MORPHOS_SAVE',version:20,state,runtime};
    }
    _saveRuntime(){return{rng:this._rng,id:this._id,maintain:this._maintain,ai:this._ai,scoreClock:this._scoreClock,apexSpawned:this._apexSpawned,lastEat:this._lastEat,hungryWarned:this._hungryWarned,wakeClock:this._wakeClock,streamClock:this._streamClock,chunks:this._chunks,chunkCache:{},cacheOrder:[]};}
    exportSave(){return JSON.parse(JSON.stringify(this.saveObject()));}
    static fromSave(data){
      const fail=()=>{throw new Error('This is not a valid MORPHOS save.');},ok=test=>{if(!test)fail();};
      if(typeof data==='string'){ok(data.length<=8*1024*1024);try{data=JSON.parse(data);}catch(_){fail();}}
      // A save from before bodies were made smaller (version 18): the colony, its progress and the map are kept. The creatures around it
      // were sized for the old bodies, so they are left out and the pond grows new ones; body measurements are worked out afresh.
      // v35.1: Surge fin and Command gland were replaced by Spike battery and Spore sac; a save holding them gets the new ones.
      if(data&&typeof data==='object'){const txt=JSON.stringify(data);if(txt.includes('"surgeFin"')||txt.includes('"commandGland"')){try{data=JSON.parse(txt.replace(/"surgeFin"/g,'"spikeBattery"').replace(/"commandGland"/g,'"sporeSac"'));}catch(_){fail();}}}
      let legacy=false;if(data&&data.version===18&&data.state&&data.runtime){legacy=true;try{data=JSON.parse(JSON.stringify(data));data.version=19;const st=data.state,rt=data.runtime;st.organisms=[];st.projectiles=[];st.decoys=[];st.bossEncounter=null;if(st.player){st.player.broodTargetId=0;if(Number.isFinite(st.player.hp))st.player.hp*=1-1e-9;}for(const c of Object.values(rt.chunkCache||{}))if(c&&Array.isArray(c.organisms))c.organisms=[];for(const l of [...(st.landmarks||[]),...Object.values(rt.chunkCache||{}).flatMap(c=>c&&Array.isArray(c.landmarks)?c.landmarks:[])])if(l&&Array.isArray(l.guardianIds))l.guardianIds=[];}catch(_){fail();}}
      // A save from before weapons (version 19): the attack used to follow the strongest class. That class's weapon is handed over,
      // already equipped, so the colony keeps the attack it had. Mutations that moved to another body part keep their place; where two
      // now share a part, the first stays equipped and the other goes back to the collection.
      if(data&&data.version===19&&data.state&&data.state.player){try{data=legacy?data:JSON.parse(JSON.stringify(data));data.version=20;const q=data.state.player,tr=q.traits||{},ms=q.mastery||{};
        if(Array.isArray(q.mutations)&&Array.isArray(q.unlockedMutations)&&q.mutationTiers&&typeof q.mutationTiers==='object'){
          const seen=new Set();q.mutations=q.mutations.filter(k=>{const part=MUTATIONS[k]&&MUTATIONS[k].part;if(!part||seen.has(part))return false;seen.add(part);return true;});
          let top=0,fam='';for(const f of FAMILIES){const v=(+tr[f]||0)+(+ms[f]||0);if(v>top){top=v;fam=f;}}
          const key=fam&&Object.keys(MUTATIONS).find(k=>MUTATIONS[k].weapon===fam);
          if(key&&!q.unlockedMutations.some(k=>MUTATIONS[k]&&MUTATIONS[k].weapon)){q.unlockedMutations.push(key);q.mutationTiers[key]=2;if(!seen.has('organ'))q.mutations.push(key);}}
      }catch(_){fail();}}
      if(data&&data.state&&data.state.player&&Array.isArray(data.state.player.genomes)){const done=data.state.player.genomes.length===BOSS_ORDER.length;if(data.state.journeyComplete!==done){data.state.journeyComplete=done;if(!done)data.state.journeyCompletedAt=0;}}
      if(data&&data.state&&data.state.player&&data.state.player.traits&&data.state.player.mastery){const q=data.state.player;for(const f of FAMILIES)if(q.traits[f]===4&&Number.isInteger(q.mastery[f])&&q.mastery[f]>0){q.traits[f]=5;q.mastery[f]--;}}
      let nodes=0;const ancestors=new Set();
      function tree(v,depth=0){
        ok(++nodes<=500000&&depth<=16);
        if(v===null||typeof v==='boolean')return;
        if(typeof v==='number'){ok(Number.isFinite(v)&&Math.abs(v)<=1e16);return;}
        if(typeof v==='string'){ok(v.length<=2000);return;}
        ok(typeof v==='object'&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)&&!ancestors.has(v));
        ancestors.add(v);const keys=Object.keys(v);ok(keys.length<=50000);
        for(const k of keys){ok(k!=='__proto__'&&k!=='constructor'&&k!=='prototype');const desc=Object.getOwnPropertyDescriptor(v,k);ok(desc&&Object.hasOwn(desc,'value'));tree(desc.value,depth+1);}ancestors.delete(v);
      }
      tree(data);ok(data&&data.format==='MORPHOS_SAVE'&&data.version===20&&data.state&&data.runtime);
      const encoded=JSON.stringify(data);ok(encoded.length<=8*1024*1024);const copy=JSON.parse(encoded),s=copy.state,r=copy.runtime,p=s.player;
      const object=v=>v&&typeof v==='object'&&!Array.isArray(v),num=(v,min=-1e12,max=1e12)=>Number.isFinite(v)&&v>=min&&v<=max,int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
      const string=(v,n=200)=>typeof v==='string'&&v.length<=n,bool=v=>typeof v==='boolean',list=(v,n)=>Array.isArray(v)&&v.length<=n;
      const key=v=>typeof v==='string'&&/^-?\d{1,10},-?\d{1,10}$/.test(v),lmId=v=>typeof v==='string'&&v.startsWith('lm:')&&key(v.slice(3));
      const position=v=>object(v)&&num(v.x)&&num(v.y),radius=v=>num(v.r,0,10000),names=(v,allowed)=>typeof v==='string'&&allowed.includes(v);
      ok(object(p)&&object(s.world)&&s.world.infinite===true&&s.world.chunkSize===CHUNK&&int(s.world.loadedChunks,25,25)&&int(s.world.chunkX,-1e9,1e9)&&int(s.world.chunkY,-1e9,1e9));
      ok(string(s.seed,80)&&s.seed.length>0&&s.seedNumber===seedHash(s.seed)&&num(s.time,0,1e12)&&names(s.status,['playing','dead'])&&bool(s.paused)&&s.endless===true&&bool(s.journeyComplete)&&num(s.journeyCompletedAt,0,s.time));
      ok(int(s.biome,0,2)&&int(s.previousBiome,0,2)&&num(s.biomeTransition,0,1)&&s.biomeName===biomeNames[s.biome]&&num(s.score,0,1e16)&&num(s.biomass,0,1e16));
      ok(position(p)&&num(p.vx,-100000,100000)&&num(p.vy,-100000,100000)&&num(p.angle)&&int(p.stage,0,10000000)&&int(p.skillPoints)&&p.id===0&&bool(p.alive)&&p.alive===(s.status==='playing'));
      for(const field of ['traits','mastery','evidence'])ok(object(p[field]));
      for(const family of FAMILIES){ok(int(p.traits[family],0,MAX_RANK)&&int(p.mastery[family],0,10000000)&&num(p.evidence[family],0,1e15));if(p.mastery[family]>0)ok(p.traits[family]===MAX_RANK);}
      ok(p.wake===undefined||object(p.wake)&&Object.keys(p.wake).every(f=>FAMILIES.includes(f)&&num(p.wake[f],0,1e6)));if(p.awakened===undefined)p.awakened=FAMILIES.filter(f=>(p.traits[f]||0)>0);ok(list(p.awakened,FAMILIES.length)&&new Set(p.awakened).size===p.awakened.length&&p.awakened.every(f=>FAMILIES.includes(f))&&FAMILIES.every(f=>!(p.traits[f]>0)||p.awakened.includes(f)));ok(object(p.forks)&&Object.keys(p.forks).every(k=>/^(venomist|predator|riptide|summoner|stalker)[24]$/.test(k)&&names(p.forks[k],['a','b'])));for(const f of FAMILIES)for(const r of [2,4])ok(((p.traits[f]||0)>=r)===Object.hasOwn(p.forks,f+r));
        ok(object(p.attributes)&&Object.keys(p.attributes).length===Object.keys(ATTRIBUTES).length);for(const k of Object.keys(ATTRIBUTES))ok(int(p.attributes[k],0,attributeCap(p.stage)));
        for(const field of ['abilityCooldowns','abilityCosts','abilityCooldownMax']){ok(object(p[field])&&Object.keys(p[field]).length===FAMILIES.length);for(const k of FAMILIES)ok(num(p[field][k],0,120));}
        ok(list(p.unlockedMutations,Object.keys(MUTATIONS).length)&&new Set(p.unlockedMutations).size===p.unlockedMutations.length&&p.unlockedMutations.every(k=>Object.hasOwn(MUTATIONS,k)));
        ok(list(p.mutations,BODY_PARTS.length)&&new Set(p.mutations).size===p.mutations.length&&p.mutations.every(k=>p.unlockedMutations.includes(k)&&BODY_PARTS.some(b=>b.key===MUTATIONS[k].part&&p.stage>=b.stage))&&new Set(p.mutations.map(k=>MUTATIONS[k].part)).size===p.mutations.length&&int(p.mutationSlots,0,BODY_PARTS.length)&&p.mutations.length<=p.mutationSlots);
        for(const k of ['sprinting','exhausted','sprintDanger','photosynthesising'])ok(bool(p[k]));for(const k of ['sprintSessionDistance','sprintSampleDistance','escapeCooldown','secondWindTime','secondWindCooldown','chainCooldown','stillTime'])ok(num(p[k],0,1e15));ok(num(p.recoveryProgress,0,1)&&!(p.exhausted&&p.sprinting));
      ok(list(p.genomes,BOSS_ORDER.length)&&new Set(p.genomes).size===p.genomes.length&&p.genomes.every(k=>Object.hasOwn(BOSSES,k))&&int(p.growthBlockedStage,-1,p.stage));
      ok(s.journeyComplete===(p.genomes.length===BOSS_ORDER.length)&&(!s.journeyComplete?s.journeyCompletedAt===0:true));
      for(const [k,max] of [['fissionShieldTime',8],['fissionCooldown',45],['impactCharge',1e7],['phaseShieldTime',3],['phaseCooldown',8],['parryTime',2],['parryBuffer',.15],['regenDelay',5],['refugeCombatTime',3],['shadowMetabolismCooldown',8]])ok(num(p[k],0,max));
      ok(num(p.feedingRecovery,0,6));
      ok(num(p.blockCooldown,0,2.5)&&bool(p.blockHeld)&&p.blockCost===10&&(p.blockCooldownMax===1.9||p.blockCooldownMax===2.5));
      ok(num(p.parryAngle)&&bool(p.parryRefunded)&&bool(p.slipstreamCharged)&&int(p.broodTargetId,0,r.id-1)&&num(p.budTime,0,60)&&int(p.frenzy,0,10)&&num(p.frenzyTime,0,10)&&int(p.momentum,0,10)&&num(p.momentumTime,0,10));
      ok(s.nextDivision===nextThreshold(p.stage)&&s.divisionFrom===(p.stage?nextThreshold(p.stage-1):0));
      for(const field of ['hp','maxHp','energy','maxEnergy','nutrition','maxNutrition','pulseCooldown','invulnerable','hurt','evolution','shield','concealCooldown','specialTime','swarmTime','slipstreamTime','pounceTime','veilTime'])ok(num(p[field],0,1e6));
      ok(num(p.stealth,0,1)&&bool(p.sneaking)&&int(p.combo,0,12)&&(p.maxNutrition===100||p.maxNutrition===150&&Array.isArray(p.mutations)&&p.mutations.includes('gorgerStomach'))&&p.nutrition<=p.maxNutrition&&p.hp<=p.maxHp+1e-8&&p.energy<=p.maxEnergy+1e-8);
      ok(p.specialActiveTrait===''||FAMILIES.includes(p.specialActiveTrait));
      if(s.status==='dead')ok(p.hp===0&&string(p.deathCause,100));
      ok(object(s.stats));if(!Number.isInteger(s.stats.elders)||s.stats.elders<0)s.stats.elders=0;if(!Number.isFinite(s.stats.bossRest)||s.stats.bossRest<0||s.stats.bossRest>s.time+BOSS_REST_SECONDS)s.stats.bossRest=0;if(!Number.isInteger(s.stats.deepest)||s.stats.deepest<1||s.stats.deepest>99)s.stats.deepest=1;if(!Array.isArray(s.stats.eldersFallen)||s.stats.eldersFallen.length>600||!s.stats.eldersFallen.every(k=>typeof k==='string'&&k.length<40))s.stats.eldersFallen=[];for(const k of ['food','kills','dashes','pulses','specials','sneaks','ambushes','discoveries','encounters','meaningfulDashes','objectives'])ok(int(s.stats[k]));for(const k of ['stealthTime','distance'])ok(num(s.stats[k],0,1e15));for(const k of ['algae','minerals','criticals','reflections','elites','nests','escapes','bosses','parries','hostileKills','nearMisses','ruptures','currentsRidden'])ok(int(s.stats[k]));for(const k of ['sprintDistance','blockedDamage'])ok(num(s.stats[k],0,1e15));
      ok(s.stats.hostileKills<=s.stats.kills&&s.stats.currentsRidden<=s.stats.encounters&&object(s.stats.earnedPoints)&&Object.keys(s.stats.earnedPoints).every(k=>['evolution','elder','challenge','wonder'].includes(k)));for(const k of ['evolution','elder','challenge'])ok(int(s.stats.earnedPoints[k]));
      if(!Number.isFinite(s.stats.earnedPoints.wonder))s.stats.earnedPoints.wonder=0;if(!Number.isInteger(s.stats.bounties)||s.stats.bounties<0)s.stats.bounties=0;for(const k of ['bountiesDropped','tasksTaken'])if(!Number.isInteger(s.stats[k])||s.stats[k]<0)s.stats[k]=0;s.echoes=Array.isArray(s.echoes)?[...new Set(s.echoes.filter(id=>STORY_IDS.has(id)))]:[];{const h=s.stats.helped,ok={};if(h&&typeof h==='object'&&!Array.isArray(h))for(const [k,v] of Object.entries(h).slice(0,500))if(/^lm:-?\d+,-?\d+$/.test(k)&&Number.isInteger(v)&&v>0)ok[k]=Math.min(HERMIT_TASKS,v);s.stats.helped=ok;}{const was=s.bounty&&typeof s.bounty==='object'?[{...s.bounty,done:false}]:[];delete s.bounty;delete s.bountyRest;const good=b=>b&&typeof b==='object'&&typeof b.title==='string'&&b.title.length<=80&&typeof b.target==='string'&&b.target.length<=60&&typeof b.hermit==='string'&&b.hermit.length<=60&&typeof b.from==='string'&&['hunt','nest','place','rescue','fetch'].includes(b.kind)&&[b.x,b.y].every(Number.isFinite)&&Math.abs(b.x)<1e7&&Math.abs(b.y)<1e7;s.tasks=(Array.isArray(s.tasks)?s.tasks:was).filter(good).slice(0,MAX_TASKS).map(b=>({...b,done:!!b.done,zone:Number.isInteger(b.zone)?clamp(b.zone,0,99):waterLevel(b.x,b.y),hx:Number.isFinite(b.hx)?b.hx:b.x,hy:Number.isFinite(b.hy)?b.hy:b.y,reward:TIERS.includes(b.reward)?b.reward:'Uncommon',story:typeof b.story==='string'?b.story.slice(0,400):'',fx:Number.isFinite(b.fx)?b.fx:b.x,fy:Number.isFinite(b.fy)?b.fy:b.y,found:!!b.found,carried:!!b.carried}));if(typeof s.trackedTask!=='string'||!s.tasks.some(b=>b.target===s.trackedTask))s.trackedTask='';}ok(int(s.stats.earnedPoints.wonder,0,WONDERS.length*3)&&s.stats.earnedPoints.evolution===p.stage&&s.stats.earnedPoints.elder===p.genomes.length*2&&s.stats.earnedPoints.challenge<=Math.floor(p.stage/2)&&Object.values(s.stats.earnedPoints).reduce((a,b)=>a+b,0)===p.skillPoints+Object.values(p.attributes).reduce((a,b)=>a+b,0));
      ok(s.stats.bosses>=p.genomes.length&&list(s.bossLog,40));for(const e of s.bossLog)ok(object(e)&&Object.hasOwn(BOSSES,e.type)&&e.name===BOSSES[e.type].name&&num(e.time,0,s.time)&&bool(e.first)&&e.reward===(e.first?2:0)&&p.genomes.includes(e.type));
      ok(s.bossEncounter===null||object(s.bossEncounter));if(s.bossEncounter){const b=s.bossEncounter,def=Object.hasOwn(BOSSES,b.type)&&BOSSES[b.type];
        ok(def&&!p.genomes.includes(b.type)&&int(b.id,1,r.id-1)&&b.name===def.name&&def.phases.includes(b.phaseLabel)&&position(b)&&num(b.r,1,20000)&&num(b.maxHp,1,1e9)&&num(b.hp,-1e9,b.maxHp+1e-6)&&int(b.phase,1,3)&&names(b.mode,['hunt','windup','act','recover','transform'])&&names(b.attackKind,['','engulf','sweep','birth','spores','slam','dash','tendrils','vortex','charge','rings','grab'])&&bool(b.attackHit)&&bool(b.feeding)&&list(b.projectileTokens,40)&&list(b.heads,4));
        for(const k of ['scale','unit','modeTime','vx','vy','angle','attackAngle','windup','windupMax','actTime','recoverTime','cooldown','chain','lungeSpeed','pullTime','ringDue','lastBirth','lastSeenX','lastSeenY','lostTime','meals','nextMeal','healFlash','poison','poisonDamage','venomStacks','bleed','bleedDamage','huntCredit','flash','age'])ok(num(b[k]));
        for(const h of b.heads)ok(object(h)&&num(h.off,-2,2)&&names(h.mode,['rest','windup','strike','back'])&&num(h.t)&&num(h.cooldown)&&num(h.aim)&&num(h.reach,0,4)&&bool(h.hit)&&num(h.tipX)&&num(h.tipY));
      }
      ok(int(s.objectiveIndex)&&object(s.objective));const ob=s.objective;ok(ob.id===s.objectiveIndex&&names(ob.kind,['forage','travel','discover','hunt','dash','elder'])&&string(ob.title)&&string(ob.description)&&num(ob.target,1,1e6)&&num(ob.progress,0,ob.target)&&ob.reward===0&&ob.scoreReward===100&&ob.biomassReward===0&&names(ob.stat,['food','distance','discoveries','kills','meaningfulDashes','sprintDistance','elders'])&&num(ob.start,0,1e15));
      const evolution=(e,maxPoints=10)=>object(e)&&FAMILIES.includes(e.trait)&&int(e.rank,1,MAX_RANK)&&int(e.mastery,0,10000000)&&int(e.colonyLevel,1,10000001)&&num(e.cells,1,2**30)&&string(e.cellCountText,80)&&string(e.title)&&string(e.reason)&&int(e.points,0,maxPoints)&&bool(e.milestone);
      ok(list(s.evolutionLog,120)&&s.evolutionLog.every(e=>evolution(e)));
      if(s.pendingChoice===undefined)s.pendingChoice=null;ok(s.pendingChoice===null||object(s.pendingChoice)&&s.pendingEvolution===null&&list(s.pendingChoice.options,5)&&s.pendingChoice.options.length>=1&&(s.pendingChoice.nodes===undefined?s.pendingChoice.options.length>=2:list(s.pendingChoice.nodes,10)&&s.pendingChoice.nodes.length>=2&&s.pendingChoice.nodes.every(n=>object(n)&&s.pendingChoice.options.includes(n.trait)&&names(n.fork,['','a','b'])))&&new Set(s.pendingChoice.options).size===s.pendingChoice.options.length&&s.pendingChoice.options.every(k=>FAMILIES.includes(k))&&s.pendingChoice.stage===p.stage&&s.pendingChoice.options.length===1&&s.pendingChoice.nodes.length===2&&(()=>{const f=s.pendingChoice.options[0],next=p.traits[f]+1;return (next===2||next===4)&&!Object.hasOwn(p.forks,f+next)&&s.pendingChoice.nodes.every(n=>n.trait===f&&n.fork!=='')&&s.pendingChoice.nodes[0].fork!==s.pendingChoice.nodes[1].fork;})());
      ok(s.pendingEvolution===null);
      ok(int(r.rng,0,0xffffffff)&&int(r.id,1,1e15)&&bool(r.apexSpawned)&&bool(r.hungryWarned));
      for(const k of ['maintain','ai','scoreClock','wakeClock','streamClock'])ok(num(r[k],-.2,10));ok(num(r.lastEat,-10,s.time));
      ok(object(r.chunks)&&Object.keys(r.chunks).length===25&&object(r.chunkCache)&&Object.keys(r.chunkCache).length<=20&&list(r.cacheOrder,20)&&new Set(r.cacheOrder).size===r.cacheOrder.length&&r.cacheOrder.length===Object.keys(r.chunkCache).length);
      const meta=(v,k)=>object(v)&&key(k)&&v.key===k&&int(v.cx,-1e9,1e9)&&int(v.cy,-1e9,1e9)&&k===v.cx+','+v.cy&&int(v.biome,0,2)&&int(v.rng,0,0xffffffff)&&num(v.foodClock,-2,20)&&num(v.mobClock,-2,60);
      for(const [k,v] of Object.entries(r.chunks))ok(meta(v,k));
      for(let y=s.world.chunkY-2;y<=s.world.chunkY+2;y++)for(let x=s.world.chunkX-2;x<=s.world.chunkX+2;x++)ok(Object.hasOwn(r.chunks,x+','+y));
      const caps={foods:1100,organisms:120,hazards:64,scenery:130,landmarks:25};
      const identities=new Set(s.bossEncounter?[s.bossEncounter.id]:[]);
      function entity(v,name,homes){
        ok(position(v)&&radius(v)&&key(v.home)&&Object.hasOwn(homes,v.home)&&int(v.biome,0,2));
        if(name==='landmarks'){
          ok(lmId(v.id)&&v.id==='lm:'+v.home&&Object.hasOwn(LANDMARKS,v.type)&&string(v.name)&&num(v.phase)&&num(v.angle)&&num(v.flowX,-1,1)&&num(v.flowY,-1,1)&&int(v.variant,0,2)&&bool(v.discovered)&&bool(v.claimed)&&bool(v.active)&&num(v.progress,0,v.goal)&&v.goal===LANDMARKS[v.type].goal&&list(v.guardianIds,1000)&&v.guardianIds.every(id=>int(id,1,r.id-1)));
          ok(!v.claimed||v.discovered&&v.progress===v.goal);if(v.type==='sanctum')ok(Object.hasOwn(BOSSES,v.bossType)&&(!v.claimed||p.genomes.includes(v.bossType)));return;
        }
        ok(int(v.id,1,r.id-1)&&!identities.has(v.id));identities.add(v.id);
        if(name==='foods')ok(names(v.kind,['algae','mineral','protein'])&&num(v.value,0,1e6)&&num(v.phase));
        if(name==='organisms'){
          ok((v.species===undefined||Object.hasOwn(SPECIES,v.species)&&SPECIES[v.species].base===v.kind)&&names(v.kind,ORGANISM_KINDS)&&num(v.hp,-1e6,1e6)&&num(v.maxHp,1,1e6)&&v.hp<=v.maxHp+1e-8&&num(v.vx,-10000,10000)&&num(v.vy,-10000,10000)&&num(v.tx,-1,1)&&num(v.ty,-1,1)&&num(v.angle)&&int(v.tier,0,10)&&bool(v.dead));
          for(const k of ['speed','hue','phase','flash','wander','flee','stun','charge','credit'])ok(num(v[k],0,10000));ok(num(v.cooldown,-1e12,10000)&&num(v.ramAt,-5,s.time));
          ok(num(v.pursuit,0,4)&&num(v.lastSeenX)&&num(v.lastSeenY)&&list(v.attackTokens,8)&&new Set(v.attackTokens).size===v.attackTokens.length&&v.attackTokens.every(id=>int(id,1,r.id-1)));if(v.nestId!==undefined)ok(lmId(v.nestId)&&int(v.nestSlot,0,2));if(v.bossId!==undefined)ok(s.bossEncounter&&v.bossId===s.bossEncounter.id);
          if(v.poison!==undefined)ok(num(v.poison,0,10)&&num(v.poisonDamage,0,1000));
          ok(names(v.elite,['','lancer'])&&num(v.windup,0,.9)&&num(v.windupMax,.1,.9)&&num(v.attackAngle)&&num(v.attackRange,0,6000)&&num(v.attackWidth,0,14000)&&num(v.lungeTime,0,.5)&&num(v.lungeMax,.1,.5)&&num(v.recoverTime,0,1.7)&&num(v.recoverMax,.1,1.7)&&num(v.attackDamage,0,2000)&&bool(v.attackHit)&&names(v.attackMode,['idle','windup','lunge','recover'])&&names(v.attackKind,['','lunge','bite','spores','shards','tether'])&&num(v.slowTime,0,2)&&num(v.huntCredit,0,18.001)&&num(v.stalkCredit,0,8.001));
          const capacity=MorphosGame.prototype._profile(v).capacity;if(Number.isFinite(v.stamina)&&v.stamina>capacity)v.stamina=capacity;if(Number.isFinite(v.slowTime))v.slowTime=clamp(v.slowTime,0,2);
          ok(num(v.stamina,0,capacity)&&bool(v.exhausted)&&num(v.fedTime,0,12)&&int(v.targetId,-2,r.id-1)&&bool(v.foraging));
          ok((v.attackMode==='windup')===(v.windup>0)&&(v.attackMode==='lunge')===(v.lungeTime>0)&&(v.attackMode==='recover')===(v.recoverTime>0));
        }
        if(name==='hazards')ok(names(v.kind,['vent','toxin'])&&num(v.phase)&&(v.active===undefined||num(v.active,0,1)));
        if(name==='scenery')ok(names(v.kind,['algae','fibre','diatom','spire','tube','rib'])&&num(v.phase)&&num(v.angle));
      }
      for(const [name,cap] of Object.entries(caps)){ok(list(s[name],cap));for(const e of s[name])entity(e,name,r.chunks);}
      for(const k of r.cacheOrder){const c=r.chunkCache[k];ok(key(k)&&!Object.hasOwn(r.chunks,k)&&object(c)&&meta(c.meta,k));for(const [name,cap] of Object.entries(caps)){ok(list(c[name],name==='landmarks'?1:cap));for(const e of c[name])entity(e,name,{[k]:c.meta});}}
      ok(list(s.projectiles,100)&&list(s.effects,36)&&list(s.particles,280)&&list(s.decoys,2));
      for(const shot of s.projectiles){ok(position(shot)&&radius(shot)&&int(shot.id,1,r.id-1)&&num(shot.vx,-4000,4000)&&num(shot.vy,-4000,4000)&&num(shot.life,-.2,60)&&num(shot.damage,0,1e6)&&names(shot.owner,['player','enemy'])&&string(shot.colour,30));if(shot.poison!==undefined)ok(num(shot.poison,0,10)&&num(shot.poisonDamage,0,1000));if(shot.sourceId!==undefined)ok(int(shot.sourceId,1,r.id-1));if(shot.ambushToken!==undefined)ok(int(shot.ambushToken,1,r.id-1));if(shot.attackToken!==undefined)ok(int(shot.attackToken,1,r.id-1));if(shot.bossId!==undefined)ok(s.bossEncounter&&shot.bossId===s.bossEncounter.id&&shot.bossPhase===s.bossEncounter.phase);if(shot.kind!==undefined||shot.warningTime!==undefined||shot.warningMax!==undefined)ok(shot.kind==='glassCounter'&&num(shot.warningTime,0,.7)&&shot.warningMax===.7&&shot.r===8&&shot.bossId!==undefined&&s.bossEncounter.type==='glass'&&shot.sourceId===shot.bossId&&(shot.warningTime===0||shot.owner==='enemy'&&shot.life===3));}
      for(const a of s.particles)ok(position(a)&&radius(a)&&num(a.vx,-1000,1000)&&num(a.vy,-1000,1000)&&num(a.life,0,10)&&num(a.maxLife,.01,10)&&string(a.colour,30)&&a.kind==='mote');
      for(const e of s.effects){ok(position(e)&&radius(e)&&num(e.maxR,0,10000)&&num(e.life,0,10)&&num(e.maxLife,.01,10)&&string(e.kind,30)&&string(e.colour,30));if(e.kind==='pulse')ok(num(e.angle,-Math.PI,Math.PI)&&e.halfAngle===PULSE_HALF_ANGLE);if(e.kind==='bite'||e.kind==='command')ok(num(e.angle,-Math.PI,Math.PI)&&num(e.halfAngle,0,Math.PI));ok(e.body===undefined||num(e.body,0,5000));ok(e.self===undefined||bool(e.self));}
      for(const d of s.decoys)ok(position(d)&&radius(d)&&num(d.life,0,24)&&num(d.maxLife,.01,24)&&num(d.angle)&&num(d.phase));
      if(s.explored===undefined)s.explored=[];ok(list(s.explored,20000)&&s.explored.every(k=>typeof k==='string'&&/^-?\d{1,7},-?\d{1,7}$/.test(k))&&new Set(s.explored).size===s.explored.length);
      ok(list(s.drops,12));for(const d of s.drops)ok(position(d)&&int(d.id,1,r.id-1)&&Object.hasOwn(MUTATIONS,d.key)&&int(d.tier,0,4)&&string(d.source,60)&&num(d.life,0,60));
      ok(list(s.claimedLandmarks,50000)&&s.claimedLandmarks.every(lmId)&&new Set(s.claimedLandmarks).size===s.claimedLandmarks.length&&object(s.landmarkRecords)&&Object.keys(s.landmarkRecords).length<=50000&&list(s.discoveredLandmarks,200));
      const claimed=new Set(s.claimedLandmarks);
      for(const [id,v] of Object.entries(s.landmarkRecords)){ok(lmId(id)&&object(v)&&bool(v.discovered)&&bool(v.claimed)&&bool(v.active)&&num(v.progress,0,Math.max(...Object.values(LANDMARKS).map(d=>d.goal)))&&list(v.defeated,3)&&new Set(v.defeated).size===v.defeated.length&&v.defeated.every(n=>int(n,0,2)));ok(v.claimed===claimed.has(id)&&(!v.claimed||v.discovered));}
      for(const id of claimed)ok(Object.hasOwn(s.landmarkRecords,id));
      const discovered=new Set();for(const l of s.discoveredLandmarks){ok(position(l)&&lmId(l.id)&&!discovered.has(l.id)&&Object.hasOwn(LANDMARKS,l.type)&&string(l.name)&&int(l.biome,0,2)&&bool(l.claimed)&&num(l.progress,0,l.goal)&&num(l.goal,.1,Math.max(...Object.values(LANDMARKS).map(d=>d.goal)))&&num(l.time,0,s.time)&&object(s.landmarkRecords[l.id])&&s.landmarkRecords[l.id].discovered&&l.claimed===claimed.has(l.id));discovered.add(l.id);}
      for(const l of [...s.landmarks,...Object.values(r.chunkCache).flatMap(c=>c.landmarks)]){const record=s.landmarkRecords[l.id];ok(l.claimed===claimed.has(l.id)&&(!l.discovered||record&&record.discovered)&&(!record||l.discovered===record.discovered&&l.claimed===record.claimed&&l.progress===record.progress));}
      ok(s.sanctumArrivalId===''||lmId(s.sanctumArrivalId));
      ok(s.sanctuaryRest===null||object(s.sanctuaryRest));if(s.sanctuaryRest){const rest=s.sanctuaryRest;ok(Object.keys(rest).length===4&&lmId(rest.id)&&num(rest.progress,0,SANCTUARY_REST_SECONDS)&&bool(rest.completed)&&Object.hasOwn(SANCTUARY_REASONS,rest.reason));ok(rest.completed?(rest.progress===SANCTUARY_REST_SECONDS&&rest.reason==='complete'):(rest.progress<SANCTUARY_REST_SECONDS&&rest.reason!=='complete'&&(rest.reason==='resting'||rest.progress===0)));ok([...s.landmarks,...Object.values(r.chunkCache).flatMap(c=>c.landmarks)].some(l=>l.id===rest.id&&l.type==='sanctuary'));}
      const game=Object.create(MorphosGame.prototype);game.state=s;s.brood=[];game._broodRefill=true;game._events=[];game._claimed=claimed;
      for(const k of ['rng','id','maintain','ai','scoreClock','apexSpawned','lastEat','hungryWarned','wakeClock','streamClock','chunks','chunkCache','cacheOrder'])game['_'+k]=r[k];
      const before={...p,abilityCosts:{...p.abilityCosts},abilityCooldownMax:{...p.abilityCooldownMax}};
      game._derive();for(const k of ['r','cellCount','cellCountText','cellExponent','colonyLevel','maxHp','maxEnergy','speed','attack','pulseRadius','feedRadius','pulseCost','pulseCooldownMax','regeneration','energyRegeneration','resistance','nutritionDrain','concealRate','sneakDrain','landmarkSense','assimilation','sprintDrain','sprintSpeed','effectiveSprintDrain','mutationSlots','criticalChance','critChance','parryRadius','blockCost'])void before[k];/* measurements are always worked out afresh; a stored value that differs (after a balance change) is simply replaced */
      // Saves from earlier builds are re-derived under the current balance rather than rejected.
      ok(object(p.mutationTiers)&&Object.keys(p.mutationTiers).length===p.unlockedMutations.length&&p.unlockedMutations.every(k=>int(p.mutationTiers[k],0,4)));
      ok(object(p.dropPity)&&Object.keys(p.dropPity).length<=60&&Object.entries(p.dropPity).every(([k,v])=>Object.hasOwn(DROP_FROM,k)&&int(v,0,60)));
      if(legacy)game._restock();
      {const st=game.state;for(const [key,w] of game._wonderSites()){const id='lm:'+key,other=l=>l.id===id&&l.type!==w.type,cache=Object.values(game._chunkCache||{});
        if(!((st.discoveredLandmarks||[]).some(other)||(st.landmarks||[]).some(other)||cache.some(c=>(c.landmarks||[]).some(other))))continue;
        delete st.landmarkRecords[id];st.claimedLandmarks=st.claimedLandmarks.filter(x=>x!==id);st.discoveredLandmarks=st.discoveredLandmarks.filter(l=>l.id!==id);game._claimed.delete(id);
        const fresh=()=>game._landmarkFor(...key.split(',').map(Number));if(st.landmarks.some(other))st.landmarks=st.landmarks.filter(l=>l.id!==id).concat([fresh()]);for(const c of cache)if((c.landmarks||[]).some(other))c.landmarks=c.landmarks.filter(l=>l.id!==id).concat([fresh()]);}}
      return game;
    }
    continueEndless(){this.state.endless=true;return this;}
    getSummary(){const s=this.state,p=s.player;return{score:Math.round(s.score),time:Math.round(s.time),kills:s.stats.kills,food:s.stats.food,cells:p.cellCount,cellCountText:p.cellCountText,colonyLevel:p.colonyLevel,traits:{...p.traits},mastery:{...p.mastery},attributes:{...p.attributes},mutations:[...p.mutations],genomes:[...p.genomes],bosses:s.stats.bosses,skillPoints:p.skillPoints,discoveries:s.stats.discoveries,encounters:s.stats.encounters,seed:s.seed,biomass:Math.round(s.biomass),status:s.status,journeyComplete:s.journeyComplete,journeyCompletedAt:s.journeyCompletedAt,deathCause:p.deathCause||'',nutrition:Math.round(p.nutrition),specials:s.stats.specials,ambushes:s.stats.ambushes,evolutionLog:s.evolutionLog.map(e=>({...e}))};}
  }
  MorphosGame.ABILITIES=ABILITIES;
  MorphosGame.STRIKES=STRIKES;
  MorphosGame.STRIKE_TRAITS=STRIKE_TRAITS;
  MorphosGame.isHostile=isHostile;
  MorphosGame.ancientName=ancientName;
  MorphosGame.rankCost=rankCost;
  MorphosGame.TRAIT_NAMES=traitNames;
  MorphosGame.FORKS=FORKS;
  MorphosGame.HYBRIDS=HYBRIDS;
  MorphosGame.FAMILY_RING=FAMILY_RING;
  MorphosGame.rankName=rankName;MorphosGame.MAX_RANK=MAX_RANK;
  MorphosGame.BOSSES=BOSSES;MorphosGame.MAX_TASKS=MAX_TASKS;MorphosGame.TASK_THANKS=TASK_THANKS;MorphosGame.LEGEND=LEGEND;MorphosGame.LANDMARKS=LANDMARKS;MorphosGame.KEEPER_LINES=KEEPER_LINES;MorphosGame.THREADS=THREADS;MorphosGame.HERMIT_MEMORIES=HERMIT_MEMORIES;MorphosGame.WONDER_LINES=WONDER_LINES;MorphosGame.HERMIT_TASKS=HERMIT_TASKS;// A task pays by its effort: the water sets the base, a long trip (over 2,500 from the hermit) adds a tier, and hunting an ancient adds a tier.
  MorphosGame.taskTier=b=>clamp(1+Math.floor((b.zone||0)/8)+(Math.hypot((b.x||0)-(b.hx??b.x??0),(b.y||0)-(b.hy??b.y??0))>2500?1:0)+(b.kind==='hunt'?1:0),1,4);MorphosGame.taskPoint=t=>!t?null:t.done||(t.kind==='rescue'&&t.found)?{x:t.hx,y:t.hy,home:true}:t.kind==='rescue'?{x:t.fx,y:t.fy}:t.kind==='hunt'&&Number.isFinite(t.ax)?{x:t.ax,y:t.ay}:{x:t.x,y:t.y};MorphosGame.WONDERS=WONDERS;MorphosGame.hermitOf=id=>{const r=localRng(seedHash('hermit|'+id))();if(!(id==='lm:0,-1'||r<.55))return '';const q=localRng(seedHash('hermitname|'+id));return HERMIT_NAMES[Math.floor(q()*HERMIT_NAMES.length)]+' '+HERMIT_EPITHETS[Math.floor(q()*HERMIT_EPITHETS.length)];};MorphosGame.DEN_TIME=DEN_TIME;MorphosGame.waterLevel=waterLevel;MorphosGame.depthAt=depthAt;MorphosGame.DEPTHS=DEPTHS;MorphosGame.ZONE_STEP=ZONE_STEP;MorphosGame.COOP_DOWN_SECONDS=COOP_DOWN_SECONDS;MorphosGame.TIERS=TIERS;MorphosGame.TIER_COLOURS=TIER_COLOURS;MorphosGame.MUTATION_SOURCE=MUTATION_SOURCE;MorphosGame.describeMutation=describeMutation;MorphosGame.describePerk=describePerk;MorphosGame.KIND_NAMES=KIND_NAMES;MorphosGame.canSwallow=canSwallow;MorphosGame.WAKE_NEEDS=WAKE_NEEDS;MorphosGame.CHUNK=CHUNK;
  MorphosGame.bossExposure=bossExposure;
  MorphosGame.pulseHalfAngle=PULSE_HALF_ANGLE;
  MorphosGame.pulseAngle=pulseAngle;
  MorphosGame.pulseHits=pulseHits;
  MorphosGame.sanctuaryStatus=sanctuaryStatus;MorphosGame.sanctuaryThreat=sanctuaryThreat;
  MorphosGame.ATTRIBUTES=ATTRIBUTES;
  MorphosGame.MUTATIONS=MUTATIONS;
  MorphosGame.SPECIES=SPECIES;
  MorphosGame.RARITY_SCORE=RARITY_SCORE;
  MorphosGame.MUTATION_SLOT_STAGES=MUTATION_SLOT_STAGES;
  MorphosGame.BODY_PARTS=BODY_PARTS;
  MorphosGame.SAVE_VERSION=17;
  if(typeof module!=='undefined'&&module.exports)module.exports=MorphosGame;
  global.MorphosGame=MorphosGame;
})(typeof window!=='undefined'?window:globalThis);
