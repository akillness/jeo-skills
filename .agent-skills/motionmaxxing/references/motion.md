# motion.md: how things move

See also: transitions.md (joins between beats), type.md (word cadence and arrival; meaning on the word), ui-demo.md (cursor, press and camera inside UI beats), layout.md (sizes and placement), director.md (film-level clock and grammar), world.md (light, depth, finish, grain; when to use shutter blur), slop.md (review after rendering; conditions for fades and holds), tools.md (`render.mjs --shutter`, `look.py` motion note).

Durations, curves, smear, clocks, camera and physical behaviour for a launch/explainer film. Two kinds of evidence are used. **MEAS** = frame-sampled statistics over 50 moments and 4,288 distinct moves (hook 12, turn 8, proof 24, cta 6; staggered siblings counted once; three tile-mosaic moments excluded). **Moment IDs** (M913...) = single-film observations. Where they disagree the MEAS number is the default and the anecdote is a **signature move** (use rarely, one per film). Transitions between beats are in transitions.md.

Conventions. Time as `s (f@30)`; 1 f = 0.033 s, 3 f = 0.10, 6 f = 0.20, 10 f = 0.33, 15 f = 0.50, 30 f = 1.0. Sizes: % of frame height H or width W; px are on the 1280x720 reference stage (multiply by 1.5 at 1920x1080). Eases are named `M.ease.<name>`: plain t -> value functions (GSAP takes them directly, `ease: M.ease.softLand`, `duration: frames/30`); the runtime exports exactly crashIn, popOver, bounceHard, snapSettle, softLand, whip, glide, cruise, softInOut, gentleIn, accelExit, crashOut. Rule format: **WHEN** situation -> **DO** decision -- *because* effect (IDs).

---

## 1. The measured defaults

### 1.1 Duration by property (MEAS, distinct moves, frames @30)

| Property | n | p10 / p25 / **median** / p75 / p90 | Travel (p25 / median / p75) |
|---|---|---|---|
| translate x | 1121 | 3 / 6 / **12** / 24 / 38 | 19 / 61 / 194 px (1.5 / 4.8 / 15% W) |
| translate y | 1023 | 3 / 6 / **12** / 22 / 33 | 15 / 61 / 179 px (2 / 8.5 / 25% H) |
| scale | 626 | 3 / 5 / **10** / 22 / 36 | 0.11 / 0.25 / 0.55 (delta) |
| rotation | 271 | 3 / 6 / **11** / 21 / 34 | 11 / 25 / 124 deg |
| opacity | 360 | 2 / 4 / **6** / 12 / 20 | 0.73 / 0.96 / 1.0 |
| blur | 391 | 3 / 4 / **7** / 10 / 14 | 2.5 / 5 / 10 px |
| size (w/h) | 175 | 2 / 4 / **8** / 16 / 23 | 15 / 56 / 228 px |

All moves pooled: median **10 f (0.33 s)**. Histogram of k: 2 f 8%, 3 f 5%, 4-5 f 13%, 6-8 f 18%, 9-12 f 15%, 13-18 f 14%, 19-30 f 15%, 31-60 f 10%, 61+ f 2%. So 13% are 2-3 f snaps and 12% run longer than 1 s.

**R1.1** WHEN you set a duration with no other information -> DO use translate/scale entries 12 f (0.40 s), opacity 6 f (0.20 s), blur 7 f (0.23 s), exits 13-14 f for translate and 10 f for scale; treat 6 f and 24 f as the p25 and p75 edges -- *because* these are the measured medians and any film built on 20-30 f ease-outs for everything is slower than the whole sample (MEAS).

### 1.2 Entry vs exit, and role (MEAS)

| Property | Entry median k (p25/75) | Exit median k (p25/75) |
|---|---|---|
| translate x | 12 (6/23) | 14 (7/27) |
| translate y | 12 (6/22) | 13 (7/24) |
| scale | 11 (6/22) | 10 (5/24) |
| rotation | 10 (5/25) | 10 (5/20) |
| opacity | 6 (4/12) | 7 (4/12) |
| blur | 8 (5/11) | 7 (4/9) |

| Role | Translate/scale entry | Translate/scale exit | Opacity entry/exit | Blur entry/exit | Share "snap" curves | Share ease-in | Overshoot share |
|---|---|---|---|---|---|---|---|
| hook | 12-14 f | 10-12 f | 6 / 6 | 7 / 9 | 17% | 23% | 12.3% |
| turn | 12-15 f | 14-16 f | 5 / 6 | 8 / 9 | 10% | 33% | 11.3% |
| proof | 12-14 f | 12-16 f | 7 / 7 | 9 / 6 | 11% | 27% | 5.7% |
| cta | **6 f** | 9-13 f | 4 / 6 | 6 / 6 | **39%** | 30% | 4.3% |

**R1.2** WHEN the beat is a CTA/sign-off -> DO halve the entry times (6 f), make 23% of moves snapSettle and 25% softLand, and keep overshoot out; the 6 f median is for supporting moves (stack, pills, copy), while a hero mark or button runs 18-30 f on snapSettle (close.md C1, C8) -- *because* the close is the most staccato part of a film (CTA median move 6 f vs 10-11 f elsewhere; MEAS).
**R1.3** WHEN the beat is a turn -> DO give it the longest exits (14-16 f) and lean on acceleration (33% ease-in), with up to 11% of moves carrying a late overshoot -- *because* turns are built on things being pulled away and replaced (MEAS).

### 1.3 Landing decelerates, leaving accelerates (MEAS)

| Direction (x/y/scale/rot/blur toward or away from neutral) | Ease-out | Linear | In-out | Ease-in |
|---|---|---|---|---|
| Landing (ends closer to 0 / 1) | **58%** | 14% | 10% | 16% |
| Leaving (ends farther) | 35% | 17% | 11% | **37%** |
| Scale leaving | 33% | 15% | 9% | **42%** (49% of labelled scale exits) |
| Blur leaving | 3% | 19% | 15% | **63%** |
| Translate exits (labelled) | 26-29% | 14% | - | 47-48% |

Typical shapes, % of travel done at 10 / 25 / 50% of the time: snap 50/86/95, firm 26/60/85, soft 9/35/73, linear 9/24/50, S-curve 2/11/41, gentle accel 2/7/23, hard accel 0/2/8. Where ease-in sits: exits 45%, depart 29%, mid-move 24%, entries 16%, settles 14%, moves still going on the last frame 68%.

