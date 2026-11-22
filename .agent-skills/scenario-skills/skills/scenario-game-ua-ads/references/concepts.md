# Concept beat sheets

Sixteen mobile UA concepts, each planned as a 15 second ad: a setup or tease take, a payoff take,
and an end card of about 4 seconds. Every board is a text-free still at the delivery ratio, and
every number, label, button, and hand in the UI column is a composited layer (see
[ui-layers.md](ui-layers.md)). Shorter ads drop the setup take's second half, never the end card.

Concepts 1 and 7 to 16 were produced as 15 second ads, then rebuilt to pass one test: a stranger
wants to play. Their beat sheets describe the rebuilt ads, and their Notes record the faults review
caught and the rule that avoids each. Each names its **Build**: chained stages, a scripted board, or
generated takes.

Each concept's **Fun** line names the player fantasy, the input a viewer must read within 2 s, the
motions the clips must show, and the limit the player overcomes. Plan the clips from it.

Invent a fictional game name when the user gives none, and use it on the end card only. Generate a
square app icon of the hero for every end card.

Each concept's **End card** line is one idea from that game's world, with its own call-to-action
words. Design a new one per ad from the same patterns ([ui-layers.md](ui-layers.md)); never carry a
card from one ad to the next.

| #   | Concept                  | Group                  | Core mechanic                 | Hook                  |
| --- | ------------------------ | ---------------------- | ----------------------------- | --------------------- |
| 1   | Rescue with a fail tease | Puzzle and logic       | Pull the pins in order        | WATER OR GOLD?        |
| 6   | Only 1% can solve        |                        | Fix a wrong state             | ONLY 1% CAN SOLVE     |
| 7   | Draw to protect          |                        | Draw a shield line            | SAVE HIM!             |
| 8   | Find the odd one         |                        | Tap the one that differs      | ONLY 1%               |
| 9   | Parking jam escape       |                        | Free the key car first        | ONLY 1 CAR            |
| 3   | Satisfying sort          | Satisfying and ASMR    | Items click into slots        | Tactile sound first   |
| 10  | Excavation reveal        |                        | Bigger tool per layer         | 3 LAYERS              |
| 11  | Cascade combo            |                        | Build and combine boosters    | 3 MOVES               |
| 2   | Number gates             | Growth and progression | Run through the better gate   | Two labeled gates     |
| 4   | Legendary pull           |                        | Flip the glowing card         | One card glows        |
| 5   | Crisis to restore        |                        | Merge to rebuild a room       | A crisis and a choice |
| 12  | Broke to cozy            |                        | Tap upgrade, the room changes | 3 TAPS                |
| 13  | Swallow and grow         |                        | A hole eats ever bigger items | TINY HOLE             |
| 14  | Evolve and smash         |                        | Collect, evolve, smash a wall | HOW BIG CAN HE GET?   |
| 15  | Perfect stack            | Skill shots            | Time each drop                | TO THE MOON           |
| 16  | Trick shot               |                        | Bank one shot off bumpers     | ONE PERFECT SHOT      |

## 1. Rescue with a fail tease (pin-pull puzzle)

- **Fun**: rescue through cleverness. The order nobody tries first wins: water poured on the lava
  sets it into a stone ramp, the gold slides down it into the cart, and the miner runs up it to
  safety. Gold melting in the lava is the limit.
- **Board**: glass chambers in a stone frame. Water top left, gold top right, lava in the shared
  floor chamber, the miner in a locked cell beside it, an empty cart at the exit. One golden pin
  floors each top chamber, and a fourth locks the cell. Nothing solid sits between a pin and the
  chamber below it: say so in the prompt, since boards drew a stone band there. No pipes or bends:
  the model routes contents outside a pipe. Keep the top third free: the platform band, then the HUD
  and the hook.
- **Build**: chained stages. One state still per step, each edited from the last: the board, the
  lava set to stone, the gold in the cart, the miner in the cart. Each take is pinned from one state
  to the next with one visible move. The fail take starts from the board.
- **Timeline**: 0 to 1.8 s hook, the gold pin pulled at 0.3 s, gold melting at 1.0 s. 1.8 s panic
  insert. 2.5 s FAIL on a frozen, desaturated frame, 3.3 s rewind wipe. 3.8 s water pin, 4.5 s water
  hits the lava under a punch-in, steam, stone by 5.0 s with the music lift. 5.8 s gold pin, gold
  slides into the cart, coins fly to the counter in four steps. 8.3 s cell pin, the miner runs up
  the ramp and leaps into the cart at 10.1 s. RESCUED!, stars, laughing insert. 11.2 to 15 s end
  card.
