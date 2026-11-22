# Archetype: horde / survivor shooter

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). Hook "From one gun to a screen-clearing storm" (power spike). Active run: end
card at 35.1 s (win, "WAVE CLEARED!"). Untouched: the game waits, and the idle timeout shows the end
card at 10.0 s with `progress` 0. Meta 905 KB.

## Controls

- **Point and go.** Tap the floor and the hero walks there (310 px/s); hold and slide to keep
  steering. A pulsing ring marks the destination. Shooting is automatic at the nearest critter, as
  in the source game.
- **Set the destination on pointerdown**, not on move or up. A quick tap can press and release
  between two frames, and a first build lost those taps.
- **Tap a card** at level-up. The hand points at the middle card; nothing is picked for the player.
- **Tap "TAP TO UNLEASH!"** for the shockwave. The game waits in 0.4× slow-mo until the player taps
  it.
- **Before the first touch the game waits, alive.** The gameplay clock is held: no spawning, firing
  or XP. The swarm wiggles in place, the logo and "SURVIVE THE SWARM!" pop in, and the hand taps the
  most open floor spot of 12 around the hero, with a ring and "TAP TO MOVE". The hero does not move
  until the player taps.
- After the first touch, the hand returns after 2.5 s idle and only points at a new open spot.

## Beat sheet (35–45 s)

| Time    | Beat          | What the viewer sees                                                                      |
| ------- | ------------- | ----------------------------------------------------------------------------------------- |
| wait    | Hook          | Arena with hero and critters, logo, "SURVIVE THE SWARM!", the hand tapping the floor      |
| 0–6.5 s | Core loop     | Kills, confetti, damage numbers; XP gems fly in; the XP bar fills fast                    |
| ~6.5 s  | Level-up 1    | Slow-mo and 3 cards with the game's weapon icons: Split Shot, Drone Ring, Twin Turret     |
| 7–14 s  | Power spike   | The chosen weapon visibly shreds; the swarm grows                                         |
| ~15 s   | Level-up 2    | The 2 cards not taken plus Rocket Barrage                                                 |
| 15–22 s | Escalation    | Critters from every edge of the floor; chip damage                                        |
| ~22.5 s | **Signature** | XP bar maxes, "TAP TO UNLEASH!": a ring plus chain lightning wipes the screen, HP refills |
| ~25.5 s | Brute         | Warning, then the elite beetle drops in onto the floor and charges; dodge and focus fire  |
| ~32.5 s | Result        | "WAVE CLEARED!" or "SO CLOSE!" with "Brute at N% HP" read from the brute                  |

Endings: goal (brute down or hero down), a 50 s gameplay time cap ("SO CLOSE!"), or 10 s with no
input straight to the end card. Untouched, the end-card title is "CAN YOU SURVIVE?" and the clock
reads 0:00.

## Tuning that made win and near-fail reliable

- XP stages of 12, 22 and 30 gems. Earliest completion times 6.5, 14 and 21 s. After 7.5, 15.5 and
  22.5 s a gem vacuum helps a slow player catch up. These only run while the player plays: the clock
  is held before the first touch.
- HP 100. Critters deal 4 per touch with a 0.5 s cooldown each. **HP cannot drop below 40 before the
  brute.** The shockwave refills HP to 100.
- **Brute HP = 5 × the build's estimated DPS**, so the fight lasts about 5 s. Fights of 12–20 s made
  a bad ad. It charges for 50 and touches for 20 (0.8 s cooldown). It times out after 14 s: "SO
  CLOSE!".
- **Always target the brute.** In the brute phase the blaster and the rockets aim at it (950 px
  range).
- **Drones must not reward hugging the brute.** At 0.3 s per hit, walking into it out-damaged
  dodging and the fail bot won 1 run in 4. At 0.6 s per hit on the brute it lost 7 of 7.
- The near-fail belongs to a player who stands still or walks into the brute. A dodging player wins.
- **Arena polygon.** Trace the stone floor of the plate (`ARENA` in `src/game.js`) and clamp every
  actor to it, shrunk per actor (hero 34 px, critters 20 px, brute 90 px). Critters crawl in from
  its edge, off screen when possible; a charge stops at its edge. Unclamped critters walked over
  grass and cliffs.
