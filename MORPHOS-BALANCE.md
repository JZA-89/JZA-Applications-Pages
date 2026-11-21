# MORPHOS — Balance

The backbone of the game. It holds the rules every part of MORPHOS must follow, the formulas that tie the numbers together, the budget each kind of thing is allowed, a recipe for adding each kind of thing, how changes are tested, and a log of every decision.

**How to use it**
- Read it before changing or adding any weapon, move, mutation, creature, boss, place or task.
- A new thing starts from its recipe (section 6), must fit its budget (section 4), and must pass its tests (section 7).
- If something cannot be made to fit without a special rule, the design is wrong, not the rules (rule 3).
- Every change gets a line in the decision log (section 9).
- `MORPHOS-FORMULAS.md` is the full reference: every formula in the code, quoted exactly, with where to find it and measured example values. This file is the rulebook; that one is the evidence.

---

## 1. Rules

### Design
1. **Damage follows risk.** The closer a weapon makes you get, the more damage it does for its stamina. Range, aim lock and piercing are paid for with lower damage.
2. **Every weapon stands alone.** Players do not switch weapons mid-fight. Each weapon must carry a whole life on its own.
3. **Numbers only.** Balance with damage, cost, cooldown, range, duration and size. No special rules added to make something work; if it needs rules on rules, it is wrong.
4. **Things fill gaps.** A new move, weapon or creature must do something nothing else does. If it repeats one, it does not go in.
5. **Weapons are physical attacks.** A weapon is what the cell itself does. Summoning, poison spreading and stealth belong to the class moves.
6. **It is meant to be hard.** No instruction or hint text in play. Story text and plain facts are fine.
7. **Fair telegraphs.** Every attack shows itself before it lands and locks its aim early enough that a player who reads it can step aside without draining all their stamina.

### Numbers
8. **Measure outcomes, not just damage.** Range, aim help and piercing show up as faster kills and less health lost, so tests measure those.
9. **Count by stamina, not by presses.** Anything that triggers "on a Strike" triggers once per 18 stamina spent on Strikes (one ordinary Strike).
10. **Scale with the body.** Values meant to feel the same at every size are shares of the body's own numbers (healing is a share of maximum health), never flat amounts.
11. **The water decides the world; the colony decides you.** Creatures, hazards, food and their dangers come from the water level where they are; your own numbers come from your cells. Nothing in the world reads your size to decide how strong it is. *(Several exceptions remain; see section 8.)*
12. **Rewards are shares of the current level.** Growth rewards are a share of what your next cell costs (`_divisionShare`), so they keep their worth at every size.
13. **Reward follows effort.** The water, the length of the trip and whether it means fighting something big set the reward.
14. **One curve per relationship.** The same relationship (for example "how much a level gap matters") uses one formula everywhere. *(Not yet true; see section 8.)*
15. **No hidden multipliers.** Every multiplier that changes how strong something is must be listed here or in `MORPHOS-FORMULAS.md`. A number nobody can find is a bug.

---

## 2. The model: what drives what

Two inputs drive almost everything.

**Your cells** set your body's width: `F = cells^0.25`, which stops growing at 30 cells.
- Every body number is a base × `F^2.2` (the **size power**): health 100, attack 11.
- Stamina never scales: 100 maximum, 18 per Strike, 17 a second regenerated. Stamina is the one currency that means the same thing at every size, which is why damage per stamina is the measure of a weapon.
- Weapons and class moves are multiples of attack.

**The water level** sets the creatures around you: one level per 850 units out from the nursery (nursery radius 1,250), up to 40.
- A creature's size is that level's width × a random 0.45–1.5.
- Its health, bite and food value scale with its size to the power 2.2, with a toughness curve on health (×1 up to level 3, rising to ×3.6) and a bite curve (+2% per level, at most +35%).

**The level gap** ties the two together: each level between you and a creature changes the damage you deal and take by 8%, and what it is worth by 12% (worth is capped at +30%).