- **UI**: hook, level badge, coin counter, hand on each of 4 rings, FAIL, rewind wipe, punch-in,
  RESCUED!, stars, end card.
- **End card**: the hero carries it. The full cart rolls in with the miner waving from it and the
  icon on its side, while the next miner bangs on a locked cell behind. Label "FREE HIM NEXT".
- **Notes**:
  - Name what stays inside the glass, steam included. Steam that leaked out was hidden with a patch
    cut from the take.
  - A pin the take cannot pull cleanly can vanish in a local puff, with the hand covering the ring.
  - Leave headroom for every leap. The miner clipped an overhead beam and was shifted locally.
  - Pinning the last frame also locks the camera; an unpinned take drifted into a push-in.

## 2. Number gates (crowd runner)

- **Fun**: growth. A finger picks one of two gates, and the crowd pours through, multiplies into a
  flood, and ripples as it runs. The castle is the limit only the multiplied crowd can overrun.
- **Board**: wide runway toward a castle, a small identical crowd in the lower third, two blank gate
  panels across the lane. Blank is deliberate: the model cannot hold numbers.
- **Clips**: setup take 5 s with the camera still on the gates. Payoff take 8 s: the crowd runs
  through one gate and multiplies.
- **Timeline**: 0 to 3 s gate labels over the gates. 0 to 5 s setup. 5 to 11 s payoff, counter steps
  through 4 values (18, 115, 480, 803). 11 to 15 s end card.
- **UI**: two gate labels, four counter pills, a hand choosing a gate, end card.
- **End card**: the payoff keeps going. The crowd keeps pouring over the castle wall behind the
  icon, the counter still climbing. Label "GROW YOUR ARMY".
- **Notes**: gates move when the camera advances, so labels live only while the gates are nearly
  static. The counter never moves, so it carries the story.

## 3. Satisfying sort (ASMR)

- **Fun**: order. A finger drags one item to a slot, items wobble on a slot's edge and click in, and
  rows fill. One item jams at first, then turns and drops in.
- **Board**: a shelf or rack of colorful items in rows, a reveal panel that fills as items land.
- **Clips**: sorting take 7 s, items slide into slots in sequence. Reveal take 5 s, the panel
  completes into a picture.
- **Timeline**: 0 to 7 s sorting, combo badge steps x3, x8, x15, x25. 7 to 11 s reveal with a short
  word line. 11 to 15 s end card.
- **UI**: combo badges, word line, end card.
- **End card**: the game's own screen. The finished picture becomes the level-complete panel, the
  label where its next button sits: "SORT THE NEXT SHELF".
- **Notes**: lead with sound. Tactile clicks and a rising tone under each combo step carry the ad.

## 4. Legendary pull (gacha summon)

- **Fun**: power. A tap lands on the one glowing card, which trembles, cracks, and shatters, and the
  hero lands with a shockwave. The card resisting through two cracks is the limit before the burst.
- **Board**: summoning circle, five face-down cards in a row, one slightly brighter. Also render the
  payoff still: the hero bursting out of shattered glass.
- **Clips**: anticipation take 5 s from the card row. Burst take 6 s, first-and-last-frame from the
  card row to the hero still: flip, flash, shatter, hero lands.
- **Timeline**: 0 to 5 s anticipation with a hook line. 5 to 8 s burst, rarity banner at the peak. 8
  to 11 s hero hold. 11 to 15 s end card.
- **UI**: hook line, rarity banner, end card.
- **End card**: the hero carries it. The summoned hero plants a blank banner beside the icon while
  the shockwave still ripples; the label sits on the banner: "SUMMON YOURS".
- **Notes**: pin the last frame or the model invents a different hero. A blank card face can show
  during the flip; the burst hides it.

## 5. Crisis to restore (merge-2 story)

- **Fun**: rescue. A tap picks one choice, a drag joins two matching items, and they pop into a
  bigger one as the room repairs. The storm is the limit each merge pushes back.
- **Board**: story still (family in a storm) and a merge grid still with a cozy restored room.
- **Clips**: crisis take 5 s, merge take 6 s, joined by a choice screen layer.
- **Timeline**: 0 to 5 s crisis, two choice buttons, hand on one. 5 to 11 s merge grid combines
  items, multiplier badge steps up. 11 to 15 s restored room with the end card.
