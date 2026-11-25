# Cast in Stone — prototype design notes

Working title **Cast in Stone** (was KILN until v0.5). Jaisah may never sell it; if it does get sold, the name gets more thought then (it is a common phrase, hard to trademark, and several games are called *Set in Stone*). A one-player prototype at `jza.app/prototype/` to test whether the core is fun before building more. Unlisted (no links to it, `noindex`), but public to anyone with the URL.

## The goal of this prototype

Answer one question: **is it fun to move around and fight in a world made of simulated materials, using four elements combined in pairs?** No enemies, cards, rounds or multiplayer yet.

## Where the game is heading

- An online two-player game with two modes on one core:
  - **PvP duel:** short rounds; the loser of each round picks an upgrade card; every 5 rounds the players are asked whether to keep going, endlessly.
  - **Co-op descent:** generated caves with enemies, cards found on the way.
- Inspirations: falling-sand games (every pixel a material), element-combining spell games, duel games with destructible terrain and loser-picks upgrades. It must be its own game: **no grappling rope and no free flight**. All movement beyond running and jumping comes from the elements.
- Input: keyboard and mouse, controller, and touch (later).

## Files

Plain scripts sharing one global scope, loaded in this order, no build step:

| File | What it holds |
|---|---|
| `data.js` | Every number and table: materials, reactions, elements, spells, player and dummy stats. |
| `world.js` | The falling-sand grid, chunks, map generation, and tools spells use (explode, electrify, ray). |
| `input.js` | Keyboard, mouse and controller → actions. |
| `game.js` | Rules: player control, spells, projectiles, particles, actor physics, damage, levels, Lodestones. |
| `save.js` | Saving and loading the ongoing world in the browser. |
| `loot.js` | The Runestones tab of the rest panel, and hover notes and map dots for loot. |
| `render.js` | Drawing: cells, the clay character, dummies, effects, glow. |
| `main.js` | Startup, the fixed-step loop, HUD, the panel (start, spells, pause). |
| `style.css` | Page and HUD styles. |
| `tools/golems.py` | Not loaded by the game. Generates the golem pixel rows from simple shapes (needs Python with Pillow). |

Each is linked with `?v=<version>`; bump them all together with the version in the `<title>` on every release.

## Built for multiplayer

- **Actions, not devices.** `input.js` turns devices into one action object per player per step: `{ move, jump, cast, aim, events }`, where events are `load` (an element) and `clear`. `game.step(actions)` is the only way input reaches the game. A second player's actions will arrive over the network in the same form.
- **Fixed step.** The game advances 60 steps a second, independent of the screen's frame rate (`KData.step`). At most 4 steps run per frame.
- **Seeded randomness.** The world and the game use seeded generators (`makeRng`), never `Math.random` (the renderer may, since drawing never changes the game). The same seed and the same actions give the same result.
- **Chunks.** The world is split into 32×32 chunks. Only chunks with recent changes are simulated (`awake`), and every changed chunk is flagged `dirty`. `world.takeDirty()` returns and clears them.
- **Plan for online play:** one player hosts the simulation and sends changed chunks (from `takeDirty`) plus player states and spell events; the other player sends its actions and draws what it receives, predicting its own movement. Connection by WebRTC through the MORPHOS co-op Worker (`coop.jza.app`, which only accepts requests from `https://jza.app`).

## The world

2048 × 1024 cells; the screen shows 320 × 180 cells, one pixel each, scaled up with crisp edges. The camera is centred on the player, clamped at the world's edges.

### Materials (`KData.materials`)

| Material | Behaviour | Notes |
|---|---|---|
| Rock | static, solid, **hard** | Nothing breaks it. Map frame, outcrops, pool lining. |
| Dirt | static, solid | Breakable. Stays where it is when undermined. |
| Loose earth | powder, solid | Falls and piles (slide 0.9). Soaks into mud slowly in water. |
| Water | liquid, flow 5, conducts | Can be electrified (`charge`), which hurts anything in it. |
| Steam | gas, life 90–170 steps | Rises, drifts, then mostly vanishes (6% condenses into water). |
| Fire | life 14–34 steps | Flickers upward; burns 22 health/s on touch. |
| Mud | powder, slide 0.25, moves 45% of steps | Slows: run speed × 0.38, jump × 0.55, strong drag. |
| Magma | liquid, flow 1, moves 35% of steps, life 200–255 | Burns 45 health/s on touch; cools into dirt (about 8 s). |
| Lichen (`MOSS`) | static, solid, flammable | Grows on floors and hangs from ceilings. Fuel for fire. |
| Crystal vein (`CRYSTAL`) | static, solid | Breaks like dirt and gives shards (see Treasure). |

### Reactions (`KData.reactions`, chance per step per contact)

| Touching | Chance | Result |
|---|---|---|
| Fire + water | 0.7 | fire out, water → steam |
| Magma + water | 0.5 | magma → dirt, water → steam |
| Fire + moss | 0.06 | moss catches fire |
| Magma + moss | 0.2 | moss catches fire |
| Fire + mud | 0.04 | mud bakes into dirt |
| Magma + mud | 0.08 | mud bakes into dirt |
| Water + loose earth | 0.01 | earth soaks into mud (water used up) |