**Growth:** each cell costs more than the last (`levelCost`); food is worth more in deeper water and to a bigger colony (`pace = cells^0.3625`). A cell takes about 2–3 minutes of play throughout.

**Bosses** are built from their own level (as a colony of that many cells): health = `hits × 21 ×` that size power, each attack a multiple of `dmg × 100 ×` that size power, cruise speed that of such a colony. Your size when it wakes does not matter.

**Class moves** are attack × their own class's power (1 + 0.32 per rank). **Swallowing** needs a creature 2.8× your size and at least 3 levels above you.

### Key numbers by colony size (no stats, no mutations)

| Cells | Health | Attack | Cruise speed | Health regen /s | Cost of next cell |
|---|---|---|---|---|---|
| 1 | 100 | 11 | 144 | 0.45 | 170 |
| 6 | 268 | 30 | 176 | 1.21 | 1,222 |
| 12 | 392 | 43 | 190 | 1.77 | 3,471 |
| 18 | 490 | 54 | 199 | 2.21 | 6,375 |
| 24 | 574 | 63 | 206 | 2.58 | 9,788 |
| 30+ | 649 | 71 | 211 | 2.92 | 13,631 (+510 per cell after) |

### A creature of your own level (plain hunter)
| Water level | Its health | Rare Bites to kill | Its lunge, share of your health | Kill, share of a level |
|---|---|---|---|---|
| 1 | 93 | 2.8 | 13% | 3.5% |
| 6 | 435 | 4.9 | 14% | 2.7% |
| 12 | 1,055 | 8.2 | 16% | 1.8% |
| 18 | 1,473 | 9.1 | 17% | 1.4% |
| 30 | 2,393 | 11.2 | 18% | 1.1% |

---

## 3. How strength is measured

In a long fight every weapon is limited by stamina, not by its cooldown: all settle at about 18–20 stamina a second, which is what regenerates. So:
- **Weapons** are compared by **damage per stamina** (× your attack).
- **Class moves** are compared by what one use does, against how many seconds of a weapon's sustained damage that equals.
- **Everything** is finally judged by outcomes in test fights: time to kill, health lost, stamina left.

---

## 4. Budgets

What each kind of thing is allowed to be worth. A new thing must land inside its budget.

### 4.1 Weapons: damage per stamina by range (single target, × attack)
| Range band | Budget | Current |
|---|---|---|
| Touching | 0.16–0.18 | Bite 0.167 |
| Short | 0.10–0.13 (more on groups) | Spore burst about 0.10 single, about 0.24 on four |
| Short to medium | 0.09–0.11 | Spike gun 0.093 |
| Medium | 0.09–0.11 including poison | Spit about 0.10 |
| Long | 0.07–0.08 (aim help and piercing are paid for here) | Needle 0.075 |
| Starter | lowest | Jab 0.056 |

Damage per stamina = damage × attack ÷ stamina per Strike. A weapon that hits several targets may exceed its band on groups only.

### 4.2 Class moves
- **Damage moves** (Pounce, Venom volley, Swarm): one use at rank I is worth about **1.5–4 seconds** of a matched Bite's sustained damage; rank V about **3–4 ×** rank I. Measured at 24 cells: Pounce 233 → 900, Venom volley 362 → 843 (1,885 on four), Swarm 705 → 1,889.
- **Control and utility moves** (Whirlpool, Decoy) are not held to a damage budget. They are judged by outcome: health lost and kill time in group fights.
- Cost 24–26 stamina at rank I, falling by 2 per rank (never below 16); cooldown 8–12 s, falling by 0.5 per rank (never below 6).

### 4.3 Stats and mutations
- **One stat point** is worth about **+6–12% in one area**: Vitality +12% base health, Reserves +12 stamina, Recovery +0.12% health and +1.5 stamina a second, Power +8% damage, Reach +10% shot range and +5% Jab and Bite range, Mobility +6% speed.
- **A Rare mutation** is worth about **1.5–2 stat points** in its own area. Rarity multiplies it: Common 0.7, Uncommon 0.85, Rare 1 (the written number), Epic 1.25, Legendary 1.55. Its extra perk exists only from Rare and scales 1 / 1.6 / 2.4 (Rare / Epic / Legendary).