- **UI**: two choice buttons, hand, multiplier badge, end card.
- **End card**: the payoff keeps going. The restored room stays live, the family waves from the
  window, and the label hangs on the door as a welcome sign: "FIX THEIR HOME".
- **Notes**: keep the same characters across stills by generating the room from the story still as a
  reference.

## 6. Only 1% can solve (challenge puzzle)

- **Fun**: cleverness. One finger moves one piece, which jams and rattles in the wrong state, then
  slides and locks in the right one. The pause on the mistake is the limit the solve overcomes.
- **Board**: a close-up puzzle object (screws and holes, tangled ropes, sliding blocks) on a warm
  background.
- **Clips**: wrong-state take 5 s with a pause on the mistake, solving take 6 s to the right state.
- **Timeline**: 0 to 5 s headline over the puzzle with a score meter, hand showing the move. 5 to 11
  s solving take. 9 to 11 s challenge line ("CAN YOU DO IT?"). 11 to 15 s end card.
- **UI**: headline banner, score meter, hand, challenge line, end card.
- **End card**: cliffhanger. The next, harder puzzle frozen in its wrong state, under "CAN YOU SOLVE
  IT?".
- **Notes**: the headline and meter are layers; never ask the model for a score number.

## 7. Draw to protect (line-drawing puzzle)

- **Fun**: rescue through cleverness. One stroke holds back two threats at once, a bee swarm and a
  flood, and the pet stays dry underneath. The short wrong line that fails first is the limit.
- **Board**: side view. The pet on open ground, a cliff with a wooden dam holding water on one side,
  a tree with a hive on the other. The line is never generated.
- **Build**: generated takes for the loose physics (bees, water), from stills that already show the
  drawn shape. The stroke is a local track revealed along its path, the fingertip on its head.
- **Timeline**: 0 s hook, the short line drawn. 0.3 s the dam bursts and bees pour out. 1.2 s a bee
  bonks the pet, FAIL. 1.6 s white rewind. 1.6 to 2.3 s the dome is drawn, with snap puffs at both
  feet. 2.1 s an 8 s countdown starts. Bees bonk the dome, the flood rises, the timer turns red at
  3, slow motion, then a wave slams the dome under a punch-in at 8.3 s. Pet close-up insert, timer
  at 0, SAFE!, stars. 11 to 15 s end card.
- **UI**: hook, level badge, countdown, line track, hand, FAIL, BONK! words, red edge, SAFE!, stars,
  end card.
- **End card**: cliffhanger. The next level frozen: the pet on a ledge between a lava flow and a
  teetering boulder, the pen waiting at its tip. Label "SAVE HIM".
- **Notes**:
  - Generated bees bunched against a dome slightly lower than the drawn line, inside it for 74
    frames. Run a per-frame mask check inside every locally drawn barrier, with a size filter so a
    small static prop (a collar tag) neither hides nor fakes a leak.
  - Hide a leak with a clean patch cut from the take's own clean frames.
  - Count real seconds, through slow motion and inserts too.
  - Two burst words never overlap: shorten them.

## 8. Find the odd one (spot-the-difference grid)

- **Fun**: sharp eyes. Three boards, each difference smaller than the last, and the last needs a
  magnifier only 1% would think of. A wrong tap's hiss is the limit.
- **Board**: a 4 by 5 grid of identical cats on cushions, top 30% empty. One state still per level,
  each with exactly one odd cat: a collar color, then a folded ear, then two eye colors.
- **Build**: one generated take per level from its still. Only the odd cat reacts.
- **Timeline**: 0 to 2 s level 1, found fast. 2 to 4.5 s level 2 HARD: tap, the odd cat leaps and
  flips, NICE!. 5 s level 3 at 1%, a 5 s timer in real seconds. A wrong tap gets a red X and an
  angry puff, the magnifier sweeps and enlarges the eyes, tap, the odd cat leaps, TOP 1%!, stars.
  Close-up insert. 11 to 15 s end card.
- **UI**: hook, level badge, found counter, timer, hand, X ring, magnifier, FOUND!, NICE!, TOP 1%!,
  end card.
- **End card**: the game's own screen. The results card with a TOP 1% rank badge, the odd cat
  sitting on it, the label where "next level" sits: "TRY LEVEL 4".