**R1.4** WHEN an element lands -> DO ease-out (softLand 12 f, glide 10 f, snapSettle 11 f for hero/CTA) -- *because* it reads as heavy and certain; 58% of landings do this (MEAS; M913, M914, M916, M919 land 60-72% of travel in the first 4 f).
**R1.5** WHEN an element leaves across the frame or into a cut -> DO accelerate (accelExit 13 f, crashOut 17 f, gentleIn 9 f) and end at peak speed; 23-29% of exits still ease-out or run linear (shrink-to-centre, blur-outs, things swept by a camera move) so do not make every exit ease-in -- *because* an accelerating exit is "thrown away" and clears the frame with no dead frames; peak speed sits at t~0.9 (MEAS; M920 card 17 -> 111 px/f = 6.5x, M919 button edge 0.37 -> -0.16 W in 5 f).

### 1.4 Opacity, blur, cuts versus fades (MEAS)

- Opacity: 6 f entry, 7 f exit (p25-75: 4-12 f). 23% of opacity tweens are 2-3 f (near-cuts), 44% 4-9 f, 33% >= 10 f. Shapes: linear 32%, softInOut 27%, glide 19%, gentleIn 10%.
- Blur: median travel 5 px (p25-75 2.5-10), 7-8 f. Blur-in lands ease-out 58% / blur-out accelerates 63%.
- Elements mostly arrive and leave by **moving**, not fading: 3,392 transform entries vs 584 opacity fades; exits 60% moves, 15% fades, 25% hard steps. Where an element simply appears or disappears: entry 57% hard 1-frame cut / 43% fade, exit 63% cut / 37% fade.
- 90% of moments use an opacity tween; 42% also use an opacity jump >= 0.5 in one frame; 96% use hard visibility switches (median 20 distinct cut-frames per moment: hook 27, turn 16, proof 22, cta 6).
- Slow colour/opacity ramps exist as a minority (>= 10 f is 33% of opacity moves): ground tint 0.5-0.7 s, grey -> black word 0.33-0.67 s, title alpha 0.8 s, last-phrase fade 10 f linear (M926, M941, M944, M920).

**R1.6** WHEN something enters -> DO make it move (offset, scale or blur decaying) and use opacity only as a 4-6 f helper (0.12-0.3 -> 1) -- *because* motion carries the arrival; a pure opacity fade is the AI default (MEAS; M919, M920).
**R1.7** WHEN a UI piece, row or word should read as a system event -> DO hard-cut it on (1 frame, no fade) -- *because* 16% of entries and 25% of exits in the sample are hard steps and a step reads as state, not animation (MEAS; M939, M940, M921).

### 1.5 Stagger and overlap (MEAS, 97 stagger groups in 25 moments)

| Interval between sibling onsets | 1 f | 2 f | 3 f | 4 f | 5 f | 6 f | 7-9 f | 10-14 f | 15-24 f |
|---|---|---|---|---|---|---|---|---|---|
| Share of all gaps | **56%** | 13% | 8% | 6% | 7% | 2% | 3% | 1% | 4% |

- Per-group median interval 3 f (p25-75: 1-5 f; p10-90: 1-8.6 f). By class: translate 2.2-2.5 f, scale 3, opacity 3, blur 4.8. By role: hook 3.0, turn 1.5, proof 2.2, **cta 8.0 (widest)**. Median group size 4 (p90 15).
- Metronomic (CV < 0.25) 45%, uneven 55%. Overlap: interval / move duration median **0.5** (p25-75 0.27-0.83): siblings overlap, each tail runs under the next entrance.
- What the 1-f gaps are: letters in a row, tiles in a cascade (13 tiles 1 f apart, M918), rows. Whole **words** run slower (2-5 f; 8-12 f when voice-led; see type.md).

**R1.8** WHEN repeated siblings (letters, tiles, rows, avatars) arrive -> DO space onsets 1-3 f apart with uneven gaps (e.g. 3,2,2,2,2,2) and run each move ~2x longer than the gap so tails overlap -- *because* a whole wave under ~0.6 s reads as one gesture; a uniform timer-delay reads as a loading list (MEAS; M933, M935, M918).
**R1.9** WHEN a CTA stack of elements arrives -> DO widen the gaps to ~8 f (0.27 s); CTA words in a blur-resolve still run back-to-back at 4 f each (type.md 3.4) -- *because* the sample's CTA groups are the only ones that slow down (MEAS, 5 groups).

### 1.6 Overshoot: rare, late, small (MEAS)

- 8.8% of moves (k >= 4) overshoot by > 3%: translate x 9%, y 12%, scale 9%, rotation 15%, opacity/blur ~1%. 37 of 50 moments contain at least one. Median overshoot = 19% of that move's own travel (p75 38%, p90 66%).
- Shape: **88% of overshoots > 5% peak after 35% of the duration (median t = 0.65-0.70)**: a slow lean past the mark and back over 15-24 f, not a fast spring. 5% have an anticipation dip first. Early-peak crashes (peak before 35%) are ~1% of moves.
- Where: entries 147, exits 91, depart 31, settle 26. Roles: hook 12.3%, turn 11.3%, proof 5.7%, cta 4.3%.
- Absolute sizes seen in single films are small: button 1.055 (M914), bullet +4.7% (M963), badge +4% (M973), pill 0.51 -> 0.58 W (+14% width) held 3 f then back (M957), card width 0.63 -> 1.06 -> 0.82 W once (M939), phone/rim none (M922).

**R1.10** WHEN you want a bounce -> DO use popOver (peak 1.08 at t=0.72, 15 f) as a small late lean, at most once per beat (hook/turn ~1 in 8 moves, proof/cta ~1 in 18); the one VISIBLE spring of the film is R1.11 -- *because* an overshoot on everything is the AI default; the sample puts it on under 9% and mostly late (MEAS; M914, M948, M973).
**R1.11** WHEN the payoff of a beat needs a physical reward (a card docks, a pill springs out) -> DO make it the film's ONE visible spring: snap to 0.9x of the target, spring to 1.0 over ~0.17 s with a small wobble, children on 2-f stagger with ~0.06 H overshoot (signature move; M948, M957, M939).

### 1.7 Drift and no dead frame (MEAS)

