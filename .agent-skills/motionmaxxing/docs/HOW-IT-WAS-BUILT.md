# How motionmaxxing was built

This is the long version of the glow-up: how mid AI video got measured, diagnosed and maxxed. It covers what was measured, what went wrong along the way, and how the findings became scripts. The short version is in the [README](../README.md). Every number below comes from the study notes behind the skill; the caveats are in [KNOWN-LIMITS](KNOWN-LIMITS.md).

## 1. The problem

AI-made motion graphics fail in a recognisable way. Everything is a slide:

- a label in the corner, and a counter ("02 / SPEAK");
- a left-aligned headline over a card on a flat colour;
- a stat, then a logo, a tagline and a button.

The motion is often fine on its own (some of the worst films we looked at moved more than the human median). The film is not directed. Nothing causes the next thing, and nobody decided what the viewer should believe at each beat.

Two ways to fix that are tempting, and both failed when we tried them:

1. **A list of bans.** Removing slop tells without adding substance gave clean, hollow films that lost to a plain film built on the brand's own material.
2. **A house style.** A gallery of finished looks taught a look: eight films for eight different brands came out like one designer's reel.

So the skill separates two jobs. **Judgment decides what to make. Measurement decides how it moves.** Scripts then check the render, so the agent cannot talk itself into a pass.

## 2. Measuring professional motion

### The corpus

- 53 short moments (3 to 7 s) from published, designer-made launch films, each recreated as a frame-accurate GSAP timeline.
- The measured sample is 50 of them (hook 12, turn 8, proof 24, cta 6). Three tile-mosaic moments are reported separately: thousands of per-tile flickers would drown every statistic.
- The recreations stay private. No frame, clip or copy of the originals is in this repo.

### Six analysts, one rubric

- Six analysts (model-assisted, one batch each) decoded the moments to the frame: ground, type, light, handoffs, every entrance and exit, what each beat makes the viewer believe, and why it works.
- Every finding was written in a fixed shape: WHEN a situation, DO a decision, BECAUSE the effect, plus the evidence ids behind it.
- Result: about 150 designer rules. They live in `references/` and, rule-only, in `library/moments.jsonl`.
- That library has 716 rows (the rules, the 53 moments, and rules from 39 further films) and `scripts/precedent.py` retrieves them per beat.

### Seeking every frame

- Every recreation was seeked frame by frame at 29.97 fps.
- Each seek read every tweened property, plus a computed-style probe for opacity, blur, transform and visibility on every element.
- Staggered identical siblings were collapsed into one "distinct move".
- Result: **4,288 distinct moves** (6.4k counting siblings).

### What came out

| Measured | Result |
|---|---|
| Median move | 10 frames (0.33 s). Translate and scale entries 11-12 f; opacity 6 f in and 7 f out; blur 7-8 f |
| Snaps and drifts | 13% of moves are 2-3 f; 12% run longer than 30 f |
| Landing | Eases out 58% of the time (16% ease in) |
| Leaving | Eases in 37% (35% ease out); scale exits ease in 49% |
| Overshoot | 8.8% of moves overshoot by more than 3%; 88% of those peak after 35% of the duration, a slow lean and not a fast spring; median overshoot is 19% of the move's own travel |
| Arrival | Entries come from oversize: logos crash in from about 3.5x, cursors enter 2-5x oversize, a thesis word shrinks from 0.39 H. Nothing grows from zero |
| Fades | 3,392 transform entries against 584 opacity fades. Where something simply appears, 57% hard-cut and 43% fade |
| Cuts | 96% of moments contain hard visibility switches, a median of about 20 cut frames per moment |
| Stagger | Median sibling gap 3 f; 56% of gaps are exactly 1 f (letters, rows); the gap is about half the move length, so siblings overlap |
| Camera | Scale moves of 5% or more: median 1.46x push; pulls are mostly ease-in (62%) |
| Dead frames | In these 3-7 s moments, motion on about 99% of frames; median longest still run 1 f; only 2% of moments hold 24 f or more |
| Roles | A call to action is the snappiest beat (median 6 f entries, 39% snap curves); a turn leans on acceleration and has the longest exits |

### Twelve eases