### 4.3b Kinds of mutation (v35.8)
Rarity decides the *kind* of effect, and every effect comes from the body part that holds it (Hades-style: each part owns an action).

| Part | Owns |
|---|---|
| Strike organ | the weapon |
| Mouth | eating, swallowing, digesting |
| Membrane | contact, being hit, defence |
| Flagellum | propulsion, movement, what is behind you |
| Nucleus | the class moves (it grows the organs each move uses) |
| Senses | detecting, seeing, aiming |

| Rarity | Kind | Minimum |
|---|---|---|
| Common, Uncommon | number (a stat or rate) | any |
| Rare | trigger (when X, do Y) | `minTier 2`: found copies are never below Rare, and a drop the water cannot give that rarity does not appear |
| Epic | class-move change (Nucleus) | `minTier 3` |
| Legendary | rule change | (to come) |

Mutations read and write shared **keywords** (poison, bleed, stun, slow, held, concealed, momentum, frenzy, brood), so combinations come without new rules.

**Batch 1 (v35.8):** Rare triggers: Bile sac (mouth: swallowing spits acid, 2 poison stacks beside you), Clinging slime (membrane: what hits you is slowed 1.5 s), Tail flick (flagellum: starting a fast swim stuns what is behind you 0.6 s, 4 s recharge), Echo nucleus (nucleus: after a class move, next Strike +30%), Pit organ (senses: poisoned creatures stay visible and take +10%). Epic move changes (nucleus): Rending pounce (bleed 0.35 × attack a second for 4 s), Clinging venom (missed globs leave a 3 s venom pool), Last breath (dying broodlings stun 0.8 s), Toxic husk (decoy bursts for 3 poison stacks), Venom eddy (whirlpool-held creatures gain 1 poison stack a second).

### 4.4 Rewards (share of your next cell's cost)
| Source | Share | Plus |
|---|---|---|
| Boss | 0.40 | 2 stat points (first kill), its mutation, full health |
| Wonder | 0.35 | Legendary mutation, 1 stat point (Abyssal Eye 3) |
| Predator nest | 0.20 | 1 challenge stat point |
| Hermit task | 0.15 | mutation at the effort tier (rule 13) |
| Gene cache, ancient fossil | 0.09 | fossil: a Rare mutation |
| Sealed shell, hidden garden (secrets) | 0.09 | sealed shell: a Rare mutation and an echo; hidden garden: full health and nutrition and an echo |
| Silent current (secret) | 0 | a rare creature of the water it leads to, which always drops a mutation |
| Fallen giant, toxic garden, black smoker | 0.07 | |
| Glass vault | 0.05 | mutation as good as its water allows |
| Field study | 0.03 | |

**Hermit reward tier** = 1 + (water level ÷ 8, rounded down) + 1 for a trip over 2,500 from the hermit + 1 for hunting an ancient, from Uncommon to Legendary.

**Mutation drops:** chance by the creature's rarity (common 5%, uncommon 9%, rare 22%, legendary always), raised by bad luck; ancients always drop. Rarity roll 50 / 28 / 14 / 6 / 2% (Common … Legendary), capped by the water: Uncommon at best to water level 6, Rare to 12, Epic to 18, Legendary below.

### 4.5 Creatures
- A **matched plain hunter** is the yardstick: about 3 Rare Bites to kill at level 1, about 11 at level 30, and its lunge takes 13–18% of your health.
- Any new creature's danger (bite as a share of your health) and toughness (hits to kill) should sit within about ±50% of the matched hunter at its first level, unless it is a rare or legendary meant to stand out.
- **Ancients:** ×4 health, ×1.25 bite, ×1.3 speed, a guaranteed drop.

### 4.6 Bosses
Measured v35.7 (strong build, dodging bot, three fights each). Health in "hits" × 21 × the boss level's size power.

