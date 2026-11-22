# Archetype: crowd runner with math gates

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). Hook "Pick the right gate, build the biggest army". Active run: end card at 35.5
s (win, "LEVEL COMPLETE!"). Untouched: the crowd waits at the start line, and the idle timeout shows
the end card at 10.0 s with `progress` 0. Meta 653 KB.

## Controls

- **Drag left or right anywhere.** It is a relative drag, not jump-to-finger: the crowd sits at
  `u0 + finger_dx / pxPerU` (220 logical px per lane unit), smoothed with a lerp of about 12/s and
  clamped to the track. Forward motion is automatic once the run starts: that is the genre, not a
  move.
- The whole crowd goes through the gate under its center.
- **Before the first touch the game waits, alive.** The clock and the distance run are held. The 5
  units face the viewer at the start line, hopping, squashing and blinking. The better side of gate
  1 (+10) pulses and glows, and arrows flow up its lane. The hand loops a press-and-swipe toward +10
  on the SWIPE TO MOVE bar every 2.2 s. The first touch starts the run; nothing ever steers for the
  player.
- After the first touch, the hand returns after 2.5 s idle and points at the better gate. It only
  points. A held finger does not count as idle.

## Beat sheet (35–45 s)

| Time          | Beat                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| wait          | Hook: 5 units at the start line, **gate 1 already readable**, "PICK THE RIGHT GATE!", the enemy pack visible at the goal with a "?" bubble |
| 2 / 5.5 / 9 s | Gates 1–3 (+10 / -3, x2 / -5, +15 / ÷2): each forces a swipe to the other side                                                             |
| 12.5 s        | Ambush: 8 enemies on the left half. Dodge it or lose a few units                                                                           |
| 16 s          | Math moment: two blue gates (x2 vs +30); the better one sparkles after you pass                                                            |
| 19 s          | Last gate (+20 / -20), speed +10%                                                                                                          |
| ~23 s         | Army reveal: the "?" bubble pops to the real count, "CHARGE!"                                                                              |
| 25.5–31 s     | **Signature clash:** the front rows cancel 1:1 at a contact line, both bubbles race down, slow-mo for the last 4 units                     |
| result        | "LEVEL COMPLETE!" (cheer, march to the castle, confetti, +250 coins) or "SO CLOSE! 1 UNIT SHORT" (one enemy left)                          |

Endings: goal (the clash), a 40 s gameplay round cap ("TIME'S UP!" with the real army size; the
clash comes at 25.5 s, so it is a safety net), or 10 s with no input. Untouched, that goes straight
to the end card titled "BUILD THE BIGGEST ARMY!" with no stats. Mid-run, "ARMY OF N / THE ENEMY IS
WAITING" shows for 1.5 s first.

## Tuning that made win and near-fail reliable

- Pseudo-3D on a static plate. Each object has a runway distance `s`, depth `z = 1 + s - S`, and is
  projected with `y = 144 + 816 / z` (plate units). The runway half-width is `424 / z`. Measure the
  constants from the plate's edges. Scrolling chevrons sell the motion.
- Speed is 2.4 runway units/s, 2.64 after the last gate. Place gates by **arrival time**, not
  distance.
- The better gate is decided at the moment of passing, from the live count. At 15, +30 beats x2.
- Floors: before the clash the count never drops below 1.
- **The enemy army is sized at the reveal, from the player's own picks.** A better gate counts only
  if the player picked it while steering (finger down, or input within the last 3 s).
  - 3 or more own better gates: `enemies = max(10, round(0.7 × count))`. The active bot arrives with
    110 against 77 and wins with 33 left.
  - Otherwise: `enemies = count + 1`. The fail bot arrives with 1 against 2 and loses to the last
    enemy. Nothing steers for the player, so only a player who plays reaches the clash; one who
    steers badly gets the near-fail.
- "1 UNIT SHORT" is honest only because `count + 1` always leaves exactly one enemy. Compute the
  line from the enemies left if you change the sizing.
