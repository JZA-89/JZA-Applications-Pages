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
| `game.js` | Rules: player control, spells, projectiles, particles, actor physics, damage. |
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

512 × 192 cells; the screen shows 320 × 180 cells, one pixel each, scaled up with crisp edges. The camera is centred on the player, clamped at the world's edges.

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

#### No crumbs (minimum terrain size)

After terrain breaks (`world.explode`, which every digging spell uses, crawler chewing, and the unstick check), `world.cleanup` looks at the area: any loose piece of dirt or lichen smaller than 10 cells (`World.MIN_PIECE`, 4-connected), and any single cell with at most one solid neighbour (thin spikes and strands, two passes), crumbles into loose earth and falls. Rock never changes. The starting cave is cleaned the same way (crumbs removed outright). This keeps pixel-sized floating bits out of the world, so creatures do not snag on them.

## The map

One hand-shaped cave (seed 20261125): rock frame; a long cavern with a wavy floor and ceiling; dirt above and below to dig; three floating dirt ledges; a rock spur in the middle; rock lumps; a pool on the right lined with rock; moss on floors and ceilings. Spawn on the left. Four training dummies.

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

The first enemy, for testing combat. A plated, beetle-like crawler of dark shale with magenta eyes (magenta is not an element colour, so enemy eyes never read as a spell). 15 × 8 pixels; hitbox 13 × 8. Three live in the cave (spawn spots x 214, 338, 480).

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
| Death | crumbles into loose earth; a new one appears 7 s later at the spawn spot furthest from the player |

Hazards (fire, magma, electrified water, mud) affect it like anyone else. Measured: standing still, a player first gets hit about 1.4–2.9 s after being seen; two Stone spears kill one.

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

A third element pushes out the first; slots stay loaded after a cast. Held spells (Water jet, Scald, Hover, Steam flight, Wall climb, Drill) drain mana while held; the rest cost a set amount. One-shot Moves fire once per press. Each spell has its own cooldown (`key:mode`). A Shot or Burst is followed by a 0.12 s lock on Shots and Bursts. One spell of each mode can run at once (you can fly and shoot). Every cast alerts enemies within 110. All numbers live in `KData.spells`; power is base damage before stats.

| Pair | Shot | Burst | Move |
|---|---|---|---|
| Fire + Fire | **Fireball** 14 mana: 230/s, gravity 70, blast radius 9 (digs, fire on the rim), power 40, knock 210, cd 0.5 | **Fire nova** 26: power 26 within 24, knock 220, ring of fire; cd 1.4 | **Rocket jump** 16: 250 up (or the pressed direction), a small blast where you were (power 18 to others, never you); cd 0.45 |
| Water + Water | **Water jet** 14/s held: 3 particles a step, pushes | **Tidal wave** 24: 56 water particles both ways; enemies within 42 sideways shoved 320, power 10; cd 1.4 | **Hover** 10/s held: rise 45 (W), slow sink 14, drop faster (S); water drips below |
| Earth + Earth | **Boulder** 16: lobbed 200/s, gravity 380, power 32, knock 300, digs radius 3, leaves 18 loose earth; cd 0.7 | **Stone shell** 24: a 2-thick ring of dirt at radius 14, pushes enemies out; cd 2 | **Pillar** 16: dirt grows up under you (26 rows, 7 wide, 80/s); no ground in range 70: a slab under your feet; cd 0.55 |
| Lightning + Lightning | **Bolt** 16: instant, range 170, power 30, chains once within 16, electrifies water; cd 0.55 | **Shock field** 26: power 28 to all within 34, electrifies nearby water; cd 1.4 | **Blink** 20: teleport up to 36 in the pressed direction (default facing) to the furthest free spot; cd 0.5 |
| Fire + Water | **Scald** 20/s held: steam cone, range 34, ±0.45 rad, power 32 a second | **Steam cloud** 20: steam fills radius 24 (60%), power 14 inside; cd 1.6 | **Steam flight** 18/s held: 1,050/s² in the pressed direction (default up), top speed 190; a full bar lasts about 5.6 s |
| Earth + Fire | **Magma** 16: lob, 38 magma cells, power 15 direct; cd 0.7 | **Eruption** 28: 40 magma particles fountain from the ground within 28; power 24, knock 260 up; cd 1.8 | **Magma slam** 22: dive at 360 (default down); on landing 26 magma cells, power 30 within 20, knock 240; cd 0.6 |
| Earth + Water | **Mud** 12: 50 particles, 220/s, ±0.28 rad, gravity 220. A hit coats and slows (below); cd 0.6 | **Mire** 22: the top 2 cells of ground within 32 (not under you) turn to mud; cd 2 | **Wall climb** 8/s, only while touching a wall: cling, climb with W (55/s), down with S |
| Lightning + Water | **Arc** 18: like Bolt (range 140, power 20) but jumps to 3 more targets within 45 (×0.7); cd 0.55 | **Storm** 28: power 22 to every enemy within 75 in line of sight; cd 1.6 | **Arc dash** 22: 310/s for 0.12 s (0.2 s from water) in the pressed direction, power 20 to each actor passed; cd 0.35 |
| Earth + Lightning | **Stone spear** 18: 380/s, bores radius 3 for 90 cells of dirt, power 45, knock 160; cd 0.6 | **Spikes** 26: dirt spikes (7 tall) every 4 cells within 30 on the ground; power 30, knock 240 up; cd 1.6 | **Drill** 24/s held: move 110/s in the pressed direction (default facing), boring radius 10, no gravity; 12 to anything touched (every 0.3 s) |
| Fire + Lightning | **Ember lance** 14: instant straight beam, range 150, pierces every enemy (power 24), stops at solid (fire there) or water (steam); cd 0.4 | **Flare** 24: power 32 within 24, knock 340, sparks fire; cd 1.2 | **Blast dash** 18: thrown 280 in the pressed direction (default facing); blast behind you (power 16 to others); cd 0.45 |

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

## Open questions to test

- Should earth pillar keep some upward speed when it stops?
- How fast should mana refill?