- **The brute drops in onto the floor**: a 0.65 s fall from 760 px above, at a spot clamped to the
  polygon and at least 500 px below the top of the camera, then a dust burst and shake. In a first
  build it walked in over the ruins around the floor.
- **4-direction walk from 2 rows.** The walk sheet has front-right and back-right rows of 4 frames;
  mirror them for the left diagonals. Step frames by distance walked (one frame per 26 px), not by
  time, so the feet do not slide. One crop box per row keeps the feet planted (frames line up within
  3 px).
- Sounds: no sound repeats faster than about 3 times a second (`minGap` ≥ 0.33 in `PA.audio.play`).
  Payoff sounds duck the music: level-up ducks it to 0.2, the result to 0.25. The blaster shot sound
  was removed as annoying.

## QA bot pattern

- `qa()` exposes `phase`, `t`, `progress` (the gameplay clock, 0 until the first touch), `stage`,
  `level`, `kills`, `result`, `hero` (`x, y, hp` and client `sx, sy`), `brute`
  (`hp, max, state, dx, dy`, client `sx, sy`), `cards` (client centers), `nova` (the button center
  while it is ready) and `cta`.
- The bot moves by `{"click": ...}` 85 px from the hero, because movement is point-and-go.
- `active`: tap a card (cycling the index) and tap the shockwave when it is ready. Sidestep the
  brute's charge lane toward the side with more room, back off inside 380 px, and circle it at
  range; otherwise circle the arena center.
- `fail`: pick the first card, tap the shockwave, keep tapping the hero's own spot (stands still),
  then tap the brute and walk into it. It loses at about 28.5 s.
- Storyboard: hook (1 s), core loop (5 s), the `levelup` event +0.6 s, `pick` +6 s, `nova` +0.25 s,
  the brute wind-up (a `snap` trigger), the end card. `COMPARE` pairs them with the screenshot and
  the recording frames at 2, 4.5, 6 and 7.8 s. `STORYBOARD_IDLE`: the waiting hook at 0.1 s, still
  waiting at 6 s, the idle end card.

## Asset map

Image rows use an instruction-editing image model; pick it with `recommend`.

| Element                                                        | Source                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Arena                                                          | image edit of the screenshot: characters, gems, effects and HUD removed (1152×2048). The camera pans a 1.5× world |
| Critter (2 frames), elite beetle, gem                          | image edit of the screenshot, one transparent 3×2 sheet, `alpha_floor: 60` against glow halos                     |
| Hero walk (2 rows × 4 frames)                                  | image edit, references: the 3×2 sheet and the screenshot, 2048×1024 transparent                                   |
| Weapon and card icons                                          | crops of the screenshot HUD                                                                                       |
| Logo                                                           | the intake logo, cut from its background                                                                          |
| Shockwave look (turquoise ring, pink confetti, lightning)      | matched to the recording's payoff, about 6 s                                                                      |
| Bolts, confetti, ring, lightning, drones, bars, cards, numbers | code                                                                                                              |
| Hand                                                           | the shared hint hand, `PA.draw.hand`                                                                              |
| SFX                                                            | sound-effect model: pop, gem, level-up, shockwave, roar (one take each is enough)                                 |

## Mistakes seen

- A slow-mo tween that got interrupted left the game at 0.4× speed. Always use `PA.setTimeScale`.
- Damage numbers drawn after the card overlay show through it. Draw the UI fx before the cards.
- The brute landed under the PLAY FREE pill. Land it at least 80 px below the HUD.
- The swarm was much thinner than in the intake screenshot. Match the on-screen density of the
  intake.
- The bot froze while Chromium took a storyboard screenshot and ate a brute charge. `qa.py` now
  pauses the game for every screenshot.
- This build still plays the critter pop with `minGap` 0.035 and the gem pickup with 0.045, and the
  shockwave does not duck the music. Raise both gaps to 0.33 and duck under the shockwave.