| Boss | Level | Hits | Kill time | Health lost | Target kill time |
|---|---|---|---|---|---|
| Gulper | 6 | 41 | 37–44 s | about 1× max | about 40 s |
| Broodmother | 12 | 85 | 84–93 s | under 3× | about 80 s |
| Glass Pike | 18 | 74 | 78–92 s | about 1× | about 90 s |
| Hydra | 24 | 165 | 93–99 s | under 2× | about 100 s |
| Undertow | 30 | 208 | 140–159 s | under 3× | about 150 s |
| Kraken | 36 | 480 | 3.6–4.2 min | under 5× | 3.5–4 min |

Each boss must sit between its neighbours in kill time. A strong-build bot should die at most once per fight before the Kraken. Time exhausted under 20%.

---|---|---|---|---|
| Gulper | 6 | about 40 s | about 1× max | under 20% |
| Broodmother | 12 | about 80 s | under 3× | under 20% |
| Glass Pike | 18 | about 90 s | under 2.5× | under 20% |
| Hydra | 24 | about 100 s | under 2.5× | under 20% |
| Undertow | 30 | about 150 s | under 4× | under 20% |
| Kraken | 36 | 3.5–4 min | under 6× | under 20% |

Each boss must sit between its neighbours in kill time. A strong-build bot should die at most once per fight before the Kraken.

---

## 5. Current tables

### 5.1 Weapons (Strike organ)
Weapons come only from mutations dropped by the creature that uses them. Better rarity multiplies damage. Base stamina cost per Strike is 18. Ranges in play are described only as Short, Medium or Long range, because Reach changes them.

| Weapon | Range | Damage (× attack) | Stamina | Cooldown | Damage per stamina | Role |
|---|---|---|---|---|---|---|
| Bite | Short (touching) | 3.0 | 18 | 0.54 s (0.50 s from Rare) | 0.17 | Heavy single hits. Swallows creatures much smaller than you. From Jaws (hunters). |
| Spore burst | Short | 7 spores × 0.6 | 18 | 0.7 s | about 0.10 single, much more on a group | Wide spray. From the Spore sac (swarmers). |
| Spike gun | Medium | 0.3 per spike | 3.2 per spike | 0.13 s | about 0.09 | Hold to fire a stream. From the Spike battery (skimmers). |
| Spit | Medium | 0.8 plus poison | 13.5 (12.15 from Rare) | 0.42 s | about 0.10 | Poison stacks on one target. From the Spitting gland (puffers). |
| Needle | Long | 1.35 (unaware 1.8×) | 18 | 0.8 s | 0.075 | Aim lock, pierces everything on its line, barely breaks stealth. From the Needle spine (needlefish). |
| Jab | Short | 1.0 | 18 | 0.68 s | 0.056 | The starter. Meant to be weakest. |

Measured at 24 cells (attack 63), damage per stamina, single target: Bite 9.1, Spore burst 6.4, Spike gun 6.3, Spit 6.1, Needle 4.6, Jab 2.1.

**Considered and rejected:** Suction tentacle (healing on top of mid-range damage is either too strong or too weak); Seed shot (a Brood move dressed as a weapon); Lash (pulling yourself to a big creature only puts you in danger); Dart (fast swimming and Pounce already move you). **Removed in v35.1:** Surge and Command pulse.

### 5.2 Class moves
| Class | Move | Role | Cost / cooldown, rank I → V | Wakes after |
|---|---|---|---|---|
| Predator | Pounce | Lunge and heavy bite on the first creature met | 26 / 8 → 18 / 6 | 12 kills |
| Venomist | Venom volley | Fan of venom; a rupture spreads poison through a group | 24 / 8 → 16 / 6 | 2 stings or venom kills |
| Brood | Swarm | Buds broodlings and sends all of them at your aim | 26 / 10 → 18 / 8 | 3 divisions |
| Stalker | Decoy | Phantom that distracts hunters; brief concealment | 24 / 11 → 16 / 9 | 5 s moving hidden near a predator |
| Riptide | Whirlpool | Crowd control: pulls in and holds a group | 26 / 12 → 18 / 10 | 5 close calls |

