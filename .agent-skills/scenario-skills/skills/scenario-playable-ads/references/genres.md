# Genre picker

What the user picks is **what their game is**. The pipeline then derives two more things:

| Axis                       | Set by                                              | Decides                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Genre** (family → genre) | the user, from the picker below                     | which archetype guide to follow, the payoff, the asset list                                                                                                               |
| **Ad verb**                | the archetype guide (the one input the viewer uses) | controls, hint hand, QA bot actions                                                                                                                                       |
| **Product model**          | the user (or inferred from the recording)           | fidelity: _hypercasual_ one verb; _hybrid-casual_ and _casual_ one verb plus one meta beat (a level-up card, a coin counter); _midcore_ a faithful slice of the real loop |

Most market lists mix these up (a "runner" is a genre, "swipe" is a control, "merge" is a mechanic).
Keep them apart: two games in the same genre can need different ad verbs, and the same verb serves
many genres.

The fidelity rule: the further the playable drifts from the real game, the more of the installs it
brings leave on day 1. Midcore studios usually want the faithful slice.

## The picker (7 families, 27 genres, plus Other)

Status: **built** = a guide written from one build that passed the 19 base QA checks; **nearest** =
no guide yet, start from the named guide and expect design work; **new guide** = nothing close.

### 1. Action & Shooting: aim at threats and survive

| Genre id           | What it is                                              | Ad verb                    | Signature payoff                    | Status → guide                          |
| ------------------ | ------------------------------------------------------- | -------------------------- | ----------------------------------- | --------------------------------------- |
| `survivor-shooter` | free-moving hero, auto-fire, swarms, level-up cards     | tap to move (point-and-go) | ultimate wipes the screen           | **built** → `archetype-survivor.md`     |
| `lane-shooter`     | squad at the bottom, threats and gates come down a road | drag left/right            | the big squad mows down a huge wave | **built** → `archetype-lane-shooter.md` |
| `vertical-shmup`   | plane/ship flies up a scrolling sky, bullet patterns    | drag to move               | screen-filling weapon power-up      | nearest → lane shooter                  |
| `arena-brawler`    | hero on a hazard arena (falling tiles, bumpers)         | drag to move               | knock-out combo                     | nearest → survivor                      |

### 2. Runners & Crowds: keep moving, grow the group

| Genre id       | What it is                                              | Ad verb                 | Signature payoff                  | Status → guide                                              |
| -------------- | ------------------------------------------------------- | ----------------------- | --------------------------------- | ----------------------------------------------------------- |
| `crowd-runner` | crowd runs a track through math gates to a clash        | drag left/right         | crowd clash at the goal           | **built** → `archetype-crowd-runner.md`                     |
| `dodge-runner` | endless lanes or a river; dodge, collect, jump          | swipe / drag left-right | near-miss streak, speed burst     | nearest → crowd runner                                      |
| `crowd-gather` | walk a city, recruit idle people into your crowd        | drag to move            | your crowd swallows a rival's     | nearest → crowd runner (count logic) + survivor (free move) |
| `eat-and-grow` | eat smaller things to get bigger (hole, blob, creature) | drag to move            | grow past the boss and swallow it | nearest → survivor (free move)                              |

### 3. Puzzle: think, then one satisfying move

| Genre id         | What it is                                                | Ad verb                | Signature payoff                                                            | Status → guide                                                            |
| ---------------- | --------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `sort-puzzle`    | balls, liquids, screws, cars into matching containers     | tap source, tap target | container pops complete; one-slot-left near-fail                            | **built** → `archetype-sort.md`                                           |
| `conveyor-color` | color shooters ride a loop and paint/clear matching cells | tap to dispatch        | picture completes and comes alive                                           | **built** → `archetype-paint-train.md` (read its original-IP rules first) |
| `match-tile`     | match-3 or triple tile match                              | swap / tap             | cascade combo, board clear                                                  | nearest → sort (solver, honest counts)                                    |
| `pin-pull`       | pull pins in order to save the hero / route the treasure  | tap or swipe a pin     | the treasure pours into the cart; a wrong pin is the player's own fail-bait | **built** → `archetype-pin-pull.md`                                       |
| `tilt-maze`      | roll a ball through a maze into the hole                  | drag to tilt           | last-second drop into the hole                                              | new guide                                                                 |

### 4. Merge, Build & Simulate: watch something grow or get restored

| Genre id           | What it is                                                                                           | Ad verb                    | Signature payoff                                                    | Status → guide                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| `merge`            | merge-2 chain on a board                                                                             | drag onto twin             | legendary unlock                                                    | **built** → `archetype-merge.md`            |
| `idle-tycoon`      | tap to collect, buy upgrades, numbers go up                                                          | tap                        | visible building upgrade, money burst                               | nearest → merge (progression + coins)       |
| `idle-arcade`      | walk a worker around: collect, carry a stack, feed a machine, serve a customer queue, buy automation | tap to move (point-and-go) | automation kicks in (conveyor, hired helper) and a new area unlocks | **built** → `archetype-idle-arcade.md`      |
| `makeover-restore` | clean, repair, decorate a car, house, pet                                                            | drag / rub                 | before/after reveal                                                 | new guide                                   |
| `base-builder`     | build and defend a camp or kingdom (4X lite)                                                         | tap to build               | first raid repelled                                                 | nearest → merge (build) + survivor (combat) |