- **Notes**:
  - A take cannot be aimed at one grid cell. Zoom the first frame on the cell, then scale the take
    back into the grid.
  - Animal sounds come from a sound-effect model; speech models cannot meow.
  - Prompt "every other cat stays perfectly still in its idle pose". Every cat celebrated in unison.
  - Put the hand on the cell that reacts on frames, not the one named in the prompt.

## 9. Parking jam escape (car puzzle)

- **Fun**: cleverness, then order. One tiny car nobody looks at unlocks the jam, and sixteen
  vehicles pour out in a combo. Three wrong taps that bonk and a GRIDLOCK! are the limit.
- **Board**: a packed top-down lot with one exit road: a truck, a bus, cars, and one tiny key car.
  Build it for the rule and check every move with a small board simulator: no overlaps, no vehicle
  passing through another.
- **Build**: scripted. Pieces cut from the still, animated locally from the move list, rendered as
  full-frame H.264. Only the driver insert is generated.
- **Timeline**: 0 s packed lot, a 3 s timer. 0.3, 1.2, and 1.7 s fail taps: each vehicle lurches,
  bonks, bounces back, angry puff. 2.1 s driver insert pounding the horn. 3.0 s GRIDLOCK!, the timer
  refills. 4.1 s tap on the tiny car under a punch-in, it exits, 1/16. Two more exits, a truck
  U-turn in slow motion. 6.8 to 9.6 s the flood: 13 taps, 16 exits, combo x4, x8, x16. 9.7 s
  CLEARED!, stars. 11 to 15 s end card.
- **UI**: hook, level badge, cars-out counter, timer, combo badge, hand, puffs, GRIDLOCK!, CLEARED!,
  stars, end card.
- **End card**: cliffhanger. The next, tighter lot frozen, the driver honking at it from the cab.
  Label "CLEAR THE NEXT LOT".
- **Notes**:
  - A generic angry driver drifted into a famous game character: red cap, mustache, blue shirt. Name
    an original look (beard, knit beanie, flannel) and check the still before animating.
  - Premix the flood's 55 sound events into one stem: compose takes at most 49 audio layers.
  - Pitch each exit's squeal up a semitone, so the flood climbs.
  - Count vehicles on the board, never in the plan. A win shipped with one car under the HUD.

## 10. Excavation reveal (dig ASMR)

- **Fun**: power and discovery. Every layer hands over a bigger tool, brush on sand, chisel on rock,
  drill on ice, until the ice plates lift off a golden skull. A drill bite too close is the scare.
- **Board**: a top-down tray in a wooden frame, the three tools below. One state still per layer:
  sand, rock, ice with the skull showing through, clean skull. The skull keeps one shape.
- **Build**: chained stages, one take per tool, pinned from one layer's still to the next.
- **Timeline**: 0 to 2.5 s the brush sweeps, progress in 8% steps, the brush is dropped. 2.5 s a tap
  unlocks the chisel, two strikes crack the rock, gold glints. 5.1 s the drill: first bite, CAREFUL!
  with a red edge pulse, second bite under a punch-in. The crack rings the skull, the plates lift,
  100%, LEGENDARY!, stars. Reaction insert. 11 to 15 s end card.
- **UI**: hook, dig badge, progress pill, tool tiles, hand on each tool, unlock bursts, CAREFUL!,
  LEGENDARY!, stars, end card.
- **End card**: the hero carries it. The golden skull rises from the tray as a full skeleton and
  holds up a blank slab carrying the label "DIG NOW", the tools resting below.
- **Notes**:
  - Step the progress at the midpoint between measured values. Stepping when a value is reached
    lagged one step behind the board.
  - Say where a crack runs. A drill crack touched the skull.
  - Each unlock tap lands on the tool used next, and the hand rides each tool.
  - State "sand never disappears by itself" and "the skull is only uncovered, it never moves".

## 11. Cascade combo (match-3)

- **Fun**: cleverness and order. Three moves: build a color bomb, blow up the biggest color, then
  the one swap nobody tries, the bomb onto a stripe, clears the whole board.
- **Board**: an 8 by 8 grid of five gem types in a gold frame, a locked front camera.
- **Build**: scripted whole. Gems cut from the still, every move simulated, the render checked cell
  by cell against the simulation (18,165 checks, 0 mismatches). No video take swapped two gems
  cleanly.
