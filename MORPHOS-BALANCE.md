# MORPHOS — Balance

The rules, numbers and decisions behind how MORPHOS is balanced. Read this before changing any weapon, class move, creature or boss, and add a line to the decision log when you change one.

## Rules

1. **Damage follows risk.** The closer a weapon makes you get, the more damage it does for its stamina. Range, aim lock and piercing are paid for with lower damage.
2. **Every weapon stands alone.** Players do not switch weapons mid-fight. Each weapon must carry a whole life on its own.
3. **Numbers only.** Balance a move with its damage, cost, cooldown, range and duration. No special rules added to make a move work.
4. **Moves fill gaps.** A new move must do something no existing move does. If it repeats one, it does not go in.
5. **Weapons are physical attacks.** A weapon is what the cell itself does. Summoning, poison spreading and stealth belong to the class moves.
6. **It is meant to be hard.** No instruction or hint text in play. Story text is fine.
7. **Measure outcomes, not just damage.** Intangibles show up as faster kills and less health lost, so test fights measure those (see Method).

## How strength is measured

### What decides a weapon's strength
In a long fight every weapon is limited by stamina, not by its cooldown: all of them settle at about 18–20 stamina a second, which is what regenerates. So the main number is **damage per stamina**. Cooldown only matters for short bursts.

### Method
A test bot fights the same set of fights with each weapon, played the way that weapon is meant to be played: strafing and keeping distance with ranged weapons, staying close with Bite, dodging telegraphed attacks with all of them. The fights are:

1. one hunter, at the player's level
2. a pack of four
3. an ancient
4. each boss, at its own level

Each fight records:
- **time to kill**
- **health lost**, in multiples of maximum health
- **stamina left** at the end

**Target:** on kill time and health lost combined, every weapon lands within about **15%** of the others. Play testing is the final check on feel.

### Tools (scratchpad, Claude sessions)
- `test/weaponsim.js`: damage per second and per stamina against practice targets, single, grouped and unaware.
- `test/abilitysim.js`: damage from one use of each class move at ranks I, III and V.
- `test/bosssim.js`: a dodging bot fights each boss with average or strong gear.
- Still to build: the outcome bot described under Method.

## Weapons (Strike organ)

Weapons come only from mutations dropped by the creature that uses them. Better rarity (tier) multiplies damage. Base stamina cost per strike is 18.

| Weapon | Range | Damage (× attack) | Stamina | Cooldown | Damage per stamina | Role |
|---|---|---|---|---|---|---|
| Bite | touching | 3.0 | 18 | 0.54 s | 0.17 | Heavy single hits. Swallows creatures much smaller than you. |
| Spore burst | short | 7 spores × 0.6 | 18 | 0.7 s | about 0.10 single, much more on a group | Wide spray of seven spores. From the Spore sac (swarmers). |
| Spike gun | short to middle | 0.3 per spike | 3.2 per spike | 0.13 s | about 0.09 | Hold to fire a stream of spikes. From the Spike battery (skimmers). |
| Spit | middle | 0.8 plus poison | 13.5 | 0.42 s | about 0.10 | Poison stacks on one target. |
| Needle | far | 1.35 (unaware 1.8×) | 18 | 0.8 s | 0.075 | Aim lock, pierces everything on its line, barely breaks stealth. |
| Jab | short | 1.0 | 18 | 0.68 s | 0.056 | The starter. Meant to be weakest. |

**Removed in v35.1:** Surge (a third way to move fast, after fast swimming and Pounce) and Command pulse (only useful with broodlings). Saves holding a Surge fin or Command gland get a Spike battery or Spore sac of the same rarity.

Measured at 24 cells (attack 63), damage per stamina, single target: Bite 9.1, Spore burst 6.4, Spike gun 6.3, Spit 6.1, Needle 4.6, Jab 2.1.

**Considered and rejected:**
- Suction tentacle: healing on top of mid-range damage is either too strong or too weak; food and Recovery already cover healing.
- Seed shot: a Brood move dressed as a weapon.
- Lash: pulling yourself to a big creature only puts you in danger.
- Dart: fast swimming and Pounce already move you.

## Class moves (lineage)

Each class has one move. Ranks make it stronger; before rank I it works at a weaker novice strength. Cost and cooldown fall with rank.