Before rank I a move works at novice strength (×0.75). Experience to rank I is 240, then 700, 1,500, 2,800, 4,500, then mastery every 1,000.

**Whirlpool (v35.1):** a vortex where you cast it, 3 s (4 from rank III; novice 2.25). Radius your body + 170 (×1.35 Wide pull). Holds creatures up to 0.8 of your size (your full size with Wide pull): they cannot attack. Bigger creatures are slowed; a boss inside moves half as far. Food is drawn in. It ends by throwing everything outward. Forks: II Wide pull / Grinding current (0.5 × attack a second to held creatures); IV Maelstrom (1.6 × attack to each creature thrown) / Eye of the storm (25% faster, 30% less damage taken inside your own); V grips a boss for its first second.

### 5.3 What the move set covers
| Need | Covered by |
|---|---|
| Single-target damage | weapons, Pounce |
| Poison and spread | Spit, Venom volley |
| Helpers | Swarm |
| Escape and stealth | fast swimming, Decoy |
| Crowd control | Whirlpool |
| Healing | food, Recovery stat (no healing move) |

### 5.4 Boss notes
- **Glass Pike (v35.4):** twos in its first phase and threes after; 0.55 s between dashes (0.4 s in its last phase); a dash locks its line with 70% of its wind-up left; health 110 hits. Measured: exhausted 30% → about 19%, dash damage 3.1× → 1.5× max health, kill about 87 s.
- **Exhaustion stays as it is:** when stamina empties you cannot swim fast until it is full again (Jaisah).
- Enraged below a quarter of its health: 12% faster, 25% shorter pauses. Outgrown by a level: faster and harder to lose; by two or more: never lets you go.

### 5.5 Other fixed numbers
- Hits from the side +15%, from behind +30%.
- Starving: 2.5% of maximum health a second at empty nutrition (40 s from full).
- Healing: 0.45% of maximum health a second, plus 0.12% per Recovery point (full heal about 3.7 min with none, 1 min at Recovery 10, at any size).
- Stat limit: 2 at 1 cell, +1 per cell up to 10, and 12 from 31 cells. One point per division, 2 per boss, 1 per wonder (3 for the Abyssal Eye), and challenge points from nests and rare kills.

---

## 6. Recipes: adding something new

Each recipe lists what to set and what it must pass. Anything not listed comes from the model (section 2), not from new numbers.

**A creature**
1. Name the gap it fills (rule 4) and pick the closest base kind (prey, grazer, hunter, armoured, apex, swarmer, sentinel, jelly).
2. Set its size range, health, speed, food value, bite, the water level it first appears at, and its rarity (common, uncommon, rare, legendary).
3. Its strength must come from the water it lives in, never from the player (rule 11).
4. If it carries a weapon or mutation, it is that item's drop source.
5. Test: at its first level, hits to kill and bite share of your health within ±50% of a matched hunter (4.5), unless deliberately rare.

**A mutation**
1. Name the gap it fills and its body part.
2. Write its main effect at Rare strength, sized to 1.5–2 stat points in its own area (4.3). Its perk (Rare and up) is a smaller second effect.
3. Anything "on a Strike" counts by stamina (rule 9); anything that should feel the same at every size is a share of a body number (rule 10).
4. Choose the creature that drops it.
5. Test: with the outcome bot, it improves its target outcome by about one to two stat points' worth, on every weapon.

**A weapon**
1. Choose its range band (4.1) and what makes it play differently (rule 4).
2. Set damage, stamina per Strike and cooldown so its damage per stamina sits in its band.
3. Test: `test/weaponsim.js`, then the outcome bot (kill time and health lost within 15% of the other weapons).

**A class move**
1. It must fill a gap in 5.3.
2. Damage moves fit the 4.2 budget; control moves are judged by outcome.
3. Two forks at II and IV, a fixed capstone at V; each fork is a number change to the move, not a new rule.
4. Test: `test/abilitysim.js` and the outcome bot in group fights.

