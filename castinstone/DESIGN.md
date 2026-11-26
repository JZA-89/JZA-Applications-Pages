# Cast in Stone — prototype design notes

Working title **Cast in Stone** (was KILN until v0.5). Jaisah may never sell it; if it does get sold, the name gets more thought then (it is a common phrase, hard to trademark, and several games are called *Set in Stone*). A one-player prototype at `jza.app/castinstone/` to test whether the core is fun before building more. Unlisted (no links to it, `noindex`), but public to anyone with the URL.

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
| `recipe.js` | Turns the typed elements (the recipe) into the four spells it casts: form, modifiers, size, cost, name (`KRecipe.resolve`). |
| `world.js` | The falling-sand grid, chunks, map generation, and tools spells use (explode, electrify, ray). |
| `input.js` | Keyboard, mouse and controller → actions. |
| `game.js` | Rules: player control, spells, projectiles, particles, actor physics, damage, levels, Lodestones. |
| `save.js` | Saving and loading the ongoing world in the browser. |
| `loot.js` | The Runestones and Forge tabs of the rest panel, and hover notes and map dots for loot. |
| `audio.js` | All sound, synthesized. |
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

2048 × 1024 cells; the screen shows 384 × 216 cells (320 × 180 before v0.64), one pixel each, scaled up with crisp edges. The camera is centred on the player, clamped at the world's edges.

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
- **Reach (v0.28):** you are at a Lodestone within 46 cells to either side, 30 above it or 50 below it. Each stands on a 13 × 3 base of rock, re-made every 2 s if anything removed it.
- **Found:** the first touch lights the rune (+25 experience, a notice).
- **Checkpoint:** the last one touched is where you rise after dying.
- **Repair:** health and mana refill at 90 a second while you stand there.
- **Rest:** R (d-pad up) next to it opens the rest panel (play pauses): **Stats** to spend points, **Travel** to any found Lodestone. A prompt shows while you are near.

### Experience and levels (`KData.progression`)

