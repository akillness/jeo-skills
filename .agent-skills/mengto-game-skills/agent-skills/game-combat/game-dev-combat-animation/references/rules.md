# The combat animation standard

The project copy is `docs/combat-animation-standard.md` (Thornvigil). Every rule is either measured by a test (**test**) or scored by the blind reviewers from rendered frames. When you add a move type (a spell cast, a staff slam, a monster bite), add its own numbered section and extend the tests. Never loosen a limit just to pass: change a limit only when a measured trade-off forces it, and write the reason beside it (see the elbow band in rule 12).

## Every attack

1. **Three phases on the game's clock.**
   - The phases are anticipation (a readable wind-up that loads the body), the strike or release on the rule's contact frame, and a recovery back to the carried stance or a guard.
   - The strike is the fastest part. **test**: a sword tip peaks within 0.08 s of contact, and a bow's draw hand leaves the string faster than it ever drew.
2. **The body drives the arms.**
   - Hips before shoulders, shoulders before elbow, elbow before wrist, with the pelvis turning at least 15° across a melee strike. **test**.
   - A bow's loose is the exception: the recoil answers the release and never leads it.
3. **Grounded feet.** A step is a lift and a set-down, never a slide; the soles stay on the ground. **test**.
4. **No dead holds over 0.25 s.** A held pose breathes, trembles or settles.
   - The critics always flag frozen post-impact holds, even when the arm is fine.
5. **Anatomy and silhouette.**
   - No joint leaves its range or turns more than 35° in a frame. **test** (`player-arm-anatomy`).
   - The weapon reads against the body from every camera.

## Arms and hands (rules 15–22)

Enforced on every frame of every strike, on both bodies, by `tests/arm-ranges.test.js`, sampled as gameplay samples them (30 Hz, `gamePlayerMotion`).

15. **Elbows bend, never lock or fold shut.**
    - The elbow stays between 10° and 152°.
    - Through the middle 80% of a strike, the sword or drawing arm keeps at least 20°.
    - At contact the sword hand is at least 60% of the arm's length from the shoulder: reach into the blow, but never lock.
16. **Wrists stay in line.**
    - The wrist bends at most 50° (twist removed) and rolls at most 45°.
    - A sword wrist is capped at 40° in the baker (`WRIST_BEND` 0.7 rad), and a drawing hand is held straight.
    - The forearm and shoulder carry the blade's line; the wrist only sets the edge.
17. **No wringing.** Forearm roll and upper-arm roll each stay at or under 52°.
18. **No arm past 105° from hanging.**
    - Measure it against the chest frame.
    - Shoulder skin crushes beyond it, so there are no overhead raises; a power shot sets just above the line.
19. **The skin stays whole.**
    - The worst 1% of each region's skin edges (upper arm, forearm, hand, fingers, each side) stretch at most 2× and crush at most 3× against the bind.
    - It is measured on the real skinned body mesh, every other frame.
    - This is the arbiter when a joint rule and a look disagree.
20. **Hands are always in a pose.**
    - A weapon hand closes on its grip.
    - A drawing hand hooks three fingers round the string with the thumb tucked, from the set to the loose and through the fly-back, relaxing only as it comes down.
    - An empty hand hangs relaxed. Never splayed, never clawed. **test** (hook beyond the relaxed hand).
21. **Hands ride their shoulders.**
    - A key's hand target is authored against the stance and travels with its shoulder as the trunk lunges and turns.
    - Between keys the hand swings in an arc about the shoulder.
22. **Blade keys are reachable.**
    - With a straight wrist a sword leaves the fist about 70° off the forearm, so a key's blade must lie 25–115° off its forearm.
    - Blade keys are world directions.

## Melee (knight, sword and buckler)

6. **The blade never passes through the head, the buckler or the ground.**
   - It stays more than 8 cm clear of the skull.
   - The tip stays more than 18 cm above the ground (`knight-measure.mjs` reports the clearances).
7. **The sword stays in front of the buckler.**
   - The fist is never hidden behind the board and the blade never pierces it.
   - The board faces the foe in the cuts.
8. **Quick strike** (0.3 s to contact, 0.92 s total). In order:
   - a short chamber, laid back over the sword shoulder on a bent, raised elbow, with the hips turned back;
   - a diagonal cut down across the body, led by the hips as the forearm turns over;
   - a follow-through that keeps moving, the hand carried on to the shield-side hip on a bent elbow with the blade still on the line;
   - a return to a middle guard.
9. **Heavy strike** (0.67 s to contact, 1.57 s total). In order:
   - a rise onto the back leg, the blade laid back tip-up behind the sword shoulder on a bent elbow;
   - a step, and the hips dropping into the cut;
   - the blade coming over on the sword side of the head and crashing down on the line;
   - a sink across to the shield side and a rebound that folds the elbow;
   - a slow rise to guard.
- **Hand speed** stays at or under about 18 m/s between samples; anything faster is a pop, not a swing. **test** (continuous hand path). The rig's joints never snap more than 0.55 rad per sample.
- **The blade at contact** points through the target: forward more than 0.55, across more than 0.3, down more than 0.25. **test**.

## Bow (archer)

The archery shot cycle as coached is stance, nock, set, set-up, draw, anchor, aim, release and follow-through.

10. **The draw hand stays on the string.**
    - From the set to the release, the fingers stay within 6 cm of the line from the grip to the anchor.
    - The string is drawn back at least 35 cm.
    - The drawn string follows the fingers on both surfaces, and the bow rolls about its stave so the string faces the anchor.
11. **A nocked arrow is visible from the set to the release,** never at rest and never after the loose.
12. **Anchor under the jaw, beside the chin** (`src/bow-anchor.js`).
    - At full draw the fingers are within 8 cm of the anchor and never behind the head.
    - The draw elbow sits behind the hand, within 8 cm under the arrow. The band was widened from 5 cm because a higher elbow crushes the draw shoulder's skin past rule 19 on this rig.
    - The bow arm stays long (elbow bend under 25°).
    - **test**: the face's forward and down come from the standing body, not the bone's axes, and the fingers stay in front of the head through the draw.
13. **Side-on stance, head on the line.**
    - The hips and chest turn toward side-on during the set (hips about −0.62 rad at full draw).
    - Once the shot is away, the stave passes at least 15 cm to the side of the face.
14. **The release snaps.**
    - The string springs home at once.
    - The draw hand flies back along the jaw and out past the shoulder, elbow bent behind, never up round the back of the head.
    - The bow arm holds on the line for a beat, then lowers.
    - The hand comes down beside the body along a continuous path, never flung or wrapped behind the back.
    - The power shot holds a longer, trembling full draw and recoils harder.
    - **test**: the loose outpaces the draw, and the hand flies at least 5 cm past the jaw.

## Adapting to a new move type

- **A staff, spell or two-handed weapon.** Write its phases and contact on its rule clock. Add its prop clearance (head, ground, off-hand) to a measure probe, and add the move to `MOVES` in `arm-ranges.test.js`. Every arm rule applies unchanged.
- **Monsters.** These have their own rigs. Re-derive the arm lengths, the shoulders, and every bone-local axis from mesh landmarks before reusing any number here.