**A boss**
1. Set its level, size, `hits` and `dmg` so its kill time sits between its neighbours (4.6).
2. Every attack follows rule 7: it shows itself, and locks its aim early enough to step aside.
3. Test: `test/bosssim.js` (time exhausted under 20%, health lost inside its budget).

**A place**
1. Name what it asks of the player (fight, hold still, find, survive).
2. Its reward is a share from 4.4, larger for more risk and effort.
3. Hazards must never sit on the spot you have to reach.

**A hermit task kind**
1. It must ask for something different from hunt, nest, place, rescue and fetch.
2. Its reward comes from the effort formula (4.4); add a term only if it is a new kind of effort, such as a big fight.

---

## 7. Testing

### Method
A test bot fights the same set of fights with each weapon, played the way that weapon is meant to be played: strafing and keeping distance with ranged weapons, staying close with Bite, dodging telegraphed attacks with all of them. The fights are:
1. one hunter, at the player's level
2. a pack of four
3. an ancient
4. each boss, at its own level

Each fight records time to kill, health lost (in multiples of maximum health) and stamina left. Target: on kill time and health lost combined, every weapon lands within about 15% of the others. Play testing is the final check on feel.

### Tools (scratchpad, Claude sessions)
- `test/weaponsim.js`: damage per second and per stamina, single, grouped and unaware.
- `test/abilitysim.js`: damage from one use of each class move at ranks I, III and V.
- `test/bosssim.js`, `test/bosssim2.js`, `test/bosssim3.js`: a dodging bot fights each boss; reports kill time, health lost, time exhausted and damage by attack.
- `balance/m1.js` … `m8.js`: the measurements behind `MORPHOS-FORMULAS.md`.
- Still to build: the outcome bot described above.

---

## 8. Known breaks in the rules (balance debt)

Status after v35.7. Fixed items stay listed so the reasoning is kept.

| # | What broke | Rule | Status |
|---|---|---|---|
| 1 | Kill remains were scaled for size twice (deep down worth about 5× the kill) | 12, 14 | **Fixed v35.7:** scaled once; remains are worth about 0.8× the kill at every depth |
| 2 | About 80% of apex creatures could swallow a player of their own level | 7, 11 | **Fixed v35.7:** swallowing needs a creature 2.8× your size **and** at least 3 levels above you. Your level is your strength. At your own level: 0% |
| 3 | Bosses were built from your size when they woke, and their speed followed yours | 11 | **Fixed v35.7:** built from their own level (fixed stats, as in most RPGs); speed from their own size |
| 4 | Hazards and legendaries scaled with you, not the water | 11 | **Fixed v35.7** (thorns too) |
| 5 | Four level-gap curves; boss and hermit rewards had none | 14 | **Fixed v35.7:** one damage curve (±8% a level, 0.35–2.2), one worth curve (±12% a level, 0.2–1.3) on kills, food, places, studies, hermit and boss rewards |
| 6 | Hidden multipliers (`heft`, halved species bites, the old tier system) | 15 | **Documented** in `MORPHOS-FORMULAS.md`; the tier system's last live use (the giant's scavengers) removed |
| 7 | Flat amounts (sanctuary healing, algae heal, protein stamina, food nutrition) | 10 | **Fixed v35.7:** sanctuary heals 3% + 1% per variant of max health a second; refills follow the food's kind, not its depth |
| 8 | The after-meal heal ignored Recovery though Recovery claimed it | 10 | **Fixed v35.7:** Recovery's text no longer claims it; the heal is the same for everyone |
| 9 | Class ranks still changed base stats | 3 | **Decided v35.7:** kept as each class's passive (Riptide stamina and speed, Predator swallowing, Stalker concealment) and documented |
| 10 | Each class move had its own damage base, and Pounce, broodlings and the Whirlpool grew with Predator and Riptide ranks whatever your class | 14 | **Fixed v35.7:** every class move is attack × its own class's power. Mixed builds' broodlings had been doing about 3× their intended damage |
| 11 | Spores, stings, touch and leeches skipped the deep-water bite bonus | 14 | **Fixed v35.7** |
| 12 | Vitality's text said "+12 maximum health" | 15 | **Fixed v35.7:** "+12% of base maximum health" |
| 13 | Rams hit bosses 1.4× harder and more often | 3 | **Fixed v35.7:** same as on creatures |
| 14 | Engulfing membrane widened Bite and touch swallowing by different amounts; Apex jaws quietly widened touch swallowing | 15 | **Fixed v35.7:** +15% to both; Apex jaws does only what it says |
| 15 | Dead code from removed things | 15 | **Partly fixed v35.7:** Slipstream's multipliers removed from the formulas; some inert Surge code and save fields remain (harmless) |