| Class | Move | Role | Rank I → III → V damage, one target |
|---|---|---|---|
| Predator | Pounce | Lunge and heavy bite on the first creature met | 233 → 444 → 900 |
| Venomist | Venom volley | Fan of venom globs; rupture spreads poison through a group | 362 → 612 → 843 (up to 1,885 on four) |
| Brood | Swarm | Buds broodlings and sends all of them at your aim | 705 → 1,202 → 1,889 (targets did not fight back) |
| Stalker | Decoy | Phantom that distracts hunters; brief concealment | utility; the payoff is the ambush |
| Riptide | Whirlpool | Crowd control: pulls in and holds a group | control; Grinding current and Maelstrom add damage |

Measured at 24 cells (attack 63) with `test/abilitysim.js`.

### Whirlpool (v35.1)
- Creates a vortex where you cast it, for 3 seconds (4 from rank III; novice 2.25). Radius: your body + 170 (× 1.35 with Wide pull).
- Creatures up to 0.8 of your size (your full size with Wide pull) are pulled to the centre and held: they cannot start or finish an attack. Bigger creatures are slowed; a boss inside moves half as far. Loose food is pulled in too.
- Grinding current: held creatures take 0.5 × attack a second. Maelstrom: the release deals 1.6 × attack to each creature thrown. Eye of the storm: 25% faster and 30% less damage taken inside your own whirlpool. Rank V: a boss inside cannot move for the first second.
- In co-op a friend's whirlpool acts on the creatures your device runs.
- Ends by releasing everything outward.
- You stay free to attack what it holds.
- 26 stamina, 12-second cooldown.

| Rank | Effect |
|---|---|
| I | Whirlpool at full strength |
| II (choose) | **Wide pull:** larger radius, holds creatures up to your own size. **Grinding current:** held creatures take damage the whole time. |
| III | Lasts 1 second longer |
| IV (choose) | **Maelstrom:** the release hurls creatures into each other, damaging both. **Eye of the storm:** inside your own whirlpool you swim faster and take less damage. |
| V | Also grips bosses for 1 second |

Removed with it: Slipstream, and the Riptide forks Twin flagella, Ciliary skirt, Jet mantle and Pressure wake. Fast swimming stays. Riptide trains on rams, near misses, escapes, and holding creatures in the whirlpool.

### What the move set covers
| Need | Covered by |
|---|---|
| Single-target damage | weapons, Pounce |
| Poison and spread | Spit, Venom volley |
| Helpers | Swarm |
| Escape and stealth | fast swimming, Decoy |
| Crowd control | Whirlpool |
| Healing | food, Recovery stat (no healing move needed) |

## Bosses

Tuned with `test/bosssim.js` (strong build, Bite, dodging bot). Target kill times and the latest measurement (v35.0):

| Boss | Level | Target | Measured |
|---|---|---|---|
| Gulper | 6 | about 45 s | 38–41 s |
| Broodmother | 12 | | 80–83 s |
| Glass Pike | 18 | | 84–109 s |
| Hydra | 24 | | 91–110 s |
| Undertow | 30 | | 146–162 s |
| Kraken | 36 | about 3.5 min | 234–247 s |

## Other fixed numbers

- **Level gap:** each level of difference between you and a creature changes damage dealt and taken by 8%, and what it is worth by 12%.
- **Hits from the side and behind:** +15% on the side, +30% from behind.
- **Body size:** grows with cells^0.25; health, damage and food value scale with that width to the power 2.2.
- **Water level:** one level per 850 units out from the nursery.
- **Starving:** health falls by 2.5% of maximum a second at empty nutrition.

## Decision log

| Version | Decision | Why |
|---|---|---|
| v35.0 | Bite 2.0 → 3.0; Command pulse 1.5 → 1.9; Needle 1.9 → 1.35, full stamina cost, 0.8 s cooldown; Needle's unaware bonus stated in its description | Needle had the best damage per stamina while also being the safest weapon. Kept. |
| v35.1 | Whirlpool replaces Slipstream, with a new Riptide lineage | Nothing controlled a group; Slipstream was a passive buff that did not scale |
| v35.1 | Spike gun and Spore burst replace Surge and Command pulse | Surge repeated fast swimming and Pounce; Command pulse only worked with broodlings |