Fireball explosions boil 50% of the water they reach. A bolt that reaches water electrifies up to 2,200 connected water cells for 70 steps.

### No crumbs (minimum terrain size)

After terrain breaks (`world.explode`, which every digging spell uses, crawler chewing, and the unstick check), `world.cleanup` looks at the area: any loose piece of dirt or lichen smaller than 10 cells (`World.MIN_PIECE`, 4-connected), and any single cell with at most one solid neighbour (thin spikes and strands, two passes), crumbles into loose earth and falls. Rock never changes. The starting cave is cleaned the same way (crumbs removed outright). This keeps pixel-sized floating bits out of the world, so creatures do not snag on them.

### The cave (generated from a seed)

Not a descent: a **web of caves spreading in every direction from a central hub** (Jaisah: avoid copying Noita's downward structure; it needs forks and different paths). Built from the seed at the start of a run (`world.generate`, about 0.3 s on a desktop), so the same seed always gives the same cave; in co-op only the seed and the changes will need sending.

1. Dirt everywhere, with large unbreakable rock masses (two layers of noise) that shape the routes.
2. **Chambers** (`KData.cave.chambers`, 46): the hub in the middle (84 × 42), the rest scattered at least 150 apart, 30–70 wide and 20–40 tall, as noisy ellipses. Big chambers get floating dirt ledges.
3. **Links:** a tree that reaches every chamber (so everything is reachable), plus extra links to near neighbours (about a third of the time) for **loops, forks and alternative routes**. Dead ends happen naturally.
4. **Tunnels:** winding (a sine wiggle across the line), radius 12–17 varying with noise. Steep ones become shafts that need flying, climbing or pillars.
5. **Dirt plugs:** 16% of non-hub tunnels are blocked midway by a plug of dirt you must dig, blast or drill through.
6. **Regions** (`KData.biomes`): Rose Hollows within 300 of the hub; further out, six region seeds around the hub alternate **Drowned Galleries** (blue-grey stone, water basins, mud patches, more hanging lichen) and **Ember Veins** (dark red stone, magma basins, little lichen). Each region has its own strata colours and back-wall tint; borders are dithered.
7. **Pools:** most Drowned and Ember chambers get a basin dug into the floor, below where tunnels join, filled with water or magma, then drained down to its lowest opening so it starts at rest. Pool magma is permanent (life 255); magma you create still cools.
8. Lichen on floors and ceilings, mud patches by region, no crumbs.
9. **Levels:** 1 + distance from the hub / 250. Shown under the map and in hover notes.
10. **Mana wells** (7): lilac crystals on plinths in chambers away from the hub. Within 20, mana refills at 70 a second.
11. **Crawler homes:** 1–4 per chamber (more further out), none in the hub. Two training dummies stand in the hub.

Safe spots (`world.standSpot`) climb out of solid ground, drop to the floor and check headroom, so nothing starts inside terrain.

**Buttons:** Reset map rebuilds the same seed; **New cave** picks a random seed.

**Map:** top right, 160 × 80, explored chunks only (anything that has been on screen), coloured by material and region, with mana wells (lilac) and you (white). Below it: region name and level.

**Resting liquids:** water and magma only spread sideways towards somewhere lower within reach (3 × their flow), and slow materials only stay awake if they could still move. Together with drained pools, the world goes completely still about 10 s after a reset (simulation 0.2 ms a step, 3–10 chunks awake).

**Drawing:** colours for the back wall, dirt and rock are worked out per 32 × 32 chunk when it first appears on screen, with the latest 320 kept (about 4 MB), instead of for the whole world (which would be about 60 MB).

## The character

A **rock golem**, chosen by the player from four looks (`KData.golems`). The choice only changes the drawing; all four play the same. It is shown on the start and pause panel and remembered in that browser (`localStorage` key `castinstone.golem`). In multiplayer it travels with the player (`p.skin`).

| Golem | Look | Where the two loaded elements show |
|---|---|---|
| Brute | Huge shoulders and fists, head sunk between them | Its eyes; a chest crack glows with the mix |
| Titan | Wide V-shaped chest, small head | Its eyes; a crack down the chest glows with the mix |
| Crystal | Hunched boulder with two crystals on its back | The crystals (seen from far away) |
| Sentinel | Stone helm, flat shoulder plates | The visor slit; a chest crack glows with the mix |

Each is about 21 × 17–20 pixels; the hitbox is 11 × 17, so the arms may overlap walls a little. The pixel rows live in `data.js` (k outline, h/m/d stone light/mid/dark, s seam, g lichen, e eye, L/R slots, c glowing crack). They were generated from simple shapes (boulders for shoulders, fists, head, legs) by `tools/golems.py`, which gives every stone its own lighting and dark seams; edit the shapes there and paste the printed rows back, or edit the rows by hand. Light granite grey, so the golem stands out from the dark slate rock and rose dirt. Damage chips stone pixels off (up to 30% at zero health). The interface uses only clay and violet-ash colours (mana is lilac), so the four element colours always mean their element.

## Look

The world has its own palette, deliberately unlike the random brown speckle of older digging games:

- **Background:** deep violet, darker towards the bottom, with darker far-rock shapes and faint spores.
- **Dirt:** layered strata (dusky rose, plum, sand) that follow a gentle wave and blend into each other with an ordered 4 × 4 dot pattern (Bayer dithering). Colours depend on the cell's position, so new dirt (an earth pillar) matches the layers around it.
- **Rock:** faceted dark slate with thin crystal edges.
- **Edges:** a light crust on any surface open to the air above, a dark rim on sides and undersides, so the terrain reads as carved.
- **Lichen** (the fuel material, code name `MOSS`): pale sage, on floors and hanging from ceilings.
- **Loose earth** sandy rose; **mud** grey-violet; **water** deep blue with a pale surface line.

## Player

| | |
|---|---|
| Health | 100; regenerates 12/s after 3 s without damage; respawn after 1.4 s |
| Size | hitbox 11 × 17 |
| Run | 72 cells/s; accel 900 ground, 520 air; ground friction 14 |
| Jump | 168 cells/s up (about 29 cells high); gravity 480; max fall 330; coyote 0.1 s; jump buffer 0.12 s; releasing early halves the rise |
| Water | gravity × 0.28, drag; hold jump to swim up (to 95/s) |
| Mana | 100; refills 16/s in the air, 30/s on the ground; any spend pauses the refill 0.35 s; running dry pauses it 0.9 s |
| Hazards | fire 22/s, magma 45/s, electrified water 60/s |

Own spells hurt you (fireball blasts, fire, magma, shock). Flare's blast skips its caster.

## Enemies

### Shale crawler (`KData.enemies.crawler`)

The first enemy, for testing combat. A plated, beetle-like crawler of dark shale with magenta eyes (magenta is not an element colour, so enemy eyes never read as a spell). 15 × 8 pixels; hitbox 13 × 8. They live in chambers around the cave (see The cave).

| | |
|---|---|
| Health, stats | 60; attack 10, defence 8 (so player spells do ×1.11) |
| Patrol | walks at 22, turns at walls and ledges |
| Notices you | sees you within 130 with a clear line (a ray through the world); or you are within 50 (no line needed); or you hurt it; or you cast within 110 of it (spells make noise). Forgets you 4 s after the last of these; meanwhile it heads for where it last knew you were. |
| Getting to you | jumps (165) at walls; when you are above and something is overhead it walks out to the side for up to 1.1 s, then jumps up to your height (up to ×1.4); jumps gaps towards you; steers in the air. Progress is checked every 0.5 s: no progress for 0.5 s → a high jump; for 1 s → it stops jumping and chews through dirt in front (never rock), turning back after 5 s. |
| Chase | runs at 50 towards you |
| Wind-up (the warning) | within 34 sideways and 18 up or down: stops, rears up 2 pixels, eyes flash, glow grows; 0.45 s |
| Lunge | 215 forward, 90 up; first touch does power 18 (through the damage formula) and knocks back 170 |
| Recover (the opening) | 0.7 s, slowing to a stop |
| Stagger | any hit of 12 or more interrupts it (including a wind-up) for 0.35 s |
| Death | crumbles into loose earth; comes back home 25 s later, but only while no player is within 300 of its home |
| Home and level | lives in one chamber; level from its distance to the hub: per level above 1, +30% health, +2 attack, +1 defence |
| Sleep | not simulated or drawn when no player is within 380 sideways and 266 up or down |

Hazards (fire, magma, electrified water, mud) affect it like anyone else. Measured: standing still, a player first gets hit about 1.4–2.9 s after being seen; two Stone spears kill one.

## Getting stronger

### Lodestones (`world.lodestones`, `game.lodestonesTick`)

Standing stones with a rune: one in the hub beside the start, seven more spread through chambers at least 260 apart (they replaced the mana wells, which only refilled mana). Within 22 sideways and 20 up or down:
- **Found:** the first touch lights the rune (+25 experience, a notice).
- **Checkpoint:** the last one touched is where you rise after dying.
- **Repair:** health and mana refill at 90 a second while you stand there.
- **Rest:** W (d-pad up) on the ground opens the rest panel (play pauses): **Stats** to spend points, **Travel** to any found Lodestone. A prompt shows while you are near.

### Experience and levels (`KData.progression`)

- From kills (8 + 6 × the enemy's level, ×3 for elites), finding Lodestones (25), and later treasure and bosses. Kill credit goes to the last player who hit it within 8 s (so a crawler that dies in your fire still counts).
- Level L to L+1 needs 50 + 30(L−1) + 6(L−1)² (50, 86, 134, 194, 266…).
- Each level: **3 stat points** and a full repair. Notices show experience gained and level-ups; the HUD shows the level, a thin experience bar and the unspent points.

### Stats (spent at a Lodestone, `game.spendPoint`, `game.applyStats`)

| Stat | Per point |
|---|---|
| Attack | +1 (base 10) |
| Defence | +1 (base 10) |
| Vitality | +10 maximum health (base 100) |
| Mana | +10 maximum mana (base 100) |
| Focus | mana refills 8% faster |
| Fire / Water / Earth / Lightning power | spells with that element hit 6% harder (a pair averages its two elements) |

### Runestones (`KData.runes`, `loot.js` for the panel)

The golem has four slots: **head, core, arms, legs**. A runestone adds stats (counted in stat points, so the same table as above, × its grade, × 1 + 15% per level above 1) and most add a **trait**. Shown as real effects ("+25% Fire power", "+42 maximum mana"). Grades: Common ×1, Rare ×1.6, Epic ×2.3, Legendary ×3.2, each with its own colour. A stone's level is the level of the place it dropped.

| Stone | Slot | Stats (points) | Trait |
|---|---|---|---|
| Glimmer brow | head | Focus 1.5 | — |
| Storm crown | head | Lightning 1.5 | Bolt and Arc jump to one more target |
| Ember visor | head | Fire 1.5 | your fire spells set enemies burning: 6 a second for 3 s |
| Deep core | core | Mana 2 | — |
| Magma heart | core | Vitality 1.5 | fire and magma do not hurt you; wade through magma |
| Tidal core | core | Water 1.5 | Steam flight and Hover are free in water or within 14 cells above it |
| **Crucible** | core | Fire 2 | **your fire melts rock** into cooling magma: Fireball (inner 77% of its blast), Fire nova and Flare (around you), Rocket jump, Ember lance (radius 5 where it hits). Never the world's frame. Not a normal drop: it comes from treasure and bosses. |
| Quarry fists | arms | Attack 1.5 | spells with earth knock back 60% harder |
| Splitting arms | arms | Fire 1 | a Fireball's blast throws three small fireballs (55% blast, 40% damage) |
| Thrifty arms | arms | Focus 1 | every fourth Shot costs no mana |
| Mire arms | arms | Earth 1, Water 0.5 | each Burst turns the ground within 20 to mud |
| Spring legs | legs | Speed 1 | jump 30% faster (higher) |
| Anchor legs | legs | Defence 2 | a quarter of the knockback |
| Swift legs | legs | Speed 1.5 | Blink, Arc dash and Blast dash cost half |
| Diver legs | legs | Water 1 | no water drag, swim up fast (160), mud never slows you |

Speed is +5% run speed a point. **Drops:** 14% of kills, every elite, two Epic or better from bosses; grade odds rise with the level (Epic 3% + 2% a level up to 20%, Rare 18% + 4% a level up to 45%). Stones fall, rest on the ground (a small stone in its grade's colour, glowing, gold dot on the map) and are picked up by touch into a **bag of 24**. At a Lodestone's **Runestones** tab: equip (the worn one goes back to the bag), take off, or **break** a stone into shards ((3 + 2 × level) × 1, 2.5, 6 or 15 by grade), spent at Lodestones (see Treasure).

### Treasure (`KData.treasure`)

**Crystal veins** (`CRYSTAL`, turquoise, sparkling, faint glow): a blob in the wall of 60% of chambers, plus 40 smaller veins scattered in the dirt; some sit in rock (Crucible only). Breakable by anything that digs (`world.explode` records each broken crystal cell in `world.broken`). Each cell throws out a **shard** that flies to the nearest player within 160 and adds 1 to their shards (a notice adds them up). About 2,000–2,700 crystal cells per cave.

**Relic caches:** stone caskets with a gold band and a soft gold glow, in 60% of chambers (15–25 per cave), each sealed in by the cave in one of five ways:

| Kind | Where | How to reach it |
|---|---|---|
| Buried | a pocket 9–19 cells into a chamber's dirt wall, enclosed by at least 7 cells of dirt | dig |
| High | an alcove dug into a chamber's ceiling, with a shelf | fly, climb or build a pillar |
| Flooded | at the bottom of a Drowned basin | swim down |
| Magma | at the bottom of an Ember basin | wade (with the Magma heart, or quickly), or cool the magma with water and dig |
| Rock | a pocket inside a rock mass beside a chamber | only fire that melts rock (the Crucible) |

Touching one opens it: experience 30 × level, shards 12 × level, a runestone one grade better than a usual drop (at most Epic) into the bag, and from level 5 a 10% chance of the Crucible (if you have none). Checked over four seeds: no buried or rock cache has an opening to the cave. Opened caches are saved. Gold dots mark unopened caches on the map once seen; hover notes say how to reach each kind.

**The Forge** (a Lodestone tab) spends shards: a **stat point** for 80 + 40 per point already bought, or **one level** on a worn runestone for (8 + 5 × level) × 1, 2, 4 or 8 by grade (up to level 30).

### Saving (`save.js`)

One ongoing world per browser (`localStorage` key `castinstone.save.v1`). A save holds the seed (which rebuilds the starting cave exactly), only the 32 × 32 chunks changed since generation (materials and life values, run-length encoded and base64), the explored map (bits), found Lodestones and the checkpoint, and the golem (position, health, mana, level, experience, points, stats, loaded elements, look, worn runestones, bag, shards, points bought), and the opened caches. Runestones are checked on load (known type, grade and slot). Saves happen every 20 s of play, on reaching a Lodestone, on resting and spending points, on travel, on pause or leaving the page. A save is checked (readable, complete) before it replaces the last one; loading clamps every number and falls back to the checkpoint if the golem would stand inside terrain. A new world plus a little digging is about 40 KB.

The start panel says Continue when a save exists. **New game** (pause or start panel) asks for a second press, then starts a new random cave and progress. **Reset map** rebuilds the cave from its seed but keeps the golem's progress.

### The other enemies (`KData.enemies`, `game.tick_<kind>`)

All enemies share: a home chamber, levels (+30% health, +2 attack, +1 defence a level), sleeping when no player is near, coming home 25 s after death while nobody is within 300, noticing you (sight 130, closeness 50, being hurt, spell noise within 110; forgetting after 4 s), and an **affinity** per element (a spell averages its two elements). Each chamber gets 1–4 enemies, picked by region weights (Rose, Drowned, Ember) and the lowest level each appears at.

| Enemy | Health · attack · defence | Behaviour | Affinity | Where (weights R/D/E, from level) |
|---|---|---|---|---|
| **Glowmoth** (13 × 7, flies) | 36 · 9 · 6 | drifts near home; aware, hovers 40 to one side and 28 above you, **glows for 0.55 s**, swoops at 230 for 0.45 s (power 14, one hit), flutters away for 0.9 s. A hit of 10+ during its glow cancels the swoop. | lightning ×1.6, earth ×0.8 | 0.5 / 0.8 / 0.4, from 1; placed in open air |
| **Delver** (13 × 9) | 70 · 12 · 9 | inside dirt it swims at 48 with no collision (shown faint, throwing crumbs) towards a spot under the ground 26 to your side; feels you within 150 without sight; **bursts out** (digs a hole), winds up 0.4 s, leaps at you (power 22); then dives back into the nearest dirt after 1.6 s on it | water ×1.6, earth ×0.4 | 0.35 / 0.35 / 0.3, from 2 |
| **Cinder spitter** (11 × 10) | 55 · 10 · 10 | set into a chamber wall facing in; looks from its mouth (sight 190); every 2.4 s, **its mouth glows for 0.5 s**, then it lobs a magma glob on an arc aimed to land on you (power 14, 10 magma cells). If its wall is dug away it falls and keeps spitting. | fire ×0, water ×1.8, lightning ×1.1 | 0.15 / 0.1 / 0.7, from 1 |
| **Slate warden** (17 × 16) | 170 · 14 · 18 | walks at 22, jumps low walls; close (30), **raises its shoulders for 0.9 s**, then slams: power 30 (less towards the edge) within 30, knock 260 up; 1.1 s to recover. Only a hit of 40+ during its wind-up cancels the slam. | fire ×0.4, lightning ×0.4, earth ×1.6, water ×1.3 | 0.15 / 0.25 / 0.25, from 3; one per chamber |

**Elites:** 8% of enemies from level 2: ×1.8 health, ×1.3 attack, gold eyes and a gold glow, a gold health bar; always drop a runestone and give triple experience. Experience per kill also scales by kind (warden ×2.5, delver ×1.3, spitter ×1.2).

### Status effects (`KData.statuses`)

| Status | Comes from | Effect |
|---|---|---|
| **Wet** (4 s) | any spell with water, or being in water | lightning hits ×1.5 |
| **Muddy** | standing in mud, or a Mud hit (2.5 s) | slowed, and fire hits ×1.4 |
| **Burning** | the Ember visor (3 s), touching fire (1.5 s, enemies) | 6 damage a second; water hits ×1.4 and puts it out |

Shown on the enemy (drips when wet, muddy tint, burning flecks) and in its hover note. Hazards respect fire affinity (a spitter stands in magma unharmed).

Tested in a cleared arena (player standing still, 10 s): crawler 6 hits, moth 4, delver 3, spitter 2, warden 1 (slow on purpose). On a whole cave (one seed): 23 moths, 21 spitters, 17 crawlers, 8 delvers, 3 wardens, plus 3–5 elites.

### The Emberwyrm (`KData.bosses.emberwyrm`, `game.bossTick`)

The first boss, in the Ember Veins. **Lair:** the biggest Ember chamber more than 420 from the hub is enlarged to at least 105 × 50 and dug deeper; every open cell below its middle becomes a permanent **magma lake**, with a 3-cell rock rim (so digging cannot drain it) and tunnel mouths at the lake's edge sealed with rock. Five dirt ledges float above the lake (a high centre one, two side ones, two small stepping stones). No other enemies or caches in the lair; the nearest chamber with room always gets a Lodestone. Red dots mark the lair on the map until it is defeated.

**Fight:** it wakes when a player enters the lair (boss bar at the top), heals and calms if everyone stays out for 8 s. Health 900, attack 14, defence 14 (+30% / +2 / +1 a level; the lair is usually level 2–4). It can only swim through magma.
- **Swim** under the surface towards you (speed 95; its dark shape shows through the magma).
- **Bubble → breach** (62%): picks a surface spot beside you with a clear line to your head, the magma **bubbles there for 0.85 s** (the warning), then it leaps on an arc sized to reach just above you, bonks off ceilings, steers back to open lake after the top of its arc and dives in.
- **Spit** (38%): swims to a spot 55–110 from you, rises and lobs 3 magma globs (5 when enraged) in high arcs that come down on you over ledges (power 16, 12 magma cells each).
- **Contact:** any part of its body hurts (power 26, knock 220, at most every 0.8 s).
- **Enraged** below half health: the lake rises 6 cells (once) and it strikes more often (every 1.3 s instead of 2.1 s).
- **Stranded:** if a leap lands on solid ground with magma close by, it is only stunned (1.1 s); with no magma near (or when the magma around its head has been **cooled into dirt with water**) it is stranded for 4.5 s, takes **double damage**, then wriggles to open lake and drops back in.
- Affinity: fire ×0, water ×1.6, lightning ×1.2.

**Rewards:** experience (15 × a crawler of its level), shards (40 × level), two runestones dropped where it dies (the Crucible at Legendary if you have none, otherwise a Legendary; plus an Epic or Legendary), and the **Ember core**. Defeated bosses and claimed cores are saved; it does not return.

Measured over three seeds (60 s each, a player standing on a ledge, put back if knocked off): it cycles swim / bubble / breach / spit, deals 380–860 damage a minute to a player who never dodges, and strands itself on ledges for short spells. Its magma lake loses no cells over a fight.

## Mana

Every spell costs mana. Held spells (Steam, Water jet) drain it every moment they are held and stop when it runs out. You can fly with Steam, but a full bar lasts about 5.6 s (some areas will need flight to get around); when it runs dry you fall and cannot attack until it refills. A spell needs its full cost to start (held spells need a small minimum); trying without enough flashes the mana bar.

## Damage and stats

Damage is not a fixed number of hits. Every actor has stats (`KData.baseStats`): **attack**, **defence**, and a **power** for each element. Each spell has a base **power**.

`damage = base power × element power × 2A ÷ (A + D) × modifiers`

- A is the caster's attack, D the target's defence. With equal attack and defence the middle term is 1, so the base power is the damage; doubling attack against the same defence gives ×1.33, and the same defence against half the attack gives ×0.67.
- Element power is the average of the caster's power in the spell's two elements (Bolt uses lightning twice; Stone spear averages earth and lightning).
- Hazards (fire, magma, electrified water) have no caster: they use A = D, so only the target's defence relative to the base of 10 would change them later.
- Modifiers are where buffs and debuffs will go (for example, wet targets taking more lightning damage). None yet.
- Everyone starts with attack 10, defence 10 and power 1 in every element, so the game plays as before until upgrade cards (PvP) and finds (co-op) change stats. The formula is `game.damage()`.


## Elements and spells

Load two elements (order does not matter). Every pair gives **three spells**, one per way of casting:

| Mode | Input | Job in combat |
|---|---|---|
| **Shot** | left click (hold to repeat), RT | aimed at the cursor; ranged pressure; cheapest |
| **Burst** | right click, LT | an area around you; close-range defence; costs more, longer cooldown |
| **Move** | jump, then keep holding Space (or press Space again in the air), LB | moves you in the direction you press (W A S D / left stick), so you can move one way and shoot another |

A third element pushes out the first; slots stay loaded after a cast. **Every mode repeats while held** until mana runs out (Jaisah: mana is the limit, not cooldowns). Held spells (Water jet, Scald, Hover, Steam flight, Wall climb, Drill) drain mana while held; the rest cost a set amount and recast after a short gap (Bursts 0.4–0.5 s). **Moves never look at the mouse:** Rocket jump, Hover, Steam flight and Wall climb go up while Space is held (S drops or slides down) and A/D steer; Magma slam goes down; Blink, Arc dash, Drill and Blast dash go the way you press, or the way the golem faces when nothing is pressed (Jaisah: leave those as they are). **Mud blocks spells:** shots, bolts, beams and the spear stop at mud like at solid ground (you can still wade through it). Each spell has its own cooldown (`key:mode`). A Shot or Burst is followed by a 0.12 s lock on Shots and Bursts. One spell of each mode can run at once (you can fly and shoot). Every cast alerts enemies within 110. All numbers live in `KData.spells`; power is base damage before stats.

| Pair | Shot | Burst | Move |
|---|---|---|---|
| Fire + Fire | **Fireball** 14 mana: 230/s, gravity 70, blast radius 9 (digs, fire on the rim), power 40, knock 210, cd 0.5 | **Fire nova** 26: power 26 within 24, knock 220, ring of fire; cd 0.4 | **Rocket jump** 16: 250 straight up (A/D lean sideways), a small blast under you (power 18 to others, never you); recast every 0.45 s while held |
| Water + Water | **Water jet** 14/s held: 3 particles a step, pushes | **Tidal wave** 24: 56 water particles both ways; enemies within 42 sideways shoved 320, power 10; cd 0.4 | **Hover** 10/s held: rise 45 (W), slow sink 14, drop faster (S); water drips below |
| Earth + Earth | **Boulder** 16: lobbed 200/s, gravity 380, power 32, knock 300, digs radius 3, leaves 18 loose earth; cd 0.7 | **Stone shell** 24: a 2-thick ring of dirt at radius 14, pushes enemies out; cd 0.5 | **Pillar** 16: dirt grows up under you (26 rows, 7 wide, 80/s); no ground in range 70: a slab under your feet; cd 0.55 |
| Lightning + Lightning | **Bolt** 16: instant, range 170, power 30, chains once within 16, electrifies water; cd 0.55 | **Shock field** 26: power 28 to all within 34, electrifies nearby water; cd 0.4 | **Blink** 20: teleport up to 36 in the pressed direction (default facing) to the furthest free spot; cd 0.5 |
| Fire + Water | **Scald** 20/s held: steam cone, range 34, ±0.45 rad, power 32 a second | **Steam cloud** 20: steam fills radius 24 (60%), power 14 inside; cd 0.4 | **Steam flight** 18/s held: steam blasts straight down, lifting you 900/s² up to 150; A/D steer (95 sideways); S stops the lift; a full bar lasts about 5.6 s |
| Earth + Fire | **Magma** 16: lob, 38 magma cells, power 15 direct; cd 0.7 | **Eruption** 28: 40 magma particles fountain from the ground within 28; power 24, knock 260 up; cd 0.45 | **Magma slam** 22: dive at 360 (default down); on landing 26 magma cells, power 30 within 20, knock 240; cd 0.6 |
| Earth + Water | **Mud** 12: 50 particles, 220/s, ±0.28 rad, gravity 220. A hit coats and slows (below); cd 0.6 | **Mire** 22: the top 2 cells of ground within 32 (not under you) turn to mud; cd 0.5 | **Wall climb** 8/s, only while touching a wall: cling, climb with W (55/s), down with S |
| Lightning + Water | **Arc** 18: like Bolt (range 140, power 20) but jumps to 3 more targets within 45 (×0.7); cd 0.55 | **Storm** 28: power 22 to every enemy within 75 in line of sight; cd 0.4 | **Arc dash** 22: 310/s for 0.12 s (0.2 s from water) in the pressed direction, power 20 to each actor passed; cd 0.35 |
| Earth + Lightning | **Stone spear** 18: 380/s, bores radius 3 for 90 cells of dirt, power 45, knock 160; cd 0.6 | **Spikes** 26: dirt spikes (7 tall) every 4 cells within 30 on the ground; power 30, knock 240 up; cd 0.4 | **Drill** 24/s held: move 110/s in the pressed direction (default facing), boring radius 10, no gravity; 12 to anything touched (every 0.3 s) |
| Fire + Lightning | **Ember lance** 14: instant straight beam, range 150, pierces every enemy (power 24), stops at solid (fire there) or water (steam); cd 0.4 | **Flare** 24: power 32 within 24, knock 340, sparks fire; cd 0.4 | **Blast dash** 18: thrown 280 in the pressed direction (default facing); blast behind you (power 16 to others); cd 0.45 |

### Mud slows

Standing in mud, or being hit by mud spray, slows. A spray hit coats the target for 2.5 s (`slowT`), even after it leaves the mud. Enemies move at 35% speed, wind up more slowly and lunge at about 60% speed; players run at 38% with weaker jumps. Coated enemies are drawn muddy and the hover note says "Slowed by mud". Measured: a crawler that takes 1.1 s to reach you takes 2.5 s after one Mud shot.

## Controls

| Action | Keyboard and mouse | Controller |
|---|---|---|
| Run | A / D (or arrows) | Left stick, d-pad |
| Jump, swim up | Space | LB or RB |
| Aim | Mouse | Right stick (or the left stick's direction) |
| Load Fire / Water / Earth / Lightning | Q / E / R / F or 1–4 | B / X / A / Y |
| Shot | Left click (hold repeats) | RT |
| Burst | Right click | LT |
| Move | Hold Space after jumping, or press it again in the air | Hold LB |
| Move direction | W A S D (or arrows) | Left stick, d-pad |
| Clear the elements | X | View |
| Spells, pause | H, Esc or P | Menu |
| Reset the map | Backspace | — |

The last device used takes over. Touch controls are not built yet.

## Menu

The start/pause panel holds the title, the golem picker, a two-column controls list and the buttons (Start or Resume, Spell book, Reset map). The **Spell book** (button, H, or the HUD button) replaces the controls with a 10 × 3 grid of spell names (rows are pairs, columns Shot / Burst / Move); pointing at or focusing a name shows its elements, mode, mana and description underneath (Jaisah: the long list was messy).

## Hover note

Pointing the mouse at something shows a small note in the bottom-left corner (`#look`, `describe()` in `main.js`): creatures with their health (and your own mana), or the material under the cursor with a one-line description (`desc` in each material; electrified water has its own). Hidden over empty space, with a controller, outside play, and on screens narrow enough to use the compact layout.

## Performance

Measured in desktop Chromium with a water jet running for 600 steps: simulation 0.22 ms a step, drawing 1.5 ms a frame. The simulation only touches awake chunks; the renderer draws the visible 320 × 180 cells each frame. The game pauses when the tab is hidden. Screen shake is off with reduced motion.

## Decision log

- **v0.1 (2026-11-25):** first build. Four elements, ten spells, one map, training dummies, keyboard/mouse and controller. Spell keys are the two element names in alphabetical order. Slots stay loaded after a cast. Movement spells use bursts (two, refilled on landing) so there is no free flight. Health is 100.

- **v0.2 (2026-11-25):** own look. The character is a bottle kiln (door shows the elements, chimney smoke in their colours); dirt is layered strata, rock faceted slate, moss is now lichen, the cave is violet. Player hitbox 9 × 14 (was 7 × 12).

- **v0.3 (2026-11-25):** the player is a rock golem, with four looks to choose from (Brute, Titan, Crystal, Sentinel; Jaisah: keep all four, the player picks). A mana bar replaces bursts (Jaisah: bursts did not make sense). Steam is now held, continuous thrust instead of a single burst (Jaisah). Damage now goes through a stat formula (Jaisah: damage should be RPG-like, from attack, defence, the move, buffs and debuffs, not a fixed number of hits); everyone starts equal. Decided by Jaisah: slots stay loaded after a cast; holding cast repeats. Hitbox 11 × 17; earth pillar 7 wide and 26 long, stone spear tunnels radius 3, so the bigger golem fits through.
- **v0.4 (2026-11-25):** Steam drains 18 mana/s (was 36), so a full bar flies for about 5.6 s (Jaisah: at least 5 s; some parts of the game will need flight).
- **v0.5 (2026-11-25):** renamed from KILN to Cast in Stone (Jaisah). The golem choice is now stored as `castinstone.golem` (the old `kiln.golem` is still read). The URL stays `/prototype/`.
- **v0.6 (2026-11-25):** first enemy, the Shale crawler (patrol, chase, wind-up, lunge, recover; staggered by big hits; respawns). Jaisah asked for an enemy to test combat.
- **v0.7 (2026-11-25):** crawlers no longer get stuck (Jaisah): they notice you by closeness, hits and spell noise as well as sight; walk out from under ledges and jump up; and chew through dirt when nothing else works. Tested: on a ledge above it, behind the rock spur, and sealed behind a dirt wall, it reaches and hits you.
- **v0.8 (2026-11-25):** hover note: point at anything to see what it is (Jaisah).
- **v0.9 (2026-11-25):** three ways to cast, approved by Jaisah: every pair has a Shot (left click), a Burst around you (right click) and a Move (hold Space after jumping), 30 spells in all; W/S now steer Moves (Space alone jumps) and X clears. No terrain crumbs: pieces under 10 cells and one-cell spikes crumble (Jaisah: 1-pixel bits snag bots). Mud now really slows enemies, and a spray hit coats and slows for 2.5 s (Jaisah).
- **v0.10 (2026-11-25):** Moves don't follow the mouse (hold Space: steam blasts straight down, A/D steer); every spell repeats while held, with short gaps, so mana is the limit; mud blocks spells; the spell list moved to a Spell book grid (all Jaisah).
- **v0.11 (2026-11-25):** a generated web of caves (hub, 46 chambers, looping tunnels, three regions, pools, plugs, mana wells, levels by distance), a map of explored areas, New cave, crawlers that live in chambers, scale with level and sleep when far away. Liquids come to rest. Jaisah: not a downward descent, and it needs forks.
- **v0.12 (2026-11-26):** Lodestones (checkpoint, repair, rest panel with stats and travel) replace mana wells; experience, levels and stat points; one ongoing world saved in the browser (Jaisah: an ongoing world; all four elements from the start; upgrades that reach further come with runestones).
- **v0.13 (2026-11-26):** runestones: four slots, 15 stones with stats and traits (including the Crucible, whose fire melts rock, Jaisah's idea for reaching further), drops, a bag, breaking into shards.
- **v0.14 (2026-11-26):** crystal veins and shards, relic caches sealed in five ways, the Forge.
- **v0.15 (2026-11-26):** four new enemies (Glowmoth, Delver, Cinder spitter, Slate warden), element affinities, status effects (wet, muddy, burning), elites.
- **v0.16 (2026-11-26):** the first boss, the Emberwyrm, in a magma-lake lair: breaches marked by bubbling, spit volleys, enrage with a rising lake, stranding when its lake is cooled; drops the Crucible and the Ember core. Large magma areas glow more softly.

## Open questions to test

- Should earth pillar keep some upward speed when it stops?
- How fast should mana refill?