## 9. Decision log

| Version | Decision | Why |
|---|---|---|
| v35.0 | Bite 2.0 → 3.0; Command pulse 1.5 → 1.9; Needle 1.9 → 1.35, full stamina cost, 0.8 s cooldown; Needle's unaware bonus stated in its description | Needle had the best damage per stamina while also being the safest weapon |
| v35.1 | Whirlpool replaces Slipstream, with a new Riptide lineage | Nothing controlled a group; Slipstream was a passive buff that did not scale |
| v35.1 | Spike gun and Spore burst replace Surge and Command pulse | Surge repeated fast swimming and Pounce; Command pulse only worked with broodlings |
| v35.2 | Weapon text says Short, Medium or Long range, never exact lengths | Reach changes every length |
| v35.4 | Glass Pike fairer (5.4) | Exhausted 30% of the fight; three dashes 0.16–0.3 s apart could only be dodged by swimming fast throughout |
| v35.4 | Strike mutations count stamina (rule 9) | Spike gun with Spore gland reached 21 damage per stamina against 6.3 |
| v35.4 | Healing is a share of maximum health (rule 10) | A full heal took 3.7 min at 1 cell and 21 min at 24 cells |
| v35.4 | Stalker wakes at 5 s, Venomist at 2 | Stalker never woke in 20 min of normal play; Venomist took 5–6 min |
| v35.4 | Mobility 6%, Reach 5% for Jab and Bite | They were the weakest picks per point |
| v35.4 | Hermit rewards by effort (rule 13) | A one-minute task paid the same as a long one |
| v35.4 | Exhaustion unchanged | Jaisah: stamina stays as it is |
| v35.6 (docs) | This document becomes the rulebook: model, budgets, recipes, balance debt; full formula inventory in `MORPHOS-FORMULAS.md` | So that everything added later fits one set of rules |
| v35.6 | A dropped mutation no better than your copy never appears (it no longer turns into growth) | Duplicates were confusing and the growth was meaningless; more mutation types will make them rarer anyway |
| v35.7 | Fixed the rule breaks in section 8 | They contradicted the rules in section 1 |
| v35.8 | First 10 keyword mutations; rarity decides kind (minTier); every effect comes from its own body part | Jaisah: mutations must be logical (a tail cannot make a wound at the front) and more varied; Hades/Diablo/Slay the Spire patterns |
| v35.7 | Boss health re-tuned: Gulper 41, Broodmother 85, Glass Pike 74, Hydra 165, Undertow 208, Kraken 480 hits | With class moves from their own class only (break 10), mixed builds lost broodlings and Pounce damage they never should have had; the old health had been tuned against it |
| v35.9 | Story step 1: echoes in fossils and shells (`LEGEND`, earliest unheard one the water allows), a wake and fall line for each boss (`KEEPER_LINES`), an inscription for each wonder (`WONDER_LINES`), all collected in the Field guide's Legend tab | The plan's "The Last Water": story told only through what you find; no rewards or numbers changed |
| v36.0 | First three secrets: sealed shell (water 6+, stay still 5 s inside), hidden garden at the end of a lantern trail (water 10+), silent current (water 12+, carries you 2,800 deeper to a rare creature that always drops). Only in regions that were empty, so no older pond loses a place, record or task | The plan's secrets: rewards for curiosity, built from what the game already has (stillness, places, currents, creatures); no instruction text |
