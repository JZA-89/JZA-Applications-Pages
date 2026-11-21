# MORPHOS balance formulas: full inventory (from morphos.html, v35.x)

Source: `/home/user/jza-applications-pages/morphos.html`, engine script (lines 2012–4660). Every entry gives the exact
expression, a search string (`grep -o -P '.{0,80}<search>.{0,200}' morphos.html`), the rule in plain words and example
values. Example values were measured with the Node harness (`scratchpad/coop/harness`) unless marked "computed".
Scripts used: `scratchpad/balance/m1.js` … `m8.js`.

Notation used throughout:
- **stage** = cells − 1 (the colony's level index; the HUD shows cells). **Water level** `wl` is an index from 0 (HUD shows wl+1).
- **F** = `bodyScale(cells)` = min(cells,30)^0.25. **F^2.2** = "size power" (`_sizePower()`), `SIZE_POWER = 1.1*.5/BODY_GROWTH` = 2.2.
- `waterScale(x,y) = bodyScale(waterLevel+1)`: the F of a colony whose cell count equals the water's HUD level.
- `_mp(key)` = TIER_POWER of the equipped copy (0 if not worn): Common .7, Uncommon .85, Rare 1, Epic 1.25, Legendary 1.55.
- `_pk(key)` = PERK_POWER, 0 below Rare: Rare 1, Epic 1.6, Legendary 2.4.

---

## 1. Player

### 1.1 Body size
`const MAX_BODY_CELLS=30,bodyScale=cells=>Math.pow(Math.max(1,Math.min(cells,MAX_BODY_CELLS)),BODY_GROWTH);` (search `MAX_BODY_CELLS=30`)
`p.r=22*F` (search `p.r=22*F`)

Width grows with the fourth root of cells, and stops at 30 cells. Beyond 30 cells nothing in the body grows any more
(health, attack, speed, reach are all frozen); only stat points, the stat cap (12 from 31 cells) and boss "outgrown" rules change.

### 1.2 Derived stats (`_derive`, search `_derive(){`)
| Stat | Expression | Plain words |
|---|---|---|
| maxHp | `(100+u.vitality*12)*Math.pow(F,SIZE_POWER)` then `*=1+.2*tn` (Twin nucleus) | 100 × size power; each Vitality point is +12% of base, not +12 flat |
| maxEnergy | `(100+w*10+u.reserves*12)*(1+.06*this._pk('twinNucleus'))` | Stamina does **not** scale with size. `w` = Riptide rank power |
| attack | `11*(1+u.power*.08)*Math.pow(F,SIZE_POWER)` | 11 × size power, +8% per Power |
| speed | `clamp((144+w*19)*(1+u.mobility*.06),95,300)*Math.pow(F,.45)` × Chitin `(.94+.02*min(3,pk))` × Keel `(1+.08*mp)` | cruise speed grows with F^0.45 |
| sprintSpeed | `p.speed*(2.25+w*.035)` × Whip `(1+.04*pk)` × Jet sac `(1+.15*mp)` | |
| sprintDrain | `Math.max(12,25-w*1.25-u.mobility*.35)` × Whip `(1-min(.6,.25*mp))` × Keel `(1-.08*min(3,pk))` | stamina/s while fast swimming |
| regeneration | `p.maxHp*(.0045+u.recovery*.0012)` × Twin `(1+.25*mp)` | hp/s; a share of max health |
| energyRegeneration | `17+w*2.2+u.recovery*1.5` | stamina/s (flat) |
| nutritionDrain | `.75+Math.min(p.stage,8)*.12` | /s, out of 100; tops out at 9 cells |
| feedRadius | `p.r+(16+u.reach*6)*F` | ×0.6 while fast swimming (`_eatFoods`) |
| pulseRadius (Jab) | `p.r+110*Math.pow(F,.85)*(1+u.reach*.05)` | |
| landmarkSense | `(260+u.reach*25)*(1+.5*this._mp('eyespot'))` | discovery distance beyond a place's edge |
| block | cost 10, cooldown 1.9 s, window .9 s, cuts 65% (`_hardenReduction(){return .65;}`), refunds 8 stamina once | |
| criticalChance | `.18*mp(keenEdge)+.03*pk(eyespot)+.04*pk(mimicSkin)`; crit ×`1.8+.15*pk(keenEdge)` | |
| assimilation | `.5` (constant) | multiplies all food growth |

Measured (no stat points, no mutations, no ranks; `m1.js`):

| cells | F | r | maxHp | stamina | attack | speed | sprint | sprint drain | stamina regen | hp regen/s | nutrition drain | feed radius | Jab reach | stat cap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1.000 | 22 | 100 | 100 | 11.0 | 144 | 324 | 25 | 17 | 0.45 | 0.75 | 38 | 132 | 2 |
| 2 | 1.189 | 26 | 146 | 100 | 16.1 | 156 | 350 | 25 | 17 | 0.66 | 0.87 | 45 | 154 | 3 |
| 6 | 1.565 | 34 | 268 | 100 | 29.5 | 176 | 396 | 25 | 17 | 1.21 | 1.35 | 59 | 195 | 7 |
| 12 | 1.861 | 41 | 392 | 100 | 43.1 | 190 | 429 | 25 | 17 | 1.77 | 1.71 | 71 | 227 | 10 |
| 18 | 2.060 | 45 | 490 | 100 | 53.9 | 199 | 449 | 25 | 17 | 2.21 | 1.71 | 78 | 249 | 10 |
| 24 | 2.213 | 49 | 574 | 100 | 63.2 | 206 | 463 | 25 | 17 | 2.58 | 1.71 | 84 | 265 | 10 |
| 30 | 2.340 | 52 | 649 | 100 | 71.4 | 211 | 475 | 25 | 17 | 2.92 | 1.71 | 89 | 278 | 10 |
| 31+ | 2.340 | 52 | 649 | 100 | 71.4 | 211 | 475 | 25 | 17 | 2.92 | 1.71 | 89 | 278 | 12 |

Riptide rank power feeds base stats: at Predator V + Riptide V (1 cell) stamina is 150, cruise speed 239 (+66%), stamina regen 28, sprint drain 18.75.

### 1.3 Healing, nutrition, starving (`_step`, search `p.nutrition=clamp(`)
- Natural healing: `p.regeneration*(p.nutrition>25?1:p.nutrition>10?.3:0)*(photosynthesising?1+mp:1)`. It is not paused after a hit: `regenDelay=5` only gates sanctuary healing and rest.
- **Post-meal boost:** `(p.feedingRecovery>0?p.maxHp*.015:0)` hp/s for 6 s after any algae or protein (`p.feedingRecovery=6` in `_gain`). That is 9% of max health per meal window, more than three times base regen, and it does **not** depend on Recovery although the Recovery description mentions it.
- Algae also heals `Math.min(value,3)*.15` hp flat (search `Math.min(value,3)*.15`): at most 0.45 hp, size-blind.
- Protein restores `value*1.6` stamina; mineral restores 5 stamina flat (search `p.energy+value*1.6`).
- Stamina regen ×0.55 when nutrition ≤ 20; no regen while fast swimming or sneaking.
- Nutrition gain per food: `value*(kind==='protein'?6:kind==='algae'?3.2:1.8)` (search `kind==='protein'?6`). `value` already includes the water's size power, so deep food refills far more nutrition (algae at water 29 gives about +21) while the drain caps at 1.71/s.
- Starving: `p.hp-dt*p.maxHp*.025` at nutrition 0 (40 s from full).
- Sanctuary (in it and safe): hp `+dt*(3+l.variant)` **flat** (3–5 hp/s, size-blind), nutrition +8/s, stamina +6/s; resting 3 s (`SANCTUARY_REST_SECONDS`) restores everything and checkpoints.
- Being hit: `p.invulnerable=1.1` (search `p.invulnerable=1.1`): at most one hit per 1.1 s from anything (boss contact lowers it to 0.3, Hydra head to 0.6). `regenDelay=5`.

### 1.4 Movement multipliers in play (search `const follow=1-Math.exp`)
`speed=(sprinting?sprintSpeed:speed)*(1+frenzy*.05)*(1+momentum*.05)*(sneaking?.43+stalker*.035:1)*(secondWind?1.55:1)*(eyeOfStorm?1.25:1)` (also a dead `slipstreamTime` term).
Sneak drain `Math.max(.7,3.5-k*.35)*(1-.12*Math.min(3,pk(lateralLine)))`; conceal rate `(1.45+k*.3)*(Ghost cilia?1.3:1)` (k = Stalker rank power).

### 1.5 Strike (weapon) numbers (`_derive`, search `p.pulseCost=18;p.pulseCooldownMax=.68`)
`reachBase=110*F^.85*(1+reach*.10)`, `touchBase=110*F^.85*(1+reach*.05)`, `biteReach=p.r*2.6*(1+reach*.05)`. `wp=_mp(weapon)`, `wk=_pk(weapon)`.

| Weapon (shape) | Damage × attack | Stamina | Cooldown | Reach beyond body | Shot speed | Count |
|---|---|---|---|---|---|---|
| Jab (`pulse`) | 1 (tier-blind) | 18 | .68 | touchBase, cone ±60° | melee | – |
| Bite (`predator`) | 3·wp | 18 | .54·(1−.08wk) | biteReach, arc ±0.75 rad | melee | – |
| Spit (`venomist`) | .8·wp + 1 poison stack | 18·.75·(1−.10wk) | .42 | 2.4·reachBase | 600 | 1 |
| Spike gun (`spikes`) | .3·wp | 18·.18 = 3.24 | .13·(1−.08wk) | 1.8·reachBase | 820 | 1 |
| Spore burst (`spores`) | .6·wp each | 18 | .7·(1−.08wk) | 1.15·reachBase | 480 | 7 (0.15 rad apart) |
| Needle (`stalker`) | 1.35·wp (×1.8 unaware) | 18 | .8·(1−.08wk) | 4·reachBase, aim lock .22 rad, pierces | 720 | 1 |

Measured with a **Rare** weapon (`m6.js`; at Rare the perk is already on, so Bite is 0.50 s and Spit 12.15 stamina, not the 0.54 / 13.5 in MORPHOS-BALANCE.md, which are the Common/Uncommon values):

| Weapon | 1 cell: reach / dmg | 12 cells | 30 cells |
|---|---|---|---|
| Jab | 110 / 11.0 | 187 / 43.1 | 227 / 71.4 |
| Bite | 57 / 33.0 | 106 / 129.4 | 134 / 214.3 |
| Spit | 264 / 8.8 | 448 / 34.5 | 544 / 57.1 |
| Spike gun | 198 / 3.3 | 336 / 12.9 | 408 / 21.4 |
| Spore burst | 127 / 6.6 ×7 | 214 / 25.9 ×7 | 261 / 42.9 ×7 |
| Needle | 440 / 14.9 | 746 / 58.2 | 906 / 96.4 |

Strike damage pipeline (`_strike`, `_strikeHit`, `_hit`):
`ctx.damage=(p.attack+stored)*boost*p.strikeDamage*this._frenzyBoost()*(ambush?1.65:1)`; then in `_strikeHit` ×1.8 for Needle on unaware, ×`_ambushBonus()` if ambush and unaware, ×1/1.65 if ambush but noticed; then `_hit`: ×`gapDeal(stage−o.lv)`, Undertow `1+.08pk` on slowed, Blood scent, rear factor `1+.3*(1+dot)/2`, crit, armour (armoured ×.4, ×1.35 recovering; sentinel ×.35/×1.4; species `armour`), Abyssal heart ×(1+.3mp) on rare/legendary.
Jab (`_pulse`) skips frenzy and the Needle/ambush ×1/1.65 path: `(p.attack+stored)*pulseBoost*(sneak?1.65*this._ambushBonus():1)`.
`_ambushBonus()` = (Stalker V 1.35)·(Ambush jaws 1.3)·(Ambush predator hybrid 1.4)·(1+.1·pk shadowMetabolism)·(1+.15·mp mimicSkin).
Bite devours: `o.r<p.r*limit`, `limit=(gullet?.75:.55)+(.12*Math.min(1.3,mp(engulfingMembrane)))` (search `gullet?.75:.55`), heals 2% (6% Gullet).
Strike-organ triggers: one per 18 stamina spent (`_strikeOrgans`, search `organCharge`).

### 1.6 Class moves (`_special`, search `_special(aimX,aimY,requested){`)
Costs and cooldowns (`_derive`, search `def.cost-Math.max(0,rank-1)*2`):
`cost=max(16,base−2·(rank−1))·(1−.06·min(3,pk echo))`, `cooldown=max(6,base−.5·(rank−1))·(1−.08·mp echo)`. Novice (rank 0) uses the base. Mastery never lowers them.

| Move | base cost / cd | rank I | III | V |
|---|---|---|---|---|
| Venom volley | 24 / 8 | 24 / 8 | 20 / 7 | 16 / 6 |
| Pounce | 26 / 8 | 26 / 8 | 22 / 7 | 18 / 6 |
| Whirlpool | 26 / 12 | 26 / 12 | 22 / 11 | 18 / 10 |
| Swarm | 26 / 10 | 26 / 10 | 22 / 9 | 18 / 8 |
| Decoy | 24 / 11 | 24 / 11 | 20 / 10 | 16 / 9 |

`novice = rank?1:.75`, `size=_sizePower()`.
- **Pounce:** `p.attack*this._rankPower()*(2.4+rank*.4)*(rank>=5?1.25:1)*novice`, × frenzy `1+.08·stacks` on hit; reach `(260+rank*30)*(rank?1:.8)`; stun .6 s; kill refunds half the cooldown (all with Apex jaws).
- **Venom volley:** globs `(rank?3:2)+(Spitting fan?2:0)`, each `(8+rank*4)*size*novice*(1+power*.08)`, `1+(rank>=3)` stacks, rupture from rank I. Uses size power and Power, **not** attack or `_rankPower`.
- **Venom tick** (per stack per second, `_venomTick`): `((1.2+r*.6)*size*(1+power*.08)+p.attack*.04)*(r>=3?1.3:1)*(r>=5?1.25:1)`; poison lasts 4 s (8 with Lingering toxin); max stacks 5 (8 from rank III).
- **Rupture:** `stacks*((4+r*2)*size*(1+power*.08)+p.attack*this._rankPower()*.15)`; passes `ceil(stacks/2)` (all with Plague bloom) to neighbours within r+110.
- **Swarm / brood** (`_broodStats`): hp `(18+r*8)*size*(soldier?1.6:1)`; bite `p.attack*rankPower*(.2+.09*r)*(soldier?1.4:1)*(r?1:.75)` every .75 s, ×1.5 during Swarm, ×(1+.2·mp broodPheromone); permanent broodlings `broodMax` 2/3/4 at ranks 1/3/5, +1 Hive mind, +floor(mastery/2), max 7; bud every `(11−r)` s (×.6 Spore brood); Swarm lasts `(3.5+rank*.5)` s (×2 Hive mind) and tops up to 2 temporary broodlings (life 10+2r).
- **Decoy:** duration `(5+rank*1.3)*novice*(Phantom colony?1.5:1)`, veil `(2.0+rank*.35)*novice`, 1 decoy (2 from rank III).
- **Whirlpool:** radius `(p.r+170)*(wide?1.35:1)*(rank?1:.85)`, life `(3+(rank>=3?1:0))*(rank?1:.75)`, holds `o.r<=p.r*(wide?1:.8)`, grinding `power*.5` every 0.5 s (= 0.5× power per second), Maelstrom slam `power*1.6`, grip 1 s at rank V; `power=p.attack*this._rankPower()`.
- **Ram** (fast swim into a creature, search `rt>=5?1.25:1`): `p.attack*rankPower*(.5+rt*.3)*(rt>=5?1.25:1)*(1+momentum*.25)*(1+.3*pk(jetSac))`, once per 1.5 s per creature; on a boss the same ×**1.4** and once per 1.2 s.

### 1.7 Rank power (`_rankPower`, search `_rankPower(){`)
`(11+pw('predator')*3.5+pw('riptide')*2.6)/11`, `pw(k)=rank+log2(1+mastery)*.35`.
Only Predator and Riptide ranks count. Measured: Predator I 1.32, III 1.95, V 2.59; Predator V + Riptide V 3.77. It multiplies Pounce, rams, broodling bites, whirlpool damage and the attack part of a rupture, so a Venomist, Brood or Stalker player gets nothing from their own ranks here.

### 1.8 Stat points and caps
- `attributeCap=stage=>stage>=STAT_DEEP_STAGE?12:Math.min(10,2+stage)` with `STAT_DEEP_STAGE=30` (search `STAT_DEEP_STAGE=30`): 2 at 1 cell, +1 per cell to 10 at 9 cells, 12 from 31 cells. `ATTRIBUTES[*].maxRank` is 12 everywhere but unused by the cap.
- Per point: Vitality +12% base health (×size power); Reserves +12 stamina; Recovery +0.12%/s health and +1.5 stamina/s; Power +8% attack (also venom, rupture, tick); Reach +10% shot reach, +5% Jab/Bite reach, +6·F feed radius, +25 landmark sense; Mobility +6% speed, −0.35/s sprint drain.
- Sources: 1 per division (`_awardPoints(1,'evolution')` in `_divide`); 2 per first kill of each boss (`reward:2`); 1 per wonder (3 for the Abyssal Eye); 1 "challenge" point for a nest, a lancer, or a `challenge` species kill (×`sp.challenge`), capped so `earnedPoints.challenge < floor(stage/2)` (`_challengeReward`). Hermit tasks give none.
- Total available by 31 cells (stage 30): 30 + 12 (bosses) + 10 (wonders) + up to 15 (challenge) = up to 67, against a cap of 6 × 12 = 72.

### 1.9 Division cost (`levelCost`, search `const levelCost=stage=>`)
`Math.round(1.7*(100+60*Math.pow(Math.min(stage,MAX_BODY_CELLS-1),1.45)+Math.max(0,stage-MAX_BODY_CELLS+1)*300))`, cumulative in `nextThreshold`.
Growth from food (`_gain`): `s.biomass+=value*p.assimilation*pace`, `pace=Math.pow(cells,(.5-BODY_GROWTH)*1.45)` = cells^0.3625 (cells capped at 30).

Computed (`m2.js`), food "algae" eaten in water of the colony's own level:

| from cells | cost of next cell | cumulative | pace×0.5 | biomass per algae | algae needed |
|---|---|---|---|---|---|
| 1 | 170 | 170 | 0.50 | 0.50 | 340 |
| 2 | 272 | 442 | 0.64 | 0.94 | 289 |
| 6 | 1,222 | 3,716 | 0.96 | 2.56 | 476 |
| 12 | 3,471 | 18,544 | 1.23 | 4.83 | 719 |
| 18 | 6,375 | 49,261 | 1.43 | 6.99 | 912 |
| 24 | 9,788 | 99,233 | 1.58 | 9.09 | 1,077 |
| 30 | 13,631 | 171,219 | 1.72 | 11.14 | 1,224 |
| 31 | 14,141 | 185,360 | 1.72 | 11.14 | 1,270 |
| 36 | 16,691 | 263,715 | 1.72 | 11.14 | 1,498 |

Past 30 cells each level costs 510 more than the last.

---

## 2. Creatures

### 2.1 Where difficulty comes from
- `waterLevel(x,y)`: 0 within 1,250 of the centre, then `1+floor((d−1250)/850)`, max 40 (search `ZONE_STEP=850,MAX_WATER=40`).
- `_tierAt(x,y){return 0;}` and `_tierValue(tier){return 1+Math.max(0,tier||0)*.25;}`: the old distance tier is always 0, **except** the three scavengers a fallen giant calls in (`tier:tier+1`), which get tier 1 (+4 radius on a hunter, +22% health, +1.25 bite, ×1.25 value, lancer chance .16). Every `+tier*…` term elsewhere is dead.
- Spawn size (`_spawnScale`): `k = max(.5, waterScale × m)`, m = 0.45–0.7 (20%), 0.88–1.12 (66%), 1.22–1.5 (14%). In co-op each other player nearby (max 3) moves 4% from small to large and adds 8% to large.

### 2.2 Creature health, damage, speed (`_organism`, search `const defs={prey:`)
`defs` = [min r, max r, hp, speed]: prey [9,15,9,77], grazer [18,27,24,64], hunter [33,45,48,146], armoured [24,34,62,75], apex [78,87,205,133], swarmer [11,15,16,178], sentinel [30,38,90,26], jelly [26,34,60,60]. Species replace these with their own `r`, `hp`, `speed`.

- `maxHp=d[2]*(1+tier*.22)*k^2.2*bulk^1.1*(hostile?wildTough(level):1)`, `bulk=heft(r*k, 22*bodyScale(zone+1))=clamp(ratio,1,3)`.
- `wildTough=level=>1+2.6*(1-Math.exp(-Math.max(0,level-3)/8))` (search `wildTough=level`): 1 up to water 3, rising to ×3.6.
- `wildMight=level=>1+Math.min(.35,.02*Math.max(0,level))`: +2% bite per level, capped at +35% from water 18.
- Speed `d[3]*k^.45` (the same exponent as the player).
- Lunge/bite damage (`_beginAttackBase`, then `_beginAttack`): base `(apex?18:armoured?12:lancer?16:13)`, or species `attack.damage*.5`, then `×k^2.2×clamp(might,1,2)`. Sentinel shard ring 15, swarmer dart 8 (same multipliers). Spores `(sporeDamage||21)*k^2.2` per glob ×3 globs; jelly sting `(sting||12)*k^2.2`; leviathan touch `30*k^2.2`; mouth stings `sting*k^2.2`; leech drain `3*k^2.2` hp/s (never below 5% health). **Spores, stings, touches and leeches get no `might`.**
- Taken by the player: `×gapTake(o.lv−p.stage)` (`_damagePlayer`).
- Hazards: toxin 12, vent 9, **× the player's** size power (`_hazards`, search `h.kind==='toxin'?12:9`), not the water's.
- Timings: wind-up `(lancer?.4:.3)+min(.3,.04*max(0,k−1))` (spores .7, sentinel .9, tether .7); lunge .4 (armoured .32, lancer .5, species `attack.lunge`); recover 1.15 (apex 1.7, armoured 1.3, lancer 1.35, ranged/sentinel 1.7, swarmer .9); then cooldown `recover+(lunge or bite?.95:.15)`. Range: lunge 240, armoured 95, lancer 310, apex 210, spores 610.5, sentinel 400, swarmer 130 (×k). Creature stamina (`_profile`): hunter 82 capacity, 23/s regen, 32 per attack; apex 120/19/45; armoured 70/17/24; swarmer 60/20/20; lancer 105/18/50.
- Sight (`_thinkOrganisms`, search `const k=o.scale||1,sight=`): `k×(species sight | sentinel 360 | swarmer 380 | apex 690 | armoured 230 | 420)`, × `(1−stealth·(.67+.025·stalker rank))`, ×.58 in cover, ×.6 in dark water, ×(1−.2·mp lateralLine) when not fast swimming, ×0 in a shell, ×.75 Shadow lattice sneaking, ×.7 Ghost current sprinting.
- Lancer (plain hunter beyond 1,100): chance `Math.min(.35,.11+tier*.05)` = 11%; hp ×1.55, r ×1.12, speed ×1.08.
- Splitter: two halves at r ×.66, hp ×.35.
- Fresh creatures (spawned, hatched, reloaded) cannot attack for 2 s (`_markFresh`).

Measured hunters at matched level (player cells = HUD water level, no stats or weapon; `m3.js`):

| water (HUD) | k | wildTough | might | hunter hp | Jabs to kill | Rare Bites | lunge dmg | lunge % of hp | kill growth | kill as % of a level |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1.00 | 1.00 | 1.00 | 93 | 8.4 | 2.8 | 13.0 | 13.0% | 5.9 | 3.5% |
| 3 | 1.32 | 1.00 | 1.04 | 164 | 8.1 | 2.7 | 24.7 | 13.5% | 16.3 | 3.6% |
| 6 | 1.57 | 1.58 | 1.10 | 435 | 14.8 | 4.9 | 38.3 | 14.3% | 33.4 | 2.7% |
| 12 | 1.86 | 2.64 | 1.22 | 1,055 | 24.5 | 8.2 | 62.2 | 15.9% | 63.6 | 1.8% |
| 18 | 2.06 | 3.15 | 1.34 | 1,473 | 27.3 | 9.1 | 85.4 | 17.4% | 90.3 | 1.4% |
| 24 | 2.21 | 3.39 | 1.35 | 1,824 | 28.9 | 9.6 | 100.8 | 17.6% | 117.4 | 1.2% |
| 30 | 2.34 | 3.50 | 1.35 | 2,393 | 33.5 | 11.2 | 113.9 | 17.6% | 152.5 | 1.1% |

(Hunter hp varies ±15% with its random radius through `heft^1.1`. A matched hunter always has heft 1.5–2.0 because its base radius 33–45 is compared with the standard 22, so `heft` acts as a hidden ×1.6–2.1 on hunters and ×3 on apex.)

### 2.3 Level gap (search `gapDeal=d=>`)
`gapDeal=d=>clamp(1+.08*d,.35,1.6)` (damage you deal, d = your stage − its level), `gapTake=d=>clamp(1+.08*d,.4,2.2)` (damage you take, d = its level − your stage), `gapWorth=d=>clamp(1+.12*d,.2,1.3)` (kill and food worth, d = its level − your stage).

| levels above you | deal | take | worth |
|---|---|---|---|
| −10 | 1.6 (cap at −7.5) | 0.4 (cap at −7.5) | 0.2 (floor at −6.7) |
| −3 | 1.24 | 0.76 | 0.64 |
| 0 | 1 | 1 | 1 |
| +2.5 | 0.80 | 1.20 | 1.3 (cap) |
| +5 | 0.60 | 1.40 | 1.3 |
| +8 | 0.36 | 1.64 | 1.3 |

Creature level `o.lv` = its water level (`options.level` or zone); Broodmother young and other `young` spawns take the player's stage. Applies to strikes, abilities and DoTs on creatures; not to bosses. Worth is capped at +30%, so going more than 2.5 levels above you adds danger with no extra reward.

### 2.4 Species (search `const SPECIES={`)
A species appears where `minStage*3 <= waterLevel` (index), i.e. from HUD level `minStage*3+1`. Named species replace a spawn of the same temper with chance `Math.min(.62,chance+water*.016)` (chance .34 at load, .40 on restock); weights `RARITY_WEIGHT={common:6,uncommon:3,rare:1,legendary:0}`; only one rare within 2,600; hostile species never within 1,400 of the centre.

| Species | base | rarity | from HUD level | r | hp | speed | value | notes |
|---|---|---|---|---|---|---|---|---|
| Skimmer | prey | common | 1 | 8–11 | 7 | 112 | 4 | darts |
| Shellback | grazer | common | 4 | 22–30 | 46 | 50 | 9 | armour .5 |
| Needlefish | hunter | common | 4 | 19–24 | 28 | 176 | 9 | lunge 14×.5 = 7, range 330 |
| Puffer | hunter | uncommon | 7 | 25–31 | 58 | 88 | 14 | spores 12 |
| Murk | hunter | uncommon | 7 | 27–34 | 70 | 150 | 16 | blinks at half health |
| Splitter | hunter | uncommon | 7 | 33–40 | 82 | 132 | 14 | splits |
| Leech | swarmer | uncommon | 10 | 12–15 | 22 | 168 | 6 | groups 2–3, latch |
| Lasher | sentinel | uncommon | 10 | 29–35 | 110 | – | 18 | tether 330, sting 9 |
| Shardling | swarmer | common | 13 | 10–13 | 20 | 192 | 6 | groups 3–4 |
| Thornback | armoured | rare | 13 | 52–62 | 300 | 96 | 60 | bite 32×.5, thorns .22 |
| Glass ray | hunter | rare | 13 | 48–57 | 220 | 186 | 55 | cloaked, bite 33×.5 |
| Siren jelly | jelly | rare | 13 | 62–76 | 260 | 40 | 50 | pull 340, sting 20 |
| Ironhide | armoured | uncommon | 16 | 40–48 | 125 | 64 | 26 | |
| Brood carrier | armoured | rare | 16 | 56–66 | 340 | 70 | 65 | hatchlings (≤6 alive, 3 per 9 s) |
| Storm diatom | sentinel | rare | 16 | 44–52 | 300 | – | 60 | double ring |
| Crowned hunter | hunter | rare | 16 | 52–60 | 260 | 168 | 70 | 3 escorts, bite 36×.5 |
| Lurker | hunter | uncommon | 19 | 30–36 | 92 | 158 | 24 | cloaked, bite 30×.5 |
| Leviathan larva | apex | legendary | 19* | 140–165 | 1,100 | 118 | 260 | devours; touch 30 |
| Spore mother | hunter | uncommon | 22 | 38–46 | 130 | 74 | 30 | spores 17 |
| Abyssal maw | apex | legendary | 22* | 165–190 | 1,500 | 52 | 340 | vortex, sting 45, spores 26 |
| Ripjaw | hunter | common | 25 | 31–38 | 110 | 184 | 26 | bite 38×.5 = 19 |
| Voidling | swarmer | uncommon | 28 | 13–16 | 34 | 182 | 9 | groups 3–5, latch |
| Wandering giant | grazer | rare | event | 118–138 | 900 | 34 | 120 | armour .35; quake 14% max hp |
| Brood hatchling | swarmer | common | spawn | 9–12 | 12 | 190 | 2 | |

\* Legendaries are summoned (`_summonLegend`), gated by the **player's** stage (`minStage*3<=p.stage`), at level `max(water, p.stage)` and scale `bodyScale(lv+1)`; every 170–280 s (first at 150 s) with a 50% chance, never within 2,500 of the centre.

### 2.5 Ancients (search `ELDER_CHANCE=.02`)
`ELDER_CHANCE=.02,ELDER_HEALTH=4,ELDER_MIGHT=1.25,ELDER_LEASH=950`. Rolled once per chunk when it is first built, from the chunk's own seed: 2% of chunks with water ≥ 2 (HUD 3) and at least 2,150 from the centre, none within 2,600 of another live ancient, none on a place (l.r+420). 40% are one of puffer/murk/splitter/ripjaw/sporemother/lurker (if the water allows), otherwise plain hunter (75%) or armoured.
`_makeElder`: spawned at scale `waterScale*1.1` (no random size), then r ×1.35, hp ×4, might ×1.25, speed ×1.3. Kept regardless of `_lifeDensity`. Leash `950*sqrt(k)` unless hurt in the last 6 s; heals `maxHp*.004` per AI tick (0.23 s, about 1.7%/s) when left alone over 700·k away. Kill: growth ×4, guaranteed drop (see 4.3). Variants: vault warden scale ×1.18, wonder guardian ×1.25 and hp ×1.5 more, hermit bounty ×1.15; all three `noDrop`.

### 2.6 Nests (search `_nestEmerge(l,slot){`)
Three slots: mother (slot 0) at `waterScale*1.3`, hp ×1.25 (armoured if `variant>1`, one in three), two young at `waterScale*.58`, speed ×1.15. They come out one at a time (young first): next after 1.15 s (1.6 s after the mother), each takes `DEN_TIME=.75` s. Activates within l.r+200. Leash: mother l.r+520·k, young l.r+640·k. Clearing all three claims the nest (biomass share .2 and a challenge point).

### 2.7 Swallowing
- **You swallowed** (`canSwallow`, search `SWALLOW_RATIO=2.8`): a lunging hunter, apex or armoured (not boss, ancient or mother) with `o.r>=p.r*2.8` deals `Math.max(o.attackDamage,p.maxHp*1.5)`: death unless shielded. Measured share at matched level (`m7.js`): about 1–1.6% of plain hunters (large rolls and lancers) and **80% of apex** creatures, at every water level, because the test compares radii, not levels.
- **You swallow by touch** (`_canEngulf`, search `_canEngulf(o,anySpeed=false){`): not sprinting, not apex/jelly/sentinel/boss, `o.r<p.r*((devourerGullet?.95:.78)+.2*min(1.3,mp(engulfingMembrane))+(Apex jaws?.08:0)+predator rank*.035)` and the creature is prey/grazer or at ≤40% health.
- **Bite devour**: see 1.5 (limit .55, Gullet .75, +.12 Engulfing).

---

## 3. Bosses

### 3.1 Spawn and scaling (`_spawnBoss`, search `def.hits*BOSS_HEALTH_UNIT`)
- Wakes when `p.stage+1>=next.level` (cells ≥ level), outside the nursery calm, after `bossRest` (120 s after an escape).
- `maxHp=def.hits*BOSS_HEALTH_UNIT*this._sizePower()*(1+COOP_BOSS_HEALTH*Math.min(COOP_PARTY_CAP,this._partyNear()))`, `BOSS_HEALTH_UNIT=21`, co-op +50% per other player nearby (max 3).
- `unit:100*this._sizePower()*(def.dmg||1)`: every boss attack is a multiple of `unit` = base health at the spawn size × `dmg`. Both are fixed at spawn from the **player's size then**, not from the boss level.
- `r=p.r*def.size`. Turn rate `def.turn` rad/s.
- The code comment says `hits` is "health in your attacks"; in fact one hit = 21/11 = 1.91 Jabs without Power.

| Boss | level | size | hits | dmg | speed | turn | contact | cooldown | phases | mutation (tier) |
|---|---|---|---|---|---|---|---|---|---|---|
| Gulper | 6 | 4.4 | 50 | 1 | .82 | 1.6 | .08 | 1.5 | Hungry / Double lunge / Feeding frenzy | Engulfing membrane (Rare) |
| Broodmother | 12 | 4 | 92 | 1.05 | .72 | 1.3 | .08 | 1.6 | Swelling / Fast births / Devouring her young | Fission heart (Rare) |
| Glass Pike | 18 | 3.4 | 110 | 1.1 | 1.2 | 2.6 | .1 | 1.4 | Hunting / Curving dashes / Relentless | Stored impact (Epic) |
| Hydra | 24 | 3 | 330 | 1.25 | .5 | 1.1 | .08 | 2.2 | Rooted / Uprooted / Fourth head | Regrowing organs (Epic) |
| Undertow | 30 | 4.6 | 360 | 1.4 | .9 | 1.2 | .12 | 1.5 | Circling / Storm / Endless hunger | Phase membrane (Legendary) |
| Kraken | 36 | 4.4 | 1050 | 1.45 | .9 | 1.4 | .12 | 1.15 | Reaching / Ink / The grip | Abyssal heart (Legendary) |

Measured at spawn with cells = level (`m4.js`):

| Boss | player hp | attack | boss hp | boss r | unit | Rare Bites (no Power) | Jabs |
|---|---|---|---|---|---|---|---|
| Gulper | 268 | 29.5 | 2,813 | 152 | 268 | 32 | 95 |
| Broodmother | 392 | 43.1 | 7,578 | 164 | 412 | 59 | 176 |
| Glass Pike | 490 | 53.9 | 11,324 | 154 | 539 | 70 | 210 |
| Hydra | 574 | 63.2 | 39,797 | 146 | 718 | 210 | 630 |
| Undertow | 649 | 71.4 | 49,084 | 237 | 909 | 229 | 687 |
| Kraken | 649 | 71.4 | 143,161 | 227 | 941 | 668 | 2,005 |

### 3.2 Movement, phases, enrage, outgrown (`_bossTick`, search `const over=Math.max(0,p.stage+1-(def.level||0))`)
- Speed: `p.speed*def.speed*pace*(1+.12*Math.min(3,over))*clamp(1-.1*tire,over?.75:.42,1)*(slowed?.6:1)`, `pace=(phase3?1.25:phase2?1.1:1)*(hydra: phase1 .55, else 1.15)*(enraged?1.12:1)`. Boss speed follows **your current cruise speed**, so Mobility, Keel fin and Riptide ranks speed bosses up too; only fast swimming outruns one.
- Phases at 2/3 and 1/3 health; each change is a 0.9 s `transform` during which it takes no damage and its shots are cleared. Hydra gets a fourth head in phase 3.
- Cooldown after recovering: `def.cooldown*(phase3?.65:phase2?.82:1)*(hp<25%?.75:1)`. Phase 3 wind-ups ×.82.
- Enraged below 25% health: +12% speed, −25% cooldown.
- Exposed while recovering: takes ×1.3 (`bossExposure`), and Needle/Stalker precision bonuses apply.
- Tiring: out of reach (> r·2.2 + 420·scale) with no blow for 2.5 s, `tire += dt×rate` (rate 1, 0.25 if 1 level outgrown, 0 if 2+), speed −10% per point down to ×.42 (×.75 when outgrown). Escape needs `tire>=1.5` and distance `> (p.r*12+900)*(over?2:1)+120*scale`. Two or more levels outgrown: never escapes and reappears just off screen if left > p.r·24+2,200 behind.
- Touch: front half (within 1.25 rad of facing) hits for `unit*contact`, at most every 1.1 s.
- Healing by eating (`_bossEat`): a creature ≤ 0.6·r touching a mouth heals `maxHp*(.015+.015*min(1,o.r/(b.r*.4)))*heal*0.9^meals` (poison ×.25, bleed ×.5), next meal after 4 s (2 s while pulling). It also kills any hostile ≤ 0.6·r touching its body.
- Experience from boss damage: `min(actual*.03, 60-b.huntCredit)` (max 60 raw per boss).

### 3.3 Attacks (`_bossBegin`, `_bossRelease`, `_bossActive`, `_bossFinish`)
Wind-up `W` ×.82 in phase 3; damage as × `unit`. Charges lock their line for the last 40% of the wind-up (dash: last 70%).

| Attack | used by | wind-up | active | recover | damage × unit | notes |
|---|---|---|---|---|---|---|
| engulf | Gulper (dp < 3.6r) | .9 | .42 (2.7r) | 1.15 | .30 | ×2 chained from phase 2 (next wind-up .7, .55 ph3) |
| sweep | Gulper (dp < 1.9r) | .55 | .22 | .75 | .16 | arc 2r, ±0.8 rad |
| birth | Brood | 1 | .4 | .7 | – | 2 young (3 from ph2) at .85 player size, when young < 3 (5) and 9 s (5 s) since last |
| spores | Brood (dp < 4.5r) | .75 | .3 | .7 | 7 × .07 | |
| slam | Brood, Kraken (dp < 1.7r) | .5 | .28 (1.7r) | .9 | .22 | |
| dash | Pike (dp < 5.5r), Kraken ph3 | .6 | .3 (3.6r) | 1.1 (1.7 ph3) | .22 | chain 2 (3 from ph2); next wind-up .55 (.4 ph3); curves 1.1 rad/s from ph2; drops shards .04 every .09 s |
| tendrils | Hydra ph2+ (50%) | .8 | .3 | .7 | 6 × .07 | otherwise the body waits 1 s |
| head | Hydra (dp < 2.9r) | .7 (.5 ph3) | .18 | .4 back | .14 | 3 heads (4 in ph3), rest 2.6/2/1.5 s + 0–0.8 |
| vortex | Undertow (dp < 2.8r, 50%), Kraken ph2+ | .85 | 2.8 (3.6 ph2+) | 1.1 | .20 at the mouth | pull `240+p.speed*.5` within 3.8r (×.5 sprinting); rings every 1.5 s from ph2 |
| charge | Undertow, Kraken ph1–2 | .8 | .75 (4.4r) | 1.5 | .32 | |
| rings | Undertow, Kraken | .65 | .3 | .7 | each .12 | 20 shots with a 4-shot gap (3 in ph3), speed 190·√scale |
| grab | Kraken (1.8r–5r, 30%/40%) | .85 | reach .32 s to 5.2r, hold up to 5 s | 1 (1.8 if broken) | .26 at the mouth | cooldown 11 s (8 ph3); pull `max(1.1r,(d−.7r)/2)` per s ≈ 2 s |
| ink | Kraken ph2+ (35%) | – | 7 s dark | – | – | cooldown 22 s (16 ph3) |

### 3.4 Reward (`_defeatBoss`)
First kill: 2 stat points; every kill: score `1500*(index+1)`, biomass `+_divisionShare(.4)` (40% of the current level), full health/stamina/nutrition, 3 s invulnerability, boss mutation at `BOSS_MUTATION_TIER`.

---

## 4. Rewards and economy

### 4.1 Food (`_food`, search `value:(value===undefined?`)
`value=(given ?? {mineral:1.25,protein:2,algae:1})*waterPower(x,y)`; eaten for `value*gapWorth(water−stage)` (`_eatFoods`), then `_gain` multiplies by `0.5*cells^0.3625`.
Special food values: opening trail 1.3 algae / 1.25 mineral; bloom claim 24 × 1.5; frenzy event 40 × (35% protein 6, else algae 1.6), topped up below 45; garden 30 algae × 2; smoker 30 minerals × 1.6; carcass 34 protein × 2; refill of a running place 12 pieces when fewer than 3 remain (every 4 s at most); wandering giant sheds 2 algae + 1 mineral (value 2) every 1.2 s.

### 4.2 Kills (`_kill`, search `values={prey:3,grazer:6`)
`value=(sp?sp.value:values[o.kind])*this._tierValue(o.tier)*Math.pow(o.scale||1,SIZE_POWER*1.15/1.1)*Math.sqrt(heft(o.r,player.r))`; base values prey 3, grazer 6, hunter 16, armoured 12, apex 48, swarmer 3, sentinel 14, jelly 9. Note the exponent 2.3, not 2.2.
Growth: `_gain(value*(boss young?.3:1)*(elder?4:1)*gapWorth(o.lv−stage)*(coop share)*(consumed||assist?1:.55),'protein')`. Co-op share `clamp(credit/maxHp*1.25,.08,1)`.
Remains: 3 pieces of `value*.15` (6 pieces for rare, 14 for legendary, totalling `1.8*value`), of protein (mineral for armoured, sentinel, shellback).
**Double scaling:** the remains go through `_food`, which multiplies by `waterPower` again. Measured (`m8.js`, matched hunter): water 1: kill 5.9 growth, remains worth 4.8; water 12: kill 60, remains 193; water 30: kill 149, remains **793**. Deep down, the meal left behind is worth about five times the kill itself.
Score: `sp.score||RARITY_SCORE[sp.rarity]` (common 45, uncommon 90, rare 350, legendary 2000; leviathan 2,500, maw 3,500), else apex 400, hunter 100, sentinel 120, jelly 60, swarmer 25, others 35; lancer +250; ancient +400.

### 4.3 Mutation drops (`_dropChance`, `_rollDrop`, search `DROP_CHANCE={common:.05`)
- Chance: `min(1,(fresh?max(.25,base):base)*(1+pity*(fresh?.5:.2)))`, base by species rarity `common .05, uncommon .09, rare .22, legendary 1`; `fresh` = the creature drops a weapon you have never found; pity +1 per dry kill of that source (max 60), cleared on a drop. Ancients always drop (any non-legendary mutation, unfound first); wardens, guardians, bounty ancients, splitter halves and boss young never drop.
- Tier: roll 50/28/14/6/2% for Common…Legendary; ancients `max(2,tier+1)`; then `+floor(luck+random)`, `luck=clamp((o.r/p.r-1.6)*1.3,0,2)+(rare?.5:legendary?1.5:0)` (0 for ancients); cap `min(4,1+floor(waterLevel/6)+(elder?1:0))`: water index 0–5 Uncommon, 6–11 Rare, 12–17 Epic, 18+ Legendary.
- A copy no better than yours is absorbed: `_grantBiomass(_divisionShare(.02*(tier+1)))` (2–10% of a level).

Measured tier mix of drops (`m5.js`, 4,000 forced drops each, player at matched level):

| creature, water index | first-drop chance | Common | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|---|---|
| hunter 0 | .25 (Jaws unfound) | 36% | 64% | – | – | – |
| hunter 6 | .25 | 36% | 34% | 30% | – | – |
| hunter 12 | .25 | 36% | 32% | 19% | 13% | – |
| hunter 18 | .25 | 35% | 35% | 18% | 8% | 3% |
| puffer 8 | .25 (Spit unfound) | 48% | 28% | 24% | – | – |
| glass ray 14 | .22 | 5% | 24% | 34% | 37% | – |
| glass ray 20 | .22 | 5% | 24% | 34% | 21% | 16% |
| leviathan 24 | 1 | – | – | – | 25% | 75% |

Once the weapon is found, a common creature drops at 5%, and each dry kill adds 20% of that base (10% after 5 misses, 25% after 20, 65% at the cap of 60). While a weapon is unfound each miss adds 50% of the 25% floor.

### 4.4 Mutation strength
`TIER_POWER=[.7,.85,1,1.25,1.55]` scales every `{n}` number (Rare = written value). `PERK_POWER=[1,1.6,2.4]` scales the `[n]` perk from Rare up; below Rare there is no perk. Code expressions for the numbers that are not plain `n*mp`:
Chitin speed `.94+.02*min(3,pk)`; Keel sprint drain `1-.08*min(3,pk)`; Whip drain `1-min(.6,.25*mp)`; Echo cost `1-.06*min(3,pk)`; Engulfing devour `+.12*min(1.3,mp)` on Bite but `+.2*min(1.3,mp)` on touch; Stored impact cap `40*sizePower*mp`; Mirror chance `.3*mp`, reflected ×`1+.4pk`; Barbed shell returns `damage*.2+blocked*.5` ×mp, stun `.25pk`; Fission heart below 25%: shield `3*mp` s at 70% cut, heal `6%*pk`, 45 s; Second wind `1.8*mp` s at ×1.55, recharge `35-5pk`; Phase membrane `.38*mp` s, recharge `8-1.2pk`; Static charge every 4 strike-triggers (72 stamina) `.6*attack*mp` within r+170; Spore gland per 18 stamina 2 × `.35*attack*mp`, poison `2+pk` s at `attack*.06`; Chain strike `.45*attack*mp` to `2+floor(pk)` targets within 190, every 3 s; Caustic gland `+.2*mp` to poison/bleed on creatures only (not bosses), `−min(.4,.08pk)` from poisoned attackers; Brood pheromone `−min(.3,.03*pk*brood)`.

### 4.5 Experience (`_xp`, search `XP_RATE=`)
`_xp(f,amount)` adds `amount*XP_RATE[f]`, `XP_RATE={venomist:1.5,predator:.48,riptide:.5,summoner:2.1,stalker:1.05}`.
`rankCost(n)`: `RANK_COSTS=[240,700,1500,2800,4500]`, then `4500+(n−4)*1000` (n = rank + mastery, `MASTERY_STEP=1000`).

| Source | raw amount | family |
|---|---|---|
| Damage to a creature | `min(actual*.30, 18-huntCredit)` (18 per creature) | weapon family (Spike gun and Spore burst credit Predator; Jab credits Predator, Stalker when ambushing) |
| Damage to a boss | `min(actual*.03, 60-huntCredit)` | same |
| Kill with credit | `value*1.5/sizeScale^2.3` (size removed) | last family |
| Venom stack added | 2.5 per stack | Venomist |
| Rupture | `4+stacks*2` | Venomist |
| Ambush hit | 40 | Stalker |
| Swallow while hidden | `36+value*.2` | Stalker |
| Near miss | 25 (+8 stamina, +1 momentum; at most every .35 s) | Riptide |
| Escape (sprint > 100 with danger, none within 240) | 12, every 15 s at most | Riptide |
| Ram | 8 | Riptide |
| Whirlpool holding | 3 per second held | Riptide |

Measured: a matched plain hunter killed with Bite gives about 15.5 Predator experience at every depth (`m8.js`), so rank I (240) is about 15 hunters and rank V (4,500) about 290.
Wake needs: `WAKE_NEEDS={predator:12,summoner:3,venomist:2,riptide:5,stalker:5}` (already in MORPHOS-BALANCE.md).

### 4.6 Places (`_claimLandmark`, search `_divisionShare(l.type.startsWith('wonder')?.35`)
Growth `= _divisionShare(share)*clamp(1+.12*(waterLevel−stage),.04,1)` (another gap curve, see 6); score `120+reward*40`.

| Place | share of the current level | other reward | how to claim (goal) |
|---|---|---|---|
| Wonder | .35 | Legendary mutation + 1 stat point (Eye 3) | challenge |
| Predator nest | .20 | challenge stat point | 3 family killed |
| Gene cache | .09 | – | 3 s inside .72r |
| Ancient fossil | .09 | random unfound-at-Rare mutation at Rare | 3 s inside .6r |
| Fallen giant / toxic garden / black smoker | .07 | – | eat 22 pieces there (goal 1, +1/22 each) |
| Glass vault | .05 | mutation at `clamp(1+floor(wl/6),2,4)` | warden dead, then 3 s inside .6r |
| Bloom | 0 | full nutrition + 24 food × 1.5 | enter .7r |
| Sanctuary, current vent, abandoned shell | 0 | rest / ride / hiding | 3 s, 1.2 s moving > 75, 2 s |

Place frequency (`_landmarkFor`): 67% of regions have a place; kinds uniform over bloom, sanctuary, gene cache, nest, current, carcass, garden (carcass and garden only 2+ regions out); 5% fossil, 6% shell (2+ regions out); from water 11 18% of non-rare places become vaults, from water 17 10% become smokers; sanctuaries keep 2 regions apart (`_sanctuaryYields`, losers become gene caches). Rare finds roll before the deep swaps.

### 4.7 Wonders (search `const WONDERS=[`)
Zones (water index) 3, 7, 11, 15, 19, 24, 30, 38. Distance `1250+850*(zone−1)+850*(.3…0.7)`. Rumours from water ≥ zone−4, radius 1,500, offset ±900. Challenges: guardian (ancient ×1.25 scale, ×1.5 hp, 3 s inside .5r), lanterns (6 lit for 30 s each), stealth (12 s concealed, lights break stealth), current (3 s inside .16r against an outward push of `70+190*near`), gaze (25 s inside, beams `.45+.035*progress` rad/s, 16% max health per touch, 1 s apart). Reward: Legendary of the listed mutation (or a random one), points, share .35.

### 4.8 Hermit tasks (search `MorphosGame.taskTier=b=>`)
`clamp(1+Math.floor((b.zone||0)/8)+(dist(target,hermit)>2500?1:0)+(b.kind==='hunt'?1:0),1,4)`. **There is no `final` term**: CLAUDE.md's "the third (final) pays one tier more" is stale; MORPHOS-BALANCE.md's formula is right.
Claim: a mutation you hold below the tier, at that tier; `_divisionShare(.15)` growth (no gap or tier factor); score 200. Offers need 3 cells (`p.stage<2` → "young"). Distance bands from the hermit by task number: 900–2,200, 1,500–3,000, 2,200–3,800; target water ≤ stage+1; kind weights hunt 3, rescue 2, fetch 2, nest 2 (if any), place 1 (if any). Bounty ancients spawn within 1,300 of the spot at scale ×1.15.

### 4.9 Field studies (`_newObjective`, `_checkObjective`)
A cycle of six: eat `12+2*min(stage,10)` foods; travel 1,800; discover 2 places; 8 kills; 2,400 fast-swim distance; 1 ancient. Reward score 100 and `_divisionShare(.03)*clamp(1+.12*(wl−stage),.04,1)`.

### 4.10 Score
Food `round(value*8)+min(combo,6)` (combo within 2.4 s, max 12); +1 per second; division `150+stage*50`; reaching 5 cells +750; rank `100+rank*40`; discovery 40; kills (4.2); boss `1500*(index+1)`; place `120+reward*40`; study 100; hermit 200.

---

## 5. World pacing and spawning

- Chunk 960 units (`CHUNK=960`); loaded radius 2–6 chunks from the screen size (`setView`). Caps `foods 1100*area`, `organisms 120*min(3,area)`, `scenery 130*area`, `hazards 64*area` (`area=(2R+1)^2/25`).
- New chunk (`_loadChunk`): 3 food patches × 12 (minerals 8%, 12% in diatom reef, 84% in the third patch of a mineral patch), 4 scenery, `biome` hazards (0/1/2; r 48–92; toxin or vent), 3 creatures (prey 48%, grazer 22%, hunter 18%, armoured 12%; apex if roll > .94 in the bloom biome beyond 1,200; nursery → prey), signature life beyond 1,500 at 40% (jelly 1, sentinel 1, swarmer 4), then the ancient roll. Then `_lifeDensity=min(1,waterScale^-1.1)` thins the creatures (keeps nest, escort and ancient).
- Restock every 2 s (`_replenish`): each chunk every 7 s adds 4 food if it has < 30 (minerals 20%, 38% in the reef), never on screen; every 35 s, if it has < 3 creatures and `random<lifeDensity`: signature life (30%, swarmers 3) or one creature (prey 50%, grazer 25%, hunter 15%, armoured 10%).
- Pond events (`_pondEvents`): first after 150 s, then every 200–320 s, not within 1,550 of the centre or during a boss or legendary. Giant 13%, otherwise frenzy, migration or dark water equally. Durations: frenzy 65 s, migration 80 s (7–9 jellies, one siren 35% from 5 cells), dark water 70 s (sight ×.6), giant 120 s. Frenzy draws up to 4 predators.
- Legendary herd: 8–12 fleeing creatures, twice per legendary, 9 s apart, when it is 700–2,600 away.
- Nursery: hostiles ignore the player for the first 60 s inside 1,250 (`NURSERY_GRACE=60`).
- Co-op: `COOP_DOWN_SECONDS=60`, revive 4 s, friendly hits capped at 34% of max health.

---

## 6. Inconsistencies and ad hoc numbers (candidates to simplify)

1. **Four different "gap" curves.** `gapDeal` (.08, .35–1.6), `gapTake` (.08, .4–2.2), `gapWorth` (.12, .2–1.3) and the place/study growth factor `clamp(1+.12*d,.04,1)` (no bonus above, floor .04). Hermit growth (.15 share) and boss growth (.4 share) have no gap factor at all.
2. **Kill remains are size-scaled twice** (4.2): `value` already carries `scale^2.3`, then `_food` multiplies by `waterPower` again. Deep down the remains are worth about five times the kill.
3. **Kill value exponent 2.3** (`SIZE_POWER*1.15/1.1`) while everything else uses 2.2.
4. **Dead tier system**: `_tierAt` is always 0, yet `tier` terms remain in radius, health, bite, lancer chance, leech drain, stings, spores, sentinel/swarmer damage, sight and `_tierValue`; the only live use is the fallen giant's scavengers (`tier:tier+1`), which silently get +22% health and +25% value.
5. **`heft`** compares a creature's random base radius with the standard 22, so it is a hidden per-kind multiplier on health (hunter ×1.6–2.1, apex ×3) and on value (√heft), not a "bigger than you" rule.
6. **Species bite `attack.damage*.5`** (and `Math.min(100,…)`): every listed species bite is halved; a Needlefish (14 → 7) bites weaker than a plain hunter (13).
7. **`wildMight` only reaches lunges, bites, sentinel rings and swarmer darts**: spores, stings, touch damage and leeches do not get it. `clamp(o.might,1,2)` never binds (max 1.35 × 1.25).
8. **Hazards scale with the player's size, not the water** (`(12|9)*this._sizePower()`), against the "water decides" rule; same for thorns' cap (`30*sizePower`).
9. **Legendary summons use the player's stage** (`minStage*3<=p.stage`, `level max(water,stage)`), not the water.
10. **Flat amounts that break rule 9 (shares of body numbers):** sanctuary healing `3+variant` hp/s; algae heal `min(value,3)*.15`; mineral +5 stamina; protein `value*1.6` stamina (value grows with size while stamina does not, so deep protein refills far more stamina). Nutrition gain also grows with size while the drain stops at 9 cells.
11. **Vitality text says "+12 maximum health per point"**; it is +12% of base health (×size power). MORPHOS-BALANCE.md repeats the "+12 health" wording.
12. **Class ranks still change base stats:** Riptide rank power adds stamina (+10), cruise speed (+19), sprint (+.035×), sprint drain (−1.25) and stamina regen (+2.2) per rank; Predator rank enlarges touch-swallowing (+.035 r per rank); Stalker ranks raise conceal rate and cut sneak drain and sight. This contradicts "class ranks strengthen abilities only" in CLAUDE.md.
13. **`_rankPower` counts only Predator and Riptide**, so it is the same number for Pounce, Whirlpool, rams and broodlings, and Brood ranks only add through `(.2+.09r)`. Venom volley ignores it and uses size power and Power instead of attack. Each class move therefore has its own damage base: Pounce and Whirlpool on `attack×rankPower`, Venom volley on `(8+4r)×sizePower×Power`, Brood on `attack×rankPower×(.2+.09r)`.
14. **Ram on a boss ×1.4** and cooldown 1.2 s vs 1.5 s on creatures, with no stated reason.
15. **Engulfing membrane** adds `.12` to the Bite devour limit but `.2` to touch swallowing; Apex jaws (described as "a kill from Pounce resets Pounce") also silently adds `.08` to touch swallowing.
16. **Weapon numbers at Rare differ from the doc table:** the weapon perk starts at Rare, so a Rare Bite is .50 s and a Rare Spit 12.15 stamina (13.5 / .54 are Common/Uncommon). Jab ignores tier and frenzy.
17. **Ambush maths:** strikes multiply by 1.65 up front and then by 1/1.65 when the target had noticed you; Jab only multiplies when unaware. A single "ambush" factor applied in `_strikeHit` would do the same.
18. **Boss strength follows the player's size and speed at spawn**, not the boss level: an escaped boss that returns after you grew has more health and hits harder; Mobility makes bosses faster. `hits` is not "hits" (one hit = 1.91 Jabs).
19. **Swallow test uses raw radii** (`o.r>=p.r*2.8`): 80% of apex creatures one-shot a player of their own level, and about 1.5% of plain hunters do.
20. **Dead code:** `slipstreamTime`/`slipstreamCharged` (×2.2 strike, sprint ×.55, speed ×1.35+), `surgeTime`/`surgeCtx`, Strike `traits` (always 0, so every `tr.*` term is 0), `stalkCredit` (never raised), `growthGate`/`_growthAllowed` bodies after `return`, `growth` in `_derive`, `fresh2` in `_dropChance`, the duplicate chain-strike block inside `_pulse`.
21. **The stat cap** is a different curve from everything else (`min(10,2+stage)`, jumping to 12 at 31 cells), and `ATTRIBUTES.maxRank=12` is unused.
22. **Post-meal healing (1.5%/s for 6 s)** is the strongest heal in the game but sits outside the Recovery stat, although the Recovery description mentions it.
23. Minor: comment says species appear at `minStage*3+1` (HUD) while code tests the water index `minStage*3` (they agree once HUD vs index is clear); the drop-cap comment says "levels 1-6" meaning HUD levels.

---

## 7. Summary: what drives what

Two inputs drive almost everything. **Your cells** set F = cells^0.25 (frozen at 30), and every body number is a base times F^2.2: health 100, attack 11, weapon and move multiples of attack, boss health (`hits×21`) and boss damage (`unit = 100×dmg`). Stamina (100, 18 per strike, 17/s regen) is the one currency that never scales. **The water level** sets creatures: size k = F of that level × a random 0.45–1.5, health `base×k^2.2×heft^1.1×wildTough`, bite `base×k^2.2×wildMight`, food `base×k^2.2`. The level gap (±8% damage, ±12% worth per level) then ties the two together. Growth cost (`levelCost`) and food pace (cells^0.3625) set how long each cell takes; landmark, boss, hermit and study rewards are shares of the current level's cost (`_divisionShare`), so they stay proportional.

The real knobs: `BODY_GROWTH` .25, `SIZE_POWER` 2.2, `MAX_BODY_CELLS` 30, `ZONE_STEP` 850, the `wildTough` (2.6, /8, from 3) and `wildMight` (.02, cap .35) curves, the gap slopes .08/.12, base health 100 and attack 11, `levelCost` (1.7, 60, 1.45) and pace exponent 1.45, `BOSS_HEALTH_UNIT` 21 with each boss's `hits` and `dmg`, `TIER_POWER`/`PERK_POWER`, `DROP_CHANCE` and the 50/28/14/6/2 tier roll, the reward shares (.4 boss, .35 wonder, .2 nest, .15 hermit, .09/.07/.05 places, .03 study), `RANK_COSTS` with `XP_RATE`, and `ELDER_*`. Most other numbers are per-feature constants. Section 6 lists the ones that break the pattern.