- **Timeline**: 0.3 s move 1, five in a row, COLOR BOMB!. 2 s move 2, the bomb onto a ruby: a vortex
  pulls 16 rubies in and implodes, cascades to x5. 5.6 s a near-fail hover over the obvious swap,
  MOVES 1 turns red, heartbeats. 6.5 s move 3, the bomb onto the stripe under a punch-in, 17 beams
  clear all 64 cells, x22. 9 s BOARD CLEAR!, +10,000. A short rain refill. 11 to 15 s end card.
- **UI**: hook, level badge, moves, score, combo badge, hand, COLOR BOMB!, BOARD CLEAR!, stars, end
  card.
- **End card**: the game's own screen. The level-complete board, stars filling one by one over the
  final score, the label where "next level" sits: "TRY LEVEL 2".
- **Notes**:
  - The hover over the obvious move sells the clever one.
  - Step the combo only on a visible clear. Beams that clear nothing are cut.
  - Gems never hang over a gap for more than 0.3 s.

## 12. Broke to cozy (idle tycoon makeover)

- **Fun**: growth. Three taps turn a dead cafe into the busiest spot in town. The customer who
  stomps out of the broke cafe is the limit.
- **Board**: an isometric cafe cutaway. One state still per upgrade, each edited from the last: the
  broke room, the counter rebuilt, tables, the patio. Walls, door, and worker keep their pixels.
- **Build**: chained stages, with generated takes for the customers.
- **Timeline**: 0.6 s the machine sputters, NO SALE!, the customer stomps out, sad worker insert.
  2.4 s tap 1 on a cup bubble, the counter rebuilds on music lift 1, first sale. A waiting
  customer's patience ring drains, tap 2, tables poof in. 7.2 s tap 3, the patio rebuilds on music
  lift 2. A rush, happy insert, then a VIP takes a golden cup: VIP!, gold bills, the big jump. 11 to
  15 s end card.
- **UI**: hook, day badge, cash counter, upgrade bubbles, patience ring, hand, bills to the counter,
  NO SALE!, VIP!, end card.
- **End card**: the hero carries it. The worker flips the blank door sign to the label "OPEN YOUR
  CAFE" while the queue outside keeps growing.
- **Notes**:
  - Cash comes only from handovers the viewer sees. Generated customers walked in already holding
    cups; they pay nothing.
  - Crowd figures drift: a beanie changed shape, one figure split in two. Cover them with an insert.
  - Land each music lift on its tap.

## 13. Swallow and grow (hole game)

- **Fun**: power and growth: start as a manhole, end by swallowing the block. The taxi that rattles
  across the rim under TOO BIG! is the limit: eat small things, grow, come back, and it drops in.
- **Board**: a toy city, high three-quarter view. A row of sidewalk props (cones, hydrant, can,
  mailbox, bench), a taxi at the curb, houses, a tower.
- **Build**: generated takes for the loose physics. The taxi beat is scripted from plates and
  cut-outs: every take grew the hole before the bench was eaten.
- **Timeline**: 0 s a tiny hole, the finger on its near rim. 0.4 to 1.2 s five props tip in, SIZE 2
  to 6. 1.5 s the taxi bridges the rim and rattles, TOO BIG!. A drag away, the bench tips in, the
  rim widens. 2.9 s back to the taxi: its nose dips, it falls in, punch-in, NICE!. Cars, houses,
  then the tower, with a stunned office worker insert and slow motion. The camera pulls back as the
  block tumbles in, HUGE! at 10.3 s. 11 to 15 s end card.
- **UI**: hook, SIZE counter, level badge, hand on the rim, TOO BIG!, NICE!, impact burst, HUGE!,
  end card.
- **End card**: the payoff keeps going. The hole keeps swallowing the city behind the icon as the
  camera pulls back further. Label "SWALLOW THE CITY".
- **Notes**:
  - Plan the hole's on-screen width per beat, and pull the camera back as it grows. It reached 51%
    of the frame after the taxi, too big too early.
  - Video members balloon or shrink a growing subject against pinned frames. Script the growth, or
    pin a still for every size.
  - State "exactly ONE black hole" that "never splits, never duplicates".
  - Step SIZE only after an object is inside.

## 14. Evolve and smash (evolution runner)

- **Fun**: growth into power. A swipe changes lanes, and the creature snatches orbs, swells in an
  evolve burst, and blasts the wall to rubble. The wall is the limit only the final form breaks.
