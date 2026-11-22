# Techniques

## Designing keys from anatomy (`keydesign.mjs`)

Author a key as intents in the reference body's frame (+X the body's left, +Y up, +Z forward):
- `u`: the upper-arm direction (shoulder to elbow); it doubles as the elbow pole key;
- `f`: the forearm direction (elbow to wrist);
- `b`: the blade direction.

`keydesign` returns `hand = shoulder + L1·u + L2·f` (L1 0.254, L2 0.249, shoulders at x ±0.177, y 1.36). It also returns raise, flex, the blade's angle off the forearm and reach, and flags anything over the limits. Paste `hand`, `elbow` and `blade` into the key. Examples that shipped in Thornvigil 1.0.72:

| Key | u | f | b | flex |
|---|---|---|---|---|
| quick contact | [-.2,-.55,.81] | [0,-.15,.99] | [.4,-.6,.7] | 28° |
| quick follow-through end | [.35,-.88,.3] | [.95,-.15,.2] | [.4,-.5,.75] | 57° |
| heavy sink | [.2,-.85,.5] | [.65,-.1,.75] | [.2,-.5,.84] | 54° |
| heavy rebound | [.05,-.8,.6] | [.3,.1,.95] | [.7,.35,.62] | 60° |

Then sample what the baker actually produced with `at.mjs <gender> <clip> <times...>`. The wrist cap and the forearm roll decide where the blade really lands. When it misses, change `f` (the forearm), not `b`.

## Baker architecture (sword strikes, `sword-attacks.mjs`)

**Keys.** `k(time, { hand, blade, elbow, shield, hips, chest, pitch, stance, shift, dip, lateral }, ease)`.
- Eases: `smooth` is smoothstep, `in` is u² (it arrives at twice the average speed), `out` is ease-out cubic.
- An `in` key followed by a key that starts from rest is a velocity hitch. Space such keys so the arrival speed stays under the hand-speed cap.

**Hands ride their shoulders.**
- `reachFor(side, key)` adds the key's offset from the stance shoulder to the current shoulder.
- `arcAbout(from, to, t, pivot)` slerps the direction about the stance shoulder and lerps the length.
- Effect: the hand travels with the body, and the elbow never folds shut halfway between keys.

**Wrist.**
- `arms.wrist('R', desiredHand, { bend: WRIST_BEND (.7), limit: FOREARM_ROLL (.85) })`.
- The blade may roll about its own line to whichever grip the wrist reaches most naturally.

**Kinetic chain.** The body samples the pose 35 ms ahead (`lead`) and the chest 17 ms ahead. The pelvis LEAD never crosses a bow's loose (`LOOSES`); the lead shrinks to `|S − t|` near it.

**Limiter.** `limitJointSpeed` pins the contact frame and drags frames before it. A bow's loose is not pinned. A `snap` hold key at S·0.97 leaks 79% of the release into the frame before, so hold at S − 1/60 instead.

## Performances (bow, staff, spells: `skill-performances.mjs`)

**Channels.**
- `drawOn` blends the draw in.
- `draw` sets how far the fingers are along the line from the nock to the anchor.
- `bowArm` holds the bow arm out on the line through the follow-through.
- `loose` follows the fly-back path.
- `home` blends from the fly-back point down to the keyed recovery hand.
- `shrug` lifts the shoulders; `shake` is the tremble.

**`drawBow()` does the following, in order:**
1. Extends the bow arm to 98.5% reach.
2. Rolls the bow about its stave so the string faces the anchor.
3. Straightens the draw wrist.
4. Solves the draw hand so `f_middle.01.R` lands on the target. It iterates three times, using the finger's offset from the hand.

**The loose.**
- It follows a continuous IK path from the anchor to the fly-back point, then home.
- The fly-back point is the anchor, plus 8 cm back along the arrow, plus 12 cm to the draw side, minus 4 cm down.
- It is solved outright until the hand is nearly home. Never blend two unrelated arm solutions: that once flung the hand 46 cm.
- The pole lerps from back-and-level to down-and-forward as `home` rises, so the arm comes down beside the body, not behind the back.

## Grips (`player-equipment-grips.js`)

- **Finger poses:**
  - `fingerAngles` (fist);
  - `relaxedAngles`;
  - `hookAngles` (index, middle and ring curled to about 1.3–1.35 rad at the middle joint, thumb tucked).
- **Calls:** `apply({ carry, open: [...sides], hook: [...sides] })`; a hooked side wins.
- **The drawing hand's hook window** is in `player-actor.js` `drawHook()`. It runs from contact·0.2 to contact + 0.45·(T − contact). Before this pass the post-release hand opened into a claw.

## The draw arm and the shoulder skin

With the hand under the jaw, the draw elbow and the upper-arm skin fight:

| Change | Effect on the upper-arm skin crush (limit 3×) |
|---|---|
| elbow level with the arrow (pole y −0.2) | 3.0–3.3×, raise 104–110° |
| elbow 6–8 cm under the arrow | 2.8–3.0× |
| more shrug (0.13 → 0.21) | helped once, hurt the next time: not monotonic |
| elbow swung out to the side (pole x −0.5 → −0.68) | about −0.1× |
| hips side-on (−0.5 → −0.62) | about −0.25×, the biggest single win, and it matches archery form |
| anchor moved 2.5 cm back (jaw corner) | +0.2× (and it hid the hand from the game camera) |

Single-frame spikes (3.06× between 2.6× neighbours) come from one mid-draw configuration. Nudge that key's elbow pole and re-run `armcheck <gender> <class>:<move> trace`.

## Live-rig check in the game

Bake numbers and the running game can disagree: layering, timing, a different rig or an old bundle. To read the real player rig:
1. Open the in-play review URL in the in-app browser.
2. Start the action with `game.startAction` and step with `__stepFrames`.
3. Find the player's skeleton among all rigs in the scene by the `forearm.R` whose hand moves after one stepped frame. The camp has about 10 other rigs, and the first `forearm.R` found is often a pilgrim.
4. Print the flex angle and the hand-to-shoulder distance per frame.

`references/thornvigil.md` has the snippet.