- From kills (6 + 4 × the enemy's level, ×3 for elites), finding Lodestones (25), and treasure and bosses. Kill credit goes to the last player who hit it within 8 s (so a crawler that dies in your fire still counts).
- **Enemies well below you are worth less** (`underLevel`): one level below, full experience; two below 70%, three below 40%, four or more 10%. Enemies come back after 25 s, so without this, staying near the start and killing the same crawlers levelled you quickly.
- Level L to L+1 needs 120 + 80(L−1) + 30(L−1)² (120, 230, 400, 630, 920, 1270…): about 12 level-1 crawlers for level 2, and about 3,600 experience to reach level 7 (it was 1,080). v0.20, Jaisah: level 7 came before he had found anywhere to spend points.
- A level-up notice says where the nearest found Lodestone is (distance and direction), since points are spent there.
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
| Tidal core | core | Water 1.5 | Steam flight, Flame jet, Plasma thrust, Water jet and Storm glide are free in water or within 14 cells above it |
| **Crucible** | core | Fire 2 | **your fire melts rock** into cooling magma: Fireball (inner 77% of its blast), Fire nova and Flare (around you), Ember lance (radius 5 where it hits). Never the world's frame. Not a normal drop: it comes from treasure and bosses. |
| Quarry fists | arms | Attack 1.5 | spells with earth knock back 60% harder |
| Splitting arms | arms | Fire 1 | a Fireball's blast throws three small fireballs (55% blast, 40% damage) |
| Thrifty arms | arms | Focus 1 | every fourth Shot costs no mana |
| Mire arms | arms | Earth 1, Water 0.5 | each Burst turns the ground within 20 to mud |
| Spring legs | legs | Speed 1 | jump 30% faster (higher) |
| Anchor legs | legs | Defence 2 | a quarter of the knockback |
| Swift legs | legs | Speed 1.5 | every dash (Blink, Flame dash, Surf, Shoulder charge, Vanish, Arc dash, Blast dash) costs half |
| Diver legs | legs | Water 1 | no water drag, swim up fast (160), mud never slows you |

Speed is +5% run speed a point. **Drops:** 14% of kills, every elite, two Epic or better from bosses; grade odds rise with the level (Epic 3% + 2% a level up to 20%, Rare 18% + 4% a level up to 45%). Stones fall, rest on the ground (a small stone in its grade's colour, glowing, gold dot on the map), float up through water and magma (so none is lost at the bottom of a lake), are saved while they lie there, and are picked up by touch into a **bag of 24**. At a Lodestone's **Runestones** tab: equip (the worn one goes back to the bag), take off, or **break** a stone into shards ((3 + 2 × level) × 1, 2.5, 6 or 15 by grade), spent at Lodestones (see Treasure).

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
| **Delver** (13 × 9) | 70 · 12 · 9 | starts on a chamber floor and dives into the dirt (above ground it walks, never floats); inside dirt it swims at 48 with no collision (shown faint, throwing crumbs) towards a spot under the ground 26 to your side; feels you within 150 without sight; **bursts out** (digs a hole), winds up 0.4 s, leaps at you (power 22); then dives back into the nearest dirt after 1.6 s on it | water ×1.6, earth ×0.4 | 0.35 / 0.35 / 0.3, from 2 |
| **Cinder spitter** (11 × 10) | 55 · 10 · 10 | set into a chamber wall facing in; looks from its mouth (sight 190); every 2.4 s, **its mouth glows for 0.5 s**, then it lobs a magma glob on an arc aimed to land on you (power 14, 10 magma cells). If its wall is dug away it falls and keeps spitting. | fire ×0, water ×1.8, lightning ×1.1 | 0.15 / 0.1 / 0.7, from 1 |
| **Slate warden** (17 × 16) | 170 · 14 · 18 | walks at 22, jumps low walls; close (30), **raises its shoulders for 0.9 s**, then slams: power 30 (less towards the edge) within 30, knock 260 up; 1.1 s to recover. Only a hit of 40+ during its wind-up cancels the slam. | fire ×0.4, lightning ×0.4, earth ×1.6, water ×1.3 | 0.15 / 0.25 / 0.25, from 3; one per chamber |

**Elites:** 8% of enemies from level 2: ×1.8 health, ×1.3 attack, gold eyes and a gold glow, a gold health bar; always drop a runestone and give triple experience. Experience per kill also scales by kind (warden ×2.5, delver ×1.3, spitter ×1.2).

### More kinds by region (v0.40, `KData.remix`, `game.kindFor`)

The cave's generator still places only the five original kinds, so the cave and saves are unchanged. When the game builds its enemies, some crawler and moth homes hold a different creature, chosen from the home's number and the seed (not the random stream): Rose Hollows crawlers become **Shard slingers** (level 2+, 30%); Drowned Galleries crawlers become **Mirehoppers** (level 2+, 45%) or slingers (level 3+, 15%) and moths become **Stormwisps** (level 3+, 50%); Ember Veins crawlers become **Cinder imps** (level 2+, 40%) or slingers (18%); moths elsewhere become wisps from level 4 (25%). Champion homes never change. Tablets are still placed from the original crawler and warden homes.

| Kind | Health · attack · defence | What it does | Weak / strong |
|---|---|---|---|
| **Shard slinger** (11 × 12) | 44 · 10 · 6 | keeps 60 to 115 away (backs off if you close in, never off a ledge); raises its arm 0.6 s, then lobs a shard on an arc (speed 165, power 16) every 2.3 s, leading you slightly | fire ×1.4, earth ×0.6 |
| **Stormwisp** (9 × 9, flies) | 30 · 11 · 5 | hovers about 86 to one side; takes aim along a line you can see for 0.8 s (it does not track you), then fires lightning down it (power 18, reach 210, 7 either side of the line) every 2.8 s | earth ×1.7, water ×1.2, lightning ×0.3 |
| **Mirehopper** (13 × 8) | 50 · 10 · 7 | rests 0.6 s, crouches 0.35 s, leaps at you (contact power 16) and spatters 8 mud where it lands | lightning ×1.5, fire ×1.2, water ×0.5 |
| **Cinder imp** (9 × 10) | 26 · 12 · 4 | runs at 84 and hops steps; within 17 it flares 0.55 s and bursts (power 30 falling to 15 at radius 26, leaves fire). It dies either way and gives its experience only if you kill it | water ×1.9, fire ×0 |

**Slate warden, new in v0.40:** between 55 and 190 away with a clear view it raises a boulder for 0.7 s and throws it on an arc (power 22) about every 3.4 s; after its slam a wave runs out along the floor both ways (speed 150 for 0.6 s, power 15) and hits a golem standing on the ground: jump it.

Creatures' thrown rocks and blobs no longer hurt other creatures.

**Calm after a rest (v0.40):** rising after death, resting and travelling give `p.calmT` 5 s. While every living player is calm, no enemy notices them unless that enemy was hurt in the last 2 s; casting ends the calm. Resting or dying also sends home every living enemy that was aware of you in the last 12 s, so nothing that was chasing you is waiting at the Lodestone.

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

**Rewards:** experience (15 × a crawler of its level), shards (40 × level), two runestones straight into the bag (dropped beside you only if the bag is full) (the Crucible at Legendary if you have none, otherwise a Legendary; plus an Epic or Legendary), and the **Ember core**. Defeated bosses and claimed cores are saved; it does not return.

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


## Recipes (v0.21): how elements become spells

Jaisah's direction: typing combinations from memory is the skill (as in Magicka), but with no fixed number of slots, so it is not a copy of Magicka's five. **Mana is the limit.**

- **You type elements into a recipe**, up to 7 (`KData.recipe.max`; a practical cap, about what can be memorised). C or Z takes off the last one, X clears. **The recipe stays loaded** after casting: mana, not retyping, stops you repeating a big spell. **Once a recipe has been cast, or tried without enough mana, the next element you type starts a new recipe** (`p.used`), so you never have to clear first and cannot get stuck with a full recipe you cannot afford (Jaisah, v0.22). C after a cast still only takes off the last element, to adjust the same recipe. **Trying a spell that costs more than your whole mana bar clears the recipe at once** (`game.tooBig`, v0.23): you could never cast it. If you are only short for the moment, it stays loaded so you can cast it when the bar refills.
- **The first element is the form**: what each way of casting makes. The four forms are the old same-element pairs (Fire: Fireball, Fire nova, Flame jet, Flame dash; Water: Water jet, Tidal wave, Water jet, Surf; Earth: Boulder, Stone shell, Stone steps, Shoulder charge; Lightning: Bolt, Shock field, Spark hops, Blink). One element alone casts a "Lesser" form (80% size, 71% power, 57% cost).
- **Every element after it is a modifier, in any order.**
  - The form's own element again: bigger (+20% size per copy, at most ×2).
  - A different element adds its property to Shots and Bursts. **Fire**: what is hit burns (2 s, +1 s per extra copy) and flames scatter where it lands. **Water**: soaks (wet) and splashes water where it lands. **Earth**: +30% knockback per copy, digs where it lands and throws rubble. **Lightning**: jumps to one more enemy per copy (within 46) for half the damage, and electrifies water where it lands.
  - On Lifts: fire +12% thrust or jump, water −12% cost, earth 15% less damage taken while lifting (at most 45%), lightning +15% sideways speed. On Moves: fire +25% power and a fire trail, water +20% distance, earth digs, lightning +12% speed.
- **Some first-then-modifier pairs are a hand-made spell** (`KData.recipe.owner`), using up one copy of that modifier: the old mixed-pair spells. Shots: Earth→Fire Magma, Earth→Water Mud, Earth→Lightning Stone spear, Lightning→Water Arc, Lightning→Fire Ember lance, Water→Fire Scald. Bursts: Fire→Water Steam cloud, Earth→Fire Eruption, Earth→Water Mire, Lightning→Water Storm, Earth→Lightning Spikes, Fire→Lightning Flare. Lifts: Fire→Water Steam flight, Earth→Fire Ember steps, Earth→Water Mud tower, Lightning→Water Storm glide, Lightning→Earth Magnet float, Fire→Lightning Plasma thrust. Moves: Fire→Water Vanish, Earth→Fire Magma slam, Earth→Water Wall climb, Lightning→Water Arc dash, Earth→Lightning Drill, Fire→Lightning Blast dash. The other order is the form plus the property (Fire→Earth is a Heavy Fireball). So order matters only for which element is first.
- **Cost rises faster than power.** Each element after the second multiplies cost by 1.75 (Lifts and Moves 1.4) and power by 1.4. A Fireball recipe costs 8, 14, 25, 43, 75, 131, 230 for 1 to 7 elements, for 0.7, 1, 1.4, 2, 2.7, 3.8, 5.4 times the power. Short recipes are the efficient spells; long ones are bursts that need a big mana bar. Damage uses the average element power and enemy affinity over the whole recipe.
- **The HUD** shows a dot per element, then each way of casting with its cost (dimmed and red when you cannot afford it). The golem's two colours are the form and its strongest modifier.
- The spell book lists all 16 two-element recipes and what each element adds.

### Special spells (`KData.specials`, `game.castSpecial`)

**Where aimed ones land (v0.30, `game.specialTarget`):** at your pointer, no further than the spell's range, and not through walls: if a wall is in the way it lands just in front of it. Geyser, Meteor and Cataclysm then drop to the ground below that point; Thunderstorm stays at the point. Phase goes through walls: to the pointer, or the nearest open spot to it back along the line, up to 72 away. While such a spell is loaded and affordable a gold dotted ring its size shows the landing place. Input now carries the pointer's distance (`aimDist`; a controller's right stick gives 30 to 160).

An exact sequence, order and all. While the recipe matches **and your mana bar could hold its cost**, the Shot becomes the special spell (gold in the HUD); with too small a bar nothing shows that it exists. Learned from **tomes** (25% of relic caches teach one of the three cheapest you do not know, each champion teaches one, and the Emberwyrm teaches Cataclysm) or by typing one; known ones are listed in the spell book with their sequence and saved.

**Twenty-six spells in five circles (v0.31).** A spell's circle is its length: three elements for the first circle up to seven for the fifth, and the cost rises with it (25 to 35, 50 to 60, 80 to 110, 150 to 180, 240 to 300 mana). The spell book lists them by circle; an unknown one shows only how many elements it has.

**How they are found.** A relic cache teaches one 40% of the time, a **rune tablet** always does, each champion teaches one, and the Emberwyrm teaches Cataclysm. What a find can teach depends on its level (`KData.treasure.tierFor`): levels 1 to 2 the first circle, 3 to 4 up to the second, 5 to 6 the third, 7 the fourth, 8 the fifth. Caches teach the lowest circle you have not finished; tablets and champions (up to the fourth circle) the highest they can. Typing a sequence yourself always works if your mana bar can hold it.

**Rune tablets** (`game.makeTablets`, `tabletsTick`): nine standing slabs with glowing teal runes, at least 300 apart, placed from the seed where crawlers and wardens live (level 2 and up; the three deepest spots are tried first, so every cave has tablets that can teach the highest circles; nine on each of five seeds checked) without touching the cave's own generation. Touch one to learn a spell; if it has nothing left to teach it gives 20 shards a level. Read tablets are saved; teal dots mark unread ones on the maps.

**Effects that last** run in `game.updateStorms` (storms, the firewall, rain, the pull, rings of fire, sanctuaries, showers of meteors and boulders) and as timers on the golem (Haste, Stoneskin, Mend, Prism, Titan, Phoenix), shown as chips above the cockpit. Stillness stops `enemyTick` and `bossTick` for its 6 seconds.

| Circle | Spell | Sequence | Mana | What it does |
|---|---|---|---|---|
| 1 | Geyser | Water Fire Water | 32 | Boiling water bursts from the ground under your pointer, throwing enemies into the air. |
| 1 | Haste | Fire Lightning Fire | 30 | For 8 seconds you run half again as fast and jump higher. |
| 1 | Phase | Lightning Earth Lightning | 30 | Step through walls: you appear at your pointer, or the nearest open spot to it along the way. |
| 1 | Mend | Water Earth Water | 35 | Wet clay seals your cracks: you regain 35% of your health over 4 seconds. |
| 1 | Lantern | Lightning Fire Lightning | 25 | A flash lights the cave far around you and draws it onto your map. |
| 1 | Bridge | Earth Water Earth | 30 | A span of packed earth grows from your feet towards your pointer, over gaps, water and magma. |
| 2 | Meteor | Earth Fire Earth Fire | 55 | A burning rock falls from above onto the ground under your pointer. |
| 2 | Quake | Earth Earth Earth Water | 50 | The ground heaves: everything near you is hurt, thrown and slowed, and rubble falls from the roof. |
| 2 | Chain lightning | Lightning Lightning Water Lightning | 60 | A bolt that leaps from enemy to enemy, up to eight of them. |
| 2 | Firewall | Fire Earth Fire Fire | 55 | A wall of flame burns on the ground under your pointer for 5 seconds. |
| 2 | Deluge | Water Water Earth Water | 60 | Water pours out of the air at your pointer for 3 seconds: enough to drown a fire, fill a pit or cool a pool of magma. |
| 2 | Lodestone pull | Lightning Earth Earth Lightning | 55 | For 3 seconds everything near your pointer is dragged to it and crushed together. |
| 3 | Stoneskin | Earth Earth Lightning Earth Earth | 80 | For 10 seconds you take 60% less damage. |
| 3 | Thunderstorm | Water Water Lightning Water Lightning | 90 | A storm hangs at your pointer for 6 seconds: rain soaks everything under it and lightning strikes again and again. |
| 3 | Inferno | Fire Fire Lightning Fire Fire | 100 | Three rings of fire burst out from you, each wider than the last. |
| 3 | Sanctuary | Water Earth Lightning Earth Water | 110 | A circle of calm where you stand for 8 seconds: inside it you mend quickly and enemies are slowed. |
| 3 | Tunnel | Earth Lightning Earth Lightning Earth | 85 | Bores a wide tunnel through dirt towards your pointer, and hurts whatever is in the way. |
| 3 | Prism | Lightning Water Fire Earth Lightning | 90 | All four elements in balance: for 10 seconds every spell costs half. |
| 4 | Avalanche | Earth Earth Water Earth Earth Earth | 150 | Nine boulders drop from the roof across the ground around your pointer, smashing through dirt. |
| 4 | Maelstrom | Water Lightning Water Lightning Water Lightning | 170 | A storm that follows you for 12 seconds, wider and faster than a Thunderstorm. |
| 4 | Phoenix | Fire Water Fire Water Fire Fire | 160 | For 60 seconds, a blow that would break you instead restores half your health in a burst of flame. Once. |
| 4 | Titan | Earth Fire Earth Lightning Earth Earth | 180 | For 15 seconds your spells hit 60% harder, blows barely move you and you take a quarter less damage. |
| 5 | Cataclysm | Fire Earth Fire Earth Lightning Fire Earth | 240 | Nine great meteors rain down around the ground under your pointer. |
| 5 | Judgement | Lightning Lightning Fire Lightning Lightning Fire Lightning | 280 | One colossal bolt from above onto the ground under your pointer. What survives the strike is hit again by the lightning that leaps from it. |
| 5 | Worldbreaker | Earth Earth Lightning Earth Fire Earth Earth | 300 | The cave itself breaks: everything far around you is hurt, hurled and slowed, and the dirt near you is torn open. |
| 5 | Stillness | Lightning Water Lightning Earth Lightning Water Lightning | 300 | For 6 seconds every creature in the cave is frozen in place, bosses too. You are not. |

## Balance pass (v0.24)

Measured with a bot holding each recipe on a target for 10 s (damage a second, mana a second, damage per mana, dirt dug a second; scratchpad `a1.js`, `a2.js`). What it showed and what changed. **Where these numbers differ from the tables further down, these are the current ones** (`data.js` is always the truth).

- **Fireball was the best damage and by far the best digger** (321 cells a second; Boulder 5). Now: Fireball power 34 (was 40), blast radius 7 (was 9), and it digs 78% of its blast radius. Boulder power 44 (was 32), digs radius 8 (was 3), leaves 10 rubble (was 18). Dug per second now: Boulder about 190, Stone spear 140, Fireball 140. Earth digs, fire burns.
- **Explosions no longer delete magma** (only water cools it). A bot could blast the Emberwyrm's lake away.
- **Bursts gave a third of a Shot's damage per mana.** Costs down about 20% and power up about 30%: Fire nova 20 mana / power 34, Tidal wave 18 / 16, Stone shell 16, Shock field 20 / 34, Steam cloud 16 / 20, Eruption 22 / 32, Mire 16, Storm 22 / 28, Spikes 20 / 38, Flare 20 / 38. Bursts now give about 1.3 to 2 damage per mana against one target (Shots 2.5 to 3.1) and hit everything around you.
- **Bolt** power 34, cost 14 (was 30, 16). **Arc** 22, cost 16. **Ember lance** 28. **Scald** 40 a second. **Water jet** now does a little damage (22 a second if every drop hits) on top of pushing and soaking.
- **One element alone was the most efficient spell.** It now gives 65% of the power for 65% of the cost (was 71% for 57%).
- **A longer recipe is visibly bigger.** Every modifier adds 7% size (the form's own element still 20%, at most ×2.2), and projectiles, bolts and beams are drawn 30% bigger per element after the second (`sp.vis`), with a fleck of the strongest modifier's colour circling a projectile (`sp.tint`).
- Runestone drop chance 10% (was 14%): the cave has three times the enemies.

## The larger cave (v0.24)

Jaisah: this should take hours, not thirty minutes, and levelling must not run ahead of the game.

- **The cave is 3072 × 1536** (was 2048 × 1024), with 104 chambers (was 46), 15 Lodestones (was 8), a level every 200 cells from the hub (was 250). Over five seeds: about 210 to 250 enemies of level 1 to 8, about 40 relic caches, generated in 0.7 to 1.7 s. Saves moved to `castinstone.save.v2`; older saves do not fit the new cave and are not loaded.
- **Enemies come back only when you rest at a Lodestone or die** (`game.reviveEnemies`; they used to return after 25 s). A cleared tunnel stays cleared until you choose to rest, and experience cannot be farmed by standing still.
- **Pace:** a full clear gives about 8,500 experience from kills and 5,000 from caches, which is about level 11. The enemies of each ring of the cave are worth about one level, so your level tracks the level of the area you are in.
- **The Emberwyrm's arena** is 370 wide and about 95 tall above the lake (was 210 × 58, less than one screen), with ten ledges, at least 750 from the hub (level 5 to 7; its health scales with that, about 2,000 to 2,500). A bot standing still with Bolt at level 6 needs 95 to 150 s.

## Champions (v0.25, `KData.champions`, `game.makeChampions`)

The highest-level Slate warden, Glowmoth and Delver in the cave (at least 500 apart) become **The Slate Colossus**, **The Lantern Queen** and **Deepjaw**: drawn at twice the size (hit box ×1.8), with 4, 20 and 10 times an ordinary one's health (about 2,000 to 2,300 at level 7 to 8), ×1.25 attack and gold eyes. They use the same behaviour as their kind. Their health shows in the bar at the top once they notice you. Each gives 8 times the experience, 30 × level shards, a Legendary runestone and a tome, and **never returns** (saved as `champ:<kind>` in `defeated`). The Colossus gets a space cleared to stand in. A test bot at level 8 beats each in about a minute. Pink dots mark them on the maps once seen.

## Maps (v0.25)

The corner map shows the cave around you at 6 cells a pixel (the whole 3072-wide cave would be 24 cells a pixel there). **Tab**, or a click on it, opens the full map of the explored cave at 4 cells a pixel (`#mapWrap`, mode `map`, pauses), with Lodestones, relic caches and loose runestones, crystal, the lair, champions and you.

## Elements and spells

*(The tables below give each hand-made spell's numbers. Since v0.21 a pair here means "first element, then modifier" as listed under Recipes; same-element pairs are the forms.)*

Every recipe gives **four spells**, one per way of casting:

| Mode | Input | Job in combat |
|---|---|---|
| **Shot** | left click (hold to repeat), RT | aimed at the cursor; ranged pressure; cheapest |
| **Burst** | right click, LT | an area around you; close-range defence; costs more, longer cooldown |
| **Lift** | hold Space in the air, LB | carries you up or across; each pair lifts its own way (below) |
| **Move** | Shift (tap; hold for held Moves), RB | dashes and other moves: Blink, the dashes, Drill go the way you press (A/D) or the way the golem faces; Magma slam goes down; Wall climb climbs |

### Lift: holding Space (v0.20)

Space is jump. **Keep holding it in the air and the loaded pair lifts you.** It starts when a held jump reaches its top (so a full jump is still just a jump, and a tap never costs mana) or when you press Space while already in the air (falling off a ledge). It stops when you let go, land (except Mud tower), enter water (Space swims there), or run out of mana. Lifts never hurt you, and A/D steer all of them. The logic (Jaisah: "why an explosion under our feet? Why not a jet of flames? Steam should give the most thrust, but other elements should lift too, with different characteristics"):

- **Fire thrusts**: fast and strong, but expensive. **Water is slow and cheap**: it lasts longest. **Earth builds**: it leaves terrain behind that you can use again. **Lightning is about speed sideways**: hops, glides and floating rather than climbing.
- A pair mixes its two elements' characters, and **steam (fire + water) is the strongest lift**.

| Pair | Lift | How it behaves (measured in open air from a full 100 mana) |
|---|---|---|
| Fire + Fire | **Flame jet** 22/s | fire roars down from your feet: up to 125/s, burns enemies within 34 below you (22 a second) and leaves fire under you; about 5.8 s, about 690 up |
| Water + Water | **Water jet** 8/s | slow rise at 48/s on jets of water, soaks what is below; about 12 s, the longest |
| Earth + Earth | **Earth spray** 11 a second | a spray of loose earth from the feet lifts you at 62 (water is 48); two cells of earth a step land below and stays as a heap. Push down to sink |
| Lightning + Lightning | **Spark hops** 14 a hop | up to 3 extra jumps before you land, each throwing you 125 sideways if you press A/D and shocking what is under you (power 14) |
| Fire + Water | **Steam flight** 16/s | steam blasts straight down: the strongest lift, up to 155/s; about 6.2 s, about 920 up |
| Earth + Fire | **Cinder spray** 15 a second | Earth spray, hot: rises at 80, leaves some fire below and burns what is under you (30 a second within 40) |
| Earth + Water | **Mud tower** 9/s | a 9-wide column of packed mud (dirt) grows under you and carries you up at 50/s; it stays as a pillar. About 11 s |
| Lightning + Water | **Storm glide** 6/s | you fall at most 32/s and move 125 sideways; lightning strikes the nearest enemy below within 60 every 0.5 s (power 12). It cannot climb: jump off something high |
| Earth + Lightning | **Magnet float** 9/s | you float about 26 above whatever is below (ground, water or magma) and move 120 sideways; over a deep drop you sink at 60/s. About 11 s. Crosses lakes and magma |
| Fire + Lightning | **Plasma thrust** 26/s | up to 115/s straight up, or with A/D 175 sideways while rising only 52/s: the fastest across, the costliest (about 3.8 s) |

Shift Moves that only went up (Rocket jump, Hover, Pillar, Steam flight) became dashes in v0.20, so going up belongs to Lift and moving across to Move: **Flame dash** (fire+fire: 290 for 0.13 s, power 18, a trail of fire), **Surf** (water+water: 230 for 0.24 s, power 8 and soaking, a trail of water), **Shoulder charge** (earth+earth: 220 for 0.22 s, power 30, digs radius 8 ahead), **Vanish** (fire+water: 300 for 0.12 s, power 10, leaves a steam cloud of radius 16). All cost 16–20 and recast after 0.35–0.5 s; Swift legs halves every dash. Tidal core makes Steam flight, Flame jet, Plasma thrust, Water jet and Storm glide free near water.

**Moves have their own key, Shift; holding Space lifts** (v0.18 split Moves off Space because jumping set off a Rocket jump blast under you; v0.20 gave Space its own Lift per pair). Moves work from the ground too. **Your own Lifts, Moves and Bursts never hurt you:** they exclude you from their blasts, and for 0.8 s after casting one (and while lifting or holding a held Move) fire and magma do not burn you; Magma slam splashes its magma to either side, and Eruption throws its magma away from you. Aimed Shots can still hurt you point-blank. A third element pushes out the first; slots stay loaded after a cast. **Every mode repeats while held** until mana runs out (Jaisah: mana is the limit, not cooldowns). Held spells (Water jet, Scald, the flying Lifts, Wall climb, Drill) drain mana while held; the rest cost a set amount and recast after a short gap (Bursts 0.4–0.5 s). **Moves and Lifts never look at the mouse:** Lifts go up or glide and A/D steer; Wall climb goes up (S slides down); Magma slam goes down; Blink, the dashes and Drill go the way you press, or the way the golem faces when nothing is pressed (Jaisah: leave those as they are). **Mud blocks spells:** shots, bolts, beams and the spear stop at mud like at solid ground (you can still wade through it). Each spell has its own cooldown (`key:mode`). A Shot or Burst is followed by a 0.12 s lock on Shots and Bursts. One spell of each mode can run at once (you can fly and shoot). Every cast alerts enemies within 110. All numbers live in `KData.spells`; power is base damage before stats.

| Pair | Shot | Burst | Move (Shift) |
|---|---|---|---|
| Fire + Fire | **Fireball** 14 mana: 230/s, gravity 70, blast radius 9 (digs, fire on the rim), power 40, knock 210, cd 0.5 | **Fire nova** 26: power 26 within 24, knock 220, ring of fire; cd 0.4 | **Flame dash** 18 (see Lift above) |
| Water + Water | **Water jet** 14/s held: 3 particles a step, pushes | **Tidal wave** 24: 56 water particles both ways; enemies within 42 sideways shoved 320, power 10; cd 0.4 | **Surf** 16 (see Lift above) |
| Earth + Earth | **Boulder** 16: lobbed 200/s, gravity 380, power 32, knock 300, digs radius 3, leaves 18 loose earth; cd 0.7 | **Stone shell** 24: a 2-thick ring of dirt at radius 14, pushes enemies out; cd 0.5 | **Shoulder charge** 20 (see Lift above) |
| Lightning + Lightning | **Bolt** 16: instant, range 170, power 30, chains once within 16, electrifies water; cd 0.55 | **Shock field** 26: power 28 to all within 34, electrifies nearby water; cd 0.4 | **Blink** 20: teleport up to 36 in the pressed direction (default facing) to the furthest free spot; cd 0.5 |
| Fire + Water | **Scald** 20/s held: steam cone, range 34, ±0.45 rad, power 32 a second | **Steam cloud** 20: steam fills radius 24 (60%), power 14 inside; cd 0.4 | **Vanish** 18 (see Lift above) |
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
| Jump, swim up; hold in the air to Lift | Space (or up arrow) | LB |
| Aim | Mouse | Right stick (or the left stick's direction) |
| Take off the last element / clear the recipe | C or Z / X | d-pad down / View |
| Add Fire / Water / Lightning / Earth to the recipe | **Q / W / E / S** (or 1–4: fire, water, earth, lightning) | B / X / Y / A |
| Shot | Left click (hold repeats) | RT |
| Burst | Right click (hold repeats) | LT |
| Move | **Shift**: tap for one-shot Moves, hold for held ones | RB |
| Clear the elements | X | View |
| Rest at a Lodestone | **R** | d-pad up |
| Full screen | **F** | |
| Spell book, pause | H, Esc or P | Menu |
| Sound on or off | M | — |
| Reset the map | Backspace | — |

The last device used takes over. Touch controls are not built yet. (Jaisah, v0.18: W no longer jumps; Q W E S load the elements.)

## Co-op (v0.42, `net.js`, `dmath.js`)

Two players, online, in the host's cave. Each keeps their own golem: a guest's level, runestones, spells and shards come from their own save and go back to it (`KSave.storeGuest`); the cave, its Lodestones found, caches, tablets, champions and boss belong to the host's save.

- **How the two devices stay the same.** Each device runs the whole game. During play they send each other only button presses, one message per step. A press is used `delay` steps later (2 to 9, set from the measured round trip; 3 on a good connection, which is 50 ms), and a step runs only when both players' presses for it are there, so a slow device or connection slows both rather than splitting them. Every 120 steps both work out `game.checksum()` and compare; a mismatch makes the host send the cave again (at most 5 times in 2 minutes, then co-op stops).
- **Same answers everywhere.** The rules use seeded dice and `KMath` (dmath.js): sin, cos, atan2, exp, pow, log and hypot built from exact operations, because each browser's own versions differ in the last digit. Never use `Math.random`, the clock, or `sort` with a random comparison in world.js, recipe.js or game.js. (That last one was a real fault before v0.42: Chrome's sort asks a different number of questions once the page has been open a while, so "New game" and a later reload could build different caves from one seed. The shuffle in world.js replaces it. Saves moved to `castinstone.save.v3` for this.)
- **Starting.** Guest sends its golem (`KSave.packPlayer`). Host stops, sends its save (without chunks), `world.meta()` and one number per chunk (`chunkHashes`). Guest builds the cave from the seed, asks for chunks whose numbers differ (`packChunk`), then both build the same game on that cave (`KSave.restore(save, world)`, `game.addPlayer`, `world.syncStart`).
- **Connecting.** Host waits in mailbox `cis-h-<CODE>` at coop.jza.app (the MORPHOS Worker, unchanged; it accepts jza.app only); the guest leaves an offer there and collects the answer from its own mailbox. Public STUN servers (Cloudflare, Google). `?signal=local` on localhost swaps the mailboxes for localStorage, for tests. `privacy.html` describes all of this and must be kept in step.
- **Rules that differ in co-op:** the game never pauses; with a panel open your golem is `away` (stands still, cannot be hurt). Menu choices (`cis.act`: spend a point, equip, break, forge, travel) travel with the presses as `ui` events and run inside the step on both devices. Each golem has its own checkpoint. Resting or dying returns only enemies more than 420 from the other golem. A kill gives its experience to both golems within 420. A friend's spells do 30% damage. Events carry `p` (the golem they are for) so each screen shows only its own notices.
- **Not done yet:** more than two players, PvP, a marker pointing to an off-screen friend, sharing the map each has explored, choosing a golem look during co-op.

**Home screen:** `icon-180.png` (the Brute golem, also the page's tab icon), `manifest.webmanifest` and the `apple-mobile-web-app-*` tags in `index.html` give the game its icon, the name "Cast in Stone" and a full screen when added to a phone's home screen. On iPhone a home-screen web app keeps its own saves, separate from Safari's.

## Water (v0.53, `WATER` in game.js, `game.splash`)

Jaisah: water physics for the golem, creatures and objects falling into water or moving in it. Before, being in water was on or off: a third of the weight and some drag.

- **How deep you are matters.** Each body knows how much of it is under water (`a.sub`, 0 to 1). The water carries up to 72% of its weight when it is fully under (`lift`), and drag grows the same way (`dragX` 2.5, `dragY` 3 a second).
- **Going in.** The surface takes most of a fall: downward speed is cut to 45% on entry. A splash throws up to 14 drops from the surface (real water cells lifted out and falling back, so none is made or lost), a ripple spreads, and it is heard; the size follows the speed. Coming out makes a smaller one.
- **What floats and what sinks** (`float` on each creature): the golem is stone and sinks slowly, as before; hold jump to swim up, push down to dive. Mirehoppers (1), lashers (0.8), cinder imps (0.6), shades (0.5) and slingers (0.3) float: they rise until part of them is out of the water and bob there. Wardens, rootboars (−0.3) and urchins (−0.2) are heavy and sink faster. Training dummies float.
- **In the water.** Creatures off the bottom paddle after what they are chasing (22 a second; a mirehopper 70). Anything moving under water leaves a wake, and a body fully under lets out a bubble now and then. Water snuffs a cinder imp (40 damage a second).
- **Objects.** Boulders, blobs and shards splash where they enter and are slowed (`shotDrag` 4 a second); a spent shard sinks. Fireballs are still put out. Runestones still float, and now splash.
- Checked with scratchpad `wt.js`: a golem dropped 120 cells entered at 330, left the surface at 152 and settled on the bed; 4 s of jump brought it back to the top; water cells before and after 18,090 and 18,090; mirehopper floating 61% under, crawler and warden on the bed, imp dead.

## Act 3: the Root of the World (v0.52)

Levels 17 to 24. Regions: **Verdant Hollow** (green, mossy, some water and mud), **Bone Orchard** (pale stone, dry), **Heartwood** (deep red, magma).

| Kind | Health · attack · defence (level 1 base) | What it does | Weak / strong |
|---|---|---|---|
| **Rootboar** (15 × 9) | 110 · 13 · 9 | paws the ground 0.6 s, then charges at 230 until it hits something (power 24); a wall dazes it for 1.4 s and it knocks a hole in dirt | lightning ×1.5, earth ×0.6 |
| **Bloomwisp** (9 × 9, flies) | 60 · 8 · 4 | harmless; keeps 115 away and mends the most hurt creature within 115 by 6% of its health a second along a green thread (champions a quarter of that) | fire ×1.7, water ×0.6 |
| **Lasher** (9 × 13) | 95 · 13 · 8 | barely moves; within 100 it rears 0.5 s, then drags you towards it for up to 1.1 s and bites if you arrive (power 24). Breaking its line of sight ends the pull | fire ×1.5, water ×0.7 |

Geodes, delvers and wardens also live here.

- Champions: **The Tusk** (Stampede: three charges back and forth, five when hurt), **The Strangler** (Thrash: four vine strikes along lines shown first, six when hurt), **The Gardener** (a Bloomwisp that shoots; Bloom: it gathers itself for 2.6 s, mending 14% of its health, then bursts within 70, unless you take 5% of its health off it first, which breaks the bloom and leaves it dazed for 3 s).
- **The Heartroot** (`heartTick`, `KData.bosses.heartroot`): hangs over its lake, shut, and shut it takes 30% of any damage. Three attacks in turn, each shown first. *Seeds:* four lobbed to burst round you. *Lash:* a line across the whole lair at your height, then the vine strikes along it: jump it or be elsewhere (twice, three times when hurt). *Pulse:* a ring (95) shows, then everyone inside is thrown away from it. After each attack it opens for 2.4 s and takes full damage. Fire hurts it most. Its fall gives the Heartseed (+40 mana) and the best special spell you do not know.
- After the third act the three come round again, eight levels higher each time.

## Balance by bot, and the second cave's champions (v0.50)

Measured with scratchpad `bal.js`: a simple bot at the creature's own level (points spread 40% attack, 30% mana, 30% vitality, no runestones) in an open room keeps 45 to 120 away, jumps on a wind-up and casts a two-element shot. With Lightning, Lightning (which lands at once) it now kills ordinary creatures in 2 to 6 s (they were 1 to 4 s, so several had their health raised about 40%: crawler 85, moth 50, slinger 62, wisp 42, mirehopper 70, imp 36, shade 74, wraith 68), a warden in about 30 s, and champions in 36 to 82 s. An open room flatters the bot; the caves are harder.

- **An opening after every champion's attack** (`sig.open`, 1.5 to 2.6 s): it stands or hangs still, and Deepjaw stays above ground. This is the moment to hit it.
- **The second cave's champions have attacks of their own.** The Mirror: Reflections, it steps out of the air three times in a row (five when hurt), slashing each time. The Thousand Spines: Spiral, three volleys of twelve spines (five when hurt), each turned a little. The Pale Regent: Ash bloom, a ring of embers shows its reach (60), then everything inside burns; it also flies nearly twice as fast as a wraith.
- Champion health multipliers lowered now that the base health is higher (moth 14, delver 9, shade 8, urchin 6, wraith 10). Deepjaw's eruption does 26 (was 32).
- Urchin spines reach 100 (was 120) every 3 s; geode shards are a little slower and weaker.
- The Hollow King was redrawn as a crowned skull in a robe.
- **First minutes:** until a first golem has cast a spell, the line under the map says how to cast on the device in use ("Shape a spell").
- **v0.51:** Bolt (Lightning, Lightning) does 27 (was 34): it lands at once and cannot miss, so it should not hit as hard as a Fireball that can. The second cave no longer has any of the first cave's crawlers, moths or spitters (all become shades, urchins, wraiths and geodes); delvers and wardens live in both. About half the old moth homes hold wraiths, since something that passes through walls should not be everywhere.

## Acts: the second cave (v0.48, `KData.acts`)

Jaisah: beating the Emberwyrm should lead to a second phase that is not the first one recycled: new areas, new enemy types, a new boss.

The game is now a list of acts (`KData.acts`). Each cave you descend to is the next act: its own three regions, creatures, champions and last boss. `game.act = depth % acts.length`; past the last act they come round again, eight levels higher each time. A cave is built with its act (`new World(seed, lift, act)`, `world.biomes`), and co-op sends it.

**Act 1, The Waking Cave** (levels 1 to 8): Rose Hollows, Drowned Galleries, Ember Veins; the Slate Colossus, the Lantern Queen, Deepjaw; the Emberwyrm.

**Act 2, The Sunless Deep** (levels 9 to 16):
- Regions: **Glass Warrens** (pale blue stone, dry), **Sunless Sea** (near-black, much more water, mud), **Ashen Maw** (grey ash, more magma).
- Creatures (the generator still places its five kinds; `acts[1].remix` turns most of them into these):

| Kind | Health · attack · defence (level 1 base) | What it does | Weak / strong |
|---|---|---|---|
| **Shade** (9 × 13) | 46 · 13 · 6 | every 3.2 s fades for 0.5 s and steps out of the air behind you (a shimmer shows where), then slashes (power 20) | fire ×1.4, earth ×0.7 |
| **Glass urchin** (11 × 9) | 70 · 11 · 10 | rolls slowly at you; within 75 swells 0.6 s and throws 8 spines all round (power 14, reach 120) every 2.6 s | water ×1.5, earth ×0.5 |
| **Ash wraith** (11 × 11, flies) | 40 · 12 · 4 | drifts straight through rock at 38 and burns on touch (power 18); walls do not stop it | lightning ×1.6, fire ×1.2, earth ×0.4 |
| **Geode** (11 × 11, in a wall) | 60 · 12 · 8 | glows 0.7 s, then fires three shards in a fan (power 15, range 220) every 2.8 s | earth ×1.6, lightning ×0.5 |

- Champions, one per region: **The Mirror** (a shade that blinks nearly twice as often), **The Thousand Spines** (an urchin that throws 16 spines, further and more often), **The Pale Regent** (a faster wraith).
- **The Hollow King** (`kingTick`, `KData.bosses.hollowking`), one level above the cave: hangs in the air over its lake and uses three attacks in turn, each shown first. *Fan:* a glow, then 5 shards in a fan. *Well:* pulls every golem in the lair towards it for 2.2 s inside a ring, then blasts everything in the ring (radius 62). *Rain:* columns of light mark the ground, then lightning falls on them (4 strikes). Below half health: 9 shards twice, a wider ring, 7 strikes, and it moves faster. Lightning hurts it most. Its fall gives the Hollow crown (+40 mana) and Cataclysm.

**Still thin, and said so to Jaisah:** two acts is a few hours, not ten to twenty; the second act's champions are stronger versions of its creatures without attacks of their own; the King's art is a first pass; none of act 2 has been balanced by play.

## Pacing and the seal fights (v0.47)

Jaisah: scrutinise the game, not only lengthen it; mana should open the stronger spells at a sensible rate; the three seals should be three different fights.

**What the numbers showed.** A new golem had 100 mana, and the third circle of special spells costs 80 to 110, so the strong spells were castable from the first minute; the fifth circle (240 to 300) was reachable by level 7 with points alone.

**Changed.**
- Starting mana 60 (was 100) and a Mana stat point gives 6 (was 10). The cave's own gifts are unchanged: +5 a tablet (9), +20 a champion (3), +40 the Ember core. So: recipes of two to four elements (14, 25, 43) and the first circle (25 to 35) from the start; the second circle (50 to 60) straight away with a point or two; the third (80 to 110) around levels 4 to 6 if you favour mana; the fourth (150 to 180) late in the first cave, once champions have fallen; the fifth (240 to 300) and seven-element recipes (230) in the second cave.
- Tomes and tablets teach by the level of where they lie: circle 1 to level 3, 2 to level 6, 3 to level 9, 4 to level 12, 5 beyond (`treasure.tierFor`). The first cave's levels are 1 to 8, so its tomes teach circles 1 to 3; champions give one circle better; the wyrm gives the best of circle 4. Cataclysm is the second cave's prize.
- A deeper cave is 8 levels higher (was 4), so the second cave runs from level 9.
- **One champion per region** (`championHomes`): the Slate Colossus in the Rose Hollows, the Lantern Queen in the Drowned Galleries, Deepjaw in the Ember Veins, each at its region's highest-level floor. The Rose Hollows surround the hub, so the Colossus is low level and the natural first fight.
- **Each has an attack of its own** (`championTick`, `KData.champions.sig`), shown before it lands, used every 7 to 9 s, and larger below 40 to 50% health. Colossus: Rockfall, boulders drop from the roof round you (6, then 10). Lantern Queen: Lantern burst, lightning along lines of light (5, then 8). Deepjaw: Eruption, it bursts up through the floor where you stood and throws rubble (once, then twice).
- The Emberwyrm is one level above anything else in its cave (it was level 5 against level 8 champions).
- Co-op: an arrow at the edge of the screen points to a friend who is out of sight, with the distance (`friendMark`).
- Saves moved to `castinstone.save.v4`.

## Digging on a slope (v0.46, `game.digSlope`, `game.clawDig`)

Jaisah: dig towards the mouse, up or down on an angle; on touch the left stick sets it. Walking into dirt still digs; the tunnel now slopes the way you point. `slope` is cells down per cell forward (negative is up): from the aim with a mouse or right stick, or from how far the run stick is pushed up or down on touch (`tilt` in the action, sent in co-op). Down goes to 45°. Up is limited to `dig.maxUp` 0.35 (about 18°): steeper than that the golem cannot climb the steps it leaves, and it made slower progress in tests. Holding jump still tips the tunnel up. Because the golem is nine cells wide, each stroke also clears over its head (up) or under its feet (down) across its width (`dig.lean`). Measured over 8 s of digging: level 110 across; up 89 across and 29 up; down at 45° aim 111 across and 69 down.

## The goal (v0.45)

Jaisah: it needs to be a proper game with purpose. The cave now has an aim, an ending and a reason to go on.

- **Three seals.** The three champions each hold a seal on the Emberwyrm. While any stands (`game.sealsLeft()`), the wyrm sleeps: entering its lair does not wake it and nothing harms it (a notice says how many champions still stand). Each champion's fall announces a seal breaking.
- **What to do next** is always on screen under the map (`objective` in main.js): "Break the seals · N of 3" with the nearest champion's name, compass direction and region; then "Wake the Emberwyrm" with the lair's direction; then that the cave is won.
- **The ending.** When the Emberwyrm falls, after two seconds the ending page opens (`#endWrap`): level, time in the cave, creatures felled, times crumbled, special spells and Lodestones (`game.played`, `kills`, `deaths`, kept in the save).
- **Deeper caves.** From the ending page, or the Golem tab once the cave is won, "Descend to a deeper cave" builds a new cave at `game.depth + 1`: every level in it is 4 higher per depth (`KData.cave.depthLevels`, `world.lift`), so enemies, the champions, the wyrm and treasure all scale. The golem keeps its level, stats, runestones, spells and shards; the cave's own boons (core, champions, tablets) are earned again. Not offered in co-op.
- The opening text and a first notice state the premise.

## Menus (v0.44)

Jaisah: the menus should be as polished as MORPHOS's and fit the screen without scrolling or being cut off. Each menu (pause, rest, map) is now a full-screen page: one bar across the top holds what it is, its tabs (a pill row), a few facts as chips, and the button that returns to the game; the open tab fills the rest. There is no footer.

- **One layout, enlarged.** Pages are laid out for 1280 × 720 or smaller. On anything bigger the whole page is scaled up as one piece (`--m` = the smaller of width / 1280 and height / 720, never under 1; `transform: scale` on `.shell`), so a large monitor shows the same page, larger. Content keeps to a 1200-wide column.
- **Short screens** (520 px tall or less, a phone on its side): a 50 px bar, tighter rows, descriptions that are not needed dropped (stat descriptions, journey notes). Every tab fits 844 × 390 without scrolling except the two long lists (two-element recipes, special spells), which scroll.
- **Narrow screens:** under 1000 px the rest bar drops the words beside the level gem; under 760 px tabs show only their icon unless open; under 640 px (a phone upright) the bar wraps and each tab becomes one scrolling column.
- **Pages inside a tab** (`.seg` buttons showing one `.segview`): Spell book has Elements, Two elements and Special spells; Controls has Keyboard and mouse, Controller and Touch, and opens on the device in your hands.
- Golem tab: Reset the cave and New game sit at its foot. Runestones: the picked stone's card is beside the golem, not under it. Forge is two columns. The map fills the page with its key beside it.

## Screen shapes (v0.43, `fit` and `fade` in main.js)

The view takes the screen's shape: 16:9 shows 384 × 216 cells (v0.64; 320 × 180 before); wider keeps 216 high and shows up to 768 across; taller keeps 384 across and shows up to 864 high. Nobody sees further for it: the picture is clear to 224 cells from the golem (the corner of a 16:9 view) and black by 290 (`#fade`, a radial gradient that follows the golem). The HUD scales with `--u` (the smaller of width / 1280 and height / 720, between 0.55 and 1.5) and keeps to a 16:9 frame in the middle of the screen (`--hx` each side), except on screens 600 px tall or less, which use the full width. A phone held upright puts the gauges under the map.

## Touch (v0.41, `touch.js`, `KInput.touch`)

A third input device, `'touch'`, taken on any finger press (keyboard, mouse and controller take over as before). `touch.js` builds the on-screen controls in `#touch` (shown only in play) and writes what is held into `KInput.touch`; the game still receives plain actions.

- **Left:** the lower-left 44% × 70% of the screen is the run stick; it appears where the thumb lands. Sideways past 22% runs; up or down past 60% sets `moveY`.
- **Right:** Shot (large, gold) in the corner with Jump, Move and Burst round it; the four elements and the button that takes off the last one fan round those on a second arc (centred on Shot, 2.7 button-widths out, 19° apart). Button width `--t` is 14% of the screen's shorter side, between 46 and 80 px.
- **Aim:** with no finger aiming, the golem aims at the nearest creature within 185 it can see (`autoAim` in main.js), else the way it runs. Pressing Shot and dragging more than 30% of the button's width from its middle aims by hand: drag direction is the aim, drag length sets how far a targeted special lands (36 to 186).
- The cockpit hides the element keys and the four cast plates; the Lodestone notice is tapped to rest.

## Interface (v0.26)

Jaisah: a proper game interface like MORPHOS's, not text in boxes. The look is **carved stone and rune light**: slabs of dark slate with a lit top edge, gold for the light inside runes, a serif for names and titles; the only other strong colours are the four elements, health (clay red) and mana (lilac). Icons are line drawings defined once (`KIcon` in `loot.js`) and placed with `data-icon` or from code. No fonts or images are loaded.

**In play.** The HUD scales with the stage (`--u` = stage width / 1280; text never below 10px).
- **Top left:** the corner map in a stone frame, with the region, the level of the water you are in, and the Tab key. Click or Tab opens the full map.
- **Top right:** four round stone buttons: map, spell book, sound, pause.
- **Top centre:** the boss or champion bar (name in the serif, a segmented bar with diamond ends), then notices as pills with an icon by kind (experience, shards, loot, Lodestone, big news, death).
- **Bottom centre, the cockpit:** the four element keys (round, with the element's icon and its key); **health and mana as liquid in stone-ringed orbs** with the number inside; between them the **recipe as seven carved sockets** (the first, larger one is the form; filled sockets glow in the element's colour; they dim once the recipe has been cast) above **four spell plates** (Shot, Burst, Lift, Move: icon, key, name, mana cost; red when you cannot afford it, gold for a special spell, lilac while a held spell runs); and the **level as a gem with a ring of experience** and a gold badge for unspent points.
- Above the cockpit: the rest prompt at a Lodestone, and timers for Haste and Stoneskin. Bottom left: the note about what is under the mouse.

**Panels** share one shell: a slab with gold corner studs, a header (eyebrow, title, chips for level, Lodestones, special spells, shards), a tab bar with icons, a scrolling body and a footer with one gold primary button.
- **Start and pause:** tabs Golem (the four golems as cards), Spell book (the four forms as element cards, what each element adds as a modifier, the 16 two-element recipes, and special spells as gold cards showing their sequence as sockets), Controls (four cards of key caps). Reset the cave and New game are in the footer; Backspace no longer resets the cave.
- **Map:** the full explored cave in a frame, chips for where you are, Lodestones found and champions beaten, and a key.
- **Rest:** the level gem with its ring, and tabs. **Stats:** a plate per stat with its icon, value, pips for points spent and a gold + button. **Runestones:** the golem with a socket for head, arms, core and legs around it, the bag as a grid of gem tiles coloured by grade, and a card for the stone you pick (Equip, Take off, Break). **Forge:** rows with a shard cost on each button. **Travel:** a card per Lodestone found, with its region's colour, level and distance.

## Menu

The start/pause panel holds the title, the golem picker, a two-column controls list and the buttons (Start or Resume, Spell book, Reset map). The **Spell book** (button, H, or the HUD button) replaces the controls with a 10 × 3 grid of spell names (rows are pairs, columns Shot / Burst / Move); pointing at or focusing a name shows its elements, mode, mana and description underneath (Jaisah: the long list was messy).

## Sound and impact

**Sound** (`audio.js`, `KAudio`): every sound is synthesized with the Web Audio API (oscillators and filtered noise), so there are no sound files. The game reports named sounds with a position (`game.sfx`); they play quieter with distance from the golem (silent beyond 320) and panned left or right. Spells each have a sound by kind (whoosh, crackle, thud, hiss, squelch…); explosions, hits on enemies and on you, crumbling deaths, shards, runestones, caches, level-ups, Lodestones and running out of mana have their own. **Every enemy wind-up has a warning sound** (crawler chitter, moth rising whine, delver rumble, spitter hiss, warden groan) so attacks can be heard as well as seen; the wyrm stirs, gurgles where it will breach, roars as it leaps, and booms when the lake rises. Held spells (Water jet, Scald, Steam flight, Hover, Drill, Wall climb) play a continuous sound while held. Sound starts on the first click or key (browsers require one), and **M** or the HUD's sound button turns it off (remembered, `castinstone.mute`). A compressor on the master keeps big moments from clipping.

**Damage numbers:** a small number in a 3 × 5 pixel font rises and fades from whatever is hit: white on enemies, gold on elites and the boss, red on you. Damage over time (burning, fire, magma, shocks, scald, drill) adds up and shows every 4 points or so.

**Hit-stop:** the game freezes for a moment on heavy blows: 0.045 s when you deal 30 or more, 0.06 s when you take 15 or more, 0.08 s when the wyrm's body hits you, 0.25 s when it dies.

## Music (v0.27, `audio.js`)

Made in code like every other sound: no files. Two pieces that cross-fade over about two seconds (`KAudio.setMood`):
- **The cave** (calm): five open chords of soft sine and triangle notes, about 13 s each with 4.5 s fades so they overlap; a quiet low hum; and single high bell notes like drips every 2 to 7 s, sometimes answered by a second. Everything goes through a 3 s echo made from fading noise.
- **A boss or champion** (ominous; plays while the Emberwyrm is engaged or a champion has noticed you, and you are alive): a low growling drone whose filter slowly opens and closes, held clashing chords, a slow heartbeat drum (a heavy beat, its echo, then two lighter ones), and now and then two bells a semitone apart.

Notes are scheduled 0.4 s ahead on the audio clock and nothing is scheduled while the page is hidden. **N** or the music button turns music off and on (remembered, `castinstone.music`); **M** still silences everything. `KAudio.probe()` reports the faders and the measured level for tests.

## Golem motion (v0.27, `render.js` `golemPose`)

The golem is one sprite, moved in parts by a pixel: the feet (bottom three rows, split down the middle), the arms (outer columns of the lower half) and the upper body. Poses: a four-beat walk whose pace follows its speed, with the opposite arm swinging and a lean into a run; breathing when still (chest, then arms); stretched going up and feet tucked coming down; a squash for 0.12 s on landing; a lean back from a cast; a lean into a dash; braced and shaking while lifting. A part pulled away from the one above it is filled in, so no gaps show. With reduced motion the golem stays a still sprite.

## Hover note

Pointing the mouse at something shows a small note in the bottom-left corner (`#look`, `describe()` in `main.js`): creatures with their health (and your own mana), or the material under the cursor with a one-line description (`desc` in each material; electrified water has its own). Hidden over empty space, with a controller, outside play, and on screens narrow enough to use the compact layout.

- **v0.55:** Jaisah: flying with earth should be a spray of dirt aimed down like water, not a platform. Stone steps and Ember steps (a step of stone under your feet each time you fell) are now Earth spray and Cinder spray, held jets like the Water jet. The step code is gone.

- **v0.61:** health no longer comes back by itself at all (Jaisah: turn off health regen). A Lodestone mends you while you stand by it and fully when you rest; the Mend special spell and anything else that heals still work.

- **v0.63:** on a touch screen the page could zoom in (two thumbs on the controls read as a pinch, or a quick double tap) and could not be zoomed back out. The page now never zooms: the viewport forbids it, `touch-action` is none everywhere except the scrolling parts of menus, and input.js refuses Safari's pinch gesture and two-finger moves, and resets a zoom if one still happens.

## Materials, lighting and a wider view (v0.64)

Jaisah compared the game with Noita: more kinds of material, more to burn and blow up, more detail on screen.

**Seven new materials** (`KData.M`, ids 11 to 17), all through the reaction table in data.js:

| Material | What it is | What it does |
|---|---|---|
| Wood | solid props, posts and planks at chamber mouths and over gaps | cannot be dug by hand; fire, magma or an ember turn it cell by cell into embers, so it burns down over a few seconds; acid eats it; blasts break it |
| Oil | liquid, lighter than water (density 2), so it floats on it | fire, magma or an ember light it (45% a step per touching pair) |
| Marsh gas | gas, permanent (life 255), collects in sealed pockets in the dirt | any flame sets it off; each cell that catches has a 5% chance of a blast (`world.blasts` → `game.blastsTick`: at most 4 a step, radius 6, 16 damage to anything within 15, golems included) |
| Ice | solid | fire, magma and embers melt it into water; steam slowly |
| Coal | solid seams | fire sets it smouldering (8%), embers pass it on (2%) |
| Ember | burning coal or wood: solid, glows, 26 fire damage a second on touch | lasts 170 to 254 steps then is gone (the one solid with a countdown, handled in `world.cell`); throws flame into empty cells beside it; water turns it back to coal |
| Acid | liquid, glows, 26 damage a second on touch | eats dirt, loose earth, mud, wood and lichen, one cell of acid for one cell eaten; water thins it to water |

Where they are: each region has `feat` chances (data.js biomes). Act 1 has wood, coal, oil and gas; act 2 adds ice; act 3 adds acid and more wood. Generation step 10b in world.js places them after the chambers: wood as props, the rest as seams and pockets in the dirt beside chambers (`seam`). `world.explode` leaves liquids and gases alone.

**Lighting.** A new canvas, `#dark`, sits over the cave and under the glow. Each frame it is filled with near-black at the region's `dark` strength (0.57 in the Rose Hollows up to 0.82 in the Sunless Sea), and every light (`render.light`) and the golem's own glow (105 cells, plus 70 towards where it aims) cuts a soft hole in it (`render.carve`). Fire, magma, embers, acid, crystals, caches, Lodestones and spells therefore light the cave around them. Drawing only: it changes no rule.

**Textures.** Wood has grain, ice has facets, oil and acid have a lit top surface, gas is a faint haze, embers flicker.

**View.** A 16:9 screen now shows 384 × 216 cells (was 320 × 180), so everything is 17% smaller and you see 44% more cave. Wider screens show up to 768 across, taller up to 864 high; sight is clear to 224 cells and black by 290. The sand is simulated one chunk further up and down (`World.REACH_Y` 15) to cover it.

Saves moved to `castinstone.save.v5` (the cave is generated differently).

Checked: box tests of every reaction (scratchpad `mt.js`), material counts in all three acts, screenshots of each material and of the darkness, and the usual soak, save, three-act, co-op and performance runs.

## Weak spots (v0.62, `game.onWeakSpot`, `KData.weakSpot`)

Jaisah: add a weak spot, with no markings. An aimed shot that lands on a creature's weak spot does **1.5 times** the damage. Nothing on the creature shows where it is; you learn it. The only signs are the damage number in pale gold and a bright crack over the hit sound.

- **Upright creatures** (warden, slinger, shade, lasher, imp, wraith): the top 38% of the body, the head.
- **Four-footed and burrowing ones** (crawler, delver, rootboar, mirehopper): the front 36%, the way it faces.
- **Everything else** (glowmoth, stormwisp, bloomwisp, urchin, geode, spitter): the middle.
- **Bosses:** the Emberwyrm's head (not its coils); the Hollow King's skull; the Heartroot's core, and only while it is open.
- Champions have the same spot as their kind, twice the size.
- It counts for shots that strike a body directly: Bolt, lances, spears, boulders, blobs, and a fireball that hits the creature itself. Bursts, blasts that land beside a creature, and area spells do not.
- It multiplies with a weakness (a Bolt to a glowmoth's body is 1.6 × 1.5).

## Weak, resist, immune (v0.60)

Nothing on screen said a creature was weak to something unless you hovered it with a mouse. Now the damage number's colour says so, with no words (Jaisah: no words). When a golem's spell hits a creature the number is **green** if the creature takes 1.2 times or more from those elements, **grey** if 0.8 or less, and a **grey 0** when it takes nothing. The measure is the creature's own affinity averaged over the recipe's elements (`game._aff`), before wet, muddy or burning bonuses.

## Stone spear and health regeneration (v0.58)

Jaisah: the Stone spear is too good at digging; and health comes back too easily.

- **Stone spear** bored 90 cells a cast for 18 mana every 0.6 s, which is the rate mana refills at, so it tunnelled about 150 cells a second for nothing. It now bores **28** cells (about 47 a second). It was also the hardest-hitting basic shot: measured on a training dummy with endless mana it did 77 damage a second, against Bolt 49, Fireball 46, Boulder 66 (close up), Ember lance 73 (short range, dearest). Its hit is now **34** (was 45), about 58 a second: under Boulder and Ember lance, over Bolt and Fireball. Measured with scratchpad `sp2.js` (digging) and `sp3.js` (damage).
- Digging after the change, cells of dirt a second with endless mana: Stone spear 298, Boulder 180, Fireball 127, Heavy Bolt 28, the rest about none.
- **Health** came back at 12 a second after 3 s without being hurt, so a new golem was full again in about 11 s. It now comes back at **3 a second after 6 s** (about 40 s for 100). Resting at a Lodestone still heals fully, and standing by one still mends you quickly.

## Changing the controls (v0.56, `bind` in input.js)

Jaisah: let keyboard and mouse players, and controller players, adjust their controls. In the Controls tab every action is listed with the key or button it is on; click one, then press the new one.

- **Keyboard and mouse:** run left and right, jump, Move, rest, Shot, Burst, the four elements, take off the last, clear, map, spell book, pause, full screen, sound, music. Run, jump, Move, Shot and Burst may also go on the left, middle or right mouse button. Ctrl, Alt and the Windows or Command key cannot be used (the browser keeps them). Esc cancels a change.
- **Controller:** jump, Shot, Burst, Move, rest, the four elements, take off the last, clear, map, spell book, pause. The sticks, and the buttons that work the menus (d-pad, A, B, LB, RB), are fixed.
- **No action is ever left without a key:** giving an action a key another action has swaps the two.
- **Fixed extras:** the arrow keys always run and jump, 1 to 4 always add the elements, Esc always pauses or closes a menu.
- "Back to the usual keys" resets a device. Choices are kept on the device (`castinstone.controls.v1`), separate from the save.
- Every key name on screen follows the choice (`KInput.label`, `relabel` in main.js): the element buttons, the cast plates, the rest notice, the map hints, the spell book. Notices that name a special spell's sequence now give element names, not key letters.

## Performance audit (v0.54)

Measured with scratchpad `pf.js` (times per function per frame in four situations at three screen sizes, one with the CPU slowed four times to stand in for a phone), `pf2.js`/`pf3.js` (what the sand is doing) and `pf4.js` (a CPU profile).

**Found.** The sand step worked through every awake chunk in the whole cave, wherever the golem was. A mud slide or settling pool far away cost every step, and 30 to 60 chunks were awake at any time: 1.5 to 2.9 ms a step on the test machine, 23 ms a frame in the boss lair at phone speed (18 frames a second). The step also walked all 1,536 rows of the cave to find the awake ones.

**Changed.**
- `world.step(near)` simulates only awake chunks within 14 chunks sideways and 13 up or down of a golem (`World.REACH_X`, `REACH_Y`: 448 × 416 cells, past the edge of any screen). Chunks further off stay awake and wait; they settle when someone comes near. Both co-op devices pass both golems, so they still agree.
- The step skips whole bands of the cave with nothing awake in them.
- The sight fade layer is removed altogether on screens no larger than the golem's sight (most 16:9 screens), unless the view is against the edge of the cave.

**After.** Standing still: the sand step 0.13 ms (was 2.6). Boss lair at phone speed: 34 frames a second (was 18), with the game's own code about 12 ms of each frame. In the CPU profile the game's code is about 13% of the time; `drawCells` (painting the cave) is the largest part of that at 7%. The rest is the browser putting the picture on the screen, which the test machine does without a graphics chip, so real devices should do better than these figures. Not measured on a real phone.

**Left alone:** `drawCells` repaints every cell on screen each frame (0.5 to 2 ms on the test machine); the enemy loop visits all 230 creatures each step to see who is near (0.1 to 0.2 ms).

## Performance

Measured in desktop Chromium with a water jet running for 600 steps: simulation 0.22 ms a step, drawing 1.5 ms a frame. The simulation only touches awake chunks; the renderer draws the visible 320 × 180 cells each frame. The game pauses when the tab is hidden. Screen shake is off with reduced motion.

## Decision log

- **v0.64 (2026-11-26):** seven new materials (wood, oil, marsh gas, ice, coal, ember, acid) with their reactions, darkness that lights open up, textures, and a view 20% wider (384 × 216). Jaisah: go ahead with materials and lighting, "zoom out a bit and we will test it". Saves start again (`castinstone.save.v5`).

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
- **v0.17 (2026-11-26):** sound (all synthesized, with warning sounds for every wind-up), damage numbers, hit-stop.
- **v0.18 (2026-11-26):** Q W E S load Fire, Water, Lightning, Earth; Space only jumps; Shift is the Move key; F rests; your own Moves and Bursts never hurt you (all Jaisah). The generated cave starts at rest instead of simulating every chunk for its first steps (removed a 60 ms stutter at the start).
- **v0.19 (2026-11-26):** fixes from an independent code review and the final check: the game froze if you died while a Glowmoth glowed; a controller's Menu button paused and resumed at once; the four newer enemies came back after 2 s instead of 25; the wyrm's runestones (and stones left in the cave) were not saved and sank in magma (now straight into the bag, loose stones saved and floating); wet and muddy never wore off on dummies, nor burning or muddy on the boss; the wyrm could sink out of the world in a fully cooled lair (now kept in its lair, and returned to its magma when it calms); unaware delvers floated in the air; shards could be lost when a lot of crystal broke at once, and crawlers chewing crystal gave none; Reset map wiped the explored map.
- **v0.20 (2026-11-26):** Lift: holding Space in the air lifts you, differently for each pair (fire thrusts, water rises slowly and cheaply, earth builds steps or a tower, lightning hops, glides and floats; steam is the strongest), and never hurts you; the Shift Moves that only went up became dashes (Flame dash, Surf, Shoulder charge, Vanish). Levelling is about three times slower, enemies well below your level give less experience, and a level-up notice points to the nearest Lodestone (all Jaisah: level 7 before finding anywhere to spend points).
- **v0.21 (2026-11-26):** recipes. No slots: type up to seven elements, limited by mana (Jaisah: five slots would copy Magicka; mana as the limit is more fluid and grows with you). The first element is the form, the rest are modifiers in any order; cost rises faster than power; the recipe stays loaded. Special spells are exact sequences, hidden until your mana bar can hold them, learned from tomes or by typing. C/Z takes off the last element.
- **v0.22 (2026-11-26):** after any cast or failed cast, the next element typed starts a new recipe (Jaisah: a full recipe he could not afford left him stuck).
- **v0.23 (2026-11-26):** trying a spell that costs more than the whole mana bar clears the recipe straight away (Jaisah).
- **v0.24 (2026-11-26):** balance pass from measurements (earth digs best, fire no longer best at everything, Bursts worth their mana, single elements not the most efficient, explosions cannot delete magma), longer recipes look bigger, a cave more than twice the size with levels 1 to 8, enemies return only on rest, a much bigger Emberwyrm arena. Saves start again (`castinstone.save.v2`).
- **v0.25 (2026-11-26):** three champions; a full map on Tab and a local corner map; relic caches teach a special spell 25% of the time (was 70%).
- **v0.26 (2026-11-26):** a new interface for the HUD and every panel (Jaisah: proper game UI, as in MORPHOS).
- **v0.27 (2026-11-26):** music (a calm cave piece and an ominous one for bosses and champions, N to toggle) and motion for the golems (both Jaisah).
- **v0.28 (2026-11-26):** resting works from near a Lodestone (46 to either side, 30 above, 50 below; it was 22 and 20), and every Lodestone stands on a base of rock that cannot be dug away, restored within 2 s if it is missing (Jaisah: stones left floating were hard to rest at). In the Stats tab the five general stats are on the left and the four elements on the right.
- **v0.29 (2026-11-26):** the bag is split into a row for Head, Core, Arms and Legs, each sorted best grade first, then highest level (Jaisah).
- **v0.30 (2026-11-26):** no small bits of dirt (Jaisah, again: they still appeared and blocked him). The minimum loose piece is 48 cells (was 10); dirt formed by cooling magma is now cleaned up too (`world.settle`, the spitters' globs were the main source); the clean-up had a counting flaw that could miss pieces and, rarely, crumble part of something large (fixed: single cells first, then pieces, and a fill that meets dirt already counted is part of something bigger); a crumbled piece is two-thirds dust, one-third loose earth; the golem pushes through loose earth (`game.plough`); Stone and Ember steps are 5 thick and at least 11 wide so they never crumble. Aimed special spells land at the pointer (below), with a gold ring showing where. The rest and start panels keep one height on every tab.
- **v0.31 (2026-11-27):** eighteen more special spells, 26 in five circles, taught by tier as you go deeper; rune tablets to find; the spell book lists them by circle (Jaisah: learning the specials is the fun, so more to discover, rising in power and cost). Fixed: since v0.30 a panel with long content (the spell book) was pushed down off the screen; the panel wrap is now one cell the size of the screen.
- **v0.32 (2026-11-27):** lasting gifts (`game.boons`, `KData.treasure.boons`): the Ember core gives +40 maximum mana and 15% faster refill, each champion +20 maximum health and mana, each rune tablet +5 maximum mana, so exploring grows the mana bar towards the higher circles (about +135 mana in a full cave) alongside stat points. The pause menu opens on **Your journey**: Lodestones, relic caches, rune tablets, champions, the Emberwyrm and special spells, each as found-of-total with what it has given you. Tablet placement made reliable.
- **v0.33 (2026-11-27):** the right-click spell could stick on (Jaisah). While one mouse button is held, pressing or releasing the other sends the browser no press or release event, only a movement, so a release was missed and the button stayed "held". The buttons are now read from the browser's record of what is held (`event.buttons`) on every press, release and movement, and cleared when the pointer leaves the page. Reproduced with the old code (right down, left down, right up: Burst stayed on) and checked in every order with the new.
- **v0.34 (2026-11-27):** controller (Jaisah's layout): **LT jump and Lift, RT Shot, LB Move (dash), RB Burst**; left stick run, right stick aim; B X A Y fire, water, earth, lightning; d-pad up rest, down take off the last element, left map, right spell book; View clear; Menu pause. **Menus work with it** (`padMenu` in main.js): d-pad or left stick moves to the nearest button in that direction (repeating while held), A presses, B or Menu goes back, LB and RB change tab; the cursor is ringed in gold and follows what you do in the Runestones tab. **One device at a time** (`KInput.setDevice`): a controller takes over on a new press or a stick pushed past half after resting; keyboard and mouse on a new key, a click or real mouse movement; whatever the other device held is dropped and must be let go and pressed again. The controller is read once a frame (`KInput.poll`) in play and in menus.
- **v0.35 (2026-11-27):** the game is on the homepage (chapter 09, Beta) and has moved from `prototype/` to **`castinstone/`** (jza.app/castinstone/); `prototype/index.html` now only redirects there. Saves carry over (they belong to the site, not the folder). The page is no longer hidden from search engines, and its title says Beta.
- **v0.36 (2026-11-27):** the golem's body for collisions is 9 wide and 15 tall (was 11 × 17); it is drawn the same size as before (Jaisah: squeezing through small spaces was fiddly). It now passes a shaft 9 wide and a tunnel 15 high. Enemies have a slightly smaller target, and the golem's head and shoulders overlap walls by about a pixel more than before.
- **v0.37 (2026-11-27):** digging without a spell (Jaisah: "maybe we could just add a dig, like in Liero"). **Keep walking into dirt and the golem claws through it** (`game.clawDig`, `KData.player.dig`): after 0.3 s of pushing, a stroke every 0.1 s clears 4 cells ahead, the body's height plus 2; about 12 cells a second (running is 72). Free, makes a little noise (enemies within 70 hear it), digs dirt, lichen and loose earth, never rock or crystal. **Holding Space as well digs 2 higher each stroke**, which makes a ramp upwards. A quick bump does nothing. The input is deliberately not Liero's hold-forward-tap-back: pushing into the wall is simpler and is this game's own. Spells still dig far faster; this is for squeezing through and never being stuck.
- **v0.38 (2026-11-27):** digging also breaks crystal (Jaisah was stopped by a crystal vein at head height that the dig refused to touch; it now breaks into shards as it does for a digging spell). When what blocks you cannot be dug (rock), pushing against it throws sparks at the exact spot every half second, so the thing in the way is visible.
- **v0.39 (2026-11-27):** a 27th special spell, **Meltdown** (fourth circle: Fire Earth Fire Fire Earth Fire, 165 mana): rock within 14 of your pointer, or of the wall face in the way, melts into magma that cools to dirt; power 70 to anything there. It is the only way into rock-sealed caches without wearing the Crucible (Jaisah: in case he wants something else in the core socket). The Runestones tab now has the golem in the middle with a station for each socket round it (Head above, Arms left, Core right, Legs below), each with its spare stones beside it, and the picked stone's card below (Jaisah: like MORPHOS's Mutations screen). With a controller the ring is walked row by row as drawn (`KRest.padMove`): left and right along a row, up and down to the nearest thing in the next row, up from Head to the tab, down from the last row to Leave; down from any tab enters that tab at its first control.

- **v0.40:** Jaisah: the two blob creatures were duplicates, the warden was a tank that did nothing, more ranged enemies and kinds per region were wanted, and enemies swarmed him at a rest point. Added four kinds (two ranged) by re-labelling existing homes rather than changing cave generation, so saves carry over; gave the warden a throw and a ground wave; added the calm after a rest and sent chasing enemies home.

- **v0.41:** touch controls (Jaisah: "Yep, add it"). Shot doubles as the aim so one thumb can fire and aim; automatic aim covers the moments that thumb is on Jump or an element.

- **v0.42:** co-op (Jaisah: "OK Go ahead"). Chose both devices running the game and swapping presses, rather than the host streaming the world: the sand simulation changes thousands of cells a second, which is too much to send, while presses are a few bytes. Jaisah: do not keep code for carrying old saves over; early development, starting again is fine. So one way of building a cave, and a new save key.

- **v0.43:** Jaisah: fill the screen on everything from a phone to an ultrawide as MORPHOS does, fade to black rather than let a wide screen see further, fan the touch elements round the buttons, F for full screen. Rest moved to R rather than Alt: browsers use Alt themselves (the menu bar on Windows; Alt with D or the arrow keys moves the address bar or the page), and D is the run key. The cast plates now say LMB and RMB so R is not read as the right mouse button.

- **v0.44:** menus rebuilt as full-screen pages (see Menus). Checked by screenshot at 844 × 390, 1180 × 820 and 1600 × 900 for every tab.

- **v0.45:** the goal: seals, objective line, ending, deeper caves (see The goal). Chosen over new bosses because it gives every existing piece (champions, the wyrm, levels) a place in one arc, and an endless reason to continue, without new art.

## Checks run for v0.42

Two pages connected through `?signal=local`: in step from the first frame, identical golem positions, health and levels after moving, casting, dying and a menu choice; 60 steps a second, also with 60 ms added each way (delay rose to 6). A cave dug before hosting arrived intact. A golem moved by hand on one device was detected at the next comparison and both were matched up again. Closing the guest's page returned the host to its own game. Same seed built four times, cold and after warming the page: identical. Not tried between two different browsers or over the real internet.

## Checks run for v0.41

Simulated fingers at 844 × 390, 390 × 844 and 1180 × 820: tapping an element adds it, the stick runs, holding Shot casts, dragging Shot sets the aim, lifting every finger leaves nothing held. The controller and keyboard switching test still passes. Not tried on a real phone.

## Checks run for v0.40

Same seed built in v0.39 and v0.40: tablets, elites and champions identical. Each new kind against a standing golem in an open room for 20 s: slinger 6 hits, wisp 5, mirehopper 7, imp bursts once and dies, warden 8 (throws and slams). Calm: an enemy 40 away first hits at 5.8 s. Soak, save, champion and controller tests pass with no errors.

## Checks run for v0.37

Holding into dirt for 5 s digs about 54 cells and leaves no small bits; with Space held it climbs as it digs; rock stops it; standing still or a quarter-second bump digs nothing; no mana is spent. The smaller body (v0.36) passes a tunnel 15 high and is blocked by one 14 high. Random play, the controller test and saving again.

## Checks run for v0.34

With a simulated standard controller: every play button (elements, undo, clear, LT jump then Lift, RT and RB casting, LB dash, stick run, map, spell book, pause, rest); the start screen (move, pick a golem, change tab, Start); the rest panel (a direction held while it opens does nothing; move, spend a stat point, change tabs, pick a runestone, equip it, take it off, leave). Switching: a held key does not survive the controller taking over, even while it auto-repeats; a held trigger or a pushed stick does not survive the mouse taking over and cannot take control back until released; no flapping in any case. I have still not used a real controller.

## Checks run for v0.32

Boons applied on reading a tablet, beating a champion and the wyrm, and kept after saving and reloading; nine tablets on five seeds, three of them at the cave's deepest levels; the journey panel photographed; all special spells, recipes, saving and the interface tests again. Random play still shows a few steps of 30 to 45 ms: profiling puts them in the sand simulation when the test teleports into the Emberwyrm's lake (it is far larger since v0.24), not in anything added here.

## Checks run for v0.31

Every special spell cast in a test arena with four enemies (cost charged, learned, damage, worst step under 6 ms, no errors) and its numbers tuned from that; tablets placed, read, saved and reloaded; tomes from low-level finds teach the first circle before the second; champions teach the fourth; the spell book photographed by circle; recipe, random-play, save, interface and champion tests again.

## Checks run for v0.30

A new cave has no loose piece under 48 cells (counted over the whole cave, and again after a second clean-up); eight magma globs left to cool leave none; walking into a 10-high pile of loose earth goes through it and into dirt of the same size does not; steps survive a blast beside them; Geyser lands under the pointer at 60 away, at the edge of its range when the pointer is beyond it, and in front of a wall that is in the way; Phase lands behind the wall; the rest panel is 680 high on all four tabs; boss, recipe, random-play and save tests again.

## Checks run for v0.27

Music measured in the browser: the cave piece playing after start, the boss piece taking over inside the lair and the cave piece returning outside it, silence with N and sound again after; the setting is remembered. Golem poses sampled while still, running and jumping (they change as described) and photographed enlarged (no gaps or stray pixels); reduced motion leaves it still. I cannot hear the music from here, so how it sounds is for Jaisah to judge.

## Checks run for v0.26

Every screen opened and photographed at 1280 × 720 (start, spell book, controls, play with a recipe, notices, a timer and the rest prompt, the four rest tabs with runestones worn and in the bag, pause) and the start and play screens at 844 × 390; no errors. The save, recipe-typing, map and random-play tests run again against the new interface.

## Checks run for v0.25

Champions on three seeds (placed, not stuck); a bot fight with each (about a minute at level 8; rewards given; the bar shows; they stay beaten after resting and after reloading); the Colossus walking and slamming on four seeds; the map opening and closing on Tab.

## Checks run for v0.24

Damage, mana and digging per recipe measured before and after; five seeds generated and counted (enemies by level, caches, experience available); a bot fighting the Emberwyrm on three seeds for up to 150 s (it breaches, spits, strands and recovers; the lake keeps its magma; no errors); all 340 recipe casts and eight special spells again; three minutes of random play (worst step 16 ms, in the lair); typing, casting, saving and reloading with real keys.

## Checks run for v0.21

All 84 one-, two- and three-element recipes and a seven-element one cast in every mode in a test arena with enemies (340 casts, no errors or broken numbers); all eight special spells cast, charged the right mana and were learned; Cataclysm stays hidden with a 100-mana bar; three minutes of random play with random typing, undo and clear and a large mana bar (no errors, worst step 5 ms); real key presses: typing, C, a held click, a special spell, and the recipe and known spells surviving save and reload.

## Checks run for v0.20

Every Lift in an open test arena, both still and steering (height, time aloft, mana, and no damage to you); a tap of Space is a plain jump with no mana spent and holding it starts the Lift, with real key presses; three minutes of random play twice, Moves included, with no errors.

## Checks run for v0.19

All with Playwright against the page, scripts in the session scratchpad: all 30 spells cast without errors; three minutes of random play (random elements, every mode, jumps between regions) with no errors, no broken numbers, worst step 6–9 ms; each enemy attacking in a cleared arena; the boss over 60 s on three seeds and its lake over 120 s on four (no loss); save and reload with stats, runestones, caches, loose stones, the defeated boss and cores; phone width (844 × 390) for the start panel, play and every rest tab; a simulated controller (load, run, cast, pause); the new controls with real key presses (Space only jumps, Shift moves, F rests, own Moves and Bursts do no damage); performance in the boss fight (1 ms simulation, 2.4 ms drawing a frame).

## Open questions to test

- Should earth pillar keep some upward speed when it stops?
- How fast should mana refill?