- **Drift moves** (k >= 20 f, flat velocity, linear within RMSE 0.01): 221 distinct in 35 of 50 moments. Median 26 f (0.87 s), translate ~2.5 px/f (median travel 69 px), scale ~1.16x. Slower background creeps seen in single films: 1.1-1.5 px/f (M920, M921 -88 px = 6.9% W over 67 f@60), 0.02 W per 2.9 s (dot grid, M914), 0.027 W/s (M923), 0.07 W/s (tile field, M964).
- **Motion on ~99% of frames (in short moments).** This was measured on **3-7 s moments** from a gallery of dense, prompt-card clips; it is context for how much a held frame should stay alive, **not a target for a whole film**. Human-made whole films are calmer: their mean frame-to-frame luma motion has a median of **6.8 (IQR 4.4-9.8)**, a bright-ground film such as a major hardware launch is still for about 55% of its length, and the user has picked the calm, legible film over the frantic one. `look.py` prints your film's number as a *question*, not a gate: above ~10, does the film breathe anywhere? Below ~3, does it exist? Median share of perceptually still frames 1.1%; median longest still run 1 f; p90 3 f. Overall 8.5% of frames in the sample are still (604 of 7,091), mostly short stepped-motion stills. Still runs >= 6 f in 20% of moments, >= 12 f in 10%, >= 24 f in 2% (one end-card hold, 110 f, M946). At the "noticeable" threshold (0.5 px/f) 28% of moments park for >= 6 f; CTAs park longest (median run 12 f, 50% of CTAs >= 12 f; hook 0.6% parked frames, turn 6.8%, proof 3.0%, cta 9.0%).
- Legit long holds are all payoffs: readable list 0.8 s (M939), shape pile 0.8-1.0 s (M938), static lockup 0.67 s (M968), headline 0.67 s with solid caret (M969), living mark 3.66 s with tip sway +-1% W (M946, a measured outlier: your end hold stays <= 1.4 s, gate G3), single number 0.47 s (M945).

**R1.12** WHEN a thing must hold for more than 3 f -> DO keep something alive on it (**no dead frame**): linear drift 1-3 px/f, 0.5-1% scale creep, a sweep, a caret, a counter tick, a sway, video, light moving on the ground -- *because* a locked frame reads as a slide. A **designed breath** (0.6-1.5 s, a reason you can state, immediately before a payoff or after a matched cut) is wanted and may be quiet, with one living thing on it; only the payoff the viewer must read may be perfectly still, and then for under ~1 s (hero figure up to 1.2 s; a resolved CTA lockup 0.6-1.4 s with something alive, close.md R2.6) (MEAS; M913, M916, M920, M946, M955).
**R1.13** WHEN a clip ends -> DO end mid-motion (accelerating exit, still-shrinking lockup, half-faded field) -- *because* the cut is the edit and the next frame inherits the speed (M913, M916, M920, M929, M931, M944; ends-at-rest only in M946).

### 1.8 Statistic vs signature move