### 5. Strategy & Battles: place units, plan, win the clash

| Genre id        | What it is                               | Ad verb                                    | Signature payoff           | Status → guide                           |
| --------------- | ---------------------------------------- | ------------------------------------------ | -------------------------- | ---------------------------------------- |
| `tower-defense` | place towers along a path against waves  | tap a pad to build, tap a tower to upgrade | the boss held at the gate  | **built** → `archetype-tower-defense.md` |
| `card-battler`  | deck or auto-battler; one big combo turn | drag card to target                        | combo turn wipes the enemy | new guide                                |
| `army-clash`    | draw or drop units, armies collide       | drag to draw / drop                        | the big clash              | nearest → crowd runner (count clash)     |

### 6. Racing & Sports: speed, aim and timing

| Genre id          | What it is                                                                                                | Ad verb                                | Signature payoff                                                                                   | Status → guide                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `racing`          | time trial or race down a track: steer the bends, boost on the straights, beat the record (or the rivals) | drag left/right to steer, tap to boost | a boost / warp down the straight, then a new record at the line (with rivals: overtake into first) | **built** → `archetype-racing.md` (real 3D, see `3d-games.md`) |
| `aim-and-release` | archery, golf, basketball, bubble shooter                                                                 | drag back and release                  | one-shot trick (many targets, hole-in-one)                                                         | new guide                                                      |

### 7. Adventure, Story & Party: a character, a choice, a moment

| Genre id         | What it is                                                                                                    | Ad verb                                            | Signature payoff                                | Status → guide                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| `platformer`     | side-view hero runs and jumps over ledges, spikes, switches and keys to a goal (often an on-screen ◀ ▶ A pad) | tap where to land, tap again in the air (air jump) | the level's goal moment, played with a flourish | **built** → `archetype-platformer.md` |
| `trap-adventure` | explorer dodges traps through a temple or dungeon                                                             | swipe / drag                                       | escape as the room collapses                    | nearest → dodge runner → crowd runner |
| `choice-story`   | pick 1 of 2–3 options, instant consequence                                                                    | tap an option                                      | the right choice transforms the scene           | new guide                             |
| `party-obstacle` | race a crowd of players through an obstacle course                                                            | drag to move                                       | first across the line among dozens              | nearest → crowd runner                |

### Other: not on the list

| Genre id | What it is                                    | Ad verb                         | Signature payoff                                            | Status → guide                              |
| -------- | --------------------------------------------- | ------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `other`  | the user says the game fits none of the above | from the recording or the brief | from the recording or the brief, and the user's description | follow [unknown-genre.md](unknown-genre.md) |

When the user picks **Other**, their own description of the game (`intake.json` →
`game_description`) is a first-class input. Read it before the recording. It names what they think
the core loop and the best moment are, and the recording confirms or corrects that. Build only what
the recording shows. From an idea, with no recording, build only what the brief and the genre guide
state.

## Writing it into the intake

```json
"genre": { "family": "puzzle", "id": "sort-puzzle" },
"product_model": "hybrid-casual",
"game_description": "In the user's words: what the player does, what makes it fun, what the ad should show"
```

- `family` is one of `action-shooting`, `runners-crowds`, `puzzle`, `merge-build-simulate`,
  `strategy-battles`, `racing-sports`, `adventure-story-party`, or `other`.
- `id` is one row above. A game that mixes two genres takes the one whose verb the ad uses; note the
  other in `analysis/brief.md`.
- `product_model` is one of `hypercasual`, `hybrid-casual`, `casual`, `midcore`.

## Choosing when the user is not sure

1. Watch the recording (from an idea, read the brief): what does the player's finger do most of the
   time? That verb narrows it to a family.
2. What is the most satisfying moment in the recording (or the brief)? That picks the genre within
   the family.
3. If two genres fit, pick the one with a **built** guide.
4. If the user picks "I don't know, you choose", say in one line what you picked and why, and give
   the confidence (see [unknown-genre.md](unknown-genre.md)). When every offered row is a stretch,
   say so: the honest pick can be a genre the list is missing (that is how `platformer` was added).

## Uncovered genres

When the row says _nearest_ or _new guide_:

- Tell the user before building: the genre has no tested guide, so expect an extra review round.
- Start from the nearest guide's code structure (runtime use, the waiting screen, honest near-fail,
  QA bot), and design the genre's own beat sheet in `analysis/design.md`.
- After it passes QA, write `references/archetype-<name>.md` (the name in the guide column; the
  `conveyor-color` guide is `archetype-paint-train.md`), add its row to the archetype index in
  `SKILL.md`, and flip its row here to **built**.

## Where this list came from

Built for this skill from common market genre lists and the mechanic families mobile studios
commonly cite. It groups by the player's fantasy and the ad verb and copies no single source.
Revisit it when a _nearest_ row gets its own guide.