- Clash rate `max(count, enemies) / 5` units per second (about 5 s). The result holds for 4.6 s
  before the end card.
- Crowd: phyllotaxis slots. When a unit dies, the outermost unit takes its slot, so the blob shrinks
  from the rim. Re-indexing everyone smeared the crowd into a column. **Draw at most 70 units** and
  let the bubble show the true count.
- Sounds: no sound repeats faster than about 3 times a second. The clash SFX repeats every 1.5 s for
  the whole clash. Payoffs duck the music: 0.12 for the clash, back to the configured 0.35 on a win,
  0.15 under the fail sting, 0.25 on the end card.

## QA bot pattern

- `qa()` exposes:
  - `progress` (the distance run, 0 until the first touch), `phase` (`wait`, `play`, ...), `count`,
    `result`;
  - `u` (crowd lane) and `u0` (lane at touch-down), `pxPerU` and `maxU`;
  - `next` = `{kind, i, z, better, worse}` for the next item; `enemies` once revealed; `cta` and
    `pill`.
- Both bots treat `wait` like `play`, so their first move starts the run.
- `active`: steer to `next.better * 0.5` with `{"move": ((target - u0) * pxPerU / 70, 0)}`. The 70
  is `qa.py`'s joystick radius in logical px.
- `fail`: steer to the worse gate and walk into the ambush.
- Storyboard: hook (1 s), gate 2 (`gateNear` nth 1), the ambush, the math gate, the reveal, the
  clash, the result, the end card. `COMPARE` pairs them with the screenshot and the gameplay
  recording's frames of the +20 gate, the x3 gate, the clash and the win. `STORYBOARD_IDLE`: the
  waiting hook at 0.1 s, still waiting at 6 s, the idle end card.

## Asset map

Image edits use an instruction-editing image model; pick it with `recommend`.

| Element                                                                                                   | Source                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level backdrop (sky, sea, castle, runway)                                                                 | Image edit of the screenshot with the crowd, gates, enemies, bubbles, background characters and HUD removed                                                      |
| Unit run (2 frames, back view), unit cheer (front), enemy, **blank** blue and red gate panels             | Image edit of the screenshot, one transparent 3×2 sheet, cut by empty-alpha bands (the cells are never exact). Ask for blank panels and draw the numbers in code |
| Blinking eyes on the waiting units                                                                        | code, lids drawn over the cheer sprite                                                                                                                           |
| Level pill, progress bar, unit marker, checkered flag, coin pill, second currency icon, SWIPE TO MOVE bar | screenshot crops. Key out the sky, paint out the baked fingertip, redraw every baked number                                                                      |
| Logo                                                                                                      | the intake logo, flood-filled off its navy background, padded to 1.75:1 for the end card                                                                         |
| Clash look (puffs, stars, red bits)                                                                       | matched to the gameplay recording's clash moment                                                                                                                 |
| Chevrons, puffs, stars, confetti, coins, bubbles' numbers                                                 | code                                                                                                                                                             |
| Hand                                                                                                      | the shared hint hand, `PA.draw.hand`                                                                                                                             |
| SFX                                                                                                       | gate good, gate bad, pop (unit added), clash, win, fail                                                                                                          |

## Mistakes seen

- Gate 1 started as a dot on the horizon. The hook had no readable gate. It now arrives at 2 s and
  its labels never drop below 34 logical px.
- Gates drawn in front of the crowd while it passes through them. Fade a gate out once it is nearer
  than the crowd.
- The enemy army appeared only at the reveal. Show it at the goal from frame 0, with "?".
- With 120 drawn units the crowd reads as a carpet, not as units.
- The clash SFX was quiet (-33 dB mean). Compress and limit it, repeat it through the clash, and
  duck the music.
- The hook pixel change is 3.4%, just over the 3% floor. Keep the waiting screen busy enough.
- This build still plays the unit-added pop with `minGap` 0.045. Raise it to 0.33.