- Clustering the move shapes gave twelve anchor curves, each a closed-form function with f(0)=0 and f(1)=1.
- 89% of measured moves fall within RMSE 0.12 of one of them, 53% within 0.06.
- The runtime ships exactly those functions as `M.ease.*`. `docs/media/eases.svg` plots them.

| Ease | Typical frames | Share of moves |
|---|---|---|
| `cruise` (linear) | 9 | 18% |
| `glide` | 10 | 14% |
| `softInOut` | 9 | 14% |
| `softLand` | 12 | 9% |
| `gentleIn` | 9 | 9% |
| `snapSettle` | 11 | 6% |
| `whip` | 7 | 6% |
| `accelExit` | 13 | 5% |
| `crashOut` | 17 | 4% |
| `popOver` | 15 | 2% |
| `crashIn` | 10 | 1% |
| `bounceHard` | 22 | under 1% |

The remaining 11% of moves fit none of the twelve well.

### Where the numbers corrected intuition

- The famous "fast snap, then a long tail" is real but only about 8% of moves (half the travel in the first tenth of the time). The much bigger family is the softer "firm decel". So `softLand` is the workhorse and `snapSettle` is for hero entries and call-to-action marks.
- Overshoot is rare and late. A bounce on everything is the AI default.
- "Motion on 99% of frames" describes short, dense moments. Whole human-made films are calmer: mean frame-to-frame luma change has a median of 6.8 (IQR 4.4-9.8), and one major hardware launch film is still for about 55% of its length. The skill reports its number as a question to the director, never a gate.
- Pros cut on motion, not on rest: scenes start already moving, and clips end mid-move.

## 3. The slop autopsy

Measuring what good looks like is half the job. The other half is what the agent actually produced. We took three AI-made films that a person had rejected hard, plus a film made by an earlier version of this skill, and dissected them beat by beat: timestamps, frame descriptions, source where we had it.

**What turned up.** A catalogue of 25 ranked patterns, dominated by a few families:

- persistent page chrome (a brand label, a counter, a timecode, BPM or FPS text, corner brackets);
- left-anchored headline blocks, and a generic UI card as the proof;
- flat swatch grounds that change per scene, and a stat slide;
- a "carrier" object pinned in place through several shots;
- a headline typed with a caret, and a logo, tagline and button as the ending.

**The useful part was the root-cause column.** For every tell we asked one question: did the skill say this clearly and the agent ignore it, did the skill's own wording lead the agent there, or was there no rule at all?

- **Prescribed.** An earlier version said to alternate flat grounds by act, keep a recurring carrier, anchor phrases at a left margin and count up a hero number. The agent followed it faithfully.
- **Ignored.** The rule was clear and the agent wrote a justification for breaking it. That is why the final rule is "delete the element; do not justify it".
- **Missing.** Nothing said to build the picture from the captured brand material, so the agent invented a generic UI.

**What changed because of it.**

- Grounds became built worlds (light, depth, texture) instead of swatches.
- The carrier became optional, and it must travel at every seam.
- Typing is for a product's own input only.
- Proof is magnified by the camera, never by inflated type.
- The "Never ship" list and the lint were written from this table.

## 4. Merging judgment from earlier generations

This skill is the fourth generation of the same work. The earlier ones left a record of blind A/B rounds, verdicts and corrections, and the lessons were merged in rather than discarded.

**Generation 1: a pipeline.**
- Five rounds, four of them scored against a no-skill arm. The skill lost three of those four. One test was rejected outright by the author for a vibe-coded UI card.
- The failures were instructive: over-held beats, tasks named instead of shown, and "clean but hollow" type-only films that lost to a film using the brand's own launch material.
- A stock tagline scored 4/10 on concept against 7/10 for a rival built on the brand's official line. A pipeline is not a film.

**Generation 2: bans, move ids and a gold gallery.**
- Blind rounds. Across five invented brands and two models, 9 of 10 picks were the with-skill film. The one miss was a calm, legible no-skill film beating a frantic with-skill one.
- The gold gallery of reference frames taught a look rather than a judgment, and was removed. The calibration strips that ship now are original images of invented brands, in deliberately different styles.

