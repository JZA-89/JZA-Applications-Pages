# KILN — prototype design notes

Working title. A one-player prototype at `jza.app/prototype/` to test whether the core is fun before building more. Unlisted (no links to it, `noindex`), but public to anyone with the URL.

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

### The map

One hand-shaped cave (seed 20261125): rock frame; a long cavern with a wavy floor and ceiling; dirt above and below to dig; three floating dirt ledges; a rock spur in the middle; rock lumps; a pool on the right lined with rock; moss on floors and ceilings. Spawn on the left. Four training dummies.

## The character

A small **bottle kiln**, 11 × 15 pixels (hitbox 9 × 14): a glazed cream body with a soot outline, a chimney on top, two dark eyes that look towards the aim, and an arched furnace door as its mouth. The door is the element display: its left half glows with the first loaded element, its right half with the second, and the middle with their mix. The chimney puffs smoke tinted by what is loaded (grey when empty). Damage chips pixels off the body (up to 45% at zero health). The interface uses only clay and violet-ash colours, so the four element colours always mean their element.

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
| Run | 72 cells/s; accel 900 ground, 520 air; ground friction 14 |
| Jump | 168 cells/s up (about 29 cells high); gravity 480; max fall 330; coyote 0.1 s; jump buffer 0.12 s; releasing early halves the rise |
| Water | gravity × 0.28, drag; hold jump to swim up (to 95/s) |
| Bursts | 2; refill after 0.05 s on the ground or in water |
| Hazards | fire 22/s, magma 45/s, electrified water 60/s |

Own spells hurt you (fireball blasts, fire, magma, shock). Flare's blast skips its caster.

## Elements and spells

Load two elements (order does not matter), then cast. A third element pushes out the first. The slots stay loaded after a cast, so you can cast the same spell again. Holding cast repeats a spell when its cooldown ends; Steam burst and Arc dash only cast on a fresh press. A global 0.12 s lock follows any cast.

| Spell | Elements | Kind | Numbers |
|---|---|---|---|
| Fireball | Fire + Fire | projectile | 230/s, gravity 70; blast radius 9 (dirt removed, fire on the rim); 40 damage at the centre; knockback 210; cd 0.5 s. Into water: steam, no blast. |
| Water jet | Water + Water | held stream | 3 water particles a step for up to 1.4 s, 210/s, spread ±0.12 rad; each particle pushes an actor once (× 0.008 of its speed); recoil 70/s² in the air; cd 0.25 s after it ends. |
| Earth pillar | Earth + Earth | growth | Finds the surface along the aim (range 70) and grows dirt out of it, opposite the aim, snapped to 8 directions: 24 rows, 5 wide, 70 rows/s. Pushes actors one cell per row. Aim down to rise 23 cells. No surface in range: an 11 × 3 slab. cd 0.55 s. |
| Bolt | Lightning + Lightning | instant | Range 170; stops at the first actor, water or solid. 30 damage. Into water: electrifies it. Chains to one more target within 16 for half damage. Sets moss alight. cd 0.55 s. |
| Steam burst | Fire + Water | movement | Uses a burst. Sets speed to 215 away from the aim (keeps 20% of the old speed) and leaves 70 steam cells. cd 0.35 s. |
| Magma | Earth + Fire | lob | 175/s, gravity 380; lands as 38 magma cells; 15 damage on a direct hit. cd 0.7 s. |
| Mud | Earth + Water | spray | 50 mud particles, 190/s (× 0.7–1.2), spread ±0.32 rad, gravity 300. cd 0.6 s. |
| Arc dash | Lightning + Water | movement | Uses a burst. 310/s for 0.12 s (37 cells), 0.2 s (62 cells) when starting in water. 20 damage to each actor passed through. Keeps 40% speed after. cd 0.35 s. |
| Stone spear | Earth + Lightning | projectile | 380/s, no gravity; bores a tunnel 2 cells in radius for up to 90 cells of dirt; stops at rock; 45 damage, knockback 160; range 260. cd 0.6 s. |
| Flare | Fire + Lightning | blast | Centre 13 cells along the aim, radius 11 (+4 for actors); removes dirt within 5; 35 damage at the centre; knockback 330; recoil 90 on the caster; some fire. cd 0.75 s. |

## Controls

| Action | Keyboard and mouse | Controller |
|---|---|---|
| Move | A / D (or arrows) | Left stick, d-pad |
| Jump, swim up | W, Space, Up | LB or LT |
| Aim | Mouse | Right stick (or the left stick's direction) |
| Load Fire / Water / Earth / Lightning | Q / E / R / F or 1–4 | B / X / A / Y |
| Cast | Left click | RB or RT |
| Empty the kiln | X or right click | D-pad down |
| Spells, pause | H, Esc or P | View, Menu |
| Reset the map | Backspace | — |

The last device used takes over. Touch controls are not built yet.

## Performance

Measured in desktop Chromium with a water jet running for 600 steps: simulation 0.22 ms a step, drawing 1.5 ms a frame. The simulation only touches awake chunks; the renderer draws the visible 320 × 180 cells each frame. The game pauses when the tab is hidden. Screen shake is off with reduced motion.

## Decision log

- **v0.1 (2026-11-25):** first build. Four elements, ten spells, one map, training dummies, keyboard/mouse and controller. Spell keys are the two element names in alphabetical order. Slots stay loaded after a cast. Movement spells use bursts (two, refilled on landing) so there is no free flight. Health is 100 with numbers chosen so that most attacks take three hits to finish a player (to be tuned for PvP).

- **v0.2 (2026-11-25):** own look. The character is a bottle kiln (door shows the elements, chimney smoke in their colours); dirt is layered strata, rock faceted slate, moss is now lichen, the cave is violet. Player hitbox 9 × 14 (was 7 × 12).

## Open questions to test

- Is three-ish hits the right lethality, or should it be lower or higher?
- Should the slots empty after a cast (more decisions) or stay loaded (faster)?
- Is holding cast to repeat good, or should every cast be a fresh press?
- Should earth pillar keep some upward speed when it stops?
- Are two bursts too many or too few?
