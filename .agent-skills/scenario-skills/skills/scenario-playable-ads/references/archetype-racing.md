# Archetype: racing (time trial)

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). The source was a landscape gameplay recording of a 3D racer: the vehicle races a
twisting neon track in space, through gates, toward a giant star. Hook "BEAT 00:35:50!". **Real 3D**
with three.js (see [3d-games.md](3d-games.md)). Active run: win in a 33.5 s race, end card at 37.3
s. Untouched: the vehicle idles in the start tunnel, and the idle timeout shows the end card at 10.0
s with `progress` 0. Meta 1,594 KB (three.js 473 KB, vehicle mesh 193 KB), Google ZIP 893 KB.

A time trial has no opponents: the rival is the record. If the game has opponents, the same
structure holds, with "overtake into first place at the line" as the payoff.

## Controls

- **Drag left or right anywhere** to steer: the recording's floating joystick, made relative. The
  target lateral position is `x0 + finger_dx / 55 px per meter`, clamped to the rails at ±2.7 m. Two
  white rings (the game's joystick look) sit under the finger.
- **Tap BOOST** (the game's orange ability button): a flaming warp ring opens about 25 m ahead.
  Flying through it gives the warp (3 s at 66 m/s, the fire tunnel, FOV +14°). **The one choice:**
  boost on a straight. Boosting into a bend slams the vehicle into the rail.
- Forward motion is automatic once the race starts (the genre), never before the first touch.
- Before the first touch: the vehicle idles in the ring tunnel, the rings pulse, the camera sways,
  and the hand loops a left-right drag. "BEAT 00:35:50! / DRAG TO STEER" sits on a plate.
- The other ability buttons are **locked**: a padlock and a toast, never a CTA. They double as the
  tease ("3 MORE ABILITIES" on the end card).

## Beat sheet (35–45 s)

| Time after the first drag | Beat                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 0 s                       | Launch surge, the clock starts, the tunnel streams past                                                        |
| 4.6 s                     | Gate 1: "+15 EXP"                                                                                              |
| 5–8 s                     | S-bend with a drop (chevron sign): steer into the bend or scrape the rail                                      |
| 9.4 s                     | Gate 2 completes a charge: "BOOST READY!" as a callout over the button (not a banner over the track)           |
| **10.0 s**                | **Signature:** the flaming ring, WARP!, the fire tunnel and speed lines down the long straight toward the star |
| 13–30 s                   | Banked climbs and drops, gates 3–6, warps 2 and 3                                                              |
| 33.5 s                    | Finish ring: "NEW RECORD! 00:33:46, 2.04 s faster"                                                             |
| +3 s                      | End card: your time, EXP, the record, the vehicle, 3 locked abilities                                          |

Endings: the line (goal), a 45 s time cap ("TIME'S UP! 40 m to the finish line"), and the idle
timeout (untouched: the end card with "BEAT THE RECORD!"; once started, "TIME OUT! N m to the finish
line" for 1.4 s first).

## Tuning that made win and near-fail reliable

- **Sim first.** The physics lives in one file (`src/track.js`) shared by the game and a headless
  Node sim (`tools_local/sim.js`) that runs the QA bot policies. Tune in the sim, then run QA:
  results matched to 0.1 s.
- **The record decides the near-fail:** set it so a good racer needs every boost.

  | Player                    | Result                         |
  | ------------------------- | ------------------------------ |
  | center line, 3 warps      | 33.6 s, win by 1.9 s           |
  | 2 warps                   | 36.3 s, "SO CLOSE" (0.8 s off) |
  | 1 warp                    | 39.2 s, "NICE TRY" (3.6 s off) |
  | drifts wide, never boosts | time cap, 40 m short           |

- Speeds: base 36 m/s, 50 approaching the ring, 66 in the warp. A rail scrape multiplies the target
  speed by 0.72.
- Drift in bends: `push = -k · v² · 1.3` (k = yaw curvature in rad/m), steering spring 6/s. The
  hardest bend (80° over 130 m) needs about 2.5 m of counter-steer, so steering matters.
- Boost charges come from **clean gates** (2 clean gates = 1 charge). Put gates where the bends ease
  off: two gates placed mid-bend were clipped even on a perfect line (caught in the sim).
- **Honest numbers:** a gold record-pace marker on the progress bar and a live `+/- s` delta; result
  lines show the real gap in seconds or meters.
- Mechanics the recording does not show (what the ability does, whether you can fall off) are
  design. List them as open questions for the user.

## QA bot pattern

- `qa()` exposes:
  - `x0` (lane at touch-down) and `pxPerM` (drag gain);
  - `best`: the lateral position that cancels the outward push in the current bend;
  - `boostGood` (a charge and a straight ahead) and `boost` (the button, client px);
  - `progress` = race clock + distance.
- `active`: tap `boost` when `boostGood`, else steer to `best` with
  `{"move": ((best - x0) * pxPerM / 70, 0)}`.
- `fail`: steer to `-0.8 · best` (drifts wide into the rails) and never boost.
- Storyboard: hook, launch, first gate, the ring, the warp, a bend, the third warp, result, end
  card. `STORYBOARD_IDLE`: the hook at 0.6 s, the waiting vehicle at 5 s, the idle end card.
  `COMPARE` uses recording frames for the hook, launch, ring, warp and bend.
- A 3D run takes about 2.5 min at `--speed 2` (WebGL through SwiftShader), against about 1 min for
  2D games.

## Asset map

Pick each model with `recommend`.

| Element                                                                                            | Source                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nebula sky (2:1 panorama on an inside-out sphere)                                                  | image edit of `f_13.0` + `f_15.6` crops (without any overlay on the frames); track, vehicle, HUD, star and text removed                                            |
| Star, warp ring, chevron sign, tunnel ring, gate prism, fire band                                  | world sheet (transparent, from an image model) from `f_13.0`, `f_9.6`, `f_10.4`, `f_6.4`, `f_0.3`; cut with `crop` + `largest_blob: false` because the glows touch |
| Track tile texture (seamless)                                                                      | image model, from crops of `f_0.3` and `f_17.6`                                                                                                                    |
| Vehicle (3D mesh, 7.7k triangles, baked chrome)                                                    | image-to-3D model run on a clean render (an image edit of crops of `f_13.0` and `f_11.0`); packed with `scripts/pack_glb.py --yaw -10`                             |
| Timer plate, BOOST and locked ability buttons, hex badge                                           | HUD sheet (transparent, blank, from an image model) from the HUD crop of `f_6.4`; numbers redrawn; the pause tab cropped off                                       |
| Track ribbon, glowing edges, glow lane, skirts, beacons, finish strip, joystick rings, speed lines | code, matched to `f_0.3`, `f_15.6`, `f_17.6`, `f_19.2`                                                                                                             |
| Logo                                                                                               | image model, transparent, frames as style references (the studio gave none)                                                                                        |
| Font                                                                                               | Orbitron ExtraBold (bundled), closest to the game's timer digits                                                                                                   |
| SFX: launch, gate, warp, scrape, win, fail; music                                                  | sound-effect model, 1 take each; music model, 30 s at 140 BPM                                                                                                      |

## Mistakes seen

- A cyan glow lane over the whole track width. Match the recording's proportion (a 2 m core).
- A BOOST READY banner covered the warp ring at the moment of boosting. Use a callout over the
  button.
- Gates mid-bend that a perfect line still clips.
- A timer plate cropped with its pause tab, which looks tappable. Crop off or lock every
  non-functional control.
- An unlit vehicle (baked chrome) does not pick up the warp glow; acceptable, but note it.
- Untested on a low-end phone's GPU. Cap the WebGL buffer (720 px wide, pixel ratio 1).