| Topic | Default (MEAS) | Signature move | Use the signature when |
|---|---|---|---|
| Entry curve | softLand 15%, glide 14%; snapSettle only ~8% | 54-72% of travel in the first 4 f + 0.4-0.6 s tail (M913, M914, M916, M929) | the entry is the hero object or the first beat; one per scene |
| Exit curve | 37% of leaving moves accelerate | every exit accelerates off-frame (M919, M920) | the exit crosses the frame or ends on a cut |
| Overshoot | 8.8% of moves, late lean | none at all except one spring (M948) or only +4-5% pops | pick "none" for technical films, "one spring" for consumer films |
| Word stagger | 1-3 f median (letters, rows) | 6-7 f @60 = 3-4 f@30 inside a phrase, 10 f@60 before the stinger (M921) | whole-word headline builds (see type.md) |
| Camera | 18 f push/pull, median 1.46x | one-frame snap 0.56-0.77x + 0.3-0.6 s tail (M913, M914) | the camera reveals or reframes the product |
| Stills | motion on ~99% of frames in 3-7 s moments (not a whole-film target; human films: mean motion median 6.8, IQR 4.4-9.8) | 0.67-1.0 s payoff holds (M938, M968; M946's 3.66 s is an outlier, not a licence past the 1.4 s end-hold gate); a designed breath 0.6-1.5 s before a payoff | after the claim has landed; never in hooks; always one living thing on the frame |

---

## 2. The 12 measured eases

Fitted to the median curves of clusters of real moves (RMSE over 21 points: 0.02 = identical, 0.06 = close). 89% of measured moves lie within 0.12 of one of these, 53% within 0.06; the eases are anchors on a continuum, interpolate in between. "Share" = distinct moves nearest this ease (n = 3,573).

| Runtime name | Shape: % done at 10 / 25 / 50 / 75% | Frames @30 (p25 / median / p75) | Share | What the humans used it for |
|---|---|---|---|---|
| `M.ease.cruise` | 10 / 25 / 50 / 75 (linear) | 6 / 9 / 16 | 18% | fades (32% of opacity moves), drift, camera creep, counters, ambient motion; every drift is linear |
| `M.ease.glide` | 16 / 39 / 69 / 91 (power 1.7, ~sine.out) | 7 / 10 / 18 | 14% | all-purpose medium x/y/scale/blur lands and some fades; entries and exits alike |
| `M.ease.softInOut` | 4 / 17 / 50 / 83 (S-curve) | 6 / 9 / 16 | 14% | opacity (27%), blur (21%), counters off a handle, ground/colour ramps; no entry/exit bias |
| `M.ease.softLand` | 30 / 59 / 85 / 95 (power ~3, expo k 3.4) | 6 / 12 / 21 | 9% | text rises, panels slide, scale-ins; 85% are entries; hook/proof workhorse |
| `M.ease.gentleIn` | 1 / 6 / 24 / 55 (power 2.07) | 6 / 9 / 17 | 9% | exits (44% of it), blur-out and fade-out starts, slow push-ins running into a cut |
| `M.ease.snapSettle` | 54 / 84 / 96 / 98 (fast snap + soft tail) | 6 / 11 / 29 | 6% | hero entries; **CTA 23% of moves**; hook 7%, proof 4%, turn 2%; 79% are entries |
| `M.ease.whip` | 23 / 52 / 83 / 97 (power 2.5) | 8 / 13 / 21 | 6% | big fast moves; true whips median 7-8 f; 78% of entry whips land with it |
| `M.ease.accelExit` | 0 / 3 / 16 / 47 (power 2.6) | 9 / 13 / 19 | 5% | the leaving curve: scale exits (44%), pans off-frame, peak speed t~0.9 |
| `M.ease.crashOut` | 0 / 0 / 6 / 32 (power 4) | 11 / 17 / 31 | 4% | camera pull-offs and exits that end in a hard cut at full speed; ends in an immediate stop |
| `M.ease.popOver` | 10 / 46 / 96 / 108 (peak **1.08 at t 0.72**) | 11 / 15 / 27 | 2% | the late lean past the mark: 168 source moves, 88% of overshoots; scale and translate entries |
| `M.ease.crashIn` | 91 / 118 / 110 / 103 (peak **1.18 at t 0.27**) | 9 / 10 / 27 | 1% | slams: ty/tx drops that touch the mark almost at once, pass it, relax back by t 0.9 |
| `M.ease.bounceHard` | 13 / 62 / 138 / 139 (peak **1.48 at t 0.62**) | 11 / 22 / 28 | <1% | the big overshoot (ty drops, scale pops, rotations); 1.5% of moves; use sparingly |

Share by role (nearest ease): CTA snapSettle 23% / softLand 25% / cruise 8%; hook glide 16% / cruise 17% / whip 8%; turn cruise 22% / softInOut 16% / gentleIn 11%; proof cruise 20% / softInOut 16% / glide 15%. By where: entries mostly glide 17%, cruise 15%, softLand 14%, softInOut 13%, snapSettle 9%, whip 9%; exits mostly cruise 18%, softInOut 17%, gentleIn 15%, accelExit 10%, crashOut 9%.

### 2.1 Pick the ease

| What is moving | Ease | Frames @30 | Notes (IDs) |
|---|---|---|---|
| UI card / panel / modal landing | `softLand` | 12 (6-21) | hero card in a close-up: `snapSettle` 11 f then a 0.4-0.6 s tail (M913 card 70% in 4 f; M916 card 62% in 4 f) |
| Card/panel inside a CTA | `snapSettle` | 6 | (CTA entries median 6 f) |
| Whole-word arrival | `softLand` | 12-15 | offset 0.03-0.07 H; hero first word `snapSettle` 10-18 f (M938 words ~15 f; M964 decays 0.6/f; M929 59% in 5 f, 91% by 16 f, tail to 36 f = `snapSettle` stretched) |
| Logo crash-in from 3.5-3.75x | `snapSettle` | 18-30 | 39% of the drop in frame 1, 86% by 6 f, 1.0 at 0.67 s (M929, M932); then `cruise` creep 1.0 -> 0.93 over 1+ s; use `crashIn` only if it should punch past the mark |
| Camera push (zoom in, pan toward) | `glide` / `cruise` | 10-22 | pushes are 48% ease-out, 31% in; slow creeps are linear |
| Camera punch / reveal snap | one-frame step, then `softLand` tail | 9-18 | ratio 0.56-0.77 in 1 f (M913, M914) |
| Camera pull / exit / pull-off | `accelExit` or `crashOut` | 13-17 | camera pulls are 62% ease-in (median 1.8x, 17 f) |
| Whip (entry half) | `whip` | 7-8 | peak speed t~0.25; blur-matched across a cut (see 6.4) |
| Whip (departing half) | `accelExit` | 6-10 | ends at peak speed on the cut (M916, M919, M931) |
| Drift / creep / ambient | `cruise` | 26+ | 1-3 px/f; 1.16x scale |
| Press down | `glide` | 2-6 | cursor 2 f; button 0.63-0.80 min (M914, M919, M956) |
| Release | `popOver` (or `softLand` for none) | 6-10 | +5% rebound (M914); none in M922, M931 |
| Fade in / out | `cruise` | 4-7 | `softInOut` for ground/colour ramps; `gentleIn` for fade-out starts |
| Blur-in (focus reveal) | `glide` / `softInOut` | 4-8 | 12 -> 0 px in 4 f (M919, M920) |
| Blur-out / defocus-out | `gentleIn` | 7 | 63% of leaving blurs accelerate |
| Counter / number roll | values stepped per frame, steps decaying; or `softInOut` for a number tied to a handle | 7-23 f | M936 (+8-9/step, 7 f), M954 (16 values, steps 0.75 -> 0.07), M923 (50 f ease-in-out) |
| Exit off-frame / shrink to cut | `accelExit` | 13 | scale exits 10 f |
| One-off physical reward | `popOver`, rarely `bounceHard` | 15 / 22 | once per film (R1.11) |

---

## 3. Entry and exit grammar

### 3.1 Entries

An entry spends **two or more decaying channels at once**, never opacity alone. Order of use in MEAS: transform moves 71% of entries, blur-in 8%, opacity-only 12%, hard cut 16%.

| Channel | Start state | Decays over | IDs |
|---|---|---|---|
| Offset, words/lines | 0.03-0.07 H below the slot (20-50 px) or 0.03 W beside it, +14-46 px to the entry side; hero first word 0.10-0.24 H, shrinking per word (24/18/13/13% H) | 12-15 f; tail 0.4-0.6 s | M941, M938, M958, M929, M920, M917, M955 |
| Offset, cards/panels | rise from below the frame 0.6 H; slide 0.14 W; already mid-open at frame 0 | 62-72% in the first 4 f | M916, M913, M933 |
| Scale | oversize start (see 3.3) or 0.46-0.75x of rest for identity-bearing objects | 8-30 f | M929, M947, M968, M967 |
| Blur | 3-6 px type, 8-12 px status words, 12-17 px hero counter, 18 px logo | 4-8 f | M919, M920, M954, M968 |
| Smear | directional, frame 0-1 only (see section 4) | 3-4 f | M916, M929 |
| Colour | accent tint -> ink | 4-17 f (6 f at 30 fps, 0.28 s at 60) | M967, M974, M966 |
| Opacity | 0.12-0.3 -> 1 | 4-6 f | M920, M919 |

**R3.1** WHEN anything enters -> DO start the beat already in progress on frame 0 (a card mid-open, a word half-risen, a hand at speed) and cut onto it -- *because* the first frame of the clip carries the momentum of the previous one (M933, M934, M938, M914, M918).
**R3.2** WHEN an item pops in whole -> DO give it a 1-f reveal of its final form with a small settle (3-10% over 7-14 f) rather than a morph -- *because* a hard cut into ~90% of the final state then a settle reads as engineered (M962, M964).
**R3.3** WHEN several entries share a beat -> DO give each a different offset size and ease tail (fan that closes), not one shared curve -- *because* different decays read as separate bodies (M937 words, M938).

### 3.2 Exits

| Exit type | Mechanics | Use when | IDs |
|---|---|---|---|
| Accelerate off-frame | ease-in 6-10 f, 17 -> 111 px/f; object stays sharp, only the label may smear | the element is "thrown away" | M920, M919, M914 |
| Shrink into the centre | scale to ~0.3 with ease-in 4 steps/0.24 s, strips jittered +-1 px for the last 0.4 s | the old act collapses before a hard cut | M947, M967 |
| Clip / mask wipe through glyphs | clip edge sweeps through the line in 5 f, accelerating, while the line slides the same way | text leaves | M962, M947 |
| Words out one frame apart | 1 f apart, 3-4 f each, up 0.07 H and grey; overlap the next entrance by ~2 f | phrase replaced | M938 |
| Dissolve to cells or strips | real cells, stepped coverage | the thing becomes the next scene | transitions.md |
| Hard cut off | 1 f; 25% of exits | state change | MEAS |
| Single-object fade | linear 10 f or stepped 4-5 f | one object only (a line, a last phrase), never between scenes | M920, M934, M938 |

**R3.4** WHEN an element is removed -> DO let it exit by moving (60% of exits) or by one hard frame, and give the exit ~3-4 f when it is a word (exits are faster than entrances) -- *because* a fade leaves a ghost that the eye has to wait out (MEAS; M938).
**R3.5** WHEN a drawn highlight or stroke leaves -> DO exit with NEW motion (the tail pushes out, curls to a smaller arc), not the entry reversed -- *because* reversed motion reads as an undo (M933).

### 3.3 Start oversized and come down

| Object | Start | Rest | Time and shape | IDs |
|---|---|---|---|---|
| Logo/wordmark sign-off | 3.5-3.75x (ink wider than the frame) | 1.0, then creep to 0.57-0.93 | 39% of drop in frame 1, 86% by 6 f, 1.0 at ~20 f (0.67 s) | M929, M932 |
| Brand mark (calm) | 1.86x | 1.0 | 48% in 0.13 s, 67% by 0.33 s, last 0.5% over 2 s | M959 |
| Logo plate | scaleX 1.46 | 1.0 | excess x0.72 per frame@24, 90% in 0.25 s | M965 |
| Logo emblem | 0.28 W, 18 px blur | 0.10 W | excess halves every 2 f, blur 18 -> 0 | M968 |
| Opening word | 0.39 H / 0.58 W ink | 0.09 H | 0.30 s strong ease-out; ~86% of the shrink in 0.13 s | M947 |
| Thesis word | 0.91 W ink, 0.33 H | slow shrink 18% in 0.6 s, then accelerate | then blur 0 -> 18 px | M937 |
| First kinetic word | 1.94x, accent tint | 1.0 | 1.94 -> 1.31 at 0.30 s -> 1.0 at 0.67 s | M917 |
| Cursor | 1.5-2.2x (name-pill cursors), 0.36 W (glossy), **5.1x** mostly off-frame and blurred | 1.0 | scaled about the TIP; 60% of travel in step 1, creep 0.5-0.9 s | M953, M956, M959 |
| Camera on a UI fragment | 3.3x (card), 1.4-1.6x (modal, card), 4.39x (button zoom), 2.5x (grid) | 1.0 | one-frame snaps + tail; or two surges | M913, M914, M918, M919, M937 |
| Logo grid / tiles | 2.5x, tiles are giant cropped squares | 0.875 | two surges, near-stall between | M937 |

**R3.6** WHEN an object with identity (logo, word, cursor, card, mark) enters -> DO start it at 1.4-5x and scale **down** to rest, never grow it from zero, never fade it up -- *because* "arrives from the camera" reads as authority and makes the hit without a bounce (M929, M932, M947, M959, M968).
**R3.6b** WHEN you apply R3.6 -> DO read it as a rule about *arrival* (the thing decelerates in from oversize, never grows from zero), not as a recipe for a giant cropped first word or a logo that crashes in at every end. Spend scale once per film and let the ending get smaller (director.md section 6); a calm brand's logo may arrive at 1.1x with a long ease (close.md C4) -- *because* "start big" repeated in every beat is a house style, and an arrival that is always the same size says nothing.
**R3.7** WHEN the rule seems to fail -> DO allow growth from small only in these cases: items in a 1-f-apart cascade (13 tiles 0 -> 1.12 -> 1.0 in place, M918), a growing object that IS the next scene (bead 0.04 W -> disk 17x, M922; dot -> disc 0.33 H, M962), a loader dot -> QR (M954), and identity objects that start no smaller than ~0.30-0.60x (cards 0.30, button 0.60, disc 0.46: M967, M959, M945) -- *because* in each the growth is the content.

---

## 4. Smear and blur

Three grammars, chosen once per film (R4.1): per-element smear, crisp steps, or camera shutter blur (R4.8). All use blur as a **focus** tool (type resolves, backgrounds rack-focus); only the smear grammar adds per-element directional smear on fast moves, and only the shutter grammar blurs everything by its own speed.

**R4.1** WHEN you choose a film's blur language -> DO pick ONE and keep it: **smear** (directional blur along the travel axis on every fast move; consumer/AI-agent/premium, M916-M920, M926, M929, M931, M937), **crisp steps** (hard steps and cuts, no smear even at 165 px/f; technical, developer, indie, flat vector, M913, M914, M921, M934, M939, M962-M969), or **shutter blur** (R4.8: a real camera shutter applied at render time to a smooth film). In a crisp film change content during the move instead (panels exit with the pan, M934) -- *because* mixed grammars read as different authors. Never combine shutter blur with per-element smear (double blur) or with an on-twos stepped film (the blur would smear the held poses).

**R4.2 Directional smear (smear films).** WHEN an object makes a fast move -> DO apply a blur along the travel axis only, on the FIRST frame of the move (peak), decaying ~halving each frame over 2-4 f (kernel 20 -> 4 -> 2 -> 0 in 3 f; a thin 2 -> 0.7 -> 0.25 gaussian over 6 f), plus 1-3 low-alpha trail copies (0.22/0.12/0.06) peaking on frame +1 -- *because* the smear reads as speed from frame 1 and is gone before the object is read (M929, M919, M920).

| Situation | Smear length / blur | IDs |
|---|---|---|
| Word arrival | 8-30 px along the entry axis (10-20 px vertical for rising words, 24-30 px horizontal for slide-ins) | M917, M920, M929 |
| Card/panel move | 15-35 px | M926, M944, M942 |
| Cursor, mascot sweep | 8-25 px along travel | M919, M943 |
| Whip | grows 3 -> 65 px (blur 2 -> 5) during the last 3-5 f; 100-140 px on a whip-out | M916, M931, M919 |
| Pan jump / one-frame camera smear | up to ~500 px around a 140 px core for ONE frame | M928 |
| Drop/burst on a vertical move | 100 px vertical smear on one frame | M919 |

Batch data: 3-65 px in ordinary use, 100-140 px on whips. PRACTICE (extrapolation): set the length to ~0.5-1x of that frame's displacement and keep it under ~0.15 W.

**Implementation.** SVG `<filter><feGaussianBlur stdDeviation="sx sy"/></filter>`: `"20 0"` horizontal, `"0 20"` vertical, applied via `filter: url(#id)`; tween stdDeviation per frame. For a diagonal travel (M916 45 deg, M918 -30 deg) put the element in a wrapper rotated to the travel angle, blur along x, rotate the element back. For radial streaks (crash-in logos) stack 64-96 scaled low-alpha copies whose length halves each frame (M929, M932). One-sided smears (trail only behind the object) read better than a symmetric blur for cursors (M943).

**R4.3 Colour split.** WHEN a first word or a hero object arrives with smear -> DO add an RGB split (cyan -/+10 px, yellow +10/-5 px, blue) on the FIRST word only, peak 1-4 f, gone by <= 9 f; for a crash-in use a cyan/amber fringe of ~15 px decaying in ~5 f -- *because* the effect reads as speed and is spent where it matters (M929, M932, M927, M930).
**R4.4 Blur-focus reveal.** WHEN a status line, CTA word or label should appear without moving -> DO resolve it in place: blur 12 -> 0 px, opacity 0.1 -> 1, 4 f per word, words back-to-back (or 8 -> 6 -> 4 -> 1.5 -> 0 px with opacity 0.12/0.3/0.65/0.9/1) -- *because* it reads as inference/focus, nothing types (M919, M920).
**R4.5 Rack-focus backgrounds.** WHEN a UI sits behind a headline -> DO blur the UI, not the type: 0.7 -> 5.5 -> 10 -> 11 px over ~0.7 s (cap ~11 px) with 0.1 darkening while the headline stays crisp; for a defocused-but-readable backdrop hold ~4 px and let the cursor blur with it; pull focus back by animating blur 4 -> 0 over ~0.46 s, never by opacity -- *because* the proof stays visible and the type stays legible (M918, M942, M943).
**R4.6 Depth defocus.** WHEN a UI exits or recedes -> DO defocus by depth (top row 0.9 px, bars 3.2, labels 4 px) and leave the hero stat sharp; secondary panels sit at 7-15 px (M953, M956, M958).
**R4.7 Blur peaks to expect.** Entering card 6 px, disc dock 12, orb 15, button burst 25, roll 22, hero counter 12-17, whip 9, logo 18 -> 0 (M939-M946, M954, M958, M968).
**R4.8 Shutter blur (render-time).** WHEN the film is smooth (30 or 60 fps interpolation, camera moves, type that glides) and you want the look of a real lens -> DO render with `node scripts/render.mjs --shutter 180 --subframes 8` (add `--grain 0.03` for a little film grain): each output frame is the average of 8 sub-frames spread across a 180-degree shutter (half the frame interval), so every moving thing, including type and the camera, is blurred by its own speed and a still thing stays sharp -- *because* continuous, physically consistent blur is what separates a rendered camera from stacked tweens, and it costs no authored smear. Rules: this *is* the film's blur grammar (R4.1), so author no per-element smear and no radial streaks on top; fast cuts and whips need no extra blur; stepped, on-twos, glitch or crisp films must not use it; render time grows with the sub-frame count (use 4 for drafts, 8 for finals); keep grain at one level for the whole film (world.md finish). Check the result at real speed: type that must be read should be sharp within 3-4 f of landing.

---

## 5. Frame clocks

**R5.1** WHEN you start a film -> DO choose ONE clock per moment: (a) smooth 30 or 60 fps for brand morph/UI dive (M921-M924, M973, M974); (b) smooth 24-30 for camera/type with stepped reveals (M964-M966); (c) **on twos**: every pose holds 2 frames, every onset lands on an even frame (M947-M949, M967-M969, M945 pairs); (d) **12 fps drawn things on a 24 fps world** (hand-drawn loops, ring/fill/check poses) while the camera, type and cursor stay smooth (M933, M934); (e) 30 fps hard cuts on a constant interval (M962: every 10 f = 0.333 s) -- *because* mixed step rates read as a bug.
**R5.2 On-twos implementation.** Quantise time: `const f = Math.floor(frame/2)*2` and seek every timeline to `f/30`. Land all onsets and durations on even frames; the camera timeline gets the raw frame, the drawn layer's timeline gets the quantised one (two timelines, one `seek`). In a 24 fps comp 12 fps drawn poses are plain 2-f holds; in a 30 fps comp use 2-f holds (15 fps) or quantise t as `Math.floor(t*12)/12`. Stepped typing, glitch rectangles, radius steps and dial states are discrete states by design and are never tweened (M929 rectangles step every 2 f, M926 radius at five instants).
**R5.3 Stepped keyframes.** WHEN a thing must feel hand-posed -> DO reach each pose in 1 f and hold 1-2 f (a phone: 6 poses at 0.03/0.07/0.10/0.20/0.30/0.40 s; a camera: held steps at 1.70/1.80/1.87/1.90-1.97 s), and run the easing curve across the poses (M955, M957) -- *because* pose holds are what make the motion look drawn.
**R5.4 Real 60 fps morphs.** WHEN you want a liquid brand transform (flip, dive, rosette spin) -> DO use a true 60 fps clock with no holds on the morph (glyph squash 2-2.4 f per slot, icon spin to ~30 deg/f, dive x1.5-2 per 4 f@60) (M973, M974).
**R5.5 Held duplicate frames.** Real frame-accurate holds do appear inside smooth moves (a repeated frame in a camera jump, M940, M946 world jerk, M928 whip) -- one repeated frame in a fast move adds impact; use sparingly (1-2 per film).

---

## 6. Camera

### 6.1 One group, not many tweens

**R6.1** WHEN you simulate screen use -> DO put the entire UI (card, panels, chips, scrubber, video) in ONE camera group and move that single transform; dot grids/backgrounds stay screen-fixed; cursor, mascot and drag stack live on their own top layer outside the camera and scale with camera scale; screen-fixed headlines are not parented to it; text is never zoomed separately -- *because* one transform reads as a lens, many tweens read as animation (M913, M914, M917, M918, M919, M953, M958).
**R6.2** WHEN you reframe -> DO prove the scale with a fixed texture: a dot grid pitch doubling, the cursor growing, a hairline thickening -- *because* a 2x zoom must read as 2x and not 3x (M931, M914).

### 6.2 The one-frame snap and its tail

| Move | Numbers | IDs |
|---|---|---|
| Reveal snap | scale 2.50 -> 1.41 in 1 f (ratio 0.56), y -832 -> -226; then 0.56 s decelerating settle to 1.0; strongest frame of the moment | M913 |
| Reframe snap | 1.469 -> 1.137 in 1 f (ratio 0.77), fast ease-out to canonical by 0.32 s, regrow to ~1.13x over 0.36 s | M914 |
| Stepped zoom mid-typing | 1.0 -> 2.46x in ONE frame; peripherals step to 0.65-1 px blur and 0.4-0.5 opacity in the same frame | M923 |
| Push burst | 1.064 -> 1.299 over 2 f (-82 -> -389 px), decays to 1.368 by 0.4 s, 0.6 s hold with under 1 px creep | M913 |
| Hard scale cut | 0.037 W -> 0.136 W (3.7x) in one frame, background keeps its own scale | M964 |
| Hard scale cut + content jump | scale x0.42 and a multi-word tail appears in the SAME frame, then x3.86 | M949 |
| Discontinuous camera jump | button 0.04 W -> 0.27 W after an ease-in push, then pushes on to 0.31 W | M956 |
| 50% double-exposed frame, then 2.33x close-up | no zoom tween | M943 |

**R6.3** WHEN the camera should reveal or reframe -> DO one-frame snap (ratio 0.56-0.77) followed by a 0.3-0.6 s decelerating tail (`softLand`, 9-18 f); never one global ease-out zoom; sometimes fire the snap on a trigger (the last checklist tick releases the pull-back 0.40 s later, M913) -- *because* the jump has the punch of a cut, the tail lets the frame be read (M913, M914, M923).

### 6.3 Pans and parallax

**R6.4 Two pushes.** WHEN a pan crosses the scene -> DO build it as two pushes with different accelerations, never one ease: push 1 fast at frame 0 (x 1.09 -> 0.87 in 0.25 s, -> 0.78 at 0.79 s), slow drift 0.78 -> 0.74 to 1.08 s, push 2 accelerating to a peak 0.025 W/f at 1.54-1.63 s, settling by 2.08 s; or fast/slow/fast/slow zoom speeds that never hold (M918) -- *because* a single ease reads as a keyframe, two pushes read as an operator (M966, M918, M917 exponential decay tau 0.36 s).
**R6.5 Parallax.** WHEN layers pan -> DO run them on separate tracks at **2-2.4x** speed ratios (tiles > diagram > orb: diagram peaks 0.05-0.06 W/f vs orb 0.025), stagger the exits (text clipped at 1.54 s, grid at 1.92 s), and let some layers not scale at all (tile field keeps its own scale during a 3.7x cut; the unit label travels 4x less than the timer) -- *because* depth comes from speed difference (M966, M964, M957 stars ~0.07 H/f, M936).
**R6.6 One shared track.** WHEN you pan a wide timeline or list -> DO run every part (sidebar, ruler, blocks) on one track, peak ~126 px/f, ~2.9 frame widths, long tail, no zoom, clipped by a fixed left gutter of 0.03 W -- *because* a rigid track reads as camera, growing bars read as charts (M940).
**R6.7 Accelerating scroll.** WHEN a long log scrolls past as proof of volume -> DO accelerate from ~6 px/f to ~250 px/f (0.35 H per frame) over ~1.8 s, no blur, let the viewport run empty at the end, decelerate over 9 f onto one readable block and hold it 0.8 s (M939).
**R6.8 Slow-in, fast-middle, long-tail.** WHEN a card/panel carries the camera settle -> DO 27% of travel in the first 0.46 s, 42% in 3 f, the last 25% over a 0.7 s tail with scale 1 -> 0.6, no overshoot, leaving 0.20 W of the edge on screen (M933); for a lateral card swap 0.5 -> 0.19 -> 0.12 W with 84% by 4 f (M913).

### 6.4 Whips

MEAS (207 whip-sized moves, <= 14 f and >= 300 px or >= 0.25 scale, in 37 moments): median **8 f**, 68% decelerate (entry whips 79% ease-out), 24% accelerate (mostly exits), peak speed at t = 0.25; 159 are entries, 32 exits. Peak per-frame displacement ~13% W (M934: 12.9% W/f at its peak; 27% of travel over 10 f of ease-in, then 31% in 2 f and 49% in 4 f, then a 15-f tail).

**R6.9** WHEN the camera whips between regions -> DO give it 3-5 f of travel around the peak (entry: `whip`, 7-8 f; departing half: `accelExit`), with the cut landing at peak speed and the new content starting along the same vector -- *because* motion continues in the viewer's head across the cut (M934, M931, M916, M919).
**R6.10 Blur-matched.** WHEN the film uses smear -> DO ramp blur and smear on the last 3 f of the old view (text 8-20 px, ~100 px smear, up to 140 px), cut with a one-frame discontinuity into a view that is already blurred (button as a smeared pill, 2x scale swap) and resolve over ~8 f; in a crisp film do not blur, change the content during the whip (panel, logo and link lines exit with the pan) (M931, M937, M934).
**R6.11 Content in the whip.** WHEN a whip exits one thing and enters another -> DO have an anchor ride the pan (cursor, bead, card), size constant (a pan is not a zoom: badge size constant, M934) -- *because* the eye needs a carrier through a fast move (M922, M934).

### 6.5 Push and pull multipliers (MEAS)

| Group | n | Multiplier p25 / **median** / p75 / p90 | Duration median | Ease |
|---|---|---|---|---|
| all pushes | 256 | 1.19 / **1.46** / 2.0 / 4.0 | 10 f (p25-75 6-22) | 48% out, 31% in |
| all pulls | 280 | 1.15 / **1.32** / 1.72 / 3.7 | 13 f | 50% out, 31% in |
| camera-wrapper pushes | 21 | 1.17 / **1.63** / 2.0 / 4.3 | 18 f | 52% out, 24% in |
| camera-wrapper pulls | 21 | 1.15 / **1.82** / 3.3 / 4.4 | 17 f | **62% in**, 29% out |

By length: punch <= 6 f -> 1.26x median; short 7-18 f -> 1.39x; medium 19-45 f -> 1.52x; long drift 46+ f -> 2.4x (p75 5.6x). 84% of moments contain a >= 1.5x scale move; the largest per moment has median 4x (includes scale-ins from small).

**R6.12** WHEN you size a camera move -> DO read the multiplier off the duration: 1.25x for a 6-f punch, 1.4x for 12-18 f, 1.5x for 20-45 f, 2.4x only for slow drifts; for a reveal pull go 1.8x with an ease-in; the per-moment hero scale move is ~4x -- *because* these are the measured pairings (MEAS).

### 6.6 Dive zoom, constant octave rate

**R6.13** WHEN the camera dives from a brand into the product -> DO scale from frame 0 with no hold at a constant octave rate: 1, 1.02, 1.15, 1.46, 2.28, 4.52, 8.98, 14.67, 21.9 at 0/.067/.133/.2/.267/.333/.4/.467/.533 s, i.e. x1.5-2 per 2 f@30 (per 4 f@60), accelerating 0.4 s then decelerating to ~1.1 s; implement by interpolating log(scale) (`scale = exp(lerp(0, ln 21.9, e))`); translate toward a feature of the logo (the underscore) not the centre so it exits the frame edge; let that feature become a near-full-frame mass, fade it in place in 3 f, show 3 blank frames, then zoom a container OUT to rest (0.05/0.98 -> 0.25/0.78 over 0.62 s, stroke 10 -> 4 px) -- *because* the logo is felt to contain the product (M974). Use vector or oversampled sources; a 22x raster zoom softens.

### 6.7 Camera micro-drift

**R6.14** WHEN the camera appears to hold -> DO keep it moving at >= 0.003 H/f or ~1 px/f: grid drift 0.02 W per 2.9 s, scrubber 0.9 px/f, slow right drift 0.027 W/s, slow shrink 1.0 -> 0.82 per 0.6 s, badge growth 120 -> 208 px over 3 s (M934), title row -0.01 W per 0.44 s; where the camera must be still, move something else (M913, M914, M923, M934, M936, M964).
**R6.15** WHEN the camera ends a moment -> DO end it still accelerating with no settle (pan ends hard at 0.39 -> 0.31 W, M913; accelerating roll to -76 deg with 22 px smear, M944; accelerating card up to the last frame, M924).

---

## 7. Physical bodies, pulses and springs

**R7.1 Bodies.** WHEN several shapes leave or arrive as "physical" -> DO simulate each as its own body (own path, rotation, one small bounce 0.03 H, slight rotation overshoot -95 -> -90 deg), bring at least one in late (0.60 s) so the choreography is not uniform, settle the pile by 1.8-2.2 s and HOLD 0.8-1.0 s motionless as the weight beat, then bring the next idea; shapes pass behind words without covering ink -- *because* a group translation reads as a slide, individual bodies read as consequence (M938).
**R7.2 Pulses.** WHEN something is pressed -> DO an asymmetric press/release: fast squeeze (cursor 2 f to 0.71-0.9; button to 0.76-0.80 over 11-13 f@60 = 0.2 s), slower release (19 f@60 = 0.32 s, or a +5% rebound, 1.055), the target reacts 0-1 f after the cursor (button 0.63-0.80, arrow 0.75, avatar 0.77, card 0.97), the 391 raw pop-and-return pulses in MEAS run median 23 f total (0.77 s). Compression reference: arrow/avatar 71-77%, button 97% (close-up) to 63-80%, cursor close-up 88%, cursor body 0.81-0.92. Brightening of the target (#4C4DF5 -> #7FA7F5) beats a ripple ring. NEVER a ripple ring or white flash as the default (M914, M919, M922, M931, M953, M956, M959, M939-M946).
**R7.3 Springs.** WHEN you add overshoot -> DO keep leans to R1.10 and spend the visible spring once per film (R1.11). popOver for the lean, bounceHard (peak 1.48 at 0.62, 22 f) only for a ty drop or scale pop in a film that is otherwise ease-out (MEAS 1.5% of moves; M948, M957, M973).
**R7.4 Anticipation.** WHEN a move needs wind-up -> DO use a 3-f drift opposite to travel (+196 -> +234 px before sliding left), or a 0.1 s still before a press (hand stops 0.10 s, violet shadow grows 0.1 s before the burst) -- *because* wind-up makes the next move read as intended; only 5% of moves carry it, so use it on the key one (M929, M930, M943).
**R7.5 Stepped-then-smooth objects.** WHEN a hand-posed thing meets smooth motion -> DO keep it on its own clock (R5.1) and let a physical bit (tail, loop, ring) exit as new motion (M933, M934).

---

## Slop tells for this topic

| An AI default would | Do instead |
|---|---|
| Use one ease (`power2.out`, 0.6 s) on every tween | Pick per role from the 12 eases: softLand 12 f, glide 10 f, cruise 6 f fades, accelExit 13 f exits; CTA moves 6 f |
| Fade every element in with opacity 0 -> 1 over 0.5 s | Move it: offset/scale/blur decaying over 12 f, opacity only as a 4-6 f helper; hard-cut 16% of entries |
| Ease-out everything including exits | Landing 58% out; leaving 37% in; scale and blur exits accelerate; exit across the frame ends at peak speed |
| Bounce every pop (back.out(1.7)) | Overshoot on < 9% of moves, late lean (popOver), once per film as a payoff spring; CTA/proof ~5% |
| Constant stagger (0.1 s for all) | 1-3 f uneven gaps overlapping at ~0.5 of the move; CTA 8 f |
| Grow a logo from scale 0 and fade | Start 1.4-5x and scale DOWN, with excess halving every 2 f; `snapSettle` 18-30 f |
| Smooth global zoom-in | One-frame snap 0.56-0.77x + 0.3-0.6 s tail; two-push pans; hard scale cut; constant-octave dive |
| Blur everything the same 20 px or smear on some beats and not others | One blur grammar per film: per-element smear on frame 1 of fast moves decaying over 3 f, OR crisp steps, OR render-time shutter blur (R4.8); backdrop blur capped ~11 px |
| Hold a settled frame for 1-2 s | No dead frame: one living thing (1-3 px/f drift, a creep, a sweep, moving light) on every hold; a designed breath of 0.6-1.5 s only before a payoff; only the payoff holds still, < 1 s |
| Drive every film toward "motion on 99% of frames" and constant energy | That figure is for 3-7 s moments; human whole films run a mean motion median 6.8 (IQR 4.4-9.8) and breathe; use the band as a question, not a dial |
| Start big on every logo, word and cursor in every film | Arrival decelerates from oversize, once; spend scale once and let the ending get smaller (R3.6b) |
| Press with ripple ring and glow | 2-6 f squeeze to 0.75, target reacts 0-1 f later, brightens, slower release; no ring |
| Mix 24, 30 and 12 fps motion in one beat | One clock per moment; on-twos quantised to even frames; drawn things at 12 fps on a smooth world |
| Move every part with its own tween | One camera group; cursor on its own layer; text never zoomed alone |
| Treat a whip as a fast ease | 8-f whip, peak speed at t 0.25, cut at peak, blur-matched both sides (or content changes inside it in a crisp film) |