**A measured re-analysis of the whole pile** (a model acting as creative director, with numbers).
- Anchor scores out of 10: best human references 8-9, best with-skill AI films 6-6.5, most no-skill AI films 1-4.
- Mean motion energy: human references median 6.8; no-skill AI 1.9; with-skill AI 11.7 (above the human 75th percentile); rejected slop films 13.3, 11.6 and 2.9.
- Too little motion and too much both fail, so the motion number became a question.
- The sharpest failure on record came from a small-model run here: a 15 s black render that the agent certified "VERIFIED / CLEAN" while its own scan passed. That is why the rule is **never self-certify**. A film you did not look at is not finished.

**Generation 3: a taste layer.**
- Eight judgments, "made with ambition", screenshot-worthiness, honest self-review.
- In its A/B runs the with-skill film lost its default tells, and the failure moved to restraint pushed into emptiness: a small UI on black for seconds at a time. That produced the "ambition" rule.

## 5. Engineering

### A seek-safe runtime

- Every frame is a pure function of time. Tweens are always `fromTo` with explicit start values and `immediateRender:false`.
- Everything stepped or textual (visibility, typing, counters, smear, line re-centring) is a renderer driven from one clock tween, so jumping to frame 400 equals playing to it.
- Visibility is one track per element. Transform origin is a per-element track, with a console warning when claims overlap.
- `Motion.selfTest` plays frames in order, then jumps to random frames through a detour, and compares DOM, computed transforms, text and canvas pixels.
- A negative test (a `state` that reads a call counter) fails 8 of 8, which is how we know the test can fail.

### Heavier layers

- `hero3d`: a Three.js hero object on the same clock. State resets to base, then a pure function of t is applied.
- `native-ui`: true-proportion phone and notification builders.
- `render.mjs`: Chrome over the DevTools protocol into ffmpeg. Single-pass shutter blur averages N sub-frame seeks, forward from the frame time so a hard cut never ghosts. Grain is deterministic and seeded.

### Scripts that look

- `look.py` decodes the render once and reports cuts (the render's own events win over detection), end hold, frame-difference motion, and an audio audit (loudness, true peak, silent tail, dropouts, cuts against sound onsets).
- `lint.mjs` renders the page at sample times and checks geometry and typography for page chrome. Each position rule must hold across 0.1 s, so a label flying through a corner is not flagged.
- `imagegen.py` refuses prompts that ask for text, logos, UI or people.
- `blind_review.py` builds a randomised A/B page, so a person can judge picture first and sound second.

### Gates

| Gate | Computed by |
|---|---|
| G0 render exists | `look.py` |
| G1 proof readable | by eye, said so in `NOTE.md` |
| G2 no empty frame | `look.py` |
| G3 end card short | `look.py` |
| G4 one hero per frame | by eye, said so in `NOTE.md` |
| G5 no page chrome | `lint.mjs` |

The rule is who computes the number. A gate that fails is fixed, not argued, and the numbers are quoted in a mandatory `NOTE.md`. The agent is not allowed to estimate a number it did not measure.

## 6. What the process taught us

1. **Specific beats clean.** The films that won used something only that brand had: its logo shape as a control, its own copy, its own material. Removing tells never substituted for that.
2. **Every instruction is a prior.** Wording like "alternate grounds" or "a recurring carrier" is read literally. The fix for a tell is often to edit the skill, not to scold the agent.
3. **Scripts are cheap honesty.** Each hard gate exists because a real run failed in that exact way. None prove a film is good; they stop one kind of lie.
4. **Calibrate with judgments, not looks.** A strip of finished looks teaches a look. A strip of pairs (a default beside a decision) teaches the reasoning.
5. **Keep the evidence honest.** One rater, model-decoded rows, a genre skew: all written down next to the claims they qualify.

## 7. Ethics and provenance

- The principles were learned the way designers learn: by studying published work and writing down what was decided and why. The films that were studied stay private.
- This repo ships principles in our own words, measured numbers, scripts, a runtime, original calibration images of invented brands, and two before/after comparisons whose brand names belong to their owners and are used only to demonstrate the difference.
- Third-party code ships with its licence: GSAP, Three.js, opentype.js, Inter.
- `studies/PROVENANCE.md` explains the calibration strips.

## 8. What comes next

- A fresh blind A/B for this generation, with more than one rater.
- Lint coverage for chrome baked into canvas and generated images.
- A regression suite that renders a few reference films and diffs the gate numbers.
- More measuring, on longer and non-SaaS films, so the numbers stop describing one genre.