- **Board**: a three-lane runway from behind, a small creature in the center lane, orbs zigzagging
  across lanes. A second still: the creature as the setup ends it, a hurdle with an orb above its
  bar, a stone wall at the end.
- **Clips**: two, first frame only, a chase camera. Setup take 6 s: two lane pickups, evolve. Payoff
  take 10 s: a jump, pickups, a huge evolve, the smash.
- **Timeline**: 0.3 to 2.8 s swipes, pickups, evolve. 3.5 s cut under a white wipe. 9 to 10.7 s
  SMASH IT! taps, then impact. 11.5 to 15 s end card.
- **UI**: hook, level bar, hand, evolve bursts, SMASH IT!, end card.
- **End card**: the hero carries it. The final form stomps out of the rubble toward the camera and
  slams down a blank stone slab carrying the label "EVOLVE YOURS".
- **Notes**:
  - Spread collectibles across lanes. Orbs in a row gave the swipes no reason.
  - End on the last solid frame before impact, flash opaque, resume on rubble. The creature ghosted
    through the wall.
  - One swipe per lane change, none on straight runs. The hand led the creature by 0.5 s.
  - Step the level evenly per pickup. One hidden orb jumped it from 30 to 99.

## 15. Perfect stack (timing tower)

- **Fun**: growth through timing: from three floors on a street to a tower that touches the moon,
  one tap per floor. The first module that misses and topples is the limit.
- **Board**: a toy city street, a three-floor tower of colored modules, a module swinging from a
  crane. Sky stills for the clouds, the sunset, and the moon as the camera rises.
- **Build**: generated takes for the swing and the landings. The last drop is scripted as a 2D
  board: both takes lowered the penthouse onto the tower instead of dropping it.
- **Timeline**: 0.2 s tap, the module misses and topples to the street, FAIL, rewind. Three PERFECT
  drops, x2, x3, the camera rising. 5.3 s an off-center landing: the tower sways, red edge pulse.
  6.5 s the next floor recenters it: SAVED!. A rush of three drops into the clouds, sunset, moon.
  The golden penthouse falls in slow motion, PERFECT x4!, a resident waves from its balcony, TO THE
  MOON!. 11 to 15 s end card.
- **UI**: hook, floor counter, level badge, hand per tap, FAIL, PERFECT! words, warning, SAVED!,
  stars, end card.
- **End card**: the payoff keeps going. The tower sways against the moon, the resident waves, and
  the crane swings in the next module, the label on its side: "STACK HIGHER".
- **Notes**:
  - Video members lower a block onto the stack and let go. Script any drop that must fall after
    release.
  - A near-topple saved by the next drop is the escalation beat.
  - Trim before any morph. A fallen block turned into a ghost.

## 16. Trick shot (ricochet puzzle)

- **Fun**: cleverness. The one shot nobody would try: fire behind you into the crystal, and five
  balls clear the wave. The first shot that grazes the last robot is the limit.
- **Board**: a top-down lab with walls, 45 degree bumpers, the hero at the bottom, robots, and a
  crystal. Give positions in percent.
- **Build**: scripted. A path simulator gives exact reflections and contact times; pieces cut from
  the still move on it. Only the robot close-up is generated.
- **Timeline**: 0.5 s shot 1 banks off five numbered bumpers, two robots pop, the ball grazes the
  third and drains in slow motion. 3.5 s smug robot insert. 4.3 s six robots beam in, WAVE 2!. 5.9 s
  shot 2 fires backwards into the crystal, slow motion and punch-in, the ball splits, x5!. Robots
  pop, three balls drain, the smug one pops last. 9.5 s ALL CLEAR!, stars. 11 to 15 s end card.
- **UI**: hook, robot counter, shots, aim line, hand, bumper numbers, WAVE 2!, x5!, ALL CLEAR!,
  stars, end card.
- **End card**: cliffhanger. The next wave beams in, a giant robot behind it, the aim line waiting
  at the nozzle. Label "TAKE THE SHOT".
- **Notes**:
  - The ball is the fantasy, so it must read on a phone. 36 px on a 1080 frame was lost; 42 px with
    a white core, a dark rim, and a 7-frame comet trail read.
  - Draw each contact at the surface, never inside the wall.
  - A pop counts on the counter when its icon lands, about 0.3 s after the pop.
  - Start the aim line at the nozzle, along the real path.
